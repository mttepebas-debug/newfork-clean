# Important Dates çekmecesi (A + L1): kapsam önerisi

Tasarım: https://claude.ai/artifact/Pt7K2NVLwFx6TPS9ZuXNKX (Mert'in 2026-10-07 onayı).
Karar kaydı: `docs/plan/KARARLAR.md` → "Important Dates çekmecesi A (Stacked)", maddeler (1)–(9).
Ölçüm: main `aac05f76`, 2026-10-10.

## Anladığım

**Ne:** Onaylı çekmece tasarımı gerçek uygulamaya girecek.
**Nerede:** sol menü → Important Dates → bir satıra ya da "New date" düğmesine basınca sağdan açılan çekmece.
**Kim:** owner ve admin bütün lokasyonları görür ve seçer; manager yalnız kendi lokasyonunu görür, seçimi kilitli (KARARLAR K1).

Tasarımda olanlar:
1. Üç sekme: **Details · Shifts · History**.
2. **Details:** Title, Type, Repeats, Starts / Ends; altında saat kutuları ve "All day" (varsayılan işaretli); Locations tablosu; Note kalan boşluğu doldurur.
3. **Locations tablosu (L1):** satır başında onay kutusu; başlıkta "All locations" kutusu (bir kısmı seçiliyse yarım işaret); seçilmeyen satır gri ve "Not included"; seçili her satırda **Open / Short hours / Closed**; Short seçilince o satırda Opens / Closes saatleri; satır sonunda o lokasyonun vardiya etkisi ("2 removed · 1 kept"). Hiç lokasyon seçili değilse Save kapalı ve "Choose at least one location.".
4. **Shifts sekmesi:** o gün kapanan ya da saati kısalan lokasyonlardaki yayınlanmış vardiyalar; her birinde **Remove / Open shift / Keep**; kapalı günde varsayılan Remove.
5. **Alt şerit:** etki cümlesi ("3 shifts will be removed · 1 kept") ve "Review shifts"; sol altta iki tık kırmızı Archive; sağda Cancel ve yalnız **Save** (değişiklik yokken kapalı).
6. **History:** "Changed by <ad>", tarih ve saat, eski → yeni ("Beşiktaş: Open → Closed"); müdürün yönetmediği lokasyondaki değişiklik "Hidden change".

**Bugün (main):** düğme "Save date", lokasyon seçimi açılır liste, sekme yok, History yok. Kapalılık kayıt başına tek tür ("Closed day"): bir lokasyon açık, öteki kapalı olamaz; kısa saat hiç yok. Yayınlanmış vardiyası olan güne Closed day kaydedilemiyor (BL-882): sunucu vardiya listesinin görüldüğünü istiyor, ekran listeyi hiç göstermiyor.

## Ne değişecek (katman katman)

1. **Veritabanı (incelemeli ve riskli sınıf):**
   - Her lokasyonun o günkü durumu (Open / Short hours / Closed) ve kısa saatleri saklanır.
   - "Closed day" türü kalkar; kapalılık lokasyon satırına geçer (ikiz sistem olmasın diye, CLAUDE.md §3.A.4).
   - **Remove yeni:** yayınlanmış vardiya silinir, kişiye bugünkü tek bildirim gider (K14: "Kadıköy is closed on Oct 24 — your shift was removed"). **Open shift** bugünkü davranış (kişi düşer, vardiya açıkta kalır). **Keep** dokunmaz.
   - Kısa saatte saatin dışına taşan vardiyalar da listeye girer.
   - Schedule'ın kapalı gün okuması (`schedule_closures` görünümü) ve Settings → Conflict handling → Closed location kuralı yeni kaynağı okur; davranışları aynı kalır.
   - Var olan önemli tarih kayıtları yeni biçime çevrilir (canlıda gerçek veri yok, hepsi test verisi).
