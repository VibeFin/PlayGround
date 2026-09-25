// Developer panel. Only reachable when the server runs with --dev (the view then carries
// state.dev and state.debug); every button goes through the engine's debug_* actions.
import { h } from "./util.js";
import { act, getWorld, getState } from "./app.js";

const dev = { open: false, tab: "world", loc: "", enc: "", quest: "", stage: "", flag: "", level: 5, xp: 500, filter: "", peaceful: false };

export function toggleDev() {
  dev.open = !dev.open;
  renderDev(getState());
}

function root() {
  let el = document.getElementById("dev-root");
  if (!el) {
    el = document.createElement("div");
    el.id = "dev-root";
    document.body.appendChild(el);
  }
  return el;
}

const sel = (value, options, onchange) => h("select", { onchange: (e) => onchange(e.target.value) },
  options.map(([v, label]) => h("option", { value: v, selected: v === value ? "selected" : null }, label)));

const inp = (value, onchange, attrs = {}) => h("input", { value, oninput: (e) => onchange(e.target.value), ...attrs });

function toggle(label, key) {
  const w = getWorld();
  if (!w) return null;
  return h("label.dev-toggle", null,
    h("input", { type: "checkbox", checked: w.debug[key] ? "checked" : null, onchange: (e) => { w.setDebug(key, e.target.checked); } }),
    " ", label);
}

export function renderDev(state) {
  const el = root();
  if (!state?.dev || !dev.open) { el.replaceChildren(); return; }
  const d = state.debug || {};
  const locs = d.locations || [];
  if (!dev.loc && locs.length) dev.loc = state.location?.id || locs[0].id;
  if (!dev.enc && d.encounters?.length) dev.enc = d.encounters[0];
  const quests = Object.keys(d.quests || {});
  if (!dev.quest && quests.length) dev.quest = quests[0];
  const inGame = !!state.player;
  const exploring = state.mode === "explore";
  const w = getWorld();
  const tabs = [["world", "World"], ["player", "Player"], ["state", "State"]];

  const body = {
    world: () => h("div", null,
      h("div.dev-row", null, h("span", null, "Teleport"),
        sel(dev.loc, locs.map((l) => [l.id, `${l.region} · ${l.name}`]), (v) => { dev.loc = v; }),
        h("button.btn.small", { disabled: !inGame || state.mode === "combat", onclick: () => act({ action: "debug_teleport", to: dev.loc, peaceful: dev.peaceful ? 1 : 0 }) }, "Go"),
        h("label.dev-toggle", { title: "Skip the arrival fight at the destination" },
          h("input", { type: "checkbox", checked: dev.peaceful ? "checked" : null, onchange: (e) => { dev.peaceful = e.target.checked; } }), " peaceful")),
      h("div.dev-row", null, h("span", null, "Encounter"),
        sel(dev.enc, (d.encounters || []).map((e) => [e, e]), (v) => { dev.enc = v; }),
        h("button.btn.small", { disabled: !exploring, onclick: () => act({ action: "debug_encounter", enc: dev.enc }) }, "Fight")),
      h("div.dev-row", null,
        h("button.btn.small", { disabled: !exploring, onclick: () => act({ action: "debug_reset_location" }), title: "Forget cleared fights and one-shot interactions here, then re-enter" }, "Reset location"),
        h("button.btn.small", { disabled: state.mode !== "combat", onclick: () => act({ action: "debug_end_combat" }), title: "Abandon the fight with no rewards" }, "End fight"),
        w ? h("button.btn.small", { onclick: () => { const s = w.room?.spawnFor(state.location?.prev_location, null); if (s) w.player.place(s.x, s.z, s.yaw); } }, "Unstick (respawn)") : null),
      w ? h("div.dev-row", null, toggle("Colliders", "colliders"), toggle("Anchors", "anchors"), toggle("Render stats", "stats")) : null,
      w?.room ? h("div.dim.dev-small", null,
        `room ${w.room.loc} · kit ${w.room.kit?.name || "?"} · ${w.room.layout.authored ? "authored" : "procedural"} layout · `,
        `pos ${w.player.pos.x.toFixed(2)}, ${w.player.pos.z.toFixed(2)}`) : null),
    player: () => h("div", null,
      h("div.dev-row", null, h("span", null, "Level"), inp(dev.level, (v) => { dev.level = v; }, { type: "number", min: 1, max: 20, style: { width: "4em" } }),
        h("button.btn.small", { disabled: !inGame, onclick: () => act({ action: "debug_level", level: Number(dev.level) }) }, "Set")),
      h("div.dev-row", null, h("span", null, "XP"), inp(dev.xp, (v) => { dev.xp = v; }, { type: "number", min: 0, style: { width: "6em" } }),
        h("button.btn.small", { disabled: !inGame, onclick: () => act({ action: "debug_xp", amount: Number(dev.xp) }) }, "Grant")),
      h("div.dev-row", null, h("button.btn.small", { disabled: !inGame, onclick: () => act({ action: "debug_heal" }) }, "Full heal")),
      h("div.dev-row", null, h("span", null, "Quest"),
        sel(dev.quest, quests.map((q) => [q, `${q} (${d.quests[q].state}${d.quests[q].stage ? ` · ${d.quests[q].stage}` : ""})`]), (v) => { dev.quest = v; renderDev(getState()); }),
        inp(dev.stage, (v) => { dev.stage = v; }, { placeholder: "stage (optional)", style: { width: "9em" } }),
        h("button.btn.small", { disabled: !inGame, onclick: () => act({ action: "debug_quest", quest: dev.quest, stage: dev.stage || null }) }, "Start/Set")),
      h("div.dev-row", null, h("span", null, "Flag"), inp(dev.flag, (v) => { dev.flag = v; }, { placeholder: "flag id", style: { width: "10em" } }),
        h("button.btn.small", { disabled: !inGame || !dev.flag, onclick: () => act({ action: "debug_flag", flag: dev.flag, on: 1 }) }, "Set"),
        h("button.btn.small", { disabled: !inGame || !dev.flag, onclick: () => act({ action: "debug_flag", flag: dev.flag, on: 0 }) }, "Clear"))),
    state: () => {
      const snapshot = { mode: state.mode, location: d.location, prev_location: d.prev_location, scene_pos: d.scene_pos,
        flags: d.flags, counters: d.counters, cleared: d.cleared,
        active_quests: Object.fromEntries(Object.entries(d.quests || {}).filter(([, q]) => q.state === "active")) };
      let text = JSON.stringify(snapshot, null, 1);
      if (dev.filter) text = text.split("\n").filter((l) => l.toLowerCase().includes(dev.filter.toLowerCase())).join("\n");
      return h("div", null,
        inp(dev.filter, (v) => { dev.filter = v; renderDev(getState()); }, { placeholder: "filter…", style: { width: "100%" } }),
        h("pre.dev-pre", null, text));
    },
  }[dev.tab]();

  el.replaceChildren(h("div.dev-panel.panel", null,
    h("div.row", null, h("b", null, "Dev tools"), h("span.spacer"), h("span.dim.dev-small", null, "` to close"),
      h("button.icon-btn", { onclick: toggleDev, "aria-label": "Close" }, "✕")),
    h("div.tabs", null, tabs.map(([id, label]) =>
      h("button.tab" + (dev.tab === id ? ".active" : ""), { onclick: () => { dev.tab = id; renderDev(getState()); } }, label))),
    body));
}
