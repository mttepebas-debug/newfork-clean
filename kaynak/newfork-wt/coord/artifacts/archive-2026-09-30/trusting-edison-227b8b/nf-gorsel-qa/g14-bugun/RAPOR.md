# G14 — Schedule'ın bugünkü hâli, masaüstü ekran görüntüleri (nf-gorsel-qa, 2026-09-30)

`origin/main` @ `1b12f2da`. Workspace: Meyhouse (seed), giriş `owner@newfork.test` (owner) ve Alex Kim'in kendi hesabı
(`time.employee@newfork.test`, employee). Pencere 1440×900 (B1 hariç). Hüküm ve öneri yok; her görüntünün altında
ne göründüğü yazıyor. Koddaki anlatım: `docs/plan/research/g14-tazelik-2026-09-30.md` bölüm 2 (`nf-planlama`).

34 görüntü. Üretilemeyenler en altta.

**İpucu balonları hakkında:** hücre ve kart ipuçları tarayıcının kendi balonu (`title`). Bu balon ekran görüntüsüne
girmiyor. Metinleri sayfadan okundu ve ilgili görüntünün altına yazıldı.

## Kurulan veri (uygulamanın kendi ekranlarından; SQL ile yazılmadı)

Var olan: Alex Kim'in cuma "All day unavailable" işareti ve 21 Eylül yayınlı haftası. Eklenen:

| Ne | Kim / nerede | Değer |
|---|---|---|
| Haftalık müsaitlik | Alex Kim, Employee Hub → My Availability | Salı, çarşamba, perşembe 2:00 PM – 6:00 PM "unavailable" (cuma tüm gün önceden vardı) |
| Taslak "G14 QA" | owner, Schedule, 12–18 Ekim 2026, Main Dining | Alex: Sal 13 2:00–6:00 PM · Çar 14 5:00–10:00 PM · Per 15 8:00 AM–12:00 PM · Cum 16 10:00 AM–2:00 PM. Atanmamış: Sal 13 2:00–6:00 PM · Cum 16 10:00 AM–2:00 PM. Hepsi Server. |
| Yayın | owner, Publish, yalnız Main Dining | 12–18 Ekim haftası yayınlandı; bildirim alan: Alex Kim |
| İzin isteği | Alex Kim, Time Off Requests | 15 Ekim 2026 tam gün, Main Dining, not "G14 QA screenshot fixture"; durumu **Pending** (onaylanmadı) |

Kurulup silinenler (taslak menüsünden, iki tık): saatleri yanlış giden ilk "G14 QA", "G14 QA 2" (19 Ekim haftası),
"G14 QA 3" (26 Ekim haftası). Yukarıdaki dört satır **yerinde duruyor** (canlı bakılabilsin diye). Geri almak için:
Schedule → Published ▾ → Unpublish schedule (Main Dining), taslak menüsünden "G14 QA"yı sil, Alex olarak isteği
"Cancel request" ile iptal et, My Availability'de salı–perşembe saatlerini kaldır.

## A. Müsaitlik uyarısı (BL-204)

### 1. İşaretli gün, hücre boş
- `a1-bos-hucre.png` — 12–18 Ekim, taslak ve yayın yokken: Alex Kim satırında salı, çarşamba, perşembe ve cuma
  hücreleri soluk pembe zeminli ve çapraz çizgili; pazartesi, cumartesi, pazar düz beyaz. Alex'in adının sağında
  küçük üstü çizili takvim simgesi var.
- `a1-bos-hucre-yakin.png` — aynı dört hücrenin yakını. Dört hücrenin ipucu metni: "Employee unavailable".
  Saat aralığı işaretli üç gün ile tüm gün işaretli cuma aynı görünüyor.

### 2. Vardiya işaretli saatle tam örtüşüyor
- `a2-tam-ortusme-yakin.png` — salı 2:00–6:00 PM kartının sağ üst köşesinde amber yuvarlak içinde üstü çizili takvim.
  Kartın ipucu metni: "Alex Kim shows as unavailable for this shift." Üstteki atanmamış kartta işaret yok.
