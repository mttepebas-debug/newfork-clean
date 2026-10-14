# Jobs & departments (Settings → Jobs) — Original + seçilen V1 (✅ Done, 2026-10-13)

- Artifact: https://claude.ai/artifact/BUJShpW3rXDGFVNyEygDZr (eski "Jobs Settings Replica"nın yerine, aynı bağlantı)
- Sayfa dosyası: /mnt/project-files/pages/guncel/jobs-departments.html + `yayin/app.js` (main a85619f; sürüm 11, 2026-10-14). Tek dosya hâli "artifact-pr-review … too large" kontrolüne takılıyor; betik ayrı `app.js` olarak yayınlanır (sayfada `<script type="module" src="app.js">`, U+FFFD kaçışlı). Yayın: sayfa ve app.js'i oturumun geçici klasörüne kopyala, `files: {"app.js": …}` ile aynı url'ye.
- Kararlar (Mert, 2026-10-13): Departments A, gruplar hep açık, arşiv kuralı (iki grup; departman arşivi işlerini de götürür; restore bağsız, iş departmanı etkinse ona döner; arşivdeki çekmeceden Delete).
- Kaynak: `source/` = atlas kaynağının kopyası + `variants/` (JobsLab, JobsV1Page, decisions, Marker, lab-state, jobs-lab.css).
  Vite alias'ı `./settings/JobsSettingsPage`'i `variants/JobsLab.tsx`'e çevirir; Original gerçek sayfadır (`lab-original-jobs`).
  `mock/world.ts`'e yalnız bu sayfa için Catering (boş), Patio (arşivli) departmanları ve Sommelier, Patio Server, Patio Busser (arşivli) işleri eklendi.
- Derleme (bulut, repo kökü main'de, pnpm install yapılmış):
  1. `cp -r source/. <repo>/apps/web/.temp/jobs-lab/`
  2. `apps/web`: `./node_modules/.bin/tsc -p .temp/jobs-lab/tsconfig.json --noEmit`
  3. `ATLAS_SHA=<sha> ./node_modules/.bin/vite build --config .temp/jobs-lab/vite.config.ts`
  4. `node .temp/jobs-lab/inline.mjs jobs-lab "Jobs & departments" <out.html>`, sonra ilk satırdaki `<title>`'ı `◐ Yarı karar · Jobs &amp; departments` yap.
- Kararlar ve numaralar: `source/variants/decisions.ts`.
