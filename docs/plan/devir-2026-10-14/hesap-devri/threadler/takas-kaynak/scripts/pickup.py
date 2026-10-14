import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
def rep(old, new):
    global s
    assert s.count(old) == 1, ("count", s.count(old), old[:100])
    s = s.replace(old, new)
def cut_between(start, end, new):
    global s
    a = s.index(start); b = s.index(end, a)
    s = s[:a] + new + s[b:]

# ---- CSS: drop the old centred compact card and side-by-side pair (manager swap only) ----
lines = s.split("\n")
drop_prefix = ("/* Shift card: everything centred (H2) */", ".sc {", ".sc b {", ".sc > span {", ".sc .place {", ".sc .place svg {", ".sc > .hand {", ".sc.ghost {", ".pair {", ".pair .swapic {", ".pair .swapic svg {", ".pair.stack {", ".pair.stack .swapic svg {", ".w.sheet .sc {", ".w.sheet .sc b {", ".w.sheet .sc > span {", ".w.sheet .sc > .hand {")
kept = [l for l in lines if not l.startswith(drop_prefix)]
assert len(lines) - len(kept) == len(drop_prefix), len(lines) - len(kept)
s = "\n".join(kept)

# ---- CSS: manager check list, person blocks, approvals, footer band ----
rep("/* Note from a person */", """/* Manager checks: one list per person, warnings first, then what is fine.
   Left-aligned rows read top to bottom; colour only where something needs a look. */
.cl { list-style: none; margin: 0; padding: 0; display: grid; }
.cl li { display: grid; grid-template-columns: 16px 86px minmax(0, 1fr); gap: 10px; align-items: start; padding: 8px 2px; border-top: 1px solid var(--theme-border-subtle); font-size: 13px; line-height: 1.4; }
.cl li:first-child { border-top: 0; }
.cl svg { width: 15px; height: 15px; margin-top: 1px; color: var(--theme-success); }
.cl b { font-weight: 600; color: var(--theme-text-body); }
.cl span { min-width: 0; color: var(--theme-text-secondary); }
.cl li[data-tone="warn"] svg, .cl li[data-tone="warn"] b { color: var(--theme-warning); }
.cl li[data-tone="block"] svg, .cl li[data-tone="block"] b { color: var(--theme-danger-strong); }
.cl li[data-tone="warn"] span, .cl li[data-tone="block"] span { color: var(--theme-text); }
.cl li.new { margin-top: 4px; padding-inline: 8px; border: 1.5px dashed var(--theme-border-control); border-radius: 6px; }
.pr .more .cl { padding: 2px 10px; border-radius: 8px; background: var(--theme-surface); }
/* One person in a swap: who, what they take, whether it works for them */
.pb { display: grid; gap: 10px; }
.pb + .pb { padding-top: 16px; border-top: 1px solid var(--theme-border); }
.pb-head { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 0 10px; align-items: center; }
.pb-head .av { grid-row: auto; }
.pb-t { display: grid; min-width: 0; }
.pb-t b { font-size: 14px; font-weight: 650; }
.pb-t small { font-size: 12px; color: var(--theme-text-secondary); }
/* Who approves: each location's manager, with where they are */
.apv { list-style: none; margin: 0; padding: 0; display: grid; border: 1px solid var(--theme-border); border-radius: 8px; }
.apv li { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 0 10px; align-items: center; padding: 8px 12px; }
.apv li + li { border-top: 1px solid var(--theme-border-subtle); }
.apv .av { grid-row: auto; width: 28px; height: 28px; font-size: 10.5px; }
.apv-t { display: grid; min-width: 0; }
.apv-t b { font-size: 13px; font-weight: 600; }
.apv-t small { font-size: 12px; color: var(--theme-text-secondary); }
/* Over the buttons, like the Announcement drawer's band: only when something needs a look */
.band { flex: 1 1 100%; display: flex; align-items: center; gap: 8px; margin: 0; padding: 8px 10px; border-radius: 6px; background: var(--theme-warning-soft); color: var(--theme-warning-text); font-size: 12.5px; line-height: 1.35; }
.band svg { flex: none; width: 15px; height: 15px; color: var(--theme-warning); }
.band[data-tone="block"] { background: var(--theme-danger-soft); color: var(--theme-danger-strong); }
.band[data-tone="block"] svg { color: var(--theme-danger-strong); }
.w-foot:has(.band) { flex-wrap: wrap; }

/* Note from a person */""")
rep(""".st[data-tone="warn"]::before { background: #d39b2a; }""", """.st[data-tone="warn"]::before { background: #d39b2a; }
.st[data-tone="block"] { color: var(--theme-danger-strong); }
.st[data-tone="block"]::before { background: var(--theme-danger-strong); }""")
rep("""table.list td:nth-child(2) { color: var(--theme-text); font-weight: 600; }""", """table.list td:nth-child(2) { color: var(--theme-text); font-weight: 600; }
table.list td small { display: block; color: var(--theme-muted); font-size: 12px; font-weight: 400; }""")

