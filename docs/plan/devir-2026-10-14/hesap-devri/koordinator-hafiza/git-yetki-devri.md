---
name: git-yetki-devri
description: Mert commit, push, merge, worktree ve dal yönetimini 2026-10-09'da tamamen Claude'a bıraktı; ona git onayı sorulmaz
metadata:
  type: feedback
---

Mert, 2026-10-09 03:46Z: "ben commit push merge worktree ve branch yönetemiyorum. bu görevi koordinator olarak sana veriyorum".

**Why:** Mert git bilmiyor; git soruları onu durduruyor.

**How to apply:** Git kararlarını (dal, push, tren, birleştirme sırası) Claude kendisi verir; CLAUDE.md akışı (main'e yalnız tren) geçerli. Mert'e yalnız ürün kararı ve geri alınamaz canlı adım sorulur. Not: bulut oturumunda main'e doğrudan push'u (NF_OVERRIDE) izin denetimi engelliyor; main'e giriş Remote Control thread'inin treniyle. İlgili: [[project-koordinator-modeli]].
