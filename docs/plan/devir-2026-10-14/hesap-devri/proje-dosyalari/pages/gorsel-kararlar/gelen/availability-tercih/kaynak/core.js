/* Availability mockups: demo world, state, app shell and the shared screens.
   Variants (o.js, v1.js … v5.js) decide how an employee enters the week and how a manager reads it. */
(function () {
"use strict";
const NF = (window.NF = window.NF || {});
NF.variants = NF.variants || {};
NF.order = ["o", "1", "2", "3", "4", "5"];

/* ---------------- icons (lucide shapes) ---------------- */
const I = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  cal: '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  caldays: '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
  calcheck: '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M9 16l2 2 4-4"/>',
  calx: '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M14 14l-4 4M10 14l4 4"/>',
  clip: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
  mega: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  dash: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  swap: '<path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>', chevR: '<path d="m9 18 6-6-6-6"/>', chevD: '<path d="m6 9 6 6 6-6"/>', chevU: '<path d="m18 15-6-6-6 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>', check: '<path d="M20 6 9 17l-5-5"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  circleCheck: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  sunrise: '<path d="M12 2v8M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  sunset: '<path d="M12 10V2M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M16 6l-4 4-4-4M16 18a4 4 0 0 0-8 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20M14.12 14.12a3 3 0 1 1-4.24-4.24"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  brief: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4M21 2l-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>', arrowL: '<path d="m12 19-7-7 7-7M19 12H5"/>',
  wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72M14 7l3 3M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9"/>',
  sparkle: '<path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z"/>',
  sliders: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  layout: '<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="9" height="7" x="3" y="14" rx="1"/><rect width="5" height="7" x="16" y="14" rx="1"/>',
  list: '<path d="M3 12h.01M3 18h.01M3 6h.01M8 12h13M8 18h13M8 6h13"/>',
  text: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  pointer: '<path d="M4.04 4.95a.5.5 0 0 1 .65-.65l15.6 6.3a.5.5 0 0 1-.06.95l-6.07 1.62a2 2 0 0 0-1.4 1.4l-1.62 6.07a.5.5 0 0 1-.95.06z"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
  wifi: '<path d="M12 20h.01M2 8.82a15 15 0 0 1 20 0M5 12.86a10 10 0 0 1 14 0M8.5 16.43a5 5 0 0 1 7 0"/>',
  battery: '<rect width="16" height="10" x="2" y="7" rx="2"/><path d="M22 11v2"/><rect width="9" height="6" x="4" y="9" rx="1" fill="currentColor" stroke="none"/>',
};
const icon = (n, s = 16) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ""}</svg>`;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = (x) => JSON.parse(JSON.stringify(x));
const initials = (n) => n.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const join = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/* ---------------- time: the restaurant opens 6 AM and closes 2 AM ---------------- */
const OPEN = 360, CLOSE = 1560, SPAN = CLOSE - OPEN, STEP = 30;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAYP = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const DATE = [12, 13, 14, 15, 16, 17, 18];
const TODAY = 1;
function clk(m) { m = ((m % 1440) + 1440) % 1440; const h = Math.floor(m / 60); return { h12: h % 12 || 12, mm: m % 60, ap: h < 12 ? "AM" : "PM" }; }
const pad = (n) => String(n).padStart(2, "0");
const fmt = (m) => { const c = clk(m); return `${c.h12}:${pad(c.mm)} ${c.ap}`; };
const fmtC = (m) => { const c = clk(m); return c.mm ? `${c.h12}:${pad(c.mm)} ${c.ap}` : `${c.h12} ${c.ap}`; };
const fmtS = (m) => { const c = clk(m); return `${c.h12}${c.mm ? ":" + pad(c.mm) : ""}${c.ap === "AM" ? "a" : "p"}`; };
const pct = (m) => ((m - OPEN) / SPAN) * 100;
const snap = (m, s = STEP) => Math.round(m / s) * s;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TIMES = []; for (let m = OPEN; m <= CLOSE; m += STEP) TIMES.push(m);
const timeLabel = (m) => (m === CLOSE ? "2:00 AM · close" : m === OPEN ? "6:00 AM · open" : fmt(m));
function timeSelect(attrs, val, opts = {}) {
  const from = opts.from == null ? OPEN : opts.from, to = opts.to == null ? CLOSE : opts.to;
  return `<select class="${opts.cls || "field time"}" ${attrs}>${TIMES.filter((m) => m >= from && m <= to).map((m) => `<option value="${m}" ${m === val ? "selected" : ""}>${timeLabel(m)}</option>`).join("")}</select>`;
}
const TICKS = [360, 600, 840, 1080, 1320, 1560];
const scaleHTML = (cls = "") => `<div class="scale ${cls}" aria-hidden="true">${TICKS.map((m) => `<span style="left:${pct(m)}%">${fmtS(m)}</span>`).join("")}</div>`;

/* shift types (workspace setting "Shift type" entry) */
const TYPES = [
  { id: "breakfast", name: "Breakfast", a: 420, b: 660, ic: "sunrise" },
  { id: "lunch", name: "Lunch", a: 660, b: 960, ic: "sun" },
  { id: "dinner", name: "Dinner", a: 960, b: 1320, ic: "sunset" },
  { id: "close", name: "Close", a: 1080, b: 1410, ic: "moon" },
];
const TYPE = Object.fromEntries(TYPES.map((t) => [t.id, t]));

/* ---------------- one day: all day off, or time ranges (hours entry), or shift types (types entry) ---------------- */
const blank = () => ({ all: false, r: [], t: [] });
function mergeR(rs) {
  const r = rs.map(([a, b]) => [clamp(Math.min(a, b), OPEN, CLOSE), clamp(Math.max(a, b), OPEN, CLOSE)]).filter(([a, b]) => b - a >= STEP).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const x of r) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push([x[0], x[1]]); }
  return out;
}
function norm(d) {
  const r = mergeR(d.r || []);
  const t = TYPES.map((x) => x.id).filter((id) => (d.t || []).includes(id));
  const all = !!d.all || (r.length === 1 && r[0][0] <= OPEN && r[0][1] >= CLOSE) || t.length === TYPES.length;
  return all ? { all: true, r: [], t: [] } : { all: false, r, t };
}
const isFree = (d, mode = S.mode) => !d.all && (mode === "types" ? d.t.length === 0 : d.r.length === 0);
const dayState = (d, mode = S.mode) => (d.all ? "off" : isFree(d, mode) ? "free" : "some");
function rangeText([a, b]) {
  if (a <= OPEN && b >= CLOSE) return "All day";
  if (a <= OPEN) return `Before ${fmtC(b)}`;
  if (b >= CLOSE) return `After ${fmtC(a)}`;
  return `${fmtC(a)} – ${fmtC(b)}`;
}
const lower = (s) => s.replace(/^(After|Before|All day)/, (w) => w.toLowerCase());
function dayText(d, mode = S.mode) {
  if (d.all) return "All day";
  if (mode === "types") return d.t.map((id) => TYPE[id].name).join(", ");
  return d.r.map(rangeText).join(", ");
}
function subR(rs, [a, b]) {
  const out = [];
  rs.forEach(([x, y]) => { if (y <= a || x >= b) out.push([x, y]); else { if (x < a) out.push([x, a]); if (y > b) out.push([b, y]); } });
  return out;
}
const asRanges = (d) => (d.all ? [[OPEN, CLOSE]] : d.r.slice());
/* drag helper: calls move(ev) on every pointer move and up(ev) once at the end */
function drag(ev, move, up) {
  const mv = (e) => { e.preventDefault(); move(e); };
  const fin = (e) => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", fin); window.removeEventListener("pointercancel", fin); up && up(e); };
  window.addEventListener("pointermove", mv, { passive: false }); window.addEventListener("pointerup", fin); window.addEventListener("pointercancel", fin);
}
function blocks(d, mode = S.mode) {
  if (d.all) return [[OPEN, CLOSE]];
  if (mode === "types") return mergeR(d.t.map((id) => [TYPE[id].a, TYPE[id].b]));
  return d.r;
}
/* does a shift [a,b] of type clash with this day? returns a short reason or null */
function clash(d, a, b, type, mode = S.mode) {
  if (!d) return null;
  if (d.all) return "all day";
  if (mode === "types") return d.t.includes(type) ? `${TYPE[type].name} shifts` : null;
  const hit = d.r.filter(([x, y]) => x < b && y > a);
  return hit.length ? hit.map((r) => lower(rangeText(r))).join(", ") : null;
}
function parts(week, mode = S.mode) {
  const map = new Map();
  week.forEach((d, i) => { if (isFree(d, mode)) return; const k = dayText(d, mode); if (!map.has(k)) map.set(k, []); map.get(k).push(i); });
  return [...map].map(([text, days]) => ({ text, days })).sort((a, b) => a.days[0] - b.days[0]);
}
function daysLabel(days, long = false) {
  const k = days.join();
  if (k === "0,1,2,3,4") return long ? "Weekdays" : "Mon–Fri";
  if (k === "5,6") return long ? "Weekends" : "Sat, Sun";
  if (days.length === 7) return "Every day";
  const N = long ? DAYP : DAYS;
  const runs = [];
  days.forEach((i) => { const l = runs[runs.length - 1]; if (l && l[1] === i - 1) l[1] = i; else runs.push([i, i]); });
  return runs.map(([a, b]) => (b - a >= 2 ? `${N[a]}–${N[b]}` : a === b ? N[a] : `${N[a]}, ${N[b]}`)).join(", ");
}
const partText = (p, mode = S.mode) => (mode === "types" && p.text !== "All day" ? p.text.replace(/, /g, " and ") : lower(p.text));
function sentence(week, mode = S.mode, who = "You") {
  if (!week) return "";
  const ps = parts(week, mode);
  if (!ps.length) return `${who} ${who === "You" ? "are" : "is"} open to work any time.`;
  return `${who} ${who === "You" ? "prefer" : "prefers"} not to work ${join(ps.map((p) => `<b>${daysLabel(p.days)}</b> ${partText(p, mode)}`))}.`;
}
const PROMISE = "Availability is a preference, not a guarantee. If you're scheduled, the shift is yours: swap it, give it up, or request time off.";
const PROMISE_MGR = "A preference, not a rule. You can still schedule anyone; the Schedule shows an orange ! where a shift doesn't fit.";

/* ---------------- demo world (US restaurant, same names as the PAGES demo) ---------------- */
const wk = (spec) => DAYS.map((_, i) => norm(Object.assign(blank(), clone(spec[i] || {}))));
const MARIA = wk({ 1: { all: true }, 4: { r: [[1080, CLOSE]], t: ["dinner", "close"] }, 6: { r: [[OPEN, 660]], t: ["breakfast"] } });
const J = { r: [[OPEN, 660]], t: ["breakfast"] };
const TEAM = [
  { id: "aisha", name: "Aisha Johnson", job: "Line Cook", code: "HV-008", upd: "Oct 2", w: wk({ 4: { r: [[1080, CLOSE]], t: ["dinner", "close"] } }) },
  { id: "carlos", name: "Carlos Rivera", job: "Line Cook", code: "HV-004", upd: "Sep 28", w: wk({}) },
  { id: "daniel", name: "Daniel Kim", job: "Barback", code: "HV-011", upd: "Oct 5", w: wk({ 5: { all: true }, 6: { all: true } }) },
  { id: "emma", name: "Emma Wilson", job: "Server", code: "HV-015", upd: "Oct 7", w: wk({ 2: { r: [[OPEN, 960]], t: ["breakfast", "lunch"] } }) },
  { id: "ethan", name: "Ethan Brooks", job: "Busser", code: "HV-009", upd: "Sep 30", w: wk({ 3: { r: [[1320, CLOSE]], t: ["close"] } }) },
  { id: "grace", name: "Grace Murphy", job: "Bartender", code: "HV-017", upd: null, w: null },
  { id: "jake", name: "Jake Thompson", job: "Server", code: "HV-003", upd: "Oct 1", w: wk({ 0: J, 1: J, 2: J, 3: J, 4: J }) },
  { id: "maria", name: "Maria Lopez", job: "Server", code: "HV-012", me: true },
];
const PERSON = Object.fromEntries(TEAM.map((p) => [p.id, p]));
const first = (p) => p.name.split(" ")[0];

/* ---------------- state ---------------- */
const S = (NF.S = {});
function freshSchedule() {
  const plan = [
    ["aisha", [1, 2, 3, 5, 6], "dinner", "Line Cook"], ["carlos", [0, 1, 2, 3, 4], "lunch", "Line Cook", "Opener"],
    ["daniel", [1], "dinner", "Barback"], ["daniel", [4], "close", "Barback"], ["emma", [0, 1, 2, 3], "lunch", "Server"],
    ["ethan", [0, 1, 4, 5, 6], "dinner", "Busser"], ["grace", [3, 4, 5, 6], "close", "Bartender", "Closer"],
    ["jake", [0, 2, 3, 4], "dinner", "Server"], ["maria", [0, 2, 3], "lunch", "Server"], ["maria", [5], "dinner", "Server"], ["maria", [6], "breakfast", "Server"],
  ];
  const shifts = []; let n = 1;
  plan.forEach(([emp, days, type, job, label]) => days.forEach((day) => shifts.push({ id: "s" + n++, emp, day, type, job, label: label || null })));
  return { shifts, open: [{ id: "o1", day: 4, type: "dinner", job: "Server" }], avail: true, modal: null, seq: 100 };
}
function reset(keep) {
  Object.assign(S, {
    variant: keep ? S.variant : "1", screen: keep ? S.screen : "mine", view: keep ? S.view : "desk", mode: keep ? S.mode : "hours", about: keep ? S.about : true,
    week: clone(MARIA), saved: clone(MARIA), savedAt: "Oct 9",
    teamTab: "all", q: "", person: "maria", drTab: "avail",
    notes: { maria: [{ day: 4, text: "Has a class Friday evenings until Dec 12. Asked us to keep Fridays light." }], daniel: [{ day: 5, text: "Weekend custody. Don't ask for Saturday cover." }] },
    ob: "step", obSkipped: false,
    sch: freshSchedule(),
    ph: { sheet: null, page: null, person: null },
    v: {},
  });
}
reset(false);
const cur = () => NF.variants[S.variant];
const vs = (id = S.variant) => (S.v[id] = S.v[id] || {});
const weekOf = (p) => (p.me ? S.saved : p.w);
const dirty = () => JSON.stringify(S.week) !== JSON.stringify(S.saved);
const changedDays = () => S.week.filter((d, i) => JSON.stringify(d) !== JSON.stringify(S.saved[i])).length;
function setDay(i, d) { S.week[i] = norm(d); render(); }
function setDays(list, fn) { list.forEach((i) => { S.week[i] = norm(fn(clone(S.week[i]), i)); }); render(); }
function teamList() {
  const q = S.q.trim().toLowerCase();
  return TEAM.filter((p) => (S.teamTab === "all" || (S.teamTab === "sub" ? !!weekOf(p) : !weekOf(p))) && (!q || p.name.toLowerCase().includes(q)));
}

/* ---------------- shared building blocks ---------------- */
function railHTML(d, opts = {}) {
  const mode = opts.mode || S.mode;
  const bs = d ? blocks(d, mode) : [];
  const lbl = (a, b) => (opts.labels === false || b - a < 150 ? "" : d.all ? "Unavailable all day" : rangeText([a, b]));
  return `<div class="rail ${opts.cls || ""}" ${opts.attrs || ""}>${bs.map(([a, b]) => `<span class="blk" style="left:${pct(a)}%;width:${pct(b) - pct(a)}%">${esc(lbl(a, b))}</span>`).join("")}</div>`;
}
function typePills(d, opts = {}) {
  return `<div class="tpills">${TYPES.map((t) => {
    const off = d.all || d.t.includes(t.id);
    return opts.edit
      ? `<button type="button" class="tpill" data-act="${opts.act}" data-day="${opts.day}" data-type="${t.id}" aria-pressed="${off}" title="${t.name} ${fmtC(t.a)} – ${fmtC(t.b)}">${icon(t.ic, 14)}<span>${t.name}</span></button>`
      : `<span class="tpill ${off ? "on" : ""}">${icon(t.ic, 13)}<span>${t.name}</span></span>`;
  }).join("")}</div>`;
}
const statusDot = (p) => {
  const w = weekOf(p);
  return w ? `<span class="status"><i></i>Submitted · ${p.me ? S.savedAt : p.upd}</span>` : `<span class="status off"><i></i>Not submitted</span>`;
};
function summaryLine(week, who = "You", cls = "") {
  return `<p class="sum ${cls}">${icon("sparkle", 15)}<span>${sentence(week, S.mode, who)}</span></p>`;
}

/* ---------------- app shell ---------------- */
function sidebar(kind, active) {
  const nav = (id, ic, label, extra = "") => `<a class="nav ${active === id ? "active" : ""}" href="#" tabindex="-1" ${active === id ? 'aria-current="page"' : ""}>${icon(ic, 19)}<span>${label}</span>${extra}</a>`;
  const child = (id, label) => `<a class="nav child ${active === id ? "active" : ""}" href="#" tabindex="-1"><span>${label}</span></a>`;
  const chev = `<span class="nav-chev">${icon("chevD", 16)}</span>`;
  const top = `<div class="side-top"><span>${icon("menu", 19)}</span>Harbor &amp; Vine</div>`;
  if (kind === "emp") {
    return `<aside class="side">${top}<nav class="side-nav" aria-label="Main">${nav("home", "home", "Home")}${nav("sched", "caldays", "Schedule")}${nav("hub", "clip", "Shift Hub")}${nav("avail", "calcheck", "My Availability")}${nav("ann", "mega", "Announcements")}${nav("not", "bell", "Notifications", '<span class="badge">3</span>')}</nav>
      <div class="side-foot"><a class="nav" href="#" tabindex="-1"><span class="avatar">ML</span><span>Account</span><span class="badge soft">1</span></a><a class="nav" href="#" tabindex="-1">${icon("logout", 19)}<span>Sign out</span></a></div></aside>`;
  }
  return `<aside class="side">${top}<nav class="side-nav" aria-label="Main">${nav("ws", "grid", "Workspace")}${nav("sched", "caldays", "Schedule", chev)}${child("req", "Requests")}${nav("emps", "users", "Employees", chev)}${child("docs", "Documents")}${nav("avail", "calcheck", "Availability")}${nav("ann", "mega", "Announcements", chev)}${child("dates", "Important Dates")}${nav("not", "bell", "Notifications", '<span class="badge">7</span>')}</nav>
    <div class="side-foot">${nav("set", "gear", "Settings")}<a class="nav" href="#" tabindex="-1">${icon("user", 19)}<span>Employee view</span><span class="nav-chev">${icon("swap", 15)}</span></a><a class="nav" href="#" tabindex="-1"><span class="avatar">MT</span><span>Account</span><span class="badge soft">1</span></a><a class="nav" href="#" tabindex="-1">${icon("logout", 19)}<span>Sign out</span></a></div></aside>`;
}
const app = (kind, active, inner) => `<div class="app">${sidebar(kind, active)}<main class="main">${inner}</main></div>`;
function header(eyebrow, title, desc, right = "") {
  return `<header class="pgh"><div><span class="eyebrow">${eyebrow}</span><h1>${title}<i aria-hidden="true"></i></h1><p>${desc}</p></div>${right}</header>`;
}

/* ---------------- My Availability (employee) ---------------- */
function frame(ctx) {
  const V = cur();
  const st = ctx.where === "onboard" ? `<span class="status off"><i></i>Not shared yet</span>` : dirty() ? `<span class="status warn"><i></i>Unsaved changes</span>` : `<span class="status"><i></i>Shared with your managers · ${S.savedAt}</span>`;
  return `<section class="card av-card">
    <header class="card-hd"><h2>${V.title || "Weekly availability"}</h2>${st}<div class="right">${V.tools ? V.tools(ctx) : ""}</div></header>
    ${ctx.where === "onboard" ? "" : `<div class="av-promise">${icon("info", 15)}<span>${PROMISE}</span></div>`}
    <div class="card-bd">${V.editor(ctx)}</div>
  </section>`;
}
function saveBar() {
  if (!dirty()) return "";
  const n = changedDays();
  return `<div class="savebar" role="region" aria-label="Unsaved changes">${icon("pencil", 15)}<span class="grow">${n} ${n === 1 ? "day" : "days"} changed. Your managers see it after you save.</span><button type="button" class="btn ghost sm" data-act="discard">Discard</button><button type="button" class="btn go sm" data-act="save">${icon("check", 15)} Save availability</button></div>`;
}
function mineDesk() {
  const V = cur();
  const body = V.frame === false ? V.editor({ where: "mine" }) : frame({ where: "mine" }) + saveBar();
  return app("emp", "avail", `<div class="page">${header("When you can work.", "My Availability", "Set your weekly preferences and request time off.")}
    <div class="tabs" role="tablist"><button type="button" class="tab" role="tab" aria-selected="true">${icon("calcheck", 15)} Availability</button><button type="button" class="tab" role="tab" aria-selected="false" tabindex="-1">${icon("calx", 15)} Time Off Requests</button></div>
    ${body}</div>`);
}

/* ---------------- Onboarding (employee) ---------------- */
function obSide() {
  const done = S.ob === "review" ? 3 : 2;
  const step = (n, label, st) => `<div class="ob-step ${st}"><i>${st === "done" ? icon("check", 12) : n}</i>${label}</div>`;
  return `<aside class="ob-side"><div class="ob-brand">NEWFORK</div><h3>Harbor &amp; Vine</h3><small>Employee onboarding</small>
    <div class="ob-prog"><i style="width:${done * 25}%"></i></div><small>${done} of 4 steps done</small>
    <div class="ob-steps">${step(1, "Profile", "done")}${step(2, "Documents", "done")}${step(3, "Availability (optional)", S.ob === "review" ? "done" : "on")}${step(4, "Review", S.ob === "review" ? "on" : "")}</div>
    <span class="grow"></span><button type="button" class="btn" style="width:100%">Exit onboarding</button>
    <div class="ob-me"><b>Maria Lopez</b><small>maria@harborvine.test</small></div><button type="button" class="btn" style="width:100%">${icon("logout", 15)} Sign out</button></aside>`;
}
function obReview() {
  const ps = parts(S.week);
  const av = S.obSkipped ? `<span class="muted">Skipped. Add it anytime in My Availability.</span>` : ps.length ? `<span>${sentence(S.week)}</span>` : `<span>You're open to work any time.</span>`;
  return `<div class="inner"><h1>Review and finish</h1><p class="lead">Everything is ready. You can change any of this later from your own pages.</p>
    <div class="card review">
      <div class="rv-row"><span class="rv-ic ok">${icon("check", 14)}</span><b>Profile</b><span>Maria Lopez · (650) 555-0142</span><span></span></div>
      <div class="rv-row"><span class="rv-ic ok">${icon("check", 14)}</span><b>Documents</b><span>2 signed</span><span></span></div>
      <div class="rv-row"><span class="rv-ic ${S.obSkipped ? "" : "ok"}">${S.obSkipped ? icon("more", 14) : icon("check", 14)}</span><b>Availability</b>${av}<button type="button" class="btn sm quiet" data-act="ob-back">${icon("pencil", 13)} Edit</button></div>
    </div>
    <div class="ob-foot"><span class="grow"></span><button type="button" class="btn go" data-act="ob-finish">Finish onboarding ${icon("arrowR", 15)}</button></div></div>`;
}
function onboardDesk() {
  const V = cur();
  if (S.ob === "review") return `<div class="ob">${obSide()}<div class="ob-main">${obReview()}</div></div>`;
  const orig = S.variant === "o";
  const title = orig ? "The hours you can work" : "When do you prefer not to work?";
  const lead = orig ? "Mark the hours you are not available in a normal week. Your manager builds the schedule around it." : `Optional. Mark the times you'd rather not work in a normal week. ${PROMISE.replace("Availability is a", "It's a")}`;
  const body = V.frame === false ? V.editor({ where: "onboard" }) : frame({ where: "onboard" });
  const foot = orig
    ? `<div class="ob-foot"><span class="grow">You can change this later from your own availability page.</span><button type="button" class="btn quiet" disabled>${icon("rotate", 14)} Discard</button><button type="button" class="btn go" data-act="ob-save">${icon("save", 14)} Save</button><button type="button" class="btn" data-act="ob-skip">Skip for now ${icon("arrowR", 14)}</button></div>`
    : `<div class="ob-foot"><span class="grow">You can change this anytime in My Availability.</span><button type="button" class="btn" data-act="ob-skip">Skip for now</button><button type="button" class="btn go" data-act="ob-save">Save and continue ${icon("arrowR", 15)}</button></div>`;
  return `<div class="ob">${obSide()}<div class="ob-main"><div class="inner"><h1>${title}</h1><p class="lead">${lead}</p>${body}${foot}</div></div></div>`;
}

