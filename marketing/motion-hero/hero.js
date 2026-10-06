/* Newfork motion hero — a 15 s reel driven by one deterministic timeline.
   render(t) derives every element's state from the time alone, so the reel
   can be scrubbed, looped and paused at any frame. No dependencies.
   Mount: <section class="nfh" data-newfork-hero> … </section> + this script. */
(function () {
  "use strict";

  const DUR = 15;
  const W = 1600;
  const H = 900;

  // Schedule panel geometry (panel-local px).
  const PX = 260, PY = 140, PW = 1080, PH = 620;
  const HEAD = 64, DAYH = 40, NAMEW = 200, ROWH = 70;
  const DAYW = (PW - NAMEW - 16) / 7;
  const cellX = (d) => NAMEW + d * DAYW;
  const rowY = (r) => HEAD + DAYH + r * ROWH;
  const cardX = (d) => cellX(d) + 6;
  const cardY = (r) => rowY(r) + 6;
  const CW = DAYW - 12, CH = ROWH - 12;
  const FX = cellX(4) + DAYW / 2; // Friday column centre
  const CY = (r) => rowY(r) + ROWH / 2;
  const PUBX = PW - 16 - 56, PUBY = 32; // Publish button centre

  const CHAPTERS = [
    [0, "Ignite"],
    [2.22, "Chaos"],
    [3.85, "Order"],
    [5.15, "Detect"],
    [9.1, "Deliver"],
    [11.0, "Publish"],
    [12.9, "Resolve"],
  ];

  /* ---------- math ---------- */
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const p = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const E = {
    linear: (x) => x,
    outCubic: (x) => 1 - (1 - x) ** 3,
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
    inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
    outQuint: (x) => 1 - (1 - x) ** 5,
    outExpo: (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
    inExpo: (x) => (x <= 0 ? 0 : 2 ** (10 * x - 10)),
    inOutExpo: (x) =>
      x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2,
    outBack: (x) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
    },
    // Under-damped spring, ~14% overshoot, settles by x = 1.
    spring: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-6.5 * x) * Math.cos(10.5 * x)),
    springSoft: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-5 * x) * Math.cos(8 * x)),
  };
  // Keyframes: [[t, v], [t, v, ease], ...]; ease shapes the segment ending at that key.
  function kf(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, e = E.inOutCubic] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        return lerp(v0, v1, e((t - t0) / (t1 - t0 || 1)));
      }
    }
    return keys[keys.length - 1][1];
  }
  function rng(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const fmt = (n, d = 1) => n.toFixed(d);

  /* ---------- data ---------- */
  const ROLES = {
    server: { label: "Server", c: "#1f8a6a", tint: "#e3f2ec" },
    cook: { label: "Line cook", c: "#c2620a", tint: "#fcefe0" },
    bar: { label: "Bartender", c: "#3b5bb5", tint: "#e7ecf8" },
    host: { label: "Host", c: "#8a3fa0", tint: "#f3e7f6" },
  };
  const PEOPLE = [
    null,
    { name: "Maria Lopez", ini: "ML", role: "server", hrs: "25 hrs" },
    { name: "James Carter", ini: "JC", role: "cook", hrs: "40 hrs" },
    { name: "Priya Shah", ini: "PS", role: "bar", hrs: "40 hrs" },
    { name: "Diego Ramos", ini: "DR", role: "host", hrs: "23 hrs" },
    { name: "Sam Whitfield", ini: "SW", role: "server", hrs: "24 hrs" },
    { name: "Aisha Bello", ini: "AB", role: "cook", hrs: "40 hrs" },
  ];
  const SHIFTS = {
    1: ["9a–3p", "9a–3p", 0, "4p–10p", 0, "4p–11p", 0],
    2: ["7a–3p", 0, "7a–3p", "7a–3p", "3p–11p", "3p–11p", 0],
    3: [0, "5p–1a", "5p–1a", 0, "6p–2a", "6p–2a", "4p–12a"],
    4: ["11a–5p", "11a–5p", 0, "11a–5p", "5p–10p", 0, 0],
    5: [0, "4p–10p", "4p–10p", 0, 0, "10a–4p", "10a–4p"],
    6: ["3p–11p", "3p–11p", 0, "3p–11p", "7a–3p", 0, "7a–3p"],
  };
  const OPEN = [
    { d: 4, time: "5p–11p", role: "server", drag: true },
    { d: 6, time: "10a–4p", role: "host" },
  ];
  const PREFERS_OFF = [[3, 0], [4, 2], [6, 5]];
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const TAGS = [
    { x: 120, y: 165, r: -7, cls: "bubble", text: "Who can cover Friday??" },
    { x: 1060, y: 118, r: 5, cls: "file", text: "schedule_v12_FINAL(3).xlsx" },
    { x: 170, y: 690, r: 4, cls: "alert", text: "Call-out · 4:47 PM" },
    { x: 1040, y: 705, r: -5, cls: "bubble", text: "Can I swap Sat w/ someone?" },
  ];
  const CAPTIONS = [
    { t0: 3.95, t1: 5.12, n: "01", text: "From chaos to one schedule.", at: "bl" },
    { t0: 7.15, t1: 8.98, n: "02", text: "Conflicts caught before they happen.", at: "bl" },
    { t0: 9.75, t1: 10.98, n: "03", text: "Every location. Every phone.", at: "tl" },
    { t0: 11.35, t1: 12.82, n: "04", text: "Published in one click.", at: "bl" },
  ];
  const LOCS = [
    { name: "Midtown", n: "14 on shift", c: "#176954", x: 150, y: 770 },
    { name: "Brooklyn", n: "11", c: "#3b5bb5", x: 420, y: 800 },
    { name: "Hoboken", n: "9", c: "#c2620a", x: 660, y: 770 },
  ];
  const NOTES = [
    { c: "#176954", title: "Shift assigned", sub: "Fri 5:00 – 11:00 PM · Midtown", ago: "now" },
    { c: "#3b5bb5", title: "Swap approved", sub: "You ↔ Priya · Sat, Oct 10", ago: "2m" },
    { c: "#c2620a", title: "Availability saved", sub: "Mondays off from Oct 12", ago: "1h" },
  ];
  const N_PATH = "M18 46V18h8.5l11 17.4V18H46v28h-8.5l-11-17.4V46H18Z";

  /* ---------- markup ---------- */
  let uid = 0;
  function stageMarkup(id) {
    let h = "";
    h += '<div class="nfh-bg-dark"></div>';
    h += '<div class="nfh-bg-light"><div class="nfh-blob a"></div><div class="nfh-blob b"></div></div>';
    h +=
      '<div class="nfh-logo"><div class="nfh-logo-glow"></div>' +
      '<svg viewBox="0 0 64 64"><defs>' +
      `<linearGradient id="${id}sq" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c3b33"/><stop offset="1" stop-color="#0c1a16"/></linearGradient>` +
      `<linearGradient id="${id}n" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#a8f3d4"/></linearGradient>` +
      "</defs>" +
      `<rect class="nfh-logo-sq" width="64" height="64" rx="14" fill="url(#${id}sq)" stroke="rgba(94,230,180,.5)" stroke-width=".5"/>` +
      `<path class="nfh-logo-n" d="${N_PATH}" fill="url(#${id}n)" fill-opacity="0" stroke="#5ee6b4" stroke-width=".9" stroke-linejoin="round"/>` +
      '</svg><div class="nfh-logo-dot"></div></div>';
    h += '<div class="nfh-word">' + "newfork".split("").map((ch) => `<span><span>${ch}</span></span>`).join("") + "</div>";
    h += '<div class="nfh-tagline">Shift scheduling for restaurants</div>';
    for (const tg of TAGS) h += `<div class="nfh-tag ${tg.cls}"><i></i>${tg.text}</div>`;

    // Panel
    h += '<div class="nfh-panel"><div class="nfh-pglow"></div>';
    h += '<div class="nfh-pbg"><div class="nfh-phead-bg"></div><div class="nfh-sheen"></div></div>';
    h +=
      '<div class="nfh-phead"><div class="nfh-loc"><i></i>Midtown</div>' +
      '<div class="nfh-week"><b>Oct 5 – 11</b><span>2026</span></div>' +
      '<div class="nfh-hright"><span class="nfh-chip"><b>2</b><span>open shifts</span></span>' +
      '<span class="nfh-badge">Draft</span>' +
      '<span class="nfh-pub"><span class="a">Publish</span><span class="b">✓ Published</span></span></div></div>';
    h += '<div class="nfh-grid">';
    h += `<i class="today" style="left:${cellX(1)}px;width:${DAYW}px"></i>`;
    for (let d = 0; d <= 7; d++) h += `<i class="v" style="left:${cellX(d)}px"></i>`;
    for (let r = 0; r <= 7; r++) h += `<i class="h" style="top:${rowY(r)}px"></i>`;
    h += "</div>";
    h += '<div class="nfh-days">';
    DAYS.forEach((d, i) => {
      h += `<div class="nfh-day${i === 1 ? " is-today" : ""}" style="left:${cellX(i) + 12}px">${d}<b>${5 + i}</b></div>`;
    });
    h += "</div>";
    for (let r = 0; r < 7; r++) {
      const pp = PEOPLE[r];
      h += `<div class="nfh-name" style="top:${rowY(r)}px">`;
      if (!pp) h += '<div class="nfh-av open">+</div><div><b>Open shifts</b><small>Anyone qualified</small></div>';
      else
        h += `<div class="nfh-av" style="--c:${ROLES[pp.role].c}">${pp.ini}</div><div><b>${pp.name}</b><small>${ROLES[pp.role].label} · <span class="hrs">${pp.hrs}</span></small></div>`;
      h += "</div>";
    }
    h += '<div class="nfh-layer nfh-layer-av">';
    for (const [r, d] of PREFERS_OFF)
      h += `<div class="nfh-avcell" style="left:${cardX(d)}px;top:${cardY(r)}px;width:${CW}px;height:${CH}px">Prefers off</div>`;
    h += "</div>";
    h += `<div class="nfh-layer nfh-layer-to"><div class="nfh-tocell" style="left:${cardX(4)}px;top:${cardY(1)}px;width:${CW}px;height:${CH}px">TIME OFF<i></i></div></div>`;
    h += "<!--cards-->";
    const labels = [
      ["Week grid", "#8fa59b"],
      ["Availability", "#d9730d"],
      ["Time off", "#d4162a"],
      ["Shifts", "#1f8a6a"],
    ];
    for (const [txt, c] of labels) h += `<div class="nfh-llabel" style="--c:${c}"><i></i>${txt}</div>`;
    h += '<div class="nfh-tip"></div>';
    h +=
      '<div class="nfh-cursor"><div class="nfh-ripple"></div><svg viewBox="0 0 28 28">' +
      '<path d="M4 2.5v20.2l5.3-5 3.4 7.6 3.6-1.6-3.4-7.5h7.3z" fill="#0b1210" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></div>';
    h += "</div>";

    // Locations network
    h += '<svg class="nfh-net" viewBox="0 0 1600 900">';
    for (let i = 0; i < LOCS.length; i++) h += '<path pathLength="1"></path>';
    for (let i = 0; i < LOCS.length * 2; i++) h += '<circle r="5"></circle>';
    h += "</svg>";
    for (const l of LOCS)
      h += `<div class="nfh-locchip" style="--c:${l.c};left:${l.x}px;top:${l.y}px"><i></i>${l.name}<small>${l.n}</small></div>`;

    // Phone
    h += '<div class="nfh-phone"><div class="nfh-screen"><div class="nfh-sb"><b>9:41</b><span></span></div>';
    h += '<div class="nfh-ph-hi"><span>Hi, Sam</span><b>Your week</b></div><div class="nfh-ph-days">';
    "MTWTFSS".split("").forEach((d, i) => {
      const cls = i === 4 ? "on" : [1, 2, 5, 6].includes(i) ? "dot" : "";
      h += `<div class="${cls}">${d}<b>${5 + i}</b></div>`;
    });
    h +=
      '</div><div class="nfh-ph-shift"><i></i><div><small>FRI, OCT 9</small><b>5:00 PM – 11:00 PM</b><span>Server · Midtown</span></div><em>New</em></div>';
    h += '<div class="nfh-ph-label">Inbox</div>';
    for (const n of NOTES)
      h += `<div class="nfh-ph-n" style="--c:${n.c}"><i></i><div><b>${n.title}</b><span>${n.sub}</span></div><em>${n.ago}</em></div>`;
    h += "</div></div>";
    h += '<div class="nfh-card nfh-fly"><b>5p–11p</b><span>Server</span></div>';

    // Stats
    h +=
      '<div class="nfh-stats">' +
      '<div class="nfh-stat"><b data-n="29">0</b><span>shifts published</span></div>' +
      '<div class="nfh-stat"><b data-n="3">0</b><span>locations</span></div>' +
      '<div class="nfh-stat good"><b data-n="0">3</b><span>conflicts</span></div></div>';

    for (const c of CAPTIONS)
      h += `<div class="nfh-lt"><i class="bar"></i><div class="box"><span class="txt"><em>${c.n}</em>${c.text}</span></div></div>`;
    h += '<canvas class="nfh-fx"></canvas>';
    return h;
  }

  function cardMarkup(c) {
    const role = ROLES[c.role];
    return (
      `<div class="nfh-card${c.open ? " is-open" : ""}" style="--c:${role.c};--tint:${role.tint}">` +
      `<b>${c.time}</b><span>${c.open ? "Open · " + role.label : role.label}</span><i class="nfh-chk"></i><i class="nfh-flash"></i></div>`
    );
  }

  const ICON_PAUSE = '<svg viewBox="0 0 14 14"><rect x="2.5" y="2" width="3" height="10" rx="1" fill="currentColor"/><rect x="8.5" y="2" width="3" height="10" rx="1" fill="currentColor"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 14 14"><path d="M3.5 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.4 1.7a.6.6 0 0 0-.9.5z" fill="currentColor"/></svg>';
  const ICON_REPLAY = '<svg viewBox="0 0 14 14"><path d="M2.5 7a4.5 4.5 0 1 0 1.4-3.3M2.5 1.8v2.6h2.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------- mount ---------- */
  function mount(root) {
    if (root.__nfh) return root.__nfh;
    const id = "nfh" + ++uid;
    const loop = root.hasAttribute("data-loop");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const viewport = document.createElement("div");
    viewport.className = "nfh-viewport";
    viewport.setAttribute("aria-hidden", "true");
    const stage = document.createElement("div");
    stage.className = "nfh-stage";

    // Cards: build data first so markup and state stay in one place.
    const R = rng(20261009);
    const cards = [];
    for (let r = 1; r <= 6; r++)
      SHIFTS[r].forEach((time, d) => {
        if (time) cards.push({ d, r, time, role: PEOPLE[r].role });
      });
    for (const o of OPEN) cards.push({ d: o.d, r: 0, time: o.time, role: o.role, open: true, drag: !!o.drag });
    for (const c of cards) {
      c.seed = R();
      c.cx = -170 + R() * 1340;
      c.cy = -90 + R() * 790;
      c.cr = (R() - 0.5) * 70;
      c.cs = 0.8 + R() * 0.35;
      const sx = PX + c.cx - 800, sy = PY + c.cy - 450;
      const len = Math.hypot(sx, sy) || 1;
      c.fx = c.cx + (sx / len) * 1100;
      c.fy = c.cy + (sy / len) * 1100;
      c.r0 = c.cr * 3;
      c.tIn = 2.5 + R() * 0.45;
      c.tSnap = 3.85 + c.d * 0.055 + c.r * 0.04 + R() * 0.04;
      const dx = cardX(c.d) + CW / 2 - PUBX, dy = cardY(c.r) + CH / 2 - PUBY;
      c.tPub = 11.85 + (Math.hypot(dx, dy) / 1100) * 0.6;
    }
    const dragCard = cards.find((c) => c.drag);
    // Sam's Friday is where the open shift lands; it publishes like the cells around it.
    dragCard.tPub = 11.85 + (Math.hypot(cardX(4) + CW / 2 - PUBX, cardY(5) + CH / 2 - PUBY) / 1100) * 0.6;

    stage.innerHTML = stageMarkup(id).replace("<!--cards-->", cards.map(cardMarkup).join(""));
    viewport.appendChild(stage);

    const controls = document.createElement("div");
    controls.className = "nfh-controls";
    controls.innerHTML =
      `<button type="button" class="nfh-play" aria-label="Pause reel">${ICON_PAUSE}</button>` +
      '<div class="nfh-track" role="slider" tabindex="0" aria-label="Reel position" aria-valuemin="0" aria-valuemax="15" aria-valuenow="0">' +
      CHAPTERS.map(() => '<div class="nfh-seg"><i></i></div>').join("") +
      "</div>" +
      '<span class="nfh-tc"></span>';

    root.prepend(controls);
    root.prepend(viewport);

    const $ = (s) => stage.querySelector(s);
    const $$ = (s) => Array.from(stage.querySelectorAll(s));
    const el = {
      bgLight: $(".nfh-bg-light"),
      blobs: $$(".nfh-blob"),
      logo: $(".nfh-logo"),
      glow: $(".nfh-logo-glow"),
      sq: $(".nfh-logo-sq"),
      n: $(".nfh-logo-n"),
      dot: $(".nfh-logo-dot"),
      word: $(".nfh-word"),
      letters: $$(".nfh-word > span > span"),
      tagline: $(".nfh-tagline"),
      tags: $$(".nfh-tag"),
      panel: $(".nfh-panel"),
      pglow: $(".nfh-pglow"),
      pbg: $(".nfh-pbg"),
      sheen: $(".nfh-sheen"),
      phead: $(".nfh-phead"),
      chipN: $(".nfh-chip b"),
      chipT: $(".nfh-chip span"),
      badge: $(".nfh-badge"),
      pub: $(".nfh-pub"),
      pubB: $(".nfh-pub .b"),
      days: $$(".nfh-day"),
      names: $$(".nfh-name"),
      samHrs: $$(".nfh-name .hrs")[4],
      vlines: $$(".nfh-grid i.v"),
      hlines: $$(".nfh-grid i.h"),
      today: $(".nfh-grid i.today"),
      layAv: $(".nfh-layer-av"),
      layTo: $(".nfh-layer-to"),
      avcells: $$(".nfh-avcell"),
      tocell: $(".nfh-tocell"),
      toring: $(".nfh-tocell i"),
      labels: $$(".nfh-llabel"),
      cards: $$(".nfh-panel > .nfh-card"),
      tip: $(".nfh-tip"),
      cursor: $(".nfh-cursor"),
      ripple: $(".nfh-ripple"),
      netPaths: $$(".nfh-net path"),
      netDots: $$(".nfh-net circle"),
      chips: $$(".nfh-locchip"),
      phone: $(".nfh-phone"),
      phShift: $(".nfh-ph-shift"),
      phNew: $(".nfh-ph-shift em"),
      phNotes: $$(".nfh-ph-n"),
      fly: $(".nfh-fly"),
      stats: $(".nfh-stats"),
      statEls: $$(".nfh-stat"),
      statNums: $$(".nfh-stat b"),
      lts: $$(".nfh-lt"),
      canvas: $(".nfh-fx"),
      play: controls.querySelector(".nfh-play"),
      track: controls.querySelector(".nfh-track"),
      segs: Array.from(controls.querySelectorAll(".nfh-seg i")),
      tc: controls.querySelector(".nfh-tc"),
    };
    cards.forEach((c, i) => (c.el = el.cards[i]));
    const ctx = el.canvas.getContext("2d");
    const reveals = Array.from(root.querySelectorAll("[data-nfh-reveal]"));

    // Style writes are cached so unchanged properties never touch the DOM.
    function css(node, prop, val) {
      const c = node.__c || (node.__c = {});
      if (c[prop] !== val) {
        node.style[prop] = val;
        c[prop] = val;
      }
    }
    function cssVar(node, name, val) {
      const c = node.__c || (node.__c = {});
      if (c[name] !== val) {
        node.style.setProperty(name, val);
        c[name] = val;
      }
    }
    function text(node, val) {
      if (node.__t !== val) {
        node.textContent = val;
        node.__t = val;
      }
    }
    function cls(node, name, on) {
      const key = "cls:" + name;
      const c = node.__c || (node.__c = {});
      if (c[key] !== on) {
        node.classList.toggle(name, on);
        c[key] = on;
      }
    }

    /* ---------- layout ---------- */
    let wide = true, scale = 1, vis = { l: 0, r: W, t: 0, b: H };
    let wordW = 470;
    function measure() {
      wordW = el.word.offsetWidth || wordW;
    }
    function resize() {
      const w = root.clientWidth;
      wide = w >= 900;
      root.classList.toggle("is-wide", wide);
      const vw = viewport.clientWidth, vh = viewport.clientHeight;
      scale = Math.max(vw / W, vh / H);
      css(stage, "transform", `translate(${-W / 2 * scale}px, ${-H / 2 * scale}px) scale(${scale})`);
      const sw = vw / scale, sh = vh / scale;
      vis = { l: (W - sw) / 2, r: (W + sw) / 2, t: (H - sh) / 2, b: (H + sh) / 2 };
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.canvas.width = Math.round(W * scale * dpr);
      el.canvas.height = Math.round(H * scale * dpr);
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      measure();
      drawn = -1;
    }

    /* ---------- timeline pieces ---------- */
    function camAt(t) {
      const S6 = wide ? 0.76 : 0.9, TX6 = wide ? 345 : 0, TY6 = wide ? 25 : 10, RY6 = wide ? -16 : -6;
      return {
        s: kf(t, [[0, 1], [5.55, 1], [6.3, 0.92, E.inOutExpo], [6.65, 0.9, E.linear], [7.15, 1.22, E.inOutExpo], [8.98, 1.27, E.linear], [9.65, 0.72, E.inOutExpo], [11.0, 0.72], [11.5, 0.94, E.inOutExpo], [12.9, 0.94], [13.85, S6, E.inOutExpo]]),
        tx: kf(t, [[0, 0], [5.55, 0], [6.3, -40, E.inOutExpo], [6.65, -40], [7.15, -135, E.inOutExpo], [8.98, -150, E.linear], [9.65, -255, E.inOutExpo], [11.0, -255], [11.5, 0, E.inOutExpo], [12.9, 0], [13.85, TX6, E.inOutExpo]]),
        ty: kf(t, [[0, 0], [5.55, 0], [6.3, 10, E.inOutExpo], [6.65, 10], [7.15, 30, E.inOutExpo], [8.98, 24, E.linear], [9.65, 0, E.inOutExpo], [11.0, 0], [11.5, -24, E.inOutExpo], [12.9, -24], [13.85, TY6, E.inOutExpo]]),
        rx: kf(t, [[0, 0], [5.55, 0], [6.3, 54, E.inOutExpo], [6.65, 54], [7.15, 0, E.inOutExpo], [12.9, 0], [13.85, 5, E.inOutExpo]]),
        rz: kf(t, [[0, 0], [5.55, 0], [6.3, -33, E.inOutExpo], [6.65, -35, E.linear], [7.15, 0, E.inOutExpo]]),
        ry: kf(t, [[0, 0], [12.9, 0], [13.85, RY6, E.inOutExpo]]),
      };
    }
    const toStage = (lx, ly, c) => ({
      x: PX + 540 + (lx - 540) * c.s + c.tx,
      y: PY + 310 + (ly - 310) * c.s + c.ty,
    });
    const CUR_X = [[7.0, 1150], [7.45, FX + 12, E.inOutCubic], [7.95, FX + 6, E.inOutCubic], [8.3, FX + 6], [8.47, FX + 50, E.inOutSine], [8.65, FX + 14, E.outCubic], [8.98, FX + 80, E.inOutCubic], [11.22, PW - 320], [11.66, PUBX + 4, E.inOutCubic], [12.3, PUBX + 46, E.inOutCubic]];
    const CUR_Y = [[7.0, 650], [7.45, CY(0) + 10, E.inOutCubic], [7.95, CY(1) + 8, E.inOutCubic], [8.3, CY(1) + 8], [8.47, CY(3), E.inOutSine], [8.65, CY(5) + 10, E.outCubic], [8.98, CY(5) + 80, E.inOutCubic], [11.22, 330], [11.66, PUBY + 4, E.inOutCubic], [12.3, PUBY + 100, E.inOutCubic]];
    const cursorAt = (t) => ({ x: kf(t, CUR_X), y: kf(t, CUR_Y) });
    const grab = cursorAt(7.45);
    const GOX = cardX(4) - grab.x, GOY = cardY(0) - grab.y;
    const dropPos = (() => {
      const c = cursorAt(8.65 - 0.035);
      return { x: c.x + GOX, y: c.y + GOY };
    })();
    const liftK = (t, d) => E.inOutExpo(p(t, 5.6 + d * 0.025, 6.3 + d * 0.025)) * (1 - E.inOutExpo(p(t, 6.65, 7.12)));
    const ltK = (t, c) => ({
      bar: E.outExpo(p(t, c.t0, c.t0 + 0.3)) * (1 - E.inOutExpo(p(t, c.t1 - 0.12, c.t1))),
      box: E.inOutExpo(p(t, c.t0 + 0.08, c.t0 + 0.45)),
      out: E.inOutExpo(p(t, c.t1 - 0.3, c.t1 - 0.02)),
      txt: E.outExpo(p(t, c.t0 + 0.28, c.t0 + 0.8)),
      txtOut: E.inExpo(p(t, c.t1 - 0.42, c.t1 - 0.18)),
    });

    /* ---------- render ---------- */
    let lastTip = "";
    let drawn = -1;
    function render(t, idle) {
      const cam = camAt(t);

      // Light iris: the dark reel opens into the product's light theme.
      const iris = E.inOutExpo(p(t, 5.15, 5.85));
      const l = fmt(E.inOutCubic(p(t, 5.22, 5.6)), 3);
      cssVar(stage, "--l", l);
      css(el.bgLight, "clipPath", `circle(${fmt(iris * 1000)}px at 800px 450px)`);
      const blobK = E.outCubic(p(t, 12.9, 14.2));
      el.blobs.forEach((b, i) => {
        css(b, "opacity", fmt(blobK, 3));
        const a = idle * 0.25 + i * 2;
        css(b, "transform", `translate(${fmt(Math.sin(a) * 40)}px, ${fmt(Math.cos(a * 0.8) * 30)}px)`);
      });

      renderLogo(t);
      renderTags(t);
      renderPanel(t, cam, idle);
      renderPhone(t, cam, idle);
      renderStats(t);
      renderCaptions(t);
      renderCopy(t);
      renderFx(t, cam);
      renderControls(t);
    }

    function renderLogo(t) {
      const on = t < 2.8;
      css(el.logo, "visibility", on ? "visible" : "hidden");
      css(el.word, "visibility", t < 2.4 ? "visible" : "hidden");
      css(el.tagline, "visibility", t < 2.4 ? "visible" : "hidden");
      if (!on) return;
      const shift = -(40 + wordW) / 2;
      const lx = kf(t, [[1.12, 0], [1.48, shift, E.inOutExpo], [1.98, shift], [2.2, 0, E.inOutExpo]]);
      const zoom = kf(t, [[2.22, 1], [2.75, 70, E.inExpo]]);
      css(el.logo, "transformOrigin", `${(30 / 64) * 220}px ${(40 / 64) * 220}px`);
      css(el.logo, "transform", `translateX(${fmt(lx)}px) scale(${fmt(zoom, 3)})`);
      css(el.logo, "opacity", fmt(1 - p(t, 2.55, 2.72), 3));
      const sq = E.outBack(p(t, 0.8, 1.15));
      css(el.sq, "transform", `scale(${fmt(sq, 4)})`);
      css(el.sq, "opacity", fmt(p(t, 0.8, 0.9), 3));
      const draw = E.inOutCubic(p(t, 0.25, 1.05));
      el.n.style.strokeDasharray = "1";
      el.n.setAttribute("pathLength", "1");
      css(el.n, "strokeDashoffset", fmt(1 - draw, 4));
      css(el.n, "fillOpacity", fmt(E.outCubic(p(t, 0.95, 1.3)), 3));
      css(el.n, "strokeOpacity", fmt(1 - p(t, 1.2, 1.5) * 0.7, 3));
      const dotIn = E.outBack(p(t, 0.05, 0.3)), dotOut = E.inOutCubic(p(t, 0.3, 0.55));
      css(el.dot, "transform", `scale(${fmt(dotIn * (1 - dotOut) + dotOut * 3.2, 3)})`);
      css(el.dot, "opacity", fmt(Math.min(dotIn, 1 - dotOut), 3));
      const glow = p(t, 0.1, 0.6) * (0.6 + 0.4 * Math.sin(t * 6)) * (1 - p(t, 2.0, 2.4));
      css(el.glow, "opacity", fmt(glow + E.outExpo(p(t, 1.0, 1.2)) * (1 - p(t, 1.2, 1.8)) * 0.6, 3));

      // Wordmark: letters rise through a mask, then fall away.
      const wx = 800 + shift + 110 + 40;
      css(el.word, "transform", `translateX(${fmt(wx)}px)`);
      css(el.tagline, "transform", `translateX(${fmt(wx + 6)}px) translateY(${fmt((1 - E.outExpo(p(t, 1.42, 1.85))) * 16)}px)`);
      css(el.tagline, "opacity", fmt(p(t, 1.42, 1.7) * (1 - p(t, 1.9, 2.02)), 3));
      el.letters.forEach((s, i) => {
        const kin = E.outExpo(p(t, 1.2 + i * 0.04, 1.75 + i * 0.04));
        const kout = E.inExpo(p(t, 1.88 + i * 0.022, 2.1 + i * 0.022));
        css(s, "transform", `translateY(${fmt((1 - kin) * 110 - kout * 110)}%)`);
      });
    }

    function renderTags(t) {
      el.tags.forEach((tg, i) => {
        const d = TAGS[i];
        const t0 = 2.85 + i * 0.14;
        const kin = E.outBack(p(t, t0, t0 + 0.4));
        const kout = E.inExpo(p(t, 3.75 + i * 0.05, 4.05 + i * 0.05));
        const strike = E.inOutCubic(p(t, 3.5 + i * 0.06, 3.72 + i * 0.06));
        const vis = t > t0 && kout < 1;
        css(tg, "visibility", vis ? "visible" : "hidden");
        if (!vis) return;
        const fy = Math.sin(t * 2 + i) * 6;
        css(tg, "transform", `translate(${d.x}px, ${fmt(d.y + fy + kout * 30)}px) rotate(${d.r}deg) scale(${fmt(kin * (1 - kout * 0.3), 3)})`);
        css(tg, "opacity", fmt(Math.min(1, kin) * (1 - kout), 3));
        cssVar(tg, "--strike", fmt(strike, 3));
      });
    }

    function renderPanel(t, cam, idle) {
      const idleK = clamp(idle / 1.5);
      const fty = Math.sin(idle * 0.8) * 5 * idleK;
      const fry = Math.sin(idle * 0.45) * 1.6 * idleK;
      css(el.panel, "transform",
        `translate3d(${fmt(cam.tx)}px, ${fmt(cam.ty + fty)}px, 0) rotateX(${fmt(cam.rx, 2)}deg) rotateY(${fmt(cam.ry + fry, 2)}deg) rotateZ(${fmt(cam.rz, 2)}deg) scale(${fmt(cam.s, 4)})`);

      const lt = Number(stage.style.getPropertyValue("--l") || 0);
      css(el.pbg, "opacity", fmt(E.outCubic(p(t, 3.55, 4.05)), 3));
      css(el.pglow, "opacity", fmt(E.outCubic(p(t, 3.7, 4.4)) * (1 - lt), 3));
      css(el.sheen, "transform", `translateX(${fmt(lerp(-400, 1500, E.inOutCubic(p(t, 4.8, 5.3))))}px) rotate(18deg)`);
      css(el.phead, "opacity", fmt(E.outCubic(p(t, 3.8, 4.2)), 3));
      el.vlines.forEach((v, i) => css(v, "transform", `scaleY(${fmt(E.outExpo(p(t, 3.55 + i * 0.03, 4.15 + i * 0.03)), 3)})`));
      el.hlines.forEach((v, i) => css(v, "transform", `scaleX(${fmt(E.outExpo(p(t, 3.6 + i * 0.03, 4.25 + i * 0.03)), 3)})`));
      css(el.today, "opacity", fmt(p(t, 4.0, 4.4), 3));
      el.days.forEach((d, i) => {
        const k = E.outExpo(p(t, 3.75 + i * 0.04, 4.25 + i * 0.04));
        css(d, "opacity", fmt(k, 3));
        css(d, "transform", `translateY(${fmt((1 - k) * 10)}px)`);
      });
      el.names.forEach((n, i) => {
        const k = E.outExpo(p(t, 3.8 + i * 0.05, 4.35 + i * 0.05));
        css(n, "opacity", fmt(k, 3));
        css(n, "transform", `translateX(${fmt((1 - k) * -24)}px)`);
      });

      // Exploded view: the layers that make a schedule separate in depth.
      const lift = liftK(t, 3);
      css(el.layAv, "transform", `translateZ(${fmt(1 + lift * 55)}px)`);
      css(el.layTo, "transform", `translateZ(${fmt(2 + lift * 100)}px)`);
      const cellIn = E.outBack(p(t, 4.3, 4.65));
      el.avcells.forEach((a, i) => {
        const k = clamp(E.outBack(p(t, 5.65 + i * 0.05, 6.0 + i * 0.05)), 0, 1.2);
        css(a, "opacity", fmt(clamp(k), 3));
        css(a, "transform", `scale(${fmt(0.85 + 0.15 * k, 3)})`);
      });
      css(el.tocell, "opacity", fmt(clamp(cellIn), 3));
      css(el.tocell, "transform", `scale(${fmt(0.7 + 0.3 * cellIn, 3)})`);
      const conflict = p(t, 7.95, 8.35);
      const pulse = conflict > 0 && conflict < 1 ? Math.abs(Math.sin(conflict * Math.PI * 3)) : 0;
      css(el.toring, "opacity", fmt(pulse, 3));
      css(el.toring, "transform", `scale(${fmt(1 + pulse * 0.08, 3)})`);
      const zs = [0, 55, 100, 150];
      el.labels.forEach((lb, i) => {
        const k = E.outExpo(p(t, 5.95 + i * 0.07, 6.3 + i * 0.07)) * (1 - E.inOutExpo(p(t, 6.55, 6.8)));
        css(lb, "opacity", fmt(k, 3));
        css(lb, "transform", `translate3d(${fmt((1 - k) * 30)}px, 0, ${zs[i] * lift + 4}px)`);
      });

      // Header state changes.
      const assigned = t >= 8.65;
      text(el.chipN, assigned ? "1" : "2");
      text(el.chipT, assigned ? "open shift" : "open shifts");
      const chipPop = E.outBack(p(t, 8.65, 8.95));
      css(el.chipN, "transform", `translateY(${fmt((1 - chipPop) * -8 * (assigned ? 1 : 0))}px)`);
      text(el.samHrs, assigned ? "30 hrs" : "24 hrs");
      const pressed = kf(t, [[11.7, 1], [11.75, 0.93], [11.92, 1, E.outBack]]);
      css(el.pub, "transform", `scale(${fmt(pressed, 3)})`);
      css(el.pubB, "clipPath", `circle(${fmt(E.outCubic(p(t, 11.76, 12.1)) * 75)}% at 50% 50%)`);
      const badgeOut = E.inOutCubic(p(t, 11.78, 12.0));
      css(el.badge, "opacity", fmt(1 - badgeOut, 3));
      css(el.badge, "transform", `scale(${fmt(1 - badgeOut * 0.4, 3)})`);

      renderCards(t, lift, idle, idleK);
      renderCursor(t, cam);
    }

    function renderCards(t, _lift, idle, idleK) {
      for (const c of cards) {
        const gx = cardX(c.d), gy = cardY(c.r);
        let x, y, r = 0, sc = 1, o = 1, z;
        if (t < c.tIn) {
          o = 0; x = c.fx; y = c.fy; r = c.r0; sc = c.cs;
        } else {
          const ki = E.outExpo(p(t, c.tIn, c.tIn + 0.85));
          const drift = 1 - p(t, c.tSnap, c.tSnap + 0.25);
          const cx = lerp(c.fx, c.cx, ki) + Math.sin(t * 1.7 + c.seed * 9) * 14 * drift;
          const cy = lerp(c.fy, c.cy, ki) + Math.cos(t * 1.3 + c.seed * 7) * 10 * drift;
          const cr = lerp(c.r0, c.cr, ki) + Math.sin(t * 1.1 + c.seed * 5) * 4 * drift;
          const ks = E.spring(p(t, c.tSnap, c.tSnap + 0.8));
          x = lerp(cx, gx, ks); y = lerp(cy, gy, ks); r = lerp(cr, 0, ks); sc = lerp(c.cs, 1, ks);
          o = p(t, c.tIn, c.tIn + 0.2);
        }
        z = 3 + liftK(t, c.d) * 150;
        let lifted = false;
        if (c.drag && t >= 7.45) {
          if (t < 8.65) {
            const cur = cursorAt(t - 0.035), prev = cursorAt(t - 0.07);
            const kb = E.outCubic(p(t, 7.45, 7.6));
            x = lerp(gx, cur.x + GOX, kb);
            y = lerp(gy, cur.y + GOY, kb);
            r = clamp(((cur.x - prev.x) / 0.035) * 0.025, -14, 14);
            const sh = p(t, 7.95, 8.3);
            if (sh > 0 && sh < 1) x += Math.sin(sh * Math.PI * 8) * 10 * (1 - sh);
            sc = 1 + 0.07 * E.outBack(p(t, 7.45, 7.62));
            z = 14;
            lifted = true;
          } else {
            const k = E.spring(p(t, 8.65, 9.25));
            const prev = cursorAt(8.65 - 0.07), cur = cursorAt(8.65 - 0.035);
            const r0 = clamp(((cur.x - prev.x) / 0.035) * 0.025, -14, 14);
            x = lerp(dropPos.x, cardX(4), k); y = lerp(dropPos.y, cardY(5), k);
            r = lerp(r0, 0, k); sc = lerp(1.07, 1, k); z = lerp(14, 3, k);
            lifted = k < 0.6;
          }
          cls(c.el, "is-open", t < 8.65);
          const span = c.el.querySelector("span");
          text(span, t < 8.65 ? "Open · Server" : "Server");
        }
        if (idle > 0) z += (Math.sin(idle * 1.3 + c.seed * 12) * 0.5 + 0.5) * 12 * idleK;
        cls(c.el, "is-lifted", lifted);
        css(c.el, "transform", `translate3d(${fmt(x)}px, ${fmt(y)}px, ${fmt(z)}px) rotate(${fmt(r, 2)}deg) scale(${fmt(sc, 3)})`);
        css(c.el, "opacity", fmt(o, 3));
        // Publish wave.
        const pk = p(t, c.tPub, c.tPub + 0.4);
        cls(c.el, "is-pub", t >= c.tPub);
        const chk = c.el.children[2], flash = c.el.children[3];
        css(chk, "transform", `scale(${fmt(E.outBack(pk), 3)})`);
        css(flash, "opacity", fmt(pk > 0 && pk < 1 ? 1 - pk : 0, 3));
      }
    }

    function renderCursor(t, cam) {
      const cur = cursorAt(t);
      const o = kf(t, [[6.98, 0], [7.12, 1], [8.75, 1], [8.98, 0], [11.2, 0], [11.34, 1], [12.05, 1], [12.3, 0]]);
      const press = kf(t, [[7.4, 1], [7.47, 0.84], [8.62, 0.84], [8.7, 1, E.outBack], [11.66, 1], [11.71, 0.8], [11.88, 1, E.outBack]]);
      css(el.cursor, "visibility", o > 0 ? "visible" : "hidden");
      if (o > 0) {
        css(el.cursor, "opacity", fmt(o, 3));
        css(el.cursor, "transform", `translate3d(${fmt(cur.x)}px, ${fmt(cur.y)}px, 30px) scale(${fmt(press / cam.s, 3)})`);
      }
      const rp = Math.max(p(t, 7.45, 7.85) * (t < 7.85 ? 1 : 0), p(t, 11.71, 12.1) * (t < 12.1 ? 1 : 0), p(t, 8.65, 9.0) * (t < 9.0 ? 1 : 0));
      css(el.ripple, "opacity", fmt(rp > 0 ? 1 - rp : 0, 3));
      css(el.ripple, "transform", `scale(${fmt(0.4 + E.outCubic(rp) * 1.6, 3)})`);

      // Tooltip.
      let tip = "", tx = 0, ty = 0, k = 0;
      if (t >= 7.98 && t < 8.4) {
        tip = "to";
        tx = cellX(5) + 4; ty = rowY(1) + 4;
        k = E.outBack(p(t, 7.98, 8.2)) * (1 - E.inOutCubic(p(t, 8.28, 8.4)));
      } else if (t >= 8.72 && t < 9.2) {
        tip = "ok";
        tx = cellX(5) + 4; ty = rowY(5) + 6;
        k = E.outBack(p(t, 8.72, 8.95)) * (1 - E.inOutCubic(p(t, 9.0, 9.2)));
      }
      if (tip !== lastTip) {
        lastTip = tip;
        if (tip === "to")
          el.tip.innerHTML = '<i style="--c:#d4162a"></i><div>Maria has approved time off<small>Fri, Oct 9 · Shift can’t be assigned</small></div>';
        else if (tip === "ok")
          el.tip.innerHTML = '<i style="--c:#087f5b"></i><div>Assigned to Sam<small>Available · no conflicts · 30 hrs</small></div>';
      }
      css(el.tip, "visibility", tip ? "visible" : "hidden");
      if (tip) {
        css(el.tip, "opacity", fmt(clamp(k), 3));
        css(el.tip, "transform", `translate3d(${fmt(tx)}px, ${fmt(ty)}px, 40px) scale(${fmt(Math.max(0, k) / cam.s * 1.05, 3)})`);
      }
    }

    function renderPhone(t, cam, idle) {
      const inK = E.outExpo(p(t, 9.15, 9.95));
      const outK = E.inExpo(p(t, 10.98, 11.4));
      const on = inK > 0 && outK < 1;
      css(el.phone, "visibility", on ? "visible" : "hidden");
      const fl = Math.sin((t - 9.2) * 1.6) * 6;
      if (on) {
        css(el.phone, "opacity", fmt(Math.min(1, inK * 2) * (1 - outK), 3));
        css(el.phone, "transform",
          `translate3d(${fmt((1 - inK) * 520 + outK * 640)}px, ${fmt((1 - inK) * 140 + fl)}px, 0) rotateY(${fmt(lerp(-38, -12, inK) - outK * 30, 2)}deg) rotateZ(${fmt((1 - inK) * 8, 2)}deg)`);
        const sk = E.outBack(p(t, 10.05, 10.35));
        css(el.phShift, "opacity", fmt(clamp(sk), 3));
        css(el.phShift, "transform", `scale(${fmt(0.9 + 0.1 * sk, 3)})`);
        css(el.phNew, "transform", `scale(${fmt(E.outBack(p(t, 10.25, 10.5)), 3)})`);
        el.phNotes.forEach((n, i) => {
          const k = E.springSoft(p(t, 10.3 + i * 0.18, 10.95 + i * 0.18));
          css(n, "opacity", fmt(clamp(k * 1.5), 3));
          css(n, "transform", `translateY(${fmt((1 - k) * -18)}px)`);
        });
      }

      // Flying card: grid cell -> phone along an arc.
      const fk = p(t, 9.5, 10.15);
      const fon = fk > 0 && fk < 1;
      css(el.fly, "visibility", fon ? "visible" : "hidden");
      if (fon) {
        const e = E.inOutCubic(fk);
        const a = toStage(cardX(4) + CW / 2, cardY(5) + CH / 2, cam);
        const b = { x: 1215, y: 360 + fl };
        const cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y) - 260;
        const x = (1 - e) * (1 - e) * a.x + 2 * (1 - e) * e * cx + e * e * b.x;
        const y = (1 - e) * (1 - e) * a.y + 2 * (1 - e) * e * cy + e * e * b.y;
        const s = lerp(cam.s, 1.4, e);
        css(el.fly, "opacity", fmt(1 - p(fk, 0.8, 1), 3));
        css(el.fly, "transform", `translate(${fmt(x - CW / 2)}px, ${fmt(y - CH / 2)}px) rotate(${fmt(Math.sin(e * Math.PI) * -12, 2)}deg) scale(${fmt(s, 3)})`);
      }

      // Locations network.
      const netIn = p(t, 9.7, 10.4), netOut = p(t, 10.95, 11.3);
      const netOn = netIn > 0 && netOut < 1;
      LOCS.forEach((loc, i) => {
        const chip = el.chips[i];
        const k = E.outBack(p(t, 9.7 + i * 0.1, 10.1 + i * 0.1));
        css(chip, "visibility", netOn ? "visible" : "hidden");
        css(chip, "opacity", fmt(clamp(k) * (1 - netOut), 3));
        css(chip, "transform", `translateY(${fmt((1 - k) * 30 + netOut * 20)}px) scale(${fmt(0.8 + 0.2 * k, 3)})`);
        const path = el.netPaths[i];
        const sx = loc.x + 80, sy = loc.y;
        const ex = 1078 + 0, ey = 520 + i * 34 + fl;
        if (netOn) {
          const d = `M${sx} ${sy} C ${sx + 40} ${sy - 170}, ${ex - 260} ${ey + 40}, ${ex} ${ey}`;
          if (path.__d !== d) {
            path.setAttribute("d", d);
            path.__d = d;
          }
        }
        css(path, "visibility", netOn ? "visible" : "hidden");
        css(path, "strokeDashoffset", fmt(1 - E.inOutCubic(p(t, 9.85 + i * 0.1, 10.45 + i * 0.1)), 3));
        css(path, "opacity", fmt(1 - netOut, 3));
        for (let j = 0; j < 2; j++) {
          const dot = el.netDots[i * 2 + j];
          const ph = ((t - 10.3 - j * 0.35 - i * 0.12) / 0.7) % 1;
          const show = netOn && t > 10.3 + j * 0.35 + i * 0.12 && ph >= 0;
          css(dot, "visibility", show ? "visible" : "hidden");
          if (show && path.getTotalLength) {
            const len = path.getTotalLength();
            const pt = path.getPointAtLength(E.inOutSine(ph) * len);
            dot.setAttribute("cx", fmt(pt.x));
            dot.setAttribute("cy", fmt(pt.y));
            css(dot, "opacity", fmt(Math.sin(ph * Math.PI) * (1 - netOut), 3));
          }
        }
      });
    }

    function renderStats(t) {
      const on = t > 11.95 && t < 13.4;
      css(el.stats, "visibility", on ? "visible" : "hidden");
      if (!on) return;
      css(el.stats, "left", `${fmt(Math.min(W - 72, vis.r - 32) - el.stats.offsetWidth)}px`);
      css(el.stats, "top", `${fmt(Math.max(28, vis.t + 28))}px`);
      el.statEls.forEach((s, i) => {
        const k = E.outExpo(p(t, 12.0 + i * 0.09, 12.6 + i * 0.09));
        const out = E.inExpo(p(t, 12.95 + i * 0.05, 13.3 + i * 0.05));
        css(s, "opacity", fmt(k * (1 - out), 3));
        css(s, "transform", `translateY(${fmt((1 - k) * -40 - out * 20)}px)`);
        const target = Number(el.statNums[i].dataset.n);
        const from = i === 2 ? 3 : 0;
        const v = Math.round(lerp(from, target, E.outCubic(p(t, 12.05 + i * 0.09, 12.75 + i * 0.09))));
        text(el.statNums[i], String(v));
      });
    }

    function renderCaptions(t) {
      const ls = wide ? 1 : 1.7;
      CAPTIONS.forEach((c, i) => {
        const node = el.lts[i];
        const on = t > c.t0 && t < c.t1;
        css(node, "visibility", on ? "visible" : "hidden");
        if (!on) return;
        const k = ltK(t, c);
        const x = Math.max(72, vis.l + 28);
        const y = c.at === "tl" ? Math.max(64, vis.t + 40) : Math.min(H - 64, vis.b - 36) - 76 * ls;
        css(node, "transform", `translate(${fmt(x)}px, ${fmt(y)}px) scale(${ls})`);
        css(node.children[0], "transform", `scaleY(${fmt(k.bar, 3)})`);
        const box = node.children[1];
        css(box, "transformOrigin", k.out > 0 ? "right center" : "left center");
        css(box, "transform", `scaleX(${fmt(k.out > 0 ? 1 - k.out : k.box, 3)})`);
        css(box.firstChild, "transform", `translateY(${fmt((1 - k.txt) * 62 - k.txtOut * 62)}px)`);
      });
    }

    function renderCopy(t) {
      reveals.forEach((node, i) => {
        const t0 = 13.0 + i * 0.11;
        const k = E.outExpo(p(t, t0, t0 + 1.0));
        css(node, "visibility", k > 0 ? "visible" : "hidden");
        if (node.dataset.nfhReveal === "mask") {
          css(node, "transform", `translateY(${fmt((1 - k) * 112)}%) skewY(${fmt((1 - k) * 7, 2)}deg)`);
        } else {
          css(node, "opacity", fmt(k, 3));
          css(node, "transform", `translateY(${fmt((1 - k) * 28)}px)`);
        }
      });
    }

    function renderFx(t, cam) {
      // Skip clearing and redrawing when nothing on the canvas can be visible.
      const active = t < 5.4 || (t > 11.68 && t < 12.9);
      if (!active) {
        if (drawn !== 0) {
          ctx.clearRect(0, 0, W, H);
          drawn = 0;
        }
        return;
      }
      drawn = 1;
      ctx.clearRect(0, 0, W, H);
      const dark = 1 - p(t, 5.15, 5.6);

      // Dot field with a ripple that rolls out from the centre.
      if (t < 5.4) {
        const R0 = (t - 0.15) * 950;
        const fade = (0.35 + 0.65 * p(t, 0, 0.4)) * dark;
        ctx.fillStyle = "#5ee6b4";
        for (let gy = 26; gy < H; gy += 44)
          for (let gx = 22; gx < W; gx += 44) {
            const d = Math.hypot(gx - 800, gy - 450);
            const wave = t < 2.4 ? Math.exp(-(((d - R0) / 70) ** 2)) : 0;
            const a = (0.05 + 0.5 * wave) * fade;
            if (a < 0.01) continue;
            ctx.globalAlpha = a;
            const s = 1.4 + wave * 1.8;
            ctx.fillRect(gx - s / 2, gy - s / 2, s, s);
          }
      }

      // Converging particles that become the logo.
      if (t < 1.35) {
        const PR = rng(7);
        ctx.fillStyle = "#b6ffe2";
        for (let i = 0; i < 170; i++) {
          const a0 = PR() * Math.PI * 2, r0 = 260 + PR() * 700, dl = PR() * 0.3, sz = 1 + PR() * 2.2;
          const k = E.inOutCubic(p(t, 0.05 + dl, 1.1));
          const a = a0 + (1 - k) * 2.6;
          const r = r0 * (1 - k) + 6;
          ctx.globalAlpha = p(t, 0, 0.3) * (1 - p(t, 0.95 + dl * 0.5, 1.25)) * 0.9;
          ctx.beginPath();
          ctx.arc(800 + Math.cos(a) * r, 450 + Math.sin(a) * r * 0.75, sz, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Burst when the mark locks in.
      if (t > 1.0 && t < 2.0) {
        const BR = rng(11), k = E.outExpo(p(t, 1.0, 1.9));
        ctx.strokeStyle = "#5ee6b4";
        ctx.lineWidth = 2;
        for (let i = 0; i < 56; i++) {
          const a = (i / 56) * Math.PI * 2 + BR() * 0.1, sp = 0.6 + BR() * 0.6;
          const r = 140 + k * 520 * sp;
          ctx.globalAlpha = (1 - k) * 0.8;
          ctx.beginPath();
          ctx.moveTo(800 + Math.cos(a) * r, 450 + Math.sin(a) * r);
          ctx.lineTo(800 + Math.cos(a) * (r + 14 + 30 * (1 - k)), 450 + Math.sin(a) * (r + 14 + 30 * (1 - k)));
          ctx.stroke();
        }
        ctx.globalAlpha = (1 - k) * 0.5;
        ctx.lineWidth = 3 * (1 - k);
        ctx.beginPath();
        ctx.arc(800, 450, 130 + k * 420, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Warp streaks while the camera flies through the mark.
      if (t > 2.2 && t < 2.95) {
        const k = p(t, 2.2, 2.95), WR = rng(23);
        const ox = 800 + (30 / 64) * 220 - 110, oy = 450 + (40 / 64) * 220 - 110;
        ctx.lineCap = "round";
        for (let i = 0; i < 140; i++) {
          const a = WR() * Math.PI * 2, r0 = 30 + WR() * 650, w = 0.6 + WR() * 1.8;
          const g = E.inExpo(clamp(k * 1.15));
          const r = r0 * (1 + g * 5);
          const len = 10 + g * 340 * (0.4 + WR());
          ctx.strokeStyle = i % 3 ? "#d9fff0" : "#5ee6b4";
          ctx.lineWidth = w;
          ctx.globalAlpha = Math.sin(Math.PI * k) * 0.85;
          ctx.beginPath();
          ctx.moveTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r);
          ctx.lineTo(ox + Math.cos(a) * (r + len), oy + Math.sin(a) * (r + len));
          ctx.stroke();
        }
      }
      // Sparks as each card snaps into the grid.
      if (t > 3.9 && t < 5.4) {
        ctx.strokeStyle = "#5ee6b4";
        ctx.lineWidth = 1.6;
        for (const c of cards) {
          const tl = c.tSnap + 0.22, age = (t - tl) / 0.45;
          if (age <= 0 || age >= 1) continue;
          const cx = PX + cardX(c.d) + CW / 2, cy = PY + cardY(c.r) + CH / 2;
          for (let j = 0; j < 6; j++) {
            const a = j * (Math.PI / 3) + c.seed * 6;
            const r1 = 50 + E.outCubic(age) * 34, r0 = r1 - 12 * (1 - age);
            ctx.globalAlpha = (1 - age) * 0.9 * dark;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.6);
            ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.6);
            ctx.stroke();
          }
        }
      }
      // Publish shockwave.
      if (t > 11.68 && t < 12.9) {
        const b = toStage(PUBX, PUBY, cam);
        for (let j = 0; j < 3; j++) {
          const k = p(t, 11.74 + j * 0.1, 12.7 + j * 0.1);
          if (k <= 0 || k >= 1) continue;
          ctx.globalAlpha = (1 - k) * (0.55 - j * 0.12);
          ctx.strokeStyle = "#087f5b";
          ctx.lineWidth = 4 * (1 - k) + 0.5;
          ctx.beginPath();
          ctx.arc(b.x, b.y, E.outExpo(k) * (1100 - j * 200), 0, Math.PI * 2);
          ctx.stroke();
        }
        const SR = rng(31), k = p(t, 11.74, 12.4);
        ctx.fillStyle = "#087f5b";
        for (let i = 0; i < 28; i++) {
          const a = SR() * Math.PI * 2, sp = 60 + SR() * 160;
          const r = E.outExpo(k) * sp;
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.beginPath();
          ctx.arc(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 2.2 * (1 - k) + 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    function chapterAt(t) {
      let i = 0;
      while (i + 1 < CHAPTERS.length && t >= CHAPTERS[i + 1][0]) i++;
      return i;
    }
    function renderControls(t) {
      el.segs.forEach((s, i) => {
        const a = CHAPTERS[i][0], b = i + 1 < CHAPTERS.length ? CHAPTERS[i + 1][0] : DUR;
        css(s, "transform", `scaleX(${fmt(p(t, a, b), 4)})`);
      });
      const ci = chapterAt(Math.min(t, DUR - 0.001));
      const tc = `<b>${String(ci + 1).padStart(2, "0")}</b> ${CHAPTERS[ci][1].padEnd(7, " ")} ${fmt(Math.min(t, DUR), 1).padStart(4, "0")}s`;
      if (el.tc.__t !== tc) {
        el.tc.innerHTML = tc;
        el.tc.__t = tc;
      }
      const now = fmt(Math.min(t, DUR), 1);
      if (el.track.__v !== now) {
        el.track.setAttribute("aria-valuenow", now);
        el.track.setAttribute("aria-valuetext", `${now} seconds, ${CHAPTERS[ci][1]}`);
        el.track.__v = now;
      }
    }

    // Segment widths follow chapter lengths.
    el.segs.forEach((s, i) => {
      const a = CHAPTERS[i][0], b = i + 1 < CHAPTERS.length ? CHAPTERS[i + 1][0] : DUR;
      s.parentElement.style.flex = String(b - a);
    });

    /* ---------- clock ---------- */
    const state = { t: reduce ? DUR : 0, playing: !reduce, last: 0, endAt: reduce ? performance.now() : 0, visible: true, raf: 0 };
    function setPlaying(on) {
      state.playing = on;
      el.play.innerHTML = on ? ICON_PAUSE : state.t >= DUR ? ICON_REPLAY : ICON_PLAY;
      el.play.setAttribute("aria-label", on ? "Pause reel" : state.t >= DUR ? "Replay reel" : "Play reel");
    }
    function seek(t) {
      state.t = clamp(t, 0, DUR);
      if (state.t >= DUR) state.endAt = performance.now();
      if (!state.playing) setPlaying(false);
    }
    function frame(now) {
      state.raf = 0;
      const dt = state.last ? Math.min(0.05, (now - state.last) / 1000) : 0;
      state.last = now;
      if (state.playing) {
        state.t += dt;
        if (state.t >= DUR) {
          if (loop) state.t = 0;
          else {
            state.t = DUR;
            state.endAt = now;
            setPlaying(false);
          }
        }
      }
      const idle = state.t >= DUR && !reduce ? (now - state.endAt) / 1000 : 0;
      render(state.t, idle);
      schedule();
    }
    function schedule() {
      const needed = state.visible && !document.hidden && (state.playing || (state.t >= DUR && !reduce));
      if (needed && !state.raf) state.raf = requestAnimationFrame(frame);
      if (!needed) state.last = 0;
    }
    function kick() {
      if (!state.raf) {
        state.last = 0;
        render(state.t, 0);
        schedule();
      }
    }

    el.play.addEventListener("click", () => {
      if (state.t >= DUR) state.t = 0;
      setPlaying(!state.playing);
      kick();
    });
    function seekFromPointer(e) {
      const r = el.track.getBoundingClientRect();
      seek(((e.clientX - r.left) / r.width) * DUR);
      render(state.t, 0);
    }
    let scrubbing = false, wasPlaying = false;
    el.track.addEventListener("pointerdown", (e) => {
      scrubbing = true;
      wasPlaying = state.playing;
      setPlaying(false);
      el.track.setPointerCapture(e.pointerId);
      seekFromPointer(e);
    });
    el.track.addEventListener("pointermove", (e) => scrubbing && seekFromPointer(e));
    const endScrub = () => {
      if (!scrubbing) return;
      scrubbing = false;
      if (wasPlaying && state.t < DUR) setPlaying(true);
      else setPlaying(false);
      kick();
    };
    el.track.addEventListener("pointerup", endScrub);
    el.track.addEventListener("pointercancel", endScrub);
    el.track.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 2 : 0.5;
      if (e.key === "ArrowRight") seek(state.t + step);
      else if (e.key === "ArrowLeft") seek(state.t - step);
      else if (e.key === "Home") seek(0);
      else if (e.key === "End") seek(DUR);
      else if (e.key === " " || e.key === "Enter") {
        setPlaying(!state.playing);
      } else return;
      e.preventDefault();
      render(state.t, 0);
      kick();
    });
    // Keyboard users reaching the copy should not wait for the reel.
    const copy = root.querySelector(".nfh-copy");
    if (copy)
      copy.addEventListener("focusin", () => {
        if (state.t < 13.2) {
          seek(DUR);
          setPlaying(false);
          kick();
        }
      });
    root.querySelectorAll("[data-nfh-replay]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.preventDefault();
        state.t = 0;
        setPlaying(true);
        kick();
      }),
    );

    new ResizeObserver(() => {
      resize();
      render(state.t, 0);
    }).observe(root);
    if ("IntersectionObserver" in window)
      new IntersectionObserver((entries) => {
        state.visible = entries[0].isIntersecting;
        schedule();
      }).observe(root);
    document.addEventListener("visibilitychange", schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => measure());

    resize();
    setPlaying(state.playing);
    render(state.t, 0);
    schedule();

    const api = {
      play: () => { if (state.t >= DUR) state.t = 0; setPlaying(true); kick(); },
      pause: () => { setPlaying(false); },
      seek: (t) => { seek(t); render(state.t, 0); },
      get time() { return state.t; },
      duration: DUR,
    };
    root.__nfh = api;
    return api;
  }

  window.NewforkHero = { mount };
  const boot = () => document.querySelectorAll("[data-newfork-hero]").forEach(mount);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
