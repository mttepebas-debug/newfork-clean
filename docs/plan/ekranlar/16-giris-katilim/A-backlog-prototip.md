# Ekran 16: Giriş ve katılım. Keşif A: backlog ve prototip

Ölçüm tarihi 2026-10-07, `origin/main` `fb9ced47`. Kod `newfork-wt/ekran-16` worktree'sinden okundu. Yerel veritabanında son migration `20261007130000` ve bu sürüm main ile aynı; yerel DB'de yalnız SELECT koştu. Ağır koşu (test, build, e2e) yapılmadı. Satır numaraları bu commit'e göredir.

`9146ba6b` ile `fb9ced47` arasında bu ekranın dosyalarında tek değişiklik var: `employee-directory-*`. Bu dosyalar ekran 3'e ait. Bu aralıkta davet, kurulum, giriş ya da parola fonksiyonlarına dokunan migration da yok. Bu yüzden 2026-10-06 tazelik hükümleri bugün de geçerli; önemli satırların hepsi yine de elle yeniden okundu.

## Ekranın sınırı

- **İçeride**
  - Sign in ve hesap oluşturma modu (`views/SignInPage.tsx`), Forgot password, Reset password, Account recovery.
  - Davet kabulü: `/invite/accept` ve `/accept-invite` (`employees/AcceptInvitationPage.tsx`).
  - Workspaces merkezi `/workspaces` (`shell/WorkspaceHubPage.tsx`, `InvitationRow`, `UnfinishedSetupRow`, `CreateOrganizationButton`) ve emekli üç yönlendirme (`App.tsx:198-205`).
  - `/workspaces/status` sayfası ve "Almost ready" ekranı (`WorkspaceSetupPending`).
  - Girişten sonra nereye inileceğinin kararı: `auth/resolveLanding.ts`, `ProtectedRoute.tsx`, `AuthContext.tsx`.
  - Owner kurulum sihirbazı (`views/OwnerOnboardingPage.tsx`).
  - Çalışan kurulumu: `/welcome` ve `/welcome/:id` (`EmployeeOnboardingPage.tsx`, `WelcomeRedirect.tsx`).
  - Çıkış (Sign out).
  - Bunlara hizmet eden API uçları (`app.ts:543-770` davet uçları, `account/password-reset.ts`, `account/account-security-routes.ts` kurtarma uçları, `/v1/context`) ve veritabanı fonksiyonları (`create_owner_workspace_service`, `resolve_workspace_context_service`, `apply_owner_onboarding_update`, davet servisleri).
- **Dışarıda:** Account sayfaları (ekran 15), Employees → davet gönderme ve onboarding onayı (ekran 3), Documents (ekran 6), yasal sayfalar (ekran 17), Billing (ekran 18), Settings.
- **Sınırda:** §5'te liste var.

## 1) Açık backlog maddeleri

Sütunlar: önem, ekranda nerede, isimli örnek, tazelik hükmü, kanıt, işaret. Hükümlerin hepsi 2026-10-07 tarihli ve `fb9ced47` commit'ine göredir.

