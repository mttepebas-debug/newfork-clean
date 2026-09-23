# Alan C — Bildirimler (BL-070 derin araştırma)

Ölçüm: 2026-09-23 sabahı, main `41783c7`, ortak yerel veritabanı (`supabase_db_newfork-clean`). Dört dosya tek tek koşuldu; sonuç baseline ile aynı (platform_core 1, settings_admin 1, resolver 4, account_scope 2 kırmızı). Bütün denemeler tek transaction içinde yapıldı ve `rollback` ile geri alındı. Deneme betikleri: `scratchpad/bl070-research/c-bildirimler/` (fixture.sql + s1..s6.sql).

Deneme fixture'ı (hepsi geri alındı): Owner **Olcay** (tüm lokasyonlar), Admin **Ayşe** (tüm lokasyonlar), Manager **Mehmet** (yalnız Kadıköy), Manager **Burak** (yalnız Beşiktaş), Employee **Ali** (Kadıköy + Beşiktaş), Employee **Zeynep** (yalnız Beşiktaş). Manager kapsamları, uygulamanın kendi employee kaydından senkronize edeceği hâliyle elle kuruldu.

Kısa sözlük (ilk geçtiği yerde):
- **Bildirim kataloğu** (`notification_catalog`): uygulamanın gönderebildiği bildirim türlerinin listesi. Settings → Notifications'taki satırlar buradan gelir. Bugün 34 satır (33 tür; "availability review" iki sürümle duruyor).
- **Gönderim kuyruğu** (`notification_outbox`): bir olay olunca "şu bildirimi şu kişilere gönder" notunun düştüğü yer. Arka plandaki işçi (API'deki outbox worker) bu notu alır, alıcıları çözer ve zil ikonundaki gelen kutusuna (Notifications sayfası, `/app/notifications`) yazar.
- **Metin şablonu** (`notification_template_versions`) ve **üretici kaydı** (`notification_producer_registry`): her tür için "metni şu, bunu şu kod üretir" diyen envanter satırları.
- **Sağlık kontrolü** (`reconcile_notification_platform_service`): katalog, şablon ve üretici kaydı birbirini tutuyor mu diye bakan kontrol; "healthy" ya da "drift_detected" döner.
- **Politika çözücü** (`resolve_notification_policy_v1_service`): tek bir alıcı için "bu bildirim bu kişiye gitsin mi" kararı (üyelik aktif mi, lokasyon kapsamı uyuyor mu, org politikası/kişisel tercih kapatmış mı).

---

### notification_platform_core
**Ekrandaki karşılığı:** Bildirim altyapısının iskeleti: zil ikonu → Notifications sayfası (sayfalama, okundu işaretleme), Account → Notifications'taki kişisel tercihler, ve eski (ilk) gelen kutusu. Kırmızı kontrolün kendisi ekranda bir şeye karşılık gelmiyor: katalogdaki satır sayısını sayıyor.

**Test ne iddia ediyor (kırmızı kontroller):** #13 "the approved catalog seed contains nine types" — katalogda tam 9 satır olmalı. Bugün 34.

**Eski davranış:** 2026-09-08'de `20260908110000_notification_platform_core` 8 tür kurdu (duyuru, izin talebi geldi/karar, vardiya değişikliği talebi geldi/karar, mesai düzeltmesi geldi/karar, vardiya yayınlandı), aynı akşam `20260908175000` 9.'yu ekledi ("belgenin süresi doluyor"). "Dokuz" yalnız 8 Eylül akşamı doğruydu.
- Owner Settings → Notifications'ı açınca 9 satır görüyordu.
- Ali'nin belgesinin süresi dolmak üzereyken yöneticiye "belge süresi doluyor" gidiyordu.
- Hesap güvenliği (şifre değişti vb.) bildirimi yoktu.

**Ne değişti:** Katalog her özellikle büyüdü: müsaitlik (09-09, 3 satır), Line Up teklifleri (09-09, 3), haftalık tercih güncellendi (09-09, 1), davet iptali (09-14, 1), hesap güvenliği (09-14, 6), belge yaşam döngüsü (09-16, 9), tercih edilen ad (09-22, 2). Toplam 34. Sabit sayıyı değiştiren bir kural kararı yok; her özellik kendi türünü ekledi, bu test güncellenmedi. Test dosyası repoya 2026-09-09 "checkpoint" commit'iyle (`711da48`) geldi; yazılı gerekçe yok.

**Yeni davranış:** Aynı senaryolar: Owner Settings → Notifications'ta 27 tür görüyor (hesap güvenliği türleri orada yok, doğru olarak). Belge bildirimleri 9 türe bölündü. Şifre değişince kişinin hesap gelen kutusuna zorunlu bildirim düşüyor.

**Hedefe göre doğrulama:** Katalogdaki satır sayısı bir ürün kuralı değil; hedef modelde "şu kadar bildirim türü olmalı" diye bir şey yok. Katalogun büyümesi doğru yönde (her yeni özellik kendi bildirimini getiriyor). Test yanlış şeyi ölçüyor. Asıl değişmez ("her aktif türün metin şablonu ve üretici kaydı var") başka iki dosyada zaten ölçülüyor (account_notification_scope #32/#33, resolver #20).

**Kanıt:** Deneyerek: dosya koşuldu, #13 `have 34 / want 9`. Kod okuyarak: katalog satırlarının hangi migration'dan geldiği (`grep` + canlı tablo sorgusu), `git log` test dosyası geçmişi.

**Önerilen karar:** **Test düzelsin — #13 silinsin**, plan 35 → 34. (leave: low / do: safe)
- Sayı bir ürün kuralı değil, bir anlık görüntü; her yeni özellik onu yeniden bozar.
- Değişmezin kendisi zaten iki dosyada var; üçüncü bir kopya bakım yükü.
- Başka seçenek şu durumda doğru olurdu: katalog büyümesi bir onay kapısından geçmeliyse (ör. "yeni bildirim türü ancak ürün sahibi onaylayınca eklenir"). O zaman sayı değil, onaylı liste tutulur. Bugün böyle bir süreç yok.

**Önceki karar ile karşılaştırma:** Önceki karar "TEST — sabit yerine her aktif türün şablonu ve üreticisi var değişmezi" idi. Yön aynı, biçim farklı: bu dosyada değişmezi tekrar yazmak yerine kontrolü silmeyi öneriyorum, çünkü aynı değişmez account_notification_scope'ta ve resolver #20'de zaten var.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:**
- **#35 "the legacy inbox continues to operate during coexistence"** — iki gelen kutusunun birlikte yaşamasını iddia ediyor. "Canlı veri yok" kuralında geçiş dönemi gereksiz, ve bu ikilik görünür bir hata üretiyor: admin ana sayfasındaki (Home) **Notifications** kutucuğu eski tablodan (`notifications`), zil ise yenisinden okuyor; zilde okumak/kapatmak eski tabloya yansımıyor. Deneyle: Owner zilde "hepsini okundu işaretle" dedi → zil 0 okunmamış, eski tabloda 2 okunmamış kaldı. Kapatılan bildirim Home kutucuğunda görünmeye devam eder (kod okuması: kapatma yalnız yeni tabloyu güncelliyor). Backlog adayı, bu dosyanın kararına bağlı değil.

**Kullanıcıya sorular:** yok.

---

### notification_settings_admin
**Ekrandaki karşılığı:** **Settings → Notifications**. Owner/Admin burada her bildirim türünü organizasyon genelinde, rol bazında ya da lokasyon bazında açıp kapatıyor, kanal ve sıklık seçiyor, "safe preview" ile kendi üzerinde deniyor. Kırmızı kontrol bu sayfanın listelediği tür sayısını ölçüyor.

**Test ne iddia ediyor (kırmızı kontroller):** #6 "only the nine active catalog types are returned" — ayar sayfası 9 satır döndürmeli. Bugün 28.

**Eski davranış:** 8 Eylül akşamı sayfa 9 aktif türü listeliyordu; hepsi organizasyon kapsamlıydı.
- Owner "izin talebi geldi" bildirimini Kadıköy için kapatabiliyordu.
- Hesap güvenliği türü yoktu, dolayısıyla "listede olmamalı" sorusu da yoktu.

**Ne değişti:** Katalog büyüdü (yukarıdaki liste). 2026-09-14'te `20260914221045_account_notification_scope` türlere "kapsam" ekledi: `workspace` ya da `account`. Ayar sayfası yalnız `workspace` kapsamlı ve aktif satırları döndürecek şekilde güncellendi (hesap güvenliği bildirimleri bir işletmenin açıp kapatacağı şey değil; kişinin hesabına ait). Yazılı gerekçe migration'ın kendisinde: hesap bildirimleri "işletme tercihi olamaz".

**Yeni davranış:** Sayfa 28 satır döndürüyor = 34 aktif satır − 6 hesap güvenliği satırı. 28'in ikisi aynı türün iki sürümü ("availability review" v1 ve v2); ekran bunları tekilleştirip 27 tür gösteriyor (`NotificationSettingsPage.tsx`, en yüksek sürümü seçiyor).
- Owner "izin talebi geldi"yi Kadıköy için kapatabiliyor (aynı).
- "Şifre değişti" bu sayfada yok (doğru).

**Hedefe göre doğrulama:** Hedef: admin Settings'te çoğu ayarı okur/yazar; manager çoğunlukla salt-okunur. Filtrenin kendisi (yalnız aktif + organizasyon kapsamlı türler) doğru ve hedefle uyumlu. Sayı yanlış ölçü. Ek ölçüm: lokasyona bağlı bir manager'a özel rolle "notifications.settings.write" verilse bile organizasyon geneli ya da rol bazlı politika yazamıyor ("organization-wide notification scope required"), yalnız kendi lokasyonu için yazabiliyor. Bu, "özel rol kapsamı daraltır, genişletemez" kuralıyla uyumlu.

**Kanıt:** Deneyerek: dosya koşuldu (#6 `have 28 / want 9`); canlı katalog sorgusu (34 satır, 6'sı hesap kapsamlı); rolled-back deneme: Mehmet'e "Kadikoy lead" özel rolüyle yazma izni verildi, global politika kaydı reddedildi. Kod okuyarak: `get_notification_settings_service` filtresi (`notification_scope='workspace' and lifecycle='active'`), `save_notification_policy_service` kapsam kontrolü, ekranın tekilleştirmesi.

**Önerilen karar:** **Test düzelsin** — #6 sayı yerine davranışı iddia etsin: "dönen liste = aktif ve organizasyon kapsamlı katalog satırları; hiçbir hesap güvenliği türü yok". (leave: low / do: safe)
- Kontrolün asıl anlamı filtreleme; sayıyı katalogdan hesaplamak bunu korur ve bir daha bozulmaz.
- Hesap türlerinin sızmaması gerçek bir kural (hedefle uyumlu) ve bugün hiçbir kontrol bunu bu fonksiyon için iddia etmiyor.
- Başka seçenek şu durumda doğru olurdu: ayar sayfası ileride role göre farklı liste gösterecekse (ör. manager yalnız kendi ilgilendiği türleri görür); o zaman kontrol rol bazlı yazılır.

**Önceki karar ile karşılaştırma:** Önceki karar üç dosya için aynı değişmezi ("şablon + üretici var") öneriyordu. Bu dosya için o değişmez yanlış hedef: bu fonksiyon şablon ya da üretici ile ilgilenmiyor, listeyi filtreliyor. Karar "TEST" olarak kalıyor ama değişmez değişmeli.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** yok. (Manager rolünün bu sayfayı hiç okuyamaması hedefteki "manager Settings'te çoğunlukla salt-okunur" ile tam örtüşmüyor; alan geneli sorularında kısaca.)

**Kullanıcıya sorular:** yok (alan geneli 6. soru bu sayfayla ilgili).

---

### notification_preference_resolver_and_producers
**Ekrandaki karşılığı:** Bir bildirimin **kime** gideceğine karar veren katman. Örnek: Ali Kadıköy için izin talebi açınca "New time-off request" bildirimi hangi yöneticilerin zilinde görünecek; Ali Account → Notifications'ta "schedule published"ı kapattıysa ona gitmez; Owner Settings → Notifications'ta bir rol için kapattıysa kişisel tercih bunu açamaz.

**Test ne iddia ediyor (kırmızı kontroller):**
- #2 "all approved catalog types are active" — aktif satır sayısı 9 olmalı (bugün 34).
- #3 "every active type has a published in-app template" — şablonlu tür sayısı 9 olmalı (bugün 31).
- #4 "every active type has an outbox producer registration" — `outbox_v1` üretici kaydı 9 olmalı (bugün 26).
- #20 "reconciliation is healthy…" — sağlık kontrolü "healthy" demeli (bugün "drift_detected").

**Eski davranış:** 8-9 Eylül: 9 tür, hepsi aktif, hepsinin şablonu ve kuyruk üreticisi vardı; sağlık kontrolü "healthy".
- Ali (yalnız Kadıköy'de yetkili olduğu bir kapsamda) Beşiktaş'ın vardiya yayını bildirimini almıyordu (lokasyon kapsamı kapalı kalır — bugün de aynı, yeşil).
- Ali "schedule published"ı kapattıysa almıyordu; org rol politikası kapattıysa Ali açsa bile almıyordu (bugün de aynı, yeşil).

**Ne değişti:** Katalog 34 satıra çıktı. 2026-09-14'ten beri hesap kapsamlı 6 türün üretici kaydı `outbox_v1` değil `account_audit_v1` (hesap güvenliği olayları kuyruktan değil denetim kaydından geliyor) — yani #4'ün formülü ("aktif sayısı = outbox_v1 sayısı") o günden beri kuramsal olarak da yanlış. #3 ve #4'teki 31/26 farkının kalanı ve #20'nin kırmızısı tek bir nedene iniyor: 2026-09-22 `d79b9dd` "a preferred name can be asked for" (migration `20260922110000_a_preferred_name_is_asked_for_and_answered`) iki türü aktif ekledi ama şablon ve üretici kaydı eklemedi. Sağlık kontrolünün bugünkü çıktısı yalnız bu iki türü gösteriyor; başka bir sapma yok (deneyle).

**Yeni davranış:** Politika çözücü aynı kuralları uyguluyor (#5–#19 yeşil). Sağlık kontrolü "drift_detected: people.preferred_name.published ve review_required için üretici ve şablon yok". Tercih edilen ad bildirimleri ayrıca hiç teslim edilemiyor (bkz. account_notification_scope).

**Hedefe göre doğrulama:**
- #2–#4: sabit sayı, ürün kuralı değil. #3/#4'ün anlamı #20'nin (sağlık kontrolü) içinde zaten var ve #20 hesap kapsamını doğru ayırıyor. #2'nin anlamı ("onaylanan türler aktifleştirildi") bugün bir kural değil: ileride bir türün "retired" olması meşru.
- #20: doğru değişmez; kırmızısı gerçek bir eksikliği gösteriyor. Ama tek başına yetmez: sağlık kontrolü yalnız envanteri (kayıt var mı) ölçüyor, bildirimin gerçekten birine ulaşıp ulaşmadığını ölçmüyor. Deneyle: iki türe şablon + üretici kaydı eklenince kontrol "healthy" diyor, oysa bildirim yine kimseye gitmiyor.
- Lokasyon kapsamı: çözücünün kuralı "olayın lokasyonlarından **herhangi biri** alıcının kapsamındaysa izin ver". Bu dosyadaki senaryolar hedefle uyumlu (Mehmet Beşiktaş'ın bildirimini almıyor). Ama alıcı listesini üretici fonksiyonlar kuruyor ve her üretici farklı bir lokasyon mantığı kullanıyor (alan geneli bulgular, KAPSAM MODELİ SORUSU).

**Kanıt:** Deneyerek: dosya koşuldu; `reconcile_notification_platform_service()` canlı çıktısı (yalnız iki tercih edilen ad türü); geri alınan denemede iki türe şablon + üretici eklenince "healthy" (yani #20 repo düzelince yeşillenir). Kod okuyarak: `reconcile_notification_platform_service` (hesap/workspace ayrımı), `resolve_notification_policy_v1_service`.

**Önerilen karar:** **İkisi.** #2, #3, #4 **silinsin** (test); #20 **repo düzelince** kendiliğinden yeşillenir. (leave: medium / do: safe)
- #3/#4, #20'nin daha kaba ve (#4 için) yanlış bir kopyası.
- #20 kırmızısı gerçek; testi değil repoyu düzeltmek gerekiyor (account_notification_scope ile aynı kök neden).
- Başka seçenek şu durumda doğru olurdu: #2–#4'ü sayı yerine değişmezle yeniden yazmak, eğer sağlık kontrolü fonksiyonu bir gün kaldırılırsa. Not: bu fonksiyonu bugün yalnız testler çağırıyor; API ya da ekran çağırmıyor (grep). Yani sapma olduğunda kimse uyarılmıyor, yalnız test kırmızıya dönüyor.

**Önceki karar ile karşılaştırma:** Önceki karar "TEST — sabit yerine değişmez" idi. #2–#4 için değişmezi yeniden yazmak yerine silmeyi öneriyorum (#20 aynı şeyi zaten doğru ölçüyor). #20 için karar REPO.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:**
- Çelişen kontrol yok. Ama bu dosyanın dokunduğu çözücüde bir tuzak var: çözücü katalogda yalnız **1. sürüme** bakıyor (`schema_version = 1` sabit). "Availability review" artık yalnız 2. sürümle üretiliyor; 1. sürüm katalogda bu yüzden aktif kalmak zorunda. Deneyle: 1. sürüm "retired" yapılınca 2. sürüm bildirimleri "catalog_inactive" ile reddedildi. Yani eski bir sürümü kaldırmak, hiç hata vermeden yeni sürümün bütün bildirimlerini susturur. (leave: medium / do: moderate)

**Kullanıcıya sorular:** yok (bu dosyadan doğan kapsam soruları alan genelinde).

---

### account_notification_scope
**Ekrandaki karşılığı:** Zil ikonu → Notifications sayfasında iki tür bildirimin birlikte görünmesi: **hesap bildirimleri** (şifre değişti, oturumlar kapatıldı, e-posta değişikliği iptal edildi — hangi işletmede olursan ol görürsün) ve **işletme bildirimleri** (izin talebi, vardiya yayını). Ayrıca Account → Notifications'taki tercih ekranı. Kırmızı iki kontrol, "kataloğa eklenen her aktif tür teslim edilebilir durumda mı" sağlık kontrolünü iddia ediyor.

**Test ne iddia ediyor (kırmızı kontroller):**
- #32 "every active account and workspace catalog event has its delivery boundary registered" — sağlık kontrolünde "üreticisi kayıtlı olmayan aktif tür" listesi boş olmalı. Bugün iki satır: `people.preferred_name.published`, `people.preferred_name.review_required`.
- #33 "every active event has a published in-app template" — "şablonu olmayan aktif tür" listesi boş olmalı. Bugün aynı iki satır.

**Eski davranış (2026-09-14 → 2026-09-21):** Her aktif türün üretici kaydı ve şablonu vardı; sağlık kontrolü "healthy". Bu değişmez bilinçli kurulmuştu: aynı 09-14 migration'ı "davet iptali" türünde tam bu eksikliği bulup kapatmıştı (migration yorumu: "Audit proved this existing mandatory workspace producer lacked its published template").
- Ali Kadıköy için izin talebi açınca Owner, Admin ve Mehmet'in zilinde "New time-off request" görünüyordu.
- Mehmet şifresini değiştirince kendi hesabına zorunlu "şifre değişti" bildirimi düşüyordu.
- Tercih edilen ad özelliği yoktu (alan boş kalmaya zorlanıyordu).

**Ne değişti:** 2026-09-22, commit `d79b9dd` "feat: a preferred name can be asked for, and a workspace decides how it answers". Kişi Account → Profile'da (işletme kaydı altında) "Preferred name" yazıyor. Settings → General'daki yeni ayar iki mod sunuyor: **auto** (ad hemen yayınlanır, yöneticiye haber verilir) ve **manager** (ad bekler, yönetici onaylar ya da sessizce reddeder; onay Employees → çalışan çekmecesindeki bekleyen satırda). Commit mesajının gerekçesi: "it changes without asking, but not without saying" (sorulmadan değişir, ama söylenmeden değil). JOIN-014 kullanıcı kararı 4 de aynı şeyi istiyor: auto'da "Owner/manager'a bildirim gider", manager modunda talep "admin/manager/owner'a onaya gider". Migration iki türü **aktif** olarak kataloğa ekledi, kuyruğa not yazdı, ama:
1. şablon ve üretici kaydı eklemedi (iki kırmızının nedeni),
2. kuyruk notuna **alıcı listesi koymadı** (asıl neden, testlerde görünmüyor),
3. başlık/metin/bağlantı koymadı.
Commit mesajı "both settings end to end including the notification the auto path still sends" diyor; oysa `preferred_name_approval.test.sql` yalnız kuyrukta bir satır olduğunu sayıyor, teslimi denemiyor.

**Yeni davranış:** Aynı senaryolar + yenileri:
- Ali'nin izin talebi ve Mehmet'in şifre bildirimi: değişmedi, çalışıyor.
- **Ali (auto mod) "Alican" adını yazıyor:** ad hemen yayınlanıyor, kuyruğa not düşüyor. İşçi notu işlerken "notification recipients are required" hatasıyla duruyor → yeniden deneme → varsayılan 5 denemeden sonra "dead_letter" (ölü mektup). Owner, Ayşe, Mehmet, Burak: zilde hiçbir şey yok. (Deneyle.)
- **Ali (manager mod) "Ali K" yazıyor:** talep bekliyor, bildirim yine kimseye gitmiyor. Talep ancak bir yönetici tesadüfen Ali'nin çekmecesini açarsa görülüyor.
- **Bildirim önceki ipucundaki gibi "şablon olmadığı için" gizlenmiyor.** Zilin sorgusu şablona yalnız hesap bildirimleri için bağlanıyor; işletme bildirimleri şablona hiç bakmıyor. Yani şablon + üretici kaydı eklemek iki testi yeşile çevirir ama bildirim yine kimseye ulaşmaz. (Deneyle: kayıtlar eklenince sağlık kontrolü "healthy"; alıcı listesi elle eklenince bildirim Owner ve Mehmet'in ziline "New notification" başlığı, **boş metin** ve düz `/app/employees` bağlantısıyla düştü — metni kuyruk notu taşımak zorunda, şablon okunmuyor.)
- **Onay ekranı lokasyon kapsamına bakmıyor:** bekleyen talepler listesi ve karar, yalnız "employees.manage" iznine bakıyor. Deneyle: Mehmet (yalnız Kadıköy) Zeynep'in (yalnız Beşiktaş) talebini listede gördü ve onayladı; Zeynep'in adı "Zeyno" oldu.
- **Kendi talebini kendisi onaylayabiliyor:** Deneyle: Mehmet kendi "Memo" talebini açtı ve onayladı. İzin talebi ve vardiya takası bunu yasaklıyor ("Own time-off decision access denied", "A separate manager must approve your own exchange").
- Kataloğun hedef kitle etiketi (`workspace_employee_access_managers`) "davet iptali"nden ödünç alınmış; oradaki anlamı "employee_access.manage izni olanlar" = yalnız owner/admin. Tercih edilen adda karar izni ise "employees.manage" (manager dahil). Etiket ile gerçek yetki farklı.

**Hedefe göre doğrulama:**
- #32/#33'ün değişmezi doğru ve hedefle çelişmiyor: "kataloğa aktif eklenen her tür teslim edilebilir olmalı". Kırmızılık gerçek bir hatayı gösteriyor; testi gevşetmek yanlış olur.
- Yeni özellik JOIN-014 kararıyla çelişiyor: karar "yöneticiye bildirim gider" diyor, bugün kimseye gitmiyor. Manager modunda bu "talep sessizce, görünmeden bekler" demek.
- Lokasyon kapsamı hedefle **açıkça** çelişiyor: hedef "manager YALNIZCA kendisine atanmış lokasyonlardaki employee'lere erişir". Zeynep yalnız Beşiktaş'ta; Mehmet yalnız Kadıköy'de. Burada belirsizlik yok, kod yanlış.
- Belirsiz olan kısım iki lokasyonlu Ali: hem Mehmet'in hem Burak'ın kapsamında. Kim haberdar olmalı, kim onaylamalı? → **KAPSAM MODELİ SORUSU** (aşağıda).
- Kendi kendini onaylama: izin/takas kuralıyla tutarsız. Tercih edilen ad zararsız bir alan olduğu için ürün kararı gerekiyor.

**Kanıt:**
- Deneyerek (geri alındı): `request_employee_preferred_name_service` → kuyruk satırı `payload` yalnız `employee_id, requested_name, request_id` içeriyor; `process_notification_outbox_service` → `ERROR: notification recipients are required` (`project_notification_recipients_service` satır 13); `fail_notification_outbox_service` → `retry`; dört yöneticinin zili boş. Mehmet'in Zeynep talebini görüp onaylaması; Mehmet'in kendi talebini onaylaması; şablon + üretici eklenince sağlık kontrolü "healthy"; alıcı elle eklenince "New notification" + boş metin.
- Kod okuyarak: `get_notification_inbox_v2_service` (şablon join'i yalnız `account_notification_items` kolunda), `project_notification_inbox_exchange_base` (başlık yoksa "New notification"), `decide_employee_preferred_name_service` / `list_pending_preferred_names_service` (yalnız `service_actor_has_permission(... 'employees.manage')`), outbox worker (`apps/api/src/notifications/notification-outbox-worker.ts`, hata → `fail_notification_outbox_service`). Bütün kuyruk üreticileri tarandı: alıcı listesi olmadan kuyruğa yazan **tek** üretici `request_employee_preferred_name_service`.

**Önerilen karar:** **Repo düzelsin**, ama yalnız "şablon + üretici kaydı" değil. (leave: high / do: moderate)
1. Üretici alıcı listesini kursun: "employees.manage" izni olan, aktif, Ali'nin lokasyon kapsamını karşılayan üyeler (Owner/Admin tüm lokasyonlar), **talep sahibi hariç**. Kapsam kuralı ("herhangi bir lokasyon" mu, "tüm lokasyonlar" mı) KAPSAM MODELİ SORUSU'na bağlı. Kuyruk notuna başlık, metin ve çalışanın çekmecesine giden bağlantı (`/app/employees?employee=…`) konsun; lokasyonlar da nota yazılsın ki politika çözücü lokasyon politikalarını uygulayabilsin.
2. Üretici kaydı + yayınlanmış şablon eklensin (#32/#33 ve resolver #20 yeşillenir).
3. Bekleyen talepler listesi ve karar aynı kapsam kuralını uygulasın (Mehmet, Zeynep'inkini görmesin/onaylayamasın). Kendi kendini onaylama sorusu cevaplanınca ona göre.
4. Bir uçtan uca test: talep → kuyruk işlenir → doğru yöneticinin zilinde bildirim var, kapsam dışı yöneticinin zilinde yok. Bu, envanter kontrolünün yakalayamadığı şeyi yakalar.

Gerekçe:
- Testin iddia ettiği değişmez bilinçli kurulmuş ve hedefle uyumlu; kırmızılık bir özelliğin yarım kaldığını doğru gösteriyor.
- Yalnız 2. adımı yapmak testleri yeşile çevirir, özelliği bozuk bırakır: "yanlış mantık üzerine doğru test".
- Hedefin en önemli kuralı (manager yalnız kendi lokasyonları) bu özellikte bugün hiç uygulanmıyor.
- Başka seçenek şu durumda doğru olurdu: ürün sahibi "tercih edilen ad için bildirim gerekmez" derse, iki tür katalogdan kaldırılır ve kuyruk yazımı silinir (en küçük değişiklik). JOIN-014 kararı bunun tersini söylüyor.

**Önceki karar ile karşılaştırma:** Önceki karar "REPO — iki türe şablon + producer eklensin" idi. Yön doğru, kapsam eksik ve dayandığı gözlem yanlış: bildirim "şablona inner join yüzünden görünmüyor" değil; alıcı listesi olmadığı için **hiç işlenemiyor** (işçi hatayla durup ölü mektuba atıyor). Şablon + üretici eklemek bunu düzeltmez. Karar genişlemeli: alıcılar + metin + kapsamlı onay ekranı + uçtan uca test.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:**
- **#43–#44 "existing account implicit default preserved"** — `notification_legacy_default_accounts` tablosu, 09-14 migration'ı anında var olan her hesabı "e-posta bildirimleri varsayılan açık kalsın" diye kaydediyor. Bu tam olarak "canlı veri yok" kuralının silinmesini istediği türden bir eski-veri toleransı: tablo, onu okuyan dal (`notification_default_channels_service`) ve #43–#44 silinmeli. Bugün tabloda 0 satır var (veritabanı yeniden kurulmuş); kod yolu yalnız artık oluşturulamayan bir durumu idare ediyor. (leave: low / do: safe)

**Kullanıcıya sorular:** alan geneli 1, 2 ve 4. sorular bu dosyadan doğuyor.

---

## Alan geneli bulgular

**Ortak kök nedenler**
- **Sabit sayı testleri.** Üç dosyada (platform_core #13, settings_admin #6, resolver #2–#4) "katalogda 9 tür" sabiti 9 Eylül'den beri yanlış; katalog her özellikle büyüyor. Asıl değişmez sağlık kontrolünde zaten var.
- **Sağlık kontrolü yalnız envanteri ölçüyor, teslimi ölçmüyor.** Tercih edilen ad türleri envantere eklenince kontrol "healthy" diyecek, bildirim yine kimseye gitmeyecek. Öneri: ölü mektup sayısı (`dead_letter_count`, zaten hesaplanıyor) sıfırdan büyükse durum "drift_detected" olsun; her üretici için en az bir "kuyruk işlendi → doğru kişinin zilinde" testi olsun. (leave: medium / do: safe)
- **İşletme bildirimlerinde metin şablonu hiç okunmuyor.** Başlık ve metin her üreticinin içinde yazılı; şablon tablosu yalnız hesap bildirimleri ve sağlık kontrolü için okunuyor. Sonuç: iki metin kaynağı, ve şablon zorunluluğu kimsenin görmediği metni yazdırıyor (ör. takas incelemesi zilde "Shift change ready for review", şablonda "New shift request"). Seçenek: ya zil metni şablondan okusun, ya işletme türleri için şablon şartı kalksın. Teknik karar; ürün sahibine sorulacak bir şey değil. (leave: low / do: moderate)

**KAPSAM MODELİ SORUSU girdileri (alan G için; hepsi ölçüldü)**
Bugün bildirim alıcıları dört farklı lokasyon mantığıyla seçiliyor:

| Olay | Alıcı yöneticiler nasıl seçiliyor | Ali (Kadıköy+Beşiktaş) için sonuç | Nasıl ölçüldü |
|---|---|---|---|
| İzin talebi (Requests → Time off) | Talebin **tek** lokasyonu (Ali açarken seçiyor) | Kadıköy seçtiyse: Owner, Ayşe, Mehmet. Burak habersiz. | Deneyle |
| Vardiya takası / cover (Shift Hub) | Vardiyanın lokasyonu; takasta iki vardiyanın lokasyonları | Kadıköy vardiyası: Mehmet (+owner/admin). Takas Kadıköy↔Beşiktaş: ikisi de; iki onay gerekir. | Kod okuyarak |
| Müsaitlik incelemesi | Çalışanın **tüm** lokasyonlarını kapsayan yönetici | Mehmet de Burak da değil; yalnız Owner ve Ayşe | Deneyle (`availability_actor_scope`) |
| Tercih edilen ad | Hiçbir lokasyon kontrolü yok (bildirim zaten gitmiyor) | Onayı herhangi bir manager verebilir; Mehmet, Zeynep'inkini de | Deneyle |
| Mesai düzeltmesi | Düzeltmenin lokasyonu | Kadıköy düzeltmesi: Mehmet (+owner/admin) | Kod okuyarak |

Özellikle açık senaryolar:
- **İzin, iki lokasyon:** Ali Kadıköy üzerinden izin istiyor, izin günlerinde bir Beşiktaş vardiyası var. Bildirim Mehmet'e gidiyor; Mehmet onaylayamıyor (Beşiktaş vardiyasını yayınlama yetkisi yok: "a manager with publishing access to every affected location must decide"). Burak onaylayabilir mi? Hayır (talep Kadıköy'e bağlı). Bildirim de almıyor. Sonuç: yalnız Owner/Ayşe karar verebilir, ama ilk haberi alan Mehmet. (Onay kısmı kod okuması.)
- **Müsaitlik, iki lokasyon:** Ali'nin müsaitlik talebini ne Mehmet ne Burak görüyor. İki lokasyonlu her çalışanın müsaitliği admin/owner'a kalıyor.
- **Cover, lokasyonlar arası:** Kadıköy vardiyasını Beşiktaş'ta da çalışan Ali alırsa yalnız Kadıköy yöneticisi onaylıyor; Burak'ın haberi yok. Hedefteki "Kadıköy vardiyası Beşiktaş çalışanına → iki lokasyonun onayı" ile karşılaştırılmalı (kod okuması; asıl alan takas ajanında).

**Kendi talebine bildirim (düz hata, ürün sorusu değil)**
Mehmet kendi izin talebini açınca kendi ziline "New time-off request — A schedule request needs manager review" düşüyor (deneyle), ama sistem ona kendi talebini onaylatmıyor. Mesai düzeltmesinde de talep sahibi alıcılardan çıkarılmıyor (kod okuması). Takas ve müsaitlik talep sahibini zaten çıkarıyor. Öneri: izin ve mesai düzeltmesi üreticilerinde talep sahibi alıcı listesinden çıkarılsın. (leave: medium / do: safe)

**Hedefle çelişen, testlerde görünmeyen yapılar**
- **İki gelen kutusu** (platform_core #35'te ayrıntı): Home → Notifications kutucuğu eski tablodan, zil yeniden okuyor; okundu/kapatma senkron değil (deneyle). (leave: medium / do: moderate)
- **Politika çözücü yalnız 1. sürümü okuyor** (resolver bölümünde ayrıntı; deneyle). Eski bir sürümü emekliye ayırmak yeni sürümün bildirimlerini sessizce keser. (leave: medium / do: moderate)
- **Katalogun ikinci kopyası TypeScript'te** (`packages/shared/src/notification-catalog.ts` ve `notification-display.ts`): 16 tür biliyor, veritabanında 27 işletme türü var. 9 belge türü ve 2 tercih edilen ad türü etiketsiz; Settings → Notifications'ta başlıkları tür anahtarından türetiliyor. Eşitlik testi yalnız 4 migration'a baktığı için farkı yakalamıyor. (leave: low / do: safe)
- **Eski-veri toleransı:** `notification_legacy_default_accounts` (account_notification_scope bölümünde). (leave: low / do: safe)

**Bildirim tercihleri hedefle çelişiyor mu (kısa)**
- Settings → Notifications: Owner/Admin yazıyor; lokasyonlu bir manager'a özel rolle yazma verilse bile yalnız kendi lokasyonuna politika yazabiliyor. Hedefle uyumlu.
- Manager Settings → Notifications'ı hiç okuyamıyor; hedef "Settings'te çoğunlukla salt-okunur" diyor (6. soru, düşük önem).
- Account → Notifications: çalışan, yalnız yöneticilere giden türlerin anahtarlarını da görüyor (ör. "New time-off request"); rol filtresi yok (kod okuması; low). Çelişki değil, gürültü.
- Onay bekleyen türler (izin talebi geldi, tercih edilen ad onayı) org politikasıyla tamamen kapatılabiliyor; kapatılırsa talepler sessizce bekler. "Kapatılamaz" yalnız güvenlik/sistem kategorisinde mümkün. Settings IA kararı ("hangi olay, hangi rol, hangisi kapatılamaz") işletmenin bunu seçebilmesini öngörüyor; bugün seçemiyor. (7. soru, düşük önem.)

**Fikir ve tavsiyeler**
- Tek bir "bu olayı kimler görmeli" yardımcı fonksiyonu: bugün beş üretici beş ayrı alıcı sorgusu yazıyor ve beşi farklı kapsam kuralı uyguluyor. Kapsam modeli kararı gelince tek fonksiyon, bütün üreticiler onu çağırır; kural bir yerde değişir.
- BL-045 (Notifications fonksiyonel audit) ve BL-046 (Settings → Notifications sadeleştirme, producer audit) bu bulguların doğal evi. Tercih edilen ad düzeltmesi JOIN-014'ün kalan işine aittir.

## Kullanıcıya sorular (alan geneli, önem sırasıyla)

1. **KAPSAM MODELİ SORUSU — Tercih edilen ad kime sorulur?** Ali (Kadıköy + Beşiktaş) Account → Profile'da "Alican" yazdı.
   - Neden: JOIN-014 "yöneticiye bildirim gider / onaya gider" diyor ama hangi yönetici olduğunu söylemiyor; bugün kod lokasyona hiç bakmıyor (Mehmet, yalnız Beşiktaş'taki Zeynep'in adını onaylayabildi — deneyle).
   - Seçenekler: (a) **Owner + Admin + Ali'nin lokasyonlarından herhangi birinin yöneticisi** (Mehmet ve Burak ikisi de haberdar, biri onaylar) — önerim: ad lokasyona özgü değil, iki yöneticiyi de beklemek anlamsız; (b) Owner + Admin + Ali'nin **tüm** lokasyonlarını kapsayan yönetici (bugünkü müsaitlik mantığı; Ali için yalnız Owner/Admin); (c) yalnız Owner + Admin.
2. **Kendi talebini kendisi onaylayabilir mi?** Mehmet (manager) kendi "Memo" talebini bugün kendisi onaylayabiliyor (deneyle).
   - Neden: izin ve takas bunu yasaklıyor; tercih edilen ad ise zararsız bir alan ve auto modda zaten kimse sormuyor.
   - Seçenekler: (a) **yasak, başka bir yetkili onaylar**; owner'ın kendi talebi otomatik yayınlanır (owner'ın üstünde onaylayacak kimse yok) — önerim, kurallar tutarlı kalır; (b) serbest; (c) yönetici rolündekilerin tercih edilen adı her zaman otomatik yayınlanır.
3. **KAPSAM MODELİ SORUSU — İki lokasyonlu çalışanın izin talebi.** Ali Kadıköy üzerinden izin istiyor, izin günlerinde Beşiktaş vardiyası da var.
   - Neden: bugün Mehmet haberdar ama onaylayamıyor; Burak ne haberdar ne yetkili; yalnız Owner/Admin karar verebiliyor (bildirim deneyle, onay kod okumasıyla).
   - Seçenekler: (a) izin lokasyona bağlanmaz; Ali'nin lokasyonlarının bütün yöneticileri haberdar olur, her biri kendi lokasyonundaki vardiyalar için karar verir, hepsi onaylayınca izin kesinleşir; (b) izin lokasyona bağlanmaz, herhangi bir lokasyon yöneticisi tamamına karar verir; (c) iki lokasyonlu çalışanın izni yalnız Owner/Admin'e gider. Önerim: (a), hedefin takas için koyduğu "iki lokasyon → iki onay" kuralıyla aynı. Alan G'nin genel kararına bağlanmalı.
4. **KAPSAM MODELİ SORUSU — Bildirimler için tek kural.** Beş olay türü dört farklı lokasyon mantığı kullanıyor (yukarıdaki tablo). Müsaitlik incelemesi iki lokasyonlu çalışanı hiçbir lokasyon yöneticisine göstermiyor.
   - Seçenekler: (a) "olayın ilgili olduğu lokasyonlardan **herhangi birinin** yöneticisi haberdar olur; onay, etkilenen her lokasyonun yetkilisinden" — önerim; (b) "**tüm** lokasyonları kapsayan yönetici" (bugünkü müsaitlik; iki lokasyonlu çalışan fiilen admin'e kalır); (c) olay türü başına ayrı karar.
5. **Tercih edilen ad özelliği bildirimli mi kalsın?** JOIN-014 "evet" diyor; bu soru yalnız, önerilen düzeltme (alıcılar + metin + kapsamlı onay + uçtan uca test) bu işin boyutunu büyüttüğü için soruluyor. Seçenekler: (a) **evet, yukarıdaki düzeltme** — önerim; (b) şimdilik bildirimsiz: iki tür katalogdan kaldırılır, kuyruk yazımı silinir, manager modundaki bekleyen talepler için Employees listesinde bir rozet yeter.
6. **Manager Settings → Notifications'ı görsün mü?** Bugün hiç göremiyor; hedef "Settings'te çoğunlukla salt-okunur". Seçenekler: (a) **şimdilik görmesin** — önerim, düşük önem, Settings IA işiyle birlikte ele alınsın; (b) salt-okunur görsün.
7. **Onay bekleyen bildirimler kapatılabilir mi?** Owner bugün "izin talebi geldi" bildirimini herkes için kapatabiliyor; o zaman talepler sessizce bekler. Seçenekler: (a) **işletme her tür için "kapatılamaz" işaretleyebilsin** (Settings IA kararının dediği) — önerim; (b) onay bekleyen türler her zaman kapatılamaz olsun; (c) bugünkü gibi kalsın.
