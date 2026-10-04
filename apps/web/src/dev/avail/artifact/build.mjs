// Builds the AVAIL-TASARIM artifact: a small notes page and the real app shell with the lab as app.html beside it.
// Usage (repo root): node apps/web/src/dev/avail/artifact/build.mjs
// Output: artifacts/nf-arayuz/avail-design/{avail-artifact.html, app.html, app.js, app.css} (gitignored), ready to publish.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../../../..");
const repo = path.resolve(web, "../..");
// The esbuild already in the repo (apps/api bundles with it); no new dependency.
const esbuild = createRequire(path.join(repo, "apps/api/package.json"))("esbuild");
const fakeAuth = path.join(here, "fake-auth.tsx");
const out = path.join(repo, "artifacts/nf-arayuz/avail-design");

const result = await esbuild.build({
  entryPoints: [path.join(here, "entry.tsx")],
  absWorkingDir: web,
  bundle: true,
  write: false,
  outdir: "out",
  format: "iife",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  minify: true,
  legalComments: "none",
  define: {
    "import.meta.env": JSON.stringify({ DEV: true, PROD: false, MODE: "artifact", BASE_URL: "/" }),
    "process.env.NODE_ENV": '"production"',
  },
  loader: { ".png": "dataurl", ".svg": "dataurl", ".jpg": "dataurl", ".woff": "dataurl", ".woff2": "dataurl" },
  plugins: [
    {
      name: "fake-auth",
      setup(build) {
        // No sign-in in the artifact: the shell reads a fixed owner (employee on S4).
        build.onResolve({ filter: /\/auth\/AuthContext$/ }, () => ({ path: fakeAuth }));
        // The Schedule top bar's fonts are served from apps/web/public; inline them.
        build.onResolve({ filter: /^\/fonts\// }, (args) => ({ path: path.join(web, "public", args.path) }));
      },
    },
  ],
  logLevel: "warning",
});

const text = (extension) => result.outputFiles.find((file) => file.path.endsWith(extension))?.text ?? "";
const js = text(".js");
const css = text(".css");
// The app is a small shell; its code and styles ship as app.js and app.css beside it.
const app = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>`;
// The page is only the frame and the notes; the app is its own file next to it (published with `files`).
const page = readFileSync(path.join(here, "page.html"), "utf8");

mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "avail-artifact.html"), page);
writeFileSync(path.join(out, "app.html"), app);
writeFileSync(path.join(out, "app.js"), text(".js"));
writeFileSync(path.join(out, "app.css"), text(".css"));
console.log(`app.html ${(app.length / 1024 / 1024).toFixed(2)} MB (js ${(js.length / 1024).toFixed(0)} KB, css ${(css.length / 1024).toFixed(0)} KB)`);