/* ---------------- Team availability (manager) + drawer ---------------- */
function teamDesk() {
  const V = cur();
  const all = TEAM.length, sub = TEAM.filter((p) => weekOf(p)).length;
  const tab = (id, label, n) => `<button type="button" class="tab" role="tab" data-act="team-tab" data-v="${id}" aria-selected="${S.teamTab === id}">${label} <span class="cnt">${n}</span></button>`;
  const orig = S.variant === "o";
  const legend = orig ? "" : `<div class="legend"><span><i class="l-free"></i>Available</span><span><i class="l-no"></i>Prefers not to work</span></div>`;
  return app("mgr", "avail", `<div class="page">${header(orig ? "Availability clear. Coverage ready." : "Team availability", "Availability", orig ? "Track weekly availability submissions and identify coverage gaps." : "Your team's weekly preferences. They guide the schedule; you can still schedule anyone.")}
    <div class="tabs" role="tablist">${tab("all", "All", all)}${tab("sub", "Submitted", sub)}${tab("not", "Not submitted", all - sub)}<span class="tabs-right">${all} employees</span></div>
    <div class="toolbar"><select class="field" style="width:200px" aria-label="Location"><option>All locations</option><option>Harbor &amp; Vine Downtown</option><option>Harbor &amp; Vine Uptown</option></select><label class="search">${icon("search", 15)}<input id="team-q" type="search" placeholder="Search employees" value="${esc(S.q)}" data-input="q" aria-label="Search employees"></label>${legend}</div>
    ${V.team(teamList())}
    ${orig ? "" : `<p class="foot-note">${icon("lock", 13)} Employees set their own availability. Managers can read it and keep private notes in each person's profile.</p>`}</div>`);
}
function drawerHTML() {
  const p = PERSON[S.person];
  const V = cur();
  const orig = S.variant === "o";
  const notes = S.notes[p.id] || [];
  const nav = (ic, label, on) => `<span class="dr-nav ${on ? "on" : ""}">${icon(ic, 17)}${label}</span>`;
  const w = weekOf(p);
  const availPane = !w
    ? `<div class="empty-state">${icon("calx", 26)}<b>${esc(first(p))} hasn't shared availability yet.</b><span>It's optional. Until then, every time counts as available.</span></div>`
    : orig ? V.readOnly(p)
    : `<div class="ro-bar">${icon("lock", 14)}<span>Read only. Only ${esc(first(p))} can change this.</span><span class="grow"></span><span>Updated ${p.me ? S.savedAt : p.upd}</span></div>${summaryLine(w, first(p))}${V.readOnly(p)}<p class="mgr-note">${icon("info", 14)}<span>${PROMISE_MGR}</span></p>`;
  const notesPane = `<p class="ro-line">${icon("eyeOff", 14)} Only managers see these notes. ${esc(first(p))} doesn't.</p>
    <div class="notes">${DAYS.map((d, i) => { const n = notes.find((x) => x.day === i); return `<div class="note-row"><b>${DAYL[i]}</b>${n ? `<p>${esc(n.text)}</p>` : `<span class="empty-n">No note</span>`}<button type="button" class="btn sm ghost" data-act="note-edit" data-day="${i}">${n ? icon("pencil", 13) + " Edit" : icon("plus", 13) + " Add"}</button></div>`; }).join("")}</div>`;
  return `<div class="dr-back" data-act="dr-close"></div>
  <aside class="drawer" role="dialog" aria-label="${esc(p.name)}">
    <div class="dr-side"><div class="dr-person"><span class="avatar">${initials(p.name)}</span><b>${esc(p.name)}</b><small>${p.code}</small><span class="tag ok">Active</span></div>
      ${nav("user", "Profile")}${nav("brief", "Employment")}${nav("calcheck", "Availability", true)}<hr>${nav("file", "Documents")}<hr>${nav("key", "Access")}${nav("history", "History")}</div>
    <div class="dr-main"><div class="dr-hd"><h2>Availability</h2><button type="button" class="btn ghost icon" data-act="dr-close" aria-label="Close">${icon("x", 18)}</button></div>
      <div class="dr-tabs" role="tablist"><button type="button" role="tab" data-act="dr-tab" data-v="avail" aria-selected="${S.drTab === "avail"}">Employee availability</button><button type="button" role="tab" data-act="dr-tab" data-v="notes" aria-selected="${S.drTab === "notes"}">${orig ? "Manager reminders" : "Manager notes"}${notes.length ? ` <span class="cnt">${notes.length}</span>` : ""}</button></div>
      <div class="dr-bd">${S.drTab === "avail" ? availPane : notesPane}</div></div>
  </aside>`;
}

/* ---------------- Schedule (manager, edit mode) ---------------- */
const shiftOf = (id) => S.sch.shifts.find((s) => s.id === id);
const cellShifts = (emp, day) => S.sch.shifts.filter((s) => s.emp === emp && s.day === day);
function clashFor(emp, day, type) {
  const p = PERSON[emp]; const w = weekOf(p); if (!w) return null;
  const t = TYPE[type];
  return clash(w[day], t.a, t.b, type);
}
function cellClash(emp, day) {
  const p = PERSON[emp]; const w = weekOf(p); if (!w || isFree(w[day])) return null;
  return lower(dayText(w[day]));
}
function shiftCard(s, opts = {}) {
  const t = TYPE[s.type];
  const c = S.sch.avail && !opts.noBang ? clashFor(s.emp, s.day, s.type) : null;
  const tip = c ? `data-tip="${esc(first(PERSON[s.emp]))} prefers not to work ${esc(DAYL[s.day])} ${esc(c)}" data-tip2="Still scheduled. Availability is a preference."` : "";
  return `<div class="sh ${s.type === "breakfast" ? "breakfast" : s.type} ${s.isNew ? "new" : ""}" ${opts.drag ? `draggable="true" data-drag="${s.id}"` : ""} ${opts.attrs || ""}>${c ? `<i class="bang" ${tip}>!</i>` : ""}<span>${t.name}-${esc(s.job)}</span>${s.label ? `<small>${esc(s.label)}</small>` : ""}<small>${fmt(t.a)} - ${fmt(t.b)}</small></div>`;
}
function schedGrid(opts = {}) {
  const emps = opts.mine ? [PERSON.maria, ...TEAM.filter((p) => !p.me)] : TEAM;
  let h = `<div class="grid ${opts.mine ? "ro" : ""}">
    <div class="loc"><i></i>Harbor &amp; Vine Downtown</div>
    <div class="eh">EMPLOYEES</div>${DAYS.map((d, i) => `<div class="dh ${i === TODAY ? "today" : ""}">${d.toUpperCase()}<b>${DATE[i]}</b></div>`).join("")}`;
  if (!opts.mine) {
    h += `<div class="nm open-nm">Open shifts<small>Drag to a person, or click</small></div>` + DAYS.map((_, i) => {
      const os = S.sch.open.filter((o) => o.day === i);
      return `<div class="cell open-row">${os.map((o) => `<div class="sh ${o.type} open drag" draggable="true" data-drag="${o.id}" data-act="open-assign" data-id="${o.id}" tabindex="0" role="button" aria-label="Open shift ${TYPE[o.type].name} ${o.job}, assign"><span>${TYPE[o.type].name}-${esc(o.job)}</span><small>${fmt(TYPE[o.type].a)} - ${fmt(TYPE[o.type].b)}</small></div>`).join("")}</div>`;
    }).join("");
  }
  emps.forEach((p) => {
    const me = opts.mine && p.me;
    h += `<div class="nm ${me ? "me" : ""}">${esc(p.name)}${me ? '<span class="you">You</span>' : ""}</div>`;
    DAYS.forEach((_, i) => {
      const ss = cellShifts(p.id, i);
      if (opts.mine) {
        h += `<div class="cell ${me ? "me" : ""}">${ss.map((s) => (me && S.variant !== "o" ? shiftCard(s, { attrs: `data-act="ms-flag" data-id="${s.id}" ${clashFor(s.emp, s.day, s.type) ? 'role="button" tabindex="0"' : ""}` }) : shiftCard(s, { noBang: true }))).join("")}</div>`;
        return;
      }
      const empty = !ss.length;
      const cc = empty && S.sch.avail ? cellClash(p.id, i) : null;
      h += `<div class="cell ${empty ? "empty" : ""}" ${empty ? `data-drop="${p.id}|${i}" data-act="cell-add" data-emp="${p.id}" data-day="${i}"` : ""}>${cc ? `<i class="bang" data-tip="${esc(first(p))} prefers not to work ${esc(DAYL[i])} ${esc(cc)}" data-tip2="You can still schedule ${esc(first(p))}.">!</i>` : ""}${ss.map((s) => shiftCard(s)).join("")}${empty ? `<span class="add-hint">${icon("plus", 14)}</span>` : ""}</div>`;
    });
  });
  return h + "</div>";
}
function scheduleDesk() {
  const orig = S.variant === "o";
  const top = `<div class="sch-top"><button type="button" class="btn icon sm">${icon("chevL", 15)}</button><span class="btn sm">${icon("cal", 14)} Oct 12 – Oct 18, 2026</span><button type="button" class="btn icon sm">${icon("chevR", 15)}</button><span class="btn sm">${icon("pin", 14)} All locations</span><span class="btn sm">${icon("clock", 14)} All shifts</span><span class="btn sm">${icon("brief", 14)} All jobs</span>
    <span class="right"><button type="button" class="btn dark sm">${icon("download", 14)} Export</button><button type="button" class="btn dark sm">${icon("layout", 14)} Templates</button><button type="button" class="btn go sm" data-act="publish">${icon("send", 14)} Publish</button></span></div>`;
  const edit = `<div class="sch-edit"><span class="lbl2">${icon("pencil", 14)} Editing draft · Oct 12 – Oct 18</span><button type="button" class="btn sm">${icon("undo", 13)} Undo</button><button type="button" class="btn sm ${S.sch.avail ? "on" : ""}" data-act="sched-avail" aria-pressed="${S.sch.avail}">${icon(S.sch.avail ? "eye" : "eyeOff", 14)} Availability ${S.sch.avail ? "on" : "off"}</button><button type="button" class="btn sm">${icon("wand", 14)} Auto-fill</button><button type="button" class="btn sm">${icon("x", 14)} Discard</button></div>`;
  const hint = orig ? "" : `<div class="sch-hint">${icon("info", 14)}<span>An orange <i class="bang">!</i> means the person prefers not to work then. It never blocks: drag the open Friday shift onto Maria or Aisha to see the short note.</span></div>`;
  const m = S.sch.modal;
  const modal = m ? `<div class="modal-back"><div class="modal" role="alertdialog" aria-label="Schedule this shift anyway?"><div class="modal-hd">${icon("alert", 18)} Schedule this shift anyway?</div><div class="modal-bd">${esc(PERSON[m.emp].name)} is unavailable ${esc(DAYL[m.day])} ${esc(m.reason)}. You can still place the shift.</div><div class="modal-ft"><button type="button" class="btn" data-act="modal-cancel">Cancel</button><button type="button" class="btn go" data-act="modal-place">Place shift</button></div></div></div>` : "";
  return app("mgr", "sched", top + edit + hint + `<div class="sch-wrap">${schedGrid()}</div>`) + modal;
}
function myschedDesk() {
  return app("emp", "sched", `<div class="page">${header("Your week, without surprises.", "Schedule", "Your published shifts, with the hours, location and position for each one.")}
    ${S.variant === "o" ? "" : `<div class="sch-hint emp">${icon("info", 14)}<span>Shifts at a time you marked unavailable carry an orange <i class="bang">!</i>. Click it to see your options.</span></div>`}
    <div class="sch-wrap card">${schedGrid({ mine: true })}</div></div>`);
}

/* ---------------- phone ---------------- */
function phoneShell(inner, opts = {}) {
  const tabs = opts.nav === "mgr" ? [["home", "Home"], ["users", "Team"], ["swap", "Requests"], ["grid", "More"]] : [["home", "Home"], ["caldays", "Schedule"], ["swap", "Requests"], ["grid", "More"]];
  return `<div class="phone"><div class="phone-scr">
    <div class="ph-status"><span>9:41</span><span class="isl"></span><span class="ph-sig">${icon("wifi", 15)}${icon("battery", 20)}</span></div>
    ${opts.top || ""}<div class="ph-body ${opts.bodyCls || ""}">${inner}</div>${opts.bar || ""}
    ${opts.noNav ? "" : `<nav class="ph-nav">${tabs.map(([ic, l]) => `<span class="${opts.active === l ? "on" : ""}">${icon(ic, 19)}${l}</span>`).join("")}</nav>`}
    ${opts.sheet || ""}</div></div>`;
}
const phHead = (eyebrow, title, desc) => `<div class="ph-head"><span class="eyebrow">${eyebrow}</span><h1>${title}<i></i></h1>${desc ? `<p>${desc}</p>` : ""}</div>`;
function phSheet() {
  const V = cur();
  if (!S.ph.sheet || !V.phoneSheet) return "";
  return `<div class="sheet-back" data-act="ph-sheet-close"></div><div class="sheet" role="dialog"><div class="grab"></div>${V.phoneSheet()}</div>`;
}
function phSaveBar() {
  if (!dirty()) return "";
  return `<div class="ph-savebar"><span class="grow">${changedDays()} changed</span><button type="button" class="btn ghost sm" data-act="discard">Discard</button><button type="button" class="btn go sm" data-act="save">Save</button></div>`;
}
function minePhone() {
  const V = cur();
  return phoneShell(`${phHead("When you can work.", "My Availability", "Set your weekly preferences and request time off.")}
    <div class="ph-tabs"><span class="on">${icon("calcheck", 15)} Availability</span><span>${icon("calx", 15)} Time Off</span></div>
    ${S.variant === "o" ? "" : `<div class="ph-promise">${icon("info", 14)}<span>${PROMISE}</span></div>`}
    ${V.phoneEditor({ where: "mine" })}`, { active: "More", bar: phSaveBar(), sheet: phSheet() });
}
function onboardPhone() {
  const V = cur();
  if (S.ob === "review") {
    return phoneShell(`<div class="ph-ob-top"><b>NEWFORK</b><span>Step 4 of 4</span></div><div class="ob-prog"><i style="width:75%"></i></div>
      <h1 class="ph-ob-h">Review and finish</h1><div class="ph-card ph-review"><div><b>Profile</b><span>Complete</span></div><div><b>Documents</b><span>2 signed</span></div><div><b>Availability</b><span>${S.obSkipped ? "Skipped" : sentence(S.week)}</span><button type="button" class="btn sm quiet" data-act="ob-back">Edit</button></div></div>`,
      { noNav: true, bar: `<div class="ph-ob-foot"><button type="button" class="btn go" data-act="ob-finish">Finish onboarding</button></div>` });
  }
  const orig = S.variant === "o";
  return phoneShell(`<div class="ph-ob-top"><b>NEWFORK</b><span>Step 3 of 4</span></div><div class="ob-prog"><i style="width:50%"></i></div>
    <h1 class="ph-ob-h">${orig ? "The hours you can work" : "When do you prefer not to work?"}</h1><p class="ph-ob-lead">${orig ? "Mark the hours you are not available in a normal week. Your manager builds the schedule around it." : "Optional. It's a preference, not a guarantee: if you're scheduled, the shift is yours."}</p>
    ${V.phoneEditor({ where: "onboard" })}`,
    { noNav: true, sheet: phSheet(), bar: `<div class="ph-ob-foot"><button type="button" class="btn" data-act="ob-skip">Skip for now</button><button type="button" class="btn go" data-act="ob-save">${orig ? "Save" : "Save and continue"}</button></div>` });
}
function teamPhone() {
  const V = cur();
  if (S.ph.person) return personPhone();
  const tab = (id, label) => `<button type="button" data-act="team-tab" data-v="${id}" aria-pressed="${S.teamTab === id}">${label}</button>`;
  return phoneShell(`${phHead(S.variant === "o" ? "Availability clear. Coverage ready." : "Team availability", "Availability", "")}
    <div class="seg ph-seg">${tab("all", "All")}${tab("sub", "Submitted")}${tab("not", "Not submitted")}</div>
    ${V.phoneTeam(teamList())}`, { nav: "mgr", active: "Team" });
}
function personPhone() {
  const V = cur();
  const p = PERSON[S.ph.person]; const w = weekOf(p);
  const notes = S.notes[p.id] || [];
  const tabs = `<div class="ph-tabs"><span class="${S.drTab === "avail" ? "on" : ""}" data-act="dr-tab" data-v="avail">Availability</span><span class="${S.drTab === "notes" ? "on" : ""}" data-act="dr-tab" data-v="notes">${S.variant === "o" ? "Reminders" : "Manager notes"}</span></div>`;
  const body = S.drTab === "notes"
    ? `<p class="ro-line">${icon("eyeOff", 14)} Only managers see these notes.</p>${notes.length ? notes.map((n) => `<div class="ph-note"><b>${DAYL[n.day]}</b><p>${esc(n.text)}</p></div>`).join("") : `<p class="muted">No notes yet.</p>`}`
    : !w ? `<div class="empty-state">${icon("calx", 24)}<b>${esc(first(p))} hasn't shared availability yet.</b><span>It's optional. Until then, every time counts as available.</span></div>`
    : S.variant === "o" ? V.phoneReadOnly(p)
    : `<div class="ro-bar">${icon("lock", 13)}<span>Only ${esc(first(p))} can change this · ${p.me ? S.savedAt : p.upd}</span></div>${summaryLine(w, first(p))}${V.phoneReadOnly(p)}`;
  return phoneShell(`<div class="ph-back"><button type="button" class="btn ghost sm" data-act="ph-person-close">${icon("chevL", 16)} Availability</button></div>
    <div class="ph-person"><span class="avatar">${initials(p.name)}</span><div><b>${esc(p.name)}</b><small>${esc(p.job)} · ${p.code}</small></div></div>${tabs}${body}`, { nav: "mgr", active: "Team" });
}
function myschedPhone(opts = {}) {
  const orig = S.variant === "o";
  const mine = S.sch.shifts.filter((s) => s.emp === "maria");
  const days = DAYS.map((d, i) => {
    const ss = mine.filter((s) => s.day === i);
    return `<div class="pms-day ${i === TODAY ? "today" : ""}"><div class="pms-date"><span>${d}</span><b>${DATE[i]}</b></div><div class="pms-list">${ss.length ? ss.map((s) => {
      const t = TYPE[s.type]; const c = orig ? null : clashFor("maria", i, s.type);
      return `<div class="pms-shift ${s.type} ${s.isNew ? "new" : ""}"><b>${t.name} · ${esc(s.job)}</b><span>${fmt(t.a)} – ${fmt(t.b)}</span><small>${icon("pin", 12)} Downtown</small>${c ? `<div class="flag">${icon("alert", 15)}<div><b>You marked ${DAYL[i]} ${esc(c)} unavailable.</b> You're scheduled, so the shift is yours.<div class="acts"><button type="button" class="btn">${icon("swap", 13)} Swap or give up</button><button type="button" class="btn">${icon("calx", 13)} Request time off</button></div></div></div>` : ""}</div>`;
    }).join("") : `<span class="pms-off">No shift</span>`}</div></div>`;
  }).join("");
  return phoneShell(`${phHead("Your week, without surprises.", "Schedule", "")}<div class="pms-week">Oct 12 – Oct 18</div>${days}`, { active: "Schedule" });
}

/* ---------------- popovers, tooltips, toasts ---------------- */
let popEl = null, popAnchor = null;
function closePop() { if (popEl) { popEl.remove(); popEl = null; if (popAnchor && document.contains(popAnchor)) popAnchor.focus({ preventScroll: true }); popAnchor = null; } }
function openPop(anchor, html, mount, opts = {}) {
  closePop();
  popAnchor = anchor;
  popEl = document.createElement("div");
  popEl.className = "pop " + (opts.cls || "");
  popEl.setAttribute("role", "dialog");
  popEl.innerHTML = html;
  document.body.appendChild(popEl);
  place(popEl, anchor.getBoundingClientRect(), opts);
  mount && mount(popEl);
  const f = popEl.querySelector("[autofocus]") || popEl.querySelector("input, select, button"); f && f.focus({ preventScroll: true });
}
function place(el, a, opts = {}) {
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = opts.align === "end" ? a.right - w : opts.align === "center" ? a.left + a.width / 2 - w / 2 : a.left;
  left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
  let top = a.bottom + 6; if (top + h > window.innerHeight - 12) top = Math.max(12, a.top - h - 6);
  el.style.left = left + "px"; el.style.top = top + "px";
}
let swallow = false;
document.addEventListener("mousedown", (e) => { if (popEl && !popEl.contains(e.target)) { const inAnchor = popAnchor && popAnchor.contains(e.target); closePop(); if (inAnchor) swallow = true; } }, true);
document.addEventListener("click", (e) => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (popEl) closePop(); else if (S.ph.sheet) { S.ph.sheet = null; render(); } else if (S.screen === "drawer") { S.screen = "team"; render(); } } });
window.addEventListener("resize", closePop);

