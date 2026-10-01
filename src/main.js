import './style.css';
import { createIcons, ArrowUpRight, ArrowRight, VolumeX, Volume2, CircleHelp, Flag, Scan, Users, Sun, Cloud, Moon, Shield, Pause, Zap, X, Trophy, Rocket, Crosshair } from 'lucide';
import { DerbyScene, CARS, ARENAS } from './scene.js';
import { WEAPON_STATS } from './weapons.js';

const $ = (selector) => document.querySelector(selector);
const icons = { ArrowUpRight, ArrowRight, VolumeX, Volume2, CircleHelp, Flag, Scan, Users, Sun, Cloud, Moon, Shield, Pause, Zap, X, Trophy, Rocket, Crosshair };
const iconize = () => createIcons({ icons });
const miniCar = '<span class="mini-wheel"></span><span class="mini-wheel"></span>';
$('#mini-car').innerHTML = miniCar;
iconize();

let game;
let countdownTimer;
let toastTimer;
let currentModal = '';
let soundEnabled = false;
let audio;
let lastHudUpdate = 0;
let hitTimer;
let flashTimer;
let lastTakedownAt = 0;
let records = [];
try { records = JSON.parse(localStorage.getItem('wreckyard-records') || '[]'); } catch { records = []; }

class DerbyAudio {
  constructor() {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.context.createGain(); this.master.gain.value = .2; this.master.connect(this.context.destination);
    this.engine = this.context.createOscillator(); this.engine.type = 'sawtooth';
    this.engineGain = this.context.createGain(); this.engineGain.gain.value = 0;
    this.filter = this.context.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 350;
    this.engine.connect(this.filter); this.filter.connect(this.engineGain); this.engineGain.connect(this.master); this.engine.start();
  }
  enable(value) { this.context.resume(); this.master.gain.setTargetAtTime(value ? .2 : 0, this.context.currentTime, .1); }
  update(speed, active, boost) {
    this.engine.frequency.setTargetAtTime(35 + Math.abs(speed) * 3 + (boost ? 35 : 0), this.context.currentTime, .08);
    this.engineGain.gain.setTargetAtTime(active ? .17 + Math.abs(speed) * .004 : 0, this.context.currentTime, .1);
    this.filter.frequency.setTargetAtTime(220 + Math.abs(speed) * 22, this.context.currentTime, .08);
  }
  impact(strength) {
    const buffer = this.context.createBuffer(1, this.context.sampleRate * .3, this.context.sampleRate);
    const values = buffer.getChannelData(0);
    for (let i = 0; i < values.length; i++) values[i] = (Math.random() * 2 - 1) * (1 - i / values.length);
    const noise = this.context.createBufferSource(); noise.buffer = buffer;
    const gain = this.context.createGain(); gain.gain.value = Math.min(.9, strength / 24);
    const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1200;
    noise.connect(filter); filter.connect(gain); gain.connect(this.master); noise.start();
    noise.onended = () => { noise.disconnect(); gain.disconnect(); filter.disconnect(); };
  }
  weapon(type, player = true) {
    const rocket = type === 'rocket', duration = rocket ? .32 : .075;
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
    const values = buffer.getChannelData(0);
    for (let i = 0; i < values.length; i++) values[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / values.length, rocket ? .6 : 2);
    const noise = this.context.createBufferSource(); noise.buffer = buffer;
    const filter = this.context.createBiquadFilter(); filter.type = rocket ? 'lowpass' : 'bandpass'; filter.frequency.value = rocket ? 650 : 1800;
    const gain = this.context.createGain(); gain.gain.value = (rocket ? .8 : .4) * (player ? 1 : .25);
    noise.connect(filter); filter.connect(gain); gain.connect(this.master); noise.start();
    noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  explosion(distance, wreck = false) {
    const now = this.context.currentTime, duration = wreck ? 1.35 : .95;
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
    const values = buffer.getChannelData(0);
    for (let i = 0; i < values.length; i++) values[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / values.length, 1.7);
    const noise = this.context.createBufferSource(); noise.buffer = buffer;
    const filter = this.context.createBiquadFilter(); filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, now); filter.frequency.exponentialRampToValueAtTime(90, now + duration);
    const gain = this.context.createGain(); gain.gain.value = (wreck ? 1.3 : .8) * Math.max(.12, 1 - distance / 55);
    noise.connect(filter); filter.connect(gain); gain.connect(this.master); noise.start();
    const bass = this.context.createOscillator(), bassGain = this.context.createGain();
    bass.frequency.setValueAtTime(wreck ? 75 : 90, now); bass.frequency.exponentialRampToValueAtTime(24, now + .7);
    bassGain.gain.setValueAtTime(gain.gain.value * .65, now); bassGain.gain.exponentialRampToValueAtTime(.001, now + .85);
    bass.connect(bassGain); bassGain.connect(this.master); bass.start(); bass.stop(now + .9);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
    bass.onended = () => { bass.disconnect(); bassGain.disconnect(); };
  }
  beep(final = false) {
    const osc = this.context.createOscillator(); const gain = this.context.createGain();
    osc.frequency.value = final ? 660 : 440; gain.gain.value = .18;
    osc.connect(gain); gain.connect(this.master);
    gain.gain.exponentialRampToValueAtTime(.001, this.context.currentTime + .25);
    osc.start(); osc.stop(this.context.currentTime + .27);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
}

function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.remove('hidden');
  toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 2400);
}

