import * as THREE from 'three';

// ============ Fall Beans — Knockout Show ============
// 1 human + 59 bots, 5 rounds, crown final. All procedural, no assets.
const $ = (id)=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
let _seed=12345; function srand(s){_seed=s;} function rnd(){_seed=(_seed*1664525+1013904223)>>>0;return _seed/4294967296;}
function rand(a,b){return a+Math.random()*(b-a);} function randi(a,b){return Math.floor(rand(a,b+1));}
function pick(arr){return arr[Math.floor(Math.random()*arr.length)];}
const BEAN_COLORS=[0xff4d8d,0x29d3ff,0xffd23e,0x7dff6a,0xb06aff,0xff7a2e,0x3dffc8,0xff5c5c,0x4d7cff,0xf5ff4d,0xffffff,0x222831];

export const ROUNDS=[
 {name:'CANDY DASH', sub:'Door Dash meets bumpers', qual:40, time:150, desc:'Sprint the candy highway! Smash through REAL doors (pink ones are fake walls!), dodge donut bumpers, and be in the first 40 across the jelly finish.'},
 {name:'WHIRLY SPRINT', sub:'Whirlygig + Seesaw', qual:28, time:150, desc:'Narrow bridges, three giant whirly spinners and two wobbly seesaws. First 28 to the finish qualify. Time your spinner gaps!'},
 {name:'SLIME SPIN SURVIVAL', sub:'Block Party sweeper survival', qual:16, time:38, desc:'Survive the spinning sweeper arms on a shrinking-ish podium for 38 seconds. JUMP over the low arm! Last beans standing — top 16 qualify.'},
 {name:'CANDY CLIMB', sub:'Slime Climb semifinal', qual:8, time:160, desc:'Climb while the strawberry slime rises! Dodging shovers, pendulums and gaps. Only the first 8 to the top reach the FINAL.'},
 {name:'CROWN MOUNTAIN', sub:'Fall Mountain FINAL', qual:1, time:150, desc:'FINAL! Climb Crown Mountain past rollers and spinners and GRAB THE CROWN first. Winner takes the show! 👑'},
];

// ---------- Audio (100% code) ----------
const AudioSys={ctx:null,muted:false,musicTimer:null,
 init(){ if(this.ctx||this.muted) return; try{this.ctx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){} },
 tone(f,d=0.15,type='sine',v=0.25,slide=0){ if(!this.ctx||this.muted)return; const t=this.ctx.currentTime; const o=this.ctx.createOscillator(),g=this.ctx.createGain(); o.type=type;o.frequency.setValueAtTime(f,t); if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide),t+d); g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(0.001,t+d); o.connect(g).connect(this.ctx.destination); o.start(t);o.stop(t+d+0.02); },
 noise(d=0.3,v=0.2,fc=1200){ if(!this.ctx||this.muted)return; const t=this.ctx.currentTime; const len=this.ctx.sampleRate*d; const buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate); const ch=buf.getChannelData(0); for(let i=0;i<len;i++)ch[i]=(Math.random()*2-1)*(1-i/len); const s=this.ctx.createBufferSource();s.buffer=buf; const f=this.ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=fc; const g=this.ctx.createGain();g.gain.value=v; s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); },
 jump(){this.tone(300,0.18,'square',0.12,350);}, dive(){this.tone(500,0.25,'sawtooth',0.12,-300);},
 bump(){this.noise(0.18,0.35,300);this.tone(120,0.15,'sine',0.3,-60);},
 door(){this.noise(0.25,0.3,800);}, checkpoint(){this.tone(660,0.12,'sine',0.2);this.tone(880,0.15,'sine',0.2);},
 count(n){this.tone(n===0?880:440,0.15,'square',0.2);}, qual(){[523,659,784,1046].forEach((f,i)=>setTimeout(()=>this.tone(f,0.2,'triangle',0.25),i*110));},
 elim(){[400,300,200].forEach((f,i)=>setTimeout(()=>this.tone(f,0.25,'sawtooth',0.18),i*140));},
 crown(){[523,659,784,1046,1318,1568].forEach((f,i)=>setTimeout(()=>this.tone(f,0.35,'triangle',0.25),i*130)); this.noise(1.5,0.12,3000);},
 cheer(){this.noise(1.2,0.25,1200);}, click(){this.tone(700,0.06,'square',0.12);},
 music(){ if(!this.ctx||this.muted||this.musicTimer)return; const seq=[262,294,330,392,440,392,330,294]; let i=0; this.musicTimer=setInterval(()=>{ if(this.muted)return; this.tone(seq[i%seq.length],0.16,'triangle',0.06); if(i%2===0)this.tone(seq[(i/2|0)%seq.length]/2,0.2,'sine',0.05); i++; },210); },
 stopMusic(){ if(this.musicTimer){clearInterval(this.musicTimer);this.musicTimer=null;} }
};
window.addEventListener('pointerdown',()=>{AudioSys.init();AudioSys.music();},{once:false});

// ---------- Difficulty ----------
const DIFFS={easy:{botMin:0.66,botMax:0.88,mistake:0.42,stumble:0.055,wait:0.5,label:'Easy'},
 normal:{botMin:0.80,botMax:0.97,mistake:0.22,stumble:0.03,wait:0.2,label:'Normal'},
 hard:{botMin:0.90,botMax:1.06,mistake:0.10,stumble:0.015,wait:0.05,label:'Hard'}};
let difficulty='easy';

// ---------- Bean logic (headless-safe) ----------
let beanId=0;
export function makeBean(isPlayer,colorHex,skill){
 return {id:beanId++, isPlayer, color:colorHex, pos:{x:0,y:2,z:0}, vel:{x:0,y:0,z:0},
  onGround:true, diving:false, diveT:0, stun:0, stumbleT:0, finished:false, finishTime:0, finishRank:0,
  eliminated:false, maxZ:-1e9, score:0, dodges:0, falls:0, checkpoint:{x:0,y:2,z:0}, wpIdx:0,
  wob:Math.random()*10, waitT:0, lateral:rand(-1,1), jumpCD:0, mesh:null,
  skill:skill||{spd:1, mistake:0.2, stumble:0.03}};
}
function diffSkill(){
 const d=DIFFS[difficulty]; return {spd:rand(d.botMin,d.botMax), mistake:Math.random()*d.mistake, stumble:d.stumble+Math.random()*0.03};
}
export function physStep(b,inp,world,dt,time){
 if(b.finished||b.eliminated) return;
 if(b.stun>0){b.stun-=dt;}
 if(b.stumbleT>0){b.stumbleT-=dt;}
 if(b.waitT>0){b.waitT-=dt;}
 if(b.jumpCD>0)b.jumpCD-=dt;
 const locked=b.stun>0||b.stumbleT>0;
 const MAXS=7.6*b.skill.spd*(b.diving?0.4:1);
 let dx=0,dz=0;
 if(!locked&&b.waitT<=0){dx=inp.x||0;dz=inp.z||0;const m=Math.hypot(dx,dz);if(m>1){dx/=m;dz/=m;}}
 const ACC=b.onGround?42:16;
 b.vel.x=lerp(b.vel.x,dx*MAXS,clamp(ACC*dt/MAXS*2.2,0,1));
 b.vel.z=lerp(b.vel.z,dz*MAXS,clamp(ACC*dt/MAXS*2.2,0,1));
 if(!locked&&inp.jump&&b.onGround&&b.jumpCD<=0){b.vel.y=9.6;b.onGround=false;b.jumpCD=0.25;if(b.isPlayer)AudioSys.jump();}
 if(!locked&&inp.dive&&!b.diving&&b.diveT<=0){b.diving=true;b.diveT=0.62;const m=Math.hypot(dx,dz)||1;const fx=(dx/m)||0,fz=(dz/m)||(b.isPlayer?1:0);b.vel.x=fx*11.5;b.vel.z=fz*11.5;b.vel.y=Math.max(b.vel.y,3.6);if(b.isPlayer)AudioSys.dive();}
 if(b.diving){b.diveT-=dt;if(b.diveT<=0){b.diving=false;}}
 b.vel.y-=23*dt;
 b.pos.x+=b.vel.x*dt;b.pos.y+=b.vel.y*dt;b.pos.z+=b.vel.z*dt;
 const g=world.groundHeight(b.pos.x,b.pos.z,b);
 if(g!==-Infinity&&b.pos.y<=g){ if(!b.onGround&&b.vel.y<-12&&b.isPlayer){AudioSys.bump();} b.pos.y=g;b.vel.y=0;b.onGround=true; if(b.diving&&b.diveT<0.35){b.diving=false;} }
 else if(g===-Infinity||b.pos.y>g+0.05){b.onGround=false;}
 b.maxZ=Math.max(b.maxZ,b.pos.z);
 b.wob+=dt*(2+Math.hypot(b.vel.x,b.vel.z)*0.7);
 // fall / slime / kill
 world.hazards(b,time,dt);
 // checkpoints
 world.checkpoint(b);
}
// Bot brain: shared for all rounds
export function botInput(b,world,dt,time){
 const d=DIFFS[difficulty];
 const wp=world.waypoints(b);
 // occasional human pause at spinners
 if(world.dangerNear&&world.dangerNear(b,time)&&Math.random()<b.skill.mistake*0.06){b.waitT=Math.max(b.waitT,d.wait*Math.random());}
 // random stumble
 if(Math.random()<b.skill.stumble*dt){b.stumbleT=rand(0.3,0.8);b.vel.x+=rand(-6,6);b.vel.z+=rand(-4,4);b.lateral=rand(-1.5,1.5);}
 // pick waypoint
 let tx=wp.x,tz=wp.z;
 // human error: lateral drift + occasional wrong door/pick
 const err=b.lateral*2.2*b.skill.mistake+Math.sin(time*0.7+b.id)*0.8*b.skill.mistake;
 tx+=err*3;
 if(world.pickTarget) {const pt=world.pickTarget(b,time); if(pt){tx=pt.x;tz=pt.z;}}
 const dx=tx-b.pos.x,dz=tz-b.pos.z;const m=Math.hypot(dx,dz)||1;
 let ix=dx/m,iz=dz/m;
 if(m<2.5){b.wpIdx++;b.lateral=rand(-1,1);}
 // jump decisions
 let jump=false,dive=false;
 if(world.shouldJump&&world.shouldJump(b,time)) jump=Math.random()>b.skill.mistake*0.5;
 else if(m>1&&Math.random()<0.008) jump=true; // random bunny hop like humans
 if(world.shouldDive&&world.shouldDive(b,time)) dive=Math.random()>b.skill.mistake;
 // lunge at finish
 if(world.isFinishNear&&world.isFinishNear(b)&&Math.random()<0.03) dive=true;
 return {x:ix,z:iz,jump,dive};
}

