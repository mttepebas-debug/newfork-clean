# Kararlar — Giriş ve katılım (Sign in, davet, kurulum sihirbazı)

Karar defterinin ([C:\Users\TheWe\Documents\Codex\newfork-clean\docs\plan\KARARLAR.md](../../KARARLAR.md)) bu ekrana ait bölümü; metin 2026-10-20'de defterden anlamı değişmeden taşındı (KAYIT-BOLME). Madde biçimi, dayanak sırası ve kimlik kuralları defterin başındaki gibidir; uygulama geneli kurallar (vizyon ve ilkeler, roller ve kapsam, form kuralları, MVP sınırı, her ekranın ortak kararları, yetki, teknik, süreç) defterde kalır. Yeni ekran kararı buraya yazılır ve kimliği defterdeki fihrist satırına eklenir (`node scripts/kararlar-check.mjs` ikisini karşılaştırır). Metindeki "§1.3", "§4" gibi bölüm atıfları defterindir.

## Ürün kuralları (eski §1.1'den)

**Giriş ve hesap kurtarma (kullanıcı kararı, 2026-09-26)**
- Parolasını unutan kişi giriş ekranındaki "Forgot password?" bağlantısıyla e-postasını yazar; gelen sıfırlama bağlantısıyla yeni parola belirler ve içeri girer. Tek kullanımlık giriş bağlantısı (magic link) yolu değil.
- Bağlantı 1 saat geçerli, tek kullanımlık.
- Ekran, e-posta kayıtlı olsun olmasın aynı cevabı verir: "If an account exists for this email, we sent a reset link." Bir e-postanın Newfork'ta olup olmadığı dışarıdan anlaşılmaz.
- E-posta davetlerin gittiği yoldan (Resend) gider. Uygulama: BL-137.

## Katılım ve giriş akışı (eski §1.2)

Kaynak: Mert'in 2026-09-16..30 cevapları; hepsi 2026-10-01'de "doğru aktarılmış" diye onaylandı (KARAR-001). Neden: kullanıcı zorlanmaz, niyeti sorulur, ilerlemesi kaybolmaz (ILKELER P10).

