import { Game, DEFS } from './game.js';
import { WorldView } from './world.js';
import { createUI } from './ui.js';
import { createSound } from './sound.js';

const game = new Game();
const view = new WorldView(document.querySelector('#battlefield'), game);
view.canvas.tabIndex = 0;
view.canvas.setAttribute('aria-label', '3D battlefield. Click or drag to select; right-click to command.');
const selected = new Set();
const groups = new Map();
const sound = createSound();
const keys = new Set();
let mode = 'select';
let pointer = null;
let mouse = { x: -1, y: -1, over: false };
let last = performance.now();
let lastUi = 0;
let previousStatus = 'playing';

const selectionBox = document.createElement('div');
selectionBox.id = 'selection-box';
Object.assign(selectionBox.style, { position: 'fixed', display: 'none', pointerEvents: 'none', zIndex: 12, border: '1px solid #d3e899', background: 'rgba(153,202,107,.12)', boxShadow: '0 0 12px #c4db7b22' });
document.body.append(selectionBox);

const playerSelection = () => game.state.entities.filter(e => selected.has(e.id) && e.team === 'player');
const hero = () => game.state.entities.find(e => e.team === 'player' && e.kind === 'hero');
const announce = text => { game.state.message = text; };
const setMode = next => {
  mode = next;
  view.canvas.dataset.mode = mode;
  view.canvas.style.cursor = mode === 'select' ? 'default' : 'crosshair';
  if (!mode.startsWith('build:')) view.setBuildPreview(null, null, false);
  ui?.update(selected, mode);
};
const selectOnly = entity => {
  selected.clear();
  if (entity) selected.add(entity.id);
};

let ui;
const actions = {
  train(kind) {
    const building = playerSelection().find(e => kind === 'worker' ? e.kind === 'hall' : e.kind === 'barracks');
    if (building) { if (game.train(building.id, kind)) { sound.play('order'); ui?.dismissOnboarding?.(); } }
    else announce(`Select ${kind === 'worker' ? 'your Town Hall' : 'a Barracks'} to train ${DEFS[kind]?.name || kind}.`);
  },
  build(kind) {
    if (!playerSelection().some(e => e.kind === 'worker')) {
      announce('Select a Peasant to construct a building.');
      return;
    }
    if (!game.canAfford(kind)) {
      announce(`Not enough resources for ${DEFS[kind]?.name || kind}.`);
      return;
    }
    setMode(`build:${kind}`);
    announce(`Place ${DEFS[kind]?.name || kind} on clear ground. Esc cancels.`);
  },
  command(type) {
    if (type === 'stop') {
      game.command([...selected], { type: 'stop' });
      setMode('select');
    } else if (!playerSelection().some(e => DEFS[e.kind]?.speed > 0)) {
      announce('Select a unit to give orders.');
    } else {
      setMode(type);
      announce(type === 'attackMove' ? 'Click an enemy to attack, or the ground to attack-move.' : type === 'gather' ? 'Click a Gold Mine or a tree to gather resources.' : 'Click the battlefield to move.');
    }
  },
  restart() {
    game.reset();
    groups.clear();
    keys.clear();
    selectOnly(hero());
    setMode('select');
    view.focus(-23, 22);
    game.state.paused = false;
    previousStatus = 'playing';
    ui.update(selected, mode);
  },
  focusHome() { view.focus(-28, 26); },
  selectArmy() {
    selected.clear();
    game.state.entities.filter(e => e.team === 'player' && ['hero', 'footman', 'archer'].includes(e.kind)).forEach(e => selected.add(e.id));
    setMode('select');
    announce(`${selected.size} combat units selected. Right-click to move or press A to attack-move.`);
  },
  togglePause() {
    if (game.state.status !== 'playing') return;
    game.state.paused = !game.state.paused;
    keys.clear();
    ui.update(selected, mode);
  },
  cast() {
    const caster = playerSelection().find(e => e.kind === 'hero');
    if (!caster) { announce('Select your Dawnwarden to cast Sunburst.'); return; }
    if (typeof game.cast === 'function') {
      if (game.cast(caster.id, caster.x, caster.z)) {
        sound.play('spell');
        view.ping?.(caster.x, caster.z, 'spell');
      }
    }
  },
  focus(x, z) { view.focus(x, z); },
  select(id) {
    selectOnly(game.state.entities.find(e => e.id === id));
    setMode('select');
  },
  toggleSound() { announce(sound.toggle() ? 'Sound muted. Press N to enable.' : 'Sound enabled. Press N to mute.'); },
};
ui = createUI(game, actions);
selectOnly(hero());

function canPlace(kind, p) {
  if (!p) return false;
  const radius = DEFS[kind]?.radius || 3;
  return Math.abs(p.x) <= 54 - radius && Math.abs(p.z) <= 54 - radius && game.state.entities.every(e =>
    DEFS[e.kind]?.speed > 0 || Math.hypot(e.x - p.x, e.z - p.z) >= e.radius + radius + 1);
}

