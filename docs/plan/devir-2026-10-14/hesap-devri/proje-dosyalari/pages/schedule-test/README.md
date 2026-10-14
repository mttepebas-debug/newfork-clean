# Schedule test sayfası

Gerçek Schedule ekranının (apps/web) tarayıcıda, sunucusuz çalışan kopyası. Kod gerçek uygulamanın kodu; yalnız veri katmanı sahte (Harbor & Vine adlı demo restoran, iki şube, 16 çalışan). Değişiklikler yalnız açan kişinin tarayıcısında kalır; sağ alttaki "Test page" → "Reset demo data" ilk hâle döndürür.

- Yayın: https://claude.ai/artifact/RNJEGWCDgdG2NpYRpWF4g3 — 2026-10-09 11:26Z'den beri bu bağlantıda "/oto" thread'inin birleşik Schedule sayfası var (sürüm 9, kaynağı /mnt/project-files/pages/schedule-birlesik/). Bu klasörden bu bağlantıya yayın yapma; birleşik sayfanın üstüne yazar. Sürüm 8'e kadar bu klasörün kaynağı yayındaydı.
- Temel commit: main afb24b35; güncelleme kuralı aşağıda
- Yayınlanan dosya: `index.html` (tek dosya, ~8 MB; sınır 16 MB)
- Kaynak: `source/` (repo'ya girmez; `apps/web/.temp/` gitignore'da)
- Sahibi: "Schedule test sayfası" thread'i. Bu klasördeki `index.html` ve `source/` yalnız o thread'den yazılır.

## Kendi kopyanı derlemek (başka thread'ler, bulut, Linux)
Klasör adı serbesttir; aşağıda `<ad>` senin varyantının adı. Bu klasöre yazma; kendi çıktını `/mnt/project-files/pages/<ad>/` altına koy ve kendi bağlantını yayınla.
1. Repo kökünde bağımlılıklar yoksa: `pnpm install`
2. `mkdir -p apps/web/.temp/<ad> && cp -r /mnt/project-files/pages/schedule-test/source/. apps/web/.temp/<ad>/` (gizli `.env` dosyası da gelir; içinde yalnız sahte demo adresleri var, gerçek anahtar yok)
3. `apps/web` içinde tip kontrolü: `./node_modules/.bin/tsc -p .temp/<ad>/tsconfig.json --noEmit`
4. Geliştirme sunucusu (canlı yenileme): `./node_modules/.bin/vite --config .temp/<ad>/vite.config.ts` (port 5701, `--port` ile değişir)
5. Derle: `./node_modules/.bin/vite build --config .temp/<ad>/vite.config.ts`
6. Tek dosyaya çevir: `mkdir -p /mnt/project-files/pages/<ad> && node .temp/<ad>/inline.mjs /mnt/project-files/pages/<ad>/index.html`
7. O dosyayı Artifact olarak yayınla; sonraki sürümleri aynı dosya yolundan aynı bağlantıya yayınla.

Bu sayfanın kendisi aynı adımlarla derlenir: `<ad>` = `schedule-test`, çıktı bu klasörün `index.html`'i, yayın https://claude.ai/artifact/RNJEGWCDgdG2NpYRpWF4g3.

Bu adımlar 2026-10-09'da `source/`'un yeni bir klasöre kopyasıyla denendi (tip kontrolü ve derleme temiz).
**Kural (Mert, 2026-10-09):** her varyant sayfası orijinali de gösterir. Varyant seçicide ilk seçenek bugünkü uygulama olur ve "Original" diye adlanır.

Gerçek uygulama kodu (`apps/web/src`) değiştirilmez: ekran değişikliği takma adla (`vite.config.ts` → `resolve.alias`) ya da kendi klasöründeki bir dosyayla yapılır; Templates varyantları bunun örneğidir. Seçilen varyant sonra bu sayfaya birleştirilir.

## Temel sürüm güncellemesi (orijinal = güncel main)
**Kural (Mert, 2026-10-09):** Schedule koduna dokunan bir değişiklik main'e girince sayfadaki "Original" güncel main'i gösterecek şekilde yenilenir.
- Koordinatör "tren main'e indi" deyince bu thread `apps/web`'i yeni main sha'sından derler, gerekirse sahte veri katmanını (`mock/`) yeni API'ye uydurur, aynı bağlantıya yayınlar ve aşağıdaki satırı günceller.
- Şu anki temel: main `afb24b35` (2026-10-09 09:03Z, S4b: geri getirilemeyen Undo adımı listeden düşer, "Last edit can't come back" uyarısı; sahte Undo da aynısını yapar). Önceki temeller: `9a9793e2`, `021f82e0`.
- Tasarım thread'leri: temel değişince kendi kopyanızı yeni main'e geçirin. Repo'yu yeni main'e çekin, `source/`'u yeniden kopyalayın, kendi dosyalarınızı (varyantlar, takma adlar) üstüne koyun, derleyip kendi bağlantınıza yeniden yayınlayın.

