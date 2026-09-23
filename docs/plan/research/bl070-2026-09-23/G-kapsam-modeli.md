# G — Kapsam modeli: manager kimi görür, neye dokunur

*Alan G, 2026-09-22. Salt-okunur çalışma. Kod: main `41783c7`. Bütün veritabanı denemeleri tek transaction içinde yapıldı ve `rollback` ile geri alındı.*

## Kısa cevap

**Kusursuz bir plan var ve hiyerarşiyi değiştirmek gerekmiyor. Değişmesi gereken, "manager yalnız kendi lokasyonu" cümlesinin neye uygulandığı.** Bu cümle iki farklı şeyi karıştırıyor:

- **Vardiya bir lokasyona aittir.** Kadıköy'ün Salı Lunch vardiyası Kadıköy'ündür. Yazmak, yayınlamak, takas onaylamak bu yüzden yalnız o lokasyonun manager'ının işidir.
- **Kişi hiçbir lokasyona ait değildir.** Ali tek kişidir. Tek adı, tek availability'si, tek izni, tek belge dosyası vardır. Ali'nin çalıştığı lokasyonların her manager'ı Ali'yi bütünüyle görür.

Senaryoların hepsi, bu ikisi aynı kuralla yönetilmeye çalışılınca kırılıyor. Önerdiğim model (**M2 — "Kişi ortak, vardiya yerel"**) tek cümleyle şöyle:

> **Kişi, onu çalıştıran her manager'ındır. Vardiya, bulunduğu lokasyonundur. Başka bir lokasyonu etkileyen karar için o lokasyonun da onayı gerekir.**

Bugünkü kod bunun yarısını zaten yapıyor. Eksik olan yarının kısa listesi Bölüm 4'te.

---

## 0. Kişiler, lokasyonlar ve birkaç kavram

| Kim | Rol | Çalıştığı / yönettiği lokasyon |
|---|---|---|
| **Zeynep** | admin | organizasyonun tamamı |
| **Ayşe** | manager | Kadıköy |
| **Mehmet** | manager | Beşiktaş |
| **Ali** | employee | hem Kadıköy hem Beşiktaş |
| **Veli** | employee | yalnız Beşiktaş |

- **Kapsam listesi** (kodda `membership_location_scopes`): Ayşe'nin yönettiği lokasyonların listesi. Ayşe'nin kendi çalışan kaydındaki lokasyonlardan otomatik doldurulur (`app_private.sync_manager_location_scope`). Ayşe'nin kaydına Beşiktaş eklenirse, Ayşe Beşiktaş'ın da manager'ı olur. Bu kararın yazılı gerekçesi migration'da duruyor (`20260914092711_bl051_roles_permissions.sql:1515`): *"Manager location scope is a projection of employee work locations, not a second role setting."*
- **"Tüm lokasyonlar" bayrağı** (`workspace_memberships.all_locations`): owner ve admin'de hep açık, manager'da hep kapalıdır. Bunu bir tetikleyici zorlar (`app_private.enforce_role_location_scope`).
- Kodda iki ayrı kapsam kuralı var ve bu raporun büyük kısmı bu ayrımın üstüne kurulu:
  - **HERHANGİ-BİR kuralı:** Ali'nin lokasyonlarından biri Ayşe'nin listesindeyse yeter. Ali Kadıköy'de çalıştığı için Ayşe onun her şeyine erişir.
  - **HEPSİ kuralı:** Ali'nin bütün lokasyonları Ayşe'nin listesinde olmalı. Ali Beşiktaş'ta da çalıştığı için ne Ayşe erişebilir ne Mehmet; iş admin'e kalır.

**Denemelerin kurulumu:** Meyhouse test işletmesinde Palo Alto "Kadıköy", Sunnyvale "Beşiktaş" oldu. Alex, Ayşe rolüne girdi (manager, Kadıköy). Burak, Mehmet rolüne girdi (manager, yalnız Beşiktaş). Ferhat, Ali rolüne girdi (iki lokasyon). Admin Alejandro, Zeynep rolüne girdi. Deneme dosyaları: `scratchpad/bl070-research/G/exp1.sql` … `exp5.sql`. Her bulgunun yanında nasıl bulunduğu yazıyor: **[K]** kod okundu, **[D]** geri alınan denemeyle ölçüldü.

---

## 1. Bugün kod hangi nesneye hangi kuralı uyguluyor

| Nesne (ekrandaki yeri) | Görme | İşlem | Kanıt |
|---|---|---|---|
| Çalışan çekmecesi (Employees → Ali: Profile / Employment / Availability / Documents / Access) | HERHANGİ-BİR | HERHANGİ-BİR. Ayşe Ali'nin adını ve job'larını değiştirebilir, Ali'yi işten çıkarabilir | [D] Q1, Q3 · `public.can_access_employee`, `can_manage_employee_record` |
| Plan ızgarası (Schedule) | Yalnız kendi lokasyonu. Ali'nin Beşiktaş vardiyası hiç görünmez | Yalnız kendi lokasyonu | [D] Q5 · `get_schedule_read_model_service_label_base` |
| İzin talepleri (Schedule → Requests) | Talebin **tek** lokasyonu var ve lokasyonu employee seçiyor. Talebi yalnız o lokasyonun manager'ı görür | Aynı. Onay başka lokasyondaki bir vardiyayı etkiliyorsa manager onaylayamaz, iş admin'e kalır | [D] Q10, Q11 · `submit_employee_time_off_periods_service`, `preview_time_off_assignment_decision_service` |
| Vardiya takası / devri (Schedule → Requests, Shift Hub) | Vardiyanın lokasyonu | Vardiyanın lokasyonu. Swap iki lokasyona dokunuyorsa iki lokasyon ayrı ayrı onaylar | [K] `shift_exchanges_command_service`, `shift_exchange_preview` |
| Availability, haftalık tercihler (Availability sayfası; çekmecede Availability sekmesi) | HERHANGİ-BİR | HERHANGİ-BİR. Ayşe de Mehmet de Ali'nin tek "yönetici notu" katmanına yazar | [D] Q4b · `weekly_preference_manager_scope` |
| Availability değişiklik talepleri (eski talep akışı) | HERHANGİ-BİR | **HEPSİ.** Ali'nin değişikliğini ne Ayşe onaylayabilir ne Mehmet; yalnız admin/owner onaylar ve bildirimi de yalnız onlar alır | [D] Q4 · `availability_actor_scope(...,true)`, `availability_notify` |
| Belgeler ve onboarding incelemesi | HERHANGİ-BİR | HERHANGİ-BİR | [K] `service_actor_can_access_employee` |
| Duyurular | kendi lokasyonları | Kendi lokasyonları. Bütün organizasyona duyuruyu yalnız owner/admin yapar | [K] `save_announcement_audience_service` |
| Schedule → Export | kendi lokasyonları | kendi lokasyonları | [K] `preview_schedule_export_service` |

Sonuç: **kod kişi kayıtlarında zaten "kişi ortak" mantığıyla çalışıyor, vardiyada "vardiya yerel" mantığıyla.** Eksik kalan dört yer var: ızgarada başka lokasyonun görünmemesi, iznin lokasyona bağlı olması, eski availability talep akışındaki HEPSİ kuralı ve işten çıkarmanın kuralsız kalması.

---

## 2. Senaryo matrisi

Her senaryoda (a) katı modelin, yani "manager yalnız kendi lokasyonu" kuralının harfiyen uygulanmasının ne dediği, (b) bugünkü kodun ne yaptığı ve (c) bir etiket var. **KAPSAM MODELİ SORUSU** bir ürün kararı gerektiğini söyler. **HATA** hangi modelde olunursa olunsun yanlış çalışan bir şeyi gösterir.

