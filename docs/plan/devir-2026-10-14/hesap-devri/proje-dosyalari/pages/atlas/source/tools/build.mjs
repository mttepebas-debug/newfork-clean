// Builds the atlas once and writes one page file per atlas page that is in
// tools/atlas.json, plus the index. Run from apps/web:
//   node .temp/atlas/tools/build.mjs [page id ...]
// With page ids, only those pages are written (the index always is).
// Output: /mnt/project-files/pages/atlas/<id>.html and index.html.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const outDir = process.env.ATLAS_OUT ?? "/mnt/project-files/pages/atlas";
const repo = here("../../../../../");
const sha = execFileSync("git", ["-C", repo, "rev-parse", "--short=8", "HEAD"], { encoding: "utf8" }).trim();
const built = new Date().toISOString().slice(0, 10);
const manifestPath = here("./atlas.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const wanted = process.argv.slice(2);
const pages = manifest.pages.filter((page) => !page.external && (wanted.length === 0 || wanted.includes(page.id)));

mkdirSync(outDir, { recursive: true });
execFileSync("./node_modules/.bin/vite", ["build", "--config", ".temp/atlas/vite.config.ts", "--logLevel", "warn"], {
  cwd: here("../../../"), stdio: "inherit", env: { ...process.env, ATLAS_SHA: sha, ATLAS_BUILT: built },
});
for (const page of pages) {
  execFileSync("node", [here("../inline.mjs"), page.id, page.title, `${outDir}/${page.id}.html`], { stdio: "inherit" });
  page.sha = sha;
  page.built = built;
}
manifest.updated = built;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
execFileSync("node", [here("./index.mjs"), `${outDir}/index.html`], { stdio: "inherit" });
console.log(`main ${sha}: ${pages.length} page(s) written to ${outDir}. Publish each to its url in tools/atlas.json, then index.html.`);
