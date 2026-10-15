/* Notification variants. Real shell markup and CSS come from the PAGES build of main 28aeb82b;
   everything inside .nf-* is the proposal. Route: #v=<screen>&f=desktop|phone&r=owner|manager|employee */
(function () {
  var P = {};
  location.hash.replace(/^#/, "").split("&").forEach(function (kv) { var a = kv.split("="); if (a[0]) P[a[0]] = decodeURIComponent(a[1] || ""); });
  var V = P.v || "inbox-A", F = P.f || "desktop", R = P.r || (F === "phone" ? "employee" : "manager");
  var root = document.getElementById("root");
  var phone = F === "phone";

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var ALIAS = { "clipboard-check": "clipboard-list", "repeat-2": "arrow-left-right", plane: "calendar-off", "circle-dot": "circle-dashed", "bell-off": "bell", "bell-ring": "bell", "monitor-smartphone": "smartphone" };
  ICONS.smartphone = '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>';
  ICONS.share = '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>';
  ICONS.inbox = '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>';
  function icon(name, size) { var n = size || 18, body = ICONS[ALIAS[name] || name] || ICONS.info;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + n + '" height="' + n + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="nf-svg">' + body + "</svg>"; }
  function paint() {}
  function toast(msg) {
    var t = document.createElement("div"); t.className = "nf-toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
  }
  function tell(msg) { try { parent.postMessage({ nfmock: 1, msg: msg }, "*"); } catch (e) {} }

  /* ---------- sample data ---------- */
  var CAT = {
    approvals: { label: "Approvals", icon: "clipboard-check", tone: "amber" },
    schedule: { label: "Schedule", icon: "calendar-days", tone: "green" },
    shifts: { label: "Shift changes", icon: "repeat-2", tone: "green" },
    timeoff: { label: "Time off", icon: "plane", tone: "red" },
    people: { label: "People", icon: "users", tone: "blue" },
    docs: { label: "Documents", icon: "file-text", tone: "blue" },
    avail: { label: "Availability", icon: "calendar-check", tone: "orange" },
    news: { label: "Announcements", icon: "megaphone", tone: "slate" },
    account: { label: "Account", icon: "shield-check", tone: "slate" }
  };
  var MANAGER_ITEMS = [
    { id: 1, cat: "approvals", action: true, unread: true, when: "12 min", group: "Today",
      title: "Shift change needs your approval", body: "Jake Thompson wants Maria Lopez's Fri, Oct 16 · 4p–10p · Server, Downtown.", cta: "Review", target: "Requests → Shift changes" },
    { id: 2, cat: "approvals", action: true, unread: true, when: "1 h", group: "Today",
      title: "Time off request from Tom Becker", body: "Wed, Oct 21 · Jury duty summons. Decide by Sun, Oct 18.", cta: "Review", target: "Requests → Time off" },
    { id: 3, cat: "approvals", action: true, unread: false, when: "3 h", group: "Today",
      title: "Onboarding ready for review", body: "Luis Hernandez finished onboarding · Downtown.", cta: "Review", target: "Employees → Luis Hernandez" },
    { id: 4, cat: "docs", unread: true, when: "Yesterday", group: "Yesterday",
      title: "Food handler card expires in 14 days", body: "Luis Hernandez · expires Oct 28.", target: "Employees → Documents" },
    { id: 5, cat: "avail", unread: true, when: "Yesterday", group: "Yesterday",
      title: "Sophie Martin updated availability", body: "No longer available on Sundays, starting Oct 25.", target: "Availability" },
    { id: 6, cat: "approvals", resolved: "Approved by Rachel Adams · 2 shifts open", unread: false, when: "Mon", group: "Earlier",
      title: "Time off request from Ethan Brooks", body: "Oct 20–22 · Family emergency.", target: "Requests → Time off" },
    { id: 7, cat: "news", unread: false, when: "Mon", group: "Earlier",
      title: "Walk-in cooler repair on Tuesday", body: "The technician arrives at 7 AM. Keep the walk-in door closed.", target: "Announcements" }
  ];
  var EMPLOYEE_ITEMS = [
    { id: 11, cat: "shifts", action: true, unread: true, when: "8 min", group: "Today", quick: ["Accept", "Decline"],
      title: "Jake asked you to cover", body: "Sat, Oct 17 · 5p–11p · Server, Downtown. “Family dinner, thank you!”", target: "Requests" },
    { id: 12, cat: "docs", action: true, unread: true, when: "2 h", group: "Today", cta: "Sign",
      title: "Sign the updated tip policy", body: "Due Tue, Oct 20.", target: "Account → Documents" },
    { id: 13, cat: "schedule", unread: true, when: "5 h", group: "Today",
      title: "Your Tue shift moved to 4p–10p", body: "Tue, Oct 20 · was 5p–11p · Server, Downtown.", target: "Schedule" },
    { id: 14, cat: "schedule", unread: false, when: "Yesterday", group: "Yesterday",
      title: "Your schedule for Oct 19–25 is out", body: "4 shifts · 26 hours.", target: "Schedule" },
    { id: 15, cat: "timeoff", unread: false, when: "Mon", group: "Earlier",
      title: "Time off approved · Fri, Oct 30", body: "Approved by Rachel Adams.", target: "Requests → Time off" },
    { id: 16, cat: "news", unread: false, when: "Mon", group: "Earlier",
      title: "Walk-in cooler repair on Tuesday", body: "The technician arrives at 7 AM. Keep the walk-in door closed.", target: "Announcements" }
  ];
  var items = JSON.parse(JSON.stringify(R === "employee" ? EMPLOYEE_ITEMS : MANAGER_ITEMS));
  function unread() { return items.filter(function (i) { return i.unread && !i.archived; }).length; }
  function unseen() { return items.filter(function (i) { return i.unread && !i.archived && !i.seen; }).length; }
  function seeAll() { items.forEach(function (i) { i.seen = true; }); }
  function open() { return items.filter(function (i) { return i.action && !i.resolved && !i.archived; }).length; }

  /* ---------- shell pieces ---------- */
  function sidebarHTML(activeHref, notifMode) {
    var s = R === "employee" ? FRAG.empSidebar : FRAG.sidebar;
    s = s.replace(/ active"/g, '"').replace(/ aria-current="page"/g, "");
    if (activeHref) s = s.replace('class="nav-item" href="' + activeHref + '"', 'class="nav-item active" aria-current="page" href="' + activeHref + '"');
    // Notifications row: count from this mock, and a button when it opens the panel.
    s = s.replace(/<span class="nav-unread"[^>]*>\d+<\/span>/, "");
    s = s.replace(/(<a[^>]*href="\/app\/notifications"[^>]*>[\s\S]*?<span>Notifications<\/span>)/, function (m) {
      var count = unread() ? '<span class="nav-unread" data-count>' + unread() + "</span>" : "";
      if (notifMode === "hidden") return "";
      if (notifMode === "panel") m = m.replace("<a", '<a data-open-panel role="button" aria-haspopup="dialog"');
      return m + count;
    });
    if (notifMode === "hidden") s = s.replace(/<div class="sidebar-nav-entry"><\/a><\/div>/, "");
    return s;
  }
  function deskShell(main, opts) {
    opts = opts || {};
    return '<div class="app-shell">' + sidebarHTML(opts.active, opts.notif) + '<main class="app-main">' + main + "</main></div>";
  }
  function phoneShell(main, active) {
    var nav = FRAG.phoneNav.replace(/class="active"/g, 'class=""');
    if (active) nav = nav.replace('class="" href="' + active + '"', 'class="active" href="' + active + '"');
    return '<div class="app-shell" data-employee-shell="true"><main class="app-main">' + main + "</main>" + nav + "</div>";
  }
  function homePhone() {
    var m = FRAG.homeMain.replace(/^<main class="app-main">/, "").replace(/<\/main>$/, "");
    return m.replace(/<a class="eh-icon-button eh-bell"[^>]*>([\s\S]*?)<\/a>/, function (all, inner) {
      var n = unseen();
      return '<button type="button" class="eh-icon-button eh-bell" data-open-sheet aria-label="Notifications, ' + n + ' unread">' + inner.replace(/<span>\d+<\/span>/, n ? "<span>" + n + "</span>" : "") + "</button>";
    });
  }
  function wsMain() { return FRAG.wsMain.replace(/^<main class="app-main">/, "").replace(/<\/main>$/, ""); }
  function homeDesk() { return FRAG.homeMainDesk.replace(/^<main class="app-main">/, "").replace(/<\/main>$/, ""); }

  /* ---------- the list ---------- */
  function row(i, wide) {
    var c = CAT[i.cat];
    var cls = "nf-row" + (i.unread ? " is-unread" : "") + (i.resolved ? " is-resolved" : "") + (wide ? " is-wide" : "");
    var actions = "";
    if (i.quick && !i.done) actions = '<div class="nf-row-actions">' + i.quick.map(function (q, k) {
      return '<button type="button" class="' + (k === 0 ? "nf-btn nf-btn-green" : "nf-btn") + '" data-quick="' + i.id + '" data-label="' + q + '">' + q + "</button>"; }).join("") + "</div>";
    else if (i.cta && !i.resolved) actions = '<div class="nf-row-actions"><button type="button" class="nf-btn" data-go="' + i.id + '">' + i.cta + "</button></div>";
    var done = i.done ? '<span class="nf-chip nf-chip-done">' + icon("check", 13) + i.done + "</span>" : "";
    var res = i.resolved ? '<span class="nf-chip">' + icon("check", 13) + esc(i.resolved) + "</span>" : "";
    return '<li class="' + cls + '" data-id="' + i.id + '">' +
      '<span class="nf-dot" aria-hidden="true"></span>' +
      '<span class="nf-tile nf-' + c.tone + '" aria-hidden="true">' + icon(c.icon, 16) + "</span>" +
      '<div class="nf-row-text"><button type="button" class="nf-row-title" data-go="' + i.id + '">' + esc(i.title) + "</button>" +
      '<p class="nf-row-body">' + esc(i.body) + "</p>" +
      '<p class="nf-row-meta">' + (i.action && !i.resolved ? '<span class="nf-need">Needs action</span> · ' : "") + c.label + " · " + i.when + "</p>" + res + done + actions + "</div>" +
      '<div class="nf-row-tools"><button type="button" class="nf-icon" data-toggle-read="' + i.id + '" aria-label="' + (i.unread ? "Mark as read" : "Mark as unread") + '" title="' + (i.unread ? "Mark as read" : "Mark as unread") + '">' + icon(i.unread ? "circle-check" : "circle-dot", 16) + "</button>" +
      (i.action && !i.resolved ? "" : '<button type="button" class="nf-icon" data-archive="' + i.id + '" aria-label="Archive" title="Archive">' + icon("archive", 16) + "</button>") + "</div></li>";
  }
  function list(tab, wide) {
    var rows = items.filter(function (i) { return !i.archived && (tab !== "action" || (i.action && !i.resolved)) && (tab !== "unread" || i.unread); });
    if (!rows.length) return '<div class="nf-empty">' + icon("bell-off", 22) + "<strong>" + (tab === "action" ? "Nothing needs you right now" : "You're all caught up") + "</strong><span>New updates will show up here.</span></div>";
    var out = "", g = "";
    rows.forEach(function (i) { if (i.group !== g) { g = i.group; out += '<li class="nf-group">' + g + "</li>"; } out += row(i, wide); });
    return '<ul class="nf-list">' + out + "</ul>";
  }
  function tabs(tab) {
    return '<div class="nf-tabs" role="tablist">' +
      '<button role="tab" type="button" data-tab="all" aria-selected="' + (tab === "all") + '">All</button>' +
      '<button role="tab" type="button" data-tab="action" aria-selected="' + (tab === "action") + '">Needs action' + (open() ? ' <span class="nf-count">' + open() + "</span>" : "") + "</button>" +
      '<button role="tab" type="button" data-tab="unread" aria-selected="' + (tab === "unread") + '">Unread' + (unread() ? ' <span class="nf-count is-muted">' + unread() + "</span>" : "") + "</button></div>";
  }
  function panelHead(title, closeable) {
    return '<div class="nf-panel-head"><h2>' + title + "</h2><div class=\"nf-panel-tools\">" +
      '<button type="button" class="nf-link" data-read-all>Mark all as read</button>' +
      '<button type="button" class="nf-icon" data-prefs aria-label="Notification settings" title="Notification settings">' + icon("settings-2", 17) + "</button>" +
      (closeable ? '<button type="button" class="nf-icon" data-close aria-label="Close">' + icon("x", 18) + "</button>" : "") + "</div></div>";
  }

  /* ---------- state + render ---------- */
  var S = { tab: "all", panel: false, page: false, sheet: false, detail: null, bell: false };
  function render() {
    var html = SCREENS[V] ? SCREENS[V]() : "<p>Unknown variant</p>";
    root.innerHTML = html;
    paint();
    var focus = root.querySelector("[data-autofocus]"); if (focus) focus.focus();
  }

  var SCREENS = {
    /* A · panel from the left menu + See all page */
    "inbox-A": function () {
      if (phone) return phoneShell(homePhone() + (S.sheet ? sheet() : ""), "/app/employee-hub");
      if (S.page) return deskShell(fullPage(), { active: "/app/notifications", notif: "panel" });
      var main = R === "employee" ? homeDesk() : wsMain();
      return deskShell(main, { active: R === "employee" ? "/app/employee-hub" : "/app/workspace", notif: "panel" }) +
        (S.panel ? '<div class="nf-scrim" data-close></div><section class="nf-panel" role="dialog" aria-label="Notifications" tabindex="-1" data-autofocus>' + panelHead("Notifications", true) + tabs(S.tab) + '<div class="nf-panel-body">' + list(S.tab) + '</div><div class="nf-panel-foot"><button type="button" class="nf-link" data-see-all>See all notifications ' + icon("arrow-right", 15) + "</button></div></section>" : "");
    },
    /* B · one page, list + detail */
    "inbox-B": function () {
      if (phone) return phoneShell(S.detail ? phoneDetail() : phonePage(), "/app/employee-hub/more");
      return deskShell(twoPane(), { active: "/app/notifications", notif: "page" });
    },
    /* C · top bar with a bell on every page */
    "inbox-C": function () {
      if (phone) return phoneShell(homePhone() + (S.sheet ? sheet() : ""), "/app/employee-hub");
      var main = R === "employee" ? homeDesk() : wsMain();
      var bar = '<div class="nf-topbar"><span class="nf-topbar-title">' + (R === "employee" ? "Home" : "Workspace") + '</span><div class="nf-topbar-tools"><button type="button" class="nf-icon nf-bell" data-bell aria-haspopup="dialog" aria-expanded="' + S.bell + '" aria-label="Notifications, ' + unread() + ' unread">' + icon("bell", 19) + (unseen() ? '<span class="nf-bell-count">' + unseen() + "</span>" : "") + "</button></div>" +
        (S.bell ? '<section class="nf-pop" role="dialog" aria-label="Notifications" tabindex="-1" data-autofocus>' + panelHead("Notifications", false) + tabs(S.tab) + '<div class="nf-panel-body">' + list(S.tab) + '</div><div class="nf-panel-foot"><button type="button" class="nf-link" data-see-all-c>See all notifications ' + icon("arrow-right", 15) + "</button></div></section>" : "") + "</div>";
      return deskShell(bar + main, { active: R === "employee" ? "/app/employee-hub" : "/app/workspace", notif: "hidden" });
    },
    "me-A": function () { return accountShell(prefsA()); },
    "me-B": function () { return accountShell(prefsB()); },
    "org-A": function () { return settingsShell(orgA(), "notifications"); },
    "org-B": function () { return settingsShell(orgB(), "general"); },
    "org-C": function () { return settingsShell(orgC(), "notifications"); },
    "push-A": function () { return phone ? phoneShell(homePhone() + pushCard() + (S.sheet ? sheet() : "") + pushFlow(), "/app/employee-hub") : deskShell(wsMain() + pushCard(true) + pushFlow(), { active: "/app/workspace", notif: "panel" }); },
    "push-B": function () { return accountShell(prefsA()); }
  };

  function fullPage() {
    return '<section class="nf-page"><header class="catalog-page-header"><div class="catalog-page-heading"><span class="catalog-page-eyebrow">UPDATES. ALERTS. ACTIONS.</span><h1>Notifications<span aria-hidden="true" class="catalog-page-title-dot"></span></h1><p>Everything sent to you in Harbor &amp; Vine, newest first. Kept for 90 days.</p></div>' +
      '<div class="catalog-page-actions"><button type="button" class="nf-btn nf-btn-lg" data-read-all>Mark all as read</button><button type="button" class="nf-btn nf-btn-lg" data-prefs>' + icon("settings-2", 16) + " Settings</button></div></header>" +
      '<div class="nf-page-bar">' + tabs(S.tab) + '<label class="nf-filter">Category <select><option>All categories</option><option>Approvals</option><option>Schedule</option><option>Documents</option><option>Announcements</option></select></label></div>' +
      '<div class="nf-page-list">' + list(S.tab, true) + "</div></section>";
  }
  function twoPane() {
    var cur = items.filter(function (i) { return i.id === S.detail; })[0] || items[0];
    if (cur.unread) { cur.unread = false; }
    var c = CAT[cur.cat];
    return '<section class="nf-two"><div class="nf-two-list">' + panelHead("Notifications", false) + tabs(S.tab) + '<div class="nf-panel-body">' + list(S.tab).replace('data-id="' + cur.id + '"', 'data-id="' + cur.id + '" aria-current="true"') + "</div></div>" +
      '<article class="nf-two-detail"><span class="nf-tile nf-' + c.tone + ' is-big">' + icon(c.icon, 22) + "</span><p class=\"nf-row-meta\">" + c.label + " · " + cur.when + "</p><h2>" + esc(cur.title) + "</h2><p>" + esc(cur.body) + "</p>" +
      (cur.resolved ? '<span class="nf-chip">' + icon("check", 13) + esc(cur.resolved) + "</span>" : "") +
      '<div class="nf-two-actions">' + (cur.quick ? cur.quick.map(function (q, k) { return '<button type="button" class="' + (k ? "nf-btn nf-btn-lg" : "nf-btn nf-btn-green nf-btn-lg") + '" data-quick="' + cur.id + '" data-label="' + q + '">' + q + "</button>"; }).join("") : "") +
      '<button type="button" class="nf-btn nf-btn-lg" data-go="' + cur.id + '">Open in ' + esc(cur.target) + "</button></div></article></section>";
  }
  function sheet() {
    return '<section class="nf-sheet" role="dialog" aria-label="Notifications" tabindex="-1" data-autofocus><div class="nf-sheet-head"><button type="button" class="nf-icon" data-close aria-label="Back">' + icon("arrow-left", 20) + "</button><h2>Notifications</h2>" +
      '<button type="button" class="nf-icon" data-prefs aria-label="Notification settings">' + icon("settings-2", 19) + "</button></div>" + tabs(S.tab) + '<div class="nf-sheet-body">' + list(S.tab) + '<button type="button" class="nf-link nf-sheet-readall" data-read-all>Mark all as read</button></div></section>';
  }
  function phonePage() {
    return '<section class="nf-phone-page"><header class="catalog-page-header"><div class="catalog-page-heading"><span class="catalog-page-eyebrow">UPDATES. ALERTS. ACTIONS.</span><h1>Notifications<span aria-hidden="true" class="catalog-page-title-dot"></span></h1></div></header>' + tabs(S.tab) + list(S.tab) + "</section>";
  }
  function phoneDetail() {
    var cur = items.filter(function (i) { return i.id === S.detail; })[0]; var c = CAT[cur.cat];
    return '<section class="nf-phone-page"><button type="button" class="nf-link" data-back>' + icon("arrow-left", 16) + ' Notifications</button><article class="nf-two-detail is-phone"><span class="nf-tile nf-' + c.tone + ' is-big">' + icon(c.icon, 22) + "</span><p class=\"nf-row-meta\">" + c.label + " · " + cur.when + "</p><h2>" + esc(cur.title) + "</h2><p>" + esc(cur.body) + '</p><div class="nf-two-actions">' +
      (cur.quick ? cur.quick.map(function (q, k) { return '<button type="button" class="' + (k ? "nf-btn nf-btn-lg" : "nf-btn nf-btn-green nf-btn-lg") + '" data-quick="' + cur.id + '" data-label="' + q + '">' + q + "</button>"; }).join("") : "") +
      '<button type="button" class="nf-btn nf-btn-lg" data-go="' + cur.id + '">Open in ' + esc(cur.target) + "</button></div></article></section>";
  }

  /* ---------- Account → Notifications ---------- */
  var me = { email: true, push: false, text: false };
  var EMP_CATS = [
    { k: "schedule", t: "My schedule", d: "A new week is out, or one of your shifts is added, moved or removed.", e: true, p: true },
    { k: "shifts", t: "Shift changes", d: "Someone asks you to cover or swap, and the answers to your own asks.", e: true, p: true },
    { k: "open", t: "Open shifts", d: "A teammate releases a shift you can pick up.", e: false, p: true, opt: true },
    { k: "timeoff", t: "Time off", d: "Decisions on your time off.", e: true, p: true },
    { k: "docs", t: "Documents and onboarding", d: "Documents to sign or upload, due dates, review results.", e: true, p: false },
    { k: "news", t: "Announcements", d: "Posts and important dates for your location.", e: false, p: true },
    { k: "reminders", t: "Shift reminders", d: "Two hours before each shift. Phone alerts only.", e: null, p: false, opt: true, off: true }
  ];
  var MGR_CATS = [
    { k: "approvals", t: "Approvals", d: "Time off, shift changes, onboarding, documents and names waiting for your decision.", e: true, p: true },
    { k: "attention", t: "Needs attention", d: "Shifts left without anyone and documents about to expire.", e: true, p: false },
    { k: "team", t: "Team updates", d: "Availability changes and new members joining.", e: false, p: false, opt: true },
    { k: "schedule", t: "My schedule", d: "Your own shifts: a new week, or a shift added, moved or removed.", e: true, p: true },
    { k: "timeoff", t: "My requests", d: "Decisions on your own time off and shift changes.", e: true, p: true },
    { k: "news", t: "Announcements", d: "Posts and important dates for your locations.", e: false, p: true }
  ];
  var cats = JSON.parse(JSON.stringify(R === "employee" ? EMP_CATS : MGR_CATS));
  var dirty = false;
  function accountShell(main) {
    var side = FRAG.acctSidebar;
    if (R !== "employee") side = side.replace(/>ML</, ">RA<").replace("Maria Lopez", "Rachel Adams");
    return '<div class="account-shell"><div class="account-layout-grid">' + side + '<main class="account-content-scroll"><div class="account-main"><section class="account-page nf-prefs">' + main + "</section></div></main></div></div>";
  }
  function chk(on, attrs, label, disabled) {
    return '<label class="nf-check' + (disabled ? " is-disabled" : "") + '"><input type="checkbox"' + (on ? " checked" : "") + (disabled ? " disabled" : "") + " " + attrs + ' aria-label="' + esc(label) + '"><span aria-hidden="true">' + icon("check", 13) + "</span></label>";
  }
  function sw(on, attrs, label, disabled) {
    return '<button type="button" role="switch" class="nf-switch" aria-checked="' + !!on + '"' + (disabled ? " disabled" : "") + " " + attrs + ' aria-label="' + esc(label) + '"><span></span></button>';
  }
  function wsPicker() {
    return '<label class="nf-filter">Workspace <select><option>Harbor &amp; Vine</option><option>Pier 9 Kitchen</option></select></label>';
  }
  function prefsA() {
    var head = '<header class="account-page-header"><div><h1>Notifications</h1><p>Choose where Harbor &amp; Vine reaches you. Everything always shows in your Notifications list.</p></div>' + wsPicker() + "</header>";
    var where = '<h2 class="nf-h2">Where you get notified</h2><div class="nf-card nf-channels">' +
      chan("inbox", "In the app", "Always on. Every notification lands in your list.", '<span class="nf-lock">' + icon("lock", 13) + " Always on</span>") +
      chan("mail", "Email", (R === "employee" ? "maria.lopez@example.com" : "rachel.adams@example.com"), sw(me.email, 'data-me="email"', "Email")) +
      chan("smartphone", "Phone alerts", me.push ? "On for this phone · iPhone, Safari app on Home Screen" : "Off on this device. Alerts pop up even when the app is closed.",
        me.push ? sw(true, 'data-me="push"', "Phone alerts") : '<button type="button" class="nf-btn nf-btn-green" data-push-on>Turn on</button>') +
      chan("message-square", "Text messages", "Not available yet. Harbor &amp; Vine hasn't turned text messages on.", '<span class="nf-lock is-muted">Not available</span>') + "</div>";
    var rows = cats.map(function (c) {
      var off = c.off;
      return '<div class="nf-mrow" role="row"><div class="nf-mrow-text" role="rowheader"><strong>' + c.t + (c.opt ? ' <span class="nf-tag">Optional</span>' : "") + "</strong><span>" + c.d + "</span></div>" +
        '<div role="cell">' + (c.e === null ? '<span class="nf-na">—</span>' : chk(c.e, 'data-cat="' + c.k + '" data-ch="e"', c.t + " email", !me.email)) + "</div>" +
        '<div role="cell">' + chk(c.p, 'data-cat="' + c.k + '" data-ch="p"', c.t + " phone alerts", !me.push && false) + "</div>" +
        '<div role="cell">' + chk(false, "", c.t + " text", true) + "</div></div>";
    }).join("");
    var matrix = '<h2 class="nf-h2">What reaches you</h2><div class="nf-card nf-matrix" role="table" aria-label="What reaches you"><div class="nf-mrow nf-mhead" role="row"><span role="columnheader">Notification</span><span role="columnheader">Email</span><span role="columnheader">Phone</span><span role="columnheader">Text</span></div>' + rows +
      '<div class="nf-mrow is-locked" role="row"><div class="nf-mrow-text" role="rowheader"><strong>Account and security <span class="nf-tag is-lock">' + icon("lock", 11) + " Required</span></strong><span>Password and email changes, sign-in links, account deletion. Always by email.</span></div><div role=\"cell\">" + chk(true, "", "Account email", true) + '</div><div role="cell">' + chk(false, "", "Account phone", true) + '</div><div role="cell">' + chk(false, "", "Account text", true) + "</div></div></div>";
    var note = '<p class="nf-note">' + icon("info", 15) + "Something your workspace switched off doesn't show here. Approvals and changes to your own shifts can't be switched off in the app; you only choose the extra ways they reach you.</p>";
    var save = '<div class="nf-save"><button type="button" class="nf-btn nf-btn-green nf-btn-lg" data-save' + (dirty ? "" : " disabled") + ">Save</button></div>";
    return head + where + matrix + note + save;
  }
  function chan(ic, t, d, ctl) { return '<div class="nf-chan"><span class="nf-tile nf-slate">' + icon(ic, 17) + '</span><div><strong>' + t + "</strong><span>" + d + "</span></div><div class=\"nf-chan-ctl\">" + ctl + "</div></div>"; }
  var lv = { email: "important", push: "all" };
  function prefsB() {
    function seg(k) { return '<div class="nf-seg" role="radiogroup">' + [["all", "Everything"], ["important", "Only important"], ["off", "Off"]].map(function (o) { return '<button type="button" role="radio" aria-checked="' + (lv[k] === o[0]) + '" data-lv="' + k + '" data-val="' + o[0] + '">' + o[1] + "</button>"; }).join("") + "</div>"; }
    return '<header class="account-page-header"><div><h1>Notifications</h1><p>Everything shows in your Notifications list. Choose what else reaches you.</p></div>' + wsPicker() + "</header>" +
      '<div class="nf-card nf-channels">' +
      chan("mail", "Email", "maria.lopez@example.com", seg("email")) +
      chan("smartphone", "Phone alerts", me.push ? "On for this phone" : "Off on this device", me.push ? seg("push") : '<button type="button" class="nf-btn nf-btn-green" data-push-on>Turn on</button>') +
      chan("message-square", "Text messages", "Not available yet.", '<span class="nf-lock is-muted">Not available</span>') + "</div>" +
      '<div class="nf-card nf-explain"><strong>“Only important” means</strong><ul><li>Someone needs your answer (cover, swap, documents to sign).</li><li>One of your shifts was added, moved or removed.</li><li>A decision on your own request.</li><li>Account and security, which always come by email.</li></ul></div>' +
      '<div class="nf-save"><button type="button" class="nf-btn nf-btn-green nf-btn-lg" data-save' + (dirty ? "" : " disabled") + ">Save</button></div>";
  }

  /* ---------- Settings → Notifications ---------- */
  var org = { email: true, push: true, text: false, open: true, avail: true, joined: true, remind: false, unpub: false, digest: false };
  function settingsShell(main, which) {
    var rail = FRAG.settingsRail.replace(/ active"/g, '"').replace(/ aria-current="page"/g, "");
    if (which === "general") {
      rail = rail.replace(/<a class="settings-nav-item" href="\/app\/settings\/notifications"[\s\S]*?<\/a>/, "");
      rail = rail.replace('class="settings-nav-item" href="/app/settings/general"', 'class="settings-nav-item active" aria-current="page" href="/app/settings/general"');
    } else rail = rail.replace('class="settings-nav-item" href="/app/settings/notifications"', 'class="settings-nav-item active" aria-current="page" href="/app/settings/notifications"');
    return '<div class="app-shell">' + sidebarHTML(null, "panel").replace(/class="nav-item" (href="\/app\/settings")/, 'class="nav-item active" $1') + '<main class="app-main"><div class="organization-settings">' + rail + '<div class="nf-settings-main">' + main + "</div></div></main></div>";
  }
  function setHead(t, p) { return '<header class="nf-set-head"><span class="nf-set-icon">' + icon("bell", 20) + "</span><div><h1>" + t + "</h1><p>" + p + "</p></div></header>"; }
  function orow(k, t, who, extra) {
    return '<div class="nf-orow"><div><strong>' + t + "</strong><span>" + who + "</span>" + (extra || "") + "</div>" + sw(org[k], 'data-org="' + k + '"', t) + "</div>";
  }
  function orgA() {
    return setHead("Notifications", "Choose how Harbor &amp; Vine reaches its people. Each person can turn off the extra ways for themselves.") +
      '<h2 class="nf-h2">Channels</h2><div class="nf-card">' +
      '<div class="nf-orow"><div><strong>In the app</strong><span>Every notification lands in each person\'s Notifications list.</span></div><span class="nf-lock">' + icon("lock", 13) + " Always on</span></div>" +
      orow("email", "Email", "Sent from notifications@newfork.app. People choose which ones they get.") +
      orow("push", "Phone alerts", "Pop-up alerts on phones and computers. Each person turns them on for their own device.") +
      '<div class="nf-orow is-off"><div><strong>Text messages <span class="nf-tag">Paid</span></strong><span>Needs a text message service. Ready in the app, not switched on.</span></div>' + sw(false, "", "Text messages", true) + "</div></div>" +
      '<h2 class="nf-h2">Optional notifications</h2><div class="nf-card">' +
      orow("open", "Open shifts", "Employees who can work it, when a teammate releases a shift.") +
      orow("avail", "Availability updates", "Managers of the person, when someone changes their availability.") +
      orow("joined", "New member joined", "The person who sent the invitation.") +
      orow("remind", "Shift reminders", "Employees, 2 hours before each shift. Phone alerts only.", '<em class="nf-later">After launch</em>') +
      orow("unpub", "Week not published", "Managers, 3 days before a week starts with no published schedule.", '<em class="nf-later">After launch</em>') + "</div>" +
      '<details class="nf-card nf-always"><summary><strong>Always sent</strong><span>These keep work moving and accounts safe. They can\'t be switched off.</span>' + icon("chevron-down", 17) + "</summary><ul>" +
      ["Approvals: time off, shift changes, onboarding, documents, preferred names", "Changes to a person's own shifts and a new week going out", "Shifts left without anyone and documents about to expire, to managers", "Decisions on a person's own requests", "Cover and swap asks sent to a person by name", "Documents to sign or upload and their due dates", "Announcements and important dates for the people they target", "Account and security, by email", "Workspace closing and billing, to the owner"].map(function (x) { return "<li>" + icon("lock", 13) + x + "</li>"; }).join("") + "</ul></details>" +
      '<div class="nf-save"><button type="button" class="nf-btn nf-btn-green nf-btn-lg" data-save' + (dirty ? "" : " disabled") + ">Save</button></div>";
  }
  function orgB() {
    var g = FRAG.generalMain.replace(/^<main class="app-main">/, "").replace(/<\/main>$/, "");
    var body = g.indexOf("</header>") > 0 ? g : g;
    var section = '<section class="nf-card nf-inline-sec"><h2 class="nf-h2 is-flat">Notifications</h2><p class="nf-muted">Who gets what is fixed by Newfork. Here you only choose the channels.</p>' +
      orow("email", "Email", "People choose which ones they get.") + orow("push", "Phone alerts", "Each person turns them on for their own device.") + "</section>";
    // The real General page minus its rail, with the section appended under it.
    var m = g.match(/<div class="settings-[^"]*-main[\s\S]*$/);
    return '<div class="nf-generalwrap">' + setHead("General", "Workspace name, time zone and how Harbor &amp; Vine reaches its people.") + section + '<p class="nf-muted nf-gap">The rest of the General page stays as it is today.</p></div>';
  }
  var TYPES = [
    ["Approvals", "Time off request", "Location managers", 1, 1, 1, "lock"], ["Approvals", "Shift change needs approval", "Location managers", 1, 1, 1, "lock"], ["Approvals", "Onboarding ready for review", "Location managers", 1, 1, 0, "lock"],
    ["Schedule", "Week published", "Employees with shifts", 1, 1, 1, "lock"], ["Schedule", "My shift changed", "That employee", 1, 1, 1, "lock"], ["Schedule", "Shifts left without anyone", "Location managers", 1, 1, 1, "lock"],
    ["Shift changes", "Open shift released", "Eligible employees", 1, 0, 1, "opt"], ["Shift changes", "Cover asked by name", "Named employees", 1, 1, 1, "lock"],
    ["People", "Availability updated", "Person's managers", 1, 0, 0, "opt"], ["People", "New member joined", "Inviter", 1, 0, 0, "opt"],
    ["Documents", "Document due", "That employee", 1, 1, 0, "lock"], ["Documents", "Document expiring", "Document reviewers", 1, 1, 0, "lock"]
  ];
  function orgC() {
    var rows = TYPES.map(function (t, k) {
      return '<tr><td><span class="nf-muted">' + t[0] + "</span></td><td><strong>" + t[1] + "</strong></td><td>" + t[2] + "</td>" +
        "<td>" + (t[6] === "lock" ? '<span class="nf-lock">' + icon("lock", 12) + " On</span>" : sw(true, 'data-x="' + k + '"', t[1])) + "</td>" +
        "<td>" + chk(t[3], "", "In app", true) + "</td><td>" + chk(t[4], 'data-dirty', "Email") + "</td><td>" + chk(t[5], 'data-dirty', "Phone") + "</td><td>" + chk(false, "", "Text", true) + "</td></tr>";
    }).join("");
    return setHead("Notifications", "Every notification, who gets it, and which channels it may use.") +
      '<div class="nf-card nf-table-wrap"><table class="nf-table"><thead><tr><th>Category</th><th>Notification</th><th>Goes to</th><th>On</th><th>In app</th><th>Email</th><th>Phone</th><th>Text</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<p class="nf-muted nf-gap">About 50 rows in the full list. Twelve shown.</p><div class="nf-save"><button type="button" class="nf-btn nf-btn-green nf-btn-lg" data-save' + (dirty ? "" : " disabled") + ">Save</button></div>";
  }

  /* ---------- Phone alerts (web push) ---------- */
  var DEV = P.d || (phone ? "iphone-safari" : "chrome");
  var pushState = "ask"; // ask | steps | browser | on | later
  function pushCard(desk) {
    if (pushState !== "ask") return "";
    return '<aside class="nf-pushcard' + (desk ? " is-desk" : "") + '" aria-label="Phone alerts"><span class="nf-tile nf-green">' + icon(desk ? "monitor-smartphone" : "bell-ring", 18) + "</span><div><strong>" + (desk ? "Get alerts on this computer" : "Get alerts on this phone") + "</strong><span>" +
      (R === "employee" ? "Know right away when your schedule changes or someone asks you to cover." : "Know right away when a request needs your approval.") + '</span><div class="nf-pushcard-actions"><button type="button" class="nf-btn nf-btn-green" data-push-on>Turn on</button><button type="button" class="nf-link" data-push-later>Not now</button></div></div></aside>';
  }
  function pushFlow() {
    if (pushState === "steps") return '<div class="nf-scrim"></div><section class="nf-bottom" role="dialog" aria-label="Add Newfork to your Home Screen" tabindex="-1" data-autofocus><h2>One step first on iPhone</h2><p>iPhone shows alerts only for apps on the Home Screen. It takes ten seconds.</p><ol class="nf-steps">' +
      "<li><span>1</span><p>Tap " + icon("share", 16) + " <strong>Share</strong> at the bottom of Safari.</p></li><li><span>2</span><p>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</p></li><li><span>3</span><p>Open <strong>Newfork</strong> from your Home Screen and tap <strong>Turn on</strong> again.</p></li></ol>" +
      '<div class="nf-bottom-actions"><button type="button" class="nf-btn nf-btn-green nf-btn-lg" data-sim-installed>I added it (try it)</button><button type="button" class="nf-btn nf-btn-lg" data-push-later>Not now</button></div></section>';
    if (pushState === "browser") return '<div class="nf-sysprompt" role="alertdialog" aria-label="Browser permission" tabindex="-1" data-autofocus><p><strong>' + (DEV === "chrome" ? "app.newfork.com wants to" : "“Newfork” Would Like to Send You Notifications") + "</strong>" + (DEV === "chrome" ? "<span>" + icon("bell", 14) + " Show notifications</span>" : "<span>Notifications may include alerts, sounds and icon badges.</span>") +
      '</p><div><button type="button" data-sys="block">' + (DEV === "chrome" ? "Block" : "Don't Allow") + '</button><button type="button" data-sys="allow">Allow</button></div><small>This box is the ' + (DEV === "chrome" ? "browser's" : "phone's") + " own; Newfork can't change it.</small></div>";
    return "";
  }

  /* ---------- events ---------- */
  root.addEventListener("click", function (e) {
    var t = e.target.closest("button, a, [data-close]"); if (!t) return;
    if (t.tagName === "A") e.preventDefault();
    var d = t.dataset;
    if ("openPanel" in d) { S.panel = !S.panel; S.page = false; if (S.panel) seeAll(); render(); return; }
    if ("openSheet" in d) { S.sheet = true; seeAll(); render(); return; }
    if ("close" in d) { S.panel = false; S.sheet = false; S.bell = false; render(); return; }
    if ("bell" in d) { S.bell = !S.bell; if (S.bell) seeAll(); render(); return; }
    if ("seeAll" in d) { S.panel = false; S.page = true; render(); return; }
    if ("seeAllC" in d) { toast("Opens the full Notifications page"); return; }
    if (d.tab) { S.tab = d.tab; render(); return; }
    if ("readAll" in d) { items.forEach(function (i) { i.unread = false; }); render(); toast("All marked as read"); return; }
    if (d.toggleRead) { var i1 = find(d.toggleRead); i1.unread = !i1.unread; render(); return; }
    if (d.archive) { find(d.archive).archived = true; render(); toast("Archived"); return; }
    if (d.quick) { var i2 = find(d.quick); i2.done = d.label === "Accept" ? "You accepted · your manager decides" : "You declined"; i2.unread = false; i2.resolved = i2.done; i2.done = null; render(); toast(d.label === "Accept" ? "Accepted. Jake's manager decides." : "Declined"); return; }
    if (d.go) { var i3 = find(d.go); i3.unread = false;
      if (V === "inbox-B" && !e.target.closest(".nf-two-actions")) { S.detail = i3.id; render(); return; }
      render(); toast("Opens " + i3.target); return; }
    if ("back" in d) { S.detail = null; render(); return; }
    if ("prefs" in d) { toast("Opens Account → Notifications"); return; }
    if (d.me) { me[d.me] = !me[d.me]; dirty = true; render(); return; }
    if ("pushOn" in d) { pushState = DEV === "iphone-safari" ? "steps" : "browser"; render(); return; }
    if ("simInstalled" in d) { DEV = "iphone-app"; pushState = "browser"; render(); return; }
    if ("pushLater" in d) { pushState = "later"; render(); toast("We'll ask again next week. Turn it on any time in Account → Notifications."); return; }
    if (d.sys) { pushState = d.sys === "allow" ? "on" : "later"; me.push = d.sys === "allow"; render(); toast(d.sys === "allow" ? "Phone alerts are on" : "Blocked. You can allow it later in the browser settings."); return; }
    if (d.org) { org[d.org] = !org[d.org]; dirty = true; render(); return; }
    if (d.lv) { lv[d.lv] = d.val; dirty = true; render(); return; }
    if ("save" in d) { dirty = false; render(); toast("Saved"); return; }
    if (t.getAttribute("role") === "switch" && !t.disabled) { t.setAttribute("aria-checked", t.getAttribute("aria-checked") !== "true"); dirty = true; var sv = root.querySelector("[data-save]"); if (sv) sv.disabled = false; return; }
  });
  root.addEventListener("change", function (e) {
    var c = e.target; if (c.type !== "checkbox") return;
    if (c.dataset.cat) { cats.forEach(function (x) { if (x.k === c.dataset.cat) x[c.dataset.ch] = c.checked; }); }
    dirty = true; var sv = root.querySelector("[data-save]"); if (sv) sv.disabled = false;
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && (S.panel || S.sheet || S.bell)) { S.panel = S.sheet = S.bell = false; render(); } });
  function find(id) { return items.filter(function (i) { return String(i.id) === String(id); })[0]; }

  if (P.open === "1") { S.panel = true; S.sheet = true; S.bell = true; seeAll(); }
  if (P.page === "1") S.page = true;
  if (V === "inbox-B" && !phone) S.detail = items[0].id;
  if (V === "push-B") me.push = false;
  render();
})();
