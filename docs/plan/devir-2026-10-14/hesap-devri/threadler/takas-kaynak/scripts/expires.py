p = "/mnt/project-files/pages/gorsel-kararlar/gelen/vardiya-degisim/index.html"
s = open(p, encoding="utf-8").read()
def rep(x, y, n=1):
    global s
    assert s.count(x) == n, (x[:80], s.count(x))
    s = s.replace(x, y)

NOTE = "Family dinner came up. Section 4 is usually busy, thanks!"
# --- data: expiry (shift start − 4 h) and hours left from the mockup's "now" (Tue, Oct 13, 9:00 AM) ---
rep('''    { id: "r1", kind: "Pickup", owner: "Maria Lopez", sh: { day: "Fri, Oct 16", start: "4:00 PM", range: "4–10 PM", job: "Server", loc: "Downtown" }, due: ["Fri, Oct 16, 12:00 PM", "Fri, 12:00 PM"], status: ["3 want it", "amber"], since: "2 h" },
    { id: "r2", kind: "Cover", owner: "Maria Lopez", sh: { day: "Sat, Oct 17", start: "11:00 AM", range: "11 AM–5 PM", job: "Server", loc: "Downtown" }, due: ["Sat, Oct 17, 7:00 AM", "Sat, 7:00 AM"], status: ["2 accepted", "amber"], since: "40 min" },
    { id: "r3", kind: "Swap", due: ["Sun, Oct 18, 11:00 AM", "Sun, 11:00 AM"], status: ["Needs decision", "amber"], since: "5 h" },
    { id: "r4", kind: "Pickup", owner: "Ana Torres", taker: "Leo Park", sh: { day: "Thu, Oct 15", start: "4:00 PM", range: "4–10 PM", job: "Server", loc: "Downtown" }, status: ["Approved", "green"], since: "Yesterday" },
  ];''',
'''    // Rows come soonest-expiring first. A request expires 4 h before its shift (the earlier
    // shift in a swap); in its last 12 h the time turns red (Mert, 2026-10-14 08:30Z).
    { id: "r5", kind: "Pickup", owner: "Chris Walker", sh: { day: "Tue, Oct 13", start: "6:00 PM", range: "6–11 PM", job: "Server", loc: "Midtown" }, tk: { dow: "Tue", date: "Oct 13", day: 13, mon: "Oct", hrs: "5 h", job: "Server", time: "6:00 PM – 11:00 PM", loc: "Midtown", when: "Today" }, due: ["Today, 2:00 PM", "today, 2:00 PM"], left: 5, status: ["1 wants it", "amber"] },
    { id: "r1", kind: "Pickup", owner: "Maria Lopez", note: "''' + NOTE + '''", sh: { day: "Fri, Oct 16", start: "4:00 PM", range: "4–10 PM", job: "Server", loc: "Downtown" }, tk: SHIFT, due: ["Fri, Oct 16, 12:00 PM", "Fri, 12:00 PM"], left: 75, status: ["3 want it", "amber"] },
    { id: "r2", kind: "Cover", owner: "Maria Lopez", note: "''' + NOTE + '''", sh: { day: "Sat, Oct 17", start: "11:00 AM", range: "11 AM–5 PM", job: "Server", loc: "Downtown" }, tk: { dow: "Sat", date: "Oct 17", day: 17, mon: "Oct", hrs: "6 h", job: "Server", time: "11:00 AM – 5:00 PM", loc: "Downtown", when: "In 4 days" }, due: ["Sat, Oct 17, 7:00 AM", "Sat, 7:00 AM"], left: 94, status: ["2 accepted", "amber"] },
    { id: "r3", kind: "Swap", due: ["Sun, Oct 18, 11:00 AM", "Sun, 11:00 AM"], left: 122, status: ["Needs decision", "amber"] },
    { id: "r4", kind: "Pickup", owner: "Ana Torres", taker: "Leo Park", sh: { day: "Thu, Oct 15", start: "4:00 PM", range: "4–10 PM", job: "Server", loc: "Downtown" }, status: ["Approved", "green"] },
  ];''')
rep('''      { id: "leo", name: "Leo Park", s: "Declined", off: true },
    ],
  };''', '''      { id: "leo", name: "Leo Park", s: "Declined", off: true },
    ],
    r5: [
      { id: "sam", name: "Sam Reed", s: "Asked 30 min ago", rows: [["ok", "Hours", "5 h that day · 34 h this week"], ["ok", "Days in a row", "Day 3 in a row"], ["ok", "Rest", "15 h since his last shift · 10 h needed"], ["ok", "Availability", "Available Tuesday"]] },
    ],
  };''')

