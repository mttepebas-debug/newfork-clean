# Settings → Locations: onaylanan tasarım (EKRAN-10-LOCATIONS)

**Durum: SON HÂL (2026-10-07).** Mert A tasarımını seçti ve ince ayarsız onayladı ("Tamam").

- **Karar:** Locations, A tasarımına (ortak liste dili) geçer. Ek ince ayar yok. Mert, 2026-10-07, bu oturumun penceresinde: önce "a", sonra "Tamam".
- **İzin:** gerekmiyor. Bu iş yalnız belge; kod, migration ve veri değişmedi.
- **Risk:** 🟢 Uygulamaya dokunulmadı. Koda uygulama ayrı iş; aşağıdaki "Koda uygulanırken" listesi onun girdisi.
- **Soru:** yok. Ortak çekmece düzeltmesinin öteki ekranlara yayılması koda uygulama işinde Mert'e sorulur (§4.7).
- **Sonraki:** Koordinatör "Locations → A" kod işini açar.

## Artifact'lar

| Ne | Bağlantı | Sürüm |
|---|---|---|
| Onaylanan A tasarımı (tıklanabilir kopya) | https://claude.ai/artifact/Lru9WAg6HaSbdErLyMhU26 | **2 (`1791369506-cc9d`)**, onaylanan sürüm. Sürüm 1 (`1791362235-ed21`): bugünkü sayfanın birebir kopyası. |
| Beş tasarım (Mert'in isteği: "5 tane artifact örneği sun. drawer dahil. mobil görüntü dahil") | https://claude.ai/artifact/UWTcHirMHXjrfa9TND2TLE | 2 (`1791369509-55ab`), A "Seçildi" işaretli. Sürüm 1: `1791364478-45ed`. |

## Onaylanan son hâl: bugün → A

| Öğe | Bugün | A (onaylı) | Kaynak |
|---|---|---|---|
| Sayfa sınıfı | `settings-page jobs-settings-page locations-catalog-settings-page` | + `list-page` | ortak dil |
| Başlık | `SettingsHeader`: ikon kutusu, başlık, açıklama; sağ üstte yeşil "Add location" | `catalog-page-header`: 142 px sabit blok; üst yazı SETTINGS, başlık "Locations" ve yeşil nokta, açıklama aynı; başlıkta düğme yok | `list-page.css` (ortak) |
| Arşiv süzgeci | "Show archived" onay kutusu (açıkken arşivliler de listede) | Sekmeler "Active" (varsayılan) / "Archived" (yalnız arşivliler); 40 px, altında 1 px `--theme-border` | `list-page.css` (ortak) |
| Ekleme düğmesi | Başlıkta "Add location" | Filtre satırının sağ ucunda yeşil "New location": 36 px, 0 × 14 iç boşluk, köşe 7, 13/600, 14 px artı | `list-page.css` (ortak) |
| Arama | 360 px kutu | Filtre satırında kalan bütün genişlik, 36 px | `list-page.css` (ortak) |
| Tablo çerçevesi ve başlık satırı | Eski katalog tablosu | Ortak dil: çerçeve 1 px `--theme-list-frame`, köşe 7; başlık satırı 40 px, 11 px büyük harf, zemin `--theme-list-head`; sıralanabilir başlık | `list-page.css` (ortak) |
| Sütunlar | `1fr 1.4fr 130px 140px 32px` | Location 24 · Address 40 · Phone number 16 · Time zone 16 (fr) · menü 32 px; aralık 12 | `a.css` (yalnız Locations) |
| Satır | 64 px; ad başında raptiye ikonu; adres ve saat 12 px `--job-muted` | En az 52 px; ikon yok; hücre 13 px `--theme-list-cell-text`; ad 600 `--theme-text`; boş telefon "—" `--theme-text-faint` | `a.css` + `list-page.css` |
| Archived boş hâli | "No archived locations" + "Add the first restaurant location…" | Başlık satırı durur; açık yeşil daire içinde raptiye; "No archived locations" / "Archived locations will appear here."; düğme yok | `list-page.css` + yeni metin |
| Çekmece | 640 px, iki sütunlu form; alanlar X ve Save'den 15 px içeride | Aynı form; kaydırma boşluğu yalnız kayarken ayrılır, alan, X ve Save aynı sağ kenarda (1424) | `jobs-settings.css` (ortak) → A'da yalnız Locations'a sınırlı |
| Telefon listesi | Tek kutu içinde satırlar | Her lokasyon ayrı kart: 1 px `--theme-list-frame`, köşe 8, iç boşluk 14 / 4 / 14 / 14, kartlar arası 8; ad 15/600, adres 13 `--theme-list-cell-text`, saat dilimi 12 `--theme-muted`; ⋯ 40 × 40 | `a.css` (yalnız Locations) |
| Telefon başlığı | İkon kutusu + tam genişlik "Add location" | Ortak dilin telefon başlığı (başlık 28); "New location" aramanın altında | `list-page.css` (ortak) |

**Mert'in ince ayarları:** yok. Mert A'yı olduğu gibi onayladı.

**Değişmeyenler:**
- Satır menüsü: Edit location / Archive.
- Çekmecedeki alanlar ve metinleri.
- İki tıkla Delete ("Confirm delete").
- Cancel ve Save location.

## Koda uygulanırken (koordinatörün açacağı iş için)

1. **Ortak dile katılım.** Bölüme `list-page` sınıfı eklenir. Başlık ve araç çubuğu Settings → Documents'takiyle aynı bileşenlerden gelir (`catalog-page-header`, `catalog-toolbar`, `list-add-button list-add-action`). Locations'a özel CSS yalnız sütunlar ve telefon kartıdır. Bu taslağın CSS'i: `artifacts/EKRAN-10-LOCATIONS/src/a.css`.
2. **Davranış farkı.** "Show archived" kutusu arşivlileri aktiflerin yanına ekliyordu; "Archived" sekmesi yalnız arşivlileri gösterir. Dayanak: Important Dates'te Mert'in aynı geçişi seçmesi (2026-10-05) ve bu turda A'yı onaylaması.
3. **Metin değişiklikleri.** e2e'de ikizleri aranır (`apps/web/CLAUDE.md` → Metin):
   - "Add location" → "New location".
   - Yeni: "Active", "Archived", "Archived locations will appear here.".
   - "Show archived" kalkar.
4. **Ortak değer (CLAUDE.md §4.7).** Çekmecedeki 15 px sağ kayma `jobs-settings.css`'teki `.catalog-drawer-body { scrollbar-gutter: stable }`'dan geliyor.
   - Kural ortak çekmecede düzeltilirse şu ekranlar da değişir: Jobs, Shift catalog, Settings → Documents, Acknowledgements, Important Dates.
   - Onaylanan A'da düzeltme yalnız Locations'a sınırlı. Yayılması Mert'e sorulur.
5. **Kanıt.** Gerçek uygulamada 1440 ve 390 ekran görüntüsü, bu dosyadaki ölçülerle karşılaştırılır. Ölçüm betikleri `artifacts/EKRAN-10-LOCATIONS/src/` altında; `render.mjs` `MEASURE=1` ile çalıştırılır.

## Ölçümler (2026-10-07)

| Ne ölçüldü | Sonuç |
|---|---|
| Birebir kopya ↔ gerçek ekran (sürüm 1, masaüstünde 6 durum) | 0 piksel fark. Satır menüsünde ve Show archived'da yalnız fare üstündeyken çıkan renk farkı var. |
| A kopyası ↔ A'nın gerçek CSS'le çizimi (sürüm 2) | Masaüstü ve telefon listesi 0 piksel fark. Çekmecede tek fark ilk alanın odak çerçevesi. |
| Sütun başlığı ↔ hücre yazısı başlangıcı | 0 px |
| Satır içi dikey ortalama | Bütün hücreler aynı merkezde. Satırın 1 px alt çizgisi yüzünden kenarlık kutusuna göre 0,5 px; içerik alanına göre 0. |
| Çekmece sol kenarı | Başlık, etiket, alan ve Delete aynı x'te: masaüstünde 816, telefonda 16. |
| Çekmece sağ kenarı | Alan, X ve Save aynı x'te: masaüstünde 1424, telefonda 374. Bugün alanlar 1409'da. |

## Beş tasarım (kayıt için)

Beşinde de ortak olanlar:
- Başlık ve filtre satırı ortak liste dilinde.
- Active / Archived sekmeleri ve yeşil "New location".
- Çekmecede tek Save; iki tıkla Delete.

| | Liste | Çekmece | Telefon | Sonuç |
|---|---|---|---|---|
| A · Ortak liste dili | Settings → Documents tablosu | Bugünkü form | Ayrı kartlar | **Seçildi** (önerilendi) |
| B · Kısa ad sütunu | Short name sütunu; adres ve saat dilimi iki satır | Name · Address · Contact and time bölümleri | Kartta kısa ad | Seçilmedi |
| C · Kartlar | Kart ızgarası | 440 px, tek sütun | Kartlar alt alta | Seçilmedi |
| D · Yan panel | Sayfa kararmaz, seçili satır yeşil | Saat dilimi altı kutudan seçilir | Panel ayrı sayfa | Seçilmedi |
| E · Sade satırlar | Çerçeve ve başlık yok | 680 px, etiketler solda | Alttan açılan çekmece | Seçilmedi |

## Senin yerine verdiğim kararlar

- "5 tane artifact örneği" isteğini tek artifact'ta beş tasarım olarak yorumladım. Her tasarımda masaüstü liste, çekmece ve telefonun ikisi var. Dayanak: EKRAN-08'deki "5 design" turunun biçimi (KK-197).
- Başlık ve filtre satırı beş tasarımda da ortak liste dilinde sabit. Dayanak: KARARLAR Genel; Requests satırında "Settings → Locations kendi ekran turunda geçer" (KK-158).
- "Show archived" yerine Active / Archived sekmesi koydum. Dayanak: Important Dates'te Mert'in aynı seçimi (2026-10-05).
- Bugünkü çekmecedeki 15 px sağ kaymayı düzelttim; A'da yalnız Locations'a sınırlı. Dayanak: Mert'in hizalama hassasiyeti; görünüm düzeltmesi.
- Archived sekmesinin boş hâl metnini yazdım: "Archived locations will appear here.". Dayanak: ILKELER P21 (kısa, tek mesaj); KK-139 (süzgeçle boş hâlde düğme yok).
- A'yı önerilen yaptım; Mert seçti. Dayanak: KARARLAR Genel → "Liste sayfalarının ortak dili" (2026-10-05; yeşil düğme 2026-10-06) ve "Telefonda liste sayfaları kart satırıyla" (2026-10-05).

## Kaynaklar ve yeniden üretme

Görüntüler `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\EKRAN-10-LOCATIONS\` klasöründe (gitignore'da). Dosya adları:
- Gerçek ekran: `real-*.png`
- Birebir kopya: `copy-*.png`
- Tasarımlar: `v-<today|A..E>-<desk|phone>-<list|drawer>.png`
- A kopyası: `a-*.png`

Betikler ve yakalanan DOM/CSS `src/` altında; Playwright 1.61.1 npx önbelleğinden kullanıldı. Sıra:
1. `capture.mjs`, `capture2.mjs`, `capture3.mjs` sayfayı yakalar. Seed owner ile girilir; parola betikte değil, ortam değişkeninden gelir.
2. `build.mjs` + `compare.mjs`: sürüm 1 (birebir kopya).
3. `icons.mjs`, `render.mjs` (`MEASURE=1`) ve `gallery-build.mjs`: beş tasarım.
4. `a-states.mjs`, `build-a.mjs` ve `check-a.mjs`: sürüm 2 (A kopyası ve tıklama denemesi).
