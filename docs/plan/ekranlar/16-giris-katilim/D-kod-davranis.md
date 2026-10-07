# Ekran 16 — Giriş ve katılım · D: kod ve davranış keşfi

| Tarih | Kod | Kim | Yöntem |
|---|---|---|---|
| 2026-10-07 | main `fb9ced47` (`newfork-wt/ekran-16`) | genel ajan (opus), salt okuma | Akışlar ekrandan veritabanına kadar okundu (web → `*-data.ts` → API rotası → `*_service` → SQL). Yerel veritabanında yalnız SELECT (biri `begin … rollback` içinde). API'ye 4 okuma isteği (davet önizlemesi ×2, oturumsuz `/v1/context`, `/v1/account/workspaces`). Test koşulmadı, dosya değiştirilmedi (bu rapor hariç). |

## Özet

1. **Karar:** Giriş ve katılımın iskeleti sağlam: davetin her durumu ayrı ekranda, parola sıfırlama güvenli, çalışan kurulumunda sıfırlama yok. Ama Mert'in "Katılım ve giriş akışı" kararlarından dördü kodda yok ya da tersine çalışıyor: girişte bekleyen davet ekranı ve "Not now" yok; favori yokken sistem tahmin ediyor; "Create" düğmesinin görünürlüğü kurala uymuyor; karşılama ekranındaki düğme, Mert'in reddettiği metni taşıyor.
2. **Risk:** 🟠 Veri kaybı ya da bir workspace'in başkasının verisini görmesi yok. 44 bulgu: 1 yüksek, 19 orta, 24 düşük. 16'sı tamamen YENİ, 5'i eski bir maddeye ek bilgi.
3. **En önemli YENİ bulgular:** (a) Owner yeni bir kurulumu bitirince favori workspace'i sessizce değişiyor. (b) Discard edilen taslak Workspaces'te "Closed" diye kalıyor. (c) Kurulum bitince sıradaki davetler gönderilemezse owner'a hiçbir şey söylenmiyor. (d) Yeniden gönderilen davetin eski bağlantısı "iptal edildi" diyor. (e) Kaydı arşivlenen kişinin daveti açık kalıyor ve önünü kesiyor. (f) Onboarding'den vazgeçen kişi "On hold" yazısı görüyor.
4. **İniş kararı** (girişten sonra kişinin nereye gideceği) bugün **9 yerde**; 2026-09-21'de 8 yerdeydi. `resolveLanding`'in "tek yer" yorumu doğru değil. Davet dalları üretimde hiç çağrılmıyor.
5. **Test:** Üç test, KARARLAR'a ters davranışı kilitliyor: davet atlanır, en son kullanılan workspace'e inilir, taslak parolasız silinir. Workspaces sayfası, Discard, onboarding'den Decline ve kurulumun baştan sona hâli için tarayıcı testi (e2e) yok.

## Ekranın sınırı

