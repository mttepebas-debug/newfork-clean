p = "/mnt/project-files/pages/gorsel-kararlar/gelen/vardiya-degisim/index.html"
s = open(p, encoding="utf-8").read()
def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (a[:60], s.count(a))
    s = s.replace(a, b)

# --- data: what each row needs to say who takes which shift, where, and by when ---
rep('''    { id: "r1", kind: "Pickup", who: "Maria Lopez", shift: "Fri, Oct 16 · 4p–10p", status: ["3 want it", "amber"], since: "2 h", loc: "Downtown" },
    { id: "r2", kind: "Cover", who: "Maria Lopez", shift: "Sat, Oct 17 · 11a–5p", status: ["2 accepted", "amber"], since: "40 min", loc: "Downtown" },
    { id: "r3", kind: "Swap", who: "Priya Shah ⇄ Daniel Brooks", shift: "Sun, Oct 18 ⇄ Tue, Oct 20", status: ["Needs decision", "amber"], since: "5 h", loc: "Downtown ⇄ Midtown" },
    { id: "r4", kind: "Pickup", who: "Leo Park", shift: "Thu, Oct 15 · 4p–10p", status: ["Approved", "green"], since: "Yesterday", loc: "Downtown" },
  ];''',
'''    { id: "r1", kind: "Pickup", owner: "Maria Lopez", sh: { day: "Fri, Oct 16", start: "4:00 PM", range: "4–10 PM", job: "Server", loc: "Downtown" }, due: ["Fri, Oct 16, 12:00 PM", "Fri, 12:00 PM"], status: ["3 want it", "amber"], since: "2 h" },
    { id: "r2", kind: "Cover", owner: "Maria Lopez", sh: { day: "Sat, Oct 17", start: "11:00 AM", range: "11 AM–5 PM", job: "Server", loc: "Downtown" }, due: ["Sat, Oct 17, 7:00 AM", "Sat, 7:00 AM"], status: ["2 accepted", "amber"], since: "40 min" },
    { id: "r3", kind: "Swap", due: ["Sun, Oct 18, 11:00 AM", "Sun, 11:00 AM"], status: ["Needs decision", "amber"], since: "5 h" },
    { id: "r4", kind: "Pickup", owner: "Ana Torres", taker: "Leo Park", sh: { day: "Thu, Oct 15", start: "4:00 PM", range: "4–10 PM", job: "Server", loc: "Downtown" }, status: ["Approved", "green"], since: "Yesterday" },
  ];''')
rep('''{ owner: "Priya Shah", to: "Daniel Brooks", dow: "Sun", date: "Oct 18", time: "3:00 – 11:00 PM",''',
    '''{ owner: "Priya Shah", to: "Daniel Brooks", dow: "Sun", date: "Oct 18", time: "3:00 – 11:00 PM", start: "3:00 PM", range: "3–11 PM",''')
rep('''{ owner: "Daniel Brooks", to: "Priya Shah", dow: "Tue", date: "Oct 20", time: "5:00 – 11:00 PM",''',
    '''{ owner: "Daniel Brooks", to: "Priya Shah", dow: "Tue", date: "Oct 20", time: "5:00 – 11:00 PM", start: "5:00 PM", range: "5–11 PM",''')
rep('mgrOpen: null, mgrPick: null, mgrArmed: false, mgrDecl: false, mgrDone: {},',
    'mgrOpen: null, mgrPick: null, mgrArmed: false, mgrDecl: false, mgrDone: {}, mgrTaker: {},')
rep('if (d.mgr === "approve") { S.mgrDone[S.mgrOpen] = "approved"; render(); return; }',
    'if (d.mgr === "approve") { S.mgrDone[S.mgrOpen] = "approved"; if (S.mgrPick) S.mgrTaker[S.mgrOpen] = S.mgrPick; render(); return; }')

