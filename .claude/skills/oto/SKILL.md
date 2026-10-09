---
name: oto
description: Koordinatörün otomasyonu, gece ve gündüz aynı (CLAUDE.md §5). Mert onaylı bir planla "/oto <hedef>" deyince koordinatör oturumunda başlat; sıra bitene ya da Mert dönüp /durum diyene kadar işçi ajanları yönetir, treni koşar, DURUM.md'yi yazar, soruları hakeme götürür. Yalnız koordinatör çalıştırır.
---

# /oto — koordinatörün otomasyonu

Yalnız koordinatör oturumu (`C:/Users/TheWe/Documents/Codex/newfork-wt/coord`, dal `coord/kayit`) çalıştırır. Kurallar `CLAUDE.md`'dedir; burada yalnız döngü var.

## Başlarken (bir kez)
1. **Plan.** Mert'in onayladığı hedef ve işler `DURUM.md` "Plan" ve "Sırada"ya: iş · sınıf (normal / incelemeli) · dokunacağı dosyalar · neden önce. Onaysız iş sıraya girmez.
2. **Uyanık tut.** `request_keep_awake` (`until: "session_idle"`, reason: "Otomasyon: koordinatör işleri yönetiyor").
3. **Yedek saat.** `CronCreate` `cron: "*/20 * * * *"`, prompt: `oto turu: .claude/skills/oto/SKILL.md "Her tur" adımları`. Dönen kimliği `DURUM.md` "Sağlık"a yaz. Cron 7 günde kendiliğinden biter; 7 günü geçen koşuda yeniden kur.
4. İlk tur.

## Her tur
Uyandıran: ajan bildirimi · tren komutunun bitişi · yedek saat · Mert'in mesajı.

Her turun başında **main alarmı**: `node scripts/main-watch.mjs` (koordinatör worktree'sinde). Çıkış 0 → "Sağlık"ta `main alarmı temiz`. Çıkış 1 (`🔴 trenden geçmemiş commit: …`) → `DURUM.md` başına ve "Sağlık"a 🔴 satırı (sha ve konu), yeni iş başlamaz (adım 3 atlanır; koşan işler ve tren sürer), Mert'e hemen söylenir. Mert commit'i bildiğini söylerse sonraki turlarda `--since <o commit'in sha'sı>` ve sha "Sağlık"a yazılır. Çıkış 2 (audit.log'da tren gönderimi yok) → `--since <şimdiki origin/main>` ile bir kez başlat, sha'yı "Sağlık"a yaz.

Mert'in iş başlatan mesajı → işe başlamadan dört başlık (`CLAUDE.md` §2.5): Anladığım · Eksik ya da yanlış olabilecek · Sorularım · Bence; elenen seçenekler nedeniyle.

1. **Gelenler.** Her ajan sonucunun ilk satırını oku (`İŞ · DURUM · DAL`); tam metin `docs/plan/gunluk/<bugün>/`'de.
   - `HAZIR` + normal → "Trene hazır"; normal işlerden günde 2–3 örneğin diff'ini oku, örneği günlüğe yaz (denetim, `CLAUDE.md` §5). `HAZIR` + incelemeli → `nf-guvenlik` (arka planda; görev: iş kimliği, dal, aralık `origin/main...task/<id>`). `ONAY @<sha>` → "Trene hazır". Bulgu → aynı işçiye `SendMessage` (bağlamıyla devam) ya da yeni işçi "devam: task/<id>@<sha>".
   - Canlı veritabanı işi: ONAY'dan sonra `CLAUDE.md` §5 koşullarını kontrol et, işçiye "gönder" (`SendMessage`).
   - `SORU` → `nf-hakem`. `KARAR` → işçiye cevap (`SendMessage`); günlüğe tek satır; ürün ya da ekran kararı, para ya da canlıysa ayrıca `DURUM.md` "Senin yerine verdiğim kararlar"a (`CLAUDE.md` §6 kayıt yükü). `SOR` → `docs/plan/SORULAR.md`'ye soru biçimiyle, iş "Seni bekleyen"e. Mert penceredeyse ve iş duruyorsa hemen sor.
   - `TAKILDI` → `nf-okur` ile neden; yön ver ya da böl. `BÖLÜNDÜ` → kalan parça sıranın başına.
   - "Ders" satırı → ilgili klasörün `CLAUDE.md`'sine tek satır (tekrar değilse). "Backlog adayı" → `docs/plan/BACKLOG.md`.
   - Günlüğe (`docs/plan/gunluk/<bugün>.md`) her olay için tek satır: saat · iş · ne oldu.
