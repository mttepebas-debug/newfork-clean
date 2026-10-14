/* Publish window, five variants (Mert 2026-10-13). The one top Publish button manages everything:
   publish, unpublish, image and text for staff without the app, and the acknowledge switch.
   A switch at the bottom left picks the variant; "Original" is today's window. Mockup only. */
(function () {
"use strict";
const NF = window.NF;
const { icon, esc, S, TYPE, LOC, EMP } = NF;
const NAMES = { o: "Original", 1: "Panel", 2: "Instant", 3: "Steps", 4: "Preview", 5: "Dock" };
let V = "1";
try { V = localStorage.getItem("nf-pubv") || "1"; } catch (e) { /* storage blocked: keep the default */ }
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
  const acked = rec.filter((e) => m.acks[e]).length;
  let changes = 0;
  if (m.shared && st === "editing") {
    const old = new Map(m.shared.snap.rows.map((r) => [r.emp, sig(r)])); const now = new Map(rows.map((r) => [r.emp, sig(r)]));
    for (const [e, s] of now) if (old.get(e) !== s) changes++;
    for (const e of old.keys()) if (!now.has(e)) changes++;
  }
  return { k, T: TYPE[type], L: LOC[loc], st, past: st === "past", ready: st === "draft" || st === "editing", shared: st === "shared", editing: st === "editing",
    working: g.working, app, noApp, called: g.called.length, rec, acked, v: m.shared ? m.shared.v : 0, at: m.shared ? m.shared.at : null,
    ask: m.shared ? m.shared.ack !== false : ASK, changes, start: NF.startOf(k), groups: g.groups };
}
const all = () => NF.visibleKeys().filter(NF.hasRows).map(info);
const readyKeys = () => all().filter((i) => i.ready).map((i) => i.k);
function sum(keys) {
  const ppl = new Set(), noapp = new Set(); let changes = 0, called = 0;
  keys.map(info).forEach((i) => { i.app.forEach((e) => ppl.add(e)); i.noApp.forEach((e) => noapp.add(e)); changes += i.changes; called += i.called; });
  return { n: keys.length, ppl: ppl.size, noapp: [...noapp], changes, called };
}
const plural = (n, a, b) => `${n} ${n === 1 ? a : b || a + "s"}`;
const names = (list) => list.map((e) => EMP[e].name).join(", ");

/* ---------- actions ---------- */
function publish(keys) {
  keys = keys.filter((k) => !NF.isPast(k));
  if (!keys.length) return null;
  keys.forEach((k) => NF.doShare(k, { ack: ASK }));
  const s = sum(keys); const ppl = new Set(); keys.forEach((k) => NF.shareRecipients(k).forEach((e) => ppl.add(e)));
  if (ppl.has(S.phoneEmp)) { const k = keys.find((x) => NF.shareRecipients(x).includes(S.phoneEmp)); S.push = { k, at: Date.now() }; S.phoneDate = S.date; }
  NF.render();
  return { n: keys.length, ppl: ppl.size, noapp: s.noapp, keys };
}
function unpublish(k) { const m = NF.meta(k); if (!m.shared || NF.isPast(k)) return; m.shared.editing = true; NF.feed(`${TYPE[NF.parseKey(k).type].name} ${LOC[NF.parseKey(k).loc].short} unpublished for edits`, "info", k); NF.render(); }
function setAsk(on, keys) {
  ASK = on;
  (keys || []).forEach((k) => { const m = NF.meta(k); if (m.shared && !m.shared.editing && !NF.isPast(k)) m.shared.ack = on; });
  NF.render();
}
const image = (keys) => NF.openExport(keys, "image");
const text = (keys) => NF.openExport(keys, "text");

/* ---------- small parts ---------- */
const ch = (i) => `<i class="pv-ch" style="--t:${i.T.color}"></i>`;
const title = (i) => `<span class="pv-ttl">${ch(i)}<b>${esc(i.T.name)}</b><span>${esc(i.L.short)}</span></span>`;
function tag(i) {
  if (i.past) return `<span class="pv-tag past">Started</span>`;
  if (i.shared) return `<span class="pv-tag pub">Published v${i.v}</span>`;
  if (i.editing) return `<span class="pv-tag edit">Edited${i.changes ? ` · ${plural(i.changes, "change")}` : ""}</span>`;
  return `<span class="pv-tag draft">Draft</span>`;
}
function gauge(i, w = 60) {
  const n = i.rec.length || 1; const seg = Math.max(3, Math.min(10, n));
  const on = Math.round((i.acked / n) * seg);
  return `<span class="pv-gauge" title="${i.acked} of ${i.rec.length} acknowledged" style="width:${w}px">${Array.from({ length: seg }, (_, x) => `<i class="${x < on ? "on" : ""}"></i>`).join("")}</span><span class="pv-ackn">${i.acked}/${i.rec.length}</span>`;
}
const sw = (on, id = "") => `<button type="button" class="pv-sw" role="switch" aria-checked="${on}" data-pv="ask" ${id ? `id="${id}"` : ""}><span class="trk"></span><span>Ask staff to acknowledge</span></button>`;
const box = (on, dis) => `<span class="pv-box ${on ? "on" : ""} ${dis ? "dis" : ""}">${on ? icon("check", 11) : ""}</span>`;
const ghost = (act, ic, label, extra = "") => `<button type="button" class="pv-gh" data-pv="${act}" ${extra}>${icon(ic, 14)}<span>${label}</span></button>`;
function noAppLine(list, keys) {
  if (!list.length) return "";
  return `<div class="pv-noapp">${icon("alert", 14)}<span><b>${plural(list.length, "person")} without the app:</b> ${esc(names(list))}</span>
    <span class="pv-noapp-acts">${ghost("img", "image", "Image", `data-keys="${keys.join(",")}"`)}${ghost("txt", "copy", "Text", `data-keys="${keys.join(",")}"`)}</span></div>`;
}
const keysOf = (b) => (b.dataset.keys ? b.dataset.keys.split(",").filter(Boolean) : []);
function done(r, extra = "") {
  return `<div class="pv-done"><span class="pv-done-ic">${icon("check", 18)}</span><div><b>Published ${plural(r.n, "lineup")}</b>
    <p>${plural(r.ppl, "person", "people")} notified${ASK ? ", asked to acknowledge" : ""}. Changes from Shift Hub, time off and Schedule still reach them on their own.</p></div></div>
    ${noAppLine(r.noapp, r.keys)}${extra}`;
}

/* ================= 1 · PANEL — a small panel under the Publish button ================= */
function v1(anchor) {
  let picked = new Set(readyKeys()); let result = null;
  const html = () => {
    if (result) return `<div class="pv1">${done(result)}<div class="pv-ft"><span></span><button type="button" class="nf-btn" data-pv="close">Done</button></div></div>`;
    const list = all(); const sel = list.filter((i) => picked.has(i.k) && i.ready).map((i) => i.k); const s = sum(sel);
    return `<div class="pv1"><div class="pv-hd"><div><b>Publish</b><small>${esc(NF.dFull(S.date))}</small></div><button type="button" class="xbtn" data-pv="close" aria-label="Close">${icon("x", 16)}</button></div>
      <div class="pv-list">${list.map((i) => `<div class="pv-row ${i.past ? "dim" : ""}" ${i.ready ? `data-pick="${i.k}" role="checkbox" tabindex="0" aria-checked="${picked.has(i.k)}"` : ""}>
        ${i.ready ? box(picked.has(i.k)) : `<span class="pv-box ghost"></span>`}${title(i)}<span class="pv-mid">${tag(i)}</span>
        <span class="pv-end">${i.shared ? `${gauge(i)}<button type="button" class="pv-link" data-pv="unpub" data-k="${i.k}">Unpublish</button>` : i.past ? `<span class="pv-meta">${plural(i.working, "person", "people")}</span>` : `<span class="pv-meta">${plural(i.working, "person", "people")}</span>`}</span></div>`).join("") || `<div class="pv-empty">No lineups on screen for this day.</div>`}</div>
      <div class="pv-opts">${sw(ASK)}</div>
      <div class="pv-sum">${sel.length ? `<b>${plural(sel.length, "lineup")}</b> to <b>${plural(s.ppl, "person", "people")}</b>${s.noapp.length ? ` · ${s.noapp.length} without the app` : ""}${s.called ? ` · ${s.called} called off, left out` : ""}` : "Nothing selected. Published lineups stay as they are."}</div>
      <div class="pv-ft">${ghost("img", "image", "Image", `data-keys="${(sel.length ? sel : list.filter((i) => !i.past).map((i) => i.k)).join(",")}"`)}${ghost("txt", "copy", "Text", `data-keys="${(sel.length ? sel : list.filter((i) => !i.past).map((i) => i.k)).join(",")}"`)}
        <button type="button" class="nf-btn" data-pv="go" ${sel.length ? "" : "disabled"}>${icon("share", 14)} Publish${sel.length ? " " + sel.length : ""}</button></div></div>`;
  };
  NF.openPop(anchor, html(), (el) => {
    const draw = () => { el.innerHTML = html(); };
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-pv]"); const p = ev.target.closest("[data-pick]");
      if (b) {
        const a = b.dataset.pv;
        if (a === "close") return NF.closePop();
        if (a === "ask") { setAsk(!ASK, all().filter((i) => i.shared).map((i) => i.k)); return draw(); }
        if (a === "unpub") { unpublish(b.dataset.k); picked.add(b.dataset.k); return draw(); }
        if (a === "img") return image(keysOf(b));
        if (a === "txt") return text(keysOf(b));
        if (a === "go") { result = publish([...picked].filter((k) => info(k).ready)); return draw(); }
      }
      if (p) { const k = p.dataset.pick; picked.has(k) ? picked.delete(k) : picked.add(k); draw(); }
    });
    el.addEventListener("keydown", (ev) => { const p = ev.target.closest("[data-pick]"); if (p && (ev.key === " " || ev.key === "Enter")) { ev.preventDefault(); p.click(); } });
  }, { minWidth: 420 });
}