| BL | Kısa ad · nerede · örnek | Önem | Tazelik | Kanıt | leave / do |
|---|---|---|---|---|---|
| BL-624 | "Active invitation found" ekranı yok. Yer: Sign in → giriş sonrası. Ali Meyhouse'ta çalışıyor, Sunset Tacos onu davet etti. Giriş yapınca doğrudan Meyhouse'a iner, daveti görmez. | yüksek | geçerli (satır kaydı) | Daveti iki yer atlıyor. (1) Sign in, varsayılan ya da tek workspace yüklüyse doğrudan uygulamaya gönderiyor (`SignInPage.tsx:43` → `App.tsx:595`). (2) Merkez de daveti atlıyor (`resolveLanding.ts:121`). Bilerek yapılmış: yorum `ProtectedRoute.tsx:17-18`. | high / moderate |
| BL-625 | Varsayılan workspace işaretli değilse sistem tahmin ediyor. Yer: Sign in → Workspaces. Test Manager iki workspace'te, varsayılanı yok; dün açtığı Ridgeline'a sorulmadan iner. | orta | geçerli | `WorkspaceHubPage.tsx:95-101`: koşulun adı `onlyOne` ama kod `ready.length >= 1` diyor. Seçim "en son kullanılan"a göre (`resolveLanding.ts:149-158`). Sunucu yalnız işaretli varsayılanı ya da tek aktif üyeliği seçiyor (`20260925014408:31-37`); boşluğu web dolduruyor. | medium / moderate |
| BL-626 | "Create your workspace" düğmesi kurala uymuyor. Yer: Workspaces → Your own workspace. Ali Meyhouse'ta çalışan; düğmeye basar, "Workspace could not be created" görür. | orta | geçerli | Web'deki koşul `WorkspaceHubPage.tsx:324`. SELECT: `create_owner_workspace_service` başkasının workspace'inde aktif üyesi olanı 'workspace owner access required' ile reddediyor. KARARLAR'daki çelişki §3'te. | medium / safe |
| BL-627 | Paylaşılan tablette yeni giren kişi bir öncekinin son sayfasına iniyor. Yer: Sign out → Sign in. Ayşe Settings → Roles'tayken çıkar; Ali girince oraya düşer. | orta | geçerli | `ProtectedRoute.tsx:25-31`, `SignInPage.tsx:22-24` | medium / safe |
| BL-628 | Giriş hataları ham İngilizce; "Email not confirmed" çıkınca onay e-postasını yeniden isteme yolu yok. Yer: Sign in. Ali yanlış parolada "Invalid login credentials" okur. | orta | geçerli. Yeniden gönderme kısmı Mert'in kararını bekliyor. | `AuthContext.tsx:265`, `:289` | medium / moderate |
| BL-629 | Kurtarma bağlantısı eksikse düğme sessizce kapalı. Yer: Account recovery. Burak bağlantıyı kesik kopyalar, "Restore my account" soluk kalır. | orta | geçerli | `AccountRecoveryPage.tsx:59` | medium / safe |
| BL-630 | Kurtarma bağlantısının süresi geçince "Valid recovery token required" yazıyor. Yer: Account recovery. Burak bağlantıya 15. gün basar. | orta | geçerli | `account-security-routes.ts:177`, `:184` | medium / safe |
| BL-631 | Davet sayfası yüklenirken yanlış metinle açık bir Accept düğmesi gösteriyor. Yer: davet bağlantısı. Emre yavaş bağlantıda "this workspace" yazısını görür. | orta | geçerli | `AcceptInvitationPage.tsx:52-53`, `:172` (yüklenirken durum "valid" sayılıyor) | medium / safe |
| BL-632 | Önceki adımda kayıt yapmak ilerlemeyi geri sarıyor. Yer: kurulum sihirbazı. Mert Team adımından Locations'a döner, lokasyon ekler, panel "1 of 4" gösterir. | orta | geçerli | `OwnerOnboardingPage.tsx:411`, `:510`. SELECT: `apply_owner_onboarding_update` gövdesinde `current_step = next_step` var, `greatest(` yok. | medium / moderate |
| BL-633 | Sihirbaz kaldığı yerden açılınca resmî adı ve "Added so far" listesini unutuyor; Start over listeyi temizlemiyor. Yer: kurulum sihirbazı. | orta | geçerli | `:130-132`, `:155`, `:794-821` (bu blokta `setAddedTeam` yok) | medium / moderate |
| BL-634 | Posta kodundan saat dilimi önerisi hiç çalışmıyor. Yer: kurulum → Locations. Mert İstanbul'dan Palo Alto'yu kurar; dilim Europe/Istanbul kalır. | orta | geçerli | `:76` (`browserTimeZone()`), `LocationTimezoneField.tsx:7` | medium / safe |
| BL-636 | Sign in ile Create account arasında geçince eski hata kalıyor. | düşük | geçerli | `SignInPage.tsx:172`, `AuthContext.tsx:259`, `:281` | low / safe |
| BL-637 | Forgot password ağ hatasında "Failed to fetch" diyor. | düşük | geçerli | `ForgotPasswordPage.tsx:21-25` | low / safe |
| BL-638 | Reset password Supabase'in ham cümlesini gösteriyor. | düşük | geçerli | `ResetPasswordPage.tsx:60-62` | low / safe |
| BL-639 | Açık workspace'in durum adresi "isn't open to you" diyor (yalnız adres elle yazılınca). | düşük | geçerli | `WorkspaceStatusPage.tsx:111-116` | low / safe |
| BL-640 | Team adımında geliştirici cümlesi: "Invite delivery waits until owner onboarding is completed." | düşük | geçerli | `OwnerOnboardingPage.tsx:1876` | low / safe |
| BL-641 | Başarı mesajı adım değişince kalıyor ("Location added" Workspace adımında görünüyor). | düşük | geçerli | `:983`, `:1103`, `:1371`, `:1481` | low / safe |
| BL-642 | Team adımındaki onay kutuları yazının altında duruyor. | düşük | geçerli (piksel ölçülmedi) | `styles.css:11528` kuralı `:11541` kuralını eziyor | low / safe |
| BL-650 | Emekli `/organization-switcher` adresine 4 yer gidiyor. Yer: sihirbaz → Switch workspace. | düşük | değişmiş (2026-10-06 notundaki gibi) | `OwnerOnboardingPage.tsx:884`, `WorkspaceSetupPending.tsx:37`, `WelcomeRedirect.tsx:25`, `account/WorkspacesPage.tsx:344` | low / safe |
| BL-151 | Sihirbazın telefon yerleşimi. Mert telefonda kurulum yaparken Sign out'a ulaşamaz. | düşük → **orta önerilir** | geçerli, genişledi | Üst boşluk: `prebiz.css:508-510`, `styles.css:12530-12533` (içerik kutusu 302 px, üstte fazladan 54 px). Yeni bulgu (PHONE-AUTH F1): kişinin birden çok workspace'i varsa çubuk tek satır kalıyor, Sign out 390 px ekranın dışına taşıyor (`prebiz.css:526-530`). | low→medium / safe |
| BL-215 | Sihirbazda ham renk kodu `#596672`. | düşük | geçerli | `styles.css:782` | low / safe |
| BL-285 | Forgot password ve Account recovery'de Privacy/Terms bağlantıları yok; recovery ekranı geniş çerçevede. | düşük | geçerli | `ForgotPasswordPage.tsx`, `AccountRecoveryPage.tsx:32`: aramada bağlantı sayısı 0, çerçevede `narrow` yok | low / safe |
| BL-286 | Giriş öncesi ekranlarda beyaz düğmenin kenarı soluk. | düşük | geçerli | `prebiz.css:246-248` | low / safe |
| BL-289 | Forgot password gönderilince odak sayfanın başına düşüyor (ekran okuyucu cevabı duymaz). | düşük | geçerli | `ForgotPasswordPage.tsx:1`: yalnız `useState`, odak taşıma yok | low / safe |
| BL-336 | Davet bağlantısının anahtarı (token) e-posta onayı sırasında kayboluyor. Ayşe davetten hesap açar, onaylar; davete dönüp dönmediği bilinmiyor. | orta | geçerli (kodda; canlı akış ölçülmedi) | `AuthContext.tsx:205-208`: `signUp` dönüş adresi (`emailRedirectTo`) vermiyor. Token saklama kodu yok. | medium / moderate |
| BL-351 | Davet ve kurtarma bağlantılarındaki anahtar adres çubuğunda (`?token=`) taşınıyor. | orta | geçerli | `invitation-service.ts:108`, `:173`, `:224`; `employee-create-service.ts:54`; `account-security-service.ts:226`; `account-deletion-worker.ts:131` | medium / moderate |
| BL-389 | Merkezde davet kabul edilince Account rozeti yenilenmiyor. | düşük | geçerli | `InvitationRow.tsx:19-25` | low / safe |
| BL-434 | Davetlinin yeni hesap açıp kabul ettiği yolun uçtan uca (e2e) testi yok. | orta | geçerli | `e2e/flows/invite.spec.ts` yalnız hesabı zaten olan kişiyi sınıyor | medium / safe |
| BL-481 | Sihirbazda Management satırında Remove düğmesi etkin. | orta | **değişmiş** | KARARLAR.md:84 Management'ın adını değiştirmeye izin veriyor, yani Rename doğru. Kusur yalnız Remove'da (`:1248-1268`, yalnız `disabled={submitting}`). | medium / safe |
| BL-490 | Kurulumu tamamlama reddi ipucu taşımıyor. | düşük | geçerli | `20261002000000:575`: `23514`, ipucu yok | low / safe |
| BL-620 | Kurulumda ham teknik hata metni çıkıyor. Mert ikinci kez "Kitchen" ekler, "duplicate key…" okur. | orta | geçerli, sihirbazda da | `organization-data.ts:57`; `EmployeeOnboardingPage.tsx:1144`. Ek: sihirbaz sunucu cümlesini her yerde basıyor (`OwnerOnboardingPage.tsx:339`, `:426`, `:452`, … `saveError.message`). | medium / moderate |
| BL-621 | Çalışan kurulumunda zod'un varsayılan mesajları görünüyor. | orta | geçerli | `EmployeeOnboardingPage.tsx:591` | medium / moderate |
| BL-622 | İki kurulumda kişinin yazdığı cevap kalın görünüyor. | orta | geçerli | `styles.css:2780-2784`, `:11220` (750), `:860` | medium / safe |
| BL-645 | "Open the step marked Needs changes" diyor ama satırlarda böyle bir işaret yok. | orta | geçerli | `EmployeeOnboardingPage.tsx:918` | medium / safe |
| BL-646 | Resmî adın onay beklediği söylenmiyor, adım "Done" görünüyor. | orta | geçerli. Mert'in kararını bekliyor. | `:244`, `:900` | medium / safe |
| BL-007 | "Yedi adımlı onboarding ve otomatik taslak kaydı". | orta | **değişmiş** | Sihirbaz bugün 4 adım ve her adım kaydediliyor. "Yedi adım"ın neyi kapsadığı hiçbir yerde tanımlı değil. Bu turda ya tanımlanmalı ya kapanmalı. | medium / belirsiz |
| BL-382 | SSN kalıntısı: çalışan kurulumu API'sinde 410 dönen bir uç kalmış. | orta | geçerli | `onboarding-routes.ts:68` (Privacy cümlesi ekran 17'nin) | medium / moderate |
| BL-419 | Taslak workspace'ten API ile davet gönderilebiliyor (KARARLAR "kurulum bitmeden davet yok" diyor). Mert "Beyoğlu"nu kurarken API'den Ali'yi davet edebilir. | düşük | geçerli | `app.ts:543`. SELECT: `prepare_employee_invitation_service` kurulum durumuna bakmıyor; `workspace_open_to_actor` taslağı owner'a açık sayıyor. | low / moderate |
| BL-071 | Kullanılmayan `invited` üyelik durumu tanımda duruyor. | düşük | geçerli | SELECT `enum_range`: `{active,invited,suspended,pending_activation,removed}` | low / risky |
| BL-357 | Kurtarma e-postası düşerse kişi 15 dakika yeniden isteyemiyor. | düşük | geçerli | `20260929170000:185` | low / safe |
| BL-358 | Parola sıfırlama sayacı e-postayı tuzsuz özetle saklıyor. | düşük | geçerli | `password-reset.ts:62` | low / safe |
| BL-359 | Oturumsuz parola sıfırlama fonksiyonu yetki kataloğunda `account.self` olarak sınıflanmış. | düşük | geçerli | `authorization_coverage.test.sql:38` | low / safe |
| BL-384 | Account rotalarında 27 yerde kendi 401 cevabı var. | düşük | geçerli | aramada 11 + 16 | low / safe |
| BL-404 | Test dünyasında parolasız hesapla girişte 500 dönüyor. | orta | geçerli (dosya değişmedi) | `builder.sql:111-116` | medium / moderate |
| BL-568 | Bitmiş onboarding'lerde çalışan olmayanların eski Availability adımları duruyor. | düşük | geçerli | SELECT: 653 satır | low / safe |
| numarasız (BACKLOG.md:182) | Onaydan sonra "Finishing up" ekranında takılma; hata yakalama ve yeniden deneme yok. Orhan'ın onboarding'i onaylanır, sayfa yenilenemezse ekran öyle kalır. | orta | geçerli | `EmployeeOnboardingPage.tsx:62-71`, `:84`, `:118` | medium / safe |
| numarasız (BACKLOG.md:178) | Taslak workspace'teki aktif müdür Workspaces'te o workspace'i hiç görmüyor. | düşük | geçerli (kodda; yerelde böyle üye yok) | `WorkspaceHubPage.tsx:70-72`. SELECT: 0 satır | low / safe |
| numarasız (BACKLOG.md:167) | Örnek veride "Pending Demo"nun onboarding kaydı yok. | düşük | geçerli | SELECT: 1 satır | low / safe |
| numarasız (BACKLOG.md:171) | Giriş ekranlarının telefon turu. | düşük | değişmiş | Prototipte yapıldı (PHONE-AUTH); gerçek uygulamaya kalan iş BL-151 ve YENİ-5 | low / safe |

