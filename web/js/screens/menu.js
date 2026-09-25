import { h, timeAgo } from "../util.js";
import { act, ui, render, confirmBox, getWorld, setInterface } from "../app.js";

const close = () => { ui.menu = null; render(); };
const go = (m) => { ui.menu = m; render(); };

export function menuOverlay(state) {
  const body = { main: mainMenu, save: saveMenu, load: loadMenu, settings: settingsMenu, help: helpMenu }[ui.menu](state);
  return h("div.overlay", { onclick: (e) => { if (e.target === e.currentTarget) close(); } },
    h("div.panel.modal", { style: { maxWidth: ui.menu === "main" ? "380px" : "760px" }, role: "dialog" },
      h("div.modal-head", null,
        ui.menu !== "main" && state.mode !== "title" ? h("button.icon-btn", { onclick: () => go("main") }, "◂") : null,
        h("h2", null, { main: "Menu", save: "Save Game", load: "Load Game", settings: "Settings", help: "How to Play" }[ui.menu]),
        h("span.spacer"), h("button.icon-btn", { onclick: close, "aria-label": "Close" }, "✕")),
      h("div.body", null, body)));
}

function mainMenu(state) {
  const canSave = ["explore", "shop"].includes(state.mode);
  return h("div.title-menu", { style: { minWidth: 0 } },
    h("button.btn.big", { onclick: close }, "Resume"),
    h("button.btn.big", { onclick: () => go("save"), disabled: !canSave, tip: canSave ? null : "You can only save while exploring." }, "Save Game"),
    h("button.btn.big", { onclick: () => go("load") }, "Load Game"),
    h("button.btn.big", { onclick: () => go("settings") }, "Settings"),
    h("button.btn.big", { onclick: () => go("help") }, "How to Play"),
    h("button.btn.big.danger", {
      onclick: () => confirmBox("Return to the title screen? Unsaved progress since your last save or autosave will be lost.",
        () => { ui.menu = null; act({ action: "title" }); }, "Quit to title"),
    }, "Quit to Title"));
}

function saveRow(s, actions) {
  return h("div.item-row", null,
    h("div.iname", null, s.corrupt ? h("span.bad", null, `${s.slot} — unreadable save`) :
      [h("b", null, s.slot === "auto" ? "Autosave" : s.slot), " · ", `${s.name}, Lv ${s.level} ${s.race} ${s.cls}`,
        h("div.dim", { style: { fontSize: ".8em" } }, `${s.location} · Day ${s.day} · Act ${s.act} · ${timeAgo(s.saved_at)}`)]),
    h("div.acts", null, actions));
}

function saveMenu(state) {
  const saves = state.saves || [];
  const manual = saves.filter((s) => s.slot !== "auto");
  const slots = ["slot1", "slot2", "slot3", "slot4", "slot5"];
  const doSave = (slot) => act({ action: "save", slot }).then((v) => { if (v && !v.error) { ui.menu = null; render(); } });
  return h("div", null,
    h("p.muted", { style: { marginTop: 0 } }, "Choose a slot. The game also autosaves when you rest, change region and finish the story."),
    h("div.items", null, slots.map((slot) => {
      const s = manual.find((x) => x.slot === slot);
      const save = () => (s ? confirmBox(`Overwrite ${slot} (${s.name}, level ${s.level})?`, () => doSave(slot), "Overwrite") : doSave(slot));
      return s ? saveRow(s, [h("button.btn.small.primary", { onclick: save, "aria-label": `Overwrite ${slot}` }, "Overwrite")])
        : h("div.item-row", null, h("div.iname.dim", null, `${slot} — empty`),
          h("div.acts", null, h("button.btn.small.primary", { onclick: save, "aria-label": `Save to ${slot}` }, "Save here")));
    })));
}

function loadMenu(state) {
  const saves = state.saves || [];
  if (!saves.length) return h("p.muted", null, "No saved games yet.");
  const inGame = state.mode !== "title";
  return h("div.items", null, saves.map((s) => saveRow(s, [
    s.corrupt ? null : h("button.btn.small.primary", {
      "aria-label": `Load ${s.slot}`,
      onclick: () => {
        const doLoad = () => act({ action: "load", slot: s.slot }).then((v) => { if (v && !v.error) { ui.menu = null; ui.panel = null; render(); } });
        if (inGame) confirmBox(`Load ${s.slot === "auto" ? "the autosave" : s.slot}? Unsaved progress will be lost.`, doLoad, "Load");
        else doLoad();
      },
    }, "Load"),
    h("button.btn.small.danger", { "aria-label": `Delete ${s.slot}`, onclick: () => confirmBox(`Delete save "${s.slot}" permanently?`, () => act({ action: "delete_save", slot: s.slot }), "Delete") }, "Delete"),
  ])));
}

