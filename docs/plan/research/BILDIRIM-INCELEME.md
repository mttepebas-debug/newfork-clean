# BILDIRIM — söküm listesi ve olay envanteri

Ölçüm: 2026-10-07, `origin/main` `b63c5150` + yeniden ölçüm `e49ec3e3` üstünde. Salt okur: kod `grep`, yerel DB'de yalnız SELECT (`pg_proc.prosrc`, `pg_trigger`, `cron.job`). Kapsam (Mert, 2026-10-07 ~09:25Z): bugünkü sistem **değerlendirilmez**; bu dosya yalnız (1) sökünce neyin kırılacağını, (2) yeni sistemin girdisi olan olayları yazar. Plan: [`tasks/BILDIRIM.md`](../tasks/BILDIRIM.md).

## Mert için özet

1. **Söküm:** bildirime ait 18 tablo, 50 fonksiyon, 3 tetikleyici, 1 zamanlayıcı, 10 API yolu, 17 web dosyası, 5 shared dosyası ve 10 test dosyası silinecek. Bunları çağıran **21 başka fonksiyon** düzenlenecek (duyuru, önemli tarih, izin, takas, müsaitlik, belge, işten çıkarma, program yayını).
2. **Sökerken korunması gereken 5 iş var**, çünkü bugün bildirim kodunun içinde çalışıyorlar: belge süresi geçen çalışanın kısıtlanması, süresi dolan takasın kapanması, takas geçmişi kaydı, hesap güvenliği denetim kaydı ve Workspace ana sayfasındaki belge işleri. Bunlar taşınmadan söküm yapılırsa sessizce bozulurlar (§1.1).
3. **Ayrı e-posta yolları bildirim değil, sökümde kırılmaz:** davet, parola sıfırlama, haftalık Schedule e-postası ve hesap silme e-postaları kendi kodundan (Resend) gidiyor. Bildirim koduna bağları yok (§1.2).
4. **Olay envanteri:** uygulamada 162 olay; her biri için tetikleyen, etkilenen ve karar veren (P07). Bugün 77'si mesaj üretiyor; kural 18 yerde bildirim istiyor ama gitmiyor; 10 yerde fazla kişiye gidiyor (§2).

## 1. Söküm listesi

Amaç eskiyi anlamak değil, sökünce neyin kırılacağını bilmek (DERSLER 2026-10-02: silinecek fonksiyonun çağıranına bak). Çağıranlar iki yerden ölçüldü: veritabanında fonksiyon gövdeleri (`pg_proc.prosrc`, kelime sınırıyla), kodda `grep` (`apps/`, `packages/`, `e2e/`, `supabase/tests/`).

### 1.1 Bildirim kodunun içinde yaşayan iş: sökerken korunur

| # | İş | Bugün nerede | Tek çağıranı | Taşınmadan sökülürse | Söküm dilimi ne yapar |
|---|---|---|---|---|---|
| K1 | Belge son tarihi geçen çalışanı kısıtlama (`employee_onboarding_requirements.document_suspended_at`) | `documents_maintain_service` (`schema.sql:9308-9350`, kısıtlama satırı yorumla birlikte ~`:9322-9324`) | bildirim işçisi `apps/api/src/notifications/notification-outbox-worker.ts:70-83` (zamanlayıcı `notification-outbox`, her dakika) | Süresi geçen belge kişiyi artık kısıtlamaz (KARARLAR K:87 "Kısıtlı kişi"); sessiz | Fonksiyonun bildirim satırları çıkar, kısıtlama kalır; yeni bir bakım zamanlayıcısına (`/api/internal/cron/maintenance`) taşınır |
| K2 | Süresi dolan / geçersiz takas vakasını kapatma | `shift_exchanges_maintain_service` (`:24263-24292`) | aynı işçi | Süresi geçmiş takas "open" kalır (vaka açıldığında tembel kapanış ayrıca var, `:24158`) | Aynı bakım zamanlayıcısına taşınır; `shift_exchange_emit` çağrısı kalır |
| K3 | Takas geçmişi (`shift_exchange_events` satırı) | `shift_exchange_emit_notification_base` içinde (`:23628-23631`) | `shift_exchange_emit` (16 çağıran) | Shift Hub vaka geçmişi yazılmaz | `insert` `shift_exchange_emit`'e taşınır, bildirim kısmı silinir |
| K4 | Hesap güvenliği denetim kaydı (`app_private.security_audit_events`) | `record_account_security_notification_service` (`:17869-17881`) → `record_security_audit_event_service` | API `apps/api/src/account/account-security-service.ts:240` | Parola / e-posta değişikliği denetim izine yazılmaz | API denetim fonksiyonunu doğrudan çağırır; bildirim adlı sarmalayıcı silinir; tetikleyici `project_account_security_notification` silinir |
| K5 | Workspace ana sayfasındaki belge süresi işleri (to-do) | `sync_expiring_document_todos_service` (`:24699`), çağıran `get_workspace_dashboard_service` (`:12106`); aynı ana sayfa eski `notifications` tablosunu okuyor (`:12116-12119`) | Workspace ana sayfası | İşler üretilmez; ana sayfa okuması hata verir (silinmiş tabloyu okur) | To-do üretimi kalır, bildirim satırı çıkar; ana sayfadaki bildirim kutucuğu ve sayaç kalkar |

Ayrıca dokunulacak ama silinmeyecek: zamanlayıcılar `announcements-due` (`app_private.announcement_release`) ve `time-off-deadlines` (`app_private.time_off_sweep`) domain işi yapıyor (zamanlanmış yayın, süresi dolan izin); kalırlar, yalnız içlerindeki bildirim çağrısı çıkar. Domain tablolarındaki üç tetikleyici silinir, tablolar kalır (`schedule_time_off_events`, `onboarding_events`, `app_private.security_audit_events`). Shift Hub'ın `shift-exchanges:<ws>` canlı sinyali domain kodundan da gidiyor (`:3334, 5712, 18102, 24253, 24286`); bildirim işlemesindeki kopyası (`:16617-16622`) silinince Shift Hub yenilenmeye devam eder (e2e ile doğrulanacak).

### 1.2 Ayrı e-posta yolları: bildirim değil, dokunulmaz

