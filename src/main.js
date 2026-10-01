import * as THREE from 'three';
import { createWorld } from './world.js';
import { createGame } from './game.js';
import { createAudio } from './audio.js';
import { createNetwork } from './network.js';
import './style.css';

const icon = {
 signal:'<svg viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M2 19h7l4-11 7 23 5-18 3 6h6" stroke="currentColor" stroke-width="2"/><path d="M4 5h7M4 5v6M32 31h-7M32 31v-6" stroke="currentColor" opacity=".45"/></svg>',
 audio:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/></svg>',
 gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m9 3-.6 3-2 .9-2.7-.7-2 3.5L4 12l-2.3 2.3 2 3.5 2.7-.7 2 .9.6 3h4l.6-3 2-.9 2.7.7 2-3.5L18 12l2.3-2.3-2-3.5-2.7.7-2-.9L13 3H9Z"/><circle cx="11" cy="12" r="3"/></svg>',
 people:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4M16 4a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v3"/></svg>',
 skull:'<svg viewBox="0 0 32 38" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M16 3C3 3 1 19 7 23v6h5v5h8v-5h5v-6C31 19 29 3 16 3Z"/><path d="M9 15h4v5H9zM19 15h4v5h-4zM14 25l2-4 2 4M15 29v5M18 29v5"/></svg>',
 shield:'<svg viewBox="0 0 32 38" fill="none" stroke="currentColor" stroke-width="1.2"><path d="m16 3 12 5v12c0 7-12 15-12 15S4 27 4 20V8L16 3Z"/><path d="m10 20 4 4 8-11"/></svg>'
};
const $ = (s) => document.querySelector(s);
const app = $('#app');
app.innerHTML = `
<canvas id="scene" aria-label="Moonlit Blackpine relay station, rendered in Three.js"></canvas><div class="grain"></div>
<div id="menu"><div class="menu-vignette"></div><div class="shell">
 <header class="topbar"><a class="brand" href="/" aria-label="Dead Frequency home"><div class="brand-mark">${icon.signal}</div><div class="brand-name">DEAD FREQUENCY<span>AN AFTERHOURS PRODUCTION</span></div></a><nav class="nav" aria-label="Main"><button class="active" id="operations">OPERATIONS</button><button id="guide">FIELD GUIDE <span style="font-size:12px;margin-left:4px">↗</span></button></nav><div class="top-right"><span class="live-label"><i class="signal-dot"></i> SIGNAL DETECTED</span><button class="icon-button" id="mute" aria-label="Toggle audio" title="Toggle audio">${icon.audio}</button><button class="icon-button" id="settings" aria-label="Settings" title="Settings">${icon.gear}</button></div></header>
 <main class="hero"><div class="hero-content"><div class="eyebrow"><span class="tag">VOL. 01</span> THE BLACKPINE INCIDENT</div><h1>DEAD<span>FREQUENCY</span></h1><p class="hero-copy"><strong>The last broadcast wasn't a warning.</strong><br>It was an invitation. Hold the station. Watch your<br class="wide-br"> ammunition. Make it through one more night.</p><button class="primary deploy" id="deploy"><span>DEPLOY SOLO</span><span class="arrow">↗</span></button><button class="secondary coop-button" id="coop">${icon.people} <span>PLAY WITH FRIENDS</span><span style="opacity:.5;margin-left:8px;font-size:8px">2–4</span></button><div class="play-meta">ROUND-BASED SURVIVAL &nbsp; / &nbsp; NO SECOND CHANCES</div><div class="touch-warning">A keyboard and mouse are required to deploy.</div></div><div class="scene-caption"><div class="cross">+</div><div class="coord">46° 51′ 09.2″ N &nbsp; 09° 31′ 48.0″ E</div><p class="label">SOME SIGNALS SHOULD STAY LOST.</p></div></main>
 <section class="bottom-section" aria-label="Operation details"><div class="mission-grid"><div class="mission-cell"><div class="mini-map"></div><div><div class="cell-kicker">YOUR NEXT DEPLOYMENT</div><div class="cell-title">Blackpine Relay Station</div><div class="cell-sub">Alpine exclusion zone &nbsp; · &nbsp; 02:17 AM</div></div><span class="mission-index">01 / 01</span></div><div class="mission-cell"><div class="mode-icon">${icon.skull}</div><div><div class="cell-kicker">THE MISSION</div><div class="cell-title">Survive the frequency.</div><div class="cell-sub">Endless waves. Escalating odds.</div></div></div><div class="mission-cell"><div class="mode-icon">${icon.shield}</div><div><div class="cell-kicker">THREAT ASSESSMENT</div><div class="cell-title">Severe & unpredictable</div><div class="difficulty"><i></i><i></i><i></i><i></i><i></i></div></div></div></div><footer class="footer"><div class="footer-left"><span>HEADPHONES RECOMMENDED</span><span class="status-note"><i class="signal-dot"></i> SYSTEMS ONLINE</span></div><span class="version">EST. 1986 &nbsp; / &nbsp; BUILD 0.1.0</span><a href="/progress.html" target="_blank" rel="noopener">FIELD NOTES <span>↗</span></a></footer></section>
</div></div>
<div id="hud" class="hidden"><div id="hurt-vignette"></div><div class="hud-top"><div class="hud-location">BLACKPINE RELAY<small id="session-label">SOLO OPERATION / SIGNAL ACTIVE</small><div id="peer-list"></div></div><div class="wave-block"><label id="wave-label">WAVE</label><div class="wave-number" id="wave">01</div><div class="wave-enemies" id="enemies">SIGNAL INCOMING</div></div><div class="hud-score"><small>ESSENCE</small><span id="score">0000</span></div></div><div class="crosshair"></div><div id="hitmarker"></div><div id="announcement"><small>INCOMING TRANSMISSION</small><strong>HOLD THE LINE</strong></div><div id="interaction" class="hidden"></div><div class="hud-bottom"><div><div class="health-caption">+ VITALS <span id="health">100</span></div><div class="health-bar"><div class="health-fill"></div></div><div class="stamina-bar"><div class="stamina-fill"></div></div><div class="survivor-label">01 &nbsp; YOU / FIELD OPERATIVE</div></div><div><div class="weapon-label" id="weapon">AR-9 / AUTOMATIC</div><div class="ammo"><small id="reload-label"></small><b id="ammo">30</b> <span>/ <span id="reserve">120</span></span></div></div></div><div class="hud-hint"><kbd>W A S D</kbd> MOVE &nbsp; <kbd>R</kbd> RELOAD &nbsp; <kbd>E</kbd> INTERACT<br><kbd>SHIFT</kbd> SPRINT &nbsp; <kbd>RMB</kbd> AIM &nbsp; <kbd>ESC</kbd> PAUSE</div></div>
<div id="modal-root"></div><div id="toast" role="status"></div><div class="loading" id="loading"><div>${icon.signal}<h2>DEAD FREQUENCY</h2><p>ACQUIRING SIGNAL</p><div class="loader-track"></div></div></div>`;

