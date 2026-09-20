/**
 * Game orchestrator: menu -> warming -> countdown -> racing -> results,
 * plus paused / replay / time-trial / championship branches.
 *
 * Readable rewrite of the bottom-third state machine in the minified
 * bundle (`yB/SB/bB/gB/xB`, `gV/_V/jV/MV/NV`, `DV` lap logic, `RV` HUD).
 */
import * as THREE from 'three';
import { getTrack, championshipRotation, TRACKS } from '../config/tracks.js';
import { getCar, ENGINE_PROFILES } from '../config/cars.js';
import { CHAMPIONSHIP_POINTS } from '../config/modes.js';
import { SplineTrack, wrapDistance, signedDelta, trackMinimapPoints } from './spline-track.js';
import { createVehicleMesh, createGhostMesh, createCarState, placeOnTrack, poseVehicle } from './vehicle.js';
import { stepVehicle, resolveCarContact, resetCarToTrack, formatLapTime, FIXED_STEP } from './physics.js';
import { getBest, maybeSaveBest, sampleGhost } from './ghost.js';
import { Replay } from './replay.js';
import { ChaseCamera } from './follow-camera.js';

const AI_NAMES = ['KAITO', 'MIRA', 'DARIO', 'SENNA', 'YUKI', 'NOVA', 'RAFE', 'ODILE'];

/** Holding the brakes on the grid: handbrake, no throttle. */
const HOLD_INPUT = { steer: 0, throttle: 0, brake: 0, handbrake: true };

export class Game {
  constructor(world, ui, hud, audio, input) {
    this.world = world;
    this.ui = ui;
    this.hud = hud;
    this.audio = audio;
    this.input = input;
    this.cameraRig = new ChaseCamera(world.camera);
    this.replay = new Replay();

    this.state = 'menu';
    this.selection = { trackId: 'coast', carId: 'apex', paint: '#d6ed42', mode: 'quick', laps: 3 };
    this.settings = { quality: 'high', adaptive: false, abs: true, traction: true, volume: 0.65, music: true };
    this.loadSettings();

    this.track = null;
    this.cars = []; // { spec, state, mesh, isPlayer, name }
    this.ghost = null; // { mesh, frames }
    this.race = null;
    this.championship = null;
    this.accumulator = 0;
    this.countdownShown = -1;
    this.fps = 60;
    this.showCar = null;
  }

