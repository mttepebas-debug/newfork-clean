# DB-2 API — Canlı yenileme lokasyon kanallarında

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| Schedule | EKRAN-01 DB-2 (API + web aboneliği) | nf-backend / web hattı | R2 | nf-guvenlik ONAY @f518060f, D-1 sonrası ONAY @930400db | 2026-10-06 |

## Sonrası için
- Kural: gerçek zamanlı yayın `schedule:invalidation:<workspace>:<lokasyon>` kanalına, lokasyon başına ayrı gider; yükte yalnız o lokasyon, kişi / taslak / vardiya kimliği yok (`schedule-service.ts` `broadcastScheduleInvalidation`).
- Tuzak: düzenleme oturumu ve taslak 4 lokasyona kadar kapsayabiliyor; yükte `location_ids` dışındaki her kimlik alanı da öbür lokasyona sızar, süzülmeli ya da silinmeli.
- Kalıp: canlı yenilemeyi e2e'de `page.waitForRequest` ile (yeniden çekilen GET) ölçmek; olumsuz taraf için aynı bekleme + boş liste (`e2e/flows/schedule-live-channels.spec.ts`).
- Ölü uç: `POST/PATCH/DELETE /schedule/pending-ops` web'den çağrılmıyor (D-2); `useScheduleRealtime` `activeDraftId` okunmuyor, W-1b'de silinecek (D-3).
- Ölçüm: e2e tam paket 45/45 (13.9m), api 993, web 2184 (+1 atlanan) (2026-10-06, `a4114c87`).

## Rapor

**Karar:** nf-guvenlik ONAY @f518060f (R2); D-1 düzeltmesi sonrası doğrulama: ONAY @930400db
**İzin:** R2 — gönderildi (sha ve CI numarası posta kutusundaki raporda)
**Risk:** 🟢 başka lokasyonun kimliği, taslağı ve vardiya kimlikleri artık hiçbir kanala gitmiyor; e2e eski kodla düşüp yeni kodla geçiyor
**Soru:** yok
**Sonraki:** W-1b'nin kalanı — sıcak dosya `SchedulePage.tsx` arayüz hattında; pano "SchedulePage tutuyor" kalkınca girerim

## 1. Nerede duruyor
Parça 1 bitti ve main'de. DB-2 migration'ı (8fec3a7d) main'e girdikten sonra rebase edildi.

