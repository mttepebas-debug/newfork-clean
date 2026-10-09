# nf-planlama — FB-6.2 `.7b-db` onayı (2026-09-30)

Dal `task/backlog-program-26`, taban `origin/main` `a5a43ebd`, commit **`e4b5be3f`** (push yok).

## 1. Nerede duruyor
Bitti. Açık madde 224 → 227. **Bağlam %50'de** — bu paketten sonra devir notu yazıp yeni `nf-planlama` oturumuna geçmeyi öneriyorum (CLAUDE.md §11.10).

## 2. Ne yapıldı (etkisi)
- **G7 satırı:** `.7b-db` ONAY @`02162f94`; dal CI 36621602233 `gh run view` ile doğrulandı (success); D1/D2/D4 yardımcı/D5 dalda; `.7b` sürüyor.
- Çakışma arandı (sayaç kalıbı, lokasyon adı, "Manages" arşivi): yok. Yeni maddeler, üçü G7:
  - **BL-416 (low / safe), `nf-test`:** `authz_catalog.test.sql:42` kalıbı `is not distinct from` ve `.class` yazımını görmüyor (kanıt:
    `20260930130000_employees_writes_ask_the_core.sql:89` `.class <> 'manager'`; dal migration'ında `is not distinct from 'manager'`).
    Aynı maddede D1 yan bulgusu: `authorization_coverage.test.sql:110` pano servisi `workspace.read` diye sınıflı, servis `workspace.todos`'a
    soruyor. Dal D1'de `:229`'u düzeltiyor; `:110`'u da düzeltirse bu kısım kapanır — dal ucunda henüz yok (`02162f94`), kontrol edin.
  - **BL-417 (low / safe), ürün sorusu:** çekmece/listede `locations[]` ve `primary_location_name` süzülmüyor, yeni `managed_*` alanları süzülüyor
    (dal `20260930180000…:54`, `:103-109`, `:121-126`, `:275`, `:295-296`). "Kullanıcıya dönüşte"ye soru: (a) gizli değil — **öneri**
    (M2 kişi ortak; aynı ad Schedule ghost vardiyasında zaten görünüyor), (b) gizli.
  - **BL-418 (low / safe), `.8`:** "Manages" öğelerinde `archived` bayrağı yok (`:121-126`; `locations[]`'ta `:109` var) — raporun
    "Öneri" ikinci maddesi; mesajınızda yoktu, kayıtsız kalmasın diye yazdım.
- **D3** → `FOUNDATION-B.md` FB-6.6 bitiş kriterine: `allowed.onboarding_review` bayrağı yöneticide `true`, servis `P0002`; FB-6.6'da ikisi aynı cevabı vermeli.

## 3. Açık kalan ve nedeni
- Yok. BL-416 (2)'nin kapanışı dalın D1 düzeltmesinin kapsamına bağlı.

## 4. Ekranda ne değişti
Görünürde bir şey değişmedi (yalnız `docs/plan`).

## 5. Sırada ne var
- Devir (bağlam %50).
- `.7b` raporu; `.7b-db` main'e girince G7 kaydı.

## Kanıt
- `python say.py .`: `acik 227 numarali 198 numarasiz 29 program 227 kopya []`, en yüksek BL-418.
- `gh run view 36621602233` → `02162f94 success`.