function openModal(content, type) {
  currentModal = type; $('#modal').innerHTML = content;
  $('#modal-backdrop').classList.remove('hidden'); iconize();
  $('#modal').querySelector('.modal-close')?.addEventListener('click', closeModal);
  const firstButton = $('#modal').querySelector('button');
  firstButton?.focus({ preventScroll: true });
}

function closeModal() {
  if (currentModal === 'result') return;
  $('#modal-backdrop').classList.add('hidden');
  if (currentModal === 'pause') { game.resume(); audio?.update(game.player.userData.speed, true, false); }
  currentModal = '';
  $('.nav-link.active')?.classList.remove('active'); $('[data-page="play"]').classList.add('active');
}

const modalHeader = (eyebrow, title, subtitle) => `<button class="modal-close" aria-label="Close dialog"><i data-lucide="x"></i></button><div class="modal-eyebrow">${eyebrow}</div><h2 id="modal-title">${title}</h2><p class="modal-subtitle">${subtitle}</p>`;

function updateRide() {
  const car = CARS[game.carIndex];
  $('#car-name').textContent = car.name; $('#car-class').textContent = `CLASS ${car.class}`;
  $('#car-description').textContent = car.description;
  for (const stat of ['power', 'armor', 'handling']) {
    $(`#stat-${stat}`).textContent = car[stat].toFixed(1);
    $(`#stat-${stat}`).parentElement.querySelector('em').style.width = `${car[stat] * 10}%`;
  }
  const mini = $('#mini-car');
  mini.style.filter = game.carIndex === 1 ? 'hue-rotate(100deg) saturate(.4)' : game.carIndex === 2 ? 'saturate(.15) brightness(1.3)' : '';
}

