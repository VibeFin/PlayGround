import * as THREE from 'three';
import { createSimulation } from './simulation.js';
import { createArena } from './arena.js';
import { createVehicle, updateVehicle } from './vehicles.js';
import { createEffects } from './effects.js';
import { DerbyAudio } from './audio.js';
import './style.css';
import './refinements.css';

const app=document.querySelector('#app');
app.innerHTML=`
  <canvas id="world" aria-label="3D demolition derby arena"></canvas>
  <div class="vignette"></div><div class="grain"></div>
  <header class="topbar">
    <a class="brand" href="/" aria-label="Wreckage home"><span class="brand-icon">W</span><span>WRECKAGE<small>FULL CONTACT MOTORSPORT</small></span></a>
    <nav class="nav menu-only" aria-label="Main navigation"><a class="active" href="#arena">THE ARENA</a><button id="how-nav">HOW TO PLAY</button><a href="/progress.html" target="_blank" rel="noopener">THE WORKSHOP ↗</a></nav>
    <div class="top-right"><span class="status"><span class="dot"></span> ALL SYSTEMS GO</span><button class="icon-button" id="camera-button" aria-label="Change camera" title="Camera · C" hidden>▣</button><button class="icon-button" id="sound" aria-label="Mute sound" title="Sound · M">♫</button><button class="icon-button" id="pause" aria-label="Pause game" title="Pause · Esc" hidden>Ⅱ</button></div>
  </header>
  <main class="menu-only" id="arena">
    <section class="hero"><div class="eyebrow">NO FINISH LINE. NO MERCY.</div><h1>BUILT TO<br>BE <span>BROKEN.</span></h1><p>Ten cars. One arena. Zero second chances.<br>Buckle up. Make an absolute wreck of it.</p><div class="hero-tags"><span>REAL-TIME DESTRUCTION</span><span>PURE METAL MAYHEM</span></div></section>
    <div class="arena-label"><span class="label">YOUR NEXT BAD DECISION</span><h2>THE IRON PIT</h2><p>34° 08′ N &nbsp; 118° 19′ W &nbsp; / &nbsp; DUSK</p></div><div class="coordinate">DIRT. STEEL. BAD INTENTIONS. &nbsp; — &nbsp; EST. 1997</div>
    <section class="menu-bottom"><div class="event-heading"><strong><span class="dot" style="display:inline-block;margin-right:8px"></span>MAIN EVENT / 01</strong><span>THE RULES ARE SIMPLE. SURVIVE.</span></div><div class="event-panel"><div class="event-cell selected"><small>DEMOLITION DERBY</small><h3>LAST CAR STANDING</h3><p class="mini-tag">EVERY HIT LEAVES A MARK.</p></div><div class="event-cell"><small>THE COMPETITION</small><h3>09 RIVALS. ALL HOSTILE.</h3><p>They came to take you apart.</p></div><div class="event-cell"><small>YOUR MACHINE</small><h3>V8 / THE TROUBLEMAKER</h3><p>1,650 kg of questionable decisions.</p></div><div class="event-cell action-cell"><button class="primary" id="start">ENTER THE CARNAGE <span class="arrow">↗</span></button><p>FREE PLAY &nbsp;·&nbsp; NO DOWNLOAD &nbsp;·&nbsp; ALL CHAOS</p></div></div></section>
  </main>
  <section class="hud" aria-label="Race information"><div class="race-top"><div class="hud-stat"><small>STILL BREATHING</small><strong id="alive">10 <em>/ 10</em></strong></div><div class="hud-stat"><small>TIME LEFT</small><strong id="timer">3:00</strong></div><div class="hud-stat score"><small>DESTRUCTION</small><strong id="score">0000</strong></div></div><div class="objective">THE IRON PIT / MAIN EVENT<strong>BE THE LAST CAR STANDING.</strong></div><div class="player-vitals"><div class="health-title"><span>07 / TROUBLEMAKER</span><strong id="health-text">100%</strong></div><div class="health-track"><div class="health-fill" id="health"></div></div><div class="boost-track"><div class="boost-fill" id="boost"></div></div><div class="boost-caption"><span class="key">SHIFT</span>NITRO RESERVE</div></div><canvas class="mini-map" id="map" width="276" height="208" aria-label="Arena radar"></canvas><div class="speedometer"><span class="speed" id="speed">0</span><div class="speed-unit"><strong id="gear">N</strong>KM/H</div></div><div class="impact-label" id="impact"><strong>HARD HIT</strong><small>MAKE IT COUNT.</small></div></section>
  <div class="countdown" id="countdown" hidden></div><div class="hit-flash" id="hit-flash"></div>
  <footer class="footer"><p>LOUD ENGINES. POOR LIFE CHOICES.</p><button class="mobile-guide" id="mobile-guide">DRIVER’S BRIEFING ↗</button><div class="control-hints"><span><span class="key">W A S D</span>DRIVE</span><span><span class="key">SPACE</span>HANDBRAKE</span><span><span class="key">SHIFT</span>NITRO</span><span class="playing-only"><span class="key">C</span>CAMERA</span></div><span class="version">INDEPENDENT MOTORSPORT / VOL. 001</span></footer>
  <div class="mobile-controls"><button data-input="left" aria-label="Steer left">◀</button><button data-input="right" aria-label="Steer right">▶</button><button data-input="brake" aria-label="Handbrake">BRAKE</button><button data-input="throttle" aria-label="Accelerate">▲<small>GAS</small></button><button data-input="reverse" aria-label="Reverse">▼<small>REV</small></button><button data-input="boost" aria-label="Nitro boost">NITRO</button></div>
  <div id="modal-root"></div><div class="loading" id="loading">WRECKAGE<small>WARMING UP THE V8…</small></div>`;

