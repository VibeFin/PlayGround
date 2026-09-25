import { h, bar, costText } from "../util.js";
import { act, ui, render, getWorld } from "../app.js";

const prevHp = {};

function statusChips(u) {
  return h("div.statuses", null, u.statuses.map((s) => {
    if (s.id === "charging") {
      return h("span.st.charging", { tip: `Charging ${s.charging || "a powerful attack"}! Interrupt it (stuns, bashes) or defend.` },
        `⚠ ${s.charging || "Charging"}`);
    }
    const kind = s.kind || "special";
    // Statuses applied "for the rest of the fight" use a large turn count; don't show it as a countdown.
    const timed = !s.permanent && s.turns < 20;
    const label = s.name + (s.stacks > 1 ? ` ×${s.stacks}` : "") + (timed ? ` (${s.turns})` : "");
    return h(`span.st.${kind}`, { tip: `${s.name}: ${s.desc}${timed ? ` — ${s.turns} turn${s.turns === 1 ? "" : "s"} left` : ""}` }, label);
  }));
}

function unitCard(u, cb, targetable, onTarget) {
  const hit = prevHp[u.uid] !== undefined && u.hp < prevHp[u.uid];
  prevHp[u.uid] = u.hp;
  const cls = ["div.unit", u.is_boss ? "boss" : "", u.is_object ? "object" : "", !u.alive ? "dead" : "",
    cb.current === u.uid ? "current" : "", targetable ? (ui.targeting ? "targetable" : "clickable") : "", hit ? "hit" : ""].filter(Boolean).join(".");
  const res = Object.entries(u.resists || {});
  return h(cls, {
    onclick: targetable ? () => onTarget(u.uid) : null,
    role: targetable ? "button" : "group",
    tabindex: targetable ? "0" : null,
    "aria-label": `${u.name}, level ${u.level}, ${Math.max(0, u.hp)} of ${u.max_hp} health${targetable ? " — target" : ""}`,
    onkeydown: targetable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onTarget(u.uid); } } : null,
    tip: () => h("div", null, h("b", null, u.name), ` (level ${u.level})`, u.desc ? h("div.tip-line", null, u.desc) : null,
      res.length ? h("div.tip-line", null, "Resistances: " + res.map(([e, v]) => `${e} ${v > 0 ? "+" : ""}${v}%`).join(", ")) : null,
      u.tags?.length ? h("div.tip-line", null, "Traits: " + u.tags.join(", ")) : null,
      u.row ? h("div.tip-line", null, `Row: ${u.row}`) : null),
  },
    h("div.row", { style: { flexWrap: "nowrap" } }, h("span.uname", null, u.name), h("span.spacer"), h("span.ulvl", null, `Lv ${u.level}`)),
    bar("hp", u.hp, u.max_hp, `${Math.max(0, u.hp)} / ${u.max_hp}`),
    u.barrier > 0 ? bar("barrier", u.barrier, u.max_hp, `Barrier ${u.barrier}`) : null,
    statusChips(u));
}

export function doTarget(uid) {
  const t = ui.targeting;
  ui.targeting = null;
  if (!t) return act({ action: "combat", kind: "attack", target: uid });
  if (t.kind === "attack") return act({ action: "combat", kind: "attack", target: uid });
  if (t.kind === "ability") return act({ action: "combat", kind: "ability", ability: t.ability, target: uid });
  if (t.kind === "item") return act({ action: "combat", kind: "item", item: t.item, target: uid });
}

function startTargeting(kind, targets, extra = {}) {
  if (!targets.length) return;
  if (targets.length === 1) {
    ui.targeting = { kind, ...extra };
    return doTarget(targets[0]);
  }
  ui.targeting = { kind, targets, ...extra };
  render();
}

function useAbility(cb, ab) {
  if (!ab.usable) return;
  if (ab.target === "enemy") return startTargeting("ability", ab.targets, { ability: ab.id });
  ui.targeting = null;
  return act({ action: "combat", kind: "ability", ability: ab.id });
}

function useItem(cb, it) {
  if (it.target === "enemy") return startTargeting("item", cb.all_enemy_targets, { item: it.uid });
  return act({ action: "combat", kind: "item", item: it.uid });
}