let tipEl = null;
function showTip(t) {
  hideTip();
  tipEl = document.createElement("div"); tipEl.className = "tip"; tipEl.setAttribute("role", "tooltip");
  tipEl.innerHTML = `${esc(t.dataset.tip)}${t.dataset.tip2 ? `<small>${esc(t.dataset.tip2)}</small>` : ""}`;
  document.body.appendChild(tipEl);
  place(tipEl, t.getBoundingClientRect(), { align: "center" });
}
function hideTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }
document.addEventListener("mouseover", (e) => { const t = e.target.closest && e.target.closest("[data-tip]"); if (t) showTip(t); else hideTip(); });
document.addEventListener("scroll", hideTip, true);

function toastWrap(where) {
  const id = "toasts-" + where;
  let w = document.getElementById(id);
  if (!w) { w = document.createElement("div"); w.id = id; w.className = "toast-wrap"; document.body.appendChild(w); }
  const host = where === "phone" ? document.querySelector(".phone-scr") : document.querySelector(".mk-desk");
  const r = host ? host.getBoundingClientRect() : { left: 0, width: window.innerWidth, bottom: window.innerHeight };
  Object.assign(w.style, { position: "fixed", left: r.left + r.width / 2 + "px", bottom: window.innerHeight - r.bottom + (where === "phone" ? 86 : 84) + "px", width: Math.min(where === "phone" ? r.width - 24 : 560, r.width - 24) + "px" });
  return w;
}
function toast(html, opts = {}) {
  const where = opts.where || (S.view === "phone" ? "phone" : "desk");
  if (where === "desk" && S.view === "phone") return;
  const w = toastWrap(where);
  const el = document.createElement("div");
  el.className = "toast" + (opts.warn ? " warn" : "");
  el.setAttribute("role", "status");
  const ms = opts.ms || 5000;
  el.innerHTML = `${opts.warn ? '<i class="bang">!</i>' : icon("circleCheck", 17)}<div class="t-bd">${html}</div>${opts.undo ? '<button type="button">Undo</button>' : ""}<i class="timer" style="animation-duration:${ms}ms"></i>`;
  if (opts.undo) el.querySelector("button").onclick = () => { opts.undo(); el.remove(); render(); };
  w.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* ---------------- actions ---------------- */
function save() {
  S.saved = clone(S.week); S.savedAt = "Just now";
  toast(`<b>Availability saved.</b><small>Your managers see it now. Shifts already scheduled don't change.</small>`, { where: S.view === "phone" ? "phone" : "desk" });
  render();
}
function assign(id, emp, day, confirmed) {
  const sch = S.sch;
  const o = sch.open.find((x) => x.id === id);
  if (!o) return;
  const reason = clashFor(emp, day, o.type);
  if (S.variant === "o" && reason && !confirmed) { sch.modal = { kind: "assign", id, emp, day, reason }; render(); return; }
  placeShift({ emp, day, type: o.type, job: o.job }, () => { sch.open.push(o); }, reason);
  sch.open = sch.open.filter((x) => x.id !== id);
  render();
}
function placeShift(s, onUndo, reason) {
  const sch = S.sch;
  sch.shifts.forEach((x) => (x.isNew = false));
  const shift = Object.assign({ id: "n" + sch.seq++, label: null, isNew: true }, s);
  sch.shifts.push(shift);
  const p = PERSON[s.emp];
  const undo = () => { sch.shifts = sch.shifts.filter((x) => x.id !== shift.id); onUndo && onUndo(); };
  if (reason && S.variant !== "o") toast(`<b>Shift added to ${esc(p.name)}.</b><small>${esc(first(p))} prefers not to work ${esc(DAYL[s.day])} ${esc(reason)}.</small>`, { warn: true, undo, where: "desk" });
  else toast(`<b>Shift added to ${esc(p.name)}.</b><small>${TYPE[s.type].name} · ${esc(s.job)} · ${DAYL[s.day]}</small>`, { undo, where: "desk" });
  if (s.emp === "maria" && S.view !== "desk") setTimeout(() => toast(`<b>New shift: ${DAYL[s.day]} ${TYPE[s.type].name}</b><small>${fmt(TYPE[s.type].a)} – ${fmt(TYPE[s.type].b)} · Downtown</small>`, { where: "phone", ms: 4000 }), 350);
}
function openAssign(anchor, id) {
  const o = S.sch.open.find((x) => x.id === id); if (!o) return;
  const rows = TEAM.map((p) => {
    const busy = cellShifts(p.id, o.day).length > 0;
    const c = clashFor(p.id, o.day, o.type);
    return `<button type="button" class="pick" data-emp="${p.id}" ${busy ? "disabled" : ""}><span class="avatar">${initials(p.name)}</span><span class="pk-nm"><b>${esc(p.name)}</b><small>${busy ? "Already working this day" : c ? `Prefers not to work ${esc(c)}` : esc(p.job)}</small></span>${c && !busy ? '<i class="bang">!</i>' : ""}</button>`;
  }).join("");
  openPop(anchor, `<div class="pop-hd"><strong>Assign ${TYPE[o.type].name} · ${esc(o.job)}</strong><small>${DAYL[o.day]}</small></div><div class="pop-bd picks">${rows}</div><div class="pop-ft"><span class="muted">${S.variant === "o" ? "" : "An orange ! never blocks. You decide."}</span></div>`, (el) => {
    el.addEventListener("click", (e) => { const b = e.target.closest(".pick"); if (!b || b.disabled) return; closePop(); assign(id, b.dataset.emp, o.day); });
  }, { cls: "pop-assign" });
}
function openAddShift(anchor, emp, day) {
  const p = PERSON[emp];
  let type = "dinner";
  const html = () => `<div class="pop-hd"><strong>Add shift</strong><small>${esc(p.name)} · ${DAYS[day]} ${DATE[day]}</small></div><div class="pop-bd">
    <span class="lbl">Shift type</span><div class="seg">${TYPES.map((t) => `<button type="button" data-type="${t.id}" aria-pressed="${t.id === type}">${t.name}</button>`).join("")}</div>
    <span class="lbl">Job</span><select class="field" aria-label="Job"><option>${esc(p.job)}</option><option>Server</option><option>Host</option></select>
    <div class="as-time">${icon("clock", 14)} ${fmt(TYPE[type].a)} – ${fmt(TYPE[type].b)}</div>
    ${(() => { const c = S.variant === "o" ? null : clashFor(emp, day, type); return c ? `<div class="as-warn"><i class="bang">!</i><span>${esc(first(p))} prefers not to work ${esc(c)}. You can still add it.</span></div>` : ""; })()}
    </div><div class="pop-ft"><span class="grow"></span><button type="button" class="btn sm" data-x="cancel">Cancel</button><button type="button" class="btn go sm" data-x="add">Add shift</button></div>`;
  openPop(anchor, html(), (el) => {
    el.addEventListener("click", (e) => {
      const tb = e.target.closest("[data-type]"); if (tb) { type = tb.dataset.type; el.innerHTML = html(); return; }
      const x = e.target.closest("[data-x]"); if (!x) return;
      if (x.dataset.x === "cancel") { closePop(); return; }
      const reason = clashFor(emp, day, type);
      closePop();
      if (S.variant === "o" && reason) { S.sch.modal = { kind: "add", emp, day, type, job: p.job, reason }; render(); return; }
      placeShift({ emp, day, type, job: p.job }, null, reason); render();
    });
  }, { cls: "pop-add" });
}
function openFlag(anchor, id) {
  const s = shiftOf(id); const c = s && clashFor(s.emp, s.day, s.type);
  if (!c) return;
  openPop(anchor, `<div class="pop-hd"><i class="bang">!</i><strong>You marked this time unavailable</strong></div><div class="pop-bd"><p class="pop-p">${DAYL[s.day]} ${esc(c)}. You're scheduled, so the shift is yours. If you can't work it:</p></div><div class="pop-ft"><button type="button" class="btn sm">${icon("swap", 13)} Swap or give up</button><button type="button" class="btn sm">${icon("calx", 13)} Request time off</button></div>`, null, { cls: "pop-flag" });
}
function openNote(anchor, day) {
  const p = PERSON[S.person]; const list = (S.notes[p.id] = S.notes[p.id] || []);
  const n = list.find((x) => x.day === day);
  openPop(anchor, `<div class="pop-hd"><strong>${DAYL[day]} note</strong><small>Only managers</small></div><div class="pop-bd"><textarea class="ta" rows="3" autofocus placeholder="e.g. Prefers closing shifts on Fridays">${esc(n ? n.text : "")}</textarea></div><div class="pop-ft">${n ? '<button type="button" class="btn sm ghost" data-x="del">Delete</button>' : ""}<span class="grow"></span><button type="button" class="btn sm" data-x="cancel">Cancel</button><button type="button" class="btn go sm" data-x="ok">Save note</button></div>`, (el) => {
    el.addEventListener("click", (e) => {
      const x = e.target.closest("[data-x]"); if (!x) return;
      if (x.dataset.x === "ok") { const v = el.querySelector("textarea").value.trim(); const i = list.findIndex((y) => y.day === day); if (i >= 0) list.splice(i, 1); if (v) list.push({ day, text: v }); }
      if (x.dataset.x === "del") { const i = list.findIndex((y) => y.day === day); if (i >= 0) list.splice(i, 1); }
      closePop(); render();
    });
  }, { align: "end" });
}

/* ---------------- render ---------------- */
let root = null;
const SCREENS = [["mine", "My Availability"], ["onboard", "Onboarding"], ["team", "Team"], ["drawer", "Drawer"], ["schedule", "Schedule"], ["mysched", "Employee schedule"]];
function chrome() {
  const seg = (k, list, val, title) => `<div class="mk-seg" ${title ? `title="${title}"` : ""}>${list.map(([v, l]) => `<button type="button" data-mk="${k}" data-v="${v}" aria-pressed="${val === v}">${l}</button>`).join("")}</div>`;
  return `<div class="mk-bar"><div class="mk-title">Availability <small>mockups</small></div>
    <div class="mk-group"><span>Mockup</span>${seg("variant", NF.order.filter((v) => NF.variants[v]).map((v) => [v, NF.variants[v].name]), S.variant)}</div>
    <div class="mk-group"><span>Screen</span>${seg("screen", SCREENS, S.screen)}</div>
    <div class="mk-group"><span>Show</span>${seg("view", [["both", "Both"], ["desk", "Desktop"], ["phone", "Phone"]], S.view)}</div>
    <div class="mk-group"><span>Entry</span>${seg("mode", [["hours", "Hours"], ["types", "Shift types"]], S.mode, "Workspace setting: Settings → Scheduling → availability entry")}</div>
    <span class="mk-spacer"></span><button type="button" class="mk-about" data-mk="about" aria-pressed="${S.about}">${icon("info", 14)} Bu tasarım</button><button type="button" class="mk-about ghost" data-mk="reset">${icon("rotate", 14)} Baştan</button></div>`;
}
function aboutPanel() {
  const V = cur();
  if (!S.about || !V.tr) return "";
  return `<div class="mk-tr" role="note"><h4><span>${esc(V.name)} · ${esc(V.tr.ad)}</span><button type="button" data-mk="about" aria-label="Kapat">${icon("x", 15)}</button></h4><dl><dt>Fikir</dt><dd>${V.tr.fikir}</dd><dt>Artı</dt><dd>${V.tr.arti}</dd><dt>Eksi</dt><dd>${V.tr.eksi}</dd>${V.tr.dene ? `<dt>Dene</dt><dd>${V.tr.dene}</dd>` : ""}</dl></div>`;
}
function deskScreen() {
  switch (S.screen) {
    case "onboard": return onboardDesk();
    case "team": return teamDesk();
    case "drawer": return teamDesk() + drawerHTML();
    case "schedule": return scheduleDesk();
    case "mysched": return myschedDesk();
    default: return mineDesk();
  }
}
function phoneScreen() {
  switch (S.screen) {
    case "onboard": return onboardPhone();
    case "team": return teamPhone();
    case "drawer": return S.ph.person ? personPhone() : (S.ph.person = S.person, personPhone());
    case "schedule": case "mysched": return myschedPhone();
    default: return minePhone();
  }
}
const PHONE_NOTE = {
  mine: "Maria's phone. Most employees set availability here.",
  onboard: "Onboarding on the phone, right after the invite link.",
  team: "Manager on the phone. Tap a person to read their week.",
  drawer: "The same read-only view, on the phone.",
  schedule: "Maria's phone. Add the Friday shift on the desktop and it shows up here with the note.",
  mysched: "Maria's phone: her week, with the note on shifts she marked unavailable.",
};
function render() {
  if (!root) return;
  const keep = {};
  [".mk-desk", ".main", ".ph-body", ".dr-bd", ".ob-main", ".sch-wrap", ".mk-phone-col"].forEach((s) => { const e = root.querySelector(s); if (e) keep[s] = [e.scrollTop, e.scrollLeft]; });
  const ae = document.activeElement; const focusId = ae && ae.id; const caret = ae && ae.selectionStart;
  const V = cur();
  root.innerHTML = chrome() + `<div class="mk-stage" data-view="${S.view}" data-variant="${S.variant}" data-mode="${S.mode}" data-screen="${S.screen}">
    <div class="mk-desk"><div class="mk-desk-inner">${deskScreen()}</div></div>
    <div class="mk-phone-col"><div class="mk-phone-head">${S.screen === "team" || S.screen === "drawer" ? "Manager's phone" : "Employee's phone"}</div>${phoneScreen()}<div class="mk-note">${PHONE_NOTE[S.screen]}</div></div>
    ${aboutPanel()}</div>`;
  Object.entries(keep).forEach(([s, [t, l]]) => { const e = root.querySelector(s); if (e) { e.scrollTop = t; e.scrollLeft = l; } });
  if (focusId) { const f = document.getElementById(focusId); if (f) { f.focus({ preventScroll: true }); try { if (caret != null) f.setSelectionRange(caret, caret); } catch (e) {} } }
  V.after && V.after(root);
}

/* ---------------- events ---------------- */
function onClick(ev) {
  const mk = ev.target.closest("[data-mk]");
  if (mk) {
    const k = mk.dataset.mk, v = mk.dataset.v;
    closePop();
    if (k === "variant") { S.variant = v; S.ph.sheet = null; S.sch.modal = null; try { localStorage.setItem("av-variant", v); } catch (e) {} }
    else if (k === "screen") { S.screen = v; S.ph.sheet = null; S.drTab = "avail"; if (v === "drawer") { S.person = S.person || "maria"; S.ph.person = S.person; } if (v === "team") S.ph.person = null; }
    else if (k === "view") S.view = v;
    else if (k === "mode") { S.mode = v; S.ph.sheet = null; }
    else if (k === "about") S.about = !S.about;
    else if (k === "reset") reset(true);
    render();
    return;
  }
  const a = ev.target.closest("[data-act]");
  if (!a || a.disabled) return;
  const act = a.dataset.act;
  const V = cur();
  if (V.act && V.act(act, a, ev) === true) return;
  switch (act) {
    case "save": save(); break;
    case "discard": S.week = clone(S.saved); S.ph.sheet = null; render(); break;
    case "ob-save": S.saved = clone(S.week); S.savedAt = "Just now"; S.obSkipped = false; S.ob = "review"; S.ph.sheet = null; render(); break;
    case "ob-skip": S.obSkipped = true; S.ob = "review"; S.ph.sheet = null; render(); break;
    case "ob-back": S.ob = "step"; render(); break;
    case "ob-finish": toast(`<b>Welcome to Harbor &amp; Vine.</b><small>Onboarding is done.</small>`, { where: S.view === "phone" ? "phone" : "desk" }); break;
    case "team-tab": S.teamTab = a.dataset.v; render(); break;
    case "person": S.person = a.dataset.id; S.drTab = "avail"; if (a.closest(".phone")) { S.ph.person = a.dataset.id; } else { S.screen = "drawer"; S.ph.person = a.dataset.id; } render(); break;
    case "dr-close": S.screen = "team"; S.ph.person = null; render(); break;
    case "dr-tab": S.drTab = a.dataset.v; render(); break;
    case "note-edit": openNote(a, +a.dataset.day); break;
    case "ph-person-close": S.ph.person = null; if (S.screen === "drawer") S.screen = "team"; render(); break;
    case "ph-sheet-close": S.ph.sheet = null; render(); break;
    case "sched-avail": S.sch.avail = !S.sch.avail; render(); break;
    case "open-assign": openAssign(a, a.dataset.id); break;
    case "cell-add": openAddShift(a, a.dataset.emp, +a.dataset.day); break;
    case "ms-flag": openFlag(a, a.dataset.id); break;
    case "modal-cancel": S.sch.modal = null; render(); break;
    case "modal-place": {
      const m = S.sch.modal; S.sch.modal = null;
      if (m.kind === "assign") assign(m.id, m.emp, m.day, true);
      else { placeShift({ emp: m.emp, day: m.day, type: m.type, job: m.job }, null, m.reason); render(); }
      break;
    }
    case "publish": toast(`<b>Publishing works as today.</b><small>The pre-publish list still notes shifts outside someone's availability, without a confirm step.</small>`, { where: "desk" }); break;
    default: break;
  }
}
function onInput(ev) {
  const t = ev.target;
  if (t.dataset.input === "q") { S.q = t.value; render(); return; }
  const V = cur(); V.input && V.input(ev);
}
function onChange(ev) { const V = cur(); V.change && V.change(ev); }
let dragId = null;
function onDragStart(ev) { const d = ev.target.closest && ev.target.closest("[data-drag]"); if (!d) return; dragId = d.dataset.drag; d.classList.add("dragging"); ev.dataTransfer.effectAllowed = "move"; try { ev.dataTransfer.setData("text/plain", dragId); } catch (e) {} hideTip(); }
function dropTarget(ev) {
  const c = ev.target.closest && ev.target.closest("[data-drop]"); if (!c || !dragId) return null;
  const o = S.sch.open.find((x) => x.id === dragId); if (!o) return null;
  const [emp, day] = c.dataset.drop.split("|");
  return +day === o.day ? { c, emp, day: +day } : null;
}
function onDragOver(ev) {
  root.querySelectorAll(".cell.drop").forEach((x) => x.classList.remove("drop"));
  const t = dropTarget(ev); if (!t) return;
  ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; t.c.classList.add("drop");
}
function onDrop(ev) { const t = dropTarget(ev); if (!t) return; ev.preventDefault(); const id = dragId; dragId = null; assign(id, t.emp, t.day); }
function onDragEnd() { dragId = null; root && root.querySelectorAll(".dragging,.cell.drop").forEach((x) => x.classList.remove("dragging", "drop")); }
function onKey(ev) {
  const V = cur(); if (V.key && V.key(ev) === true) return;
  if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches && ev.target.matches("[role=button][data-act]")) { ev.preventDefault(); ev.target.click(); }
}

