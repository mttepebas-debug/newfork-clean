# Ekran 1 — Schedule: keşif özeti

- **Keşif:** 2026-10-05, main `06a74d5a`. Dört rapor bu klasörde: A backlog ve prototip, B güvenlik, C görsel, D kod ve davranış.
- **Kimlik:** bu listedeki kimlikler rapor içindeki adlardır. Örnekler: `D-Y2` = D raporunun yüksek 2; `C-D3` = C raporunun masaüstü 3; `C-P1` = C raporunun telefon 1; `B-4` = B raporunun 4. bulgusu.
- **Ekran sınırı:** `/app/schedule`, `/app/schedule/export`, `/app/schedule/templates`.

## Sayılar
- **A — backlog ve prototip:**
  - Schedule'a ait 108 açık madde. Bunların 85'i ekranın içinde: 54 geçerli, 7 değişmiş, 6 bayat, 18 ölçülmedi. 18 madde sınırda, 5 madde dışarıda.
  - Prototip cila listesi 42 madde: 37 taşı, 4 bırak, 1 Mert'in kararı.
  - KARARLAR'da olup kodda olmayan 13 kalem.
- **B — güvenlik:** kritik ya da yüksek bulgu yok; 5 orta, 4 düşük.
- **C — görsel:** 8 yeni kusur, ayrıca 8 bilinen maddeye yeni ölçü. 3 bulgu WCAG AA'ya takılıyor.
- **D — kod ve davranış:** 5 yüksek, 9 orta, 6 düşük. 15'i backlog'da yoktu.

## İş listesi (önem sırasıyla, gruplu)

### 1. Veri kaybı ve düzenleme oturumu (en önce)
- **D-Y2.** 20 dakika hareketsizlikte kaydedilmemiş iş habersiz siliniyor; sunucunun kurtarma yolu atlanıyor. Karar S1.
- **D-Y3.** Düzenleme kilidi uyarı penceresinin son 1–2 dakikasında düşmüş oluyor. Ekran toparlamıyor; tek çıkış Discard.
- **D-Y1.** Undo yalnız ekranda geri alıyor; sunucuda değişiklik duruyor ve bir dakika içinde geri geliyor. Karar S2.
- **D-Y4.** Düzenlerken sayfa yenilenince ya da hafta değişince taslak boş görünüyor.
- **D-Y5.** İki yönetici aynı yayındaki haftayı düzenlerken birinin kaydedilmemiş değişikliği ötekinin ızgarasına biniyor.
- **B-1 + B-2 + B-3:** birbirini açan üç açık.
  - B-1: başka lokasyonun taslağına kaydedilebiliyor (BL-276 parça 3).
  - B-2: canlı yenileme kanalı yetki çekirdeğinin dışında; çalışan dinleyebiliyor, taslak kimliği sızıyor (YENİ).
  - B-3: kapsamı daralan müdürün açık düzenlemesi yaşıyor (BL-276 parça 3).
