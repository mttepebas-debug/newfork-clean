---
name: docs-commit-yalniz-adli-dosya
description: docs commit'inde yalnız adıyla `git add <dosya>`; `commit -a` ve `-c core.autocrlf=false` yok — 173 dosyanın satır sonu değişti, main CI tetiklendi
metadata:
  type: feedback
---

Docs commit'inde dosyalar adıyla eklenir (`git add docs/plan/<dosya>`); `git commit -a` / `-am` ve
`core.autocrlf` ezmesi kullanılmaz. Gönderimden önce `git diff --stat origin/main...HEAD` yalnız
amaçlanan dosyaları göstermeli; `docs/` dışı bir satır varsa durulur.

Neden: 2026-10-06 `6660fa91` (SABAH S23 taşıması) `git -c core.autocrlf=false commit -qam` ile
173 dosyanın (betik, ayar, e2e) satır sonunu değiştirdi; kod yolu değiştiği için iki main CI koşusu
izinsiz tetiklendi (koordinatör iptal etti). İleri düzeltme `611311cd`: her dosya önceki blob'una döndü.
CRLF taşıyan dosyayı düzenlerken satır sonu korunur (python `splitlines(keepends=True)`, ikili yazım).