const reward=document.createElement('div');reward.id='reward';$('#hud').append(reward);
const captureGuide=document.createElement('button');captureGuide.id='capture-guide';captureGuide.className='hidden';captureGuide.innerHTML='<span>READY WHEN YOU ARE</span><strong>CLICK TO ENTER THE FIELD ↗</strong><small>Mouse to aim · WASD to move · ESC to pause</small>';$('#hud').append(captureGuide);
const supplyMarker=document.createElement('div');supplyMarker.id='supply-marker';supplyMarker.className='hidden';$('#hud').append(supplyMarker);
const roster=document.createElement('div');roster.id='roster';roster.className='hidden';$('#hud').append(roster);
const plateLayer=document.createElement('div');plateLayer.id='plate-layer';plateLayer.className='hidden';$('#hud').append(plateLayer);
const damageArc=document.createElement('div');damageArc.id='damage-arc';$('#hud').append(damageArc);
const CALLSIGNS=['VIPER','ORACLE','MARLOW','KESTREL'];
const markerPosition=new THREE.Vector3();
const peerProjection=new THREE.Vector3();
let settings = { volume: .65, sensitivity: 1, quality: true, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, muted:false };
let hasSavedSettings=false;
try { const saved=localStorage.getItem('df-settings');hasSavedSettings=!!saved;settings={...settings,...JSON.parse(saved||'{}')}; } catch {}
const audio = createAudio();
audio.setVolume(settings.volume); audio.setMuted(settings.muted);
const canvas=$('#scene');
let renderer;
try { renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'}); } catch { $('#loading').innerHTML='<h2>RENDERER OFFLINE</h2><p>This experience needs a browser with WebGL enabled.</p>'; throw new Error('WebGL unavailable'); }
const gl=renderer.getContext(),debugRenderer=gl.getExtension('WEBGL_debug_renderer_info');
const softwareRendering=/swiftshader|llvmpipe|software/i.test(debugRenderer?gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL):'');
const resolutionScale=softwareRendering ? 0.75 : 1;
if(softwareRendering&&!hasSavedSettings)settings.quality=false;
renderer.setPixelRatio(Math.min(devicePixelRatio, settings.quality?1.65:1)*resolutionScale);
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=settings.quality;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate=false;
renderer.shadowMap.needsUpdate=true;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.2;
renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.08,180);
camera.position.set(13,7,18); camera.lookAt(0,2,-7);
const world=createWorld(THREE,scene);
let mode='menu',paused=false,modalType='',lastTime=performance.now(),elapsed=0,networkTimer=0,snapshotTimer=0,toastTimer,announceTimer,hitTimer,hurtTimer,rewardTimer,latestRemoteSnapshot=null,acquiredControls=false,firstDeployment=true,rosterTimer=0,latestPeerList=[],pendingWave=null,waveFlushTimer=null,damageArcTimer=null;
const input={keys:new Set(),lookX:0,lookY:0,firing:false,aiming:false};
const peers=new Map();
let network;
const game=createGame({THREE,scene,camera,world,audio,onEvent:gameEvent});
network=createNetwork({onStatus:networkStatus,onPeers:updatePeers,onSnapshot:data=>{if(!network.getState().isHost){latestRemoteSnapshot=data;if(mode==='playing')game.applySnapshot(data);updateLobby()}},onShot:(data,meta)=>{if(network.getState().isHost)game.applyRemoteShot({...data,playerId:meta.id})},onEvent:remoteEvent});

