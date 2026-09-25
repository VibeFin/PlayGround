import { h, bar, xpBar } from "../util.js";
import { act, ui, openPanel, openMenu, render, getWorld } from "../app.js";

export function topbar(state) {
  const p = state.player;
  const navBtn = (key, label, panel, badge) => h("button.icon-btn", { onclick: () => openPanel(panel), tip: `${label} (${key})` },
    label, badge ? h("span.badge", null, badge) : null);
  const nq = (state.quests || []).filter((q) => q.state === "active").length;
  return h("div.topbar", null,
    h("div.who", null, p.name, " ", h("small", null, `Lv ${p.level} ${p.race_name} ${p.cls_name}`)),
    h("div.bars", null,
      h("div", { tip: "Health" }, bar("hp", p.hp, p.max_hp, `HP ${p.hp}/${p.max_hp}`)),
      p.max_mp ? h("div", { tip: "Mana" }, bar("mp", p.mp, p.max_mp, `MP ${p.mp}/${p.max_mp}`)) : h("div"),
      h("div", { tip: "Stamina" }, bar("sp", p.sp, p.max_sp, `SP ${p.sp}/${p.max_sp}`)),
      h("div", { tip: p.xp_next > p.xp ? `${p.xp_next - p.xp} XP to level ${p.level + 1} (total ${p.xp})` : "Maximum level" },
        xpBar(p))),
    h("span.stat.gold-t", { tip: "Gold" }, `⛁ ${p.gold}`),
    h("span.stat", { tip: "Days since your journey began" }, `Day ${p.day}`),
    h("nav.nav", null,
      navBtn("C", "Character", "character", p.attr_points || null),
      navBtn("I", "Inventory", "inventory"),
      navBtn("K", "Skills", "skills", p.skill_points || null),
      navBtn("J", "Quests", "quests", nq || null),
      navBtn("L", "Journal", "journal"),
      navBtn("H", "Achievements", "achievements"),
      h("button.icon-btn", { onclick: () => openMenu("main"), tip: "Menu (Esc)" }, "☰ Menu")));
}

export function exploreScreen(state) {
  const loc = state.location;
  if (!loc) return h("div.loading", null, "…");
  const exploring = state.mode === "explore";
  return h("div.game", null,
    topbar(state),
    h("div.main", null,
      h("div.col", { dataset: { scroll: "loc" } },
        h(`div.loc-head.biome-${loc.biome}`, null,
          loc.danger ? h("span.danger", { tip: "Recommended level" }, `Danger: ${loc.danger}`) : null,
          h("div.region", null, loc.region_name || ""),
          h("h1", null, loc.name)),
        h("div.panel", null, h("div.desc", null, loc.desc)),
        sceneBox(loc.scene_text),
        actionsPanel(state, loc, exploring)),
      h("div.col", null,
        trackedPanel(state),
        h("div.panel", { style: { flex: 1, minHeight: "200px", display: "flex", flexDirection: "column" } },
          h("h4", null, "Chronicle"),
          h("div.log", { dataset: { scroll: "log", stick: "bottom" }, style: { overflowY: "auto", flex: 1, minHeight: 0 } },
            (state.messages || []).map((m) => h(`div.m.${m.k}`, null, m.t)))))));
}

let lastScene = null;

function sceneBox(text) {
  const same = text === lastScene;
  lastScene = text;
  return text ? h("div.scene" + (same ? ".stay" : ""), null, text) : null;
}

