# G6 — Bildirim teslimi: kararlar (2026-09-29, işçi oturumu nf-db)

Kapsam: BL-099'un teslim kısmı ve BL-119 (KK-11, KK-16). Dal `task/g6-notification-delivery`,
migration `supabase/migrations/20260929160000_a_preferred_name_notice_reaches_its_deciders.sql`,
test `supabase/tests/preferred_name_approval.test.sql`.

## Kararlar

1. **Alıcılar yetki çekirdeğinden.** Bildirim, çekirdeğin `employee.decide_preferred_name`
   eylemine izin verdiği aktif üyelere gider (`app_private.authz_reason(..., target_person) is null`).
   Bu tek kural kapsamı (yönetici kişinin lokasyonunu yönetiyor), rütbeyi (`rank_below`) ve
   kişinin kendisini (`no_self`) birlikte uygular; satır içi kapsam mantığı yazılmadı.
   Örnek: Kadıköy'de çalışan Ali ad isterse sahip, admin ve Kadıköy yöneticisi alır; Beşiktaş
   yöneticisi, iş arkadaşı ve Ali almaz. Admin Zeynep kendi adını isterse yalnız sahip alır.
2. **"auto" modunda da aynı kişiler.** Kimse onaylamasa da ad değişikliği aynı kişilere
   bildirilir (katalogda iki türün hedef kitlesi aynı: `workspace_employee_access_managers`).
   Gerekçe: iki ayrı kural ikiz olurdu; "kim bu kişinin adına karar verir" sorusunun cevabı
   modla değişmiyor.
3. **Alıcı yoksa bildirim yazılmaz.** Sahibin kendi adı: kimse karar vermiyor, kimseye
   söylenmez (örnek: `20260927130000_owner_time_off_tells_managers.sql` da alıcısız bildirim
   yazmıyor).
4. **Lokasyon bağlamı verilmedi.** Kuyruk kaydına `location_ids` konmadı; konursa bildirim
   çözücüsü (`resolve_notification_policy_v1_service`) eski üyelik kapsamı tablosuyla ikinci
   bir kapsam kontrolü yapardı. Alıcıyı çekirdek zaten seçti.
5. **Politika satırı gerekmedi.** `notification_org_policies`'te satır yokken çözücü
   "organization_default" ile izin veriyor; testte bildirim üç alıcının gelen kutusuna düşüyor.
6. **Bağlantı Employees'te kişinin kaydını açar:** `/app/employees?employeeId=<id>`. Katalogdaki
   izinli sorgu anahtarı `employee` idi, ekran `employeeId` okuyor; iki satır `employeeId`'ye
   düzeltildi (bildirim açılınca doğru çekmece açılsın diye; işin önündeydi).
7. **Metin (UI, İngilizce; nf-arayuz gözden geçirebilir):**
   - onay bekliyor: başlık "Preferred name to review", gövde `Ali Person asked to go by "Al".`,
     önizleme "A preferred name is waiting for review."
   - kendiliğinden geçti: başlık "Preferred name changed", gövde `Bob Person now goes by "Rob".`,
     önizleme "A preferred name changed."
   Önizleme isim taşımaz (katalog hassasiyeti `confidential`).
8. **Üretici kaydı ve şablon:** iki tür için `notification_producer_registry` (producer
   `preferred-name-request`) ve yayımlanmış in-app şablonu eklendi; bildirim sağlık kontrolü
   (`reconcile_notification_platform_service`) artık bu iki türü "üreticisiz/şablonsuz" saymıyor.
9. **Yeni `*_service` yok, imza aynı.** `request_employee_preferred_name_service` yeniden
   tanımlandı (imza ve dönüş aynı, kapsam sınıfı `employee.request_preferred_name` aynı);
   API dosyalarına dokunulmadı.

## Ek görev (KK-17): BL-342 ve BL-343
Migration `supabase/migrations/20260929161000_an_approved_name_is_told_and_availability_has_its_producer.sql`.

10. **Onayda kişiye bildirim (BL-342).** Yönetici adı onaylayınca yeni tür
    `people.preferred_name.approved` yalnız kişinin kendi hesabına gider: başlık "Preferred name
    approved", gövde `You now go by "Al".`, önizleme "Your preferred name was approved."
    Ret sessiz kalır. Kişi kendi talebini kendisi onaylarsa (bugün sahip eski kapıyla
    yapabiliyor) kendine bildirim yazılmaz. `decide_employee_preferred_name_service` yeniden
    tanımlandı; yetki kapısına dokunulmadı (G7).
11. **Onay bildiriminin bağlantısı `/app`.** Kişinin adını gördüğü yer Account → Profile
    (`/account/profile`), ama bildirim bağlantısı `/app` ile başlamak zorunda (katalog CHECK'i ve
    gelen kutusu `/app` dışını katalog rotasına çeviriyor). `/app` kişiyi kendi ana ekranına
    götürür. Profile'a doğrudan açmak için web'de `/app/account/documents` gibi bir yönlendirme
    gerekir; Account dosyaları bu turda yasak, ayrı iş.
12. **`availability.status_changed` üretici kaydı (BL-343).** Üretici
    `weekly_preference_settings_save_service` (giriş modu değişince "Check your availability"),
    `source_migration` onu son tanımlayan `20260924204854_old_availability_is_gone.sql`.
    `account_notification_scope.test.sql` 36/36 yeşil, `ci-green.txt`'e eklendi.

Kanıt (geri alınan işlem, db.lock nf-db/isci-g6, 05:03–05:07): iki migration olmadan
preferred_name_approval 3 kırmızı (onay hücreleri), account_notification_scope 1 kırmızı; ikisiyle
25/25 ve 36/36. 48 etkilenen + çekirdek dosya: migration'sız koşuya göre yalnız düzelme, yeni
kırmızı yok; DB sayaçları önce/sonra aynı.

## Kapanış önerisi (main'e alınınca)
- BL-342 ve BL-343: kapanır.
- BL-099 teslim kısmı: kapanır. Yetki kısmı (decide/list → `authorize`, `no_self`) G7'de açık.
- BL-119: kapanır; test artık gelen kutusuna düşen satırı ve alıcı listesini sayıyor.

## Yolda bulunanlar (dokunulmadı)
- **G7 için:** "manager" modunda sahibin kendi ad talebi, G7 `no_self` getirince kimsenin
  onaylayamayacağı bir bekleyen talep olur (bugün sahip eski kapıyla kendi talebini onaylıyor).
  G7'de ya sahip talebi otomatik geçmeli ya da ürün kararı sorulmalı.
- (BL-342 ve BL-343 olarak bu dalda kapandı; yukarıda.)
- Account → Profile'a doğrudan açan bildirim bağlantısı için web yönlendirmesi yok (karar 11).
- `bl052_document_onboarding.test.sql` 25. hücre bir kez 2≠1 verdi, 6 tekrarda yeşil:
  kararsız (tek işlemde sabit `now()` sıralaması olabilir).
