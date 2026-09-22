# JOIN-013 Owner'ın employee kaydı: muafiyetler ve canlı senkron
Status: devam ediyor (2026-09-22); 4 ve 5 yapıldı, 6 ve 7 kaldı
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
- **2026-09-22 madde 4 yapıldı.** Migration `20260922020000_new_places_reach_the_owner`: `locations` ve `jobs` üzerine insert tetikleyicileri (+ arşivden geri alma tetikleyicileri) owner'ın kaydını yeni yere açıyor. Kurulum bittikten sonra eklenen bir lokasyon ya da iş, onu ekleyebilen tek kişinin oraya atanamamasına yol açıyordu.
- **2026-09-22 madde 5 yapıldı.** Migration `20260922030000_the_owner_can_edit_their_own_record`. Ölçümde çıkan asıl engel: `can_manage_employee_record` bir owner'ın **access_class'ı owner olmayan** herkesi yönetmesine izin veriyor, yani workspace'te hiç kimsenin dokunamadığı tek kayıt owner'ınkiydi — owner dâhil. İki dar değişiklik:
  1. Owner kendi kaydını kaydedebilir (`user_id = actor_id`). Yetki yükseltmesi değil: rol `workspace_memberships`'te duruyor ve bu fonksiyon ona dokunmuyor. Başkası hâlâ owner kaydını düzenleyemiyor.
  2. Owner kaydı primary lokasyon/iş istemiyor — her lokasyonu ve her işi taşıdığı için birini primary seçmek bir şey söylemiyor, istemek ise kaydın hiç kaydedilememesine yol açıyordu.
  - İstemci tarafı: `employeeInputSchema`'ya `is_owner_record` bayrağı; sunucu zaten kendi kararını veriyor, bayrak yalnız formun önce reddetmesini engelliyor.
- **Kalan 6 ve 7 için not:** madde 6 (emergency contact drawer'dan girilebilsin, owner için zorunlu olmasın) `employee_private_profiles`'a yazma yolu gerektiriyor; bugün onu yalnız employee onboarding yazıyor. O yazma yüzeyi JOIN-011'de ("kendi istihdam kaydın") açılıyor — madde 6 oraya bağlanmalı, yoksa iki ayrı yazma yolu çıkar.
- **Kanıt:** `owner_employee_record` 13/13 (ikisi yeni: sonradan eklenen lokasyon ve iş owner'a ulaşıyor), `workspace_rls` 120/120 (eski "owner kaydı düzenlenemez" assert'i ikiye ayrıldı: owner kendi kaydını düzenleyebilir, admin düzenleyemez), `workspace_lifecycle` 21/21, `typecheck`/`test` PASS.