# ---- data: name what the manager decides (the outcome), keep how it started as a detail ----
cut_between("  const ck = (tone, top, bottom, isNew)", "  // ---------- state ----------", """  const ck = (tone, top, bottom, isNew) => ({ tone, top, bottom, isNew });
  // Manager checks: [tone, rule, what it means for this person]. tone ok | warn | block.
  // One row per candidate; the checks open when the row is chosen.
  const CANDS = {
    r1: [
      { id: "jake", name: "Jake Miller", s: "Asked 2 h ago", rows: [["ok", "Hours", "6 h that day · 38 of 80 h this pay period"], ["ok", "Rest", "14 h since his last shift · 10 h needed"], ["ok", "Availability", "Available Friday"], ["ok", "Time off", "None that day"]] },
      { id: "ana", name: "Ana Torres", s: "Asked 1 h ago", rows: [["warn", "Hours", "84 of 80 h this pay period · 4 h overtime"], ["ok", "Rest", "12 h since her last shift · 10 h needed"], ["ok", "Availability", "Available Friday"], ["ok", "Time off", "None that day"]] },
      { id: "leo", name: "Leo Park", s: "Asked 20 min ago", rows: [["ok", "Hours", "6 h that day · 54 of 80 h this pay period"], ["warn", "Rest", "7 h after his Thursday close · 10 h needed"], ["warn", "Availability", "Prefers not to work Friday evenings"], ["ok", "Time off", "None that day"]] },
    ],
    r2: [
      { id: "jake", name: "Jake Miller", s: "Accepted 30 min ago", rows: [["ok", "Hours", "6 h that day · 38 of 80 h this pay period"], ["ok", "Rest", "16 h since his last shift · 10 h needed"], ["ok", "Availability", "Available Saturday"], ["ok", "Time off", "None that day"]] },
      { id: "priya", name: "Priya Shah", s: "Accepted 10 min ago", rows: [["ok", "Hours", "6 h that day · 66 of 80 h this pay period"], ["ok", "Travel", "45 min after her Midtown shift · 45 min needed"], ["ok", "Availability", "Available Saturday"], ["ok", "Time off", "None that day"]] },
      { id: "leo", name: "Leo Park", s: "Declined", off: true },
    ],
  };
  // What the manager decides is the outcome: one shift moving to someone (Pickup, however
  // it started) or two shifts trading (Swap). How it started is a detail under the name.
  const REQS = [
    { id: "r1", kind: "Pickup", how: "Open to the team", who: "Maria Lopez", shift: "Fri, Oct 16 · 4p–10p", status: ["3 want it", "amber"], since: "2 h", loc: "Downtown" },
    { id: "r2", kind: "Pickup", how: "Asked 3 people", who: "Maria Lopez", shift: "Sat, Oct 17 · 11a–5p", status: ["2 accepted", "amber"], since: "40 min", loc: "Downtown" },
    { id: "r3", kind: "Swap", how: "Agreed between them", who: "Priya Shah ⇄ Daniel Brooks", shift: "Sun, Oct 18 ⇄ Tue, Oct 20", status: ["Needs decision", "amber"], since: "5 h", loc: "Downtown + Midtown" },
    { id: "r4", kind: "Pickup", how: "Open to the team", who: "Leo Park", shift: "Thu, Oct 15 · 4p–10p", status: ["Approved", "green"], since: "Yesterday", loc: "Downtown" },
  ];
  const SW_CASES = [["clean", "Engel yok"], ["travel", "Yol"], ["rest", "Dinlenme"], ["three", "Üçü birden"], ["timeoff", "Onaylı izin"], ["hours", "Fazla mesai (öneri)"]];
  // A swap is two people each taking one shift: the checks belong to the person who takes it.
  const SW_PEOPLE = [
    { name: "Daniel Brooks", takes: "Takes Priya’s shift", hand: ["Priya", "Daniel"], sh: { dow: "Sun", date: "Oct 18", day: 18, mon: "Oct", hrs: "6 h", when: "In 5 days", time: "4:00 PM – 10:00 PM", job: "Server", loc: "Downtown" } },
    { name: "Priya Shah", takes: "Takes Daniel’s shift", hand: ["Daniel", "Priya"], sh: { dow: "Tue", date: "Oct 20", day: 20, mon: "Oct", hrs: "6 h", when: "In 7 days", time: "5:00 PM – 11:00 PM", job: "Server", loc: "Midtown" } },
  ];
  function swRows(c) {
    const d = { off: ["ok", "Time off", "None that day"], travel: ["ok", "Travel", "No other shift that day"], rest: ["ok", "Rest", "14 h since his last shift · 10 h needed"], avail: ["ok", "Availability", "Available Sunday"] };
    const p = { off: ["ok", "Time off", "None that day"], travel: ["ok", "Travel", "No other shift that day"], rest: ["ok", "Rest", "12 h until her next shift · 10 h needed"], avail: ["ok", "Availability", "Available Tuesday"] };
    if (c === "travel" || c === "three") d.travel = ["warn", "Travel", "30 min after his Midtown shift · 45 min needed"];
    if (c === "three") d.avail = ["warn", "Availability", "Prefers not to work Sunday evenings"];
    if (c === "rest" || c === "three") p.rest = ["warn", "Rest", "8 h until her Wed 7:00 AM shift · 10 h needed"];
    if (c === "timeoff") p.off = ["block", "Time off", "Approved time off that day"];
    const dr = Object.values(d), pr = Object.values(p);
    if (c === "hours") { dr.push(["warn", "Hours", "44 h in the week of Oct 12 · 4 h overtime", true]); pr.push(["ok", "Hours", "34 h in the week of Oct 19", true]); }
    return [dr, pr];
  }

""")

