import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
def rep(old, new, n=1):
    global s
    assert s.count(old) == n, ("count", s.count(old), old[:120])
    s = s.replace(old, new)
def cut_between(start, end, new):
    global s
    a = s.index(start); b = s.index(end, a)
    s = s[:a] + new + s[b:]

# ---- employee: Jake has approved time off on Sun, Oct 18 (open shift o2) ----
rep('''{ id: "o2", from: "Daniel Brooks", dow: "Sun", date: "Oct 18", day: 18, hrs: "5 h", when: "In 5 days", time: "10:00 AM – 3:00 PM", loc: "Downtown", note: "", wk: ["37 h this week", "32 h now"], avail: ["Available", "on Sunday"] },''',
    '''{ id: "o2", from: "Daniel Brooks", dow: "Sun", date: "Oct 18", day: 18, hrs: "5 h", when: "In 5 days", time: "10:00 AM – 3:00 PM", loc: "Downtown", note: "", wk: ["37 h this week", "32 h now"], avail: ["Available", "on Sunday"], offFor: "jake" },''')
# Deck card: the time off box replaces availability for the person who is off that day.
rep('''${cks([ck("ok", o.wk[0], o.wk[1]), ck("ok", o.avail[0], o.avail[1])])}<p class="foot-note">Your manager picks who gets it.</p>`;''',
    '''${cks([ck("ok", o.wk[0], o.wk[1]), o.offFor === S.persona ? ck("warn", "You're off that day", "approved time off") : ck("ok", o.avail[0], o.avail[1])])}<p class="foot-note">Your manager picks who gets it.</p>`;''')
# Taking a shift on a day off asks once, in the employee's own words (Mert 13:52): the manager is not told.
rep('''    const finish = () => {
      S.deckDone[id] = dir2;
      const o = OPEN.find((x) => x.id === id);''',
    '''    const o0 = OPEN.find((x) => x.id === id);
    if (dir2 === "take" && o0.offFor === S.persona) { S.pickOff = id; S.sheet = "pickoff"; render(); return; }
    const finish = () => {
      S.deckDone[id] = dir2;
      const o = OPEN.find((x) => x.id === id);''')
rep('''    if (S.sheet === "swapconfirm") {''',
    '''    if (S.sheet === "pickoff") {
      const o = OPEN.find((x) => x.id === S.pickOff);
      const body = `${ticket(o, dir(first(o.from), "you"))}${cks([ck("warn", "Time off ends that day", "if your manager approves")], true)}
        <p class="w-meta" style="margin:0">You have approved time off on ${o.dow}, ${o.date}. If your manager gives you this shift, your time off for that day is cancelled. Other days stay as they are.</p>`;
      return win({ cls: "sheet", eyebrow: "Take this shift?", names: `${esc(o.from)} → you`, body, foot: meta("Your manager picks who gets it.") + `<button type="button" class="btn" data-pickoff="keep">Keep time off</button><button type="button" class="btn go" data-pickoff="take">Take shift</button>` });
    }
    if (S.sheet === "swapconfirm") {''')
rep('''    if (d.deck) { swipe(d.deck); return; }''',
    '''    if (d.deck) { swipe(d.deck); return; }
    if (d.pickoff) { const id = S.pickOff; S.sheet = null; if (d.pickoff === "take") { S.deckDone[id] = "take"; const o = OPEN.find((x) => x.id === id); flash("You asked for this shift", `${o.dow}, ${o.date}. Your time off ends only if your manager approves.`); } else render(); return; }''')

