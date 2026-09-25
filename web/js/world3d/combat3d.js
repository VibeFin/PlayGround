// Presents the engine's turn-based combat in 3D. The engine has already resolved every turn by the
// time a response arrives; this plays its structured event feed back in order, then reconciles
// every unit with the authoritative snapshot so the picture can never drift from the rules.
import * as THREE from "three";
import { buildEnemy } from "./enemies3d.js";
import { planAct, elementColor } from "./fx.js";
import { disposeModel, tintModel } from "./characters.js";
import { play } from "./audio.js";

const IMPACT = new Set(["damage", "miss", "heal", "barrier", "status_on", "status_off", "death", "convert", "interrupt", "survive", "phase", "summon", "misdirect"]);
const MISS_TEXT = { dodge: "Dodged", wide: "Miss", mirror: "Hit an illusion", immune: "Immune", unharmed: "Unharmed", resist: "Resisted" };
const ELEMENT_SFX = { fire: "fire", frost: "frost", lightning: "lightning", arcane: "arcane", poison: "poison", shadow: "shadow" };

const pretty = (id) => String(id || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function beatsFrom(events) {
  const beats = [];
  let cur = null;
  for (const e of events) {
    if (IMPACT.has(e.type)) {
      if (!cur) { cur = { type: "misc", impacts: [] }; beats.push(cur); }
      cur.impacts.push(e);
      continue;
    }
    cur = { type: e.type, e, impacts: [] };
    beats.push(cur);
  }
  return beats;
}

export class CombatPresenter {
  constructor(world) {
    this.w = world;
    this.recs = new Map();
    this.queue = [];
    this.playing = false;
    this.lastSeq = 0;
    this.active = false;
    this.tweens = [];
    this.cb = null;
    this.current = null;
    this.intro = null;
    this.speed = 1;
  }

  get busy() { return this.active && (this.playing || this.queue.length > 0 || !!this.intro); }

  shown(uid) { const r = this.recs.get(uid); return r ? { hp: r.hp, barrier: r.barrier, dead: r.dead } : null; }

  begin(cb, room, playerModel, playerPos) {
    this.active = true;
    this.room = room;
    this.cb = cb;
    const a = room.arena;
    this.center = new THREE.Vector3(a.x, 0, a.z);
    this.f = new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw));
    this.r = new THREE.Vector3(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
    const pending = cb.round <= 1 ? cb.feed : [];
    this.lastSeq = cb.round <= 1 ? 0 : cb.feed_seq;
    const summoned = new Set(pending.filter((e) => e.type === "summon").map((e) => e.target));
    const before = initialValues(pending);
    for (const u of cb.units) {
      if (summoned.has(u.uid)) continue;
      const rec = this.makeRec(u, u.is_player ? playerModel : null);
      const b = before.get(u.uid);
      if (b) { rec.hp = b.hp ?? rec.hp; rec.barrier = b.barrier ?? rec.barrier; rec.dead = false; rec.statuses = []; }
      if (!b && cb.round <= 1) rec.statuses = [];
    }
    this.layout();
    // Intro: the player steps to their mark while enemies emerge.
    const p = this.recs.get(cb.units.find((u) => u.is_player)?.uid);
    const jobs = [];
    if (p) {
      p.model.root.position.set(playerPos.x, 0, playerPos.z);
      jobs.push(this.moveTo(p, p.slot, 0.7, true));
    }
    let i = 0;
    for (const rec of this.recs.values()) {
      if (rec.isPlayer) continue;
      jobs.push(this.emerge(rec, 0.15 + i++ * 0.12));
    }
    this.w.cam.setMode("tactical", { yaw: a.yaw + Math.PI + 0.22, dist: 13.5, pitch: 0.56 });
    this.w.cam.goal.copy(this.center).addScaledVector(this.f, 0.1).setY(0.6);
    this.intro = Promise.all(jobs).then(() => { this.intro = null; });
    this.enqueue(pending.filter((e) => e.seq > this.lastSeq));
    for (const rec of this.recs.values()) this.renderLabel(rec);
  }

  makeRec(u, model = null) {
    const isPlayer = !!u.is_player;
    if (!model) model = buildEnemy(u);
    if (!isPlayer) this.w.scene.add(model.root);
    const el = document.createElement("div");
    el.className = "w3d-unit " + (u.side === "enemy" ? "enemy" : "ally") + (u.is_boss ? " boss" : "");
    const label = this.w.labels.add(el, model.root, { offsetY: model.height + 0.3, maxDist: 60, minScale: 0.75 });
    el.addEventListener("click", (ev) => { ev.stopPropagation(); this.w.onUnitClick(u.uid); });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), new THREE.MeshBasicMaterial({ color: "#ffd36a", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    ring.scale.setScalar(Math.max(0.6, model.radius / model.root.scale.x * 1.4));
    model.root.add(ring);
    const rec = { uid: u.uid, u, model, el, label, ring, isPlayer, side: u.side, hp: u.hp, maxHp: u.max_hp, barrier: u.barrier || 0,
      statuses: (u.statuses || []).map((s) => ({ ...s })), dead: !u.alive, moving: 0 };
    this.recs.set(u.uid, rec);
    if (rec.dead && !isPlayer) { model.root.visible = false; label.setHidden(true); }
    return rec;
  }

  layout() {
    const enemies = [...this.recs.values()].filter((r) => r.side === "enemy");
    const allies = [...this.recs.values()].filter((r) => r.side !== "enemy" && !r.isPlayer);
    const place = (list, depth, spacing) => list.forEach((rec, i) => {
      const off = (i - (list.length - 1) / 2) * spacing;
      const p = this.center.clone().addScaledVector(this.f, depth).addScaledVector(this.r, off);
      rec.slot = { x: p.x, z: p.z, yaw: depth > 0 ? Math.atan2(-this.f.x, -this.f.z) : Math.atan2(this.f.x, this.f.z) };
    });
    const front = enemies.filter((r) => r.u.row !== "back"), back = enemies.filter((r) => r.u.row === "back");
    const sp = (l) => Math.max(2.1, ...l.map((r) => r.model.radius * 2.4));
    place(front, 2.6, sp(front));
    place(back, 5.6, sp(back));
    const player = [...this.recs.values()].find((r) => r.isPlayer);
    if (player) place([player], -3.6, 2);
    allies.forEach((rec, i) => {
      const side = i % 2 ? 1 : -1, k = Math.floor(i / 2) + 1;
      const p = this.center.clone().addScaledVector(this.f, -3.0).addScaledVector(this.r, side * 2.2 * k);
      rec.slot = { x: p.x, z: p.z, yaw: Math.atan2(this.f.x, this.f.z) };
    });
    for (const rec of this.recs.values()) {
      if (!rec.isPlayer && rec.slot && !rec.placed) {
        rec.model.root.position.set(rec.slot.x, 0, rec.slot.z);
        rec.model.root.rotation.y = rec.slot.yaw;
        rec.placed = true;
      }
    }
  }

  emerge(rec, delay) {
    const root = rec.model.root;
    const s = root.scale.x;
    root.scale.setScalar(0.001);
    return this.sleep(delay).then(() => {
      this.w.fx.burst(root.position.clone().setY(0.3), { color: "#8a7a6a", count: 18, speed: 2.5, gravity: 4, size: 0.35 });
      play("roar");
      return this.tween(0.45, (k) => root.scale.setScalar(s * Math.max(0.001, 1 - Math.pow(1 - k, 3))));
    });
  }

  sync(cb) {
    this.cb = cb;
    const fresh = (cb.feed || []).filter((e) => e.seq > this.lastSeq);
    this.enqueue(fresh);
  }

  enqueue(events) {
    if (!events.length) { if (!this.busy) this.reconcile(); return; }
    this.lastSeq = Math.max(this.lastSeq, events[events.length - 1].seq);
    this.queue.push(...beatsFrom(events));
    if (!this.playing) this.run();
  }

  async run() {
    this.playing = true;
    this.w.requestHud();
    try {
      if (this.intro) await this.intro;
      while (this.queue.length && this.active) {
        const anim = this.w.settings.anim !== false;
        this.speed = !anim ? 6 : this.queue.length > 10 ? 2.2 : this.queue.length > 5 ? 1.5 : 1;
        this.w.fx.speed = this.speed;
        const beat = this.queue.shift();
        try { await this.playBeat(beat); } catch (err) { console.error("combat beat failed", beat, err); }
      }
    } finally {
      this.playing = false;
      if (this.active) { this.reconcile(); this.w.requestHud(true); }
    }
  }

  sleep(s) { return new Promise((r) => setTimeout(r, (s * 1000) / this.speed)); }

  tween(dur, step) {
    return new Promise((resolve) => this.tweens.push({ t: 0, dur: dur / this.speed, step, resolve }));
  }

  moveTo(rec, to, dur, face = true) {
    const root = rec.model.root;
    const from = root.position.clone();
    const dx = to.x - from.x, dz = to.z - from.z;
    if (face && Math.hypot(dx, dz) > 0.1) root.rotation.y = Math.atan2(dx, dz);
    rec.moving = Math.hypot(dx, dz) / Math.max(0.05, dur);
    return this.tween(dur, (k) => {
      const e = k * k * (3 - 2 * k);
      root.position.set(from.x + dx * e, 0, from.z + dz * e);
    }).then(() => { rec.moving = 0; if (to.yaw !== undefined) root.rotation.y = to.yaw; });
  }

  face(rec, target) {
    if (!target || target === rec) return;
    const a = rec.model.root.position, b = target.model.root.position;
    rec.model.root.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  }

  chest(rec) { const p = rec.model.root.position.clone(); p.y += rec.model.height * 0.6; return p; }

  tip(rec) {
    const t = rec.model.tip;
    const p = new THREE.Vector3();
    if (t) t.getWorldPosition(p); else p.copy(this.chest(rec));
    return p;
  }

  async playBeat(beat) {
    const e = beat.e;
    const R = (uid) => this.recs.get(uid);
    switch (beat.type) {
      case "round":
        this.w.banner(`Round ${e.n}`, "round");
        await this.sleep(0.35);
        break;
      case "turn": {
        this.current = e.actor;
        await this.sleep(0.1);
        for (const ev of beat.impacts) { this.impact(ev); await this.sleep(0.3); }
        break;
      }
      case "act": await this.playAct(beat); break;
      case "defend": {
        const a = R(e.actor); if (!a) break;
        a.model.anim.play("defend", this.speed);
        this.w.fx.ring(a.model.root.position, { color: "#ffd36a", radius: 1.6, dur: 0.6 });
        this.w.labels.float(this.chest(a), "Defend", "info");
        play("block");
        await this.sleep(0.6);
        for (const ev of beat.impacts) this.impact(ev);
        break;
      }
      case "item": {
        const a = R(e.actor); if (!a) break;
        this.w.labels.float(this.chest(a), e.name, "ability");
        await a.model.anim.play("item", this.speed).catch(() => {});
        for (const ev of beat.impacts) { this.impact(ev, { big: true }); await this.sleep(0.15); }
        await this.sleep(0.2);
        break;
      }
      case "charge": {
        const a = R(e.actor); if (!a) break;
        if (!a.statuses.find((s) => s.id === "charging")) a.statuses.push({ id: "charging", kind: "special", charging: e.name });
        this.w.fx.setStatuses(a.model, a.statuses);
        this.w.labels.float(this.chest(a), `Charging ${e.name}!`, "warn");
        a.model.anim.play("cast", this.speed * 0.6);
        play("roar");
        this.renderLabel(a);
        await this.sleep(0.8);
        break;
      }
      case "skip": {
        const a = R(e.actor); if (!a) break;
        this.w.labels.float(this.chest(a), `${pretty(e.status)} — turn lost`, "status");
        await this.sleep(0.55);
        for (const ev of beat.impacts) { this.impact(ev); await this.sleep(0.2); }
        break;
      }
      case "flee": {
        const a = R(e.actor); if (!a) break;
        if (e.ok) {
          const back = a.model.root.position.clone().addScaledVector(this.f, -5);
          await this.moveTo(a, { x: back.x, z: back.z }, 0.8);
        } else {
          this.w.labels.float(this.chest(a), "Couldn't escape!", "warn");
          a.model.anim.play("hit", this.speed);
          await this.sleep(0.6);
        }
        break;
      }
      case "end": {
        const p = [...this.recs.values()].find((r) => r.isPlayer);
        if (e.state === "victory" && p && !p.dead) { p.model.anim.play("victory"); play("victory"); }
        await this.sleep(0.5);
        break;
      }
      default:
        for (const ev of beat.impacts) { this.impact(ev); await this.sleep(0.25); }
    }
  }

  async playAct(beat) {
    const e = beat.e;
    const actor = this.recs.get(e.actor);
    if (!actor || actor.dead) { for (const ev of beat.impacts) this.impact(ev); return; }
    const plan = planAct(e, actor.model);
    const targets = [];
    for (const ev of beat.impacts) {
      const t = this.recs.get(ev.target);
      if (t && ["damage", "miss", "heal", "barrier", "status_on"].includes(ev.type) && !targets.includes(t)) targets.push(t);
    }
    const primary = this.recs.get(e.target) || targets[0] || null;
    if (actor.statuses.some((s) => s.id === "charging") && e.released !== false) {
      actor.statuses = actor.statuses.filter((s) => s.id !== "charging");
      this.w.fx.setStatuses(actor.model, actor.statuses);
    }
    if (primary && primary !== actor) this.face(actor, primary);
    else if (plan.delivery !== "heal" && plan.delivery !== "buff") {
      const foes = [...this.recs.values()].filter((r) => r.side !== actor.side && !r.dead);
      if (foes[0]) this.face(actor, foes[0]);
    }
    if (e.ability && e.ability !== "attack" && e.name) this.w.labels.float(this.chest(actor).setY(actor.model.height + 0.9), e.name, "ability");
    const fx = this.w.fx;
    const byTarget = (t) => beat.impacts.filter((ev) => ev.target === t.uid);
    const rest = () => beat.impacts.filter((ev) => !ev._done);
    const applyFor = (t, opts) => { for (const ev of byTarget(t)) if (!ev._done) { ev._done = true; this.impact(ev, opts); } };
    const applyRest = (opts) => { for (const ev of rest()) { ev._done = true; this.impact(ev, opts); } };
    const sfx = ELEMENT_SFX[plan.element];

    switch (plan.delivery) {
      case "melee": case "cleave": {
        const t = primary && primary !== actor ? primary : targets[0];
        if (!t) { applyRest(); break; }
        const home = actor.model.root.position.clone();
        const dir = this.chest(t).sub(home).setY(0).normalize();
        const reach = actor.model.radius + t.model.radius + 0.55;
        const dest = t.model.root.position.clone().addScaledVector(dir, -reach);
        await this.moveTo(actor, dest, 0.28);
        this.face(actor, t);
        const done = actor.model.anim.play("attack", this.speed);
        play("swing");
        await this.sleep(actor.model.anim.impactDelay("attack", 1));
        const hits = plan.delivery === "cleave" ? targets : [t];
        for (const h of hits) fx.slash(this.chest(h), actor.model.root.rotation.y, { color: plan.color, size: Math.max(0.8, h.model.radius * 1.4) });
        for (const h of hits) applyFor(h);
        applyRest();
        await done;
        await this.moveTo(actor, { x: home.x, z: home.z, yaw: actor.slot?.yaw }, 0.3, false);
        break;
      }
      case "arrow": case "bolt": case "beam": {
        const anim = plan.anim === "shoot" ? "shoot" : plan.delivery === "arrow" ? "attack" : "cast";
        const done = actor.model.anim.play(anim, this.speed);
        play(plan.delivery === "arrow" ? "swing" : "cast");
        await this.sleep(actor.model.anim.impactDelay(anim, 1));
        const list = targets.length ? targets : primary ? [primary] : [];
        for (const t of list) {
          if (plan.delivery === "beam") { fx.beam(this.tip(actor), this.chest(t), { color: plan.color }); await this.sleep(0.08); }
          else await fx.projectile(this.tip(actor), this.chest(t), { color: plan.color, color2: plan.color2, kind: plan.delivery === "arrow" ? "arrow" : "bolt", size: 0.35 });
          if (plan.delivery !== "arrow") fx.flash(this.chest(t), plan.color, 18);
          if (sfx) play(sfx);
          applyFor(t);
        }
        applyRest();
        await done;
        break;
      }
      case "chain": {
        const done = actor.model.anim.play("cast", this.speed);
        play("cast");
        await this.sleep(actor.model.anim.impactDelay("cast", 1));
        let from = this.tip(actor);
        for (const t of targets) {
          fx.beam(from, this.chest(t), { color: plan.color, dur: 0.4 });
          play("lightning");
          applyFor(t);
          from = this.chest(t);
          await this.sleep(0.1);
        }
        applyRest();
        await done;
        break;
      }
      case "nova": case "rain": case "volley": {
        const done = actor.model.anim.play("cast", this.speed);
        play("cast");
        await this.sleep(actor.model.anim.impactDelay("cast", 1));
        const list = targets.length ? targets : primary ? [primary] : [];
        if (plan.delivery === "nova" && list.length) {
          const c = new THREE.Vector3();
          list.forEach((t) => c.add(t.model.root.position));
          c.divideScalar(list.length).setY(1);
          await fx.projectile(this.tip(actor), c, { color: plan.color, color2: plan.color2, size: 0.6, speed: 14 });
          fx.ring(c.clone().setY(0), { color: plan.color, radius: 5, dur: 0.6 });
          fx.burst(c, { color: plan.color, count: 60, speed: 6, size: 0.4, gravity: 2 });
          fx.flash(c, plan.color, 40, 0.5);
          this.w.cam.shake(0.2);
          if (sfx) play(sfx);
          applyRest();
        } else if (plan.delivery === "rain") {
          await Promise.all(list.map((t, i) => this.sleep(i * 0.06).then(() => fx.projectile(this.chest(t).add(new THREE.Vector3(0, 6, 0)), this.chest(t), { color: plan.color, color2: plan.color2, arc: 0, speed: 22 }))));
          list.forEach((t) => fx.burst(this.chest(t), { color: plan.color, count: 16, speed: 3 }));
          if (sfx) play(sfx);
          applyRest();
        } else {
          for (const ev of beat.impacts) {
            const t = this.recs.get(ev.target);
            if (ev.type === "damage" || ev.type === "miss") {
              if (t) await fx.projectile(this.tip(actor), this.chest(t), { color: plan.color, color2: plan.color2, size: 0.3, speed: 20 });
              if (sfx) play(sfx);
            }
            ev._done = true;
            this.impact(ev);
          }
        }
        await done;
        break;
      }
      default: {
        // buff, heal, shout, vanish, summon
        const anim = plan.anim === "cheer" ? "cheer" : "cast";
        const done = actor.model.anim.play(anim, this.speed);
        play(plan.delivery === "shout" ? "roar" : plan.delivery === "heal" ? "heal" : "buff");
        await this.sleep(actor.model.anim.impactDelay(anim, 1) || 0.4);
        const list = targets.length ? targets : [actor];
        if (plan.delivery === "shout") fx.ring(actor.model.root.position, { color: plan.color, radius: 7, dur: 0.8 });
        else if (plan.delivery === "summon") fx.portal(actor.model.root.position.clone().addScaledVector(this.f, actor.side === "enemy" ? -1.5 : 1.5), "#9a5cff");
        else if (plan.delivery === "vanish") fx.burst(this.chest(actor), { color: "#6a5a8a", count: 40, speed: 2, gravity: -0.5, size: 0.5 });
        for (const t of list) fx.column(t.model.root.position, { color: plan.color, height: t.model.height * 1.2 });
        applyRest({ big: true });
        await done;
      }
    }
    await this.sleep(0.18);
  }

  impact(ev, opts = {}) {
    const fx = this.w.fx, labels = this.w.labels;
    const rec = this.recs.get(ev.target);
    switch (ev.type) {
      case "damage": {
        if (!rec) break;
        rec.hp = ev.hp; rec.barrier = ev.barrier ?? rec.barrier;
        const text = ev.amount > 0 ? `${ev.amount}${ev.crit ? "!" : ""}` : ev.absorbed ? "Absorbed" : "0";
        const cls = ["dmg", rec.isPlayer || rec.side !== "enemy" ? "taken" : "", ev.crit ? "crit" : "", ev.dot ? "dot" : "", `el-${ev.element || "physical"}`].filter(Boolean).join(" ");
        labels.float(this.chest(rec), ev.label && ev.dot ? `${text} ${ev.label}` : text, cls);
        if (ev.absorbed && ev.amount > 0) labels.float(this.chest(rec).setY(rec.model.height + 0.2), `(${ev.absorbed} absorbed)`, "info small");
        fx.burst(this.chest(rec), { color: elementColor(ev.element), count: ev.crit ? 30 : ev.dot ? 6 : 14, speed: ev.crit ? 5 : 3, size: 0.28 });
        if (!ev.dot && ev.hp > 0) rec.model.anim.play("hit", this.speed);
        this.flash(rec, ev.dot ? elementColor(ev.element) : "#ffffff");
        play(ev.crit ? "crit" : ev.dot ? (ELEMENT_SFX[ev.element] || "hit") : "hit");
        if (rec.isPlayer || ev.crit) this.w.cam.shake(ev.crit ? 0.25 : 0.12);
        if (!rec.barrier) fx.unbubble(rec.model);
        break;
      }
      case "miss":
        if (!rec) break;
        labels.float(this.chest(rec), MISS_TEXT[ev.reason] || "Miss", "miss");
        play(ev.reason === "immune" || ev.reason === "resist" ? "block" : "miss");
        break;
      case "heal":
        if (!rec) break;
        rec.hp = ev.hp;
        if (ev.amount > 0) {
          labels.float(this.chest(rec), `+${ev.amount}`, "heal");
          fx.column(rec.model.root.position, { color: "#8dff9a", height: rec.model.height, dur: 0.7, radius: 0.5 });
          if (opts.big) play("heal");
        }
        break;
      case "barrier":
        if (!rec) break;
        rec.barrier = ev.barrier;
        fx.bubble(rec.model);
        labels.float(this.chest(rec), `+${ev.amount} barrier`, "shield");
        break;
      case "status_on": {
        if (!rec) break;
        const i = rec.statuses.findIndex((s) => s.id === ev.status);
        const s = { id: ev.status, kind: ev.kind, element: ev.element, stacks: ev.stacks, name: pretty(ev.status) };
        if (i >= 0) rec.statuses[i] = { ...rec.statuses[i], ...s }; else rec.statuses.push(s);
        fx.setStatuses(rec.model, rec.statuses);
        labels.float(this.chest(rec).setY(rec.model.height + 0.1), pretty(ev.status) + (ev.stacks > 1 ? ` ×${ev.stacks}` : ""), `status ${ev.kind || ""}`);
        break;
      }
      case "status_off":
        if (!rec) break;
        rec.statuses = rec.statuses.filter((s) => s.id !== ev.status);
        fx.setStatuses(rec.model, rec.statuses);
        break;
      case "death":
        if (!rec || rec.dead) break;
        rec.dead = true; rec.hp = 0;
        this.kill(rec, ev.silent);
        break;
      case "summon": {
        const u = this.cb.units.find((x) => x.uid === ev.target);
        if (!u || this.recs.has(u.uid)) break;
        const r = this.makeRec(u);
        r.dead = false; r.hp = u.max_hp; r.statuses = [];
        this.layout();
        fx.portal(r.model.root.position, u.side === "enemy" ? "#9a5cff" : "#8ff0ff");
        this.emerge(r, 0);
        this.renderLabel(r);
        break;
      }
      case "convert":
        if (!rec) break;
        rec.side = ev.side;
        rec.placed = false;
        rec.el.classList.toggle("enemy", ev.side === "enemy");
        rec.el.classList.toggle("ally", ev.side !== "enemy");
        this.layout();
        labels.float(this.chest(rec), ev.side === "enemy" ? "Turns on you!" : "Joins your side!", "status");
        break;
      case "phase":
        this.w.banner(ev.text || `Phase ${ev.phase}`, "phase");
        if (rec) fx.ring(rec.model.root.position, { color: "#ff7a3a", radius: 8, dur: 0.9 });
        this.w.cam.shake(0.35);
        play("roar");
        break;
      case "interrupt":
        if (!rec) break;
        rec.statuses = rec.statuses.filter((s) => s.id !== "charging");
        fx.setStatuses(rec.model, rec.statuses);
        labels.float(this.chest(rec), "Interrupted!", "warn");
        break;
      case "survive":
        if (!rec) break;
        rec.hp = ev.hp;
        labels.float(this.chest(rec), "Refuses to fall!", "warn");
        break;
      case "misdirect":
        if (rec) labels.float(this.chest(rec), "Misdirected!", "status");
        break;
    }
    if (rec) this.renderLabel(rec);
    this.w.requestHud();
  }

  flash(rec, color) {
    tintModel(rec.model.root, color, 0.7);
    setTimeout(() => { if (this.recs.get(rec.uid) === rec) this.w.fx.setStatuses(rec.model, rec.statuses); }, 110);
  }

  kill(rec, silent) {
    rec.model.anim.play("die", this.speed);
    if (!silent) play("death");
    this.w.fx.clearStatuses(rec.model);
    rec.ring.material.opacity = 0;
    if (rec.isPlayer) return;
    rec.label.setHidden(true);
    const root = rec.model.root;
    const y0 = root.position.y;
    this.sleep(0.9).then(() => this.tween(0.8, (k) => {
      root.position.y = y0 - k * 0.8;
      tintModel(root, "#000000", k * 0.5, 1 - k);
    })).then(() => { root.visible = false; });
  }

  reconcile() {
    const cb = this.cb;
    if (!cb) return;
    const seen = new Set();
    for (const u of cb.units) {
      seen.add(u.uid);
      let rec = this.recs.get(u.uid);
      if (!rec) {
        if (!u.alive) continue;
        rec = this.makeRec(u);
        this.layout();
      }
      rec.u = u; rec.hp = u.hp; rec.maxHp = u.max_hp; rec.barrier = u.barrier || 0; rec.side = u.side;
      rec.statuses = (u.statuses || []).map((s) => ({ ...s }));
      if (!u.alive && !rec.dead) { rec.dead = true; this.kill(rec, true); }
      if (!rec.dead) {
        this.w.fx.setStatuses(rec.model, rec.statuses);
        if (rec.barrier > 0) this.w.fx.bubble(rec.model); else this.w.fx.unbubble(rec.model);
      }
      this.renderLabel(rec);
    }
    for (const [uid, rec] of this.recs) if (!seen.has(uid) && !rec.isPlayer && !rec.dead) { rec.dead = true; this.kill(rec, true); }
  }

  renderLabel(rec) {
    const u = rec.u;
    const pct = (v) => `${Math.max(0, Math.min(100, (100 * v) / Math.max(1, rec.maxHp))).toFixed(1)}%`;
    const st = rec.statuses.filter((s) => s.id !== "charging").slice(0, 6).map((s) => `<span class="st ${s.kind || ""}" title="${s.name || pretty(s.id)}">${(s.name || pretty(s.id)).slice(0, 12)}${s.stacks > 1 ? "×" + s.stacks : ""}</span>`).join("");
    const charging = rec.statuses.find((s) => s.id === "charging");
    rec.el.innerHTML =
      `<div class="un">${escapeHtml(u.name)} <small>Lv ${u.level}</small></div>` +
      `<div class="hpb"><i style="width:${pct(rec.hp)}"></i>${rec.barrier > 0 ? `<b style="width:${pct(rec.barrier)}"></b>` : ""}<span>${Math.max(0, rec.hp)} / ${rec.maxHp}</span></div>` +
      (charging ? `<div class="chg">⚠ ${escapeHtml(charging.charging || "Charging")}</div>` : "") +
      (st ? `<div class="sts">${st}</div>` : "");
    rec.el.classList.toggle("current", this.current === rec.uid && !this.busy);
  }

  setTargetable(set) {
    for (const rec of this.recs.values()) {
      const on = set.has(rec.uid) && !rec.dead;
      rec.el.classList.toggle("targetable", on);
      rec.targetable = on;
    }
  }

  update(dt, t) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.step(k);
      if (k >= 1) { this.tweens.splice(i, 1); tw.resolve(); }
    }
    for (const rec of this.recs.values()) {
      if (!rec.model.root.visible) continue;
      if (!rec.isPlayer) rec.model.anim.update(dt, rec.moving);
      const m = rec.ring.material;
      const cur = this.current === rec.uid && !rec.dead;
      m.color.set(rec.targetable ? (rec.hover ? "#ffffff" : "#ff8a60") : cur ? "#ffd36a" : "#ffd36a");
      m.opacity = rec.targetable ? 0.55 + 0.3 * Math.sin(t * 6) : cur ? 0.45 : 0;
    }
  }

  pick(ray) {
    let best = null, bestT = Infinity;
    const c = new THREE.Vector3();
    for (const rec of this.recs.values()) {
      if (rec.dead || !rec.model.root.visible) continue;
      c.copy(rec.model.root.position); c.y += rec.model.height * 0.5;
      const rad = Math.max(0.6, rec.model.radius * 1.2, rec.model.height * 0.4);
      if (ray.distanceToPoint(c) < rad) { const t = ray.origin.distanceTo(c); if (t < bestT) { bestT = t; best = rec; } }
    }
    return best;
  }

  end() {
    this.active = false;
    this.queue = [];
    this.tweens.forEach((tw) => tw.resolve());
    this.tweens = [];
    for (const rec of this.recs.values()) {
      rec.label.remove();
      rec.model.root.remove(rec.ring);
      rec.ring.geometry.dispose(); rec.ring.material.dispose();
      this.w.fx.clearStatuses(rec.model);
      if (!rec.isPlayer) { this.w.scene.remove(rec.model.root); disposeModel(rec.model.root); }
    }
    this.recs.clear();
    this.cb = null;
    this.intro = null;
    this.playing = false;
    this.w.fx.speed = 1;
  }
}

// HP/barrier each unit had before the first event in a list (so a replayed opening turn starts
// from the right values instead of the post-turn snapshot).
function initialValues(events) {
  const out = new Map();
  for (const e of events) {
    if (!e.target || out.has(e.target)) continue;
    if (e.type === "damage") out.set(e.target, { hp: e.hp + e.amount, barrier: (e.barrier || 0) + (e.absorbed || 0) });
    else if (e.type === "heal") out.set(e.target, { hp: e.hp - e.amount });
  }
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
