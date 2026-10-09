# EMP-001 C2: Management / Owner / Manager — shared, API cümleleri, web veri ve sıralama (nf-backend, 2026-09-30)

## 1. Nerede duruyor
Bitti; C3'ü bekliyor. `managementJobIds` kararı kapandı (A onaylı, "Açık kalanlar" 1).

- Dal: `task/emp-001-c2`, uç `661831da`, taban `task/emp-001-c1` @ `4dd1f56b`. Push yok.
- Worktree: `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-blackburn-f4a88f`
- Commit'ler: `ef2fda37` (shared + API), `17415beb` (Schedule sıralaması), `c6c54079` (web: birincil iş kuralı), `d589c231` + `661831da` (rol hafızası).
- Migration ortak yerel DB'de yok; veritabanına dayanan hiçbir şey denenmedi (vitest ve typecheck).

## 2. Ne yapıldı (etkisi)
**Sözleşme (shared):** kişi kaydının okunmasında yeni zorunlu alan `is_workspace_owner`. Employees çekmecesi "bu kayıt owner'ın mı" sorusunu artık sunucudan alabilir; alan yoksa okuma reddedilir.

**Ret cümleleri (shared, API aynen geçirir):** "Management işi birincil olamaz" cümlesi yalnız Owner işini anlatıyor; "birincil iş gerekli" cümlesi artık "Management dışı" demiyor. API'nin dört test dosyası veritabanının yeni cümleleriyle güncel.

**Birincil iş kuralı (web veri tarafı):** Employees → çekmece → Employment → Jobs ve kurulum sihirbazı → "Add your team": tıklanan ilk iş birincil gelir, Management altındaki iş de (ör. Manager). Yalnız Owner işi birincil olmaz. Örnek: Mert yeni kişiye önce "Manager", sonra "Server" tıklar → birincil Manager; "Server"ın yanındaki "Primary"yi seçerek elle değiştirir.

**Schedule → "Job/Position":** sıra artık öteki iş grupları → "Unassigned job" → Management'ın iş grupları. Herkes tek satır: satır, kişiye verilen birincil işin grubunda (Management işi de olabilir); birincil yoksa Owner işi (owner için), o da yoksa tuttuğu ilk iş. Örnek: yalnız Owner işi olan owner en alttaki Owner grubunda; Owner + birincil Cook olan owner yalnız Cook grubunda.

**Silinenler:** `firstJobOutsideManagement`, `nonManagementPrimaryJobId`, çekmecenin referans verisindeki iş başına `management` işareti (okuyanı kalmadı). Eski kuralı anlatan test hücreleri yeni kurala göre yeniden yazıldı.

## 3. Açık kalanlar
1. **Karar kapandı (koordinatör, 2026-09-30: A onaylı):** `managementJobIds` shared'da tek "Management'ın işleri" yardımcısı olarak kalır (yorumu düzeltildi); Done when 26'nın ikinci grep'i `firstJobOutsideManagement\|nonManagementPrimaryJobId` → 0 diye okunur (kayıt oturumu yazacak). Bugünkü ölçüm: o iki ad 0; `managementJobIds` `packages/shared/src/index.ts:899`, `index.test.ts`, `scheduleEmployeeSort.ts:1,19`.
2. **Done when 26'nın ilk yarısı C3'te:** `EmployeeDrawer.tsx`'te `role_name === "Owner"` hâlâ 3 yerde (`:1120`, `:2337`, `:3114`); veri alanı hazır.
3. **Veritabanıyla uçtan uca denenmedi** (migration yerelde yok): sunucunun gerçek cevabında `is_workspace_owner` alanının geldiği C1 raporuna dayanıyor; C4 e2e'si ve dal CI'ı kanıtlayacak.

## 4. Ekranda ne değişti
Görünüm C3'te; bu dilimde ekrana yansıyan üç şey var:

**Employees → çekmece → Employment → Jobs:** Management altındaki işlerin (Manager gibi) yanında da "Primary" seçeneği çıkıyor; ilk tıklanan iş birincil oluyor. Owner işinin yanında "Primary" yok. (Owner kutucuğunun devre dışı görünmesi C3.)

