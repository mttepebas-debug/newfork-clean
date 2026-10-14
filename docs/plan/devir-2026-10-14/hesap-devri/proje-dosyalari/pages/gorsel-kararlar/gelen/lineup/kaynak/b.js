/* Mockup B · Cockpit: a day overview rail (status, read receipts, what needs attention, live feed) next to dense lineup tables. */
(function () {
"use strict";
const NF = window.NF;
const { icon, esc } = NF;

function rail() {
  const S = NF.S; const keys = NF.visibleKeys();
  let html = `<div class="ck-rail"><div class="ck-block"><div class="ck-h">Today at a glance</div>`;
  for (const L of NF.visibleLocs()) {
    const c = NF.closureOf(L.id, S.date);
    html += `<div class="ck-loc"><div class="ck-locname"><i style="background:${L.color}"></i>${esc(L.short)}${c && c.kind === "short" ? `<span class="pill editing" style="margin-left:auto">Short hours</span>` : ""}</div>`;
    if (c && c.kind === "closed") { html += `<div class="ck-item" style="cursor:default"><span class="pill closed">Closed</span><span class="ck-sub">${esc(c.title)}</span></div></div>`; continue; }
    for (const k of keys.filter((x) => NF.parseKey(x).loc === L.id)) {
      const T = NF.TYPE[NF.parseKey(k).type];
      if (!NF.hasRows(k)) { html += `<div class="ck-item dim"><span class="lt-type" style="--t:${T.color};font-size:12.5px"><i></i>${esc(T.name)}</span><span class="ck-sub" style="margin-left:auto">No one</span></div>`; continue; }
      const g = NF.grouped(k), st = NF.statusOf(k), m = NF.meta(k);
      const ids = NF.shareRecipients(k); const n = ids.filter((e) => m.acks[e]).length;
      const dot = { draft: "#9aa7a1", shared: "#087f5b", editing: "#b45309", past: "#59645f" }[st];
      html += `<button type="button" class="ck-item" data-act="focus" data-k="${k}">
        <span class="lt-type" style="--t:${T.color};font-size:12.5px"><i></i>${esc(T.name)}</span><span class="ck-sub">${esc(NF.fmtShort(NF.startOf(k)))}</span>
        <span class="ck-st" style="--d:${dot}"><i></i>${st === "draft" ? "Draft" : st === "shared" ? "v" + m.shared.v : st === "editing" ? "Editing" : "Past"}</span>
        <span class="ck-meta">${g.working}${g.open ? ` <b style="color:var(--theme-availability-text)">+${g.open} open</b>` : ""}${g.called.length ? ` <b style="color:var(--theme-danger-strong)">${g.called.length} off</b>` : ""}${m.shared && m.shared.ack && ids.length ? `<span class="ackbar" style="width:40px"><i style="width:${Math.round((n / ids.length) * 100)}%"></i></span>` : ""}</span></button>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  // what needs attention
  const att = [];
  for (const k of keys) {
    if (!NF.hasRows(k) || NF.isPast(k)) continue;
    const { loc, type } = NF.parseKey(k); const name = `${NF.TYPE[type].name} ${NF.LOC[loc].short}`;
    const g = NF.grouped(k), m = NF.meta(k);
    if (g.open) att.push({ k, t: `${g.open} open shift${g.open > 1 ? "s" : ""}`, s: name, c: "warn" });
    if (NF.statusOf(k) === "draft") att.push({ k, t: "Not published yet", s: `${name} · starts ${NF.fmt(NF.startOf(k))}`, c: "" });
    const ids = NF.shareRecipients(k); const wait = ids.filter((e) => !m.acks[e]).length;
    if (m.shared && m.shared.ack && wait && NF.statusOf(k) === "shared") att.push({ k, t: `${wait} not acknowledged`, s: name, c: "" });
    const noapp = g.groups.flatMap((x) => x.rows).filter((r) => r.emp && !NF.EMP[r.emp].app).length;
    if (noapp && NF.statusOf(k) === "shared") att.push({ k, t: `${noapp} without app`, s: `${name} · send photo or text`, c: "" });
  }
  html += `<div class="ck-block"><div class="ck-h">Needs attention <span>${att.length}</span></div>${att.length ? att.map((a) => `<button type="button" class="ck-att ${a.c}" data-act="focus" data-k="${a.k}"><b>${esc(a.t)}</b><span>${esc(a.s)}</span></button>`).join("") : `<div class="ck-sub" style="padding:4px 2px">All clear.</div>`}</div>`;
  html += `<div class="ck-block"><div class="ck-h"><span class="live-pill" style="padding:0"><i></i>Live</span><span>${S.feed.length}</span></div>${S.feed.length ? S.feed.slice(0, 12).map((f) => `<div class="ck-feed ${f.kind}"><time>${esc(f.at)}</time><span>${esc(f.text)}</span></div>`).join("") : `<div class="ck-sub" style="padding:4px 2px;line-height:1.45">Changes from Schedule, Shift Hub, time off and Important Dates appear here as they happen. Try "Live events (demo)" at the top.</div>`}</div>`;
  return html + `</div>`;
}

function cockpit() {
  const S = NF.S; NF.ensureDate(S.date);
  const keys = NF.visibleKeys();
  let html = NF.frozenTop();
  html += `<div class="ck-grid">${rail()}<div class="ck-center">`;
  for (const L of NF.visibleLocs()) {
    const c = NF.closureOf(L.id, S.date);
    html += `<section class="loc-sec"><div class="loc-hd"><h2 style="--c:${L.color}"><i></i>${esc(L.name)}</h2><span>${esc(NF.dFull(S.date))}</span>${NF.locCount(L.id)}</div>`;
    if (c && c.kind === "closed") { html += NF.closedCard(L.id, S.date) + "</section>"; continue; }
    for (const k of keys.filter((x) => NF.parseKey(x).loc === L.id)) html += NF.hasRows(k) ? NF.lineupCard(k, { compact: true, ackCol: true }) : NF.emptyLineup(k);
    html += `</section>`;
  }
  if (!NF.visibleLocs().length || !NF.visibleTypes().length) html += `<div class="empty-lt">Select at least one location and one shift in the filters to see lineups.</div>`;
  return html + `</div></div>`;
}

function phone() {
  const S = NF.S; const list = NF.phoneLineups(S.phoneEmp, S.phoneDate);
  const shared = list.filter((x) => x.mine);
  let inner = "";
  if (!shared.length) inner = NF.phoneEmpty(list);
  for (const x of shared) {
    const { loc, type } = NF.parseKey(x.k); const T = NF.TYPE[type]; const me = x.mine;
    const tab = S.phoneTab[x.k] || "me";
    const notes = NF.phoneNotes(x.snap);
    inner += `<div class="ph-card" style="gap:10px">
      <div style="display:flex;align-items:center;gap:8px"><span class="lt-type" style="--t:${T.color};font-size:16px"><i></i>${esc(T.name)}</span><span class="ph-sub" style="margin-left:auto">${esc(NF.LOC[loc].short)}</span></div>
      ${NF.phoneState(x)}
      <div class="share-scope" role="tablist" style="width:100%;display:grid;grid-template-columns:repeat(3,1fr)">${[["me", "My shift"], ["team", `Team · ${x.snap.rows.length}`], ["notes", "Notes"]].map(([t, l]) => `<button type="button" role="tab" aria-pressed="${tab === t}" aria-selected="${tab === t}" data-act="phtab" data-k="${x.k}" data-t="${t}">${esc(l)}</button>`).join("")}</div>
      ${tab === "me" ? `<div style="display:flex;flex-direction:column;gap:10px;padding:4px 2px">
          <div class="ckp-kv"><span>Time</span><b class="tnum">${esc(NF.range(me.start, me.end))}</b></div>
          <div class="ckp-kv"><span>Position</span><b>${esc(NF.JOB[me.job].name)}</b></div>
          <div class="ckp-kv"><span>Section</span><b>${me.section ? esc(me.section) : "—"}</b></div>
          ${me.labels.length ? `<div class="ckp-kv"><span>Label</span><b>${me.labels.map((l) => esc(NF.LABEL[l].name)).join(", ")}</b></div>` : ""}
          <div class="ckp-kv"><span>Team</span><b>${x.snap.rows.length} people</b></div></div>` : ""}
      ${tab === "team" ? `<div>${NF.phoneTeam(x)}</div>` : ""}
      ${tab === "notes" ? (notes ? `<div class="ph-notes">${notes}</div>` : `<div class="ph-sub">No notes for this shift.</div>`) : ""}
      ${NF.phoneAck(x)}</div>`;
  }
  const others = list.filter((x) => !x.mine && (x.called || x.notShared || x.removedText));
  if (shared.length && others.length) inner += NF.phoneEmpty(others);
  return NF.phoneShell(inner, { title: "Today's lineup" });
}

NF.variants.b = { name: "B · Cockpit", cockpit, phone, minWidth: 1020 };
})();