## 2. Ne yapıldı (öncesi → sonrası)
- **Öncesi** (DB-2 main'e girdikten sonra, bu iş gelmeden): Schedule'da bir müdür kaydedince başka kimsenin ekranı kendiliğinden yenilenmiyordu. API eski, workspace çapındaki kanala yazıyordu, DB-2 de o kanalı kapatmıştı.
- **Sonrası:**
  - API her değişikliği dokunduğu her lokasyonun kendi kanalına ayrı ayrı gönderiyor: `schedule:invalidation:<workspace>:<lokasyon>`, özel kanal, küçük harf.
  - Her kanaldaki yük yalnız o lokasyonu adlandırıyor. Taslak kimliği, kaydedenin kimliği ve vardiya kimlikleri (`changed_shift_ids`, D-1) çıktı.
  - Taslak kaydetme ve silmede lokasyonları API, yetki verildikten sonra taslağın kendi satırından okuyor (`schedule_drafts.location_ids`, workspace süzgeçli).
  - Lokasyonu bulunamayan yayın gönderilmiyor; ekran HTTP ile yeniden çekmeye devam ediyor.
  - Schedule ekranı, ekranda görünen her lokasyonun kanalına ayrı ayrı katılıyor; "All locations" görünümünde hepsine. Yükte taslak kimliği olmadığı için, görünen bir lokasyondaki her taslak değişikliği açık ekranı yeniliyor.
- **Örnek:** Ayşe (Kadıköy müdürü) Schedule → Draft selector → New Schedule (blank) → Save As ile bir taslak kaydediyor. Kadıköy'e bakan Zeynep'in (admin) ekranı tıklamadan yenileniyor. Yalnız Beşiktaş'ı gören Mehmet'in ekranına hiçbir şey gelmiyor.

## Kanıt
- Önce kırmızı:
  - API vitest: 5 test düştü (lokasyon başına kanal, lokasyonsuz yayın yok, taslak lokasyonu, publish ve auto-fill yükünde taslak/kişi kimliği yok).
  - Web vitest: 1 test düştü (lokasyon başına kanal).
  - D-1 için auto-fill yükü testi kırmızıydı, sonra yeşile döndü.
- Yeni e2e `e2e/flows/schedule-live-channels.spec.ts` (Zeynep / Mehmet / Ayşe, üç ayrı tarayıcı):
  - Eski kodla düştü: "page.waitForRequest: Timeout 15000ms exceeded", yani Zeynep'in ekranı yenilenmedi.
  - Yeni kodla geçti.
- Tam e2e (db.lock, `f518060f` kodu): 45 passed (13.9m).
- Tam kapı `a4114c87`: lint + typecheck + test + build EXIT=0 (api 993, web 2184 + 1 atlanan, ui 9).
- `930400db` (D-1): api `src/schedule` 261/261, web realtime 5/5, typecheck + lint temiz.
- Rebase sonrası tam kapı: gönderimden hemen önce koşuldu (posta kutusundaki raporda).

## 3. Açık kalan ve nedeni
- **D-2 (backlog önerisi, leave: low / do: safe):** `POST/PATCH/DELETE /schedule/pending-ops` uçlarını web hiç çağırmıyor, yalnız GET var. Lokasyonsuz olanlar yayın göndermiyor; bu sözleşmeye uygun. Uçlar ya silinmeli (BE-1 gibi ölü uç) ya da bir ekran onları kullanmaya başlayınca lokasyon satırdan okunmalı.
- **D-3:** `useScheduleRealtime`'ın `activeDraftId` seçeneği artık okunmuyor; `SchedulePage.tsx:605` hâlâ geçiyor. Sıcak dosyaya dokunmamak için W-1b'de silinecek; W-1b listeme eklendi.
- Yerel git'te iki etiketli stash kaydı kaldı (`db2api-wip`, `db2-src-red`). İçerikleri commit'lerde duruyor. Silme komutunu izin katmanı reddetti; zararsızlar.

## 4. Ekranda ne değişti
Görünürde bir şey değişmedi. Schedule başka müdürün kaydında yine kendiliğinden yenileniyor, ama artık yalnız kişinin gördüğü lokasyonlar için.

## 5. Sırada ne var
- W-1b'nin kalanı: otomatik kayıt taslağı, Undo, hafta değişince düzenlemenin kendi haftasında kalması ve D-3. Sıcak dosya arayüz hattında olduğu için bekliyor.
- D-2: ölü pending-ops yazma uçları backlog'a.

Skills: superpowers:test-driven-development (yayın hedefi; API, web ve e2e önce kırmızı), superpowers:receiving-code-review (D-1 doğrulandı ve uygulandı; D-2/D-3 gerekçesiyle ertelendi), superpowers:verification-before-completion.

## İnceleme

### nf-guvenlik — ilk tur
KARAR: ONAY @f518060f

**Koordinatör için 5 satır**
- **Karar:** ONAY @f518060f. Sınıf R2. Kritik ya da Yüksek bulgu yok.
- **İzin:** Bu inceleme gönderim izni vermez. Kod iki ay önce girmiş olan DB-2 migration'ını (8fec3a7d) tamamlıyor; sıra kararı koordinatörde.
- **Risk:** 🟢 Başka lokasyonun kimliği ya da taslağı bir kanala `location_ids` veya `draft_id` alanıyla gitmiyor. Tek istisna, kullanılmayan bir yük alanındaki vardiya kimliği (bulgu D-1).
- **Soru:** Yok.
- **Sonraki:** D-1'deki tek alanın aynı dalda silinmesini öneriyorum. Engel değil.

---

# Güvenlik incelemesi: `task/ekran-01-db-2-api` @ f518060f

Bu commit Schedule ekranının canlı yenilemesini lokasyon başına kanala taşıyor. Ayşe Kadıköy'de bir taslak kaydedince Kadıköy'ü okuyabilen Zeynep'in ekranı kendiliğinden yenileniyor. Yalnız Beşiktaş'ı okuyan Mehmet'e hiçbir şey gitmiyor.

## Asıl soru: başka lokasyonun kimliği ya da taslağı bir kanala sızıyor mu?

**`location_ids`, `draft_id` ve `actor_user_id` için sızıntı yok.**
- `apps/api/src/schedule/schedule-service.ts:1258` her kanala yalnız kendi lokasyonunu yazıyor: `location_ids: [locationId]`.
- `draft_id` ve `actor_user_id` hem tipten hem 13 çağrı noktasından çıkmış.
- Kanal adı küçük harfe çevriliyor (1244-1245). Böylece migration'daki küçük harf kalıbıyla eşleşiyor; adres çubuğundan büyük harfli bir UUID gelse de yayın düşmüyor.
- Kanala kim katılabilir sorusunu migration belirliyor: `20261007080000_schedule_channels_are_per_location.sql` yalnız `rls_can(ws,'schedule.read',[loc])` diyenleri alıyor. Bu kural main'de duruyor.

**`changed_shift_ids` başka lokasyon bilgisi taşıyabiliyor.** Ayrıntı D-1'de.

**`week_start`:** Oturumun haftası, oturumdaki bütün lokasyonlara gidiyor. Bu kanalların okuyucuları zaten o oturumun bir lokasyonunu okuyabilen kişiler; hafta bilgisi yeni bir şey açmıyor. Kabul edilebilir.

## Bulgular

### Kritik
Yok.

### Yüksek
Yok.

### Orta
Yok.

### Düşük

**D-1: Çok lokasyonlu düzenlemede vardiya kimlikleri öbür lokasyonun kanalına gidiyor**
- **Nerede:** `schedule-service.ts:589` (mutateShift), `:625` (bulkDeleteShifts), `:662` (applyDefaultHours), `:1015-1017` (applyAutoFill).
- **Ne görüldü:** Oturum tabanlı yayınlar oturumun bütün lokasyonlarına gidiyor. `changed_shift_ids` lokasyona göre süzülmüyor. Yerel DB'de bir düzenleme oturumu 4 lokasyona kadar kapsayabiliyor (`max(cardinality(location_ids)) = 4`).
- **Örnek:** Owner, Kadıköy ve Beşiktaş'ı birlikte düzenliyor ve Ayşe'nin Kadıköy vardiyasını değiştiriyor. Yalnız Beşiktaş'ı okuyan Mehmet'in tarayıcısı Beşiktaş kanalından o Kadıköy vardiyasının kimliğini ve haftasını alıyor.
- **Etkisi:** Bugün somut bir zarar yok. Kimlikle çalışan yazma yollarının hepsi oturum sahibine ve kapsama bağlı:
  - `bulk_delete_schedule_edit_shifts_service` hem oturum sahibini hem `scope_set(...,'schedule.edit')` kapsamını sınıyor (canlı tanım okundu).
  - Bekleyen değişiklik (pending op) fonksiyonları da `holder_user_id` ile oturum sahibine bağlı.
  - Ama hafıza notum ([[checklist-grep-count-and-id-leak]]) bu alanı tam da "kimliği bilinmez" varsayımını kıran alan olarak işaretlemişti. DB-2 incelemesinin 3. notu da "Kadıköy kanalına Beşiktaş kimliği gitmez" diyordu.
- **Öneri:** Web bu alanı hiç okumuyor; yalnız tip denetiminde geçiyor (`useScheduleRealtime.ts:22,113-115`). En kısa düzeltme `changed_shift_ids`'i API yükünden ve web tipinden silmek. Alan, kullanılmayan bir veriyi taşıyor.
- **Güven:** Davranış kesin. Güvenlik açığı olarak 4/10; kimlikler tahmin edilemez ve kimlikle açılan bir yazma yolu bulamadım.

**D-2: Bazı yazmalar yayın göndermiyor**
- **Nerede:** `schedule-service.ts:788-792` (removePendingOp) ve `:747-751`, `:769-771` (add/updatePendingOp).
- **Ne görüldü:**
  - removePendingOp artık hiç yayın göndermiyor.
  - add/updatePendingOp, yükte `location_id` yoksa (update/delete işlemleri) göndermiyor.
  - Bir vardiyayı A lokasyonundan B'ye taşıyan update yalnız B'ye haber veriyor; A'nın ekranı HTTP ile yeniden çekene kadar eski kalıyor.
- **Etkisi:** Bugün kimseyi etkilemiyor. Web bu üç ucu (`POST/PATCH/DELETE /schedule/pending-ops`) hiç çağırmıyor; yalnız `GET` var. Sözleşme "lokasyonu bulunamayan yayın gönderilmez" diyor, kod buna uyuyor.
- **Öneri:** Backlog'a yazılsın. Bu uçlar ya ölü (silinmeli) ya da bir ekran onları kullanmaya başlayınca lokasyon satırdan okunmalı.

**D-3: Kullanılmayan bir hook seçeneği bekliyor**
- **Nerede:** `useScheduleRealtime.ts:29-30`.
- **Ne görüldü:** `activeDraftId` seçeneği artık okunmuyor ama tipte duruyor; `SchedulePage.tsx:605` hâlâ değer geçiyor. Yorumda "W-1b'de silinecek" yazıyor.
- **Öneri:** W-1b görev dosyasında bu silmenin yazılı olduğundan emin olunmalı; yoksa kalıcılaşır.

## Koordinatörün ayrıca sorduğu noktalar

**`draftLocationIds`'in servis rolüyle tabloyu doğrudan okuması:** Kabul edilebilir.
- Kimlik, yetkiyi zaten veren fonksiyonun sonucundan geliyor (`draft.id`, `result.draft_id`). İstemcinin gönderdiği bir değer kullanılmıyor.
- Sorgu `workspace_id` ile süzülüyor ve yalnız hangi kanala gidileceğini seçiyor; sonuç yükte yer almıyor.
- `delete_schedule_draft_service` satırı silmiyor, yalnız arşivliyor (`archived_at` atanıyor, canlı tanım okundu). Bu yüzden silmeden sonraki okuma lokasyonları buluyor.
- Taslakta silinmiş bir lokasyon kalmışsa ona da yayın gidiyor. Zararsız: o kanalı dinleyen yok, giden yalnız "yeniden çek" işareti.
- Servis rolünün tabloyu okuma izni yerelde doğrulandı (`has_table_privilege` = t; tablo, view değil).

**Yayın hatası yazmayı bozuyor mu:** Hayır.
- Her kanal kendi `try/catch/finally` bloğunda; `removeChannel` hatası da yutuluyor.
- `draftLocationIds` hata fırlatmıyor: postgrest hatayı `{error}` olarak döndürüyor, sonuç `[]` oluyor ve yalnız yayın atlanıyor.
- Vitest "yayın düşse de yazma başarılı" durumunu sınıyor.

**Web'de abonelik temizliği:** Doğru.
- Her kanal temizlik adımında ayrı ayrı kapatılıyor (`useScheduleRealtime.ts:86-87`); test 2 kapatma çağrısı bekliyor.
- Lokasyon listesi sunucudan gelen veriden `useMemo` ile kuruluyor (`SchedulePage.tsx:590-600`). Gereksiz yeniden abonelik döngüsü görmedim.
- Veri gelmeden liste boş; kanal açılmıyor.

**Kapsam ve testler:**
- Yalnız sözleşmedeki 5 dosya değişmiş; kapsam kayması yok.
- Yeni davranışın testi var. Lokasyon başına kanal testi, payload'daki `location_ids: [locationId]` satırı silinirse düşer. Taslak lokasyonu testi, `draftLocationIds` silinirse düşer. Web'de "taslak kimliği olmayan değişiklik açık taslağı yeniler" testi var. e2e'de Zeynep ve Mehmet senaryosu var.

## Kanıt

Hepsi 2026-10-06, worktree HEAD = f518060f.

| Komut | Sonuç |
|---|---|
| `git rev-parse HEAD` | f518060f; taban b8235c98 (origin/main'de) |
| `pnpm --filter @newfork/api exec vitest run src/schedule/schedule-service.test.ts` | 28/28 geçti |
| `pnpm --filter @newfork/web exec vitest run src/schedule/hooks/useScheduleRealtime.test.tsx` | 5/5 geçti |
| `docker exec supabase_db_newfork-clean psql … information_schema.columns` | `schedule_drafts.location_ids` var |
| Aynı yerde migration kaydı sorgusu | DB-2 migration'ı (20261007080000) yerelde uygulanmış |
| Aynı yerde `max(cardinality(location_ids))` | edit_sessions = 4, drafts = 4 (çok lokasyon gerçek) |
| `pg_get_functiondef(bulk_delete_schedule_edit_shifts_service)` | oturum sahibi + `scope_set` süzgeci var |
| `pg_get_functiondef(delete_schedule_draft_service)` | `authorize(...)` taslağın lokasyonlarıyla; arşivliyor, silmiyor |
| `grep changed_shift_ids apps/web/src` | yalnız tip denetiminde; hiçbir yerde okunmuyor |
| `grep pending-ops apps/web/src` | yalnız GET; POST/PATCH/DELETE çağrısı yok |

Koşmadım: typecheck, api `src/schedule` tamamı (261), tam e2e (45/45). Bunlar oturumun kendi iddiası; aynı şeyi ikinci kez kanıtlamak bir kararı değiştirmezdi.

## Hafıza notu (dosyaya yazılmadı)

**Lokasyon başına kanal ve çok lokasyonlu oturum.** Düzenleme oturumu ve taslak 4 lokasyona kadar kapsayabiliyor. Oturum tabanlı bir yayın lokasyon kanallarına bölündüğünde yükteki her kimlik alanını lokasyona göre süz ya da kullanılmıyorsa sil. `location_ids`'in süzülmesi yetmez; `changed_shift_ids` gibi yan alanlara da bak. Ayrıca yayını olmayan uç gördüğünde önce web'in o ucu gerçekten çağırıp çağırmadığını grep'le; pending-ops yazma uçlarının web'de çağıranı yok (f518060f).

**Dosya yolları**
- C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-dewdney-c78421\apps\api\src\schedule\schedule-service.ts
- C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-dewdney-c78421\apps\web\src\schedule\hooks\useScheduleRealtime.ts
- C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-dewdney-c78421\apps\web\src\views\SchedulePage.tsx
- C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-dewdney-c78421\supabase\migrations\20261007080000_schedule_channels_are_per_location.sql
- C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-dewdney-c78421\e2e\flows\schedule-live-channels.spec.ts

### nf-guvenlik — D-1 düzeltmesi doğrulaması
KARAR: ONAY @930400db

**Koordinatör için 5 satır**
- **Karar:** ONAY @930400db. Sınıf R2. D-1 kapandı, yeni bulgu yok.
- **İzin:** Bu inceleme gönderim izni vermez; sıra kararı koordinatörde.
- **Risk:** 🟢 Lokasyon kanalı artık öbür lokasyonun vardiya kimliğini almıyor. Başka hiçbir alan kaybolmamış.
- **Soru:** Yok.
- **Sonraki:** D-2 backlog'a, D-3 (`activeDraftId`) W-1b'ye, senin yazdığın gibi.

## Doğrulama: `git diff f518060f..930400db`

İki commit: a4114c87 ve 930400db. 4 dosya, 1 satır eklenmiş, 19 satır silinmiş.

**Yalnız `changed_shift_ids` gitmiş, başka hiçbir alan kaybolmamış.**
- API'de bu alan 7 yayın noktasından silinmiş: mutateShift, bulkDeleteShifts, applyDefaultHours, add/update/removePendingOp, applyAutoFill. Tipten de çıkmış.
- Bu 7 noktada geri kalan alanlar yerinde: `workspace_id`, `week_start`, `location_ids` ve `targets`.
- `targets` listelerinin hiçbiri değişmemiş.
- Web'de alan hem tipten hem tip denetiminden (`isScheduleInvalidationPayload`) çıkmış. `location_ids` denetimi ve kapanan parantezler doğru.
- `git grep changed_shift_ids 930400db -- apps packages e2e` hiçbir şey döndürmüyor; alan tamamen silinmiş.

**Test gerçekten kilitliyor.** Auto-fill testi (`schedule-service.test.ts` ~715-761) gönderilen yükü tam eşitlikle karşılaştırıyor. Alan geri eklenirse test kırmızıya düşer.

**a4114c87** web testindeki kullanılmayan `supabaseClient` import'unu siliyor. Davranış değişmiyor.

**Hatırlatma, yeni değil:** removePendingOp artık hiç yayın göndermiyor. Bu D-2'deki durumun aynısı; bu commit değiştirmedi.

## Kanıt

2026-10-06, worktree HEAD = 930400db, kirli dosya yok.

| Komut | Sonuç |
|---|---|
| `git diff --stat f518060f..930400db` | 4 dosya, +1 / −19 |
| `git grep -n changed_shift_ids 930400db -- apps packages e2e` | boş |
| `pnpm --filter @newfork/api exec vitest run src/schedule/schedule-service.test.ts` | 28/28 geçti |
| `pnpm --filter @newfork/web exec vitest run src/schedule/hooks/useScheduleRealtime.test.tsx` | 5/5 geçti |

Typecheck, lint ve `src/schedule` tamamını (261) yeniden koşmadım; bunlar oturumun kendi iddiası.

## Hafıza notu (dosyaya yazılmadı)

"Yükten alan sil" düzeltmesini doğrularken iki şeye bak:
- `git grep <alan> <sha>` boş dönmeli.
- En az bir test yükü tam eşitlikle karşılaştırmalı, böylece alan geri gelirse kırmızıya düşer.

`expect.objectContaining` ile yazılmış testler, geri eklenen bir alanı yakalamaz.

Dosya yolları:
- C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-dewdney-c78421\apps\api\src\schedule\schedule-service.ts
- C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-dewdney-c78421\apps\api\src\schedule\schedule-service.test.ts
- C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-dewdney-c78421\apps\web\src\schedule\hooks\useScheduleRealtime.ts