const isUnit = e => DEFS[e.kind]?.speed > 0;
// Forgiving click targeting: bodies render above their ground projection, so a
// near-miss within a tall screen-space capsule still resolves to the entity.
function pickNear(x, y, predicate, maxPx = 30) {
  let best = null, bestScore = Infinity;
  for (const entity of game.state.entities) {
    if (!predicate(entity)) continue;
    const p = view.project(entity.x, entity.z);
    const dx = p.x - x, dy = p.y - y;
    if (dy > 14 || dy < -95) continue;
    const score = Math.hypot(dx, dy * 0.55);
    if (score < Math.min(maxPx, bestScore)) { best = entity; bestScore = score; }
  }
  return best;
}

function issueAt(x, y, contextual = false) {
  if (game.state.paused || game.state.status !== 'playing') return;
  const p = view.screenToGround(x, y);
  if (!p) return;
  let picked = game.state.entities.find(e => e.id === view.pick(x, y));
  if (!picked) {
    if (contextual) picked = pickNear(x, y, e => (e.team === 'enemy' && isUnit(e)) || (e.team === 'neutral' && ['tree', 'goldmine'].includes(e.kind)) || (e.team === 'player' && e.buildProgress != null && e.buildProgress < 1));
    else if (mode === 'attackMove') picked = pickNear(x, y, e => e.team === 'enemy');
    else if (mode === 'gather') picked = pickNear(x, y, e => e.team === 'neutral' && ['tree', 'goldmine'].includes(e.kind));
  }
  if (contextual && picked?.team === 'player' && picked.buildProgress < 1 && playerSelection().some(e => e.kind === 'worker')) {
    if (game.assistBuild?.(picked.id, [...selected])) {
      view.ping?.(picked.x, picked.z, 'build');
      sound.play('build');
    }
    return;
  }
  if (mode.startsWith('build:') && !contextual) {
    const kind = mode.split(':')[1];
    if (game.build(kind, p.x, p.z, [...selected])) {
      sound.play('build');
      view.ping?.(p.x, p.z, 'build');
      ui?.dismissOnboarding?.();
      setMode('select');
    }
    return;
  }
  let type = contextual ? 'move' : mode;
  if (picked?.team === 'enemy' && (contextual || type === 'attackMove')) type = 'attack';
  if (picked?.team === 'neutral' && ['tree', 'goldmine'].includes(picked.kind) && (contextual || type === 'gather') && playerSelection().some(e => e.kind === 'worker')) type = 'gather';
  if (type === 'gather' && (!picked || !['tree', 'goldmine'].includes(picked.kind))) {
    announce('Choose a Gold Mine or a forest tree.');
    return;
  }
  if (!['move', 'attack', 'attackMove', 'gather'].includes(type)) type = 'move';
  if (game.command([...selected], { type, x: p.x, z: p.z, targetId: picked?.id })) {
    sound.play('order');
    ui?.dismissOnboarding?.();
  }
  view.ping?.(p.x, p.z, type.includes('attack') ? 'attack' : type);
  setMode('select');
}

view.canvas.addEventListener('contextmenu', e => e.preventDefault());
view.canvas.addEventListener('pointerdown', e => {
  view.canvas.focus({ preventScroll: true });
  sound.unlock();
  if (e.button === 2) {
    e.preventDefault();
    if (mode !== 'select') { setMode('select'); return; }
    issueAt(e.clientX, e.clientY, true);
    return;
  }
  if (e.button !== 0 && e.button !== 1) return;
  pointer = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, button: e.button, shift: e.shiftKey, dragging: false };
  view.canvas.setPointerCapture(e.pointerId);
});
view.canvas.addEventListener('pointermove', e => {
  mouse = { x: e.clientX, y: e.clientY, over: true };
  if (mode.startsWith('build:')) {
    const p = view.screenToGround(e.clientX, e.clientY);
    view.setBuildPreview(mode.split(':')[1], p, canPlace(mode.split(':')[1], p));
  }
  if (!pointer) return;
  if (pointer.button === 1) {
    const dx = e.clientX - pointer.lastX;
    const dy = e.clientY - pointer.lastY;
    const scale = (view.camera?.isOrthographicCamera ? (view.camera.right - view.camera.left) : 80) / window.innerWidth;
    view.pan((-dx - dy) * scale * .75, (dx - dy) * scale * .75);
    pointer.lastX = e.clientX;
    pointer.lastY = e.clientY;
    return;
  }
  if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 7 && mode === 'select') pointer.dragging = true;
  if (pointer.dragging) {
    Object.assign(selectionBox.style, { display: 'block', left: `${Math.min(pointer.x, e.clientX)}px`, top: `${Math.min(pointer.y, e.clientY)}px`, width: `${Math.abs(e.clientX - pointer.x)}px`, height: `${Math.abs(e.clientY - pointer.y)}px` });
  }
});
view.canvas.addEventListener('pointerup', e => {
  if (!pointer) return;
  const start = pointer;
  pointer = null;
  selectionBox.style.display = 'none';
  if (start.button === 1) return;
  if (start.dragging) {
    if (!start.shift) selected.clear();
    for (const entity of game.state.entities) {
      if (entity.team !== 'player' || !(DEFS[entity.kind]?.speed > 0)) continue;
      const p = view.project(entity.x, entity.z);
      if (p.x >= Math.min(start.x, e.clientX) && p.x <= Math.max(start.x, e.clientX) && p.y >= Math.min(start.y, e.clientY) && p.y <= Math.max(start.y, e.clientY)) selected.add(entity.id);
    }
    ui.update(selected, mode);
    return;
  }
  if (mode !== 'select') { issueAt(e.clientX, e.clientY); return; }
  const id = view.pick(e.clientX, e.clientY) ?? pickNear(e.clientX, e.clientY, e => e.team === 'player')?.id;
  if (!start.shift) selected.clear();
  if (id != null) {
    if (start.shift && selected.has(id)) selected.delete(id);
    else selected.add(id);
    sound.play('select');
  }
  ui.update(selected, mode);
});
view.canvas.addEventListener('pointerleave', () => { mouse.over = false; });
view.canvas.addEventListener('pointercancel', () => { pointer = null; selectionBox.style.display = 'none'; });
view.canvas.addEventListener('dblclick', e => {
  const target = game.state.entities.find(entity => entity.id === view.pick(e.clientX, e.clientY))
    ?? pickNear(e.clientX, e.clientY, e => e.team === 'player' && isUnit(e));
  if (!target || target.team !== 'player' || !(DEFS[target.kind]?.speed > 0)) return;
  selected.clear();
  game.state.entities.filter(entity => entity.kind === target.kind && entity.team === 'player').forEach(entity => selected.add(entity.id));
  ui.update(selected, mode);
});
view.canvas.addEventListener('wheel', e => { e.preventDefault(); view.zoom(e.deltaY); }, { passive: false });

