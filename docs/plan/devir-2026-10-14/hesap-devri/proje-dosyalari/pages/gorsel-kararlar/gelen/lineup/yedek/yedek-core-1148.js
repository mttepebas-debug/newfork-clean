/* Lineup mockup engine: demo world, state, actions, popovers, share, export, live events, phone.
   Variants (a.js, b.js, c.js) only decide how the cockpit and the phone look. */
(function () {
"use strict";
const NF = (window.NF = window.NF || {});

/* ---------------- icons (lucide shapes) ---------------- */
const I = {
  chevL: '<path d="m15 18-6-6 6-6"/>', chevR: '<path d="m9 18 6-6-6-6"/>', chevD: '<path d="m6 9 6 6 6-6"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  user1: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  userx: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5M22 8l-5 5"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  dash: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  swap: '<path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  mega: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  list: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
  calcheck: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', settings: '<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>',
  fold: '<path d="m7 20 5-5 5 5M7 4l5 5 5-5"/>', unfold: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
  note: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  sparkle: '<path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
};
const icon = (n, s = 16) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ""}</svg>`;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------------- demo world (US restaurant, same names as the PAGES demo) ---------------- */
const WS = "Harbor & Vine";
const LOCS = [
  { id: "dt", name: "Harbor & Vine Downtown", short: "Downtown", color: "#2563EB" },
  { id: "up", name: "Harbor & Vine Uptown", short: "Uptown", color: "#059669" },
];
const DEPTS = [
  { id: "foh", name: "Front of House" }, { id: "bar", name: "Bar" }, { id: "kit", name: "Kitchen" },
];
const JOBS = [
  { id: "server", name: "Server", dept: "foh", color: "#2563EB" },
  { id: "host", name: "Host", dept: "foh", color: "#0891B2" },
  { id: "busser", name: "Busser", dept: "foh", color: "#4F46E5" },
  { id: "bartender", name: "Bartender", dept: "bar", color: "#7C3AED" },
  { id: "barback", name: "Barback", dept: "bar", color: "#A855F7" },
  { id: "line", name: "Line Cook", dept: "kit", color: "#DC2626" },
  { id: "prep", name: "Prep Cook", dept: "kit", color: "#EA580C" },
  { id: "dish", name: "Dishwasher", dept: "kit", color: "#B45309" },
];
const TYPES = [
  { id: "breakfast", name: "Breakfast", color: "#F59E0B", start: "07:00", end: "12:00" },
  { id: "lunch", name: "Lunch", color: "#10B981", start: "11:00", end: "16:00" },
  { id: "dinner", name: "Dinner", color: "#6366F1", start: "16:00", end: "22:00" },
  { id: "close", name: "Close", color: "#EC4899", start: "18:00", end: "23:30" },
];
const LABELS = [
  { id: "training", name: "Training", color: "#0EA5E9" }, { id: "opener", name: "Opener", color: "#84CC16" },
  { id: "closer", name: "Closer", color: "#F97316" }, { id: "event", name: "Private event", color: "#A855F7" },
];
const SECTIONS = {
  dt: ["Section 1", "Section 2", "Section 3", "Patio", "Bar", "Host stand", "Line", "Prep", "Dish pit"],
  up: ["Section 1", "Section 2", "Bar", "Host stand", "Line", "Dish pit"],
};
// app: has a Newfork account (gets the lineup on the phone). unav: weekday (Mon=0) -> "HH:MM" after which they prefer not to work.
const EMPS = [
  { id: "maria", name: "Maria Lopez", jobs: ["server", "host"], locs: ["dt"], app: true },
  { id: "jake", name: "Jake Thompson", jobs: ["server", "bartender"], locs: ["dt", "up"], app: true },
  { id: "priya", name: "Priya Patel", jobs: ["host", "server"], locs: ["dt"], app: true },
  { id: "ethan", name: "Ethan Brooks", jobs: ["busser", "server"], locs: ["dt"], app: true },
  { id: "sophie", name: "Sophie Martin", jobs: ["bartender", "barback"], locs: ["dt", "up"], app: true },
  { id: "dkim", name: "Daniel Kim", jobs: ["barback", "busser"], locs: ["dt"], app: true },
  { id: "carlos", name: "Carlos Rivera", jobs: ["line", "prep"], locs: ["dt"], app: true },
  { id: "aisha", name: "Aisha Johnson", jobs: ["line"], locs: ["dt", "up"], app: true },
  { id: "tom", name: "Tom Becker", jobs: ["prep", "dish"], locs: ["dt"], app: false },
  { id: "luis", name: "Luis Hernandez", jobs: ["dish"], locs: ["dt"], app: false },
  { id: "hannah", name: "Hannah Lee", jobs: ["server"], locs: ["dt"], app: true },
  { id: "ben", name: "Ben Carter", jobs: ["server", "bartender"], locs: ["dt"], app: true },
  { id: "ava", name: "Ava Martinez", jobs: ["server", "host"], locs: ["dt"], app: true },
  { id: "chloe", name: "Chloe Davis", jobs: ["host"], locs: ["dt"], app: true },
  { id: "ryan", name: "Ryan Cooper", jobs: ["line", "prep"], locs: ["dt"], app: false },
  { id: "leah", name: "Leah Morgan", jobs: ["bartender"], locs: ["dt"], app: true },
  { id: "owen", name: "Owen Price", jobs: ["busser", "server"], locs: ["dt"], app: true },
  { id: "lily", name: "Lily Evans", jobs: ["host", "server"], locs: ["dt"], app: true, unav: { 1: "20:00" } },
  { id: "mia", name: "Mia Robinson", jobs: ["server"], locs: ["dt"], app: true },
  { id: "emma", name: "Emma Wilson", jobs: ["server", "host"], locs: ["up"], app: true },
  { id: "noah", name: "Noah Garcia", jobs: ["server"], locs: ["up", "dt"], app: true },
  { id: "olivia", name: "Olivia Chen", jobs: ["host"], locs: ["up"], app: true },
  { id: "marcus", name: "Marcus Reed", jobs: ["line", "prep"], locs: ["up"], app: true },
  { id: "grace", name: "Grace Murphy", jobs: ["bartender"], locs: ["up"], app: true },
  { id: "sam", name: "Sam Okafor", jobs: ["dish", "prep"], locs: ["up"], app: false },
  { id: "kevin", name: "Kevin Brown", jobs: ["line"], locs: ["up"], app: true },
  { id: "zoe", name: "Zoe Bennett", jobs: ["server", "host"], locs: ["up"], app: true },
];
// [employee, job, type, weekdays (Mon=0), {label, start, end, sec}]
const PATTERNS = {
  dt: [
    ["maria", "server", "lunch", [0, 1, 2, 4, 5], { sec: "Section 1" }],
    ["hannah", "server", "lunch", [0, 1, 2, 3, 5, 6], { sec: "Section 2" }],
    ["chloe", "host", "lunch", [0, 1, 2, 3, 4, 5], { sec: "Host stand" }],
    ["dkim", "busser", "lunch", [1, 3], {}],
    ["carlos", "line", "lunch", [0, 1, 2, 3, 4], { label: "opener", start: "10:00", sec: "Line" }],
    ["tom", "prep", "lunch", [0, 1, 2, 4, 5], { start: "09:00", end: "15:00", sec: "Prep" }],
    ["tom", "prep", "breakfast", [3], { sec: "Prep" }],
    ["jake", "server", "dinner", [0, 1, 2, 3, 4], { sec: "Section 3" }],
    ["ben", "server", "dinner", [1, 2, 4, 5, 6], { sec: "Section 1" }],
    ["ava", "server", "dinner", [1, 3, 4, 5], { label: "training", sec: "Section 2" }],
    ["priya", "host", "dinner", [1, 2, 4, 5], { sec: "Host stand" }],
    ["ethan", "busser", "dinner", [0, 1, 4, 5, 6], {}],
    ["dkim", "barback", "dinner", [1, 4], { sec: "Bar" }],
    ["aisha", "line", "dinner", [1, 2, 3, 5, 6], { start: "15:30", sec: "Line" }],
    ["ryan", "line", "dinner", [0, 1, 3, 4, 5], { sec: "Line" }],
    ["luis", "dish", "dinner", [1, 2, 3, 4, 5, 6], { sec: "Dish pit" }],
    ["sophie", "bartender", "close", [1, 2, 3, 4, 5], { label: "closer", sec: "Bar" }],
    ["leah", "bartender", "close", [1, 4, 5], { start: "17:00", sec: "Bar" }],
    ["owen", "busser", "close", [4, 5], {}],
  ],
  up: [
    ["emma", "server", "lunch", [0, 1, 2, 3], { sec: "Section 1" }],
    ["olivia", "host", "lunch", [1, 2], { sec: "Host stand" }],
    ["kevin", "line", "lunch", [0, 1, 2, 3, 4], { label: "opener", sec: "Line" }],
    ["noah", "server", "dinner", [1, 2, 4, 5, 6], { sec: "Section 1" }],
    ["zoe", "server", "dinner", [1, 3, 4, 5], { sec: "Section 2" }],
    ["olivia", "host", "dinner", [3, 4, 5], { sec: "Host stand" }],
    ["marcus", "line", "dinner", [0, 1, 2, 3, 4, 5], { sec: "Line" }],
    ["sam", "dish", "dinner", [1, 2, 4, 5, 6], { sec: "Dish pit" }],
    ["grace", "bartender", "close", [1, 3, 4, 5, 6], { label: "closer", sec: "Bar" }],
  ],
};
// Important Dates (announcements with a closed / short-hours day per location)
const CLOSURES = [
  { loc: "dt", date: "2026-10-18", kind: "closed", title: "Walk-in cooler repair" },
  { loc: "up", date: "2026-10-15", kind: "short", opens: "16:00", closes: "21:00", title: "Hartwell private buyout" },
];
const TIMEOFF = [{ emp: "mia", from: "2026-10-12", to: "2026-10-14" }];
const ROLES = [
  { id: "owner", label: "Owner · Grace Whitman", who: "Grace Whitman", locs: ["dt", "up"] },
  { id: "admin", label: "Admin · Daniel Brooks", who: "Daniel Brooks", locs: ["dt", "up"] },
  { id: "manager", label: "Manager · Rachel Adams (Downtown)", who: "Rachel Adams", locs: ["dt"] },
];
const NOW_PRESETS = [
  { id: "1030", label: "Tue Oct 13 · 10:30 AM", date: "2026-10-13", time: "10:30" },
  { id: "1440", label: "Tue Oct 13 · 2:40 PM", date: "2026-10-13", time: "14:40" },
  { id: "1630", label: "Tue Oct 13 · 4:30 PM", date: "2026-10-13", time: "16:30" },
  { id: "2345", label: "Tue Oct 13 · 11:45 PM", date: "2026-10-13", time: "23:45" },
];

const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
const EMP = byId(EMPS), JOB = byId(JOBS), TYPE = byId(TYPES), LOC = byId(LOCS), LABEL = byId(LABELS), ROLE = byId(ROLES);
const DEPT_ORDER = DEPTS.map((d) => d.id);
const JOB_ORDER = JOBS.map((j) => j.id);

/* ---------------- time + date helpers ---------------- */
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fromMin = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function fmt(t) { if (S.clock === "24h") return t24(t); const m = toMin(t); const h = Math.floor(m / 60) % 24; const mm = m % 60; const ap = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12; return `${h12}:${String(mm).padStart(2, "0")} ${ap}`; }
function fmtShort(t) { if (S.clock === "24h") return t24(t); const m = toMin(t); const h = Math.floor(m / 60) % 24; const mm = m % 60; const ap = h >= 12 ? "p" : "a"; const h12 = h % 12 || 12; return mm ? `${h12}:${String(mm).padStart(2, "0")}${ap}` : `${h12}${ap}`; }
function t24(t) { const m = toMin(t); return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
/* same typing rules as the app's TimeInput (apps/web/src/schedule/timeInput.ts): "9", "930", "9:30p", "21:30" */
function parseTyped(v, clock, activePm) {
  let raw = String(v || "").trim().toLowerCase().replace(/\s+/g, " "); if (!raw) return null;
  const pm = /\s*([ap])(?:\.?\s*m\.?)?\s*$/.exec(raw); let per = null;
  if (pm) { per = pm[1]; raw = raw.slice(0, pm.index).trim(); }
  let h, mi, bare = false;
  if (raw.includes(":")) { const x = /^(\d{1,2}):(\d{2})$/.exec(raw); if (!x) return null; h = +x[1]; mi = +x[2]; }
  else { const d = raw.replace(/\D/g, ""); if (!/^\d{1,4}$/.test(d) || d.length !== raw.length) return null;
    if (d.length <= 2) { h = +d; mi = 0; bare = true; } else if (d.length === 3) { h = +d[0]; mi = +d.slice(1); } else { h = +d.slice(0, 2); mi = +d.slice(2); } }
  if (mi > 59) return null;
  if (per) { if (h < 1 || h > 12) return null; h = per === "a" ? h % 12 : (h === 12 ? 12 : h + 12); }
  else if (clock === "12h" && bare && h >= 1 && h <= 12) h = activePm ? (h === 12 ? 12 : h + 12) : h % 12;
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}
const range = (a, b) => `${fmt(a)} – ${fmt(b)}`;
const rangeShort = (a, b) => `${fmtShort(a)}–${fmtShort(b)}`;
const dObj = (d) => new Date(d + "T12:00:00");
const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = dObj(d); x.setDate(x.getDate() + n); return iso(x); };
const wd = (d) => (dObj(d).getDay() + 6) % 7; // Mon = 0
const DAYN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dLong = (d) => { const x = dObj(d); return `${DAYN[wd(d)]}, ${MON[x.getMonth()]} ${x.getDate()}`; };
const dFull = (d) => { const x = dObj(d); return `${["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][wd(d)]}, ${["January","February","March","April","May","June","July","August","September","October","November","December"][x.getMonth()]} ${x.getDate()}, ${x.getFullYear()}`; };
const weekStart = (d) => addDays(d, -wd(d));
const initials = (n) => n.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const nowClock = () => fmt(S.now.time);

/* ---------------- state ---------------- */
const S = (NF.S = {
  variant: "a", role: "owner", date: "2026-10-13", now: { ...NOW_PRESETS[1] },
  locFilter: null, typeFilter: null, // null = all in scope
  shifts: [], gen: {}, metas: {}, feed: [], flash: {}, armed: null,
  view: "both", collapsedSide: true, clock: "12h", // workspace setting: Settings → Schedule → Time format
  phoneEmp: "jake", phoneDate: "2026-10-13", phoneTab: {}, push: null, seq: 1,
  liveIdx: 0,
});
const uid = () => "s" + S.seq++;
const keyOf = (date, loc, type) => `${date}|${loc}|${type}`;
const parseKey = (k) => { const [date, loc, type] = k.split("|"); return { date, loc, type }; };
const role = () => ROLE[S.role];
const scopeLocs = () => role().locs;
const closureOf = (loc, date) => CLOSURES.find((c) => c.loc === loc && c.date === date) || null;
const onTimeOff = (emp, date) => TIMEOFF.some((t) => t.emp === emp && date >= t.from && date <= t.to);

function ensureDate(date) {
  if (S.gen[date]) return;
  S.gen[date] = true;
  for (const loc of LOCS) {
    const c = closureOf(loc.id, date);
    if (c && c.kind === "closed") continue;
    PATTERNS[loc.id].forEach(([emp, job, type, days, o], i) => {
      if (!days.includes(wd(date))) return;
      if (onTimeOff(emp, date)) return;
      const t = TYPE[type];
      S.shifts.push({ id: uid(), date, loc: loc.id, emp, job, type, start: o.start || t.start, end: o.end || t.end,
        labels: o.label ? [o.label] : [], section: o.sec || null, order: i, called: null, edited: {}, pending: false });
    });
  }
  // Past days and today's lunch were already shared; seed versions and read receipts.
  for (const loc of LOCS) for (const t of TYPES) {
    const k = keyOf(date, loc.id, t.id);
    const rows = rowsOf(k);
    if (!rows.length) continue;
    const m = meta(k);
    const earlier = date < "2026-10-13" || (date === "2026-10-13" && (t.id === "lunch" || t.id === "breakfast"));
    if (earlier) {
      m.notes.specials = { on: true, text: t.id === "lunch" ? "Soup: roasted tomato bisque\nFish: blackened redfish, citrus slaw" : "Chef's feature: braised short rib, $34" };
      m.notes.n86 = { on: true, text: "Oysters (back Thursday)" };
      doShare(k, { ack: true, silent: true, at: t.id === "lunch" ? "10:05" : "15:10", v: date === "2026-10-13" ? 2 : 1 });
      const ids = shareRecipients(k);
      ids.forEach((e, i) => { if (i < ids.length - 1) m.acks[e] = t.id === "lunch" ? "10:" + String(12 + i * 3).padStart(2, "0") : "15:" + String(20 + i * 2).padStart(2, "0"); });
    }
  }
}
function meta(k) {
  if (!S.metas[k]) S.metas[k] = { shared: null, history: [], acks: {}, liveLog: [], removed: {}, collapsed: false,
    notes: { specials: { on: true, text: "" }, n86: { on: true, text: "" }, shift: { on: false, text: "" } } };
  return S.metas[k];
}
const rowsOf = (k) => { const { date, loc, type } = parseKey(k); return S.shifts.filter((s) => s.date === date && s.loc === loc && s.type === type); };

/* lineup start = earliest start among working rows (fallback: shift type default) */
function startOf(k) {
  const rows = rowsOf(k).filter((r) => !r.called && !r.pending);
  const t = TYPE[parseKey(k).type];
  return rows.length ? fromMin(Math.min(...rows.map((r) => toMin(r.start)))) : t.start;
}
function isPast(k) {
  const { date } = parseKey(k);
  if (date < S.now.date) return true;
  if (date > S.now.date) return false;
  return toMin(S.now.time) >= toMin(startOf(k));
}
function statusOf(k) {
  const m = meta(k);
  if (isPast(k)) return "past";
  if (m.shared && !m.shared.editing) return "shared";
  if (m.shared && m.shared.editing) return "editing";
  return "draft";
}
const isLocked = (k) => { const s = statusOf(k); return s === "past" || s === "shared"; };

/* grouping: position groups, departments kept together, call-offs at the bottom */
function grouped(k) {
  const rows = rowsOf(k);
  const pending = rows.filter((r) => r.pending && !r.inGroup);
  const inGroup = rows.filter((r) => r.pending && r.inGroup); // empty rows added from a job row's + button stay at the end of that job
  const active = rows.filter((r) => !r.pending && !r.called);
  const called = rows.filter((r) => !r.pending && r.called).sort((a, b) => a.called.at.localeCompare(b.called.at));
  const jobs = [...new Set([...active, ...inGroup].map((r) => r.job))].sort((a, b) => {
    const da = DEPT_ORDER.indexOf(JOB[a].dept), db = DEPT_ORDER.indexOf(JOB[b].dept);
    return da - db || JOB_ORDER.indexOf(a) - JOB_ORDER.indexOf(b);
  });
  const groups = jobs.map((j) => ({ job: j, dept: JOB[j].dept, rows: [...active.filter((r) => r.job === j).sort((a, b) => a.order - b.order), ...inGroup.filter((r) => r.job === j)] }));
  const multiDept = new Set(groups.map((g) => g.dept)).size > 1;
  return { pending, groups, called, multiDept, working: active.filter((r) => r.emp).length, open: active.filter((r) => !r.emp).length };
}

/* visible lineups for the cockpit (filters + scope) */
function visibleLocs() { const sc = scopeLocs(); return LOCS.filter((l) => sc.includes(l.id) && (!S.locFilter || S.locFilter.includes(l.id))); }
function visibleTypes() { return TYPES.filter((t) => !S.typeFilter || S.typeFilter.includes(t.id)); }
function visibleKeys(date = S.date) {
  ensureDate(date);
  const out = [];
  for (const l of visibleLocs()) for (const t of visibleTypes()) out.push(keyOf(date, l.id, t.id));
  return out;
}
const hasRows = (k) => rowsOf(k).length > 0 || !!meta(k).shared;
/* The page header, same as the app's list pages (CatalogPageHeader: eyebrow slogan, 38px title with dot, one-line description). Mert 2026-10-13 */
function pageHeader() {
  return `<header class="cph"><div class="cph-heading"><span class="cph-eyebrow">The right people. In the right spot.</span><h1>Lineup<span class="cph-dot" aria-hidden="true"></span></h1>
    <p>Today's lineups, live from the Schedule.</p></div>
    </header>`; // Mert 2026-10-13: like our other pages, the header is alone above the separator; every button and filter sits below it
}
// Mert 2026-10-13: the whole top (title, tools, week) stays frozen while the lineups scroll
function frozenTop() { return `<div class="lu-top">${pageHeader()}${topbar({ under: true })}</div>`; }
function locCount(locId) {
  return ""; // Mert 2026-10-13: no "…" menu on the location header; Unpublish lives on each published lineup as "Edit"
  const ks = visibleKeys().filter((k) => parseKey(k).loc === locId && hasRows(k));
  const working = ks.reduce((n, k) => n + rowsOf(k).filter((r) => r.emp && !r.called && !r.pending).length, 0);
  return ks.length ? `<span class="loc-n">${ks.length} lineup${ks.length > 1 ? "s" : ""} · ${working} working</span>` : "";
}

/* ---------------- feed, toast, flash ---------------- */
function feed(text, kind = "info", k = null) { S.feed.unshift({ at: nowClock(), text, kind, k }); S.feed = S.feed.slice(0, 40); }
function flash(id) { S.flash[id] = Date.now(); }
const isFlash = (id) => S.flash[id] && Date.now() - S.flash[id] < 2600;
function toast(text, opts = {}) {
  const wrap = document.querySelector(".toast-wrap");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.innerHTML = `${opts.live ? '<span class="live">Live</span>' : ""}<span>${esc(text)}</span>${opts.undo ? '<button type="button">Undo</button>' : ""}`;
  if (opts.undo) el.querySelector("button").onclick = () => { opts.undo(); el.remove(); render(); };
  wrap.appendChild(el);
  setTimeout(() => el.remove(), opts.ms || 4200);
}

/* ---------------- edits (Mert 2026-10-13: lineup edits stay in the lineup; only a transfer from another location changes the Schedule) ---------------- */
function rowById(id) { return S.shifts.find((s) => s.id === id); }
function markEdited(r, field, oldVal) { if (!(field in r.edited)) r.edited[field] = oldVal; }
function setField(id, field, val) {
  const r = rowById(id); if (!r) return;
  const k = keyOf(r.date, r.loc, r.type);
  if (isLocked(k)) return;
  if (field === "job") {
    markEdited(r, "job", r.job); r.job = val; r.order = 999 + S.seq; flash(r.id);
    if (r.emp) toast(`${EMP[r.emp].name} works as ${JOB[val].name} in this lineup. The Schedule doesn't change.`);
  } else if (field === "type") { // Mert 2026-10-13: picking another shift type moves the person to that lineup (same day, same location)
    if (val === r.type) return;
    const nk = keyOf(r.date, r.loc, val); if (isLocked(nk)) return;
    markEdited(r, "type", r.type); r.type = val; r.order = 999 + S.seq; meta(nk).collapsed = false; flash(r.id);
    const who = r.emp ? EMP[r.emp].name : "The open row";
    feed(`${who} moved from ${TYPE[parseKey(k).type].name} to ${TYPE[val].name} · ${LOC[r.loc].short}`, "move", nk);
    toast(`${who} moved to the ${TYPE[val].name} lineup. The Schedule doesn't change.`);
  } else if (field === "section") { r.section = val || null; }
  else if (field === "start" || field === "end") { markEdited(r, field, r[field]); r[field] = val; }
  else if (field === "labels") { markEdited(r, "labels", r.labels.slice()); r.labels = val; }
  render();
}
function callOff(id) {
  const r = rowById(id); const k = keyOf(r.date, r.loc, r.type);
  if (isLocked(k)) return;
  r.called = { at: nowClock(), by: role().who };
  flash(r.id);
  feed(`${EMP[r.emp].name} called off · ${TYPE[r.type].name} ${LOC[r.loc].short}`, "call", k);
  toast(`${EMP[r.emp].name} is called off in this lineup. The Schedule doesn't change.`, { undo: () => { r.called = null; } });
  render();
}
function restore(id) { const r = rowById(id); if (isLocked(keyOf(r.date, r.loc, r.type))) return; r.called = null; flash(r.id); toast(`${EMP[r.emp].name} is back on the lineup.`); render(); }
function addStaff(k) {
  if (isLocked(k)) return;
  const { date, loc, type } = parseKey(k); const t = TYPE[type];
  const r = { id: uid(), date, loc, emp: null, job: null, type, start: t.start, end: t.end, labels: [], section: null, order: 0, called: null, edited: {}, pending: true, added: true };
  S.shifts.push(r); meta(k).collapsed = false; render();
  setTimeout(() => { const el = document.querySelector(`[data-pick="${r.id}"]`); if (el) el.focus(); }, 30);
}
function jobAddBtn(k, job, locked) {
  if (locked) return "";
  return `<button type="button" class="jobadd" data-act="addjob" data-k="${k}" data-job="${job}" aria-label="Add a ${esc(JOB[job].name)} row" title="Add a ${esc(JOB[job].name)} row">${icon("plus", 12)}${icon("user1", 14)}</button>`;
}
function addToJob(k, job) {
  // Mert 2026-10-13: the + on a job row adds one empty row at the end of that job; the picker lists people with that job first
  if (isLocked(k)) return;
  const { date, loc, type } = parseKey(k); const t = TYPE[type];
  const r = { id: uid(), date, loc, emp: null, job, type, start: t.start, end: t.end, labels: [], section: null, order: 0, called: null, edited: {}, pending: true, added: true, inGroup: true };
  S.shifts.push(r); render();
  setTimeout(() => { const el = document.querySelector(`[data-pick="${r.id}"]`); if (el) el.focus(); }, 30);
}
function removePending(id) { S.shifts = S.shifts.filter((s) => s.id !== id); render(); }
function setPendingJob(id, job) { const r = rowById(id); r.job = job || null; render(); }
function assign(id, empId, opts = {}) {
  const r = rowById(id); const k = keyOf(r.date, r.loc, r.type);
  const e = EMP[empId];
  // moving from another location: that shift is removed from the other Schedule + lineup
  const elsewhere = S.shifts.find((s) => s.date === r.date && s.emp === empId && s.loc !== r.loc && !s.called);
  if (elsewhere) {
    const ok = keyOf(elsewhere.date, elsewhere.loc, elsewhere.type);
    S.shifts = S.shifts.filter((s) => s !== elsewhere);
    liveChange(ok, `${e.name} moved to ${LOC[r.loc].short} (removed from ${TYPE[elsewhere.type].name})`);
    feed(`${e.name} moved from ${LOC[elsewhere.loc].short} ${TYPE[elsewhere.type].name} to ${LOC[r.loc].short} ${TYPE[r.type].name}`, "move", k);
  }
  if (!r.job) r.job = e.jobs.find((j) => true);
  const replaced = r.emp && !r.pending ? EMP[r.emp] : null; // the name dropdown swaps the person; the row keeps its place
  if (replaced) { if (!("emp" in r.edited)) r.edited.emp = r.emp; }
  else if (!elsewhere) { r.lineupOnly = true; if (!r.pending && !("emp" in r.edited)) r.edited.emp = r.emp; }
  r.overTimeOff = !!opts.overTimeOff;
  r.emp = empId; r.pending = false; if (!replaced) r.order = 999 + S.seq; r.added = true; flash(r.id);
  if (replaced && !elsewhere && !opts.overTimeOff) { feed(`${e.name} replaced ${replaced.name} in ${TYPE[r.type].name} ${LOC[r.loc].short}`, "add", k); toast(`${e.name} replaced ${replaced.name} in this lineup. The Schedule doesn't change.`); render(); return; }
  if (!r.section) r.section = null;
  feed(`${e.name} added to ${TYPE[r.type].name} ${LOC[r.loc].short} as ${JOB[r.job].name}`, "add", k);
  toast(elsewhere ? `${e.name} moved here. Both Schedules changed: removed from ${LOC[elsewhere.loc].short}, added to ${LOC[r.loc].short}.` : opts.overTimeOff ? `${e.name} added to this lineup despite approved time off. Time off and the Schedule don't change.` : `${e.name} added to this lineup only. The Schedule doesn't change.`);
  render();
}
function reorder(dragId, targetId, after) {
  const a = rowById(dragId), b = rowById(targetId);
  if (!a || !b || a === b || a.job !== b.job) return;
  const k = keyOf(a.date, a.loc, a.type); if (isLocked(k)) return;
  const g = grouped(k).groups.find((x) => x.job === a.job).rows.filter((r) => r !== a);
  const idx = g.indexOf(b) + (after ? 1 : 0);
  g.splice(idx, 0, a);
  g.forEach((r, i) => (r.order = i));
  render();
}
function moveRow(id, dir) {
  const a = rowById(id); const k = keyOf(a.date, a.loc, a.type); if (isLocked(k)) return;
  const g = grouped(k).groups.find((x) => x.job === a.job).rows;
  const i = g.indexOf(a), j = i + dir; if (j < 0 || j >= g.length) return;
  [g[i], g[j]] = [g[j], g[i]]; g.forEach((r, n) => (r.order = n)); render();
  setTimeout(() => { const el = document.querySelector(`[data-row="${id}"] .grip, [data-row="${id}"][draggable]`); el && el.focus && el.focus(); }, 20);
}

/* ---------------- share / unpublish / acknowledge ---------------- */
function snapshotOf(k) {
  const g = grouped(k); const m = meta(k);
  return {
    rows: g.groups.flatMap((x) => x.rows).filter((r) => r.emp).map((r) => ({ id: r.id, emp: r.emp, job: r.job, start: r.start, end: r.end, labels: r.labels.slice(), section: r.section })),
    notes: JSON.parse(JSON.stringify(m.notes)),
  };
}
function shareRecipients(k) { const m = meta(k); return m.shared ? m.shared.snap.rows.map((r) => r.emp).filter((e) => EMP[e].app) : []; }
function doShare(k, { ack = true, silent = false, at = null, v = null } = {}) {
  const m = meta(k); const prev = m.shared;
  const snap = snapshotOf(k);
  const ver = v || (prev ? prev.v + 1 : 1);
  // keep a read receipt only when that person's own row did not change
  const keep = {};
  if (prev) for (const r of snap.rows) {
    const old = prev.snap.rows.find((o) => o.emp === r.emp);
    if (old && m.acks[r.emp] && old.job === r.job && old.start === r.start && old.end === r.end && old.section === r.section && old.labels.join() === r.labels.join()) keep[r.emp] = m.acks[r.emp];
  }
  m.acks = keep;
  m.shared = { v: ver, at: at || S.now.time, by: role().who, ack, snap, editing: false };
  m.history.push({ v: ver, at: m.shared.at });
  m.liveLog = []; m.removed = {};
  if (!silent) feed(`${TYPE[parseKey(k).type].name} ${LOC[parseKey(k).loc].short} published${ver > 1 ? ` (version ${ver})` : ""}`, "share", k);
}
function unpublish(k) { const m = meta(k); if (!m.shared || isPast(k)) return; m.shared.editing = true; feed(`${TYPE[parseKey(k).type].name} ${LOC[parseKey(k).loc].short} unpublished for edits`, "info", k); toast("Unpublished. You can edit now. Staff keep the last published version until you publish again."); render(); }
function acknowledge(k, emp) { const m = meta(k); if (!m.shared) return; m.acks[emp] = S.now.time; feed(`${EMP[emp].name} acknowledged ${TYPE[parseKey(k).type].name} ${LOC[parseKey(k).loc].short}`, "ack", k); render(); }
/* Approved changes (Shift Hub, time off, Schedule, transfers) reach a shared lineup at once; no republish (Mert 2026-10-13).
   Only the rows the change touched are patched, so a manager's unshared lineup edits never leak. */
function liveChange(k, text) {
  const m = meta(k); if (!m.shared || isPast(k)) return;
  const live = rowsOf(k); const snap = m.shared.snap;
  const before = new Set(snap.rows.map((r) => r.emp));
  snap.rows = snap.rows.map((sr) => { const lr = live.find((x) => x.id === sr.id); if (!lr || !lr.emp || lr.called) return null; return lr.emp !== sr.emp ? { ...sr, emp: lr.emp } : sr; }).filter(Boolean);
  for (const lr of live) if (lr.emp && !lr.pending && !lr.called && !lr.added && !snap.rows.some((x) => x.id === lr.id)) snap.rows.push({ id: lr.id, emp: lr.emp, job: lr.job, start: lr.start, end: lr.end, labels: lr.labels.slice(), section: lr.section });
  const after = new Set(snap.rows.map((r) => r.emp));
  for (const e of before) if (!after.has(e)) { delete m.acks[e]; m.removed[e] = text; }
  for (const e of after) if (!before.has(e)) { delete m.removed[e]; if (e === S.phoneEmp) S.push = { k, at: Date.now() }; }
  m.liveLog.push({ at: S.now.time, text });
}

/* ---------------- Add Staff candidates ---------------- */
function candidates(rowId, query = "") {
  const r = rowById(rowId); const k = keyOf(r.date, r.loc, r.type);
  const inThis = new Set(rowsOf(k).filter((x) => x.emp).map((x) => x.emp));
  const q = query.trim().toLowerCase();
  const groups = { available: [], elsewhere: [], here: [], timeoff: [] };
  let hidden = 0;
  for (const e of EMPS) {
    if (!e.locs.includes(r.loc) || inThis.has(e.id)) continue;
    if (q && !e.name.toLowerCase().includes(q)) continue;
    if (r.job && !e.jobs.includes(r.job)) { hidden++; continue; }
    const jobTxt = e.jobs.map((j) => JOB[j].name).join(", ");
    if (onTimeOff(e.id, r.date)) { groups.timeoff.push({ e, jobTxt, meta: "Approved time off", sub2: "Warns you first", cls: "bad", timeoff: true }); continue; }
    const today = S.shifts.filter((s) => s.date === r.date && s.emp === e.id && !s.called);
    const other = today.find((s) => s.loc !== r.loc);
    if (other) {
      const can = scopeLocs().includes(other.loc);
      groups.elsewhere.push({ e, jobTxt, meta: `${LOC[other.loc].short} ${TYPE[other.type].name} · ${rangeShort(other.start, other.end)}`, sub2: can ? "Moves here" : `Only an ${LOC[other.loc].short} manager can move them`, cls: "move", disabled: !can, other });
      continue;
    }
    const here = today.find((s) => s.loc === r.loc);
    if (here) {
      const overlap = toMin(here.start) < toMin(r.end) && toMin(r.start) < toMin(here.end);
      groups.here.push({ e, jobTxt, meta: `${TYPE[here.type].name} · ${rangeShort(here.start, here.end)}`, sub2: overlap ? "Overlaps this shift" : "", cls: overlap ? "bad" : "", disabled: overlap });
      continue;
    }
    const un = e.unav && e.unav[wd(r.date)];
    groups.available.push({ e, jobTxt, meta: un ? `Unavailable after ${fmt(un)}` : "No shift today", cls: un && toMin(un) < toMin(r.end) ? "warn" : "" });
  }
  return { groups, hidden, r };
}

/* ---------------- popovers ---------------- */
let popEl = null, popAnchor = null;
function closePop() { if (popEl) { popEl.remove(); popEl = null; if (popAnchor && document.contains(popAnchor)) popAnchor.focus(); popAnchor = null; } }
function openPop(anchor, html, mount, opts = {}) {
  closePop();
  popAnchor = anchor;
  popEl = document.createElement("div");
  popEl.className = "pop";
  popEl.setAttribute("role", "dialog");
  popEl.innerHTML = html;
  document.body.appendChild(popEl);
  const a = anchor.getBoundingClientRect();
  const w = popEl.offsetWidth, h = popEl.offsetHeight;
  let left = Math.min(a.left, window.innerWidth - w - 12); left = Math.max(12, left);
  let top = a.bottom + 6; if (top + h > window.innerHeight - 12) top = Math.max(12, a.top - h - 6);
  popEl.style.left = left + "px"; popEl.style.top = top + "px";
  if (opts.minWidth) popEl.style.minWidth = opts.minWidth + "px";
  mount && mount(popEl);
  const f = popEl.querySelector("[autofocus], input, button"); f && f.focus();
}
// Mert 2026-10-13: an open list closes on a click outside it or on its own button again; that click does nothing else
let swallowClick = false;
document.addEventListener("mousedown", (e) => { if (popEl && !popEl.contains(e.target)) { closePop(); swallowClick = true; } }, true);
document.addEventListener("click", (e) => { if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
document.addEventListener("mouseup", () => { if (swallowClick) setTimeout(() => { swallowClick = false; }, 0); }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (popEl) closePop(); else closeModal(); } });

function openPicker(anchor, rowId) {
  let q = "";
  const draw = (el) => {
    const { groups, hidden, r } = candidates(rowId, q);
    const titles = { available: "Available", elsewhere: "Working at another location", here: "Already working here today", timeoff: "On approved time off" };
    let body = "";
    for (const g of ["available", "elsewhere", "here", "timeoff"]) {
      if (!groups[g].length) continue;
      body += `<div class="mi-grp"><span>${titles[g]}</span><span>${groups[g].length}</span></div>`;
      body += groups[g].map((c) => `<button type="button" class="mi" data-cand="${c.e.id}" ${c.disabled ? "disabled" : ""}>
        <span class="av">${initials(c.e.name)}</span><span><span>${esc(c.e.name)}${c.e.app ? "" : ' <span class="noapp">No app</span>'}</span><span class="sub">${esc(c.jobTxt)}</span></span>
        <span class="meta ${c.cls}">${esc(c.meta)}${c.sub2 ? `<span class="sub" style="text-align:right">${esc(c.sub2)}</span>` : ""}</span></button>`).join("");
    }
    if (!body) body = `<div class="mi-grp"><span>No one matches</span></div>`;
    el.querySelector(".pop-bd").innerHTML = body + (hidden ? `<div class="mi-sep"></div><div class="mi-grp" style="text-transform:none;letter-spacing:0;font-weight:600"><span>${hidden} people hidden: no ${esc(JOB[r.job].name)} job</span></div>` : "");
  };
  const r = rowById(rowId);
  openPop(anchor, `<div class="pop-hd" style="flex-direction:column;align-items:stretch;gap:8px">
      <div style="display:flex;gap:8px;align-items:baseline"><strong>${r.emp && !r.pending ? "Replace " + esc(EMP[r.emp].name) : "Add to " + esc(TYPE[r.type].name)}</strong><small>${r.job ? "Filtered by " + esc(JOB[r.job].name) : "Pick a position first to filter"}</small></div>
      <input class="pop-search" id="pick-search" placeholder="Search name" autocomplete="off" aria-label="Search name"></div>
    <div class="pop-bd" style="min-width:340px"></div>`, (el) => {
    draw(el);
    el.querySelector("#pick-search").addEventListener("input", (ev) => { q = ev.target.value; draw(el); });
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-cand]"); if (!b || b.disabled) return;
      const emp = b.dataset.cand;
      if (onTimeOff(emp, r.date)) {
        el.querySelector(".pop-bd").innerHTML = `<div class="confirm-move warn"><div><b>${esc(EMP[emp].name)} is on approved time off today.</b></div>
          <div>You can still add them to this lineup. Their time off and the Schedule don't change.</div>
          <div class="row"><button type="button" class="nf-btn secondary sm" data-back>Back</button><button type="button" class="nf-btn sm" data-go>Add anyway</button></div></div>`;
        el.querySelector("[data-back]").onclick = () => draw(el);
        el.querySelector("[data-go]").onclick = () => { closePop(); assign(rowId, emp, { overTimeOff: true }); };
        el.querySelector("[data-go]").focus();
        return;
      }
      const other = S.shifts.find((s) => s.date === r.date && s.emp === emp && s.loc !== r.loc && !s.called);
      if (other) {
        el.querySelector(".pop-bd").innerHTML = `<div class="confirm-move"><div><b>Move ${esc(EMP[emp].name)} here?</b></div>
          <div>Their ${esc(LOC[other.loc].short)} ${esc(TYPE[other.type].name)} shift (${esc(range(other.start, other.end))}) is removed from that Schedule and lineup. They get one shift here instead.</div>
          <div class="row"><button type="button" class="nf-btn secondary sm" data-back>Back</button><button type="button" class="nf-btn sm" data-go>Move here</button></div></div>`;
        el.querySelector("[data-back]").onclick = () => draw(el);
        el.querySelector("[data-go]").onclick = () => { closePop(); assign(rowId, emp); };
        el.querySelector("[data-go]").focus();
      } else { closePop(); assign(rowId, emp); }
    });
  });
}
function openLabels(anchor, rowId) {
  const r = rowById(rowId); let sel = r.labels.slice();
  const draw = (el) => { el.querySelector(".pop-bd").innerHTML = LABELS.map((l) => `<button type="button" class="mi" role="menuitemcheckbox" aria-checked="${sel.includes(l.id)}" data-l="${l.id}"><span class="box">${sel.includes(l.id) ? icon("check", 12) : ""}</span><span class="lbl" style="--l:${l.color}"><i></i>${esc(l.name)}</span></button>`).join(""); };
  openPop(anchor, `<div class="pop-hd"><strong>Shift labels</strong></div><div class="pop-bd"></div><div class="pop-ft"><button type="button" class="nf-btn sm" data-s>Done</button></div>`, (el) => {
    draw(el);
    el.addEventListener("click", (ev) => { const b = ev.target.closest("[data-l]"); if (!b) return; const id = b.dataset.l; sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]; draw(el); });
    el.querySelector("[data-s]").onclick = () => { closePop(); if (sel.join() !== r.labels.join()) setField(rowId, "labels", sel); };
  });
}
function openAcks(anchor, k) {
  const m = meta(k); if (!m.shared) return;
  const rows = m.shared.snap.rows;
  const list = rows.map((r) => { const e = EMP[r.emp]; const a = m.acks[r.emp];
    return `<div class="r"><span>${esc(e.name)}</span>${!e.app ? '<span class="noapp">No app · send photo or text</span>' : a ? `<span class="ok">✓ ${esc(fmt(a))}</span>` : `<span class="wait">${m.shared.ack ? "Not yet" : "Seen"}</span>`}</div>`; }).join("");
  openPop(anchor, `<div class="pop-hd"><strong>Acknowledgements</strong><small>Version ${m.shared.v} · published ${esc(fmt(m.shared.at))}</small></div><div class="ackpop">${list}</div>`);
}
function openFilter(anchor, which) {
  const isLoc = which === "loc";
  const items = isLoc ? LOCS.filter((l) => scopeLocs().includes(l.id)).map((l) => ({ id: l.id, name: l.name, color: l.color })) : TYPES.map((t) => ({ id: t.id, name: t.name, color: t.color, sub: range(t.start, t.end) }));
  let sel = (isLoc ? S.locFilter : S.typeFilter) || items.map((i) => i.id);
  const draw = (el) => {
    const all = sel.length === items.length;
    el.querySelector(".pop-bd").innerHTML = `<button type="button" class="mi" aria-checked="${all}" data-all><span class="box">${all ? icon("check", 12) : ""}</span>${isLoc ? "All locations" : "All shifts"}</button><div class="mi-sep"></div>` +
      items.map((i) => `<button type="button" class="mi" aria-checked="${sel.includes(i.id)}" data-i="${i.id}"><span class="box">${sel.includes(i.id) ? icon("check", 12) : ""}</span><span class="chip" style="--chip:${i.color};min-height:0;border:0;background:none;padding:0"><i></i></span><span>${esc(i.name)}${i.sub ? `<span class="sub">${esc(i.sub)}</span>` : ""}</span></button>`).join("") +
      (isLoc && role().id === "manager" ? `<div class="mi-sep"></div><div class="mi-grp" style="text-transform:none;letter-spacing:0;font-weight:600;line-height:1.4"><span>You manage Downtown only, so Uptown is not listed.</span></div>` : "");
  };
  openPop(anchor, `<div class="pop-hd"><strong>${isLoc ? "Locations" : "Shift types"}</strong><small>A lineup shows only when it is selected here</small></div><div class="pop-bd"></div><div class="pop-ft"><button type="button" class="nf-btn sm" data-s>Done</button></div>`, (el) => {
    draw(el);
    el.addEventListener("click", (ev) => {
      // Mert 2026-10-13: while everything is on, the first click picks only that one; later clicks add or remove; all picked = All
      if (ev.target.closest("[data-all]")) { sel = items.map((i) => i.id); draw(el); return; }
      const b = ev.target.closest("[data-i]"); if (!b) return; const id = b.dataset.i;
      if (sel.length === items.length) sel = [id];
      else { sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]; if (!sel.length) sel = items.map((i) => i.id); }
      draw(el);
    });
    el.querySelector("[data-s]").onclick = () => { closePop(); const v = sel.length === items.length ? null : sel; if (isLoc) S.locFilter = v; else S.typeFilter = v; render(); };
  }, { minWidth: 270 });
}
function openCalendar(anchor) {
  let month = dObj(S.date); month.setDate(1);
  const draw = (el) => {
    const y = month.getFullYear(), mo = month.getMonth();
    const first = iso(new Date(y, mo, 1)); const start = addDays(first, -wd(first));
    let cells = DAYN.map((d) => `<span>${d.slice(0, 2)}</span>`).join("");
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i); const x = dObj(d);
      const c = CLOSURES.find((cl) => cl.date === d && scopeLocs().includes(cl.loc));
      cells += `<button type="button" data-d="${d}" class="${x.getMonth() !== mo ? "out" : ""} ${d === S.now.date ? "today" : ""}" aria-pressed="${d === S.date}" aria-label="${dFull(d)}">${x.getDate()}${c ? `<i class="m ${c.kind}"></i>` : ""}</button>`;
    }
    el.querySelector(".cal").innerHTML = `<div class="cal-hd"><button type="button" class="xbtn" data-m="-1" aria-label="Previous month">${icon("chevL")}</button><span>${["January","February","March","April","May","June","July","August","September","October","November","December"][mo]} ${y}</span><button type="button" class="xbtn" data-m="1" aria-label="Next month">${icon("chevR")}</button></div><div class="cal-grid">${cells}</div>`;
  };
  openPop(anchor, `<div class="cal"></div>`, (el) => {
    draw(el);
    el.addEventListener("click", (ev) => {
      const m = ev.target.closest("[data-m]"); if (m) { month.setMonth(month.getMonth() + Number(m.dataset.m)); draw(el); return; }
      const d = ev.target.closest("[data-d]"); if (d) { closePop(); goDate(d.dataset.d); }
    });
  });
}
function openMore(anchor, k) {
  const st = statusOf(k);
  openPop(anchor, `<div class="pop-bd">
    <button type="button" class="mi" data-x="img">${icon("image")} Copy or download as image</button>
    <button type="button" class="mi" data-x="txt">${icon("copy")} Copy as text</button>
    ${st === "shared" ? `<div class="mi-sep"></div><button type="button" class="mi" data-x="unpub">${icon("unlock")} Unpublish to edit</button>` : ""}
    <div class="mi-sep"></div><button type="button" class="mi" data-x="col">${icon(meta(k).collapsed ? "unfold" : "fold")} ${meta(k).collapsed ? "Expand" : "Collapse"}</button></div>`, (el) => {
    el.addEventListener("click", (ev) => { const b = ev.target.closest("[data-x]"); if (!b) return; closePop();
      const x = b.dataset.x;
      if (x === "img") openExport([k], "image"); else if (x === "txt") openExport([k], "text");
      else if (x === "unpub") confirmUnpublish(k); else if (x === "col") { meta(k).collapsed = !meta(k).collapsed; render(); } });
  }, { minWidth: 240 });
}
function openLocMore(anchor, locId) {
  const keys = visibleKeys().filter((k) => parseKey(k).loc === locId && hasRows(k));
  const shared = keys.filter((k) => statusOf(k) === "shared");
  const anyOpen = keys.some((k) => !meta(k).collapsed);
  openPop(anchor, `<div class="pop-hd"><strong>${esc(LOC[locId].name)}</strong><small>${esc(dFull(S.date))}</small></div><div class="pop-bd">
    <button type="button" class="mi" data-x="img">${icon("image")} Copy or download as image</button>
    <button type="button" class="mi" data-x="txt">${icon("copy")} Copy as text</button>
    ${shared.length ? `<div class="mi-sep"></div>` + shared.map((k) => `<button type="button" class="mi" data-x="unpub" data-k="${k}">${icon("unlock")} Unpublish ${esc(TYPE[parseKey(k).type].name)} to edit</button>`).join("") : ""}
    <div class="mi-sep"></div><button type="button" class="mi" data-x="col">${icon(anyOpen ? "fold" : "unfold")} ${anyOpen ? "Collapse all here" : "Expand all here"}</button></div>`, (el) => {
    el.addEventListener("click", (ev) => { const b = ev.target.closest("[data-x]"); if (!b) return; closePop();
      const x = b.dataset.x;
      if (x === "img") openExport(keys, "image"); else if (x === "txt") openExport(keys, "text");
      else if (x === "unpub") confirmUnpublish(b.dataset.k); else if (x === "col") { keys.forEach((k) => (meta(k).collapsed = anyOpen)); render(); } });
  }, { minWidth: 250 });
}
function openExportMenu(anchor) {
  const keys = visibleKeys().filter(hasRows);
  openPop(anchor, `<div class="pop-hd"><strong>For people without the app</strong><small>${keys.length} lineups on screen</small></div><div class="pop-bd">
    <button type="button" class="mi" data-x="img">${icon("image")} Copy or download as image</button>
    <button type="button" class="mi" data-x="txt">${icon("copy")} Copy as text</button></div>`, (el) => {
    el.addEventListener("click", (ev) => { const b = ev.target.closest("[data-x]"); if (!b) return; closePop(); openExport(keys, b.dataset.x === "img" ? "image" : "text"); });
  }, { minWidth: 260 });
}

