# Lineup phone variants: how this folder works

One self-contained page (`../index.html`) shows the Lineup screen of the Newfork phone app in several whole-screen designs ("variants"), next to the Original (today's mockup, embedded as an iframe). The page has a mockup sidebar (Turkish, for Mert) and one or two phone frames (manager and employee), 390 × 844 each.

## Files
- `tokens.css`: the app's real theme tokens (`--theme-*`), copied from `apps/web/src/styles.css` on main. Never edit.
- `base.css`: mockup chrome + shared app primitives (`.app`, `.scroll`, `.nav`, `.btn`, `.select`, `.input`, `.sheet`, `.toast`, default sheet contents). Never edit.
- `core.js`: data, state, actions, default sheets, chrome. Never edit.
- `v-x.js` / `v-x.css`: a small reference variant that shows the contract. Not a design proposal. Read it first.
- `v-<id>.js` + `v-<id>.css`: one variant. You own only your own two files.
- `build.py`: `python3 build.py --only <id> --out <file.html>` builds a page with only your variant + Original. (Without `--only` it builds every variant except x into `../index.html`; don't do that unless told.)
- `shot.mjs`: `node shot.mjs --v <id> --html <file.html> --out <dir> [--m day,end,...] [--tall] [--dpr 2]` writes PNGs of each phone for each moment: `<id>-<moment>-<role>.png` (exact 390×844 phone) and with `--tall` `…-tall.png` (the whole scroll height). It prints console errors; there must be none.

## The contract
`v-<id>.js` must be wrapped in an IIFE (no globals) and call:

```js
(function () {
  "use strict";
  NF.variant({
    id: "<id>",
    name: "<N> · <short Turkish name>",      // e.g. "1 · Sakin liste"
    sub: "<one or two Turkish sentences for Mert: what is different and why>",
    render: function (P, A) { return "<html of the whole screen>"; },  // P.role is "mgr" or "emp"
    sheet: function (P, A) { return null; },   // optional: html for P.sheet, or null to use the default sheet
    acts: { myAct: function (el, P, A, e) { /* change P.vs or P.*; return false to skip re-render */ } }, // optional
    after: function (appEl, P, A) {}           // optional: runs after each render
  });
})();
```

- `render` returns the WHOLE phone screen: a `<div class="scroll">…</div>` (the scrolling area; everything above the bottom nav) followed by the bottom nav (`A.navMgr()` for the manager, `A.navEmp()` for the employee). The bottom nav is the app shell: keep it as it is.
- Every CSS selector in `v-<id>.css` starts with `.v-<id>` (the phone's `.app` carries that class). You may restyle shared primitives inside your scope (`.v-<id> .sheet-h`, `.v-<id> .btn`, …). No raw hex colors except through the data colors given (`A.TYPES[t].c` shift color, `A.JOBS[j].c` job color), passed as CSS variables (`style="--c:…"`); everything else uses `--theme-*` tokens. Light theme only. Font: Inter (already loaded).
- Text inside the phone is English (US). The phone `.app` has `lang="en"`.
- Interactions use `data-act` attributes; the core handles them and re-renders. Built-in acts:
  - `tab` + `data-t="lunch|dinner|close"` · `loc` on a `<select data-act="loc">` (values `dt`, `up`) · `seg` + `data-s="team|notes"`
  - `person` + `data-id` (manager only: opens the person sheet) · `add` + `data-dept="foh|bar|boh"` (opens Add Staff) · `restore` + `data-id`
  - `publish` (opens the Publish sheet) · `editpub` (opens "Unpublish & edit") · `notes` (opens the notes editor) · `ack` (employee acknowledges)
  - inside sheets: `close`, `calloff` (two taps: first arms `P.armed === "off"`), `field` + `data-f="job|label|section|in|out"` on selects/inputs, `pick` + `data-n` (two taps for "other"/"timeoff" candidates: armed `P.armed === "pick-<name>"`), `pub-pick` + `data-k`, `pub-ack`, `pub-go`, `unpub-go`, `notes-save` (reads `textarea[data-note="sp|s86|sn"]`), `undo` (toast)
  - `noop` for links that go nowhere.
  - Your own acts: put them in `acts`; keep their state in `P.vs` (per phone) and don't touch `A.D` except through built-in acts.
- `P` (one phone's UI state): `role`, `loc`, `tab`, `seg`, `sheet` (`{type:"person",k,id}` | `{type:"add",k,dept}` | `{type:"publish"}` | `{type:"editpub",k}` | `{type:"notes",k}`), `armed`, `toast`, `picks` (publish checkboxes), `pubDone` (publish result text), `vs` (yours).
- `A` (read-only helpers): `A.I` (lucide icons as svg strings: left, right, down, up, plus, userPlus, x, lock, check, checkCircle, note, edit, send, image, copy, pin, clock, tag, layout, calendar, users, more, moreV, search, bell, alert, undo, grip), `A.esc`, `A.fmt(t)` "4:00 PM", `A.range(a,b)` "4:00 PM – 10:00 PM", `A.short(a,b)` "4 – 10 PM", `A.hours(a,b)` "6h", `A.first(name)`, `A.initials`, `A.DATE`, `A.NOW` (2:10 PM), `A.MANAGER`, `A.TYPES`, `A.TYPE_ORDER`, `A.LOCS`, `A.DEPTS`, `A.JOBS`, `A.LABELS`, `A.sections(loc)`, `A.D` (live data), `A.cur(P)` → `{k,l}`, `A.lineupsAt(loc)`, `A.live(l)`, `A.offRows(l)`, `A.state(l)` → `empty|draft|published|started`, `A.editable(P,l)`, `A.stats(l)` → `{n, first, last, acked, unread}`, `A.groups(l)` → `[{dept, count, jobs:[{job, rows}]}]`, `A.hasSec(l)`, `A.hasLab(l)`, `A.tags(r)` → `[{t, kind}]` (kind: `label` for Opener/Closer/Training/Lead; `from` "From Uptown"; `only` "Lineup only"; `warn` "Day off · lineup only"), `A.changed(r)` → `{in, out, sched}`, `A.drafts()`, `A.me()` → `{l, r}` (the employee Hannah Lee and her lineup), `A.icon(job, px, cls, name)` → the job's drawing (`<img>`) from the Restaurant job icon pack, `A.navMgr()`, `A.navEmp()`, `A.sheetFrame(title, sub, bodyHtml, footHtml, cls)`, `A.candidates(P)` → Add Staff groups `[{kind,title,items:[{c,job,rank,fit}]}]`, `A.find(k,id)`, `A.defaultSheet(P)`, `A.toastHtml(P)`.
- Row objects `r`: `id, name, job, in, out, label, section, tags, off, moved, sched`. Lineup `l`: `k, loc, type, status, v, at, by, acked, notes {sp, s86, sn}, rows`.
- A newly added person's row gets class `is-new` after render if your row element carries `data-id="<r.id>"` (give every person row `data-id`).
- Moments (sidebar "An"): `day` (Downtown Dinner draft; employee sees "not published yet"), `end` (scrolled to the bottom), `person`, `add`, `calloff` (Noah called off, toast), `notes` (Notes tab), `publish`, `published` (Dinner published, 7/12 read), `started` (Lunch: started, read-only), `nosec` (Uptown Dinner: nobody has a Section), `empty` (Close: no one), `emp` (employee view, published), `empack` (employee acknowledged).

## Product rules the design must keep (Mert's decisions)
- Lineup is the day's operation page under Schedule. On the phone the manager sees, edits and publishes lineups; the Schedule itself is closed on the phone.
- Structure Mert chose for the phone: **shift tabs** ("Vardiya sekmeleri"): one shift type at a time (Lunch / Dinner / Close tabs), with date control and location picker. Keep that idea; everything else on the screen may be redesigned.
- Hierarchy inside a lineup: **Department** (Front of House, Bar, Kitchen) with **+ Add Staff** on the department line → **Job** (Server, Host…) with its count → **person rows**.
- A person row shows: the **job icon** (replaces initials; Mert wants these drawings left of the name), the **name**, the **time** (both ends with AM/PM, "4:00 PM – 10:00 PM", on one line), the **label** if any (Opener, Closer, Training, Lead, plus status tags "From Uptown", "Lineup only"), and the **Section** if any. Mert (14 Oct): "Departman +Add staff / Job Label Section / ICON Employee ismi varsa etiket — düzgün ve temiz, şık ve kullanışlı… UI design konusunda takıntılıyım". He also said these items are not mandatory: if something better needs bending his rules, bend them.
- Section is optional: when nobody in the shift has one, no Section column/heading appears at all; an empty Section shows nothing (no "—").
- A changed time is written plainly in the list (no frame, no strike-through). In the employee's own shift summary, a changed time may show the Schedule's time struck through, then the new time.
- Called off people drop to a "Called off" block at the end; Restore brings them back. Moved people show "Moved to Downtown".
- Destructive actions take two taps, red (Call off). No browser dialogs. No extra confirmation steps, no settings, no notification noise ("ayar cehennemi" is banned).
- Published lineup is read-only until Edit ("Unpublish & edit"); a started lineup is read-only with no buttons.
- Publish: pick today's draft lineups, toggle "Ask staff to acknowledge", Publish N.
- Employee view: their own shift on top (name, time on one line, location, position, label, section), notes (empty notes don't show), the whole team list headed by the location name in large type and the date + shift ("Downtown" / "Wednesday, October 14 · Dinner"), their own row marked with a soft green background (no "You" tag), **Acknowledge at the very bottom** under the team; after tapping, the button goes away and the acknowledgement time shows. Before publish the employee sees a calm "not published yet" state.
- Add Staff sheet: people grouped by today's status (Available, Has another shift here, Working somewhere else, Approved day off; people who can't work here at the end, disabled); people whose job fits the tapped department first; "Move here" for another location takes two taps with a one-line explanation; a day-off person takes "Add anyway".
- Accessibility: WCAG 2.1 AA contrast (small text ≥ 4.5:1), touch targets ≥ 44 px tall for primary taps (≥ 32 px for secondary inline buttons), visible focus, phone text fields 16 px.
- Design language: Newfork's own (today's tokens, Inter, green actions, white cancel, red destructive, 6–8 px radii, thin borders, calm surfaces). Not a new brand theme. "Oyuncak görünüm" (toy look) and "kurumsal hantallık" (corporate clunk) are both banned.
