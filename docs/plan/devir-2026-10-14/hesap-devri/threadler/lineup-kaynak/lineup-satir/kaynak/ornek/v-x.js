/* Reference variant: shows how a variant uses the contract. Not a design proposal.
   It is today's "Vardiya sekmeleri" structure with job icons instead of initials. */
(function () {
"use strict";
NF.variant({
  id: "x",
  name: "X · Örnek",
  sub: "Sözleşme örneği; tasarım önerisi değil.",
  render: function (P, A) {
    var I = A.I, esc = A.esc;
    if (P.role === "emp") return emp(P, A);
    var cur = A.cur(P), l = cur.l, st = A.state(l), s = A.stats(l), t = A.TYPES[l.type];
    var drafts = A.drafts().length;
    var tabs = A.lineupsAt(P.loc).map(function (x) {
      var on = x.type === P.tab, xs = A.state(x);
      return '<button type="button" role="tab" aria-selected="' + on + '" style="--c:' + A.TYPES[x.type].c + '" data-act="tab" data-t="' + x.type + '"><i class="dot ' + xs + '"></i>' + A.TYPES[x.type].name + ' <span class="n">' + A.live(x).length + "</span></button>";
    }).join("");
    var head = '<header class="xbar"><div class="xtop"><h1>Lineup</h1><button type="button" class="btn green sm" data-act="publish">' + I.send + "Publish" + (drafts ? " " + drafts : "") + "</button></div>" +
      '<div class="xctl"><span class="xdate">' + A.DATE.short + '</span><label class="select"><span class="sr">Location</span><select data-act="loc">' +
      ["dt", "up"].map(function (k) { return '<option value="' + k + '"' + (P.loc === k ? " selected" : "") + ">" + A.LOCS[k].name + "</option>"; }).join("") + "</select></label></div>" +
      '<div class="xtabs" role="tablist">' + tabs + "</div></header>";
    var body = '<section class="xsum" style="--c:' + t.c + '"><h2>' + t.name + "</h2><p>" + statusText(A, l, st) + "</p>" +
      (st === "published" ? '<button type="button" class="btn sm" data-act="editpub">' + I.edit + "Edit</button>" : "") + "</section>";
    if (st === "empty") body += '<div class="xpanel xempty"><p>No one is scheduled.</p><button type="button" class="btn" data-act="add" data-dept="foh">' + I.userPlus + "Add staff</button></div>";
    else {
      body += '<div class="xseg" role="tablist"><button type="button" role="tab" aria-selected="' + (P.seg === "team") + '" data-act="seg" data-s="team">Team</button><button type="button" role="tab" aria-selected="' + (P.seg === "notes") + '" data-act="seg" data-s="notes">Notes</button></div>';
      body += P.seg === "team" ? '<div class="xpanel">' + team(P, A, l) + "</div>" : notes(P, A, l);
    }
    return '<div class="scroll">' + head + body + '<div style="height:24px"></div></div>' + A.navMgr();
  }
});
function statusText(A, l, st) {
  if (st === "empty") return "No one is scheduled";
  if (st === "draft") return "Draft · not published";
  return "Published v" + l.v + " · " + l.at + (st === "started" ? " · Started" : "") + " · " + l.acked + "/" + A.live(l).length + " read";
}
function team(P, A, l) {
  var esc = A.esc, can = A.editable(P, l), out = "";
  A.groups(l).forEach(function (g) {
    out += '<div class="xdept"><b>' + esc(g.dept.name) + "</b>" + (can ? '<button type="button" class="xadd" data-act="add" data-dept="' + g.dept.id + '">' + A.I.plus + "Add Staff</button>" : "") + "</div>";
    g.jobs.forEach(function (j) {
      out += '<p class="xjob">' + esc(j.job.name) + " <span>" + j.rows.length + "</span></p>";
      j.rows.forEach(function (r) {
        var me = P.role === "emp" && A.D.me.id === r.id;
        out += '<button type="button" class="xrow' + (me ? " me" : "") + '" data-act="person" data-id="' + r.id + '">' + A.icon(r.job, 36) +
          '<span class="xwho"><b>' + esc(r.name) + "</b><span>" + A.range(r.in, r.out) + "</span></span>" +
          '<span class="xtags">' + A.tags(r).map(function (t) { return '<i class="k-' + t.kind + '">' + esc(t.t) + "</i>"; }).join("") + "</span>" +
          '<span class="xsec">' + esc(r.section) + "</span></button>";
      });
    });
  });
  var off = A.offRows(l);
  if (off.length) out += '<p class="xjob">Called off</p>' + off.map(function (r) {
    return '<div class="xrow off">' + A.icon(r.job, 36) + '<span class="xwho"><b>' + esc(r.name) + "</b><span>" + (r.moved ? "Moved to " + esc(r.moved) : "Called off") + "</span></span>" + (A.editable(P, l) && !r.moved ? '<button type="button" class="btn sm" data-act="restore" data-id="' + r.id + '">Restore</button>' : "") + "</div>";
  }).join("");
  return out;
}
function notes(P, A, l) {
  var esc = A.esc;
  return '<div class="xpanel">' + [["sp", "Specials"], ["s86", "86s"], ["sn", "Shift notes"]].map(function (x) {
    return '<div class="xnote"><b>' + x[1] + "</b><p>" + (l.notes[x[0]] ? esc(l.notes[x[0]]) : '<span style="color:var(--theme-text-faint)">Nothing yet</span>') + "</p></div>";
  }).join("") + "</div>" + (A.editable(P, l) ? '<div style="margin:10px 16px"><button type="button" class="btn block" data-act="notes">' + A.I.edit + "Edit notes</button></div>" : "");
}
function emp(P, A) {
  var m = A.me(), l = m.l, r = m.r, esc = A.esc, body;
  if (l.status !== "published") body = '<div class="xpanel xempty"><p><b>Your Dinner lineup isn\'t out yet.</b><br>You\'ll get a notification when ' + esc(A.first(A.MANAGER)) + " publishes it. Your shift: " + A.range(r.sched.in, r.sched.out) + ", Server.</p></div>";
  else body = '<section class="xsum" style="--c:' + A.TYPES[l.type].c + '"><h2>' + esc(r.name) + "</h2><p>" + A.range(r.in, r.out) + " · " + A.JOBS[r.job].name + (r.section ? " · " + esc(r.section) : "") + "</p></section>" +
    '<div class="xpanel">' + team(P, A, l) + "</div>" +
    '<div style="margin:12px 16px">' + (A.D.meAcked ? '<p class="hint">' + A.I.check + "Acknowledged</p>" : '<button type="button" class="btn green block" data-act="ack">' + A.I.check + "Acknowledge</button>") + "</div>";
  return '<div class="scroll"><header class="xbar"><div class="xtop"><h1>Lineup</h1></div><div class="xctl"><span class="xdate">' + A.DATE.short + "</span></div></header>" + body + '<div style="height:24px"></div></div>' + A.navEmp();
}
})();
