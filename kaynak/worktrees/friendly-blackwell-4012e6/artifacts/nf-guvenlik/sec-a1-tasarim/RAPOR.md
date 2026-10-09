# SEC-A1-TASARIM — Settings yazmalarını çekirdeğe taşıma (BL-232 + BL-178) düzeltme tasarımı

**ÖZET:** İş iki adımda yapılır.
- **Adım 1, ekleyen:** yeni `*_service` fonksiyonları ve API uçları gelir, web yazmaları bunlara geçer. Önce canlı DB, sonra main.
- **Adım 2, söken:** tarayıcının 5 katalog tablosundaki yazma izni ve 13 politika kalkar; 8 organizasyon izni özel role verilemez olur ve var olan özel rollerden silinir; bir tetikleyici bunu kalıcı kılar. Önce main, sonra canlı.

Temel değişmiyor. Çekirdek M2'de müdüre organizasyon yazmasını zaten kapatıyor (`authz_scope_rules`: M2 / org / write = `none`). Yazmalar çekirdekten geçince Mert'in 2026-09-26 kararı ("bu izinler yalnız owner ve admin'de") kendiliğinden uygulanır. Lokasyonun workspace'ler arası taşınması da kapanır: servis `workspace_id`'yi gövdeden almaz.

Karar gerektiren bir soru yok; aşağıdaki seçimler var olan desene göre. Tahmin ~19 puan, 4 rol adımı.

Rol: nf-guvenlik (salt okuma, plan), 2026-10-05 ~08:10Z. Kaynak:
- `origin/main` `6358125b`.
- Yerel DB = main (`20261007030000`); yalnız SELECT, bu turda deneme yapılmadı.
- Kod yazılmadı.

---

## 0. Bugün ne var (ölçüm)

**Tarayıcı yazma yolları** (`apps/web/src/settings/organization-data.ts`):

| Web fonksiyonu | Tablo | Satır | Ekran (yol) |
|---|---|---|---|
| `updateOrganizationName` | `workspaces` UPDATE | `:233-242` | Settings → General |
| `saveScheduleLogo` → `updateWorkspaceLogo` | `workspaces` UPDATE + `workspace-logos` depolama | `:91-180` | Settings → General; Schedule → logo penceresi |
| `saveLocation`, `setLocationArchived` | `locations` INSERT/UPDATE | `:248-298` | Settings → Locations; Owner kurulum sihirbazı → Locations |
| `saveDepartment`, `setDepartmentArchived` | `departments` | `:310-343` | Settings → Jobs; sihirbaz → Jobs |
| `saveJob`, `setJobArchived` | `jobs` | `:349-391` | Settings → Jobs (`JobCatalogEditor`); sihirbaz → Jobs |
| `saveShiftType`, `setShiftTypeArchived` | `shift_types` | `:501-551` | Settings → Shift types |
| `saveShiftLabel`, `setShiftLabelArchived` | `shift_labels` | `:569-602` | Settings → Shift labels |

Zaten API'den gidenler:
- Scheduling settings (`PUT …/scheduling-settings`)
- Important dates
- Shift type / label sıralaması (`POST …/shift-types/reorder`, `…/shift-labels/reorder`)
- Departman/iş oluşturma ve güncelleme (`apps/api/src/settings/jobs-management-routes.ts:57`, `:121`, `:177`, `:202`, `:262`)
- Katalog silme (`:147`, `delete_catalog_entity_service`)

**Tarayıcı izinleri:**
- `departments`, `jobs`, `locations`, `shift_labels`, `shift_types` → INSERT, SELECT, UPDATE. Kolon UPDATE `workspace_id`, `id`, `system_key`, `deleted_at`, `created_at` dahil.
- `workspaces` → SELECT + 8 kolonda UPDATE (`name`, `logo_*`, `schedule_logo_*`, `updated_at`).
- `workspace_scheduling_settings` → yalnız SELECT. Insert/update politikaları ölü.

**Eski kapıyla yazma politikaları** (`workspace_has_permission` → `service_actor_has_permission`):
- `{departments,jobs,locations,shift_labels,shift_types}_{insert,update}_admin` (10)
- `workspaces_update_manager`
- `scheduling_settings_{insert,update}_admin` (ölü)
- `storage.objects`: `workspace_logos_{insert,update,delete}_admin`