## Nasıl çalışır
- `router-shim.tsx`: uygulamanın BrowserRouter'ı /app/schedule'da başlayan bellek yönlendiricisine döner; Schedule dışına çıkan her yol geri döner ve kısa bir uyarı gösterir.
- `mock/fake-supabase.ts`: oturum açık sahte Supabase istemcisi.
- `mock/api.ts` + `mock/schedule-service.ts`: `https://api.newfork.demo` isteklerini tarayıcıda cevaplar. Kurallar `supabase/schema.sql`'deki servis fonksiyonlarını izler (edit oturumu, taslak, yayın, Templates, Auto-fill, varsayılan saatler, izin ve müsaitlik kontrolü).
- `mock/world.ts`: demo veri; hafta değişince yeniden kurulur.
- `mock/employee-drawer-stub.tsx`: çalışan kartı (Employees ekranı) bu sayfada açılmaz.
- `pdf-worker.ts`: Export önizlemesindeki PDF sayacı (pdf.js) Artifact içinde worker başlatamıyor; pdf.js'i sayfanın kendi iş parçacığında çalıştırır, "Setting up fake worker" uyarısını susturur.
- `harness.ts`: köşedeki "Test page" düğmesi ve uyarı kutusu.
- `vite.config.ts`: `react-router`, `@supabase/supabase-js`, `@newfork/ui`, çalışan kartı ve Templates penceresi için takma adlar.

## Templates varyantları (2. aşama)
"Test page" → "Templates window" ile seçilir; seçim tarayıcıda kalır. Kod `source/templates/`.
- **Original · today's app**: bugünkü gerçek pencere (orijinal) (`ScheduleTemplateDialogs.tsx`), karşılaştırma için.
- **A · Library** (`variant-a.tsx`): büyük pencere; solda şablon listesi, sağda seçilen şablonun haftası (departman × gün tablosu), altta "Add / Replace", departman seçimi ve haftaya etkisi.
- **B · Side panel** (`variant-b.tsx`): Export gibi sol menünün yerinde açılır, hafta görünür kalır. "Show on the grid" açıkken (varsayılan) şablonun vardiyaları gerçek ızgaraya kesik çizgili soluk kartlar olarak çizilir, "Replace" ile gidecek kartların üstü çizilir; kişisi uygun olmadığı için açık vardiyaya dönenler "Was <isim>" yazar (`grid-preview.ts`). Düzenleme dışındayken açık vardiyalar için Unassigned satırı olmadığından panel "Start editing to see all of it" düğmesi sunar; seçimler korunur, uygulanmaz.
- **C · Step by step** (`variant-c.tsx`): üç adım: şablon → ne uygulanacak → gözden geçir.
- Ortak parçalar `shared.tsx`, stil `templates.css`.
- Önizleme uç noktası `added` (hangi hücreye ne eklenecek) ve `removed_shift_ids` alanlarını da döner; B'nin ızgara önizlemesi bunları kullanır.

Varyantların kullandığı ama main'de API rotası olmayan sahte uçlar (gerçeğe geçerken yeni backend işi):
- `POST /prototype/templates/:id/apply-preview`: uygulamadan önce kuru deneme (eklenen, silinen, açık vardiyaya dönen). DB'de `preview_schedule_template_apply_service` var, API rotası yok.
- `POST /prototype/templates/from-week`: canlı haftadan ya da açık düzenlemeden şablon kaydetme (bugün yalnız taslaktan).
- `GET /prototype/viewed-week`: pencerenin hangi haftaya uygulanacağını bilmesi için.

## İzin kuralı (Test page → Time off rule)
- **Original · today's app**: main'deki gibi. İzinli günün hücresi kırmızı "Time off" yazar ama tıklanınca vardiya penceresi açılır; izinle çakışan vardiyayı sunucu kayıtta reddeder.
- **New rule (Oct 9): cell locked**: Mert'in 2026-10-09 kararı. Tamamı izinli günün hücresi açılmaz ("Time off · locked"), tıklayınca "önce izni kısalt" uyarısı çıkar. Kısmi izinli gün açılır; izinle 1 dakika bile çakışan vardiyayı sunucu iki kuralda da reddeder.
- Kod: `time-off-rule.ts` (gerçek koda dokunmaz; hücreye tıklamayı sayfa düzeyinde keser). Deneme: Maria Lopez, Çarşamba ve Perşembe (tam gün); Noah Garcia, Perşembe 15:00 sonrası (kısmi).

## Bilinen farklar
- Export'ta dosya indirme Artifact içinde çalışmaz (görüntüleyici indirmeye izin vermez); önizleme çalışır.
- Çalışan kartı ve Schedule dışındaki menüler açılmaz; kısa bir uyarı çıkar.
- 2026-10-09 izin kuralı main'de henüz yok; sayfada "Time off rule" düğmesiyle denenir (yukarıda).
