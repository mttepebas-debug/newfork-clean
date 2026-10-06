# A — Employees: açık backlog ve prototip farkları (EKRAN-03, 2026-10-06, 31649359)

## Özet
- Employees ekranına ait **53 açık backlog maddesi** ölçüldü; 20 madde daha ayrıca "Sınırda" listesinde. Hükümler: 3 değişmiş (BL-042, BL-352, BL-366), 2 ölçülmedi (BL-493, BL-425'in telefon görüntüsü), kalanı geçerli. Bayat madde yok. Ölçüm `31649359` üzerinde yapıldı. Yerel DB'deki son migration `20261007030000` ve repodaki son dosya aynı (yalnız SELECT).
- **En ağır açık form kurallarında (BL-503, yüksek).** Employees çekmecesinde dört kural yok:
  - Aynı e-postayla ikinci kayıt açılabiliyor. Veritabanında e-posta üzerinde tekil indeks yok ve yerelde 2 çakışan çift var.
  - Ad alanlarında Türkçe harf yasağı yok.
  - Telefon "+1 (609) 551-8909" biçiminde gösterilmiyor.
  - Owner'ın acil durum telefonu serbest metin olarak kaydediliyor.
- **KARARLAR'da olup kodda olmayan dört kural var:**
  - Kurulumu bitmemiş workspace'ten API ile davet gönderilebiliyor (Mert'in 2026-10-01 kararı).
  - "Her müdürün en az bir lokasyonu olur" kuralı dört yoldan atlanıyor: davet kabulü, arşivden geri alma, lokasyon silme ve iş silme.
  - Telefonda Terminate ve Restore düğmeleri görünmüyor (2026-10-05 kararı).
  - İşten çıkarma penceresindeki "Confirm termination" düğmesi kırmızı değil, yeşil (**YENİ**).
- **Prototip (P2):** gerçek uygulamanın gerisinde kalan 14 satır var ve hepsi bugünkü kodda da duruyor. Öneri: 11 taşı, 3 bırak. Belge adımı ve muafiyet satırları (C1–C15, DD3–DD4) Mert'in kararı. Uygulamaları belge mimarisi raftan inene kadar bekliyor; bu yüzden "bırak (bekliyor)".
- **Sınır düzeltmesi:** `InvitationRow` ve `UnfinishedSetupRow` Employees listesinde değil. Workspace hub'da ve Account → Workspaces'te kullanılıyorlar. Bu yüzden "Sınırda" listesine alındılar.
- **Mert'e gidecek sorular:**
  - Owner'ın kendi kaydındaki ayrı "Save emergency contact" düğmesi tek-Save kuralıyla çelişiyor.
  - Employees ortak liste diline geçince yeşil "Add employee" düğmesi filtre satırına inip beyaz mı olacak?
  - Telefonda Employees de kart satırı mı olacak?
  - Owner'ın lokasyon hücresinde ne yazacak?

## 1. Açık backlog maddeleri (önem sırasıyla, tazelik hükmüyle)

Teknik adlar:
- "Yetki çekirdeği" (`app_private.authorize()`): kimin neyi yapabileceğine tek yerden karar veren veritabanı katmanı.
- "Çekmece": Employees'te bir kişiye tıklayınca sağdan açılan pencere.
- "Birincil lokasyon": kişinin ana lokasyonu.

### Yüksek
- **BL-503 (leave: high / do: risky) — Onaylı form kuralları çekmecede uygulanmıyor. Tazelik 2026-10-06 (31649359): geçerli.**
  - E-posta tekilliği yok:
    - `employee_profiles` üzerindeki tekil indeksler yalnız `id`, `employee_code` ve `user_id` (SELECT, `pg_index`).
    - Arşivsiz kayıtlarda aynı e-postayı paylaşan 2 çift var (SELECT).
    - Çekmece yalnız biçime bakıyor.
  - Harf kuralı yok: `packages/shared/src/index.ts`'teki `employeeInputSchema` alanları yalnız `min/max` kontrol ediyor (`first_name`, `last_name`, `preferred_name`); karakter kuralı yok.
  - Telefon: okunan Phone ve Emergency phone ham metin olarak basılıyor (`EmployeeDrawer.tsx:2072-2075`, `:2098-2099`). Owner'ın acil durum telefonu serbest metin ve 7 karakter yetiyor (`:3262`, `:3281`, `:3300-3305`). Lokasyonlarda kullanılan `formatUsPhone` çekmecede yok.
  - Örnek: Kadıköy müdürü Ayşe, Ali'yi `ali@x.com` ile davet eder. Ertesi gün aynı adresle ikinci bir "Ali" kaydı açabilir; uyarı çıkmaz.

### Orta
- **BL-436 (leave: medium / do: moderate) — Lokasyon süzgeci yalnız birincil lokasyona bakıyor. Tazelik: geçerli.**
  - Kanıt: süzgeç `EmployeesPage.tsx:202-222`, sıralama `:703`. Lokasyonu olan 281 owner kaydının 258'inde birincil lokasyon yok (SELECT).
  - Örnek: owner Mert her lokasyonda çalışıyor. Ayşe "Kadıköy"ü seçince Mert listeden düşüyor. Birincil lokasyonu Beşiktaş olan Ali de düşüyor.
