# Alan E — Schedule yazma (5 dosya)

Ölçüm: 23 Eylül 2026, main `41783c7`, ortak veritabanı `supabase_db_newfork-clean`. Beş dosyanın beşi de koşuldu. Kırmızılar baseline ile aynı çıktı (3 / 4 / 6 / 2 / 7+29 çalışmayan kontrol).
Denemelerin hepsi tek bir transaction içinde yapıldı ve `rollback` ile geri alındı. Hiçbir repo dosyasına dokunulmadı. Deneme dosyaları `scratchpad/bl070-research/E/` altında:
`fixture.sql` (Kadıköy/Beşiktaş kurgusu), `x1…x8.sql`, `p1.sql`, `patch_c.sql`, düzeltilmiş test kopyaları `batch_fixed*.sql`, `assess_fixed.sql`, `pub_fixed_doc.sql`.

Kısa özet:

| Dosya | Kırmızı | Önerilen karar |
|---|---|---|
| weekly_schedule_batch | #1, #23, #25 | **Test düzelsin** (3/3). Düzeltilmiş kopya 28/28 yeşil |
| weekly_shift_availability_assessment | #3, #4, #7, #18 | #7, #18 **Test**. #4 **Test + mesaj için Repo**. #3 **Ürün kararı**: saatsiz vardiya durumu silinsin (önerim) |
| schedule_time_source | #31–34, #38, #40 | **Ürün kararı** (#3 ile aynı kök). Önerim: bu senaryolar silinsin |
| weekly_assignment_candidates | #5, #19 | #19 **Repo** (BL-092 ile aynı kök). #5 **Test + mesaj** |
| schedule_publication | #5–11 (+29 hiç koşmayan) | **Test düzelsin**. Düzeltilmiş kopya 41/41 yeşil. BL-096'daki "bayat önizleme" gerçek bir hata değil, zincirleme sonuç |

---

### weekly_schedule_batch

**Ekrandaki karşılığı:** Schedule → haftalık grid → bir vardiyayı kopyalayıp Ctrl+V ile Paste Mode'da birkaç hücreye yapıştırmak. Ya da vardiya editöründe adet 1'den büyükken aynı vardiyadan birkaç tane oluşturmak (`SchedulePage.tsx:1878`, `:2892`). Bunlar tek bir "toplu kayıt" komutuyla gider (`create_schedule_shifts_batch_service`). Komut ya hepsini kaydeder ya hiçbirini. Örnek: Ali'nin Pazartesi 18–20 Lunch vardiyası Salı ve Çarşamba'ya yapıştırılır. Biri reddedilirse diğerleri de kaydolmaz.

**Test ne iddia ediyor (kırmızı kontroller):**
- #1 "later stale assessment rolls the whole command back": ikinci parçanın onayı bayatsa bütün komut geri alınır. Beklenen kod 40001.
- #23 "confirm policy cannot use an earlier conflict fingerprint": eski bir onay yeni bir çakışma için kullanılamaz. Beklenen kod 40001.
- #25 "batch retains the canonical acceptance audit": denetim kaydındaki onay notu "Availability conflict confirmed by manager." olmalı.

**Eski davranış (9 Eylül; `20260909042100_weekly_schedule_acceptance.sql`, `20260909041900_…assessment.sql`):**
Yazarken yalnız üç şeye bakılıyordu: müsaitlik, onaylı izin ve saat. Aynı kişiye çakışan iki vardiya yazılabiliyordu. Bu çakışma ancak yayında sert engel olarak görünüyordu. Bayat onayda hata kodu 40001'di. Varsayılan müsaitlik politikası "warn" idi.
- S1: Mehmet (yönetici) Ali'ye Pazartesi 18–20 ve 17–20'yi aynı yapıştırmada verir. Eskiden ikisi de taslağa girerdi, yayın engellerdi.
- S2: Onay penceresi açıkken Ali müsaitliğini değiştirir. Eskiden 40001 dönerdi ve komut geri alınırdı. Ama 40001 bazı PostgREST sürümlerinde otomatik yeniden deneniyor, yani karar arayüze hiç ulaşmayabilirdi.
- S3: Ali'nin müsait olmadığı Pazartesi'ye onaylı yapıştırma. Denetim notu "Availability conflict confirmed by manager." olurdu.

**Ne değişti:** Değişiklik BL-064 ile geldi (15 Eylül, commit `7a35dbc`). Brief'teki "22 Eylül, commit 7706966" bilgisi eksik: 7706966 kuralı getirmedi, yalnız başka bir testi (schedule_time_source) buna uydurdu. Kural 15 Eylül'den beri var.
- 40001 → PT409 (`20260915075033_bl064_schedule_conflict_result.sql`). Yazılı gerekçe: "A business confirmation is not a serialization failure. PostgREST versions with automatic 40001 retries otherwise never return this decision to the UI."
- Tek "çakışma hakemi" (`assess_weekly_shift_availability`) artık vardiya çakışmasını, yol süresini, dinlenmeyi ve kapalı lokasyonu da ölçüyor (`20260915081826_bl064_conflict_severity.sql`). Aynı kişiye saatleri kesişen iki vardiya, ayarlardan yumuşatılamayan bir sistem engeli. BL-064 planı §5: "Gercek zaman overlap'i: ayni employee'ye saatleri kesisen iki shift."
- Not metni "Schedule conflict confirmed by manager." oldu (migration satır 263). Sebep: onay artık yalnız müsaitliği değil kapanış, yol ve belge çakışmalarını da kapsıyor.
- Varsayılan "Require confirmation" oldu (migration satır 17–19; plan §6 tablosu).

**Yeni davranış:**
- S1: ikinci parça 23514 "Employee already has an overlapping shift." ile reddedilir ve komutun tamamı geri alınır. #1 bu yüzden yanlış sebeple kırmızı. Testin kurgusu (18–20 ile 17–20) bayat onaya varmadan çakışmaya takılıyor.
- S2: PT409. API iki kodu da aynı şekilde işliyor ve 409 `availability_review_required` dönüyor (`apps/api/src/schedule/schedule-routes.ts:3430`).
- S3: not "Schedule conflict confirmed by manager." olur.