**Schedule → "Job/Position":** Management'ın iş grupları (Owner, Manager ve eklenenler) en altta, "Unassigned job"ın da altında.

**Ret cümleleri (eski → yeni, aynen):**
| Anahtar | Eski | Yeni |
|---|---|---|
| `employee.management_primary` | "A Management job can't be marked primary. Choose a job from another department as primary, or leave it empty if they only work in Management." | "The Owner job can't be marked primary. Choose another job as primary, or leave it empty if they only hold the Owner job." |
| `employee.primary_job_required` | "Mark one of the jobs outside Management as primary." | "Mark one of the jobs as primary, or turn on Remote or Exclude from schedule." |

Öteki cümleler (`catalog.system_record`, `employee.owner_job`, `employee.owner_locations`, `employee.location_required`, `employee.job_required`, `employee.manager_location_required`) değişmedi.

## C3 için sözleşme (nf-arayuz)
**Tipler**
- `EmployeeDetail.is_workspace_owner: boolean` — `packages/shared/src/index.ts:2637`. Her okuyan için dolu. Çekmecede `detail.data.is_workspace_owner`; `role_name === "Owner"` okumalarının (`EmployeeDrawer.tsx:1120`, `:2337`, `:3114` — sonuncusu `toDraft` içinde `is_owner_record`) yerine bu geçer.
- `EmployeeJobOption.owner: boolean` — `apps/web/src/employees/employee-data.ts:53-59`. Owner işi. İş başına `management` alanı artık YOK; departmanda duruyor (`EmployeeDepartmentOption.management`, `:47`), "Management en altta" gruplaması onu kullanıyor (`EmployeeDrawer.tsx` `byDepartment`).

**Yardımcılar**
- `firstJobExceptOwner(jobIds, ownerJobId)` — `apps/web/src/employees/employee-create-flow.ts:34`. Seçilen işlerden Owner olmayan ilki; yoksa `null`. Çekmecenin iş seçicisi (`EmployeeDrawer.tsx:2969`, `:3029`, `:3031`) ve sihirbaz (`OwnerOnboardingPage.tsx:714`) bunu kullanıyor. Eski kuralın tek kalan yardımcısı bu.
- `managementJobIds(departments, jobs)` — `packages/shared/src/index.ts:899`. Management'ın altındaki işlerin kimlik kümesi (departmanın `system_key`'inden). **Sihirbazın Continue sayımı (Done when 19) için:** `jobs.filter((job) => !job.archived_at && !managementJobIds(departments, jobs).has(job.id)).length`; departman sayımı `departments.filter((d) => d.system_key === null)`. Sihirbazdaki eski `managementIds` memo'su kullanıcısı kalmadığı için silindi; sayım için yeniden eklenir.
- `primaryScheduleJobId(employee, jobs)` — `apps/web/src/schedule/lib/scheduleEmployeeSort.ts:94`. Artık `departments` almıyor. `ScheduleRow.tsx`'te `departments` prop'u bağlanmıyor (tip tanımında duruyor; silinmesi sunum tarafının işi).
- `managementAndOwnerSentence(hint)` — `packages/shared/src/index.ts:888`, değişmedi.

