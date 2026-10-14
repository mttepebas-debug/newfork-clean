/* Variant c: "Istasyon kartlari" (station cards).
   Section-forward floor view: every person row answers "when" and "where" on one line
   (time on the left, the Section as a station badge on the right); departments are their
   own cards tinted from the job data colors; the summary shows the shift as a small
   "on the floor" timeline. The employee sees their own spot as a large time + station plate. */
(function () {
"use strict";

/* Department color = the data color of its lead job (no new colors). */
var DEPT_JOB = { foh: "server", bar: "bartender", boh: "linecook" };
var NOTE_KEYS = [["sp", "Specials"], ["s86", "86s"], ["sn", "Shift notes"]];

function deptColor(A, d) { return A.JOBS[DEPT_JOB[d.id] || d.jobs[0]].c; }
function endMin(A, a, b) { var x = A.min(b); return x <= A.min(a) ? x + 1440 : x; }
function fmtMin(A, m) { m = ((m % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mm = m % 60; return A.fmt((h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm); }
function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

/* Job icon in a soft tile tinted with the job color. size: 40 | 44 | 52 */
function av(A, job, size, name, cls) {
  var j = A.JOBS[job];
  return '<span class="cav z' + size + (cls ? " " + cls : "") + '" style="--jc:' + (j ? j.c : "transparent") + '">' + A.icon(job, size, "", name) + "</span>";
}
function tagsHtml(A, r) {
  return A.tags(r).map(function (t) { return '<span class="ctag k-' + t.kind + '">' + A.esc(t.t) + "</span>"; }).join("");
}
function station(A, r, cls) {
  return r.section ? '<span class="csta' + (cls ? " " + cls : "") + '">' + A.I.pin + "<span>" + A.esc(r.section) + "</span></span>" : "";
}

/* ---------- One person row ---------- */
function row(P, A, l, r, can, me) {
  var esc = A.esc, tg = can ? "button" : "div";
  var at = can ? ' type="button" data-act="person"' : "";
  return "<" + tg + ' class="crow' + (me ? " me" : "") + (can ? " tap" : "") + '" data-id="' + r.id + '"' + at + ">" +
    av(A, r.job, 44, r.name) +
    '<span class="cbody"><span class="cl1"><b class="cname">' + esc(r.name) + "</b>" + tagsHtml(A, r) + "</span>" +
    '<span class="cl2"><span class="ctime">' + A.range(r.in, r.out) + "</span>" + station(A, r) + "</span></span>" +
    "</" + tg + ">";
}

/* ---------- Team: one card per department ---------- */
/* The manager can build an empty lineup too (A.editable is false while it has nobody). */
function canEdit(P, A, l) { var st = A.state(l); return P.role === "mgr" && (st === "draft" || st === "empty"); }
function team(P, A, l) {
  var esc = A.esc, can = canEdit(P, A, l), meId = P.role === "emp" ? A.D.me.id : null;
  var groups = A.groups(l), byId = {};
  groups.forEach(function (g) { byId[g.dept.id] = g; });
  var out = "";
  A.DEPTS.forEach(function (d) {
    var g = byId[d.id];
    if (!g && !can) return;
    var add = can ? '<button type="button" class="cadd" data-act="add" data-dept="' + d.id + '">' + A.I.plus + "Add Staff</button>" : "";
    out += '<section class="cdept' + (g ? "" : " is-empty") + '" style="--dc:' + deptColor(A, d) + '" aria-label="' + esc(d.name) + '">' +
      '<header class="cdh"><h3>' + esc(d.name) + (g ? '<span class="cn">' + g.count + "</span>" : "") + "</h3>" + add + "</header>";
    if (!g) out += '<p class="cnone">No one in ' + esc(d.name) + " yet.</p>";
    else g.jobs.forEach(function (j) {
      out += '<div class="cjob"><p class="cjh">' + esc(j.job.name) + "<span>" + j.rows.length + "</span></p>" +
        j.rows.map(function (r) { return row(P, A, l, r, can, r.id === meId); }).join("") + "</div>";
    });
    out += "</section>";
  });
  var off = P.role === "mgr" ? A.offRows(l) : [];
  if (off.length) {
    out += '<section class="cdept coff" aria-label="Called off"><header class="cdh"><h3>Called off<span class="cn">' + off.length + "</span></h3></header>" +
      off.map(function (r) {
        var btn = can && !r.moved ? '<button type="button" class="btn sm crestore" data-act="restore" data-id="' + r.id + '">' + A.I.undo + "Restore</button>" : "";
        return '<div class="crow off" data-id="' + r.id + '">' + av(A, r.job, 44, r.name) +
          '<span class="cbody"><span class="cl1"><b class="cname">' + esc(r.name) + "</b></span>" +
          '<span class="cl2"><span class="ctime">' + (r.moved ? "Moved to " + esc(r.moved) : A.JOBS[r.job].name + " · Called off") + "</span></span></span>" + btn + "</div>";
      }).join("") + "</section>";
  }
  return out;
}

/* ---------- "On the floor" timeline: people per half hour, first in to last out ---------- */
function coverage(A, l) {
  var rows = A.live(l); if (!rows.length) return null;
  var s = 1e9, e = -1e9;
  rows.forEach(function (r) { var a = A.min(r.in), b = endMin(A, r.in, r.out); if (a < s) s = a; if (b > e) e = b; });
  var s0 = Math.floor(s / 30) * 30, e0 = Math.ceil(e / 30) * 30, slots = [], peak = 0;
  for (var t = s0; t < e0; t += 30) {
    var n = rows.filter(function (r) { var a = A.min(r.in), b = endMin(A, r.in, r.out); return a < t + 30 && b > t; }).length;
    slots.push({ t: t, n: n }); if (n > peak) peak = n;
  }
  var pk = slots.filter(function (x) { return x.n === peak; });
  return { s: s, e: e, s0: s0, e0: e0, slots: slots, peak: peak, pFrom: pk[0].t, pTo: pk[pk.length - 1].t + 30 };
}
function glance(P, A, l) {
  var c = coverage(A, l), s = A.stats(l); if (!c) return "";
  var now = A.NOW, nowHtml = "";
  if (now > c.s0 && now < c.e0) nowHtml = '<i class="cnow" style="left:' + ((now - c.s0) / (c.e0 - c.s0) * 100).toFixed(2) + '%"><span>Now</span></i>';
  var bars = c.slots.map(function (x) {
    return '<i class="' + (x.n === c.peak ? "pk" : "") + '" style="height:' + Math.max(8, Math.round(x.n / c.peak * 100)) + '%"></i>';
  }).join("");
  var label = "On the floor: " + plural(s.n, "person", "people") + ", first in " + A.fmt(s.first) + ", last out " + A.fmt(s.last) + ", most at once " + c.peak + " from " + fmtMin(A, c.pFrom) + " to " + fmtMin(A, c.pTo) + ".";
  return '<div class="cglance">' +
    '<div class="cppl"><b>' + s.n + "</b><span>" + (s.n === 1 ? "person" : "people") + "</span></div>" +
    '<div class="ccov"><div class="cbars" role="img" aria-label="' + A.esc(label) + '">' + bars + nowHtml + "</div>" +
    '<div class="caxis"><span><b>' + A.fmt(s.first) + "</b>First in</span><span><b>" + A.fmt(s.last) + "</b>Last out</span></div></div>" +
    "</div>";
}
function readMeter(A, l) {
  var n = A.live(l).length, k = Math.min(l.acked, n), pct = n ? Math.round(k / n * 100) : 0;
  return '<div class="cread"><span class="crl">' + (A.D.ackOn ? "Acknowledged" : "Read") + '</span><span class="cmeter" role="img" aria-label="' + k + " of " + n + '"><i style="width:' + pct + '%"></i></span><b>' + k + "<span>/" + n + "</span></b></div>";
}
function summary(P, A, l) {
  var st = A.state(l), t = A.TYPES[l.type], top;
  if (st === "empty") {
    return '<section class="csum is-empty" style="--c:' + t.c + '"><div class="csum-top"><span class="cst none">' + A.I.users + "Nobody yet</span>" +
      '<span class="cst-x">' + A.range(t.def[0], t.def[1]) + "</span></div>" +
      '<p class="csum-p">Start by adding people to a department. Staff see nothing until you publish.</p></section>';
  }
  if (st === "draft") top = '<span class="cst draft"><i></i>Draft</span><span class="cst-x">Staff can\'t see it yet</span>';
  else if (st === "published") top = '<span class="cst pub"><i></i>Published</span><span class="cst-x">' + A.esc(l.at) + "</span>" +
    '<button type="button" class="btn sm cedit" data-act="editpub">' + A.I.edit + "Edit</button>";
  else top = '<span class="cst run">' + A.I.lock + "Started</span><span class=\"cst-x\">" + A.fmt(A.firstIn(l)) + " · Read-only</span>";
  return '<section class="csum" style="--c:' + t.c + '"><div class="csum-top">' + top + "</div>" + glance(P, A, l) +
    (l.status === "published" ? readMeter(A, l) : "") + "</section>";
}

/* ---------- Notes ---------- */
function notesCount(l) { return NOTE_KEYS.filter(function (x) { return l.notes[x[0]]; }).length; }
function notesPanel(P, A, l) {
  var can = A.editable(P, l);
  var body = NOTE_KEYS.map(function (x) {
    var v = l.notes[x[0]];
    return '<div class="cnote k-' + x[0] + (v ? "" : " is-blank") + '"><p class="cnl">' + x[1] + '</p><p class="cnt">' + (v ? A.esc(v) : "Nothing yet. Staff won't see this one.") + "</p></div>";
  }).join("");
  return '<section class="cnotes">' + body + "</section>" +
    (can ? '<div class="cpad"><button type="button" class="btn block" data-act="notes">' + A.I.edit + "Edit notes</button></div>"
      : A.state(l) === "published" ? '<p class="cfoot-hint">' + A.I.lock + "Published. Tap Edit above to change notes.</p>" : "");
}

/* ---------- Manager screen ---------- */
function header(P, A) {
  var drafts = A.drafts().length;
  var tabs = A.lineupsAt(P.loc).map(function (x) {
    var on = x.type === P.tab, xs = A.state(x), n = A.live(x).length;
    var word = xs === "empty" ? "Nobody yet" : n + " · " + (xs === "draft" ? "Draft" : xs === "published" ? "Published" : "Started");
    return '<button type="button" role="tab" class="ctab s-' + xs + '" aria-selected="' + on + '" style="--c:' + A.TYPES[x.type].c + '" data-act="tab" data-t="' + x.type + '">' +
      '<span class="ctab-n">' + A.TYPES[x.type].name + '</span><span class="ctab-s"><i></i>' + word + "</span></button>";
  }).join("");
  var locs = ["dt", "up"].map(function (k) { return '<option value="' + k + '"' + (P.loc === k ? " selected" : "") + ">" + A.LOCS[k].name + "</option>"; }).join("");
  return '<header class="chead"><div class="ctop"><h1>Lineup</h1>' +
    '<button type="button" class="btn ' + (drafts ? "green" : "") + ' cpub" data-act="publish">' + A.I.send + "Publish" + (drafts ? '<span class="cbadge">' + drafts + "</span>" : "") + "</button></div>" +
    '<div class="cctx">' + dateCtl(A) +
    '<label class="select cloc">' + A.I.pin + '<span class="sr">Location</span><select data-act="loc">' + locs + "</select></label></div></header>" +
    '<nav class="ctabs" role="tablist" aria-label="Shifts">' + tabs + "</nav>";
}
function dateCtl(A) {
  return '<div class="cdate"><button type="button" class="cdb" data-act="noop" aria-label="Previous day">' + A.I.left + '</button>' +
    '<span class="cdl"><b>' + A.DATE.short + "</b><span>Today</span></span>" +
    '<button type="button" class="cdb" data-act="noop" aria-label="Next day">' + A.I.right + "</button></div>";
}
function mgr(P, A) {
  var l = A.cur(P).l, st = A.state(l), body = summary(P, A, l);
  if (st === "empty") body += '<div class="cteam">' + team(P, A, l) + "</div>";
  else {
    var nc = notesCount(l);
    body += '<div class="cseg" role="tablist" aria-label="View">' +
      '<button type="button" role="tab" aria-selected="' + (P.seg === "team") + '" data-act="seg" data-s="team">Team<span>' + A.live(l).length + "</span></button>" +
      '<button type="button" role="tab" aria-selected="' + (P.seg === "notes") + '" data-act="seg" data-s="notes">Notes<span>' + (nc || "None") + "</span></button></div>";
    body += P.seg === "notes" ? notesPanel(P, A, l) : '<div class="cteam">' + team(P, A, l) + "</div>";
  }
  return '<div class="scroll' + (P.toast ? " has-toast" : "") + '">' + header(P, A) + body + '<div class="cend"></div></div>' + A.navMgr();
}

/* ---------- Employee screen ---------- */
function emp(P, A) {
  var m = A.me(), l = m.l, r = m.r, esc = A.esc, t = A.TYPES[l.type], loc = A.LOCS[l.loc].name;
  var head = '<header class="chead emp"><div class="ctop"><h1>Lineup</h1>' + dateCtl(A) + "</div></header>";
  var body;
  if (l.status !== "published") {
    var sc = r.sched || { job: r.job, in: r.in, out: r.out };
    body = '<section class="cme is-wait" style="--c:' + t.c + '">' + meTop(A, r, sc.job, loc, t) +
      '<p class="cme-cap">Scheduled</p><p class="cme-time">' + A.range(sc.in, sc.out) + "</p>" +
      '<p class="cme-cap">Your section</p><div class="cme-sta is-tbd">' + A.I.pin + "<span>Comes with the lineup</span></div>" +
      '<div class="cwait">' + A.I.clock + "<p><b>Not published yet.</b> " + esc(A.first(A.MANAGER)) + " publishes the " + t.name + " lineup before your shift. You'll get a notification.</p></div>" +
      "</section>";
  } else {
    var ch = A.changed(r), was = "";
    if (ch.in || ch.out) was = '<p class="cme-was">' + (ch.in ? "Start" : "End") + " changed from <s>" + A.fmt(ch.in ? ch.sched.in : ch.sched.out) + "</s></p>";
    var lab = A.tags(r).length ? '<div class="cme-tags">' + tagsHtml(A, r) + "</div>" : "";
    body = '<section class="cme" style="--c:' + t.c + '">' + meTop(A, r, r.job, loc, t) +
      '<p class="cme-cap">Your time</p><p class="cme-time">' + A.range(r.in, r.out) + "</p>" + was +
      (r.section ? '<p class="cme-cap">Your section</p><div class="cme-sta" style="--dc:' + deptColor(A, A.deptOf(r.job)) + '">' + A.I.pin + "<b>" + esc(r.section) + "</b></div>" : "") + lab +
      "</section>";
    var nn = NOTE_KEYS.filter(function (x) { return l.notes[x[0]]; });
    if (nn.length) body += '<section class="cnotes emp">' + nn.map(function (x) { return '<div class="cnote k-' + x[0] + '"><p class="cnl">' + x[1] + '</p><p class="cnt">' + esc(l.notes[x[0]]) + "</p></div>"; }).join("") + "</section>";
    body += '<div class="cteam-h"><h2>' + esc(loc) + "</h2><p>" + A.DATE.long + " · " + t.name + " · " + plural(A.live(l).length, "person", "people") + "</p></div>";
    body += '<div class="cteam">' + team(P, A, l) + "</div>";
    if (A.D.ackOn) body += A.D.meAcked
      ? '<div class="cack done" role="status">' + A.I.checkCircle + "<div><b>Acknowledged at " + A.fmt("14:10") + "</b></div></div>"
      : '<div class="cack"><button type="button" class="btn green block" data-act="ack">' + A.I.check + "Acknowledge</button></div>";
  }
  return '<div class="scroll' + (P.toast ? " has-toast" : "") + '">' + head + body + '<div class="cend"></div></div>' + A.navEmp();
}
function meTop(A, r, job, loc, t) {
  return '<div class="cme-top">' + av(A, job, 52, r.name) + '<div class="cme-who"><b>' + A.esc(r.name) + "</b><span>" + A.esc(A.JOBS[job].name) + " · " + A.esc(loc) + "</span></div>" +
    '<span class="cshift" style="--c:' + t.c + '"><i></i>' + t.name + "</span></div>";
}

/* ---------- Sheets ---------- */
function frame(A, o) {
  return '<div class="scrim' + (o.still ? " still" : "") + '" data-act="close"></div><section class="sheet csheet' + (o.cls ? " " + o.cls : "") + (o.still ? " still" : "") + '" role="dialog" aria-modal="true" aria-label="' + A.esc(o.label || o.title) + '">' +
    '<header class="sheet-h"><i class="grab"></i><div class="ttl">' + (o.lead || "") + '<div class="ttx"><h3>' + o.title + "</h3>" + (o.sub ? "<p>" + o.sub + "</p>" : "") + "</div>" +
    '<button type="button" class="icon-btn" aria-label="Close" data-act="close">' + A.I.x + "</button></div></header>" +
    '<div class="sheet-b">' + o.body + "</div>" + (o.foot ? '<footer class="sheet-f">' + o.foot + "</footer>" : "") + "</section>";
}
function radios(name, f, opts, val, dis, cls, label, extra) {
  return '<div class="' + cls + '" role="radiogroup" aria-label="' + label + '">' + opts.map(function (o) {
    return '<label class="copt' + (o[2] ? " " + o[2] : "") + '"><input type="radio" name="' + name + '" value="' + o[0] + '" data-act="field" data-f="' + f + '"' + (o[0] === val ? " checked" : "") + (dis ? " disabled" : "") + "><span>" + o[1] + "</span></label>";
  }).join("") + (extra || "") + "</div>";
}
function personSheet(P, A, still) {
  var esc = A.esc, l = A.D.L[P.sheet.k], r = A.find(P.sheet.k, P.sheet.id); if (!r) return "";
  var ro = !A.editable(P, l), ch = A.changed(r), t = A.TYPES[l.type];
  var secs = [["", "None", "none"]].concat(A.sections(l.loc).map(function (x) { return [esc(x), esc(x)]; }));
  var addSec = ro ? "" : '<button type="button" class="cnewsec" data-act="field" data-f="section" value="__add">' + A.I.plus + "New section</button>";
  var labs = [["", "None"]].concat(A.LABELS.map(function (x) { return [x, x]; }));
  var jobs = Object.keys(A.JOBS).map(function (j) { return '<option value="' + j + '"' + (j === r.job ? " selected" : "") + ">" + esc(A.JOBS[j].name) + "</option>"; }).join("");
  var b = (ro ? '<div class="lockline">' + A.I.lock + "<span>" + (A.state(l) === "started" ? "Started at " + A.fmt(A.firstIn(l)) + ". This lineup is read-only." : "Published. Tap Edit on the lineup to change it.") + "</span></div>" : "") +
    '<div class="cfg"><p class="cfl">Time</p><div class="ctimes"><input class="input" aria-label="In" data-act="field" data-f="in" value="' + A.fmt(r.in) + '"' + (ro ? " disabled" : "") + '><span aria-hidden="true">–</span><input class="input" aria-label="Out" data-act="field" data-f="out" value="' + A.fmt(r.out) + '"' + (ro ? " disabled" : "") + "></div>" +
    (ch.sched && (ch.in || ch.out) ? '<p class="cfh">Schedule: ' + A.range(ch.sched.in, ch.sched.out) + "</p>" : "") + "</div>" +
    '<div class="cfg"><p class="cfl">Section</p>' + radios("sec-" + r.id, "section", secs, esc(r.section), ro, "cchips", "Section", addSec) + "</div>" +
    '<div class="cfg"><p class="cfl">Label</p>' + radios("lab-" + r.id, "label", labs, r.label, ro, "csegs", "Label") + "</div>" +
    '<div class="cfg"><p class="cfl">Position</p><label class="select"><span class="sr">Position</span><select data-act="field" data-f="job"' + (ro ? " disabled" : "") + ">" + jobs + "</select></label></div>" +
    '<p class="cinfo">' + A.I.calendar + "<span>" + (ch.sched && ch.sched.job !== r.job ? "Changed in this lineup only. Schedule: " + esc(A.JOBS[ch.sched.job].name) + "." : "Changes stay in this lineup. The Schedule doesn't change.") + "</span></p>";
  var foot = ro ? '<button type="button" class="btn" data-act="close">Close</button>'
    : '<button type="button" class="btn danger' + (P.armed === "off" ? " armed" : "") + '" data-act="calloff">' + (P.armed === "off" ? "Tap again to call off" : "Call off") + '</button><button type="button" class="btn green" data-act="close">Done</button>';
  return frame(A, { still: still, cls: "cperson", title: esc(r.name), label: r.name, lead: av(A, r.job, 44, r.name),
    sub: esc(A.JOBS[r.job].name) + " · " + t.name + " · " + A.LOCS[l.loc].name, body: b, foot: foot });
}
function addSheet(P, A, still) {
  var esc = A.esc, l = A.D.L[P.sheet.k], t = A.TYPES[l.type];
  var dept = A.DEPTS.filter(function (d) { return d.id === P.sheet.dept; })[0] || A.DEPTS[0];
  var KIND = { available: "ok", here: "here", other: "info", timeoff: "warn", no: "no" };
  var groups = A.candidates(P).map(function (g) {
    return '<div class="ccg k-' + KIND[g.kind] + '"><p class="ccgh"><i></i>' + esc(g.title) + "<span>" + g.items.length + "</span></p>" + g.items.map(function (x) {
      var c = x.c, armed = P.armed === "pick-" + c.n, jn = A.JOBS[x.job].name;
      var line = c.kind === "available" ? (x.rank === 2 ? "Free today · " + esc(c.jobs.map(function (j) { return A.JOBS[j].name; }).join(", ")) : '<span class="ok">Free today</span> · ' + esc(jn))
        : c.kind === "here" ? esc(c.note.replace(" here ·", "")) + ' <i class="chrs">' + (c.hrs + 6) + "h today</i>"
        : c.kind === "other" ? '<span class="info">' + esc(c.note) + "</span>"
        : c.kind === "timeoff" ? '<span class="warn">' + esc(c.note) + "</span>" : esc(c.note);
      var btn = c.kind === "no" ? "" : '<button type="button" class="cpick k-' + c.kind + (armed ? " armed" : "") + '" data-act="pick" data-n="' + esc(c.n) + '">' +
        (armed ? (c.kind === "other" ? "Confirm move" : "Add anyway") : c.kind === "other" ? "Move here" : A.I.plus + "Add") + "</button>";
      var why = armed ? '<p class="cwhy k-' + c.kind + '">' + (c.kind === "other" ? esc(A.first(c.n)) + " leaves Uptown's Dinner lineup. Uptown sees the move and can bring " + esc(A.first(c.n)) + " back."
        : esc(A.first(c.n)) + " has an approved day off. Adding puts " + esc(A.first(c.n)) + " in this lineup only; the day off and the Schedule don't change.") + "</p>" : "";
      return '<div class="ccand' + (c.kind === "no" ? " no" : x.rank === 2 ? " dim" : "") + (armed ? " armed" : "") + '" data-n="' + esc(c.n.toLowerCase()) + '">' + av(A, x.job, 40, c.n) +
        '<span class="nm"><b>' + esc(c.n) + "</b><span>" + line + "</span></span>" + btn + why + "</div>";
    }).join("") + "</div>";
  }).join("");
  var body = '<label class="csearch">' + A.I.search + '<span class="sr">Search by name</span><input class="input" type="search" placeholder="Search by name" autocomplete="off" data-c-search></label>' +
    groups + '<p class="cnomatch" hidden>No one matches.</p>';
  return frame(A, { still: still, cls: "cadds", label: "Add staff to " + dept.name,
    lead: '<span class="cdsw" style="--dc:' + deptColor(A, dept) + '" aria-hidden="true">' + A.I.userPlus + "</span>",
    title: "Add to " + esc(dept.name), sub: t.name + " · " + A.LOCS[l.loc].name + " · " + A.short(t.def[0], t.def[1]), body: body });
}
function publishSheet(P, A, still) {
  var esc = A.esc, body = "";
  if (P.pubDone) body += '<div class="cdone" role="status">' + A.I.checkCircle + "<div><b>" + esc(P.pubDone.split(". ")[0]) + "</b><span>" + esc(P.pubDone.split(". ").slice(1).join(". ")) + "</span></div></div>";
  ["dt", "up"].forEach(function (loc) {
    body += '<div class="cpl"><p class="cplh">' + A.I.pin + A.LOCS[loc].name + "</p>";
    A.lineupsAt(loc).forEach(function (l) {
      var n = A.live(l).length, st = A.state(l), t = A.TYPES[l.type], s = A.stats(l);
      var span = n ? A.range(s.first, s.last) : "";
      if (!n) { body += '<div class="cpr is-empty" style="--c:' + t.c + '"><span class="cpr-lead"></span><span class="t"><b>' + t.name + "</b><span>Nobody scheduled</span></span></div>"; return; }
      if (st === "draft") {
        var on = P.picks.indexOf(l.k) >= 0;
        body += '<label class="cpr pick' + (on ? " on" : "") + '" style="--c:' + t.c + '"><span class="cpr-lead"><input type="checkbox" class="cb" aria-label="Publish ' + A.LOCS[loc].name + " " + t.name + '" data-act="pub-pick" data-k="' + l.k + '"' + (on ? " checked" : "") + "></span>" +
          '<span class="t"><b>' + t.name + "</b><span>" + plural(n, "person", "people") + " · " + span + '</span></span><span class="cst draft"><i></i>Draft</span></label>';
      } else {
        body += '<div class="cpr" style="--c:' + t.c + '"><span class="cpr-lead ok">' + A.I.check + '</span><span class="t"><b>' + t.name + "</b><span>" + (st === "started" ? "Started" : "Published " + esc(l.at)) + " · " + Math.min(l.acked, n) + "/" + n + (A.D.ackOn ? " acknowledged" : " read") + "</span></span></div>";
      }
    });
    body += "</div>";
  });
  body += '<div class="cswitch"><span><b>Ask staff to acknowledge</b><span>Each person taps Acknowledge after reading.</span></span><button type="button" class="tog" role="switch" aria-checked="' + A.D.ackOn + '" aria-label="Ask staff to acknowledge" data-act="pub-ack"></button></div>';
  var n = P.picks.length;
  var foot = P.pubDone && !n ? '<button type="button" class="btn green" data-act="close">Done</button>'
    : '<button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn green" data-act="pub-go"' + (n ? "" : " disabled") + ">" + A.I.send + (n ? "Publish " + n : "Publish") + "</button>";
  return frame(A, { still: still, cls: "cpubs", title: "Publish lineups", sub: A.DATE.long + ". Staff see a lineup once it's published.", body: body, foot: foot });
}
function editSheet(P, A, still) {
  var l = A.D.L[P.sheet.k], t = A.TYPES[l.type], n = A.live(l).length;
  var body = '<ul class="cfacts">' +
    "<li>" + A.I.edit + "<span>Dinner goes back to draft so you can change it.</span></li>".replace("Dinner", t.name) +
    "<li>" + A.I.lock + "<span>Staff don't see it until you publish again.</span></li>" +
    "<li>" + A.I.check + "<span>" + Math.min(l.acked, n) + " of " + n + (A.D.ackOn ? " have acknowledged it" : " have read it") + ". People whose spot changes are asked to acknowledge again.</span></li></ul>";
  return frame(A, { still: still, cls: "cedits", title: "Edit " + t.name + " lineup?", sub: A.LOCS[l.loc].name + " · Published " + A.esc(l.at), body: body,
    foot: '<button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn green" data-act="unpub-go">' + A.I.edit + "Unpublish &amp; edit</button>" });
}
function notesSheet(P, A, still) {
  var l = A.D.L[P.sheet.k], t = A.TYPES[l.type];
  var f = NOTE_KEYS.map(function (x) { return '<label class="cfg"><span class="cfl">' + x[1] + '</span><textarea class="input" data-note="' + x[0] + '" placeholder="' + (x[0] === "sp" ? "Today's specials" : x[0] === "s86" ? "Items that are out" : "Anything the team should know") + '">' + A.esc(l.notes[x[0]]) + "</textarea></label>"; }).join("");
  return frame(A, { still: still, cls: "cnotess", title: t.name + " notes", sub: "Staff see these with the lineup. Empty notes don't show.", body: f,
    foot: '<button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn green" data-act="notes-save">Save</button>' });
}

/* ---------- Add Staff search (filters rows in place, no re-render) ---------- */
function filterAdd(app, q) {
  q = (q || "").trim().toLowerCase();
  var any = false;
  app.querySelectorAll(".ccg").forEach(function (g) {
    var vis = 0;
    g.querySelectorAll(".ccand").forEach(function (c) { var ok = !q || c.dataset.n.indexOf(q) >= 0; c.hidden = !ok; if (ok) vis++; });
    g.hidden = !vis; if (vis) any = true;
  });
  var nm = app.querySelector(".cnomatch"); if (nm) nm.hidden = any;
}

/* ---------- Keep keyboard focus across re-renders (the core replaces the screen's HTML on every change) ---------- */
function focusKey(el) {
  var c = el.closest("[data-act], [data-c-search]"); if (!c) return null;
  var s = c.tagName.toLowerCase();
  ["act", "id", "f", "k", "n", "t", "s", "dept"].forEach(function (k) { if (c.dataset[k] != null) s += "[data-" + k + '="' + CSS.escape(c.dataset[k]) + '"]'; });
  if (c.type === "radio") s += '[value="' + CSS.escape(c.value) + '"]';
  if (c.hasAttribute("data-c-search")) s += "[data-c-search]";
  return s;
}

NF.variant({
  id: "c",
  name: "3 · İstasyon kartları",
  sub: "Her satırda saat solda, Section sağda renkli bir rozet: kimin ne zaman, nerede durduğu tek bakışta. Departmanlar ayrı kartlarda; özet vardiyada saat saat kaç kişi olduğunu gösterir; çalışan kendi saatini ve yerini en üstte büyük görür.",
  render: function (P, A) {
    var ae = document.activeElement, mine = ae && ae.closest && ae.closest('[data-phone="c:' + P.role + '"]');
    P.vs.fk = mine ? focusKey(ae) : null;
    P.vs.opened = !!(P.sheet && !P.vs.ps);
    P.vs.closed = !!(!P.sheet && P.vs.ps);
    if (P.vs.opened) P.vs.opener = P.vs.fk;
    if (!P.sheet) P.vs.ps = null;
    return P.role === "emp" ? emp(P, A) : mgr(P, A);
  },
  sheet: function (P, A) {
    var sig = JSON.stringify(P.sheet), still = P.vs.ps === sig; P.vs.ps = sig;
    var t = P.sheet.type;
    if (t === "person") return personSheet(P, A, still);
    if (t === "add") return addSheet(P, A, still);
    if (t === "publish") return publishSheet(P, A, still);
    if (t === "editpub") return editSheet(P, A, still);
    if (t === "notes") return notesSheet(P, A, still);
    return null;
  },
  toast: function (P, A) {
    if (!P.toast) { P.vs.pt = null; return ""; }
    var still = P.vs.pt === P.toast.msg; P.vs.pt = P.toast.msg;
    return '<div class="toast ctoast' + (still ? " still" : "") + '" role="status">' + A.I.checkCircle + "<span>" + A.esc(P.toast.msg) + "</span>" + (P.toast.undo ? '<button type="button" data-act="undo">Undo</button>' : "") + "</div>";
  },
  after: function (app, P) {
    var s = app.querySelector("[data-c-search]");
    if (s) {
      s.value = P.vs.q || "";
      filterAdd(app, s.value);
      s.addEventListener("input", function () { P.vs.q = s.value; filterAdd(app, s.value); });
    }
    if (!P.sheet || P.sheet.type !== "add") P.vs.q = "";
    /* Focus: into the sheet when it opens, back to the opener when it closes, else stay where it was. */
    var t = null;
    if (P.vs.opened && P.vs.fk) t = app.querySelector(".sheet .icon-btn");
    else if (P.vs.closed && P.vs.opener) { t = app.querySelector(P.vs.opener); P.vs.opener = null; }
    else if (P.vs.fk) t = app.querySelector(P.vs.fk);
    if (t && document.activeElement !== t) t.focus({ preventScroll: true });
  }
});
})();