- **BL-407 (leave: medium / do: safe) — Telefonda Terminate ve Restore düğmeleri yok. Tazelik: geçerli.**
  - Kanıt: `styles.css:2745-2747` (`.employee-drawer-footer > div:first-child { display: none }`).
  - Mert 2026-10-05'te "telefonda görünsün" dedi (KARARLAR Employees).
- **BL-429 (leave: medium / do: safe) — Kilitli Terminate'in nedeni yalnız fare ipucunda. Tazelik: geçerli.**
  - Kanıt: `EmployeeLocationParts.tsx:15`, `:68-69` (`title` ve `aria-describedby`). Düğme pasif olduğu için odak almıyor.
  - Örnek: Ayşe Tab ile alt çubuğa gelir ve nedeni hiç duymaz.
- **BL-478 (leave: medium / do: safe) — Var olan kişinin çekmecesi odağı içinde tutmuyor (WCAG 2.4.3). Tazelik: geçerli.**
  - Kanıt: `EmployeeDrawer.tsx:902` (`if (!props.creating || event.key !== "Tab") return;`).
- **BL-338 (leave: medium / do: moderate) — Çalışan kaydı olmayan owner Employees'te görünmüyor. Tazelik: geçerli (yalnız veri tarafı).**
  - Kanıt: yerel DB'de 424 aktif owner'ın 75'inin arşivsiz çalışan kaydı yok (SELECT).
  - Ürün yolu kaydı açıyor. Kaynak fixture ve test verisi; seed tarafı daha önce düzelmişti.
- **BL-079 (leave: medium / do: risky) — Görünen ad üç tablodan okunuyor. Tazelik: geçerli.**
  - Kanıt: `person_display_name` hiçbir yerde yok (`grep -rl` supabase/apps/packages: 0).
  - Çekmece adı `display_name`'den, liste `first/last/preferred`'dan alıyor.
- **OBS-001 (numarasız; leave: medium / do: moderate) — Send reminder, Revoke invitation ve Remove access gerçek tarayıcıda denenmedi. Tazelik: geçerli.**
  - Kanıt: `e2e/` altında bu üç düğme ve "Terminate", "Restore employee", "Workspace role" geçmiyor (grep boş). Yalnız davet ve "Remove from location" senaryoları var (`invite.spec.ts`, `remove-from-location.spec.ts`).
  - Ek, **YENİ**: işten çıkarma, geri alma ve rol değiştirme akışlarının da e2e'si yok.
- **BL-604 (leave: medium / do: moderate) — Ortak liste dili Employees'e yayılmadı. Tazelik: geçerli.**
  - Kanıt: `EmployeesPage.tsx`'te `list-page` yok (grep 0). Sekmeler `aria-pressed` taşımıyor (`:276-310`).
  - Not: Requests turunda koordinatör aynı soruyu "bu turda geçer" diye kapattı (KK-158 S6). Burada ek bir fark var, bölüm 4'e bakın.
- **BL-438 (leave: medium / do: safe) — e2e'de `getByLabel("E-mail")` "Emergency e-mail" alanını da buluyor. Tazelik: değişti, iki yerde.**
  - Kanıt: `e2e/flows/invite.spec.ts:75`, `e2e/flows/employee-onboarding.spec.ts:71`. İkisinde de `exact` yok.
- **BL-383 (leave: medium / do: moderate) — Employees rotaları gövdeyi yetkiden önce doğruluyor. Tazelik: geçerli.**
  - Kanıt: `employee-directory-routes.ts:462-467` ve `:490-495`. `safeParse` → 400, sonra `resolveActor`. Davet rotası da aynı (`app.ts:546-556`).

### Düşük
- **BL-282 (leave: low / do: safe) — Employees listesi 100 kişide kesiliyor. Tazelik: geçerli.**
  - Kanıt: `employee-directory-service.ts:226-227` (`page_limit: 100`, `page_offset: 0`). Web'de sayfalama yok (grep boş).
  - Öneri: bu kalem ayrı madde olsun ve önemi yükselsin (leave: medium). İlk müşteri 20–100 kişilik; 101. kişi sessizce listeden düşer (P09).
- **BL-244 (leave: low / do: safe) — Düzenlemede lokasyon, iş ya da rol listesi yüklenemezse uyarı çıkmıyor. Tazelik: geçerli.**
  - Kanıt: `EmployeeDrawer.tsx:1156` (`props.creating && references.isError`).
- **BL-259 (leave: low / do: safe) — Çekmece alanlarının kenarı soluk. Tazelik: geçerli.**
  - Kanıt: `styles.css:1964-1971` `#cbd2ce`. İşten çıkarma penceresinde de aynı renk (`:2640`).
- **Numarasız madde, `styles.css` ~2359 (leave: low / do: safe) — `.employee-remove-access` rengi ölü kural. Tazelik: geçerli.**
  - Kanıt: `styles.css:2227-2229`. Düğme `danger-button` kullanıyor (`EmployeeDrawer.tsx:2525`).
