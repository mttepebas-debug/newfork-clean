/* Publish panel (Mert 2026-10-13): one small window tied to the top Publish button, in the
   style of the Schedule top-right menus. It manages publish, unpublish, image and text for
   staff without the app, and the acknowledge switch. "Original" is the earlier centred window
   for comparison. The earlier five variants are kept in yedek/publish-5-varyant. Mockup only. */
(function () {
"use strict";
const NF = window.NF;
const { icon, esc, S, TYPE, LOC, EMP } = NF;
let V = "n";
try { V = localStorage.getItem("nf-pubv2") || "n"; } catch (e) { /* storage blocked: keep the default */ }
let ASK = true;

/* ---------- data ---------- */
const sig = (r) => [r.job, r.start, r.end, r.section || "", (r.labels || []).join(",")].join("|");
function info(k) {
  const { loc, type } = NF.parseKey(k); const g = NF.grouped(k); const m = NF.meta(k); const st = NF.statusOf(k);
  const rows = g.groups.flatMap((x) => x.rows).filter((r) => r.emp);
  const uniq = (a) => [...new Set(a)];
  const app = uniq(rows.filter((r) => EMP[r.emp].app).map((r) => r.emp));
  const noApp = uniq(rows.filter((r) => !EMP[r.emp].app).map((r) => r.emp));
  const rec = m.shared ? NF.shareRecipients(k) : [];
  let changes = 0;
  if (m.shared && st === "editing") {
    const old = new Map(m.shared.snap.rows.map((r) => [r.emp, sig(r)])); const now = new Map(rows.map((r) => [r.emp, sig(r)]));
    for (const [e, s] of now) if (old.get(e) !== s) changes++;
    for (const e of old.keys()) if (!now.has(e)) changes++;
  }
  return { k, loc, T: TYPE[type], L: LOC[loc], past: st === "past", ready: st === "draft" || st === "editing", shared: st === "shared", editing: st === "editing",
    working: g.working, app, noApp, rec, acked: rec.filter((e) => m.acks[e]).length, changes };
}
const all = () => NF.visibleKeys().filter(NF.hasRows).map(info);
const plural = (n, a, b) => `${n} ${n === 1 ? a : b || a + "s"}`;
function people(keys) {
  const app = new Set(), noApp = new Set();
  keys.map(info).forEach((i) => { i.app.forEach((e) => app.add(e)); i.noApp.forEach((e) => noApp.add(e)); });
  return { app: app.size, noApp: noApp.size };
}

/* ---------- actions ---------- */
function publish(keys) {
  keys = keys.filter((k) => !NF.isPast(k));
  keys.forEach((k) => NF.doShare(k, { ack: ASK }));
  const ppl = new Set(); keys.forEach((k) => NF.shareRecipients(k).forEach((e) => ppl.add(e)));
  if (ppl.has(S.phoneEmp)) { const k = keys.find((x) => NF.shareRecipients(x).includes(S.phoneEmp)); S.push = { k, at: Date.now() }; S.phoneDate = S.date; }
  NF.render();
  return { n: keys.length, ppl: ppl.size };
}
function unpublish(k) {
  const m = NF.meta(k); if (!m.shared || NF.isPast(k)) return;
  m.shared.editing = true;
  NF.feed(`${TYPE[NF.parseKey(k).type].name} ${LOC[NF.parseKey(k).loc].short} unpublished for edits`, "info", k);
  NF.render();
}
function setAsk(on) {
  ASK = on;
  all().filter((i) => i.shared).forEach((i) => { NF.meta(i.k).shared.ack = on; });
  NF.render();
}

/* ---------- the panel ---------- */
function openPanel(anchor) {
  const picked = new Set(all().filter((i) => i.ready).map((i) => i.k));
  let armed = null, armTimer = 0, result = null;

  const meta = (i) => {
    if (i.past) return `<span class="lp-meta">Started</span>`;
    if (i.shared) return `<span class="lp-meta pub">${icon("check", 12)} Published · ${i.acked}/${i.rec.length}</span>`;
    if (i.editing) return `<span class="lp-meta edit">Unpublished${i.changes ? ` · ${plural(i.changes, "change")}` : ""}</span>`;
    return `<span class="lp-meta">${plural(i.working, "person", "people")}</span>`;
  };
  const row = (i) => {
    const on = i.ready && picked.has(i.k);
    const lead = i.ready
      ? `<span class="lp-box ${on ? "on" : ""}" aria-hidden="true">${on ? icon("check", 11) : ""}</span>`
      : `<span class="lp-box ghost" aria-hidden="true"></span>`;
    const tool = i.shared ? `<button type="button" class="lp-unpub ${armed === i.k ? "armed" : ""}" data-lp="unpub" data-k="${i.k}">${armed === i.k ? "Unpublish?" : "Unpublish"}</button>` : "";
    const tag = i.ready ? "button" : "div";
    return `<div class="lp-row ${i.past ? "dim" : ""}"><${tag} ${i.ready ? `type="button" role="checkbox" aria-checked="${on}" data-lp="pick" data-k="${i.k}"` : ""} class="lp-pick">
      ${lead}<i class="lp-ch" style="--t:${i.T.color}"></i><span class="lp-name">${esc(i.T.name)}</span>${meta(i)}</${tag}>${tool}</div>`;
  };
  const html = () => {
    const list = all(); const locs = [...new Set(list.map((i) => i.loc))];
    const sel = list.filter((i) => i.ready && picked.has(i.k)).map((i) => i.k);
    const out = people(sel); const forCopy = sel.length ? sel : list.filter((i) => !i.past).map((i) => i.k);
    const noApp = people(forCopy).noApp;
    const body = list.length ? locs.map((l) => `<div class="lp-hd2">${esc(LOC[l].short)}</div>${list.filter((i) => i.loc === l).map(row).join("")}`).join("")
      : `<div class="lp-empty">No lineups for this day.</div>`;
    const foot = result
      ? `<span class="lp-sum ok">${icon("check", 14)} Published ${plural(result.n, "lineup")} · ${plural(result.ppl, "person", "people")} notified</span><button type="button" class="nf-btn sm" data-lp="close">Done</button>`
      : `<span class="lp-sum">${sel.length ? `${plural(sel.length, "lineup")} · ${plural(out.app, "person", "people")}` : "Nothing to publish"}</span><button type="button" class="nf-btn sm" data-lp="go" ${sel.length ? "" : "disabled"}>${icon("share", 13)} Publish${sel.length ? " " + sel.length : ""}</button>`;
    return `<div class="lp" aria-label="Publish lineups">
      <div class="lp-top"><strong>Publish lineups</strong><small>${esc(NF.dLong(S.date))}</small></div>
      <div class="lp-list">${body}</div>
      <div class="lp-sep"></div>
      <button type="button" class="lp-item" role="switch" aria-checked="${ASK}" data-lp="ask"><span>Ask staff to acknowledge</span><span class="lp-sw" aria-hidden="true"></span></button>
      <button type="button" class="lp-item" data-lp="img" data-keys="${forCopy.join(",")}" ${forCopy.length ? "" : "disabled"}>${icon("image", 14)}<span>Share as image</span>${noApp ? `<small>${noApp} without the app</small>` : ""}</button>
      <button type="button" class="lp-item" data-lp="txt" data-keys="${forCopy.join(",")}" ${forCopy.length ? "" : "disabled"}>${icon("copy", 14)}<span>Copy as text</span></button>
      <div class="lp-ft">${foot}</div></div>`;
  };
  let el = null;
  const draw = () => { if (el && document.contains(el)) el.innerHTML = html(); };
  NF.openPop(anchor, html(), (pop) => {
    el = pop;
    pop.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-lp]"); if (!b || b.disabled) return;
      const a = b.dataset.lp; const k = b.dataset.k;
      if (a !== "unpub") armed = null;
      if (a === "pick") { picked.has(k) ? picked.delete(k) : picked.add(k); result = null; return draw(); }
      if (a === "unpub") {
        // destructive: two clicks, like ConfirmButton
        if (armed !== k) { armed = k; clearTimeout(armTimer); armTimer = setTimeout(() => { armed = null; draw(); }, 4000); return draw(); }
        armed = null; unpublish(k); picked.add(k); result = null;
        NF.toast(`Unpublished. Staff can't see ${TYPE[NF.parseKey(k).type].name} until you publish again.`);
        return draw();
      }
      if (a === "ask") { setAsk(!ASK); return draw(); }
      if (a === "img" || a === "txt") { const keys = b.dataset.keys.split(",").filter(Boolean); NF.closePop(); return NF.openExport(keys, a === "img" ? "image" : "text"); }
      if (a === "go") { const keys = [...picked].filter((x) => info(x).ready); result = publish(keys); keys.forEach((x) => picked.delete(x)); return draw(); }
      if (a === "close") return NF.closePop();
    });
  }, { align: "end" });
}

