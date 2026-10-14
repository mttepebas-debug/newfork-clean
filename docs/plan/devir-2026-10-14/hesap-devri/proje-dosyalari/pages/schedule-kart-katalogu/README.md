# Schedule · Bütün kart hâlleri (canlı ızgara + katalog)

- İstek: Mert, 2026-10-12 04:45 (Kaliforniya), thread "Vardiya kartı, hayalet vardiya ve sürükleme".
- Yayında: https://claude.ai/artifact/S9fM4Yfc7SLhro3frLo9gL (sürüm 10; klasör: Schedule; dizin satırı var, bant var).
- Dosyalar: `index.html` (kabuk, bantlı; `app.html`'i tam boy iframe'de açar), `app.html` (gerçek Schedule kodu: dal `claude/project-thread-nezlm0` @ `f92250e6` = main `4169aef7` + bu thread'in düzeltmesi, + örnek veri, ~7.5 MB; sürüm 10, tek parça), `ekran/` (görüntüler), `source/` (kaynak).
- Yayın: `index.html` sayfa, `app.html` `files` ile ek dosya. İkisi oturumun geçici klasörüne kopyalanıp oradan gönderilir (ek dosya başka yerden alınmaz). Tek dosyaya gömülü hâli (pdf.js dahil) yayın kontrolünden geçmedi; bu yüzden pdf işçisi çıkarıldı, bu sayfada PDF dışa aktarmanın sayfa sayısı çalışmaz.

## Sekmeler
- **Schedule:** PAGES 3.0'ın kodu. Harbor & Vine Downtown bu hafta yayında; Uptown bu hafta yayınlanmamış taslak. Düzenleme modunda (New Schedule → Edit live schedule) Downtown Pazartesi'de bir düzenlenmiş (Ethan Brooks), bir silinmiş (Maria Lopez), bir yeni (Aisha Johnson) kart hazır gelir. Notlu kart: Carlos Rivera Pazartesi, Jake Thompson Çarşamba. Müsaitlik uyarısı (!): Aisha Johnson Cuma, düzenleme modunda. Atanmamış yığın (x2): Cuma.
- **All shift cards:** 4 grup, 21 kart hâli, her biri Original ve Yeni yan yana; her birinde Ne / Ne zaman / Nerede / Kim görür / Neden / Nasıl ve "Izgarada göster" düğmesi (Schedule sekmesine geçer, gerekirse düzenleme modunu açar, kartı yanıp söndürür).
- **Test page (sağ alt):** "Shift card look": Original (bugünkü main) ya da Yeni (Mert'in 2026-10-12 07:03–07:13 Kaliforniya saatli 9 yorumu ve 10:04 mesajı; başlangıç Yeni), "Reset demo data" (iki tık).

## Sürüm 4 (2026-10-12 ~10:45 Kaliforniya)
- Gerçek kod (dal `claude/project-thread-nezlm0`, trene hazır): sürükleyip bırakınca ızgara başladığı yerde kalır (`e7ebe712`); alttaki kaydırma çubuğuna basmak filtreleri ve seçimi bozmaz (`33b97a0c`); Esc ve boş yere tıklama önce açık menüyü kapatır, sonra filtreleri tek tek, en son ekleneni önce kaldırır (`58762f92`).
- Yalnız bu sayfada (Yeni): açık vardiyadaki "x2" kartın sol üstünde; kartın her bilgisi tek satır, asla ikinci satıra inmez; sol menü açıkken de bir lokasyonun 7 günü ekrana sığar. Sütun genişliği kendiliğinden ayarlanır, dört kademe: geniş ekranda işaretler yazının iki yanında; daralınca işaretler yazının üstünde ve altında kendi satırında; daha dar ekranda vardiya adı 12'den 11 piksele iner; en darda uzun ad "…" ile biter (saat hiç kesilmez; saat de sığmıyorsa hafta kayar). Ölçüm (tarayıcı): 1440 genişlikte menü açıkken okumada ve düzenlemede 7 gün sığıyor, hiçbir yazı kesilmiyor, hiçbir işaret yazıya değmiyor; 1366'da birkaç uzun ad "…" ile bitiyor; 1280'de menü açıkken hafta kayıyor. Kod: `source/overrides/ScheduleGridShell.tsx` (ızgara kabuğu), `source/vk/side.ts`, `source/vk/vk.css`.
- Görüntüler: `ekran/yeni-menu-acik-okuma.png`, `ekran/yeni-menu-acik-duzenleme.png`.

## Sürüm 5 (2026-10-12 ~11:30 Kaliforniya)
- Gerçek kod (dal `claude/project-thread-nezlm0`, `52ed5e93` + `d7cfcd82`, inceleme onaylı): canlı Schedule düzenlenirken silinen vardiya çakışma yaratmaz (saat çakışması, dinlenme ve yol süresi uyarıları onu saymaz, başka lokasyonda hayalet kartı çıkmaz). Aynı hücreye bu düzenlemede saatleri en az bir dakika çakışan ya da aynı vardiya türünden bir vardiya yazılırsa silinen kart onun arkasında kalır, görünmez; silme yine yayınlanır. Kimsenin dokunmadığı canlı vardiya silineni gizlemez. "Tümünü seç" gizli kartı seçmez.
- Sayfada denemek: Edit live schedule → Maria Lopez pazartesi (üstü çizili Lunch-Server) → Add shift → Lunch → Add shift. Görüntüler: `ekran/silinen-once.png`, `ekran/silinen-sonra.png`.

## Sürüm 6 (2026-10-12 ~19:00 Kaliforniya)
- İstek: Mert, 2026-10-12 18:04 Kaliforniya: hayalet kart görünümü I + üç değişiklik.
- Gerçek kod (dal `claude/project-thread-nezlm0` @ `79b657c7`, güncel main'in üstünde; inceleme ONAY @ `9e7afa56`):
  - Hayalet kart I: gerçek kart kendi vardiya türü renginde, yarı güçte. Yazı AA için biraz koyu gri (en düşük kontrast 5,29:1, tarayıcıda 76 hayalette ölçüldü).
  - Hayalet vardiya kesin çakışma: aynı kişinin aynı saatlere denk gelen her vardiyası engellenir (ekle, düzenle, sürükle-bırak). Sunucu bunu zaten engelliyordu; ekran artık önceden söylüyor.
  - Sürükleme başında kart zıplamaz. İki neden vardı: 1) o vardiyayı alamayanların satırı gizlenince ızgara kısalıyor, kaydırma yukarı kayıyordu; artık günlerin genişliği donar, ızgara karta geri kayar, gerekirse üstte boş yer kalır. 2) Tutulan kart farenin 12 px sağ altında çiziliyordu; ortasından tutulan kart yarım günden fazla sağa, sonraki güne zıplıyordu. Artık tutulduğu noktadan farenin altında kalır.
  - Bırakılamaz hücrede kartın altında tek kısa kelime, kırmızı zemin beyaz yazı (Overlaps, Time off, Not assigned, Closed, Rest time…). Uzun açıklama bırakınca çıkan bildirimde. Kendi hücresine geri bırakmak düz kalır.
- Yalnız bu sayfada: örnek sunucuya da saat çakışması kontrolü eklendi (`source/mock/schedule-service.ts`); eski sürüm 5'te Add shift hayaletin üstüne yazabiliyordu çünkü örnek sunucuda bu kontrol yoktu.
- Denemek: New Schedule → Edit live schedule → Jake Thompson'un pazartesi kartını pazar günündeki hayaletin (Close-Bartender) üstüne sürükle: "Overlaps". Daniel Kim'in cuma kartını ortasından tut: kart yerinden kalkar, sağa zıplamaz.
- Görüntüler: `ekran/hayalet-i.png`, `ekran/surukleme-overlaps.png`, `ekran/surukleme-baslangic.png`.

## Sürüm 7 (2026-10-12 ~19:25 Kaliforniya)
- İstek: Mert, 2026-10-12 19:12 Kaliforniya: izinli hücrenin kırmızı kenarı hep görünsün, "Time off" yazısı siyah olsun, üzerine gelince kırmızı.
- Gerçek kod (dal `claude/project-thread-nezlm0` @ `5ed295c3`): onaylı izinli hücrede ince kırmızı iç kenar hep var; yazı siyah (`--theme-text`), üzerine gelince `#a43830` kırmızı (5,4:1). Düzenleme modunda üzerine gelince hücre pembe kalır, kreme dönmez. Vardiya sürüklenince kalın kırmızı bırakılamaz çerçevesi kenarın yerini alır.
- Görüntüler: `ekran/izinli-hucre.png`, `ekran/izinli-hucre-surukleme.png`.

## Sürüm 8 (2026-10-13 ~15:50 Kaliforniya; yayında 17:06'dan beri: https://claude.ai/artifact/S9fM4Yfc7SLhro3frLo9gL)
- İstek: Mert, 2026-10-13 14:54 Kaliforniya: kartta müsait değil "!" ile "NEW" üst üste biniyor, biraz mesafe.
- Gerçek kod (dal `claude/project-thread-nezlm0` @ `f92250e6`): satırın kart yüksekliği yazıya ek olarak üst köşe işaretleri ("!", simgeler) ile NEW arasında 6 px bırakır. Örnek: Priya Patel'in yeni Host kartı 44 px'ten 51 px'e çıktı, "!" ile NEW arası -1 px'ten 6 px'e. "!" üzerine gelince büyüse de satır oynamaz.
- Sorun Original görünümdeydi (bugünkü main); Yeni görünümde kart zaten 76 px.
- Denemek: Test page → Shift card look → Original → New Schedule → Edit live schedule → Priya Patel pazartesi ya da Sophie Martin pazar, müsait olmadığı saate Add shift → Place shift. Görüntü: `ekran/unlem-new-aralik.png`.
- Bu düzeltme main'de: `249a43fd` (tren `cf533e01`, CI yeşil).
- Hayalet kartın konum iğnesi biraz büyüdü (Mert, 2026-10-13 14:56 Kaliforniya, "birazcık büyüt"): gerçek kodda 12 → 14 px (main'de `9d53f1ed`, tren `2dda006f`, CI yeşil), bu sayfanın Yeni görünümünde 15 → 17 px.
- Yeni görünüm Mert'in 40 taslaktan seçtiği işaretleri giyiyor (2026-10-13 15:41 Kaliforniya, `/mnt/project-files/pages/gorsel-kararlar/gelen/kart-isaretleri-40/`):
  - müsait değil: 5 · Nokta (küçük turuncu nokta; basılacak alanı 18 px);
  - LIVE: 1 · Nokta + Live (yeşil nokta ve LIVE, kutusuz);
  - NEW: 7 · Yalın yazı (kutusuz yeşil NEW).
  - Yönetici notu işareti seçilmedi; bugünkü lacivert üçgen kalıyor.
  - Original görünüm bugünkü main.

## Sürüm 9 (2026-10-13 ~18:06 Kaliforniya)
- İstek: Mert, 2026-10-13 17:56 Kaliforniya: not işareti olarak 11'in ince ataşı, çapraz, 15'teki yerde, biraz büyük.
- Yeni görünümün yönetici notu işareti artık 16 · Çapraz ince ataş: kartın sol üst köşesinden 4 px aşağı, 5 px içeri, 15 px, lacivert (`--theme-note`); üzerine gelince not açılır. Original görünümde bugünkü lacivert üçgen.
- Dar haftada (ızgara yazıyı kartın tam genişliğine yaydığında) ataş da "!" gibi yazının üstünde kendi satırını alıyor; önce 1440 px ekranda "Lunch-Line Cook" yazısına değiyordu. Ölçüm (tarayıcı): 1100–2400 px ekranda ataş ile yazı arası en az 3 px. Kod: `source/overrides/ShiftCard.tsx` (`data-rk-top`).
- Yayın değişti: `app.html` artık yalnız CSS taşır, betik ayrı `app.js` dosyasında (yayın aracı tek parça `app.html`'i reddetti; `/mnt/project-files/pages/gorsel-kararlar/gelen/kart-isaretleri-40/yayin/split-app.mjs <dist> <çıktı> "Schedule shift cards"`, sonra `app.js`'teki U+FFFD karakterleri `\uFFFD` yazılır). Bu klasördeki `app.html` indirilecek tek parça hâli.
- Denemek: Schedule sekmesi → Carlos Rivera pazartesi ya da Jake Thompson çarşamba: sol üstteki ataşın üzerine gel. Görüntü: `ekran/not-isareti-16.png`.
- Gerçek uygulamada değil; Mert "kodla" deyince geçer.

## Sürüm 10 (2026-10-13 ~18:50 Kaliforniya)
- İstek: Mert, 2026-10-13 18:15 Kaliforniya: "Her zaman için ilk satir meta datayla ayni hizada olsun. Şuan badge i yukari doğru büyütmüş ve gereksiz boşluk oluşturmuş tepede".
- Yeni görünüm: kartın üst işaretleri (ataş, "!", LIVE, "x2", hayalet kartın iğnesi) kartın ilk satırıyla aynı hizada; okurken hiçbir işaret karta kendi satırını açmıyor, kart yukarı büyümüyor. Bir satırdaki kartların ilk satırları hep aynı hizada (yazı kartın üstünden başlıyor, artan boşluk altta).
- Dar haftada okurken ad yanındaki işarete 4 px'ten fazla yaklaşmıyor (sığdıkça ortada, sığmazsa kayıyor); hepsi sığmazsa hafta en dar düzene geçer, sığmayan ad "…" ile biter. Örnek veride 1440 px ekranda hayalet "Breakfast-Prep Cook" kartları "Breakfast-Prep C…" oluyor.
- Dar haftada düzenlerken işaretler eskisi gibi yazının üstündeki kendi satırında (LIVE adın yanına sığmıyor); bu satır her kartta olduğundan ilk satırlar yine aynı hizada.
- Ölçüm (tarayıcı, 1100–2400 px, okuma ve düzenleme): işaret ile ilk satırın ortası en çok 1 px farklı; satırında farklı yükseklikte ilk satırı olan kart yok.
- Kod: `source/vk/line1.ts` (ilk satırın ortası, işaretlerin uzanımı), `source/vk/vk.css`, `source/overrides/ShiftCard.tsx`, `source/overrides/ScheduleGridShell.tsx` (dar haftada ada yer), `source/overrides/useScheduleBadgeMeasurements.tsx` ("!" ile NEW arası). Görüntü: `ekran/ilk-satir-hizasi.png` (önce / şimdi).

## Yeniden kurma
1. `source/`'u repo'da `apps/web/.temp/rk/`'ye kopyala.
2. `ATLAS_SHA=<main sha> pnpm --filter @newfork/web exec vite build --config .temp/rk/vite.config.ts`
3. `node apps/web/.temp/rk/inline-app.mjs <çıktı klasörü>` → `index.html` + `app.html`.
4. `python3 /mnt/project-files/pages/kaynak-bandi/bant.py <çıktı>/index.html S9fM4Yfc7SLhro3frLo9gL`, sonra aynı link'e yayın.

## Görsel karar
Mert yorumlarla seçti; ne değiştiği madde madde `/mnt/project-files/pages/gorsel-kararlar/gelen/schedule-kart-isaretleri/README.md`. Değişen kartın kodu `source/overrides/` (ShiftCard, ScheduleRow, sütun ölçer) ve `source/vk/` (side.ts, vk.css, store.ts). Görüntüler: `ekran/yeni-izgara-duzenleme.png`, `ekran/yeni-katalog-ornekleri.png`.
