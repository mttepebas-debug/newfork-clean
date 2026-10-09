# EMP-001 dilim B1: "yalnız yönetir"in veritabanından ve yetki çekirdeğinden sökümü (nf-db, 2026-09-30)

## 1. Nerede duruyor
B1 bitti, dalda commit'li. Push edilmedi. Bir soru açık: K4'ün sınırı (bölüm 3).

| | |
|---|---|
| Dal | `task/emp-001-b` (yerel) |
| Commit | `d261e51b` |
| Taban | `origin/main` @ `c5c5af9d` |
| Worktree | `.claude/worktrees/dreamy-sinoussi-7c5a4a` |
| Migration | `supabase/migrations/20261001000000_a_manager_manages_where_they_are_assigned.sql` |

- Ortak yerel veritabanına kalıcı uygulama yok. Koşulardan sonra ölçtüm: son migration `20260930190000`, eylem sayısı 74, tablo yerinde; workspace, kullanıcı ve test kimliği sayıları koşudan önceki gibi (304 / 1165 / 4337).
- `db.lock` alındı ve bırakıldı. Koşulardan önce `gh run list` ile baktım, CI koşmuyordu.
- `bash scripts/ci-green-guard.sh origin/main` = 0.

## 2. Ne yapıldı (etkisi)
Müdür artık yalnız atandığı lokasyonları yönetiyor. "Manages without working there" veritabanında ve yetki çekirdeğinde kalmadı. Bir lokasyonu vardiyaya girmeden yönetecek müdür o lokasyona atanıyor ve "Exclude from schedule" işaretleniyor.

Örnek: Derya Beşiktaş'a atanmış ve işaretli müdür. Beşiktaş'taki Veli'nin kaydını açar, Kadıköy'deki Emre'ninkini açamaz (`authz.out_of_scope`). Kendisine vardiya yazılamaz. Can iki lokasyona atanmış müdür; ikisinin de kişilerini görür, ikisinde de vardiya alır.

### Silinenler (hepsi `retired_objects_stay_gone` testinde kayıtlı)
- Tablo `public.membership_managed_locations`; veri korunmadı.
- `public.set_employee_managed_locations_service(uuid, uuid, uuid, uuid[])`.
- `app_private.manages_without_working(uuid, uuid)`.
- Tetikleyici `managed_locations_follow_role` ve fonksiyonu `app_private.managed_locations_follow_role()`.
- Yetki eylemi `employee.set_managed_locations`; eylem sayısı 74'ten 73'e indi.
- Kısıt `workspace_memberships_id_workspace_id_role_key`; yalnız silinen tablonun yabancı anahtarı kullanıyordu.

### Yeniden tanımlananlar
- `app_private.actor()`: manager için `manages = works`. Bu, 2026-09-24 çekirdeğindeki özgün satırın aynısı.
- `app_private.authz_check()`: kişi hedefinin yerleri yalnız atamaları.
- Dört eski lokasyon yardımcısı: `schedule_actor_can_manage_service`, `schedule_actor_can_publish_service`, `schedule_actor_has_capability_service`, `communication_actor_has_capability_service`. "Ya da yalnız yönettiği" dalı çıktı.
- `get_employee_detail_service`, `list_employees_service`, `update_employee_membership_role_service`: alanlar çıktı, ayrıntısı "B2 için sözleşme" bölümünde.
- `app_private.scope_set` değişmedi.
- G8a'nın düzelteceği dala (arşivli lokasyon) dokunulmadı.

### K4: işaretli müdür lokasyonsuz kalamaz
Tek yardımcı: `app_private.keep_excluded_manager_at_a_location(w, employee, becoming)`. Yazmadan sonra çağrılır, kaydın olacağı hâli okur. Kişinin sınıfını çekirdeğin `actor()` fonksiyonundan alır; rol tablolarını kendisi okumaz.

Ret: `22023`, hint `employee.manager_location_required`, mesaj "a manager excluded from the schedule needs a location to manage".

Dört yol reddediyor:

| Yol | Fonksiyon |
|---|---|
| Kayıt | `save_employee_service` |
| "Remove" ile son lokasyon | `remove_employee_from_location_service` |
| Rolün manager'a çevrilmesi | `update_employee_membership_role_service` |
| Manager rolüyle davet | `prepare_employee_invitation_service` |