/* ---------- the Publish button + the mockup switch ---------- */
// a second press on Publish closes the panel (window capture runs before the outside-click closer)
let wasOpen = false;
window.addEventListener("mousedown", (e) => { wasOpen = !!(e.target.closest && e.target.closest('[data-act="share"]') && document.querySelector(".pop .lp")); }, true);
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest('[data-act="share"]');
  if (!b || V === "o") return;
  e.stopPropagation(); e.preventDefault();
  if (wasOpen) { wasOpen = false; return; }
  openPanel(b);
}, true);
function switcher() {
  const el = document.createElement("div"); el.className = "pv-switch"; el.setAttribute("role", "group"); el.setAttribute("aria-label", "Publish window");
  const draw = () => {
    el.innerHTML = `<span>Publish window</span>${[["n", "New"], ["o", "Original"]].map(([k, t]) => `<button type="button" aria-pressed="${V === k}" data-v="${k}">${t}</button>`).join("")}`;
  };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]"); if (!b) return;
    V = b.dataset.v; try { localStorage.setItem("nf-pubv2", V); } catch (er) { /* fine */ }
    NF.closePop(); NF.closeModal(); draw();
    const pubBtn = document.querySelector('[data-act="share"]');
    if (pubBtn) { if (V === "o") NF.openShare(null); else openPanel(pubBtn); }
  });
  draw(); document.body.appendChild(el);
}
switcher();
})();