| E-posta | Kod | Bildirim koduna referans | Zamanlayıcı |
|---|---|---|---|
| Çalışan daveti ve hatırlatma | `apps/api/src/employees/invitation-service.ts:319-342`, `employee-create-service.ts:56-86` | 0 | — |
| Parola sıfırlama | `apps/api/src/account/password-reset.ts:93-121` | 0 | — |
| Haftalık Schedule e-postası | `apps/api/src/schedule/schedule-export-cron.ts`, `schedule-export-cron-routes.ts` | 0 | `scheduled-exports` (5 dk) |
| Hesap silme kurtarma ve hatırlatma | `apps/api/src/account/account-security-service.ts:359-385`, `account-deletion-worker.ts:113-144` | işçi 0; servis dosyası karışık (aşağıda) | `account-deletion` (günlük) |
| Ortak istemci | `apps/api/src/email/resend-email.ts` | 0 | — |
| Kayıt ve e-posta değişikliği doğrulama | Supabase Auth (`apps/web/src/auth/AuthContext.tsx:284`) | 0 | — |

Karışık dosya: `account-security-service.ts` hem kurtarma e-postasını gönderir hem bildirim fonksiyonlarını çağırır (`:240` denetim, `:243-254` bildirim tercihleri ve kutusu). Söküm yalnız `:240-254`'e dokunur. `request_account_deletion_v2_service` hesap silmede davetleri iptal eder ve davet edenlere bildirim kuyruğa koyar (`schema.sql:18716-18760`); iptal kalır, bildirim çıkar.

### 1.3 Silinecek veritabanı nesneleri ve çağıranları

**Giriş noktaları** (veritabanında çağıranı yok; dışarıdan çağrılıyor):

| Fonksiyon | Dışarıdan çağıran |
|---|---|
| `get_notification_inbox_v2_service` (8 parametre) | API `communications/communication-service.ts:185-207` (workspace kutusu ve `/v1/account/notifications`) |
| `get_notification_inbox_v2_service` (5 parametre) | yalnız test (`authorization_matrix.test.sql:529` ve 7 dosya) |
| `act_on_notification_inbox_item_v2_service` | API `communication-service.ts:208-216` |
| `get_notification_settings_service`, `save_notification_policy_service`, `reset_notification_policies_service`, `preview_notification_policy_service` | API `notifications/notification-settings-service.ts:80-123` |
| `get_notification_user_preferences_service` | API `notification-settings-service.ts:124-138`, `account/account-security-service.ts:243-246` |
| `save_notification_user_preferences_service` | API `notification-settings-service.ts` |
| `record_account_security_notification_service` | API `account-security-service.ts:240` (K4) |
| `flush_shift_exchange_notifications_service` | API `shift-exchanges/shift-exchanges-service.ts:110` |
| `lease_` / `process_` / `fail_notification_outbox_service` | API işçisi `notification-outbox-worker.ts:125-167` |
| `notify_schedule_request_event_service` | tetikleyici `notify_time_off_event` (`schedule_time_off_events`) |
| `app_private.notify_document_audit` | tetikleyici `document_notification_audit` (`onboarding_events`) |
| `app_private.project_account_security_notification` | tetikleyici aynı adlı (`app_private.security_audit_events`) |
| `reconcile_notification_platform_service` | yalnız test (7 pgTAP dosyası) |

**İç zincir** (çağıranların hepsi de silinecek): `enqueue_notification_outbox_service` · `process_notification_outbox_before_signal` · `project_notification_event_service` · `project_notification_recipients_service` · `project_schedule_notification_recipients_service` · `project_notification_inbox_service` · `project_notification_inbox_exchange_base` · `resolve_notification_policy_v1_service` · `notification_default_channels_service` · `notification_user_channel_lock_reason_service` + `_workspace_base` · `notification_user_preference_to_json` · `notification_actor_is_active_member_service` · `get_notification_user_preferences_workspace_base` · `act_on_notification_inbox_workspace_base` · `get_notifications_service` (çağıranı K5) · `shift_exchange_notification_allowed` · `shift_exchange_notification_policy_service` · `shift_exchange_sync_notifications` · `shift_exchange_emit_notification_base` (K3) · `notify_time_off_shortened` · `app_private.`: `announcement_deliver`, `important_date_deliver`, `important_date_tell_removed`, `communication_withdraw`, `document_account_inbox_action_base`, `document_account_inbox_allowed`, `document_notification_policy`, `enqueue_document_notification`, `document_notify_access`, `time_off_notice`, `time_off_notify_shifts_opened`.

**Düzenlenecek domain fonksiyonları (21)** — silinecek bir nesneyi çağırıyorlar, kendileri kalıyor:

| Domain fonksiyonu | Çağırdığı (silinecek) | Alan |
|---|---|---|
| `app_private.announcement_release` | `announcement_deliver`, `communication_withdraw` | Duyuru (zamanlanmış yayın, süre dolumu) |
| `publish_announcement_service` | `announcement_deliver` | Duyuru |
| `save_announcement_audience_service` | `announcement_deliver`, `communication_withdraw` | Duyuru |
| `set_announcement_state_service` | `communication_withdraw` | Duyuru |
| `save_important_date_service` | `important_date_deliver`, `important_date_tell_removed`, `communication_withdraw` | Önemli tarih |
| `set_important_date_state_service` | aynı üçü + `notification_inbox_items` / `notification_recipients`'ı doğrudan okuyor | Önemli tarih |
| `app_private.time_off_release_shifts` | `time_off_notify_shifts_opened` | İzin |
| `app_private.time_off_sweep` | `time_off_notice` | İzin (zamanlayıcı) |
| `app_private.shorten_time_off` | `notify_time_off_shortened` | İzin |
| `shift_exchange_emit` | `shift_exchange_emit_notification_base`, `shift_exchange_sync_notifications` | Takas (K3) |
| `request_employee_preferred_name_service` | `enqueue_notification_outbox_service` | Çalışan |
| `decide_employee_preferred_name_service` | aynı | Çalışan |
| `remove_employee_from_location_service` | aynı | Çalışan |
| `terminate_employee_service` | `employee_offboarding_followups` (yazar, okuyan yok) | Çalışan |
| `request_account_deletion_v2_service` | `enqueue_notification_outbox_service` | Hesap |
| `publish_schedule_draft_service` | aynı; ayrıca `target_notify_employee_ids` parametresi | Schedule |
| `weekly_preferences_save_service` | aynı | Müsaitlik |
| `weekly_preference_settings_save_service` | aynı | Müsaitlik |
| `documents_maintain_service` | `document_notify_access`, `enqueue_document_notification` | Belge (K1) |
| `sync_expiring_document_todos_service` | `enqueue_notification_outbox_service` | Belge (K5) |
| `get_workspace_dashboard_service` | `get_notifications_service`, eski `notifications` tablosu | Workspace (K5) |