- İşaretli çalışanın ve Remote kişinin muafiyeti aynen duruyor.
- Dördüncü yol (davet) görev dosyasında yoktu. Aynı sonucu başka kapıdan doğurduğu için kapattım: işaretli ve lokasyonsuz kişi Manager rolüyle davet edilip kabul edince lokasyonsuz işaretli müdür oluyordu.

### Testler
Hepsi aynı yöntemle koştu: migration, kurucu değişikliği ve test dosyası tek işlemde, sonunda geri alındı; dosya başına ayrı `psql` oturumu, `ON_ERROR_STOP=1`.

- **Tam paket (2026-09-30 04:04–04:08):** 154 dosya, 11.721 geçen test.
  - 143 dosya temiz.
  - 11 dosya kırmızı. Aynı 11 dosyayı migration olmadan da koştum: geçen, düşen ve hata sayıları birebir aynı. Hepsi `ci-not-green.txt`'te (bilinen kırmızılar). Hiçbiri bu işten değil.
  - Dosyalar: `bl052_document_access`, `bl052_document_definitions`, `bl052_document_employee_assignment_preview`, `employee_onboarding_rls`, `notification_platform_core`, `notification_preference_resolver_and_producers`, `notification_settings_admin`, `onboarding_composite_tenant_constraints`, `scheduling_settings_shift_types_rls`, `weekly_exchange_changed_terms`, `weekly_team_availability`.
- **`pnpm.cmd test:db` harfiyen koşulmadı.** O komut `builder.sql`'i ortak veritabanına kalıcı yükler ve uygulanmamış migration'la bütün dosyalar düşer. Yukarıdaki koşu aynı 154 dosyanın karşılığı.
- **Yeni dosya** `a_manager_manages_where_they_are_assigned.test.sql`: 29/29. `ci-green.txt`'e eklendi. Kapsam, ızgara ve K4 hücreleri burada.
- **Yetki matrisi** `authorization_matrix`: 7958 hücre; 7886 geçti, 72'si önceden bilinen TODO hücresi, TODO dışı kırmızı yok.
  - "selin" kişisi, `manages` sütunu, `mgr:*` hedefleri ve `employee.set_managed_locations` satırı çıktı.
  - Yerine "derya" geldi: Beşiktaş'a atanmış, işaretli müdür. İki lokasyonlu müdür "can" matriste zaten vardı; ikinci kişi olarak o sayılıyor.
- **Değişen öteki dosyalar:**

| Dosya | Sonuç |
|---|---|
| `employee_drawer_reads` | 26 |
| `employees_on_the_core` | 54 |
| `people_behind_the_catalog_ask_the_core` | 40 |
| `refusals_answer_alike` | 19 |
| `onboarding_review_on_the_core` | 17 (KK-33 "known gap" hücresi artık `passes`) |
| `authz_catalog` | 10 (sabit eylem listesi 73) |
| `authorization_coverage` | 5 |
| `retired_objects_stay_gone` | 15 (iki yeni tür: `action`, `constraint`) |

- `schedule_grid_read_budget` 17/17 (50 ms tavanı); `excluded_person_leaves_new_drafts` 18/18.
- **Kurucu** (`supabase/test-support/builder.sql`): `tests.manages` silindi (`drop function if exists` ile); `tests.excluded(w, kişi)` geldi.

### Done when (B) karşılığı
- **9:** tamam; yedi nesne yok ve `retired_objects_stay_gone`'da.
- **10:** tamam. Migration'lı işlemde `pg_proc` sayımı 0; yeni test dosyasının ilk hücresi bunu kilitliyor.
- **11:** `supabase/tests` ve `supabase/test-support` içinde eşleşen tek dosya `retired_objects_stay_gone.test.sql` (5 satır). Madde 9 adların orada olmasını, madde 11 ise 0 satır istiyor; ikisi birlikte sağlanamıyor. `apps`, `packages`, `e2e` tarafı B2 ve B3'ün işi.
- **12:** SQL tarafı tamam. TS dökümü B2'de.
- **13:** tamam; `authz_catalog` 10/10, sayaçlar artmadı.
- **14:** pgTAP tarafı tamam (ızgara ve K4 hücreleri). Shared ve çekmece vitest'i B2'de.

