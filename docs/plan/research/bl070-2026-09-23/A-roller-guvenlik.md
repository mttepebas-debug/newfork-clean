# Alan A — Roller ve güvenlik (BL-070 derin araştırma)

Ölçüm: 2026-09-22, main `41783c7`, ortak yerel veritabanı (`supabase_db_newfork-clean`). Bütün denemeler tek transaction içinde yapıldı ve `rollback` ile geri alındı; her denemeden sonra canlı tanımın değişmediği ayrıca kontrol edildi. Hiçbir dosya, migration ya da git durumu değiştirilmedi.

Kısa sözlük (raporda tekrar tekrar geçenler):
- **pgTAP testi**: veritabanına "şu kural hâlâ geçerli mi" diye soran otomatik kontrol dosyası. "Kırmızı" = kural bugün tutmuyor.
- **SECURITY DEFINER fonksiyon**: veritabanında, çağıranın değil sahibinin yetkisiyle çalışan fonksiyon. Kapıyı kendisi kontrol etmezse duvarı delen bir kapıdır.
- **RLS**: satır düzeyinde güvenlik; "Ali yalnız Kadıköy satırlarını görsün" gibi kuralların veritabanındaki hâli.
- **Kapsam (scope)**: manager'ın hangi lokasyonlara yetkili olduğu. Bugün manager'ın kendi employee kaydındaki lokasyonlardan otomatik türetiliyor.

---

### function_execute_privileges

**Ekrandaki karşılığı:** Settings → Roles & permissions ekranı (solda rol listesi, sağda izin kategorileri). Ekran açılırken rol listesini tarayıcı doğrudan veritabanından okuyor (`apps/web/src/settings/roles-data.ts:55`, fonksiyon `public.read_role_workspace`). Kaydet/sil ise API'den geçiyor (`apps/api/src/settings/roles-routes.ts`: yalnız POST/PUT/DELETE var, okuma yolu yok).

**Test ne iddia ediyor (kırmızı kontroller):** #3 "authenticated cannot execute public SECURITY DEFINER functions" — oturum açmış herhangi bir kullanıcının çağırabildiği, sahibinin yetkisiyle çalışan hiçbir `public` fonksiyon olmamalı. Bugün 1 tane var: `read_role_workspace(uuid)`. (#1 anonim, #2 PUBLIC için aynı kural; yeşil.)

**Eski davranış:** 2026-09-08 `20260908132000_harden_public_function_execute_privileges.sql` bütün `public` fonksiyonların çağrı iznini kapattı ("Lock down the implicit RPC surface for SECURITY DEFINER functions"). Kural: tarayıcı veritabanı fonksiyonu çağırmaz; iş API'den geçer, API servis anahtarıyla `_service` fonksiyonlarını çağırır. Senaryolar:
- Owner Mert Settings → Roles'u açar → (o tarihte bu ekran yoktu) — rol okuma yolu yok.
- Employee Ayşe elindeki oturum anahtarıyla bir definer fonksiyonu elle çağırmaya çalışır → izin yok, reddedilir.

**Ne değişti:** 2026-09-14 `fc2c4da` ("feat: checkpoint roles and account progress"), `20260914092711_bl051_roles_permissions.sql:205-206`: `grant execute on function public.read_role_workspace(uuid) to authenticated`. Yazılı gerekçe yok. Sonradan iki yerde not düşülmüş: `docs/plan/BACKLOG.md:61` ("Hosted advisor: … authenticated RPC ile çağrılabiliyor; kasıtlı mı kontrol et") ve `docs/plan/tasks/OPS-010.md:60` (Supabase güvenlik danışmanı uyarısı).

