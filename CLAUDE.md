# Newfork

ABD restoranları için çok kiracılı vardiya planlama SaaS'ı. Arayüz İngilizce (ABD); Mert ürün sahibi ve tek geliştiricidir. pnpm + turbo monorepo: `apps/web` (React 19, Vite 7, TanStack Query), `apps/api` (Fastify 5, zod), `packages/shared` (tipler, saf kurallar), `packages/ui`, `supabase/` (migration, RLS, pgTAP), `e2e/` (Playwright).

## Güvenlik
- Bir workspace başkasının verisini göremez: her tablo, fonksiyon ve uç RLS + `app_private.authorize()` / `scope_set()` üzerinden. Ret 42501 + `authz.*` hint; API'de `authz.not_member` → 404, diğer `authz.*` → 403. Yeni `*_service` `supabase/tests/authorization_matrix.test.sql` ve `authz_catalog.test.sql`'de sınıflanır.
- Hata için önce kırmızı test; beklenti gevşetilmez (skip ve todo dahil).
- Gizli anahtar commit edilmez (`.env.local`).

## Kod ve main
- Ana klasör (`newfork-clean`, main) Mert'indir: orada kod değiştirilmez, dal değiştirilmez. Her oturum işini kendi worktree'sinde yapar: `git worktree add ../newfork-wt/<iş> -b task/<iş> origin/main`, sonra `pnpm.cmd install` (yoksa vitest `@vitejs/plugin-react`'i bulamaz).
- Yasak: `git stash`, `reset --hard`, `checkout -- .`, force push, `--no-verify`, toplu `git clean`, başkasının worktree'si, isimle süreç öldürme.
- Main'e gönderim: dokunduğun paketin lint, typecheck ve testleri yeşil → `git fetch origin && git rebase origin/main` → `git push origin HEAD:main`. Main'deki her şey Vercel'den canlıya çıkar.
- Yetki, RLS, grant, `*_service`, davet, sahiplik devri, veri silme ya da parola/oturum koduna dokunan iş main'e göndermeden önce `nf-guvenlik` ONAY'ı alır.
- Migration'lı işte sıra: ekleyen migration önce canlıya (aşağıda), sonra kod main'e; silen migration tersine, önce onu artık kullanmayan kod main'e, CI yeşil olunca canlıdan silme. Main'e girince ortak yerel DB'ye de uygula: `node scripts/lock.mjs run db -- node scripts/db-apply.mjs`.
- Tam test (CI) main'e girince Mert'in bilgisayarındaki runner'da koşar; `gh run watch` ile izle. GitHub'ın ücretsiz dakikaları sürdükçe aynı test `CI (GitHub)` adıyla GitHub'da da koşar; işleri başlamadan dakika/ödeme uyarısıyla düşerse kod kırmızısı değildir, `gh workflow disable "CI (GitHub)"` ile kapatılır ve Mert'e söylenir. Kırmızıyı gören oturum düşen testin hangi commit'ten geldiğini bulur: kendi commit'iyse hemen düzeltir, değilse o commit'i `git revert` ile geri alır ve Mert'e söyler.

## Canlı veritabanı (Supabase `hvyvyisrqyathtliyyyv`)
- İşi yapan oturum `canli-migration` skill'iyle uygular: yedek → MCP `apply_migration` → doğrulama → dosya adı = canlı ledger sürümü.
- Riskli migration (silen; yetki, RLS, grant, policy; SECURITY DEFINER ya da CREATE OR REPLACE; `*_service`; davet; sahiplik devri; veri silme; parola/oturum) `nf-guvenlik` ONAY'ı ve Mert'in "evet"iyle. `supabase db push` ve `db reset` yasak.

## Mert'le çalışma
- Mert'le konuşulan tek dil Türkçe. Kısa cümle, geliştirici dili yok.
- Bir şey anlatırken en basit yoldan anlat ve 5N1K'ya (ne, nerede, ne zaman, nasıl, neden, kim) cevap ver.
- Referans verirken tam yerini göster: ekran → bölüm → düğme, dosyanın tam Windows yolu tıklanır bağlantıyla ya da ekran görüntüsü. Saat California saatiyle (PowerShell'den al, Git Bash `date` UTC verir).
- Mert'in söylediğini olduğu gibi doğru kabul etme: en iyi uygulamayla karşılaştır, açığını ve zayıf yönünü söyle. Anlamak ve kapsamı daraltmak için soru sor, anladığını özetle, onay al; ondan sonra kod yaz. Küçük işte özet tek satırdır.
- Büyük işte bir kez kısa brief (sorun, bitti ölçütü, önerin); Mert onaylayınca iş bitene kadar yeniden sorma.
- Her zaman daha kısa, daha kaliteli, daha ucuz, en az kodla bitiren yolu öner. Konu dışındaki parçaya zorunda kalmadıkça dokunma.
- Mert'e yalnız onun kararı sorulur: görsel seçim, ürün kuralı, para, geri alınamaz adım. Soruda önerilen ilk sırada `(Önerilen)`, son seçenek "Yazarak cevap vereceğim".
- Git'i (commit, push, rebase, PR) Mert'e sorma, sen yönet. Mert'in çalıştıracağı komut tek satır, `bash` bloğunda, PowerShell 7'de geçerli (`pnpm.cmd`); kendin çalıştırabileceğin komutu verme.
- Çalıştığını kendin doğrula (test, e2e, ekran görüntüsü), kanıtı gönder.
- Yolda bulunan şey (güvenlik açığı ve hata dışında) plana ve koda katılmaz: listelenir, iş sonunda Mert'e raporlanır ve `C:\Users\TheWe\Desktop\newfork-md\yolda-bulunanlar\<tarih>-<iş>.md` dosyasına yazılır.
- Konuşma uzayınca ya da konu değişince Mert'e compact ya da devir notuyla yeni oturuma geçmeyi hatırlat. İş bitip yarım bir şey kalmadıysa oturumun arşivlenebileceğini söyle.
- Her iş sonunda kısa, gruplu liste: yapılan · biten · arayüzde değişen · yolda bulunanlar · sıradaki en önemli iş.
- Aynı ekranın görsel işi o ekranın var olan Artifact'ında sürer.

## Büyük iş
- Büyük işte çalışma kopyasında git'e girmeyen bir plan dosyası açılır: `artifacts/<iş>/PLAN.md` (hedef, bitti ölçütü, dilimler, her dilimin durumu). Her dilim bitince güncellenir. Compact ya da yeni oturumdan sonra iş konuşmadan değil bu dosyadan devam eder; devir notu ayrıca yazılmaz.
- İş dikey dilimlere bölünür: her dilim veritabanından ekrana kendi başına çalışır, kendi testiyle ayrı ayrı main'e girer.
- Geniş keşif (bir şeyin nerelerde geçtiği, bir akışın izi) alt ajana verilir (`nf-okur` ya da Explore); ana oturuma yalnız sonuç ve dosya:satır gelir.
- Bir klasördeki koda dokunmadan önce o klasörün `CLAUDE.md`'si okunur (`supabase/`, `apps/web/`, `apps/api/`, `e2e/`).

## Yapı
- Bir isteğin yolu: ekran → TanStack Query hook'u (`*-data.ts`) → `apiRequest` → API route (`apps/api/src/<alan>/`) → `supabase.rpc('<ad>_service')` → RLS + `app_private.authorize()`. Web veriye API'den ulaşır; web'deki `can()` yalnız yansıtır.
- Bugünkü şema `supabase/schema.sql`'de (elle düzenlenmez, `pnpm.cmd db:schema` üretir); bir fonksiyonun son hâli migration'larda değil orada aranır. Test dünyası `supabase/test-support/builder.sql`.

## Adlar ve biçim
- RPC adı `<ad>_service`; migration `YYYYMMDDHHMMSS_<ad>.sql`, uygulanmış migration değiştirilmez.
- Ekran metninde "workspace" ve "team", kod adı görünmez; renk ham hex değil `--theme-*`; yalnız light tema; yıkıcı düğme `ConfirmButton` (iki tık); tarayıcı diyaloğu yok.
- Commit: İngilizce Conventional Commits, dosyalar adıyla (`git commit -a` yok).

## Komutlar
- `pnpm.cmd install` · `pnpm.cmd supabase:start` · `pnpm.cmd dev` (web 5555, API 5556; başka oturum boş bir port çifti alır).
- `pnpm.cmd lint` · `pnpm.cmd typecheck` · `pnpm.cmd test` · `pnpm.cmd build`; odaklı: `pnpm.cmd --filter <paket> lint` / `typecheck`, `pnpm.cmd --filter @newfork/web exec vitest run <dosya>`.
- Ortak yerel DB'ye dokunan komut kilitle koşar: `node scripts/lock.mjs run db -- pnpm.cmd test:db` (akış testi: `node scripts/lock.mjs run db --e2e -- <komut>`); sıra `node scripts/lock.mjs status`.
- Akış testi (tek dosya): `e2e` klasöründen `node ../scripts/lock.mjs run db --e2e -- npx playwright test flows/<dosya>`; ayrıntı `e2e/CLAUDE.md`.
- Migration ekleyince `pnpm.cmd db:schema`, şema aynı commit'e; yeni pgTAP dosyası `supabase/tests/ci-green.txt`'ye.

## Tuzaklar
- Yerel DB tek ve bütün oturumlarda ortak: migration denemesi tek transaction + `rollback`; main'e girmemiş migration ortak DB'ye kalıcı uygulanmaz.
- Dev sunucusu port PID'iyle değil süreç ağacıyla durdurulur (`tsx watch` canlı kalır); yabancı PID'deki portu öldürme, boş port çifti al.
- `mt.tepebas@gmail.com` Mert'in gerçek hesabıdır; testte `owner@newfork.test` ya da e2e dünyası kullanılır.
