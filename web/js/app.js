import { api } from "./api.js";
import { h, toast, achievementToast, flashLevelUp, hideTip, tipOwnerGone } from "./util.js";
import { titleScreen } from "./screens/title.js";
import { creationScreen } from "./screens/creation.js";
import { exploreScreen, explore3dScreen } from "./screens/explore.js";
import { combatScreen, combat3dScreen, combatKey } from "./screens/combat.js";
import { dialogueOverlay, dialogueKey } from "./screens/dialogue.js";
import { shopOverlay } from "./screens/shop.js";
import { panelOverlay, PANEL_KEYS } from "./screens/panels.js";
import { menuOverlay } from "./screens/menu.js";
import { endingScreen, defeatScreen } from "./screens/ending.js";
import { renderDev, toggleDev } from "./dev.js";
import { play as sfx } from "./world3d/audio.js";

// Client-only UI state (which panel is open, targeting, form inputs). Game state lives on the server.
export const ui = {
  panel: null,          // "character" | "inventory" | "skills" | "quests" | "journal" | "achievements"
  menu: null,           // null | "main" | "save" | "load" | "settings" | "help"
  targeting: null,      // {kind, ability?, item?, targets:[uid]}
  creation: null,
  invFilter: "all",
  questSel: null,
  journalSel: null,
  confirm: null,
  dev: false,
};

let state = null;
let busy = false;
let actSeq = 0;
// The 3D client (null in the text interface or when WebGL is unavailable).
let world = null;

export const getState = () => state;
export const getWorld = () => world;
export const isBusy = () => busy;

export async function act(action) {
  if (busy) return null;
  busy = true;
  actSeq++;
  document.body.style.cursor = "progress";
  try {
    let v;
    try {
      // Saves record where the avatar stands, so push the latest position first.
      if (world && action.action === "save") {
        const pos = world.positionForSave();
        if (pos) await api.act({ action: "set_position", ...pos });
      }
      v = await api.act(action);
    } catch (e) {
      toast("Connection lost", "Is the game server still running? Restart it with python3 run.py.", "error", 8000);
      return null;
    }
    apply(v);
    return v;
  } finally {
    busy = false;
    document.body.style.cursor = "";
  }
}

// Background position report from the 3D client. It never blocks input and is discarded if a real
// action started meanwhile (that response is newer and authoritative).
async function syncPosition(pos) {
  if (busy) return;
  const seq = actSeq;
  let v;
  try { v = await api.act({ action: "set_position", ...pos }); } catch { return; }
  if (seq !== actSeq || busy || !v || v.error) return;
  if ((v.notifications && v.notifications.length) || v.mode !== state?.mode) apply(v);
  else state = v;
}

function apply(v) {
  if (!v || (v.error && !v.mode)) {
    toast("Error", v?.error || "Unknown error", "error", 6000);
    return;
  }
  const prevMode = state?.mode;
  state = v;
  if (v.error) { toast("Can't do that", v.error, "error", 5000); sfx("error"); }
  for (const n of v.notifications || []) {
    if (n.type === "achievement") { achievementToast(n.title, n.text); sfx("achievement"); }
    else if (n.type === "level") { toast(n.title, n.text, "level", 6000); flashLevelUp(); sfx("level"); }
    else { toast(n.title, n.text, n.type, n.type === "quest" ? 5500 : 4000); if (n.type === "quest") sfx("quest"); }
  }
  if (v.mode !== prevMode) {
    ui.targeting = null;
    if (v.mode === "combat" || v.mode === "title" || v.mode === "create") ui.panel = null;
  }
  applySettings(v.settings || {});
  render();
}

function applySettings(s) {
  document.body.classList.toggle("no-anim", s.anim === false);
  document.documentElement.style.setProperty("--scale", s.text_scale || 1);
}

const scrollMemo = {};
let shownOverlays = new Set();

export function render() {
  if (!state) return;
  const app = document.getElementById("app");
  const overlayRoot = document.getElementById("overlay-root");
  document.querySelectorAll("[data-scroll]").forEach((el) => { scrollMemo[el.dataset.scroll] = [el.scrollTop, el.scrollHeight - el.clientHeight - el.scrollTop < 8]; });
  if (world) world.update(state);

  let screen;
  const overlays = [];
  const push = (el, key) => { if (el) { el.dataset.key = key; overlays.push(el); } };
  const explore = world ? explore3dScreen : exploreScreen;
  switch (state.mode) {
    case "title": screen = titleScreen(state); break;
    case "create": screen = creationScreen(state); break;
    case "combat": screen = world ? combat3dScreen(state) : combatScreen(state); break;
    case "defeat": screen = defeatScreen(state); break;
    case "ending": screen = endingScreen(state); break;
    case "dialogue": screen = explore(state); push(dialogueOverlay(state), "dialogue"); break;
    case "shop": screen = explore(state); push(shopOverlay(state), "shop"); break;
    default: screen = explore(state);
  }
  if (ui.panel && state.player && ["explore", "shop", "dialogue"].includes(state.mode)) push(panelOverlay(state), "panel");
  if (ui.menu) push(menuOverlay(state), "menu");
  if (ui.confirm) push(confirmOverlay(), "confirm");
  // Re-rendering rebuilds overlays; only play the open animation for ones that weren't already showing.
  for (const o of overlays) if (shownOverlays.has(o.dataset.key)) o.classList.add("stay");
  shownOverlays = new Set(overlays.map((o) => o.dataset.key));
  app.replaceChildren(screen);
  overlayRoot.replaceChildren(...overlays);
  const tb = world && screen.querySelector(".topbar, .combat-top");
  if (tb) document.body.style.setProperty("--hud-top", `${tb.offsetHeight}px`);
  app.inert = overlays.length > 0;
  overlays.forEach((o, i) => { o.inert = i < overlays.length - 1; });

  document.querySelectorAll("[data-scroll]").forEach((el) => {
    const m = scrollMemo[el.dataset.scroll];
    const stick = el.dataset.stick === "bottom";
    if (m && !(stick && m[1])) el.scrollTop = m[0];
    else if (stick) el.scrollTop = el.scrollHeight;
  });
  tipOwnerGone();
  renderDev(state);
}