# --- one text model for the desktop row and the phone card ---
old_table = s[s.index("  function tableHtml() {"):s.index("  // A swap across two locations is approved only when both managers approve.")]
new_table = '''  // Every row says, starting with the person who would work the shift: who, whose shift,
  // when, where, and by when the manager decides (shift start − 4 h; earliest shift in a swap).
  // Desktop: one full sentence. Phone: a short sentence, then one line per shift.
  const B = (n) => `<b>${n}</b>`;
  const pos = (n) => `${n}’s`;
  function reqText(r, narrow) {
    const d = S.mgrDone[r.id];
    if (r.kind === "Swap") {
      const [a, b] = SW_SHIFTS;
      const lead = `${B(a.to)} and ${B(b.to)} ${d === "declined" ? "asked to swap shifts." : d ? "are swapping shifts." : "would like to swap shifts."}`;
      const lines = SW_SHIFTS.map((x) => narrow
        ? `${B(first(x.to))} takes ${x.dow}, ${x.date} · ${x.range} · ${I.pin}${x.loc}`
        : `${B(first(x.to))} takes ${pos(first(x.owner))} ${x.start} ${x.job} shift at ${x.loc} on ${x.dow}, ${x.date}.`);
      const foot = d === "declined" ? "Declined by you just now. Both keep their shifts." : d ? "You approved. Marcus Green decides for Midtown." : narrow ? `Decide by ${r.due[1]}` : `Review the details and decide by ${r.due[0]}.`;
      return { lead, lines, foot };
    }
    const sh = r.sh;
    const cands = (CANDS[r.id] || []).filter((c) => !c.off);
    const taker = r.taker || (d === "approved" && (cands.find((c) => c.id === S.mgrTaker[r.id]) || cands[0]).name);
    const others = cands.length - 1;
    const who = taker ? B(taker) : others === 1 ? `${B(cands[0].name)} and ${B(cands[1].name)}` : `${B(cands[0].name)} and ${others} others`;
    const verb = taker ? (r.kind === "Cover" ? "is covering" : "picked up")
      : r.kind === "Cover" ? (d ? "offered to cover" : "have offered to cover")
      : d ? "asked to pick up" : "would like to pick up";
    const whose = `${B(pos(r.owner))}`;
    const lead = narrow ? `${who} ${verb} ${whose} ${sh.job} shift.` : `${who} ${verb} ${whose} ${sh.start} ${sh.job} shift at ${sh.loc} on ${sh.day}.`;
    const lines = narrow ? [`${sh.day} · ${sh.range} · ${I.pin}${sh.loc}`] : [];
    const foot = r.taker ? "Approved by you yesterday."
      : d === "declined" ? `Declined by you just now. ${first(r.owner)} keeps the shift.`
      : d ? "Approved by you just now."
      : narrow ? `Decide by ${r.due[1]}` : `Review the details and decide by ${r.due[0]}.`;
    return { lead, lines, foot };
  }
  const kindName = (r) => r.kind === "Cover" ? "Cover request" : r.kind === "Swap" ? "Shift swap" : "Shift pickup";
  function tableHtml() {
    return `<table class="list rq"><thead><tr><th class="ic"><span class="sr">Type</span></th><th>Request</th><th>Status</th><th>Waiting</th></tr></thead><tbody>${REQS.map((r) => { const d = S.mgrDone[r.id]; const s = d ? decided(r, d) : r.status; const t = reqText(r, false); return `<tr data-row="${r.id}" tabindex="0"><td class="ic">${kindIcon(r, 28)}<span class="sr">${kindName(r)}</span></td><td class="rq-t"><span class="lead">${t.lead}</span>${t.lines.map((l) => `<span class="ln">${l}</span>`).join("")}<span class="due">${t.foot}</span></td><td><span class="chip" data-tone="${s[1]}">${s[0]}</span></td><td>${r.since}</td></tr>`; }).join("")}</tbody></table>`;
  }
  function cardHtml(r) {
    const d = S.mgrDone[r.id]; const s = d ? decided(r, d) : r.status; const t = reqText(r, true);
    return `<button type="button" class="rc" data-row="${r.id}" aria-label="${kindName(r)}">${kindIcon(r, 40)}<span class="lead">${t.lead}</span>${t.lines.map((l) => `<span class="ln">${l}</span>`).join("")}<span class="ft"><span class="chip" data-tone="${s[1]}">${s[0]}</span><span>${t.foot}</span></span></button>`;
  }
'''
s = s.replace(old_table, new_table)
rep('''<div class="mlist">${REQS.map((r) => { const d = S.mgrDone[r.id]; const s = d ? decided(r, d) : r.status; return `<button type="button" class="lc" data-row="${r.id}">${kindIcon(r, 40)}<span class="t">${r.who}</span><span class="s">${[r.kind, r.how].filter(Boolean).join(" · ")}<br>${r.shift}</span><span class="r"><span class="chip" data-tone="${s[1]}">${s[0]}</span></span></button>`; }).join("")}</div>''',
    '''<div class="mlist">${REQS.map(cardHtml).join("")}</div>''')

# --- CSS ---
rep('table.list td:nth-child(3) { color: var(--theme-text); font-weight: 600; }\n', '')
rep('.ki.s40 { grid-row: span 2; width: 40px; height: 40px; border-radius: 10px; }',
'''.ki.s40 { width: 40px; height: 40px; border-radius: 10px; }
/* Request rows: the sentence starts with who would work the shift (Mert, 2026-10-14 00:28Z, 00:30Z) */
table.list.rq td { vertical-align: top; padding-top: 12px; padding-bottom: 12px; }
table.list.rq td.ic { padding-top: 10px; }
table.list.rq td:nth-child(3), table.list.rq td:nth-child(4) { white-space: nowrap; width: 1%; }
table.list.rq td:nth-child(3) { padding-top: 11px; }
.rq-t { display: grid; gap: 3px; max-width: 560px; }
.rq-t .lead { color: var(--theme-text); font-size: 13.5px; line-height: 1.45; }
.rq-t .lead b, .rq-t .ln b { font-weight: 600; }
.rq-t .ln { color: var(--theme-text); font-size: 13px; line-height: 1.45; }
.rq-t .due { color: var(--theme-muted); font-size: 12.5px; }
.rc { display: grid; grid-template-columns: 40px minmax(0, 1fr); column-gap: 12px; row-gap: 3px; align-items: start; padding: 12px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-surface); text-align: left; width: 100%; cursor: pointer; font: inherit; color: var(--theme-text); }
.rc:hover { border-color: var(--theme-border-hover); }
.rc .ki { grid-row: 1 / span 4; }
.rc > :not(.ki) { grid-column: 2; min-width: 0; }
.rc .lead { font-size: 14px; line-height: 1.4; }
.rc .lead b, .rc .ln b { font-weight: 600; }
.rc .ln { display: flex; align-items: center; flex-wrap: wrap; column-gap: 0; font-size: 12.5px; line-height: 1.5; color: var(--theme-text-secondary); font-variant-numeric: tabular-nums; }
.rc .ln b { color: var(--theme-text); margin-right: .3em; }
.rc .ln svg, .rq-t .ln svg { margin: 0 2px 0 0; flex: none; color: var(--theme-muted); }
.rc .ft { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; margin-top: 5px; font-size: 12px; color: var(--theme-muted); }''')
open(p, "w", encoding="utf-8").write(s)
print("ok")
