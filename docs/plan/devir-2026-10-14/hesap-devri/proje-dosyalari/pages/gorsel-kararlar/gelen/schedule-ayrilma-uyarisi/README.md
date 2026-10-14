# Schedule: düzenlerken başka sayfaya geçince çıkan uyarı penceresi

- Kaynak istek: Mert, 2026-10-12 13:24 (Kaliforniya), thread "Schedule düzenleme modunda kaybolan ilerleme": düzenleme modunda yanlışlıkla başka sayfaya tıklayınca "kaydetmek istiyor musun / emin misin" uyarısı çıkmıyor, iş tutarsız biçimde kayboluyor ya da sonradan boş sayfada beliriyor.
- Sayfa: `index.html` (tek dosya). Bugünkü Schedule "Discard unsaved changes?" penceresinin CSS'i birebir kopyalandı (`apps/web/src/styles.css` `.schedule-discard-*`), arkada sade bir Schedule düzenleme görünümü.
- Nasıl denenir: üstten varyant seç → soldaki menüden Employees / Announcements / Settings'e tıkla. Original'de hiçbir şey sorulmaz (bugünkü hâl).
- Sekme: Schedule.

## Varyantlar
- **Original:** bugün. Menüye tıklayınca sormadan sayfa değişir. Pencere yalnız şeritteki Discard'da çıkar.
- **A (önerilen):** bugünkü Schedule penceresi, üç düğme: Keep editing (beyaz) · Discard and leave (kırmızı) · Save draft (yeşil). Save draft bugünkü taslak adı penceresini açar, kaydedince seçilen sayfaya geçer.
- **B:** iki düğme (Stay here · Discard and leave), uygulamanın My Availability / Profile ayrılma penceresi gibi.
- **C:** A'nın düğmeleri; Save draft ad sormadan "Auto-save · Mert · saat" taslağı yapar.

## Bilinmesi gereken
- Davranış kararı ayrıca thread'deki karar kartında soruldu (sor / yalnız sor / sormadan kaydet). Kart "sormadan kaydet" çıkarsa bu pencere hiç yapılmaz.
- Kod önerilen A ile yazılacak; B ya da C seçilirse yalnız pencere bileşeni değişir (`apps/web/src/views/SchedulePage.tsx` içindeki ayrılma penceresi).
