# Müsaitlik ve izin hücreleri — varyant sayfası

Mert'in 2026-10-09 Schedule listesinden madde 1, 6, 15 ve 16. Schedule test sayfasının (`../schedule-test/`) kopyası: gerçek apps/web Schedule kodu (main 021f82e0), sahte veri. Her maddede "Original (today)" = main'in bugünkü davranışı, artı A, B, C. Seçim sağ alttaki "Test page" menüsünden, tarayıcıda hatırlanır.

- Yayın: https://claude.ai/artifact/37To9ekKGsDrQNSmmKYvXx (yeni sürümler aynı bağlantıya)
- Kaynak: `source/` (Templates varyantları çıkarıldı; Templates main'in penceresi)

## Ne değişti (yalnız bu sayfada)
- `variants/store.ts`: dört maddenin seçimi; `<html data-v1|v6|v15|v16>`.
- `variants/ScheduleRow.tsx`: main'in ScheduleRow kopyası; "Test page:" yorumlu eklemeler: izin hücresinin parçaları, tam gün izinde kilit (Add shift yok, çift tık / yapıştır / sağ tık yok, tıklayınca bilgi kartı).
- `variants/timeOffCell.tsx`: izin hücresi parçaları ve bilgi kartı; müsaitlik saat yazısı ve çubuğu.
- `variants/AvailabilityMarkButton.tsx`: main'in kopyası; madde 1 (isim "!" açıkken günleri işaretler) ve madde 15 (kaydırma).
- `variants/spotlight.ts`: madde 1'in kişiye özel stili.
- `variants/variants.css`: bütün varyant stilleri.
- `mock/world.ts`: Daniel Kim (Pzt tüm gün, Çar 14:00'e kadar, Cmt 17:00 sonrası), Luis Hernandez, Grace Murphy'ye müsaitlik; Ethan Brooks'a Cuma 14:00–24:00 onaylı izin (yayınlanmış vardiyasının üstüne).

## Derleme (bulut thread'i)
1. `source/` → `apps/web/.temp/schedule-musaitlik-izin/`
2. `apps/web` içinde: `./node_modules/.bin/vite build --config .temp/schedule-musaitlik-izin/vite.config.ts`
3. `node .temp/schedule-musaitlik-izin/inline.mjs /mnt/project-files/pages/schedule-musaitlik-izin/index.html`
4. Aynı bağlantıya yeniden yayınla.

## Bilinen
- Müsaitlik işaretleri ("!") yalnız düzenleme kipinde görünür (main böyle): New Schedule → Edit live schedule.
- Madde 16'nın Original'ını tam görmek için madde 6'yı da Original yap (A, B, C tam gün izinde Add shift katmanını zaten kaldırır).