/* ================= 2 · INSTANT — one click publishes what is ready; a bar counts down with Undo and Manage ================= */
let bar = null, timer = null;
function closeBar() { clearInterval(timer); timer = null; if (bar) bar.remove(); bar = null; document.body.classList.remove("pv-bar-open"); }
function v2() {
  closeBar();
  bar = document.createElement("div"); bar.className = "pv2"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Publish");
  document.body.appendChild(bar); document.body.classList.add("pv-bar-open");
  let mode = "pending", pend = readyKeys(), left = 5, result = null, open = !pend.length;
  if (!pend.length) mode = "idle";
  const manage = () => `<div class="pv2-man"><div class="pv-list">${all().map((i) => `<div class="pv-row ${i.past ? "dim" : ""}">${title(i)}<span class="pv-mid">${tag(i)}</span><span class="pv-end">
      ${i.shared ? `${gauge(i)}<button type="button" class="pv-link" data-pv="unpub" data-k="${i.k}">Unpublish</button>` : i.ready && mode !== "pending" ? `<button type="button" class="pv-link strong" data-pv="one" data-k="${i.k}">Publish</button>` : i.ready ? `<span class="pv-meta">in this publish</span>` : `<span class="pv-meta">locked</span>`}
      ${!i.past ? `<span class="pv-icons">${`<button type="button" class="pv-ic" data-pv="img" data-keys="${i.k}" title="Image">${icon("image", 14)}</button><button type="button" class="pv-ic" data-pv="txt" data-keys="${i.k}" title="Text">${icon("copy", 14)}</button>`}</span>` : ""}</span></div>`).join("")}</div>
      <div class="pv-opts">${sw(ASK)}</div></div>`;
  const html = () => {
    let main = "";
    if (mode === "pending") { const s = sum(pend); main = `<span class="pv2-ring" style="--p:${(5 - left) / 5}"><span>${left}</span></span><span class="pv2-txt"><b>Publishing ${plural(s.n, "lineup")}</b> to ${plural(s.ppl, "person", "people")}${s.noapp.length ? ` · ${s.noapp.length} without the app` : ""}</span><button type="button" class="pv-gh strong" data-pv="undo">${icon("undo", 14)}<span>Undo</span></button>`; }
    else if (mode === "done") main = `<span class="pv-done-ic sm">${icon("check", 14)}</span><span class="pv2-txt"><b>Published ${plural(result.n, "lineup")}</b> · ${plural(result.ppl, "person", "people")} notified</span>${result.noapp.length ? `${ghost("img", "image", "Image", `data-keys="${result.keys.join(",")}"`)}${ghost("txt", "copy", "Text", `data-keys="${result.keys.join(",")}"`)}` : ""}`;
    else main = `<span class="pv2-txt"><b>Nothing new to publish.</b> Every lineup on screen is published or locked.</span>`;
    return `${open ? manage() : ""}<div class="pv2-main">${main}<button type="button" class="pv-gh" data-pv="man" aria-expanded="${open}">${icon(open ? "chevD" : "list", 14)}<span>${open ? "Hide" : "Manage"}</span></button><button type="button" class="xbtn" data-pv="close" aria-label="Close">${icon("x", 15)}</button></div>`;
  };
  const draw = () => { if (bar) bar.innerHTML = html(); };
  const commit = () => { clearInterval(timer); timer = null; result = publish(pend); mode = result ? "done" : "idle"; draw(); };
  if (mode === "pending") timer = setInterval(() => { left--; if (left <= 0) commit(); else draw(); }, 1000);
  draw();
  bar.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-pv]"); if (!b) return; const a = b.dataset.pv;
    if (a === "close") return closeBar();
    if (a === "undo") { clearInterval(timer); timer = null; mode = "idle"; NF.toast("Not published. Nobody was notified."); open = true; return draw(); }
    if (a === "man") { open = !open; return draw(); }
    if (a === "ask") { setAsk(!ASK, all().filter((i) => i.shared).map((i) => i.k)); return draw(); }
    if (a === "unpub") { unpublish(b.dataset.k); return draw(); }
    if (a === "one") { result = publish([b.dataset.k]); mode = "done"; return draw(); }
    if (a === "img") return image(keysOf(b));
    if (a === "txt") return text(keysOf(b));
  });
}

