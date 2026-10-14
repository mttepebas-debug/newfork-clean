# Ghost kart: asıl vardiyanın kendi renginde, ölü tonda

- **Seçilen: I** (Mert, 2026-10-12 18:04 Kaliforniya, bu thread). Gerçek kodda yazı AA için biraz koyulaştırıldı (#5f6965, en düşük 5,29:1); çerçeve ve zemin I'deki gibi yarı güçte, kendi renginde. Kod: dal `claude/project-thread-nezlm0` @ `79b657c7`. Canlı görünüm: https://claude.ai/artifact/S9fM4Yfc7SLhro3frLo9gL (sürüm 6).

- Kaynak istek: Mert, 2026-10-12 04:17 (Kaliforniya), thread "Vardiya kartı, hayalet vardiya ve sürükleme": "ghost shift badge'in rengi, o badge'in yansıması olduğu orijinal shiftin rengi ne ise o renkte olsun. Sadece ölü bir tonda. Ama yüzde yüz orijinal shifti yansıtsın."
- Sayfa: `index.html` (küçük kabuk, kaynak bandı) + `app.html` (tek başına açılan asıl sayfa, ~8 MB). Kod bu thread'in dalından (`claude/project-thread-nezlm0` `d7cfcd82`: kart ve ızgara bugünkü main'le aynı, silinen vardiya düzeltmesi dahil); main'e sonradan giren Announcements / Important Dates değişiklikleri yok, çünkü o kodla kurulan sayfa yayın kontrolüne takılıyor ve bu sayfanın konusu değil. Ayrıca yayında: https://claude.ai/artifact/SKVYPZu4hnDupzU7Jn1xWo (sürüm 3). Görsel kararlar sayfasına gömülecek dosya: `app.html`.
- Varyant geçişi: sayfanın sağ altındaki "Test page" düğmesi → Original, A, B, C, D, E, F, G, H, I, J.
- Nerede bakılır: Schedule düzenleme modu (New Schedule → Edit live schedule), Harbor & Vine Downtown bölümü. Ghost kartlar: Emma Wilson (yeşil Lunch-Server), Grace Murphy (pembe Close-Bartender), Marcus Reed (mor Dinner-Line Cook). Gerçek kartlarla karşılaştırma: Carlos Rivera (yeşil), Jake Thompson (mor), Daniel Kim (pembe Cuma).
- Ekran görüntüleri: `ekran/original.png`, `ekran/a.png` … `ekran/j.png` (1440 genişlik, aynı kesit; 2026-10-12 akşam yeniden alındı).
- Kaynak: `source/` (repo'da `apps/web/.temp/gk/` altına kopyalanır; yanına sahte değerli bir `.env` gerekir (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL); `node .temp/gk/inline.mjs` çıktısı `<!doctype html><html><head><meta charset="utf-8"></head><body>` … `</body></html>` ile sarılıp `app.html` olur; `vite build --config .temp/gk/vite.config.ts`, sonra `node .temp/gk/inline.mjs <çıktı>`).

## Varyantlar
Hepsinde çerçeve, yerleşim, yazılar ve konum iğnesi asıl kartla aynı; yalnız renk değişir. Yazılar asıl kartın yazı renginde (en kötü zeminde bile 5:1'in üstünde). Hareket yok.
- **Original:** bugünkü main. Bütün ghost'lar tek ölü gri taramalı.
- **A · Ölü ton:** asıl kartın renk formülü, renk griye doğru yarı yarıya söndürülmüş.
- **B · Soluk:** aynı renk, çok açık; asıl kartın solmuş baskısı gibi.
- **C · Ölü ton + tarama:** A'nın rengi, bugünkü ghost'un ince taraması kendi renginde.
- **D · Soluk ve içe çökük:** 11 Ekim'deki tarif (öteki sayfadaki "Atanmadığı lokasyondaki hücre" maddesinin D'si): soluk renk, üst kenarda kendi renginde iç gölge.
- **E · Rengi %70 çekilmiş asıl kart:** birebir asıl kart, renginin %70'i alınmış.
- **F · Ölü ton + kesikli çerçeve:** A'nın rengi, çerçeve kesikli.

### Basılamayan düğme gibi (Mert, 2026-10-12 14:04 Kaliforniya: "tıklanamayan buton gibi disabled, canı gitmiş cansızlaşmış")
Hepsi bir arada: `ekran/g-j-ozet.png`. G–J düz, gölgesiz; yazı gri ve normal kalınlıkta. G, H, J'de yazı AA'yı (4.5:1) tutuyor; I tutmuyor.
- **G · Kapalı düğme:** gri zemin, gri yazı; kendi rengi yalnız sol kenarda ince bir çizgi. En "kapalı" görünen.
- **H · Rengi çekilmiş:** kendi rengi neredeyse griye inmiş, yazı gri. Rengin izi kalıyor ama canlılığı yok.
- **I · Yarı saydam:** asıl kartın kendisi, yarı saydam (klasik "disabled düğme"). Yazı ~2.5:1, AA'nın altında: seçilirse yazı ayrıca koyulaştırılmalı.
- **J · Buzlu:** kendi rengi beyaz bir tülün altında; açık ve soluk, yazı gri.

## Bilinmesi gereken
- Bugünkü kararı değiştirir: KARARLAR "bütün hayaletler tek ölü gri" (2026-09-26, satır ~446). Seçilen varyant o satırın yerine yazılır.
- Örtüşme: "Atanmadığı lokasyondaki hücre ve ghost kartın rengi" maddesinin D varyantı da ghost kartı kendi renginde yapıyor. İkisi aynı soru; bir yerde karar verilince öteki de kapanır.
- Gerçeğe geçerken: Yöneticinin göremediği lokasyondaki ghost bugün yalnız vardiya tipinin adını taşıyor, rengini taşımıyor (`ShiftCard.tsx` `GhostShiftMetadata`). Tip listede yoksa kart varsayılan yeşil-gri renge düşer; tam yansıma için sunucunun tipin rengini de göndermesi gerekir (küçük bir şema eki).