**Eski kapıdaki servisler:**
- `create_department_jobs_service`, `create_department_with_jobs_service`, `create_job_with_assignments_service`, `update_department_with_jobs_service`, `update_job_details_and_assignments_service`
- `reorder_shift_types_service` / `reorder_shift_labels_service`: `request.jwt.claim.sub` yazıp RLS'li `reorder_shift_types` / `reorder_shift_labels`'ı çağırıyor; o da `workspace_has_permission`.

**Çekirdek eylemleri** (`app_private.authz_actions`):

| Eylem | Kapsam | İzin |
|---|---|---|
| `settings.organization.write` | org | `settings.general.manage` |
| `settings.locations.write` | org | `settings.locations.manage` |
| `settings.jobs.write` | org | `settings.jobs.manage` |
| `settings.scheduling.write` | org | `settings.schedule_rules.manage` |
| `settings.conflict_rules.write` | org | `schedule.conflict_rules.manage` |
| `settings.notifications.write` | org | `notifications.settings.write` |
| `settings.documents.write` | org | `documents.manage` |

**Eksik eylem: `settings.shift_catalog.write`** (shift types / labels için yazma eylemi yok).

**Özel role verilebilen organizasyon izinleri** (`custom_grantable = true`):
- `settings.general.manage`, `settings.locations.manage`, `settings.jobs.manage`, `settings.shift_catalog.manage`, `settings.schedule_rules.manage`, `schedule.conflict_rules.manage`, `notifications.settings.write`, `documents.manage`.
- `documents.manage` yalnız `settings.documents.write`'ta kullanılıyor. Çalışan belgesi onayı ayrı izin (`employee_documents.review`), yani BL-560 ile çakışmaz.
- Yerel DB'de bu izinleri taşıyan müdür/çalışan sınıfı rol: **0**. Canlı ölçülmedi.

