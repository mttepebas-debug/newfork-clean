KARAR: ONAY @3dee00d5

# FB-6.2 Dal B `.7a` — görsel QA (nf-gorsel-qa, 2026-09-30)

Dal `task/fb62-core-b-7a` @ `3dee00d5`, worktree `.claude/worktrees/trusting-edison-227b8b` (detached).
Sunucular: web 5616 / API 5617 (atanmış portlar, boştu). Migration yok, ortak yerel DB olduğu gibi.
Engel yok. Aşağıdaki iki "takip" maddesi bu dalın sözleşmesini bozmuyor; `.8` / `nf-arayuz`'a gitmeli.

## 1. Nerede duruyor
Bitti. İstenen tüm ekranlara masaüstü 1440 ve telefon 390'da bakıldı. İki eksik var: world owner hesabıyla giriş
yapılamadı (madde 3) ve Schedule'daki yetkisiz dal yalnız tarayıcı taklidiyle görülebildi (gerçek kişi yok).

## 2. Ne doğrulandı (etkisi)
**Employees → kişi çekmecesi, düğmeler kişiye göre (sunucunun `allowed` cevabı):**

| Bakan | Açılan kayıt | Alt çubuk | Access bölümü |
|---|---|---|---|
| owner (seed `owner@newfork.test`, Meyhouse) | Alex Kim (employee) | Terminate · Cancel · Save changes | rol seçici açık: Admin / Manager / Employee; Remove access var; Remove photo var |
| admin Zeynep | Olcay (owner) | yalnız Cancel | rol "Owner" kilitli; Remove access yok; Remove photo yok |
| admin Zeynep | Emre (employee) | Terminate · Cancel · Invite · Save changes | rol seçici: Manager / Employee (Admin yok, doğru); Remove access var |
| admin Zeynep | Ayse (manager) | Terminate · Cancel · Invite · Save changes | rol seçici: Manager / Employee |
| manager Ayse | Zeynep (admin) | yalnız Cancel | bölüm yok (Access, Documents gizli) |
| manager Ayse | Emre (employee) | Cancel · Save changes (Terminate yok) | bölüm yok |
| manager Ayse | kendi kaydı | yalnız Cancel | bölüm yok |
| manager Ayse | Mehmet (Beşiktaş, kapsam dışı) | erişim-yok kartı | — |
| manager Mehmet | Emre (Kadıköy, kapsam dışı) | erişim-yok kartı | — |

Salt okunur kayıtta e-posta alanı da kilitleniyor (Alex'te açık, Olcay'da gri).

**Erişim-yok kartı:** kilit simgesi, "You don't have access to this employee", "Your role or your locations don't
include it.", "Ask an admin for access.", yeşil "Back to Home" (Workspace'e gider). Masaüstü ve telefonda düzgün,
ortak `NoAccessState` görünümüyle aynı. Bilinen not doğrulandı: sol sütun "N / Employee details / Code assigned on
save", bölüm sekmeleri ve başlıkta "Profile — Identity and manager-owned contact details" kalıyor (`.8`).

**Giriş sonrası açılış:** owner, admin Zeynep, manager Ayse ve Mehmet → Workspace; employee Emre → Employee Hub.
Emre `/app/employees`, `/app/schedule`, `/app/availability`'a gidince Employee Hub'a dönüyor. "Hiç izni olmayan kişi
hub'a düşer" dalı: test dünyasında böyle bir kişi yok, görülmedi (birim testi var).

**Availability:** gerçek izinle kişi ve gün düğmeleri açık, tıklayınca çekmece açılıyor. `employee.read`
çıkarılınca (taklit, aşağıda) 4 kişi düğmesi ve 28 gün düğmesinin hepsi pasif, imleç normal; `?employeeId=` ile
doğrudan bağlantı da çekmece açmıyor. Pasif satırlar soluklaşmıyor, metin okunaklı kalıyor.

**Schedule:** gerçek izinle kişi adına tıklama çekmeceyi açıyor; `employee.read` yokken hiçbir şey açmıyor.

## 3. Bulgular