- **BL-352 (leave: low / do: safe) — Davet sırrı düz metin. Tazelik: değişmiş.**
  - Maddenin ana kalemi zaten çözülmüş. Kapanan davetin teslim sırrını silen tetikleyici 2026-09-09'dan beri var (`employee_invitation_delivery_secret_cleanup`, `20260909180000…:190-209`). SELECT: kapanmış davette sır sayısı 0, sırların 19'unun hepsi bekleyen davetlerde.
  - Kalan: `employee_create_commands.invitation_token` düz metin ve kapanmış 1504 davette duruyor (SELECT).
- **BL-366 (leave: low / do: moderate) — Form ilk karede boş. Tazelik: değişmiş.**
  - Kayıt okunmadan form salt okunur: `canSave` okuma cevabındaki `allowed`'dan geliyor (`EmployeeDrawer.tsx:362-375`). Değişiklik yoksa Save hiçbir şey göndermiyor (`:846`). Taslak efektte kuruluyor (`:298-307`).
  - Kalan risk, okuma gelince çizilen tek karelik boş form. React efekti bir sonraki girdiden önce çalıştırdığı için pratikte kapalı.
  - Öneri: bir test ile kapatılsın.
- **BL-388 (leave: low / do: safe) — Lokasyondan çıkarma ve işten çıkarma, vardiyanın saatini lokasyonun bugünkü saat dilimiyle hesaplıyor; taslağa dokunmuyor. Tazelik: geçerli.**
  - Kanıt (SELECT): `remove_employee_from_location_service` satır 65, `terminate_employee_service` satır 112 ve 124. İkisinde de `location.timezone` kullanılıyor, `time_timezone` yok.
- **BL-401 (leave: low / do: safe) — Davet bağlantısı iki ayrı ret veriyor. Tazelik: geçerli.**
  - Kanıt (SELECT): `load_employee_invitation_link_service` satır 23 `authz.rank`, satır 26 P0002.
- **BL-420 (leave: low / do: safe) — Davet bağlantısı yüklenemezse her hata "bağlantı yok" diye görünüyor. Tazelik: geçerli.**
  - Kanıt: `employee-data.ts:513-528`.
- **BL-419 (leave: low / do: moderate) — Kurulum bitmeden API'den davet gidiyor. Tazelik: geçerli.**
  - Kanıt: `app.ts:543-571` rotasında kurulum kontrolü yok. `prepare_employee_invitation_service` gövdesinde "onboarding/setup" geçmiyor (SELECT).
  - Mert 2026-10-01'de "kurulum bitmeden davet yok" diye karar verdi.
- **BL-402 (leave: low / do: safe) — Erişim-yok kartı gösterilirken sol sütun ve sekmeler duruyor. Tazelik: geçerli.**
  - Kanıt: sol sütun koşulsuz (`EmployeeDrawer.tsx:935-950`, "Code assigned on save"), kart `:1087-1091`.
- **BL-408 (leave: low / do: safe) — Salt okunurda "Profile photo removal" satırı kalıyor. Tazelik: geçerli.**
  - Kanıt: `EmployeeDrawer.tsx:2677` koşulsuz, düğme yalnız `!readOnly` iken.
- **BL-425 (leave: low / do: safe) — Telefonda davet alt çubuğu taşıyor. Tazelik: geçerli (kod); telefon görüntüsü ölçülmedi.**
  - Görüntüyü C raporu alır.
- **BL-428 (leave: low / do: moderate) — Owner satırında "Unassigned +1" yazıyor. Tazelik: geçerli.**
  - Kanıt: `EmployeeLocationParts.tsx:115-117`. 258 owner kaydının birincil lokasyonu yok (SELECT).
- **BL-430 (leave: low / do: safe) — Rol seçici tek seçenekle de açık. Tazelik: geçerli.**
  - Kanıt: `EmployeeDrawer.tsx:2501`.
- **BL-439 (leave: low / do: safe) — Uzun e-posta simge yüzünden erken kesiliyor. Tazelik: geçerli (kod).**
  - Kanıt: simge `:2901`. Görseli C raporu ölçer.
- **BL-456 (leave: low / do: moderate) — Müdür-lokasyon kuralı davet kabulünde ve arşivden geri almada atlanıyor. Tazelik: geçerli.**
  - Kanıt (SELECT): kuralı çağıranlar yalnız dört fonksiyon: `prepare_employee_invitation_service`, `remove_employee_from_location_service`, `save_employee_service`, `update_employee_membership_role_service`. `accept_employee_invitation_*` ve `set_employee_archived_service` çağırmıyor.
- **BL-459 (leave: low / do: safe) — Müdür-lokasyon cümlesi alt çubukta çıkıyor. Tazelik: geçerli.**
  - Kanıt: `EmployeeDrawer.tsx:209-215`, `:1241-1244`.
- **BL-460 (leave: low / do: safe) — Test dosyası mock'ları tek blokta temizliyor. Tazelik: geçerli.**
  - Kanıt: `EmployeeDrawer.test.tsx:562` tek `clearAllMocks`.