- **Girişten sonra yönlendirme.**
  - Bekleyen yeni davet her girişte ilk ekranda "Active invitation found" olarak gösterilir. **Ekranın görünümü A — sade liste (kullanıcı kararı 2026-10-05, Mert, kayıt oturumu `local_d96f34f3…`'ın penceresinde, çoktan seçmeli; üç varyant prototipte gösterildi, önerilen yoktu — görsel seçim, P04):** Workspaces ekranının dili; tek sütun, her davet bir satır (workspace adı, "Expires in N days", beyaz Decline, yeşil Join); altında beyaz "Not now" ve tek satır "Takes you to Workspaces, where the invitation stays listed."; workspace'i olmayan kişide "Not now" yok. Reddedilen: B (büyük kart + "After you join" paneli), C (karartılmış uygulamanın üstünde pencere). Gerçek uygulamada ekran yok (`resolveLanding.ts:119-123` daveti atlayıp workspace'e indiriyor); prototipte var.
  - "Not now" denirse tek workspace varsa oraya, birden fazla varsa davetin de listelendiği seçim ekranına gidilir.
  - Tek workspace'i olan kişi doğrudan rolüne göre ilgili ekrana iner.
- **Davetin önceliği.** Hiç workspace'i olmayan ve bekleyen daveti olan kişi önce daveti kabul ya da reddeder (sert engel). Daha önce işletme kurmuş kişi bekleyen davet yüzünden durdurulmaz.
- **"Create your own business" görünürlüğü** (son açık karar 2026-09-18 10:03).
  - Yalnız 0 ya da 1 bekleyen davet varken, uygun ekranda görünür.
  - 2 bekleyen davet varsa, ya da 1 davet ve en az 1 yarım kurulum varsa gizlenir.
  - Reddedilenler: "her zaman görünsün" ve "2+ ise gizlensin" (tek başına).
- **Kendi işletmesini açma.** Owner olmadığı bir workspace'te aktif üyeliği bulunan hesap kendi işletmesini açamaz; bunun için ayrı hesap gerekir.
- **Welcome back.**
  - Owner kurulumunu yarıda bırakan kişi zorla kuruluma sokulmaz.
  - Ekran davetleri ve yarım işi listeler, "Create" ve "I am waiting for another invitation" seçeneklerini sunar, niyeti sorar.
  - Bir kez karşılanmış kişi (workspace'i kapansa, devretse ya da çıkarılsa da) yeniden "yeni" sayılmaz.
- **Kurulumdan çıkmak vazgeçmek değildir.**
  - İlerleme kaydedilir; kişi kaldığı yerden sürdürür. Yarım kurulumda "Continue setup" ve "Discard" bulunur.
  - Kaybedilecek kişi ya da veri yoksa silmek için parola istenmez. Bu eylem "start over"dan ayrıdır.
- **"Create" düğmesi** doğrudan kurulumun ilk adımını açar. Arada workspace adı penceresi ya da hesap ayarları sayfası yoktur.
- **Üyelik durumları.**
  - terminated: listeden tamamen düşer.
  - pending ya da suspended: listede görünür ama erişim vermez.
  - Aktif üyelik yoksa "no organization" ekranı açılır.
- **Çalışan kurulumunda sıfırlama (reset) yoktur.** Testler ve kod buna göre yazılır.
- **Favori workspace.** Favori ya da varsayılan işaretlenen workspace sunucuda saklanır ve cihazlar arası geçerlidir. İşaretli yoksa sistem tahmin etmez, her girişte sorar.
- **Kurulum bitmeden davet yok (kullanıcı kararı 2026-10-01 ~17:45Z, kayıt oturumunun penceresinde, çoktan seçmeli; tazelik `27d540be`; BL-419):** kurulumu bitmemiş (taslak) workspace'ten davet gönderilemez; ekranda yol zaten kapalı, API de reddeder. Bugün API'de kontrol yok (`apps/api/src/app.ts:544`). Örnek: Mert "Beyoğlu"nu kurarken 2. adımda bıraktıysa API'den Ali'ye davet atamaz. Reddedilen (önerilen): "kabul, böyle kalsın". Uygulama: davet rotasına kurulum-bitti kontrolü + test (G17).
- **İlk kez gelen kişinin karşılama ekranında ikinci düğme "I am waiting for an invitation" (kullanıcı kararı 2026-10-05 ~17:20Z, Mert, koordinatör `local_b9b956a0…`'ın penceresinde, çoktan seçmeli, önerilen; besleme #203).** "Welcome to Newfork" ekranının ikinci seçeneği bu metni taşır. Neden: Mert önerileni seçti. Reddedilen: "I have an invitation".
- **S-86** Giriş ve katılım (EKRAN-16 keşfi): (K3) hiç bitmemiş ve Discard edilmiş kurulum taslağı hiçbir listede görünmez; (K5) kişinin askısı ile workspace'in askısı ayrı cümleyle anlatılır ("Your access to <workspace> is on hold."); (K7) yerine yenisi gönderilmiş davetin eski bağlantısı "A newer invitation was sent to you. Open the latest email." der; (K8) kurulum sonunda gitmeyen davetler kurulumu geri almaz, Workspace'te tek satır uyarı çıkar ("2 invitations didn't go out. Send them from Employees."). Dayanak: P09, P21. K6 (arşivleme daveti iptal eder) S-87'de. (KK-209'dan, `ekranlar/16-giris-katilim/OZET.md` §4; 2026-10-07, koordinatör, onaysız)

## Ekran kararları (eski §1.5'ten)

### Giriş ekranları (Sign in, Forgot password, Reset password)
- Sign in'de ikinci düğme (giriş ↔ hesap oluşturma) hiç yeşil değil, beyaz: ekrandan çıkışın ikinci yolu. dönüş yolu (eski adıyla `?from=`; kodda artık sayfa geçiş durumu, adres parametresi değil — EKRAN-16 K12, 2026-10-07) yalnız aynı origin'deki `/` ile başlayan yola gider, gerisi `/app`.
- Forgot password hesap olsun olmasın aynı metni gösterir ve sunucu her cevabı sabit ~1,5 sn'de verir: bir e-postanın kayıtlı olduğu ne metinden ne süreden anlaşılmaz. Hız sınırı (ölçüldü 2026-10-05, `apps/api/src/account/password-reset.ts:12-18`): aynı e-postaya 15 dakikada en çok bir e-posta (bu sürede yeniden istenirse aynı cevap, önceki bağlantı geçerli), aynı adresten saatte en çok 10 istek; sayaç veritabanında (BL-162 kapandı). Önceki metin "e-posta başına saatte 3" eskimişti (prototip turu, Q1).
- Reset password belirteci bağlantının `#` parçasında taşınır (sunucuya gitmez, log'a düşmez) ve sayfa açılınca değil "Save password"da harcanır (e-posta tarayıcısının önden açması tüketmesin). Parola en az 8.
  *(Düzeltme 2026-10-07, EKRAN-16 keşfi K12: Supabase'in yerel ayarı da 8; eski "sınırı 6 (BL-161)" notu eskimişti.)*

### Kurulum sihirbazı (owner onboarding)
- 3. adım "What jobs do people work?": yalnız Management departmanı varken "Your structure" altında "<Management adı> comes with every workspace. Add a department for the jobs your team works." yazar; Continue kapalıdır (kullanıcı kararı 2026-09-30, BL-480 varyant B, `37912a90`).
- 4. adım "Add your team" → Jobs: "Owner" işi işaretsiz, kilitli ve adı soluk; nedeni ekran okuyucuya okunur. Cümle ve kilit görünümü Employees çekmecesindekiyle aynı: Owner işini yalnız workspace owner'ı taşır (kullanıcı kararı 2026-09-30, BL-489, `bc7c5ebc`).
- **S-90** Owner kurulumunun "Add your team" adımında "Invitations go out when you finish setup." satırı yok; onay kutusunu tekrarlıyordu (P20, P21). (KK-148'den; 2026-10-05, koordinatör, onaysız)

## Ürün ve ekran kararları (eski §4'ten, S- kimlikli)

- **S-118** Giriş modeli (EKRAN-16 B1, `authmodel`) e-posta servisi bağlanınca kararlaştırılır; o zamana kadar işi durduran soru değildir ve yeniden sorulmaz. Giriş ve katılım ekranı bekler, öteki ekranlar beklemez. Not: canlıda e-posta anahtarı yok, davet ve parola sıfırlama e-postaları da gitmiyor (BL-027). **Ek (2026-10-19):** e-posta 17 Ekim'den beri canlıda (ilk canlı e-posta 17 Ekim 00:07 PT, no-reply@notify.tepebash.com; Vercel'de RESEND_API_KEY ve EMPLOYEE_INVITE_FROM tanımlı); bu kararın koşulu gerçekleşti, giriş modeli sorusu davet/erişim turunda (S-203) ele alınır. Canlıda uçtan uca davet e-postası henüz denenmedi. (Mert, 2026-10-09 04:19Z, ilerleme raporu)
- **S-195** Bekleyen davet girişte sorulur (Mert, 2026-10-19 ~14:30 PT, BL-624 oturumu, iki soru kutusu). (1) "Başla, iniş işiyle birlikte": giriş ekranlarının devir bekletmesi (ProtectedRoute, WorkspaceHubPage) kalkar, BL-926 (tek iniş kuralı) aynı işte. (2) KARARLAR §1.2 "her girişte" = Sign in + uygulamanın her yeni açılışı (yeni sekme); aynı sekmede "Not now" sonrası tekrar sorulmaz. Oturumun küçük kararları: bağlantıyla açılan sayfada "Not now" o sayfaya döner; tek workspace'te "Not now" altında "Takes you to <ad>. The invitation stays listed in Workspaces."; yarım kurulumu olan da "Not now" görür (sert engel yalnız hiç workspace'i olmayanda). Kod: BL-624.
