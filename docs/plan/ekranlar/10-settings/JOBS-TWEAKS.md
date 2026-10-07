# EKRAN-10-JOBS — Settings → Jobs & departments: kopya ve varyasyonlar (ara hâl)

Karar · bekliyor: Mert hangi varyasyonla (ya da hangi parçaların birleşimiyle) ilerleneceğini seçecek.
İzin · gerek yok: kod ve canlı değişikliği yok; yalnız artifact ve bu belge.
Risk · 🟢 kodda ve veride değişiklik yok; artifact özel (yalnız Mert'in hesabı açar).
Soru · Mert'e: "Jobs sayfası ve çekmecesi için V1–V6'dan hangisi?" (artifact'ın 2. sekmesi).
Sonraki · Mert'in seçimi ve ince ayarları artifact'a işlenir; son hâl bu dosyaya yazılır; koda uygulama ayrı iş (koordinatör açar).

## Nerede duruyor (2026-10-07, gece modu öncesi)

- Artifact: https://claude.ai/artifact/BUJShpW3rXDGFVNyEygDZr, **sürüm 2** (version id `1791364299-b30f`). Sürüm 1 (`1791362757-1523`) yalnız birebir kopyaydı.
- Sekme 1 "Bugünkü ekran": Mert'in dev sunucusundaki (localhost:5555) `/app/settings/jobs` ekranının 14 hâli, 1440 × 900, owner hesabı, Meyhouse. Gerçek DOM + kullanılan CSS + Inter; piksel karşılaştırması 1 296 000 pikselde 24–499 fark (yalnız yazı yumuşatma ve çerçeve köşesi).
  - Hâller: All; Add menüsü; departman ⋯ menüsü; iş ⋯ menüsü; Departments; Jobs; Bartender iş çekmecesi; Delete job onayı; Discard changes? penceresi; Add → Job; Add → Department; departmana iş ekle; departmanı düzenle; Delete department onayı.
- Sekme 2 "Varyasyonlar": Mert'in isteği (2026-10-07: "bu artifacta 2. sekme olarak departments and jobs sayfası ui uxi ve draweri 6 tane varyasyon örneği sun"). Her varyasyonda sayfa + Bartender çekmecesi, gerçek veri (3 departman, 6 iş, 4 çalışan).

| # | Sayfa | Çekmece |
|---|---|---|
| V1 (önerilen) | Ortak tablo dili; departmanlar tablonun içinde ara başlık satırı; sekmeler Jobs · Departments · Archived; süzgeç satırında Department, arama, yeşil New job | Sağdan çekmece: üstte iş bilgileri, altta işaretle-ata çalışan listesi |
| V2 | Solda departman listesi, sağda seçilen departmanın iş tablosu | Ortada pencere, 8 tonluk renk paleti, sağda çalışanlar |
| V3 | Departman kartları; yeni departman kesik çizgili kart | Details / Employees sekmeli çekmece |
| V4 | V1 tablosu, iş satırı yerinde açılır | Çekmece yok, satır içinde düzenleme |
| V5 | Pano: departman sütunları, sürüklenen iş kartları | Geniş çekmece: atanmamış ↔ atanmış iki liste |
| V6 | Girintili ağaç, satır içinden iş ekleme (Enter) | Sayfayı karartmayan yan panel |

- V1'in dayanağı: KARARLAR → "Liste sayfalarının ortak dili" (Jobs kendi ekran turunda bu dile geçer) ve Sistem 1 (yeşil ekleme düğmesi süzgeç satırının sağ ucunda).
- Altı varyasyonun ortak noktası: başlık ortak liste dilinde (SETTINGS üst yazısı, yeşil noktalı başlık, sağ üstte düğme yok); tek Save sağ altta, Cancel beyaz, Delete kırmızı. Bu, Jobs için bugünkü sağ üstteki "Add ▾"nın süzgeç satırına inmesi demek; ortak değer değişmiyor, Jobs zaten karar verilmiş ortak dile geçiyor.

## Değişiklik listesi (öğe · özellik · eski → yeni · etkilenen token / ortak bileşen)

Henüz yok. Mert artifact üzerinde değişiklik istemedi; varyasyon seçimi bekleniyor.

## Kendi verdiğim kararlar

- Varyasyonlarda yalnız `--theme-*` token'ları; iş ve departman renkleri veri olarak (satır içi). V2'nin paleti uygulamada zaten var olan sekiz tondan.
- Ortak başlık, sekme, süzgeç satırı ve tablo çerçevesi uygulamanın kendi sınıflarıyla (Settings → Documents'tan alınan CSS); satır, çekmece ve kart stilleri artifact'a özel.
- Silme davranışı bugünkü gibi (Jobs'ta etki paneli kalıyor, KARARLAR Settings); varyasyonlarda yalnız "Delete job" düğmesinin yeri gösterildi.

## Yeniden kurmak için

- Kaynaklar (git dışı): `C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/ekran-10-jobs/src/` — `capture.mjs` (Playwright ile hâlleri yakalar; giriş için önce `login.mjs state.json`, seed owner), `build.mjs` (artifact HTML'ini üretir), `compare.mjs` (piksel farkı), `shots.mjs` (varyasyon görüntüleri), `variants.mjs` + `variants.css` (6 varyasyon), `shell.html` (sayfa iskeleti), `tweaks.css` + `changes.json` (Mert'in değişiklikleri buraya).
- Görüntüler: `artifacts/ekran-10-jobs/real-*.png` (gerçek), `copy-*.png` (kopya), `diff-*.png`, `variants/*.png`.
- Yayın: aynı artifact'a `url` ile (`https://claude.ai/artifact/BUJShpW3rXDGFVNyEygDZr`), önce `action: "read"`.
