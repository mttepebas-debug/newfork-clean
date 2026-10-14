# Birleşik Schedule sayfası (2026-10-09, gece thread'i)

- Yayın: https://claude.ai/artifact/RNJEGWCDgdG2NpYRpWF4g3 (Schedule test sayfasının bağlantısı, sürüm 9). Koordinatörün isteği: Mert 2026-10-09 10:35Z "artifactları merge et … seçim yapmış olduğum bir şey varsa kaybolmasın".
- `index.html`: madde madde karar listesi (Seçildi · tarih · kaynak sayfa / Yarı karar / Karar bekliyor / Reddedildi) + sekmeli deneme alanı (iframe).
- Yayında `pages/*.html` olarak giden sayfalar:
  - `pages/test.html` = bu klasördeki `test.html` (kaynak `source-test/`): gece dalı `claude/project-thread-rei7pj@8f4f42d5` (main 8151ba9d + madde 1, 3, 4, 15, 16 seçimleri) ile derlendi. Templates varyantları çıkarıldı (vite takma adı silindi; menüde "A, B and C were turned down on Oct 9"). Time off rule düğmesi duruyor (madde 6 tıklama sorusu). Demo veri anahtarı `newfork.scheduleMerged.world.v1` (pencereler sayfasıyla çakışmasın diye).
  - Öteki sayfalar `../guncel/` altındaki gece kopyalarının aynısı; başına yalnız `<!doctype html>`, charset ve viewport eklendi.
- Eski sayfaların kaynakları ve bağlantıları silinmedi (`../schedule-test/`, `../schedule-vardiya-karti/` vb.).
- Yeniden derleme: `source-test/` → `apps/web/.temp/birlesik-test/`, `tsc -p … --noEmit`, `vite build --config .temp/birlesik-test/vite.config.ts`, `node .temp/birlesik-test/inline.mjs <çıktı>`; sonra başına doctype satırı ekleyip `pages/test.html` olarak yayınla.

## 2026-10-09 ek: eski Code varyantları (sürüm 10)
Mert 10:35Z "en azından elimizde daha fazla varyant olur": açık maddelere eski Code oturumlarının varyantları eklendi, aynı olanlar tek kopya, iki kaynak yazılı.
- Madde 10 hayalet vardiya → `vardiya-karti.html` (kaynak `source-vardiya-karti/`): 26 Eylül turu "Old 2–10, 12–15" (`archive/ghost-color-mockups`@c79991d1, `vk/vk.css` sonu). 26 Eylül 11 / 11b = Original.
- Madde 5 Export → `ust-cubuk.html` (kaynak `source-ust-cubuk/`): 16 Eylül A, B, C (`6cddda16`) ve E, F (`43001d3e`), `variants/old-export/`. 16 Eylül D = Original.
- Madde 2 New Schedule → 28 Eylül stil A ve C (`archive/schedule-dialog-mockups`@0b2f998c, `variants/old-windows/`); stil B = Original. Bu stiller bütün sağ üst pencereleri boyar.
- Madde 7 üst çubuk → B ve C, 6 Ekim varyant turunun (`archive/var-ekran-12`@d7c4130b, BL-445) B ve C'si ile aynı; Original = 6 Ekim A.
- Tek lokasyonlu hafta (eski #87, C-D11) → `test.html` "One-location week": 6 Ekim B ve C (`archive/var-ekran-12`). B yalnız 7 sütunlu (tek lokasyon) ızgarada uygulanır.
- Eklenmeyenler: madde 11–14 için eski varyant yok (4–5 Ekim prototipi öbür hesapta); kararlı maddelerin (1, 3, 4, 6 görünüş, 15, 16) eski varyantları kural gereği eklenmedi; 6 Ekim telefon düzeni (C-P2) Schedule telefonda kapalı olduğu için eklenmedi.
- Yeniden derleme: her `source-*` klasörü `apps/web/.temp/<ad>/`'a kopyalanır, `vite build --config .temp/<ad>/vite.config.ts`, `node .temp/<ad>/inline.mjs <çıktı>`, başına doctype + charset satırı (`pages/` altında yayınlanan hâl).