/* ---------------- modals ---------------- */
let modalEl = null;
function closeModal() { if (modalEl) { modalEl.remove(); modalEl = null; } }
function openModal(html, mount) {
  closeModal(); closePop();
  modalEl = document.createElement("div"); modalEl.className = "modal-back";
  modalEl.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  modalEl.addEventListener("mousedown", (e) => { if (e.target === modalEl) closeModal(); });
  document.body.appendChild(modalEl);
  modalEl.querySelectorAll("[data-close]").forEach((b) => (b.onclick = closeModal));
  mount && mount(modalEl);
  const f = modalEl.querySelector("[autofocus]") || modalEl.querySelector("button"); f && f.focus();
}
function confirmUnpublish(k) {
  const { loc, type, date } = parseKey(k);
  openModal(`<div class="modal-hd"><div><h2>Unpublish ${esc(TYPE[type].name)} lineup?</h2><p>${esc(LOC[loc].name)} · ${esc(dLong(date))}</p></div><button type="button" class="xbtn" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="modal-bd"><div class="share-sum">You can edit it again. Staff keep seeing version ${meta(k).shared.v} with a "Being updated" note until you publish again. Nobody gets a notification now.</div></div>
    <div class="modal-ft"><button type="button" class="nf-btn secondary" data-close>Keep it published</button><button type="button" class="nf-btn" data-go autofocus>Unpublish</button></div>`, (el) => {
    el.querySelector("[data-go]").onclick = () => { closeModal(); unpublish(k); };
  });
}
function openShare(preKeys) {
  const today = visibleKeys().filter(hasRows);
  const allDay = (() => { const out = []; ensureDate(S.date); for (const l of LOCS.filter((x) => scopeLocs().includes(x.id))) for (const t of TYPES) { const k = keyOf(S.date, l.id, t.id); if (hasRows(k)) out.push(k); } return out; })();
  let scope = preKeys && preKeys.length === 1 ? "one" : "filtered";
  let ask = true;
  let picked = new Set((preKeys || today).filter((k) => !isPast(k)));
  const keysFor = () => (scope === "all" ? allDay : scope === "one" ? preKeys : today);
  const draw = (el) => {
    const keys = keysFor();
    el.querySelector(".share-scope").innerHTML = (preKeys && preKeys.length === 1 ? `<button type="button" aria-pressed="${scope === "one"}" data-sc="one">This lineup</button>` : "") +
      `<button type="button" aria-pressed="${scope === "filtered"}" data-sc="filtered">On screen (${today.length})</button><button type="button" aria-pressed="${scope === "all"}" data-sc="all">All lineups today (${allDay.length})</button>`;
    el.querySelector(".share-list").innerHTML = keys.map((k) => {
      const { loc, type } = parseKey(k); const g = grouped(k); const st = statusOf(k); const past = st === "past";
      const on = picked.has(k) && !past;
      const noApp = g.groups.flatMap((x) => x.rows).filter((r) => r.emp && !EMP[r.emp].app).length;
      const label = st === "shared" ? `Published v${meta(k).shared.v}` : st === "editing" ? "Unpublished, edited" : past ? "Started, locked" : "Not published yet";
      return `<div class="share-item ${past ? "disabled" : ""}" role="checkbox" tabindex="${past ? -1 : 0}" aria-checked="${on}" aria-disabled="${past}" data-k="${k}"><span class="box">${on ? icon("check", 12) : ""}</span>
        <span class="lt-type" style="--t:${TYPE[type].color};font-size:13px"><i></i>${esc(TYPE[type].name)}</span><span>${esc(LOC[loc].short)}</span>
        <span class="meta">${g.working} working${noApp ? ` · ${noApp} without app` : ""}<br>${esc(label)}</span></div>`;
    }).join("") || `<div class="share-item">No lineups to publish for this day.</div>`;
    const sel = keys.filter((k) => picked.has(k) && !isPast(k));
    const people = new Set(), noapp = new Set(), called = new Set();
    sel.forEach((k) => { const g = grouped(k); g.groups.forEach((x) => x.rows.forEach((r) => r.emp && (EMP[r.emp].app ? people.add(r.emp) : noapp.add(r.emp)))); g.called.forEach((r) => called.add(r.emp)); });
    el.querySelector(".share-sum").innerHTML = sel.length ? `<b>${sel.length} lineup${sel.length > 1 ? "s" : ""}</b> go to <b>${people.size} people</b> in the app${ask ? ", who are asked to acknowledge" : ""}. ${called.size ? `${called.size} called-off ${called.size > 1 ? "people are" : "person is"} left out. ` : ""}Publishing locks these lineups for your own edits (unpublish to change them). Approved Shift Hub, time-off and Schedule changes still reach staff on their own.` : "Pick at least one lineup.";
    el.querySelector(".noapp-box").hidden = !noapp.size;
    el.querySelector(".noapp-names").textContent = [...noapp].map((e) => EMP[e].name).join(", ");
    el.querySelector("[data-go]").disabled = !sel.length;
    el.querySelector("[data-go]").textContent = sel.some((k) => meta(k).shared) ? `Publish ${sel.length} (republish)` : `Publish ${sel.length}`;
    const sw = el.querySelector("#ask-ack"); sw.setAttribute("aria-checked", ask);
  };
  openModal(`<div class="modal-hd"><div><h2>Publish lineups</h2><p>${esc(dFull(S.date))}</p></div><button type="button" class="xbtn" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="modal-bd"><div class="share-scope" role="group" aria-label="Which lineups"></div><div class="share-list"></div>
      <button type="button" class="sw" role="switch" id="ask-ack" aria-checked="true"><span class="track"></span>Ask staff to acknowledge</button>
      <div class="share-sum"></div>
      <div class="noapp-box" hidden><div><b>Without the app:</b> <span class="noapp-names"></span>. Send them the lineup as a photo or text.</div><div class="acts"><button type="button" class="nf-btn secondary sm" data-img>${icon("image", 14)} Image</button><button type="button" class="nf-btn secondary sm" data-txt>${icon("copy", 14)} Text</button></div></div></div>
    <div class="modal-ft"><span class="left">Each person gets one notification.</span><button type="button" class="nf-btn secondary" data-close>Cancel</button><button type="button" class="nf-btn" data-go>Publish</button></div>`, (el) => {
    draw(el);
    el.addEventListener("click", (ev) => {
      const sc = ev.target.closest("[data-sc]"); if (sc) { scope = sc.dataset.sc; if (scope === "all") allDay.forEach((k) => picked.add(k)); draw(el); return; }
      const it = ev.target.closest("[data-k]"); if (it && it.getAttribute("aria-disabled") !== "true") { const k = it.dataset.k; picked.has(k) ? picked.delete(k) : picked.add(k); draw(el); return; }
      if (ev.target.closest("#ask-ack")) { ask = !ask; draw(el); return; }
      if (ev.target.closest("[data-img]")) { openExport(keysFor().filter((k) => picked.has(k)), "image"); return; }
      if (ev.target.closest("[data-txt]")) { openExport(keysFor().filter((k) => picked.has(k)), "text"); return; }
      if (ev.target.closest("[data-go]")) {
        const sel = keysFor().filter((k) => picked.has(k) && !isPast(k));
        sel.forEach((k) => doShare(k, { ack: ask }));
        closeModal();
        const ppl = new Set(); sel.forEach((k) => shareRecipients(k).forEach((e) => ppl.add(e)));
        toast(`Published ${sel.length} lineup${sel.length > 1 ? "s" : ""} with ${ppl.size} people.`);
        if (ppl.has(S.phoneEmp)) { const k = sel.find((x) => shareRecipients(x).includes(S.phoneEmp)); S.push = { k, at: Date.now() }; S.phoneDate = S.date; }
        render();
      }
    });
    el.addEventListener("keydown", (ev) => { const it = ev.target.closest("[data-k]"); if (it && (ev.key === " " || ev.key === "Enter")) { ev.preventDefault(); it.click(); } });
  });
}

