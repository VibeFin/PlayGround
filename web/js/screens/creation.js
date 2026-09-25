import { h } from "../util.js";
import { act, ui, render, confirmBox } from "../app.js";

const ATTRS = ["str", "dex", "con", "int", "wis", "cha"];
const ATTR_HINT = {
  str: "Melee damage with heavy weapons, carrying the day in a brawl.",
  dex: "Finesse and ranged damage, dodge, initiative, critical hits.",
  con: "Health and stamina; resistance to poison and bleeding.",
  int: "Spell power and mana; arcane lore checks.",
  wis: "Mana regeneration, healing power, perception and insight.",
  cha: "Persuasion, prices, and some very specific achievements.",
};
const NAMES = {
  human: ["Aldric", "Maren", "Tobin", "Elsbeth", "Corwin", "Ysolde"],
  elf: ["Faelar", "Sylwen", "Ithrandil", "Lirael", "Caelith", "Naeris"],
  dwarf: ["Brokk", "Hilde", "Durgan", "Ketta", "Thrain", "Orla"],
};

function cstate(c) {
  if (!ui.creation) {
    ui.creation = { name: "", race: "human", cls: "fighter", alloc: Object.fromEntries(ATTRS.map((a) => [a, 0])) };
  }
  return ui.creation;
}

function spent(cs) { return ATTRS.reduce((s, a) => s + cs.alloc[a], 0); }

