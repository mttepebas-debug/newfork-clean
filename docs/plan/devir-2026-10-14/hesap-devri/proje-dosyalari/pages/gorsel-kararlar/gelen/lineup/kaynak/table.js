/* The lineup table card used by mockups A (List) and B (Cockpit). */
(function () {
"use strict";
const NF = window.NF;
const { icon, esc } = NF;

NF.lineupCard = function (k, opts = {}) {
  const { date, loc, type } = NF.parseKey(k);
  const T = NF.TYPE[type], L = NF.LOC[loc], m = NF.meta(k);
  const st = NF.statusOf(k), locked = NF.isLocked(k), g = NF.grouped(k);
  const ackCol = opts.ackCol && m.shared && m.shared.ack;
  const cols = 7 + (ackCol ? 1 : 0) + 1;
  const row = (r) => {
    const drag = !locked && !r.called && !r.pending && r.emp;
    const cls = ["row", r.called ? "called" : "", r.pending ? "pending" : "", !r.emp && !r.pending ? "open" : "", NF.isFlash(r.id) ? "flash" : ""].join(" ");
    const ack = ackCol ? `<td>${r.emp && !r.called && m.shared.snap.rows.some((x) => x.emp === r.emp) ? (NF.EMP[r.emp].app ? (m.acks[r.emp] ? `<span class="acked" title="${esc(NF.fmt(m.acks[r.emp]))}">${icon("check", 15)}</span>` : '<span class="muted">—</span>') : '<span class="noapp">Photo</span>') : ""}</td>` : "";
    return `<tr class="${cls}" data-row="${r.id}" draggable="${drag ? "true" : "false"}">
      <td class="grip">${drag ? `<span tabindex="0" role="button" data-grip="${r.id}" aria-label="Drag to reorder. Alt plus arrow keys also move the row." title="Drag to reorder">${icon("grip", 15)}</span>` : ""}</td>
      <td>${NF.nameCell(r, locked, { noAck: !!ackCol, dd: true })}${r.called ? `<div style="font-size:10.5px;color:#9b5048;font-weight:650;padding-top:1px">Called off ${esc(r.called.at)} · ${esc(r.called.by)}</div>` : ""}</td>
      <td>${NF.typeCell(r, locked)}</td><td>${NF.posCell(r, locked || r.called)}</td><td class="tcol">${NF.timeCell(r, locked, { short: !!opts.compact })}</td><td>${NF.labelCell(r, locked)}</td><td>${NF.sectionCell(r, locked)}</td>${ack}
      <td>${NF.actionCell(r, locked, opts.compact)}</td></tr>`;
  };
  // Mert 2026-10-13: each department wraps its jobs in its own framed table
  const blocks = [];
  if (g.pending.length) blocks.push({ cls: "new", title: "New rows", sub: "Pick a position first to see only people with that job", body: g.pending.map(row).join("") });
  let cur = null;
  for (const grp of g.groups) {
    if (!cur || cur.dept !== grp.dept) { cur = { dept: grp.dept, title: NF.DEPTS.find((d) => d.id === grp.dept).name, body: "", n: 0 }; blocks.push(cur); }
    cur.n += grp.rows.length;
    cur.body += `<tr class="grp"><td colspan="${cols}"><div class="grp-in"><span><span class="jdot" style="background:${NF.JOB[grp.job].color}"></span>${esc(NF.JOB[grp.job].name)}</span>${NF.jobAddBtn(k, grp.job, locked)}</div></td></tr>` + grp.rows.map(row).join("");
  }
  if (!g.groups.length && !g.pending.length) blocks.push({ cls: "none", title: "", body: `<tr><td colspan="${cols}" style="color:var(--theme-muted);height:52px;padding-left:16px">No one is working this shift.</td></tr>` });
  if (g.called.length) blocks.push({ cls: "off", title: "Not working today · called off", n: g.called.length, body: g.called.map(row).join("") });
  // Mert 2026-10-13: Name stays left; the other columns share the rest almost evenly and nothing is cut with "…"
  // In–Out gets a fixed width that fits two typed times; the rest split what is left evenly
  const colgroup = `<colgroup><col style="width:30px"><col style="width:200px"><col><col><col style="width:158px"><col><col>${ackCol ? "<col>" : ""}<col></colgroup>`;
  const thead = `<thead><tr><th></th><th>Name</th><th>Shift</th><th>Position</th><th class="tcol">In – Out</th><th>Label</th><th>Section</th>${ackCol ? "<th>Read</th>" : ""}<th>Call off</th></tr></thead>`;
  // Mert 2026-10-13: one column header row per shift, on the first table only
  const tables = blocks.map((b, i) => `<div class="dept-tbl ${b.cls || ""}">${b.title ? `<div class="dept-hd">${esc(b.title)}${b.sub ? `<small>${esc(b.sub)}</small>` : ""}</div>` : ""}
      <div class="lt-scroll"><table class="lt ${ackCol ? "has-ack" : ""}">${colgroup}${i === 0 ? thead : ""}<tbody>${b.body}</tbody></table></div></div>`).join("");
  // Mert 2026-10-13: no Publish on the shift header; publishing is done from the top Publish button
  const shareBtn = st === "shared" ? `<button type="button" class="tb-btn" data-act="unpub" data-k="${k}" title="Unpublish to edit">${icon("unlock", 14)} Edit</button>` : "";
  const id = "lt-" + k.replace(/\|/g, "-");
  return `<section class="lt-card ${locked ? "is-locked" : ""} ${m.collapsed ? "is-collapsed" : ""}" id="${id}" style="--t:${T.color}" aria-label="${esc(T.name)} lineup, ${esc(L.name)}">
    <div class="lt-hd" data-hd="${k}">
      <span class="lt-title"><span class="lt-type" style="--t:${T.color}"><i></i>${esc(T.name)}</span>${NF.statusPill(k)}</span>
      <span class="lt-actions">${NF.ackSummary(k)}${locked || g.groups.length ? "" : `<button type="button" class="tb-btn" data-act="addstaff" data-k="${k}">${icon("plus", 14)} Add staff</button>`}${shareBtn}<button type="button" class="collapse" data-act="collapse" data-k="${k}" aria-expanded="${!m.collapsed}" aria-label="${m.collapsed ? "Expand" : "Collapse"}">${icon("chevD", 18)}</button></span></div>
    ${m.collapsed ? "" : `<div class="lt-body"><div class="lt-banners">${NF.bannersFor(k)}</div>
      <div class="dept-stack">${tables}</div>
      ${NF.notesBlock(k, locked)}</div>`}
  </section>`;
};

NF.emptyLineup = function (k) {
  // Mert 2026-10-13: an empty shift is as tall as a collapsed lineup, in the same card
  const { type } = NF.parseKey(k); const T = NF.TYPE[type]; const locked = NF.isPast(k);
  return `<section class="lt-card is-collapsed is-empty" style="--t:${T.color}"><div class="lt-hd">
    <span class="lt-type" style="--t:${T.color}"><i></i>${esc(T.name)}</span><span class="empty-note">No one is scheduled.</span>
    <span class="lt-actions">${locked ? "" : `<button type="button" class="tb-btn" data-act="addstaff" data-k="${k}">${icon("plus", 14)} Add staff</button>`}<span class="collapse-ph" aria-hidden="true"></span></span></div></section>`;
};
})();