NF.mount = function (el) {
  root = el;
  try { const v = localStorage.getItem("av-variant"); if (v && NF.variants[v]) S.variant = v; } catch (e) {}
  const h = (location.hash || "").replace("#", "");
  h.split("&").forEach((kv) => { const [k, v] = kv.split("="); if (k === "v" && NF.variants[v]) S.variant = v; if (k === "s" && SCREENS.some(([id]) => id === v)) S.screen = v; if (k === "view") S.view = v; if (k === "mode") S.mode = v; if (k === "about") S.about = v === "1"; });
  if (!/view=/.test(h)) S.view = window.innerWidth < 900 ? "phone" : window.innerWidth >= 1680 ? "both" : "desk";
  if (S.screen === "drawer") S.ph.person = S.person;
  el.addEventListener("click", onClick); el.addEventListener("input", onInput); el.addEventListener("change", onChange);
  el.addEventListener("dragstart", onDragStart); el.addEventListener("dragover", onDragOver); el.addEventListener("drop", onDrop); el.addEventListener("dragend", onDragEnd);
  el.addEventListener("keydown", onKey);
  el.addEventListener("pointerdown", (ev) => { const V = cur(); V.down && V.down(ev); });
  el.addEventListener("pointermove", (ev) => { const V = cur(); V.move && V.move(ev); });
  el.addEventListener("mouseover", (ev) => { const V = cur(); V.over && V.over(ev); });
  el.addEventListener("mouseleave", (ev) => { const V = cur(); V.over && V.over(ev); });
  render();
};

Object.assign(NF, {
  I, icon, esc, clone, initials, join, OPEN, CLOSE, SPAN, STEP, DAYS, DAYL, DAYP, DATE, TODAY, fmt, fmtC, fmtS, pct, snap, clamp, TIMES, timeLabel, timeSelect, scaleHTML, TYPES, TYPE,
  blank, norm, mergeR, subR, asRanges, drag, isFree, dayState, rangeText, lower, dayText, blocks, clash, parts, daysLabel, partText, sentence, PROMISE, PROMISE_MGR,
  TEAM, PERSON, first, cur, vs, weekOf, dirty, setDay, setDays, railHTML, typePills, statusDot, summaryLine,
  openPop, closePop, place, toast, render, save,
});
})();
