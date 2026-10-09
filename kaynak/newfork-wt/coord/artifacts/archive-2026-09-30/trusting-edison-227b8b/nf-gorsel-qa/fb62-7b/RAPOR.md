KARAR: DEĞİŞİKLİK İSTE @0806cc62

# FB-6.2 `.7b` — görsel QA (nf-gorsel-qa, 2026-09-30)

`origin/main` @ `0806cc62` (`.7b` + `.7b-db`), migration `20260930180000` ortak yerel DB'de. Worktree
`.claude/worktrees/trusting-edison-227b8b` (detached). Sunucular web 5616 / API 5617. Web ve shared kodu
incelenen dal `893cc89f` ile aynı (`git diff 893cc89f HEAD -- apps/web packages` boş).

## 1. Nerede duruyor
Bitti. İki değişiklik isteniyor (madde 1, 2): biri `.7a`'da doğru olan bir görünümü bozuyor, öbürü koordinatörün
beklediği davranışı ("davet düğmeleri yalnız hesabı bağlı olmayanda") karşılamıyor. Madde 3 tutarsızlık, aynı
düzeltme dalında ya da `.8`'de yapılabilir.

## 2. Ne doğrulandı (etkisi)
**Employees → çekmece → Employment:**

| Bakan | Kayıt | Görülen |
|---|---|---|
| owner (seed, Meyhouse) | Alex Kim | "Remove from Main Dining" |
| owner | Jordan Lee (iki lokasyon) | "Remove from Main Dining", "Remove from Garden Room" |
| owner | Local Employee (lokasyonsuz) | düğme yok (doğru) |
| admin Zeynep | Ayşe (manager) | "Remove from Kadikoy" + "Manages without working there" (Besiktas, Kadikoy kutuları, "Save managed locations") |
| admin Zeynep | Emre | "Remove from Kadikoy"; yönetilen grup yok (doğru, yönetici değil) |
| admin Zeynep | Olcay (owner) | hiçbir düğme yok; alt çubukta yalnız Cancel |
| manager Ayşe | Emre | "Remove from Kadikoy" |
| manager Ayşe | Zeynep (admin), kendi kaydı | hiçbir düğme yok |

Bir tık düğmeyi "Confirm remove from <lokasyon>" hâline getiriyor, ikinci tık gerekiyor (iki tık kırmızı kuralı
tamam). Başlık metni: "Their shifts there from now on are left open. The employee record stays." İkinci tık
basılmadı (veri yazılmadı).

**Access:** admin'in açtığı Olcay'da (owner) Access bölümü artık yok (sunucu hiçbir erişim işine izin vermiyor, doğru).
Manager Ayşe, Emre'de Access'i görüyor (rol seçici + Remove photo; Remove access yok, doğru). Owner, Jordan'da
(hesap yok, e-posta yok) "Add email" görüyor, alt çubukta Invite yok (e-posta olmadığı için, doğru).

