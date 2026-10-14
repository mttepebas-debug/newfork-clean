/* B · Hizalı çizelge ("aligned sheet"): the lineup as a printed sheet a manager pins on the wall.
   One grid for everything: 16 px margins, a 40 px icon column, names at 68 px, then a Label column and a
   Section column that size to their widest value (CSS subgrid) with Section flush right. Headers are type,
   not boxes: department in small caps over an ink rule, job with its count, column headings once per
   department. The employee sees the same sheet under their own shift. */
(function () {
"use strict";

var NOTE_KEYS = [["sp", "Specials"], ["s86", "86s"], ["sn", "Shift notes"]];
var WORD = { empty: "No one yet", draft: "Draft", published: "Published", started: "Started" };

/* ---------------- small helpers ---------------- */
function tile(A, job, name, px, cls) {
  px = px || 40;
  return '<span class="ic' + (cls ? " " + cls : "") + '" style="--s:' + px + 'px">' + A.icon(job, px, "", name) + "</span>";
}
function people(n) { return n + (n === 1 ? " person" : " people"); }
function hoursNum(A, a, b) { return parseFloat(A.hours(a, b)); }

/* ---------------- manager: header, tabs, status ---------------- */
function header(P, A) {
  var I = A.I, n = A.drafts().length;
  var loc = '<div class="b-loc"><span class="b-locv" aria-hidden="true">' + A.esc(A.LOCS[P.loc].name) + "</span>" + I.down +
    '<select data-act="loc" aria-label="Location">' +
    ["dt", "up"].map(function (k) { return '<option value="' + k + '"' + (P.loc === k ? " selected" : "") + ">" + A.esc(A.LOCS[k].name) + "</option>"; }).join("") +
    "</select></div>";
  var pub = '<button type="button" class="btn b-pub' + (n ? " green" : "") + '" data-act="publish">' + I.send + "<span>Publish" + (n ? " " + n : "") + "</span></button>";
  return '<header class="b-hd"><div class="b-hd1">' + loc + pub + "</div>" +
    '<div class="b-hd2"><span class="b-date">' + A.DATE.long + '</span><span class="b-step">' +
    '<button type="button" class="b-ib" aria-label="Previous day" data-act="noop">' + I.left + "</button>" +
    '<button type="button" class="b-ib" aria-label="Next day" data-act="noop">' + I.right + "</button></span></div></header>";
}

function tabs(P, A) {
  return '<div class="b-tabs" role="tablist" aria-label="Shifts">' + A.lineupsAt(P.loc).map(function (x) {
    var on = x.type === P.tab, st = A.state(x), n = A.live(x).length, T = A.TYPES[x.type];
    var meta = st === "empty" ? '<span class="s s-empty">No one yet</span>'
      : '<span class="c">' + n + '</span><span class="s s-' + st + '">' + WORD[st] + "</span>";
    return '<button type="button" role="tab" class="b-tab" aria-selected="' + on + '" style="--c:' + T.c + '" data-act="tab" data-t="' + x.type + '">' +
      "<b>" + T.name + '</b><span class="m">' + meta + "</span></button>";
  }).join("") + "</div>";
}

function status(P, A, l, st) {
  var I = A.I, s = A.stats(l), n = s.n, l1, l2, right = "";
  if (st === "draft") {
    l1 = '<span class="b-stamp t-draft">Draft</span><span>Staff can\'t see it yet</span>';
    l2 = people(n) + (n ? " · " + A.range(s.first, s.last) : "");
  } else if (st === "published") {
    l1 = '<span class="b-stamp t-pub">Published</span><span>' + l.at + "</span>";
    l2 = l.acked + " of " + n + " acknowledged";
    right = '<button type="button" class="btn sm b-edit" data-act="editpub">' + I.edit + "Edit</button>";
  } else {
    l1 = '<span class="b-stamp t-started">Started</span><span class="b-ro">' + I.lock + "Read-only</span>";
    l2 = "Published " + l.at + " · " + l.acked + " of " + n + " acknowledged";
  }
  return '<section class="b-st" aria-label="Lineup status"><p class="b-st1">' + l1 + '</p><p class="b-st2">' + l2 + "</p>" + right + "</section>";
}

function seg(P, A, l) {
  var nn = NOTE_KEYS.filter(function (x) { return l.notes[x[0]]; }).length;
  return '<div class="b-seg" role="tablist" aria-label="View">' +
    '<button type="button" role="tab" aria-selected="' + (P.seg !== "notes") + '" data-act="seg" data-s="team">Team <span>' + A.live(l).length + "</span></button>" +
    '<button type="button" role="tab" aria-selected="' + (P.seg === "notes") + '" data-act="seg" data-s="notes">Notes' + (nn ? " <span>" + nn + "</span>" : "") + "</button></div>";
}

/* ---------------- the sheet (team list) ---------------- */
function grid(A, l, o) {
  var esc = A.esc, I = A.I;
  var hasL = A.live(l).some(function (r) { return r.label; }), hasS = A.hasSec(l);
  var groups = A.groups(l), out = "";
  var depts = o.edit ? A.DEPTS.map(function (d) { return groups.filter(function (g) { return g.dept.id === d.id; })[0] || { dept: d, jobs: [], count: 0 }; }) : groups;
  depts.forEach(function (g) {
    var rows = [];
    g.jobs.forEach(function (j) { rows = rows.concat(j.rows); });
    var dL = hasL && rows.some(function (r) { return r.label; }), dS = hasS && rows.some(function (r) { return r.section; });
    out += '<div class="b-dept"><h3>' + esc(g.dept.name) + (g.count ? ' <span class="b-n">' + g.count + "</span>" : "") + "</h3>" +
      (o.edit ? '<button type="button" class="b-add" data-act="add" data-dept="' + g.dept.id + '">' + I.plus + "Add Staff</button>" : "") + "</div>";
    if (!g.jobs.length) { out += '<p class="b-none">No one in ' + esc(g.dept.name) + " yet</p>"; return; }
    g.jobs.forEach(function (j, ji) {
      out += '<div class="b-job"><span class="j">' + esc(j.job.name) + ' <span class="b-n">' + j.rows.length + "</span></span>" +
        (ji === 0 ? (dL ? '<span class="h h-lab" aria-hidden="true">Label</span>' : "") + (dS ? '<span class="h h-sec" aria-hidden="true">Section</span>' : "") : "") + "</div>";
      j.rows.forEach(function (r) { out += row(A, r, o, hasL, hasS); });
    });
  });
  return '<div class="b-grid' + (hasL ? " c-l" : "") + (hasS ? " c-s" : "") + '">' + out + "</div>";
}

function row(A, r, o, hasL, hasS) {
  var esc = A.esc;
  /* the name may run into columns this row leaves empty (a long name with no label) */
  var end = 3;
  if (hasL && !r.label) { end = 4; if (hasS && !r.section) end = 5; } else if (!hasL && hasS && !r.section) end = 4;
  var tags = (r.tags || []).map(function (t) { return '<span class="tg tg-' + t.kind + '">' + esc(t.t) + "</span>"; }).join("");
  var inner = tile(A, r.job, r.name) +
    '<span class="nm"' + (end > 3 ? ' style="grid-column:2/' + end + '"' : "") + ">" + esc(r.name) + "</span>" +
    (r.label ? '<span class="lab">' + esc(r.label) + "</span>" : "") +
    (r.section ? '<span class="sec">' + esc(r.section) + "</span>" : "") +
    '<span class="tm"><span class="t">' + A.range(r.in, r.out) + "</span>" + tags + "</span>";
  var cls = "b-row" + (o.me === r.id ? " me" : "");
  return o.edit ? '<button type="button" class="' + cls + '" data-act="person" data-id="' + r.id + '">' + inner + "</button>"
    : '<div class="' + cls + '" data-id="' + r.id + '">' + inner + "</div>";
}

function offBlock(P, A, l) {
  var rows = A.offRows(l), esc = A.esc, I = A.I;
  if (!rows.length) return "";
  var can = A.editable(P, l), moved = rows.filter(function (r) { return r.moved; }).length;
  var title = moved === rows.length ? "Moved" : moved ? "Called off &amp; moved" : "Called off";
  return '<div class="b-grid b-offg"><div class="b-dept b-dept-off"><h3>' + title + ' <span class="b-n">' + rows.length + "</span></h3></div>" +
    rows.map(function (r) {
      return '<div class="b-row off" data-id="' + r.id + '">' + tile(A, r.job, r.name) + '<span class="nm">' + esc(r.name) + "</span>" +
        (can && !r.moved ? '<span class="b-rst"><button type="button" class="btn sm" data-act="restore" data-id="' + r.id + '">' + I.undo + "Restore</button></span>" : "") +
        '<span class="tm">' + (r.moved ? "Moved to " + esc(r.moved) : esc(A.JOBS[r.job].name) + " · " + A.range(r.in, r.out)) + "</span></div>";
    }).join("") + "</div>";
}

function notesView(P, A, l) {
  var esc = A.esc, edit = A.editable(P, l);
  return '<section class="b-notes"><div class="b-dept"><h3>Notes</h3>' +
    (edit ? '<button type="button" class="b-add" data-act="notes">' + A.I.edit + "Edit notes</button>" : "") + "</div>" +
    '<dl class="b-dl">' + NOTE_KEYS.map(function (x) {
      var v = l.notes[x[0]];
      return "<div><dt>" + x[1] + "</dt><dd" + (v ? "" : ' class="none"') + ">" + (v ? esc(v) : "Not added") + "</dd></div>";
    }).join("") + "</dl>" +
    '<p class="b-foot">Staff see these with the lineup. Empty notes don\'t show.</p></section>';
}

function emptyView(P, A, l) {
  var T = A.TYPES[l.type];
  return '<section class="b-st"><p class="b-st1"><span class="b-stamp t-empty">Empty</span><span>No one on ' + T.name + " yet</span></p>" +
    '<p class="b-st2">The Schedule has no ' + T.name + " shifts here today. Add people by department.</p></section>" +
    grid(A, l, { edit: P.role === "mgr" });
}

function mgr(P, A) {
  var cur = A.cur(P), l = cur.l, st = A.state(l), body;
  if (st === "empty") body = emptyView(P, A, l);
  else body = status(P, A, l, st) + seg(P, A, l) +
    (P.seg === "notes" ? notesView(P, A, l) : grid(A, l, { edit: A.editable(P, l) }) + offBlock(P, A, l));
  return '<div class="scroll">' + header(P, A) + tabs(P, A) + body + '<div class="b-end' + (P.toast ? " t" : "") + '"></div></div>' + A.navMgr();
}

/* ---------------- employee ---------------- */
function timeLine(A, r, pub) {
  if (!pub || !r.sched) return A.range(pub ? r.in : r.sched.in, pub ? r.out : r.sched.out);
  var c = A.changed(r);
  var a = c.in ? '<span class="sr">Changed from </span><del>' + A.fmt(c.sched.in) + '</del><span class="sr"> to</span> ' : "";
  var b = c.out ? '<span class="sr">changed from </span><del>' + A.fmt(c.sched.out) + '</del><span class="sr"> to</span> ' : "";
  return a + A.fmt(r.in) + " – " + b + A.fmt(r.out);
}

function mine(A, l, r, pub) {
  var esc = A.esc, job = pub ? r.job : (r.sched ? r.sched.job : r.job), T = A.TYPES[l.type];
  var dl = [["Location", A.LOCS[l.loc].name], ["Position", A.JOBS[job].name]];
  if (pub && r.label) dl.push(["Label", r.label]);
  if (pub && r.section) dl.push(["Section", r.section]);
  return '<section class="b-mine" aria-label="Your shift"><div class="b-cap"><h2>Your ' + T.name + " shift</h2>" +
    (pub ? "" : '<span class="b-capr">From the Schedule</span>') + "</div>" +
    '<div class="b-me1">' + tile(A, job, r.name) + '<div class="b-me2"><b>' + esc(r.name) + '</b><span class="b-metm">' + timeLine(A, r, pub) + "</span></div></div>" +
    '<dl class="b-dl b-dl-me">' + dl.map(function (x) { return "<div><dt>" + x[0] + "</dt><dd>" + esc(x[1]) + "</dd></div>"; }).join("") + "</dl></section>";
}

function emp(P, A) {
  var m = A.me(), l = m.l, r = m.r, esc = A.esc, I = A.I, T = A.TYPES[l.type], L = A.LOCS[l.loc];
  var pub = l.status === "published", body;
  var head = '<header class="b-hd b-hd-emp"><div class="b-hd1"><h1 class="b-title">Lineup</h1></div><div class="b-hd2"><span class="b-date">' + A.DATE.long + "</span></div></header>";
  if (!r) body = '<section class="b-wait"><h2>No lineup for you today</h2></section>';
  else if (!pub) {
    body = mine(A, l, r, false) +
      '<section class="b-wait"><span class="b-wico">' + I.clock + "</span><div><h2>The " + T.name + " lineup isn't out yet</h2><p>" +
      esc(A.first(l.by)) + " publishes it before the shift. Your section, the notes and the team show up here.</p></div></section>";
  } else if (r.off) {
    body = '<section class="b-wait"><span class="b-wico">' + I.alert + "</span><div><h2>You're off this lineup</h2><p>" +
      esc(A.first(l.by)) + " took you off " + T.name + ". The Schedule doesn't change. Ask " + esc(A.first(l.by)) + " if this looks wrong.</p></div></section>";
  } else {
    var notes = NOTE_KEYS.filter(function (x) { return l.notes[x[0]]; });
    body = mine(A, l, r, true) +
      (notes.length ? '<section class="b-notes b-notes-emp"><div class="b-dept"><h3>Notes</h3></div><dl class="b-dl">' +
        notes.map(function (x) { return "<div><dt>" + x[1] + "</dt><dd>" + esc(l.notes[x[0]]) + "</dd></div>"; }).join("") + "</dl></section>" : "") +
      '<section class="b-teamh"><h2>' + esc(L.name) + "</h2><p>" + A.DATE.long + " · " + T.name + "</p></section>" +
      grid(A, l, { edit: false, me: r.id }) +
      (A.D.meAcked ? '<p class="b-acked">' + I.checkCircle + "<span>Acknowledged at " + A.fmt("14:10") + "</span></p>"
        : A.D.ackOn ? '<div class="b-ack"><button type="button" class="btn green block" data-act="ack">' + I.check + "Acknowledge</button></div>" : "");
  }
  return '<div class="scroll">' + head + body + '<div class="b-end"></div></div>' + A.navEmp();
}

/* ---------------- sheets ---------------- */
function frame(A, o) {
  return '<div class="scrim" data-act="close"></div><section class="sheet b-sh' + (o.cls ? " " + o.cls : "") + '" role="dialog" aria-modal="true" aria-label="' + A.esc(o.title) + '" tabindex="-1">' +
    '<header class="sheet-h"><i class="grab"></i><div class="ttl">' + (o.icon || "") + '<div class="tt"><h3>' + A.esc(o.title) + "</h3>" + (o.sub ? "<p>" + o.sub + "</p>" : "") + "</div>" +
    '<button type="button" class="icon-btn" aria-label="Close" data-act="close">' + A.I.x + "</button></div>" + (o.tools || "") + "</header>" +
    '<div class="sheet-b">' + o.body + "</div>" + (o.foot ? '<footer class="sheet-f">' + o.foot + "</footer>" : "") + "</section>";
}

function sel(A, f, opts, val, dis) {
  return '<span class="select"><select data-act="field" data-f="' + f + '"' + (dis ? " disabled" : "") + ">" + opts.map(function (o) {
    return '<option value="' + A.esc(o[0]) + '"' + (o[0] === val ? " selected" : "") + ">" + A.esc(o[1]) + "</option>";
  }).join("") + "</select></span>";
}

function personSheet(P, A) {
  var l = A.D.L[P.sheet.k], r = A.find(P.sheet.k, P.sheet.id);
  if (!r) return "";
  var esc = A.esc, I = A.I, ro = !A.editable(P, l), ch = A.changed(r), T = A.TYPES[l.type], dis = ro ? " disabled" : "";
  var secs = [["", "None"]].concat(A.sections(l.loc).map(function (s) { return [s, s]; })).concat(ro ? [] : [["__add", "+ New section"]]);
  var labs = [["", "None"]].concat(A.LABELS.map(function (x) { return [x, x]; }));
  var body = (ro ? '<p class="b-lock">' + I.lock + "<span>" + (A.state(l) === "started" ? "Started at " + A.fmt(A.firstIn(l)) + ". This lineup is read-only." : "Published. Tap Edit on the lineup to change it.") + "</span></p>" : "") +
    '<label class="b-fld"><span class="b-lb">Section</span>' + sel(A, "section", secs, r.section, ro) + "</label>" +
    '<div class="b-fld" role="group" aria-label="Label"><span class="b-lb" aria-hidden="true">Label</span><div class="b-segx">' + labs.map(function (x) {
      return '<button type="button" aria-pressed="' + (r.label === x[0]) + '" data-act="field" data-f="label" value="' + esc(x[0]) + '"' + dis + ">" + esc(x[1]) + "</button>";
    }).join("") + "</div></div>" +
    '<div class="b-fld" role="group" aria-label="Time"><span class="b-lb" aria-hidden="true">Time</span><div class="b-time">' +
    '<input class="input" aria-label="In" data-act="field" data-f="in" value="' + A.fmt(r.in) + '" autocomplete="off"' + dis + '><span class="b-dash" aria-hidden="true">–</span>' +
    '<input class="input" aria-label="Out" data-act="field" data-f="out" value="' + A.fmt(r.out) + '" autocomplete="off"' + dis + "></div></div>" +
    '<label class="b-fld"><span class="b-lb">Position</span>' + sel(A, "job", Object.keys(A.JOBS).map(function (j) { return [j, A.JOBS[j].name]; }), r.job, ro) + "</label>" +
    '<p class="b-note">' + (ch.sched && (ch.in || ch.out || ch.sched.job !== r.job)
      ? "Schedule: " + esc(A.JOBS[ch.sched.job].name) + ", " + A.range(ch.sched.in, ch.sched.out) + ". Changes stay in this lineup."
      : r.sched ? "Changes stay in this lineup. The Schedule doesn't change." : "Added in the lineup only. The Schedule doesn't change.") + "</p>";
  var armed = P.armed === "off";
  var foot = ro ? '<button type="button" class="btn" data-act="close">Close</button>'
    : '<button type="button" class="btn danger' + (armed ? " armed" : "") + '" data-act="calloff">' + (armed ? "Tap again to call off" : "Call off") + "</button>" +
      '<button type="button" class="btn green" data-act="close">Done</button>';
  return frame(A, { title: r.name, sub: T.name + " · " + esc(A.LOCS[l.loc].name), icon: tile(A, r.job, r.name, 44), body: body, foot: foot, cls: "b-psh" });
}

function addSheet(P, A) {
  var l = A.D.L[P.sheet.k], esc = A.esc, I = A.I, T = A.TYPES[l.type];
  var dept = A.DEPTS.filter(function (d) { return d.id === P.sheet.dept; })[0] || A.DEPTS[0];
  var tools = '<div class="b-segd" role="group" aria-label="Department">' + A.DEPTS.map(function (d) {
    return '<button type="button" aria-pressed="' + (d.id === dept.id) + '" data-act="add" data-dept="' + d.id + '">' + esc(d.name) + "</button>";
  }).join("") + "</div>";
  var extra = hoursNum(A, T.def[0], T.def[1]);
  var body = A.candidates(P).map(function (g) {
    return '<div class="b-cg"><h4>' + esc(g.title) + ' <span class="b-n">' + g.items.length + "</span></h4></div>" + g.items.map(function (x) {
      var c = x.c, armed = P.armed === "pick-" + c.n;
      var line = c.kind === "available" ? esc(A.JOBS[x.job].name) + ' · <span class="ok">Free today</span>'
        : c.kind === "here" ? esc(c.note.replace(" here ·", "")) + " · " + (c.hrs + extra) + "h today"
        : c.kind === "other" ? '<span class="info">' + esc(c.note) + "</span>"
        : c.kind === "timeoff" ? '<span class="warn">' + esc(c.note) + "</span>"
        : esc(c.note);
      var btn = c.kind === "no" ? "" : '<button type="button" class="b-pick' + (armed ? " armed k-" + c.kind : "") + '" data-act="pick" data-n="' + esc(c.n) + '">' +
        (armed ? (c.kind === "other" ? "Confirm move" : "Add anyway") : c.kind === "other" ? "Move here" : I.plus + "Add") + "</button>";
      var why = armed ? '<p class="b-why k-' + c.kind + '">' + (c.kind === "other"
        ? esc(A.first(c.n)) + " leaves Uptown's " + T.name + " lineup. Uptown sees the move and can bring " + esc(A.first(c.n)) + " back."
        : esc(A.first(c.n)) + " has an approved day off. This adds " + esc(A.first(c.n)) + " to this lineup only; the day off and the Schedule don't change.") + "</p>" : "";
      return '<div class="b-cand' + (c.kind === "no" ? " no" : "") + (x.rank === 2 ? " dim" : "") + (armed ? " armed" : "") + '">' + tile(A, x.job, c.n) +
        '<span class="nm"><b>' + esc(c.n) + '</b><span class="ln">' + line + "</span></span>" + btn + why + "</div>";
    }).join("");
  }).join("");
  if (!body) body = '<p class="b-none">Everyone is already on this lineup.</p>';
  return frame(A, { title: "Add staff", sub: T.name + " · " + esc(A.LOCS[l.loc].name) + " · " + A.range(T.def[0], T.def[1]), tools: tools, body: body, cls: "b-addsh" });
}

function publishSheet(P, A) {
  var esc = A.esc, I = A.I, body = "";
  if (P.pubDone) body += '<p class="b-done">' + I.checkCircle + "<span>" + esc(P.pubDone) + "</span></p>";
  ["dt", "up"].forEach(function (loc) {
    body += '<div class="b-cg"><h4>' + esc(A.LOCS[loc].name) + '</h4><span class="h" aria-hidden="true">People</span></div>';
    A.lineupsAt(loc).forEach(function (l) {
      var n = A.live(l).length, st = A.state(l), s = A.stats(l), T = A.TYPES[l.type];
      var on = P.picks.indexOf(l.k) >= 0;
      var mark = st === "draft" ? '<input type="checkbox" class="cb" aria-label="Publish ' + esc(A.LOCS[loc].name) + " " + T.name + '" data-act="pub-pick" data-k="' + l.k + '"' + (on ? " checked" : "") + ">"
        : st === "empty" ? '<span class="b-mk none" aria-hidden="true"></span>' : '<span class="b-mk ok" aria-hidden="true">' + I.check + "</span>";
      var sub = st === "empty" ? "No one is scheduled"
        : st === "draft" ? '<span class="t-draft">Draft</span> · ' + A.range(s.first, s.last)
        : '<span class="t-pub">' + (st === "started" ? "Started" : "Published " + l.at) + "</span> · " + l.acked + "/" + n + " acknowledged";
      var tag = st === "draft" ? "label" : "div";
      body += "<" + tag + ' class="b-prow' + (st === "empty" ? " none" : "") + '">' + mark + '<span class="t"><b>' + T.name + "</b><span>" + sub + "</span></span>" +
        '<span class="b-pc">' + (n ? n + '<span class="sr"> ' + (n === 1 ? "person" : "people") + "</span>" : "") + "</span></" + tag + ">";
    });
  });
  body += '<div class="b-tgl"><span class="t"><b>Ask staff to acknowledge</b><span>Each person taps Acknowledge after reading.</span></span>' +
    '<button type="button" class="tog" role="switch" aria-checked="' + A.D.ackOn + '" aria-label="Ask staff to acknowledge" data-act="pub-ack"></button></div>';
  var n = P.picks.length;
  var foot = P.pubDone && !n ? '<button type="button" class="btn green" data-act="close">Done</button>'
    : '<button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn green" data-act="pub-go"' + (n ? "" : " disabled") + ">" + I.send + "Publish" + (n ? " " + n : "") + "</button>";
  return frame(A, { title: "Publish lineups", sub: A.DATE.long, body: body, foot: foot, cls: "b-pubsh" });
}

function editSheet(P, A) {
  var l = A.D.L[P.sheet.k], T = A.TYPES[l.type];
  return frame(A, {
    title: "Edit " + T.name + " lineup?", cls: "b-edsh",
    body: '<ul class="b-cons"><li>It goes back to draft. Staff don\'t see it until you publish it again.</li><li>People whose spot changes are asked to acknowledge again.</li></ul>',
    foot: '<button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn green" data-act="unpub-go">' + A.I.edit + "Unpublish &amp; edit</button>"
  });
}

function notesSheet(P, A) {
  var l = A.D.L[P.sheet.k], T = A.TYPES[l.type], esc = A.esc, ro = !A.editable(P, l);
  var ph = { sp: "Today's specials", s86: "Items you're out of", sn: "Anything the team should know" };
  var body = NOTE_KEYS.map(function (x) {
    return '<label class="b-fld"><span class="b-lb">' + x[1] + '</span><textarea class="input" rows="2" data-note="' + x[0] + '" placeholder="' + ph[x[0]] + '"' + (ro ? " disabled" : "") + ">" + esc(l.notes[x[0]]) + "</textarea></label>";
  }).join("");
  var foot = ro ? '<button type="button" class="btn" data-act="close">Close</button>'
    : '<button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn green" data-act="notes-save">Save</button>';
  return frame(A, { title: T.name + " notes", sub: "Staff see these with the lineup. Empty notes don't show.", body: body, foot: foot, cls: "b-nsh" });
}

/* ---------------- focus: keep keyboard users in place across re-renders ---------------- */
function keyOf(el) {
  var d = el.dataset || {}, k = d.act ? '[data-act="' + d.act + '"]' : "";
  ["f", "id", "t", "s", "dept", "n", "k", "note"].forEach(function (x) { if (d[x] != null) k += "[data-" + x + '="' + String(d[x]).replace(/"/g, '\\"') + '"]'; });
  if (el.getAttribute && el.getAttribute("value") != null && d.act === "field") k += '[value="' + el.getAttribute("value").replace(/"/g, '\\"') + '"]';
  if (!k && el.classList && el.classList.contains("icon-btn")) k = ".icon-btn";
  return k;
}

NF.variant({
  id: "b",
  name: "2 · Hizalı çizelge",
  sub: "Duvara asılan basılı lineup kağıdı gibi: her satır aynı çizgilere hizalı, Label ve Section kendi sütununda, Section hep sağ kenarda. Başlıklar kutu değil yazı; paneller ve çalışanın ekranı da aynı düzende.",
  render: function (P, A) { return P.role === "emp" ? emp(P, A) : mgr(P, A); },
  sheet: function (P, A) {
    var t = P.sheet && P.sheet.type;
    return t === "person" ? personSheet(P, A) : t === "add" ? addSheet(P, A) : t === "publish" ? publishSheet(P, A) : t === "editpub" ? editSheet(P, A) : t === "notes" ? notesSheet(P, A) : null;
  },
  after: function (app, P) {
    if (!app.dataset.bWired) {
      app.dataset.bWired = "1";
      app.addEventListener("focusin", function (e) { var k = keyOf(e.target); if (k) app.dataset.bFocus = k; });
      app.addEventListener("focusout", function (e) { if (e.relatedTarget && !app.contains(e.relatedTarget)) delete app.dataset.bFocus; });
      /* keep Tab inside an open sheet (it is a modal dialog) */
      app.addEventListener("keydown", function (e) {
        if (e.key !== "Tab") return;
        var sh = app.querySelector(".b-sh"); if (!sh) return;
        var f = Array.prototype.filter.call(sh.querySelectorAll("button, select, input, textarea"), function (x) { return !x.disabled; });
        if (!f.length) return;
        var a = document.activeElement, first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (a === first || a === sh)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (a === last || !sh.contains(a))) { e.preventDefault(); first.focus(); }
      });
    }
    var sig = P.sheet ? JSON.stringify(P.sheet) : "", prev = P.vs.sheetSig || "";
    P.vs.sheetSig = sig;
    var lost = !document.activeElement || document.activeElement === document.body;
    var find = function (k) { try { return k ? app.querySelector(k) : null; } catch (err) { return null; } };
    if (sig && sig !== prev) {
      if (!prev) P.vs.opener = app.dataset.bFocus || "";
      var sh = app.querySelector(".b-sh");
      if (sh && lost) sh.focus({ preventScroll: true });
      return;
    }
    if (!sig && prev && lost) { var o = find(P.vs.opener); P.vs.opener = ""; if (o && !o.disabled) { o.focus({ preventScroll: true }); return; } }
    if (lost && app.dataset.bFocus) { var el = find(app.dataset.bFocus); if (el && !el.disabled) el.focus({ preventScroll: true }); }
  }
});
})();
