# PARALEL-1 Paralel oturumlar için üç araç açığı: test:db builder'ı, pano etiketi, push kancası
Status: ONAY (koordinatör, 2026-10-07 ~08:35Z) bir şartla: izlenen pgTAP dosyalarına (`supabase/tests/*.sql`) dokunulmaz.
Şart tasarımda zaten karşılanıyor: kopyalar koşu anında gitignore'lu `supabase/tests/.builder-run/` altında üretilir, izlenen dosya
değişmez; sonradan eklenen test dosyası da kopyalandığı için kendiliğinden kapsanır. Soru: (a) kabul (e2e kapsam dışı, rapora BACKLOG
önerisi). Gönderimden önce koordinatöre tek satır; ekran oturumlarına yeni davranışı koordinatör bildirir.
Session: oturum/paralel-1   Branch: task/paralel-1   Worktree: ../newfork-wt/paralel-1   DB: yerel (ölçüm için db.lock + heavy.lock)
Risk: R2 (test:db akışı ve guard bütün oturumları etkiler; yetki, veri, canlı yok)
Reviewer: tek bağımsız inceleme: `/code-review`
Skills: kod → `superpowers:test-driven-development` (önce kırmızı test) · bitti demeden → `superpowers:verification-before-completion` · inceleme bulgusu → `superpowers:receiving-code-review`

Goal: 2026-10-07'den beri paralel çalışan üç ekran oturumunun (EKRAN-01/02/03) birbirinin testini, panosunu ve gönderim
uyarısını bozmaması. Kaynak: koordinatörün PARALEL-1 görev mesajı (KK-193), BACKLOG BL-897, BL-755 (+ BL-516, BL-788), BL-760.

## In scope

### 1. BL-897 — `pnpm test:db` dalın builder'ını ortak DB'ye kalıcı yüklüyor
Bugün: `package.json:11` `test:db` = `node scripts/reload-test-builder.mjs && supabase test db`; betik dalın
`supabase/test-support/builder.sql`'ini `docker exec psql -f -` ile autocommit uygular. EKRAN-01'in builder değişikliği main'e
girmeden EKRAN-02'nin pgTAP koşusunun dünyası olur.

Ölçüm (2026-10-07, `origin/main` `d57be38c`, yerel DB, rollback'li):
- 172 test dosyasının 172'si ilk deyim olarak tek başına `begin;` satırıyla açılıyor, tek `rollback;` ile kapanıyor; `commit;` yok.
- builder.sql yalnız `create schema/table if not exists`, `revoke/grant`, `create or replace function`, `drop function if exists`
  içeriyor: hepsi işlem içinde geri alınabilir.
- psql'de `begin; \ir builder.psql` aynı satırda çalışıyor: builder işlemin içinde yazıyor, `rollback` ile gidiyor.
- Builder'ı bir işlemde yüklemek ~30–50 ms (docker exec'in kendi ~420 ms'i hariç) → 172 dosyada ~5–9 sn ek.

Seçenekler:
| | Yol | Sonuç |
|---|---|---|
| A | Yalnız `origin/main`'deki builder'ı kalıcı yükle, dalınkini hiç yükleme | Builder değiştiren dal kendi testini koşamaz (eski dünya) ✗ |
| B | Dalın builder'ını her test dosyasının kendi işleminde yükle; kalıcı yükleme yok | Doğru; ama main'e giren builder değişikliğini ortak DB'ye kimse yüklemez, yerel e2e eski dünyayla kalır |
| **C** | **B + `origin/main`'deki builder'ı kalıcı yükle (tek işlem)** | **Seçilen.** pgTAP her zaman dalın kendi builder'ıyla; ortak DB'nin hangi builder'ı taşıdığı pgTAP sonucunu artık hiç etkilemez; ortak DB'de kalıcı duran her zaman main'inki |
| D | Dal builder'ı main'inkinden farklıysa yalnız o zaman işlem içinde | İki yol, nadir koşan yol çürür; kazanç 5–9 sn ✗ (P19) |
| E | Her koşuya ayrı veritabanı (`create database … template postgres`) | Açık bağlantı varken template kopyalanamaz; ağır ✗ |
| F | pgTAP'ı kendi psql döngümüzle koşmak (supabase CLI'sız) | TAP özetini yeniden yazmak, bakım ✗ |

C'nin ayrıntısı:
- Yeni `scripts/test-db.mjs`; `scripts/reload-test-builder.mjs` silinir (ikiz yok). `package.json` `test:db` → `node scripts/test-db.mjs`.
  Dosya argümanı bugünkü gibi çalışır: `pnpm.cmd test:db supabase/tests/x.test.sql` yalnız o dosyayı koşar.