function openGarage() {
  if (game.mode !== 'lobby') return;
  $('[data-page="play"]').classList.remove('active'); $('[data-page="garage"]').classList.add('active');
  openModal(modalHeader('THE GARAGE / PICK YOUR POISON', 'CHOOSE YOUR WEAPON.', 'They’ve all seen better days. Give one a worse one.') + `<div class="selection-grid">${CARS.map((car, index) => `<button class="selection-card ${index === game.carIndex ? 'selected' : ''}" data-car="${index}"><small>CLASS ${car.class} / ${car.number}</small><div class="mini-car" style="filter:${index === 1 ? 'hue-rotate(100deg) saturate(.4)' : index === 2 ? 'saturate(.15) brightness(1.3)' : 'none'}">${miniCar}</div><h3>${car.short}</h3><p>${car.description}</p><div class="selection-stats"><span>POWER <b>${car.power}</b></span><span>ARMOR <b>${car.armor}</b></span></div></button>`).join('')}</div><button class="modal-action" id="garage-confirm">TAKE IT TO THE PIT <span>→</span></button>`, 'garage');
  document.querySelectorAll('[data-car]').forEach(button => button.addEventListener('click', () => {
    game.selectCar(Number(button.dataset.car)); updateRide();
    document.querySelectorAll('[data-car]').forEach(b => b.classList.toggle('selected', b === button));
  }));
  $('#garage-confirm').addEventListener('click', () => { closeModal(); toast(`${CARS[game.carIndex].short}. Ready for a bad time.`); });
}

function openArenas() {
  openModal(modalHeader('THE BATTLEGROUND / SETTLE IT HERE', 'PICK YOUR PLAYGROUND.', 'Eight drivers enter. One drives out. The scenery is optional.') + `<div class="selection-grid">${ARENAS.map((arena, index) => `<button class="selection-card ${index === game.arenaIndex ? 'selected' : ''}" data-arena="${index}"><small>${arena.theme}</small><div class="track-map" style="width:100%;height:90px;margin:14px 0"><svg viewBox="0 0 100 72" fill="none"><path d="M26 14 70 10 90 27 84 56 64 65 25 59 10 41Z" stroke="currentColor"/><path d="M29 21 68 17 82 30 77 50 62 57 30 52 18 39Z" stroke="currentColor"/><path d="M43 36h14M50 29v14" stroke="#ff6536"/></svg></div><h3>${arena.name.replace('THE ', '')}</h3><p>${arena.description}</p><div class="selection-stats"><span>8 DRIVERS</span><span><b>3 MINUTES</b></span></div></button>`).join('')}</div><button class="modal-action" id="arena-confirm">THIS IS THE PLACE →</button>`, 'arena');
  document.querySelectorAll('[data-arena]').forEach(button => button.addEventListener('click', () => {
    game.selectArena(Number(button.dataset.arena)); const arena = ARENAS[game.arenaIndex];
    $('#arena-name').textContent = $('#scene-arena-label').textContent = arena.name;
    $('#arena-description').textContent = arena.description;
    $('.track-badges').lastElementChild.innerHTML = `<i data-lucide="${game.arenaIndex === 2 ? 'moon' : game.arenaIndex === 1 ? 'cloud' : 'sun'}"></i> ${arena.theme}`; iconize();
    document.querySelectorAll('[data-arena]').forEach(b => b.classList.toggle('selected', b === button));
  }));
  $('#arena-confirm').addEventListener('click', () => { closeModal(); toast(`${ARENAS[game.arenaIndex].name}. See you in the dirt.`); });
}

function openControls() {
  if (game.mode === 'playing') { game.pause(); audio?.update(0, false, false); }
  const type = game.mode === 'paused' ? 'pause' : 'controls';
  openModal(modalHeader('SURVIVAL GUIDE / READ FAST', 'HIT HARD. STAY MOVING.', 'The last car standing wins. When the timer runs out, the healthiest survivor takes the trophy.') + `<div class="controls-grid"><div class="control-row"><kbd>W / ↑</kbd> Accelerate</div><div class="control-row"><kbd>S / ↓</kbd> Brake / reverse</div><div class="control-row"><kbd>A / ←</kbd> Steer left</div><div class="control-row"><kbd>D / →</kbd> Steer right</div><div class="control-row"><kbd>SPACE</kbd> Handbrake / drift</div><div class="control-row"><kbd>SHIFT</kbd> Nitro boost</div><div class="control-row"><kbd>F</kbd> Hold to fire minigun</div><div class="control-row"><kbd>E</kbd> Launch rockets</div><div class="control-row"><kbd>R</kbd> Unstick your car</div><div class="control-row"><kbd>ESC</kbd> Pause the chaos</div></div><div class="tip"><b>Armed and dangerous:</b> Both weapons fire forward: steer your car to aim. Hold F for rapid fire, then ease off to cool the minigun. E launches splash-damage rockets; your four-round rack automatically reloads in eight seconds. You can also hold the weapon buttons on screen. Rivals are armed too.</div><button class="modal-action" id="controls-confirm">${type === 'pause' ? 'BACK TO THE CHAOS' : 'GOT IT. LET’S BREAK THINGS.'} →</button>`, type);
  $('#controls-confirm').addEventListener('click', closeModal);
}