**Hedefe göre doğrulama:** Yeni mantık doğru yönde. Bir kişi aynı anda iki vardiyada olamaz. "Yönetici uyarı alır, isterse üzerine yazar" hedefi "Require confirmation" varsayılanıyla birebir örtüşüyor. PT409 teknik olarak doğru. Uygulamayı istenmeyen yöne sürükleyen bir şey yok.
Tek çekince bu dosyanın dışında: "çakışma yazıldığı yerde reddedilir" kuralı yalnız aynı düzenleme oturumu içinde çalışıyor. Aynı haftada başka lokasyonda yayınlanmış bir vardiya yazarken görünmüyor. Ayrıntısı "Alan geneli K1"de.
Ayrıca testteki "valid warn batch commits all assignments once" adlı kontrol artık varsayılan confirm altında koşuyor. Yani toplu kayıtta "warn" yolu hiç sınanmıyor.

**Kanıt:**
- Deneyerek: dosya koşuldu (3 kırmızı). Düzeltilmiş kopya `E/batch_fixed.sql` 28/28 yeşil. Kurgusu açıkça "warn" ile başlayan kopya `E/batch_fixed_warn.sql` 29/29 yeşil.
- Kodu okuyarak: canlı `prepare_weekly_schedule_assignment`, iki BL-064 migration'ı, `schedule-routes.ts:3417-3436`.

**Önerilen karar:** **Test düzelsin.**
- #1: ikinci parçayı çakışmayacak bir saate al (ör. Pazartesi 21–22, bayat onay). Bekle: PT409.
- #23: PT409 bekle.
- #25: "Schedule conflict confirmed by manager." bekle.
- Kurgu açıkça `conflict_rules.availability='warn'` ile başlasın, "warn → confirm" geçişi gerçekten sınansın.
- İki kontrol ekle: "yeni workspace'in varsayılanı confirm" ve "aynı toplu kayıttaki iki parça çakışıyorsa 23514". İkincisi eski kurgunun kazara sınadığı davranışı bilerek sınamak için.

Gerekçeler:
1. Üç kırmızının üçü de yazılı gerekçesi olan bilinçli değişikliklerden geliyor.
2. Düzeltilmiş kopya tamamen yeşil.
3. Repo'yu eski hale döndürmek, sahibin onayladığı BL-064 planıyla çelişir.

Repo düzeltmesi ancak ürün sahibi çakışan vardiyaların taslakta tutulabilmesini isterse doğru olurdu. Plan bunun tersini söylüyor.
`(leave: medium / do: safe)`

**Önceki karar ile karşılaştırma:** Önceki karar "TEST ×3" idi. Aynı kalmalı; üstüne iki küçük kontrol ve açık "warn" kurgusu eklensin.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** Yok. Küçük bir not: API artık hiç oluşmayan 40001 kodunu da bu mesaj için kabul ediyor (`schedule-routes.ts:3430`). Ölü bir tolerans. `(leave: low / do: safe)`

**Kullanıcıya sorular:** Yok.

---

### weekly_shift_availability_assessment

**Ekrandaki karşılığı:** Vardiya yazılırken arka planda çalışan tek "çakışma hakemi" (`assess_weekly_shift_availability`). Sonucunu şu yerler okur:
- Schedule grid'de sürükle-bırak hedefinin rengi (yeşil / turuncu / kırmızı)
- Vardiya editöründeki "Place shift / Cancel" onay penceresi
- Publish dialog'daki yayın özeti

Kuralların ciddiyeti Settings → Scheduling → Conflict handling'den gelir (`/app/settings/scheduling/conflicts`). Örnek: Ayşe Pazartesi müsait değil. Mehmet ona Pazartesi 18–20 yazınca turuncu olur ve bir onay penceresi açılır.

**Test ne iddia ediyor (kırmızı kontroller):**
- #3 "unknown shift hours never become available": saati bilinmeyen vardiya "saat doğrulanmalı" (`verification_required`) sonucunu vermeli. Şu an "onayla, geç" (`warning_requires_override`) veriyor.
- #4 "zero-length shift requires hours": 18:00–18:00 "saat doğrulanmalı" vermeli. Şu an "engellendi" (`blocked`) veriyor.
- #7 "default action is warn without confirmation": varsayılan "warn" bekleniyor, şu an "confirm".
- #18 "warn to confirm changes acceptance context": politika değişince onay parmak izi değişmeli. Varsayılan zaten confirm olduğu için değişmiyor.

**Eski davranış (9 Eylül, `20260909041900`):**
- Sonuç dört halden biriydi: geçersiz saat ya da onaylı izin → `blocked`. Saat eksik (saatsiz vardiya, başı sonu eşit saat, eski tip kayıt) → `verification_required`. Müsait olmadığı saat → `warning_requires_override`. Aksi halde → `allowed`.
- warning_policy doğrudan ayar sütunundan okunuyordu, varsayılanı "warn" idi.
- Senaryolar:
  - A) Saatsiz "Dinner" vardiyası (time_basis `unresolved`) → saat doğrulanmalı. Taslakta durabilir, yayında engellenir.
  - B) 18:00–18:00 → saat doğrulanmalı.
  - C) Ayşe'nin müsait olmadığı Pazartesi 18–20 → uyarı. Varsayılan "warn" olduğu için kısa bir bildirim çıkar ve kayıt geçer.

**Ne değişti (BL-064, 15 Eylül, `20260915081826`):**
- Sonuç artık kural bazlı ciddiyetten (allow / warn / confirm / block) hesaplanıyor. En yüksek ciddiyet kazanır.
- `time_source_unresolved` (saat bilinmiyor) → **confirm**. Yazılı gerekçe var. Plan §5: "Shift type default saati ve shift'in explicit saati yoksa zaman sonucu cozulmedigi icin Require confirmation uygulanir". Kanıt belgesi (`bl-064-slice-a-evidence`): "unresolved Confirm".
- Başı sonu eşit saat artık geçersiz saat sayılıp **block** oluyor (satır 81). Plan §5 bunu da istiyor: "Gecersiz veya esit baslangic/bitis saati". Ancak mesaj olarak saat dilimi geçişi için yazılmış cümle kullanılıyor: "These hours do not exist on this date in the selected timezone. Choose valid hours." Üstüne "Confirm shift hours before assigning or publishing." gerekçesi de ekleniyor.
- Varsayılan "confirm" oldu. warning_policy artık ciddiyetten türetiliyor. Çakışma kuralları da onay parmak izine dahil.
- Brief'te "migration satır 47–48 kendini aşamalı diye tanımlıyor" deniyor. Bu yorum BL-064'e ait değil: 9 Eylül migration'ının ilk iki satırı `create or replace` ile olduğu gibi taşınmış. BL-064'ün yarım kaldığına kanıt sayılamaz. Yine de BL-064 bir yeri gerçekten tutarsız bıraktı: yayın tetikleyicisi `check_schedule_time_source` hâlâ saatsiz atanmış vardiyayı reddediyor (A'ya bakın).

**Yeni davranış (aynı senaryolar):**
- A) Saatsiz vardiya taslağa girmek için bile onay istiyor. Mehmet "Place shift" derse yayın önizlemesi "hazır" diyor (daha önce kabul edilmiş not). Yayınla'ya basınca ham hata geliyor: "Confirm shift hours before publishing an assignment". **Çıkmaz sokak, deneyle ölçüldü (`E/x5.sql`).** Verilen onay bir işe yaramıyor, önizleme de yanlış bilgi veriyor.
- B) Engellendi, ama iki yanlış gerekçeyle. Böyle bir vardiya zaten hiçbir tabloya yazılamıyor: üç vardiya tablosunda da `CHECK (start_time <> end_time)` var. Web tarafı kendi kontrolünde doğru cümleyi kullanıyor: "Start and end time cannot be the same." (`apps/web/src/schedule/schedule-conflicts.ts:299-300`).
- C) "Place shift / Cancel" penceresi açılıyor, onay denetim kaydına yazılıyor.

