---
name: worktree-bash-guard
description: İzole worktree'de Bash, değişkenli ya da karmaşık komut içinde git geçerse reddediliyor; büyük metin düzenlemesi için güvenli yol
metadata:
  type: feedback
---

İzole worktree ajanıyken Bash, aynı komutta git ile birlikte kabuk değişkeni (`$f`, `$SP`) ya da uzun
zincir görünce komutu reddediyor; python heredoc içindeki `'''` blokları da ayrıştırmayı bozuyor.
Çalışan yol: düzenlenecek uzun metni Write ile scratchpad'e dosya olarak yaz, python betiğini düz mutlak
yollarla çağır; git komutlarını ayrı, sade çağrılarla koş (2026-09-26, BL-186).

**Why:** iki reddedilen komut ve yarım kalan bir betik zaman kaybettirdi.
**How to apply:** docs/plan'da çok satırlı ekleme gerekirse önce metin dosyası + küçük betik; `git` hep ayrı komut.
