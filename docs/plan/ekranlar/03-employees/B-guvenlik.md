# B — Employees: güvenlik ve yetki denetimi (EKRAN-03, 2026-10-06, 31649359)

DENETİM SONUCU: BULGU VAR (kritik 0, yüksek 0, orta 2, düşük 5). Başka bir workspace'in verisine giden bir yol bulmadım. Eş rütbe kuralı (müdür müdürü, admin admin'i yönetemez) bütün eylemlerde tutuyor. İki doğruluk açığı var. Birincisi: müdür, ekranda kilitli görünen resmî adı API'den değiştirebiliyor. İkincisi: geçmiş tarihli işten çıkarma, geçmiş haftaların yayınlanmış vardiyalarını boşaltıyor.

## Özet
- **Tenant izolasyonu temiz.** Employees'in 24 tablosunda satır erişimi (RLS) açık. Tarayıcı oturumunun bunlara doğrudan yazma izni yok. Ekranın 26 `*_service` fonksiyonunun hiçbiri tarayıcıdan ya da oturumsuz ziyaretçiden çağrılamıyor. Hepsi API üzerinden, servis anahtarıyla çalışıyor ve arama yolları boş (`search_path=""`). Başka workspace'in kişisi ile hiç var olmayan bir kişi aynı cevabı alıyor (`authz.out_of_scope`).
- **Rütbe kuralı ölçüldü ve tutuyor.** Yerel DB'de 995 müdür–müdür ve 2 admin–admin çiftinde düzenleme, rol, arşiv, işten çıkarma, erişim kaldırma, ad onayı ve davet "rank" (rütbe yüzünden hayır) cevabı veriyor. Kimse kendi rolünü değiştiremiyor. Owner'a dokunulamıyor. Müdür işten çıkaramıyor, arşivleyemiyor ve erişim kaldıramıyor (P07); 2.329 müdür–çalışan çiftinde ölçüldü.
- **Orta (O1):** Kadıköy müdürü, aktif bir çalışanın adını ve soyadını API'den değiştirebiliyor. Resmî ad onayı ise yalnız owner ve admin'in (KARARLAR 2026-10-02). Çekmece bu alanları "Locked after activation" diye kilitliyor; sunucu kilitlemiyor.
- **Orta (O2):** owner ya da admin işten çıkarmaya geçmiş bir tarih girerse, o tarihten bu yana yayınlanmış bütün vardiyalar boşalıyor. Etkilenen haftalar geçmiş haftalar da olabilir. Geçmiş hafta kilidi ve P09 aşılıyor; Restore bu kaybı geri getirmiyor.
- **Düşük:** arşivle / geri al komutu kaydın o anki durumuna bakmıyor (D1). Daveti henüz kabul edilmemiş, admin olarak davet edilmiş kişi rütbe kontrolünde "çalışan" sayılıyor (D2). Çekmecenin özel bilgi bölümü yetki çekirdeği yerine izin listesine bakıyor (D3). BL-401 hâlâ geçerli (D4). Workspace fotoğrafı yolu ölü (D5).
- SQL sızması, XSS (kullanıcı metninin sayfada kod gibi çalışması), log'a kişisel veri ya da ham veritabanı hata metni bulmadım.

## 1. Bulgular (önem sırasıyla)

### O1 — Müdür, aktif çalışanın resmî adını API'den değiştirebiliyor (Orta)
- **Ekranda nerede:** Employees → kişi → çekmece → Profile → First / Last name. Ekranda kilitli ("Locked after activation"), ama aynı kaydı `PUT /v1/workspaces/:id/employees/:employeeId` yazıyor.
- **Örnek:**
  - Kadıköy müdürü Ayşe, onboarding'ini bitirmiş Emre'nin kaydını açıyor. Ekranda adlar kilitli.
  - Ayşe aynı isteği tarayıcının geliştirici araçlarından `first_name: "Emir"` ile gönderiyor ve kayıt değişiyor.
  - Oysa onboarding'de resmî ad düzeltmesini Ayşe onaylayamıyor; o adım owner'a ya da admin'e düşüyor.
