---
name: web-test-load-traps
description: Why web/api vitest tests fail only under a whole-repo run — RTL's 1 s findBy default, lazy-route first load, forms filled by an effect, api's missing config; and that Git Bash ignores TZ for node
metadata:
  type: reference
---

2026-09-29, G13 işçisi (`task/g13-test-stability`).

- **Testing Library `findBy`/`waitFor` varsayılanı 1 sn**, vitest'in `testTimeout`'u (web 20 sn) değil.
  Yükte düşen web testinde önce buna bak. `App.test.tsx`, `EmployeeOnboardingPage.test.tsx`,
  `ScheduleRequestsPage.test.tsx` dosya başında `configure({ asyncUtilTimeout: 5000 })` taşıyor; web
  geneli için tek ayar `apps/web/vite.config.ts` `setupFiles` ister (nf-test'in dosyası değil).
- **Tembel rota ilk ziyarette modülünü derler**; yükte 5 sn'yi geçer. Sayfa başlığı beklemesine açık
  süre ver (`App.test.tsx` `lazyRoute`), testin kendi sınırı beklemelerin toplamından büyük olsun.
- **Formu effect'le dolduran ekran** (Employees çekmecesi, `EmployeeDrawer.tsx` taslak effect'i):
  veri gelir gelmez çizilen ilk karede form boştur. O karede tıklamak boş formu "düzenlenmiş" yapar,
  effect artık doldurmaz. Tıklamadan önce formun dolduğunu bekle (`employeeLoaded()`).
- **Geç dönen cevap** yarışını her koşuda üretmek için mock'u bilerek geciktir
  (`setTimeout(…, 300)`), sonra sonucu `waitFor` ile bekle (BL-175).
- **apps/api** artık `vitest.config.ts` taşıyor (20 sn); tsconfig'e ekleme: `build` tsc ile src'den
  yayar, rootDir kayar.
- **Saat dilimi denemesi:** Git Bash'te `TZ=… node` yok sayılıyor (makine dilimi kalıyor);
  PowerShell'de `$env:TZ='Asia/Tokyo'` çalışıyor.

İlgili: [[e2e-flow-patterns]].
