# Add / Edit shift penceresi: yeni hâl (Form ⇄ Timeline)

- İlk istek: Mert, 2026-10-12 15:41 (Kaliforniya), thread "Vardiya ekleme ve düzenleme pencereleri": "add/edit shift window için Orjinal tasarımı geliştirmek istiyorum. bir de küçük bir geçiş tuşuyla Day timeline varyasyonuna geçiş yapmak istiyorum … daha temiz, daha kullanışlı ve daha profesyonel … kendi özgür iraden ve yeteneklerin ile". Mert ayrıca kendi dokunuşlarını ekleyecek.
- Önceki tur: 2026-10-09'da aynı pencereler için beş aile (Compact card, Side panel, Keyboard first, Day timeline, Grows from the cell). Bu sayfa onların yerine geçer: Original'in sıkılaştırılmışı + Day timeline'ın sıkılaştırılmışı, tek pencerede. Aynı bağlantıdaki önceki yayın (2026-10-10, Original + beş aile) `/mnt/project-files/pages/schedule-vardiya-pencereleri/yayin-2026-10-10.html` dosyasında saklı.
- Yayınlandı: 2026-10-12 17:08 (Kaliforniya), sürüm 5.
- Sayfa: `index.html` (tek dosya, ~8 MB). Gerçek Schedule kodu (main `6165af0f`) + örnek veri. Yayın: https://claude.ai/artifact/JLkkPNRt2bhD5DNSsZxWoH (aynı bağlantı, yeni sürüm).
- Varyant geçişi: sayfanın sol altındaki "Test page" düğmesi → "Add / Edit shift window": Original (main) ya da New. Aynı menüde "New window opens in" (Form / Timeline) ve saat biçimi (12h / 24h, sayfa yeniden yüklenir). "Ne değişiyor?" düğmesi Türkçe açıklamayı açar.
- Nerede bakılır: önce düzenlemeyi aç: Schedule → sağ üstteki taslak düğmesi (New Schedule) → "Edit live schedule" ya da bir taslağın "Edit" düğmesi. Sonra bir vardiya kartına çift tıkla (Edit shift), çalışan satırında boş hücrenin üstüne gel ve "Add shift"e bas (Add shift), en üstteki Unassigned satırında aynısı (açık vardiya).

## Yeni pencere
Tek pencere, iki görünüm. Sağ üstteki iki simgeli küçük düğme (ya da Alt+T) Form ile Timeline arasında geçer; seçim hatırlanır, pencere bir dahaki sefere aynı görünümde açılır. Geçişte imleç aynı alanda kalır.

**Her iki görünümde ortak**
1. Başlık: kim, hangi gün, hangi lokasyon tek satırda (bugün pencerede yazmıyor). Kartın üstündeki küçük ok pencereyi hücreye bağlar; başlıktan sürüklenir.
2. Saat en üstte ve imleç içinde açılır: "10", "00", "a", sonra bitiş, Enter kaydeder. Yanında süre; altında ücretli saat, ertesi güne taşma, haftalık saat (öncesi → sonrası, 40 saati geçerse sarı "overtime"), kişinin o saatte izni ya da müsait olmadığı işaret varsa sarı uyarı.
3. Satır düzeni: solda kısa etiket, sağda değer; Type, Break, Job, Labels, Note, Badge. Pencere bugünkünden belirgin kısa.
4. Düzenlemede değişen satırın etiketinde yeşil nokta; üstüne gelince eski değer.
5. Not tek satırla başlar, yazdıkça büyür; sayaç yalnız sınıra yaklaşınca. Ctrl+Enter nottan kaydeder.
6. Kaydetmeden önce sarı kutu: kural kutusunun söyleyeceği ilk uyarı (çakışma, dinlenme süresi). Kaydet'e basınca bugünkü kural kutusu ve not kartı aynen çıkar.
7. Alt çubuk: Delete (iki tık, kırmızı) solda; Cancel beyaz; Save yeşil, üstünde Enter işareti.
8. Düzenlenen kart ızgarada yumuşak bir halkayla nefes alır; boş hücreye eklerken hücre yeşil çerçeve alır (2026-10-09 listesindeki "açık pencerenin hücresini belirt" maddesi).

**Form**: 404 px, satırlar alt alta. Açık vardiyada en üstte "Who" (listede her kişinin yanında Free / Busy / Unavailable / Time off ve haftalık saati; boşta olanlar üstte) ve kaç tane.

**Timeline**: 720 px.
- Günün çizelgesi (05:00 → ertesi 05:00). Vardiya çubuğu sürüklenir, kenarlarından uzatılır (15 dakika adım; klavyede ok tuşları, Shift+ok bir saat; çubukta Enter kaydeder). Boş yere sürükleyerek yeni saat çizilir.
- Kişinin o günkü öteki vardiyaları renkli soluk kutular, müsait olmadığı saatler turuncu taralı, onaylı izin kırmızı.
- Üstte ince eğri: o lokasyonda o gün her saatte kaç kişi çalışıyor ("On shift · up to 7"). Fareyle gezerken saat ve o anki kişi sayısı.
- Açık vardiyada işi alabilecek herkes satır satır; her satırda o kişinin günü ve vardiyanın kesik çizgili gölgesi, çakışma göz önünde. Satıra basmak ya da çubuğu o satıra sürüklemek vardiyayı o kişiye verir; "Leave open" satırı açık bırakır.