export function combatScreen(state) {
  const cb = state.combat;
  const res = cb.result;
  const tgtSet = new Set(ui.targeting ? ui.targeting.targets : (cb.my_turn && !res ? cb.attack_targets : []));
  const enemies = cb.units.filter((u) => u.side === "enemy");
  const allies = cb.units.filter((u) => u.side !== "enemy");
  const front = enemies.filter((u) => u.row !== "back");
  const back = enemies.filter((u) => u.row === "back");
  const me = allies.find((u) => u.is_player);
  const friends = allies.filter((u) => !u.is_player);

  const field = h("div.field", null,
    h("div.enemy-rows", null,
      back.length ? [h("div.row-label", null, "Back row"), h("div.units", null, back.map((u) => unitCard(u, cb, tgtSet.has(u.uid) && u.alive, doTarget)))] : null,
      h("div.row-label", null, back.length ? "Front row" : "Enemies"),
      h("div.units", null, front.map((u) => unitCard(u, cb, tgtSet.has(u.uid) && u.alive, doTarget)))),
    h("hr.divider"),
    friends.length ? h("div.units", null, friends.map((u) => unitCard(u, cb, false))) : null,
    me ? h("div.unit.player-card" + (cb.current === me.uid ? ".current" : ""), null,
      h("div.row", null, h("span.uname", null, me.name), h("span.spacer"), h("span.ulvl", null, `Lv ${me.level}`)),
      bar("hp", me.hp, me.max_hp, `HP ${Math.max(0, me.hp)} / ${me.max_hp}`, true),
      me.barrier > 0 ? bar("barrier", me.barrier, me.max_hp, `Barrier ${me.barrier}`) : null,
      h("div.row", { style: { flexWrap: "nowrap", marginTop: ".25em" } },
        me.max_mp ? h("div", { style: { flex: 1 } }, bar("mp", me.mp, me.max_mp, `MP ${me.mp}/${me.max_mp}`)) : null,
        h("div", { style: { flex: 1 } }, bar("sp", me.sp, me.max_sp, `SP ${me.sp}/${me.max_sp}`))),
      statusChips(me)) : null);

  const log = h("div.panel.combat-log", { dataset: { scroll: "clog", stick: "bottom" } },
    cb.log.map((l) => h(`div.l.${l.k}`, null, l.t)));

  const screen = h("div.combat", null,
    h("div.combat-top", null, h("h2", null, cb.title), h("span.muted", null, `Round ${cb.round}`), h("span.spacer"),
      h("span.dim", { style: { fontSize: ".8em" } }, "Turn order:"), turnOrder(cb)),
    h("div.battlefield", null, field, log),
    actionBar(cb, cb.my_turn && !res));
  if (res) return h("div", null, screen, resultCard(res));
  return screen;
}

function turnOrder(cb) {
  return h("div.turn-order", null, cb.order.slice(0, 10).map((o, i) =>
    h(`span.${o.side}${i === 0 ? ".cur" : ""}`, null, o.name)));
}

function resultCard(res) {
  const victory = res.state === "victory";
  return h("div.overlay.result-overlay", null, h("div.panel.result-card" + (victory ? ".victory" : ""), null,
    h("h1", null, victory ? "Victory!" : "Escaped"),
    victory ? h("div", null,
      h("p", null, h("span", { style: { color: "var(--xp)" } }, `+${res.xp} XP`), "   ", h("span.gold-t", null, `+${res.gold} gold`)),
      res.items.length ? h("div", null, h("h4", null, "Loot"), res.items.map((it) => h(`div.r-${it.rarity}`, null, it.name))) : h("p.dim", null, "No loot.")) :
      h("p.muted", null, "You live to fight another day."),
    h("button.btn.big.primary", { onclick: () => act({ action: "combat_done" }), autofocus: true }, "Continue")));
}

// 3D battle HUD. The scene shows the fight; HP shown here follows the playback, not the (already
// resolved) snapshot, so the interface never spoils what the animation is about to show.
let idleLog = [];

export function combat3dScreen(state) {
  const cb = state.combat;
  const w = getWorld();
  const busy = !!w?.combatBusy;
  const res = cb.result;
  if (!busy) idleLog = cb.log;
  const shown = (u) => {
    const s = w?.combat.shown(u.uid);
    return s ? { ...u, hp: s.hp, barrier: s.barrier, alive: !s.dead } : u;
  };
  const tgtSet = new Set(!busy && !res ? (ui.targeting ? ui.targeting.targets : cb.my_turn ? cb.attack_targets : []) : []);
  const enemies = cb.units.filter((u) => u.side === "enemy").map(shown);
  const me = cb.units.find((u) => u.is_player);
  const friends = cb.units.filter((u) => u.side !== "enemy" && !u.is_player).map(shown);
  const m = me ? shown(me) : null;
  const playerCard = m ? h("div.unit.player-card" + (cb.current === m.uid && !busy ? ".current" : ""), null,
    h("div.row", null, h("span.uname", null, m.name), h("span.spacer"), h("span.ulvl", null, `Lv ${m.level}`)),
    bar("hp", m.hp, m.max_hp, `HP ${Math.max(0, m.hp)} / ${m.max_hp}`, true),
    m.barrier > 0 ? bar("barrier", m.barrier, m.max_hp, `Barrier ${m.barrier}`) : null,
    h("div.row", { style: { flexWrap: "nowrap", marginTop: ".25em" } },
      m.max_mp ? h("div", { style: { flex: 1 } }, bar("mp", m.mp, m.max_mp, `MP ${m.mp}/${m.max_mp}`)) : null,
      h("div", { style: { flex: 1 } }, bar("sp", m.sp, m.max_sp, `SP ${m.sp}/${m.max_sp}`))),
    statusChips(m)) : null;
  const screen = h("div.combat3d", null,
    h("div.combat-top", null, h("h2", null, cb.title), h("span.muted", null, `Round ${cb.round}`), h("span.spacer"),
      h("span.dim", { style: { fontSize: ".8em" } }, "Turn order:"), turnOrder(cb)),
    h("div.c3d-foes", null, enemies.filter((u) => u.alive).map((u) => unitCard(u, cb, tgtSet.has(u.uid), doTarget)),
      friends.filter((u) => u.alive).map((u) => unitCard(u, cb, false))),
    h("div.c3d-bottom", null,
      h("div.c3d-left", null, playerCard,
        h("div.panel.combat-log", { dataset: { scroll: "clog3d", stick: "bottom" } }, idleLog.slice(-40).map((l) => h(`div.l.${l.k}`, null, l.t)))),
      h("div.c3d-bar", null,
        busy ? h("div.target-hint.dim", null, "…") : !cb.my_turn && !res ? h("div.target-hint.dim", null, "Waiting…") : null,
        actionBar(cb, cb.my_turn && !res && !busy))));
  if (res && !busy) return h("div", null, screen, resultCard(res));
  return screen;
}

