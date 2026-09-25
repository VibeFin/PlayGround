import { h, cap } from "../util.js";

export const RARITY_LABEL = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary", quest: "Quest Item" };

export function itemName(it, extra = "") {
  if (!it) return h("span.dim", null, "— empty —");
  return h(`span.r-${it.rarity}`, null, it.name + (it.qty > 1 ? ` ×${it.qty}` : "") + extra);
}

function kindLine(it) {
  if (it.kind === "weapon") return `${it.hands === 2 ? "Two-handed" : "One-handed"} ${it.wtype || "weapon"}${it.ranged ? " (ranged)" : ""}`;
  if (it.kind === "armor") return `${cap(it.weight || "")} armor · ${it.slot_name || cap(it.slot)}`;
  if (it.kind === "offhand") return "Off-hand";
  if (it.kind === "jewelry") return it.slot_name || "Jewelry";
  if (it.kind === "consumable") return { combat: "Consumable · combat only", field: "Consumable · outside combat", both: "Consumable" }[it.use] || "Consumable";
  if (it.kind === "key") return it.readable ? "Quest item · readable" : "Quest item";
  return cap(it.kind);
}

export function itemTip(it, equipped) {
  if (!it) return null;
  return () => h("div", null,
    h(`div.tip-name.r-${it.rarity}`, null, it.name),
    h("div.tip-line", null, `${RARITY_LABEL[it.rarity] || cap(it.rarity)} · ${kindLine(it)}${it.level ? ` · item level ${it.level}` : ""}`),
    it.dmg ? h("div", null, `Damage ${it.dmg}`) : null,
    it.mods?.length ? h("div.tip-mods", null, it.mods.map((m) => h("div", null, m))) : null,
    it.desc ? h("div", { style: { marginTop: ".3em", fontSize: ".9em" } }, it.desc) : null,
    it.flavor ? h("div.tip-flavor", null, `“${it.flavor}”`) : null,
    h("div.tip-line", { style: { marginTop: ".3em" } }, `Value ${it.value} gold`),
    equipped && equipped.uid !== it.uid ? h("div", { style: { marginTop: ".5em", borderTop: "1px solid #3a2d20", paddingTop: ".4em" } },
      h("div.tip-line", null, "Currently equipped:"),
      h(`div.r-${equipped.rarity}`, null, equipped.name),
      equipped.dmg ? h("div.tip-line", null, `Damage ${equipped.dmg}`) : null,
      equipped.mods?.length ? h("div.tip-line", null, equipped.mods.join(" · ")) : null) : null);
}

export function equippedFor(state, it) {
  if (!it || !it.slot) return null;
  const eq = state.inventory.equipment;
  if (it.slot === "ring") return eq.ring1 || eq.ring2;
  return eq[it.slot] || null;
}
