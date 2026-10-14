(function () {
  // Variants page: the shell sends {nf:"variant", key, css, seed, go, steps}.
  var KEY = "newfork.atlas.world.v1";
  function addDays(iso, n) { var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function mondayOfToday() { var d = new Date(); var s = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12)); var wd = (s.getUTCDay() + 6) % 7; s.setUTCDate(s.getUTCDate() - wd); return s.toISOString().slice(0, 10); }
  var seeds = {
    // A saved draft on last week (closed), and next week not yet published at Downtown.
    schedule: function (w) {
      var thisWeek = mondayOfToday(), last = addDays(thisWeek, -7), next = addDays(thisWeek, 7);
      if (!w.drafts.some(function (d) { return d.id === "00000802-0000-4000-8000-000000000802"; })) {
        var base = w.drafts[0];
        w.drafts.push({ id: "00000802-0000-4000-8000-000000000802", week_start: last, name: "Last week plan", revision: 2, location_ids: base ? base.location_ids.slice() : [], shifts: [], created_at: base ? base.created_at : new Date().toISOString(), updated_at: base ? base.updated_at : new Date().toISOString() });
      }
      w.publications = w.publications.filter(function (p) { return !(p.week_start === next && /0101$/.test(p.location_id)); });
    }
  };
  function applySeed(name) {
    var fn = seeds[name]; if (!fn) return;
    try {
      var w = JSON.parse(localStorage.getItem(KEY) || "null"); if (!w) return;
      fn(w);
      window.postMessage({ nf: "pages", kind: "store", name: "world", data: w }, "*");
    } catch (e) {}
  }
  function visible(el) { var b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !el.closest("[inert],[hidden]"); }
  function find(t) {
    if (t.indexOf("text=") === 0) {
      var w = t.slice(5).toLowerCase(), c = document.querySelectorAll("button, a, [role=tab], [role=button], summary, label");
      for (var i = 0; i < c.length; i++) { var n = (c[i].getAttribute("aria-label") || c[i].textContent || "").replace(/\s+/g, " ").trim().toLowerCase(); if (n === w && visible(c[i])) return c[i]; }
      for (var j = 0; j < c.length; j++) { var m = (c[j].getAttribute("aria-label") || c[j].textContent || "").replace(/\s+/g, " ").trim().toLowerCase(); if (m.indexOf(w) === 0 && visible(c[j])) return c[j]; }
      return null;
    }
    var all = document.querySelectorAll(t); for (var k = 0; k < all.length; k++) if (visible(all[k])) return all[k]; return null;
  }
  function run(steps) {
    var i = 0;
    (function next(tries) {
      if (i >= steps.length) return;
      var s = steps[i];
      if (s.wait) { i++; return setTimeout(function () { next(0); }, s.wait); }
      var el = find(s.click);
      if (!el) { if (tries < 60) return setTimeout(function () { next(tries + 1); }, 100); i++; return next(0); }
      el.click(); i++; setTimeout(function () { next(0); }, 350);
    })(0);
  }
  window.addEventListener("message", function (event) {
    var m = event.data;
    if (!m || m.nf !== "variant") return;
    if (typeof m.css === "string") {
      var s = document.getElementById("nf-variant");
      if (!s) { s = document.createElement("style"); s.id = "nf-variant"; document.head.appendChild(s); }
      s.textContent = m.css;
      document.documentElement.setAttribute("data-nf-variant", m.key || "");
    }
    if (m.seed) applySeed(m.seed);
    if (m.go && window.__atlasNavigate) window.__atlasNavigate(m.go);
    if (m.steps && m.steps.length) setTimeout(function () { run(m.steps); }, m.go || m.seed ? 700 : 0);
  });
  try { window.parent.postMessage({ nf: "variant-ready", frame: (location.hash.match(/frame=(\w+)/) || [])[1] }, "*"); } catch (e) {}
})();
