# TREN-ARACI Koordinatörün gönderim treni için araç
Status: draft (koordinatör onayı bekliyor)
Session: oturum/tren-araci   Branch: task/tren-araci   Worktree: ../newfork-wt/tren-araci   DB: ortak yerel (yalnız testlerde değil, `apply-local`'de)
Risk: R2 (paylaşılan araç: main'e gönderim, ortak yerel DB, kilitler; canlıya dokunmaz)
Reviewer: nf-guvenlik (tek bağımsız inceleme)
Skills: kod → `superpowers:test-driven-development` (her alt komut önce kırmızı test); bitti demeden → `superpowers:verification-before-completion`
Ports: 5630/5631 (yalnız gerekirse elle deneme; trenin e2e'si `db.lock` sahibi olarak 5565/5566'da koşar, `e2e/playwright.config.ts`)

Goal:
Main'e yalnız koordinatörün treni gider (KARARLAR OPS-08). Bugün tren elle kuruluyor: dalları sıraya koymak, commit'leri almak, `schema.sql`'i
yeniden üretmek, göçleri ortak DB'ye uygulamak, tam kapı, push. `scripts/train.mjs` bunu adım adım, her adımı ayrı komut ve ayrı çıkış koduyla
yapar. Uzun çıktı dosyaya, ekrana yalnız özet. İlk tren elle kuruluyor; aracın ilk kullanımı ikinci tren.

In scope:
1. `scripts/train.mjs` (beş alt komut). Tren durumu `artifacts/train/state.json`'da (gitignore'da), loglar `artifacts/train/<zaman>/<adım>.log`.
   Kilit kimliği `koordinator/tren-<zaman>`.
   - **`plan <dal…>`** (salt okur, hiçbir şeye dokunmaz):
     - Her dalın main'de olmayan commit'leri `git cherry origin/main <dal>` ile bulunur (rebase'li dal da doğru sayılır). Hiç yoksa "zaten main'de".
     - Her dalın yeni göçleri `supabase/migrations/` altında main'de olmayan dosyalardır.
     - Sıra: göçsüz dallar verildiği sırayla önce, sonra göçlü dallar en küçük göç numarasına göre.
     - Engel (çıkış 1): dal yok; iki dalda aynı göç numarası.
     - Uyarı (çıkış 0):
       - göç numarası main'in son göçünden küçük. KK-220'ye göre yeniden numaralanır; canlıya `apply_migration` ile girdiyse KK-226'ya göre canlı ledger numarasında kalır, araç ikisini ayıramaz, adıyla yazar.
       - `git merge-tree --write-tree` ile önceden görülen çakışma: dal ↔ main ve dal ↔ dal, dosya adıyla. `supabase/schema.sql` ayrı satırda: "build yeniden üretir".
   - **`build <dal…>`**:
     - Önce `plan` yapılır, engel varsa durur.
     - Güncel `origin/main`'den `train/<zaman>` kurulur. Tren çalışma klasörü `../newfork-wt/train`: yoksa açılır, kirliyse durulur.
     - Dalların main'de olmayan commit'leri sırayla, yazar ve mesajıyla alınır.
     - Yalnız `schema.sql` çatışırsa trenin hâli tutulur; dallar bitince `pnpm.cmd db:schema` bir kez koşar ve ayrı commit'lenir.
     - Başka çatışmada o dalın commit'lerinin hiçbiri trene girmez, dal atlanır ve raporlanır. Atlama geri sarmayla değil yapılır: dalın commit'leri önce
       `git merge-tree` + `git commit-tree` ile bellekte kurulur, hepsi temizse trene eklenir. `reset --hard`, `stash`, `checkout -- .` yok (CLAUDE.md §2.B.3).
     - Çıkış: 0 hepsi girdi; 2 en az biri atlandı; 1 hata.
   - **`apply-local`**:
     - `main.lock`'u alır ve trende tutar. Gerekçe: supabase/CLAUDE.md'ye göre kalıcı uygulama yalnız main.lock penceresinde olur; pencere `push`'a kadar açık kalır.
       Main'e artık yalnız tren gittiği için başka kimseyi bekletmez.
     - Sonra `db.lock` alır.
     - Ortak DB ledger'ında main'in her göçü yoksa durur: "ortak DB main'in gerisinde".
     - Trenin yeni göçlerini numara sırasıyla uygular. Her biri ayrı tek işlem: `docker exec -i supabase_db_newfork-clean psql -X -q -1 -v ON_ERROR_STOP=1`,
       göç dosyası + aynı işlemde `supabase_migrations.schema_migrations(version, name, statements)` satırı. Ledger'da zaten olan sürüm atlanır.
     - İlk hatada durur, kalanlar uygulanmaz; uygulanan liste ve hata ekrana. Uygulanmış göç geri alınmaz, düzeltme yeni göçle.
     - `db.lock`'u bırakır.
   - **`gate [--e2e <spec…>]`**:
     - Sırayla `db.lock` → `heavy.lock` (`heavy` push'a kadar trende kalır, push CI başlatır).
     - CI koşuyorsa (`gh run list`) başlamaz.
     - `pnpm.cmd install --frozen-lockfile` ve `@newfork/shared`, `@newfork/ui` build; ardından `lint`, `typecheck`, `test`, `build`, `test:db`, verilen e2e'ler.
     - İlk kırmızıda durur; ekranda adım, çıkış kodu, log yolu ve logun son 20 satırı.
     - `db.lock`'u bırakır.
   - **`push`**:
     - Kendi `main.lock`'u yoksa alır. `origin/main` trenin atası değilse durur ("main ilerledi, yeniden build").
     - Başka bir CI koşuyorsa durur. `heavy.lock` başka kimlikteyse durur.
     - `git push origin train/<zaman>:main` (yalnız fast-forward, force yok). Sonra `main` ve `heavy` bırakılır; yeni sha ve CI koşusu yazılır.
2. **`scripts/lock.mjs`:** `main.lock` 30 dakikayı geçince `status` ayrı satır basar: `UZUN: main.lock 34 dk, sahibi <kimlik> (<amaç>)`. Mevcut 2 saatlik "stale" aynen kalır.
3. **`scripts/inbox.mjs board`:** aynı UZUN satırını panonun en üstüne basar. Tek yerden gelir: `lock.mjs`'den dışa açılan bir fonksiyon.
4. Testler (`scripts/*.test.mjs` kalıbı, `node --test`):
   - `scripts/train.test.mjs` geçici bir git deposunda koşar: geçici çalışma deposu + yerel çıplak `origin` + geçici `NEWFORK_LOCK_DIR`.
   - `docker`/`psql`, `pnpm` ve `gh` çağrıları enjekte edilir; gerçek ortak DB'ye, gerçek kilitlere ve GitHub'a dokunulmaz.
   - `lock.test.mjs` ve `coord-hooks.test.mjs`'e UZUN satırı hücreleri.
   - Kök `package.json` `test` listesine `scripts/train.test.mjs`.

Out of scope:
- Canlı (hosted) göç: tren canlıya dokunmaz, `apply_migration` koordinatörün ayrı adımı (CLAUDE.md §5.1).
- Guard (`scripts/guard.mjs`) değişikliği. Bugün guard oturumların `git push … main`'ini main.lock'la izin veriyor; OPS-08'den sonra oturumun main
  push'unu reddetmesi ayrı iş (backlog adayı). `train.mjs`'nin içindeki push guard'dan geçmez, aynı kuralları (main.lock, heavy, CI) kendisi uygular.
- Göçü otomatik yeniden numaralamak (plan yalnız uyarır).
- CI dosyaları, CLAUDE.md §6 metni (kural koordinatör ve Mert'in; araç gelince kullanım satırını koordinatör ekler).

Done when:
- Beş alt komutun her biri için önce kırmızı görülmüş test yeşil. Ayrıca şunların hücresi var:
  - aynı göç numarası engeli;
  - schema-only çatışmanın yeniden üretilmesi;
  - başka çatışmada dalın tamamen atlanması ve trenin önceki dallarının korunması;
  - ledger'da olan göçün atlanması;
  - ilk hatada durma;
  - fast-forward olmayan push'un reddi;
  - başka kimlikteki heavy'de push reddi;
  - UZUN satırı (29 dk yok, 31 dk var).
- `node scripts/train.mjs plan <bugünkü gerçek task dalları>` gerçek depoda salt okur koşar, çıktısı rapora.
- Tam kapı (`lint`, `typecheck`, `test`, `build`) yeşil. `test:db` ve e2e gerekmiyor: `supabase/`, ekran ve API değişmiyor.
- nf-guvenlik ONAY @<sha>.
- Rapor (bu dosyanın sonu) + `TREN-HAZIR task/tren-araci @<sha>`.

Touches: `scripts/train.mjs` (yeni), `scripts/train.test.mjs` (yeni), `scripts/lock.mjs`, `scripts/lock.test.mjs`, `scripts/inbox.mjs`,
`scripts/coord-hooks.test.mjs`, `package.json` (yalnız `test` listesi), bu dosya.

Test plan:
- Kırmızı → yeşil: her alt komut ve yukarıdaki hücreler, geçici depoda.
- `plan`'ı gerçek depoda salt okur koşmak.
- Tam kapı.
- `build`/`apply-local`/`gate`/`push`'un gerçek denemesi yok: ilk gerçek kullanım ikinci tren, koordinatörün elinde.

Risk notes:
- `apply-local` ile `push` arası kırmızı kalırsa (gate düşer, tren bırakılır), ortak DB main'de olmayan göçü taşır. Diğer oturumların `test:db`'si o şemayla koşar.
  Araç bunu engellemez, `state.json`'a ve ekrana "ortak DB'de main'de olmayan göç: …" diye yazar. Düzeltme ileriye: dal düzeltilir, tren yeniden kurulur.
- Push guard'dan geçmediği için kural ikiye bölünür: guard (oturumlar) + train.mjs (tren). İkisi aynı kilit dosyasını okur (`lock.mjs`). Kural metni tek yerde: CLAUDE.md §6.
- Windows yolu: tren klasörü `../newfork-wt/train`; uzun yol tuzağı için worktree tekrar açılmaz, yeniden kullanılır.

## Notes / Result
(Rapor biçimi: CLAUDE.md §4.4)
