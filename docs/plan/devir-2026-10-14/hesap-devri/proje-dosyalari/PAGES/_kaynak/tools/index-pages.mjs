// Writes the PAGES index (every numbered screen with its Artifact link) and
// MAP.txt. Usage: node tools/index-pages.mjs <out dir>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const out = process.argv[2];
if (!out) throw new Error("Usage: node tools/index-pages.mjs <out dir>");
const { screens } = JSON.parse(readFileSync(here("../screens.json"), "utf8"));
const manifest = JSON.parse(readFileSync(here("./pages.json"), "utf8"));
const esc = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const groups = {
  0: "Kabuk: her ekranda ortak parçalar", 1: "Giriş ve kurulum", 2: "Workspace", 3: "Schedule", 4: "Employees", 5: "Availability", 6: "Important Dates",
  7: "Çalışan ekranları", 8: "Announcements", 9: "Notifications", 10: "Settings", 11: "Account", 12: "Herkese açık sayfalar",
};
const live = screens.filter((s) => manifest.screens[s.no]?.url);
const shas = [...new Set(live.map((s) => manifest.screens[s.no].sha))];
// Page → part → scenario, each scenario a link straight to it (page link#id).
const scenarioTree = (s, m) => {
  const parts = [];
  for (const one of s.scenarios) {
    const name = one.part ?? "Genel";
    let group = parts.find((part) => part.name === name);
    if (!group) parts.push(group = { name, list: [] });
    group.list.push(one);
  }
  const link = (one) => m.url ? `<a href="${esc(m.url)}#${esc(one.id)}" target="_blank" rel="noopener">${esc(one.label)}</a>` : esc(one.label);
  return `<details class="tree"><summary>${parts.length} parça · ${s.scenarios.length} senaryo</summary>${parts.map((part) =>
    `<div class="part"><b>${esc(part.name)}</b><ul>${part.list.map((one) => `<li>${link(one)}${one.role ? ` <span class="who">${esc(one.role)}</span>` : ""}</li>`).join("")}</ul></div>`).join("")}</details>`;
};
const row = (s) => {
  const m = manifest.screens[s.no] ?? {};
  return `<li class="row${m.url ? "" : " planned"}">
        <span class="no">${esc(s.no)}</span>
        <div class="txt">
          <h3>${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}${m.url ? "" : ` <span class="chip">Hazırlanıyor</span>`}</h3>
          <p>${esc(s.ne)}</p>
          <p class="meta"><code>${esc(s.path)}</code> · ${esc(s.kim)}${m.sha ? ` · main ${esc(m.sha)}` : ""}</p>
          ${scenarioTree(s, m)}
        </div>
      </li>`;
};
const sections = Object.entries(groups).map(([major, name]) => {
  const list = screens.filter((s) => s.no.split(".")[0] === major);
  return `<section><h2><span class="gno">${major}</span>${esc(name)}</h2><ul>${list.map(row).join("")}</ul></section>`;
}).join("\n");
const html = `<title>PAGES · Newfork ekranları</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap">
<style>
:root { color-scheme: light; --page: #f4f5f3; --surface: #fff; --soft2: #f0f3f1; --text: #17221e; --body: #1d2525; --muted: #66716c; --border: #dce3df; --accent: #176954; --on-dark: #fff; --warn-soft: #fff7e2; --warn-text: #5f491f; }
* { box-sizing: border-box; } html, body { margin: 0; background: var(--page); }
body { color: var(--text); font: 14px/1.5 Inter, ui-sans-serif, system-ui, sans-serif; }
.wrap { max-width: 1100px; margin: 0 auto; padding: 28px 24px 64px; display: grid; gap: 22px; }
@media (max-width: 600px) { .wrap { padding-inline: 16px; } }
h1 { margin: 0; font-size: 26px; letter-spacing: -0.015em; } .lede { margin: 0; color: var(--body); max-width: 80ch; }
.facts { padding: 12px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; color: var(--body); font-size: 13.5px; display: grid; gap: 4px; }
.facts p { margin: 0; }
section { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; }
h2 { margin: 0 0 8px; font-size: 17px; display: flex; gap: 10px; align-items: center; }
.gno { min-width: 30px; height: 26px; padding: 0 7px; border-radius: 7px; background: var(--text); color: var(--on-dark); display: inline-grid; place-items: center; font-size: 13px; }
ul { list-style: none; margin: 0; padding: 0; }
.row { display: grid; grid-template-columns: 52px 1fr; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border); }
.row:first-child { border-top: 0; }
.no { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent); padding-top: 1px; }
.txt { min-width: 0; } h3 { margin: 0; font-size: 14.5px; } h3 a { color: var(--accent); }
.txt p { margin: 2px 0 0; color: var(--body); font-size: 13px; } .txt .meta { color: var(--muted); font-size: 12.5px; overflow-wrap: anywhere; }
code { font: 12px ui-monospace, Consolas, monospace; background: var(--soft2); padding: 1px 5px; border-radius: 4px; }
.planned h3 { color: var(--muted); }
.tree { margin-top: 6px; font-size: 13px; } .tree summary { cursor: pointer; color: var(--accent); font-weight: 600; }
.tree .part { margin: 6px 0 0 4px; } .tree .part b { font-size: 12.5px; color: var(--body); }
.tree .part ul { margin: 2px 0 0; padding-left: 18px; list-style: disc; } .tree .part li { margin: 1px 0; }
.tree a { color: var(--accent); } .who { color: var(--muted); font-size: 11.5px; }
.chip { display: inline-block; margin-left: 6px; padding: 0 8px; border-radius: 999px; background: var(--warn-soft); color: var(--warn-text); font-size: 11.5px; font-weight: 650; }
</style><main class="wrap">
<header style="display:grid;gap:10px">
  <h1>PAGES · Newfork ekranları</h1>
  <p class="lede">Uygulamanın her ekranı (route) ayrı bir sayfa: gerçek kod, demo veri, masaüstü ve telefon birlikte. Numara sırası: 0 her ekranda ortak parçalar, 1 giriş ve kurulum, 2 Workspace, 3 Schedule, sonra sol menünün sırası.</p>
  <div class="facts">
    <p><b>${live.length} / ${screens.length}</b> ekran yayında. Derlendiği main: ${shas.map((s) => `<code>${esc(s)}</code>`).join(", ") || "—"}.</p>
    <p><b>${screens.reduce((n, s) => n + s.scenarios.length, 0)}</b> senaryo. Her satırın altındaki listeyi açınca sayfa → parça → senaryo; senaryonun adı onu doğrudan açar.</p>
    <p>Kural (Mert, 2026-10-10 ve 2026-10-12): kodun dokunduğu her sayfa, parça ve senaryo aynı işin sonunda burada ve Artifact klasör dizininde güncellenir ya da eklenir; haritada boşluk kalmaz.</p>
  </div>
</header>
${sections}
</main>
`;
writeFileSync(`${out}/index.html`, html);
const map = screens.map((s) => `${s.no}\t${s.title}\t${s.path}\t${manifest.screens[s.no]?.url ?? "hazırlanıyor"}\t${manifest.screens[s.no]?.sha ?? ""}`).join("\n");
writeFileSync(`${out}/MAP.txt`, `PAGES: numara, ekran, adres, Artifact bağlantısı, derlendiği main\nDizin: ${manifest.index ?? "hazırlanıyor"}\n\n${map}\n`);
console.log(`index.html and MAP.txt: ${live.length}/${screens.length} live`);
