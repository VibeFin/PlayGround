import { h } from "../util.js";
import { act } from "../app.js";

export function dialogueOverlay(state) {
  const d = state.dialogue;
  if (!d) return null;
  return h("div.overlay", null,
    h("div.panel.modal.dialogue", { role: "dialog", "aria-label": `Conversation with ${d.name}` },
      h("div.dlg-head", null,
        h("div.portrait", null, d.portrait || d.name[0]),
        h("div", null, h("h2", { style: { margin: 0 } }, d.name), d.title ? h("div.muted", null, d.title) : null)),
      h("div.body", { dataset: { scroll: "dlg" } },
        d.result ? h("div.dlg-result", null, d.result) : null,
        h("div.dlg-text", null, d.text),
        h("div.dlg-opts", null, d.options.map((o, i) =>
          h("button.btn", { onclick: () => act({ action: "choose", index: o.index }) },
            h("span.num", null, `${i + 1}.`), o.text, o.tag ? h("span.tag", null, o.tag) : null)),
          d.options.length ? null : h("button.btn", { onclick: () => act({ action: "leave" }) }, h("span.num", null, "1."), "[Leave]")))));
}

export function dialogueKey(e, state) {
  const d = state.dialogue;
  if (!d) return false;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9) {
    e.preventDefault();
    if (!d.options.length && n === 1) act({ action: "leave" });
    else if (d.options[n - 1]) act({ action: "choose", index: d.options[n - 1].index });
    return true;
  }
  return false;
}