# --- sentence model: the deadline moves to its own column; phone says "Expires …" ---
rep('''      const foot = narrow
        ? (d === "declined" ? "Both keep their own shifts." : d ? "You approved." : `Decide by ${r.due[1]}`)
        : (d === "declined" ? "Daniel and Priya keep their own shifts. Declined by you just now." : d ? "You approved. Marcus Green decides for Midtown." : `Decide by ${r.due[0]}.`);
      return { lead, lines, foot };''',
'''      const foot = narrow
        ? (d === "declined" ? "Both keep their own shifts." : d ? "You approved." : `Expires ${r.due[1]}`)
        : (d === "declined" ? "Daniel and Priya keep their own shifts. Declined by you just now." : d ? "You approved. Marcus Green decides for Midtown." : "");
      return { lead, lines, foot, soon: narrow && !d && r.left <= 12 };''')
rep('''    const when = r.taker ? "Approved by you yesterday." : d === "declined" ? "Declined by you just now." : d ? "Approved by you just now." : `Decide by ${r.due[0]}.`;
    const foot = narrow ? (taker || d === "declined" ? result : `Decide by ${r.due[1]}`) : `${result} ${when}`;
    return { lead, lines, foot };''',
'''    const when = r.taker ? " Approved by you yesterday." : d === "declined" ? " Declined by you just now." : d ? " Approved by you just now." : "";
    const foot = narrow ? (taker || d === "declined" ? result : `Expires ${r.due[1]}`) : result + when;
    return { lead, lines, foot, soon: narrow && !d && !r.taker && r.left <= 12 };''')
rep('''  function tableHtml() {
    return `<table class="list rq"><thead><tr><th class="ic"><span class="sr">Type</span></th><th>Request</th><th>Status</th><th>Waiting</th></tr></thead><tbody>${REQS.map((r) => { const d = S.mgrDone[r.id]; const s = d ? decided(r, d) : r.status; const t = reqText(r, false); return `<tr data-row="${r.id}" tabindex="0"><td class="ic">${kindIcon(r, 40)}<span class="sr">${kindName(r)}</span></td><td><div class="rq-t"><span class="lead">${t.lead}</span>${t.lines.map((l) => `<span class="ln">${l}</span>`).join("")}<span class="due">${t.foot}</span></div></td><td><span class="chip" data-tone="${s[1]}">${s[0]}</span></td><td>${r.since}</td></tr>`; }).join("")}</tbody></table>`;
  }''',
'''  // Expires: when the request closes on its own; red in its last 12 h. A decided request has none
  // (a swap one manager approved still waits for the other, so it keeps its time).
  function expCell(r) {
    const d = S.mgrDone[r.id];
    const open = !r.taker && (!d || (r.kind === "Swap" && d === "approved"));
    return open ? `<span class="exp ${r.left <= 12 ? "soon" : ""}">${r.due[0]}</span>` : `<span class="exp none" aria-hidden="true">—</span><span class="sr">No expiry</span>`;
  }
  function tableHtml() {
    return `<table class="list rq"><thead><tr><th class="ic"><span class="sr">Type</span></th><th>Request</th><th>Status</th><th>Expires</th></tr></thead><tbody>${REQS.map((r) => { const d = S.mgrDone[r.id]; const s = d ? decided(r, d) : r.status; const t = reqText(r, false); return `<tr data-row="${r.id}" tabindex="0"><td class="ic">${kindIcon(r, 40)}<span class="sr">${kindName(r)}</span></td><td><div class="rq-t"><span class="lead">${t.lead}</span>${t.lines.map((l) => `<span class="ln">${l}</span>`).join("")}${t.foot ? `<span class="due">${t.foot}</span>` : ""}</div></td><td><span class="chip" data-tone="${s[1]}">${s[0]}</span></td><td>${expCell(r)}</td></tr>`; }).join("")}</tbody></table>`;
  }''')
rep('''<span class="ft"><span class="chip" data-tone="${s[1]}">${s[0]}</span><span>${t.foot}</span></span>''',
    '''<span class="ft"><span class="chip" data-tone="${s[1]}">${s[0]}</span><span class="${t.soon ? "soon" : ""}">${t.foot}</span></span>''')