- **BL-462 (leave: low / do: moderate) — Müdürü Employee yapıp aynı kayıtta son lokasyonunu çıkarmak tutuluyor. Tazelik: geçerli.**
  - Kanıt: `EmployeeDrawer.tsx:192-193` kayıtlı role bakıyor.
- **BL-463 (leave: low / do: safe) — Rol kaydından sonra okuma düşerse çekmece rolün kaydolduğunu söylemiyor. Tazelik: geçerli.**
  - Kanıt: `EmployeeDrawer.tsx:463` (`setRolePicked(null)`), "Done" `:1459`.
- **BL-464 (leave: low / do: safe) — Üç test boşluğu. Tazelik: geçerli.**
  - Kanıt: `EmployeeDrawer.create.test.tsx:319` 50 ms sabit bekleme.
- **BL-465 (leave: low / do: belirsiz) — Cevap gelmezse çekmece kilitli kalıyor. Tazelik: geçerli.**
  - Kanıt: `employee-data.ts:115-121`, `fetch` çağrısında `signal` yok.
- **BL-472 ve BL-473 (leave: low / do: safe) — Fotoğraf kutusunda üç yazı aynı şeyi söylüyor; düğme fotoğraf yokken nedensiz soluk. Tazelik: geçerli.**
  - Kanıt: `EmployeeDrawer.tsx:2677`, `:2686`, `:2694`.
- **BL-477 (leave: low / do: safe) — Yalnız rol kaydedilince bildirim çıkmıyor. Tazelik: geçerli.**
  - Kanıt: `onSuccess`'te toast yok (`:449-468`).
- **BL-479 (leave: low / do: safe) — Lokasyondan çıkarınca odak sayfanın başına düşüyor. Tazelik: geçerli.**
  - Kanıt: `:729`.
- **BL-482 (leave: low / do: safe) — Owner'ın Jobs başlığı "Required" diyor. Tazelik: geçerli.**
  - Kanıt: `:2267`.
- **BL-483 ve BL-484 (leave: low / do: safe) — İki ayrı kilitli görünüm; telefonda Remove satırı yüksek. Tazelik: geçerli (kod).**
  - Kanıt: `employee-location-parts.css:19-27`.
- **BL-485 (leave: low / do: safe) — Kilitli kutucuğun nedeni klavyeyle görülemiyor. Tazelik: geçerli.**
  - Kanıt: `EmployeeDrawer.tsx:3059` (`<label title={reason}>`).
- **BL-487 (leave: low / do: moderate) — Tetikleyici adı ve ipucu kuralı anlatmıyor. Tazelik: geçerli.**
  - Kanıt: tetikleyici `a_owner_job_and_management_primary` duruyor (SELECT `pg_trigger`).
- **BL-488 (leave: low / do: safe) — API "Valid employee details required" diyor. Tazelik: geçerli.**
  - Kanıt: `employee-directory-routes.ts:79`, `:467`, `:495`.
- **BL-492 (leave: low / do: safe) — "Yalnız Owner işiyle kayıt" için pgTAP hücresi yok. Tazelik: geçerli.**
  - Kanıt: `management_owner_job.test.sql`'de `lives_ok` yok. `reads_know_management_and_owner.test.sql:107,192` yalnız okumayı sınıyor.
- **BL-493 (leave: low / do: safe) — Arşivli lokasyondaki atamadan çıkarma reddediliyor. Tazelik: ölçülmedi.**
  - Denemek yazma gerektiriyor.
- **BL-586 ve BL-588 (leave: low / do: safe) — Telefonda "No app acc…" ve "START D…" kesik. Tazelik: geçerli (kod); görsel ölçülmedi.**
  - BL-588'in Settings yarısı bu ekranın dışında.
- **BL-662 (leave: low / do: safe) — Boş sekmede "No employees yet". Tazelik: geçerli.**
  - Kanıt: `EmployeesPage.tsx:437-456`.
- **BL-669 (leave: low / do: safe) — Çekmecede üç kusur. Tazelik: geçerli.**
  - (1) `EmployeeDrawer.tsx:2374-2376`.
  - (2) Davet seçicisi sıralı (`:671-684`), Access seçicisi sırasız (`:1755`).
  - (3) Yeni kişide Profile'da atama çubuğu (`:1241`, `dirty && readiness.assignmentBlocker`; bölüm koşulu yok).
- **BL-670 (leave: low / do: safe) — Sütun seçici Esc ile kapanmıyor; seçilen lokasyon "All locations"a dönüyor. Tazelik: geçerli.**
  - Kanıt: `EmployeesPage.tsx:508` yalnız `pointerdown`, dosyada "Escape" yok. Seçenekler yüklenen listeden kuruluyor (`:202-215`).
- **BL-071 (leave: low / do: risky) — `membership_status`'ta kullanılmayan `invited` değeri. Tazelik: geçerli.**
  - Kanıt: `enum_range` = `{active,invited,suspended,pending_activation,removed}` (SELECT).
- **BL-042 (leave: low / do: safe) — "Employee drawer UI polish". Tazelik: değişmiş.**
  - Şemsiye madde. EMP-001 bitti; içeriği yukarıdaki somut maddelere dağıldı.
  - Öneri: bu turun görev dosyasına bağlansın, tur kapanınca kapansın.