- **İçeride:**
  - Sayfalar: `/sign-in` (hesap oluşturma dahil), `/forgot-password`, `/reset-password`, `/account-recovery`, `/invite/accept` ve ikizi `/accept-invite`.
  - Workspaces: `/workspaces` (`WorkspaceHubPage`) ve `/workspaces/status(/:id)`. Emekli yönlendirmeler: `/invitations/pending`, `/no-organization`, `/organization-switcher`, `/workspaces/suspended`, `/organization-switcher/suspended`.
  - Kurulumlar: `/onboarding` (owner kurulumu) ile `/welcome` ve `/welcome/:workspaceId/*` (çalışan kurulumu).
  - İniş kararı: `resolveLanding.ts`, `ProtectedRoute.tsx`, `AuthContext.tsx`, `WelcomeRedirect.tsx`, `/app` ana yönlendirmesi. Sol menüdeki workspace değiştirici (`WorkspaceSwitcher.tsx`) iniş kararını kullandığı için içeride. Sign out da içeride.
  - API: `/v1/context`, `/v1/auth/password-reset`, `/v1/account/security/deletion/recovery`, `/v1/invitations/*`, `/v1/account/workspaces` (liste, oluşturma, varsayılan, taslak Discard'ı için kapatma), `/v1/workspaces/:id/owner-onboarding*`, `/v1/me/onboarding*`.
- **Dışarıda:** Account (Profile, Security, Workspaces sayfası, Documents); Employees (davet gönderme, Send reminder / Resend, Restore, onboarding incelemesi, resmî ad onayı); Documents (belge adımının içi); Billing; Settings; yasal sayfalar.
- **Sınırda** (ayrı bölüm, sonda): Account → Workspaces'teki "Create workspace" ve oradaki ikinci iniş yardımcısı; davet gönderme rotası (BL-419); onboarding inceleme rotası (BL-280 (2)); belge adımı (BL-647…649); deneme süresi (trial); Send reminder / Resend (BL-767).

---

## 1. Giriş → iniş

**Bugün nasıl çalışıyor**
- Sign in formu e-postayı ve parolayı doğrudan Supabase'e (giriş servisi) gönderir. Giriş başarılıysa uygulama sunucuya "hangi workspace yüklensin" diye sorar (`/v1/context`).
- Sunucu şöyle seçer: işaretli favori varsa onu, yoksa kişinin tek aktif üyeliği varsa onu, ikisi de yoksa hiçbirini (`supabase/schema.sql:19676-19693`).
- Kişi sonra geldiği adrese ya da `/app`'e gider. Workspace yüklüyse `/app` rolüne göre sayfa seçer: owner ve müdür Workspace'e, çalışan Employee Hub'a, yalnız Schedule görebilen kişi Schedule'a. Workspace yüklü değilse Workspaces sayfasına "giriş inişi" işaretiyle gider (`ProtectedRoute.tsx:35-62`).
- Workspaces sayfası, açık bir karar yoksa (davet, yarım kurulum, kapanmış workspace) ve en az bir hazır workspace varsa, kişiyi sormadan en son kullandığı workspace'e geçirir (`WorkspaceHubPage.tsx:85-116`).
- Hesap oluşturma aynı formda. Yerelde e-posta onayı açık (`supabase/config.toml:232`). Onaydan önce oturum açılmaz; ekranda "Check your email" görünür.

**Kim nereye iniyor (kodun bugünkü cevabı)**

| Kişi | Bugün nereye iner | KARARLAR |
|---|---|---|
| 0 workspace, 0 davet | Workspaces: ilk kez gelene "Welcome to Newfork", daha önce bir yere bağlanmış olana "Welcome back". Düğmeler "Create your workspace" ve "I have an invitation" | ✓ akış; ✗ düğme metni (D-36) |
| 0 workspace, 1 davet | Workspaces: "You have an invitation", satırda Decline ve Join. Create gizli; sunucu da oluşturmayı reddeder | ✓ sert engel; ✗ Create görünürlüğü (D-35) |
| 0 workspace, 2 davet | Aynısı, "You have 2 invitations"; Create gizli | ✓ |
| 1 hazır workspace | Doğrudan rolüne göre sayfa | ✓ |
| 1 hazır workspace + bekleyen davet | Doğrudan workspace; davet yalnız sol üstteki sayıda ve Workspaces'te | ✗ (D-01) |
| 2+ workspace, favori işaretli | Favoriye iner | ✓ |
| 2+ workspace, favori yok | Sunucu seçmiyor, ama Workspaces sayfası en son kullanılana kendiliğinden geçiriyor | ✗ (D-02) |
| Yarım owner kurulumu (tek üyelik taslak) | Workspaces → "In progress": Continue / Discard; zorla kuruluma sokulmaz | ✓ |
| Hazır workspace'i olan owner + ikinci taslak | Favori ya da tek hazır workspace'e iner; taslak Workspaces'te bekler | ✓ |
| Kurulumu süren çalışan (`pending_activation`, onay bekleyen üyelik) | Workspaces → "Onboarding in progress": Decline / Continue | ✓ |
| Askıya alınmış üyelik (`suspended`) | Workspaces → "No longer open to you" → On hold / Why | ✓ |
| İşten çıkarılmış (kaydı arşivli) | Listeden düşer | ✓ |
| Kurulumu bitmemiş workspace'in owner olmayan üyesi | Workspaces'te hiç görünmez; doğrudan açarsa "Almost ready" | kısmen (D-41) |
| Discard edilmiş taslağın owner'ı | "No longer open to you → Closed" satırı kalır | ✗ (D-37) |

**İniş kararı nerede veriliyor — 9 yer**

| # | Yer | Neye karar veriyor |
|---|---|---|
| 1 | `supabase/schema.sql:19676-19693` (`resolve_workspace_context_service`) | Girişte hangi workspace yüklenecek: favori ya da tek aktif üyelik |
| 2 | `apps/web/src/views/SignInPage.tsx:22-26`, `:43-47`, `:63` | Girişten sonra geldiği adres ya da `/app`; davet bağlantısı; oturum var ama workspace yoksa `/workspaces` |
| 3 | `apps/web/src/auth/ProtectedRoute.tsx:35-73` | Workspace yoksa Workspaces'e; kurulum bitmemişse owner'ı Workspaces'e, öbürünü "Almost ready"e |
| 4 | `App.tsx:594-596` + `resolveLanding.ts:65-75` (`appLandingPath`; ayrıca `ActionRoute.tsx:21`, `PermissionRoute.tsx:58`) | Workspace içinde hangi sayfa |
| 5 | `WorkspaceHubPage.tsx:85-116` + `resolveLanding.ts:99-127` | Workspaces'ten en son kullanılana kendiliğinden geçiş |
| 6 | `employees/WelcomeRedirect.tsx:19-26` | `/welcome`: açık çalışan kurulumu |
| 7 | `employees/EmployeeOnboardingPage.tsx:62-71` | Onaydan sonra sabit `/app/employee-hub` |
| 8 | `views/OwnerOnboardingPage.tsx:252-257`, `:782` | Kurulum bitince sabit `/app/workspace`; owner değilse `/app` |
| 9 | `account/WorkspacesPage.tsx:1161-1163` (Account, sınırda) | `workspaceDestinationFromRole`: yalnız role bakan ikinci yardımcı, yetki çekirdeğine (`can()`) sormuyor |

### Bulgular

**D-01 · yüksek · Girişte bekleyen davet ekranı ("Active invitation found") ve "Not now" yok**
- Ekranda nerede: Sign in → workspace'i olan kişi doğrudan uygulamaya iner. Davet yalnız sol üstteki workspace adının yanında küçük bir sayı olarak ve Workspaces sayfasında görünür.
- Örnek: Ali Meyhouse'ta çalışıyor, Sunset Tacos onu davet etti. Ali giriş yapınca doğrudan Meyhouse'un Employee Hub'ına iner. Davetin süresi dolarsa onu hiç görmemiş olabilir.
- Kanıt:
  - `apps/web/src/auth/ProtectedRoute.tsx:19-20`: yorum "An invitation no longer stands between an account and its work". Davet kontrolü yok (`:35-62`).
  - `resolveLanding.ts:105-116`: davet dalları var, ama üretim kodunda hiçbir çağıran `inviteToken` ya da `pendingInvitationCount` göndermiyor. Grep sonucu: yalnız `resolveLanding.test.ts`.
  - `grep "Not now\|Active invitation" apps/web/src` → 0 sonuç.
  - Bu davranışı kilitleyen testler: `ProtectedRoute.test.tsx:190` ("lands a member with a pending invitation in the app, not on the invitation") ve `WorkspaceHubPage.test.tsx:194`.
- Backlog: BL-624 (geçerli).
- leave: high / do: moderate
- Öneri: Bekleyen davet varsa, hazır workspace olsa da, girişte önce A görünümündeki davet ekranı açılsın; "Not now" tek workspace'te oraya, birden çok workspace'te Workspaces'e götürsün; iki kilit test yeni kurala göre yazılsın.

**D-02 · orta · Favori yokken iki ya da daha çok workspace'te sistem tahmin ediyor; sunucu doğru, web eziyor**
- Ekranda nerede: Sign in → kısa bir an "Checking your account" → kişi sorulmadan bir workspace'e geçer.
- Örnek: Test Manager hem Meyhouse hem Ridgeline Bistro'da çalışıyor, favorisi yok. Dün Ridgeline'ı açtı; bugün sorulmadan Ridgeline'a iner.
- Kanıt:
  - Sunucu favori yokken workspace seçmiyor (`supabase/schema.sql:19676-19693`).
  - Web ise `WorkspaceHubPage.tsx:95-101`'de `ready.length >= 1` koşuluyla, `:102-116`'da da `resolveLanding` üzerinden en son kullanılanı seçiyor (`resolveLanding.ts:121`, `:149-163`).
  - Kilit testler: `WorkspaceHubPage.test.tsx:168` ("lands on the workspace used last rather than asking which one (R5)") ve `resolveLanding.test.ts:70`.
- Backlog: BL-625 (geçerli). Ek bilgi: düzeltme yalnız web'de; sunucu zaten soruyor.
- leave: medium / do: moderate
- Öneri: Kendiliğinden geçiş yalnız tek hazır workspace'te olsun; iki ya da daha çoksa Workspaces sorsun.

**D-03 · orta · Kurulum bitince owner'ın favori workspace'i sessizce değişiyor — YENİ**
- Ekranda nerede: Kurulum sihirbazı → Finish setup → sonraki her giriş.
- Örnek: Ayşe'nin favorisi Meyhouse. İkinci işletmesi Sunset Tacos'un kurulumunu bitirir. Ertesi gün girişte Meyhouse yerine Sunset Tacos'a iner; favoriyi kendisi değiştirmedi.
- Kanıt: Kurulum bitince çalışan tetikleyici (`set_active_workspace_when_owner_onboarding_completes`) favori kaydını (`user_workspace_preferences`) her seferinde üzerine yazıyor (`supabase/schema.sql:22949-22980`; üzerine yazma `:22974`). KARARLAR: "İşaretli yoksa sistem tahmin etmez"; işaretliyse işaret kişinindir.
- Backlog: YENİ (BL-625 ile aynı kural, ayrı yol).
- leave: medium / do: safe
- Öneri: Tetikleyici yalnız hiç favori yokken yazsın; işaretli favoriyi değiştirmesin.

**D-04 · orta · İniş kararı 9 yerde; "tek yer" yorumu yanlış — YENİ**
- Ekranda nerede: Giriş, kurulumun sonu, onboarding onayının sonu, workspace değiştirme, Account → Workspaces.
- Örnek: Can müdür rolüyle davet edilir. Onboarding'i onaylanınca Workspace yerine Employee Hub'a iner (D-05). Aynı workspace'i Account → Workspaces'ten açınca yalnız role bakan başka bir yardımcı devreye girer.
- Kanıt: Yukarıdaki tablo. `resolveLanding.ts:95-98`'deki yorum "Every sign-in, sign-up and membership change asks this and nothing else" diyor; oysa giriş (`SignInPage.tsx:22-26`, `:43-47`, `:63`) bu fonksiyonu hiç çağırmıyor.
- Backlog: YENİ. 2026-09-21 katılım denetiminin "sekiz yer" bulgusu backlog'a numarayla girmemiş.
- leave: medium / do: moderate
- Öneri: Tek bir iniş fonksiyonu olsun; giriş, kurulum sonu, onay sonu, değiştirici ve Account yalnız onu çağırsın; `workspaceDestinationFromRole` silinsin.

**D-05 · düşük · Onboarding onayından sonra iniş sabit Employee Hub — YENİ**
- Ekranda nerede: Çalışan kurulumu → onay gelince "Finishing up" → Employee Hub.
- Örnek: Can müdür rolüyle katıldı. Onaylanınca çalışan görünümüne iner; Workspace'e kendisi geçmek zorunda.
- Kanıt: `EmployeeOnboardingPage.tsx:70` `navigate("/app/employee-hub")`. KARARLAR: "Tek workspace'i olan kişi doğrudan rolüne göre ilgili ekrana iner".
- Backlog: YENİ.
- leave: low / do: safe
- Öneri: Yenilenen bağlamla `appLandingPath`'e gidilsin.

**D-06 · orta · Giriş ekranında ham İngilizce ve teknik metin**
- Ekranda nerede: Sign in formunun altındaki kırmızı satır.
- Örnek: API'nin bir an düştüğü sırada Ali doğru parolayla girer. Form yeniden açılır, altında "Workspace context is temporarily unavailable" ya da "Failed to fetch" yazar.
- Kanıt: Supabase'in kendi cümlesi doğrudan ekrana yazılıyor (`AuthContext.tsx:264-266`, `:288-290`): "Invalid login credentials", "Email not confirmed". Workspace bağlamı yüklenemezse API'nin cümlesi de `:168-173` üzerinden `SignInPage.tsx:44` ve `:151-155`'e düşüyor.
- Backlog: BL-628 (geçerli). `:168-173` üçüncü kaynak olarak maddeye eklenmeli.
- leave: medium / do: moderate
- Öneri: Ekranda yalnız sade cümleler; geçici hatada "Try again".

**D-07 · orta · Paylaşılan cihazda yeni giren kişi bir öncekinin sayfasına iniyor**
- Ekranda nerede: Herhangi bir sayfada Sign out → aynı cihazda başkası giriş yapar.
- Örnek: Restoran tabletinde Ayşe Settings → Roles'tayken çıkar. Ali girince Settings → Roles'a gönderilir ve "erişim yok" görür. Workspaces'ten çıkılırsa sonraki kişi, tek workspace'i olsa da Workspaces listesini görür, çünkü "giriş inişi" işareti taşınmıyor.
- Kanıt: Çıkışta adres sign-in'e taşınıyor (`ProtectedRoute.tsx:25-32`); sign-in o adresi kimin olduğuna bakmadan kullanıyor (`SignInPage.tsx:22-24`, `:63`); Workspaces'in otomatik geçişi işarete bağlı (`WorkspaceHubPage.tsx:85-86`).
- Backlog: BL-627 (geçerli; Workspaces kısmı ek bilgi).
- leave: medium / do: safe
- Öneri: Açık çıkışta adres taşınmasın; sign-in'den sonra iniş tek fonksiyondan gelsin.

**D-08 · düşük · Sign in ile Create account arasında geçince eski hata kalıyor**
- Ekranda nerede: Sign in → yanlış parola → "Create a workspace account" düğmesi.
- Örnek: Ali yanlış parola girer, sonra hesap oluşturma moduna geçer; giriş hatası hâlâ formun altında durur.
- Kanıt: Hata yalnız bir sonraki gönderimde siliniyor (`AuthContext.tsx:259`, `:281`); geçiş düğmesi yalnız modu değiştiriyor (`SignInPage.tsx:169-173`).
- Backlog: BL-636 (geçerli).
- leave: low / do: safe
- Öneri: Mod değişince hata temizlensin.

**D-09 · düşük · Hesap oluşturma açıklaması yanlış adımı vaat ediyor — YENİ**
- Ekranda nerede: Sign in → "Create a workspace account" → açıklama "You will name the workspace itself in the next step."
- Örnek: Mert hesap açar. Sonraki ekran workspace adı değil, "Check your email" olur; onaydan sonra da Workspaces karşılama ekranı gelir.
- Kanıt: `SignInPage.tsx:91`; e-posta onayı açık (`supabase/config.toml:232`).
- Backlog: YENİ.
- leave: low / do: safe
- Öneri: Gerçek sırayı söyleyen tek cümle, ör. "Next, confirm your email, then name your workspace."

---

## 2. Forgot password, Reset password, Account recovery

**Bugün nasıl çalışıyor**
- **Forgot password:** E-posta API'ye gider (`/v1/auth/password-reset`). Hesap olsun olmasın aynı cevap gelir ("If an account exists for this email, we sent a reset link."), her cevap en az ~1,5 sn sürer (`apps/api/src/account/password-reset.ts:35-36`, `:88`). Aynı e-postaya 15 dakikada en çok bir e-posta, aynı adresten saatte en çok 10 istek; sayaç veritabanında. Bağlantı 1 saat geçerli (`supabase/config.toml:240`); belirteç adresin `#` parçasında taşınır.
- **Reset password:** Belirteç adres çubuğundan hemen silinir, sayfa açılınca değil "Save password"da harcanır. Parola en az 8 karakter, iki kez yazılır; başarıdan sonra `/app`. Kaydetmeden çıkılırsa açılan oturum kapanır.
- **Account recovery (hesap silmeyi geri alma):** `/account-recovery?token=` → "Restore my account" → "Your account is back" → "Go to sign in". Pencere 14 gün.

### Bulgular

**D-10 · düşük · Forgot password'da ağ hatası "Failed to fetch", bazı adreslerde "Valid email required"**
- Ekranda nerede: Forgot password → Send reset link.
- Örnek: Ali metroda bağlantısı koparken "Failed to fetch" görür.
- Kanıt: `ForgotPasswordPage.tsx:21-25` (`caught.message`); API `password-reset.ts:53`.
- Backlog: BL-637 (geçerli).
- leave: low / do: safe
- Öneri: Sade sabit cümle.

**D-11 · düşük · Reset password Supabase'in ham cümlesini gösteriyor**
- Ekranda nerede: Reset password → Save password.
- Örnek: Ayşe eski parolasını yeniden yazar; "New password should be different from the old password." okur.
- Kanıt: `ResetPasswordPage.tsx:59-62`.
- Backlog: BL-638 (geçerli).
- leave: low / do: safe
- Öneri: Bilinen ret nedenlerini sade cümleye çevir.

**D-12 · orta · Hesap kurtarmada bozuk bağlantıda düğme sessizce kapalı; sunucu hatası da "geçersiz bağlantı" sayılıyor**
- Ekranda nerede: Account recovery → "Restore my account".
- Örnek: Burak bağlantıyı kesik kopyalar; düğme soluk kalır, nedeni yazmaz. Bağlantı doğru ama sunucu o an çökmüşse de "Valid recovery token required" görür ve bağlantısının bozuk olduğunu sanır.
- Kanıt:
  - Düğme sessizce kapalı: `AccountRecoveryPage.tsx:59` (`disabled={busy || token.length < 32}`).
  - Ham API metni ekranda: `:21-25`.
  - API her hatayı, çöküş dahil, 400 "Valid recovery token required"e çeviriyor (`apps/api/src/account/account-security-routes.ts:174-185`, boş `catch`).
  - Yeniden gönderme ucu API'de var, ekranda yok (`:188`).
  - Belirteç sorgu dizesinde: `AccountRecoveryPage.tsx:9`.
- Backlog: BL-629, BL-630 (geçerli; "çöküş de 400" ek bilgi); belirteç kısmı BL-351.
- leave: medium / do: safe
- Öneri: Nedeni yazan metin ve "yeni bağlantı iste" yolu; API'de 500 ayrı kalsın.

**Kurala uyanlar (bulgu değil):** Forgot'ta tek metin ve sabit süre ✓, hız sınırı ✓, reset belirtecinin `#` içinde taşınması ve Save'de harcanması ✓, parolanın en az 8 olması ✓ (web 8, `config.toml:188` 8).

---

## 3. Davet

**Bugün nasıl çalışıyor**
- Davet e-postasında `/invite/accept?token=…` bağlantısı var. Süre 7 gün; API davet anında hesaplar (`invitation-service.ts:92-94`), e-posta "expires in seven days" der.
- Sayfa önce oturum ister. Oturum yoksa giriş ekranı "Create your employee account" modunda açılır; dönüş adresi sayfalar arasında taşınır (`AcceptInvitationPage.tsx:49-50`).
- Önizleme belirteci isteğin gövdesinde gönderir. Her durum ayrı ayrı döner: valid, expired, revoked, declined, accepted, workspace_unavailable, bulunamadı (`supabase/schema.sql:15749-15779`). Her birinin kendi metni var (`AcceptInvitationPage.tsx:175-227`). 2026-09-21'deki "dört durum tek 404" sorunu düzelmiş: bugün yalnız "hiç yok" 404 dönüyor (API'ye istekle doğrulandı: `{"error":"This invitation is no longer open","code":"invitation_not_found"}` 404).
- Başka bir e-postayla açılmış oturum önizlemede değil, Accept'e basınca anlaşılır: "This invitation is for another address" ve "Sign in with that address" düğmesi. Bu düğme oturumu kapatır ve bağlantıyı korur.
- Kabul için e-posta eşleşmesi ve onaylı e-posta şart. Kabulde üyelik onay bekleyen duruma (`pending_activation`) geçer, onboarding başlar; ekranda "You're in" → "Start onboarding".
- Bağlantı sayfasında Decline yok. Ret yalnız Workspaces'teki davet satırında, iki tıklık kırmızı düğmeyle.

