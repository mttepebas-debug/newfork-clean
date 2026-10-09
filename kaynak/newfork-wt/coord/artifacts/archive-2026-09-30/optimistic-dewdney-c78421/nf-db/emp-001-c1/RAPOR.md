# EMP-001 C1 — Management departmanı, Owner ve Manager işleri (veritabanı tarafı)

Rol: nf-db. Dal `task/emp-001-c1`, worktree `.claude/worktrees/optimistic-dewdney-c78421`.
Commit'ler: `0022b9cd` (kural + testler) ve `4dd1f56b` (owner işareti + iki okuma testi + rol hafızası), `origin/main` `a98b0671` üstünde. Push yok.
Migration: `supabase/migrations/20261002000000_manager_is_an_ordinary_job.sql` (928 satır; on bölüm). Ortak yerel DB'ye UYGULANMADI.

## 1. Nerede duruyor
C1 bitti; `nf-guvenlik` incelemesini ve C2 + C3'ü bekliyor (tek birleştirme). Açık karar yok.

## 2. Ne yapıldı (etkisi)
- **Kurulumda "Manager" işi kendiliğinden gelir.** Yeni workspace'in ilk kurulum kaydında Management departmanının altında "Owner"ın yanında "Manager" da oluşur. Manager sıradan iştir: Settings → Jobs'ta adı değişir, arşivlenir, geri alınır, silinir. Owner silerse sonraki kurulum kaydı geri getirmez (Manager yalnız Management ilk kez oluşurken eklenir).
- **Her iş birincil olabilir, Owner dışında.** Örnek: Ayşe'nin tek işi Manager; Employees → çekmece → Employment'ta Manager birincil seçilip kaydedilir. "Management işi birincil işaretlenemez" kuralı yalnız Owner işine daraldı; "iş Management'a taşınınca birincil işareti silinir" tetikleyicisi kalktı (Host birincilken Management'a taşınırsa birincil kalır).
- **Kayıt kuralı sadeleşti.** Owner olmayan, Remote ya da "Exclude from schedule" işaretli olmayan kişi: en az 1 lokasyon + birincil lokasyon, en az 1 iş ve 1 birincil iş. "Yalnız Management işi olan birincilsiz kaydolur" (BL-218 `.3b`) geri alındı: o kayıt artık "birincil iş gerekli" ile reddedilir.
- **Settings → Jobs'tan iş verme/alma:** kişinin birincili yoksa verilen ilk iş birincil olur (Manager dahil, Owner hariç); birincil işi alınan ya da silinen kişide işaret sıradaki işe geçer, Owner işine asla.
- **Kurulum sayımı (K2):** "en az 1 iş" artık "Management dışında en az 1 iş". Yalnız Management + Owner + Manager (ya da owner'ın Management altına eklediği işler) ile kurulum tamamlanmaz.
- **Rol iş vermez (madde 14 / Done when 25):** rolü Manager'a çevrilen ya da Manager rolüyle davet kabul eden kişinin iş atamaları değişmez. Davranış zaten böyleydi; iki hücreyle kilitlendi.
- **Owner işareti sunucudan (BL-421, koordinatör kararı "b"):** çekmecenin okuması `get_employee_detail_service` artık `is_workspace_owner` (true/false) döndürür.
- **Var olan workspace'ler:** migration, Management'ı olan her workspace'e bir kez "Manager" ekler; aynı adda canlı iş varsa dokunmaz (koordinatör kabul etti).
- **Test dünyası:** `tests.world` artık `<w>:management`, `<w>:job:owner`, `<w>:job:manager` etiketlerini taşır.
- **Silinenler** (`retired_objects_stay_gone`'da): tetikleyici `jobs.jobs_under_management_are_primary`, fonksiyonlar `management_jobs_are_primary_by_department`, `is_management_job`.

### Done when — kanıt
| Madde | Kanıt (pgTAP) |
|---|---|
| 17 | `management_owner_job` hücre 3 (Manager sistem anahtarsız, Owner'ın yanında), 7–9 ve 11 (silinen Manager iki kurulum kaydından sonra da yok), 12 (test dünyası ikisini taşır) |
| 18 | `management_owner_job` 41–53 (birincil, ilk iş birincil, taşınan iş birincil kalır, tetikleyici yok, ad değişir, arşiv, geri alma, silme); `manager_is_an_ordinary_job` 1–3 (yalnız Manager + birincil kaydolur; birincilsiz `employee.primary_job_required`); `management_owner_job` 45 (`employee.management_primary` yalnız Owner işinde) |
| 19 | `management_owner_job` 5 (yalnız Management: 23514), 6 (kendi departmanı var ama işler Management altında: 23514), 10 (Management dışı iş: tamamlanır). Sihirbazın vitest'i C2/C3'te |
| 22 | `management_owner_job` bölüm 3 ve 5 (mevcut, yeşil) + 46–47 (owner'a Cook verilip alınınca birincil Owner'a düşmez) |
| 25 | `manager_is_an_ordinary_job` 18 (rol değişimi), 19 (davet) |

Önce kırmızı (migration'sız, 06:51): 27 hücre + 1 dosya hatası (`reads_know…`: `tests.id: no such label mk:job:manager`). Önceden de yeşil olan, davranışı kilitleyen hücreler: Done when 25'in ikisi, "Owner birincil olamaz", "birincil Owner'a düşmez".

### Ölçümler (2026-09-30, ortak yerel DB, her dosya ayrı oturum, migration + kurucu işlem içinde, geri alındı)
- Taban (origin/main testleri, migration'sız, 06:58–07:04): 144 dosya, 2 kırmızı: `bl052_document_lifecycle`, `bl052_document_notifications`.
- Migration'lı (07:04–07:08): 144 dosya, aynı 2 kırmızı + iş listesi beklentisi eskiyen 2 dosya (`settings_reads_ask_the_core`, `employee_references_ask_the_core`: listede artık "Manager" var). Üç beklenti satırı düzeltildi, iki dosya aynı migration + kurucu ile yeniden koştu (07:09): 28/28 ve 21/21. Sonuç: kırmızı küme tabanla birebir aynı. Özetler: `full-base/summary.txt`, `full-mig/summary.txt`, `fix/summary.txt`.
- `authz_catalog` 10/10 (sayaç artmadı), `authorization_matrix` 8294 ok / 0 kırmızı (tabanla aynı), `authorization_coverage` 5/5, `retired_objects_stay_gone` 15/15, `schedule_grid_read_budget` 17/17 (≤ 50 ms hücreleri yeşil).
- `bash scripts/ci-green-guard.sh origin/main` = 0 (rebase sonrası).
- Kalıcı iz yok: koşu öncesi ve sonrası aynı — son migration `20261001020000`, 75 eylem, 312 workspace, 690 iş; silinecek tetikleyici ve iki fonksiyon DB'de hâlâ duruyor. Commit'teki migration + kurucu, tam koşunun kullandığıyla bayt bayt aynı (`cmp`).
- Yeniden tanımlanan fonksiyonlar canlı gövdeden (`pg_get_functiondef`) üretildi: `build.mjs` her değişen parçanın gövdede tam bir kez geçtiğini doğrular; gövdeler koşudan hemen önce yeniden döküldü, değişmemişti.

## 3. Açık kalan ve nedeni
- Migration ortak DB'ye ve hosted'a uygulanmadı: `nf-guvenlik` onayı ve `main.lock` penceresi bekliyor (CLAUDE.md §7).
- Kurucu (`builder.sql`) ortak DB'ye yeniden yüklenmedi; migration uygulanınca `node scripts/reload-test-builder.mjs` gerekir (yoksa `<w>:job:manager` etiketi olmaz).
- Web ve API tarafı (C2, C3) bu dalda yok: API'nin ipucu → cümle tablosu ve web'in "Management dışı birincil" yardımcıları eski kuralı anlatıyor (aşağıda).

## 4. Ekranda ne değişti
Bu dal yalnız veritabanı; migration uygulanınca:
- **Settings → Jobs → Management:** her workspace'te "Owner"ın yanında "Manager" görünür (yerel Meyhouse dahil). Sıra bugün ada göre: Manager, sonra Owner.
- **Kurulum sihirbazı (Jobs adımı):** Management altında Owner ve Manager hazır gelir; yalnız onlarla "Finish" sunucuda reddedilir.
- **Employees → çekmece → Employment:** Manager birincil seçilebilir; yalnız Manager işi olan kişi birincilsiz kaydedilemez (C2/C3 gelene kadar ekran eski cümleyi gösterir).
- **Employees listesi, Job sütunu:** birincili olmayan kişide artık "ilk Management işi" değil; owner'da Owner, diğerlerinde katalog sırasındaki ilk iş.

## 5. Sırada ne var / yolda bulunanlar
1. `nf-guvenlik` incelemesi (R3), sonra C2 (`nf-backend`) ve C3 (`nf-arayuz`).
2. **e2e riski (nf-test):** test dünyasında artık "Manager" adlı bir iş var; rol "Manager"ı metinle seçen senaryolar (ör. `e2e/flows/invite.spec.ts`) aynı ekranda iki "Manager" görebilir. C2/C3 sonrası e2e koşusunda bakılmalı.
3. **Backlog adayı (leave: low / do: safe):** Settings → Jobs'ta Management altında sıra "Manager, Owner" (ada göre). "Owner önce" isteniyorsa `sort_order` ya da ekran sıralaması; C3'ün görsel kararı.
4. **Backlog adayı (leave: medium / do: moderate):** "en az 1 iş / 1 birincil iş" kuralı yalnız çekmece kaydında. Settings → Jobs'tan tek işi alınan ya da işi silinen kişi işsiz ve birincilsiz kalır (K4'ün E2 atlama yollarıyla aynı aile; kapsam dışıydı, dokunulmadı).
5. **Not:** `employee_job_assignments` üstündeki tetikleyicinin adı hâlâ `a_owner_job_and_management_primary` ve ipucu `employee.management_primary`; kural artık yalnız Owner. Ad değiştirmek sözleşme değişikliği olurdu (Done when 18 ipucunun kalmasını istiyor), bırakıldı.
6. Seed workspace'lerinde (`seed.sql`) Management yok (bu işten önce de yoktu); CI'da seed'den kurulan workspace'lere Manager eklenmez. Test dünyası kurucudan geldiği için etkilenmez.

---

## C2 için sözleşme (nf-backend)

**Değişen / yeni okuma alanları**
- `get_employee_detail_service` (çekmece): yeni alan **`is_workspace_owner: boolean`** — kayıt workspace owner'ının mı. Her okuyan için dolu (null olmaz). BL-421: `role_name === "Owner"` yerine bu okunur. `employeeDetailSchema`'ya eklenmeli.
- `list_employees_service` (liste satırı): alan eklenmedi. `primary_job_name` sırası değişti: **kayıtlı birincil → yoksa Owner işi (`system_key = 'owner'`) → yoksa katalog sırasındaki ilk iş** (`sort_order`, ad). Eskisi "ilk Management işi"ydi. Listede owner işareti gerekiyorsa söyleyin; kendiliğinden eklenmedi.
- Schedule okuması ve ekip panosu (`primary_job_id`): kural aynı (kayıtlı birincil ya da null), ama artık bir Management işi de dönebilir (Manager, Management'a taşınmış iş). Asla Owner işi dönmez. K5: owner'ın `primary_job_id`'si null ise satır Owner grubunda.
- `jobs[].primary` (çekmece): Manager için `true` olabilir.
- `read_employee_references_service`, `read_settings_jobs_service`: şekil aynı; listelerde sistem anahtarsız "Manager" işi var (`system_key: null`, departmanı Management).

**İpuçları (hint) ve veritabanı cümleleri**
| Hint | SQLSTATE | DB cümlesi | Ne zaman |
|---|---|---|---|
| `employee.location_required` | 22023 | employee requires a location and job unless remote or excluded from schedule | değişmedi |
| `employee.job_required` | 22023 | (aynı cümle) | değişmedi |
| `employee.primary_job_required` | 22023 | **employee requires a primary job unless remote or excluded from schedule** | owner/Remote/excluded olmayan kayıtta `primary_job_id` boşsa — işler hangi departmanda olursa olsun |
| `employee.management_primary` | 23514 | **The Owner job is never marked primary** | yalnız Owner işi birincil işaretlenirse |
| (hint yok) | 23514 | **at least one job outside Management is required to complete owner onboarding** | kurulum tamamlanırken Management dışında canlı iş yoksa |
| `employee.owner_job`, `authz.owner_only`, `catalog.system_record` | — | değişmedi | — |

API'de güncellenecekler: `managementAndOwnerRefusals` içindeki `employee.management_primary` ve `employee.primary_job_required` cümleleri (testler: `employee-create-service.test.ts:119-145`, `employee-directory-routes.test.ts:439-443`, `http-error.test.ts:187-212`, `jobs-management-routes.test.ts:190`); web: `EmployeeDrawer.test.tsx:1297` ("Mark one of the jobs outside Management as primary."), `scheduleEmployeeSort.ts` `primaryScheduleJobId` (liste ile aynı sıra: kayıtlı birincil → Owner → ilk iş) ve Done when 26'daki `managementJobIds / firstJobOutsideManagement / nonManagementPrimaryJobId`.

**Kayıt gönderirken**
- `save_employee_service` / `create_employee_command_service`: owner olmayan, Remote ve excluded olmayan kayıt için `primary_job_id` zorunlu; Manager id'si geçerli. Owner kaydında `primary_job_id` boş olabilir; Owner işinin id'si `primary_job_id` olarak gönderilirse 23514 `employee.management_primary`.
- Sihirbazın Continue sayımı (Done when 19): Management departmanının (`departments.system_key = 'management'`) altındaki hiçbir iş sayılmaz; departman sayımı değişmedi (`system_key` boş olan departman).

## nf-guvenlik için
- **Yüzey:** kayıt kuralı (`save_employee_service`), atama tablosu tetikleyicisi (`keep_job_assignment_rules`), tetikleyici + iki fonksiyon sökümü, kurulum fonksiyonları (`ensure_management_and_owner`, `apply_owner_onboarding_update`), iki atama servisi, iki okuma. Yeni eylem, grant, politika, `*_service` yok; imzalar ve dönüş tipleri aynı (detay okumasına bir jsonb anahtarı eklendi).
- **Bakılmasını istediğim yerler:**
  1. `ensure_management_and_owner` `language sql` → `plpgsql` oldu (SECURITY DEFINER, `search_path ''` korunur). Manager eklemesi yalnız `returning id into made_management` doluysa; ad çakışmasında `on conflict (workspace_id, lower(name)) where archived_at is null do nothing` (`jobs_workspace_active_name_idx`).
  2. `save_employee_service`: `.3b`'nin "yalnız bu workspace'in Management'ı sayılır" sorgusu kalktı; kural artık kataloğa hiç bakmıyor (`primary_job_id is null` → ret), yani başka workspace'in uuid'si hakkında bilgi sızdıracak dal kalmadı. Hücre: `manager_is_an_ordinary_job` 15 (başka workspace'in Manager işi = uydurma iş ile aynı cevap).
  3. Owner kuralı departmana değil `jobs.system_key = 'owner'`e bakıyor; `job_id` satırın kendi workspace'ine bileşik FK ile bağlı olduğundan başka workspace'in Owner işi buraya gelemez. "Owner işini yalnız owner taşır" ve "owner bırakamaz" dalları değişmedi.
  4. `is_workspace_owner`: detayı okuyabilen herkese döner. Aynı bilgi bugün `role_name`'de var; yeni sızıntı sayılmamalı ama bir kez bakılsın.
  5. Bölüm 9 (veri): Management'ı olan her workspace'e "Manager" satırı. Hosted'da da koşacak; yalnız `jobs`'a ekleme, çakışmada atlar.
  6. `update_job_assignments_service` / `delete_job_with_assignments_service`: yedek birincil seçimi `j.system_key is distinct from 'owner'`; öteki satırlar canlı gövdeyle aynı.
- **Fail-open arayışı:** owner/Remote/excluded muafiyetleri önceki hâliyle; yeni muafiyet eklenmedi, bir muafiyet (yalnız Management işi) kalktı.
- **Deneme düzeni:** `artifacts/nf-db/emp-001-c1/trial2.sh <klasör> <mig|none> <kök> <all|dosya…>` (dosya başına oturum; migration + bütün `builder.sql` dosyanın kendi `begin;`inden hemen sonra; `ON_ERROR_STOP=1`; önce/sonra sayım). Taban ağacı: `artifacts/nf-db/emp-001-c1/base/` (`git archive origin/main`).
