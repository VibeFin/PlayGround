import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createRelayServer } from '../server.mjs';
import { createNetwork } from '../src/network.js';

function inbox() {
  const queued = [];
  const waiting = [];
  return {
    push(value) {
      const index = waiting.findIndex(waiter => waiter.predicate(value));
      if (index < 0) queued.push(value);
      else {
        const [waiter] = waiting.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(value);
      }
    },
    next(predicate = () => true) {
      const index = queued.findIndex(predicate);
      if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: setTimeout(() => {
          waiting.splice(waiting.indexOf(waiter), 1);
          reject(new Error('Timed out waiting for network message'));
        }, 2500) };
        waiting.push(waiter);
      });
    },
    queued,
  };
}

async function fixture(t, options = {}) {
  const relay = await createRelayServer({ dev: false, port: 0, ...options });
  t.after(() => relay.close());
  const url = `ws://127.0.0.1:${relay.port}/ws`;
  async function raw() {
    const ws = new WebSocket(url);
    const messages = inbox();
    ws.on('message', data => messages.push(JSON.parse(data.toString())));
    await once(ws, 'open');
    return {
      ws, messages,
      send: message => ws.send(JSON.stringify(message)),
      next: type => messages.next(message => message.type === type),
    };
  }
  function client() {
    const statuses = inbox();
    const peers = inbox();
    const snapshots = inbox();
    const shots = inbox();
    const events = inbox();
    const network = createNetwork({
      url, WebSocketImpl: WebSocket,
      onStatus: value => statuses.push(value),
      onPeers: value => peers.push(value),
      onSnapshot: (data, sender) => snapshots.push({ data, sender }),
      onShot: (data, sender) => shots.push({ data, sender }),
      onEvent: (data, sender) => events.push({ data, sender }),
    });
    t.after(() => network.leave());
    return { network, statuses, peers, snapshots, shots, events };
  }
  return { relay, raw, client };
}

const shot = { origin: [1, 1.7, 2], direction: [0, 0, -1], damage: 25 };
const snapshot = { wave: 2, phase: 'combat', enemies: [{ id: 'enemy-1', position: [3, 0, -4], health: 75 }] };

test('operator defeat bypasses movement throttling so peers never retain a living ghost', async t => {
  const { client } = await fixture(t);
  const host = client(), guest = client();
  await guest.network.join(await host.network.host());
  assert.equal(guest.network.sendState({ position: [1.3, 1.7, 12], health: 100, active: true }), true);
  assert.equal(guest.network.sendState({ position: [1.3, 1.7, 12], health: 0, active: false }, { force: true }), true);
  const down = await host.peers.next(peers => peers[0]?.health === 0);
  assert.equal(down[0].active, false);
  assert.equal(down[0].id, guest.network.getState().id);
});

test('real clients create/join, replicate state, snapshots, shots and events with sender IDs', { timeout: 10000 }, async t => {
  const { client } = await fixture(t);
  const host = client();
  const guest = client();
  const room = await host.network.host();
  assert.match(room, /^[A-Z2-9]{6}$/);
  assert.equal(await guest.network.join(` ${room.toLowerCase()} `), room);
  const hostId = host.network.getState().id;
  const guestId = guest.network.getState().id;
  assert.equal(host.network.getState().isHost, true);
  assert.equal(guest.network.getState().isHost, false);
  assert.equal((await host.peers.next(peers => peers.length === 1))[0].id, guestId);
  assert.equal(guest.network.getState().peers[0].id, hostId);
  assert.equal((await guest.statuses.next(s => s.status === 'connected')).room, room);

  assert.equal(guest.network.sendState({ position: [2, 1.7, -3], yaw: 0.5, health: 80, weapon: 'rifle' }), true);
  assert.equal(guest.network.sendState({ position: [100, 0, 0] }), false, 'state is throttled');
  const moved = await host.peers.next(peers => peers[0]?.position[0] === 2);
  assert.deepEqual(moved[0], { id: guestId, isHost: false, position: [2, 1.7, -3], yaw: 0.5, health: 80, weapon: 'rifle' });
  moved[0].position[0] = 999;
  const exposed = host.network.getState();
  exposed.peers[0].position[0] = 888;
  assert.equal(host.network.getState().peers[0].position[0], 2, 'callback/getState cannot mutate internal state');

  assert.equal(guest.network.sendSnapshot(snapshot), false);
  assert.equal(host.network.sendSnapshot(snapshot), true);
  assert.equal(host.network.sendSnapshot(snapshot), false, 'snapshots are throttled');
  assert.deepEqual(await guest.snapshots.next(), { data: snapshot, sender: { id: hostId } });
  assert.equal(guest.network.sendShot(shot), true);
  assert.deepEqual(await host.shots.next(), { data: shot, sender: { id: guestId } });
  assert.equal(host.network.sendShot(shot), true);
  assert.deepEqual(await guest.shots.next(), { data: shot, sender: { id: hostId } });
  assert.equal(host.network.sendEvent({ type: 'wave', wave: 2 }), true);
  assert.deepEqual(await guest.events.next(), { data: { type: 'wave', wave: 2 }, sender: { id: hostId } });
  assert.equal(guest.network.sendEvent({ type: 'ready' }), true);
  assert.deepEqual(await host.events.next(), { data: { type: 'ready' }, sender: { id: guestId } });
});

