# G8a / BL-132 — arşivli lokasyon yetki çekirdeğinde canlı sayılmaz (R3)

Rol: nf-db. Dal `task/g8a` @ `3a538338` (iki commit: `9636cd2c` migration + testler, `3a538338` çekmece referans testi), `origin/main` `bd164bfb` üstünde; worktree `.claude/worktrees/optimistic-dewdney-c78421`. Push yok.
Migration: `supabase/migrations/20261003000000_an_archived_location_counts_nowhere.sql` — ortak DB'ye ve canlıya UYGULANMADI.

## Tazelik (2026-09-30, `origin/main` `e56d1989`; yerel DB = main, son migration `20261002000000`)
Hüküm: **değişmiş** (hedef aynı, yerler kaydı). Koordinatöre sunuldu; "A" onaylandı (KK-67).
| Yer | Bugün | Görev dosyasındaki hâl |
|---|---|---|
| `app_private.scope_set` | yalnız `deleted_at is null`; çağıran 31 | aynı |
| `public.live_location_ids` (şema `public`, `app_private` değil) | yalnız `deleted_at`; çağıran 9 | aynı |
| `authz_check` hedef denetimi | yalnız `deleted_at` | aynı; EK: kişi hedefli eylemde `places` (kişinin atamaları) süzülmüyordu |
| `actor()` | lokasyon okuyan `manages` dalı TEK (owner/admin); manager dalı = `works` (atamalar, süzgeçsiz) — EMP-001 B | "iki dal" |
| `actor_actions` | örnek lokasyonu `deleted_at is null` ile seçiyor | listede yoktu |
| `preview_schedule_publication_service` | satır içi arşiv reddi duruyor | aynı |
| Satır içi arşiv süzgeci (BL-423) | 18 (`location.archived_at is null` biçimi) / 46 (`public.locations` + herhangi `archived_at is null`); 29 yeniden üretilemedi | 29 |
| Arşivli lokasyon sayısı | 394 lokasyon, 1 silinmiş, arşivli-silinmemiş 0, silinmiş-arşivsiz 0 | 354 / 1 / 0 |

**Done when 1'in yeni hâli (kayıt oturumu için):** "Son tanımlarda `scope_set`, `actor()` (owner/admin dalı ve `works`, dolayısıyla manager'ın kapsamı), `authz_check` (hedef lokasyon denetimi ve hedef kişinin lokasyonları), `actor_actions` (örnek lokasyon) ve `live_location_ids` arşivli lokasyonu canlı saymaz; altısı tek yüklemi, `app_private.location_is_live(public.locations)` kullanır (pgTAP yapı hücresiyle gösterilir)."

## 1. Nerede duruyor
Bitti; `nf-guvenlik` incelemesini bekliyor. Açık karar yok.

## 2. Ne yapıldı (etkisi)
Örnek: Mert Settings → Locations'ta "Beşiktaş"ı arşivler.
- Beşiktaş'ın müdürü Ayşe Beşiktaş'ın Schedule'ını okuyamaz, düzenleyemez, yayımlayamaz; yalnız orada çalışan Emre'nin kaydını kaydedemez. Owner ve admin de arşivli lokasyonu hedefleyemez: silinmişle aynı, "hiçbir yerde sayılmaz".
- Kadıköy müdürü Kaan "Kadıköy + Beşiktaş" şablonunu artık görür ve adını değiştirir (Beşiktaş şablonda sayılmıyor, Q-C ile aynı).
- Mert arşivi geri alınca her şey kendiliğinden eski hâline döner (atamalar bitmediği için).
- Settings → Locations arşivli satırı owner ve admine göstermeye devam eder, owner geri alabilir (pre-mortem 1 kanıtlandı: tablo politikaları çekirdeğe sormuyor).
- Kural tek yerde: `app_private.location_is_live(location)` = `archived_at is null`. Yayın önizlemesinin kendi arşiv reddi kalktı; aynı cevabı (42501 + `authz.out_of_scope`) artık çekirdek veriyor.

**Teknik seçimler:**
- Tek yüklem, iki kolon kalır (arşiv geri alınabilir, silme alınamaz). "Canlı" = arşivlenmemiş.
- CHECK kısıtı EKLENMEDİ: "silinen her kayıt arşivlidir" kuralı zaten veritabanında, `app_private.guard_catalog_deletion_state` tetikleyicisinde ("Deleted items must remain archived", 23514; lokasyon, departman, iş). İkinci bir kopya ikiz kural olurdu. Hücre 25 bu kuralı sınıyor. Silinmiş-arşivsiz satır: yerelde 0. Canlıda ölçülmedi (canlı sorgu kullanıcı işi); tetikleyici her silme yolunda çalıştığı için 0 beklenir. Veri düzeltmesi gerekmedi.
- `location_is_live` `set search_path ''` taşır (kural); bu yüzden SQL içine gömülmez, satır başına çağrılır. `schedule_grid_read_budget` 17/17 (≤ 50 ms) yeşil.

