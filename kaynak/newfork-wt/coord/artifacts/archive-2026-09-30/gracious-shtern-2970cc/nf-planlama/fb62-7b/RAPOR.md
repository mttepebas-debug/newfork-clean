# nf-planlama — FB-6.2 .7b / .7b-db onayları (2026-09-30)

Dal task/backlog-program-28, taban ca89c1f9, commit 66458b23 (push yok). Açık 227 → 231.

- G7: .7b-db son ONAY @62a611b6 (CI 36623860474 success, doğrulandı); .7b ONAY @893cc89f şartlı (B1 eski migration kopyası 90d91cf7 bırakılır; task/batch-t5c CI 36624620235 in_progress, 42d1dbb9); KK-37.
- Yeni: BL-419 (B2 taslak workspace'te owner API'den davet; karar gerekli, öneri kabul), BL-420 (B3 davet bağlantısı hata mesajı; BL-401 ile birlikte karar), BL-421 (B4 role_name === "Owner", EmployeeDrawer.tsx:1059/:3060), BL-422 (Hub'da kaydı olmayan owner'a "Ask an admin", NoAccessState.tsx:29, kanıt hub-owner-desktop.png; .8). Çakışma yok.
- BL-416'ya durum: tek yardımcı ve :229 dalda düzeldi; açık kalan sayaç kalıbı ve coverage:110.
- Kullanıcıya dönüşte: ultrareview önerisi (0) FB-6.2 .7b (davet/katılım yüzeyi).
- Not: .7b görsel QA'sının RAPOR.md'si yok (klasörde yalnız ekran görüntüleri); Hub notu ekran görüntüsüyle doğrulandı.

Kanıt: say.py → acik 231 = program 231, kopya/fark yok, max BL-422.