const $=id=>document.getElementById(id);
// Bake grain once: an SVG turbulence filter over a changing WebGL canvas can
// force a full-screen software raster on every impact/compositor update.
const grainCanvas=document.createElement('canvas');grainCanvas.width=grainCanvas.height=128;
const grainContext=grainCanvas.getContext('2d'),grainPixels=grainContext.createImageData(128,128);
for(let i=0;i<grainPixels.data.length;i+=4){const value=Math.random()*255;grainPixels.data[i]=grainPixels.data[i+1]=grainPixels.data[i+2]=value;grainPixels.data[i+3]=255;}
grainContext.putImageData(grainPixels,0,0);document.querySelector('.grain').style.backgroundImage=`url(${grainCanvas.toDataURL()})`;
const audio=new DerbyAudio();
const probe=document.createElement('canvas').getContext('webgl2',{antialias:false});
const probeInfo=probe?.getExtension('WEBGL_debug_renderer_info');
const softwareProbe=probeInfo?/swiftshader|llvmpipe|software/i.test(probe.getParameter(probeInfo.UNMASKED_RENDERER_WEBGL)):false;
probe?.getExtension('WEBGL_lose_context')?.loseContext();
let renderer;
try { renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:!softwareProbe,powerPreference:'high-performance'}); }
catch(e){$('loading').innerHTML='<span>THE ENGINE COULDN’T START</span><small>This arena needs a browser with WebGL enabled.</small>';throw e;}
const gl=renderer.getContext(),debugRenderer=gl.getExtension('WEBGL_debug_renderer_info');
const rendererName=debugRenderer?gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL):'WebGL renderer';
const softwareRenderer=/swiftshader|llvmpipe|software/i.test(rendererName);
app.classList.toggle('software-rendering',softwareRenderer);
function renderScale(){const playing=app.classList.contains('playing');return softwareRenderer?Math.min(.7,Math.sqrt((playing?150000:550000)/(innerWidth*innerHeight)),(playing?640:1100)/innerWidth):Math.min(window.devicePixelRatio,1.65);}
renderer.setPixelRatio(renderScale());renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=softwareRenderer?THREE.BasicShadowMap:THREE.PCFSoftShadowMap;
// The software tier bakes static scenery once; cars retain their local contact shadows.
if(softwareRenderer){renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;}
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color('#afa98a');scene.fog=new THREE.FogExp2('#afa98a',.0052);
const sky=new THREE.Mesh(new THREE.SphereGeometry(500,24,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#414e50')},bottom:{value:new THREE.Color('#e5c598')}},vertexShader:'varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform vec3 top;uniform vec3 bottom;varying vec3 vWorld;void main(){float h=normalize(vWorld).y;gl_FragColor=vec4(mix(bottom,top,smoothstep(-0.04,0.7,h)),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}));scene.add(sky);
scene.add(new THREE.HemisphereLight('#e3e5d2','#494632',2.2));
const sun=new THREE.DirectionalLight('#ffe3b4',3.4);sun.position.set(-44,62,-20);sun.castShadow=true;sun.shadow.mapSize.set(softwareRenderer?512:2048,softwareRenderer?512:2048);Object.assign(sun.shadow.camera,{left:-62,right:62,top:55,bottom:-55,near:1,far:180});sun.shadow.bias=-.00035;sun.shadow.normalBias=.045;scene.add(sun);sun.target.position.set(0,0,0);scene.add(sun.target);
const rim=new THREE.DirectionalLight('#adbec1',1.2);rim.position.set(30,18,35);scene.add(rim);
scene.add(createArena(THREE,{lowDetail:softwareRenderer}));
const simulation=createSimulation(),models=new Map();
function rebuildCars(){for(const car of simulation.cars){if(models.has(car.id)){updateVehicle(models.get(car.id),car,0,0);continue;}const model=createVehicle(THREE,{...car,lowDetail:softwareRenderer&&!car.isPlayer});if(softwareRenderer)model.traverse(o=>{o.castShadow=false;});scene.add(model);models.set(car.id,model);}}
rebuildCars();const effects=createEffects(scene);
const opponentLabels=new Map(),labelProjection=new THREE.Vector3();
for(const car of simulation.cars.filter(c=>!c.isPlayer)){const label=document.createElement('div');label.className='opponent-label';label.innerHTML=`<span>${car.name}</span><i><b></b></i>`;label.hidden=true;document.querySelector('.hud').append(label);opponentLabels.set(car.id,label);}
const camera=new THREE.PerspectiveCamera(47,innerWidth/innerHeight,.15,650);camera.position.set(43,32,51);
const look=new THREE.Vector3(0,0,0),desired=new THREE.Vector3(),target=new THREE.Vector3();
let running=false,paused=false,starting=false,ended=false,countdown=0,lastBeep=4,elapsed=0,accumulator=0,shake=0,flash=0,impactTimer=0,cameraMode=0,frameMs=16,renderFrames=0,countdownHideTimeout;
const keys=new Set(),touch=new Set();
function getInput(){return {throttle:(keys.has('KeyW')||keys.has('ArrowUp')||touch.has('throttle')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')||touch.has('reverse')?1:0),steer:(keys.has('KeyA')||keys.has('ArrowLeft')||touch.has('left')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')||touch.has('right')?1:0),brake:keys.has('Space')||touch.has('brake'),boost:keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.has('boost')};}
function showModal(html){$('modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">${html}</section></div>`;$('modal-root').querySelector('button')?.focus();}
function closeModal(){$('modal-root').replaceChildren();if(!running)$('start').focus({preventScroll:true});}
function controls(){
  if(running&&!paused)setPaused(true);
  const touchMode=matchMedia('(pointer: coarse)').matches;
  const bindings=touchMode?[
    ['GAS','Hold to accelerate'],['REV','Brake, then reverse'],['◀ ▶','Hold to steer'],['BRAKE','Handbrake / drift'],['NITRO','Hold for boost'],['▣','Change camera'],['Ⅱ','Pause / resume'],['♫','Toggle sound'],
  ]:[['W / ↑','Accelerate'],['S / ↓','Brake / reverse'],['A D / ← →','Steer'],['SPACE','Handbrake'],['SHIFT','Nitro boost'],['C','Change camera'],['ESC','Pause / resume'],['M','Mute sound']];
  const guidance=touchMode?'Use both thumbs: hold GAS while steering. Add NITRO for a charge, or hold BRAKE while steering to slide. REV slows you down before reversing. The top-row buttons change camera, sound, and pause.':'Keep moving. Nitro recharges when you lift off. Big impacts earn more destruction points.';
  showModal(`<div class="eyebrow">${touchMode?'TOUCH DRIVER’S BRIEFING':'A BRIEF SURVIVAL GUIDE'}</div><h2 id="modal-title">HIT HARD.<br>STAY IN ONE PIECE.</h2><p>Wreck the other nine cars before they wreck you. Lead with your reinforced front bumper and protect your vulnerable sides and rear. At the buzzer, the healthiest survivor takes it.</p><div class="controls-grid">${bindings.map(([key,action])=>`<div><span class="key">${key}</span>${action}</div>`).join('')}</div><p>${guidance}</p><button class="primary" id="controls-close">GOT IT. LET’S BREAK THINGS. <span>↗</span></button>`);
  $('controls-close').onclick=()=>{closeModal();if(running)setPaused(false);};
}
function setPaused(value){if(!running||ended)return;paused=value;keys.clear();touch.clear();if(paused){showModal(`<div class="eyebrow">TAKE A BREATHER</div><h2 id="modal-title">THE WRECKAGE<br>CAN WAIT.</h2><p>Your derby is paused. The bad decisions will be here when you get back.</p><button class="primary" id="resume">BACK TO THE CARNAGE <span>↗</span></button><button class="secondary" id="pause-guide">DRIVER’S BRIEFING</button><button class="secondary" id="restart">RESTART EVENT</button><button class="secondary" id="exit">BACK TO THE PIT</button>`);$('resume').onclick=()=>setPaused(false);$('pause-guide').onclick=controls;$('restart').onclick=startGame;$('exit').onclick=goHome;}else closeModal();}
function startGame(){clearTimeout(countdownHideTimeout);impactTimer=0;closeModal();audio.init().catch(()=>{});simulation.reset();rebuildCars();effects.reset();running=true;paused=false;ended=false;starting=true;countdown=3;lastBeep=4;accumulator=0;shake=0;flash=0;keys.clear();touch.clear();app.classList.add('playing');renderer.setPixelRatio(renderScale());$('pause').hidden=false;$('camera-button').hidden=false;$('countdown').hidden=false;const p=simulation.cars[0];camera.position.set(p.x-Math.sin(p.yaw)*11,6.4,p.z-Math.cos(p.yaw)*11);look.set(p.x,1,p.z+4);updateHUD();}
function goHome(){clearTimeout(countdownHideTimeout);impactTimer=0;closeModal();simulation.reset();rebuildCars();effects.reset();running=false;paused=false;starting=false;ended=false;keys.clear();touch.clear();app.classList.remove('playing');renderer.setPixelRatio(renderScale());$('pause').hidden=true;$('camera-button').hidden=true;$('countdown').hidden=true;$('start').focus({preventScroll:true});}
function finish(){ended=true;keys.clear();touch.clear();const won=simulation.state==='won';showModal(`<div class="eyebrow">THE IRON PIT / RESULTS</div><h2 id="modal-title">${won?'LAST CAR.<br>STILL STANDING.':'DOWN.<br>NOT FOR GOOD.'}</h2><p>${won?'The dust settled. Somehow, you’re still here. That’s what we call a good day.':'You left some paint out there. And probably a bumper. The next round is yours.'}</p><div class="result-stats"><div><small>DESTRUCTION</small><strong>${Math.floor(simulation.score).toLocaleString()}</strong></div><div><small>WRECKS</small><strong>${simulation.takedowns||0}</strong></div><div><small>SURVIVED</small><strong>${Math.floor(simulation.time)}s</strong></div></div><button class="primary" id="again">ONE MORE BAD DECISION <span>↗</span></button><button class="secondary" id="results-home">BACK TO THE PIT</button>`);$('again').onclick=startGame;$('results-home').onclick=goHome;}
$('start').onclick=startGame;$('how-nav').onclick=controls;$('mobile-guide').onclick=controls;$('pause').onclick=()=>setPaused(!paused);
$('camera-button').onclick=()=>{cameraMode=(cameraMode+1)%2;};
const coarsePointer=matchMedia('(pointer: coarse)');
function updateTouchHints(){document.querySelector('.boost-caption').innerHTML=coarsePointer.matches?'HOLD NITRO TO BOOST':'<span class="key">SHIFT</span>NITRO RESERVE';}
coarsePointer.addEventListener('change',updateTouchHints);updateTouchHints();
function toggleMute(){const muted=audio.mute();$('sound').textContent=muted?'♪̸':'♫';$('sound').setAttribute('aria-label',muted?'Enable sound':'Mute sound');$('sound').setAttribute('aria-pressed',String(muted));}
$('sound').onclick=()=>{audio.init().catch(()=>{});toggleMute();};
window.addEventListener('keydown',e=>{if(e.code==='Tab'&&$('modal-root').firstChild){const buttons=[...$('modal-root').querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;}if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='Escape'){if(running&&!ended)setPaused(!paused);else if(!running)closeModal();return;}if(e.code==='KeyM')toggleMute();if(e.code==='KeyC')cameraMode=(cameraMode+1)%2;if(e.code==='KeyR'&&running&&!starting&&!ended&&!paused)setPaused(true);keys.add(e.code);});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();touch.clear();if(running&&!paused&&!ended)setPaused(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!paused&&!ended)setPaused(true);});
for(const button of document.querySelectorAll('[data-input]')){button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);touch.add(button.dataset.input);});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>touch.delete(button.dataset.input));}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(renderScale());renderer.setSize(innerWidth,innerHeight);});
const mapCtx=$('map').getContext('2d');
function updateHUD(){const p=simulation.cars[0],alive=simulation.cars.filter(c=>c.alive).length;$('alive').innerHTML=`${String(alive).padStart(2,'0')} <em>/ 10</em>`;const remain=Math.max(0,Math.ceil((simulation.duration||180)-simulation.time));$('timer').textContent=`${Math.floor(remain/60)}:${String(remain%60).padStart(2,'0')}`;$('score').textContent=String(Math.floor(simulation.score)).padStart(4,'0');const health=Math.max(0,Math.ceil(p.health));$('health-text').textContent=health+'%';$('health').style.width=health+'%';$('health').style.background=health<30?'#fa7049':'#d6fb53';$('health-text').style.color=health<30?'#fa7049':'#d6fb53';$('boost').style.width=Math.max(0,Math.min(100,p.boost))+'%';$('speed').textContent=Math.round(Math.abs(p.speed)*3.6);$('gear').textContent=p.speed<-.8?'R':Math.abs(p.speed)<.8?'N':String(Math.min(4,1+Math.floor(Math.abs(p.speed)/8)));
  const c=mapCtx;c.clearRect(0,0,276,208);c.fillStyle='#10191190';c.strokeStyle='#d6e4bc50';c.lineWidth=2;c.beginPath();c.roundRect(6,6,264,196,18);c.fill();c.stroke();c.strokeStyle='#d6e4bc18';c.beginPath();c.ellipse(138,104,30,25,0,0,Math.PI*2);c.stroke();for(const car of simulation.cars){const x=138-car.x*2.85,y=104-car.z*2.85;c.save();c.translate(x,y);c.rotate(-car.yaw);c.fillStyle=car.isPlayer?'#d6fb53':car.alive?'#f0b589':'#79816b66';if(car.isPlayer){c.beginPath();c.moveTo(0,-9);c.lineTo(6,7);c.lineTo(0,4);c.lineTo(-6,7);c.closePath();c.fill();}else{c.fillRect(-3,-5,6,10);}c.restore();}
  const nearest=simulation.cars.filter(c=>!c.isPlayer&&c.alive&&Math.hypot(c.x-p.x,c.z-p.z)<32).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z)).slice(0,3);
  for(const car of simulation.cars){const label=opponentLabels.get(car.id);if(!label)continue;labelProjection.set(car.x,2.4,car.z).project(camera);label.hidden=!nearest.includes(car)||labelProjection.z>1||labelProjection.z<0||Math.abs(labelProjection.x)>.88||Math.abs(labelProjection.y)>.65;if(!label.hidden){label.style.left=(labelProjection.x*.5+.5)*100+'%';label.style.top=(-labelProjection.y*.5+.5)*100+'%';label.querySelector('b').style.width=car.health+'%';}}
}
function handleEvents(previousHealth,previousScore){for(const e of simulation.events){if(e.type==='hit'||e.type==='wreck'){effects.impact(e);const distance=Math.hypot(e.x-simulation.cars[0].x,e.z-simulation.cars[0].z);if(distance<25)audio.hit(Math.min(1,e.force||.4)*(1-distance/35));if(e.player){shake=Math.max(shake,Math.min(.7,(e.force||.3)*.8));flash=Math.max(flash,Math.min(.7,(e.force||.3)));if((e.force||0)>.22||e.type==='wreck'){const label=$('impact'),points=simulation.score-previousScore,loss=previousHealth-simulation.cars[0].health;label.querySelector('strong').textContent=e.type==='wreck'?(simulation.cars[0].alive?'RIVAL WRECKED!':'TOTALLED.'):points>0?(e.force>.7?'BRUTAL HIT!':'HARD HIT'):'ARMOR HIT';label.querySelector('strong').style.color=points>0?'#d6fb53':'#ffa17c';label.querySelector('small').textContent=points>0?`+${Math.round(points)} DESTRUCTION${simulation.combo>1?' / '+simulation.combo+'× COMBO':''}`:`−${Math.max(1,Math.ceil(loss))}% ARMOR / KEEP MOVING`;impactTimer=1.3;}}}}}
const clock=new THREE.Clock();let hudTick=0;
const timings={physics:0,vehicles:0,effects:0,render:0};
function frame(){requestAnimationFrame(frame);const frameStart=performance.now(),raw=clock.getDelta(),dt=Math.min(raw,.25),simulationDt=Math.min(raw,5);elapsed+=paused?0:dt;frameMs=frameMs*.97+raw*1000*.03;renderFrames++;let input=getInput();const active=running&&!paused&&!ended&&!starting;
  if(starting&&!paused){countdown-=simulationDt;const number=Math.ceil(countdown);if(number!==lastBeep&&number>0){lastBeep=number;audio.beep();}$('countdown').textContent=number>0?number:'WRECK ’EM.';if(countdown<=0){starting=false;simulation.start();audio.beep(true);countdownHideTimeout=setTimeout(()=>{$('countdown').hidden=true;},650);}}
  if(active){accumulator+=simulationDt;while(accumulator>=1/60){const previousHealth=simulation.cars[0].health,previousScore=simulation.score;simulation.update(1/60,input);handleEvents(previousHealth,previousScore);accumulator-=1/60;if(simulation.state==='won'||simulation.state==='lost'){finish();break;}}}
  const physicsEnd=performance.now();timings.physics=physicsEnd-frameStart;
  const p=simulation.cars[0];for(const car of simulation.cars){const model=models.get(car.id);if(!model)continue;model.position.set(car.x,0,car.z);model.rotation.y=car.yaw;updateVehicle(model,car,paused?0:dt,elapsed);}
  const vehiclesEnd=performance.now();timings.vehicles=vehiclesEnd-physicsEnd;
  effects.update(paused?0:dt,simulation.cars,active);
  timings.effects=performance.now()-vehiclesEnd;
  if(!running){const angle=Math.sin(elapsed*.07)*.055;camera.position.lerp(desired.set(44+Math.sin(angle)*40,30,49),1-Math.exp(-dt*2));look.lerp(target.set(-4,0,1),1-Math.exp(-dt*2));camera.fov=47;}else if(!paused){const portrait=camera.aspect<.8,fwdX=Math.sin(p.yaw),fwdZ=Math.cos(p.yaw),speed=Math.abs(p.speed),distance=(cameraMode?16:10.5)*(portrait?1.12:1);desired.set(p.x-fwdX*(distance+speed*.08),(cameraMode?11:5.6+speed*.045)+(portrait?1.2:0),p.z-fwdZ*(distance+speed*.08));desired.x=THREE.MathUtils.clamp(desired.x,-41,41);desired.z=THREE.MathUtils.clamp(desired.z,-30,30);const closeDistance=Math.hypot(desired.x-p.x,desired.z-p.z);desired.y+=Math.max(0,7-closeDistance)*.5;camera.position.lerp(desired,1-Math.exp(-dt*(starting?8:5)));camera.position.x=THREE.MathUtils.clamp(camera.position.x,-41,41);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-30,30);target.set(p.x+fwdX*4+p.vx*.12,1.1,p.z+fwdZ*4+p.vz*.12);look.lerp(target,1-Math.exp(-dt*7));camera.fov=THREE.MathUtils.lerp(camera.fov,(portrait?72:cameraMode?53:58)+(input.boost&&active&&p.boost>0?5:0)+speed*.12,1-Math.exp(-dt*3));}
  camera.lookAt(look);if(shake>.005&&!paused){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake*.65;}camera.updateProjectionMatrix();shake*=Math.exp(-dt*8);flash*=Math.exp(-dt*6);if(flash<.004)flash=0;$('hit-flash').style.opacity=flash;impactTimer-=paused?0:dt;$('impact').classList.toggle('show',impactTimer>0);audio.update(p.speed,input.throttle,input.boost,active);hudTick+=dt;if(running&&hudTick>.08){updateHUD();hudTick=0;}const renderStart=performance.now();renderer.render(scene,camera);timings.render=performance.now()-renderStart;
}
// Read-only diagnostics allow independent tests to observe actual gameplay without altering it.
window.__WRECKAGE__={getSnapshot:()=>({state:simulation.state,paused,starting,time:simulation.time,score:simulation.score,takedowns:simulation.takedowns,cars:simulation.cars.map(c=>({id:c.id,x:c.x,z:c.z,yaw:c.yaw,speed:c.speed,health:c.health,boost:c.boost,alive:c.alive})),renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,frameMs:Math.round(frameMs),frames:renderFrames,softwareRenderer,name:rendererName,pixelRatio:renderer.getPixelRatio(),timings:{...timings}},camera:camera.position.toArray()})};
frame();$('loading').hidden=true;
