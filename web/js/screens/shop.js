import { h } from "../util.js";
import { act, confirmBox } from "../app.js";
import { itemName, itemTip, equippedFor } from "./items.js";

export function shopOverlay(state) {
  const s = state.shop;
  if (!s) return null;
  const gold = state.player.gold;
  const buy = s.stock.map((row) =>
    h(`div.item-row.rb-${row.item.rarity}`, { tip: itemTip(row.item, equippedFor(state, row.item)) },
      h("div.iname", null, itemName(row.item), row.rep ? h("small", { style: { color: "var(--r-rare)" } }, "faction stock") : null,
        row.item.level ? h("small", null, `ilvl ${row.item.level}`) : null),
      h("span" + (row.price > gold ? ".bad" : ".gold-t"), null, `${row.price}g`),
      h("div.acts", null, h("button.btn.small", { disabled: row.price > gold, onclick: () => act({ action: "buy", index: row.index }) }, "Buy"))));
  const sell = s.sell.map((row) =>
    h(`div.item-row.rb-${row.item.rarity}`, { tip: itemTip(row.item, equippedFor(state, row.item)) },
      h("div.iname", null, itemName(row.item)),
      h("span.gold-t", null, `${row.price}g`),
      h("div.acts", null, h("button.btn.small", {
        onclick: () => {
          const go = () => act({ action: "sell", uid: row.item.uid });
          if (["epic", "legendary"].includes(row.item.rarity)) confirmBox(`Sell ${row.item.name} for ${row.price} gold?`, go, "Sell");
          else go();
        },
      }, "Sell"))));
  return h("div.overlay", null,
    h("div.panel.modal", { role: "dialog", "aria-label": s.name },
      h("div.modal-head", null, h("h2", null, s.name), h("div.spacer"), h("span.gold-t", null, `⛁ ${gold} gold`),
        h("button.btn", { onclick: () => act({ action: "leave" }) }, "Leave (Esc)")),
      s.greeting ? h("p.muted", { style: { fontStyle: "italic", marginTop: 0 } }, s.greeting) : null,
      h("div.body", { dataset: { scroll: "shop" } },
        h("div.shop-grid", null,
          h("div", null, h("h4", null, "For sale"), h("div.items", null, buy.length ? buy : h("p.dim", null, "Sold out."))),
          h("div", null, h("h4", null, "Your goods"), h("div.items", null, sell.length ? sell : h("p.dim", null, "You have nothing to sell.")))))));
}