- **Neden oluyor:**
  - `save_employee_service`, ad ve soyadı her `employee.save` sahibine yazdırıyor; hesabın bağlı ya da aktif olmasına bakmıyor (`supabase/migrations/20261003000000_an_archived_location_counts_nowhere.sql:745`).
  - Kilit yalnız web'de: `apps/web/src/employees/EmployeeDrawer.tsx:1704` (`identityLocked = display_status === "active"`) ve `:1982`.
  - Onboarding'deki resmî ad onayı, `employee_profiles.first_name` ve `last_name` alanlarına yazıyor (`review_employee_onboarding_before_availability_service`, yerel gövde satır 68-69). Yani bu iki alan resmî adın kendisi.
- **Kanıt (SELECT):** aynı müdür–çalışan çiftlerinde `authz_reason(...,'employee.save')` → izin var; `authz_reason(...,'onboarding.legal_name')` → `out_of_scope`. Üç workspace'te 4 çiftte örneklendi (aşağıda). `employee_profiles` üzerinde ad kilitleyen bir tetik (trigger) yok.
- **Etkisi:** veri sızmıyor. Ama bordro ve resmî belgelerde kullanılacak ad, karar halkası dışından değişebiliyor (KARARLAR "Onboarding'de resmî ad…", P11). Bekleyen davette de ekran adları kilitli gösteriyor, sunucu yine yazdırıyor.
- **BL eşleme:** **YENİ.** BL-079 (ad üç tabloda) ve BL-646 (resmî ad onayı ekranı) ile komşu.
- **İşaret:** leave: medium / do: risky.
  - Sunucuda kural şu olmalı: bağlı ya da aktif kayıtta ad değişikliği yalnız `onboarding.legal_name` ile.
  - Kırmızı pgTAP: müdür aktif çalışanın adını değiştiremez.

### O2 — Geriye tarihli işten çıkarma, geçmiş haftaların yayınlanmış vardiyalarını boşaltıyor (Orta)
- **Ekranda nerede:** Employees → kişi → çekmece → "Terminate employee" → tarih ve saat alanı. Alanın üst sınırı var (`max`), alt sınırı yok (`EmployeeDrawer.tsx:1563-1565`).
- **Örnek:**
  - Admin Zeynep, Ali'yi 5 Ekim'de çıkarıyor ama tarihi yanlışlıkla 1 Ağustos seçiyor.
  - Ali'nin Ağustos ve Eylül'de yayınlanmış, çalışılmış bütün vardiyaları "boş vardiya" oluyor.
  - Her biri için geriye dönük bir "coverage_alert" kaydı açılıyor. Kimin hangi geçmiş vardiyada çalıştığı kayboluyor.
  - Restore bu atamaları geri getirmiyor.
- **Neden oluyor:**
  - `terminate_employee_service` yalnız geleceği sınırlıyor: "5 dakikadan ileri olamaz" (`supabase/migrations/20260930130000_employees_writes_ask_the_core.sql:673`).
  - Boşaltma sorgusu `başlangıç >= etkili an` diyor ve alt sınırı yok (`:767`).
  - `schedule_published_shifts` üzerinde geçmiş hafta koruması yapan bir tetik yok.
  - Test bu davranışı kilitliyor: `supabase/tests/employee_termination_offboarding.test.sql:83-117`, 2026-09-01 tarihli (bugünden önce) bir vardiyanın açılmasını bekliyor.
- **Kanıt:** kod satırları yukarıda. `pg_trigger`: yayınlanmış vardiyada yalnız `check_time_source`, `zz_availability_assignment` ve `weekly_exchange_shift_terms_changed` var; hiçbiri geçmiş haftayı korumuyor. Senaryo yazma gerektirdiği için koşturulmadı (görev SELECT ile sınırlı).
- **Etkisi:** yalnız owner ve admin yapabiliyor, ama sonuç kalıcı veri kaybı. Geçmiş hafta kilidi (KARARLAR Schedule) ve P09 aşılıyor. Dışa aktarma ve takvim geçmişi bozuluyor.
- **BL eşleme:** **YENİ.** BL-388 aynı sorguyla ilgili ama yalnız saat dilimi kaymasını yazıyor. Geriye tarih kuralı bir ürün kararı gerektiriyor; iki seçenek görüyorum:
  - (a) Etkili an en erken bugünün başı olsun.
  - (b) Geçmiş tarih kaydedilsin, ama vardiya boşaltma hiçbir zaman bugünden önceye uzanmasın.
