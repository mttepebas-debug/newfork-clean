(function () {
  var V = window.__V;
  var svg = function (p, s) { return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (s || 15) + '" height="' + (s || 15) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var I = {
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
    updown: svg('<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>'),
    out: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>', 18),
    user: svg('<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>', 18),
    swap: svg('<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>', 18),
    back: svg('<path d="m15 18-6-6 6-6"/>', 18),
    grid: svg('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>', 16)
  };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var send = function (m) { parent.postMessage(Object.assign({ __sw: 1 }, m), '*'); };
  var toast = function (t) { send({ type: 'toast', text: t }); };

  var cur = V.ws.find(function (w) { return w.id === V.cur; }) || V.ws[0];
  var others = V.ws.filter(function (w) { return w !== cur; });
  var inv = V.inv;
  var waiting = inv.length;
  var hasMore = others.length > 0 || waiting > 0;
  var initial = function (w) { return w.name.slice(0, 1).toUpperCase(); };
  var roleLine = function (w) { return w.role + (w.unfinished ? ' · Setup unfinished' : ''); };
  var pick = function (id) {
    var w = V.ws.find(function (x) { return x.id === id; });
    if (w && w.unfinished) { toast('Maket: kurulumu bitmemiş "' + w.name + '" için kurulum sihirbazı açılır.'); return; }
    send({ type: 'switch', id: id });
  };

  // Links never navigate in the mock; they say where they would go.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    var label = (a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ');
    toast('Maket: "' + label + '" bağlantısı ' + a.getAttribute('href') + ' adresine gider.');
  }, true);
  document.addEventListener('submit', function (e) { e.preventDefault(); }, true);

  var shell = document.querySelector('.app-shell');
  var tools = document.querySelector('.sidebar-tools');
  var burger = tools.querySelector('.icon-button');
  burger.addEventListener('click', function (e) { e.stopPropagation(); send({ type: 'collapse' }); });
  var slot = tools.querySelector('.organization-context-slot, .workspace-switcher-mark');
  var setSlot = function (html) {
    if (slot) slot.remove();
    if (html) tools.insertAdjacentHTML('beforeend', html);
    slot = tools.lastElementChild === burger ? null : tools.lastElementChild;
  };
  var plainName = '<div class="organization-context-slot"><strong class="workspace-name">' + esc(cur.name) + '</strong></div>';

  // Account row: its count follows the invitations, as in the app.
  var account = document.querySelector('.sidebar-footer a[href="/account/profile"]');
  if (account) {
    var c = account.querySelector('.nav-item-count');
    if (!waiting && c) { c.remove(); account.removeAttribute('aria-label'); }
    if (waiting && c) c.textContent = String(waiting);
  }

  // Popover shared by B and C (fixed to the frame, so the sidebar edge never cuts it).
  var pop = null;
  var closePop = function () { if (pop) { pop.remove(); pop = null; document.querySelectorAll('[aria-expanded="true"].wsx-anchor').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); }); } };
  document.addEventListener('mousedown', function (e) { if (pop && !pop.contains(e.target) && !e.target.closest('.wsx-anchor')) closePop(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePop(); });
  var listHtml = function (opts) {
    var h = '<p class="workspace-switcher-label">You are in</p>' +
      '<span class="workspace-switcher-item is-current"><span class="wsx-tile">' + esc(initial(cur)) + '</span><span class="workspace-switcher-text"><strong>' + esc(cur.name) + '</strong><span>' + esc(roleLine(cur)) + '</span></span>' + I.check + '</span>';
    if (others.length) {
      h += '<p class="workspace-switcher-label">Switch to</p>';
      others.forEach(function (w) {
        h += '<button type="button" role="menuitem" class="workspace-switcher-item" data-pick="' + w.id + '"><span class="wsx-tile is-quiet">' + esc(initial(w)) + '</span><span class="workspace-switcher-text"><strong>' + esc(w.name) + '</strong><span>' + esc(roleLine(w)) + '</span></span></button>';
      });
    } else if (opts && opts.emptyNote) {
      h += '<p class="wsx-empty">No other workspaces yet.</p>';
    }
    if (inv.length) {
      h += '<p class="workspace-switcher-label">' + (inv.length === 1 ? 'Invitation' : 'Invitations') + '</p>';
      inv.forEach(function (i) {
        h += '<span class="workspace-switcher-item is-invitation"><span class="wsx-tile is-quiet">' + esc(initial(i)) + '</span><span class="workspace-switcher-text"><strong>' + esc(i.name) + '</strong><span>Waiting for your answer</span></span><button class="nf-button pb-btn pb-btn-primary workspace-switcher-answer" type="button" data-answer="1">Answer</button></span>';
      });
    }
    return h;
  };
  var wirePop = function (root) {
    root.querySelectorAll('[data-pick]').forEach(function (b) { b.addEventListener('click', function () { pick(b.getAttribute('data-pick')); }); });
    root.querySelectorAll('[data-answer]').forEach(function (b) { b.addEventListener('click', function () { closePop(); toast('Maket: Account › Workspaces açılır, davet orada Accept / Decline ile cevaplanır.'); }); });
    root.querySelectorAll('[data-go]').forEach(function (b) { b.addEventListener('click', function () { closePop(); toast(b.getAttribute('data-go')); }); });
  };
  var openPop = function (anchor, html, place) {
    if (pop) { closePop(); return; }
    pop = document.createElement('div');
    pop.className = 'workspace-switcher-menu wsx-pop';
    pop.setAttribute('role', 'menu');
    pop.innerHTML = html;
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect();
    var side = document.querySelector('.app-sidebar').getBoundingClientRect();
    if (place === 'below') { pop.style.left = (V.collapsed ? side.right + 8 : side.left + 12) + 'px'; pop.style.top = (V.collapsed ? r.top : r.bottom + 6) + 'px'; }
    else { pop.style.left = (V.collapsed ? side.right + 8 : side.left + 12) + 'px'; pop.style.bottom = (innerHeight - (V.collapsed ? r.bottom : r.top - 6)) + 'px'; }
    anchor.setAttribute('aria-expanded', 'true');
    wirePop(pop);
  };
  var manageLink = '<button type="button" class="workspace-switcher-all wsx-all" data-go="Maket: Account › Workspaces açılır (bütün workspace\'ler, davetler, yeni workspace).">Manage workspaces</button>';

  var V_ = V.v;
  if (V.frame === 'desk') {
    if (V_ === 'orig') {
      // Today's component, unchanged: menu inside the sidebar, so its right edge is cut off.
      if (!hasMore) setSlot(plainName);
      else if (V.collapsed) setSlot('<a class="workspace-switcher-mark" aria-label="' + esc(cur.name) + ' — choose a workspace" href="/workspaces">' + esc(initial(cur)) + (waiting ? '<span class="workspace-switcher-count"></span>' : '') + '</a>');
      else {
        setSlot('<div class="organization-context-slot workspace-switcher"><button type="button" class="workspace-switcher-trigger" aria-expanded="false" aria-haspopup="menu"><strong class="workspace-name">' + esc(cur.name) + '</strong>' + (waiting ? '<span class="workspace-switcher-count">' + waiting + '</span>' : '') + I.updown + '</button></div>');
        var trig = slot.querySelector('button');
        var menu = null;
        trig.addEventListener('click', function () {
          if (menu) { menu.remove(); menu = null; trig.setAttribute('aria-expanded', 'false'); return; }
          menu = document.createElement('div');
          menu.className = 'workspace-switcher-menu';
          menu.setAttribute('role', 'menu');
          menu.innerHTML = listHtml().replace(/<span class="wsx-tile[^"]*">[^<]*<\/span>/g, '') + '<a class="workspace-switcher-all" href="/workspaces">All workspaces</a>';
          slot.appendChild(menu);
          trig.setAttribute('aria-expanded', 'true');
          menu.querySelectorAll('[data-pick]').forEach(function (b) { b.addEventListener('click', function () { pick(b.getAttribute('data-pick')); }); });
          menu.querySelectorAll('[data-answer]').forEach(function (b) { b.addEventListener('click', function () { toast('Maket: Workspace Hub (/workspaces) açılır, davet orada cevaplanır.'); }); });
        });
        document.addEventListener('mousedown', function (e) { if (menu && !slot.contains(e.target)) { menu.remove(); menu = null; trig.setAttribute('aria-expanded', 'false'); } });
        if (V.openMenu) trig.click();
      }
    } else if (V_ === 'a') {
      setSlot(V.collapsed ? '' : plainName);
    } else if (V_ === 'b') {
      if (V.collapsed) setSlot('<button type="button" class="wsx-anchor wsx-railtile" aria-haspopup="menu" aria-expanded="false" aria-label="' + esc(cur.name) + ', switch workspace">' + esc(initial(cur)) + (waiting ? '<span class="wsx-dot"></span>' : '') + '</button>');
      else setSlot('<div class="organization-context-slot wsx-slot"><button type="button" class="wsx-anchor wsx-trigger" aria-haspopup="menu" aria-expanded="false"><span class="wsx-tile">' + esc(initial(cur)) + '</span><span class="wsx-trigger-text"><strong>' + esc(cur.name) + '</strong><span>' + esc(cur.role) + '</span></span>' + (waiting ? '<span class="workspace-switcher-count">' + waiting + '</span>' : '') + I.updown + '</button></div>');
      var bt = slot.querySelector('button') || slot;
      bt.addEventListener('click', function () { openPop(bt, listHtml({ emptyNote: true }) + manageLink, 'below'); });
      if (V.openMenu) bt.click();
    } else if (V_ === 'd') {
      // The switcher becomes the footer row above Settings; the top row keeps the plain name.
      setSlot(V.collapsed ? '' : plainName);
      var foot = document.querySelector('.sidebar-footer');
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'nav-item wsx-anchor wsx-footrow' + (V.collapsed ? ' rail-peek-item' : '');
      row.setAttribute('aria-haspopup', 'menu');
      row.setAttribute('aria-expanded', 'false');
      if (V.collapsed) row.setAttribute('data-rail-peek', '');
      row.innerHTML = '<span class="nav-icon-frame"><span class="wsx-tile wsx-tile-sm">' + esc(initial(cur)) + '</span></span>' +
        (V.collapsed ? '<span class="rail-flyout">' + esc(cur.name) + '</span>' : '<span class="wsx-foot-name">' + esc(cur.name) + '</span>') +
        (V.collapsed ? '' : I.updown);
      foot.insertBefore(row, foot.firstChild);
      row.addEventListener('click', function () {
        openPop(row, listHtml({ emptyNote: true }).replace(/<span class="wsx-tile[^"]*">[^<]*<\/span>/g, '') + '<a class="workspace-switcher-all" href="/workspaces">All workspaces</a>', 'above');
      });
      if (V.openMenu) row.click();
    } else if (V_ === 'c') {
      setSlot(V.collapsed ? '' : plainName);
      var footer = document.querySelector('.sidebar-footer');
      var signOut = footer.querySelector('button.nav-item');
      if (signOut) signOut.remove();
      if (account) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item wsx-anchor wsx-account' + (V.collapsed ? ' rail-peek-item' : '');
        btn.setAttribute('aria-haspopup', 'menu');
        btn.setAttribute('aria-expanded', 'false');
        if (V.collapsed) btn.setAttribute('data-rail-peek', '');
        btn.innerHTML = '<span class="nav-icon-frame"><span class="current-user-avatar" aria-hidden="true">MT</span></span>' +
          (V.collapsed ? '<span class="rail-flyout">Account</span>' : '<span class="wsx-account-text"><strong>Mert Tepebas</strong><span>' + esc(cur.name) + '</span></span>') +
          (waiting ? '<span class="nav-item-count" aria-hidden="true">' + waiting + '</span>' : '') + (V.collapsed ? '' : I.updown);
        account.replaceWith(btn);
        btn.addEventListener('click', function () {
          openPop(btn,
            '<div class="wsx-who"><span class="current-user-avatar" aria-hidden="true">MT</span><span class="workspace-switcher-text"><strong>Mert Tepebas</strong><span>mert@harborandvine.com</span></span></div>' +
            listHtml() + manageLink +
            '<div class="wsx-sep"></div>' +
            '<button type="button" class="wsx-row" data-go="Maket: Account › Profile açılır.">' + I.user + '<span>Account settings</span></button>' +
            '<button type="button" class="wsx-row" data-go="Maket: oturum kapanır.">' + I.out + '<span>Sign out</span></button>', 'above');
        });
        if (V.openMenu) btn.click();
      }
    }
  } else {
    // Phone: the management bar's More sheet.
    var sheet = document.querySelector('.mm-sheet');
    var moreBtn = document.querySelector('.mm-bar button[aria-haspopup="dialog"]');
    var body = sheet.querySelector('.mm-sheet-body');
    var home = body.innerHTML;
    var wireHome = function () {
      body.querySelector('.mm-icon-button').addEventListener('click', function () { sheet.close(); });
      var nav = body.querySelector('nav');
      var acct = nav.querySelector('a[href="/account/profile"]');
      if (V_ === 'b' || V_ === 'c') {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'wsx-more-row';
        row.innerHTML = '<span class="wsx-tile">' + esc(initial(cur)) + '</span><span class="wsx-trigger-text"><strong>' + esc(cur.name) + '</strong><span>' + (V_ === 'c' ? 'Mert Tepebas · Account and workspaces' : 'Switch workspace') + '</span></span>' + (waiting ? '<span class="workspace-switcher-count">' + waiting + '</span>' : '') + '<span class="wsx-chev">' + svg('<path d="m9 18 6-6-6-6"/>', 18) + '</span>';
        if (V_ === 'b') nav.insertBefore(row, nav.firstChild);
        else { acct.replaceWith(row); var so = nav.querySelector('button:not(.wsx-more-row)'); if (so) so.remove(); }
        row.addEventListener('click', showList);
      }
    };
    var showList = function () {
      body.innerHTML = '<header><strong>' + (V_ === 'c' ? 'Account' : 'Workspaces') + '</strong><button type="button" class="mm-icon-button" aria-label="Back">' + I.back + '</button></header><div class="wsx-sheet-list">' +
        (V_ === 'c' ? '<div class="wsx-who"><span class="current-user-avatar" aria-hidden="true">MT</span><span class="workspace-switcher-text"><strong>Mert Tepebas</strong><span>mert@harborandvine.com</span></span></div>' : '') +
        listHtml({ emptyNote: V_ === 'b' }) + manageLink +
        (V_ === 'c' ? '<div class="wsx-sep"></div><button type="button" class="wsx-row" data-go="Maket: Account › Profile açılır.">' + I.user + '<span>Account settings</span></button><button type="button" class="wsx-row" data-go="Maket: oturum kapanır.">' + I.out + '<span>Sign out</span></button>' : '') + '</div>';
      body.querySelector('.mm-icon-button').addEventListener('click', function () { body.innerHTML = home; wireHome(); });
      wirePop(body);
    };
    wireHome();
    moreBtn.addEventListener('click', function () { body.innerHTML = home; wireHome(); sheet.showModal(); });
    if (V.phoneSheet) { try { sheet.showModal(); } catch (e) { sheet.setAttribute('open', ''); } if (V.openMenu && (V_ === 'b' || V_ === 'c')) showList(); }
  }
})();
