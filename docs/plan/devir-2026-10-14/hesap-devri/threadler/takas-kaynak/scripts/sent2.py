p = "/mnt/project-files/pages/gorsel-kararlar/gelen/vardiya-degisim/index.html"
s = open(p, encoding="utf-8").read()
def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (a[:70], s.count(a))
    s = s.replace(a, b)
rep('const lead = `${B(a.to)} and ${B(b.to)} ${d === "declined" ? "asked to swap shifts." : d ? "are swapping shifts." : "would like to swap shifts."}`;',
    'const lead = `${B(a.to)} and ${B(b.to)} ${d === "declined" ? "asked to swap shifts." : "would like to swap shifts."}`;')
rep('const who = taker ? B(taker) : others === 1 ?',
    'const who = taker ? B(taker) : others === 0 ? B(cands[0].name) : others === 1 ?')
# td must stay a table cell: the grid goes on an inner block
rep('<td class="rq-t"><span class="lead">${t.lead}</span>${t.lines.map((l) => `<span class="ln">${l}</span>`).join("")}<span class="due">${t.foot}</span></td>',
    '<td><div class="rq-t"><span class="lead">${t.lead}</span>${t.lines.map((l) => `<span class="ln">${l}</span>`).join("")}<span class="due">${t.foot}</span></div></td>')
rep('<button type="button" class="rc" data-row="${r.id}" aria-label="${kindName(r)}">${kindIcon(r, 40)}<span class="lead">',
    '<button type="button" class="rc" data-row="${r.id}">${kindIcon(r, 40)}<span class="lead"><span class="sr">${kindName(r)}: </span>')
rep('.rc .ln { display: flex; align-items: center; flex-wrap: wrap; column-gap: 0; font-size: 12.5px;',
    '.rc .ln { display: block; font-size: 12.5px;')
rep('.rc .ln b { color: var(--theme-text); margin-right: .3em; }', '.rc .ln b { color: var(--theme-text); }')
rep('.rc .ln svg, .rq-t .ln svg { margin: 0 2px 0 0; flex: none; color: var(--theme-muted); }',
    '.rc .ln svg { display: inline; vertical-align: -1px; margin-right: 2px; color: var(--theme-muted); }')
# drawer header location + a read-only window for the already approved row
rep('const head = { status: narrow ? null : status, sub: narrow ? "" : r.loc };',
    'const head = { status: narrow ? null : status, sub: narrow ? "" : r.sh ? r.sh.loc : "Downtown ⇄ Midtown" };')
rep('''    const list = CANDS[r.id].filter((c) => !c.off);''',
'''    if (r.taker) {
      const sh = { dow: "Thu", date: "Oct 15", day: 15, mon: "Oct", hrs: "6 h", job: "Server", time: "4:00 PM – 10:00 PM", loc: "Downtown", when: "In 2 days" };
      return win({ cls, eyebrow: "Shift pickup", names: `Shift owner: <b>${r.owner}</b>`, ...head, body: ticket(sh, dir(first(r.owner), first(r.taker))), foot: meta(`Approved by you yesterday. ${first(r.taker)} and ${first(r.owner)} were told.`, "done") + `<button type="button" class="btn" ${close}>Close</button>`, close });
    }
    const list = CANDS[r.id].filter((c) => !c.off);''')
open(p, "w", encoding="utf-8").write(s)
print("ok")