2. **API:** kaydetme ve önizleme uçları yeni alanları taşır; Schedule okumasındaki API'nin kendi önemli tarih süzgeci kalkar (BL-701).
3. **Ekran:** çekmece tasarımdaki gibi baştan; History sekmesi (BL-885); kapanış sonucu satırları ("3 shifts stay open", BL-884); çekmecedeki ham sunucu cümleleri yerine okunur metin (BL-886'nın çekmeceye düşen kısmı).
4. **Schedule:** gün başlığında kısa saat bilgisi (soru 4'e bağlı).

## Bitti ölçütü

- Tasarımdaki dört örnek gün gerçek uygulamada çalışır, owner ve manager için: hepsi kapalı (Jul 4), biri kapalı (Thanksgiving), kısa saat (Christmas Eve), tek lokasyon (Health inspection).
- Yayınlanmış vardiyası olan güne kapanış kaydedilir; Shifts sekmesinde seçilen Remove / Open shift / Keep sunucuda aynen uygulanır (BL-882 kapanır).
- Testler: pgTAP (manager başka lokasyonu kapatamaz; Remove yalnız yetkili lokasyonda; seçim bayatlayınca kayıt reddedilir), vitest, Playwright akışı. `nf-guvenlik` ONAY. Masaüstü 1440 ve telefon 390 görüntüleri.
- Trenle main'e; canlı veritabanına Mert'in o thread'de yazdığı "evet"iyle.

## Kapsam dışı

- Bildirim sisteminin yeniden kurulması (BILDIRIM işi). Remove bugünkü K14 bildirimini kullanır.
- Important Dates liste sayfasının görünümü. Yalnız Type süzgeci ve Impact sütunu yeni veriyi okur.
- Saat dilimi sorusu (`docs/plan/SORULAR.md` satır 299).

## Eksik ya da yanlış olabilecek

- **Değişen eski karar:** K13 "kapalı günde varsayılan open'a düşsün" çekmece kararı (6) ile ters çevrildi; varsayılan artık Remove. K16 (taslak haftadaki vardiya sorulmadan open'a düşer) değişmedi, aynen kalır. K15 (tarih silinince düşen vardiya geri gelmez) Remove için de geçerli.
- **Remove geri alınamaz:** silinen yayınlanmış vardiya tarih arşivlenince geri gelmez; Schedule'daki Undo da geri getirmez (bugünkü kapalı gün kuralı, DB-1c).
- **Type listesi:** tasarımda yalnız Holiday ve Event var; bugün Blackout ve Closed day de var (soru 3).
- **Demo adlar:** tasarım sayfasında lokasyonlar Türkçe (Kadıköy…); uygulama ve testler ABD İngilizcesiyle.
- **Telefon:** 390 genişlikte üç lokasyonlu owner görünümünde çekmece içinde kaydırma kalıyor. Gerçek ekranın telefon görüntüsüyle ekran parçasında soracağım.
- **Test sınırı:** bu bulut thread'i veritabanı testlerini ve Playwright'ı koşamaz (Docker yok); onları bilgisayarındaki Claude koşar.
- **Büyüklük:** veritabanı fonksiyonlarının yeniden yazılması, iki inceleme turu ve canlı adım var; tek seferlik küçük iş değil.

## Bence

- **Tek dal, üç parça (veritabanı + API → çekmece → Schedule), tek tren.** Neden: eski çekmece yeni veri modeliyle çalışmaz; yarım parça main'e giremez. Her parça kendi commit'lerinde, inceleme sonda bir kez.
- **Elenen: "önce yalnız BL-882'yi eski çekmecede düzelt".** Eski çekmeceye vardiya listesi eklemek, birkaç gün sonra atılacak iş olur; tasarım zaten onaylı.
- **Elenen: "Closed day türünü koru, yanına lokasyon durumu ekle".** Aynı şeyi söyleyen iki kaynak olur (ikiz sistem, CLAUDE.md §3.A.4).
- **Artısı:** tasarım birebir; BL-882, BL-884, BL-885, BL-701 aynı işte kapanır. **Eksisi:** büyük ve riskli veritabanı değişikliği; inceleme ve canlı adım uzun sürer.

## Sorular (karar kartlarında)

1. Kapsam onayı.
2. Kısa saatli günde varsayılan seçim (DURUM B12).
3. Type listesi: yalnız Holiday ve Event mi?
4. Kısa saat Schedule'da nasıl görünür, saat dışına yazılan vardiya uyarır mı?
5. "All day" kapalıyken girilen saat yalnız bilgi mi (DURUM B13)?