// ---------- Worlds (logic, no THREE dependency except visuals) ----------
function doorWallState(seedN,n,openCount){ srand(seedN); const open=new Set(); while(open.size<openCount)open.add(Math.floor(rnd()*n)); return open; }
export function makeWorld(idx,nPlayers,diff){
 if(idx===0)return makeDoorDash(nPlayers);
 if(idx===1)return makeWhirly(nPlayers);
 if(idx===2)return makeSpinSurv(nPlayers);
 if(idx===3)return makeClimb(nPlayers);
 return makeMountain(nPlayers);
}
// R1 DOOR DASH
function makeDoorDash(n){
 const W={idx:0,name:ROUNDS[0].name,qual:ROUNDS[0].qual,limit:ROUNDS[0].time,time:0,finished:0,
  wallZ:[45,95,155],doors:[],bumpers:[{x:-5,z:65,r:1.6,ph:0},{x:6,z:125,r:1.6,ph:2},{x:0,z:132,r:1.6,ph:4}],
  finishZ:195,width:13};
 doorWallState(7,8,4); W.doors=W.wallZ.map((z,wi)=>{const open=doorWallState(100+wi,8,4);return{z,open,n:8};});
 W.spawn=(b,i)=>{const row=Math.floor(i/10),col=i%10;b.pos.x=(col-4.5)*2.2+rand(-.3,.3);b.pos.z=4-row*2.2;b.pos.y=0.9;b.checkpoint={x:b.pos.x,y:0.9,z:b.pos.z};b.maxZ=b.pos.z;b.wpIdx=0;};
 W.groundHeight=(x,z)=>{ if(z<-4||z>W.finishZ+14)return -Infinity; if(Math.abs(x)>W.width+(z>W.finishZ-2?6:0))return -Infinity; // side fall
   if(z>0&&z<16) return 0.9; return 0.9; };
 W.update=(beans,dt)=>{W.time+=dt; // bumpers orbit slightly
  for(const o of W.bumpers)o.ph+=dt*1.5;
  for(const b of beans){ if(b.finished||b.eliminated)continue;
   // door collision
   for(const wall of W.doors){ if(Math.abs(b.pos.z-wall.z)<1.1&&b.pos.y<6){ const dw=(W.width*2)/wall.n; const li=clamp(Math.floor((b.pos.x+W.width)/dw),0,wall.n-1); if(!wall.open.has(li)){ b.pos.z=wall.z+(b.pos.z>wall.z?1.1:-1.1); b.vel.z*=-0.25; if(Math.abs(b.vel.z)>4&&b.isPlayer)AudioSys.door(); if(Math.hypot(b.vel.x,b.vel.z)>6){b.stun=Math.max(b.stun,0.35);} } } }
   // bumpers
   for(const o of W.bumpers){const ox=o.x+Math.sin(o.ph)*2.2;const dx=b.pos.x-ox,dz=b.pos.z-o.z;const d=Math.hypot(dx,dz);if(d<o.r+0.9&&b.pos.y<3){const m=d||1;const f=16;b.vel.x=dx/m*f;b.vel.z=dz/m*f;b.vel.y=6;b.stun=0.7;b.onGround=false;if(b.isPlayer)AudioSys.bump();}}
   // finish
   if(b.pos.z>=W.finishZ&&!b.finished){b.finished=true;b.finishTime=W.time;b.finishRank=++W.finished;if(b.isPlayer){AudioSys.qual();}}
  }};
 W.waypoints=(b)=>{const z=b.pos.z;const opts=[10,40,50,75,90,100,130,150,160,195];let tz=opts[b.wpIdx]||195;if(tz>195)tz=195;return{x:clamp(b.pos.x*0.4,-6,6),z:tz};};
 W.pickTarget=(b)=>{ // aim at an (often wrong) door when approaching wall
  for(const wall of W.doors){const dz=wall.z-b.pos.z;if(dz>0&&dz<22){const dw=(W.width*2)/wall.n;const open=[...wall.open];let li;if(Math.random()<b.skill.mistake*0.9){li=Math.floor(Math.random()*wall.n);}else{li=open[Math.floor(Math.random()*open.length)];}return{x:-W.width+dw*(li+0.5),z:wall.z+1.5};}}return null;};
 W.dangerNear=()=>false; W.shouldJump=(b)=>{for(const o of W.bumpers){if(Math.hypot(b.pos.x-o.x,b.pos.z-o.z)<6&&b.onGround)return true;}return false;};
 W.shouldDive=()=>false; W.isFinishNear=(b)=>W.finishZ-b.pos.z<9;
 W.hazards=(b)=>{if(b.pos.y<-6){b.falls++;const cp=b.checkpoint;b.pos.x=cp.x;b.pos.y=cp.y+1;b.pos.z=cp.z;b.vel.x=b.vel.z=b.vel.y=0;b.stun=0.4;}};
 W.checkpoint=(b)=>{const marks=[0,50,100,160];for(const z of marks){if(b.pos.z>z&&b.checkpoint.z<z)b.checkpoint={x:clamp(b.pos.x,-8,8),y:0.9,z:z+2};}};
 W.progress=(b)=>b.finished?1e6-b.finishRank*10:b.maxZ-b.falls*4;
 W.rankOf=(beans,b)=>{const s=[...beans].sort((a,c)=>W.progress(c)-W.progress(a));return s.indexOf(b)+1;};
 return W;
}
// R2 WHIRLY
function makeWhirly(n){
 const W={idx:1,name:ROUNDS[1].name,qual:ROUNDS[1].qual,limit:ROUNDS[1].time,time:0,finished:0,finishZ:215,width:7,
  spinners:[{z:50,len:11,w:1.4,a:0,sp:0.9},{z:112,len:11,w:1.4,a:2,sp:-1.1},{z:168,len:11,w:1.4,a:4,sp:1.25}],seesaws:[{z0:72,z1:94},{z0:134,z1:156}]};
 W.spawn=(b,i)=>{const row=Math.floor(i/8),col=i%8;b.pos.x=(col-3.5)*1.7;b.pos.z=4-row*2;b.pos.y=0.9;b.checkpoint={x:b.pos.x,y:0.9,z:b.pos.z};b.maxZ=b.pos.z;b.wpIdx=0;};
 W.groundHeight=(x,z)=>{if(z<-4||z>W.finishZ+14)return -Infinity;const w=Math.abs(x)>W.width+(z<16?4:0);if(w)return -Infinity;return 0.9;};
 W.update=(beans,dt)=>{W.time+=dt;for(const s of W.spinners)s.a+=s.sp*dt;
  for(const b of beans){if(b.finished||b.eliminated)continue;
   for(const s of W.spinners){if(Math.abs(b.pos.z-s.z)<1.6&&b.pos.y<3){const bx=Math.cos(s.a)*s.len/2,bz=Math.sin(s.a)*s.len/2; // bar endpoints ±
     // distance to segment through origin
     const px=b.pos.x,pz=b.pos.z-s.z;const vx=Math.cos(s.a),vz=Math.sin(s.a);const t=clamp(px*vx+pz*vz,-s.len/2,s.len/2);const cx=vx*t,cz=vz*t;const d=Math.hypot(px-cx,pz-cz);
     if(d<1.2){const dir=s.sp>0?1:-1;const tx=-vz*dir,tz=vx*dir;b.vel.x=tx*15;b.vel.z=tz*10+4;b.vel.y=6;b.stun=0.8;b.onGround=false;if(b.isPlayer)AudioSys.bump();}}}
   if(b.pos.z>=W.finishZ&&!b.finished){b.finished=true;b.finishTime=W.time;b.finishRank=++W.finished;if(b.isPlayer)AudioSys.qual();}
  }};
 W.waypoints=(b)=>{const opts=[10,45,60,80,105,120,145,163,185,215];return{x:0,z:opts[Math.min(b.wpIdx,opts.length-1)]};};
 W.pickTarget=null;
 W.dangerNear=(b)=>{for(const s of W.spinners){if(Math.abs(b.pos.z-s.z)<8&&Math.abs(b.pos.z-s.z)>1)return true;}return false;};
 W.shouldJump=()=>false;W.shouldDive=()=>false;W.isFinishNear=(b)=>W.finishZ-b.pos.z<9;
 W.hazards=(b)=>{if(b.pos.y<-6){b.falls++;const cp=b.checkpoint;b.pos.x=cp.x;b.pos.y=cp.y+1;b.pos.z=cp.z;b.vel.x=b.vel.z=b.vel.y=0;b.stun=0.4;}};
 W.checkpoint=(b)=>{const marks=[0,60,120,175];for(const z of marks){if(b.pos.z>z&&b.checkpoint.z<z)b.checkpoint={x:0,y:0.9,z:z+2};}};
 W.progress=(b)=>b.finished?1e6-b.finishRank*10:b.maxZ-b.falls*4;
 W.rankOf=(beans,b)=>{const s=[...beans].sort((a,c)=>W.progress(c)-W.progress(a));return s.indexOf(b)+1;};
 return W;
}
// R3 SPIN SURVIVAL
function makeSpinSurv(n){
 const W={idx:2,name:ROUNDS[2].name,qual:ROUNDS[2].qual,limit:ROUNDS[2].time,time:0,R:16,armA:0,armH:1.5};
 W.spawn=(b,i)=>{const a=(i/n)*Math.PI*2,r=4+((i*37)%10);b.pos.x=Math.cos(a)*r;b.pos.z=Math.sin(a)*r;b.pos.y=0.9;b.checkpoint={x:b.pos.x,y:0.9,z:b.pos.z};b.maxZ=0;b.wpIdx=0;b.score=0;};
 W.groundHeight=(x,z)=>{const r=Math.hypot(x,z);if(r>W.R)return -Infinity;return 0.9;};
 W.update=(beans,dt)=>{W.time+=dt;W.armA+=dt*1.05;
  for(const b of beans){if(b.finished||b.eliminated)continue;
   const r=Math.hypot(b.pos.x,b.pos.z);
   // two arms opposite
   for(let k=0;k<2;k++){const aa=W.armA+k*Math.PI;let da=Math.atan2(b.pos.z,b.pos.x)-aa;while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;
    if(Math.abs(da)<0.14&&r<W.R&&b.pos.y<2.6){ // hit unless jumping
     if(b.pos.y>1.7){b.dodges++;b.score+=2;if(b.isPlayer)AudioSys.checkpoint();}
     else{const tx=-Math.sin(aa),tz=Math.cos(aa);const dir=(Math.cos(da)*0+1)>0?1:1;b.vel.x=tx*13*dir;b.vel.z=tz*13*dir;b.vel.y=5.5;b.stun=0.7;b.onGround=false;if(b.isPlayer)AudioSys.bump();}
    }}
   b.score+=dt; // survival points
  }};
 W.waypoints=(b)=>{ // stay near middle-ish ring, drift from arm
  const aa=W.armA;const px=b.pos.x,pz=b.pos.z;const r=Math.hypot(px,pz)||1;
  // target: move tangentially away + slight inward pull
  return{x:px*0.3+Math.cos(aa+1.2)*7, z:pz*0.3+Math.sin(aa+1.2)*7};};
 W.pickTarget=null;W.dangerNear=()=>false;
 W.shouldJump=(b)=>{for(let k=0;k<2;k++){const aa=W.armA+k*Math.PI;let da=Math.atan2(b.pos.z,b.pos.x)-aa;while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;const r=Math.hypot(b.pos.x,b.pos.z);if(Math.abs(da)<0.45&&r<W.R-1&&b.onGround)return true;}return false;};
 W.shouldDive=()=>false;W.isFinishNear=()=>false;
 W.hazards=(b)=>{if(b.pos.y<-6||Math.hypot(b.pos.x,b.pos.z)>W.R+2){if(!b.eliminated){b.eliminated=true;b.score=W.time*0.5;}}};
 W.checkpoint=()=>{};W.progress=(b)=>b.eliminated?-1e6+b.score:b.score+10000;
 W.rankOf=(beans,b)=>{const s=[...beans].sort((a,c)=>W.progress(c)-W.progress(a));return s.indexOf(b)+1;};
 return W;
}
// R4 SLIME CLIMB
function makeClimb(n){
 const W={idx:3,name:ROUNDS[3].name,qual:ROUNDS[3].qual,limit:ROUNDS[3].time,time:0,finished:0,finishZ:185,width:8,slime:-3,pends:[{x:0,z:70,L:7,a:0,sp:1.4},{x:0,z:130,L:7,a:2,sp:-1.6}],pushers:[{z:45,ph:0},{z:100,ph:2},{z:150,ph:4}]};
 const yAt=(z)=>clamp(z/185,0,1)*26+0.9;
 W.yAt=yAt;
 W.spawn=(b,i)=>{const row=Math.floor(i/8),col=i%8;b.pos.x=(col-3.5)*1.8;b.pos.z=4-row*2;b.pos.y=yAt(b.pos.z);b.checkpoint={x:b.pos.x,y:b.pos.y,z:b.pos.z};b.maxZ=b.pos.z;b.wpIdx=0;};
 W.groundHeight=(x,z)=>{if(z<-4||z>W.finishZ+14)return -Infinity;if(Math.abs(x)>W.width+(z<14?4:0))return -Infinity; // gaps
  if(z>55&&z<62&&Math.abs(x)<W.width)return -Infinity; // gap 1 (jump it)
  if(z>115&&z<122&&Math.abs(x)<W.width)return -Infinity; // gap 2
  return yAt(z);};
 W.update=(beans,dt)=>{W.time+=dt;W.slime=-3+W.time*0.34;for(const p of W.pends)p.a+=p.sp*dt;for(const p of W.pushers)p.ph+=dt*1.1;
  for(const b of beans){if(b.finished||b.eliminated)continue;
   // pushers: blocks sliding across
   for(const p of W.pushers){if(Math.abs(b.pos.z-p.z)<1.6){const bx=Math.sin(p.ph)*8;if(Math.abs(b.pos.x-bx)<1.6&&Math.abs(b.pos.y-yAt(p.z))<2.5){b.vel.x=(b.pos.x>=bx?1:-1)*13;b.vel.y=5;b.stun=0.6;b.onGround=false;if(b.isPlayer)AudioSys.bump();}}}
   // pendulums
   for(const p of W.pends){const px=p.x+Math.sin(p.a)*p.L*0.7,py=yAt(p.z)+5+Math.cos(p.a)*2;if(Math.hypot(b.pos.x-px,b.pos.z-p.z)<1.6&&Math.abs(b.pos.y-py)<2.5){b.vel.x=(b.pos.x>=px?1:-1)*14;b.vel.z+=5;b.vel.y=6;b.stun=0.8;b.onGround=false;if(b.isPlayer)AudioSys.bump();}}
   // slime
   if(b.pos.y<W.slime+0.4){b.falls++;const cp=b.checkpoint;b.pos.x=cp.x;b.pos.y=cp.y+1;b.pos.z=cp.z;b.vel.x=b.vel.z=b.vel.y=0;b.stun=0.5;if(b.isPlayer)AudioSys.elim();}
   if(b.pos.z>=W.finishZ&&!b.finished){b.finished=true;b.finishTime=W.time;b.finishRank=++W.finished;if(b.isPlayer)AudioSys.qual();}
  }};
 W.waypoints=(b)=>{const opts=[20,42,58,66,90,112,128,145,160,185];return{x:0,z:opts[Math.min(b.wpIdx,opts.length-1)]};};
 W.pickTarget=null;W.dangerNear=(b)=>{for(const p of W.pushers){if(Math.abs(b.pos.z-p.z)<7)return true;}return false;};
 W.shouldJump=(b)=>{if((b.pos.z>50&&b.pos.z<56)||(b.pos.z>110&&b.pos.z<116))return true;return false;};
 W.shouldDive=(b)=>{if((b.pos.z>56&&b.pos.z<62)||(b.pos.z>116&&b.pos.z<122))return Math.random()>0.4;return false;};
 W.isFinishNear=(b)=>W.finishZ-b.pos.z<9;
 W.hazards=(b)=>{if(b.pos.y<-8){b.falls++;const cp=b.checkpoint;b.pos.x=cp.x;b.pos.y=cp.y+1;b.pos.z=cp.z;b.vel.x=b.vel.z=b.vel.y=0;}};
 W.checkpoint=(b)=>{const marks=[0,40,66,95,128,160];for(const z of marks){if(b.pos.z>z&&b.checkpoint.z<z)b.checkpoint={x:clamp(b.pos.x,-5,5),y:yAt(z+2),z:z+2};}};
 W.progress=(b)=>b.finished?1e6-b.finishRank*10:b.maxZ-b.falls*6;
 W.rankOf=(beans,b)=>{const s=[...beans].sort((a,c)=>W.progress(c)-W.progress(a));return s.indexOf(b)+1;};
 return W;
}
// R5 MOUNTAIN FINAL
function makeMountain(n){
 const W={idx:4,name:ROUNDS[4].name,qual:1,limit:ROUNDS[4].time,time:0,finished:0,finishZ:150,width:9,crownGot:false,winner:null,
  rollers:[{z:60,ph:0},{z:95,ph:2},{z:120,ph:1}],spinner:{z:80,len:12,a:0,sp:1.0}};
 const yAt=(z)=>clamp(z/150,0,1)*30+0.9; W.yAt=yAt;
 W.spawn=(b,i)=>{const col=i%8;b.pos.x=(col-3.5)*2;b.pos.z=4-Math.floor(i/8)*2;b.pos.y=yAt(b.pos.z);b.checkpoint={x:b.pos.x,y:b.pos.y,z:b.pos.z};b.maxZ=b.pos.z;b.wpIdx=0;};
 W.groundHeight=(x,z)=>{if(z<-4||z>W.finishZ+20)return -Infinity;if(Math.abs(x)>W.width+(z<14?5:0))return -Infinity;return yAt(z);};
 W.update=(beans,dt)=>{W.time+=dt;W.spinner.a+=W.spinner.sp*dt;for(const r of W.rollers)r.ph+=dt*2.2;
  for(const b of beans){if(b.finished||b.eliminated)continue;
   // rollers push downhill
   for(const r of W.rollers){if(Math.abs(b.pos.z-r.z)<3){const rx=Math.sin(r.ph+b.id)*7;if(Math.abs(b.pos.x-rx)<2&&Math.abs(b.pos.y-yAt(r.z))<3){b.vel.z-=12*dt*10*0.4;b.vel.x+=(b.pos.x-rx)*4;if(b.isPlayer&&Math.random()<0.05)AudioSys.bump();}}}
   // spinner
   const s=W.spinner;if(Math.abs(b.pos.z-s.z)<1.8&&b.pos.y<yAt(s.z)+3){const vx=Math.cos(s.a),vz=Math.sin(s.a);const px=b.pos.x,pz=b.pos.z-s.z;const t=clamp(px*vx+pz*vz,-s.len/2,s.len/2);const d=Math.hypot(px-vx*t,pz-vz*t);if(d<1.3){b.vel.x=-vz*15;b.vel.z=vx*10;b.vel.y=6;b.stun=0.8;b.onGround=false;if(b.isPlayer)AudioSys.bump();}}
   // crown grab
   const cz=W.finishZ+6;if(Math.hypot(b.pos.x-0,b.pos.z-cz)<2.2&&Math.abs(b.pos.y-(yAt(W.finishZ)+2))<3.5&&!W.crownGot){W.crownGot=true;W.winner=b;b.finished=true;b.finishTime=W.time;b.finishRank=1;W.finished=1;if(b.isPlayer)AudioSys.crown();else if(b.isPlayer===false){} }
  }};
 W.waypoints=(b)=>{const opts=[25,55,75,92,110,128,145,156];return{x:0,z:opts[Math.min(b.wpIdx,opts.length-1)]};};
 W.pickTarget=null;W.dangerNear=(b)=>Math.abs(b.pos.z-80)<8;W.shouldJump=()=>false;W.shouldDive=(b)=>W.finishZ+6-b.pos.z<8&&Math.random()<0.1;W.isFinishNear=(b)=>W.finishZ+6-b.pos.z<10;
 W.hazards=(b)=>{if(b.pos.y<-8){b.falls++;const cp=b.checkpoint;b.pos.x=cp.x;b.pos.y=cp.y+1;b.pos.z=cp.z;b.vel.x=b.vel.z=b.vel.y=0;}};
 W.checkpoint=(b)=>{const marks=[0,50,90,120];for(const z of marks){if(b.pos.z>z&&b.checkpoint.z<z)b.checkpoint={x:clamp(b.pos.x,-5,5),y:yAt(z+2),z:z+2};}};
 W.progress=(b)=>b.finished?1e6:b.maxZ-b.falls*4;
 W.rankOf=(beans,b)=>{const s=[...beans].sort((a,c)=>W.progress(c)-W.progress(a));return s.indexOf(b)+1;};
 return W;
}

