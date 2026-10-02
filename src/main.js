import * as THREE from 'three';
import { createWorld } from './world.js';
import { createGame } from './gameplay.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const world = createWorld(canvas);
let active = false, started = false, soundOn = true, lastHealth = 100, toastUntil = 0, hitUntil = 0;
const keys = new Set();
const input = { forward: 0, right: 0, ski: false, jet: false, jump: false, lookX: 0, lookY: 0, fire: false };
let audio;
function beep(freq=180,duration=.1,volume=.04,type='sine') {
  if (!soundOn || !audio) return;
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.type=type; oscillator.frequency.setValueAtTime(freq,audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(freq*.4,audio.currentTime+duration);
  gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
  oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+duration);
}
function notify(text) { $('toast').textContent=text; toastUntil=performance.now()+3800; }
function onEvent(event) {
  if (event.text) notify(event.text);
  if (['hit','kill','playerKill'].includes(event.type)) {hitUntil=performance.now()+180;beep(400,.07,.03);}
  if (['capture','flagCapture'].includes(event.type)) {beep(650,.3,.06);}
  if (['fire','shot'].includes(event.type)) beep(220,.17,.045,'sawtooth');
}
const game = createGame(world,onEvent);
function clearInput(){keys.clear();joy.x=0;joy.y=0;joy.id=null;$('stick').style.transform='translate(-50%,-50%)';input.forward=0;input.right=0;input.ski=false;input.jet=false;input.jump=false;input.fire=false;input.lookX=0;input.lookY=0;}
function lockMouse(){ if(!matchMedia('(pointer:coarse)').matches) canvas.requestPointerLock?.(); }
function setPanel(mode) {
  $('deploy-panel').classList.remove('hidden');
  if(mode==='pause') {
    $('panel-label').textContent='UPLINK ON STANDBY';$('panel-title').innerHTML='TAKE A<br><em>BREATHER.</em>';
    $('panel-description').innerHTML='Your match is paused.<br>The mountain will be here when you’re ready.';
    $('deploy-button').innerHTML='RESUME MATCH <span>→</span>';
  } else if (mode==='end') {
    const blue=game.state.blueScore,red=game.state.redScore;
    $('panel-label').textContent='MATCH COMPLETE';
    $('panel-title').innerHTML=blue>red?'FRONTIER<br><em>SECURED.</em>':blue<red?'REGROUP.<br><em>GO AGAIN.</em>':'HONORS<br><em>EVEN.</em>';
    $('panel-description').innerHTML=`Diamond Sword ${blue} — ${red} Blood Eagle<br>${game.state.playerKills} eliminations. Another run awaits.`;
    $('deploy-button').innerHTML='PLAY AGAIN <span>↻</span>';
  } else {
    $('panel-label').textContent='THE FRONTIER IS YOURS';$('panel-title').innerHTML='OWN THE<br><em>MOMENTUM.</em>';
    $('panel-description').innerHTML='Ski the slopes. Take to the skies.<br>Capture their flag before they capture yours.';
    $('deploy-button').innerHTML='DEPLOY TO FROSTLINE <span>→</span>';
  }
}
function start() {
  if(game.state.ended) restart();
  if(!audio) {try{audio=new (window.AudioContext||window.webkitAudioContext)();}catch{}}
  audio?.resume();active=true;started=true;document.body.classList.add('started');document.body.classList.remove('paused');
  $('deploy-panel').classList.add('hidden');$('manual-panel').classList.add('hidden');lockMouse();
  if(document.body.classList.contains('touch')&&!document.fullscreenElement){try{const p=document.documentElement.requestFullscreen?.();p?.catch?.(()=>{});}catch{}try{screen.orientation?.lock?.('landscape')?.catch?.(()=>{});}catch{}}
  notify('SHIFT to ski · SPACE to jet · Take the red flag home');
}
function pause() {if(!active)return;active=false;clearInput();document.body.classList.add('paused');if(document.pointerLockElement)document.exitPointerLock();setPanel(game.state.ended?'end':'pause');}
function restart() {game.restart();world.resetPlayer();lastHealth=100;clearInput();$('respawn-panel').classList.add('hidden');if(started){active=true;$('deploy-panel').classList.add('hidden');document.body.classList.remove('paused');notify('New match. Same mountain. Make it count.');}else setPanel('start');}
$('deploy-button').addEventListener('click',start);
$('restart-button').addEventListener('click',()=>{restart();if(started)lockMouse();});
$('sound-button').addEventListener('click',()=>{soundOn=!soundOn;$('sound-button').innerHTML=`${soundOn?'♪':'♩'} <span>SOUND ${soundOn?'ON':'OFF'}</span>`;});
function openManual(){if(active)pause();$('manual-panel').classList.remove('hidden');$('manual-tab').classList.add('active');$('play-tab').classList.remove('active');}
function closeManual(){$('manual-panel').classList.add('hidden');$('manual-tab').classList.remove('active');$('play-tab').classList.add('active');}
$('manual-tab').addEventListener('click',openManual);$('close-manual').addEventListener('click',closeManual);$('play-tab').addEventListener('click',closeManual);
canvas.addEventListener('click',()=>{if(active && !document.pointerLockElement)lockMouse();});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement && active && !window.gameApp.testMode)pause();});
document.addEventListener('keydown',e=>{
  if(['Space','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Escape'].includes(e.code))e.preventDefault();
  if(e.code==='Escape'){if(!$('manual-panel').classList.contains('hidden'))closeManual();else pause();return;}
  if(e.code==='KeyR'&&!e.repeat){restart();return;}
  if(e.code==='Enter'&&!active){start();return;}
  keys.add(e.code);
});
document.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{if(active&&!window.gameApp.testMode)pause();clearInput();});
document.addEventListener('mousemove',e=>{if(active&&document.pointerLockElement===canvas){input.lookX+=e.movementX;input.lookY+=e.movementY;}});
canvas.addEventListener('mousedown',e=>{if(active&&e.button===0)input.fire=true;});document.addEventListener('mouseup',()=>input.fire=false);
if(matchMedia('(pointer:coarse)').matches||'ontouchstart'in window||navigator.maxTouchPoints>0)document.body.classList.add('touch');
window.addEventListener('touchstart',()=>document.body.classList.add('touch'),{once:true,passive:true});
let lookPointer=null,touchLast=null;
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&lookPointer===null){lookPointer=e.pointerId;touchLast={x:e.clientX,y:e.clientY};try{canvas.setPointerCapture(e.pointerId);}catch{}}});
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='touch'&&e.pointerId===lookPointer&&touchLast&&active){input.lookX+=(e.clientX-touchLast.x)*1.7;input.lookY+=(e.clientY-touchLast.y)*1.7;touchLast={x:e.clientX,y:e.clientY};}});
function endLook(e){if(e.pointerId===lookPointer){lookPointer=null;touchLast=null;}}
canvas.addEventListener('pointerup',endLook);canvas.addEventListener('pointercancel',endLook);
const joy={x:0,y:0,id:null};
const joystick=$('joystick'),stick=$('stick'),JOY_RADIUS=42;
function joyMove(e){const r=joystick.getBoundingClientRect();let dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);const d=Math.hypot(dx,dy);if(d>JOY_RADIUS){dx*=JOY_RADIUS/d;dy*=JOY_RADIUS/d;}joy.x=dx/JOY_RADIUS;joy.y=-dy/JOY_RADIUS;stick.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;}
function joyEnd(e){if(e.pointerId===joy.id){joy.id=null;joy.x=0;joy.y=0;stick.style.transform='translate(-50%,-50%)';}}
if(joystick){joystick.addEventListener('pointerdown',e=>{e.preventDefault();joy.id=e.pointerId;try{joystick.setPointerCapture(e.pointerId);}catch{}joyMove(e);});joystick.addEventListener('pointermove',e=>{if(e.pointerId===joy.id)joyMove(e);});joystick.addEventListener('pointerup',joyEnd);joystick.addEventListener('pointercancel',joyEnd);joystick.addEventListener('lostpointercapture',joyEnd);}
document.querySelectorAll('[data-key]').forEach(button=>{button.addEventListener('pointerdown',e=>{e.preventDefault();keys.add(button.dataset.key);try{button.setPointerCapture(e.pointerId);}catch{}});button.addEventListener('pointerup',()=>keys.delete(button.dataset.key));button.addEventListener('pointercancel',()=>keys.delete(button.dataset.key));button.addEventListener('lostpointercapture',()=>keys.delete(button.dataset.key));button.addEventListener('contextmenu',e=>e.preventDefault());});
function releaseFire(){input.fire=false;}
$('touch-fire').addEventListener('pointerdown',e=>{e.preventDefault();input.fire=true;try{e.target.setPointerCapture(e.pointerId);}catch{}});$('touch-fire').addEventListener('pointerup',releaseFire);$('touch-fire').addEventListener('pointercancel',releaseFire);$('touch-fire').addEventListener('lostpointercapture',releaseFire);
$('touch-pause').addEventListener('click',()=>{if(active)pause();});
function updateFullscreenLabel(){$('fullscreen-button').innerHTML=`⛶ <span>${document.fullscreenElement?'EXIT':'FULL'}</span>`;}
$('fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else{await document.documentElement.requestFullscreen?.();try{await screen.orientation?.lock?.('landscape');}catch{}}}catch{}});
document.addEventListener('fullscreenchange',updateFullscreenLabel);
window.addEventListener('resize',()=>world.resize());
const directions=['N','NE','E','SE','S','SW','W','NW'];
const markerVector=new THREE.Vector3();
function marker(id,flag,label){
  const el=$(id);if(!flag){el.style.display='none';return;}
  const position=flag.position || (id==='blue-marker'?world.bases.blue:world.bases.red);
  const distance=world.player.position.distanceTo(position);
  markerVector.copy(position);markerVector.y+=14;markerVector.project(world.camera);
  const behind=markerVector.z>1||markerVector.z< -1;
  const offscreen=behind||Math.abs(markerVector.x)>1||Math.abs(markerVector.y)>1;
  let x=(markerVector.x*.5+.5)*100,y=(-markerVector.y*.5+.5)*100;
  if(behind){x=markerVector.x>0?4:96;y=43;}
  el.style.display='flex';el.style.left=`${Math.max(4,Math.min(96,x))}%`;el.style.top=`${Math.max(23,Math.min(74,y))}%`;
  el.querySelector('b').textContent=offscreen?(x<50?'‹':'›'):'⚑';
  el.querySelector('span').textContent=label;el.querySelector('small').textContent=`${Math.round(distance)} M`;
}
const radar=$('radar'),ctx=radar.getContext('2d');
function drawRadar(){
  const s=180,c=90,scale=.15;
  ctx.clearRect(0,0,s,s);ctx.strokeStyle='#b4eef122';ctx.lineWidth=1;
  for(const r of [28,55,83]){ctx.beginPath();ctx.arc(c,c,r,0,Math.PI*2);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(c,5);ctx.lineTo(c,175);ctx.moveTo(5,c);ctx.lineTo(175,c);ctx.stroke();
  ctx.fillStyle='#c6e8f366';ctx.font='8px monospace';ctx.fillText('N',87,10);
  function point(position,color,type){if(!position)return;const x=c+position.x*scale,y=c+position.z*scale;ctx.fillStyle=color;if(type==='flag'){ctx.fillRect(x-3,y-3,6,6);ctx.strokeStyle=color;ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.stroke();}else{ctx.beginPath();ctx.arc(x,y,2.7,0,Math.PI*2);ctx.fill();}}
  point(game.state.flags?.blue?.position,'#73f7e3','flag');point(game.state.flags?.red?.position,'#ff827c','flag');
  for(const bot of game.state.bots||[])if(bot.health>0)point(bot.position,bot.team==='blue'?'#73f7e3':'#ff827c');
  const p=world.player;ctx.save();ctx.translate(c+p.position.x*scale,c+p.position.z*scale);ctx.rotate(-p.yaw);ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(4,4);ctx.lineTo(0,2);ctx.lineTo(-4,4);ctx.closePath();ctx.fill();ctx.restore();
}
function updateHud(){
  const p=world.player,s=game.state;
  $('blue-score').textContent=s.blueScore;$('red-score').textContent=s.redScore;
  const t=Math.max(0,Math.ceil(s.timeLeft));$('timer').textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  $('health-value').textContent=Math.ceil(Math.max(0,p.health));$('energy-value').textContent=Math.ceil(p.energy);
  $('health-bar').style.width=`${Math.max(0,p.health)}%`;$('energy-bar').style.width=`${p.energy}%`;
  if(p.health<lastHealth){$('damage-overlay').style.opacity=.7;setTimeout(()=>$('damage-overlay').style.opacity=0,180);beep(85,.15,.03,'triangle');}lastHealth=p.health;
  const speed=Math.hypot(p.velocity.x,p.velocity.z)*3.6;$('speed').textContent=Math.round(speed);$('speed-ticks').style.setProperty('--speed-fill',`${Math.min(100,speed/4.5)}%`);
  $('movement-mode').textContent=input.jet&&p.energy>1?'JETPACK ACTIVE':!p.grounded?'AIRBORNE':input.ski?'SKIING':'ON FOOT';
  $('kills').innerHTML=`${s.playerKills} <small>ELIMS</small>`;
  $('weapon-ready-bar').style.width=`${Math.max(0,1-(s.weaponCooldown||0)/.7)*100}%`;
  const carrying=s.flags?.red?.carrier==='player'||s.flags?.red?.carrier===p;
  const ownMissing=s.flags?.blue?.status!=='home';
  const allyCarrying=!carrying&&s.flags?.red?.status==='carried';
  $('objective-text').textContent=ownMissing?(carrying?'RECOVER BLUE FLAG TO UNLOCK CAPTURE.':'RECOVER YOUR FLAG. STOP THE CARRIER.'):carrying?'FLAG SECURED. RETURN TO BLUE BASE.':allyCarrying?'ESCORT YOUR CARRIER. DEFEND BLUE BASE.':'TAKE THEIR FLAG. BRING IT HOME.';
  marker('blue-marker',s.flags?.blue,ownMissing?'RECOVER FLAG':carrying?'RETURN HERE':'DEFEND');
  if(carrying)$('red-marker').style.display='none';else marker('red-marker',s.flags?.red,allyCarrying?'ESCORT CARRIER':'ENEMY FLAG');
  const heading=((Math.round(-p.yaw/(Math.PI/4))%8)+8)%8;$('compass').innerHTML=`<span>${directions[(heading+7)%8]}</span><span>·</span><span>${directions[heading]}</span><span>·</span><span>${directions[(heading+1)%8]}</span>`;
  $('toast').classList.toggle('visible',performance.now()<toastUntil);$('hit-marker').style.opacity=performance.now()<hitUntil?1:0;
  $('respawn-panel').classList.toggle('hidden',!(s.respawnIn>0));$('respawn-time').textContent=Math.ceil(s.respawnIn||0);
  drawRadar();
}
function updateInput(dt){
  input.forward=Math.max(-1,Math.min(1,(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0)+joy.y));input.right=Math.max(-1,Math.min(1,(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+joy.x));
  input.ski=keys.has('ShiftLeft')||keys.has('ShiftRight');input.jet=keys.has('Space');
  input.lookX+=((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*dt*620;
  input.lookY+=((keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0))*dt*450;
}
function step(dt,drawHud=true){
  // Fixed substeps keep collision and slope physics stable, including deterministic playtests.
  let remaining=Math.min(dt,10);while(remaining>0){const d=Math.min(remaining,1/60);if(!(game.state.respawnIn>0)&&!game.state.ended)world.update(d,input);game.update(d,input);input.lookX=0;input.lookY=0;remaining-=d;}
  if(drawHud)updateHud();
}
window.gameApp={world,game,input,start,restart,step,testMode:false,pause,get active(){return active;},get started(){return started;}};
let last=performance.now(),lastHud=0;
function frame(now){
  // Consume real elapsed time in stable 60 Hz substeps. A slow software GPU must
  // not turn an eight-minute match into an hour of discarded simulation time.
  const dt=Math.min(1,Math.max(0,(now-last)/1000));last=now;
  if(active&&!window.gameApp.testMode){updateInput(dt);step(dt,false);if(game.state.ended){active=false;clearInput();if(document.pointerLockElement)document.exitPointerLock();setPanel('end');}}
  if(now-lastHud>=80){updateHud();lastHud=now;}
  world.render(dt);requestAnimationFrame(frame);
}
world.resize();world.render(0);$('loading').classList.add('hidden');requestAnimationFrame(frame);
