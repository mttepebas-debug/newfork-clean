# Newfork

ABD restoranları için çok kiracılı vardiya planlama SaaS'ı. Arayüz İngilizce (ABD); Mert'le (ürün sahibi, tek geliştirici) Türkçe ve sade konuşulur. pnpm + turbo monorepo: `apps/web` (React 19, Vite 7, TanStack Query), `apps/api` (Fastify 5, zod), `packages/shared` (tipler, saf kurallar), `packages/ui`, `supabase/` (migration, RLS, pgTAP), `e2e/` (Playwright).

## Güvenlik
- Bir workspace başkasının verisini göremez: her tablo, fonksiyon ve uç RLS + `app_private.authorize()` / `scope_set()` üzerinden. Ret 42501 + `authz.*` hint; API'de `authz.not_member` → 404, diğer `authz.*` → 403. Yeni `*_service` `supabase/tests/authorization_matrix.test.sql` ve `authz_catalog.test.sql`'de sınıflanır.
- Hata için önce kırmızı test; beklenti gevşetilmez (skip ve todo dahil).
- Gizli anahtar commit edilmez (`.env.local`). SSN toplanmaz.

## Kod ve main
- Ana klasör (`newfork-clean`, main) Mert'indir: orada kod değiştirilmez, dal değiştirilmez. Her oturum işini kendi worktree'sinde yapar: `git worktree add ../newfork-wt/<iş> -b task/<iş> origin/main`, sonra `pnpm.cmd install`.
- Yasak: `git stash`, `reset --hard`, `checkout -- .`, force push, `--no-verify`, toplu `git clean`, başkasının worktree'si, isimle süreç öldürme.
- Main'e gönderim: dokunduğun paketin lint, typecheck ve testleri yeşil → `git fetch origin && git rebase origin/main` → `git push origin HEAD:main`. Main'deki her şey Vercel'den canlıya çıkar. Tam test (CI) main'e girince Mert'in bilgisayarındaki runner'da koşar: `gh run watch` ile izle, kırmızıysa hemen düzelt.
- Gönderdiğin işte migration varsa ortak yerel DB'ye uygula: `node scripts/lock.mjs run db -- node scripts/db-apply.mjs`.

## Canlı veritabanı (Supabase `hvyvyisrqyathtliyyyv`)
- İşi yapan oturum `canli-migration` skill'iyle uygular: yedek → MCP `apply_migration` → doğrulama → dosya adı = canlı ledger sürümü.
- Riskli migration (silen; yetki, RLS, grant, policy; SECURITY DEFINER ya da CREATE OR REPLACE; `*_service`; davet; sahiplik devri; veri silme; parola/oturum) `nf-guvenlik` ONAY'ı ve Mert'in "evet"iyle. `supabase db push` ve `db reset` yasak.

## Mert'le çalışma
- Kısa cümle, geliştirici dili yok. Dosya tam Windows yolu ve tıklanır bağlantıyla; saat California saatiyle (PowerShell'den al, Git Bash `date` UTC verir).
- Küçük işte başla. Büyük işte bir kez kısa brief (sorun, bitti ölçütü, önerin), Mert onaylar, bitene kadar yeniden sorma.
- Çalıştığını kendin doğrula (test, e2e, ekran görüntüsü), kanıtı gönder. Mert'e yalnız onun kararı sorulur: görsel seçim, ürün kuralı, para, geri alınamaz adım. Soruda önerilen ilk sırada `(Önerilen)`, son seçenek "Yazarak cevap vereceğim".
- Git'i Mert'e sorma. Mert'in çalıştıracağı komut tek satır, `bash` bloğunda, PowerShell 7'de geçerli (`pnpm.cmd`); kendin çalıştırabileceğin komutu verme.
- Aynı ekranın görsel işi o ekranın var olan Artifact'ında sürer.

## Yapı
- Bir isteğin yolu: ekran → TanStack Query hook'u (`*-data.ts`) → `apiRequest` → API route (`apps/api/src/<alan>/`) → `supabase.rpc('<ad>_service')` → RLS + `app_private.authorize()`. Web veriye API'den ulaşır; web'deki `can()` yalnız yansıtır.
- Bugünkü şema `supabase/schema.sql`'de (elle düzenlenmez, `pnpm.cmd db:schema` üretir); bir fonksiyonun son hâli migration'larda değil orada aranır. Test dünyası `supabase/test-support/builder.sql`.

## Adlar ve biçim
- RPC adı `<ad>_service`; migration `YYYYMMDDHHMMSS_<ad>.sql`, uygulanmış migration değiştirilmez.
- Ekran metninde "workspace" ve "team", kod adı görünmez; renk ham hex değil `--theme-*`; yalnız light tema; yıkıcı düğme `ConfirmButton` (iki tık); tarayıcı diyaloğu yok.
- Commit: İngilizce Conventional Commits, dosyalar adıyla (`git commit -a` yok).

## Komutlar
- `pnpm.cmd install` · `pnpm.cmd supabase:start` · `pnpm.cmd dev` (web 5555, API 5556; önizleme 5642/5643).
- `pnpm.cmd lint` · `pnpm.cmd typecheck` · `pnpm.cmd test` · `pnpm.cmd build`; odaklı: `pnpm.cmd --filter <paket> lint` / `typecheck`, `pnpm.cmd --filter @newfork/web exec vitest run <dosya>`.
- Ortak yerel DB'ye dokunan komut kilitle koşar: `node scripts/lock.mjs run db -- pnpm.cmd test:db` (akış testi: `node scripts/lock.mjs run db --e2e -- <komut>`); sıra `node scripts/lock.mjs status`.
- Migration ekleyince `pnpm.cmd db:schema`, şema aynı commit'e; yeni pgTAP dosyası `supabase/tests/ci-green.txt`'ye.

## Tuzaklar
- Yerel DB tek ve bütün oturumlarda ortak: migration denemesi tek transaction + `rollback`; main'e girmemiş migration ortak DB'ye kalıcı uygulanmaz.
- Yeni worktree'de önce `pnpm.cmd install` (yoksa vitest `@vitejs/plugin-react`'i bulamaz).
- Dev sunucusu port PID'iyle değil süreç ağacıyla durdurulur (`tsx watch` canlı kalır); yabancı PID'deki portu öldürme, boş port çifti al.
- `mt.tepebas@gmail.com` Mert'in gerçek hesabıdır; testte `owner@newfork.test` ya da e2e dünyası kullanılır.
