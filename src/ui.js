import { DEFS, MAP_SIZE } from './game.js';

// All battlefield interaction stays with the renderer. Only HUD controls call actions.
const paths = {
  crest: '<path d="M12 2 20 5v7c0 5-8 9-8 9s-8-4-8-9V5z"/><path d="m8 15 4-9 4 9M9.5 12h5"/>',
  gold: '<path d="m4 8 5-4h8l3 4-3 10H7zM4 8h16M9 4l-2 14M17 4l-2 14"/>',
  lumber: '<path d="m12 2-6 8h3l-5 6h6v5h4v-5h6l-5-6h3z"/>',
  supply: '<path d="M5 21V9l7-6 7 6v12M3 21h18M9 21v-7h6v7M9 9h6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-.7 1-.7 2.1M12 17h.01"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  restart: '<path d="M4 9a8.3 8.3 0 1 1 1 8M4 3v6h6"/>',
  progress: '<path d="M4 19h16M6 15v-4M12 15V5M18 15V8"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  move: '<path d="M12 21V3m-5 5 5-5 5 5M5 18l7-4 7 4"/>',
  attackMove: '<path d="m5 3 13 13 3 1-4 4-1-3L3 5zM14 4l5-1-1 5M15 7l-3 3M9 15l-6 6M3 17l4 4"/>',
  stop: '<path d="m8 3-5 5v8l5 5h8l5-5V8l-5-5z"/><path d="M8 12h8"/>',
  gather: '<path d="M5 20 17 7M11 4c5-1 8 2 10 6M6 9l3 3M3 19l2 2M16 4l-2 4"/>',
  worker: '<path d="M7 9a5 5 0 0 1 10 0M5 9h14M8 10v3a4 4 0 0 0 8 0v-3M4 21v-2c0-3 4-4 8-4s8 1 8 4v2M8 18l4 3 4-3"/>',
  footman: '<path d="M5 8 12 4l7 4v6c0 4-7 7-7 7s-7-3-7-7zM12 5v15M5 10h14M17 3l3-2"/>',
  archer: '<path d="M6 3c12 1 12 17 0 18L6 3ZM6 12h15M17 8l4 4-4 4"/>',
  hero: '<path d="m4 7 4 3 4-7 4 7 4-3-2 11H6zM7 21h10M9 14h6"/>',
  hall: '<path d="M3 21h18M5 21V10l7-6 7 6v11M9 21v-6h6v6M8 4V2M16 4V2M3 10h18"/>',
  barracks: '<path d="M3 21h18M4 21V9h16v12M4 9V4h4v5m8 0V4h4v5M10 21v-7h4v7M12 2v7"/>',
  farm: '<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7M4 21h16M3 5v3M21 5v3"/>',
  tower: '<path d="M7 21 8 9h8l1 12M6 9V3h3v3h6V3h3v6zM10 21v-5h4v5"/>',
  cast: '<path d="m13 2-8 12h6l-1 8 9-13h-7zM4 4l1 2M20 18l1 2"/>',
  home: '<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/>',
  army: '<path d="m8 8 4-3 4 3v6l-4 4-4-4zM3 10v7l4 4M21 10v7l-4 4M12 9v5"/>',
  objective: '<path d="M5 21V3m0 1h13l-3 4 3 4H5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  health: '<path d="M12 21S2 15 2 8a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 7-10 13-10 13Z"/>',
};

