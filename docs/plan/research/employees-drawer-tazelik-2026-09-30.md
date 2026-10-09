# Employees çekmecesi yenilikleri — tazelik ölçümü (2026-09-30)

Koordinatörün görevi (`local_460271c1…`), onaydan önceki adım 0 (CLAUDE.md §5.0). Kod yazılmadı, karar verilmedi.
Hazırlayan `nf-planlama`. Görev dosyası taslağı: `docs/plan/tasks/EMP-001.md`.

**Ölçüm:** `origin/main` `b406ca9e` (son kod commit'i `3f034462`), 2026-09-30. Kod: `grep` ve dosya okuması.
Veritabanı: ortak yerel DB, yalnız SELECT (`default_transaction_read_only = on`), 397 migration, son
`20260930190000` = main'deki son dosya. Fonksiyon gövdeleri `pg_proc.prosrc`'tan (son tanım). `.10` e2e dalı
yerel `task/fb62-10` @`ff0cf56f` (origin'de yok), `git show` ile okundu. Test, build, e2e koşturulmadı.
Elle doğrulanan satırlar: `membership_managed_locations` 1 satır ve sahibi manager; eylem sayısı 74
(FB-6.2.0b'deki 72 + `employee.remove_from_location` + `employee.set_managed_locations`).

Ekran: Employees → bir kişiye tıkla → sağdan açılan çekmece (Profile ve Employment sekmeleri);
dosyası `apps/web/src/employees/EmployeeDrawer.tsx`.

Ölçüm sürerken koordinatör iki ek gönderdi: kullanıcının S1–S5 cevapları (bölüm 7 ve 8 onlara göre ek ölçüm) ve
madde 15 (bölüm 9). Bölüm 3, cevaplardan önceki olguları olduğu gibi tutar.

## 1. On beş maddenin hükmü

| # | Madde | Hüküm | Kanıt |
|---|---|---|---|
| 1 | Sekme başlığı altındaki açıklama satırları silinir | **yok** (satırlar duruyor) | Altı sekmenin altısında da var: `EmployeeDrawer.tsx:3030-3039` (`sectionDescription`), basıldığı yer `:1004-1006` (yalnız düzenlemede; yeni kişi eklerken zaten yok). Başlık kutusu sabit 82px: `apps/web/src/styles.css:1702-1710`. |
| 2 | First / Middle / Last aynı satırda | **yok** | Form iki sütun (`styles.css:1732-1736`); sıra First, Middle \| Last, Preferred (`EmployeeDrawer.tsx:1959-2005`). |
| 3 | Preferred name ve Date of birth aynı satırda | **yok** | Preferred dördüncü hücre (Last name'in yanında, `:1998-2005`); araya bekleyen ad satırı girebiliyor (`:2006-2011`); Date of birth yalnız düzenlemede ve gizli bilgiyi okuyabilene çıkıyor (`:2012-2017`). |
| 4 | Input altındaki yardım yazıları kalkar | **yok** | "Locked after activation" `:1966`, `:1979`, `:1992`; "Locked while invitation is pending" `:1949-1951`; "Verified account e-mail" `:2030`. Yazının yeri `Field` bileşeninin alt satırı (`:2847-2892`); aynı satır "X is required." doğrulama hatasını da taşıyor ve alan zorunluyken boş da olsa yer tutuyor (`:2847`). |
| 5 | Doğrulanmış e-postada inputun içinde yeşil onay işareti | **yok** | Bugün yalnız alt yazı (`:2030`); işaret ve erişilebilir ad yok. "Doğrulanmış" = hesabı bağlı (`linked`, `:1952`, `:2028`). |
| 6 | "Manages without working there" tamamen sökülür | **eski kararı değiştiriyor** | KARARLAR `:43`, `:56` (2026-09-27 S2/S3), `:170-176` (2026-09-30 varyant C ve liste çipi), KK-29. Bugün her katmanda canlı; envanter bölüm 2. |
| 7 | Employment → Jobs departmana göre gruplu | **kısmen var** (veri var, görünüm yok; karar eski) | Karar 2026-09-28'de verilmiş (KARARLAR `:58`, BL-218 `.5`), yapılmamış. Veri çekmeceye geliyor: `apps/web/src/employees/employee-data.ts:49-62`, `:230-250` (iş başına departman, Management ve Owner işareti). Liste düz: `EmployeeDrawer.tsx:2237-2252`, `AssignmentPicker` `:2897-3006`. |
| 8 | Kurulum başlar başlamaz Management + Owner + **Manager**; owner Owner işine atanır, devretmeden çıkamaz | **kısmen var** | Management ve Owner: kurulumun **ilk kaydında** oluşuyor (workspace açıldığı anda değil) — `supabase/migrations/20260927160000_management_and_owner_are_kept.sql:42` (`ensure_management_and_owner`), çağrı `:365`. Owner'ın Owner işine ataması aynı kayıtta (`open_owner_record_to_everything`, canlı gövde: yalnız `system_key = 'owner'`). "Çıkamaz": `keep_job_assignment_rules` 23514 `employee.owner_job` (`:126`). **Manager işi otomatik oluşmuyor:** yerel DB'de 288 workspace'te Management var, altında "Owner" 288, "Manager" 0 (tek elle eklenmiş iş "Shift Lead"). |
| 9 | Owner işi herkesin çekmecesinde devre dışı | **kısmen var** (kural sunucuda, ekranda yok) | Sunucu: owner olmayana atama 42501 `authz.owner_only`, owner'dan kaldırma 23514 (`20260927160000:126-159`). Ekran: Owner işi Server, Cook ile aynı sıradan kutucuk (`EmployeeDrawer.tsx:2957-2980`); işaretlenir, hata kaydederken çıkar. Karar 2026-09-28 (BL-218 `.5`), yapılmamış. |
| 10 | Owner bütün lokasyonlara atanır; kutucuklar işaretli ve devre dışı | **kısmen var** | Atama var: kurulumda ve sonradan eklenen lokasyonda (`locations_reach_the_owner`, `…_on_restore` tetikleyicileri canlı), kaldırma 23514 `employee.owner_locations` (`20260927160000:162-182`). Ekran kilitlemiyor: kilit yalnız "Remove" ile çıkarılabilen satırlarda (`EmployeeDrawer.tsx:2205`). |
| 11 | Owner'da "primary location" seçeneği yok; bütün lokasyonlar birincil | **yok** (S4'e bağlı) | Owner'ın lokasyon satırlarında "Primary" seçeneği bugün çıkıyor (`:2981-2991`, koşul yalnız "Management işi değil"). Veri: lokasyonu olan 184 owner kaydının 172'sinde birincil yok, 12'sinde var (yerel DB). Şemada kişi başına tek birincil (`employee_location_primary_idx`); "hepsi birincil" saklanamaz. |
| 12 | Owner işi işaretli ama birincil değil; sayıma girmez; ilk tıklanan iş birincil gelir | **kısmen var** | Var olanlar: Management işinde "Primary" seçeneği yok (`:2981`); Management işi birincil işaretlenemez (23514 `employee.management_primary`); boş birincile ilk tıklanan Management dışı iş yazılır (`:2966-2975`); owner kaydı hiçbir lokasyon/iş şartına tabi değil (`save_employee_service` canlı gövde, owner muafiyeti; shared `packages/shared/src/index.ts:2703-2708`). Yok olan: Owner işinin kilitli görünümü (madde 9). "Birincil sayılmaz" bugünkü kuralla çelişir (S2). |
| 13 | Schedule'da role/position görünümünde Management en altta | **yok** | Uygulamadaki adı "Job/Position" (`apps/web/src/schedule/components/ScheduleTopBar.tsx:585-591`; başka mod yalnız "A-Z"). Gruplar işlerin kendi sırasıyla diziliyor (`apps/web/src/schedule/lib/scheduleEmployeeSort.ts:50-81`); Management'ı sona alan kod yok. Karar 2026-09-27 (D4, KARARLAR `:58`), BL-218 `.6` açık. "By department" modu da yok. |
| 14 | Rolü Manager olan kişiye Management → Manager işi otomatik işaretlenmez | **zaten var** (yapılacak kod yok) | İş ataması yazan altı fonksiyonun hiçbiri rol ya da davet fonksiyonu değil: `save_employee_service`, `update_job_assignments_service`, `delete_job_with_assignments_service`, `respond_workspace_ownership_transfer_service`, `open_owner_record_to_everything`, `management_jobs_are_primary_by_department` (yerel DB). Kilitleyen bir test hücresi yok; madde 8'le "Manager" işi gelince hücre gerekir. |
| 15 | Access → "Workspace role" anında kaydedilmez; "Save changes" ile kaydedilir (ek madde, 2026-09-30) | **yok** (bugün anında kaydediyor) | Seçici `EmployeeDrawer.tsx:2463-2470` (`onChange → onRoleChange`), `:1068` `roleMutation.mutate(roleId)`, `:524-541` `updateEmployeeRole` (`PATCH …/employees/:id/role`, `employee-data.ts:181-191`). Ayrıntı bölüm 9. |

**Satırların anlamı:** A grubunun (1–5) hiçbiri yapılmamış ve hepsi tek dosyada, görünüm işi. 7, 9, 10, 12, 13'ün
kuralı ya da verisi hazır; eksik olan ekran. Bunlar 2026-09-27/28'de karara bağlanmış ve BL-218'in açık
adımlarına (`.5` çekmece, `.6` Schedule) yazılmış işler. Yeni olan: madde 6 (söküm), madde 8'in "Manager" işi,
madde 11 ve madde 12'nin "birincil sayılmaz" cümlesi.

## 2. Madde 6 — söküm envanteri ("yalnız yönetir")

### Veritabanı (canlı nesneler; yerel DB, canlı DB de aynı 397 migration'da — BL-405 kapanışı)
| Nesne | Getiren migration | Sökümde |
|---|---|---|
| Tablo `public.membership_managed_locations` (6 kolon, PK, 5 FK, `role = 'manager'` CHECK, `…_location_idx`; RLS açık, politika 0; tarayıcı izni yok) | `20260930120000_a_manager_manages_where_they_do_not_work.sql:20-37`, `20260930130000_employees_writes_ask_the_core.sql:33-37` | drop |
| `workspace_memberships_id_workspace_id_role_key` (yalnız bu tablonun FK'si kullanıyor — ölçüldü) | `20260930130000:30-31` | drop |
| Tetikleyici `managed_locations_follow_role` + `app_private.managed_locations_follow_role()` (rol düşünce satırları siler) | `20260930130000:39-57` | drop |
| Yetki eylemi `employee.set_managed_locations` (`app_private.authz_actions`; 74 eylemden biri) | `20260930130000:59-62` | satır silinir (74 → 73) |
| `public.set_employee_managed_locations_service(uuid, uuid, uuid, uuid[])` (+ `service_role` grant) | `20260930130000:64-133`, son tanım `20260930180000_the_drawer_reads_what_the_core_allows.sql:423` | drop |
| `app_private.manages_without_working(uuid, uuid)` | `20260930180000:27-36` | drop |
| `app_private.actor()` — manager'ın `manages` kümesi = çalıştığı ∪ yalnız yönettiği | `20260930120000:39-114` (`:88-99`) | yeniden tanım: manager için `manages = works` |
| `app_private.authz_check()` — kişi hedefinin yerleri = atamaları ∪ yalnız yönettiği | `20260930120000:116-315` (`:281-296`) | yeniden tanım: yalnız atamalar |
| `schedule_actor_can_manage_service`, `schedule_actor_can_publish_service`, `schedule_actor_has_capability_service`, `communication_actor_has_capability_service` — dördünde "ya da yalnız yönettiği" dalı | `20260930120000:319-429` | yeniden tanım: dal çıkar |
| `get_employee_detail_service` — cevapta `managed_locations` ve `allowed.set_managed_locations` | son tanım `20260930190000_the_drawer_tells_nothing_on_file_from_not_allowed.sql:17` (`:124-126`, `:204-213`) | yeniden tanım: iki anahtar çıkar |
| `list_employees_service` — dönen tabloda `managed_location_names text[]` | `20260930180000:269-373` (`:315-319`) | drop + yeniden oluşturma (dönüş tipi değişir) |
| `update_employee_membership_role_service` — denetim kaydına `managed_locations_removed` | `20260930130000:887` (`:940-976`) | yeniden tanım: alan çıkar |
| Denetim kaydı eylemi `employee.managed_locations_changed` (yerel DB'de 3 satır) | `20260930130000:121`, `20260930180000:480` | yazan kod gider; var olan satırlar için karar gerekmez (eski veri korunmaz) |

Tabloyu okuyan canlı fonksiyon 11 (+ `tests.manages`), görünüm 0. `app_private.scope_set` **değişmez**: kapsamı
`actor()` üzerinden alıyor (`20260924123013_authorization_core.sql:586`).

### Kapsam söküm sonrası nereden hesaplanır
Manager'ın lokasyonları yalnız **çalıştığı atamalar** olur (`employee_location_assignments`, `ended_at is null`).
Kişi hedefli kontrolde hedefin yerleri de yalnız atamalarıdır. Yani "Beşiktaş'ı yönetsin ama ızgarada
görünmesin" için kişi Beşiktaş'a **atanır** ve "Exclude from schedule" işaretlenir. Değişen iki çekirdek fonksiyonu
(`actor`, `authz_check`) ve dört eski yardımcı yukarıdaki tabloda; `.manages` okuyan öteki fonksiyonlar
(`actor_actions`, `can_invite_with_role`) değişmez.

### Yetki matrisi, katalog, kapsam testi
- `packages/shared/src/authorization.ts:37` (eylem listesi), `:122` (kural), `:272` (karar dalı).
- `packages/shared/src/authorization-matrix.expected.json` — 54 yerde eylem, 480 yerde "selin" kişisi (döküm; `dump:authz-matrix` ile yeniden üretilir). `packages/shared/scripts/dump-authorization-matrix.ts:43`, `packages/shared/src/authorization.test.ts:57`, `:70` (`manages` alanı).
- `supabase/tests/authorization_matrix.test.sql` — kişi "selin" `:40-42`, `manages` kolonu `:133`, `:139`, `:153`, hedefler `:189`, `:206-209`, eylem satırı `:427-429`, eşleme `:513`, `:564`, `:587`, beklenti dalı `:663`, `known_gap` `time-off-needs-location` `{nur,selin}` `:804`.
- `supabase/tests/authz_catalog.test.sql:107` (sabit eylem listesi), `supabase/tests/authorization_coverage.test.sql:242`.
- `supabase/test-support/builder.sql:623-641` (`tests.manages`).

### API ve shared tipler
- `apps/api/src/employees/employee-directory-routes.ts:4`, `:282-311` (`PUT …/employees/:employeeId/managed-locations`).
- `apps/api/src/employees/employee-directory-service.ts:15`, `:107-113`, `:414-426`.
- `packages/shared/src/index.ts:2517-2519` (`managed_location_names`), `:2557`, `:2593-2595` (`managed_locations`), `:2645-2646` (`allowed.set_managed_locations`), `:2670-2677` (`employeeManagedLocationsSchema`). Üçü de **zorunlu** alan.

### Web
- Çekmece: `apps/web/src/employees/EmployeeDrawer.tsx:65`, `:81`, `:515-517` (+ devamı), `:1082-1084`, `:2121-2122`, `:2221-2236`, `:2280-2283` (yetim yorum).
- Alan ve liste çipi: `apps/web/src/employees/EmployeeLocationParts.tsx:10`, `:87-165` (`ManagedLocationsField`), `:172-205` ("Manages <lokasyon>" çipi, masaüstü hücresi ve telefon çipi); "No location" çipi kalır.
- Veri: `apps/web/src/employees/employee-data.ts:8-10`, `:306-315`.
- CSS: `apps/web/src/employees/employee-location-parts.css:1`, `:56` ve devamı (`.employee-managed-*`).

### Testler
- pgTAP: `employees_on_the_core.test.sql` (`:74-77`, `:226-261`), `employee_drawer_reads.test.sql` (dosyanın 1. ve 3. bölümü; "selin" 28 satır), `people_behind_the_catalog_ask_the_core.test.sql` (`:18`, `:60`, `:79`, `:104`, `:133`), `refusals_answer_alike.test.sql` (`:14`, `:55`), `onboarding_review_on_the_core.test.sql` (`:19`, `:50-55` — KK-33 `known gap` hücresi söküm ile kendiliğinden kalkar), `authorization_matrix`, `authz_catalog`, `authorization_coverage`. Altısı `tests.manages` çağırıyor.
- API vitest: `apps/api/src/employees/employee-directory-routes.test.ts:590`, `:646-684`.
- Shared vitest: `packages/shared/src/employee-detail.test.ts` (12 satır).
- Web vitest: `EmployeeDrawer.test.tsx` (`:60`, `:182`, `:205`, `:219`, `:248`, `:1661`, testler `:1875`, `:1891`, `:1913`, `:1969`), `EmployeeDrawer.create.test.tsx:135`, `:153`, `EmployeeLocationParts.test.tsx` (`:30-60`), `EmployeesPage.test.tsx:64`, `:86`, `employee-data.test.ts:13`, `:187-198`.
- e2e: main'de ve `task/fb62-10`'da "yalnız yönetir"e değen senaryo **yok**.
- `supabase/tests/retired_objects_stay_gone.test.sql` (13 kontrol, `retired` tablosu `kind, name, step`): tablo, üç fonksiyon, tetikleyici, eylem ve kısıt buraya eklenir.

### Kayıtlar (onaydan sonra işin içinde düzeltilir; bu ölçümde dokunulmadı)
KARARLAR `:43`, `:56`, `:170-176`; `KOORDINATOR-KARARLARI.md` KK-29 (`:215`), KK-33 (`:247`), KK-35 (`:261`);
`HANDOFF.md:55` (kullanıcıya bekleyen KK-29 sorusu — söküm ile düşer); `tasks/G8.md:11`, `:22`, `:35`
(`actor()`'ün "iki dalı"); `tasks/FOUNDATION-B.md:51`.

## 3. S1–S5 için bugünkü olgular (öneri değil)

- **S1 — Exclude from schedule kişi başına mı, lokasyon başına mı?** Kişi başına tek işaret: `employee_profiles.is_excluded_from_schedule` (boolean). Lokasyon atamasında böyle bir kolon yok. Okuyan 12 fonksiyon; Schedule tarafında: ızgara okuması işareti kişiyle birlikte veriyor (`get_schedule_read_model_service`), ızgara kişiyi yalnız o hafta vardiyası varsa gösteriyor (`apps/web/src/schedule/lib/scheduleEmployeeSort.ts:114-128`, `scheduleGridViewModel.ts:57`); aday listesi, şablon uygulama ve vardiya editörü işaretli kişiyi hiçbir lokasyonda kabul etmiyor (`weekly_assignment_candidate_base`, `apply_schedule_template_service`, `shiftEditorEligibility.ts:39`). Sonuç: bugünkü veriyle "Kadıköy'de vardiyaya girer, Beşiktaş'ı yalnız yönetir" kişisi ifade edilemez; işaret her lokasyonda birden geçerli. **Muafiyet:** işaretliyken lokasyon ve iş zorunlu değil (`save_employee_service` canlı gövde, `assignment_optional`; KARARLAR `:58`). Yerel DB'de işaretli manager 0.
- **S2 — "Management işleri her zaman birincil" kuralı nerede?** Departmana bağlı, Owner'a özel değil. DB: `keep_job_assignment_rules` (Management işine birincil işareti 23514), `management_jobs_are_primary_by_department` (iş Management'a taşınınca işareti temizler), `is_management_job` (`20260927160000:26`, `:97`, `:126`); kayıt kuralı "birincil iş yalnız Management dışı iş seçiliyse zorunlu" (`20260928080000_a_management_only_record_saves_without_primary.sql`, canlı `save_employee_service`). Shared: `managementJobIds` ve hata cümleleri (`packages/shared/src/index.ts:868-893`). Web: çekmece (`EmployeeDrawer.tsx:2923-2925`, `:2966-2981`), `employee-create-flow.ts:33`, kurulum sihirbazı (`OwnerOnboardingPage.tsx:210`, `:716-719`), Schedule satır grubu (`scheduleEmployeeSort.ts:102-112`). Kurulumun "kendi işin" sayımı `system_key is null`'a bakıyor (`20260927160000:298`, `:308`): otomatik "Manager" işi sistem kimliği taşımazsa owner'ın kendi işi sayılır ve kurulum hiç iş eklenmeden tamamlanır.
- **S3 — Owner'dan başka işi olmayan owner kaydedilir mi?** Bugün evet: owner kaydı lokasyon, iş ve birincil şartlarının hepsinden muaf (canlı `save_employee_service`; shared `index.ts:2703-2708`, `is_owner_record`). Yerel DB: 242 owner kaydının 121'inde tek iş Owner.
- **S4 — Owner'ın birincil lokasyonu nerede okunuyor?** İzin oylaması ve Schedule okumuyor. Okuyanlar: Employees listesi Location sütunu ve **lokasyon süzgeci** (`apps/web/src/employees/EmployeesPage.tsx:202-222`, `EmployeeLocationParts.tsx:169-183` — owner satırında "Unassigned +N" buradan, BL-428); çekmecedeki "Primary" seçimi ve işten çıkarma penceresi (`EmployeeDrawer.tsx:1456`); belge son tarihlerinin saat dilimi (`app_private.document_employee_timezone`); Settings → Jobs aday listesi (`job_assignment_candidates`); çalışanın onboarding özetinde sıra (`get_employee_onboarding_service`); lokasyon silme ve "Remove"da yeni birincil seçimi (`delete_catalog_entity_service`, `remove_employee_from_location_service`). Bunların hepsi "tek birincil" varsayıyor.
- **S5 — Bekleyen davet yardım yazısı:** metin "Locked while invitation is pending"; yeri First, Middle, Last name ve E-mail alanlarının altı (`EmployeeDrawer.tsx:1949-1951`, `:1966`, `:1979`, `:1992`, `:2030`). Alanlar o sırada salt okunur (`readOnly={invitePending}`). Aynı bilgi Access sekmesinde davet durumu olarak zaten var (`:2339-2358`).

## 4. Madde 8 ve 13 ayrıntısı

- **Kurulum:** `create_owner_workspace_service` workspace'i açar; Management ve Owner ilk `update_owner_onboarding_service` kaydında oluşur ve her kayıtta yeniden denenir (`on conflict do nothing`). Test dünyası aynı yolu kullanıyor (`supabase/test-support/builder.sql:157-206`), yani "Manager" işi `ensure_management_and_owner`'a eklenirse builder kendiliğinden alır.
- **"Manager" işinin dokunduğu yerler:** `ensure_management_and_owner`; sistem kimliği verilirse koruma tetikleyicisi (`keep_system_catalog_records`) ve `jobs_system_key_idx`; kurulumun sayımı (yukarıda S2); var olan workspace'ler (yerel 288; canlı veri yok — tek satırlık doldurma ya da fixture yenileme). **Çakışma:** üç pgTAP dosyası Management altına elle "Manager" adında iş ekliyor (`management_only_person_saves_without_primary.test.sql:19`, `management_owner_job.test.sql:343`, `reads_know_management_and_owner.test.sql:26`); ad workspace içinde tekil (`jobs_workspace_active_name_idx`), otomatik iş gelince bu üç dosya 23505 ile düşer ve yeniden yazılır.
- **Kurulum sihirbazı (web) bugün sistem satırlarını sayıyor:** `apps/web/src/views/OwnerOnboardingPage.tsx:201-207`, `:678-679`, `:761`, `:1414-1415` aktif departman ve işi `system_key`'e bakmadan sayıyor; sunucu saymıyor. Koda göre kişi hiç departman eklemeden Continue'ya basabilir, hata en sonda çıkar (tarayıcıda denenmedi). BL-218 `.4`'ün açık işi; "Manager" gelince aynı yer.
- **Madde 13:** Schedule'da iki sıralama var, "A-Z" ve "Job/Position". "Job/Position"da Management işi olan kişi, başka birincil işi yoksa Management işinin grubunda duruyor, ama grup işlerin sırasına göre yerleşiyor; en altta olan yalnız "Unassigned job". "By department" modu ve karma kişinin iki satırı (D4) yok.

## 5. Yürüyen işlerle çakışma

**(a) Park edilmiş Save dalı `origin/task/fb62-8-save`** (main'den 3 commit ileride, taban `3f034462`): `6722c4aa` tamamen "Manages without working there" alanının kaydıyla ilgili (6 dosya, +216 −103); madde 6 ile **gereksiz kalır**. Kurtarılacak iki şey: (i) `3ae7f405` — `nf-backend` hafıza notu (`.claude/agent-memory/nf-backend/worktree-shell-traps.md`, 2 satır: kendi dev sunucusunu PID ağacıyla durdurma; telefonda çekmece bölümleri `<select aria-label="Employee section">` ve `EmployeeDrawer.test.tsx` mock'larının testler arasında temizlenmediği); (ii) `6722c4aa`'daki iki adımlı kayıt kalıbı, madde 15 için (bölüm 9). **Durum (ölçüm sırasında değişti):** ölçümün başında dal origin'deydi; bölüm 9 ölçülürken `git ls-remote --heads origin task/fb62-8-save` boş döndü ve üç commit'i (`6722c4aa`, `3ae7f405`, `1e80f715`) içeren hiçbir dal ya da etiket kalmamıştı (`git for-each-ref --contains` boş). Commit'ler nesne olarak hâlâ okunuyor, ama sahipsiz; çöp toplamada silinir. Hafıza notu main'e alınacaksa ve kalıp örnek alınacaksa önce bir dal ya da yama dosyasıyla tutulmalı.

**(b) Backlog**
| Madde | Bu işle | Neden |
|---|---|---|
| BL-424 (komut çalıştığı lokasyonu da kabul ediyor) | kapanır | komut silinir |
| BL-418 ("Manages" listesinde arşivli lokasyon işaretsiz) | kapanır | alan silinir |
| BL-387 (9 fonksiyon "yalnız yönetir" kapsamını görmüyor) | kapanır | görülecek ayrı kapsam kalmaz |
| BL-417 (ulaşılamayan lokasyonun adı; "Manages" süzülüyor) | değişir | sorunun "Manages" yarısı düşer, lokasyon adı yarısı kalır |
| BL-416 (1) (sayaç `.class` yazımını görmüyor) | değişir | örnek iki kopyadan biri (`manages_without_working`) silinir; kalıp boşluğu durur |
| BL-431 (Terminate ipucu "Save profile changes…") | madde 15 ile kapanır | gerekçesi Save dalıydı; dal silindi, ama madde 15 aynı durumu rol için doğuruyor (taslakta rol varken ipucu "profile" der) |
| BL-432 (değişiklik yokken Enter kaydı gönderiyor) | geçerli; madde 15 ile aynı fonksiyon | main'de koda göre doğru: `submit` değişiklik var mı diye bakmadan `saveMutation.mutate()` çağırıyor (`EmployeeDrawer.tsx:774-794`); tarayıcıda denenmedi |
| BL-428 (owner satırı "Unassigned +1") | değişmez (S4: öteki okumalar bu işte değişmiyor) | ölçüldü: sunum sorunu — owner'ın lokasyonu var, birincili yok (172 / 184); bölüm 8 |
| BL-430 (tek seçenekli rol seçici) | değişmez; madde 15 ile aynı seçici | |
| BL-429 (kilitli Terminate'in nedeni yalnız ipucunda) | değişmez | kapsam dışı bölüm |
| BL-421 (owner kaydını rol adından tanıma) | işin önünde | 9–12 "bu kayıt owner'ın mı" sorusuna dayanıyor |
| BL-423 (arşivli lokasyonu satır içinde eleyen 29 fonksiyon) | 29 → 28 | örnek satırı silinen komutta |
| BL-132 / G8a (`actor()`'ün iki dalı arşivliyi saymasın) | değişir, **sıra şartı** | dallardan biri silinir; G8a ile B aynı iki fonksiyonu yazar, aynı anda yazılmaz |
| BL-218 `.5` (çekmece: gruplu iş listesi, kilitli Owner ve lokasyonlar) | bu işe taşınır | madde 7, 9, 10, 12 aynı iş |
| BL-218 `.6` (Schedule: By department, Management grubu, iki satır) | kısmen | madde 13 yalnız "en altta"; yeni mod ve iki satır bu işte yok |
| BL-218 `.4` (sihirbaz metni, Continue sayımı) | değişir | "Manager" işi metni ve sayımı etkiler |
| BL-314 (auto-fill Management'ı birincil saymıyor) | S2'ye bağlı | |

**(c) FB-6.2 Done when.** Numaralı maddelerden yalnız **22** (yalnız manager üyeliği satır yazabilir) doğrudan "yalnız yönetir"e dayanıyor. Ayrıca Goal cümlesi, In scope'un "yalnız yönetir lokasyonu" maddesi, `.1` / `.2` / `.7` / `.8` adım satırları, Test plan'ın "yalnız yönetir lokasyonundaki kişi" hücresi ve Risk'in "okuyucu sızıntısı" maddesi. `.11` kapanışında öneri: "yapıldı (T5a; T5b `da8e3dc0`; `.7b` `0806cc62`; `.8` `48a9d139`), sonra kullanıcı kararıyla (2026-09-30) EMP-001'de geri alındı" diye yazılır; açık kalan iş gibi gösterilmez. Done when 1–21'in kanıtı değişmez; eylem sayısı 74 → 73 ve matris dökümü EMP-001'de yenilenir.

**(d) `.10` e2e (`task/fb62-10` @`ff0cf56f`, iki yeni dosya).** `invite.spec.ts` ve `scope-and-employee-view.spec.ts` rol ve etiketle seçiyor: `getByLabel("E-mail")`, `getByLabel("Invite role")`, düğme ve başlık adları, satırdaki "Invited" / "Not Invited" / "Onboarding". A grubunun sildiği hiçbir metne ve "Manages" çipine dayanmıyor; "yalnız yönetir" kişisi kullanmıyor. Tek dikkat: madde 5'in onay işareti `E-mail` etiketinin içine ikinci bir adlandırılmış öğe koyarsa `getByLabel("E-mail")` iki eşleşme verebilir.

## 6. Sürprizler
1. **İşin yarısı daha önce karara bağlanmış ve yapılmamış.** 7, 9, 10, 12, 13 2026-09-27/28 kararları; BL-218'in `.5` ve `.6` adımları olarak bekliyor. Yeni iş bunları yeniden istiyor; iki görev dosyası aynı işi taşımamalı.
2. **"Exclude from schedule" kişi başına ve işaretliyken lokasyon zorunlu değil.** Yerine geçen kural iki yerde boşluk bırakıyor: bir lokasyonda vardiyaya giren, ötekini yalnız yöneten müdür ifade edilemez; lokasyonsuz kaydedilen işaretli müdür hiçbir yeri yönetemez (kapsam yalnız atamalardan gelecek).
3. **"Manager" işi sıradan iş olursa kurulum kuralı delinir.** Sayım sistem kimliğine bakıyor; kimliksiz otomatik iş "kendi işin" sayılır. Ayrıca üç pgTAP dosyası aynı adı elle eklediği için düşer.

Yan not: atama "yalnız yönetir"in taşımadığı yükü taşır — lokasyona bağlı belge zorunlulukları atama tablosundaki tetikleyicilerle çalışıyor (`document_assignment_changed`, `document_assignment_lock`). Yönettiği lokasyona atanan müdür o lokasyonun belgelerini de alır.

## 7. S2 cevabından sonra ek ölçüm — "Management işi olan kişi iki grupta eş satır"

Kullanıcı kararı (2026-09-30): Management → Manager sıradan iş; "Management işleri her zaman birincil" ve
"yalnız Management işi olan kişi birincil işsiz kaydedilir" (BL-218 `.3b`) silinir; özel kural yalnız Owner işinde.

**Olgu.** İki satır kuralı (D4 "karma kişi": Management işi olan kişi Management grubunda, başka birincil işi
varsa onun grubunda da görünür; iki satır eştir) **hiç yapılmadı.** Schedule → "Job/Position"da her kişi tek
grupta: `groupScheduleEmployeesByJob` kişiyi bir kez yerleştiriyor (`apps/web/src/schedule/lib/scheduleEmployeeSort.ts:50-81`);
grubu `primaryScheduleJobId` seçiyor (`:102-112`): Management dışı birincil iş, yoksa kişinin ilk Management işi,
yoksa ilk işi. Aynı yardımcı yeni vardiyanın varsayılan işini ve hücre menüsünün işini de veriyor
(`shiftEditorState.ts:40-51`, `ScheduleRow.tsx:382`). Dosyanın kendi yorumu "ayrı Management grubu ve ikinci satır
BL-218 `.6`" diyor (`:100`).

**Etki.** İki satırın dayanağı "Management işi her zaman birincil, yani kişinin iki birincili olabilir"
cümlesiydi. S2'den sonra Manager tek birincil olabilen sıradan iş; Owner işi ise madde 12'ye göre birincil
sayılmıyor. Hiç kimsenin iki birincili kalmıyor, iki satır kuralı boşa düşüyor. Açık kalan tek durum owner:
Owner + başka birincil işi olan owner hangi grupta durur (yerel DB: 121 owner'da Owner + başka iş var, 11'inde
birincil iş seçili; 121'inde tek iş Owner). Görev dosyasında K5.

**Değişen karar metinleri**
- KARARLAR `:58` — üç cümle: "Management işleri kişi için her zaman birincildir (çekmecede seçeneği yok)…";
  "Yalnız Management işi olan kişi … birincil iş olmadan kaydedilir"; "Takvim: … Management işi olan kişi orada,
  başka birincil işi varsa onun grubunda da görünür; iki satır eştir".
- `docs/plan/research/owner-management-job-2026-09-27.md` §6 "Karma kişi" (`:87-92`) — tarihsel kayıt; KARARLAR'daki yeni cümle onun yerine geçer.
- `tasks/BL-218.md` — `.3b` (bitti; geri alınır), `.5` ("birincil seçeneği"), `.6` ("iki satır, sayım").
- BL-314 (auto-fill Management işini "Primary job" saymıyor): Manager artık kayıtlı birincil olabildiği için dayanağı kalkar.
- Kullanıcıya görünen iki hata cümlesi: `employee.management_primary` ve `employee.primary_job_required` (`packages/shared/src/index.ts:873-880`).

**Kuralı taşıyan kod (S2 ile değişecek)**
- DB: `keep_job_assignment_rules` (Management işine birincil işareti 23514 → yalnız Owner işi), `management_jobs_are_primary_by_department` + `jobs_under_management_are_primary` tetikleyicisi (silinir), `is_management_job` (çağıranları: yukarıdaki ikisi, `update_job_assignments_service`, `delete_job_with_assignments_service` — yeni birincili "Management dışı iş"ten seçiyorlar), `save_employee_service` birincil iş şartı (`20260930130000:360`), `list_employees_service` sıralaması (birincil yoksa Management işi önce).
- Shared: `managementJobIds` (`index.ts:893`).
- Web: `employee-data.ts:230-250`, `employee-create-flow.ts:33`, `EmployeeDrawer.tsx:2923-2925`, `:2966-2981`, `OwnerOnboardingPage.tsx:210`, `:716-719`, `scheduleEmployeeSort.ts:88-112`, `shiftEditorState.ts:40-51`.
- Eski kuralı sınayan 11 test dosyası: `management_only_person_saves_without_primary.test.sql`, `management_owner_job.test.sql`, `reads_know_management_and_owner.test.sql`; `EmployeeDrawer.test.tsx`, `OwnerOnboardingPage.test.tsx` (`:798-870`), `scheduleEmployeeSort.test.ts`, `shiftEditorState.test.ts`; `packages/shared/src/index.test.ts` (`:1535-1551`); `apps/api/src/http-error.test.ts`, `employee-create-service.test.ts`, `settings/jobs-management-routes.test.ts`.
- Veri: yerel DB'de owner olmayıp Management işi tutan kayıt 0; düzeltilecek satır yok.

## 8. S4 cevabından sonra — owner için bozuk çıkan birincil lokasyon okumaları

S4: yalnız owner'ın çekmecesinde "Primary" seçeneği gizlenir; öteki okumalar bu işte değişmez. Ölçüm: lokasyonu
olan 184 owner kaydının 172'sinde birincil lokasyon yok (yerel DB). Bu kayıtlarda:
1. **Employees listesi, Location sütunu:** hücre birincil adını, yoksa "Unassigned" yazıyor, ardından lokasyon sayısı 1'den büyükse "+N" (`apps/web/src/employees/EmployeeLocationParts.tsx:169-183`). Owner'da "Unassigned" ya da "Unassigned +1" çıkıyor; oysa lokasyonu var. BL-428 bu; veri değil sunum.
2. **Employees listesi, lokasyon süzgeci:** seçenekler yalnız birincil lokasyonlardan kuruluyor ve süzgeç birincile bakıyor (`apps/web/src/employees/EmployeesPage.tsx:202-222`). Bir lokasyon seçilince owner listeden düşüyor, oysa her lokasyonda çalışıyor. Aynı şey birincili başka yerde olan herkes için de geçerli: Kadıköy'de ikincil çalışan kişi "Kadıköy" süzgecinde çıkmıyor. Location'a göre sıralamada owner "Unassigned" altında (`:703`). Backlog'da karşılığı yok.
3. **Belge saat dilimi:** `app_private.document_employee_timezone` birincil lokasyonun saat dilimini veriyor; birincil yoksa yalnız Remote ya da Exclude işaretli kişinin kendi alanına bakıyor, ötekinde boş dönüyor. Owner belgeden muaf olduğu için bugün görünür etkisi beklenmez; sahiplik devrinden sonra eski owner admin olur ve birincilsiz kaydıyla belge zorunlulukları açılır (KARARLAR `:50`). Etkisi **ölçülmedi** (koşturma gerekir).
4. **Settings → Jobs aday listesi:** `app_private.job_assignment_candidates` kişinin yanına birincil lokasyon adını koyuyor; owner'da boş. Ekranda nasıl göründüğü **ölçülmedi**.
S4 ile çekmecede seçenek gizlenince birincili olan 12 owner kaydı onu çekmeceden değiştiremez; değer olduğu gibi kalır.

## 9. Madde 15 — "Workspace role" taslağa girer, "Save changes" ile kaydedilir

Koordinatörün ölçümü doğru; satırlar: seçici `EmployeeDrawer.tsx:2463-2470` (`onChange` `:2469`, kilit `:2466-2468`), bağlama `:1068`, mutasyon `:524-541`.

- **Taslak ve "dirty":** tek taslak `draft: EmployeeInput` (ad, e-posta, başlangıç, not, lokasyonlar, işler, Remote, Exclude); karşılaştırıldığı temel `toDraft(detail.data)` (`:216-220`, `:3008-3028`); `dirty = draftEditedRef.current && JSON.stringify(draft) !== baselineKey` (`:245-246`). **Rol taslakta yok.**
- **"Save changes" bugün ne gönderiyor:** tek çağrı — `submit` (`:774-794`) → `saveMutation` (`:363-380`) → `saveEmployee` (kişi kaydı, `expected_revision` ile). Başarıda liste ve detay yenilenir ve çekmece **Profile sekmesine döner** (`:377`). Alt çubuk Availability dışındaki bütün sekmelerde var (`:1283`), yani Access'te de "Save changes" duruyor. İkinci çağrı içeren tek yol Invite/Resend: taslak değişmişse önce kaydı kaydediyor, sonra daveti gönderiyor (`:1365-1378`).
- **Rol değişince sunucuda olanlar** (`update_employee_membership_role_service`, canlı gövde): yetki (`authorize_role_grant`, kendi rolünü değiştiremez, rütbe); kişi kaydının **revizyonu 1 artar**; kişi olayı `employee.role_changed`; denetim kaydı `membership.role_changed`. Üyelik tablosunda güncellemede çalışan tetikleyiciler (adları `pg_trigger`'dan; gövdeleri bu ölçümde okunmadı): `manager_note_follows_role` (KARARLAR `:44`: kişi employee sınıfından çıkınca hakkındaki Manager note **kalıcı silinir**), `managed_locations_follow_role` (B'de kalkıyor), `b_enforce_role_location_scope`, belge atamasıyla ilgili üçü (`document_assignment_lock`, `document_assignment_changed`, `start_document_activation_periods`), sahiplik devri beklerken ret (`block_membership_change_when_ownership_transfer_pending_trigger`). Web tarafında başarıdan sonra liste, detay, referans verisi ve oturum bağlamı yenilenir (`:527-537`).
- **Sıra şartı (revizyon):** rol servisi revizyonu artırıyor, kişi kaydı ise `expected_revision` ile gidiyor. Rol önce giderse aynı Save'deki kişi kaydı 40001 "revision conflict" alır. Doğru sıra: önce kişi kaydı, sonra rol. Aynı nedenle bugün de bir tuzak var (koda göre; tarayıcıda denenmedi): taslak değişmişken rol seçilirse rol anında kaydolur, revizyon artar, taslak eski revizyonla kalır (`:248-256` düzenlenmiş taslağı yenilemez) ve ardından "Save changes" çakışma hatası verir. Madde 15 bu tuzağı da kapatır.
- **Kaydedilmemiş değişiklik uyarısı:** var olan kişinin çekmecesinde **hiç yok.** Kapatma onayı yalnız yeni kişi eklerken (`requestClose` `:641-650`, başlık "Discard new employee?" `:1420`); sekme kapatma uyarısı da yalnız o durumda (`:673-682`); Cancel doğrudan kapatıyor (`:1341`). Sonuç: bugün rol değişikliği kaybolamıyor (anında kaydoluyor); madde 15'ten sonra rol seçip çekmeceyi kapatan kişinin değişikliği sessizce gider — ad ya da lokasyon değişikliğinde bugün olduğu gibi.
- **"Terminate employee" kilidi:** taslak değişmişken pasif, ipucu "Save profile changes before terminating the employee" (`:1291-1300`); `dirty`'ye bakıyor, rolü saymıyor. Madde 15'te rol de sayılmalı ve metin "profile" dememeli (BL-431).
- **Save düğmesinin kapısı:** düğme yalnız `!readOnly` iken çıkıyor (`:1386`), `readOnly = archived || !canSave` (`:325`); rol ise `allowed.change_role` ile açılıyor (`:2330`). Kaydı kaydedemeyen ama rolü değiştirebilen okuyucu varsa düğmesi olmaz; Save dalı aynı durumu `canSubmit` ile çözmüştü.
- **Save dalındaki kalıp örnek alınabilir mi:** evet, neredeyse aynen. `6722c4aa` `saveMutation`'ı iki adımlı yapıyor: taslak değişmişse önce kişi kaydı, kayıt girince taslak "temiz" işaretlenir; sonra ikinci çağrı; ikinci düşerse kayıt yenilenir, hata gösterilir, ikinci parçanın seçimi korunur ve yeniden denemede yalnız o gönderilir; iki parçanın birleşik "değişti" bayrağı (`anyDirty`) Save ve Terminate kapılarını besler; kaydı kaydedemeyen ama ikinci parçayı değiştirebilen okuyucu için `canSubmit`. Rol için iki fark: rol tek değer (liste değil) ve ikinci adım revizyonu artırdığı için başarıdan sonra detay mutlaka yenilenmeli. Dal silindiği için kalıp bugün yalnız commit numarasıyla okunuyor (bölüm 5 (a)).
- **Sınıf:** R2 önerisine katılıyorum. API ucu, servis ve yetki değişmiyor; değişen yalnız web kayıt akışı, ama iki çağrının sırası ve kısmi hata durumu sessiz bozulabilen türden (bir bağımsız inceleme bunu okur). Tek ek: düğmenin davranışı Access sekmesinde değiştiği için ekran görüntüsü (masaüstü + telefon); `nf-gorsel-qa` gerekmez.
