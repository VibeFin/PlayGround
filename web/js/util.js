// DOM helpers. Everything is built with createElement/textContent so player-entered
// names and content text can never inject markup.

export function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className += (el.className ? " " : "") + v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "tip") attachTip(el, v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function bar(kind, cur, max, label, big = false) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  return h(`div.bar.${kind}${big ? ".big" : ""}`, null,
    h("i", { style: { width: pct + "%" } }),
    h("b", null, label ?? `${cur} / ${max}`));
}

export function xpBar(p) {
  if (p.xp_next <= p.xp_prev) return bar("xp", 1, 1, "XP · MAX");
  const span = p.xp_next - p.xp_prev;
  const cur = Math.max(0, p.xp - p.xp_prev);
  return bar("xp", cur, span, `XP ${cur}/${span}`);
}

// ---------- tooltip ----------
const tipEl = () => document.getElementById("tooltip");
let tipOwner = null;

function attachTip(el, content) {
  el.addEventListener("mouseenter", (e) => showTip(el, content, e));
  el.addEventListener("mousemove", moveTip);
  el.addEventListener("mouseleave", hideTip);
  el.addEventListener("focus", () => showTip(el, content, null));
  el.addEventListener("blur", hideTip);
}

function showTip(owner, content, e) {
  const t = tipEl();
  t.replaceChildren();
  const node = typeof content === "function" ? content() : content;
  if (!node) return;
  if (node instanceof Node) t.appendChild(node);
  else t.textContent = String(node);
  t.style.display = "block";
  tipOwner = owner;
  if (e) moveTip(e);
  else {
    const r = owner.getBoundingClientRect();
    place(r.left, r.bottom + 6);
  }
}

function moveTip(e) { place(e.clientX + 14, e.clientY + 16); }

function place(x, y) {
  const t = tipEl();
  const w = t.offsetWidth, hh = t.offsetHeight;
  if (x + w > window.innerWidth - 8) x = Math.max(8, x - w - 28);
  if (y + hh > window.innerHeight - 8) y = Math.max(8, y - hh - 30);
  t.style.left = x + "px";
  t.style.top = y + "px";
}

export function hideTip() {
  tipEl().style.display = "none";
  tipOwner = null;
}

export function tipOwnerGone() {
  if (tipOwner && !document.body.contains(tipOwner)) hideTip();
}

// ---------- toasts ----------
export function toast(title, text = "", kind = "info", ms = 4000) {
  const root = document.getElementById("toasts");
  const el = h(`div.toast.${kind}`, null, h("div.tt", null, title), text ? h("div.tx", null, text) : null);
  root.appendChild(el);
  while (root.children.length > 6) root.firstChild.remove();
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 450); }, ms);
}

const achQueue = [];
let achBusy = false;

export function achievementToast(name, desc) {
  achQueue.push([name, desc]);
  if (!achBusy) nextAch();
}

function nextAch() {
  const next = achQueue.shift();
  if (!next) { achBusy = false; return; }
  achBusy = true;
  const el = h("div.ach-toast", null,
    h("div.label", null, "✦ NEW ACHIEVEMENT ✦"),
    h("div.aname", null, next[0]),
    h("div.adesc", null, next[1]));
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => { el.remove(); nextAch(); }, 500);
  }, 3600);
}

export function flashLevelUp() {
  const el = h("div.levelup-flash");
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");

export function costText(cost) {
  const parts = [];
  if (cost?.mp) parts.push(h("span.mpc", null, `${cost.mp} MP`));
  if (cost?.sp) parts.push(h("span.spc", null, `${cost.sp} SP`));
  if (cost?.hp) parts.push(h("span.bad", null, `${cost.hp} HP`));
  if (!parts.length) return ["free"];
  return parts.flatMap((p, i) => (i ? [" · ", p] : [p]));
}

export function timeAgo(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}
