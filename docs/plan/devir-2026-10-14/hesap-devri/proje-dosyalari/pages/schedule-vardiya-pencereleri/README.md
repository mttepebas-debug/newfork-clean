# Vardiya pencereleri test sayfası (madde 11–14)

Schedule test sayfasının (`/mnt/project-files/pages/schedule-test/`) kopyası; gerçek `apps/web` Schedule kodu (main 9a9793e2; BL-613 ve BL-055 düzeltmeleri dahil), sahte veri. Repo'ya hiçbir şey yazılmadı.

- Yayın: https://claude.ai/artifact/JLkkPNRt2bhD5DNSsZxWoH (yeni sürümler aynı bağlantıya)
- Yayınlanan dosya: `index.html` (tek dosya)
- Kaynak: `source/` — derlemek için repo'da `apps/web/.temp/svp/` altına kopyalanır.

## Derleme (bulut thread'i, Linux)
1. `cp -r source/. <repo>/apps/web/.temp/svp/`
2. `apps/web` içinde: `./node_modules/.bin/vite build --config .temp/svp/vite.config.ts`
3. `node .temp/svp/inline.mjs /mnt/project-files/pages/schedule-vardiya-pencereleri/index.html`
4. Aynı bağlantıya yeniden yayınla. Geliştirme sunucusu: `vite --config .temp/svp/vite.config.ts` (port 5711).

## Ne var (sol alttaki "Test page" menüsü; her grupta ilk satır Original (main))
- **12 Edit shift / 13 Add shift / 14 Add shift (unassigned):** Original (main) + 5 aile. Aynı numara üç pencerede aynı tasarım ailesi.
  1 Compact card (hücrenin yanında oklu kart) · 2 Side panel (sağda tam boy panel, rozet önizlemesi, haftalık saat) · 3 Keyboard first (harf kısayolları, 1–4 vardiya tipi, Alt+harf) · 4 Day timeline (ortada pencere, sürüklenebilir gün çizelgesi, açık vardiyada "Who can take it" listesi) · 5 Grows from the cell (hücreden büyüyen küçük pencere).
- **14 Typing times:** Original (main) = bugünkü iki kutu (TimeInput); A One box: `9-5`, `930-1430`, `9:30a-2p`, ↑↓ 15 dk, Enter kaydeder; B Two boxes + list: `9` Enter `5` Enter. 12h'de AM/PM kendisi seçilir: gün içinde kalan okuma kazanır (9-5 = 9 AM–5 PM), sonra vardiya tipinin saatine en yakın.
- **Time format:** 12h / 24h (workspace ayarı taklidi; sayfa yeniden yüklenir).
- **11 Open shift mark:** Original (main) + A Soft pulse, B Spotlight, C Moving outline. `prefers-reduced-motion` açıksa animasyon durur.

## Nasıl çalışır
- `editor/index.tsx`: `../schedule/components/ShiftQuickEditor` yerine geçer (vite takma adı); seçime göre main'in penceresini ya da bir aileyi açar. Yapıştırma (Paste shift) hep main'in penceresi.
- `editor/brain.tsx`: main'in ShiftQuickEditor davranışı satır satır (ilk değerler, uygunluk, müsaitlik kontrolü, kural kutusu, not kartı, kaydet, sil, "changed by someone else"). Farklar: Enter ile kaydetme (değişiklik yoksa pencere kapanır); açık listenin Escape'i yalnız listeyi kapatır.
- `editor/time.ts` saat okuma, `editor/TimeFields.tsx` saat kutuları, `editor/parts.tsx` klavyeyle çalışan alanlar, `editor/families.tsx` beş aile, `editor/editor.css` stil, `editor/store.ts` menü seçimleri.
- `mock/schedule-service.ts`: `time_format` menüden okunur.

## Bilinen farklar
- Demo arka uç çakışan vardiyayı (aynı kişiye üst üste) reddetmez; gerçek DB reddeder. İzinli güne vardiya kural kutusuyla reddedilir.
- Aile 4 gün çizelgesinde izin aralığı gösterilmez (okuma modelinde yok).

## 2026-10-12: yeni tur
Mert'in 2026-10-12 15:41 (Kaliforniya) isteğiyle beş aile bırakıldı; yerine Original'in sıkılaştırılmışı ve Day timeline tek pencerede, geçiş düğmesiyle. Güncel sayfa, kaynak ve açıklama: `/mnt/project-files/pages/gorsel-kararlar/gelen/vardiya-penceresi-yeni/`. Yayın aynı bağlantıda (yeni sürüm). Bu klasördeki `source/` 2026-10-09 turunun kaynağıdır.
Yayındaki son eski sürüm (2026-10-10, Original + beş aile) bu klasörde `yayin-2026-10-10.html` olarak saklı; yeni sürüm aynı bağlantıda onun yerini aldı.
