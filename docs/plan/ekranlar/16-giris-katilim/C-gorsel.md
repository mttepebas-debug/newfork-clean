# Ekran 16: Giriş ve katılım. Keşif C: gerçek uygulamada görsel denetim

Ölçüm 2026-10-07, 08:24–08:52 UTC, `origin/main` `fb9ced47`, kod `newfork-wt/ekran-16`. Uygulama koordinatörün açtığı sunucularda gezildi (web 5632, API 5633, yerel veritabanı). Tarayıcı: Playwright Chromium, masaüstü 1440×900, telefon 390×844 (dokunmatik telefon taklidiyle). Ekran görüntüleri `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\EKRAN-16\` klasöründe (65 dosya). Yerel veritabanında yalnız SELECT koştu. Ölçüm boyunca `db.lock` başka oturumlardaydı: 08:23'te `ekran-02/tek-tablo`, 08:30'dan sonra `oturum/paralel-1`. Bu yüzden yalnız okudum. Kullandığım kişilerin kayıtları ölçüm boyunca değişmedi.

## Özet (5 satır)

1. 33 ekran durumu iki genişlikte çekildi (65 görüntü). Telefonda hiçbir sayfa yana taşmıyor. Her alanın etiketi var, klavye odağı her yerde görünüyor. Kırmızı iki tık (Decline → "Confirm decline") doğru çalışıyor.
2. Mert'in iki kararı ekranda yok. Girişte "Active invitation found" ekranı çıkmıyor (BL-624). İlk karşılamadaki ikinci düğme "I am waiting for an invitation" olmalıyken "I have an invitation" yazıyor (YENİ).
3. Akışın ölçüleri birbirini tutmuyor. Aynı işi yapan düğmeler 36, 42 ve 44 px. Giriş alanları 42 px / köşe 5 ile 44 px / köşe 6 arasında değişiyor. Telefonda düğmelerin çoğu 36 px, yani 44 px dokunma hedefinin altında.
4. Erişilebilirlikte üç somut eksik var. Yanlış parola hatasından sonra klavye odağı kayboluyor. Kurulumdaki kapalı anahtarın rengi zeminden zor ayrılıyor (1,8:1). Seçili satırdaki rol yazısının kontrastı 4,39:1, AA eşiği 4,5.
5. Risk 🟠: veri ya da güvenlik kaybı görmedim. Bulguların çoğu tutarlılık ve metin işi. 24 bulgunun 12'si tamamen yeni, 7'si backlog'da var, 5'i var olan bir backlog maddesine yeni parça ekliyor.

## Ekranın sınırı

A raporundaki sınırla aynı.

- **İçeride:** Sign in (hesap oluşturma modu dahil), Forgot password, Reset password, Account recovery, davet sayfası (`/invite/accept`), Workspaces merkezi (`/workspaces`; davet, yarım kurulum, Create), `/workspaces/status`, owner kurulum sihirbazı (`/onboarding`), çalışan kurulumu (`/welcome/:id`), girişten sonra nereye inildiği, üst çubuktaki Sign out.
- **Dışarıda:** Account sayfaları, Employees'ten davet göndermek ve onboarding onayı, yasal sayfalar (Privacy, Terms, Accessibility, Contact), Billing.
- **Sınırda:** Giriş ekranının altındaki yasal bağlantılar. Bağlantılar bu ekranın, açtıkları sayfalar ekran 17'nin. Sekmede görünen başlık bütün uygulamanın ortak dosyasında (`index.html`). Geliştirme sayfası `/dev/employee-onboarding` yalnız tasarım önizlemesi; canlıya çıkmıyor.

## Hangi hesaplarla gezildi

| Persona | Kim (rol · workspace) | Nasıl girildi |
|---|---|---|
| Owner | Seed hesabı "Local Owner". Meyhouse'un owner'ı. Ayrıca Employee Demo'da aktif çalışan, Pending Demo'da kurulumu yarım çalışan, Suspended Demo'da askıdaki müdür. Dört durumun dördünü tek ekranda gösteriyor. | Parolasız bağlantı: OTP isteği, Mailpit'ten bağlantı, `verify`, sonra `/sign-in#access_token=…` |
| Kurulumu yarım owner | Fixture "Jordan Rivera". Tek workspace'i taslak hâlde "New workspace"; kurulum 2. adımda (Locations). | aynı |
| Davetli çalışan, kurulumu yarım | Seed "Local Employee". Meyhouse'ta `pending_activation`, yani kabul etmiş ama kurulumu bitmemiş. | aynı |
| Davetsiz kişi | Fixture "Account owner". Hiç üyeliği ve daveti yok, hiçbir workspace'e bağlanmamış. | aynı |
| Ek: askıdaki çalışan | e2e dünyasından "Deniz Person". World e2e1790693406000'de askıda, başka üyeliği yok. | aynı |
| Ek: aktif çalışan | Seed hesabı. Meyhouse'ta aktif çalışan, owner olduğu yer yok. | aynı |

