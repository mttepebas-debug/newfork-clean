// Writes one static HTML file per route from the SSR bundle, plus
// sitemap.xml and robots.txt. Run by `pnpm build` after both Vite builds.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const ssrEntry = path.join(root, ".ssr", "entry-server.js");

const template = await readFile(path.join(dist, "index.html"), "utf8");
const manifest = JSON.parse(await readFile(path.join(dist, ".vite", "manifest.json"), "utf8"));
const { render, ROUTES, NOT_FOUND_ROUTE, SITE_URL, APP_URL, USING_PLACEHOLDER_DOMAINS } =
  await import(pathToFileURL(ssrEntry).href);

if (!template.includes("<!--app-head-->") || !template.includes("<!--app-html-->")) {
  throw new Error("dist/index.html lost its <!--app-head--> / <!--app-html--> placeholders");
}

/** The page chunk and everything it imports, minus what the entry already loads. */
function preloadsFor(page) {
  const key = `src/pages/${page}.tsx`;
  if (!manifest[key]) throw new Error(`No client chunk for ${key}`);
  const entryFiles = new Set();
  const collect = (k, into) => {
    const chunk = manifest[k];
    if (!chunk || into.has(chunk.file)) return;
    into.add(chunk.file);
    for (const imported of chunk.imports ?? []) collect(imported, into);
  };
  collect("index.html", entryFiles);
  const files = new Set();
  collect(key, files);
  return [...files]
    .filter((file) => !entryFiles.has(file))
    .map((file) => `<link rel="modulepreload" crossorigin href="/${file}" />`);
}

function outputFile(routePath) {
  if (routePath === "/") return path.join(dist, "index.html");
  if (routePath === NOT_FOUND_ROUTE.path) return path.join(dist, "404.html");
  return path.join(dist, routePath.slice(1), "index.html");
}

const written = [];
for (const route of [...ROUTES, NOT_FOUND_ROUTE]) {
  const { html, head } = await render(route.path);
  if (!html.includes("<h1")) throw new Error(`${route.path} rendered without an <h1>`);
  const page = template
    .replace("<!--app-head-->", [head, ...preloadsFor(route.page)].join("\n    "))
    .replace("<!--app-html-->", html);
  const file = outputFile(route.path);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, page);
  written.push(route.path);
}

const today = new Date().toISOString().slice(0, 10);
const indexable = ROUTES.filter((route) => !route.noindex);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexable
  .map(
    (route) => `  <url>
    <loc>${route.path === "/" ? `${SITE_URL}/` : `${SITE_URL}${route.path}`}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority.toFixed(1)}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;
await writeFile(path.join(dist, "sitemap.xml"), sitemap);
await writeFile(
  path.join(dist, "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
);

// The manifest only served this script; it maps source paths and has no
// business being public.
await rm(path.join(dist, ".vite"), { recursive: true, force: true });

console.log(`prerendered ${written.length} pages → dist/ (site ${SITE_URL}, app ${APP_URL})`);
if (USING_PLACEHOLDER_DOMAINS) {
  console.warn(
    "warning: VITE_SITE_URL / VITE_APP_URL are unset, so canonical URLs and app links use placeholder .example domains.",
  );
}