/* ---------------- export: canvas image + plain text ---------------- */
function lineupText(keys) {
  const out = [];
  for (const k of keys) {
    const { date, loc, type } = parseKey(k); const g = grouped(k); const m = meta(k);
    out.push(`${LOC[loc].name.toUpperCase()}`, `${TYPE[type].name} lineup · ${dFull(date)}`, "");
    let dept = null;
    for (const grp of g.groups) {
      if (g.multiDept && grp.dept !== dept) { dept = grp.dept; out.push(`== ${DEPTS.find((d) => d.id === dept).name.toUpperCase()} ==`); }
      out.push(`${JOB[grp.job].name}`);
      grp.rows.forEach((r) => out.push(`  • ${r.emp ? EMP[r.emp].name : "Open shift"}  ${rangeShort(r.start, r.end)}${r.section ? "  · " + r.section : ""}${r.labels.length ? "  · " + r.labels.map((l) => LABEL[l].name).join(", ") : ""}`));
    }
    const nn = [["specials", "Specials"], ["n86", "86s"], ["shift", "Shift notes"]].filter(([id]) => m.notes[id].text.trim());
    for (const [id, name] of nn) out.push("", `${name.toUpperCase()}`, ...m.notes[id].text.trim().split("\n").map((l) => "  " + l));
    out.push("", "—", "");
  }
  return out.join("\n").replace(/\n—\n\n$/, "\n");
}
function drawLineups(keys) {
  const W = 1080, P = 56, cv = document.createElement("canvas"), ctx = cv.getContext("2d");
  const F = (w, s) => `${w} ${s}px Inter, system-ui, sans-serif`;
  const plan = []; let y = P;
  plan.push({ t: "brand", y }); y += 70;
  for (const k of keys) {
    const g = grouped(k); const m = meta(k);
    plan.push({ t: "head", k, y }); y += 128;
    let dept = null;
    for (const grp of g.groups) {
      if (g.multiDept && grp.dept !== dept) { dept = grp.dept; plan.push({ t: "dept", dept, y }); y += 44; }
      plan.push({ t: "job", job: grp.job, n: grp.rows.length, y }); y += 50;
      for (const r of grp.rows) { plan.push({ t: "row", r, y }); y += 56; }
      y += 8;
    }
    const nn = [["specials", "Specials", "#2c4a26", "#eef6ea"], ["n86", "86s", "#6b2a24", "#fdeeee"], ["shift", "Shift notes", "#26406e", "#edf2fb"]].filter(([id]) => m.notes[id].text.trim());
    for (const [id, name, fg, bg] of nn) { const lines = m.notes[id].text.trim().split("\n"); plan.push({ t: "note", name, lines, fg, bg, y }); y += 58 + lines.length * 34 + 16; }
    y += 36;
  }
  cv.width = W; cv.height = y + 20;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, cv.height);
  ctx.textBaseline = "alphabetic";
  for (const p of plan) {
    if (p.t === "brand") { ctx.fillStyle = "#244d3c"; ctx.font = F(800, 26); ctx.fillText(WS.toUpperCase() + "  ·  LINEUP", P, p.y + 26); ctx.fillStyle = "#66716c"; ctx.font = F(500, 22); ctx.textAlign = "right"; ctx.fillText(`Published ${nowClock()}`, W - P, p.y + 26); ctx.textAlign = "left"; }
    if (p.t === "head") {
      const { date, loc, type } = parseKey(p.k);
      ctx.fillStyle = "#f4f6f4"; roundRect(ctx, P, p.y, W - 2 * P, 108, 14); ctx.fill();
      ctx.fillStyle = TYPE[type].color; roundRect(ctx, P, p.y, 12, 108, 6); ctx.fill();
      ctx.fillStyle = "#17221e"; ctx.font = F(800, 40); ctx.fillText(`${TYPE[type].name}`, P + 36, p.y + 50);
      ctx.fillStyle = "#50605a"; ctx.font = F(600, 24); ctx.fillText(`${LOC[loc].name}  ·  ${dLong(date)}`, P + 36, p.y + 86);
      ctx.textAlign = "right"; ctx.fillStyle = "#17221e"; ctx.font = F(700, 26); ctx.fillText(`${fmt(startOf(p.k))}`, W - P - 28, p.y + 50); ctx.textAlign = "left";
    }
    if (p.t === "dept") { ctx.fillStyle = "#8a958f"; ctx.font = F(800, 18); ctx.fillText(DEPTS.find((d) => d.id === p.dept).name.toUpperCase(), P, p.y + 30); }
    if (p.t === "job") { ctx.fillStyle = JOB[p.job].color; ctx.beginPath(); ctx.arc(P + 8, p.y + 26, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#3d4a45"; ctx.font = F(800, 22); ctx.fillText(JOB[p.job].name.toUpperCase() + `  (${p.n})`, P + 26, p.y + 34); ctx.fillStyle = "#e2e6e4"; ctx.fillRect(P, p.y + 48, W - 2 * P, 2); }
    if (p.t === "row") {
      const r = p.r; ctx.fillStyle = r.emp ? "#17221e" : "#8a4a06"; ctx.font = F(650, 28); ctx.fillText(r.emp ? EMP[r.emp].name : "Open shift", P + 26, p.y + 38);
      ctx.textAlign = "right"; ctx.fillStyle = "#17221e"; ctx.font = F(600, 26); ctx.fillText(rangeShort(r.start, r.end), W - P, p.y + 38);
      ctx.fillStyle = "#66716c"; ctx.font = F(500, 22); const extra = [r.section, ...r.labels.map((l) => LABEL[l].name)].filter(Boolean).join("  ·  "); ctx.fillText(extra, W - P - 190, p.y + 38); ctx.textAlign = "left";
      ctx.fillStyle = "#eef1ef"; ctx.fillRect(P + 26, p.y + 54, W - 2 * P - 26, 1);
    }
    if (p.t === "note") { ctx.fillStyle = p.bg; roundRect(ctx, P, p.y, W - 2 * P, 42 + p.lines.length * 34, 12); ctx.fill(); ctx.fillStyle = p.fg; ctx.font = F(800, 18); ctx.fillText(p.name.toUpperCase(), P + 20, p.y + 32); ctx.font = F(500, 24); p.lines.forEach((l, i) => ctx.fillText(l, P + 20, p.y + 66 + i * 34)); }
  }
  return cv;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fileName(keys) { if (keys.length === 1) { const { date, loc, type } = parseKey(keys[0]); return `lineup-${LOC[loc].short.toLowerCase()}-${type}-${date}.png`; } return `lineups-${S.date}.png`; }
function openExport(keys, kind) {
  keys = keys.filter(hasRows);
  if (!keys.length) { toast("Nothing to export for this day."); return; }
  const title = keys.length === 1 ? `${TYPE[parseKey(keys[0]).type].name} · ${LOC[parseKey(keys[0]).loc].short}` : `${keys.length} lineups`;
  if (kind === "text") {
    const txt = lineupText(keys);
    openModal(`<div class="modal-hd"><div><h2>Copy as text</h2><p>${esc(title)} · paste into a text message or group chat</p></div><button type="button" class="xbtn" data-close aria-label="Close">${icon("x")}</button></div>
      <div class="modal-bd"><label class="sr" for="exp-txt">Lineup text</label><textarea class="export-text" id="exp-txt" readonly>${esc(txt)}</textarea></div>
      <div class="modal-ft"><button type="button" class="nf-btn secondary" data-close>Close</button><button type="button" class="nf-btn" data-copy autofocus>${icon("copy", 15)} Copy text</button></div>`, (el) => {
      el.querySelector("[data-copy]").onclick = () => {
        const ta = el.querySelector("#exp-txt");
        const done = () => toast("Copied. Paste it into a text message.");
        try { navigator.clipboard.writeText(txt).then(done, () => { ta.select(); document.execCommand && document.execCommand("copy"); done(); }); } catch (e) { ta.select(); done(); }
      };
    });
    return;
  }
  const cv = drawLineups(keys);
  openModal(`<div class="modal-hd"><div><h2>Lineup image</h2><p>${esc(title)} · for staff who don't use the app</p></div><button type="button" class="xbtn" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="modal-bd"><div class="export-prev"></div></div>
    <div class="modal-ft"><span class="left">${esc(fileName(keys))}</span><button type="button" class="nf-btn secondary" data-dl>${icon("download", 15)} Download</button><button type="button" class="nf-btn" data-copy autofocus>${icon("copy", 15)} Copy image</button></div>`, (el) => {
    el.querySelector(".export-prev").appendChild(cv);
    el.querySelector("[data-copy]").onclick = () => {
      try {
        const item = new ClipboardItem({ "image/png": new Promise((res) => cv.toBlob(res, "image/png")) });
        navigator.clipboard.write([item]).then(() => toast("Image copied. Paste it into a text message."), () => toast("This preview blocks copying images. In the app, Copy image puts the picture on your clipboard."));
      } catch (e) { toast("This preview blocks copying images. In the app, Copy image puts the picture on your clipboard."); }
    };
    el.querySelector("[data-dl]").onclick = () => toast(`In the app this saves ${fileName(keys)}. This preview can't save files.`, { ms: 5200 });
  });
}

/* ---------------- live events (demo) ---------------- */
const LIVE = [
  { id: "cover", label: "Shift Hub · cover approved (Priya → Lily)", run() {
      const k = keyOf("2026-10-13", "dt", "dinner"); ensureDate("2026-10-13");
      const r = rowsOf(k).find((x) => x.emp === "priya" && !x.called); if (!r) return "Priya has no Dinner shift to cover now.";
      r.emp = "lily"; flash(r.id); liveChange(k, "Lily Evans covers Priya Patel (Host)");
      feed("Shift Hub: Lily Evans covers Priya Patel's Host shift · Dinner Downtown", "live", k);
      return "Lily Evans now covers Priya Patel's Host shift (Shift Hub cover approved).";
    } },
  { id: "timeoff", label: "Time off approved · Ethan Brooks", run() {
      const k = keyOf("2026-10-13", "dt", "dinner"); ensureDate("2026-10-13");
      const r = rowsOf(k).find((x) => x.emp === "ethan"); if (!r) return "Ethan has no Dinner shift now.";
      r.emp = null; r.called = null; flash(r.id); TIMEOFF.push({ emp: "ethan", from: "2026-10-13", to: "2026-10-13" });
      liveChange(k, "Ethan Brooks on time off, Busser shift is open"); feed("Time off approved: Ethan Brooks. His Busser shift is now open · Dinner Downtown", "live", k);
      return "Ethan Brooks' time off was approved. His Busser shift is open now.";
    } },
  { id: "pickup", label: "Shift Hub · open shift picked up (Owen)", run() {
      const k = keyOf("2026-10-13", "dt", "dinner"); ensureDate("2026-10-13");
      let r = rowsOf(k).find((x) => !x.emp && !x.pending);
      if (!r) { r = { id: uid(), date: "2026-10-13", loc: "dt", emp: null, job: "busser", type: "dinner", start: "16:00", end: "22:00", labels: [], section: null, order: 50, called: null, edited: {}, pending: false }; S.shifts.push(r); }
      if (S.shifts.some((s) => s.date === "2026-10-13" && s.emp === "owen" && s.type === "dinner")) return "Owen is already on Dinner.";
      r.emp = "owen"; r.job = r.job || "busser"; flash(r.id); liveChange(k, "Owen Price picked up the open Busser shift");
      feed("Shift Hub: Owen Price picked up the open Busser shift · Dinner Downtown", "live", k);
      return "Owen Price picked up the open Busser shift (Shift Hub).";
    } },
  { id: "swap", label: "Shift Hub · swap approved (Ben ↔ Maria)", run() {
      const k = keyOf("2026-10-13", "dt", "dinner"); ensureDate("2026-10-13");
      const r = rowsOf(k).find((x) => x.emp === "ben"); if (!r) return "Ben has no Dinner shift now.";
      r.emp = "maria"; flash(r.id); liveChange(k, "Maria Lopez swapped in for Ben Carter");
      feed("Shift Hub: Ben Carter and Maria Lopez swapped · Maria works Dinner Downtown", "live", k);
      return "Ben Carter and Maria Lopez swapped. Maria works Dinner tonight.";
    } },
  { id: "short", label: "Important Dates · Downtown closes 9 PM today", run() {
      if (CLOSURES.some((c) => c.loc === "dt" && c.date === "2026-10-13")) return "Already marked.";
      CLOSURES.push({ loc: "dt", date: "2026-10-13", kind: "short", opens: "11:00", closes: "21:00", title: "Kitchen inspection" });
      ["dinner", "close"].forEach((t) => liveChange(keyOf("2026-10-13", "dt", t), "Short hours: closes 9:00 PM"));
      feed("Important Dates: Downtown has short hours today, closes 9:00 PM", "live");
      return "Downtown closes at 9:00 PM today (Important Dates). Shifts that end later are flagged.";
    } },
  { id: "added", label: "Schedule · Uptown manager adds Zoe to Dinner", run() {
      ensureDate("2026-10-13"); const k = keyOf("2026-10-13", "up", "dinner");
      const r = rowsOf(k).find((x) => x.emp === "zoe"); if (r) return "Zoe is already on Uptown Dinner.";
      const n = { id: uid(), date: "2026-10-13", loc: "up", emp: "zoe", job: "server", type: "dinner", start: "17:00", end: "22:00", labels: [], section: "Section 2", order: 5, called: null, edited: {}, pending: false };
      S.shifts.push(n); flash(n.id); liveChange(k, "Zoe Bennett added on the Schedule"); feed("Schedule: Zoe Bennett added to Dinner · Uptown", "live", k);
      return "An Uptown manager added Zoe Bennett on the Schedule. She shows up in Uptown Dinner.";
    } },
  { id: "ack", label: "An employee acknowledges", run() {
      for (const k of Object.keys(S.metas)) { const m = S.metas[k]; if (!m.shared || !m.shared.ack || isPast(k)) continue;
        const e = shareRecipients(k).find((x) => !m.acks[x] && x !== S.phoneEmp); if (e) { acknowledge(k, e); return `${EMP[e].name} acknowledged ${TYPE[parseKey(k).type].name} ${LOC[parseKey(k).loc].short}.`; } }
      return "Publish a lineup first; then people can acknowledge it.";
    } },
];
function runLive(id) {
  const ev = LIVE.find((x) => x.id === id); if (!ev) return;
  const msg = ev.run();
  if (S.date !== "2026-10-13" && id !== "ack") goDate("2026-10-13");
  toast(msg, { live: true, ms: 5000 });
  render();
}

/* ---------------- shared rendering helpers for variants ---------------- */
function goDate(d) { S.date = d; ensureDate(d); render(); }
function statusPill(k) {
  const st = statusOf(k), m = meta(k);
  // Mert 2026-10-13: a published lineup always says Published in green under its name, also after it started
  if (m.shared && !m.shared.editing) return `<span class="pill shared">${icon("lock", 12)} Published v${m.shared.v} · ${esc(fmt(m.shared.at))}</span>`;
  if (st === "past") return ""; // Mert 2026-10-13: hide the past label for now
  if (st === "editing") return `<span class="pill editing">${icon("unlock", 12)} Unpublished · editing</span>`;
  return `<span class="pill draft">Draft · not published</span>`;
}
function ackSummary(k) {
  const m = meta(k); if (!m.shared || !m.shared.ack) return "";
  const ids = shareRecipients(k); if (!ids.length) return "";
  const n = ids.filter((e) => m.acks[e]).length;
  return `<button type="button" class="ackbtn" data-act="acks" data-k="${k}" title="Who acknowledged"><span class="ackbar"><i style="width:${Math.round((n / ids.length) * 100)}%"></i></span>${n}/${ids.length} acknowledged</button>`;
}
// Mert 2026-10-13: closing the short-hours notice hides it for that location and day (all its lineups)
const HIDDEN_SHORT = new Set();
function bannersFor(k) {
  const { date, loc } = parseKey(k); const m = meta(k); const st = statusOf(k); let out = "";
  const c = closureOf(loc, date);
  if (c && c.kind === "short" && !HIDDEN_SHORT.has(loc + "|" + date)) {
    const late = rowsOf(k).filter((r) => r.emp && !r.called && toMin(r.end) > toMin(c.closes)).length;
    out += `<div class="banner warn">${icon("alert")}<span class="grow"><b>Short hours: ${esc(range(c.opens, c.closes))}</b> · ${esc(c.title)} (Important Dates).${late ? ` ${late} shift${late > 1 ? "s end" : " ends"} after closing.` : ""}</span><button type="button" class="xbtn banner-x" data-act="hideshort" data-k="${k}" aria-label="Close this notice">${icon("x", 14)}</button></div>`;
  }
  if ((st === "shared" || st === "editing") && m.liveLog.length) { const last = m.liveLog.slice(-2); out += `<div class="banner ok">${icon("radio")}<span class="grow"><b>Updated live ${esc(fmt(last[last.length - 1].at))}.</b> ${esc(last.map((x) => x.text).join("; "))}. Staff already see this; no republish needed.</span></div>`; }
  if (st === "editing") out += `<div class="banner info">${icon("unlock")}<span class="grow">Unpublished. Staff see version ${m.shared.v} marked "Being updated" until you publish again.</span></div>`;
  return out;
}
function nameCell(r, locked, opts = {}) {
  const m = meta(keyOf(r.date, r.loc, r.type));
  if (r.pending || !r.emp) {
    if (locked) return `<span class="nm" style="color:var(--theme-availability-text)">Open shift</span>`;
    return `<button type="button" class="cell-btn pick" data-act="pick" data-id="${r.id}" data-pick="${r.id}">${icon("plus", 14)} ${r.pending ? "Choose person" : "Open shift · assign"}</button>`;
  }
  const e = EMP[r.emp];
  const acked = m.shared && m.acks[r.emp] && !r.called;
  const edited = Object.keys(r.edited).length;
  const sched = [r.edited.type ? TYPE[r.edited.type].name + " lineup" : null, r.edited.emp !== undefined ? (r.edited.emp ? EMP[r.edited.emp].name : "Open shift") : null, r.edited.job ? JOB[r.edited.job].name : null, (r.edited.start || r.edited.end) ? range(r.edited.start || r.start, r.edited.end || r.end) : null, r.edited.labels ? (r.edited.labels.map((l) => LABEL[l].name).join(", ") || "no label") : null].filter((x) => x !== null);
  const nm = `<span class="nm" title="${esc(e.name)}">${esc(e.name)}${r.overTimeOff && !opts.noEdited ? '<span class="lo to" title="Added over approved time off. Lineup only, not on the Schedule.">Time off · lineup only</span>' : r.lineupOnly && !opts.noEdited ? '<span class="lo" title="Added in the lineup. Not on the Schedule.">Lineup only</span>' : edited && !opts.noEdited ? `<span class="edited" title="Changed in this lineup only. Schedule: ${esc(sched.join(" · "))}"></span>` : ""}</span>`;
  // Mert 2026-10-13: the name comes from the Schedule, but it is a dropdown: the manager can pick someone else for this row
  if (!opts.dd || locked || r.called) return nm;
  return `<button type="button" class="cell-btn dd name-dd" data-act="pick" data-id="${r.id}" data-pick="${r.id}" aria-haspopup="dialog" aria-label="${esc(e.name)}, change person">${nm}<span class="dd-chev">${icon("chevD", 12)}</span></button>`;
}
function posCell(r, locked) {
  if (locked) return `<span class="cell-text">${r.job ? esc(JOB[r.job].name) : '<span class="muted">—</span>'}</span>`;
  const opts = (r.emp ? EMP[r.emp].jobs : JOB_ORDER);
  const list = [...new Set([...(r.job ? [r.job] : []), ...opts])];
  return `<label class="sr" for="pos-${r.id}">Position</label><select class="cell-sel ${r.job ? "" : "empty"}" id="pos-${r.id}" data-field="${r.pending ? "pjob" : "job"}" data-id="${r.id}">${r.job ? "" : '<option value="">Choose position</option>'}${list.map((j) => `<option value="${j}" ${j === r.job ? "selected" : ""}>${esc(JOB[j].name)}</option>`).join("")}</select>`;
}
function timeCell(r, locked, opts = {}) {
  const { date, loc } = r; const c = closureOf(loc, date);
  const late = c && c.kind === "short" && toMin(r.end) > toMin(c.closes) && !r.called;
  const mark = late ? ` <span class="warnmark" title="Ends after closing time">${icon("alert", 12)}</span>` : "";
  if (locked || r.called) return `<span class="cell-text"><span class="tnum">${esc(opts.short ? rangeShort(r.start, r.end) : range(r.start, r.end))}</span>${mark}</span>`;
  // Mert 2026-10-13: no time window; In and Out are typed right in the row, in the workspace's 12h/24h format
  const was = (r.edited.start || r.edited.end) ? `<span class="edited" title="Changed in this lineup only. Schedule: ${esc(range(r.edited.start || r.start, r.edited.end || r.end))}"></span>` : "";
  const nm = r.emp && EMP[r.emp] ? EMP[r.emp].name : "open row";
  const inp = (edge) => `<input type="text" class="tin tnum ${S.clock === "24h" ? "c24" : ""}" id="t${edge}-${r.id}" data-time="${edge}" data-id="${r.id}" value="${esc(fmt(r[edge]))}" data-v="${r[edge]}" autocomplete="off" spellcheck="false" aria-label="${edge === "start" ? "In" : "Out"} time, ${esc(nm)}" title="Type a time, e.g. ${S.clock === "24h" ? "17:30" : "5:30p"}. ↑ ↓ 15 min · Enter next row">`;
  return `<span class="tpair">${inp("start")}<span class="tdash">–</span>${inp("end")}${was}${mark}</span>`;
}
function labelCell(r, locked) {
  const inner = r.labels.length ? `<span class="lbls">${r.labels.map((l) => `<span class="lbl" style="--l:${LABEL[l].color}"><i></i>${esc(LABEL[l].name)}</span>`).join("")}</span>` : `<span class="muted">${locked ? "" : "Add label"}</span>`;
  if (locked || r.called) return `<span class="cell-text">${r.labels.length ? inner : ""}</span>`;
  return `<button type="button" class="cell-btn dd" data-act="labels" data-id="${r.id}" aria-label="Shift labels" aria-haspopup="dialog">${inner}<span class="dd-chev">${icon("chevD", 12)}</span></button>`;
}
function typeCell(r, locked) {
  if (locked || r.called) return `<span class="cell-text">${esc(TYPE[r.type].name)}</span>`;
  return `<label class="sr" for="typ-${r.id}">Shift</label><select class="cell-sel" id="typ-${r.id}" data-field="type" data-id="${r.id}">${TYPES.map((t) => { const lk = t.id !== r.type && isLocked(keyOf(r.date, r.loc, t.id)); return `<option value="${t.id}" ${t.id === r.type ? "selected" : ""} ${lk ? "disabled" : ""}>${esc(t.name)}${lk ? " (locked)" : ""}</option>`; }).join("")}</select>`;
}
function sectionCell(r, locked) {
  if (locked || r.called) return `<span class="cell-text">${r.section ? esc(r.section) : '<span class="muted">—</span>'}</span>`;
  return `<label class="sr" for="sec-${r.id}">Section</label><select class="cell-sel" id="sec-${r.id}" data-field="section" data-id="${r.id}"><option value="">No section</option>${SECTIONS[r.loc].map((s) => `<option ${s === r.section ? "selected" : ""}>${esc(s)}</option>`).join("")}<option value="__new">+ Add section…</option></select>`;
}
function actionCell(r, locked, compact) {
  if (r.pending) return `<button type="button" class="xbtn" data-act="rmpending" data-id="${r.id}" aria-label="Remove empty row">${icon("x")}</button>`;
  // Mert 2026-10-13: on a locked lineup the call off button stays, disabled
  if (locked) return r.called ? `<span class="called-chip">Called off</span>` : r.emp ? `<button type="button" class="callbtn" disabled title="This lineup is locked">${icon("userx", 13)}${compact ? "" : " Call off"}</button>` : "";
  if (r.called) return `<button type="button" class="restorebtn" data-act="restore" data-id="${r.id}">${icon("undo", 13)}${compact ? "" : " Restore"}</button>`;
  if (!r.emp) return "";
  const armed = S.armed === r.id;
  return `<button type="button" class="callbtn ${armed ? "armed" : ""}" data-act="calloff" data-id="${r.id}" aria-label="${armed ? "Confirm call off" : "Call off"}">${icon("userx", 13)}${compact && !armed ? "" : armed ? " Confirm" : " Call off"}</button>`;
}
function notesBlock(k, locked) {
  const m = meta(k);
  const defs = [["specials", "Specials", "sparkle"], ["n86", "86s", "ban"], ["shift", "Shift Notes", "note"]];
  // Mert 2026-10-13: no on/off switches; the three note boxes are always there, and only filled ones reach staff
  const boxes = defs.map(([id, name, ic]) => `<div class="note-box"><label for="n-${k}-${id}">${icon(ic, 13)} ${name}</label>${locked ? `<div class="ro">${esc(m.notes[id].text) || '<span class="muted">Nothing added</span>'}</div>` : `<textarea id="n-${k}-${id}" data-note="${id}" data-k="${k}" placeholder="${id === "specials" ? "Soup, fish, chef's feature…" : id === "n86" ? "Items out of stock tonight…" : "Large party at 7, VIP table 12…"}">${esc(m.notes[id].text)}</textarea>`}</div>`).join("");
  // Mert 2026-10-13: Notes opens and closes with an arrow. Starts closed when every note is empty, open when one has text.
  // Share, photo, text and the phone show only notes with text, whatever this arrow says.
  const any = defs.some(([id]) => m.notes[id].text.trim());
  const open = m.notesOpen === undefined ? any : m.notesOpen;
  return `<div class="notes ${open ? "" : "is-closed"}"><button type="button" class="notes-hd" data-act="notes" data-k="${k}" aria-expanded="${open}"><span>Notes</span>${icon("chevD", 16)}</button>${open ? `<div class="note-grid">${boxes}</div>` : ""}</div>`;
}

/* ---------------- phone data ---------------- */
function phoneLineups(emp, date) {
  ensureDate(date);
  const res = [];
  for (const l of LOCS) for (const t of TYPES) {
    const k = keyOf(date, l.id, t.id); const m = meta(k);
    if (m.shared) {
      const mine = m.shared.snap.rows.find((r) => r.emp === emp);
      if (mine) { res.push({ k, m, mine, snap: m.shared.snap }); continue; }
    }
    if (m.shared && m.removed[emp]) { res.push({ k, m, removedText: m.removed[emp] }); continue; }
    const live = rowsOf(k).find((r) => r.emp === emp);
    if (live && live.called) res.push({ k, m, called: live });
    else if (live && !m.shared) res.push({ k, m, notShared: live });
  }
  return res;
}
function phoneShell(inner, opts = {}) {
  const dates = []; const ws = weekStart(S.phoneDate); for (let i = 0; i < 7; i++) dates.push(addDays(ws, i));
  const has = (d) => S.shifts.some((s) => s.date === d && s.emp === S.phoneEmp && !s.called);
  dates.forEach(ensureDate);
  const push = S.push && Date.now() - S.push.at < 6000 && S.push.k ? `<button type="button" class="ph-push" data-act="pushopen"><span class="appic">HV</span><span><b>${esc(TYPE[parseKey(S.push.k).type].name)} lineup is ready</b><small>${esc(LOC[parseKey(S.push.k).loc].short)} · ${esc(dLong(parseKey(S.push.k).date))}${meta(S.push.k).shared.ack ? " · please acknowledge" : ""}</small></span></button>` : "";
  return `<div class="phone" aria-label="Employee phone preview"><div class="phone-scr">
    <div class="ph-status"><span>${esc(fmtShort(S.now.time).replace("p", "").replace("a", ""))}</span><span class="isl"></span><span>●●● ▮</span></div>${push}
    <div class="ph-top"><div class="row1"><button type="button" class="back" tabindex="-1">${icon("chevL", 18)} Schedule</button></div><h3>${opts.title || "Lineup"}</h3>
      <div class="ph-week">${dates.map((d) => `<button type="button" data-act="phday" data-d="${d}" aria-pressed="${d === S.phoneDate}"><span>${DAYN[wd(d)].slice(0, 1)}</span><b>${dObj(d).getDate()}</b><i class="d ${has(d) ? "on" : ""}"></i></button>`).join("")}</div></div>
    <div class="ph-body">${inner}</div>
    <div class="ph-nav"><span>${icon("home", 21)}Home</span><span class="active">${icon("cal", 21)}Schedule</span><span>${icon("swap", 21)}Requests</span><span>${icon("grid", 21)}More</span></div>
  </div></div>`;
}
function phoneEmpty(list) {
  if (list.some((x) => x.removedText)) { const x = list.find((y) => y.removedText); const { type, loc } = parseKey(x.k); return `<div class="ph-card"><h4>${icon("swap", 18)} You're off ${esc(TYPE[type].name)}</h4><div class="ph-sub">${esc(x.removedText)}. You're no longer on the ${esc(TYPE[type].name)} lineup at ${esc(LOC[loc].short)}.</div></div>`; }
  if (list.some((x) => x.called)) { const x = list.find((y) => y.called); return `<div class="ph-card"><h4>${icon("userx", 18)} Called off</h4><div class="ph-sub">You're called off for ${esc(TYPE[x.called.type].name)} at ${esc(LOC[x.called.loc].short)} (${esc(dLong(x.called.date))}). If this is wrong, talk to your manager.</div></div>`; }
  if (list.some((x) => x.notShared)) { const x = list.find((y) => y.notShared); return `<div class="ph-empty"><span class="circ">${icon("clock", 24)}</span><b style="color:#243a32">Your ${esc(TYPE[x.notShared.type].name)} lineup isn't published yet</b>You work ${esc(range(x.notShared.start, x.notShared.end))} at ${esc(LOC[x.notShared.loc].short)}. You'll get a notification when your manager publishes it.</div>`; }
  return `<div class="ph-empty"><span class="circ">${icon("cal", 24)}</span><b style="color:#243a32">No lineup for this day</b>You're not scheduled on ${esc(dLong(S.phoneDate))}.</div>`;
}
function phoneNotes(snap) {
  const n = snap.notes; const out = [];
  if (n.specials.text.trim()) out.push(`<div class="ph-note sp"><b>Specials</b>${esc(n.specials.text.trim())}</div>`);
  if (n.n86.text.trim()) out.push(`<div class="ph-note n86"><b>86s</b>${esc(n.n86.text.trim())}</div>`);
  if (n.shift.text.trim()) out.push(`<div class="ph-note sn"><b>Shift notes</b>${esc(n.shift.text.trim())}</div>`);
  return out.join("");
}
function phoneAck(x) {
  if (!x.m.shared.ack) return "";
  const a = x.m.acks[S.phoneEmp];
  if (a) return `<div class="ph-acked">${icon("check", 16)} Acknowledged ${esc(fmt(a))}</div>`;
  if (isPast(x.k)) return `<div class="ph-sub" style="text-align:center">This lineup has started.</div>`;
  return `<button type="button" class="ph-ack" data-act="ack" data-k="${x.k}">${icon("check", 18)} Acknowledge</button>`;
}
function phoneState(x) {
  let s = "";
  if (x.m.shared.editing) s += `<div class="ph-upd">Your manager is updating this lineup. This is version ${x.m.shared.v}.</div>`;
  const { loc, date } = parseKey(x.k); const c = closureOf(loc, date);
  if (c && c.kind === "short") s += `<div class="ph-upd">Short hours today: open ${esc(range(c.opens, c.closes))} (${esc(c.title)}).</div>`;
  if (x.m.liveLog.length) s += `<div class="ph-chg">Updated ${esc(fmt(x.m.liveLog[x.m.liveLog.length - 1].at))}: ${esc(x.m.liveLog[x.m.liveLog.length - 1].text)}.</div>`;
  else if (x.m.shared.v > 1 && !x.m.shared.editing) s += `<div class="ph-chg">Updated at ${esc(fmt(x.m.shared.at))} (version ${x.m.shared.v}).</div>`;
  return s;
}
function phoneTeam(x, opts = {}) {
  const rows = x.snap.rows; const jobs = [...new Set(rows.map((r) => r.job))].sort((a, b) => DEPT_ORDER.indexOf(JOB[a].dept) - DEPT_ORDER.indexOf(JOB[b].dept) || JOB_ORDER.indexOf(a) - JOB_ORDER.indexOf(b));
  return jobs.map((j) => `<div class="ph-team-grp">${esc(JOB[j].name)} · ${rows.filter((r) => r.job === j).length}</div>` + rows.filter((r) => r.job === j).map((r) => `<div class="ph-person ${r.emp === S.phoneEmp ? "me" : ""}"><span class="av" style="width:30px;height:30px">${initials(EMP[r.emp].name)}</span><span class="n">${esc(EMP[r.emp].name)}${r.emp === S.phoneEmp ? ' <span class="you" style="font-size:9.5px;font-weight:800;color:var(--theme-accent)">YOU</span>' : ""}</span><span class="m">${esc(rangeShort(r.start, r.end))}${r.section ? `<br>${esc(r.section)}` : ""}</span></div>`).join("")).join("");
}

/* ---------------- top bar + app frame (shared) ---------------- */
function topbar(opts = {}) {
  const ws = weekStart(S.date); const days = []; for (let i = 0; i < 7; i++) days.push(addDays(ws, i));
  const sc = scopeLocs();
  const locLabel = !S.locFilter ? (sc.length > 1 ? "All locations" : LOC[sc[0]].short) : S.locFilter.length === 1 ? LOC[S.locFilter[0]].short : `${S.locFilter.length} locations`;
  const typeLabel = !S.typeFilter ? "All shifts" : S.typeFilter.length === 1 ? TYPE[S.typeFilter[0]].name : `${S.typeFilter.length} shifts`;
  const notToday = S.date !== S.now.date;
  return `<div class="topbar ${opts.under ? "under" : ""}">
    <button type="button" class="tb-btn icon" data-act="prevday" aria-label="Previous day">${icon("chevL", 18)}</button>
    <span class="tb-split ${notToday ? "away" : ""}"><button type="button" class="tb-btn" data-act="calendar" aria-label="Open calendar">${icon("cal", 15)}</button><button type="button" class="tb-btn" data-act="today" title="${notToday ? "Back to today" : "Today"}" aria-label="${esc(dFull(S.date))}${notToday ? ", back to today" : ", today"}">${esc(dLong(S.date))}</button></span>
    <button type="button" class="tb-btn icon" data-act="nextday" aria-label="Next day">${icon("chevR", 18)}</button>
    ${opts.noDays || opts.under ? "" : `<span class="tb-sep"></span><span class="days" role="group" aria-label="Day">${days.map((d) => { const c = CLOSURES.find((x) => x.date === d && sc.includes(x.loc)); return `<button type="button" class="day ${d < S.now.date ? "past" : ""}" data-act="day" data-d="${d}" aria-pressed="${d === S.date}"><small>${DAYN[wd(d)]}</small><b>${dObj(d).getDate()}</b><i class="mark ${c ? c.kind : "none"}"></i></button>`; }).join("")}</span>`}
    <span class="tb-sep"></span>
    <button type="button" class="tb-btn ${S.locFilter ? "on" : ""}" data-act="filter" data-w="loc">${icon("pin", 15)} ${esc(locLabel)} ${icon("chevD", 14)}</button>
    <button type="button" class="tb-btn ${S.typeFilter ? "on" : ""}" data-act="filter" data-w="type">${icon("clock", 15)} ${esc(typeLabel)} ${icon("chevD", 14)}</button>
    <div class="tb-right">${opts.right || ""}
      ${opts.noActions ? "" : actionButtons()}</div>
    ${opts.under ? `<div class="day-strip" role="group" aria-label="Day">${days.map((d) => { const c = CLOSURES.find((x) => x.date === d && sc.includes(x.loc)); return `<button type="button" class="day ${d < S.now.date ? "past" : ""}" data-act="day" data-d="${d}" aria-pressed="${d === S.date}"><small>${DAYN[wd(d)]}</small><b>${dObj(d).getDate()}</b><i class="mark ${c ? c.kind : "none"}"></i></button>`; }).join("")}</div>` : ""}</div>`; // Mert 2026-10-13: the week sits full width right above the lineups
}
function actionButtons() {
  return `<button type="button" class="tb-btn btn-green" data-act="share">${icon("share", 15)} Publish</button>`;
}
function sidebar() {
  return `<aside class="side"><div class="side-top"><button type="button" data-act="side" aria-label="Collapse sidebar">${icon("menu", 18)}</button><strong>${WS}</strong></div>
    <nav class="side-nav" aria-label="Main">
      <a class="nav" href="#" tabindex="-1">${icon("dash", 18)}<span>Workspace</span></a>
      <a class="nav" href="#" tabindex="-1">${icon("cal", 18)}<span>Schedule</span></a>
      <a class="nav child" href="#" tabindex="-1"><span>Requests</span></a>
      <a class="nav child active" href="#" tabindex="-1" aria-current="page" title="Lineup">${S.collapsedSide ? icon("list", 18) : ""}<span>Lineup</span><em class="new">New</em></a>
      <a class="nav" href="#" tabindex="-1">${icon("users", 18)}<span>Employees</span></a>
      <a class="nav" href="#" tabindex="-1">${icon("calcheck", 18)}<span>Availability</span></a>
      <a class="nav" href="#" tabindex="-1">${icon("mega", 18)}<span>Announcements</span></a>
      <a class="nav child" href="#" tabindex="-1"><span>Important Dates</span></a>
      <a class="nav" href="#" tabindex="-1">${icon("bell", 18)}<span>Notifications</span></a>
    </nav></aside>`;
}
function closedCard(loc, date) {
  const c = closureOf(loc, date);
  return `<div class="closed-card">${icon("ban", 22)}<div><b>Closed all day</b> · ${esc(c.title)} (Important Dates). No lineups for ${esc(LOC[loc].short)} on ${esc(dLong(date))}.</div></div>`;
}

/* ---------------- render + events ---------------- */
let root = null;
function render() {
  if (!root) return;
  const desk = root.querySelector(".mk-desk"); const st = desk ? desk.scrollTop : 0; const sl = desk ? desk.scrollLeft : 0;
  const main = root.querySelector(".main"); const mt = main ? main.scrollTop : 0;
  const phb = root.querySelector(".ph-body"); const pt = phb ? phb.scrollTop : 0;
  const focusId = document.activeElement && document.activeElement.id;
  const V = NF.variants[S.variant];
  root.innerHTML = chrome() + `<div class="mk-stage" data-view="${S.view}"><div class="mk-desk"><div class="mk-desk-inner" style="min-width:${V.minWidth || 1120}px"><div class="app" data-collapsed="${S.collapsedSide}">${sidebar()}<main class="main">${V.cockpit()}</main></div></div></div>
    <div class="mk-phone-col"><div class="mk-phone-head"><label for="ph-emp">Employee phone:</label><select id="ph-emp" data-act="phemp">${EMPS.filter((e) => e.app && e.locs.some((l) => scopeLocs().includes(l) || true)).map((e) => `<option value="${e.id}" ${e.id === S.phoneEmp ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</select></div>
    ${V.phone()}<div class="mk-note">The phone shows what the employee sees: only lineups that were published to them, in the version that was published. Tap Acknowledge and watch the count change on the desktop.</div></div></div><div class="toast-wrap"></div>`;
  const d2 = root.querySelector(".mk-desk"); if (d2) { d2.scrollTop = st; d2.scrollLeft = sl; }
  const m2 = root.querySelector(".main"); if (m2) m2.scrollTop = mt;
  const p2 = root.querySelector(".ph-body"); if (p2) p2.scrollTop = pt;
  if (focusId) { const f = document.getElementById(focusId); if (f) f.focus({ preventScroll: true }); }
  const top = root.querySelector(".lu-top"); if (top) root.style.setProperty("--top-h", top.offsetHeight + "px");
  V.after && V.after(root);
}
function chrome() {
  const vs = NF.order.filter((v) => NF.variants[v]);
  return `<div class="mk-bar"><div class="mk-title">Lineup <small>mockup ${esc(NF.variants[S.variant].name)}</small></div>
    ${vs.length > 1 ? `<div class="mk-group"><span>Mockup</span><div class="mk-seg">${vs.map((v) => `<button type="button" data-mk="variant" data-v="${v}" aria-pressed="${S.variant === v}">${esc(NF.variants[v].name)}</button>`).join("")}</div></div>` : ""}
    <div class="mk-group"><span>Who</span><select class="mk-select" data-mk="role" aria-label="Who is using the desktop">${ROLES.map((r) => `<option value="${r.id}" ${r.id === S.role ? "selected" : ""}>${esc(r.label)}</option>`).join("")}</select></div>
    <div class="mk-group"><span>Show</span><div class="mk-seg">${[["both", "Desktop + phone"], ["desk", "Desktop"], ["phone", "Phone"]].map(([v, l]) => `<button type="button" data-mk="view" data-v="${v}" aria-pressed="${S.view === v}">${l}</button>`).join("")}</div></div>
    <div class="mk-group"><span>Now</span><select class="mk-select" data-mk="now" aria-label="Demo time">${NOW_PRESETS.map((p) => `<option value="${p.id}" ${p.id === S.now.id ? "selected" : ""}>${esc(p.label)}</option>`).join("")}</select></div>
    <div class="mk-group"><span>Time format</span><div class="mk-seg" title="Workspace setting (Settings → Schedule)">${["12h", "24h"].map((v) => `<button type="button" data-mk="clock" data-v="${v}" aria-pressed="${S.clock === v}">${v}</button>`).join("")}</div></div>
    <span class="mk-spacer"></span><button type="button" class="mk-live" data-mk="live">${icon("radio", 14)} Live events (demo)</button></div>`;
}
function onClick(ev) {
  const mk = ev.target.closest("[data-mk]");
  if (mk) {
    const w = mk.dataset.mk;
    if (w === "variant") { S.variant = mk.dataset.v; try { localStorage.setItem("lineup-variant", S.variant); } catch (e) {} render(); }
    if (w === "clock") { S.clock = mk.dataset.v; render(); }
    if (w === "view") { S.view = mk.dataset.v; S.collapsedSide = S.view === "both" || S.collapsedSide && S.view !== "desk"; render(); }
    if (w === "live") {
      openPop(mk, `<div class="pop-hd"><strong>Live events</strong><small>Demo only: what other parts of the app do</small></div><div class="pop-bd">${LIVE.map((l) => `<button type="button" class="mi" data-live="${l.id}">${icon("radio", 14)} ${esc(l.label)}</button>`).join("")}</div>`, (el) => {
        el.addEventListener("click", (e2) => { const b = e2.target.closest("[data-live]"); if (b) { closePop(); runLive(b.dataset.live); } });
      }, { minWidth: 320 });
    }
    return;
  }
  const a = ev.target.closest("[data-act]");
  if (!a) { // Mert 2026-10-13: a click anywhere on a lineup's header row collapses or expands it
    const hd = ev.target.closest("[data-hd]");
    if (hd && !ev.target.closest("button, a, input, select, textarea, label")) { meta(hd.dataset.hd).collapsed = !meta(hd.dataset.hd).collapsed; render(); }
    return;
  }
  const act = a.dataset.act, id = a.dataset.id, k = a.dataset.k;
  if (act !== "calloff" && S.armed) { S.armed = null; }
  switch (act) {
    case "side": S.collapsedSide = !S.collapsedSide; render(); break;
    case "prevday": goDate(addDays(S.date, -1)); break;
    case "nextday": goDate(addDays(S.date, 1)); break;
    case "today": goDate(S.now.date); break;
    case "day": goDate(a.dataset.d); break;
    case "calendar": openCalendar(a); break;
    case "filter": openFilter(a, a.dataset.w); break;
    case "collapse": meta(k).collapsed = !meta(k).collapsed; render(); break;
    case "calloff":
      if (S.armed === id) { S.armed = null; callOff(id); }
      else { S.armed = id; render(); setTimeout(() => { if (S.armed === id) { S.armed = null; render(); } }, 4000); const b = document.querySelector(`[data-act="calloff"][data-id="${id}"]`); b && b.focus(); }
      break;
    case "restore": restore(id); break;
    case "pick": openPicker(a, id); break;
    case "labels": openLabels(a, id); break;
    case "addstaff": addStaff(k); break;
    case "addjob": addToJob(k, a.dataset.job); break;
    case "rmpending": removePending(id); break;
    case "share": openShare(null); break;
    case "share1": openShare([k]); break;
    case "more": openMore(a, k); break;
    case "unpub": confirmUnpublish(k); break;
    case "hideshort": { const p = parseKey(k); HIDDEN_SHORT.add(p.loc + "|" + p.date); render(); break; }
    case "exportmenu": openExportMenu(a); break;
    case "acks": openAcks(a, k); break;
    case "ack": acknowledge(k, S.phoneEmp); toast("Thanks, acknowledged."); break;
    case "notes": { const m = meta(k); const any = ["specials", "n86", "shift"].some((id) => m.notes[id].text.trim()); m.notesOpen = !(m.notesOpen === undefined ? any : m.notesOpen); render(); break; }
    case "phday": S.phoneDate = a.dataset.d; render(); break;
    case "pushopen": S.phoneDate = parseKey(S.push.k).date; S.push = null; render(); break;
    case "phtab": S.phoneTab[k] = a.dataset.t; render(); break;
    case "focus": { const el = document.getElementById("lt-" + k.replace(/\|/g, "-")); if (el) { meta(k).collapsed = false; render(); const e2 = document.getElementById("lt-" + k.replace(/\|/g, "-")); e2 && e2.scrollIntoView({ block: "start", inline: "nearest", behavior: "smooth" }); } break; }
    default: NF.variants[S.variant].onAct && NF.variants[S.variant].onAct(act, a);
  }
}
function onChange(ev) {
  const t = ev.target;
  if (t.dataset.mk === "role") { S.role = t.value; S.locFilter = null; render(); return; }
  if (t.dataset.mk === "now") { S.now = { ...NOW_PRESETS.find((p) => p.id === t.value) }; render(); return; }
  if (t.dataset.act === "phemp") { S.phoneEmp = t.value; render(); return; }
  if (t.dataset.field === "pjob") { setPendingJob(t.dataset.id, t.value); return; }
  if (t.dataset.field === "section" && t.value === "__new") { openNewSection(t, t.dataset.id); return; }
  if (t.dataset.field) setField(t.dataset.id, t.dataset.field, t.value);
}
function openNewSection(anchor, rowId) {
  const r = rowById(rowId); anchor.value = r.section || "";
  openPop(anchor, `<div class="pop-hd"><strong>New section</strong><small>${esc(LOC[r.loc].short)} · saved for every lineup here</small></div>
    <div class="timepop"><label class="sr" for="sec-new">Section name</label><input id="sec-new" class="pop-search" maxlength="40" placeholder="e.g. Patio" autocomplete="off"></div>
    <div class="pop-ft"><button type="button" class="nf-btn secondary sm" data-c>Cancel</button><button type="button" class="nf-btn sm" data-s>Add</button></div>`, (el) => {
    const inp = el.querySelector("#sec-new");
    const save = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } closePop(); if (!SECTIONS[r.loc].includes(v)) SECTIONS[r.loc].push(v); setField(rowId, "section", v); };
    el.querySelector("[data-c]").onclick = closePop;
    el.querySelector("[data-s]").onclick = save;
    inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") save(); });
  });
}
function onInput(ev) { const t = ev.target; if (t.classList && t.classList.contains("tin")) { onTimeInput(t); return; } if (t.dataset.note) meta(t.dataset.k).notes[t.dataset.note].text = t.value; }

/* drag reorder (within one position group); keyboard: Alt+Arrow on the grip */
let dragId = null;
function onDragStart(ev) { const row = ev.target.closest("[data-row]"); if (!row || row.getAttribute("draggable") !== "true") return; dragId = row.dataset.row; row.classList.add("dragging"); ev.dataTransfer.effectAllowed = "move"; try { ev.dataTransfer.setData("text/plain", dragId); } catch (e) {} }
function onDragOver(ev) {
  const row = ev.target.closest("[data-row]"); if (!row || !dragId) return;
  const a = rowById(dragId), b = rowById(row.dataset.row); if (!a || !b || a.job !== b.job || a === b) return;
  ev.preventDefault();
  const r = row.getBoundingClientRect(); const after = ev.clientY > r.top + r.height / 2;
  document.querySelectorAll(".drop-before,.drop-after").forEach((x) => x.classList.remove("drop-before", "drop-after"));
  row.classList.add(after ? "drop-after" : "drop-before");
}
function onDrop(ev) { const row = ev.target.closest("[data-row]"); if (!row || !dragId) return; ev.preventDefault(); const after = row.classList.contains("drop-after"); const id = dragId; dragId = null; reorder(id, row.dataset.row, after); }
function onDragEnd() { dragId = null; document.querySelectorAll(".dragging,.drop-before,.drop-after").forEach((x) => x.classList.remove("dragging", "drop-before", "drop-after")); }
/* inline In–Out: type, ↑/↓ 15 min (Shift = 1 hour), Enter = same field next row, Shift+Enter = previous row, Esc = undo typing */
function timeInputs() { return [...root.querySelectorAll("input.tin")]; }
function nudge(inp, delta) {
  const cur = parseTyped(inp.value, S.clock, toMin(inp.dataset.v) >= 720) || inp.dataset.v;
  const m = (toMin(cur) + delta + 1440) % 1440; const t = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  inp.value = fmt(t); inp.select();
}
function commitTime(inp) {
  const v = parseTyped(inp.value, S.clock, toMin(inp.dataset.v) >= 720);
  if (!v) { inp.value = fmt(inp.dataset.v); inp.classList.add("bad"); setTimeout(() => inp.classList.remove("bad"), 1600); toast(`Couldn't read that time. Type it like ${S.clock === "24h" ? "17:30" : "5:30p"}.`); return; }
  inp.value = fmt(v);
  if (v === inp.dataset.v) return;
  inp.dataset.v = v; const id = inp.dataset.id, edge = inp.dataset.time;
  setTimeout(() => setField(id, edge, v), 0); // after focus has moved, so render() keeps the next field focused
}
function onTimeKey(ev, inp) {
  if (ev.key === "ArrowUp" || ev.key === "ArrowDown") { ev.preventDefault(); nudge(inp, (ev.key === "ArrowUp" ? 1 : -1) * (ev.shiftKey ? 60 : 15)); return; }
  if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); inp.value = fmt(inp.dataset.v); inp.select(); return; }
  if (ev.key === "Enter") {
    ev.preventDefault();
    const same = timeInputs().filter((x) => x.dataset.time === inp.dataset.time); const i = same.indexOf(inp);
    const next = same[i + (ev.shiftKey ? -1 : 1)];
    if (next) next.focus(); else { commitTime(inp); inp.select(); }
  }
}
function onTimeInput(inp) {
  const clean = inp.value.replace(/[^0-9: apmAPM.]/g, ""); if (clean !== inp.value) inp.value = clean;
  if (inp.dataset.time !== "start") return;
  const raw = inp.value.trim().toLowerCase();
  const done = S.clock === "24h" ? /^\d{1,2}:\d{2}$|^\d{4}$/.test(raw) : /[ap]\.?\s*m?\.?$/.test(raw) && /\d/.test(raw);
  if (done && parseTyped(raw, S.clock, toMin(inp.dataset.v) >= 720)) { const out = document.getElementById("tend-" + inp.dataset.id); out && out.focus(); }
}
function onKey(ev) {
  const ti = ev.target.closest && ev.target.closest("input.tin"); if (ti) { onTimeKey(ev, ti); return; }
  const g = ev.target.closest && ev.target.closest("[data-grip]");
  if (g && (ev.key === "ArrowUp" || ev.key === "ArrowDown") && (ev.altKey || ev.metaKey)) { ev.preventDefault(); moveRow(g.dataset.grip, ev.key === "ArrowUp" ? -1 : 1); }
}

NF.mount = function (el, initial) {
  root = el;
  if (initial && initial.variant) S.variant = initial.variant;
  try { const v = localStorage.getItem("lineup-variant"); if (v && NF.variants[v] && NF.order.length > 1 && !(location.hash || "").replace("#", "")) S.variant = v; } catch (e) {}
  const h = (location.hash || "").replace("#", ""); if (NF.variants[h]) S.variant = h;
  if (window.innerWidth < 900) S.view = "phone"; else if (window.innerWidth < 1500) { S.view = "desk"; S.collapsedSide = false; }
  ensureDate(S.date);
  // a few realistic notes on today's dinner draft
  const kd = keyOf("2026-10-13", "dt", "dinner"); meta(kd).notes.specials.text = "Chef's feature: braised short rib, $34\nDessert: pumpkin cheesecake";
  meta(kd).notes.n86.text = "Oysters\nRosé by the glass";
  meta(kd).notes.shift = { on: true, text: "Party of 14 at 7:00 PM on the patio (Hartwell). Pre-shift at 3:45 PM." };
  const kc = keyOf("2026-10-13", "dt", "close"); meta(kc).notes.shift = { on: true, text: "Deep clean the bar wells after last call." };
  el.addEventListener("click", onClick); el.addEventListener("change", onChange); el.addEventListener("input", onInput);
  el.addEventListener("dragstart", onDragStart); el.addEventListener("dragover", onDragOver); el.addEventListener("drop", onDrop); el.addEventListener("dragend", onDragEnd);
  el.addEventListener("keydown", onKey);
  el.addEventListener("focusin", (ev) => { const t = ev.target; if (t.classList && t.classList.contains("tin")) { t.select(); t._fresh = true; } });
  el.addEventListener("mouseup", (ev) => { const t = ev.target; if (t.classList && t.classList.contains("tin") && t._fresh) { ev.preventDefault(); t.select(); } if (t._fresh) t._fresh = false; });
  el.addEventListener("focusout", (ev) => { const t = ev.target; if (t.classList && t.classList.contains("tin") && t.isConnected) commitTime(t); });
  render();
};

Object.assign(NF, { typeCell, pageHeader, locCount, icon, esc, LOCS, TYPES, JOBS, DEPTS, EMP, JOB, TYPE, LOC, LABEL, SECTIONS, ROLE, S, keyOf, parseKey, meta, rowsOf, grouped, statusOf, isLocked, isPast, startOf,
  visibleKeys, visibleLocs, visibleTypes, hasRows, closureOf, statusPill, ackSummary, bannersFor, nameCell, posCell, timeCell, labelCell, sectionCell, actionCell, notesBlock,
  frozenTop, jobAddBtn, topbar, actionButtons, closedCard, fmt, fmtShort, range, rangeShort, dLong, dFull, isFlash, phoneLineups, phoneShell, phoneEmpty, phoneNotes, phoneAck, phoneState, phoneTeam, shareRecipients,
  initials, render, feed, ensureDate, scopeLocs, WS, DEPT_ORDER,
  openShare, openModal, closeModal, openPop, closePop, toast, openExport, doShare, unpublish });
NF.variants = NF.variants || {};
NF.order = ["a", "b", "c"];
})();
