<!-- EKRAN-01 Schedule keşfi, parça A (nf-planlama, salt okuma), main 06a74d5a, 2026-10-05. Ajanın raporu olduğu gibi. -->

**KARAR: keşif bitti.** Salt okuma yapıldı, hiçbir dosyaya yazılmadı, commit atılmadı. Kod `main` `06a74d5a` üzerinden okundu. Fonksiyon gövdeleri yerel veritabanında yalnız okuma modunda ölçüldü (`docker exec … default_transaction_read_only = on`). Ölçüm tarihi 2026-10-05.

## 1. Nerede duruyor

Üç iş de tamam: backlog taraması, prototip farkları ve "KARARLAR'da yazılı ama kodda olmayan" listesi.

**Sayılar:**
- **Schedule'a ait açık madde: 108.**
  - Ekranın içinde 85 madde: 54 geçerli, 7 değişmiş, 6 bayat, 18 ölçülmedi.
  - Sınırda 18 madde: 3 geçerli, 2 değişmiş, 13 ölçülmedi.
  - Dışarıda 5 madde: MVP sonrası ya da büyük karar (BL-050, BL-067, BL-122, BL-123, BL-126).
- **Prototip cila listesi: 42 madde.** 37'si taşınmalı, 4'ü bırakılmalı, 1'i Mert'in kararını bekliyor (BL-617).
- **KARARLAR'da olup kodda olmayan: 13 kalem.** Biri yeni bulgu ve backlog'da maddesi yok.

"Ölçülmedi" diye işaretlenenler ya ekran görüntüsü, ya pgTAP koşusu, ya da canlı (hosted) ortam ister. Tahminle doldurulmadı.

## 2. Ne yapıldı (etkisi)

**Bayat çıkan 6 madde koddan kanıtlı; iş açılmadan kapatılabilir:**
- **BL-062** "Varsayılan saatleri gözden geçir" penceresi açılamıyor deniyordu. Artık açılıyor: `SchedulePage.tsx:2667`'de "Review default hours" düğmesi var (`8b99d148`).
- **BL-206** Müsaitlik engelinden kalan ölü kod silinmiş. API ucu yok, `missing_reason` alanı yok, veritabanı fonksiyonu 0 satır. Silme migration'ı `20261007000000`, `retired_objects_stay_gone` testine de eklenmiş.
- **BL-319 ve BL-333** Telefonda menü kırpılması. `05f93298` kaydırılan satırı kaldırdı, `11b80b5c` Settings menüsünü sola açtı. Kod düzelmiş, ekranda bakılmadı.
- **BL-527 ve BL-540** Balondaki iki eski metin ("only managers see this", "Publish asks you to confirm it.") AVAIL-002 C1'de (`0ee7ba7a`) kalkmış.

**Değişmiş 7 madde bugünkü hâliyle aşağıda yazılı.** En önemlisi BL-038 (şablon kararları): altı karardan yalnız biri tam uygulanmış.

