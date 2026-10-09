# EMP-001 dilim A — Employees çekmecesinin görünüm yenilikleri

Rol: `nf-arayuz`. Dal: `task/emp-001-a` (push edilmedi). Worktree:
`C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\goofy-wescoff-7931db`.
Taban: `origin/main` `81fd0dd3` (iş sırasında main iki kez ilerledi, dalı üstüne taşıdım).
Son commit: `fcd26bfd`. Tarih: 2026-09-30.

Not: kapı `9a2b93b1` üzerinde koştu; sonra main'e giren tek commit (`81fd0dd3`,
yalnız `docs/`) için yeniden taşıdım. `git diff 9a2b93b1 fcd26bfd -- apps packages e2e`
boş: test edilen kod ile son commit'in kodu aynı, yeniden koşmadım.

Ekran: Employees → bir kişiye tıkla → sağdan açılan çekmece; Profile ve
Employment sekmeleri.

## 1. Nerede duruyor

Bitti; bir soru açık (telefonda üç ad alanı: alt alta mı, tek satır mı — bölüm 3).
Kod commit'li, kapı yeşil, ekran görüntüleri çekildi.

## 2. Ne yapıldı (etkisi)

Madde başına hüküm:

| # | Madde | Hüküm | Kanıt |
|---|---|---|---|
| 1 | Sekme başlığının altındaki açıklama satırı | **Değişti** — altı sekmede de silindi, başlık kutusu 82px → 56px | `EmployeeDrawer.tsx:1010` (başlıkta yalnız `<h2>`), `sectionDescription` silindi (`grep -c` → 0); `styles.css:1703` |
| 2 | First / Middle / Last aynı satır | **Yeni yapıldı** — Middle dar (206 / 144 / 206 px) | `EmployeeDrawer.tsx:1967`, `styles.css:1734` |
| 3 | Preferred name ile Date of birth aynı satır | **Yeni yapıldı** | `EmployeeDrawer.tsx:2012` (Date of birth, Preferred name'in hemen ardında) |
| 4 | Input altı yardım yazıları | **Profile: değişti** (üç yazı kalktı). **Employment: zaten yoktu** (Start date ve Internal note'un altında yazı yok) | `EmployeeDrawer.tsx:1955` (neden artık `lockedReason`), `:2927` (ekran okuyucu metni) |
| 5 | Doğrulanmış e-mail: inputun içinde yeşil onay | **Yeni yapıldı** — erişilebilir ad "Verified" | `EmployeeDrawer.tsx:2034`, `:2910`; `styles.css:1862` |
| 5b | Bekleyen davet: saat simgesi + kilitli görünüm | **Kilit zaten vardı**, görünüm ve simge **yeni** | Kilit: `origin/main` `b406ca9e` `EmployeeDrawer.tsx:2028` (`readOnly={linked \|\| invitePending}`), adlar `:1964/1977/1990`. Simge: `:2034` |
| 7 | Jobs departmana göre gruplu | **Yeni yapıldı** — veri hazırdı (`employee-data.ts:49-62`), liste düzdü (önceki görüntü: `before/before-employee-employment-1280.png`) | `EmployeeDrawer.tsx:3073` (`byDepartment`), `:3002`, `:2251`; `styles.css:1979` |

5b ölçümü (sorduğun soru): bugün davet bekliyorken e-mail **düzenlenemiyordu**
(salt okunur, altında "Locked while invitation is pending" yazıyordu). Yani
kilitlemek davranış değişikliği değil; sormadan yaptım. Yanlış adresi düzeltme
yolu eskisi gibi: Access sekmesi → "Revoke invitation", sonra adres açılır.

Kişi için ne değişti:
- Bir kişinin Profile sekmesi daha yukarıdan başlıyor; aynı satırdaki alanlar
  artık aynı hizada. Önce "Last name" ile "Preferred name" arasında 11px kayma
  vardı (ölçüm: 267–307 / 278–318); şimdi her satırda üst ve alt kenar eşit.
- Hesabı bağlı kişinin adresinin sonunda yeşil onay, davet bekleyenin adresinin
  sonunda saat var; ikisinde de alan gri (değiştirilemez) görünüyor.
- Employment'ta işler "BAR", "FOH", "Management" gibi departman başlıklarının
  altında; aranan iş daha çabuk bulunuyor.

Yolda, işin önünde olduğu için düzelttiğim tek şey: owner'ın kendi kaydındaki
"Save emergency contact" düğmesi hizalama değişince etiket satırına kaymıştı;
input satırına geri oturttum (`EmployeeDrawer.tsx:3248`, `styles.css:1851`).

### Verdiğim kararlar (hepsi tek satırlık CSS/JSX ile geri alınır)

| # | Karar | Neden |
|---|---|---|
| D1 | Üç ad 1 / 0,7 / 1 oranında | Eşit bölününce her biri 185px kalıyordu; soyadı için dar. Şimdi First ve Last 206px, Middle 144px; "Middle name optional" etiketi sığıyor |
| D2 | Telefonda (≤640px) üç ad alt alta | Çekmecedeki bütün alanlar telefonda tek sütun; tek satırda 125 / 88 / 125px kalıyor, "Middle name optional" iki satıra kırılıp hizayı bozuyor (görüntü: `what-if/phone-names-one-row-employee-profile-390.png`). **Soru olarak açık, bölüm 3** |
| D3 | Simge inputun sağ ucunda | "Adresin sonunda"yı alanın sonu olarak okudum; metnin hemen bitişiğine koymak metin genişliği ölçmeyi gerektirir |
| D4 | Salt okunur her alan aynı gri görünümde (doğrulanmış e-mail dahil) | Görev dosyası K1 ile aynı yön. Açıklama yazısı kalkınca beyaz ama yazılamayan alan yanıltıcı olurdu. Doğrulanmış e-mail önceden beyazdı, yanındaki Phone griydi |
| D5 | Kilit nedeni fare üstünde ipucu olarak da çıkıyor (`title`) | Görünür metin yok; gören kullanıcı da nedeni bulabilsin |
| D6 | Zorunlu alanın altında boş satır ayrılmıyor | Hizayı bozan buydu. Doğrulama hatası çıkınca alan aşağı doğru uzar; inputlar hizada kalır (K1: hata metni alanın altında) |
| D7 | Departmansız işler "No department" başlığıyla, Management'ın hemen üstünde | Settings → Jobs aynı adı kullanıyor. Hiçbir iş bir departmanda değilse başlık çıkmaz, liste düz kalır |
| D8 | Yeni kişi ekleme ("New employee") başlığı da 56px oldu | Aynı başlık kuralı; orada zaten açıklama satırı yoktu |

## 3. Açık kalan ve nedeni

1. **Soru (telefon):** Görev dosyası Done when A.2 "390px'te … Middle, First ile
   Last'tan dar" diyor; bu, telefonda da tek satır olarak okunabilir. Ben alt
   alta bıraktım (D2). Seçenekler:
   - **Alt alta (önerim, şu anki hâl):** hizalı, okunaklı, çekmecenin geri kalanıyla aynı.
   - **Tek satır:** 125 / 88 / 125px; "optional" etiketi kırılıyor. İstenirse
     etiketin "optional" kısmını telefonda gizlemek gerekir (metin kararı).
2. **Görev dosyası Done when A.4 ile mesajın çelişkisi:** dosya
   `grep "Locked after activation\|Locked while invitation is pending\|Verified account e-mail" apps/web/src` → 0 istiyor.
   Mesajın ise "neden ekran okuyucuya kalır" diyor. Mesaja uydum: iki kilit
   cümlesi kaynakta duruyor (`EmployeeDrawer.tsx:1956,1958`, ekranda görünmez) ve
   testte geçiyor. "Verified account e-mail" koddan çıktı (yalnız "yok" diyen
   testte adı geçiyor). Ölçüm: grep 5 satır (2 kaynak + 3 test).
3. **e2e koşmadım:** `e2e/**` kapsam dışıydı (`nf-test` `.10`). Sildiğim metinlerin
   hiçbiri `e2e/` altında geçmiyor (grep 0). `invite.spec.ts:87`'nin dayandığı
   `getByLabel("E-mail")` manager okuyucuda 1 öğe (gerçek tarayıcıda saydım).
4. **Owner'ın kendi kaydı görüntüsü kısmen sahte:** e2e dünyasının owner'ı yerelde
   giriş yapamıyor (sihirli bağlantı gelmiyor). Seed owner ile girip kişi okumasını
   tarayıcıda "bu senin kaydın, rolün Owner" diye cevaplattım
   (`owner-own-record-*.png`). Sayfanın geri kalanı gerçek.
5. `nf-gorsel-qa` koşmadı (senin kararın: B ve C ile birlikte).

## 4. Ekranda ne değişti

**Employees → çekmece → bütün sekmeler:** başlığın altındaki gri açıklama satırı
yok; başlık kutusu kısa.

**Profile:**
- Identity: 1. satır First name | Middle name | Last name; 2. satır Preferred
  name | Date of birth. Bekleyen tercih adı kutusu ("Asked to be called …") artık
  Date of birth'ten sonra geliyor.
- Alanların altındaki "Locked after activation", "Locked while invitation is
  pending", "Verified account e-mail" yazıları yok.
- E-mail: bağlı hesapta yeşil onay, bekleyen davette sarı-kahve saat; alan gri.
- Contact ve Address satırları sıkılaştı (salt okunur alanların altındaki 15px boşluk kalktı).

**Employment:** Jobs listesi departman başlıkları altında; Management en altta.

**Employees → Add employee:** başlık kısa; üç ad tek satırda.

### Silinen / değişen kullanıcı metinleri (e2e seçicileri için)

Silinen (ekranda artık yok):
- "Identity and manager-owned contact details." (Profile)
- "Location, job, start date, and internal context." (Employment)
- "Employee preferences." (Availability)
- "Onboarding document requirement progress." (Documents)
- "Invitation and workspace access state." (Access)
- "Audited employee lifecycle changes." (History)
- "Verified account e-mail" (E-mail'in altı)
- "Locked after activation", "Locked while invitation is pending" — görünür metin
  olarak yok; ekran okuyucu açıklaması ve fare ipucu olarak duruyor.
  `getByText` bu ikisini hâlâ bulur (görünmez öğe), `toBeVisible` bulmaz.

Yeni erişilebilir adlar: `img` "Verified", `img` "Invitation pending" (E-mail alanının içinde).
Yeni görünür metin: departman adları (kullanıcının kendi verisi) ve "No department".
Değişmeyen: alan etiketleri, "Required", "optional", "Primary", "Remove",
doğrulama mesajları ("First name is required.", "Enter a valid email address.",
"Select at least one location/job.").

### Dokunmadığım input altı yazılar (kullanıcıya sorulacak)

| Sekme | Yazı | Yer |
|---|---|---|
| Access | "Owner access is managed separately." (Workspace role'ün altı, owner kaydında) | `EmployeeDrawer.tsx:2494` |
| Access | "Invitation, onboarding, and workspace role." (grup başlığının altı; input altı değil ama aynı türden açıklama) | `EmployeeDrawer.tsx:2444` |
| Alt çubuk (Invite role) | "The selected role is applied when the invite is accepted." — kodda var, CSS ile gizli; ekranda görünmüyor | `EmployeeDrawer.tsx:2736`, `styles.css` `.employee-create-role .employee-field > small` |
| Employment | "Manager access where they don't work: no shifts and no Schedule row there." (Manages without working there; dilim B'de sökülecek) | `EmployeeLocationParts.tsx:118` |
| Employment | "Only an admin or the owner can terminate …" (2026-09-30 kullanıcı kararı; kaldı) | `EmployeeLocationParts.tsx:16` |

## 5. Sırada ne var (yolda bulunanlar dahil)

1. **Telefon sorusunun cevabı** (bölüm 3.1) — cevap "tek satır" ise tek CSS satırı.
2. **KARARLAR "Ekran kararları → Employees" için önerdiğim metin** (ben yazmadım):
   - Çekmece başlığı (kullanıcı kararı 2026-09-30, EMP-001): sekme başlığının
     altında açıklama satırı yok; yeni sekme de eklemez.
   - Profile alanları (kullanıcı kararı 2026-09-30): First, Middle, Last tek
     satırda (Middle dar); Preferred name ile Date of birth aynı satırda;
     telefonda alt alta. Alanın altında yardım yazısı olmaz; yalnız doğrulama
     hatası alanın altında çıkar. Kilitli alanın nedeni yazılmaz; ekran
     okuyucuya ve fare ipucuna kalır. Salt okunur her alan aynı gri görünümdedir.
   - E-mail durumu alanın içinde (kullanıcı kararı 2026-09-30, S5): bağlı hesapta
     yeşil onay ("Verified"), bekleyen davette saat ("Invitation pending");
     davet bekliyorken e-mail ve adlar kilitli görünür. Bilerek: doğrulanmış
     e-mail gri durur, çünkü hesap adresi çekmeceden değişmez.
   - Jobs listesi departmana göre gruplu (BL-218 `.5`): departmanlar verilen
     sırada, sonra "No department", en altta Management; hiçbir iş bir
     departmanda değilse başlıksız düz liste.
3. **Yolda bulunanlar (dokunmadım):**
   - e2e seçicisi tuzağı (`nf-test`): gizli bilgileri görebilen okuyucuda
     (owner, admin) `getByLabel("E-mail")` **2 öğe** döndürür, çünkü Playwright
     alt dize eşler ve "Emergency e-mail" de uyar (gerçek tarayıcıda saydım;
     bu işten önce de böyleydi). `invite.spec.ts:87` manager ile koştuğu için
     geçiyor. Öneri: `{ exact: true }`. (leave: medium / do: safe)
   - Owner işi herkesin Jobs listesinde seçilebilir duruyor (Management başlığı
     altında "Owner" kutucuğu açık) — dilim C'nin konusu, şimdi daha görünür.
   - Çekmecenin CSS'i ham hex dolu (`styles.css:1563-2000`); benim eklediğim
     kurallar token'lı, eskilere dokunmadım (BL-259 kapsamı).
   - Uzun e-mail adresi simge yüzünden 25px erken kesiliyor
     (`manager-views-employee-no-private-profile-1280.png`); alan salt okunur
     olduğu için kaydırılarak okunuyor. Kabul edilebilir buldum.
4. Dilim B ve C `nf-gorsel-qa` turunda bu ekranlar da bakılacak.

## Kanıt

Son commit `9a2b93b1` üzerinde, 2026-09-30:

| Komut | Sonuç |
|---|---|
| `pnpm.cmd --filter @newfork/web exec vitest run` (bütün web) | 221 dosya geçti; 1908 test geçti, 1 atlandı (önceden atlanan); çıktıda "Unhandled" yok |
| `pnpm.cmd --filter @newfork/web typecheck` | hatasız |
| `pnpm.cmd lint` | 0 hata, 20 uyarı (hepsi önceden vardı), 5/5 görev |
| `pnpm.cmd --filter @newfork/web build` | `✓ built in 10.28s` |
| `grep -c sectionDescription apps/web/src/employees/EmployeeDrawer.tsx` | 0 |
| Ham hex eklendi mi (`git diff origin/main -- styles.css` eklenen satırlar) | 0 |
| Ağır koşudan önce `gh run list --limit 3`, `node scripts/lock.mjs status` | CI boşta, iki kilit boş |

Testler (`EmployeeDrawer.test.tsx:2007` "EMP-001 look", 14 test;
`EmployeeDrawer.create.test.tsx:308`, 1 test). İlk 8 testin 6'sı değişiklikten
önce kırmızıydı (2'si "yok" diyen testler), sonra yeşil. Sonradan eklenen üçü
(altı sekme, arşivli departman, zorunlu ad hatası) mevcut davranışı sabitliyor.

Gerçek tarayıcı ölçümleri (Playwright, 1280 ve 390):
- Aynı satırdaki inputların üst–alt kenarı eşit: adlar 138–178, Preferred / Date
  of birth 219–259, E-mail / Phone 374–414 (önce: Last 267–307, Preferred 278–318).
- Yatay taşma: sayfa, çekmece ve sekme içeriğinde 0px (her görüntüde ölçüldü).
- Chrome erişilebilirlik ağacı: `textbox "First name"` açıklaması "Locked after
  activation" / "Locked while invitation is pending"; `textbox "E-mail"`
  açıklaması "Verified" / "Invitation pending"; `image "Verified"`, `image
  "Invitation pending"`; `checkbox "Cook"` açıklaması "Kitchen".
- Son görüntü turlarında konsol hatası yok (bir turda, web sunucusunu yeniden
  başlattıktan hemen sonra tek bir 401 satırı çıktı; tekrar koşunca çıkmadı).

Kontrast (hesap): yeşil onay `--theme-success` gri alanda 5.89:1; saat
`--theme-warning` 5.40:1 (gerekli 3:1); departman başlığı `--theme-muted-strong`
beyazda 5.55:1; kilitli alan metni 9.85:1; hata metni 6.19:1 (gerekli 4.5:1).

Commit'ler (`task/emp-001-a`, `81fd0dd3` üstünde):
- `b64fab8f` feat(employees): tighter drawer header, names on one row, e-mail state inside the field, jobs by department (EMP-001)
- `ba3a5624` test(employees): every tab's title stands alone, … (EMP-001)
- `6ff95e26` fix(employees): the e-mail mark's tooltip no longer repeats its name to a screen reader (EMP-001)
- `fcd26bfd` docs(agent-memory): nf-arayuz notes on Employees drawer screenshots … (EMP-001)

Koordinatörün ek notu (2026-09-30) ile karşılaştırma:
1. Doğrulama hatası alanın altında kalıyor ve `aria-describedby` ile bağlı —
   `EmployeeDrawer.create.test.tsx:308`.
2. Davet bekliyorken First, Middle, Last ve E-mail aynı gri kilitli görünümde;
   nedeni e-mail'deki saat söylüyor, adlara neden `aria-describedby` ile bağlı —
   `world-pending-invite-profile-1280.png`, Chrome erişilebilirlik ağacı ölçümü.
3. E-mail alanının erişilebilir adı "E-mail" kaldı; simgenin adı etikete
   karışmıyor (Chrome: `textbox "E-mail"`, ayrı `image "Verified"`). Simge varken
   `getByRole("dialog").getByLabel("E-mail")` manager okuyucuda 1 öğe.

Dokunulan dosyalar: `apps/web/src/employees/EmployeeDrawer.tsx`,
`EmployeeDrawer.test.tsx`, `EmployeeDrawer.create.test.tsx`,
`apps/web/src/styles.css`, `.claude/agent-memory/nf-arayuz/screenshots-without-migration.md`.
Kayıt mantığı, mutation, API, `auth/**`, `*-data.ts`, `e2e/**`, "Manages without
working there" ve Access sekmesi değişmedi.

### Ekran görüntüleri (`artifacts/nf-arayuz/emp-001-a/`)

Kayıtlar gerçek yerel veri; yazma yapılmadı.

| Dosya | Ne gösteriyor |
|---|---|
| `admin-views-employee-{profile,employment}-{1280,390}.png` | Sıradan çalışan (Meyhouse, Test Employee), admin bakıyor |
| `admin-views-manager-{profile,employment}-{1280,390}.png` | Manager (Test Manager) |
| `admin-views-owner-{profile,employment}-{1280,390}.png` | Owner kaydı, admin bakıyor (salt okunur) |
| `owner-own-record-owner-profile-{1280,390}.png` | Owner kendi kaydına bakıyor (kısmen sahte, bölüm 3.4) |
| `world-verified-profile-{1280,390}.png`, `world-verified-employment-1280.png` | Doğrulanmış e-mail (yeşil onay) |
| `world-pending-invite-profile-{1280,390}.png` | Bekleyen davet (saat, kilitli adlar ve e-mail) |
| `manager-views-employee-no-private-profile-{1280,390}.png` | Gizli bilgileri göremeyen manager: Date of birth yok, satır bozulmuyor |
| `manager-views-employee-employment-{1280,390}.png` | Manager bakarken Employment |
| `world-create-profile-{1280,390}.png` | Add employee: üç ad tek satırda, "Required" etiketleriyle |
| `before/before-*.png` | Değişiklikten önce (masaüstü) |
| `what-if/phone-names-one-row-employee-profile-390.png` | Telefonda tek satır olsaydı (yalnız bu görüntü için tarayıcıya CSS verildi; kodda yok) |

Skills: `frontend-design:frontend-design` (mevcut tasarım dili içinde düzen),
`design:accessibility-review` (simge adları, kilit nedeni, kontrast),
`superpowers:verification-before-completion` (son commit üzerinde taze koşular).
Üçü de kullanıldı; atlanan yok.

Bakım: dev sunucular (5612/5613) durduruldu, portlar boş, bu worktree'den kalan
node süreci yok. `.claude/launch.json`'daki `emp-api` / `emp-web` girişleri
(gitignore'da) düzeltme turu gelebilir diye duruyor; dilim main'e girince silerim.
Dal ve worktree senin birleştirmeni bekliyor.