// ---------- Headless simulation (bot-only verification) ----------
export function simulateRound(idx,diff='easy',count=60,timeScale=1){
 const keep=difficulty;difficulty=diff;
 const world=makeWorld(idx,count,diff);
 const beans=[];for(let i=0;i<count;i++){const b=makeBean(false,pick(BEAN_COLORS),{spd:rand(DIFFS[diff].botMin,DIFFS[diff].botMax),mistake:Math.random()*DIFFS[diff].mistake,stumble:DIFFS[diff].stumble});world.spawn(b,i);beans.push(b);}
 const dt=1/60;let t=0;const need=world.qual;
 while(t<world.limit){
  for(const b of beans){if(b.finished||b.eliminated)continue;const inp=botInput(b,world,dt,t);physStep(b,inp,world,dt,t);}
  world.update(beans,dt);t+=dt;
  if(idx===2&&t>=world.limit)break;
  if(idx!==2){const f=beans.filter(b=>b.finished).length;if(f>=need)break;}
 }
 // force-finish: fill quota by progress so round ALWAYS ends
 let sorted=[...beans].sort((a,b2)=>world.progress(b2)-world.progress(a));
 let qualified,eliminated;
 if(idx===2){qualified=sorted.filter(b=>!b.eliminated).slice(0,need);if(qualified.length<need){const dead=sorted.filter(b=>b.eliminated).slice(0,need-qualified.length);qualified=qualified.concat(dead);}eliminated=beans.filter(b=>!qualified.includes(b));}
 else{qualified=sorted.slice(0,need);eliminated=sorted.slice(need);}
 difficulty=keep;
 return {round:idx,roundsName:ROUNDS[idx].name,time:t,qualified:qualified.length,elim:eliminated.length,done:true,
  topProgress:sorted.slice(0,3).map(b=>Math.round(world.progress(b)))};
}
export function simulateShow(diff='easy'){
 const counts=[60,40,28,16,8];const out=[];let q=counts[0];
 for(let r=0;r<5;r++){const res=simulateRound(r,diff,q);out.push(res);q=ROUNDS[r].qual;if(r<4)q=Math.min(q,res.qualified)||ROUNDS[r].qual;}
 return out;
}

