/* Variant A · Sakin liste (calm list).
   One quiet grouped list: every department is one white inset group, every person row has the
   same two-line, two-slot layout (name + section / time + label). Light header, sticky shift tabs. */
(function () {
"use strict";

var NOTE_KEYS = [["sp", "Specials"], ["s86", "86s"], ["sn", "Shift notes"]];

/* ---------- small helpers ---------- */
function canEdit(P, A, l) {
  /* A.editable() is false for an empty shift ("empty" state), but an empty draft must still take people. */
  var st = A.state(l);
  return P.role === "mgr" && l.status !== "published" && (st === "draft" || st === "empty");
}
function nowText(A) { var h = Math.floor(A.NOW / 60), m = A.NOW % 60; return A.fmt((h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m); }
function av(A, job, cls) { return '<span class="a-av' + (cls ? " " + cls : "") + '">' + A.icon(job, cls === "lg" ? 56 : cls === "sm" ? 44 : 48) + "</span>"; }
function tagHtml(A, r) {
  return A.tags(r).map(function (t) { return '<i class="a-tag k-' + t.kind + '">' + A.esc(t.t) + "</i>"; }).join("");
}
function endSpace(P) { return '<div class="a-end' + (P.toast ? " has-toast" : "") + '"></div>'; }
function chev(A, open) { return '<span class="a-chev' + (open ? " up" : "") + '">' + A.I.down + "</span>"; }

/* ---------- one person row: icon | name ... section / time ... label ---------- */
function row(P, A, r, o) {
  var esc = A.esc, tags = tagHtml(A, r), el = o.tap ? "button" : "div";
  return "<" + el + (o.tap ? ' type="button" data-act="person"' : "") + ' class="a-row' + (o.me ? " is-me" : "") + '" data-id="' + r.id + '">' +
    av(A, r.job) +
    '<span class="a-txt">' +
      '<span class="a-l1"><span class="a-nm">' + esc(r.name) + (o.me ? '<span class="sr"> (you)</span>' : "") + "</span>" + (r.section ? '<span class="a-sec">' + esc(r.section) + "</span>" : "") + "</span>" +
      '<span class="a-l2"><span class="a-tm">' + A.range(r.in, r.out) + "</span>" + (tags ? '<span class="a-tags">' + tags + "</span>" : "") + "</span>" +
    "</span></" + el + ">";
}

/* ---------- departments → jobs → rows ---------- */
function depts(P, A, l, mode) {
  var esc = A.esc, groups = A.groups(l), by = {};
  groups.forEach(function (g) { by[g.dept.id] = g; });
  var list = mode === "edit" ? A.DEPTS : groups.map(function (g) { return g.dept; });
  var meId = P.role === "emp" ? A.D.me.id : null;
  var edDone = !(mode === "view" && A.state(l) === "published");
  return list.map(function (d) {
    var g = by[d.id];
    var head = '<div class="a-dh"><h2>' + esc(d.name) + (g ? '<span class="a-n">' + g.count + "</span>" : "") + "</h2>" +
      (mode === "edit" ? '<button type="button" class="a-add" data-act="add" data-dept="' + d.id + '" aria-label="Add staff to ' + esc(d.name) + '">' + A.I.plus + "Add Staff</button>" : "") + "</div>";
    var body = g ? g.jobs.map(function (j, ji) {
      var ed = mode === "view" && P.role === "mgr" && !edDone && ji === 0 ? (edDone = true, '<button type="button" class="a-sbtn a-gedit" data-act="editpub">' + A.I.edit + "Edit</button>") : "";
      return '<p class="a-job">' + esc(j.job.name) + '<span class="a-n">' + j.rows.length + "</span>" + ed + "</p>" +
        j.rows.map(function (r) { return row(P, A, r, { tap: P.role === "mgr" && mode !== "locked", me: r.id === meId }); }).join("");
    }).join("") : '<p class="a-none">No one yet</p>';
    return '<section class="a-dept">' + head + '<div class="a-grp">' + body + "</div></section>";
  }).join("");
}

function offBlock(P, A, l, can) {
  var esc = A.esc, off = A.offRows(l);
  if (!off.length) return "";
  return '<section class="a-dept a-offs"><div class="a-dh"><h2>Called off<span class="a-n">' + off.length + '</span></h2></div><div class="a-grp">' +
    off.map(function (r) {
      var what = r.moved ? "Moved to " + esc(r.moved) : A.JOBS[r.job].name + " · Called off";
      return '<div class="a-row is-off" data-id="' + r.id + '">' + av(A, r.job) +
        '<span class="a-txt"><span class="a-l1"><span class="a-nm">' + esc(r.name) + '</span></span><span class="a-l2"><span class="a-tm">' + what + "</span></span></span>" +
        (can && !r.moved ? '<button type="button" class="a-mini" data-act="restore" data-id="' + r.id + '">Restore</button>' : "") + "</div>";
    }).join("") + "</div></section>";
}

/* ---------- notes ---------- */
function noteCount(l) { return NOTE_KEYS.filter(function (x) { return l.notes[x[0]]; }).length; }
function notesGroup(A, l, can) {
  var esc = A.esc, items = NOTE_KEYS.filter(function (x) { return l.notes[x[0]]; });
  var body = items.length ? items.map(function (x) { return '<div class="a-note"><span>' + x[1] + "</span><p>" + esc(l.notes[x[0]]) + "</p></div>"; }).join("")
    : '<p class="a-none">No specials, 86s or shift notes yet.</p>';
  return '<div class="a-grp">' + body + (can ? '<button type="button" class="a-gbtn" data-act="notes">' + A.I.edit + (items.length ? "Edit notes" : "Add notes") + "</button>" : "") + "</div>";
}

/* ---------- manager ---------- */
function header(P, A) {
  var I = A.I, n = A.drafts().length;
  var pub = n ? '<button type="button" class="btn green a-pub" data-act="publish">' + I.send + 'Publish<span class="a-cnt" aria-label="' + n + ' draft' + (n > 1 ? "s" : "") + '">' + n + "</span></button>"
    : '<span class="a-allpub">' + I.checkCircle + "All published</span>";
  var loc = '<label class="a-loc"><span class="sr">Location</span>' + I.pin.replace("<svg", '<svg class="a-pin"') + '<select data-act="loc">' +
    ["dt", "up"].map(function (k) { return '<option value="' + k + '"' + (P.loc === k ? " selected" : "") + ">" + A.LOCS[k].name + "</option>"; }).join("") +
    "</select>" + I.down.replace("<svg", '<svg class="a-dn"') + "</label>";
  return '<header class="a-head"><div class="a-top"><h1>Lineup</h1>' + pub + "</div>" +
    '<div class="a-ctx">' + dateCtl(A) + loc + "</div></header>";
}
function dateCtl(A) {
  return '<div class="a-date" role="group" aria-label="Day"><button type="button" data-act="noop" aria-label="Previous day">' + A.I.left + "</button><b>" + A.DATE.short + '</b><button type="button" data-act="noop" aria-label="Next day">' + A.I.right + "</button></div>";
}
function tabs(P, A) {
  return '<nav class="a-tabs" role="tablist" aria-label="Shifts">' + A.lineupsAt(P.loc).map(function (x) {
    var on = x.type === P.tab, st = A.state(x), t = A.TYPES[x.type];
    return '<button type="button" role="tab" class="a-tab" aria-selected="' + on + '" style="--c:' + t.c + '" data-act="tab" data-t="' + x.type + '">' +
      (st === "draft" ? '<i class="a-dot" aria-hidden="true"></i>' : "") + t.name + '<span class="a-n">' + A.live(x).length + "</span>" +
      (st === "draft" ? '<span class="sr">, draft</span>' : st === "empty" ? "" : '<span class="sr">, published</span>') + "</button>";
  }).join("") + "</nav>";
}
function status(P, A, l, st, can) {
  var I = A.I, s = A.stats(l), line, sum, acts = "";
  if (st === "draft") {
    line = '<b class="a-st is-draft"><i class="a-dot"></i><span>Draft<span class="a-mut"> · not published</span></span></b>';
    sum = s.n ? s.n + " on the floor · First in " + A.fmt(s.first) : "No one on the floor";
  } else if (st === "published") {
    line = '<b class="a-st is-pub">' + I.checkCircle + "<span>" + (l.v > 1 ? "Republished " : "Published ") + A.esc(l.at) + "</span></b>";
    sum = s.n + " on the floor · " + l.acked + " of " + s.n + " acknowledged";
  } else {
    line = '<b class="a-st is-run">' + I.lock + "<span>Started " + A.fmt(s.first) + '<span class="a-mut"> · read-only</span></span></b>';
    sum = s.n + " on the floor · " + l.acked + " of " + s.n + " acknowledged";
  }
  var nc = noteCount(l), open = P.seg === "notes";
  if (nc || can) acts += '<button type="button" class="a-sbtn" data-act="seg" data-s="' + (open ? "team" : "notes") + '" aria-expanded="' + open + '">Notes' + (nc ? '<span class="a-n">' + nc + "</span>" : "") + chev(A, open) + "</button>";
  // Mert 2026-10-14: no status text; Edit sits on the first white group
  return acts ? '<section class="a-status a-status-min"><div class="a-acts">' + acts + "</div></section>" : "";
}
function mgr(P, A) {
  var cur = A.cur(P), l = cur.l, st = A.state(l), can = canEdit(P, A, l), t = A.TYPES[l.type];
  var html = header(P, A) + tabs(P, A);
  if (st === "empty") {
    html += '<section class="a-empty"><h2>No one on ' + t.name + " yet</h2><p>Add people by department. Each person starts with " + A.range(t.def[0], t.def[1]) + ".</p></section>" +
      '<div class="a-grp a-elist">' + A.DEPTS.map(function (d) {
        return '<div class="a-erow"><span>' + A.esc(d.name) + '</span><button type="button" class="a-add" data-act="add" data-dept="' + d.id + '" aria-label="Add staff to ' + A.esc(d.name) + '">' + A.I.plus + "Add Staff</button></div>";
      }).join("") + "</div>";
  } else {
    html += status(P, A, l, st, can);
    if (P.seg === "notes") html += '<section class="a-notes" aria-label="' + t.name + ' notes">' + notesGroup(A, l, can) + "</section>";
    html += depts(P, A, l, can ? "edit" : st === "started" ? "locked" : "view") + offBlock(P, A, l, can);
  }
  return '<div class="scroll">' + html + endSpace(P) + "</div>" + A.navMgr();
}

/* ---------- employee ---------- */
function emp(P, A) {
  var esc = A.esc, I = A.I, m = A.me(), l = m.l, r = m.r, t = A.TYPES[l.type], loc = A.LOCS[l.loc].name;
  var live = l.status === "published";
  var top = '<header class="a-head"><div class="a-top"><h1>Lineup</h1>' + dateCtl(A) + "</div></header>";
  var sched = r.sched || { job: r.job, in: r.in, out: r.out };
  var body;
  if (!live) {
    body = '<section class="a-mine" style="--c:' + t.c + '"><div class="a-mine-h"><p class="a-eb"><i class="a-sdot"></i>' + t.name + " · " + loc + '</p><p class="a-big">' + A.range(sched.in, sched.out) + "</p></div>" +
      '<div class="a-row">' + av(A, sched.job) + '<span class="a-txt"><span class="a-l1"><span class="a-nm">' + esc(r.name) + '</span></span><span class="a-l2"><span class="a-tm">' + A.JOBS[sched.job].name + "</span></span></span></div></section>" +
      '<section class="a-wait"><span class="a-wic">' + I.clock + "</span><h2>The " + t.name + " lineup isn't out yet</h2><p>You'll get a notification when " + esc(A.first(A.MANAGER)) + " publishes it. Your section, the notes and the team show up here.</p></section>";
  } else if (r.off) {
    body = '<section class="a-wait"><span class="a-wic">' + I.calendar + "</span><h2>You're off the " + t.name + " lineup</h2><p>" + esc(A.first(A.MANAGER)) + " took you off today's " + t.name + " lineup. Your Schedule doesn't change.</p></section>";
  } else {
    var ch = A.changed(r), was = "";
    if (ch.in || ch.out) was = '<p class="a-was">Schedule: ' + (ch.in ? "<s>" + A.fmt(ch.sched.in) + "</s>" : A.fmt(ch.sched.in)) + " – " + (ch.out ? "<s>" + A.fmt(ch.sched.out) + "</s>" : A.fmt(ch.sched.out)) + "</p>";
    var tags = tagHtml(A, r);
    body = '<section class="a-mine" style="--c:' + t.c + '" aria-label="Your shift"><div class="a-mine-h"><p class="a-eb"><i class="a-sdot"></i>' + t.name + " · " + loc + '</p><p class="a-big">' + A.range(r.in, r.out) + "</p>" + was + "</div>" +
      '<div class="a-row">' + av(A, r.job) + '<span class="a-txt"><span class="a-l1"><span class="a-nm">' + esc(r.name) + "</span>" + (r.section ? '<span class="a-sec">' + esc(r.section) + "</span>" : "") + "</span>" +
      '<span class="a-l2"><span class="a-tm">' + A.JOBS[r.job].name + "</span>" + (tags ? '<span class="a-tags">' + tags + "</span>" : "") + "</span></span></div></section>";
    if (noteCount(l)) body += '<section class="a-dept a-enotes"><div class="a-dh"><h2>Notes</h2></div>' + notesGroup(A, l, false) + "</section>";
    body += '<section class="a-team"><h2>' + esc(loc) + "</h2><p>" + A.DATE.long + " · " + t.name + "</p></section>" + depts(P, A, l, "view");
    if (A.D.ackOn) body += A.D.meAcked
      ? '<p class="a-acked" role="status">' + I.checkCircle + "Acknowledged at " + nowText(A) + "</p>"
      : '<div class="a-ackbox"><button type="button" class="btn green block a-ackbtn" data-act="ack">' + I.check + "Acknowledge</button></div>";
  }
  return '<div class="scroll">' + top + body + endSpace(P) + "</div>" + A.navEmp();
}

/* ---------- sheets ---------- */
function frame(A, o) {
  return '<div class="scrim" data-act="close"></div><section class="sheet a-sheet' + (o.cls ? " " + o.cls : "") + '" role="dialog" aria-modal="true" aria-label="' + A.esc(o.title) + '">' +
    '<header class="sheet-h"><i class="grab" aria-hidden="true"></i><div class="a-shr">' + (o.lead || "") + '<div class="a-sht"><h3>' + A.esc(o.title) + "</h3>" + (o.sub ? "<p>" + o.sub + "</p>" : "") + "</div>" +
    '<button type="button" class="a-x" aria-label="Close" data-act="close">' + A.I.x + "</button></div></header>" +
    '<div class="sheet-b">' + o.body + "</div>" + (o.foot ? '<footer class="sheet-f">' + o.foot + "</footer>" : "") + "</section>";
}
function selectHtml(A, f, opts, val, label) {
  return '<span class="a-fsel"><select data-act="field" data-f="' + f + '" aria-label="' + label + '">' + opts.map(function (o) {
    return '<option value="' + A.esc(o[0]) + '"' + (o[0] === val ? " selected" : "") + ">" + A.esc(o[1]) + "</option>";
  }).join("") + "</select>" + A.I.down + "</span>";
}
function personSheet(P, A) {
  var esc = A.esc, I = A.I, l = A.D.L[P.sheet.k], r = A.find(P.sheet.k, P.sheet.id);
  if (!r) return "";
  var ro = !canEdit(P, A, l), st = A.state(l), ch = A.changed(r);
  var sub = A.JOBS[r.job].name + " · " + A.TYPES[l.type].name + " · " + A.LOCS[l.loc].name;
  var body = "";
  if (ro) {
    body += '<p class="a-lock">' + I.lock + "<span>" + (st === "started" ? "Started at " + A.fmt(A.firstIn(l)) + ". This lineup is read-only." : "Published at " + esc(l.at) + ". Unpublish to change it.") + "</span></p>";
    var tg = A.tags(r).map(function (t) { return t.t; }).join(", ");
    body += '<div class="a-fg">' +
      '<div class="a-fr"><span class="a-fl">Position</span><span class="a-fv">' + A.JOBS[r.job].name + "</span></div>" +
      '<div class="a-fr"><span class="a-fl">Time</span><span class="a-fv tn">' + A.range(r.in, r.out) + "</span></div>" +
      (r.section ? '<div class="a-fr"><span class="a-fl">Section</span><span class="a-fv">' + esc(r.section) + "</span></div>" : "") +
      (tg ? '<div class="a-fr"><span class="a-fl">Label</span><span class="a-fv">' + esc(tg) + "</span></div>" : "") + "</div>";
  } else {
    var labels = [["", "None"]].concat(A.LABELS.map(function (x) { return [x, x]; }));
    body += '<div class="a-fg">' +
      '<label class="a-fr"><span class="a-fl">Position</span>' + selectHtml(A, "job", Object.keys(A.JOBS).map(function (j) { return [j, A.JOBS[j].name]; }), r.job, "Position") + "</label>" +
      '<div class="a-fr"><span class="a-fl" id="a-tl">Time</span><span class="a-times" role="group" aria-labelledby="a-tl">' +
        '<input class="input a-tin" inputmode="text" autocomplete="off" aria-label="In" data-act="field" data-f="in" value="' + A.fmt(r.in) + '">' +
        '<span class="a-dash" aria-hidden="true">–</span>' +
        '<input class="input a-tin" inputmode="text" autocomplete="off" aria-label="Out" data-act="field" data-f="out" value="' + A.fmt(r.out) + '"></span></div>' +
      '<label class="a-fr"><span class="a-fl">Section</span>' + selectHtml(A, "section", [["", "None"]].concat(A.sections(l.loc).map(function (x) { return [x, x]; })).concat([["__add", "+ New section"]]), r.section, "Section") + "</label>" +
      '<label class="a-fr"><span class="a-fl">Label</span>' + selectHtml(A, "label", labels, r.label || "", "Label") + "</label></div>";
  }
  var schedChanged = ch.sched && (ch.in || ch.out || ch.sched.job !== r.job);
  var hint = schedChanged ? "Changed in this lineup only. Schedule: " + A.JOBS[ch.sched.job].name + ", " + A.range(ch.sched.in, ch.sched.out) + "."
    : !r.sched ? "Added in this lineup only. Not in the Schedule." : ro ? "" : "Changes stay in this lineup, not in the Schedule.";
  if (hint) body += '<p class="a-hint">' + hint + "</p>";
  var foot = ro
    ? (st === "published" ? '<button type="button" class="btn" data-act="close">Close</button><button type="button" class="btn green" data-act="editpub">' + I.edit + "Edit lineup</button>" : '<button type="button" class="btn" data-act="close">Close</button>')
    : '<button type="button" class="btn danger' + (P.armed === "off" ? " armed" : "") + '" data-act="calloff">' + (P.armed === "off" ? "Tap again to call off" : "Call off") + '</button><button type="button" class="btn green" data-act="close">Done</button>';
  return frame(A, { title: r.name, sub: esc(sub), lead: av(A, r.job, "lg"), body: body, foot: foot, cls: "a-ps" });
}
/* The candidate's other shift today, from the live lineups: { name, loc, inn, out } */
function otherShift(A, l, c) {
  var keys = c.from ? [c.from] : A.TYPE_ORDER.map(function (t) { return l.loc + "-" + t; }).filter(function (k) { return k !== l.k; });
  for (var i = 0; i < keys.length; i++) {
    var L2 = A.D.L[keys[i]]; if (!L2) continue;
    var r = L2.rows.filter(function (x) { return x.name === c.n && !x.off; })[0];
    if (r) return { name: A.TYPES[L2.type].name, loc: A.LOCS[L2.loc].name, inn: r.in, out: r.out };
  }
  return null;
}
function spanH(A, a, b) { var x = A.min(a), y = A.min(b); return ((y <= x ? y + 1440 : y) - x) / 60; }
function hereLine(A, l, c) {
  var o = otherShift(A, l, c), t = A.TYPES[l.type];
  if (!o) return A.esc(c.note);
  var total = Math.round((spanH(A, o.inn, o.out) + spanH(A, t.def[0], t.def[1])) * 10) / 10;
  return o.name + " · " + A.range(o.inn, o.out) + '<span class="a-cl2">' + total + "h in total with " + t.name + "</span>";
}
function otherLine(A, l, c) {
  var o = otherShift(A, l, c);
  if (!o) return '<span class="info">' + A.esc(c.note) + "</span>";
  return '<span class="info">' + o.name + " at " + o.loc + '</span><span class="a-cl2">' + A.range(o.inn, o.out) + "</span>";
}
function addSheet(P, A) {
  var esc = A.esc, I = A.I, l = A.D.L[P.sheet.k];
  var dept = A.DEPTS.filter(function (d) { return d.id === P.sheet.dept; })[0] || A.DEPTS[0];
  var groups = A.candidates(P);
  var body = '<label class="a-search">' + I.search + '<span class="sr">Search by name</span><input type="search" class="a-q" placeholder="Search by name" autocomplete="off"></label>';
  body += groups.map(function (g) {
    return '<section class="a-cg"><p class="a-cgh">' + esc(g.title) + '<span class="a-n">' + g.items.length + '</span></p><div class="a-grp">' + g.items.map(function (x) {
      var c = x.c, armed = P.armed === "pick-" + c.n, first = esc(A.first(c.n));
      var line = c.kind === "available" ? (x.rank === 2 ? 'Free today<span class="a-cl2">' + esc(c.jobs.map(function (j) { return A.JOBS[j].name; }).join(", ")) + "</span>" : '<span class="ok">Free today</span>')
        : c.kind === "here" ? hereLine(A, l, c)
        : c.kind === "other" ? otherLine(A, l, c)
        : c.kind === "timeoff" ? '<span class="warn">' + esc(c.note) + "</span>" : esc(c.note);
      var btn = c.kind === "no" ? "" : '<button type="button" class="a-pick' + (armed ? " armed k-" + c.kind : c.kind === "other" ? " k-move" : "") + '" data-act="pick" data-n="' + esc(c.n) + '">' +
        (armed ? (c.kind === "other" ? "Confirm move" : "Add anyway") : c.kind === "other" ? "Move here" : I.plus + "Add") + "</button>";
      var why = armed ? '<p class="a-why k-' + c.kind + '">' + (c.kind === "other" ? first + " leaves Uptown's Dinner. Uptown can bring " + first + " back."
        : "The day off stays. " + first + " joins this lineup only.") + "</p>" : "";
      return '<div class="a-cand' + (c.kind === "no" ? " is-no" : x.rank === 2 ? " is-dim" : "") + (armed ? " is-armed" : "") + '" data-n="' + esc(c.n) + '">' + av(A, x.job, "sm") +
        '<span class="a-txt"><span class="a-nm">' + esc(c.n) + '</span><span class="a-cl">' + line + "</span></span>" + btn + why + "</div>";
    }).join("") + "</div></section>";
  }).join("");
  body += '<p class="a-none a-nohit" hidden>No one by that name.</p>';
  return frame(A, { title: "Add to " + dept.name, sub: A.TYPES[l.type].name + " · " + A.LOCS[l.loc].name + " · " + A.DATE.short, body: body, cls: "a-as" });
}
function publishSheet(P, A) {
  var esc = A.esc, I = A.I, body = "";
  if (P.pubDone) body += '<p class="a-done" role="status">' + I.checkCircle + "<span>" + esc(P.pubDone) + "</span></p>";
  ["dt", "up"].forEach(function (loc) {
    body += '<section class="a-cg"><p class="a-cgh">' + A.LOCS[loc].name + '</p><div class="a-grp">' + A.lineupsAt(loc).map(function (l) {
      var n = A.live(l).length, st = A.state(l), name = A.TYPES[l.type].name;
      if (!n) return '<div class="a-pr is-none"><span class="a-pk none" aria-hidden="true"><i></i></span><span class="a-txt"><span class="a-nm">' + name + '</span><span class="a-cl">No one scheduled</span></span></div>';
      if (st === "draft") {
        var on = P.picks.indexOf(l.k) >= 0;
        return '<button type="button" class="a-pr" role="checkbox" aria-checked="' + on + '" data-act="pub-pick" data-k="' + l.k + '"><span class="a-pk' + (on ? " on" : "") + '" aria-hidden="true">' + (on ? I.check : "") + '</span><span class="a-txt"><span class="a-nm">' + name + '</span><span class="a-cl">' + n + " people · Draft</span></span></button>";
      }
      return '<div class="a-pr"><span class="a-pk done" aria-hidden="true">' + I.check + '</span><span class="a-txt"><span class="a-nm">' + name + '</span><span class="a-cl">' + (st === "started" ? "Started" : "Published " + esc(l.at)) + " · " + l.acked + " of " + n + " acknowledged</span></span></div>";
    }).join("") + "</div></section>";
  });
  body += '<div class="a-grp a-tgl"><span class="a-txt"><span class="a-nm">Ask staff to acknowledge</span><span class="a-cl">Staff tap Acknowledge after reading.</span></span><button type="button" class="tog" role="switch" aria-checked="' + A.D.ackOn + '" aria-label="Ask staff to acknowledge" data-act="pub-ack"></button></div>';
  var n = P.picks.length;
  var foot = !n && P.pubDone ? '<button type="button" class="btn green" data-act="close">Done</button>'
    : '<button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn green" data-act="pub-go"' + (n ? "" : " disabled") + ">" + I.send + "Publish" + (n ? " " + n : "") + "</button>";
  return frame(A, { title: "Publish lineups", sub: A.DATE.long, body: body, foot: foot, cls: "a-pb" });
}
function editSheet(P, A) {
  var l = A.D.L[P.sheet.k], name = A.TYPES[l.type].name;
  var body = '<div class="a-grp a-list">' +
    '<p><span class="a-li">' + A.I.edit + "</span><span>" + name + " goes back to draft, so you can change it.</span></p>" +
    '<p><span class="a-li">' + A.I.users + "</span><span>Staff don't see it until you publish again.</span></p>" +
    '<p><span class="a-li">' + A.I.check + "</span><span>People whose spot changes are asked to acknowledge again.</span></p></div>";
  return frame(A, { title: "Edit " + name + " lineup?", sub: "Published at " + A.esc(l.at) + " · " + A.LOCS[l.loc].name, body: body,
    foot: '<button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn green" data-act="unpub-go">Unpublish &amp; edit</button>', cls: "a-eb-sheet" });
}
function notesSheet(P, A) {
  var l = A.D.L[P.sheet.k];
  var ph = { sp: "Dish and price", s86: "Items you're out of", sn: "Anything the team should know" };
  var body = NOTE_KEYS.map(function (x) {
    return '<label class="a-nf"><span>' + x[1] + '</span><span class="a-grp"><textarea class="a-ta' + (x[0] === "sn" ? " tall" : "") + '" data-note="' + x[0] + '" placeholder="' + ph[x[0]] + '">' + A.esc(l.notes[x[0]]) + "</textarea></span></label>";
  }).join("") + '<p class="a-hint">Staff see these with the lineup. Empty notes don\'t show.</p>';
  return frame(A, { title: A.TYPES[l.type].name + " notes", sub: A.LOCS[l.loc].name + " · " + A.DATE.short, body: body,
    foot: '<button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn green" data-act="notes-save">Save</button>', cls: "a-ns" });
}

NF.variant({
  id: "e",
  name: "4 · Sakin liste, tam genişlik",
  sub: "1 · Sakin liste ile aynı; yalnız beyaz gruplar, 2 · Hizalı çizelge gibi, ekranın iki kenarına kadar uzanıyor.",
  render: function (P, A) { return P.role === "emp" ? emp(P, A) : mgr(P, A); },
  sheet: function (P, A) {
    var t = P.sheet && P.sheet.type;
    return t === "person" ? personSheet(P, A) : t === "add" ? addSheet(P, A) : t === "publish" ? publishSheet(P, A) : t === "editpub" ? editSheet(P, A) : t === "notes" ? notesSheet(P, A) : null;
  },
  after: function (app, P) {
    /* Add Staff: filter by name without re-rendering (keeps the keyboard up). */
    var q = app.querySelector(".a-q");
    if (!q) { P.vs.q = ""; return; }
    function apply() {
      var v = q.value.trim().toLowerCase(), any = false;
      P.vs.q = q.value;
      app.querySelectorAll(".a-cand").forEach(function (c) { c.hidden = !!v && c.dataset.n.toLowerCase().indexOf(v) < 0; });
      app.querySelectorAll(".a-as .a-cg").forEach(function (g) { var vis = !!g.querySelector(".a-cand:not([hidden])"); g.hidden = !vis; if (vis) any = true; });
      var nh = app.querySelector(".a-nohit"); if (nh) nh.hidden = any;
    }
    q.value = P.vs.q || "";
    q.addEventListener("input", apply);
    apply();
  }
});
})();
