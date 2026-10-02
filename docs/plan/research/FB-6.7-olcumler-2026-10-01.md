# FB-6.7 ölçümleri (2026-10-01/02, koordinatör alt ajanları; salt okuma)

Üç rapor; hepsi koordinatör `local_abc4d126` oturumunda nf-planlama / general-purpose alt ajanlarından geldi.
Kaynak commit: tazelik `ea5ad298`, kod kenar durumları `a65758ea`. Yerel DB yalnız SELECT.

## 1. Tazelik ölçümü (nf-planlama alt ajanı, `ea5ad298`)

Elle doğrulanan satır: `get_announcements_service` gövdesinde eski yardımcıya 3 çağrı (tek tek sayıldı = sorgu).
Koordinatör ayrıca bağımsız kontrol etti: `ci-not-green.txt:7-9`, `ImportantDatesSettingsPage.tsx:81`, migration grep.

| Madde (FOUNDATION-B:174, :207) | Hüküm | Kanıt |
|---|---|---|
| Dört bildirim testi yeşil listede | değişmiş | `account_notification_scope` zaten `ci-green.txt:2`. Kalan üçü `ci-not-green.txt:7-9`: `notification_platform_core`, `notification_preference_resolver_and_producers`, `notification_settings_admin`. Neden BL-373: sabit 9 tür sayıyor (`notification_platform_core.test.sql:18-20`); katalogda bugün 34 tür, 34/34 şablon + üretici kaydı var. Resolver dosyası FB-6.3'te silinen `location_id`'ye yazıyor (`notification_preference_resolver_and_producers.test.sql:140-141`, BL-368) → yeniden yazılacak. |
| `communication_actor_has_capability_service` silinir ("11 çağrı / 8 fonksiyon") | değişmiş | Bugün 9 çağrı / 6 fonksiyon: `get_announcements_service` 3, `save_announcement_audience_service` 2, `cancel_announcement_service` 1, `get_notifications_service` 1, `publish_announcement_service_legacy_notifications` 1, `communication_actor_can_control_announcement_service` 1. Aynı aile: `communication_actor_can_control_announcement_service` (4 fonksiyonda 7 çağrı), `communication_actor_has_all_locations_service` (1 çağrı). |
| `legacy-blank-location` satırı silinir, "11 → 10" | değişmiş | known_gap bugün 3 satır (`authorization_matrix.test.sql:842-848`). `legacy-blank-location` 4 eylemli; üç eski Schedule yardımcısını 6 fonksiyon çağırıyor (5 takas = FB-6.4, 1 `time_off_event_released_assignments` = BL-179 kalanı). FB-6.7 yalnız 4 → 3 eylem; satır silme FB-6.4 (K-1 "son kapanan siler"). Bu dilimin satırı `important-date-no-as-validation` (`:843-844`) → liste 3 → 2. |
| BL-099 kapalı | bayat | Kapandı 2026-09-30 (`da8e3dc0`, `BACKLOG.md:1370`). |
| Akış 7 e2e | geçerli | `e2e/flows/` altında duyuru / önemli tarih / bildirim spec'i yok. |
| Duyuru ve önemli tarih kapıları çekirdeğe | geçerli | `announcement.read/.write/.acknowledge`, `important_date.write` eylemleri tanımlı ama hiçbir duyuru fonksiyonu kullanmıyor. Önemli tarih yazımı tarayıcıdan doğrudan tabloya (`apps/web/src/settings/organization-data.ts:425-442`); RLS fonksiyonu `can_manage_important_date` `auth.uid()` + eski `workspace_has_permission`. API dosya içi kapı `communication-routes.ts:106-113` (`"announcements.manage"`). Web `permissions.includes("important_dates.manage")` (`ImportantDatesSettingsPage.tsx:81`). |
| E3: önemli tarih okuması lokasyona bakar | geçerli (kural ihlali) | `read_settings_important_dates_service` lokasyon süzmüyor; satır kuralı yalnız `is_workspace_member`. Schedule süzgeci API'de (`schedule-service.ts:519-528`). Yerel DB'de 0 önemli tarih → koddan okundu, ekranda görülmedi. |
| Karar bildirimi `scope_set` ile | değişmiş | İzin (FB-6.3), müsaitlik (FB-6.5), tercih edilen ad (BL-099) çekirdekte. Takas FB-6.4, belge FB-6.6. Bu dilime yalnız duyuru alıcıları kalıyor. |

Ek bulgular:
- Duyuru yayını iki tabloya yazıyor: `publish_announcement_service` → `_legacy` ile eski `notifications`a yazar, alıcıları geri okur, siler, yeni kuyruğa koyar. `_legacy` sayaç tavanını (13) dolduranlardan.
- Yayınlayan kendi bildirimini alıyor (alıcı sorgusu yayınlayanı dışlamıyor). Not: K5 (owner/admin/müdür her kaydı alır) ile birlikte ele alınmalı — yazar kendi kaydının bildirimini almamalı mı, iş içinde koordinatöre sorulur.
- Reddedilen işlemler 42501'i `authz.*` hint'i olmadan dönüyor.
- Önemli tarihte erişilemeyen lokasyon seçilince 23514 "Choose a location in this workspace" (yetki reddi değil) = known_gap `important-date-no-as-validation`.
- Davet iptali bildirimi (`request_account_deletion_v2_service`, canlı gövde 73-81) `employee_access.manage` olan bütün müdürlere, lokasyona bakmadan → BL-532.
- OPS-03: yeni servisler önce canlı; yardımcı / `_legacy` silme ve tarayıcı yazma izni kaldırma önce main (ters sırada canlı eski web önemli tarihi yazamaz).

