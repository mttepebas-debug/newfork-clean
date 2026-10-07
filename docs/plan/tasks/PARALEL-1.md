# PARALEL-1 Paralel oturumlar için üç araç açığı: test:db builder'ı, pano etiketi, push kancası
Status: dalda bitti, ONAY @ `82a9f376` (/code-review); gönderim sırada. Görev ONAY (koordinatör, 2026-10-07 ~08:35Z) bir şartla: izlenen pgTAP dosyalarına (`supabase/tests/*.sql`) dokunulmaz.
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

- **Karar:** üç açık dalda kapandı (`task/paralel-1` @ `82a9f376`): test:db dalın test dünyasını artık ortak DB'ye bırakmıyor, pano
  etiketi oturuma bağlı, push kancası gönderilen ref'i okuyor.
- **İzin:** yok (R2; inceleme ONAY, kilitler serbest). Gönderimden önce koordinatöre tek satır haber verildi.
- **Risk:** 🟠 bütün oturumların `pnpm test:db`'si değişiyor; tam koşuda sonuç eskisiyle birebir aynı, süre farkı ölçülemedi (aşağıda).
- **Soru:** yok.
- **Sonraki:** gönderim → main CI; koordinatör ekran oturumlarına yeni test:db davranışını bildirir (dallarını rebase edince geçer).

### Nerede duruyor
Dal `task/paralel-1`, worktree `C:\Users\TheWe\Documents\Codex\newfork-wt\paralel-1`, üç commit: `11e053fb` (görev dosyası),
`7664e8a9` (üç düzeltme), `82a9f376` (inceleme düzeltmeleri).

### Ne yapıldı (etkisi)
| | Neydi | Ne oldu |
|---|---|---|
| BL-897 test:db | `reload-test-builder.mjs` dalın builder'ını ortak DB'ye autocommit yüklüyordu; bir dalın test dünyası öbür oturumların testine giriyordu, hata olursa builder yarım kalıyordu | `scripts/test-db.mjs`: kalıcı yalnız `origin/main`'in builder'ı (tek işlem, `psql -1`); dalın builder'ı her pgTAP dosyasının kendi işleminde (`supabase/tests/.builder-run/` kopyaları, `begin; \ir builder.psql`, satır numaraları aynı). İzlenen test dosyalarına dokunulmuyor (koordinatörün şartı). `reload-test-builder.mjs` silindi; yerine `node scripts/test-db.mjs --load-only` |
| BL-755 pano (+BL-516, BL-788) | Etiket `label/<cwd'nin 40 karakteri>.json`: `…/newfork-clean/.claude/worktrees/…` altındaki bütün oturumlar tek dosyayı paylaşıyordu; `cd` sonrası yazılan etiket hiç görünmüyordu | Etiket `label/<CLAUDE_CODE_SESSION_ID>.json` (`scripts/inbox.mjs:159-166`); kimlik yoksa (terminal) tam yolun özeti. PowerShell aracında da kimlik var (ölçüldü) |
| BL-760 push kancası | e2e uyarısı ve "CI başlatır mı" kararı `origin/main...HEAD`'e bakıyordu; `git push origin task/x:main` yanlış uyarı veriyor ya da gerçeğini kaçırıyordu | `scripts/guard.mjs:177-208` her refspec'in kaynağını okur (`task/x:main` → `task/x`; e2e damgası da kaynağın içeriğiyle eşleşir) |
| Kanca | — | `node [bayraklar] scripts/test-db.mjs` ağır koşu (test:db) sayılır; `--load-only` (yalnız builder yükleme) sayılmaz |

