/* Variant d · "Vardiya çizgisi" (shift timeline).
   Every person row carries a slim in–out bar drawn against the shift's span; a sticky strip holds the
   department chips and the hour ruler the bars are read against. Header is two short rows; the
   shift's state and its one action (Publish / Edit) sit on a single status line. */
(function () {
"use strict";

/* ---------------- time helpers ---------------- */
function endM(A, a, b) { var x = A.min(b); return x <= A.min(a) ? x + 1440 : x; }
function hhmm(m) { m = ((m % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mm = m % 60; return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm; }
/* The shift's span: whole hours around the first in and the last out (type default when empty). */
function span(A, l) {
  var rs = A.live(l), a = Infinity, b = -Infinity;
  if (rs.length) rs.forEach(function (r) { var s = A.min(r.in), e = endM(A, r.in, r.out); if (s < a) a = s; if (e > b) b = e; });
  else { var d = A.TYPES[l.type].def; a = A.min(d[0]); b = endM(A, d[0], d[1]); }
  a = Math.floor(a / 60) * 60; b = Math.ceil(b / 60) * 60;
  if (b - a < 240) b = a + 240;
  if ((b - a) / 60 % 2 && 282 / ((b - a) / 60) < 44) b += 60;
  return { a: a, b: b };
}
function pct(sp, m) { return Math.max(0, Math.min(100, (m - sp.a) / (sp.b - sp.a) * 100)); }
function nowIn(A, sp) { return A.NOW >= sp.a && A.NOW <= sp.b; }
function hourText(m, withAp) { var h = Math.floor(m / 60) % 24; return (h % 12 || 12) + (withAp ? (h < 12 ? " AM" : " PM") : ""); }
function ap(m) { return Math.floor(m / 60) % 24 < 12 ? "AM" : "PM"; }

/* Hour ruler. w = the ruler's width in px (to space labels and avoid the now label). */
function ruler(A, sp, w, cls) {
  var hrs = (sp.b - sp.a) / 60, step = w / hrs >= 44 ? 1 : 2, showNow = nowIn(A, sp), nx = showNow ? pct(sp, A.NOW) : null;
  var out = "", prev = null;
  for (var m = sp.a, i = 0; m <= sp.b; m += 60, i++) {
    var x = pct(sp, m);
    out += '<i class="d-tk" style="left:' + x + '%"></i>';
    if (i % step) continue;
    if (showNow && Math.abs(x - nx) / 100 * w < 34) continue;
    var last = m + 60 * step > sp.b, a = ap(m);
    out += '<span class="d-hr' + (i === 0 ? " first" : last ? " last" : "") + '" style="left:' + x + '%">' + hourText(m, i === 0 || a !== prev) + "</span>";
    prev = a;
  }
  if (showNow) out += '<i class="d-tk now" style="left:' + nx + '%"></i><span class="d-nowlab" style="left:' + nx + '%">' + A.fmt(hhmm(A.NOW)) + "</span>";
  return '<div class="d-ruler' + (cls ? " " + cls : "") + '" aria-hidden="true">' + out + "</div>";
}
/* A person's in–out bar on the span. ghost = the Schedule's time, drawn as an outline (own shift only). */
function bar(A, sp, a, b, ghost) {
  var s = A.min(a), e = endM(A, a, b), g = "";
  if (ghost) {
    var gs = A.min(ghost.in), ge = endM(A, ghost.in, ghost.out);
    if (gs < s) g += '<u style="left:' + pct(sp, gs) + "%;width:" + (pct(sp, Math.min(s, ge)) - pct(sp, gs)) + '%"></u>';
    if (ge > e) g += '<u style="left:' + pct(sp, Math.max(e, gs)) + "%;width:" + (pct(sp, ge) - pct(sp, Math.max(e, gs))) + '%"></u>';
  }
  return '<span class="d-bar" aria-hidden="true">' + g + '<i style="left:' + pct(sp, s) + "%;width:" + (pct(sp, e) - pct(sp, s)) + '%"></i>' +
    (nowIn(A, sp) ? '<b style="left:' + pct(sp, A.NOW) + '%"></b>' : "") + "</span>";
}
function tile(A, job, size) { return '<span class="d-tile" style="--c:' + A.JOBS[job].c + '">' + A.icon(job, size || 40) + "</span>"; }

/* ---------------- shared pieces ---------------- */
function dot(st) { return '<i class="d-dot ' + st + '"></i>'; }
/* A.editable(P,l) is false for an empty draft lineup, so the manager could not start one; a draft is editable whether or not it has people. */
function canEdit(P, A, l) { return P.role === "mgr" && l.status !== "published"; }
function noteCount(l) { return ["sp", "s86", "sn"].filter(function (k) { return l.notes[k]; }).length; }
var NOTE_KEYS = [["sp", "Specials"], ["s86", "86s"], ["sn", "Shift notes"]];

function head(P, A, mgr) {
  var I = A.I, h = '<header class="d-head"><h1 class="sr">Lineup</h1><div class="d-ctx">' +
    '<div class="d-date" role="group" aria-label="Day"><button type="button" class="d-ib" aria-label="Previous day" data-act="noop">' + I.left + '</button><span class="d-dt">' + A.DATE.short + '</span><button type="button" class="d-ib" aria-label="Next day" data-act="noop">' + I.right + "</button></div>";
  if (mgr) {
    h += '<label class="d-loc">' + I.pin + "<span>" + A.esc(A.LOCS[P.loc].name) + '</span><select data-act="loc" aria-label="Location">' +
      ["dt", "up"].map(function (k) { return '<option value="' + k + '"' + (P.loc === k ? " selected" : "") + ">" + A.LOCS[k].name + "</option>"; }).join("") + "</select>" + I.down + "</label>";
  } else h += '<span class="d-where">' + I.pin + A.esc(A.LOCS[A.me().l.loc].name) + "</span>";
  h += "</div>";
  if (mgr) {
    h += '<div class="d-tabs" role="tablist" aria-label="Shift">' + A.lineupsAt(P.loc).map(function (x) {
      var on = x.type === P.tab, st = A.state(x), n = A.live(x).length;
      return '<button type="button" role="tab" class="d-tab" aria-selected="' + on + '" style="--c:' + A.TYPES[x.type].c + '" data-act="tab" data-t="' + x.type + '">' + dot(st) + A.TYPES[x.type].name + '<span class="n">' + n + "</span></button>";
    }).join("") + "</div>";
  }
  return h + "</header>";
}

/* Status line: the shift's state on the left, its one action on the right. */
function status(P, A, l) {
  var st = A.state(l), s = A.stats(l), I = A.I, t = A.TYPES[l.type], can = canEdit(P, A, l), nc = noteCount(l);
  var title, sub;
  if (st === "empty") { title = dot("empty") + "No one on " + t.name + " yet"; sub = "People you add get " + A.range(t.def[0], t.def[1]) + "."; }
  else if (st === "draft") { title = dot("draft") + "Draft"; sub = "Staff can't see it"; }
  else if (st === "published") { title = dot("published") + "Published " + A.esc(l.at); sub = s.acked + " of " + s.n + " read"; }
  else { title = '<span class="d-lk">' + I.lock + "</span>Started " + A.fmt(s.first); sub = "Read-only · " + s.acked + " of " + s.n + " read"; }
  var acts = "";
  if (st !== "empty" && (nc || can)) acts += '<button type="button" class="btn sm d-nb" data-act="seg" data-s="' + (P.seg === "notes" ? "team" : "notes") + '" aria-expanded="' + (P.seg === "notes") + '">Notes' + (nc ? '<span class="d-cnt">' + nc + "</span>" : "") + (P.seg === "notes" ? I.up : I.down) + "</button>";
  if (st === "draft") acts += '<button type="button" class="btn green d-act" data-act="publish">' + I.send + "Publish</button>";
  if (st === "published") acts += '<button type="button" class="btn d-act" data-act="editpub">' + I.edit + "Edit</button>";
  return '<section class="d-stat st-' + st + '"><div class="d-stat-t"><b>' + title + "</b><span>" + sub + "</span></div>" + (acts ? '<div class="d-stat-a">' + acts + "</div>" : "") + "</section>" +
    (P.seg === "notes" && st !== "empty" ? notesPanel(P, A, l) : "");
}
function notesPanel(P, A, l) {
  var can = canEdit(P, A, l);
  return '<section class="d-notes" aria-label="Notes"><dl>' + NOTE_KEYS.map(function (x) {
    var v = l.notes[x[0]];
    return "<div><dt>" + x[1] + "</dt><dd" + (v ? "" : ' class="none"') + ">" + (v ? A.esc(v) : "Nothing yet") + "</dd></div>";
  }).join("") + "</dl>" + (can ? '<button type="button" class="btn sm d-ne" data-act="notes">' + A.I.edit + "Edit notes</button>" : "") + "</section>";
}

/* Sticky strip: department chips + hour ruler. */
function stick(P, A, l, sp) {
  var g = A.groups(l), off = A.offRows(l).length;
  var chips = g.map(function (x, i) { return '<button type="button" class="d-chip" data-act="jump" data-d="' + x.dept.id + '"' + (i === 0 ? ' aria-current="true"' : "") + ">" + A.esc(x.dept.name) + "<span>" + x.count + "</span></button>"; }).join("");
  if (off) chips += '<button type="button" class="d-chip off" data-act="jump" data-d="off">Called off<span>' + off + "</span></button>";
  return '<div class="d-stick"><nav class="d-chips" aria-label="Departments">' + chips + '</nav><div class="d-axis"><span class="d-clock" aria-hidden="true">' + A.I.clock + "</span>" + ruler(A, sp, 282) + "</div></div>";
}

function row(P, A, l, r, sp) {
  var esc = A.esc, can = canEdit(P, A, l), me = P.role === "emp" && A.D.me.id === r.id;
  var st = (r.tags || []).map(function (t) { return '<span class="d-st k-' + t.kind + '">' + esc(t.t) + "</span>"; }).join("");
  var inner = tile(A, r.job) +
    '<span class="d-main"><span class="d-l1"><b class="d-nm">' + esc(r.name) + "</b>" + (r.label ? '<i class="d-lab">' + esc(r.label) + "</i>" : "") +
    (r.section ? '<span class="d-sec">' + esc(r.section) + "</span>" : "") + "</span>" +
    '<span class="d-l2"><span class="d-tm">' + A.range(r.in, r.out) + "</span>" + st + "</span>" + bar(A, sp, r.in, r.out) + "</span>";
  var st2 = ' style="--c:' + A.JOBS[r.job].c + '"';
  return can ? '<button type="button" class="d-row" data-act="person" data-id="' + r.id + '"' + st2 + ">" + inner + "</button>"
    : '<div class="d-row' + (me ? " me" : "") + '" data-id="' + r.id + '"' + st2 + ">" + inner + "</div>";
}

function list(P, A, l, sp) {
  var esc = A.esc, can = canEdit(P, A, l), groups = A.groups(l), out = "";
  A.DEPTS.forEach(function (d) {
    var g = groups.filter(function (x) { return x.dept.id === d.id; })[0];
    if (!g && !can) return;
    out += '<section class="d-dept" data-dsec="' + d.id + '"><div class="d-dh"><h2>' + esc(d.name) + (g ? "<span>" + g.count + "</span>" : "") + "</h2>" +
      (can ? '<button type="button" class="d-add" data-act="add" data-dept="' + d.id + '">' + A.I.plus + "Add Staff</button>" : "") + "</div>";
    if (!g) out += '<p class="d-none">No one yet</p>';
    else g.jobs.forEach(function (j) {
      out += '<div class="d-job" style="--c:' + j.job.c + '"><i></i>' + esc(j.job.name) + "<span>" + j.rows.length + "</span></div>";
      j.rows.forEach(function (r) { out += row(P, A, l, r, sp); });
    });
    out += "</section>";
  });
  var off = A.offRows(l);
  if (off.length) {
    out += '<section class="d-dept d-offs" data-dsec="off"><div class="d-dh"><h2>Called off<span>' + off.length + "</span></h2></div>" + off.map(function (r) {
      var canR = can && !r.moved;
      return '<div class="d-row off" data-id="' + r.id + '" style="--c:' + A.JOBS[r.job].c + '">' + tile(A, r.job) +
        '<span class="d-main"><span class="d-l1"><b class="d-nm">' + esc(r.name) + '</b></span><span class="d-l2">' +
        (r.moved ? '<span class="d-st k-from">Moved to ' + esc(r.moved) + "</span>" : '<span class="d-st k-off">Called off</span><span class="d-tm">' + A.short(r.in, r.out) + "</span>") + "</span></span>" +
        (canR ? '<button type="button" class="btn sm d-rs" data-act="restore" data-id="' + r.id + '">' + A.I.undo + "Restore</button>" : "") + "</div>";
    }).join("") + "</section>";
  }
  return '<div class="d-list">' + out + "</div>";
}

/* ---------------- manager ---------------- */
function mgr(P, A) {
  var cur = A.cur(P), l = cur.l, st = A.state(l), sp = span(A, l);
  var body = head(P, A, true) + status(P, A, l);
  if (st !== "empty") body += stick(P, A, l, sp);
  body += list(P, A, l, sp);
  return '<div class="scroll d-scroll">' + body + '<div class="d-end' + (P.toast ? " toast-room" : "") + '"></div></div>' + A.navMgr();
}

/* ---------------- employee ---------------- */
function emp(P, A) {
  var m = A.me(), l = m.l, r = m.r, esc = A.esc, I = A.I, t = A.TYPES[l.type], sp = span(A, l), body = head(P, A, false);
  if (l.status !== "published") {
    var sc = r.sched || { job: r.job, in: r.in, out: r.out };
    body += '<section class="d-wait"><span class="d-wait-ic">' + I.clock + "</span><h2>" + t.name + " lineup isn't out yet</h2><p>" + esc(A.first(A.MANAGER)) + " publishes it before your shift. You'll get a notification when it's ready.</p></section>" +
      '<section class="d-me sched" style="--c:' + A.JOBS[sc.job].c + '"><p class="d-eye">Your shift on the Schedule</p><div class="d-me-top">' + tile(A, sc.job, 44) + '<div><b class="d-me-time">' + A.range(sc.in, sc.out) + "</b><span>" + t.name + " · " + A.JOBS[sc.job].name + " · " + esc(A.LOCS[l.loc].name) + "</span></div></div>" +
      '<div class="d-me-tl">' + bar(A, sp, sc.in, sc.out) + ruler(A, sp, 304, "mini") + "</div></section>";
    return '<div class="scroll d-scroll emp">' + body + '<div class="d-end"></div></div>' + A.navEmp();
  }
  var ch = A.changed(r), time = A.range(r.in, r.out);
  var why = ch.in || ch.out ? "On the Schedule: " + (ch.in ? "<s>" + A.fmt(ch.sched.in) + "</s>" : A.fmt(ch.sched.in)) + " – " + (ch.out ? "<s>" + A.fmt(ch.sched.out) + "</s>" : A.fmt(ch.sched.out)) : "";
  var facts = [["Location", A.LOCS[l.loc].name], ["Position", A.JOBS[r.job].name]];
  if (r.section) facts.push(["Section", r.section]);
  if (r.label) facts.push(["Label", r.label]);
  body += '<section class="d-me" style="--c:' + A.JOBS[r.job].c + '"><p class="d-eye"><i class="d-dot" style="background:' + t.c + '"></i>Your shift · ' + t.name + '</p><div class="d-me-top">' + tile(A, r.job, 44) + "<div><b class=\"d-me-name\">" + esc(r.name) + '</b><b class="d-me-time">' + time + "</b></div></div>" +
    (why ? '<p class="d-me-why">' + why + "</p>" : "") +
    '<div class="d-me-tl">' + bar(A, sp, r.in, r.out, ch.in || ch.out ? ch.sched : null) + ruler(A, sp, 306, "mini") + "</div>" +
    '<dl class="d-facts">' + facts.map(function (f) { return "<div><dt>" + f[0] + "</dt><dd>" + esc(f[1]) + "</dd></div>"; }).join("") + "</dl></section>";
  var nk = NOTE_KEYS.filter(function (x) { return l.notes[x[0]]; });
  if (nk.length) body += '<section class="d-notes emp" aria-label="Notes"><h2 class="d-eye">From ' + esc(A.first(l.by)) + '</h2><dl>' + nk.map(function (x) { return "<div><dt>" + x[1] + "</dt><dd>" + esc(l.notes[x[0]]) + "</dd></div>"; }).join("") + "</dl></section>";
  body += '<section class="d-teamh"><h2>' + esc(A.LOCS[l.loc].name) + "</h2><p>" + A.DATE.long + " · " + t.name + " · " + A.live(l).length + " people</p></section>";
  body += stick(P, A, l, sp) + list(P, A, l, sp);
  if (A.D.meAcked) body += '<section class="d-ack done"><p class="d-acked">' + I.checkCircle + "<span><b>Acknowledged at " + A.fmt(hhmm(A.NOW)) + "</b>" + esc(A.first(l.by)) + " can see that you've read it.</span></p></section>";
  else if (A.D.ackOn) body += '<section class="d-ack"><p>Read it all? Let ' + esc(A.first(l.by)) + " know you've seen tonight's lineup.</p>" + '<button type="button" class="btn green block d-ackb" data-act="ack">' + I.check + "Acknowledge</button></section>";
  return '<div class="scroll d-scroll emp">' + body + '<div class="d-end' + (P.toast ? " toast-room" : "") + '"></div></div>' + A.navEmp();
}

/* ---------------- sheets ---------------- */
function frame(A, o) {
  return '<div class="scrim" data-act="close"></div><section class="sheet d-sheet' + (o.cls ? " " + o.cls : "") + '" role="dialog" aria-modal="true" aria-label="' + A.esc(o.title) + '">' +
    '<header class="d-sh"><i class="grab"></i><div class="d-sh-row">' + (o.lead || "") + '<div class="d-sh-t"><h3>' + A.esc(o.title) + "</h3>" + (o.sub ? "<p>" + o.sub + "</p>" : "") + "</div>" +
    '<button type="button" class="icon-btn d-x" aria-label="Close" data-act="close">' + A.I.x + "</button></div></header>" +
    '<div class="sheet-b d-sb">' + o.body + "</div>" + (o.foot ? '<footer class="sheet-f d-sf">' + o.foot + "</footer>" : "") + "</section>";
}
function selectHtml(A, f, opts, val, dis, label) {
  return '<label class="select d-sel"><span class="sr">' + label + '</span><select data-act="field" data-f="' + f + '"' + (dis ? " disabled" : "") + ">" + opts.map(function (o) { return '<option value="' + A.esc(o[0]) + '"' + (o[0] === val ? " selected" : "") + ">" + A.esc(o[1]) + "</option>"; }).join("") + "</select></label>";
}
function personSheet(P, A) {
  var l = A.D.L[P.sheet.k], r = A.find(P.sheet.k, P.sheet.id); if (!r) return "";
  var esc = A.esc, I = A.I, ro = !A.editable(P, l), ch = A.changed(r), sp = span(A, l), dis = ro ? " disabled" : "", t = A.TYPES[l.type];
  var moved = ch.sched && (ch.in || ch.out || ch.sched.job !== r.job);
  var b = ro ? '<p class="d-lock">' + I.lock + "<span>" + (A.state(l) === "started" ? "Started at " + A.fmt(A.firstIn(l)) + ". This lineup is read-only." : "Published. Tap Edit on the lineup to change it.") + "</span></p>" : "";
  b += '<div class="d-f"><span class="d-fl">Time<em>' + A.hours(r.in, r.out) + "</em></span>" +
    '<div class="d-times"><input class="input" inputmode="text" aria-label="In" data-act="field" data-f="in" value="' + A.fmt(r.in) + '"' + dis + '><span aria-hidden="true">–</span><input class="input" inputmode="text" aria-label="Out" data-act="field" data-f="out" value="' + A.fmt(r.out) + '"' + dis + "></div>" +
    '<div class="d-sh-tl" style="--c:' + A.JOBS[r.job].c + '">' + bar(A, sp, r.in, r.out, moved && (ch.in || ch.out) ? ch.sched : null) + ruler(A, sp, 338, "mini") + "</div>" +
    '<p class="d-hint">' + (moved ? "Schedule: " + esc(A.JOBS[ch.sched.job].name) + ", " + A.range(ch.sched.in, ch.sched.out) + ". Changed in this lineup only." : r.only || !r.sched ? "In this lineup only, not on the Schedule." : "Changes stay in this lineup, not the Schedule.") + "</p></div>";
  b += '<div class="d-f"><span class="d-fl">Label</span><div class="d-seg" role="radiogroup" aria-label="Label">' + [["", "None"]].concat(A.LABELS.map(function (x) { return [x, x]; })).map(function (o) {
    return '<button type="button" role="radio" aria-checked="' + (r.label === o[0]) + '" data-act="field" data-f="label" value="' + o[0] + '"' + dis + ">" + o[1] + "</button>";
  }).join("") + "</div></div>";
  b += '<div class="two d-two"><div class="d-f"><span class="d-fl">Section</span>' + selectHtml(A, "section", [["", "None"]].concat(A.sections(l.loc).map(function (x) { return [x, x]; })).concat([["__add", "+ Add section…"]]), r.section, ro, "Section") + "</div>" +
    '<div class="d-f"><span class="d-fl">Position</span>' + selectHtml(A, "job", Object.keys(A.JOBS).map(function (j) { return [j, A.JOBS[j].name]; }), r.job, ro, "Position") + "</div></div>";
  var tags = (r.tags || []).map(function (x) { return '<span class="d-st k-' + x.kind + '">' + esc(x.t) + "</span>"; }).join("");
  var foot = ro ? '<button type="button" class="btn" data-act="close">Close</button>'
    : '<button type="button" class="btn danger d-off' + (P.armed === "off" ? " armed" : "") + '" data-act="calloff">' + (P.armed === "off" ? "Tap again to call off" : "Call off") + '</button><button type="button" class="btn green" data-act="close">Done</button>';
  return frame(A, { title: r.name, lead: tile(A, r.job, 44), sub: esc(A.JOBS[r.job].name) + " · " + t.name + " · " + esc(A.LOCS[l.loc].name) + (tags ? '<span class="d-sh-tags">' + tags + "</span>" : ""), body: b, foot: foot, cls: "d-person" });
}
function addSheet(P, A) {
  var l = A.D.L[P.sheet.k], esc = A.esc, I = A.I, t = A.TYPES[l.type], dept = A.DEPTS.filter(function (d) { return d.id === P.sheet.dept; })[0] || A.DEPTS[0];
  var body = A.candidates(P).map(function (g) {
    return '<p class="d-cg">' + esc(g.title) + "<span>" + g.items.length + '</span></p><div class="d-cl">' + g.items.map(function (x) {
      var c = x.c, armed = P.armed === "pick-" + c.n, jn = A.JOBS[x.job].name, line, cls = "";
      if (c.kind === "available") { line = x.rank === 2 ? esc(c.jobs.map(function (j) { return A.JOBS[j].name; }).join(", ")) : '<em class="ok">Free today</em> · ' + jn; }
      else if (c.kind === "here") line = esc(c.note.replace(" here", "")) + " · " + (c.hrs + 6) + "h today";
      else if (c.kind === "other") { line = esc(c.note); cls = "info"; }
      else if (c.kind === "timeoff") { line = esc(c.note); cls = "warn"; }
      else line = esc(c.note);
      var btn = c.kind === "no" ? "" : '<button type="button" class="d-pick' + (armed ? " armed" : "") + '" data-act="pick" data-n="' + esc(c.n) + '">' +
        (armed ? (c.kind === "other" ? "Confirm move" : "Add anyway") : c.kind === "other" ? "Move here" : I.plus + "Add") + "</button>";
      var why = armed ? '<p class="d-why ' + (c.kind === "other" ? "info" : "warn") + '">' + (c.kind === "other" ? esc(A.first(c.n)) + " leaves Uptown's Dinner lineup. Uptown sees the move and can bring " + esc(A.first(c.n)) + " back." : esc(A.first(c.n)) + " has an approved day off. Adding puts " + esc(A.first(c.n)) + " in this lineup only; the day off and the Schedule don't change.") + "</p>" : "";
      return '<div class="d-cand' + (c.kind === "no" ? " no" : x.rank === 2 ? " dim" : "") + (armed ? " is-armed" : "") + '">' + tile(A, x.job, 40) +
        '<span class="d-cn"><b>' + esc(c.n) + '</b><span class="' + cls + '">' + line + "</span></span>" + btn + why + "</div>";
    }).join("") + "</div>";
  }).join("");
  return frame(A, { title: "Add to " + dept.name, sub: t.name + " · " + A.range(t.def[0], t.def[1]) + " · " + esc(A.LOCS[l.loc].name), body: body, cls: "d-addsh" });
}
function publishSheet(P, A) {
  var esc = A.esc, I = A.I, body = "";
  if (P.pubDone) body += '<p class="d-ok">' + I.checkCircle + "<span>" + esc(P.pubDone) + "</span></p>";
  ["dt", "up"].forEach(function (loc) {
    body += '<p class="d-cg">' + A.LOCS[loc].name + '</p><div class="d-pl">';
    A.lineupsAt(loc).forEach(function (l) {
      var n = A.live(l).length, st = A.state(l), t = A.TYPES[l.type], sp = span(A, l);
      var name = '<span class="d-pt"><b><i class="d-sw" style="--c:' + t.c + '"></i>' + t.name + "</b>";
      if (!n) { body += '<div class="d-pr empty"><span class="d-pc none"></span>' + name + "<span>No one is scheduled</span></span></div>"; return; }
      if (st === "draft") {
        body += '<label class="d-pr"><input type="checkbox" class="cb d-cb" aria-label="Publish ' + esc(A.LOCS[loc].name) + " " + t.name + '" data-act="pub-pick" data-k="' + l.k + '"' + (P.picks.indexOf(l.k) >= 0 ? " checked" : "") + ">" + name +
          "<span>" + n + " people · " + A.short(hhmm(sp.a), hhmm(sp.b)) + " · Draft</span></span></label>";
      } else body += '<div class="d-pr"><span class="d-pc">' + I.check + "</span>" + name + "<span>" + (st === "started" ? "Started" : "Published " + esc(l.at)) + " · " + l.acked + " of " + n + " read</span></span></div>";
    });
    body += "</div>";
  });
  if (!P.pubDone) body += '<div class="d-sw-row"><span><b>Ask staff to acknowledge</b><span>Each person confirms they\'ve read it.</span></span><button type="button" class="tog" role="switch" aria-checked="' + A.D.ackOn + '" aria-label="Ask staff to acknowledge" data-act="pub-ack"></button></div>';
  var n = P.picks.length;
  var foot = P.pubDone ? '<button type="button" class="btn green" data-act="close">Done</button>'
    : '<button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn green" data-act="pub-go"' + (n ? "" : " disabled") + ">" + I.send + "Publish" + (n ? " " + n : "") + "</button>";
  return frame(A, { title: "Publish lineups", sub: A.DATE.long + ". Staff see a lineup once it's published.", body: body, foot: foot, cls: "d-pubsh" });
}
function editSheet(P, A) {
  var l = A.D.L[P.sheet.k], I = A.I, t = A.TYPES[l.type];
  var body = '<ul class="d-steps"><li>' + I.edit + "<span>" + t.name + " goes back to draft. Staff don't see it until you publish again.</span></li><li>" + I.bell + "<span>People whose spot changes are asked to acknowledge again.</span></li></ul>";
  return frame(A, { title: "Edit " + t.name + " lineup?", sub: "Published " + A.esc(l.at) + " · " + l.acked + " of " + A.live(l).length + " read", body: body, foot: '<button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn green" data-act="unpub-go">Unpublish &amp; edit</button>', cls: "d-editsh" });
}
function notesSheet(P, A) {
  var l = A.D.L[P.sheet.k], t = A.TYPES[l.type];
  var hints = { sp: "Dishes to push tonight", s86: "What the kitchen is out of", sn: "Anything else the team should know" };
  var f = NOTE_KEYS.map(function (x) { return '<label class="d-f"><span class="d-fl">' + x[1] + '</span><textarea class="input d-ta" data-note="' + x[0] + '" placeholder="' + hints[x[0]] + '">' + A.esc(l.notes[x[0]]) + "</textarea></label>"; }).join("");
  return frame(A, { title: t.name + " notes", sub: "Staff see these with the lineup. Empty notes don't show.", body: f, foot: '<button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn green" data-act="notes-save">Save</button>', cls: "d-notesh" });
}

/* ---------------- scroll helpers ---------------- */
function spy(app) {
  var sc = app.querySelector(".d-scroll"), stk = app.querySelector(".d-stick"); if (!sc || !stk) return;
  var chips = app.querySelectorAll(".d-chip"), secs = app.querySelectorAll("[data-dsec]");
  var y0 = sc.getBoundingClientRect().top + stk.offsetHeight + 2, cur = null;
  secs.forEach(function (s) { if (s.getBoundingClientRect().top <= y0 + 1) cur = s.dataset.dsec; });
  if (!cur && secs.length) cur = secs[0].dataset.dsec;
  if (sc.scrollTop > 0 && sc.scrollHeight > sc.clientHeight + 2 && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2 && secs.length) cur = secs[secs.length - 1].dataset.dsec;
  chips.forEach(function (c) { if (c.dataset.d === cur) { c.setAttribute("aria-current", "true"); reveal(c); } else c.removeAttribute("aria-current"); });
}
function reveal(chip) {
  var nav = chip.parentNode; if (!nav || nav.scrollWidth <= nav.clientWidth) return;
  var l = chip.offsetLeft - 16, r = chip.offsetLeft + chip.offsetWidth + 28 - nav.clientWidth;
  if (l < nav.scrollLeft) nav.scrollLeft = l; else if (r > nav.scrollLeft) nav.scrollLeft = r;
}
function fade(app) {
  var nav = app.querySelector(".d-chips"); if (!nav) return;
  function set() { var more = nav.scrollWidth - nav.clientWidth - nav.scrollLeft > 2, less = nav.scrollLeft > 2; nav.classList.toggle("more", more); nav.classList.toggle("less", less); }
  nav.addEventListener("scroll", set, { passive: true }); set();
}

NF.variant({
  id: "d",
  name: "4 · Vardiya çizgisi",
  sub: "Her kişinin satırında, vardiyanın saat çizelgesi üzerinde ince bir geliş–çıkış çizgisi var; kim ne zaman gelip çıkıyor bir bakışta görünür. Üst kısım kısaldı, departman düğmeleri kaydırırken üstte kalır; Publish ve Edit vardiyanın durum satırında.",
  render: function (P, A) { return P.role === "emp" ? emp(P, A) : mgr(P, A); },
  sheet: function (P, A) {
    var t = P.sheet && P.sheet.type;
    return t === "person" ? personSheet(P, A) : t === "add" ? addSheet(P, A) : t === "publish" ? publishSheet(P, A) : t === "editpub" ? editSheet(P, A) : t === "notes" ? notesSheet(P, A) : null;
  },
  acts: {
    jump: function (el) {
      var app = el.closest(".app"), sc = app.querySelector(".d-scroll"), stk = app.querySelector(".d-stick"), sec = app.querySelector('[data-dsec="' + el.dataset.d + '"]');
      if (!sc || !sec) return false;
      var y = sec.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - (stk ? stk.offsetHeight : 0);
      sc.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      app.querySelectorAll(".d-chip").forEach(function (c) { if (c === el) { c.setAttribute("aria-current", "true"); reveal(c); } else c.removeAttribute("aria-current"); });
      return false;
    }
  },
  after: function (app) {
    var sc = app.querySelector(".d-scroll"); if (!sc) return;
    var raf = 0;
    sc.addEventListener("scroll", function () { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; spy(app); }); }, { passive: true });
    fade(app); spy(app);
  }
});
})();