// ---------- THREE visuals ----------
let renderer,scene,camera,world,beans=[],player=null,showState='menu';
let roundIdx=0,entrants=[],keys={},camMode='follow',particles=[],crownMesh=null,slimeMesh=null;
let roundTime=0,roundOver=false,hudTimer=null,clouds=[];
function initGL(){
 renderer=new THREE.WebGLRenderer({canvas:$('game'),antialias:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));
 renderer.setSize(innerWidth,innerHeight);
 scene=new THREE.Scene();scene.background=new THREE.Color(0x7ad7f0);scene.fog=new THREE.Fog(0x9be7ff,90,260);
 camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,0.1,600);
 camera.position.set(0,8,-12);
 const hemi=new THREE.HemisphereLight(0xffffff,0xff9fd0,0.95);scene.add(hemi);
 const sun=new THREE.DirectionalLight(0xffffff,1.1);sun.position.set(30,60,-20);scene.add(sun);
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
}
function candyMat(c,rough=0.35){return new THREE.MeshStandardMaterial({color:c,roughness:rough,metalness:0.05});}
function beanMesh(colorHex,isPlayer){
 const g=new THREE.Group();
 const mat=new THREE.MeshPhysicalMaterial({color:colorHex,roughness:0.22,metalness:0.05,clearcoat:1,clearcoatRoughness:0.15});
 const body=new THREE.Mesh(new THREE.CapsuleGeometry(0.55,0.55,6,14),mat);body.position.y=0.75;g.add(body);
 const belly=new THREE.Mesh(new THREE.SphereGeometry(0.4,12,10),new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.5}));belly.scale.set(0.8,0.9,0.4);belly.position.set(0,0.7,0.42);g.add(belly);
 const eM=new THREE.MeshBasicMaterial({color:0xffffff});const pM=new THREE.MeshBasicMaterial({color:0x22222e});
 for(const s of[-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(0.13,10,8),eM);e.position.set(s*0.2,1.05,0.48);g.add(e);const p=new THREE.Mesh(new THREE.SphereGeometry(0.06,8,6),pM);p.position.set(s*0.2,1.03,0.6);g.add(p);}
 if(isPlayer){const ring=new THREE.Mesh(new THREE.TorusGeometry(0.85,0.09,8,24),new THREE.MeshBasicMaterial({color:0xffd23e}));ring.rotation.x=Math.PI/2;ring.position.y=0.15;g.add(ring);
  const cone=new THREE.Mesh(new THREE.ConeGeometry(0.28,0.5,12),candyMat(0xffd23e,0.3));cone.position.y=1.75;g.add(cone);}
 g.userData.body=body;return g;
}
function clearScene(){scene.clear();scene.background=new THREE.Color(0x7ad7f0);scene.fog=new THREE.Fog(0x9be7ff,90,260);
 scene.add(new THREE.HemisphereLight(0xffffff,0xff9fd0,0.95));const sun=new THREE.DirectionalLight(0xffffff,1.15);sun.position.set(30,60,-20);scene.add(sun);particles=[];crownMesh=null;slimeMesh=null;clouds=[];}