/* ================= 3 · STEPS — a small window: Choose → Check → Done ================= */
function v3() {
  let step = 1, picked = new Set(readyKeys()), result = null;
  const dots = () => `<ol class="pv3-steps">${["Choose", "Check", "Done"].map((t, x) => `<li class="${x + 1 === step ? "on" : x + 1 < step ? "past" : ""}"><span>${x + 1 < step ? icon("check", 11) : x + 1}</span>${t}</li>`).join("")}</ol>`;
  const body = () => {
    const list = all(); const sel = list.filter((i) => picked.has(i.k) && i.ready).map((i) => i.k);
    if (step === 1) return `<div class="pv-list">${list.map((i) => `<div class="pv-row ${i.past ? "dim" : ""}" ${i.ready ? `data-pick="${i.k}" role="checkbox" tabindex="0" aria-checked="${picked.has(i.k)}"` : ""}>
        ${i.ready ? box(picked.has(i.k)) : `<span class="pv-box ghost"></span>`}${title(i)}<span class="pv-mid">${tag(i)}</span><span class="pv-end">${i.shared ? `${gauge(i)}<button type="button" class="pv-link" data-pv="unpub" data-k="${i.k}">Unpublish</button>` : `<span class="pv-meta">${plural(i.working, "person", "people")}</span>`}</span></div>`).join("")}</div>
      <div class="pv-ft2">${ghost("img", "image", "Image", `data-keys="${list.filter((i) => !i.past).map((i) => i.k).join(",")}"`)}${ghost("txt", "copy", "Text", `data-keys="${list.filter((i) => !i.past).map((i) => i.k).join(",")}"`)}<span class="pv-hint">for staff without the app</span></div>`;
    if (step === 2) { const s = sum(sel); return `<div class="pv3-check">${sel.map(info).map((i) => `<div class="pv3-line">${title(i)}<span>${plural(i.app.length, "person", "people")} in the app${i.editing ? ` · <b>${plural(i.changes, "change")}</b> since v${i.v}` : ""}${i.called ? ` · ${i.called} called off` : ""}</span></div>`).join("")}</div>
      <div class="pv3-total"><span><b>${plural(s.ppl, "person", "people")}</b> get one notification each.</span>${sw(ASK)}</div>
      ${s.noapp.length ? `<div class="pv-noapp">${icon("alert", 14)}<span><b>${esc(names(s.noapp))}</b> ${s.noapp.length > 1 ? "don't" : "doesn't"} use the app. You can send an image or text on the next step.</span></div>` : ""}`; }
    return done(result);
  };
  const foot = () => {
    const sel = [...picked].filter((k) => info(k).ready);
    if (step === 1) return `<button type="button" class="nf-btn secondary" data-close>Cancel</button><button type="button" class="nf-btn" data-pv="next" ${sel.length ? "" : "disabled"}>Check ${sel.length || ""}</button>`;
    if (step === 2) return `<button type="button" class="nf-btn secondary" data-pv="back">Back</button><button type="button" class="nf-btn" data-pv="go">${icon("share", 14)} Publish ${sel.length}</button>`;
    return `<button type="button" class="nf-btn" data-close>Done</button>`;
  };
  NF.openModal(`<div class="pv3"><div class="modal-hd"><div><h2>Publish lineups</h2><p>${esc(NF.dFull(S.date))}</p></div><button type="button" class="xbtn" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="pv3-top"></div><div class="modal-bd pv3-bd"></div><div class="modal-ft pv3-ft"></div></div>`, (el) => {
    const draw = () => { el.querySelector(".pv3-top").innerHTML = dots(); el.querySelector(".pv3-bd").innerHTML = body(); el.querySelector(".pv3-ft").innerHTML = foot(); el.querySelectorAll("[data-close]").forEach((b) => (b.onclick = NF.closeModal)); };
    draw();
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-pv]"); const p = ev.target.closest("[data-pick]");
      if (b) {
        const a = b.dataset.pv;
        if (a === "next") { step = 2; return draw(); }
        if (a === "back") { step = 1; return draw(); }
        if (a === "go") { result = publish([...picked].filter((k) => info(k).ready)); step = 3; return draw(); }
        if (a === "ask") { setAsk(!ASK); return draw(); }
        if (a === "unpub") { unpublish(b.dataset.k); picked.add(b.dataset.k); return draw(); }
        if (a === "img") return image(keysOf(b));
        if (a === "txt") return text(keysOf(b));
      }
      if (p) { const k = p.dataset.pick; picked.has(k) ? picked.delete(k) : picked.add(k); draw(); }
    });
    el.querySelector(".modal").classList.add("pv3-modal");
  });
}