function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.crest}</svg>`;
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function portrait(kind) {
  const colors = { hero: '#c3ab70', worker: '#a79070', footman: '#9fb6c5', archer: '#8aab9e' };
  const color = colors[kind] || '#adb6b9';
  if (!['hero', 'worker', 'footman', 'archer'].includes(kind)) {
    return `<div class="structure-portrait">${icon(kind)}<span>THE ALLIANCE</span></div>`;
  }
  const head = kind === 'worker'
    ? '<path d="M29 39Q29 20 50 20T71 39Z" fill="#af9868"/><path d="M23 39h54v6H23Z" fill="#d0b781"/><path d="M34 44h32v24L50 80 34 68Z" fill="#b3997e"/><path d="m36 65 14 7 14-7-4 18H40Z" fill="#51433d"/>'
    : kind === 'archer'
      ? '<path d="M20 72 26 35 50 15 74 35 80 72 62 84H38Z" fill="#3d5d56"/><path d="m34 40 16-11 16 11-4 27-12 10-12-10Z" fill="#ad9781"/><path d="m23 73 12-20 3 23 12 9 12-9 3-23 12 20-27 18Z" fill="#658378"/>'
      : '<path d="m26 64 3-31 21-15 21 15 3 31-14 18H40Z" fill="#7893a2"/><path d="m33 39 17-10 17 10-3 31-14 10-14-10Z" fill="#bac6c7"/><path d="M34 47h32v11H34Z" fill="#172730"/><path d="M49 32h3v43h-3Z" fill="#e2d7b3"/><path d="m30 32 20-20 20 20-6-2-14-8-14 8Z" fill="#c7b17a"/>';
  const crown = kind === 'hero' ? '<path d="m32 23 1-12 10 7L50 6l7 12 10-7 1 12-18 7Z" fill="#d6ba72"/>' : '';
  return `<svg class="portrait-art" viewBox="0 0 100 120" aria-hidden="true"><defs><radialGradient id="ashen-portrait-${kind}"><stop stop-color="#3b5663"/><stop offset="1" stop-color="#111c24"/></radialGradient></defs><rect width="100" height="120" fill="url(#ashen-portrait-${kind})"/><circle cx="50" cy="46" r="36" fill="none" stroke="${color}" opacity=".2"/><path d="m10 120 4-24 22-19h28l22 19 4 24Z" fill="#284a61"/><path d="m14 97 22-20 14 15 14-15 22 20-17 7-19-10-19 10Z" fill="${color}"/>${head}${crown}<path d="m45 108 5-6 5 6-5 7Z" fill="#d2b573"/></svg>`;
}

const unitKinds = new Set(['worker', 'footman', 'archer', 'hero']);
const number = (value) => Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-US');
const metric = (value) => Math.max(0, Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
const completed = (entity) => entity.buildProgress == null || entity.buildProgress >= 1;

export function createUI(game, actions) {
  const root = document.getElementById('app');
  if (!root) throw new Error('Ashenfront UI requires #app');
  const controller = new AbortController();
  const { signal } = controller;
  let selected = [];
  let currentMode = 'select';
  let paused = false;
  let showHints = true;
  let helpOpen = false;
  let previousFocus = null;
  let selectionSignature = null;
  let commandsSignature = '';
  let lastMessage = '';
  let lastEvent = '';
  let toastUntil = 0;
  let lastMapPaint = -Infinity;
  let lastStatus = 'playing';
  let mapKeyboardPoint = { x: -28, z: 26 };

  root.innerHTML = `
    <header class="topbar hud-surface">
      <a class="brand" href="/" aria-label="Ashenfront home">${icon('crest', 'brand-crest')}<span class="brand-type">ASHENFRONT<span>REAL-TIME STRATEGY</span></span></a>
      <div class="map-heading"><span class="eyebrow">THE ASHEN VALE</span><span class="map-subtitle"><i class="live-dot"></i>Skirmish <span class="map-divider">/</span> Human alliance</span></div>
      <div class="resources" aria-label="Army resources">
        <div class="resource resource-gold" title="Gold — mined by workers">${icon('gold')}<span><span class="resource-label">Gold</span><strong data-resource="gold">0</strong></span></div>
        <div class="resource resource-lumber" title="Lumber — harvested from trees">${icon('lumber')}<span><span class="resource-label">Lumber</span><strong data-resource="lumber">0</strong></span></div>
        <div class="resource resource-supply" title="Supply — build farms to increase capacity">${icon('supply')}<span><span class="resource-label">Supply</span><strong data-resource="supply">0 / 0</strong></span></div>
      </div>
      <div class="match-clock" aria-label="Elapsed match time">${icon('clock')}<time id="match-time">00:00</time></div>
      <nav class="header-tools" aria-label="Game controls">
        <button class="tool-button" data-ui="pause" title="Pause & options" aria-label="Pause & options">${icon('pause')}</button>
        <button class="tool-button" data-ui="help" title="Field guide" aria-label="Open field guide">${icon('help')}</button>
        <button class="tool-button restart-tool" data-ui="restart" title="Restart skirmish" aria-label="Restart skirmish">${icon('restart')}</button>
        <a class="tool-button progress-link" href="/progress.html" title="Live build progress" aria-label="View live build progress">${icon('progress')}</a>
      </nav>
    </header>

    <section class="objective-chip hud-surface" aria-label="Mission objective">
      <div class="objective-icon">${icon('objective')}</div><div><span class="eyebrow">YOUR OBJECTIVE</span><h1>Break the enemy stronghold</h1><p>Raise an army. Defend your foothold.</p></div>
      <span class="objective-counter" title="Enemy units defeated"><strong id="kill-count">0</strong><span>DEFEATED</span></span>
    </section>

    <aside class="field-hints" aria-label="Quick controls"><span><kbd>↑ ↓ ← →</kbd> Pan the field</span><span><kbd>RMB</kbd> Give an order</span><span><kbd>SCROLL</kbd> Zoom</span></aside>
    <div class="notification-region" aria-live="polite" aria-atomic="true"><div class="event-toast" id="event-toast" hidden>${icon('objective')}<span id="toast-text"></span></div></div>
    <div class="mode-chip hud-surface" id="mode-chip" hidden><span class="mode-dot"></span><span id="mode-text"></span><kbd>ESC</kbd><span class="mode-cancel">Cancel</span></div>

    <section class="onboarding hud-surface" id="onboarding" aria-label="Getting started">
      <span class="onboarding-mark">${icon('crest')}</span><div><strong>Your command begins here.</strong><p>Drag to select. Right-click to move, attack, or gather. Select your hall to train workers.</p></div>
      <button class="text-button" data-ui="help">Field guide ${icon('chevron')}</button><button class="tool-button dismiss-hint" data-ui="dismiss-onboarding" aria-label="Dismiss getting started">${icon('close')}</button>
    </section>

    <footer class="command-deck hud-surface" aria-label="Army command deck">
      <section class="minimap-panel" aria-labelledby="minimap-heading"><div class="panel-heading"><h2 id="minimap-heading">THE ASHEN VALE</h2><span class="map-north">N ↑</span></div>
        <div class="minimap-frame"><canvas id="minimap" width="320" height="240" tabindex="0" role="button" aria-label="Tactical minimap. Click to focus the battlefield, or use arrow keys to move the camera." aria-describedby="minimap-legend"></canvas><div class="map-corner top-left"></div><div class="map-corner bottom-right"></div></div>
        <div class="minimap-tools"><button data-ui="home" title="Focus home [H]">${icon('home')}<span>Home</span><kbd>H</kbd></button><button data-ui="army" title="Select your army [Ctrl+A]">${icon('army')}<span>Army</span></button></div>
        <span class="sr-only" id="minimap-legend">Blue: allies. Red: enemies. Gold: mines. Green: forest. White rings: selected units.</span>
      </section>
      <section class="selection-panel" aria-label="Current selection"><div class="panel-heading"><h2 id="selection-heading">YOUR VANGUARD</h2><span id="selection-count" class="panel-count"></span></div>
        <div id="selection-content" class="selection-content"></div>
        <div class="selection-footer"><span class="allegiance"><i class="live-dot"></i>HUMAN ALLIANCE</span><span id="selection-order">Awaiting orders</span></div>
      </section>
      <section class="actions-panel" aria-labelledby="actions-heading"><div class="panel-heading"><h2 id="actions-heading">COMMANDS</h2><span id="command-context">Choose your next move</span></div><div id="action-grid" class="action-grid"></div></section>
    </footer>

    <div class="state-overlay" id="state-overlay" hidden><section class="state-card hud-surface" role="dialog" aria-modal="true" aria-labelledby="state-title" aria-describedby="state-description"><div class="state-emblem" id="state-emblem">${icon('crest')}</div><span class="eyebrow" id="state-eyebrow">THE ASHEN VALE</span><h2 id="state-title">Battle paused</h2><p id="state-description">Take a breath. Your army awaits your command.</p><div class="state-summary" id="state-summary" hidden></div><label class="option-toggle" id="hint-option"><input type="checkbox" id="show-hints" checked /><span>Show battlefield control hints</span></label><div class="state-buttons"><button class="primary-button" data-ui="resume" id="resume-button">${icon('play')}Resume battle</button><button class="secondary-button" data-ui="restart">${icon('restart')}New skirmish</button></div><button class="text-button" data-ui="help">Read the field guide ${icon('chevron')}</button></section></div>

    <dialog id="help-dialog" class="help-dialog" aria-labelledby="help-title"><div class="help-titlebar"><div>${icon('crest')}<span class="eyebrow">THE COMMANDER’S HANDBOOK</span></div><button class="tool-button" data-ui="close-help" aria-label="Close field guide">${icon('close')}</button></div><h2 id="help-title">Win the Ashen Vale.</h2><p class="help-intro">Protect your hall and destroy the red stronghold to the northeast. Every worker, every order, every moment counts.</p><div class="help-columns"><section><h3><span>01</span> Establish your foothold</h3><p>Select the town hall to train workers. Right-click a gold mine or a tree with workers selected to gather resources. Build farms for supply, a barracks for soldiers, and towers to defend.</p><h3><span>02</span> Lead your army</h3><p>Drag across the battlefield to select units; hold <kbd>SHIFT</kbd> to add to your selection. Right-click the ground to move, or an enemy to attack. Attack-move fights enemies along the route.</p><h3><span>03</span> Break their lines</h3><p>Train footmen and archers at your barracks. Keep your hero with the army and use the hero power when enemies gather. Guard your workers when raids arrive.</p></section><section class="help-controls"><h3>At your command</h3><dl><div><dt>Pan / zoom</dt><dd><kbd>↑↓←→</kbd> / scroll</dd></div><div><dt>Move</dt><dd><kbd>M</kbd> then click</dd></div><div><dt>Attack-move</dt><dd><kbd>A</kbd> then click</dd></div><div><dt>Build barracks / farm</dt><dd><kbd>B</kbd> / <kbd>F</kbd> then click</dd></div><div><dt>Focus home / hero</dt><dd><kbd>H</kbd> / <kbd>SPACE</kbd></dd></div><div><dt>Select army</dt><dd><kbd>CTRL</kbd> + <kbd>A</kbd></dd></div><div><dt>Cancel order / close guide</dt><dd><kbd>ESC</kbd></dd></div></dl><div class="help-tip">Use the minimap to jump across the battlefield. Commands and construction costs appear in the bottom-right deck.</div></section></div><div class="help-bottom"><span>Build. Gather. Command. Conquer.</span><button class="primary-button" data-ui="close-help">Return to the field ${icon('chevron')}</button></div></dialog>
  `;

  const $ = (selector) => root.querySelector(selector);
  const nodes = {
    gold: $('[data-resource="gold"]'), lumber: $('[data-resource="lumber"]'), supply: $('[data-resource="supply"]'),
    clock: $('#match-time'), kills: $('#kill-count'), selection: $('#selection-content'),
    selectionHeading: $('#selection-heading'), selectionCount: $('#selection-count'), order: $('#selection-order'),
    grid: $('#action-grid'), context: $('#command-context'), map: $('#minimap'),
    toast: $('#event-toast'), toastText: $('#toast-text'), mode: $('#mode-chip'), modeText: $('#mode-text'),
    overlay: $('#state-overlay'), help: $('#help-dialog'), onboarding: $('#onboarding'), hints: $('.field-hints'),
  };
  const mapContext = nodes.map.getContext('2d');

  function invoke(name, ...args) {
    if (typeof actions[name] === 'function') return actions[name](...args);
  }

  function notify(message) {
    if (!message) return;
    nodes.toastText.textContent = message;
    nodes.toast.hidden = false;
    toastUntil = performance.now() + 5500;
  }

  function showHelp() {
    if (helpOpen) return;
    helpOpen = true;
    previousFocus = document.activeElement;
    nodes.help.showModal();
    $('[data-ui="close-help"]').focus();
  }

  function hideHelp() {
    if (!helpOpen) return;
    helpOpen = false;
    nodes.help.close();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }

  function setPaused(value) {
    if (game.state.status !== 'playing' || paused === value) return;
    const result = invoke('togglePause');
    paused = typeof result === 'boolean' ? result : value;
    updateStateOverlay();
  }

  function restart() {
    hideHelp();
    // The main loop owns pausing; explicitly resume before resetting if needed.
    if (paused && game.state.status === 'playing') setPaused(false);
    paused = false;
    lastMessage = '';
    lastEvent = '';
    nodes.toast.hidden = true;
    invoke('restart');
    selectionSignature = null;
    commandsSignature = '';
    updateStateOverlay();
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ui], [data-action]');
    if (!button || !root.contains(button) || button.disabled) return;
    if (button.dataset.action) {
      if (paused || game.state.status !== 'playing') return;
      const [action, argument] = button.dataset.action.split(':');
      if (action === 'command') invoke('command', argument);
      else if (action === 'train' || action === 'build') invoke(action, argument);
      else if (action === 'cast') invoke('cast');
      // The main loop calls update with the canonical mode after a callback.
      return;
    }
    switch (button.dataset.ui) {
      case 'help': showHelp(); break;
      case 'close-help': hideHelp(); break;
      case 'pause': setPaused(!paused); break;
      case 'resume': setPaused(false); break;
      case 'restart': restart(); break;
      case 'home': invoke('focusHome'); break;
      case 'army': invoke('selectArmy'); break;
      case 'dismiss-onboarding': nodes.onboarding.hidden = true; break;
    }
  }, { signal });

  $('#show-hints').addEventListener('change', (event) => {
    showHints = event.target.checked;
    nodes.hints.hidden = !showHints;
    if (!showHints) nodes.onboarding.hidden = true;
  }, { signal });

  nodes.help.addEventListener('cancel', (event) => { event.preventDefault(); hideHelp(); }, { signal });
  nodes.help.addEventListener('click', (event) => {
    if (event.target !== nodes.help) return;
    const rect = nodes.help.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) hideHelp();
  }, { signal });

  // Isolate HUD keystrokes from the game's document-level hotkeys without
  // trapping game keys: the minimap owns only its navigation keys, and focused
  // buttons own only activation keys, so arrows and letter hotkeys still pan
  // the battlefield and command the army.
  root.addEventListener('keydown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const minimapKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key);
    const activationKey = ['Enter', ' ', 'Tab'].includes(event.key);
    if (helpOpen || paused || !nodes.overlay.hidden || target?.closest('input')
      || (target === nodes.map && minimapKey)
      || (activationKey && target?.closest('button, a'))) event.stopPropagation();
    if (event.key === 'Escape' && helpOpen) { event.preventDefault(); hideHelp(); }
    else if (event.key === 'Escape' && paused) { event.preventDefault(); setPaused(false); }
    if (event.key === 'Tab' && !helpOpen && !nodes.overlay.hidden) {
      const focusable = Array.from(nodes.overlay.querySelectorAll('button:not(:disabled), input')).filter((element) => element.getClientRects().length);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }, { signal });
  // The renderer may use Tab as a gameplay shortcut. Preserve native HUD navigation.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') event.stopPropagation();
  }, { signal });

  nodes.map.addEventListener('click', (event) => {
    const bounds = nodes.map.getBoundingClientRect();
    const x = (Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) - 0.5) * MAP_SIZE;
    const z = (Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) - 0.5) * MAP_SIZE;
    mapKeyboardPoint = { x, z };
    invoke('focus', x, z);
  }, { signal });
  nodes.map.addEventListener('keydown', (event) => {
    const directions = { ArrowUp: [0, -6], ArrowDown: [0, 6], ArrowLeft: [-6, 0], ArrowRight: [6, 0] };
    if (directions[event.key]) {
      event.preventDefault();
      const [dx, dz] = directions[event.key];
      mapKeyboardPoint.x = Math.max(-MAP_SIZE / 2, Math.min(MAP_SIZE / 2, mapKeyboardPoint.x + dx));
      mapKeyboardPoint.z = Math.max(-MAP_SIZE / 2, Math.min(MAP_SIZE / 2, mapKeyboardPoint.z + dz));
      invoke('focus', mapKeyboardPoint.x, mapKeyboardPoint.z);
    } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); invoke('focusHome'); }
  }, { signal });

  function costs(kind) {
    const def = DEFS[kind] || {};
    return [['gold', def.gold], ['lumber', def.lumber], ['supply', def.food]].filter(([, amount]) => amount > 0)
      .map(([resource, amount]) => `<span class="cost cost-${resource}">${icon(resource)}${number(amount)}</span>`).join('');
  }

  function affordable(kind, requiresSupply = false) {
    const def = DEFS[kind] || {};
    const resources = typeof game.canAfford === 'function' ? game.canAfford(kind) : game.state.gold >= (def.gold || 0) && game.state.lumber >= (def.lumber || 0);
    return resources && (!requiresSupply || game.state.food + (def.food || 0) <= game.state.foodCap);
  }

  function commandList(entities) {
    const friendly = entities.filter((entity) => entity.team === 'player');
    const units = friendly.filter((entity) => unitKinds.has(entity.kind));
    const workers = units.some((entity) => entity.kind === 'worker');
    const list = [];
    const add = (id, name, description, hotkey = '', kind = '', enabled = true, detail = '') => {
      const action = id.split(':')[0];
      const active = action === 'build' ? currentMode === `build:${kind}` : currentMode === id.split(':')[1];
      const locked = paused || game.state.status !== 'playing' || !enabled;
      let reason = description;
      if (!enabled && kind) {
        const def = DEFS[kind] || {};
        reason = action === 'train' && game.state.food + (def.food || 0) > game.state.foodCap
          ? 'Not enough supply. Build a farm.' : 'More resources or a completed building required.';
      }
      list.push({ id, name, description: reason, hotkey, kind, active, locked, detail, symbol: kind || id.split(':')[1] || action });
    };
    if (units.length) {
      add('command:move', 'Move', 'Choose a destination on the battlefield.', 'M');
      add('command:attackMove', 'Attack-move', 'Advance, engaging enemies along the way.', 'A');
      add('command:stop', 'Stop', 'Cancel the current order and hold position.', 'S');
      if (workers) {
        add('command:gather', 'Gather', 'Choose a gold mine or tree to harvest.', 'G');
        add('build:barracks', 'Barracks', 'Place a barracks to train footmen and archers.', 'B', 'barracks', affordable('barracks'));
        add('build:farm', 'Farm', 'Place a farm to increase army supply.', 'F', 'farm', affordable('farm'));
        add('build:tower', 'Guard tower', 'Place a tower to defend your foothold.', 'T', 'tower', affordable('tower'));
      }
      if (units.some((entity) => entity.kind === 'hero')) {
        const hero = units.find((entity) => entity.kind === 'hero');
        const cooldown = Math.ceil(hero.spellCooldown || 0);
        add('cast', 'Hero power', cooldown ? `Hero power ready in ${cooldown} seconds.` : 'Unleash your hero’s power at their current position.', 'Q', '', typeof actions.cast === 'function' && typeof game.cast === 'function' && !cooldown, cooldown ? `${cooldown}s COOLDOWN` : 'HERO ABILITY');
      }
    } else if (friendly.length) {
      const hall = friendly.find((entity) => entity.kind === 'hall');
      const barracks = friendly.find((entity) => entity.kind === 'barracks');
      if (hall) add('train:worker', 'Train worker', 'Add a worker to the town hall’s training queue.', 'P', 'worker', completed(hall) && affordable('worker', true));
      if (barracks) {
        add('train:footman', 'Train footman', 'Add a frontline soldier to the barracks queue.', 'T', 'footman', completed(barracks) && affordable('footman', true));
        add('train:archer', 'Train archer', 'Add a ranged soldier to the barracks queue.', 'R', 'archer', completed(barracks) && affordable('archer', true));
      }
    }
    return list;
  }

  function renderCommands(entities) {
    const list = commandList(entities);
    const signature = JSON.stringify(list);
    if (signature === commandsSignature) return;
    commandsSignature = signature;
    const focusedAction = nodes.grid.contains(document.activeElement) ? document.activeElement.dataset.action : null;
    nodes.grid.classList.toggle('dense-actions', list.length > 6);
    nodes.grid.innerHTML = list.length ? list.map((action) => `<button class="action-button ${action.active ? 'is-active' : ''}" data-action="${action.id}" ${action.locked ? 'disabled' : ''} ${action.active ? 'aria-pressed="true"' : 'aria-pressed="false"'} title="${escapeHTML(action.description)}" aria-label="${escapeHTML(`${action.name}. ${action.description}`)}"><span class="action-icon">${icon(action.symbol)}</span><span class="action-label">${escapeHTML(action.name)}<span class="action-costs">${action.kind ? costs(action.kind) : `<span class="action-type">${escapeHTML(action.detail || 'UNIT ORDER')}</span>`}</span></span>${action.hotkey ? `<kbd>${action.hotkey}</kbd>` : ''}</button>`).join('')
      : `<div class="empty-commands">${icon('crest')}<span>${entities.length ? 'No commands available' : 'Your orders shape the battle'}<small>${entities.length ? 'Select a worker, unit, hall, or barracks.' : 'Select an allied unit or building to begin.'}</small></span></div>`;
    if (focusedAction) {
      const replacement = nodes.grid.querySelector(`[data-action="${focusedAction}"]:not(:disabled)`) || nodes.grid.querySelector('button:not(:disabled)');
      replacement?.focus({ preventScroll: true });
    }
    nodes.context.textContent = entities.some((entity) => entity.team === 'player' && entity.kind === 'worker') ? 'BUILD & GATHER' : entities.some((entity) => entity.kind === 'hall' || entity.kind === 'barracks') ? 'RECRUITMENT' : 'TACTICAL ORDERS';
  }

  function renderSelection(entities) {
    const signature = entities.map((entity) => `${entity.id}:${entity.kind}:${entity.team}`).join('|');
    if (signature !== selectionSignature) {
      selectionSignature = signature;
      nodes.selection.classList.toggle('multiple-selection', entities.length > 1);
      if (!entities.length) {
        nodes.selection.innerHTML = `<div class="empty-selection">${icon('army')}<div><h3>The field is yours.</h3><p>Select a unit or drag to command an army.</p></div></div>`;
      } else if (entities.length === 1) {
        const entity = entities[0];
        const def = DEFS[entity.kind] || {};
        nodes.selection.innerHTML = `<div class="portrait-frame ${entity.team === 'enemy' ? 'enemy-portrait' : ''}">${portrait(entity.kind)}<span class="portrait-rank">${entity.kind === 'hero' ? 'HERO' : unitKinds.has(entity.kind) ? 'UNIT' : 'HOLDFAST'}</span></div><div class="unit-details"><span class="unit-class">${entity.team === 'enemy' ? 'ENEMY FORCES' : entity.team === 'neutral' ? 'WORLD RESOURCE' : entity.kind === 'hero' ? 'CHAMPION OF THE ALLIANCE' : 'THE HUMAN ALLIANCE'}</span><h3>${escapeHTML(def.name || entity.kind)}</h3><p class="unit-description">${escapeHTML(def.description || 'Ready to serve your command.')}</p><div class="health-line">${icon('health')}<span class="health-track" role="progressbar" aria-label="Health" aria-valuemin="0" aria-valuemax="${entity.maxHp || 1}"><span class="health-fill"></span></span><span class="health-value"></span></div><div class="unit-stats">${def.damage ? `<span>${icon('attackMove')}<b>${metric(def.damage)}</b> Attack</span>` : ''}${def.range ? `<span>${icon('archer')}<b>${metric(def.range)}</b> Range</span>` : ''}<span id="unit-extra"></span></div><div class="queue-line" id="queue-line" hidden></div></div>`;
      } else {
        const groups = {};
        for (const entity of entities) groups[entity.kind] = (groups[entity.kind] || 0) + 1;
        nodes.selection.innerHTML = `<div class="army-summary"><h3>${entities.length} selected</h3><p>${Object.entries(groups).map(([kind, count]) => { const name = DEFS[kind]?.name || kind; return `${count} ${escapeHTML(count > 1 ? /man$/i.test(name) ? name.replace(/man$/i, 'men') : `${name}s` : name)}`; }).join(' · ')}</p></div><div class="unit-cards" aria-label="Selected unit health">${entities.map((entity) => `<div class="unit-card ${entity.team === 'enemy' ? 'enemy-portrait' : ''}" data-unit-id="${escapeHTML(entity.id)}" title="${escapeHTML(DEFS[entity.kind]?.name || entity.kind)}"><span class="unit-card-art">${icon(entity.kind)}</span><span class="card-health"><span></span></span><span class="sr-only card-health-label"></span></div>`).join('')}</div>`;
      }
    }
    const first = entities[0];
    nodes.selectionHeading.textContent = entities.length > 1 ? 'SELECTED FORCES' : first?.team === 'enemy' ? 'ENEMY FORCES' : first?.team === 'neutral' ? 'WORLD RESOURCE' : first ? (unitKinds.has(first.kind) ? 'YOUR VANGUARD' : 'YOUR HOLDFAST') : 'YOUR VANGUARD';
    nodes.selectionCount.textContent = first ? `${entities.length} SELECTED` : 'NO SELECTION';
    if (entities.length === 1) {
      const fraction = Math.max(0, Math.min(1, first.hp / (first.maxHp || 1)));
      const track = $('.health-track');
      track.setAttribute('aria-valuenow', Math.max(0, Math.round(first.hp)));
      $('.health-fill').style.width = `${fraction * 100}%`;
      $('.health-fill').classList.toggle('low-health', fraction < 0.3);
      $('.health-value').textContent = `${number(first.hp)} / ${number(first.maxHp)}`;
      const extra = $('#unit-extra');
      extra.textContent = first.resource != null ? `${number(first.resource)} remaining` : first.carrying ? `${number(first.carrying)} carried` : !completed(first) ? `Building ${Math.floor(first.buildProgress * 100)}%` : '';
      const queue = $('#queue-line');
      queue.hidden = !first.queue?.length;
      queue.textContent = first.queue?.length ? `Training queue · ${first.queue.length} ${first.queue.length === 1 ? 'unit' : 'units'}` : '';
    } else if (entities.length > 1) {
      const byId = new Map(entities.map((entity) => [String(entity.id), entity]));
      for (const card of root.querySelectorAll('.unit-card')) {
        const entity = byId.get(card.dataset.unitId);
        const fraction = Math.max(0, Math.min(1, entity.hp / (entity.maxHp || 1)));
        card.querySelector('.card-health span').style.width = `${fraction * 100}%`;
        card.querySelector('.card-health span').classList.toggle('low-health', fraction < 0.3);
        card.querySelector('.card-health-label').textContent = `${DEFS[entity.kind]?.name || entity.kind}: ${number(entity.hp)} of ${number(entity.maxHp)} health`;
      }
    }
    const orders = new Set(entities.map((entity) => !completed(entity) ? 'constructing' : entity.order?.type || 'idle'));
    const labels = { move: 'Moving to position', attack: 'Engaging the enemy', attackMove: 'Advancing · attack-move', gather: 'Gathering resources', stop: 'Holding position', idle: 'Awaiting orders', constructing: 'Under construction', build: 'Constructing a building' };
    nodes.order.textContent = entities.length ? orders.size > 1 ? 'Following individual orders' : labels[[...orders][0]] || 'Following orders' : 'Drag to select';
    $('.allegiance').hidden = Boolean(first && first.team !== 'player');
  }

  function drawMinimap(entities) {
    if (!mapContext) return;
    const ctx = mapContext;
    const width = nodes.map.width;
    const height = nodes.map.height;
    const project = (x, z) => [(x / MAP_SIZE + 0.5) * width, (z / MAP_SIZE + 0.5) * height];
    ctx.fillStyle = '#142821';
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * 0.4, height * 0.6, 8, width / 2, height / 2, width * 0.75);
    glow.addColorStop(0, 'rgba(92,112,66,.24)');
    glow.addColorStop(1, 'rgba(8,15,17,.65)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(157,173,135,.07)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath(); ctx.moveTo(width * i / 6, 0); ctx.lineTo(width * i / 6, height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, height * i / 6); ctx.lineTo(width, height * i / 6); ctx.stroke();
    }
    const selectedIds = new Set(selected);
    // Resources render first so dense forests never obscure units or buildings.
    const layers = [entities.filter((entity) => entity.team === 'neutral'), entities.filter((entity) => entity.team !== 'neutral')];
    for (const layer of layers) for (const entity of layer) {
      if (!Number.isFinite(entity.x) || !Number.isFinite(entity.z)) continue;
      const [x, y] = project(entity.x, entity.z);
      const isBuilding = !unitKinds.has(entity.kind) && entity.kind !== 'tree' && entity.kind !== 'goldmine';
      const size = entity.kind === 'tree' ? 2.4 : entity.kind === 'goldmine' ? 4 : isBuilding ? Math.max(4, Math.min(8, (entity.radius || 2) * 1.3)) : entity.kind === 'hero' ? 4 : 2.8;
      ctx.fillStyle = entity.kind === 'tree' ? '#48734b' : entity.kind === 'goldmine' ? '#d8b661' : entity.team === 'enemy' ? '#e07b70' : '#86bfdc';
      ctx.beginPath();
      if (isBuilding) ctx.rect(x - size, y - size, size * 2, size * 2);
      else if (entity.kind === 'goldmine' || entity.kind === 'hero') { ctx.moveTo(x, y - size - 1); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size + 1); ctx.lineTo(x - size, y); ctx.closePath(); }
      else ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      if (isBuilding) { ctx.strokeStyle = entity.team === 'enemy' ? '#743f3c' : '#3f728c'; ctx.lineWidth = 1; ctx.stroke(); }
      if (selectedIds.has(entity.id)) { ctx.beginPath(); ctx.arc(x, y, size + 3, 0, Math.PI * 2); ctx.strokeStyle = '#e9dfb8'; ctx.lineWidth = 1.4; ctx.stroke(); }
    }
    if (document.activeElement === nodes.map) {
      const [x, y] = project(mapKeyboardPoint.x, mapKeyboardPoint.z);
      ctx.strokeStyle = '#f1d899'; ctx.lineWidth = 1;
      ctx.strokeRect(x - 8, y - 6, 16, 12);
    }
  }

  function updateStateOverlay() {
    const status = game.state.status;
    const ended = status === 'victory' || status === 'defeat';
    const visible = paused || ended;
    const wasVisible = !nodes.overlay.hidden;
    nodes.overlay.hidden = !visible;
    $('#resume-button').hidden = ended;
    $('#hint-option').hidden = ended;
    $('#state-summary').hidden = !ended;
    root.classList.toggle('battle-ended', ended);
    const pauseButton = $('[data-ui="pause"]');
    pauseButton.disabled = ended;
    pauseButton.setAttribute('aria-label', paused ? 'Resume battle' : 'Pause & options');
    pauseButton.title = paused ? 'Resume battle' : 'Pause & options';
    if (visible) {
      $('#state-title').textContent = ended ? status === 'victory' ? 'The vale is yours.' : 'A foothold lost.' : 'Battle paused';
      $('#state-eyebrow').textContent = ended ? status === 'victory' ? 'VICTORY' : 'DEFEAT' : 'A MOMENT OF RESPITE';
      $('#state-description').textContent = ended ? status === 'victory' ? 'The enemy stronghold has fallen. Your banner flies over the Ashen Vale.' : 'Your town hall has fallen. Regroup, rebuild, and return stronger.' : 'Take a breath. Your army awaits your command.';
      $('#state-summary').textContent = `${nodes.clock.textContent} on the field · ${number(game.state.kills)} enemies defeated`;
      nodes.overlay.dataset.status = ended ? status : 'paused';
      if (!wasVisible && !helpOpen) (ended ? nodes.overlay.querySelector('[data-ui="restart"]') : $('#resume-button')).focus({ preventScroll: true });
    }
    // Pause/end panels block the field and make the HUD unavailable to keyboard focus.
    for (const selector of ['.topbar', '.command-deck', '.onboarding']) $(selector).inert = visible;
    if (wasVisible && !visible && nodes.overlay.contains(document.activeElement)) $('[data-ui="pause"]').focus({ preventScroll: true });
  }

  function update(selectedIds = [], mode = 'select') {
    selected = Array.from(selectedIds || []);
    currentMode = mode || 'select';
    if (currentMode !== 'select') nodes.onboarding.hidden = true;
    const state = game.state;
    // Optional pause state supports main loops which expose their pause flag.
    if (typeof state.paused === 'boolean') paused = state.paused;
    nodes.gold.textContent = number(state.gold);
    nodes.lumber.textContent = number(state.lumber);
    nodes.supply.textContent = `${number(state.food)} / ${number(state.foodCap)}`;
    $('.resource-supply').classList.toggle('supply-full', state.food >= state.foodCap);
    const seconds = Math.max(0, Math.floor(state.time || 0));
    nodes.clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    nodes.kills.textContent = number(state.kills);
    const idSet = new Set(selected);
    const entities = state.entities.filter((entity) => idSet.has(entity.id));
    renderSelection(entities);
    renderCommands(entities);
    const modeNames = { move: 'Move · choose a destination', attackMove: 'Attack-move · choose a destination', gather: 'Gather · choose a mine or tree' };
    nodes.mode.hidden = currentMode === 'select' || paused || state.status !== 'playing';
    nodes.modeText.textContent = currentMode.startsWith('build:') ? `Place ${DEFS[currentMode.slice(6)]?.name || currentMode.slice(6)} · click the ground` : modeNames[currentMode] || 'Choose a target';
    if (state.message && state.message !== lastMessage) { lastMessage = state.message; notify(state.message); }
    const latestEvent = state.events?.[state.events.length - 1];
    if (latestEvent && latestEvent !== lastEvent) { lastEvent = latestEvent; if (!state.message || performance.now() > toastUntil) notify(latestEvent); }
    const now = performance.now();
    if (now >= toastUntil) nodes.toast.hidden = true;
    if (now - lastMapPaint >= 90) { drawMinimap(state.entities); lastMapPaint = now; }
    if (state.status !== lastStatus || paused || !nodes.overlay.hidden) { updateStateOverlay(); lastStatus = state.status; }
  }

  update(game.state.entities.filter((entity) => entity.team === 'player' && entity.kind === 'hero').slice(0, 1).map((entity) => entity.id), 'select');

  function dismissOnboarding() { nodes.onboarding.hidden = true; }

  return {
    update, showHelp, hideHelp, dismissOnboarding,
    destroy() { hideHelp(); controller.abort(); root.replaceChildren(); },
  };
}