function decoLollipop(x,z,c1=0xff4d8d){const g=new THREE.Group();const stick=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,5,8),candyMat(0xffffff,0.5));stick.position.y=2.5;g.add(stick);const pop=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.3,0.4,20),candyMat(c1,0.3));pop.rotation.x=Math.PI/2;pop.position.y=5.4;g.add(pop);const sw=new THREE.Mesh(new THREE.TorusGeometry(0.7,0.16,8,20),candyMat(0xffffff,0.4));sw.position.y=5.4;sw.position.z=0.22;g.add(sw);g.position.set(x,0,z);scene.add(g);}
function decoCane(x,z,h=5){const g=new THREE.Group();const m=candyMat(0xff3b6b,0.35);const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.28,h,10),m);pole.position.y=h/2;g.add(pole);const top=new THREE.Mesh(new THREE.TorusGeometry(0.8,0.28,10,16,Math.PI),m);top.position.y=h;g.add(top);g.position.set(x,0,z);scene.add(g);}
function floorSlab(w,d,c1,c2,z,y=0){const geo=new THREE.BoxGeometry(w,1,d);const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.6});const m=new THREE.Mesh(geo,mat);
 // checker via canvas texture
 const cv=document.createElement('canvas');cv.width=8;cv.height=8;const cx=cv.getContext('2d');cx.fillStyle=c1;cx.fillRect(0,0,8,8);cx.fillStyle=c2;cx.fillRect(0,0,4,4);cx.fillRect(4,4,4,4);
 const tx=new THREE.CanvasTexture(cv);tx.magFilter=THREE.NearestFilter;tx.wrapS=tx.wrapT=THREE.RepeatWrapping;tx.repeat.set(w/3,d/3);mat.map=tx;mat.color=new THREE.Color(0xffffff);
 m.position.set(0,y-0.5,z);scene.add(m);return m;}