/* ================= 4 · PREVIEW — a side sheet that shows what staff will see ================= */
let sheet = null;
function closeSheet() { if (sheet) sheet.remove(); sheet = null; }
function v4() {
  closeSheet();
  const list0 = all(); let cur = (list0.find((i) => i.ready) || list0[0] || {}).k; let picked = new Set(readyKeys()); let result = null;
  sheet = document.createElement("div"); sheet.className = "pv4-back";
  sheet.innerHTML = `<aside class="pv4" role="dialog" aria-modal="true" aria-label="Publish lineups"></aside>`;
  document.body.appendChild(sheet);
  const preview = (i) => `<div class="pv4-phone"><div class="pv4-ph-hd">${ch(i)}<b>${esc(i.T.name)}</b><span>${esc(i.L.short)} · ${esc(NF.fmt(i.start))}</span></div>
    ${i.groups.map((g) => `<div class="pv4-job">${esc(NF.JOB[g.job].name)}</div>${g.rows.filter((r) => r.emp).map((r) => `<div class="pv4-p"><span class="pv4-av">${esc(NF.initials(EMP[r.emp].name))}</span><span>${esc(EMP[r.emp].name)}${EMP[r.emp].app ? "" : ` <em>no app</em>`}</span><span class="pv4-t">${esc(NF.rangeShort(r.start, r.end))}</span></div>`).join("")}`).join("")}</div>`;
  const html = () => {
    const list = all(); const i = list.find((x) => x.k === cur) || list[0];
    const sel = list.filter((x) => picked.has(x.k) && x.ready).map((x) => x.k); const s = sum(sel);
    return `<div class="pv4-hd"><div><b>Publish</b><small>${esc(NF.dFull(S.date))}</small></div><button type="button" class="xbtn" data-pv="close" aria-label="Close">${icon("x", 16)}</button></div>
      <div class="pv4-tabs" role="tablist">${list.map((x) => `<button type="button" role="tab" aria-selected="${x.k === cur}" data-cur="${x.k}" class="${x.past ? "dim" : ""}">${ch(x)}<span>${esc(x.T.name)}</span><small>${esc(x.L.short)}</small>${x.ready ? box(picked.has(x.k)) : x.shared ? `<span class="pv4-lock">${icon("lock", 11)}</span>` : ""}</button>`).join("")}</div>
      ${result ? `<div class="pv4-body">${done(result)}</div>` : i ? `<div class="pv4-body">
        <div class="pv4-state">${tag(i)}${i.shared ? `<span class="pv4-g">${gauge(i, 80)}</span>` : ""}<span class="pv4-acts">
          ${i.ready ? `<button type="button" class="pv-link strong" data-pick="${i.k}">${picked.has(i.k) ? "Leave out" : "Include"}</button>` : ""}
          ${i.shared ? `<button type="button" class="pv-link" data-pv="unpub" data-k="${i.k}">Unpublish</button>` : ""}
          ${!i.past ? `<button type="button" class="pv-ic" data-pv="img" data-keys="${i.k}" title="Image">${icon("image", 14)}</button><button type="button" class="pv-ic" data-pv="txt" data-keys="${i.k}" title="Text">${icon("copy", 14)}</button>` : ""}</span></div>
        <div class="pv4-cap">What staff see</div>${preview(i)}
        ${i.noApp.length ? `<div class="pv-noapp">${icon("alert", 14)}<span><b>${esc(names(i.noApp))}</b> ${i.noApp.length > 1 ? "don't" : "doesn't"} use the app. Send the image or text.</span></div>` : ""}</div>` : `<div class="pv4-body"><div class="pv-empty">No lineups on screen.</div></div>`}
      <div class="pv4-ft">${sw(ASK)}<div class="pv4-go"><span>${sel.length ? `${plural(sel.length, "lineup")} · ${plural(s.ppl, "person", "people")}` : "Nothing selected"}</span>
        ${result ? `<button type="button" class="nf-btn" data-pv="close">Done</button>` : `<button type="button" class="nf-btn" data-pv="go" ${sel.length ? "" : "disabled"}>${icon("share", 14)} Publish${sel.length ? " " + sel.length : ""}</button>`}</div></div>`;
  };
  const el = sheet.querySelector(".pv4"); const draw = () => { el.innerHTML = html(); };
  draw();
  sheet.addEventListener("mousedown", (e) => { if (e.target === sheet) closeSheet(); });
  el.addEventListener("click", (ev) => {
    const c = ev.target.closest("[data-cur]"); const b = ev.target.closest("[data-pv]"); const p = ev.target.closest("[data-pick]");
    if (c && ev.target.closest(".pv-box")) { const k = c.dataset.cur; if (info(k).ready) { picked.has(k) ? picked.delete(k) : picked.add(k); } return draw(); }
    if (c) { cur = c.dataset.cur; result = null; return draw(); }
    if (p) { const k = p.dataset.pick; picked.has(k) ? picked.delete(k) : picked.add(k); return draw(); }
    if (!b) return; const a = b.dataset.pv;
    if (a === "close") return closeSheet();
    if (a === "ask") { setAsk(!ASK, all().filter((i) => i.shared).map((i) => i.k)); return draw(); }
    if (a === "unpub") { unpublish(b.dataset.k); picked.add(b.dataset.k); return draw(); }
    if (a === "img") return image(keysOf(b));
    if (a === "txt") return text(keysOf(b));
    if (a === "go") { result = publish([...picked].filter((k) => info(k).ready)); return draw(); }
  });
  el.querySelector("button") && el.querySelector("button").focus();
}

