---
name: tool-limits
description: Ölçülen araç sınırları — ci.yml düzenlemesi "Modify Shared Resources" ile reddedilir (kullanıcı o pencerede izin verirse olur); Git Bash'te git show origin/main:<yol> için MSYS_NO_PATHCONV=1
metadata:
  type: reference
---

2026-09-29, nf-test oturumu `local_0efbf957…`.

- `.github/workflows/ci.yml` düzenlemesi "[Modify Shared Resources]" ile reddedildi; kullanıcı o oturumun
  penceresinde izin verince yapılabildi. Başka oturuma yaptırılmaz (izin aklama).
- Git Bash `git show origin/main:<yol>`'u yol çevirimiyle bozar; önce `export MSYS_NO_PATHCONV=1`.
- Koddaki geçici bozma reddi: [[negative-cell-and-mutation-proof]].

İlgili: [[cross-worktree-git-block]].
