# JOIN-013 Owner'ın employee kaydı: muafiyetler ve canlı senkron
Status: draft
Session: -   Branch: task/join-013   Worktree: yok   DB: KİLİT

Plan ID'leri: M5, E4 + kullanıcı kuralları 2026-09-21

Goal: Owner'ın employee kaydı diğerleriyle aynı yerde dursun, ama owner'ın doldurması beklenen şeyler ondan istenmesin.

## Kullanıcı kuralları (2026-09-21, karar verilmiş)
1. Owner kaydı workspace kurulduktan sonra otomatik oluşur. **YAPILDI** (`08c8aa4`)
2. Bütün lokasyonlarda ve bütün işlerde çalışabilir. **YAPILDI** — ama yalnız kurulum sırasında.
3. Varsayılan `is_excluded_from_schedule = false`, `is_remote = false`. **YAPILDI**
4. **Sonradan yeni bir job ya da lokasyon eklenirse owner kaydı otomatik güncellenmeli.** EKSİK.
5. Owner'ın **primary job'ı yoktur** ve drawer'da primary job owner için **zorunlu değildir**.
6. Emergency contact drawer'dan elle girilebilir ama owner için **zorunlu değildir**.
7. Workspace'in onboarding'de istediği belgeler, ne zaman eklenirse eklensin, **owner için zorunlu değildir**. Owner'ın drawer'ındaki Documents sekmesinde listelenir ama document settings "required" dese bile owner hariç tutulur.

In scope: 4, 5, 6, 7.
Out of scope: owner dışındaki rollerin muafiyeti; belge şablonlarının kendisi.
Done when: yeni lokasyon/iş eklenince owner kaydı kendiliğinden kapsar; owner drawer'ında primary job ve emergency contact zorunlu değil; required belgeler owner'ı bloklamıyor ama listede görünüyor; her madde pgTAP ya da Vitest ile sabitli.
Touches: `supabase/migrations/*`, lokasyon/iş ekleme servisleri ya da tetikleyici, `EmployeeDrawer`, belge zorunluluk hesabı.
Risk: belge zorunluluğu onboarding ve uyumluluk yüzeylerine bağlı; muafiyeti tek yerde hesaplayıp her yüzeyin oradan okuması gerekir.

## Notes / Result