/* ================= 5 · DOCK — publish mode on the page: pick lineups in a bar, the cards light up ================= */
let dock = null, dockPick = new Set();
function closeDock() { if (dock) dock.remove(); dock = null; document.body.classList.remove("pv-dock-open"); paintCards(); }
function paintCards() {
  let st = document.getElementById("pv5-style"); if (!st) { st = document.createElement("style"); st.id = "pv5-style"; document.head.appendChild(st); }
  st.textContent = dock ? [...dockPick].map((k) => `#lt-${k.replace(/\|/g, "-")}{outline:2px solid var(--theme-accent);outline-offset:3px}`).join("") : "";
}
function v5() {
  if (dock) return closeDock();
  dockPick = new Set(readyKeys()); let result = null, menu = null;
  dock = document.createElement("div"); dock.className = "pv5"; dock.setAttribute("role", "region"); dock.setAttribute("aria-label", "Publish");
  document.body.appendChild(dock); document.body.classList.add("pv-dock-open");
  const html = () => {
    const list = all(); const sel = list.filter((i) => dockPick.has(i.k) && i.ready).map((i) => i.k); const s = sum(sel);
    const chips = list.map((i) => `<span class="pv5-chipw"><button type="button" class="pv5-chip ${i.ready && dockPick.has(i.k) ? "on" : ""} ${i.past ? "dim" : ""} ${i.shared ? "pub" : ""}" data-chip="${i.k}" aria-pressed="${i.ready && dockPick.has(i.k)}" ${i.past ? "disabled" : ""}>
        ${ch(i)}<span>${esc(i.T.name)}</span><small>${esc(i.L.short)}</small>${i.shared ? `<span class="pv5-st">${icon("lock", 11)} ${i.acked}/${i.rec.length}</span>` : i.editing ? `<span class="pv5-st edit">edited</span>` : ""}</button>
        ${menu === i.k ? `<span class="pv5-menu">${i.shared ? `<button type="button" data-pv="unpub" data-k="${i.k}">${icon("unlock", 14)} Unpublish</button>` : ""}<button type="button" data-pv="img" data-keys="${i.k}">${icon("image", 14)} Image</button><button type="button" data-pv="txt" data-keys="${i.k}">${icon("copy", 14)} Text</button></span>` : ""}</span>`).join("");
    if (result) return `<div class="pv5-in done"><span class="pv-done-ic sm">${icon("check", 14)}</span><span class="pv5-msg"><b>Published ${plural(result.n, "lineup")}</b> · ${plural(result.ppl, "person", "people")} notified${result.noapp.length ? ` · ${result.noapp.length} without the app` : ""}</span>
      ${result.noapp.length ? `${ghost("img", "image", "Image", `data-keys="${result.keys.join(",")}"`)}${ghost("txt", "copy", "Text", `data-keys="${result.keys.join(",")}"`)}` : ""}<button type="button" class="nf-btn" data-pv="close">Done</button></div>`;
    return `<div class="pv5-in"><div class="pv5-chips">${chips}</div><span class="pv5-sep"></span>${sw(ASK)}<span class="pv5-sep"></span>
      <span class="pv5-sum">${sel.length ? `<b>${plural(s.ppl, "person", "people")}</b>${s.noapp.length ? ` · ${s.noapp.length} no app` : ""}` : "Pick lineups"}</span>
      <button type="button" class="pv-ic" data-pv="img" data-keys="${(sel.length ? sel : list.filter((i) => !i.past).map((i) => i.k)).join(",")}" title="Image">${icon("image", 15)}</button><button type="button" class="pv-ic" data-pv="txt" data-keys="${(sel.length ? sel : list.filter((i) => !i.past).map((i) => i.k)).join(",")}" title="Text">${icon("copy", 15)}</button>
      <button type="button" class="nf-btn secondary" data-pv="close">Cancel</button><button type="button" class="nf-btn" data-pv="go" ${sel.length ? "" : "disabled"}>${icon("share", 14)} Publish${sel.length ? " " + sel.length : ""}</button></div>`;
  };
  const draw = () => { if (!dock) return; dock.innerHTML = html(); paintCards(); };
  draw();
  dock.addEventListener("click", (ev) => {
    const c = ev.target.closest("[data-chip]"); const b = ev.target.closest("[data-pv]");
    if (b) {
      const a = b.dataset.pv; menu = null;
      if (a === "close") return closeDock();
      if (a === "ask") { setAsk(!ASK, all().filter((i) => i.shared).map((i) => i.k)); return draw(); }
      if (a === "unpub") { unpublish(b.dataset.k); dockPick.add(b.dataset.k); return draw(); }
      if (a === "img") { draw(); return image(keysOf(b)); }
      if (a === "txt") { draw(); return text(keysOf(b)); }
      if (a === "go") { result = publish([...dockPick].filter((k) => info(k).ready)); dockPick.clear(); return draw(); }
    }
    if (c) { const k = c.dataset.chip; const i = info(k); if (i.ready && !ev.shiftKey) { dockPick.has(k) ? dockPick.delete(k) : dockPick.add(k); menu = null; } else menu = menu === k ? null : k; draw(); }
  });
  dock.addEventListener("contextmenu", (ev) => { const c = ev.target.closest("[data-chip]"); if (c) { ev.preventDefault(); menu = menu === c.dataset.chip ? null : c.dataset.chip; draw(); } });
}

