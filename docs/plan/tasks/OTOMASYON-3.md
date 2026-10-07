# OTOMASYON-3 Ağır koşu kilidi, kayıt koruması, karar kancası, gece ve denetim skill'leri
Status: dalda bitti, gönderim koordinatörün iznini bekliyor (görev ONAY 2026-10-07 ~06:40Z, iki düzeltmeyle; "Onay düzeltmeleri")
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
  - kökten `pnpm[.cmd] [run] test|build`, `turbo [run] test|build`; tek başına `lint` ve `typecheck` sayılmaz (onay düzeltmesi a).
    İkiden fazla kapı adımını zincirleyen komut zaten `test` ya da `build` içerir (yalnız `lint` + `typecheck` iki adım), bu yüzden
    ayrı sayaç yazılmadı. `--filter`/`-F`/`-C` varsa odaklı koşu, sayılmaz; `pnpm --filter … exec vitest run <dosya>` sayılmaz;
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
- Dosyalar: `docs/plan/{BACKLOG,KARARLAR,KOORDINATOR-KARARLARI,DERSLER,SABAH-SORULAR,HANDOFF,EKRAN-PLANI}.md` (hangi
  worktree'de olursa olsun). `DONE.md` listeden çıktı: CLAUDE-INCE (main `3050021b`) onu `docs/archive/`'e taşıdı, §4.8 de çıkardı.
- İzinli: (a) koordinatör = `coordinator.json`'daki `session_id` (`inbox.mjs claim`); (b) Mert'in açtığı oturum.
- **İşçi ayrımı (KK-188, koordinatör 2026-10-07 ~06:55Z):** işçi = ilk gerçek kullanıcı mesajı (oturum kaydında, araç sonuçları,
  meta satırlar, `<system-reminder>` ve sarmalayıcı etiketler atılınca) satır başında `Görev:` ile başlayan oturum; geçişte `Rol:`
  da, 14 Ekim'e kadar. Koordinatör olmayan işçi → uyarı/engel; geri kalan her oturum Mert'in sayılır. Kaydın yalnız ilk 4 MB'ı
  okunur. Kayıt okunamazsa izin verilir ve `records-unknown` loglanır (biçim kuralı, erişim kuralı değil). Alt ajan ana oturumun
  hükmünü alır.
  - İlk öneri (`Rol:` başlığı, KK-187) CLAUDE-INCE'de rol oturumları kalkınca KK-188'le `Görev:`e döndü. Ölçüm (2026-10-07,
    555 newfork oturum kaydı): ilk mesajı `Rol:` olan yalnız 1 kayıt vardı (bu oturum); eski rol oturumları "Rol: …"u oturum
    **adında** taşıyordu (`custom-title`), ilk mesaj "Idle kal…" idi. `Görev:` kuralıyla bugün 11 işçi (14 Ekim sonrası 10),
    hepsi koordinatör mesajı ya da EKRAN-02 kartı. Satır başı düz `Görev:` aranır: "# Görev: …" ile başlayan iki eski kayıt
    (2026-09-21, Mert'in yapıştırdığı istem) işçi sayılmasın diye. Zayıf yanı: `Görev:` satırıyla başlamayan işçi kaçar.
- Ek katman (KK-187'de kabul): işçi oturumunda `git commit`, staged ya da adıyla verilen kayıt dosyası içeriyorsa aynı uyarı.
  Edit/Write dışındaki yazmaları (python, `sed -i`, `Set-Content`) main'e girmeden yakalar.
- Kademe: kilitle aynı tarih (önce uyarı, 2026-10-14'ten sonra engel). Kaçış: `node scripts/guard.mjs records-allow "<gerekçe>"`
  → o oturum için izin dosyası (`.newfork-inbox/records-allow/<oturum>.json`) + `audit.log` satırı. Mert bir işçi oturumuna
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
- `.claude/skills/haftalik-denetim/SKILL.md` (koordinatörün verdiği oturum; `nf-planlama` CLAUDE-INCE'de kalktı): §4.6 listesi (çelişki, eskimiş bilgi, yalnız hafızada kalmış kural,
  §2.C ↔ `ILKELER.md`), dört sayı ve her birinin komutu: kabul oranı (`decision-log.mjs stats`), haftalık Mert düzeltmesi
  (`decisions.jsonl` `picked_other` + `free_text` + KARARLAR/KK "ters çevrildi"), oturum başı sabit yük (yeni oturumda
  `get_usage`), gönderimden CI yeşiline süre (`gh run list --branch main --json …`). Aylık: rol hafızaları dahil. Çıktı
  `docs/plan/research/denetim-<tarih>.md`, haber posta kutusuna; düzeltmeyi koordinatör yapar.

### 5. Kural dosyalarında olgusal düzeltme (diff'te gösterilir)
- `CLAUDE.md` §4.9 (iki geçiş satırı ve başlığı) silinir; §6 "Gönderim adımları" 1'deki "(§4.2, §4.9)" → "(§4.2)".
- `CLAUDE.md` §6 kilit listesine `heavy.lock` satırı (ne zaman alınır, uyarı → engel tarihi, kaçış). Bu satır olmazsa oturumlar
  kilidi nasıl alacağını bilmez; kural değil, var olan kuralın (§4.2 "ağır koşu kilidiyle zorlanır") aracı.
- `ILKELER.md` P15'teki "(ağır koşu kilidi gelene kadar her gönderim izinle, §4.9)" parantezi: §4.9 kalkınca eskiyen atıf. Rol
  dosyalarındaki aynı atıf dosyalarla birlikte CLAUDE-INCE'de silindi; kalan `nf-guvenlik` / `nf-okur`'da yok.
- `CLAUDE.md` §4.8 ilke (3): "önce uyarı" → "2026-10-14'e kadar uyarı, sonra engel" ve kaçış yolu (`records-allow`) tek cümle.
- Betiklerin yardım ve ret metinlerinde kilit kimliği "rol/oturum" → "oturum/iş" (CLAUDE.md §6 artık böyle yazıyor).

### Onay düzeltmeleri (koordinatör, 2026-10-07 ~06:40Z)
- a) Tek başına kök `lint` ağır koşu değil (saniyelik). Tek başına `typecheck`: kökten bir kez ölçülür, ~60 sn altıysa sayılmaz.
  Ölçüm 2026-10-07 ~06:47Z, yeni worktree, CI boşken: `pnpm.cmd typecheck --force` 24 sn (turbo 22.5 sn, 7/7 görev, önbellek 0)
  → sayılmaz.
- b) Test vakası: `db.lock` alınmış ama `heavy.lock` alınmamış e2e → uyarı; e2e/test:db metni iki kilidi birden söyler
  ("önce db, sonra heavy").
- Rapora bir satır: `Rol:` satırıyla başlamayan rol oturumu kayıt korumasından kaçar (KK-188'den sonra: `Görev:` satırıyla
  başlamayan işçi).

## Out of scope
CI iş akışı, yeni bağımlılık, `.claude/settings.json` deny listesi, `db.lock` kuralı (e2e/test:db için ayrıca alınmaya devam eder),
koordinatör hafızasındaki eski "AĞIR İZİN" protokolü (raporda not olarak), başka kabuğa sarılmış komutlar (`bash -c "…"`).

## Done when
- `node --test scripts/coord-hooks.test.mjs scripts/lock.test.mjs scripts/decision-log.test.mjs` yeşil; yeni testler önce kırmızı
  görüldü.
- Tam kapı (lint, typecheck, test, build) yeşil; `heavy.lock` ile ve `gh run list` boşken.
- Guard CLI'ı elle: uyarı modunda JSON uyarı, engel modunda exit 2; Edit kancası işçi oturumunda uyarı, koordinatörde sessiz.
- `/code-review` ONAY @<sha>; koordinatörün "gönder" izni (§4.9 bu gönderime kadar geçerli); main CI yeşil.

## Touches
`scripts/lock.mjs`, `scripts/guard.mjs`, `scripts/inbox.mjs` (yalnız yorum ve yardım metni), `scripts/decision-log.mjs`,
`scripts/coord-hooks.test.mjs`, `scripts/lock.test.mjs`, `.claude/settings.json`, `.claude/skills/gece-modu/SKILL.md`,
`.claude/skills/haftalik-denetim/SKILL.md`, `CLAUDE.md`, `docs/plan/ILKELER.md` (tek parantez), bu dosya.

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
- kayıt: işçi oturumu (kaydı `Görev:` ile başlıyor) `docs/plan/BACKLOG.md` Edit → uyarı/engel; aynı oturum
  `docs/plan/tasks/X.md` → sessiz; koordinatör → sessiz; Mert'in oturumu → sessiz; kayıt okunamaz → geçer + log;
  `records-allow` sonrası geçer; işçi oturumunda kayıt dosyası içeren `git commit` → uyarı; koordinatör mesajıyla `Görev:` alan
  temizlenmiş oturum işçi; `Rol:` yalnız 14 Ekim'e kadar; Mert'in oturumunda sonraki `Görev:` mesajı ve "# Görev:" istemi işçi
  yapmaz; `DONE.md` artık kayıt dosyası değil.
- `lock.test.mjs`: `heavy` take/release/status, `session`/`cwd` alanları.

## Risk notes
- 🟠 Otomatik mod 2026-09-30'da (KARAR-001) ajanın `.claude/settings.json`'a kanca eklemesini "kendi araç ayarını değiştirme"
  diye reddetti. Yine reddedilirse: kod ve testler biter, bağlantı satırları rapora yazılır, ekleme Mert'e kalır (tek tık).
- 🟠 Guard her Bash/PowerShell çağrısında koşar; hata hâlinde bugünkü gibi açık kalır (yalnız main push'u kapalı kalır).
  `gh` çağrısı yalnız ağır komutta, 10 sn sınırla.
- 🟢 Yalnız uyarı haftası yanlış pozitifleri `audit.log`'dan görmeye yeter; engel tarihinden önce haftalık denetim bakar.
- Yeni oturumlar kancayı ancak dalları bu commit'i aldıktan sonra görür (settings.json oturum klasöründen okunur).

## Notes / Result

- **Karar:** dört otomasyon dalda bitti (`task/otomasyon-3` @ `d4ebd40e`); CLAUDE.md §4.9 silindi. Main'e gönderilmedi.
- **İzin:** koordinatörün "gönder" izni isteniyor (§4.9 bu gönderime kadar geçerli; CLAUDE.md ve `.claude/settings.json` değişiyor).
- **Risk:** 🟠 Kanca bütün oturumlarda koşar; 2026-10-14'e kadar yalnız uyarır, sonra ağır koşuda ve kayıt dosyasında reddeder (kaçışlar loglu).
- **Soru:** yok. Koordinatörün bakması için: CLAUDE.md §4.8 ve §6'daki yeni cümleler (aşağıda "Kural metni"), `/code-review`'ün bağımsızlığı.
- **Sonraki:** izin gelince `main` + `heavy` kilidi → rebase → tam kapı → push → kilitleri bırak → main CI.

### Nerede duruyor
Dal `task/otomasyon-3`, worktree `C:\Users\TheWe\Documents\Codex\newfork-wt\otomasyon-3`, üç commit: `f0c89bb3` (kilit, kanca,
karar kancası, gece-modu), `7852e8ce` (KK-188 işçi ayrımı, `cd` izleme, haftalik-denetim, §4.9), `d4ebd40e` (inceleme düzeltmeleri).

### Ne yapıldı (etkisi)
| | Neydi | Ne oldu |
|---|---|---|
| Ağır koşu | "Aynı anda tek ağır koşu" yalnız yazılı; koordinatör "AĞIR İZİN" mesajıyla sıraya koyuyordu | `heavy.lock` (`scripts/lock.mjs:18`); `scripts/guard.mjs:284` kökten `test`/`build`, `test:db`, e2e'de kilit bu oturumda mı ve CI koşuyor mu bakar; `:317` CI başlatan push başka oturumun kilidiyle çakışıyor mu bakar |
| Kilit sahipliği | Kilit yalnız "rol/oturum" yazısı taşıyordu | Kilit `CLAUDE_CODE_SESSION_ID` ve klasörü de yazar (`lock.mjs:87`); guard "bende mi" sorusunu oturum kimliğiyle cevaplar |
| Kayıt dosyaları | "Yalnız koordinatör ve Mert'in oturumu yazar" yalnız yazılı | Edit/Write ve işçinin `git commit`'i 7 kayıt dosyasında uyarır (`guard.mjs:390`, `:415`); işçi = ilk mesajı `Görev:` (KK-188) |
| Karar kaydı | `decision-log.mjs` 2026-09-30'dan beri bağlı değildi: `stats` son satırı 2026-09-28 haftası | `AskUserQuestion` öncesi/sonrası kancası bağlı (`.claude/settings.json`); kabul oranı yeniden ölçülür |
| Gece / denetim | Yalnız yazılı | `/gece-modu` (keep-awake, `inbox wait`, ~10 dk `CronCreate` turu, 20 dk sessiz oturum, sabah raporu → soru turu), `/haftalik-denetim` (§4.6 listesi, dört sayı ve komutları) |
| Kademe | — | `ENFORCE_DAY = "2026-10-14"` (`guard.mjs:27`): öncesi uyarı + `audit.log`, sonrası exit 2. Kaçış: ağır komutta `NF_OVERRIDE="<gerekçe>"`, kayıtta `node scripts/guard.mjs records-allow "<gerekçe>"`. Geri dönüş: tarihi ileri al |

Yolda düzeltilen (işin önündeydi): kartla açılan oturum kart worktree'sinde başlar, işi `cd ../newfork-wt/<id>` ile yapar; kanca
`cwd`'si başlangıç klasörü olduğu için commit'teki kayıt kontrolü ve "yalnız docs mu" push kontrolü yanlış klasöre bakıyordu →
`cd` / `Set-Location` / `pushd` izlenir (`guard.mjs:133`). Betik yardım metinlerinde kilit kimliği "rol/oturum" → "oturum/iş".

### Ölçümler ve kanıt
- Açılış yükü (`get_usage`, oturumun ilk işi, 2026-10-07 ~06:22Z): **95,8 bin** token / 1M (önceki ~102 bin, 2026-10-06). Sistem
  araçları 30,7 bin · mesajlar 18,0 bin (görev mesajı + ilk araç çağrıları) · MCP araçları 17,3 bin · hafıza/kural 11,9 bin ·
  skill listesi **8,6 bin** (önceki 36,6 bin) · sistem 4,9 bin.
- Kök `typecheck` soğuk (`pnpm.cmd typecheck --force`, yeni worktree, CI boş, 2026-10-07 ~06:47Z): 24 sn (turbo 22,5 sn, 7/7, önbellek 0)
  → 60 sn eşiğinin altında, tek başına ağır sayılmaz.
- İşçi ayrımı, 555 newfork oturum kaydı üzerinde (2026-10-07): `Görev:` kuralıyla bugün 11 işçi (14 Ekim sonrası 10), hepsi koordinatör
  görev mesajı ya da EKRAN-02 kartı; Mert'in "# Görev:" istemiyle başlayan iki eski kayıt işçi sayılmadı; 39 kayıt okunamadı/boş
  (37'si eski ajan takımı `nf-muhendislik`/`team-*`) → izin + `records-unknown`. En yavaş okuma 17 ms (yalnız kaydın başı).
- `gh` Windows'ta kancadan çağrılabiliyor: 925 ms; kanca `cwd`'si Windows yolu (`.newfork-inbox/status/*.json`'da doğrulandı).
- Testler: `node --test scripts/lock.test.mjs scripts/coord-hooks.test.mjs scripts/decision-log.test.mjs scripts/schema-snapshot.test.mjs`
  → **72/72** @ `d4ebd40e` (başlangıç 42). Yeni testlerin hepsi önce kırmızı görüldü.
- Tam kapı `heavy.lock` ile, CI boşken @ `7852e8ce`: lint 5/5 (11 sn) · typecheck 7/7 (18 sn) · test (betikler 69/69; shared 17,
  ui 3, api 59, web 233 dosya) 1 dk 46 sn · build 4/4 (29 sn); toplam 172 sn, çıkış 0. `d4ebd40e` yalnız `scripts/` ve `.md`
  değiştirdi (paketlerin lint/typecheck/build'ine girmez); rebase sonrası kapı gönderimde yeniden koşar.
- Elle uçtan uca (geçici kilit/posta klasörü, gerçek `gh`, bu oturumun gerçek kaydı): Edit `BACKLOG.md` → uyarı JSON'u;
  `pnpm.cmd test` kilitsiz → uyarı JSON'u, `audit.log`'da `records-warn`, `heavy-warn`.

### İnceleme
`/code-review` (high, `task/otomasyon-3` @ `7852e8ce`): 9 bulgu. 8'i düzeltildi (`d4ebd40e`): heredoc / here-string gövdesindeki satır
ağır koşu sanılıyordu (14 Ekim'den sonra `git commit -F - <<'EOF'` reddedilirdi; doğrulandı), PowerShell `$env:NF_OVERRIDE` arada `cd`
olunca görülmüyordu, `gh` ayrıştırması testsizdi, haftalık denetim `*-unknown` sayılarına bakmıyordu, §6 gönderim adımları
`heavy.lock`'u anmıyordu, 4 MB tampon, çift `git diff`, `slug` tekrarı. 1'i değişiklik gerektirmedi (§4.8 cümlesi; aşağıda).
**ONAY @ `d4ebd40e`.** Not: `/code-review` bu oturumun kendi bağlamında koştu (ayrı ajan değil); daha bağımsız bir göz istersen
`nf-guvenlik` çağrılabilir.

### Kural metni (koordinatör baksın; içerik onaylı kararları belgeliyor)
- CLAUDE.md §4.8 (3): "(önce uyarı)" → "(2026-10-14'e kadar uyarı, sonra engel); Mert bir oturuma açıkça yazdırırsa o oturum
  `node scripts/guard.mjs records-allow "<gerekçe>"` koşar, `audit.log`'a yazılır." Dayanak: KK-187 (1), görev dosyası "Kaçış".
- CLAUDE.md §6: `heavy.lock` satırı (ne sayılır, e2e/test:db için önce db sonra heavy, uyarı → engel tarihi, kaçış); kilit yardımcısı
  `<db|main|heavy>`; e2e satırı "`db.lock` ve `heavy.lock` ile"; gönderim adımı 2 "kod değiştiyse `heavy` de", adım 6 "Kilitler".
- CLAUDE.md §4.9 bölümü ve §6 adım 1'deki "§4.9" atfı silindi; ILKELER P15'teki "(… §4.9)" parantezi silindi.

### Açık kalan ve nedeni
- `Görev:` satırıyla başlamayan işçi kayıt korumasından kaçar (KK-188'de kabul edilen zayıflık); bağlam taşınca yeni kayıtla devam
  eden oturumun ilk mesajı özet olabilir, o da kaçar.
- Başka kabuğa sarılmış komut (`bash -c "…"`, `pwsh -Command "…"`) görülmez (önceden de böyleydi).
- Eski dallardaki oturumlar kancayı ancak dalları bu commit'i alınca görür (`settings.json` oturum klasöründen okunur).

### Yolda bulunan (BACKLOG adayı, koordinatör yazar)
- **Pano yanlış etiket ve dal gösteriyor** (`scripts/inbox.mjs`): etiket dosyası `slug(cwd)` ile adlanıyor ve `slug` 40 karakterde
  kesiyor → `.claude/worktrees/*` altındaki bütün oturumlar tek etiketi (`c-users-thewe-documents-codex-newfork-cl`), `newfork-wt/*`
  altındakiler tek etiketi (`…-newfork-wt`) paylaşıyor. Kanıt (2026-10-07 ~07:40Z, `inbox.mjs board`): bu oturumun satırında
  "CLAUDE-INCE — main'de 3050021b…" etiketi ve kart worktree'sinin dalı `claude/objective-diffie-33fcc1 @ 90bbd9e8` görünüyor.
  Takılma tespiti oturum kimliğine bağlı olduğu için çalışıyor; görev etiketi ve dal yanlış. (leave: medium / do: safe)
- Koordinatör hafızasındaki "AĞIR İZİN" protokolü (`AGIR-ISTEK` → "AĞIR İZİN" → `AGIR-BITTI`) bu kilitle gereksizleşir.

### Temizlik
Kartın açtığı `.claude/worktrees/zealous-diffie-ec31cb` (dal `claude/objective-diffie-33fcc1` @ `90bbd9e8`, main'in eski ucu): takip edilen
değişiklik ve commit yok; yalnız uygulamanın yazdığı yok sayılan `.claude/launch.json` ve `.claude/settings.local.json` var.
Koordinatör temizleyebilir. Geçici kanıt dosyaları oturumun scratchpad'inde; `newfork-wt/otomasyon-3-*.log` kapı kayıtları.