**Rol kaydetme izin tutuyor:** `save_workspace_role_service` satır 17, verilemez izni "rol zaten taşıyorsa" geçiriyor (`and not exists(… old_grant …)`). Adım 2'de kalkmazsa eski grant'ler sonsuza kadar yaşar (P01'e aykırı).

---

## 1. Adım 1 — ekleyen (önce canlı DB, sonra main)

### 1a. `nf-db` — migration `…_settings_catalog_asks_the_core.sql`

**Yeni çekirdek eylemi:**
- `settings.shift_catalog.write` → `scope_class 'org'`, `effect 'write'`, `permission_key 'settings.shift_catalog.manage'`.

**Yeni servisler.** Hepsinin ortak biçimi:
- `public`, `SECURITY DEFINER`, `set search_path = ''`.
- `revoke all … from public`, `grant execute … to service_role`.
- İlk satır `perform app_private.authorize(actor_user_id, target_workspace_id, '<eylem>')`.
- `workspace_id` her zaman parametreden gelir, gövdeden asla.
- Hedef satır `where id = target_id and workspace_id = target_workspace_id` ile bulunur.
- Bulunamazsa ya da başka workspace'teyse aynı cevap: `42501` + `authz.out_of_scope` (bilinmeyen = kapsam dışı).

| Servis | Eylem | Not |
|---|---|---|
| `save_location_service(actor, ws, target_location_id uuid null, values jsonb)` | `settings.locations.write` | `null` = ekle. İzin listeli alanlar: `name`, `short_name`, adres alanları, `timezone`, `phone`, `sort_order`. `workspace_id`, `id`, `system_key`, `deleted_at`, `created_at` kabul edilmez. |
| `set_location_archived_service(actor, ws, target_location_id, archived boolean)` | `settings.locations.write` | Bugünkü tetikleyiciler (`locations_reach_the_owner*`, `catalog_deletion_state_guard`) aynen çalışır. |
| `set_department_archived_service`, `set_job_archived_service` | `settings.jobs.write` | Ekle/güncelle zaten API'de; yalnız arşiv eksik. |
| `save_shift_type_service`, `set_shift_type_archived_service` | `settings.shift_catalog.write` | `shift_type_time_revision` / `_history` tetikleyicileri aynen çalışır. |
| `save_shift_label_service`, `set_shift_label_archived_service` | `settings.shift_catalog.write` | |
| `update_workspace_identity_service(actor, ws, name text)` | `settings.organization.write` | |
| `set_workspace_logo_service(actor, ws, storage_path text null, file_name, scale, offset_x, offset_y)` | `settings.organization.write` | Yol `<ws>/logo/` önekiyle sınanır; `null` = kaldır. |

**Katlanan (gövdesi çekirdeğe çevrilen) servisler:**
- `create_department_jobs_service`, `create_department_with_jobs_service`, `create_job_with_assignments_service`, `update_department_with_jobs_service`, `update_job_details_and_assignments_service` → `settings.jobs.write`. `update_job_details_and_assignments_service` yalnız atama değişiyorsa bugün `employees.manage` soruyor (`jobs-management-routes.ts:272`); o dal kendi eylemiyle kalır.
- `reorder_shift_types_service` / `reorder_shift_labels_service` → çekirdek. Gövdedeki `request.jwt.claim.sub` yazımı ve iç `reorder_shift_types` / `reorder_shift_labels` kalkar; mantık servise taşınır.

**Depolama** (logo dosyası tarayıcıdan yüklenmeye devam eder; dosya taşımayı API'ye almak gereksiz):
- `workspace_logos_{insert,update,delete}_admin` politikaları `workspace_has_permission(…)` yerine `app_private.rls_can(<ws>, 'settings.organization.write', null, null, null)` sorar.
- Bu, RLS'te çekirdeğe soran izinli yol (CLAUDE.md §9; 3 politika zaten kullanıyor).

**Koruma ve kapsam:**
- Yeni servisler `authorization_coverage`'a sınıflanarak girer (§9 "sınıflanmadan girmez").
- Gövde karşılaştırması (`nf-guvenlik` kontrol listesi): katlanan beş servisin gövdesi canlı tanımla (`pg_get_functiondef`) `diff -w`. Yalnız kapı satırı değişmeli.

### 1b. `nf-backend` — API ve web veri katmanı

**API** (`apps/api/src/settings/`): yeni uçlar var olan `jobs-management-routes.ts` biçiminde (`/v1/workspaces/:workspaceId/organization/...`):

| Uç | Servis |
|---|---|
| `POST /organization/locations`, `PATCH /organization/locations/:locationId` | `save_location_service` |
| `POST /organization/locations/:locationId/archive` (gövde `{ archived }`) | `set_location_archived_service` |
| `POST /organization/departments/:id/archive`, `POST /organization/jobs/:id/archive` | arşiv servisleri |
| `POST /organization/shift-types`, `PATCH /organization/shift-types/:id`, `POST …/:id/archive` | shift type servisleri |
| `POST /organization/shift-labels`, `PATCH …/:id`, `POST …/:id/archive` | shift label servisleri |
| `PATCH /organization/identity` (ad), `PUT /organization/logo` (logo bilgisi) | workspace servisleri |

Kurallar:
- **Önce yetki, sonra gövde** (BL-383 sırası). Yeni uçlar 84'e eklenmez.
- Yetki: paylaşılan `authorize(context, action)`. Dosya içi `authorize` sarmalayıcısı (`organization-settings-routes.ts:193`, `jobs-management-routes.ts:30`) yeni uçlarda kullanılmaz (BL-374'ün kuralı). Var olan sarmalayıcıların değişmesi BL-374'ün işi; bu işe karışmaz.
- "Hayır" sözleşmesi: `42501` + `authz.not_member` → 404, öteki `authz.*` → 403, aynı yardımcıyla.
- Shared: gövde şemaları `packages/shared` içinde (`locationInputSchema` vb. varsa yeniden kullanılır). Cevap: var olan okuma şekli (`Location`, `Job`, …), yeni alan yok.

**Web** (`apps/web/src/settings/organization-data.ts`):
- Yukarıdaki 13 fonksiyon `client().from(...)` yerine `organizationRequest(...)` (`:63-89`, var olan yardımcı) kullanır.
- Ekran bileşenleri değişmez: imzalar aynı kalır.
- Logo: dosya yükleme (`storage.upload`) tarayıcıda kalır; `updateWorkspaceLogo` API'ye gider.

Etkilenen ekranlar (görünüm aynı; yalnız yazma yolu ve ret metni değişir):
- Settings → General (ad, logo)
- Settings → Locations
- Settings → Jobs (departman ve iş arşivi)
- Settings → Shift types
- Settings → Shift labels
- Owner kurulum sihirbazı → Locations ve Jobs adımları
- Schedule → logo penceresi

---

## 2. Adım 2 — söken (önce main, sonra canlı DB)

Adım 1 canlıda ve main'de olduktan sonra eski yol kullanılmaz. Söküm sırasında eski web kalmaz. Yine de OPS-03'e uyulur: alan silen işte önce main, sonra canlı.

### 2a. `nf-db` — migration `…_settings_catalog_closes_to_the_browser.sql`

1. `revoke insert, update on public.{departments,jobs,locations,shift_labels,shift_types} from authenticated;` ve `workspaces` üzerindeki 8 kolonluk UPDATE iznini revoke (yalnız SELECT kalır).
2. Politikalar düşer:
   - `departments_insert_admin`, `departments_update_admin`
   - `jobs_insert_admin`, `jobs_update_admin`
   - `locations_insert_admin`, `locations_update_admin`
   - `shift_labels_insert_admin`, `shift_labels_update_admin`
   - `shift_types_insert_admin`, `shift_types_update_admin`
   - `workspaces_update_manager`
   - `scheduling_settings_insert_admin`, `scheduling_settings_update_admin` (ölü)
3. İzinler: `update public.permissions set custom_grantable = false where key in ('settings.general.manage','settings.locations.manage','settings.jobs.manage','settings.shift_catalog.manage','settings.schedule_rules.manage','schedule.conflict_rules.manage','notifications.settings.write','documents.manage');`
4. **P01, eski veri korunmaz:** `delete from public.workspace_role_permissions g using public.workspace_roles r where r.id = g.role_id and r.access_class in ('manager','employee') and g.permission_key in (<aynı 8>);`
   - Tolerans yok, uyarı yok.
   - Yerelde 0 satır; canlıda ölçülmedi ve ölçülmesine gerek yok, silme her durumda doğru.
   - Denetim olayı istenirse tek `audit_events` satırı (karar gerekmez; `nf-db` seçer).
5. Kuralı kalıcı kılmak için `workspace_role_permissions` üzerinde `before insert or update` tetikleyicisi: rolün `access_class`'ı owner/admin değilse ve izin `custom_grantable = false` ise `42501` + `authz.missing_permission`.
   - Aynı kural `save_workspace_role_service`'te de var; DB kuralı uygulama kodundan önce gelir.
   - Owner ve admin'in yerleşik rolleri ile `initialize_workspace_roles_trigger` etkilenmez (owner/admin sınıfı).
6. `save_workspace_role_service` satır 17'deki tutma kalkar (`and not exists(… old_grant …)`): verilemez izin, rol eskiden taşısa da reddedilir.
7. Kalkan nesneler (`retired_objects_stay_gone` kalıbında; `*_on_the_core.test.sql` dosyalarındaki `to_regprocedure` / politika yokluğu hücreleri):
   - 13 politika
   - `public.reorder_shift_types(uuid, uuid[])`, `public.reorder_shift_labels(uuid, uuid[])` (Adım 1'de katlandıysa orada)
   - tarayıcının 5 tablodaki INSERT/UPDATE izni

`workspace_has_permission` kalır: `locations_select_scoped_member`, iki `messages` politikası, `workspace_entitlements` ve `workspace_roles` okuma politikaları kullanıyor. Onların çekirdeğe geçmesi BL-276'nın kalanı; bu işe girmez.

---

## 3. Testler (`nf-test` + yazan rol)

### pgTAP — yeni dosya `supabase/tests/settings_catalog_on_the_core.test.sql` (ci-green'e eklenir)

| # | Hücre | Beklenen |
|---|---|---|
| 1 | `has_table_privilege('authenticated', 'public.<t>', 'INSERT' / 'UPDATE')` × 5 tablo; `workspaces` kolon UPDATE | hepsi false |
| 2 | 13 politikanın yokluğu (`pg_policies`) | 0 |
| 3 | **Taşıma kilidi (bugünkü açığın kendisi):** `set local role authenticated` ile `update locations set workspace_id = <öteki> …` | `42501` (izin yok) |
| 4 | `save_location_service`: owner / admin | geçer |
| 5 | Aynı servis: yerleşik Manager | `42501` `authz.out_of_scope` (M2 org write = none) |
| 6 | Employee | `authz.missing_permission` |
| 7 | Başka workspace'in üyesi olmayan kişi | `authz.not_member` |
| 8 | Başka workspace'teki lokasyon kimliği / var olmayan kimlik | ikisi de `authz.out_of_scope`, aynı mesaj |
| 9 | Gövdede `workspace_id` gönderilse bile satır kendi workspace'inde kalır | `workspace_id` değişmez |
| 10 | Kapalı workspace | `authz.workspace_closed` |
| 11 | `custom_grantable = false` olan 8 izin | 8 satır |
| 12 | Manager sınıfı role bu izinden birini doğrudan `insert` | tetikleyici `42501` |
| 13 | `save_workspace_role_service` ile aynı deneme (eski grant varmış gibi) | `42501` "Permission is not eligible" |
| 14 | Shift type / label / department / job / workspace adı + logo servisleri için 4 ve 5'in kısa eşi | owner geçer, manager reddedilir |
| 15 | Logo depolama: manager `storage.objects` insert `<ws>/logo/x.png` | reddedilir; admin geçer |

### Diğer testler
- **`authorization_matrix.test.sql`:** `settings.locations.write`, `settings.jobs.write`, `settings.shift_catalog.write`, `settings.organization.write` satırları × owner / admin / manager / employee / outsider. Beklentiler 4–7 ile aynı. Rütbe hücresi gerekmez: org write, M2'de müdüre kapalı.
- **`authz_catalog.test.sql`** (tavanlar yalnız iner):
  - `request.jwt.claim` yazan fonksiyon tavanı 13'ten iki reorder servisi kadar iner (yazan rol sayıyı ölçüp tavanı indirir).
  - Eski kapıyı kullanan fonksiyon sayısı katlanan beş servis kadar azalır. Bugün 10; bu beşin bir kısmı `workspace_has_permission` kullandığı için yazan rol yeniden sayar.
- **`authorization_coverage`:** yeni ~12 servis sınıflanır.
- **API vitest:** her yeni uç için:
  - manager → 403
  - üye olmayan → 404
  - bozuk gövde + yetkisiz → 403 (400 değil; yetki önce)
  - owner → 200/201

  Var olan `jobs-management` testleri katlanmadan sonra da yeşil kalmalı.
- **Web vitest:** `organization-data` testleri `supabase.from(...).insert/update` yerine `fetch` çağrısını bekler.
  - Kablolama boş kalmasın: düzeltmenin ana satırı silinince düşen bir test olmalı (kontrol listesi "boş kablolama").
- **e2e** (`nf-test`; DB kilidiyle): yeni `e2e/flows/settings-catalog-writes.spec.ts`.
  - (a) Owner Settings → Locations'ta "Meyhouse San Jose"yi ekler, adını değiştirir, arşivler.
  - (b) Admin Settings → Shift types'ta bir tipin saatini değiştirir.
  - (c) Manager ile `page.request.patch('<SUPABASE_URL>/rest/v1/locations?id=eq.<id>', { workspace_id: <öteki> })`, oturum token'ıyla → 401/403 ve satır değişmemiş.

  Etkilenen var olan senaryolar yeniden koşulur: `invite.spec.ts`, `owner-legal-name-setup.spec.ts` (kurulum sihirbazı), `scope-and-employee-view.spec.ts`, `remove-from-location.spec.ts`.

---

## 4. Sıra, roller, puan

| Sıra | Rol | İş | Tahmini puan |
|---|---|---|---|
| 1 | `nf-db` | 1a migration (eylem, 12 servis, 5 katlama, 2 reorder katlama, depolama politikaları) + pgTAP 4–10, 14–15, matris, coverage. Rolled-back deneme → `nf-guvenlik` onayı → **canlıya önce** (kullanıcı, OPS-03) → yerel ortak DB (`main.lock` penceresinde) | 7 |
| 2 | `nf-backend` | 1b uçlar + web veri katmanı + API/web vitest; sözleşmeyi raporda yazılı verir | 6 |
| — | koordinatör | Adım 1'i main'e alır; main CI izlenir | — |
| 3 | `nf-db` | 2a migration (revoke, 13 politika, `custom_grantable`, grant silme, tetikleyici, rol servisi satır 17) + pgTAP 1–3, 11–13, `authz_catalog` tavanları. Onay → **main önce, sonra canlı** | 4 |
| 4 | `nf-test` | e2e spec + etkilenen 4 senaryo; matris hücrelerinin gözden geçirilmesi | 2 |
| | | **Toplam** | **~19** (ILERLEME ölçütüne göre `nf-planlama` düzeltir) |

**İnceleme:**
- Sınıf R3: grant, RLS, yetki, `*_service`.
- `nf-guvenlik`, Adım 1'in migration'ında ve Adım 2'de zorunlu.
- Ekran görünümü değişmediği için `nf-gorsel-qa` gerekmez. Yalnız Settings → Roles'un izin listesi değişirse (aşağıda) tek ekran görüntüsü.
- **Ultrareview: Adım 2'de önerilir** (grant söküm + veri silme). Kalan ücretsiz hak ve tutar açılış penceresinde.

**Paralellik:**
- 1 ve 2 aynı sözleşmeye bağlı: önce 1, sonra 2 (ya da 2 sahte servisle başlar).
- 3, 2 main'e girmeden başlayamaz.
- 4 ancak 2 main'e girdikten sonra başlar.
- Aynı dosyaya iki rol konmaz: `supabase/**` `nf-db`'de, `e2e/**` `nf-test`'te.

---

## 5. Açık kalan ve nedeni

- **Settings → Roles izin listesi:** rol düzenleyicinin seçenekleri `custom_grantable`'ı shared şemadan (`packages/shared/src/index.ts:2442`) alıyorsa 8 izin müdür rolü için kendiliğinden kaybolur. Web'de nasıl süzüldüğünü ölçmedim. Görünür bir değişiklik olur; Adım 2'de ekran görüntüsü alınmalı.
- **Canlıda bu izinleri taşıyan özel rol sayısı ölçülmedi** (hosted yasak). Silme her durumda doğru; sayı yalnız rapor için.
- **`permissions.includes` kullanan ekranlar** (`GeneralSettingsPage.tsx`, `ShiftTypesSettingsPage.tsx:49`, `ShiftLabelsSettingsPage.tsx:40`, `JobsSettingsPage.tsx`, `LocationsSettingsPage.tsx`) `can()`'e geçmeli (CLAUDE.md §9). Bu işin önünde değil; FB-6.8'de ayrı satır önerilir.
- **BL-374** (dosya içi `authorize` sarmalayıcıları) ve **BL-383** (gövde önce): bu iş yeni uçlarda kuralı uygular, eskileri değiştirmez.

## Ekranda ne değişti
Hiçbir şey; plan.

## Sırada ne var
1. `nf-planlama` bu tasarımı FB-6.8 görev dosyasına "Touches / Done when / Test plan" olarak yazar. Done when = bölüm 3'teki hücreler + taşıma kilidi (3. hücre) + e2e (c).
2. Adım 1 için `nf-db` görevi; ardından `nf-backend`.
3. BL-232 ve BL-178'in altına "Tasarım 2026-10-05: SEC-A1-TASARIM" satırı. BL-232'nin işareti medium → high (SEC-YAYIN-HAZIRLIK A1'deki ölçüm).

## Kanıt (2026-10-05, bu oturumda, salt okuma)
| Komut | Sonuç |
|---|---|
| `git show origin/main:apps/web/src/settings/organization-data.ts` (`.from`/`.insert`/`.update`) | 13 yazma fonksiyonu, satırlar bölüm 0'da |
| `git grep` çağıranlar | 7 ekran dosyası |
| `apps/api/src/settings/*-routes.ts` | var olan uçlar ve dosya içi `authorize` |
| `pg_proc` katalog servisleri: çekirdek mi, eski mi | 5 eski + 2 jwt-claim reorder; geri kalanlar çekirdekte |
| `app_private.authz_actions`, `authz_scope_rules`, `authz_settings` | org write eylemleri; M2 org write = none; `settings.shift_catalog.write` yok |
| `permissions` + `workspace_role_permissions` (manager/employee sınıfı) | 8 izin verilebilir; taşıyan özel rol 0 (yerel) |
| `pg_policies` (`workspace_has_permission`) | 21 politika; 13'ü bu işin kapsamında |
| `save_workspace_role_service` gövdesi | satır 17 eski grant'i tutuyor |
| `documents.manage` kullanımı | yalnız `settings.documents.write` |
