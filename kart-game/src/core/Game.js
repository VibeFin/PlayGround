import * as THREE from 'three';
import { ChaseCamera } from './Camera.js';
import { formatRaceTime, ordinal } from './Utils.js';
import { buildTrack, getSpawnPoints, getCenterline, checkBounds, LAPS, WALL_OFFSET } from '../world/track.js';
import { buildEnvironment } from '../world/environment.js';
import { createPlayer, syncMeshToPhysics } from '../kart/player.js';
import { createField } from '../kart/ai.js';
import { createKart } from '../kart/KartModel.js';
import { adaptBoundsResult, separateKarts } from '../kart/physics.js';
import { ItemSystem, setThree } from '../items/items.js';
import { HUD, calculatePosition } from '../ui/hud.js';
import { Menus } from '../ui/menus.js';
import { GameAudio } from '../audio/audio.js';
import { ParticleSystem } from '../fx/particles.js';
import { getDriver } from '../fx/characters.js';

const TOTAL_KARTS = 8;
const AI_COUNT = 7;

function makeItemFields(obj, name, isPlayer) {
  obj.item = null;
  obj.roulette = null;
  obj.boostTime = 0;
  obj.boostAmount = 0;
  obj.starTime = 0;
  obj.invincible = false;
  obj.stunTime = 0;
  obj.spinTime = 0;
  obj.lap = 0;
  obj.progress = 0;
  obj.totalProgress = 0;
  obj.name = name;
  obj.isPlayer = isPlayer;
  return obj;
}

export class Game {
  constructor({ renderer, input, camera = null } = {}) {
    if (!renderer) throw new Error('Game requires a THREE.WebGLRenderer');
    this.renderer = renderer;
    this.input = input ?? null;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b5e8);
    this.scene.fog = new THREE.Fog(0x87b5e8, 160, 650);