function settingsMenu(state) {
  const s = state.settings || {};
  const set = (kv) => act({ action: "settings", ...kv });
  const opt = (label, cur, choices, key, tip) => h("div", { style: { marginBottom: "1em" } },
    h("h4", null, label), tip ? h("p.muted", { style: { fontSize: ".85em", margin: "0 0 .4em" } }, tip) : null,
    h("div.row", null, choices.map(([v, l]) => h("button.btn" + (cur === v ? ".primary" : ""), { onclick: () => set({ [key]: v }), "aria-pressed": String(cur === v) }, l))));
  return h("div", null,
    opt("Difficulty", s.difficulty || "normal", [["story", "Story"], ["normal", "Normal"], ["hard", "Hard"]], "difficulty",
      "Story: enemies hit much softer and your attacks land harder. Hard: foes hit 30% harder and take less damage, but you earn 15% more XP. You can change this at any time."),
    opt("Autosave", s.autosave !== false, [[true, "On"], [false, "Off"]], "autosave", "Autosaves go to the “auto” slot when you rest, change region or finish the act."),
    opt("Text size", s.text_scale || 1, [[0.9, "Small"], [1, "Normal"], [1.12, "Large"], [1.25, "Huge"]], "text_scale"),
    opt("Animations", s.anim !== false, [[true, "On"], [false, "Reduced"]], "anim"),
    opt("Sound", !!s.mute, [[false, "On"], [true, "Muted"]], "mute"),
    h("hr.divider"),
    h("div", { style: { marginBottom: "1em" } },
      h("h4", null, "Interface"),
      h("p.muted", { style: { fontSize: ".85em", margin: "0 0 .4em" } }, "The 3D view and the classic text interface play the same game and share saves. Switching reloads the page."),
      h("div.row", null,
        h("button.btn" + (getWorld() ? ".primary" : ""), { disabled: !!getWorld(), onclick: () => setInterface("3d") }, "3D"),
        h("button.btn" + (getWorld() ? "" : ".primary"), { disabled: !getWorld(), onclick: () => setInterface("text") }, "Text"))),
    getWorld() ? [
      opt("3D quality", s.quality || "medium", [["low", "Low"], ["medium", "Medium"], ["high", "High"]], "quality",
        "Low renders at a reduced resolution with fewer lights; High adds real-time shadows and more lights."),
      opt("Camera speed", Number(s.cam_speed) || 1, [[0.6, "Slow"], [1, "Normal"], [1.5, "Fast"]], "cam_speed"),
      opt("Invert camera Y", !!s.invert_y, [[false, "Off"], [true, "On"]], "invert_y"),
    ] : null);
}

function helpMenu() {
  const sec = (t, ...ps) => [h("h3", null, t), ...ps.map((p) => h("p", { style: { marginTop: 0 } }, p))];
  return h("div", null,
    getWorld()
      ? sec("Exploring in 3D", "Move with WASD or the arrow keys (hold Shift to walk slowly), or click the ground to walk there. Drag with the mouse to turn the camera and use the wheel to zoom. Walk up to people, objects, shops and beds and press E (or click them) to interact; walk through an open doorway to travel. Characters with a gold ! have something for you; a ? means they're waiting to hear from you. Press F to search the area for hidden things (once per level). The Chronicle bottom-left records everything that happens; click the place name to re-read its description.")
      : sec("Exploring", "Each location lists the people you can talk to, points of interest, actions and paths. Characters with a gold ! have something for you; a ? means they're waiting to hear from you. Search each area once per level for hidden things. The Chronicle on the right records everything that happens."),
    sec("Your homeland first", "You begin in your race's homeland. Its story ends with a threat to deal with; after that the roads open and you can travel between regions from any waystation."),
    sec("Combat", "Battles are turn-based. The turn order is shown at the top. Melee attacks can only reach the front row while it stands; ranged attacks and most spells reach anyone. Watch for ⚠ Charging warnings — interrupt them with stuns and bashes, or Defend to halve the damage. Bosses change phases as they weaken. Keys: A attack, D defend, 1–9 abilities, Esc cancels targeting."),
    sec("Growing stronger", "Every level gives attribute points (Character sheet) and skill points (Skills). Each class has three specializations; deeper tiers need a higher level and points spent in the same branch. Retrain at a trainer if you change your mind."),
    sec("Falling", "If you fall in battle you wake at the last place you rested, minus some gold. Nothing else is lost, so dust yourself off and try a different approach."),
    sec("Keyboard", `C Character · I Inventory · K Skills · J Quests · L Journal · H Achievements · Esc Menu/close · 1–9 dialogue choices.${getWorld() ? " In 3D: WASD move · Shift walk · E interact · F search · drag to look · wheel zoom. In combat, click an enemy or its card to target it." : ""}`));
}