- `a2-var-olan-yayinli-hafta-21-eylul.png` — var olan 21–27 Eylül yayınlı haftası: Alex'in cuma "Dinner-Server
  3:00 PM – 11:00 PM" kartında aynı amber işaret; pazartesi kartında yok.

### 3. Vardiya işaretli saatle kısmen örtüşüyor
- `a3-kismi-ortusme-yakin.png` — çarşamba 5:00–10:00 PM kartı (işaret 2:00–6:00 PM): sağ üstte aynı amber işaret.
  İpucu metni aynı: "Alex Kim shows as unavailable for this shift." Tam örtüşmeyle arasında görünür fark yok.

### 4. Vardiya aynı günde, işaretli saatle örtüşmüyor
- `a4-ortusmeyen-yakin.png` — perşembe 8:00 AM–12:00 PM kartında işaret yok, ipucu yok.
- `a4-ortusmeyen-hucre-yakin.png` — satırın yakını: kart hücreyi tamamen kapladığı için perşembe hücresindeki tarama
  görünmüyor (kayıtlı ve yayınlı görünümde). Taramanın kartın altından göründüğü tek hâl düzenleme modu (9i-1).

### 5. Tüm gün / saat aralığı / vardiya tipi işareti yan yana
- `a5-yan-yana-yakin.png` — salı (saat aralığı, tam), çarşamba (saat aralığı, kısmi), perşembe (örtüşmüyor), cuma
  (tüm gün) kartları tek satırda: işaretli üç kartın işareti aynı simge, aynı renk, aynı yer.
- `a5-tum-gun-yakin.png` — cuma 10:00 AM–2:00 PM kartı (tüm gün işareti): aynı amber işaret ve aynı ipucu metni.
- Vardiya tipi (Open, Dinner, Close) ile işaretleme: **üretilemedi** (aşağıda).

### 6. Publish penceresi → Availability
- `a6-publish-1-lokasyon-secimi.png` — birinci adım "Select locations to publish": Main Dining işaretli, "Not
  published yet · 6 new"; Garden Room işaretsiz, "Not published" (seçimi bu iş için kaldırıldı); altta "1 of 2
  locations selected".
- `a6-publish-2-availability-onaysiz.png` — "Pre-flight check": üstte "3 availability warnings — Some people are
  scheduled when they said they're unavailable. Confirm below to continue."; "Availability" başlığı altında üç satır
  (Alex Kim · 2026-10-13, 10-14, 10-16 · Main Dining · "Alex Kim shows as unavailable for this shift."), her satırın
  sağında ok düğmesi; altında tek onay kutusu "I've seen these 3 warnings and want to publish anyway" boş; "Next"
  soluk ve pasif; sol altta "3 availability warnings".
- `a6-publish-3-availability-onayli.png` — kutu işaretli, "Next" yeşil ve etkin.
- `a6-publish-4-son-adim.png` — "Notify employees": Alex Kim seçili, "1 of 1 employees will be notified", düğme
  "Publish 1 location".
- Önceden onaylanmış uyarıların ("Previously accepted") görünümü alınmadı: aynı haftayı ikinci kez yayınlamak gerekir.

### 7. Yayınlı haftada izinle çakışan vardiya
- `a7-0-calisan-izin-istegi.png` — Alex'in ekranı: "Time off · Oct 15 · pending · Full day · Awaiting decision".
- `a7-0-owner-requests.png` — owner, Schedule → Requests: "Alex Kim · Oct 15, 2026 · Main Dining · Pending".
- `a7-0-owner-istek-inceleme.png` — istek incelemesi: "PUBLISHED ASSIGNMENTS TO REVIEW — 1 published shifts";
  düğmeler Approve / Partial / Deny.
- `a7-0-yayinli-hafta-izin-beklerken.png` — yayınlı 12–18 Ekim, izin beklerken: perşembe 8:00 AM–12:00 PM kartında
  işaret yok; salı, çarşamba, cuma kartlarında amber işaret (müsaitlikten). Üst sağda turuncu "Published".
