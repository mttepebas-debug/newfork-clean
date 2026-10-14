/* Lineup on the phone: shared data, state, actions and mockup chrome.
   Variants register with NF.variant({...}) and draw the whole screen; this file never draws a variant's design.
   Contract: see README.md in this folder. */
(function () {
  "use strict";
  var NF = (window.NF = window.NF || {});

  /* ---------------- UI icons (lucide, same as the app) ---------------- */
  function svg(p, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>"; }
  var I = {
    left: svg('<path d="m15 18-6-6 6-6"/>'),
    right: svg('<path d="m9 18 6-6-6-6"/>'),
    down: svg('<path d="m6 9 6 6 6-6"/>'),
    up: svg('<path d="m18 15-6-6-6 6"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 2.4),
    userPlus: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>'),
    x: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    lock: svg('<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>', 3),
    checkCircle: svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
    note: svg('<path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/>'),
    edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
    send: svg('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
    image: svg('<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>'),
    copy: svg('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
    pin: svg('<path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    tag: svg('<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>'),
    layout: svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>'),
    calendar: svg('<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    more: svg('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
    moreV: svg('<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>'),
    search: svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
    bell: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
    alert: svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
    undo: svg('<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>'),
    phoneOff: svg('<path d="m2 2 20 20"/><path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193"/>'),
    grip: svg('<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>'),
    nav: {
      ws: svg('<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>'),
      lu: svg('<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>'),
      rq: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v2"/><path d="M12 13h.01"/>'),
      em: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
      home: svg('<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
      mo: svg('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>')
    }
  };

  /* ---------------- Fixed data ---------------- */
  var NOW = 14 * 60 + 10; // Wednesday, October 14, 2:10 PM at the location
  var DATE = { short: "Wed, Oct 14", long: "Wednesday, October 14" };
  var MANAGER = "Sarah Mitchell";
  var TYPES = {
    lunch: { id: "lunch", name: "Lunch", c: "#1f9d74", def: ["11:00", "16:00"] },
    dinner: { id: "dinner", name: "Dinner", c: "#6d5bd0", def: ["16:00", "22:00"] },
    close: { id: "close", name: "Close", c: "#c2417a", def: ["21:00", "01:00"] }
  };
  var TYPE_ORDER = ["lunch", "dinner", "close"];
  var LOCS = { dt: { id: "dt", name: "Downtown", full: "Harbor & Vine Downtown" }, up: { id: "up", name: "Uptown", full: "Harbor & Vine Uptown" } };
  var DEPTS = [
    { id: "foh", name: "Front of House", jobs: ["server", "host", "busser"] },
    { id: "bar", name: "Bar", jobs: ["bartender", "barback"] },
    { id: "boh", name: "Kitchen", jobs: ["linecook", "prep"] }
  ];
  /* icon: key into NF.JOB_ICONS (Restaurant job icon pack, renkli). A job without an icon shows initials. */
  var JOBS = {
    server: { id: "server", name: "Server", c: "#2563eb", icon: "server" },
    host: { id: "host", name: "Host", c: "#0ea5e9", icon: "host" },
    busser: { id: "busser", name: "Busser", c: "#64748b", icon: "busser" },
    bartender: { id: "bartender", name: "Bartender", c: "#9333ea", icon: "bartender" },
    barback: { id: "barback", name: "Barback", c: "#a855f7", icon: "barback" },
    linecook: { id: "linecook", name: "Line Cook", c: "#ea580c", icon: "linecook" },
    prep: { id: "prep", name: "Prep Cook", c: "#d97706", icon: "prep" }
  };
  var LABELS = ["Opener", "Closer", "Training", "Lead"];
  var SECTIONS = {
    dt: ["Section 1", "Section 2", "Section 3", "Sections 1–2", "Front door", "Patio", "Bar top", "Service well", "Grill", "Expo line"],
    up: ["Section 1", "Section 2", "Patio", "Bar"]
  };

  /* ---------------- Live data (shared by every phone on the page) ---------------- */
  var seq = 0;
  function R(name, job, a, b, label, section, extra) {
    var r = { id: "r" + (++seq), name: name, job: job, in: a, out: b, label: label || "", section: section || "", tags: [], off: false, moved: "", sched: null };
    for (var k in extra || {}) r[k] = extra[k];
    if (!r.sched && !r.only) r.sched = { job: job, in: a, out: b };
    return r;
  }
  function L(loc, type, status, rows, extra) {
    var l = { k: loc + "-" + type, loc: loc, type: type, status: status, v: status === "published" ? 1 : 0, at: "", by: MANAGER, acked: 0, notes: { sp: "", s86: "", sn: "" }, rows: rows };
    for (var k in extra || {}) l[k] = extra[k];
    return l;
  }
  function freshData() {
    seq = 0;
    var D = { L: {}, ackOn: true, me: null, meAcked: false, extraSections: { dt: [], up: [] } };
    var dinner = L("dt", "dinner", "draft", [
      R("Maria Lopez", "server", "16:00", "22:00", "Closer", "Section 1"),
      R("Hannah Lee", "server", "16:30", "22:00", "", "Section 2", { sched: { job: "server", in: "16:00", out: "22:00" } }),
      R("Owen Price", "server", "17:00", "23:00", "Training", "Section 3"),
      R("Noah Garcia", "server", "16:00", "22:00", "", "Section 3"),
      R("Alexandra Montgomery", "server", "17:00", "22:00", "", "Patio", { tags: [{ t: "From Uptown", kind: "from" }] }),
      R("Priya Patel", "host", "16:00", "21:00", "", "Front door"),
      R("Ethan Brooks", "busser", "16:00", "22:00", "", "Sections 1–2"),
      R("Jake Thompson", "bartender", "16:00", "23:00", "Lead", "Bar top"),
      R("Daniel Kim", "barback", "16:00", "22:00", "", "Service well"),
      R("Aisha Johnson", "linecook", "15:30", "22:00", "", "Grill"),
      R("Carlos Rivera", "linecook", "15:30", "22:30", "Closer", "", { sched: { job: "linecook", in: "15:30", out: "22:00" } }),
      R("Mei Tanaka", "prep", "15:00", "21:00", "", "Expo line", { only: true, sched: null, tags: [{ t: "Lineup only", kind: "only" }] })
    ], { notes: { sp: "Halibut with lemon butter, $34", s86: "Burrata", sn: "Private party of 14 at 7 PM in Section 3. Birthday, cake at 8:30." } });
    D.L["dt-lunch"] = L("dt", "lunch", "published", [
      R("Emma Wilson", "server", "11:00", "16:00", "Opener", "Section 1"),
      R("Chloe Davis", "server", "11:00", "15:00", "", "Section 2"),
      R("Sofia Reyes", "host", "10:30", "15:00", "", "Front door"),
      R("Marcus Bell", "linecook", "10:00", "16:00", "Opener", "Grill")
    ], { at: "10:30 AM", acked: 4, notes: { sp: "Soup: roasted tomato", s86: "", sn: "" } });
    D.L["dt-dinner"] = dinner;
    D.L["dt-close"] = L("dt", "close", "draft", []);
    D.L["up-lunch"] = L("up", "lunch", "published", [
      R("Grace Kim", "server", "15:00", "18:00", "", "Patio"),
      R("Leo Martin", "host", "15:00", "18:00")
    ], { at: "10:45 AM", acked: 1 });
    D.L["up-dinner"] = L("up", "dinner", "draft", [
      R("Ava Martinez", "server", "16:00", "22:00"),
      R("Mia Chen", "server", "17:00", "22:00"),
      R("Liam Scott", "bartender", "16:00", "23:00", "Opener"),
      R("Ben Carter", "linecook", "15:30", "22:00")
    ], { notes: { sp: "", s86: "Oysters", sn: "" } });
    D.L["up-close"] = L("up", "close", "draft", []);
    D.me = { k: "dt-dinner", id: dinner.rows[1].id };
    D.pool = [
      { n: "Rachel Adams", jobs: ["server", "host"], kind: "available" },
      { n: "Tyler Brooks", jobs: ["busser", "server"], kind: "available" },
      { n: "Nina Patel", jobs: ["host"], kind: "available" },
      { n: "Olivia Grant", jobs: ["server", "host", "busser"], kind: "available" },
      { n: "Sam Ortiz", jobs: ["bartender", "barback", "server"], kind: "available" },
      { n: "Zoe Turner", jobs: ["barback"], kind: "available" },
      { n: "Kevin Wright", jobs: ["linecook", "prep"], kind: "available" },
      { n: "Emma Wilson", jobs: ["server"], kind: "here", note: "Lunch here · 11 AM – 4 PM", hrs: 5 },
      { n: "Chloe Davis", jobs: ["server", "host"], kind: "here", note: "Lunch here · 11 AM – 3 PM", hrs: 4 },
      { n: "Marcus Bell", jobs: ["linecook"], kind: "here", note: "Lunch here · 10 AM – 4 PM", hrs: 6 },
      { n: "Ava Martinez", jobs: ["server", "bartender"], kind: "other", note: "Uptown · Dinner 4 – 10 PM", from: "up-dinner" },
      { n: "Liam Scott", jobs: ["bartender"], kind: "other", note: "Uptown · Dinner 4 – 11 PM", from: "up-dinner" },
      { n: "Lily Chen", jobs: ["server", "bartender"], kind: "timeoff", note: "Approved day off" },
      { n: "Jordan Hayes", jobs: ["server"], kind: "no", note: "Works at Uptown only" },
      { n: "Derek Ford", jobs: ["linecook"], kind: "no", note: "Works at Uptown only" }
    ];
    return D;
  }
  var D = freshData();

  /* ---------------- Helpers ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function min(t) { var p = t.split(":"); return +p[0] * 60 + +p[1]; }
  function endMin(a, b) { var x = min(b); return x <= min(a) ? x + 1440 : x; }
  /* "4:00 PM"; ap=false drops AM/PM */
  function fmt(t, ap) { var m = min(t), h = Math.floor(m / 60) % 24, mm = m % 60, s = (h % 12 || 12) + ":" + (mm < 10 ? "0" : "") + mm; return ap === false ? s : s + (h < 12 ? " AM" : " PM"); }
  /* "4:00 PM – 10:00 PM" (Mert 14 Oct 02:18: AM/PM on both ends) */
  function range(a, b) { return fmt(a) + " – " + fmt(b); }
  /* "4 – 10 PM", "11:30 AM – 4 PM": compact, still unambiguous */
  function short(a, b) {
    function p(t) { var m = min(t), h = Math.floor(m / 60) % 24, mm = m % 60; return { s: (h % 12 || 12) + (mm ? ":" + (mm < 10 ? "0" : "") + mm : ""), ap: h < 12 ? "AM" : "PM" }; }
    var x = p(a), y = p(b);
    return x.ap === y.ap ? x.s + " – " + y.s + " " + y.ap : x.s + " " + x.ap + " – " + y.s + " " + y.ap;
  }
  function hours(a, b) { var h = (endMin(a, b) - min(a)) / 60; return (Math.round(h * 10) / 10) + "h"; }
  function initials(n) { return n.split(" ").map(function (x) { return x[0]; }).join("").slice(0, 2).toUpperCase(); }
  function first(n) { return n.split(" ")[0]; }
  function deptOf(job) { for (var i = 0; i < DEPTS.length; i++) if (DEPTS[i].jobs.indexOf(job) >= 0) return DEPTS[i]; return DEPTS[0]; }
  function parseTime(s, base) {
    s = String(s).trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
    var m = s.match(/^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/);
    if (!m) return null;
    var h = +m[1], mm = m[2] ? +m[2] : 0, ap = m[3] ? m[3][0] : null;
    if (mm > 59) return null;
    if (ap) { if (h < 1 || h > 12) return null; h = h % 12 + (ap === "p" ? 12 : 0); }
    else if (h > 23) return null;
    else if (h <= 12 && base) { var b = min(base) / 60; if (h < 12 && b >= 12 && h + 12 <= 23) h += 12; }
    return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
  }

  /* ---------------- API given to variants ---------------- */
  var A = {
    I: I, NOW: NOW, DATE: DATE, MANAGER: MANAGER, TYPES: TYPES, TYPE_ORDER: TYPE_ORDER, LOCS: LOCS, DEPTS: DEPTS, JOBS: JOBS, LABELS: LABELS,
    esc: esc, min: min, fmt: fmt, range: range, short: short, hours: hours, initials: initials, first: first, deptOf: deptOf,
    get D() { return D; },
    sections: function (loc) { return SECTIONS[loc].concat(D.extraSections[loc]); },
    /* The job's drawing from the icon pack, or initials when the job has none. size in px. */
    icon: function (job, size, cls, name) {
      var j = JOBS[job], src = j && NF.JOB_ICONS && NF.JOB_ICONS[j.icon];
      size = size || 36;
      if (src) return '<img class="jicon' + (cls ? " " + cls : "") + '" src="' + src + '" width="' + size + '" height="' + size + '" alt="" aria-hidden="true">';
      return '<span class="jini' + (cls ? " " + cls : "") + '" style="width:' + size + "px;height:" + size + "px;font-size:" + Math.round(size * 0.34) + 'px" aria-hidden="true">' + esc(initials(name || (j ? j.name : "?"))) + "</span>";
    },
    /* Current lineup for this phone: { k, l } */
    cur: function (P) { var k = P.loc + "-" + P.tab; return { k: k, l: D.L[k] }; },
    lineupsAt: function (loc) { return TYPE_ORDER.map(function (t) { return D.L[loc + "-" + t]; }).filter(Boolean); },
    live: function (l) { return l.rows.filter(function (r) { return !r.off; }); },
    offRows: function (l) { return l.rows.filter(function (r) { return r.off; }); },
    firstIn: function (l) { var rs = A.live(l); return rs.length ? rs.reduce(function (m, r) { return min(r.in) < min(m) ? r.in : m; }, "23:59") : null; },
    lastOut: function (l) { var rs = A.live(l); return rs.length ? rs.reduce(function (m, r) { return endMin(r.in, r.out) > endMin(m.in, m.out) ? r : m; }, rs[0]).out : null; },
    /* "empty" | "draft" | "published" | "started" (published and the first person is in: read-only) */
    state: function (l) {
      if (!A.live(l).length && !l.rows.length) return "empty";
      if (l.status === "published") return min(A.firstIn(l) || "23:59") <= NOW ? "started" : "published";
      return "draft";
    },
    editable: function (P, l) { var s = A.state(l); return P.role === "mgr" && (s === "draft" || s === "empty"); },
    stats: function (l) { var n = A.live(l).length; return { n: n, first: A.firstIn(l), last: A.lastOut(l), acked: l.status === "published" ? l.acked : null, unread: l.status === "published" ? n - l.acked : null }; },
    /* Departments in fixed order, each with its jobs (only jobs that have people), people sorted by in time then name. */
    groups: function (l) {
      var out = [];
      DEPTS.forEach(function (d) {
        var jobs = d.jobs.map(function (j) {
          return { job: JOBS[j], rows: l.rows.filter(function (r) { return r.job === j && !r.off; }).sort(function (a, b) { return min(a.in) - min(b.in) || a.name.localeCompare(b.name); }) };
        }).filter(function (x) { return x.rows.length; });
        if (jobs.length) out.push({ dept: d, jobs: jobs, count: jobs.reduce(function (s, x) { return s + x.rows.length; }, 0) });
      });
      return out;
    },
    hasSec: function (l) { return A.live(l).some(function (r) { return r.section; }); },
    hasLab: function (l) { return A.live(l).some(function (r) { return A.tags(r).length; }); },
    /* Labels first (Opener, Closer, Training, Lead), then status tags. kind: label | from | only | warn | moved | off */
    tags: function (r) { return (r.label ? [{ t: r.label, kind: "label" }] : []).concat(r.tags || []); },
    /* Which of in/out differ from the Schedule */
    changed: function (r) { return r.sched ? { in: r.sched.in !== r.in, out: r.sched.out !== r.out, sched: r.sched } : { in: false, out: false, sched: null }; },
    drafts: function () { return Object.keys(D.L).filter(function (k) { var l = D.L[k]; return l.status === "draft" && A.live(l).length; }); },
    me: function () { var l = D.L[D.me.k]; return { l: l, r: l.rows.filter(function (x) { return x.id === D.me.id; })[0] }; },
    navMgr: function () {
      var it = [["ws", "Workspace"], ["lu", "Lineup"], ["rq", "Requests"], ["em", "Employees"], ["mo", "More"]];
      return '<nav class="nav" aria-label="Main navigation">' + it.map(function (x) { return '<a href="#" ' + (x[0] === "lu" ? 'aria-current="page"' : "") + ' data-act="noop">' + I.nav[x[0]] + "<span>" + x[1] + "</span></a>"; }).join("") + "</nav>";
    },
    navEmp: function () {
      var it = [["home", "Home"], ["lu", "Lineup"], ["rq", "Requests"], ["mo", "More"]];
      return '<nav class="nav emp" aria-label="Main navigation">' + it.map(function (x) { return '<a href="#" ' + (x[0] === "lu" ? 'aria-current="page"' : "") + ' data-act="noop">' + I.nav[x[0]] + "<span>" + x[1] + "</span></a>"; }).join("") + "</nav>";
    },
    /* A bottom sheet frame with the app's default look */
    sheetFrame: function (title, sub, body, foot, cls) {
      return '<div class="scrim" data-act="close"></div><section class="sheet' + (cls ? " " + cls : "") + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><header class="sheet-h"><i class="grab"></i><div class="ttl"><h3>' + esc(title) + '</h3><button type="button" class="icon-btn" aria-label="Close" data-act="close">' + I.x + "</button></div>" + (sub ? "<p>" + sub + "</p>" : "") + '</header><div class="sheet-b">' + body + "</div>" + (foot ? '<footer class="sheet-f">' + foot + "</footer>" : "") + "</section>";
    },
    candidates: function (P) { return candidates(P); },
    find: function (k, id) { return (D.L[k] ? D.L[k].rows : []).filter(function (r) { return r.id === id; })[0]; },
    defaultSheet: function (P) { return defaultSheet(P); },
    toastHtml: function (P) { return P.toast ? '<div class="toast" role="status"><span>' + esc(P.toast.msg) + "</span>" + (P.toast.undo ? '<button type="button" data-act="undo">Undo</button>' : "") + "</div>" : ""; }
  };
  NF.A = A;

  /* ---------------- Default sheets (a variant may replace any of them) ---------------- */
  function sel(f, opts, val, dis, label) {
    return '<label class="select"><span class="sr">' + esc(label || f) + '</span><select data-act="field" data-f="' + f + '"' + (dis ? " disabled" : "") + ">" + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === val ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>";
  }
  function personSheet(P) {
    var l = D.L[P.sheet.k], r = A.find(P.sheet.k, P.sheet.id); if (!r) return "";
    var ro = !A.editable(P, l), ch = A.changed(r);
    var b = (ro ? '<div class="lockline" style="margin-bottom:12px">' + I.lock + "<span>" + (A.state(l) === "started" ? "Started at " + fmt(A.firstIn(l)) + ". This lineup is read-only." : "Published. Tap Edit to change it.") + "</span></div>" : "") +
      '<div class="field"><span>Position</span>' + sel("job", Object.keys(JOBS).map(function (j) { return [j, JOBS[j].name]; }), r.job, ro, "Position") + "</div>" +
      '<div class="field"><span>In – Out</span><div class="two"><input class="input" aria-label="In" data-act="field" data-f="in" value="' + fmt(r.in) + '"' + (ro ? " disabled" : "") + '><input class="input" aria-label="Out" data-act="field" data-f="out" value="' + fmt(r.out) + '"' + (ro ? " disabled" : "") + "></div></div>" +
      '<div class="two"><div class="field"><span>Label</span>' + sel("label", [["", "None"]].concat(LABELS.map(function (x) { return [x, x]; })), r.label, ro, "Label") + "</div>" +
      '<div class="field"><span>Section</span>' + sel("section", [["", "None"]].concat(A.sections(l.loc).map(function (x) { return [x, x]; })).concat([["__add", "+ Add section…"]]), r.section, ro, "Section") + "</div></div>" +
      (ch.sched && (ch.in || ch.out || ch.sched.job !== r.job) ? '<p class="hint">Changed in this lineup only. Schedule: ' + esc(JOBS[ch.sched.job].name) + ", " + range(ch.sched.in, ch.sched.out) + ".</p>" : '<p class="hint">Changes stay in this lineup. The Schedule doesn\'t change.</p>');
    var foot = ro ? '<button type="button" class="btn" data-act="close">Close</button>'
      : '<button type="button" class="btn danger' + (P.armed === "off" ? " armed" : "") + '" data-act="calloff">' + (P.armed === "off" ? "Tap again to call off" : "Call off") + '</button><button type="button" class="btn green" data-act="close">Done</button>';
    return A.sheetFrame(r.name, TYPES[l.type].name + " · " + JOBS[r.job].name + " · " + LOCS[l.loc].name, b, foot);
  }
  function candidates(P) {
    var l = D.L[P.sheet.k], dept = DEPTS.filter(function (d) { return d.id === P.sheet.dept; })[0] || DEPTS[0];
    var inLineup = l.rows.filter(function (r) { return !r.off; }).map(function (r) { return r.name; });
    var list = D.pool.filter(function (c) { return inLineup.indexOf(c.n) < 0; }).map(function (c) {
      var fit = c.jobs.filter(function (j) { return dept.jobs.indexOf(j) >= 0; });
      return { c: c, fit: fit, job: fit[0] || c.jobs[0], rank: fit.length ? (dept.jobs.indexOf(fit[0]) === 0 || c.jobs[0] === fit[0] ? 0 : 1) : 2 };
    }).sort(function (a, b) { return a.rank - b.rank || a.c.n.localeCompare(b.c.n); });
    var order = [["available", "Available"], ["here", "Has another shift here"], ["other", "Working somewhere else"], ["timeoff", "Approved day off"], ["no", "Can't work at " + LOCS[l.loc].name]];
    return order.map(function (g) { return { kind: g[0], title: g[1], items: list.filter(function (x) { return x.c.kind === g[0]; }) }; }).filter(function (g) { return g.items.length; });
  }
  function addSheet(P) {
    var l = D.L[P.sheet.k], dept = DEPTS.filter(function (d) { return d.id === P.sheet.dept; })[0] || DEPTS[0];
    var body = candidates(P).map(function (g) {
      return '<p class="cand-g">' + esc(g.title) + "<span>" + g.items.length + "</span></p>" + g.items.map(function (x) {
        var c = x.c, armed = P.armed === "pick-" + c.n;
        var line = x.rank === 2 && c.kind === "available" ? "<span>Free today · " + esc(c.jobs.map(function (j) { return JOBS[j].name; }).join(", ")) + "</span>" : c.kind === "available" ? '<span class="ok">Free today</span>' : c.kind === "here" ? "<span>" + esc(c.note) + " · " + (c.hrs + 6) + "h today</span>" : c.kind === "other" ? '<span class="info">' + esc(c.note) + "</span>" : c.kind === "timeoff" ? '<span class="warn">' + esc(c.note) + "</span>" : "<span>" + esc(c.note) + "</span>";
        var btn = c.kind === "no" ? "" : '<button type="button" class="padd' + (armed ? " armed" : "") + '" data-act="pick" data-n="' + esc(c.n) + '">' + (armed ? (c.kind === "other" ? "Confirm move" : "Add anyway") : c.kind === "other" ? "Move here" : I.plus + "Add") + "</button>";
        var why = armed ? '<p class="hint" style="grid-column:2/-1;color:var(--theme-' + (c.kind === "other" ? "info" : "warning") + '-text)">' + (c.kind === "other" ? esc(first(c.n)) + " leaves Uptown's Dinner lineup. Uptown sees the move and can bring " + esc(first(c.n)) + " back." : esc(first(c.n)) + " has an approved day off. Adding puts " + esc(first(c.n)) + " in this lineup only; the day off and the Schedule don't change.") + "</p>" : "";
        return '<div class="cand' + (c.kind === "no" ? " no" : x.rank === 2 ? " dim" : "") + '">' + A.icon(x.job, 36, "", c.n) + '<span class="nm"><b>' + esc(c.n) + "</b>" + line + "</span>" + btn + why + "</div>";
      }).join("");
    }).join("");
    return A.sheetFrame("Add staff", esc(dept.name) + " · " + TYPES[l.type].name + " · " + LOCS[l.loc].name, body, "");
  }
  function publishSheet(P) {
    var body = "";
    if (P.pubDone) body = '<p class="ok-line">' + I.checkCircle + esc(P.pubDone) + "</p>";
    ["dt", "up"].forEach(function (loc) {
      body += '<p class="pub-loc">' + LOCS[loc].name + "</p>";
      A.lineupsAt(loc).forEach(function (l) {
        var n = A.live(l).length, st = A.state(l);
        if (!n) { body += '<div class="pub-row"><span class="pub-ok" style="background:var(--theme-surface-muted);color:var(--theme-muted)">–</span><span class="t"><b>' + TYPES[l.type].name + "</b><span>No one is scheduled</span></span></div>"; return; }
        var lead = st === "draft" ? '<input type="checkbox" class="cb" aria-label="Publish ' + TYPES[l.type].name + '" data-act="pub-pick" data-k="' + l.k + '"' + (P.picks.indexOf(l.k) >= 0 ? " checked" : "") + ">" : '<span class="pub-ok">' + I.check + "</span>";
        var sub = st === "draft" ? n + " people · Draft" : "Published v" + l.v + " · " + l.at + (st === "started" ? " · Started" : "") + " · " + l.acked + "/" + n + " read";
        body += '<div class="pub-row">' + lead + '<span class="t"><b>' + TYPES[l.type].name + "</b><span>" + sub + "</span></span></div>";
      });
    });
    body += '<div class="switch"><span><b>Ask staff to acknowledge</b><span>Each person taps Acknowledge after reading.</span></span><button type="button" class="tog" role="switch" aria-checked="' + D.ackOn + '" aria-label="Ask staff to acknowledge" data-act="pub-ack"></button></div>';
    var n = P.picks.length;
    var foot = '<button type="button" class="btn" data-act="close">Close</button><button type="button" class="btn green" data-act="pub-go"' + (n ? "" : " disabled") + ">" + I.send + "Publish" + (n ? " " + n : "") + "</button>";
    return A.sheetFrame("Publish lineups", DATE.long + ". Staff see a lineup after you publish it.", body, foot);
  }
  function editSheet(P) {
    var l = D.L[P.sheet.k];
    return A.sheetFrame("Edit " + TYPES[l.type].name + " lineup?", "", '<p class="hint" style="font-size:13.5px;color:var(--theme-text-body)">The lineup goes back to draft. Staff don\'t see it until you publish it again. People whose spot changes are asked to acknowledge again.</p>',
      '<button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn green" data-act="unpub-go">' + I.edit + "Unpublish &amp; edit</button>");
  }
  function notesSheet(P) {
    var l = D.L[P.sheet.k];
    var f = [["sp", "Specials"], ["s86", "86s"], ["sn", "Shift notes"]].map(function (x) { return '<label class="field"><span>' + x[1] + '</span><textarea class="input" data-note="' + x[0] + '" placeholder="Nothing yet">' + esc(l.notes[x[0]]) + "</textarea></label>"; }).join("");
    return A.sheetFrame(TYPES[l.type].name + " notes", "Staff see these with the lineup. Empty notes don't show.", f, '<button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn green" data-act="notes-save">Save</button>');
  }
  function defaultSheet(P) {
    if (!P.sheet) return "";
    var t = P.sheet.type;
    return t === "person" ? personSheet(P) : t === "add" ? addSheet(P) : t === "publish" ? publishSheet(P) : t === "editpub" ? editSheet(P) : t === "notes" ? notesSheet(P) : "";
  }

  /* ---------------- Variants and phones ---------------- */
  var VARIANTS = [];
  NF.variant = function (def) { VARIANTS = VARIANTS.filter(function (v) { return v.id !== def.id; }); VARIANTS.push(def); };
  function vdef(id) { return VARIANTS.filter(function (v) { return v.id === id; })[0]; }
  /* Mockup chrome state */
  var C = { vid: null, view: "both", moment: "day", compare: false };
  try { var sv = JSON.parse(localStorage.getItem("nf-lineup-satir") || "null"); if (sv) { C.vid = sv.vid; C.view = sv.view || "both"; } } catch (e) {}
  function save() { try { localStorage.setItem("nf-lineup-satir", JSON.stringify({ vid: C.vid, view: C.view })); } catch (e) {} }

  var UI = {}; // phone state by "vid:role"
  var TPL = { mgr: {}, emp: {} }; // the moment's starting state for new phones
  function newUI(role) {
    var P = { role: role, loc: "dt", tab: "dinner", seg: "team", sheet: null, armed: null, toast: null, picks: [], pubDone: null, scroll: null, vs: {} };
    var t = TPL[role]; for (var k in t) P[k] = JSON.parse(JSON.stringify(t[k]));
    return P;
  }
  function ui(key) { if (!UI[key]) UI[key] = newUI(key.split(":")[1]); return UI[key]; }

  var MOMENTS = [
    { id: "day", t: "Dinner taslağı (müdür düzenliyor)", note: "Downtown, Dinner, taslak. Müdür kişilere dokunup düzenler, + Add Staff ile ekler. Çalışan lineup yayınlanana kadar bekleme ekranını görür; müdür telefonunda Publish'e basınca çalışanın telefonu da değişir." },
    { id: "end", t: "Listenin sonu (Kitchen, uzun ad)", note: "Aynı lineup, aşağı kaydırılmış: Kitchen, \"Lineup only\" etiketli kişi ve uzun ad (Alexandra Montgomery) satırda nasıl duruyor." },
    { id: "person", t: "Kişiye dokun: düzenleme", note: "Maria Lopez'e dokunuldu: pozisyon, saat, label, section. Değişiklik yalnız lineup'ta kalır, Schedule değişmez." },
    { id: "add", t: "Front of House'a kişi ekle", note: "Front of House satırındaki + Add Staff. Kişiler bugünkü duruma göre gruplu; başka lokasyondaki kişi iki dokunuşla taşınır, izinli kişi uyarıyla eklenir." },
    { id: "calloff", t: "Call off: Noah Garcia", note: "Noah Garcia call off edildi: satır listenin altına, Called off bölümüne iner. Restore ile geri gelir; Schedule değişmez." },
    { id: "notes", t: "Notlar (Specials, 86s, Shift notes)", note: "Notes sekmesi: Specials, 86s ve Shift notes. Boş not çalışana gitmez." },
    { id: "publish", t: "Publish paneli", note: "Publish: günün taslak lineup'ları seçilir, \"Ask staff to acknowledge\" açılıp kapanır." },
    { id: "published", t: "Yayında (okuyanlar sayılıyor)", note: "Dinner yayında: 12 kişiden 7'si okudu. Müdür Edit ile lineup'ı yayından kaldırıp düzenleyebilir." },
    { id: "started", t: "Başlamış lineup: salt okunur (Lunch)", note: "Lunch 10:00'da başladı: lineup salt okunur, düğmeler yok." },
    { id: "nosec", t: "Section yazılmamış vardiya (Uptown)", note: "Uptown, Dinner: kimsenin Section'ı yok, bu yüzden Section sütunu hiç çıkmaz." },
    { id: "empty", t: "Boş vardiya (Close)", note: "Close: o vardiyada kimse yok. Add Staff ile başlanır." },
    { id: "emp", t: "Çalışan: kendi lineup'ı", note: "Çalışan Hannah Lee'nin telefonu: kendi vardiyası en üstte (saati lineup'ta 4:00'ten 4:30'a alındı), notlar, bütün ekip, en altta Acknowledge." },
    { id: "empack", t: "Çalışan onayladı", note: "Hannah Acknowledge'a bastı: düğme kaybolur, yerine onay zamanı yazar." }
  ];
  function moment(id) {
    C.moment = id; D = freshData(); UI = {}; TPL = { mgr: {}, emp: {} };
    var dn = D.L["dt-dinner"];
    function pub(l, at, acked) { l.status = "published"; l.v = 1; l.at = at; l.acked = acked; }
    if (id === "end") TPL.mgr.scroll = "end";
    if (id === "person") TPL.mgr.sheet = { type: "person", k: "dt-dinner", id: dn.rows[0].id };
    if (id === "add") TPL.mgr.sheet = { type: "add", k: "dt-dinner", dept: "foh" };
    if (id === "calloff") { dn.rows[3].off = true; TPL.mgr.toast = { msg: "Noah Garcia called off. The Schedule doesn't change.", undo: { type: "restore", k: "dt-dinner", id: dn.rows[3].id } }; TPL.mgr.scroll = "end"; }
    if (id === "notes") TPL.mgr.seg = "notes";
    if (id === "publish") { TPL.mgr.sheet = { type: "publish" }; TPL.mgr.picks = A.drafts(); }
    if (id === "published" || id === "emp" || id === "empack") pub(dn, "1:55 PM", 7);
    if (id === "started") TPL.mgr.tab = "lunch";
    if (id === "nosec") { TPL.mgr.loc = "up"; D.L["up-dinner"].rows.forEach(function (r) { r.section = ""; }); }
    if (id === "empty") TPL.mgr.tab = "close";
    if (id === "empack") { D.meAcked = true; dn.acked = 8; }
    var m = MOMENTS.filter(function (x) { return x.id === id; })[0];
    C.momentNote = m ? m.note : "";
    renderAll(true);
  }

  /* ---------------- Actions ---------------- */
  var timers = {};
  function toast(key, P, msg, undo) {
    P.toast = { msg: msg, undo: undo || null };
    clearTimeout(timers["t" + key]);
    timers["t" + key] = setTimeout(function () { P.toast = null; renderPhone(key); }, 4500);
  }
  function arm(key, P, what) {
    P.armed = what;
    clearTimeout(timers["a" + key]);
    timers["a" + key] = setTimeout(function () { if (P.armed === what) { P.armed = null; renderPhone(key); } }, 4000);
  }
  function rowOf(P) { return P.sheet && P.sheet.id ? A.find(P.sheet.k, P.sheet.id) : null; }
  function addPerson(key, P, c, job) {
    var l = D.L[P.sheet.k], t = TYPES[l.type];
    var r = R(c.n, job, t.def[0], t.def[1], "", "", { only: c.kind !== "other", sched: null });
    r.id = "n" + (++seq);
    if (c.kind === "available") r.tags = [{ t: "Lineup only", kind: "only" }];
    if (c.kind === "timeoff") r.tags = [{ t: "Day off · lineup only", kind: "warn" }];
    if (c.kind === "other") {
      r.tags = [{ t: "From Uptown", kind: "from" }];
      var src = D.L[c.from]; if (src) src.rows.forEach(function (x) { if (x.name === c.n) { x.off = true; x.moved = LOCS[l.loc].name; r.in = x.in; r.out = x.out; r.sched = { job: x.job, in: x.in, out: x.out }; } });
    }
    if (c.kind === "here") { r.tags = []; }
    l.rows.push(r);
    D.pool = D.pool.filter(function (x) { return x.n !== c.n; });
    P.sheet = null; P.armed = null; P.flash = r.id;
    toast(key, P, c.kind === "other" ? c.n + " moved from Uptown. Uptown can bring " + first(c.n) + " back." : c.n + " added to " + t.name + ". The Schedule doesn't change.", { type: "unadd", k: l.k, id: r.id, c: c });
  }
  function act(name, el, key, e) {
    var P = ui(key), v = vdef(key.split(":")[0]);
    if (name === "noop") { if (e) e.preventDefault(); return; }
    if (v && v.acts && v.acts[name]) { if (v.acts[name](el, P, A, e) !== false) renderPhone(key); return; }
    var ds = el.dataset;
    if (name !== "calloff" && name !== "pick") P.armed = null;
    switch (name) {
      case "tab": P.tab = ds.t; P.seg = "team"; P.scroll = "top"; break;
      case "loc": P.loc = el.value || ds.loc; P.scroll = "top"; break;
      case "seg": P.seg = ds.s; break;
      case "person": if (P.role !== "mgr") return; P.sheet = { type: "person", k: A.cur(P).k, id: ds.id }; break;
      case "add": P.sheet = { type: "add", k: A.cur(P).k, dept: ds.dept || deptOf(ds.job || "server").id }; break;
      case "pick":
        var c = D.pool.filter(function (x) { return x.n === ds.n; })[0]; if (!c) return;
        var cl = candidates(P), job = null; cl.forEach(function (g) { g.items.forEach(function (x) { if (x.c === c) job = x.job; }); });
        if ((c.kind === "other" || c.kind === "timeoff") && P.armed !== "pick-" + c.n) { arm(key, P, "pick-" + c.n); break; }
        addPerson(key, P, c, job || c.jobs[0]); break;
      case "close": P.sheet = null; break;
      case "calloff":
        if (P.armed !== "off") {
          // first tap: only the button changes, the sheet is not redrawn (Mert 2026-10-14)
          P.armed = "off"; el.classList.add("armed"); el.textContent = "Tap again to call off";
          clearTimeout(timers["a" + key]);
          timers["a" + key] = setTimeout(function () { if (P.armed === "off") { P.armed = null; el.classList.remove("armed"); el.textContent = "Call off"; } }, 4000);
          return;
        }
        var r0 = rowOf(P); if (!r0) return; r0.off = true; P.sheet = null; P.armed = null;
        toast(key, P, r0.name + " called off. The Schedule doesn't change.", { type: "restore", k: A.cur(P).k, id: r0.id }); break;
      case "restore":
        var r1 = A.find(A.cur(P).k, ds.id); if (r1) { r1.off = false; toast(key, P, r1.name + " is back on the lineup."); } break;
      case "undo":
        var u = P.toast && P.toast.undo; P.toast = null; if (!u) break;
        if (u.type === "restore") { var r2 = A.find(u.k, u.id); if (r2) r2.off = false; }
        if (u.type === "unadd") { var l2 = D.L[u.k]; l2.rows = l2.rows.filter(function (x) { return x.id !== u.id; }); D.pool.push(u.c); if (u.c.from) D.L[u.c.from].rows.forEach(function (x) { if (x.name === u.c.n) { x.off = false; x.moved = ""; } }); }
        if (u.type === "unpub") { var l3 = D.L[u.k]; l3.status = "published"; }
        break;
      case "field":
        var r3 = rowOf(P); if (!r3) return; var f = ds.f, val = el.value;
        if (f === "in" || f === "out") {
          var t3 = parseTime(val, r3[f]);
          if (!t3) { toast(key, P, "Couldn't read \"" + val + "\". Kept " + fmt(r3[f]) + "."); break; }
          r3[f] = t3;
        } else if (f === "section" && val === "__add") {
          var l4 = D.L[P.sheet.k], nm = "Section " + (A.sections(l4.loc).filter(function (s) { return /^Section \d$/.test(s); }).length + 1);
          D.extraSections[l4.loc].push(nm); r3.section = nm; toast(key, P, nm + " added for " + LOCS[l4.loc].name + ".");
        } else r3[f] = val;
        break;
      case "publish": P.sheet = { type: "publish" }; P.picks = A.drafts(); P.pubDone = null; break;
      case "pub-pick": var i = P.picks.indexOf(ds.k); if (i >= 0) P.picks.splice(i, 1); else P.picks.push(ds.k); break;
      case "pub-ack": D.ackOn = !D.ackOn; break;
      case "pub-go":
        var n = P.picks.length; if (!n) break;
        P.picks.forEach(function (k) { var l5 = D.L[k]; l5.status = "published"; l5.v = (l5.v || 0) + 1; l5.at = "2:10 PM"; l5.by = MANAGER; l5.acked = 0; });
        // Mert 2026-10-14: Publish closes the window; the lineup shows read-only with a toast
        P.pubDone = null; P.sheet = null; P.scroll = "top";
        toast(key, P, n + " lineup" + (n > 1 ? "s" : "") + " published. " + (D.ackOn ? "Staff were asked to acknowledge." : "Staff were notified."));
        P.picks = []; D.meAcked = false; renderAll(); return;
      case "editpub": P.sheet = { type: "editpub", k: ds.k || A.cur(P).k }; break;
      case "unpub-go": var l6 = D.L[P.sheet.k]; l6.status = "draft"; P.sheet = null; toast(key, P, TYPES[l6.type].name + " is back in draft. Staff don't see it until you publish again.", { type: "unpub", k: l6.k }); renderAll(); return;
      case "notes": P.sheet = { type: "notes", k: ds.k || A.cur(P).k }; break;
      case "notes-save":
        var l7 = D.L[P.sheet.k], app = el.closest(".app");
        app.querySelectorAll("[data-note]").forEach(function (t) { l7.notes[t.dataset.note] = t.value.trim(); });
        P.sheet = null; toast(key, P, "Notes saved."); renderAll(); return;
      case "ack":
        var me = A.me(); if (D.meAcked) break; D.meAcked = true; me.l.acked += 1; toast(key, P, "Acknowledged."); renderAll(); return;
      default: return;
    }
    renderAll();
  }

  /* ---------------- Rendering ---------------- */
  var ORIGINAL_MOMENT = { day: "day", end: "day", person: "person", add: "add", calloff: "calloff", notes: "notes", publish: "publish", published: "published", started: "started", nosec: "nosec", empty: "day", emp: "me", empack: "me-ack" };
  function phonesFor() {
    var list = [];
    if (C.compare) { VARIANTS.forEach(function (v) { list.push({ vid: v.id, role: C.view === "emp" ? "emp" : "mgr" }); }); return list; }
    if (C.view !== "emp") list.push({ vid: C.vid, role: "mgr" });
    if (C.view !== "mgr") list.push({ vid: C.vid, role: "emp" });
    return list;
  }
  var stageSig = "";
  function renderStage() {
    var ph = phonesFor(), sig = JSON.stringify(ph);
    if (sig === stageSig) return false;
    stageSig = sig;
    var box = document.getElementById("phones");
    box.innerHTML = ph.map(function (p) {
      var v = vdef(p.vid), key = p.vid + ":" + p.role;
      var cap = C.compare ? "<b>" + esc(v.name) + "</b><span>" + (p.role === "mgr" ? "Müdür" : "Çalışan") + "</span>" : "<b>" + (p.role === "mgr" ? "Müdürün telefonu" : "Çalışanın telefonu") + "</b><span>" + (p.role === "mgr" ? MANAGER + " · Manager, Downtown" : "Hannah Lee · Server") + "</span>";
      return '<div class="mk-phone"><div class="mk-cap">' + cap + '</div><div class="device" data-phone="' + key + '">' + (v.original ? "" : '<div class="app v-' + v.id + '" lang="en"></div>') + "</div></div>";
    }).join("");
    ph.forEach(function (p) { if (vdef(p.vid).original) mountOriginal(p.vid + ":" + p.role); });
    fit();
    return true;
  }
  function mountOriginal(key) {
    var dev = document.querySelector('[data-phone="' + key + '"]');
    var f = document.createElement("iframe");
    f.title = "Original: today's phone mockup";
    f.srcdoc = NF.ORIGINAL_HTML || "<p style='font:14px sans-serif;padding:20px'>Original is missing.</p>";
    f.addEventListener("load", function () { f.dataset.ready = "1"; sendOriginal(key); });
    dev.appendChild(f);
  }
  function sendOriginal(key) {
    var f = document.querySelector('[data-phone="' + key + '"] iframe'); if (!f || !f.dataset.ready) return;
    var role = key.split(":")[1], m = ORIGINAL_MOMENT[C.moment] || "day";
    if (role === "emp" && m !== "me-ack") m = "me";
    if (role === "mgr" && (m === "me" || m === "me-ack")) m = "published";
    f.contentWindow.postMessage({ nfm: m }, "*");
  }
  function renderPhone(key) {
    var dev = document.querySelector('[data-phone="' + key + '"]'); if (!dev) return;
    var v = vdef(key.split(":")[0]);
    if (v.original) { if (dev.dataset.m !== C.moment) { dev.dataset.m = C.moment; sendOriginal(key); } return; }
    var app = dev.querySelector(".app"), P = ui(key);
    var sc = app.querySelector(".scroll"), top = sc ? sc.scrollTop : 0;
    var sb = app.querySelector(".sheet-b"), stop = sb ? sb.scrollTop : 0, hadSheet = sb ? P.sheet && JSON.stringify(P.sheet) : null;
    var html;
    try { html = v.render(P, A); } catch (err) { html = '<pre style="white-space:pre-wrap;padding:16px;color:#a43830;font-size:12px">' + esc(err && err.stack || err) + "</pre>"; console.error(err); }
    if (P.sheet) { var s = v.sheet ? v.sheet(P, A) : null; html += s == null ? defaultSheet(P) : s; }
    html += v.toast ? v.toast(P, A) : A.toastHtml(P);
    app.innerHTML = html;
    sc = app.querySelector(".scroll");
    if (sc) {
      if (P.scroll === "end") sc.scrollTop = sc.scrollHeight;
      else if (P.scroll === "top") sc.scrollTop = 0;
      else if (P.scroll && P.scroll.charAt(0) === "#") { var t = app.querySelector(P.scroll); if (t) sc.scrollTop = t.offsetTop - 140; }
      else sc.scrollTop = top;
      P.scroll = null;
    }
    sb = app.querySelector(".sheet-b"); if (sb && hadSheet && hadSheet === JSON.stringify(P.sheet)) sb.scrollTop = stop;
    if (P.flash) { var fl = app.querySelector('[data-id="' + P.flash + '"]'); if (fl && sc) { var y = fl.getBoundingClientRect().top - sc.getBoundingClientRect().top; if (y < 80 || y > sc.clientHeight - 120) sc.scrollTop += y - sc.clientHeight / 2; fl.classList.add("is-new"); } P.flash = null; }
    if (v.after) v.after(app, P, A);
  }
  function renderSide() {
    var v = vdef(C.vid);
    document.getElementById("vars").innerHTML = VARIANTS.map(function (x) {
      return '<button type="button" class="mk-var" aria-pressed="' + (!C.compare && C.vid === x.id) + '" data-mk="var" data-v="' + x.id + '"><b>' + esc(x.name) + "</b><span>" + esc(x.sub) + "</span></button>";
    }).join("");
    document.getElementById("views").innerHTML = [["both", "Müdür + Çalışan"], ["mgr", "Müdür"], ["emp", "Çalışan"]].map(function (x) {
      return '<button type="button" aria-pressed="' + (C.view === x[0]) + '" data-mk="view" data-w="' + x[0] + '">' + x[1] + "</button>";
    }).join("");
    document.getElementById("compare").setAttribute("aria-pressed", String(C.compare));
    document.getElementById("moments").innerHTML = MOMENTS.map(function (m) { return '<li><button type="button" aria-pressed="' + (C.moment === m.id) + '" data-mk="moment" data-m="' + m.id + '">' + esc(m.t) + "</button></li>"; }).join("");
    document.getElementById("phonebar").innerHTML = VARIANTS.map(function (x) { return '<button type="button" aria-pressed="' + (C.vid === x.id) + '" data-mk="var" data-v="' + x.id + '">' + esc(x.name.split(" · ")[0]) + "</button>"; }).join("") + "<i></i>" +
      [["mgr", "Müdür"], ["emp", "Çalışan"]].map(function (x) { return '<button type="button" aria-pressed="' + (C.view === x[0]) + '" data-mk="view" data-w="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "<i></i>" +
      MOMENTS.map(function (m, i) { return '<button type="button" aria-pressed="' + (C.moment === m.id) + '" data-mk="moment" data-m="' + m.id + '">' + (i + 1) + ". " + esc(m.t) + "</button>"; }).join("");
    document.getElementById("note").innerHTML = "<b>" + esc(C.compare ? "Hepsi yan yana" : v.name) + ".</b> " + esc(C.momentNote || "") + (v.original && !C.compare ? " Original, bugünkü telefon taslağının kendisi (Vardiya sekmeleri, satır düzeni 1)." : "");
  }
  function renderAll(force) {
    if (!vdef(C.vid)) C.vid = VARIANTS[VARIANTS.length > 1 ? 1 : 0].id;
    if (force) stageSig = "";
    renderSide(); renderStage();
    phonesFor().forEach(function (p) { renderPhone(p.vid + ":" + p.role); });
  }
  function fit() {
    var box = document.getElementById("phones"); if (!box || window.innerWidth <= 520) return;
    var n = box.children.length, avail = box.parentElement.clientWidth, need = n * 410 + (n - 1) * 28;
    var z = Math.min(1, avail / need, (window.innerHeight - 90) / 900);
    if (n === 1) z = Math.min(1, (window.innerHeight - 90) / 900);
    box.querySelectorAll(".device").forEach(function (d) { d.style.zoom = Math.max(0.5, z); });
  }

  /* ---------------- Events ---------------- */
  function phoneKey(el) { var d = el.closest("[data-phone]"); return d ? d.dataset.phone : null; }
  document.addEventListener("click", function (e) {
    var mk = e.target.closest("[data-mk]");
    if (mk) {
      var a = mk.dataset.mk;
      if (a === "var") { C.vid = mk.dataset.v; C.compare = false; save(); moment(C.moment); }
      if (a === "view") { C.view = mk.dataset.w; save(); renderAll(); }
      if (a === "compare") { C.compare = !C.compare; renderAll(); }
      if (a === "moment") moment(mk.dataset.m);
      if (a === "reset") moment("day");
      return;
    }
    var b = e.target.closest("[data-act]"); if (!b) return;
    if (b.tagName === "SELECT" || (b.tagName === "INPUT" && b.type !== "checkbox")) return;
    var key = phoneKey(b); if (!key) return;
    if (b.tagName === "A") e.preventDefault();
    act(b.dataset.act, b, key, e);
  });
  document.addEventListener("change", function (e) {
    var b = e.target.closest("[data-act]"); if (!b || (b.tagName !== "SELECT" && b.tagName !== "INPUT") || b.type === "checkbox") return;
    var key = phoneKey(b); if (key) act(b.dataset.act, b, key, e);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { var k = phoneKey(document.activeElement || document.body); var keys = k ? [k] : Object.keys(UI); keys.forEach(function (x) { if (UI[x] && UI[x].sheet) { UI[x].sheet = null; renderPhone(x); } }); }
    if (e.key === "Enter" && e.target.matches && e.target.matches("input.input[data-act]")) e.target.blur();
  });
  window.addEventListener("resize", fit);

  NF.start = function () { NF.MOMENTS = MOMENTS; moment(C.moment); };
  NF.debug = { C: C, UI: function () { return UI; }, moment: moment, renderAll: renderAll, setView: function (v) { C.view = v; renderAll(); }, setVariant: function (id) { C.vid = id; C.compare = false; moment(C.moment); }, setCompare: function (on) { C.compare = on; renderAll(); } };
})();