**Yeni davranış:** Oturum açmış herkes bu fonksiyonu çağırabiliyor. Fonksiyonun kendi kapısı var (`roles.read` izni yoksa 42501 "role read access denied"), yani bugün veri sızmıyor.
- Owner Mert Settings → Roles'u açar → tarayıcı fonksiyonu doğrudan çağırır, liste gelir.
- Employee Ayşe fonksiyonu elle çağırır → fonksiyon içindeki kapı reddeder (sızıntı yok, ama kapı tek katmana indi).
- Başka workspace'in owner'ı Mert'in workspace id'siyle çağırır → yine içerideki kapı reddeder (roles testi #22 bunu doğruluyor).

**Hedefe göre doğrulama:** Hedef modelde bu konuda doğrudan hüküm yok; ama projenin kendi mimari kuralı (tarayıcı → API → servis) ve uygulamanın geri kalanı (web'de başka hiçbir `.rpc(` çağrısı yok — tarandı) eski davranışı destekliyor. Bu tek istisna kasıtlı bir karar gibi değil, rol ekranı yazılırken kestirme yol. Uygulamayı yanlış yöne sürüklemiyor ama "güvenlik iki katman" kuralını tek fonksiyonda deliyor ve danışman uyarısını kalıcı yapıyor.

**Kanıt:**
- Deneme: canlı DB'de `has_function_privilege('authenticated', …)` sorgusu → yalnız `read_role_workspace(uuid)` (1 satır).
- Kod okuma: `roles-data.ts:55`, `roles-routes.ts` (GET yok), migration `20260914092711…:192-206`, `20260908132000…:1-8`.
- Web'de tek doğrudan rpc olduğu: `apps/web/src` içinde `.rpc(` taraması → yalnız `roles-data.ts:55`.

**Önerilen karar:** Repo düzelsin. (leave: medium / do: moderate)
- Okumayı API'ye taşı: `GET /v1/workspaces/:id/roles` (izin: `roles.read`) + `read_role_workspace_service(actor, workspace)`; `authenticated` grant'i kaldır, eski fonksiyonu sil.
- Yazmalar zaten API'de; okuma da oraya gelince ekran tek yoldan konuşur.
- Yan etki: `roles_permissions_rls` #21 ("Role editor reports real pending impact") ve #22 ("Cross-tenant role reads denied") bu fonksiyonu tarayıcı kullanıcısı gibi çağırıyor; servis sürümüne çevrilmeleri gerekir.
- Diğer seçenek ne zaman doğru olurdu: tarayıcının rol listesini doğrudan okuması bilinçli bir performans kararı olsaydı; o zaman bile SECURITY INVOKER + tablo RLS'i gerekirdi (bugünkü sayaçlar — üye sayısı, bekleyen davet — RLS'le temiz okunamıyor), yani daha pahalı.

**Önceki karar ile karşılaştırma:** Aynı kalmalı (REPO — okuma API'ye, grant kaldırılsın).

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** yok.

**Kullanıcıya sorular:** yok.

---

### tenant_owned_composite_foreign_keys

**Ekrandaki karşılığı:** Doğrudan ekranı yok. Bir işletmenin (workspace) kaydının başka işletmenin kaydına bağlanamamasını veritabanı düzeyinde garanti eden kural. Örnek: Meyhouse'daki bir üyeliğin, başka bir işletmedeki "Ayşe" employee kaydını "benim kaydım" diye göstermesi.

**Test ne iddia ediyor (kırmızı kontroller):** #1 "tenant-owned public table foreign keys include workspace_id when the referenced table is tenant-owned" — işletmeye ait bir tablo başka bir işletmeye ait tabloya bağlanıyorsa, bağlantı işletme kimliğini de içermeli. Bugün 11 bağlantı içermiyor:

| Bağlantı | Ne işe yarar | Eklendiği migration / tarih |
|---|---|---|
| `workspace_memberships.employee_id` | üyeliğin "bu kişinin employee kaydı" bağı | `20260921100100_join_lifecycle_model` (09-21) |
| `employee_preferred_name_requests.employee_id` | "tercih ettiğim ad" talebi | `20260922110000` (09-22) |
| `employee_create_commands.employee_id`, `.invitation_id` | employee ekleme komutunun tekrar koruması | `20260909001000` (09-09) |
| `schedule_shift_batch_commands.session_id` | toplu vardiya oluşturma komutu | `20260909042400` (09-09) |
| `weekly_preference_commitment_decisions.event_id` | haftalık müsaitlik kararı | `20260909041800` (09-09) |
| `lineup_receipts.snapshot_id`, `lineup_notification_outbox.snapshot_id` | Line Up paylaşım makbuzu/bildirimi | `20260909000000` (09-09) — Line Up kapsam dışı |
| `time_off_cancellation_periods.request_id` | izin iptal talebinin dönemleri | `20260909020001` (09-09) |
| `employee_onboarding_requirements.submitted_document_id`, `.approved_document_id` | onboarding belgesinin gönderilen/onaylanan sürümü | `20260915235543_bl052` (09-15) |

**Eski davranış:** 2026-09-08 `20260908170000_tenant_owned_composite_foreign_keys.sql` bütün bağlantıları "(id, workspace_id)" çiftine çevirdi; `docs/rebuild/onboarding-master-implementation-plan-2026-09-05.md:210,734` testin o gün geçtiğini yazıyor. Senaryolar:
- Bir servis hatası Meyhouse üyeliğini Employee Demo'daki bir kayda bağlamaya çalışır → veritabanı reddeder.
- Bir izin iptal dönemi başka işletmenin iptal talebine bağlanmaya çalışır → reddedilir.

**Ne değişti:** 09-09'dan 09-22'ye eklenen yeni tablolar/kolonlar kuralı izlemeden tek kolonlu bağlantıyla geldi. Yazılı gerekçe yok (hiçbir migration'da istisna notu yok; kural unutulmuş).

**Yeni davranış:** Veritabanı çapraz işletme bağını kabul ediyor. Bugün her yazma API servislerinden geçtiği için bu bir kod hatası olmadan tetiklenmez; kural "ikinci kilit".
- Deneme: Employee Demo'nun bir üyeliğini Meyhouse'daki bir employee kaydına bağladım → **kabul edildi** (geri alındı).
- Deneme: Employee Demo adına Meyhouse'daki bir employee için "tercih ettiğim ad" talebi → **kabul edildi** (geri alındı).
- Üç bağlantı (izin iptal dönemi, iki belge bağı) başka yoldan zaten korunuyor: dönem satırı başka bir bileşik bağla aynı işletmenin talebine kilitli; belge bağı "(belge, bu gereksinim)" çiftine bağlı ve belgeyi gereksinime bağlayan bağ işletmeyi içeriyor.

**Hedefe göre doğrulama:** Hedef "bir workspace = bir işletme, ayrı abonelik" diyor; işletmeler arası sızıntıya karşı veritabanı kilidi hedefle tam uyumlu. Eski davranış doğru yönde, yeni eklemeler kuralı unutmuş. Özellikle `workspace_memberships.employee_id` önemli: iniş/yetki kararlarında "bu üyelik hangi employee kaydı" sorusunun cevabı; yanlış bağ kapsam hesaplarını karıştırabilir.

**Kanıt:**
- Test koşusu: 1/2 kırmızı, 11 bağlantı (sorgu çıktısı yukarıdaki tablo).
- Deneme (geri alındı): iki çapraz bağ kabul edildi (yukarıda).
- Deneme (geri alındı): **11 bağlantının hepsi** bileşik hâle getirildi (gereken 3 yeni tekil anahtar: `weekly_preference_events(id, workspace_id)`, `schedule_lineup_snapshots(id, workspace_id)`, `time_off_cancellation_links(request_id, workspace_id)`; iki belge bağı için `employee_document_submissions` üzerinde gereken anahtar zaten var) → test **2/2 yeşil**. Mevcut verilerde uyumsuz satır yok (sayıldı: 0).
- PostgreSQL 17.6: "silinince yalnız employee_id'yi boşalt" (`on delete set null (employee_id)`) destekleniyor; üyelik ve komut bağlarındaki mevcut "set null" davranışı korunabiliyor.

**Önerilen karar:** Repo düzelsin — 11'inin hepsi, testte istisna listesi olmadan. (leave: medium / do: moderate)
- Üç "istisna"nın ikisi için gereken anahtar zaten var; üçüncüsü tek satırlık tekil anahtar. İstisna listesi testte bakımı gereken ikinci bir kural yaratır; tek kural "istisna yok" daha basit.
- Line Up'ın iki bağı: Line Up sadeleşirken bu tablolar kalkarsa sorun da kalkar; kalırsa aynı düzeltme.
- Diğer seçenek (8 repo + 3 testte istisna) şu durumda doğru olurdu: o üç bağı bileşik yapmak ek anahtar/performans maliyeti getirseydi. Getirmiyor.

**Önceki karar ile karşılaştırma:** Değişmeli: "8 repo + 3 istisna" yerine "11 repo, istisna yok". Deneme bunun mümkün olduğunu gösterdi.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** yok.

**Kullanıcıya sorular:** yok.

---

### onboarding_composite_tenant_constraints

**Ekrandaki karşılığı:** Ekranı yok; employee onboarding kayıtlarının (davet kabulünden sonraki adım adım kurulum: belgeler, onaylar, müsaitlik) başka işletmenin onboarding vakasına bağlanamadığını doğrulayan test.

**Test ne iddia ediyor (kırmızı kontroller):** #7 "availability cannot bind a case from another workspace" — Tenant A'daki bir müsaitlik kaydı Tenant B'nin onboarding vakasına bağlanmaya çalışınca "yabancı anahtar ihlali" (23503) beklenir. Bugün önce "each weekday must be provided once" (22023, "her gün bir kez verilmeli") hatası geliyor, çünkü test haftanın 7 gününü boş `{}` olarak veriyor.

**Eski davranış:** 09-05'te test yeşildi (`onboarding-master-implementation-plan-2026-09-05.md:734`). O gün müsaitlik haftasının içeriği doğrulanmıyordu; test sadece bağlantıyı sınıyordu.
- Tenant A kaydı B'nin vakasına bağlanır → 23503 ile reddedilir.

**Ne değişti:** 2026-09-07 `20260907095432_availability_publication_lock_and_validation.sql` müsaitlik yazılırken haftayı doğrulayan kuralı ekledi (`validate_availability_week`): 7 gün, her biri bir kez, geçerli mod/saat. Yazılı gerekçe: dosya adı ("publication lock and validation"); ayrıca yorum yok. Doğrulama doğru bir kural; test fixture'ı güncellenmemiş.

**Yeni davranış:** Geçersiz hafta, bağlantı kontrolünden önce reddediliyor. Aynı çapraz bağlantı geçerli bir hafta ile denenince bağlantı kilidi hâlâ çalışıyor.

**Hedefe göre doğrulama:** Bağlantı kilidi hedefle uyumlu, hafta doğrulaması da. Sorun yalnız testin bugün kurulamayan bir satır kurması. **Önemli ek bulgu:** kontrol #7'nin yazdığı tablo (`employee_availability_versions`, eski müsaitlik sisteminin onboarding kopyası) bugün canlı üründen yazılmıyor: tek yazan `availability_activate`, onu çağıran `availability_command_service` ve iki sarmalayıcıyı API'de hiçbir yer çağırmıyor (tarandı); tabloda 0 satır var. Bu, BL-091'in ("iki müsaitlik sistemi") parçası.

**Kanıt:**
- Test koşusu: #7 kırmızı, 22023.
- Deneme (testin kendi `rollback`'i ile): `'{}'×7` yerine geçerli 7 gün ("unrestricted") → **8/8 yeşil**.
- Kod okuma: `guard_availability_write` → `validate_availability_week` (22023); FK tetikleyicileri isim sırası nedeniyle `sync_onboarding_availability`'den önce çalışıyor, bu yüzden geçerli haftada 23503 geliyor.
- Canlı ürün yazmıyor: `apps/api/src` içinde `availability_command_service|save_onboarding_availability|save_employee_availability_v2` → 0 eşleşme.

**Önerilen karar:** Test düzelsin — ama BL-091'e bağlı. (leave: low / do: safe)
- BL-091 "eski sistem sökülsün" derse: kontrol #7 tabloyla birlikte silinir ("canlı veri yok" kuralı: yazılamayan tabloyu korumak için test tutulmaz).
- BL-091 "eski sistem kalsın" derse: fixture geçerli haftayla yazılır (tek satır).
- Diğer seçenek (repo) doğru olmazdı: kural doğru çalışıyor.

**Önceki karar ile karşılaştırma:** Özünde aynı (TEST), ama BL-091 kararı gelene kadar bekletilmeli; "sök" gelirse düzeltmek yerine silinir.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** yok.

**Kullanıcıya sorular:** yok (BL-091 sorusu zaten açık; bu dosya ona bağlı).

---

### roles_permissions_rls

**Ekrandaki karşılığı:** İki yer. (1) Settings → Roles & permissions: rol düzenleme, kim neyi verebilir. (2) Employees → bir kişinin kartı (EmployeeDrawer) → kaydet, "Terminate employee" düğmesi (`EmployeeDrawer.tsx:1260`). Ayrıca manager'a özel bir rol verildiğinde Settings sayfalarında (General, Locations) neler yapabildiği.

**Test ne iddia ediyor (kırmızı kontroller):**
- #30 "One shared location permits common employee record edit" — Kadıköy manager'ı, Kadıköy + Beşiktaş'ta çalışan bir kişinin ortak kaydını kaydedebilmeli.
- #35 "Operational Edit can terminate common record across locations" — aynı manager bu kişiyi işten çıkarabilmeli.
- #46 "Operational archive suspends linked employee …" — işten çıkarılan kişinin uygulama hesabı askıya alınmalı (#35'e bağlı).

**Eski davranış:** 2026-09-14 BL-051 (rol/izin sistemi, `fc2c4da`), tasarım belgesi `docs/rebuild/bl-051-roles-permissions-design-2026-09-14.md`. O günkü yazılı kararlar:
- "Bir ortak lokasyon yeterlidir: ilgili Edit yetkisi varsa başka lokasyonlarda da çalışan kişinin ortak kaydı üzerinde işlem yapabilir … arşivleme Edit'e dahildir."
- "Owner yetkilendirirse Admin alt rolleri yönetebilir."
- "General, Locations, … Manager'da varsayılan kapalı. Açıkça yetki verilirse organizasyon genelini etkileyen ayarlar açılabilir; etki kapsamı belirtilir."

Bu kararlarla `20260914102120_bl051_employee_membership_transitions.sql` üyelik tetikleyicisine (`enforce_membership_role_change` — üyelik satırı değişirken "bunu kim yapabilir" diye bakan veritabanı bekçisi) bir manager dalı ekledi: manager, kapsamındaki bir employee'nin hesabını askıya alabilir.
- Ali (Kadıköy manager'ı) Ayşe'yi (Kadıköy + Beşiktaş) işten çıkarır → izin verilir; Ayşe'nin hesabı askıya alınır; **Beşiktaş dahil** bütün gelecek yayınlı vardiyaları boşa çıkar.
- Ali, yalnız Kadıköy'de çalışan Can'ı çıkarır → izin verilir.
- Ali, owner Mert'i çıkarmaya çalışır → reddedilir (#31 yeşil).

**Ne değişti:**
- #35/#46: Aynı gün, aynı commit'te daha sonraki `20260914214056_account_workspace_owner_controls.sql` aynı tetikleyiciyi sahiplik devri için yeniden yazdı ve manager dalını **sessizce düşürdü**. Yazılı gerekçe yok; dosya yalnız sahiplik devrini anlatıyor. Bu bir kayıp güncelleme (regression), bilinçli karar değil.
- #30: 2026-09-21 `333c7c3` ("a name is asked once … first name, an optional middle name and a last name") kayıt fonksiyonuna "middle name" alanı ekledi; test eski imzayla çağırıyor. Gerekçe commit mesajında var ve doğru.

**Yeni davranış:**
- Ali, Ayşe'yi çıkarmaya çalışır → "membership role change is not permitted" hatası. **Uygulama hesabı olan her employee için** manager'ın "Terminate employee" ve arşivleme düğmesi hata veriyor; yalnız henüz davet edilmemiş (hesabı olmayan) kayıtlarda çalışıyor.
- Ali, yalnız Kadıköy'deki Can'ı çıkarır → yine hata (hesabı varsa).
- Ali, owner'ı çıkarmaya çalışır → reddedilir (değişmedi).
- Not: servis fonksiyonları çağıranın kimliğini veritabanı oturumuna yazdığı için (`perform set_config('request.jwt.claim.sub', actor…)`) bu hata üretimde de oluşur; yalnız testte değil.

**Hedefe göre doğrulama:**
- #30 (kayıt düzenleme): hedefle uyumlu. Kod, manager'ın kapsam dışı lokasyon eklemesini/silmesini engelliyor, Beşiktaş atamasını koruyor (#47 yeşil). Ama işin org-geneli parçaları (job'lar, ad, e-posta, başlama tarihi) Beşiktaş'ı da etkiliyor → aşağıda KAPSAM MODELİ SORUSU 2.
- #35/#46: Bugünkü kod hedefle de, BL-051 kararıyla da çelişiyor: manager kendi lokasyonundaki tek lokasyonlu bir çalışanı bile çıkaramıyor. Ama testin istediği şey (bir ortak lokasyon yeterli, çok lokasyonlu kişiyi çıkarabilir) D3 ile ve hedefin "manager yalnız kendi lokasyonları" ilkesiyle çelişiyor: işten çıkarma Beşiktaş vardiyalarını da boşa çıkarıyor (`terminate_employee` bütün gelecek yayınlı vardiyaları lokasyon filtresi olmadan bırakıyor), hesabı tüm işletmede askıya alıyor. Yani **eski de yeni de tam doğru değil**: eski çok geniş, yeni kırık. → KAPSAM MODELİ SORUSU 1.
- Kök nedenin ikinci yüzü: "manager bu kişiye erişebilir mi" kuralı veritabanında üç ayrı kopya halinde yazılı (`public.can_access_employee`, `public.can_manage_employee_record`, `public.service_actor_can_access_employee`) ve dördüncü, farklı anlamlı bir kopya (`app_private.can_access_employee`, rol sınıfına bakmıyor) hiçbir yerden çağrılmıyor (ölü kod). D3 gibi bir karar üç yerde ayrı ayrı değişmek zorunda.

**Kanıt:**
- Test koşusu (baseline): 47'de 3 kırmızı (#30, #35, #46).
- Deneme (geri alındı): #30'a middle name eklendi → #30 yeşil; #35/#46 hâlâ kırmızı.
- Deneme (geri alındı): üyelik tetikleyicisinin BL-051 sürümü (manager dallı) yerine konup test koşuldu → **47/47 yeşil**. Kanıt: kırmızının sebebi düşen dal. (Dikkat: o sürüm sahiplik devri dalını içermiyor; olduğu gibi geri konamaz, birleştirilmesi gerekir.)
- Deneme (geri alındı): manager, hesabı olan kişiyi **arşivlemeyi** denedi (`set_employee_archived_service`) → aynı 42501 hatası. Yani sorun yalnız "Terminate" değil, arşivleme de.
- Kod okuma: `terminate_employee` (yayınlı vardiyaları lokasyon filtresiz bırakıyor), `save_employee` (kapsam dışı lokasyon kuralı, satır 43-60), `can_manage_employee_record` (bir ortak lokasyon yeterli).

**Önerilen karar:** İkisi + ürün kararı. (leave: high / do: risky)
- #30: Test düzelsin (yeni imza; middle name). Güvenli.
- #35/#46: Repo düzelsin — manager'ın meşru işten çıkarma/arşivlemesi bugün tamamen kırık. En az kodla: işten çıkarma/arşiv fonksiyonları yetkiyi zaten kendileri kontrol ediyor; tetikleyiciye ikinci bir yetki kopyası yazmak yerine, bu fonksiyonlar mevcut desendeki gibi (`app.employee_invitation_accept`, `app.owner_transfer`) işlem-içi bir bayrak koysun ve tetikleyici yalnız "durum → suspended, rol/erişim aynı" değişikliğine izin versin. Hangi kişileri çıkarabileceği ise KAPSAM MODELİ SORUSU 1'in cevabına göre (D3 ya da BL-051) `can_manage_employee_record` benzeri tek yerde belirlenir; test buna göre yeniden yazılır (D3 seçilirse #35 "reddedilir" olur, tek lokasyonlu bir kişiyle yeni bir "çıkarabilir + hesap askıya alınır" kontrolü eklenir).
- #36-41 ve #3/#9 (yeşil ama hedefle çelişen, aşağıda): ürün kararı gerekiyor (D1, D2).
- Diğer seçenek ("test düzelsin, manager hiç çıkaramasın") şu durumda doğru olurdu: işten çıkarmanın tamamen admin/owner işi olmasına karar verilirse. O zaman da `employees.archive` izninin manager varsayılanından çıkması ve düğmenin gizlenmesi gerekir; bugün düğme görünüp hata veriyor.

**Önceki karar ile karşılaştırma:** Büyük ölçüde aynı ("repo dar kapı + D3; test yeni imza; D1 yönünde yeniden yazım"), iki ekle: (1) arşivleme de aynı hatadan etkileniyor; (2) D3 bir ürün kararı olarak açıkça sorulmalı, çünkü 09-14 tarihli yazılı BL-051 kararı tam tersini söylüyor ("bir ortak lokasyon yeterlidir") ve kullanıcı hiyerarşiyi yeniden düşünmeye açık.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:**
- #3 "Admin must be explicitly authorized" ve #9 "Owner explicitly authorizes Admin": varsayılan Admin rolünde `roles.manage` (Settings → Roles'u düzenleme) **yok** (ölçüldü: admin'in 74 izni, eksik olan tek şey bu). Hedef: "Admin rolleri düzenleyebilir." D2 de aynı. BL-051 ise "owner yetkilendirirse" demişti. Hedefle çelişiyor.
- #5 "Manager defaults exclude settings/…": manager'ın varsayılanında hiçbir `settings.*` okuma izni yok. Hedef "Settings'te çoğunlukla salt-okunur" diyor; bugün manager Settings'i hiç göremiyor (aşağıda "Alan geneli"). Kısmen çelişiyor → soru.
- #36-41: manager tipinde bir role `settings.general.*` ve `settings.locations.*` verilince manager **bütün** lokasyonları görüyor (#38), kapsamı dışındaki lokasyonu düzenliyor (#39-40), işletmenin adını değiştiriyor (#36-37). Settings → Roles ekranı bu seçenekleri manager rollerine "Organization-wide: this access can affect all locations." uyarısıyla sunuyor (`packages/shared/src/role-permissions.ts:151-167`). Hedef: "özel roller kapsamı İÇİNDE daraltır, genişletemez." Çelişiyor (D1 yönü doğru).
- Aynı aileden, testte olmayan: "Manage conflict rules" (`schedule.conflict_rules.manage`) manager rollerine verilebiliyor; bununla manager org genelinde hard/soft kuralını değiştirebilir. Deneme (geri alındı): `settings.schedule_rules.manage` verilmiş ama conflict izni olmayan bir manager, müsaitlik zorlamasını (`availability_enforcement`) soft → **hard** yapabildi; tetikleyici bu alanı korumuyor.

**Kullanıcıya sorular:** Alan geneli listesinde 1, 2, 4, 5.

---

### scheduling_settings_shift_types_rls

**Ekrandaki karşılığı:** Settings → Shift catalog → Shift types (Breakfast, Lunch, Dinner gibi vardiya tipleri ve varsayılan saatleri) ve Settings → Schedule rules.

**Test ne iddia ediyor (kırmızı kontroller):**
- #11 "equal default times are rejected" — başlangıç = bitiş (09:00-09:00) reddedilmeli; test 23514 (tablo kuralı) bekliyor, 22023 geliyor.
- #12 "active shift type names are unique ignoring case" — "breakfast" ikinci kez eklenemesin; test saatsiz ekliyor, saat kuralı önce reddediyor.
- #20 "manager cannot create a shift type" — manager eklemeye çalışınca "yetki yok" beklenir; test saatsiz ekliyor, saat kuralı önce reddediyor.

**Eski davranış:** 2026-08/09-07 arası vardiya tipi saatsiz olabiliyordu (`docs/rebuild/availability-e2e-audit…-2026-09-07.md:253,416`: "saatsiz türlerde … doğrulama gerektiği görünür"). Eşit saat tablo kuralıyla (23514) reddediliyordu.
- Owner "Brunch" tipini saatsiz ekler → kabul; o tipten vardiya "saat doğrulanmalı" olarak görünür.
- Owner "Invalid" 09:00-09:00 ekler → 23514.
- Ali (manager) tip eklemeye çalışır → RLS reddeder.

**Ne değişti:** 2026-09-09 `20260909042000_weekly_preference_settings.sql` bir tetikleyici ekledi (`guard_weekly_preference_type_hours`): yeni tip saatsiz ya da eşit saatli eklenemez ("Set valid default start and end times for this shift type", 22023). Yazılı gerekçe migration'da yok; bağlam: haftalık müsaitlikte "shift type" modunda tip seçmek saat gerektiriyor. Ekran da artık saatleri zorunlu tutuyor ("Default start and end times are required.", `ShiftTypesSettingsPage.tsx:338-339`).

**Yeni davranış:** Tetikleyici tablo kuralından, tekillik kuralından ve RLS'ten önce çalışıyor; bu yüzden üç kontrol "yanlış" hata kodunu görüyor.
- Owner "Brunch"ı saatsiz ekler → 22023 (artık imkânsız).
- Owner 09:00-09:00 → 22023 (tablo kuralı hiç devreye girmiyor).
- Ali saatli bir tip eklemeye çalışır → RLS reddeder (42501) — kural sağlam.

**Hedefe göre doğrulama:** Hedef "Settings'te manager çoğunlukla salt-okunur" ile uyumlu: manager tip ekleyemiyor/sıralayamıyor, ayarı değiştiremiyor (#19-22). Saat zorunluluğu hedefle çelişmiyor; önceki karar ("saati bilinmeyen vardiya doğrulanmalı") saatsiz tip üretilemediği için bu yoldan artık tetiklenmiyor. **Kalan eski tolerans:** kolonlar hâlâ boş olabilir, tablo kuralı "ikisi de boş" durumuna izin veriyor, tetikleyici eski saatsiz satırların güncellenmesine izin veren bir dal taşıyor, ortak şema (`packages/shared/src/index.ts:1177`) ve ekran saatsiz tipi göstermeyi biliyor (`ShiftTypesSettingsPage.tsx:338,480`). "Canlı veri yok" kuralına göre bunların hepsi silinecek türden.

**Kanıt:**
- Test koşusu: 3 kırmızı (#11, #12, #20).
- Deneme (testin kendi `rollback`'i ile): #11 beklenen kodu 22023 yapıldı, #12 ve #20'ye saat eklendi → **25/25 yeşil**.
- Kod okuma: `guard_weekly_preference_type_hours`, `shift_types` tablo tanımı (`shift_types_check`).

**Önerilen karar:** Test düzelsin; tolerans temizliği ayrı küçük iş. (leave: low / do: safe)
- Test: #11 beklenen 22023 (kuralın gerçek kapısı), #12/#20 saatli fixture.
- Ayrı iş (backlog): kolonları NOT NULL yap, tetikleyicinin eski-satır dalını ve tablodaki gereksiz kuralı sil (tek kural tek yerde), ortak şemada/ekranda "saatsiz tip" yolunu kaldır.
- Diğer seçenek (repo: tetikleyiciyi gevşet) doğru olmazdı; saat zorunluluğu bilinçli ve ekranla tutarlı.

**Önceki karar ile karşılaştırma:** Aynı (TEST, 25/25 doğrulandı) + tolerans temizliği önerisi eklendi.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** yok. (Yan not: #18 "admin can update scheduling rules" müsaitlik zorlamasını `settings.schedule_rules.manage` ile değiştiriyor; bu alan Conflict handling iznince korunmuyor — roles bölümündeki deneme.)

**Kullanıcıya sorular:** yok.

---

### weekly_team_availability

**Ekrandaki karşılığı:** Sol menü → Availability sayfası (ekibin haftalık müsaitlik listesi). Her satırdaki kişi adı/düğmesi o kişinin kartını (EmployeeDrawer) Availability sekmesinde açar (`AvailabilityPage.tsx:230,254` — düğme `can_open` "açılabilir mi" bayrağına göre aktif/pasif).

**Test ne iddia ediyor (kırmızı kontroller):**
- #23 "schedule-only manager cannot open employee drawer" — "View employees" (`employees.read`) izni kapatılmış bir manager için kartı aç düğmesi pasif olmalı. Bugün aktif.
- #24 "manager without schedule read is denied" — `schedule.read` kaldırılınca liste reddedilmeli. Bugün reddedilmiyor.

**Eski davranış:** 2026-09-09 `20260909140030_weekly_team_availability.sql`: sayfanın kapısı `schedule.read`, kart açma (`can_open`) ise `employees.read` / `employees.manage` iznine bağlıydı (satır 9-23).
- Ali'nin rolünden "View employees" kapatılır → listede adlar görünür, kart düğmesi pasif.
- Ali'nin rolünden "Schedule" okuma kapatılır → Availability sayfası reddedilir.

**Ne değişti:** 2026-09-14 BL-051 (`fc2c4da`, `20260914092711_bl051_roles_permissions.sql`) ayrı `availability.read` / `availability.manage` izinlerini getirdi; sayfa kapısı ve `can_open` bu izne taşındı. Gerekçe BL-051 belgesinde: "Manager'ın Line Up, Requests, Availability … yönetimi açık" — Availability ayrı bir izin alanı oldu. `can_open`'daki `employees.read` koşulu yeni izinle **değiştirildi**, yanına eklenmedi; kartın kendisi hâlâ `employees.read` istediği için düğme ile kart ayrıştı. Bu kısım için yazılı gerekçe yok.

**Yeni davranış:**
- "View employees" kapalı Ali → düğme aktif; tıklayınca kart, kişinin ayrıntısını `employees.read` isteyen API'den çekmeye çalışır (`EmployeeDrawer.tsx:119-121` → `employee-directory-routes.ts:167`) → **kart hata verir**. Kullanıcı açısından kırık düğme.
- `schedule.read` kapalı ama `availability.read` açık Ali → sayfa açılır. Bu, yeni izin modeline göre doğru; test eski izni kaldırıyor. (Hata metni hâlâ "Schedule read access required" diyor — yanıltıcı kopya.)

**Hedefe göre doğrulama:** Hedef: özel roller kapsam içinde daraltır, örnek olarak "View employees kapalı manager" veriyor. O durumda kart açma pasif olmalı (ya da yalnız müsaitlik gösteren ayrı bir görünüm). Bugünkü kod bu hedef örneğini tam olarak kırıyor. #24 için yeni izin modeli (müsaitlik ayrı izin) hedefle uyumlu; test eski.

**Kanıt:**
- Test koşusu: #23, #24 kırmızı.
- Deneme (testin `rollback`'i ile): #24'te silinen izin `availability.read` yapıldı → #24 yeşil, yalnız #23 kırmızı.
- Deneme (geri alındı): `weekly_team_read_service`'in `can_open` hesabına "ve employees.read" eklendi + #24 test değişikliği → **25/25 yeşil**; sonrasında canlı fonksiyonun değişmediği doğrulandı.
- Kod okuma: `AvailabilityPage.tsx:76-77,230,254`, `EmployeeDrawer.tsx:119-121`, `employee-directory-routes.ts:159-167`.

**Önerilen karar:** İkisi: #23 repo, #24 test. (leave: medium / do: safe)
- #23: `can_open` = müsaitlik kapsamı **ve** `employees.read`. Tek satır, ekran değişmeden doğru davranır (düğme pasif).
- #24: test `availability.read`'i kaldırsın; test adı ve fonksiyonun hata metni "availability" desin.
- Diğer seçenek: "View employees kapalıyken bile müsaitlik kartı açılsın" istenirse, kartı değil müsaitliğe özel bir paneli açmak gerekir (daha büyük iş). → soru 6.

**Önceki karar ile karşılaştırma:** Aynı (#23 repo, #24 test), deneme ile doğrulandı.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** yok. KAPSAM notu: #5 "multi-location employee returns only visible location ids" — Ali, Kadıköy+Beşiktaş'ta çalışan Alex'in yalnız Kadıköy lokasyonunu görüyor ama haftalık müsaitliği (lokasyondan bağımsız, kişisel) bütünüyle görüyor ve `availability.manage` ile değiştirebiliyor; bu Beşiktaş planlamasını da etkiler → KAPSAM MODELİ SORUSU 2. Ayrıca liste diğer manager/admin/owner kayıtlarını da gösteriyor ama kartları açılamıyor (açılabilir mi kuralı yalnız "employee" sınıfına izin veriyor) → KAPSAM MODELİ SORUSU 3.

**Kullanıcıya sorular:** Alan geneli 6.

---

## Alan geneli bulgular

**Ortak kök nedenler**
1. **Aynı kural birden çok yerde, biri güncellenince diğeri unutuluyor.** Üyelik tetikleyicisi aynı gün iki kez yeniden yazıldı ve ikincisi birincinin manager dalını düşürdü (#35/#46). "Manager bu kişiye erişebilir mi" kuralının üç canlı + bir ölü kopyası var (`public.can_access_employee`, `public.can_manage_employee_record`, `public.service_actor_can_access_employee`; ölü: `app_private.can_access_employee`). Bir kapsam kararı (D3 gibi) üç yerde ayrı ayrı değişmek zorunda.
2. **Yeni eklenen şey eski güvenlik kuralını bilmiyor.** Tek kolonlu bağlantılar (11), tarayıcıya açılmış definer fonksiyon (1), `can_open`'da unutulan izin. Kural testte yazılıydı ama testler CI kapısı olmadığı için (BL-070) kimse görmedi.
3. **Testler, sonradan eklenen doğru bir doğrulamanın arkasında kalıyor** (hafta doğrulaması, vardiya tipi saatleri, yeni fonksiyon imzası). Bunlar mekanik.

**Hedef modelle çelişen ama bu testlerde görünmeyen önemli yapılar**
- **Owner/admin/manager kendi vardiyaları için takas yapamıyor.** Veritabanı ve API buna izin veriyor (`employee_hub_actor_service` yalnız aktif üyelik + employee kaydı istiyor; takas aday listesi rol sınıfına bakmıyor). Ama web'de Employee Hub (Shift Hub, My Availability, izin talebi) yalnız `employee` rolüne açık: `App.tsx:435-440` (`roles={["employee"]}`) ve sol menü öğeleri (`AppShell.tsx`, "Shift Hub" vb. `roles: ["employee"]`). Sonuç: yönetici takviminde Ali'ye vardiya yazılabiliyor (deneme: manager'ın takvim listesinde owner'ın ve kendisinin kaydı görünüyor), bir employee Ali'ye takas teklif edebiliyor, ama Ali teklifi görecek/kabul edecek ekrana giremiyor. Hedefle çelişiyor. → soru 7.
- **Manager Settings'i hiç göremiyor.** Varsayılan Manager'da `settings.*`, `roles.read`, `documents.read` yok. Sol menüde Settings görünmüyor (`AppShell.tsx:179-188,300-303`). Adresi elle yazarsa giriş kapısı geçiliyor (manager'da varsayılan olarak MVP dışı Kiosk izinleri var: `kiosk.*`), sonra yönlendirme `/app/schedule`'a atıyor; yalnız `/app/settings/support` elle açılabiliyor. Hedef: "çoğunlukla salt-okunur". → soru 2.
- **Admin, Roles'u varsayılan olarak düzenleyemiyor** (`roles.manage` yok). Hedef ve D2 ile çelişiyor. → soru 1.
- **Manager rollerine org-geneli ayar yazma verilebiliyor** (General, Locations, Jobs, Shift catalog, Schedule rules, Conflict rules), kapsamı genişletiyor. Hedefle çelişiyor. → soru 3.
- **Manager "tüm lokasyonlar" alamaz** (`enforce_role_location_scope` her yazmada `all_locations=false` yapıyor); kapsamı yalnız kendi employee kaydının lokasyonlarından. Owner'ın kaydı yeni lokasyonlara otomatik genişliyor, manager'ınki genişlemiyor. Hedefle uyumlu, ama bölge müdürü ve "yönettiği yerde vardiya çalışmayan müdür" ifade edilemiyor. → KAPSAM MODELİ SORUSU 4.
- Davette manager için ayrı lokasyon listesi saklanıyor (`employee_invitations.location_ids`), kabulde yazılıyor, sonra kapsam senkronu employee kaydından yeniden hesaplayıp onu eziyor. İkinci kaynak ölü ağırlık (low). Davetle gelen employee'lerin `all_locations` bayrağı `true` kalıyor (5 satır ölçüldü); bu yalnız lokasyon listesinin okunmasını etkiliyor (low).

**Bu alanda rastlanan ama başka alanlara ait bulgular (kısa, backlog adayı)**
- **Kişi kartını kaydetmek "tercih ettiğim ad"ı siliyor** (leave: high / do: safe). `save_employee_service` iç fonksiyona tercih edilen ad yerine sabit `''` geçiriyor. Deneme (geri alındı): kayıtta "Commy" varken manager kartı "Commy" göndererek kaydetti → sonuç boş. 09-22'de onaylı tercih edilen ad özelliği geldiği için artık gerçek veri kaybı: Ayşe'nin onaylanmış "Ayşo" adı, yöneticinin karttaki her kaydıyla silinir.
- **Onaylı izin yumuşatılabiliyor.** Settings → Conflict handling'de "approved_time_off" için "confirm" seçilebiliyor (`packages/shared/src/availability-assessment.ts:7`). Hedef: "onaylanmış izin HARD, yumuşatılamaz." Ayrıca iki ayrı hard/soft anahtarı var: ekrandaki `conflict_rules.availability` ve ekranda olmayan `availability_enforcement` (müsaitlik değerlendirmesi bunu okuyor). Müsaitlik/çatışma alanının ajanına girdi.
- Takvim listesi hâlâ eski müsaitlik tablosundan okuyor (`get_schedule_read_model_service_label_base` → `employee_schedule_availability_versions`). BL-091'e girdi.

**Fikir ve tavsiyeler**
- **"Kapsam" kuralını tek fonksiyona indirin.** `can_access_employee` / `can_manage_employee_record` / `service_actor_can_access_employee` yerine tek "bu aktör bu kişiye bu işlem için yetkili mi (okuma / düzenleme / işten çıkarma)" fonksiyonu; ölü kopya silinsin. D3 gibi kararlar tek yerde değişir. Kapsam modeli (alan G) netleşince yapılmalı, önce değil.
- **Manager için "işten çıkar" yerine "lokasyonumdan çıkar".** Çok lokasyonlu çalışanda manager'ın eylemi Ayşe'nin Kadıköy atamasını bitirmek olsun (Beşiktaş'a dokunmaz); tamamen işten çıkarma, kişinin bütün lokasyonları manager'ın kapsamındaysa ya da admin/owner ise. Bu, D3'ün kullanıcıya daha anlaşılır hâli.
- **Varsayılan manager'dan MVP dışı Kiosk izinlerini çıkarın**; bugün Settings kapısını yanlışlıkla açık tutuyor ve rol ekranında görünmeyen izin taşıyor.
- **Testler CI kapısı olunca** bu alandaki hataların çoğu (kural unutma) doğduğu gün yakalanırdı; BL-070'in kapanışı bunun önkoşulu.

## Kullanıcıya sorular (alan geneli, önem sırasıyla)

1. **KAPSAM MODELİ SORUSU 1 — Manager çok lokasyonlu birini işten çıkarabilir mi?**
   Senaryo: Ali Kadıköy manager'ı. Ayşe hem Kadıköy hem Beşiktaş'ta çalışıyor; Beşiktaş'ın manager'ı Mehmet. Ali Employees → Ayşe'nin kartı → "Terminate employee"a basıyor. İşten çıkarma Ayşe'nin **Beşiktaş'taki** gelecek vardiyalarını da boşa çıkarır ve hesabını tüm işletmede kapatır.
   Bugün kod: hesabı olan herkeste hata veriyor (kırık). 09-14 yazılı karar: izin verilir (bir ortak lokasyon yeterli). D3: reddedilir, admin/owner yapar.
   Seçenekler: (a) D3 — yalnız kişinin bütün lokasyonları Ali'nin kapsamındaysa; değilse admin/owner **(öneri: hedefin "yalnız kendi lokasyonları" ilkesine uyan tek seçenek; Mehmet'in haberi olmadan Beşiktaş planı değişmez)**; (b) bir ortak lokasyon yeterli (09-14 kararı, test bugün bunu istiyor); (c) manager yalnız "Kadıköy'den çıkar" yapabilir, işten çıkarma her zaman admin/owner. (c) seçilirse Terminate düğmesi manager'da gizlenmeli.

2. **Manager Settings'te ne görsün?** Hedef "çoğunlukla salt-okunur" diyor; bugün manager Settings'i hiç görmüyor (09-14 kararı: "organizasyon ve bildirim ayarları başlangıçta kapalı").
   Seçenekler: (a) varsayılan Manager rolüne General, Locations (yalnız kendi lokasyonları), Jobs, Shift catalog, Schedule rules, Conflict handling için **okuma** açılsın; Roles/Notifications/Documents kapalı kalsın **(öneri: vardiya yazan kişinin kuralları görmesi işini kolaylaştırır; yazma yok)**; (b) bugünkü gibi hiç görmesin, owner isterse açsın; (c) başka bir liste — hangi sayfalar?
   Alt soru: "Locations okuma" manager'a bütün lokasyonların listesini mi, yalnız kendi lokasyonlarını mı göstersin? (Bugün izin verilince bütün lokasyonları görüyor — test #38.)

3. **Manager tipindeki bir role org-geneli ayar yazma (General, Locations, Jobs, Shift catalog, Schedule rules, Conflict rules) verilebilsin mi? (D1)**
   Bugün: verilebiliyor, ekranda "bu erişim bütün lokasyonları etkileyebilir" uyarısıyla (09-14 kararı). Test #36-41 bunu doğru sayıyor: böyle bir manager kapsamı dışındaki Beşiktaş'ın adını değiştiriyor, işletmenin adını değiştiriyor, müsaitliği hard yapabiliyor.
   Seçenekler: (a) hayır, manager rollerinde hiçbir ayar yazma izni olamaz — org-geneli yazma admin/owner işi **(öneri: hedefteki "kapsamı genişletemez" kuralının doğrudan karşılığı)**; (b) evet, uyarıyla (bugünkü); (c) yalnız kendi lokasyonlarına ait ayarlar (ör. Kadıköy'ün adresi/saat dilimi) yazılabilsin.

4. **Admin Settings → Roles'u varsayılan olarak düzenlesin mi? (D2)**
   Bugün: hayır; varsayılan Admin'de bu izin yok, owner'ın Admin rolüne ayrıca vermesi gerekiyor (09-14 kararı "owner yetkilendirirse"). Hedef ve D2: evet.
   Seçenekler: (a) evet, varsayılan açık; admin yine de kendi izninden fazlasını veremez ve admin atayamaz (bunlar bugün zaten kodda doğru) **(öneri: hedefle aynı)**; (b) owner açsın (bugünkü).

5. **KAPSAM MODELİ SORUSU 2 — Manager çok lokasyonlu bir çalışanın org-geneli bilgisini değiştirebilir mi?**
   Senaryo: Ali (Kadıköy) Ayşe'nin kartında Bartender job'ını kaldırıyor; Ayşe Beşiktaş'ta da Bartender. Ya da Ali Ayşe'nin haftalık müsaitliğini (kişisel, lokasyondan bağımsız) değiştiriyor. İkisi de Beşiktaş planlamasını etkiler.
   Bugün kod: izin veriyor (lokasyon atamaları korunuyor, job/ad/e-posta/müsaitlik değişiyor).
   Seçenekler: (a) izin verilsin, değişiklik Beşiktaş manager'ına bildirim olarak gitsin; (b) org-geneli alanlar (job, ad, e-posta, müsaitlik) yalnız kişinin bütün lokasyonları kapsamdaysa ya da admin/owner; (c) job'lar lokasyon bazlı olsun (Kadıköy'de Bartender, Beşiktaş'ta Server) — büyük model değişikliği. Öneri yok: bu kapsam modelinin (alan G) çekirdek sorusu.

6. **"View employees" kapalı bir manager Availability sayfasında bir kişinin kartını açabilsin mi?**
   Bugün: düğme aktif ama kart hata veriyor.
   Seçenekler: (a) düğme pasif olsun (tek satır, test bunu istiyor) **(öneri: izin kapalıysa kart kapalı; liste müsaitliği zaten gösteriyor)**; (b) kişi kartı yerine yalnız müsaitliği gösteren ayrı bir panel açılsın (daha büyük iş).

7. **Owner/admin/manager kendi vardiyaları için Shift Hub'ı (takas, bırakma, kapsama arama), My Availability ve izin talebini nereden kullanacak? Kendi talebini kim onaylar?**
   Bugün: veritabanı izin veriyor, web sayfaları yalnız employee rolüne açık; yöneticiler bu ekranlara giremiyor.
   Seçenekler: (a) yönetici arayüzüne "Benim vardiyalarım" bölümü (Employee Hub sayfaları yönetici kabuğu içinde) **(öneri: hedef "takas edebilmeleri gerekir" diyor, altyapı hazır; iş web tarafında)**; (b) yönetici arayüzü ile employee arayüzü arasında geçiş düğmesi.
   KAPSAM MODELİ SORUSU 3: Ali (Kadıköy'ün tek manager'ı) kendi Kadıköy vardiyasını takas etmek ya da izin almak isterse onayı kim verir — kendisi mi (bugün kendi kendini onaylamayı engelleyen açık bir kontrol **bulamadım; doğrulanmadı**), yoksa admin/owner mı? Mehmet (Beşiktaş manager'ı) Ali'nin Kadıköy vardiyasını alırsa iki lokasyon kuralı gereği onay Ali (Kadıköy) + Beşiktaş yetkilisi mi — yani Ali kendi takasını onaylayan taraflardan biri mi olur?

8. **KAPSAM MODELİ SORUSU 4 — Manager diğer manager'ları, admin'i ve owner'ı görsün mü, planlasın mı?**
   Senaryo: Kadıköy'de iki manager var, Ali ve Zeynep; owner Mert'in kaydı da Kadıköy'de (owner bütün lokasyonlarda).
   Bugün kod (ölçüldü): Ali'nin takviminde Mert ve Zeynep görünüyor ve onlara vardiya yazabiliyor; Availability listesinde de görünüyorlar; ama Employees listesinde ve kişi kartında göremiyor (erişim kuralı manager'a yalnız "employee" sınıfını açıyor).
   Seçenekler: (a) manager kapsamındaki herkesi **görür ve planlar**, ama yalnız employee sınıfını **düzenler/çıkarır** (öneri: tutarlı ve hiyerarşiye uygun); (b) bugünkü gibi karışık; (c) manager üst rolleri hiç görmez/planlamaz — o zaman owner/admin/manager'ların vardiyalarını kim yazar?
   Ek: "Yönettiği yerde vardiya çalışmayan müdür" ve "bütün lokasyonların bölge müdürü" nasıl tanımlanacak? Bugün manager'ın kapsamı yalnız kendi employee kaydının lokasyonlarından geliyor; "Beşiktaş'ı yönetir ama orada çalışmaz" ifade edilemiyor, yeni lokasyon eklenince bölge müdürüne otomatik geçmiyor.

9. **Eski müsaitlik tablosu (onboarding kopyası) BL-091 kararıyla birlikte mi gidecek?** `onboarding_composite_tenant_constraints` #7 bu tabloya bağlı; "sök" kararı gelirse kontrol silinir, düzeltilmez. (BL-091 zaten açık; bu dosya ona bağlanmalı.)
