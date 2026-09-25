// The 3D client facade. It owns the renderer and the frame loop and turns each server view into a
// scene: the current location as an explorable room, NPCs, interactables, the player avatar and,
// during battles, the combat presenter. All game rules stay on the server; every interaction here
// ends in an existing engine action via act().
import * as THREE from "three";
import { act, ui, render, confirmBox, isBusy } from "../app.js";
import { toast } from "../util.js";
import { doTarget } from "../screens/combat.js";
import { layoutFor, loadRegion } from "./layouts.js";
import { buildRoom, roomSignature, yawTo } from "./room.js";
import { CameraRig } from "./camera.js";
import { PlayerController } from "./player.js";
import { Interactions } from "./interact.js";
import { NpcManager } from "./npc.js";
import { Labels } from "./labels.js";
import { FX } from "./fx.js";
import { CombatPresenter } from "./combat3d.js";
import { buildHumanoid, disposeModel, lookForPlayer } from "./characters.js";
import { play, ambience, unlockAudio, setMuted } from "./audio.js";
import { tex } from "./textures.js";
import { mat } from "./materials.js";

const PIXEL_CAP = { low: 1, medium: 1.5, high: 2 };
const SYNC_MS = 3000;

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGL2RenderingContext && c.getContext("webgl2"));
  } catch { return false; }
}

export async function createWorld({ host, uiHost, syncPosition }) {
  const w = new World(host, uiHost, syncPosition);
  await w.init();
  return w;
}

class World {
  constructor(host, uiHost, syncPosition) {
    this.host = host;
    this.uiHost = uiHost;
    this.syncPositionFn = syncPosition;
    this.settings = {};
    this.quality = "medium";
    this.state = null;
    this.room = null;
    this.roomSig = null;
    this.roomToken = 0;
    this.visible = true;
    this.debug = { colliders: false, anchors: false, stats: false };
    this.t = 0;
    this.lastSync = { x: 0, z: 0, t: 0 };
    this.exitCooldown = 0;
    this.hudTimer = null;
    this.playerLookKey = null;
    this.note = null;
  }

  async init() {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.2;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.host.appendChild(r.domElement);
    r.domElement.className = "w3d-canvas";
    r.domElement.tabIndex = -1;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0d0907");
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    // Soft fill that travels with the camera so characters never read as pure silhouettes against
    // bright set pieces. Permanent (added once) so the light count, and therefore shaders, stay stable.
    this.fill = new THREE.PointLight("#ffe2c0", 3, 22, 1);
    this.fill.position.set(0.6, 0.8, 0);
    this.camera.add(this.fill);
    this.scene.add(this.camera);
    this.cam = new CameraRig(this.camera, r.domElement);
    this.cam.onClick = (x, y) => this.onClick(x, y);
    this.cam.onHover = (x, y) => this.onHover(x, y);
    this.labels = new Labels(this.uiHost);
    this.fx = new FX(this.scene, this.labels, { onShake: (a) => this.cam.shake(a) });
    this.interact = new Interactions(this.scene, this.uiHost);
    this.npcs = new NpcManager(this.scene, this.labels);
    this.player = new PlayerController();
    this.combat = new CombatPresenter(this);
    this.raycaster = new THREE.Raycaster();
    this.clickMarker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex("ring"), color: "#ffd36a", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.clickMarker.rotation.x = -Math.PI / 2;
    this.clickMarker.visible = false;
    this.scene.add(this.clickMarker);
    this.makeUi();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    for (const ev of ["pointerdown", "keydown"]) window.addEventListener(ev, () => unlockAudio(), { once: false, passive: true });
    this.clock = new THREE.Clock();
    this.frames = 0; this.fpsT = 0; this.fps = 0;
    r.setAnimationLoop(() => this.frame());
    loadRegion("kharum");
  }

