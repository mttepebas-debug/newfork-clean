# Newfork sayfa atlası

Uygulamanın her sayfasının gerçek koduyla, sunucusuz ve sahte veriyle çalışan kopyası. Her atlas sayfası ayrı bir Artifact; hepsi tek bir dizin sayfasından açılır. Mert sayfaları görsel belge ve deneme ortamı olarak kullanır: yorum bırakır ya da sayfayı açık tutup koordinatöre yazar.

- Kural (Mert, 2026-10-09): uygulamanın bütün sayfaları Artifact olarak belgelenir; kod değiştikçe Artifact'lar da güncellenir.
- Sahibi: "Sayfa atlası" thread'i. Bu klasörü yalnız o thread (ya da koordinatörün bu iş için açtığı thread) yazar.
- Dizin ve bağlantılar: `source/tools/atlas.json` (her sayfanın Artifact bağlantısı, derlendiği main sha'sı ve tarihi). Dizin sayfası bu dosyadan üretilir.
- Envanter (hangi sayfa, hangi rol, hangi API): `ENVANTER.md`.
- Schedule bu atlasın içinde derlenmez: dizindeki Schedule satırı "Schedule test sayfası"na bağlanır (`/mnt/project-files/pages/schedule-test/`, sahibi o thread).

## Klasör
- `index.html`: dizin sayfası ("Newfork sayfa atlası").
- `<sayfa>.html`: her atlas sayfasının yayınlanan dosyası (tek dosya, yaklaşık 2,3 MB; sınır 16 MB).
- `source/`: kaynak. Repo'ya girmez; derlerken `apps/web/.temp/atlas/`'a kopyalanır (`.temp` gitignore'da).
  - `pages.ts`: atlas sayfaları: kimlik, açılış adresi, sayfaya ait adresler, seçilebilen roller.
  - `router-shim.tsx`: uygulamanın tarayıcı yönlendiricisi bellek yönlendiricisine döner; sayfanın kendi adreslerinden çıkan bağlantı geri döner ve hangi atlas sayfasında olduğunu söyler.
  - `harness.ts`: sayfanın üst ortasındaki "Atlas" düğmesi: rol seçici (Owner · Mert Tepebas, Manager · Rachel Adams (Downtown), Employee · Maria Lopez), "Reset demo data", derlendiği main sha'sı.
  - `mock/`: tarayıcıdaki sahte backend. `api.ts` rota tablosu ve oturum bağlamı (`/v1/context`, role göre izinler); `world.ts` ortak demo restoran (Harbor & Vine: Downtown ve Uptown şubeleri, 16 çalışan, vardiyalar; Schedule test sayfasındakiyle aynı); `store.ts` her alanın kendi kalıcı verisi; `<alan>-service.ts` alan başına uçlar (requests, hub, employees, documents, settings, dates, workspace, availability, communications, account, onboarding); `fake-supabase.ts` doğrudan Supabase okuma ve yazmaları.
  - `tools/build.mjs`: bir kez derler, her sayfanın dosyasını ve dizini yazar. `tools/index.mjs`: dizin sayfasını üretir. `tools/shot.mjs`: bir sayfanın ekran görüntüsü ve konsolu (kontrol için). `tools/sync.sh`: kaynağı bu klasöre kopyalar.

## Derleme (bulut thread'i, Linux)
1. Repo'yu istenen main'e getir: `git fetch origin main` ve temiz bir kopyada `git checkout --detach origin/main` (ana klasörde çalışılmaz kuralı Mert'in bilgisayarı içindir; bulut kopyası thread'indir).
2. Repo kökünde: `pnpm install` (yoksa).
3. `mkdir -p apps/web/.temp/atlas && cp -r /mnt/project-files/pages/atlas/source/. apps/web/.temp/atlas/`
4. `apps/web` içinde tip kontrolü: `./node_modules/.bin/tsc -p .temp/atlas/tsconfig.json --noEmit`
5. Geliştirme sunucusu (deneme): `./node_modules/.bin/vite --config .temp/atlas/vite.config.ts --host 127.0.0.1 --port 5711`, sonra `http://127.0.0.1:5711/?page=<sayfa>` (isteğe bağlı `&path=<adres>`).
6. Kontrol: her değişen sayfa ve rol için `node .temp/atlas/tools/shot.mjs <sayfa> <rol>`; çıktıda `[demo api] no route` satırı (sahte backend'in cevaplamadığı yeni uç) ya da `pageerror` kalmamalı.
7. Derle ve dosyaları yaz: `node .temp/atlas/tools/build.mjs` (hepsi) ya da `node .temp/atlas/tools/build.mjs requests employees` (yalnız bunlar). Sha ve tarih `atlas.json`'a yazılır.
8. Kaynağı geri kopyala: `sh .temp/atlas/tools/sync.sh`.
9. Yayın: önce kaynak bandı (2026-10-10 kuralı, /mnt/project-files/pages/kaynak-bandi/README.md): `bash .temp/atlas/tools/prep-publish.sh <geçici klasör> [sayfa id…]` her sayfayı (ve dizini) geçici klasöre kopyalar ve kopyaya `bant.py` ile bandı ekler. Sonra geçici klasördeki her `<sayfa>.html`'i Artifact aracıyla `atlas.json`'daki kendi bağlantısına yayınla (`url` ile; yeni bağlantı açılmaz, Artifact silinmez), en son `index.html`'i dizinin bağlantısına. Bantsız dosyayı (bu klasördeki) doğrudan yayınlama: bant kaybolur. Atlas düğmesi bandın hemen altında durur; bant kapatılınca en üste çıkar.

## Bakım: tren main'e inince
Koordinatör "tren main'e indi, sha `<sha>`" deyince:
1. Hangi sayfalar etkilendi: `git diff --stat <atlas.json'daki eski sha>..<yeni sha> -- apps/web packages/shared packages/ui`. Değişen dosyayı `ENVANTER.md`'deki "kaynak dosya" ve API sütunlarıyla eşle. `apps/web/src/shell`, `packages/ui`, `apps/web/src/styles.css` ya da `packages/shared` değiştiyse bütün sayfalar etkilenmiş sayılır.
2. API değiştiyse (`apps/api`, `supabase/schema.sql`, shared şemalar) ilgili `mock/<alan>-service.ts`'i yeni cevap şekline uydur; shot.mjs ile `no route` ve şema hatası kalmadığını gör.
3. Yukarıdaki derleme adımları 1–9; yalnız etkilenen sayfalar yeniden yayınlanır, dizin her seferinde yeniden yayınlanır (sha ve tarih görünsün).
4. Yeni bir sayfa ya da rota geldiyse: `pages.ts`'e ve `atlas.json`'a ekle, `ENVANTER.md`'yi güncelle, ilk yayında yeni bağlantıyı `atlas.json`'a yaz.
5. Koordinatöre tek satır: hangi sayfalar hangi sha'ya güncellendi, dizin bağlantısı.

## Bilinen farklar (bütün sayfalar)
- Veri sahte ve yalnız açan kişinin tarayıcısında kalır; "Reset demo data" baştaki hâle döndürür. Veri hafta değişince kendiliğinden yeniden kurulur.
- Dosya indirme (Export, belge indirme) Artifact içinde çalışmaz; yükleme gerçek depoya gitmez.
- Gerçek zamanlı kanallar bağlanır ama sessizdir; başka birinin yaptığı değişiklik gelmez.
- E-posta ve SMS gönderilmez.
- Bir sayfa yalnız kendi adreslerinde gezinir; başka sayfaya giden bağlantı geri döner ve o sayfanın atlastaki adını söyler.