- `a7-1-izin-onay-penceresi.png` — Approve'a basınca açılan pencere: "Published assignments — Choose what happens
  to every affected shift"; kutu "Release entire shift to open coverage · Main Dining · Server · Oct 15, 8:00 AM –
  12:00 PM" boş; "Approve" soluk ve pasif.
- **anlatımdan farklı / üretilemedi:** onaylı izinle çakışan yayınlı vardiya oluşturulamadı. Kutu işaretlenmeden
  (vardiya açığa bırakılmadan) Approve etkinleşmiyor; işaretlenirse vardiya kişiden alınıyor. İstek onaylanmadı.
  Bu yüzden "izinle çakışan vardiyada aynı amber işaret" görüntüsü yok. Bekleyen izin kartta işaret yakmıyor.

### 8. Görünmediği yerler
- `a8-atanmamis-yakin.png` — Unassigned satırındaki iki kart (Sal 2:00–6:00 PM, Cum 10:00 AM–2:00 PM): işaret yok.
  Aynı saatlerdeki Alex kartlarında işaret var.
- `a8-hayalet-kart-garden-room.png`, `a8-hayalet-kart-yakin.png` — Garden Room ızgarasında Alex'in Main Dining
  vardiyalarının hayalet kartları: gri, çapraz çizgili, sağ üstte konum simgesi; amber işaret yok.
- **anlatımdan farklı:** hayalet kartta görsel işaret yok, ama kartın erişilebilir adında cümle var: "Server, 2:00 PM
  - 6:00 PM, also scheduled at Main Dining, Alex Kim shows as unavailable for this shift, conflicts with another
  shift". Örtüşmeyen perşembe hayaletinde "shows as unavailable" yok, "conflicts with another shift" var.

### 9. Koddan okunamayan iki nokta
- (i) Taslak düzenlerken işaret başka bir kuralla da yanıyor mu:
  - `a9i-1-taslak-duzenleme-modu.png` — 12–18 Ekim, düzenleme modu: Alex satırı daha yüksek, kartların altında
    hücre taraması görünüyor (salı–cuma); işaretler kayıtlı görünümle aynı üç kartta.
  - `a9i-2-duzenleme-modu-uzun-vardiya.png`, `a9i-3-kayitli-taslak-uzun-vardiya.png` — 26 Ekim haftasında deneme
    (sonra silindi): Sal 9:00 AM–6:00 PM, Çar 9:00 AM–10:00 PM (13 saat), Per 9:00 AM–12:00 PM, Cum 9:00 AM–2:00 PM.
    İki modda da işaret yalnız işaretli saatle örtüşen üç kartta; perşembe kartı işaretsiz.
  - Denenenler içinde işareti müsaitlik dışında yakan bir durum çıkmadı: uzun vardiya, bekleyen izin, aynı gün
    örtüşmeyen vardiya. Başka kural (ör. onaylı izin, kapalı gün) denenemedi.
- (ii) Müsaitlik kaydı okunamazsa hafta nasıl görünüyor: **üretilemedi** (aşağıda).

### Roller
- Owner: yukarıdaki bütün görüntüler.
- Manager: **üretilemedi** (aşağıda).
- `a-calisan-my-availability.png` — Alex'in Employee Hub → My Availability ekranı: salı, çarşamba, perşembe
  satırlarında "2:00 PM to 6:00 PM" ve solda kırmızı çizgi; cuma satırı pembe zeminli, "All day unavailable", anahtar
  açık. Üstte "Availability is a preference, not a guarantee…" notu.
- `a-calisan-hub-schedule.png` — Alex'in Employee Hub → Schedule ekranı, yayınlı 12–18 Ekim: kendi salı, çarşamba
  ve cuma kartlarında aynı amber işaret; perşembe kartında yok. Adının sağında aynı takvim simgesi. Atanmamış satırı
  ve Sam Rivera yok.