// per-round visual builds
function buildVisuals(){
 clearScene();
 if(world.idx===0){
  floorSlab(28,220,'#ff9ecf','#ffffff',100,0.4);
  // side rails candy
  for(const s of[-1,1]){const rail=new THREE.Mesh(new THREE.BoxGeometry(1,1.4,210),candyMat(s>0?0x29d3ff:0xffd23e));rail.position.set(s*14,1,100);scene.add(rail);}
  for(const wall of world.doors){const beam=new THREE.Mesh(new THREE.BoxGeometry(28,1.2,1.4),candyMat(0x7a3cff,0.4));beam.position.set(0,6.2,wall.z);scene.add(beam);
   for(const sx of[-14,14]){const post=new THREE.Mesh(new THREE.BoxGeometry(1.2,6.5,1.2),candyMat(0x7a3cff,0.4));post.position.set(sx,3.2,wall.z);scene.add(post);}
   const dw=28/wall.n;for(let i=0;i<wall.n;i++){const cx=-14+dw*(i+0.5);
    if(wall.open.has(i)){const flat=new THREE.Mesh(new THREE.BoxGeometry(dw-0.6,0.3,3.2),candyMat(0xffc7e3,0.5));flat.position.set(cx,0.6,wall.z+2.2);scene.add(flat);}
    else{const d=new THREE.Mesh(new THREE.BoxGeometry(dw-0.4,5,0.8),candyMat(0xff4d8d,0.3));d.position.set(cx,3,wall.z);scene.add(d);
     const stripe=new THREE.Mesh(new THREE.BoxGeometry(dw-0.4,0.9,0.85),candyMat(0xffffff,0.5));stripe.position.set(cx,3,wall.z);scene.add(stripe);}}}
  for(const o of world.bumpers){const b=new THREE.Mesh(new THREE.CylinderGeometry(o.r,o.r*1.2,2.2,16),candyMat(0x7a3cff,0.3));b.position.set(o.x,1.5,o.z);scene.add(b);o._mesh=b;}
  const fin=floorSlab(40,8,'#222222','#ffffff',world.finishZ,0.4);fin.position.y=0.45;
  const arch=new THREE.Mesh(new THREE.BoxGeometry(30,2,2),candyMat(0xffe45e,0.3));arch.position.set(0,7,world.finishZ);scene.add(arch);
  for(let i=0;i<8;i++){decoLollipop(-20+i*6,-6,pick([0xff4d8d,0x29d3ff,0xffd23e]));decoCane(17,-6+i*28);}
 }else if(world.idx===1){
  floorSlab(16,240,'#8ef6ff','#ffffff',108,0.4);
  for(const s of[-1,1]){const rail=new THREE.Mesh(new THREE.BoxGeometry(0.8,1.2,230),candyMat(0xff7ab8));rail.position.set(s*8,1,108);scene.add(rail);}
  for(const s of world.spinners){const bar=new THREE.Mesh(new THREE.BoxGeometry(s.len,1,1.4),candyMat(0xffd23e,0.35));bar.position.set(0,1.8,s.z);scene.add(bar);s._mesh=bar;
   const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.6,2.4,10),candyMat(0x7a3cff));pole.position.set(0,1.2,s.z);scene.add(pole);}
  for(const sw of world.seesaws){const p=new THREE.Mesh(new THREE.BoxGeometry(12,0.6,22),candyMat(0xff9ecf,0.4));p.position.set(0,0.9,(sw.z0+sw.z1)/2);scene.add(p);sw._mesh=p;}
  const arch=new THREE.Mesh(new THREE.BoxGeometry(18,2,2),candyMat(0xffe45e));arch.position.set(0,7,world.finishZ);scene.add(arch);
  for(let i=0;i<10;i++)decoCane(-12,i*24,6),decoCane(12,10+i*24,6);
 }else if(world.idx===2){
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(world.R,world.R+1,1.4,36),candyMat(0xffd23e,0.4));disc.position.y=0.2;scene.add(disc);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(world.R,0.5,10,40),candyMat(0xff4d8d));rim.rotation.x=Math.PI/2;rim.position.y=1;scene.add(rim);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.9,4,12),candyMat(0x7a3cff));pole.position.y=2.5;scene.add(pole);
  world._arms=[];for(let k=0;k<2;k++){const arm=new THREE.Mesh(new THREE.BoxGeometry(world.R,0.7,0.9),candyMat(k?0x29d3ff:0xff4d8d));arm.position.y=1.6;scene.add(arm);world._arms.push(arm);}
  // floating crowd bg
  for(let i=0;i<14;i++){const a=i/14*Math.PI*2;decoLollipop(Math.cos(a)*26,Math.sin(a)*26);}
 }else if(world.idx===3){
  const yAt=world.yAt;
  for(let z=0;z<=190;z+=10){if(world.groundHeight(0,z)===-Infinity)continue;const seg=new THREE.Mesh(new THREE.BoxGeometry(17,1,11),candyMat((z/10)%2?0xb06aff:0x8ef6ff,0.5));seg.position.set(0,yAt(z)-0.5,z);scene.add(seg);}
  for(const p of world.pushers){const b=new THREE.Mesh(new THREE.BoxGeometry(3.4,3.4,1.6),candyMat(0xff4d8d,0.35));b.position.set(0,yAt(p.z)+2,p.z);scene.add(b);p._mesh=b;}
  for(const p of world.pends){const ball=new THREE.Mesh(new THREE.SphereGeometry(1.3,14,12),candyMat(0xffe45e,0.3));scene.add(ball);p._mesh=ball;
   const rope=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,7,6),candyMat(0xffffff,0.6));scene.add(rope);p._rope=rope;}
  slimeMesh=new THREE.Mesh(new THREE.BoxGeometry(40,1,220),new THREE.MeshStandardMaterial({color:0xff2f92,roughness:0.15,metalness:0.1,transparent:true,opacity:0.9}));slimeMesh.position.set(0,-3,95);scene.add(slimeMesh);
  const arch=new THREE.Mesh(new THREE.BoxGeometry(20,2,2),candyMat(0xffe45e));arch.position.set(0,yAt(185)+7,185);scene.add(arch);
 }else{
  const yAt=world.yAt;
  for(let z=0;z<=160;z+=8){const seg=new THREE.Mesh(new THREE.BoxGeometry(20,1,9),candyMat((z/8)%2?0xff9ecf:0x8ef6ff,0.5));seg.position.set(0,yAt(z)-0.5,z);scene.add(seg);}
  const ped=new THREE.Mesh(new THREE.CylinderGeometry(3,4,3,16),candyMat(0xffffff,0.4));ped.position.set(0,yAt(150)+1,156);scene.add(ped);
  crownMesh=new THREE.Mesh(new THREE.ConeGeometry(1.2,1.6,8),new THREE.MeshStandardMaterial({color:0xffd23e,roughness:0.2,metalness:0.9,emissive:0x664400,emissiveIntensity:0.4}));
  crownMesh.position.set(0,yAt(150)+4,156);scene.add(crownMesh);
  for(const r of world.rollers){const m=new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.4,14,14),candyMat(0xff4d8d,0.35));m.rotation.z=Math.PI/2;scene.add(m);r._mesh=m;}
  const bar=new THREE.Mesh(new THREE.BoxGeometry(12,1,1.4),candyMat(0xffd23e));bar.position.set(0,yAt(80)+1.5,80);scene.add(bar);world.spinner._mesh=bar;
  for(let i=0;i<10;i++)decoLollipop(-16+i*3.4,-8);
 }
 // clouds
 for(let i=0;i<10;i++){const c=new THREE.Mesh(new THREE.SphereGeometry(rand(2,4),10,8),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.85}));c.position.set(rand(-60,60),rand(18,34),rand(-10,220));scene.add(c);clouds.push(c);}
 // beans meshes
 for(const b of beans){const m=beanMesh(b.color,b.isPlayer);scene.add(m);b.mesh=m;syncMesh(b,0);}
}
function syncMesh(b,t){
 if(!b.mesh)return;const m=b.mesh;m.position.set(b.pos.x,b.pos.y,b.pos.z);
 const sp=Math.hypot(b.vel.x,b.vel.z);
 m.rotation.z=clamp(-b.vel.x*0.06,-0.5,0.5)+Math.sin(b.wob)*0.06;
 m.rotation.x=clamp(b.vel.z*0.04,-0.4,0.4)+(b.diving? -0.9:0)+(b.stun>0?Math.sin(t*20)*0.25:0);
 if(b.eliminated)m.visible=false;else m.visible=true;
 if(b.finished&&world.idx!==4){m.position.y+=Math.abs(Math.sin(t*6))*0.5;}
}

// ---------- Game flow ----------
const playerColorChoices=[0xff4d8d,0x29d3ff,0x7dff6a,0xffd23e,0xb06aff,0xffffff];
let playerColor=playerColorChoices[0];
function setupMenu(){
 $('rounds-list').innerHTML=ROUNDS.map((r,i)=>`<div><b>R${i+1} ${r.name}</b> — ${r.sub} • <i>qualify ${r.qual}</i></div>`).join('');
 const cs=$('color-seg');cs.innerHTML='';playerColorChoices.forEach(c=>{const b=document.createElement('button');b.className='dot'+(c===playerColor?' on':'');b.style.background='#'+c.toString(16).padStart(6,'0');b.onclick=()=>{playerColor=c;AudioSys.click();[...cs.children].forEach(x=>x.classList.remove('on'));b.classList.add('on');};cs.appendChild(b);});
 document.querySelectorAll('#diff-seg button').forEach(b=>{b.classList.toggle('on',b.dataset.d===difficulty);b.onclick=()=>{difficulty=b.dataset.d;AudioSys.init();AudioSys.click();document.querySelectorAll('#diff-seg button').forEach(x=>x.classList.toggle('on',x===b));};});
 $('play-btn').onclick=()=>{AudioSys.init();AudioSys.click();startShow();};
 $('sim-btn').onclick=async()=>{AudioSys.click();const o=$('sim-out');o.style.display='block';o.textContent='Simulating full 60-bean show with bots (Easy default)...\n';await new Promise(r=>setTimeout(r,30));const t0=performance.now();const res=simulateShow(difficulty);const dt=((performance.now()-t0)/1000).toFixed(2);o.textContent=res.map(r=>`R${r.round+1} ${r.roundsName}: ${r.qualified} qual / ${r.elim} elim in ${r.time.toFixed(1)}s ✅ ends properly`).join('\n')+`\nDone in ${dt}s real compute. All 5 rounds terminate. ✅`;};
 $('next-btn').onclick=()=>{AudioSys.click();$('result-overlay').classList.add('hidden');nextRound();};
 addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyM'){AudioSys.muted=!AudioSys.muted;toast(AudioSys.muted?'🔇 muted':'🔊 sound on');}if(e.code==='KeyR'&&showState==='play'&&player&&!player.finished){respawn(player);}});
 addEventListener('keyup',e=>{keys[e.code]=false;});
}
function toast(t){const el=$('toast');el.textContent=t;el.style.display='block';clearTimeout(el._t);el._t=setTimeout(()=>el.style.display='none',2200);}
function respawn(b){b.pos.x=b.checkpoint.x;b.pos.y=b.checkpoint.y+1;b.pos.z=b.checkpoint.z;b.vel.x=b.vel.z=b.vel.y=0;b.stun=0.3;b.falls++;}
function playerInput(){
 let x=0,z=0;if(keys['KeyW']||keys['ArrowUp'])z+=1;if(keys['KeyS']||keys['ArrowDown'])z-=1;if(keys['KeyA']||keys['ArrowLeft'])x-=1;if(keys['KeyD']||keys['ArrowRight'])x+=1;
 // camera-relative: camera behind looking +Z, so screen mapping is direct
 return{x,z,jump:!!keys['Space'],dive:!!(keys['ShiftLeft']||keys['ShiftRight']||keys['KeyE'])};}
