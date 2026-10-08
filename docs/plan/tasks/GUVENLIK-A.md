# GUVENLIK-A Yetki açıkları ailesi A: yeniden ölçüm ve plan
Status: in progress — ölçüm ve plan bitti (`b54921db`); GA-1 kodda (KK-206: hemen); GA-2…4 EKRAN-02 veri paketi main'e girdikten sonra
Session: oturum/guvenlik-a   Branch: task/guvenlik-a   Worktree: ../newfork-wt/guvenlik-a   DB: ölçüm yalnız SELECT (`begin read only … rollback`); kod denemeleri `db.lock` ile, rollback'li
Risk: R3 (grant, RLS, yetki çekirdeği, `*_service` sınıflandırması)
Reviewer: `nf-guvenlik` her adımda zorunlu; GA-2 Settings → Roles görünümünü değiştirdiği için masaüstü (1440) ve telefon (390) ekran görüntüsü. GA-3 için ultrareview önerilir (Mert başlatır, ücretli; tutar açılış penceresinde yazar).
Skills: kod aşamasında `superpowers:test-driven-development` (her adım önce kırmızı pgTAP), `supabase:supabase-postgres-best-practices` (grant, RLS, migration), `superpowers:verification-before-completion`. Bu aşamada açılmadı: salt ölçüm, kodu değiştirmiyor.

## Mert için özet
Bugün (2026-10-07) yetki tarafındaki en tehlikeli 5 açık. Hepsi kodda duruyor; yerel veride hiçbiri kullanılmamış, canlı veri okunmadı.
1. 🔴 Admin, Downtown müdürü Ayşe'nin özel rolüne Settings → Roles'tan "Locations: Edit" verebiliyor. Ayşe Uptown'ı tarayıcıdan arşivler, Uptown müdürü Burak lokasyonunu anında kaybeder; workspace adını, iş kataloğunu ve bildirim kurallarını da değiştirebilir. Kural (KARARLAR) "müdür tipine organizasyon ayarı verilemez" diyor; bir test bu yanlışı "doğru" diye kilitliyor.
2. 🔴 Hem Meyhouse'ta admin hem kendi "Deniz Cafe"sinde owner olan Deniz, tarayıcıdan Meyhouse'un kullanılmamış bir işini, boş bir departmanını ya da herhangi bir vardiya etiketini kendi workspace'ine taşıyabiliyor. Meyhouse'ta kayıt uyarısız kaybolur, vardiyalardaki etiketler Deniz Cafe'nin kaydını gösterir.
3. 🔴 Account → Workspaces → "Close later" ile kapatılan workspace hiç kapanmıyor. 14 gün geçince ekranlar kapalı sayıyor ama admin tarayıcıdan yeni lokasyon, iş ve departman ekleyip lokasyonları değiştirebiliyor; veri hiç silinmiyor.
4. 🟠 Kadıköy müdürü Ali, eş müdür Ayşe'nin takasını onaylayabiliyor; Ayşe kendi vakasındaki adayı reddedebiliyor. Requests'in veri paketi main'e girince kapanıyor ("aramayı kapat" dalı açık kalıyor).
5. 🟠 Settings'teki 19 işlem yetki merkezine hiç sormuyor (kapanmış workspace'e, rütbeye bakmıyor, "hayır"ı standart biçimde vermiyor); müdür rolüne "Roles: View" de verilebiliyor.
Plan (KK-206): 2'yi kapatan GA-1 hemen; Requests paketi girince GA-2 (1), GA-3 (5), GA-4 (3). Ekranların payı Requests, Workspace ve Settings turlarına yazıldı; bildirim ayarları yeni bildirim sistemiyle sökülüyor.

## Goal
Bir workspace'in organizasyon ayarlarını (lokasyon, iş, vardiya kataloğu, ad ve logo, bildirim kuralları, roller) yalnız o workspace'in owner'ı ve admin'i değiştirebilir; her yazma yetki çekirdeğinden (`app_private.authorize` / `rls_can`) geçer; hiçbir kayıt bir workspace'ten öbürüne geçemez; kapanmış workspace'e yazılamaz; "hayır" her yerde tek biçimdir (42501 + `authz.*`).
Örnek: Downtown'ın özel müdür rolündeki Ayşe, Settings → Locations'ta Uptown'ı değiştiremez; Settings → Roles'ta admin Zeynep o role organizasyon ayarı veremez (kutular yok, veritabanı da reddeder). İki workspace'te yetkili Deniz, Meyhouse'un vardiya etiketini tarayıcı konsolundan Deniz Cafe'ye taşımayı denerse veritabanı reddeder.

## Yeniden ölçüm (2026-10-07; `origin/main` 61481d29, kod e6d2735d ve 9c047407 ile aynı; yerel DB 437 migration = main; yalnız SELECT)
Ölçen: beş salt okur alt ajan (`nf-okur`, Opus) ve oturumun kendi SELECT'leri; bağımsız bakış `nf-guvenlik` (salt okur, 107 araç çağrısı). Düzeltmeleri aşağıya işlendi, kilit satırlar elle doğrulandı. Satır numaraları aksi yazmadıkça `supabase/schema.sql`.

### 1. Eski kapı `service_actor_has_permission` (BL-276)
- **Sayı:** doğrudan çağıran **10** fonksiyon (2026-09-28: 46, 09-30: 32, 10-05: 10). Sayaç var: `supabase/tests/authz_catalog.test.sql:139`, tavan 10 = 10. Ayrıca `workspace_has_permission` (`public` + `app_private`) üzerinden **9** fonksiyon ve **19** RLS politikası (16'sı tablo, 3'ü `storage.objects` logo).
- **Kapının yaptığı** (:22893): aktif üyelik + rol izni + belge engeli. Bakmadıkları: rütbe, lokasyon kapsamı, workspace'in durumu.
- **Kapanmış workspace:** anında kapatma bütün üyelikleri `suspended` yapıyor (:19103-19107), eski kapı da kapalı. Taslak (draft) workspace'te yalnız owner var (143/143), çekirdek de owner'a açıyor. **Gerçek fark planlı kapanışta:** `closure_scheduled` ve `closure_effective_at` geçmişte → çekirdek kapalı sayıyor (:6036-6039), eski kapı ve RLS açık bırakıyor (aşağıda "Yolda bulunan" YB-1).
- **19 fonksiyonun hiçbiri** `authz.*` hint'i vermiyor. API rotaları önce `resolveWorkspaceAuthorization`'dan geçtiği için üye olmayan zaten 404 alıyor (`apps/api/src/auth/workspace-context.ts:84-107`); ama aynı rotalar bir de rota-yerel `permissions.includes` kapısı taşıyor (BL-898; §2.A.1'in yasakladığı ikinci kapı).
- Rütbeyi `workspace_memberships.role`'dan okuyor (çekirdek `workspace_roles.access_class`'tan); eşitleyen tetikleyici var, uyumsuz satır 0/2588.

