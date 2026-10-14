# Yerel durum raporu — hesap devri (2026-10-14, Kaliforniya 09:55)

Yazan: tren/test/kayıt Remote Control thread'i (Mert'in Windows bilgisayarı).
Salt okunur rapor: bu raporu hazırlarken hiçbir şey değiştirilmedi (commit, push, silme ya da tren yok).

## 1. Main
- Yerel main (`C:\Users\TheWe\Documents\Codex\newfork-clean`): **9b871a97** "fix(schedule): a card that starts saying NEW grows its row (EKRAN-01)".
- origin/main ile fark: **0 / 0** (birebir aynı). Çalışma ağacı temiz.
- Bugün trenle inenlerin sonuncusu: 80c772bf..9b871a97, CI run 38564289664 yeşil.
- `git stash` listesinde 2 eski kayıt var (`task/ekran-01-db-2-api` dalından, "db2-src-red" ve "db2api-wip"; 7 Ekim öncesi). Bunlar yalnız bu diskte duruyor.

## 2. coord/kayit2 (kayıt dalı)
- Worktree: `C:\Users\TheWe\Documents\Codex\newfork-wt\coord`, uç **39955a3f**, temiz.
- Uzakta olmayan commit: **0**. Son iki kayıt (313e9dd4, 39955a3f) 80c772bf treniyle main'e girdi.
- Bekleyen kayıt yok.

## 3. Push'lanmamış yerel iş

Bu commit'ler GitHub'da yok, yalnız bu diskteki git deposunda duruyor. Yeni hesap aynı diski kullanacağı için kaybolmaz, ama GitHub'da yedeği yok.