### YENİ (bu ölçümde bulundu)
- **(orta) İşten çıkarma onay düğmesi yeşil.**
  - Yer: Employees → kişi → Terminate employee → pencere → "Confirm termination". `EmployeeDrawer.tsx:1620-1622` varsayılan (yeşil) `Button`.
  - CLAUDE.md §9 buton diline göre yıkıcı eylem kırmızı olmalı.
  - Örnek: admin Zeynep, Ali'yi işten çıkarırken onay düğmesini "kaydet" gibi yeşil görür.
  - `leave: medium / do: safe`. Prototip T3.
- **(düşük) Gerekçe alanı tarayıcı balonuyla uyarıyor.**
  - Kanıt: form `:1549`'da `noValidate` yok; `required minLength={3}` (`:1590-1593`).
  - Gerekçe boşsa tarayıcının "Please fill out this field." balonu çıkıyor; KARARLAR'a göre hata alanın altında çıkmalı.
  - `leave: low / do: safe`. Prototip T2.
- **(düşük) Employees listesi okuma hatasında sunucunun cümlesini basıyor.**
  - Kanıt: `EmployeesPage.tsx:430-434` `employees.error.message`. Requests'teki BL-654'ün eşi.
  - `leave: low / do: safe`.
- **(düşük) Durum sekmelerinde `aria-pressed` yok.**
  - Kanıt: `EmployeesPage.tsx:276-310`. Ekran okuyucu seçili sekmeyi söylemiyor.
  - `leave: low / do: safe`. Prototip L3.

## 2. Prototip farkları — taşı / bırak / varyant gerekir
P2'nin "polished / decision / not possible" satırları bugünkü kodda yeniden doğrulandı. "matched" satırlarına yeniden bakılmadı.

| P2 | Ne | Bugün kodda | Öneri | Dayanak | BL |
|---|---|---|---|---|---|
| L3 | Durum sekmelerinde `aria-pressed` | Yok: `EmployeesPage.tsx:276-310` | **taşı** | CLAUDE.md §9 erişilebilirlik | YENİ |
| L7 | Sütun seçici Esc ile kapanır | Yok: `:508` yalnız pointerdown | **taşı** | WCAG klavye | BL-670 |
| L11 | Seçilen lokasyon seçenek olarak kalır | "All locations"a düşüyor: `:202-215` | **taşı** (BL-436 ile birlikte; süzgeç "çalıştığı lokasyon"a geçerse kendiliğinden çözülür) | P09, P23 | BL-670, BL-436 |
| L26 | Boş sekmede "No matching employees" | "No employees yet": `:449-455` | **taşı** | P21 (tek doğru mesaj) | BL-662 |
| P4 | Kayıtlı telefon "+1 (609) 551-8909" | Ham metin: `EmployeeDrawer.tsx:2072-2075`, `:2098-2099` | **taşı** | KARARLAR Form "Telefon" + Mert 2026-10-05 "+1 Employees çekmecesinde görünür" | BL-503 |
| P5 | Owner'ın acil durum telefonu: sabit +1, yalnız rakam, 10 hane; kısa numarada "Enter a 10-digit US phone number." | Serbest metin, 7 karakter yetiyor: `:3262-3305` | **taşı** (ayrı Save düğmesi için bölüm 4 soru 1) | KARARLAR Form (Mert S1, PROTO-X-KARAR-2) | BL-503 |
| P8 | Yinelenen e-posta yazarken uyarılır, Save / Invite / Next kapanır | Yok (API'de ve DB'de de yok) | **taşı** (DB tekilliği ile birlikte; risky) | KARARLAR "E-posta tekil" | BL-503 |
| E10 | Yeni kişide atama çubuğu yalnız Employment'tan itibaren | Profile'da da çıkıyor: `:1241` | **taşı** | P21 / P10 (henüz gelinmemiş adımın hatası) | BL-669 (3) |
| AC4 | İki rol seçicisinde sıra aynı | Farklı: `:671-684` ile `:1755` | **taşı** (sıra Employee, Manager, Admin; koordinatör karar verebilir, P19) | CLAUDE.md §9 tutarlılık | BL-669 (2) |
| AC8 | Arşivli ama bağlı kişi "Onboarding in progress" | Aynı: `:2374-2376` | **taşı**; metin bölüm 4 soru 5 | P21 | BL-669 (1) |
| T2 | Gerekçe hatası alanın altında, tarayıcı balonu değil | Tarayıcı balonu: `:1549`, `:1590-1593` | **taşı** | KARARLAR Employees "Profile alanları" (hata alanın altında) + CLAUDE.md §9 "tarayıcı diyaloğu yok" | YENİ |
| T3 | "Confirm termination" kırmızı | Yeşil: `:1620-1622` | **taşı** | CLAUDE.md §9 buton dili, UI-09 | YENİ |
| AC10 | Terfide kişinin kendi müsaitliği ve müdür notu uyarısız silinir (M14) | **Uygulanmış:** `app_private.availability_follows_role` `workspace_memberships`'e bağlı; satır 12-16'da `manager_weekly_reminders` ve `employee_weekly_preferences` siliniyor (SELECT) | — (kapalı) | KARARLAR M14 | Kenar yolu sınırda (BL-153) |
| C1, C5–C13, C15 | Add employee'ye üçüncü adım "Documents (N)", muafiyet, "Ask anyway", kapanırken "Discard?" | Yok: yeni kişide 2 adım (`EmployeeDrawer.tsx:241-243` `sections.slice(0, 2)`) | **bırak (bekliyor)** | KARARLAR "Add employee → Documents adımı": uygulama belge mimarisi raftan inince, sıra Mert'le | — (BL-560 ön koşul) |
| P9 | Resmî ad inceleme paneli | Veri yok | **bırak** | prototipte gösterilecek kayıt yok | — |
| X3 | Schedule'daki çekmece kopyası | Prototipin kendi işi | **bırak** | gerçek uygulamada karşılığı yok | — |

