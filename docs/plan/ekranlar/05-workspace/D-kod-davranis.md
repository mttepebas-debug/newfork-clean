# D — Workspace (ana sayfa) kod ve davranış (EKRAN-05, 2026-10-06, a40f329b)

## Özet (en çok 8 satır)
- **Yüksek önemde bir sorun var. Ekrandaki "bugün" sayıları UTC'ye göre hesaplanıyor.** Los Angeles'ta her akşam 17:00'den sonra "Scheduled today" ve "Open today" ertesi günün sayısını gösteriyor. İstanbul'da gece 00:00–03:00 arası bir önceki günün sayısı çıkıyor. Bu, KARARLAR'daki "hiçbiri UTC'yi kullanmaz" kararına aykırı.
- **Orta önemde beş sorun var:**
  1. Profil kaydı olmayan kişi için sayfanın tamamı "Internal server error" oluyor. Yerelde Mert'in kendi admin hesabı Meyhouse'ta bu durumda.
  2. Elle yazılan yapılacak işi workspace'teki bütün müdürler görüyor ve herhangi biri kapatabiliyor.
  3. Belge süresi işleri ve bildirimleri yalnız biri bu sayfayı açınca üretiliyor; okuma isteği veri yazıyor.
  4. Müdür, belge izni olmadığı hâlde "belgenin süresi doldu" işini görüyor.
  5. Setup checklist eski yetki kapısında. Testteki yetki etiketi davranışla uyuşmuyor.
- **Düşük önemde:** sayıların 30 saniyeye kadar bayat kalması, ekrana çıkan ham hata metni, aynı sayının iki kutuda gösterilmesi, hiç kullanılmayan bir sayaç, iki sekmede düzen kaydı, checklist'te hiçbir şey yapmayan "App tour" ve owner'a özel "Billing" maddesi, beyaz olması gereken ama yeşil görünen Cancel. Var olan BL-410, BL-533, BL-564, BL-666, BL-667 bugün de geçerli.
- **Yöntem:** kod okudum (web → API → veritabanı) ve yerel veritabanında SELECT çalıştırdım. Yerel veritabanı main ile aynı sürümde (son migration `20261007130000`). Test, build ve tarayıcı koşturmadım.
- **Uyarı:** bir kez `get_workspace_dashboard_service`'i SELECT içinde çağırdım. Bu fonksiyon içeride yazma yapabiliyor (aşağıda O3). Sonra kontrol ettim: `workspace_todos` 0 satır, son 10 dakikada `notification_outbox`'a yeni satır 0. Hiçbir şey yazılmadı.

## Ekranın sınırı
- **İçeride:**
  - Workspace sayfası (`/app/workspace`, `views/WorkspacePage.tsx`) ve onu açan `/app` yönlendirmesi (`App.tsx:593` `AppHomeRedirect` → `resolveLanding.ts:65-75`).
  - Kartlar: Today, Pending requests, Open shifts, Announcements, Todos, Notifications, Quick actions.
  - Customize (sırala, gizle, Save layout, Cancel).
  - Setup checklist, Settings → General'daki "Hide checklist" düğmesi dahil.
  - API: `communication-routes.ts:238-391`.
  - Veritabanı: `get_workspace_dashboard_service`, `save_workspace_layout_service`, `create/resolve_workspace_todo_service`, `*_owner_setup_checklist_*_service`, `sync_expiring_document_todos_service`.
- **Sınırda:** Requests (sayıların kaynağı), Shift Hub (takas sayısı), Announcements, Notifications, belge süreleri.
- **Dışarıda:** bu ekranların kendi görünümü ve akışları.

## Akış haritası
- **Açılış:**
  - Yönetici rolündeki kişi `/app`'e girince `/app/workspace`'e iner.
  - Rota koruması `workspace.read` izni ve owner/admin/manager rolü istiyor (`App.tsx:296-305`).
- **Pano:** `getWorkspaceDashboard` → `GET …/workspace` (rotada ayrı kapı yok, `communication-routes.ts:238-251`) → `get_workspace_dashboard_service` (son tanım `20261003040000_time_off_forgets_location_and_parts.sql:933`). Fonksiyon sırasıyla:
  - çekirdeğe sorar (`workspace.todos`; lokasyon dışı, "org" kapsamı);
  - önce `sync_expiring_document_todos_service`'i çalıştırır, yani okuma sırasında yazma yapar (`:950`);
  - sayıları üretir: bugünkü vardiya, bugünkü açık vardiya, bekleyen izin, okunmamış bildirim;
  - en çok 5 duyuru, 5 bildirim ve 5 yapılacak iş ekler;
  - kişinin kayıtlı kart düzenini ekler.
  - Sonuç `user_profiles` satırından kuruluyor (`:1011`).