**Üç durumun verisi (çekmece, Jobs seçicisi)**
| Durum | Veri | Seçicinin bugünkü davranışı (C2) | C3'e kalan |
|---|---|---|---|
| Owner'ın kaydı | `detail.is_workspace_owner === true`; `jobs` içinde Owner işi, `primary: false`; `primary_job_id` null olabilir | Owner satırında "Primary" yok; başka iş tıklanınca o birincil | Owner kutucuğu işaretli + devre dışı; lokasyonlar işaretli + devre dışı, lokasyonda "Primary" gizli (Done when 20, 21) |
| Owner işi, owner olmayan kişide | `references.jobs[].owner === true` | Tıklanırsa birincil OLMAZ, "Primary" çıkmaz; kayıt veritabanında reddedilir | Kutucuk devre dışı ve işaretsiz (Done when 20) |
| Manager işi (ya da Management'a taşınmış iş) | `owner: false`; departmanı `management: true` | Sıradan iş: ilk tıklanırsa birincil, "Primary" seçeneği var | — |

**C2'nin senin dosyalarında ZATEN yaptığı değişiklikler (koordinatör onaylı; aynı yerlere ikinci kez girme)**
| Dosya:satır | Ne değişti |
|---|---|
| `apps/web/src/employees/EmployeeDrawer.tsx:85` | import `firstJobOutsideManagement` → `firstJobExceptOwner` |
| `EmployeeDrawer.tsx:2955-2957` | iş seçicisinin `options` tipi: `management?` yerine `owner?: boolean` (+ yorum) |
| `EmployeeDrawer.tsx:2969` | `const ownerJobId = options.find((option) => option.owner)?.id;` (eski `management` kümesi silindi) |
| `EmployeeDrawer.tsx:3029` | birincil iş kaldırılınca `firstJobExceptOwner(ids, ownerJobId)` |
| `EmployeeDrawer.tsx:3031` | tıklanan iş boş birincili doldurur, Owner işi hariç (`option.owner ? null : option.id`) |
| `EmployeeDrawer.tsx:3038` | "Primary" seçeneği Owner işi dışında her işte (`checked && !option.owner`) |
| `apps/web/src/views/OwnerOnboardingPage.tsx:41` | import `firstJobExceptOwner`; `managementJobIds` import'u ve `managementIds` memo'su silindi |
| `OwnerOnboardingPage.tsx:710-717` | "Add employee": `primary_job_id: firstJobExceptOwner(employeeDraft.job_ids, <Owner işinin id'si>)` |
| `apps/web/src/views/OwnerOnboardingPage.test.tsx:799`, `:821`, `:831`, `:865` | blok adı ve üç hücre yeni kurala göre (ilk tıklanan iş birincil, Manager dahil) |
| `apps/web/src/schedule/components/ScheduleRow.tsx:381` | `primaryScheduleJobId(employee, jobs)`; bileşen `departments` prop'unu artık bağlamıyor |
| `apps/web/src/employees/EmployeeDrawer.test.tsx:1242` | eski "Management job is primary by its department" bloğunun yerine dört hücre |

**Testlerin yeri (C3 aynı dosyalara yazacak):** `EmployeeDrawer.test.tsx:1242` `describe("the primary job (EMP-001 C)")` — dört hücre, `withManagementJobs()` üç işi (Server, Floor Manager, Owner) kurar; `OwnerOnboardingPage.test.tsx:799`; `scheduleEmployeeSort.test.ts:332`.

**Bilinmesi gereken:** yeni kişi formunda birincil iş şemada aranmıyor (veritabanı `employee.primary_job_required` ile ister); seçici ilk tıklanan işi birincil yaptığı için form boş birincil üretmiyor. Şemaya kural eklemek sihirbazı kırıyor: sihirbaz taslağını `primary_job_id: null` ile doğruluyor, birincili gönderirken hesaplıyor.

## 5. Sırada ne var
1. **C3** (`nf-arayuz`): yukarıdaki sözleşmeyle çekmece görünümü, `role_name === "Owner"` sökümü, sihirbaz Continue sayımı.
2. **Kayıt:** Done when 26'nın grep satırı (koordinatör kayıt oturumuna yazdıracak).
3. **Yolda bulunanlar (dokunulmadı):**
   - (leave: low / do: safe) `ScheduleRow.tsx` prop tipinde `departments` artık kullanılmıyor; çağıranlardan ve tipten silinebilir (sunum dosyaları).
   - (leave: low / do: safe) Kurulum tamamlanırken veritabanının "at least one job outside Management is required to complete owner onboarding" reddi ipucu (hint) taşımıyor (C1 sözleşmesi); ekranda nasıl okunacağı C3'ün sayımıyla birlikte ele alınmalı — sihirbaz bu cümleyi bugün çevirmiyor.
   - (leave: low / do: safe) API gövdesi şemadan düşen kayıtta genel "Valid employee details required" diyor (lokasyon/iş eksikliğinde de böyle; formlar cümleyi önce gösterdiği için ekranda görünmüyor).

## Kanıt
Ölçüm: 2026-09-30, CI boştayken (`gh run list`: main, batch-t10, main tamamlanmış), `c6c54079`'un içeriğiyle; sonraki iki commit yalnız `.claude/agent-memory`.

| Adım | Komut | Sonuç |
|---|---|---|
| Kırmızı, shared | `vitest run src/index.test.ts src/employee-detail.test.ts`, değişiklikten önce | 3 düştü (owner alanı, iki cümle/şema hücresi) |
| Kırmızı, API | `vitest run`, shared değişince | 3 düştü (eski cümleleri bekleyen hücreler) |
| Kırmızı, Schedule | `vitest run src/schedule/lib/scheduleEmployeeSort.test.ts`, değişiklikten önce | 2 düştü (Owner en altta; sıra "öteki, Unassigned, Management") |
| lint | `pnpm.cmd lint` | 5/5 görev, 0 hata (web 20 eski uyarı) |
| typecheck | `pnpm.cmd typecheck` | 7/7 görev |
| shared vitest | `pnpm.cmd --filter @newfork/shared exec vitest run` | 16 dosya, 187 geçti |
| API vitest | `pnpm.cmd --filter @newfork/api exec vitest run` | 57 dosya, 1035 geçti |
| web vitest, tamamı | `pnpm.cmd --filter @newfork/web exec vitest run` | 221 dosya, 1966 geçti, 1 atlandı, 0 düştü |
| grep (26, ikinci) | `git grep -n "managementJobIds\|firstJobOutsideManagement\|nonManagementPrimaryJobId" -- apps packages` | yalnız `managementJobIds` (4 dosya); öteki ikisi 0 |

Done when: 24 → `scheduleEmployeeSort.test.ts:332` (dört hücre: sıra kuralı + K5 iki durum + grup sırası/tek satır). 23 (veri) → `EmployeeDrawer.test.tsx:1242` (dört hücre) + `employee-data.test.ts` yardımcı hücresi + sihirbaz üç hücre. Shared alanı → `employee-detail.test.ts` "refuses a detail that does not say whether the record is the owner's".

Kapsam dışı dosyalarda derleme için zorunlu en küçük değişiklikler: `EmployeeDrawer.tsx` (import + seçicide 3 satır + tip yorumu), `OwnerOnboardingPage.tsx` (import, `:714` çağrısı, kullanıcısız kalan memo), `ScheduleRow.tsx` (1 çağrı + kullanılmayan bağlama), ve bunların eski kuralı anlatan test hücreleri.

Skills: TDD yöntemi uygulandı (her kural için önce kırmızı koşu); skill metinleri yüklenmedi (tasarruf notu).

## Karar kaydı (kendi alanım)
| Karar | Dayanak | Geri alma maliyeti |
|---|---|---|
| `managementJobIds` kalır (A) | Schedule sırası ve sihirbaz sayımı aynı bilgiyi istiyor; üç yere inline ikiz olurdu | 3 yer inline |
| Birincil iş şemada aranmaz | Denendi: sihirbazın taslak doğrulamasını kırdı (4 hücre); veritabanı zaten istiyor, seçici boş birincil üretmiyor | — |
| İş başına `management` alanı silindi | Okuyanı kalmadı (eski birincil kuralı için vardı) | 3 satır + fixture'lar |
| `primaryScheduleJobId` `departments` almaz | Yeni sıra departmana bakmıyor (kayıtlı birincil → Owner → ilk iş) | imza |
| Cümleler | Kardeş cümlelerin kalıbı ("…, or turn on Remote or Exclude from schedule.") | metin |
| "Unassigned job" Management gruplarının üstünde | Done when 24'ün yazdığı sıra | 1 satır |