### S1 — Ali'nin Kadıköy ve Beşiktaş vardiyalarını kim görür, kim yazar
- **(a) Katı model:** Ayşe Kadıköy'ü, Mehmet Beşiktaş'ı görür ve yazar. Burada bir sorun yok. Sorun görmede: Ayşe Ali'yi planlarken Ali'nin Beşiktaş'ta ne zaman çalıştığını bilmez.
- **(b) Kod:** Ayşe'nin ızgarasında yalnız Kadıköy var. Ali'nin satırında da yalnız Kadıköy görünüyor, Beşiktaş vardiyası listede yok (0 vardiya) [D Q5]. Aynı sırada Ali'nin çekmecesi Beşiktaş'ın adını gösteriyor (Employment → lokasyonlar) [K `get_employee_detail`]. Ayşe'nin bildiği şu: "Ali Beşiktaş'ta da çalışıyor ama ne zaman bilmiyorum."
- **(c)** Yazma kuralı UYUMLU. Görme kuralı **KAPSAM MODELİ SORUSU**.

### S2 — Aynı gün iki lokasyon: çakışma, yol süresi, dinlenme
Mehmet, Ali'yi Salı 12:00–16:00 Beşiktaş'a yayınlamış. Ayşe aynı Salı için Ali'yi Kadıköy'e yazıyor.
- **(a) Katı model:** Ayşe Beşiktaş vardiyasını göremiyorsa çakışmayı da bilemez. Sistem "Ali o saatte dolu" diyebilir ama nerede ve ne zaman olduğunu söyleyemez. Kural burada kırılıyor.
- **(b) Kod:**
  - **Düzenleyici açıkken (Schedule → Edit): çakışma yakalanmıyor.** Ayşe Ali'yi 13:00–17:00'e yazdı; sistem "izin verildi" dedi ve hiçbir uyarı göstermedi [D Q7, T2]. Nedeni şu: düzenleme oturumu yalnız Ayşe'nin lokasyonlarının vardiyalarını yüklüyor ve kontrol aynı haftanın öbür lokasyonlarındaki yayınlanmış vardiyaları dışarıda bırakıyor (`assess_weekly_shift_availability`: "The edit session replaces its week"). Aynı kontrol oturum dışından yapılınca çakışmayı buluyor: "time_overlap / blocked" [D Q8]. Yol süresi de öyle: süreyi 60 dakikaya ayarlayıp 16:30'a yazınca oturumda uyarı çıkmadı, oturum dışında "minimum_travel" çıktı [D T3, T4].
  - **Yayınlarken yakalanıyor:** yayın önizlemesi "Employee already has an overlapping shift." diyerek yayını engelledi; bu engel aşılamıyor [D T7]. Ama mesaj Beşiktaş'ı ve saati söylemiyor, Beşiktaş vardiyası da ızgarada yok. Ayşe neyi düzelteceğini bilmeden engele takılıyor.
- **(c)** Düzenleyicideki kör nokta **HATA**: hangi modelde olunursa olunsun düzelmeli. Ne kadar ayrıntının gösterileceği (lokasyon ve saat mi, yalnız "meşgul" mü) **KAPSAM MODELİ SORUSU**.