**Hedefe göre doğrulama:**
- Varsayılan confirm hedefe uyuyor: "uyarı alır, isterse override eder". #7 ve #18 eski varsayılana yazılmış. Test düzelmeli.
- #4: "engellendi" doğru. Böyle bir vardiya kaydedilemez, plan da bunu sistem engeli sayıyor. Yanlış olan yalnız mesaj.
- #3 (saatsiz vardiya) asıl bulgu. **Bu durum bugün üründen üretilemiyor.**
  - Her vardiya tipinin varsayılan saati olmak zorunda. `guard_weekly_preference_type_hours` saatsiz tipi girişte reddediyor, saati boşaltan düzenlemeyi de reddediyor.
  - BL-081 22 Eylül'de "saatsiz vardiya tipi yok" diye kapandı (commit `8e491a9`).
  - Arayüz `unresolved` değerini yalnız saati olmayan bir tip için üretiyor (`shiftEditorState.ts:77,154`, `schedulePresetTargets.ts:63`). Yani arayüzden bu değere ulaşılamıyor.
  - Hiçbir SQL fonksiyonu `unresolved` üretmiyor.
  - Tek kapı, API'ye doğrudan `time_basis:"unresolved"` göndermek (`packages/shared/src/availability.ts:350` şeması hâlâ kabul ediyor).
  - 7 Eylül spec'inin gerekçesi şuydu: "Eski/import/default'suz tür için unresolved durum gerekir". Üç sebebin üçü de artık yok.
  - "Canlı veri yok" kuralına göre hem eski ("saat doğrulanmalı") hem yeni ("onayla") davranış, var olmaması gereken bir durumu idare ediyor.
- Ürün sahibi yine de saatsiz vardiya isterse: "saat doğrulanmalı" doğru, "onayla" yanlış olur. Ama deneyle ölçtüm, bu tek değişiklikle olmuyor (`E/patch_c.sql`). Şunlar da gerekiyor:
  - `prepare_weekly_schedule_assignment` bugün `verification_required` için de 23514 atıyor, taslakta izin vermeli.
  - Önizleme bulgusunun adı değişmeli.
  - Aynı kişinin yakındaki her vardiyası "Another assignment has unresolved hours" diye onay istemeye başlıyor. Bu gürültülü bir yan etki.

**Kanıt:**
- Deneyerek: dosya koşuldu (4 kırmızı). Kurgusu açık "warn" ile başlayan kopya (`E/assess_fixed.sql`) 35/37. Kalan iki kırmızı #3 ve #4.
- Varsayımsal düzeltme denemesi `E/patch_c.sql` + #3 → geçti. #4 → hâlâ block (doğru).
- Çıkmaz sokak: `E/x5.sql`.
- Kodu okuyarak: canlı fonksiyon (`E_assess_live.sql`), 9 Eylül ve 15 Eylül migration'ları, üç tablodaki CHECK kısıtları, `normalize_schedule_time_source`, `check_schedule_time_source`, web dosyaları.

**Önerilen karar:** **İkisi** (Test + Repo); #3 için ürün kararı.
- #7, #18: **Test.** Kurgu açıkça `conflict_rules.availability='warn'` ile başlasın. "Yeni workspace varsayılanı confirm" kontrolü eklensin. Testler eski uyumluluk sütununu (`availability_warning_policy`) değil asıl ayarı (`conflict_rules`) sürsün; bkz. alan geneli 5. `(leave: low / do: safe)`
- #4: **Test** "blocked" beklesin. **Repo** mesajı web ile aynı cümle olsun: "Start and end time cannot be the same.". Eşit saatlerde sahte "Confirm shift hours…" gerekçesi de düşsün. VARSAYIM: arayüz dili İngilizce olduğu için mesaj İngilizce önerildi (önceki kararda Türkçe "Başlangıç ve bitiş aynı olamaz" yazıyordu). `(leave: low / do: safe)`
- #3: **Ürün kararı** (Soru E-Q3).
  - Önerim: `unresolved` ve `legacy_unverified` saat kaynakları tamamen silinsin. API ve DB bunları reddetsin, #3 silinsin.
  - Diğer seçenek (saatsiz vardiya kalacaksa): Repo'da üç parçalı "saat doğrulanmalı" değişikliği yapılsın.
  - `(leave: medium / do: moderate)`: bugün yalnız doğrudan API ile tetiklenebiliyor, ama silmek birkaç test dosyasına dokunuyor.

**Önceki karar ile karşılaştırma:**
- (a) Eşit saatler: aynı kalsın; mesaj önerisi İngilizce.
- (b) Varsayılan: aynı (Test); üstüne testler asıl ayarı sürsün.
- (c) Saatsiz vardiya: **değişmeli.** "Repo → saat doğrulanmalı" kararı saatsiz vardiya diye bir durumun var olduğu varsayımıyla verilmişti; bu durum artık yok. Önerim silmek. Silinmezse düzeltme tek satır değil, üç yerde değişiklik ister (ölçüldü).

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:**
- Satır 57–58 "obsolete hard policy cannot hard-block preferences": eskimiş `availability_enforcement` sütununa tolerans iddia ediyor. Sütun hâlâ duruyor. Availability sayfasına `policy.enforcement` olarak gönderiliyor (`availability_read_before_calendar_service`). Ayarlar ekranında varsayılan değer olarak tutuluyor (`SchedulingSettingsPage.tsx:23`). "Canlı veri yok" kuralına göre sütun ve bu kontrol silinmeli.
- Satır 107 "approved leave stays blocking…" yalnız varsayılan ayar altında doğru. Onaylı izin ayarlardan yumuşatılabiliyor; bkz. alan geneli 6.

