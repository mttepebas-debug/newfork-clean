# Tazelik ölçümü — parça 3 (origin/main `44e41a54`, 2026-10-06)

Salt okuma: kod okuma, grep, git log; yerel DB'de tek SELECT (BL-556). Test koşulmadı. EKRAN satırları ölçülmedi (553, 555, 571, 575 için ekran keşif dosyalarında zaten anılıyor: `docs/plan/ekranlar/06-documents/OZET.md`, `04-availability/OZET.md`).

| BL | ekran | hüküm | kanıt | yeni metin / birleşme |
|---|---|---|---|---|
| BL-447 | — (CI/test) | geçerli | `apps/web/src/public/PublicTrustPages.test.tsx:11-25` ilk hücre hâlâ `findByRole(..., { timeout: 5000 })`; dosyanın son değişikliği `711da483` (eski) | birleşir → BL-504 (aynı aile: yük altında süre aşan web testi) |
| BL-455 | — (süreç/e2e) | geçerli — karar bekliyor | (2) düzeltildi: `e2e/flows/schedule-multi-location.spec.ts:77` `useInnerText: true`; "eski metni e2e'de ara" adımı hiçbir yerde yok (`.claude/agents/`, `CLAUDE.md`, `DELEGASYON.md`, `KARARLAR.md` grep 0) | — |
| BL-468 | EKRAN:Documents | — | — | — |
| BL-469 | EKRAN:Documents | — | (Settings → Documents → Publish) | — |
| BL-470 | EKRAN:Documents | — | — | — |
| BL-471 | — (Account → Profile) | geçerli | `apps/web/src/account/ProfilePage.tsx:319-321` her ret `refused`; `:383` "…Try again."; `accessEnded` yalnız acil durum kişisinde `:92`, `:348`, `:396` | — |
| BL-476 | EKRAN:Documents | — | — | — |
| BL-481 | — (kurulum sihirbazı) | geçerli | `apps/web/src/views/OwnerOnboardingPage.tsx:1238` Rename, `:1248-1268` Remove — ikisi de yalnız `disabled={submitting}`, `system_key` koşulu yok; yarım arşiv döngüsü `:555-578` (`:561-564`) duruyor | (satır numaraları: Rename `:1238`, Remove `:1248-1268`, döngü `:561-564`) |
| BL-486 | — (Settings, a11y) | geçerli | `apps/web/src/shell/AppShell.tsx:499` `<main className="app-main">`, `apps/web/src/settings/SettingsLayout.tsx:165` `<main className="settings-content">` | (satırlar kaydı: `:499`, `:165`) |
| BL-490 | — (kurulum) | geçerli | `supabase/migrations/20261002000000_manager_is_an_ordinary_job.sql:575` `raise … '23514'` hint'siz; sonraki migration `apply_owner_onboarding_update`'i yeniden tanımlamıyor (grep: son tanım bu dosya) | — |
| BL-491 | — (pgTAP) | değişmiş | `time_off_cancellation_requests.test.sql`'deki `todo` kaldırıldı (`git log -S "todo("` → `1bbba193`, FB-6.3.7); `management_owner_job.test.sql:224` `todo(…, 2)` duruyor | Yeni metin: "`supabase/tests/management_owner_job.test.sql:224`'teki `todo('BL-187…', 2)` işareti kaldırılmalı; BL-187 kapandı, iki hücre `todo` altında geçiyor ve kırılsa koşuyu kırmızı yapmaz." **birleşir ← BL-521** (aynı satır) |
| BL-497 | EKRAN:Documents | — | (2026-10-06 EKRAN-06 keşfinde birleştirildi) | — |
| BL-504 | — (CI/test) | geçerli | `apps/web/src/settings/LocationsSettingsPage.test.tsx:35` `findByRole` varsayılan 1 sn (`asyncUtilTimeout` ayarı yok, grep 0); `SchedulingSettingsPage.test.tsx:125`, `packages/shared/src/timezones.test.ts:14` aynen duruyor; `vite.config.ts:29` `testTimeout: 20000` eski (`d03532c6`, 09-21) — `findBy*` beklemesini etkilemez | ← BL-447 buraya katılır |
| BL-505 | — (görsel QA: sihirbaz, Settings → Jobs, Schedule) | geçerli | `docs/plan` altında BL-505'in kapanışı ya da QA kaydı yok (grep: yalnız madde ve eski besleme satırları); `docs/plan/ekranlar/` içinde BL-505 geçmiyor | Not: (4) Schedule yüzeyi artık EKRAN-01 kapsamında; madde (1)–(3)'e daraltılabilir |
| BL-511 | — (Account → Workspaces) | geçerli | `apps/web/src/account/WorkspacesPage.tsx:532-535` ve `:778-779` `<Button … className="primary-button">`; `.primary-button` CSS'i yok (grep 0; yalnız `.job-primary-button`) | — |
| BL-514 | — (Settings → Conflict handling) | **bayat** | `apps/web/src/styles.css:12046-12049` `.scheduling-form > fieldset > :is(.form-error, .form-success) { padding: 16px 24px }` — `f3d4abd6` (FB-6.3.6b, 2026-10-01 17:01Z, maddenin dayandığı `4a6ef0a8`'den sonra); form `organization-form scheduling-form` (`ConflictHandlingSettingsPage.tsx:156`), mesajlar fieldset'in doğrudan çocuğu (`:236`, `:244`) | Kapanış: `f3d4abd6` |
| BL-516 | — (scripts) | geçerli | `scripts/inbox.mjs:29-30` `slice(0, 40)`; `:155` yazma, `:168` okuma `label/${slug(cwd)}.json` | — |
| BL-529 | — (guard) | geçerli | `scripts/guard.mjs:176-188` (`backupBranches`), `:183` `if (!sha) continue;` değişmemiş | — |
| BL-520 | — (yerel fixture) | değişmiş | `.7` migration artık main'de: `supabase/migrations/20261003040000_time_off_forgets_location_and_parts.sql:75-76` iki `sort_order`'u siliyor; `newfork-clean/supabase/local-fixture/meyhouse.sql` hâlâ 2026-09-24 tarihli, `:198`, `:204` `sort_order` yazıyor; `config.toml:77` yüklüyor | Yeni metin: "`.7` main'de; git dışı `supabase/local-fixture/meyhouse.sql` (09-24) hâlâ silinmiş `departments.sort_order` / `jobs.sort_order` kolonlarına yazıyor (`:198`, `:204`), bu yüzden yerel `db reset` seed adımında düşer; dosya `node scripts/export-local-fixture.mjs` ile yeniden üretilmeli." |
| BL-521 | — (pgTAP) | geçerli | `supabase/tests/management_owner_job.test.sql:224` `todo(…, 2)` duruyor | birleşir → BL-491 |
| BL-535 | — (DB adlandırma) | geçerli | `request_account_deletion_v2_service` hâlâ: `supabase/migrations/20261004000000_announcements_and_dates_ask_the_core.sql`, `apps/api/src/account/account-security-service.ts`, `packages/shared/src/notification-catalog.ts`; `drop function`/`rename` yok (grep 0) | — |
| BL-539 | — (Announcements, bildirim) | geçerli | `app_private.communication_withdraw` (`20261004000000_…:471`, son tanım) alıcı listesini yalnız `status in ('pending','retry')` satırlarda süzüyor (`:494` civarı); o anda gönderilmekte olan satır kapsam dışı | — |
| BL-541 | — (Announcements) | geçerli | `apps/web/src/settings/jobs-settings.css:37-39` `.jobs-settings-page button { font: inherit }` (özgüllük 0,1,1) `apps/web/src/views/announcements-catalog.css:328-335` `.announcement-acknowledge-button { font-size: 12px }`'i eziyor; sayfa `jobs-settings-page` sınıfını taşıyor (`AnnouncementsPage.tsx:145`); düzeltme yalnız `task/fb-6.7-ui`'da (main'e girmemiş) | — |
| BL-542 | — (Announcements, telefon) | geçerli | `announcements-catalog.css:282` ve `:352` `@media (max-width: 650px)` (satırlar kaydı; okuyucu satırı `minmax(0,1fr) auto 36px`); ekranda yeniden ölçülmedi | (satırlar `:282`, `:352`) |
| BL-543 | — (Announcements) | geçerli | `apps/web/src/views/AnnouncementsPage.tsx:585` `transition.mutate("archive")`, `:820` "Confirm delete"; main'de "Restore" yok (grep 0); `task/fb-6.7-ui` @`4d9226cc` main'e girmemiş (`merge-base --is-ancestor` → hayır) | — |
| BL-546 | — (Important Dates) | geçerli | Kod bilerek kabul ediyor: `supabase/migrations/20261005000000_closed_days_reach_the_shifts.sql:134-135` "ponytail: a many-day yearly date edited during one of its own runs keeps that run whole with the old record" | — |
| BL-547 | — (Important Dates) | geçerli | `important_date_keep_past` (`20261005000000_…:136-170`) ayrılan kaydı `insert` ediyor ama `important_date_changes`'a satır yazmıyor; tek history yazımı `save_important_date_service` içinde ana kayıt için (`:605-609`) | — |
| BL-550 | — (Important Dates) | geçerli | `20261005000000_…:505-514` değişmeyen kayıtta geçmiş kontrolü atlanıyor, ama `:568` `revision = revision + 1` koşulsuz ve `:605` history satırı koşulsuz; okuma (`20261004000000_…:1504`) süzmüyor | — |
| BL-553 | EKRAN:Documents | — | (EKRAN-06 OZET'te anılıyor) | — |
| BL-555 | EKRAN:Documents | — | (EKRAN-06 OZET'te anılıyor) | — |
| BL-556 | — (bildirim yetkisi) | geçerli | Yerel DB SELECT: `pg_proc.prosrc` içinde yardımcıyı çağıran tek fonksiyon `public.save_notification_user_preferences_service`; yardımcı duruyor (1 satır) | — |
| BL-558 | EKRAN:Documents | — | — | — |
| BL-563 | — (test/süreç) | geçerli — karar bekliyor | `packages/shared/src/authorization-matrix.expected.json` var, `package.json:16` `dump:authz-matrix`; `.claude/agents/` içinde adım yok (grep 0); Mert 2026-10-04 "şimdilik kalsın" | — |
| BL-565 | EKRAN:Availability | — | — | — |
| BL-566 | EKRAN:Documents | — | (2026-10-06 EKRAN-06 keşfinde birleştirildi) | — |
| BL-567 | EKRAN:Availability | — | — | — |
| BL-568 | EKRAN:Availability | — | — | — |
| BL-569 | EKRAN:Availability | — | — | — |
| BL-571 | EKRAN:Availability | — | (EKRAN-04 OZET'te anılıyor; kural `employee-dashboard.css:990-997` duruyor) | — |
| BL-572 | EKRAN:Availability | — | — | — |
| BL-575 | EKRAN:Availability | — | (EKRAN-04 OZET'te anılıyor; metin `EmployeeOnboardingPage.tsx:869` değişmemiş) | — |
| BL-576 | EKRAN:Availability | — | — | — |
| BL-581 | EKRAN:Documents | — | — | — |
| BL-582 | EKRAN:Documents | — | — | — |
| BL-583 | EKRAN:Documents | — | — | — |
| BL-584 | EKRAN:Documents | — | (Settings → Acknowledgements, belge ailesi) | — |
| BL-592 | EKRAN:Documents | — | (Account → Documents) | — |

## Sayılar
- Toplam 47 madde. EKRAN: 22 (Documents 14, Availability 8). Ölçülen: 25.
- Ölçülen 25'in hükmü: geçerli 22 (ikisi "karar bekliyor": BL-455, BL-563), değişmiş 2 (BL-491, BL-520), bayat 1 (BL-514), ölçülemedi 0.
- Birleşme önerisi: BL-521 → BL-491 (aynı `todo` satırı); BL-447 → BL-504 (yük altında süre aşan web testleri).