- **İşaret:** leave: medium / do: moderate.

### D1 — Arşivle / geri al, kaydın o anki durumuna bakmıyor (Düşük)
- **Ekranda nerede:** Employees → Archive → kişi → "Restore employee" (yeniden işe alım, erişimsiz). Arka planda `PATCH .../archive`.
- **Örnek:**
  - Admin Zeynep arşiv listesini açık bırakıyor. Bu arada owner Ali'yi erişimiyle birlikte geri alıyor.
  - Zeynep eski ekranda "Restore for rehire"a basıyor. Ali'nin kaydı hesabından kopuyor (`user_id = null`), ama üyeliği aktif kalıyor.
  - Ali giriş yapınca Employee Hub'da kaydını bulamıyor. Yeni bir davet de "already a member" hatasıyla düşüyor.
  - Ters yönde de aynı sorun var: arşivli ya da işten çıkarılmış birini yeniden "arşivlemek" `archived_at` değerini bugüne çekiyor; işten çıkarmanın etkili tarihi kayboluyor.
- **Neden oluyor:** `set_employee_archived_service`, kaydı `archived_at` koşulu olmadan kilitliyor ve güncelliyor (`20260930130000_employees_writes_ask_the_core.sql:548`, `:602-603`).
- **BL eşleme:** **YENİ.**
- **İşaret:** leave: low / do: safe. Düzeltme: arşivlerken `archived_at is null`, geri alırken `is not null` şartı aranmalı.

### D2 — Admin olarak davet edilmiş ama daveti kabul etmemiş kişi, rütbe kontrolünde "çalışan" sayılıyor (Düşük)
- **Ekranda nerede:** Employees → davetli kişi → çekmece (Profile, Employment, lokasyon satırındaki "Remove").
- **Örnek:**
  - Owner, Kadıköy'de çalışacak Selin'i admin olarak davet ediyor. Selin daha kabul etmedi.
  - Kadıköy müdürü Ayşe, Selin'in kaydında ad, iş, "excluded from schedule" ve not alanlarını değiştirebiliyor; onu Kadıköy'den çıkarabiliyor.
  - Ayşe daveti iptal edemiyor, yeniden gönderemiyor ve bağlantısını kopyalayamıyor; bu üç yol ayrıca korunuyor.
- **Neden oluyor:** `app_private.authz_check`, üyeliği olmayan kişiyi rütbe hesabında `employee` sayıyor. Kodun kendi notu da bunu söylüyor: "ponytail: somebody without a membership yet ranks as an employee; use the invitation's role if a manager ever invites into a higher one" (`supabase/migrations/20261007010000_availability_writes_ask_the_core.sql:139`). Oysa admin daveti bugün de var.
- **Kanıt:** yerel DB'de bekleyen admin ya da müdür daveti 0 tane; probe kurulamadı. Bulgu koddan; ayrıca 5. bölümde de anılıyor.
- **BL eşleme:** **YENİ.**
- **İşaret:** leave: low / do: risky (yetki çekirdeği).

### D3 — Çekmecenin özel bilgi ve davet bölümü, yetki çekirdeği yerine izin listesine bakıyor (Düşük)
- **Ekranda nerede:** Employees → kişi → çekmece → Profile (telefon, adres, doğum tarihi, acil durum kişisi) ve Access (davet ayrıntısı).
- **Ne görüldü:** `get_employee_detail_service` iki şeyi satır içinde soruyor (`20261003010000_catalog_sorted_by_name.sql:357-358`):
  - `reads_private := owner or 'employees.private.read' = any(permissions)`
  - `reads_access := owner or 'employee_access.read' = any(permissions)`