## 3. Açık kalanlar
1. **SORU, cevap bekliyor.** Mesaj `send_message` ile gönderildi, 20 saniye içinde teslim edilmedi. K4 işaretsiz müdürü de kapsasın mı?
   - "Remove" bugün işaretsiz müdürü de tek lokasyonundan çıkarabiliyor; söküm sonrası o müdürün kapsamı boş kalır. Pre-mortem 1'deki bozulmanın aynısı.
   - Lokasyonsuz işaretsiz çalışan da manager yapılabiliyor.
   - (a) (Önerilen) Tek kural: "Remote olmayan manager'ın en az bir lokasyonu olur"; işaret şartı aranmaz.
   - (b) Yalnız kararın sözü: işaretli müdür. Şu an yazılı olan bu.
   - (a) seçilirse yardımcıda tek koşul değişir ve iki hücre eklenir.
2. **Lokasyon silme ve arşivleme yolu** kapsam dışı bırakıldı: müdürün tek lokasyonu Settings'ten silinirse müdür lokasyonsuz kalır. G8a'nın (BL-132) komşusu. Backlog önerisi: leave medium / do moderate.
3. **TS dökümü ve shared, API, web tarafı:** B2 ve B3.
4. **Skill'ler:** `supabase:supabase-postgres-best-practices` önceki görevde yüklendi. `test-driven-development`, `systematic-debugging` ve `verification-before-completion` ayrıca çağrılmadı; yöntemleri uygulandı (önce kırmızı hücre, migration'sız karşılaştırma, bitirmeden tam koşu).
5. **Bağlam:** bu oturum %60 civarında. B1'e düzeltme gelirse yapabilirim; yeni bir dilim için yeni oturum öneririm.

## 4. Ekranda ne değişti
Bu dalda arayüz kodu yok. Migration tek başına uygulanırsa Employees çekmecesi 500 verir: shared şema `managed_locations`, `managed_location_names` ve `allowed.set_managed_locations` alanlarını zorunlu tutuyor. B1, B2 ve B3 aynı pencerede girmeli.

## 5. Sırada ne var
1. Koordinatörün K4 cevabı.
2. `nf-backend` B2 ve B3'ü bu dalın üstüne yazar.
3. `nf-guvenlik` incelemesi (B1+B2+B3 tek dal) ve ultrareview önerisi.
4. Migration main'e alınmadan hemen önce uygulanır; sonra `pnpm.cmd test:db`.
5. G8a (BL-132), B1'den sonra.

---

## B2 için sözleşme (nf-backend)

### Kalkan alanlar
| Okuma | Alan | Tip | Durum |
|---|---|---|---|
| `get_employee_detail_service` | `managed_locations` | `[{id, name}]` | anahtar yok |
| `get_employee_detail_service` | `allowed.set_managed_locations` | boolean | anahtar yok; `allowed` sekiz anahtar: `archive`, `change_role`, `invite`, `make_admin`, `onboarding_review`, `remove_access`, `save`, `terminate` |
| `list_employees_service` | `managed_location_names` | `text[]` | sütun yok |

- Detayın anahtar listesi ve liste satırının sütun listesi `employee_drawer_reads.test.sql` içinde birebir eşitlikle kilitli.
- Shared şemada üç alan da zorunlu (`packages/shared/src/index.ts:2517-2519`, `:2593-2595`, `:2645-2646`); şemadan çıkmalı. `employeeManagedLocationsSchema` (`:2670-2677`) de silinir.

### Kalkan RPC ve eylem
- RPC `set_employee_managed_locations_service`; API ucu `PUT …/employees/:employeeId/managed-locations` ve servis sarmalayıcısı gider.
- Eylem `employee.set_managed_locations`: `packages/shared/src/authorization.ts` eylem listesi, kuralı ve karar dalı.
- Denetim kaydı: `membership.role_changed` metadata'sında `managed_locations_removed` yok; `employee.managed_locations_changed` eylemi artık yazılmıyor.

