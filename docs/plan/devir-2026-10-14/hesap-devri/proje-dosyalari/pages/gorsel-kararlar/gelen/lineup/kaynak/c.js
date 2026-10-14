/* Mockup C · Board: each location is a row of shift-type columns (Lunch | Dinner | Close), people are cards. */
(function () {
"use strict";
const NF = window.NF;
const { icon, esc } = NF;

function card(r, locked, k) {
  const drag = !locked && !r.called && !r.pending && r.emp;
  const cls = ["pc", r.called ? "called" : "", r.pending ? "pending" : "", !r.emp && !r.pending ? "open" : "", NF.isFlash(r.id) ? "flash" : ""].join(" ");
  return `<div class="${cls}" data-row="${r.id}" draggable="${drag ? "true" : "false"}">
    <div class="pc-top">${drag ? `<span class="pc-grip" tabindex="0" role="button" data-grip="${r.id}" aria-label="Drag to reorder. Alt plus arrow keys also move the card.">${icon("grip", 14)}</span>` : ""}
      <div class="pc-name">${NF.nameCell(r, locked, { dd: true })}</div>${NF.actionCell(r, locked, true)}</div>
    ${r.called ? `<div class="pc-called">Called off ${esc(r.called.at)} · ${esc(r.called.by)}</div>` : ""}
    <div class="pc-grid"><div>${NF.typeCell(r, locked)}</div><div>${NF.posCell(r, locked || r.called)}</div><div>${NF.timeCell(r, locked, { short: true })}</div><div>${NF.sectionCell(r, locked)}</div><div>${NF.labelCell(r, locked)}</div></div></div>`;
}

function column(k) {
  const { date, type } = NF.parseKey(k); const T = NF.TYPE[type], m = NF.meta(k);
  const st = NF.statusOf(k), locked = NF.isLocked(k);
  if (!NF.hasRows(k)) return `<div class="bd-col empty"><div class="bd-hd"><span class="lt-type" style="--t:${T.color}"><i></i>${esc(T.name)}</span><span class="ck-sub">${esc(NF.range(T.start, T.end))}</span></div><div class="bd-empty">No one is scheduled.${NF.isPast(k) ? "" : `<button type="button" class="addbtn" data-act="addstaff" data-k="${k}">${icon("plus", 14)} Add staff</button>`}</div></div>`;
  const g = NF.grouped(k);
  let body = "";
  if (g.pending.length) body += `<div class="bd-grp">New</div>` + g.pending.map((r) => card(r, locked, k)).join("");
  let dept = null, open = false;
  for (const grp of g.groups) {
    if (grp.dept !== dept) { if (open) body += `</div>`; dept = grp.dept; open = true; body += `<div class="bd-dbox"><div class="dept-hd">${esc(NF.DEPTS.find((d) => d.id === dept).name)}</div>`; }
    body += `<div class="bd-grp"><span class="jdot" style="background:${NF.JOB[grp.job].color}"></span>${esc(NF.JOB[grp.job].name)}${NF.jobAddBtn(k, grp.job, locked)}</div>` + grp.rows.map((r) => card(r, locked, k)).join("");
  }
  if (open) body += `</div>`;
  if (g.called.length) body += `<div class="bd-sep">Called off</div>` + g.called.map((r) => card(r, locked, k)).join("");
  // Mert 2026-10-13: no Publish on the shift header; publishing is done from the top Publish button
  const shareBtn = st === "shared" ? `<button type="button" class="tb-btn" data-act="unpub" data-k="${k}" title="Unpublish to edit">${icon("unlock", 14)} Edit</button>` : "";
  return `<section class="bd-col ${locked ? "is-locked" : ""} ${m.collapsed ? "is-collapsed" : ""}" id="lt-${k.replace(/\|/g, "-")}" style="--t:${T.color}">
    <div class="bd-hd" data-hd="${k}">
      <span class="lt-type" style="--t:${T.color}"><i></i>${esc(T.name)}</span>
      <span class="bd-acts">${locked || g.groups.length ? "" : `<button type="button" class="tb-btn icon" data-act="addstaff" data-k="${k}" aria-label="Add staff">${icon("plus", 15)}</button>`}${shareBtn}<button type="button" class="collapse xbtn" data-act="collapse" data-k="${k}" aria-expanded="${!m.collapsed}" aria-label="${m.collapsed ? "Expand" : "Collapse"}">${icon("chevD", 16)}</button></span>
      <div class="bd-hd2">${NF.statusPill(k)}<span style="margin-left:auto">${NF.ackSummary(k)}</span></div></div>
    ${m.collapsed ? "" : `<div class="lt-banners" style="padding:8px 10px 0">${NF.bannersFor(k)}</div><div class="bd-body">${body}</div>${NF.notesBlock(k, locked)}`}
  </section>`;
}

function cockpit() {
  const S = NF.S; NF.ensureDate(S.date);
  const keys = NF.visibleKeys();
  let html = NF.frozenTop();
  html += `<div style="padding:16px 20px 40px;display:flex;flex-direction:column;gap:22px">`;
  for (const L of NF.visibleLocs()) {
    const c = NF.closureOf(L.id, S.date);
    html += `<section class="loc-sec"><div class="loc-hd"><h2 style="--c:${L.color}"><i></i>${esc(L.name)}</h2><span>${esc(NF.dFull(S.date))}</span>${NF.locCount(L.id)}</div>`;
    if (c && c.kind === "closed") { html += NF.closedCard(L.id, S.date) + "</section>"; continue; }
    const cols = keys.filter((x) => NF.parseKey(x).loc === L.id);
    html += `<div class="bd-row">${cols.map(column).join("")}</div></section>`;
  }
  if (!NF.visibleLocs().length || !NF.visibleTypes().length) html += `<div class="empty-lt">Select at least one location and one shift in the filters to see lineups.</div>`;
  return html + `</div>`;
}

function phone() {
  const S = NF.S; const list = NF.phoneLineups(S.phoneEmp, S.phoneDate);
  const shared = list.filter((x) => x.mine);
  let inner = "";
  if (!shared.length) inner = NF.phoneEmpty(list);
  for (const x of shared) {
    const { loc, type, date } = NF.parseKey(x.k); const T = NF.TYPE[type]; const me = x.mine;
    const a = x.m.acks[S.phoneEmp]; const past = NF.isPast(x.k);
    inner += `<div class="bdp-hero"><div class="bdp-eyebrow">${esc(NF.dLong(date))} · ${esc(T.name)} · ${esc(NF.LOC[loc].short)}</div>
      <div class="bdp-time tnum">${esc(NF.range(me.start, me.end))}</div>
      <div class="bdp-meta">${esc(NF.JOB[me.job].name)}${me.section ? ` · ${esc(me.section)}` : ""}${me.labels.length ? ` · ${me.labels.map((l) => esc(NF.LABEL[l].name)).join(", ")}` : ""}</div>
      ${x.m.shared.ack ? (a ? `<div class="bdp-acked">${icon("check", 16)} Acknowledged ${esc(NF.fmt(a))}</div>` : past ? "" : `<button type="button" class="bdp-btn" data-act="ack" data-k="${x.k}">${icon("check", 16)} Acknowledge lineup</button>`) : ""}</div>
      ${NF.phoneState(x)}
      ${NF.phoneNotes(x.snap) ? `<div class="ph-notes">${NF.phoneNotes(x.snap)}</div>` : ""}
      <div class="ph-card" style="gap:6px"><h4>${icon("users", 17)} Who's on · ${x.snap.rows.length}</h4>${NF.phoneTeam(x)}</div>`;
  }
  const others = list.filter((x) => !x.mine && (x.called || x.notShared || x.removedText));
  if (shared.length && others.length) inner += NF.phoneEmpty(others);
  return NF.phoneShell(inner, { title: "Lineup" });
}

NF.variants.c = { name: "C · Board", cockpit, phone, minWidth: 1020 };
})();