- **Takas sayısı ("Shift changes"):** web, Shift Hub modelinin tamamını ayrıca çekip sayıyor (`WorkspacePage.tsx:67-72, 110`). Bu sorgu 60 saniyede bir yenileniyor; panonun kendisi yenilenmiyor.
- **Customize:**
  - Değişiklikler önce yalnız ekranda tutuluyor (`draft`).
  - Save layout → `PUT …/workspace/layout` → `save_workspace_layout_service`. Sunucu 7 kartın hepsini ve tekrar olmamasını kontrol edip kişinin satırını üstüne yazıyor.
  - Sürüm kontrolü yok.
- **Yapılacak işler:**
  - Ekrandan yazılan iş her zaman kişisiz (`employee_id` boş) kaydediliyor (`WorkspacePage.tsx:476-482`).
  - ✓ ile kapatma `resolve_workspace_todo_service` üzerinden.
  - Sistemin ürettiği işler (belge süresi) yalnız bağlantı olarak görünüyor.
- **Setup checklist:**
  - Yalnız rol adı owner ya da admin olana çiziliyor (`WorkspacePage.tsx:180-183`).
  - API rota içinde kendi izin kontrolünü yapıyor (`settings.general.read/manage`, `communication-routes.ts:330-391`).
  - Veritabanında eski kapı kullanılıyor (`service_actor_has_permission`).
  - İlerleme kişi başına tutuluyor (`workspace_id, user_id`).
  - Görünürlüğü Settings → General → "Hide checklist" değiştiriyor (`GeneralSettingsPage.tsx:193-227`).

## 1. Bulgular (önem sırasıyla)

### Yüksek

**Y1. "Bugün" sayıları UTC gününe göre hesaplanıyor; başlıktaki tarih ve saat ise tarayıcıdan geliyor.**
- **Ekranda:** Workspace → Today kartı ("Scheduled today", "Open today") ve Open shifts kartı ("unassigned shifts today"). Başlıktaki "Good evening, Mert · Tuesday, October 6, 6:10 PM".
- **Örnek:**
  - Los Angeles'taki müdür Mina Salı 18:10'da sayfayı açıyor.
  - Başlıkta "Tuesday" yazıyor. Ama "Scheduled today 14 / Open today 3" Çarşamba'nın sayısı, çünkü sunucuya göre tarih çoktan Çarşamba.
  - İstanbul'da Ayşe 01:30'da bakarsa bir önceki günün vardiyalarını görüyor.
  - Sayfa açık kalırsa başlıktaki saat dakikada bir ilerliyor ama sayılar yenilenmiyor. Gece yarısını geçince tarih değişiyor, sayılar eski günde kalıyor.
- **Kanıt:**
  - `get_workspace_dashboard_service` iki sayıda da çıplak `current_date` kullanıyor (`20261003040000…:956-957`).
  - SELECT: veritabanı oturumunun saat dilimi `UTC`. Lokasyonlar `Europe/Istanbul` (634) ve `America/Los_Angeles` (8).
  - Selamlama ve tarih `new Date()` ile tarayıcıdan geliyor (`WorkspacePage.tsx:60, 84-86, 627-643`).
  - KARARLAR satır 480-486 ("Bugün" hangi saat dilimiyle, G14 S1): lokasyonun günü ya da cihazın takvimi; "hiçbiri UTC'yi kullanmaz".
  - Çok lokasyonlu müdürde sayı bütün lokasyonların toplamı. Farklı saat dilimli iki lokasyonda tek bir "bugün" anlamlı değil.