### Takip (engel değil)
1. **Schedule → ızgaranın solundaki kişi adı, `employee.read` olmayan kişi için ölü düğme.**
   `apps/web/src/views/SchedulePage.tsx:2650` tıklamayı yutuyor ama
   `apps/web/src/schedule/components/ScheduleEmployeeCard.tsx:61` hâlâ `<button>`: imleç el (pointer), Tab ile odak
   alıyor, basınca hiçbir şey olmuyor. Beklenen: yetki yoksa düz metin ya da pasif düğme (Availability'deki gibi).
   Klavye kullanıcısı için yanıltıcı. Neden engel değil: bugünkü varsayılan rollerin hiçbirinde "Schedule'ı görür ama
   çalışan kaydını okuyamaz" kişi yok (admin, iki manager, employee denendi); yalnız özel rolde çıkar. İşçi de yolda
   bulmuş (`nf-arayuz`). Kanıt: `schedule-ayse-strip-click-desktop.png`, `schedule-ayse-strip-hover-desktop.png`.
2. **Erişim-yok çekmecesi yeni kayıt başlığını gösteriyor** ("N", "Employee details", "Code assigned on save",
   bölüm sekmeleri, alt çubukta "Cancel"). Bilinen not, `.8`. Kanıt: `manager-mehmet-noaccess-profile-desktop.png`.

### Yolda bulunan, bu dalın değişikliği değil (backlog adayı)
3. **Test dünyasının owner hesabıyla giriş yok, sihirli bağlantı da yok.** Parola girişi GoTrue 500 (işçinin
   bildirdiği); `/auth/v1/otp` da 500 "Database error finding user". Neden: `auth.users` satırında
   `confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new` NULL (GoTrue boş metin bekliyor);
   diğer world kişilerinde sorun yok. Builder owner'ı kurarken bu dört sütuna `''` vermeli (`nf-test`). Bu yüzden
   "owner kendi kaydını düzenleyebiliyor" görülemedi; owner'a seed `owner@newfork.test` (Meyhouse) ile bakıldı, o
   hesabın kendi çalışan kaydı yok.
4. **Aktif ve bağlı çalışanda alt çubukta "Invite"** (admin → Emre / Ayse, "Onboarded and linked" iken).
   Koşul `apps/web/src/employees/EmployeeDrawer.tsx:1281` civarı bağlı kullanıcıya bakmıyor; bu dal değiştirmedi.
5. **Telefonda "Terminate employee" hiç görünmüyor:** `apps/web/src/styles.css:2644` telefonda alt çubuğun sol
   kısmını `display: none` yapıyor; dal CSS'e dokunmadı. Telefondan işten çıkarma yolu yok.
6. **Salt okunur kayıtta "Profile photo removal" başlığı ve açıklaması kalıyor, düğme yok** (admin → Olcay).

### Öneri (zevk)
- Yalnız okunabilen çekmecede tek düğmenin adı "Cancel"; "Close" daha doğru (iptal edilecek bir şey yok).

## 4. Ekranda ne değişti (gözlenen)
- Employees çekmecesi: düğmeler kişiye göre; kapsam dışı kişide kilitli erişim-yok kartı.
- Availability: yetkisizde kişi / gün düğmeleri pasif (görünüm aynı).
- Schedule: yetkisizde kişi adı tıklanınca bir şey açmıyor (görünüm aynı, madde 1).
- Açılış sayfası: rollere göre görünür değişiklik yok (Workspace / Employee Hub).
- Tasarım kuralları: buton dili doğru (Save yeşil, Cancel beyaz, Remove access kırmızı iki tık, Terminate kırmızı
  metin düğmesi); tarayıcı diyaloğu yok; metinde kod adı yok. Komşu ekranlarda (Employees listesi, Schedule ızgarası,
  Availability tablosu, Workspace) regresyon görülmedi.

## 5. Sırada ne var
1. `nf-guvenlik` onayıyla main'e (T5b `.4` ile).
2. `.8` / `nf-arayuz`: madde 1 (Schedule ölü düğme) ve madde 2 (erişim-yok başlığı).
3. `nf-test`: madde 3 (world owner'ın NULL sütunları); e2e'de owner girişi gerekirse kırılır.
4. Backlog adayı: madde 4 (bağlı çalışanda Invite), madde 5 (telefonda Terminate yok), madde 6.

## Kanıt
- Roller: owner (seed `owner@newfork.test`, Meyhouse), admin Zeynep, manager Ayse (Kadıköy), manager Mehmet
  (Beşiktaş), employee Emre (World e2e1790265977849). Girişler gerçek giriş ekranından.
- Yetkisiz dal: Playwright `route` ile yalnız tarayıcıda `/v1/context` cevabının `actions` listesinden
  `employee.read` çıkarıldı (DB'ye ve sunucuya yazma yok); aynı betik taklitsiz de koşuldu, karşılaştırıldı.
- DB yalnız okundu (`select`): world üyelikleri ve rolleri, çalışan kimlikleri, owner satırının NULL sütunları.
- Ekran görüntüleri (bu klasör, 1440×900 ve 390×844): `landing-*`, `owner-alex-*`, `admin-olcay-owner-*`,
  `admin-emre-*`, `admin-ayse-manager-*`, `manager-zeynep-admin-*`, `manager-emre-*`, `manager-self-*`,
  `manager-mehmet-noaccess-*`, `manager2-emre-noaccess-*`, `schedule-*`, `availability-*`.
- Kurulum: `pnpm.cmd install`, shared + ui build, `.env.local` (web, api) ana klasörden; vite `--force` ile açıldı.
