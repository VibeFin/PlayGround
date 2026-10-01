import * as THREE from 'three';

const TEAM = { blue: 0x35dfff, red: 0xff536d };
const otherTeam = (team) => team === 'blue' ? 'red' : 'blue';
const PLAYER_ID = 'player';
const MATCH_SECONDS = 480;
const FIRE_INTERVAL = 0.65;
const SPLASH_RADIUS = 14;

/** Combat and CTF own their scene objects; movement/energy remain world-owned. */
export function createGame(world, onEvent = () => {}) {
  const { scene, player, terrainHeight } = world;
  const root = new THREE.Group();
  root.name = 'combat-and-ctf';
  scene.add(root);
  const geometries = new Set();
  const materials = new Set();
  const geometry = (g) => { geometries.add(g); return g; };
  const material = (m) => { materials.add(m); return m; };
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const sphere = geometry(new THREE.IcosahedronGeometry(1, 1));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 8));
  const cone = geometry(new THREE.ConeGeometry(1, 1, 6));
  const ring = geometry(new THREE.TorusGeometry(1, 0.12, 5, 18));
  const plane = geometry(new THREE.PlaneGeometry(1, 1));
  const armor = material(new THREE.MeshStandardMaterial({ color: 0x283c51, roughness: 0.48, metalness: 0.65 }));
  const dark = material(new THREE.MeshStandardMaterial({ color: 0x111c29, roughness: 0.7 }));
  const poleMat = material(new THREE.MeshStandardMaterial({ color: 0xc5d7e5, metalness: 0.8, roughness: 0.3 }));
  const white = material(new THREE.MeshBasicMaterial({ color: 0xc8faff }));
  const healthBack = material(new THREE.MeshBasicMaterial({ color: 0x17222d, side: THREE.DoubleSide }));
  const teamMaterials = {};
  const glowMaterials = {};
  for (const team of ['blue', 'red']) {
    teamMaterials[team] = material(new THREE.MeshStandardMaterial({
      color: TEAM[team], emissive: TEAM[team], emissiveIntensity: 0.55,
      metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide,
    }));
    glowMaterials[team] = material(new THREE.MeshBasicMaterial({ color: TEAM[team], side: THREE.DoubleSide }));
  }
  const scratch = new THREE.Vector3();
  const segment = new THREE.Vector3();
  const relative = new THREE.Vector3();
  const candidate = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const effects = [];
  let elapsed = 0;
  let playerProtection = 2;
  let deadPosition = null;
  let disposed = false;

  const state = {
    blueScore: 0, redScore: 0, timeLeft: MATCH_SECONDS, playerKills: 0,
    ended: false, respawnIn: 0, flags: {}, bots: [], projectiles: [],
    ammo: Infinity, weaponCooldown: 0, winner: null,
  };
  const emit = (type, text, detail = {}) => onEvent({ type, text, ...detail });
  const ground = (x, z) => terrainHeight(x, z);
  const basePosition = (team) => {
    const p = world.bases[team].clone();
    p.y = ground(p.x, p.z);
    return p;
  };
  function mesh(g, m, parent, position, scale) {
    const object = new THREE.Mesh(g, m);
    if (position) object.position.set(...position);
    if (scale) object.scale.set(...scale);
    parent.add(object);
    return object;
  }

  function makeFlag(team) {
    const visual = new THREE.Group();
    visual.name = `${team}-physical-flag`;
    mesh(cylinder, poleMat, visual, [0, 5.8, 0], [0.17, 11.6, 0.17]);
    const banner = mesh(box, teamMaterials[team], visual, [2.1, 9.5, 0], [4.3, 2.8, 0.14]);
    mesh(box, white, visual, [1.1, 9.5, 0.09], [0.24, 2.1, 0.03]);
    const beacon = mesh(sphere, glowMaterials[team], visual, [0, 12, 0], [0.48, 0.48, 0.48]);
    const pedestal = mesh(cylinder, teamMaterials[team], visual, [0, 0.18, 0], [1.4, 0.35, 1.4]);
    root.add(visual);
    return { team, status: 'home', position: basePosition(team), carrier: null,
      droppedFor: 0, visual, banner, beacon, pedestal };
  }

  function makeBot(team, index, role, lane) {
    const visual = new THREE.Group();
    visual.name = `${team}-${role}-${index}`;
    // Feet are 2.2 units below position, matching the world's player convention.
    mesh(box, armor, visual, [0, -0.55, 0], [1.5, 1.45, 0.8]);
    mesh(box, teamMaterials[team], visual, [0, -0.45, -0.43], [1.12, 0.68, 0.12]);
    mesh(sphere, armor, visual, [0, 0.58, 0], [0.56, 0.61, 0.48]);
    mesh(box, glowMaterials[team], visual, [0, 0.65, -0.46], [0.78, 0.16, 0.08]);
    const limbs = [];
    for (const side of [-1, 1]) {
      mesh(box, teamMaterials[team], visual, [side * 0.9, -0.1, 0], [0.54, 0.48, 0.7]);
      mesh(box, armor, visual, [side * 0.91, -0.64, -0.16], [0.4, 0.9, 0.42]);
      const leg = mesh(box, armor, visual, [side * 0.43, -1.6, 0], [0.48, 1.12, 0.48]);
      limbs.push(leg);
      mesh(box, dark, visual, [side * 0.43, -2.13, -0.15], [0.58, 0.18, 0.92]);
    }
    mesh(box, dark, visual, [0, -0.45, 0.6], [1.2, 1.1, 0.5]);
    mesh(cylinder, armor, visual, [0.92, -0.7, -0.82], [0.23, 1.55, 0.23]).rotation.x = Math.PI / 2;
    mesh(ring, glowMaterials[team], visual, [0.92, -0.7, -1.6], [0.25, 0.25, 0.25]);
    const jets = new THREE.Group();
    for (const side of [-1, 1]) {
      const flame = mesh(cone, glowMaterials[team], jets, [side * 0.36, -1.5, 0.65], [0.19, 1.8, 0.19]);
      flame.rotation.z = Math.PI;
    }
    visual.add(jets);
    const indicator = new THREE.Group();
    indicator.position.y = 2;
    mesh(plane, healthBack, indicator, [0, 0, 0], [2.1, 0.23, 1]);
    const healthFill = mesh(plane, glowMaterials[team], indicator, [0, 0, 0.01], [2, 0.14, 1]);
    const marker = mesh(cone, glowMaterials[team], indicator, [0, 0.48, 0], [0.23, 0.35, 0.07]);
    marker.rotation.z = Math.PI;
    visual.add(indicator);
    root.add(visual);
    return {
      id: `${team}-${index}`, name: `${team === 'blue' ? 'Ally' : 'Raider'} ${index + 1}`,
      team, role, lane, position: new THREE.Vector3(), velocity: new THREE.Vector3(),
      health: 100, alive: true, respawnIn: 0, grounded: true, energy: 100,
      skiing: false, jetting: false,
      cooldown: 1 + index * 0.55, protection: 1.5, launchDelay: 0,
      visual, jets, indicator, healthFill, limbs, phase: index * 1.7,
    };
  }

  state.flags.blue = makeFlag('blue');
  state.flags.red = makeFlag('red');
  state.bots.push(
    makeBot('blue', 0, 'attack', -60),
    makeBot('blue', 1, 'escort', 62),
    makeBot('blue', 2, 'defend', 30),
    makeBot('red', 0, 'attack', 75),
    makeBot('red', 1, 'attack', -85),
    makeBot('red', 2, 'escort', -28),
    makeBot('red', 3, 'defend', 35),
  );

  const actorById = (id) => id === PLAYER_ID ? player : state.bots.find((bot) => bot.id === id);
  const actorTeam = (actor) => actor === player ? 'blue' : actor.team;
  const actorId = (actor) => actor === player ? PLAYER_ID : actor.id;
  const isAlive = (actor) => actor === player ? player.health > 0 && state.respawnIn <= 0 : actor.alive && actor.health > 0;
  const carrying = (actor) => Object.values(state.flags).find((flag) => flag.carrier === actorId(actor));
  const allActors = () => [player, ...state.bots];

  function setFlagHome(flag, announce = false, actor = null) {
    flag.status = 'home';
    flag.carrier = null;
    flag.position.copy(basePosition(flag.team));
    flag.droppedFor = 0;
    if (announce) emit('flag-return', `${flag.team === 'blue' ? 'Blue' : 'Red'} flag returned${actor === player ? ' — nice recovery!' : ''}`, { team: flag.team, actor: actor && actorId(actor) });
  }

  function dropFlag(actor) {
    const flag = carrying(actor);
    if (!flag) return;
    flag.status = 'dropped';
    flag.carrier = null;
    flag.position.copy(actor.position);
    flag.position.x = THREE.MathUtils.clamp(flag.position.x, -635, 635);
    flag.position.z = THREE.MathUtils.clamp(flag.position.z, -635, 635);
    flag.position.y = ground(flag.position.x, flag.position.z);
    flag.droppedFor = 0;
    emit('flag-drop', `${flag.team === 'blue' ? 'Blue' : 'Red'} flag dropped!`, { team: flag.team, actor: actorId(actor) });
  }

  function effect(position, team, size = 1) {
    // Fixed cap and shared geometry/materials: no accumulating GPU allocations.
    if (effects.length >= 48) root.remove(effects.shift().visual);
    const visual = new THREE.Group();
    visual.position.copy(position);
    mesh(sphere, glowMaterials[team], visual, null, [0.7, 0.7, 0.7]);
    mesh(ring, glowMaterials[team], visual).rotation.x = Math.PI / 2;
    root.add(visual);
    effects.push({ visual, age: 0, duration: 0.42, size });
  }

  function damageActor(actor, amount, source = null, ignoreProtection = false) {
    if (state.ended || !isAlive(actor) || !Number.isFinite(amount) || amount <= 0) return false;
    if (!ignoreProtection && (actor === player ? playerProtection > 0 : actor.protection > 0)) return false;
    actor.health = Math.max(0, actor.health - amount);
    if (actor === player) state.lastDamageAt = elapsed;
    if (actor.health > 0) return true;
    dropFlag(actor);
    actor.velocity.set(0, 0, 0);
    if (actor === player) {
      state.respawnIn = 4;
      deadPosition = player.position.clone();
      emit('player-death', 'Armor destroyed — redeploying in 4 seconds.', { source });
    } else {
      actor.alive = false;
      actor.respawnIn = 7;
      actor.visual.visible = false;
      effect(actor.position, actor.team, 4);
      if (source === PLAYER_ID) {
        state.playerKills++;
        emit('kill', `${actor.name} eliminated`, { bot: actor.id, playerKills: state.playerKills });
      }
    }
    return true;
  }

  function spawnDisc(origin, aim, owner) {
    const team = actorTeam(owner);
    const visual = new THREE.Group();
    visual.name = `${team}-spinfusor-disc`;
    const disc = mesh(cylinder, glowMaterials[team], visual, null, [0.62, 0.13, 0.62]);
    disc.rotation.x = Math.PI / 2;
    mesh(ring, white, visual, null, [0.64, 0.64, 0.64]);
    mesh(sphere, white, visual, null, [0.2, 0.2, 0.12]);
    mesh(cone, glowMaterials[team], visual, [0, 0, -2], [0.2, 4, 0.2]).rotation.x = -Math.PI / 2;
    visual.position.copy(origin);
    visual.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), aim);
    root.add(visual);
    const projectile = {
      position: origin.clone(), previousPosition: origin.clone(),
      velocity: aim.clone().multiplyScalar(owner === player ? 170 : 135),
      owner: actorId(owner), team, age: 0, visual,
    };
    state.projectiles.push(projectile);
    return projectile;
  }

  function fire(aim = null) {
    if (disposed || state.ended || !isAlive(player) || state.weaponCooldown > 0) return false;
    if (aim?.isVector3) direction.copy(aim).normalize();
    else direction.set(-Math.sin(player.yaw || 0) * Math.cos(player.pitch || 0),
      Math.sin(player.pitch || 0), -Math.cos(player.yaw || 0) * Math.cos(player.pitch || 0));
    if (direction.lengthSq() < 0.5) return false;
    const origin = player.position.clone().addScaledVector(direction, 1.7);
    origin.y -= 0.28;
    spawnDisc(origin, direction, player);
    state.weaponCooldown = FIRE_INTERVAL;
    emit('fire', '', { weapon: 'spinfusor', actor: PLAYER_ID });
    return true;
  }

  function explode(projectile, directHit = null) {
    effect(projectile.position, projectile.team, SPLASH_RADIUS);
    for (const actor of allActors()) {
      // No friendly fire or surprise self-damage; enemy splash is still dangerous.
      if (!isAlive(actor) || actorTeam(actor) === projectile.team) continue;
      scratch.copy(actor.position); scratch.y -= 0.75;
      const distance = scratch.distanceTo(projectile.position);
      if (actor === directHit || distance < SPLASH_RADIUS) {
        const damage = actor === directHit ? 78 : 64 * (1 - distance / SPLASH_RADIUS);
        const damaged = damageActor(actor, damage, projectile.owner);
        if (damaged && projectile.owner === PLAYER_ID) emit('hit', '', { target: actorId(actor), damage });
        if (damaged && actor === player) {
          // Small readable blast shove, without taking movement/energy ownership.
          scratch.sub(projectile.position).normalize().multiplyScalar(8 * (1 - Math.min(distance / SPLASH_RADIUS, 1)));
          player.velocity.add(scratch);
        }
      }
    }
  }

  function segmentHit(start, end, center, radius) {
    segment.subVectors(end, start);
    relative.subVectors(start, center);
    const a = segment.lengthSq();
    const c = relative.lengthSq() - radius * radius;
    if (c <= 0) return 0;
    if (a < 1e-10) return null;
    const b = relative.dot(segment);
    const discriminant = b * b - a * c;
    if (discriminant < 0) return null;
    const t = (-b - Math.sqrt(discriminant)) / a;
    return t >= 0 && t <= 1 ? t : null;
  }

  function terrainHit(start, end) {
    const distance = start.distanceTo(end);
    const steps = Math.max(1, Math.ceil(distance / 2));
    let previousT = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      candidate.lerpVectors(start, end, t);
      if (candidate.y <= ground(candidate.x, candidate.z) + 0.18) {
        let low = previousT, high = t;
        for (let j = 0; j < 5; j++) {
          const mid = (low + high) * 0.5;
          candidate.lerpVectors(start, end, mid);
          if (candidate.y <= ground(candidate.x, candidate.z) + 0.18) high = mid;
          else low = mid;
        }
        return high;
      }
      previousT = t;
    }
    return null;
  }

  function updateProjectiles(dt) {
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const p = state.projectiles[i];
      p.previousPosition.copy(p.position);
      p.position.addScaledVector(p.velocity, dt);
      p.age += dt;
      let hitT = terrainHit(p.previousPosition, p.position);
      let hitActor = null;
      for (const actor of allActors()) {
        if (!isAlive(actor) || actorTeam(actor) === p.team) continue;
        scratch.copy(actor.position); scratch.y -= 0.7;
        const t = segmentHit(p.previousPosition, p.position, scratch, 1.7);
        if (t !== null && (hitT === null || t < hitT)) { hitT = t; hitActor = actor; }
      }
      const expired = p.age >= 4.5 || Math.abs(p.position.x) > 660 || Math.abs(p.position.z) > 660;
      if (hitT !== null || expired) {
        if (hitT !== null) {
          p.position.lerpVectors(p.previousPosition, p.position, hitT);
          explode(p, hitActor);
        }
        root.remove(p.visual);
        state.projectiles.splice(i, 1);
      } else {
        p.visual.position.copy(p.position);
        p.visual.rotateZ(dt * 15);
      }
    }
  }

  function spawnBot(bot, initial = false) {
    const home = basePosition(bot.team);
    const index = Number(bot.id.split('-')[1]);
    bot.position.set(home.x + (index - 1) * 10, 0, home.z + (bot.team === 'blue' ? -8 : 8));
    bot.position.y = ground(bot.position.x, bot.position.z) + 2.2;
    bot.velocity.set(0, 0, 0);
    bot.health = 100; bot.alive = true; bot.respawnIn = 0;
    bot.energy = 100; bot.protection = 1.5; bot.grounded = true;
    bot.skiing = false; bot.jetting = false;
    bot.cooldown = 1.1 + index * 0.45;
    bot.launchDelay = initial ? (bot.team === 'red' ? 3 + index * 1.5 : index * 1.2) : 1.2;
    bot.visual.visible = true;
    bot.visual.position.copy(bot.position);
    bot.visual.rotation.set(0, bot.team === 'blue' ? 0 : Math.PI, 0);
    bot.jets.visible = false;
    bot.healthFill.scale.x = 2;
    bot.healthFill.position.x = 0;
    for (const limb of bot.limbs) limb.rotation.x = 0;
    bot.indicator.quaternion.copy(bot.visual.quaternion).invert().multiply(world.camera.quaternion);
  }

  function nearestEnemy(bot, range) {
    let target = null, best = range * range;
    for (const actor of allActors()) {
      if (!isAlive(actor) || actorTeam(actor) === bot.team) continue;
      const d = bot.position.distanceToSquared(actor.position);
      // Flag carriers are tempting, but never shoot across the whole arena.
      const weighted = carrying(actor) ? d * 0.7 : d;
      if (d < range * range && weighted < best) { best = weighted; target = actor; }
    }
    return target;
  }

  function botGoal(bot) {
    const own = state.flags[bot.team];
    const enemy = state.flags[otherTeam(bot.team)];
    if (carrying(bot)) return basePosition(bot.team);
    if (own.status === 'dropped' && bot.position.distanceTo(own.position) < 240) return own.position;
    if (bot.role === 'defend') {
      if (own.status === 'carried') return own.position;
      const threat = nearestEnemy(bot, 145);
      if (threat && threat.position.distanceTo(basePosition(bot.team)) < 155) return threat.position;
      return basePosition(bot.team).add(new THREE.Vector3(Math.sin(elapsed * 0.15 + bot.phase) * 38, 0, bot.team === 'blue' ? -35 : 35));
    }
    if (bot.role === 'escort' && enemy.status === 'carried') {
      const carrier = actorById(enemy.carrier);
      if (carrier && actorTeam(carrier) === bot.team) {
        return carrier.position.clone().add(new THREE.Vector3(bot.lane * 0.3, 0, bot.team === 'blue' ? -12 : 12));
      }
    }
    if (own.status === 'carried' && bot.role === 'escort') return own.position;
    // Crossing lanes are direct enough to reliably threaten flags, but vary routes.
    const goal = enemy.position;
    if (Math.abs(bot.position.z) > 70 && bot.position.z * goal.z < 0) {
      return new THREE.Vector3(bot.lane, ground(bot.lane, 0), 0);
    }
    return goal;
  }

  function clearShot(start, end) {
    const distance = start.distanceTo(end);
    const count = Math.ceil(distance / 12);
    for (let i = 1; i < count; i++) {
      candidate.lerpVectors(start, end, i / count);
      if (candidate.y < ground(candidate.x, candidate.z) + 0.4) return false;
    }
    return true;
  }

  function updateBots(dt) {
    for (const bot of state.bots) {
      bot.protection = Math.max(0, bot.protection - dt);
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      if (!bot.alive) {
        bot.respawnIn = Math.max(0, bot.respawnIn - dt);
        if (bot.respawnIn <= 0) spawnBot(bot);
        continue;
      }
      bot.launchDelay = Math.max(0, bot.launchDelay - dt);
      const goal = botGoal(bot);
      const dx = goal.x - bot.position.x, dz = goal.z - bot.position.z;
      const distance = Math.hypot(dx, dz);
      const nearObjective = distance < 22;
      const targetSpeed = bot.launchDelay > 0 ? 0 : Math.min(distance * 2, bot.role === 'defend' ? 27 : carrying(bot) ? 44 : 38);
      const steering = 1 - Math.exp(-dt * (nearObjective ? 5 : 1.6));
      const vx = distance > 0.1 ? dx / distance * targetSpeed : 0;
      const vz = distance > 0.1 ? dz / distance * targetSpeed : 0;
      bot.velocity.x += (vx - bot.velocity.x) * steering;
      bot.velocity.z += (vz - bot.velocity.z) * steering;
      if (bot.grounded && !nearObjective && bot.launchDelay <= 0) {
        // Downhill skiing contributes acceleration; steering preserves momentum.
        const slopeX = (ground(bot.position.x + 2, bot.position.z) - ground(bot.position.x - 2, bot.position.z)) / 4;
        const slopeZ = (ground(bot.position.x, bot.position.z + 2) - ground(bot.position.x, bot.position.z - 2)) / 4;
        bot.velocity.x -= slopeX * 15 * dt;
        bot.velocity.z -= slopeZ * 15 * dt;
      }
      const jetPhase = (elapsed + bot.phase * 3) % 10;
      const jetting = !nearObjective && bot.launchDelay <= 0 && jetPhase < 1.5 && bot.energy > 8;
      bot.jetting = jetting;
      if (jetting) {
        bot.velocity.y = Math.min(19, bot.velocity.y + 36 * dt);
        bot.energy = Math.max(0, bot.energy - 24 * dt);
      } else {
        bot.velocity.y -= 25 * dt;
        bot.energy = Math.min(100, bot.energy + (bot.grounded ? 22 : 9) * dt);
      }
      bot.position.addScaledVector(bot.velocity, dt);
      bot.position.x = THREE.MathUtils.clamp(bot.position.x, -620, 620);
      bot.position.z = THREE.MathUtils.clamp(bot.position.z, -620, 620);
      const floor = ground(bot.position.x, bot.position.z) + 2.2;
      bot.grounded = bot.position.y <= floor;
      if (bot.grounded) { bot.position.y = floor; bot.velocity.y = Math.max(0, bot.velocity.y); }
      bot.skiing = bot.grounded && Math.hypot(bot.velocity.x, bot.velocity.z) > 10;
      bot.jets.visible = jetting || !bot.grounded;
      const target = nearestEnemy(bot, bot.role === 'defend' ? 125 : 105);
      if (target && bot.cooldown <= 0 && bot.launchDelay <= 0) {
        const origin = bot.position.clone(); origin.y -= 0.25;
        const aimPoint = target.position.clone(); aimPoint.y -= 0.7;
        const lead = Math.min(0.55, origin.distanceTo(aimPoint) / 135);
        aimPoint.addScaledVector(target.velocity, lead * 0.72);
        // Deterministic modest inaccuracy rewards movement without making bots harmless.
        aimPoint.x += Math.sin(elapsed * 2.2 + bot.phase) * 2.3;
        aimPoint.z += Math.cos(elapsed * 1.7 + bot.phase) * 1.4;
        if (clearShot(origin, aimPoint)) {
          direction.subVectors(aimPoint, origin).normalize();
          origin.addScaledVector(direction, 1.7);
          spawnDisc(origin, direction, bot);
          bot.cooldown = 1.65 + (bot.team === 'red' ? 0.45 : 0.2) + (Math.sin(bot.phase + elapsed) + 1) * 0.35;
        } else bot.cooldown = 0.3;
      }
      bot.visual.position.copy(bot.position);
      if (target) bot.visual.rotation.y = Math.atan2(bot.position.x - target.position.x, bot.position.z - target.position.z);
      else if (Math.hypot(bot.velocity.x, bot.velocity.z) > 1) bot.visual.rotation.y = Math.atan2(-bot.velocity.x, -bot.velocity.z);
      for (let i = 0; i < bot.limbs.length; i++) bot.limbs[i].rotation.x = bot.grounded ? Math.sin(elapsed * 7 + i * Math.PI + bot.phase) * 0.13 : -0.35;
      bot.healthFill.scale.x = 2 * Math.max(0, bot.health / 100);
      bot.healthFill.position.x = -(1 - bot.health / 100);
      bot.indicator.quaternion.copy(bot.visual.quaternion).invert().multiply(world.camera.quaternion);
      bot.jets.scale.y = (jetting ? 0.8 : 0.3) + Math.sin(elapsed * 30 + bot.phase) * 0.1;
    }
  }

  function finishMatch() {
    if (state.ended) return;
    state.ended = true;
    state.winner = state.blueScore === state.redScore ? 'draw' : state.blueScore > state.redScore ? 'blue' : 'red';
    emit('match-end', state.winner === 'draw' ? 'Time! The match ends in a draw.' : `${state.winner === 'blue' ? 'Blue' : 'Red'} wins the match!`, { winner: state.winner });
  }

  function updateFlags(dt) {
    // Update carriers before proximity checks so captures use the actual current position.
    for (const flag of Object.values(state.flags)) {
      if (flag.status === 'carried') {
        const carrier = actorById(flag.carrier);
        if (carrier && isAlive(carrier)) flag.position.copy(carrier.position);
        else { flag.status = 'dropped'; flag.carrier = null; flag.position.y = ground(flag.position.x, flag.position.z); flag.droppedFor = 0; }
      } else if (flag.status === 'dropped') {
        flag.droppedFor += dt;
        if (flag.droppedFor >= 35) setFlagHome(flag, true);
      }
    }
    const near = (actor, flag) => Math.hypot(actor.position.x - flag.position.x, actor.position.z - flag.position.z) < 8
      && Math.abs(actor.position.y - (flag.position.y + 2.2)) < 8;
    // Friendly recoveries precede enemy grabs. Home flags are never stolen by teammates.
    for (const flag of Object.values(state.flags)) {
      if (flag.status !== 'dropped') continue;
      const rescuer = allActors().find((actor) => isAlive(actor) && actorTeam(actor) === flag.team && near(actor, flag));
      if (rescuer) setFlagHome(flag, true, rescuer);
    }
    for (const actor of allActors()) {
      if (!isAlive(actor)) continue;
      const team = actorTeam(actor), enemyFlag = state.flags[otherTeam(team)];
      if (!carrying(actor) && enemyFlag.status !== 'carried' && near(actor, enemyFlag)) {
        enemyFlag.status = 'carried'; enemyFlag.carrier = actorId(actor);
        enemyFlag.position.copy(actor.position); enemyFlag.droppedFor = 0;
        emit('flag-pickup', actor === player ? 'You have the Red flag! Bring it to Blue base.' : `${actor.name} took the ${enemyFlag.team === 'blue' ? 'Blue' : 'Red'} flag!`, { team: enemyFlag.team, actor: actorId(actor) });
      }
      const held = carrying(actor);
      if (!held || held.team === team) continue;
      const home = basePosition(team);
      if (state.flags[team].status === 'home'
        && Math.hypot(actor.position.x - home.x, actor.position.z - home.z) < 11
        && Math.abs(actor.position.y - (home.y + 2.2)) < 10) {
        state[`${team}Score`]++;
        setFlagHome(held);
        emit('capture', `${team === 'blue' ? 'Blue' : 'Red'} captures! ${state.blueScore} — ${state.redScore}`, { team, actor: actorId(actor), blueScore: state.blueScore, redScore: state.redScore });
        if (state[`${team}Score`] >= 3) { finishMatch(); break; }
      }
    }
    syncFlagVisuals();
  }

  function syncFlagVisuals() {
    for (const flag of Object.values(state.flags)) {
      const carried = flag.status === 'carried';
      flag.visual.position.copy(flag.position);
      flag.visual.scale.setScalar(carried ? 0.48 : 1);
      flag.pedestal.visible = !carried;
      if (carried) {
        flag.visual.position.y -= 1;
        flag.visual.position.x += 0.95;
      }
      flag.banner.rotation.y = Math.sin(elapsed * 2.8) * 0.12;
      flag.beacon.scale.setScalar(0.48 + Math.sin(elapsed * 4) * 0.06);
    }
  }

  function respawnPlayer() {
    world.resetPlayer(world.bases.blue.clone());
    player.position.y = ground(player.position.x, player.position.z) + 2.2;
    player.health = 100;
    playerProtection = 2.5;
    state.respawnIn = 0;
    state.weaponCooldown = 0;
    deadPosition = null;
    emit('respawn', 'Redeployed at Blue base — armor restored.');
  }

  function updateEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i]; e.age += dt;
      if (e.age >= e.duration) { root.remove(e.visual); effects.splice(i, 1); continue; }
      const t = e.age / e.duration;
      e.visual.scale.setScalar(0.25 + t * e.size);
      e.visual.children[0].scale.setScalar(Math.max(0.01, (1 - t) * 0.7));
      e.visual.children[1].scale.setScalar(0.4 + t);
    }
  }

  function update(dt, input = {}) {
    if (disposed || state.ended || !Number.isFinite(dt) || dt <= 0) return;
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    if (state.timeLeft === 0) { finishMatch(); return; }
    // Small physics slices prevent fast discs and jetting bots skipping terrain.
    // Large explicit test steps are supported; normal rendering is one or two slices.
    let remaining = Math.min(dt, MATCH_SECONDS);
    while (remaining > 1e-8 && !state.ended) {
      const slice = Math.min(remaining, 1 / 30);
      remaining -= slice; elapsed += slice;
      playerProtection = Math.max(0, playerProtection - slice);
      state.weaponCooldown = Math.max(0, state.weaponCooldown - slice);
      if (state.respawnIn > 0) {
        state.respawnIn = Math.max(0, state.respawnIn - slice);
        player.velocity.set(0, 0, 0);
        if (deadPosition) player.position.copy(deadPosition);
        if (state.respawnIn <= 1e-7) respawnPlayer();
      } else if (player.health <= 0) {
        // Also handle external test/world damage without leaving a zombie player.
        player.health = 1; damageActor(player, 1, null, true);
      }
      if (input.fire) fire();
      updateBots(slice);
      updateProjectiles(slice);
      updateFlags(slice);
      updateEffects(slice);
    }
  }

  function restart() {
    if (disposed) return;
    for (const p of state.projectiles) root.remove(p.visual);
    for (const e of effects) root.remove(e.visual);
    state.projectiles.length = 0; effects.length = 0;
    state.blueScore = 0; state.redScore = 0; state.playerKills = 0;
    state.timeLeft = MATCH_SECONDS; state.ended = false; state.winner = null;
    state.respawnIn = 0; state.weaponCooldown = 0; state.ammo = Infinity;
    delete state.lastDamageAt;
    elapsed = 0; playerProtection = 2; deadPosition = null;
    world.resetPlayer(world.bases.blue.clone());
    player.position.y = ground(player.position.x, player.position.z) + 2.2;
    player.health = 100;
    for (const flag of Object.values(state.flags)) setFlagHome(flag);
    for (const bot of state.bots) spawnBot(bot, true);
    syncFlagVisuals();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(root);
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    state.projectiles.length = 0; effects.length = 0;
  }

  restart();
  return {
    state, update, restart, fire, dropFlag: () => dropFlag(player), dispose,
    // Explicit damage hooks bypass protection for repeatable state-transition checks.
    damagePlayer: (amount, source = null) => damageActor(player, amount, source, true),
    damageBot: (botOrId, amount, source = PLAYER_ID) => {
      const bot = typeof botOrId === 'string' ? actorById(botOrId) : botOrId;
      return state.bots.includes(bot) ? damageActor(bot, amount, source, true) : false;
    },
  };
}
