// The PAGES page around one screen: what the screen is, who opens it, example
// scenarios, and the real app twice (desktop 1440 × 900 and phone 390 × 844),
// kept in step through the shell. Layout follows the "Important Date Drawer
// Designs" page, with a readable desktop: it takes the full width when the two
// do not fit side by side, and "100%" shows it at real size.
// Usage (from build-pages.mjs): shellPage(screen, { sha, built, indexUrl })

const esc = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const roleNames = { owner: "Owner · Mert Tepebas", manager: "Manager · Rachel Adams (Downtown)", employee: "Employee · Maria Lopez" };

export function shellPage(screen, { sha, built, indexUrl }) {
  const roles = screen.signedOut ? [] : ["owner", "manager", "employee"];
  const data = {
    no: screen.no,
    roles: screen.roles,
    signedOut: !!screen.signedOut,
    scenarios: screen.scenarios.map(({ id, label, role }) => ({ id, label, role: role ?? null })),
  };
  const rolePills = roles.map((role) => {
    const ok = screen.roles.includes(role);
    return `<button type="button" data-g="role" data-k="${role}"${ok ? "" : ` disabled title="Bu rol bu ekranı uygulamada açamaz."`}>${esc(roleNames[role])}</button>`;
  }).join("");
  const scenarioPills = screen.scenarios.map((one) =>
    `<button type="button" data-g="sc" data-k="${esc(one.id)}">${esc(one.label)}</button>`).join("");
  // The Artifact viewer wraps the page in its own document skeleton.
  return `<title>${esc(screen.no)} ${esc(screen.title)} · PAGES</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap">
<style>
/* Light only, like the app; values are the app's --theme-* tokens. */
:root {
  color-scheme: light;
  --page: #f4f5f3; --surface: #ffffff; --soft2: #f0f3f1; --text: #17221e; --body: #1d2525;
  --muted: #66716c; --muted-strong: #5f6b66; --border: #dce3df; --border-strong: #cbd4d0;
  --accent: #176954; --focus: #177a64; --bezel: #1d2525; --on-dark: #ffffff;
  --warn-soft: #fff7e2; --warn-text: #5f491f; --warn-border: #bf872d;
  --font: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--page); }
body { color: var(--text); font-family: var(--font); font-size: 14px; }
button { font: inherit; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.wrap { max-width: 1920px; margin: 0 auto; padding: 24px 24px 64px; display: grid; gap: 18px; }
@media (max-width: 600px) { .wrap { padding-inline: 16px; } }
.top { display: grid; gap: 10px; }
.eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; color: var(--accent); text-transform: uppercase; }
h1 { font-size: 26px; font-weight: 700; letter-spacing: -0.015em; margin: 0; display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
h1 .no { min-width: 44px; height: 34px; padding: 0 9px; border-radius: 8px; background: var(--text); color: var(--on-dark); display: inline-grid; place-items: center; font-size: 16px; font-variant-numeric: tabular-nums; }
.lede { margin: 0; color: var(--body); line-height: 1.6; max-width: 90ch; }
.facts { margin: 0; padding: 12px 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; max-width: 120ch; font-size: 13.5px; line-height: 1.5; }
.facts dt { font-weight: 650; color: var(--muted-strong); }
.facts dd { margin: 0; color: var(--body); min-width: 0; overflow-wrap: anywhere; }
.facts code { font: 12.5px ui-monospace, Consolas, monospace; background: var(--soft2); padding: 1px 6px; border-radius: 5px; }
.facts a { color: var(--accent); font-weight: 600; }
@media (max-width: 600px) { .facts { grid-template-columns: 1fr; } .facts dd { margin-bottom: 6px; } }
.controls { display: flex; flex-wrap: wrap; gap: 12px 28px; align-items: center; }
.ctl { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ctl-label { font-size: 11.5px; font-weight: 650; color: var(--muted-strong); text-transform: uppercase; letter-spacing: 0.05em; }
.pills { display: inline-flex; flex-wrap: wrap; padding: 3px; gap: 3px; background: var(--surface); border: 1px solid var(--border); border-radius: 9px; }
.pills button { min-height: 32px; padding: 0 12px; border: 0; border-radius: 6px; background: transparent; font-size: 13px; font-weight: 600; color: var(--muted-strong); cursor: pointer; }
.pills button:hover:not(:disabled):not([aria-pressed="true"]) { background: var(--soft2); }
.pills button[aria-pressed="true"] { background: var(--text); color: var(--on-dark); }
.pills button:disabled { cursor: not-allowed; opacity: 0.45; }
.restart { min-height: 32px; padding: 0 12px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface); color: var(--text); font-size: 13px; font-weight: 600; cursor: pointer; }
.restart:hover { background: var(--soft2); }
.stagebox { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px; min-width: 0; }
@media (max-width: 600px) { .stagebox { padding: 10px; } }
.frames { display: flex; gap: 24px; align-items: flex-start; min-width: 0; }
.frames[data-layout="stack"] { flex-direction: column; }
.fcol { display: grid; gap: 8px; min-width: 0; }
.desk-col { flex: 1 1 auto; }
.frames[data-layout="stack"] .desk-col { width: 100%; }
.phone-col { flex: 0 0 auto; }
.flabel { font-size: 11.5px; font-weight: 650; color: var(--muted-strong); text-transform: uppercase; letter-spacing: 0.05em; display: flex; gap: 10px; align-items: center; }
.flabel span { text-transform: none; letter-spacing: 0; font-weight: 500; color: var(--muted); }
.fit { overflow: hidden; }
.fit.scroll { overflow-x: auto; }
.desk { width: 1440px; height: 900px; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--page); transform-origin: 0 0; }
.phone { width: 410px; height: 864px; padding: 10px; border-radius: 44px; background: var(--bezel); transform-origin: 0 0; }
.phone .screen { width: 390px; height: 844px; border-radius: 34px; overflow: hidden; background: var(--surface); }
iframe { display: block; width: 100%; height: 100%; border: 0; background: var(--page); }
.notes { font-size: 13px; color: var(--muted-strong); line-height: 1.55; max-width: 120ch; margin: 0; padding-left: 18px; display: grid; gap: 3px; }
.toast { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); background: #111827; color: #fff; font-weight: 600; font-size: 13px; padding: 10px 14px; border-radius: 8px; opacity: 0; transition: opacity .15s; pointer-events: none; }
.toast[data-open="true"] { opacity: 1; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
<main class="wrap">
  <header class="top">
    <span class="eyebrow">PAGES · uygulamanın bugünkü hâli</span>
    <h1><span class="no">${esc(screen.no)}</span>${esc(screen.title)}</h1>
    <p class="lede">${esc(screen.ne)}</p>
    <dl class="facts">
      <dt>Adres</dt><dd><code>${esc(screen.path)}</code></dd>
      <dt>Uygulamada</dt><dd>${esc(screen.nerede)}</dd>
      <dt>Kim açar</dt><dd>${esc(screen.kim)}</dd>
      <dt>Kaynak</dt><dd>Gerçek uygulama kodu, main <code>${esc(sha)}</code> (${esc(built)}); veri sahte (Harbor &amp; Vine demo restoranı). Bütün ekranlar: <a href="${esc(indexUrl)}" target="_blank" rel="noopener">PAGES dizini</a>.</dd>
    </dl>
    <div class="controls">
      ${rolePills ? `<div class="ctl"><span class="ctl-label">Kim açıyor</span><div class="pills">${rolePills}</div></div>` : `<div class="ctl"><span class="ctl-label">Kim açıyor</span><span>Oturumu olmayan kişi</span></div>`}
      <div class="ctl"><span class="ctl-label">Örnek senaryo</span><div class="pills">${scenarioPills}</div></div>
    </div>
    <div class="controls">
      <div class="ctl"><span class="ctl-label">Görünüm</span><div class="pills">
        <button type="button" data-g="layout" data-k="auto">Otomatik</button>
        <button type="button" data-g="layout" data-k="side">Yan yana</button>
        <button type="button" data-g="layout" data-k="stack">Alt alta</button>
      </div></div>
      <div class="ctl"><span class="ctl-label">Masaüstü boyutu</span><div class="pills">
        <button type="button" data-g="zoom" data-k="fit">Sığdır</button>
        <button type="button" data-g="zoom" data-k="full">%100</button>
      </div></div>
      <button type="button" class="restart" id="restart">Baştan başlat</button>
    </div>
  </header>
  <section class="stagebox" aria-label="Ekran">
    <div class="frames" id="frames">
      <div class="fcol desk-col"><div class="flabel">Masaüstü <span>1440 × 900</span><span id="desk-scale"></span></div><div class="fit" id="desk-fit"><div class="desk" id="desk"></div></div></div>
      <div class="fcol phone-col"><div class="flabel">Telefon <span>390 × 844</span></div><div class="fit" id="phone-fit"><div class="phone"><div class="screen" id="phone"></div></div></div></div>
    </div>
  </section>
  <ul class="notes">
    <li>İki görüntü aynı demo veriyle çalışır: birinde kaydedilen değişiklik ötekine de gelir, adres değişince öteki de aynı adrese gider. Açık çekmece ya da pencere öbür görüntüye geçmez; senaryolar ikisini de aynı adımlarla açar.</li>
    <li>Her açılış ve "Baştan başlat" senaryonun ilk hâline döner. Veri yalnız bu tarayıcıda kalır; e-posta, SMS ve dosya indirme çalışmaz.</li>
    <li>Başka bir ekrana giden bağlantı o ekranın PAGES numarasını söyler ve yerinde kalır.</li>
  </ul>
</main>
<div class="toast" id="toast" role="status"></div>
<script>
(function () {
  var D = ${JSON.stringify(data)};
  var G = { sc: D.scenarios[0] ? D.scenarios[0].id : "", role: null, layout: "auto", zoom: "fit" };
  try { var saved = JSON.parse(localStorage.getItem("nf.pages.view") || "{}"); if (saved.layout) G.layout = saved.layout; if (saved.zoom) G.zoom = saved.zoom; } catch (e) {}
  var frames = { desktop: null, phone: null };
  function scenario() { for (var i = 0; i < D.scenarios.length; i++) if (D.scenarios[i].id === G.sc) return D.scenarios[i]; return D.scenarios[0]; }
  function role() { var s = scenario(); return G.role || (s && s.role) || (D.roles[0] || ""); }
  function mount() {
    ["desktop", "phone"].forEach(function (name) {
      var host = document.getElementById(name === "desktop" ? "desk" : "phone");
      host.textContent = "";
      var f = document.createElement("iframe");
      var params = "s=" + encodeURIComponent(D.no) + "&sc=" + encodeURIComponent(G.sc) + "&role=" + encodeURIComponent(role()) + "&frame=" + name + "&n=" + Date.now();
      f.name = "pages:" + params;
      f.title = (name === "desktop" ? "Masaüstü" : "Telefon") + " görünümü, ${esc(screen.no)} ${esc(screen.title)}";
      f.src = "${screen.area === "schedule" ? "app-schedule.html" : "app.html"}#" + params;
      host.appendChild(f);
      frames[name] = f;
    });
    sync();
  }
  // Each frame's saves and moves go to the other frame.
  window.addEventListener("message", function (event) {
    var m = event.data;
    if (!m || m.nf !== "pages") return;
    var other = event.source === (frames.desktop && frames.desktop.contentWindow) ? frames.phone
      : event.source === (frames.phone && frames.phone.contentWindow) ? frames.desktop : null;
    if (other && other.contentWindow) other.contentWindow.postMessage(m, "*");
  });
  function sync() {
    document.querySelectorAll("[data-g]").forEach(function (b) {
      var g = b.dataset.g, k = b.dataset.k;
      var on = g === "role" ? role() === k : G[g] === k;
      b.setAttribute("aria-pressed", String(on));
    });
  }
  function fit() {
    var box = document.getElementById("frames");
    var width = box.clientWidth;
    var side = G.layout === "side" || (G.layout === "auto" && (width - 410 - 24) / 1440 >= 0.62);
    box.dataset.layout = side ? "side" : "stack";
    var deskFit = document.getElementById("desk-fit");
    var deskWidth = side ? width - 410 - 24 : width;
    var desk = document.getElementById("desk");
    var scale = G.zoom === "full" ? 1 : Math.min(1, deskWidth / 1440);
    desk.style.transform = scale < 1 ? "scale(" + scale + ")" : "";
    deskFit.style.width = Math.max(0, deskWidth) + "px";
    deskFit.style.height = Math.round(900 * scale) + "px";
    deskFit.classList.toggle("scroll", G.zoom === "full" && deskWidth < 1440);
    document.getElementById("desk-scale").textContent = "· %" + Math.round(scale * 100);
    var phoneFit = document.getElementById("phone-fit");
    var phone = phoneFit.firstElementChild;
    var pScale = Math.min(1, width / 410);
    phone.style.transform = pScale < 1 ? "scale(" + pScale + ")" : "";
    phoneFit.style.width = Math.round(410 * pScale) + "px";
    phoneFit.style.height = Math.round(864 * pScale) + "px";
  }
  document.addEventListener("click", function (event) {
    var b = event.target.closest && event.target.closest("[data-g]");
    if (b && !b.disabled) {
      var g = b.dataset.g, k = b.dataset.k;
      if (g === "sc") { G.sc = k; G.role = null; mount(); }
      else if (g === "role") { G.role = k; mount(); }
      else { G[g] = k; try { localStorage.setItem("nf.pages.view", JSON.stringify({ layout: G.layout, zoom: G.zoom })); } catch (e) {} sync(); fit(); }
    }
  });
  document.getElementById("restart").addEventListener("click", mount);
  try { new ResizeObserver(fit).observe(document.querySelector(".wrap")); } catch (e) { window.addEventListener("resize", fit); }
  mount();
  fit();
})();
</script>
`;
}
