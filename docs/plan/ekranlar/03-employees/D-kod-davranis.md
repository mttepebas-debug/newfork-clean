# D — Employees: kod ve davranış (EKRAN-03, 2026-10-06, 31649359)

## Özet (en çok 8 satır)
- **Beş yüksek sorun var:** (1) Lokasyonu kalmamış ya da Remote çalışan kişi ekrandan işten çıkarılamıyor. Oysa sistem admin'e tam olarak bunu yapmasını söyleyen bir bildirim gönderiyor. (2) Normal gönderilmiş bir davette "Send reminder" her basışta hata veriyor. (3) Çekmecede yazılan "Preferred name" sessizce kaydedilmiyor. (4) Geçmiş bir tarihle işten çıkarma, zaten çalışılmış yayınlanmış vardiyaları da geriye dönük boşaltıyor. (5) İşten çıkarma penceresi "müdür takip kaydı oluşur" diyor, ama bu kaydı hiçbir ekran okumuyor. Boşalan vardiyadan da kimseye haber gitmiyor.
- **Orta önemde, sessiz kayıp ve kural kaymaları:** "Restore employee" tek tıkla kişinin hesabını kayıttan koparıyor ve bunu söylemiyor. Liste 100 kişide sessizce kesiliyor. Bu arşivde daha erken sorun olur. İşten çıkarılan kişinin bekleyen izin talepleri açık kalıyor. Resmî ad kilidi yalnız ekranda var, veritabanında yok. Veritabanının geliştirici cümleleri ("employee revision conflict") çekmeceye olduğu gibi çıkıyor.
- **Kurala uyan taraf:** Yetki kararları çekirdekten geçiyor. Lokasyondan çıkarma vardiyaları yalnız o andan sonrası için boşaltıyor ve lokasyonsuz kalan kişi için admin/owner'a bildirim gidiyor. Çekmece kapanırken soru sormuyor (K7). Tercih edilen adın reddi kişiye sessiz kalıyor (KARARLAR).
- **Test boşlukları:** Web testi "Send reminder"ı sahte API ile geçiyor, gerçek sunucu bunu reddediyor. Bir veritabanı testi (pgTAP) geçmiş vardiyanın geriye dönük boşalmasını doğru davranış diye kilitliyor. İşten çıkarma ve geri alma için e2e testi yok.
- **Yöntem:** Kod okuma ve yerel veritabanında yalnız SELECT. Tek vitest dosyası koşuldu, 6/6 yeşil. Tarayıcı açılmadı. Bulgular dosya ve satırla kanıtlı.

## Akış haritası
- **Liste.** Ekran `EmployeesPage.tsx:96-100`. Arama, durum ve arşiv sunucuya gidiyor. Lokasyon filtresi ve sıralama yalnız tarayıcıda, gelen satırlar üzerinde çalışıyor (`:202-232`). Sırası: `listEmployees` (`employee-data.ts:128`) → `GET /v1/workspaces/:w/employees` (`employee-directory-routes.ts:121`) → `list_employees_service` (`employee-directory-service.ts:218-229`, `page_limit: 100`, `page_offset: 0`). Durum sekmelerinde sayaç yok. Sayfalama yok.
- **Kişi ekleme.** `startCreate` (`EmployeeDrawer.tsx:800`) → `POST …/employees/create` → `create_employee_command_service`. Bu servis aynı isteğin iki kez işlenmesini önler, `save_employee_service`'i çağırır ve istenirse daveti hazırlar. İkinci bir yol daha var: `POST …/employees`. Onu yalnız kurulum sihirbazı kullanıyor (`OwnerOnboardingPage.tsx:717`).
- **Kaydetme.** `saveMutation` (`:416-470`). Önce `PUT …/:id` → `save_employee_service`, sonra gerekirse `PATCH …/role`.
- **Davet.**
  - Invite / Resend: `prepare_employee_invitation_service`. Eski daveti iptal eder, 7 günlük yeni davet açar.
  - Retry ve "Send reminder": `load_employee_invitation_retry_service`. Yalnız teslimatı başarısız olmuş davette çalışır.
  - Revoke: `revoke_employee_invitation_service`.
  - Copy link: `load_employee_invitation_link_service`.
