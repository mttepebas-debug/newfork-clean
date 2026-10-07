# OTOMASYON-3 Ağır koşu kilidi, kayıt koruması, karar kancası, gece ve denetim skill'leri
Status: approved (koordinatör ONAY 2026-10-07 ~06:40Z, iki düzeltmeyle; aşağıda "Onay düzeltmeleri")
Session: nf-backend/otomasyon-3 (`local_2f278959…`, posta `4c8021a8…`)   Branch: task/otomasyon-3   Worktree: ../newfork-wt/otomasyon-3   DB: -
Risk: R2 (guard bütün oturumların Bash/PowerShell/Edit/Write çağrısında koşar; yetki, veri, canlı yok)
Reviewer: tek bağımsız inceleme: `/code-review` (öneri; betik + test işi, nf-guvenlik'in tenant/RLS uzmanlığı burada boşa gider)
Skills: kod → `superpowers:test-driven-development` (önce kırmızı test) · bitti demeden → `superpowers:verification-before-completion` · inceleme bulgusu → `superpowers:receiving-code-review`

Goal: CLAUDE.md §4.9'daki iki geçiş satırını gereksiz kılan dört otomasyonu kodla kurmak; §4.9'u silmek.
Kaynak: CLAUDEMD-REWRITE planı "Faz 3" (Mert onaylı, 2026-10-06/07), KK-185 (5).

## In scope

### 1. Ağır koşu kilidi (`scripts/lock.mjs` + `scripts/guard.mjs`)
- `lock.mjs`: yeni kilit `heavy` (`heavy.lock`, aynı klasör, aynı take/release/status, aynı 2 saat bayatlık). Kilit girdisi
  ayrıca `session` (`CLAUDE_CODE_SESSION_ID`; Bash ortamında var ve hook girdisindeki `session_id` ile aynı, ölçüldü) ve `cwd`
  taşır: guard "kilit bende mi, başkasında mı"yı bununla ayırır. Oturum kimliği yoksa (elle terminal) `cwd` ile.
- Ağır koşu sayılanlar (guard komutu parçalara ayırıp her parçaya bakar):
  - kökten `pnpm[.cmd] [run] test|build`, `turbo [run] test|build`; tek başına `lint` ve `typecheck` sayılmaz, ikiden fazla kapı
    adımını (`lint`/`typecheck`/`test`/`build`) zincirleyen komut sayılır (onay düzeltmesi a). `--filter`/`-F`/`-C` varsa odaklı
    koşu, sayılmaz; `pnpm --filter … exec vitest run <dosya>` sayılmaz;
  - `pnpm test:db`, `supabase test db`; `pnpm e2e`, `playwright test`;
  - CI başlatan push: `main` ya da `task/**` dalına, yalnız `docs/**` / `*.md` değişmemişse (`ci.yml` `paths-ignore`).
- Kontrol:
  - Yerel ağır koşu → `heavy.lock` bu oturumda olmalı (ya da aynı komutta `&&` ile önce alınmış, BL-500 kalıbı) **ve** CI koşmuyor
    olmalı (`gh run list --limit 5 --json status`, 10 sn sınır; `gh` cevap vermezse "bilinmiyor" diye loglanır, engel yok).
  - CI başlatan push → `heavy.lock` başka oturumdaysa sorun (biri yerelde e2e/kapı koşarken CI'ı da başlatmak). CI'ın zaten
    koşması push'u durdurmaz: tek runner'da yeni koşu sıraya girer, aynı anda koşmaz.
- Kademe (ILKELER P16): **2026-10-14 00:00 (TR) öncesi yalnız uyarı** (model + ekranda tek satır, `audit.log`), sonrası **engel**
  (exit 2, sebep ve çözüm komutuyla). Tarih guard'da tek sabit = gönderim günü + 7 gün; gönderim kayarsa güncellenir.
  Kaçış: parçanın başına `NF_OVERRIDE="<gerekçe>"` (PowerShell: hemen önceki parçada `$env:NF_OVERRIDE='…'`), push'takiyle aynı
  kural; `heavy-override` olarak loglanır. Geri dönüş planı: tarih sabitini ileri almak (tek satır) ya da commit'i geri almak.
- `audit.log` olayları: `heavy-ok`, `heavy-warn`, `heavy-block`, `heavy-override`, `heavy-ci-unknown` (haftalık denetim bunlardan
  ağır koşu sayısını ve kaçışları sayar).

### 2. Kayıt dosyası koruması (`scripts/guard.mjs`, Edit/Write)
- Dosyalar: `docs/plan/{BACKLOG,KARARLAR,KOORDINATOR-KARARLARI,DONE,DERSLER,SABAH-SORULAR,HANDOFF,EKRAN-PLANI}.md` (hangi
  worktree'de olursa olsun).
- İzinli: (a) koordinatör = `coordinator.json`'daki `session_id` (`inbox.mjs claim`); (b) Mert'in açtığı oturum.
- **Mert'in oturumunu ayırma önerisi:** tersinden tanımlanır. Rol oturumu = ilk gerçek kullanıcı mesajı (oturum kaydında,
  `<system-reminder>` blokları atılınca) `Rol:` satırıyla başlayan oturum; bu zaten §4.1 kuralı ("Rol oturumu 'Rol: <rol>
  (<uzmanlık>)' başlığıyla … başlar"). Koordinatör olmayan rol oturumu → uyarı/engel; geri kalan her oturum Mert'in sayılır.
  Hook girdisindeki `transcript_path`'in yalnız başı okunur (ölçüldü: bu oturumda 5. satır). Kayıt okunamazsa izin verilir ve
  `records-unknown` loglanır (biçim kuralı, erişim kuralı değil). Alt ajan ana oturumun hükmünü alır.
  - Neden bu: yeni tören yok (oturum kendini kaydettirmez), bugünkü kurala dayanır. Zayıf yanı: `Rol:` ile başlamayan rol
    oturumu kaçar (uyarı çıkmaz); yanlış engel üretmez.
- Ek katman (ucuz, öneri): rol oturumunda `git commit`, staged ya da adıyla verilen kayıt dosyası içeriyorsa aynı uyarı. Edit/Write
  dışındaki yazmaları (python, `sed -i`, `Set-Content`) main'e girmeden yakalar. İstemezsen çizerim.
- Kademe: kilitle aynı tarih (önce uyarı, 2026-10-14'ten sonra engel). Kaçış: `node scripts/guard.mjs records-allow "<gerekçe>"`
  → o oturum için izin dosyası (`.newfork-inbox/records-allow/<oturum>.json`) + `audit.log` satırı. Mert bir rol oturumuna
  doğrudan "kayda yaz" derse bu yol.

### 3. Karar kaydı kancası
- `.claude/settings.json`: `PreToolUse` ve `PostToolUse` için `matcher: "AskUserQuestion"` →
  `node "$CLAUDE_PROJECT_DIR/scripts/decision-log.mjs" hook pre|post` (KARAR-001'de yazılan metin).
- `decision-log.mjs` mesaj ve başlık yorumundaki "CLAUDE.md §13" → "CLAUDE.md §3.6 / §4.7".
- Aynı dosyalara dokunduğum için eski bölüm numaraları da düzelir (olgusal): `guard.mjs` "§6, §7", `lock.mjs` "§7",
  `inbox.mjs` "§3, §12" → bugünkü §4.1 / §6.

### 4. Skill'ler
- `.claude/skills/gece-modu/SKILL.md`: §4.5 + §4.2 gözetim. Başlarken `request_keep_awake` (`session_idle`), arka planda
  `inbox.mjs wait` (rapor gelince uyandırır; "2 dk'da bir" bunu karşılar), `CronCreate` ile ~10 dk'lık tur (rapor gelmese de
  uyanma; 7 gün sınırı), her turda `inbox.mjs board` → 20 dk sessiz "working" oturuma `list_events`, ağır koşu sırası
  (`lock.mjs status`, `gh run list`), Mert'e soru → `SABAH-SORULAR.md`. Sabah: Mert'in ilk mesajıyla biter; önce sabah raporu
  (ne bitti, ne canlıda, nerede takıldı ve ne kadar ilerledi), sonra §3.7 soru turu; cron silinir.
- `.claude/skills/haftalik-denetim/SKILL.md` (`nf-planlama`): §4.6 listesi (çelişki, eskimiş bilgi, yalnız hafızada kalmış kural,
  §2.C ↔ `ILKELER.md`), dört sayı ve her birinin komutu: kabul oranı (`decision-log.mjs stats`), haftalık Mert düzeltmesi
  (`decisions.jsonl` `picked_other` + `free_text` + KARARLAR/KK "ters çevrildi"), oturum başı sabit yük (yeni oturumda
  `get_usage`), gönderimden CI yeşiline süre (`gh run list --branch main --json …`). Aylık: rol hafızaları dahil. Çıktı
  `docs/plan/research/denetim-<tarih>.md`, haber posta kutusuna; düzeltmeyi koordinatör yapar.

### 5. Kural dosyalarında olgusal düzeltme (diff'te gösterilir)
- `CLAUDE.md` §4.9 (iki geçiş satırı ve başlığı) silinir; §6 "Gönderim adımları" 1'deki "(§4.2, §4.9)" → "(§4.2)".
- `CLAUDE.md` §6 kilit listesine `heavy.lock` satırı (ne zaman alınır, uyarı → engel tarihi, kaçış). Bu satır olmazsa oturumlar
  kilidi nasıl alacağını bilmez; kural değil, var olan kuralın (§4.2 "ağır koşu kilidiyle zorlanır") aracı.
- Rol dosyalarındaki "(`CLAUDE.md` §4.2, §4.9)" (nf-arayuz, nf-backend, nf-db, nf-planlama, nf-test) ve `ILKELER.md` P15'teki
  "(ağır koşu kilidi gelene kadar her gönderim izinle, §4.9)" parantezi: §4.9 kalkınca eskiyen atıf.

### Onay düzeltmeleri (koordinatör, 2026-10-07 ~06:40Z)
- a) Tek başına kök `lint` ağır koşu değil (saniyelik). Tek başına `typecheck`: kökten bir kez ölçülür, ~60 sn altıysa sayılmaz.
  Ölçüm 2026-10-07 ~06:47Z, yeni worktree, CI boşken: `pnpm.cmd typecheck --force` 24 sn (turbo 22.5 sn, 7/7 görev, önbellek 0)
  → sayılmaz.
- b) Test vakası: `db.lock` alınmış ama `heavy.lock` alınmamış e2e → uyarı; e2e/test:db metni iki kilidi birden söyler
  ("önce db, sonra heavy").
- Rapora bir satır: `Rol:` satırıyla başlamayan rol oturumu kayıt korumasından kaçar.

## Out of scope
CI iş akışı, yeni bağımlılık, `.claude/settings.json` deny listesi, `db.lock` kuralı (e2e/test:db için ayrıca alınmaya devam eder),
koordinatör hafızasındaki eski "AĞIR İZİN" protokolü (raporda not olarak), başka kabuğa sarılmış komutlar (`bash -c "…"`).

## Done when
- `node --test scripts/coord-hooks.test.mjs scripts/lock.test.mjs scripts/decision-log.test.mjs` yeşil; yeni testler önce kırmızı
  görüldü.
- Tam kapı (lint, typecheck, test, build) yeşil; `heavy.lock` ile ve `gh run list` boşken.
- Guard CLI'ı elle: uyarı modunda JSON uyarı, engel modunda exit 2; Edit kancası rol oturumunda uyarı, koordinatörde sessiz.
- `/code-review` ONAY @<sha>; koordinatörün "gönder" izni (§4.9 bu gönderime kadar geçerli); main CI yeşil.

## Touches
`scripts/lock.mjs`, `scripts/guard.mjs`, `scripts/inbox.mjs` (yalnız yorum), `scripts/decision-log.mjs`, `scripts/coord-hooks.test.mjs`,
`scripts/lock.test.mjs`, `.claude/settings.json`, `.claude/skills/gece-modu/SKILL.md`, `.claude/skills/haftalik-denetim/SKILL.md`,
`CLAUDE.md`, `docs/plan/ILKELER.md` (tek parantez), `.claude/agents/nf-{arayuz,backend,db,planlama,test}.md` (tek atıf),
bu dosya.

## Test plan
`coord-hooks.test.mjs` (geçici klasör + geçici git deposu, gerçek kilit/posta kutusuna dokunmaz; `gh` ve saat test için
enjekte edilir):
- ağır komut tanıma: kök `pnpm.cmd test` / `test:db` / `e2e` / `build`, `supabase test db`, `npx playwright test`,
  `lint && typecheck && test` zinciri evet; tek başına `pnpm.cmd lint` / `typecheck`, `pnpm.cmd --filter @newfork/web exec
  vitest run x`, `node --test …`, `git commit -m "pnpm test"` hayır.
- `db.lock` var, `heavy.lock` yok → e2e uyarısı iki kilidi birden söyler.
- kilit yok → uyarı (14 Ekim öncesi) / engel (sonrası); kilit bende → geçer; başkasında → uyarı/engel; `take heavy && pnpm test`
  zinciri geçer, `;` ile değil; `NF_OVERRIDE` geçer ve loglanır; CI koşuyor → uyarı; `gh` yok → geçer + `heavy-ci-unknown`.
- push: başkası `heavy.lock` tutarken kod push'u uyarı; yalnız docs push'u sessiz; kendi kilidiyle sessiz.
- kayıt: rol oturumu (kayıt dosyası `Rol:` ile başlıyor) `docs/plan/BACKLOG.md` Edit → uyarı/engel; aynı oturum
  `docs/plan/tasks/X.md` → sessiz; koordinatör → sessiz; Mert'in oturumu → sessiz; kayıt okunamaz → geçer + log;
  `records-allow` sonrası geçer; rol oturumunda kayıt dosyası içeren `git commit` → uyarı.
- `lock.test.mjs`: `heavy` take/release/status, `session`/`cwd` alanları.

## Risk notes
- 🟠 Otomatik mod 2026-09-30'da (KARAR-001) ajanın `.claude/settings.json`'a kanca eklemesini "kendi araç ayarını değiştirme"
  diye reddetti. Yine reddedilirse: kod ve testler biter, bağlantı satırları rapora yazılır, ekleme Mert'e kalır (tek tık).
- 🟠 Guard her Bash/PowerShell çağrısında koşar; hata hâlinde bugünkü gibi açık kalır (yalnız main push'u kapalı kalır).
  `gh` çağrısı yalnız ağır komutta, 10 sn sınırla.
- 🟢 Yalnız uyarı haftası yanlış pozitifleri `audit.log`'dan görmeye yeter; engel tarihinden önce haftalık denetim bakar.
- Yeni oturumlar kancayı ancak dalları bu commit'i aldıktan sonra görür (settings.json oturum klasöründen okunur).

## Notes / Result
(Rapor biçimi: CLAUDE.md §4.4)
- 2026-10-07 açılış yükü (`get_usage`, oturumun ilk işi): 95.8 bin token (sistem araçları 30.7 bin, MCP araçları 17.3 bin,
  hafıza/kural 11.9 bin, skill listesi 8.6 bin, sistem 4.9 bin, mesajlar 18.0 bin). Önceki ölçüm ~102 bin (2026-10-06).