  makeUi() {
    const mk = (cls, parent = this.uiHost) => { const d = document.createElement("div"); d.className = cls; parent.appendChild(d); return d; };
    this.veil = mk("w3d-veil");
    this.bannerEl = mk("w3d-banner");
    this.compass = mk("w3d-compass");
    this.noteEl = mk("w3d-note panel");
    this.noteEl.hidden = true;
    this.statsEl = mk("w3d-stats");
    this.statsEl.hidden = true;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_CAP[this.quality] || 1.5));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.w = w; this.h = h;
    this.setViewShift(this.viewShift || 0);
  }

  applySettings(s) {
    this.settings = s;
    const q = ["low", "medium", "high"].includes(s.quality) ? s.quality : "medium";
    if (q !== this.quality) {
      this.quality = q;
      this.resize();
      this.renderer.shadowMap.enabled = q === "high";
      this.roomSig = null; // rebuild with the new light/shadow budget
      if (this.state) this.update(this.state);
    }
    this.renderer.shadowMap.enabled = this.quality === "high";
    this.cam.invertY = !!s.invert_y;
    this.cam.speed = Number(s.cam_speed) || 1;
    setMuted(!!s.mute);
  }

  // ---------------------------------------------------------------- state -> scene
  update(state) {
    const prev = this.state;
    this.state = state;
    this.applySettings(state.settings || {});
    const mode = state.mode;
    this.visible = !["defeat", "ending"].includes(mode);
    document.body.classList.toggle("w3d-hidden", !this.visible);
    if (mode === "title" || mode === "create") {
      if (this.combat.active) this.combat.end();
      this.showcase(mode);
      return;
    }
    if (!state.location) return;
    const loc = state.location;
    this.ensurePlayerModel(state);
    // Same room: apply synchronously so the HUD rendered right after this call already sees queued
    // combat playback (otherwise it would flash the resolved result for a frame).
    if (this.room && this.room.loc === loc.id && roomSignature(loc, this.room.layout) + "|" + this.quality === this.roomSig) {
      this.afterRoom(state, prev);
      return;
    }
    this.ensureRoom(loc, state).then(() => {
      if (this.state !== state) return;
      this.afterRoom(state, prev);
    });
  }

  afterRoom(state, prev) {
    const loc = state.location;
    const mode = state.mode;
    this.npcs.sync(loc, this.room, this.room.layout.look || {});
    this.interact.set(mode === "explore" ? this.buildInteractables(state) : []);
    for (const s of Object.values(this.room.separate)) if (s.prop.hide_in_combat) s.group.visible = mode !== "combat";
    if (mode === "combat") {
      if (!this.combat.active) {
        this.interact.closeMenu();
        this.player.cancel();
        this.combat.begin(state.combat, this.room, this.playerModel, this.player.pos);
      } else this.combat.sync(state.combat);
      this.updateTargets();
    } else if (this.combat.active) {
      const pos = this.playerModel.root.position;
      this.combat.end();
      this.player.place(pos.x, pos.z, this.playerModel.root.rotation.y);
      this.playerModel.anim.revive();
      this.cam.setMode("follow", { force: true });
      this.lastSync = { x: -999, z: -999, t: 0 };
    }
    if (prev?.mode === "defeat" || (prev && prev.mode !== "combat" && this.playerModel.anim.dead)) this.playerModel.anim.revive();
    if (mode === "dialogue") this.player.cancel();
    this.updateNote(state, prev);
  }

  updateTargets() {
    const cb = this.state?.combat;
    if (!cb) return;
    const busy = this.combat.busy;
    const set = new Set(!busy && !cb.result ? (ui.targeting ? ui.targeting.targets || [] : cb.my_turn ? cb.attack_targets : []) : []);
    this.combat.setTargetable(set);
  }

  ensurePlayerModel(state) {
    const p = state.player;
    if (!p) return;
    const look = lookForPlayer(p, state.inventory?.equipment);
    const key = JSON.stringify(look);
    if (key === this.playerLookKey) return;
    this.playerLookKey = key;
    const old = this.playerModel;
    this.playerModel = buildHumanoid(look);
    this.player.race = p.race;
    this.player.radius = p.race === "dwarf" ? 0.45 : 0.4;
    if (old) {
      this.playerModel.root.position.copy(old.root.position);
      this.playerModel.root.rotation.y = old.root.rotation.y;
      this.scene.remove(old.root);
      disposeModel(old.root);
      if (old.anim.dead) this.playerModel.anim.play("die");
    }
    this.scene.add(this.playerModel.root);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), mat("shadow_blob"));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02;
    this.playerModel.root.add(blob);
  }

  async ensureRoom(loc, state) {
    const layout = await layoutFor(loc);
    const sig = roomSignature(loc, layout) + "|" + this.quality;
    if (sig === this.roomSig && this.room) return;
    const token = ++this.roomToken;
    const newLoc = !this.room || this.room.loc !== loc.id;
    if (newLoc && this.room) { this.veil.classList.add("on"); await new Promise((r) => setTimeout(r, 180)); }
    if (token !== this.roomToken) return;
    const keepPos = !newLoc ? { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw } : null;
    let room;
    try {
      room = buildRoom(loc, layout, { quality: this.quality, pixelRatio: this.renderer.getPixelRatio() });
    } catch (err) {
      console.error("room build failed; falling back to procedural layout", err);
      const { generateLayout } = await import("./layouts.js");
      room = buildRoom(loc, generateLayout(loc), { quality: this.quality, pixelRatio: this.renderer.getPixelRatio() });
    }
    if (this.room) { this.scene.remove(this.room.group); this.room.dispose(); this.npcs.clear(); }
    this.room = room;
    this.roomSig = sig;
    this.scene.add(room.group);
    this.labels.occluder = room.col;
    this.setAtmosphere(room);
    this.buildDoorLabels(room);
    if (this.debug.colliders || this.debug.anchors) this.refreshDebug();
    if (!this.playerModel) this.ensurePlayerModel(state);
    if (keepPos) {
      const p = { x: keepPos.x, z: keepPos.z };
      room.col.resolve(p, this.player.radius);
      this.player.place(p.x, p.z, keepPos.yaw);
    } else {
      const s = room.spawnFor(loc.prev_location, loc.scene_pos);
      this.player.place(s.x, s.z, s.yaw);
      this.cam.yaw = s.yaw + Math.PI;
      this.cam.pitch = 0.38;
      this.cam.setMode("follow", { force: true });
      this.lastSync = { x: s.x, z: s.z, t: performance.now() };
      this.exitCooldown = 1.0;
    }
    this.playerModel.root.position.set(this.player.pos.x, 0, this.player.pos.z);
    this.playerModel.root.rotation.y = this.player.yaw;
    this.cam.goal.set(this.player.pos.x, this.playerModel.height * 0.85, this.player.pos.z);
    this.cam.snap();
    if (newLoc) {
      ambience(room.kit.name);
      this.veil.classList.remove("on");
      this.banner(loc.name, "place", loc.region_name);
      play("door");
      this.shownDesc = null;
    }
  }

  setAtmosphere(room) {
    const [fc, fd] = room.fog;
    this.scene.fog = new THREE.FogExp2(fc, fd * (this.quality === "low" ? 1.15 : 1));
    this.scene.background = room.sky ? tex("sky") : new THREE.Color(fc);
  }

  buildDoorLabels(room) {
    for (const d of this.doorLabels || []) d.remove();
    this.doorLabels = [];
    if (!room.doors) return;
    for (const d of Object.values(room.doors)) {
      const el = document.createElement("div");
      el.className = "w3d-exit" + (d.locked ? " locked" : "") + (d.visited ? " visited" : "");
      el.textContent = (d.locked ? "🔒 " : "➜ ") + d.label;
      this.doorLabels.push(this.labels.add(el, d.labelPos, { maxDist: 26, occlude: false }));
    }
  }

  buildInteractables(state) {
    const loc = state.location, room = this.room, out = [];
    const note = (title, text) => this.showNote(title, text);
    for (const n of loc.npcs) {
      const s = room.npcSpots[n.id];
      if (!s) continue;
      out.push({ id: "npc:" + n.id, kind: "npc", verb: "Talk to", label: n.name,
        sub: n.marker === "!" ? "Has something for you" : n.marker === "?" ? "Wants to hear from you" : n.title,
        x: s.x, z: s.z, r: 2.9, priority: 0.3, pickY: 1.1,
        activate: () => { this.playerModel.anim.play("talk"); act({ action: "talk", npc: n.id }); } });
    }
    for (const f of loc.features) {
      const s = room.featureSpots[f.id];
      if (!s) continue;
      const actions = f.actions.map((a) => ({ label: a.label, run: () => this.doFeature(f, a) }));
      const shortDesc = f.desc && f.desc.length > 150 ? f.desc.slice(0, 147) + "…" : f.desc;
      out.push({ id: "feat:" + f.id, kind: "feature", label: f.name, sub: actions.length > 1 ? `${actions.length} things to do` : shortDesc,
        verb: actions.length === 1 ? f.actions[0].label : actions.length ? "Examine" : "Look at",
        x: s.x, z: s.z, r: s.r + 1.2, ringR: Math.min(2.2, s.r * 0.6), pickY: s.h ?? 1.2, pickR: Math.max(1, s.r * 0.7), actions,
        activate: () => (actions.length === 1 ? actions[0].run() : note(f.name, f.desc || "Nothing more to do here.")) });
    }
    for (const d of Object.values(room.doors)) {
      out.push({ id: "exit:" + d.to, kind: "exit", verb: d.locked ? "Locked —" : "Go to", label: d.label, sub: d.locked ? d.locked_text : d.visited ? "Visited" : "Unexplored",
        locked: d.locked, x: d.x - d.ox * 1.1, z: d.z - d.oz * 1.1, r: 2.6, ringR: 1.3, pickY: 2, pickR: 2,
        activate: () => (d.locked ? toast("Locked", d.locked_text || "The way is barred.", "info", 4000) : this.goExit(d)) });
    }
    const P = room.points;
    if (loc.shop && P.shop) out.push({ id: "svc:shop", kind: "shop", verb: "Browse", label: loc.shop_name, x: P.shop.x, z: P.shop.z, r: P.shop.r + 0.6, activate: () => act({ action: "shop", shop: loc.shop }) });
    if (loc.rest && P.rest) {
      const label = loc.rest === "inn" ? `at the inn (${loc.rest_cost} gold)` : loc.rest === "camp" ? "here" : "here";
      out.push({ id: "svc:rest", kind: "rest", verb: loc.rest === "camp" ? "Make camp" : "Rest", label, sub: loc.rest === "camp" ? "Restores you, but a fire draws attention." : "Restores you and passes a day.",
        x: P.rest.x, z: P.rest.z, r: P.rest.r + 0.6, activate: () => act({ action: "rest" }) });
    }
    if (loc.respec && P.respec) {
      const cost = state.skills?.respec_cost ?? 0;
      out.push({ id: "svc:respec", kind: "respec", verb: "Retrain skills", label: `(${cost} gold)`, sub: "Unlearn all skills and refund the points.", x: P.respec.x, z: P.respec.z, r: P.respec.r + 0.6,
        activate: () => confirmBox(`Unlearn every skill and refund the points for ${cost} gold?`, () => act({ action: "respec" }), "Retrain") });
    }
    if (loc.can_travel && P.travel) {
      const dests = loc.world_open ? loc.travel.map((t) => ({ label: `${t.name} — ${t.days} day${t.days > 1 ? "s" : ""}${t.level ? ` · level ${t.level}` : ""}`, run: () => act({ action: "travel", dest: t.id }) })) : [];
      out.push({ id: "svc:travel", kind: "travel", verb: "Travel", label: "Road map", x: P.travel.x, z: P.travel.z, r: P.travel.r + 0.6,
        sub: loc.world_open ? (dests.length ? `${dests.length} destinations` : "No other destinations known yet.") : "The roads beyond your homeland are closed for now.",
        actions: dests.length > 1 ? dests : null,
        activate: () => (dests.length === 1 ? dests[0].run() : !loc.world_open ? toast("Travel", "The roads beyond your homeland are closed for now. Your story here must come first.", "info", 5000) : toast("Travel", "No other destinations known yet.", "info")) });
    }
    return out;
  }

  doFeature(f, a) {
    this.playerModel.anim.play("interact");
    play("interact");
    act({ action: "interact", feature: f.id, index: a.index });
  }

  goExit(d) {
    if (isBusy() || this.state?.mode !== "explore") return;
    this.exitCooldown = 2;
    this.player.cancel();
    act({ action: "move", to: d.to });
  }

  showNote(title, text) {
    this.noteEl.replaceChildren(
      Object.assign(document.createElement("h4"), { textContent: title }),
      Object.assign(document.createElement("div"), { className: "desc", textContent: text }),
      Object.assign(document.createElement("div"), { className: "dim hint", textContent: "Walk away or press Esc to close" }));
    this.noteEl.hidden = false;
    this.note = { x: this.player.pos.x, z: this.player.pos.z };
  }

  hideNote() { this.noteEl.hidden = true; this.note = null; }

  updateNote(state, prev) {
    if (prev && prev.location?.id !== state.location?.id) this.hideNote();
  }

  // ---------------------------------------------------------------- title / creation backdrop
  async showcase(mode) {
    if (!this.showcaseRoom) {
      const reg = await loadRegion("kharum");
      const lay = reg?.locations?.kd_forgehall;
      if (!lay || this.showcaseRoom) return this.showcaseRoom && this.showcase(mode);
      const fake = { id: "kd_forgehall", region: "kharum", biome: "dwarf_hall", exits: Object.keys(lay.exits || {}).map((to) => ({ to, label: "", locked: false })), npcs: [], features: [] };
      if (this.room) { this.scene.remove(this.room.group); this.room.dispose(); this.npcs.clear(); this.room = null; this.roomSig = null; }
      for (const d of this.doorLabels || []) d.remove();
      this.doorLabels = [];
      this.showcaseRoom = buildRoom(fake, { ...lay, authored: true, kit: lay.kit || reg.kit }, { quality: this.quality, pixelRatio: this.renderer.getPixelRatio() });
      this.scene.add(this.showcaseRoom.group);
      this.setAtmosphere(this.showcaseRoom);
      ambience("dwarf");
    }
    if (!["title", "create"].includes(this.state?.mode)) return;
    this.interact.set([]);
    const s = this.showcaseRoom.layout.showcase || { target: [0, 3, 0], dist: 22, pitch: 0.28 };
    if (mode === "create") {
      const cs = ui.creation || { race: "human", cls: "fighter" };
      const key = `${cs.race}|${cs.cls}`;
      if (key !== this.previewKey) {
        this.previewKey = key;
        if (this.preview) this.scene.remove(this.preview.root), disposeModel(this.preview.root);
        this.preview = buildHumanoid({ race: cs.race, cls: cs.cls, weapon: { fighter: cs.race === "dwarf" ? "axe" : "sword", mage: "staff", rogue: "dagger" }[cs.cls], offhand: cs.cls === "fighter" ? "shield" : cs.cls === "rogue" ? "dagger" : null });
        const p = this.showcaseRoom.layout.preview || [0, 9];
        this.preview.root.position.set(p[0], 0, p[1]);
        this.preview.root.rotation.y = 0;
        this.scene.add(this.preview.root);
        this.preview.anim.play("cheer");
      }
      const p = this.preview.root.position;
      if (this.showMode !== "create") this.cam.setMode("showcase", { dist: 4.2, pitch: 0.12, yaw: 0, spin: false, force: true });
      this.cam.goal.set(p.x, this.preview.height * 0.6, p.z);
      this.setViewShift(0.3);
    } else {
      if (this.preview) { this.scene.remove(this.preview.root), disposeModel(this.preview.root); this.preview = null; this.previewKey = null; }
      if (this.showMode !== "title") this.cam.setMode("showcase", { dist: s.dist, pitch: s.pitch, force: true });
      this.cam.goal.set(...s.target);
      this.setViewShift(0);
    }
    this.showMode = mode;
    if (this.playerModel) this.playerModel.root.visible = false;
  }

  // Shifts the rendered image horizontally (fraction of the width) so the camera target can sit
  // beside an HTML panel instead of behind it.
  setViewShift(f) {
    this.viewShift = f;
    if (f && this.w > 900) this.camera.setViewOffset(this.w, this.h, -f * this.w, 0, this.w, this.h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  leaveShowcase() {
    if (!this.showcaseRoom) return;
    this.setViewShift(0);
    this.showMode = null;
    this.scene.remove(this.showcaseRoom.group);
    this.showcaseRoom.dispose();
    this.showcaseRoom = null;
    if (this.preview) { this.scene.remove(this.preview.root), disposeModel(this.preview.root); this.preview = null; this.previewKey = null; }
  }

  // ---------------------------------------------------------------- input
  handleKey(e) {
    const st = this.state;
    if (!st) return false;
    if (this.interact.menu && this.interact.menuKey(e)) { e.preventDefault(); return true; }
    if (e.key === "Escape" && !this.noteEl.hidden) { this.hideNote(); return true; }
    if (st.mode !== "explore" || ui.panel || ui.menu || ui.confirm) return false;
    const k = e.key.toLowerCase();
    if (k === "e" || e.key === "Enter") {
      if (this.interact.activate()) { e.preventDefault(); return true; }
      return false;
    }
    if (k === "f") {
      e.preventDefault();
      this.search();
      return true;
    }
    return false;
  }

  search() {
    const loc = this.state?.location;
    if (!loc || this.state.mode !== "explore") return;
    if (!loc.can_search) { toast("Already searched", "You've searched here at this level. Come back when you've grown sharper.", "info", 4000); return; }
    this.fx.ring(this.player.pos, { color: "#8ff0ff", radius: 9, dur: 1.2 });
    this.playerModel.anim.play("interact");
    act({ action: "search" });
  }

  ray(x, y) {
    const v = new THREE.Vector2((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    return this.raycaster.ray;
  }

  onClick(x, y) {
    const st = this.state;
    if (!st || !this.visible) return;
    const ray = this.ray(x, y);
    if (st.mode === "combat") {
      const rec = this.combat.pick(ray);
      if (rec) this.onUnitClick(rec.uid);
      return;
    }
    if (st.mode !== "explore" || ui.panel || ui.menu) return;
    this.interact.closeMenu();
    const npc = this.npcs.pick(ray);
    const it = npc ? this.interact.list.find((i) => i.id === "npc:" + npc.id) : this.interact.pick(ray);
    if (it) {
      const d = Math.hypot(it.x - this.player.pos.x, it.z - this.player.pos.z);
      const reach = Math.max(1.4, it.r - 0.6);
      if (d <= reach) { this.faceTo(it.x, it.z); this.interact.activate(it); }
      else this.player.moveTo(it.x, it.z, { stop: reach, onArrive: () => { this.faceTo(it.x, it.z); this.interact.activate(it); } });
      this.mark(it.x, it.z, "#ffd36a");
      return;
    }
    const p = new THREE.Vector3();
    if (ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) && ray.origin.distanceTo(p) < 80) {
      this.player.moveTo(p.x, p.z, { stop: 0.25 });
      this.mark(p.x, p.z, "#8ff0ff");
    }
  }

  onUnitClick(uid) {
    const cb = this.state?.combat;
    if (!cb || this.combat.busy || cb.result) return;
    const rec = this.combat.recs.get(uid);
    if (rec?.targetable) doTarget(uid);
  }

  onHover(x, y) {
    if (this.state?.mode !== "combat") return;
    const rec = this.combat.pick(this.ray(x, y));
    for (const r of this.combat.recs.values()) r.hover = r === rec;
    this.renderer.domElement.style.cursor = rec?.targetable ? "pointer" : "";
  }

  faceTo(x, z) { this.player.yaw = Math.atan2(x - this.player.pos.x, z - this.player.pos.z); }

  mark(x, z, color) {
    this.clickMarker.position.set(x, 0.05, z);
    this.clickMarker.material.color.set(color);
    this.clickMarker.visible = true;
    this.markT = 0.6;
  }

  // ---------------------------------------------------------------- HUD helpers
  banner(text, cls = "", sub = "") {
    const el = document.createElement("div");
    el.className = "w3d-banner-item " + cls;
    el.innerHTML = `${sub ? `<small>${escapeHtml(sub)}</small>` : ""}<div>${escapeHtml(text)}</div>`;
    this.bannerEl.appendChild(el);
    setTimeout(() => el.classList.add("out"), cls === "place" ? 2600 : 1400);
    setTimeout(() => el.remove(), cls === "place" ? 3400 : 2000);
  }

  requestHud(force = false) {
    this.updateTargets();
    if (force) { clearTimeout(this.hudTimer); this.hudTimer = null; render(); return; }
    if (this.hudTimer) return;
    this.hudTimer = setTimeout(() => { this.hudTimer = null; render(); }, 180);
  }

  get combatBusy() { return this.combat.busy; }

  updateCompass() {
    const room = this.room;
    if (!room || this.state?.mode !== "explore") { this.compass.hidden = true; return; }
    this.compass.hidden = false;
    const yaw = this.cam.yaw + Math.PI; // direction the camera faces
    const items = [["N", 0, -1], ["E", 1, 0], ["S", 0, 1], ["W", -1, 0]].map(([l, x, z]) => ({ l, a: Math.atan2(x, z), cls: "card" }));
    for (const d of Object.values(room.doors)) {
      items.push({ l: d.locked ? "🔒" : "◆", a: Math.atan2(d.x - this.player.pos.x, d.z - this.player.pos.z), cls: "door" + (d.locked ? " locked" : ""), title: d.label });
    }
    const html = items.map((it) => {
      let rel = Math.atan2(Math.sin(it.a - yaw), Math.cos(it.a - yaw));
      if (Math.abs(rel) > 1.6) return "";
      const x = 50 - (rel / 1.6) * 50;
      return `<span class="${it.cls}" style="left:${x.toFixed(1)}%" title="${it.title ? escapeHtml(it.title) : ""}">${it.l}</span>`;
    }).join("");
    if (html !== this.compassHtml) { this.compass.innerHTML = html; this.compassHtml = html; }
  }

  // ---------------------------------------------------------------- dev hooks
  setDebug(key, on) {
    this.debug[key] = on;
    this.statsEl.hidden = !this.debug.stats;
    this.refreshDebug();
  }

  refreshDebug() {
    if (this.debugGroup) { this.scene.remove(this.debugGroup); this.debugGroup = null; }
    const room = this.room || this.showcaseRoom;
    if (!room || (!this.debug.colliders && !this.debug.anchors)) return;
    const g = new THREE.Group();
    if (this.debug.colliders) g.add(room.col.debugMesh());
    if (this.debug.anchors) {
      const add = (x, z, r, color) => {
        const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.05, r, 32), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2; m.position.set(x, 0.1, z); m.renderOrder = 998; g.add(m);
      };
      for (const it of this.interact.list) add(it.x, it.z, it.r, it.kind === "exit" ? "#ff8a60" : it.kind === "npc" ? "#ffd36a" : "#8ff0ff");
      for (const d of Object.values(room.doors)) { add(d.trigger.x, d.trigger.z, 1.3, "#ff3366"); add(d.inside.x, d.inside.z, 0.4, "#66ff66"); }
      add(room.arena.x, room.arena.z, 5, "#ff5a2a");
    }
    this.debugGroup = g;
    this.scene.add(g);
  }

  teleportLocal(x, z) { this.player.place(x, z, this.player.yaw); }

  positionForSave() {
    if (!this.state?.location || this.state.mode !== "explore" && this.state.mode !== "shop") return null;
    return { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw };
  }

  // ---------------------------------------------------------------- frame
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.t += dt;
    if (!this.visible || document.hidden) return;
    const st = this.state;
    const room = this.room || this.showcaseRoom;
    if (room) {
      for (const f of room.tickers) f(this.t, dt);
      for (const f of room.fields) f.userData.tick(dt);
      for (const L of room.lights) if (L.flicker) L.light.intensity = L.base * (1 - L.flicker + L.flicker * (0.6 + 0.4 * Math.sin(this.t * 11 + L.seed) * Math.sin(this.t * 7.1 + L.seed * 2)));
    }
    const mode = st?.mode;
    if (mode && mode !== "title" && mode !== "create" && this.showcaseRoom && this.room) this.leaveShowcase();
    if (this.preview) this.preview.anim.update(dt, 0), (this.preview.root.rotation.y += dt * 0.4);
    this.fill.intensity = mode === "create" ? 14 : mode === "title" ? 0 : 11;
    const pm = this.playerModel;
    if (pm) pm.root.visible = !!st?.location && mode !== "title" && mode !== "create";
    if (this.room && pm && st?.location) {
      if (mode === "combat" && this.combat.active) {
        this.combat.update(dt, this.t);
        const p = [...this.combat.recs.values()].find((r) => r.isPlayer);
        pm.anim.update(dt, p?.moving || 0);
        this.interact.update(dt, this.player, false);
        this.updateTargets();
      } else {
        const free = mode === "explore" && !ui.menu && !ui.confirm && !ui.panel && !this.interact.menu;
        const speed = this.player.update(dt, this.cam, this.room.col, free);
        pm.root.position.set(this.player.pos.x, 0, this.player.pos.z);
        const d = Math.atan2(Math.sin(this.player.yaw - pm.root.rotation.y), Math.cos(this.player.yaw - pm.root.rotation.y));
        pm.root.rotation.y += d * Math.min(1, dt * 14);
        pm.anim.update(dt, speed);
        if (mode === "explore") this.interact.update(dt, this.player, free);
        else this.interact.update(dt, this.player, false);
        this.checkExits(dt);
        this.maybeSync();
        if (this.note && Math.hypot(this.player.pos.x - this.note.x, this.player.pos.z - this.note.z) > 3) this.hideNote();
      }
      const talking = mode === "dialogue" ? st.dialogue?.npc : null;
      this.npcs.update(dt, this.player.pos, talking);
      this.updateCamera(dt, st);
    } else if (room) {
      this.cam.update(dt, room.col, room.H);
    }
    if (this.markT > 0) { this.markT -= dt; this.clickMarker.scale.setScalar(0.6 + (0.6 - this.markT)); this.clickMarker.material.opacity = Math.max(0, this.markT / 0.6); if (this.markT <= 0) this.clickMarker.visible = false; }
    this.fx.update(dt);
    this.labels.update(this.camera, this.w, this.h, dt);
    this.updateCompass();
    this.renderer.render(this.scene, this.camera);
    this.frames++; this.fpsT += dt;
    if (this.fpsT > 0.5) {
      this.fps = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0;
      if (this.debug.stats) {
        const i = this.renderer.info;
        this.statsEl.textContent = `${this.fps} fps · ${i.render.calls} draws · ${(i.render.triangles / 1000).toFixed(1)}k tris · ${i.programs?.length ?? "?"} programs · ${this.quality}`;
      }
    }
  }

  updateCamera(dt, st) {
    const pm = this.playerModel;
    if (st.mode === "combat") {
      this.cam.update(dt, this.room.col, this.room.H);
      return;
    }
    if (st.mode === "dialogue" && st.dialogue) {
      const n = this.npcs.get(st.dialogue.npc);
      if (n) {
        const a = this.player.pos, b = n.model.root.position;
        const vx = b.x - a.x, vz = b.z - a.z, len = Math.hypot(vx, vz) || 1;
        this.cam.setMode("dialogue", { yaw: Math.atan2(-vx / len, -vz / len) + 0.65 });
        this.cam.goal.set((a.x + b.x) / 2, Math.max(pm.height, n.model.height) * 0.78, (a.z + b.z) / 2);
        this.faceTo(b.x, b.z);
        this.cam.update(dt, this.room.col, this.room.H);
        return;
      }
    }
    if (this.cam.mode !== "follow") this.cam.setMode("follow", { dist: 7 });
    this.cam.goal.set(this.player.pos.x, pm.height * 0.85 + 0.3, this.player.pos.z);
    this.cam.update(dt, this.room.col, this.room.H);
  }

  checkExits(dt) {
    this.exitCooldown -= dt;
    if (this.exitCooldown > 0 || this.state?.mode !== "explore" || isBusy() || !this.room) return;
    for (const d of Object.values(this.room.doors)) {
      if (d.locked) continue;
      if (Math.hypot(this.player.pos.x - d.trigger.x, this.player.pos.z - d.trigger.z) < 1.4) { this.goExit(d); return; }
    }
  }

  maybeSync(force = false) {
    if (this.state?.mode !== "explore" || !this.syncPositionFn) return;
    const now = performance.now();
    const p = this.player.pos;
    const moved = Math.hypot(p.x - this.lastSync.x, p.z - this.lastSync.z);
    if (!force && (moved < 0.75 || now - this.lastSync.t < SYNC_MS || this.player.speed > 0.5)) return;
    this.lastSync = { x: p.x, z: p.z, t: now };
    this.syncPositionFn({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +this.player.yaw.toFixed(3) });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