**Bulunamayan ya da taklit edilenler (SELECT'lerle):**
- **Bekleyen daveti olan hesap bulunamadı.** Süresi geçmemiş 14 bekleyen davetin hepsi hesabı olmayan `far-…@world.test` adreslerine gitmiş. Sorgu: `select i.email, … exists(select 1 from auth.users u where lower(u.email)=lower(i.email)) has_user from public.employee_invitations i where i.status='pending' and i.expires_at>now()`. Davet satırını göstermek için `/v1/invitations/pending` cevabı tarayıcıda taklit edildi ("Northstar Kitchen" adlı tek satır). Bu görüntülerin adında `mock` var.
- **"Welcome back" kişisi bulunamadı.** Daha önce bağlanmış ama hiç üyeliği kalmamış tek hesap kullanıcının kendi gmail hesabı; o kullanılmadı. Sorgu: `… where not exists(active/pending membership) and not exists(pending invitation)`, `account_organization_history` ile. Ekran, `account_organization_history` sayım cevabı taklit edilerek açıldı.
- **Geçerli davet bağlantısı:** Mailpit boştu. Bağlantı, yerel veritabanındaki `employee_invitation_delivery_secrets` tablosundan SELECT ile kuruldu: süresi geçmemiş bir, süresi geçmiş bir davet. Yalnız önizlendi, kabul edilmedi. Önizleme fonksiyonu yalnız okuyor (`preview_employee_invitation_service` stable).
- **Çalışan kurulumu gerçek veriyle açılamadı.** `/welcome/:id` açılınca sunucu `initialize_employee_onboarding`'i çağırıyor, bu da satır yazıyor (`insert … on conflict do update`). Sayfa gerçek kodla açıldı ama okuma cevabı web testindeki örnek veriyle taklit edildi (Taylor Reed, Downtown, Server).
- **Güvenlik önlemi:** Her oturumda API'ye ve veritabanına giden GET/HEAD dışı bütün istekler tarayıcıda engellendi. İzin verilen tek istisnalar salt okuyan davet önizlemesi ve auth uçlarıydı. Uygulamanın engellenen yazma denemesi olmadı (engel listeleri boş).

## Bulgular

Önem sırası: kritik → yüksek → orta → düşük. "YENİ" etiketi, maddenin `docs/plan/BACKLOG.md`'de bulunmadığını gösterir. Ölçüler `getComputedStyle` / `getBoundingClientRect` ile alındı.

### Yüksek

**C-01 · Girişte "Active invitation found" ekranı yok**
- **Nerede:** Sign in → giriş sonrası ilk ekran; Workspaces.
- **Örnek:** Meyhouse owner'ına başka bir workspace'ten davet geldi. Giriş yapınca ayrı bir davet ekranı görmüyor. Davet Workspaces listesinin başında bir satır olarak duruyor. "Not now" düğmesi ve "Takes you to Workspaces…" satırı yok. Create de gizli.
- **Kanıt:** `28b-workspaces-owner-davet-var-mock-1440.png` / `-390`, `28-workspaces-davet-var-mock-*`. Kod: `resolveLanding.ts:118-122`. KARARLAR "Girişten sonra yönlendirme", görünüm A.
- **Backlog:** BL-624 · leave high / do moderate.
- **Öneri:** Prototipteki A varyantını tek sütun olarak kur: Decline beyaz, Join yeşil, altında "Not now". Girişte davet varsa ilk bu ekran çıksın.

### Orta

**C-02 · Karşılama ekranı Mert'in 2026-10-05 kararını taşımıyor**
- **Nerede:** Workspaces → "Welcome to Newfork" ve "Welcome back".
- **Örnek:** İlk kez gelen kişi ikinci düğmede "I have an invitation" okuyor. Karar "I am waiting for an invitation". "Welcome back" ekranının içeriği de ilk kez gelenle aynı; yalnız başlık değişiyor. Karara göre bu ekran davetleri ve yarım işi listeler, "Create" ile "I am waiting for another invitation" seçeneklerini sunar.
- **Kanıt:** `25-workspaces-ilk-kez-1440.png`, `27-workspaces-tekrar-hosgeldin-mock-1440.png`. Kod: `WorkspaceHubPage.tsx:213`, `:223`. KARARLAR "Katılım ve giriş akışı" son madde ve "Welcome back".
- **Backlog:** YENİ · leave medium / do safe.
- **Öneri:** Düğme metnini karardaki gibi yap. "Welcome back"i karardaki içeriğe göre ayır.

**C-03 · "Create your workspace" yanlış kişilere görünüyor, doğru kişiden gizleniyor**
- **Nerede:** Workspaces → "Your own workspace".
- **Örnek:** Meyhouse'ta yalnız çalışan olan kişi düğmeyi görüyor. Basarsa sunucu reddediyor ("workspace owner access required"). Meyhouse owner'ına tek davet gelince düğme gizleniyor; kural 0 ya da 1 davette görünür diyor.
- **Kanıt:** `31-workspaces-aktif-calisan-1440.png` / `-390`, `28b-…-1440.png`. Kod: `WorkspaceHubPage.tsx:324`; veritabanı fonksiyonu `create_owner_workspace_service`. Düğmeye basılmadı, basmak veri yazar.
- **Backlog:** BL-626 · leave medium / do safe.
- **Öneri:** Görünürlüğü KARARLAR'daki iki kurala bağla. Başkasının workspace'inde aktif çalışan kişiye düğmeyi gösterme.

**C-04 · Telefonda düğmeler 36 px, dokunma hedefi 44 px'in altında**
- **Nerede:** Workspaces satırları (Open, Continue, Decline, Join, Why); tek çıkış düğmeleri ("Choose a workspace", "Go to your workspaces", "Accept invitation", "Check again", "Back"); üst çubukta "Sign out", "Exit setup", "Start over".
- **Örnek:** Ali telefonda Meyhouse satırındaki "Open"a basıyor. Düğme 304×36 px.
- **Kanıt:** `14-workspaces-owner-390.png` (Decline/Continue 148×36, Open 304×36, Sign out 104×36), `19-onboarding-adim2-390.png`, `22-davet-onizleme-390.png` (137×36). Kod: `prebiz.css:217` (`min-height: 36px`); telefon kuralında yükseklik değişmiyor (`:482-531`).
- **Backlog:** YENİ (BL-334 ve BL-802'nin kardeşi) · leave medium / do moderate.
- **Öneri:** 720 px altında `.pb-btn` en az 44 px olsun.

**C-05 · Aynı işi yapan düğmeler üç farklı boyda ve iki farklı renkte**
- **Nerede:** Bütün giriş ve katılım ekranları.
- **Örnek:**
  - Yeşil düğme Sign in, Forgot ve Reset'te 44 px ve tam genişlik; Workspaces satırlarında ve tek çıkışlarda 36 px; kurulum çubuğunda 42 px ve iç boşluk 20.
  - Sayfanın tek çıkışı Reset'te yeşil ve 44 px ("Request a new link"), durum sayfasında yeşil ve 36 px ("Choose a workspace"), kapanmış davette beyaz ve 36 px ("Go to your workspaces").
  - "No invitation yet" ekranında aynı sayfada 36 px yeşil, 36 px beyaz ve 44 px beyaz düğme yan yana.
  - Kurulumda "Add location" lokasyonu kaydediyor ama beyaz. UI-09'a göre kaydeden düğme beyaz olmamalı; karar gerekir.
- **Kanıt:** `08-reset-password-baglantisiz-1440.png`, `15-…-1440.png`, `17-davet-gecersiz-1440.png`, `26-workspaces-davet-bekliyorum-1440.png`, `19-onboarding-adim2-1440.png`. Kod: `prebiz.css:217`, `:262-266`, `:476-480`; `AcceptInvitationPage.tsx:139`.
- **Backlog:** YENİ · leave low / do moderate (ortak değer: önce KARARLAR'a kural yazılır, etkilenen ekranlar söylenir).
- **Öneri:** Giriş öncesi ekranlarda tek düğme ölçüsü seç (öneri 44 px). Tek çıkış hep yeşil olsun.

**C-06 · Giriş alanları iki farklı ölçüde, yazılan cevap kalın**
- **Nerede:**
  - Sign in, Forgot, Reset ve çalışan kurulumu: alan 42 px, köşe 5, yazı 13/700.
  - Owner kurulumu: alan 44 px, köşe 6, yazı 13/750.
- **Örnek:** Mert kurulumda "Main dining room" yer tutucusunu görüyor. Yer tutucu kalın ve koyu; girilmiş bir değer gibi duruyor. Giriş ekranında yazdığı e-posta da etiket kadar kalın.
- **Kanıt:** `04-sign-in-yanlis-parola-390.png`, `19-onboarding-adim2-1440.png`, `24-calisan-kurulumu-profil-mock-1440.png`. Kod: `styles.css:850-861` ve `:11506-11518`.
- **Backlog:** BL-622 (kalın cevap) + YENİ (ölçü farkı) · leave medium / do safe.
- **Öneri:** Tek alan kuralı (yükseklik, köşe) ve normal kalınlıkta cevap metni.

**C-07 · Owner kurulumu telefonda sağa sola eşit durmuyor, üstte büyük boşluk var**
- **Nerede:** `/onboarding`, 390 px.
- **Örnek:** İçerik solda 24 px'ten başlıyor, sağda 64 px'te bitiyor; kartlar ve başlık 302 px geniş. Başlık üst çubuğun 94 px altında.
- **Kanıt:** `19-onboarding-adim2-390.png`, `20-onboarding-adim1-390.png`. Ölçüm: `main` 342 px, `section.onboarding-content` 302 px. Neden: `styles.css:12530-12533` telefonda `width: min(100% - 40px, 660px)` ve `padding: 54px 0` veriyor, sayfa zaten 24 px kenar bırakıyor. Kenar iki kez düşülüyor ve ortalanmıyor.
- **Backlog:** BL-151 (2) üst boşluk + YENİ (sağ boşluk) · leave medium / do safe.
- **Öneri:** Bu telefon kuralındaki genişliği kaldır. Üst boşluğu BL-151'in istediği varyant kararına bağla.

**C-08 · Kurulumdaki aç/kapa anahtarı kapalıyken zeminden zor ayrılıyor**
- **Nerede:** Çalışan kurulumu → Your details → Team visibility.
- **Örnek:** Ali "Share my phone with teammates" anahtarının açık mı kapalı mı olduğunu zor seçiyor.
- **Kanıt:** `24-calisan-kurulumu-profil-mock-390.png`. Kapalı zemin `#b8c2ca`, beyaz üstünde 1,8:1. Denetim kenarı için WCAG 1.4.11 en az 3:1 ister. Açık hâl `#248663`, odak halkası da `#248663` ve ham hex (`styles.css:896-921`).
- **Backlog:** YENİ · leave medium / do safe.
- **Öneri:** Kapalı zemini en az 3:1 koyulukta bir token yap. Odak halkası `--theme-focus` olsun.

**C-09 · Yanlış parola hatasında odak kayboluyor, hata alana bağlı değil, düğmeler kayıyor**
- **Nerede:** Sign in.
- **Örnek:** Ali yanlış parolayla "Sign in"e basıyor. Ekranda Supabase'in ham cümlesi "Invalid login credentials" çıkıyor. Klavye odağı sayfanın başına (BODY) düşüyor. Sign in ve hesap düğmeleri 37 px aşağı kayıyor (441 → 478).
- **Kanıt:** `04-sign-in-yanlis-parola-1440.png` / `-390`. Ölçüm: hatadan sonra odaktaki öğe BODY. Alanlarda `aria-invalid` ve `aria-describedby` yok. Hata satırı `role="alert"` taşıdığı için ekran okuyucu metni duyuruyor. Kod: `AuthContext.tsx:265`, `SignInPage.tsx:151-155`. Tek deneme yapıldı; 390'daki görüntü aynı cevabın tekrarıyla çekildi.
- **Backlog:** BL-628 (ham metin) + YENİ (odak, alan bağı, kayma; BL-289'un kardeşi) · leave medium / do safe.
- **Öneri:** Sade bir cümle yaz, odağı parola alanına geri ver, hatayı alana bağla, hata satırına yer ayır.

**C-10 · Telefonda alan yazısı 13 px**
- **Nerede:** Sign in, Forgot, Reset, iki kurulum.
- **Örnek:** Ayşe iPhone'da e-posta alanına dokunuyor. Safari 16 px'ten küçük yazılı alana dokununca sayfayı yakınlaştırır; form kayar.
- **Kanıt:** 390'da bütün `input` öğeleri `font-size: 13px` (`01-sign-in-bos-390.png` ölçümü). Yakınlaşmanın kendisi bu Chromium ölçümünde görülemedi; Safari'nin bilinen davranışı.
- **Backlog:** YENİ (BL-294'ün kardeşi) · leave medium / do safe.
- **Öneri:** 720 px altında alan yazısı 16 px olsun.

**C-11 · Davet bağlantısı sayfası başka hesapla açılınca bunu söylemiyor; Decline yok; aynı eylemin iki adı var**
- **Nerede:** `/invite/accept?token=…`.
- **Örnek:** "Local Employee" hesabıyla girilmiş bir tarayıcıda başka adrese (`fa*******@world.test`) giden bir davet açılıyor. Sayfa yeşil "Accept invitation" gösteriyor. Adres uyuşmazlığı ancak basınca anlaşılıyor. Sayfada Decline yok, Workspaces'e dönüş yok. Workspaces'te aynı eylemin adı "Join".
- **Kanıt:** `22-davet-onizleme-1440.png` / `-390`. Üst çubukta `employee@…`, metinde `fa*******@world.test`. Kod: `AcceptInvitationPage.tsx:84-101`, uyuşmazlık yalnız kabul hatasından geliyor (`:160`). Düğmeye basılmadı.
- **Backlog:** YENİ (yükleniyor anı BL-631'de) · leave medium / do moderate.
- **Öneri:** Önizlemede adresler uyuşmuyorsa ilk ekranda söyle. Decline ve "Not now" ekle, eylemin adını "Join" yap.

**C-12 · Account recovery bağlantısız açılınca nedeni yazmayan kapalı düğme gösteriyor**
- **Nerede:** `/account-recovery`.
- **Örnek:** Burak kesik bir bağlantıyla geliyor. "Restore my account" soluk duruyor; ne yapacağını bilmiyor. Sign in'e dönüş ve yasal bağlantılar da yok.
- **Kanıt:** `10-account-recovery-1440.png` / `-390`. Düğme 156×36, saydamlık 0,55. Çerçeve öteki oturumsuz ekranlar gibi ortalanmamış, sola yaslı (C-18).
- **Backlog:** BL-629, BL-630, BL-285 · leave medium / do safe.
- **Öneri:** Bağlantı yoksa "bu bağlantı eksik" de, yeni bağlantı iste ve Sign in'e dönüş ver.

**C-13 · Kurulumun 1. adımına dönünce resmî ad alanları boş**
- **Nerede:** `/onboarding` → yan panel ya da "Workspace" geri düğmesi.
- **Örnek:** Jordan Rivera 1. adımı bitirmiş. Geri dönünce First name ve Last name boş, Continue kapalı.
- **Kanıt:** `20-onboarding-adim1-1440.png` / `-390`. Hesap adı üst çubukta "Jordan Rivera". Kod: `OwnerOnboardingPage.tsx:130-132`.
- **Backlog:** BL-633 · leave medium / do moderate.
- **Öneri:** Alanları sunucudaki kayıttan doldur.

**C-14 · Tarayıcı sekmesinde her ekranda "Newfork Clean" yazıyor**
- **Nerede:** Bütün giriş ve katılım ekranları.
- **Örnek:** Restoran sahibi sekmede iç kod adını görüyor. Hangi sayfada olduğunu sekmeden anlayamıyor (WCAG 2.4.2).
- **Kanıt:** Bütün 1440 ölçümlerinde `document.title` = "Newfork Clean". Kod: `apps/web/index.html:7`.
- **Backlog:** BL-635 · leave medium / do safe.
- **Öneri:** Sayfaya göre başlık, örneğin "Sign in | Newfork", "Workspaces | Newfork".

**C-15 · Kişinin askıya alınması, workspace'in askıya alınması gibi anlatılıyor**
- **Nerede:** Workspaces → "No longer open to you" → Why → durum sayfası.
- **Örnek:** Suspended Demo'da yalnız bu kişinin üyeliği askıda; workspace öteki kişiler için açık. Ekran "Suspended Demo is on hold. Nothing in Suspended Demo can be opened until an owner or an admin lifts the hold" diyor. Deniz Person'un satırı da aynı "On hold" rozetini taşıyor; Why aynı cümleye gidiyor.
- **Kanıt:** `15-workspaces-status-beklemede-1440.png`, `29-workspaces-erisim-beklemede-calisan-1440.png`. Kod: `WorkspaceStatusPage.tsx:93-94`. Veri: bu üyelikler `suspended`, workspace `active`.
- **Backlog:** YENİ · leave medium / do safe (metin; kişinin ve workspace'in askısını ayırmak `endingFor` mantığına da dokunur).
- **Öneri:** Kişinin askısı için ayrı cümle, örneğin "Your access to Suspended Demo is on hold".

### Düşük

**C-16 · Seçili satırda rol yazısının kontrastı yetersiz**
- **Nerede:** Workspaces → Where you work → bu sekmede açık workspace'in satırı.
- **Örnek:** Meyhouse satırının altındaki "Owner" yazısı açık yeşil zeminde soluk.
- **Kanıt:** `14-workspaces-owner-1440.png` ve `31-…` ("Employee"). `#66716c`, `#e7f1ed` zemin üstünde 4,39:1. Gerek 4,5:1, yazı 13 px/400. Kod: `prebiz.css:155-157`, `:175-181`.
- **Backlog:** YENİ · leave low / do safe.
- **Öneri:** Tonlu satırda meta yazısı `--theme-muted-strong` olsun.

**C-17 · Telefonda üç ayrı kenar boşluğu; e-posta tam okunmuyor**
- **Nerede:** Giriş öncesi üst çubuk ve kurulum çubuğu, 390 px.
- **Örnek:**
  - Giriş öncesi ekranlarda "NEWFORK" 32 px'ten başlıyor, Sign out'un sağında 32 px boşluk var; içerik 24 px'ten başlıyor.
  - Kurulum çubuğunda boşluk 16 px.
  - Hesap e-postası ~115 px'e kesiliyor ("employee@newfo…", "bl08…"). Kod yorumu bu adresin davette hangi hesabın kullanıldığını göstermek için durduğunu söylüyor; tam okunmayınca bu iş görülmüyor.
- **Kanıt:** `14-workspaces-owner-390.png`, `22-davet-onizleme-390.png`, `19-onboarding-adim2-390.png`. Kod: `prebiz.css:38` (telefon kuralı yok), `:496`.
- **Backlog:** BL-151 (1) + YENİ · leave low / do safe.
- **Öneri:** Telefonda çubuk ve içerik aynı 24 px'ten başlasın, e-posta ikinci satıra insin.

**C-18 · Giriş öncesi ekranlarda iki farklı hizalama**
- **Nerede:** Sign in, Forgot ve Reset ortalı, 420 px. Workspaces, durum sayfası, davet ve Account recovery sola yaslı, 600 px.
- **Örnek:** Oturumsuz ve tek eylemli olduğu hâlde Account recovery sola yaslı ailede. Başlıklar ise her ekranda aynı yükseklikte (masaüstünde y=158, telefonda y=102); bu iyi.
- **Kanıt:** `07-…-1440.png` ile `10-…-1440.png`. Kod: `prebiz.css:64-76`.
- **Backlog:** YENİ · leave low / do safe.
- **Öneri:** Account recovery'yi `narrow` çerçeveye al. İki ailenin kuralını KARARLAR UI-11'e yaz. UI-11 bugün "iki panelli çerçeve" diyor, kod üst çubuğa geçti; satır güncellenmeli.

**C-19 · Başlık boyları ekranlar arasında farklı; satıra tek kelime düşüyor**
- **Nerede:** Giriş öncesi ekranlarda başlık 30 px (telefonda 24); iki kurulumda 42 px (telefonda 30).
- **Örnek:**
  - "Create your workspace account" masaüstünde iki satır, ikinci satırda yalnız "account".
  - Telefonda "That workspace isn't open to / you" ve "This link doesn't work / anymore" son kelimeyi tek başına alt satıra atıyor.
- **Kanıt:** `03-sign-in-hesap-olustur-1440.png`, `16-workspaces-status-idsiz-390.png`, `17-davet-gecersiz-390.png`.
- **Backlog:** YENİ · leave low / do safe.
- **Öneri:** Başlıklarda `text-wrap: balance` kullan, giriş akışında tek başlık ölçeği seç.

**C-20 · Beyaz düğmenin kenarı soluk, yazı rengi UI-09'dan farklı**
- **Nerede:** Bütün `.pb-btn-secondary` ve `.pb-btn-danger` düğmeleri.
- **Kanıt:** Kenar `#cbd4d0`, beyaz üstünde 1,47:1; UI-09 `--theme-muted` diyor. Yazı `#17221e` (`--theme-text`); UI-09 `--theme-accent-deep` diyor. Kod: `prebiz.css:246-251`.
- **Backlog:** BL-286 · leave low / do safe.

**C-21 · Reset password ekranlarından Sign in'e dönüş yok**
- **Nerede:** "Reset link not valid" ve "Choose a new password".
- **Örnek:** Ayşe geçersiz bağlantıyla geliyor, parolasını hatırlıyor. Sign in'e giden bağlantı yok; yalnız "Request a new link" var.
- **Kanıt:** `08-reset-password-baglantisiz-1440.png`, `09-reset-password-gecersiz-baglanti-1440.png`. Uydurma bağlantıyla form açılıyor; bağlantının geçersiz olduğu Save'de anlaşılıyor. Bu KARARLAR'a göre bilerek böyle.
- **Backlog:** BL-285 (genişletme) · leave low / do safe.

**C-22 · Küçük metin tutarsızlıkları**
- **Örnek:**
  - Çalışan kurulumunda alan adı "E-mail", giriş ekranlarında "Email" (`EmployeeOnboardingPage.tsx:733`).
  - "No invitation yet" ekranında "ask your manager to invite it": "it" adresi kastediyor, cümle tuhaf (`WorkspaceHubPage.tsx:176`).
  - Ad alanları owner kurulumunda "Name as it appears on your ID / First name", çalışanda "Legal first name".
- **Kanıt:** `24-…-1440.png`, `26-…-1440.png`, `20-…-1440.png`. Türkçe harf ya da iç kod adı (organization, tenant, membership) gövde metinlerinde görülmedi; tek istisna sekme başlığı (C-14).
- **Backlog:** YENİ · leave low / do safe.

**C-23 · Kurulum stilinde ham renk kodu (hex)**
- **Nerede:** `styles.css:757-999` (kurulum blokları).
- **Kanıt:**
  - Örnekler: `#557169` (`:763`), `#596672` (`:782`), `#687581` (`:807`), `#b8c2ca` (`:901`), `#248663` (`:913`, `:919`), `.form-error` `#a23725`.
  - Giriş öncesi kitin kendi dosyası `prebiz.css` tamamen `--theme-*` token'ı, 0 ham hex.
  - Geliştirme önizlemesinin CSS'i 15 ham hex kullanıyor, hiç token yok.
- **Backlog:** BL-215 (`#596672`), BL-169 (`.form-error`) + YENİ (kalanlar) · leave low / do safe.

**C-24 · Geliştirme önizlemesi gerçek çalışan kurulumundan farklı**
- **Nerede:** `/dev/employee-onboarding` (yalnız geliştirmede açılan tasarım prototipi).
- **Örnek:**
  - Prototipte 7 adım var (Welcome … Review & submit), gerçek sayfada 3 (Profile, Availability, Review).
  - Yazılar 9–11 px.
  - Yan paneldeki gri yazı `#6c756f`, `#f2f5f3` üstünde 4,34:1 (AA değil).
  - Telefon alanında ülke kodu menüsü var (+44, +90…). ILKELER P12 "+1 sabit" diyor.
- **Kanıt:** `11-…`, `12-…` (iki genişlik).
- **Backlog:** YENİ · leave low / do safe. Prototip gerçek sayfaya taşınacaksa bu üçü önce düzelmeli.

### İyi olanlar (ölçüldü)

- 390 px'te hiçbir ekranda yana kaydırma yok; `scrollWidth` her ekranda 390.
- Bütün giriş alanlarının görünen etiketi var. Kurulumdaki saat dilimi listesinin `aria-label`'ı var.
- Tab sırası mantıklı: Sign out → satırlar → Create. Her odakta 2 px `#177a64` halka görünüyor (`02-…-odak`, `14b-…-odak`).
- Önemli metinlerin hepsi 4,5:1 üstünde, C-16 hariç. Örnekler: başlık 16,4:1; açıklama 5,07:1; yasal bağlantılar 5,55:1; "On hold" rozeti 4,9:1; yeşil düğme yazısı 6,59:1.
- İki tık dili doğru: beyaz Decline → kırmızı "Confirm decline" (`#b84234`, beyaz yazı) (`28c-…`).
- `lang="en"`.

## Ekran görüntüsü listesi

| Dosya | Ekran | Persona | Genişlik | Ne gösteriyor |
|---|---|---|---|---|
| 01-sign-in-bos-1440.png | Sign in | oturumsuz | 1440 | Boş giriş formu: yeşil "Sign in", beyaz "Create a workspace account", altta yasal bağlantılar. |
| 01-sign-in-bos-390.png | Sign in | oturumsuz | 390 | Aynı form telefonda; marka 32 px, içerik 24 px'ten başlıyor. |
| 02-sign-in-odak-1440.png | Sign in (klavye odağı) | oturumsuz | 1440 | Tab ile gelinen "Sign in" düğmesinde 2 px yeşil odak halkası. |
| 02-sign-in-odak-390.png | Sign in (klavye odağı) | oturumsuz | 390 | Aynı odak halkası telefonda. |
| 03-sign-in-hesap-olustur-1440.png | Sign in, hesap oluşturma modu | oturumsuz | 1440 | "Create your workspace account" başlığı iki satır, ikinci düğme beyaz "I already have an account". Yeşil düğme fare üstünde olduğu için koyu tonda. |
| 03-sign-in-hesap-olustur-390.png | Sign in, hesap oluşturma modu | oturumsuz | 390 | Aynı mod telefonda. |
| 04-sign-in-yanlis-parola-1440.png | Sign in, yanlış parola | oturumsuz (fixture adresiyle tek deneme) | 1440 | Ham "Invalid login credentials", düğmeler 37 px aşağıda, yazılan e-posta kalın. |
| 04-sign-in-yanlis-parola-390.png | Sign in, yanlış parola | oturumsuz (aynı cevap tekrar oynatıldı) | 390 | Aynı hata telefonda. |
| 05-sign-in-davet-modu-1440.png | Sign in, davet bağlantısından | oturumsuz | 1440 | Davet bağlantısını oturumsuz açan kişi "Create your employee account" moduna iniyor. |
| 05-sign-in-davet-modu-390.png | Sign in, davet bağlantısından | oturumsuz | 390 | Aynı mod telefonda; başlık ve açıklama iki satır. |
| 06-app-oturumsuz-1440.png | /app (korumalı sayfa) | oturumsuz | 1440 | Korumalı adres Sign in'e yönleniyor (adres `/sign-in`). |
| 06-app-oturumsuz-390.png | /app (korumalı sayfa) | oturumsuz | 390 | Aynı yönlenme telefonda. |
| 07-forgot-password-bos-1440.png | Forgot password | oturumsuz | 1440 | Boş form, yeşil "Send reset link", altında "Back to sign in"; yasal bağlantı yok. |
| 07-forgot-password-bos-390.png | Forgot password | oturumsuz | 390 | Aynı ekran telefonda; açıklama iki satır. |
| 08-reset-password-baglantisiz-1440.png | Reset password, bağlantısız | oturumsuz | 1440 | "Reset link not valid" ve tam genişlik yeşil "Request a new link"; Sign in'e dönüş yok. |
| 08-reset-password-baglantisiz-390.png | Reset password, bağlantısız | oturumsuz | 390 | Aynı ekran telefonda. |
| 09-reset-password-gecersiz-baglanti-1440.png | Reset password, uydurma bağlantı | oturumsuz | 1440 | Uydurma belirteçle form açılıyor; geçersizlik Save'de anlaşılır. |
| 09-reset-password-gecersiz-baglanti-390.png | Reset password, uydurma bağlantı | oturumsuz | 390 | Aynı form telefonda. |
| 10-account-recovery-1440.png | Account recovery, bağlantısız | oturumsuz | 1440 | Sola yaslı çerçeve; nedeni yazmayan, soluk, kapalı "Restore my account". |
| 10-account-recovery-390.png | Account recovery, bağlantısız | oturumsuz | 390 | Aynı ekran telefonda. |
| 11-dev-calisan-kurulumu-karsilama-1440.png | /dev/employee-onboarding (yalnız geliştirme önizlemesi) | oturumsuz | 1440 | Tasarım prototipinin karşılama adımı; 7 adımlı yan panel. Gerçek sayfa değil. |
| 11-dev-calisan-kurulumu-karsilama-390.png | /dev/employee-onboarding | oturumsuz | 390 | Prototip karşılaması telefonda; "1 of 7" açılır adım çubuğu. |
| 12-dev-calisan-kurulumu-kisisel-1440.png | /dev/employee-onboarding, Personal information | oturumsuz | 1440 | Prototipin kişisel bilgi adımı. Yapışkan alt çubuk tam sayfa görüntüde ortada kalıyor (görüntü etkisi). |
| 12-dev-calisan-kurulumu-kisisel-390.png | /dev/employee-onboarding, Personal information | oturumsuz | 390 | Aynı adım telefonda; ülke kodu menüsü görünüyor. |
| 14-workspaces-owner-1440.png | Workspaces | Meyhouse owner'ı | 1440 | Girişten sonra açılan merkez: In progress, Where you work (Meyhouse tonlu), No longer open to you, Create. |
| 14-workspaces-owner-390.png | Workspaces | Meyhouse owner'ı | 390 | Aynı liste telefonda; satır düğmeleri 36 px, e-posta kesik. |
| 14b-workspaces-owner-odak-1440.png | Workspaces (klavye odağı) | Meyhouse owner'ı | 1440 | Tonlu Meyhouse satırındaki "Open"da odak halkası. |
| 15-workspaces-status-beklemede-1440.png | /workspaces/status/:id | Meyhouse owner'ı (Suspended Demo'da askıdaki müdür) | 1440 | "Suspended Demo is on hold": kişinin askısı workspace'in askısı gibi anlatılıyor; tek çıkış yeşil 36 px. |
| 15-workspaces-status-beklemede-390.png | /workspaces/status/:id | aynı | 390 | Aynı ekran telefonda. |
| 16-workspaces-status-idsiz-1440.png | /workspaces/status | Meyhouse owner'ı | 1440 | Kimliksiz adres: "That workspace isn't open to you". |
| 16-workspaces-status-idsiz-390.png | /workspaces/status | Meyhouse owner'ı | 390 | Başlıktaki son kelime "you" tek başına ikinci satırda. |
| 17-davet-gecersiz-1440.png | Davet sayfası, geçersiz bağlantı | Meyhouse owner'ı | 1440 | "This link doesn't work anymore"; tek çıkış beyaz "Go to your workspaces". |
| 17-davet-gecersiz-390.png | Davet sayfası, geçersiz bağlantı | Meyhouse owner'ı | 390 | Başlıktaki son kelime "anymore" tek başına ikinci satırda. |
| 18-workspaces-yarim-kurulum-owner-1440.png | Workspaces | kurulumu yarım owner | 1440 | Tek satır "New workspace · Setup in progress", beyaz Discard + yeşil Continue; Create gizli. |
| 18-workspaces-yarim-kurulum-owner-390.png | Workspaces | kurulumu yarım owner | 390 | Aynı satır telefonda; düğmeler 148×36. |
| 19-onboarding-adim2-1440.png | Owner kurulumu, 2. adım (Locations) | kurulumu yarım owner | 1440 | Kalın yer tutucular girilmiş değer gibi; beyaz "Add location" + yeşil "Continue"; yapışkan çubuk görüntünün ortasında. |
| 19-onboarding-adim2-390.png | Owner kurulumu, 2. adım | kurulumu yarım owner | 390 | İçerik solda 24, sağda 64 px; üstte 94 px boşluk; çubukta "bl08…". |
| 20-onboarding-adim1-1440.png | Owner kurulumu, 1. adım (geri dönülmüş) | kurulumu yarım owner | 1440 | Resmî ad alanları boş, Continue kapalı; workspace adı "New workspace". |
| 20-onboarding-adim1-390.png | Owner kurulumu, 1. adım | kurulumu yarım owner | 390 | Aynı adım telefonda; sağda 64 px boşluk. |
| 21-workspaces-davetli-kurulum-yarim-1440.png | Workspaces | Meyhouse'a davetli çalışan (kurulumu yarım) | 1440 | "Meyhouse · Onboarding in progress", Decline + Continue, altında Create. |
| 21-workspaces-davetli-kurulum-yarim-390.png | Workspaces | aynı | 390 | Aynı ekran telefonda. |
| 22-davet-onizleme-1440.png | Davet sayfası, geçerli bağlantı | Meyhouse'a davetli çalışan (davet başka adrese) | 1440 | "Accept your invitation"; adres uyuşmadığı hâlde yeşil Accept, Decline yok. |
| 22-davet-onizleme-390.png | Davet sayfası, geçerli bağlantı | aynı | 390 | Üst çubukta kesik e-posta ile davetteki adres yan yana karşılaştırılamıyor. |
| 22b-davet-suresi-dolmus-1440.png | Davet sayfası, süresi dolmuş | Meyhouse'a davetli çalışan | 1440 | "This link doesn't work anymore. Invitations last 7 days…", beyaz tek çıkış. |
| 22b-davet-suresi-dolmus-390.png | Davet sayfası, süresi dolmuş | aynı | 390 | Aynı ekran telefonda. |
| 23-calisan-kurulumu-karsilama-mock-1440.png | Çalışan kurulumu /welcome/:id, karşılama | Meyhouse'a davetli çalışan; okuma cevabı taklit | 1440 | Gerçek sayfa, örnek veriyle: "Let's set up your employee account", Downtown / Server, Begin. |
| 23-calisan-kurulumu-karsilama-mock-390.png | Çalışan kurulumu, karşılama | aynı | 390 | Üst çubuk kalabalık: Exit onboarding, kesik e-posta, Sign out. |
| 24-calisan-kurulumu-profil-mock-1440.png | Çalışan kurulumu, Your details | aynı | 1440 | Profil formu; "E-mail" yazımı; kapalı anahtarlar soluk. |
| 24-calisan-kurulumu-profil-mock-390.png | Çalışan kurulumu, Your details | aynı | 390 | Aynı form telefonda; yapışkan Continue çubuğu Phone alanının üstünde (görüntü etkisi). |
| 25-workspaces-ilk-kez-1440.png | Workspaces, "Welcome to Newfork" | davetsiz kişi | 1440 | Yeşil Create + beyaz "I have an invitation" (karar: "I am waiting for an invitation"). |
| 25-workspaces-ilk-kez-390.png | Workspaces, "Welcome to Newfork" | davetsiz kişi | 390 | Aynı ekran telefonda. |
| 26-workspaces-davet-bekliyorum-1440.png | Workspaces, "No invitation yet" | davetsiz kişi | 1440 | Check again (yeşil 36), Back (beyaz 36), Create (beyaz 44) aynı sayfada. |
| 26-workspaces-davet-bekliyorum-390.png | Workspaces, "No invitation yet" | davetsiz kişi | 390 | Aynı ekran telefonda. |
| 27-workspaces-tekrar-hosgeldin-mock-1440.png | Workspaces, "Welcome back" | davetsiz kişi; "daha önce bağlandı" cevabı taklit | 1440 | İlk kez gelenle aynı içerik, yalnız başlık farklı. |
| 27-workspaces-tekrar-hosgeldin-mock-390.png | Workspaces, "Welcome back" | aynı | 390 | Aynı ekran telefonda. |
| 28-workspaces-davet-var-mock-1440.png | Workspaces, "You have an invitation" | davetsiz kişi; bir davet taklit | 1440 | Workspace'i olmayan kişide sert engel: davet satırı, Decline + Join, Create yok. |
| 28-workspaces-davet-var-mock-390.png | Workspaces, "You have an invitation" | aynı | 390 | Aynı ekran telefonda; düğmeler 148×36. |
| 28b-workspaces-owner-davet-var-mock-1440.png | Workspaces | Meyhouse owner'ı; bir davet taklit | 1440 | Davet listenin başında; "Not now" yok; Create gizli. |
| 28b-workspaces-owner-davet-var-mock-390.png | Workspaces | aynı | 390 | Aynı liste telefonda. |
| 28c-workspaces-davet-reddet-iki-tik-1440.png | Workspaces, Decline'a bir kez basılmış | davetsiz kişi; taklit davet | 1440 | Kırmızı "Confirm decline": iki tık dili çalışıyor (istek engelliydi, yazma yok). |
| 28c-workspaces-davet-reddet-iki-tik-390.png | Workspaces, Decline'a bir kez dokunulmuş | aynı | 390 | Aynı durum telefonda. |
| 29-workspaces-erisim-beklemede-calisan-1440.png | Workspaces | askıdaki çalışan (World e2e1790693406000) | 1440 | "No longer open to you · On hold · Why" ve Create. |
| 29-workspaces-erisim-beklemede-calisan-390.png | Workspaces | aynı | 390 | Aynı ekran telefonda. |
| 31-workspaces-aktif-calisan-1440.png | Workspaces | Meyhouse'ta aktif çalışan | 1440 | Create görünüyor; sunucu bu kişide reddeder (basılmadı). |
| 31-workspaces-aktif-calisan-390.png | Workspaces | aynı | 390 | Aynı ekran telefonda; Meyhouse satırı tonlu, "Employee" 4,39:1. |

Sıra numaralarında 13 ve 30 boş. 13'ün görüntüsü 14 ile aynıydı, silindi (owner girişte doğrudan Workspaces'e indi). 30 kullanılmadı.

## Ölçülemeyenler

**Veri yazacağı için:**
1. "Check your email": hesap oluşturduktan sonraki ekran. Hesap açmak gerekiyor.
2. Forgot password'ün "gönderildi" hâli. Göndermek hız sınırı sayacını yazar.
3. Reset password'de Save'den sonra gelen "Reset link not valid" ya da başarı. Save belirteci harcar.
4. Account recovery'de geçerli bağlantı ve "Your account is back". Geri yükleme yazar; geçerli kurtarma bağlantısı da yok.
5. Davet kabulünden sonraki ekranlar: "You're in", "This invitation is for another address" (adres uyuşmazlığı), "Confirm your email first". Hepsi Accept'e basmayı gerektiriyor.
6. Owner kurulumunun 3. (Jobs) ve 4. (Team) adımları. Taslakların en ilerisi 2. adımda (`select … max(current_step) from workspace_onboarding where status='incomplete'` → 2). İleri gitmek Continue'ya basmak, yani yazmak demek.
7. Çalışan kurulumunu gerçek veriyle açmak. Okuma isteği bile satır yazıyor (`initialize_employee_onboarding` upsert). Sayfa taklit veriyle çekildi (23, 24).
8. Create, Join, Decline, Discard, Continue, Start over ve Sign out düğmelerinin sonucu. Hiçbirine basılmadı. Decline'a yalnız taklit davette bir kez basıldı (28c); ikinci tık yoktu, yazma istekleri engelliydi.

**Kişi ya da veri bulunamadığı için:**
9. Gerçek bekleyen daveti olan hesap: SELECT boş döndü; taklitle çekildi (28, 28b, 28c).
10. Gerçek "Welcome back" hesabı: SELECT boş döndü (kullanıcının kendi hesabı hariç); taklitle çekildi (27).
11. "Almost ready" (kurulumu bitmemiş workspace'in owner olmayan üyesi): `… join workspace_onboarding o … where o.status='incomplete' and m.role<>'owner' and m.status in ('active','pending_activation')` → 0 satır.
12. Kapanmış workspace ("has closed") ve erişimi kaldırılmış ("You no longer have access") durum sayfaları. Biten üyeliklerin hepsi `suspended`.
13. Revoked, declined ve accepted davet önizlemeleri. Belirteci olan davetlerin hepsi `pending` (14 geçerli, 7 süresi dolmuş).

**Kapsam ve süre yüzünden denenmeyenler:**
14. Workspaces'in "Checking your account" yükleniyor ve "didn't load" hata hâlleri.
15. Sign in'in "Your session ended" varyantı.
16. Çalışan kurulumunun Availability, Documents ve Review adımları.

## Bu ölçümün yan etkileri

- **Girişler:** 6 fixture hesabına parolasız bağlantıyla girildi. Bu, `auth.users.last_sign_in_at`'i, tek kullanımlık giriş kodu kaydını ve Mailpit'teki 6 e-postayı etkiledi. Bir fixture adresiyle tek yanlış parola denemesi yapıldı.
- **Benim hatam:** Betiğim bir kez "reset,owner" gibi geçersiz bir adres için OTP isteği gönderdi. Supabase 422 ile reddetti, hesap oluşmadı.
- **Girişin beklenmeyen yan etkisi:** Görev "yalnız `last_sign_in_at` değişir" varsayıyordu. Oysa `GET /v1/context` her açılışta üyeliğin `last_used_at` alanını damgalıyor (`apps/api/src/app.ts:489-495`, en çok 5 dakikada bir). Bu yüzden üç üyelikte bu tek alan değişti: Meyhouse owner'ı (Meyhouse), kurulumu yarım owner (New workspace), aktif çalışan (Meyhouse). Bunun dışında hiçbir şey yazılmadı. GET dışı her istek tarayıcıda engelliydi; engel listeleri boş kaldı.
- **Okunan gizli değer:** İki davet belirteci yerel veritabanından okundu ve yalnız önizleme için kullanıldı.
- **Başka kaynaktan giriş:** Meyhouse owner'ının `last_sign_in_at` değeri 08:36'da yeniden değişti. Benim girişim 08:24'teydi; bu değişiklik başka bir kaynaktan geliyor olabilir. O sırada `db.lock` başka bir oturumdaydı.
- **Kapanış:** Açtığım bütün tarayıcılar kapandı (`ms-playwright` süreci 0). Sunuculara dokunulmadı. Betikler yalnız scratchpad'de.