| Dal | Main'de olmayan commit | Son tarih | Ne |
|---|---|---|---|
| backup/ekran-01-40001-* (5 dal) | 6–8 | 2026-10-07 | Schedule acil işinin rebase öncesi yedekleri; işin son hâli main'de |
| bl210 | 4 | 2026-09-27 | eski BL-210 kırmızı test denemesi ve geri alınması |
| coord/kayit | 1 | 2026-10-10 | emekli eski kayıt dalı (yerini coord/kayit2 aldı) |
| keep/fb62-8-save-pattern | 2 | 2026-09-30 | nf-backend hafıza notları |
| no-access-variants | 1 | 2026-09-26 | eski erişim yok varyantları (yerini bugünkü standart aldı) |
| task/bl-987 | 3 | 2026-10-08 | BL-987 sonuç belgeleri |
| task/bl-990-w2 | 1 + **24 commit'lenmemiş dosya** | 2026-10-08 | e2e "test açtığı bağlamı kapatır" kırmızı test, yarım (worktree `.claude/worktrees/agent-a2539fabf0e3a2190`) |
| task/ekran-01-38 | 4 | 2026-10-08 | uzak dalı silindi; yedek etiketi `backup/2026-10-14/task-ekran-01-38` |
| task/ekran-01-templates | 2 | 2026-10-08 | şablon ad alanı testleri |
| task/otomasyon-4 | 7 | 2026-10-08 | devir.mjs otomasyon planı |
| task/tel | 3 | 2026-10-10 | telefon kuralları schema.sql (iş main'de, bu ara dal) |

Uzakta olmayan ama içeriği main'de olan (patch eşdeğeri, kayıp yok): task/bl-990-guard, task/bl-990-guard-geri, task/bl-995, task/bl-995-tren, task/claude-md-adim5, task/claude-md-dersler, task/dal-silme-izni, task/ekran-02-inceleme-tren, task/ekran-02-kurtarma, task/ekran-02-requests-tren, task/kayit2, task/oto-backlog-tren(-2/-3/-4), task/tel-tren, task/wave1-tren, train/20261011T2021Z, scratch/emp-test.

**Önerim (yapılmadı):** listedeki 11 grubu GitHub'a yedek adıyla göndermek. Bu hiçbir dalı değiştirmez, yalnız yeni uzak ref ekler:
`git push origin <dal>:refs/heads/yedek/2026-10-14/<dal>`
task/bl-990-w2'nin 24 dosyası commit'lenmemiş. O worktree'de önce bir yedek commit (`wip:`), sonra aynı biçimde push. İkisi de Mert'in ya da koordinatörün "evet"iyle yapılır.

## 4. Commit'lenmemiş değişiklikler (worktree worktree)
- **Hafıza notları** (`.claude/agent-memory/<ajan>/…`, commit'lenmemiş): admiring-volhard (nf-gorsel-qa), agent-a3704c99 ve agent-ae216987 (nf-test), agent-a8993d35 (nf-planlama), agent-a9c2fed8 ve agent-aedfefc1 (nf-db), busy-kowalevski (nf-gorsel-qa), friendly-blackwell (nf-guvenlik, 3 yeni not), gallant-feistel (nf-guvenlik), handoff-koordinatorlugu (nf-gorsel-qa ve nf-guvenlik). Bunlar alt ajanların öğrendikleri. Yalnız bu diskte duruyorlar, kaybolmamalılar. Main'deki `.claude/agent-memory/`'ye tek bir kayıt işiyle taşınmaları önerilir.
- **agent-a2539fabf0e3a2190** (task/bl-990-w2): 24 e2e dosyası değişmiş, yarım iş (bkz. 3).
- **sad-saha-6bb2d0** ve **zen-kare-9dd93a**: `tsconfig.base.json`, `turbo.json`, `vercel.json` değişmiş. Büyük ihtimalle yerel deneme; kayıp sayılmaz, ama silinmeden önce bakılmalı.
- **bl-435**: yalnız bir e2e log dosyası (`artifacts-bl435-e2e.log`).
- Diğer bütün worktree'ler temiz.

## 5. Worktree'ler
- Toplam **78** kayıtlı worktree: ana klasör, 31'i `newfork-clean\.claude\worktrees\` altında, 45'i `C:\Users\TheWe\Documents\Codex\newfork-wt\` altında, 1'i Temp'te (`c2r-wt`, detached, temiz).
- **keen-brahmagupta-8c4853** (Jobs devir thread'i): dal `claude/keen-brahmagupta-8c4853`, uç 5b0dbca1, **temiz**, main dışında commit **0**. Kaybolacak bir şey yok. Jobs işi bulut dalında (claude/project-thread-8tmjta) yürüdü ve hepsi main'de.
- Tren klasörü `newfork-wt\train`: 9b871a97, temiz.
- Benim çalışma worktree'm `newfork-wt\drawer-times`: task/new-mark-fix@9acf345c, temiz, içeriği main'de.
- `.claude\worktrees\` altında git'e kayıtlı olmayan 22 eski klasör de var (53 klasör, 31'i kayıtlı). Kayıt dışı olanlar eski alt ajan artıkları. Silmek ayrı bir temizlik işidir; bu raporda dokunulmadı.

## 6. Yalnız bu bilgisayarda duran, kaybolmaması gerekenler
- `newfork-clean\artifacts\` (765 MB, gitignore'da): işlerin kanıtları, ekran görüntüleri, raporlar (`nf-backend/`, `koordinator/`, `backups/` vb.).
- `newfork-wt\coord\artifacts\`: **canlı veritabanı yedekleri** (`canli-<migration>/`: yedek-oncesi, migration.sql), bugünkü Jobs dahil 21 migration. Ayrıca `bl-*-canli/` ve `archive-*`.
- `C:\Users\TheWe\Documents\Codex\newfork-pages\`: yayınlanan Artifact sayfalarının kaynakları (16 öğe, git deposu değil) ve README'deki iki hesabın bağlantıları.
- `newfork-clean\.claude\settings.local.json`, `.claude\launch.json`, `.vercel\`, `.planning\`, `supabase\local-fixture\` (5.8 MB), `supabase\verification\`, `e2e\.world.json`.
- Claude hafızası: `C:\Users\TheWe\.claude\projects\C--Users-TheWe-Documents-Codex-newfork-clean\memory\` (34 dosya). Bu klasör Windows kullanıcısına ait. Aynı Windows kullanıcısıyla açılan yeni Claude hesabı da onu görür.
- Benim geçici betiğim `branch-pgtap.mjs` (dal migration'ını transaction içinde pgTAP ile koşturur) bu oturumun Temp scratchpad'inde duruyor ve oturumla gider. Gerekirse `scripts/`'e alınması ayrı bir iştir.
- `.env.local` ana klasörde yok (yalnız `.env.example` var). Gizli değerler başka yerde. Değerleri bu raporda okunmadı ve yazılmadı. `artifacts/note-mark-r3/.session.json` açılmadı.

## 7. Açık kalan şeyler
- db kilidi: **boş** (`node scripts/lock.mjs status`).
- Koşan tren yok.
- Docker: yerel Supabase'in 9 konteyneri (`supabase_*_newfork-clean`) 2 saattir açık ve sağlıklı. Yeni hesap da aynısını kullanır, kapatmaya gerek yok.
- CI runner: `newfork-local-pc` **online**, boşta. `newfork-local-pc-2` ve `-3` offline (bilinen, tek runner).
- 5555/5556 (Mert'in dev sunucusu) ve e2e portları dinlemede değil. Açık dev sunucusu yok.

## 8. Yeni hesapta tren thread'ini Remote Control ile yeniden kurmak
1. Yeni hesapta Claude masaüstü uygulamasında Code sekmesi → klasör `C:\Users\TheWe\Documents\Codex\newfork-clean` → Remote Control açık. Worktree seçeneği **kapalı**: tren thread'i ana klasörden çalışır, işi kendi worktree'lerinde yapar.
2. Bu thread'in kuralları `CLAUDE.md`'de yazılı (§3.B, §5 Tren, §5 Canlı veritabanı). Hafıza aynı klasörde (bkz. 6).
3. Araçlar ve kimlikler:
   - `gh` CLI bu Windows kullanıcısında oturum açık (runner sorgusu çalıştı).
   - Git kimliği `mttepebas-debug`.
   - **Supabase MCP** (canlı migration için `apply_migration`) Claude hesabına bağlı bir connector. Yeni hesapta yeniden bağlanması gerekir. Bağlanmazsa canlı migration yapılamaz.
   - Bu oturumda `plugin:supabase` ikinci connector'ı da yetki bekliyordu, o da yeni hesapta bağlanmalı.
   - Vercel MCP başka hesabı görüyor (hafıza notu).
4. Tren komutları: `node scripts/main-watch.mjs --since <son main sha>` → `node scripts/train.mjs run <dal@sha>`. Arka planda koşar, log `newfork-wt\train-<ad>.log`. Durum dosyası `newfork-wt\train\artifacts\train\state.json`.
5. Dal hazırlama alışkanlığı: bulut thread'lerinin dalındaki commit'ler yalnız sayılanlar cherry-pick edilerek `newfork-wt\drawer-times` worktree'sinde güncel origin/main üstüne alınır, sonra `task/<ad>` olarak push edilir.
   - Birleştirme commit'i trene alınmaz.
   - Bekleyen auth dosyaları (ProtectedRoute, WorkspaceHubPage, WorkspaceStatusPage) diff'te varsa tren kalkmaz.
   - Yerel e2e: `cd e2e` → `node ../scripts/lock.mjs run db --e2e -- "npx playwright test flows/<spec>"`. Önce `pnpm.cmd --filter @newfork/ui --filter @newfork/shared build` ve `apps/web/node_modules/.vite` silinir.
6. Canlı migration sırası:
   - Yedek: `newfork-wt\coord\artifacts\canli-<migration>\`.
   - Riskli migration için Mert'in bu thread'de kendi yazdığı "evet".
   - `apply_migration`, sonra md5(statements[1]) = dosya md5 kontrolü.
   - Ledger sürümü dosya adına eşlenir (`update supabase_migrations.schema_migrations set version='<dosya öneki>' where name='<ad>' and version='<uygulama sürümü>'`; uygulama sürümü dosya önekinden küçük de olabilir).
   - Sonra get_advisors, push ve apply-local.
7. Her inen tren için main sha koordinatöre (`send_message` → `@parent`) bildirilir. Mert'in klasörü yalnız temizse `git merge --ff-only origin/main` ile ilerletilir.

## 9. Bugün trenle inenler (özet)
5d7b6f09 Schedule yükleniyor/hata · ae458808 Jobs (canlı migration 20261014060000 dahil) · ff275b71 telefonda 16 px · bfba6796 / e0ffc3fc listelerde sabit üst kısım · e0c18aae taslak uyarısı ve Jobs yorumları 1 · 373c9c39 Jobs yorumları 2 · 5950292c arama kutusu · 28aeb82b erişim yok standardı · be055596 kart ortalama · 80c772bf vardiya kartı yeni görünüm (turuncu nokta 70f3004a hâlâ bekliyor) · 9b871a97 NEW işareti düzeltmesi.
