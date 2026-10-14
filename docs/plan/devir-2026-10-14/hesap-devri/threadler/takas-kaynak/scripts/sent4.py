p = "/mnt/project-files/pages/gorsel-kararlar/gelen/vardiya-degisim/index.html"
s = open(p, encoding="utf-8").read()
def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (a[:70], s.count(a))
    s = s.replace(a, b)
rep('''      const lines = SW_SHIFTS.map((x) => narrow
        ? `${B(first(x.to))} takes ${x.dow}, ${x.date} · ${x.range} · ${I.pin}${x.loc}`
        : `${B(first(x.to))} takes ${pos(first(x.owner))} ${x.start} ${x.job} shift at ${x.loc} on ${x.dow}, ${x.date}.`);''',
'''      // Phone: the two shifts side by side, like the swap drawer: day, time, place, whose → who.
      const lines = narrow
        ? [`<span class="sw2">${SW_SHIFTS.map((x) => `<span class="c"><b>${x.dow}, ${x.date}</b><span>${x.range}</span><span>${I.pin}${x.loc}</span><span>${first(x.owner)} <i>→</i> <b>${first(x.to)}</b></span></span>`).join("")}</span>`]
        : SW_SHIFTS.map((x) => `${B(first(x.to))} takes ${pos(first(x.owner))} ${x.start} ${x.job} shift at ${x.loc} on ${x.dow}, ${x.date}.`);''')
rep('''${t.lines.map((l) => `<span class="ln">${l}</span>`).join("")}<span class="ft">''',
    '''${t.lines.map((l) => l.startsWith("<span") ? l : `<span class="ln">${l}</span>`).join("")}<span class="ft">''')
rep('''.rc .ft {''', '''.rc .sw2 { display: grid; grid-template-columns: 1fr 1fr; margin-top: 4px; border: 1px solid var(--theme-border); border-radius: 8px; }
.rc .sw2 .c { display: grid; gap: 1px; padding: 7px 10px; min-width: 0; font-size: 12.5px; line-height: 1.4; color: var(--theme-text-secondary); font-variant-numeric: tabular-nums; }
.rc .sw2 .c + .c { border-left: 1px solid var(--theme-border); }
.rc .sw2 b { color: var(--theme-text); font-weight: 600; }
.rc .sw2 i { font-style: normal; color: var(--theme-muted); }
.rc .sw2 svg { display: inline; vertical-align: -1px; margin-right: 2px; color: var(--theme-muted); }
.rc .ft {''')
open(p, "w", encoding="utf-8").write(s)
print("ok")
