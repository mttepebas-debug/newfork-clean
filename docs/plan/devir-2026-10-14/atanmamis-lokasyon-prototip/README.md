# Schedule: atanmadığı lokasyonda kapalı hücre (varyant prototipi)

Durum: **tasarım aşaması, Mert seçim yapmadı, koda girmedi.** Bu klasör yalnız prototipin kaybolmaması için var (hesap değişimi, 2026-10-14). Uygulama kodu değil; main'e girmesi ürünü değiştirmez.

## Ne
Mert'in isteği (2026-10-11, thread "Schedule: izinli kişiye başka lokasyonda Add shift"): Schedule düzenleme modunda (owner, admin, manager) bir kişinin **atanmadığı lokasyondaki** hücresi kapalı görünsün:
- Add shift penceresi açılmaz (tıklama ve çift tıklama hiçbir şey yapmaz).
- Hücre boş hücre renginde, hafif içe çökük ve soluk.
- Üzerine gelince "+ Add shift" amber yerine hafif kırmızı ve hareketli yanar.
- İmleç normal ok kalır; kırmızı yasak imleci olmaz (Mert, 2026-10-11 düzeltmesi).
- Sunucu bu vardiyayı zaten reddediyor ("Not assigned to this location", `assess_weekly_shift_availability`'de `location_assignment` engeli); değişiklik yalnız ekranı sunucuyla aynı hizaya getirir.

## Varyantlar (sayfadaki "Varyant" düğmeleri)
- **Bugünkü (main):** hücre normal, amber Add shift, pencere açılır.
- **A · Yumuşak çöküntü:** hafif iç gölge, kartlar biraz soluk, kırmızı yazı nefes alır gibi yanıp söner. (Thread'in önerisi.)
- **B · İç çerçeve:** hücre içinde ince çerçeve, kırmızı yazı bir kez sallanır.
- **C · Derin çöküntü:** daha derin gölge, "+" işareti "×"e döner, kırmızı ışık kayar.
- **D · Renkli ghost:** hücre A gibi. Ghost kartlar asıl vardiyanın renginde ama soluk, cansız, içe çökük; yazılar asıl karttakiyle aynı renk ve okunaklılıkta (Mert, 2026-10-11 11:05 UTC mesajı). Bu varyantta bütün ghost kartlar böyle. Mert "ghost shiftler harika gözüküyor" dedi; son hâli (soluk + çökük) için onay vermedi.

## Dosyalar
- `varyant-prototip.patch`: `apps/web/src` değişikliği. Varyant yalnız `<html data-nf-variant="a|b|c|d">` varken çalışır (PAGES kabuğu `v=` parametresinden koyar); yoksa uygulama bugünkü gibi davranır. Taban 641f2117; 2026-10-14 main'inde (9b871a97) `git apply --3way` ile temiz uygulanıyor, ama EKRAN-01'in yeni kart görünümü (9b43375d) yüzünden görüntü yeniden kontrol edilmeli.
- `sayfa-kabugu.html`: yayınlanan sayfanın kabuğu (açıklama, varyant/senaryo düğmeleri, masaüstü ve telefon çerçeveleri). Yanında `app-schedule.html` ister (PAGES derlemesi, ~8.4 MB; repoya konmadı).

## Sayfayı yeniden kurmak
1. Güncel main'den bir worktree aç, `pnpm install`, `pnpm --filter @newfork/ui build`.
2. `git apply --3way docs/plan/devir-2026-10-14/atanmamis-lokasyon-prototip/varyant-prototip.patch` (yalnız bu çalışma kopyasında; commit etme).
3. PAGES kaynağını (`PAGES/_kaynak`, proje dosyalarındaydı; yeni hesapta nereye taşındıysa oradan) `apps/web/.temp/pages`'e kopyala. `main.tsx`'e şu iki satırı ekle (`installFetch();`'ten sonra; `screenParams`'ı `./pages`'ten içe aktar):
   `const variant = screenParams().get("v");`
   `if (variant && variant !== "orig") document.documentElement.dataset.nfVariant = variant;`
   `screens.json`'da 3.0'ın senaryolarına "Düzenleme" senaryosu ekle: adımlar `button[aria-label="Draft selector: New Schedule"]`, sonra `button[aria-label="Edit live schedule"]`.
4. `apps/web` içinden `PAGES_OUT=<klasör> node .temp/pages/tools/build-pages.mjs 3.0` → `app-schedule.html`.
5. `sayfa-kabugu.html`'i aynı klasöre koy, Artifact olarak `files: {"app-schedule.html": …}` ile yayınla. Eski hesabın sayfası (https://claude.ai/artifact/PeCwcUC922XVirLhgBYfBr) yeni hesaptan açılmaz.

## Açık sorular (Mert)
- Hangi varyant (A/B/C/D)? Thread A'yı önerdi; Mert D'nin ghost görünümünü beğendi.
- D'de renkli ghost bütün ghost'lara mı, yalnız atanmadığı lokasyon hücrelerine mi? (Kişi iki lokasyona atanmışsa ghost kartı kendi lokasyonunda gerçek karta çok benzer.)
- Bu hücrelerde sağ tık menüsü ve sürükle-bırak da kapansın mı? (Prototipte açık.)
- Böyle bir hücrede izin günü varsa kırmızı "Time off" görünmeye devam etsin mi? (Prototipte görünüyor.)

## Kodlama işi açılınca
Sınıf: normal (tek ekran) ama ghost görünümü bütün Schedule'ı etkiliyor. KARARLAR'a kural yazılır (§3.A.7: ortak bir değer değişirse önce kural). TDD: `ScheduleGrid.test.tsx`'te atanmadığı lokasyon hücresinde `data-schedule-add-shift-control` yok ve çift tıklama `onCreate` çağırmaz. Prototipteki `document.documentElement.dataset` okuması gerçek kodda kalmaz; varyant kodu ve öteki varyantlar silinir. Bitince PAGES 3.0 Schedule güncellenir (proje talimatı #11).