### Yeni ret
- `22023`, hint `employee.manager_location_required`, mesaj "a manager excluded from the schedule needs a location to manage".
- Geldiği yerler: kişi kaydı (kaydetme ve oluşturma), "Remove from <lokasyon>", rol değişimi (`PATCH …/employees/:id/role`), davet hazırlama. `create_employee_command_service` kayıt ve davet adımlarını çağırdığı için ondan da gelebilir.
- Shared'da hint'e karşılık okunur cümle ve çekmecede alan hatası gerekir (hata cümleleri `index.ts:868-893`).
- Öteki hint'ler değişmedi: `employee.location_required`, `employee.job_required`, `employee.primary_job_required`, `authz.*`.

### Shared doğrulama kuralı (K4)
- İşaretli (Remote değil) ve rolü manager olan kişi en az bir lokasyon ister.
- İşaretli çalışan ve Remote kişi lokasyonsuz kaydolur.
- Sunucu, rolü üyelikten okuyor; yeni kayıtta üyelik olmadığı için kayıt adımı geçer, ret davet adımında gelir.

### `authorization-matrix.expected.json` dökümünün yenilenmesi
- Komut: `pnpm.cmd --filter @newfork/shared dump:authz-matrix`. Betik `authorization_matrix.test.sql`'i canlı yerel veritabanında koşturur.
- Migration uygulanmadan koşarsa betik düşer (kurucudaki `tests.excluded` yok, eylem sayısı 74).
- İki yol var:
  - Koordinatör migration'ı uyguladıktan sonra koşmak.
  - `packages/shared/scripts/dump-authorization-matrix.ts`'in geçici bir kopyasında, betiğin `begin;` satırından hemen sonra migration dosyasını ve `builder.sql`'deki `tests.excluded` bloğunu eklemek. nf-db hafıza notu: `rollback-trial-runner`.
- Dökümde değişecekler:
  - "selin" kişisi ve hedefi → "derya" (manager, `{B}`).
  - `mgr:ayse`, `mgr:mehmet`, `mgr:selin` hedefleri yok.
  - `employee.set_managed_locations` eylemi yok.
  - Persona'da `manages` alanı yok.
- TS ikizinde `manages` alanını kullanan yerler: `authorization.test.ts:57`, `:70` (`[...p.locs, ...p.manages]`) ve `dump-authorization-matrix.ts:43`. Erişim yalnız `locs` olur.

---

## nf-guvenlik için

### Değişen yetki yüzeyi
- `app_private.actor()`: manager'ın `manages` kümesi küçüldü ("çalıştığı ∪ yalnız yönettiği" → çalıştığı). Genişleyen hiçbir dal yok.
- `app_private.authz_check()`: kişi hedefinin yerleri küçüldü (yalnız atamalar).
- Dört eski yardımcı: bir `or exists(...)` dalı çıktı; yalnız daralma.
- Eylem satırı silindi; o eylemi soran tek fonksiyon da silindi.
- Yeni fonksiyon `app_private.keep_excluded_manager_at_a_location`: SECURITY DEFINER, `search_path = ''`; public, anon ve authenticated'dan geri alındı. Yalnız okur ve reddeder; izin vermez.
- `list_employees_service` silinip yeniden oluşturuldu (dönüş tipi değişti); grant yeniden verildi: public, anon ve authenticated'dan geri alındı, `service_role`'e verildi. `browser_privileges` ve `public_roles_reach_no_table_directly` yeşil.
- Yeni `*_service` yok; katalog sayaçları artmadı.

