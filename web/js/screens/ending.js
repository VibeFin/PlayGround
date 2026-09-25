import { h } from "../util.js";
import { act, openMenu } from "../app.js";

export function endingScreen(state) {
  const e = state.ending;
  if (!e) return h("div.loading", null, "…");
  return h("div.screen-scroll", null, h("div.ending", null,
    h("h1.logo", { style: { fontSize: "2.2em" } }, e.title),
    h("hr.divider"),
    h("div.etext", null, e.text),
    e.epilogue.length ? [h("h4", { style: { marginTop: "2em" } }, "What became of the world"), e.epilogue.map((t) => h("p.epi", null, t))] : null,
    h("div.act-banner", null, e.banner.split(" — ").map((part, i) => [i ? " — " : null, h("span.nowrap", null, part)])),
    h("p.muted", null, "To be continued. The world of Act I remains open — finish side quests, hunt achievements, and see who remembers what you did."),
    h("div.row", { style: { justifyContent: "center", marginTop: "1.5em" } },
      h("button.btn.big.primary", { onclick: () => act({ action: "continue" }), autofocus: true }, "Continue exploring"),
      h("button.btn.big", { onclick: () => act({ action: "title" }) }, "Return to title"))));
}

export function defeatScreen(state) {
  const cb = state.combat;
  const gold = state.player?.gold || 0;
  return h("div.title-screen", null,
    h("div.title-inner", null, h("div.panel.result-card.defeat", null,
      h("h1", null, "You have fallen"),
      h("p.muted", null, cb ? `The battle — ${cb.title} — is lost.` : "The battle is lost."),
      h("p", null, `You'll wake at the last place you rested and lose about ${Math.floor(gold / 10)} gold. Your items, experience and progress are kept.`),
      h("p.dim", { style: { fontSize: ".9em" } }, "Tip: rest to full health first, spend your skill and attribute points, bring potions, and watch for ⚠ charging attacks."),
      h("div.row", { style: { justifyContent: "center" } },
        h("button.btn.big.primary", { onclick: () => act({ action: "respawn" }), autofocus: true }, "Rise again"),
        h("button.btn.big", { onclick: () => openMenu("load") }, "Load a save")))));
}
