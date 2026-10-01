import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { WebSocket, WebSocketServer } from 'ws';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_PAYLOAD = 64 * 1024;
const MAX_BUFFER = 512 * 1024;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.wasm': 'application/wasm',
};

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value, max = 100000) => Number.isFinite(value) && Math.abs(value) <= max;
const vector = value => Array.isArray(value) && value.length === 3 && value.every(n => finite(n));

// Bound recursive work as well as bytes, and reject prototype-shaped keys.
function validData(value, depth = 0, budget = { remaining: 8000 }) {
  if (--budget.remaining < 0 || depth > 12) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return finite(value, 1e12);
  if (typeof value === 'string') return value.length <= 4096;
  if (typeof value !== 'object') return false;
  return Object.entries(value).every(([key, child]) =>
    key.length <= 80 && !['__proto__', 'constructor', 'prototype'].includes(key) &&
    validData(child, depth + 1, budget));
}

function validPayload(type, data) {
  if (!isObject(data) || !validData(data)) return false;
  if (type === 'state') {
    return vector(data.position) && (data.yaw === undefined || finite(data.yaw)) &&
      (data.health === undefined || (finite(data.health, 10000) && data.health >= 0));
  }
  if (type === 'shot') {
    return vector(data.origin) && vector(data.direction) &&
      Math.hypot(...data.direction) > 0.001 && Math.hypot(...data.direction) <= 2 &&
      finite(data.damage, 1000) && data.damage > 0;
  }
  if (type === 'snapshot' && Array.isArray(data.enemies) && data.enemies.length > 256) return false;
  return true;
}

function takeToken(client, key, rate, burst = rate * 2) {
  const now = Date.now();
  const bucket = client.buckets.get(key) || { tokens: burst, time: now };
  bucket.tokens = Math.min(burst, bucket.tokens + (now - bucket.time) * rate / 1000);
  bucket.time = now;
  client.buckets.set(key, bucket);
  if (bucket.tokens < 1) return false;
  bucket.tokens--;
  return true;
}

function staticHandler(distDir) {
  const root = path.resolve(distDir);
  const inside = (base, file) => file === base || file.startsWith(base + path.sep);
  return async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
      return;
    }
    try {
      const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
      if (!pathname.startsWith('/') || pathname.includes('\0') || pathname.includes('\\') ||
          pathname.split('/').includes('..')) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      let file = path.resolve(root, '.' + pathname);
      if (!inside(root, file)) { res.writeHead(403).end('Forbidden'); return; }
      let info = await stat(file).catch(() => null);
      if (info?.isDirectory()) {
        file = path.join(file, 'index.html');
        info = await stat(file).catch(() => null);
      }
      // Client-side routes use the app shell; missing assets remain genuine 404s.
      if (!info && !path.extname(pathname)) {
        file = path.join(root, 'index.html');
        info = await stat(file).catch(() => null);
      }
      if (!info?.isFile()) { res.writeHead(404).end('Not found'); return; }
      const [realRoot, realFile] = await Promise.all([realpath(root), realpath(file)]);
      if (!inside(realRoot, realFile)) { res.writeHead(403).end('Forbidden'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': info.size,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': path.basename(file) === 'index.html' ? 'no-cache' : 'public, max-age=3600',
      });
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = createReadStream(realFile);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      res.writeHead(error instanceof URIError ? 400 : 500).end('Unable to serve request');
    }
  };
}