### Ret yolları
| Durum | Cevap |
|---|---|
| Müdür, atanmadığı lokasyondaki kişi ya da lokasyon | `42501 authz.out_of_scope` |
| Bilinmeyen hedef | `42501 authz.out_of_scope` (kapsam dışıyla aynı) |
| İşaretli müdür lokasyonsuz: kayıt, Remove, rol, davet | `22023 employee.manager_location_required` |
| Eksik çekirdek eylemi | `22023` (fail-open yok; `employee_drawer_reads`'in son iki hücresi) |

K4 yardımcısı yetki kararı değil, kayıt kuralı. Her çağrıdan önce ilgili `authorize(...)` zaten geçmiş oluyor; sıra: önce yetki, sonra yazma, sonra kural (ret işlemi geri alır).

### Söküm sonrası manager kapsamının kanıtı
- Yetki matrisi:
  - "derya" (işaretli, `{B}`), "can" (`{K,B}`), "ayse" (`{K}`), "mehmet" (`{B}`) ve lokasyonsuz "nur" her eylemde her hedefe karşı sınandı. 7958 hücrenin hepsi iki kez soruldu: API'nin çağırdığı giriş noktasına ve çekirdeğe (`authz_reason`).
  - Çekirdekte bilinen açık yok.
- `a_manager_manages_where_they_are_assigned.test.sql`:
  - `scope_set(derya) = {B}` ve `scope_set(can) = {K,B}`.
  - Derya Veli'yi (B) okur; Emre'yi (K) okuyamaz (`authz.out_of_scope`).
  - Can ikisini de okur; Derya'yı da okur (M2: işaretli müdür lokasyonunun öteki müdürüne görünür).
  - Derya'ya vardiya yazılamaz (23514); Can iki lokasyonda da vardiya alır.
- `employees_on_the_core`: `scope_set` iki hücre; rol değişiminin denetim kaydı anahtarları birebir eşitlikle kilitli.
- `people_behind_the_catalog_ask_the_core`, `refusals_answer_alike`, `onboarding_review_on_the_core`: eski "yalnız yönetir" kişisi artık atanmış ve işaretli müdür; aynı erişim hücreleri yeşil.

### Bilerek bakılması gerekenler
- `keep_excluded_manager_at_a_location` sınıfı `actor().class` ile okuyor. `authz_catalog`'un "kendi kapsam/rütbe mantığı" sayacı `.class` yazımını görmüyor (BL-416). Sayaç bu yüzden artmadı; fonksiyon çekirdeğe soruyor, rol tablosunu kendisi okumuyor.
- Yardımcıda üyelik durumu `active` ve `pending_activation` sayılıyor; askıdaki müdür kurala girmiyor.
- Lokasyon silme yolu kapalı değil (bölüm 3, madde 2).

---

## EK (BL-443 / BL-444): altı rotanın fonksiyonları çekirdeğe soruyor mu

Ölçüm 2026-09-30, yerel veritabanı (main `c6c53155` ile aynı migration'lar), yalnız okuma. Kod yazılmadı; iki karar bekliyor ve bu oturumun bağlamı doldu (aşağıda).

Rotalar `apps/api/src/employees/employee-directory-routes.ts` içinde; çağırdıkları fonksiyonlar `employee-directory-service.ts:340-380`.

| Rota | Fonksiyon | Çekirdeğe soruyor mu | Bugünkü ret |
|---|---|---|---|
| GET tercih edilen ad onay ayarı | `get_employee_name_settings_service` | **Hayır.** Kendi kapısı: `service_actor_has_permission(…, 'employees.read')` | 42501, hint `workspace.employees_required` (`authz.*` değil) |
| PUT tercih edilen ad onay ayarı | `set_employee_name_settings_service` | **Hayır.** Kendi kapısı: `service_actor_has_permission(…, 'settings.general.manage')` | 42501, hint `workspace.settings_required` (`authz.*` değil) |
| PUT kişinin tercih edilen adı | `request_employee_preferred_name_service` | Evet: `authorize(…, 'employee.request_preferred_name', target_person)` | 42501 + `authz.*` |
| GET bekleyen ad talepleri | `list_pending_preferred_names_service` | Evet: `actor()` + `authz_check`, eylem `employee.decide_preferred_name`, satır satır | 42501 + `authz.*` |
| POST ad talebi kararı | `decide_employee_preferred_name_service` | Evet: `authorize(…, 'employee.decide_preferred_name', …)` | 42501 + `authz.*` |
| PUT acil durum kişisi | `save_own_employment_contact_service` | **Hayır.** Kendi kuralı: "kayıt senin mi" | bilinmeyen kişi P0002, başkasının kaydı 42501 `authz.out_of_scope` (BL-444) |

Ek olgular:
- `authorization_coverage` üç fonksiyonu sınıflamış (`settings.people`, `settings.people`, `account.self`), ama yetki matrisinde bu üçünü sınayan satır yok.
- Onay ayarını web'de iki yer okuyor: Settings → General (`GeneralSettingsPage.tsx`) ve Employees çekmecesi (`employee-data.ts`).
- `save_own_employment_contact_service` bugün üyelik durumuna hiç bakmıyor: askıdaki ya da çıkarılmış kişi de kendi kaydına yazabiliyor.

### B2 için (zaten çekirdeğe soran üç fonksiyon)
Rota kapısı kaldırılabilir; fonksiyon kendi cevabını veriyor.
- `request_employee_preferred_name_service`: eylem `employee.request_preferred_name` (kişinin kendi kaydı; onboarding'deki kişi de isteyebilir). Başkasının ya da bilinmeyen kişinin kaydı: `42501 authz.out_of_scope`.
- `list_pending_preferred_names_service`: eylem `employee.decide_preferred_name` (izin `employees.manage`). Hiç karar veremeyen kişi `42501 authz.missing_permission`; liste yalnız karar verebileceği talepleri döndürür.
- `decide_employee_preferred_name_service`: eylem `employee.decide_preferred_name`. Kendi talebi ve üstü için `authz.rank`, kapsam dışı ve bilinmeyen için `authz.out_of_scope`.

### Önerilen değişiklik (yazılmadı)
1. `set_employee_name_settings_service` → `app_private.authorize(actor, w, 'settings.people')`. Eylem var (org, yazma, izin `settings.general.manage`). Yeni eylem gerekmez; ret `authz.*` olur.
2. `get_employee_name_settings_service` → çekirdeğe sorar. Bugünkü kural "`employees.read` izni olan okur". Buna uyan org kapsamlı bir okuma eylemi yok; iki yol:
   - (a) (Önerilen) yeni eylem `settings.people.read` (org, okuma, izin `employees.read`). Eylem sayısı 73 → 74.
   - (b) var olan `employee.references.read` (çekmecenin seçicileri; izin `employees.read`) yeniden kullanılır. Yeni eylem yok, ama ad başka bir şeyi anlatıyor.
3. `save_own_employment_contact_service` → kendi kaydı için "own" kapsamlı bir eylemle `authorize(…, target_person)`. Böylece bilinmeyen ve başkasının kaydı aynı cevabı alır (`42501 authz.out_of_scope`; BL-444 kapanır). İki yol:
   - (a) (Önerilen) yeni eylem `employee.save_own_contact` (own, yazma, `restricted_ok = true`: onboarding'deki kişi de kendi acil durum kişisini yazar). Eylem sayısı +1.
   - (b) `employee.request_preferred_name` yeniden kullanılır (aynı kapsam ve bayraklar), ad yanıltıcı olur.
   - İki yolda da davranış bir yerde daralır: askıdaki ya da çıkarılmış kişi artık yazamaz (`authz.not_active`). Bugün yazabiliyor.
4. Her biri için yetki matrisine satır, `authz_catalog` sabit listesi, `authorization_coverage` sınıfı ve pgTAP hücresi (önce kırmızı). Yeni eylem(ler) TS ikizine ve matris dökümüne de girer (B2).

### Bekleyen iki karar
- K-A: onay ayarının okunması için yeni eylem mi (2a), var olanın yeniden kullanımı mı (2b)?
- K-B: acil durum kişisi için yeni eylem mi (3a), yeniden kullanım mı (3b); askıdaki kişinin artık yazamaması kabul mü?

### Devir notu (bu oturumun bağlamı %60'ı geçti)
- B1 commit'i `d261e51b` (yerel dal `task/emp-001-b`, bu worktree). Ek iş aynı dala, **yeni bir migration dosyasıyla** (`20261001010000` …) yazılmalı; `d261e51b`'deki migration yeniden açılmamalı, inceleme onu dosya olarak okuyacak.
- Deneme düzeni hazır: `artifacts/nf-db/emp-001-b1/trial.sh` (yanında `builder_patch.sql`, `build.py`, `full-summary.txt`) (dosya başına oturum; migration + kurucu yaması dosyanın kendi `begin;` satırından sonra). İkinci migration eklenince betikteki `MIG` iki dosyayı sırayla vermeli.
- Fonksiyon gövdeleri `pg_get_functiondef` ile yerel veritabanından alınır; migration dosyasındaki son tanım her zaman canlı gövde değildir (nf-db hafızası: `excluded-and-owner-traps`).
- K4 sorusu (işaretsiz müdür) ve yukarıdaki iki karar koordinatörde.
