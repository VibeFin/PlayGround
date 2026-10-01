/**
 * Same-origin WebSocket co-op relay. All callbacks are optional.
 * onStatus({status,message,code?,reason?,room?,id?,isHost?})
 * onPeers([{id,isHost,position:[x,y,z],yaw,health,...}]) -- excludes self.
 * onSnapshot(data,{id}), onShot(data,{id}), onEvent(data,{id}) -- remote only.
 * host()/join(code) resolve the room code or reject an Error with .code.
 * sendState needs {position:[x,y,z],yaw?,health?,...}; capped at 20 Hz.
 * sendSnapshot accepts a JSON object (host only); capped at 10 Hz.
 * sendShot needs {origin:[x,y,z],direction:[x,y,z],damage,...}.
 * sendEvent accepts a JSON object, conventionally {type,...}.
 * Sends return true if queued, false if disconnected/throttled/invalid.
 * Optional url/WebSocketImpl/timeoutMs allow real-socket tests or embedding.
 */
export function createNetwork({
  onStatus = () => {}, onPeers = () => {}, onSnapshot = () => {},
  onShot = () => {}, onEvent = () => {},
  url, WebSocketImpl = globalThis.WebSocket, timeoutMs = 10000,
} = {}) {
  let socket = null;
  let pending = null;
  let state = emptyState();
  let lastState = -Infinity;
  let lastSnapshot = -Infinity;
  const copy = data => JSON.parse(JSON.stringify(data));
  function emptyState() { return { connected: false, room: null, id: null, isHost: false, peers: [] }; }
  function error(message, code) { return Object.assign(new Error(message), { code }); }
  function status(value, message, extra = {}) { onStatus({ status: value, message, ...extra }); }
  function clearState() {
    state = emptyState();
    lastState = lastSnapshot = -Infinity;
    onPeers([]);
  }
  function rejectPending(reason) {
    if (!pending) return;
    clearTimeout(pending.timer);
    const request = pending;
    pending = null;
    request.reject(reason);
  }
  function disconnect(reason, value = 'disconnected', extra = {}) {
    const previous = socket;
    socket = null; // Ignore all late events from an old connection.
    rejectPending(error(reason, extra.code || 'DISCONNECTED'));
    clearState();
    if (previous && previous.readyState < 2) previous.close();
    status(value, reason, extra);
  }
  function receive(message) {
    if (message.type === 'joined' && pending) {
      state = {
        connected: true, room: message.room, id: message.id,
        isHost: message.isHost, peers: message.peers || [],
      };
      const request = pending;
      pending = null;
      clearTimeout(request.timer);
      request.resolve(state.room);
      onPeers(copy(state.peers));
      status('connected', state.isHost ? `Hosting room ${state.room}.` : `Joined room ${state.room}.`, {
        room: state.room, id: state.id, isHost: state.isHost,
      });
    } else if (message.type === 'error') {
      if (pending) disconnect(message.message, 'error', { code: message.code });
      else status('error', message.message, { code: message.code });
    } else if (message.type === 'session-ended') {
      disconnect(message.message || 'Host disconnected. Session ended.', 'disconnected', { reason: message.reason });
    } else if (state.connected && message.type === 'peers') {
      state.peers = message.peers.filter(peer => peer.id !== state.id);
      onPeers(copy(state.peers));
    } else if (state.connected && message.type === 'state') {
      const index = state.peers.findIndex(peer => peer.id === message.id);
      const peer = { ...message.data, id: message.id };
      if (index < 0) state.peers.push(peer);
      else state.peers[index] = peer;
      onPeers(copy(state.peers));
    } else if (state.connected && ['snapshot', 'shot', 'event'].includes(message.type)) {
      ({ snapshot: onSnapshot, shot: onShot, event: onEvent })[message.type](message.data, { id: message.id });
    }
  }
  function connect(type, code) {
    if (socket || pending || state.connected) leave();
    return new Promise((resolve, reject) => {
      if (!WebSocketImpl) {
        const failure = error('WebSocket is unavailable in this browser.', 'UNSUPPORTED');
        status('error', failure.message, { code: failure.code });
        reject(failure);
        return;
      }
      try {
        const address = url || `${globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${globalThis.location.host}/ws`;
        const ws = new WebSocketImpl(address);
        socket = ws;
        pending = { resolve, reject, timer: setTimeout(() => {
          if (socket === ws) disconnect('Connection timed out. Please try again.', 'error', { code: 'TIMEOUT' });
        }, timeoutMs) };
        ws.onopen = () => {
          if (socket === ws) ws.send(JSON.stringify({ type, ...(type === 'join' ? { code } : {}) }));
        };
        ws.onmessage = event => {
          if (socket !== ws) return;
          let message;
          try { message = JSON.parse(event.data); } catch { return; }
          if (message && typeof message.type === 'string') receive(message);
        };
        ws.onerror = () => {
          if (socket === ws) disconnect('Connection failed. Check your connection and try again.', 'error', { code: 'CONNECTION_FAILED' });
        };
        ws.onclose = () => {
          if (socket === ws) disconnect('Disconnected from the relay. Join or host a room to reconnect.');
        };
        status('connecting', type === 'host' ? 'Creating room…' : `Joining room ${code}…`);
      } catch (cause) {
        if (pending) disconnect(cause.message, 'error', { code: 'CONNECTION_FAILED' });
        else {
          status('error', cause.message, { code: 'CONNECTION_FAILED' });
          reject(error(cause.message, 'CONNECTION_FAILED'));
        }
      }
    });
  }
  function send(type, data) {
    if (!state.connected || socket?.readyState !== 1 || socket.bufferedAmount > 256 * 1024 ||
        !data || typeof data !== 'object' || Array.isArray(data)) return false;
    try {
      const message = JSON.stringify({ type, data });
      const bytes = new TextEncoder().encode(message).length;
      if (bytes > (type === 'snapshot' ? 64 * 1024 : 8192)) return false;
      socket.send(message);
      return true;
    } catch { return false; }
  }
  function leave() {
    if (socket?.readyState === 1) socket.send(JSON.stringify({ type: 'leave' }));
    disconnect('Left the session.', 'idle', { code: 'CANCELLED' });
  }
  return {
    host: () => connect('host'),
    join: code => connect('join', String(code ?? '').trim().toUpperCase()),
    leave,
    sendState(data, { force = false } = {}) {
      const now = Date.now();
      if (!force && now - lastState < 50) return false;
      if (!send('state', data)) return false;
      lastState = now;
      return true;
    },
    sendSnapshot(data) {
      const now = Date.now();
      if (!state.isHost || now - lastSnapshot < 100) return false;
      if (!send('snapshot', data)) return false;
      lastSnapshot = now;
      return true;
    },
    sendShot: data => send('shot', data),
    sendEvent: data => send('event', data),
    getState: () => copy(state),
  };
}