### Bulgular

**D-13 · orta · Önizleme yüklenirken yanlış bilgiyle açık bir Accept düğmesi görünüyor**
- Ekranda nerede: Davet bağlantısı → "Accept your invitation".
- Örnek: Emre bağlantıyı yavaş internette açar; bir an "Join the team at this workspace with the invited address" ve basılabilir bir Accept görür.
- Kanıt: `AcceptInvitationPage.tsx:52-53` (yedek metin), `:172` (önizleme gelmeden durum "valid" sayılıyor); yükleniyor dalı yok.
- Backlog: BL-631 (geçerli).
- leave: medium / do: safe
- Öneri: Önizleme gelene kadar yükleniyor durumu gösterilsin.

**D-14 · orta · Yeniden gönderilen davetin eski bağlantısı "iptal edildi" diyor — YENİ**
- Ekranda nerede: Eski davet e-postası → bağlantı → "This invitation was withdrawn".
- Örnek: Ayşe Pazartesi Ali'yi davet eder, Perşembe yeniden gönderir (yeni bağlantı). Ali Pazartesi'nin e-postasını açar ve "This invitation was withdrawn — Meyhouse cancelled it. Ask your manager for a new one." okur; istenmediğini sanar. Oysa yeni bir davet onu bekliyor.
- Kanıt: Yeniden davet eskisini sıradan iptal gibi işaretliyor (`supabase/schema.sql:15480-15481`, `status = 'revoked'`). Önizleme bu yüzden "revoked" döndürüyor; ekran iki durumu ayıramıyor (`AcceptInvitationPage.tsx:186-190`). Kısmi telafi: "Go to your workspaces" yeni daveti listeler.
- Backlog: YENİ. KARARLAR "Send reminder / Resend" kuralına bağlı (BL-767 Employees tarafında).
- leave: medium / do: moderate
- Öneri: Yerine yenisi gönderilen davet ayrı bir durum taşısın ve ekran "A newer invitation was sent to you. Open the latest email." desin.

**D-15 · orta · Kaydı arşivlenen kişinin daveti açık kalıyor, kabul düşüyor ve kişinin önünü kesiyor — YENİ**
- Ekranda nerede: Davet bağlantısı → Accept; Workspaces → davet satırı → Join; Workspaces → Create.
- Örnek: Owner, davetini henüz kabul etmemiş Ali'nin kaydını Employees'te arşivler. Ali bağlantıyı açar, "Accept your invitation" görür, basar ve "This link doesn't work anymore. It may have been replaced or cut off in an email." okur. Workspaces'te davet hâlâ listelenir, Join aynı hatayı verir. Davet açık göründüğü için Ali kendi işletmesini de açamaz: sunucu "pending invitation must be resolved first" diye reddeder.
- Kanıt:
  - Arşivleme davete dokunmuyor (`set_employee_archived_service`, `supabase/schema.sql:23125-23205`). Oysa erişimi kaldırma (`:18172`) ve işten çıkarma (`:25203`) daveti iptal ediyor.
  - Kabul, arşivsiz kayıt istiyor; yoksa P0002 hatası (`:537`), web bunu "bulunamadı" ekranına çeviriyor.
  - Workspaces listesi davetin durumuna bakıyor, kaydın arşivli olmasına bakmıyor (`:13221-13263`). Oluşturma engeli: `:8530-8547`.
  - Yerel veride bugün böyle bir davet yok (SELECT: arşivli kayda bağlı bekleyen davet 0); bulgu kodla kanıtlı.
- Backlog: YENİ.
- leave: medium / do: safe
- Öneri: Arşivleme bekleyen daveti iptal etsin, ya da önizleme, liste ve kabul arşivli kaydı aynı biçimde "kapandı" saysın.

**D-16 · düşük · Aynı daveti iki sekmede kabul eden ikinci sekmede "bağlantı çalışmıyor" görüyor — YENİ**
- Ekranda nerede: Davet bağlantısı iki sekmede açık → ikisinde de Accept.
- Örnek: Emre iki sekmede Accept'e basar. İlk sekme "You're in" der, ikincisi "This link doesn't work anymore"; oysa Emre katıldı.
- Kanıt: Kabul yalnız bekleyen daveti arıyor (`supabase/schema.sql:474-491`); ikinci deneme P0002 alıyor. Web kabulün hatasını önizlemeden önce okuyor (`AcceptInvitationPage.tsx:159-170`).
- Backlog: YENİ.
- leave: low / do: safe
- Öneri: Kabul "bulunamadı" derse önizleme yeniden sorulsun; durum "accepted" ise "You have already joined" gösterilsin.

**D-17 · düşük · Kabulden sonra API onboarding'i ikinci kez ve yanlış workspace için başlatıyor; 42501 hep "başka adres" ekranına düşüyor — YENİ**
- Ekranda nerede: Davet → Accept; Workspaces → Join.
- Örnek: Ali Meyhouse'ta zaten çalışıyor ve Sunset Tacos'un davetini kabul ediyor. Veritabanı kabul anında Sunset Tacos'un onboarding'ini başlatıyor. Ardından API ikinci bir çağrı yapıyor ve bu çağrı Ali'nin en eski üyeliğini, yani Meyhouse'u seçiyor. Bu çağrı yetki hatası verirse Ali katılmış olur ama ekranda "This invitation is for another address" görür.
- Kanıt:
  - Veritabanındaki kabul, onboarding'i doğru workspace için zaten başlatıyor (`supabase/schema.sql:589`).
  - API sonra tek argümanlı ikinci sürümü çağırıyor (`invitation-service.ts:238`, `:277`, `:300-310`). Bu sürüm workspace almıyor ve en eski üyeliği seçiyor (`schema.sql:12481-12489`, `:4198-4216`).
  - API, nedeni ne olursa olsun her 42501'i (`authz.not_active` dışında) "invitation_email_mismatch"e çeviriyor (`apps/api/src/app.ts:214-229`).
  - Bu yolun gerçekten hata verdiği ölçülmedi (bkz. Kanıtlanamayanlar).