- **İşten çıkarma.** `EmployeeTerminationDialog` (`:1489`) → `POST …/termination` → `terminate_employee_service`. Hesabı askıya alır, bekleyen daveti iptal eder, yayınlanmış vardiyaları boşaltır, takip satırı yazar, kaydı arşivler.
- **Geri alma.** "Restore employee" (`:1365`) → `PATCH …/archive {archived:false, restoreAccess:false}` → `set_employee_archived_service`. Kaydı geri açar, hesap bağını koparır ("rehire").
- **Lokasyondan çıkarma.** `RemoveFromLocationButton` → `DELETE …/locations/:l` → `remove_employee_from_location_service`. Lokasyon kalmadıysa admin/owner'a "No location left" bildirimi gider.
- **Tercih edilen ad.** Kişi kendi ekranından ister (`request_employee_preferred_name_service`). Onay modundaysa çekmecede `PendingPreferredNameRow` ("Use it / Leave it") → `decide_employee_preferred_name_service`.
- **Bildirimler (bu ekrandan çıkanlar):** `people.employee.no_location`, `people.preferred_name.review_required/published/approved` ve davet e-postası (Resend). İşten çıkarmanın bildirimi yok.

## 1. Bulgular (önem sırasıyla)

### Yüksek

**Y1. Lokasyonu kalmamış ya da Remote çalışan kişi işten çıkarılamıyor.**
- **Ekranda:** Employees → kişi → çekmece → "Terminate employee" → açılan pencere. "Confirm termination" kapalı, kırmızı satırda "An active employee location with a timezone is required." yazıyor.
- **Örnek:**
  - Kadıköy müdürü Ayşe, yalnız Kadıköy'de çalışan garson Ali'yi Remove ile lokasyondan çıkarıyor.
  - Owner Mert'e "No location left — Ali … End their employment or give them a new location." bildirimi geliyor.
  - Mert Terminate'e basıyor ama onaylayamıyor.
  - Remote işaretli muhasebeci de hiçbir zaman işten çıkarılamıyor.
- **Kanıt:**
  - Pencerenin saat dilimi seçenekleri yalnız kişinin lokasyonlarından geliyor (`EmployeeDrawer.tsx:1472-1476`, `:1507-1513`). Lokasyon yoksa liste boş ve düğme kapalı (`:1602-1606`, `:1620`).
  - Veritabanı bu durumu kabul ediyor. `terminate_employee_service`'teki yorum: "somebody with no location left (S1) has nothing to match, and any valid one is taken".
  - Bildirim metni `remove_employee_from_location_service` içinde.
  - Yerel veritabanında 73 aktif kayıtta canlı lokasyon yok, 2'si Remote (K5).
