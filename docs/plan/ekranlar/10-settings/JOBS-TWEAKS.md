# EKRAN-10-JOBS — Settings → Jobs & departments: kopya, varyasyonlar, son hâl

Karar · Mert V1'i (ortak tablo dili) üç düzenlemeyle kabul etti (2026-10-07, bu oturumun penceresinde: "Okay"). Kayda geçirilecek iki karar aşağıda; KARARLAR'a koordinatör yazar.
İzin · gerek yok: kod ve canlı değişikliği yok; yalnız artifact ve bu belge.
Risk · 🟢 kodda ve veride değişiklik yok; artifact özel (yalnız Mert'in hesabı açar).
Soru · yok.
Sonraki · V1'in koda uygulanması ayrı iş (koordinatör açar); kapsamı aşağıda "Koda uygulanacaklar".

## Artifact

- https://claude.ai/artifact/BUJShpW3rXDGFVNyEygDZr — **son sürüm 4** (version id `1791365638-0210`).
  - Sürüm 1 (`1791362757-1523`): yalnız birebir kopya.
  - Sürüm 2 (`1791364299-b30f`): 2. sekmede 6 varyasyon.
  - Sürüm 3 (`1791365263-2470`): V1 seçildi; liste alanı için A/B/C seçenekleri.
  - Sürüm 4: Mert'in C + kenar seçimi işlendi; A ve B çerçeveleri kaldırıldı.
- Sekme 1 "Bugünkü ekran": Mert'in dev sunucusundaki (localhost:5555) `/app/settings/jobs` ekranının 14 hâli. Ölçüler 1440 × 900, owner hesabı, Meyhouse. Gerçek DOM, kullanılan CSS ve Inter kullanıldı. Piksel karşılaştırmasında 1 296 000 pikselin 24–499'u farklı; fark yalnız yazı yumuşatmasından ve çerçeve köşesinden geliyor.
- Sekme 2 "Varyasyonlar": V1–V6 sayfa ve çekmece görünümleri, gerçek veriyle (3 departman, 6 iş, 4 çalışan). V1 "Seçildi" olarak işaretli.

## Mert'in kararları (kayda geçecek)

1. **Jobs & departments, V1 "ortak tablo dili" ile yapılır** (Mert, 2026-10-07, bu oturumun penceresinde: "V1 ILE DEVAM ET KABUL EDECEGIM EDITLERINDEN SONRA", ardından "Okay").
   - Başlık ortak liste dilinde: SETTINGS üst yazısı, yeşil noktalı başlık, sağ üstte düğme yok.
   - Sekmeler Jobs · Departments · Archived.
   - Süzgeç satırı: Department (200 px), arama (kalan genişlik), sağ uçta yeşil "New job".
   - İşler tek tabloda; her departman tablonun içinde ara başlık satırıdır. Örnek: "DINING ROOM · 2 jobs · 2 employees", sağında "+ Add job" ve ⋯.
   - Reddedilenler: V2 (departman listesi + iş tablosu, ortada pencere), V3 (departman kartları, sekmeli çekmece), V4 (satır içinde düzenleme), V5 (pano, iki listeli çekmece), V6 (ağaç + yan panel).
   - Dayanak: KARARLAR → "Liste sayfalarının ortak dili" (Jobs kendi turunda bu dile geçer) ve Sistem 1.
2. **Jobs çekmecesinde çalışan listesi çerçeveli ve çizgili, satırlar içinde kayar** (Mert, 2026-10-07, çoktan seçmeli soruya seçenek dışı cevap: "Çekmece, liste seçeneği C: dolgu satırlarıNA sağdan soldan dikey border çizersen. içindeki rowlar da scroll yapınca kayacağı belli olacak şekilde. bence en iyisi o olacak. tüm sectionı kapsayan çerçeve içinde scroll up down olabilen rowlar").
   - Liste, üstünden alt çubuğun 20 px üstüne kadar tek bir çerçevenin içindedir.
   - Boş kalan yer 56 px aralıklı çizgili dolgu satırıdır.
   - Liste uzunsa çerçeve yerinde kalır, satırlar ve çizgiler içinde kayar.
   - Arama, lokasyon seçici ve All / Assigned / Not assigned sekmeleri çerçevenin üstündedir.
   - Reddedilenler: A (yalnız çerçeve, kutu son satırda biter; önerilen), B (yalnız son satırın altına çizgi).
   - Neden: liste beyaz zeminde kayboluyor ve yarıda bitiyordu.

## Değişiklik listesi (V2 sürümündeki V1'e göre)

| # | Öğe | Özellik | Eski | Yeni | Etkilenen token / ortak bileşen |
|---|---|---|---|---|---|
| 1 | Tablo → Employees sütunu | hücre içeriği | baş harf yuvarlağı + kişi adı (ör. Jordan Lee) | o işe atanmış kişi sayısı, 600 kalınlık, rakamlar eşit genişlikte; sıfırsa soluk 0 (`--theme-muted`, 500); sütun 140 px | yalnız Jobs; ortak bileşen yok |
| 2 | Çekmece → Employees başlığı | yardım yazısı | "Check to assign. Uncheck to remove." | kaldırıldı | yalnız Jobs çekmecesi |
| 3 | Çekmece → çalışan listesi | sınır ve kaydırma | son satırdan sonra çizgisiz beyaz boşluk; liste çekmeceyle birlikte kayar | tek çerçeve, 1 px `--theme-list-frame`, köşe 7; sol ve sağ kenarı arama satırıyla aynı hizada (x=904 / 1416); boş yer 56 px aralıklı çizgi (`--theme-border-subtle`); satır yüksekliği 56; satırlar çerçeve içinde kayar | yalnız Jobs çekmecesi; var olan token'lar, değer değişmez |

Ortak değer değişmedi: Jobs zaten karar verilmiş ortak liste diline geçiyor. Bugünkü sağ üstteki "Add ▾" süzgeç satırının sağ ucuna yeşil "New job" olarak iner. Bu yalnız Jobs'u etkiler.

## Koda uygulanacaklar (ayrı iş için kapsam önerisi)

- `apps/web/src/settings/JobsSettingsPage.tsx`, `jobs-settings.css`:
  - Başlık ortak `catalog-page-header` olur (Settings → Documents gibi).
  - Görünüm denetimi All / Departments / Jobs yerine Jobs · Departments · Archived sekmeleri gelir; "Show archived" kutusu Archived sekmesine dönüşür.
  - Süzgeç satırı: Department, arama, yeşil New job.
  - Tablo ortak çerçevede olur; departman ara başlık satırı; Employees sütunu yalnız sayı.
- `JobAssignmentsDrawer.tsx`:
  - Yardım yazısı kalkar.
  - Liste alanı çerçeveli, çizgili ve içinde kayan hâle gelir (karar 2).
- Kapsamı açık iki konu, uygulama işinde koordinatör netleştirir:
  - "+ Add job" ile yeni departmanın nereden ekleneceği. V1'de New job yeşil düğmeyle, New department Departments sekmesinde ekleniyor.
  - Departments sekmesinin satır düzeni. Varyasyonlarda gösterilmedi.

## Kendi verdiğim kararlar

- Varyasyonlarda yalnız `--theme-*` token'ları kullanıldı; iş ve departman renkleri veri olarak satır içinde. V2'nin paleti uygulamada zaten var olan sekiz tondan.
- Ortak başlık, sekme, süzgeç satırı ve tablo çerçevesi uygulamanın kendi sınıflarıyla yapıldı (CSS Settings → Documents'tan alındı). Satır, çekmece ve kart stilleri artifact'a özel.
- Silme davranışı bugünkü gibi: Jobs'ta etki paneli kalıyor (KARARLAR Settings). Varyasyonlarda yalnız "Delete job" düğmesinin yeri gösterildi.
- "Tüm sectionı kapsayan çerçeve" sözünü çerçeve yalnız satırları saracak biçimde uyguladım; arama ve sekmeler üstte kaldı. Mert bu hâli "Okay" ile kabul etti.

## Yeniden kurmak için

- Kaynaklar git dışında: `C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/ekran-10-jobs/src/`
  - `capture.mjs`: Playwright ile ekranın hâllerini yakalar. Önce `login.mjs state.json` ile seed owner olarak giriş yapılır.
  - `build.mjs`: artifact HTML'ini üretir.
  - `compare.mjs`: kopyayı gerçek ekranla piksel piksel karşılaştırır.
  - `shots.mjs`: varyasyon görüntülerini çeker.
  - `variants.mjs` ve `variants.css`: varyasyonlar.
  - `shell.html`: sayfa iskeleti.
  - `tweaks.css` ve `changes.json`: değişiklik listesi.
  - `*.v2.*` dosyaları: sürüm 2'nin varyasyon kaynakları.
- Görüntüler `artifacts/ekran-10-jobs/` altında:
  - `real-*.png`: gerçek ekran.
  - `copy-*.png`: kopya.
  - `diff-*.png`: farklar.
  - `variants/v1-page.png` ve `variants/v1-drawer.png`: son hâl, 1440.
- Yayın: aynı artifact'a `url` ile yapılır, önce `action: "read"`.