- Backlog: YENİ.
- leave: low / do: safe
- Öneri: API'deki ikinci çağrı kaldırılsın; tek argümanlı sürüm silinip `retired_objects_stay_gone`'a eklensin; 42501 neden anahtarına göre eşlensin.

**D-18 · düşük · `/accept-invite` ölü ikiz rota — YENİ**
- Ekranda nerede: `/accept-invite?token=…` adresi.
- Örnek: Bu adresi bugün hiçbir e-posta üretmiyor.
- Kanıt: Rota `App.tsx:188`'de duruyor; üreten tek yer API testindeki sahte adres (`apps/api/src/app.test.ts:954`). Gerçek bağlantılar `/invite/accept` (`invitation-service.ts:108`, `:173`, `:224`; `employee-create-service.ts:54`).
- Backlog: YENİ.
- leave: low / do: safe
- Öneri: Rota silinsin.

**D-19 · düşük · E-posta onayı sırasında davet bağlantısı kayboluyor; yeni hesapla kabulün tarayıcı testi yok**
- Ekranda nerede: Davet → Create your employee account → Check your email → onay bağlantısı.
- Örnek: Emre hesap açar, onay e-postasındaki bağlantıya basar. Davet sayfasına değil Workspaces'e iner. Davet orada e-posta eşleşmesiyle listelendiği için Join'e basabilir.
- Kanıt: Kayıtta dönüş adresi verilmiyor (`AuthContext.tsx:284-287`, `emailRedirectTo` yok). Workspaces listesi e-postayla eşleşiyor (`schema.sql:13221-13263`). e2e yalnız hesabı olan kişiyi deniyor (`e2e/flows/invite.spec.ts:88`).
- Backlog: BL-336 (geçerli; Workspaces sayesinde etkisi azalmış), BL-434 (geçerli).
- leave: low / do: safe
- Öneri: Kayıtta dönüş adresi davet sayfası olsun; yeni hesapla kabul için e2e senaryosu eklensin.

**D-20 · düşük · Davet ve kurtarma bağlantılarında belirteç adreste**
- Ekranda nerede: Davet e-postası ve kurtarma e-postasındaki bağlantılar.
- Örnek: Belirteç tarayıcı geçmişine ve ara sunucu kayıtlarına düşebilir.
- Kanıt: `invitation-service.ts:108`, `:173`, `:224`; `AccountRecoveryPage.tsx:9`.
- Backlog: BL-351 (geçerli).
- leave: medium / do: moderate
- Öneri: Parola sıfırlamadaki gibi belirteç `#` içinde taşınsın.

---

## 4. Owner kurulumu (`/onboarding`)

**Bugün nasıl çalışıyor**
- Workspaces'teki "Create your workspace" tek tıkla "New workspace" adlı bir taslak açar ve doğrudan 1. adıma götürür (`CreateOrganizationButton.tsx:15`, `:36-50`). KARARLAR'a uygun.
- Dört adım var: Workspace (resmî ad ve workspace adı), Locations, Jobs, Team (isteğe bağlı). Her ilerleme sunucuya adım numarası ve sürüm numarasıyla yazılır; aynı anda iki sekmeden kayıt böyle yakalanır. Kurulum sürerken workspace taslaktır (`lifecycle_status = draft`); bitince bir tetikleyici onu aktif yapar (`schema.sql:5216-5236`).
- Bitirmek için en az 1 lokasyon ile Management dışında 1 departman ve 1 iş gerekir; ekran ve sunucu aynı sayar. Owner işi kilitli. Finish setup'ta şunlar olur: 14 günlük deneme başlar, favori bu workspace olur, kurulumda sıraya alınan davetler gönderilir, kişi `/app/workspace`'e iner.
- "Exit setup" kişiyi Workspaces'e götürür; orada "In progress" satırında Continue ve Discard var. Start over ayrı bir düğme: lokasyonları, departmanları, işleri ve hesabı bağlanmamış kişileri siler. Discard taslağı silinmiş sayar ve parola istemez.

### Bulgular

**D-21 · orta · Geri dönüp kayıt yapmak ilerlemeyi geri sarıyor; kaldığı yerden açınca adlar ve "Added so far" boş geliyor**
- Ekranda nerede: Kurulum → Team adımından Locations'a dön → lokasyon ekle; ya da çık ve "Continue" ile geri gel.
- Örnek: Mert Team adımındayken Locations'a dönüp bir lokasyon ekler; yan panel "1 of 4 steps done"a düşer. Çıkıp geri gelince resmî ad alanları boştur, Continue kapalıdır; eklediği kişiler listede görünmez.
- Kanıt:
  - Geri adımda kayıt eski adım numarasını yazıyor: `OwnerOnboardingPage.tsx:411` (`nextStep: 2`) ve `:510` (`nextStep: 3`). Sunucu büyük olanı korumuyor (`schema.sql:1125-1238`, `current_step = next_step`).
  - Ad alanları her açılışta boş başlıyor: `useState("")` (`:130-132`).
  - "Added so far" yalnız sayfa belleğinde (`:155`, `:731`); Start over bu listeyi temizlemiyor (`:794-821`).
- Backlog: BL-632, BL-633 (geçerli).
- leave: medium / do: moderate
- Öneri: Sunucu adım numarasının büyüğünü korusun; sayfa açılışta adları ve eklenen kişileri sunucudan okusun.

**D-22 · orta · Kurulum bitince davetler gönderilemezse owner hiçbir şey duymuyor — YENİ**
- Ekranda nerede: Kurulum → Team → "Send the invitation when setup finishes" işaretli → Finish setup.
- Örnek: Mert kurulumda Orhan'ı ekler, davetin kurulum bitince gitmesini işaretler. Bitişte gönderim düşer (e-posta servisi yok ya da bir kural reddetti). Mert Workspace'e iner, hiçbir uyarı görmez; Orhan Employees'te davet edilmemiş görünür.
- Kanıt: Gönderim hatası yalnız sunucu kaydına yazılıyor ve cevap yine 204 başarılı dönüyor (`apps/api/src/account/workspace-account-routes.ts:429-466`; günlük `:452`). Hata yalnız bir tablo sütununda (`dispatch_error`) kalıyor; web ya da API onu hiç okumuyor (grep 0). Bu davranışı kilitleyen test: `workspace-account-routes.test.ts:409` ("does not roll back owner onboarding when invitation dispatch fails").
- Backlog: YENİ.
- leave: medium / do: moderate
- Öneri: Kurulum geri alınmasın ama cevap gönderilemeyen kişileri saysın; Workspace'te tek satır uyarı ("2 invitations didn't go out. Send them from Employees.") gösterilsin.

**D-23 · orta · Sihirbaz, API'nin geliştiriciye yazılmış İngilizce cümlelerini gösteriyor**
- Ekranda nerede: Sihirbazın her adımında, alt çubuktaki kırmızı satır.
- Örnek: Mert sihirbazı iki sekmede açmış; birinde kaydeder, öbüründe Continue'ya basar. Ekranda "owner onboarding revision conflict" okur. Başka bir anda "the owner's legal name is required" ya da "at least one job outside Management is required to complete owner onboarding" çıkabilir.
- Kanıt:
  - Hatanın kendi metni 14 yerde doğrudan ekrana yazılıyor (`OwnerOnboardingPage.tsx:186`, `:300`, `:339`, `:426`, `:452`, `:487`, `:521`, `:546`, `:572`, `:601`, `:698`, `:744`, `:786`, `:815`).
  - Bu cümleler veritabanından geliyor (`schema.sql:1176`, `:1206`, `:1238`) ve API onları olduğu gibi geçiriyor (`apps/api/src/http-error.ts:149-153`).
  - Settings yazmalarından gelen ham Postgres metni de aynı yoldan geliyor (BL-620).
- Backlog: BL-620 (genişleme: API kaynaklı kısım yeni), BL-490 (tamamlama reddinde ipucu yok).
- leave: medium / do: moderate
- Öneri: Sihirbaz sunucunun neden anahtarına göre sade cümle göstersin; sürüm çakışmasında sayfa kendini yenileyip "Your setup changed in another tab. We loaded the latest." desin.

**D-24 · orta · Taslak, içinde kişi ve veri olsa da her zaman parolasız siliniyor**
- Ekranda nerede: Workspaces → In progress → Discard → "Confirm delete".
- Örnek: Mert taslağa 3 lokasyon ve 12 kişi ekledi. Discard iki tıkla, parola sormadan taslağı siler.
- Kanıt: Parola kapısı yalnız "owner + aktif + kurulum bitmemiş" koşuluna bakıyor (`workspace-account-routes.ts:225-241`, `:566-583`). Yorum "nothing worth a password" diyor. Bu davranışı kilitleyen test: `workspace-account-routes.test.ts:720`. KARARLAR: "Kaybedilecek kişi ya da veri yoksa silmek için parola istenmez"; yani varsa istenir.
- Backlog: BL-284 (geçerli; ürün sorusu bekliyor).
- leave: medium / do: moderate
- Öneri: Taslakta lokasyon, iş ya da kişi varsa Discard parola istesin; boş taslak parolasız kalsın.

**D-25 · düşük · Team adımında davet sırası kaydedilemezse kişi zaten kaydedilmiş oluyor; yeniden basınca ikinci kayıt açılıyor — YENİ**
- Ekranda nerede: Kurulum → Team → Add employee.
- Örnek: Mert Orhan'ı ekler. Kişi kaydedilir ama davet sırasına yazım düşer (ör. ağ). Form temizlenmez ve hata görünür. Mert yeniden basar; ikinci bir "Orhan Turhan" kaydı açılır.
- Kanıt: `OwnerOnboardingPage.tsx:717-735`. Kişi kaydı ve davet sırası ayrı istekler; form yalnız ikisi de başarılıysa temizleniyor.
- Backlog: YENİ.
- leave: low / do: safe
- Öneri: Kişi kaydedildiyse form temizlensin ve "Added. The invitation couldn't be queued; send it from Employees." gösterilsin.

