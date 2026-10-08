---
name: oto
description: Koordinatörün otomasyonu, gece ve gündüz aynı (CLAUDE.md §5). Mert onaylı bir planla "/oto <hedef>" deyince koordinatör oturumunda başlat; sıra bitene ya da Mert dönüp /durum diyene kadar işçi ajanları yönetir, treni koşar, DURUM.md'yi yazar, soruları hakeme götürür. Yalnız koordinatör çalıştırır.
---

# /oto — koordinatörün otomasyonu

Yalnız koordinatör oturumu (`C:/Users/TheWe/Documents/Codex/newfork-wt/coord`, dal `coord/kayit`) çalıştırır. Kurallar `CLAUDE.md`'dedir; burada yalnız döngü var.

## Başlarken (bir kez)
1. **Plan.** Mert'in onayladığı hedef ve işler `DURUM.md` "Plan" ve "Sırada"ya: iş · sınıf (normal / incelemeli) · dokunacağı dosyalar · neden önce. Onaysız iş sıraya girmez.
2. **Uyanık tut.** `request_keep_awake` (`until: "session_idle"`, reason: "Otomasyon: koordinatör işleri yönetiyor").
3. **Yedek saat.** `CronCreate` `cron: "*/20 * * * *"`, prompt: `oto turu: .claude/skills/oto/SKILL.md "Her tur" adımları`. Dönen kimliği `DURUM.md` "Sağlık"a yaz.
4. İlk tur.

## Her tur
Uyandıran: ajan bildirimi · tren komutunun bitişi · yedek saat · Mert'in mesajı.

1. **Gelenler.** Her ajan sonucunun ilk satırını oku (`İŞ · DURUM · DAL`); tam metin `docs/plan/gunluk/<bugün>/`'de.
   - `HAZIR` + normal → "Trene hazır". `HAZIR` + incelemeli → `nf-guvenlik` (arka planda; görev: iş kimliği, dal, aralık `origin/main...task/<id>`). `ONAY @<sha>` → "Trene hazır". Bulgu → aynı işçiye `SendMessage` (bağlamıyla devam) ya da yeni işçi "devam: task/<id>@<sha>".
   - Canlı veritabanı işi: ONAY'dan sonra `CLAUDE.md` §5 koşullarını kontrol et, işçiye "gönder" (`SendMessage`).
   - `SORU` → `nf-hakem`. `KARAR` → işçiye cevap (`SendMessage`); günlüğe ve `DURUM.md` "Senin yerine verdiğim kararlar"a satır. `SOR` → `docs/plan/SORULAR.md`'ye soru biçimiyle, iş "Seni bekleyen"e. Mert penceredeyse ve iş duruyorsa hemen sor.
   - `TAKILDI` → `nf-okur` ile neden; yön ver ya da böl. `BÖLÜNDÜ` → kalan parça sıranın başına.
   - "Ders" satırı → ilgili klasörün `CLAUDE.md`'sine tek satır (tekrar değilse). "Backlog adayı" → `BACKLOG.md`.
   - Günlüğe (`docs/plan/gunluk/<bugün>.md`) her olay için tek satır: saat · iş · ne oldu.
2. **Tren.** Tren koşmuyorsa ve "Trene hazır" doluysa: kayıtları commit'le (dosyalar adıyla, `docs(plan): records (KAYIT)`), sonra arka planda `node scripts/train.mjs run <dal@sha…>` (Bash, `run_in_background`). Bitince:
   - `0` → main'de. `git rebase origin/main` (coord/kayit). İşler "Bugün biten"e (sha). Backlog maddeleri kapanır. İşçi worktree'leri ve dalları silinir: önce `git cherry -v origin/main <dal>` boş olmalı.
   - `2` → bir dal atlandı (çakışma): işçisine "rebase et, push et, HAZIR yaz".
   - `1` → başarısız adım satırda. `ci` kırmızı: `nf-okur` ile ayır. Altyapı → `gh run rerun <run> --failed`; yeşil olunca `node scripts/train.mjs push` ve `node scripts/train.mjs apply-local`. Kod → bozan dalı çıkar, işçisine geri ver, kalanlarla yeniden `run`. Main kırmızıysa ilk tren yalnız düzelteni taşır.
3. **Yeni iş.** Koşan işçi 3'ten azsa ve sırada iş varsa: dosyaları koşanlarla çakışmayan ilk işi ver. `Agent(subagent_type: "nf-isci", isolation: "worktree", run_in_background: true, model: "opus")`; incelemeli işte `effort: "high"`. Görev metni şablonu `CLAUDE.md` §5. Backlog'dan gelen iş önce `nf-okur` tazelik kontrolünden geçer. Port: boştaki ilk çift 5612/5613, 5620/5621, 5622/5623.
4. **Kullanım.** `get_usage`. 5 saatlik limit %80'i geçtiyse yeni incelemeli ya da uzun iş başlatma; ucuz işler sürer.
5. **Pano.** `DURUM.md`'yi aşağıdaki şablonla yeniden yaz; `request_keep_awake`'i yenile. Değişiklik yoksa tur tek satırla biter.

## Yeniden başlatmadan sonra
`DURUM.md` "Koşuyor"daki her iş için `git ls-remote origin task/<id>`: dal uzaktaysa yeni işçi "devam: task/<id>@<sha>"; değilse iş baştan.

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
- <iş> — <ajan> — başladı <HH:MM> — son haber <HH:MM>

## Sırada
- <iş> — <sınıf> — <neden önce>

## Trene hazır
- task/<id>@<sha>

## Tren
- son tren: <dallar> · CI <sonuç, run> · <süre>

## Senin yerine verdiğim kararlar
- <karar> — Dayanak: <kimlik>

## Plan
- <Mert'in onayladığı hedef ve sıra>

## Sağlık
- CI dk/gün · hazır→main medyanı · kullanım % · yedek saat kimliği · ölçüm günü 2026-10-15
```