function actionBar(cb, enabled) {
  const abilityBtns = cb.abilities.map((ab, i) => h("button.btn.ab-btn" + (ui.targeting?.ability === ab.id ? ".sel" : ""), {
    disabled: !enabled || !ab.usable,
    onclick: () => useAbility(cb, ab),
    tip: () => h("div", null, h("b", null, ab.name), h("div", { style: { fontSize: ".88em", marginTop: ".2em" } }, ab.desc),
      h("div.tip-line", null, "Cost: ", costText(ab.cost), ab.cooldown ? ` · Cooldown ${ab.cooldown}` : "", ab.once ? " · Once per battle" : ""),
      h("div.tip-line", null, `Target: ${ab.target.replace("_", " ")}`),
      !ab.usable && ab.why ? h("div.bad", { style: { fontSize: ".85em" } }, ab.why) : null),
  }, ab.name, h("span.cost", null, costText(ab.cost)), ab.cd_left ? h("span.cd", null, `⟳${ab.cd_left}`) : null,
  i < 9 ? h("span.hk", null, String(i + 1)) : null));

  const items = cb.consumables.length ? h("div.abilities", null, h("span.muted", { style: { fontSize: ".85em", alignSelf: "center" } }, "Items:"),
    cb.consumables.map((it) => h("button.btn.small", { disabled: !enabled, onclick: () => useItem(cb, it), tip: it.desc || null },
      `${it.name}${it.qty > 1 ? ` ×${it.qty}` : ""}`))) : null;

  return h("div.actionbar", null,
    ui.targeting ? h("div.target-hint", null, "Choose a target (click a highlighted enemy) — Esc to cancel.",
      " ", h("button.btn.small", { onclick: () => { ui.targeting = null; render(); } }, "Cancel")) : null,
    h("div.abilities", null,
      h("button.btn.ab-btn" + (ui.targeting?.kind === "attack" ? ".sel" : ""), {
        disabled: !enabled || !cb.attack_targets.length, onclick: () => startTargeting("attack", cb.attack_targets),
        tip: "Basic weapon attack. Melee can only reach the front row while it stands. (A)",
      }, "⚔ Attack", h("span.cost", null, "free"), h("span.hk", null, "A")),
      abilityBtns,
      h("button.btn.ab-btn", { disabled: !enabled, onclick: () => act({ action: "combat", kind: "defend" }), tip: "Halve incoming damage until your next turn and recover some stamina and mana. (D)" },
        "🛡 Defend", h("span.cost", null, "recover"), h("span.hk", null, "D")),
      cb.flee_allowed ? h("button.btn.ab-btn", { disabled: !enabled, onclick: () => act({ action: "combat", kind: "flee" }), tip: "Try to escape. Chance depends on initiative." },
        "🏃 Flee", h("span.cost", null, "chance")) : null),
    items);
}

export function combatKey(e, state) {
  const cb = state.combat;
  if (!cb || getWorld()?.combatBusy) return;
  if (cb.result) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act({ action: "combat_done" }); }
    return;
  }
  if (!cb.my_turn) return;
  const k = e.key.toLowerCase();
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9 && cb.abilities[n - 1]) { e.preventDefault(); useAbility(cb, cb.abilities[n - 1]); }
  else if (k === "a" && cb.attack_targets.length) { e.preventDefault(); startTargeting("attack", cb.attack_targets); }
  else if (k === "d") { e.preventDefault(); act({ action: "combat", kind: "defend" }); }
}