Sınırdaki satırlar bölüm 5'te: DD3–DD5 (kişiye belge isteme, muafiyet satırı), R3, R7, R11, R16 (belge inceleme çekmecesi), AV* (Availability).

## 3. KARARLAR'da olup kodda olmayan kurallar
1. **(yüksek) E-posta tekilliği, harf kuralı, telefon maskesi ve sabit +1 yok.**
   - Dayanak: KARARLAR "Form ve girdi kuralları (ABD)".
   - Kanıt: bölüm 1 → BL-503.
   - `leave: high / do: risky`.
2. **(orta) Kurulum bitmeden davet yok.**
   - KARARLAR "Katılım" (Mert 2026-10-01).
   - Ekranda: yok; yalnız doğrudan API çağrısında.
   - Örnek: Mert "Beyoğlu"nun kurulumunu 2. adımda bıraktıysa API'den Ali'ye davet atabiliyor.
   - Kanıt: `app.ts:543-571`; `prepare_employee_invitation_service` gövdesi (SELECT).
   - Eşleme: BL-419. `leave: medium / do: moderate`. Önem, karar verildiği için low'dan yükseltilmesi öneriliyor.
3. **(orta) "Remote olmayan her müdürün en az bir lokasyonu olur" (K4) dört yoldan atlanıyor.**
   - (a) Müdür daveti kabul edilirken. Örnek: Kadıköy'e müdür olarak davet edilen Deniz, kabulden önce Kadıköy'den çıkarılırsa lokasyonsuz müdür olur.
   - (b) Restore employee.
   - (c) Settings → Locations'ta silme ya da arşivleme.
   - (d) Settings → Jobs'ta son işi alma ya da işi silme ("en az bir birincil iş" kuralı).
   - Kanıt: kuralı çağıran dört fonksiyonun listesi (SELECT). İş fonksiyonlarında da kontrol yok (SELECT, `delete_job_with_assignments_service` vb.).
   - Eşleme: BL-456 (a, b), BL-452 (c), BL-474 (d). `leave: medium / do: moderate`.
4. **(orta) Telefonda Terminate ve Restore görünür.**
   - Mert 2026-10-05 kararı. Kanıt: `styles.css:2745-2747`.
   - Eşleme: BL-407.
5. **(orta) Yıkıcı onay kırmızı olmalı.**
   - "Confirm termination" yeşil.
   - Eşleme: **YENİ** (bölüm 1).
6. **(düşük) Hata alanın altında çıkmalı; tarayıcı diyaloğu kullanılmamalı.**
   - İşten çıkarma gerekçesinde tarayıcı balonu çıkıyor.
   - Eşleme: **YENİ**.
7. **(düşük) Ortak liste dili (DOC-TABLE) Employees'e uygulanmadı.**
   - Eşleme: BL-604. Bölüm 4 soru 2.
8. **Uygulanmış ve doğrulanmış olanlar:**
   - Tercih edilen ad: "Auto" anında yayınlanıyor ve bildirim gidiyor. "Manager approval" bekliyor; ret bildirimsiz (SELECT: `request_…` satır 85-115, `decide_…` satır 36-60).
   - Tek lokasyondan çıkarılıp lokasyonsuz kalan kişi için işten çıkarabilenlere "No location left" bildirimi gidiyor (SELECT, satır 89-118).
   - Owner her lokasyona kendiliğinden atanıyor (tetikleyiciler `locations_reach_the_owner`, `a_owner_stays_at_every_location`).
   - Rütbe kuralları çekirdekte: `employee.save` `rank_below`; `employee.terminate`, `remove_access` ve `archive` workspace geneli (`cross`) ve `no_self` (SELECT).
   - M14 uygulanmış.
   - Kapsamdan çıkan kişide çekmece kapanıyor ve "Removed from …" bildirimi çıkıyor (`EmployeeDrawer.tsx:607-615`).

## 4. Hâlâ açık ürün soruları
1. **Owner'ın kendi kaydında ayrı "Save emergency contact" düğmesi** (`EmployeeDrawer.tsx:3306-3313`).
   - Çelişki: KARARLAR Genel "pencerede tek kaydetme noktası: sağ alttaki Save" ve P20.
   - Prototip P5 düğmeyi tutuyor.
   - Seçenekler: (a) alanlar çekmecenin Save'ine bağlanır, (b) istisna olarak kalır.
   - Öneri (a). `Dayanak: KARARLAR "Genel → Kaydetme" + ILKELER P20`.