**D-26 · düşük · Kurulum bitmemiş workspace'ten API ile davet gönderilebiliyor (sınırda)**
- Ekranda nerede: Ekranda yol kapalı; doğrudan API isteğiyle.
- Örnek: Mert "Beyoğlu"nu 2. adımda bıraktı; doğrudan API'yi çağıran biri Ali'ye davet gönderebilir.
- Kanıt: Davet rotası (`apps/api/src/app.ts:543-572`) ve davet fonksiyonu (`schema.sql:15418-15430`) kurulumun bitip bitmediğine bakmıyor. Yetki çekirdeği taslağı owner'a açık sayıyor (`schema.sql:6063-6079`); `employee.invite` satırında kurulum şartı yok (SELECT `app_private.authz_actions`).
- Backlog: BL-419 (geçerli).
- leave: low / do: moderate
- Öneri: Davet hazırlama, kurulumu bitmemiş workspace'i hint'li 42501 ile reddetsin.

**D-27 · düşük · Doğrulanan öteki sihirbaz maddeleri (bugün de geçerli)**

| Madde | Bugünkü kanıt | leave / do |
|---|---|---|
| BL-634: posta kodundan saat dilimi önerisi çalışmıyor; tarayıcının saat dilimi önden dolu | `OwnerOnboardingPage.tsx:76`, `LocationTimezoneField.tsx:7`, `:12` | medium / safe |
| BL-640: "Invite delivery waits until owner onboarding is completed." (geliştirici dili, "owner onboarding" kod adı) | `OwnerOnboardingPage.tsx:1876` | low / safe |
| BL-641: başarı satırı adım değişince kalıyor | `:983`, `:1103`, `:1371`, `:1481` | low / safe |
| BL-642: onay kutuları yazının altında (CSS satırları bu turda ölçülmedi) | `:1841-1871` | low / safe |
| BL-650: "Switch workspace" emekli `/organization-switcher`'a gidiyor; bu adrese gidilen 4 yer var | `OwnerOnboardingPage.tsx:884`, `WorkspaceSetupPending.tsx:37`, `WelcomeRedirect.tsx:25`, `WorkspacesPage.tsx:344` | low / safe |

**D-28 · düşük · Lokasyon telefonunda maske var ama sabit "+1" yok**
- Ekranda nerede: Kurulum → Locations → "Phone number (optional)".
- Örnek: Mert telefonu yazınca maskeyi ("(415) 555-0100") görür, ama alanın başında gri "+1" görmez.
- Kanıt: `OwnerOnboardingPage.tsx:1682-1700`. KARARLAR "Form ve girdi kuralları": owner ve çalışan kurulumunda sabit gri "+1".
- Backlog: BL-503.
- leave: low / do: safe
- Öneri: Ortak telefon alanı her iki kurulumda ve çekmecede kullanılsın.

---

## 5. Çalışan kurulumu (`/welcome/:workspaceId/*`)

**Bugün nasıl çalışıyor**
- Adımlar: Welcome → Profile (iki sayfa: "Your details" ve "Who we call in an emergency") → Documents (varsa) → Availability (yalnız employee rolü, isteğe bağlı) → Review → "Send for review".
- Zorunlu alanlar: resmî ad ve soyad, telefon (hesapta varsa salt okunur), adres, şehir, eyalet, ZIP, doğum tarihi, acil durum kişisinin adı, yakınlığı ve telefonu. İsteğe bağlı: middle name, preferred name, acil durum e-postası (`packages/shared/src/index.ts:2834-2856`). Profil yalnız 2. sayfada tek seferde kaydedilir.
- Resmî ad davettekinden farklı yazılırsa profil adımı incelemeye düşer ve onay ister (`supabase/schema.sql:20874-20880`).
- "Send for review"dan sonra iki yol var. Workspace'in onay ayarı kapalıysa ve engelleyen belge yoksa kişi hemen aktif olur. Değilse ekranda "Sent to your manager — You'll get access as soon as they approve it." yazar. Onay gelince, sayfa açıksa, kişi Employee Hub'a geçer.
- Sıfırlama yok ✓. "Exit onboarding" kişiyi Workspaces'e götürür. Oradaki "Decline" (iki tık, kırmızı) üyeliği askıya alır (`schema.sql:12792-12850`).

### Bulgular

**D-29 · orta · Telefon ve harf kuralları çalışan kurulumunda uygulanmıyor**
- Ekranda nerede: Onboarding → Your details → Phone; Emergency → Phone; ad alanları.
- Örnek: Orhan telefonuna "+90 532 …" yazar, kabul edilir; maske ve sabit "+1" yok. "Şükrü" adı da kabul edilir.
- Kanıt: Alanlar serbest metin (`EmployeeOnboardingPage.tsx:659-667`, `:741-757`, `minLength={7}`). Şemada yalnız uzunluk kuralı var (`packages/shared/src/index.ts:2838`, `:2853`); harf kuralı yok (`:2834-2836`).
- Backlog: BL-503 (geçerli).
- leave: high / do: risky (maddenin işareti)
- Öneri: Ortak ABD telefon alanı (+1 sabit, maske) ve ortak ad doğrulaması.