function openRecords() {
  if (game.mode !== 'lobby') return;
  $('[data-page="play"]').classList.remove('active'); $('[data-page="records"]').classList.add('active');
  openModal(modalHeader('LOCAL LEGENDS / YOUR PERSONAL BEST', 'THE WALL OF DAMAGE.', 'Your best runs, saved on this device. A little proof of the chaos.') + (records.length ? `<table class="records-table"><thead><tr><th>#</th><th>RIDE / ARENA</th><th>FINISH</th><th>WRECKS</th><th>DAMAGE</th></tr></thead><tbody>${records.slice(0, 8).map((record, index) => `<tr><td>${String(index + 1).padStart(2, '0')}</td><td>${CARS[record.car]?.short || 'RUST BUCKET'}<br><small style="color:#9aa68a;font-size:8px">${ARENAS[record.arena]?.name || 'THE DUSTBOWL'}</small></td><td>${record.won ? 'WINNER' : `#${record.rank}`}</td><td>${record.takedowns}</td><td>${record.damage}</td></tr>`).join('')}</tbody></table>` : '<div class="records-empty"><i data-lucide="trophy" style="width:40px;height:40px;color:#ff6536;margin-bottom:15px"></i><p>Every legend starts with a dent.</p><p>Finish your first derby to put your name on the wall.</p></div>') + `<button class="modal-action" id="records-confirm">BACK TO THE PIT →</button>`, 'records');
  $('#records-confirm').addEventListener('click', closeModal);
}

function startGame() {
  if (game.mode !== 'lobby') return;
  closeModal(); clearInterval(countdownTimer);
  $('#toast').classList.add('hidden'); $('#lobby').classList.add('hidden'); $('#lobby-footer').classList.add('hidden');
  $('#game-hud').classList.remove('hidden'); $('#touch-controls').classList.remove('hidden'); $('#app').classList.add('playing');
  game.start(); updateHud({ time: 180, health: 100, speed: 0, boost: 100, takedowns: 0, alive: 8, weapons: game.player.userData.weapons });
  lastTakedownAt = 0; $('#hit-notification').classList.remove('visible', 'takedown');
  let count = 3; $('#countdown').textContent = count; $('#countdown').classList.remove('hidden');
  if (soundEnabled) audio?.beep();
  countdownTimer = setInterval(() => {
    count--;
    if (count > 0) { $('#countdown').textContent = count; if (soundEnabled) audio?.beep(); }
    else if (count === 0) { $('#countdown').textContent = 'WRECK!'; game.play(); if (soundEnabled) audio?.beep(true); }
    else { $('#countdown').classList.add('hidden'); clearInterval(countdownTimer); }
  }, 900);
}

function returnToLobby() {
  clearInterval(countdownTimer); clearTimeout(hitTimer); clearTimeout(flashTimer);
  $('#modal-backdrop').classList.add('hidden'); currentModal = '';
  $('#lobby').classList.remove('hidden'); $('#lobby-footer').classList.remove('hidden');
  $('#game-hud').classList.add('hidden'); $('#touch-controls').classList.add('hidden'); $('#countdown').classList.add('hidden');
  $('#hit-notification').classList.remove('visible', 'takedown'); $('#blast-flash').classList.remove('active'); $('#app').classList.remove('playing');
  game.lobby(); audio?.update(0, false, false);
}

