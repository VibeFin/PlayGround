// The entire simulation is deterministic and independent of the renderer/DOM.
export const MAP_SIZE = 110;
export const DEFS = Object.freeze({
  worker: { name: 'Peasant', description: 'Gathers gold and lumber. Builds the settlement.', maxHp: 95, radius: 0.65, gold: 60, food: 1, trainTime: 12, damage: 5, range: 0.6, speed: 5.2, attackPeriod: 1.3 },
  footman: { name: 'Footman', description: 'Durable frontline fighter. Best supported by archers.', maxHp: 250, radius: 0.85, gold: 110, food: 2, trainTime: 16, damage: 20, range: 0.8, speed: 5.3, attackPeriod: 1.05 },
  archer: { name: 'Ranger', description: 'Ranged support. Keep behind the frontline.', maxHp: 130, radius: 0.7, gold: 95, lumber: 30, food: 2, trainTime: 14, damage: 18, range: 10, speed: 5.5, attackPeriod: 1.2 },
  hero: { name: 'Dawnwarden', description: 'A resilient champion. Sunburst damages nearby foes and heals allies.', maxHp: 700, radius: 1, food: 3, damage: 36, range: 1, speed: 5.8, attackPeriod: 1.1 },
  hall: { name: 'Town Hall', description: 'Deposit resources and train peasants. Protect it to stay in the fight.', maxHp: 1900, radius: 4, gold: 400, lumber: 200, buildTime: 50 },
  barracks: { name: 'Barracks', description: 'Trains footmen and rangers. Queued troops reserve food.', maxHp: 1050, radius: 3, gold: 180, lumber: 100, buildTime: 24 },
  farm: { name: 'Farm', description: 'Provides 10 additional food capacity.', maxHp: 450, radius: 2, gold: 80, lumber: 45, buildTime: 14 },
  tower: { name: 'Guard Tower', description: 'Ranged defense for your settlement.', maxHp: 700, radius: 1.8, gold: 140, lumber: 90, buildTime: 22, damage: 28, range: 14, attackPeriod: 1.3 },
  stronghold: { name: 'Ashen Stronghold', description: 'Destroy this fortress to win. Defended by raiders and archers.', maxHp: 2000, radius: 4.5, damage: 22, range: 13, attackPeriod: 1.4 },
  goldmine: { name: 'Gold Mine', description: 'Peasants carry gold back to the town hall.', maxHp: 1, radius: 3.3 },
  tree: { name: 'Timber', description: 'Peasants carry lumber back to the town hall.', maxHp: 1, radius: 1.1 },
});

const UNITS = new Set(['worker', 'footman', 'archer', 'hero']);
const BUILDABLE = new Set(['barracks', 'farm', 'tower']);
const PRODUCES = { hall: ['worker'], barracks: ['footman', 'archer'] };
const RESOURCE = { goldmine: 'gold', tree: 'lumber' };
const HALF = MAP_SIZE / 2;
const STEP = 0.05;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const isUnit = e => UNITS.has(e.kind);
const isBuilding = e => !isUnit(e) && e.team !== 'neutral';
const ready = e => e.buildProgress === undefined || e.buildProgress >= 1;
const hostile = (a, b) => a.team !== b.team && a.team !== 'neutral' && b.team !== 'neutral';

export class Game {
  constructor() { this.reset(); }

  reset() {
    this._nextId = 1;
    this._nextRaid = 105;
    this._raid = 0;
    this._weaponLevel = 0;
    this.state = {
      entities: [], gold: 350, lumber: 220, food: 0, foodCap: 20,
      time: 0, status: 'playing', message: 'Build your army, protect the Town Hall, and destroy the Ashen Stronghold.',
      events: ['Your peasants are gathering. The first enemy raid arrives after 90 seconds.'], kills: 0,
    };
    const hall = this._spawn('hall', 'player', -28, 26);
    this._spawn('goldmine', 'neutral', -42, 24, { resource: 12000 });
    for (const [x, z] of [[-37, 39], [-33, 42], [-41, 40], [-28, 43], [-44, 36], [-23, 44], [-38, 46], [-46, 42]]) {
      this._spawn('tree', 'neutral', x, z, { resource: 750 });
    }
    this._spawn('hero', 'player', -21, 19, { spellCooldown: 0 });
    for (const [x, z] of [[-24, 16], [-21, 15], [-18, 16], [-17, 19]]) this._spawn('footman', 'player', x, z);
    const mine = this.state.entities.find(e => e.kind === 'goldmine');
    const trees = this.state.entities.filter(e => e.kind === 'tree');
    for (let i = 0; i < 4; i++) {
      const worker = this._spawn('worker', 'player', -34 + i * 2, 31);
      worker.order = { type: 'gather', targetId: i < 2 ? mine.id : trees[i - 2].id };
    }
    this._spawn('stronghold', 'enemy', 29, -28);
    this._spawn('footman', 'enemy', 23, -22, { guard: true });
    this._spawn('footman', 'enemy', 34, -21, { guard: true });
    this._spawn('archer', 'enemy', 23, -32, { guard: true });
    this._spawn('archer', 'enemy', 36, -30, { guard: true });
    hall.queue = [];
    this._recountFood();
    return this.state;
  }