    this.perspectiveCamera = camera ?? new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 800);
    this.cameraRig = new ChaseCamera(this.perspectiveCamera);

    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3d5a3a, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(60, 90, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
    sun.shadow.camera.far = 300;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);

    this.state = 'menu';
    this._prePauseState = 'racing';
    this.raceTime = 0;
    this.lap = 1;
    this.totalLaps = LAPS || 3;
    this.position = 1;
    this.speedKmh = 0;
    this.message = '';
    this.countdownValue = null;

    this.track = null;
    this.player = null;
    this.playerPhysics = null;
    this.playerMesh = null;
    this.ai = null;
    this.aiMeshes = [];
    this.items = null;
    this.hud = null;
    this.menus = null;
    this.audio = null;
    this.fx = null;
    this.centerline = [];
    this.envApi = null;

    this._listeners = new Set();
    this._countdownTimer = 0;
    this._countdownStep = -1;
    this._playerColor = '#e33e2b';
    this._finished = false;
    this._aiProgress = [];
  }

  onStateChange(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  _setState(next) {
    if (this.state === next) return;
    this.state = next;
    for (const cb of this._listeners) { try { cb(next); } catch { /* ignore */ } }
    try { this.menus?.show?.(next === 'paused' ? 'paused' : next); } catch { /* ignore */ }
  }

  getTrack() { return this.track; }
  getPlayerKart() { return this.player; }
  getAllKarts() {
    const list = [];
    if (this.playerPhysics) list.push(this.playerPhysics);
    if (this.ai?.physics) for (const p of this.ai.physics) list.push(p);
    return list;
  }

  async init() {
    setThree(THREE);
    // Track + environment
    this.track = buildTrack(this.scene);
    this.track.isFallback = false;
    try {
      this.envApi = buildEnvironment(this.scene, {});
    } catch (e) { console.warn('[Game] environment failed', e); }
    try { this.centerline = getCenterline(400).map((v) => ({ x: v.x, z: v.z })); }
    catch { this.centerline = []; }
    try { globalThis.__kartCenterline = this.centerline; } catch { /* ignore */ }

    // Player
    const spawns = getSpawnPoints(TOTAL_KARTS);
    const p0 = spawns[0];
    this.player = createPlayer({ input: this.input, name: 'YOU', color: 0x2b7fff });
    this.playerPhysics = this.player.physics;
    makeItemFields(this.playerPhysics, 'YOU', true);
    this.playerPhysics.color = '#ffcf3f';
    this.player.reset(p0.position.x, p0.position.z, p0.rotationY);
    this.playerMesh = createKart(0xe33e2b);
    this.playerMesh.castShadow = true;
    this.scene.add(this.playerMesh);
    this.player.attachMesh(this.playerMesh);
    syncMeshToPhysics(this.playerMesh, this.playerPhysics, 0);

    // AI field (7)
    const aiSpots = spawns.slice(1).map((s) => ({ x: s.position.x, z: s.position.z, heading: s.rotationY }));
    const importCenter = this.centerline.length >= 4 ? this.centerline : undefined;
    this.ai = createField(AI_COUNT, {
      difficulty: 0.72,
      centerline: importCenter,
      startSpots: aiSpots,
      onUseItem: (idx, ctrl) => { try { this._aiFireItem(idx); } catch { /* ignore */ } },
    });
    this.ai.isFallback = false;
    const aiNames = ['Rocco', 'Beppo', 'Stella', 'Pippa', 'Grom', 'Nuvola', 'Fulmine'];
    const aiCols = [0x2fbf4a, 0x3fa7ff, 0xff7fc0, 0xffc93f, 0x9b5bff, 0x35c759, 0xff7a1a];
    this.aiMeshes = this.ai.controllers.map((c, i) => {
      const m = createKart(aiCols[i % aiCols.length]);
      this.scene.add(m);
      makeItemFields(c.physics, aiNames[i % aiNames.length], false);
      c.physics.color = '#4da3ff';
      try {
        const drv = getDriver(i + 1);
        if (drv) c.physics.color = drv.kart || c.physics.color;
      } catch { /* ignore */ }
      syncMeshToPhysics(m, c.physics, 0);
      return m;
    });
    try {
      globalThis.__useAIItem = (idx) => this._aiFireItem(idx);
      window.__useAIItem = (idx) => this._aiFireItem(idx);
    } catch { /* ignore */ }

    // Items
    this.items = new ItemSystem(this.scene, this.centerline.length ? this.centerline : null, { boxCount: 10 });
    this.items.isFallback = false;
    try { this.items.onEvent((e) => this._onItemEvent(e)); } catch { /* ignore */ }

    // HUD + menus + audio + fx
    this.hud = new HUD({ totalLaps: this.totalLaps, onRestart: () => this.startRace() });
    this.hud.isFallback = false;
    this.menus = new Menus({
      onStart: (color) => { if (color) this._playerColor = color; this._applyPlayerColor(); try { this.audio?.unlock?.(); this.audio?.ensure?.(); this.audio?.startMusic?.(); } catch { /* ignore */ } this.startRace(); },
      onResume: () => this.resume(),
      onRestart: () => this.startRace(),
      onQuit: () => { this._setState('menu'); this.hud?.hideResults?.(); },
      onColor: (color) => { this._playerColor = color; this._applyPlayerColor(); },
      initialColor: this._playerColor,
      hud: this.hud,
    });
    try { this.menus.attachHud?.(this.hud); } catch { /* ignore */ }
    this.audio = new GameAudio();
    try { this.audio.bindMuteKey?.(); } catch { /* ignore */ }
    try { this.fx = new ParticleSystem({ parent: this.scene }); } catch (e) { console.warn('[Game] fx failed', e); }

    const p = this.playerPhysics.position;
    this.cameraRig.snapTo(new THREE.Vector3(p.x, 1, p.z), this.playerPhysics.heading);
    this.hud.showCountdown(null);
    this._pushHud();
    return this;
  }

  _applyPlayerColor() {
    try {
      const hex = parseInt(String(this._playerColor).replace('#', ''), 16);
      if (!Number.isFinite(hex)) return;
      this.playerMesh?.traverse?.((o) => {
        if (o.isMesh && o.material && o.userData?.livery) { o.material.color.setHex(hex); }
      });
    } catch { /* ignore */ }
  }

  _aiFireItem(idx) {
    try {
      const phys = this.ai?.physics?.[idx];
      if (!phys || this.state !== 'racing') return;
      if (!phys.item && !phys.roulette) this.items?.giveItem?.(phys);
      const used = this.items?.useItem?.(phys);
      if (used === 'mushroom') { try { phys.addBoost?.(2.0); } catch { /* ignore */ } try { this.audio?.playBoost?.(); } catch { /* ignore */ } }
    } catch { /* ignore */ }
  }

  _onItemEvent(e) {
    try {
      if (!e) return;
      if (e.type === 'boost') { try { e.kart?.addBoost?.(2.0); } catch { /* ignore */ } if (e.kart === this.playerPhysics) this.audio?.playBoost?.(); }
      else if (e.type === 'pickup' && e.kart === this.playerPhysics) this.audio?.playPickup?.();
      else if (e.type === 'stun' || e.type === 'hit') this.audio?.playHit?.();
      else if (e.type === 'star') this.audio?.playStar?.();
    } catch { /* ignore */ }
  }

  _safeSpawnPose() {
    const s = getSpawnPoints(1)[0];
    return { position: new THREE.Vector3(s.position.x, 1, s.position.z), yaw: s.rotationY };
  }

  startRace() {
    if (this.state === 'racing' || this.state === 'countdown') return;
    this.resetToSpawn();
    this.raceTime = 0;
    this.lap = 1;
    this.position = 1;
    this.message = '';
    this._finished = false;
    this._countdownTimer = 0;
    this._countdownStep = -1;
    this.hud?.hideResults?.();
    this._setState('countdown');
    this._pushHud();
  }

  resetToSpawn() {
    const spawns = getSpawnPoints(TOTAL_KARTS);
    try { this.player.reset(spawns[0].position.x, spawns[0].position.z, spawns[0].rotationY); } catch { /* ignore */ }
    this.ai?.controllers?.forEach((c, i) => {
      const s = spawns[i + 1] ?? spawns[0];
      try { c.reset(s.position.x, s.position.z, s.rotationY); } catch { /* ignore */ }
    });
    for (const p of this.getAllKarts()) { p.lap = 0; p.progress = 0; p.totalProgress = -1; p.item = null; p.roulette = null; p.stunTime = 0; p.spinTime = 0; p.starTime = 0; p.boostTime = 0; if (p.physics) { /* n/a */ } }
    if (this.playerPhysics) { this.playerPhysics.item = null; this.playerPhysics.roulette = null; }
    try { this.items?.reset?.(); this.items?.setTrackData?.(this.centerline); } catch { /* ignore */ }
    try { this.fx?.reset?.(); } catch { /* ignore */ }
    syncAllMeshes(this);
    const p = this.playerPhysics.position;
    try { this.cameraRig.snapTo(new THREE.Vector3(p.x, 1, p.z), this.playerPhysics.heading); } catch { /* ignore */ }
  }

  pause() {
    if (this.state !== 'racing' && this.state !== 'countdown') return;
    this._prePauseState = this.state;
    this._setState('paused');
  }
  resume() {
    if (this.state !== 'paused') return;
    this._setState(this._prePauseState);
  }
  togglePause() { if (this.state === 'paused') this.resume(); else this.pause(); }

  _trackProgress(pos, hint = 0) {
    const pts = this.centerline;
    if (!pts.length) return hint;
    let best = hint, bestD = Infinity;
    for (let k = -15; k <= 15; k++) {
      const i = (((hint + k) % pts.length) + pts.length) % pts.length;
      const dx = pts[i].x - pos.x, dz = pts[i].z - pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (bestD > 3600) {
      for (let i = 0; i < pts.length; i++) {
        const dx = pts[i].x - pos.x, dz = pts[i].z - pos.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return best;
  }

  update(dt) {
    const input = this.input;
    if (input?.consumeStartPressed?.()) {
      if (this.state === 'menu' || this.state === 'finished') { try { this.audio?.unlock?.(); this.audio?.startMusic?.(); } catch { /* ignore */ } this.startRace(); }
    }
    if (input?.consumePausePressed?.()) this.togglePause();
    if (this.state === 'paused' || this.state === 'menu') return;

    if (this.state === 'countdown') {
      this._countdownTimer += dt;
      const steps = ['3', '2', '1', 'GO!'];
      const idx = Math.min(Math.floor(this._countdownTimer / 0.8), steps.length - 1);
      if (idx !== this._countdownStep) {
        this._countdownStep = idx;
        this.countdownValue = steps[idx];
        this.hud?.showCountdown?.(this.countdownValue);
        try { if (idx < 3) this.audio?.playBeep?.(); else this.audio?.playGo?.(); } catch { /* ignore */ }
      }
      this._pushHud();
      if (this._countdownTimer >= steps.length * 0.8) {
        this.countdownValue = null;
        this.hud?.showCountdown?.(null);
        this._setState('racing');
      }
      return;
    }

    if (this.state === 'racing' || this.state === 'finished') {
      this.raceTime += dt;
      try { this.track?.update?.(dt); } catch { /* ignore */ }
      try { this.envApi?.update?.(dt, this.raceTime); } catch { /* ignore */ }

      // --- player ---
      let snap = null;
      try {
        const raw = checkBounds(this.playerPhysics.position);
        const adapted = adaptBoundsResult(raw, this.playerPhysics.position, { wallOffset: WALL_OFFSET, checkFn: checkBounds });
        if (adapted?.corrected && adapted?.normal) this.playerPhysics.slideAlongWall(adapted.normal.x, adapted.normal.z);
        const surf = adapted?.slowFactor < 1 ? 'offroad' : 'road';
        const stun = (this.playerPhysics.stunTime ?? 0) > 0 || (this.playerPhysics.spinTime ?? 0) > 0;
        const env = { surface: surf, topSpeedScale: (this.playerPhysics.starTime ?? 0) > 0 ? 1.18 : 1 };
        if (stun) {
          this.playerPhysics.speed *= (1 - Math.min(1, 3 * dt));
          snap = this.player.physics.update(dt, { throttle: 0, steer: 0, drift: false, hop: false }, env);
          if (this.player.mesh) syncMeshToPhysics(this.player.mesh, this.playerPhysics, dt);
          this.player.consumeItemPressed();
        } else {
          snap = this.player.update(dt, env);
        }
        // mushroom bridge: ItemSystem wrote wrapper boostTime; physics owns its own timer
        if ((this.playerPhysics.boostTime ?? 0) > 0 && !(this.playerPhysics.boostActive)) {
          // ItemSystem decrements wrapper timer; mirror into physics boost
          try { this.playerPhysics.addBoost?.(Math.min(2, this.playerPhysics.boostTime)); } catch { /* ignore */ }
        }
        if (snap?.itemPressed) {
          const used = this.items?.useItem?.(this.playerPhysics);
          if (used === 'mushroom') { try { this.playerPhysics.addBoost?.(2.0); } catch { /* ignore */ } try { this.audio?.playBoost?.(); } catch { /* ignore */ } }
          else if (used) { try { this.audio?.playShell?.(); } catch { /* ignore */ } }
        }
      } catch (e) { console.warn('[Game] player update failed', e); }

      if (input?.consumeResetPressed?.()) this.resetToSpawn();

      // --- AI ---
      try {
        const allPhys = this.getAllKarts().map((k) => k?.physics ?? k);
        this.ai.controllers.forEach((c) => {
          try {
            const raw = checkBounds(c.physics.position);
            const adapted = adaptBoundsResult(raw, c.physics.position, { wallOffset: WALL_OFFSET, checkFn: checkBounds });
            if (adapted?.corrected && adapted?.normal) c.physics.slideAlongWall(adapted.normal.x, adapted.normal.z);
            const surf = adapted?.slowFactor < 1 ? 'offroad' : 'road';
            const stun = (c.physics.stunTime ?? 0) > 0 || (c.physics.spinTime ?? 0) > 0;
            const env = { surface: surf };
            if (stun) { c.physics.speed *= (1 - Math.min(1, 3 * dt)); }
            else c.update(dt, { karts: allPhys, playerProgress: this.playerPhysics.totalProgress, env });
            if ((c.physics.boostTime ?? 0) > 0 && !c.physics.boostActive) { try { c.physics.addBoost?.(0.5); } catch { /* ignore */ } }
          } catch { /* per-ai errors tolerated */ }
        });
      } catch (e) { console.warn('[Game] ai update failed', e); }

      try { separateKarts(this.getAllKarts().map((k) => k?.physics ?? k)); } catch { /* ignore */ }

      // --- items ---
      try { this.items?.update?.(dt, this.getAllKarts()); } catch (e) { console.warn('[Game] items failed', e); }

      // --- progress / laps / positions ---
      try {
        this._updateProgress();
        this.position = calculatePosition(this.getAllKarts(), 0) || 1;
        this.lap = Math.max(1, Math.min(this.totalLaps, this.playerPhysics.lap || 1));
        if ((this.playerPhysics.lap ?? 1) > this.totalLaps && !this._finished) this._finishRace();
      } catch { /* ignore */ }

      // --- meshes, fx, audio, camera ---
      try {
        syncMeshToPhysics(this.playerMesh, this.playerPhysics, dt);
        if ((this.playerPhysics.spinTime ?? 0) > 0 && this.playerMesh) this.playerMesh.rotation.y += dt * 12;
        if ((this.playerPhysics.starTime ?? 0) > 0 && this.playerMesh) this.playerMesh.position.y += Math.sin(this.raceTime * 20) * 0.02;
        this.ai.controllers.forEach((c, i) => {
          const m = this.aiMeshes[i];
          if (!m) return;
          syncMeshToPhysics(m, c.physics, dt);
          if ((c.physics.spinTime ?? 0) > 0) m.rotation.y += dt * 12;
        });
      } catch { /* ignore */ }
      try {
        const s = Math.min(1, Math.abs(this.playerPhysics.speed) / 42);
        const boosting = !!(this.playerPhysics.boostActive ?? this.playerPhysics.boosting);
        const p = this.playerPhysics.position;
        const fx = Math.sin(this.playerPhysics.heading), fz = Math.cos(this.playerPhysics.heading);
        if (this.playerPhysics.drifting) {
          this.fx?.beginSlide?.();
          this.fx?.driftTick?.(p.x, 0.3, p.z, -fx * 2, 0, -fz * 2, (this.playerPhysics.driftCharge ?? 0) / 1.2, dt);
        } else this.fx?.endSlide?.();
        if (boosting) this.fx?.boostTick?.(p.x - fx * 1.2, 0.5, p.z - fz * 1.2, fx, 0, fz, 1, dt);
        this.fx?.update?.(dt);
        this.speedKmh = Math.abs(this.playerPhysics.speed) * 3.6;
        this.cameraRig.setBoost?.(boosting);
        void s;
        try { this.audio?.updateEngine?.(Math.min(1, Math.abs(this.playerPhysics.speed) / 42), { drifting: !!this.playerPhysics.drifting, boosting }); } catch { /* ignore */ }
      } catch { /* ignore */ }

      this._drawMinimapFallback();
      this._pushHud();
    }
  }

  _updateProgress() {
    const n = this.centerline.length || 1;
    const karts = this.getAllKarts();
    karts.forEach((k) => {
      const phys = k?.physics ?? k;
      const hint = phys._hint ?? 0;
      const idx = this._trackProgress(phys.position, hint);
      const prev = phys._hint ?? idx;
      if (prev > n * 0.75 && idx < n * 0.25) phys.lap = (phys.lap ?? 0) + 1;
      else if (prev < n * 0.25 && idx > n * 0.75) phys.lap = Math.max(0, (phys.lap ?? 0) - 1);
      phys._hint = idx;
      phys.progress = idx;
      phys.totalProgress = (phys.lap ?? 0) * n + idx;
    });
  }

  _finishRace() {
    this._finished = true;
    this._setState('finished');
    try {
      const p = this.playerPhysics.position;
      this.fx?.confettiBurst?.(p.x, 3, p.z, 200);
    } catch { /* ignore */ }
    try { this.audio?.stopMusic?.(); this.audio?.playGo?.(); } catch { /* ignore */ }
    const rows = this.getAllKarts().map((k, i) => ({
      name: k.name || (i === 0 ? 'YOU' : `Racer ${i + 1}`),
      time: this.raceTime + (i === 0 ? 0 : (this.position <= 2 ? 3 + i * 1.7 : 6 + i * 2.3)),
      isPlayer: i === 0,
    }));
    rows.sort((a, b) => (a.isPlayer ? -1 : 0));
    try { this.hud?.showResults?.(rows, { title: `🏁 YOU FINISHED ${ordinal(this.position)}!` }); } catch { /* ignore */ }
  }

  render(rdt) {
    try {
      const p = this.playerPhysics?.position ?? { x: 0, y: 0, z: 0 };
      this.cameraRig.update(rdt, new THREE.Vector3(p.x, p.y ?? 0, p.z), this.playerPhysics?.heading ?? 0, this.speedKmh);
    } catch { /* ignore */ }
    this.renderer.render(this.scene, this.perspectiveCamera);
  }

  _pushHud() {
    try {
      this.hud?.update?.({
        state: this.state,
        raceTime: this.raceTime,
        time: this.raceTime,
        lap: this.lap,
        totalLaps: this.totalLaps,
        position: this.position,
        totalKarts: TOTAL_KARTS,
        speedKmh: this.speedKmh,
        speed: (this.speedKmh ?? 0) / 3.6,
        item: this.playerPhysics?.item ?? '—',
        roulette: this.playerPhysics?.roulette ?? null,
        message: this.message,
        countdown: this.countdownValue,
        trackData: this.centerline,
        karts: this.getAllKarts(),
        playerIndex: 0,
      });
    } catch { /* ignore */ }
  }

  _drawMinimapFallback() { /* HUD draws minimap via update() */ }
}

function syncAllMeshes(game) {
  try { if (game.playerMesh && game.playerPhysics) syncMeshToPhysics(game.playerMesh, game.playerPhysics, 0); } catch { /* ignore */ }
  try {
    game.ai?.controllers?.forEach((c, i) => {
      const m = game.aiMeshes?.[i];
      if (m && c?.physics) syncMeshToPhysics(m, c.physics, 0);
    });
  } catch { /* ignore */ }
}

export async function createGame(opts) {
  const game = new Game(opts);
  await game.init();
  return game;
}