# ---- helpers: drop sc() and pair(), add the check list ----
cut_between("  function sc(sh, hand, boxes = []) {", "  // Single shift in the \"Your shift\" window", "")
rep("""  function pair(left, right, stack) { return `<div class="pair ${stack ? "stack" : ""}">${left}<span class="swapic" aria-hidden="true">${I.swap}</span>${right}</div>`; }\n""", "")
rep("""  const meta = (t, cls = "") => `<span class="w-meta ${cls}">${t}</span>`;""", """  const meta = (t, cls = "") => `<span class="w-meta ${cls}">${t}</span>`;
  const RANK = { block: 0, warn: 1, ok: 2 };
  function checkList(rows) {
    const sorted = [...rows].sort((a, b) => RANK[a[0]] - RANK[b[0]]);
    return `<ul class="cl">${sorted.map(([tone, rule, text, isNew]) => `<li data-tone="${tone}" class="${isNew ? "new" : ""}">${tone === "ok" ? I.check : I.warn}<b>${rule}</b><span>${text}</span></li>`).join("")}</ul>`;
  }
  const warnCount = (rows) => rows.filter((r) => r[0] === "warn").length;
  const blocked = (rows) => rows.some((r) => r[0] === "block");
  function verdict(rows) {
    const n = warnCount(rows);
    return blocked(rows) ? st("block", "Can’t take it") : n ? st("warn", `${n} ${n === 1 ? "warning" : "warnings"}`) : st("ok", "All checks OK");
  }
  const bandHtml = (tone, text) => `<p class="band" data-tone="${tone}">${I.warn}<span>${text}</span></p>`;""")

