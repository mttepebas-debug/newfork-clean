import re, sys
P = "/mnt/project-files/pages/gorsel-kararlar/gelen/vardiya-degisim/index.html"
s = open(P, encoding="utf-8").read()

def rep(old, new, count=1):
    global s
    if s.count(old) != count:
        sys.exit(f"expected {count} of: {old[:80]!r}, found {s.count(old)}")
    s = s.replace(old, new)

def cut_between(start, end, new):
    global s
    i = s.index(start); j = s.index(end, i)
    s = s[:i] + new + s[j:]

# 1. data: cases, shifts, effects
cut_between('  const SW_CASES = [', '  // ---------- state ----------', '''  const SW_CASES = [["clean", "Engel yok"], ["travel", "Yol"], ["hours", "Fazla mesai"], ["days", "7 gün üst üste"], ["rest", "Dinlenme"], ["all", "Hepsi birden"]];
  // A swap: two shifts change hands. Each one has its owner, who works it after, and the
  // manager of its location who approves it (two locations, two approvals).
  const SW_SHIFTS = [
    { owner: "Priya Shah", to: "Daniel Brooks", dow: "Sun", date: "Oct 18", time: "3:00 – 11:00 PM", hrs: "8 h", job: "Server", loc: "Downtown", approver: "Rachel Adams", you: true },
    { owner: "Daniel Brooks", to: "Priya Shah", dow: "Tue", date: "Oct 20", time: "5:00 – 11:00 PM", hrs: "6 h", job: "Server", loc: "Midtown", approver: "Marcus Green" },
  ];
  // What changes for each person if the swap goes through: warn = worse and over a rule,
  // good = better than today, ok = fine. Hours always shows before → after.
  function swEffects(c) {
    const has = (k) => c === k || c === "all";
    const d = {
      hours: has("hours") ? ["warn", "Hours", "40 → 42 h in the week of Oct 18 · 2 h over 40"] : ["ok", "Hours", "38 → 40 h in the week of Oct 18"],
      days: has("days") ? ["warn", "Days in a row", "Sunday is day 7 with no day off"] : ["ok", "Days in a row"],
      rest: ["ok", "Rest"],
      travel: has("travel") ? ["warn", "Travel", "30 min after his Midtown shift ends · 45 min needed"] : ["ok", "Travel"],
      avail: ["ok", "Availability"],
    };
    const p = {
      hours: ["good", "Hours", "42 → 40 h in the week of Oct 18 · no longer over 40"],
      days: has("days") ? ["good", "Days in a row", "Gets Sunday off · a 6-day run ends"] : ["ok", "Days in a row"],
      rest: has("rest") ? ["warn", "Rest", "8 h until her Wed 7:00 AM shift · 10 h needed"] : ["ok", "Rest"],
      travel: ["ok", "Travel"],
      avail: ["ok", "Availability"],
    };
    return [Object.values(d), Object.values(p)];
  }

''')

rep('    swCase: "three",', '    swCase: "travel",')

# 2. guide moment
i = s.index('    { group: null, label: "Swap kararı: iki kişi, iki vardiya"')
j = s.index('    { group: null, label: "Sahipsiz kalan vardiyalar"', i)
s = s[:i] + '''    { group: null, label: "Swap kararı: kimin vardiyası, kime geçiyor", set: { mgrOpen: "r3", swCase: "travel" }, cases: true,
      who: "Rachel (Midtown'da Marcus da onaylar)",
      text: "Üstteki tablo Schedule gibi okunur: iki sütun iki vardiya (gün, saat, lokasyon). Satırlar: Owner = vardiyanın asıl sahibi, After swap = swap olursa kim çalışır, Approves = o lokasyonun müdürü. Altında kişi kişi etkisi: kötüleşen turuncu ⚠, iyileşen yeşil ↗. Hâl seç:",
      list: ["Lokasyonlar arası: her vardiya kendi lokasyonuyla; Downtown'ı Rachel, Midtown'ı Marcus onaylar.", "Hours her zaman önce → sonra (Priya 42 → 40 h: fazla mesaiden çıkıyor).", "Sorunsuz kontroller tek satırda: \\"Also OK\\".", "Uyarı onayı engellemez. Onaylı izin satırı yok: pickup ve cover kuralı swap'ta da geçerli (varsayılanım)."],
      basis: "Kararlar 05:02, 06:43, 12:57; Mert 13:07, 13:52, 13:57" },
''' + s[j:]