### Ölçümler ve kanıt (2026-10-07, yerel DB, `db.lock` + `heavy.lock` bu oturumda, CI boş)
- **İki dal ölçümü** (BL-897 bitti ölçütü): builder'ına A `tests.paralel1_a()`, B `tests.paralel1_b()` ekleyen iki geçici worktree, ikisinde
  de bunu soran bir pgTAP dosyası, sırayla `node scripts/test-db.mjs <dosya>`:
  - A'nın testi 3/3 (kendi fonksiyonunu görür, B'ninkini görmez); B'nin testi 3/3 (kendisininkini görür, A'nınkini görmez).
  - Ortak DB `tests` şeması (fonksiyon sayısı · tanımların md5'i · deneme fonksiyonu): başta `23 · 8a6424825f28… · 0`; main yüklendikten,
    A'dan ve B'den sonra üçünde de aynı. Kalan kopya 0; izlenen dosya değişikliği 0/0.
  - Ölçüm yönteminin sızıntıyı gerçekten yakaladığı ayrıca doğrulandı: A'nın builder'ı eski usulle (rollback'li işlemde) yüklenince aynı
    sorgu `24 · 3a62d8bee9a2… · 1` gösterdi; rollback'ten sonra yine `23 · 0`.
  - Yan bulgu: ölçüm öncesi ortak DB zaten main'in builder'ını taşıyordu (bugün sızıntı yoktu); etkin ekran dallarının (EKRAN-01/02/03)
    builder'ı main'le aynı. Main'den farklı builder taşıyan 15 worktree var, hepsi 3–11 günlük eski dallar.
  - Yedek: `newfork-wt/paralel-1/artifacts/paralel-1/tests-functions-before.sql` (ölçüm öncesi `tests.*` fonksiyon tanımları, 23 790 bayt).
- **Tam pgTAP, eski akış ve yeni akış** (`artifacts/paralel-1/full-old.log`, `full-new.log`): ikisinde de 172 dosya, 15 448 test, `not ok`
  (TODO hariç) 0, `Looks like you planned` 0, `ERROR:` 4. Hata veren dosyalar aynı: `bl052_document_lifecycle`, `bl052_document_notifications`,
  `document_types_rls` (üçü CI'ın yeşil listesinde, yerel DB'nin kaymasından), `weekly_exchange_changed_terms` (yeşil listede değil). Eski
  akış `origin/main` `560555f4`'te koştu (`d57be38c`'den sonra yalnız belge commit'leri; `supabase/`, `scripts/`, `package.json` aynı).
- **Süre:** tam koşu eski 285 sn, yeni 455 sn, ama makine o sırada yüklüydü (aynı dosya ardışık koşularda 1,2–14 sn oynadı).
  Dönüşümlü ölçüm (ilk 25 dosya, 11 519 test, eski/yeni sırayla iki tur): eski 68 + 76 = 144 sn, yeni 77 + 66 = 143 sn → fark ölçülemedi.
  Builder'ın veritabanı içindeki kendi süresi 32–82 ms (12 ölçüm, ortanca ~56 ms) → 172 dosyada ~10 sn beklenir.
- **Testler:** `node --test scripts/{lock,coord-hooks,decision-log,schema-snapshot,test-db}.test.mjs` → **95/95** (başlangıç 72). Yeni
  testlerin hepsi önce kırmızı görüldü: test-db 13 (modül yokken) + 3 (inceleme sonrası), coord-hooks 6 (pano 3, push 2, runStep 1) + 1.
  Bir pano testi bugünkü kodda yanlış sebeple geçiyordu (geçici klasör yolu da 40 karakterlik öneki paylaşıyordu); öneki paylaşmayan yola çevrildi, kırmızısı görüldü.
- **Tam kapı** (`heavy.lock` ile, CI boş, @ `82a9f376`): lint 5/5, typecheck 7/7, test (betikler 95/95 + paketler 6/6), build 4/4; hepsi
  çıkış 0. Paket görevleri turbo önbelleğinden geldi: bu değişiklik paketlere dokunmuyor.

### İnceleme
`/code-review` (high, `origin/main...task/paralel-1` @ `7664e8a9`): 6 bulgu. 5'i düzeltildi (`82a9f376`): `supabase test db` bayrakları
artık geçiyor (`pnpm test:db --debug` tüm koşuyu reddediyordu); `begin; -- yorum` / `begin transaction;` ile açılan yeni bir dosya
bütün oturumların test:db'sini durduruyordu; `pnpm test:db --load-only` ağır sayılıyor, `node --no-warnings scripts/test-db.mjs` sayılmıyordu;
`--load-only` dosya argümanını sessizce yutuyordu; üç eksik test. 1'i bu dalın işi değil (aşağıda, koordinatöre). **ONAY @ `82a9f376`.**
Not: `/code-review` bu oturumun kendi bağlamında koştu.

### Kapanış hükmü (BACKLOG kaydı koordinatörde)
- BL-897: kapandı (main'e girince) — iki dal ölçümü yukarıda.
- BL-755: kapandı (main'e girince); birleşen BL-516 ve BL-788 de.
- BL-760: kapandı (main'e girince).

### Açık kalan ve nedeni
- Ekranda değişen yok (yalnız araç).
- Koşu sırasında öldürülen bir test:db `.builder-run/`'ı bırakabilir; sonraki koşu açılışta siler. Ctrl+C'de kopyalar silinir.
- Değer alan `supabase test db` bayrağı `--opt=değer` biçiminde verilmeli (`--opt değer`'deki değer dosya sanılır).

### Yolda bulunan (BACKLOG önerisi, koordinatöre)
1. **Kanca tırnak içini komut sanıyor (leave: high / do: moderate).** `scripts/guard.mjs` `chain()` komutu tırnağa bakmadan `&&`, `;`, `|`
   ve satır sonunda böler. `node -e 's=s.replace("a.mjs","b.mjs && turbo test");'` → parça `turbo test"` → ağır koşu "test" sayılır. Bugün
   uyarı ve `audit.log`'da `heavy-warn`; **2026-10-14'ten sonra bu komut reddedilir.** Bu oturumda gerçekten oldu (package.json'u düzenleyen
   `node -e`). `ponytail:` yorumu bu sınırı kabul ediyor, ama engel tarihinden önce tırnağa duyarlı bölme gerekir.
2. **Builder değiştiren dalın yerel e2e'si** (koordinatörün kabul ettiği soru): e2e ortak DB'deki builder'la (artık main'inki) koşar;
   dalın builder değişikliğine bağlı e2e yerelde yalnız main.lock penceresinde ya da CI'da görülür. Seçenek: e2e global-setup kendi
   worktree'sinin builder'ını yükler (kurala istisna).
3. **Eskimiş bilgi:** `.claude/agent-memory/nf-guvenlik/feedback-rollback-trial-safety.md:17` silinen `reload-test-builder.mjs`'i anıyor
   (CLAUDE.md §4.6: eskimiş bilgiyi koordinatör düzeltir).
4. **Eski etiket dosyaları:** `.newfork-inbox/label/` altındaki kesik adlı eski etiketler artık okunmuyor; silinebilir (git dışı, koordinatörün klasörü).
5. **Yerel DB kayması:** yeşil listedeki üç dosya yerelde main'de hata veriyor (yukarıda); CI'da yeşil. Bu işle ilgisiz.

### Bakım
Geçici ölçüm worktree'leri (`paralel-1-a`, `-b`, `-base`) kaldırıldı; uçları `refs/nf-backup/worktree/paralel-1-{a,b,base}/20261007T0852*`.
Konteynerdeki geçici dosyalar (`/tmp/nfp1`, `/tmp/nf-paralel1-builder.psql`) silindi. Kilitler bırakıldı.
