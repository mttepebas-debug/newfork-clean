/* 2 · Week: a calendar week like Google Calendar. Drag down a day (or across days) to mark time; drag edges to resize; click a day name for all day. */
(function () {
"use strict";
const N = window.NF;
const { icon, esc, DAYS, DAYL, OPEN, CLOSE, SPAN, S, TYPES, TYPE, fmtC, fmtS, snap, clamp, mergeR, subR, isFree, dayState, dayText, rangeText, weekOf, first, initials, timeSelect, openPop, closePop, setDay, render, railHTML, scaleHTML, summaryLine, toast, clone, drag, blank, clash } = N;
const V = () => N.vs("2");
const HPX = { edit: 24, ro: 13, phone: 30, pro: 12 };
const y = (m, h) => ((m - OPEN) / 60) * h;
const endText = (b) => (b >= CLOSE ? "close" : fmtC(b));
const LANES = { breakfast: 0, dinner: 0, lunch: 1, close: 1 };
const stTxt = (d) => (d.all ? "All day" : isFree(d) ? "Available" : S.mode === "types" ? `${d.t.length} ${d.t.length === 1 ? "shift" : "shifts"}` : "Some hours");

function axis(h) {
  let s = "";
  for (let m = OPEN; m <= CLOSE; m += 120) s += `<span style="top:${y(m, h)}px">${fmtS(m)}</span>`;
  return `<div class="v2-axis">${s}</div>`;
}
function colBlocks(i, d, h, ro) {
  if (S.mode === "types") {
    return TYPES.map((t) => {
      const off = d.all || d.t.includes(t.id);
      const tall = y(t.b, h) - y(t.a, h);
      return `<${ro ? "div" : "button type=\"button\""} class="v2-type lane${LANES[t.id]} ${off ? "on" : ""}" ${ro ? "" : `data-act="v2-type" data-day="${i}" data-type="${t.id}" aria-pressed="${off}"`} style="top:${y(t.a, h)}px;height:${tall}px" title="${t.name} ${fmtC(t.a)} – ${fmtC(t.b)}">${tall > 30 ? `${icon(t.ic, 13)}<span>${t.name}</span>` : ""}</${ro ? "div" : "button"}>`;
    }).join("");
  }
  if (d.all) return `<div class="v2-blk all" ${ro ? "" : `data-blk="${i}:all"`} style="top:0;height:${y(CLOSE, h)}px"><span class="v2-bt">${h > 14 ? "Unavailable" : ""}</span><span class="v2-bs">All day</span></div>`;
  return d.r.map(([a, b], k) => {
    const tall = y(b, h) - y(a, h);
    return `<div class="v2-blk" ${ro ? "" : `data-blk="${i}:${k}"`} style="top:${y(a, h)}px;height:${tall}px">${tall >= 34 ? `<span class="v2-bt">Unavailable</span>` : ""}${tall >= 16 ? `<span class="v2-bs">${a <= OPEN ? "Before " + fmtC(b) : b >= CLOSE ? "After " + fmtC(a) : fmtC(a) + " – " + fmtC(b)}</span>` : ""}${ro ? "" : '<i class="v2-h t" data-h="t"></i><i class="v2-h b" data-h="b"></i>'}</div>`;
  }).join("");
}
function cal(week, opts) {
  const h = opts.h, ro = !!opts.ro;
  const days = opts.only != null ? [opts.only] : [0, 1, 2, 3, 4, 5, 6];
  const head = opts.noHead ? "" : `<div class="v2-head" style="grid-template-columns:44px repeat(${days.length}, minmax(0, 1fr))"><span></span>${days.map((i) => {
    const d = week[i];
    return ro ? `<span class="v2-dh st-${dayState(d)}"><b>${DAYS[i]}</b>${opts.small ? "" : `<small>${stTxt(d)}</small>`}</span>`
      : `<button type="button" class="v2-dh st-${dayState(d)}" data-act="v2-all" data-day="${i}" aria-pressed="${d.all}" title="${d.all ? "Click to make " + DAYL[i] + " available" : "Click to mark " + DAYL[i] + " unavailable all day"}"><b>${DAYS[i]}</b><small>${stTxt(d)}</small></button>`;
  }).join("")}</div>`;
  return `<div class="v2-cal ${ro ? "ro" : ""} ${opts.cls || ""}">${head}<div class="v2-body" style="height:${y(CLOSE, h)}px;grid-template-columns:44px repeat(${days.length}, minmax(0, 1fr));--hpx:${h}px">${axis(h)}${days.map((i) => `<div class="v2-col" ${ro ? "" : `data-col="${i}" data-h="${h}"`}>${colBlocks(i, week[i], h, ro)}</div>`).join("")}</div></div>`;
}
function blockForm(i, k) {
  const d = S.week[i];
  if (k === "all") {
    return { title: DAYL[i], sub: "Unavailable all day", body: `<p class="pop-p">You'd rather not work any time on ${DAYP(i)}.</p>`, foot: `<button type="button" class="btn sm quiet" data-x="free">Make available</button><span class="grow"></span><button type="button" class="btn sm quiet" data-x="hours">Set hours instead</button>` };
  }
  const [a, b] = d.r[k];
  const same = (j) => S.week[j].r.some(([x, z]) => x === a && z === b);
  return {
    title: DAYL[i], sub: rangeText([a, b]),
    body: `<div class="v2-pr">${timeSelect('data-x="a" aria-label="From"', a, { to: CLOSE - 30 })}<span>to</span>${timeSelect('data-x="b" aria-label="To"', b, { from: OPEN + 30 })}</div>
      <span class="lbl">Repeat on</span><div class="v2-days">${DAYS.map((dn, j) => `<button type="button" class="dchip sm" data-x="rep" data-j="${j}" aria-pressed="${same(j)}" ${j === i ? "disabled" : ""}>${dn.slice(0, 2)}</button>`).join("")}</div>`,
    foot: `<button type="button" class="btn sm ghost" data-x="del">${icon("trash", 14)} Delete</button><span class="grow"></span><button type="button" class="btn sm dark" data-x="ok">Done</button>`,
  };
}
const DAYP = (i) => N.DAYP[i];
function handleForm(i, k, x, root, close) {
  const d = S.week[i];
  const what = x.dataset.x;
  if (what === "free") { setDay(i, blank()); close(); return; }
  if (what === "hours") { setDay(i, { r: [[1080, CLOSE]] }); close(); return; }
  if (what === "del") { const r = d.r.slice(); r.splice(k, 1); setDay(i, { r, t: d.t }); close(); return; }
  if (what === "ok") { close(); return; }
  if (what === "rep") {
    const j = +x.dataset.j; const [a, b] = d.r[k]; const dj = S.week[j];
    const on = dj.r.some(([p, q]) => p === a && q === b);
    S.week[j] = N.norm({ r: on ? subR(dj.all ? [[OPEN, CLOSE]] : dj.r, [a, b]) : mergeR((dj.all ? [] : dj.r).concat([[a, b]])), t: dj.t });
    render(); x.setAttribute("aria-pressed", String(!on));
  }
}
function openBlock(el, i, k) {
  const inPhone = !!el.closest(".phone");
  if (inPhone) { S.ph.sheet = { i, k }; render(); return; }
  const f = blockForm(i, k);
  openPop(el, `<div class="pop-hd"><strong>${f.title}</strong><small>${esc(f.sub)}</small></div><div class="pop-bd">${f.body}</div><div class="pop-ft">${f.foot}</div>`, (pop) => {
    pop.addEventListener("click", (e) => { const x = e.target.closest("[data-x]"); if (!x || x.tagName === "SELECT") return; handleForm(i, k, x, pop, closePop); });
    pop.addEventListener("change", (e) => {
      const t = e.target; if (!t.dataset.x) return;
      const d = S.week[i]; const r = d.r.map((z) => z.slice());
      if (t.dataset.x === "a") r[k][0] = +t.value; else r[k][1] = +t.value;
      if (r[k][0] >= r[k][1]) { if (t.dataset.x === "a") r[k][1] = Math.min(CLOSE, r[k][0] + 60); else r[k][0] = Math.max(OPEN, r[k][1] - 60); }
      setDay(i, { r, t: d.t }); closePop();
    });
  }, { cls: "v2-pop", align: "center" });
}

N.variants["2"] = {
  name: "2 · Week",
  tr: {
    ad: "Hafta takvimi",
    fikir: "Google Takvim gibi bir hafta. Saatler yukarıdan aşağı akar. Bir günün üstünde fareyle aşağı sürükleyince o saatler işaretlenir; birkaç günün üstünden yana sürükleyince hepsine birden konur. Bloğun kenarından çekip büyütülür, üstüne tıklayınca tam saat ve \"Repeat on\" (başka günlere de koy) açılır. Gün adına tıklamak \"bütün gün\" demek.",
    arti: "Saat bilgisi en net olan; insanlar takvime alışkın. Birden çok güne tek hareketle koymak hızlı. Müdür ekranında bir günün saat çizelgesi var: fareyle gezince o saatte kimin çalışmak istemediği yazıyor.",
    eksi: "Fareyle sürüklemek ilk kez kullanan için bir ipucu ister. Telefonda tek gün görünür (üstte gün seçici).",
    dene: "Pazartesi 4 PM'den Perşembe 10 PM'e çapraz sürükle. Sonra Team ekranında zaman çizgisinde gez.",
  },
  editor() {
    return `<div class="v2">${summaryLine(S.week)}${cal(S.week, { h: HPX.edit })}
      <div class="v2-foot"><span class="muted">${icon("pointer", 13)} ${S.mode === "types" ? "Click a shift to mark it. Click a day name for the whole day." : "Drag down a day to mark time, or across days to mark them all. Click a day name for the whole day."}</span><span class="grow"></span><button type="button" class="btn sm ghost" data-act="v2-clear">${icon("rotate", 14)} Clear week</button></div></div>`;
  },
  phoneEditor() {
    const i = V().pday == null ? 4 : V().pday; const d = S.week[i];
    return `${summaryLine(S.week)}<div class="v2p-strip">${DAYS.map((dn, k) => `<button type="button" class="v2p-d st-${dayState(S.week[k])}" data-act="v2-pday" data-day="${k}" aria-pressed="${k === i}"><span>${dn.slice(0, 1)}</span><i></i></button>`).join("")}</div>
      <div class="v2p-hd"><div><b>${DAYL[i]}</b><small>${d.all ? "Unavailable all day" : isFree(d) ? "Available" : esc(dayText(d))}</small></div><button type="button" class="btn sm quiet" data-act="v2-all" data-day="${i}">${d.all ? "Make available" : "All day"}</button></div>
      ${cal(S.week, { h: HPX.phone, only: i, noHead: true, cls: "v2p" })}<p class="muted v2p-tip">${icon("pointer", 13)} ${S.mode === "types" ? "Tap a shift to mark it." : "Touch and drag down to mark time. Tap a block to change it."}</p>`;
  },
  phoneSheet() {
    const { i, k } = S.ph.sheet; const f = blockForm(i, k);
    return `<h3>${f.title}</h3><div class="sub">${esc(f.sub)}</div><div class="v2-sheet" data-i="${i}" data-k="${k}">${f.body}</div><div class="acts v2-sheet-ft">${f.foot.replace('<span class="grow"></span>', "")}</div>`;
  },
  readOnly(p) { return cal(weekOf(p), { h: HPX.ro, ro: true }); },
  phoneReadOnly(p) { return cal(weekOf(p), { h: HPX.pro, ro: true, small: true, cls: "v2-pro" }); },
  team(list) {
    const day = V().tday == null ? 4 : V().tday;
    const rows = list.map((p) => {
      const w = weekOf(p);
      return `<div class="v2-g-row" data-act="person" data-id="${p.id}" role="button" tabindex="0"><div class="who"><span class="avatar">${initials(p.name)}</span><span><b>${esc(p.name)}</b><small>${esc(p.job)}</small></span></div><div class="v2-g-tl">${w ? railHTML(w[day], { cls: "v2-g-rail" }) : `<span class="tag mute">Not submitted yet</span>`}</div></div>`;
    }).join("");
    return `<div class="v2-team"><div class="v2-tt-top"><div class="seg">${DAYS.map((dn, i) => `<button type="button" data-act="v2-tday" data-day="${i}" aria-pressed="${i === day}">${dn} ${N.DATE[i]}</button>`).join("")}</div><span class="grow"></span><span class="v2-live" aria-live="polite">${icon("pointer", 13)} Move over the timeline to see who prefers not to work then</span></div>
      <div class="tt v2-g"><div class="v2-g-row hd"><div class="who-h">Employee</div><div class="v2-g-tl">${scaleHTML()}</div></div>${rows}<i class="v2-g-cursor" hidden></i></div></div>`;
  },
  phoneTeam(list) {
    const day = V().tday == null ? 4 : V().tday;
    return `<div class="v2p-strip">${DAYS.map((dn, k) => `<button type="button" class="v2p-d" data-act="v2-tday" data-day="${k}" aria-pressed="${k === day}"><span>${dn.slice(0, 1)}</span></button>`).join("")}</div>
      <div class="v2p-tl">${list.map((p) => { const w = weekOf(p); const d = w && w[day]; return `<button type="button" class="v2p-row" data-act="person" data-id="${p.id}"><span class="v2p-nm"><b>${esc(p.name)}</b><small>${!w ? "Not submitted yet" : isFree(d) ? "Available" : esc(dayText(d))}</small></span>${w ? railHTML(d, { labels: false, cls: "mini" }) : ""}</button>`; }).join("")}</div><div class="v2p-sc">${scaleHTML()}</div>`;
  },
  act(act, el) {
    const i = +el.dataset.day;
    switch (act) {
      case "v2-all": { const d = S.week[i]; setDay(i, d.all ? blank() : { all: true }); return true; }
      case "v2-type": { const d = S.week[i]; const id = el.dataset.type; const t = d.all ? TYPES.map((x) => x.id).filter((x) => x !== id) : d.t.includes(id) ? d.t.filter((x) => x !== id) : d.t.concat(id); setDay(i, { r: d.all ? [] : d.r, t }); return true; }
      case "v2-pday": V().pday = i; render(); return true;
      case "v2-tday": V().tday = i; render(); return true;
      case "v2-clear": { const before = clone(S.week); S.week = S.week.map(() => blank()); render(); toast("<b>Week cleared.</b><small>Save to share it.</small>", { undo: () => { S.week = before; } }); return true; }
    }
    return false;
  },
  key(ev) { return false; },
  down(ev) {
    if (ev.button !== 0) return;
    const sheet = ev.target.closest && ev.target.closest(".v2-sheet");
    if (sheet) return;
    const col = ev.target.closest && ev.target.closest(".v2-col[data-col]");
    if (!col || S.mode === "types") return;
    ev.preventDefault();
    const h = +col.dataset.h; const i0 = +col.dataset.col;
    const body = col.parentElement;
    const top = () => col.getBoundingClientRect().top;
    const at = (cy) => clamp(snap(OPEN + ((cy - top()) / h) * 60), OPEN, CLOSE);
    const blk = ev.target.closest(".v2-blk");
    const y0 = ev.clientY, m0 = at(y0);
    let moved = false;
    if (blk) {
      const [bi, bk] = blk.dataset.blk.split(":");
      if (bk === "all") { drag(ev, () => {}, () => openBlock(blk, +bi, "all")); return; }
      const k = +bk; const d = S.week[+bi]; const [a0, b0] = d.r[k];
      const mode = ev.target.dataset.h === "t" ? "t" : ev.target.dataset.h === "b" ? "b" : "m";
      let a = a0, b = b0;
      blk.classList.add("live");
      drag(ev, (e) => {
        const dm = at(e.clientY) - m0; if (Math.abs(e.clientY - y0) > 3) moved = true;
        if (mode === "t") a = clamp(a0 + dm, OPEN, b0 - 30);
        else if (mode === "b") b = clamp(b0 + dm, a0 + 30, CLOSE);
        else { const len = b0 - a0; a = clamp(a0 + dm, OPEN, CLOSE - len); b = a + len; }
        blk.style.top = y(a, h) + "px"; blk.style.height = y(b, h) - y(a, h) + "px";
        const bs = blk.querySelector(".v2-bs"); if (bs) bs.textContent = `${fmtC(a)} – ${endText(b)}`;
      }, () => {
        blk.classList.remove("live");
        if (!moved) { openBlock(blk, +bi, k); return; }
        const r = d.r.map((z) => z.slice()); r[k] = [a, b];
        setDay(+bi, { r, t: d.t });
      });
      return;
    }
    const cols = [...body.querySelectorAll(".v2-col[data-col]")];
    const ghosts = new Map();
    let a = m0, b = m0, i1 = i0;
    const paint = () => {
      const lo = Math.min(i0, i1), hi = Math.max(i0, i1);
      cols.forEach((c) => {
        const ci = +c.dataset.col; let g = ghosts.get(ci);
        if (ci >= lo && ci <= hi && b > a) {
          if (!g) { g = document.createElement("div"); g.className = "v2-blk ghost"; c.appendChild(g); ghosts.set(ci, g); }
          g.style.top = y(a, h) + "px"; g.style.height = y(b, h) - y(a, h) + "px";
          g.innerHTML = y(b, h) - y(a, h) > 18 ? `<span class="v2-bs">${fmtC(a)} – ${endText(b)}</span>` : "";
        } else if (g) { g.remove(); ghosts.delete(ci); }
      });
    };
    drag(ev, (e) => {
      if (Math.abs(e.clientY - y0) > 3 || Math.abs(e.clientX - ev.clientX) > 6) moved = true;
      const m = at(e.clientY); a = Math.min(m0, m); b = Math.max(m0, m);
      const over = document.elementFromPoint(e.clientX, Math.min(Math.max(e.clientY, body.getBoundingClientRect().top + 2), body.getBoundingClientRect().bottom - 2));
      const oc = over && over.closest && over.closest(".v2-col[data-col]");
      if (oc && oc.parentElement === body) i1 = +oc.dataset.col;
      paint();
    }, () => {
      ghosts.forEach((g) => g.remove());
      if (!moved) { a = clamp(snap(m0 - 60, 60), OPEN, CLOSE - 120); b = a + 120; }
      if (b - a < 30) return;
      const lo = Math.min(i0, i1), hi = Math.max(i0, i1);
      for (let k = lo; k <= hi; k++) { const d = S.week[k]; S.week[k] = N.norm({ r: mergeR((d.all ? [[OPEN, CLOSE]] : d.r).concat([[a, b]])), t: d.t }); }
      render();
      if (hi > lo) toast(`<b>Marked ${DAYS[lo]}–${DAYS[hi]} ${esc(rangeText([a, b]).replace(/^(After|Before)/, (w) => w.toLowerCase()))}.</b><small>Save to share it with your managers.</small>`);
    });
  },
  move(ev) {
    const tl = ev.target.closest && ev.target.closest(".v2-g .v2-g-row:not(.hd) .v2-g-tl, .v2-g .v2-g-row.hd .v2-g-tl");
    const g = document.querySelector(".v2-g"); if (!g) return;
    const cur = g.querySelector(".v2-g-cursor"); const live = document.querySelector(".v2-live");
    if (!tl) { if (cur && !cur.hidden) { cur.hidden = true; if (live) live.innerHTML = `${icon("pointer", 13)} Move over the timeline to see who prefers not to work then`; } return; }
    const r = tl.getBoundingClientRect(); const gr = g.getBoundingClientRect();
    const m = clamp(snap(OPEN + ((ev.clientX - r.left) / r.width) * SPAN, 15), OPEN, CLOSE);
    cur.hidden = false; cur.style.left = ev.clientX - gr.left + "px";
    const day = V().tday == null ? 4 : V().tday;
    const who = N.TEAM.filter((p) => { const w = weekOf(p); return w && clash(w[day], m, m + 1, null, "hours"); });
    const noSub = N.TEAM.filter((p) => !weekOf(p)).length;
    if (live) live.innerHTML = `<b>${DAYS[day]} ${N.fmt(m)}</b> · ${who.length ? `${who.length} prefer not to work: ${who.map((p) => esc(first(p))).join(", ")}` : "everyone who shared availability is free"}${noSub ? ` · ${noSub} not submitted` : ""}`;
  },
  change(ev) {
    const t = ev.target; const sh = t.closest && t.closest(".v2-sheet"); if (!sh || !t.dataset.x) return;
    const i = +sh.dataset.i, k = +sh.dataset.k; const d = S.week[i]; const r = d.r.map((z) => z.slice());
    if (t.dataset.x === "a") r[k][0] = +t.value; else r[k][1] = +t.value;
    if (r[k][0] >= r[k][1]) { if (t.dataset.x === "a") r[k][1] = Math.min(CLOSE, r[k][0] + 60); else r[k][0] = Math.max(OPEN, r[k][1] - 60); }
    setDay(i, { r, t: d.t }); S.ph.sheet.sub = 1;
  },
};
// sheet buttons on the phone reuse the popover's form actions
document.addEventListener("click", (e) => {
  const x = e.target.closest && e.target.closest(".sheet [data-x]"); if (!x || S.variant !== "2" || !S.ph.sheet || x.tagName === "SELECT") return;
  const { i, k } = S.ph.sheet;
  handleForm(i, k === "all" ? "all" : +k, x, null, () => { S.ph.sheet = null; render(); });
  if (x.dataset.x === "rep") render();
});
})();
