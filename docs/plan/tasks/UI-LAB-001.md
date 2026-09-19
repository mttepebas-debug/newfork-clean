# UI-LAB-001 UI Lab: tıklanabilir parçaların DEV-only envanteri, galerisi ve canlı stil editörü
Status: kapatıldı (2026-09-18 kullanıcı kararı: ertelendi, kullanılmıyor)
Session: "THEME-005: ikincil buton cascade düzeltmesi" (local_739c4385; aynı worker, bağlam ve tarama altyapısı hazır)   Branch: task/ui-lab-001 (main'den)   Worktree: newfork-wt/ui-lab-001   DB: -   Port: web 5559 (API 5556)
Öneri: Opus 5, high (session şu an Fable 5.1 / max; maliyet kararı kullanıcıda).
Plan (bağlayıcı, tamamı okunur): `C:/Users/TheWe/.claude/plans/snuggly-humming-dusk.md`.

Goal: Uygulamadaki ~1.300 etkileşimli öğeyi gerçek görünümüyle tek yerde görmek, konum / işlev / renk olarak gruplayıp Ctrl+click Inspector ile incelemek ve stil değerlerini canlı deneyip kaydetmek/kopyalamak. Çıktısı buton dilini birleştirme işinin (F4, ayrı task) ve THEME-005 kararlarının girdisidir.

Kullanıcı kararları (2026-09-17): lab'da yalnız görsel davranış (animasyon, renk/boyut, durum değişimi); tarama hem development identity hem kullanıcının kendi oturumuyla (parolayı yalnız kullanıcı girer); THEME-005 lab'ın F2'sini bekler.

Fazlar (ayrıntı planda): F1 temel (etiketleme plugin'i, statik envanter, lab kabuğu, harvest, Inspector bilgi + "Uygulamada aç"); F2 editör (canlı düzenleme, kaydet/kopyala; sonunda THEME-005 kararları lab'da verilir); F3 derin tarama (güvenli otomatik keşif, durum kaydı, mobil viewport). F4 birleştirme bu task'ın DIŞINDA.

Koordinatör sınırları:
- Yalnız DEV: `import.meta.env.DEV` ve `VITE_UI_LAB=true`. Bayrak kapalıyken DOM, dev hızı ve production bundle değişmez; `dist` içinde `ui-lab` araması boş olmalı. Production bileşenlerine etiket elle eklenmez; etiketleme yalnız Babel plugin'iyle.
- Yeni bağımlılık yok. API ve DB'ye dokunulmaz.
- Git'e kişisel veri girmez: harvest verisi tarayıcıda kalır; `inventory.generated.json` gitignore; ekran görüntüleri `artifacts/` (commit edilmez).
- Güvenli keşif kanıtı zorunlu: tarama boyunca API'ye non-GET istek gitmediği (bekletilen istek günlüğü + API log) ve local DB satır sayılarının tarama öncesi/sonrası aynı olduğu raporda yer alır. İstisna listesi (auth token, `read_role_workspace`) dışına çıkılmaz.
- Faz başına merge: her faz yeşil ve kullanıcıya gösterilmiş olunca main'e alınır (uzun yaşayan branch yok). Sıra: rebase → testler → koordinatör ff-merge → CI izlenir.
- Ortak dosyalar: `App.tsx` DEV route bloğu, `main.tsx` DEV bloğu, `vite.config.ts`, `package.json`, `.gitignore`. `main.tsx` DEV bloğu THEME-005 branch'inde de değişiyor; THEME-005 rebase'inde elle birleştirilir.
- MVP yolu bu task'ı beklemez (OPS-015, smoke, OPS-013/014, F1 task'ları bağımsız). F1 sonunda kullanıcıyla devam/dur kontrol noktası.

Done when (faz bazında): plandaki faz kriterleri + birim testler (plugin, envanter, gruplama, fetch guard, specimen sanitize) + bayrak kapalı `typecheck`, `build`, `light-theme.test.ts` PASS + faz sonu gösterimi (5559) + rapor.
Test plan: plandaki "Doğrulama" bölümü.
Risk: kapsam büyüklüğü ve süre; `display: contents` sapmaları; tarama süresi; CSS sıra farkı (planda ayrıntılı).

## Notes / Result
- 2026-09-18 kapanış: kullanıcı "UI Lab şu an için ertelendi, onu hiçbir şekilde kullanmıyoruz" dedi; akıbeti için "yedekle ve kapat" seçildi. Branch `origin/task/ui-lab-001` @ 482d2c8 uzak yedekte (12 commit, 0 unpushed). Worktree kaldırıldı, local branch silindi. Geri dönülürse uzak branch'ten açılır; F2 editörü ve F3 derin tarama hiç yazılmadı.
