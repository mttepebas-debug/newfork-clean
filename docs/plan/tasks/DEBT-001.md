# DEBT-001 Teknik borç: P0 dilimi (güvenlik yaması, CI kapsamı, lint, ölü paket)
Status: draft (kullanıcı onayı bekliyor)
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
