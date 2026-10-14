/* 4 · Day by day: a list of days on the left, one day at a time on the right with big choices and a time slider. */
(function () {
"use strict";
const N = window.NF;
const { icon, esc, DAYS, DAYL, DAYP, OPEN, CLOSE, SPAN, S, TYPES, fmt, fmtC, fmtS, pct, snap, clamp, mergeR, isFree, dayState, dayText, rangeText, lower, weekOf, first, initials, timeSelect, setDay, render, railHTML, scaleHTML, summaryLine, toast, clone, drag, blank, norm } = N;
const V = () => N.vs("4");
const sel = () => (V().day == null ? 4 : V().day);
const stText = (d) => (d.all ? "Unavailable all day" : isFree(d) ? "Available" : dayText(d));
function say(i, d) {
  if (d.all) return `On ${DAYP[i]} you'd rather not work at all.`;
  if (isFree(d)) return `You're open to work any time on ${DAYP[i]}.`;
  return `On ${DAYP[i]} you'd rather not work ${S.mode === "types" ? d.t.map((t) => N.TYPE[t].name).join(" or ") + " shifts" : d.r.map((r) => lower(rangeText(r))).join(" or ")}.`;
}
function dots(w) { return `<span class="v4-dots" aria-hidden="true">${w.map((d) => `<i class="${dayState(d)}"></i>`).join("")}</span>`; }
function opts(i, d, phone) {
  const st = dayState(d);
  const o = (v, ic, t, s) => `<button type="button" class="v4-opt ${v}" role="radio" aria-checked="${st === v}" data-act="v4-state" data-day="${i}" data-v="${v}"><span class="v4-oi">${icon(ic, phone ? 18 : 20)}</span><span><b>${t}</b><small>${s}</small></span></button>`;
  return `<div class="v4-opts" role="radiogroup" aria-label="${DAYL[i]}">${o("free", "circleCheck", "Available", "Open any time")}${o("some", "clock", S.mode === "types" ? "Some shifts" : "Some hours", S.mode === "types" ? "Not certain shifts" : "Not at certain hours")}${o("off", "ban", "Unavailable", "Not this whole day")}</div>`;
}
function slider(i, d) {
  return `<div class="v4-slider" data-sl="${i}"><div class="v4-track" data-track="${i}">${d.r.map(([a, b], k) => `<div class="v4-band" style="left:${pct(a)}%;width:${pct(b) - pct(a)}%" data-band="${k}"><span>${esc(rangeText([a, b]))}</span></div>`).join("")}${d.r.map(([a, b], k) => `<button type="button" class="v4-knob" data-knob="${i}:${k}:0" style="left:${pct(a)}%" aria-label="Start ${fmt(a)}"><em>${fmtS(a)}</em></button><button type="button" class="v4-knob" data-knob="${i}:${k}:1" style="left:${pct(b)}%" aria-label="End ${fmt(b)}"><em>${b >= CLOSE ? "close" : fmtS(b)}</em></button>`).join("")}</div>${scaleHTML()}</div>`;
}
function ranges(i, d) {
  return `<div class="v4-ranges">${d.r.map(([a, b], k) => `<div class="v4-rg"><span class="v4-rn">${k + 1}</span>${timeSelect(`data-v4r="${i}:${k}:0" aria-label="From"`, a, { to: CLOSE - 30 })}<span>to</span>${timeSelect(`data-v4r="${i}:${k}:1" aria-label="To"`, b, { from: OPEN + 30 })}<button type="button" class="btn ghost icon sm" data-act="v4-delr" data-day="${i}" data-k="${k}" aria-label="Remove">${icon("trash", 14)}</button></div>`).join("")}<button type="button" class="btn sm quiet" data-act="v4-addr" data-day="${i}">${icon("plus", 14)} Add another time</button></div>`;
}
function types(i, d) {
  return `<div class="v4-types">${TYPES.map((t) => { const on = d.all || d.t.includes(t.id); return `<button type="button" class="v4-type" data-act="v4-type" data-day="${i}" data-type="${t.id}" aria-pressed="${on}">${icon(t.ic, 18)}<b>${t.name}</b><small>${fmtC(t.a)} – ${fmtC(t.b)}</small><span class="v4-tk">${on ? icon("ban", 14) : ""}</span></button>`; }).join("")}</div>`;
}
function same(i, d) {
  return `<div class="v4-same"><span class="lbl">Same for other days</span><div class="v4-chips">${DAYS.map((dn, k) => k === i ? "" : `<button type="button" class="dchip" data-act="v4-copyto" data-day="${i}" data-k="${k}" aria-pressed="${JSON.stringify(S.week[k]) === JSON.stringify(d)}">${dn}</button>`).join("")}</div></div>`;
}
function detail(i, phone) {
  const d = S.week[i]; const st = dayState(d);
  const editor = st !== "some" ? "" : S.mode === "types" ? types(i, d) : slider(i, d) + ranges(i, d);
  return `${opts(i, d, phone)}${editor ? `<div class="v4-ed">${editor}</div>` : ""}<p class="v4-say">${icon("sparkle", 15)}<span>${esc(say(i, d))}</span></p>${same(i, d)}`;
}
function tiles(w, phone) {
  return `<div class="v4-tiles ${phone ? "mob" : ""}">${w.map((d, i) => `<div class="v4-tile st-${dayState(d)}"><span class="v4-tdn"><i></i><b>${DAYS[i]}</b></span><small>${esc(stText(d))}</small>${S.mode === "types" ? "" : railHTML(d, { labels: false, cls: "mini" })}</div>`).join("")}</div>`;
}

N.variants["4"] = {
  name: "4 · Day by day",
  tr: {
    ad: "Gün gün",
    fikir: "Solda 7 günün listesi, sağda seçilen günün büyük ekranı. Üç büyük seçenek (Available / Some hours / Unavailable). \"Some hours\" seçilince saat kaydırıcısı çıkar: iki ucu sürükleyerek aralık seçilir; altta tam saat kutuları da var. \"Same for other days\" ile aynı ayar başka günlere konur. Telefonda önce gün listesi, dokununca günün sayfası açılır.",
    arti: "Her adımda tek soru: kafa karıştırmaz, ilk kez kullanan için en anlaşılır olan. Telefonda en rahat olan (büyük düğmeler, tam sayfa). Müdür ekranı da aynı mantıkta: solda kişi listesi, sağda seçilen kişinin haftası.",
    eksi: "Haftanın tamamını aynı anda düzenleyemezsin; günler arasında gidip gelmek gerekir. Bütün haftayı bir bakışta görmek için soldaki özet listeye bakılır.",
    dene: "Cuma'yı seç, kaydırıcının uçlarını sürükle, sonra \"Same for other days\"ten Per'e (Thu) dokun.",
  },
  editor() {
    const i = sel();
    return `<div class="v4">${summaryLine(S.week)}<div class="v4-wrap"><nav class="v4-days" aria-label="Days">${DAYS.map((_, k) => {
      const d = S.week[k];
      return `<button type="button" class="v4-day st-${dayState(d)}" data-act="v4-sel" data-day="${k}" aria-current="${k === i}"><i class="v4-dot"></i><span class="v4-dn"><b>${DAYL[k]}</b><small>${esc(stText(d))}</small></span>${icon("chevR", 15)}</button>`;
    }).join("")}</nav>
      <section class="v4-detail" aria-label="${DAYL[i]}"><header class="v4-dh"><div><span class="lbl">Day ${i + 1} of 7</span><h3>${DAYL[i]}</h3></div><div class="v4-nav"><button type="button" class="btn icon sm" data-act="v4-step" data-d="-1" aria-label="Previous day" ${i === 0 ? "disabled" : ""}>${icon("chevL", 16)}</button><button type="button" class="btn icon sm" data-act="v4-step" data-d="1" aria-label="Next day" ${i === 6 ? "disabled" : ""}>${icon("chevR", 16)}</button></div></header>${detail(i)}</section></div></div>`;
  },
  phoneEditor() {
    const v = V();
    if (v.pday == null) {
      return `${summaryLine(S.week)}<div class="v4p-list">${DAYS.map((_, k) => { const d = S.week[k]; return `<button type="button" class="v4-day st-${dayState(d)}" data-act="v4-psel" data-day="${k}"><i class="v4-dot"></i><span class="v4-dn"><b>${DAYL[k]}</b><small>${esc(stText(d))}</small></span>${icon("chevR", 16)}</button>`; }).join("")}</div>`;
    }
    const i = v.pday;
    return `<div class="v4p-top"><button type="button" class="btn ghost sm" data-act="v4-pback">${icon("chevL", 16)} Week</button><span class="grow"></span><button type="button" class="btn icon sm" data-act="v4-pstep" data-d="-1" aria-label="Previous day" ${i === 0 ? "disabled" : ""}>${icon("chevL", 15)}</button><button type="button" class="btn icon sm" data-act="v4-pstep" data-d="1" aria-label="Next day" ${i === 6 ? "disabled" : ""}>${icon("chevR", 15)}</button></div>
      <h2 class="v4p-h">${DAYL[i]}</h2><div class="v4-detail mob">${detail(i, true)}</div>`;
  },
  readOnly(p) { return tiles(weekOf(p)); },
  phoneReadOnly(p) { return tiles(weekOf(p), true); },
  team(list) {
    const pid = V().tp && list.some((p) => p.id === V().tp) ? V().tp : (list[0] || {}).id;
    const p = N.PERSON[pid];
    const w = p && weekOf(p);
    const left = list.map((x) => { const wx = weekOf(x); return `<button type="button" class="v4-tp" data-act="v4-tp" data-id="${x.id}" aria-current="${x.id === pid}"><span class="avatar">${initials(x.name)}</span><span class="v4-tpn"><b>${esc(x.name)}</b><small>${wx ? esc(x.job) : "Not submitted yet"}</small></span>${wx ? dots(wx) : ""}</button>`; }).join("");
    const right = !p ? `<div class="empty-state">No one matches.</div>` : `<div class="v4-th"><span class="avatar">${initials(p.name)}</span><div><b>${esc(p.name)}</b><small>${esc(p.job)} · ${w ? `Updated ${p.me ? S.savedAt : p.upd}` : "Not submitted"}</small></div><span class="grow"></span><button type="button" class="btn sm" data-act="person" data-id="${p.id}">Open profile ${icon("arrowR", 14)}</button></div>
      ${w ? `${summaryLine(w, first(p))}${tiles(w)}` : `<div class="empty-state">${icon("calx", 24)}<b>${esc(first(p))} hasn't shared availability yet.</b><span>It's optional. Until then, every time counts as available.</span></div>`}`;
    return `<div class="v4-team"><div class="v4-tl">${left}</div><div class="card v4-tdet">${right}</div></div>`;
  },
  phoneTeam(list) {
    return `<div class="v4p-list">${list.map((x) => { const wx = weekOf(x); return `<button type="button" class="v4-tp" data-act="person" data-id="${x.id}"><span class="avatar">${initials(x.name)}</span><span class="v4-tpn"><b>${esc(x.name)}</b><small>${wx ? esc(x.job) : "Not submitted yet"}</small></span>${wx ? dots(wx) : ""}${icon("chevR", 15)}</button>`; }).join("")}</div>`;
  },
  act(act, el) {
    const i = +el.dataset.day; const d = S.week[i];
    switch (act) {
      case "v4-sel": V().day = i; render(); return true;
      case "v4-step": V().day = clamp(sel() + +el.dataset.d, 0, 6); render(); return true;
      case "v4-psel": V().pday = i; render(); return true;
      case "v4-pback": V().pday = null; render(); return true;
      case "v4-pstep": V().pday = clamp(V().pday + +el.dataset.d, 0, 6); render(); return true;
      case "v4-tp": V().tp = el.dataset.id; render(); return true;
      case "v4-state": {
        const v = el.dataset.v;
        if (v === "free") setDay(i, blank()); else if (v === "off") setDay(i, { all: true });
        else if (S.mode === "types") { if (d.all || isFree(d)) setDay(i, { t: ["dinner"] }); }
        else if (d.all || isFree(d)) setDay(i, { r: [[1080, CLOSE]] });
        return true;
      }
      case "v4-type": { const id = el.dataset.type; const cur = d.all ? TYPES.map((t) => t.id) : d.t; setDay(i, { r: d.r, t: cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat(id) }); return true; }
      case "v4-delr": { const r = d.r.slice(); r.splice(+el.dataset.k, 1); setDay(i, { r, t: d.t }); return true; }
      case "v4-addr": { const last = d.r[d.r.length - 1]; const a = last ? Math.min(last[1] + 60, CLOSE - 120) : 660; setDay(i, { r: d.r.concat([[a, Math.min(a + 120, CLOSE)]]), t: d.t }); return true; }
      case "v4-copyto": { const k = +el.dataset.k; S.week[k] = JSON.stringify(S.week[k]) === JSON.stringify(d) ? blank() : clone(d); render(); return true; }
    }
    return false;
  },
  change(ev) {
    const t = ev.target; if (!t.dataset.v4r) return;
    const [i, k, e] = t.dataset.v4r.split(":").map(Number); const d = S.week[i]; const r = d.r.map((x) => x.slice());
    r[k][e] = +t.value; if (r[k][0] >= r[k][1]) { if (e === 0) r[k][1] = Math.min(CLOSE, r[k][0] + 60); else r[k][0] = Math.max(OPEN, r[k][1] - 60); }
    setDay(i, { r, t: d.t });
  },
  key(ev) {
    const kn = ev.target.closest && ev.target.closest("[data-knob]");
    if (!kn || (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight")) return false;
    ev.preventDefault();
    const [i, k, e] = kn.dataset.knob.split(":").map(Number); const d = S.week[i]; const r = d.r.map((x) => x.slice());
    const dm = ev.key === "ArrowLeft" ? -30 : 30;
    if (e === 0) r[k][0] = clamp(r[k][0] + dm, OPEN, r[k][1] - 30); else r[k][1] = clamp(r[k][1] + dm, r[k][0] + 30, CLOSE);
    setDay(i, { r, t: d.t });
    const again = document.querySelector(`[data-knob="${i}:${k}:${e}"]`); again && again.focus();
    return true;
  },
  down(ev) {
    if (ev.button !== 0) return;
    const kn = ev.target.closest && ev.target.closest("[data-knob]");
    const tr = ev.target.closest && ev.target.closest("[data-track]");
    if (!kn && !tr) return;
    ev.preventDefault();
    const track = kn ? kn.parentElement : tr; const box = track.getBoundingClientRect();
    const at = (x) => clamp(snap(OPEN + ((x - box.left) / box.width) * SPAN), OPEN, CLOSE);
    if (!kn) {
      const i = +tr.dataset.track; const d = S.week[i]; const m = at(ev.clientX);
      if (d.r.some(([a, b]) => m >= a && m <= b)) return;
      const a = clamp(snap(m - 60, 60), OPEN, CLOSE - 120);
      setDay(i, { r: mergeR(d.r.concat([[a, a + 120]])), t: d.t }); return;
    }
    const [i, k, e] = kn.dataset.knob.split(":").map(Number);
    const d = S.week[i]; const r = d.r.map((x) => x.slice());
    const lo = e === 0 ? (k > 0 ? r[k - 1][1] : OPEN) : r[k][0] + 30;
    const hi = e === 0 ? r[k][1] - 30 : (k < r.length - 1 ? r[k + 1][0] : CLOSE);
    const band = track.querySelector(`[data-band="${k}"]`);
    kn.classList.add("live");
    drag(ev, (mv) => {
      const m = clamp(at(mv.clientX), lo, hi); r[k][e] = m;
      kn.style.left = pct(m) + "%"; kn.querySelector("em").textContent = e === 1 && m >= CLOSE ? "close" : fmtS(m);
      if (band) { band.style.left = pct(r[k][0]) + "%"; band.style.width = pct(r[k][1]) - pct(r[k][0]) + "%"; band.querySelector("span").textContent = rangeText(r[k]); }
    }, () => { kn.classList.remove("live"); setDay(i, { r, t: d.t }); });
  },
};
})();
