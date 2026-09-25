// touch.js — mobile / touch controls for HUMAN play only.
//
// HARNESS TRANSPARENCY: initTouch() creates ZERO DOM and registers ZERO
// listeners when G.harness is set (same gating pattern as ui.js). The state
// object it returns stays neutral ({ stickActive: false, ... }) so the
// pollInput() merge in main.js is a no-op and bit-identical under harness,
// moment and session boots.
//
// Layout (only built lazily on first touch, so desktops never see it):
//   left-bottom  — virtual stick: drag to pitch + yaw (mouse-steer equivalent)
//   left-top     — ROLL ◀ / ▶ hold buttons (bank without a keyboard)
//   top-right    — TILT toggle + ◎ re-center: gyro/accelerometer steering
//   right-bottom — FIRE (big, hold), BOOST (hold), BRAKE (hold), JUMP (tap)
//   right-mid    — THRUST vertical slider (cruise default, persists per run)
// All controls are multi-touch: each zone tracks its own touch identifier.

export function initTouch(G) {
  const state = {
    active: false,       // true once DOM has been built (a real touch happened)
    stickActive: false,
    stickPitch: 0,       // -1..1 (positive = nose down, matches input.pitch sign)
    stickYaw: 0,         // -1..1 (positive = yaw left, matches input.yaw sign)
    rollLeft: false,
    rollRight: false,
    fire: false,
    boost: false,
    brake: false,
    thrust: null,        // null = no override (desktop default path);  -0.25..1 once touched
    tiltEnabled: false,  // persisted preference; tiltActive below is the live signal
    tiltActive: false,   // enabled AND fresh sensor data — the only flag the sim reads
    tiltPitch: 0,        // -1..1, same sign convention as the stick
    tiltYaw: 0,
    jumpRequested: false, // edge-triggered hyper jump (consumed in main.js tick)
  };
  G.touch = state;

  if (G.harness) return state;

  const LS_TILT = 'iridium-reach.tilt';
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(LS_TILT) === '1') {
      state.tiltEnabled = true;
    }
  } catch (e) { /* corrupted storage: stay off */ }
  const saveTilt = () => {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(LS_TILT, state.tiltEnabled ? '1' : '0'); } catch (e) {}
  };

  const coarse = (() => {
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    } catch (e) {}
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  })();

  // Non-touch desktops: nothing to build, nothing to listen for.
  // (Hybrid laptops still work: first touchstart below builds the DOM.)
  let built = false;
  let els = null;
  let stickId = null, stickCX = 0, stickCY = 0;
  let fireId = null, boostId = null, brakeId = null;
  let rollLId = null, rollRId = null;
  let thrustId = null;

  const STICK_R = 52; // px deflection radius

  function build() {
    if (built) return;
    built = true;
    state.active = true;

    const style = document.createElement('style');
    style.textContent = `
#ir-touch { position: fixed; inset: 0; z-index: 35; pointer-events: none;
  font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
  -webkit-user-select: none; user-select: none; touch-action: none; }
#ir-touch.hidden { display: none !important; }
#ir-touch .ir-stick { position: absolute; left: 22px; bottom: calc(22px + env(safe-area-inset-bottom, 0px));
  width: 132px; height: 132px; border-radius: 50%; pointer-events: auto; touch-action: none;
  border: 1px solid rgba(255,206,150,0.35); background: rgba(13,11,9,0.42); }
#ir-touch .ir-stick .ir-nub { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px;
  border-radius: 50%; transform: translate(-50%,-50%);
  border: 1px solid rgba(255,162,60,0.9); background: rgba(255,162,60,0.22); }
#ir-touch .ir-stick .ir-lab { position: absolute; left: 0; right: 0; bottom: -18px; text-align: center;
  font-size: 9px; font-weight: 700; letter-spacing: 0.22em; color: rgba(246,236,224,0.5); }
#ir-touch .ir-roll { position: absolute; left: 22px; bottom: calc(168px + env(safe-area-inset-bottom, 0px));
  display: flex; gap: 10px; pointer-events: auto; }
#ir-touch .ir-tbtn { pointer-events: auto; touch-action: none;
  min-width: 62px; padding: 12px 10px; text-align: center;
  border: 1px solid rgba(255,206,150,0.30); background: rgba(13,11,9,0.55);
  color: #ffe6c8; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; }
#ir-touch .ir-tbtn.on { border-color: rgba(255,162,60,0.9); background: rgba(255,162,60,0.25); color: #fff3e0; }
#ir-touch .ir-actions { position: absolute; right: 22px; bottom: calc(22px + env(safe-area-inset-bottom, 0px));
  display: flex; align-items: flex-end; gap: 12px; pointer-events: none; }
#ir-touch .ir-col { display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
#ir-touch .ir-fire { width: 92px; height: 92px; border-radius: 50%; pointer-events: auto; touch-action: none;
  border: 1px solid rgba(255,178,86,0.95); background: rgba(255,162,60,0.22);
  color: #fff3e0; font-size: 12px; font-weight: 800; letter-spacing: 0.12em; }
#ir-touch .ir-fire.on { background: rgba(255,162,60,0.45); }
#ir-touch .ir-thrust { pointer-events: auto; touch-action: none;
  width: 52px; height: 150px; border: 1px solid rgba(255,206,150,0.30); background: rgba(13,11,9,0.55);
  position: relative; }
#ir-touch .ir-thrust .ir-fill { position: absolute; left: 0; right: 0; bottom: 0;
  background: rgba(255,162,60,0.35); height: 60%; }
#ir-touch .ir-thrust .ir-th { position: absolute; left: -4px; right: -4px; height: 14px;
  background: #ffa23c; }
#ir-touch .ir-thrust .ir-tlab { position: absolute; left: 0; right: 0; top: -18px; text-align: center;
  font-size: 8.5px; font-weight: 700; letter-spacing: 0.2em; color: rgba(246,236,224,0.5); }
#ir-touch .ir-sys { position: absolute; right: 22px; top: calc(12px + env(safe-area-inset-top, 0px));
  display: flex; gap: 10px; pointer-events: auto; }
#ir-touch .ir-sys .ir-tbtn { min-width: 0; }
#ir-touch #ir-t-recenter.hidden { display: none !important; }
`;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'ir-touch';
    root.className = 'hidden';
    root.innerHTML = `
      <div class="ir-roll">
        <div class="ir-tbtn" id="ir-t-rolll">◀ ROLL</div>
        <div class="ir-tbtn" id="ir-t-rollr">ROLL ▶</div>
      </div>
      <div class="ir-sys">
        <div class="ir-tbtn hidden" id="ir-t-recenter" title="Re-center tilt">◎</div>
        <div class="ir-tbtn" id="ir-t-tilt">TILT OFF</div>
      </div>
      <div class="ir-stick" id="ir-t-stick"><div class="ir-nub" id="ir-t-nub"></div><div class="ir-lab">STEER</div></div>
      <div class="ir-actions">
        <div class="ir-thrust" id="ir-t-thrust"><div class="ir-tlab">THRUST</div><div class="ir-fill" id="ir-t-fill"></div><div class="ir-th" id="ir-t-th"></div></div>
        <div class="ir-col">
          <div class="ir-tbtn" id="ir-t-jump">JUMP</div>
          <div class="ir-tbtn" id="ir-t-brake">BRAKE</div>
          <div class="ir-tbtn" id="ir-t-boost">BOOST</div>
        </div>
        <button class="ir-fire" id="ir-t-fire">FIRE</button>
      </div>`;
    document.body.appendChild(root);

    const $ = (id) => root.querySelector('#' + id);
    els = {
      root, stick: $('ir-t-stick'), nub: $('ir-t-nub'),
      rollL: $('ir-t-rolll'), rollR: $('ir-t-rollr'),
      fire: $('ir-t-fire'), boost: $('ir-t-boost'), brake: $('ir-t-brake'),
      thrust: $('ir-t-thrust'), fill: $('ir-t-fill'), th: $('ir-t-th'),
      tilt: $('ir-t-tilt'), recenter: $('ir-t-recenter'),
      jump: $('ir-t-jump'),
    };

    const setNub = (dx, dy) => {
      els.nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    const stickCenter = () => {
      const r = els.stick.getBoundingClientRect();
      stickCX = r.left + r.width / 2;
      stickCY = r.top + r.height / 2;
    };
    const stickMove = (t) => {
      let dx = t.clientX - stickCX, dy = t.clientY - stickCY;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R) { dx = dx / len * STICK_R; dy = dy / len * STICK_R; }
      setNub(dx, dy);
      // screen drag right = yaw right = negative input.yaw (desktop: -mouseDX);
      // drag down = nose down = positive input.pitch (desktop: -mouseDY w/ invY off
      // gives negative on upward mouse motion — stick follows finger directly).
      state.stickYaw = -dx / STICK_R;
      state.stickPitch = dy / STICK_R;
      state.stickActive = true;
    };
    const stickEnd = () => {
      stickId = null;
      state.stickActive = false;
      state.stickPitch = 0; state.stickYaw = 0;
      setNub(0, 0);
    };

    els.stick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      stickCenter();
      const t = e.changedTouches[0];
      stickId = t.identifier;
      stickMove(t);
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      if (stickId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { e.preventDefault(); stickMove(t); }
      }
    }, { passive: false });
    const endStick = (e) => {
      if (stickId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) stickEnd();
      }
    };
    window.addEventListener('touchend', endStick);
    window.addEventListener('touchcancel', endStick);

    const holdBtn = (el, set) => {
      el.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        set(true); el.classList.add('on');
      }, { passive: false });
      const off = (e) => {
        for (const t of e.changedTouches) {
          void t;
          set(false); el.classList.remove('on');
        }
      };
      el.addEventListener('touchend', off);
      el.addEventListener('touchcancel', off);
    };
    holdBtn(els.fire, (v) => { state.fire = v; if (v) fireId = true; else fireId = null; });
    holdBtn(els.boost, (v) => { state.boost = v; });
    holdBtn(els.brake, (v) => { state.brake = v; });
    // hyper jump is edge-triggered: the tap latches until main.js tick
    // consumes it (a mid-fight tap is dropped there, never queued).
    els.jump.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      state.jumpRequested = true;
      els.jump.classList.add('on');
      setTimeout(() => els.jump.classList.remove('on'), 300);
    }, { passive: false });
    holdBtn(els.rollL, (v) => { state.rollLeft = v; });
    holdBtn(els.rollR, (v) => { state.rollRight = v; });

    // thrust slider: vertical drag, top = full (1), bottom = brake-thrust (-0.25)
    const THRUST_MIN = -0.25, THRUST_MAX = 1.0;
    const paintThrust = () => {
      const v = state.thrust === null ? 0.6 : state.thrust;
      const f = (v - THRUST_MIN) / (THRUST_MAX - THRUST_MIN);
      els.fill.style.height = (f * 100).toFixed(1) + '%';
      els.th.style.bottom = `calc(${(f * 100).toFixed(1)}% - 7px)`;
    };
    const thrustMove = (t) => {
      const r = els.thrust.getBoundingClientRect();
      const f = 1 - (t.clientY - r.top) / r.height;
      const c = Math.min(1, Math.max(0, f));
      state.thrust = Math.round((THRUST_MIN + c * (THRUST_MAX - THRUST_MIN)) * 100) / 100;
      paintThrust();
    };
    els.thrust.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      thrustId = e.changedTouches[0].identifier;
      thrustMove(e.changedTouches[0]);
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      if (thrustId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === thrustId) { e.preventDefault(); thrustMove(t); }
      }
    }, { passive: false });
    const endThrust = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === thrustId) thrustId = null;
      }
    };
    window.addEventListener('touchend', endThrust);
    window.addEventListener('touchcancel', endThrust);
    paintThrust();

    // ---- tilt steering: gyro (deviceorientation) with accelerometer fallback ----
    // HOLD THE PHONE LIKE A YOKE: tilting the top away dives the nose, rolling
    // the device banks into a turn. Enabling calibrates the CURRENT attitude as
    // center on the next sensor sample, so it works in any seat/pose; ◎
    // re-centers without toggling. The stick keeps working alongside tilt and
    // the two add, like two hands on one yoke.
    const TILT_RANGE = 25;   // degrees of tilt from center => full deflection
    const TILT_DEAD = 0.06;  // deadzone after normalisation
    const TILT_G_GAIN = 2.5; // accelerometer: sin(23deg) ~= 0.39 => ~full stick
    let tiltBaseO = null;    // { beta, gamma } gyro calibration point
    let tiltBaseA = null;    // { x, y } accelerometer calibration point
    let tiltNeedCal = true;
    let tiltSawGyro = false;
    let lastTiltT = 0;
    const clamp01 = (v) => Math.min(1, Math.max(-1, v));

    const screenAngle360 = () => {
      try {
        if (window.screen && window.screen.orientation &&
            typeof window.screen.orientation.angle === 'number') {
          return ((window.screen.orientation.angle % 360) + 360) % 360;
        }
      } catch (e) {}
      const o = window.orientation;
      return typeof o === 'number' ? ((o % 360) + 360) % 360 : 0;
    };

    const pushTilt = (pitch, yaw) => {
      const dz = (v) => {
        const a = Math.abs(v);
        if (a < TILT_DEAD) return 0;
        return (v > 0 ? 1 : -1) * Math.min(1, (a - TILT_DEAD) / (1 - TILT_DEAD));
      };
      state.tiltPitch = dz(clamp01(pitch));
      state.tiltYaw = dz(clamp01(yaw));
      state.tiltActive = true;
      lastTiltT = performance.now();
    };

    // rotate a device-frame (x = left-right lean, y = front-back lean) pair
    // into screen-frame lean, so landscape players get the same yoke feel
    const toScreenLean = (x, y) => {
      const a = screenAngle360();
      if (a === 90) return [y, -x];
      if (a === 270) return [-y, x];
      if (a === 180) return [-x, -y];
      return [x, y];
    };

    window.addEventListener('deviceorientation', (e) => {
      if (!state.tiltEnabled) return;
      if (e.beta === null || e.beta === undefined ||
          e.gamma === null || e.gamma === undefined) return;
      if (tiltNeedCal) {
        tiltBaseO = { beta: e.beta, gamma: e.gamma };
        tiltNeedCal = false;
      }
      if (!tiltBaseO) return;
      tiltSawGyro = true;
      // portrait lean: x = gamma (roll), y = beta (pitch-away)
      const [sx, sy] = toScreenLean(e.gamma - tiltBaseO.gamma, e.beta - tiltBaseO.beta);
      // lean right (sx+) yaws right = negative input.yaw (stick convention);
      // lean top-away (sy+) dives = positive input.pitch
      pushTilt(sy / TILT_RANGE, -sx / TILT_RANGE);
    }, { passive: true });

    window.addEventListener('devicemotion', (e) => {
      // accelerometer fallback: only while the gyro has never delivered. The
      // gravity vector (via accelerationIncludingGravity, which points UP in
      // device frame) leans against the calibrated hold attitude.
      if (!state.tiltEnabled || tiltSawGyro) return;
      const g = e.accelerationIncludingGravity;
      if (!g || g.x === null || g.x === undefined ||
          g.y === null || g.y === undefined) return;
      if (tiltNeedCal) {
        tiltBaseA = { x: g.x, y: g.y };
        tiltNeedCal = false;
      }
      if (!tiltBaseA) return;
      const [sx, sy] = toScreenLean(g.x - tiltBaseA.x, g.y - tiltBaseA.y);
      // leaning top-away drops ay (sy-) => nose down (pitch+); leaning right
      // drops ax (sx-) => yaw right (yaw-)
      pushTilt(-sy / 9.81 * TILT_G_GAIN, sx / 9.81 * TILT_G_GAIN);
    }, { passive: true });

    const paintTilt = () => {
      els.tilt.textContent = state.tiltEnabled ? 'TILT ON' : 'TILT OFF';
      els.tilt.classList.toggle('on', state.tiltEnabled);
      els.recenter.classList.toggle('hidden', !state.tiltEnabled);
    };

    async function setTilt(on) {
      if (on && !state.tiltEnabled) {
        // iOS requires an explicit user gesture to unlock motion sensors —
        // this tap IS that gesture, so request here, not at build time.
        try {
          const DOE = window.DeviceOrientationEvent;
          if (DOE && typeof DOE.requestPermission === 'function') {
            if (await DOE.requestPermission() !== 'granted') return;
          }
          const DME = window.DeviceMotionEvent;
          if (DME && typeof DME.requestPermission === 'function') {
            try { await DME.requestPermission(); } catch (err) {}
          }
        } catch (err) { return; }
        tiltNeedCal = true; // next sample becomes center, wherever the hands are
      }
      state.tiltEnabled = on;
      if (!on) {
        state.tiltActive = false;
        state.tiltPitch = 0; state.tiltYaw = 0;
        tiltBaseO = null; tiltBaseA = null; tiltSawGyro = false;
      }
      saveTilt();
      paintTilt();
    }

    // click (not touchstart): Safari counts the tap as the permission gesture
    els.tilt.addEventListener('click', (e) => {
      e.stopPropagation();
      setTilt(!state.tiltEnabled);
    });
    els.recenter.addEventListener('click', (e) => {
      e.stopPropagation();
      tiltNeedCal = true; // re-center on the next sample, stay enabled
      els.recenter.classList.add('on');
      setTimeout(() => els.recenter.classList.remove('on'), 250);
    });
    if (state.tiltEnabled) tiltNeedCal = true; // restored pref: calibrate on first sample
    paintTilt();

    // visibility follows the UI state machine (running = flying).
    // Also retires a stale tilt signal (sensor stream cut = hands off the yoke).
    const sync = () => {
      const flying = G.uiState === 'running';
      els.root.classList.toggle('hidden', !flying);
      if (state.tiltActive && performance.now() - lastTiltT > 2000) {
        state.tiltActive = false;
        state.tiltPitch = 0; state.tiltYaw = 0;
      }
    };
    setInterval(sync, 200);
    sync();
  }

  if (coarse) {
    // Coarse-pointer device: build on demand is still fine, but building now
    // avoids a first-touch hitch. Still gated on !harness (see above).
    build();
  } else {
    // Hybrid laptop: wait for a real touch before injecting any DOM.
    window.addEventListener('touchstart', function once() {
      window.removeEventListener('touchstart', once);
      build();
    }, { passive: true });
  }

  return state;
}