2. **Tren.** Main'e gönderim yalnız tren ve beklemesiz (Mert, 2026-10-08): tren koşmuyorsa (`DURUM.md` "Tren"de `koşuyor` satırı yoksa) ve "Trene hazır"da tek dal bile varsa tren hemen kalkar, başka dal beklenmez; tren koşuyorsa yeni hazır dal "Trene hazır"da kalır ve sonraki trene biner. Kalkış: kayıtları commit'le (dosyalar adıyla, `docs(plan): records (KAYIT)`; stash asla), arka planda `node scripts/train.mjs run <dal@sha…>` (Bash, `run_in_background`), "Tren"e `koşuyor (stamp bekleniyor) · dallar … · CI — · başladı YYYY-MM-DD HH:MM · süre —` yaz; stamp'i komutun çıktısı gelince doldur (`train.mjs` üretir). Bitince aşağıdaki sonuca göre; her sonucun sonunda (bekleyen rerun / `ci` / `push` / `apply-local` bitince) "Tren" satırı `koşuyor` → `son <stamp> · dallar … · CI <sonuç, run> · başladı YYYY-MM-DD HH:MM · süre <dk>`. Yeniden `run` yeni bir `koşuyor` satırı açar.
   - `0` → main'de. Kayıtları commit'le (aynı biçim), `git rebase origin/main` (coord/kayit). İşler "Bugün biten"e (sha). Backlog maddeleri kapanır. İşçi worktree'leri ve dalları silinir: önce `git cherry -v origin/main <dal>` boş olmalı.
   - `2` → main ilerledi, bir dal dışarıda kaldı (`atlandı: <dal> …`). Girenler için `0` adımları; atlanan dalın işçisine "rebase et, push et, HAZIR yaz".
   - `1` → hata öncesi son `— <adım>` satırına bak:
     - `—` satırı yok (derleme) → stamp oluştuysa (çıktıda ya da `state.json`'da) "Tren" satırı `son <stamp> · derleme engeli · dallar …`; stamp hiç oluşmadıysa `son — · derleme engeli · dallar …`. Engelleri oku, listeyi düzelt, yeniden `run`.
     - `ci` failure → `nf-okur` ile ayır (yük mü kod mu, hangi test, main'de de kırmızı mı). Sırayla:
       - **Bilinen kırmızı** (Mert, 2026-10-08): düşen tek test main'de de kırmızı olan aynı bilinen testse (test adı düzeyinde karşılaştır, iş düzeyinde değil) tren geçer: `NF_OVERRIDE="bilinen kırmızı: <test adı>" node scripts/train.mjs push`, sonra `apply-local` ve `0` adımları; günlüğe tek satır. Başka bir kırmızı da varsa bu yol yok.
       - Altyapı (yük, port, Docker) → `gh run rerun <run> --failed`, bitmesini bekle, `node scripts/train.mjs ci`; yeşilse `push`, `apply-local`, `0` adımları.
       - Kod → bozan dalı çıkar, işçisine geri ver, kalanlarla yeniden `run`.
       - **Main kırmızıysa** (Mert, 2026-10-08): önce geri al (bozan commit'in revert'i, trenle); canlı veritabanına dokunan değişiklikte geri alma yerine önce düzelt. Sahibi (bozan işin işçisi) yapar; 15 dakikada yapmazsa koordinatör. Süre `nf-okur` kırmızının yük mü kod mu olduğunu ayırdıktan sonra başlar; başlangıç saati "Tren" satırına. İlk tren yalnız geri alanı ya da düzelteni taşır.
     - `ci` cancelled → önce `gh run rerun <run>` (yalnız `ci` yine cancelled yazar), sonra `node scripts/train.mjs ci`.
     - `ci` timeout → yeniden `node scripts/train.mjs ci` (yeniden bekler).
     - `ci` no-run → `gh run list --branch train/<stamp>`; birkaç dakika sonra hâlâ koşu yoksa `gh workflow run ci.yml --ref train/<stamp>`, sonra `node scripts/train.mjs ci`.
     - Üçünde de `ci` yeşil yazınca: `node scripts/train.mjs push`, `node scripts/train.mjs apply-local`, `0` adımları. Rerun ya da yeniden `ci` sonrası hâlâ kırmızıysa `ci` failure dalıyla devam (`nf-okur` ile ayır).
     - `push` (main ilerledi) → aynı dallarla yeniden `run`.
     - `apply-local` → main zaten ilerledi: `0` adımları, sonra `node scripts/lock.mjs status` ve yeniden `node scripts/train.mjs apply-local`.
3. **Yeni iş.** Main alarmı temizse, koşan işçi < işçi sınırı ise (varsayılan 1; yalnız Mert'in komutuyla değişir, "Sağlık"ta `işçi sınırı <n>`) ve sırada iş varsa: dosyaları koşanlarla çakışmayan ilk işi ver. `Agent(subagent_type: "nf-isci", isolation: "worktree", run_in_background: true, model: "opus")`; incelemeli işte `effort: "high"`. Görev metni şablonu `CLAUDE.md` §5. Backlog'dan gelen iş önce `nf-okur` tazelik kontrolünden geçer. Port: boştaki ilk çift 5612/5613, 5620/5621, 5622/5623.
4. **Kullanım.** `get_usage`. 5 saatlik limit %80'i geçtiyse yeni incelemeli ya da uzun iş başlatma; ucuz işler sürer. `node scripts/lock.mjs status`: UZUN ya da ÖLÜ kilit → "Sağlık"ta ve günlükte 🟠 satır.
5. **Pano.** `DURUM.md`'yi aşağıdaki şablonla yeniden yaz; `request_keep_awake`'i yenile. Değişiklik yoksa tur tek satırla biter.

## Yeniden başlatmadan sonra
Önce `CronCreate` (aynı prompt) ve `request_keep_awake`; yeni cron kimliğini "Sağlık"a yaz.

Yeniden başlatma arka plandaki tren komutunu, rerun beklemesini ve `ci` kontrolünü öldürür; uyandırma gelmez. `DURUM.md` "Tren" satırı `koşuyor` ise: tren klasöründeki durum dosyasını oku (`C:/Users/TheWe/Documents/Codex/newfork-wt/train/artifacts/train/state.json`: stamp, ci, pushed). Dosya bu koşunun olmalı: satırda stamp varsa dosyadaki `stamp` ona eşit olmalı; satır `koşuyor (stamp bekleniyor)` ise dosyanın tam değiştirilme tarih-saati (`stat -c %y <dosya>`, yerel saat) satırdaki `başladı` tarih-saatinden (YYYY-MM-DD HH:MM) sonra olmalı. Dosya yoksa ya da eski bir koşununsa derleme durum yazmadan ölmüştür: satırı `son — · iptal (yeniden başlatma)` yap ve `run`'ı yeniden başlat. Dosya bu koşununsa stamp'i satıra yaz ve `git ls-remote origin refs/heads/train/<stamp>`. Tren dalı varsa ve push olmadıysa `node scripts/train.mjs ci` (yeniden bekler), sonra sonuç kurallarıyla devam. Push olduysa `apply-local` ve `0` adımları. Tren dalı yoksa satırı `son <stamp> · iptal (yeniden başlatma)` yap ve `run`'ı yeniden başlat.

Sonra `DURUM.md` "Koşuyor"daki her iş için önce yerel dal (`git rev-parse --verify task/<id>`), sonra uzak (`git ls-remote origin task/<id>`): biri varsa yeni işçi "devam: task/<id>@<sha>"; yoksa iş baştan. İkisi de varsa önce `git fetch origin task/<id>`, sonra `task/<id>` ile `origin/task/<id>`'yi karşılaştır: farklıysa öndekini al (`git merge-base --is-ancestor task/<id> origin/task/<id>` ve tersi); ayrışmışlarsa yereldekinden devam et; uzaktaki fazla commit sha'larını (`git log --format=%H task/<id>..origin/task/<id>`) günlüğe yaz, geri alınabilsin.

## Bitiş
Sıra boş, tren yok, koşan ajan yok → `DURUM.md` başına "Bitti", `CronDelete`. Mert dönünce `/durum`.

## DURUM.md şablonu
```
# Durum — <YYYY-MM-DD HH:MM>
🟢/🟠/🔴 <tek cümle>

## Seni bekleyen (<n>)
- <soru / görsel seçim / "evet" gereken iş> — <ne zamandır>

## Bugün biten
- <iş> — <ekranda ne değişti, ekran adıyla> — `<sha>`

## Koşuyor
- <iş> — <ajan> — port <web>/<api> — başladı <HH:MM>

## Sırada
- <iş> — <sınıf> — <neden önce>

## Trene hazır
- task/<id>@<sha>

## Tren
- <koşuyor/son> <stamp> · dallar … · CI <sonuç, run> · başladı YYYY-MM-DD HH:MM · süre <dk>

## Senin yerine verdiğim kararlar
- <karar> — Dayanak: <kimlik>

## Plan
- <Mert'in onayladığı hedef ve sıra>

## Sağlık
- işçi sınırı <n> · main alarmı <temiz / 🔴 sha konu> (since <sha>)
- CI dk/gün (gh run list, train/* dalları) · hazır→main medyanı (günlükteki HAZIR saati + audit.log train-push) · ters çevirme <n> · kullanım % · yedek saat kimliği · ölçüm günü <ilk /oto + 7 gün>
```
