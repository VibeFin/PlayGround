import { h, cap, costText, bar, xpBar } from "../util.js";
import { act, ui, render, openPanel, confirmBox } from "../app.js";
import { itemName, itemTip, equippedFor } from "./items.js";

// A is strafe-left in the 3D view, so Achievements lives on H in both interfaces.
export const PANEL_KEYS = { c: "character", i: "inventory", k: "skills", j: "quests", l: "journal", h: "achievements" };
const TABS = [["character", "Character", "C"], ["inventory", "Inventory", "I"], ["skills", "Skills", "K"],
  ["quests", "Quests", "J"], ["journal", "Journal", "L"], ["achievements", "Achievements", "H"]];

export function panelOverlay(state) {
  const body = { character, inventory, skills, quests, journal, achievements }[ui.panel](state);
  return h("div.overlay", { onclick: (e) => { if (e.target === e.currentTarget) openPanel(null); } },
    h("div.panel.modal", { role: "dialog" },
      h("div.tabs", null, TABS.map(([id, label, key]) =>
        h("button.tab" + (ui.panel === id ? ".active" : ""), { onclick: () => { ui.panel = id; render(); } }, label, " ", h("kbd", null, key))),
        h("span.spacer"), h("button.icon-btn", { onclick: () => openPanel(null), "aria-label": "Close" }, "✕ Close")),
      h("div.body", { dataset: { scroll: "panel-" + ui.panel } }, body)));
}

// ------------------------------------------------------------------ character
function character(state) {
  const p = state.player;
  const attrs = Object.entries(p.attrs).map(([a, v]) => h("div.row", { style: { flexWrap: "nowrap" } },
    h("span", { style: { flex: 1 } }, v.name),
    h("b", { style: { width: "2.2em", textAlign: "right" } }, v.total),
    v.total !== v.base ? h("span.dim", { style: { fontSize: ".75em", width: "4.5em" } }, `(base ${v.base})`) : h("span", { style: { width: "4.5em" } }),
    p.attr_points ? h("button.btn.small", { onclick: () => act({ action: "spend_attr", attr: a }), tip: `Spend a point on ${v.name}` }, "+") : null));
  return h("div.char-grid", null,
    h("div", null,
      h("h2", null, p.name),
      h("p.muted", { style: { marginTop: 0 } }, `Level ${p.level} ${p.race_name} ${p.cls_name} · Act ${p.act}`),
      bar("hp", p.hp, p.max_hp, `HP ${p.hp}/${p.max_hp}`), h("div", { style: { height: ".3em" } }),
      p.max_mp ? bar("mp", p.mp, p.max_mp, `MP ${p.mp}/${p.max_mp}`) : null, h("div", { style: { height: ".3em" } }),
      bar("sp", p.sp, p.max_sp, `SP ${p.sp}/${p.max_sp}`), h("div", { style: { height: ".3em" } }),
      xpBar(p), h("p.muted", { style: { fontSize: ".8em", margin: ".2em 0 0" } }, `Total experience: ${p.xp}`),
      h("hr.divider"),
      h("h4", null, "Attributes", p.attr_points ? h("span.badge", null, `${p.attr_points} to spend`) : null),
      attrs,
      h("hr.divider"),
      h("h4", null, "Racial traits"),
      p.traits.map((t) => h("div.trait", null, h("b", null, t.name + ": "), t.desc)),
      h("div.trait.weak", null, h("b", null, `${p.weakness.name}: `), p.weakness.desc),
      p.class_trait ? [h("h4", { style: { marginTop: ".5em" } }, "Class trait"), h("div.trait", null, h("b", null, p.class_trait.name + ": "), p.class_trait.desc)] : null),
    h("div", null,
      h("h4", null, "Combat statistics"),
      h("div.kv", null, Object.entries(p.stats).flatMap(([k, v]) => [h("span", null, k), h("span", null, v)])),
      h("hr.divider"),
      h("h4", null, "Resistances"),
      h("div.kv", null, Object.entries(p.resists).flatMap(([k, v]) => [h("span", null, cap(k)), h("span" + (v > 0 ? ".good" : v < 0 ? ".bad" : ""), null, `${v}%`)]))),
    h("div", null,
      h("h4", null, "Abilities"),
      p.abilities.map((a) => h("div.skill", null,
        h("div.sk-head", null, h("span.sk-name", null, a.name), h("span.sk-meta", null, costText(a.cost), a.cooldown ? ` · cd ${a.cooldown}` : "")),
        h("div.sk-desc", null, a.desc))),
      h("hr.divider"),
      h("h4", null, "Deeds"),
      h("div.kv", null, [["Foes defeated", "kills"], ["Bosses slain", "bosses"], ["Critical hits", "crits"], ["Biggest hit", "max_hit"],
        ["Times fallen", "deaths"], ["Quests completed", "quests_completed"], ["Places found", "places"], ["Secrets found", "secrets"],
        ["Gold earned", "gold_earned"]].flatMap(([label, k]) => [h("span", null, label), h("span", null, state.counters[k] || 0)]))));
}

