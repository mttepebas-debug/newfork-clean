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

## Kapanış önerisi (main'e alınınca)
- BL-099 teslim kısmı: kapanır. Yetki kısmı (decide/list → `authorize`, `no_self`) G7'de açık.
- BL-119: kapanır; test artık gelen kutusuna düşen satırı ve alıcı listesini sayıyor.

## Yolda bulunanlar (dokunulmadı)
- **G7 için:** "manager" modunda sahibin kendi ad talebi, G7 `no_self` getirince kimsenin
  onaylayamayacağı bir bekleyen talep olur (bugün sahip eski kapıyla kendi talebini onaylıyor).
  G7'de ya sahip talebi otomatik geçmeli ya da ürün kararı sorulmalı.
- **Onayda bildirim yok:** yönetici onaylayınca kişiye bir şey söylenmiyor (ret bilerek sessiz).
  Ürün kararı; BL-099 tazeliğinde not edilmiş.
- `account_notification_scope.test.sql` (ci-green'de değil): kalan tek kırmızı
  `availability.status_changed` üreticisiz (bu işten önce de vardı).
- `bl052_document_onboarding.test.sql` 25. hücre bir kez 2≠1 verdi, 6 tekrarda yeşil:
  kararsız (tek işlemde sabit `now()` sıralaması olabilir).