- Adım 1 (kalıcı, yalnız main'in içeriği): `git show origin/main:supabase/test-support/builder.sql` → `psql -1 -v ON_ERROR_STOP=1`
  (tek işlem: bugün hata olursa builder yarım kalıyordu). Başarısızsa uyarı yazar, testler sürer (testler zaten kendi builder'larıyla
  koşar). `origin/main` bütün worktree'lerde aynı ref (ortak git klasörü), yani bir oturum başkasının daha yeni main'ini geri alamaz;
  `git fetch` yapılmaz.
- Adım 2 (geçici, dalın içeriği): `supabase/tests/.builder-run/` (gitignore) altına her test dosyasının kopyası; ilk `begin;` satırı
  `begin; \ir builder.psql` olur (satır numaraları değişmez, hata satırı aynı kalır). `builder.psql` = `set client_min_messages =
  warning` + çalışma klasöründeki builder.sql (commit'lenmemiş hâli dahil) + `reset client_min_messages`. İlk deyimi tek başına
  `begin;` olmayan dosya varsa koşu başlamaz ve dosya adıyla hata verir (bugün 0 dosya).
- Adım 3: `supabase test db supabase/tests/.builder-run` (CLI yalnız `supabase/tests` altını bağlıyor), çıkış kodu aynen; klasör
  sonunda silinir, açılışta artık kalmışsa önce silinir.
- `node scripts/test-db.mjs --load-only`: yalnız adım 1 (builder değişikliği main'e girdikten sonra e2e için ortak DB'yi tazelemek;
  bugünkü `reload-test-builder.mjs`'in tek başına kullanımının yerine).
- CI etkilenmez: `ci.yml` `supabase test db <liste>`'yi doğrudan, sıfırdan kurulmuş DB'de (seed builder'ı yükler) koşuyor.

### 2. BL-755 (+ BL-516, BL-788) — pano bütün oturumlara aynı etiketi gösteriyor
Bugün: `inbox.mjs status` etiketi `label/<slug(cwd)>.json`'a yazıyor, `board` aynı yoldan okuyor (`scripts/inbox.mjs:154`, `:168`);
`slug` 40 karakterde kesiyor (`:29-30`) → `…/newfork-clean/.claude/worktrees/…` ve `…/Codex/newfork-wt/…` altındaki oturumlar aynı
dosyayı paylaşıyor. İkinci açık: pano satırının `cwd`'si oturumun başladığı klasör (kanca girdisi), `status`'un `cwd`'si komutun
koştuğu klasör (`cd ../newfork-wt/<id>` sonrası farklı) → kartla açılan oturumun etiketi hiç görünmüyor.
- Düzeltme: etiket oturum kimliğine bağlanır (`CLAUDE_CODE_SESSION_ID`, Bash ortamında var ve kanca `session_id`'siyle aynı;
  OTOMASYON-3 ölçtü): `label/<session>.json`. Kimlik yoksa (elle terminal) tam yolun özeti: `label/cwd-<sha1(yol)>.json`.
  `board` önce oturum kimliğiyle, yoksa tam yolla okur. Eski kesik adlı etiket dosyaları okunmaz (eski veri korunmaz).

### 3. BL-760 — main push kancası gönderilen ref'i değil oturum klasörünün HEAD'ini okuyor
Bugün: `scripts/guard.mjs:196` `aheadFiles(dir)` ve `:209-224` `e2eGap`/`sameContent` `origin/main...HEAD` ve `HEAD`'e bakıyor;
`git push origin task/x:main` (HEAD başka dalda) yanlış uyarı veriyor ya da gerçek uyarıyı kaçırıyor. Aynı `aheadFiles` "push CI
başlatır mı" (yalnız docs mu) kararını da veriyor (`:544-545`), o da aynı hatayı taşıyor.
- Düzeltme: `pushCall` her refspec için kaynak ve hedefi döndürür (`src:dst`; düz `x` → `x:x`; `HEAD` ya da refspec yok → `HEAD`;
  `--all`/`--mirror` → `HEAD`, bugünkü gibi). `aheadFiles(dir, src)`, `e2eGap(dir, ahead, src)` ve e2e damgası karşılaştırması
  kaynağa bakar; "CI başlatır mı" bütün kaynakların birleşimine.

## Out of scope
- Yerel e2e'nin builder'ı: e2e ortak DB'deki builder'la koşar; C'den sonra bu her zaman main'inki. Builder değiştiren bir dalın
  e2e'si yerelde yeni builder'ı ancak main.lock penceresinde (ya da CI'da) görür. Aşağıdaki "Soru".
- CI iş akışı, ekran dosyaları (apps/web, apps/api, supabase/migrations, yetki matrisi), BACKLOG.md (kapanış hükmü raporda),
  guard'ın kilit/kayıt kuralları, yeni bağımlılık.

## Done when
- `node --test scripts/*.test.mjs` yeşil; yeni testlerin hepsi önce kırmızı görüldü.
- BL-897 ölçümü (db.lock + heavy.lock, CI boşken): builder'ları farklı iki geçici dal (A: `tests.paralel1_a()` ekler, B:
  `tests.paralel1_b()` ekler; ikisinde de bunu soran bir pgTAP dosyası) sırayla `pnpm.cmd test:db <dosya>` koşar →
  A'nın testi `paralel1_a`'yı görür, B'ninki `paralel1_a`'yı görmez ve `paralel1_b`'yi görür; her koşudan sonra ortak DB'de
  `tests.paralel1_*` 0 satır ve `tests` şemasındaki fonksiyon tanımlarının md5'i main'in builder'ını yükledikten sonrakiyle aynı.
- Tam `pnpm.cmd test:db` yeni akışla: `not ok` / `ERROR:` sayısı aynı tabandaki eski akışla aynı (aynı sayı benim değil).
- Tam kapı (lint, typecheck, test, build) yeşil, `heavy.lock` ile.
- `/code-review` ONAY @<sha>; gönderimden önce koordinatöre tek satır haber (ekran oturumlarının test:db'si değişiyor).

## Touches
`scripts/test-db.mjs` (yeni), `scripts/reload-test-builder.mjs` (silinir), `scripts/test-db.test.mjs` (yeni), `package.json`
(`test:db` ve `test` listesi), `.gitignore` (`supabase/tests/.builder-run/`), `scripts/inbox.mjs`, `scripts/guard.mjs`,
`scripts/coord-hooks.test.mjs`, `supabase/CLAUDE.md` ("Test (pgTAP) ve test dünyası" ilk madde: "önce builder.sql'i ortak DB'ye
kalıcı yükler" artık yanlış olur → olgusal düzeltme, aşağıda), bu dosya.

## Test plan
- `scripts/test-db.test.mjs` (DB'siz, geçici klasör): ilk `begin;` satırı `begin; \ir builder.psql` olur ve satır sayısı aynı kalır;
  `begin;` ile açılmayan dosya hata verir ve adını söyler; dosya argümanı yalnız o dosyaları kopyalar, `supabase/tests` dışını reddeder;
  `builder.psql` dalın builder'ını ve bildirim susturmayı taşır; kalıcı yükleme kaynağı `origin/main`, çalışma klasörü değil
  (geçici git deposunda main ile dal farklı builder taşır); `--load-only` test koşmaz; artık kalan `.builder-run/` açılışta silinir.
- `coord-hooks.test.mjs`:
  - pano: 40 karakterden uzun ortak öneki olan iki klasördeki iki oturum kendi etiketini görür (bugün kırmızı); `cd` sonrası koşan
    `status` oturumun kendi satırına düşer (bugün kırmızı); oturum kimliği yoksa tam yolla eşleşir.
  - push: HEAD'de ekran kodu varken yalnız docs taşıyan `docs-dal:main` push'u e2e uyarısı vermez (bugün kırmızı); HEAD temizken
    ekran kodu taşıyan `feature:main` uyarır (bugün kırmızı); e2e damgası kaynağın içeriğiyle eşleşir; `HEAD:main` ve refspec'siz
    push bugünkü gibi; "CI başlatır mı" kaynağa bakar (HEAD kod, kaynak yalnız docs → başka oturumun heavy.lock'u sorun değil).
- Gerçek DB: "Done when"deki iki dal ölçümü ve tam test:db karşılaştırması.

## Risk notes
- 🟠 test:db bütün oturumların pgTAP akışı. Çıktıdaki dosya yolu `…/.builder-run/x.test.sql` olur (ad aynı); `not ok` / `ERROR:`
  sayımı değişmez. Eski akışla tam koşu karşılaştırması bunu ölçer.
- 🟠 Builder'ın bir işlem içinde koşamayan bir deyim kazanması (`create index concurrently`, `vacuum`, `commit`) yeni akışı kırar;
  bugün yok, `test-db.test.mjs` builder'ın böyle bir deyim taşımadığını da sınar.
- 🟢 BL-755 ve BL-760 yalnız uyarı/pano metnini değiştirir; main.lock ve heavy.lock kararlarına dokunmaz.
- Geri dönüş: commit'i geri almak (eski `reload-test-builder.mjs` geri gelir).

## Soru (işi durdurmuyor; varsayılan: kapsam dışı, rapora BACKLOG önerisi)
Builder değiştiren dalın yerel e2e'si: C'den sonra e2e ortak DB'deki builder'la (main'inki) koşar. (a) Varsayılan: kural gereği
dalın builder'ı ortak DB'ye yalnız main.lock penceresinde (`--load-worktree` yok); e2e'si yeni builder isteyen dal onu pencerede ya da
CI'da koşar. (b) e2e global-setup her koşuda kendi worktree'sinin builder'ını kalıcı yükler (e2e zaten db.lock altında ve kalıcı veri
yazıyor; test:db artık etkilenmez); bu §6 "dalın değişikliği ortak DB'ye yalnız main.lock penceresinde" kuralına istisna olur.

## Notes / Result
(Rapor biçimi: CLAUDE.md §4.4)
