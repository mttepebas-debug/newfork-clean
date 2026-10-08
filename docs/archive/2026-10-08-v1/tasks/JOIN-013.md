# JOIN-013 Owner'ın employee kaydı: muafiyetler ve canlı senkron
Status: bitti (2026-09-22); 4, 5, 6, 7 yapıldı
Session: -   Branch: task/join-013b   Worktree: yok   DB: KİLİT

Plan ID'leri: M5, E4 + kullanıcı kuralları 2026-09-21

Goal: Owner'ın employee kaydı diğerleriyle aynı yerde dursun, ama owner'ın doldurması beklenen şeyler ondan istenmesin.

## Kullanıcı kuralları (2026-09-21, karar verilmiş)
1. Owner kaydı workspace kurulduktan sonra otomatik oluşur. **YAPILDI** (`08c8aa4`)
2. Bütün lokasyonlarda ve bütün işlerde çalışabilir. **YAPILDI** — ama yalnız kurulum sırasında.
3. Varsayılan `is_excluded_from_schedule = false`, `is_remote = false`. **YAPILDI**
4. **Sonradan yeni bir job ya da lokasyon eklenirse owner kaydı otomatik güncellenmeli.** **YAPILDI** (`20260922020000`)
5. Owner'ın **primary job'ı yoktur** ve drawer'da primary job owner için **zorunlu değildir**. **YAPILDI** (`20260922030000`)
6. Emergency contact drawer'dan elle girilebilir ama owner için **zorunlu değildir**. **YAPILDI** (`a73578a`)
7. Workspace'in onboarding'de istediği belgeler, ne zaman eklenirse eklensin, **owner için zorunlu değildir**. Owner'ın drawer'ındaki Documents sekmesinde listelenir ama document settings "required" dese bile owner hariç tutulur. **YAPILDI** (`9fa2dff`)

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

- **2026-09-22 madde 6 yapıldı** (`a73578a`). Kullanıcı netleştirdi: bu yalnız **employer/owner kaydı** için; diğer herkes onboarding'de ya da account sekmesinden giriyor, o yüzden JOIN-011'e bağlanmadı. Migration `20260922040000_the_owner_can_leave_an_emergency_contact`: `employee_private_profiles.phone` nullable oldu (tablo yarım satır kabul etmiyordu, o yüzden hiçbir yere yazılamıyordu) ve `save_owner_emergency_contact_service` eklendi — iki koruma: kayıt aktörün kendisinin değilse 42501, aktör workspace'in owner'ı değilse reddet; yalnız `service_role` çalıştırabiliyor. Owner satır girene kadar hiçbir şey uydurulmuyor.
- **2026-09-22 madde 7 yapıldı** (`9fa2dff`). Riskte yazan "muafiyeti tek yerde hesapla" aynen uygulandı: muafiyet `employee_onboarding_requirements` üzerindeki **tek bir before-insert tetikleyicisinde** (`z_owner_documents_arrive_excused`) veriliyor, yüzey başına değil. Atamanın iki yolu da oradan geçiyor: onboarding anlık görüntüsü ve bir tanım sonradan yayınlandığında kaydı yakalayan `document_reconcile_employee`. Uygulamanın kendi sözcüğü kullanıldı — `lifecycle_exempt`, 28 fonksiyon zaten okuyor — yani belge listede duruyor ama 'exempt' durumunda: aktivasyonu bloklamıyor, bildirim üretmiyor, vardiya engeli saymıyor.
  - `app_private.employee_record_is_workspace_owner` artık "bu kayıt owner'ın mı" sorusunun tek tanımı. Aynı testin RLS fonksiyonlarındaki dört satır-içi kopyası, draft lifecycle değişikliğinin kendi kapısından sızmasının sebebiydi.
  - `set_employee_document_exemption_service` owner'ın muafiyetini **kaldıramıyor** (42501); obligation payload'ı `exemption_locked` taşıyor, drawer da basınca hata verecek butonu göstermek yerine sebebi yazıyor.
  - **Bilinçli sınır:** `lifecycle_exempt` yükleme yolunu da kapatıyor (`submit_employee_document_lifecycle_service` 'document obligation is closed' diyor). Yani owner kendi belgesini gönüllü olarak yükleyemiyor. Kural bunu istemiyordu; isterse ayrı bir iş.
- **Kanıt (6 ve 7):** `owner_employee_record` **22/22** (dokuzu yeni). 7 için beş yeni assert: herkese sorulan belge owner'ın kaydına **ulaşıyor**, 'missing' değil **'exempt'** geliyor, `document_activation_blocked` false, aynı belge **başka herkesten hâlâ isteniyor**, ve muafiyet geri alınamıyor. Tetikleyici düşürülüp geri konarak A/B yapıldı: 15 `bl052_document_*` + `document_publication` + `document_types_rls` + `employee_onboarding_rls` + `employee_hub` sonuçları **bayt bayt aynı** (oradaki kırmızı BL-070, yerel DB kayması). `pnpm test` 1560 passed / 1 skipped.

