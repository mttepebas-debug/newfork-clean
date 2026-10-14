p = "/mnt/project-files/pages/gorsel-kararlar/gelen/vardiya-degisim/index.html"
s = open(p, encoding="utf-8").read()
def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (a[:70], s.count(a))
    s = s.replace(a, b)
# phone footer sits beside the status chip, so it says only what the chip does not
rep('''      const foot = d === "declined" ? "Declined by you just now. Both keep their shifts." : d ? "You approved. Marcus Green decides for Midtown." : narrow ? `Decide by ${r.due[1]}` : `Review the details and decide by ${r.due[0]}.`;''',
'''      const foot = narrow
        ? (d === "declined" ? "Both keep their shifts." : d ? "You approved." : `Decide by ${r.due[1]}`)
        : (d === "declined" ? "Declined by you just now. Both keep their shifts." : d ? "You approved. Marcus Green decides for Midtown." : `Review the details and decide by ${r.due[0]}.`);''')
rep('''    const foot = r.taker ? "Approved by you yesterday."
      : d === "declined" ? `Declined by you just now. ${first(r.owner)} keeps the shift.`
      : d ? "Approved by you just now."
      : narrow ? `Decide by ${r.due[1]}` : `Review the details and decide by ${r.due[0]}.`;''',
'''    const foot = narrow
      ? (r.taker ? "By you, yesterday" : d === "declined" ? `${first(r.owner)} keeps the shift.` : d ? "By you, just now" : `Decide by ${r.due[1]}`)
      : (r.taker ? "Approved by you yesterday." : d === "declined" ? `Declined by you just now. ${first(r.owner)} keeps the shift.` : d ? "Approved by you just now." : `Review the details and decide by ${r.due[0]}.`);''')
# no "0" badge on the tab once everything is decided
rep('''<button type="button" aria-current="page">Shift changes <span class="dot-n">${n}</span></button>''',
    '''<button type="button" aria-current="page">Shift changes${n ? ` <span class="dot-n">${n}</span>` : ""}</button>''')
rep('''<button type="button" aria-current="page">Shift changes <span class="dot-n">${pendingCount()}</span></button>''',
    '''<button type="button" aria-current="page">Shift changes${pendingCount() ? ` <span class="dot-n">${pendingCount()}</span>` : ""}</button>''')
open(p, "w", encoding="utf-8").write(s)
print("ok")