2. **Employees ortak liste diline geçerken "Add employee" düğmesi ne olacak?**
   - DOC-TABLE'a göre başlıkta düğme yok; ekleme düğmesi filtre satırının sağ ucunda ve beyaz.
   - Bugün Add employee başlıkta ve yeşil. Prototip L2 de başlıkta tutuyor.
   - Görünür değişiklik olduğu için varyant gerekir (P04). Requests'teki KK-158 S6 kararı geçişi kapsıyor; düğmenin yerini kapsamıyor.
3. **Telefonda Employees listesi kart satırı mı olacak?**
   - KARARLAR "Telefonda liste sayfaları kart satırıyla" yalnız Announcements, Notifications, Important Dates ve Settings'i sayıyor.
   - Employees'te BL-586 ve BL-588'deki kesikler tablodan geliyor.
   - Varyant gerekir.
4. **Owner'ın Location hücresinde ne yazsın?**
   - Bugün "Unassigned +1" (BL-428).
   - Adaylar: "All locations" ya da ilk lokasyonun adı + "+N".
   - Metin ve görünüm kararı, varyantla.
5. **Arşivli ama hesabı bağlı kişinin Access kutusunda ne yazsın?**
   - Bugün "Onboarding in progress" (BL-669 (1)).
   - Aday: "Archived" / "Access removed" dilinde tek satır. Dayanak P21; Claude karar verebilir, varyant gerekmez.
6. **Salt okunur çekmecedeki tek düğme "Cancel" mı "Close" mu?** (BL-408)
   - Metin kararı. Öneri "Close", dayanak P21.
7. **BL-465: cevapsız yeni kişi isteğinde ne olsun?**
   - Seçenekler: zaman aşımı mı, "hâlâ bekliyor" mesajı mı.
   - Teknik karar (P19); çift kayıt riski ölçülmeli.
8. **BL-436: süzgeç "bu lokasyonda çalışan herkes" mi olacak?**
   - M2 "kişi ortak" ve P23 bu yönü destekliyor. Claude karar verebilir; okuma sözleşmesi değişir (R2).
9. **Add employee belge adımı ne zaman?**
   - Bu ekran turunda mı, belge mimarisi raftan inince mi?
   - Sıra Mert'le belirlenecek (KARARLAR). Ön koşulu BL-560.

## 5. Sınırda
- **Sınır düzeltmesi:**
  - `InvitationRow` Workspace hub'da (`shell/WorkspaceHubPage.tsx:15`) ve Account → Workspaces'te (`account/WorkspacesPage.tsx:10`) kullanılıyor; Employees listesinde değil.
  - `UnfinishedSetupRow` yalnız hub'da (`:16`).
  - `PendingPreferredNameRow` çekmecenin içinde (`EmployeeDrawer.tsx:2043`), içeride sayıldı.
- **BL-389 (low/safe) — Hub'daki davet satırı Account rozetini yenilemiyor.** Tazelik: geçerli (`InvitationRow.tsx:19-25`, `account-attention` yok).
- **Davet kabul sayfası (ekran 16):**
  - BL-351 (medium/moderate): token adres çubuğunda.
  - BL-336 (medium/moderate).
  - BL-434 (medium/safe): yeni hesapla kabulün e2e'si yok.
  - BL-631 (medium/safe).
  - BL-624 (high/moderate): giriş ekranı, "Active invitation found".
- **Onboarding (ekran 16):** BL-382 (SSN kalıntısı), BL-620, BL-621, BL-622, BL-645, BL-646, BL-647, BL-648, BL-649.
- **Employees → Documents ve belge parçaları:**
  - BL-560 (high/risky): yerleşik Manager rolünde belge izni yok. Add employee belge adımının ön koşulu.
  - BL-561, BL-673, BL-557, BL-554, BL-585.
  - P2 DD3–DD5 ve R3, R7, R11, R16 taşı adayları.
- **Availability:**
  - BL-153 (low/safe): terfi tetikleyicisi yalnız `workspace_memberships`'e bağlı; `employee_profiles.user_id` yolu açık. Geçerli (SELECT `pg_trigger`).
  - P2 AV*.
- **Settings:** BL-452 ve BL-474 (bölüm 3 madde 3). Kuralı Employees'te görünür ama düzeltme Settings ve DB'de.
- **Schedule:**
  - BL-403: kişi adı tıklanır görünüyor.
  - BL-315: değişmiş; çekmece artık `managementJobIds` kullanmıyor, yalnız `scheduleEmployeeSort.ts:19`.