## 2. Kod kenar durumları (nf-planlama alt ajanı, `a65758ea`)

- Duyuru hedefi: lokasyon (boş = workspace geneli), rol sınıfı (owner/admin/manager/employee), departman, iş — hepsi birlikte (VE). Kişi seçimi yok (`audience_mode`, `employee_ids` sütunu yok; ANN-001 draft). İş/departman lokasyona bağlı değil (`employee_job_assignments`'ta lokasyon yok) → BL-531.
- Çok lokasyonlu çalışan, lokasyonlarından biri tutunca alır (`announcement_member_matches_locations_service`, `exists`).
- Müdür, alıcı değilse duyuruyu görmüyor (`get_announcements_service` WHERE) → K5 çözüyor.
- Duyuru durumları: draft, scheduled, published, cancelled. Düzenleme yalnız draft/scheduled (`can_edit`; "announcement can no longer be edited"). Yayınlanmış yalnız iptal; iptal arşivler + bildirimleri siler. Silme yok.
- Zamanlanmış duyuru saati gelince "published"a geçmiyor; görünür ama düzenlenebilir; düzenlemede bildirimler yeniden gidiyor, okundu onayları silinmiyor (`save_announcement_audience_service`) → K4.
- Önemli tarih alanları: ad, tür (holiday, event, blackout, closed_day), başlangıç/bitiş, tekrar (yok/yıllık), not (≤500), "affects scheduling", lokasyonlar (≤100; boş = workspace geneli), arşiv tarihi. created_by / updated_by YOK (K2 için yazar alanı gerekir).
- Schedule'da yalnız işaret (`DayHeaderCell.tsx:87-96`); vardiya engellemiyor. "Location is closed" `schedule_closures`tan (`schedule-service.ts:471-478`, `schedule-conflicts.ts:289-317`) → BL-530.
- "Delete" = arşiv (`organization-data.ts:436-450`); tarayıcının DELETE izni yok.
- `audit_important_date_change` yalnız işlem adı tutuyor; eski/yeni değer yok; okuyan ekran / API yok.
- Yazar kontrolü hiçbir yerde yok (`communication_actor_can_control_announcement_service`, `can_manage_important_date`).
- Admin kapsamı sınırlanamıyor: `enforce_role_location_scope`; DB'de 189 admin'in hepsinde "bütün lokasyonlar"; KARARLAR:60.
- Varsayılan manager rolü `announcements.manage` + `important_dates.manage` ile geliyor (362 workspace).
- Yerel DB: 0 duyuru, 0 önemli tarih, 0 okundu onayı (2026-10-01).
- Önemli tarih için bildirim türü yok (K5 teslimi için yeni tür gerekir).
- Arşivli lokasyon: duyuru kaydı arşivliyi reddediyor; önemli tarih tutuyor (`normalize_important_date_locations`); `membership_location_scopes` arşivliyi içeriyor → KK-86.
- Çalışan bütün önemli tarihleri notlarıyla tarayıcıdan okuyabiliyor (SELECT izni + RLS "üye görür").
- KARARLAR:148 "Boş lokasyon asla her yer değildir" ↔ duyuru/önemli tarihte boş = workspace geneli; açık işaret önerildi.

## 3. Rakip araştırması (general-purpose alt ajanı, resmi yardım merkezleri, 2026-10-01)

- 7shifts: duyuru admin + müdür (atandığı lokasyonla sınırlı); Manager Log Book'ta müdür yalnız alt kademenin yazısını siler; etkinlik tek lokasyonlu, yetkili her müdür düzenler. https://kb.7shifts.com/hc/en-us/articles/4417513597203 , /4417519940499 , /4417514047379 , /4417519498643
- Homebase: duyuru silinmez; "Entire company" kanalını yalnız sahip/admin açar. https://support.joinhomebase.com/s/article/Team-Messenger-Announcements , /Messages-for-Managers-FAQs
- When I Work: Supervisor yalnız kendi programlarına not ekler; işletme kanalına varsayılan yalnız Manager/Admin. https://help.wheniwork.com/articles/using-annotations-computer/ , /user-access-privileges-computer/
- Deputy: yalnız atandığı lokasyonlara (çok lokasyonlu müdür birden fazla seçer); Lokasyon Müdürü yalnız kendi gönderisini siler; izin yasak günü o lokasyonu ikinci lokasyon taşıyan çalışanı da bağlar. https://help.deputy.com/hc/en-au/articles/4689257989903 , /13819858931727 , /4658316373135 , /4658317028751
- Sling: gün notu hesap geneli; müdür yalnız kendi notunu düzenler; "izin yasak / kapalı / tatil ücreti" yalnız admin. https://support.getsling.com/en/articles/2425751-day-notes
- Connecteam: yayınlanmış duyuruyu varsayılan yalnız hesap sahibi + yazan admin görür/düzenler. https://help.connecteam.com/en/articles/10697157
- Ortak: yetki lokasyon atamasına bağlı; şirket geneli üst rolde; okundu onayı hiçbir üründe kendiliğinden sıfırlanmıyor; değişiklik geçmişi zayıf.
- K1 When I Work / Sling / Homebase çizgisiyle uyumlu; Deputy / 7shifts çok lokasyonlu müdüre izin veriyor (reddedilen seçenek).
