# TREN-ARACI Koordinatörün gönderim treni için araç
Status: onaylı (koordinatör ONAY, üç düzeltmeyle, 2026-10-08 ~09:45Z; düzeltmeler aşağıya işlendi)
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
     - Her dalın göç değişiklikleri o commit'lerden sayılır (birleşme tabanından değil): ilk trenin taşıdığı ama dalın rebase edilmediği göç iki kez sayılmaz.
     - Sıra: göçsüz dallar verildiği sırayla önce, sonra göçlü dallar en küçük göç numarasına göre.
     - Engel (çıkış 1): dal yok; iki dalda (ya da dal ve main'de) aynı göç numarası; göç adı `YYYYMMDDHHMMSS_<ad>.sql` değil; main'deki bir göçü
       değiştiren dal (uygulanmış göç değişmez, supabase/CLAUDE.md); birleştirme commit'i (`git cherry` onu sessizce düşürürdü).
     - Uyarı (çıkışı değiştirmez):
       - göç numarası main'in son göçünden küçük: `sırasız: canlıya bu sırayla mı girdi? kontrol et` (dosya canlı ledger numarasını alır, supabase/CLAUDE.md "Canlı").
       - main'deki bir göçü silen dal: `canlı numarasına yeniden adlandırma mı? kontrol et` (silen göç main'e kendi adıyla girer; yeniden adlandırma meşru).
       - `git merge-tree --write-tree` ile önceden görülen çakışma: dal ↔ main ve dal ↔ dal, dosya adıyla. `supabase/schema.sql` ayrı satırda: "build yeniden üretir".
     - Çıkış: 1 engel; 2 en az bir dal atlanacak; 0 hepsi girer (uyarı olsa da).
   - **`build <dal…>`**:
     - Önce `plan` yapılır, engel varsa durur.
     - Güncel `origin/main`'den `train/<zaman>` kurulur. Tren çalışma klasörü `../newfork-wt/train`: yoksa açılır, kirliyse durulur.
     - Önceki trenlerin ortak DB'ye uygulayıp main'e götürmediği göçler `state.json`'da (`strayInSharedDb`) main'e girene kadar taşınır ve her build'de uyarılır.
     - Dalların main'de olmayan commit'leri sırayla, yazar ve mesajıyla alınır.
     - Yalnız `schema.sql` çatışırsa trenin hâli tutulur; dallar bitince `pnpm.cmd db:schema` bir kez koşar ve ayrı commit'lenir. Tren-1'de elle
       "theirs" alınıp sonda bir kez yeniden üretmek yetti (koordinatörün notu b). Hangi taraf tutulursa tutulsun dosya sonda baştan üretildiği için
       sonuç aynı. Çatışma olmasa da başlıktaki parmak izi göçlere uymuyorsa yine üretilir.
     - Başka çatışmada o dalın commit'lerinin hiçbiri trene girmez, dal atlanır ve raporlanır. Atlama geri sarmayla değil yapılır: dalın commit'leri önce
       `git merge-tree` + `git commit-tree` ile bellekte kurulur, hepsi temizse trene eklenir. `reset --hard`, `stash`, `checkout -- .` yok (CLAUDE.md §2.B.3).
     - Çıkış: 0 hepsi girdi; 2 en az biri atlandı; 1 hata.
   - **`apply-local`**:
     - `db.lock`'u trenin kimliğiyle alır ve tutar (`gate` bitince bırakılır). `main.lock` almaz: kalıcı uygulama yalnız trende, koordinatörce,
       `db.lock` ile (supabase/CLAUDE.md, Mert ~09:20Z); `main.lock` yalnız push anında tutulur (CLAUDE.md §6).
     - Ortak DB ledger'ında main'in her göçü yoksa durur: "ortak DB main'in gerisinde".
     - Trenin yeni göçlerini numara sırasıyla uygular. Her biri ayrı tek işlem: `docker exec -i supabase_db_newfork-clean psql -X -q -1 -v ON_ERROR_STOP=1`,
       göç dosyası + aynı işlemde `supabase_migrations.schema_migrations(version, name, statements)` satırı.
     - Ledger'da aynı numara varsa içerik karşılaştırılır: tek deyimli satırda `md5(statements[1])` dosyanın md5'iyle aynıysa atlanır, farklıysa DUR
       (adını koruyarak düzeltilen göç; uygulanmış göç değişmez). CLI'nin deyim deyim yazdığı satır karşılaştırılamaz: uyarı ve atlanır.
     - İlk hatada durur, kalanlar uygulanmaz; uygulanan liste ve hata ekrana. Uygulanmış göç geri alınmaz, düzeltme yeni göçle.
     - Uygulananlar `audit.log`'a (`train-apply-local`).
     - **Neden psql, `supabase migration up --local` değil** (koordinatörün tren-1 notu a; ikisi de çalışır, 2026-10-08):
       1. Canlıyla aynı biçim. MCP `apply_migration` dosyayı tek sorgu olarak gönderir. CLI ise deyim deyim koşar: üst düzey `LOCK TABLE` düşer, `SET LOCAL`
          yalnız uyarır. Yerelde geçip canlıda farklı davranan göç olmasın.
       2. Ledger satırı canlıdakiyle aynı: `statements` = dosyanın tamamı. `md5(statements[1])` = dosya md5'i kontrolü yerelde de aynı çalışır.
       3. Yalnız trenin dosyaları uygulanır, numara sırasıyla, ilk hatada durarak; ortak DB main'in gerisindeyse hiç başlamaz. `migration up` klasörde
          ledger'da olmayan her dosyayı uygular. Main'in son göçünden küçük numaralı dosyaları (bugün BL-969'un ikisi) `--include-all` olmadan almaz;
          `--include-all` ile de klasörde kalmış başka dosyaları alır.
       Bedeli ~40 satır kod.
   - **`gate [--e2e <spec…>]`**:
     - Kapı test edileni gönderilenle aynı tutar: tren klasörü kirliyse ya da trenin dal ucunda değilse başlamaz (NF_OVERRIDE geçmez); adımlar
       klasörü değiştirirse kapı kırmızı sayılır.
     - Aynı kimlikle `db.lock` (apply-local'dan kalan; yoksa alır) → `heavy.lock` (push'a kadar trende kalır, push CI başlatır).
     - CI koşuyorsa (`gh run list`) başlamaz.
     - `pnpm.cmd install --frozen-lockfile` ve `@newfork/shared`, `@newfork/ui` build; ardından `lint`, `typecheck`, `test`, `build`, `test:db`, verilen e2e'ler.
     - İlk kırmızıda durur; ekranda adım, çıkış kodu, log yolu ve logun son 20 satırı.
     - Bitince `db.lock`'u bırakır. `heavy.lock` yalnız kapı yeşilse push'a kadar kalır; kırmızıda ya da başlamadan durursa o da bırakılır.
   - **`push`**:
     - `main.lock`'u alır. Başka kimliğin `main.lock`'u NF_OVERRIDE ile aşılırsa önce `origin/main` guard'daki gibi `refs/nf-backup/main/<zaman>`'a
       yedeklenir (yedek `audit.log`'da); o kilit silinmez. `origin/main` trenin atası değilse durur ("main ilerledi, yeniden build"; NF_OVERRIDE geçmez).
     - Başka bir CI koşuyorsa durur. `heavy.lock` trenin değilse durur.
     - `git push origin train/<zaman>:main` (yalnız fast-forward, force yok). Sonra `main` ve `heavy` bırakılır; yeni sha ve CI koşusu yazılır.
   - **Kayıt:** guard'ın biçimiyle `<inbox>/audit.log`'a satır başına bir JSON (`at`, `session_id`, `cwd`, `tool: "train"`, `command`, `event`).
     Push `train-push` (önceki/yeni sha). Her kilit ya da CI kontrolü aşımı `train-override`: adımın önüne `NF_OVERRIDE="<gerekçe>"`, guard'daki gibi.
     Aşılmayan engel `train-blocked`.
2. **`scripts/lock.mjs`:** `main.lock` 30 dakikayı geçince `status` ayrı satır basar: `UZUN: main.lock 34 dk, sahibi <kimlik> (<amaç>)`. Mevcut 2 saatlik "stale" aynen kalır.
3. **`scripts/inbox.mjs board`:** aynı UZUN satırını panonun en üstüne basar. Tek yerden gelir: `lock.mjs`'den dışa açılan bir fonksiyon.
4. Testler (`scripts/*.test.mjs` kalıbı, `node --test`):
   - `scripts/train-plan.test.mjs` (plan, build) ve `scripts/train-steps.test.mjs` (apply-local, gate, push), ortak dünya
     `scripts/train-test-world.mjs`. İki dosya, çünkü `node --test` dosyaları yan yana koşar (Windows'ta git yavaş: tek dosya 49 sn, iki dosya 27 sn).
     Geçici çalışma deposu + yerel çıplak `origin` + geçici `NEWFORK_LOCK_DIR` / `NEWFORK_INBOX_DIR`.
   - `docker`/`psql`, `pnpm` ve `gh` çağrıları enjekte edilir; gerçek ortak DB'ye, gerçek kilitlere ve GitHub'a dokunulmaz.
   - `lock.test.mjs` ve `coord-hooks.test.mjs`'e UZUN satırı hücreleri.
   - Kök `package.json` `test` listesine iki dosya.
5. Yeniden kullanım için dışa açma (davranış aynı): `guard.mjs` `audit` ve `backupMain`, `test-db.mjs` `container`.

Out of scope:
- Canlı (hosted) göç: tren canlıya dokunmaz, `apply_migration` koordinatörün ayrı adımı (CLAUDE.md §5.1).
- Guard (`scripts/guard.mjs`) değişikliği. Bugün guard oturumların `git push … main`'ini main.lock'la izin veriyor; OPS-08'den sonra oturumun main
  push'unu reddetmesi ayrı iş (backlog, koordinatör numaralar). `train.mjs`'nin içindeki push guard'dan geçmez (koordinatör kabul etti): aynı
  kuralları (main.lock, heavy, CI) kendisi uygular ve push'u, her aşımı guard'ın biçimiyle `audit.log`'a yazar.
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
  - `apply-local` main.lock almaz, db.lock'u gate'e bırakır; gate bitince db.lock gider, heavy kalır; push main.lock'u alıp bırakır;
  - push ve `NF_OVERRIDE` aşımı audit.log'a guard biçiminde düşer;
  - UZUN satırı (29 dk yok, 31 dk var);
  - nf-guvenlik turu 1'den (2026-10-08): başka kimliğin main.lock'unda push reddi; kırmızı kapıda heavy.lock'un bırakılması; ledger'da aynı
    numara ve başka içerik → DUR; main'deki göçü değiştiren dal → ENGEL, silen → UYARI; geçersiz göç adı; birleştirme commit'i; gönderilmiş
    commit'in göçü iki kez sayılmaz; kirli tren klasöründe kapı başlamaz ve adım klasörü değiştirirse kırmızı; main.lock aşımında yedek;
    önceki trenin ortak DB'ye bıraktığı göç listesi taşınır. Her biri ilgili satır silinerek sınandı (satır silinince test düşüyor).
- `node scripts/train.mjs plan <bugünkü gerçek task dalları>` gerçek depoda salt okur koşar, çıktısı rapora.
- Tam kapı (`lint`, `typecheck`, `test`, `build`) yeşil. `test:db` ve e2e gerekmiyor: `supabase/`, ekran ve API değişmiyor.
- nf-guvenlik ONAY @<sha>.
- Rapor (bu dosyanın sonu) + `TREN-HAZIR task/tren-araci @<sha>`.

Touches: `scripts/train.mjs`, `scripts/train-test-world.mjs`, `scripts/train-plan.test.mjs`, `scripts/train-steps.test.mjs` (yeni);
`scripts/lock.mjs`, `scripts/lock.test.mjs`, `scripts/inbox.mjs`, `scripts/coord-hooks.test.mjs`, `scripts/guard.mjs` ve `scripts/test-db.mjs`
(yalnız `export`), `package.json` (yalnız `test` listesi), bu dosya.

Test plan:
- Kırmızı → yeşil: her alt komut ve yukarıdaki hücreler, geçici depoda.
- `plan`'ı gerçek depoda salt okur koşmak.
- Tam kapı.
- `build`/`apply-local`/`gate`/`push`'un gerçek denemesi yok: ilk gerçek kullanım ikinci tren, koordinatörün elinde.

Risk notes:
- `apply-local` ile `push` arası kırmızı kalırsa (gate düşer, tren bırakılır), ortak DB main'de olmayan göçü taşır. Diğer oturumların `test:db`'si o şemayla koşar.
  Araç bunu engellemez, `state.json`'a ve ekrana "ortak DB'de main'de olmayan göç: …" diye yazar. Düzeltme ileriye: dal düzeltilir, tren yeniden kurulur.
- Push guard'dan geçmediği için kural ikiye bölünür: guard (oturumlar) + train.mjs (tren). İkisi aynı kilit dosyasını okur (`lock.mjs`) ve aynı
  `audit.log`'a yazar. Kural metni tek yerde: CLAUDE.md §6.
- Testler gerçek tren klasörüne dokunmaz: klasör `NEWFORK_TRAIN_DIR` ile geçici dizine yönlenir (varsayılan
  `C:/Users/TheWe/Documents/Codex/newfork-wt/train`, şu an tren-1'de `train/20261008T0916Zb`).
- Windows yolu: tren klasörü `../newfork-wt/train`; uzun yol tuzağı için worktree tekrar açılmaz, yeniden kullanılır.

## Notes / Result
- **Karar:** araç hazır. `scripts/train.mjs` beş adım; ilk gerçek kullanım tren-2 (koordinatör). `nf-guvenlik` ONAY @`a1d24446`.
- **İzin:** koordinatör ONAY (~09:45Z, üç düzeltmeyle) ve DEVAM (~10:25Z). R2, tek inceleme.
- **Risk:** 🟢 canlıya dokunmaz. Push yalnız fast-forward; NF_OVERRIDE ne fast-forward olmayan push'u ne kirli kapıyı aşar. Testler gerçek kilit, inbox,
  tren klasörü, ortak DB ve GitHub'a dokunmaz.
- **Soru:** yok.
- **Sonraki:** tam kapının `test` + `build` adımı heavy'de (bakım ve sıra yüzünden bekliyor), sonra dal push + `TREN-HAZIR`.

### Ne yapıldı
| | Neydi | Ne oldu |
|---|---|---|
| Tren | elle: sıra, cherry-pick, `schema.sql`, göç, kapı, push | `node scripts/train.mjs plan / build / apply-local / gate / push`; her adım ayrı çıkış kodu, log `artifacts/train/<zaman>/` |
| `plan` | — | sıra, engeller (aynı numara, geçersiz ad, main'deki göçü değiştiren dal, birleştirme commit'i), uyarılar (sırasız, silinen göç), build'in kuru koşusu |
| `build` | — | bellekte kurar (merge-tree + commit-tree); başka çatışmalı dal bütün olarak atlanır, geri sarma yok; `schema.sql` sonda bir kez |
| `apply-local` | elle `supabase migration up` | psql -1, göç + ledger satırı tek işlemde; aynı numarada içerik md5'i; `db.lock` kapıya kalır, `main.lock` yok |
| `gate` / `push` | elle | temizlik ve dal ucu kontrolü; kırmızıda kilitler gider; push `main.lock`'u yalnız o an tutar, aşımda `refs/nf-backup/main/` yedeği |
| Kilit uyarısı | 2 saatlik "stale" | + `UZUN: main.lock <n> dk` satırı `lock.mjs status` ve panoda (30 dk üstü) |

### Kanıt (2026-10-08)
- Betik testleri: 141/141 yeşil, 44 sn. Yedi dosya birlikte; trenin iki dosyası 35/35, ~32 sn. Bu testler trenden önce 13 sn sürüyordu.
- Testler önce kırmızı görüldü. Ayrıca her kilit, içerik ve engel satırı silinerek sınandı: ilk 4, inceleme düzeltmelerinde 5 deneme; hepsinde test düştü.
- `node scripts/train.mjs plan` gerçek depoda, beş gerçek dalla: 13 sn; ref'ler değişmedi, `../train` dokunulmadı. BL-969'un iki göçünü "sırasız" diye işaretledi.
- Lint (0 hata) ve typecheck yeşil (`0a5de382`'den önce; sonrası yalnız betik değişti).
- `nf-guvenlik`:
  - tur 1 @`0a5de382`: DÜZELT (3 orta, 7 düşük), hepsi düzeltildi `a1d24446`;
  - tur 2: ONAY @`a1d24446`;
  - kalan iki düşük not (dal ucu hücresi; yeniden adlandırılıp gönderilen göçün uyarı listesinden düşmesi) `deb20074`'te kapandı.

### Açık kalan
- Guard'ın oturumun main push'unu reddetmesi (OPS-08 sonrası): backlog, koordinatör numaralar.
- heavy.lock için de UZUN uyarısı (inceleme önerisi): yeşil kapıdan sonra push'u yapılmamış tren heavy'yi tutar. Kapsam dışı, backlog adayı.
- Yerelde betik testleri ~31 sn uzadı (Windows'ta git süreç başlatma yavaş; CI'da Linux daha hızlı).