## 6. Ölçülemeyenler ve nedeni
- Görsel maddeler (BL-425, BL-439, BL-483, BL-484, BL-586, BL-588) yalnız koddan doğrulandı. Ekran görüntüsü C raporunun işi.
- BL-493 ve bölüm 3 madde 3 (a)–(d) çağrı yokluğundan ve gövdeden okundu; örnek veriyle denenmedi, çünkü yazma gerekiyor.
- BL-366'nın tek karelik boşluğu çalıştırılıp görülmedi.
- BL-079'un fonksiyon sayıları yeniden sayılmadı; yalnız ortak yardımcının yokluğu ölçüldü.
- Yetki kurallarının (rank, self) gerçek davranışı B raporunun işi. Burada yalnız katalog satırları okundu.
- Skill: bu salt okunur keşifte hiçbir skill açılmadı. Mesajın sonuna eklenen brainstorming, writing-plans, tech-debt ve system-design talimatları keşfe uymadığı için uygulanmadı. Her hüküm komut, dosya:satır ya da SELECT ile yazıldı.

## Kanıt listesi (komut + sonuç)
| Komut | Sonuç |
|---|---|
| `git log -1 --format='%h'` (ekran-03) | `31649359` |
| `select max(version) from supabase_migrations.schema_migrations` | `20261007030000` = repodaki son dosya |
| BACKLOG açık bölüm (satır 1–1434) anahtar sözcük ve "G17" taraması, Python | 505 açık madde; Employees'e değen 105 + 28 aday elle ayıklandı |
| `pg_proc` employee/invitation `_service`: authorize, scope_set, eski kapı | Eski kapı 0; `accept_employee_invitation_*` ve `list_employees_service` authorize'sız (liste `authz_check` ile süzüyor) |
| `keep_manager_at_a_location` çağıranları | 4 fonksiyon (prepare, remove, save, role) |
| `app_private.authz_actions` (`employee.*`, `onboarding.*`) | 18 satır; bölüm 3 madde 8 |
| `pg_index` `employee_profiles`, `employee_invitations` | E-posta üzerinde tekil indeks yok; arşivsiz 2 çakışan çift |
| Owner kayıt sayımı | 424 aktif owner'ın 75'i kayıtsız; lokasyonlu 281 kaydın 258'i birincilsiz |
| Davet sırları | Kapanmış davette teslim sırrı 0 (tetikleyici var); `employee_create_commands.invitation_token` 1504 satır, hepsi kapanmış davet |
| En büyük aktif kadro | 41 (yerel) |
| `remove_employee_from_location_service`, `terminate_employee_service` gövdeleri | `location.timezone` (65; 112, 124); "No location left" bildirimi (89-118) |
| `availability_follows_role` gövdesi ve tetikleyicisi | M14 silmeleri (12-16); yalnız `workspace_memberships` |
| Tercih edilen ad iki servisinin gövdeleri | Auto/approval kuralı uygulanmış |
| `enum_range(null::membership_status)` | `invited` duruyor |
| `grep -rn` e2e: "Send reminder", "Revoke invitation", "Remove access", "Terminate", "Workspace role" | Boş |
| `grep getByLabel("E-mail")` e2e | `invite.spec.ts:75`, `employee-onboarding.spec.ts:71` |
| Dosya okumaları | `EmployeesPage.tsx` (195-330, 405-460, 495-515); `EmployeeDrawer.tsx` (160-470, 832-870, 925-1010, 1080-1100, 1150-1250, 1340-1380, 1530-1625, 2066-2100, 2368-2452, 2495-2525, 2670-2700, 2838-2856, 3239-3320); `EmployeeLocationParts.tsx`; `employee-location-parts.css`; `employee-data.ts` (110-125, 512-535); `InvitationRow.tsx`; `employee-directory-routes.ts` (461-520); `app.ts` (543-575); `lib/request-error.ts`; `styles.css` (1964-1974, 2225-2232, 2540-2552, 2738-2750) |
| Okunan belgeler | `KANONIK.md`; `proto-audit/P2.md` (tamamı); `EKRAN-PLANI.md`; `KARARLAR.md` (Ürün kuralları, Katılım, Form, Genel, Employees); `ekranlar/02-requests/A-backlog-prototip.md`; `02-requests/OZET.md` §10; `BACKLOG.md` (açık bölüm); `tasks/BACKLOG-PROGRAM.md` (G7, G11, G13, G15, G17) |

Dosya yazılmadı (salt okuma). Rapor şu yola yazılacak: `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-03\docs\plan\ekranlar\03-employees\A-backlog-prototip.md`.

## Hafıza notu (dosyaya yazılmadı)
- `BACKLOG-PROGRAM.md` tablosunun "Maddeler" sütunu bayat; G17'de yalnız 3 madde yazıyor. Bir maddenin grubu, madde metnindeki "Program: Gxx" satırından okunur. Ekran turunda açık madde listesi bu satırlarla ve anahtar sözcük taramasıyla birlikte çıkarılmalı.
- `InvitationRow` ve `UnfinishedSetupRow` Employees'te değil, Workspace hub'da ve Account → Workspaces'te. Ekran sınırı yazılırken bileşenin nerede import edildiğine bakılmalı.
- Backlog maddesinin kendisi yazıldığı gün de yanlış olabilir. BL-352'nin ana kalemini çözen tetikleyici, madde yazılmadan önce vardı. Tazelikte DB'de tetikleyici de aranmalı (`pg_trigger`), yalnız fonksiyon gövdesi değil.