  _spawn(kind, team, x, z, extras = {}) {
    const def = DEFS[kind];
    const entity = {
      id: this._nextId++, kind, team, x, z, hp: def.maxHp, maxHp: def.maxHp,
      radius: def.radius, facing: team === 'enemy' ? Math.PI : 0,
      attackFlash: 0, order: { type: 'stop' }, ...extras,
    };
    if (kind === 'worker') { entity.carrying = 0; entity.carryType = null; }
    if (PRODUCES[kind] && !entity.queue) entity.queue = [];
    this.state.entities.push(entity);
    return entity;
  }

  _get(id) { return this.state.entities.find(e => e.id === id && e.hp > 0); }
  _fail(message) { this.state.message = message; return false; }
  _event(message) {
    this.state.message = message;
    this.state.events.push(message);
    if (this.state.events.length > 8) this.state.events.shift();
  }
  _playing() { return this.state.status === 'playing'; }

  canAfford(kind) {
    const def = DEFS[kind];
    if (!Object.hasOwn(DEFS, kind) || !this._playing()) return false;
    return this.state.gold >= (def.gold || 0) && this.state.lumber >= (def.lumber || 0)
      && (!def.food || this.state.food + def.food <= this.state.foodCap);
  }

  _pay(kind) {
    const def = DEFS[kind];
    if (this.state.gold < (def.gold || 0) || this.state.lumber < (def.lumber || 0)) return this._fail('Not enough gold or lumber.');
    if (def.food && this.state.food + def.food > this.state.foodCap) return this._fail('Food limit reached. Build a farm.');
    this.state.gold -= def.gold || 0;
    this.state.lumber -= def.lumber || 0;
    return true;
  }

  command(ids, order) {
    if (!this._playing()) return this._fail('The battle is over. Restart to play again.');
    if (!Array.isArray(ids) || !order || !['move', 'attack', 'gather', 'stop', 'attackMove'].includes(order.type)) return this._fail('Choose a valid command.');
    const units = [...new Set(ids)].map(id => this._get(id)).filter(e => e && e.team === 'player' && isUnit(e));
    if (!units.length) return this._fail('Select a controllable unit.');
    const target = this._get(order.targetId);
    if (order.type === 'attack' && (!target || target.team !== 'enemy')) return this._fail('Choose an enemy to attack.');
    if (order.type === 'gather' && (!target || !RESOURCE[target.kind] || target.resource <= 0)) return this._fail('Choose a gold mine or a tree with resources.');
    if (['move', 'attackMove'].includes(order.type) && (!Number.isFinite(order.x) || !Number.isFinite(order.z))) return this._fail('Choose a destination on the battlefield.');
    const eligible = order.type === 'gather' ? units.filter(e => e.kind === 'worker') : units;
    if (!eligible.length) return this._fail('Only peasants can gather resources.');
    const cols = Math.ceil(Math.sqrt(eligible.length));
    eligible.forEach((unit, index) => {
      this._releaseBuilder(unit);
      const next = { type: order.type };
      if (target && ['attack', 'gather'].includes(order.type)) next.targetId = target.id;
      if (['move', 'attackMove'].includes(order.type)) {
        const spacing = 2.1;
        const point = this._freePoint({ x: clamp(order.x + (index % cols - (cols - 1) / 2) * spacing, -HALF + 1, HALF - 1),
          z: clamp(order.z + (Math.floor(index / cols) - (Math.ceil(eligible.length / cols) - 1) / 2) * spacing, -HALF + 1, HALF - 1) }, unit.radius);
        next.x = point.x; next.z = point.z;
      }
      unit.order = next;
      unit._path = null; unit._targetId = null;
    });
    this.state.message = { move: 'Moving.', attack: 'Attack the enemy!', attackMove: 'Advance and engage.', gather: 'Peasants gathering.', stop: 'Holding position.' }[order.type];
    return true;
  }

