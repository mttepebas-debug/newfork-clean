/* 3 · Dayparts: start from a pattern, then tap or drag across a day × part-of-day grid. Exact hours stay one click away. */
(function () {
"use strict";
const N = window.NF;
const { icon, esc, DAYS, DAYL, OPEN, CLOSE, S, TYPES, fmtS, mergeR, subR, asRanges, blocks, isFree, dayState, dayText, weekOf, initials, timeSelect, openPop, closePop, setDay, render, summaryLine, toast, clone, drag, blank, norm } = N;
const DP = [
  { id: "m", name: "Morning", hint: "6–11 AM", a: OPEN, b: 660, ic: "sunrise" },
  { id: "d", name: "Midday", hint: "11 AM–4 PM", a: 660, b: 960, ic: "sun" },
  { id: "e", name: "Evening", hint: "4–10 PM", a: 960, b: 1320, ic: "sunset" },
  { id: "l", name: "Late night", hint: "10 PM–2 AM", a: 1320, b: CLOSE, ic: "moon" },
];
const rows = () => (S.mode === "types" ? TYPES.map((t) => ({ id: t.id, name: t.name, hint: `${fmtS(t.a)}–${fmtS(t.b)}`, a: t.a, b: t.b, ic: t.ic, type: true })) : DP);
const rowById = (id) => rows().find((r) => r.id === id);

function cellState(d, r) {
  if (d.all) return { st: "off" };
  if (r.type) return { st: d.t.includes(r.id) ? "off" : "free" };
  let cover = 0, lo = null, hi = null;
  d.r.forEach(([x, y]) => { const a = Math.max(x, r.a), b = Math.min(y, r.b); if (b > a) { cover += b - a; lo = lo == null ? a : Math.min(lo, a); hi = hi == null ? b : Math.max(hi, b); } });
  if (cover >= r.b - r.a) return { st: "off" };
  if (!cover) return { st: "free" };
  const txt = lo > r.a && hi >= r.b ? `after ${fmtS(lo)}` : lo <= r.a && hi < r.b ? `until ${fmtS(hi)}` : `${fmtS(lo)}–${fmtS(hi)}`;
  return { st: "part", txt };
}
function applyCell(d, r, target) {
  if (r.type) {
    const all = TYPES.map((t) => t.id);
    const cur = d.all ? all : d.t;
    return { r: d.all ? [] : d.r, t: target === "off" ? cur.concat(r.id) : cur.filter((x) => x !== r.id) };
  }
  return { r: target === "off" ? mergeR(asRanges(d).concat([[r.a, r.b]])) : subR(asRanges(d), [r.a, r.b]), t: d.t };
}

/* patterns: one click fills the week */
const PATS = [
  { id: "any", name: "Any time", desc: "Open all week", ic: "circleCheck", day: () => ({}) },
  { id: "days", name: "Days only", desc: "Not after 4 PM", ic: "sun", day: () => (S.mode === "types" ? { t: ["dinner", "close"] } : { r: [[960, CLOSE]] }) },
  { id: "eves", name: "Evenings only", desc: "Not before 4 PM", ic: "moon", day: () => (S.mode === "types" ? { t: ["breakfast", "lunch"] } : { r: [[OPEN, 960]] }) },
  { id: "wkdy", name: "Weekdays only", desc: "Not Sat or Sun", ic: "brief", day: (i) => (i >= 5 ? { all: true } : {}) },
  { id: "wknd", name: "Weekends only", desc: "Not Mon–Fri", ic: "calcheck", day: (i) => (i < 5 ? { all: true } : {}) },
];
const patWeek = (p) => DAYS.map((_, i) => norm(Object.assign(blank(), p.day(i))));
const key = (d) => (d.all ? "A" : S.mode === "types" ? d.t.join() : JSON.stringify(d.r));
const sameWeek = (a, b) => a.every((d, i) => key(d) === key(b[i]));
function mini(week) {
  return `<span class="v3-mini" aria-hidden="true">${rows().map((r) => DAYS.map((_, i) => `<i class="${cellState(week[i], r).st}"></i>`).join("")).join("")}</span>`;
}
function patterns(phone) {
  const match = PATS.find((p) => sameWeek(patWeek(p), S.week));
  const cards = PATS.map((p) => `<button type="button" class="v3-pat" data-act="v3-pat" data-id="${p.id}" aria-pressed="${match === p}">${mini(patWeek(p))}<span class="v3-pt"><b>${p.name}</b><small>${p.desc}</small></span></button>`).join("");
  const custom = match ? "" : `<div class="v3-pat custom" aria-current="true">${mini(S.week)}<span class="v3-pt"><b>Your own</b><small>Custom week</small></span></div>`;
  return `<div class="v3-pats ${phone ? "ph" : ""}">${custom}${cards}</div>`;
}
function matrix(week, opts = {}) {
  const ro = !!opts.ro, ph = !!opts.phone;
  const head = DAYS.map((d, i) => {
    const st = dayState(week[i]);
    const label = ph ? d.slice(0, 1) : d;
    return ro ? `<span class="v3-ch st-${st}">${label}</span>` : `<button type="button" class="v3-ch st-${st}" data-act="v3-day" data-day="${i}" title="Exact hours for ${DAYL[i]}"><b>${label}</b>${ph ? "" : `<small>${st === "off" ? "All day" : st === "some" ? "Some" : "Free"}</small>`}</button>`;
  }).join("");
  const body = rows().map((r) => {
    const rh = ro ? `<span class="v3-rh">${icon(r.ic, 15)}<span><b>${r.name}</b>${ph ? "" : `<small>${r.hint}</small>`}</span></span>`
      : `<button type="button" class="v3-rh" data-act="v3-row" data-row="${r.id}" title="Mark every ${r.name.toLowerCase()}">${icon(r.ic, 16)}<span><b>${r.name}</b><small>${r.hint}</small></span></button>`;
    return rh + DAYS.map((_, i) => {
      const c = cellState(week[i], r);
      const inner = c.st === "off" ? icon("x", ph ? 14 : 15) : c.st === "part" ? `<span>${c.txt}</span>` : "";
      return ro ? `<span class="v3-c ${c.st}">${inner}</span>` : `<button type="button" class="v3-c ${c.st}" data-cell="${r.id}:${i}" aria-pressed="${c.st === "off"}" aria-label="${DAYL[i]} ${r.name}">${inner}</button>`;
    }).join("");
  }).join("");
  return `<div class="v3-mx ${ro ? "ro" : ""} ${ph ? "mob" : ""} ${S.mode === "types" ? "types" : ""}"><span class="v3-corner"></span>${head}${body}</div>`;
}
function legend() {
  return `<div class="v3-legend"><span><i class="free"></i>Available</span><span><i class="part"></i>Part of it</span><span><i class="off"></i>Prefer not to work</span></div>`;
}
function exactForm(i) {
  const d = S.week[i];
  const st = dayState(d);
  const seg = `<div class="seg big v3-seg">${[["free", "Available"], ["some", S.mode === "types" ? "Some shifts" : "Some hours"], ["off", "Unavailable"]].map(([v, l]) => `<button type="button" data-x="st" data-v="${v}" aria-pressed="${st === v}">${l}</button>`).join("")}</div>`;
  const body = S.mode === "types" ? `<div class="tpills">${TYPES.map((t) => `<button type="button" class="tpill" data-x="type" data-type="${t.id}" aria-pressed="${d.all || d.t.includes(t.id)}">${icon(t.ic, 14)}<span>${t.name}</span></button>`).join("")}</div>`
    : st === "some" ? `${d.r.map(([a, b], k) => `<div class="v2-pr">${timeSelect(`data-x="a" data-k="${k}" aria-label="From"`, a, { to: CLOSE - 30 })}<span>to</span>${timeSelect(`data-x="b" data-k="${k}" aria-label="To"`, b, { from: OPEN + 30 })}<button type="button" class="btn ghost icon sm" data-x="del" data-k="${k}" aria-label="Remove">${icon("trash", 14)}</button></div>`).join("")}<button type="button" class="btn sm quiet" data-x="add">${icon("plus", 14)} Add hours</button>` : "";
  return `${seg}${body}`;
}
function exactAct(i, x) {
  const d = S.week[i]; const w = x.dataset.x;
  if (w === "st") { const v = x.dataset.v; setDay(i, v === "free" ? blank() : v === "off" ? { all: true } : S.mode === "types" ? { t: ["dinner"] } : isFree(d) || d.all ? { r: [[1080, CLOSE]] } : d); return true; }
  if (w === "type") { const id = x.dataset.type; const cur = d.all ? TYPES.map((t) => t.id) : d.t; setDay(i, { r: d.r, t: cur.includes(id) ? cur.filter((z) => z !== id) : cur.concat(id) }); return true; }
  if (w === "del") { const r = d.r.slice(); r.splice(+x.dataset.k, 1); setDay(i, { r, t: d.t }); return true; }
  if (w === "add") { const last = d.r[d.r.length - 1]; const a = last ? Math.min(last[1] + 60, CLOSE - 120) : 1080; setDay(i, { r: d.r.concat([[a, Math.min(a + 120, CLOSE)]]), t: d.t }); return true; }
  return false;
}
function exactChange(i, t) {
  const d = S.week[i]; const k = +t.dataset.k; const r = d.r.map((z) => z.slice());
  if (t.dataset.x === "a") r[k][0] = +t.value; else r[k][1] = +t.value;
  if (r[k][0] >= r[k][1]) { if (t.dataset.x === "a") r[k][1] = Math.min(CLOSE, r[k][0] + 60); else r[k][0] = Math.max(OPEN, r[k][1] - 60); }
  setDay(i, { r, t: d.t });
}
function openExact(el, i) {
  if (el.closest(".phone")) { S.ph.sheet = { day: i }; render(); return; }
  const html = () => `<div class="pop-hd"><strong>${DAYL[i]}</strong><small>Exact hours</small></div><div class="pop-bd v3-exact">${exactForm(i)}</div><div class="pop-ft"><span class="grow"></span><button type="button" class="btn sm dark" data-x="done">Done</button></div>`;
  openPop(el, html(), (pop) => {
    pop.addEventListener("click", (e) => { const x = e.target.closest("[data-x]"); if (!x || x.tagName === "SELECT") return; if (x.dataset.x === "done") { closePop(); return; } if (exactAct(i, x)) pop.innerHTML = html(); });
    pop.addEventListener("change", (e) => { if (e.target.dataset.x) { exactChange(i, e.target); pop.innerHTML = html(); } });
  }, { cls: "v3-pop", align: "center" });
}
function teamCell(d) {
  return `<span class="v3-tc">${rows().map((r) => `<i class="${cellState(d, r).st}"></i>`).join("")}</span>`;
}

N.variants["3"] = {
  name: "3 · Dayparts",
  tr: {
    ad: "Gün dilimleri",
    fikir: "Saat yerine günün dilimleri: Morning, Midday, Evening, Late night (vardiya tipi seçiliyse Breakfast, Lunch, Dinner, Close). Üstte hazır kalıplar var (Days only, Evenings only, Weekdays only…): tek tıkla haftayı doldurur. Sonra kutulara tıklayarak ya da üstlerinden sürükleyerek düzeltilir. Tam saat gerekirse gün adına tıklanır.",
    arti: "En hızlı olan: çoğu kişi bir kalıp + iki tıkla bitirir. Kare ızgara telefonda parmakla çok rahat. Vardiya tipi ayarında doğal olarak çalışır. Müdür ekranında herkesin haftası küçük bir ızgara olarak yan yana.",
    eksi: "Dilim sınırları (ör. 4 PM) herkesin saatine tam uymaz; \"after 6 PM\" gibi durumlar yarım kutu olarak görünür ve tam saat için gün adına tıklamak gerekir.",
    dene: "\"Weekdays only\" kalıbına tıkla, sonra Evening satırında sürükle. Cuma'ya tıklayıp tam saat gir.",
  },
  editor() {
    return `<div class="v3"><div class="v3-sec"><span class="lbl">Start from a pattern</span>${patterns()}</div>${summaryLine(S.week)}
      ${matrix(S.week)}<div class="v3-foot">${legend()}<span class="grow"></span><span class="muted">${icon("pointer", 13)} Click or drag across boxes. Click a day for exact hours.</span></div></div>`;
  },
  phoneEditor() {
    return `${summaryLine(S.week)}<span class="lbl v3-pl">Start from a pattern</span>${patterns(true)}${matrix(S.week, { phone: true })}${legend()}<p class="muted v3-ptip">${icon("pointer", 13)} Tap or drag across boxes. Tap a day letter for exact hours.</p>`;
  },
  phoneSheet() {
    const i = S.ph.sheet.day;
    return `<h3>${DAYL[i]}</h3><div class="sub">${S.week[i].all ? "Unavailable all day" : isFree(S.week[i]) ? "Available" : esc(dayText(S.week[i]))}</div><div class="v3-exact v3-sheet" data-day="${i}">${exactForm(i)}</div><div class="acts"><button type="button" class="btn dark" data-act="ph-sheet-close">Done</button></div>`;
  },
  readOnly(p) { return `${matrix(weekOf(p), { ro: true })}${legend()}`; },
  phoneReadOnly(p) { return `${matrix(weekOf(p), { ro: true, phone: true })}${legend()}`; },
  team(list) {
    const rs = rows();
    const key = `<div class="v3-key">${icon("info", 13)}<span>Each day reads top to bottom:</span>${rs.map((r) => `<span class="v3-kr">${icon(r.ic, 13)}${r.name}</span>`).join('<span class="v3-ka">›</span>')}</div>`;
    const body = list.map((p) => {
      const w = weekOf(p);
      return `<div class="tt-row v3-tr" data-act="person" data-id="${p.id}" role="button" tabindex="0"><div class="who"><span class="avatar">${initials(p.name)}</span><span><b>${esc(p.name)}</b><small>${esc(p.job)}</small></span></div>${w ? DAYS.map((_, i) => `<div class="c">${teamCell(w[i])}</div>`).join("") : `<div class="c v1-ns"><span class="tag mute">Not submitted yet</span></div>`}</div>`;
    }).join("");
    return `${key}<div class="tt v3-tt"><div class="tt-row hd v3-tr"><div class="who-h">Employee</div>${DAYS.map((d) => `<div class="c">${d.toUpperCase()}</div>`).join("")}</div>${body}</div>`;
  },
  phoneTeam(list) {
    return `<div class="v1-ptl">${list.map((p) => { const w = weekOf(p); return `<button type="button" class="v1-ptc" data-act="person" data-id="${p.id}"><span class="avatar">${initials(p.name)}</span><span class="v1-ptn"><b>${esc(p.name)}</b><small>${w ? esc(p.job) : "Not submitted yet"}</small></span>${w ? mini(w) : ""}${icon("chevR", 15)}</button>`; }).join("")}</div>`;
  },
  act(act, el) {
    if (act === "v3-pat") {
      const p = PATS.find((x) => x.id === el.dataset.id); const before = clone(S.week);
      S.week = patWeek(p); render();
      toast(`<b>${p.name}.</b><small>Now adjust any box. Save to share it.</small>`, { undo: () => { S.week = before; } });
      return true;
    }
    if (act === "v3-row") {
      const r = rowById(el.dataset.row); const allOff = S.week.every((d) => cellState(d, r).st === "off");
      S.week = S.week.map((d) => norm(applyCell(d, r, allOff ? "free" : "off"))); render(); return true;
    }
    if (act === "v3-day") { openExact(el, +el.dataset.day); return true; }
    return false;
  },
  down(ev) {
    if (ev.button !== 0) return;
    const c = ev.target.closest && ev.target.closest("[data-cell]"); if (!c) return;
    ev.preventDefault();
    const [rid, di] = c.dataset.cell.split(":"); const r0 = rowById(rid);
    const target = cellState(S.week[+di], r0).st === "off" ? "free" : "off";
    const done = new Set();
    const hit = (el) => { if (!el || done.has(el.dataset.cell)) return; done.add(el.dataset.cell); const [r, i] = el.dataset.cell.split(":"); S.week[+i] = norm(applyCell(S.week[+i], rowById(r), target)); render(); };
    hit(c);
    drag(ev, (e) => { const o = document.elementFromPoint(e.clientX, e.clientY); const cc = o && o.closest && o.closest("[data-cell]"); if (cc) hit(cc); });
  },
  change(ev) { const sh = ev.target.closest && ev.target.closest(".v3-sheet"); if (sh && ev.target.dataset.x) exactChange(+sh.dataset.day, ev.target); },
};
document.addEventListener("click", (e) => {
  const x = e.target.closest && e.target.closest(".v3-sheet [data-x]"); if (!x || S.variant !== "3" || x.tagName === "SELECT") return;
  const i = +x.closest(".v3-sheet").dataset.day; exactAct(i, x);
});
})();