# 3. drawer body for the swap
i = s.index('    if (r.id === "r3") {')
j = s.index('    const list = CANDS[r.id].filter', i)
s = s[:i] + '''    if (r.id === "r3") {
      const rows = swEffects(S.swCase);
      const people = SW_SHIFTS.map((sh, i) => swPerson(sh, rows[i])).join("");
      let body = tradeTable(done) + `<p class="w-label">After the swap</p>` + people;
      let foot;
      const counts = SW_SHIFTS.map((sh, i) => [first(sh.to), warnCount(rows[i])]).filter(([, k]) => k);
      const band = counts.length ? bandHtml("warn", `${counts.map(([who, k]) => `${k} ${k === 1 ? "warning" : "warnings"} for ${who}`).join(", ")}. You can still approve.`) : "";
      if (done) foot = meta(done === "approved" ? "Your approval is recorded. Marcus Green decides for Midtown." : "Swap declined. Priya and Daniel were told.", done === "approved" ? "done" : "") + `<button type="button" class="btn" ${close}>Close</button>`;
      else if (S.mgrDecl) { body = tradeTable(done) + declineStep("Priya and Daniel"); foot = `<button type="button" class="btn" data-mgr="back">Back</button><button type="button" class="btn no ${S.mgrArmed ? "armed" : ""}" data-mgr="confirm">${S.mgrArmed ? "Confirm decline" : "Decline swap"}</button>`; }
      else foot = band + meta("Decide by Oct 18, 11:00 AM") + `<button type="button" class="btn" data-mgr="decline">Decline</button><button type="button" class="btn go" data-mgr="approve">Approve swap</button>`;
      return win({ cls, eyebrow: "Shift swap", names: "Priya Shah ⇄ Daniel Brooks", ...head, body, foot, close });
    }
''' + s[j:]

# 4. helpers: trade table, person block, good tone
rep('''  const RANK = { block: 0, warn: 1, ok: 2 };''', '''  const RANK = { block: 0, warn: 1, good: 2, ok: 3 };''')
rep('''<li data-tone="${tone}" class="${isNew ? "new" : ""}">${tone === "ok" ? I.check : I.warn}''', '''<li data-tone="${tone}" class="${isNew ? "new" : ""}">${tone === "ok" ? I.check : tone === "good" ? I.up : I.warn}''')
rep('''  const bandHtml = (tone, text) =>''', '''  // A swap at a glance, read like Schedule: the two shifts are columns; rows say whose
  // shift it is now, who works it after the swap, and which location's manager approves it.
  function tradeTable(done) {
    const approval = (sh) => sh.you ? (done === "approved" ? ["ok", "Approved"] : done === "declined" ? ["block", "Declined"] : ["", "Waiting"]) : done === "declined" ? ["", "Not needed"] : ["", "Waiting"];
    const person = (n, strong) => `<span class="tr-p"><span class="av">${ini(n)}</span>${strong ? `<b>${n}</b>` : `<span>${n}</span>`}</span>`;
    return `<table class="trade"><caption class="sr">Shifts in this swap</caption><colgroup><col class="l"><col><col></colgroup>
      <thead><tr><td></td>${SW_SHIFTS.map((sh) => `<th scope="col"><span class="tr-sh"><b>${sh.dow}, ${sh.date}</b><span>${sh.time}</span><span>${sh.job} · ${sh.hrs}</span><span class="tr-loc">${I.pin}${sh.loc}</span></span></th>`).join("")}</tr></thead>
      <tbody><tr><th scope="row">Owner</th>${SW_SHIFTS.map((sh) => `<td>${person(sh.owner)}</td>`).join("")}</tr>
        <tr class="after"><th scope="row">After swap</th>${SW_SHIFTS.map((sh) => `<td>${person(sh.to, true)}</td>`).join("")}</tr>
        <tr><th scope="row">Approves</th>${SW_SHIFTS.map((sh) => { const [t, x] = approval(sh); return `<td><span class="tr-a"><b>${sh.you ? "You" : sh.approver}</b>${st(t, x)}</span></td>`; }).join("")}</tr></tbody></table>`;
  }
  // One person after the swap: the shift they take, what gets worse, what gets better,
  // and one line for the checks that stay fine. Hours always shows.
  function swPerson(sh, rows) {
    const shown = rows.filter((r) => r[0] !== "ok" || r[1] === "Hours");
    const fine = rows.filter((r) => r[0] === "ok" && r[1] !== "Hours").map((r) => r[1]);
    const list = checkList(fine.length ? shown.concat([["ok", "Also OK", fine.join(" · ")]]) : shown);
    return `<section class="pb" aria-label="${sh.to}"><header class="pb-head"><span class="av">${ini(sh.to)}</span><span class="pb-t"><b>${sh.to}</b><small>Takes ${first(sh.owner)}’s ${sh.dow} shift · ${sh.loc}</small></span>${verdict(rows)}</header>${list}</section>`;
  }
  const bandHtml = (tone, text) =>''')