- **BL:** YENİ (BL-238 ile aynı aile: sunucu "bu hafta"yı UTC'ye göre hesaplıyor). `leave: high / do: moderate`.
- **Karar notu:** sayı her lokasyonun kendi gününe göre mi sayılsın, yoksa cihazın gününe göre mi? KARARLAR'a göre lokasyon sütunu lokasyonun gününü kullanıyor. Pano bir sütun değil, bu yüzden ürün sorusu olabilir.

### Orta

**O1. Profil kaydı olmayan kişide sayfa hiç açılmıyor ("Internal server error").**
- **Ekranda:** sayfanın tamamı tek kırmızı satıra dönüyor. Setup checklist ve kartlar da kayboluyor.
- **Örnek:** yerelde Mert'in kendi hesabı (`theweiwuer@gmail.com`) Meyhouse'ta admin, ama `user_profiles` satırı yok. Workspace'i açınca kart yerine "Internal server error" görür.
- **Kanıt:**
  - Fonksiyon sonucu `from public.user_profiles profile … where profile.user_id = actor_user_id` ile kuruyor (`:1011`). Satır yoksa sonuç `NULL` dönüyor.
  - SELECT: bu kişi için `get_workspace_dashboard_service(...) is null` → `t`.
  - API'de `workspaceDashboardSchema.parse(null)` hata veriyor (`communication-service.ts:217-220`). Hata 500 olarak dönüyor (`http-error.ts:165-166`). Web bu metni olduğu gibi gösteriyor (`WorkspacePage.tsx:97-107`).
  - Bu yüzden koddaki "Manager" yedek adı (`coalesce(profile.display_name,'Manager')`) hiç çalışmıyor, ölü kod.
  - SELECT: aktif üye olup profil satırı olmayan 74 kişi var: kurulumu yarım 73 owner ve kurulumu tamam 1 admin. Kurulumu tamam owner'ların hepsinin (323) profili var.
  - Profil satırını yalnız owner kurulum sihirbazı (`OwnerOnboardingPage.tsx:323`), Account → Profile ve çalışan onboarding'i (`adopt_account_phone`) yazıyor. Veritabanında "her aktif üyenin profili olur" diye bir kural yok.
- **BL:** YENİ. `leave: medium / do: safe`.
- **Not:** CLAUDE.md'deki "eski veri korunmaz" kuralına göre bu tek kayıt büyük ihtimalle eski veri ve düzeltilecek olan veri. Ama kodun bu varsayımı hiçbir yerde güvenceye alınmıyor. Ya kural veritabanında konmalı, ya da okuma profile bağlı olmamalı.

**O2. Ekrandan yazılan yapılacak işi workspace'teki bütün yöneticiler görüyor ve herhangi biri kapatabiliyor; yazanın adı tutulmuyor.**
- **Ekranda:** Todos kartı → "Add a todo" → Add. Satırın ✓ düğmesi.
- **Örnek:**
  - Kadıköy müdürü Ayşe "Ali'yle geç kalma konusunu konuş" yazıyor.
  - Bu satır Beşiktaş müdürü Mehmet'in, admin Zeynep'in ve owner Mert'in ana sayfasında da çıkıyor.
  - Mehmet ✓'ye basınca iş Ayşe'den de kalkıyor. Kimin yazdığı ya da kimin kapattığı hiçbir yerde görünmüyor. Geri alma yok.
- **Kanıt:**
  - Web her işi kişisiz yazıyor (`WorkspacePage.tsx:477-482`).
  - Okuma kişisiz işi koşulsuz gösteriyor (`todo.employee_id is null or …`, `20261003040000…`).
  - `workspace.todos` kapsamı "org", yani müdürde bütün workspace (`authz_actions` SELECT; KARARLAR DATA-08).
  - `workspace_todos` tablosunda yazan ya da kapatan sütunu yok (`\d public.workspace_todos`).
  - pgTAP yalnız kişiye bağlı işi sınıyor (`people_behind_the_catalog_ask_the_core.test.sql:94-130`).
- **BL:** YENİ. `leave: medium / do: moderate`.
- **Karar sorusu (KARARLAR'da yok):** yapılacak iş kişisel mi, lokasyonun mu, workspace'in ortak listesi mi? Kapatmak geri alınabilmeli mi (ILKELER P25)?

**O3. Belge süresi işleri ve bildirimleri yalnız biri Workspace'i açınca üretiliyor.**
- **Ekranda:** Todos kartındaki "Expired employee document" / "Employee document expires soon" satırları ve owner/admin'e giden "Employee document expiring" bildirimi.
- **Örnek:** Ali'nin Food Handler belgesinin süresi Cumartesi doluyor. Hafta sonu kimse Workspace'i açmıyor, müdürler doğrudan Schedule'a gidiyor. Ne iş açılıyor ne bildirim gidiyor. Pazartesi biri ana sayfayı açınca ikisi birden üretiliyor.
- **Kanıt:**
  - `sync_expiring_document_todos_service`'i yalnız `get_workspace_dashboard_service` çağırıyor (SELECT, `prosrc` taraması). Zamanlanmış görevlerde (`cron.job`) yok.
  - Fonksiyon `workspace_todos`'a yazıyor ve bildirim kuyruğuna ekliyor.
  - Bu, `GET …/workspace` isteğinin her açılışta veri yazması demek. Her açılış bütün belgeleri yeniden tarıyor.
  - Ayrıca bildirim kimliği yalnız belge ve gereksinimden üretiliyor (`event_digest`, `20261006000000…:2809`). "Süresi yaklaşıyor" bildirimi bir kez gittiyse, süre dolunca "Employee document expired" bildirimi hiç gitmiyor; aynı kimlik ikinci kaydı yutuyor.
- **BL:** YENİ. `leave: medium / do: moderate`.
- **Not:** bildirimin "expired" kısmı Notifications / Documents ekranının sınırında; aşağıda 4. bölümde de yazılı.

**O4. Müdür, belge izni olmadığı hâlde belge süresi işini görüyor; bildirim ise ona gitmiyor.**
- **Ekranda:** Todos kartı → "Expired employee document · Ali Brown - Food Handler Card" → bağlantı `/app/employees`.
- **Örnek:**
  - Kadıköy müdürü Ayşe'nin rolünde belge izni yok (yerleşik Manager rolü).
  - Ayşe iş satırını görüyor ve tıklayınca Employees'e gidiyor, ama belgeyi açamıyor.
  - Bildirim yalnız owner ve admin'e gidiyor.
  - Aynı bilgi iki farklı kitleye iki farklı kuralla dağıtılıyor.
- **Kanıt:**
  - İş satırı `employee.read` ile süzülüyor (pano okuması, `read_rule`).
  - Bildirim alıcıları `documents.read` ile seçiliyor (`sync_expiring…`, `recipient_user_ids`).
  - SELECT: yerleşik rol izinleri: manager'da `employee_documents.read` 0/467, `employees.read` 467/467.
  - KARARLAR satır 93: "yerleşik Manager rolünde bugün belge izni yok". Satır 91: Schedule'daki belge uyarısı bilgiyi gösterebilir. Ana sayfanın bu işi göstermesi kuralla açıkça kapsanmıyor.
  - Yerelde açık iş yok (`workspace_todos` 0 satır). Bu yüzden ekranda görülmedi; bulgu yalnız koddan.
- **BL:** YENİ (BL-560 ailesi). `leave: medium / do: moderate`.
- **Karar notu:** iş satırı da `documents.read` ile mi süzülsün?

**O5. Setup checklist eski yetki kapısında; test etiketi davranışla uyuşmuyor; "hayır" cevabı sözleşme dışı.**
- **Ekranda:** Workspace → Setup checklist; Settings → General → "Hide checklist".
- **Örnek:**
  - Admin Zeynep checklist'i görüyor ve işaretleyebiliyor.
  - Yetki testi ise bu fonksiyonları "yalnız owner" diye sınıflıyor.
  - Bir reddi ekran "authz" gerekçesiyle tanıyamıyor.
- **Kanıt:**
  - Üç servis de `service_actor_has_permission(…, 'settings.general.read/manage')` kullanıyor ve gerekçesiz `42501` döndürüyor (SELECT `pg_get_functiondef`).
  - API rotası `resolveWorkspaceAuthorization` → `permissions.includes` ile kendi kapısını yürütüyor (`communication-routes.ts:338-345, 370-377`; `workspace-context.ts:103`).
  - Web rol adına bakıyor (`WorkspacePage.tsx:180-181`; `can()` değil).
  - `authorization_coverage.test.sql:97, 136, 240` üçünü `workspace.setup` diye sınıflıyor. O eylem `owner_only = t` (SELECT `authz_actions`).
  - CLAUDE.md §9: rota-yerel kapı ve gerekçesiz `42501` yeni eklenmez, var olanlar çekirdeğe taşınır.
- **BL:** BL-276 (eski kapı) + BL-565 / BL-700 ailesi (rota-yerel kapı). Checklist için ayrı kalem yok: YENİ alt kalem. `leave: medium / do: moderate`.

### Düşük

**D1. Sayılar başka ekranda yapılan karardan sonra 30 saniyeye kadar eski kalıyor.**
- **Örnek:** Ayşe Requests'te Ali'nin iznini onaylıyor ve hemen Workspace'e dönüyor. "Time off 1" görmeye devam ediyor.
- **Kanıt:**
  - İzin kararları yalnız `schedule-requests` ve `employee-hub` önbelleğini yeniliyor (`requests-data.ts:111-120`). `workspace-dashboard`'ı yenilemiyor.
  - Önbellek 30 saniye taze sayılıyor (`App.tsx:134`).
  - Takas kararları panoyu yeniliyor (`exchange-data.ts:138-146`).
  - "Shift changes" 60 saniyede bir kendini yeniliyor, öteki sayılar yenilenmiyor.
- **BL:** YENİ (BL-278 ailesi, kapalı). `leave: low / do: safe`.

**D2. "Bekleyen" sayılar, kişinin kendi payına karar verdiği ve öteki lokasyonu bekleyen talepleri de sayıyor.**
- **Örnek:** Ayşe Ali'nin iki lokasyonlu izin talebinde Kadıköy'ün oyunu verdi; talep Beşiktaş'ı bekliyor. Ayşe'nin ana sayfası yine "Time off 1" diyor.
- **Kanıt:**
  - Sayı `status='pending'` ve "görebilir" kuralıyla hesaplanıyor (`:958-959`).
  - Takasta `awaiting_other_manager` da sayılıyor (`WorkspacePage.tsx:110`).
  - Requests sekmesindeki sayı da aynı kuralla çalışıyor (`get_schedule_requests_service`), yani iki ekran birbiriyle tutarlı.
- **BL:** YENİ. Ürün sorusu ("sizi bekleyen" mi, "açık" mı). `leave: low / do: safe`.

**D3. Ham hata metni ekrana çıkıyor.**
- Sayfa hatası `query.error.message` gösteriyor (`WorkspacePage.tsx:97-107`). Örnekler: "Internal server error", ağ kopunca "Failed to fetch", veritabanının küçük harfli cümleleri.
- Düzen kaydı hatası da ham gösteriliyor (`:175-179`), ör. "valid workspace layout required".
- Checklist yüklenemediğinde metin "could not be saved" diyor (`:323-327`); yükleme hatası için yanlış cümle.
- ILKELER P21.
- **BL:** YENİ. `leave: low / do: safe`.

**D4. İzni olmayana kart 0 gösteriyor (BL-410), Quick actions da izne bakmıyor; lokasyonsuz müdür her yerde 0 görüyor.**
- **Kanıt:** Kart döngüsünde `can()` yok (`WorkspacePage.tsx:184-229`). Quick actions'ta da yok (`:449-463`).
- **Örnek:** hiç lokasyonu olmayan müdür "Scheduled today 0" görüyor. Sebebi lokasyonunun olmaması (`scope_set` boş), ama bunu söyleyen yok.
- **BL:** BL-410 (Tazelik bugün: geçerli). `leave: low / do: safe`.

**D5. Announcements kartı arşivli, süresi dolmuş ve yayımlanamamış duyuruyu gösteriyor.**
- **Kanıt:**
  - Pano yalnız `status`'a göre süzüyor (`:960`).
  - `get_announcements_service` `display_status` ('expired', 'publish_failed') ve `archived_at` döndürüyor, ama pano bunlara bakmıyor (SELECT `pg_get_functiondef`).
  - KARARLAR K28 aksini istiyor.
- **BL:** BL-564 (Tazelik bugün: geçerli). `leave: medium / do: moderate`.

**D6. Kartlarda 5'ten fazlası sessizce gizleniyor ve satırlar yanlış yazılıyor.**
- Todos'ta 6. iş görünmüyor (BL-667, geçerli; limit `:996`).
- Announcements'ta da 5'ten fazlası için "View all" bağlantısı yok. Notifications'ta var (`WorkspacePage.tsx:416-432`).
- Gelecek tarihli iş "Due 1m ago" diyor; ham kategori kodu görünüyor; "New announcement" yalnız listeye gidiyor (BL-666, geçerli; `:644-652`, `:424`, `:459`).
- **BL:** BL-666, BL-667; Announcements "View all" YENİ alt kalem. `leave: low / do: safe`.

**D7. Aynı sayı iki kutuda; "Scheduled today" açık vardiyaları da sayıyor.**
- "Open today" (Today kartı) ile "unassigned shifts today" (Open shifts kartı) aynı alanı gösteriyor (`today_open_shift_count`, `WorkspacePage.tsx:389-391, 410`).
- "Scheduled today" çalışanı atanmamış vardiyaları da sayıyor (`:956`'da `employee_id` koşulu yok).
- **Örnek:** 10 vardiyanın 2'si boşsa ekranda "Scheduled today 10 / Open today 2" yazıyor; 10'un içinde o 2 de var.
- **BL:** YENİ. `leave: low / do: safe`.

**D8. Ölü ve gereksiz yük.**
- `unread_notification_count` her açılışta hesaplanıyor (`:961`), şemada var (`communications.ts:297`), ama web hiçbir yerde kullanmıyor.
- "Shift changes" için Shift Hub modelinin tamamı (fırsatlar ve vakalar) çekiliyor, ama yalnız sayıyor (`WorkspacePage.tsx:67-72`).
- **BL:** YENİ. `leave: low / do: safe`.

**D9. Customize.**
- Cancel `nf-button secondary` ile yeşil görünüyor. UI-09'a göre beyaz olmalı (`WorkspacePage.tsx:144-153`; `.nf-button.secondary` için CSS yok, `styles.css:2834-2880`).
- İki sekmede düzen kaydedilince son kaydeden kazanıyor. Sürüm kontrolü yok, öteki sekme haber almıyor (`save_workspace_layout_service` `on conflict … do update`).
- Gizli kartın içeriği Customize sırasında çalışmaya devam ediyor; ör. Todos formu kullanılabiliyor (`:186, 226`).
- Yedi kartın hepsi gizlenince sayfa boş kalıyor ve bir şey söylemiyor.
- Gizle/Göster simgelerinde `aria-hidden` yok (`:217-221`).
- **BL:** Cancel → numarasız madde (BACKLOG satır 153-155, Tazelik bugün: geçerli). Gerisi YENİ. `leave: low / do: safe`.

**D10. Setup checklist'in maddeleri gerçeği söylemiyor.**
- "App tour" zorunlu madde, ama böyle bir tur yok. Düğme yalnız işaret koyuyor (`WorkspacePage.tsx:243-248, 354-361`; kodda başka "tour" yok).
- "Set scheduling preferences" Save'den önce, bağlantıya tıklandığı anda tamam sayılıyor (`:345-349`).
- Bu yüzden owner hiçbir şey ayarlamadan "2 of 2 required visits complete" görebiliyor.
- "Billing" maddesi admin'e de görünüyor. Oysa billing owner'a özel (KARARLAR satır 65), Stripe billing yok (satır 281). Bağlantıdaki `?checklist=billing`'i hiçbir sayfa okumuyor.
- Bütün zorunlu maddeler bitince checklist kendiliğinden kalkmıyor.
- Settings → General metni "for this workspace" diyor, ama gizleme yalnız o kişi için geçerli (kişi başına satır).
- **BL:** YENİ. `leave: low / do: safe`. "App tour" ve "Billing" maddelerinin kalıp kalmayacağı ürün sorusu.

**D11. Başlık metni.**
- Açıklama uzun ve selamlamayı içine katıyor: "Track today's operations, open requests, announcements, todos, and quick actions. Good evening, Mert · …" (`:139`).
- Üst yazı "TODAY'S WORK. ONE PLACE." pazarlama dili gibi duruyor (ILKELER anti-hedef "oyuncak görünüm"; P21).
- **BL:** YENİ. `leave: low / do: safe`. Görsel karar olduğu için varyantla sorulur.

**D12. İkiz ve eski kayıtlar.**
- Notifications kartı eski gelen kutusunu okuyor (`get_notifications_service`, `:962`). BL-533, geçerli.
- `authorization_coverage.test.sql:104` panoyu hâlâ `workspace.read` diye sınıflıyor; servis `workspace.todos`'a soruyor. BL-416 (2), geçerli.
- **BL:** BL-533, BL-416. İşaretler maddelerde.

## 2. Kurala uyduğu doğrulananlar (kısa)
- **Bekleyen izin sayısı (P07):** yalnız karar verebilen görüyor (`time_off_reason(…,'requests.read',…)`). Requests sekmesiyle aynı kural, test var (`time_off_seen_by_who_decides.test.sql:37`).
- **Kişiye bağlı yapılacak iş (M2):** yalnız o kişiyi görebilen görüyor ve kapatabiliyor (`people_behind_the_catalog_ask_the_core.test.sql:102-130`).
- **Sistemin ürettiği işi** elle kapatmak reddediliyor (`resolve_workspace_todo_service`, 42501).
- **Çalışan:** ne rota ne veritabanı izin veriyor (`App.tsx:300`; `communication_operations.test.sql:169`).
- **Düzen:** sunucu 7 kartın hepsini ve tekrarsızlığı kontrol ediyor. Eski 6 kartlık düzen bozulmadan genişliyor (`communication_operations.test.sql:132-146`).
- **Bütün pano servisleri** önce çekirdeğe soruyor; checklist hariç (O5).

## 3. Test boşlukları
- **"Bugün" sayıları:** saat dilimini sınayan test yok (Y1). M2 kapsamını (başka lokasyonun vardiyası sayılmıyor) sınayan pgTAP da yok. Web testleri sayıları sahte veriyle veriyor.
- **Profil satırı olmayan kişi** için pano testi yok (O1).
- **Kişisiz yapılacak iş:** kimin gördüğünü ve kimin kapatabildiğini sınayan test yok (O2).
- **Belge süresi:** "yaklaşıyor"dan "doldu"ya geçişte ikinci bildirimin gitmesi sınanmıyor (O3). İş satırının belge izni olmayan müdürden gizlenmesi de sınanmıyor (O4).
- **Setup checklist:** veritabanı testi yalnız `workspace_rls.test.sql:777-818`'de birkaç hücre. Admin ile owner farkı ve "hayır" cevabının gerekçesi sınanmıyor (O5).
- **Önbellek:** izin kararından sonra panonun yenilenmesini sınayan web testi yok (D1).
- **Customize:** web testi yok (sırala, gizle, Cancel, kayıt hatası). `WorkspacePage.test.tsx`'teki 12 test checklist, yapılacak iş ve takas sayısı üzerine.
- **e2e:** Workspace için akış yok. Yalnız açılış adresi sınanıyor (`e2e/flows/scope-and-employee-view.spec.ts:185-213`).

## 4. Sınırda (başka ekranın işi; adıyla bırakılıyor)
- **Requests:**
  - "Shift changes" sayısı Requests'teki takas kuralı açığını (R2-01: eş müdür onayı) aynen taşıyor.
  - Requests tek tabloya dönünce (KARARLAR, 2026-10-06 Sistem 1 C) kartın "Time off / Shift changes" ayrımı ve "Review requests" bağlantısı yeniden düşünülecek.
- **Notifications / Documents:** belge bildiriminin "expired" hâli hiç gitmiyor (O3'teki kimlik sorunu); alıcılar ilk kayıtta sabitleniyor.
- **Announcements:** BL-564'ün kökü pano okumasında, ama kural K28 Announcements'a ait.
- **Schedule:** BL-238 (UTC hafta) Y1 ile aynı kök. İkisinin birlikte ele alınması ucuz.

## 5. Kanıtlanamayanlar (ayrı liste)
- **O1'in ekrandaki görünümü** tarayıcıda görülmedi. Dayanak: veritabanı `NULL` → API'nin şema kontrolü → 500 zinciri koddan okundu. Mert'in yerel hesabıyla açılırsa doğrulanır.
- **O3'ün maliyeti:** her açılışta bütün belgelerin taranmasının süresi ölçülmedi. Yerelde açık iş 0, belge verisi az, ölçüm anlamsız olurdu.
- **O4** ekranda görülmedi; yerelde süresi yaklaşan kabul edilmiş belge yok (`workspace_todos` 0 satır).
- **Owner'ın gönüllü belgesi** (D5 kararı: hatırlatma yok) için süre işi açılıp açılmadığı ölçülmedi. Sync, gereksinim tablosuna bağlı; owner'ın gönüllü yüklemesinin gereksinim satırı olup olmadığına bakılmadı.
- **İki sekmede düzen yarışı (D9)** denenmedi; yalnız kod okundu.
- **Selamlamanın kaynağı:** kişinin cihaz saatiyle selamlanması doğru olabilir. Yalnız sayılarla çelişmesi kesin (Y1).

**Ölçülen sha:** `origin/main` `a40f329b3728f1823378d8d42807689cfe43e4fb` (worktree `newfork-wt/plan-ekran-05`). Yerel veritabanı son migration `20261007130000`, depoyla aynı.
