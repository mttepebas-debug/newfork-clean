/* Mockup A · List: closest to today's list pages. Lineups stacked per location, one table per shift type. */
(function () {
"use strict";
const NF = window.NF;
const { icon, esc } = NF;

function cockpit() {
  const S = NF.S; NF.ensureDate(S.date);
  const keys = NF.visibleKeys();
  let html = NF.frozenTop();
  html += `<div style="padding:18px 24px 40px;display:flex;flex-direction:column;gap:26px">`;
  const locs = NF.visibleLocs();
  if (!locs.length || !NF.visibleTypes().length) html += `<div class="empty-lt">Select at least one location and one shift in the filters to see lineups.</div>`;
  for (const L of locs) {
    const c = NF.closureOf(L.id, S.date);
    html += `<section class="loc-sec"><div class="loc-hd"><h2 style="--c:${L.color}"><i></i>${esc(L.name)}</h2><span>${esc(NF.dFull(S.date))}</span>${NF.locCount(L.id)}</div>`;
    if (c && c.kind === "closed") { html += NF.closedCard(L.id, S.date) + "</section>"; continue; }
    for (const k of keys.filter((x) => NF.parseKey(x).loc === L.id)) html += NF.hasRows(k) ? NF.lineupCard(k) : NF.emptyLineup(k);
    html += `</section>`;
  }
  return html + `</div>`;
}

function phone() {
  const S = NF.S; const list = NF.phoneLineups(S.phoneEmp, S.phoneDate);
  const shared = list.filter((x) => x.mine);
  let inner = "";
  if (!shared.length) inner = NF.phoneEmpty(list);
  for (const x of shared) {
    const { loc, type, date } = NF.parseKey(x.k); const T = NF.TYPE[type];
    const me = x.mine;
    // Mert 2026-10-13: the shift badge is four lines (type - job, location, time, labels - section); no header above it
    const extra = [me.labels.map((l) => esc(NF.LABEL[l].name)).join(", "), me.section ? esc(me.section) : ""].filter(Boolean).join(" – ");
    inner += `<div class="ph-card">
      <div class="ph-badge" style="--t:${T.color};background:#f1f6ee;border-radius:12px;padding:12px 14px">
        <div class="pb-l1"><i></i><b>${esc(T.name)} – ${esc(NF.JOB[me.job].name)}</b></div>
        <div class="pb-loc">${NF.icon("pin", 13)}${esc(NF.LOC[loc].short)}</div>
        <div class="pb-time tnum">${esc(NF.range(me.start, me.end))}</div>
        ${extra ? `<div class="pb-extra">${extra}</div>` : ""}</div>
      ${NF.phoneState(x)}
      ${NF.phoneAck(x)}
      ${NF.phoneNotes(x.snap) ? `<div class="ph-notes">${NF.phoneNotes(x.snap)}</div>` : ""}
      <div><div class="ph-team-grp" style="padding-top:0">Team · ${x.snap.rows.length}</div>${NF.phoneTeam(x)}</div>
      <div class="ph-sub">Published ${esc(NF.fmt(x.m.shared.at))} by ${esc(x.m.shared.by)}</div></div>`;
  }
  const others = list.filter((x) => !x.mine && (x.called || x.notShared || x.removedText));
  if (shared.length && others.length) inner += NF.phoneEmpty(others);
  return NF.phoneShell(inner);
}

NF.variants.a = { name: "A · List", cockpit, phone, minWidth: 1020 };
})();