# ---- the decision drawer ----
cut_between("  function decisionWindow(narrow) {", "  function orphanWindow() {", r'''  function decisionWindow(narrow) {
    const r = REQS.find((x) => x.id === S.mgrOpen);
    if (!r) return "";
    const done = S.mgrDone[r.id];
    const cls = narrow ? "sheet" : "drawer";
    const status = done ? [done === "approved" ? "Approved" : "Declined", done === "approved" ? "green" : "red"] : r.status;
    const head = { status: narrow ? null : status, sub: narrow ? "" : `${r.how} · ${r.loc}` };
    const close = 'data-mgr="close"';
    if (r.id === "r3") {
      const rows = swRows(S.swCase);
      const all = rows.flat();
      const people = SW_PEOPLE.map((p, i) => `<section class="pb" aria-label="${p.name}"><header class="pb-head"><span class="av">${ini(p.name)}</span><span class="pb-t"><b>${p.name}</b><small>${p.takes}</small></span>${verdict(rows[i])}</header>${ticket(p.sh, dir(...p.hand))}${checkList(rows[i])}</section>`).join("");
      const mine = done === "approved" ? ["ok", "Approved"] : done === "declined" ? ["block", "Declined"] : ["", "Waiting"];
      const theirs = done === "declined" ? ["", "Not needed"] : ["", "Waiting"];
      const apv = `<p class="w-label">Approvals</p><ul class="apv">${[["Rachel Adams", "Downtown · you", mine], ["Marcus Green", "Midtown", theirs]].map(([n, m, [t, x]]) => `<li><span class="av">${ini(n)}</span><span class="apv-t"><b>${n}</b><small>${m}</small></span>${st(t, x)}</li>`).join("")}</ul>`;
      let body = people + apv;
      let foot;
      const n = warnCount(all);
      const band = blocked(all) ? bandHtml("block", "Priya has approved time off on Tue, Oct 20. Shorten it first, then approve.") : n ? bandHtml("warn", `${n} ${n === 1 ? "warning" : "warnings"}. You can still approve.`) : "";
      if (done) foot = meta(done === "approved" ? "Your approval is recorded. Marcus Green decides for Midtown." : "Swap declined. Priya and Daniel were told.", done === "approved" ? "done" : "") + `<button type="button" class="btn" ${close}>Close</button>`;
      else if (S.mgrDecl) { body = people.replace(/<ul class="cl">[\s\S]*?<\/ul>/g, "") + declineStep("Priya and Daniel"); foot = `<button type="button" class="btn" data-mgr="back">Back</button><button type="button" class="btn no ${S.mgrArmed ? "armed" : ""}" data-mgr="confirm">${S.mgrArmed ? "Confirm decline" : "Decline swap"}</button>`; }
      else foot = band + meta("Decide by Oct 18, 12:00 PM") + `<button type="button" class="btn" data-mgr="decline">Decline</button><button type="button" class="btn go" data-mgr="approve" ${blocked(all) ? "disabled" : ""}>Approve swap</button>`;
      return win({ cls, eyebrow: "Shift swap", names: "Priya Shah ⇄ Daniel Brooks", ...head, body, foot, close });
    }
    const list = CANDS[r.id];
    const pick = list.find((c) => c.id === S.mgrPick && !c.off);
    const shift = r.id === "r1" ? SHIFT : { dow: "Sat", date: "Oct 17", day: 17, mon: "Oct", hrs: "6 h", job: "Server", time: "11:00 AM – 5:00 PM", loc: "Downtown", when: "In 4 days" };
    const rowsHtml = list.map((c) => {
      const on = pick && pick.id === c.id;
      return `<button type="button" class="pr" role="radio" aria-checked="${on}" ${c.off ? 'aria-disabled="true"' : ""} data-cand="${c.id}"><span class="mark round"></span><span class="av">${ini(c.name)}</span><span class="t">${c.name}</span><span class="s">${c.s}</span><span class="r">${c.off ? st("", "Declined") : verdict(c.rows)}</span>${on ? `<span class="more">${checkList(c.rows)}</span>` : ""}</button>`;
    }).join("");
    let body = `${ticket(shift, dir("Maria", pick ? first(pick.name) : "?"))}${quote("Maria", "Family dinner came up. Section 4 is usually busy, thanks!")}
      <p class="w-label">${r.id === "r1" ? "Who wants it" : "Asked 3 · pick from who accepted"}</p><div class="rows" role="radiogroup" aria-label="Who takes the shift">${rowsHtml}</div>`;
    let foot;
    const pn = pick ? warnCount(pick.rows) : 0;
    const band = pick && pn ? bandHtml("warn", `${pn} ${pn === 1 ? "warning" : "warnings"} for ${first(pick.name)}. You can still approve.`) : "";
    if (done) foot = meta(done === "approved" ? `Approved. ${first(pick.name)} has the shift; Maria and everyone else were told.` : "Declined. Maria and everyone who asked were told.", done === "approved" ? "done" : "") + `<button type="button" class="btn" ${close}>Close</button>`;
    else if (S.mgrDecl) { body = ticket(shift, dir("Maria", "?")) + declineStep("Maria and everyone who asked"); foot = `<button type="button" class="btn" data-mgr="back">Back</button><button type="button" class="btn no ${S.mgrArmed ? "armed" : ""}" data-mgr="confirm">${S.mgrArmed ? "Confirm decline" : "Decline pickup"}</button>`; }
    else foot = band + meta(r.id === "r1" ? "Decide by Oct 16, 12:00 PM" : "Decide by Oct 17, 7:00 AM") + `<button type="button" class="btn" data-mgr="decline">Decline</button><button type="button" class="btn go" data-mgr="approve" ${pick ? "" : "disabled"}>${pick ? "Give to " + first(pick.name) : "Approve"}</button>`;
    return win({ cls, eyebrow: "Shift pickup", names: `Maria Lopez → ${pick ? pick.name : "<i>pick who takes it</i>"}`, ...head, body, foot, close });
  }
''')

# ---- table and phone list: type + how it started ----
rep("""<th>Status</th><th>Request</th><th>Type</th>""", """<th>Status</th><th>Shift change</th><th>Type</th>""")
rep("""<td>${r.who}</td><td>${r.kind}</td>""", """<td>${r.who}</td><td>${r.kind}<small>${r.how}</small></td>""")
rep("""<span class="s">${r.kind} · ${r.shift}</span>""", """<span class="s">${r.kind} · ${r.how}<br>${r.shift}</span>""")
open(p, 'w', encoding='utf-8').write(s)
print("ok")