`shift_exchange_emit`'i çağıranlar (`important_date_close_shifts`, `time_off_release_shifts`, `refresh_weekly_exchange_terms`, `shift_exchanges_command_service`, `shift_exchanges_maintain_service`) imza aynı kaldığı sürece değişmez.

**Tablolar (18) ve onları okuyan / yazan fonksiyon sayısı:** `notification_outbox` 20 · `notification_catalog` 15 · `notification_inbox_items` 9 (biri domain: `set_important_date_state_service`) · `notification_recipients` 9 (aynı domain) · `notification_audit_log` 6 · `notification_events` 5 · `notification_org_policies` 5 · `notifications` (eski kutu) 5 (biri domain: `get_workspace_dashboard_service`) · `account_notification_items` 3 · `notification_template_versions` 3 · `notification_user_preferences` 3 · `notification_recipient_decisions` 1 · `notification_producer_registry` 1 · `notification_consents` 1 · `notification_endpoints` 1 · `notification_delivery_attempts` 0 · `app_private.document_notification_dedup` 1 · `app_private.notification_legacy_default_accounts` 1. Ayrıca `employee_offboarding_followups` (yazan `terminate_employee_service`, okuyan yok) ve tür `notification_category`.

**Öteki nesneler:** tetikleyiciler `notify_time_off_event`, `document_notification_audit`, `project_account_security_notification`; zamanlayıcı `notification-outbox` (jobid 2; K1–K2 taşınmadan silinmez); politika `account_notification_self_read`; Realtime politikası "people hear their own account notifications" ve `account_notification_items`'ın `supabase_realtime` yayın üyeliği; ölü indeksler `notification_outbox_staffing_delivery`, `notifications_staffing_subject`; domain tablolarında bildirim durumu sütunları `announcements.delivered_to`, `important_dates.delivered_to`, `employee_onboarding_cases.document_notification_checked_at` / `document_notified_restricted`, `shift_exchange_events.notification_sequence` (K4 / K7 kuralları yeni sistemde yeniden bağlanana kadar `delivered_to` kalır).

**İzinler ve yetki:** `notifications.settings.read`, `.settings.write`, `.test_send`, `.delivery_audit.read`, `.dlq.replay`, `.broadcast.approve` silinir; çekirdek eylemleri `settings.notifications.read/write` silinir. `notifications.read`, `notifications.read_own`, `notifications.preferences.write_own` yeni sistemde kalır. Etkilenen yerler: `app_private.role_default_permissions` (`schema.sql:4613-4618`), Settings → Roles ekranının izin listesi (`packages/shared/src/role-permissions.ts`, `authorization.ts`), yetki matrisi ve dökümü, GUVENLIK-A'nın GA-2 / GA-3 işi (KK-206).

**EKRAN-02 dalları:** `task/ekran-02-a1a2` `shift_exchange_emit_notification_base` ve `shift_exchange_notification_allowed`'ı; `task/ekran-02-a3` bunlara ek olarak `notify_schedule_request_event_service`, `notify_time_off_shortened` ve `time_off_notify_shifts_opened`'ı yeniden yazıyor. Söküm bu dallar main'e girdikten sonra yapılır; dalların karar kuralı (`app_private.exchange_decision_reason`) yetki için de kullanıldığı için kalır.

### 1.4 Silinecek ve düzenlenecek dosyalar

Satır sayısı `wc -l`, bütün dosya. **SİL** = yalnız bildirim için. **DÜZENLE** = bildirime dokunan satırları çıkar.

| Paket | SİL | DÜZENLE |
|---|---|---|
| apps/api | 7 dosya / 1.575 satır | 17 dosya |
| apps/web | 17 dosya / 3.332 | 43 dosya |
| packages/shared | 5 dosya / 1.510 | 6 dosya |
| e2e | 0 | 5 dosya / 1.056 |
| supabase/tests | 10 dosya / 1.489 | 37 dosya (47 / 172 dosya bildirime değiyor) |