function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500)}
function announceWave(data){if(data.phase==='intermission')announce('SECTOR CLEAR','12 SECONDS TO RESUPPLY / CATCH YOUR BREATH');else announce(`WAVE ${String(data.wave??data.number??game.getState().wave).padStart(2,'0')}`,'THE SIGNAL IS GETTING STRONGER')}
function announce(title,sub='INCOMING TRANSMISSION'){ $('#announcement strong').textContent=title;$('#announcement small').textContent=sub;$('#announcement').classList.add('show');clearTimeout(announceTimer);announceTimer=setTimeout(()=>$('#announcement').classList.remove('show'),3200) }
function gameEvent(type,data={}){
 if(type==='shot'&&network?.getState().connected&&!network.getState().isHost)network.sendShot(data);
 if((type==='hit'||type==='kill')&&!data.remote){const h=$('#hitmarker');h.style.borderColor=type==='kill'?'#d7eaa2':'#f4f0db';h.classList.add('show');clearTimeout(hitTimer);hitTimer=setTimeout(()=>h.classList.remove('show'),130)}
 if(type==='kill'&&!data.remote){reward.textContent=`+${data.points||100}  /  ${data.headshot?'HEADSHOT':'ELIMINATED'}`;reward.classList.add('show');clearTimeout(rewardTimer);rewardTimer=setTimeout(()=>reward.classList.remove('show'),1100)}
 if(type==='hurt'){
   $('#hurt-vignette').style.opacity='.7';clearTimeout(hurtTimer);hurtTimer=setTimeout(()=>{$('#hurt-vignette').style.opacity=''},260);
   const dir=data.direction;
   if(Array.isArray(dir)&&dir.length===3){
     const fx=-Math.sin(game.getState().yaw),fz=-Math.cos(game.getState().yaw);
     const vx=-dir[0],vz=-dir[2];
     const dot=fx*vx+fz*vz,cross=fx*vz-fz*vx;
     if(Math.hypot(vx,vz)>.01){damageArc.style.transform=`rotate(${(Math.atan2(cross,dot)*180/Math.PI).toFixed(1)}deg)`;damageArc.classList.add('show');clearTimeout(damageArcTimer);damageArcTimer=setTimeout(()=>damageArc.classList.remove('show'),700)}
   }
 }
 if(type==='wave'&&data.phase!=='dead'){if(acquiredControls)announceWave(data);else pendingWave=data}
 if(type==='notification')toast(typeof data==='string'?data:data.text||data.message||'Transmission received');
 if(type==='death'){if(network?.getState().connected){publishOperator(true);if(network.getState().isHost)network.sendEvent({type:'defeat',snapshot:game.getSnapshot()})}setTimeout(()=>{if(mode==='playing')endRun()},650)}
 if(type==='peerDamage'&&network.getState().isHost)network.sendEvent({type:'damage',...data});
}
function saveSettings(){try{localStorage.setItem('df-settings',JSON.stringify(settings))}catch{}audio.setVolume(settings.volume);audio.setMuted(settings.muted);renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality?1.65:1)*resolutionScale);renderer.shadowMap.enabled=settings.quality;renderer.shadowMap.needsUpdate=true;$('#mute').style.opacity=settings.muted?'.4':'1';$('#mute').setAttribute('aria-pressed',String(settings.muted))}
function clearInput(){input.keys.clear();input.firing=false;input.aiming=false;input.lookX=0;input.lookY=0}
function closeModal(){ $('#modal-root').replaceChildren();modalType=''; if(mode==='menu')$('#deploy').focus({preventScroll:true}); }
function modal(type,content,closable=true){modalType=type;$('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">${closable?'<button class="close" aria-label="Close dialog">×</button>':''}${content}</section></div>`;$('.close')?.addEventListener('click',()=>{if(mode==='playing')resume();else closeModal()});if(type==='settings')queueMicrotask(()=>{for(const id of ['volume','sensitivity']){const range=$('#'+id);if(!range)continue;const value=document.createElement('output');value.htmlFor=id;range.after(value);const update=()=>{value.textContent=id==='volume'?Math.round(range.value*100)+'%':Number(range.value).toFixed(1)+'×';range.setAttribute('aria-valuetext',value.textContent)};range.addEventListener('input',update);update()}});setTimeout(()=>$('.modal button')?.focus(),20)}
function fieldGuide(){modal('guide',`<div class="eyebrow">FIELD MANUAL / CLASSIFIED</div><h2 id="modal-title">Stay on this frequency.</h2><p>Blackpine went silent three nights ago. Your team is the last one they sent. Keep moving, hold the courtyard, and survive each incoming wave.</p><div class="guide-grid">${[['W A S D','Move'],['MOUSE','Look'],['LMB','Fire'],['RMB','Aim down sights'],['R','Reload'],['SHIFT','Sprint'],['E','Use supply station'],['ESC','Pause / release mouse']].map(([k,t])=>`<div class="guide-item"><kbd>${k}</kbd>${t}</div>`).join('')}</div><p class="field-tip">Aim for the head. Buy ammunition at the illuminated supply cache between waves. Your vitals recover when you stay out of danger.</p><p>Co-op: create a room, send your friends the six-character code, and deploy together. The host keeps the shared operation running.</p><button class="primary" id="guide-done">COPY THAT <span>↗</span></button>`);$('#guide-done').onclick=closeModal}
function showSettings(){modal('settings',`<div class="eyebrow">OPERATOR PREFERENCES</div><h2 id="modal-title">Fine-tune your signal.</h2><div class="setting-row"><label for="volume">Master volume<small>Ambience, weapons & radio cues</small></label><input id="volume" aria-label="Master volume" type="range" min="0" max="1" step=".05" value="${settings.volume}"></div><div class="setting-row"><label for="sensitivity">Mouse sensitivity<small>Make every shot count</small></label><input id="sensitivity" type="range" min=".3" max="2" step=".1" value="${settings.sensitivity}"></div><div class="setting-row"><label for="quality">High-quality rendering<small>Dynamic shadows & higher resolution</small></label><input id="quality" type="checkbox" ${settings.quality?'checked':''}></div><div class="setting-row"><label for="motion">Reduced motion<small>Still deployment camera</small></label><input id="motion" type="checkbox" ${settings.reducedMotion?'checked':''}></div><button class="primary" id="settings-done">SAVE & CLOSE <span>↗</span></button>`);$('#volume').oninput=e=>{settings.volume=+e.target.value;saveSettings();audio.unlock()};$('#sensitivity').oninput=e=>{settings.sensitivity=+e.target.value;saveSettings()};$('#quality').onchange=e=>{settings.quality=e.target.checked;saveSettings()};$('#motion').onchange=e=>{settings.reducedMotion=e.target.checked;saveSettings()};$('#settings-done').onclick=()=>mode==='playing'?pauseMenu():closeModal()}
function showCoop(){modal('coop',`<div class="eyebrow">NO ONE GETS LEFT BEHIND</div><h2 id="modal-title">Better together.</h2><p>Establish a private frequency for up to four survivors. Share the room code, then hold the line together.</p><button class="primary" id="host-room">CREATE A ROOM <span>↗</span></button><div class="or">OR JOIN YOUR SQUAD</div><label class="eyebrow" for="join-code">ROOM CODE</label><input class="code-input" id="join-code" maxlength="6" placeholder="ABCDEF" autocomplete="off" spellcheck="false"><button class="secondary" id="join-room">JOIN FREQUENCY</button><p id="coop-error" class="error-text" role="status"></p>`);$('#host-room').onclick=async()=>{try{$('#host-room').disabled=true;await network.host();roomLobby()}catch(e){if($('#coop-error'))$('#coop-error').textContent=e.message;$('#host-room')&&( $('#host-room').disabled=false)}};$('#join-room').onclick=async()=>{const code=$('#join-code').value.trim().toUpperCase();if(!code)return void($('#coop-error').textContent='Enter the room code your squad shared.');try{$('#join-room').disabled=true;await network.join(code);roomLobby()}catch(e){if($('#coop-error'))$('#coop-error').textContent=e.message;$('#join-room')&&( $('#join-room').disabled=false)}};$('#join-code').onkeydown=e=>{if(e.key==='Enter')$('#join-room').click()}}
function roomLobby(){const n=network.getState();modal('lobby',`<div class="eyebrow">SECURE CHANNEL ESTABLISHED</div><h2 id="modal-title">Squad frequency.</h2><p>Send this code to your squad. Everyone should open this same game address and select Play with friends.</p><div class="room-code" id="room-code"></div><div class="room-status" id="room-status">1 / 4 OPERATORS CONNECTED</div><button class="secondary" id="copy-code">COPY ROOM CODE</button><button class="primary" id="start-coop">${n.isHost?'DEPLOY SQUAD':'READY / ENTER STATION'} <span>↗</span></button><button class="secondary" id="leave-room">LEAVE FREQUENCY</button>`);$('#room-code').textContent=n.room;$('#copy-code').onclick=async()=>{try{await navigator.clipboard.writeText(n.room);toast('Room code copied. Send it to your squad.')}catch{toast(`Your room code is ${n.room}`)}};$('#start-coop').onclick=()=>{if(n.isHost)network.sendEvent({type:'start'});startRun(true)};$('#leave-room').onclick=()=>{network.leave();closeModal()};updateLobby()}
function updateLobby(){if(!$('#room-status'))return;const n=network.getState();$('#room-status').textContent=`${1+n.peers.length} / 4 OPERATORS CONNECTED`;if(!n.isHost&&$('#start-coop')){const active=latestRemoteSnapshot&&['playing','intermission'].includes(latestRemoteSnapshot.phase);$('#start-coop').disabled=!active;$('#start-coop').textContent=active?'JOIN ACTIVE OPERATION ↗':'AWAITING HOST DEPLOYMENT'}}
function networkStatus(status){if(status?.status==='idle'){latestRemoteSnapshot=null;return}const text=typeof status==='string'?status:status?.message||status?.status||'';if(/disconnect|closed|ended|error/i.test(text)){toast(text);if(modalType==='lobby'&&!network.getState().connected)closeModal();if(mode==='playing'&&network&&!network.getState().connected){game.setAuthority(true);$('#session-label').textContent='CONNECTION LOST / SOLO OPERATION'}else if(mode==='dead'&&!network.getState().connected)endRun()}updateLobby()}
function remoteEvent(data,meta){const host=network.getState().peers.find(p=>p.isHost);if(meta?.id!==host?.id)return;if(data?.type==='start'&&mode!=='playing'){latestRemoteSnapshot=null;startRun(true)}if(data?.type==='damage'&&(data.id===network.getState().id||data.peerId===network.getState().id)){game.applyDamage?.(data.damage??data.amount??10)}if(data?.type==='defeat'&&mode==='playing'){game.applySnapshot(data.snapshot);endRun()}if(data?.type==='return'){returnToMenu();toast('The host returned to base.')}}
function makePeer(){
 const group=new THREE.Group();
 const cloth=new THREE.MeshStandardMaterial({color:0x556752,roughness:.95});
 const dark=new THREE.MeshStandardMaterial({color:0x232c28,roughness:.7});
 const skin=new THREE.MeshStandardMaterial({color:0xb0a286,roughness:1});
 const part=(geo,mat,x,y,z)=>{const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.castShadow=true;group.add(mesh);return mesh};
 part(new THREE.CapsuleGeometry(.25,.57,4,7),cloth,0,1.03,0);
 part(new THREE.BoxGeometry(.44,.48,.14),dark,0,1.12,-.21);
 part(new THREE.BoxGeometry(.34,.4,.22),cloth,0,1.12,.25);
 part(new THREE.SphereGeometry(.205,9,7),skin,0,1.62,0);
 part(new THREE.SphereGeometry(.225,9,7,0,Math.PI*2,0,Math.PI*.6),dark,0,1.7,0);
 part(new THREE.BoxGeometry(.16,.065,.035),new THREE.MeshBasicMaterial({color:0xd7eaa2}),.13,1.2,-.3);
 const limbs=[];
 for(const x of [-.15,.15]){const leg=new THREE.Group();leg.position.set(x,.73,0);const limb=new THREE.Mesh(new THREE.CapsuleGeometry(.105,.41,3,5),cloth);limb.position.y=-.25;const boot=new THREE.Mesh(new THREE.BoxGeometry(.2,.17,.32),dark);boot.position.set(0,-.62,-.05);leg.add(limb,boot);group.add(leg);limbs.push(leg)}
 for(const x of [-.32,.32]){const arm=part(new THREE.CapsuleGeometry(.09,.42,3,5),cloth,x,1.1,-.15);arm.rotation.x=-.75}
 part(new THREE.BoxGeometry(.12,.16,.62),dark,.18,1.03,-.53);
 part(new THREE.CylinderGeometry(.035,.035,.42,6),dark,.18,1.03,-.98).rotation.x=Math.PI/2;
 group.userData.limbs=limbs;scene.add(group);return group;
}
function updatePeers(list){if(!Array.isArray(list))return;latestPeerList=list;const ids=new Set();for(const p of list){if(p.id===network.getState().id)continue;ids.add(p.id);let peer=peers.get(p.id);let fresh=false;if(!peer){peer={mesh:makePeer(),data:p,target:new THREE.Vector3()};peers.set(p.id,peer);fresh=true}peer.data=p;const pos=p.position||p.state?.position;if(pos){peer.target.set(pos[0]??pos.x??0,Math.max(0,(pos[1]??pos.y??1.7)-1.7),pos[2]??pos.z??0);if(fresh)peer.mesh.position.copy(peer.target)}peer.mesh.visible=mode==='playing'&&p.health!==0&&p.active===true}for(const [id,p]of peers){if(!ids.has(id)){scene.remove(p.mesh);p.mesh.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose()});peers.delete(id)}}game.setPeers?.(list.filter(p=>p.active===true));updateRoster(list);updateLobby()}
function peerLabel(p,index){const n=network.getState();if(p.isHost)return p.id===n.id?'YOU · SQUAD LEADER':'SQUAD LEADER';if(p.id===n.id)return 'YOU';return `${CALLSIGNS[index%CALLSIGNS.length]} · 0${index+2}`}
function updateRoster(list){
 if(mode!=='playing'||!network.getState().connected){roster.classList.add('hidden');plateLayer.classList.add('hidden');return}
 const n=network.getState(),s=game.getState(),rows=[];
 rows.push({label:'YOU',health:s.health,me:true});
 list.filter(p=>p.id!==n.id).forEach((p,i)=>rows.push({label:peerLabel(p,i),health:p.health??100,down:p.health===0||p.active===false}));
 roster.innerHTML=rows.map(r=>`<div class="roster-row${r.down?' down':''}"><i></i><span>${r.label}</span><b>${r.down?'DOWN':Math.max(0,Math.ceil(r.health))}</b></div>`).join('');
 roster.classList.remove('hidden');
 if(n.connected&&peers.size){plateLayer.innerHTML=[...peers.values()].map((peer,i)=>`<div class="plate" data-peer="${i}"><span>${peerLabel(peer.data,i)}</span><em>${peer.data.health<=0?'DOWN':Math.max(0,Math.ceil(peer.data.health??100))}</em></div>`).join('');plateLayer.classList.remove('hidden')}
 else plateLayer.classList.add('hidden');
}
function updatePlates(){
 if(plateLayer.classList.contains('hidden'))return;
 camera.updateMatrixWorld();
 [...peers.values()].forEach((peer,i)=>{const node=plateLayer.querySelector(`[data-peer="${i}"]`);if(!node)return;peerProjection.set(peer.mesh.position.x,2.05,peer.mesh.position.z).project(camera);const on=mode==='playing'&&peer.mesh.visible&&peerProjection.z<1&&Math.abs(peerProjection.x)<1.1&&Math.abs(peerProjection.y)<1.1;node.style.display=on?'block':'none';if(on){node.style.left=`${(peerProjection.x*.5+.5)*100}%`;node.style.top=`${(-peerProjection.y*.5+.5)*100}%`}})}