## Görüntüler (`ekran/`, 1440 genişlik)
`0-original-edit`, `0-original-acik-vardiya` (bugün) · `1-form-edit`, `1-form-acik-vardiya` · `2-timeline-edit`, `2-timeline-acik-vardiya` · `3-timeline-cakisma-uyarisi` (meşgul kişiye verince sarı uyarı) · `4-timeline-24-saat`.

## Tarayıcıda denenenler (Chromium)
Düzenle: "1000a" "0630p" yazıp Save → kart 10:00 AM – 6:30 PM. Timeline'da çubuğu sürükle + ok tuşları + Enter → kart 2:00 PM – 7:00 PM. Açık vardiyayı satıra basarak kişiye ver → kaydedildi. Delete iki tık → kart silindi. 24 saat: "0730" "1545" doğru. Alt+T sonrası imleç aynı kutuda.

## Bilinmesi gereken
- Davranış (kaydetme, silme, kural kutusu, not kartı, "changed by someone else") main'in kodunun aynısı (`source/editor/brain.tsx`). Yalnız görünüm ve kullanım değişiyor.
- Demo sunucusu aynı kişiye çakışan iki vardiyayı reddetmiyor; gerçek veritabanı reddeder.
- Kopyalanan vardiyayı yapıştırma (Paste) penceresi bu işin dışında, main'deki gibi.
- Saat kutuları main'in kutusu (`TimeInput`), yalnız görünüşü değişti; Enter son bölmede kaydeder (main'deki gibi).
- Gerçek koda geçerken değişecek yerler: `apps/web/src/schedule/components/ShiftQuickEditor.tsx` (pencere), `styles.css` içindeki `.schedule-quick-editor` ve `.schedule-shift-form` kuralları. Timeline'ın verisi zaten ızgarada var (vardiyalar, `weekly_availability`); yeni arka uç işi gerekmiyor. Seçilen görünümün hatırlanması kişisel tercih olarak saklanmalı (bugün sayfada tarayıcıda).
- Kaynak: `source/` (repo'da `apps/web/.temp/sw2/` altına kopyalanır; `pnpm exec tsc -p .temp/sw2/tsconfig.json`, `pnpm exec vite build --config .temp/sw2/vite.config.ts`, `node .temp/sw2/inline.mjs <çıktı>`; yayından önce `python3 /mnt/project-files/pages/kaynak-bandi/bant.py <çıktı> JLkkPNRt2bhD5DNSsZxWoH`).
- Bu sayfa telefonda açılmaz: Schedule telefonda kapalı.

## 2026-10-12 akşam: Mert'in dokunuşları (sürüm 6)
Mert'in isteği (proje sohbeti, 18:17 Kaliforniya): Job ve Labels listeleri alt çizginin arkasında kesiliyor; Type en üste; pencere boyu ve eni hiç kaydırma çubuğu açılmayacak gibi; Timeline'da da aynısı; Save'den Enter işareti kalksın; Timeline'da vardiyayı en sağa dayayıp sol kenarını sağa itince kaydırma çubuğu açılıyor ve ekran oynuyor (kök neden).
1. **Kök neden:** kişi satırlarının kutusu kendi içinde kayabilen bir alandı (dikey kaydırma için). En sağa dayanan çubuğun tutamacı satırdan 4 px taşıyordu; tarayıcı bu yüzden o kutuya yatay kaydırma çubuğu açıyordu. Çubuk pencereyi 15 px uzatınca pencere ekrana sığmak için yukarı kayıyordu; sarı kural kutusu açılıp kapanınca da aynı şey oluyordu. Düzeltme: pencerede hiçbir kaydırma alanı yok (`overflow: clip`), tutamaçlar çubuğun içinde, çok kısa çubuk satırdan taşmıyor; pencere açıkken yerini korur, kural kutusu için baştan yer ayrılır (sürükleme boyunca pencere 1 px bile oynamıyor, `ekran/8-…`).
2. Aynı yerde bulunan ikinci hata: başlangıç saati gece yarısını geçince vardiya günün başına (sabah 4:45) atlıyordu. Başlangıç artık en geç 11:45 PM; bitiş ertesi sabaha uzayabilir.
3. **Listeler:** pencerenin içinde kesilmez; aşağıda yer yoksa yukarı açılır, ekrandan taşmaz (`ekran/6-…`, `7-…`).
4. **Type en üstte** (Form ve Timeline).
5. **Boyut:** pencere içeriği kadar uzun; ekran kısaysa ikinci sütun yana geçer (Form 760 px, Timeline 1040 px), gerekirse Timeline'daki kişi satırları 40 px'ten 28 px'e iner, yine sığmazsa fazla kişiler tek "N more people" listesine girer (`ekran/9-…`, `10-…`). Denenen ekranlar: 1440×900, 1366×700, 1280×600, 1280×470; hiçbirinde kaydırma alanı yok.
6. Save düğmesinde Enter işareti yok; Enter yine kaydeder.
7. Açık vardiyada "Who" listesindeki "Leave open" artık "Open" (Timeline'daki satır da). Yanındaki sayı kutusu, sistem teması ne olursa olsun beyaz zemin ve koyu rakamla çizilir; odakta içten yeşil çerçeve.