export function openPanel(name) {
  ui.panel = ui.panel === name ? null : name;
  hideTip();
  render();
}

export function openMenu(name = "main") {
  ui.menu = name;
  hideTip();
  render();
}

export function confirmBox(text, onYes, yesLabel = "Yes") {
  ui.confirm = { text, onYes, yesLabel };
  render();
}

function confirmOverlay() {
  const c = ui.confirm;
  const close = () => { ui.confirm = null; render(); };
  return h("div.overlay", { onclick: (e) => { if (e.target === e.currentTarget) close(); } },
    h("div.panel", { style: { maxWidth: "440px" } },
      h("p", null, c.text),
      h("div.row", { style: { justifyContent: "flex-end" } },
        h("button.btn", { onclick: close }, "Cancel"),
        h("button.btn.primary", { onclick: () => { ui.confirm = null; c.onYes(); } }, c.yesLabel))));
}

document.addEventListener("keydown", (e) => {
  if (!state) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
    if (e.key === "Escape") e.target.blur();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "`" && state.dev) { e.preventDefault(); toggleDev(); return; }
  if (world && !ui.menu && !ui.confirm && !ui.panel && world.handleKey(e)) return;
  if (e.key === "Escape") {
    e.preventDefault();
    if (ui.confirm) { ui.confirm = null; return render(); }
    if (ui.menu) { ui.menu = ui.menu === "main" || state.mode === "title" ? null : "main"; return render(); }
    if (ui.targeting) { ui.targeting = null; return render(); }
    if (ui.panel) { ui.panel = null; return render(); }
    if (state.mode === "dialogue" && state.dialogue?.required) return toast("Choose an answer", "This conversation decides something; pick one of the options.", "info");
    if (state.mode === "shop" || state.mode === "dialogue") return act({ action: "leave" });
    if (state.mode !== "title") return openMenu("main");
    return;
  }
  if (ui.menu || ui.confirm) return;
  if (state.mode === "combat") return combatKey(e, state);
  if (state.mode === "dialogue" && !ui.panel && dialogueKey(e, state)) return;
  if (["explore", "shop", "dialogue"].includes(state.mode) && state.player) {
    const p = PANEL_KEYS[e.key.toLowerCase()];
    if (p) { e.preventDefault(); openPanel(p); }
  }
});

window.addEventListener("error", (e) => toast("Interface error", String(e.message || e.error), "error", 8000));
window.addEventListener("unhandledrejection", (e) => toast("Interface error", String(e.reason?.message || e.reason), "error", 8000));

// 3D unless the text interface is requested (?ui=text) or the browser has no WebGL2.
async function initWorld() {
  const q = new URLSearchParams(location.search);
  const choice = q.get("ui") || localStorage.getItem("ashes_ui") || "3d";
  if (q.get("ui")) localStorage.setItem("ashes_ui", q.get("ui"));
  if (choice === "text") return;
  try {
    const mod = await import("./world3d/world.js");
    if (!mod.webglAvailable()) {
      toast("Text interface", "Your browser doesn't support WebGL 2, so the game is running in its text interface.", "info", 8000);
      return;
    }
    world = await mod.createWorld({ host: document.getElementById("world"), uiHost: document.getElementById("world-ui"), syncPosition });
    document.body.classList.add("mode3d");
    if (q.get("selftest")) import("./world3d/selftest.js").then((m) => m.runSelftest(world));
  } catch (err) {
    console.error(err);
    world = null;
    document.body.classList.remove("mode3d");
    toast("3D view unavailable", `Falling back to the text interface (${err.message || err}).`, "error", 9000);
  }
}

export function setInterface(kind) {
  localStorage.setItem("ashes_ui", kind);
  const u = new URL(location.href);
  u.searchParams.set("ui", kind);
  location.href = u.toString();
}

async function boot() {
  await initWorld();
  try {
    const v = await api.state();
    apply(v);
  } catch (e) {
    document.getElementById("app").replaceChildren(
      h("div.loading", null, "Could not reach the game server. Start it with: python3 run.py"));
  }
}

boot();