function actionsPanel(state, loc, enabled) {
  const sections = [];
  if (loc.npcs.length) {
    sections.push(h("div", null, h("h4", null, "People here"),
      h("div.action-grid", null, loc.npcs.map((n) =>
        h("button.btn.npc-btn", { disabled: !enabled, onclick: () => act({ action: "talk", npc: n.id }),
          tip: n.marker === "!" ? "Has something for you" : n.marker === "?" ? "Wants to hear from you" : null },
          n.marker ? h("span.marker", null, n.marker) : null, `Talk to ${n.name}`, n.title ? h("span.sub", null, n.title) : null)))));
  }
  if (loc.features.length) {
    sections.push(h("div", null, h("h4", null, "Points of interest"),
      h("div.action-grid", null, loc.features.map((f) =>
        h("div.feature", null,
          h("div.fname", null, f.name),
          f.desc ? h("div.fdesc", null, f.desc) : null,
          h("div.row", null, f.actions.length
            ? f.actions.map((a) => h("button.btn.small", { disabled: !enabled, onclick: () => act({ action: "interact", feature: f.id, index: a.index }) }, a.label))
            : h("span.dim", { style: { fontSize: ".8em" } }, "Nothing more to do here.")))))));
  }
  const place = [];
  if (loc.shop) place.push(h("button.btn", { disabled: !enabled, onclick: () => act({ action: "shop", shop: loc.shop }) }, `🛒 ${loc.shop_name}`));
  if (loc.rest) {
    const label = loc.rest === "inn" ? `🛏 Rest at the inn (${loc.rest_cost} gold)` : loc.rest === "camp" ? "🔥 Make camp" : "🛏 Rest";
    const tip = loc.rest === "camp" ? "Fully restores you, but a campfire can draw unwelcome attention." :
      loc.rest === "inn" ? "Fully restores you and passes a day. Your respawn point moves here." : "Fully restores you and passes a day.";
    place.push(h("button.btn", { disabled: !enabled, onclick: () => act({ action: "rest" }), tip }, label));
  }
  place.push(h("button.btn", {
    disabled: !enabled || !loc.can_search, onclick: () => act({ action: "search" }),
    tip: loc.can_search ? "Search for hidden things (Perception). Once per location per level." : "Already searched here at this level.",
  }, "🔍 Search the area", loc.searchable_hint ? h("span.sub", { style: { color: "var(--aether)" } }, "Something feels hidden here…") : null));
  if (loc.respec) {
    place.push(h("button.btn", {
      disabled: !enabled, tip: `Unlearn all skills and refund the points (${state.skills.respec_cost} gold).`,
      onclick: () => act({ action: "respec" }),
    }, `↺ Retrain skills (${state.skills.respec_cost} gold)`));
  }
  sections.push(h("div", null, h("h4", null, "Actions"), h("div.action-grid", null, place)));

  if (loc.exits.length) {
    sections.push(h("div", null, h("h4", null, "Paths"),
      h("div.action-grid", null, loc.exits.map((e) =>
        h("button.btn.exit-btn" + (e.visited ? ".visited" : "") + (e.locked ? ".locked" : ""), {
          disabled: !enabled, tip: e.locked ? e.locked_text || "Locked" : (e.visited ? "Visited" : "Unexplored"),
          onclick: () => act({ action: "move", to: e.to }),
        }, e.locked ? "🔒 " : "➜ ", e.label, e.locked && e.locked_text ? h("span.sub", null, e.locked_text) : null)))));
  }
  if (loc.can_travel) {
    sections.push(h("div", null, h("h4", null, "Travel"),
      loc.world_open && loc.travel.length
        ? h("div.action-grid", null, loc.travel.map((t) =>
          h("button.btn", { disabled: !enabled, onclick: () => act({ action: "travel", dest: t.id }), tip: t.desc || null },
            `🗺 ${t.name}`, h("span.sub", null, `${t.days} day${t.days > 1 ? "s" : ""}${t.level ? ` · level ${t.level}` : ""}`))))
        : h("p.muted", { style: { fontSize: ".9em" } }, loc.world_open ? "No other destinations known yet."
          : "The roads beyond your homeland are closed for now. Your story here must come first.")));
  }
  return h("div.panel", null, sections.map((s, i) => [i ? h("hr.divider") : null, s]));
}

// 3D exploration HUD: the world is the main view; these panels float over it.
const hud = { descFor: null, descAt: 0, descOpen: false, sceneClosed: null, logOpen: false };
const DESC_SECONDS = 14;