# ---- manager data: Cover is its own type; hours rule is 8 a day / 40 a week, plus days in a row ----
cut_between("  const CANDS = {", "  const SW_CASES", '''  const CANDS = {
    r1: [
      { id: "jake", name: "Jake Miller", s: "Asked 2 h ago", rows: [["ok", "Hours", "6 h that day · 38 h this week"], ["ok", "Days in a row", "4 days in a row"], ["ok", "Rest", "14 h since his last shift · 10 h needed"], ["ok", "Availability", "Available Friday"]] },
      { id: "ana", name: "Ana Torres", s: "Asked 1 h ago", rows: [["warn", "Hours", "44 h this week · 4 h over 40"], ["ok", "Days in a row", "3 days in a row"], ["ok", "Rest", "12 h since her last shift · 10 h needed"], ["ok", "Availability", "Available Friday"]] },
      { id: "leo", name: "Leo Park", s: "Asked 20 min ago", rows: [["ok", "Hours", "6 h that day · 36 h this week"], ["warn", "Days in a row", "7 days in a row"], ["warn", "Rest", "7 h after his Thursday close · 10 h needed"], ["ok", "Availability", "Available Friday"]] },
    ],
    r2: [
      { id: "jake", name: "Jake Miller", s: "Accepted 30 min ago", rows: [["ok", "Hours", "6 h that day · 38 h this week"], ["ok", "Days in a row", "5 days in a row"], ["ok", "Rest", "16 h since his last shift · 10 h needed"], ["ok", "Availability", "Available Saturday"]] },
      { id: "priya", name: "Priya Shah", s: "Accepted 10 min ago", rows: [["warn", "Hours", "10 h that day · 2 h over 8"], ["ok", "Days in a row", "2 days in a row"], ["ok", "Travel", "45 min after her Midtown shift · 45 min needed"], ["ok", "Availability", "Available Saturday"]] },
      // Who declined is not shown to the manager (Mert 13:52); kept here so the count reads "2 of 3".
      { id: "leo", name: "Leo Park", s: "Declined", off: true },
    ],
  };
  // The manager sees what is being decided: a Pickup (a released shift someone asked for),
  // a Cover request (people Maria asked; only who accepted) or a Swap.
  const REQS = [
    { id: "r1", kind: "Pickup", who: "Maria Lopez", shift: "Fri, Oct 16 · 4p–10p", status: ["3 want it", "amber"], since: "2 h", loc: "Downtown" },
    { id: "r2", kind: "Cover", who: "Maria Lopez", shift: "Sat, Oct 17 · 11a–5p", status: ["2 accepted", "amber"], since: "40 min", loc: "Downtown" },
    { id: "r3", kind: "Swap", who: "Priya Shah ⇄ Daniel Brooks", shift: "Sun, Oct 18 ⇄ Tue, Oct 20", status: ["Needs decision", "amber"], since: "5 h", loc: "Downtown + Midtown" },
    { id: "r4", kind: "Pickup", who: "Leo Park", shift: "Thu, Oct 15 · 4p–10p", status: ["Approved", "green"], since: "Yesterday", loc: "Downtown" },
  ];
''')

# ---- manager drawer: owner in the header, count beside the list label, only who accepted ----
rep('''    const head = { status: narrow ? null : status, sub: narrow ? "" : [r.how, r.loc].filter(Boolean).join(" · ") };''',
    '''    const head = { status: narrow ? null : status, sub: narrow ? "" : r.loc };''')
rep('''    const list = CANDS[r.id];''', '''    const list = CANDS[r.id].filter((c) => !c.off);''')
rep('''      <p class="w-label">${r.id === "r1" ? "Who wants it" : "Asked 3 · pick from who accepted"}</p>''',
    '''      <p class="w-label with-chip">${r.id === "r1" ? "Who wants it" : "Who accepted"}<span class="chip" data-tone="amber">${r.status[0]}</span></p>''')
rep('''${S.mgrArmed ? "Confirm decline" : "Decline pickup"}''', '''${S.mgrArmed ? "Confirm decline" : r.id === "r1" ? "Decline pickup" : "Decline cover"}''')
rep('''    return win({ cls, eyebrow: "Shift pickup", names: `Maria Lopez → ${pick ? pick.name : "<i>pick who takes it</i>"}`, ...head, body, foot, close });''',
    '''    // Header: the shift's owner; the status chip only once decided (the count sits by the list).
    return win({ cls, eyebrow: r.id === "r1" ? "Shift pickup" : "Cover request", names: "Maria Lopez’s shift", ...head, status: narrow || !done ? null : status, body, foot, close });''')

# ---- CSS ----
rep('''.w-label span { text-transform: none; letter-spacing: 0; font-weight: 500; color: var(--theme-muted); }''',
    '''.w-label span { text-transform: none; letter-spacing: 0; font-weight: 500; color: var(--theme-muted); }
.w-label.with-chip { justify-content: flex-start; align-items: center; }
.w-label.with-chip .chip { font-weight: 600; }
.w-label.with-chip .chip[data-tone="amber"] { color: var(--theme-warning); }''')

