# Schedule — eski kararlar (2026-10-09 öncesi)

Kaynak: main `d68aa958` üzerindeki `docs/plan/KARARLAR.md` (Schedule bölümü, satır 407–491 ve §1.1), `docs/plan/ekranlar/01-schedule/EKRAN.md`, `uygulama/VAR.md`, `docs/plan/research/PROTOTIP-SCHEDULE-2026-10-05.md`, `docs/plan/BACKLOG.md`; bulut oturumları 011jp, 018Dg5, 01XHtc, 01KFP7, 01AZm, 01Cso. 2026-10-07 öncesi yerel oturumlar (eski koordinatör `local_9c7e674a…`, `local_863130bd…`, kayıt oturumu `local_d96f34f3…`) görünmüyor; onlardan gelen kararlar yalnız KARARLAR'daki alıntı kadar biliniyor.

Kısa sonuç: 2026-10-09'dan önce Mert'in **açık seçimi** olan konular yalnız: diğer lokasyon hayaleti (2026-09-26), sürüklerken üç renk (2026-10-06), üst çubuk düğmelerinin siyah kalması (2026-10-04), izin hücresinin düz kırmızı "TIME OFF" olması (2026-10-06), şablon Overwrite (2026-10-05). Vardiya penceresi düzeni, dar pencerede üst çubuk (#86), Templates yüzeyi (#88), tek lokasyonda Pazar (#87) ve yayın işareti için **eski Mert kararı yok**.

## 1. Sürüklerken / yerleştirirken hayalet vardiya: görünüş ve renk
- **Sürükleme önizlemesinin (taşınan kartın hayaleti) kendi görünüşü: eski karar yok.**
- Yakın eski kararlar:
  - Diğer lokasyonun hayalet kartı (2026-09-26, KARARLAR satır 417): "gerçek ve hayalet kart aynı düzen … Bütün hayaletler tek ölü gri, ince seyrek tarama, saydamlık yok (metin ≥5:1); hayaletin lokasyonu yalnız köşedeki iğnenin baloncuğunda." Bu, sürükleme değil, başka lokasyondaki vardiyanın soluk kartı. Varyant dalları: `ghost-color-mockups`@c79991d1, `ghost-11b`@e5947ce6, `ghost-merge`@1339e11d (hepsi main dışında, yedek listede). İlke P20: "türetilmiş öğe (ghost) aynı bileşenin soluk hâlidir".
  - Sürüklerken hücre renkleri (Mert, 2026-10-06 ~02:00Z, eski koordinatör `local_9c7e674a…` penceresi, KARARLAR satır 461): "Kabul eden hücre yeşil, geçilebilir uyarı (müsaitlik) amber, gerçek engel (izinli gün, yanlış lokasyon ya da iş) kırmızı; amber hücreye bırakılabilir". **2026-10-09 08:21Z (madde 4) kısmen yerine geçti:** "Sürüklerken o lokasyonda alamayanlar gizlenir (B)".
- Durum: hayalet kart kuralı main'de; sürükleme renkleri main'de (DRAG-UI); 2026-10-09 "gizle (B)" kayıtta, kodda değil.

## 2. Add shift / Edit shift pencereleri (plan maddeleri 11–14)
- **Yerleşim, alanlar, saat yazma akışı ve düğmeler için eski Mert kararı yok.** Bulunanların hepsi hata ya da erişilebilirlik maddesi:
  - Mert'in genel isteği (2026-10-04, prototip turu): "geçiş sürecinde her şeyi polish ederek geçirirsen mutlu olurum" → prototip ajanının S4 "vardiya penceresi" cila listesi (klavyeyle açılınca ortada, 24 saatte dakika bitmeden alan atlamaz, kural kutusu tek cümle, ilk açılışta kısa animasyon). Bunlar Mert'in seçimi değil, ajanın cilası; prototip https://claude.ai/artifact/SmqEkabujEfXHCktUxqbbK (Hesap 1, özel).
  - BL-613 (pencere sol üste yapışıyor, kural kutusu cümleyi iki kez yazıyor, hover deseni siliyor): (b) dakika atlaması main'de `d4920c84`.
  - BL-716 (çakışma kartı Cancel'ı örtüyor), BL-720 (düzenleyicide hiza / boyut tutarsız): açık, kodda yok.
  - #39 "Schedule this shift anyway?" metni main'de `71702b90`; #49 Delete iki tık main'de `0d7953a7` (koordinatör / UI-12 kuralı, Mert seçimi değil).
  - 2026-10-09 (yeni): Start/End alanları kişisel 12/24 saat seçimini izler, main'de `3e2be180` (BL-055).
- Sonuç: bu pencerelerin tasarımı ilk kez 2026-10-09 Artifact turunda soruluyor.

## 3. Üst çubuk: dar pencere, düğmeler, sayılar, Publish alanı (madde 2, 5, 7, 8, 9; eski #86)
- **Stil B (2026-09-28, KARARLAR 418):** New Schedule ▾, Publish/Save draft menüsü, Published ▾, Publish ve Templates pencereleri sade liste stilinde, 13px, tek yeşil aksiyon; "≤720px'te düğme satırı sarılır, kaydırılmaz". Dal `task/schedule-dialog-mockups`@0b2f998c (DEV taslak; uygulama main'de).
- **Düğmeler siyah kalır (Mert, 2026-10-04, marka programı adım 3, KARARLAR 419):** "Export, Templates, New Schedule ▾ ve … Publish `--theme-action` (#111827) siyahıdır; yayın durumu renkleri (kısmi turuncu, tam yeşil) bunun üstüne gelir … Reddedilen: 'hepsi yeşil', 'yalnız Publish yeşil, ötekiler beyaz'." Main'de.
- Basılamayan Publish iki cümlelik ipucu (G14 dilim b, `2877a066`), X 18px (BL-305): main'de, koordinatör/G14 kararı.
- Publish sayım cümlesi (BL-441): 2026-10-06 varyant turunda B seçildi (VAR.md); main'de.
- **Dar pencere (#86, BL-445, BL-233): eski karar yok.** 2026-10-06 varyant turunda A (bugünkü), B (1280 altında simgeler), C ("Filters (1)" düğmesi, önerilen) gösterildi (`task/var-ekran-12`@d7c4130b, görüntüler `artifacts\nf-arayuz\VAR-EKRAN-12`), Mert seçmedi; EKRAN.md §2.6'da "gözle karar", DURUM B17'de bekliyor.

## 4. Templates penceresi (#88)
- "Save as template hem taslak ekranında hem Templates ekranında bulunur" (2026-09 eski cevaplar, onay 2026-10-01, KARARLAR 414).
- Overwrite yalnız şablonun lokasyonlarını temizler (Mert, 2026-10-05 ~21:30Z, `local_9c7e674a…`, KARARLAR 456). Replace iki tık (koordinatör KK-162, 2026-10-06, KARARLAR 471). İkisi de main'de.
- Templates çalışan adlarını korur, departmanlar "Only some departments" altında (BL-038 K3 K4): main'de `ca0553bd`, `b82fc5a4`; Mert'in kapanış bakışı bekliyor (`cf049226`).
- **#88 (BL-722, iki ayrı Templates yüzeyi — pencere mi `/app/schedule/templates` sayfası mı): eski karar yok.**
- 2026-10-09 08:05Z: üç yeni varyant (A kütüphane, B yan panel, C adım adım) reddedildi, bugünkü pencere kalır.

## 5. Onaylı izin hücresine tıklama: pencere açılsın mı, Add shift olmasın mı
- KK-162 (koordinatör kararı 2026-10-06, Mert değil, KARARLAR 472): "Bugün izinli hücreye vardiya yazılamaz; kısaltma Requests'ten yapılır."
- Görünüş (Mert, 2026-10-06 ~04:20Z, `local_9c7e674a…`, KARARLAR 477): "İzinli gün: düz kırmızı zemin + 'TIME OFF' yazısı, tarama yok." 2026-10-09 08:13Z'de korundu.
- Mert 2026-10-09 05:57Z (S5 thread'i, KARARLAR §1.1 satır 196): "1dk bile olsa izin zamanıyla çakışıyor ise schedule grid kırmızı gösterir hücreyi ve Time off yazar. shift yazılamaz." → BL-995.
- **Hücreye tıklayınca pencere açılıp açılmayacağı: eski karar yok**; 2026-10-09 08:13Z (madde 6) "AÇIK" diye kaydedildi.

## 6. Yayınlanmış vardiyada onay işareti; vardiyanın lokasyonunda alamayanları gizleme
- **Yayın işareti: 2026-10-09 öncesi karar yok.** Yakın kural S-31 / KK-171 (koordinatör, 2026-10-06): "changed after publishing" işareti yayındaki kişinindir. 2026-10-09 08:21Z (madde 3): "varyant 6 — yayınlanmışta işaret yok, yayınlanmamışta NEW".
- **Alamayanları gizleme:** eski karar 2026-10-06 ~02:00Z üç renk (kırmızı = yanlış lokasyon/iş, gizleme yok). 2026-10-09 08:21Z (madde 4) "gizlenir (B)" ile değişti. Kodda değil.
- İlgili: S-101 (BL-974, Mert 2026-10-08 ~12:40Z: "schedule gridde by role olarak sort out edip filtrelerden job seçince seçimde olmayan joblar da gözüküyor gridde") → main'de `ab4e68b6`.

## 7. Tek lokasyonlu haftada Pazar (#87)
- **Eski karar yok.** BL-717 / C-D11. 2026-10-06 varyant turunda B (yedi gün sığar, yazı sarılır, önerilen) ve C (yan menü simge şeridine iner) hazırlandı (`task/var-ekran-12`@d7c4130b); Mert seçmedi. EKRAN.md §2.6 "gözle karar", DURUM B17.
