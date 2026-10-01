import { createGameVisuals } from './game-visuals.js';
import { createNavigation } from './game-navigation.js';

const CLIP = 30;
const MAX_RESERVE = 180;
const RELOAD_TIME = 1.85;
const FIRE_INTERVAL = 0.105;
const RESUPPLY_COST = 300;
const MAX_ENEMIES = 24;
const RANGE = 75;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;

/**
 * Host owns waves/enemy health; camera, ammunition and player health are local.
 * Optional additions to ARCHITECTURE.md:
 * - setPeers([{id, position:[x,y,z], health}]) enables nearest-player targeting.
 * - peerDamage event {peerId, damage, enemyId}; recipient calls applyDamage(damage).
 * - applyRemoteShot({...shot, playerId}) returns the resolved hit information.
 * - Snapshot shot receipts confirm guest kills/score without trusting client hits.
 * - world.supplyPosition or world.supplyCrate.position may identify a world crate.
 */
export function createGame({ THREE, scene, camera, world, audio, onEvent = () => {} }) {
  const colliders = [...(world.colliders || [])];
  let nav = createNavigation(colliders);
  const visuals = createGameVisuals(THREE, scene, camera);
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const ray = new THREE.Ray();
  const sphere = new THREE.Sphere();
  const intersection = new THREE.Vector3();
  const wallBox = new THREE.Box3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const muzzlePosition = new THREE.Vector3();
  const enemies = new Map();
  const corpses = [];
  const pendingShots = new Map();
  const receivedShots = new Map();
  const receipts = [];
  let peers = [];
  let fields = new Map();
  let authority = true;
  let state;
  let time = 0, yaw = 0, pitch = 0, recoil = 0, aim = 0;
  let fireCooldown = 0, emptyCooldown = 0, reloadLeft = 0, stepTime = 0;
  let lastDamageTime = -Infinity;
  let fieldTime = 0, spawnTimer = 0, remainingSpawns = 0, nextEnemyId = 1;
  let lastKeys = new Set(), moving = false, sprinting = false;
  let snapshotSerial = 0, lastSnapshotSerial = -1, snapshotRun = null;
  let runId = '', shotSequence = 0, disposed = false;
  const clientToken = Math.random().toString(36).slice(2, 10);
  const baseFov = clamp(finite(camera.fov, 75), 55, 100);

  function positionOf(value, fallback = [0, 0, 12]) {
    if (Array.isArray(value)) return new THREE.Vector3(finite(value[0], fallback[0]), finite(value[1], fallback[1]), finite(value[2], fallback[2]));
    if (value && typeof value === 'object') return new THREE.Vector3(finite(value.x, fallback[0]), finite(value.y, fallback[1]), finite(value.z, fallback[2]));
    return new THREE.Vector3(...fallback);
  }
  const spawn = positionOf(world.playerSpawn);
  if (!nav.free(spawn.x, spawn.z)) Object.assign(spawn, nav.nearestPoint(spawn.x, spawn.z));
  spawn.y = 1.7;
  const suppliedCrate = world.supplyPosition || world.supplyCrate?.position;
  const supplyPosition = positionOf(suppliedCrate, [spawn.x - 2.5, 0, spawn.z - 4]);
  if (!suppliedCrate) {
    if (!nav.free(supplyPosition.x, supplyPosition.z, 0.8)) Object.assign(supplyPosition, nav.nearestPoint(supplyPosition.x, supplyPosition.z));
    supplyPosition.y = 0;
  }
  const fallbackCrate = !suppliedCrate ? visuals.createSupply(supplyPosition) : null;
  if (fallbackCrate) {
    colliders.push({ minX: supplyPosition.x - 0.6, maxX: supplyPosition.x + 0.6,
      minZ: supplyPosition.z - 0.35, maxZ: supplyPosition.z + 0.35, height: 0.71 });
    nav = createNavigation(colliders);
  }

  const emit = (type, data = {}) => onEvent(type, data);
  const sound = (name, options = {}) => audio?.play?.(name, options);
  const active = () => state.phase === 'playing' || state.phase === 'intermission';
  const notify = (message, kind = 'info') => emit('notification', { message, text: message, kind });
  function cleanActors() {
    for (const enemy of enemies.values()) visuals.removeZombie(enemy.model);
    for (const corpse of corpses) visuals.removeZombie(corpse.model);
    enemies.clear();
    corpses.length = 0;
    visuals.clearEffects();
  }
  function initialState() {
    return {
      health: 100, ammo: CLIP, reserve: 120, score: 0, kills: 0, wave: 0,
      enemies: 0, phase: 'menu', phaseTime: 0, weapon: 'KESTREL / 9mm',
      stamina: 100, interaction: '',
    };
  }
  function reset() {
    cleanActors();
    state = initialState();
    time = 0; yaw = 0; pitch = 0; recoil = 0; aim = 0;
    fireCooldown = 0; emptyCooldown = 0; reloadLeft = 0; stepTime = 0;
    lastDamageTime = -Infinity;
    fieldTime = 0; spawnTimer = 0; remainingSpawns = 0; nextEnemyId = 1;
    snapshotSerial = 0; lastSnapshotSerial = -1; snapshotRun = null;
    moving = false; sprinting = false;
    lastKeys = new Set();
    fields.clear(); pendingShots.clear(); receivedShots.clear(); receipts.length = 0;
    runId = `${clientToken}-${Date.now().toString(36)}-${++shotSequence}`;
    visuals.weapon.visible = false;
    if (fallbackCrate) fallbackCrate.visible = false;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  }
  function start({ spawnIndex = 0 } = {}) {
    if (disposed) return;
    reset();
    camera.position.copy(spawn);
    const offsets = [[0, 0], [1.3, 0], [-1.3, 0], [0, 1.3]];
    const offset = offsets[clamp(Math.floor(finite(spawnIndex)), 0, 3)];
    if (nav.free(spawn.x + offset[0], spawn.z + offset[1], 0.3)) {
      camera.position.x += offset[0];
      camera.position.z += offset[1];
    }
    camera.rotation.order = 'YXZ';
    camera.rotation.set(0, 0, 0);
    visuals.weapon.visible = true;
    if (fallbackCrate) fallbackCrate.visible = true;
    state.phase = 'playing';
    sound('start');
    if (authority) beginWave(1);
    else notify('Connected. Waiting for station telemetry.');
    updateWeapon(0, 0);
  }
  function beginWave(number) {
    state.wave = number;
    state.phase = 'playing';
    state.phaseTime = 0;
    remainingSpawns = Math.min(48, 5 + number * 3 + peers.filter(p => p.health > 0).length * 2);
    spawnTimer = 0;
    sound('wave', { wave: number });
    emit('wave', { wave: number, phase: 'playing', enemies: remainingSpawns });
    notify(`Transmission ${String(number).padStart(2, '0')} — incoming infected.`);
    spawnEnemy();
  }
  function beginIntermission() {
    state.phase = 'intermission';
    state.phaseTime = 12;
    const bonus = 100 + state.wave * 25;
    state.score += bonus;
    emit('wave', { wave: state.wave, phase: 'intermission', phaseTime: 12, bonus });
    notify(`Sector clear. +${bonus} essence. Resupply before the next transmission.`);
  }
  function livingTargets() {
    const result = [];
    if (state.health > 0) result.push({ id: 'local', x: camera.position.x, z: camera.position.z });
    for (const peer of peers) if (peer.health > 0) result.push({ id: peer.id, x: peer.position.x, z: peer.position.z });
    return result;
  }
  function chooseSpawn() {
    const raw = world.spawnPoints?.length ? world.spawnPoints : [
      [-21, 0, -21], [21, 0, -21], [-21, 0, 20], [21, 0, 20], [0, 0, -22], [-22, 0, 0], [22, 0, 0],
    ];
    const targets = livingTargets();
    let best = null, bestDistance = -1;
    const startIndex = Math.floor(Math.random() * raw.length);
    for (let i = 0; i < raw.length; i++) {
      const candidate = positionOf(raw[(startIndex + i) % raw.length], [0, 0, -21]);
      candidate.x += (Math.random() - 0.5) * 1.5;
      candidate.z += (Math.random() - 0.5) * 1.5;
      if (!nav.free(candidate.x, candidate.z)) Object.assign(candidate, nav.nearestPoint(candidate.x, candidate.z));
      const distance = Math.min(...targets.map(target => Math.hypot(candidate.x - target.x, candidate.z - target.z)), 40);
      if (distance > bestDistance) { best = candidate; bestDistance = distance; }
      if (distance > 10 && ![...enemies.values()].some(enemy => Math.hypot(enemy.x - candidate.x, enemy.z - candidate.z) < 1)) break;
    }
    return best || positionOf([0, 0, -21]);
  }
  function addEnemy(data) {
    const enemy = {
      id: String(data.id), x: data.x, z: data.z, yaw: data.yaw || 0,
      health: data.health, maxHealth: data.maxHealth || data.health,
      speed: data.speed || 1, variant: data.variant || 0,
      archetype: data.archetype || 'walker',
      scale: clamp(finite(data.scale, 1), 0.7, 1.7),
      points: clamp(finite(data.points, 1), 0.5, 4),
      damageBonus: clamp(finite(data.damageBonus, 0), 0, 20),
      attackCooldown: 0.7, attacking: 0, hurtTime: 0, pendingAttack: null,
      targetX: data.x, targetZ: data.z, targetYaw: data.yaw || 0,
      model: visuals.zombie(data.id, data.variant || 0),
    };
    enemy.model.group.position.set(enemy.x, 0, enemy.z);
    enemy.model.group.rotation.y = enemy.yaw;
    enemy.model.rig.scale.setScalar(enemy.scale);
    enemies.set(enemy.id, enemy);
    return enemy;
  }
  const ARCHETYPES = {
    walker: { health: 1, speed: 1, scale: 1, damage: 0, points: 1 },
    runner: { health: 0.68, speed: 1.55, scale: 0.94, damage: 3, points: 1.5 },
    brute:  { health: 2.15, speed: 0.68, scale: 1.32, damage: 9, points: 2.4 },
  };
  function pickArchetype() {
    if (state.wave < 3) return 'walker';
    const roll = Math.random();
    if (state.wave >= 6 && roll < 0.13) return 'brute';
    if (roll < 0.34) return 'runner';
    return 'walker';
  }
  function spawnEnemy() {
    if (remainingSpawns <= 0 || enemies.size >= MAX_ENEMIES) return;
    const point = chooseSpawn();
    const archetype = pickArchetype();
    const traits = ARCHETYPES[archetype];
    const health = Math.round((84 + Math.min(90, (state.wave - 1) * 9)) * traits.health);
    addEnemy({
      id: `${runId}:${nextEnemyId++}`, x: point.x, z: point.z, health, archetype,
      scale: traits.scale, points: traits.points, damageBonus: traits.damage,
      speed: (0.9 + Math.min(1.0, state.wave * 0.065) + Math.random() * 0.2) * traits.speed,
      variant: Math.floor(Math.random() * 4),
    });
    remainingSpawns--;
    spawnTimer = Math.max(0.38, 1.05 - state.wave * 0.035);
  }
  function retireEnemy(enemy, animate = true) {
    enemies.delete(enemy.id);
    if (animate) {
      corpses.push({ model: enemy.model, life: 0 });
      if (corpses.length > 8) visuals.removeZombie(corpses.shift().model);
    } else visuals.removeZombie(enemy.model);
  }
  function applyDamage(amount, details = {}) {
    if (!active() || state.health <= 0 || !Number.isFinite(amount) || amount <= 0) return;
    const damage = clamp(amount, 0, 100);
    lastDamageTime = time;
    state.health = Math.max(0, state.health - damage);
    sound('hurt');
    emit('hurt', { damage, health: state.health, ...details });
    if (state.health === 0) {
      state.phase = 'dead';
      state.phaseTime = 0;
      state.interaction = '';
      reloadLeft = 0;
      visuals.weapon.visible = false;
      sound('death');
      emit('death', { score: state.score, kills: state.kills, wave: state.wave });
    }
  }

  function nearestHit(from, dir) {
    ray.set(from, dir);
    let distance = RANGE, hitEnemy = null, headshot = false, surface = false;
    for (const collider of colliders) {
      wallBox.min.set(collider.minX, finite(collider.minY, 0), collider.minZ);
      wallBox.max.set(collider.maxX, finite(collider.maxY, finite(collider.height, 4)), collider.maxZ);
      if (ray.intersectBox(wallBox, intersection)) {
        const d = from.distanceTo(intersection);
        if (d < distance) { distance = d; surface = true; }
      }
    }
    if (dir.y < -0.0001) {
      const d = -from.y / dir.y;
      if (d >= 0 && d < distance) { distance = d; surface = true; }
    }
    for (const enemy of enemies.values()) {
      // Separate head and torso hit volumes, including moving limbs. The head
      // is tested against the same wall distance, so walls cannot grant hits.
      // Hit volumes scale with the archetype so brutes are not headshot pellets.
      const scale = enemy.scale;
      const bob = enemy.model.rig.position.y;
      const volumes = [[(1.65 + bob) * scale, 0.225 * scale, true], [(1.18 + bob) * scale, 0.34 * scale, false], [(0.75 + bob) * scale, 0.28 * scale, false], [0.34 * scale, 0.25 * scale, false]];
      for (const [height, radius, isHead] of volumes) {
        sphere.center.set(enemy.x, height, enemy.z);
        sphere.radius = radius;
        if (ray.intersectSphere(sphere, intersection)) {
          const d = from.distanceTo(intersection);
          if (d < distance) { distance = d; hitEnemy = enemy; headshot = isHead; surface = true; }
        }
      }
    }
    return { enemy: hitEnemy, headshot, distance, surface, point: from.clone().addScaledVector(dir, distance) };
  }
  function awardKill(result, local = true) {
    if (local) {
      state.kills++;
      state.score += result.points;
      sound('kill', { headshot: result.headshot });
    }
    emit('kill', { ...result, remote: !local, score: local ? state.score : undefined, kills: local ? state.kills : undefined });
  }
  function resolveShot(data, local) {
    const from = positionOf(data.origin, [0, 1.7, 0]);
    const dir = positionOf(data.direction, [0, 0, -1]).normalize();
    const hit = nearestHit(from, dir);
    const result = {
      shotId: data.shotId, playerId: data.playerId, hit: !!hit.enemy, headshot: hit.headshot,
      killed: false, points: 0, damage: 0, enemyId: hit.enemy?.id, position: hit.point.toArray(),
    };
    if (hit.enemy) {
      const enemy = hit.enemy;
      // Fixed weapon damage is host-owned; never accept arbitrary client damage.
      result.damage = hit.headshot ? 96 : 32;
      enemy.health -= result.damage;
      enemy.hurtTime = 0.16;
      if (local) sound('hit', { headshot: hit.headshot });
      emit('hit', { ...result, remote: !local, confirmed: true });
      if (enemy.health <= 0) {
        result.killed = true;
        result.points = Math.round((hit.headshot ? 150 : 100) * enemy.points);
        retireEnemy(enemy);
        awardKill(result, local);
      }
    }
    if (local) {
      camera.updateMatrixWorld(true);
      muzzlePosition.set(0, 0.023, -0.79).applyMatrix4(visuals.weapon.matrixWorld);
      visuals.trace(muzzlePosition, hit.point, hit.surface, !!hit.enemy);
    } else visuals.trace(from, hit.point, hit.surface, !!hit.enemy);
    return result;
  }
  function shoot() {
    if (!active() || reloadLeft > 0 || fireCooldown > 0) return false;
    if (state.ammo <= 0) {
      if (emptyCooldown <= 0) { sound('empty'); emptyCooldown = 0.4; }
      if (state.reserve > 0) reload();
      return false;
    }
    state.ammo--;
    fireCooldown = FIRE_INTERVAL;
    recoil = Math.min(1.8, recoil + 0.75);
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(origin);
    camera.getWorldDirection(direction);
    // A small cone rewards ADS while leaving first-shot center aim readable.
    const spread = (0.0008 + (1 - aim) * 0.0028) * (moving ? 1.8 : 1);
    direction.x += (Math.random() - 0.5) * spread;
    direction.y += (Math.random() - 0.5) * spread;
    direction.z += (Math.random() - 0.5) * spread;
    direction.normalize();
    const data = { origin: origin.toArray(), direction: direction.toArray(), damage: 32, shotId: `${clientToken}/${++shotSequence}` };
    visuals.muzzle();
    sound('shoot', { aiming: aim > 0.5 });
    if (authority) resolveShot(data, true);
    else {
      const hit = nearestHit(origin, direction);
      pendingShots.set(data.shotId, time);
      while (pendingShots.size > 96) pendingShots.delete(pendingShots.keys().next().value);
      if (hit.enemy) { sound('hit', { headshot: hit.headshot }); emit('hit', { shotId: data.shotId, enemyId: hit.enemy.id, headshot: hit.headshot, confirmed: false, remote: false }); }
      muzzlePosition.set(0, 0.023, -0.79).applyMatrix4(visuals.weapon.matrixWorld);
      visuals.trace(muzzlePosition, hit.point, hit.surface, !!hit.enemy);
    }
    emit('shot', data);
    return true;
  }
  function reload() {
    if (!active() || reloadLeft > 0 || state.ammo >= CLIP || state.reserve <= 0) return false;
    reloadLeft = RELOAD_TIME;
    sound('reload', { duration: RELOAD_TIME });
    return true;
  }
  function updateInteraction() {
    const near = Math.hypot(camera.position.x - supplyPosition.x, camera.position.z - supplyPosition.z) < 2.5;
    state.interaction = active() && near ? (state.reserve >= MAX_RESERVE ? 'RESERVE AMMUNITION FULL' : `E · RESUPPLY / ${RESUPPLY_COST} ESSENCE`) : '';
    return near;
  }
  function interact() {
    if (!active() || !updateInteraction()) return false;
    if (state.reserve >= MAX_RESERVE) { notify('Reserve ammunition is full.'); return false; }
    if (state.score < RESUPPLY_COST) { notify(`Resupply requires ${RESUPPLY_COST} essence.`, 'warning'); return false; }
    state.score -= RESUPPLY_COST;
    state.reserve = MAX_RESERVE;
    sound('buy');
    notify('Ammunition secured. Reserve replenished.', 'success');
    updateInteraction();
    return true;
  }
  function movePlayer(dt, input) {
    const keys = input.keys || new Set();
    yaw -= clamp(finite(input.lookX), -2000, 2000) * 0.0021;
    pitch = clamp(pitch - clamp(finite(input.lookY), -2000, 2000) * 0.0021, -1.43, 1.43);
    const requestedAim = !!input.aiming && reloadLeft <= 0;
    aim += ((requestedAim ? 1 : 0) - aim) * (1 - Math.exp(-dt * 15));
    const x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    const z = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    moving = !!(x || z);
    sprinting = moving && z > 0 && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && state.stamina > 0 && !requestedAim && !input.firing && reloadLeft <= 0;
    // Exhaustion requires a small recovery before sprint can restart.
    if (state.exhausted && state.stamina < 22) sprinting = false;
    else state.exhausted = false;
    state.stamina = clamp(state.stamina + (sprinting ? -25 : 17) * dt, 0, 100);
    if (state.stamina === 0) state.exhausted = true;
    const speed = sprinting ? 6.1 : requestedAim ? 2.05 : 3.65;
    if (moving) {
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      right.crossVectors(forward, up);
      const length = Math.hypot(x, z);
      const dx = (right.x * x + forward.x * z) / length * speed * dt;
      const dz = (right.z * x + forward.z * z) / length * speed * dt;
      const oldX = camera.position.x, oldZ = camera.position.z;
      nav.move(camera.position, dx, dz, 0.3);
      moving = Math.hypot(camera.position.x - oldX, camera.position.z - oldZ) > 0.0001;
      if (moving) {
        stepTime -= dt;
        if (stepTime <= 0) { sound('step', { volume: sprinting ? 0.45 : 0.25 }); stepTime = sprinting ? 0.29 : 0.45; }
      }
    }
    camera.position.y = 1.7 + (moving ? Math.sin(time * (sprinting ? 12 : 8)) * (sprinting ? 0.025 : 0.012) : 0);
    camera.rotation.set(pitch + recoil * 0.009, yaw, moving ? Math.sin(time * 4) * 0.0015 : 0, 'YXZ');
    const fov = baseFov - aim * 15 + (sprinting ? 3 : 0);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (keys.has('KeyR') && !lastKeys.has('KeyR')) reload();
    if (keys.has('KeyE') && !lastKeys.has('KeyE')) interact();
    lastKeys = new Set(keys);
  }
  function updateEnemies(dt) {
    const targets = livingTargets();
    fieldTime -= dt;
    if (fieldTime <= 0) {
      fields = new Map(targets.map(target => [target.id, nav.field(target.x, target.z)]));
      fieldTime = 0.55;
    }
    for (const enemy of enemies.values()) {
      let target = null, distance = Infinity;
      for (const candidate of targets) {
        const d = Math.hypot(enemy.x - candidate.x, enemy.z - candidate.z);
        if (d < distance) { target = candidate; distance = d; }
      }
      enemy.attackCooldown -= dt;
      enemy.attacking = Math.max(0, enemy.attacking - dt);
      enemy.hurtTime = Math.max(0, enemy.hurtTime - dt);
      if (enemy.pendingAttack) {
        const pending = enemy.pendingAttack;
        pending.time -= dt;
        if (pending.time <= 0) {
          enemy.pendingAttack = null;
          let current = null;
          if (pending.targetId === 'local') current = { x: camera.position.x, z: camera.position.z, alive: state.health > 0 };
          else {
            const peer = peers.find(candidate => candidate.id === pending.targetId);
            if (peer) current = { x: peer.position.x, z: peer.position.z, alive: peer.health > 0 };
          }
          if (current && current.alive &&
              Math.hypot(current.x - enemy.x, current.z - enemy.z) < 1.45 * enemy.scale &&
              nav.clearLine(enemy.x, enemy.z, current.x, current.z, 0.1)) {
            if (pending.targetId === 'local') applyDamage(pending.damage, { enemyId: enemy.id, direction: [pending.dx, 0, pending.dz] });
            else emit('peerDamage', { peerId: pending.targetId, damage: pending.damage, enemyId: enemy.id });
          }
        }
      }
      if (target) {
        const dx = target.x - enemy.x, dz = target.z - enemy.z;
        if (distance > 1.08 * enemy.scale) {
          const field = fields.get(target.id);
          const point = field ? nav.waypoint(enemy.x, enemy.z, target, field) : { x: enemy.x, z: enemy.z };
          let vx = point.x - enemy.x, vz = point.z - enemy.z;
          const d = Math.hypot(vx, vz);
          if (d > 0.015) {
            vx /= d; vz /= d;
            // Soft separation preserves individual silhouettes in a crowded wave.
            for (const other of enemies.values()) if (other !== enemy) {
              const sx = enemy.x - other.x, sz = enemy.z - other.z, sd = Math.hypot(sx, sz);
              const radius = 0.68 * Math.max(enemy.scale, other.scale); if (sd > 0.001 && sd < radius) { vx += sx / sd * (radius - sd) * 1.5; vz += sz / sd * (radius - sd) * 1.5; }
            }
            const length = Math.max(1, Math.hypot(vx, vz));
            const speed = enemy.speed * (enemy.hurtTime > 0 ? 0.35 : 1) * (0.88 + Math.sin(time * 4 + enemy.variant) * 0.12);
            const step = Math.min(d, speed * dt);
            nav.move(enemy, vx / length * step, vz / length * step);
            enemy.yaw = Math.atan2(vx, vz);
          }
        } else if (enemy.attackCooldown <= 0 && nav.clearLine(enemy.x, enemy.z, target.x, target.z, 0.1)) {
          enemy.yaw = Math.atan2(dx, dz);
          // A visible windup lands the blow, so contact damage is telegraphed
          // instead of arriving the instant a zombie enters range.
          enemy.attacking = 0.5;
          enemy.attackCooldown = 1.15 + Math.random() * 0.3;
          enemy.pendingAttack = {
            time: 0.3, targetId: target.id, targetX: target.x, targetZ: target.z,
            damage: 12 + Math.min(8, state.wave) + enemy.damageBonus, dx, dz,
          };
        }
      }
      enemy.model.group.position.set(enemy.x, 0, enemy.z);
      enemy.model.group.rotation.y = enemy.yaw;
      visuals.animateZombie(enemy.model, time, enemy.speed, enemy.attacking > 0);
    }
  }
  function updateGuests(dt) {
    const alpha = 1 - Math.exp(-dt * 13);
    for (const enemy of enemies.values()) {
      enemy.x += (enemy.targetX - enemy.x) * alpha;
      enemy.z += (enemy.targetZ - enemy.z) * alpha;
      const angle = Math.atan2(Math.sin(enemy.targetYaw - enemy.yaw), Math.cos(enemy.targetYaw - enemy.yaw));
      enemy.yaw += angle * alpha;
      enemy.model.group.position.set(enemy.x, 0, enemy.z);
      enemy.model.group.rotation.y = enemy.yaw;
      visuals.animateZombie(enemy.model, time, enemy.speed, enemy.attacking > 0);
      enemy.attacking = Math.max(0, enemy.attacking - dt);
    }
  }
  function updateWeapon(dt, lookX) {
    visuals.update(dt, { time, moving, sprinting, aiming: aim, recoil, reloadProgress: reloadLeft > 0 ? 1 - reloadLeft / RELOAD_TIME : -1, pitch, lookX });
  }
  function update(dt, input = {}) {
    if (disposed || !active()) return;
    dt = clamp(finite(dt), 0, 0.1);
    time += dt;
    if (state.health > 0 && time - lastDamageTime > 8) state.health = Math.min(100, state.health + dt * 4);
    fireCooldown = Math.max(0, fireCooldown - dt);
    emptyCooldown = Math.max(0, emptyCooldown - dt);
    recoil *= Math.exp(-dt * 12);
    if (reloadLeft > 0) {
      reloadLeft = Math.max(0, reloadLeft - dt);
      if (reloadLeft === 0) {
        const amount = Math.min(CLIP - state.ammo, state.reserve);
        state.ammo += amount;
        state.reserve -= amount;
      }
    }
    movePlayer(dt, input);
    updateWeapon(dt, finite(input.lookX));
    if (input.firing) shoot();
    if (authority) {
      updateEnemies(dt);
      if (state.phase === 'playing') {
        spawnTimer -= dt;
        if (spawnTimer <= 0) spawnEnemy();
        if (remainingSpawns === 0 && enemies.size === 0) beginIntermission();
      } else if (state.phase === 'intermission') {
        state.phaseTime = Math.max(0, state.phaseTime - dt);
        if (state.phaseTime === 0) beginWave(state.wave + 1);
      }
    } else {
      updateGuests(dt);
      if (state.phase === 'intermission') state.phaseTime = Math.max(0, state.phaseTime - dt);
    }
    for (let i = corpses.length - 1; i >= 0; i--) {
      corpses[i].life += dt;
      visuals.animateZombie(corpses[i].model, time, 0, false, corpses[i].life);
      if (corpses[i].life >= 1) { visuals.removeZombie(corpses[i].model); corpses.splice(i, 1); }
    }
    for (const [id, created] of pendingShots) if (time - created > 15) pendingShots.delete(id);
    updateInteraction();
    state.enemies = enemies.size + remainingSpawns;
  }

  function getState() {
    return {
      ...state, enemies: enemies.size + remainingSpawns, aliveEnemies: enemies.size,
      reloading: reloadLeft > 0, reloadProgress: reloadLeft > 0 ? 1 - reloadLeft / RELOAD_TIME : 0,
      magazineSize: CLIP, maxReserve: MAX_RESERVE, resupplyCost: RESUPPLY_COST,
      position: camera.position.toArray(), yaw, pitch, aiming: aim > 0.5, sprinting,
      supplyPosition: supplyPosition.toArray(), authority,
    };
  }
  function getSnapshot() {
    return {
      version: 1, runId, serial: ++snapshotSerial, time,
      phase: state.phase, phaseTime: state.phaseTime, wave: state.wave, remainingSpawns,
      enemies: [...enemies.values()].map(enemy => ({
        id: enemy.id, x: enemy.x, z: enemy.z, yaw: enemy.yaw, health: enemy.health,
        maxHealth: enemy.maxHealth, speed: enemy.speed, variant: enemy.variant, attacking: enemy.attacking,
        archetype: enemy.archetype, scale: enemy.scale, points: enemy.points, damageBonus: enemy.damageBonus,
      })),
      receipts: receipts.map(receipt => ({ ...receipt })),
    };
  }
  function validEnemy(data) {
    return data && (typeof data.id === 'string' || Number.isFinite(data.id)) && Number.isFinite(data.x) && Number.isFinite(data.z)
      && Math.abs(data.x) <= 25 && Math.abs(data.z) <= 25 && Number.isFinite(data.health) && data.health > 0;
  }
  function applySnapshot(data) {
    if (authority || !data || !Array.isArray(data.enemies) || disposed) return false;
    const incomingRun = String(data.runId || 'legacy');
    const serial = finite(data.serial, lastSnapshotSerial + 1);
    if (snapshotRun === incomingRun && serial <= lastSnapshotSerial) return false;
    if (snapshotRun !== incomingRun) {
      cleanActors();
      snapshotRun = incomingRun;
      lastSnapshotSerial = -1;
    }
    lastSnapshotSerial = serial;
    const previousPhase = state.phase, previousWave = state.wave;
    state.wave = clamp(Math.floor(finite(data.wave, state.wave)), 0, 9999);
    remainingSpawns = clamp(Math.floor(finite(data.remainingSpawns)), 0, 48);
    // Local defeat cannot be overwritten by a healthy host snapshot.
    if (state.health > 0 && ['playing', 'intermission', 'dead'].includes(data.phase)) {
      state.phase = data.phase;
      if (data.phase === 'dead' && previousPhase !== 'dead') {
        visuals.weapon.visible = false;
        sound('death');
        emit('death', { score: state.score, kills: state.kills, wave: state.wave, reason: 'host-defeated' });
      }
    }
    state.phaseTime = Math.max(0, finite(data.phaseTime));
    if (previousWave !== state.wave || previousPhase !== state.phase) {
      if (state.phase === 'intermission' && previousPhase === 'playing') state.score += 100 + state.wave * 25;
      if (state.phase === 'playing') sound('wave', { wave: state.wave });
      emit('wave', { wave: state.wave, phase: state.phase, phaseTime: state.phaseTime });
    }
    const ids = new Set();
    for (const entry of data.enemies.slice(0, MAX_ENEMIES)) {
      if (!validEnemy(entry)) continue;
      const id = String(entry.id);
      ids.add(id);
      let enemy = enemies.get(id);
      if (!enemy) enemy = addEnemy({ ...entry, id, speed: clamp(finite(entry.speed, 1), 0.1, 4), variant: clamp(Math.floor(finite(entry.variant)), 0, 3) });
      enemy.targetX = entry.x;
      enemy.targetZ = entry.z;
      enemy.targetYaw = finite(entry.yaw);
      enemy.health = entry.health;
      enemy.attacking = clamp(finite(entry.attacking), 0, 0.5);
    }
    for (const [id, enemy] of enemies) if (!ids.has(id)) retireEnemy(enemy);
    for (const receipt of (Array.isArray(data.receipts) ? data.receipts.slice(-96) : [])) {
      if (!pendingShots.has(receipt.shotId)) continue;
      pendingShots.delete(receipt.shotId);
      if (receipt.killed) awardKill({ ...receipt, points: finite(receipt.points, receipt.headshot ? 150 : 100) }, true);
    }
    return true;
  }
  function applyRemoteShot(data) {
    if (!authority || !active() || !data || !Array.isArray(data.origin) || !Array.isArray(data.direction)) return null;
    if (data.origin.length !== 3 || data.direction.length !== 3 || ![...data.origin, ...data.direction].every(Number.isFinite)) return null;
    if (Math.abs(data.origin[0]) > 25 || Math.abs(data.origin[2]) > 25 || data.origin[1] < 0.4 || data.origin[1] > 3) return null;
    const length = Math.hypot(...data.direction);
    if (length < 0.9 || length > 1.1) return null;
    if (data.shotId != null && typeof data.shotId !== 'string') return null;
    if (data.shotId && receivedShots.has(data.shotId)) return null;
    const peer = peers.find(candidate => candidate.id === data.playerId);
    if (peer && (peer.health <= 0 || peer.position.distanceTo(positionOf(data.origin)) > 4)) return null;
    if (data.shotId) {
      receivedShots.set(data.shotId, time);
      while (receivedShots.size > 256) receivedShots.delete(receivedShots.keys().next().value);
    }
    const result = resolveShot(data, false);
    if (result.shotId) {
      receipts.push(result);
      if (receipts.length > 96) receipts.shift();
    }
    sound('shoot', { volume: 0.35, position: data.origin, remote: true });
    return result;
  }
  function setPeers(values = []) {
    peers = values.slice(0, 8).filter(peer => peer && peer.id != null && peer.position).map(peer => ({
      id: String(peer.id), position: positionOf(peer.position), health: finite(peer.health, 100),
    })).filter(peer => Math.abs(peer.position.x) <= 25 && Math.abs(peer.position.z) <= 25);
    // Fields refresh on a fixed cadence; incoming network position updates do
    // not invalidate them every frame.
  }
  function setAuthority(value) {
    const next = !!value;
    if (authority === next) return;
    authority = next;
    fields.clear();
    fieldTime = 0;
    lastSnapshotSerial = -1;
    snapshotRun = null;
    if (!authority) { cleanActors(); remainingSpawns = 0; }
  }
  function dispose() {
    if (disposed) return;
    cleanActors();
    visuals.dispose();
    disposed = true;
  }
  reset();
  return { start, update, shoot, reload, interact, getState, getSnapshot, applySnapshot, applyRemoteShot, setAuthority, reset, setPeers, applyDamage, dispose };
}