  build(kind, x, z, workerIds) {
    if (!this._playing()) return this._fail('The battle is over. Restart to play again.');
    if (!BUILDABLE.has(kind) || !Number.isFinite(x) || !Number.isFinite(z)) return this._fail('Choose a valid building and placement.');
    const workers = Array.isArray(workerIds) ? [...new Set(workerIds)].map(id => this._get(id)).filter(e => e?.team === 'player' && e.kind === 'worker') : [];
    if (!workers.length) return this._fail('Select a peasant to build.');
    const radius = DEFS[kind].radius;
    if (Math.abs(x) + radius > HALF - 1 || Math.abs(z) + radius > HALF - 1) return this._fail('Build inside the battlefield.');
    if (this.state.entities.some(e => e.hp > 0 && !isUnit(e) && distance(e, { x, z }) < e.radius + radius + 1)) return this._fail('That site is blocked. Leave space around buildings and resources.');
    if (!this._pay(kind)) return false;
    const building = this._spawn(kind, 'player', x, z, { buildProgress: 0, hp: DEFS[kind].maxHp * 0.15, builders: workers.map(e => e.id) });
    for (const unit of this.state.entities.filter(isUnit)) unit._path = null;
    this._assignBuilders(building, workers);
    this._event(`Construction started: ${DEFS[kind].name}.`);
    return true;
  }

  assistBuild(buildingId, workerIds) {
    if (!this._playing()) return this._fail('The battle is over. Restart to play again.');
    const building = this._get(buildingId);
    if (!building || building.team !== 'player' || !isBuilding(building) || ready(building)) return this._fail('Choose your own unfinished building to assist.');
    const workers = Array.isArray(workerIds) ? [...new Set(workerIds)].map(id => this._get(id)).filter(e => e?.team === 'player' && e.kind === 'worker') : [];
    if (!workers.length) return this._fail('Select a peasant to assist construction.');
    this._assignBuilders(building, workers);
    this.state.message = `Peasants assisting construction: ${DEFS[building.kind].name}.`;
    return true;
  }

  _assignBuilders(building, workers) {
    const builders = new Set(building.builders || []);
    for (const worker of workers) {
      const resume = worker.order.type === 'build' ? worker._resumeOrder : worker.order;
      this._releaseBuilder(worker);
      worker._resumeOrder = resume ? { ...resume } : { type: 'stop' };
      worker.order = { type: 'build', targetId: building.id };
      worker._path = null; worker._pathGoal = null; worker._targetId = null;
      builders.add(worker.id);
    }
    building.builders = [...builders];
  }

  _releaseBuilder(worker) {
    if (worker.order?.type === 'build') {
      const site = this._get(worker.order.targetId);
      if (site?.builders) site.builders = site.builders.filter(id => id !== worker.id);
    }
    worker._resumeOrder = null;
  }

  train(buildingId, kind) {
    if (!this._playing()) return this._fail('The battle is over. Restart to play again.');
    const building = this._get(buildingId);
    if (!building || building.team !== 'player' || !ready(building) || !PRODUCES[building.kind]?.includes(kind)) return this._fail('Choose a completed building that can train this unit.');
    if (building.queue.length >= 5) return this._fail('Training queue is full (5 units).');
    if (!this._pay(kind)) return false;
    building.queue.push({ kind, progress: 0, remaining: DEFS[kind].trainTime });
    this._recountFood();
    this.state.message = `${DEFS[kind].name} queued.`;
    return true;
  }

  upgrade() {
    if (!this._playing()) return this._fail('The battle is over. Restart to play again.');
    if (this._weaponLevel) return this._fail('Steel weapons already researched.');
    if (!this.state.entities.some(e => e.team === 'player' && e.kind === 'barracks' && ready(e))) return this._fail('Complete a barracks first.');
    if (this.state.gold < 160 || this.state.lumber < 100) return this._fail('Steel weapons cost 160 gold and 100 lumber.');
    this.state.gold -= 160; this.state.lumber -= 100; this._weaponLevel = 1;
    this._event('Steel weapons researched: army damage increased by 25%.');
    return true;
  }