export function explore3dScreen(state) {
  const loc = state.location;
  if (!loc) return h("div.hud3d", null, h("div.loading", null, "…"));
  const exploring = state.mode === "explore";
  if (hud.descFor !== loc.id) { hud.descFor = loc.id; hud.descAt = performance.now(); hud.descOpen = false; }
  const elapsed = (performance.now() - hud.descAt) / 1000;
  let card = null;
  if (loc.scene_text && hud.sceneClosed !== loc.scene_text) {
    card = h("div.hud-card.scene" + (loc.scene_text === lastScene ? ".stay" : ""), null,
      h("button.icon-btn.close", { onclick: () => { hud.sceneClosed = loc.scene_text; render(); }, "aria-label": "Dismiss" }, "✕"),
      h("div.desc", null, loc.scene_text));
    lastScene = loc.scene_text;
  } else if (hud.descOpen || elapsed < DESC_SECONDS) {
    card = h("div.hud-card.locdesc" + (hud.descOpen ? "" : ".ephemeral"), { style: hud.descOpen ? null : { animationDelay: `${(DESC_SECONDS - 2 - elapsed).toFixed(2)}s` } },
      h("button.icon-btn.close", { onclick: () => { hud.descOpen = false; hud.descAt = 0; render(); }, "aria-label": "Dismiss" }, "✕"),
      h("div.desc", null, loc.desc));
  }
  const msgs = state.messages || [];
  const recent = hud.logOpen ? msgs : msgs.slice(-5);
  return h("div.hud3d", null,
    topbar(state),
    h("div.hud-loc", { onclick: () => { hud.descOpen = !hud.descOpen; hud.descAt = performance.now(); render(); }, tip: "Show the description of this place" },
      h("div.region", null, loc.region_name || ""),
      h("h1", null, loc.name),
      loc.danger ? h("span.danger", { tip: "Recommended level" }, `Danger: ${loc.danger}`) : null),
    h("div.hud-right", null, trackedPanel(state)),
    h("div.hud-log" + (hud.logOpen ? ".open" : ""), null,
      h("div.row", null, h("h4", null, "Chronicle"), h("span.spacer"),
        h("button.icon-btn", { onclick: () => { hud.logOpen = !hud.logOpen; render(); } }, hud.logOpen ? "▾ Less" : "▴ More")),
      h("div.log", { dataset: { scroll: hud.logOpen ? "log3d-open" : "log3d", stick: "bottom" } }, recent.map((m) => h(`div.m.${m.k}`, null, m.t)))),
    card,
    h("div.hud-actions", null,
      h("button.btn", {
        disabled: !exploring || !loc.can_search, onclick: () => getWorld()?.search(),
        tip: loc.can_search ? "Search for hidden things (Perception). Once per location per level." : "Already searched here at this level.",
      }, "🔍 Search ", h("span.hk", null, "F"), loc.searchable_hint ? h("span.sub", { style: { color: "var(--aether)" } }, "Something feels hidden here…") : null),
      h("div.hint.dim", null, "WASD move · drag to look · wheel zoom · E interact · click to walk")));
}

function trackedPanel(state) {
  const q = state.tracked || (state.quests || []).find((x) => x.state === "active" && x.type === "main");
  if (!q) return h("div.panel.tracked", null, h("h4", null, "Current goal"), h("p.muted", null, "Explore, and talk to the people around you."));
  return h("div.panel.tracked", { style: { cursor: "pointer" }, onclick: () => { ui.questSel = q.id; openPanel("quests"); } },
    h("h4", null, q.tracked ? "Tracked quest" : "Main quest"),
    h("div", { style: { fontWeight: "bold", color: "var(--gold)" } }, q.name),
    h("div.muted", { style: { fontSize: ".88em", margin: ".2em 0 .4em" } }, q.desc),
    (q.objectives || []).map((o) => h("div.obj" + (o.done ? ".done" : "") + (o.optional ? ".optional" : ""), null,
      o.text + (o.optional ? " (optional)" : ""))));
}