# ---- guide: new moment for a day off, updated manager texts ----
rep('''    { group: null, label: "Cover daveti: Accept / Decline",''',
    '''    { group: null, label: "İzinli güne vardiya almak", set: { persona: "jake", empScreen: "hub", hubTab: "available", deckDone: { o1: "pass" } },
      who: "Jake, Pazar günü onaylı izinli",
      text: "Jake'in Pazar izni onaylı. Destedeki Pazar kartında yeşil müsaitlik kutusu yerine turuncu \\"You're off that day\\" kutusu var. Sağa kaydırınca (ya da I'll take it) önce bir soru açılır: bu vardiya ona verilirse o günkü izni iptal olur. \\"Take shift\\" derse istek müdüre gider; \\"Keep time off\\" derse kart yerine döner.",
      list: ["İzin, müdür vardiyayı Jake'e verdiği an iptal olur; müdür reddederse izin olduğu gibi kalır (önerim).", "Yalnız o günün izni düşer; çok günlük izinde diğer günler kalır (önerim).", "Müdürün karar çekmecesinde izinle ilgili hiçbir şey yazmaz.", "Cover davetini kabul ederken de aynı soru çıkar."],
      basis: "Mert 13:52; 9 Ekim'deki \\"onaylı izin hiçbir yolla ezilmez\\" kuralını değiştirir" },
    { group: null, label: "Cover daveti: Accept / Decline",''')
a = s.index('    { group: "Müdür", label: "Requests → Shift changes tablosu"')
b = s.index('    { group: null, label: "Swap kararı')
s = s[:a] + '''    { group: "Müdür", label: "Requests → Shift changes tablosu", set: { mgrOpen: null },
      who: "Rachel",
      text: "Tabloda üç tür var: Pickup (Maria'nın herkese bıraktığı vardiyayı isteyenler var), Cover (Maria'nın sorduğu kişilerden kabul edenler var) ve Swap. Satıra basınca çekmece sağdan açılır; telefonda alttan.",
      list: ["Çalışan tarafında adlar değişmez: Maria \\"Release shift\\" ya da \\"Ask for cover\\" seçer.", "Müdüre ilk isteyende bir bildirim; sonra 12 saatte bir hatırlatma ve kapanmadan 4 saat önce son uyarı."],
      basis: "Kararlar 04:01, 05:03, 05:39, 06:43, 12:57, Mert 13:52" },
    { group: null, label: "Shift pickup: isteyenler", set: { mgrOpen: "r1", mgrPick: "jake" },
      who: "Rachel",
      text: "Başlık \\"Shift pickup\\", altında vardiyanın sahibi: \\"Maria Lopez's shift · Downtown\\". Üstte vardiya, Maria'nın notu, sonra \\"Who wants it\\" ve hemen yanında \\"3 want it\\". Kişiye basınca kontrolleri açılır: önce uyarılar.",
      list: ["Kontroller: Hours (günde 8, haftada 40 saati geçerse uyarı), Days in a row (7 gün üst üste uyarı), Rest ya da Travel, Availability.", "Uyarı varsa düğmelerin üstünde sarı şerit; onay düğmesi \\"Give to Jake\\".", "Onaylı izin satırı yok: izinli kişi vardiyayı kendi isteğiyle alıyorsa müdüre söylenmez."],
      basis: "Kararlar 04:52, 05:03, 06:43, 12:57, Mert 13:52" },
    { group: null, label: "Cover request: kabul edenler", set: { mgrOpen: "r2", mgrPick: "jake" },
      who: "Rachel",
      text: "Başlık \\"Cover request\\", altında \\"Maria Lopez's shift · Downtown\\". Listede yalnız kabul edenler var (\\"Who accepted\\" ve yanında \\"2 accepted\\"); reddeden Leo görünmez.",
      list: ["Priya'da Hours uyarısı: aynı gün Midtown'daki sabah vardiyasıyla 10 saat, günlük 8'i 2 saat geçiyor.", "Biri onaylanınca diğerlerine \\"Someone else is covering\\" gider."],
      basis: "Kararlar 06:43, 12:57, Mert 13:52" },
''' + s[b:]
open(p, 'w', encoding='utf-8').write(s)
print("ok")
