/* 5 · Rules: the week as a few short rules. Type one the way you'd say it, or build it with day and time pickers. */
(function () {
"use strict";
const N = window.NF;
const { icon, esc, DAYS, DAYL, DAYP, OPEN, CLOSE, S, TYPES, TYPE, fmtC, pct, clamp, mergeR, norm, blank, isFree, dayState, dayText, daysLabel, weekOf, first, initials, timeSelect, render, railHTML, toast, clone } = N;
const V = () => N.vs("5");
const ALL7 = [0, 1, 2, 3, 4, 5, 6];
const LET = ["M", "T", "W", "T", "F", "S", "S"];

/* ---------- rules from a week ---------- */
/* hours entry: one rule per time window (the days that share it); shift types entry: one rule per set of shift types */
function rules(week = S.week, mode = S.mode) {
  const m = new Map();
  const put = (k, o, i) => { if (!m.has(k)) m.set(k, Object.assign(o, { k, days: [] })); m.get(k).days.push(i); };
  week.forEach((d, i) => {
    if (d.all) return put("all", { kind: "all" }, i);
    if (mode === "types") { if (d.t.length) put("t:" + d.t.join("+"), { kind: "t", types: d.t.slice() }, i); return; }
    d.r.forEach(([a, b]) => put(`r:${a}-${b}`, { kind: "r", a, b }, i));
  });
  return [...m.values()].sort((x, y) => x.days[0] - y.days[0] || (x.a || 0) - (y.a || 0));
}
const typeNames = (ts) => { const n = ts.map((t) => TYPE[t].name); return n.length < 2 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`; };
function when(r) {
  if (r.kind === "all") return "All day";
  if (r.kind === "t") return `${typeNames(r.types)} ${r.types.length > 1 ? "shifts" : "shift"}`;
  if (r.a <= OPEN) return `Before ${fmtC(r.b)}`;
  if (r.b >= CLOSE) return `After ${fmtC(r.a)}`;
  return `${fmtC(r.a)} – ${fmtC(r.b)}`;
}
function whenSay(r) {
  if (r.kind === "all") return "at all";
  if (r.kind === "t") return `${typeNames(r.types)} shifts`;
  if (r.a <= OPEN) return `before ${fmtC(r.b)}`;
  if (r.b >= CLOSE) return `after ${fmtC(r.a)}`;
  return `between ${fmtC(r.a)} and ${fmtC(r.b)}`;
}
const daysLong = (days) => daysLabel(days, true);
function say(r) {
  const every = r.days.length === 7, D = daysLong(r.days).replace(/^(Weekdays|Weekends)$/, (w) => w.toLowerCase());
  if (r.kind === "t") return `You'd rather not work ${whenSay(r)}${every ? "" : ` on ${D}`}.`;
  if (every) return r.kind === "all" ? "That marks every day as unavailable." : `You'd rather not work ${whenSay(r)}, any day.`;
  return `You'd rather not work ${D} ${whenSay(r)}.`;
}
const tagText = (r) => `${daysLabel(r.days)} ${r.kind === "all" ? "all day" : r.kind === "t" ? typeNames(r.types) : when(r).replace(/^(Before|After)/, (w) => w.toLowerCase())}`;
const ruleIcon = (r) => (r.kind === "all" ? "ban" : r.kind === "t" ? TYPE[r.types[0]].ic : "clock");

function addTo(week, r) {
  return week.map((d, i) => {
    if (!r.days.includes(i)) return d;
    if (r.kind === "all") return norm({ all: true });
    if (d.all) return d;
    if (r.kind === "t") return norm({ r: d.r, t: d.t.concat(r.types) });
    return norm({ r: d.r.concat([[r.a, r.b]]), t: d.t });
  });
}
/* the rules you wrote are kept as you wrote them ("Weekdays" stays "Weekdays"); the week is built from them */
const sameWhen = (x, y) => x.kind === y.kind && (x.kind === "all" || (x.kind === "t" ? x.types.join() === y.types.join() : x.a === y.a && x.b === y.b));
const proj = (w) => w.map((d) => (d.all ? "all" : S.mode === "types" ? d.t.join() : JSON.stringify(d.r))).join("|");
const base = (w) => w.map((d) => (d.all ? blank() : norm(S.mode === "types" ? { r: d.r, t: [] } : { r: [], t: d.t })));
const build = (rs, from = S.week) => rs.reduce((w, r) => addTo(w, r), base(from));
function list() {
  const v = V();
  if (!v.rules || v.rulesMode !== S.mode || proj(build(v.rules)) !== proj(S.week)) { v.rules = rules(S.week); v.rulesMode = S.mode; }
  return v.rules;
}
const sorted = (rs) => rs.slice().sort((x, y) => x.days[0] - y.days[0] || (x.a || 0) - (y.a || 0));
function rulesFor(p) {
  const w = weekOf(p); if (!w) return [];
  const rs = V().rules;
  return p.me && rs && V().rulesMode === S.mode && proj(build(rs, S.saved)) === proj(S.saved) ? sorted(rs) : rules(w);
}

/* ---------- understanding a typed rule ---------- */
const DN = [["mon", "monday"], ["tue", "tues", "tuesday"], ["wed", "weds", "wednesday"], ["thu", "thur", "thurs", "thursday"], ["fri", "friday"], ["sat", "saturday"], ["sun", "sunday"]];
const dayIdx = (w) => { const x = w.replace(/s$/, ""); for (let i = 0; i < 7; i++) if (DN[i].includes(x) || DN[i].includes(w)) return i; return -1; };
const DW = "(mon|tue|wed|thu|fri|sat|sun)[a-z]*";
const TM = "(noon|midnight|closing|close|opening|open|\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.|a|p)?)";
function tm(str, hint) {
  str = str.trim().replace(/\./g, "");
  if (str === "noon") return 720;
  if (str === "midnight") return 1440;
  if (/^clos/.test(str)) return CLOSE;
  if (/^open/.test(str)) return OPEN;
  const m = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = +m[1]; const mm = +(m[2] || 0); const ap = m[3] ? m[3][0] : null;
  if (h > 24 || mm > 59) return null;
  if (ap) { if (h === 12) h = 0; if (ap === "p") h += 12; }
  else if (h >= 1 && h <= 5) h += 12;
  else if (h >= 6 && h <= 11 && hint === "after") h += 12;
  let v = h * 60 + mm;
  if (v < OPEN) v += 1440;
  return clamp(v, OPEN, CLOSE);
}
const typesIn = (a, b) => TYPES.filter((t) => Math.min(b, t.b) - Math.max(a, t.a) >= (t.b - t.a) / 2).map((t) => t.id);
function parse(text) {
  let s = " " + text.toLowerCase().replace(/[!?;]/g, " ").replace(/[–—]/g, "-").replace(/\s+/g, " ") + " ";
  if (!s.trim()) return null;
  const days = new Set();
  const addRange = (x, y) => { let i = x; for (let n = 0; n < 7; n++) { days.add(i); if (i === y) break; i = (i + 1) % 7; } };
  s = s.replace(/\b(every ?day|daily|all week|each day|any day|7 days)\b/g, () => { ALL7.forEach((i) => days.add(i)); return " "; });
  s = s.replace(/\bweek ?days?\b/g, () => { [0, 1, 2, 3, 4].forEach((i) => days.add(i)); return " "; });
  s = s.replace(/\bweek ?ends?\b/g, () => { days.add(5); days.add(6); return " "; });
  s = s.replace(new RegExp(`\\b((?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)\\s*(?:-|to|through|thru|until|till)\\s*((?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)\\b`, "g"), (m0, x, y) => {
    const a = dayIdx(x), b = dayIdx(y); if (a < 0 || b < 0) return m0; addRange(a, b); return " ";
  });
  s = s.replace(new RegExp(`\\b${DW}\\b`, "g"), (m0) => { const i = dayIdx(m0.trim()); if (i < 0) return m0; days.add(i); return " "; });
  let range = null, types = [], said = false;
  const between = s.match(new RegExp(`\\b(?:between|from)\\s+${TM}\\s*(?:and|to|-|until|till)\\s*${TM}`)) || s.match(new RegExp(`\\b${TM}\\s*(?:-|to|until|till)\\s*${TM}`));
  if (between) {
    let a = tm(between[1]), b = tm(between[2]);
    if (a != null && b != null) { if (b <= a && b + 720 <= CLOSE) b += 720; if (b > a) { range = [a, b]; s = s.replace(between[0], " "); } }
  }
  if (!range) {
    const bf = s.match(new RegExp(`\\b(?:before|until|till|til|up to)\\s+${TM}`));
    const af = s.match(new RegExp(`\\b(?:after|from|past|starting)\\s+${TM}`));
    if (bf) { let b = tm(bf[1], "before"); if (b != null && b - OPEN < 30) b = tm(bf[1], "after"); if (b != null && b - OPEN >= 30) { range = [OPEN, b]; s = s.replace(bf[0], " "); } }
    else if (af) { const a = tm(af[1], "after"); if (a != null && CLOSE - a >= 30) { range = [a, CLOSE]; s = s.replace(af[0], " "); } }
  }
  const kw = [
    [/\bbreakfasts?\b|\bbrunch(es)?\b/, ["breakfast"], [420, 660]],
    [/\bmornings?\b/, ["breakfast"], [OPEN, 660]],
    [/\blunch(es)?\b|\bmidday\b/, ["lunch"], [660, 960]],
    [/\bafternoons?\b/, ["lunch"], [720, 1020]],
    [/\bdinners?\b|\bsuppers?\b/, ["dinner"], [960, 1320]],
    [/\bevenings?\b/, ["dinner"], [1020, CLOSE]],
    [/\bclos(e|es|ing|er|ers)\b|\blate( nights?)?\b|\bnights?\b/, ["close"], [1320, CLOSE]],
  ];
  const hits = kw.filter(([re]) => re.test(s));
  if (S.mode === "types") {
    hits.forEach(([, t]) => { types = types.concat(t); });
    if (!types.length && range) types = typesIn(range[0], range[1]);
    if (!types.length && range) types = TYPES.filter((t) => t.a < range[1] && t.b > range[0]).map((t) => t.id);
    if (!types.length && range) return null;
    types = TYPES.map((t) => t.id).filter((id) => types.includes(id));
    said = !!types.length;
  } else if (!range && hits.length) {
    const rs = mergeR(hits.map(([, , r]) => r.slice())); range = [rs[0][0], rs[rs.length - 1][1]];
  }
  const allDay = /\b(all day|whole day|entire day|at all|full day|day off|off)\b/.test(s);
  const dl = [...days].sort((a, b) => a - b);
  if (!dl.length && !range && !said) return null;
  const outDays = dl.length ? dl : ALL7;
  if (allDay || (!range && !said)) return { kind: "all", days: outDays };
  if (S.mode === "types") return types.length === TYPES.length ? { kind: "all", days: outDays } : { kind: "t", types, days: outDays };
  return range[0] <= OPEN && range[1] >= CLOSE ? { kind: "all", days: outDays } : { kind: "r", a: range[0], b: range[1], days: outDays };
}
const SUG = { hours: ["No weekends", "Weekdays before 11am", "Not after 10pm", "Mon-Wed 2pm to 5pm"], types: ["No weekends", "No closing shifts", "Weekday breakfasts", "Fri dinner"] };

/* ---------- pieces ---------- */
function wd(on, cls = "") {
  return `<span class="v5-wd ${cls}" aria-hidden="true">${LET.map((l, i) => `<i class="${typeof on === "function" ? on(i) : on.includes(i) ? "on" : ""}">${l}</i>`).join("")}</span>`;
}
const weekDots = (w) => wd((i) => dayState(w[i]));
function ruleCard(r, opts = {}) {
  const fresh = V().flash === r.k ? "fresh" : "";
  return `<div class="v5-rule ${opts.mob ? "mob" : ""} ${opts.ro ? "ro" : ""} ${fresh}" data-rdays="${r.days.join(",")}" data-rk="${r.k}">
    <span class="v5-ri">${icon(ruleIcon(r), opts.mob ? 16 : 17)}</span>
    <span class="v5-rt"><b>${esc(daysLong(r.days))}</b><span>${esc(when(r))}</span></span>
    ${opts.mob ? "" : wd(r.days)}
    ${opts.ro ? "" : `<span class="v5-ra"><button type="button" class="btn ghost icon sm" data-act="v5-edit" data-k="${r.k}" aria-label="Edit rule">${icon("pencil", 14)}</button><button type="button" class="btn ghost icon sm" data-act="v5-del" data-k="${r.k}" aria-label="Remove rule">${icon("trash", 14)}</button></span>`}
  </div>`;
}
function weekRows(w, mob) {
  return `<div class="v5-week ${mob ? "mob" : ""}">${w.map((d, i) => `<div class="v5-wr st-${dayState(d)}" data-wd="${i}"><b>${DAYS[i]}</b>${railHTML(d, { labels: false, cls: "v5-rail" })}<small>${esc(isFree(d) ? "Open" : dayText(d))}</small></div>`).join("")}</div>`;
}
function preview(q) {
  if (!q.trim()) return `<span class="v5-hint">${icon("sparkle", 14)}Type it the way you'd say it. We turn it into a rule.</span>`;
  const r = parse(q);
  if (!r) return `<span class="v5-hint bad">${icon("info", 14)}Not sure what you mean. Try a day and a time, like "Sat after 9pm".</span>`;
  return `<span class="v5-got">${icon("check", 14)}<b>${esc(daysLong(r.days))}</b><span>${esc(when(r))}</span><kbd>Enter</kbd></span>`;
}
function ask(mob) {
  const q = V().q || "";
  const id = mob ? "v5-pq" : "v5-q";
  return `<div class="v5-ask ${mob ? "mob" : ""}">
    <label class="v5-in">${icon("wand", 17)}<input id="${id}" type="text" autocomplete="off" spellcheck="false" placeholder="${S.mode === "types" ? "e.g. No closing shifts on weekdays" : "e.g. No Fridays after 6pm"}" value="${esc(q)}" aria-label="Add a rule"><button type="button" class="btn go sm" data-act="v5-addq" ${parse(q) ? "" : "disabled"}>${icon("plus", 14)} Add</button></label>
    <div class="v5-pv" data-pv="${id}">${preview(q)}</div>
    <div class="v5-sugs ${mob ? "mob" : ""}"><span class="lbl">Try</span>${SUG[S.mode].map((t) => `<button type="button" class="chip sm" data-act="v5-sug" data-q="${esc(t)}">${esc(t)}</button>`).join("")}</div>
  </div>`;
}
function builder(mob) {
  const b = V().b;
  const types = S.mode === "types";
  const day = (i) => `<button type="button" class="dchip" data-act="v5-bday" data-day="${i}" aria-pressed="${b.days.includes(i)}">${DAYS[i]}</button>`;
  const q = (id, label, ds) => `<button type="button" class="v5-qk" data-act="v5-bq" data-v="${id}" aria-pressed="${ds.join() === b.days.join()}">${label}</button>`;
  const seg = (v, l) => `<button type="button" data-act="v5-bwhen" data-v="${v}" aria-pressed="${b.when === v}">${l}</button>`;
  const r = fromB(b);
  const timeRow = types ? (b.when === "all" ? "" : `<div class="v5-btypes">${TYPES.map((t) => `<button type="button" class="tpill" data-act="v5-bt" data-type="${t.id}" aria-pressed="${b.types.includes(t.id)}">${icon(t.ic, 14)}<span>${t.name}</span></button>`).join("")}</div>`)
    : b.when === "all" ? ""
    : `<div class="v5-btime">${b.when === "between" ? `${timeSelect('data-v5b="a" aria-label="From"', b.a, { to: CLOSE - 60 })}<span>and</span>${timeSelect('data-v5b="b" aria-label="To"', b.b, { from: b.a + 30, to: CLOSE - 30 })}`
      : b.when === "before" ? timeSelect('data-v5b="b" aria-label="Before"', b.b, { from: OPEN + 30, to: CLOSE - 30 })
      : timeSelect('data-v5b="a" aria-label="After"', b.a, { from: OPEN + 30, to: CLOSE - 30 })}</div>`;
  return `<div class="v5-b ${mob ? "mob" : ""}">
    ${mob ? `<h3>${b.edit ? "Edit rule" : "New rule"}</h3>` : `<div class="v5-bh"><b>${b.edit ? "Edit rule" : "New rule"}</b><button type="button" class="btn ghost icon sm" data-act="v5-bcancel" aria-label="Close">${icon("x", 15)}</button></div>`}
    <div class="v5-bf"><span class="lbl">Days</span><div class="v5-bdays">${ALL7.map(day).join("")}</div><div class="v5-qks">${q("wk", "Weekdays", [0, 1, 2, 3, 4])}${q("we", "Weekends", [5, 6])}${q("all", "Every day", ALL7)}</div></div>
    <div class="v5-bf"><span class="lbl">${types ? "Shifts" : "Time"}</span><div class="seg v5-bseg">${types ? seg("all", "All day") + seg("some", "Some shifts") : seg("all", "All day") + seg("before", "Before") + seg("after", "After") + seg("between", "Between")}</div>${timeRow}</div>
    <p class="v5-bsay">${icon("sparkle", 14)}<span>${r ? esc(say(r)) : "Pick at least one day."}</span></p>
    <div class="v5-bft">${mob ? "" : '<span class="grow"></span>'}<button type="button" class="btn ${mob ? "ghost" : ""}" data-act="v5-bcancel">Cancel</button><button type="button" class="btn ${mob ? "dark" : "go"}" data-act="v5-bsave" ${r ? "" : "disabled"}>${b.edit ? "Save rule" : "Add rule"}</button></div>
  </div>`;
}
function fromB(b) {
  if (!b.days.length) return null;
  const days = b.days.slice().sort((x, y) => x - y);
  if (b.when === "all") return { kind: "all", days };
  if (S.mode === "types") return !b.types.length ? null : b.types.length === TYPES.length ? { kind: "all", days } : { kind: "t", types: TYPES.map((t) => t.id).filter((id) => b.types.includes(id)), days };
  if (b.when === "before") return { kind: "r", a: OPEN, b: b.b, days };
  if (b.when === "after") return { kind: "r", a: b.a, b: CLOSE, days };
  return { kind: "r", a: b.a, b: b.b, days };
}
function toB(r, where) {
  const b = { edit: r ? r.k : null, where, days: r ? r.days.slice() : [], when: S.mode === "types" ? "some" : "after", a: 1080, b: 660, types: ["close"] };
  if (!r) return b;
  if (r.kind === "all") b.when = "all";
  else if (r.kind === "t") { b.when = "some"; b.types = r.types.slice(); }
  else if (r.a <= OPEN) { b.when = "before"; b.b = r.b; }
  else if (r.b >= CLOSE) { b.when = "after"; b.a = r.a; }
  else { b.when = "between"; b.a = r.a; b.b = r.b; }
  return b;
}

/* ---------- highlight the days a rule touches ---------- */
function ghostFor(r) {
  if (!r) return [];
  if (r.kind === "all") return [[OPEN, CLOSE]];
  if (r.kind === "t") return mergeR(r.types.map((t) => [TYPE[t].a, TYPE[t].b]));
  return [[r.a, r.b]];
}
function hl(days, ghost) {
  document.querySelectorAll(".v5-week").forEach((w) => {
    w.classList.toggle("dim", !!days);
    w.querySelectorAll("[data-wd]").forEach((x) => {
      const on = !!days && days.includes(+x.dataset.wd);
      x.classList.toggle("hl", on);
      x.querySelectorAll(".blk.ghost").forEach((g) => g.remove());
      if (on && ghost) { const rail = x.querySelector(".rail"); ghost.forEach(([a, b]) => rail.insertAdjacentHTML("beforeend", `<span class="blk ghost" style="left:${pct(a)}%;width:${pct(b) - pct(a)}%"></span>`)); }
    });
  });
}
function hlFromQ() { const r = parse(V().q || ""); hl(r ? r.days : null, r ? ghostFor(r) : null); }

/* ---------- actions ---------- */
const where = (el) => (el && el.closest(".phone") ? "phone" : "desk");
function commit(rs, flashK) { V().rules = rs; V().rulesMode = S.mode; S.week = build(rs); V().flash = flashK || null; render(); clearTimeout(V().ft); V().ft = setTimeout(() => { V().flash = null; document.querySelectorAll(".v5-rule.fresh").forEach((x) => x.classList.remove("fresh")); }, 1600); }
function addRule(r) {
  const rs = clone(list());
  const same = rs.find((x) => sameWhen(x, r));
  if (same) { same.days = [...new Set(same.days.concat(r.days))].sort((a, b) => a - b); commit(rs, same.k); return; }
  V().seq = (V().seq || 0) + 1;
  r.k = "u" + V().seq; rs.push(r); commit(rs, r.k);
}
function addQ(el) {
  const r = parse(V().q || "");
  if (!r) return;
  V().q = "";
  addRule(r);
  const f = document.getElementById(where(el) === "phone" ? "v5-pq" : "v5-q"); f && f.focus({ preventScroll: true });
}

N.variants["5"] = {
  name: "5 · Rules",
  tr: {
    ad: "Cümleyle kural",
    fikir: "Haftayı gün gün değil, birkaç kısa kuralla anlatırsın: \"No weekends\", \"Fridays after 6 PM\". Kutuya konuşur gibi yazarsın; sistem yazarken ne anladığını altında gösterir, Enter ile kural olur. Yazmak istemeyen \"+ Add a rule\" ile gün ve saat seçerek kurar. Sağda haftanın özeti durur; bir kuralın üstüne gelince etkilediği günler yanar.",
    arti: "En hızlı ve en modern giriş: çoğu çalışanın tercihi 1–3 kuraldır. Okuması da en kolay olan: müdür herkesin tercihini tek satırda kural olarak görür (\"Mon–Fri before 11 AM\"). Değiştirmek = kuralı düzenlemek ya da silmek (Undo var).",
    eksi: "Yazarak giriş İngilizce cümle bekler (ekran dili İngilizce); anlamadığı cümlede örnek verir, seçerek kurmaya yönlendirir. Günü gününe çok farklı saatleri olan biri için kural sayısı artar.",
    dene: "Kutuya \"weekdays before 10am\" yaz ve Enter'a bas. Sonra bir kuralın üstüne gel, sağda hangi günlerin yandığına bak. Bir kuralı çöp kutusuyla sil, alttaki Undo ile geri al.",
  },
  tools() {
    return list().length ? `<button type="button" class="btn sm quiet" data-act="v5-clear">${icon("rotate", 13)} Clear all</button>` : "";
  },
  editor() {
    const rs = sorted(list());
    const b = V().b && V().b.where === "desk" ? V().b : null;
    const items = rs.map((r) => (b && b.edit === r.k ? builder() : ruleCard(r))).join("");
    return `<div class="v5"><div class="v5-main">${ask()}
      <div class="v5-sec"><div class="v5-sh"><span class="lbl">Your rules${rs.length ? ` · ${rs.length}` : ""}</span></div>
      ${rs.length ? `<div class="v5-rules">${items}</div>` : `<div class="v5-empty">${icon("circleCheck", 20)}<b>No rules. You're open to work any time.</b><span>Add a rule only for times you'd rather not work.</span></div>`}
      ${b && !b.edit ? builder() : `<button type="button" class="btn quiet v5-addb" data-act="v5-new">${icon("plus", 15)} Add a rule</button>`}</div></div>
      <aside class="v5-side"><div class="v5-sh"><span class="lbl">Your week</span><small>Hover a rule to see its days</small></div>${weekRows(S.week)}</aside></div>`;
  },
  phoneEditor() {
    const rs = sorted(list());
    return `<div class="v5 mob">${ask(true)}
      <div class="v5-sh"><span class="lbl">Your rules${rs.length ? ` · ${rs.length}` : ""}</span></div>
      ${rs.length ? `<div class="v5-rules">${rs.map((r) => ruleCard(r, { mob: true })).join("")}</div>` : `<div class="v5-empty">${icon("circleCheck", 20)}<b>No rules. You're open any time.</b></div>`}
      <button type="button" class="btn quiet v5-addb" data-act="v5-new">${icon("plus", 15)} Add a rule</button>
      <div class="v5-sh"><span class="lbl">Your week</span></div>${weekRows(S.week, true)}</div>`;
  },
  phoneSheet() { return V().b ? builder(true) : ""; },
  readOnly(p) {
    const w = weekOf(p); const rs = rulesFor(p);
    return `<div class="v5-ro">${rs.length ? `<div class="v5-rules">${rs.map((r) => ruleCard(r, { ro: true })).join("")}</div>` : ""}${weekRows(w)}</div>`;
  },
  phoneReadOnly(p) {
    const w = weekOf(p); const rs = rulesFor(p);
    return `<div class="v5-ro mob">${rs.length ? `<div class="v5-rules">${rs.map((r) => ruleCard(r, { ro: true, mob: true })).join("")}</div>` : ""}${weekRows(w, true)}</div>`;
  },
  team(list) {
    const rows = list.map((p) => {
      const w = weekOf(p); const rs = rulesFor(p);
      const tags = !w ? `<span class="tag mute">Not submitted yet</span>` : rs.length ? rs.map((r) => `<span class="tag">${icon(ruleIcon(r), 12)}${esc(tagText(r))}</span>`).join("") : `<span class="v5-open">Open any time</span>`;
      return `<div class="tt-row v5-tr" data-act="person" data-id="${p.id}" role="button" tabindex="0"><div class="who"><span class="avatar">${initials(p.name)}</span><span><b>${esc(p.name)}</b><small>${esc(p.job)}</small></span></div><div class="v5-tags">${tags}</div><div class="c">${w ? weekDots(w) : ""}</div><div class="c v5-upd">${w ? (p.me ? S.savedAt : p.upd) : "—"}</div></div>`;
    }).join("");
    return `<div class="tt v5-tt"><div class="tt-row hd v5-tr"><div class="who-h">Employee</div><div>Prefers not to work</div><div class="c">Week</div><div class="c">Updated</div></div>${rows || `<div class="v5-none">No one matches.</div>`}</div>`;
  },
  phoneTeam(list) {
    return `<div class="v5-ptl">${list.map((p) => {
      const w = weekOf(p); const rs = rulesFor(p);
      return `<button type="button" class="v5-ptp" data-act="person" data-id="${p.id}"><span class="avatar">${initials(p.name)}</span><span class="v5-ptn"><b>${esc(p.name)}</b><span class="v5-ptags">${!w ? `<span class="tag mute">Not submitted yet</span>` : rs.length ? rs.map((r) => `<span class="tag">${esc(tagText(r))}</span>`).join("") : `<span class="v5-open">Open any time</span>`}</span></span>${icon("chevR", 15)}</button>`;
    }).join("")}</div>`;
  },
  act(act, el) {
    const v = V();
    const find = () => list().find((r) => r.k === el.dataset.k);
    switch (act) {
      case "v5-addq": addQ(el); return true;
      case "v5-sug": {
        v.q = el.dataset.q; render();
        const f = document.getElementById(where(el) === "phone" ? "v5-pq" : "v5-q"); if (f) { f.focus({ preventScroll: true }); f.setSelectionRange(f.value.length, f.value.length); }
        hlFromQ(); return true;
      }
      case "v5-new": v.b = toB(null, where(el)); if (where(el) === "phone") S.ph.sheet = { v5: true }; render(); return true;
      case "v5-edit": { const r = find(); if (!r) return true; v.b = toB(r, where(el)); if (where(el) === "phone") S.ph.sheet = { v5: true }; render(); return true; }
      case "v5-del": {
        const r = find(); if (!r) return true;
        const prevW = clone(S.week), prevR = clone(list());
        if (v.b && v.b.edit === r.k) v.b = null;
        commit(list().filter((x) => x.k !== r.k));
        toast(`<b>Rule removed.</b><small>${esc(daysLong(r.days))} · ${esc(when(r))}</small>`, { undo: () => { S.week = prevW; v.rules = prevR; v.rulesMode = S.mode; }, where: where(el) });
        return true;
      }
      case "v5-clear": {
        const prevW = clone(S.week), prevR = clone(list());
        v.b = null; commit([]);
        toast(`<b>All rules cleared.</b><small>You're open to work any time.</small>`, { undo: () => { S.week = prevW; v.rules = prevR; v.rulesMode = S.mode; }, where: "desk" });
        return true;
      }
      case "v5-bday": { const i = +el.dataset.day; v.b.days = v.b.days.includes(i) ? v.b.days.filter((x) => x !== i) : v.b.days.concat(i).sort((a, b) => a - b); render(); return true; }
      case "v5-bq": { const m = { wk: [0, 1, 2, 3, 4], we: [5, 6], all: ALL7 }[el.dataset.v]; v.b.days = v.b.days.join() === m.join() ? [] : m.slice(); render(); return true; }
      case "v5-bwhen": {
        const w = el.dataset.v; v.b.when = w;
        if (w === "between" && v.b.b <= v.b.a) { v.b.a = 840; v.b.b = 1020; }
        render(); return true;
      }
      case "v5-bt": { const id = el.dataset.type; v.b.types = v.b.types.includes(id) ? v.b.types.filter((x) => x !== id) : v.b.types.concat(id); render(); return true; }
      case "v5-bcancel": v.b = null; S.ph.sheet = null; render(); return true;
      case "v5-bsave": {
        const r = fromB(v.b); if (!r) return true;
        const edit = v.b.edit; v.b = null; S.ph.sheet = null;
        if (edit) commit(list().map((x) => (x.k === edit ? Object.assign(r, { k: edit }) : x)), edit);
        else addRule(r);
        return true;
      }
    }
    return false;
  },
  input(ev) {
    const t = ev.target; if (t.id !== "v5-q" && t.id !== "v5-pq") return;
    V().q = t.value;
    const pv = document.querySelector(`[data-pv="${t.id}"]`); if (pv) pv.innerHTML = preview(t.value);
    const add = t.parentElement.querySelector("[data-act='v5-addq']"); if (add) add.disabled = !parse(t.value);
    hlFromQ();
  },
  change(ev) {
    const t = ev.target; if (!t.dataset.v5b || !V().b) return;
    const b = V().b; b[t.dataset.v5b] = +t.value;
    if (b.when === "between" && b.b <= b.a) b.b = Math.min(CLOSE - 30, b.a + 120);
    render();
  },
  key(ev) {
    const t = ev.target;
    if ((t.id === "v5-q" || t.id === "v5-pq") && ev.key === "Enter") { ev.preventDefault(); addQ(t); return true; }
    if ((t.id === "v5-q" || t.id === "v5-pq") && ev.key === "Escape" && V().q) { V().q = ""; t.value = ""; N.cur().input({ target: t }); return true; }
    return false;
  },
  over(ev) {
    const r = ev.type === "mouseleave" ? null : ev.target.closest && ev.target.closest(".v5-rule[data-rdays]");
    if (r) { const ds = r.dataset.rdays.split(",").map(Number); const ro = !!r.closest(".v5-ro"); hl(ds, ro ? null : ghostFor(list().find((x) => x.k === r.dataset.rk))); }
    else hlFromQ();
  },
  after() { if ((V().q || "").trim()) hlFromQ(); },
};
})();