/* ---------- variant switch + the Publish button ---------- */
const OPEN = { 1: v1, 2: v2, 3: v3, 4: v4, 5: v5 };
function closeAll() { NF.closePop(); NF.closeModal(); closeBar(); closeSheet(); if (dock) closeDock(); }
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest('[data-act="share"]');
  if (!b || V === "o") return;
  e.stopPropagation(); e.preventDefault();
  if (V !== "5") closeAll();
  OPEN[V](b);
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeBar(); closeSheet(); if (dock) closeDock(); } });
function switcher() {
  const el = document.createElement("div"); el.className = "pv-switch"; el.setAttribute("role", "group"); el.setAttribute("aria-label", "Publish window variant");
  const draw = () => {
    el.innerHTML = `<span>Publish window</span>${Object.keys(NAMES).map((k) => `<button type="button" aria-pressed="${V === k}" data-v="${k}">${k === "o" ? "Original" : `${k} · ${NAMES[k]}`}</button>`).join("")}`;
    document.body.classList.toggle("pv-new", V !== "o");
  };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]"); if (!b) return;
    V = b.dataset.v; try { localStorage.setItem("nf-pubv", V); } catch (er) { /* fine */ }
    closeAll(); draw();
    const pubBtn = document.querySelector('[data-act="share"]');
    if (pubBtn) { if (V === "o") NF.openShare(null); else OPEN[V](pubBtn); }
  });
  draw(); document.body.appendChild(el);
}
switcher();
})();