- **B-4 / D-O4.** Şablonda Overwrite:
  - başlamış vardiyayı onaysız siliyor (P09);
  - tek tıkla çalışıyor (UI-12'ye göre iki tık olmalı);
  - haftanın bütün lokasyonlarını siliyor. Hangi lokasyonların silineceği karar S3.
- **D-O6.** Başkası düzenlerken taslak silinebiliyor; düzenleyenin her kaydı düşüyor.
- **D-O9.** Kurtarma taslağı sessiz ve teknik adla oluşuyor; açılan taslak istenen taslak olmayabiliyor.
- **BL-292.** Yükte `note` anahtarı yoksa not sessizce siliniyor.
- **D-O2.** Şablon uygulanınca mola sıfırlanıyor.
- **D-O3.** Şablondaki atanmış vardiya açık vardiyaya düşünce kişiye söylenmiyor.
- **BL-238.** Pazar akşamı (Pacific) "bu hafta" kilitleniyor; saat UTC'ye göre hesaplanıyor (R3).
- **D-O1.** Yayındaki haftaya yeni eklenen vardiya "Live - published to employees" yazıyor.

### 2. Yetki ve güvenlik temizliği
- **B-5.** Export yetki kontrolü API rotasında, kendi listesiyle yapılıyor (BL-374 / BL-565 ailesi).
- **B-6 = BL-282.** CSV'de formül enjeksiyonu; önem low'dan medium'a çekilmeli. Çalışan kendi adına formül yazabiliyor.
- **B-7.** Önemli tarih ve kapalı gün okuması kapsamı API'de süzüyor.
- **B-8 = BL-280 parça 4.** Ölü ikiz rotalar; D raporunun D5 maddesindeki iki yeni ikiz rota da buraya eklenir.
- **B-9.** Küçük bilgi sızıntıları ve ipucusuz retler.
- **Yetki kuralları:** BL-159, BL-174, BL-224, BL-326, BL-412.

### 3. KARARLAR'da olup kodda olmayan
- **BL-681.** Görünüm modunda Unassigned satırı görünüyor.
- **D-O5 / A.** "Save as template" New Schedule menüsüne bağlı değil (YENİ).
- **BL-437 + BL-494.** Export panelinde haftalık e-posta kurma bölümü yok; dışa aktarma kuralını kimin düzenleyeceği kararı uygulanmamış.
  - **BL-101:** canlıda e-postayı tetikleyecek zamanlayıcı yok. Önce ücretsiz seçenek ölçülür (P06).
  - **D-D4:** e-posta bir alıcıya gitmezse kayıt yine başarılı sayılıyor.
- **BL-038.** Şablon kararlarının altısından biri tam uygulanmış.
- **BL-121.** Publish penceresinde "40+ scheduled hours" listesi yok.
- **BL-619.** "Changed after publishing" onaylı izni de sayıyor; KARARLAR M11 yalnız müsaitlik diyor.
- **BL-545.** Açık düzenleme oturumundaki taslak vardiya kapalı günde düşmüyor.
- **BL-318.** Export, Unpublish ve Save draft pencereleri eski stilde. Üç yeni örnek: Review auto-fill, Keep editing?, Review default hours (C-D15).
- **BL-685.** Sunucunun `confirm_scope` işareti web'e ulaşmıyor; BL-552 bu maddeye birleşti.

### 4. Erişilebilirlik ve klavye
- **C-D3.** Odak pencerelere girmiyor (hızlı düzenleyici, Export, Publish, Templates, Logo, Keep editing?); her boş hücre ayrı Tab durağı (leave high).
- **C-D4.** "2 open shifts" yazısının kontrastı 3,56:1; AA 4,5 ister.
- **C-D5.** Yayın durumu yalnız renkle söyleniyor; lokasyon noktasının açıklaması odaklanamıyor.
- **C-D1.** Hızlı düzenleyicide Delete tek tıkla siliyor; şeritteki Delete ise onay soruyor.
- **D-O8.** "Delete selected shifts?" penceresinde Enter her zaman siliyor.
- **Esc ve tıklama katmanları:** BL-608 (Esc katmanları yanlış sırada kapanıyor), BL-617 (karar S4), BL-458 (karar S5).
- **Öteki erişilebilirlik maddeleri:** BL-449, BL-450, BL-610, BL-612.
  - BL-450 için karar: kenar 3:1'e koyulaştırılır. Dayanak ILKELER P19 (kontrastı Claude seçer) ve CLAUDE.md §9 (WCAG AA).
- **BL-525.** Müsaitlik turuncusu ile izin kırmızısı yalnız renkle ayrılıyor. Mert'in "eski maddeler dahil" kararıyla bu turda; iki varyant gösterilir (P04).

### 5. Görünüm ve tutarlılık
- **Prototip cilası:** taşınacak 37 madde.
  - Şemsiye madde BL-618; ayrıca BL-609, BL-611, BL-613, BL-615.
  - Liste A raporunun Tablo 2'sinde.
- **C-D2.** Mouse ile logoya tıklayınca hafta bugüne atlıyor; logo penceresi açılmıyor.
- **C-D6.** "Keep editing?" penceresi öbür pencerelerden farklı ve süre dolunca ne olacağını söylemiyor; D-Y2 ile birlikte yapılır.
- **C-D7.** "Review default hours" penceresi stilsiz.
- **C-D8.** Çakışma kartı Cancel düğmesini örtüyor.
- **C-D9.** Vardiya düzenleyicisinin içinde hiza ve boyut tutarsız.
- **C-D10 = BL-578.** Izgaranın üstünde boş 42 px bant; masaüstünde de var.
- **D-O7 = BL-395 genişler.** Ekrana ham hata metni çıkan yer sayısı 6'dan 15'in üstüne çıktı; önem low'dan medium'a.
- **Küçükler:**
  - BL-194, BL-236, BL-327, BL-371, BL-403, BL-441, BL-448, BL-451, BL-457, BL-499, BL-522, BL-524, BL-570, BL-577, BL-614, BL-655;
  - D-D1 (taslağın üstüne kaydetmenin iki yolu farklı çalışıyor), D-D2 (Auto-fill mesajında tekil/çoğul hatası), D-D3 ("Someone is editing" uyarısı tek lokasyonu izliyor);
  - C-D12 hafta değişince düğmelerin 8 px kayması, C-D14, C-D16 (iki Templates yüzeyi);
  - C raporunun "Küçük" listesi.

### 6. Telefon ve dar ekran
- **C-P1 = BL-587 genişler.** All locations ve All employees süzgeçleri de sağdan taşıyor.
- **C-P2.** Telefonda ad sütunu ekranın %51'i; üst yüzey 4 satır.
- **BL-233.** 768 px'te Export düğmesi süzgecin üstüne biniyor.
- **BL-334.** İkon düğmesi parmakla basmak için küçük.
- **BL-580.** Unpublish penceresi telefonda 8 px kayık.
- **Ölçülecek:** BL-573, BL-574, BL-320, BL-333. BL-333'e 375 px'te bakılacak; 390 px'te düzelmiş görünüyor.
- **Varyant gerekenler (P04):**
  - BL-445: üst çubuğun dar penceredeki hâli;
  - C-D11: tek lokasyonlu haftada Pazar görünmüyor;
  - C-P2: telefon düzeni.

### 7. Kod sağlığı ve test
- **Ölü kod:**
  - BL-616, BL-391, BL-168, BL-346, BL-453;
  - eski Export bileşenleri (D raporu D5 maddesi);
  - BL-110'un Schedule kısmı kapandı.
- **Büyük dosyalar:** BL-386 (sayfa 3637 satır), BL-376 (rota dosyası 2638 satır). Izgara modeli her çizimde baştan kuruluyor: BL-275.
- **Test boşlukları:** liste D raporunun "Test boşlukları" bölümünde. Her düzeltme kendi testini getirir (CLAUDE.md §5 adım 4).
- **Ölçülmedi:** BL-191, BL-211, BL-315, BL-442, BL-454, BL-526, BL-537, BL-544, BL-579 (karar S6).
- **BL-562.** CI'daki 50 ms testi; ekrana bağlı değil, ayrı.

## Sınırda ve dışarıda
- **Sınırda:** 18 madde, A raporunun Tablo 1'inde.
  - Takas kurtarma (BL-189, BL-167) Requests ve Shift Hub ekranlarına gider.
  - Önemli tarih ve lokasyon maddeleri (BL-548, BL-549, BL-551) kendi ekranlarına gider.
- **Dışarıda:** BL-050, BL-067, BL-122, BL-123, BL-126 (MVP sonrası ya da büyük karar).

## Bu keşifle kapanan maddeler (2026-10-05)
- **Bayat çıktı, kanıtıyla kapandı:** BL-062, BL-206, BL-319, BL-527, BL-540.
- **Birleşti:** BL-552 → BL-685.

## Mert'e sorulan kararlar
S1–S6 ve CLAUDE.md'deki aktif program satırı 2026-10-05'te soruldu. Cevaplar aşağıya yazılır.

## Mert'in seçimleri
(cevap bekleniyor)

## Kapanış durumu
Açık: keşif bitti, sırada karar ve görev dosyası (`docs/plan/tasks/EKRAN-01-SCHEDULE.md`).