**İki madde aynı şeyi anlatıyor:** BL-552 ve BL-685 (sunucunun `confirm_scope` alanı web'e ulaşmıyor). Biri ötekine bağlanıp kapatılmalı.

**Yeni bulgu (backlog'da maddesi yok):** KARARLAR "Save as template hem taslak ekranında hem Templates ekranında bulunur" diyor.
- New Schedule ▾ menüsünde düğme kodu duruyor (`DraftDropdownMenu.tsx:453`).
- Ama Schedule sayfası menüye ne `onSaveAsTemplate` ne `templates` veriyor (`SchedulePage.tsx:2310-2380`).
- Sonuç: menüde şablon satırları ve "Save as template" hiç görünmez. Şablon yalnız üst çubuktaki Templates penceresinden kurulabiliyor.
- Kodda ölçüldü, ekranda doğrulanmadı.

## Tablo 1 — Açık backlog maddeleri

İşaret sütunu: **L** = bırakılırsa ne olur (leave), **D** = yapmanın riski (do).

**Ekranın içinde (85)**

| BL | Ekranda ne oluyor | İşaret | Tazelik + kanıt | Sınırda |
|---|---|---|---|---|
| 238 | Pazar akşamı (Los Angeles saatiyle) "bu hafta" kilitleniyor; Mina gelecek haftayı düzenleyemiyor | L high / D risky | **geçerli**: canlı gövde çıplak `current_date` kullanıyor; KK-6 kararı lokasyon saat dilimi | |
| 562 | Izgaranın 50 ms testi CI'da e2e ile aynı anda koşunca düşüyor | medium / moderate | **geçerli**: kök neden bugün ölçüldü (`06a74d5a`) | |
| 101 | Haftalık dışa aktarma e-postası canlıda tetiklenmiyor | high / moderate | **değişmiş**: kod kısmı kapandı (`4490f8e3`); açık kalan canlıda saatlik tetik (ücret kararı); canlı ölçülmedi | |
| 437 | Export panelinde haftalık e-posta kurma bölümü yok | medium / moderate | **geçerli**: yalnız `ExportController` açılıyor; `App.test.tsx:1339` yokluğu kilitliyor; karar KARARLAR:120 | |
| 494 | Bütün lokasyonları arşivli dışa aktarma kuralını müdür düzenleyemiyor | low / risky | **ölçülmedi** (2026-10-01'de kapı "kuralı kuran"dı; karar alındı) | |
| 038 | Şablonun altı kararı | medium / moderate | **değişmiş**: K1 yalnız Templates'te var; K2 yok ("Add/Replace" yerine "Merge"); K3 yok; K4 departman alanı var ama katlanmış değil; K6 boş hâl "No templates saved yet." diyor, yol göstermiyor | |
| 236 | Emojili etiket adı yarım kesiliyor | low / safe | **geçerli**: `templateApplyMessage.ts:11-12` `slice` | |
| 062 | Varsayılan saat penceresi açılamıyor | low / safe | **bayat**: `SchedulePage.tsx:2667` | |
| 110 | "Saat yok" yolları ölü kaldı | low / safe | **değişmiş**: Schedule kısmı kapandı; kalan `time-off.ts:104` (Requests ekranı) | |
| 121 | Publish penceresinde "40+ scheduled hours" listesi yok | medium / safe | **geçerli**: grep boş; KK-9 kararı var, Mert 09-30'da "sonraki plan" dedi | |
| 159 | Düzenleme oturumu tutmadığı lokasyona vardiya ekleyebiliyor | medium / moderate | **ölçülmedi** (son tazelik 09-27) | |
| 174 | Yayın tetikleyicisi önceki yayını bulunca hiç kontrol etmiyor | medium / moderate | **geçerli**: canlı `if prior is not null` (satır 25) | |
| 191 | Toplu yollar yeni vardiyaları birbirine karşı kontrol ediyor mu | medium / safe | **ölçülmedi** (pgTAP koşusu gerekir) | |
| 194 | Durum kutusu ve rename hata satırında ham renk | low / safe | **değişmiş**: yeşil hex'ler 10-04'te kalktı; kalan `#26312d` (`styles.css` ~11103) ve `#9a392f` (:10197) | |
| 206 | Müsaitlik engelinden kalan ölü kod | low / safe | **bayat**: kanıt yukarıda | |
| 211 | Yayın hazırlığında bir kez 500 hatası | medium / safe | **ölçülmedi** (muhtemelen BL-316 ile kapandı) | |
| 224 | Taslak silme kuralı fonksiyonun içinde yazılı | medium / safe | **geçerli**: canlı gövde satır 21, `live_location_ids` çağrılmıyor | |
| 233 | 768 px'te Export düğmesi lokasyon süzgecinin üstüne biniyor | medium / safe | **geçerli (kod)**: 720 dışında kırılma noktası yok (`styles.css:11107`); ekranda bakılmadı | |
| 275 | Izgara her çizimde bütün modeli yeniden kuruyor | medium / moderate | **geçerli**: `SchedulePage.tsx:1907`, `memo` yok | |
| 282 | Export CSV'si formül enjeksiyonuna açık | low / safe | **geçerli**: `schedule-export.ts:449-453` | diğer kalemleri sınırda |
| 292 | Yükte `note` anahtarı yoksa not sessizce siliniyor | medium / moderate | **geçerli**: canlı satır 141 | |
| 315 | Management kümesi tekrar tekrar kuruluyor | low / safe | **ölçülmedi** (kod değişmiş) | |
| 318 | Export, Unpublish ve Save draft pencereleri eski ağır stilde | low / moderate | **değişmiş**: yalnız Publish ve Templates sade stilde; KK-10 kararı var | |
| 319 | Telefonda sol grup menüleri kırpıyor | medium / safe | **bayat**: `05f93298` | |
| 320 | Telefonda Published ▾ menüsü taşabilir | low / safe | **ölçülmedi** | |
| 326 | Yayın, taslağın kendi lokasyon listesine bakmıyor | low / moderate | **geçerli**: canlı yayın gövdesinde karşılaştırma yok (riskli yüzey, R3) | |
| 327 | Menüde iç içe düğme; "Delete?" ile "Confirm delete" iki ayrı dil | low / safe | **geçerli**: `DraftDropdownMenu.tsx:242,389,526,327,441` | |
| 333 | Telefonda Settings menüsü taşıyor | medium / safe | **bayat (kod)**: `05f93298` + `11b80b5c` | |
| 334 | İkon düğmesi 38×36 px; telefonda parmakla basmak için küçük | medium / moderate | **geçerli**: `styles.css:3077-3078` | sınırda (ortak sınıf) |
| 346 | `.schedule-shift-drawer` CSS'i ölü | low / safe | **geçerli**: 20 kural, hiçbir bileşen kullanmıyor | |
| 362 | Hücreden "izni kısalt ve ata" tek adımda yok | medium / moderate | **geçerli**: grep boş | |
| 371 | Menüde "Published by Unknown" yazıyor | low / safe | **geçerli**: canlı `published_by_name` null; `draftMenuLabels.ts:24` | |
| 376 | API rota dosyası çok büyük | low / moderate | **değişmiş**: 2638 satır | |
| 386 | Sayfa dosyası çok büyük | low / moderate | **değişmiş**: 3637 satır, 54 `useState`, 23 `useEffect` | |
| 391 | Ölü anahtar; üç çağrıda hata yakalanmıyor | low / safe | **geçerli**: `schedule-data.ts:118`; `SchedulePage.tsx:989,3234,3307` | |
| 395 | Ekrana ham hata metni çıkıyor | low / safe | **geçerli**: yedi yer (`SchedulePage.tsx:974…1341`) | |
| 403 | Kişiyi okuma izni olmayana ad tıklanır görünüyor | low / safe | **geçerli**: kartta `disabled` yok | |
| 412 | Taslak kimliğiyle sorana kapsam dışı taslağın varlığı belli oluyor (P0002) | low / safe | **geçerli**: canlı satır 28 | |
| 441 | Publish ön kontrolünde aynı özet iki kez yazıyor | low / safe | **geçerli (kod)**: `PublishScheduleDialog.tsx:888-904` + `PublishPreflightPanel.tsx:161-170` | |
| 442 | Unpublish, yayınsız lokasyonu "0 shifts" diye listeliyor | low / moderate | **ölçülmedi** | |
| 445 | 936 px'te üst çubuk yedi satıra diziliyor | medium / safe | **ölçülmedi** (ekran gerekir); Mert 09-30'da "şimdi değil" dedi | |
| 448 | "Bugün" rozeti ile sütunun yeşil tonu farklı güne düşüyor | low / moderate | **geçerli**: KARARLAR:475'te bilinen sonuç diye yazılı | |
| 449 | Hafta düğmesinin erişilebilir adı "Weekly view", üstünde tarih yazıyor | medium / moderate | **geçerli**: `ScheduleTopBar.tsx:481` / `:490` | |
| 450 | Üst çubuk kenarı beyaz üstünde 2,0:1 kontrast | low / moderate | **geçerli**: `#aeb9b4` (`styles.css:85`, `:3571`) | |
| 451 | Hata durumunda hafta etiketi adresteki günü yazıyor | low / safe | **geçerli**: `SchedulePage.tsx:1882` | |
| 453 | Ölü CSS seçicisi | low / safe | **geçerli**: `styles.css:4356` | |
| 454 | Kurtarma penceresinden sonra balon kendiliğinden açılıyor olabilir | low / safe | **ölçülmedi** | |
| 457 | Hata durumunda "bu haftaya dön" düğmesi amber olmuyor | low / safe | **geçerli**: `SchedulePage.tsx:1876-1885`'te `returnCue` yok | |
| 458 | Pencerenin arkasındaki karartılmış alana tık arkadaki katmana gidiyor | low / belirsiz | **ölçülmedi**; karar gerekir | |
| 499 | Arşivli vardiya tipi "Saved shift type" diye yazıyor | low / safe | **geçerli**: `DefaultHoursReviewDialog.tsx:92` | |
| 510 | Yayında geçilemez bir bulgu "override" diye kaydedilebilir (bugün oluşmuyor) | low / safe | **geçerli**: aynı satır `20261007000000`'da | |
| 522 | Oluşamayan çakışma için kırmızı çizgi duruyor | low / safe | **geçerli**: `styles.css:6100` | |
| 524 | Ad sütununda eski üstü çizili takvim simgesi | low / safe | **geçerli**: `ScheduleEmployeeCard.tsx:79` | |
| 525 | Müsaitlik turuncusu ile izin kırmızısı yalnız renkle ayrılıyor | medium / safe | **geçerli**; Mert 10-01'de "backlog'a yaz" dedi | |
| 526 | Klavyeyle gezince balon açılıp hemen kapanıyor | low / moderate | **ölçülmedi** | |
| 527 | "Manager note (only managers see this)" metni | low / safe | **bayat** | |
| 537 | Kapanış görünümü bütün workspace'leri tarıyor | low / safe | **ölçülmedi** | |
| 540 | Yayınlanmış vardiyanın balonunda "Publish asks…" yazıyor | medium / safe | **bayat** | |
| 544 | İzin ve kapalı gün, vardiyayı open'a düşürmeyi iki ayrı yerde yazıyor | low / moderate | **ölçülmedi** | |
| 545 | Açık düzenleme oturumundaki taslak vardiya kapalı günde düşmüyor | low / moderate | **ölçülmedi** | |
| 552 | `confirm_scope` alanı web'e ulaşmıyor | low / safe | **geçerli**; BL-685 ile aynı madde | |
| 570 | Boş hücre balonu eski dilde | medium / safe | **geçerli**: `ScheduleAvailabilityTip.tsx:75` | |
| 573 | Telefonda balon vardiya penceresinin Job alanını örtüyor | low / safe | **ölçülmedi** (ekran) | |
| 574 | Availability kapanınca sütun daralıyor | low / safe | **ölçülmedi** (ekran) | |
| 577 | Çakışma sorusu iki yerde iki ayrı cümle | low / safe | **geçerli**: `ShiftQuickEditor.tsx:1068`, `SchedulePage.tsx:3081` | |
| 578 | Telefonda üst çubukla şerit arasında ~45 px boşluk | low / safe | **ölçülmedi** (ekran) | |
| 579 | Onaylı izin üstündeki vardiyada hem kırmızı hem "!" var | low / safe | **ölçülmedi** | |
| 587 | Filtre menüsü 375 px telefonda sağdan taşıyor | medium / safe | **geçerli**: sabit 270 px (`schedule-topbar-filter.css:16`), telefon kuralı yok | |
| 608 | Esc ve boş tık katmanları yanlış sırada kapanıyor | medium / moderate | **geçerli**: 10-05 tazeliği; o günden beri Schedule'a yalnız BL-606/607 dokundu | |
| 609 | Paste mode'da hücrelerde işaret yok | medium / safe | **geçerli**: `data-paste-armed` CSS'te var (`:5874`), hiçbir bileşen kullanmıyor | |
| 610 | Fareyle odaklanan kartta Enter / Ctrl+C çalışmıyor; kaydırma çubuğunda odak halkası yok | medium / safe | **geçerli** (10-05) | |
| 611 | Ekranda ham kodlar ("event: Halloween") | low / safe | **geçerli** (10-05); ek: Auto-fill tarihi ham yazıyor (`AutoFillReviewOverlay.tsx:107`) | |
| 612 | Boş ızgarada "No employees" yalnız ekran okuyucuya söyleniyor | medium / safe | **geçerli**: `ScheduleGridBody.tsx:284` | |
| 613 | Vardiya penceresinde dört küçük hata | low / safe | **geçerli** (10-05) | |
| 614 | Yayın bildirimi bütün vardiyaları "changes" diye sayıyor | low / safe | **geçerli**: `SchedulePage.tsx:3223` | |
| 615 | Logo penceresinde pasif düğmeler etkin gibi çiziliyor | low / safe | **geçerli** (10-05) | |
| 616 | `EnterEditModeDialog` hiç açılmıyor (ölü kod) | low / safe | **geçerli**: açan değişken hiçbir yerde açık yapılmıyor (`:466,1211,1223,2098`) | |
| 617 | Açık menünün dışına tık alttaki vardiyayı da seçiyor | low / safe | **geçerli**; Mert'in kararı gerekir | |
| 618 | Prototip cilalarını taşıma (şemsiye madde) | medium / moderate | **geçerli** | |
| 619 | "Changed after publishing" onaylı izni de sayıyor | medium / safe | **geçerli**: o günden beri sunucuda değişiklik yok | |
| 655 | "Role Seperators" yazım hatası | low / safe | **geçerli**: `ScheduleTopBar.tsx:640` | |
| 681 | Görünüm modunda Unassigned satırı görünüyor | medium / safe | **geçerli**: `scheduleGridViewModel.ts:69-70` | |
| 685 | `confirm_scope` alanı web'e ulaşmıyor | low / safe | **geçerli**; BL-552'nin ikizi | |
| 168 | Ölü taslak işlem fonksiyonları | low / safe | **geçerli**: `schedule-data.ts:228,240`, çağıran yok | |

**Sınırda (18)**, yani başka bir ekranla ortak:

| BL | Neden sınırda | Hüküm |
|---|---|---|
| 298 | Boşluklu not çalışan görünümünde boş başlık açıyor (`ShiftSheet.tsx:100`) | geçerli |
| 589 | 850/900 yazı ağırlığı 22 satırda, birçok ekranda | geçerli |
| 189 | Takas kurtarma eski yetki yardımcısını kullanıyor (canlı satır 15, 36); FB-6.4'ün işi | geçerli |
| 167 | Takas kurtarma not ve "saati gizle"yi geri döndürmüyor (FB-6.4) | değişmiş |
| 135 | Manager note: Takvim kısmını M12 iptal etti; son düzenleyen AVAIL-002'de geldi (`68c7bd8c`); kalanı Availability ekranında | değişmiş |
| 055, 674 | Tarih ve saat biçimi birçok ekranda | ölçülmedi |
| 388 | Employees'ten çıkarma vardiya saat dilimini yanlış hesaplıyor | ölçülmedi |
| 218 | `.6` "By department" sıralaması kaldı | ölçülmedi |
| 325 | Veritabanı ile ortak şema arasındaki anahtar listesi | ölçülmedi |
| 548 | Kapalı gün önizlemesinin saat dilimi (Important Dates ekranında) | ölçülmedi |
| 549 | Arşivden dönen lokasyon (Settings → Locations) | ölçülmedi |
| 551 | Önemli tarih tablosunda indekssiz yabancı anahtarlar | ölçülmedi |
| 580 | Ortak onay penceresi telefonda kayık | ölçülmedi |
| 179, 133 | Yetki ve test kalemleri | ölçülmedi |
| 350, 435 | Test ve geliştirme ortamı | ölçülmedi |

**Dışarıda (5):**
- BL-050 ve BL-067: MVP sonrası.
- BL-122: örnek hafta, MVP sonrası. Boş ızgara kısmı BL-612 ile ekranın içinde.
- BL-123: Aşama 6 güvenlik kapısını bekliyor.
- BL-126: KK-10'a göre MVP sonrası.
- Ayrıca BL-257'nin Schedule kısmı bayat (`5a92d2f2`), kalanı Requests ekranında.

## Tablo 2 — Prototip farkları (cila listesi, 42 madde)

**Dayanak (aksi yazmadıkça):** Mert'in 2026-10-04 isteği ("her şeyi polish ederek geçirirsen", PROTOTIP dosyası) + ILKELER P04 koşulu (renk, kenar gibi tutarlılık ayarları varyantsız yapılabilir). Gerçekte eksik oldukları prototip denetiminin kendi ölçümü. İki kalemi bugün elle doğruladım: S2.1 (`styles.css:11040` `#596660`) ve S3.11 (`AutoFillReviewOverlay.tsx:107`).

| Kalem | Ekranda nerede | Ne değişir | Öneri | Eşleşen BL |
|---|---|---|---|---|
| S1.1–1.5 | Üst çubuk düğmeleri ve çipler | Hover tonları, açık menü kenarı, 0,12 sn geçiş | taşı | 618 |
| S1.6 | Basılamayan Publish | Hover'da koyulaşmaz (KARARLAR "Basılamayan Publish") | taşı | 618 |
| S1.7 | Mini takvim | Odak halkası komşu günün altında kalmaz (WCAG) | taşı | 618 |
| S1.8 | Açık menü + ızgaraya tık | İlk tık yalnız menüyü kapatır | **Mert kararı** | 617 |
| S1.9 | Çubuk x=320 hizasında, gri zemin | KARARLAR "sayfa başlığı yok": bugünkü uygulamayla aynı | bırak (gri zemin ölçülmedi) | — |
| S2.1 | Vardiya kartı satırları | Etiket, lokasyon ve saat kendi renginde; ham hex token'a döner | taşı | 618 |
| S2.2 / S4.5 / S4.6 | Önemli gün balonu, ad balonu, sürükleme cümlesi | Okunur metin (P21) | taşı | 611 |
| S2.3 | Boş ızgara | "No employees" görünür olur | taşı | 612 |
| S2.4 / S3.4 | Kaydırma çubuğu, odaklı kart | Odak halkası; Enter / Ctrl+C çalışır | taşı | 610 |
| S2.5 | Gün toplamları | Ekran okuyucu tarihi okunur söyler | taşı | 618 |
| S3.1–3.3 | Paste mode | Yeşil hücre ve kopya imleci, etiket yukarı kalkar, kırmızı temizlenir | taşı | 609 |
| S3.5–3.7 / S4.9 / S5.2 | Esc ve boş tık | Her basış bir katman kapatır (KARARLAR Escape kuralı) | taşı | 608 |
| S3.8 / S3.9 / S4.8 / S5.1 | Menü ve pencere açılışı | Kısa geçiş; sistemde hareket azaltma açıksa kapanır | taşı | 618 |
| S3.10 | Sürükleme engel cümlesi | "…" ile kesilir | taşı | 618 |
| S3.11 | Auto-fill penceresi | 600 px; tarih "Tue, Oct 6" biçiminde (P21) | taşı | 618 / 674 |
| S3.12 | Varsayılan saat penceresi | Aralıklar düzenli | taşı | 618 |
| S4.1–4.4 | Vardiya penceresi | Ortada açılır, 24 saatte dakika atlamaz, cümle tekrarı yok, tarama silinmez | taşı | 613 |
| S4.7 | Seçim kutuları | Yazı biraz büyür | taşı | 618 |
| S4.10 | K17 "oturumda bir kez sor" | Zaten main'de (`021da39d`) | bırak | 606 (kapalı) |
| S4.11 | "Changed after publishing" | Görünüm zaten main'de; yalnız-müsaitlik kısmı eksik | taşı (kısmen) | 619 |
| S5.3 | Hareketsizlik penceresinde SAVE | Zaten main'de (`ba653646`) | bırak | 607 (kapalı) |
| S5.4 | Sihirbazdaki "Saved draft" alanı | Prototipin kısıtı | bırak | — |
| S5.5 | Logo penceresi | Pasif düğmeler soluk görünür | taşı | 615 |

- **Ayrıca "S-ESLIK-1" altı kalemi ve "prototipte yapılamayanlar": hepsi bırak.** Bunlar prototipin gerçek uygulamaya göre eksiği; prototip işi durdu (KK-156).
- **Varyant gerektirenler (P04)** cila listesinde değil, backlog'da: BL-445 (üst çubuğun hedef görünümü), BL-524 (simge), BL-525 (şekil farkı), BL-441 (hangi özet kalsın).

## Tablo 3 — KARARLAR'da olup kodda olmayan

| Karar | Kodda bugün | BL |
|---|---|---|
| Görünüm modunda Unassigned satırı gizlenir (10-05) | Görünüyor (`scheduleGridViewModel.ts:69-70`) | 681 |
| "Save as template" taslak ekranında da var (KARARLAR:408) | New Schedule menüsüne bağlı değil (`DraftDropdownMenu.tsx:453`, `SchedulePage.tsx:2310-2380`) | **yok, yeni bulgu** |
| Öteki Schedule pencereleri de sade stilde (KK-10, KARARLAR:425) | Export, Unpublish ve Save draft eski stilde | 318 |
| Haftalık e-posta Export panelinde kurulur (KARARLAR:120) | Panelde yok | 437 |
| Dışa aktarma kuralını owner/admin her zaman, müdür kendi lokasyonlarında düzenler (KARARLAR:120 / 10-01) | Kapı "kuralı kuran" kişi (10-01 ölçümü) | 494 |
| M11: "Changed after publishing" yalnız müsaitliği sayar | Onaylı izni de sayıyor | 619 |
| K16: taslaktaki vardiya kapalı günde sorusuz düşer | Açık düzenleme oturumundaki vardiya düşmüyor | 545 |
| K13: kapalı günden etkilenen vardiyalar listelenir | Arşivden dönen lokasyonda liste çıkmıyor | 549 (sınırda) |
| Geçmiş hafta kilidi lokasyonun saat dilimiyle (KK-6) | UTC ile hesaplanıyor | 238 |
| KK-9: Publish penceresinde "40+ scheduled hours" | Yok | 121 |
| BL-038 şablon kararları (Mert, 09-16) | Add/Replace + onay, "isimleri kaldır" ve yol gösteren boş hâl yok; departman alanı katlanmış değil | 038 |
| K17 "bir kez sor" | Davranış doğru, ama sunucunun işareti web'e ulaşmıyor (ikinci bilgi kaynağı) | 685 / 552 |
| KARARLAR:488 "bugünkü ekran henüz böyle değil" | Metin eskimiş; AVAIL-002 kapandı (`3b17aec7`). Yalnız belge düzeltmesi | — |

## Mert'e sorulacak ürün kararları (§13 şablonunda, ham)

**S1 — Açık menünün dışına tık (BL-617)**
- **Bugün:** Schedule → üst çubuk → Settings menüsü açıkken ızgaraya tıklanınca menü kapanıyor ve aynı tık Kevin'in vardiyasını da seçiyor.
- **Örnek:** Ayşe menüyü kapatmak için ızgaraya tıklar; Kevin'in Salı vardiyası da odaklanır.
- **(a) İlk tık yalnız menüyü kapatsın (Önerilen).** Vardiya seçilmez; ikinci tık seçer. Engel değil, yalnız davranış.
  Dayanak: yok — yeni karar. Kodun yazılı niyeti ve BL-608'in "her basış bir katman" kuralı bu yönde.
- **(b) Bugünkü gibi kalsın:** tık hem kapatsın hem seçsin.
- **(c) Claude karar versin.**

**S2 — Pencerenin arkasındaki karartılmış alana tık (BL-458)**
- **Bugün:** Schedule → herhangi bir pencere açıkken karartılmış alana tık, arkadaki bir katmanı kapatabiliyor.
- **Örnek:** Ayşe kilit penceresi açıkken boş yere tıklar, arkadaki süzgeç kapanır.
- **(a) Yok sayılsın (Önerilen).** Pencere açık kalır, arkada hiçbir şey değişmez.
  Dayanak: yok — yeni karar. ILKELER P26'ya yakın: istemeden kayıp olmasın.
- **(b) Pencereyi kapatsın** (Esc gibi).
- **(c) Bugünkü gibi kalsın.**

**S3 — Onaylı izinli günde yayınlanmış vardiya (BL-579)**
- **Bugün:** Ali'nin Salı izni onaylı ve Salı vardiyası yayında. Ayşe hücrede hem kırmızı izin taramasını hem turuncu "!" işaretini görüyor.
- **(a) Yalnız izin kırmızısı kalsın, "!" çıkmasın (Önerilen).** Tek mesaj: kesin engel.
  Dayanak: KARARLAR G14 kilitli tarif (izin kesin engel, müsaitlik tercih) ve M10 ("izin kırmızısı kalır"); ikisi de durumu birebir kapsamıyor.
- **(b) İkisi birden kalsın** (bugünkü gibi).

**S4 — Renk körlüğü için şekil farkı (BL-525)**
- **Bugün:** Müsaitlik turuncusu ile izin kırmızısı yalnız renkle ayrılıyor. Mert 10-01'de "backlog'a yaz" demişti.
- **(a) Bu Schedule turunda iki varyant gösterilsin (Önerilen).**
  Dayanak: Mert'in 2026-10-05 ekran planı kuralı (ekranın eski backlog maddeleri o turda yapılır) + ILKELER P04.
- **(b) Backlog'da kalsın** (Mert'in 10-01 seçimi).

**S5 — Haftalık dışa aktarma e-postası canlıda nasıl tetiklenecek (BL-101)**
- **Bugün:** Kod hazır, canlıda saatlik tetik yok. Vercel'in ücretsiz cron'u günde bir çalışıyor.
- **(a) Ücretsiz günlük tetik (Önerilen).** E-posta günde bir kez gönderilir.
  Dayanak: ILKELER P06 (önce ücretsiz). **Önce ölçülmesi gereken:** kuralın gün değil saat de seçip seçmediği. Bu raporda ölçülmedi.
- **(b) Ücretli plan ya da dış tetikleyici.** Dolar tutarı kaynaklı ölçüm ister; bu raporda yok, koordinatör kaynağıyla ekler.

**S6 — Üst çubuk kenar kontrastı (BL-450)**
- Kenar beyaz üstünde 2,0:1. P04 koşulu bunun yazıyla sorulmasına izin veriyor.
- **(a) 3:1'e koyulaştırılsın (Önerilen).** Dayanak: CLAUDE.md §9 WCAG 2.1 AA.
- **(b) Kalsın.** Düğmelerin üstünde yazı olduğu için engel değil.

**Varyantla sorulacaklar** (yazıyla değil, gerçek ekranda): BL-445 üst çubuğun dar penceredeki hâli, BL-524 ad sütunu simgesi, BL-441 hangi özet kalsın.

## 3. Açık kalan ve nedeni
- **18 madde "ölçülmedi".** Ekran görüntüsü (BL-445, 573, 574, 578), pgTAP koşusu (BL-191) ya da canlı ortam (BL-101) ister. Görsel QA ve kod denetimi ajanlarının alanı; onların işine girmedim.
- **Yeni bulgu için BL numarası alınmadı.** Görev salt okumaydı; yazma ve numara koordinatörde.

## 4. Ekranda ne değişti
Hiçbir şey; salt okuma.

## 5. Sırada ne var
1. Bayat 6 maddeyi kanıtıyla kapatmak; BL-552 ile BL-685'i tek maddeye indirmek; KARARLAR:488'deki eskimiş cümleyi düzeltmek. Hepsi belge işi.
2. "Save as template" menü bağlantısını backlog'a yazmak (öneri: L medium / D safe). KARARLAR'daki kural kodda yok.
3. Yukarıdaki altı soruyu tek turda Mert'e sormak. BL-617, BL-458 ve BL-579 cevaplanmadan Esc ve katman işi (BL-608) tam kapanmaz.
4. Ekranın en büyük açıkları:
   - BL-238: Pazar akşamı kilidi (riskli yüzey, R3).
   - BL-292: not sessizce siliniyor.
   - BL-437 + BL-494: zamanlanmış dışa aktarma paneli, kararlar hazır.
   - BL-038: şablon kararları.
   - BL-681: görünüm modu kararı.

Yazdığım dosya yok. Geçici ölçüm betikleri yalnız scratchpad'de: `C:\Users\TheWe\AppData\Local\Temp\claude\C--Users-TheWe-Documents-Codex-newfork-clean\dce446c1-b6b2-4aea-b342-f2f69513474d\scratchpad\`.
