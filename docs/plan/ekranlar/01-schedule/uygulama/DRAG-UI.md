# EKRAN-01 DRAG-UI — sürükleme renkleri token'da, testli — uygulama arşivi

Ölçüm raporu: `DRAG-olcum.md` (main `dea554e5`). Veri katmanı düzeltmesi ayrı dilim: DRAG-API (web hattı).

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| 01 Schedule | DRAG-UI — bırakma hücresi renkleri token'a, `data-drop-status` testleri | `nf-arayuz` / arayüz hattı | R1 | oturumun kendi okuması + ekran görüntüsü (R1) | 2026-10-06 |

## Sonrası için
- Kalıp: bırakma rengi üç token çiftinde: yeşil `--theme-success-soft` + `--theme-accent`, amber `--theme-warning-soft` + `--theme-availability`, kırmızı `--theme-danger-soft` + `--theme-danger`; kenarların hepsi kendi zemininde ≥3:1.
- Tuzak: `--theme-warning-border` (`#bf872d`) `--theme-warning-soft` üstünde 2,93:1, kenar için 3:1'in altında; amber kenarda müsaitlik turuncusu (`--theme-availability`, 3,07:1) kullanıldı.
- Tuzak: bırakma kuralları `styles.css`'te müsaitlik / izin kurallarından önce durur; işaretli hücrede zemin ve tarama işaretin kalır, bırakma rengini yalnız kenar taşır.
- Ölçüm: renkler kuralları elle veren birim testiyle kilitli; gerçek ekranda yeşil ve kırmızı ancak DRAG-API (API `settings.conflict_rules`'u geçirince) görünür.
- Kalıp: CSS kuralını test etmek için `ScheduleEditStripStyles.test.ts`'teki `bodyOf(selector)` yardımcısı kullanılır.

## Rapor

- **Karar:** R1; inceleme oturumun kendi okuması + ekran görüntüsü (DELEGASYON §3).
- **İzin:** R1 — koşullar tamamsa izin beklemeden gönderilir; main kırmızıyken beklenir.
- **Risk:** 🟢 görünüm aynı kaldı (renkler token'a eşlendi); davranış değişmedi.
- **Soru:** yok.
- **Sonraki:** DRAG-API main'e girince yerelde gerçek sürüklemede üç rengi görüp ekran görüntüsü almak; sonra Mert'in varyant seçimleriyle gelen dilimler.

### 1. Nerede duruyor
Bitti; dal `task/ekran-01-drag-ui` (worktree `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-01-drag-ui`), taban `origin/main` `dea554e5`.

### 2. Ne yapıldı (etkisi)
Schedule → Edit → bir vardiyayı sürüklerken altındaki hücrenin rengi:

| | Önce | Sonra |
|---|---|---|
| Renkler | dosyaya gömülü ham renk kodları (`styles.css:5841-5855`) | tema token'ları; görünüm aynı tonda |
| Kenar kontrastı (kendi zemininde) | yeşil 4,31 · kırmızı 3,62 · amber 3,09 | yeşil 5,72 · kırmızı 4,90 · amber 3,07 |
| Test | hücrenin rengini söyleyen öznitelik test edilmiyordu | üç durum, "sürükleme yokken hiç hücre işaretlenmez", dört sürükleme × üç hücre ve token kuralı test ediliyor |

Örnek: Ayşe Ali'nin vardiyasını sürüklerken boş Perşembe yeşil, Ali'nin "2:00 PM'den sonra müsait değil" dediği Salı amber, izinli Çarşamba kırmızı yanar — kurallar API'den geldiği anda (DRAG-API). Bugün API kuralları göndermediği için gerçek ekranda hâlâ çoğu hücre amber (ölçüm: `DRAG-olcum.md`).

### 3. Açık kalanlar
- Gerçek ekranda yeşil / kırmızı: DRAG-API'ye bağlı.
- Aynı aileden iki ham renk dokunulmadı (kapsam dışı, aşağıda).

### 4. Ekranda ne değişti
Schedule düzenleme modunda sürüklenen vardiyanın hedef hücresi: aynı renk ailesi, biraz daha koyu yeşil ve kırmızı kenar. Görüntü: `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\nf-arayuz\DRAG-UI\_compare-1440.png` (önce / sonra; Burak'ın Pazartesi'si amber, Diana Mirasova'nın izinli Pazartesi'si kırmızı, Diana Taborda'nın boş Pazartesi'si yeşil), tek tek `before-1440.png`, `after-1440.png`, `before-390.png`, `after-390.png`. Not: görüntüdeki durumlar hücrelere elle verildi; gerçek sürüklemede aynı öznitelik değerlendirme fonksiyonundan gelir.

### 5. Sırada ne var / yolda bulunanlar
- `styles.css:5836` `.schedule-cell[data-drop-target="true"]` ve `:5856` sürükleme önizlemesinin amber sebep kutusu aynı ailede ham renk kullanıyor; dokunulmadı (dilim 5841-5855 dedi). W-4'ün "dokunulan kurallarda token" maddesine aday — leave: low / do: safe.
- Pano (`node scripts/inbox.mjs board`) her oturumun durum sütununa son yazılan durum satırını yazıyor (2026-10-06 ölçüldü: bütün satırlarda benim "VAR-EKRAN-12 — arşiv belgesi…" satırım) — leave: low / do: safe, `nf-test` (`scripts/**`).

### Kanıt
- Odaklı vitest: `ScheduleRow.test.tsx`, `useScheduleGridDragControllers.test.ts`, `ScheduleEditStripStyles.test.ts` → 3 dosya, 42 test yeşil.
- Tam kapı (2026-10-06, `origin/main` `dea554e5` üstünde): `pnpm.cmd lint` 0, `typecheck` 0, `test` 0 (web 232 dosya, api 59, shared 17, ui 3 — hepsi geçti), `build` 0. e2e etkilenmez: `e2e/` altında `data-drop-status` ve eski renk kodları geçmiyor (grep boş).