- **BL:** YENİ. `leave: high / do: safe` (pencere lokasyonsuz kişiye workspace'in saat dilimini sunmalı).

**Y2. "Send reminder", normal gönderilmiş davette her seferinde hata veriyor.**
- **Ekranda:** Employees → davet bekleyen kişi → çekmece → Access → "Send reminder". Çekmecede kırmızı "failed invitation not found" yazısı çıkıyor.
- **Örnek:** Ayşe Pazartesi Ali'yi davet etti, e-posta gitti. Perşembe "Send reminder"a basıyor. Hatırlatma gitmiyor ve ekranda ham İngilizce bir cümle görüyor.
- **Kanıt:**
  - Düğme `retryInvitationMutation`'ı çağırıyor (`EmployeeDrawer.tsx:2576-2585`).
  - Sunucu (`load_employee_invitation_retry_service`) teslimat durumu "failed" değilse reddediyor: `if invitation_row.id is null or invitation_row.delivery_status <> 'failed' then raise exception 'failed invitation not found' using errcode = 'P0002'`.
  - Web testi `EmployeeDrawer.test.tsx:975-1005`, "sent" durumundaki bir davetle API'yi sahte cevapla geçiyor. Bu yüzden sözleşme kırığını görmüyor.
  - Yerelde Resend anahtarı yokken de teslimat "sent" yazılıyor (`invitation-service.ts:325-328` → markDelivery "sent"). Yani yerelde de hep kırık.
- **BL:** YENİ. `leave: high / do: moderate` ("hatırlatma"nın anlamı kararı: aynı bağlantıyı yeniden gönder mi, Resend mi?).

**Y3. Çekmecede yazılan "Preferred name" sessizce kaydedilmiyor.**
- **Ekranda:** Employees → "Add employee" → Profile → "Preferred name". Henüz aktif olmamış (davetli, onboarding'de) kişinin çekmecesinde de aynı alan var.
- **Örnek:** Ayşe yeni garsonu eklerken "Preferred name"e "Alex" yazıp Save'e basıyor. "Employee saved." görüyor. Listede ve Schedule'da kişi hâlâ "Alexander Brown". Çekmeceyi açınca alan boş.
- **Kanıt:**
  - Alan yalnız kişi aktifse kilitli (`EmployeeDrawer.tsx:1704` `identityLocked = display_status === "active"`, `:2028-2035`).
  - Veritabanı yeni kayıtta adı `''` yazıyor. `create_employee_command_service` → `save_employee_service(..., employee_input->>'last_name', '', ...)`.
  - Var olan kayıtta hiç yazmıyor. `save_employee_service`: "The preferred name is not the drawer's: it changes by request and answer."
  - Kural bilinçli (BL-098 kapanışı), ama ekran alanı hâlâ yazılabilir gösteriyor. ILKELER P09 (veri sessizce düşmez) ve P11'e aykırı.
- **BL:** YENİ. `leave: high / do: safe` (alanı salt okunur yapmak ya da kaldırmak).

**Y4. Geçmiş bir tarihle işten çıkarma, çalışılmış yayınlanmış vardiyaları geriye dönük boşaltıyor.**
- **Ekranda:** Employees → kişi → "Terminate employee" → "Effective date and time". En ileri tarih "şimdi", en geri sınır yok.
- **Örnek:** Mert 6 Ekim'de Ali'yi "1 Ekim 09:00" etkili diye çıkarıyor. Ali 2–5 Ekim'de çalıştığı dört yayınlanmış vardiyayı gerçekten yaptı. Bu vardiyalar Schedule'da "Unassigned" olur ve geçmiş program değişir.
- **Kanıt:**
  - Pencerede `min` yok (`EmployeeDrawer.tsx:1562-1567`).
  - Veritabanı yalnız "effective'ten sonra başlayan"lara bakıyor: `>= resolved_effective_at`. "şimdiden sonra" sınırı yok. Lokasyondan çıkarmada bu sınır var: `>= now()`.
  - pgTAP bu davranışı doğru diye kilitliyor: `employee_termination_offboarding.test.sql:103-117`. Etkili tarih 2026-09-01, testin satır 117'deki iddiası "same-day shift after effective instant becomes open".
  - ILKELER P09 "yayınlanmış veri geriye dönük değişmez" ilkesine aykırı.
- **BL:** YENİ. `leave: high / do: moderate`. Karar notu: geçmiş tarihli çıkarmaya izin verilsin mi, yoksa yalnız gelecekteki vardiyalar mı boşalsın? P09 ikincisini söylüyor.

**Y5. İşten çıkarma "müdür takip kaydı" sözü veriyor ama kimse görmüyor; boşalan vardiyadan kimseye haber gitmiyor.**
- **Ekranda:** İşten çıkarma penceresindeki uyarı: "Published shifts starting at or after the effective time will become open and create manager follow-ups."
- **Örnek:** Mert Kadıköy garsonu Ali'yi çıkarıyor. Ali'nin Cumartesi akşam vardiyası boşalıyor. Kadıköy müdürü Ayşe'ye hiçbir bildirim gitmiyor. Ayşe boşluğu Cumartesi Schedule'a bakınca fark ediyor.
- **Kanıt:**
  - `terminate_employee_service` `employee_offboarding_followups`'a "coverage_alert" ve "compliance_review" satırları yazıyor.
  - Bu tabloyu okuyan uygulama kodu ya da fonksiyon yok. `apps`'te arama boş.
  - Okuma politikası `20260925000517_unreachable_code_is_gone.sql:14`'te kaldırıldı.
  - Fonksiyonda bildirim kuyruğuna yazan satır yok.
  - Yerel veritabanında tablo boş (K6).
  - ILKELER P07: bildirim işi doğrudan etkilenene gider.
- **BL:** YENİ. `leave: high / do: moderate`.

### Orta

**O1. "Restore employee" tek tıkla kişinin hesabını kayıttan koparıyor ve bunu söylemiyor.**
- **Ekranda:** Employees → Archived → kişi → "Restore employee". Onay yok, açıklama yok.
- **Örnek:** Mert yanlışlıkla çıkardığı Ali'yi geri almak istiyor ve Restore'a basıyor. Kayıt geri geliyor, ama Ali'nin hesabı kayıttan ayrılmış. Ali giriş yapınca bu workspace "askıda" görünüyor. Tek yol yeniden davet etmek, bu da onboarding'i baştan başlatıyor.
- **Kanıt:**
  - Web her zaman `restoreAccess:false` gönderiyor (`EmployeeDrawer.tsx:1365`, `employee-data.ts:191-199`).
  - Veritabanı bu durumda bağı koparıyor: `user_id = case when not should_archive and not restore_access … then null`. Olay "Employee record restored for rehire" diye yazılıyor.
  - Hesapla birlikte geri alma dalı veritabanında var ama ekrandan hiç çağrılmıyor.
  - ILKELER P25: geri dönüşsüz eylemin sonucu açıkça yazılır. CLAUDE.md §9 düğme dili de iki tık istiyor.
  - Tıklamanın ne gönderdiğini sınayan test yok, yalnız "gizlenir" testi var (`EmployeeDrawer.test.tsx:1929`).
- **BL:** YENİ. `leave: medium / do: moderate`. Karar gerekir: Restore "hesabıyla geri al" mı olsun, "yeniden işe al" mı?

**O2. Liste 100 kişide sessizce kesiliyor; arşiv için risk daha büyük.**
- **Ekranda:** Employees (All ve Archived).
- **Örnek:**
  - 2 lokasyonlu, 60 kişilik bir restoran yılda yaklaşık 45 kişiyi çıkarır. 2–3 yılda Archived 100'ü geçer.
  - Ad sırasında geride kalan "Zeynep Yildiz" listede hiç görünmez. Ekranda "daha fazla var" işareti de yok.
  - Sıralama ve lokasyon filtresi yalnız gelen 100 satırda çalışıyor. "Start date"e göre sıralayan müdür yanlış "en eski"yi görür.
  - Arama sunucuda çalıştığı için adla bulunabiliyor.
- **Kanıt:** `employee-directory-service.ts:226-227` (`page_limit: 100, page_offset: 0`). Veritabanı `order by lower(display_name)` ile sıralayıp kesiyor (`list_employees_service`). Ekranda sayfa düğmesi yok (`EmployeesPage.tsx`).
- **BL:** BL-282 (Employees kalemi). Hedef müşteri 20–100 kişi olduğu için işareti yükseltip ayrı maddeye almayı öneririm. `leave: medium / do: moderate`.

**O3. İşten çıkarılan kişinin açık işleri kapanmıyor.**
- **Ekranda:** Requests → Time off. Ayrıca Schedule taslağı.
- **Örnek:** Ali'nin gelecek ay için bekleyen izin talebi var. Ali çıkarılınca talep Requests'te açık kalıyor. Ayşe onu onaylayabiliyor ya da süre dolunca sistem kendisi reddediyor. Ali'nin taslaktaki vardiyaları da yerinde duruyor.
- **Kanıt:**
  - `terminate_employee_service`, `schedule_time_off_requests` ve `schedule_draft_shifts` tablolarına dokunmuyor.
  - `get_schedule_requests_service` çalışanın arşivli olup olmadığına bakmıyor (`archived` yalnız lokasyon için geçiyor).
  - Tercih edilen ad talebi listede gizli ama karar fonksiyonu arşivli kişiyi de kabul ediyor.
  - İşten çıkarma penceresi bunları söylemiyor (P09 "düşer ama useri uyar").
  - Yerelde bugün böyle bir kayıt yok (K6). Bulgu kod okumasıyla.
- **BL:** Taslak kısmı BL-388. İzin talebi YENİ. `leave: medium / do: moderate`.

**O4. Resmî ad kilidi yalnız ekranda; onboarding'deki ad onayı dolanılabiliyor.**
- **Ekranda:** Employees → onboarding'deki kişi → Profile → First/Last name. Kişi aktif değilse yazılabilir.
- **Örnek:** Ayşe, Emre'yi "Emre Yilmaz" diye davet etti. Emre daveti kabul etti ama profilini henüz göndermedi. Ayşe çekmecede adı "Emre Can"a çeviriyor. Emre "Emre Can Yilmaz" yazınca fark yok sayılıyor ve resmî ad adımı admin/owner onayına hiç düşmüyor.
- **Kanıt:**
  - Kilit yalnız aktif kişide (`EmployeeDrawer.tsx:1704`, `:1979-1985`).
  - `save_employee_service` adları hiç kilitlemiyor. API'den aktif kişinin adı da değişebiliyor.
  - Karşılaştırma gönderim anında çalışanın kayıttaki adıyla yapılıyor: `save_employee_onboarding_profile_service` satır 53-55.
  - KARARLAR: resmî ad düzeltmesini yalnız owner ya da admin onaylar.
- **BL:** YENİ. `leave: medium / do: risky` (yetki yüzeyi, B raporuyla birlikte okunmalı).

**O5. Veritabanının geliştirici cümleleri çekmeceye olduğu gibi çıkıyor.**
- **Ekranda:** Çekmecenin alt kırmızı satırı, Access kutusu, "Use it / Leave it".
- **Örnek:**
  - İki müdür aynı kişiyi aynı anda düzenliyor. İkincisi "employee revision conflict" okuyor.
  - Bir başkası tercih edilen adı yanıtlamışsa "that request is no longer waiting for an answer" çıkıyor.
  - Teslimatı düşen davette e-posta sağlayıcısının ham hatası görünüyor (`invitation?.delivery_error`).
  - Liste yüklenemezse "Internal server error" görünüyor.
- **Kanıt:**
  - `errorMessage` hatanın mesajını olduğu gibi döndürüyor (`EmployeeDrawer.tsx:3239-3240`). Mesaj sunucunun `error` alanından geliyor (`request-error.ts:39-45`, `employee-data.ts:468-470`).
  - API bilinçli yazılmış veritabanı cümlelerini değiştirmeden geçiriyor (`http-error.ts:146-149`).
  - Bu cümlelerin kaynağı `save_employee_service` ("primary location must be assigned", "invalid employee job"), retry ve decide fonksiyonları.
  - Liste ekranı: `EmployeesPage.tsx:430-435`. Teslimat hatası: `EmployeeDrawer.tsx:2420-2422`.
- **BL:** YENİ (BL-620 / BL-621 ailesi). `leave: medium / do: moderate`.

**O6. Aynı anda düzenleme çakışmasında çekmece takılıyor.**
- **Ekranda:** Çekmece → Save changes.
- **Örnek:** Ayşe ile Hande, Ali'nin kaydını aynı anda açıyor. Hande kaydediyor. Ayşe "Save changes"e basınca çakışma hatası alıyor. Her yeni basışta aynı hata geliyor. Çıkış yolu çekmeceyi kapatıp yazdıklarını kaybetmek.
- **Kanıt:**
  - Kayıtlı değer (taslağın temeli) yalnız taslak düzenlenmemişse yenileniyor (`EmployeeDrawer.tsx:298-306`).
  - Hata durumunda yeniden okuma yok (`:469`).
  - Taslak eski sürüm numarasıyla kalıyor. Veritabanı her seferinde `expected_revision <> current_revision` → 40001 veriyor.
- **BL:** YENİ. `leave: medium / do: safe`.

**O7. İkiz yol: API, vardiyaları boşaltmadan kişiyi lokasyondan çıkarabiliyor ya da arşivleyebiliyor.**
- **Ekranda:** Görünmüyor. Ekran iki yolu da kapatıyor. Remove'lu lokasyonun kutucuğu kilitli. Web hiç `archived:true` göndermiyor.
- **Örnek:** Bir API istemcisi, Ali'nin kaydını Kadıköy işaretsiz gönderiyor (`PUT …/:id`) ya da `PATCH …/archive {archived:true}` yapıyor. Ali'nin Kadıköy'deki gelecek yayınlanmış vardiyaları ona atanmış kalıyor. Arşivde termination kaydı da oluşmuyor.
- **Kanıt:**
  - `save_employee_service` lokasyon atamasını `ended_at = now()` ile bitiriyor, vardiyalara dokunmuyor.
  - `set_employee_archived_service(should_archive=true)` yalnız hesabı askıya alıp arşivliyor.
  - KARARLAR: "oradan çıkarmanın tek yolu Remove".
  - `archived:true` ve `restore_access` dalları ekrandan çağrılmıyor, yani ölü.
- **BL:** YENİ. `leave: medium / do: moderate`.

**O8. Lokasyon filtresi yalnız birincil lokasyona bakıyor; "No location" seçeneği yok.**
- **Ekranda:** Employees → "All locations".
- **Örnek:** Admin, bildirimden sonra lokasyonsuz kalan herkesi görmek istiyor. Filtrede böyle bir seçenek yok. Kadıköy seçilince Kadıköy'de ikinci lokasyon olarak çalışan kişiler düşüyor.
- **Kanıt:** `EmployeesPage.tsx:202-223`.
- **BL:** BL-436. "No location" kısmı YENİ ek. `leave: medium / do: moderate`.

### Düşük

**D1. Arama her harfte listeyi boşaltıp "Loading employees..." gösteriyor.**
- **Örnek:** Ayşe "Ali" yazarken tablo üç kez boşalıp doluyor.
- **Kanıt:** Sorgu anahtarı arama metnini içeriyor ve önceki veri tutulmuyor (`EmployeesPage.tsx:96-100`, `placeholderData` yok). `useDeferredValue` isteği geciktirmiyor. Arama kutusu ağaç dışında olduğu için odak kaybolmuyor.
- **BL:** YENİ. `leave: low / do: safe`.

**D2. Bazı işlemlerden sonra başka ekranlar eski veriyi gösteriyor.**
- **Kanıt:**
  - Lokasyondan çıkarma Schedule ve Hub önbelleğini yenilemiyor (`EmployeeDrawer.tsx:595-620`; işten çıkarmada `refreshExchangeSurfaces` var, `:492`). Boşalan vardiya sayısı da ekrana yazılmıyor.
  - Tercih edilen ad onayı listeyi yenilemiyor (`:3348-3352`). Liste eski adı gösteriyor.
  - Restore yalnız listeyi yeniliyor (`:474-478`).
- **BL:** YENİ. `leave: low / do: safe`.

**D3. History sekmesi yetersiz.**
- **Ekranda:** Çekmece → History.
- **Örnek:** "Removed from a location; 3 published shift(s) left open". Hangi lokasyon, kim yaptı yazmıyor. "shift(s)" kalıbı geliştirici metni gibi duruyor. Liste son 50 olayla sessizce kesiliyor.
- **Kanıt:** `HistorySection` (`EmployeeDrawer.tsx:2773-2795`) yalnız `summary` gösteriyor. `get_employee_detail_service` `limit 50`. Yerel olay özetleri K7'de.
- **BL:** YENİ. `leave: low / do: safe`.

**D4. Tercih edilen ad bildirimi her karar verene gidiyor (owner ve bütün admin'ler dahil).**
- **Örnek:** Onay modunda Kadıköy garsonu ad istiyor. Kadıköy müdürleri, bütün admin'ler ve owner bildirim alıyor.
- **Kanıt:** `request_employee_preferred_name_service`'te karar verebilen herkes alıcı (`deciders`). ILKELER P07: admin gürültüsü yok.
- **BL:** YENİ. `leave: low / do: safe` (karar gerekebilir).

**D5. İşten çıkarma penceresinin onay düğmesi yeşil, tek tık.**
- **Kanıt:** "Confirm termination" düz `Button` (`nf-button`), kırmızı iki tık değil (`EmployeeDrawer.tsx:1620`). CLAUDE.md §9 düğme dili. Görünümü C raporu doğrular.
- **BL:** YENİ. `leave: low / do: safe`.

**D6. Durum çelişkisi: süresi dolmuş davet listede "Not Invited", çekmecede "Invitation expired".**
- **Örnek:** Davet süresi dolan kişi "Invited" sekmesinden düşüyor. "All"da "Not Invited" görünüyor, çekmece ise "Invitation expired" diyor. Bu durum için sekme de yok.
- **Kanıt:** `list_employees_service` (`… and invitation.expires_at > now() then 'invited' else 'not_invited'`). Çekmece `EmployeeDrawer.tsx:2369-2372`.
- **BL:** YENİ. `leave: low / do: safe`.

**D7. Ölü ve ikiz kod.**
- `saveMutation` içindeki `if (props.creating) props.onCreated(savedId)` hiç çalışmıyor, çünkü oluşturma `createMutation`'dan gidiyor (`EmployeeDrawer.tsx:465`).
- Oluşturmanın iki yolu var: `POST …/employees` (aynı isteği iki kez işlemeyi önlemiyor; yalnız kurulum sihirbazı kullanıyor) ve `POST …/employees/create`.
- `employee-data.ts:392-395`'te sahipsiz kalmış bir açıklama yorumu var.
- O7'deki iki kullanılmayan veritabanı dalı.
- **BL:** YENİ. `leave: low / do: safe`.

**D8. Form kuralları uygulanmıyor.**
- Ad alanlarında Türkçe harf kontrolü yok. Owner'ın acil durum telefonunda maske yok (`EmployeeDrawer.tsx:3262-3300`). E-posta tekil değil, yerelde 2 çift var (K8).
- **BL:** BL-503.

**Eşlenen, yeniden doğrulanan:** BL-662 (boş hâl "No employees yet"), BL-670 (seçici Esc), BL-428 (owner "Unassigned +1"), BL-407 (telefonda Terminate), BL-419 (taslak workspace'ten davet; `prepare_employee_invitation_service`'te kurulum kontrolü hâlâ yok).

## 2. Test boşlukları
- **`apps/web/src/employees/EmployeesPage.test.tsx`** (6 test): arama, durum sekmeleri, lokasyon filtresi, sıralama, boş hâller, ham hata metni ve 100 sınırı için test yok.
- **`apps/web/src/employees/EmployeeDrawer.test.tsx`:**
  - "Send reminder" testi (`:975-1005`) sahte API ile geçiyor. Sunucunun "yalnız failed" kuralını görmüyor (Y2).
  - Lokasyonsuz kişiyi işten çıkarma testi yok (Y1).
  - Restore'un ne gönderdiğine dair test yok (O1).
  - Preferred name'in kaydedilmediğini ya da alanın kilitli olduğunu sınayan test yok (Y3).
  - Sürüm çakışmasından sonra ekranın davranışına dair test yok (O6).
- **`supabase/tests/employee_termination_offboarding.test.sql:103-117`:** geçmiş vardiyanın geriye dönük boşalmasını doğru diye kilitliyor (Y4). Kural netleşince yeniden yazılmalı. Takip satırlarının okunduğunu ya da bildirildiğini sınayan hücre yok (Y5).
- **pgTAP'te eksik olanlar:**
  - `save_employee_service` lokasyon bitirince vardiya boşaltmıyor; bunu yasaklayan hücre yok (O7).
  - İşten çıkarılan kişinin bekleyen izni için hücre yok (O3).
  - Ad kilidi için hücre yok (O4).
- **e2e:** Employees'te yalnız `invite`, `remove-from-location`, `employee-onboarding`, `documents`, `scope-and-employee-view` akışları var. İşten çıkarma, Restore, Send reminder ve Revoke için senaryo yok (`grep -i "Terminate|Send reminder|Revoke invitation" e2e` boş).

## 3. Sınırda
- **Onboarding ve davet kabulü** (`EmployeeOnboardingPage`, `AcceptInvitationPage`):
  - Resmî ad karşılaştırması gönderim anında yapılıyor (O4'ün öbür ucu).
  - `review_employee_onboarding_service`, `review_employee_onboarding_before_availability_service`'i çağıran bir sarmalayıcı. Ad katmanı CLAUDE.md §9'daki `_base/_vN` yasağına benziyor.
  - BL-645, BL-646 (onboarding metinleri), BL-351 (davet token'ı adres çubuğunda), BL-336, BL-624 ("Active invitation found" ekranı yok).
- **Workspaces hub satırları:** `InvitationRow`, `UnfinishedSetupRow` (`WorkspaceHubPage.tsx:253-260`, `WorkspacesPage.tsx:569`). Bu dosyalar Employees klasöründe ama Account / Workspaces ekranında görünüyor.
- **Çekmecedeki Documents ve Availability bölümleri** (ekran 6 ve Availability). Belge önizlemesi Save'i bekletiyor (`documentPreviewBlocked`, `EmployeeDrawer.tsx:278-282`).
- **Requests (ekran 2):** İşten çıkarılan kişinin bekleyen izni orada görünüyor (O3).
- **Schedule:** Taslak vardiyalar ve yeniden yayın (aşağıda, kanıtlanamayan).

## 4. Kanıtlanamayanlar
- İşten çıkarılan kişinin taslak vardiyaları yayınlanınca yeniden ona atanıyor mu? `publish_schedule_draft_service` arşivli kişiye yalnız bildirimde bakıyor. Asıl kopyalama yolu ve uygunluk kontrolü izlenmedi.
- Restore sonrası yeniden davet: hesabın askıdaki üyeliği kabulde yeniden açılıyor mu, hata mı veriyor? Kabul fonksiyonu okunmadı.
- Başvuran (sahip değil) olarak işten çıkarılan kişinin açık vardiya değişikliği vakaları ne oluyor? `refresh_weekly_exchange…` tetikleyicisi izlenmedi.
- `loadEmployeeInvitationLink` ve `employeeApi` çağrıları `X-Newfork-Workspace-Id` başlığını göndermiyor. Çok sekmede fark yaratıyor mu, ölçülmedi.
- Hiçbir bulgu tarayıcıda denenmedi. Ekrandaki metin ve görünüm iddiaları kod okumasından.

## Kanıt listesi (komut + sonuç)
- **K1.** `git log --oneline -1` → `31649359`. Yerel veritabanında 427 migration var, sonuncusu `20261007030000`; repoda da 427 dosya. Yerel veritabanı main ile aynı.
- **K2.** `pg_get_functiondef` ile okunanlar: `list_employees_service`, `save_employee_service`, `create_employee_command_service`, `terminate_employee_service`, `set_employee_archived_service`, `remove_employee_from_location_service`, `prepare_employee_invitation_service`, `load_employee_invitation_retry_service`, `request_/decide_/list_pending_preferred_names_service`, `review_employee_onboarding(_before_availability)_service`, `save_employee_onboarding_profile_service`, `publish_schedule_draft_service` (alıntılar yukarıda).
- **K3.** `pnpm.cmd --filter @newfork/web exec vitest run src/employees/EmployeesPage.test.tsx` → 1 dosya, 6/6 geçti (6,94 sn).
- **K4.** `grep -rln employee_offboarding_followups apps packages` → boş. Migration'larda yalnız tablo oluşturma ve yazma var; okuma politikası `20260925000517…:14`'te silinmiş.
- **K5.** SELECT: canlı lokasyonu olmayan aktif kayıt 73, bunların Remote olanı 2. 100'den fazla canlı kaydı olan workspace 0.
- **K6.** SELECT: arşivli kişinin bekleyen izni 0, bekleyen ad talebi 0, taslak vardiyası 0, gelecekteki yayınlanmış vardiyası 0. `employee_offboarding_followups` boş. Bu bulgular yerel veride oluşmamış, kod okumasıyla.
- **K7.** SELECT `employee_events` özetleri: "Removed from a location; 0 published shift(s) left open" (22), "Employee record created" (1558) ve diğerleri.
- **K8.** SELECT: aynı workspace'te aynı e-postalı canlı kayıt çifti 2. Türkçe harfli ad 0.
- **K9.** `grep -rn "Send reminder" apps/web/src e2e` → yalnız `EmployeeDrawer.tsx:2584` ve `EmployeeDrawer.test.tsx:997`.
- **K10.** `grep -rn -i "Terminate|Send reminder|Revoke invitation" e2e` → boş.

## Hafıza notu (dosyaya yazılmadı)
- Bu makinede `psql` PATH'te yok. Yerel veritabanına `docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -At` ile bağlanılıyor (55322 portu bu konteynerin).
- Web testinde sahte API ile geçen bir düğme, sunucunun koşulunu görmeyebilir (Y2). Keşifte düğmenin çağırdığı veritabanı fonksiyonu mutlaka okunmalı.
