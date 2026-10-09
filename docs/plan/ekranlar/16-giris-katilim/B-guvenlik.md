# Ekran 16 — Giriş ve katılım: güvenlik keşfi (B)

Tarih: 2026-10-07 · Kod: `newfork-wt/ekran-16` @ `fb9ced47` (origin/main) · Yerel DB: salt okunur sorgular, hepsi `begin read only … rollback` · Canlı ortama dokunulmadı, ağır koşu yapılmadı.

## DENETİM SONUCU

**Kritik ya da yüksek bulgu yok.** Başka bir workspace'in verisine giden yol, başkasının davetini kabul etmenin yolu ya da hesap ele geçirme yolu bulunmadı. Davet bağlantısı tahmin edilemez. Kabul için davetin gittiği ve onaylanmış e-posta adresiyle giriş gerekiyor; bu iki yolda da (bağlantı ve Workspaces ekranındaki Join) zorunlu ve test edilmiş. Parola sıfırlama bağlantısı adres çubuğunun `#` parçasında taşınıyor ve ancak "Save password"a basınca harcanıyor; cevap her zaman aynı sürede dönüyor. Çıkışta tarayıcıdaki önbellek tamamen siliniyor. İşle ilgisiz ciddi bir açık görülmedi.

En önemli üç konu:
1. **Kurulumu bitmemiş (taslak) workspace'ten davet sunucuda engellenmiyor** (BL-419). Mert'in 2026-10-01 kararı ("kurulum bitmeden davet yok") ne API'de ne veritabanında uygulanıyor. Orta.
2. **Davet kabulü workspace'in durumuna bakmıyor.** Askıdaki, kapanan ya da taslak workspace'in daveti Workspaces ekranındaki Join ile kabul edilebiliyor. Kişi hiçbir şey açamayan bir üyelikle kalıyor ve ekranda "bu davet başka bir adrese ait" gibi yanlış bir cümle görüyor. Düşük ama gerçek ekran yolu var.
3. **"Kendi işletmesini açma" kuralı (KARARLAR) iki yerden delinebiliyor.** Daveti kabul edip kurulumu bitirmemiş çalışan kendi workspace'ini açabiliyor. Başka bir yerde owner olan kişi de çalışan olduğu workspace'e rağmen yeni workspace açabiliyor. Düşük; kuralın okunuşu için Mert'e soru gerekebilir.

## Ekranın sınırı

- **İçeride:** Sign in ve hesap oluşturma (`/sign-in`), Forgot password, Reset password, Account recovery (`/account-recovery`; silinmiş hesabı 14 gün içinde geri getirme), davet bağlantısı (`/accept-invite`, `/invite/accept`) ve API'deki önizleme / kabul / ret / bekleyen davet uçları, Workspaces hub (`/workspaces`), `/workspaces/status`, girişten sonra nereye inileceği (`resolveLanding.ts`, `ProtectedRoute.tsx`, `AuthContext.tsx`, `tenant-query-cache.ts`), owner kurulumu (`/onboarding`, workspace oluşturma, taslak workspace, Discard), çalışan kurulumu (`/welcome/...`, beklemedeki üyelik), çıkış.
- **Dışarıda:** Account sayfaları (Profile, Security, Workspaces yönetimi), Employees'te davet gönderme çekmecesi, Documents, Billing.
- **Sınırda:** davet gönderme, yeniden gönderme ve bağlantı kopyalama uçları (Employees ile ortak servis), workspace kapatma ve Discard (Account → Workspaces ile ortak uç), kurulumda belge yükleme, deneme süresi (Billing).

## Bulgular