**Kullanıcıya sorular:** E-Q3 (saatsiz vardiya), E-Q7 (müsaitlik kuralının seçenekleri).

---

### schedule_time_source

**Ekrandaki karşılığı:** Vardiya saatinin nereden geldiği. Üç hali var:
- Elle yazılmış (explicit)
- Vardiya tipinden alınmış (type_default). Örnek: "Lunch 12:00–16:00". Tipin saati sonradan 13:00–17:00 yapılsa bile eski vardiya kaydettiği 12:00'yi korur.
- Bilinmiyor (unresolved)

Grid'deki vardiya kartı, Export, Publish ve Auto-fill bu bilgiyi kullanır.

**Test ne iddia ediyor (kırmızı kontroller):**
- #31 "unresolved assignment can be kept as draft"
- #32 "unknown hours remain null"
- #33 "preview blocks unknown assignment hours"
- #34 "publish cannot bypass unresolved blocker"
- #38 "regular edit RPC stores an unresolved open draft"
- #40 "auto-fill explains unknown source"

#32–34 #31'in, #40 da #38'in zincirleme sonucu.

**Eski davranış (9 Eylül):**
- Kimseye atanmamış açık vardiya (open shift) için müsaitlik kontrolü hiç çalışmıyordu (`prepare…` başta "çalışan yoksa çık" diyordu).
- Taslak tetikleyicisi "saat doğrulanmalı" sonucuna izin veriyordu. Yayın tetikleyicisi atanmış saatsiz vardiyayı reddediyordu. Önizleme `time_source_unresolved` diye sert bir bulgu gösteriyordu.
- Senaryolar:
  - (1) Ali'ye saatsiz "Lunch": taslakta durur, yayında sert engel.
  - (2) Saatsiz açık vardiya: serbestçe kaydolur. Auto-fill "Confirm shift hours before auto-fill" diyerek atlar.

**Ne değişti:**
- BL-064 saatsiz vardiyayı "confirm" yaptı.
- `prepare`'deki "çalışan yoksa çık" satırını sildi (migration satır 241–244). Açık vardiya da değerlendirilir oldu ve onay parmak izi istiyor.
- Önizleme eski `time_source_unresolved` bulgusunu süzüp yerine `schedule_conflict` koyuyor.
- Yazılı gerekçe: plan §5 ve kanıt belgesi ("unresolved Confirm"). Yayın tetikleyicisinin neden eski halinde bırakıldığına dair yazılı gerekçe yok.

**Yeni davranış:**
- (1) Taslağa girmek onay istiyor. #31 bu yüzden kırmızı: "A current availability acceptance is required". Onaylanırsa önizleme "hazır" diyor, Yayınla ham hata veriyor.
- (2) Açık vardiya da onay istiyor. #38: PT409 "Review the current availability assessment before saving". Ortada atanmış kimse olmadığı halde bu mesaj çıkıyor.
- 7706966 (22 Eylül) bu dosyaya iki kontrol ekledi: "taslak çakışan ikinci vardiyayı reddeder" ve "kartta saati gizlemek çakışmayı ortadan kaldırmaz". Hedefe uygunlar ve yeşiller.

**Hedefe göre doğrulama:** Dosyanın niyeti kendi içinde tutarlı: "taslak saati bilinmeyen vardiyayı tutabilir, yayın reddeder". Ama korunmaya çalıştığı durum bugün üründen üretilemiyor (önceki bölüme bakın). Tipten gelen saatin anlık görüntüsünü koruyan kontroller (1–30, 35–37, 41–44) değerli ve hedefle uyumlu.

**Kanıt:**
- Deneyerek: dosya koşuldu (6 kırmızı).
- `E/patch_c.sql` ile varsayımsal "saat doğrulanmalı + taslakta izin" düzeltmesi denendi. #31, 32, 34, 38, 39, 40 yeşile döndü. #33 bulgu adı yüzünden kırmızı kaldı. Hemen ardından satır 101'deki kurgu, aynı kişinin yanındaki vardiya "Another assignment has unresolved hours" onayı istediği için düştü.
- Çıkmaz sokak: `E/x5.sql`.

