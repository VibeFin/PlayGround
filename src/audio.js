/**
 * DEAD FREQUENCY — dependency-free, procedural Web Audio.
 * Call unlock() directly from a pointer/key gesture; it resolves to a boolean.
 * play() returns false when unavailable, muted, throttled, or given an unknown cue.
 * Options: volume [0, 1], pitch [0.5, 2], pan [-1, 1], distance (world units),
 * intensity [0, 1]. No sounds are queued before unlock and no settings are stored.
 * update(dtSeconds, state) reads health, wave, enemies (count or array), and phase.
 * It only shapes the ambience; callers explicitly play gameplay cues and steps.
 * The atmospheric score is on by default, with one shared volume/mute control.
 */
export function createAudio() {
  const MAX_VOICES = 24;
  const FLOOR = 0.0001;
  const LEGACY_FADER = 0.56;
  const AMBIENCE_TRIM = 0.385;
  const SIDE_GAIN = 0.55;
  const CUE_STAGING = {
    shoot: 1.713, empty: 3.708, reload: 3.653, hit: 3.43, kill: 3.935,
    hurt: 2.684, wave: 3.446, start: 3.593, buy: 3.51, step: 3.854, death: 3.674,
  };
  const CUE_BIAS = {
    shoot: 0.22, empty: -0.25, reload: -0.18, hit: 0.3, kill: -0.3,
    hurt: 0.15, wave: 0.16, start: -0.15, buy: 0.24, step: -0.28, death: 0.18,
  };
  const cooldowns = {
    shoot: 0.035, empty: 0.16, reload: 0.25, hit: 0.045, kill: 0.08,
    hurt: 0.18, wave: 1, start: 0.8, buy: 0.2, step: 0.17, death: 1,
  };
  let context = null;
  let unlocking = null;
  let disposed = false;
  let graph = null;
  let volume = 0.7;
  let muted = false;
  let noiseBuffer = null;
  let softNoiseBuffer = null;
  let ambienceLevel = 0.65;
  let tension = 0;
  const voices = new Set();
  const lastPlayed = new Map();
  const persistentNodes = [];
  const persistentSources = [];

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const number = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const random = (min, max) => min + Math.random() * (max - min);
  const keep = node => { persistentNodes.push(node); return node; };

  function target(param, value, timeConstant = 0.08) {
    param.setTargetAtTime(value, context.currentTime, timeConstant);
  }

  function applyVolume() {
    if (graph && context.state !== 'closed') {
      const now = context.currentTime;
      if (muted || volume === 0) {
        graph.master.gain.cancelScheduledValues(now);
        graph.master.gain.setValueAtTime(0, now);
      } else {
        // One linear fader for cues and ambience alike: -6.02 dB per halving.
        target(graph.master.gain, volume * LEGACY_FADER, 0.025);
      }
    }
  }

  function softClipCurve(size = 4097) {
    const knee = Math.SQRT1_2;
    const ceiling = 0.98;
    const curve = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const x = (i / (size - 1)) * 2 - 1;
      const a = Math.abs(x);
      const y = a <= knee ? a
        : knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee));
      curve[i] = x < 0 ? -y : y;
    }
    return curve;
  }

  function makeNoise(soft) {
    const length = Math.ceil(context.sampleRate * 4);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + white * 0.025) / 1.025;
      data[i] = soft ? brown * 4.5 : white;
    }
    // Smooth the loop seam, especially audible in the wind layer.
    const seam = Math.min(512, length / 2);
    for (let i = 0; i < seam; i++) {
      const fade = Math.sin(i / seam * Math.PI / 2);
      data[i] *= fade;
      data[length - 1 - i] *= fade;
    }
    return buffer;
  }

  function ambientOscillator(frequency, level, destination, pan = 0) {
    const oscillator = keep(context.createOscillator());
    const gain = keep(context.createGain());
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.value = level;
    if (pan !== 0 && typeof context.createStereoPanner === 'function') {
      const panner = keep(context.createStereoPanner());
      panner.pan.value = pan;
      oscillator.connect(gain).connect(panner).connect(destination);
    } else {
      oscillator.connect(gain).connect(destination);
    }
    persistentSources.push(oscillator);
    oscillator.start();
    return { oscillator, gain };
  }

  function ambientNoise(buffer, frequency, type, level, destination, pan = 0) {
    const source = keep(context.createBufferSource());
    const filter = keep(context.createBiquadFilter());
    const gain = keep(context.createGain());
    source.buffer = buffer;
    source.loop = true;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.45;
    gain.gain.value = level;
    if (pan !== 0 && typeof context.createStereoPanner === 'function') {
      const panner = keep(context.createStereoPanner());
      panner.pan.value = pan;
      source.connect(filter).connect(gain).connect(panner).connect(destination);
    } else {
      source.connect(filter).connect(gain).connect(destination);
    }
    persistentSources.push(source);
    source.start(0, random(0, 3));
    return { filter, gain };
  }

  function buildGraph() {
    noiseBuffer = makeNoise(false);
    softNoiseBuffer = makeNoise(true);
    const master = keep(context.createGain());
    const limiter = keep(context.createDynamicsCompressor());
    const shaper = keep(context.createWaveShaper());
    const effects = keep(context.createGain());
    const ambient = keep(context.createGain());
    const highpass = keep(context.createBiquadFilter());
    const delay = keep(context.createDelay(0.5));
    const echoFilter = keep(context.createBiquadFilter());
    const feedback = keep(context.createGain());
    const wet = keep(context.createGain());
    limiter.threshold.value = -3;
    limiter.knee.value = 6;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.0015;
    limiter.release.value = 0.1;
    shaper.curve = softClipCurve();
    shaper.oversample = '2x';
    master.gain.value = muted ? 0 : volume * LEGACY_FADER;
    ambient.gain.value = 0;
    effects.gain.value = 0.85;
    highpass.type = 'highpass';
    highpass.frequency.value = 28;
    highpass.Q.value = 0.5;
    effects.connect(highpass);
    ambient.connect(highpass);
    // Fader first so the ceiling stays reachable at any volume, then limiter.
    highpass.connect(master).connect(limiter).connect(shaper).connect(context.destination);
    // Dark, short station reflections, kept off the continuous ambience.
    delay.delayTime.value = 0.137;
    echoFilter.type = 'lowpass';
    echoFilter.frequency.value = 1300;
    feedback.gain.value = 0.17;
    wet.gain.value = 0.12;
    delay.connect(echoFilter).connect(wet);
    echoFilter.connect(feedback).connect(delay);
    if (typeof context.createStereoPanner === 'function') {
      const wetPan = keep(context.createStereoPanner());
      wetPan.pan.value = 0.3;
      wet.connect(wetPan).connect(highpass);
    } else {
      wet.connect(highpass);
    }
    graph = { master, effects, ambient, delay };
    const drone = ambientOscillator(55, 0.042, ambient, -0.32);
    ambientOscillator(82.47, 0.016, ambient, 0.38);
    const wind = ambientNoise(softNoiseBuffer, 440, 'lowpass', 0.09, ambient, -0.45);
    ambientNoise(noiseBuffer, 760, 'bandpass', 0.006, ambient, 0.4);
    // Slow wind and beating drone: no piercing carrier, repetitive melody or hiss.
    ambientOscillator(0.071, 0.024, wind.gain.gain);
    ambientOscillator(0.043, 0.008, drone.gain.gain);
    graph.wind = wind;
    target(ambient.gain, ambienceLevel * AMBIENCE_TRIM, 1.8);
    applyVolume();
  }

  function unlock() {
    if (disposed) return Promise.resolve(false);
    if (unlocking) return unlocking;
    try {
      if (!context) {
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContextClass) return Promise.resolve(false);
        context = new AudioContextClass({ latencyHint: 'interactive' });
      }
      if (context.state === 'closed') return Promise.resolve(false);
      // Invoke resume synchronously in the gesture stack, before any await.
      const resumed = context.state === 'running' ? undefined : context.resume();
      unlocking = Promise.resolve(resumed).then(() => {
        if (disposed || context.state !== 'running') return false;
        if (!graph) buildGraph();
        return true;
      }).catch(() => {
        // Failed initialization is retryable on the next gesture.
        if (graph || persistentNodes.length) releaseGraph();
        return false;
      }).finally(() => { unlocking = null; });
      return unlocking;
    } catch {
      return Promise.resolve(false);
    }
  }

  function setVolume(value) {
    volume = clamp(number(value, volume), 0, 1);
    applyVolume();
  }

  function setMuted(value) {
    muted = Boolean(value);
    applyVolume();
  }

  function removeVoice(voice, immediate = false) {
    if (!voices.delete(voice)) return;
    for (const source of voice.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* Already stopped. */ }
    }
    for (const node of voice.nodes) node.disconnect();
    if (immediate) voice.sources.length = 0;
  }

  function makeVoice(options, name) {
    // Low-priority feet must never steal a gunshot or a wave sting.
    if (voices.size >= MAX_VOICES) {
      if (name === 'step' || name === 'empty') return null;
      removeVoice(voices.values().next().value, true);
    }
    const output = context.createGain();
    const distance = Math.max(0, number(options.distance, 0));
    output.gain.value = clamp(number(options.volume, 1), 0, 1)
      / (1 + distance * 0.09) * (CUE_STAGING[name] ?? 1);
    const voice = {
      sources: [], nodes: [output], output, pending: 0,
      pitch: clamp(number(options.pitch, 1), 0.5, 2) * random(0.997, 1.003),
      intensity: clamp(number(options.intensity, 1), 0, 1),
      time: context.currentTime + 0.005, end: context.currentTime,
    };
    if (typeof context.createStereoPanner === 'function') {
      const pan = clamp(
        (CUE_BIAS[name] ?? 0) + random(-0.08, 0.08) + number(options.pan, 0), -1, 1,
      );
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      output.connect(panner).connect(graph.effects);
      voice.nodes.push(panner);
      // Fixed short high-band copy on the far side: decorrelates the image
      // without letting low tones comb-filter themselves.
      const sideFilter = context.createBiquadFilter();
      const sideDelay = context.createDelay(0.05);
      const sideGain = context.createGain();
      const sidePanner = context.createStereoPanner();
      sideFilter.type = 'highpass';
      sideFilter.frequency.value = 700;
      sideFilter.Q.value = 0.7;
      sideDelay.delayTime.value = 0.0055;
      sideGain.gain.value = SIDE_GAIN;
      sidePanner.pan.value = -pan;
      output.connect(sideFilter).connect(sideDelay).connect(sideGain)
        .connect(sidePanner).connect(graph.effects);
      voice.nodes.push(sideFilter, sideDelay, sideGain, sidePanner);
    } else {
      output.connect(graph.effects);
    }
    // Only environmental/pitched cues send to reflections; footsteps stay dry.
    if (name !== 'step' && name !== 'empty') output.connect(graph.delay);
    voices.add(voice);
    return voice;
  }

  function layer(voice, source, { at = 0, duration = 0.15, gain = 0.2, attack = 0.003,
    filter = null, frequency = 1000, q = 0.7 } = {}) {
    const start = voice.time + at;
    const end = start + duration;
    const envelope = context.createGain();
    envelope.gain.value = 0;
    voice.nodes.push(source, envelope);
    voice.sources.push(source);
    let input = source;
    if (filter) {
      const toneFilter = context.createBiquadFilter();
      toneFilter.type = filter;
      toneFilter.frequency.value = frequency;
      toneFilter.Q.value = q;
      source.connect(toneFilter);
      voice.nodes.push(toneFilter);
      input = toneFilter;
    }
    input.connect(envelope).connect(voice.output);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(Math.max(FLOOR, gain), start + attack);
    envelope.gain.exponentialRampToValueAtTime(FLOOR, end);
    envelope.gain.linearRampToValueAtTime(0, end + 0.008);
    voice.pending++;
    voice.end = Math.max(voice.end, end + 0.02);
    source.onended = () => {
      voice.pending--;
      if (voice.pending === 0) removeVoice(voice);
    };
    source.start(start, ...(source.buffer ? [random(0, 2)] : []));
    source.stop(end + 0.015);
  }

  function tone(voice, frequency, to, settings = {}) {
    const oscillator = context.createOscillator();
    oscillator.type = settings.type || 'sine';
    const start = voice.time + (settings.at || 0);
    oscillator.frequency.setValueAtTime(frequency * voice.pitch, start);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, to * voice.pitch), start + (settings.duration || 0.15),
    );
    layer(voice, oscillator, settings);
  }

  function noise(voice, settings = {}) {
    const source = context.createBufferSource();
    source.buffer = settings.soft ? softNoiseBuffer : noiseBuffer;
    source.loop = true;
    source.playbackRate.value = voice.pitch * random(0.93, 1.07);
    layer(voice, source, settings);
  }

  function metallic(voice, at, pitch = 1, gain = 0.1) {
    noise(voice, { at, duration: 0.045, gain, filter: 'highpass', frequency: 1800 });
    tone(voice, 1650 * pitch, 620 * pitch, {
      at, duration: 0.075, gain: gain * 0.36, type: 'triangle',
    });
  }

  const cues = {
    shoot(voice) {
      const strength = 0.7 + voice.intensity * 0.3;
      tone(voice, random(145, 175), 42, { duration: 0.2, gain: 0.68 * strength });
      noise(voice, { duration: 0.115, gain: 0.68 * strength, filter: 'lowpass', frequency: 4600 });
      noise(voice, { at: 0.018, duration: 0.31, gain: 0.23, soft: true,
        filter: 'lowpass', frequency: 820 });
      metallic(voice, 0.042, 0.8, 0.07);
    },
    empty(voice) { metallic(voice, 0, 0.75, 0.12); },
    reload(voice) {
      metallic(voice, 0, 0.8, 0.13);
      noise(voice, { at: 0.14, duration: 0.19, gain: 0.12, filter: 'bandpass', frequency: 1300 });
      tone(voice, 180, 75, { at: 0.52, duration: 0.095, gain: 0.18 });
      metallic(voice, 0.53, 0.68, 0.2);
      metallic(voice, 0.77, 1.15, 0.13);
    },
    hit(voice) {
      noise(voice, { duration: 0.055, gain: 0.16, filter: 'bandpass', frequency: 1900 });
      tone(voice, 780, 420, { duration: 0.085, gain: 0.14, type: 'triangle' });
    },
    kill(voice) {
      tone(voice, 440, 330, { duration: 0.17, gain: 0.16, type: 'triangle' });
      tone(voice, 880, 660, { at: 0.045, duration: 0.24, gain: 0.1 });
      noise(voice, { duration: 0.08, gain: 0.09, filter: 'lowpass', frequency: 1800 });
    },
    hurt(voice) {
      tone(voice, 110, 38, { duration: 0.36, gain: 0.46 });
      noise(voice, { duration: 0.23, gain: 0.2, filter: 'lowpass', frequency: 900 });
      tone(voice, 64, 48, { at: 0.16, duration: 0.22, gain: 0.19 });
    },
    wave(voice) {
      tone(voice, 110, 108, { duration: 1.5, attack: 0.13, gain: 0.23, type: 'triangle',
        filter: 'lowpass', frequency: 620 });
      tone(voice, 164.81, 146.83, { at: 0.28, duration: 1.35, attack: 0.16, gain: 0.14 });
      noise(voice, { duration: 0.85, attack: 0.16, gain: 0.13, filter: 'bandpass', frequency: 660 });
      metallic(voice, 0.05, 0.5, 0.08);
    },
    start(voice) {
      noise(voice, { duration: 0.42, gain: 0.12, filter: 'bandpass', frequency: 950 });
      [220, 329.63, 440].forEach((frequency, index) => {
        tone(voice, frequency, frequency * 0.998, {
          at: 0.1 + index * 0.14, duration: 0.6, attack: 0.012, gain: 0.12,
        });
      });
      tone(voice, 70, 55, { duration: 0.8, attack: 0.03, gain: 0.22 });
    },
    buy(voice) {
      metallic(voice, 0, 1.1, 0.08);
      tone(voice, 523.25, 523.25, { at: 0.025, duration: 0.17, gain: 0.15 });
      tone(voice, 783.99, 783.99, { at: 0.14, duration: 0.3, gain: 0.12 });
    },
    step(voice) {
      const weight = random(0.8, 1) * (0.45 + voice.intensity * 0.55);
      noise(voice, { duration: 0.115, gain: 0.16 * weight, soft: true,
        filter: 'lowpass', frequency: 680 });
      noise(voice, { at: 0.025, duration: 0.095, gain: 0.06 * weight,
        filter: 'bandpass', frequency: random(800, 1300) });
      tone(voice, random(90, 120), 48, { duration: 0.085, gain: 0.12 * weight });
    },
    death(voice) {
      tone(voice, 130, 30, { duration: 1.9, attack: 0.012, gain: 0.35 });
      tone(voice, 293.66, 49, { at: 0.08, duration: 2.3, attack: 0.04,
        gain: 0.15, type: 'triangle', filter: 'lowpass', frequency: 650 });
      noise(voice, { duration: 1.6, attack: 0.05, gain: 0.17,
        filter: 'bandpass', frequency: 650 });
    },
  };

  function play(name, options = {}) {
    if (disposed || !graph || context.state !== 'running' || muted || volume === 0 ||
      !Object.hasOwn(cues, name)) return false;
    options = options && typeof options === 'object' ? options : {};
    if (options.volume === 0) return false;
    const now = context.currentTime;
    if (now - (lastPlayed.get(name) ?? -Infinity) < cooldowns[name]) return false;
    let voice;
    try {
      voice = makeVoice(options, name);
      if (!voice) return false;
      cues[name](voice);
      lastPlayed.set(name, now);
      return true;
    } catch {
      if (voice) removeVoice(voice, true);
      return false;
    }
  }

  function update(dt, state = {}) {
    if (disposed) return;
    state = state && typeof state === 'object' ? state : {};
    const delta = clamp(number(dt, 0), 0, 1);
    const health = clamp(number(state.health, 100), 0, 100);
    const wave = clamp(number(state.wave, 0), 0, 50);
    const enemies = Array.isArray(state.enemies) ? state.enemies.length : number(state.enemies, 0);
    const dead = health <= 0 || ['dead', 'death', 'gameover', 'game-over'].includes(state.phase);
    const quiet = ['menu', 'paused', 'intermission', 'break', 'waiting'].includes(state.phase);
    const desiredTension = dead || quiet ? 0 : clamp(
      (1 - health / 100) * 0.45 + Math.min(Math.max(enemies, 0), 20) * 0.018 + wave * 0.008, 0, 1,
    );
    const blend = 1 - Math.exp(-delta / 2.5);
    tension += (desiredTension - tension) * blend;
    ambienceLevel += ((dead ? 0.3 : quiet ? 0.6 : 0.72) - ambienceLevel) * blend;
    if (!graph || context.state !== 'running') return;
    target(graph.ambient.gain, (ambienceLevel + tension * 0.12) * AMBIENCE_TRIM, 0.8);
    target(graph.wind.filter.frequency, 440 + tension * 260, 1.2);
    // onended normally owns cleanup; this also handles delayed background events.
    for (const voice of voices) {
      if (context.currentTime > voice.end + 0.1) removeVoice(voice, true);
    }
  }

  function releaseGraph() {
    for (const voice of voices) removeVoice(voice, true);
    for (const source of persistentSources) {
      try { source.stop(); } catch { /* Already stopped. */ }
    }
    for (const node of persistentNodes) node.disconnect();
    persistentSources.length = 0;
    persistentNodes.length = 0;
    lastPlayed.clear();
    noiseBuffer = null;
    softNoiseBuffer = null;
    graph = null;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    releaseGraph();
    if (context && context.state !== 'closed') {
      try { Promise.resolve(context.close()).catch(() => {}); } catch { /* Unavailable context. */ }
    }
  }

  return { unlock, setVolume, setMuted, update, play, dispose };
}