// ------------------------------------------------------------------ inventory
const FILTERS = [["all", "All"], ["gear", "Gear"], ["consumable", "Consumables"], ["key", "Quest items"]];

function inventory(state) {
  const inv = state.inventory;
  const shopping = state.mode === "shop";
  const canChange = state.mode === "explore" || shopping;
  const slots = Object.entries(inv.equipment).map(([slot, it]) => h(`div.slot${it ? `.rb-${it.rarity}` : ""}`, { tip: itemTip(it) },
    h("span.sname", null, inv.slot_names[slot]), h("span.iname", null, itemName(it)),
    it && canChange ? h("button.btn.small", { onclick: () => act({ action: "unequip", slot }) }, "Remove") : null));
  const f = ui.invFilter;
  const items = inv.items.filter((it) => f === "all" || (f === "gear" ? ["weapon", "armor", "offhand", "jewelry"].includes(it.kind) : it.kind === f));
  const rarOrder = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4, quest: 5 };
  items.sort((a, b) => (a.kind === b.kind ? 0 : a.kind < b.kind ? -1 : 1) || (rarOrder[a.rarity] - rarOrder[b.rarity]) || a.name.localeCompare(b.name));
  const rows = items.map((it) => {
    const gear = ["weapon", "armor", "offhand", "jewelry"].includes(it.kind);
    const acts = [];
    if (gear && canChange) {
      if (it.slot === "ring") {
        acts.push(h("button.btn.small", { onclick: () => act({ action: "equip", uid: it.uid, slot: "ring1" }) }, "Ring 1"));
        acts.push(h("button.btn.small", { onclick: () => act({ action: "equip", uid: it.uid, slot: "ring2" }) }, "Ring 2"));
      } else if (it.kind === "weapon" && it.hands !== 2 && state.player.cls === "rogue") {
        acts.push(h("button.btn.small", { onclick: () => act({ action: "equip", uid: it.uid, slot: "main_hand" }) }, "Main"));
        acts.push(h("button.btn.small", { onclick: () => act({ action: "equip", uid: it.uid, slot: "off_hand" }), tip: "Dual-wield in the off hand" }, "Off"));
      } else acts.push(h("button.btn.small", { onclick: () => act({ action: "equip", uid: it.uid }) }, "Equip"));
    }
    if ((it.kind === "consumable" && it.use !== "combat") || it.readable) {
      acts.push(h("button.btn.small", { disabled: !canChange, onclick: () => act({ action: "use_item", uid: it.uid }) }, it.readable ? "Read" : "Use"));
    }
    if (it.kind !== "key") {
      acts.push(h("button.btn.small.danger", {
        tip: "Discard", "aria-label": `Discard ${it.name}`, onclick: () => {
          const go = () => act({ action: "drop", uid: it.uid });
          if (["rare", "epic", "legendary"].includes(it.rarity) || it.qty > 1) confirmBox(`Discard ${it.name}${it.qty > 1 ? ` ×${it.qty}` : ""}?`, go, "Discard");
          else go();
        },
      }, "✕"));
    }
    return h(`div.item-row.rb-${it.rarity}`, { tip: itemTip(it, equippedFor(state, it)) },
      h("div.iname", null, itemName(it), it.level ? h("small", null, `ilvl ${it.level}`) : null, it.slot_name ? h("small", null, it.slot_name) : null),
      h("div.acts", null, acts));
  });
  return h("div.inv-layout", null,
    h("div", null, h("h4", null, "Equipped"), h("div.slots", null, slots),
      h("p.dim", { style: { fontSize: ".8em" } }, canChange ? "Hover an item to compare it with what you're wearing." : "You can't change equipment right now.")),
    h("div", null,
      h("div.row", null, h("h4", { style: { margin: 0 } }, `Pack (${inv.items.length})`), h("span.spacer"), h("span.gold-t", null, `⛁ ${state.player.gold}`)),
      h("div.filters", { style: { marginTop: ".4em" } }, FILTERS.map(([id, label]) =>
        h("button.btn.small" + (f === id ? ".primary" : ""), { onclick: () => { ui.invFilter = id; render(); } }, label))),
      h("div.items", null, rows.length ? rows : h("p.dim", null, "Nothing here."))));
}