function startShow(){roundIdx=0;entrants=[];$('menu').classList.add('hidden');$('hud').classList.remove('hidden');startRound(0,60);}
function startRound(idx,count){
 roundIdx=idx;roundOver=false;roundTime=0;
 world=makeWorld(idx,count,difficulty);
 beans=[];
 if(idx===0){beanId=0;const skillP={spd:1,mistake:0,stumble:0};player=makeBean(true,playerColor,skillP);beans.push(player);
  for(let i=1;i<count;i++)beans.push(makeBean(false,pick(BEAN_COLORS),diffSkill()));
 }else{ // keep qualified entrants; player persists if qualified
  const kept=entrants.slice(0,count);
  beans=kept;player=beans.find(b=>b.isPlayer)||null;
  if(player){player.finished=false;player.eliminated=false;player.stun=0;player.waitT=0;}
  for(const b of beans){b.finished=false;b.eliminated=false;b.stun=0;b.waitT=0;b.falls=0;b.score=0;b.dodges=0;b.wpIdx=0;b.maxZ=-1e9;}
  // fill up if short (shouldn't happen)
  while(beans.length<count){const nb=makeBean(false,pick(BEAN_COLORS),diffSkill());beans.push(nb);}
 }
 beans.forEach((b,i)=>world.spawn(b,i));
 // sync colors for carried beans already have colors
 buildVisuals();
 showState='card';showCard(idx);
}
function showCard(idx){
 const r=ROUNDS[idx];$('card-overlay').classList.remove('hidden');
 $('card-kicker').textContent=`ROUND ${idx+1} / 5 • ${beans.length} BEANS`;
 $('card-title').textContent=r.name;$('card-desc').textContent=r.desc;
 $('card-qual').textContent=idx===4?`👑 FIRST TO THE CROWN WINS`:`✅ Top ${r.qual} qualify • ⏱ ${r.time}s limit`;
 let n=3;$('countdown').textContent=n;AudioSys.count(n);
 const iv=setInterval(()=>{n--;if(n>0){$('countdown').textContent=n;AudioSys.count(n);}else{$('countdown').textContent='GO!';AudioSys.count(0);clearInterval(iv);setTimeout(()=>{$('card-overlay').classList.add('hidden');showState='play';},700);}},1000);
 $('hud-round').textContent=`ROUND ${idx+1}/5 • ${r.name}`;
}
function endRound(){
 roundOver=true;showState='result';
 const sorted=[...beans].sort((a,b)=>world.progress(b)-world.progress(a));
 const need=world.qual;let qualified,eliminated;
 if(world.idx===2){qualified=sorted.filter(b=>!b.eliminated).slice(0,need);if(qualified.length<need){qualified=qualified.concat(sorted.filter(b=>b.eliminated).slice(0,need-qualified.length));}eliminated=beans.filter(b=>!qualified.includes(b));}
 else{qualified=sorted.slice(0,need);eliminated=sorted.slice(need);}
 for(const b of eliminated)b.eliminated=true;
 entrants=qualified;
 const pQ=player&&qualified.includes(player);
 const pRank=player?sorted.indexOf(player)+1:sorted.length;
 if(world.idx===4){
  const w=world.winner||sorted[0];
  showCrown(w);return;
 }
 if(pQ){AudioSys.qual();$('result-kicker').textContent=`ROUND ${roundIdx+1} COMPLETE — YOU RANK #${pRank}`;$('result-title').textContent='🎉 QUALIFIED!';$('result-title').style.color='#1a9e3c';$('result-desc').textContent=`You made top ${need}! ${qualified.length} beans go through. ${player.finished?`Finished in ${player.finishTime.toFixed(1)}s.`:'Survived on progress!'}`;$('next-btn').textContent='NEXT ROUND ▶';$('next-btn').onclick=()=>{AudioSys.click();$('result-overlay').classList.add('hidden');nextRound();};
 }else{AudioSys.elim();$('result-kicker').textContent=`ROUND ${roundIdx+1} COMPLETE — YOU RANK #${pRank}`;$('result-title').textContent='😢 ELIMINATED';$('result-title').style.color='#c02040';$('result-desc').textContent=`Only top ${need} went through. You can spectate the rest of the show or retry this round.`;$('next-btn').textContent='SPECTATE REST 👁';$('next-btn').onclick=()=>{AudioSys.click();$('result-overlay').classList.add('hidden');player=null;spectateRest();}; // add retry via double-click? add second button behavior:
  if(!$('retry-btn')){const rb=document.createElement('button');rb.id='retry-btn';rb.textContent='↻ RETRY ROUND';rb.style.cssText='margin:10px 0 0 10px;font-size:16px;font-weight:900;padding:12px 18px;border-radius:14px;border:2px dashed #3a1650;background:#fff;color:#3a1650;cursor:pointer';rb.onclick=()=>{rb.remove();$('result-overlay').classList.add('hidden');startRound(roundIdx,beans.length+eliminated.length>60?60:beans.length+eliminated.length);};$('next-btn').after(rb);} }
 $('result-overlay').classList.remove('hidden');
}
function spectateRest(){ // fast-forward bots only until crown
 const chain=[roundIdx+1,roundIdx+2,roundIdx+3,roundIdx+4].filter(i=>i<5);
 let counts=entrants.length;
 for(const r of chain){startRoundSilent(r,counts);counts=ROUNDS[r].qual;}
}
function startRoundSilent(idx,count){
 roundIdx=idx;world=makeWorld(idx,count,difficulty);
 beans=entrants.slice(0,count).map(b=>{b.finished=false;b.eliminated=false;b.isPlayer=false;b.stun=0;b.waitT=0;b.falls=0;b.score=0;b.wpIdx=0;b.maxZ=-1e9;return b;});
 while(beans.length<count)beans.push(makeBean(false,pick(BEAN_COLORS),diffSkill()));
 beans.forEach((b,i)=>world.spawn(b,i));buildVisuals();
 // headless fast sim then show final quickly
 const dt=1/60;let t=0;while(t<world.limit){for(const b of beans){if(b.finished||b.eliminated)continue;physStep(b,botInput(b,world,dt,t),world,dt,t);}world.update(beans,dt);t+=dt;const f=beans.filter(b=>b.finished).length;if(world.idx!==2&&f>=world.qual)break;if(world.idx===2&&t>=world.limit)break;}
 const sorted=[...beans].sort((a,b)=>world.progress(b)-world.progress(a));
 entrants=sorted.slice(0,world.qual);
 if(idx===4){showCrown(world.winner||sorted[0]);roundTime=t;showState='ceremony';}
 else{roundIdx=idx;toast(`(spectate) R${idx+1} done`);}
}
function nextRound(){if(roundIdx>=4)return;startRound(roundIdx+1,ROUNDS[roundIdx].qual);}
function showCrown(w){
 showState='ceremony';$('result-overlay').classList.add('hidden');
 if(w&&w.mesh){crownMesh=w.mesh;/* crown follows winner */}
 AudioSys.crown();AudioSys.cheer();
 const isMe=w&&w.isPlayer;
 $('result-kicker').textContent='👑 SHOW COMPLETE';
 $('result-title').textContent=isMe?'🏆 YOU WIN THE CROWN!':'👑 '+(w?'BOT WINS':'SHOW OVER');
 $('result-title').style.color='#b8860b';
 $('result-desc').textContent=isMe?'Champion of all 5 rounds! Confetti jelly dance! You beat 59 bots.':(w?`Winner: bot #${w.id} (${w.finishTime?w.finishTime.toFixed(1)+'s':'crown grab'}). Your run ended round ${roundIdx+1}. Press Start to run it back!`:'Show over.');
 $('next-btn').textContent='↻ PLAY AGAIN';$('next-btn').onclick=()=>{AudioSys.click();const rb=$('retry-btn');if(rb)rb.remove();$('result-overlay').classList.add('hidden');$('menu').classList.remove('hidden');showState='menu';};
 $('result-overlay').classList.remove('hidden');
 spawnConfetti();
}
function spawnConfetti(){
 for(let i=0;i<220;i++){const m=new THREE.Mesh(new THREE.PlaneGeometry(0.35,0.5),new THREE.MeshBasicMaterial({color:pick(BEAN_COLORS),side:THREE.DoubleSide}));m.position.set(rand(-12,12),rand(6,16),world&&world.finishZ?world.finishZ+rand(-6,6):rand(0,20));m.userData.v={x:rand(-2,2),y:rand(-3,-1),z:rand(-2,2),r:rand(2,8)};scene.add(m);particles.push(m);}
}
// ---------- main loop ----------
let last=performance.now();
function loop(now){
 requestAnimationFrame(loop);
 const dt=Math.min(0.033,(now-last)/1000);last=now;
 const t=now/1000;
 if(showState==='play'&&world){
  roundTime+=dt;
  // player
  if(player&&!player.finished&&!player.eliminated){physStep(player,playerInput(),world,dt,roundTime);}
  for(const b of beans){if(b.isPlayer||b.finished||b.eliminated)continue;physStep(b,botInput(b,world,dt,roundTime),world,dt,roundTime);}
  world.update(beans,dt);
  for(const b of beans)syncMesh(b,t);
  // visuals motion
  if(world.idx===0)for(const o of world.bumpers)if(o._mesh)o._mesh.position.x=o.x+Math.sin(o.ph)*2.2;
  if(world.idx===1){for(const s of world.spinners)if(s._mesh)s._mesh.rotation.y=-s.a;for(const sw of world.seesaws)if(sw._mesh)sw._mesh.rotation.x=Math.sin(t*1.2)*0.12;}
  if(world.idx===2)for(let k=0;k<world._arms.length;k++){world._arms[k].rotation.y=-world.armA-k*Math.PI;}
  if(world.idx===3){if(slimeMesh)slimeMesh.position.y=world.slime;for(const p of world.pushers)if(p._mesh)p._mesh.position.x=Math.sin(p.ph)*8;
   for(const p of world.pends)if(p._mesh){const px=p.x+Math.sin(p.a)*p.L*0.7;p._mesh.position.set(px,world.yAt(p.z)+5+Math.cos(p.a)*2,p.z);if(p._rope){p._rope.position.set((p.x+px)/2,world.yAt(p.z)+8,p.z);p._rope.rotation.z=Math.atan2(px-p.x,7);}}}
  if(world.idx===4){if(crownMesh&&!world.crownGot){crownMesh.rotation.y+=dt*2;crownMesh.position.y+=Math.sin(t*3)*dt*0.8;}for(const r of world.rollers)if(r._mesh){r._mesh.position.set(Math.sin(r.ph)*7,world.yAt(r.z)+1.5,r.z);r._mesh.rotation.x+=dt*4;}if(world.spinner._mesh)world.spinner._mesh.rotation.y=-world.spinner.a;}
  for(const c of clouds)c.position.x+=dt*0.4;
  // camera
  const focus=player&&!player.eliminated?player:[...beans].sort((a,b)=>world.progress(b)-world.progress(a))[0];
  if(focus){const cx=focus.pos.x*0.6,cy=focus.pos.y+7,cz=focus.pos.z-11;camera.position.lerp(new THREE.Vector3(cx,cy,cz),1-Math.pow(0.001,dt));camera.lookAt(focus.pos.x,focus.pos.y+1.5,focus.pos.z+6);}
  // HUD
  const r=ROUNDS[roundIdx];const q=beans.filter(b=>b.finished).length;
  const left=Math.max(0,world.limit-roundTime);
  $('hud-timer').textContent=`⏱ ${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,'0')}`;
  $('hud-qual').innerHTML=world.idx===2?`⏳ ${left.toFixed(0)}s left • alive ${beans.filter(b=>!b.eliminated).length}`:`✅ ${q}/${world.qual} &nbsp;•&nbsp; 🏁 Pos <span id="hud-pos">${player?world.rankOf(beans,player):'👁'}</span>`;
  // end conditions
  if(world.idx===2){if(roundTime>=world.limit||beans.filter(b=>!b.eliminated).length<=1)endRound();}
  else{ if(beans.filter(b=>b.finished).length>=world.qual||roundTime>=world.limit)endRound();
   else if(player&&player.finished){$('hud-sub').textContent=`Finished #${player.finishRank}! Waiting for round to fill…`;setTimeout(()=>{if(showState==='play')$('hud-sub').textContent='';},10);}
  }
 }else if(showState==='ceremony'){
  for(const b of beans)syncMesh(b,t);
  for(const p of particles){p.position.x+=p.userData.v.x*dt;p.position.y+=p.userData.v.y*dt;p.position.z+=p.userData.v.z*dt;p.rotation.x+=p.userData.v.r*dt;if(p.position.y<0)p.position.y=14;}
  if(crownMesh)crownMesh.rotation.y+=dt*3;
  camera.position.lerp(new THREE.Vector3(0,(world.yAt?world.yAt(world.finishZ):5)+9,world.finishZ-8),0.03);camera.lookAt(0,(world.yAt?world.yAt(world.finishZ):5)+2,world.finishZ+6);
  for(const b of beans){if(!b.eliminated&&b.mesh){b.mesh.position.y+=Math.abs(Math.sin(t*5+b.id))*dt*2;}}
 }
 renderer.render(scene,camera);
}
// ---------- screenshot / auto hooks ----------
function params(){return new URLSearchParams(location.search);}
async function shotMode(){
 const p=params();if(!p.has('round'))return false;
 const r=clamp(parseInt(p.get('round'))||1,1,5)-1;
 difficulty=p.get('diff')||'easy';
 initGL();setupMenu();
 const count=r===4?8:r===3?16:r===2?28:r===1?40:60;
 world=makeWorld(r,count,difficulty);beans=[];beanId=0;
 player=makeBean(true,0xff4d8d,{spd:1,mistake:0,stumble:0});beans.push(player);
 for(let i=1;i<count;i++)beans.push(makeBean(false,BEAN_COLORS[i%BEAN_COLORS.length],diffSkill()));
 beans.forEach((b,i)=>world.spawn(b,i));
 // spread mid-track for lively shots (kept near camera, on solid ground)
 const solidZ=(z)=>{for(let k=0;k<12;k++){if(world.groundHeight(0,z)!==-Infinity)return z;z-=2;}return 10;};
 beans.forEach((b,i)=>{
  if(r===0){b.pos.z=solidZ(18+(i%6)*5);b.pos.x=rand(-8,8);}
  else if(r===1){b.pos.z=solidZ(30+(i%6)*9);b.pos.x=rand(-4,4);}
  else if(r===2){/* keep arena spawn */}
  else if(r===3){b.pos.z=solidZ(20+(i%8)*7);b.pos.x=rand(-4,4);}
  else{b.pos.z=solidZ(15+(i%4)*10);b.pos.x=rand(-5,5);}
  b.pos.y=(world.yAt?world.yAt(b.pos.z):0.9);
 });
 buildVisuals();
 $('menu').classList.add('hidden');$('hud').classList.remove('hidden');showState='shot';
 $('hud-round').textContent=`ROUND ${r+1}/5 • ${ROUNDS[r].name}`;
 $('hud-qual').innerHTML=`✅ shot • ${beans.length} beans • ${ROUNDS[r].name}`;
 // cinematic cameras: behind the pack, looking forward
 const cams={0:[0,9,-4,0,2,40],1:[0,8,-2,0,2,60],2:[24,18,0,0,1,0],3:[0,14,2,0,10,70],4:[0,16,0,0,14,80]};
 const c=cams[r];camera.position.set(c[0],c[1],c[2]);camera.lookAt(c[3],c[4],c[5]);
 if(r===4&&crownMesh){crownMesh.position.set(0,world.yAt(150)+4,156);}
 // idle animation
 const t0=performance.now();const anim=()=>{const t=(performance.now())/1000;const dt=0.016;
  if(world.idx===0)for(const o of world.bumpers)if(o._mesh)o._mesh.position.x=o.x+Math.sin(t*1.5+o.ph)*2.2;
  if(world.idx===1)for(const s of world.spinners){s.a+=dt;if(s._mesh)s._mesh.rotation.y=-s.a;}
  if(world.idx===2){world.armA+=dt;for(let k=0;k<world._arms.length;k++)world._arms[k].rotation.y=-world.armA-k*Math.PI;}
  if(world.idx===4&&crownMesh)crownMesh.rotation.y+=dt*2;
  beans.forEach(b=>syncMesh(b,t));renderer.render(scene,camera);if(showState==='shot')requestAnimationFrame(anim);};
 anim();
 window.__ready=true;window.__round=r+1;
 return true;
}
// boot
(async()=>{
 initGL();setupMenu();
 if(await shotMode())return;
 scene.add(new THREE.Mesh(new THREE.BoxGeometry(60,1,60),candyMat(0xff9ecf,0.6)));
 showState='menu';
 // menu backdrop beans
 world=makeWorld(0,1);scene.background=new THREE.Color(0x7ad7f0);
 requestAnimationFrame(loop);
 window.Guys={simulateRound,simulateShow,ROUNDS,DIFFS,startShow,
  get state(){return{showState,roundIdx,beans:beans.length};},
  get player(){return player?{x:+player.pos.x.toFixed(2),y:+player.pos.y.toFixed(2),z:+player.pos.z.toFixed(2),rank:world?world.rankOf(beans,player):0}:null;}};
 window.__ready=true;
})();
window.Guys={simulateRound,simulateShow,ROUNDS};