**Önerilen karar:** **Ürün kararı gerekli** (E-Q3; #3 ile aynı karar).
- Önerim: saatsiz senaryolar silinsin. Silinecekler #31–34, #38–40 ve satır 115'teki "direct published inserts cannot bypass the source guard". Yerine "API/DB `unresolved`/`legacy_unverified` reddeder" kontrolü gelsin. Geri kalan her şey kalsın.
- Saatsiz vardiya kalacaksa: Repo'da üç parça (saat doğrulanmalı, taslakta izin, bulgu adı), ayrıca komşu vardiya kuralı için karar. Testte #33 `schedule_conflict` + hard beklesin.
- `(leave: medium / do: moderate)`

**Önceki karar ile karşılaştırma:** Önceki karar "(c)'ye bağlı" idi. Bağ aynı. Ancak ölçüldü: (c) tek başına "saat doğrulanmalı" yapılsa bile bu dosya yeşile dönmüyor.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:**
- `legacy_unverified` ("eski, doğrulanmamış") durumu bugün hâlâ üretilebiliyor. Saat kaynağı boş bırakılıp "kartta saati gizle" işaretlenirse tetikleyici kaydı `legacy_unverified` yapıyor (`check_schedule_time_source`, `normalize_schedule_time_source`). Yayın tetikleyicisinde de "aynı eski kaydı yeniden yayınla" istisnası var.
- #19 (satır 51) "legacy pending update cannot discard time source" bu eski yolu sınıyor.
- Hepsi eski veri toleransı; silinmeli (alan geneli 2).

**Kullanıcıya sorular:** E-Q3.

---

### weekly_assignment_candidates

**Ekrandaki karşılığı:** "Bu kişi bu vardiyayı alabilir mi?" kontrolü (`weekly_assignment_candidate_check`). İki yerde kullanılıyor:
- Requests → Shift Changes: takas ve cover aday listesi ile onay (`shift_exchange_preview`)
- Line Up: yöneticinin aday listesi ve teklif kabulü

Schedule editörü bunu değil, doğrudan hakemi kullanıyor. Örnek: Ali Kadıköy Pazartesi 11–15 vardiyasını, Ayşe'nin Beşiktaş Pazartesi 11–15 vardiyasıyla takas etmek istiyor.

**Test ne iddia ediyor (kırmızı kontroller):**
- #5 "equal endpoints require verification": 18:00–18:00 "doğrulanmalı" vermeli. Şu an "uygun değil" (`ineligible`).
- #19 "explicitly excluded source is not counted twice": kişinin elden çıkardığı kendi vardiyası çakışma sayılmamalı. Şu an "uygun değil".

**Eski davranış:** Aday kontrolü çakışmayı kendisi hesaplıyordu. Bunu yaparken "hariç tut" listesine uyuyordu: takasta verilen vardiya, Line Up'ta taşınan vardiyanın kaynağı. Hakemin (9 Eylül) çakışma kuralı yoktu.
- (1) Takas: Ayşe, Ali'nin 11–15'i için kontrol edilirken kendi 11–15'i hariç tutulur → uygun.
- (2) Line Up: Ali'nin 09–12'si 10–11'e taşınır, kaynak hariç → uygun.
- (3) 18:00–18:00 → doğrulanmalı.

**Ne değişti:**
- BL-064 hakeme çakışma kuralını ekledi (15 Eylül).
- Hakem yalnız tek bir hariç kimlik tanıyor: hedef vardiyanın kendisi. Aday kontrolünün "hariç tut" listesi hakeme hiç iletilmiyor (`weekly_assignment_candidate_base` → `assess_weekly_shift_availability(w,emp,target||scheduled_date)`).
- Yazılı gerekçe yok; bu bilinçsiz bir yan etki.
- Eşit saatler için davranış bir önceki dosyadaki gibi değişti.

**Yeni davranış:**
- (1) ve (2): "uygun değil", gerekçe "Employee already has an overlapping shift." Kişi, elinden çıkardığı vardiyanın kendisiyle çakışıyor.
- Deneyle ölçtüm. Aynı çağrıda hariç kimlik hedefin kendi kimliği olarak da verilince sonuç "uygun" çıkıyor. Kök neden bu.
- BL-092 ailesi aynı kökten geliyor: `lineup_operations_v1` #96, `weekly_lineup_*`, `weekly_exchange_changed_terms`, `shift_exchange_travel_policy` #22.
- (3): "uygun değil", iki yanlış gerekçeyle ("Confirm shift hours…" ve "These hours do not exist…").

**Hedefe göre doğrulama:** Hedefte takas, cover ve release kriterleri lokasyon + job + müsaitlik. İki lokasyon arası takas da açıkça hedefte var (iki yetkilinin onayıyla). Aynı gün aynı saatteki takas en yaygın takas türü; bu gerileme onu bütünüyle kapatıyor. Uygulamayı istenmeyen yöne sürükleyen, testin değil kodun hatası. #5'te ise "uygun değil" doğru: böyle bir vardiya var olamaz. Yanlış olan yalnız mesaj.

**Kanıt:**
- Deneyerek: dosya koşuldu (2 kırmızı). Kök neden denemesi: aynı kurguda hariç kimlik hedef kimliği olarak da verilince "eligible" çıktı. Eşit saat gerekçeleri de ölçüldü.
- Kodu okuyarak: canlı `weekly_assignment_candidate_check` / `_base`, `weekly_exchange_candidate_check`, `shift_exchange_preview` (satır 26 ve 30'da hariç liste veriliyor).

**Önerilen karar:**
- #19: **Repo düzelsin.** Hakem bir hariç tutma listesi kabul etsin (ör. `_exclude_shift_ids`). Aday kontrolü `excluded`'ı ona geçirsin. Ortak hakemde tek bir düzeltme, atama tarafını, Line Up'ı ve takas tarafını birlikte düzeltir. Test doğru olduğu gibi kalsın. `(leave: high / do: moderate)`
- #5: **Test** "ineligible" beklesin. Mesaj Repo'da düzelsin (önceki dosyadaki #4 ile aynı iş). `(leave: low / do: safe)`
- Diğer seçenek: #19'u testte gevşetmek ancak ürün "kişi kendi verdiği vardiyayla çakışsın" derse doğru olurdu. Anlamlı bir senaryo değil.

**Önceki karar ile karşılaştırma:**
- #5: eşit saatler kararıyla aynı.
- #19: brief'te karar yoktu (BL-092 ailesi). Önerim Repo. Takas alanındaki ajanla aynı kök nedeni paylaşıyor.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:**
- Satır 70 "…even under obsolete hard policy": eskimiş sütuna tolerans (önceki dosyadakiyle aynı bulgu).
- Satır 142–143 "legacy consumers retain their original evaluator…" / "legacy wrapper is not silently switched": Line Up'ın eski müsaitlik sistemiyle (`assess_shift_availability`) çalışmaya devam ettiğini iddia ediyor, yani iki müsaitlik sistemi yan yana. BL-091 kararına bağlı; "canlı veri yok" kuralıyla çelişiyor.
- Satır 84 ve 104: aday yolunda yol süresi ve kapalı lokasyon her zaman "uygun değil". Settings → Conflict handling'deki ayar hiç okunmuyor; o ekranda ikisinin de varsayılanı "Require confirmation". Yani aynı kural Schedule editöründe onayla geçiliyor, takas/Line Up'ta kesin engel oluyor. Soru E-Q8.

**Kullanıcıya sorular:** E-Q8.

---

### schedule_publication

**Ekrandaki karşılığı:** Schedule → Publish.
- Yayın önizlemesi (Publish dialog): hangi lokasyonlar, eklenen ve çıkan vardiyalar, engeller, onay isteyen uyarılar.
- Yayınla / Unpublish.
- Yayın geçmişi.

Örnek: Mehmet Kadıköy haftasını yayınlar. Önizleme "Ali'nin çakışan vardiyası var" derse yayın engellenir.

**Test ne iddia ediyor (kırmızı kontroller):**
- #5 "overlap hard-blocks preview", #6 "overlap finding is canonical", #7 "hard blocker cannot be bypassed", #8 "hard blocked publish rolls back"
- #9 "closed location requires override", #10 "closure finding is canonical", #11 "soft finding requires reason"
- Ardından satır 53'te "stale publication preview" hatası transaction'ı düşürüyor, kalan 29 kontrol hiç koşmuyor.

**Eski davranış:** Kurgu, seed'deki demo haftasına dayanıyordu (Main ve Garden Room):
- Main'de Jordan Lee'ye aynı gün 15–23 ve 18–22 "Private booking" (çakışma)
- Garden Room'un kapalı olduğu gün Sam Rivera'ya vardiya

Önizleme `overlap` (sert) ve `closed_location` (yumuşak) bulgusu veriyordu. Yumuşak bulgu için yönetici en az 10 karakterlik bir gerekçe yazmak zorundaydı ("publication override reason required").
- (1) Çift rezervasyon → yayın engellenir.
- (2) Kapalı gün → gerekçe yazılır, yayınlanır.
- (3) Bayat önizleme → reddedilir.

**Ne değişti:**
- BL-064 (15 Eylül, `20260915085446`): yayın kontrolü yeniden kuruldu. Bütün çakışmalar tek hakemden geliyor, bulgu kodu `availability` ya da `schedule_conflict`.
  - Yazarken kabul edilmiş ya da önceki yayında kabul edilmiş çakışma, yayında yeniden sorulmuyor; "not" olarak özetleniyor.
  - Gerekçe elle yazılmıyor, otomatik doluyor ("Schedule conflict confirmed by manager.").
  - Plan §8: "Recap ek checkbox, typed reason veya uzun form istemez."
- Çakışma yazarken reddedildiği için seed'deki çakışan satır 22 Eylül'de ertesi güne taşındı (commit `96306a9`). Commit'teki not: "no test names that row". Bu test adını anmadan o satıra dayanıyordu.
- Belgeler tarafı:
  - Belge tipleri taslak olarak doğuyor ve taslak tipin gereksinim satırı sessizce yutuluyor (`guard_document_requirement_publication` null dönüyor).
  - Yayınlanmış tip düzenlenemiyor ("Published documents cannot be edited; unpublish first").

**Yeni davranış:**
- (1) Bu kurgu artık taslağa yazılamıyor. Ama yayın anında hâlâ oluşabiliyor. Taslak yazıldıktan sonra başka lokasyon yayın yaparsa çakışma doğar. Ölçüldü (`E/x1.sql`): Mehmet Kadıköy'de Ali'ye 13–15 yazdı, Beşiktaş'ta Ali'nin 12–16'sı vardı. Önizleme `hard_blocked`, bulgu `schedule_conflict` "Employee already has an overlapping shift.". Yani yayın anındaki çakışma bulgusunun hâlâ gerçek bir işi var.
- (2) Sam'in kapalı gündeki vardiyası demo yayınlanırken kabul edilmişti (seed sentetik bir onay yazıyor). Bu yüzden şimdi "not" ve `publish_ready`. BL-064'e göre doğru: kabul edilmiş şey yeniden sorulmuyor. Taslaktan sonra ilan edilen **yeni** bir kapanış ise `override_required` üretiyor. Onaysız yayın 22023 "Confirm the current schedule conflicts before publishing" ile reddediliyor.
- (3) Değişmedi.
- **BL-096'daki "bayat yayın önizlemesi" gerçek bir hata değil.** Zincirleme bir sonuç:
  1. Kurguda engel kalmadığı için #7'deki `throws_ok` Main'i gerçekten yayınladı. #11'deki de Garden Room'u gerçekten yayınladı. Hata beklenen yerde hata çıkmayınca yayın gerçekleşmiş oldu.
  2. Satır 50–53 eski önizleme parmak iziyle yeniden yayınlamaya çalıştı ve doğru olarak "bayat" diye reddedildi.
  3. Ölçüm: önizleme parmak izi yeniden hesaplamada değişmiyor, başka bir lokasyonun yayını da onu etkilemiyor (`E/p1.sql`).

**Hedefe göre doğrulama:** Yeni mantık doğru yönde: onay yazıldığı yerde bir kez alınıyor, yayın yeniden doğruluyor, sert engeller duruyor. Hedefle ilgili iki çekince var:
- (i) Yayın anındaki çakışma mesajı nerede ve ne zaman olduğunu söylemiyor. Kadıköy yöneticisi Ali'nin Beşiktaş vardiyasını göremiyor bile (K1).
- (ii) Saatsiz vardiyada önizleme "hazır" deyip Yayınla ham hata veriyor (önceki iki dosya).

**Kanıt:**
- Deneyerek: dosya koşuldu (7 kırmızı + 29 hiç koşmayan). Düzeltilmiş kopya `E/pub_fixed_doc.sql` **41/41 yeşil.** Kopyadaki değişiklikler:
  - (a) Taslaktan sonra Jordan'a (Main + Garden Room) Main'de Pazar 10–14 taslağı ve Garden Room'da Pazar 11–13 yayını.
  - (b) Taslaktan sonra Garden Room'a Çarşamba kapanışı; Sam o gün çalışıyor.
  - (c) #6 ve #10 `schedule_conflict` + mesajı arasın.
  - (d) #11 22023 "Confirm the current schedule conflicts before publishing" beklesin.
  - (e) Onay, yeni (`introduced`) bulguya verilsin.
  - (f) "override is audited" `reason='Schedule conflict confirmed by manager.'` sayısına baksın. Kabul edilmiş eski not da "Previously accepted schedule conflict retained." satırı yazıyor.
  - (g) Belge tipi `published` olarak oluşturulsun. Etki değişikliği unpublish → düzenle → publish ile yapılsın.
- Ayrıca: `x1.sql`, `p1.sql`.
- Kodu okuyarak: `weekly_schedule_publication_preflight`, `weekly_publication_decisions`, yayın fonksiyon zinciri (`E_publish_fns.sql`), seed.sql 331–420.

**Önerilen karar:** **Test düzelsin.** `(leave: medium / do: safe)` Gerekçeler:
1. Kırmızıların hepsi bilinçli iki değişiklikten geliyor: BL-064 bulgu sözleşmesi ve seed'den çakışmanın çıkarılması.
2. "Bayat önizleme" bu ikisinin zincirleme sonucu.
3. Düzeltilmiş kopya tamamen yeşil.

(g) belgeler alanına ait: tipin Schedule etkisini değiştirmenin doğru yolu "önce yayından kaldır" mı? Bunu belgeler alanı doğrulasın. Ürün yayınlanmış tipte etki değişikliğine izin vermek isterse, o bir belgeler Repo sorusu.

**Önceki karar ile karşılaştırma:** Önceki durum "karar verilmedi" idi. Şimdi Test. BL-096'nın bu dosyaya ait "bayat önizleme" parçası zincirleme sonuç olarak kapatılabilir.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:**
- Yok (yetki ve kapsam kontrolleri 25–27 hedefe uygun).
- Küçük: yayın fonksiyonundaki "gerekçe 10–500 karakter" dalı artık tetiklenemiyor, çünkü gerekçeler otomatik doluyor. Temel önizleme de `overlap` ve `time_source_unresolved` bulgularını hâlâ hesaplıyor ama bir üst katman bunları süzüp atıyor. İkisi de ölü yol. `(leave: low / do: safe)`

**Kullanıcıya sorular:** E-Q1, E-Q5 (alan geneli).

---

## Alan geneli bulgular

**Birden fazla dosyayı etkileyen ortak kök nedenler**

1. **Çakışma artık yazıldığı yerde ölçülüyor (BL-064, 15 Eylül).** Eski testler çakışmayı yayında yakalanacak bir şey sanıp kurgularında çift rezervasyon kuruyor: batch #1, publication #5–8. Kural doğru; testler düzelmeli.
2. **Saatsiz vardiya üretilemeyen bir durum.** Etkilenenler: assessment #3, time_source #31–40, `neighbor_time_unresolved` kuralı, `legacy_unverified`, web'deki istemci kopyası (`schedule-conflicts.ts:15,320`). Önerim hepsinin silinmesi (E-Q3). Silinirse dokunulacak yeşil testler: `bl064_conflict_severity` #34, `weekly_schedule_acceptance` #30, `availability_authoritative_assessment` 68 ve 77 (eski değerlendirici, BL-091), `schedule_default_hours_review`, `shift_exchanges_v1`, birkaç web testi. `(leave: medium / do: moderate)`
3. **"Hariç tut" listesi hakeme iletilmiyor.** candidates #19 ve BL-092 ailesinin tamamı buradan geliyor. Tek düzeltme ortak hakemde. `(leave: high / do: moderate)`
4. **Başı sonu eşit saat mesajı yanlış** (iki dosya). Web'deki cümle kullanılsın. `(leave: low / do: safe)`
5. **Aynı ayarın birden fazla kopyası var:**
   - `availability_warning_policy`: `conflict_rules.availability`'nin uyumluluk kopyası. Tetikleyici ikisini senkron tutuyor. Migration yorumu: "Compatibility… until all consumers use the conflict catalog".
   - `availability_enforcement` ve `conflict_policy`: eskimiş ama hâlâ Settings API'sinde duruyor. `availability_enforcement` Availability sayfasına giden veride de var. `conflict_policy`'yi yalnız ayar kaydı ve denetim fonksiyonu yazıyor/okuyor; ona bakarak karar veren bir kod yok (DB'de arandı).
   - Assessment #13 ve candidates #70 bu toleransı iddia ediyor.

   "Canlı veri yok" kuralına göre tek ayar (`conflict_rules`) kalmalı. `(leave: low / do: moderate)`

**Hedefle çelişen ama bu testlerde görünmeyen önemli yapılar**

6. **Onaylı izin yumuşatılabiliyor. Deneyle ölçüldü (`E/x4.sql`).**
   - Settings → Scheduling → Conflict handling → "Approved time off" satırında "Require confirmation" ve "Block" seçenekleri var (`ConflictHandlingSettingsPage.tsx:31-35`). DB de ikisini kabul ediyor (`conflict_rules->>'approved_time_off' in ('confirm','block')`).
   - "Require confirmation" seçilince Mehmet, Ali'yi onaylı izinli olduğu güne tek tıkla koyabiliyor. Vardiya kaydedildi.
   - Hedef açık: "Onaylanmış izin yumuşatılamaz."
   - **Repo:** seçenek kaldırılsın; kural sabit sert olsun (DB kontrolü yalnız `block`, ayar ekranında satır salt bilgi olsun ya da hiç görünmesin). Varsayılan zaten `block`. `(leave: high / do: safe)`
7. **Müsaitlik ayarı:** "Block" gerçekten sert (onayla geçilemiyor, ölçüldü). "Require confirmation" onayla geçiliyor (varsayılan). Hedef bu ikisini tarif ediyor. Kodda ayrıca iki seçenek daha var: "Allow" (hiç uyarı yok) ve "Warn" (yalnız kısa bildirim, onay yok). Soru E-Q7.
8. **Kendi kaydına vardiya:** Hem yönetici kendini hem owner kendini vardiyaya koyabiliyor (ölçüldü, `x4`, `x6`). Hedefe uygun. Açık noktalar kapsam modeline (K5) aktarıldı.
9. **Admin kapsamı:** Admin üyeliği her zaman "tüm lokasyonlar"a zorlanıyor (ölçüldü, `x8`). Hedefe uygun.

**KAPSAM MODELİ SORUSU**: G alanına girdi olarak somut senaryolar. Hepsi deneyle ölçüldü (`E/fixture.sql`).
Kurgu: Ali hem Kadıköy'de hem Beşiktaş'ta çalışıyor. Mehmet yalnız Kadıköy yöneticisi, Selin yalnız Beşiktaş yöneticisi.

- **K1: Başka lokasyondaki vardiya görünmüyor.** Beşiktaş'ta Ali Pazartesi 12–16 yayınlı. Mehmet Kadıköy'de Ali'ye Pazartesi 13–15 yazıyor.
  - Bugün: editör "allowed" diyor, hiç uyarı yok. Mehmet'in Schedule ekranında Ali'nin Beşiktaş vardiyası görünmüyor (okuma modelinde vardiya sayısı 0). Yayın önizlemesi "Employee already has an overlapping shift." ile sert engelliyor, ama nerede ve ne zaman olduğunu söylemiyor.
  - Bu bir kod açığı da. Hakem, aynı haftanın başka lokasyonlardaki yayınlarını tümden yok sayıyor (`s.scheduled_date not between schedule_week and schedule_week+6`). Oysa kodun kendi yorumu tersini söylüyor: "Other current publications remain relevant across locations". Owner boş bir oturumla yazsa bile aynı açık var (ölçüldü). Aynı açık yüzünden yol süresi ve dinlenme kuralları da aynı hafta içinde başka lokasyona karşı yazarken çalışmıyor.
  - Hedef belirsiz: Kadıköy yöneticisi Ali'nin Beşiktaş vardiyasını görmeli mi?
- **K2: Aynı gün iki lokasyon (yol süresi ve dinlenme).** Ali Beşiktaş'ta 12–16. Mehmet Kadıköy'de 16:30–20:00 yazıyor, yol süresi ayarı 60 dakika. Bugün yazarken uyarı yok, yalnız yayında yakalanıyor. Ayrıca yol ve dinlenme dakikalarının varsayılanı 0, yani kurallar kurulumda kapalı.
- **K3: Hafta kilidi bütün workspace için.** Mehmet haftayı düzenlerken Selin aynı haftayı açamıyor, "Another manager" çakışması alıyor. Kilit workspace + hafta başına tek (`schedule_edit_sessions_active_week_idx`). 4 dakikalık kira, sekme açık kaldıkça yenileniyor. Lokasyon bazlı yöneticiler birbirini bekliyor.
- **K4: Yöneticinin taslağını owner iki lokasyona birden yayınlarsa Beşiktaş silinir.** Mehmet'in oturumu yalnız kendi lokasyonlarını yüklüyor, bu yüzden taslağı yalnız Kadıköy vardiyalarını içeriyor. Owner bu taslağı Kadıköy + Beşiktaş için yayınlayınca Beşiktaş'ın yayınlı vardiyaları siliniyor. Önizleme `publish_ready` diyor; yalnız "removed: 1" sayısı var, engel ya da uyarı yok. Ölçüldü (`x7`).
- **K5: Yönetici, üstündekileri ve kendini vardiyaya koyabiliyor.** Owner'ın kaydı tüm lokasyonlara açık olduğu için Mehmet owner'ı görüyor ve Kadıköy'e yazabiliyor (ölçüldü). Mehmet kendi kaydına da yazabiliyor (ölçüldü). Kendi müsaitlik çakışmasını kendisi onaylamasını engelleyen bir kural yok (kod okuması). Hiyerarşi (owner > admin > manager) vardiya yazmada hiç uygulanmıyor.
- **K6: Takas ve Line Up'ta kendi vardiyasıyla çakışma** (#19). Kapsamdan bağımsız bir kod hatası, ama iki lokasyonlu takası (her iki yetkilinin onayı) doğrudan kilitliyor.

**Fikir ve tavsiyeler**
- Kadıköy grid'inde paylaşılan çalışanlar için nötr bir "başka lokasyonda meşgul" bandı: saat görünür, lokasyon görünmeyebilir. Yönetici ayrıntıyı görmeden çift rezervasyondan kaçınır.
- Yazarken yapılan kontrol, oturumun değiştirmeyeceği lokasyonların (aktörün kapsamı dışındakiler) aynı hafta yayınlarını da saysın. K1 ve K2 yayın yerine yazarken yakalanır. Kodun kendi yorumu zaten bunu vaat ediyor.
- Hafta kilidi lokasyon bazına insin.
- Bir taslak, içinde vardiyası olmayan bir lokasyon için yayınlanırsa önizleme en azından onay isteyen bir uyarı versin: "Beşiktaş'ta 1 vardiya kaldırılacak".
- Yayın anındaki çakışma bulgusu diğer vardiyanın saatini de söylesin (lokasyon kapsam kararına göre).

## Kullanıcıya sorular (alan geneli, önem sırasıyla)

1. **E-Q1 (KAPSAM MODELİ, K1/K2): Kadıköy yöneticisi, Kadıköy'de de çalışan Ali'nin Beşiktaş vardiyalarını görmeli mi?**
   - Neden soruyorum: bugün göremiyor, yazarken uyarı da almıyor. Çakışmayı yalnız yayında, nerede olduğunu bilmeden öğreniyor.
   - Seçenekler:
     - (a) Saat görünsün, ayrıntı görünmesin ("başka lokasyonda meşgul" bandı) ve yazarken engel.
     - (b) Diğer lokasyon vardiyaları salt okunur olarak tam görünsün.
     - (c) Bugünkü gibi kalsın.
   - Önerim (a): çift rezervasyonu yazarken önler, Beşiktaş'ın ayrıntılarını Kadıköy'e açmaz.
2. **E-Q2: Settings → Conflict handling'deki "Approved time off: Require confirmation" seçeneği kaldırılsın mı?**
   - Neden soruyorum: hedefiniz "onaylanmış izin yumuşatılamaz" diyor, ama bugün bu seçenek seçilince yönetici izinli güne tek tıkla vardiya koyabiliyor (ölçüldü).
   - Önerim: evet, kaldırılsın; kural sabit "Block" olsun.
3. **E-Q3: Saati olmayan bir vardiya hiç var olabilmeli mi?**
   - Neden soruyorum: her vardiya tipinin saati zorunlu (BL-081), arayüz saatsiz vardiya üretemiyor. Ama DB ve API bu durumu hâlâ taşıyor ve bu durum çıkmaz bir sokak: yönetici onaylıyor, önizleme "hazır" diyor, yayın ham hata veriyor.
   - Seçenekler:
     - (a) Hayır: durum tamamen silinsin, testleri de.
     - (b) Evet: "saat doğrulanmalı" olsun (taslakta durur, yayında engellenir). Bu üç yerde kod değişikliği ister.
   - Önerim (a).
4. **E-Q4 (KAPSAM, K3): Bir yönetici haftayı düzenlerken diğer lokasyonların yöneticileri aynı haftayı açamıyor. Kabul edilebilir mi?**
   - Seçenekler: (a) lokasyon bazlı kilit; (b) bugünkü gibi workspace bazlı.
   - Önerim (a).
5. **E-Q5 (KAPSAM, K4): Owner, yalnız Kadıköy'ü içeren bir yönetici taslağını Beşiktaş için de yayınlarsa Beşiktaş'ın vardiyaları silinir.**
   - Seçenekler: (a) taslak yalnız içinde vardiya olan lokasyonlar için yayınlanabilsin; (b) silinecek vardiya varsa onay istensin; (c) bugünkü gibi.
   - Önerim (b), sonra (a) değerlendirilsin.
6. **E-Q6 (KAPSAM, K5): Bir yönetici, üstündeki birini (owner/admin) vardiyaya yazabilmeli mi? Kendi müsaitlik çakışmasını kendisi onaylayabilmeli mi?**
   - Seçenekler: (a) serbest (bugünkü); (b) üst rolleri yazabilir ama kendi çakışmasını üst rol onaylar; (c) üst rolleri yalnız admin/owner yazar.
   - Önerim yok; kapsam modeline bağlı.
7. **E-Q7: Müsaitlik kuralında "Allow" (hiç uyarı yok) ve "Warn" (yalnız bildirim, onay yok) seçenekleri kalsın mı?**
   - Neden soruyorum: hedefiniz yalnız "soft (uyarı + üzerine yaz)" ve "hard" tarif ediyor.
   - Seçenekler: (a) yalnız Require confirmation ve Block; (b) dört seçenek de kalsın.
   - Önerim (a), daha az kavram demek. Kararı size bırakıyorum.
8. **E-Q8: Takas ve Line Up aday kontrolünde kapalı lokasyon ve yol süresi, Conflict handling ayarını izlesin mi?**
   - Neden soruyorum: bugün bu iki kural orada her zaman kesin engel, Schedule editöründe ise onayla geçilebiliyor.
   - Seçenekler: (a) ayarı izlesin, onaylanacak çakışmayı son onaylayan yönetici görsün; (b) bugünkü gibi kesin engel kalsın.
   - Önerim (a), çünkü hedefte takasın sonunda zaten yönetici onayı var. Önemi düşük.