function animatePeers(dt){for(const peer of peers.values()){const speed=peer.mesh.position.distanceTo(peer.target);peer.mesh.position.lerp(peer.target,1-Math.exp(-dt*14));const yaw=peer.data.yaw||0;peer.mesh.rotation.y+=Math.atan2(Math.sin(yaw-peer.mesh.rotation.y),Math.cos(yaw-peer.mesh.rotation.y))*(1-Math.exp(-dt*14));peer.mesh.userData.limbs.forEach((leg,i)=>leg.rotation.x=Math.sin(elapsed*9+i*Math.PI)*Math.min(speed*2,.65));peer.mesh.visible=mode==='playing'&&peer.data.health!==0&&peer.data.active===true}}
function publishOperator(force=false){const s=game.getState();network.sendState({position:camera.position.toArray(),yaw:s.yaw,health:s.health,active:mode==='playing'&&s.health>0},{force})}
async function lock(){try{await canvas.requestPointerLock()}catch{if(mode==='playing'&&!paused)captureGuide.classList.remove('hidden')}}
function startRun(coop=false){closeModal();if(!coop)network.leave();mode='playing';paused=false;acquiredControls=false;firstDeployment=true;pendingWave=null;clearTimeout(waveFlushTimer);clearInput();app.classList.add('in-field');reward.classList.remove('show');captureGuide.classList.remove('hidden');$('#menu').classList.add('hidden');$('#hud').classList.remove('hidden');audio.unlock().then(ok=>{if(ok&&mode==='playing')audio.play('start')});const n=network.getState();game.setAuthority(!coop||n.isHost);const spawnIndex=!coop||n.isHost?0:1+[...n.peers.filter(p=>!p.isHost).map(p=>p.id),n.id].sort().indexOf(n.id);game.start({spawnIndex});if(coop&&!n.isHost&&latestRemoteSnapshot)game.applySnapshot(latestRemoteSnapshot);if(coop)publishOperator(true);$('#session-label').textContent=coop?`CO-OP OPERATION / ${n.room}`:'SOLO OPERATION / SIGNAL ACTIVE';$('#announcement').classList.remove('show');lock();}
function pauseMenu(){if(mode!=='playing')return;paused=true;clearInput();document.exitPointerLock?.();modal('pause',`<div class="eyebrow">${network.getState().connected?'LIVE CO-OP / THE WORLD KEEPS MOVING':'TRANSMISSION ON HOLD'}</div><h2 id="modal-title">Catch your breath.</h2><p>${network.getState().connected?'Your squad is still in the field. Rejoin the frequency when you are ready.':'The night can wait a moment. Your operation is paused.'}</p><button class="primary" id="resume">BACK TO THE FIELD <span>↗</span></button><button class="secondary" id="pause-settings">SETTINGS</button><button class="secondary" id="quit">ABORT OPERATION</button>`,false);$('#resume').onclick=resume;$('#pause-settings').onclick=showSettings;$('#quit').onclick=returnToMenu}
function resume(){closeModal();paused=false;acquiredControls=false;clearInput();captureGuide.classList.remove('hidden');lock()}
function returnToMenu(){if(network.getState().connected&&network.getState().isHost)network.sendEvent({type:'return'});network.leave();mode='menu';paused=false;acquiredControls=false;app.classList.remove('in-field');document.exitPointerLock?.();closeModal();clearInput();game.reset();$('#hud').classList.add('hidden');$('#menu').classList.remove('hidden');for(const p of peers.values())p.mesh.visible=false;camera.fov=65;camera.updateProjectionMatrix()}
function endRun(){
 const s=game.getState(),n=network.getState();mode='dead';paused=true;clearInput();document.exitPointerLock?.();
 const anchorLost=s.health>0&&s.phase==='dead';
 modal('dead',`<div class="eyebrow">${anchorLost?'SQUAD ANCHOR LOST / OPERATION ENDED':'FINAL TRANSMISSION / SIGNAL LOST'}</div><h2 id="modal-title">${anchorLost?'The signal fell.<br>Stay together.':'The night won.<br>This time.'}</h2><p>${n.connected&&!n.isHost?'Stay on this frequency for the squad leader’s next deployment, or return to base.':'Blackpine remembers everyone who held the line.'}</p><div class="result-grid"><div><strong>${s.wave}</strong><small>WAVE REACHED</small></div><div><strong>${s.kills}</strong><small>ELIMINATIONS</small></div><div><strong>${s.score}</strong><small>ESSENCE</small></div></div><button class="primary" id="retry" ${n.connected&&!n.isHost?'disabled':''}>${n.connected?(n.isHost?'REDEPLOY SQUAD':'AWAITING SQUAD LEADER'):'ONE MORE NIGHT'} <span>↗</span></button><button class="secondary" id="debrief">RETURN TO BASE</button>`,false);
 $('#retry').onclick=()=>{if(network.getState().connected&&network.getState().isHost){latestRemoteSnapshot=null;network.sendEvent({type:'start'});startRun(true)}else startRun(false)};
 $('#debrief').onclick=returnToMenu;
}
function updateSupplyMarker(){
 const s=game.getState(),p=s.supplyPosition;if(!p)return;
 const distance=Math.hypot(camera.position.x-p[0],camera.position.z-p[2]);
 markerPosition.set(p[0],1.5,p[2]).project(camera);
 const visible=!paused&&acquiredControls&&distance<15&&distance>2.5&&markerPosition.z<1&&Math.abs(markerPosition.x)<.88&&Math.abs(markerPosition.y)<.8;
 supplyMarker.classList.toggle('hidden',!visible);
 if(visible){supplyMarker.textContent=`◇ AMMO CACHE · ${Math.round(distance)}m · ${s.resupplyCost} ESSENCE`;supplyMarker.style.left=`${(markerPosition.x*.5+.5)*innerWidth}px`;supplyMarker.style.top=`${(-markerPosition.y*.5+.5)*innerHeight}px`}
}
function updateHUD(){const s=game.getState();$('#wave').textContent=String(s.wave||1).padStart(2,'0');const left=Math.max(0,s.enemies??0);$('#enemies').textContent=s.phase==='intermission'?`NEXT WAVE IN ${Math.ceil(s.phaseTime||0)}s`:left===1?'1 HOSTILE REMAINING':`${left} HOSTILES REMAINING`;$('#score').textContent=String(s.score||0).padStart(4,'0');$('#health').textContent=Math.ceil(s.health);$('.health-fill').style.width=`${Math.max(0,s.health)}%`;$('.health-fill').style.background=s.health<30?'#e77b60':'#d7eaa2';$('.stamina-fill').style.width=`${(s.stamina<=1?s.stamina*100:s.stamina)??100}%`;$('#ammo').textContent=String(s.ammo).padStart(2,'0');$('#reserve').textContent=s.reserve;$('#weapon').textContent=s.weapon||'KESTREL / 9mm';$('#reload-label').textContent=s.reloading?'RELOADING':s.ammo===0?'[R] RELOAD':'';$('#interaction').textContent=s.interaction||'';$('#interaction').classList.toggle('hidden',!s.interaction);$('#hurt-vignette').classList.toggle('critical',s.health>0&&s.health<=30);document.querySelector('.crosshair').classList.toggle('ads',s.aiming);if(s.health<=0&&mode==='playing')endRun()}