| Fonksiyon | Satır | İzin | Rütbe | Lokasyon | Ekran | Çekirdekte karşılığı |
|---|---|---|---|---|---|---|
| `app_private.can_edit_role` | 1811 | roles.manage | var (rol sınıfı merdiveni, kendi rolü yok) | — | 10 Roles | `settings.roles.write` (rütbe kuralı yok) |
| `save_workspace_role_service` | 22321 | can_edit_role + :22340-22344 | can_edit_role'dan | — | 10 Roles | `settings.roles.write` |
| `get_notification_settings_service` | 11125 | notifications.settings.read/write | yok | yok | 10 Notifications | `settings.notifications.read` |
| `save_notification_policy_service` | 21316 | notifications.settings.write | yok | var, `membership_location_scopes`'tan (çekirdek `employee_location_assignments`; bugün 622/622 aynı) | 10 | `settings.notifications.write` (tanımlı, kullanılmıyor) |
| `reset_notification_policies_service` | 19258 | notifications.settings.write | yok | `all_locations` şartı | 10 | aynı |
| `preview_notification_policy_service` | 15829 | notifications.test_send (özel role verilemez) | yok | alıcı kendisi | 10 | yok, eylem eklenmeli |
| `get_owner_setup_checklist_progress_service` | 11450 | settings.general.read | yok | — | 5 | `workspace.setup` (BL-808) |
| `mark_owner_setup_checklist_item_service` | 14336 | settings.general.manage | yok | — | 5 | aynı |
| `set_owner_setup_checklist_closed_service` | 23395 | settings.general.manage | yok | — | 5 | aynı |
| `app_private.workspace_has_permission` | 6052 | sarmalayıcı (`auth.uid`) | — | — | — | silinir |
| `create_department_jobs_service`, `create_department_with_jobs_service`, `update_department_with_jobs_service`, `create_job_with_assignments_service`, `update_job_details_and_assignments_service` | 8221, 8257, 25804, 8380, 25996 | settings.jobs.manage (`request.jwt.claim.sub` kurup `workspace_has_permission`) | yok | yok (kişi ataması çekirdekte) | 10 Jobs | `settings.jobs.write` |
| `reorder_shift_types`, `reorder_shift_labels` (API `reorder_*_service` sarmalayıcısından, :18580, :18639) | 18599, 18540 | settings.shift_catalog.manage | yok | yok | 10 Shift catalog | yok; `settings.shift_catalog.write` eklenmeli (`delete_catalog_entity_service` bugün `settings.jobs.write`'ı ödünç alıyor, :8994-8998) |
| `sync_schedule_conflict_rules` (tetikleyici) | 25008 | schedule.conflict_rules.manage, yalnız `auth.uid()` doluyken | — | — | 10 | API yolu zaten `settings.conflict_rules.write`'a soruyor |
| `can_manage_workspace` (`app_private` + `public`) | 1844, 7810 | workspace.manage | — | — | — | uygulamada kullanılmıyor; `public` olanı `authenticated`'a açık RPC (yalnız kendi iznini döndürüyor) |

RLS politikaları (`workspace_has_permission`): `departments`, `jobs`, `locations`, `shift_labels`, `shift_types` INSERT + UPDATE; `locations_select_scoped_member` (`settings.locations.read` olan bütün lokasyonları okur; çekirdekte bu eylem lokasyon kümesiyle sınırlı; bugün hiçbir müdür rolünde bu izin yok); `workspace_roles_select_authorized`; `workspace_entitlements_select_owner_admin`; `workspace_scheduling_settings` INSERT/UPDATE (tablo grant'i yok, etkisiz); `workspaces_update_manager`; `storage.objects` `workspace_logos_*` INSERT/UPDATE/DELETE (öbür üç kova private ve eski kapıyı kullanmıyor).

**Hüküm (BL-276): değişmiş.**
- (1) takas: main'de geçerli (`shift_exchanges_command_service` :24072; onay ve ret yalnız `schedule_actor_has_capability_service` :24150, :24190). EKRAN-02 paketiyle kapanıyor (bkz. "EKRAN-02 veri paketiyle fark").
- (2) belgeler: **bayat** — üç servis `authorize(…'documents.review')` (2026-10-06 `6b0d5d7b`).
- (3) taslak kaydetme ve heartbeat: **bayat** — `save_schedule_edit_session_service` :21881, :21882-21890; heartbeat :12461.
- (4) `all_locations`: **bayat** — çalışanda CHECK `workspace_memberships_employee_not_all_locations`; müdürde `b_enforce_role_location_scope` tetikleyicisi alanı `false` yapıyor (:2856-2865; açık müdür 0/622). Presence ve adres kısmı ölçülmedi.
- (5) ipuçsuz 42501: **değişmiş** — 100 satır / 56 fonksiyon (tavan 100, `authz_catalog.test.sql:100`); "164 fonksiyonda 273 yer" eskidi.
- Eski kapı 10 fonksiyon; kalan iş GA-3 + BL-808.

### 2. Organizasyon izinleri özel müdür rolüne (BL-178)
- 8 iznin hepsi hâlâ `custom_grantable = true`; `roles.read` de (KARARLAR K14 S2'ye aykırı). Kaydetme yolu (`save_workspace_role_service`) yalnız `custom_grantable = false`'u (:22340) ve `roles.manage` / `workspace.manage`'i (:22341) engelliyor; müdür sınıfı için izin süzmüyor (yalnız çalışan sınıfı için `employee_eligible`, :22342). Owner da admin de müdür sınıfı role 8 izni verebilir; API yalnız iletiyor (`apps/api/src/settings/roles-service.ts:54-61`).
- Web: `packages/shared/src/role-permissions.ts:143-176` "Organization settings" grubunu müdür rolünde gösteriyor (`adminOnly` değil; `RolesSettingsPage.tsx:370`); `roles.*` web'de gizli (:178-185), veritabanında açık.
- Etkin açık 5 izinde: `settings.general.manage`, `settings.locations.manage`, `settings.jobs.manage`, `settings.shift_catalog.manage`, `notifications.settings.write` (eski yoldan yazma açıyor). Öbür 3'ü (`documents.manage`, `settings.schedule_rules.manage`, `schedule.conflict_rules.manage`) yazmayı çekirdekten soruyor; çekirdek müdüre organizasyon yazmayı kapatıyor (`authz_scope_rules` M1–M4 org/write = none) → müdürün elinde etkisiz. Aynı soruya iki kapı iki cevap veriyor: lokasyonu arşivlemek eski kapıdan geçiyor, silmek çekirdekte reddediliyor (:8996-9001).
- `:22340`: `custom_grantable` kontrolü, izin rolde zaten varsa atlanıyor (`not exists old_grant`; eski veri toleransı, CLAUDE.md §2.A.5'e aykırı).
- **Ters test:** `supabase/tests/roles_permissions_rls.test.sql:133-141`, sistem manager rolüne `settings.general.manage` + `settings.locations.manage` verip müdürün workspace adını (:138), bütün lokasyonları okumasını (:140) ve atanmadığı lokasyonu değiştirmesini (:141) `lives_ok` ile sabitliyor. Bu KARARLAR:85'in tersi.
- pgTAP'te `custom_grantable` testi yok. Yerel veri: bu izinleri taşıyan özel rol 0 (57 özel rolün hepsi manager sınıfı). Canlı ölçülmedi.

**Hüküm (BL-178): değişmiş** — 8 izin hâlâ verilebiliyor, etkin açık 5'inde. Ek bulgular: `roles.read`, ters test, `:22340` istisnası.

### 3. Katalog tablolarına tarayıcıdan yazma (BL-232)
- Web doğrudan yazıyor (`apps/web/src/settings/organization-data.ts`):
  - workspaces: :175 (logo), :239 (ad)
  - locations: :257, :262, :290 (arşiv dahil)
  - departments: :319, :324, :336
  - jobs: :358, :367, :384
  - shift_types: :518, :533, :544
  - shift_labels: :578, :583, :595
  - logo kovası: upload :134, remove :108, :152
- important_dates artık sunucuda. Hesap profili (`apps/web/src/lib/supabase.ts`) `apps/web/CLAUDE.md:7`'deki izinli istisna.
- `authenticated`: 5 katalog tablosunda tablo düzeyi INSERT + UPDATE. Bu yüzden UPDATE her kolonu kapsıyor: `workspace_id`, `id`, `created_at`, `archived_at`, departments/jobs `system_key`, shift_types `default_revision`. workspaces'te yalnız 8 kolon açık (name, logo_*, schedule_logo_*, updated_at). `logo_storage_path` CHECK'li (`^hex/logo/hex.(jpg|png|webp|svg)$`, :29547) ama kendi workspace kimliğine bağlı değil. `anon` yazamaz.
- Politikalarda USING ile WITH CHECK aynı: `workspace_has_permission(<tablo>.workspace_id, 'settings.X.manage')`. İki workspace'te izni olan kişi satırı birinden öbürüne taşıyabilir. `workspace_id` değişimine bakan tetikleyici yok. `deleted_at` (`guard_catalog_deletion_state`) ve `system_key` (`keep_system_catalog_records`) korunuyor.
- **Pratikte taşınabilen** (bileşik yabancı anahtarlar `(id, workspace_id)`, ON UPDATE yok; ayrıca otomatik kayıtlar):
  - Lokasyon taşınamaz: her yeni lokasyon owner'a otomatik atanıyor (`locations_reach_the_owner`; atamasız lokasyon 0/652).
  - Vardiya tipi taşınamaz: her birinin otomatik sürüm satırı var (`shift_type_time_revision`; 0/5).
  - **Taşınabilir:** kullanılmamış iş (yerelde 584/1610), boş departman (yerelde 0/840) ve **bütün vardiya etiketleri**. `shift_labels`'a hiç yabancı anahtar yok; kaynak workspace'in vardiyalarındaki `label_ids` taşınan etiketi göstermeye devam eder.
  - 2026-10-05'teki deneme bir lokasyonda `UPDATE 1` ölçmüştü. Bugün yerelde atamasız lokasyon 0/652, yani o deneme bugünkü veride tekrarlanamaz; o lokasyonun neden atamasız olduğu ölçülmedi.
- Lokasyon arşivi tarayıcıdan doğrudan yapılıyor (:282-291). `location_is_live` yalnız `archived_at is null`'a bakıyor (:4147), yani arşivlenen lokasyon müdürünün kapsamından anında düşüyor.
- API karşılığı:
  - departments ve jobs için POST/PATCH/DELETE var (`apps/api/src/settings/jobs-management-routes.ts:57, 88, 121, 147, 177, 202, 262`), arşiv ucu yok.
  - locations, shift_types, shift_labels için oluşturma/güncelleme/arşiv ucu yok; yalnız silme ve sıralama var (`organization-settings-routes.ts:116, 146`).
  - workspaces ad ve logo için yazma ucu yok.
- Logo kovası public ve SVG kabul ediyor. Adres ayrı bir alan adında, politika listelemeye izin vermiyor (BL-282, düşük).
- Bu tur rollback'li UPDATE denemesi yapılmadı (görev: yalnız SELECT).

**Hüküm (BL-232): geçerli, kapsamı değişmiş.** Taşınabilenler iş, departman ve etiket; lokasyon ve vardiya tipi otomatik kayıtlarla korunuyor. Ek: `shift_labels` yabancı anahtarsız; API uçlarının durumu yukarıda.

### 4. Öbür aile A maddeleri
- **BL-099: bayat (kapandı 2026-09-30)** — `list_pending_preferred_names_service` `authz_check`, `decide_employee_preferred_name_service` `authorize`; aile A genişlemesi de kapalı.
- **BL-242: bayat (kapandı 2026-09-30)** — owner onboarding'deki `actor_role <> 'owner'` gitti, yerine `is distinct from 'owner'` (:7903, :19053; NULL'da kapalı).
- **BL-270: bayat (kapandı)** — `remove_employee_access_service` `authorize('employee.remove_access')` (:18143); `enforce_membership_role_change` (:9596) fail-open değil (yalnız `postgres` oturumunda ve rol değişmeden askıya almada atlıyor; tarayıcının bu tabloda yazma izni yok).
- **Fail-open taraması:** yetki kodunda tek aday `save_workspace_role_service`. `role_access_class` NULL gelirse :22333, :22334, :22338-22341 kontrolleri atlanıyor. Fonksiyon yalnız `service_role`'e açık, kolon NOT NULL, API zod NULL'u geçirmiyor (`packages/shared/src/index.ts:2459`) → düşük; GA-3'te `is distinct from` ile kapanır.
- **Matris:**
  - İkinci admin (kaan) var (`authorization_matrix.test.sql:34-35`; eş rütbe :701-703).
  - 10 eski kapı fonksiyonundan matriste yalnız `save_workspace_role_service` var (:381-382). `can_edit_role` hiçbir testte yok.
  - `settings.notifications.*` ve `workspace.setup` için matris satırı yok.
  - Matriste kapanmış workspace hücresi hiç yok.
  - shift_types ve shift_labels için RLS davranış testi yok.
- **Katalog sayaçları** (hepsi tavanda): `auth.uid()` 11, `request.jwt.claim` 13 (6'sı eski kapıyı besleyen katalog servisleri), kendi kapsam/rütbe 26, `_base/_vN/_legacy` 12, politika `auth.uid` 10, ertelenmiş tetikleyici 10, ipuçsuz 42501 100, eski kapı 10. Sınıflanmamış `*_service` 0 (`authorization_coverage.test.sql:281`).
- **BL-898** (API'de rota-yerel kapılar, 7 rota dosyası): bu görevin taşıdığı rotalarda (jobs-management, organization-settings, roles, notification-settings) ikinci kapı olarak kalıyor; bkz. GA-3.
- **BL-838** (MVP öncesi rol × erişim kampanyası): veritabanı matrisi rol çiftlerini zaten deniyor; bu görevin kapattığı açıklar kampanyanın ekran senaryolarına girmeli (bkz. "BL-838'e devir").

## EKRAN-02 veri paketiyle fark (`git diff origin/main...task/ekran-02-a4 -- supabase`; dal c0a5e701, taban a40f329b)
Paket dört migration (`20261007140000`–`170000`) ve testlerinden oluşuyor; yerel DB'ye uygulanmadı.
- **Kapanıyor:**
  - `schedule_actor_has_capability_service`, `schedule_actor_can_manage_service`, `schedule_actor_can_publish_service` ve 3 eligibility yardımcısı silinip `retired_objects_stay_gone`'a giriyor; 5 çağıran çekirdeğe soruyor.
  - **BL-276 (1)** ve **BL-726**: onay ve ret aynı `exchange.approve` (`no_self`, `rank_below`) bloğundan geçiyor (`20261007150000_shift_exchanges_ask_the_core.sql:364-376`; test `shift_exchange_decided_one_rank_up.test.sql:110-129`; matris hedefi `case:ayse-k2` :270, rütbe hücresi :878).
  - **BL-179**: `time_off_event_released_assignments` çekirdekte (150000:840). `mark_schedule_time_off_viewed_service` zaten silinmiş (`20261003040000:25`), o kısım bayat.
- **Kısmen:**
  - `close` (aramayı kapatma) rütbeye bakmıyor (150000:325, :339); Mert sorusu olarak `docs/plan/ekranlar/02-requests/uygulama/A1A2.md:12`'de.
  - Eş müdürün reddi testte yok, `reject` matriste yok.
  - `employee_hub_actor_service`'in öbür 4 çağıranı dokunulmadı.
- **Dokunulmuyor:** eski kapının 10 çağıranı (diff grep 0; sayaç 10'da kalıyor), `shift_exchange_emit_notification_base` adı (gövdesi çekirdeğe geçiyor).
- **Sayaç değişimi:** kapsam/rütbe 26 → 23, `_base/_vN/_legacy` 12 → 11, ipuçsuz 42501 100 → 83.
- **Çakışma:** `a40f329b..origin/main` arasında aynı fonksiyonlara dokunan migration yok (`20261007130000` yalnız `shift_exchange_schedule_recovery_service`'i değiştiriyor; dalın sürümü davranışı koruyor). Paket `supabase/schema.sql`'i yeniden üretmeli (SCHEMA-SNAP, `.github/workflows/ci.yml:95`).
- **Sonuç:** takas kolu EKRAN-02'nin; bu görev takasa dokunmaz. Bu görevin dosyaları (matris, katalog, `retired_objects_stay_gone`, `ci-green.txt`) paket girdikten sonra açılır.

## Kalemler

### Koordinatör kararı (KK-206, 2026-10-07 ~09:50Z)
1. GA-1 ve GA-2 Ekran 10'u beklemez. **GA-1 EKRAN-02 paketini de beklemez, hemen başlar.** Şartlar:
   - Yeni pgTAP dosyası açılmaz (`ci-green.txt` paket girene kadar kapalı); hücreler var olan test dosyalarına eklenir.
   - Yetki matrisine ve katalog dosyalarına dokunulmaz.
   - Migration adı paketin dört migration'ından (`20261007140000`–`170000`) büyük olur. Paket önce adlı ama sonra girecek; bunun yerel ve CI kuruluşunda sorun çıkarmadığı testle gösterilir.
   - GA-2 ve GA-3 paket main'e girince başlar.
2. GA-3 taşıdığı rotalardaki rota-yerel kapıları da siler. **İstisna: bildirim.** `notification-settings` rotası ve 4 bildirim ayarı fonksiyonu GA-3'ten çıkar; BILDIRIM oturumu bildirim sistemini sıfırdan kuruyor, eskisi ilk dilimde sökülecek.
3. YB-1 (planlı kapanış) ayrı iş değil, bu görevin sonunda **GA-4**. Yeni hat açılmıyor; canlıda müşteri yok, lansmandan önce şart.

### Ortak çekirdek iş (bu görev)
Sıra: GA-1 (şimdi) → paket main'e girer → GA-2 → GA-3 → GA-4. Her biri ayrı commit ve ayrı `nf-guvenlik` ONAY'ı; hepsi R3.

**GA-1 Katalog kaydı workspace'ini değiştiremez (BL-232'nin kiracılar arası kısmı).**
- Bugün: Deniz (Meyhouse admin + Deniz Cafe owner) tarayıcı konsolunda `update({workspace_id: '<Deniz Cafe>'})` ile Meyhouse'un "On call" vardiya etiketini, kullanılmamış "Barback" işini ya da boş bir departmanını kendi workspace'ine çeker. Ters yönde Meyhouse'a kayıt sokar. `id` ve `created_at`'i de değiştirebilir.
- Düzeltme:
  - 5 katalog tablosunda `authenticated`'in tablo düzeyi UPDATE grant'i geri alınır.
  - Yalnız Settings formlarının bugün gönderdiği kolonlara kolon grant'i verilir. Liste `packages/shared/src/index.ts`'teki giriş şemalarından ve `organization-data.ts`'ten çıkarıldı:
    - locations: name, short_name, street_address, city, region, postal_code, country_code, timezone, phone, archived_at, updated_at;
    - departments: name, color, archived_at, updated_at;
    - jobs: name, color, department_id, archived_at, updated_at;
    - shift_types: name, color, default_start_time, default_end_time, archived_at, updated_at;
    - shift_labels: name, color, archived_at, updated_at.
  - `workspace_id`, `id`, `created_at`, `system_key`, `deleted_at`, `sort_order` (sıralama API'de), `default_revision`, `crosses_midnight` dışarıda kalır. Web bunları göndermiyor, ekran bozulmaz.
  - Teknik seçim (ILKELER P19): kolon grant'i. Ekran 10 tarayıcı yazmasını tamamen kaldırınca bu grant da gider; ayrıca silinecek bir tetikleyici kalmaz. `nf-guvenlik`'in alternatifi BEFORE UPDATE tetikleyicisiydi.
- Kırmızı test (var olan dosyalarda, ikisi de `ci-green.txt`'te):
  - `browser_privileges.test.sql`: "tarayıcı yalnız şu tablolara yazar" listesinden 5 tablo düzeyi UPDATE çıkar; yeni hücre "the browser updates only the catalog columns the Settings forms send" yukarıdaki listeyi `set_eq` ile sabitler.
  - `organization_basics_rls.test.sql`: iki workspace'in owner'ı vardiya etiketini öbür workspace'e taşıyamaz, boş departmanı taşıyamaz, kaydın `id`'sini değiştiremez (42501); etiket ve lokasyon formunun gönderdiği güncelleme hâlâ geçer.
- Risk R3 · Sıra 1 (kiracılar arası, en küçük değişiklik).

**GA-2 Organizasyon ayarı izinleri yalnız owner ve admin'de (BL-178).**
- Bugün: admin Zeynep, Downtown'ın özel müdür rolüne Settings → Roles'tan "Locations: Edit", "General: Edit", "Jobs: Edit", "Shift catalog: Edit", "Notifications: Edit" verebiliyor; veritabanı doğrudan çağrıda `roles.read`'i de kabul ediyor.
- Düzeltme: 8 organizasyon izni ve `roles.read` için `custom_grantable = false`. `:22340`'taki "rolde zaten varsa geç" istisnası silinir. Bu izinleri taşıyan özel rol satırları migration'da silinir (yerelde 0; canlıda gönderimden önce SELECT ile ölçülür, yedek alınır). `packages/shared/src/role-permissions.ts`'te organizasyon grubu `adminOnly` olur. Ters test silinir, yerine reddi bekleyen test gelir.
- Kırmızı test:
  - `supabase/tests/organization_settings_stay_with_owner_and_admin.test.sql` — owner ve admin, müdür sınıfı bir role 8 iznin hiçbirini ve `roles.read`'i veremez (42501 + `authz.*`); admin rolünde bu izinler kalır.
  - `roles_permissions_rls.test.sql:133-141` yerine: "müdür workspace adını ve atanmadığı lokasyonu değiştiremez".
  - Shared vitest: müdür rolünde "Organization settings" grubu yok.
- Ekranda: Settings → Roles'ta bir müdür rolü açılınca "Organization settings" grubu görünmez; owner ve admin rollerinde değişiklik yok. Ekran görüntüsü masaüstü ve telefon.
- Risk R3 · Sıra 2.

**GA-3 Settings'in eski kapıdaki işlemleri çekirdeğe (BL-276'nın kalanı; BL-898'in bu rotalardaki payı).**
- Bugün:
  - 12 fonksiyon (bildirim ayarlarının 4'ü hariç) ve 19 politika yetki merkezine sormuyor.
  - Örnek: Downtown müdürü Ayşe'nin özel rolüne "Jobs: Edit" verildi. Ayşe bütün lokasyonların işlerini ekleyip değiştirir; çekirdek "müdüre organizasyon yazma yok" diyor ama bu yol çekirdeğe sormuyor. (Planlı kapanıştan sonra açık kalan yazma GA-4'te kapanıyor.)
  - İş kataloğu ve roller rotaları önce kendi `permissions.includes` kapısına bakıyor, sonra eski kapıya: iki kapı, ikisi de çekirdek değil.
- Düzeltme:
  - **Bildirim: kapsam dışı (KK-206).** 4 bildirim ayarı fonksiyonu ve `notification-settings` rotası BILDIRIM oturumunun ilk diliminde sökülür. Eski kapının silinmesi o söküme de bağlı: sayaç onlar gidince düşer.
  - **Roller:** `can_edit_role` ve `save_workspace_role_service` `authorize(…, 'settings.roles.write')`'a soracak. Rol sınıfı merdiveni korunur (çekirdekteki `settings.roles.write` satırında rütbe kuralı yok, kaybolmamalı). Admin'in "kendinde olmayan izni veremez" kontrolü çekirdekle yapılır; `role_access_class` NULL-güvenli olur.
  - **İş ve departman:** 5 iş/departman fonksiyonu `settings.jobs.write`'a soracak; `request.jwt.claim.sub` kurma kalkar ve o sayaç düşer.
  - **Vardiya kataloğu:** yeni eylem `settings.shift_catalog.write` (org/write/`settings.shift_catalog.manage`, müdüre kapalı). `reorder_shift_types` ve `reorder_shift_labels` bu eyleme soracak; `delete_catalog_entity_service`'in vardiya kataloğu dalı da `settings.jobs.write` yerine bu eyleme geçer.
  - **Çakışma kuralları tetikleyicisi:** `sync_schedule_conflict_rules`'un `auth.uid()` kapısı kalkar; API yolu zaten çekirdekte.
  - **Politikalar:** 16 RLS politikası ve 3 logo politikası `app_private.rls_can(workspace_id, '<eylem>')`'a geçer; çekirdek kapanmış workspace'i (planlı kapanış dahil) ve kapsamı uygular. `locations_select_scoped_member` `settings.locations.read` eylemine geçer (lokasyon kümesi, `target_locations => array[id]`). `workspace_scheduling_settings`'in grant'siz iki politikası silinir.
  - **Rota kapıları:** bu fonksiyonları çağıran rotalardaki rota-yerel `permissions.includes` kapıları silinir (jobs-management 2, organization-settings 2, roles 2). Bu BL-898'in o rotalardaki payını kapatır; öbür rotalar kendi ekranlarında kalır.
  - **Silinenler:** `public.workspace_has_permission`, `app_private.workspace_has_permission` ve iki şemadaki `can_manage_workspace` silinip `retired_objects_stay_gone`'a girer.
  - **`service_actor_has_permission`:** GA-3'ten sonra 7 çağıran kalır: setup checklist'in 3'ü (EKRAN-05 A1, BL-808) ve bildirim ayarlarının 4'ü (BILDIRIM sökümü). Sayaç `authz_catalog.test.sql:139` önce 10 → 7, sonra 0. Kapıyı en son biten iş siler.
  - Her ret 42501 + `authz.*` olur; ipuçsuz 42501 sayacı aynı commit'te düşer.
- Kırmızı test:
  - `supabase/tests/settings_writes_ask_the_core.test.sql`, her fonksiyon için:
    - (a) rolüne izin fixture'da doğrudan yazılmış müdür, çekirdeğin M2 kuralıyla `authz.out_of_scope` alır (izin olsa da);
    - (b) `closure_scheduled` ve tarihi geçmiş workspace'in admin'i `authz.workspace_closed` alır (RLS yazması dahil);
    - (c) admin başka bir admin rolünü ve kendi rolünü düzenleyemez;
    - (d) RLS: `settings.locations.read` verilmiş Downtown müdürü Uptown lokasyon satırını okuyamaz.
  - Matris: `settings.shift_catalog.write` satırı, kapanmış workspace sütunu.
  - API vitest: rotada `permissions.includes` kalmadığını ve retlerin `authz.*` eşlemesini sınar.
- Risk R3 · Sıra 3. En büyük adım; gerekirse ikiye bölünür: GA-3a fonksiyonlar ve rotalar, GA-3b politikalar.

**GA-4 Planlı kapanış tamamlanır (YB-1).**
- Bugün:
  - Meyhouse'un owner'ı Mert, Account → Workspaces → workspace menüsü → "Close later" seçer. `request_workspace_closure_service` yalnız `lifecycle_status = 'closure_scheduled'` ve `closure_effective_at = now() + 14 gün` yazar (:19170, :19201; `default_closure_period` :2135).
  - 14 gün geçer. Çekirdek workspace'i kapalı sayar (`workspace_open_to_actor` :6036-6039), API kapıyı kapatır.
  - Ama hiçbir şey workspace'i `deleted`'e geçirmiyor:
    - `deleted`'i yalnız "Close now" yazıyor (:19093);
    - temizlik işi yalnız `deleted`'de kuyruğa giriyor (tetikleyici :31327);
    - `workspace-retention` cron'u (`30 3 * * *`) yalnız var olan temizlik işlerini yürütüyor.
  - Sonuç: üyelikler `active` kalır, veri hiç silinmez. Admin Selin tarayıcıdan şunları yapmaya devam eder (kırmızı testte ölçüldü):
    - yeni departman, iş, lokasyon, vardiya tipi ve etiket ekleyebilir (INSERT politikası eski kapıdan geçiyor);
    - lokasyonları değiştirip arşivleyebilir (lokasyonun okuma politikası da eski kapıdan);
    - logoyu değiştirebilir.
  - Öbür katalog güncellemeleri ve workspace adı tarihte zaten duruyor: bu tabloların okuma politikası (`is_workspace_member`) kapanmış workspace'i göstermiyor. Önceki "workspace adını değiştirebiliyor" iddiam yanlıştı (benim hatam; `nf-guvenlik` ölçümü de aynı genellemeyi yapmıştı).
- Düzeltme:
  - "Close now"un bitiriş adımları tek bir iç fonksiyona alınır: `app_private.finish_workspace_closure`. Adımlar: `lifecycle_status = 'deleted'`, `closed_at`, üyelikler `suspended`, bekleyen davetler `revoked`, düzenleme oturumlarının sona ermesi, bildirim işlerinin bastırılması, aktif workspace tercihlerinin silinmesi, denetim kaydı (`request_workspace_closure_service` "immediate" dalı, eski :19092-19167).
  - "Close now" ve zamanlanmış bitiriş aynı fonksiyonu çağırır (ikiz yok). "Close now"un dönüşü ve denetim kaydı değişmez.
  - `app_private.complete_due_workspace_closures()`, `closure_effective_at`'i geçmiş `closure_scheduled` workspace'leri `deleted`'e geçirir:
    - kapanış tarihi `closed_at` olur;
    - kapatan, planı açan owner'dır (talep kaydı yoksa workspace'i açan kişi);
    - talep `completed`, denetim `workspace.closure.completed_scheduled`.
  - pg_cron `workspace-closures` her 5 dakikada koşar (`time-off-deadlines` gibi doğrudan SQL). API'ye ve yeni `*_service`'e gerek kalmaz, katalog dosyalarına dokunulmaz. Teknik seçim (P19): retention cron'u API üzerinden geçtiği için ona eklemek yeni servis isterdi.
  - Temizlik işi var olan tetikleyiciyle kendiliğinden kuyruğa girer. Saklama süresi "Close now"daki kuralla aynı; yeni kural yazılmaz.
  - Bilinen pencere: tarih ile işin koşması arasında (≤5 dk) owner planı iptal edebilir (`cancel_workspace_closure_service` tarihe bakmıyor). Ürün etkisi yok sayıldı, raporda.
  - Owner'ın tarihten önce iptali (:7907) değişmez.
- Kırmızı test (gece kuralı: yeni dosya yok; `account_workspace_controls.test.sql`'e, `ci-green.txt`'te). "Close Later Co" (tarihi geçmiş) ve "Not Yet Co" (tarihi gelmemiş):
  - iş koşar; "Close Later Co" `deleted` olur ve `closed_at` = söz verilen tarih;
  - üyelikleri `suspended`, talep `completed`, temizlik işi kuyrukta, denetim kaydı var;
  - "Not Yet Co" `closure_scheduled` kalır;
  - "Close Later Co"nun admin'i departman ekleyemez (42501) ve lokasyonu değiştiremez;
  - `workspace-closures` işi `*/5 * * * *`.
- Risk R3 (veri silme yolu, canlı DDL; yedek ve doğrulama §5.1) · Sıra 4.

### Ekran dilimlerine ait (bu görev yapmaz; yeri yazıldı, tekrar iş açılmaz)
| Ekran | Kalem | Durum |
|---|---|---|
| EKRAN-02 Requests | BL-276 (1), BL-726, BL-179; `schedule_actor_*` kapıları | veri paketinde, main'e girince kapanır |
| EKRAN-02 Requests | `close` rütbesi (Mert sorusu `A1A2.md:12`); eş müdür reddi testi ve `reject` matris hücresi; `shift_exchange_emit_notification_base` adı; `schedule-requests-routes` rota-yerel kapısı (BL-898) | paketin açık kalanı, EKRAN-02 sahip oturumunda |
| Ekran 6 Documents | BL-276 (2) | kapandı (bayat); yeni iş yok |
| EKRAN-01 Schedule | BL-276 (3); BL-702 ("hayır" sapmaları) | (3) kapandı; BL-702 zaten EKRAN-01 DB-1a'da |
| Ekran 5 Workspace | 3 setup checklist servisi ve `communication-routes` rota kapısı (BL-808, S3'e bağlı); eski kapının silinmesi (son çağıran) | EKRAN-05 A1'de planlı |
| Ekran 10 Settings | BL-232'nin geri kalanı: locations, shift_types, shift_labels ve workspaces ad/logo için API servisleri; departments/jobs arşivi; sonra 5 tablonun INSERT/UPDATE grant'leri ve yazma politikaları silinir; logo yükleme API'ye; Roles ekranının görünüm turu | Ekran 10 turunda (KK-12'deki FB-6.8 payı) |
| Ekran 4 / 10 (müsaitlik ayarı) | `weekly-preferences-routes` rota kapısı (BL-898) | ilgili ekran turunda |
| Ekran 15 / 16 (Account → Workspaces) | `workspace-account-routes`'un 4 rota kapısı (BL-898) | ilgili ekran turunda |
| Ekran 9 Notifications | BL-556 (`notification_actor_is_active_member_service`) | Ekran 9 turunda |
| BILDIRIM (yeni bildirim sistemi) | 4 bildirim ayarı fonksiyonu (`get_notification_settings_service`, `save_notification_policy_service`, `reset_notification_policies_service`, `preview_notification_policy_service`), `notification-settings` rotası, `membership_location_scopes`'un bildirimdeki kullanımı | ilk dilimde sökülür (KK-206); eski kapının 4 çağıranı onunla gider |
| Ekran 13 Shift Hub | `employee_hub_actor_service`'in 4 çağıranı (hint veriyor, `authorize` değil; kısıtlı kişiye bakmıyor ama API önce engelliyor) | Ekran 13 turunda |

### BL-838'e devir
GA-1…3 bitince kampanyanın ekran senaryolarına girmesi önerilenler:
1. Settings → Roles'ta müdür rolüne organizasyon ayarı verilemiyor.
2. Downtown müdürü Settings → Locations'ta Uptown'ı göremiyor ve değiştiremiyor.
3. İki workspace'li admin katalog kaydını taşıyamıyor (API ve tarayıcı).
4. Planlı kapanışı geçmiş workspace'in admin'i Settings'te yazamıyor.
5. Üye olmayan kişi workspace adresinde 404 görüyor.

## Yolda bulunan (koordinatöre; BACKLOG kaydı koordinatörün)
- **YB-1 (önerilen işaret leave: high / do: moderate) Planlı kapanış hiç tamamlanmıyor.**
  - Account → Workspaces → "Close later" (`apps/web/src/account/WorkspacesPage.tsx:688`) yalnız `lifecycle_status = 'closure_scheduled'` yazıyor (:19201).
  - `deleted` durumunu yalnız anında kapatma yazıyor (:19093); temizlik tetikleyicisi yalnız `deleted`'de çalışıyor (:31327). `workspace-retention` cron'u (`30 3 * * *`) yalnız var olan temizlik işlerini yürütüyor.
  - Sonuç: tarih geçince üyelikler `active` kalıyor; eski kapı ve RLS yazmaya izin veriyor; veri hiç silinmiyor (verilen silme sözü).
  - Yetki kısmı GA-3'te, kapanışı tamamlama GA-4'te (KK-206). Yerelde `closure_scheduled` satırı 0; canlı ölçülmedi. Koordinatöre 2026-10-07'de tek satırla bildirildi (mesajda düğme adı yanlışlıkla "Close at end of period" yazıldı; ekrandaki ad "Close later").
- **YB-2 (low / safe)** `workspaces.logo_storage_path` CHECK'i yolu workspace'in kendi kimliğine bağlamıyor (:29547): tarayıcıdan başka workspace'in logo yolu yazılabilir. Kova public olduğu için sızıntı değil; Ekran 10'da logo API'ye taşınınca kapanır.
- **YB-3 (low / moderate)** Rütbe iki yerde tutuluyor: `workspace_memberships.role` ve `workspace_roles.access_class`. Eşitleyen tetikleyici var, uyumsuz satır 0/2588. Eski kapı silinince `save_workspace_role_service`'in `membership.role` okuması da çekirdeğe geçer; kolonun kendisi ayrı iş (CLAUDE.md §2.A.4).
- **YB-4 (low / safe)** `public.can_access_location` ve `public.can_manage_workspace` `authenticated`'a açık RPC (:34576-34583). Yalnız kişinin kendi iznini döndürüyor, sızıntı yok. `can_manage_workspace` GA-3'te silinir; `can_access_location` `locations_select_scoped_member`'dan çıkınca kullanıcısı ölçülür.

## In scope (kod aşaması)
GA-1, GA-2, GA-3, GA-4. Dokunulanlar: migration'lar, `schema.sql` yeniden üretimi, pgTAP, `retired_objects_stay_gone`, `authz_catalog` tavanları, yetki matrisi ve `authorization_matrix.expected.json`, `packages/shared/src/role-permissions.ts`, GA-3'ün rotalarındaki rota-yerel kapılar ve testleri, GA-4'te kapanış fonksiyonları ve `workspace-closures` cron işi.

## Out of scope
- Takas (EKRAN-02).
- Setup checklist (EKRAN-05, BL-808).
- Bildirim ayarları ve `notification-settings` rotası (BILDIRIM sökümü, KK-206).
- Tarayıcı yazmalarının API'ye taşınması ve grant'lerin tamamen kalkması (Ekran 10).
- BL-898'in öbür rotaları (ilgili ekranlarda).
- BL-556 (Ekran 9) ve `employee_hub_actor_service` (Ekran 13).
- Yasaklı ad sayacındaki bildirim fonksiyonları (`_base`, `_v1`, `_v2`; 12).
- Logo kovasının SVG ve public sorunu (BL-282).
- `workspace_memberships.role` kolonu (YB-3).

## Done when
- `authz_catalog.test.sql:139` eski kapı tavanı 7 (EKRAN-05 A1 ve BILDIRIM sökümünden sonra 0); `workspace_has_permission` ve `can_manage_workspace` `retired_objects_stay_gone`'da.
- `permissions` tablosunda 8 organizasyon izni ve `roles.read` için `custom_grantable = false`; müdür sınıfı hiçbir rolde bu izinler yok (yerel ve canlı SELECT).
- Katalog tablolarında `authenticated` `workspace_id`, `id` ve `created_at` güncelleyemiyor (`has_column_privilege` = false).
- GA-3'ün rotalarında `permissions.includes` yok.
- Tarihi geçmiş planlı kapanış `deleted` oluyor, üyelikler `suspended`, temizlik kuyrukta.
- Yeni pgTAP hücreleri ve dosyaları yeşil, ters test silinmiş. Tam kapı, `test:db` ve etkilenen e2e (Settings → Roles, Locations, Jobs; Account → Workspaces) yeşil; her adımda `nf-guvenlik` ONAY.

## Touches
- `supabase/migrations/<yeni>` (4) ve `supabase/schema.sql`.
- GA-1 ve GA-4 (paketten önce, gece): yalnız var olan `browser_privileges.test.sql`, `organization_basics_rls.test.sql`, `account_workspace_controls.test.sql`.
- GA-2 ve GA-3 yeni testler: `supabase/tests/{organization_settings_stay_with_owner_and_admin, settings_writes_ask_the_core}.test.sql`.
- Değişen testler: `roles_permissions_rls.test.sql`, `authz_catalog.test.sql`, `authorization_matrix.test.sql`, `authorization_coverage.test.sql`, `retired_objects_stay_gone.test.sql`, `ci-green.txt`.
- `packages/shared/src/authorization-matrix.expected.json`, `packages/shared/src/role-permissions.ts` ve testi.
- API (GA-3): `apps/api/src/settings/{jobs-management,organization-settings,roles}-routes.ts` ve testleri.

## Test plan
Her adımda sıra aynı:
1. Önce kırmızı pgTAP (rollback'li tek transaction, `supabase/CLAUDE.md`).
2. Sonra migration, test yeşile döner.
3. Adım sonunda `test:db` (`db.lock` + `heavy.lock`), tam kapı ve etkilenen e2e.

Matris dökümü: `pnpm.cmd --filter @newfork/shared dump:authz-matrix`.

## Risk notes
- **Canlı veri:** canlıda bu izinleri taşıyan özel rol olabilir; GA-2 migration'ı onları siler. Gönderimden önce canlı SELECT (koordinatör izni) ve yedek (`pg_get_functiondef` + silinen satırlar).
- **GA-1 kolon listesi:** kolon grant listesi web'in bugün yazdığı kolonlarla birebir olmalı; eksik kolon Settings formunu kırar. Settings katalog formları için e2e senaryosu yok (`e2e/flows`); kanıt pgTAP `lives_ok` ile, beş tablonun form güncellemesi `organization_basics_rls.test.sql`'de.
- **GA-3 okuma hızı:** RLS politikalarının `rls_can`'e geçmesi okumayı yavaşlatabilir (`app_private.actor()` ~7 sorgu). Locations listesi ve Schedule ızgarası okuması ölçülür (≤50 ms çıtası).
- **Dosya sırası:** EKRAN-02 paketi matris, katalog ve `ci-green.txt`'e dokunuyor; bu görev paket main'e girmeden bu dosyaları açmaz.

## Notes / Result
**Karar:** ölçüm bitti. Aile A'nın kalanı üç çekirdek iş (GA-1 taşıma kilidi, GA-2 organizasyon izinleri, GA-3 eski kapıdan çekirdeğe) ve ekranların payı. EKRAN-02 paketi takas kolunu kapatıyor. Yeni ciddi yan bulgu: planlı kapanış tamamlanmıyor (YB-1).
**İzin:** bu aşamada gerekmedi (salt okuma; yalnız bu dosyanın commit'i, `task/guvenlik-a` dalında, push yok). Kod aşaması için koordinatörün "başla"sı ve EKRAN-02 paketinin main'e girmesi gerekiyor.
**Risk:** 🔴 Organizasyon izinleri müdür rolüne verilebiliyor, katalog kaydı workspace'ler arasında taşınabiliyor, planlı kapanış tamamlanmıyor. Üçü de kodda açık; yerel veride kullanılmamış, canlı ölçülmedi.
**Soru:** koordinatöre 3 süreç sorusu (aşağıda); Mert'e soru yok.
**Sonraki:** EKRAN-02 paketi main'e girince GA-1 → GA-2 → GA-3; YB-1 için ayrı iş.

**Koordinatöre sorular** (§5.1 kapsamında süreç ve teknik kararlar; önerilen ilk sırada):
1. GA-1 (taşıma kilidi) ve GA-2 (BL-178'in veritabanı kuralı ve shared bayrak) Ekran 10'u beklemeden bu görevde mi yapılsın?
   - **(Önerilen) evet:** biri kiracılar arası yazma, öbürü yazılı bir kuralın (KARARLAR:85) tersine kilitlenmiş test; Ekran 10 sırada uzak. Dayanak: CLAUDE.md §2.A.1, §2.A.3; ILKELER P02; `nf-guvenlik` aynı görüşte.
   - Hayır: Ekran 10 turunda, KK-12'deki FB-6.8 dilimiyle.
2. GA-3, taşıdığı rotalardaki rota-yerel kapıları (BL-898'in o rotalardaki payı) da silsin mi?
   - **(Önerilen) evet:** çekirdeğe geçen fonksiyonun önünde ikinci kapı kalmasın. Dayanak: CLAUDE.md §2.A.1, §2.A.4.
   - Hayır: BL-898 her rotayı kendi ekranında kapatır.
3. YB-1 (planlı kapanış tamamlanmıyor) nerede yapılsın?
   - **(Önerilen) ayrı acil iş:** yaşam döngüsü ve silme işi, yetki değil; leave: high.
   - Ekran 15/16 (Account → Workspaces) turu.
   - GUVENLIK-A'ya ek.

**Kanıt:**
- Komutlar: yerel DB `begin read only … rollback` içinde `pg_proc`, `pg_policies`, `information_schema.{role_table_grants,column_privileges,routine_privileges}`, `pg_constraint`, `pg_trigger`, `app_private.authz_actions`, `cron.job` SELECT'leri; `git diff origin/main...task/ekran-02-a4 -- supabase`.
- Elle doğrulanan satırlar: `roles_permissions_rls.test.sql:133-141`, `save_workspace_role_service` :22321-22350, workspaces kolon grant'i (8 kolon), `shift_labels` yabancı anahtar 0, `locations_reach_the_owner` tetikleyicisi ve atamasız lokasyon 0/652, `logo_storage_path` CHECK :29547, planlı kapanış yolu (:19093, :19201, :31327, cron `workspace-retention`), `http-error.ts:55`.
- Alt ajan raporları oturum dökümünde.

### GA-1 uygulama (2026-10-07, KK-206)
- **Migration:** `supabase/migrations/20261007230000_catalog_rows_stay_in_their_workspace.sql`. Beş tabloda tablo düzeyi UPDATE geri alındı; yalnız formların gönderdiği kolonlar açık. Adı EKRAN-02 paketinden (`140000`–`170000`) ve EKRAN-01 dalının `180000`/`200000`'ünden büyük.
- **Kırmızı** (migration'sız, ortak DB, rollback'li):
  - `browser_privileges` 2/10 düştü (tablo düzeyi UPDATE fazlası; 27 fazla kolon);
  - `organization_basics_rls` 3/19 düştü (etiket taşıma, departman taşıma, `id` değişimi "caught: no exception").
- **Yeşil** (migration aynı transaction'da):
  - iki dosya 0 hata;
  - katalog tablolarına tarayıcıdan yazan öbür 8 dosya (`catalog_entity_deletion`, `jobs_department_bulk_assignments`, `roles_permissions_rls`, `schedule_default_hours_review`, `schedule_time_source`, `shift_exchanges_v1`, `time_off_cancellation_requests`, `time_off_requested_periods`) migration'lı ve migration'sız aynı: 0 hata.
  - Elle: transaction içinde `shift_labels.workspace_id` UPDATE = false, `name` = true; rollback'ten sonra ortak DB'de yine true (iz yok).
- **Tetikleyiciler:** 5 tablodaki 26 tetikleyiciden hiçbiri çağıranın rolüyle katalog tablosu güncellemiyor (BEFORE olanlar NEW'i değiştiriyor). Daraltma onları kırmaz.
- **EKRAN-02 paketiyle sıra** (paketin 4 migration'ı dalından, tek transaction):
  - yerel/canlı sırası (önce GA-1, sonra paket) ve CI sırası (önce paket, sonra GA-1): iki dosya da 0 hata;
  - paketin gerçekten uygulandığı elle doğrulandı (`schedule_actor_has_capability_service` yok, grant daraltılmış);
  - paket bu tabloların grant'ine dokunmuyor (diff grep 0).
- **Kapı:** `pnpm.cmd lint`, `typecheck`, `test`, `build` yeşil; `schema-snapshot check-fast` yeşil; `schema.sql` yeniden üretildi (fark yalnız grant satırları).
- **`test:db`:** ortak DB migration'ı main penceresinden önce görmediği için (supabase/CLAUDE.md) tam pgTAP koşusu dal push'unun CI'ında (temiz kurulum).
- **İnceleme:** `nf-guvenlik` **ONAY @dbbb72d6** (engel ve önemli bulgu yok). Uygulanan düşük notlar:
  - N1: "formlar hâlâ çalışır" hücresi departman, iş (departman değişikliği dahil) ve vardiya tipi saatlerini de kapsıyor.
  - N2: geri alma yolu aşağıda.
- Öbür notlar rapora kaldı:
  - N3: üç test (`catalog_entity_deletion:47`, `jobs_department_bulk_assignments:108`, `management_owner_job:297`) `deleted_at` yazmasında artık tetikleyici yerine grant reddiyle 42501 alıyor; test adları tetikleyiciyi kanıtlamıyor.
  - N4: tarayıcıdaki ret düz "permission denied", `authz.*` yok; Ekran 10'a kadar geçici yol.
  - N5: paket sonra girerse yerelde `supabase migration up` eski tarihli dosyada uyarabilir; ortak DB'ye uygulama psql ile, main penceresinde.
- **Geri alma:** `revoke update (<kolonlar>) on <5 tablo> from authenticated; grant update on public.departments, public.jobs, public.locations, public.shift_types, public.shift_labels to authenticated;` (eski tablo düzeyi grant; yalnız acil durumda, kiracılar arası taşımayı geri açar).

### GA-4 uygulama (2026-10-07, gece, BL-906)
- **Migration:** `supabase/migrations/20261008002400_close_later_finishes_on_its_date.sql`.
  - `app_private.finish_workspace_closure` ("Close now"un bitirişi, tek yer);
  - `request_workspace_closure_service` "immediate" dalı onu çağırıyor (dönüş ve denetim kaydı aynı);
  - `app_private.complete_due_workspace_closures()`;
  - pg_cron `workspace-closures` `*/5 * * * *`;
  - iki iç fonksiyonda `public`, `anon`, `authenticated` için çalıştırma izni yok.
- **Kırmızı** (GA-1'li, GA-4'süz, ortak DB, rollback'li): `account_workspace_controls` 10/65 düştü — fonksiyon yok; workspace `closure_scheduled` kaldı; üyelikler aktif (2); talep `scheduled`; temizlik ve denetim yok; admin departman ekledi ("caught: no exception") ve lokasyonu "After close" yaptı; cron yok.
- **Kırmızıda yakalanan yanlışım:** "admin departmanı güncelleyebilir" hücresi düzeltmesiz de geçti. Bu tablolarda okuma politikası (`is_workspace_member` → `workspace_open_to_actor`) kapanmış workspace'i gizliyor, UPDATE 0 satır. Hücre bugün gerçekten açık olan iki yola (INSERT, lokasyon UPDATE) çevrildi. Plan ve özet buna göre düzeltildi.
- **Yeşil** (GA-1 + GA-4):
  - `account_workspace_controls` 65/65;
  - kapanışa ya da cron'a dokunan öbür dosyalar migration'lı ve migration'sız aynı: `authorization_coverage`, `employee_private_storage_contract`, `lifecycle_refusals_carry_keys`, `time_off_deadlines`, `workspace_lifecycle`, `workspace_rls` 0 hata; `authorization_matrix`'teki 26 satır iki durumda da aynı "TODO known".
- **EKRAN-02 paketi** kapanış fonksiyonlarına dokunmuyor (diff'te tek eşleşme ilgisiz `schedule_closures`).
- **Şema:** `schema.sql` yeniden üretildi (439 migration), `check-fast` yeşil.
- **İnceleme:** `nf-guvenlik` **ONAY @e4ecc990** (Kritik/Yüksek yok). Uygulananlar:
  - **O1 (Orta):** iş bütün workspace'leri tek işlemde dolaşıyordu; birinin hatası o koşudaki bütün kapanışları geri alır ve her 5 dakikada takılırdı. Artık her workspace kendi alt işleminde (`begin … exception when others`, `time_off_sweep` kalıbı); hata `WARNING` olarak yazılıyor, workspace sonraki koşuya kalıyor.
    - Kırmızı: bilerek bozulan "Broken Close Co" bütün koşuyu düşürdü, "Close Later Co" kapanmadı (9 hücre).
    - Yeşil: 68/68; uyarı yalnız "Broken Close Co"yu adlandırıyor.
  - **D2:** iş testte oturumsuz koşuyor, cron'daki gibi.
  - **D3:** cron hücresi zamanlamayla birlikte komutu da sabitliyor.
  - **D1:** tarihten sonra ≤5 dk iptal penceresi kabul edildi, değişmedi.
- **Dal CI:** `37604813162` @e4ecc990 (O1'den önce): check, db, e2e, db-budget yeşil. O1 commit'i için yeni koşu push'ta.

### GA-1 gönderim şartı (koordinatör, 2026-10-07 ~11:35Z)
- **Soru:** iki workspace'te yetkili admin, Meyhouse'taki bir işi Deniz Cafe'nin departmanına bağlayabilir mi (`jobs.department_id` hâlâ yazılabilir)?
- **Cevap: bağlayamaz.**
  - Bileşik yabancı anahtar `jobs_department_id_workspace_id_fkey` `(department_id, workspace_id)` çiftini `departments(id, workspace_id)`'e bağlıyor (`supabase/migrations/20260817153000_organization_basics.sql:53`; main `supabase/schema.sql:32074`).
  - GA-1'den sonra işin `workspace_id`'si değişemiyor; başka workspace'in departmanı bu çiftle eşleşmez → 23503.
  - Koruma hücresi: `organization_basics_rls.test.sql` "a job cannot be tied to another workspace's department" (`da24ad98`; GA-1 migration'ıyla 20/20).
  - Yazılabilir kolonlar arasında başka `*_id` yok: departments, locations, shift_types, shift_labels'ta hiç yok. workspaces'te `logo_storage_path` var ama yabancı anahtar değil (YB-2).
- **İkinci inceleme:** `nf-guvenlik` **ONAY @e77aeb40** (O1 kalıbı, test tetikleyicisinin sızmaması, koruma hücresinin gerçekten bileşik anahtarı sınaması; Kritik/Yüksek/Orta yok). Rapora kalan düşük notlar:
  - **Gözlenebilirlik:** başarısız kapanış artık `cron.job_run_details`'te "failed" değil, yalnız Postgres günlüğünde WARNING. Kalıcı iz önerisi backlog'a: tabloya ya da `audit_events`'e yazmak, ya da `closure_scheduled and closure_effective_at < now() - interval '10 minutes'` sorgusunu izlemeye eklemek.
  - Test fonksiyonu `public` yerine `tests` şemasında durabilir (kural değil).
  - `set_config('app.workspace_closure','on',true)`'yu okuyan yer yok (önceden de böyleydi; ölü kod adayı).

### Gönderim durumu (2026-10-07 gece, güncel)
- **GA-1 main'de:** `a79ff194` (migration), `08991cdc`, `fa6a9964` (testler), `a8a18304` (bu dosya).
  - Koordinatörün "gönder"iyle; OPS-03'e göre daraltan migration önce main.
  - Gönderim öncesi: migration ortak yerel DB'ye `supabase migration up --local` ile `main.lock` penceresinde uygulandı (438). `test-db --load-only` ve `test:db` koştu: GA-1'in iki dosyası ok. Öbür kırmızılar main'de bilinen hatalar:
    - `bl052_document_lifecycle`, `bl052_document_notifications`, `document_types_rls`: ortak DB kayması (BL-497, BL-841);
    - `scheduling_settings_shift_types_rls` 12-13, 23 ve `weekly_exchange_changed_terms`: `ci-not-green.txt`. İlki eski tablo grant'i geri verilince de aynı üç testte düşüyor (elle doğrulandı).
    - `management_owner_job` "TODO passed 19-20" (BL-187) iki durumda da aynı.
  - Tam kapı yeşil. Main CI `37615016851`.
  - **Canlı** sabah, Mert'in bu oturuma yazacağı "evet"le.
- **GA-4 gönderime hazır:** dal `task/guvenlik-a-ga4` (main + GA-4 iki commit + bu dosya).
  - Sıra sabah: Mert'in "evet"i → yedek → canlıya GA-1 ve GA-4 → GA-4 main.
  - Ekleyen migration (yeni fonksiyon + cron), OPS-03'e göre önce canlı.

### Sabah canlı adımları (Mert'in bu oturuma yazacağı "evet"ten sonra)
Sıra: yedek (yalnız SELECT, çıktılar `artifacts/guvenlik-a/`) → GA-1 `apply_migration` → doğrulama → GA-4 `apply_migration` → doğrulama → `get_advisors` → GA-4 main gönderimi (rebase, tam kapı, push) → main CI.
**Yeniden numara (KK-220, KARARLAR OPS-05 eki):** GA-4 migration'ı main'in o anki son migration'ının arkasına yeniden adlandırılır (2026-10-08: `20261007233000` → `20261008002400`; gönderim anında main daha ilerideyse yeniden). İçerik aynı kalır, `pnpm.cmd db:schema` yeniden koşulur. Canlıya bu yeni adla uygulanır; md5 aynı kalır.

```sql

-- 1a. Beş katalog tablosunun ve workspaces'in bugünkü grant'leri (GA-1 geri alma yedeği)
select c.relname, c.relacl::text,
       (select json_agg(json_build_object('col', a.attname, 'acl', a.attacl::text))
          from pg_attribute a where a.attrelid = c.oid and a.attacl is not null) as column_acl
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('departments', 'jobs', 'locations', 'shift_types', 'shift_labels', 'workspaces');

-- 1b. GA-4'ün yeniden tanımladığı servis (geri alma yedeği)
select pg_get_functiondef('public.request_workspace_closure_service(uuid, uuid, text, text, boolean, timestamptz)'::regprocedure);

-- 1c. cron işleri ve planlı kapanışlar (GA-4 canlıya girerken sürpriz kapanış olmasın)
select jobname, schedule, command, username from cron.job order by jobname;
select lifecycle_status, count(*), min(closure_effective_at) from public.workspaces group by 1;

-- 1d. Son uygulanmış sürüm
select version, name from supabase_migrations.schema_migrations order by version desc limit 3;

-- 3. GA-1 doğrulama: beklenen false / true / false
select has_column_privilege('authenticated', 'public.shift_labels', 'workspace_id', 'UPDATE') as label_move,
       has_column_privilege('authenticated', 'public.locations', 'timezone', 'UPDATE') as location_form,
       has_table_privilege('authenticated', 'public.jobs', 'UPDATE') as jobs_table_update;

-- 5. GA-4 doğrulama: fonksiyonlar var, tarayıcıya kapalı, cron işi kurulu
select p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') as browser_can_run
from pg_proc p
where p.pronamespace = 'app_private'::regnamespace
  and p.proname in ('finish_workspace_closure', 'complete_due_workspace_closures');
select jobname, schedule, command from cron.job where jobname = 'workspace-closures';

-- 2/4 sonrası (supabase/CLAUDE.md "Canlı"): sürüme sunucu damgası yazılır, repo sürümüne çevrilir
-- update supabase_migrations.schema_migrations set version = '<repo>' where name = '<ad>' and version = '<damga>';
-- Kanıt: md5(statements[1]) = dosya md5'i.
```

### 2026-10-08: GA-1 canlıda; GA-4 v2
- **Kural:** Mert 2026-10-08 ~00:52Z "Canlı veritabanı izni kimde olsun?" sorusuna "Koordinatörün 'gönder'i yeter" dedi (`decisions.jsonl`; CLAUDE.md §5.3, main `5de09eac`, KK-224).
- **GA-1 canlıda (koordinatörün "gönder"iyle):**
  - Yedek: beş tablonun ve workspaces'in grant'leri, yerel `artifacts/guvenlik-a/ga1-hosted-backup-2026-10-08.json` (gitignore'da). Önceki hâl: beş tabloda tablo düzeyi `authenticated=arw`; `locations`'ta yalnız `service_role` için 5 kolonda okuma.
  - `apply_migration` `catalog_rows_stay_in_their_workspace`; `md5(statements[1])` = dosya md5 `0f748063664b1beca67fa3f9cc6ea6ef`. Sunucu sürümü `20261008005632` → `20261007230000`.
  - Canlıda uygulama sırası `20261007235000` ve `20261008001500`'den sonra; sürüm listesinde üçüncü sırada; toplam 440.
  - Doğrulama: `authenticated`'in güncelleyebildiği kolonlar yereldekiyle birebir; tablo düzeyi UPDATE yok (`ar`). Bağımsız SELECT: etiket taşıma false, `jobs.id` false, lokasyon formu true, ekleme true, `service_role` okuması korunuyor.
  - `get_advisors` (security): yeni bulgu yok. Önceden olan: RLS'i politikasız 98 tablo (bilgi), `pg_net` public şemada, sızmış parola koruması kapalı (§2.A.9 muafiyeti).
- **GA-4 v2:** dal `task/guvenlik-a-ga4-v2`, güncel main üstünde. Migration `20261008002400` (içerik aynı; EKRAN-01 paketinin bekleyen `002000`–`002300`'ünden sonra). `schema.sql` yeniden üretildi.
- **Kod incelemesi (`/code-review`):**
  - Kapanış tarihi hücresi tautolojikti (aynı argümandan yazılan iki alanı karşılaştırıyordu). Artık testin kurduğu tarihle karşılaştırıyor. Mutasyon denemesi: bitirişe tarih yerine `now()` verilince yalnız bu hücre düşüyor.
  - **Açık ürün sorusu:** "Close later" tamamlanınca veri, "Close now"daki gibi bir sonraki 03:30 temizliğinde kalıcı olarak siliniyor. Onay metni ise yalnız "I understand everyone loses access on the closure date." diyor (`apps/web/src/account/WorkspacesPage.tsx:869`); "cannot be undone" yalnız "Close now"da var (ILKELER P25). Seçenekler: (a) onay metni silmeyi açıkça söyler; (b) planlı kapanışa silmeden önce bir bekleme süresi. Mert'te.
  - Owner'ın tarihten sonra ≤5 dk iptal penceresi bilinen ve kabul edilen not olarak duruyor.
- **Kilit ihlali (benim hatam):** v2 denemeleri `db.lock` başkasındayken koştu; ret çıkış koduna bakılmadı. Rollback'liydi, kalıcı iz yok (440, cron işi yok). Koordinatöre bildirildi.

### GA-4 ekran metni (KK-225, Mert 2026-10-08)
- **Değişen metinler** (`apps/web/src/account/WorkspacesPage.tsx`):
  - ⋯ menüsü "Schedule closure" / kırmızı "Close immediately";
  - panel başlıkları "Schedule closure for <ad>" / "Close <ad> immediately";
  - onay düğmeleri menüyle aynı ad (yükleniyor hâli "Closing");
  - rozet "Scheduled closure · <tarih>" (tarih yoksa eski cümle "Closes on its scheduled date");
  - "Cancel closure";
  - zamanlanmış açıklamanın sonu "Then the workspace and its data are permanently deleted.";
  - hemen kapatma açıklaması aynı.
- **Test:** `WorkspacesPage.test.tsx` yeni adlara çevrildi, beklenti gevşetilmedi. Tarihli ve tarihsiz iki duruma "permanently deleted." cümlesi beklentisi eklendi. Önce 21 kırmızı, sonra 59/59. e2e'de bu adlar geçmiyor.
- **Kapı:** lint, typecheck, web testi (239 dosya, 2335 geçti / 1 atlandı), web build yeşil.
- **Ekran görüntüleri** (masaüstü 1440, yerel seed owner'ı, okuma; veri yazılmadı):
  - `newfork-clean/artifacts/guvenlik-a/ga4-menu-1440.png`;
  - `ga4-schedule-closure-panel-1440.png`;
  - ölçüler `ga4-measures.json`.
- **Simetri:** menünün dört öğesi 178×36, ikon x=978 ve dikeyde ortada, 12px, tek satır, ayraç boşlukları eşit (9px). Panelde parola alanı iki yandan 19px, iki düğme 42px ve sağ kenardan 19px, aralarında 8px.
- **Önceden olan, bu işte değişmeyen:** seçili satırın yeşil zemini listenin sağ kenarını 12px aşıyor (1164 / 1152).