function pauseGame() {
  if (game.mode === 'paused') { closeModal(); return; }
  if (game.mode !== 'playing') return;
  game.pause(); game.keys = {}; audio?.update(0, false, false);
  openModal(modalHeader('PIT STOP / TAKE A BREATHER', 'CHAOS CAN WAIT.', 'Your car is still in one piece. More or less.') + `<button class="modal-action" id="resume-button">KEEP WRECKING →</button><button class="secondary-action" id="pause-controls">VIEW CONTROLS</button><button class="secondary-action" id="leave-button">LEAVE DERBY</button>`, 'pause');
  $('#resume-button').addEventListener('click', closeModal); $('#pause-controls').addEventListener('click', openControls);
  $('#leave-button').addEventListener('click', returnToLobby);
}

function updateHud(data) {
  const seconds = Math.ceil(data.time);
  $('#match-time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('#match-time').style.color = data.time <= 30 ? '#ff6536' : '';
  $('#alive-count').textContent = data.alive;
  $('#health-value').textContent = `${Math.ceil(data.health)}%`; $('#health-bar').style.width = `${data.health}%`;
  $('#health-bar').style.background = data.health < 25 ? '#f03c2f' : '#ff6536';
  $('#wreck-count').textContent = `${data.takedowns} TAKEDOWN${data.takedowns === 1 ? '' : 'S'}`;
  $('#speed').textContent = Math.round(data.speed);
  $('#gear').textContent = data.reverse ? 'R' : data.speed < 2 ? 'N' : Math.min(5, Math.floor(data.speed / 22) + 1);
  $('#boost-bar').style.width = `${data.boost}%`;
  const w = data.weapons;
  if (w) {
    $('#gun-heat-bar').style.width = `${w.heat}%`;
    $('#gun-heat').textContent = `${Math.round(w.heat)}% HEAT`;
    $('#gun-status').textContent = w.overheated ? 'COOLING DOWN' : w.flash > 0 ? 'FIRING' : 'READY';
    $('#minigun-button').classList.toggle('weapon-hot', w.overheated || w.heat >= 75);
    $('#minigun-button').classList.toggle('weapon-firing', w.flash > 0);
    $('#rocket-ammo').textContent = `${w.rockets} / ${WEAPON_STATS.rocket.capacity}`;
    $('#rocket-status').textContent = w.reload > 0 ? `RELOAD ${w.reload.toFixed(1)}s` : w.rocketCooldown > 0 ? `READY IN ${w.rocketCooldown.toFixed(1)}s` : 'READY';
    $('#rocket-button').classList.toggle('weapon-reloading', w.reload > 0 || w.rocketCooldown > 0);
    $('#rocket-rounds').querySelectorAll('span').forEach((round, index) => round.classList.toggle('spent', index >= w.rockets));
  }
  if (data.aim) {
    const hud = $('#game-hud'), reticle = $('.aim-reticle');
    reticle.style.left = `${(data.aim.x + 1) * .5 * $('#scene').clientWidth - hud.offsetLeft}px`;
    reticle.style.top = `${(1 - data.aim.y) * .5 * $('#scene').clientHeight - hud.offsetTop}px`;
    reticle.style.opacity = data.aim.z < 1 && data.aim.z > -1 ? '.7' : '0';
  }
}

function onFinish(result) {
  audio?.update(0, false, false); $('#countdown').classList.add('hidden'); clearInterval(countdownTimer);
  records.push({ ...result, car: game.carIndex, arena: game.arenaIndex, date: Date.now() });
  records.sort((a, b) => Number(b.won) - Number(a.won) || a.rank - b.rank || b.takedowns - a.takedowns || b.damage - a.damage);
  records = records.slice(0, 20);
  try { localStorage.setItem('wreckyard-records', JSON.stringify(records)); } catch { /* A private browser can still play. */ }
  setTimeout(() => {
    openModal(`<div class="modal-eyebrow">${result.won ? 'THE LAST CAR STANDING' : result.survived ? 'DERBY COMPLETE' : 'THAT’S ONE WAY TO PARK'}</div><h2 id="modal-title">${result.won ? 'KING OF THE WRECKAGE.' : result.survived ? 'BATTERED. STILL BREATHING.' : 'WRECKED. NOT FORGOTTEN.'}</h2><p class="modal-subtitle">${result.won ? 'Eight cars. One survivor. That survivor is you.' : result.survived ? 'You made it to the bell. Come back with a little more destruction.' : 'Your ride gave everything it had. There’s another one waiting in the garage.'}</p><div class="result-stats"><div>POSITION<b>#${result.rank}</b></div><div>TAKEDOWNS<b>${result.takedowns}</b></div><div>DAMAGE DEALT<b>${result.damage}</b></div><div>SURVIVED<b>${Math.floor(result.elapsed / 60)}:${String(Math.floor(result.elapsed % 60)).padStart(2, '0')}</b></div></div><button class="modal-action" id="rematch-button">ONE MORE BAD DECISION →</button><button class="secondary-action" id="back-garage">BACK TO THE GARAGE</button>`, 'result');
    $('#rematch-button').addEventListener('click', () => { returnToLobby(); startGame(); });
    $('#back-garage').addEventListener('click', returnToLobby);
  }, 2400);
}

try {
  game = new DerbyScene($('#scene'));
  game.onUpdate = data => {
    const now = performance.now(); if (now - lastHudUpdate > 70) { updateHud(data); lastHudUpdate = now; }
    audio?.update(game.player.userData.speed, soundEnabled, game.keys.Shift && game.boost > 0);
  };
  game.onHit = (message, points, strength) => {
    if (soundEnabled) audio?.impact(strength);
    if (lastTakedownAt && performance.now() - lastTakedownAt < 3200) return;
    clearTimeout(hitTimer);
    $('#hit-notification').classList.remove('takedown');
    $('#hit-notification').innerHTML = `${message}<small>${points >= 0 ? `+${points} DAMAGE DEALT` : `${Math.abs(points)} DAMAGE TAKEN`}</small>`;
    $('#hit-notification').classList.add('visible'); hitTimer = setTimeout(() => $('#hit-notification').classList.remove('visible'), 1500);
  };
  game.onWreck = (player, byPlayer, info) => {
    if (byPlayer && !player) {
      lastTakedownAt = performance.now();
      const notification = $('#hit-notification');
      clearTimeout(hitTimer); notification.classList.remove('takedown');
      notification.innerHTML = `<span class="takedown-kicker">DESTRUCTION CONFIRMED</span><strong>TAKEDOWN!</strong><small>DRIVER #${info.number} ELIMINATED · ${info.count} WRECK${info.count === 1 ? '' : 'S'}</small>`;
      void notification.offsetWidth;
      notification.classList.add('visible', 'takedown');
      $('#wreck-count').textContent = `${info.count} TAKEDOWN${info.count === 1 ? '' : 'S'}`;
      $('#alive-count').textContent = game.cars.filter(car => car.userData.alive).length;
      hitTimer = setTimeout(() => notification.classList.remove('visible'), 3400);
    }
  };
  game.onFinish = onFinish;
  game.onWeaponFire = (type, player) => { if (soundEnabled) audio?.weapon(type, player); };
  game.onExplosion = (distance, kind) => {
    if (soundEnabled && distance < 55) audio?.explosion(distance, kind === 'wreck');
    if (distance < 28) {
      const flash = $('#blast-flash');
      clearTimeout(flashTimer); flash.classList.remove('active');
      flash.style.setProperty('--flash-strength', Math.max(.08, .3 * (1 - distance / 35)));
      void flash.offsetWidth; flash.classList.add('active');
      flashTimer = setTimeout(() => flash.classList.remove('active'), 600);
    }
  };
} catch (error) {
  console.error('3D renderer could not start:', error);
  $('#scene').innerHTML = '<div class="loader-label">3D NEEDS WEBGL. PLEASE ENABLE HARDWARE ACCELERATION.</div>';
  $('#start-button').disabled = true;
}

$('#start-button').addEventListener('click', startGame);
$('#choose-car').addEventListener('click', openGarage);
$('#choose-arena').addEventListener('click', openArenas);
$('#controls-button').addEventListener('click', openControls);
$('#help-button').addEventListener('click', () => { if (!['countdown', 'finished'].includes(game.mode)) openControls(); });
$('#pause-button').addEventListener('click', pauseGame);
$('#camera-button').addEventListener('click', () => { game.view++; });
$('#sound-toggle').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  try { if (!audio) audio = new DerbyAudio(); audio.enable(soundEnabled); }
  catch { soundEnabled = false; toast('Audio is unavailable in this browser.'); }
  $('#sound-toggle').innerHTML = `<i data-lucide="${soundEnabled ? 'volume-2' : 'volume-x'}"></i>`;
  $('#sound-toggle').setAttribute('aria-label', soundEnabled ? 'Mute sound' : 'Enable sound');
  $('#sound-toggle').title = soundEnabled ? 'Mute sound' : 'Enable sound'; iconize();
});
document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.page === 'garage') openGarage();
  else if (button.dataset.page === 'records') openRecords();
  else closeModal();
}));
$('.brand').addEventListener('click', event => { event.preventDefault(); if (game.mode === 'lobby') closeModal(); else pauseGame(); });
$('#modal-backdrop').addEventListener('click', event => { if (event.target === $('#modal-backdrop')) closeModal(); });
document.addEventListener('keydown', event => {
  if (!game) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key) && game.mode !== 'lobby') event.preventDefault();
  if (key === 'Escape') { event.preventDefault(); if (currentModal && currentModal !== 'result') closeModal(); else pauseGame(); return; }
  if (key === 'Enter' && game.mode === 'lobby' && !currentModal) { event.preventDefault(); startGame(); return; }
  if (game.mode === 'playing') {
    game.keys[key] = true;
    if (key === 'r' && !event.repeat) { game.resetCar(); toast('Back on four wheels. Go make trouble.'); }
  }
});
document.addEventListener('keyup', event => { if (game) game.keys[event.key.length === 1 ? event.key.toLowerCase() : event.key] = false; });
window.addEventListener('blur', () => { if (game) { game.keys = {}; if (game.mode === 'playing') pauseGame(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && game?.mode === 'playing') pauseGame(); });
document.querySelectorAll('[data-key]').forEach(button => {
  button.addEventListener('pointerdown', event => { if (game?.mode !== 'playing') return; event.preventDefault(); button.setPointerCapture(event.pointerId); game.keys[button.dataset.key] = true; });
  const release = () => { game.keys[button.dataset.key] = false; };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
});

// Read-only game diagnostics make automated smoke checks possible.
window.wreckyard = {
  get state() { return { mode: game?.mode, cars: game?.cars.length, alive: game?.cars.filter(c => c.userData.alive).length, health: game?.player.userData.health, speed: game?.player.userData.speed, position: game?.player.position.toArray(), time: game?.time, car: game?.carIndex, arena: game?.arenaIndex, boost: game?.boost, weapons: game ? { ...game.player.userData.weapons } : null, projectiles: game?.projectiles.length, damage: game?.damageDealt, takedowns: game?.takedowns, destruction: game ? { blasts: game.destruction.blasts, effects: game.destruction.effects.length, burningWrecks: game.destruction.wrecks.length } : null }; },
};