## B. Üç küçük görüntü

- **U08** `b1-u08-ust-cubuk-936x800.png`, `b1-u08-ust-cubuk-936x800-yakin.png` — 936×800 pencerede üst çubuk: sol
  grup yedi satıra dizilmiş (hafta seçici, Settings, Hide Unscheduled, All locations - Separate, All shifts, All jobs,
  All employees). Sağ grup (Export, Templates, New Schedule, Published) dördüncü satır hizasında duruyor ve "All
  locations - Separate" düğmesinin sağ ucunun üstüne biniyor. Çubuk 289 px yüksek, ızgara onun altında başlıyor.
- **BL-305** `b2-bl305-published-menusu.png` — Published ▾ menüsü: "Publish another draft", "Unpublish schedule".
  `b2-bl305-unpublish-penceresi.png`, `…-yakin.png` — "Unpublish schedule" penceresi: üstte kırmızı "LIVE ACCESS"
  etiketi, sağ üstte X; "WEEK · Oct 12 – Oct 18, 2026 · Current live schedule" kartı; "Main Dining — 6 live shifts
  will be removed" kutusu (işaretsiz); dört satır uyarı; altta "Cancel" ve soluk kırmızı "Unpublish 0 locations".
  "Week" kartı alttaki kutulardan sağda daha dar bitiyor.
- **BL-308** `b3-bl308-pasif-publish.png`, `b3-bl308-pasif-publish-fare-ustunde.png`, `…-yakin.png` — 2–8 Kasım
  (taslak ve yayın yok): "Publish" düğmesi pasif, ama görünüşü etkin düğmeyle aynı (koyu zemin, beyaz yazı, opaklık
  1). Fare üstündeyken zemin bir ton açılıyor (rgb 17,24,39 → 31,41,55), imleç el (pointer), ipucu yok. İmleç ekran
  görüntüsünde görünmez; değerler sayfadan okundu.

## Üretilemeyen durumlar
- **A5, vardiya tipiyle işaretleme:** işaretleme biçimi (saat aralığı / vardiya tipi) workspace genelinde bir ayar;
  Meyhouse "time range" kipinde. Değiştirmek herkesin müsaitlik ekranını etkilediği için dokunulmadı.
- **A7, onaylı izinle çakışan yayınlı vardiya:** onay, vardiyayı açığa bırakmayı şart koşuyor (yukarıda).
- **A9 (ii), okunamayan müsaitlik kaydı:** uygulamanın ekranlarından geçersiz kayıt üretilemiyor; SQL ile yazılmadı.
- **Manager görüntüsü:** Meyhouse'ta yönetici hesabı yok (owner ve iki employee). Yönetici hesapları e2e dünyasında
  var, ama o kişilere dokunulmadı.
- **İpucu balonlarının görüntüsü:** tarayıcının kendi balonu görüntüye girmiyor; metinler yazıldı.

## Kanıt
- Komutlar: `node scripts/lock.mjs status` (her yazmadan önce; `db.lock` boştu), Playwright (kurulu Chrome) ile
  görüntüler; DB yalnız okundu (Alex'in müsaitlik kaydı, taslak vardiya saatleri, taslak listesi).
- Skills: `chrome-devtools-mcp:chrome-devtools` kullanılmadı (rol hafızasındaki Playwright yolu kullanıldı);
  `superpowers:verification-before-completion` çağrılmadı; yerine kırpılmış görüntülerin hepsi ve her durumun ana
  görüntüsü açılıp rapordaki cümleyle karşılaştırıldı. Açılmayanlar (`a6-publish-2`, `a6-publish-4`, `a7-0-*` üçü,
  `a9i-2`, `a9i-3`, `a-calisan-my-availability`, `b2-…-menusu`, `b3-…` tam ekranlar): cümleleri aynı anda sayfadan
  okunan metne dayanıyor.
- Sunucular web 5616 / API 5617, iş bitince PID ile durduruldu.