- Bu kontrollerde ne rütbe ne kapsam var. CLAUDE.md §9 satır içi yetkiyi yeni kodda yasaklıyor; bu kod eski.
- **Örnek:** owner, "Shift Lead" adlı müdür sınıfı bir role "Private information" okuma izni veriyor (Settings → Roles bunu yasaklamıyor). O roldeki Ayşe, aynı lokasyondaki eş müdür Hande'nin ve owner'ın ev adresini ve doğum tarihini görüyor.
- **Kanıt:** yerel DB'de `employees.private.read` iznini yalnız owner ve admin rolleri taşıyor (her biri 425 satır). Durum bugün oluşmuyor; Settings izin veriyor.
- **BL eşleme:** **YENİ.** Kural sorusu da taşıyor: özel bilgide eş rütbe görünürlüğü ne olmalı?
- **İşaret:** leave: low / do: moderate.

### D4 — Davet bağlantısı, iptal ve yeniden deneme: "yok" ile "yetkin yok" cevapları farklı (Düşük)
- **Ekranda nerede:** Employees → davetli kişi → Access → "Copy link" / "Revoke invitation" / "Resend".
- **Ne görüldü:**
  - Bekleyen davet yoksa cevap P0002 ("bulunamadı").
  - Müdürün veremeyeceği rolde bir davet varsa cevap 42501 `authz.rank`.
  - Kaynak: `20260930140000_invitations_ask_the_core.sql:222-228`. İptal ve yeniden deneme aynı sırayı izliyor.
- **Örnek:** Ayşe, Selin'in bağlantısını istiyor. "Not allowed" görürse Selin'e üst rütbeden bir davet gittiğini anlıyor.
- **BL eşleme:** BL-401, **geçerli** (2026-10-06, `31649359`). Ek bilgi: aynı fark iptal ve yeniden deneme yollarında da var.
- **İşaret:** leave: low / do: safe.

### D5 — Workspace profil fotoğrafı yolu ölü: okunuyor ve siliniyor, ama hiçbir yer yazmıyor (Düşük)
- **Ekranda nerede:** Employees → kişi → çekmece → Access → "Profile photo" → "Remove photo".
- **Ne görüldü:**
  - `employee_private_profiles.avatar_object_path` alanına yazan bir fonksiyon ya da API yolu yok. Yalnız okuyan ve silen var.
  - Yerel DB'de 1.861 satırın 0'ında fotoğraf var.
  - Okuma tarafında yol doğrulaması da eksik: `get_employee_avatar_path_service`, yolun o workspace ve kişiye ait olduğuna bakmıyor. Kendi fotoğrafını okuyan ikiz fonksiyon bakıyor. Tablo kısıtı (CHECK) yalnız "uuid/uuid/uuid.jpg" biçimini istiyor.
  - Bugün sömürülemez, çünkü yazan yok. Ama ileride bir yazma yolu eklenirse, servis anahtarı başka workspace'in dosyasını imzalayabilir ya da silebilir.
- **Etkisi:** "Remove photo" hep kapalı. BL-473'ün kök nedeni bu; düğme ve metinler ölü bir özelliği anlatıyor (CLAUDE.md §9: ikiz ya da ölü kod kalmaz).
- **BL eşleme:** **YENİ.** BL-408, BL-472 ve BL-473 aynı kutuyu anlatıyor.
- **İşaret:** leave: low / do: moderate. Seçenekler: silmek, ya da yazma yolu eklenecekse aynı işte yol doğrulaması.

### Öneri (zevk notu, bulgu sayılmaz)
- `apps/api/src/employees/employee-directory-service.ts:209`: yorum "the rest of the file moves with BL-134" diyor. BL-134 kapandı ve dosyanın tamamı zaten `rpcFailure`'da. Bayat yorum.
- Arşivlemek bekleyen daveti iptal etmiyor, işten çıkarmak ediyor. "Restore for rehire" sonrası 7 günlük eski bağlantı yeniden çalışabilir.
- Erişim kaldırma, hesabı bağlı olmayan kişide bekleyen daveti iptal etmeden dönüyor.

