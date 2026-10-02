---
name: feedback-no-checkout-in-others-worktree
description: Başkasının worktree'sinde checkout/switch yok; incelenen sha'yı git show / git archive / ayrı geçici worktree ile oku
metadata:
  type: feedback
---

İncelemede işçinin worktree'sinde `git checkout` ya da `git switch` koşulmaz; dal başka bir oturumun canlı çalışma alanıdır.

**Why:** FB-6.7 C tur 2'de (2026-10-02) vitest koşmak için `newfork-wt/fb-6.7c`'de `git checkout --detach 22d58021` koşuldu; worktree işçinin dalından ayrıldı, hemen geri alındı. Kayıp olmadı ama işçi o an commit atsaydı dalsız kalırdı.

**How to apply:** sha'yı okumak için `git -C <wt> show <sha>:<yol>`; dosyaları bir arada çalıştırmak gerekiyorsa `git archive <sha> | tar -x -C <geçici-klasör>` ya da kendi geçici `git worktree add --detach`. İşçinin worktree'sinde yalnız okuma (status, log, diff). İlgili: [[feedback-trial-sources-and-drift]].