**Employee Hub (`/app/employee-hub`), bu commit'te yeniden koşuldu:** admin Zeynep, manager Ayşe ve employee Emre
çalışan arayüzünü görüyor. Kısa yollar (My schedule, Request time off, My availability, Open shifts) doğru sayfalara
gidiyor. Kendi çalışan kaydı olmayan owner (seed `owner@newfork.test`) "You don't have access to Employee Hub"
kartını ve "Back to Home" düğmesini görüyor (Workspace'e gider).

## 3. Bulgular

### Değişiklik isteniyor
1. **Profile: gizli profil satırı olmayan kişide owner bile Date of birth, Phone, Emergency contact ve adres
   alanlarını göremiyor.** `.7a`'da owner, Alex Kim'de bu alanları "Not provided" olarak görüyordu
   (`artifacts/nf-gorsel-qa/fb62-7a/owner-alex-profile-desktop.png`). Şimdi yalnız E-mail kalıyor
   (`owner-alex-profile-desktop.png`, `owner-local-onboarding-profile-desktop.png`). Neden: sunucu satır yoksa da
   izin yoksa da aynı cevabı veriyor, `private_contact: null`
   (`supabase/migrations/20260930180000_the_drawer_reads_what_the_core_allows.sql:101-102`, "private_profile.employee_id
   is null or not reads_private"). Ekran bunu "okuma izni yok" diye yorumluyor
   (`apps/web/src/employees/EmployeeDrawer.tsx:1920`, `canReadPrivate = privateContact !== null`). Sonuç: aynı owner,
   Emre'de (satırı var) alanları görüyor, Alex'te (satırı yok) görmüyor. Aynı ekran kişiden kişiye farklı
   düzende açılıyor. Legal name review paneli de aynı koşula bağlı (`:1921`). Beklenen: "izin var, satır yok" ile
   "izin yok" ayrı cevaplar almalı (ör. izin varsa boş nesne, yoksa null).
   DB (salt okunur): Alex Kim ve Local Employee için `employee_private_profiles` satırı yok, Emre için var.
2. **"Invite" düğmesi hesabı bağlı kişide de görünüyor.** Admin → Emre ve Ayşe, manager → Emre, owner → Local
   Employee: alt çubukta yeşil "Invite", Access'te aynı anda "Onboarded and linked" yazıyor
   (`manager-emre-access-desktop.png`, `admin-emre-access-desktop.png`). Sunucu cevabı: hesap bağlı
   (`user_id` dolu) ve `allowed.invite: true` (Emre'nin daveti `accepted`). Alt çubuk koşulu hesabın bağlı olup
   olmadığına bakmıyor (`EmployeeDrawer.tsx:1329-1332`: `!readOnly && canManageAccess && draft.invitation_email`).
   Koordinatörün beklentisi "davet düğmeleri yalnız hesabı bağlı olmayanda" karşılanmıyor. Beklenen: hesap bağlıysa
   Invite yok (sunucu `allowed.invite`'ı bağlı kayıtta false vermeli ya da ekran `user_id`'ye bakmalı; hangisi
   olacağı `nf-backend`'in kararı). Önceden de vardı (`.7a` raporu madde 4), ama artık izin sunucudan geldiği için
   düzeltme yeri netleşti.

### Tutarsızlık (aynı düzeltme dalında ya da `.8`'de)
3. **"Manages without working there" listesi, kişinin zaten çalıştığı lokasyonu da sunuyor.** Admin → Ayşe:
   Ayşe Kadıköy'de çalışıyor (Locations'ta işaretli, Primary), ama yönetilen listede de "Kadikoy" kutusu var
   (`admin-ayse-manager-employment-desktop.png`). "Çalışmadan yönetir" anlamıyla çelişiyor. Beklenen: kişinin
   Locations'taki lokasyonları bu listede olmasın (ya da sunucu reddetmeli; hangisi, `nf-backend`).
   Ayrıca grup biçimsiz: başlık, kutular ve düğme tek satırda; telefonda "Kadikoy" düğmeyle aynı satıra kırılıyor
   (`admin-ayse-manager-employment-phone.png`). Görünüm `.8`'in işi, burada yalnız not.

### Takip / öneri
4. **Manager → Emre:** rol seçici açık ama içinde yalnız "Employee" var, seçilecek başka bir şey yok. Tek seçenekli
   açık seçici yanıltıcı; pasif olmalı.
5. **Employee Hub, kaydı olmayan owner:** kart "Ask an admin for access." diyor; workspace sahibine anlamsız
   (`.8` metin). Koordinatörün beklediği metin "Back to workspace" idi, kart ortak metinle "Back to Home" diyor.
6. **Employee Hub, admin ve manager:** çalışan arayüzü yönetici kabuğunun içinde açılıyor: masaüstünde sol yönetici
   menüsü (hiçbir öğe seçili değil), telefonda alt yönetici menüsü (Workspace / Schedule / Requests / Employees /
   More). Emre'de alt menü çalışan menüsü (Home / Schedule / Requests / More). Menü `.8`'de.
7. **Lokasyon iki yoldan çıkarılabiliyor:** Locations kutusunu kaldırıp Save changes ya da "Remove from <lokasyon>".
   İkisinin sonucu farklı mı (vardiyaların boşa çıkması)? Kişi için belirsiz; `.8` metin / yerleşim.
8. **Legal name review paneli canlı görülemedi:** yerel DB'de incelemesi bekleyen profile gereksinimi olan kimse yok
   (select ile arandı). Madde 1 düzelince bu panel de aynı koşula bağlı olduğundan birlikte kontrol edilmeli.

## 4. Ekranda ne değişti (gözlenen)
- Employees → çekmece → Employment: kırmızı "Remove from <lokasyon>" düğmeleri; yöneticide "Manages without working
  there" grubu (biçimsiz).
- Employees → çekmece → Profile: gizli profil alanları kişiden kişiye kayboluyor (madde 1).
- Employees → çekmece → Access: kişiye göre görünüyor; owner kaydında artık yok.
- `/app/employee-hub`: admin ve manager çalışan arayüzünü görüyor; kaydı olmayan owner erişim-yok kartını.
- Tasarım kuralları: iki tık kırmızı doğru; tarayıcı diyaloğu yok; metinde kod adı yok. Employees listesi, Workspace
  ve Hub kısa yollarının açtığı sayfalarda regresyon görülmedi.

## 5. Sırada ne var
1. Düzeltme dalı (KK-37): madde 1 (gizli profil null anlamı, `nf-db` + `nf-backend`), madde 2 (bağlı hesapta Invite),
   isterse madde 3.
2. `.8` (`nf-arayuz`): madde 3'ün görünümü, 4, 5, 6, 7.
3. Düzeltmeden sonra aynı çekmece yeniden görsel QA (owner / admin / manager, Profile + Access), madde 8 dahil.

## Kanıt
- Roller: owner (seed `owner@newfork.test`, Meyhouse; world owner girişi hâlâ bozuk, `.7a` raporu madde 3), admin
  Zeynep, manager Ayşe (Kadıköy), employee Emre (World e2e1790265977849). Girişler gerçek giriş ekranından.
- Sunucu cevabı tarayıcıda yakalandı (GET `/v1/workspaces/:w/employees/:id`): `user_id`, davet durumu, `allowed`,
  `locations[].removable`, `managed_locations`, `private_contact` dolu mu.
- DB yalnız okundu: migration kaydı, `employee_private_profiles` satırları, bekleyen onboarding incelemesi.
- Yazan düğmeye basılmadı; "Remove from" düğmesine yalnız bir kez (onay durumu) basıldı.
- Ekran görüntüleri (bu klasör, 1440×900 ve 390×844): `owner-alex-*`, `owner-jordan-notinvited-*`,
  `owner-local-onboarding-*`, `admin-ayse-manager-*`, `admin-emre-*`, `admin-olcay-owner-*`, `manager-emre-*`,
  `manager-zeynep-admin-*`, `manager-self-*`, `*-employment-remove-armed-desktop`, `hub-*`.