## 2. Temiz çıkan kontroller (kanıtıyla)
- **Grant'lar:**
  - 24 Employees tablosunun hepsinde RLS açık.
  - `authenticated` için yazma izni yalnız kişinin kendi `user_profiles`, `user_preferences` ve `user_workspace_preferences` satırlarında var (politika `user_id = auth.uid()`).
  - Okuma izinleri: `workspace_memberships` (`rls_can(...,'membership.read')`), `workspace_roles` ve `employee_onboarding_settings`.
  - `employee_invitations`, `employee_invitation_delivery_secrets`, `employee_private_profiles` ve `employee_create_commands` için tarayıcıya izin de politika da yok.
  - `membership_location_scopes` görünümü `security_invoker=true` ve tarayıcıya grant'ı yok.
- **Fonksiyonlar:** Employees, davet, ad, onboarding ve avatar ailesindeki 73 `public` fonksiyonun hiçbiri `authenticated` ya da `anon` tarafından çalıştırılamıyor. `employee_personal_tasks_service` dışındakiler SECURITY DEFINER; hepsinin arama yolu boş.
- **Çekirdek:** listedeki 26 servisin her biri yetkiyi ilk satırda `app_private.authorize` / `authz_check` / `scope_set` ile soruyor. Hepsi `authorization_coverage.test.sql`'de bir eyleme bağlı ve dosya `ci-green.txt:9`'da. Rotalarda `permissions.includes` yok; hepsi `resolveActor` + servis.
- **M2:**
  - Liste satır satır `employee.list` ile süzülüyor.
  - Müdür, lokasyonunda çalışan herkesi görüyor; lokasyonsuz kişiyi görmüyor.
  - Çok lokasyonlu kişinin bütün lokasyon adları görünüyor (KARARLAR 2026-10-01, BL-417).
  - Lokasyondan çıkarmada hedef lokasyonun müdürün kapsamında olması şart.
  - Ortak kaydın düzenlenmesi "herhangi bir ortak lokasyon" kuralıyla yapılıyor; bu bilinçli bir tasarım (Roles açıklaması: "One shared location permits changes to the common record").
- **Bilinmeyen ve kapsam dışı aynı cevabı alıyor:** owner, başka workspace'in kişisi için de rastgele bir uuid için de `read`, `save`, `terminate`, `invite` ve `decide_preferred_name` eylemlerinde `out_of_scope` alıyor. Bilinmeyen ad talebi id'si ve çalışmadığı lokasyon da `out_of_scope`.
- **Rütbe (P07, BL-270 kapandı):** ölçüm 1. bölümün özetinde.
  - Admin kendi kaydında yalnız `save` ve `invite` hakkına sahip (kullanıcı kararı 2A).
  - `make_admin` yalnız owner'da.
  - Rol değişikliğinde yeni rol, işlemi yapanın rütbesinden kesin düşük olmalı (`authorize_role_grant`).
  - Resmî ad onayı `onboarding.legal_name` ile korunuyor: org kapsamı, müdüre kapalı, kendine yok.
- **Davet:**
  - Token 64 hex karakter. Veritabanında özeti (sha256) tutuluyor; 7 gün geçerli.
  - Kabul için e-posta eşleşmesi ve doğrulanmış e-posta gerekiyor. Arşivli kayda kabul yok; zaten üye olan reddediliyor.
  - Bağlantı kopyalama, yeniden deneme, iptal, gizli token saklama ve teslim işaretleme davetteki rolü yeniden soruyor (`can_invite_with_role`).
  - Önizleme e-postayı maskeliyor; token istek gövdesinde gidiyor, adreste değil.
  - Davet e-postasındaki bağlantı HTML'den kaçırılıyor (escape). Sağlayıcı hata metni ekrana gitmiyor.
- **Hata metni ve log:** servisler `rpcFailure`'dan geçiyor; davet hataları sabit kodlara çevriliyor. Log yalnız hata nesnesini yazıyor; e-posta ya da telefon yok. `Authorization` başlığı log'dan çıkarılıyor.
- **Web:**
  - Düğmeler sunucunun döndürdüğü `allowed` alanına ve `can()`'e bağlı.
  - `dangerouslySetInnerHTML` yok. `localStorage` yalnız sütun tercihini tutuyor.
  - Rotalar `PermissionRoute`'ta; bu BL-176'nın eski borcu.
