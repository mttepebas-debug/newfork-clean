# Settings → Locations: artifact ve tasarım seçimi (EKRAN-10-LOCATIONS)

**Durum: ARA HÂL (2026-10-07 ~10:00Z, gece modu).** Mert'in kararı bekleniyor; son hâl değil.

- **Karar:** yok. Mert beş tasarımdan birini (ya da bir karışımını) seçecek.
- **İzin:** gerekmiyor. Yalnız belge değişti; kod, migration ve veri değişmedi.
- **Risk:** 🟢 Uygulamaya dokunulmadı. Artifact'lar özel, yalnız Mert'in hesabında.
- **Soru:** Mert'e: "A, B, C, D, E'den hangisi; karışım olur mu?"
- **Sonraki:** Sabah Mert'in seçimiyle artifact güncellenir. "Tamam" gelince bu dosya son hâle çevrilir. Koda uygulama ayrı iş olur ve onu koordinatör açar.

## Artifact'lar

| Ne | Bağlantı | Sürüm |
|---|---|---|
| Bugünkü sayfanın birebir kopyası (Mert'in ilk isteği: "artifacta gördüğü gibi kaydetsin") | https://claude.ai/artifact/Lru9WAg6HaSbdErLyMhU26 | 1 (`1791362235-ed21`) |
| Beş tasarım (Mert'in ikinci isteği: "5 tane artifact örneği sun. drawer dahil. mobil görüntü dahil") | https://claude.ai/artifact/UWTcHirMHXjrfa9TND2TLE | 1 (`1791364478-45ed`) |

**Birebir kopya:** Masaüstü 1440'ta gerçek DOM ve gerçek CSS kullanıldı. Kopya uygulama gibi tıklanıyor: liste, satır menüsü, Show archived, Add location çekmecesi, iki satırın Edit çekmecesi ve "Confirm delete" hâli.

Gerçek ekran görüntüsüyle piksel karşılaştırması (2026-10-07):
- Liste, ekle, iki düzenle ve iki silme onayı ekranında 0 piksel fark var.
- Satır menüsünde ve Show archived kutusunda küçük fark çıktı. Nedeni yalnız fare üstündeyken çıkan renk.

**Beş tasarım:** Her tasarımda dört görüntü var: masaüstü liste, masaüstü Edit location çekmecesi, telefon (390) liste ve telefon çekmece. Hepsi gerçek uygulamanın CSS'i, kenar menüleri ve telefon alt çubuğuyla çizildi; veri Meyhouse'un iki lokasyonu.

Kontrol: bugünkü sayfa aynı yolla yeniden çizildi.
- Liste gerçek ekranla 0 piksel farkla aynı.
- Çekmecede tek fark, ilk alanın odak çerçevesi.

## Mert'in ayarları

Henüz yok. Mert ilk kopya üzerinden ayar istemedi; onun yerine beş tasarım istedi.

## Beş tasarım (seçim bekliyor)

Beşinde de aynı olanlar:
- Başlık ortak liste dilinde: SETTINGS, başlık ve yeşil nokta; başlıkta düğme yok.
- Active / Archived sekmeleri "Show archived" kutusunun yerine geçer.
- Arama satırın kalanını doldurur; sağ uçta yeşil "New location".
- Çekmecede tek Save sağ altta; Delete iki tıkla kırmızı.

| | Liste | Çekmece | Telefon | Not |
|---|---|---|---|---|
| A · Ortak liste dili (önerilen) | Settings → Documents tablosu; sütunlar Location, Address, Phone number, Time zone; raptiye ikonu kalkar | Bugünkü iki sütunlu form | Her lokasyon ayrı kart | Dayanak: KARARLAR Genel → "Liste sayfalarının ortak dili" (Mert, 2026-10-05; yeşil düğme 2026-10-06) ve "Telefonda liste sayfaları kart satırıyla" (Mert, 2026-10-05) |
| B · Kısa ad sütunu | Short name sütunu (MAIN, GARDEN); adres ve saat dilimi iki satır | Üç bölüm: Name · Address · Contact and time | Kartın üstünde kısa ad | — |
| C · Kartlar | Kart ızgarası | 440 px, tek sütun, başlıkta lokasyon adı | Kartlar alt alta | Ortak liste dilinin tablo kuralından ayrılır |
| D · Yan panel | Panel açıkken sayfa kararmaz, seçili satır yeşil | Saat dilimi altı ABD kutusundan seçilir + "Other time zone" | Panel ayrı sayfa, "← Locations" | Davranış değişir (arka plan tıklanabilir, saat dilimi seçimi); seçilirse ayrıca sorulur (ILKELER P03) |
| E · Sade satırlar | Çerçeve ve sütun başlığı yok; sağda saat dilimi, telefon, Edit | 680 px, etiketler solda | Çekmece alttan açılır | Ortak liste dilinden en uzak |

## Ölçümler ve bulgular

**Bugünkü çekmecede kayma.** Alanların sağ kenarı X ve Save düğmesinin sağ kenarından 15 px içeride (ölçüm: alan 1409, Save 1424). Nedeni, `.catalog-drawer-body`'deki `scrollbar-gutter: stable`: kaydırılacak bir şey yokken de kaydırma çubuğuna yer ayırıyor. Beş tasarımda `scrollbar-gutter: auto` ile düzeltildi; ölçüm sonrası alan, X ve Save'in hepsi 1424'te.

**Ortak değer (CLAUDE.md §4.7).** Çekmece ortak parça: `apps/web/src/settings/CatalogDrawer.tsx` + `jobs-settings.css`. Düzeltme ya da çekmece düzeni orada değişirse şu ekranların çekmeceleri de değişir: Jobs, Shift catalog (shift types, labels), Settings → Documents, Acknowledgements, Important Dates. Yalnız Locations'a sınırlanırsa öteki ekranlar değişmez.

**Hizalama (beş tasarım, 2026-10-07):**

| Ne ölçüldü | Sonuç |
|---|---|
| Tablo sütun başlığı ↔ hücre yazısı başlangıcı | 0 px fark. B'nin kısa ad etiketinde kutu kenarı başlıkla aynı çizgide, yazı etiketin iç boşluğu kadar (8 px) içeride. |
| Satır içi dikey ortalama | Bütün hücreler aynı merkezde. Satırın 1 px alt çizgisi yüzünden kenarlık kutusuna göre 0,5 px yukarıda; içerik alanına göre 0. |
| Çekmece sol kenarı | Başlık, etiketler, alanlar ve Delete aynı x'te: A ve B 816, C 1016, D 997, E 776; telefonda 16. |
| Çekmece sağ kenarı | Alan, X ve Save 1424'te; telefonda 374'te. |
| Kartlar (C) | İki kart eşit yükseklikte: masaüstünde 191, telefonda 199. Kart başlığındaki ikon, ad, kısa ad ve ⋯ aynı merkezde. |

## Senin yerine verdiğim kararlar

- "5 tane artifact örneği" isteğini tek artifact'ta beş tasarım olarak yorumladım. Her tasarımda masaüstü liste, çekmece ve telefonun ikisi var. Dayanak: EKRAN-08'deki "5 design" turunun biçimi (KK-197).
- Başlık ve filtre satırı beş tasarımda da ortak liste dilinde sabit. Dayanak: KARARLAR Genel; Requests satırında "Settings → Locations kendi ekran turunda geçer" (KK-158).
- "Show archived" kutusu yerine Active / Archived sekmesi koydum. Dayanak: Important Dates'te Mert'in aynı değişikliği seçmesi (2026-10-05).
- Bugünkü çekmecedeki 15 px sağ kaymayı beş tasarımda da düzelttim. Dayanak: Mert'in hizalama hassasiyeti; bu bir görünüm düzeltmesi.
- A'yı önerilen yaptım. Dayanak: yukarıdaki iki KARARLAR maddesi.

## Kaynaklar ve yeniden üretme

Gerçek ve kopya ekran görüntüleri ile beş tasarımın PNG'leri şu klasörde: `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\EKRAN-10-LOCATIONS\` (gitignore'da).

Dosya adları:
- Gerçek ekran: `real-*.png`
- Birebir kopya: `copy-*.png`
- Tasarımlar: `v-<today|A..E>-<desk|phone>-<list|drawer>.png`

Betikler ve yakalanan DOM/CSS `src/` altında; Playwright 1.61.1 npx önbelleğinden kullanıldı. Sıra:
1. `capture.mjs`, `capture2.mjs`, `capture3.mjs` sayfayı yakalar. Seed owner ile girilir; parola betikte değil, ortam değişkeninden gelir.
2. `build.mjs` birebir kopyayı kurar, `compare.mjs` gerçek ekranla piksel karşılaştırmasını yapar.
3. `icons.mjs` ve `render.mjs` tasarımları çizer. `MEASURE=1` verilirse hizalama ölçümleri de yazılır.
4. `gallery-build.mjs` beş tasarım sayfasını kurar.

Tasarımların kendisi `variants.js` ve `variants.css`'te.