# --- drawer: driven by the row's data instead of r1 / r2 ---
rep('''    const shift = r.id === "r1" ? SHIFT : { dow: "Sat", date: "Oct 17", day: 17, mon: "Oct", hrs: "6 h", job: "Server", time: "11:00 AM – 5:00 PM", loc: "Downtown", when: "In 4 days" };''',
    '''    const shift = r.tk;
    const owner = first(r.owner);
    const asked = list.length > 1 ? "everyone who asked" : first(list[0].name);''')
rep('''    let body = `${ticket(shift, dir("Maria", pick ? first(pick.name) : "?"))}${quote("Maria", "Family dinner came up. Section 4 is usually busy, thanks!")}
      <p class="w-label with-chip">${r.id === "r1" ? "Who wants it" : "Who accepted"}''',
    '''    let body = `${ticket(shift, dir(owner, pick ? first(pick.name) : "?"))}${r.note ? quote(owner, r.note) : ""}
      <p class="w-label with-chip">${r.kind === "Cover" ? "Who accepted" : "Who wants it"}''')
rep('''    if (done) foot = meta(done === "approved" ? `Approved. ${first(pick.name)} has the shift; Maria and everyone else were told.` : "Declined. Maria and everyone who asked were told.", done === "approved" ? "done" : "")''',
    '''    if (done) foot = meta(done === "approved" ? `Approved. ${first(pick.name)} works it instead of ${owner}; ${list.length > 1 ? `${owner} and everyone else were told` : `both were told`}.` : `Declined. ${owner} and ${asked} were told.`, done === "approved" ? "done" : "")''')
rep('''    else if (S.mgrDecl) { body = ticket(shift, dir("Maria", "?")) + declineStep("Maria and everyone who asked"); foot = `<button type="button" class="btn" data-mgr="back">Back</button><button type="button" class="btn no ${S.mgrArmed ? "armed" : ""}" data-mgr="confirm">${S.mgrArmed ? "Confirm decline" : r.id === "r1" ? "Decline pickup" : "Decline cover"}</button>`; }
    else foot = band + meta(r.id === "r1" ? "Decide by Oct 16, 12:00 PM" : "Decide by Oct 17, 7:00 AM")''',
    '''    else if (S.mgrDecl) { body = ticket(shift, dir(owner, "?")) + declineStep(`${owner} and ${asked}`); foot = `<button type="button" class="btn" data-mgr="back">Back</button><button type="button" class="btn no ${S.mgrArmed ? "armed" : ""}" data-mgr="confirm">${S.mgrArmed ? "Confirm decline" : r.kind === "Cover" ? "Decline cover" : "Decline pickup"}</button>`; }
    else foot = band + meta(`Expires ${r.due[0]}`, r.left <= 12 ? "soon" : "")''')
rep('''    return win({ cls, eyebrow: r.id === "r1" ? "Shift pickup" : "Cover request", names: "Shift owner: <b>Maria Lopez</b>",''',
    '''    return win({ cls, eyebrow: kindName(r), names: `Shift owner: <b>${r.owner}</b>`,''')
rep('''else foot = band + meta("Decide by Oct 18, 11:00 AM") +''', '''else foot = band + meta(`Expires ${r.due[0]}`) +''')
# list must exist before shift/owner lines: move the list line up if needed
i_list = s.index("    const list = CANDS[r.id].filter((c) => !c.off);")
i_shift = s.index("    const shift = r.tk;")
assert i_list < i_shift, "list after shift"
rep('''S.mgrPick = d.row === "r1" || d.row === "r2" ? "jake" : null;''', '''S.mgrPick = ((CANDS[d.row] || [])[0] || {}).id || null;''')
rep('''S.mgrPick = S.mgrOpen === "r3" ? null : "jake";''', '''S.mgrPick = ((CANDS[S.mgrOpen] || [])[0] || {}).id || null;''')

# --- CSS ---
rep('''.rc .ft {''', '''.exp { font-variant-numeric: tabular-nums; }
.exp.none { color: var(--theme-muted); }
.exp.soon, .rc .ft .soon, .w-meta.soon { color: var(--theme-danger-strong); font-weight: 600; }
.rc .ft {''')
open(p, "w", encoding="utf-8").write(s)
print("ok")
