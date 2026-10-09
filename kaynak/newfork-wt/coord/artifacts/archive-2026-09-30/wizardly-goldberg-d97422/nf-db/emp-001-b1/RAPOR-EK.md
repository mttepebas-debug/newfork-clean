# EMP-001 B1 eki: "her müdür bir lokasyonda kalır" + ad ayarı ve acil durum kişisi çekirdeğe soruyor (nf-db, 2026-09-30)

## 1. Nerede duruyor
Ek bitti, commit'li. Push edilmedi. Migration hiçbir yere kalıcı uygulanmadı.

| | |
|---|---|
| Dal | `task/emp-001-b1-ek` (yerel; **`task/emp-001-b` değil**, nedeni aşağıda) |
| Commit | `70a27ed1` (tabanı B1: `d261e51b`) |
| Worktree | `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\wizardly-goldberg-d97422` |
| Migration'lar | `supabase/migrations/20261001000000_a_manager_manages_where_they_are_assigned.sql` (B1, K4 düzeltildi) ve yeni `20261001010000_name_settings_and_own_contact_ask_the_core.sql` (BL-443, BL-444) |

**Dal neden farklı:** bu oturum kendi worktree'sine bağlı; önceki nf-db'nin klasörüne (`dreamy-sinoussi-7c5a4a`) yazmayı oturum koruması reddetti ("Do not write to other worktrees' files from this session"). Korumayı dolanmadım; B1 commit'inden yeni dal açtım. `task/emp-001-b` (`d261e51b`) dokunulmadan duruyor. `task/emp-001-b` bu dala ileri sarılabilir (fast-forward) ya da `nf-backend` doğrudan `task/emp-001-b1-ek` üstüne rebase eder.

**Seçim (görev madde 4):** BL-443/444 ayrı, ikinci migration dosyasında. K4 düzeltmesi B1 dosyasının içinde (yeni fonksiyon eklenmedi; yardımcı yeniden adlandırıldı, ikiz yok).

## 2. Ne yapıldı (etkisi)

### K4: müdür hiçbir yoldan lokasyonsuz kalamaz
Kural artık "Exclude from schedule" işaretine bakmıyor: Remote olmayan her manager'ın en az bir lokasyonu olur.

Örnek: Melis Kadıköy'ün müdürü ve vardiya alıyor (işaretsiz). Bir admin Employees çekmecesinde "Remove from Kadıköy" derse işlem reddedilir; Melis Kadıköy'de kalır. Dün bu işlem geçiyordu ve Melis'in yönettiği hiçbir yer kalmıyordu.

| Yol | Fonksiyon | Bugünkü cevap |
|---|---|---|
| "Remove" ile son lokasyon | `remove_employee_from_location_service` | `22023 employee.manager_location_required` (işaretli ya da işaretsiz müdür) |
| Rolün manager'a çevrilmesi | `update_employee_membership_role_service` | aynı ret (lokasyonsuz kişi, işaretli ya da işaretsiz) |
| Manager rolüyle davet | `prepare_employee_invitation_service` | aynı ret |
| Kayıt | `save_employee_service` | işaretli müdür: aynı ret. İşaretsiz ve Remote olmayan kişi: eski genel kural daha önce cevap verir (`22023 employee.location_required`), rolü ne olursa olsun |

- Yardımcının adı `app_private.keep_manager_at_a_location`; mesaj "a manager needs a location to manage". Hint aynı: `employee.manager_location_required`.
- Muafiyetler yeşil: işaretli sıradan çalışan lokasyonsuz kaydolur; Remote kişi lokasyonsuz kaydolur, manager yapılır ve manager olarak davet edilir.