### S3 — Ayşe Kadıköy'ü, Mehmet Beşiktaş'ı aynı hafta planlamak istiyor
- **(a) Katı model:** İki lokasyon birbirinden bağımsız olduğu için ikisi de aynı anda çalışabilmeli.
- **(b) Kod:** Düzenleme kilidi lokasyon başına değil, **işletme ve hafta başına tek**. Ayşe düzenleyiciyi açtığında Mehmet "başkası düzenliyor" uyarısıyla kilitleniyor [D Q9; `schedule_edit_sessions_active_week_idx`]. Kilidi yalnız admin/owner devralabiliyor.
- **Devralmada veri kaybı [D A1–A10]:** Zeynep aynı taslağa bir Kadıköy ve bir Beşiktaş vardiyası koydu. Ayşe o taslağı açtı; oturuma yalnız Kadıköy yüklendi. Zeynep oturumu devralıp aynı taslağa kaydetti. Sonuç: **taslaktaki Beşiktaş vardiyası sessizce silindi** (2 vardiyadan 1'i kaldı). Kaydetme, Zeynep'in yönettiği bütün lokasyonların vardiyalarını taslaktan siliyor ama yalnız oturumda olanları geri yazıyor (`save_schedule_edit_session_service_base`).
- **(c)** **HATA** (iki tane). Kilit lokasyon ve hafta başına olmalı. Kaydetme de yalnız oturumun yüklediği lokasyonlara dokunmalı. Her iki modelde de gerekli.

### S4 — Ali'nin availability'si
Ali, bir haftalık müsait olmadığı saatleri bir kez girer ve bu kayıt bütün lokasyonlar için geçerlidir.
- **(a) Katı model:** "Kadıköy'e ait availability" diye bir şey yok. Availability kişiye ait. Katı model burada iki kötü seçenek bırakıyor: ya her iki manager da görür (bu zaten ortak modeldir) ya kimse görmez.
- **(b) Kod:** Kayıt kişi başına tek (`employee_weekly_preferences`). Ayşe de Mehmet de okuyor ve aynı tek "yönetici notu" katmanına yazıyor [D Q4b]. Ama eski talep akışında (Availability → talepler) Ali'nin bir değişikliğini onaylamak HEPSİ kuralına bağlı. Ne Ayşe ne Mehmet onaylayabiliyor; bildirim de yalnız admin/owner'a gidiyor [D Q4; K `availability_notify`].
- **(c)** Aynı kişi için iki farklı kural uygulanıyor, bu tutarsız. Bu iki sistemden birinin kalkacağı BL-091'de zaten konuşuluyor. **KAPSAM MODELİ SORUSU:** yönetici notu herkese ortak tek katman mı olsun, lokasyon başına mı?

### S5 — Ali'nin izin talebi (Salı tüm gün)
- **(a) Katı model:** İzin kişiye ait ama katı model ona bir lokasyon yapıştırmak zorunda. Kod bugün tam olarak bunu yapıyor ve sonuç aşağıda.
- **(b) Kod:**
  - Ali talebi gönderirken lokasyonu kendisi seçiyor ve yalnız o lokasyon kaydediliyor [K `submit_employee_time_off_periods_service`]. Ali Kadıköy'ü seçerse talebi yalnız Ayşe görüyor (bekleyen: 1). Mehmet görmüyor (bekleyen: 0) [D Q11, Q11b].
  - Ali'nin Salı günü Beşiktaş'ta yayınlanmış bir vardiyası varsa **Ayşe onaylayamıyor**. Önizleme "1 kısıtlı vardiya" diyor [D Q10] ve onay "bütün etkilenen lokasyonlarda yayın yetkisi olan bir yönetici karar vermeli" hatasıyla duruyor [K `decide_time_off_with_assignments_service`]. Mehmet ise talebi göremediği için karar veremiyor. **Sonuç: talep admin'e kalıyor, ama bunu kimseye söyleyen bir bildirim yok.** "Yeni izin talebi" bildirimi talebin lokasyonunun manager'larına ve her talepte olduğu gibi admin/owner'a gidiyor. Ama hiçbir bildirim admin'e "Ayşe bunu onaylayamıyor, karar sende" demiyor; Mehmet de hiç haber almıyor [K `notify_schedule_request_event_service`].
  - Onaylanan izin her lokasyonda HARD conflict oluyor: kontrol lokasyona değil kişiye bakıyor [K `assess_weekly_shift_availability`]. Bu hedefle uyumlu.
- **(c)** **KAPSAM MODELİ SORUSU**, bu raporun en önemlisi. İzin kişiye mi aittir, lokasyona mı; birden fazla lokasyon etkileniyorsa kim onaylar?

### S6 — Ali Kadıköy vardiyasını bırakıyor (release / cover); Beşiktaş'ta da çalışan biri alıyor
- **(a) Katı model:** Vardiya Kadıköy'ün olduğu için onayı Ayşe verir. Hedef metin *"Kadıköy vardiyası Beşiktaş çalışanına: her iki lokasyonun onayı"* diyor.
- **(b) Kod:** Alacak kişinin Kadıköy'e ve o job'a atanmış olması şart. Salt Beşiktaş'ta çalışan Veli uygun olamaz ("Not assigned to this location"). Alan kişinin Beşiktaş vardiyalarıyla çakışma, yol süresi ve dinlenme otomatik kontrol ediliyor [K `weekly_assignment_candidate_base`]. Onayı yalnız vardiyanın lokasyonu veriyor, yani yalnız Ayşe [K `shift_exchange_preview`].
- **(c)** **KAPSAM MODELİ SORUSU:** Kadıköy'e de atanmış biri devraldığında Beşiktaş'ın da onayı gerekir mi? Beşiktaş'ın bu işteki tek meşru ilgisi (çakışma ve dinlenme) zaten otomatik kontrol ediliyor.

### S7 — Swap: Ali'nin Kadıköy vardiyası ile Veli'nin Beşiktaş vardiyası
- **(a) Katı model:** Her iki vardiyanın lokasyonu onaylar.
- **(b) Kod:** Tam olarak bu. Oy lokasyon başına tutuluyor. Ayşe onaylayınca Veli'ye ve Ali'ye "Bir lokasyon onayladı, diğer manager bekleniyor" mesajı gidiyor; Mehmet de onaylayınca takas gerçekleşiyor. Kendi takasını onaylamak yasak [K `shift_exchanges_command_service`, `shift_exchange_votes`]. Ancak bir swap'ın gerçekleşmesi için Ali'nin de Beşiktaş'a atanmış olması gerekiyor (uygunluk kuralı).
- **(c)** UYUMLU. Bu oy mekanizması, iki lokasyonlu izin onayı için de hazır bir kalıp.

### S8 — Ali'yi işten çıkarma / arşivleme (D3)
- **(a) Katı model:** Ayşe Ali'yi çıkarırsa Ali Beşiktaş'tan da çıkar, çünkü işten çıkarma kişiye uygulanır. Katı model burada kendiliğinden D3'e varıyor: yalnız Ali'nin bütün lokasyonları Ayşe'ninse.
- **(b) Kod:** **D3 uygulanmamış.** Ayşe Ali'yi çıkarabiliyor (HERHANGİ-BİR kuralı) [D Q3]. İşten çıkarma Ali'nin **bütün lokasyonlardaki** gelecek yayınlanmış vardiyalarını boşaltıyor, Beşiktaş dahil [K `terminate_employee`, `employee_offboarding_shift_actions`]. Yani Ayşe'nin bir tıklaması Mehmet'in planında haber vermeden delik açıyor.
- **(c)** Hedefle (D3) çelişiyor. D3'ü doğru buluyorum: bkz. Soru 7.

### S9 — Ali'nin ortak kaydını düzenleme (ad, iletişim, job'lar)
- **(a) Katı model:** Ad ve iletişim bilgisi kişiye ait. Job'lar da kişiye ait ama Beşiktaş'taki uygunluğu değiştiriyor.
- **(b) Kod:** Ayşe her şeyi düzenleyebiliyor; buna Ali'nin Beşiktaş'ta kullanılan bir job'unu (ör. Busser) kaldırmak da dahil. Kaydetme Beşiktaş'taki gelecek vardiyalara bakmıyor [K `save_employee` 146–147]. Vardiya yerinde kalıyor ama Ali o vardiya için artık uygun değil. Bu da sonraki kontrollerde "assignment_missing" olarak çıkacak.
- **(c)** **KAPSAM MODELİ SORUSU** (küçük). Ad ve iletişim ortak kalsın; başka lokasyonu etkileyen job değişikliği için bir koruma gerekli.

### S10 — Ali'yi bir lokasyondan çıkarma, lokasyon ekleme
- **(b) Kod:** Ayşe Ali'ye Beşiktaş ekleyemiyor ve Ali'yi Beşiktaş'tan çıkaramıyor ("cannot remove an employee location outside your scope"). Kadıköy'den çıkarabiliyor [K `save_employee` 49–65, `can_assign_employee_locations`]. Çıkardığında Ali'nin gelecek Kadıköy vardiyalarına dokunulmuyor [K]. Ayşe Ali'ye erişimini de kaybediyor, ama Ali'nin vardiyaları Ayşe'nin ızgarasında kalıyor.
- **(c)** Kural UYUMLU. Kaldırmanın gelecekteki vardiyalarda bıraktığı iz ise ayrı bir iş kalemi (Bölüm 4, D6).

### S11 — Belgeler ve onboarding incelemesi
- **(b) Kod:** Ayşe de Mehmet de Ali'nin belgelerini görüp onaylayabiliyor; hangisi önce davranırsa [K `service_actor_can_access_employee`].
- **(c)** UYUMLU (kişi ortak). Tek not: bekleyen belge iki kuyrukta birden görünüyor ve bu tasarım gereği.

### S12 — Bildirimler
- **(b) Kod:** İzin bildirimi talebin tek lokasyonunun manager'larına ve admin/owner'a gidiyor. Ali'nin diğer lokasyonunun manager'ı haber almıyor (S5'teki kör nokta buradan geliyor). Takas bildirimi her iki vardiyanın lokasyonuna gidiyor. Eski akışta availability talebinin bildirimi yalnız HEPSİ kuralını geçenlere, pratikte admin/owner'a gidiyor [K `notify_schedule_request_event_service`, `shift_exchange_emit_notification_base`, `availability_notify`].
- **(c)** Bildirim, onay kuralının gölgesidir. Onay kuralı düzelince bildirim de onu izlemeli.

### S13 — Duyurular
- **(b) Kod:** Ayşe yalnız Kadıköy'e duyuru yapabiliyor. Ali bir Kadıköy duyurusunu da bir Beşiktaş duyurusunu da alıyor, çünkü ikisine de atanmış. Bütün organizasyona duyuruyu yalnız owner/admin yapabiliyor [K `save_announcement_audience_service`, `announcement_member_matches_locations_service`].
- **(c)** UYUMLU.

### S14 — Raporlar ve dışa aktarma (Schedule → Export)
- **(b) Kod:** Ayşe yalnız Kadıköy'ü dışa aktarabiliyor. Dökümde Ali'nin Beşiktaş saatleri yok [K `preview_schedule_export_service`]. Time Entries ekranı da lokasyon izinli (`time.read.location`) ama derin incelemedim.
- **(c)** UYUMLU. Tek kayıp: Ayşe Ali'nin haftalık toplam saatini göremiyor (fazla mesai takibi için). Model seçimine bağlı; M2 bunu kolaylaştırır.

### S15 — Manager'ın kendisi de çalışan (Ayşe'nin kendi vardiyası ve talepleri)
- **Ayşe'nin Beşiktaş'ta vardiyası olabilir mi?** Kodda Beşiktaş vardiyası alabilmek için Ayşe'nin kaydında Beşiktaş olmalı. Beşiktaş kaydına eklenince Ayşe **otomatik olarak Beşiktaş manager'ı da oluyor**. Denemede Mehmet'e Kadıköy çalışma yeri eklenince kapsamı "Kadıköy, Beşiktaş" oldu [D W1]. "Orada çalışır ama yönetmez" diye bir seçenek yok.
- **Ayşe'nin izin talebini kim onaylar?** Kendi kararı yasak ("another manager must review") [K]. Kadıköy'ün başka bir manager'ı ya da admin/owner onaylıyor. Takasta da aynısı ("A separate manager must approve your own exchange") [K].
- **Ayşe bu talepleri nereden gönderiyor?** Hiçbir yerden. Çalışan arayüzü (Shift Hub, izin talebi) web'de yalnız `employee` rolüne açık (`apps/web/src/App.tsx:435–441`, `roles={["employee"]}`). Veritabanı ve API buna izin veriyor, ekran vermiyor. Brief bu ihtimali zaten işaret etmişti; şimdi doğrulandı.
- **(c)** **KAPSAM MODELİ SORUSU**: çalıştığı yer ile yönettiği yerin ayrılması. Ekranın manager'lara kapalı olması ise ayrı ve kapsam dışı bir eksik (Soru 11).

### S16 — Manager'ın hiç lokasyonu yok
- **(b) Kod:** Kapsam listesi boş kalıyor. Ayşe Schedule'ı, Requests'i açabiliyor ama içleri boş. Kendi yarattığı "taslak ve lokasyonsuz" kayıtlar dışında kimseye erişemiyor [K `sync_manager_location_scope`, `get_schedule_read_model_service_label_base`]. Bu durum şöyle doğuyor: manager "plandan hariç" (Exclude from schedule) işaretlenmiş ve hiç lokasyon verilmemişse. Tersine, "plandan hariç + lokasyonlar" bugün de mümkün: bu, **vardiya almayan saf yönetici** demek, ve kapsam doğru oluşuyor.
- **(c)** **KAPSAM MODELİ SORUSU** (küçük). Lokasyonsuz manager hiç olmamalı; rol verilirken engellenmeli.

### S17 — Aynı lokasyonda iki manager (Ayşe ve Can, ikisi de Kadıköy)
- **(b) Kod:** İkisinin yetkisi eşit; önce davranan kazanıyor, sürüm kontrolü çift kararı önlüyor. Ancak:
  - Ayşe, Can'ın çekmecesini açamıyor (manager başka bir manager'ın kaydını göremez) [K `public.can_access_employee`; D W2]. Aynı sırada Can'ın satırını Kadıköy ızgarasında görüyor ve Can'ı vardiyaya yazabiliyor [D W3].
  - İzin ve takas onayında **rütbe kontrolü yok.** Ayşe, Can'ın izin talebini onaylayabilir. Zeynep (admin) Kadıköy'ü seçip izin isterse Ayşe onu da onaylayabilir [K `apply_time_off_period_decision`: yalnız lokasyon izni ve "kendisi değil" kontrolü var].
- **(c)** **KAPSAM MODELİ SORUSU:** manager kendi rütbesindekiler ve üstündekiler üzerinde onay verebilir mi? 7shifts bunu yalnız "alt rütbeden" gelen taleplerle sınırlıyor (Bölüm 3).

### S18 — Manager'a lokasyon eklenince, çıkarılınca; rolü düşürülünce
- **Ekleme ve çıkarma:** Kapsam anında güncelleniyor [K tetikleyiciler `bl051_sync_*`]. Bekleyen swap oyları onay anında yeniden kontrol ediliyor; lokasyonunu kaybeden birinin oyu sayılmıyor [K `shift_exchange_preview`]. UYUMLU.
- **Rol düşürme:** Ayşe employee'ye düşürülünce kapsam satırı **silinmiyor** ve "tüm lokasyonlar" bayrağı **açık** kalıyor [D D2]. Senkronizasyon yalnız manager'lar için çalışıyor. Vardiya ve çalışan ekranlarında zararsız, çünkü oralar rolü ayrıca kontrol ediyor. Ama `app_private.can_access_location` rolü kontrol etmiyor; lokasyon listesini okuma izni o yüzden açık kalıyor. Düşük önemde bir tutarsızlık.

### S19 — Admin'in kendi çekmece atamaları (Zeynep)
- **(b) Kod:** Zeynep'in erişimi kaydındaki lokasyonlardan bağımsız olarak hep organizasyonun tamamı. Kaydındaki lokasyonlar yalnız "nerede vardiyaya yazılabilir"i belirliyor. UYUMLU. Tek not: Zeynep kendi kaydını düzenleyemiyor. Admin yalnız manager ve employee kayıtlarını düzenleyebiliyor, admin kayıtlarını (kendisininki dahil) owner düzenliyor [K `can_manage_employee_record`]. "Admin atama owner'a özel" kararıyla tutarlı, ama Zeynep kendini Beşiktaş vardiyasına yazılabilir yapmak için owner'a gitmek zorunda.

### S20 — Owner'ın kendi izni
- **(b) Kod:** Kendi kararını veremiyor. Admin varsa admin onaylıyor; admin yoksa talep kimsenin onaylayamadığı bir durumda kalıyor [K]. **KAPSAM MODELİ SORUSU** (küçük, Soru 12).

---

## 3. Sektör örnekleri

Kaynaklar üreticilerin kendi yardım merkezleri, 2026-09-22'de okundu. 7shifts sayfaları tarayıcıyla açılamadığı için yardım merkezinin genel makale akışından okundu; metin aynı. Homebase'in iki iddiası yalnız arama sonucu özetinden görülebildi ve **(özet)** diye işaretli. Bulunamayan iddia yazılmadı.

| Ürün | Manager'ın görme kapsamı | Başka lokasyondaki vardiya | İzin | Takas | Kişi kaydı ve işten çıkarma |
|---|---|---|---|---|---|
| **7shifts** | Owner ve Admin tüm hesap; diğer roller "profilinde atanmış lokasyon ve departmanlarla sınırlı" [S1][S2] | Başka lokasyondaki vardiya **gri ve tıklanamaz** görünür [S4] | Talep formunda lokasyon yok [S6]. Aynı lokasyonu paylaşan ve **alt rütbeden** gelen talepleri alır. Onaylayacak manager yoksa Admin'e gider [S5][S2] | Lokasyonlar arası yalnız "Account-Wide Shift Pool" açılırsa; onaycı yalnız kendi lokasyonunun talebini görür [S8][S10] | Alt rütbedeyse ve bir lokasyonu paylaşıyorsa düzenler ve pasifleştirir [S2] |
| **Deputy** | Location Manager atanmış lokasyon(lar)la sınırlı. Özel rol "View all locations" alabilir [D1][D10] | Çakışma uyarısı "vardiya başka bir lokasyondaysa bile" çıkar ve kişi seçilemez [D4] | Kişinin manager'ları görür ve onaylar (supervisor, location manager, sistem admini) [D6]. İzin kişiye aittir [D3] | Takas lokasyon bazında açılıp kapanır [D8]. Lokasyonlar arası: bulunamadı | Location Manager kendi lokasyonundaki herkesi düzenler ve arşivler [D2][D3] |
| **Homebase** | Manager seviyesi lokasyon bazında verilir **(özet)** [H4] | Başka lokasyonda planlıysa **gri kutu** görünür **(özet)** [H3] | Planı düzenleme izniyle aynı izin [H2]. Lokasyonlar arası: bulunamadı | aynı [H2] | Tek bir hesap geneli ayar: "kim görür, düzenler, işten çıkarır" [H2] |
| **When I Work** | "Manager" rolü bütün hesabı yönetir; kapsamlı rol "Supervisor"dır [W1] | Birden fazla schedule'daki kişinin bütün vardiyaları birlikte görünür [W2] | Supervisor yalnız kendi schedule'ının çalışanlarınınkini işler; talep formunda schedule alanı yok [W4][W5] | Aynı schedule içinde. Dışarıya "Labor Sharing" ile [W2][W7] | Supervisor yalnız kendi schedule'ında kullanıcı yaratır [W1] |
| **Sling** | Manager varsayılan olarak **bütün lokasyonların planını görür**, yalnız kendi lokasyonunda onaylar. Paralı planda görünürlük kısıtlanabilir [G1][G2][G3] | Çakışmalar gri vardiyayla gösterilir [G4] | Atanmış manager'lar; yoksa aynı lokasyonun bütün manager'ları [G5] | Ayar: "lokasyon ve pozisyona göre kısıtla" [G3] | Manager bütün profilleri düzenler [G1] |
| **Planday** (tek özellik) | İsteğe bağlı "primary department": kişiyi yalnız birincil departmanın manager'ı görür; izin ve sözleşme de onda [P1] | – | – | – | – |

**Ortak kalıp:**
1. **Manager varsayılan olarak kendi lokasyonlarıyla sınırlı: 4/5.** Sling istisna. When I Work'te bu rolün adı "Supervisor".
2. **Başka lokasyondaki vardiya gri, salt-okunur bir işaret olarak görünür: 4/5** (7shifts, Deputy, Homebase özet, Sling). Beş üründe de, o lokasyonu yönetmeyen bir manager'dan vardiyanın ayrıntılarının gizlenip gizlenmediğini söyleyen bir kaynak bulunamadı.
3. **Lokasyonlar arası çakışma uyarısı: 4/5 açıkça.** Deputy bunu kesin engel yapıyor.
4. **İzin kişiye aittir; kişinin lokasyonlarından herhangi birinin manager'ı (rütbe koşuluyla) karar verir: 4/5.** İzni tek bir lokasyona bağlayan ürün bulunamadı. Bugünkü kodun yaptığı bu.
5. **Availability kişi başına tek: 7shifts açıkça söylüyor ("ayrı lokasyon profili desteklenmez"), Deputy'de dolaylı.**
6. **Takas varsayılan olarak lokasyon içinde kalır; lokasyonlar arası isteğe bağlı bir ayardır: 3/5.** İki lokasyonun ikisinin de onayını isteyen ürün bulunamadı. Bu kodun (swap oyları) ürüne özgü bir fazlası; zararı yok.
7. **Kişi kaydı: lokasyonu paylaşan herhangi bir manager, çoğu zaman yalnız alt rütbe için: 3/5.** Tek sahip modeli yalnız Planday'in isteğe bağlı "primary department" özelliğinde var.

**Kaynaklar**
- S1 https://kb.7shifts.com/hc/en-us/articles/4417513741587-User-Types-in-7shifts
- S2 https://kb.7shifts.com/hc/en-us/articles/4417519940499-Manager-Permissions
- S4 https://kb.7shifts.com/hc/en-us/articles/33617925589267-Why-are-some-shifts-greyed-out
- S5 https://kb.7shifts.com/hc/en-us/articles/4417513783827-Approving-Declining-Time-Off-Requests
- S6 https://kb.7shifts.com/hc/en-us/articles/4417514394643-Request-Time-Off
- S7 https://kb.7shifts.com/hc/en-us/articles/4417513664659-7shifts-101-Availability
- S8 https://kb.7shifts.com/hc/en-us/articles/4417513894675-How-to-Enable-Account-Wide-Shift-Pool
- S10 https://kb.7shifts.com/hc/en-us/articles/35189996807571-Why-can-t-a-Manager-approve-Shift-Pool-requests-even-with-full-permissions
- D1 https://help.deputy.com/hc/en-au/articles/4658199944847-What-are-the-Deputy-access-levels
- D2 https://help.deputy.com/hc/en-au/articles/4663105333391-Access-level-and-permissions-FAQs
- D3 https://help.deputy.com/hc/en-au/articles/12348480901647-Which-access-levels-can-view-and-manage-team-member-profiles
- D4 https://help.deputy.com/hc/en-au/articles/4688700112015-How-do-I-ensure-that-a-team-member-is-recommended-for-a-shift
- D6 https://help.deputy.com/hc/en-au/articles/11086949633423-How-managers-are-made-aware-of-team-member-s-leave-and-leave-requests
- D8 https://help.deputy.com/hc/en-au/articles/4688726501135-Allow-team-members-to-swap-or-offer-shifts
- D10 https://help.deputy.com/hc/en-au/articles/14975961734031-Location-and-area-management-permissions
- H2 https://support.joinhomebase.com/s/article/Setting-Up-Team-Permissions
- H3 https://support.joinhomebase.com/hc/en-us/articles/229502027-Schedule-employees-at-multiple-locations (özet)
- H4 https://support.joinhomebase.com/hc/en-us/articles/115000198372 (özet)
- W1 https://help.wheniwork.com/articles/user-access-privileges-computer/
- W2 https://help.wheniwork.com/articles/making-separate-schedules/
- W4 https://help.wheniwork.com/articles/processing-time-off-requests-computer/
- W5 https://help.wheniwork.com/articles/requesting-time-off/
- W7 https://help.wheniwork.com/articles/labor-sharing-reference-guide/
- G1 https://support.getsling.com/en/articles/511169-system-roles
- G2 https://support.toasttab.com/en/article/Sling-Scheduling-System-Roles
- G3 https://support.getsling.com/en/articles/3691283-5-customizing-your-company-and-schedule-settings
- G4 https://support.getsling.com/en/articles/1821074-conflicts
- G5 https://support.getsling.com/en/articles/6408471-assign-managers-to-profiles
- P1 https://help.planday.com/en/articles/74684-how-to-use-the-primary-department-feature

---

## 4. Aday modeller

### M1 — Katı lokasyon kapsamı (bugünkü kodun "vardiya" yarısı her yere)
**Kurallar:** Manager yalnız kendi lokasyonunun vardiyalarını görür. Kişi verisine bir lokasyon üzerinden bakar: izin lokasyona bağlı, başka lokasyondaki vardiya hiç görünmez. Kişiye dokunan her karar HEPSİ kuralına bağlıdır; birden fazla lokasyonda çalışan birinin kişi kararları admin'e gider.
- **Artı:** Kavram tek cümle. Mahremiyet en sıkı.
- **Eksi:** S2 kör kalır; Ayşe engele ancak yayında ve nedenini bilmeden takılır. S5 izin talepleri admin'e yığılır. S4 availability onayları admin'e düşer. Birden fazla lokasyonda çalışan her kişi admin'in iş yükü olur. Sektörde karşılığı yok (Bölüm 3, kalıp 4).
- **Maliyet:** Küçük. Kodun büyük kısmı bugün zaten böyle; çekmece HERHANGİ-BİR'den HEPSİ'ne çevrilir, D3 eklenir.
- **Risk:** Ürün riski yüksek. Çok lokasyonlu işletmelerde manager'ın günlük işini admin yapmaya başlar.

### M2 — "Kişi ortak, vardiya yerel" (ÖNERİ)
**Kurallar:**
1. **Görme:** Ayşe, lokasyonlarından en az birinde çalışan herkesi bütünüyle görür: profil, availability, izinler, belgeler. Ali dahil. Başka lokasyonda çalışmayan kimseyi görmez.
2. **Başka lokasyondaki vardiya:** Ayşe'nin gördüğü kişilerin başka lokasyondaki vardiyaları, Ayşe'nin ızgarasında **gri, salt-okunur** blok olarak görünür (ör. "Beşiktaş 12:00–16:00"). Beşiktaş'ın geri kalanını (başka çalışanlar, boş vardiyalar) görmez.
3. **Vardiya işlemleri:** Yazma, yayınlama, devir onayı ve dışa aktarma yalnız kendi lokasyonlarında. Swap iki lokasyona dokunuyorsa iki lokasyonun da onayı gerekir (bugün var).
4. **Kişi işlemleri iki sınıftır:**
   - *Yalnız kişiye dokunanlar:* ad ve iletişim düzenleme, belge ve onboarding inceleme, yönetici availability notu, availability değişikliği onayı. Ali'nin lokasyonlarından birini yöneten herhangi bir manager yapabilir.
   - *Başka lokasyonu etkileyenler:* işten çıkarma ve arşivleme (D3), başka lokasyonda kullanılan bir job'u kaldırmak, başka lokasyonda vardiyası olan günlere izin onaylamak. Etkilenen her lokasyonun onayı ya da admin/owner gerekir.
5. **Rütbe:** Manager yalnız `employee` rolündeki kişiler üzerinde işlem ve onay yapar. Kendisinin, başka bir manager'ın, admin'in ve owner'ın talepleri admin/owner'a gider.
6. **İzin kişiye aittir,** lokasyon seçilmez. O günlerde yayınlanmış vardiyası olan lokasyon(lar)ın manager'ları onaylar; hiç vardiyası yoksa lokasyonlarından herhangi birinin manager'ı. Onaylanan izin her lokasyonda HARD conflict'tir (bugün de öyle).
7. **Availability kişi başına tektir;** yönetici notu herkese ortak tek bir katmandır, yazanın adıyla (bugün de öyle).
8. **Plan düzenleme kilidi lokasyon ve hafta başınadır.**

**Senaryolarda M2:** Ayşe Ali'yi Salı'ya yazarken Beşiktaş 12–16'yı gri görür ve çakışma o anda uyarılır (S1, S2). Ayşe ile Mehmet aynı anda planlar (S3). Ali'nin izni ikisinin kuyruğunda da görünür, Salı Beşiktaş vardiyası varsa Mehmet'in onayı da beklenir (S5). Ali'yi işten çıkarmak Zeynep'e gider (S8). Ayşe'nin kendi izni Zeynep'e gider (S15, S17).

- **Artı:**
  - Hedefin ana cümlesini koruyor: manager yalnız kendi lokasyonunda iş yapar.
  - Çakışma bilgisi bir lokasyonun tamamı açılmadan, yalnız ilgili kişi için geliyor.
  - Kişi verisinin tek olduğu gerçeğiyle uyumlu.
  - Sektörün ortak kalıbı (kalıp 1–5).
  - Swap'lar için var olan "lokasyon başına oy" kalıbı izne aynen taşınıyor.
- **Eksi:**
  - İki onaylı izinde "biri onayladı, diğeri bekliyor" ara durumu doğuyor. Swap'larda bu durum ve mesajı zaten var.
  - "Kişi işlemi mi, lokasyon işlemi mi" ayrımının her yeni özellik için bilinçli yapılması gerekiyor. Bunun için kurallar konvansiyon dosyasına yazılmalı.
- **Maliyet (bugünkü koda göre kaba):**
  - D1. Izgaraya "başka lokasyonda" blokları. Okuma modeli, gördüğü kişilerin diğer lokasyonlardaki yayınlanmış vardiyalarını ayrı bir listede döndürür; ekran gri blok çizer. **Orta.**
  - D2. Düzenleyicide çakışma kontrolünün diğer lokasyonların aynı haftadaki yayınlanmış vardiyalarını da görmesi. **Küçük, ama her modelde gerekli (HATA).**
  - D3. Düzenleme kilidinin lokasyon ve hafta başına olması; kaydetmenin yalnız oturumdaki lokasyonlara dokunması. **Orta, her modelde gerekli (HATA, veri kaybı).**
  - D4. İzin: lokasyon alanının kalkması (saat dilimi Ali'nin birincil lokasyonundan alınabilir). Görme HERHANGİ-BİR kuralıyla, onay "etkilenen lokasyon oyları" ile, bildirim de oyları izler. **Orta-büyük.** En çok değişen parça bu.
  - D5. Rütbe kontrolünün izin ve takas onaylarına eklenmesi. **Küçük.**
  - D6. D3'ün `set_employee_archived` ve `terminate_employee`'ye eklenmesi; bir lokasyondan çıkarılan kişinin gelecekteki vardiyalarının ele alınması; başka lokasyonu etkileyen job kaldırmaya koruma. **Küçük-orta.**
  - D7. Eski availability talep akışında HEPSİ kuralının HERHANGİ-BİR'e çevrilmesi, ya da BL-091 kararıyla o akışın kalkması. **Küçük.**
- **Risk:** Orta. Dokunulan yerler izin, yayın ve onay gibi paylaşılan kurallar. Her biri için pgTAP kontrolü gerekir. Ama veri şekli pek değişmiyor; tek şema değişikliği izin talebindeki lokasyon alanı. Canlı veri olmadığı için göç derdi yok.

### M3 — Organizasyon genelinde okur, yalnız kendi lokasyonunda yazar
**Kurallar:** Ayşe bütün lokasyonların planını ve bütün çalışanları görür (Sling'in varsayılanı). Yazma ve onay M2'deki gibi yalnız kendi lokasyonunda. Kişiye dokunan kararlar M2'nin 4–6. maddeleriyle aynı.
- **Artı:** Çakışma ve saat bilgisi tam; gri blok gibi özel bir tasarım gerekmez. Manager'lar birbirinin yerini kolay doldurur.
- **Eksi:** Ürün sahibinin açıkça istediği "manager yalnız kendi lokasyonundaki olayları görür" ilkesini bırakıyor. Kadıköy manager'ı Beşiktaş'ın bütün kadrosunu, izinlerini ve belgelerini görür. Şube arası mahremiyet ya da rekabet varsa (ör. farklı ücretler) sorun olur.
- **Maliyet:** Orta. Okuma yolları (ızgara, Requests listesi, çalışan listesi ve çekmece, veritabanı erişim politikaları) "tüm lokasyonlar" kuralına geçer; yazma kontrolleri kalır. İzin ve D3 işleri M2 ile aynı.
- **Risk:** Orta. Okuma izinlerini genişletmek geri alınması kolay ama sessiz bir değişiklik.

### M4 — Lokasyon kapsamını kaldır: manager = admin eksi ayarlar
**Kurallar:** Manager her lokasyonu ve herkesi görür, her yerde yazar ve onaylar. Admin'den farkı yalnız Settings ve Roles'a erişememesi.
- **Artı:** Bütün kenar durumlar kaybolur (S1–S8, S16). Kod en çok bu modelde sadeleşir: kapsam senkronizasyonu, oylar, D3 gereksizleşir.
- **Eksi:** "Şube müdürü" kavramı kalmaz. Manager ile admin neredeyse aynı rol olur. Büyüyen bir işletmede şube bazlı yetki sonradan geri istenir. Sektörde yaygın değil (4/5 kapsamlı). When I Work bile kapsamlı bir "Supervisor" rolü tutuyor.
- **Maliyet:** En küçük. Manager için "tüm lokasyonlar" bayrağını açmak tek satırlık bir değişiklik; sonra ölü kodu silmek gerekir.
- **Risk:** Kod riski düşük, ürün riski yüksek. Tersine dönmek (kapsamı geri getirmek) pahalı.

### Karşılaştırma

| Senaryo | M1 katı | **M2 kişi ortak, vardiya yerel** | M3 geniş okuma | M4 kapsamsız |
|---|---|---|---|---|
| S1–S2 Ayşe, Ali'nin Beşiktaş vardiyasını bilir mi | Hayır, yalnız yayında engel | **Gri blok + anında uyarı** | Tam görür | Tam görür |
| S3 Aynı hafta iki manager | Kilit lokasyon başına olursa evet | **Evet** | Evet | Evet |
| S4 Ali'nin availability'si | Admin'e kalır | **İki manager da** | İki manager da | Herkes |
| S5 Ali'nin izni | Tek lokasyon, çoğu zaman admin'e kalır | **İki kuyrukta; vardiyası olan lokasyon(lar) onaylar** | Aynı (M2) | Herhangi bir manager |
| S6 Devir (cover) | Vardiyanın lokasyonu | **Vardiyanın lokasyonu** | Aynı | Herhangi bir manager |
| S7 İki lokasyonlu swap | İki onay | **İki onay** | İki onay | Tek onay |
| S8 İşten çıkarma | Admin | **D3: hepsi onunsa manager, değilse admin** | D3 | Herhangi bir manager |
| S15 Ayşe'nin kendi izni | Başka manager ya da admin | **Admin/owner (rütbe)** | Admin/owner | Başka manager |
| S17 Rütbe | Yok | **Var** | Var | Yok |
| Mahremiyet | En sıkı | **Sıkı** (yalnız ortak kişiler) | Gevşek | Yok |
| Koda göre iş | Küçük | **Orta** | Orta | En küçük |

---

## 5. Öneri

**M2 — "Kişi ortak, vardiya yerel".**

Gerekçeler:
1. **Ürün sahibinin istediğini koruyor, zorluğun kaynağını kaldırıyor.** Zorluk manager'ın kapsamından değil, kişi verisini (izin, availability, kayıt) de lokasyona bağlamaya çalışmaktan geliyor. Kişi lokasyona bağlanamaz; bağlanınca S2, S4, S5 ve S8 kırılıyor.
2. **Kod zaten yarı yolda.** Çekmece, availability ve belgeler HERHANGİ-BİR kuralıyla çalışıyor; vardiya işlemleri lokasyonda kalıyor; iki lokasyonlu onay (swap oyları) mevcut; yayındaki çakışma engeli çalışıyor. Değişecek yerler sayılı (D1–D7).
3. **Sektörün ortak kalıbı bu:** kapsamlı manager, başka lokasyondaki vardiyanın gri görünmesi, kişiye ait izin ve availability, lokasyon içi onay (Bölüm 3, 4/5).
4. **Kenar durumlara tek bir soru yetiyor.** Her yeni özellikte sorulacak şey: "Bu bir vardiyaya mı dokunuyor, kişiye mi? Kişiyse başka bir lokasyonu etkiliyor mu?" Cevap onay kuralını kendiliğinden veriyor.

**Diğerleri ne zaman doğru olurdu:**
- **M3:** Müşteriler 2–3 şubeli, kadrosu iç içe küçük işletmelerse ve şubeler arası mahremiyet bir kaygı değilse. Görünürlük tasarımı gerektirmediği için daha hızlı çıkar.
- **M4:** Pratikte her manager her şubeyi yönetiyorsa. O durumda manager rolü de sorgulanmalı; admin ile birleştirmek daha dürüst olur.
- **M1:** Şubeler hukuken ayrıysa (bayilik gibi) ve personel paylaşımı yoksa. O durumda birden fazla lokasyonda çalışan kişi hiç olmamalı; kayıt formu bunu engellemeli.

**Hedef modelin metninde değişmesi gerekenler (öneri):**
- *Manager* maddesi: "YALNIZCA kendisine atanmış lokasyonlara ve o lokasyonlardaki employee'lere erişir" yerine: "Kendi lokasyonlarından en az birinde çalışan employee'lerin kişi kaydını tam görür; bu kişilerin başka lokasyondaki vardiyalarını salt-okunur görür; vardiya işlemlerini yalnız kendi lokasyonlarında yapar; başka lokasyonu etkileyen kişi kararlarında o lokasyonun da onayı ya da admin gerekir; yalnız employee rolündekiler üzerinde onay verir."
- *Time off:* "İzin kişiye aittir; o günlerde vardiyası olan lokasyon(lar)ın yetkilisi onaylar."
- *Shift swap / cover:* "İki lokasyon" ifadesi netleşmeli. Swap'ta iki vardiyanın lokasyonu onaylar. Devirde (cover/pickup) vardiyanın lokasyonu onaylar; alanın diğer lokasyonlarıyla çakışması otomatik kontrol edilir (Soru 5).

**Hangi model seçilirse seçilsin düzeltilmesi gereken iki hata:**
- **(HATA-1) Düzenleyicide başka lokasyon kör noktası** (S2, [D Q7/T3 ile Q8/T4]). `(leave: high / do: safe)`
- **(HATA-2) Hafta başına tek kilit ve devralmada sessiz taslak kaybı** (S3, [D Q9, A1–A10]). `(leave: high / do: moderate)`. İkisi de backlog'a girmeli; ikincisi veri kaybettiği için öncelikli.

**Küçük temizlik (düşük öncelik):**
- `app_private.can_access_employee` hiçbir yerden çağrılmıyor; ölü kod. Erişim politikaları `public` olanı kullanıyor.
- Rol düşürülünce kapsam satırı ve "tüm lokasyonlar" bayrağı kalıyor (S18). Employee üyeliklerinin çoğunda bu bayrak zaten açık (6 employee üyeliğinin 5'inde), anlamsız.

---

## 6. Kullanıcıya sorular (önem sırasıyla)

**1. Hangi kapsam modeli?**
Neden: Diğer bütün kararlar buna bağlı.
- **(A) M2 — Kişi ortak, vardiya yerel.** *Önerim.* Gerekçe Bölüm 5.
- (B) M3 — Manager her şeyi görür, yalnız kendi lokasyonunda iş yapar.
- (C) M4 — Lokasyon kapsamı kalkar, manager = admin eksi ayarlar.
- (D) M1 — Katı: manager yalnız kendi lokasyonunu görür, çok lokasyonlu kişilerin kişi kararları admin'e gider.

**2. Ayşe, Ali'nin Beşiktaş vardiyasından ne görsün?**
Neden: Çakışmayı önlemek için bir şey görmesi gerekiyor; ne kadarı mahremiyet kararı. Kodun Line Up tarafında "başka lokasyonun adını ve pozisyonunu asla gösterme, yalnız 'başka yerde çalışıyor' de" diye bilinçli bir örnek var (`weekly_lineup_candidate_option`); öte yandan çekmece Beşiktaş'ın adını zaten gösteriyor.
- **(A) Lokasyon adı + saat, gri blok ("Beşiktaş 12:00–16:00"); job ve not yok.** *Önerim:* Ayşe'nin Mehmet'i arayıp konuşabilmesi için nerede olduğunu bilmesi gerekiyor, ve lokasyon adı zaten çekmecede görünüyor.
- (B) Yalnız saat + "başka lokasyonda" (lokasyon adı yok).
- (C) Hiçbir şey; yalnız yayında engel (bugünkü hal).

**3. Ali'nin izni birden fazla lokasyonu etkiliyorsa kim onaylar?**
Neden: Bugün talep sessizce admin'e kalıyor. Ayşe onaylayamıyor, Mehmet talebi görmüyor, admin de kararın kendisine düştüğünü bilmiyor (S5).
- **(A) O günlerde yayınlanmış vardiyası olan her lokasyonun manager'ı onaylar; hiç vardiyası yoksa lokasyonlarından herhangi birinin manager'ı. Admin/owner tek başına hepsini onaylayabilir.** *Önerim:* Swap'lardaki "lokasyon başına oy" kalıbının aynısı; her manager kendi vardiyasının yerine birini bulduğunu onaylar.
- (B) Herhangi bir manager onaylar; öbür lokasyonun etkilenen vardiyaları "yeniden atanmalı" diye işaretlenir ve o manager'a bildirim gider.
- (C) Bugünkü gibi admin/owner'a kalsın, ama admin'e "karar sende" bildirimi gitsin.

**4. İzin talebinde lokasyon seçimi kalsın mı?**
Neden: Bugün Ali izni gönderirken bir lokasyon seçiyor ve talebi yalnız o lokasyon görüyor.
- **(A) Kalksın; izin kişiye ait, Ali'nin lokasyonlarının bütün manager'ları görür.** *Önerim* (sektörde 4/5).
- (B) Kalsın.

**5. Kadıköy vardiyasını hem Kadıköy'de hem Beşiktaş'ta çalışan Ali devralırsa (cover/pickup) Beşiktaş'ın da onayı gerekir mi?**
Neden: Hedef metin "her iki lokasyonun onayı" diyor; kod yalnız vardiyanın lokasyonuna soruyor. Salt Beşiktaş'ta çalışan biri zaten uygun olamıyor.
- **(A) Hayır. Yalnız vardiyanın lokasyonu onaylar; Ali'nin Beşiktaş vardiyalarıyla çakışma, yol süresi ve dinlenme otomatik kontrol edilir.** *Önerim:* Beşiktaş'ın ilgisi zaten otomatik kontrolde; ikinci onay her devri yavaşlatır. Swap'ta iki onay kalır.
- (B) Evet, alan kişinin çalıştığı her lokasyon onaylar.
- (C) Yalnız alan kişinin birincil lokasyonu farklıysa, o lokasyon da onaylar.

**6. Rütbe kuralı: manager yalnız employee'ler hakkında mı onay verir?**
Neden: Bugün Ayşe aynı lokasyondaki başka bir manager'ın, hatta admin Zeynep'in izin talebini onaylayabiliyor (S17).
- **(A) Evet. Manager'ın kendi, diğer manager'ların, admin'in ve owner'ın talepleri admin/owner'a gider.** *Önerim* (7shifts'in kuralı; çekmecedeki mevcut kuralla da tutarlı).
- (B) Aynı lokasyondaki manager'lar birbirini onaylayabilir; admin ve owner talepleri yalnız admin/owner'a.
- (C) Bugünkü gibi kalsın (rütbe yok, yalnız "kendin değil").

**7. İşten çıkarma ve arşivleme (D3).**
Neden: Kodda uygulanmamış; Ayşe Ali'yi çıkarırsa Beşiktaş vardiyaları da boşalıyor (S8).
- **(A) D3 kalsın: Ali'nin bütün lokasyonları Ayşe'ninse Ayşe, değilse admin/owner.** *Önerim:* Nadir ve geri dönüşü zor bir olay; admin'e gitmesinin maliyeti düşük.
- (B) Her etkilenen lokasyonun manager'ı onaylar (oy).
- (C) Herhangi bir manager (bugünkü kod).

**8. Manager'ın çalıştığı yer ile yönettiği yer ayrılabilsin mi?**
Neden: Bugün Ayşe Beşiktaş'ta bir vardiya alabilmek için Beşiktaş'a atanınca otomatik olarak Beşiktaş manager'ı da oluyor (S15, [D W1]).
- **(A) Evet. Varsayılan "çalıştığı her yeri yönetir" kalsın; admin bir lokasyonda "orada yalnız çalışır" işaretleyebilsin.** *Önerim:* Varsayılan davranış bugünküyle aynı, iş küçük ve yerel. Başka şubede vardiya kapatan manager restoranlarda olağan bir durum. (Homebase manager seviyesini lokasyon bazında veriyor.)
- (B) Hayır, çalıştığı her yeri yönetsin (bugünkü hal, 7shifts'in modeli).

**9. Ali'nin ortak kaydındaki job'ları kim değiştirebilir?**
Neden: Ayşe, Ali'nin Beşiktaş'ta kullanılan bir job'unu kaldırabiliyor; Beşiktaş vardiyası uygunsuz kalıyor (S9).
- **(A) Ali'nin lokasyonlarının herhangi bir manager'ı, ama kaldırılan job başka lokasyonda gelecek bir yayınlanmış vardiyada kullanılıyorsa manager için engellenir (admin yapabilir).** *Önerim.*
- (B) Serbest (bugünkü hal).
- (C) Job değişikliği yalnız admin.

**10. Manager rolü lokasyonsuz verilebilsin mi?**
Neden: Lokasyonsuz manager boş ekranlarla kalıyor (S16).
- **(A) Hayır. Manager rolü en az bir lokasyon olmadan verilemez; vardiya almayan saf yönetici "Plandan hariç + lokasyonlar" ile tanımlanır.** *Önerim.*
- (B) Verilebilsin (bugünkü hal).

**11. Owner, admin ve manager kendi vardiyalarını görüp izin ve takas talep edebilsin mi?**
Neden: Hedef bunu istiyor; bugün çalışan arayüzü web'de yalnız employee rolüne açık (S15). Kapsam modelinden bağımsız ama M2'nin rütbe kuralı ancak bu açılınca işe yarar.
- **(A) Evet. Admin arayüzüne "Benim vardiyalarım / Taleplerim" girişi eklensin; talepler rütbe kuralıyla yönlensin.** *Önerim.*
- (B) Bu roller için Shift Hub'a geçiş düğmesi eklensin.
- (C) Şimdilik gerek yok.

**12. Owner'ın kendi izni, işletmede admin yoksa.**
Neden: Bugün kimse onaylayamıyor (S20).
- **(A) Admin yoksa owner kendi iznini kaydeder (onay gerekmez; kayıt izi tutulur).** *Önerim.*
- (B) Owner izni her zaman bir admin gerektirir.

---

## Kanıt dökümü

**Canlı fonksiyon tanımları** (yerel DB, `pg_get_functiondef`; hepsi `scratchpad/bl070-research/G/fndefs.sql`):
- Kapsam ve erişim: `public.can_access_employee`, `app_private.can_access_employee` (çağrılmıyor), `app_private.can_access_location`, `app_private.sync_manager_location_scope`, `app_private.sync_role_location_scope_trigger`, `app_private.enforce_role_location_scope`, `public.service_actor_can_access_employee`, `public.service_actor_has_permission`, `public.schedule_actor_has_capability_service`, `public.schedule_actor_can_manage_service`, `public.can_manage_employee_record`, `public.can_assign_employee_locations`.
- Plan: `get_schedule_read_model_service` zinciri, `assess_weekly_shift_availability`, `assess_weekly_schedule_assignment_service`, `acquire_schedule_edit_session_service_past_week_base`, `save_schedule_edit_session_service_base`, `takeover_schedule_edit_session_service`.
- İzin: `get_schedule_requests_service`, `submit_employee_time_off_periods_service`, `preview_time_off_assignment_decision_service`, `decide_time_off_with_assignments_service`, `apply_time_off_period_decision`, `notify_schedule_request_event_service`.
- Takas: `shift_exchanges_command_service`, `shift_exchange_preview`, `weekly_assignment_candidate_base`, `shift_exchange_emit_notification_base`.
- Availability: `availability_actor_scope`, `weekly_preference_manager_scope`, `weekly_preferences_save_service`, `availability_notify`.
- Kişi kaydı: `save_employee`, `set_employee_archived`, `terminate_employee`, `get_employee_detail`.
- Diğer: `save_announcement_audience_service`, `announcement_member_matches_locations_service`, `preview_schedule_export_service`.

**Erişim politikaları:** `pg_policies`. İş tablolarının (vardiya, izin, takas) doğrudan erişim politikası yok; bütün erişim yukarıdaki servis fonksiyonları üzerinden.

**Tetikleyiciler:** `bl051_sync_membership_scope`, `bl051_sync_employee_scope`, `bl051_sync_assignment_scope` (commit'e ertelenmiş), `b_enforce_role_location_scope`.

**Web:** `apps/web/src/App.tsx:435–441` (çalışan arayüzü yalnız employee), `apps/web/src/employees/EmployeeDrawer.tsx:77–82` (çekmece sekmeleri). **API:** `apps/api/src/availability/availability-service.ts` (iki availability sistemi de canlı).

**Geri alınan denemeler** (`G/exp1.sql`–`exp5.sql`, hepsi `begin … rollback`):
- Q1 Ayşe → Ali çekmecesi: evet. Q3 Ayşe Ali'yi yönetebilir (D3 yok): evet.
- Q4 eski availability akışında okuma evet, yönetme hayır. Q4b haftalık tercih yönetme: evet.
- Q5 Ayşe'nin ızgarası: yalnız Kadıköy, Ali'nin Beşiktaş vardiyası yok.
- Q7 oturum içinde çakışma yok; Q8 oturum dışında `time_overlap`. T3/T4 yol süresi: oturumda yok, dışarıda var. T7 yayında engel, mesaj lokasyonsuz.
- Q9 Mehmet kilide takıldı.
- Q10 Ayşe'nin izin onayında 1 kısıtlı vardiya. Q11 Mehmet 0, Ayşe 1 bekleyen talep görüyor.
- D2 rol düşürülünce kapsam satırı kalıyor.
- W1 çalışma yeri eklenince yönetim kapsamı genişliyor. W2/W3 Ayşe, Mehmet'in satırını görüyor ama çekmecesini açamıyor.
- A1–A10 admin devralma sonrası kaydetmede Beşiktaş taslak vardiyası silindi.