  // -- settings ----------------------------------------------------------
  loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('spline-rush-settings') ?? '{}');
      Object.assign(this.settings, s);
      const q = localStorage.getItem('spline-rush-quality');
      if (q) this.settings.quality = q;
    } catch { /* defaults */ }
  }

  persistSettings() {
    try {
      localStorage.setItem('spline-rush-settings', JSON.stringify(this.settings));
      localStorage.setItem('spline-rush-quality', this.settings.quality);
    } catch { /* private mode */ }
  }

  // -- menu ---------------------------------------------------------------
  toMenu() {
    this.state = 'menu';
    this.clearRace();
    this.ui.showMenu(true);
    this.hud.hide();
    this.ui.hidePause();
    this.ui.hideResults();
    this.ui.setReplayBanner(false);
    this.ui.setLoading('', false);
    this.loadTrackForMenu();
    this.ui.setBackend('WEBGL2 · LIVE');
  }

  loadTrackForMenu() {
    this.setTrack(this.selection.trackId);
    // Parked show car for the orbit camera.
    if (!this.showCar) {
      this.showCar = createVehicleMesh(this.selection.carId, this.selection.paint);
      this.world.scene.add(this.showCar);
    }
    const p = this.track.toWorld(this.track.length * 0.16, 2);
    this.showCar.position.copy(p);
    this.showCar.rotation.y = Math.atan2(this.track.sample(0).tangent.x, this.track.sample(0).tangent.z);
    for (const t of this.track.meta ? [] : []) void t;
    this.ui.setHeroCar(getCar(this.selection.carId));
    for (const t of TRACKS) this.ui.setMinimap(t.id, trackMinimapPoints(t.id));
  }

  setTrack(trackId) {
    if (this.track) {
      this.world.scene.remove(this.track.group);
      this.track.dispose();
    }
    this.track = new SplineTrack(trackId);
    this.world.scene.add(this.track.group);
    const meta = getTrack(trackId);
    this.world.setTrackEnvironment(trackId, meta.timeOfDay, meta.rain);
    this.selection.trackId = trackId;
    this.ui.setTrack(trackId);
  }

  refreshShowCar() {
    if (this.showCar) {
      this.world.scene.remove(this.showCar);
      this.showCar = null;
    }
    this.loadTrackForMenu();
  }

  // -- race setup ----------------------------------------------------------
  async startRace() {
    await this.audio.start().catch(() => {});
    if (this.selection.mode === 'championship') {
      this.championship = {
        round: -1,
        points: new Map([['YOU', 0]]),
        tracks: championshipRotation(this.selection.trackId),
        qualifyingOrder: null,
      };
    } else {
      this.championship = null;
    }
    this.buildGrid();
  }

  buildGrid() {
    this.state = 'warming';
    this.ui.showMenu(false);
    this.ui.hideResults();
    this.ui.setLoading('PREPARING THE GRID', true);
    this.hud.show();
    if (this.showCar) {
      this.world.scene.remove(this.showCar);
      this.showCar = null;
    }
    this.clearRace();
    this.setTrack(this.championship && this.championship.round >= 0
      ? this.championship.tracks[this.championship.round]
      : this.selection.trackId);

    const mode = this.selection.mode;
    const isQualifying = !!this.championship && this.championship.round === -1;
    const isTimeTrial = mode === 'time-trial';
    const laps = isQualifying ? 1 : this.selection.laps || 3;

    // Player + 8 AI (none in time trial).
    const entries = [{ name: 'YOU', isPlayer: true }];
    if (!isTimeTrial) {
      for (let i = 0; i < 8; i++) entries.push({ name: AI_NAMES[i], isPlayer: false });
    }
    this.cars = entries.map((e, i) => {
      const spec = e.isPlayer ? getCar(this.selection.carId) : getCar(['apex', 'vanta', 'spectre', 'rift', 'vector'][i % 5]);
      const state = createCarState();
      state.spec = spec;
      state.isPlayer = e.isPlayer;
      const mesh = createVehicleMesh(spec.id, e.isPlayer ? this.selection.paint : spec.color);
      this.world.scene.add(mesh);
      // Staggered grid; qualifying spreads AI ahead on flying laps.
      if (isQualifying && !e.isPlayer) {
        placeOnTrack(state, this.track, -22 - i * 15, (i % 2 ? -2.2 : 2.2));
        state.speed = 28 + (i % 3) * 3;
      } else {
        placeOnTrack(state, this.track, -10 - Math.floor(i / 2) * 8, i % 2 ? 2.7 : -2.7);
      }
      poseVehicle(mesh, this.track, state);
      return { spec, state, mesh, isPlayer: e.isPlayer, name: e.name, stats: null, aiRubber: 0.92 + ((i * 37) % 20) / 100 };
    });

    // Personal-best ghost in time trial.
    this.ghost = null;
    if (isTimeTrial) {
      const best = getBest(this.track.id, this.selection.carId);
      if (best?.ghost?.length) {
        const mesh = createGhostMesh(this.selection.carId);
        this.world.scene.add(mesh);
        this.ghost = { mesh, frames: best.ghost };
      }
    }

    this.race = {
      qualifying: isQualifying,
      timeTrial: isTimeTrial,
      laps,
      elapsed: 0,
      countdown: 3.7,
      finishWait: 0,
      ghostFrames: [],
      ghostClock: 0,
      finished: false,
      scored: false,
      playerBest: getBest(this.track.id, this.selection.carId)?.best ?? null,
    };
    this.replay.clear();
    this.countdownShown = -1;
    this.hud.event(isQualifying ? 'QUALIFYING · Set your grid position'
      : isTimeTrial ? 'TIME TRIAL · Chase your personal best'
      : this.championship ? `CHAMPIONSHIP · RACE ${this.championship.round + 1} / 3`
      : 'QUICK RACE · 9 drivers. One finish line.');
    // Warming lasts 3 rendered frames, then countdown (mirrors `aV >= 3`).
    this.warmFrames = 0;
  }

  clearRace() {
    for (const c of this.cars) this.world.scene.remove(c.mesh);
    if (this.ghost) this.world.scene.remove(this.ghost.mesh);
    this.cars = [];
    this.ghost = null;
    this.race = null;
  }

  // -- pause / resume -------------------------------------------------------
  pause() {
    if (!['racing', 'countdown', 'replay'].includes(this.state)) return;
    this.stateBeforePause = this.state;
    this.state = 'paused';
    this.audio.pauseAll();
    this.ui.showPause(this.race?.timeTrial);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = this.stateBeforePause ?? 'racing';
    this.ui.hidePause();
  }

  // -- per-frame update ------------------------------------------------------
  update(dt) {
    this.fps += (1 / Math.max(1e-3, dt) - this.fps) * 0.05;
    if (this.state === 'menu') {
      const target = this.showCar?.position ?? new THREE.Vector3();
      this.cameraRig.orbitMenu(dt, target);
      this.world.update(dt, target);
      this.world.render();
      return;
    }
    if (this.state === 'paused') {
      this.world.render();
      return;
    }
    if (this.state === 'replay') {
      this.updateReplay(dt);
      return;
    }
    if (!this.race) return;

    if (this.state === 'warming') {
      this.warmFrames++;
      this.world.render();
      if (this.warmFrames >= 3) {
        this.state = 'countdown';
        this.ui.setLoading('', false);
      }
      return;
    }

    if (this.state === 'countdown') {
      this.race.countdown -= dt;
      const n = Math.ceil(this.race.countdown);
      if (n !== this.countdownShown && n > 0) {
        this.countdownShown = n;
        this.hud.setCountdown(String(Math.min(3, n)));
        this.audio.countdown(false);
      }
      if (this.race.countdown <= 0) {
        this.state = 'racing';
        this.hud.setCountdown('GO!');
        this.hud.event('GREEN LIGHT · GO');
        this.audio.countdown(true);
        setTimeout(() => this.hud.setCountdown(''), 650);
      }
      this.stepRace(dt, true);
      this.updateHud();
      this.world.render();
      return;
    }

    if (this.state === 'racing') {
      this.race.elapsed += dt;
      this.stepRace(dt, false);
      this.replay.record(dt, this.cars.map((c) => c.state));
      this.updateHud();
      this.audio.update({
        speed: this.player().state.speed,
        slip: this.player().state.slip,
        surface: this.player().state.surface,
        rain: this.track.meta.rain,
        tunnel: this.track.inTunnel(this.player().state.s) ? 1 : 0,
        racing: true,
      });
      this.world.render();
      if (this.raceFinished()) this.finishRace();
    }
  }

  player() {
    return this.cars[0];
  }

  stepRace(dt, frozen) {
    // Fixed-step accumulator (minified `CB` accumulator, `hV` step).
    this.accumulator = Math.min(this.accumulator + dt, 0.5);
    let guard = 0;
    while (this.accumulator >= FIXED_STEP && guard++ < 40) {
      this.accumulator -= FIXED_STEP;
      for (const car of this.cars) {
        // Countdown holds the whole grid (mirrors the original `kV` freeze);
        // otherwise AI would shove the player across the line before GO.
        const input = frozen ? HOLD_INPUT : car.isPlayer ? this.input.frame() : this.aiInput(car);
        stepVehicle(car.state, input, this.track, FIXED_STEP, {
          wetness: this.track.meta.rain,
          abs: this.settings.abs,
          traction: this.settings.traction,
        });
      }
      // Car-car contacts.
      for (let i = 0; i < this.cars.length; i++) {
        for (let j = i + 1; j < this.cars.length; j++) {
          const hit = resolveCarContact(this.cars[i].state, this.cars[j].state, this.track);
          if (hit > 2 && (this.cars[i].isPlayer || this.cars[j].isPlayer)) this.audio.impact(Math.min(1, hit / 8));
        }
      }
      if (!frozen) this.updateLaps();
    }
    // Pose meshes + chase camera.
    for (const car of this.cars) poseVehicle(car.mesh, this.track, car.state, dt);
    if (this.ghost) {
      const p = this.player().state;
      const lapT = this.race.elapsed - p.lapStart;
      const g = sampleGhost(this.ghost.frames, lapT);
      if (g && p.raceLap > 0) {
        this.ghost.mesh.visible = true;
        poseVehicle(this.ghost.mesh, this.track, { ...p, s: (p.raceLap - 1) * this.track.length + g.s, lateral: g.lateral, heading: g.heading }, dt);
      } else {
        this.ghost.mesh.visible = false;
      }
    }
    this.cameraRig.update(this.track, this.player().state, dt);
    this.world.update(dt, this.player().mesh.position);
  }

  aiInput(car) {
    // Readable pure-pursuit: steer toward a look-ahead point, throttle by curvature.
    const lookAhead = 22 + Math.max(0, car.state.speed) * 0.5;
    const target = this.track.sample(car.state.s + lookAhead);
    const here = this.track.sample(car.state.s);
    const toTarget = target.position.clone().sub(here.position);
    const right = here.right;
    const lateralError = toTarget.dot(right) - car.state.lateral;
    const headingError = car.state.heading;
    const steer = THREE.MathUtils.clamp(lateralError * 0.06 - headingError * 1.4, -1, 1);
    const curveAhead = Math.abs(this.track.sample(car.state.s + 30).curvature);
    const targetSpeed = (38 - Math.min(24, curveAhead * 900)) * car.aiRubber;
    return {
      steer,
      throttle: car.state.speed < targetSpeed ? 0.85 : 0.15,
      brake: car.state.speed > targetSpeed + 6 ? 0.7 : 0,
      handbrake: false,
    };
  }

  updateLaps() {
    const L = this.track.length;
    for (const car of this.cars) {
      const st = car.state;
      if (st.finished) continue;
      // Start-line crossing opens lap 1 (grid sits at s < 0).
      // updateLaps only runs un-frozen, so any car at s >= 0 has launched.
      if (st.raceLap === 0 && st.s >= 0) {
        st.raceLap = 1;
        st.lapStart = this.race.elapsed;
        st.sectorStart = this.race.elapsed;
        st.nextSector = L / 3;
        st.sectors = [];
        if (car.isPlayer) {
          this.race.ghostFrames = [];
          this.race.ghostClock = 0;
        }
        continue;
      }
      if (st.raceLap === 0) continue;
      const sInLap = wrapDistance(st.s, L);
      const prevInLap = wrapDistance(st.s - st.speed * FIXED_STEP, L);
      // Sector gates at L/3, 2L/3, finish.
      if (prevInLap < st.nextSector && sInLap >= st.nextSector) {
        st.sectors.push(this.race.elapsed - st.sectorStart);
        st.sectorStart = this.race.elapsed;
        st.nextSector += L / 3;
      }
      if (sInLap < prevInLap - L / 2 || (prevInLap > L - 50 && sInLap < 50 && st.s > L)) {
        // Lap complete.
        const lapTime = this.race.elapsed - st.lapStart;
        st.lastSectors = [...st.sectors];
        st.sectors = [];
        st.lapStart = this.race.elapsed;
        st.sectorStart = this.race.elapsed;
        st.nextSector = L / 3;
        if (car.isPlayer) {
          const valid = !st.lapInvalid;
          if (valid && (!this.race.playerBest || lapTime < this.race.playerBest)) {
            const saved = maybeSaveBest(this.track.id, this.selection.carId, lapTime, st.lastSectors, this.race.ghostFrames);
            if (saved) {
              this.race.playerBest = lapTime;
              this.hud.event(`PERSONAL BEST · ${formatLapTime(lapTime)}`);
            }
          } else {
            this.hud.event(`LAP ${st.raceLap} · ${formatLapTime(lapTime)}${valid ? '' : ' · INVALID'}`);
          }
          st.lapInvalid = false;
          this.race.ghostFrames = [];
          this.race.ghostClock = 0;
        }
        st.raceLap++;
        if (!this.race.timeTrial && st.raceLap > this.race.laps) {
          st.finished = true;
          st.finishTime = this.race.elapsed;
          if (car.isPlayer) {
            this.hud.event('CHEQUERED FLAG · FINISH');
            this.audio.tone(880, 0.4, 0.25, 'sine');
          }
        }
        if (this.race.qualifying && st.raceLap > 1 && !st.finished) {
          st.finished = true;
          st.finishTime = this.race.elapsed;
          st.bestLap = lapTime;
        }
      }
      // Ghost capture at 20 Hz for the player.
      if (car.isPlayer && st.raceLap > 0 && !st.finished) {
        this.race.ghostClock += FIXED_STEP;
        if (this.race.ghostClock >= 0.05) {
          this.race.ghostClock -= 0.05;
          this.race.ghostFrames.push([this.race.elapsed - st.lapStart, sInLap, st.lateral, st.heading, st.speed]);
        }
      }
    }
  }

  leaderboard() {
    const L = this.track.length;
    const progress = (car) => (car.state.raceLap * L + wrapDistance(car.state.s, L)) - (car.state.finished ? 0 : 0);
    return [...this.cars]
      .sort((a, b) => {
        if (a.state.finished && b.state.finished) return a.state.finishTime - b.state.finishTime;
        if (a.state.finished) return -1;
        if (b.state.finished) return 1;
        return progress(b) - progress(a);
      })
      .map((car, i) => ({ car, position: i + 1 }));
  }

  raceFinished() {
    if (this.player().state.finished) {
      this.race.finishWait += 1 / 60;
      const allDone = this.cars.every((c) => c.state.finished);
      return allDone || this.race.finishWait > 6 || this.race.timeTrial;
    }
    return false;
  }

  finishRace() {
    this.state = 'results';
    const board = this.leaderboard();
    const playerPos = board.find((r) => r.car.isPlayer)?.position ?? board.length;
    // Championship scoring once per race.
    if (this.championship && !this.race.scored) {
      this.race.scored = true;
      if (this.race.qualifying) {
        this.championship.qualifyingOrder = board.map((r) => r.car.name);
      } else {
        board.forEach((r, i) => {
          const pts = CHAMPIONSHIP_POINTS[i] ?? 0;
          this.championship.points.set(r.car.name, (this.championship.points.get(r.car.name) ?? 0) + pts);
        });
      }
    }
    const isQuali = this.race.qualifying;
    const isChamp = !!this.championship && !isQuali;
    const title = isQuali ? 'QUALIFYING COMPLETE' : isChamp ? 'CHAMPIONSHIP · RACE COMPLETE' : this.race.timeTrial ? 'SESSION COMPLETE' : 'SESSION COMPLETE';
    const headline = isQuali ? 'GRID IS SET.' : this.race.timeTrial ? 'SESSION DONE.' : playerPos === 1 ? 'VICTORY.' : 'THE FINISH.';
    const canContinue = !!this.championship && this.championship.round < 2;
    const rows = isChamp || (this.championship && this.championship.round >= 0)
      ? [...this.championship.points.entries()].sort((a, b) => b[1] - a[1]).map(([name, pts], i) => ({ left: `${i + 1}   ${name}`, right: `${pts} PTS`, isPlayer: name === 'YOU' }))
      : board.slice(0, 9).map((r) => ({
        left: `${r.position}   ${r.car.name}`,
        right: r.car.isPlayer ? 'YOU' : gapText(r, board[0], this.track.length),
        isPlayer: r.car.isPlayer,
      }));
    this.ui.showResults({
      title, headline,
      copy: `${getTrack(this.track.id).name} · ${getTrack(this.track.id).biome.toUpperCase()}`,
      stats: [
        { label: isQuali ? 'GRID POSITION' : 'FINISH POSITION', value: `P${playerPos} / ${board.length}` },
        { label: 'BEST LAP', value: formatLapTime(this.race.playerBest ?? this.player().state.bestLap) },
        { label: 'SESSION TIME', value: formatLapTime(this.race.elapsed) },
        { label: isChamp ? 'CHAMPIONSHIP POINTS' : 'LAPS COMPLETED', value: isChamp ? String(this.championship.points.get('YOU') ?? 0) : String(Math.max(0, this.player().state.raceLap - 1)) },
      ],
      rows, canContinue, isQualifying: isQuali,
    });
    this.audio.pauseAll();
  }

  continueFromResults() {
    if (!this.championship) return this.toMenu();
    if (this.race.qualifying) {
      this.championship.round = 0;
      this.buildGrid();
      // Grid ordered by qualifying (player inserted by pace).
      return;
    }
    if (this.championship.round < 2) {
      this.championship.round++;
      this.buildGrid();
      return;
    }
    this.championship = null;
    this.toMenu();
  }

  // -- replay --------------------------------------------------------------
  watchReplay() {
    if (!this.replay.length) return;
    this.ui.hideResults();
    this.state = 'replay';
    this.replayTime = 0;
    this.hud.show();
    this.hud.setMessage('REPLAY');
    this.ui.setReplayBanner(true);
  }

  updateReplay(dt) {
    this.replayTime += dt;
    const snap = this.replay.sample(this.replayTime);
    if (snap) {
      snap.cars.forEach((pose, i) => {
        if (!this.cars[i]) return;
        Object.assign(this.cars[i].state, pose);
        poseVehicle(this.cars[i].mesh, this.track, this.cars[i].state, dt);
      });
      this.cameraRig.update(this.track, this.cars[0].state, dt);
      this.world.update(dt, this.cars[0].mesh.position);
      this.updateHud();
    }
    this.world.render();
  }

  endReplay() {
    this.ui.setReplayBanner(false);
    this.hud.setMessage('');
    this.finishRace();
  }

  // -- HUD -------------------------------------------------------------------
  updateHud() {
    const board = this.leaderboard();
    const player = this.player().state;
    const pos = board.find((r) => r.car.isPlayer)?.position ?? 1;
    const sInLap = wrapDistance(player.s, this.track.length);
    const ghostPose = this.ghost ? sampleGhost(this.ghost.frames, this.race.elapsed - player.lapStart) : null;
    const delta = ghostPose ? (ghostPose.s - sInLap) / Math.max(10, Math.abs(player.speed)) * -1 : 0;
    const u = sInLap / this.track.length;
    const corner = this.track.nearestCorner(u);
    const profile = ENGINE_PROFILES[this.selection.carId];
    this.hud.update({
      position: pos, total: board.length,
      lap: Math.max(1, Math.min(player.raceLap || 1, this.race.laps)),
      lapsLabel: this.race.timeTrial ? '∞' : String(this.race.laps),
      currentLapTime: player.raceLap > 0 ? this.race.elapsed - player.lapStart : 0,
      bestLap: this.race.playerBest,
      speed: player.speed, gear: player.gear, rpm: player.rpm,
      redline: profile?.redline ?? 9000,
      damage: player.damage, delta, wet: this.track.meta.rain > 0.15,
      fps: this.fps, corner: corner ? corner.name.toUpperCase() : getTrack(this.track.id).name,
      leaderboard: board.slice(0, 9).map((r) => ({
        position: r.position, name: r.car.isPlayer ? 'YOU' : r.car.name, isPlayer: r.car.isPlayer,
        gap: r.position === 1 ? 'LEADER' : gapText(r, board[0], this.track.length),
      })),
      sectorTexts: [0, 1, 2].map((i) => `S${i + 1} ${player.sectors[i] ? player.sectors[i].toFixed(2) : '--'}`),
      sectorDone: [0, 1, 2].map((i) => player.sectors[i] != null),
    });
    this.hud.drawMinimap(
      this.track.minimapPoints(),
      board.map((r) => ({ u: wrapDistance(r.car.state.s, this.track.length) / this.track.length, isPlayer: r.car.isPlayer })),
      ghostPose ? { u: wrapDistance((player.raceLap - 1) * this.track.length + ghostPose.s, this.track.length) / this.track.length } : null,
    );
  }
}

function gapText(row, leader, length) {
  const d = signedDelta(row.car.state.s, leader.car.state.s, length);
  if (Math.abs(d) < 120) return `+${Math.abs(d).toFixed(1)}m`;
  return `+${Math.abs(d / Math.max(30, Math.abs(row.car.state.speed))).toFixed(2)}s`;
}