// ------------------------------------------------------------------ skills
function skills(state) {
  const s = state.skills;
  return h("div", null,
    h("div.row", null, h("h2", { style: { margin: 0 } }, "Skill Trees"), h("span.spacer"),
      h("span" + (s.points ? ".gold-t" : ".muted"), null, `${s.points} skill point${s.points === 1 ? "" : "s"} available`)),
    h("p.muted", { style: { fontSize: ".85em" } },
      "Each tier needs a minimum level and a number of points already spent in that branch. Mix freely, or specialize to reach the powerful capstones.",
      s.can_respec ? "" : " You can retrain at a trainer (look for “Retrain skills” in towns)."),
    h("div.skill-branches", null, s.branches.map((b) => h("div.branch", null,
      h("h3", { style: { marginBottom: 0 } }, b.name, h("span.dim", { style: { fontSize: ".7em", marginLeft: ".5em" } }, `${b.points} pts`)),
      h("div.branch-desc", null, b.desc),
      b.nodes.map((n) => {
        const cls = ["div.skill", n.rank ? "learned" : "", n.rank >= n.max_rank ? "maxed" : "", n.can_learn ? "avail" : ""].filter(Boolean).join(".");
        return h(cls, null,
          h("div.sk-head", null,
            h("span.sk-name", null, n.name),
            h(`span.type-${n.type}`, null, n.type),
            h("span.pips", null, "●".repeat(n.rank) + "○".repeat(n.max_rank - n.rank))),
          h("div.sk-desc", null, n.desc),
          h("div.row", { style: { marginTop: ".25em" } },
            h("span.sk-meta", null, `Tier ${n.tier} · level ${n.req_level}${n.req_points ? ` · ${n.req_points} pts in branch` : ""}`,
              n.type === "active" ? [" · ", costText(n.cost), n.cooldown ? ` · cd ${n.cooldown}` : ""] : null),
            h("span.spacer"),
            n.rank < n.max_rank ? h("button.btn.small" + (n.can_learn ? ".primary" : ""), {
              disabled: !n.can_learn, onclick: () => act({ action: "learn", node: n.id }), tip: n.can_learn ? null : n.why,
              "aria-label": `${n.rank ? "Rank up" : "Learn"} ${n.name}`,
            }, n.rank ? "Rank up" : "Learn") : h("span.gold-t", { style: { fontSize: ".8em" } }, "Mastered")));
      })))));
}

// ------------------------------------------------------------------ quests
const QTYPE = { main: "Main quest", side: "Side quest", faction: "Faction", exploration: "Exploration", hidden: "Hidden" };