- **apps/api SİL:** `notifications/notification-outbox-routes.ts` 42, `notification-outbox-worker.ts` 196 + test 252 (K1–K2 önce taşınır), `notification-settings-routes.ts` 201 + test 513, `notification-settings-service.ts` 139 + test 232.
- **apps/api DÜZENLE:** `app.ts` + test (rota kaydı), `communications/communication-routes.ts` + test, `communication-service.ts` + test, `account/account-security-routes.ts` + test, `account-security-service.ts` + test (yalnız `:240-254`), `shift-exchanges/shift-exchanges-service.ts` + test (`:110` boşaltma çağrısı), `schedule/schedule-routes.ts` (`:161, 625`), `schedule-service.ts` + test (`:269, 881`), `route-error-contract.test.ts`, `service-error-contract.test.ts`.
- **apps/web SİL:** `views/NotificationsPage.tsx` 452, `communications/NotificationShiftDetails.tsx` 203 + test 337 + css 127, `communications/use-account-notification-realtime.ts` 18, `documents/DocumentNotificationRedirect.tsx` 18 + test 22, `account/NotificationPreferencesPage.tsx` 225 + test 313 + `notification-preferences-data.ts` 55 + test 88 + css 215, `settings/NotificationSettingsPage.tsx` 512 + test 334 + `notification-settings-data.ts` 87 + test 74 + css 252.
- **apps/web DÜZENLE:** `App.tsx` + test (rotalar `:257-263, 276-281, 450, 481-492`), `shell/AppShell.tsx` (menü öğesi ve rozet `:161-167, 184-252, 268, 321, 362-380`) + `AppShellNotificationBadge.test.tsx`, `communications/communications-data.ts` + test, `action-url.ts` + test (duyurular da kullanıyor, kalır), `employee-hub/DashboardCommunications.tsx`, `EmployeeDashboard.tsx` (`:120, 422, 461`), `EmployeeMobileNav.tsx` (`:79-105`), `shift-exchanges/exchange-data.ts` (`:145`), `views/WorkspacePage.tsx` + test (K5 kutucuğu), `AnnouncementsPage.tsx` (`:542, 577`), `SchedulePage.tsx` (`:3147-3180` yayın toast'ı), `ScheduleRequestsPage.tsx` + test, `CommunicationPages.test.tsx`, `EmployeeHubPage.test.tsx`, `MainNavigationHeaderContract.test.ts`, `list-page.css`, `account/AccountLayout.tsx` (`:28-32`), `settings/SettingsLayout.tsx` (`:42-47`), `SettingsHomeRedirect.tsx` (`:18-20`), `NotificationSettingsNavigation.test.tsx`, `SettingsPageAlignment.test.ts`, `auth/PermissionRoute.tsx`, `tenant-query-cache.ts`, `schedule/components/PublishScheduleDialog.tsx` + test ("Notify" adımı), `schedule-data.ts` (`:476, 502-503`), `styles.css` (~170 satır: `9160-9270`, `13410-13442`, `13841-13985`, `14014`), `lib/refusal-reaches-screens.test.ts`, `shell/AppSidebarPanel.test.tsx`, `EmployeeViewSwitch.test.tsx`, `ManagementMobileNav.test.tsx`, `dev/FeedbackGalleryPage.tsx`, `dev/feedback-catalog.ts`.
- **packages/shared SİL:** `notification-catalog.ts` 426 + test 226, `notification-display.ts` 287, `notification-settings.ts` 315 + test 256. **DÜZENLE:** `index.ts` + test (dışa aktarımlar `:34-36`, izinler `:132-140`, yayın sonucu `:2008-2016`), `communications.ts` (`:146-199, 297-300`), `authorization.ts`, `role-permissions.ts`, `authorization-matrix.expected.json` (üretilir).
- **e2e DÜZENLE:** `flows/announcement-reaches-its-people.spec.ts` (`:97` kuyruk sorgusu), `schedule-availability-warning.spec.ts` (`:398`), `shift-hub-time-off.spec.ts` (`:76`), `employee-onboarding.spec.ts` (`:131-132` `/account/inbox`), `time-off-approval.spec.ts` (`:153` metin).
- **supabase/tests SİL:** `notification_platform_core` 309, `notification_outbox_relay` 231, `notification_preference_resolver_and_producers` 201, `notification_settings_admin` 174, `notification_user_preferences` 146, `bl052_document_notifications` 96, `notification_schedule_publish_atomic` 90, `shift_exchange_immediate_inbox` 89, `bl052_document_account_inbox` 84, `account_notification_scope` 69; `live_updates_are_private` 80 dosyası kalır, bildirim konusu çıkar. **DÜZENLE:** `shift_exchanges_v1`, `communication_operations`, `authorization_coverage`, `retired_objects_stay_gone`, `announcements_and_dates_edge_cases`, `time_off_opens_shifts`, `weekly_exchange_changed_terms`, `past_dates_and_ended_announcements`, `time_off_shortens_for_a_shift`, `preferred_name_approval` ve 26 hafif dokunan dosya (`closed_days_reach_the_shifts`, `time_off_voting`, `authorization_matrix`, `authz_catalog`, `workspace_rls` …). `supabase/test-support/builder.sql`'de bildirim yok.

### 1.5 `retired_objects_stay_gone`'a girecekler

Testte bugün zaten olanlar: türler `time_tracking.%`, `availability.review_required`, `schedule.staffing.%`, `schedule.owner_time_off.shifts_opened`; `lineup_notification_outbox`; `act_on_notification_service`, `heartbeat_notification_outbox_service`, `resolve_notification_in_app_policy_v1_service`, `save_notification_user_preference_service`, `create_schedule_publish_notifications_service`, Line Up bildirim fonksiyonları, `availability_notify`, `*_legacy_notifications`, `notify_owner_time_off_open_shifts`, `synchronize_announcement_notification_lifecycle_service`.

Eklenecekler: §1.3'teki 18 tablo, 50 fonksiyon (51 imza; giriş noktaları + iç zincir), 3 tetikleyici, `notification_category` türü, `notification-outbox` zamanlayıcısı, iki politika, 6 izin ve 2 çekirdek eylemi. `authz_catalog` sayaçları düşer: yasaklı adlı fonksiyon 12 → 2, `service_actor_has_permission` çağıranı 10 → 6, `auth.uid()` kullanan politika bir eksik.

## 2. Olay envanteri

**162 olay; bugün 77'si mesaj üretiyor** (71'i uygulama içi bildirim, 6'sı yalnız e-posta), **85'i üretmiyor**. Alanlar arası tekrarlar tek sayıldı (ör. izin vardiya açtı yalnız Requests'te, işten çıkarma yalnız Employees'te). "Bugün" sütununda ✗ = mesaj yok.

| Alan | Olay | Bugün mesaj | Eksik (kural istiyor, yok) | Gürültü riski yüksek |
|---|---|---|---|---|
| Schedule | 22 | 5 | 4 | 1 |
| Requests + Availability | 41 | 35 | 3 | 4 |
| Employees + Documents + katılım | 47 | 18 | 6 | 3 |
| Duyuru + Önemli tarih + Settings + Account + üyelik + platform + faturalama | 52 | 19 | 5 | 2 |
| **Toplam** | **162** | **77** | **18** | **10** |

Kısaltmalar: **K:** = `KARARLAR.md` satırı; **S:** = `schema.sql` satırı; **Ö** = önerilen alıcı (ILKELER P07: karar veren + işi doğrudan etkilenen; admin gürültüsü yok, Mert'in açık istisnaları korunur).

### 2.1 Schedule (22)

| # | Olay | Tetikleyen → etkilenen | Bugün | Kural | Ö | Gürültü |
|---|---|---|---|---|---|---|
| SCH-01 | Düzenleme kilidi başkasında | düzenleyen → öteki düzenleyen | ✗ (ekranda ad) | K:472 | yok | — |
| SCH-02 | Kilit düşünce "Auto-save" taslağı | sonraki → önceki | ✗ | KK-162 K:517 "bildirim yok" ✓ | yok | — |
| SCH-03 | Hareketsizlikte otomatik taslak | sistem | ✗ | K:508 ✓ | yok | — |
| SCH-04 | Taslakta vardiya ekle/değiştir/sil, yapıştır | düzenleyen | ✗ (canlı kanal) | K16 "taslak söz değildir" ✓ | yok | — |
| SCH-05 | Şablon, otomatik doldurma, geri al | düzenleyen | ✗ | ✓ | yok | — |
| SCH-06 | Taslak / şablon kaydet, sil | düzenleyen | ✗ | ✓ | yok | — |
| SCH-07 | Kapalı gün taslağa düşer | yazar | ✗ | K16 ✓ | yok | — |
| SCH-08 | Taslak açıkken başkası yayınlar | başka yayınlayan | ✗ (yayın penceresinde uyarı satırı) | K:473 ✓ | yok | — |
| SCH-09 | Hafta yayını (ilk) | yayınlayan → vardiyalı çalışanlar | ✓ `schedule.published`, S:17243; "Notify" adımında yayınlayanın seçtikleri; içeriksiz metin "week of 2026-10-12" | kural yok (K:175 "baştan tasarlanacak") | vardiyası olanlar, otomatik | düşük |
| SCH-10 | Yeniden yayın: saat/gün/iş/not değişti | yayınlayan → değişen kişi | ✓ aynı tür; her seferinde yeni, içeriksiz satır; birleştirme kuralı kayıtlı ama okunmuyor (S:28224) | yok | değişen kişi, tek satırda birleşik | **orta-yüksek** |
| SCH-11 | Yeniden yayın: vardiya Ali → Bob | yayınlayan → Ali, Bob | kısmi: Bob ✓, **Ali ✗** (S:16288-16295 ✓) | yok | Ali + Bob | düşük |
| SCH-12 | Yeniden yayın: vardiya açığa alındı | yayınlayan → Ali | **✗** (S:16295) | yok | Ali | düşük |
| SCH-13 | Yeniden yayın: vardiya silindi | yayınlayan → Ali | kısmi: listede görünür, başka vardiyası yoksa düşer (S:17228-17236) | yok | Ali | düşük |
| SCH-14 | Açık vardiyayla yayın | yayınlayan → uygun çalışanlar | ✗ (yalnız Shift Hub listesi) | yok | → Soru 6 | yüksek (yayılırsa) |
| SCH-15 | Yumuşak uyarının üstüne yayın | yayınlayan | ✗ | K:451 ✓ | yok | — |
| SCH-16 | Yayın reddedildi | yayınlayan | ✗ (ekranda hata) | ✓ | yok | — |
| SCH-17 | Başlamış vardiyayı düzenleme | düzenleyen → atanan | çelişki: uyarı "Employees will not be notified" (S:21994), sonraki yayın yine bildirebilir | yok | atanan (değişirse) | düşük |
| SCH-18 | Yayından kaldırma | yayınlayan → haftadakiler | **✗**; eski bildirim kutuda kalır, boş haftaya götürür | yok | vardiyası olanlar ("removed") | düşük |
| SCH-19 | Başka lokasyonda planlanan çok lokasyonlu kişi (ghost) | öteki müdür | ✗ | K:428 | yayında SCH-09 yeter | — |
| SCH-20 | "Vardiyan yaklaşıyor" hatırlatması | sistem → atanan | yok (özellik yok) | yok | MVP dışı önerisi | orta |
| SCH-21 | "Bu hafta yayınlanmadı" hatırlatması | sistem → müdür | yok | yok | MVP dışı önerisi | orta |
| SCH-22 | Zamanlanmış haftalık program e-postası | kural sahibi → adresler | ✓ e-posta (Resend; canlıda anahtar yok) | K:418, :521, :526 | kural sahibinin seçtiği | düşük |

### 2.2 Requests + Availability (41)

İzin (17):

| # | Olay | Bugün | Kural | Ö | Gürültü |
|---|---|---|---|---|---|
| T01 | İzin talebi | ✓ `requests.time_off.submitted` S:15188 → karar verenler (ort. 5,9, en çok 14) | K:124-127 | karar verenler ✓ | düşük-orta |
| T02 | Owner'ın kendi izni (onaysız) | kısmi: yalnız "vardiya açıldı" müdürlere; alıcısız boş kuyruk satırı | K:75 ✓ | vardiyası açılan lokasyon müdürleri | düşük |
| T03 | Çok lokasyonda kısmi oy ("waiting: Beşiktaş") | ✗ | K:124, :126 ✓ | yok | — |
| T04 | Son onay | ✓ çalışana **sonucu söylemeyen** "Time-off request updated"; öteki karar verenlere "Time off approved"; + T05 | K:124, :130 | çalışana sonuçlu tek; ötekilerin açık işi kapanır | **orta** (aynı müdüre iki) |
| T05 | Onaylı izin vardiya açtı | ✓ `schedule.time_off.shifts_opened` S:5599 → müdürler (admin/owner hariç; müdür yoksa kimse) | K:130 | T04'e katılır; müdürsüz lokasyonda admin/owner | orta |
| T06 | Ret | ✓ çalışana genel metin + ötekilere "declined" | K:124 | çalışan + açık işi kapanır | düşük |
| T07 | Çalışan geri çekti | ✓ karar verenlere; "withdrawn" ile "revoked" aynı başlık | K:126 | karar verenlerin işi kapanır | düşük |
| T08 | Yönetici iptal etti (revoke) | ✓; bekleyen iptal talebi varsa iki çift bildirim (S:20452-20457) | K:126 | çalışan, tek | orta |
| T09 | Süre doldu, otomatik ret | ✓ | K:126 | çalışan + işi kapanır | düşük |
| T10 | Sistem otomatik onay (lokasyon düştü) | ✓ T04 + T05 | K:124, :125 | T04 gibi | orta |
| T11 | Son karara 12 saat | ✓ `requests.time_off.reminder` S:5892, bir kez | K:126 ✓ | onaylamayan lokasyonun müdürleri | düşük |
| T12 | "Admin bekliyor" | ✓ S:5866, bir kez; T11 ile tek satır | K:125, :131 ✓ | admin/owner | düşük |
| T13 | Etki değişti, oy sıfırlandı | ✓ `review_again` S:5843 | K:130 ✓ | o müdür | düşük |
| T14 | Onaylı iznin iptal talebi | ✓ T01 yolu | K:126 ✓ | karar verenler | düşük |
| T15 | İptal talebi karara bağlandı | ✓ ama onayda iki kez (S:5430) | K:126 | çalışan + işi kapanır, tek | orta |
| T16 | Müdür izni kısalttı | ✓ yalnız son onaylayana + çalışana; "is back on the schedule" metni (BL-396) | K:166 | çalışan + bütün onaylayanlar | düşük |
| T17 | Çalışan izinli gününde vardiya aldı | ✓ `shortened`; tek lokasyonda onaylayan çoğu zaman aynı kişi → kimseye | K:166 ✓ | izni onaylayan | düşük |

Vardiya değişikliği (takas, cover, pickup) (16):

| # | Olay | Bugün | Kural | Ö | Gürültü |
|---|---|---|---|---|---|
| S01 | Takas teklifi | ✓ arkadaşa | K:169 ✓ | arkadaş | düşük |
| S02 | İsimle cover isteği | ✓ arkadaşa | K:169 ✓ | arkadaş | düşük |
| S03 | Havuza cover açıldı | ✓ **her uygun çalışana ayrı** (ort. 5,2, en çok 11) | **kural yok** | → Soru 6 | **yüksek** |
| S04 | Arkadaş kabul etti | ✓ sahibe + **incelemecilere: owner, bütün admin'ler, öteki müdürler** (owner 138, admin 138, müdür 428) | **KK-158 K:552 ✗** | sahip + karar verecek lokasyon müdürü; müdür yoksa admin/owner | **yüksek** |
| S05 | Arkadaş reddetti | ✓ sahibe | — | sahip | düşük |
| S06 | Bırakılan vardiyaya başvuru | ✓ sahip + geniş incelemeci (ort. 7,3) | K:552 ✗ | sahip + karar veren müdür | orta-yüksek |
| S07 | Açık vardiyaya başvuru | ✓ incelemecilere | K:552 | lokasyon müdürü | orta |
| S08 | Başvuran geri çekti | kısmi | — | sahip | düşük |
| S09 | Müdür başvuruyu reddetti | ✓ başvurana **ve sahibe, gerekçeyle** (BL-910) | K:548 | başvuran (gerekçeyle) + sahip (genel metin) | düşük |
| S10 | İki lokasyonlu takasta ilk onay | ✓; her basışta yeniden (R2-18) | K:552 | öteki lokasyonun müdürü | orta |
| S11 | Son onay | ✓ kişiye göre metin; kaybedenlere "Another teammate was selected" | K:169 ✓ | katılımcılar | orta |
| S12 | Arama kapatıldı | ✓ | — | katılımcılar | düşük |
| S13 | Süre doldu (vardiya başladı) | ✓ | — | katılımcılar | düşük |
| S14 | Bekleyen talepte müdür vardiyayı değiştirdi | ✓ "Existing acceptances remain valid"; çakışan kabul **hiç düşmüyor** | **K:170 ✗** | katılımcılar + karar veren | orta |
| S15 | Vaka geçersiz (vardiya değişti, kapalı gün, izin) | ✓ | K14 benzeri | katılımcılar, tek | düşük |
| S16 | Owner'ın kendi takası | ✓ | K:546 ✓ | karar veren müdür (admin yedek) | düşük |

Müsaitlik (8):

| # | Olay | Bugün | Kural | Ö | Gürültü |
|---|---|---|---|---|---|
| A01 | Çalışan haftasını kaydetti | ✓ `availability.weekly_updated` → müdürler + admin'ler + owner (ort. 4,9, en çok 16) | **K:72 (Mert, 2026-09-26: rütbe şartı yok)** ✓ | K:72 korunur | **yüksek** |
| A02 | Değişiklik olmadan kaydetti | ✓ yine bildirim | EKRAN-04 K3 / BL-790 ✗ | yok | orta |
| A03 | Owner müsaitlik modunu değiştirdi | ✓ bütün çalışanlara (davetliler dahil); haftası olmayana da "converted" | M4 K:140 ✓ / BL-793 ✗ | bütün çalışanlar, doğru metinle | orta (tek sefer) |
| A04 | "Availability onboarding required" anahtarı | ✗ | — | yok | — |
| A05 | Müsaitlik bekleyen istekle çakıştı | ✗ | M5 K:141 ✓ | yok | — |
| A06 | Terfide müsaitlik silindi | ✗ | M14 K:150 ✓ | yok | — |
| A07 | Yönetici notu | ✗ | — | yok | — |
| A08 | Vardiya tipinin saati değişti, işaretler kaydı | ✗ | EKRAN-04 S3 açık | — | düşük |

### 2.3 Employees + Documents + katılım (47)

| # | Olay | Bugün | Kural | Ö | Gürültü |
|---|---|---|---|---|---|
| J01 | Davet gönderildi | ✓ **e-posta** (Resend; canlıda yok); workspace ve davet edenin adı yok | K:246 | davetli | düşük |
| J02 | Davet hatırlatması / yeniden gönder | kısmi: yalnız teslim başarısızsa | K:375 ✗ | davetli | düşük |
| J03 | Davet geri alındı | ✗ | — | yok | — |
| J04 | Davetli hesabını sildi → davet iptal | ✓ davet edenlere; metin hesap silmeyi açıklıyor (gizlilik) | — | davet eden, genel metin | düşük |
| J05 | Davet süresi doldu | ✗ (durum tembel değişir) | — | davet eden (soru değil, öneri) | düşük |
| J06 | Davet kabul edildi | ✗ | — | yok | — |
| J07 | Davet reddedildi | ✗ | — | davet eden | düşük |
| J08 | Kayıt e-postası doğrulama | ✓ Supabase e-postası | — | kişi | — |
| O01 | Onboarding başladı | ✗ | — | yok | — |
| O02 | Onboarding incelemeye gönderildi | **✗** | K:100, K:175 | lokasyon müdürü; yoksa admin/owner | orta |
| O03 | Adım onaylandı | ✗ | — | O06'ya katılır | — |
| O04 | Adımda düzeltme istendi | **✗** | — | çalışan (gerekçe yalnız uygulamada) | düşük |
| O05 | Resmî ad düzeltme önerisi | **✗** | K:90 | owner + admin'ler (alt rütbe için) | düşük |
| O06 | Onboarding tamamlandı | **ölü üretici** | — | çalışan | düşük |
| O07 | Bekleyen onboarding'den ayrıldı | ✗ | — | davet eden (bilgi) | düşük |
| N01 | Tercih edilen ad istendi | ✓ owner + admin'ler + müdürler; ilk karardan sonra ötekilerde kalır | K5 (Mert 2026-10-06) ✓ | K5 korunur, karar verilince kapanır | orta |
| N02 | Tercih edilen ad otomatik yayın | ✓ aynı kişilere | K:272 ✓ | K:272 | orta-yüksek |
| N03 | Tercih edilen ad onaylandı | ✓ çalışana | K:273 ✓ | çalışan | düşük |
| N04 | Reddedildi / yenisiyle değişti | ✗ | K:273 ✓ (sessiz) | yok | — |
| N05 | Resmî ad doğrudan değişti | ✗ | K11 | çalışan (bilgi) | düşük |
| N06 | Profili yönetici düzenledi | ✗ | — | yok | — |
| N07 | Rol değişti / terfi | ✗ | M14 | kişi (bilgi) | düşük |
| N08 | Lokasyon eklendi | ✗ | — | yok | — |
| N09 | Bir lokasyondan çıkarıldı (öteki kaldı) | ✗; gelecekteki vardiyaları sessizce açılır | K:79, :410 | vardiya açıldıysa o lokasyonun öteki müdürü | düşük |
| N10 | Son lokasyondan çıkarıldı | ✓ işten çıkarabilenlere (owner 1, admin 5 yerel); metin "End their employment" ama ekran izin vermiyor (BL-765) | K:79 ✓ | K:79 | düşük-orta |
| N11 | Uygulama erişimi kaldırıldı | ✗ | — | yok | — |
| N12 | Tamamen işten çıkarma | **✗**; takip satırı yazılır, kimse okumaz | **KK-174 K:369 ✗** | boşalan yayınlanmış vardiyanın lokasyon müdürü | düşük |
| N13 | Arşiv | ✗ | — | N12 gibi | — |
| N14 | Geri alma (Restore) | **✗** | **K:374 / S1 satır 10 ✗** | dönen kişi (e-posta + uygulama), lokasyon müdürü | düşük |
| N15 | Sahiplik devri başladı | ✗ (yalnız Account sayacı) | — | hedef kişi | düşük |
| N16 | Devir kabul / ret / iptal / süre | ✗ | — | karşı taraf | düşük |
| N17 | Üye ayrıldı | yok (özellik yok) | — | — | — |
| D01 | Kural yeni belge istedi | ✗ hemen; ertesi sabah 09:00 "missing" | K:96-100 | çalışan, toplu tek | orta |
| D02 | "Ask for a document" | özellik yok (BL-554) | K:98 | çalışan; isteyenin adı yok | düşük |
| D03 | İstek yeniden açıldı | ✓ | — | çalışan | düşük |
| D04 | Muafiyet / süre uzatma | ✗ | K:97 | çalışan (uzatmada) | düşük |
| D05 | Belge yüklendi, inceleme bekliyor | ✓ bütün karar verenlere (ort. 4,6); ilk karardan sonra ötekilerde kalır | K:91-93 | → Soru 3 | **yüksek** |
| D06 | Belge incelemesiz kabul | ✓ **yükleyen kişinin kendisine** | — | yok | orta |
| D07 | Belge onaylandı | ✓ çalışan | — | çalışan | düşük |
| D08 | Belge reddedildi | ✓ çalışan, genel metin (gerekçe yok, doğru) | K:91 | çalışan | düşük |
| D09 | Eksik / gecikmiş belge | ✓ **her gün 09:00, sınırsız** (BL-823) | yok | çalışan, sınırlı (ör. son tarihten 7 ve 1 gün önce, gününde) | **yüksek** |
| D10 | Süre yaklaşıyor (çalışan) | ✓ 30/7/1 gün, ayarı yok sayıyor (BL-822) | — | çalışan | düşük |
| D11 | Süre yaklaşıyor / doldu (yönetici) | ✓ ama **yalnız biri Workspace'i açınca**; "expired" hiç gitmiyor (BL-806) | araştırma T1 | karar verenler | orta |
| D12 | Kişi kısıtlandı | ✓ çalışan; başlık D09 ile aynı | K:87 | çalışan | düşük |
| D13 | Erişim geri geldi | ✓ çalışan | K:87 | çalışan | düşük |
| D14 | Politika imzalandı / geri çekildi | ✗ | — | yok | — |
| D15 | Belge türü yayından kalktı / arşiv | ✗ | K:604 | yok | — |

### 2.4 Duyuru, önemli tarih, Settings, Account, üyelik, platform, faturalama (52)

| # | Olay | Bugün | Kural | Ö | Gürültü |
|---|---|---|---|---|---|
| C01 | Duyuru yayını | ✓ hedef + **lokasyon müdürleri + owner + admin'ler** (✓ `communication_reaches`); yayınlayan ≠ yazar ise yayınlayan kendi bildirimini alır | **K5 ters çevrildi + K24 ✗**, KK-89 | yalnız hedef listesi, yayınlayan hariç | **yüksek** (BL-858) |
| C02 | Zamanlanmış yayın | ✓ aynı; yayın anında yetki sorulmuyor (BL-859) | K22 | C01 gibi | — |
| C03 | Zamanlanmış yayın başarısız | **✗** | **K21 ✗** | yalnız yazar | düşük |
| C04 | Yayındaki duyurunun içeriği değişti | ✓ herkese, onaylar sorulmadan silinir | **K27 ✗** (BL-861) | "kalsın"da onaylamamışlar, "sıfırlansın"da herkes | yüksek |
| C05 | Yalnız saat değişti | ✗ ✓ | K4(4) | yok | — |
| C06 | Hedef değişti | ✓ yalnız yeni eklenenler | K4(2) ✓ | yeniler | düşük |
| C07 | Unpublish | ✗ (kutudan çekilir) | K8 ✓ | yok | — |
| C08 | Yeniden yayın | ✓ onaylamamışlara | K27 (sorulmalı) | K27 | orta |
| C09 | Archive | ✗ | K8 ✓ | yok | — |
| C10 | Restore | ✗ | K8 ✓ | yok | — |
| C11 | Süre doldu | ✗ (kutudan çekilir) ✓ | K12 ✓ | yok | — |
| C12 | Süresi dolmuşun bitişi uzatıldı | ✓ **onaylamış olanlara da** | K12 eki ✗ (BL-867) | onaylamamışlar | orta |
| C13 | Okundu onayı | ✗; zildeki satır okunmamış kalır | K22, K23 | yok | — |
| C14 | Remind | **özellik yok** | **K23 ✗** | "Not yet" kişiler | orta |
| I01 | Önemli tarih oluşturuldu | ✓ lokasyondaki herkes + müdürler + owner + admin'ler, yazar hariç | K5 (tarihte sürüyor), K7 ✓ | K5 | orta |
| I02 | İçerik değişti | ✓ herkese yeniden; değiştiren kendi bildirimini alır, yazar almaz (BL-890) | K7 | K7, değiştiren hariç | orta |
| I03 | Lokasyon eklendi | ✓ yenilere | K7 ✓ | yeniler | düşük |
| I04 | Kapalı gün yayınlanmış vardiyayı düşürdü | ✓ K14 tek bildirim; bekleyen takas varsa **ikinci** bildirim | K13, K14 ✓ | kişiye tek; müdüre "N vardiya açık" yok | orta |
| I05 | Unpublish | ✗; **K14 "shift removed" bildirimi de geri çekiliyor** (BL-883) | K8, K15, P09 | K14 bildirimi kalır | — |
| I06 | Yeniden yayın | ✓ açmamışlara | K7 ✓ | aynı | düşük |
| I07 | Archive | ✗; K14 de çekilir | K8 | K14 kalır | — |
| I08 | Restore | ✗ | K8 ✓ | yok | — |
| I09 | Tarih geçti / yıllık tekrar | ✗; geçmiş bildirim zilde süresiz | yok | tarih geçince kutudan çekilir (öneri) | düşük |
| W01 | Müsaitlik modu değişti | → A03 | | | |
| W02 | Öteki program ayarları | ✗ | — | yok | — |
| W03 | Lokasyon arşivlendi | ✗ doğrudan; dolaylı belge yeniden kontrolü | — | owner + admin (lokasyonsuz kalan varsa) | düşük |
| W04 | İş / departman değişti | ✗; duyuru hedefini sessizce değiştirir | — | yok | — |
| W05 | İmzalanacak politika yayınlandı | dolaylı (09:00 "missing") | — | istenen kişiler | düşük |
| W06 | Workspace adı / saat dilimi değişti | ✗ | — | yok (saat dilimi: müdürler, soru değil) | — |
| W07 | Rol izni / üye rolü değişti | ✗ | M14 | kişi | düşük |
| H01 | Parola değişti | ✓ **iki satır**: password_changed + sessions_revoked | — | kişi, tek; e-posta da | orta |
| H02 | "Forgot password" ile sıfırlama | **✗ (olay yok)** — başkası yaptıysa fark edilmez | — | kişi (e-posta) | — |
| H03 | E-posta değişikliği istendi | ✓ + Supabase doğrulama e-postaları | — | kişi | düşük |
| H04 | E-posta değişikliği iptal | ✓ | — | kişi | düşük |
| H05 | E-posta değişikliği tamamlandı | ✗ | — | kişi (iki adres) | — |
| H06 | Öteki oturumları kapat | ✓ | — | kişi | düşük |
| H07 | Yeni cihazdan giriş | ✗ (bilerek reddedilmiş tür) | — | kişi (e-posta), MVP sonrası | orta |
| H08 | Hesap silme istendi (+ 7. gün ve son 24 saat) | ✓ uygulama içi (ama hesap anında kapandığı için görülmüyor) + kurtarma e-postası | — | kişi (e-posta) | düşük |
| H09 | Hesap silme tamamlandı | ✗ | — | — | — |
| H10 | Hesap silme geri alındı | ✓ | — | kişi | düşük |
| H11 | E-posta değişikliği doğrulama e-postası | ✓ Supabase | — | kişi | — |
| H12 | Parola sıfırlama bağlantısı | ✓ e-posta (Resend; canlıda yok) | — | kişi | — |
| M01 | Workspace kapanışı planlandı / anında / iptal | ✗ | — | bütün üyeler (e-posta) | — |
| M02 | Saklama silmesi tamamlandı | ✗ | — | yok | — |
| M03 | Zamanlanmış dışa aktarma 3 hatadan sonra kapandı | ✗ | — | kuralın sahibi | düşük |
| B01 | Deneme süresi bitiyor (3 gün kala) | özellik yok (Stripe) | — | owner | — |
| B02 | Deneme bitti, kart yok | — | — | owner + admin | — |
| B03 | Ödeme başarısız | — | — | owner | — |
| B04 | Ödeme için doğrulama gerekiyor (SCA) | — | — | owner | — |
| B05 | Fatura ödendi | — | — | owner, yalnız e-posta | — |
| B06 | Abonelik gecikti / kilitlendi / dönem sonunda iptal | — | — | owner + admin; kilitlenince herkes | — |
| B07 | Fatura kesilemedi (adres) | — | — | owner | — |
| B08 | Faturalama sahibi değişti (devir) | — | — | eski ve yeni owner | — |
| P01 | Belge süresi işi (yönetici) | → D11 | | | |
| P02 | Hesap silme hatırlatma e-postaları | → H08 | | | |

(W01, P01, P02 başka satırın tekrarıdır; sayıma girmedi. Tabloda 55 satır, 52 olay.)

### 2.5 Kurallarla çelişen ve eksik olanlar (özet)

1. **Fazla kişiye gidiyor:** vardiya değişikliği incelemesi (KK-158; BL-731), duyuru (K24; BL-858), belge incelemesi ve tercih edilen ad ilk karardan sonra ötekilerde kalıyor, eksik belge her gün (BL-823), değişiklik olmadan müsaitlik kaydı (BL-790), cover yayılımı (kural yok).
2. **Bir olay iki bildirim:** izin onayı + "vardiya açıldı" (BL-730), iptal onayı (S:5430), revoke + bekleyen iptal, parola değişti + oturumlar kapandı, kapalı gün + takas geçersiz.
3. **Gitmesi gereken yere gitmiyor:** vardiyası alınan / açığa alınan / silinen kişi (SCH-11–13), yayından kaldırma, işten çıkarmada boşalan vardiya (KK-174; BL-768), Restore (K:374), zamanlanmış duyuru hatası (K21), Remind (K23), onboarding incelemesi ve resmî ad önerisi (K:90, K:100), izin kısaltmada bütün onaylayanlar (BL-736), müdürsüz lokasyonda "vardiya açıldı".
4. **Metin:** izin kararı sonucu söylemiyor (BL-738), "is back on the schedule" (BL-396), yayın "week of 2026-10-12", 19 ham tür adı, aynı başlık iki anlam ("Documents need attention", "withdrawn/revoked").
5. **Geri çekme hatası:** K14 "shift removed" bildirimi kapalı gün geri alınınca kutudan siliniyor (BL-883, P09).


## 3. Ölçülmeyenler

- Canlı veritabanı (bu işte canlıya dokunulmadı).
- SCH-13 ve SCH-17'nin uçtan uca davranışı (koddan okundu).
- Cover adaylarının lokasyon / iş bağı (`weekly_exchange_candidate_check`).
- `task/ekran-02-a3`'ün eklediği yardımcı fonksiyonların tam listesi: söküm dilimi başlarken dal main'de olacağı için o gün `pg_proc` ile yeniden ölçülür.