**D-30 · orta · Resmî ad farkı onay beklerken adım "Done" görünüyor; middle name değişikliği hiç onaya gitmiyor**
- Ekranda nerede: Onboarding → Review → "Your steps" → Profile "Done".
- Örnek: Davette "Orhan Turan" yazıyor. Orhan "Turhan" diye düzeltir; her şey "Done" görünür ve erişimin neden açılmadığını bilemez. Emre middle name'i "Can"ı silerse fark hiç onaya gitmez.
- Kanıt: Onay bekleyen adım (`awaiting_review`) "tamam" sayılıyor (`EmployeeOnboardingPage.tsx:243-245`, `:896-901`). Sunucu farkı yalnız ad ve soyadda arıyor (`supabase/schema.sql:20874-20877`).
- Backlog: BL-646 (geçerli; karar gerekir); middle name kısmı YENİ.
- leave: medium / do: safe
- Öneri: Adım "Waiting for approval" göstersin; middle name farkı da karşılaştırılsın (Mert'e sorulacak: middle name resmî adın parçası sayılsın mı).

**D-31 · orta · Onay sonrası geçiş hata verirse kişi "Finishing up"ta asılı kalıyor**
- Ekranda nerede: Onboarding → onay gelir → "Finishing up".
- Örnek: Orhan onaylanır; tam o an bağlantı düşer. Sayfa "Finishing up"ta kalır, düğme yoktur.
- Kanıt: `EmployeeOnboardingPage.tsx:62-71` hatayı yakalamıyor; `:82-85` sonucu beklemeden çağırıyor (`void finalizeActivation()`); `:116-119` düğmesiz.
- Backlog: numarasız madde, `docs/plan/BACKLOG.md:182` (geçerli).
- leave: medium / do: safe
- Öneri: Hata yakalansın, "Try again" düğmesi konsun.

**D-32 · düşük · Resmî ad davetteki adla önceden dolu geliyor — karar gerekir (YENİ)**
- Ekranda nerede: Onboarding → Your details → Legal first / last name.
- Örnek: Mert Orhan'ı "Orhan Turan" diye ekledi. Orhan alanları dolu bulur, yazmadan geçer; yazım hatası resmî belgelere taşınır.
- Kanıt: Profil kaydı yoksa sunucu kişi kaydındaki adı resmî ad olarak dönüyor (`supabase/schema.sql:10614-10620`). Bunu kilitleyen test: `EmployeeOnboardingPage.test.tsx:544` ("prefills the legal name from the employer-provided employee record"). KARARLAR "Legal name: tahminle ya da kopyayla doldurulmaz … kişi zorunlu alan olarak kendisi yazar" bu durumu iki türlü okumaya açık.
- Backlog: YENİ (karar).
- leave: low / do: safe
- Öneri: Mert'e sorulsun: alanlar boş mu başlasın, yoksa davetteki ad görünür ama onaylatılarak mı gelsin.

**D-33 · düşük · Doğrulanan öteki çalışan kurulumu maddeleri (bugün de geçerli)**

| Madde | Bugünkü kanıt | leave / do |
|---|---|---|
| BL-645: Review "Needs changes" diye işaretli adımı aç diyor; satırlarda yalnız Done / To do var | `EmployeeOnboardingPage.tsx:918`, `:928-933` | medium / safe |
| BL-647: "Send for review" koşullu belgeyi bilmiyor; sunucu "Submit conditional documents or give an initial reason" diyor | `:896-901`; `schema.sql` (`submit_employee_onboarding_service`, `:24548`) | medium / safe |
| BL-648, BL-649: belge adımı (sınırda, Documents) | `OnboardingDocumentStep.tsx:255` | low / safe |
| BL-621: zod'un varsayılan cümlesi ekranda ("Too small: expected string…") | `EmployeeOnboardingPage.tsx:584-591` | medium / moderate |
| BL-620 (onboarding yarısı): ağ hatasında "Failed to fetch" | `:1143-1145` | medium / moderate |

**D-34 · düşük · Doğum tarihinin "gelecekte olamaz" kontrolü UTC'ye göre**
- Ekranda nerede: Onboarding → Your details → Date of birth.
- Örnek: Pasifik saatiyle akşam 8'de UTC tarihi ertesi güne geçmiş olur; yarının tarihi şemadan geçer. Tarayıcıdaki üst sınır yerel saate göre olduğu için pratikte yalnız API'ye doğrudan istekte görülür.
- Kanıt: `packages/shared/src/index.ts:2845-2849` (`new Date().toISOString()`). Tarayıcı tarafı: `EmployeeOnboardingPage.tsx:763` (`max={todayIn()}`).
- Backlog: BL-277 ailesi.
- leave: low / do: safe
- Öneri: Şema "bugün"ü ortak yardımcıdan alsın.

---

## 6. Workspaces (`/workspaces`) ve durum sayfası (`/workspaces/status`)

**Bugün nasıl çalışıyor**
- Bölümler:
  - **Invitations:** satırda Decline ve Join, yanında "Expires in N days" (aşağı yuvarlanır; bir günden az kaldıysa "today").
  - **In progress:** owner taslağında Discard ve Continue; çalışan kurulumunda Decline ve Continue.
  - **Where you work:** Open.
  - **No longer open to you:** Closed / Access removed / On hold rozeti ve "Why".
  - **Your own workspace:** Create.
- Hiçbir şeyi olmayan hesap "Welcome to Newfork" ya da "Welcome back" görür, yanında "Create your workspace" ve "I have an invitation". İkincisine basınca "No invitation yet" ve "Check again" gelir.
- Favori burada işaretlenmiyor (Account → Workspaces'te). Sol menüdeki değiştirici başka workspace'leri ve davetleri listeler; davette "Answer" düğmesi Workspaces'e götürür.
- Durum sayfası `/workspaces/status/:id` üç sonu ayırır: workspace kapandı, erişim kaldırıldı, beklemede.

### Bulgular

**D-35 · orta · "Create your workspace" görünürlüğü kurala uymuyor; başka bir workspace'te çalışana gösteriliyor ve basınca nedeni söylenmeyen bir hata veriyor**
- Ekranda nerede: Workspaces → Your own workspace → Create your workspace.
- Örnek: Ali Meyhouse'ta çalışan. Workspaces'te "Create your workspace"e basar; kurulum açılmaz, "Workspace could not be created" okur. Bunun nedeni Meyhouse'ta çalışıyor olması, ama ekran bunu söylemiyor.
- Kanıt:
  - Tek koşul `invitations.length === 0 && !ownDraft` (`WorkspaceHubPage.tsx:324`). Bu yüzden 1 davette düğme gizli; KARARLAR bu durumda "görünür" diyor.
  - Sunucu reddi hint'siz 42501 olarak dönüyor (`supabase/schema.sql:8549-8560`); bu, "hayır tek biçim" kuralına (§2.A.2) da uymuyor. Ekran sabit cümle gösteriyor (`CreateOrganizationButton.tsx:51-54`).
  - Account → Workspaces aynı karar için ikinci ve farklı bir kural kullanıyor (`account/WorkspacesPage.tsx:139-141`; sınırda).
- Backlog: BL-626 (geçerli; ikinci kural ve hint'siz ret ek bilgi).
- leave: medium / do: safe
- Öneri: Kural tek yardımcıda yaşasın; çalışana düğme gösterilmesin ya da nedeni yazan bir cümle eklensin; sunucu reddi `authz.*` hint'iyle dönsün. Not: KARARLAR'daki "0 ya da 1 davette görünür" ile "workspace'i olmayan davetli için sert engel" satırları 1 davet + 0 workspace durumunda birbirini tutmuyor; Mert'e sorulmalı.

**D-36 · düşük · Karşılama ekranındaki ikinci düğme, Mert'in reddettiği metni taşıyor — YENİ**
- Ekranda nerede: Workspaces (boş hesap) → "Welcome to Newfork" ya da "Welcome back" → "I have an invitation".
- Örnek: İlk kez gelen Emre, "I am waiting for an invitation" yerine "I have an invitation" görür.
- Kanıt: `WorkspaceHubPage.tsx:223`; aynı metni bekleyen test: `WorkspaceHubPage.test.tsx:118`. KARARLAR (2026-10-05) "I am waiting for an invitation" diyor ve "I have an invitation" seçeneğini açıkça reddediyor. "Welcome back" için de KARARLAR'ın metni "I am waiting for another invitation".
- Backlog: YENİ.
- leave: low / do: safe
- Öneri: Metin ve test KARARLAR'a çekilsin.

**D-37 · orta · Discard edilen taslak Workspaces'te "Closed" olarak kalıyor — YENİ**
- Ekranda nerede: Workspaces → In progress → Discard → satır "No longer open to you"ya geçer, rozeti "Closed" olur → Why → "New workspace has closed … it will not reopen."
- Örnek: Mert yanlışlıkla açtığı "New workspace" taslağını Discard eder. Taslak listeden kalkmaz, "Closed" diye durur; Why'a basınca bir işletmenin kapandığını anlatan metni okur. Yerel veride tam olarak bu durum var: seed owner'ın listesinde "New workspace" (taslak, silinmiş, üyelik askıda) görünüyor.
- Kanıt:
  - Discard taslağı silinmiş yapıyor ve üyeliği askıya alıyor (`supabase/schema.sql:19093`, `:19104`).
  - Liste silinmiş workspace'i süzmüyor (`:13104-13111`).
  - Web onu "kapanmış" sayıyor (`WorkspaceStatusPage.tsx:18-26`, `WorkspaceHubPage.tsx:76`).
  - SELECT (`begin … rollback` içinde `list_my_workspaces_service`): `Meyhouse | owner | active` ve `New workspace | owner | suspended | incomplete | deleted`.
- Backlog: YENİ.
- leave: medium / do: safe
- Öneri: Kurulumu hiç bitmemiş ve Discard edilmiş workspace hiçbir listede görünmesin.

**D-38 · orta · Onboarding'den vazgeçen kişi "On hold — bir yönetici açana kadar" yazısı görüyor; vazgeçmenin sonucu baştan yazılmıyor — YENİ**
- Ekranda nerede: Workspaces → In progress → (çalışan kurulumu) Decline → Confirm decline → satır "No longer open to you → On hold" olur → Why.
- Örnek: Ali Sunset Tacos'un onboarding'inden vazgeçer. Listede "On hold" görür; Why'da "Nothing in Sunset Tacos can be opened until an owner or an admin lifts the hold." okur, oysa bunu kendisi yaptı. Müdür Ali'yi yeniden davet ederse yeni davet Workspaces'te görünmez; Ali onu yalnız e-postadaki bağlantıdan açabilir.
- Kanıt:
  - Vazgeçme üyeliği askıya alıyor (`supabase/schema.sql:12836-12838`); web bunu "beklemede" sayıyor (`WorkspaceStatusPage.tsx:20-22`, metin `:91-96`).
  - Düğmede sonuç yazmıyor (`UnfinishedSetupRow.tsx:78-93`). "Declining can't be undone" cümlesi yalnız davet varken görünüyor (`WorkspaceHubPage.tsx:239-243`).
  - Bekleyen davet listesi, kişinin herhangi bir üyeliği olan workspace'in davetini gizliyor (`schema.sql:13254-13262`).
  - Yerel veride örnek yok (SELECT: vazgeçme olayı 0); bulgu kodla kanıtlı.
- Backlog: YENİ.
- leave: medium / do: safe
- Öneri: Vazgeçilen kurulum kendi metniyle görünsün ("You left onboarding") ya da listeden düşsün; iki tıklık onay sonucu söylesin (P25); yeniden davet listede görünsün.

**D-39 · düşük · Açık workspace'in durum adresi "isn't open to you" diyor; kapanış tarihi tarayıcının diliyle**
- Ekranda nerede: `/workspaces/status/<id>`.
- Örnek: Mert'in tarayıcısı Türkçe olduğu için kapanış tarihi "7 Ekim 2026" diye görünür (P12: arayüz İngilizce).
- Kanıt: Bilinmeyen ya da açık durum varsayılan cümleye düşüyor (`WorkspaceStatusPage.tsx:111-116`); tarih `toLocaleDateString(undefined, …)` ile yazılıyor (`:122-128`).
- Backlog: BL-639 (geçerli), BL-674 ailesi (tarih biçimi).
- leave: low / do: safe
- Öneri: Açık workspace'te kişi oraya yönlendirilsin; tarih "en-US" ve workspace saat dilimiyle yazılsın.

**D-40 · düşük · Davet satırındaki Decline kırmızı ve iki tık; KARARLAR'ın A görünümü beyaz Decline diyor — karar gerekir (YENİ)**
- Ekranda nerede: Workspaces → Invitations → Decline.
- Örnek: Emre Decline'a basar, kırmızı "Confirm decline" görür; prototipte beyaz Decline vardı.
- Kanıt: `InvitationRow.tsx:68-76`. KARARLAR "Katılım ve giriş akışı" A görünümü ile CLAUDE.md §2.A.7 (yıkıcı eylem = iki tık kırmızı) bu düğme için çelişiyor.
- Backlog: YENİ (karar).
- leave: low / do: safe
- Öneri: Mert'e sorulsun; seçilen dil hem davet ekranında hem Workspaces'te aynı olsun.

**D-41 · düşük · Kurulumu bitmemiş workspace'in owner olmayan üyesi o workspace'i Workspaces'te hiç görmüyor**
- Ekranda nerede: Workspaces.
- Örnek: Mert yeni şubeyi kurarken Ayşe'yi müdür olarak ekledi. Ayşe Workspaces'te o şubeyi görmez; değiştiricide "Setup unfinished" diye görünür.
- Kanıt: `WorkspaceHubPage.tsx:70-72` yalnız onay bekleyen üyeliği ya da owner'ı süzüyor; `UnfinishedSetupRow.tsx:107`'deki "Open" dalı bu yüzden ölü. KARARLAR: pending üyelik listede görünür.
- Backlog: numarasız madde, `docs/plan/BACKLOG.md:177` (değişmiş, geçerli).
- leave: low / do: safe
- Öneri: Satır "Waiting for the owner to finish setup" metniyle görünsün.

**D-42 · düşük · Davet satırı cevaptan sonra Account rozetini yenilemiyor**
- Ekranda nerede: Workspaces → Join / Decline → Account menüsündeki sayı.
- Örnek: Emre daveti reddeder; Account'taki "1" sayısı sayfa yenilenene kadar durur.
- Kanıt: `InvitationRow.tsx:21-26`.
- Backlog: BL-389 (geçerli).
- leave: low / do: safe
- Öneri: Cevaptan sonra rozet sorgusu da yenilensin.

---

## 7. Çapraz konular

**D-43 · düşük · İkiz ve eski yollar (bu ekranın akışlarında)**
- Ekranda nerede: Görünmez; bakım ve kural (§2.A.1, §2.A.4).
- Örnek: Bir sonraki iş, kurulum ilerlemesini değiştirirken aynı işi yapan iki fonksiyondan hangisini değiştireceğini bilemez.
- Kanıt:
  - `update_owner_onboarding_service` için 5 argümanlı ikinci sürüm duruyor; API hep 9 argümanlıyı çağırıyor (`supabase/schema.sql:26093` ile `:26113`; `workspace-account-service.ts:256-266`).
  - `initialize_employee_onboarding_service`'in tek argümanlı sürümü (`schema.sql:12481`; bkz. D-17).
  - `create_owner_workspace_service` ve `list_my_workspaces_service`, kullanıcıyı `request.jwt.claim.sub` ayarıyla tanıtıp oturumdan kullanıcı okuyan (`auth.uid()`) eski iç fonksiyonları çağırıyor (`schema.sql:8562`, `:13130`). Kural §2.A.1 bunu yasaklıyor.
  - Kurulum rotaları eski kapıyla korunuyor (`resolveWorkspaceAuthorization`; `workspace-account-routes.ts:396`, `:482`, `:527`).
  - Davet istekleri ortak istek yardımcısını (`apiRequest`) kullanmıyor; oturum düşmesini ve workspace başlığını kendisi ele almıyor (`employees/employee-data.ts:376`, `:536`, `:586`).
  - "Daha önce bir yere bağlandı mı" sorusu tarayıcıdan doğrudan tabloya gidiyor (`lib/supabase.ts:163-171`, `account_organization_history`). Bu, `apps/web/CLAUDE.md`'deki izinli istisnalar arasında yok.
- Backlog: BL-898 (eski kapılar); kalanı YENİ.
- leave: low / do: moderate
- Öneri: Fazla sürümler silinip `retired_objects_stay_gone`'a eklensin; kurulum rotaları yeni kapıya, davet istekleri `apiRequest`'e taşınsın.

**D-44 · düşük · Ölü kod**
- Ekranda nerede: Görünmez.
- Örnek: Biri `existingDraft`'ın taslağı koruduğunu sanar; oysa hiçbir yer onu göndermiyor.
- Kanıt:
  - `CreateOrganizationButton.tsx:23-26`, `:40`: `existingDraft` parametresine hiçbir çağıran değer vermiyor.
  - `resolveLanding.ts:105-116`: davet dalları yalnız testte çalışıyor.
  - `UnfinishedSetupRow.tsx:107`: "Open" dalı (bkz. D-41).
  - Kabul ve ret, süresi geçmiş daveti "expired" diye yazıp hemen hata atıyor; hata yazımı geri aldığı için bu satırlar etkisiz (`supabase/schema.sql:485-491`, `:8920-8923`). Yerelde durumu "expired" olan davet 0 (SELECT).
  - `/accept-invite` (D-18); `/organization-switcher`'a giden 4 yer (BL-650).
- Backlog: YENİ (BL-650 ile).
- leave: low / do: safe
- Öneri: Silinsin.

**Kısa dökümler (bulgulara bağlantı)**
- **Ekrana çıkan ham hata metni:** D-06, D-10, D-11, D-12, D-23, D-33 (BL-620, BL-621, BL-647). İyi örnekler: Workspaces, davet sayfası ve "workspace didn't load" sabit sade cümle kullanıyor.
- **Kullanıcı metninde olmaması gereken kelime:** "owner onboarding" (BL-640; sunucu cümleleri D-23). "organization", "tenant", "membership" ekrana çıkmıyor (yalnız kod adlarında).
- **Sessizce düşen veri:** D-22 (gönderilemeyen davetler), D-03 (favori ezilir), D-21 (yeniden açılınca adlar ve liste boş). Formdan API'ye gitmeyen alan bulunmadı. Middle name temizlenince sunucuda da boşalıyor (`schema.sql:6158-6188`).
- **Saat dilimi:** D-34, D-39, BL-634. Davet bitişi ve "Expires in N days" göreli hesaplandığı için saat diliminden etkilenmiyor (`InvitationRow.tsx:43-46`).
- **Yarış durumları:** D-16 (iki sekmede kabul), D-23 (iki sekmede kurulum: sürüm çakışması ham metin; sekmeye dönünce bağlam yenilendiği için ikinci deneme geçiyor), Kanıtlanamayanlar 2 (iki sekmede Create).
- **İlerlemenin kaybı (P10):** D-21, D-25, D-31, D-19.

---

## KARARLAR'a uyum tablosu

| Kural (KARARLAR) | Kodda | Kanıt |
|---|---|---|
| Bekleyen yeni davet her girişte ilk ekranda, A görünümüyle | ✗ yok | D-01; `ProtectedRoute.tsx:19-20` |
| "Not now": tek workspace'te oraya, birden çokta Workspaces'e | ✗ yok | grep 0 |
| Tek workspace'i olan rolüne göre iner | ✓ girişte; ✗ onay sonunda | `resolveLanding.ts:65-75`; D-05 |
| Workspace'i olmayan davetli için sert engel | ✓ (Create gizli, sunucu reddeder) | `WorkspaceHubPage.tsx:324`; `schema.sql:8530-8547` |
| Daha önce işletme kurmuş kişi davet yüzünden durdurulmaz | ✓ girişte ve sunucuda; ✗ Workspaces'te davet varken Create gizli | `schema.sql:8530-8536`; `WorkspaceHubPage.tsx:324` |
| Create: 0 ya da 1 davette görünür; 2 davette ya da 1 davet + yarım kurulumda gizli | ✗ 1 davette gizli | D-35; BL-626 |
| Owner olmadığı bir workspace'te aktif üyesi olan kendi işletmesini açamaz | sunucu ✓; ekran ✗ (düğme görünür, neden yok) | `schema.sql:8549-8560`; D-35 |
| Welcome back: zorla kuruluma sokulmaz | ✓ | `ProtectedRoute.tsx:63-73` |
| Welcome back: davetler ve yarım iş listelenir; "Create" ve "I am waiting for another invitation" | kısmen: liste ✓, ikinci düğme metni ✗ | D-36 |
| Bir kez karşılanmış kişi yeniden "yeni" sayılmaz | ✓ | `WorkspaceHubPage.tsx:59-64`, `:213` |
| Kurulumdan çıkmak vazgeçmek değil; ilerleme kaydedilir | kısmen: adım ve kayıtlar ✓; adlar ve "Added so far" ✗; geri adım ilerlemeyi geri sarıyor | D-21 |
| Yarım kurulumda "Continue setup" ve "Discard" | ✓ (görünen metin "Continue"; ekran okuyucu "Continue setup for …") | `UnfinishedSetupRow.tsx:65-109` |
| Kaybedilecek kişi ya da veri yoksa parola istenmez (varsa istenir) | ✗ hep parolasız | D-24 |
| Discard, Start over'dan ayrı | ✓ | `UnfinishedSetupRow.tsx`; `OwnerOnboardingPage.tsx:794-821` |
| "Create" doğrudan ilk adımı açar | Workspaces ✓; Account ✗ (ad penceresi; sınırda) | `CreateOrganizationButton.tsx:36-50`; `WorkspacesPage.tsx:218-247` |
| terminated listeden düşer | ✓ | `schema.sql:13105-13111` |
| pending ya da suspended görünür, erişim vermez | ✓ (owner olmayan üyenin taslağı hariç, D-41) | `WorkspaceHubPage.tsx:70-76` |
| Aktif üyelik yoksa "no organization" ekranı | ✓ (Workspaces boş hâli) | `WorkspaceHubPage.tsx:159-227` |
| Çalışan kurulumunda reset yok | ✓ | rota ve düğme yok |
| Favori sunucuda, cihazlar arası | ✓ | `user_workspace_preferences`; `schema.sql:19676-19693` |
| İşaretli yoksa tahmin etmez, sorar | ✗ | D-02, D-03 |
| Kurulum bitmeden davet yok | ekran ✓; API ✗ | D-26; BL-419 |
| İlk karşılamada "I am waiting for an invitation" | ✗ "I have an invitation" | D-36 |
| Sign in'de ikinci düğme beyaz | ✓ | `SignInPage.tsx:169-179` |
| `?from=` yalnız aynı origin'deki `/` yoluna, gerisi `/app` | ✓ anlamca (sorgu dizesi değil sayfa geçiş durumu; KARARLAR'daki "`?from=`" ifadesi düzeltilmeli) | `SignInPage.tsx:22-24`, `:195-205` |
| Forgot: aynı metin, sabit ~1,5 sn, 15 dk / saatte 10 | ✓ | `password-reset.ts:12-21`, `:35-36`, `:88` |
| Reset belirteci `#` içinde, Save'de harcanır; en az 8 | ✓ | `ResetPasswordPage.tsx:17-35`, `:49-56`, `:98`; `config.toml:188` |
| Sihirbaz 3. adım: yalnız Management varken cümle ve Continue kapalı | ✓ | `OwnerOnboardingPage.tsx:1305`; testler `:923-955` |
| Sihirbaz 4. adım: Owner işi kilitli, neden ekran okuyucuya | ✓ | `OwnerOnboardingPage.tsx:1748-1777` |
| Telefon: +1 sabit, maske | ✗ çalışan kurulumunda; lokasyonda maske var, "+1" yok | D-29, D-28 |
| Türkçeye özgü harf yasak | ✗ | D-29 |
| Legal name tahminle ya da kopyayla doldurulmaz | belirsiz: davetteki adla dolu | D-32 |
| Middle ve preferred dışındaki bütün alanlar zorunlu | ✓ (şema ve tarayıcı); veritabanı yalnız ad, telefon ve acil kişiyi zorluyor | `index.ts:2834-2856`; `schema.sql:20856-20865` |
| Resmî ad farkını yalnız owner ya da admin onaylar | sınırda (inceleme Employees'te); çalışan tarafı farkı "Done" gösteriyor | D-30 |
| Owner belgeden muaf | sınırda (Documents) | — |
| Daha önce trial kullanan owner yeniden trial alamaz | ✗ her kurulum 14 gün deneme veriyor (sınırda, Billing) | `schema.sql:1274-1297` |

## Test boşlukları

| Akış | Var olan test (dosya) | Eksik |
|---|---|---|
| Sign in ve hesap oluşturma | `views/SignInPage.test.tsx` (9), `auth/AuthContext.test.tsx` (11); e2e `sign-in-lands.spec.ts` (2) | Ham Supabase cümlesinin çevrilmesi; mod geçişinde eski hata (BL-636); paylaşılan cihazda adres (BL-627); e-posta onayından sonraki iniş; hesap oluşturma ve onay için e2e |
| İniş kararı | `auth/resolveLanding.test.ts` (19), `auth/ProtectedRoute.test.tsx` (6), `shell/WorkspaceHubPage.test.tsx` (10) | "Active invitation found" ve "Not now" (iki test tersini kilitliyor: `ProtectedRoute.test.tsx:190`, `WorkspaceHubPage.test.tsx:194`); favori yokken sorma (tersini kilitleyen: `WorkspaceHubPage.test.tsx:168`, `resolveLanding.test.ts:70`); kurulum bitince favorinin korunması (pgTAP yok); onaydan sonra rol bazlı iniş; birden çok workspace'li hesap için e2e |
| Forgot password | `ForgotPasswordPage.test.tsx` (2), `password-reset.test.ts` (15), `account_checks_count_in_the_database.test.sql`; e2e `password-reset.spec.ts` (1) | Ağ hatası ve "Valid email required" metni |
| Reset password | `ResetPasswordPage.test.tsx` (10) | Supabase'in ret cümlesinin çevrilmesi |
| Account recovery | `AccountRecoveryPage.test.tsx` (1), `account_security_deletion_lifecycle.test.sql` | Eksik ya da kesik bağlantı, süresi geçmiş bağlantı metni, yeni bağlantı isteme, sunucu hatasının ayrılması; e2e yok |
| Davet önizleme ve kabul | `AcceptInvitationPage.test.tsx` (5 + 5 durumlu tablo), `invitation-routes.test.ts` (11), `invitation-service.test.ts` (5), `invitations_on_the_core.test.sql`, `invitation_acceptance_needs_a_confirmed_email.test.sql`, `joining_from_two_workspaces.test.sql`; e2e `invite.spec.ts` (2), `employee-onboarding.spec.ts` (2) | Yükleniyor durumu (BL-631); yeniden gönderilen davetin eski bağlantısı (D-14); arşivlenen kayıt (D-15); iki sekmede kabul (D-16); yeni hesapla kabul için e2e (BL-434); Decline için e2e |
| Workspaces ve değiştirici | `WorkspaceHubPage.test.tsx` (10), `InvitationRow.test.tsx` (2), `UnfinishedSetupRow.test.tsx` (1), `WorkspaceSwitcher.test.tsx` (5) | Create görünürlüğü (0 / 1 / 2 davet, yarım kurulum, çalışan); "I am waiting" metni (test eski metni bekliyor: `:118`); Discard'ın başarılı yolu ve sonrasında listede kalması (D-37); çalışan kurulumundan Decline ve sonrası (D-38); hiç e2e yok |
| Owner kurulumu | `OwnerOnboardingPage.test.tsx` (34), `workspace-account-routes.test.ts` (kuruluma ait ~12), `owner_legal_name.test.sql`, `owner_employee_record.test.sql`, `management_owner_job.test.sql`, `workspace_lifecycle.test.sql`; e2e `owner-legal-name-setup.spec.ts` (2) | Kaldığı yerden açınca adlar ve liste (BL-633); geri adımda ilerleme (BL-632); sürüm çakışması metni; gönderilemeyen davetin owner'a söylenmesi (tersini kilitleyen: `workspace-account-routes.test.ts:409`); `reset_owner_onboarding_service` için davranış testi (yalnız yetki sınıflaması var); Discard'da parola koşulu (tersini kilitleyen: `:720`); kurulumun baştan sona (4 adım + Finish) e2e'si |
| Çalışan kurulumu | `EmployeeOnboardingPage.test.tsx` (20), `OnboardingDocumentStep.test.tsx`, `onboarding-service.test.ts` (4), `employee_onboarding_rls.test.sql`, `employee_onboarding_workspace_selection.test.sql`, `onboarding_review_on_the_core.test.sql`, `weekly_onboarding_preferences.test.sql`; e2e `employee-onboarding.spec.ts` (2) | Onay sonrası geçişin hatası (D-31); rol bazlı iniş (D-05); onay beklerken gösterim (BL-646); `leave_employee_onboarding_service` için davranış testi (yalnız sınıflama var); middle name farkı; telefon ve harf kuralı (BL-503) |
| Durum sayfası | `WorkspaceStatusPage.test.tsx` (8) | Açık workspace (BL-639); Discard edilen taslak (D-37); onboarding'den vazgeçen (D-38) |
| Sign out | `AuthContext.test.tsx` (önbellek temizliği, 4) | Çıkıştan sonra taşınan adres (BL-627) |

## Sınırda

- **Account → Workspaces → "Create workspace"** (Ekran 15):
  - Kurulumdan önce ad penceresi açıyor (KARARLAR: arada pencere yok).
  - Görünürlük kuralı Workspaces'tekinden farklı (`WorkspacesPage.tsx:139-141`).
  - Hata metni ham (`:233-238`; numarasız madde `BACKLOG.md:186`).
  - Kişinin yarım bir taslağı varsa sunucu yeni workspace açmıyor; o taslağı açıp adını pencerede yazılanla değiştiriyor (`supabase/schema.sql:8465-8492`). Mert "Beyoğlu" taslağını 2. adımda bıraktıysa ve Account'tan "Kadıköy" yazarsa, "Beyoğlu" sessizce "Kadıköy" olur ve içindeki lokasyonlar kalır. Önem orta, YENİ, leave medium / do safe.
  - Rolden sayfa seçen ikinci iniş yardımcısı (`:1161-1163`; D-04).
- **Davet gönderme rotası:** kurulum kontrolü yok (BL-419, D-26). Send reminder normal davette hata veriyor (BL-767).
- **Onboarding inceleme rotası:** workspace başlığını okumuyor; iki workspace'li müdür, favori olmayan workspace'te inceleme yapamıyor (`apps/api/src/employees/onboarding-routes.ts:175-180`; BL-280 (2), geçerli).
- **Belge adımı:** BL-647, BL-648, BL-649 (Documents).
- **Deneme süresi:** her kurulum bitişi yeni 14 günlük deneme veriyor (`schema.sql:1274-1297`); KARARLAR "daha önce trial kullanan owner tekrar alamaz" (BL-059, Billing).
- **Resmî ad onayının kimde olduğu, davette belge muafiyeti:** Employees (KARARLAR 90, 95-100; BL-825).

## Kanıtlanamayanlar

1. **D-17'deki ikinci başlatma çağrısının gerçekten hata verdiği an** ölçülmedi. Hata vermesi için kişinin en eski üyeliğinin, kurulumu bitmemiş ya da kapanış tarihi geçmiş bir workspace'te aktif olması gerekir. Yerel veride bu durum aranmadı.
2. **İki sekmede aynı anda "Create your workspace":** sunucu iki isteği sıraya koyuyor, ikincisi ilk taslağı açıp adını "New workspace" yapıyor (`schema.sql:8465-8492`). İlk sekme 1. adımı kaydettiyse adın ezilip ezilmediği zamana bağlı; denenmedi.
3. **Onay bekleyen davet, kapanış tarihi geçmiş bir workspace'teyse** Workspaces'teki Join, workspace'in durumuna bakmadan kabul ediyor gibi görünüyor (`schema.sql:457-591`). Davet sayfası ise "isn't open right now" diyor. Uç durum; yerel veride örnek aranmadı.
4. **Hosted (canlı) ortamda e-posta onayı ve dönüş adresi:** yerel `config.toml` okundu; canlı ayarlar ölçülmedi (BL-336 notuyla aynı).
5. **BL-642'nin CSS satırları ve 390 px görünüm** bu turda ölçülmedi (C raporunun alanı).
6. **D-15 ve D-38 için yerel veride örnek yok** (SELECT'ler 0 döndü); iki bulgu yalnız kod okumasıyla kanıtlı.

## Kullanılan SELECT'ler (yerel DB, salt okuma)

- `select count(*) … from public.employee_onboarding_cases … where m.role = 'owner'` → 35 vaka, hepsi `approved` (owner'a yanlışlıkla açılmış açık vaka yok).
- `select … from public.onboarding_events where action = 'onboarding.left'` → 0.
- `select … from public.employee_invitations i join public.employee_profiles e … where i.status = 'pending'` → 21 bekleyen davet; arşivli ya da hesabı bağlı kayda ait 0. Durum dağılımı: pending 21, accepted 2108, revoked 4 (`expired` ve `declined` 0).
- `select * from app_private.authz_actions where key in ('employee.invite', 'workspace.setup', 'onboarding.self')` → `employee.invite`'ta kurulum şartı yok.
- `select … app_private.authz_reason(owner, taslak, 'workspace.setup', …)` → izin var (taslak owner'a açık).
- `select … from public.workspaces where lifecycle_status = 'deleted'` → "New workspace", kurulumu bitmemiş, owner üyeliği askıda.
- `begin; select … from lateral public.list_my_workspaces_service(<o owner>); rollback;` → `Meyhouse | active` ve `New workspace | suspended | incomplete | deleted`.

API'ye okuma istekleri (yerel API, port 5633):
- `POST /v1/invitations/preview` (40 karakterlik uydurma belirteç) → 404 `{"error":"This invitation is no longer open","code":"invitation_not_found"}`.
- `POST /v1/invitations/preview` ("short") → 400 `{"error":"Valid invitation token required"}`.
- `GET /v1/context` ve `GET /v1/account/workspaces` (oturumsuz) → 401 `{"error":"Bearer token required"}`.