export function creationScreen(state) {
  const c = state.creation;
  const cs = cstate(c);
  const race = c.races[cs.race];
  const klass = c.classes[cs.cls];
  const base = c.start_attrs[`${cs.race}:${cs.cls}`];
  const points = race.points;
  const left = points - spent(cs);

  const setRace = (r) => { cs.race = r; resetAlloc(cs, c); render(); };
  const setCls = (k) => { cs.cls = k; resetAlloc(cs, c); render(); };

  const raceCards = h("div.choice-cards", null, Object.entries(c.races).map(([rid, r]) =>
    h("button.choice-card" + (cs.race === rid ? ".sel" : ""), { onclick: () => setRace(rid) },
      h("h3", null, r.name), h("div.muted", { style: { fontSize: ".8em" } }, `Homeland: ${r.home}`),
      h("div.blurb", null, r.blurb))));
  const clsCards = h("div.choice-cards", null, Object.entries(c.classes).map(([cid, k]) =>
    h("button.choice-card" + (cs.cls === cid ? ".sel" : ""), { onclick: () => setCls(cid) },
      h("h3", null, k.name), h("div.blurb", null, k.blurb))));

  const raceDetail = h("div", null,
    h("h4", null, `${race.name} traits`),
    race.traits.map((t) => h("div.trait", null, h("b", null, t.name + ": "), t.desc)),
    h("div.trait.weak", null, h("b", null, `Weakness — ${race.weakness.name}: `), race.weakness.desc),
    h("div.trait", null, h("b", null, `Racial ability — ${race.ability.name}: `), race.ability.desc),
    h("div.trait.muted", null, "Attribute modifiers: ",
      Object.entries(race.attr_mods).map(([a, v]) => `${a.toUpperCase()} ${v > 0 ? "+" : ""}${v}`).join(", ")));
  const clsDetail = h("div", null,
    h("h4", null, `${klass.name}`),
    h("div.trait.muted", null, `Base health ${klass.hp} · mana ${klass.mp} · stamina ${klass.sp}`),
    klass.trait ? h("div.trait", null, h("b", null, `Class trait — ${klass.trait.name}: `), klass.trait.desc) : null,
    h("h4", { style: { marginTop: ".6em" } }, "Starting abilities"),
    klass.abilities.map((a) => h("div.trait", null, h("b", null, a.name + ": "), a.desc)),
    h("h4", { style: { marginTop: ".6em" } }, "Specializations"),
    klass.branches.map((b) => h("div.trait", null, h("b", null, b.name + ": "), b.desc)));

  const attrRows = ATTRS.map((a) => {
    const val = base[a] + cs.alloc[a];
    const canUp = left > 0 && val < c.max_attr;
    return h("tr", null,
      h("td", { tip: ATTR_HINT[a] }, h("b", null, c.attr_names[a]), h("div.dim", { style: { fontSize: ".75em" } }, ATTR_HINT[a])),
      h("td", null, h("button.btn.small", { disabled: cs.alloc[a] <= 0, onclick: () => { cs.alloc[a]--; render(); }, "aria-label": `Lower ${a}` }, "−")),
      h("td.num" + (cs.alloc[a] ? ".good" : ""), null, val),
      h("td", null, h("button.btn.small", { disabled: !canUp, onclick: () => { cs.alloc[a]++; render(); }, "aria-label": `Raise ${a}` }, "+")),
      h("td.dim", { style: { fontSize: ".8em" } }, mod(val)));
  });

  const nameInput = h("input.name-input", {
    value: cs.name, maxlength: 24, placeholder: "Name your hero…", "aria-label": "Character name",
    oninput: (e) => {
      cs.name = e.target.value;
      beginBtn.disabled = !cs.name.trim();
      summaryName.textContent = cs.name.trim() || "An unnamed hero";
    },
    onkeydown: (e) => { if (e.key === "Enter" && cs.name.trim()) begin(); },
  });
  const summaryName = h("b", null, cs.name.trim() || "An unnamed hero");
  const begin = () => {
    const go = () => act({ action: "create", name: cs.name.trim(), race: cs.race, cls: cs.cls, alloc: cs.alloc })
      .then((v) => { if (v && v.mode !== "create") ui.creation = null; });
    if (left > 0) confirmBox(`You still have ${left} unspent attribute point${left > 1 ? "s" : ""}. They'll carry over and can be spent later from the Character sheet. Begin anyway?`, go, "Begin");
    else go();
  };
  const beginBtn = h("button.btn.big.primary", { disabled: !cs.name.trim(), onclick: begin }, `Begin in ${race.home} ▸`);

  return h("div.screen-scroll", null, h("div.creation", null,
    h("div.row", null,
      h("h2", { style: { fontSize: "1.8em", margin: 0 } }, "Forge Your Hero"),
      h("div.spacer"),
      h("button.btn", { onclick: () => { ui.creation = null; act({ action: "title" }); } }, "◂ Back to title")),
    h("div.creation-grid", null,
      h("div.panel", null, h("h3", null, "1 · Choose a race"), raceCards, h("hr.divider"), raceDetail),
      h("div.panel", null, h("h3", null, "2 · Choose a class"), clsCards, h("hr.divider"), clsDetail)),
    h("div.creation-grid", null,
      h("div.panel", null,
        h("div.row", null, h("h3", { style: { margin: 0 } }, "3 · Attributes"), h("div.spacer"),
          h("span" + (left ? ".gold-t" : ".muted"), null, `${left} of ${points} points left`),
          h("button.btn.small", { onclick: () => { resetAlloc(cs, c); render(); } }, "Reset"),
          h("button.btn.small", { onclick: () => { autoAlloc(cs, c); render(); } }, "Suggested")),
        h("p.muted", { style: { fontSize: ".85em" } }, `Starting values come from your race and class. No attribute may exceed ${c.max_attr} at creation.`),
        h("table.attr-table", null, h("tbody", null, attrRows))),
      h("div.panel", null,
        h("h3", null, "4 · Name"),
        h("div.row", { style: { flexWrap: "nowrap" } }, nameInput,
          h("button.btn", { tip: "Random name", onclick: () => { const l = NAMES[cs.race]; cs.name = l[Math.floor(Math.random() * l.length)]; render(); } }, "🎲")),
        h("hr.divider"),
        h("h4", null, "Summary"),
        h("p", null, summaryName, `, ${race.name} ${klass.name}. `,
          `Your tale begins in ${race.home}.`),
        h("p.muted", { style: { fontSize: ".85em" } }, "Every race and class combination is fully playable. Your homeland decides your first chapter; the roads converge later."),
        h("div.row", { style: { justifyContent: "flex-end" } }, beginBtn)))));
}

function mod(v) {
  const m = Math.floor((v - 10) / 2);
  return `mod ${m >= 0 ? "+" : ""}${m}`;
}

function resetAlloc(cs) { cs.alloc = Object.fromEntries(ATTRS.map((a) => [a, 0])); }

function autoAlloc(cs, c) {
  resetAlloc(cs);
  const main = { fighter: ["str", "con", "dex"], mage: ["int", "wis", "con"], rogue: ["dex", "con", "cha"] }[cs.cls];
  const base = c.start_attrs[`${cs.race}:${cs.cls}`];
  let left = c.races[cs.race].points;
  let i = 0, guard = 0;
  while (left > 0 && guard++ < 100) {
    const a = main[i % main.length];
    const weight = i % main.length === 0 ? 2 : 1;
    for (let k = 0; k < weight && left > 0; k++) {
      if (base[a] + cs.alloc[a] < c.max_attr) { cs.alloc[a]++; left--; }
    }
    i++;
  }
}