test('four-player limit, late snapshot replay and room isolation', { timeout: 10000 }, async t => {
  const { raw, relay } = await fixture(t);
  const host = await raw();
  host.send({ type: 'host' });
  const joined = await host.next('joined');
  host.send({ type: 'snapshot', data: snapshot });
  // A same-socket event barrier ensures the snapshot has been processed before joining.
  host.send({ type: 'host' });
  assert.equal((await host.next('error')).code, 'ALREADY_JOINED');
  const guests = [];
  for (let i = 0; i < 3; i++) {
    const guest = await raw();
    guest.send({ type: 'join', code: joined.room });
    assert.equal((await guest.next('joined')).peers.length, i + 1);
    assert.deepEqual((await guest.next('snapshot')).data, snapshot);
    guests.push(guest);
  }
  assert.equal(relay.rooms.get(joined.room).members.size, 4);
  const extra = await raw();
  extra.send({ type: 'join', code: joined.room });
  assert.equal((await extra.next('error')).code, 'ROOM_FULL');
  extra.send({ type: 'host' });
  const secondRoom = await extra.next('joined');
  assert.notEqual(secondRoom.room, joined.room);
  extra.send({ type: 'event', data: { type: 'private' } });
  extra.send({ type: 'join', code: joined.room });
  await extra.next('error');
  host.send({ type: 'event', data: { type: 'first-room' } });
  for (const guest of guests) assert.equal((await guest.next('event')).data.type, 'first-room');
  assert.equal(host.messages.queued.some(m => m.type === 'event'), false, 'other room event is not relayed');
  assert.equal(extra.messages.queued.some(m => m.type === 'event'), false, 'sender does not receive its own event');
});

test('server enforces authority and validates malformed payloads without losing the room', { timeout: 10000 }, async t => {
  const { raw } = await fixture(t);
  const host = await raw();
  host.send({ type: 'host' });
  const { room } = await host.next('joined');
  const guest = await raw();
  guest.send({ type: 'join', code: room });
  const { id } = await guest.next('joined');
  guest.send({ type: 'snapshot', data: snapshot });
  assert.equal((await guest.next('error')).code, 'HOST_ONLY');
  guest.ws.send('{');
  assert.equal((await guest.next('error')).code, 'INVALID_MESSAGE');
  guest.ws.send(Buffer.from('{}'));
  assert.equal((await guest.next('error')).code, 'INVALID_MESSAGE');
  for (const message of [
    { type: 'state', data: { position: [1, 2] } },
    { type: 'state', data: { position: [1, 2, null] } },
    { type: 'shot', data: { ...shot, damage: -10 } },
    { type: 'shot', data: { ...shot, direction: [0, 0, 0] } },
    { type: 'event', data: 'not an object' },
    { type: 'event', data: { text: 'x'.repeat(5000) } },
    { type: 'event', data: JSON.parse('{"__proto__":{"admin":true}}') },
  ]) {
    guest.send(message);
    assert.equal((await guest.next('error')).code, 'INVALID_PAYLOAD');
  }
  guest.send({ type: 'state', id: 'forged', data: { id: 'forged', isHost: true, position: [4, 1.7, 6] } });
  const update = await host.next('state');
  assert.equal(update.id, id);
  assert.equal(update.data.id, id);
  assert.equal(update.data.isHost, false);
  guest.send({ type: 'shot', data: shot });
  assert.deepEqual((await host.next('shot')).data, shot);
  assert.equal(host.messages.queued.some(m => m.type === 'snapshot'), false);
});

test('guest disconnect removes its peer; host disconnect ends session and deletes room', { timeout: 10000 }, async t => {
  const { raw, relay } = await fixture(t);
  const host = await raw();
  host.send({ type: 'host' });
  const { room } = await host.next('joined');
  const guest = await raw();
  guest.send({ type: 'join', code: room });
  const { id } = await guest.next('joined');
  await host.messages.next(m => m.type === 'peers' && m.peers.some(p => p.id === id));
  // Discard the initial empty peer list, then require a fresh removal notification.
  host.messages.queued.length = 0;
  guest.ws.terminate();
  assert.deepEqual((await host.next('peers')).peers, []);
  assert.equal(relay.rooms.get(room).members.size, 1);
  const remaining = await raw();
  remaining.send({ type: 'join', code: room });
  await remaining.next('joined');
  host.ws.terminate();
  assert.deepEqual(await remaining.next('session-ended'), {
    type: 'session-ended', reason: 'host-left', message: 'Host disconnected. Session ended.',
  });
  assert.equal(relay.rooms.has(room), false);
  remaining.send({ type: 'shot', data: shot });
  assert.equal((await remaining.next('error')).code, 'NOT_IN_ROOM');
  remaining.send({ type: 'join', code: room });
  assert.equal((await remaining.next('error')).code, 'ROOM_NOT_FOUND');
  remaining.send({ type: 'host' });
  assert.equal((await remaining.next('joined')).isHost, true, 'socket can start a new session');
});

