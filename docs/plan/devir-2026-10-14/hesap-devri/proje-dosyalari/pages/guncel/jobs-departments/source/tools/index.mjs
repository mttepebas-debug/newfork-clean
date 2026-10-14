// Writes the atlas index page (the "Newfork sayfa atlası" Artifact) from
// tools/atlas.json. Usage: node tools/index.mjs <out.html>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("./atlas.json", import.meta.url)), "utf8"));
const out = process.argv[2];
if (!out) throw new Error("Usage: node tools/index.mjs <out.html>");
const esc = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const roleName = { owner: "Owner", admin: "Admin", manager: "Manager", employee: "Employee" };
const live = manifest.pages.filter((page) => page.url);
const shas = [...new Set(live.map((page) => page.sha))];

const card = (page) => `
      <li class="page${page.url ? "" : " is-planned"}" id="${esc(page.id)}">
        <div class="page-head">
          <h3>${page.url ? `<a href="${esc(page.url)}" target="_blank" rel="noopener">${esc(page.title)}</a>` : esc(page.title)}</h3>
          ${page.url ? "" : `<span class="chip chip-planned">Hazırlanıyor</span>`}
        </div>
        <p class="what">${esc(page.what)}</p>
        <dl>
          <div><dt>Nerede</dt><dd>${esc(page.where)}</dd></div>
          <div><dt>Adres</dt><dd><code>${page.routes.map(esc).join("</code> <code>")}</code></dd></div>
          <div><dt>Kim görür</dt><dd class="roles">${page.roles.map((role) => `<span class="chip">${roleName[role] ?? esc(role)}</span>`).join("")}${page.rolesNote ? ` <span class="note">${esc(page.rolesNote)}</span>` : ""}</dd></div>
          ${page.url ? `<div><dt>Sürüm</dt><dd><span class="mono">main ${esc(page.sha)}</span> · ${esc(page.built)}</dd></div>` : ""}
        </dl>
      </li>`;

const html = `<title>Newfork sayfa atlası</title>
<style>
/* Layout: one reading column; groups of page cards, two across on wide screens. Colors follow the app's own --theme tokens. */
:root {
  --bg: #f4f5f3; --surface: #ffffff; --text: #17221e; --muted: #5f6b66; --border: #dce3df;
  --accent: #176954; --accent-soft: #e7f1ed; --planned: #8a5a00; --planned-soft: #fff7e2;
  --font: Inter, "Segoe UI", system-ui, -apple-system, sans-serif;
  --mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #121815; --surface: #1a221e; --text: #e6ece9; --muted: #a3b0aa; --border: #2c3833;
  --accent: #6cc7a9; --accent-soft: #1f3a31; --planned: #e8b65a; --planned-soft: #3a2f17; color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #121815; --surface: #1a221e; --text: #e6ece9; --muted: #a3b0aa; --border: #2c3833;
  --accent: #6cc7a9; --accent-soft: #1f3a31; --planned: #e8b65a; --planned-soft: #3a2f17; color-scheme: dark; }
body { background: var(--bg); color: var(--text); font: 15px/1.5 var(--font); }
.wrap { max-width: 1080px; margin: 0 auto; padding-inline: 20px; padding-block: 32px 56px; display: grid; gap: 28px; }
header { display: grid; gap: 8px; }
.eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); margin: 0; }
h1 { font-size: clamp(28px, 4vw, 40px); line-height: 1.1; margin: 0; letter-spacing: -0.02em; text-wrap: balance; }
.lede { margin: 0; max-width: 68ch; color: var(--muted); }
.how { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; display: grid; gap: 8px; }
.how h2 { font-size: 14px; margin: 0; }
.how ol { margin: 0; padding-left: 20px; display: grid; gap: 4px; max-width: 75ch; }
.meta { font-size: 13px; color: var(--muted); }
section { display: grid; gap: 12px; }
section > h2 { font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 0; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
ul.pages { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr)); gap: 12px; }
.page { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: grid; gap: 8px; align-content: start; min-width: 0; }
.page.is-planned { background: transparent; border-style: dashed; }
.page-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.page h3 { font-size: 17px; margin: 0; }
.page h3 a { color: var(--accent); text-decoration: none; }
.page h3 a:hover { text-decoration: underline; }
.page h3 a::after { content: " ↗"; font-size: 13px; }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
.what { margin: 0; }
dl { margin: 0; display: grid; gap: 4px; font-size: 13px; }
dl > div { display: grid; grid-template-columns: 82px 1fr; gap: 8px; }
dt { color: var(--muted); }
dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
code, .mono { font-family: var(--mono); font-size: 12px; }
code { background: var(--accent-soft); padding: 1px 5px; border-radius: 4px; margin-right: 2px; }
.roles { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.chip { font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); }
.chip-planned { background: var(--planned-soft); color: var(--planned); }
.note { color: var(--muted); }
</style>
<div class="wrap">
  <header>
    <p class="eyebrow">Newfork · Harbor &amp; Vine demo</p>
    <h1>Newfork sayfa atlası</h1>
    <p class="lede">Uygulamanın her sayfası, gerçek uygulama koduyla ve sahte verilerle (Harbor &amp; Vine: iki şube, 16 çalışan) burada çalışır. Sayfayı açıp dener, yorum bırakır ya da yanında açık tutup koordinatöre yazarsın. Kod main'e girdikçe sayfalar aynı bağlantıda güncellenir.</p>
    <p class="meta">${live.length} sayfa yayında${manifest.pages.length > live.length ? `, ${manifest.pages.length - live.length} sayfa hazırlanıyor` : ""} · kaynak main ${shas.map(esc).join(", ")} · güncelleme ${esc(manifest.updated)}</p>
  </header>
  <div class="how">
    <h2>Nasıl kullanılır</h2>
    <ol>
      <li>Sayfanın adına tıkla; yeni sekmede uygulamanın o ekranı açılır.</li>
      <li>Sayfanın en üstünde, ortadaki küçük <strong>Atlas</strong> düğmesinden kim olarak gireceğini seç (Owner, Manager, Employee). Ekran o rolün gördüğü gibi değişir.</li>
      <li>Yaptığın değişiklikler yalnız senin tarayıcında kalır. Aynı düğmedeki <strong>Reset demo data</strong> her şeyi baştaki hâline döndürür.</li>
      <li>Yorumu sayfanın kendisine bırak; ya da sayfayı açık tutup proje sohbetinde hangi sayfadan söz ettiğini yazman yeterli.</li>
    </ol>
  </div>
  ${manifest.groups.map((group) => `
  <section aria-labelledby="g-${esc(group.id)}">
    <h2 id="g-${esc(group.id)}">${esc(group.title)}</h2>
    <ul class="pages">${manifest.pages.filter((page) => page.group === group.id).map(card).join("")}
    </ul>
  </section>`).join("")}
</div>
`;
writeFileSync(out, html);
console.log(out, `${live.length}/${manifest.pages.length} live`);