### Done when — kanıt (pgTAP)
| Madde | Hücre |
|---|---|
| 1 | `archived_location_counts_nowhere` 24 (altı gövde de `location_is_live` çağırıyor, hiçbirinde `location.deleted_at is null` yok) |
| 2(a) | aynı dosya 4–8 (Ayşe: `schedule.read`, `schedule.edit`, `schedule.publish` → `out_of_scope`; Emre'nin kaydı → `out_of_scope`; kapsamı boş), 9 (uygulamanın ona verdiği lokasyon listesi Beşiktaş'sız), 10 (owner da hedefleyemez) |
| 2(b) | 20–23 (geri alınınca okuma, düzenleme, Emre, owner kapsamı döner; Kaan şablonu artık görmez) |
| 2(c) | 13–15 (Kaan görür, adını değiştirir, ad kalır) |
| 2(d) | 11–12 (owner ve admin kapsamı yalnız Kadıköy) |
| 2(e) | 16 (önizlemede kendi reddi yok) + `refusals_say_why` mevcut hücresi (arşivli lokasyonla önizleme → `42501 authz.out_of_scope`, migration'la yeşil) |
| 2(f) | 17–18 (owner ve admin arşivli satırı görür), 19 (owner geri alır) |
| 3 | `deleted_location_counts_nowhere`: arşivli Moda hücresi tersine döndü ("Ayşe Old kitchen'i görür") ve aynı sonucun üç liste beklentisi |
| 4 | `authz_catalog` 10/10, `authorization_matrix` 8294 ok / 0 kırmızı, `authorization_coverage` 5/5, `retired_objects_stay_gone` 15/15 — tabanla aynı; silinen nesne yok |

Önce kırmızı (migration'sız, 10:50–10:51): yeni dosyada 13 hücre, `deleted_location_counts_nowhere`'de 1.

### Ölçümler (2026-09-30, ortak yerel DB; dosya başına oturum, migration + bütün kurucu işlem içinde, geri alındı; `db.lock` ile)
- Taban (origin/main testleri, migration'sız, 10:53–10:55): 144 dosya, 2 kırmızı: `bl052_document_lifecycle`, `bl052_document_notifications` (bu işten bağımsız, C1'de de aynıydı).
- Migration'lı (10:56–10:58): 145 dosya (yeni dosya dahil). Tabanla tek fark `employee_references_ask_the_core` hücre 5 (owner'ın çekmece lokasyon listesinde arşivli Arnavutköy vardı). KK-13'ün sonucu, beklenti düzeltildi, dosya yeniden koştu: kırmızı küme tabanla birebir aynı (2).
- `bash scripts/ci-green-guard.sh origin/main` = 0 (rebase sonrası). `ci-green.txt` yalnız büyüdü (+1 satır).
- Kalıcı iz yok: koşu öncesi ve sonrası aynı — son migration `20261002000000`, 75 eylem, 315 workspace, `location_is_live` yok.
- Değişen gövdeler canlıdan (`pg_get_functiondef`) üretildi; `artifacts/nf-db/g8a/build.mjs` her değişen parçanın gövdede tam bir kez geçtiğini doğrular. Web ve API kodu değişmedi.

## 3. Açık kalan ve nedeni
- Kalıcı uygulama (ortak DB + canlı): `nf-guvenlik` onayı ve `main.lock` penceresi bekliyor.
- Done when 5 (tam kapı + Templates e2e) ve 6 (KARARLAR Q-C, BL-132 kapanışı) koordinatör ve kayıt oturumunun.
- Satır içi süzgeçler (BL-423): dokunulmadı.

## 4. Ekranda ne değişir (migration uygulanınca; web kodu aynı)
- **Arşivlenen lokasyonun müdürü (Ayşe):** uygulamanın ona verdiği lokasyon listesinde (Schedule ve öteki ekranlardaki lokasyon seçimi) arşivli lokasyon yok; o lokasyonun Schedule'ı, şablonları ve yalnız orada çalışan kişilerin Employees kayıtları "yetki yok" / boş davranır — silinmiş lokasyondaki gibi, açıklama satırı olmadan (pre-mortem 2).
- **Employees → çekmece (owner/admin dahil herkes):** lokasyon seçicisi arşivli lokasyonu artık listelemez (silinmişte olduğu gibi). Kişinin arşivli lokasyondaki ataması kayıttan silinmez; çekmecenin kendi atama listesi onu yine gösterir.
- **Schedule → Templates, dışa aktarma planları:** arşivli lokasyon şablonun ve planın "kimin" hesabına girmez; öteki lokasyonların müdürü bu şablonları görür ve yönetir.
- **Settings → Locations:** değişmez; arşivli satır görünür, Restore çalışır.
- Owner'ın "ne yapabilirim" listesi (`actor_actions`): örnek lokasyon artık canlı olandan seçilir; görünür değişiklik beklenmez.

## 5. Sırada ne var / yolda bulunanlar
1. `nf-guvenlik` (R3, zorunlu); ultrareview önerisi koordinatörde.
2. BL-423: 18/46 satır içi süzgeç — kural çekirdeğe geçtiği için ikizleşiyor.
3. Backlog adayı (leave: low / do: safe): `employee_references_ask_the_core` ve `read_employee_references_service` yorumları "the archived one included" diyor mu, bakılmalı; bu dalda yalnız test beklentisi değişti. Fonksiyonun içinde ayrıca `location.deleted_at is null` süzgeci duruyor (kapsamla birlikte gereksiz, zararsız — BL-423 ailesi).
4. Pre-mortem 2 (müdüre açıklama) ayrı iş, bu dilimde değil.

## G8b ile çakışma
G8b (BL-254, arşivli iş ve vardiya tipi adı) okuma modellerinin iş/vardiya tipi filtrelerine dokunuyor (`reads_know_management_and_owner` migration'ının son tanımları, web `schedule/*`). G8a bu fonksiyonların hiçbirini yeniden tanımlamadı: değişen yalnız `scope_set`, `actor`, `authz_check`, `actor_actions`, `live_location_ids`, `preview_schedule_publication_service` ve yeni `location_is_live`. Dosya çakışması yok; ortak nokta tek: iki iş de "arşivli" anlamını tanımlıyor (G8a lokasyonda "hiçbir yerde sayılmaz", G8b işte "adı her yerde okunur"). Aynı kelime iki farklı kural — G8b'nin görev notuna yazılmalı. G8b'nin migration adı `20261003000000`'dan büyük olmalı.

## nf-guvenlik için
- **Yüzey:** yetki çekirdeği (her `scope_set` çağıranı: 31 fonksiyon; her `authz_check` çağrısı). Yeni eylem, grant, politika yok; imzalar ve dönüş tipleri aynı. Yeni fonksiyon `app_private.location_is_live(public.locations)`: SQL, `immutable`, `search_path ''`, `revoke all … from public` (`stored_primary_job` ile aynı kalıp).
- **Bakılmasını istediğim yerler:**
  1. `actor().works` artık yalnız canlı lokasyonları taşır. `works`'ü dışarıda okuyan tek yer `resolve_workspace_context_service` (web'e giden `location_ids`); `manages` manager'da `works`'e eşit. Hücre 9 kilitliyor.
  2. `authz_check` kişi dalı: hedef kişinin yalnız canlı lokasyonları sayılır. Arşivli lokasyonda kalan kişi, kimsenin kapsamında değil (ne `any` ne `all` erişimi) — silinmiş lokasyondaki kişiyle aynı. Owner/admin `org` erişimi bundan etkilenmez (kişinin hiç canlı lokasyonu yoksa `cardinality(places) = 0` → `out_of_scope` yalnız `org` olmayan erişimde).
  3. Hedef denetimi: arşivli lokasyon hedefi bilinmeyen lokasyonla aynı cevabı alır (`out_of_scope`) — "bilinmeyen ve kapsam dışı aynı cevap" korunur.
  4. `live_location_ids` bilinmeyen id'leri korumaya devam eder (yalnız bilinen ve canlı olmayanı düşürür) — davranış eskisiyle aynı, yalnız "canlı değil" tanımı genişledi.
  5. Önizlemeden silinen satır içi red: önce çekirdek (`authorize` lokasyon başına, fonksiyonun ilk satırları) çalıştığı için cevap sırası değişmedi; `refusals_say_why` hücresi aynı cevabı gösteriyor.
- **Fail-open arayışı:** yeni muafiyet yok; tersine, arşivli lokasyon her yerde kapalı.
- **Deneme düzeni:** `artifacts/nf-db/g8a/trial2.sh <klasör> <mig|none> <kök> <all|dosya…>`; taban ağacı `artifacts/nf-db/g8a/base/` (`git archive origin/main`), özetler `full-base/summary.txt`, `full-mig/summary.txt`.

## Y1 düzeltmesi (nf-guvenlik DEĞİŞİKLİK İSTENDİ @3a538338 → `8c654abf`)
**Sorun:** lokasyon arşivlenince orada ataması süren herkesin kaydı (owner'ınki dahil) hiçbir yoldan kaydedilemiyordu.
**Düzeltme** (`save_employee_service`, aynı migration dosyasının sonuna eklendi; canlı gövdeden, `build.mjs`):
- Kayıt, canlı olmayan lokasyondaki VAR OLAN atamaya dokunmaz: gönderilse de gönderilmese de yerinde kalır. "Canlı mı" ve kapsam sorusu yalnız eklenen ve bırakılan canlı lokasyonlara sorulur.
- Arşivli lokasyonu yeni eklemek hâlâ ret (42501).
- "En az bir lokasyon" ve "birincil lokasyon atanmış olmalı" kontrolleri kalan (arşivli) atamayı da sayar.
- Birincil işaret eskisi gibi gönderilen `primary_location_id`'yi izler. Çekmece okuduğunu gönderdiği için arşivli birincil yerinde kalır; kullanıcı açıkça başka lokasyonu birincil seçerse birincil oraya geçer. Arşivli lokasyonu birincil yapmaya ayrıca engel konmadı (not).
- "Remove from <location>" (C yolu): arşivli lokasyonda ret kalır (42501, silinmiş lokasyondaki gibi; çekmecenin `removable` bayrağı da çekirdekten `false` geliyor). Kod değişmedi, hücreyle kilitlendi. Ürün sorusu çıkmadı.

**Hücreler** (`archived_location_counts_nowhere` bölüm 5, 27–36; main tabanında 21 kırmızı, dalda 36/36):
| Yol | main | dal |
|---|---|---|
| A owner, Deniz'i Beşiktaş'sız kaydeder; atama kalır | allowed ama atama biter → kırmızı | allowed, `BJK,KDK*` |
| B okunduğu gibi | 42501 | allowed |
| D owner kendi kaydını Beşiktaş'sız | allowed | allowed |
| E owner kendi kaydını okunduğu gibi (E1) | 42501 | allowed |
| F Kaan Deniz'i Beşiktaş'sız | atama biter → kırmızı | allowed, atama kalır |
| G Kaan okunduğu gibi | 42501 | allowed |
| Can (birincili Beşiktaş) okunduğu gibi | 42501 | allowed, birincil Beşiktaş |
| Arşivli Beşiktaş'ı Kaan'a yeni eklemek | 42501 | 42501 |
| C "Remove from Besiktas" | 42501 | 42501 |
| Geri alınınca Deniz ve Can orada, birincilleri aynı | kırmızı | yeşil |

**Tam paket** (11:22–11:25, geri alınan oturum, `db.lock`): 145 dosya, kırmızı küme tabanla birebir aynı (2, bl052); yeni dosya 36/36; matris, katalog, `schedule_grid_read_budget` tabanla aynı. `ci-green-guard.sh origin/main` = 0. Kalıcı iz yok (son migration `20261002000000`, 75 eylem, 315 workspace).

**N1 (ölçüldü, düzeltilmedi):**
- Important Dates: yazma politikası `app_private.can_manage_important_date`. Owner/admin rol sınıfıyla her zaman geçer; manager her lokasyonda `can_access_location` ister. Bu da çekirdeğe değil `membership_location_scopes` görünümüne bakar: atamalardan, canlılık süzgeci yok. Yani veritabanında Important Dates G8a'dan etkilenmez.
- Etki yalnız web'de olabilir: tam kapsamı olmayan kullanıcıya (manager) giden `location_ids` artık arşivliyi taşımıyor. `ImportantDatesSettingsPage.tsx:89` o listeyle düzenlemeyi açıyor. Arşivli lokasyonu da kapsayan bir tarihi manager ekranda düzenleyemeyebilir; ekranda denenmedi.
- Aynı ailede çekirdeğe sormayan ikiz kural: `can_access_location` / `membership_location_scopes` arşivli lokasyonu hâlâ sayıyor (BL-423'e).
- Çok lokasyonlu öteki yazıcılar:
  - `acquire_schedule_edit_session_service`, `save_schedule_edit_session_service`: çekirdek + satır içi arşiv süzgeci.
  - `create_schedule_export_schedule_service`, `update_schedule_export_schedule_service`: çekirdek.
  - `save_announcement_audience_service`: yalnız satır içi süzgeç, çekirdeğe sormuyor.
  - `create_employee_command_service`: kayıt servisini çağırır; bu düzeltmeyle kapsandı.
- Gözlem (düzeltilmedi): `remove_employee_from_location_service` birincil lokasyonu bırakılınca yeni birincili atama sırasına göre seçiyor; arşivli bir lokasyonu birincil seçebilir. Zararsız, BL-423 ailesi.

## Y2 düzeltmesi + ultrareview (`53c70344`)
Ultrareview (bulut, 2 bulgu) ve `nf-guvenlik` ikinci tur (Y2) aynı sorunu buldu. İkisi de doğrulandı, ikisi de düzeltildi. **Benim hatam:** 2(f) hücrem tabloyu tarayıcı gibi okudu, ekranın çağırdığı servisi değil; pre-mortem 1 servis yolundan geçti.

**Y2 / ultrareview 2 — Settings → Locations arşivliyi göstermiyordu.**
- Web'in iki okuması da aynı servisten geçiyor: Settings → Locations (`LocationsSettingsPage.tsx:80`) ve kurulum sihirbazı (`OwnerOnboardingPage.tsx:1924`). Yol: `listLocations` → `readSettings("locations")` → API → `list_settings_locations_service` (`organization-data.ts:234`). `grep` ile başka okuma bulunmadı.
- Arşivleme ve geri alma: `setLocationArchived` doğrudan tablo güncellemesi (`organization-data.ts:272`), RLS `locations_update_admin` (`settings.locations.manage` izni); çekirdeğe sormuyor.
- Düzeltme yalnız bu serviste, yorumlu: `settings.locations.write` (izni `settings.locations.manage`) yetkisi olan kişiye, `scope_set` sonucuna ek olarak workspace'in arşivli (silinmemiş) lokasyonları listelenir. Çekirdeğin kuralı başka hiçbir yerde gevşemedi.
- Hücreler (`archived_location_counts_nowhere`):
  - 19–20: owner ve admin arşivli Beşiktaş'ı listede görür.
  - 21: manager ve employee Settings → Locations'ı hiç okuyamaz (42501; bu okuma zaten yöneticilere kapalı).
  - 22: başka workspace'in arşivli lokasyonu listelenmez.
  - 23: admin de geri alabilir (ve yeniden arşivleyebilir).
  - Mevcut: owner geri alır.
  - Önceki migration'la 19–20 kırmızı, düzeltmeyle yeşil.

**Ultrareview 1 — dışa aktarma kuralına arşivli lokasyon sızdırma.**
- `update_schedule_export_schedule_service` yetkiyi `live_location_ids` ile süzülmüş listeye soruyor, kaydı süzülmemiş listeyle yapıyordu. G8a'dan sonra arşivli ve yönetilmeyen bir lokasyon yetki sorulmadan kurala yazılabiliyordu; geri alınınca başkasının lokasyonu o müdürün alıcılarına gidecekti.
- Düzeltme: kurala eklenen her lokasyon çekirdeğe sorulur. Yalnız kuralda zaten duran ve artık canlı olmayan lokasyon sorulmaz (Y1 ile aynı ilke).
- Oluşturma servisi zaten bütün listeyi soruyor; değişmedi.
- Hücre 24: Kaan kendi kuralına arşivli Beşiktaş'ı ekleyemez. Önceki migration'la kırmızı, düzeltmeyle yeşil. Main'de de yeşildi: açığı G8a açıyordu, main'de yoktu.

**Kanıt** (geri alınan oturum, `db.lock`):
- Tam paket 11:34–11:45 (dal CI'ı aynı anda koşuyordu, yavaştı): 145 dosya.
- Tabanla tek fark iki bl052 dosyası. Aynı iki dosya migration'sız şimdi yeniden koşunca aynı sonucu veriyor: zamana bağlı oynuyorlar, bu işten değil. Kırmızı küme migration'sız anlık koşuyla aynı.
- Y2 hücreleri sonradan eklendi; yalnız o dosya iki migration'la koştu: önce 3 kırmızı, sonra 42/42.
- `ci-green-guard.sh origin/main` = 0. Kalıcı iz yok.