test('network leave clears state and host-ended guests can reconnect', { timeout: 10000 }, async t => {
  const { client, relay } = await fixture(t);
  const host = client();
  const guest = client();
  const room = await host.network.host();
  await guest.network.join(room);
  host.network.leave();
  const ended = await guest.statuses.next(s => s.status === 'disconnected');
  assert.equal(ended.reason, 'host-left');
  assert.match(ended.message, /Host disconnected/);
  const empty = { connected: false, room: null, id: null, isHost: false, peers: [] };
  assert.deepEqual(host.network.getState(), empty);
  assert.deepEqual(guest.network.getState(), empty);
  assert.equal(guest.network.sendShot(shot), false);
  assert.equal(relay.rooms.has(room), false);
  const nextRoom = await guest.network.host();
  assert.equal(guest.network.getState().room, nextRoom);
  assert.equal(guest.network.getState().isHost, true);
});

test('failed joins reject with actionable status; immediate cancellation rejects and can retry', { timeout: 10000 }, async t => {
  const { client } = await fixture(t);
  const guest = client();
  await assert.rejects(guest.network.join('bad'), { code: 'INVALID_CODE' });
  assert.equal((await guest.statuses.next(s => s.status === 'error')).code, 'INVALID_CODE');
  await assert.rejects(guest.network.join('AAAAAA'), { code: 'ROOM_NOT_FOUND' });
  assert.equal(guest.network.getState().connected, false);
  const cancelled = guest.network.host();
  const rejected = assert.rejects(cancelled, { code: 'CANCELLED' });
  guest.network.leave();
  await rejected;
  const room = await guest.network.host();
  assert.equal(guest.network.getState().room, room);
});

test('WebSocket byte limit and flood protection close abusive connections', { timeout: 10000 }, async t => {
  const { raw } = await fixture(t);
  const oversized = await raw();
  const closed = once(oversized.ws, 'close');
  oversized.ws.send('x'.repeat(64 * 1024 + 1));
  assert.equal((await closed)[0], 1009);
  const flood = await raw();
  const floodClosed = once(flood.ws, 'close');
  for (let i = 0; i < 300; i++) flood.send({ type: 'unknown' });
  assert.equal((await floodClosed)[0], 1008);
  assert.ok(flood.messages.queued.some(m => m.code === 'RATE_LIMIT'));
});

test('production HTTP serves built assets and rejects traversal and escaping symlinks', { timeout: 10000 }, async t => {
  const temp = await mkdtemp(path.join(tmpdir(), 'dead-frequency-network-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const distDir = path.join(temp, 'dist');
  await mkdir(distDir);
  await writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>DEAD FREQUENCY</title>');
  await writeFile(path.join(distDir, 'game.js'), 'export const ready = true;');
  await writeFile(path.join(temp, 'secret.txt'), 'outside dist');
  await symlink(path.join(temp, 'secret.txt'), path.join(distDir, 'leak.txt'));
  const { relay } = await fixture(t, { distDir });
  const get = (url, method = 'GET') => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: relay.port, path: url, method }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
  const index = await get('/');
  assert.equal(index.status, 200);
  assert.match(index.body, /DEAD FREQUENCY/);
  const asset = await get('/game.js?v=1');
  assert.equal(asset.status, 200);
  assert.match(asset.headers['content-type'], /javascript/);
  assert.equal((await get('/briefing')).body, index.body);
  assert.equal((await get('/game.js', 'HEAD')).body, '');
  assert.equal((await get('/missing.js')).status, 404);
  assert.equal((await get('/%2e%2e/secret.txt')).status, 403);
  assert.equal((await get('/../secret.txt')).status, 403);
  assert.equal((await get('/%5c..%5csecret.txt')).status, 403);
  assert.equal((await get('/leak.txt')).status, 403);
  assert.equal((await get('/%00')).status, 403);
  assert.equal((await get('/%zz')).status, 400);
  assert.equal((await get('/', 'POST')).status, 405);
  const wrongPath = new WebSocket(`ws://127.0.0.1:${relay.port}/not-ws`);
  const [failure] = await once(wrongPath, 'error');
  assert.match(failure.message, /404/);
});
