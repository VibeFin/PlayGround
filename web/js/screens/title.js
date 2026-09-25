import { h } from "../util.js";
import { act, openMenu } from "../app.js";

export function titleScreen(state) {
  const saves = (state.saves || []).filter((s) => !s.corrupt);
  const latest = saves[0];
  const embers = h("div.embers", null,
    Array.from({ length: 26 }, (_, i) => h("span", {
      style: {
        left: `${(i * 37) % 100}%`, animationDuration: `${7 + (i * 13) % 9}s`, animationDelay: `${(i * 7) % 11}s`,
        background: i % 4 === 0 ? "var(--aether)" : undefined, boxShadow: i % 4 === 0 ? "0 0 8px var(--aether)" : undefined,
      },
    })));
  return h("div.title-screen", null, embers,
    h("div.title-inner", null,
      h("h1.logo", null, "ASHES OF AETHER", h("small", null, "ACT I · THE UNRAVELLING")),
      h("p.tagline", null,
        "The Aether that lit the world's lamps and healed its sick has begun to misbehave. Spells fizzle, wards "
        + "bite their makers, and something beneath the old Vault is waking up. Someone has to find out why."),
      h("div.title-menu", null,
        latest ? h("button.btn.big.primary", { onclick: () => act({ action: "load", slot: latest.slot }), autofocus: true },
          "Continue", h("span.sub", null, `${latest.name} · Lv ${latest.level} ${latest.race} ${latest.cls} · ${latest.location}`)) : null,
        h("button.btn.big" + (latest ? "" : ".primary"), { onclick: () => act({ action: "new_game" }) }, "New Game"),
        h("button.btn.big", { onclick: () => openMenu("load"), disabled: !saves.length }, "Load Game"),
        h("button.btn.big", { onclick: () => openMenu("settings") }, "Settings"),
        h("button.btn.big", { onclick: () => openMenu("help") }, "How to Play"))),
    h("div.version", null, "v1.0 · single-player · saves stay on this computer"));
}
