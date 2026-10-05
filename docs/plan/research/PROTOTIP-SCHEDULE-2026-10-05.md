# Schedule prototipi — derin taşıma turu sonuçları (2026-10-04/05)

Bu dosyayı kayıt oturumu `local_d96f34f3…` yazdı. Kaynak, beş alt ajanın (S1–S5) kontrol listeleri ve raporları.

Ajanlar Schedule sayfasını prototipe taşırken iki kaynağa baktı:
- gerçek uygulamanın kodu: `origin/main` `5c713433`…`cc96650d`; `apps/web/src/views/SchedulePage.tsx`, `apps/web/src/schedule/**`, `styles.css`;
- çalışan uygulama: 127.0.0.1:5555, yalnız okundu.

Kontrol listeleri oturumun geçici klasöründe duruyor (`sched-audit/S1.md`…`S5.md`); kalıcı özet bu dosya.

- **Prototip:** https://claude.ai/artifact/SmqEkabujEfXHCktUxqbbK. Özeldir, paylaşılmayacak (Mert, 2026-10-04); çalışan listesinde Mert'in e-posta adresleri var.
- **Mert'in isteği (2026-10-04):**
  - "orjinal appteki schedule sayfasının kodunu, arayüzünü, tıklamalarını, animasyonlarını, filtreleri, filtrelerin birbiriyle çalışma prensiplerini … geride hiçbirşey bırakmadan … artifacta taşısın"
  - "geçiş sürecinde her şeyi polish ederek geçirirsen mutlu olurum. Sadece eksik ya da yanlış ya da orjinal appten bile daha kötü seviyede bir şey kalmasın arkada."
- **Kural:** davranış birebir aynı kalır; görünüm aynı ya da daha iyi olur; her cila not edilir.

## Sonuç

| Dilim | Konu | Madde | Gerçekle aynı | Cilalı | Mümkün değil |
|---|---|---|---|---|---|
| S1 | Üst çubuk, gezinme, filtreler, Settings menüsü | 112 (+2) | çoğu | 9 | 4 |
| S2 | Izgara görünüşü | 90 | 77 | 5 | 3 |
| S3 | Izgara etkileşimleri | 125 | çoğu | 12 | 2 |
| S4 | Vardiya penceresi, çakışmalar, müsaitlik | 109 | çoğu | 11 | 3 |
| S5 | Taslak, yayın, şablon ve Export pencereleri | 176 | 149 | 5 | 6 |

Toplu kontrol, hepsi aynı derlemede (2026-10-04 akşamı):
- `s1_test` 52/52, `s1_test2` 15/15.
- S3'ün dört etkileşim testi ve kapsam kontrolü geçti.
- S5'in 28 senaryosu geçti. S4'ün altı testinden H6 (klavye odağında müsaitlik balonu) birleştirmede düştü; S4 düzeltiyor, sonuç buraya eklenecek.
- Bütün sayfaların taraması hatasız ve taşmasız (46 görünüm); Schedule ızgara genişliği 56/56.

## Cila listesi

Bu noktalarda prototip gerçek uygulamadan iyi; hepsi gerçek uygulamaya taşınabilir (BL-618).

