# Schedule üst çubuk ve pencereler: varyant sayfası

Mert'in 2026-10-09 Schedule listesinin 2, 5, 7, 8 ve 9. maddeleri. Yalnız tasarım; repo kodu değişmedi.

- Sayfa: https://claude.ai/artifact/WFnZBHaAo32rVHKDUkzXJe (yayımlanan dosya `index.html`).
- Kaynak: `source/`. Bu, `schedule-test` sayfasının kopyası, üstüne varyantlar eklendi. `schedule-test`'in kendisine dokunulmadı.
- Original'in alındığı main: `afb24b35` (2026-10-09).

## Hangi madde, nerede

Sağ alttaki "Test page" menüsünde her madde için bir grup var. İlk seçenek hep "Original (main)".

| Madde | Seçenekler | Dosya |
|---|---|---|
| 2 · New Schedule penceresi | Original + 5 | `source/variants/new-schedule.tsx` |
| 5 · Export menüsü | Original + 5, özellik önerileri menüdeki "Özellik önerileri" düğmesinde | `source/variants/export.tsx` |
| 7 · Üst çubuk taşması | Original + A, B, C, D ("Uzun adlarla doldur" düğmesiyle denenir) | `source/variants/ScheduleTopBar.tsx`, `variants.css` |
| 8 · Unpublish onayı | Original + 5 | `source/variants/unpublish.tsx` |
| 9 · Review default hours | Original + 3, açıklama menüdeki "Ne işe yarar?" düğmesinde | `source/variants/default-hours.tsx` |

Daha önceki kararlarla eşleşenler:
- Madde 7: B ve C, 2026-10-06'daki üst çubuk varyantları B ve C'nin devamı.
- Madde 5: 2026-09-16'da seçilen Export D (yan panel). Original bugün zaten o.
- Madde 2: New Schedule için daha önce seçilen "stil B". Original bugün o.

## Nasıl çalışıyor (teknik)

- Gerçek `apps/web` kodu Vite ile derlenir. API tarayıcıda taklit edilir (`source/mock/`), veriler localStorage'da durur ("Reset demo data" ile sıfırlanır).
- Varyant seçimi `vite.config.ts` içindeki `resolve.alias` ile yapılır. SchedulePage'in içe aktardığı bileşenler (DraftDropdownMenu, ExportSettingsPanel, ScheduleTopBar, UnpublishScheduleDialog, DefaultHoursReviewDialog) `source/variants/` altındaki sarmalayıcılara gider. Sarmalayıcı, menüde Original seçiliyse main'in bileşenini, değilse prototipi çizer.
- `patchSchedulePage` eklentisi derlerken SchedulePage.tsx'te iki küçük değişiklik yapar (madde 9'un düğmesi ve ızgara üstündeki uyarı). Main değişip metin eşleşmezse derleme durur.
- Seçimler localStorage'da, anahtar öneki `newfork.scheduleTopBar.variant.`.
- Prototip için uydurulmuş bir uç var: `GET /prototype/schedule-list?week_start=` (yayındaki program ve taslakların vardiya, saat, kişi sayıları). Gerçek API'de yok; New Schedule ve Unpublish varyantlarından biri seçilirse arka uç işi gerekir.

## Derleme

`apps/web` klasöründe, `source/` içeriği `apps/web/.temp/schedule-ust-cubuk/` altına kopyalanmışken:

1. `./node_modules/.bin/tsc -p .temp/schedule-ust-cubuk/tsconfig.json`
2. `./node_modules/.bin/vite build --config .temp/schedule-ust-cubuk/vite.config.ts`
3. `node .temp/schedule-ust-cubuk/inline.mjs <çıktı>/index.html`, sonra ilk satırdaki `<title>` "Schedule Bar Variants" yapılır.
4. Aynı bağlantıya yeniden yayımlanır.

## 2026-10-09 gece işi (bu kopya)
- Temel main `afb24b35`. Varyant kaldırılmadı (reddedilen bulunmadı). Menüde "Karar bekliyor" etiketi, üstte karar şeridi (`status.ts`); `inline.mjs` başlığı doğrudan "Schedule Bar Variants" yazar; menü başlıkları `lang="en"` (Türkçe büyük harf İ hatası).
