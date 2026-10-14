/* 1 · Rows: one row per day with a 6 AM–2 AM track. Pick Available / Some hours / Unavailable, drag on the track or use quick picks. */
(function () {
"use strict";
const N = window.NF;
const { icon, esc, DAYS, DAYL, OPEN, CLOSE, SPAN, S, fmtS, snap, clamp, pct, mergeR, subR, asRanges, isFree, dayState, dayText, rangeText, weekOf, first, initials, timeSelect, openPop, closePop, setDay, render, railHTML, typePills, scaleHTML, summaryLine, toast, clone, drag, blank, statusDot } = N;
const V = () => N.vs("1");
const PRESETS = [
  { label: "Before 11 AM", r: [OPEN, 660] }, { label: "11 AM – 4 PM", r: [660, 960] },
  { label: "After 4 PM", r: [960, CLOSE] }, { label: "After 6 PM", r: [1080, CLOSE] }, { label: "After 10 PM", r: [1320, CLOSE] },
];
const has = (d, r) => d.r.some(([a, b]) => a === r[0] && b === r[1]);
const stateText = (d) => (d.all ? "Unavailable all day" : isFree(d) ? "Available" : dayText(d));
const short = (d) => (d.all ? "all day" : isFree(d) ? "" : S.mode === "types" ? d.t.map((t) => N.TYPE[t].name).join(", ") : d.r.map(([a, b]) => (a <= OPEN ? `before ${fmtS(b)}` : b >= CLOSE ? `after ${fmtS(a)}` : `${fmtS(a)}–${fmtS(b)}`)).join(", "));

function seg(i, d, big) {
  const st = dayState(d);
  const b = (v, l) => `<button type="button" data-act="v1-state" data-day="${i}" data-v="${v}" aria-pressed="${st === v}">${l}</button>`;
  return `<div class="seg v1-seg ${big ? "big" : ""}" role="group" aria-label="${DAYL[i]}">${b("free", "Available")}${b("some", S.mode === "types" ? "Some shifts" : "Some hours")}${b("off", "Unavailable")}</div>`;
}
function rangesHTML(i, d, phone) {
  return `${d.r.map(([a, b], k) => `<div class="v1-rg">${timeSelect(`data-v1r="${i}:${k}:0" aria-label="From"`, a, { to: CLOSE - 30 })}<span>to</span>${timeSelect(`data-v1r="${i}:${k}:1" aria-label="To"`, b, { from: OPEN + 30 })}<button type="button" class="btn ghost icon sm" data-act="v1-delr" data-day="${i}" data-k="${k}" aria-label="Remove these hours">${icon("trash", 14)}</button></div>`).join("")}
    <button type="button" class="btn sm quiet v1-addr" data-act="v1-addr" data-day="${i}">${icon("plus", 14)} ${d.r.length ? "Add more hours" : "Add hours"}</button>`;
}
function chips(i, d) {
  return `<div class="v1-chips">${PRESETS.map((p, k) => `<button type="button" class="chip" data-act="v1-preset" data-day="${i}" data-k="${k}" aria-pressed="${has(d, p.r)}">${has(d, p.r) ? icon("check", 13) : ""}${p.label}</button>`).join("")}</div>`;
}
function panel(i, d) {
  return `<div class="v1-panel"><div class="v1-pin">
    <div class="v1-pc"><span class="lbl">Quick picks</span>${chips(i, d)}</div>
    <div class="v1-pc"><span class="lbl">Exact hours</span>${rangesHTML(i, d)}</div></div>
    <div class="v1-pf"><button type="button" class="btn sm quiet" data-act="v1-copy" data-day="${i}">${icon("copy", 14)} Copy ${DAYL[i]} to other days</button><span class="grow"></span><button type="button" class="btn sm dark" data-act="v1-done">Done</button></div></div>`;
}
function row(i) {
  const d = S.week[i], open = V().open === i && S.mode === "hours" && !d.all && !isFree(d);
  const st = dayState(d);
  const track = S.mode === "types"
    ? typePills(d, { edit: true, act: "v1-type", day: i })
    : railHTML(d, { cls: "v1-rail", attrs: `data-rail="${i}" title="Drag to mark hours you prefer not to work"` });
  return `<div class="v1-row ${open ? "open" : ""} st-${st}"><div class="v1-day"><b>${DAYL[i]}</b><small>${esc(stateText(d))}</small></div><div class="v1-track">${track}</div>${seg(i, d)}</div>${open ? panel(i, d) : ""}`;
}
function roRow(i, d, phone) {
  const st = dayState(d);
  const track = S.mode === "types" ? typePills(d) : railHTML(d, { cls: "v1-rail ro", labels: !phone });
  return `<div class="v1-row ro st-${st}"><div class="v1-day"><b>${phone ? DAYS[i] : DAYL[i]}</b>${phone ? "" : `<small>${esc(stateText(d))}</small>`}</div><div class="v1-track">${track}${phone ? `<small class="v1-ptxt">${esc(stateText(d))}</small>` : ""}</div></div>`;
}
function head() {
  return `<div class="v1-row v1-hd"><span></span><div class="v1-track">${S.mode === "types" ? `<span class="lbl">Shifts you'd rather not work</span>` : scaleHTML()}</div><span class="lbl v1-hd-r">This day</span></div>`;
}
function snapshotUndo(label) {
  const before = clone(S.week);
  return () => { S.week = before; render(); };
}
function openCopy(el, i) {
  const pick = new Set();
  const html = () => `<div class="pop-hd"><strong>Copy ${DAYL[i]}</strong><small>${esc(stateText(S.week[i]))}</small></div><div class="pop-bd">
    <div class="v1-quick"><button type="button" class="btn sm quiet" data-q="wd">Weekdays</button><button type="button" class="btn sm quiet" data-q="we">Weekend</button><button type="button" class="btn sm quiet" data-q="all">All days</button></div>
    <div class="v1-days">${DAYS.map((dn, k) => k === i ? "" : `<label class="v1-cb"><input type="checkbox" data-k="${k}" ${pick.has(k) ? "checked" : ""}><span>${DAYL[k]}</span><small>${esc(stateText(S.week[k]))}</small></label>`).join("")}</div></div>
    <div class="pop-ft"><span class="grow"></span><button type="button" class="btn sm" data-x="cancel">Cancel</button><button type="button" class="btn go sm" data-x="ok" ${pick.size ? "" : "disabled"}>${pick.size ? `Copy to ${pick.size} ${pick.size === 1 ? "day" : "days"}` : "Copy"}</button></div>`;
  openPop(el, html(), (pop) => {
    pop.addEventListener("change", (e) => { const k = +e.target.dataset.k; e.target.checked ? pick.add(k) : pick.delete(k); pop.innerHTML = html(); });
    pop.addEventListener("click", (e) => {
      const q = e.target.closest("[data-q]");
      if (q) { pick.clear(); (q.dataset.q === "wd" ? [0, 1, 2, 3, 4] : q.dataset.q === "we" ? [5, 6] : [0, 1, 2, 3, 4, 5, 6]).forEach((k) => k !== i && pick.add(k)); pop.innerHTML = html(); return; }
      const x = e.target.closest("[data-x]"); if (!x) return;
      if (x.dataset.x === "ok" && pick.size) {
        const undo = snapshotUndo(); const src = clone(S.week[i]); const list = [...pick].sort();
        list.forEach((k) => { S.week[k] = clone(src); });
        closePop(); render();
        toast(`<b>Copied ${DAYL[i]} to ${N.daysLabel(list)}.</b>`, { undo });
        return;
      }
      closePop();
    });
  }, { cls: "v1-copypop" });
}
function setState(i, v) {
  const d = S.week[i];
  if (v === "free") { setDay(i, blank()); V().open = null; return; }
  if (v === "off") { setDay(i, { all: true }); V().open = null; return; }
  if (S.mode === "types") { if (isFree(d) || d.all) setDay(i, { t: ["dinner"] }); return; }
  V().open = i;
  if (isFree(d) || d.all) setDay(i, { r: [[1080, CLOSE]] }); else render();
}

N.variants["1"] = {
  name: "1 · Rows",
  tr: {
    ad: "Gün satırları",
    fikir: "Bugünkü tabloya en yakın olan. Her gün bir satır: üstte 6 AM–2 AM saat şeridi, sağda üç seçenek (Available / Some hours / Unavailable). Saat şeridinde fareyle sürükleyerek saat işaretlenir ya da hazır seçenekler (After 6 PM gibi) tıklanır.",
    arti: "Öğrenmesi en kolay olan; bugünkü düzeni bilen hemen anlar. Haftanın tamamı tek bakışta görünür. Telefonda her gün bir kart, dokununca alttan pencere açılır.",
    eksi: "Kopyalama ayrı bir adım (Copy to other days). Haftayı bir kalıpla doldurmak (ör. \"hafta içi sabahları\") yok.",
    dene: "Cuma satırında şeride sürükle; \"Copy Friday to other days\" ile başka günlere kopyala. Sonra Team ve Drawer ekranlarına bak.",
  },
  editor() {
    return `<div class="v1">${summaryLine(S.week)}<div class="v1-list">${head()}${DAYS.map((_, i) => row(i)).join("")}</div>
      <div class="v1-foot"><span class="muted">${icon("pointer", 13)} ${S.mode === "types" ? "Tap a shift to mark it." : "Drag on a day's track to mark hours."}</span><span class="grow"></span><button type="button" class="btn sm ghost" data-act="v1-clear">${icon("rotate", 14)} Clear week</button></div></div>`;
  },
  phoneEditor() {
    return `${summaryLine(S.week)}<div class="v1-pl">${DAYS.map((_, i) => {
      const d = S.week[i];
      return `<button type="button" class="v1-pcard st-${dayState(d)}" data-act="v1-sheet" data-day="${i}"><span class="v1-pt"><b>${DAYL[i]}</b><span class="v1-st">${esc(stateText(d))}</span>${icon("chevR", 16)}</span>${S.mode === "types" ? typePills(d) : railHTML(d, { labels: false, cls: "mini" })}</button>`;
    }).join("")}</div>${S.mode === "hours" ? `<div class="v1-pscale">${scaleHTML()}</div>` : ""}`;
  },
  phoneSheet() {
    const i = S.ph.sheet.day, d = S.week[i];
    const some = !d.all && !isFree(d);
    return `<h3>${DAYL[i]}</h3><div class="sub">${esc(stateText(d))}</div>${seg(i, d, true)}
      ${S.mode === "types" ? `<span class="lbl sh-l">Shifts you'd rather not work</span>${typePills(d, { edit: true, act: "v1-type", day: i })}`
        : some ? `<div class="sh-rail">${railHTML(d, { labels: false })}${scaleHTML()}</div><span class="lbl sh-l">Quick picks</span>${chips(i, d)}<span class="lbl sh-l">Exact hours</span>${rangesHTML(i, d, true)}` : ""}
      <span class="lbl sh-l">Same for</span><div class="v1-dchips">${DAYS.map((dn, k) => k === i ? "" : `<button type="button" class="dchip" data-act="v1-same" data-day="${i}" data-k="${k}" aria-pressed="${JSON.stringify(S.week[k]) === JSON.stringify(d)}">${dn}</button>`).join("")}</div>
      <div class="acts"><button type="button" class="btn dark" data-act="ph-sheet-close">Done</button></div>`;
  },
  readOnly(p) { const w = weekOf(p); return `<div class="v1 v1-ro"><div class="v1-list">${head().replace('<span class="lbl v1-hd-r">This day</span>', "")}${DAYS.map((_, i) => roRow(i, w[i])).join("")}</div></div>`; },
  phoneReadOnly(p) { const w = weekOf(p); return `<div class="v1-list ph-ro">${DAYS.map((_, i) => roRow(i, w[i], true)).join("")}</div>${S.mode === "hours" ? `<div class="v1-pscale ro">${scaleHTML()}</div>` : ""}`; },
  team(list) {
    const rows = list.map((p) => {
      const w = weekOf(p);
      const cells = w ? DAYS.map((_, i) => { const d = w[i]; return `<div class="c v1-tc">${S.mode === "types" ? (isFree(d) ? "" : `<span class="tag">${esc(short(d))}</span>`) : `${railHTML(d, { labels: false, cls: "mini" })}<small>${esc(short(d))}</small>`}</div>`; }).join("")
        : `<div class="c v1-ns"><span class="tag mute">Not submitted yet</span></div>`;
      return `<div class="tt-row v1-tr" data-act="person" data-id="${p.id}" role="button" tabindex="0"><div class="who"><span class="avatar">${initials(p.name)}</span><span><b>${esc(p.name)}</b><small>${esc(p.job)}</small></span></div>${cells}</div>`;
    }).join("");
    return `<div class="tt v1-tt"><div class="tt-row hd v1-tr"><div class="who-h">Employee</div>${DAYS.map((d) => `<div class="c">${d.toUpperCase()}</div>`).join("")}</div>${rows || `<div class="v1-none">No one matches.</div>`}</div>`;
  },
  phoneTeam(list) {
    return `<div class="v1-ptl">${list.map((p) => {
      const w = weekOf(p);
      return `<button type="button" class="v1-ptc" data-act="person" data-id="${p.id}"><span class="avatar">${initials(p.name)}</span><span class="v1-ptn"><b>${esc(p.name)}</b><small>${w ? N.parts(w).map((x) => `${N.daysLabel(x.days)} ${N.partText(x)}`).join(" · ") || "Open any time" : "Not submitted yet"}</small></span>${w ? `<span class="v1-mw">${w.map((d) => railHTML(d, { labels: false, cls: "micro" })).join("")}</span>` : ""}${icon("chevR", 15)}</button>`;
    }).join("")}</div>`;
  },
  act(act, el) {
    const i = +el.dataset.day;
    const d = S.week[i];
    switch (act) {
      case "v1-state": setState(i, el.dataset.v); if (el.closest(".sheet")) render(); return true;
      case "v1-done": V().open = null; render(); return true;
      case "v1-preset": { const p = PRESETS[+el.dataset.k].r; setDay(i, { r: has(d, p) ? subR(d.r, p) : mergeR(d.r.concat([p])), t: d.t }); return true; }
      case "v1-delr": { const r = d.r.slice(); r.splice(+el.dataset.k, 1); setDay(i, { r, t: d.t }); return true; }
      case "v1-addr": { const last = d.r[d.r.length - 1]; const a = last ? Math.min(last[1] + 60, CLOSE - 120) : 1080; setDay(i, { r: d.r.concat([[a, Math.min(a + 120, CLOSE)]]), t: d.t }); return true; }
      case "v1-type": { const t = d.all ? N.TYPES.map((x) => x.id).filter((x) => x !== el.dataset.type) : d.t.includes(el.dataset.type) ? d.t.filter((x) => x !== el.dataset.type) : d.t.concat(el.dataset.type); setDay(i, { r: d.all ? [] : d.r, t }); return true; }
      case "v1-copy": openCopy(el, i); return true;
      case "v1-clear": { const undo = snapshotUndo(); S.week = S.week.map(() => blank()); V().open = null; render(); toast("<b>Week cleared.</b><small>You're open to work any time. Save to share it.</small>", { undo }); return true; }
      case "v1-sheet": S.ph.sheet = { day: i }; render(); return true;
      case "v1-same": { const k = +el.dataset.k; S.week[k] = JSON.stringify(S.week[k]) === JSON.stringify(d) ? blank() : clone(d); render(); return true; }
    }
    return false;
  },
  change(ev) {
    const t = ev.target; if (!t.dataset.v1r) return;
    const [i, k, e] = t.dataset.v1r.split(":").map(Number);
    const d = S.week[i]; const r = d.r.map((x) => x.slice());
    r[k][e] = +t.value; if (r[k][0] >= r[k][1]) { if (e === 0) r[k][1] = Math.min(CLOSE, r[k][0] + 60); else r[k][0] = Math.max(OPEN, r[k][1] - 60); }
    setDay(i, { r, t: d.t });
  },
  down(ev) {
    const rail = ev.target.closest && ev.target.closest("[data-rail]");
    if (!rail || ev.button !== 0) return;
    ev.preventDefault();
    const i = +rail.dataset.rail; const box = rail.getBoundingClientRect();
    const at = (x) => clamp(snap(OPEN + ((x - box.left) / box.width) * SPAN), OPEN, CLOSE);
    const x0 = ev.clientX, m0 = at(x0);
    const ghost = document.createElement("span"); ghost.className = "blk ghost"; rail.appendChild(ghost);
    let a = m0, b = m0, moved = false;
    const paint = () => { ghost.style.left = pct(a) + "%"; ghost.style.width = Math.max(0, pct(b) - pct(a)) + "%"; ghost.textContent = b - a >= 120 ? rangeText([a, b]) : ""; };
    drag(ev, (e) => { if (Math.abs(e.clientX - x0) > 4) moved = true; const m = at(e.clientX); a = Math.min(m0, m); b = Math.max(m0, m); paint(); }, () => {
      const d = S.week[i];
      if (!moved) {
        const hit = asRanges(d).some(([x, y]) => m0 >= x && m0 <= y);
        V().open = i;
        if (hit) { render(); return; }
        a = clamp(snap(m0 - 60, 60), OPEN, CLOSE - 120); b = a + 120;
      }
      if (b - a < 30) { render(); return; }
      V().open = i;
      setDay(i, { r: mergeR((d.all ? [] : d.r).concat([[a, b]])), t: d.t });
    });
  },
};
})();