**S1 — üst çubuk**
1. Beyaz düğmelerde hover tonu (#f3f6f4); menüsü açık düğmede "açık" görünümü (kenar #95aaa1).
2. Basılı Hide Unscheduled ve aktif filtre düğmeleri hoverda koyulaşır (#dcebe4).
3. Amber "bu döneme dön" düğmesi hoverda koyulaşır (#fdeed6).
4. Filtre çipleri hoverda belirginleşir.
5. Renk geçişleri 0.12 sn sürer.
6. Basılamayan Publish düğmesi hoverda koyulaşmaz.
7. Takvimde odak halkası komşu günün altında kalmaz.
8. Menü açıkken ızgaraya tıklamak yalnız menüyü kapatır (karar sorusu: BL-617).
9. Çubuk 320 px çizgisinde, sayfa iskeletinin grisinde durur (Mert'in prototip kararı).

**S2 — ızgara**
1. Karttaki etiket, lokasyon ve saat satırları kendi renklerinde. Gerçekte `.schedule-shift-badge-content > span` (`styles.css` ~10817) üçünü de #596660 yapıyor.
2. Önemli gün ipucunda tür kelimeyle yazılır ("Event: Halloween").
3. Boş ızgarada "No employees" yazısı görünür.
4. Yatay kaydırma çubuğu odak halkası gösterir.
5. Gün toplamlarını ekran okuyucu okunur tarihle söyler ("Mon, Sep 28").

**S3 — etkileşimler**
1. Paste mode'da hücreler açık yeşil olur, imleç kopya imlecine döner.
2. Bildirim çıkınca durum etiketi yukarı kalkar.
3. Paste mode kapanınca kırmızı durum temizlenir.
4. Fareyle odaklanan kartta Enter ve Ctrl+C çalışır.
5. Odak varken boş tık ve Esc tek katman kapatır.
6. Discard penceresinde Esc pencereyi kapatır.
7. Çalışan çekmecesinde Esc yalnız çekmeceyi kapatır.
8. Menüler 120 ms'lik geçişle açılır.
9. Seçim halkası da geçişle belirir.
10. Uzun engel nedeni "…" ile kesilir; bırakma rengi baskın kalır.
11. Auto-fill penceresi 600 px; tarihler "Tue, Oct 6" biçiminde.
12. Varsayılan saat penceresinde aralıklar düzenli.

**S4 — vardiya penceresi**
1. Klavyeyle açılan pencere ekranın ortasında açılır.
2. 24 saatte dakika bitmeden sonraki alana atlanmaz.
3. Kural kutusu aynı cümleyi iki kez yazmaz.
4. İşaretli hücrede hover, çizgili deseni silmez.
5. Ad ipucunda günler ve saatler okunur biçimde yazılır.
6. Sürükle-bırak cümlelerinde gün ve saat okunur biçimde yazılır.
7. Seçim kutularının yazısı biraz daha büyük.
8. Pencere, kutu ve balonlar yalnız ilk açılışta kısa bir animasyonla açılır.
9. Çekmecede Esc yalnız çekmeceyi kapatır.
10. K17 "oturumda bir kez sor" çalışır (BL-606).
11. "Changed after publishing" etiketi C3 görünümünde; yalnız müsaitlik sayılır (M11; BL-619).

**S5 — pencereler**
1. Menüler ve pencereler kısa bir geçişle açılır; sistemde hareket azaltma açıksa geçiş kapanır.
2. Discard sorusu açıkken Esc arkadakileri kapatmaz.
3. Hareketsizlik penceresinde SAVE çalışır (BL-607).
4. Sihirbazdaki "Saved draft" alanı aynı görünümde özel bir liste. Bu prototipin kısıtı; içerik aynı.
5. Logo penceresinde pasif düğmeler soluk görünür.

## Gerçek uygulamada bulunan hatalar (backlog'a yazıldı)

- **BL-606** — K17 "oturumda bir kez sor" uygulanmamış: web her kapalı gün hücresinde yeniden soruyor (S4 E4).
- **BL-607** — Hareketsizlik penceresinde SAVE hiçbir şey yapmıyor. Pencere "No activity for 3 minutes." diyor; gerçekte uyarı 15 dakikada, kapanış 20 dakikada (`SchedulePage.tsx` ~789, ~2948; S5 E10, E13).
- **BL-608** — Esc ve boş tık katman hataları (S3, S4, S5):
  - Odak varken iki adım atıyor.
  - Discard penceresi Esc'i yok sayıyor; aynı Esc arkadaki katmanı kapatıyor.
  - Çalışan çekmecesinde Esc filtre kaldırıyor ve bu haftaya atlıyor.
- **BL-609** — Paste mode geri bildirimi (S3, S4):
  - Hücrelerde işaret hiç görünmüyor; ilgili CSS kullanılmıyor.
  - Kırmızı durum kalıcı.
  - Durum etiketi, kural kutusu ve bildirimler alt ortada üst üste biniyor.
- **BL-610** — Klavye ve odak:
  - Fareyle odaklanan kartta Enter ve Ctrl+C çalışmıyor (S3).
  - Yatay kaydırma çubuğu odak halkası göstermiyor; WCAG 2.4.7 (S2).
- **BL-611** — Ekranda ham kodlar görünüyor (S2, S4):
  - önemli gün ipucunda "event: Halloween";
  - sürükleme cümlesinde "covers 2026-10-03 -.";
  - ad ipucunda tarih kodları.
- **BL-612** — Boş ızgarada "No employees" yalnız ekran okuyucuya söyleniyor (S2).
- **BL-613** — Vardiya penceresinde küçük hatalar (S4):
  - 24 saatte dakika bitmeden sonraki alana atlıyor.
  - Klavyeyle açılınca sol üste yapışıyor.
  - Kural kutusu aynı cümleyi tekrarlıyor.
  - İşaretli hücrede hover çizgili deseni siliyor.
- **BL-614** — Yayın bildirimindeki "N changes" değişen vardiyaları değil, yayınlanan bütün vardiyaları sayıyor (`result.published_shift_count`; S5 O03).
- **BL-615** — Logo penceresinde pasif düğmeler etkin gibi çiziliyor (S5).
- **BL-616** — `EnterEditModeDialog` hiç gösterilmiyor; ölü kod (S5 O01).
- **BL-617** — Açık menünün dışına yapılan tık alttaki öğeye de geçiyor: menü kapanırken vardiya da seçiliyor. Kodun yazılı niyeti yalnız menüyü kapatmak. Bilerek mi yapıldı? Kararı Mert verecek (S1 #8, S3 D6).
- **BL-618** — Yukarıdaki cila listesini gerçek uygulamaya taşımak.
- **BL-619** — "Changed after publishing" onaylı izni de sayıyor; M11 yalnız müsaitliği sayar diyor. S4 bunu bilinen hata diye not etti, ama backlog'da maddesi yoktu.

## Prototipte yapılamayanlar

Bunlar prototipin kısıtı, eksik değil.

- **Kalıcı bellek ve adres satırı yok.** Settings seçimleri sayfa yeniden yüklenince sıfırlanıyor; tarayıcının geri düğmesi filtrelere dönmüyor.
- **Ağ ve ikinci kullanıcı yok.** Bu yüzden şunlar gösterilemiyor:
  - "kaydediliyor" etiketi ve ağ hatası;
  - başkasının aynı anda değiştirdiği vardiya;
  - "N other viewers";
  - başkasının taslağını ezme onayı.
- **Verisi olmayan durumlar:**
  - kısmi kapanış işareti ("⊘N");
  - "No locations match";
  - Export'un engelli durumları;
  - "Previously accepted".
- **Tarayıcıya bağlı olanlar:**
  - tarayıcının kendi Edit menüsünden kopyalama ve yapıştırma;
  - Export önizlemesinin yeni sekmede açılması (yerine tam ekran bir katman var).
- **Telefon görünümü:** prototip 1920×1080 sabit boyutta.