window.addEventListener('keydown', e => {
  sound.unlock();
  const target = e.target instanceof Element ? e.target : null;
  if (target?.matches('input, textarea, select') || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  keys.add(k);
  if (e.repeat) return;
  if (k === 'escape') { setMode('select'); ui.hideHelp?.(); }
  else if (k === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); actions.selectArmy(); }
  else if (k === 'a') actions.command('attackMove');
  else if (k === 'm') actions.command('move');
  else if (k === 's') actions.command('stop');
  else if (k === 'g') actions.command('gather');
  else if (k === 'b') actions.build('barracks');
  else if (k === 'f') {
    if (playerSelection().some(e => e.kind === 'barracks')) actions.train('footman');
    else actions.build('farm');
  }
  else if (k === 't') {
    if (playerSelection().some(e => e.kind === 'worker')) actions.build('tower');
    else actions.train('footman');
  }
  else if (k === 'r') actions.train('archer');
  else if (k === 'p') {
    if (playerSelection().some(e => e.kind === 'hall')) actions.train('worker');
    else actions.togglePause();
  }
  else if (k === 'q') actions.cast();
  else if (k === 'n') actions.toggleSound();
  else if (k === 'h') actions.focusHome();
  else if (k === ' ') { const h = hero(); if (h) { selectOnly(h); view.focus(h.x, h.z); } }
  else if (k === 'f1' || k === '?') { e.preventDefault(); ui.showHelp(); }
  else if (/^[1-3]$/.test(k)) {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); groups.set(k, [...selected]); announce(`Control group ${k} saved.`); }
    else if (groups.has(k)) { selected.clear(); groups.get(k).forEach(id => selected.add(id)); setMode('select'); }
  }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); mouse.over = false; });
document.addEventListener('pointerdown', () => sound.unlock(), { once: true });
window.addEventListener('resize', () => view.resize());

function frame(now) {
  const dt = Math.min((now - last) / 1000, .25);
  last = now;
  // Keep movement/combat stable while preserving real elapsed time on software rendering.
  if (!game.state.paused) {
    for (let remaining = dt; remaining > .00001; remaining -= .05) game.update(Math.min(remaining, .05));
  }
  if (game.state.status !== previousStatus) {
    if (game.state.status === 'victory' || game.state.status === 'defeat') sound.play(game.state.status);
    previousStatus = game.state.status;
  }
  if (!game.state.paused && game.state.status === 'playing' && game.state.entities.some(e => e.attackFlash > .15)) sound.play('combat');
  for (const id of selected) if (!game.state.entities.some(e => e.id === id)) selected.delete(id);
  let horizontal = Number(keys.has('arrowright') || keys.has('d')) - Number(keys.has('arrowleft'));
  let vertical = Number(keys.has('arrowdown')) - Number(keys.has('arrowup') || keys.has('w'));
  if (mouse.over && !pointer && mode === 'select') {
    if (mouse.x < 12) horizontal -= 1;
    if (mouse.x > window.innerWidth - 12) horizontal += 1;
    if (mouse.y < 75) vertical -= 1;
  }
  if (horizontal || vertical) view.pan((horizontal + vertical) * dt * 22, (vertical - horizontal) * dt * 22);
  view.update(dt, selected);
  if (now - lastUi > 100) { ui.update(selected, mode); lastUi = now; }
  requestAnimationFrame(frame);
}
window.__game = game;
window.__view = view;
window.__app = { selected, actions, get mode() { return mode; }, setMode };
ui.update(selected, mode);
requestAnimationFrame(frame);