- **Canlı kanal:** Employees için yayın ya da realtime kanalı yok.
- **Yarış:**
  - Kayıt revizyon (sürüm) kontrolüyle yapılıyor (40001).
  - İşten çıkarma workspace kilidi, satır kilidi ve tekrar anahtarıyla (idempotency) korunuyor; aynı anahtarla farklı içerik reddediliyor.
  - Kişi oluşturma komutu advisory kilit ve parmak iziyle korunuyor.

## 3. Sınırda
- **Onboarding ve davet kabulü:** `AcceptInvitationPage`, `EmployeeOnboardingPage`, `onboarding-*`. Resmî ad onayı doğru (O1 bunun drawer tarafındaki açığı). Davet listesi, kişinin askıya alınmış üyeliği olan workspace'teki bekleyen daveti göstermiyor. Yeniden işe alınan kişi daveti ilk ekranda görmez, ama token ile kabul edebilir (P10 sorusu).
- **SSN kalıntısı:** `PUT /v1/me/onboarding/ssn` 410 dönüyor; `employee_sensitive_identifiers` tablosu boş (0 satır) ve RLS'li. Bilinen madde: BL-382.
- **Documents sekmesi ve belge servisleri:** BL-276 ailesi; bu turda okumadım.
- **Settings → Roles:** `workspace_roles` politikası eski kapıyı kullanıyor (`workspace_has_permission` → `service_actor_has_permission(auth.uid())`); BL-276 ailesi. Müdür sınıfı role özel bilgi izni verilebiliyor (D3'ün kaynağı).

## 4. Kanıtlanamayan şüpheler
- **D2'nin canlı hâli:** yerelde bekleyen admin ya da müdür daveti yok; müdürün böyle bir kayıtta neler yapabildiği SELECT ile kurulamadı. Bulgu kod okumasına dayanıyor.
- **O2 senaryosu:** geçmiş tarihli işten çıkarma yazma gerektirdiği için koşturulmadı. Sorgu ve test birlikte okundu.
- **Internal note görünürlüğü (karar sorusu):** `internal_note`, kişiyi okuyabilen herkese dönüyor. Kadıköy müdürü, owner'ın eş müdür Hande hakkında yazdığı notu okuyabiliyor. M2 "kişiyi bütün olarak görür" diyor; bekleyen belge ve izinde olduğu gibi bir istisna gerekiyor mu, KARARLAR'da yazmıyor.
- **Eş zamanlı rol değişikliği:** rol yazımında revizyon kontrolü yok; son yazan kazanıyor. Zararı ölçmedim.

## Kanıt listesi (komut + sonuç)
- `git -C newfork-wt/ekran-03 rev-parse HEAD` → `31649359…` (görevdeki `origin/main`).
- Yerel DB `supabase_migrations.schema_migrations` → 427 migration, en sonuncusu `20261007030000`. Repoda da 427, son dosya aynı.
- `pg_proc` + `has_function_privilege`: 73 fonksiyonda `authenticated` / `anon` çalıştırma izni `f`; SECURITY DEFINER olanların hepsinde `search_path=""`.
- `pg_class.relrowsecurity` + `role_table_grants` + `pg_policies`: 2. bölümdeki tablo listesi.
- `app_private.authz_actions` `employee.*` satırları:
  - `terminate`, `archive`, `remove_access`: cross, `employees.archive` / `manage`, `no_self`, `rank_below`.
  - `save`: `rank_below`.
  - `make_admin`: `owner_only`.
  - `onboarding.legal_name`: org, `no_self`, `rank_below`.
- `authz_scope_rules` M2: person/cross → `none`, person/write → `any`, org/write → `none`.
- Rütbe probe'u (eş rütbe ve kendi kaydı) → 1. bölüm özetinde. Müdür kendi kaydında da her eylemde `rank` alıyor; kapalı workspace'te `workspace_closed`.
- Müdür → çalışan probe'u, 2.329 çift: `archive`, `terminate` ve `remove_access` → `out_of_scope`; `save`, `change_role`, `invite`, `decide_preferred_name` ve `read` → izin var; `onboarding.legal_name` → `out_of_scope`.
- O1 örnek çiftleri: workspace `9bdbdedc…` müdür `602868ae…` → Emre `c3a41325…`; workspace `72318835…` müdür `a09a2efe…` → Deniz `532998fa…`. `save` null, `legal_name` `out_of_scope`.
- Owner probe'u: başka workspace'in kişisi ve rastgele uuid → beş eylemde de `out_of_scope`.
- `pg_trigger`: `employee_profiles` ve `schedule_published_shifts` üzerinde ad kilidi ya da geçmiş hafta koruması yok.
- Bekleyen admin ya da müdür daveti (`employee_invitations` + `workspace_roles`) → 0 satır.
- `employee_private_profiles.avatar_object_path` → 0 / 1.861 dolu. Yazan fonksiyon yok; yalnız `get_`, `get_own_` ve `remove_` okuyor.
- `workspace_role_permissions` `employees.private.read` → owner 425, admin 425; müdür sınıfında 0.
- `authorization_coverage.test.sql`: 26 servisin hepsi sınıflı. `ci-green.txt` coverage, matrix, `invitations_on_the_core` ve `employee_termination_offboarding` dosyalarını içeriyor.
- Okunan dosyalar:
  - `apps/api/src/employees/employee-directory-routes.ts`, `-service.ts`, `employee-create-service.ts`, `invitation-service.ts`
  - `apps/api/src/app.ts:195-760`, `auth/workspace-context.ts:51-79`, `email/resend-email.ts`, `onboarding-routes.ts`
  - `apps/web/src/employees/EmployeeDrawer.tsx` (seçili satırlar)
  - `docs/plan/KARARLAR.md` (Employees, M2, resmî ad), `BACKLOG.md` (eşleme)
  - 30 fonksiyon gövdesi `pg_get_functiondef` ile.
- Skill'ler: `supabase-postgres-best-practices` ve `verification-before-completion` açıldı. `security-review`'ın her bulgu için ayrı yanlış alarm ajanı adımını uygulamadım; bulguları SELECT probe'u ya da satır numaralı kodla doğruladım, kanıtlayamadıklarımı 4. bölümde tuttum.
- Yazılan dosyalar:
  - Repoya ve rol hafızasına dosya yazılmadı.
  - Repo dışına iki geçici dosya yazıldı. psql yardımcısı: `C:\Users\TheWe\AppData\Local\Temp\q.sh` (docker exec ile salt okuma).
  - Fonksiyon gövdeleri oturum karalama klasörüne (`scratchpad\fn\`) yazıldı.
  - Yerel DB'de yalnız SELECT koşuldu; yazma ve rol denemesi yapılmadı.

## Hafıza notu (dosyaya yazılmadı)
- **Ekran kilidi sunucuda var mı:** çekmecede "Locked after …" diye kilitli görünen alanı, aynı uçtan API ile yazmayı dene. Kilit yalnız web'deyse bulgu. Örnek: Employees'te ad ve soyad (`save_employee_service`) kilitsiz, ama resmî ad onayı `onboarding.legal_name` ile dar tutuluyor (EKRAN-03 O1).
- **Geriye tarihli komutlar:** "etkili tarih" alan her komutta alt sınır var mı ve sonuç geçmiş haftanın yayınlanmış verisine dokunuyor mu, bak. İlgili test geçmiş tarihi bugün kabul ediyorsa bu davranışı kilitliyor demektir (EKRAN-03 O2, `terminate_employee_service`).
- **Çift yönlü komutun ön koşulu:** arşivle / geri al gibi tek fonksiyonlu ileri-geri komut, kaydın şu anki durumunu şart koşuyor mu? Bayat ekrandan gelen ters çağrı aktif kaydı bozabilir (EKRAN-03 D1).
