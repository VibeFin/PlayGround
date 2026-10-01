// Targeted browser regression checks. Run with:
// await import('/src/playtest.js').then(m => m.runPlaytest())
// These checks explicitly use controlled starting positions and fixed simulation steps.
export function runPlaytest() {
  const app=window.gameApp,{world,game}=app,p=world.player;
  const result=[];
  const check=(title,condition,measurements)=>result.push({title,passed:Boolean(condition),measurements});
  const controls={forward:0,right:0,ski:false,jet:false,jump:false,lookX:0,lookY:0,fire:false};
  const advance=(seconds,input)=>{for(let t=0;t<seconds-1e-6;t+=1/60)world.update(1/60,{...controls,...input});};
  app.testMode=true;
  try {
    world.resetPlayer();
    const start=p.position.clone();advance(2,{forward:1});
    const distance=p.position.distanceTo(start);
    check('Forward input traverses real terrain',distance>15,{distanceMeters:+distance.toFixed(2)});

    world.resetPlayer();const startY=p.position.y;advance(2,{jet:true});
    const altitude=p.position.y-startY,energy=p.energy;
    check('Jetpack gains altitude and consumes energy',altitude>15&&energy<80,{altitudeGainMeters:+altitude.toFixed(2),energy:+energy.toFixed(2)});
    p.velocity.x=60;p.velocity.z=0;const initialSpeed=Math.hypot(p.velocity.x,p.velocity.z);advance(1,{});
    const retainedSpeed=Math.hypot(p.velocity.x,p.velocity.z);
    check('Airborne horizontal momentum survives release',retainedSpeed>initialSpeed*.75,{initialMetersPerSecond:initialSpeed,retainedMetersPerSecond:+retainedSpeed.toFixed(2)});
    advance(4,{});check('Released jetpack recharges',p.energy>energy,{before:energy,after:+p.energy.toFixed(2)});

    // Find a steep, traversable downhill start rather than a hand-picked constant acceleration.
    let slope={magnitude:0};
    for(let x=-160;x<=160;x+=20)for(let z=-160;z<=160;z+=20){
      const gx=(world.terrainHeight(x+1,z)-world.terrainHeight(x-1,z))/2;
      const gz=(world.terrainHeight(x,z+1)-world.terrainHeight(x,z-1))/2;
      const magnitude=Math.hypot(gx,gz);if(magnitude>slope.magnitude&&magnitude<1.2)slope={x,z,gx,gz,magnitude};
    }
    world.resetPlayer();p.position.set(slope.x,world.terrainHeight(slope.x,slope.z)+2.2,slope.z);p.velocity.set(0,0,0);p.grounded=true;
    advance(2,{ski:true});const downhillSpeed=Math.hypot(p.velocity.x,p.velocity.z);
    check('Ski mode accelerates downhill without walking input',downhillSpeed>5,{start:{x:slope.x,z:slope.z},slope:+slope.magnitude.toFixed(3),metersPerSecond:+downhillSpeed.toFixed(2),kilometersPerHour:+(downhillSpeed*3.6).toFixed(1)});

    game.restart();world.resetPlayer();game.update(1/60,{...controls,fire:true});
    const shots=game.state.projectiles.length,projectile=game.state.projectiles[0],shotStart=projectile?.position?.clone();
    game.update(1/60,controls);const traveled=shotStart&&projectile?.position?projectile.position.distanceTo(shotStart):0;
    check('Firing creates a moving projectile',shots>0&&traveled>0,{projectilesAfterFire:shots,traveledInFrameMeters:+traveled.toFixed(2)});

    game.restart();world.resetPlayer();p.position.copy(world.bases.red);p.position.y+=2.2;
    game.update(1/60,controls);const pickup=game.state.flags.red.status;
    p.position.copy(world.bases.blue);p.position.y+=2.2;game.update(1/60,controls);
    check('Enemy flag pickup and home-base capture',pickup==='carried'&&game.state.blueScore===1&&game.state.flags.red.status==='home',{afterPickup:pickup,score:game.state.blueScore,flagAfterCapture:game.state.flags.red.status});

    game.restart();world.resetPlayer();
    check('Restart resets the match',game.state.blueScore===0&&game.state.redScore===0&&game.state.timeLeft===480&&!game.state.ended&&p.health===100,{blue:game.state.blueScore,red:game.state.redScore,timeLeft:game.state.timeLeft,health:p.health});
    check('Renderer submitted real geometry',world.renderer.info.render.triangles>100,{triangles:world.renderer.info.render.triangles,drawCalls:world.renderer.info.render.calls});
    return {setup:'Controlled starting positions; fixed 60 Hz simulation in the real browser. Flag checks reposition the player. No claim of a manual full-match win.',passed:result.every(r=>r.passed),checks:result};
  } finally {game.restart();world.resetPlayer();Object.assign(app.input,controls);app.testMode=false;}
}
