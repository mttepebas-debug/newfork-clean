p = "/mnt/project-files/pages/gorsel-kararlar/gelen/vardiya-degisim/index.html"
s = open(p, encoding="utf-8").read()
a = s.index("  // Every row says, starting with the person who would work the shift")
b = s.index("  const kindName = (r) =>")
new = '''  // Every row starts with the person who would work the shift, then says plainly who comes
  // off it: in a pickup or cover the owner always comes off and the person approved works
  // it (Mert, 2026-10-14 00:53Z). Then by when the manager decides (shift start − 4 h;
  // the earlier shift in a swap). Desktop: full sentences. Phone: short sentence, one line
  // per shift, the result beside the status chip.
  const B = (n) => `<b>${n}</b>`;
  const pos = (n) => `${n}’s`;
  function reqText(r, narrow) {
    const d = S.mgrDone[r.id];
    if (r.kind === "Swap") {
      const [a, b] = SW_SHIFTS;
      const lead = `${B(a.to)} and ${B(b.to)} ${d === "declined" ? "asked to swap shifts." : "want to swap shifts."}`;
      // Phone: the two shifts side by side, like the swap drawer: day, time, place, who works it.
      const lines = narrow
        ? [`<span class="sw2">${SW_SHIFTS.map((x) => `<span class="c"><b>${x.dow}, ${x.date}</b><span>${x.range}</span><span>${I.pin}${x.loc}</span>${d === "declined" ? `<span class="io">${B(first(x.owner))} keeps it</span>` : `<span class="io">${B(first(x.to))} works it</span><span class="io2">instead of ${first(x.owner)}</span>`}</span>`).join("")}</span>`]
        : d === "declined" ? [] : SW_SHIFTS.map((x) => `${B(first(x.to))} would work the ${x.start} ${x.job} shift at ${x.loc} on ${x.dow}, ${x.date}, instead of ${first(x.owner)}.`);
      const foot = narrow
        ? (d === "declined" ? "Both keep their own shifts." : d ? "You approved." : `Decide by ${r.due[1]}`)
        : (d === "declined" ? "Daniel and Priya keep their own shifts. Declined by you just now." : d ? "You approved. Marcus Green decides for Midtown." : `Decide by ${r.due[0]}.`);
      return { lead, lines, foot };
    }
    const sh = r.sh;
    const cands = (CANDS[r.id] || []).filter((c) => !c.off);
    const taker = r.taker || (d === "approved" && (cands.find((c) => c.id === S.mgrTaker[r.id]) || cands[0]).name);
    const others = cands.length - 1;
    const who = taker ? B(taker) : others === 0 ? B(cands[0].name) : others === 1 ? `${B(cands[0].name)} and ${B(cands[1].name)}` : `${B(cands[0].name)} and ${others} others`;
    const verb = taker ? (r.kind === "Cover" ? "is covering" : "took over")
      : r.kind === "Cover" ? "offered to cover"
      : d ? "asked to take over" : others === 0 ? "wants to take over" : "want to take over";
    const lead = `${who} ${verb} ${B(pos(r.owner))} ${narrow ? "" : sh.start + " "}${sh.job} shift${narrow ? "" : ` at ${sh.loc} on ${sh.day}`}.`;
    const lines = narrow ? [`${sh.day} · ${sh.range} · ${I.pin}${sh.loc}`] : [];
    const owner = first(r.owner);
    // The result: who works it instead of the owner (or that the owner still does).
    const result = taker ? `${first(taker)} works it instead of ${owner}.`
      : d === "declined" ? `${owner} still works it.`
      : others === 0 ? `If you approve, ${first(cands[0].name)} works it instead of ${owner}.`
      : `The person you approve works it instead of ${owner}.`;
    const when = r.taker ? "Approved by you yesterday." : d === "declined" ? "Declined by you just now." : d ? "Approved by you just now." : `Decide by ${r.due[0]}.`;
    const foot = narrow ? (taker || d === "declined" ? result : `Decide by ${r.due[1]}`) : `${result} ${when}`;
    return { lead, lines, foot };
  }
'''
s = s[:a] + new + s[b:]
def rep(x, y, n=1):
    global s
    assert s.count(x) == n, (x[:70], s.count(x))
    s = s.replace(x, y)
rep('.rq-t .due { color: var(--theme-muted); font-size: 12.5px; }',
    '.rq-t .due { color: var(--theme-text-secondary); font-size: 12.5px; }')
rep('.rc .sw2 i { font-style: normal; color: var(--theme-muted); }',
    '.rc .sw2 .io { margin-top: 2px; color: var(--theme-text); }\n.rc .sw2 .io2 { color: var(--theme-muted); }')
open(p, "w", encoding="utf-8").write(s)
print("ok")
