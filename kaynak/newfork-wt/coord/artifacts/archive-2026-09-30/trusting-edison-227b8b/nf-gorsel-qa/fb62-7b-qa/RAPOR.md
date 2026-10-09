KARAR: ONAY @809592bc

# FB-6.2 `.7b` QA düzeltmesi — görsel QA yeniden bakış (nf-gorsel-qa, 2026-09-30)

`origin/main` @ `809592bc`, migration `20260930190000` ortak yerel DB'de. Worktree
`.claude/worktrees/trusting-edison-227b8b` (detached). Sunucular web 5616 / API 5617.
Önceki rapor: `artifacts/nf-gorsel-qa/fb62-7b/RAPOR.md` (DEĞİŞİKLİK İSTE @0806cc62).

## 1. Nerede duruyor
Bitti. Üç bulgunun üçü de kapandı, masaüstü 1440 ve telefon 390'da. Yeni engel yok.

## 2. Ne doğrulandı (etkisi)
**(1) Profile, gizli alanlar.**
- Owner → Alex Kim (gizli profil satırı yok): Date of birth, Phone, Emergency contact, Relationship, Emergency
  phone, Emergency e-mail "Not provided" olarak görünüyor (`.7a`'daki gibi). Aynısı owner → Local Employee ve
  owner → Jordan Lee (satırları yok).
- Admin Zeynep → Emre ve Ayşe (satırları var): alanlar görünüyor.
- Manager Ayşe → Emre (özel okuma izni yok): bu altı alanın hiçbiri yok. Doğru.
- Kanıt: `owner-alex-profile-desktop.png`, `manager-emre-profile-desktop.png`.

**(2) Invite yalnız hesabı bağlı olmayanda.**
- Hesabı bağlı kişiler (Emre: admin ve manager bakışı; Ayşe: admin; Local Employee ve Alex Kim: owner): alt
  çubukta "Invite" yok. Access'te Send reminder / Copy link / Revoke yok, "Add email" yok. Yalnız rol seçici,
  Remove access ve Remove photo var.
- Bağlı olmayan Jordan Lee (owner): e-posta yokken Access'te "Add email" var, Invite yok. E-posta ekrandaki taslağa
  yazılınca (kaydedilmedi) alt çubukta "Invite" çıkıyor. Access'te "Ready to invite", e-posta ve "Invite role" alanı
  görünüyor.
- Bekleyen davete ait düğmeler (Send reminder, Copy link, Revoke invitation) canlı görülemedi: yerel DB'de bekleyen
  davet yok. Koddan: yalnız `invitation.status === "pending"` iken çıkıyorlar
  (`apps/web/src/employees/EmployeeDrawer.tsx:2587`). Bağlı hesabın daveti `accepted`, dolayısıyla orada çıkmazlar.
- Kanıt: `admin-emre-access-*`, `manager-emre-access-*`, `owner-local-access-*`, `owner-jordan-access-*`,
  `owner-jordan-draft-email-footer-*`, `owner-jordan-draft-email-access-*`.

**(3) "Manages without working there".**
- Admin → Ayşe (Kadıköy'de çalışıyor): listede yalnız "Besiktas" var, "Kadikoy" yok.
- Kanıt: `admin-ayse-manager-employment-desktop.png`, `admin-ayse-manager-employment-phone.png`.

## 3. Açık kalan ve nedeni
- Legal name review paneli yine canlı görülemedi: yerel DB'de incelemesi bekleyen profil gereksinimi yok.
- Bekleyen davet düğmeleri: yukarıda, yalnız koddan.

## 4. Ekranda ne değişti
- Employees → çekmece → Profile: gizli profil satırı olmayan kişide okuma izni olana alanlar yeniden görünüyor.
- Employees → çekmece → alt çubuk: hesabı bağlı kişide "Invite" yok.
- Employees → çekmece → Employment: yönetilen lokasyon listesi, kişinin çalıştığı lokasyonları göstermiyor.

## 5. Sırada ne var (yolda bulunanlar, `.8` için)
1. **Telefonda davet hazırlanırken alt çubuk taşıyor:** Cancel, Invite, Save changes ve rol seçici tek satırda.
   "Save changes" iki satıra kırılıyor, rol seçici "Select a role" diye kesiliyor
   (`owner-jordan-draft-email-access-phone.png`). Bu düzeltmeden gelmiyor, rol seçici alt çubukta önceden vardı.
2. **"Manages without working there" grubu hâlâ biçimsiz:** başlık ve kutu aynı satırda
   (`admin-ayse-manager-employment-phone.png`). Önceki raporun madde 3'ü, görünümü `.8`'de.
3. Önceki raporun madde 4–7'si açık (tek seçenekli rol seçici, Hub metni ve menüsü, lokasyonun iki yoldan
   çıkarılması).

## Kanıt
- Roller: owner (seed `owner@newfork.test`, Meyhouse), admin Zeynep, manager Ayşe (World e2e1790265977849).
  Girişler gerçek giriş ekranından.
- Hiçbir kaydetme, davet ya da çıkarma düğmesine basılmadı. Jordan'a yazılan e-posta (`qa.jordan@newfork.test`)
  yalnız ekrandaki taslakta kaldı, oturum kapatılınca atıldı.
- DB yalnız okundu: migration kaydı, Meyhouse'ta hesabı bağlı olmayan kişiler ve e-postaları, davetler.
- Ekran görüntüleri bu klasörde (1440×900 ve 390×844).
