# nf-planlama — FB-6.2 T5b-3 onayı ve KK-32 kalemleri (2026-09-30)

Dal `task/backlog-program-21`, taban `origin/main` `398e3107`, commit **`1a01fdca`** (push yok).

## 1. Nerede duruyor
Bitti. Açık madde 228 → 232.

## 2. Ne yapıldı (etkisi)
- **G7 satırı:** T5b-3 `nf-guvenlik` ONAY @`45ce6f53`; şart olan dal CI 36614433584'ü `gh run view` ile doğruladım
  (`45ce6f53`, check + db + e2e yeşil). O-2, D-a, D-c kapandı; `.6` kalanı dalda; KK-32 eşlemesi; T5b-4 yeni işçide
  (onboarding satırı + `can_manage_employee_record` silinmesi + KK-32 (b) + D1).
- **"Dalda" notları (kapanış main'e girince):** BL-187 (owner kendi lokasyonunu siliyor; GF), BL-155 (hafta listesi
  çekirdekten, `20260930162000…:23-29`), BL-354 (Hub retleri ipuçlu `:192`, `:206`; `authorize_time_off_request` `:214-231`).
- **Yeni maddeler (çakışma arandı: lokasyon silme, pano/widget, `authorize_time_off_request`, P0002 — yok; hepsi G7):**
  - **BL-409 (low / safe), `nf-arayuz` (+ `nf-backend` liste ucu):** Settings → Locations silme onayı yalnız
    "Delete “{name}”?" diyor (`CatalogDeleteAction.tsx:139-140`); lokasyonsuz kalacak kişileri adıyla söylemeli. KK-32 (a).
  - **BL-410 (low / safe), `nf-arayuz`:** Workspace ana sayfası izinsize sayı widget'ını 0 ile çiziyor
    (`WorkspacePage.tsx:376-400`, `can()` yok); hiç göstermemeli. KK-32 (c).
  - **BL-411 (low / safe), `nf-db`:** bilinmeyen izin talebi 403, var olanda üye olmayana 404 — varlık sezilebilir
    (`20260930162000…:225-230`); önce üyelik. BL-401 ile aynı tür. D3.
  - **BL-412 (low / safe), `nf-db`:** hafta listesi taslak varlığını kapsamdan önce P0002 ile söylüyor (`:31-40`). D4.

## 3. Açık kalan ve nedeni
- BL-412'nin örneği taslağın lokasyona bağlı olduğunu varsayıyor; taslak şeması ölçülmedi (`nf-guvenlik` "lokasyon
  kapsamına bakmadan" diyor). İş açılınca `nf-db` doğrular.

## 4. Ekranda ne değişti
Görünürde bir şey değişmedi (yalnız `docs/plan`).

## 5. Sırada ne var
- T5b toplu turu main'e girince: BL-187, BL-155, BL-354 kapanışı; BL-365 ve BL-243 (`.7a`) kapanışı; BL-402/403 main'de yeniden ölçüm.
- BL-409 ve BL-410 `.8`'in `nf-arayuz` turuna eklenebilir (koordinatör kararı).

## Kanıt
- `python say.py .`: `acik 232 numarali 203 numarasiz 29 program 232 kopya []`, farklar/kesişim boş, en yüksek BL-412.
- `gh run view 36614433584`: `headSha 45ce6f53…`, `db:success check:success e2e:success`.
- Yazılan dosyalar: `docs/plan/BACKLOG.md` (BL-187/155/354 notları, BL-409…412), `docs/plan/tasks/BACKLOG-PROGRAM.md` (G7, Notes / Result).