rep('''    spark: svg(''', '''    up: svg('<path d="M7 17 17 7"/><path d="M8 7h9v9"/>', 14, 2.4),
    spark: svg(''')

# 5. table row: cross-location in its own words
rep('''loc: "Downtown + Midtown" },''', '''loc: "Downtown ⇄ Midtown" },''')

# 6. CSS: drop the ticket-era person CSS bits we no longer need? keep .pb; add trade + good tone
rep('''.pr .more .cl { padding: 2px 10px; border-radius: 8px; background: var(--theme-surface); }''', '''.pr .more .cl { padding: 2px 10px; border-radius: 8px; background: var(--theme-surface); }
/* Better than today: green arrow. In a swap the plain "fine" rows step back to grey so
   worse (amber) and better (green) are what the eye finds. */
.cl li[data-tone="good"] svg, .cl li[data-tone="good"] b { color: var(--theme-success); }
.cl li[data-tone="good"] span { color: var(--theme-text); }
.pb .cl li[data-tone="ok"] svg { color: var(--theme-muted); }
/* A swap at a glance, read like Schedule: shifts are columns, rows are Owner / After swap / Approves */
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
table.trade { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; border: 1px solid var(--theme-border); border-radius: 8px; font-size: 13px; }
table.trade col.l { width: 84px; }
table.trade th, table.trade td { padding: 9px 10px; text-align: left; vertical-align: middle; border-top: 1px solid var(--theme-border-subtle); }
table.trade thead th, table.trade thead td { border-top: 0; vertical-align: top; }
table.trade td + td, table.trade th + th { border-left: 1px solid var(--theme-border-subtle); }
table.trade tbody th { font-size: 12px; font-weight: 600; color: var(--theme-text-secondary); }
.tr-sh { display: grid; gap: 1px; font-weight: 400; }
.tr-sh b { font-size: 13.5px; font-weight: 650; color: var(--theme-text); }
.tr-sh > span { font-size: 12px; color: var(--theme-text-secondary); }
.tr-sh .tr-loc { display: inline-flex; align-items: center; gap: 4px; justify-self: start; margin-top: 5px; padding: 1px 8px 1px 6px; border-radius: 999px; background: var(--theme-surface-muted); color: var(--theme-text-body); font-weight: 600; }
.tr-p { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tr-p > span:last-child, .tr-p b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr-p .av { grid-row: auto; width: 24px; height: 24px; font-size: 9.5px; }
table.trade tr.after th, table.trade tr.after td { background: var(--theme-selected); }
table.trade tr.after b { color: var(--theme-accent-strong); font-weight: 650; }
.tr-a { display: grid; gap: 2px; }
.tr-a b { font-weight: 600; }''')

open(P, "w", encoding="utf-8").write(s)
print("ok")
