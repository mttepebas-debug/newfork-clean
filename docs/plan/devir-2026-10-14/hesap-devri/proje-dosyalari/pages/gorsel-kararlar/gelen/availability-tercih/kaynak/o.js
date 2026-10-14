/* Original: today's screens, for comparison. */
(function () {
"use strict";
const N = window.NF;
const { icon, esc, DAYS, DAYL, TYPES, OPEN, CLOSE, fmt, fmtS, S, norm, mergeR, isFree, weekOf, first, initials, timeSelect, openPop, closePop, setDay, dirty } = N;

const O_NOTE = "Availability is a preference, not a guarantee: a manager can still schedule you when you've marked yourself unavailable.";
const oRange = ([a, b]) => `${fmt(a)} – ${fmt(b >= CLOSE ? 1440 : b)}`;
const shortRange = ([a, b]) => `${fmtS(a)} – ${fmtS(b >= CLOSE ? 1440 : b)}`;

function rowCells(d, i, edit) {
  if (d.all) return `<span class="o-chip">All day</span>`;
  if (S.mode === "types") {
    return `<span class="o-types">${TYPES.map((t) => { const on = d.t.includes(t.id); return edit ? `<button type="button" class="o-type" data-act="o-type" data-day="${i}" data-type="${t.id}" aria-pressed="${on}"><span class="o-box">${on ? icon("check", 11) : ""}</span>${t.name}</button>` : on ? `<span class="o-chip">${t.name}</span>` : ""; }).join("")}${!edit && !d.t.length ? "—" : ""}</span>`;
  }
  const chips = d.r.map((r, k) => `<span class="o-chip">${oRange(r)}${edit ? `<button type="button" data-act="o-del" data-day="${i}" data-k="${k}" aria-label="Remove">${icon("x", 12)}</button>` : ""}</span>`).join("");
  return edit ? `${chips}<button type="button" class="btn sm o-add" data-act="o-add" data-day="${i}">${icon("plus", 13)} Add hours</button>` : chips || "—";
}
function table(week, edit, phone) {
  const rows = DAYS.map((d, i) => {
    const day = week[i];
    const off = !isFree(day);
    return `<div class="o-row"><span class="o-day ${off ? "off" : ""}"><i></i>${phone ? DAYS[i] : DAYL[i]}</span><span class="o-cells">${rowCells(day, i, edit)}</span>${edit ? `<span><button type="button" class="switch o-sw" role="switch" aria-checked="${day.all}" data-act="o-all" data-day="${i}" aria-label="${DAYL[i]} all day"></button></span>` : ""}</div>`;
  }).join("");
  return `<div class="o-legend"><span><i class="o-dot"></i>Available</span><span><i class="o-dot red"></i>Unavailable</span></div>
    <div class="o-table ${edit ? "edit" : ""}"><div class="o-row hd"><span>Day</span><span>Unavailable</span>${edit ? "<span>All day</span>" : ""}</div>${rows}</div>`;
}
function card(ctx, phone) {
  const mine = ctx.where === "mine";
  return `<section class="card o-card ${phone ? "oph" : ""}"><div class="o-hd"><h2>Weekly availability</h2><span>${ctx.where === "onboard" ? "Not submitted" : "Submitted"}</span></div>
    ${mine ? `<div class="o-note">${O_NOTE}</div>` : ""}${table(S.week, true, phone)}
    ${mine ? `<div class="o-foot">Changes apply immediately and do not change assigned shifts. Your manager may miss the notification; tell them directly too. For temporary changes, request time off.</div>
    <div class="o-actions"><button type="button" class="btn quiet" data-act="discard" ${dirty() ? "" : "disabled"}>${icon("rotate", 14)} Discard</button><button type="button" class="btn go" data-act="save" ${dirty() ? "" : "disabled"}>${icon("save", 14)} Save</button></div>` : ""}</section>`;
}

N.variants.o = {
  name: "Original",
  frame: false,
  tr: {
    ad: "Bugünkü hâl",
    fikir: "Uygulamada bugün ne varsa o. Yeni tasarımları buna göre karşılaştır.",
    arti: "Tanıdık, basit tablo.",
    eksi: "Haftanın özeti yok; her gün için ayrı \"Add hours\" ve \"All day\". Çekmecede kırmızı (izin rengi) kullanılıyor. Onboarding \"müdür programı buna göre kurar\" diyor, sayfada \"garanti değil\" yazıyor. Schedule'da her atamada \"Schedule this shift anyway?\" kutusu çıkıyor. Çalışan kendi programında hiçbir işaret görmüyor.",
    dene: "Schedule ekranında açık Cuma vardiyasını Maria'ya sürükle: onay kutusu çıkar.",
  },
  editor: (ctx) => card(ctx, false),
  phoneEditor: (ctx) => card(ctx, true),
  readOnly(p) {
    return `<div class="o-ro"><div class="o-hd"><h2>Employee availability</h2><span>Submitted</span></div>${table(weekOf(p), false, false)}</div>`;
  },
  phoneReadOnly(p) { return `<div class="o-ro">${table(weekOf(p), false, true)}</div>`; },
  team(list) {
    const head = `<div class="o-tt-row hd"><span>Employee ${icon("chevU", 12)}</span>${DAYS.map((d) => `<span>${d.toUpperCase()}</span>`).join("")}</div>`;
    const rows = list.map((p) => {
      const w = weekOf(p);
      return `<div class="o-tt-row" data-act="person" data-id="${p.id}" role="button" tabindex="0"><span class="o-nm">${esc(p.name)}</span>${DAYS.map((_, i) => {
        const d = w && w[i];
        const txt = !d || isFree(d) ? "" : d.all ? "All day" : S.mode === "types" ? d.t.map((t) => N.TYPE[t].name).join(", ") : d.r.map(shortRange).join(", ");
        return `<span class="${txt ? "on" : ""}">${txt || "—"}</span>`;
      }).join("")}</div>`;
    }).join("");
    return `<div class="o-tt">${head}${rows}</div>`;
  },
  phoneTeam(list) {
    return `<div class="o-ptl">${list.map((p) => { const w = weekOf(p); return `<button type="button" class="o-pt" data-act="person" data-id="${p.id}"><b>${esc(p.name)}</b><span>${w ? "Submitted" : "Not submitted"}</span>${icon("chevR", 15)}</button>`; }).join("")}</div>`;
  },
  act(act, el) {
    const i = +el.dataset.day;
    const d = S.week[i];
    if (act === "o-all") { setDay(i, d.all ? N.blank() : { all: true }); return true; }
    if (act === "o-del") { const r = d.r.slice(); r.splice(+el.dataset.k, 1); setDay(i, { r, t: d.t }); return true; }
    if (act === "o-type") { const t = d.t.includes(el.dataset.type) ? d.t.filter((x) => x !== el.dataset.type) : d.t.concat(el.dataset.type); setDay(i, { r: d.r, t }); return true; }
    if (act === "o-add") {
      openPop(el, `<div class="pop-hd"><strong>${DAYL[i]}</strong><small>Unavailable hours</small></div><div class="pop-bd o-pop"><label>Start ${timeSelect('data-x="a"', 1080, { to: CLOSE - 30 })}</label><label>End ${timeSelect('data-x="b"', CLOSE, { from: OPEN + 30 })}</label></div><div class="pop-ft"><span class="grow"></span><button type="button" class="btn sm" data-x="cancel">Cancel</button><button type="button" class="btn go sm" data-x="ok">Add</button></div>`, (pop) => {
        pop.addEventListener("click", (e) => {
          const x = e.target.closest("[data-x]"); if (!x || x.tagName === "SELECT") return;
          if (x.dataset.x === "ok") { const a = +pop.querySelector('[data-x="a"]').value, b = +pop.querySelector('[data-x="b"]').value; closePop(); setDay(i, { r: mergeR(d.r.concat([[a, b]])), t: d.t }); return; }
          closePop();
        });
      });
      return true;
    }
    return false;
  },
};
})();