### BL-443: üç fonksiyon izin kararını yetki çekirdeğinden veriyor
"Tercih edilen ad" onay ayarı (Settings → General'daki ayar; Employees çekmecesi de okur) ve kişinin kendi acil durum kişisi (Account → Employment).

| Fonksiyon | Eylem | Kim |
|---|---|---|
| `set_employee_name_settings_service` | `settings.people` (vardı) | owner ve admin (`settings.general.manage`) |
| `get_employee_name_settings_service` | **yeni** `settings.people.read` (org, okuma, izin `employees.read`) | owner, admin, manager (lokasyonsuz manager dahil: ayar workspace'in) |
| `save_own_employment_contact_service` | **yeni** `employee.save_own_contact` (own, yazma, `restricted_ok`) | yalnız kaydın sahibi; onboarding'deki kişi dahil |

Eylem sayısı 73 → 75. Ret artık `42501` + `authz.*`; `workspace.employees_required` ve `workspace.settings_required` söylenmiyor.

### BL-444
`save_own_employment_contact_service` bilinmeyen kişiye, başkasının kaydına ve başka workspace'in kaydına aynı cevabı veriyor: `42501 authz.out_of_scope`. Dün bilinmeyen kişi `P0002` alıyordu (kaydın var olup olmadığı anlaşılıyordu).

### Testler
Yöntem B1'dekiyle aynı: dosya başına ayrı `psql` oturumu, iki migration + kurucu yaması dosyanın kendi `begin;` satırından sonra, sonunda geri alınır, `ON_ERROR_STOP=1`.

- **Önce kırmızı (12:04 UTC, değişmemiş B1 migration'ıyla):** `a_manager…` 7, yeni dosya 12, `authz_catalog` 1, `authorization_coverage` 1 kırmızı hücre. Sonra kod yazıldı.
- **Tam paket (2026-09-30 12:12–12:19 UTC):** 155 dosya, 12.162 geçen test.
  - 144 dosya temiz.
  - 11 dosya kırmızı. Aynı 11 dosyayı migration'sız koştum (12:20 UTC): satır satır aynı sonuç (`diff` boş). Hepsi `ci-not-green.txt`'te, B1 raporundaki 11 dosyanın aynısı.
- **Yeni dosya** `name_settings_and_own_contact_ask_the_core.test.sql`: 25/25, `ci-green.txt`'e eklendi.
- `a_manager_manages_where_they_are_assigned`: 37/37 (K4'ün yeni hücreleri burada).
- **Yetki matrisi:** 8366 hücre; 8294 geçti, 72'si önceden bilinen TODO, TODO dışı kırmızı yok. Üç yeni satır: `settings.people`, `settings.people.read`, `employee.save_own_contact` (408 hücre).
- `authz_catalog` 10/10 (sabit liste 75; sayaçların hiçbiri artmadı), `authorization_coverage` 5/5, `retired_objects_stay_gone` 15/15, `browser_privileges` 9/9, `schedule_grid_read_budget` 17/17.
- `bash scripts/ci-green-guard.sh origin/main` = 0 (12:20 UTC, `origin/main` `d411d7a8`; main, B1'in tabanından beri `supabase/` altına dokunmamış).
- **Kalıcı iz yok** (12:21 UTC ölçümü): son migration `20260930190000`, eylem sayısı 74, `membership_managed_locations` tablosu yerinde, yeni yardımcı ve iki yeni eylem yok; workspace / kullanıcı / test kimliği sayıları koşudan önceki gibi (304 / 1165 / 4337).
- `db.lock` alındı (12:04) ve bırakıldı.

### Done when karşılığı
| Madde | Durum |
|---|---|
| K4 hücreleri (işaretsiz manager son lokasyondan çıkarılamaz; lokasyonsuz işaretsiz çalışan manager yapılamaz; muafiyetler) | yeşil |
| BL-443: matris satırı, katalog listesi, coverage sınıfı, pgTAP hücresi, önce kırmızı | tamam |
| BL-444 / 16b: iki hücre | yeşil (üçüncü hücre: başka workspace'in kaydı) |
| Tam paket, kırmızı küme migration'sız koşuyla aynı | tamam |
| Katalog sayaçları artmaz, liste 75 | tamam |
| `ci-green-guard` = 0 | tamam |
| Yerel DB'de kalıcı iz yok | tamam |

## 3. Açık kalanlar ve bilmen gerekenler
1. **Benim hatam:** tam paketi başlatırken `gh run list` bir main CI koşusu (36713156485) gösteriyordu ve beklemedim; ikisi 7 dakika birlikte koştu. İkisi de temiz bitti (CI yeşil, bende kırmızı küme değişmedi). Yük yüzünden düşen test olmadı, yeniden koşu gerekmedi.
2. **Kayıt yolunda işaretsiz müdür:** görev "dört yol da `employee.manager_location_required` ile reddeder" diyor. Kayıtta, işaretsiz ve Remote olmayan herkes için eski genel kural (`employee.location_required`) daha önce cevap veriyor; müdür lokasyonsuz kaydedilemiyor ama hint o. Sırayı değiştirmedim (iki ret de 22023; B2 ikisini de okunur cümleye çevirmeli). İstenirse: (a) (Önerilen) böyle kalsın; (b) manager için K4 cümlesi önce gelsin (kayıt fonksiyonunda sıra değişir, bir hücre).
3. **Bilerek kabul edilen daralmalar (acil durum kişisi):**
   - Erişimi alınmış kişi yazamaz: `authz.not_active` (görevde kabul edildi).
   - **Görevde yazmayan bir tane daha:** açık olmayan workspace'te (kurulumu bitmemiş taslak ya da kapanmış workspace) çalışan yazamaz: `authz.workspace_closed`. Owner kurulum sırasında yazabilir. Çekirdeğin her eyleminde olan kural; ayrı bir istisna yazmadım.
4. **Değişen mevcut testler (beklenti gevşetilmedi):**
   - `own_employment_record`: çalışanı kurulumu bitmemiş workspace'e elle koyuyordu; artık kurulum bitiriliyor (lokasyon, iş, owner'ın yasal adı). Ret cümlesi "Not allowed" (kod aynı, 42501).
   - `owner_employee_record`: aynı ret cümlesi.
   - Matris: müdürün lokasyondan çıkarılması hedefi `pl:ayse@K` → `pl:can@K` (tek lokasyonlu müdür artık çıkarılamıyor; bu bir izin kararı değil, kayıt kuralı). `expected()` içinde "kendi işini başkasının kaydında yapamaz" satırı onboarding satırının üstüne alındı; mevcut hiçbir hücrenin beklentisi değişmedi, yeni `employee.save_own_contact` satırı için gerekti. Aydan'a (onboarding) yasal ad girildi; acil durum formu onu istiyor.
   - B1'in test dosyasındaki "the core has 73 actions" hücresi silindi; eylem listesini birebir kilitleyen `authz_catalog` var, sayı her yeni eylemde elle değişecekti.
5. **Küçük ek:** `save_own_employment_contact_service`'in "kendi kaydı arşivli" cevabına hint eklendi (`P0002 employee.not_found`), kardeşi `request_employee_preferred_name_service` ile aynı.
6. **Lokasyon silme ve arşivleme yolu** kapsam dışı (backlog'a gidiyor): müdürün tek lokasyonu Settings → Locations'tan silinirse müdür lokasyonsuz kalır.
7. **`seed.sql`:** ortak yerel veritabanı seed değişikliklerini görmez; seed'de lokasyonsuz, Remote olmayan bir müdür varsa ve bir test onu kaydediyorsa kırılma yalnız CI'da çıkar. Yerelde seed satırlarıyla koşan dosyalar temiz.
8. **Skill'ler:** `test-driven-development`, `supabase-postgres-best-practices`, `verification-before-completion` çağrıldı. `supabase:supabase` ayrıca çağrılmadı (iş yalnız SQL ve pgTAP'ti).

## 4. Ekranda ne değişti
Bu dalda arayüz kodu yok; görünürde bir şey değişmedi. Migration'lar B2 ve B3 ile aynı pencerede girince:
- Employees çekmecesi → Locations: tek lokasyonlu bir müdürde "Remove from <lokasyon>" reddedilir (B2 okunur cümleyi gösterir).
- Employees çekmecesi → Access: lokasyonsuz (Remote olmayan) kişi Manager yapılamaz ve Manager olarak davet edilemez.
- Settings → General'daki ad onayı ayarı ve Account → Employment'taki acil durum kişisi aynı görünür; yalnız ret cevabının biçimi değişir.

## 5. Sırada ne var
1. `nf-backend` (B2) `task/emp-001-b1-ek` üstüne rebase eder; aşağıdaki sözleşme ekine göre rota kapılarını kaldırır, hint cümlelerini ve matris dökümünü yeniler.
2. `nf-guvenlik` incelemesi (B1 + ek + B2 + B3 tek dal), kullanıcıya ultrareview önerisi.
3. Migration'lar main'e alınmadan hemen önce uygulanır (iki dosya, sırayla); sonra `pnpm.cmd test:db`.
4. Backlog: lokasyon silme yolu (madde 6), `leave: medium / do: moderate`.
5. Madde 2'deki seçim için koordinatör kararı (beklemeden B2 yürüyebilir).

---

## B2 için sözleşme eki (nf-backend)

### K4'ün son hâli
- Ret: `22023`, hint `employee.manager_location_required`, mesaj **"a manager needs a location to manage"** (B1 raporundaki "excluded from the schedule" cümlesi geçersiz).
- Kural: Remote olmayan her manager en az bir lokasyon ister; "Exclude from schedule" aranmaz. Shared doğrulama kuralı da buna göre: `role === manager && !is_remote && location_ids.length === 0` → hata. İşaretli çalışan ve Remote kişi (manager olsa da) muaf.
- Geldiği yerler: "Remove from <lokasyon>" (tek lokasyonlu her müdür), rol değişimi (`PATCH …/employees/:id/role`), davet hazırlama, kişi kaydı (yalnız işaretli müdür; işaretsizde `employee.location_required` önce gelir). `create_employee_command_service` kayıt ve davet adımlarını çağırdığı için ondan da gelir.
- Okunur cümle işaretten söz etmemeli. Öneri: "A manager needs at least one location."

### Üç fonksiyonun yeni ret cevapları
Üçünde de izin reddi `42501` + hint; API eşlemesi bilinen kural: `authz.not_member` → 404, diğer `authz.*` → 403.

| Fonksiyon | Durum | Cevap |
|---|---|---|
| `get_employee_name_settings_service` | employee | `authz.missing_permission` |
| | üye değil | `authz.not_member` |
| | onboarding'deki ya da erişimi alınmış kişi | `authz.not_active` (çekirdeğin kodundan; ayrı hücresi yok) |
| | belge engelli | `authz.document_blocked` (çekirdeğin kodundan; ayrı hücresi yok) |
| `set_employee_name_settings_service` | manager, employee | `authz.missing_permission` |
| | üye değil | `authz.not_member` |
| | geçersiz değer | `22023 settings.preferred_name.invalid` (değişmedi) |
| `save_own_employment_contact_service` | başkasının kaydı, bilinmeyen kişi, başka workspace'in kaydı | `authz.out_of_scope` |
| | üye değil | `authz.not_member` |
| | erişimi alınmış kişi | `authz.not_active` |
| | açık olmayan workspace (owner dışında) | `authz.workspace_closed` |
| | kendi kaydı arşivli | `P0002 employee.not_found` |
| | yasal ad yok / eksik alan | `23514` / `22023` (değişmedi) |

- Artık gelmeyen hint'ler: `workspace.employees_required`, `workspace.settings_required`. Bu dalda (`d261e51b` tabanlı) `apps`, `packages`, `e2e` içinde bu iki adı ve eski cümleyi ("this record belongs to somebody else") arayan `.ts` / `.tsx` dosyası bulmadım (grep, 12:21 UTC).
- Onboarding'deki kişi ve belge engelli kişi acil durum kişisini yazabilir (`restricted_ok`).
- Rota kapıları kaldırılabilir: altı rotanın altısı da artık çekirdeğe soruyor (öteki üçü B1 raporunda).

### İki yeni eylem (TS ikizi `packages/shared/src/authorization.ts`)
| Eylem | Kapsam sınıfı | Etki | İzin | Bayraklar |
|---|---|---|---|---|
| `settings.people.read` | `org` | `read` | `employees.read` | hepsi false |
| `employee.save_own_contact` | `own` | `write` | yok | `restricted_ok = true`, ötekiler false |

`settings.people` değişmedi (org, write, `settings.general.manage`). Eylem listesi 75.

### Matris dökümünde (`authorization-matrix.expected.json`) değişecekler (B1 raporundakilere ek)
- Üç yeni satır: `settings.people` (hedef workspace), `settings.people.read` (hedef workspace), `employee.save_own_contact` (hedef kişi; `member` ve `restricted_ok`).
- Hedef `pl:ayse@K` yok; yerine `pl:can@K` (holder `can`, sınıf manager, `{K}`).
- Hücre sayısı 7958 → 8366.
- Döküm betiği migration uygulanmadan koşacaksa geçici kopyasına **iki** migration dosyası sırayla girmeli (B1 raporundaki yöntem), ardından `builder.sql`'deki `tests.excluded` bloğu.
- `expected()`'ın TS ikizinde sıra: "kendi eylemi, başkasının kaydı → deny" satırı `restricted` satırından önce gelir (SQL'de öyle).

---

## nf-guvenlik için

### Değişen yetki yüzeyi
- **Genişleyen dal yok.** `get_employee_name_settings_service` dün de `employees.read` izni istiyordu; bugün aynı izni çekirdek soruyor; okuyabilenler aynı (owner, admin, manager). `save_own_employment_contact_service` yalnız daraldı; `set_…` aynı kaldı.
- **Daralanlar:** acil durum kişisi — erişimi alınmış kişi (`not_active`), açık olmayan workspace'teki çalışan (`workspace_closed`). Bilinmeyen kişi `P0002` yerine `out_of_scope`.
- İki yeni `authz_actions` satırı; yeni `*_service` yok; üç fonksiyon `create or replace` ile yeniden tanımlandı (imza, dönüş tipi, SECURITY DEFINER, `search_path = ''` ve grant'lar aynı; grant yeniden yazılmadı, `browser_privileges` yeşil).
- `app_private.keep_manager_at_a_location` (B1'deki yardımcının yeni adı): SECURITY DEFINER, `search_path = ''`, public / anon / authenticated'dan geri alınmış. Yalnız okur ve reddeder. Tek fark: işaret koşulu kalktı, yani daha çok durumda reddeder.

### Bakılması gerekenler
- `employee.save_own_contact` `own` sınıfında: `authz_check` `own` için `owner_only`, izin ve rütbe dallarına girmez; "kendi kaydı mı" sorusunu `profile.user_id = actor` ile verir. Hedef kişi başka workspace'tense ilk dalda `out_of_scope` (durum kontrolünden önce).
- Fonksiyon gövdesindeki eski "belongs to somebody else" dalı silindi: `authorize` geçtikten sonra ulaşılamıyordu (ikiz kural kalmasın).
- `authorize` yazmalardan ve doğrulamadan önce çağrılıyor (üç fonksiyonda da ilk satır). `get_…` STABLE kaldı; `authorize` de STABLE.
- Yapısal hücre: üç gövde `service_actor_has_permission` içermez ve `app_private.authorize(` içerir (`name_settings_and_own_contact_ask_the_core.test.sql`, hücre 3).
- K4: `holder.class` çekirdeğin `actor()` fonksiyonundan; askıdaki müdür kurala girmez (B1'deki gibi). Remote müdür lokasyonsuz kalabilir (kullanıcı kararı: muaf) ve o durumda hiçbir yeri yönetmez (`nur` matriste bu kişi).
- Lokasyon silme yolu kapalı değil (bölüm 3, madde 6).

### Kanıt
- Matris: üç yeni eylem 17 kişi × hedefler, her hücre iki kez (giriş noktası + çekirdek); 408 hücrenin hepsi yeşil, bilinen açık yok.
- `name_settings_and_own_contact_ask_the_core.test.sql` 25 hücre: BL-444'ün üç hücresi (bilinmeyen, başka workspace, başkasının kaydı) aynı cevabı kilitliyor.
- Çıktılar (bu worktree'de): `artifacts/nf-db/emp-001-b1/full/*.out`, özet `full-summary.txt`, migration'sız karşılaştırma `nomig-summary.txt`, kırmızı ilk koşu `red/`.