### B1 — Kurulumu bitmemiş workspace'ten davet gönderilebiliyor · **Orta**
- **Ekranda nerede:** Ekranda yol kapalı (owner kurulum bitmeden Employees'e giremiyor). Fark doğrudan API çağrısında: `POST /v1/workspaces/:id/employees/:employeeId/invitations`. Davetin vardığı yer: davet bağlantısı ve Workspaces → Join.
- **Örnek:** Mert "Beyoğlu"nun kurulumunu 2. adımda bırakır. Kurulumda eklediği Ali'ye API'yi doğrudan çağırarak davet gönderir. Ali Workspaces ekranında daveti görür ve Join'e basar. Ali, açılmamış bir workspace'te hiçbir işe yaramayan bir üyelikle kalır. Mert sonra kurulumu "Discard" ile parola sormadan silebilir; çünkü sunucu "bitmemiş kurulumda kaybedilecek kimse yok" varsayıyor (BL-284).
- **Kanıt:**
  - `docs/plan/KARARLAR.md:250` kuralı: "kurulumu bitmemiş (taslak) workspace'ten davet gönderilemez; … API de reddeder".
  - `apps/api/src/app.ts:543-572` rotada kurulum kontrolü yok.
  - `public.prepare_employee_invitation_service` (son tanım `20261001000000_a_manager_manages_where_they_are_assigned.sql`; yerel DB'den `pg_get_functiondef` ile okundu) kurulum ya da workspace durumuna hiç bakmıyor.
  - Yetki çekirdeği taslağı owner'a açık sayıyor: `app_private.workspace_open_to_actor` taslakta aktif owner'a `true` döndürüyor (`20260921190000_draft_workspace_opens_for_its_owner.sql`).
  - Yerelde 143 taslak workspace var (`select lifecycle_status, status, count(*) from workspaces join workspace_onboarding …`).
- **BACKLOG:** BL-419 (tazelik 2026-10-06'da "geçerli"); Discard zinciri BL-284.
- **İşaret:** `leave: medium / do: safe`
- **Önerilen düzeltme:** Kontrol veritabanında olsun, rotada değil (anayasa §2.A.1). Davet üretme ve kabul fonksiyonları kurulumu bitmemiş ya da açık olmayan workspace'i reddetsin; pgTAP ile kilitlensin.

### B2 — Davet kabulü workspace'in durumuna bakmıyor; hata cümlesi yanlış · **Düşük**
- **Ekranda nerede:** Workspaces (`/workspaces`) → davet satırı → Join. Davet bağlantısı ekranı ise doğru davranıyor ("isn't open right now").
- **Örnek:** "Kadıköy" askıya alınır. Ayşe'ye daha önce gönderilmiş ve süresi dolmamış davet Workspaces listesinde Join düğmesiyle durmaya devam eder. Ayşe Join'e basar. Veritabanı üyeliği "beklemede" olarak yazar. Hemen ardından API'nin ikinci çağrısı "workspace kapalı" diye reddeder. Ayşe ekranda "This invitation is for a different account" görür, oysa üyeliği yazılmıştır. Ayrıca bu bekleyen davet, Ayşe'nin kendi işletmesini açmasını "önce daveti cevapla" diye engeller.
- **Kanıt:**
  - `app_private.accept_employee_invitation_for_user` (`20261006000000_documents_and_onboarding_ask_the_core.sql`) workspace durumuna bakmadan üyelik ekliyor.
  - `public.list_pending_employee_invitations_for_account_service` de durum süzmüyor.
  - Önizleme ise süzüyor: `preview_employee_invitation_service` → `workspace_unavailable` (`20260921120000_invitation_preview_states.sql`).
  - Kabulden sonra API `initialize_employee_onboarding_service(target_user_id)`'yi (tek argümanlı ikiz) yeniden çağırıyor (`apps/api/src/employees/invitation-service.ts:238`, `:300-311`). Bu çağrı en eski üyeliğin workspace'ine yetki soruyor ve kapalı workspace'te `42501 authz.workspace_closed` alıyor.
  - `app.ts:223-229` her 42501'i (`authz.not_active` hariç) "invitation_email_mismatch" olarak çeviriyor.
- **BACKLOG:** YENİ (B1 ile aynı işte kapatılabilir).
- **İşaret:** `leave: low / do: safe`
- **Önerilen düzeltme:** Kabul ve bekleyen davet listesi önizlemeyle aynı "workspace açık mı" şartını uygulasın; API'deki gereksiz ikinci başlatma çağrısı kaldırılsın (kabul fonksiyonu bunu zaten kendi içinde yapıyor).

### B3 — "Kendi işletmesini açma" kuralı iki yerden delinebiliyor · **Düşük** (karar sorusu)
- **Ekranda nerede:** Workspaces hub → "Create your own business" → `/onboarding` (sunucuda `POST /v1/account/workspaces`).
- **Örnek 1:** Ali Kadıköy'ün davetini kabul eder; çalışan kurulumunu bitirmeden durumu "beklemede"dir, aktif değildir. Bu sırada "Create" ile kendi işletmesini açabilir. Kurulumu bitirince aynı hesapta hem çalışan hem owner olur.
- **Örnek 2:** Mert Beyoğlu'nun owner'ı ve Kadıköy'de çalışan; yine de yeni bir workspace açabilir.
- **Kanıt:**
  - `docs/plan/KARARLAR.md:235`: "Owner olmadığı bir workspace'te aktif üyeliği bulunan hesap kendi işletmesini açamaz; bunun için ayrı hesap gerekir."
  - `public.create_owner_workspace_service` (`20260917100000_owner_workspace_pending_invitation_guard.sql`) yalnız `status = 'active'` üyeliğe bakıyor ve hesap herhangi bir yerde owner ise hiç engellemiyor.
  - Test bu yorumu kilitlemiş: `supabase/tests/account_workspace_controls.test.sql:41,175` ("existing owner can create").
- **BACKLOG:** YENİ.
- **İşaret:** `leave: low / do: safe`
- **Önerilen düzeltme:** Önce Mert'e kuralın okunuşu sorulsun ("beklemedeki üyelik sayılır mı", "başka yerde owner olan da ayrı hesap mı açmalı"); sonra fonksiyon ve test karara göre güncellensin.

### B4 — Davet uçlarında "hayır" tek biçimde değil · **Düşük**
- **Ekranda nerede:** Davet bağlantısı ekranı ve Workspaces → Join / Decline.
- **Örnek:** Can, başkasına ait bir davet kimliğiyle Join isterse 403 "different account" alır; var olmayan bir kimlikle isterse 404 alır. Anayasa "bilinmeyen ve kapsam dışı hedef aynı cevabı alır" diyor. Kimlikler tahmin edilemediği için pratik sızıntı yok; sapma kural düzeyinde.
- **Kanıt:**
  - E-posta uyuşmazlığı veritabanında `authz.*` ipucu olmadan 42501 olarak yükseltiliyor (`accept_employee_invitation_for_user`, `decline_employee_invitation_service`).
  - `create_owner_workspace_service` ("pending invitation must be resolved first", "workspace owner access required") ve `app_private.apply_owner_onboarding_update` ("owner access required") de ipucusuz 42501 veriyor.
  - API tarafında `app.ts:207-258` `invitationFailure` her 42501'i tek cümleye çeviriyor (bkz. B2).
  - Sayaç "ipucusuz ret ≤100" bunları tolere ediyor (`supabase/tests/authz_catalog.test.sql:100-104`).
- **BACKLOG:** YENİ (BL-276 ailesine yakın).
- **İşaret:** `leave: low / do: safe`
- **Önerilen düzeltme:** Uyuşmazlık `authz.out_of_scope` ipucuyla yükseltilsin ve "bulunamadı" ile aynı cevabı alsın; API yalnız kendi tanıdığı ipuçlarını eşlesin, gerisini genel cevaba bıraksın.

### B5 — Davet ve hesap geri getirme bağlantısı token'ı adres çubuğunda taşıyor · **Düşük** (BACKLOG'da medium)
- **Ekranda nerede:** E-postadaki "Accept invitation" bağlantısı (`/invite/accept?token=…`) ve hesap geri getirme bağlantısı (`/account-recovery?token=…`).
- **Örnek:** Ali daveti ortak tablette açar. Bağlantı tarayıcı geçmişinde ve Vercel'in sayfa isteği kaydında kalabilir. Sonraki kişi geçmişten bağlantıyı açarsa workspace adını ve gizlenmiş e-postayı ("al***@…") görür. Kabul edemez, çünkü kabul Ali'nin onaylanmış e-postasıyla giriş istiyor. Gerçek etki bu yüzden sınırlı.
- **Kanıt:**
  - Bağlantıyı üreten yerler: `invitation-service.ts:108,173,224`, `resolveLanding.ts:105-109`.
  - `AcceptInvitationPage.tsx:33` token'ı sorgu dizesinden okuyor ve adresten silmiyor.
  - Parola sıfırlama ise doğru biçimde `#` kullanıp adresi temizliyor (`ResetPasswordPage.tsx:20-33`).
  - Önizleme ucu token'ı gövdede alıyor; API'nin istek kaydına düşmüyor (`app.ts:748-750`).
- **BACKLOG:** BL-351 (ayrıca BL-336: hesap açarken e-posta onayı sırasında token'ın kaybolması).
- **İşaret:** `leave: low / do: moderate`
- **Önerilen düzeltme:** BL-351'deki plan uygulansın: bağlantılar `#token=` ile üretilsin, sayfa okuyup adresten silsin. BL-336 ile birlikte yapılsın (token'ı `sessionStorage`'da taşımak).

### B6 — Ölü davet token'ları veritabanında düz metin duruyor · **Düşük**
- **Örnek:** Veritabanını okuyabilen biri (yedek, servis anahtarı) 2.070 kabul edilmiş ve 7 süresi dolmuş davetin ham bağlantısını görebilir. Bu bağlantılar artık hiçbir şey açmıyor; yalnız bekleyen 14 davetin bağlantısı geçerli. Bu da "bağlantıyı kopyala" özelliği için bilerek saklanıyor.
- **Kanıt (SELECT, yerel DB):**
  - `employee_create_commands.invitation_token` dolu satırların hepsi `accepted` durumda: 2.070, bunların 861'inin süresi de dolmuş.
  - `employee_invitation_delivery_secrets`: 21 satır, hepsi `pending`; 7'sinin süresi dolmuş.
  - Her iki tabloda RLS açık, `anon` / `authenticated` yetkisi yok. Silme tetikleyicisi yalnız durum değişince çalışıyor (`employee_invitation_delivery_secret_cleanup`). Süre dolumu durumu değiştirmediği için sır kalıyor.
- **BACKLOG:** BL-352 (create_commands); süresi dolan sır için YENİ ek.
- **İşaret:** `leave: low / do: safe`
- **Önerilen düzeltme:** Davet beklemeden çıkınca (kabul, ret, iptal) ve süre dolunca her iki tablodaki ham token silinsin; pgTAP ile kilitlensin.

### B7 — Anayasa borçları bu ekran grubunda · **Düşük**
- **Örnek:** Yeni gelen bir oturum, owner kurulumunu değiştirmek için iki aynı adlı fonksiyondan revizyon kontrolü olmayanı seçebilir. Sızıntı yok; ikiz ve kural dışı kapı kalıntısı var.
- **Kanıt (yerel DB `pg_proc` ve kod):**
  - (a) İkiz fonksiyonlar: `update_owner_onboarding_service` 5 argümanlı (revizyon kontrolü yok) ve 9 argümanlı iki sürüm; API yalnız 9'lusunu çağırıyor (`workspace-account-service.ts:256-262`). `initialize_employee_onboarding_service` 1 ve 2 argümanlı iki sürüm.
  - (b) Sahte oturum köprüsü (`request.jwt.claim.sub` yazan): `create_owner_workspace_service`, `list_my_workspaces_service`, `request_workspace_closure_service`. Bunlar arkadaki `auth.uid()` okuyan eski `create_owner_workspace` ve `list_my_workspaces` fonksiyonlarını çağırıyor. Sayaç ≤13'te tolere ediyor.
  - (c) `app_private.apply_owner_onboarding_update` yetkiyi `membership.role = 'owner'` ile satır içinde soruyor, `authorize('workspace.setup')` çağırmıyor. Kapsam testi onu yine de `workspace.setup` diye sınıflıyor (`supabase/tests/authorization_coverage.test.sql`); test yalnız eşlemenin var olduğuna bakıyor.
  - (d) Owner kurulum rotalarında rotaya özel yetki kapısı: `resolveWorkspaceAuthorization({ permission: "workspace.manage" })` (`workspace-account-routes.ts:396-402`, `:482-488`, `:527-533`).
  - (e) Web'de `permissions.includes`: `auth/PermissionRoute.tsx:38,56`.
  - (f) Ölü RLS politikaları: `workspaces_insert_creator`, `workspaces_update_manager`, `workspace_onboarding_update_owner`. `authenticated` rolünde bu tablolara yalnız SELECT yetkisi olduğu için hiç çalışmıyorlar.
- **BACKLOG:** YENİ. (b) ve (c) katalog sayaçlarının kapsadığı aile.
- **İşaret:** `leave: low / do: moderate`
- **Önerilen düzeltme:** Ekran turunda 5 argümanlı ve 1 argümanlı ikizler silinip `retired_objects_stay_gone`'a eklensin; owner kurulumu `authorize('workspace.setup')` ile başlasın ve rotadaki kapı kalksın; ölü politikalar silinsin.

### B8 — Web'de güvenlik başlıkları yok (sayfanın başka sitede çerçeveye konması, Referer, CSP) · **Düşük**
- **Ekranda nerede:** Bütün giriş öncesi sayfalar (Sign in, davet, Reset password).
- **Örnek:** Kötü niyetli bir site, Sign in ya da davet sayfasını görünmez bir çerçevede açıp kullanıcıyı "Accept invitation" düğmesine bastırmaya çalışabilir. Kabul yine kişinin kendi hesabı ve kendi daveti için olur, kazanç küçük. Oturum anahtarı `localStorage`'da durduğu için ileride bir XSS açığı çıkarsa CSP olmaması etkiyi büyütür.
- **Kanıt:** `vercel.json`'da `headers` bölümü yok; `apps/web/index.html`'de referrer ya da CSP meta etiketi yok; API'de helmet benzeri bir katman yok (`apps/api/src/app.ts:364-424` yalnız CORS ve `Cache-Control` yazıyor).
- **BACKLOG:** YENİ.
- **İşaret:** `leave: low / do: safe`
- **Önerilen düzeltme:** `vercel.json`'a `X-Frame-Options: DENY` (ya da `frame-ancestors 'none'`), `Referrer-Policy: strict-origin-when-cross-origin` ve dar bir CSP eklensin.

## Sağlam bulunanlar

- **Davet token'ı üretimi:** iki rastgele UUID birleştiriliyor, ~244 bit rastgelelik, 64 karakter (`invitation-service.ts:87-90`). Tabloda yalnız SHA-256 özeti tutuluyor; `token_hash` uzunluğu bütün satırlarda 64 (SELECT). Süre 7 gün: en uzun `expires_at - created_at` = 7 gün 1 sn (SELECT).
- **Tek kullanımlık ve yarışa dayanıklı:** kabul satırı kilitleniyor (`for update`), `status = 'pending'` yeniden kontrol ediliyor, çalışan kaydı `user_id is null` şartıyla bağlanıyor (`accept_employee_invitation_for_user`).
- **Eski bağlantı ölüyor:** yeniden davet eskisini `revoked` yapıyor (`prepare_employee_invitation_service`); iptal ucu da aynı şeyi yapıyor; durum değişince ham token siliniyor (tetikleyici).
- **Rol istemciden ezilemiyor:** kabul yalnız token ya da davet kimliği alıyor; rol davet satırından geliyor. Davet ederken rol `can_invite_with_role` ile kontrol ediliyor (rütbe aşağı). Üyelik tetikleyicisi owner rolüyle katılımı reddediyor (`enforce_membership_role_change`). Testler: `supabase/tests/invitations_on_the_core.test.sql:50-57`.
- **Yanlış hesapla kabul yok:** `lower(auth e-postası) = davetin e-postası` (davetteki adres zaten küçük harfe çevrilmiş) ve `email_confirmed_at` zorunlu; hem bağlantı hem kimlik yolunda. Testler: `invitation_acceptance_needs_a_confirmed_email.test.sql:87-104` (başka hesap kimlikle kabul edemiyor: `:94`). Canlıda "Confirm email" açık (kullanıcı beyanı, BL-274 kapanışı).
- **Önizleme oturumsuz ne gösteriyor:** yalnız durum, workspace adı, gizlenmiş e-posta ve bitiş tarihi (`invitation-service.ts:66-85`, `:423-427`); token gövdede geliyor. Token tahmin edilemediği için deneme yanılmayla davet bulunamaz.
- **Beklemedeki üyelik ne yapabilir:** yalnız şu eylemler açık (`restricted_ok` olanlar): kendi müsaitliği, kendi belgeleri, tercih edilen ad talebi, kendi iletişim bilgisi, kendi bildirimleri, kendi kurulumu (SELECT `authz_actions`). Workspace bağlamı yalnız aktif üyeye dönüyor (`resolve_workspace_context_service`). Doğrudan RLS okuması da aktif üyelik istiyor (`app_private.is_workspace_member`).
- **Resmî ad ve kendini onaylama:** çalışan resmî adını değiştirince profil adımı `awaiting_review` oluyor ve aktivasyonu durduruyor (profil adımlarının hepsi `blocks_activation = true`; SELECT 2.109 satır). `onboarding.review` ve `onboarding.legal_name`'de `no_self` ve `rank_below` açık; kimse kendini onaylayamıyor.
- **Parola sıfırlama:** token `#` parçasında, Save'de harcanıyor, adres temizleniyor (`ResetPasswordPage.tsx:20-56`). Cevap her durumda 202 ve en az 1,5 sn; gönderim 1,2 sn'de kesiliyor (`password-reset.ts:37-38,79-87`). Sayaç veritabanında (`claim_password_reset_send_service`). Kayıt satırında e-posta yok. Kaydetmeden ayrılınca oturum siliniyor (`lib/supabase.ts:37-46,646-649`).
- **Hesap geri getirme:** token 32 bayt rastgele, yalnız özeti saklanıyor, tek kullanımlık (özet sıfırlanıyor, durum `restored`); yeniden gönderme oturumsuz ama sınırlı ve sabit sürede (`account-security-routes.ts:174-225`, `restore_account_deletion_by_token_service`).
- **`from` ile açık yönlendirme yok:** hedef adres çubuğundan değil sayfa geçmişi durumundan geliyor; ayrıca `/` ile başlamayan, `//` ile başlayan ya da başka bir siteye çıkan adres reddediliyor (`SignInPage.tsx:22-24,195-205`).
- **Oturum ve önbellek:** çıkışta `queryClient.clear()`, sekmenin workspace'i ve "oturum bitti" işareti siliniyor (`AuthContext.tsx:104-112,300-312`). Başka kullanıcıya geçişte önbellek temizleniyor (`:121-124`). Workspace değişince workspace'e bağlı sorgular siliniyor (`:131-136`); sorgu anahtarlarının hemen hepsi workspace kimliğini taşıyor (grep). Askıya alınan ya da çıkarılan üyenin açık oturumu bağlam alamıyor ve her istekte `not_active` alıyor.
- **İzinler:** bu gruptaki bütün `*_service` fonksiyonlarını yalnız `service_role` çalıştırabiliyor; `anon` hiçbir public fonksiyonu çalıştıramıyor ve `app_private` şemasına erişimi yok (SELECT). Hepsinde `search_path=''` var. Yeni servislerin hepsi `authorization_coverage.test.sql`'de sınıflanmış (davet kabulü `account.self`, önizleme ve geri getirme `exempt:token`).
- **CORS / CSRF:** kimlik doğrulama `Bearer` başlığıyla; izinli origin yalnız `APP_URL` ya da aynı host (`app.ts:138-162`).
- **Loglar:** `authorization` ve `cookie` başlıkları kayıttan çıkarılıyor; e-posta sağlayıcısının cevap gövdesi kayda geçmiyor (`resend-email.ts` son satır).

## Sınırda

- **Discard parolasız (BL-284):** `isUnfinishedSetup` yalnız "owner + aktif + kurulum bitmemiş"e bakıyor (`workspace-account-routes.ts:566-583`). B1 düzelmezse gerçek bir üyesi olan taslak parolasız silinebilir.
- **Deneme süresinin tekrarı (Billing, BL-059):** KARARLAR (`:283`) "daha önce trial kullanmış owner tekrar trial alamaz" diyor; `apply_owner_onboarding_update` her tamamlanan kurulumda koşulsuz 14 günlük deneme yazıyor.
- **Parola değişikliği doğrudan Supabase'den:** sıfırlama `updateUser({password})`'u doğrudan çağırıyor (`lib/supabase.ts:640`). Taze bir oturum aynı çağrıyla, API'nin "mevcut parola" kontrolünü atlayarak parolayı değiştirebilir; Supabase'in "secure password change" ayarı yalnız 24 saatten eski oturumda yeniden doğrulama istiyor. Account → Security turunda bakılmalı.
- **Müdür onboarding inceleme rotası workspace başlığını okumuyor:** `onboarding-routes.ts:170-176` bağlamı varsayılan workspace'ten çözüyor. Birden çok workspace'i olan müdür 404 alıyor (Employees; işlevsel).
- **Kurulumda belge yükleme:** derin incelenmedi (Documents ekranının işi).

## Kanıtlanamayanlar

- Canlı Supabase ayarları SQL ile okunamıyor: "Confirm email" açık (kullanıcı beyanı 2026-09-28), en kısa parola 8 (beyan 2026-09-30), secure password change ve giriş hız sınırları ölçülmedi.
- Parola sıfırlandıktan sonra Supabase'in diğer oturumları kapatıp kapatmadığı çalıştırılarak denenmedi.
- Vercel'in sayfa isteği kaydında sorgu dizesinin tutulup tutulmadığı ve `x-real-ip` başlığının dışarıdan sahtelenip sahtelenemeyeceği ölçülmedi.
- Çok sekmede çıkışın öteki sekmeye geçmesi Supabase kütüphanesinin davranışına dayanıyor; tarayıcıda denenmedi.
- B1 ve B2'nin canlı yolu çalıştırılmadı: görev salt okuma olduğu için yazma denemesi yapılmadı. Sonuçlar fonksiyon gövdelerinden ve SELECT sonuçlarından çıkarıldı.

## Kanıt komutları

- `git -C newfork-wt/ekran-16 log --oneline -1` → `fb9ced47`.
- `docker exec -i supabase_db_newfork-clean psql -X -At -U postgres` ile, hepsi `begin read only; … rollback;` içinde:
  - `pg_proc` + `has_function_privilege` (anon / authenticated / service_role) listesi: ilgili `*_service`'lerin hepsi yalnız service_role.
  - `pg_get_functiondef`: `preview/accept/decline/list_pending/prepare/store_secret/load_link/load_retry/revoke` davet fonksiyonları, `app_private.accept_employee_invitation_for_user`, `authorize/authz_check/actor/scope_set/rls_can/can_invite_with_role`, `workspace_open_to_actor`, `workspace_allows_interactive_access`, `create_owner_workspace(_service)`, `apply_owner_onboarding_update`, `reset_owner_onboarding_service`, `request_workspace_closure_service` (baş kısmı), `resolve_workspace_context_service`, `enforce_membership_role_change`, çalışan onboarding servisleri, `restore_account_deletion_by_token_service`.
  - `employee_invitations` durum ve uzunluk: `revoked 4 / pending 21 / accepted 2108`, `token_hash` hep 64 karakter.
  - `delivery_secrets`: 21 satır, hepsi pending, 7'sinin süresi dolmuş.
  - `employee_create_commands` ham token: 2.070 satır, hepsi kabul edilmiş.
  - En uzun davet süresi: 7 gün 1 sn.
  - Workspace × kurulum durumu: `active/complete 324`, `draft/incomplete 143`, `deleted/incomplete 1`.
  - `pg_policy` ve `role_table_grants` (davet, workspace ve kurulum tabloları).
  - `authz_actions` bayrakları (`onboarding.*`, `employee.invite`, `workspace.*`, `restricted_ok` olanlar).
- Kod okuma: `apps/api/src/app.ts`, `employees/invitation-service.ts`, `employees/onboarding-routes.ts`, `account/password-reset.ts`, `account/account-security-routes.ts`, `account/workspace-account-routes.ts`, `http-error.ts`, `email/resend-email.ts`; `apps/web/src/App.tsx`, `auth/*`, `lib/supabase.ts`, `views/SignInPage.tsx`, `views/ResetPasswordPage.tsx`, `account/AccountRecoveryPage.tsx`, `employees/AcceptInvitationPage.tsx`; `vercel.json`, `supabase/config.toml` [auth]; `supabase/tests/authz_catalog.test.sql`, `authorization_coverage.test.sql`, `invitation_acceptance_needs_a_confirmed_email.test.sql`, `invitations_on_the_core.test.sql`, `account_workspace_controls.test.sql`.
- Test, build, e2e ve `test:db` koşulmadı (görev gereği).

## Hafıza önerisi

- Davet kabulünde iki giriş var: bağlantı (token) ve Workspaces → Join (davet kimliği). Önizleme ekranının süzdüğü şeyi (workspace açık mı) Join yolu süzmüyor. Davetle ilgili her incelemede bekleyen davet listesi ve kimlikle kabul yolu ayrıca okunmalı.
- `invitationFailure` (`apps/api/src/app.ts`) bütün 42501'leri "başka hesap" cümlesine çeviriyor. Veritabanında davetle ilgili yeni bir ret eklenirse ekranda yanlış cümle çıkar; ret ipucunun API'deki eşlemesine bakılmalı.
