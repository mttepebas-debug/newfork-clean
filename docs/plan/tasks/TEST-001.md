# TEST-001 Test ve kod kaymasını kapat, vitest env izolasyonu
Status: draft (F0; RESCUE-001 merge'ünden sonra)
Session: -   Branch: task/test-001   Worktree: newfork-wt/test-001   DB: yok
Öneri: Sonnet 5, medium. Çoğu test-kod kayması; ürün kararı gerektirenler koordinatöre sorulur.

Goal: main'de web, api ve shared unit testlerinin tamamen yeşil olması. Böylece CI'ın (OPS-011) temeli güvenilir olur.

Bulgular (RESCUE-001 raporu, 2026-09-16):
- `apps/web/.env.local` vitest'e sızıyor: `import.meta.env` üzerinden dev identity kapanıyor ve App testleri ek olarak kırılıyor. Env izolasyonu sağlanmadan web'de 91 fail var; izolasyonla 57 fail kalıyor.
- web (env'siz ölçüm):
  - App.test.tsx 32 fail: 16 timeout; "Draft selector: New Schedule" ve "Update shift" bulunamıyor; `window.matchMedia` eksik.
  - NotificationShiftDetails 10 fail: "View shift details" butonu yok.
  - schedulePresetTargets 5 fail: fixture'da `conflict_rules` undefined.
  - AppShellNotificationBadge 5 fail: Availability nav linki beklentisi.
  - Tekli fail'ler: LineupPage 2, scheduleWeeklyAvailability 1, useScheduleRealtime 1, ScheduleGridDragPreviews 1.
- shared, notification-catalog 1 fail: `availability.review_required`, `availability.status_changed` ve `availability.weekly_updated` için display copy yok. Bu olası bir ürün boşluğu.
- api, app.test.ts 3 fail: setup checklist ve onboarding review 403 dönüyor ("Employee document review required").

In scope:
- vitest config'inde env izolasyonu (test ortamında `.env.local` okunmaz).
- Her kırmızı test için karar: test mi eskimiş, kod mu kırık?
  - Test eskimişse testi güncelle.
  - Kod kırıksa küçük bir düzeltme yap.
  - Ürün davranışı belirsizse (ör. NotificationShiftDetails butonu, Availability nav, document review 403) dur ve koordinatöre sor.
- Eksik availability display copy'si eklenir.

Out of scope:
- pgTAP testleri.
- Yeni test yazmak (yalnızca mevcut kırmızılar).
- UI redesign.

Done when:
- `pnpm.cmd test` tamamen PASS (web, api, shared, ui, scheduling-shared).
- `.env.local` mevcutken de PASS.
- typecheck PASS.

Touches: `apps/web/vite.config.*` ya da `vitest.config.*`, ilgili test dosyaları, `packages/shared` notification catalog.

Test plan: env izolasyonu yapıldıktan sonra test dosyası bazında ilerle; en sonda tam `pnpm.cmd test` bir kez.

Risk: App.test.tsx'teki timeout'lar gerçek bir performans ya da render sorununu gizliyor olabilir. Timeout süresini artırarak geçiştirme.

## Notes / Result
