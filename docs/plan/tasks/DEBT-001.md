# DEBT-001 Teknik borç: P0 dilimi (güvenlik yaması, CI kapsamı, lint, ölü paket)
Status: done (P0 dilimi; P1/P2 backlog'da)
Session: -   Branch: task/debt-p0 (fastify bump zaten commit'li: 341c86c)   Worktree: newfork-wt/debt-p0   DB: -
Öneri: Sonnet 5, medium. Mekanik işler; her biri küçük ve bağımsız.
Kaynak: teknik borç denetimi (session "Technical debt audit and refactoring plan", 2026-09-18, salt okunur). Denetimin tamamı o session'ın transcript'inde; buraya yalnız karar ve iş kalemleri yazıldı.

Goal: Lansman öncesi en yüksek getirili dört borç kalemini kapatmak. Hepsi feature işiyle paralel yürür; refactor donması yok.

Denetimin ana bulgusu: zemin temiz (sıfır TODO/any/ts-ignore, 292 test dosyası); borç yapısal. En yüksek gerçek risk madde 7 (HTTP status'un İngilizce metin eşleşmesinden türetilmesi) ve madde 1 (production'da API kör) — ikisi de P1, OPS-013 ile aynı dosyaya iniyor.

In scope (P0):
1. **fastify/uuid yaması** — `apps/api/package.json` `^5.5.0` → `^5.12.5` ve lockfile. Değişiklik `task/debt-p0` branch'inde hazır (341c86c; denetim session'ı ana checkout'ta yapmıştı, koordinatör branch'e taşıdı). Kalan: `pnpm.cmd install`, `pnpm.cmd audit --prod` (8 high + 3 moderate → 0 beklenir), `pnpm.cmd --filter @newfork/api exec vitest run` ve api typecheck. Kod değişikliği yok.
2. **CI: `paths-ignore` + `lint` + `build`** — `.github/workflows/ci.yml`: `docs/**` ve `**/*.md` için tetiklenmez (bugün docs push'u çalışan kod koşusunu iptal ediyor, memory `ci-main-check-after-merge`); `lint` ve `build` adımları eklenir. Lint kırmızı olduğu için 3 ile birlikte yürür.
3. **ESLint config ve 23 hata** — `varsIgnorePattern` eksikliği 23 hatanın 13'ünü üretiyor (config hatası, kod hatası değil). `eslint-plugin-react-hooks` kurulur ve **warn** olarak açılır (bugün `WeeklyPreferencesForm.tsx:107`'deki `exhaustive-deps` suppression'ı hiçbir şeyi susturmuyor). Kural error'a çevrilmez; çıkan uyarılar rapora yazılır, kod düzeltmesi bu task'ta yapılmaz.
4. **`@newfork/scheduling-shared` silinir** — paket 1.960 satır, tek canlı parça 38 satır (`toInterval`, `intervalsOverlap`; tek tüketici `apps/web/src/schedule/lib/scheduleHourTotals.ts`). 38 satır web'e taşınır, paket ve iki `package.json` bağımlılık kaydı silinir. Net ≈ −1.900 satır; CI de hızlanır. Silmeden önce `grep` ile sıfır tüketici doğrulanır.

Out of scope (ayrı task/backlog):
- P1: OPS-013 (Fastify logger + `setErrorHandler` + hata izleme) ve tipli hata sınıfları + tek handler (15 `requestError` kopyası silinir). İkisi `app.ts`'e iniyor, sıralı yürür.
- P1: CI'da 119 pgTAP testi için ikinci job; Kiosk ve Time Entries kararı (sil ya da güvenlik yüzeyini sahiplen).
- P2: `schedule-routes.ts` bölünmesi, migration baseline squash (pencere lansmanda kapanıyor), `shared/index.ts` saf barrel, `/v1` birleştirme, `docs/rebuild` arşivi + ADR'ler, monolit test dosyalarının bölünmesi.
- Fırsatçı: bağımlılık major'ları tek parti, `SchedulePage.tsx` parça parça çıkarım, E2E smoke akışının öne alınması.

Done when: `pnpm audit --prod` high/moderate 0; CI docs commit'inde tetiklenmiyor ve lint+build adımları yeşil; `scheduling-shared` yok ve web/api testleri PASS; branch push + rapor.
Test plan: api focused testler + typecheck (1); CI koşusu (2, 3); web schedule testleri + typecheck + build (4).
Risk: `react-hooks` warn açılınca uyarı sayısı yüksek olabilir (kabul; error değil). Paket silme sırasında gizli bir tüketici kalırsa build kırılır → grep + build kontrolü.

## Notes / Result
- 2026-09-18: denetim raporu alındı (salt okunur). fastify bump ana checkout'ta commit'siz duruyordu; koordinatör `task/debt-p0` branch'ine taşıdı, main temiz.
- 2026-09-18 kapanış (koordinatör bu session'da yaptı; kullanıcı "bu session içinde yap" dedi): main c56bf8e, CI yeşil (lint + build adımları dahil).
  1. fastify `^5.12.5` tek başına yetmedi: `fast-uri` alt bağımlılık olarak 3.1.5 / 4.1.2'de kalıyordu. Root `pnpm.overrides` ile `^3.1.8` / `^4.2.1` sabitlendi. `pnpm audit --prod`: 8 high + 1 moderate → 1 moderate. Kalan moderate `exceljs@4.4.0 > uuid@8.3.2`; advisory v3/v5/v6 bounds check, exceljs yalnız `uuid.v4` kullanıyor → istismar edilebilir değil, exceljs yükseltmesiyle kapanır (backlog).
  2. ESLint: `no-unused-vars` artık `ignoreRestSiblings` ve `varsIgnorePattern: "^_"` kullanıyor (10 hatanın 9'u alan atlayan destructure'lardı, kod hatası değil). Kalan gerçek ölü kod temizlendi: 5 kullanılmayan import, 1 kullanılmayan yardımcı (`isMissingScheduleDraftError`), 1 deyim olarak yazılmış ternary, 1 kullanılmayan test argümanı.
  3. `WeeklyPreferencesForm.tsx` içindeki kurulu olmayan kurala ait `eslint-disable` satırı kaldırıldı; yerine niyeti anlatan düz yorum kondu. `eslint-plugin-react-hooks` KURULMADI: yeni bağımlılık kullanıcı onayı ister. Onaylanırsa warn olarak açılmalı.
  4. CI: `paths-ignore` (`docs/**`, `**/*.md`) eklendi — docs push'u artık çalışan kod koşusunu iptal etmiyor; `lint` ve `build` adımları eklendi.
  5. `@newfork/scheduling-shared` silindi. Tek canlı parça `toInterval`, `apps/web/src/schedule/lib/shiftInterval.ts`'e testleriyle taşındı; auto-fill skorlayıcı, yerini `schedule-conflicts.ts`'e bırakmış çakışma dedektörü ve format yardımcısının çağıranı yoktu. İki app'ten bağımlılık kaydı düştü. Net −1.930 satır.
  - Doğrulama (worktree): lint 4/4, build 4/4, test 6/6 (2.266 test), web+api typecheck PASS. Merge sonrası main CI yeşil.
  - Kalan: P1 (OPS-013 + tipli hatalar, CI'da pgTAP job'ı, Kiosk/Time Entries kararı) ve P2 kalemleri BACKLOG'da.