$('#deploy').onclick=()=>startRun();$('#coop').onclick=showCoop;$('#guide').onclick=fieldGuide;$('#settings').onclick=showSettings;$('#operations').onclick=()=>{closeModal();toast('Blackpine Relay is ready for deployment.')};$('#mute').onclick=()=>{settings.muted=!settings.muted;audio.unlock();saveSettings();toast(settings.muted?'Radio silenced.':'Audio signal restored.')};
canvas.addEventListener('click',()=>{if(mode==='playing'&&!paused&&document.pointerLockElement!==canvas)lock()});
captureGuide.addEventListener('click',()=>{audio.unlock();lock()});
document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA/.test(e.target.tagName))return;if(e.code==='Escape'){if(mode==='playing'&&!paused)pauseMenu();else if(mode!=='playing'&&mode!=='dead')closeModal();return}if(mode!=='playing'||paused)return;input.keys.add(e.code);if(['Space','KeyW','KeyA','KeyS','KeyD','Tab'].includes(e.code))e.preventDefault()});
document.addEventListener('keyup',e=>input.keys.delete(e.code));document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&!paused){input.lookX+=e.movementX*settings.sensitivity;input.lookY+=e.movementY*settings.sensitivity}});
document.addEventListener('mousedown',e=>{if(mode==='playing'&&!paused&&document.pointerLockElement===canvas){if(e.button===0)input.firing=true;if(e.button===2)input.aiming=true}});document.addEventListener('mouseup',e=>{if(e.button===0)input.firing=false;if(e.button===2)input.aiming=false});canvas.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas){acquiredControls=true;captureGuide.classList.add('hidden');if(firstDeployment){firstDeployment=false;announce('HOLD THE LINE','BLACKPINE RELAY / 02:17 AM');if(pendingWave){clearTimeout(waveFlushTimer);waveFlushTimer=setTimeout(()=>{if(acquiredControls&&pendingWave){announceWave(pendingWave);pendingWave=null}},3600)}}}else{acquiredControls=false;if(pendingWave)pendingWave=null;if(mode==='playing'&&!paused)pauseMenu()}});window.addEventListener('blur',()=>{clearInput();if(mode==='playing'&&!paused)pauseMenu()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing'&&!paused)pauseMenu()});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
document.addEventListener('keydown',e=>{if(e.key==='Tab'&&modalType){const nodes=[...document.querySelectorAll('.modal button:not(:disabled),.modal input,.modal a')];if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-lastTime)/1000,.1);lastTime=now;elapsed+=dt;world.update?.(dt,elapsed);animatePeers(dt);if(mode==='menu'){const drift=settings.reducedMotion?0:Math.sin(elapsed*.06)*1.5;camera.position.set(13+drift,7+Math.sin(elapsed*.09)*.12,18);camera.lookAt(0,2,-7)}else if(mode==='playing'){if((!paused&&acquiredControls)||network.getState().connected){game.update(dt,paused||!acquiredControls?{keys:new Set(),lookX:0,lookY:0,firing:false,aiming:false}:input);input.lookX=0;input.lookY=0;audio.update(dt,game.getState());networkTimer+=dt;snapshotTimer+=dt;if(network.getState().connected){if(networkTimer>.07){networkTimer=0;publishOperator()}if(snapshotTimer>.1&&network.getState().isHost){snapshotTimer=0;network.sendSnapshot(game.getSnapshot())}}}updateHUD();updateSupplyMarker();updatePlates();rosterTimer+=dt;if(rosterTimer>.3){rosterTimer=0;updateRoster(latestPeerList)}}renderer.shadowMap.autoUpdate=mode==='playing'&&(!paused||network.getState().connected);renderer.render(scene,camera)}
requestAnimationFrame(frame);saveSettings();setTimeout(()=>{$('#loading').style.opacity='0';setTimeout(()=>$('#loading').remove(),500)},650);
// Read-only diagnostics for running-game reviewers and reproducible QA.
window.__DEAD_FREQUENCY__={get state(){return {...game.getState(),mode,paused,acquiredControls,network:network.getState(),position:camera.position.toArray(),drawCalls:renderer.info.render.calls,softwareRendering,resolutionScale}},get snapshot(){return game.getSnapshot()},get renderer(){return renderer.info},version:'0.1.0'};