  cast(heroId, x, z) {
    if (!this._playing()) return this._fail('The battle is over. Restart to play again.');
    const hero = this._get(heroId);
    if (!hero || hero.kind !== 'hero' || hero.team !== 'player') return this._fail('Select the Dawnwarden to cast Sunburst.');
    if (hero.spellCooldown > 0) return this._fail(`Sunburst ready in ${Math.ceil(hero.spellCooldown)} seconds.`);
    x ??= hero.x; z ??= hero.z;
    if (!Number.isFinite(x) || !Number.isFinite(z) || distance(hero, { x, z }) > 12) return this._fail('Cast Sunburst within 12 paces of the hero.');
    hero.spellCooldown = 22;
    hero.spellFlash = 0.8;
    hero.spellX = x; hero.spellZ = z;
    for (const entity of this.state.entities) {
      if (entity.hp <= 0 || distance(entity, { x, z }) > 9 + entity.radius) continue;
      if (entity.team === 'enemy') this._damage(entity, isBuilding(entity) ? 80 : 110, hero);
      else if (entity.team === 'player' && isUnit(entity)) entity.hp = Math.min(entity.maxHp, entity.hp + 95);
    }
    this._event('Sunburst! Nearby enemies scorched and allies healed.');
    this._cleanup();
    return true;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || !this._playing()) return;
    // Substeps make browser frames and headless time advances use the same rules.
    while (dt > 1e-8 && this._playing()) {
      const step = Math.min(dt, STEP);
      this._step(step);
      dt -= step;
    }
  }

  _step(dt) {
    this.state.time += dt;
    if (this.state.time + 1e-8 >= this._nextRaid) this._launchRaid();
    const entities = [...this.state.entities];
    for (const e of entities) {
      if (e.hp <= 0) continue;
      e.attackFlash = Math.max(0, e.attackFlash - dt);
      e._cooldown = Math.max(0, (e._cooldown || 0) - dt);
      if (e.kind === 'hero') {
        e.spellCooldown = Math.max(0, e.spellCooldown - dt);
        e.spellFlash = Math.max(0, (e.spellFlash || 0) - dt);
      }
      if (isUnit(e)) this._updateUnit(e, dt);
      else if (e.team !== 'neutral' && ready(e)) {
        this._production(e, dt);
        if (DEFS[e.kind].damage) this._fight(e, this._nearestEnemy(e, DEFS[e.kind].range), dt, false);
      }
    }
    this._construction(dt);
    this._separate();
    this._cleanup();
  }

  _production(building, dt) {
    if (!building.queue?.length) return;
    const item = building.queue[0];
    item.remaining = Math.max(0, item.remaining - dt);
    item.progress = 1 - item.remaining / DEFS[item.kind].trainTime;
    if (item.remaining > 1e-8) return;
    const point = this._freePoint({ x: building.x + building.radius + 2, z: building.z + 1 }, DEFS[item.kind].radius);
    building.queue.shift();
    const unit = this._spawn(item.kind, building.team, point.x, point.z);
    if (unit.kind === 'worker') {
      const mine = this.state.entities.find(e => e.kind === 'goldmine' && e.resource > 0);
      if (mine) unit.order = { type: 'gather', targetId: mine.id };
    }
    this._event(`${DEFS[item.kind].name} ready.`);
  }

  _construction(dt) {
    for (const site of this.state.entities) {
      if (site.hp <= 0 || site.buildProgress === undefined || ready(site)) continue;
      const active = site.builders.map(id => this._get(id)).filter(worker => worker?.order.type === 'build'
        && worker.order.targetId === site.id && distance(worker, site) <= worker.radius + site.radius + 1.1);
      if (!active.length) continue;
      const progress = Math.min(1 - site.buildProgress, dt * (1 + (active.length - 1) * 0.55) / DEFS[site.kind].buildTime);
      site.buildProgress = Math.min(1, site.buildProgress + progress);
      site.hp = Math.min(site.maxHp, site.hp + progress * site.maxHp * 0.85);
      if (site.buildProgress >= 1 - 1e-8) {
        site.buildProgress = 1;
        for (const id of site.builders) {
          const worker = this._get(id);
          if (worker?.order.type === 'build' && worker.order.targetId === site.id) {
            worker.order = worker._resumeOrder || { type: 'stop' };
            worker._resumeOrder = null; worker._path = null;
          }
        }
        site.builders = [];
        this._event(`${DEFS[site.kind].name} complete.`);
      }
    }
  }

  _updateUnit(unit, dt) {
    const order = unit.order;
    if (order.type === 'gather') { this._gather(unit, dt); return; }
    if (order.type === 'build') {
      const target = this._get(order.targetId);
      if (!target || ready(target)) {
        unit.order = unit._resumeOrder || { type: 'stop' };
        unit._resumeOrder = null; unit._path = null;
        return;
      }
      this._approach(unit, target, 0.8, dt);
      return;
    }
    if (order.type === 'move') {
      if (this._walk(unit, order, dt)) unit.order = { type: 'stop' };
      return;
    }
    let target;
    if (order.type === 'attack') {
      target = this._get(order.targetId);
      if (!target || !hostile(unit, target)) { unit.order = { type: 'stop' }; unit._targetId = null; }
    } else {
      target = this._get(unit._targetId);
      const leash = unit.guard ? 18 : 20;
      if (!target || !hostile(unit, target) || distance(unit, target) > leash + target.radius) target = null;
      target ||= this._nearestEnemy(unit, unit.guard ? 12 : 11);
    }
    if (target) {
      unit._targetId = target.id;
      this._fight(unit, target, dt, true);
    } else if (order.type === 'attackMove') {
      if (this._walk(unit, order, dt)) unit.order = { type: 'stop' };
    } else if (unit.team === 'player' && unit.kind !== 'worker') {
      const hall = this.state.entities.find(e => e.team === 'player' && e.kind === 'hall' && ready(e));
      if (hall && distance(unit, hall) < 15) unit.hp = Math.min(unit.maxHp, unit.hp + dt * (unit.kind === 'hero' ? 5 : 2.5));
    }
  }

  _nearestEnemy(unit, reach) {
    let best = null, score = Infinity;
    for (const e of this.state.entities) {
      if (e.hp <= 0 || !hostile(unit, e)) continue;
      const gap = distance(unit, e) - unit.radius - e.radius;
      // Prefer nearby troops to buildings, preventing raiders walking past defenders.
      const value = gap + (isBuilding(e) ? 3 : 0);
      if (gap <= reach && value < score) { best = e; score = value; }
    }
    return best;
  }

  _fight(unit, target, dt, mobile) {
    if (!target || target.hp <= 0) return;
    const def = DEFS[unit.kind];
    unit.facing = Math.atan2(target.x - unit.x, target.z - unit.z);
    if (distance(unit, target) > unit.radius + target.radius + def.range + 0.15) {
      if (mobile) this._approach(unit, target, def.range * 0.85, dt);
      return;
    }
    if (unit._cooldown > 1e-8) return;
    unit._cooldown = def.attackPeriod;
    unit.attackFlash = 0.25;
    unit.attackTargetId = target.id;
    this._damage(target, def.damage * (unit.team === 'player' && isUnit(unit) ? 1 + this._weaponLevel * 0.25 : 1), unit);
  }

  _damage(target, amount, source) {
    if (target.hp <= 0) return;
    target.hp -= amount;
    if (target.hp <= 0 && source.team === 'player' && target.team === 'enemy') {
      this.state.kills++;
      if (isUnit(target)) this.state.gold += 12;
    }
    // Workers keep their economic orders; idle combat units already retaliate.
  }

  _gather(worker, dt) {
    let target = this._get(worker.order.targetId);
    if (worker.carrying > 0 && (worker._deposit || !target || target.resource <= 0 || worker.carryType !== RESOURCE[target.kind])) {
      const halls = this.state.entities.filter(e => e.kind === 'hall' && e.team === worker.team && e.hp > 0 && ready(e));
      const hall = halls.sort((a, b) => distance(worker, a) - distance(worker, b))[0];
      if (!hall) return;
      if (this._approach(worker, hall, 0.7, dt)) {
        this.state[worker.carryType] += worker.carrying;
        worker.carrying = 0; worker.carryType = null; worker._deposit = false;
      }
      return;
    }
    if (!target || target.resource <= 0) {
      const kind = worker._resourceKind || target?.kind;
      target = this.state.entities.filter(e => e.kind === kind && e.resource > 0).sort((a, b) => distance(worker, a) - distance(worker, b))[0];
      if (!target) { worker.order = { type: 'stop' }; return; }
      worker.order.targetId = target.id;
    }
    worker._resourceKind = target.kind;
    if (!this._approach(worker, target, 0.6, dt)) return;
    const amount = Math.min(12 - worker.carrying, target.resource, dt * (target.kind === 'goldmine' ? 4 : 3.5));
    target.resource = Math.max(0, target.resource - amount);
    worker.carryType = RESOURCE[target.kind];
    worker.carrying += amount;
    if (worker.carrying >= 12 - 1e-8 || target.resource <= 1e-8) worker._deposit = true;
  }

  _approach(unit, target, reach, dt) {
    const radius = unit.radius + target.radius + reach;
    const d = distance(unit, target);
    if (d <= radius + 0.25) return true;
    const point = { x: target.x + (unit.x - target.x) / d * radius, z: target.z + (unit.z - target.z) / d * radius };
    this._walk(unit, point, dt);
    return distance(unit, target) <= radius + 0.25;
  }

  _obstacles() {
    return this.state.entities.filter(e => e.hp > 0 && (isBuilding(e) || e.kind === 'goldmine'));
  }

  _freePoint(point, radius) {
    const result = { ...point };
    for (let pass = 0; pass < 8; pass++) {
      for (const e of this._obstacles()) {
        const d = distance(result, e), min = e.radius + radius + 0.25;
        if (d < min) {
          const dx = d > 0.001 ? (result.x - e.x) / d : 1;
          const dz = d > 0.001 ? (result.z - e.z) / d : 0;
          result.x = e.x + dx * min; result.z = e.z + dz * min;
        }
      }
      result.x = clamp(result.x, -HALF + radius, HALF - radius);
      result.z = clamp(result.z, -HALF + radius, HALF - radius);
    }
    return result;
  }

  _clearSegment(a, b, radius) {
    const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
    for (const obstacle of this._obstacles()) {
      const t = length2 ? clamp(((obstacle.x - a.x) * dx + (obstacle.z - a.z) * dz) / length2, 0, 1) : 0;
      if (Math.hypot(a.x + dx * t - obstacle.x, a.z + dz * t - obstacle.z) < obstacle.radius + radius + 0.1) return false;
    }
    return true;
  }

  _walk(unit, goal, dt) {
    if (distance(unit, goal) < 0.12) return true;
    if (!unit._path || !unit._pathGoal || distance(unit._pathGoal, goal) > 2) {
      const end = this._freePoint(goal, unit.radius);
      unit._path = this._route(unit, end, unit.radius);
      unit._pathGoal = { ...goal };
    } else if (unit._path.length) {
      unit._path[unit._path.length - 1] = this._freePoint(goal, unit.radius);
    }
    if (!unit._path.length) { unit._path = null; return false; }
    while (unit._path.length > 1 && this._clearSegment(unit, unit._path[1], unit.radius)) unit._path.shift();
    const waypoint = unit._path[0];
    const d = distance(unit, waypoint);
    if (d < 0.12) { unit._path.shift(); return distance(unit, goal) < 0.15; }
    const step = Math.min(d, DEFS[unit.kind].speed * dt);
    unit.facing = Math.atan2(waypoint.x - unit.x, waypoint.z - unit.z);
    unit.x += (waypoint.x - unit.x) / d * step;
    unit.z += (waypoint.z - unit.z) / d * step;
    return distance(unit, goal) < 0.12;
  }

  // Small deterministic A* grid, only used when a direct path hits a building.
  // Troops are handled separately so dense formations do not invalidate routes.
  _route(start, end, radius) {
    if (this._clearSegment(start, end, radius)) return [end];
    const cell = 2.5, count = Math.floor(MAP_SIZE / cell) + 1;
    const coord = n => clamp(Math.round((n + HALF) / cell), 0, count - 1);
    const key = (x, z) => z * count + x;
    const point = k => ({ x: (k % count) * cell - HALF, z: Math.floor(k / count) * cell - HALF });
    const startKey = key(coord(start.x), coord(start.z));
    const open = [{ key: startKey, g: 0, f: distance(start, end) }];
    const costs = new Map([[startKey, 0]]), parents = new Map(), closed = new Set();
    let finish = null;
    while (open.length) {
      open.sort((a, b) => a.f - b.f || a.key - b.key);
      const current = open.shift();
      if (closed.has(current.key)) continue;
      closed.add(current.key);
      const pos = current.key === startKey ? start : point(current.key);
      if (distance(pos, end) < cell * 2 && this._clearSegment(pos, end, radius)) { finish = current.key; break; }
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const x = current.key % count + dx, z = Math.floor(current.key / count) + dz;
        if (x < 1 || z < 1 || x >= count - 1 || z >= count - 1) continue;
        const next = key(x, z), nextPoint = point(next);
        if (closed.has(next) || !this._clearSegment(pos, nextPoint, radius)) continue;
        const g = current.g + distance(pos, nextPoint);
        if (g >= (costs.get(next) ?? Infinity)) continue;
        costs.set(next, g); parents.set(next, current.key);
        open.push({ key: next, g, f: g + distance(nextPoint, end) });
      }
    }
    if (finish === null) return [];
    const route = [end];
    while (finish !== startKey) { route.unshift(point(finish)); finish = parents.get(finish); }
    return route;
  }

  _separate() {
    const units = this.state.entities.filter(e => e.hp > 0 && isUnit(e));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
        const a = units[i], b = units[j];
        const d = distance(a, b), min = a.radius + b.radius + 0.08;
        if (d >= min) continue;
        const angle = (a.id * 2.399 + b.id) % (Math.PI * 2);
        const dx = d > 0.001 ? (b.x - a.x) / d : Math.cos(angle);
        const dz = d > 0.001 ? (b.z - a.z) / d : Math.sin(angle);
        const shift = (min - d) * 0.5;
        a.x -= dx * shift; a.z -= dz * shift;
        b.x += dx * shift; b.z += dz * shift;
      }
      for (const unit of units) {
        const point = this._freePoint(unit, unit.radius);
        unit.x = point.x; unit.z = point.z;
      }
    }
  }

  _launchRaid() {
    this._raid++;
    this._nextRaid += Math.max(38, 65 - this._raid * 4);
    const size = Math.min(10, 2 + this._raid);
    const hall = this.state.entities.find(e => e.kind === 'hall' && e.team === 'player' && e.hp > 0);
    if (!hall) return;
    for (let i = 0; i < size; i++) {
      const kind = this._raid >= 2 && i % 3 === 2 ? 'archer' : 'footman';
      const unit = this._spawn(kind, 'enemy', 28 + (i % 4 - 1.5) * 2.2, -17 + Math.floor(i / 4) * 2.2);
      unit.raid = this._raid;
      const strength = 1 + Math.min(0.65, (this._raid - 1) * 0.08);
      unit.hp *= strength; unit.maxHp = unit.hp;
      unit.order = { type: 'attackMove', x: hall.x, z: hall.z };
    }
    this._event(`Enemy raid ${this._raid}: ${size} raiders march on your Town Hall!`);
  }

  _recountFood() {
    this.state.food = this.state.entities.filter(e => e.team === 'player' && e.hp > 0).reduce((sum, e) => sum
      + (DEFS[e.kind].food || 0) + (e.queue || []).reduce((n, item) => n + (DEFS[item.kind].food || 0), 0), 0);
    this.state.foodCap = this.state.entities.filter(e => e.team === 'player' && e.hp > 0 && ready(e)).reduce((sum, e) => sum
      + (e.kind === 'hall' ? 20 : e.kind === 'farm' ? 10 : 0), 0);
  }

  _cleanup() {
    const dead = this.state.entities.filter(e => e.hp <= 0);
    const lostHall = dead.some(e => e.team === 'player' && e.kind === 'hall');
    const lostStronghold = dead.some(e => e.kind === 'stronghold');
    for (const e of dead) if (e.team === 'player') this._event(`${DEFS[e.kind].name} lost.`);
    this.state.entities = this.state.entities.filter(e => e.hp > 0 && !(RESOURCE[e.kind] && e.resource <= 1e-8));
    this._recountFood();
    // Losing the settlement takes precedence if both objectives fall together.
    if (lostHall || !this.state.entities.some(e => e.kind === 'hall' && e.team === 'player')) {
      this.state.status = 'defeat'; this._event('Defeat — your Town Hall has fallen. Restart and rally a new army.');
    } else if (lostStronghold || !this.state.entities.some(e => e.kind === 'stronghold')) {
      this.state.status = 'victory'; this._event('Victory! The Ashen Stronghold is destroyed. Your settlement is safe.');
    }
  }
}
