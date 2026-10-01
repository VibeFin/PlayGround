# Implementation contracts

All world units are meters, Y up, ground at y=0. Car yaw 0 points toward +Z. Arena playable half extents x=43, z=32, rounded aesthetic perimeter permitted but rectangular collision. Health and boost are **0..100**; regional damage and event force are **0..1**. No external game assets required.

## simulation.js
Export `createSimulation()` returning { cars, time, events, state, score, combo, takedowns, reset(), start(), update(dt,input) }. Cars: {id,isPlayer,name,color,x,z,yaw,vx,vz,speed,steer,health,damage:{front,rear,left,right},boost,alive}. id player=0. Input {throttle:-1..1,steer:-1..1,brake:boolean,boost:boolean}. Events after each update: {type:'hit'|'wreck',x,z,force,player:boolean}. States 'ready','playing','won','lost'. Ten cars total. Public array replaced on reset okay. Physics fixed steps in main. Only simulation owns gameplay score and car state.

## arena.js
Export `createArena(THREE, {lowDetail = false} = {})` returns THREE.Group with environment; no lights or ground outside arena required from main (arena owns ground and scenery; main owns scene lighting). Half extents 43/32. The software tier uses cheaper material/geometry and spatial crowd batches. Arena is static.

## vehicles.js
Export `createVehicle(THREE, {color, isPlayer, id, lowDetail = false})` returns THREE.Group. Export `updateVehicle(group, car, dt, time)` updates visual car damage, wheel rotation/steering, chassis pitch roll; main places root at car.x,0,car.z and rotation.y=car.yaw. Approx footprint width 2.1 length 4.5. Body visually detailed stock car / muscle derby car with number decals, roll cage, exposed mechanical details. Root faces +Z. Main reuses models on reset; lowering damage restores immutable rest geometry. Tire/rim/contact resources are shared and must not be disposed when resetting a single car.

## Main
Main owns renderer, cinematic chase camera, lighting, input, UI, particles, audio, screen feedback and lifecycle. Independent agents own only their assigned module and tests. Progress public/progress.json updated by integration owner.