function quests(state) {
  const qs = state.quests || [];
  if (!qs.length) return h("p.muted", null, "No quests yet. Talk to people — everyone in this world has a problem.");
  const sel = qs.find((q) => q.id === ui.questSel) || qs[0];
  const groups = [["active", "Active"], ["completed", "Completed"], ["failed", "Failed"]];
  return h("div.quest-layout", null,
    h("div.quest-list", null, groups.map(([st, label]) => {
      const list = qs.filter((q) => q.state === st);
      if (!list.length) return null;
      return [h("h4", { style: { marginTop: ".5em" } }, `${label} (${list.length})`), list.map((q) =>
        h(`button.quest-item.${q.state}${q.id === sel.id ? ".sel" : ""}`, { onclick: () => { ui.questSel = q.id; render(); } },
          h(`div.qt.qt-${q.type}`, null, QTYPE[q.type] || q.type, q.tracked ? " · tracked" : ""), h("div", null, q.name)))];
    })),
    h("div", null,
      h(`div.qt.qt-${sel.type}`, { style: { fontSize: ".8em", textTransform: "uppercase", letterSpacing: ".1em" } }, QTYPE[sel.type] || sel.type,
        sel.level ? ` · suggested level ${sel.level}` : ""),
      h("h2", null, sel.name),
      sel.summary ? h("p.muted", { style: { fontStyle: "italic" } }, sel.summary) : null,
      h("p", null, sel.state === "completed" ? "Completed." : sel.state === "failed" ? "This quest can no longer be completed." : sel.desc),
      sel.objectives?.length ? [h("h4", null, "Objectives"), sel.objectives.map((o) =>
        h("div.obj" + (o.done ? ".done" : "") + (o.optional ? ".optional" : ""), null, o.text + (o.optional ? " (optional)" : "")))] : null,
      sel.state === "active" ? h("button.btn.small", { style: { marginTop: ".6em" }, disabled: sel.tracked, onclick: () => act({ action: "track", quest: sel.id }) },
        sel.tracked ? "Tracked" : "Track this quest") : null,
      sel.journal?.length ? [h("hr.divider"), h("h4", null, "Journal"), sel.journal.map((j) => h("p", { style: { fontSize: ".9em", margin: ".3em 0" } }, "— ", typeof j === "string" ? j : j.text))] : null));
}

// ------------------------------------------------------------------ journal
function journal(state) {
  const lore = state.journal || [];
  const sel = lore.find((l) => l.id === ui.journalSel) || lore[lore.length - 1];
  return h("div.quest-layout", null,
    h("div.quest-list", null,
      h("h4", null, `Lore (${lore.length})`),
      lore.length ? lore.map((l) => h("button.quest-item" + (sel && l.id === sel.id ? ".sel" : ""), { onclick: () => { ui.journalSel = l.id; render(); } }, l.title))
        : h("p.dim", null, "Read books, inscriptions and letters to fill your journal."),
      h("h4", { style: { marginTop: "1em" } }, "Reputation"),
      state.reputation.length ? state.reputation.map((r) => h("div.quest-item", { tip: r.desc },
        h("div.row", null, h("span", null, r.name), h("span.spacer"), h("span" + (r.value > 0 ? ".good" : r.value < 0 ? ".bad" : ".muted"), null, `${r.tier} (${r.value > 0 ? "+" : ""}${r.value})`))))
        : h("p.dim", null, "You haven't made a name for yourself with any faction yet.")),
    h("div", null, sel ? [h("h2", null, sel.title), h("div.desc", null, sel.text)] : h("p.muted", null, "Your journal is empty.")));
}

// ------------------------------------------------------------------ achievements
const ACH_ICON = ["🏆", "⚔", "🗝", "📜", "💰", "🔥", "🌿", "⛏", "✨", "🎭"];

function achievements(state) {
  const a = state.achievements;
  const list = [...a.list].sort((x, y) => (y.unlocked - x.unlocked) || (x.unlocked ? x.order - y.order : 0));
  return h("div", null,
    h("div.row", null, h("h2", { style: { margin: 0 } }, "Achievements"), h("span.spacer"), h("span.gold-t", null, `${a.unlocked} / ${a.total} unlocked`)),
    h("div", { style: { margin: ".5em 0 1em" } }, bar("xp", a.unlocked, a.total, `${Math.round((a.unlocked / Math.max(1, a.total)) * 100)}%`)),
    h("div.ach-grid", null, list.map((x, i) => h("div.ach" + (x.unlocked ? ".on" : ""), null,
      h("div.ico", null, x.unlocked ? ACH_ICON[hash(x.id) % ACH_ICON.length] : "🔒"),
      h("div", null, h("div.an", null, x.name), h("div.ad", null, x.desc))))));
}

function hash(s) { let n = 0; for (const c of s) n = (n * 31 + c.charCodeAt(0)) >>> 0; return n; }