**YENİ bulgular (backlog'da yok)**

| # | Bulgu · nerede · örnek | Önem | Kanıt | leave / do |
|---|---|---|---|---|
| YENİ-1 | Karşılama ekranındaki ikinci düğme "I have an invitation" diyor; KARARLAR "I am waiting for an invitation" diyor (Welcome back ekranında "…another invitation"). Yer: Workspaces boş hâli. Jordan ilk girişte bu düğmeyi görür. | orta | `WorkspaceHubPage.tsx:223`, test `WorkspaceHubPage.test.tsx:118`, KARARLAR.md:250 | medium / safe |
| YENİ-2 | Yarım kurulum satırındaki düğme merkezde "Continue", Profile'da "Continue setup". KARARLAR "Continue setup" diyor. | düşük | `UnfinishedSetupRow.tsx:107` ve `ProfilePage.tsx:592` | low / safe |
| YENİ-3 | Asıl iniş kararı veren fonksiyonun ilk iki kuralı (davet bağlantısı, bekleyen davet sayısı) hiçbir yerden beslenmiyor, yalnız testlerde çalışıyor. "Her giriş buna sorar" yorumu da doğru değil: Sign in bu fonksiyona sormadan uygulamaya gidiyor. BL-624 yapılınca karar tek yerden verilmeli. | düşük | `resolveLanding.ts:22-27`, `:94-115`; çağıranlar yalnız `WorkspaceHubPage.tsx:107`, `:128` ve `WorkspaceSwitcher.tsx:90`; `SignInPage.tsx:43` | low / safe |
| YENİ-4 | `/accept-invite` ikiz rota: hiçbir yer bu adresle bağlantı üretmiyor (CLAUDE.md §2.A.4 ikiz sistem yasağı). | düşük | `App.tsx:188`. Üreticilerin hepsi `/invite/accept` kullanıyor (aramada 4 üretici). | low / safe |
| YENİ-5 | Telefonda sihirbazın Jobs ve Team adımları ekrana sığmıyor, sayfa yana kayıyor. Mert telefonda iş eklerken sayfayı yana kaydırır. | orta | PHONE-AUTH F3: Jobs adımı 430 px, ekran 390 px; ölçüm `6358125b`'de alındı, o zamandan bu yana kod aynı. `styles.css:11271-11290`, `:11490-11492`. Piksel bugün ölçülmedi. | medium / safe |
| YENİ-6 | Workspace oluşturmanın iki reddi "hayır" sözleşmesine uymuyor: hata kodu 42501 ama `authz.*` ipucu yok (CLAUDE.md §2.A.2). | düşük | SELECT `create_owner_workspace_service`: 'pending invitation must be resolved first' ve 'workspace owner access required', ikisinde de hint yok | low / moderate (R3) |
| YENİ-7 | KARARLAR'da eskimiş satır: "Bekleyen: Supabase'in sınırı 6 (BL-161)". BL-161 kapandı ve yerel ayar 8. Düzeltmek koordinatörün işi. | düşük | KARARLAR.md:330-332; `supabase/config.toml:188` `minimum_password_length = 8` | low / safe |

## 2) Prototip farkları

Kaynaklar: `newfork-prototype/KANONIK.md`; denetim dosyaları `proto-audit/Q1.md`, `Q2.md`, `Q3.md`, `Q4.md`, `PHONE-AUTH.md`. Prototipe yazılmadı.

| Fark | Prototipte | Uygulamada | Öneri | Dayanak |
|---|---|---|---|---|
| Girişte "Active invitation found" (Q2 H20–H22, PHONE I1, L1–L3) | Görünüm A: liste, Join / Decline, "Not now" ve nereye gideceği; workspace'i olmayanda Not now yok | Yok (BL-624) | **taşı** | KARARLAR "Girişten sonra yönlendirme" ve "Davetin önceliği"; Mert 2026-10-05, varyant A |
| Varsayılan işaretli değilse sor (H23–H24, L4) | Birden çok workspace'te Workspaces'e gider; tek workspace'te doğrudan iner | En son kullanılana iner (BL-625) | **taşı** | KARARLAR "Favori workspace" |
| Create görünürlüğü (H16) | Başka workspace'te aktif çalışan düğmeyi görmez | Görür, sunucu reddeder (BL-626) | **taşı** | KARARLAR "Kendi işletmesini açma" |
| Create görünürlüğü, 1 davet varken (H17) | Bir workspace'in sahibiyse görünür | Gizli | **taşı ama önce Mert'e sor** (§3'teki çelişki) | KARARLAR "Create … görünürlüğü" ile "Davetin önceliği" çelişiyor |
| Karşılama düğmesinin metni (H10, W4) | "I am waiting for an invitation" / "…another invitation" | "I have an invitation" (YENİ-1) | **taşı** | KARARLAR, Mert 2026-10-05 |
| Owner'ın yarım kurulum satırı (H1b, W5) | "Continue setup" | "Continue" (YENİ-2) | **taşı** | KARARLAR "Kurulumdan çıkmak vazgeçmek değildir" |
| Merkezde kapanış tarihi ve sahiplik devri rozetleri (H8) | Gri ve amber rozetler | Yok; yalnız Account → Workspaces'te var | **varyant gerekir** | yok — yeni karar (P02, P04) |
| Giriş, sıfırlama ve kurtarma hata cümleleri (Q1 S9–S12, S17, F4, F6, R6, A5) | Sade cümleler, ör. "The email or password is incorrect.", "Couldn't reach Newfork…" | Ham Supabase ve API metni (BL-628, BL-630, BL-637, BL-638) | **taşı** | ILKELER P21; koordinatör kararı PROTO-X-KARAR 2026-10-05 |
| Sign in / Create account geçişinde hata temizlenir (S14) | Temizlenir | Kalır (BL-636) | **taşı** | hata düzeltmesi |
| Forgot password'de odak başlığa gider (F8) | Evet | Hayır (BL-289) | **taşı** | CLAUDE.md §2.A.8 (erişilebilirlik) |
| Kurtarma ekranında neden ve yol; dar çerçeve ve güven bağlantıları (Q1 D5, D7) | Var | Yok (BL-629, BL-285) | **taşı** | P10, P21 |
| Paylaşılan cihazda kişi yalnız kendi çıktığı sayfaya döner (S22) | Doğru | Yanlış (BL-627) | **taşı** | hata düzeltmesi |
| Davet sayfası yükleniyor anı (A12) | Yanlış metin hiç görünmez | Yanlış metin ve açık Accept (BL-631) | **taşı** | P11 |
| Bekleme sırasında dönen simge, 160 ms geçişler, düğmede basma hissi, ilerleme çubuğu animasyonu (Q1 X1–X2, Q2 G1, Q3 S2, Q4 F4–F5) | Var | Yok | **bırak** | P03 (görünüm turunda yalnız Mert'in listesi), P04 |
| Sihirbazda cevap yazısı normal kalınlıkta (Q3 1.6, Q4 P3) | 400 | 750 / 700 (BL-622) | **taşı** | §2.A.7 tutarlılık |
| Onay kutuları yazının hizasında (Q3 4.2) | Hizada | 8 px aşağıda (BL-642) | **taşı** | §2.A.7 |
| "Invite delivery waits…" satırı (Q3 4.3) | Kaldırıldı | Duruyor (BL-640) | **taşı** | P20, P21; PROTO-X-KARAR-2 |
| Telefon alanında sabit gri +1 (Q3 4.3, Q4 P17) | Sihirbazda ve çalışan kurulumunda | Sihirbazda maske var ama +1 yok (`OwnerOnboardingPage.tsx:1687-1697`); çalışan kurulumunda maske de yok, serbest metin (`EmployeeOnboardingPage.tsx:661`, `:743`, `minLength 7`) | **taşı** | KARARLAR "Telefon", Mert 2026-10-05; BL-503 |
| Türkçeye özgü harf yasağı (Q3 Q1, Q4 P17) | Bütün metin alanlarında | Yok (`packages/shared`'de arama sonucu 0) | **taşı** | KARARLAR "Harfler", P12, BL-503 |
| Team adımında e-posta tekilliği, yazarken uyarı (Q3 Q2) | Var | Yok | **taşı** | KARARLAR "E-posta tekil", BL-503 |
| Aynı adla ikinci departman ya da iş (Q3 3.11) | "A department called X already exists." | Ham veritabanı metni (BL-620) | **taşı** | P21 |
| Çalışan kurulumunda sade doğrulama cümleleri (Q4 P8, A4) | Var | zod metni (BL-621) | **taşı** | P21 |
| "Needs changes" rozeti adımda (Q4 R2) | Var | Yok (BL-645) | **taşı** | P10 |
| Resmî ad "In review" (Q4 P13, R11) | Var | "Done" (BL-646) | **taşı ama önce Mert'e sor** (BL-646'nın kararı açık) | P10; karar bekliyor |
| "Save reason" kaydedilince geri bildirim (Q4 D10) | "Saved. Your manager sees it…" | Hiçbir şey | **taşı** (küçük) | P10 |
| Belge sayfası yerleşimi: Continue çubuğu, Reason kutusu, ret gerekçesi ikonu (Q4 D2, D9, D11) | Düzgün | Kusurlu (BL-649) | **taşı** | §2.A.7 |
| Politika onay kutusu 18 px ve yeşil (Q4 D13) | Var | Tarayıcının 13 px kutusu | **varyant gerekir** | P04 |
| Preferred name onay modunun metinleri (Q4 P18) | Var | Ad her alan gibi kaydediliyor | **taşı**. Sunucunun bu modu uygulayıp uygulamadığı ölçülmedi. | KARARLAR "Preferred name" |
| Telefonda sihirbaz çubuğu üç satır, içerik 342 px, Jobs ve Team sığıyor (PHONE O2, O3, O9) | Var | Sign out ekran dışında, 302 px içerik, yana kayma (BL-151, YENİ-5) | **taşı** | CLAUDE.md §1 ("telefonda çalışır") |
| Telefonda adım başlığının üst boşluğu (PHONE O4) | 94 px tutuldu | 94 px | **varyant gerekir** | Mert 2026-09-26: BL-151 (2) için varyant |
| Telefonda 44 px düğme ve dokunma alanı (PHONE G4, G5) | 44 px | 36 px | **varyant gerekir** | P04; telefon düğme kuralı yok |
| Departman seçici liste kutusu (Q3 3.5) | Özel liste kutusu | Tarayıcının seçicisi | **bırak** | prototipin teknik sınırı |

## 3) KARARLAR'da olup kodda olmayanlar

| Kural (KARARLAR) | Kodda | Kanıt / eksik |
|---|---|---|
| Bekleyen davet her girişte ilk ekranda, görünüm A (satır 226) | **yok** | BL-624. Sign in → `App.tsx:595`; davet yalnız Workspaces'te ve üst çubuktaki workspace seçicide (`WorkspaceSwitcher.tsx:48-62`). |
| "Not now": tek workspace → oraya, birden çok → seçim ekranı (227) | **yok** | Ekran yok |
| Tek workspace'i olan rolüne göre iner (228) | **var** | `resolveLanding.ts:64-75`, `App.tsx:595`; e2e `sign-in-lands.spec.ts` |
| Davetin önceliği: workspace'i olmayan için sert engel (229) | **kısmen** | Merkez davet varken Create'i gizliyor (`:324`); sunucu da reddediyor (YENİ-6). Ayrı bir engel ekranı yok. "Daha önce işletme kurmuş kişi durdurulmaz" kuralı eksik: sunucu yalnız şu an aktif owner olanı muaf tutuyor; owner'lığı kapanmış eski kurucuyu davet varken reddediyor (SELECT). |
| Create görünürlüğü: 0–1 davette görünür (230-233) | **farklı** | 1 davette gizli (`:324`). Ayrıca kuralın kendisi "Davetin önceliği" ve sunucu kuralıyla çelişiyor: workspace'i olmayan, 1 daveti olan kişi Create'i görmeli mi? **Mert'e sorulmalı.** |
| Başkasının workspace'inde aktif üye kendi işletmesini açamaz (234) | **sunucuda var, ekranda yok** | Sunucu reddediyor (SELECT); düğme yine görünüyor (BL-626) |
| Welcome back: davetleri ve yarım işi listeler, "Create" ve "I am waiting for another invitation" sunar (235-238) | **kısmen** | "Welcome back" başlığı yalnız tamamen boş hesapta çıkıyor (`:206-227`). Davet ya da yarım iş varsa başlık "You have an invitation" ve Create gizli. Düğme metni yanlış (YENİ-1). "Bir kez karşılanan yeniden yeni sayılmaz" kuralı var (`:213`, `account_organization_history`). |
| Kurulumdan çıkmak vazgeçmek değildir; Continue setup ve Discard; kayıp yoksa parola yok (239-241) | **kısmen** | Exit setup, Discard ve Start over var. Düğme etiketi "Continue" (YENİ-2). "Kayıp yoksa parola yok" şartı kodda "her yarım kurulumda parola yok" olarak uygulanıyor (BL-284, `workspace-account-routes.ts:559-578`; sınırda). |
| "Create" doğrudan kurulumun ilk adımını açar (242) | **var** | `CreateOrganizationButton.tsx:121` |
| Üyelik durumları: terminated listeden düşer; pending ve suspended görünür ama erişim vermez; aktif üyelik yoksa "no organization" ekranı (243-246) | **kısmen** | Arşivlenmiş kişi listeden düşüyor (`20260922130000:413-420`). Askıdaki workspace "No longer open to you" altında görünüyor. Boş hesap için ekran var. Eksik: taslak workspace'teki aktif müdür hiç görünmüyor (`:70-72`). |
| Çalışan kurulumunda sıfırlama yok (247) | **var** | Ekranda ve API'de reset yok. `reset_employee_onboarding_for_rehire` yalnız sistemin yeniden işe alım yolu; tarayıcı kullanıcısı çalıştıramıyor (`has_function_privilege` = f). |
| Favori workspace sunucuda saklanır (248) | **var** | `user_workspace_preferences.active_workspace_id`; Account → Workspaces → "Set as default" (sınırda) |
| Favori işaretli değilse tahmin yok, her girişte sor (248) | **yok** | BL-625 |
| Kurulum bitmeden davet yok (249) | **yok (API'de)** | BL-419 |
| "I am waiting for an invitation" (250) | **yok** | YENİ-1 |
| Giriş ekranları: ikinci düğme beyaz; dönüş adresi yalnız aynı siteden (322-325) | **var** | `SignInPage.tsx:169-178`, `:195-205` |
| Forgot password her adrese aynı cevabı ~1,5 sn'de verir; hız sınırı (326-331) | **var** | `password-reset.ts:37-38`; e-postaya 15 dakikada 1, adrese saatte 10 (sunucu kodunun yorumu) |
| Reset belirteci `#` parçasında taşınır ve Save'de harcanır; parola en az 8 (331-332) | **var** | `ResetPasswordPage.tsx:10-32`, `:98`, `:111`; `config.toml:188` = 8. KARARLAR'daki "Bekleyen 6" satırı eskimiş (YENİ-7). Canlı Supabase ayarı ölçülmedi. |
| Sihirbaz 3. adım: Management cümlesi, Continue kapalı (336-339) | **var** | `OwnerOnboardingPage.tsx:1305` |
| Sihirbaz 4. adım: Owner işi kilitli (340-344) | **var** | `:1747` |
| Telefon başında sabit +1, owner ve çalışan kurulumunda (264) | **yok** | §2'deki telefon satırı; BL-503 |
| Harf kuralı ve e-posta tekilliği (Form kuralları) | **yok** | BL-503 |
| Legal name'i davette employer girer, kişi kendisi yazar; resmî ad farkını owner ya da admin onaylar (90, 268-270) | **var (onay)**; kişiye söylenmiyor | BL-646 |
| Giriş ve hesap kurtarma: bağlantı 1 saat; e-posta Resend'den gider (177-181) | **kodda var, canlıda yok** | `password-reset.ts`. Canlıda `RESEND_API_KEY` tanımlı değil, yani davet ve sıfırlama e-postaları gitmiyor (BL-027; 2026-10-06 ölçümü, bugün ölçülmedi). |

## 4) Eski ölçümlerin bugünkü hâli (hafıza notu, 2026-09-21 denetimi)

| Eski ölçüm | Bugün | Kanıt |
|---|---|---|
| İniş kararı en az 8 yerde, tek bir karar fonksiyonu yok | **değişmiş** | Tek fonksiyon var (`resolveLanding.ts`). Ama giriş anında hâlâ iki yol var: Sign in varsayılan workspace yüklüyse fonksiyona sormadan `/app`'a gidiyor (`SignInPage.tsx:43` → `App.tsx:595`). Fonksiyonu yalnız merkez ve workspace seçicisi çağırıyor; ilk iki kuralı ölü (YENİ-3). Başka yönlendirmeler: `ProtectedRoute.tsx:61`, `:72`; `WelcomeRedirect.tsx:22-26`; `EmployeeOnboardingPage.tsx:70`; `AcceptInvitationPage.tsx:141`. |
| Yarım kurulum `/onboarding`'e zorlanıyor | **bayat** | `ProtectedRoute.tsx:72` merkeze gönderiyor; Continue / Discard merkezde (`UnfinishedSetupRow.tsx`) |
| Merkez üç rotaya bölünmüş | **bayat** | Tek `/workspaces`; eski üç adres yönlendiriyor (`App.tsx:198-205`). Ama `/organization-switcher`'ı hâlâ 4 yer çağırıyor (BL-650). Account → Workspaces ikinci bir liste (sınırda). |
| Davetin dört durumu tek "404 Active invitation not found" | **bayat** | Önizleme 200 dönüp durumu söylüyor; yalnız bilinmeyen anahtar 404 (`app.ts:749-770`). Ekran 9 ayrı metin gösteriyor (`AcceptInvitationPage.tsx:175-227`). |
| Üst çubukta workspace seçici yok | **bayat** | `shell/WorkspaceSwitcher.tsx`; bekleyen davet sayısını da gösteriyor (`:48-62`) |
| Uygulama içinde yeni davet işareti yok | **değişmiş** | Seçicide davet listesi ve sayısı var; ayrı bir uyarı bandı yok |
| API her iş hatasında 409 ve ham Postgres mesajı | **değişmiş** | Durum kodu artık hata kodundan geliyor ve Postgres'in kendi cümlesi sade metne çevriliyor (`http-error.ts:53-74`, `:113-140`). Ama bilerek yazılmış hata cümleleri yine ekrana gidiyor ("Valid recovery token required", "Submit conditional documents…"). Web'in doğrudan veritabanına yazdığı yolda ham metin duruyor (BL-620). |
| `last_used_at` ve `removed` yok | **bayat** | `20260921210000_workspaces_remember_their_last_use.sql`; enum'da `removed` var (SELECT) |

## 5) Sınırda

- **Account → Workspaces** (`/account/workspaces`, ekran 15 ile ortak)
  - "Set as default" işareti (favori kuralının yazıldığı yer).
  - Yarım kurulum "Open/Continue setup" (`WorkspacesPage.tsx:627`) ve `/organization-switcher` çağrısı (`:344`).
  - Satır dışı eski metinler ve ham hatalar (numarasız, BACKLOG.md:185). BL-287, BL-511, BL-355 (1).
  - Parolasız kapatma yorumu (BL-284).
- **Davet gönderme** (ekran 3): kurulum bitmeden davet kapısı (BL-419, kural bu ekranın), "Send reminder" (BL-767), davetli admin'in rütbesi (BL-773), çekmecenin izin listesi (BL-774), davet bağlantısının "hayır"ı (BL-401, BL-420), düz metin davet anahtarı (BL-352; SELECT 2070 satır).
- **Onboarding'in müdür onayı** (ekran 3): müdür ucunun varsayılan workspace'le çözülmesi (BL-280 (2), `onboarding-routes.ts:175`), resmî ad onayı (BL-646'nın karar yüzü).
- **Onboarding içindeki belge yükleme** (ekran 6): BL-647, BL-648, BL-649; ham "Failed to fetch" (BL-620'nin belge yüzü).
- **Ortak form kuralları** (BL-503) ve ortak hata yardımcıları (BL-620, BL-621): kurulum yüzleri bu ekranda; ortak düzeltme birden çok ekranı etkiler.
- **Workspace'e iniş sonrası** (ekran 5): Setup checklist (BL-811), hesap satırı olmayan owner (BL-805; yerelde 74, 73'ü taslak owner, 1 satır elle doğrulandı), kaydı olmayan owner (BL-338; yerelde 77), boş Schedule (BL-122).
- **Rota korumaları** (Settings): `PermissionRoute`'un izin listesine bakması (BL-176, açık kısım). `resolveLanding` kısmı kapandı.
- **Altyapı ve canlı:** Resend anahtarı (BL-027; canlıda davet ve sıfırlama e-postası gitmiyor), landing sayfası kararı (BL-034).
- **Yasal sayfalar** (ekran 17): BL-623, BL-635, BL-643, BL-644, `index.html:7` başlığında "Newfork Clean". Sign in'deki güven bağlantıları bu ekranın (BL-285).
- **Ortak stil:** `.form-error` ham renk (BL-169), ikinci beyaz düğme sistemi (BL-255).
- **Kişi adı tek kaynak** (BL-079), **test dünyası** (BL-404), **eski adımlar** (BL-568).

## 6) Ölçülemeyenler

- **Canlı (hosted):** `RESEND_API_KEY` bugün yeniden ölçülmedi (son ölçüm 2026-10-06: yok). Canlı Supabase'in parola alt sınırı ve "Confirm email" ayarı ölçülmedi. Davet bağlantısının e-posta onayından sağ çıkıp çıkmadığı (BL-336) ölçülmedi.
- **Piksel:** Telefon yerleşimleri bugün ölçülmedi: BL-151, YENİ-5, BL-642 (8 px), BL-575. Sayılar prototip ajanının `6358125b` / `4d3936d1` ölçümleri; o tarihten bu yana ilgili CSS değişmedi (git log).
- **API:** Davet kabulünde rütbe ya da kapalı workspace gibi başka bir 42501 reddi ekrana "This invitation is for another address" olarak düşebilir; kod yolu açık (`app.ts:214-229`, `authz.not_active` dışındaki her 42501 bu cevabı alıyor), ama denenmedi.
- **Settings → Jobs:** Aynı adla iş eklemenin ham metni orada da gösterip göstermediği (BL-620'nin yayılımı) ölçülmedi.
- **Preferred name:** Onay modunun çalışan kurulumundaki sunucu davranışı (§2, Q4 P18) ölçülmedi.
- **Koşulmayanlar:** Hiçbir test, e2e ya da eslint koşmadı (görev kuralı).