/** Starts listening before resolving. close() shuts down sockets, HTTP, and Vite. */
export async function createRelayServer({
  dev = process.env.NODE_ENV !== 'production',
  port = Number(process.env.PORT || 3000),
  host = '0.0.0.0',
  distDir = path.join(ROOT, 'dist'),
} = {}) {
  const rooms = new Map();
  let vite;
  let handler = staticHandler(distDir);
  const server = http.createServer((req, res) => handler(req, res));
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false });

  function send(client, message) {
    if (client.ws.readyState !== WebSocket.OPEN) return;
    if (client.ws.bufferedAmount > MAX_BUFFER) { client.ws.terminate(); return; }
    client.ws.send(JSON.stringify(message));
  }
  const fail = (client, code, message) => send(client, { type: 'error', code, message });
  const broadcast = (room, message, except) => {
    for (const client of room.members.values()) if (client !== except) send(client, message);
  };
  const peer = client => ({ ...client.state, id: client.id, isHost: client.room?.hostId === client.id });
  function publishPeers(room) {
    for (const client of room.members.values()) {
      send(client, { type: 'peers', peers: [...room.members.values()].filter(p => p !== client).map(peer) });
    }
  }
  function leave(client) {
    const room = client.room;
    if (!room) return;
    client.room = null;
    room.members.delete(client.id);
    if (room.hostId === client.id) {
      rooms.delete(room.code);
      for (const member of room.members.values()) {
        member.room = null;
        send(member, { type: 'session-ended', reason: 'host-left', message: 'Host disconnected. Session ended.' });
      }
      room.members.clear();
      room.snapshot = null;
    } else {
      publishPeers(room);
    }
  }
  function enter(client, room) {
    client.room = room;
    client.state = { position: [0, 1.7, 0], yaw: 0, health: 100 };
    room.members.set(client.id, client);
    send(client, {
      type: 'joined', room: room.code, id: client.id, isHost: room.hostId === client.id,
      peers: [...room.members.values()].filter(p => p !== client).map(peer),
    });
    publishPeers(room);
    if (room.snapshot) send(client, { type: 'snapshot', id: room.hostId, data: room.snapshot });
  }

  wss.on('connection', ws => {
    const client = { ws, id: randomUUID(), room: null, state: {}, buckets: new Map(), alive: true };
    ws.on('pong', () => { client.alive = true; });
    ws.on('error', () => leave(client));
    ws.on('close', () => leave(client));
    ws.on('message', (raw, binary) => {
      if (!takeToken(client, 'all', 150, 240)) {
        fail(client, 'RATE_LIMIT', 'Too many messages. Connection closed.');
        ws.close(1008, 'Rate limit');
        return;
      }
      let message;
      try { if (binary) throw new Error(); message = JSON.parse(raw.toString()); }
      catch { fail(client, 'INVALID_MESSAGE', 'Expected a JSON text message.'); return; }
      if (!isObject(message) || typeof message.type !== 'string') {
        fail(client, 'INVALID_MESSAGE', 'Message requires a type.'); return;
      }
      const { type, data } = message;
      if (type === 'host' || type === 'join') {
        if (!takeToken(client, 'membership', 1, 5)) {
          fail(client, 'RATE_LIMIT', 'Please wait before trying another room.'); return;
        }
        if (client.room) { fail(client, 'ALREADY_JOINED', 'Leave the current room first.'); return; }
        if (type === 'host') {
          let code;
          do { code = [...randomBytes(6)].map(n => CODE_ALPHABET[n % CODE_ALPHABET.length]).join(''); }
          while (rooms.has(code));
          const room = { code, hostId: client.id, members: new Map(), snapshot: null };
          rooms.set(code, room);
          enter(client, room);
        } else {
          const code = typeof message.code === 'string' ? message.code.trim().toUpperCase() : '';
          if (!/^[A-Z2-9]{6}$/.test(code)) { fail(client, 'INVALID_CODE', 'Enter a six-character room code.'); return; }
          const room = rooms.get(code);
          if (!room) { fail(client, 'ROOM_NOT_FOUND', 'Room not found. Check the code or ask the host to create a new room.'); return; }
          if (room.members.size >= 4) { fail(client, 'ROOM_FULL', 'Room is full (four players maximum).'); return; }
          enter(client, room);
        }
        return;
      }
      if (type === 'leave') { leave(client); send(client, { type: 'left' }); return; }
      if (!['state', 'snapshot', 'shot', 'event'].includes(type)) {
        fail(client, 'INVALID_MESSAGE', 'Unknown message type.'); return;
      }
      const room = client.room;
      if (!room) { fail(client, 'NOT_IN_ROOM', 'Join or create a room first.'); return; }
      if (type === 'snapshot' && room.hostId !== client.id) {
        fail(client, 'HOST_ONLY', 'Only the host may send enemy snapshots.'); return;
      }
      const rate = { state: 45, snapshot: 25, shot: 25, event: 20 }[type];
      if (!takeToken(client, type, rate)) { fail(client, 'RATE_LIMIT', `Too many ${type} messages.`); return; }
      if (!validPayload(type, data) || (type !== 'snapshot' && raw.length > 8192)) {
        fail(client, 'INVALID_PAYLOAD', `Invalid ${type} payload.`); return;
      }
      if (type === 'state') {
        client.state = data;
        broadcast(room, { type: 'state', id: client.id, data: peer(client) }, client);
      } else {
        if (type === 'snapshot') room.snapshot = data;
        broadcast(room, { type, id: client.id, data }, client);
      }
    });
    ws.relayClient = client;
  });

  server.on('upgrade', (req, socket, head) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    } else if (!dev || req.headers['sec-websocket-protocol'] !== 'vite-hmr') {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    }
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.relayClient.alive) { ws.terminate(); continue; }
      ws.relayClient.alive = false;
      ws.ping();
    }
  }, 30000);
  heartbeat.unref();

  let closing;
  function close() {
    if (closing) return closing;
    closing = (async () => {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      await new Promise(resolve => wss.close(resolve));
      await vite?.close();
      await new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); });
      rooms.clear();
    })();
    return closing;
  }
  try {
    if (dev) {
      const { createServer } = await import('vite');
      vite = await createServer({
        root: ROOT,
        server: { middlewareMode: true, hmr: { server }, host: '0.0.0.0' },
        appType: 'spa',
      });
      handler = (req, res) => vite.middlewares(req, res, () => res.writeHead(404).end('Not found'));
    }
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); resolve(); });
    });
  } catch (error) {
    await close();
    throw error;
  }
  return { server, wss, rooms, port: server.address().port, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const relay = await createRelayServer(process.argv.includes('--production') ? { dev: false } : {});
  console.log(`DEAD FREQUENCY listening on http://0.0.0.0:${relay.port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    relay.close().then(() => { process.exitCode = 0; });
  });
}
