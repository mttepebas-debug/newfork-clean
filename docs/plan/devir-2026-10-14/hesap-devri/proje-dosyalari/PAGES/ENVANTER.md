# PAGES envanteri: her sayfa, her parça, her senaryo

Kaynak: main e0763dd5 (2026-10-12), `apps/web/src`; 3.0 ve 0.4 bölümleri main 1d053cd2, 6.0, 8.0 ve 8.1 bölümleri main 4662a826 ile güncellendi (2026-10-12 18:45 California saati). Okuma: 2026-10-12 06:05–06:20 California saati, beş paralel okuyucu, her parça `dosya:satır` dayanaklı. Bütün sayfalar main 68a6eaef ile yeniden kuruldu (2026-10-12 akşamı California saati); ayrıntı "Güncelleme 68a6eaef" bölümünde. Shift Hub (7.2) main 71b4c9ec ile Takas thread'inde kuruldu.
Kural: `README.md` "Kural". Bu dosya haritanın tam listesidir; bir iş bir parçayı ya da durumu eklediğinde veya PAGES'e senaryosunu koyduğunda ilgili satır ❌'dan ✅'a çevrilir.

## Güncelleme ff275b71 (2026-10-14)
- **Telefonda yazı kutuları 16 px** (Mert, 2026-10-14; `styles.css` temel kuralın altı, 767 px ve altı): yazı kutusu, açılır liste ve yazı alanı 16 px, iPhone dokununca yakınlaştırmaz; onay kutusu ve seçim düğmesi kendi boyunda. Telefonda yazı kutusu gösteren ve bu sha'dan yeniden yayınlanan sayfalar: 1.0, 1.1, 1.2, 1.3, 1.4, 1.7, 2.0, 3.3, 3.4, 4.0, 4.1, 4.2, 5.0, 6.0, 7.0, 7.2, 8.0, 9.0, 10.0, 10.1, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 11.0, 11.1, 11.2, 11.3, 11.5, 11.6. ✅ telefon görünümleri.
- **B görünümü, Schedule (alan f, main 5d7b6f09):** 3.0 Schedule, 3.1 export önizlemesi, 3.2 şablonlar ve 7.0 Employee home'un yenileme düğmesi. ✅ senaryolar `loading`, `error`, `draft-shifts-error`, `publish-preview-loading`, `publish-preview-error`, 3.2 `loading`, `error`.

## Güncelleme 68a6eaef (2026-10-13)
Bu sürümde değişen parçalar ve PAGES'teki senaryoları:
- **Bütün telefon görünümleri:** uygulama genelinde telefonda kaydırma çubuğu gizli (`apps/web/src/styles.css`). ✅ her sayfanın telefon görünümü.
- **Telefonda kenardan kenara, 16 px kenar boşluğu:** 2.0 Workspace, 5.0 Availability, 6.0 Important Dates, 4.0 Employees, 8.0 Announcements, 9.0 Notifications, 3.3 Requests (`shell/phone-page-gutter`). ✅ telefon görünümleri.
- **Liste sayfalarında üst kısım sabit** (başlık + sütun başlıkları; `views/list-page-frozen.css`): 5.0, 4.0, 4.1, 3.3, 8.0, 6.0, 9.0, 10.10. ✅ masaüstü liste senaryoları.
- **Satır "⋯" menüsü pencereye sabit, tam görünür açılır** (`settings/CatalogRowMenu.tsx`): 10.10 Settings → Documents ve aynı menüyü kullanan listeler. ✅ satır menüsü senaryoları.
- **4.0 Employees:** telefonda kişi başına bir kart (tablo gizli), "+ Add" sağda arama solda, durum sekmelerinin altında kaydırma çubuğu yok, lokasyon ikonu ile adı tek satır. ✅ telefon liste senaryoları.
- **6.0 Important Dates:** üstteki yol (breadcrumb) kaldırıldı; tablo sütunları Status · Important date · Category · Starts · Ends. ✅ liste senaryoları.
- **8.0 Announcements (yönetici):** sütunlar Status · Announcement · Category · Starts · Ends · Published on; telefonda durum seçici ve tek satır arama + New. ✅.
- **5.0 Availability:** üst kısım sabit. ✅.
- **3.0 Schedule · Vardiya penceresi (Add / Edit / Paste shift):** eski çekmece ve yüzen kart yerine hücrenin yanında tek pencere. Form (iki sütun, Type en üstte) ve Timeline (gün şeridi, kişi başına satır, sürüklenen çubuk) görünümleri; başlıkta değiştirici ve Alt+T. Who listesinde "Open" ve Free / Busy / Unavailable / Time off ipuçları. Pencerede kaydırma çubuğu yok; liste yer yoksa yukarı açılır. Save'de Enter işareti yok. Bayat veri kutusu + "Close & reload"; silme iki tık. ✅ editor-add-form, editor-timeline, editor-timeline-open, editor-timeline-edit, editor-paste, editor-unassigned, editor-employee-list, editor-edit, editor-stale, editor-delete ve öbür "Vardiya penceresi" senaryoları.
- **3.0 Schedule · kartlar:** hayalet kartta tür rengi, sürükleme önizlemesi ve izinli hücre görünümü (`ShiftCard`, `ShiftDragPreview`, `ScheduleTimeOffCellStyles`). ✅ mevcut kart ve izin hücresi senaryoları.
- **7.2 Shift Hub:** "Available Shifts", altı çizili sekmeler, kırmızı sayaç rozetleri, masaüstünde kaydırma çubuğu gizli. ✅ (Takas thread'i, 71b4c9ec).

## Nasıl okunur
- Gruplama: **sayfa** (`## no Başlık — route`) → **parça** (`### Parçalar`, ekrandaki İngilizce adıyla) → **senaryo** (`### Senaryolar`).
- Senaryo satırı: `[✅ mevcut-senaryo | ❌ EKSİK] etiket · rol · nasıl açılır · mock`.
  - ✅: bugünkü PAGES sayfasında bu durumu gösteren senaryo var.
  - ❌: haritada yok.
  - `mock: eksik`: PAGES'in sahte arka ucu bu durumu henüz üretemiyor; önce mock'a ekleme gerekir.
- "YENİ": bugün PAGES'te hiç sayfası olmayan ekran.

## Toplam
| Alan | Sayfa (var / yeni) | Parça | Senaryo | ✅ var | ❌ eksik | mock gerekir |
|---|---|---|---|---|---|---|
| Giriş, hesap, açık sayfalar (1.x, 11.x, 12.x) | 22 / 2 | 163 | 266 | 56 | 210 | 95 |
| Workspace, Employees, Availability, Important Dates (2.0, 4.x, 5.0, 6.0) | 6 / 0 (+2 isteğe bağlı) | 142 | 271 | 33 | 238 | 72 |
| Schedule (3.x) | 4 / 0 | 184 | 291 | 33 | 258 | 64 |
| Çalışan tarafı, duyurular, bildirimler, kabuk (7.x, 8.x, 9.0, 0.x) | 8 / 8 | 172 | 223 | 26 | 197 | 72 |
| Settings (10.x) | 13 / 0 | 131 | 239 | 43 | 196 | 70 |
| **Toplam** | **53 / 10** | **792** | **1290** | **191** | **1099** | **373** |

Bugünkü 169 senaryo, telefon görüntüleri dahil bu listede 191 durumu karşılıyor.

## Yeni sayfalar
- 0.1–0.8 Kabuk: her sayfada ortak parçalar.
  - 0.1 Sol menü
  - 0.2 Çalışan alt menüsü (telefon)
  - 0.3 Yönetim alt menüsü (telefon)
  - 0.4 Workspace değiştirici
  - 0.5 Hesap menüsü
  - 0.6 Employee view geçişi
  - 0.7 Ortak durumlar: yükleniyor, yetkisiz, oturum, kurulum ve belge kapısı
  - 0.8 Toaster ve onay penceresi
- 1.x "Almost ready": kurulumu bitmemiş workspace'te owner olmayan üye.
- 1.x "That workspace didn't load".
- İsteğe bağlı: çalışan çekmecesi ve belge çekmecesi için 4.0 ve 4.1'den ayrı numaralı sayfa (aynı adres, 8.0/8.1 gibi).

## Bugün yanlış gösteren senaryolar (önce düzeltilecek)
- 1.1 "sent": mock'ta parola sıfırlama ucu yok; başarı yerine hata çıkıyor.
- 1.7 "next": Last name boş kalıyor, ekran 1. adımda kalıyor.
- 1.5 "closed": "Why" düğmesi sayfa dışına gidiyor, ekran geri dönüyor.
- 11.1 "delete": silme penceresi açılmıyor, çünkü düğme aktif üyelikte kapalı.
- 1.6: üç senaryo da aynı genel metni gösteriyor. `/workspaces/status/<id>` adresleri eksik.
- 3.0, 3.1, 3.2 müdür senaryoları: mock müdürün kapsamını uygulamıyor. Müdür iki lokasyonu ve herkesi görüyor, açık (ghost) vardiyalar boş geliyor.

## Mock temeli (çok senaryoyu birden açar)
1. Hata, 403 ve yükleniyor durumunu senaryodan açan bir anahtar.
2. Admin ve özel rol (ör. salt okur, düzenler ama yayınlayamaz) ile bakabilmek.
3. Schedule'da müdür kapsamı ve açık vardiyalar.
4. Eksik uçlar ve veriler: parola sıfırlama, davet hata ve bekleme cevapları, revizyon çakışma nedenleri, boş ve arşivli kayıtlar, bildirim `case=` bağlantıları.

## Kodda görülen olası hatalar (harita dışı; okuyarak bulundu, çalıştırılarak doğrulanmadı)
Ayrıntılar alan bölümlerinin sonundaki "Gözlemler", "Bulgular" ve "Bulunan kod boşlukları" başlıklarında.

---


# Alan: Envanter — giriş ve hesap alanı (1.x, 11.x, 12.x, yönlendirmeler)

Kaynak: `apps/web/src` @ main e0763dd5. Mock: `apps/web/.temp/pages/mock`. Senaryo kaynağı: `apps/web/.temp/pages/tools/screens.py`.
Dosya yolları `apps/web/src/` altına göredir. "Rol: oturumsuz" = giriş yapmamış ziyaretçi.

Önemli harness kuralı (her senaryoyu etkiler): bir PAGES ekranı yalnız kendi `match` deseninin adreslerinde kalır (`.temp/pages/pages.ts` `currentPage()`); ekran başka adrese giderse `router-shim.tsx` bir uyarı gösterip başlangıç adresine geri döner. Bu yüzden "başarılı olunca başka sayfaya gider" durumları (giriş, parola kaydı, daveti kabul, workspace açma) PAGES'te yalnız uyarı olarak görünür.

---

## 1.0 Sign in — /sign-in

### Parçalar
- Çerçeve: `PreBizFrame` (üst bar "NEWFORK" + hesap bloğu, ortada dar sahne, `h1` canlı bölge) — `shell/prebiz/PreBiz.tsx:30-68`; oturumsuzken hesap bloğu gizli (`PreBiz.tsx:12`).
- Başlık üç biçimde: "Sign in" / "Create your workspace account" / "Create your employee account" (davetle gelen) / "Check your email" (1.9) — `views/SignInPage.tsx:70-78`.
- Açıklama satırı: "Sign-in is unavailable in this browser session." (Supabase yok) · "Your session ended. Sign in again…" (oturum süresi doldu) · "You will name the workspace itself in the next step." · "Your email and a password of at least eight characters." — `SignInPage.tsx:79-93`.
- Form: Email, Password (min 8) — `SignInPage.tsx:116-150`.
- "Forgot password?" bağlantısı (yalnız giriş modunda) — `SignInPage.tsx:145-149`.
- Hata satırı (`role=alert`, sunucunun sözü, ör. "Invalid login credentials") — `SignInPage.tsx:151-155`.
- Yeşil düğme: "Sign in" / "Create account" / "Please wait" (gönderilirken kapalı) — `SignInPage.tsx:157-167`.
- İkincil düğme: "Create a workspace account" / "Create a new account" (davet akışı) / "I already have an account" — `SignInPage.tsx:169-179`.
- Alt bağlantılar: Privacy · Terms · Accessibility · Contact (`nav "Trust and legal"`) — `SignInPage.tsx:183-190`.
- Yönlendirme dalları: context varsa hedefe; oturum açık ve hata yoksa hub'a ya da davet adresine — `SignInPage.tsx:43-47`; güvenli hedef süzgeci (`//`, başka origin → /app) — `SignInPage.tsx:195-205`.
- Davet akışı tanıma yalnız `/invite/accept` hedefinde (`/accept-invite` hedefini tanımaz) — `SignInPage.tsx:207-215`.
- Telefon: dar sahne aynı; özel düzen yok (`prebiz.css:487-560` yalnız üst bar ve satırlar).

### Senaryolar
- [✅ form] Boş giriş formu · rol: oturumsuz · nasıl: /sign-in · mock: var
- [✅ wrong] Yanlış parola: "Invalid login credentials" · rol: oturumsuz · nasıl: e-posta + "wrong-password" → Sign in · mock: var
- [✅ expired] Oturum süresi doldu açıklaması · rol: oturumsuz · nasıl: setup `session-expired` · mock: var
- [✅ create] Workspace hesabı aç (başlık, açıklama, "Create account", "I already have an account", Forgot gizli) · rol: oturumsuz · nasıl: "Create a workspace account" · mock: var
- [✅ invite] Davetle gelen: "Create your employee account" · rol: oturumsuz · nasıl: state.from=/invite/accept?token=… · mock: var
- [❌ EKSİK] Davetle gelen kişi "I already have an account" → davet modunda giriş ("Create a new account" ikincil) · rol: oturumsuz · nasıl: invite senaryosu + "I already have an account" · mock: var
- [❌ EKSİK] Gönderiliyor: "Please wait", düğme kapalı · rol: oturumsuz · nasıl: Sign in'e bas, yanıt gelmeden · mock: eksik: signIn'e gecikme (ör. belirli parola 2 sn bekletsin)
- [❌ EKSİK] Başarılı giriş → hedefe gider · rol: oturumsuz · nasıl: geçerli parola → Sign in · mock: var (harness yalnız "Giriş yapıldı" uyarısı gösterir)
- [❌ EKSİK] Hesap açmada sunucu hatası (ör. "User already registered") · rol: oturumsuz · nasıl: Create account · mock: eksik: signUp'ın belirli e-postada hata dönmesi
- [❌ EKSİK] Supabase ayarsız: "Sign-in is unavailable…", form yok · rol: oturumsuz · nasıl: yapılandırmasız açılış · mock: eksik: supabaseConfigured=false bayrağı
- [❌ EKSİK] Oturum açık ama context hatası: form + hata satırı (hub'a gitmez) · rol: herkes · nasıl: /sign-in, context yüklenemedi · mock: eksik: /v1/context hata dalı
- [❌ EKSİK] Oturumu açık kişi /sign-in açınca hub'a/hedefe yönlenir · rol: herkes · nasıl: oturumla /sign-in · mock: var (yönlendirme, harness uyarısı)
- [❌ EKSİK] Tarayıcı doğrulaması: geçersiz e-posta / 8'den kısa parola (yerel `required`/`minLength`) · rol: oturumsuz · nasıl: boş ya da kısa değerle gönder · mock: var

## 1.9 Check your email — /sign-in (hesap açtıktan sonraki durum)

### Parçalar
- Başlık "Check your email" ve açıklama "Open the link we emailed you…" — `views/SignInPage.tsx:71-85`.
- Başarı satırı "Confirmation link sent to {email}." (`data-testid=signup-check-email`) — `SignInPage.tsx:97-103`.
- "Back to sign in" bağlantı-düğmesi (forma ve giriş moduna döner) — `SignInPage.tsx:104-113`.
- Alt hukuk bağlantıları bu durumda gizli — `SignInPage.tsx:183`.
- Odak başlığa taşınır (form ↔ cevap geçişi) — `SignInPage.tsx:33-37`.

### Senaryolar
- [✅ workspace] Workspace hesabı açtıktan sonra · rol: oturumsuz · nasıl: Create a workspace account → e-posta + parola → Create account · mock: var
- [✅ invite] Davetle gelen kişi hesap açtıktan sonra · rol: oturumsuz · nasıl: state.from davet → e-posta + parola → Create account · mock: var
- [❌ EKSİK] "Back to sign in" → giriş formu (Sign in modu) · rol: oturumsuz · nasıl: workspace senaryosu + Back to sign in · mock: var

## 1.1 Forgot password — /forgot-password

### Parçalar
- Başlık "Reset your password", açıklama "Enter the email you sign in with. The link works once and expires in 1 hour." (gönderilince gizli) — `views/ForgotPasswordPage.tsx:33-42`.
- Form: Email — `ForgotPasswordPage.tsx:48-59`.
- Hata satırı (`role=alert`) — `ForgotPasswordPage.tsx:60-64`.
- "Send reset link" / "Please wait" — `ForgotPasswordPage.tsx:66-72`.
- Başarı satırı "If an account exists for this email, we sent a reset link." (form yerine) — `ForgotPasswordPage.tsx:43-46`.
- "Back to sign in" bağlantısı (her durumda) — `ForgotPasswordPage.tsx:76-78`.

### Senaryolar
- [✅ form] Boş form · rol: oturumsuz · nasıl: /forgot-password · mock: var
- [❌ EKSİK] Bağlantı gönderildi ("If an account exists…") · rol: oturumsuz · nasıl: e-posta → Send reset link · mock: eksik: `POST /v1/auth/password-reset` mock'ta yok; mevcut `sent` senaryosu 404 alır ve başarı yerine "Not available on the atlas yet" hatasını gösterir
- [❌ EKSİK] Gönderim reddi (oran sınırı / servis yok) hata satırı · rol: oturumsuz · nasıl: Send reset link · mock: eksik: uçta hata dalı (ör. belirli e-posta 429)
- [❌ EKSİK] Gönderiliyor "Please wait" · rol: oturumsuz · nasıl: Send reset link basılıyken · mock: eksik: gecikme

## 1.2 Reset password — /reset-password

### Parçalar
- Geçersiz bağlantı ekranı: "Reset link not valid", "This reset link has expired or was already used.", yeşil "Request a new link" (→ /forgot-password) — `views/ResetPasswordPage.tsx:68-83`.
- Form: "Choose a new password", "At least eight characters."; New password, Confirm password (8–256) — `ResetPasswordPage.tsx:85-118`.
- Hata satırı: "Passwords do not match." ya da sunucu sözü — `ResetPasswordPage.tsx:44-45, 119-123`.
- "Save password" / "Please wait" — `ResetPasswordPage.tsx:124-132`.
- Davranış: token adres çubuğundan silinir; kaydetmeden çıkınca oturum kapanır; başarıda /app — `ResetPasswordPage.tsx:30-38, 49-58`.

### Senaryolar
- [✅ invalid] Bağlantısız açılış → geçersiz ekranı · rol: oturumsuz · nasıl: /reset-password · mock: var
- [✅ valid] Geçerli bağlantı: yeni parola formu · rol: oturumsuz · nasıl: /reset-password#token_hash=demo-reset-link · mock: var
- [❌ EKSİK] Parolalar uyuşmuyor: "Passwords do not match." · rol: oturumsuz · nasıl: valid + farklı iki parola → Save password · mock: var
- [❌ EKSİK] Token kaydederken geçersiz çıktı (süresi geçmiş/kullanılmış) → geçersiz ekranına döner · rol: oturumsuz · nasıl: valid + Save · mock: eksik: verifyOtp'nin belirli token'da hata dönmesi
- [❌ EKSİK] Yeni parola sunucuca reddedildi (zayıf) hata satırı, oturum ikinci deneme için kalır · rol: oturumsuz · nasıl: valid + Save · mock: eksik: updateUser hata dalı
- [❌ EKSİK] Başarı → /app'e gider · rol: oturumsuz · nasıl: valid + iki aynı parola → Save · mock: var (harness uyarısı)

## 1.3 Account recovery — /account-recovery

### Parçalar
- Başlık "Bring your account back" / "Your account is back"; açıklama "This link works once, and only while the 14-day window is open." / "Sign in to pick up where you left off." — `account/AccountRecoveryPage.tsx:32-40`.
- Hata satırı (`role=alert`) — `AccountRecoveryPage.tsx:41-45`.
- "Restore my account" / "Restoring" (token 32 karakterden kısaysa kapalı) — `AccountRecoveryPage.tsx:56-64`.
- "Go to sign in" (geri gelince) — `AccountRecoveryPage.tsx:47-54`.

### Senaryolar
- [✅ form] Bağlantısız açılış, düğme kapalı · rol: oturumsuz · nasıl: /account-recovery · mock: var
- [✅ link] E-postadaki bağlantıyla, düğme açık · rol: oturumsuz · nasıl: ?token=<32 hex> · mock: var
- [✅ restored] Hesap geri geldi + "Go to sign in" · rol: oturumsuz · nasıl: link + Restore my account · mock: var
- [❌ EKSİK] Kurtarma reddi (14 gün geçmiş / token kullanılmış) hata satırı · rol: oturumsuz · nasıl: ?token=…-expired + Restore · mock: eksik: uçta token'a göre hata dalı
- [❌ EKSİK] "Restoring" bekleme durumu · rol: oturumsuz · nasıl: Restore basılıyken · mock: eksik: gecikme

## 1.4 Accept invitation — /invite/accept (ve /accept-invite)

### Parçalar
- Yükleniyor: boş `main` "Loading invitation" — `employees/AcceptInvitationPage.tsx:47-48`.
- Oturumsuz → /sign-in (state.from davet adresi; 1.0 invite) — `AcceptInvitationPage.tsx:49-50`.
- Geçerli: "Accept your invitation", "Join the team at {workspace} with {email ipucu}.", "Accept invitation"/"Accepting" — `AcceptInvitationPage.tsx:84-102`.
- Kabul edildi: "You're in", "A few details before your first shift at …", "Start onboarding" (→ /welcome/:id) — `AcceptInvitationPage.tsx:55-74`.
- Başka adres: "This invitation is for another address", "Sign in with that address" (oturumu kapatır) — `AcceptInvitationPage.tsx:106-127`.
- Kapalı davet ekranı + ikincil "Go to your workspaces": expired, revoked, replaced, declined, accepted/already_member, workspace_unavailable, email_unconfirmed, not_found, failed — `AcceptInvitationPage.tsx:129-147, 175-233`.
- Sonuç seçimi (kabul hatası önizlemeden önce gelir; token <32 → not_found) — `AcceptInvitationPage.tsx:150-173`.

### Senaryolar
- [✅ valid] Geçerli davet · rol: employee · nasıl: ?token=<32 hex> · mock: var
- [✅ expired] "This link doesn't work anymore" (7 gün) · rol: employee · nasıl: token…-expired · mock: var
- [✅ revoked] "This invitation was withdrawn" · rol: employee · nasıl: token…-revoked · mock: var
- [✅ replaced] "A newer invitation was sent to you" · rol: employee · nasıl: token…-replaced · mock: var
- [✅ broken] Bozuk bağlantı → not_found metni · rol: employee · nasıl: ?token=abc · mock: var
- [❌ EKSİK] Reddedilmiş: "You declined this invitation" · rol: employee · nasıl: token…-declined · mock: var
- [❌ EKSİK] Zaten kabul edilmiş: "You have already joined Harbor & Vine" · rol: employee · nasıl: token…-accepted · mock: var
- [❌ EKSİK] Workspace kapalı/askıda: "… isn't open right now" · rol: employee · nasıl: token…-workspace_unavailable · mock: eksik: önizlemede `workspace_unavailable` kelimesi tanınmıyor
- [❌ EKSİK] Kabul edildi: "You're in" + Start onboarding · rol: employee · nasıl: valid + Accept invitation · mock: var
- [❌ EKSİK] "Accepting" bekleme · rol: employee · nasıl: Accept basılıyken · mock: var (60 ms gecikme; görüntü için uzun gecikme gerek)
- [❌ EKSİK] Başka adres: "This invitation is for another address" · rol: employee · nasıl: valid + Accept · mock: eksik: accept'te `invitation_email_mismatch` kodu
- [❌ EKSİK] E-posta onaysız: "Confirm your email first" · rol: employee · nasıl: valid + Accept · mock: eksik: `email_unconfirmed` kodu
- [❌ EKSİK] Kabul anında zaten üye (already_member) · rol: employee · nasıl: valid + Accept · mock: eksik: `already_member` kodu
- [❌ EKSİK] Önizleme yüklenemedi → "This invitation could not be opened" · rol: employee · nasıl: token…-fail · mock: eksik: önizleme 500 dalı
- [❌ EKSİK] Önizleme boş (null) → not_found · rol: employee · nasıl: token…-missing · mock: eksik: null cevap dalı
- [❌ EKSİK] /accept-invite eski adresi aynı ekranı açar · rol: employee · nasıl: /accept-invite?token=… · mock: var
- [❌ EKSİK] Telefon görünümü (çerçeve üst bar e-postayı tutar) · rol: employee · nasıl: 390 genişlik, valid · mock: var

## 1.5 Workspace hub — /workspaces

### Parçalar
- Yükleniyor / tek seçenekte otomatik yönlendirme: "Checking your account" — `shell/WorkspaceHubPage.tsx:139-140`; yönlendirme kuralı (yalnız `landing` state'iyle) — `WorkspaceHubPage.tsx:85-116`.
- Liste yüklenemedi: "Your workspaces didn't load" + "Try again" — `WorkspaceHubPage.tsx:142-157`.
- Boş el: "Welcome to Newfork" / "Welcome back", "Create your workspace" (yeşil), "I am waiting for an invitation" / "…another invitation" — `WorkspaceHubPage.tsx:206-231`.
- Davet bekleyen: "No invitation yet" / "Invitations didn't load", "Check again"/"Checking", "Back", "Your own workspace" + Create — `WorkspaceHubPage.tsx:165-204`.
- Dolu liste başlığı: "Your workspaces" / "You have an invitation" / "You have N invitations"; açıklama "Declining can't be undone…" — `WorkspaceHubPage.tsx:233-248`.
- Davetler yüklenemedi satırı — `WorkspaceHubPage.tsx:249-253`.
- Bölüm "Invitations": `InvitationRow` — ad, "Invitation", rozet "Expires in N days/today" (≤2 gün turuncu), iki tık "Decline" → "Confirm decline" (kırmızı), "Join"; hata "Invitation update failed" / "Confirm your email first…" — `employees/InvitationRow.tsx:43-86`.
- Bölüm "In progress": `UnfinishedSetupRow` — rozet "Setup in progress"/"Onboarding in progress", iki tık "Discard"→"Confirm delete" ya da "Decline"→"Confirm decline", "Continue"/"Open"; hata "Setup could not be updated" — `employees/UnfinishedSetupRow.tsx:64-110`.
- Bölüm "Where you work": satır (ad, rol, şimdiki workspace vurgusu), "Open"/"Opening", hata "This workspace could not be opened" — `WorkspaceHubPage.tsx:268-299`.
- Bölüm "No longer open to you": rozet "Closed"/"Access removed"/"On hold" (kırmızı), "Why" (→ /workspaces/status/:id) — `WorkspaceHubPage.tsx:300-323, 338-342`.
- "Your own workspace" + `CreateOrganizationButton` ("Create your workspace"/"Starting", hata "Workspace could not be created") — davet yok ve kendi taslağı yokken — `WorkspaceHubPage.tsx:328-333`; `shell/CreateOrganizationButton.tsx:54-83`.
- Hesap bloğu (ad, e-posta, "Sign out") — `shell/prebiz/PreBiz.tsx:8-28`.
- Telefon: satırlar dikey, düğmeler tam genişlik; üst barda ad gizli, e-posta kalır — `shell/prebiz/prebiz.css:487-536`.

### Senaryolar
- [✅ owner] Owner: davet (Cedar), Where you work (Harbor, Saltline admin), No longer open (Pier 9 Closed) · rol: owner · nasıl: /workspaces · mock: var
- [✅ manager] Manager: davet (2 gün, turuncu), Harbor, Bayside On hold · rol: manager · nasıl: /workspaces · mock: var
- [✅ employee] Employee: davet, Harbor, Corner Bistro Access removed · rol: employee · nasıl: /workspaces · mock: var
- [✅ join] Davete katıl → davet kalkar, "In progress"te Cedar "Onboarding in progress" (welcome'a gidiş uyarıyla geri döner) · rol: owner · nasıl: Join Cedar & Smoke BBQ · mock: var
- [❌ EKSİK] Kapalı workspace nedeni (status sayfası) · rol: owner · nasıl: Why (Pier 9) · mock: var — mevcut `closed` senaryosu /workspaces/status/:id 1.5'in deseninde olmadığı için geri döner; durum metni görünmez (yeri 1.6)
- [❌ EKSİK] Daveti reddetme iki tık: "Confirm decline" görünür · rol: owner · nasıl: Decline invitation to Cedar & Smoke BBQ (1 tık) · mock: var
- [❌ EKSİK] Daveti reddetme sonucu: davet listeden düşer, başlık "Your workspaces" · rol: owner · nasıl: Decline ×2 · mock: var
- [❌ EKSİK] Davet hatası "Invitation update failed" / "Confirm your email first…" · rol: employee · nasıl: Join · mock: eksik: accept'te hata kodu dalı
- [❌ EKSİK] Kendi yarım kurulumu: "Setup in progress", Discard/Continue; "Your own workspace" gizli · rol: owner · nasıl: /workspaces · mock: eksik: hub seed'ine taslak workspace (onboarding incomplete) ekleyen setup
- [❌ EKSİK] Başkasının yarım kurulumu: yalnız "Open" (Discard yok) · rol: manager · nasıl: /workspaces · mock: eksik: owner olmayan üyelikli taslak workspace
- [❌ EKSİK] Yarım kurulumu silme iki tık "Confirm delete" ve sonuç · rol: owner · nasıl: Discard ×2 · mock: var (taslak seed'i gelince)
- [❌ EKSİK] Çalışan onboarding'ini bırakma "Confirm decline" · rol: employee · nasıl: join sonrası Decline onboarding ×2 · mock: var
- [❌ EKSİK] Boş el "Welcome to Newfork" (hiç bağlanmamış hesap) · rol: herkes · nasıl: /workspaces · mock: eksik: boş hesap seed'i + everLinked=false
- [❌ EKSİK] Boş el "Welcome back" (eskiden bağlıydı) · rol: herkes · nasıl: /workspaces · mock: eksik: boş hesap + everLinked=true
- [❌ EKSİK] "No invitation yet" + Check again · rol: herkes · nasıl: boş el → I am waiting for an invitation · mock: eksik: boş hesap seed'i
- [❌ EKSİK] "Invitations didn't load" (davet bekleme ekranında hata) · rol: herkes · nasıl: boş el → waiting · mock: eksik: /v1/invitations/pending hata dalı
- [❌ EKSİK] "Your workspaces didn't load" + Try again · rol: herkes · nasıl: /workspaces · mock: eksik: /v1/account/workspaces hata dalı
- [❌ EKSİK] Davetler yüklenemedi satırı (liste yine görünür) · rol: herkes · nasıl: /workspaces · mock: eksik: davet ucu hata dalı
- [❌ EKSİK] Birden çok davet: "You have 2 invitations" · rol: owner · nasıl: /workspaces · mock: eksik: ikinci davet
- [❌ EKSİK] Davet yok, tek workspace: başlık "Your workspaces" + "Your own workspace" bölümü · rol: owner · nasıl: davet reddedildikten sonra · mock: var (decline ile)
- [❌ EKSİK] "Open" → workspace açılır (/app'e gider) · rol: owner · nasıl: Open Saltline Oyster Bar · mock: var (harness uyarısı)
- [❌ EKSİK] "This workspace could not be opened" satır hatası · rol: owner · nasıl: Open · mock: eksik: /active ucunda hata dalı
- [❌ EKSİK] "Checking your account" (yükleniyor / otomatik geçiş) · rol: herkes · nasıl: girişten sonra landing state'iyle · mock: eksik: landing state'li senaryo + uzun gecikme
- [❌ EKSİK] "Create your workspace" → /onboarding; hata "Workspace could not be created" · rol: owner · nasıl: Create your workspace · mock: var (başarı; hata dalı eksik)
- [❌ EKSİK] Telefon: satırlar alt alta, düğmeler tam genişlik · rol: owner · nasıl: 390 genişlik · mock: var

## 1.6 Workspace status — /workspaces/status ve /workspaces/status/:workspaceId

### Parçalar
- Yükleniyor "Checking your account" — `shell/WorkspaceStatusPage.tsx:55-58`.
- Başlık + açıklama, dört metin: "{ad} is on hold" · "You no longer have access to {ad}" · "{ad} has closed" (tarihli/tarihsiz) · varsayılan "That workspace isn't open to you" — `WorkspaceStatusPage.tsx:85-118`.
- Bitiş kuralı (önce workspace kapanması, sonra erişim, sonra askı; tarihi geçmiş planlı kapanış = kapalı) — `WorkspaceStatusPage.tsx:12-39`.
- Yeşil "Choose a workspace" (→ /workspaces) — `WorkspaceStatusPage.tsx:72-80`.

### Senaryolar
- [✅ owner] Kimliksiz adres → varsayılan "That workspace isn't open to you" · rol: owner · nasıl: /workspaces/status · mock: var
- [✅ manager] Kimliksiz adres → aynı varsayılan metin · rol: manager · nasıl: /workspaces/status · mock: var
- [✅ employee] Kimliksiz adres → aynı varsayılan metin · rol: employee · nasıl: /workspaces/status · mock: var
- [❌ EKSİK] Kapandı: "Pier 9 Kitchen has closed" + "It closed on …" · rol: owner · nasıl: /workspaces/status/9e19a7c1-2d4b-4f6a-8c3e-1b5d7f9a0c63 · mock: var
- [❌ EKSİK] Askıda: "Bayside Grill is on hold" · rol: manager · nasıl: /workspaces/status/ba751de0-3c6e-4a8b-9d2f-4e6a8c0b2d74 · mock: var
- [❌ EKSİK] Erişim kaldırıldı: "You no longer have access to Corner Bistro" · rol: employee · nasıl: /workspaces/status/c0b1e7a5-4d8f-4b9c-ae31-5f7b9d1c3e85 · mock: var
- [❌ EKSİK] Kapanış tarihi bilinmeyen kapalı workspace (tarihsiz metin) · rol: owner · nasıl: /workspaces/status/:id · mock: eksik: closureEffectiveAt=null kapalı workspace
- [❌ EKSİK] Planlı kapanışın tarihi geçti → "has closed" · rol: owner · nasıl: /workspaces/status/:id · mock: eksik: lifecycle closure_scheduled + geçmiş tarih
- [❌ EKSİK] Yükleniyor "Checking your account" · rol: herkes · nasıl: açılışta · mock: eksik: gecikme
- [❌ EKSİK] Eski adresler /workspaces/suspended/*, /organization-switcher/suspended/* buraya döner · rol: herkes · nasıl: eski adres · mock: var (yönlendirme)

## 1.7 Owner setup — /onboarding

### Parçalar
- Erişim: ProtectedRoute `workspace="any"`; context yoksa boş; owner değil ya da kurulum bitmişse → /app — `views/OwnerOnboardingPage.tsx:271-277`; owner olmayan üye "Almost ready" görür (bkz. YENİ) — `auth/ProtectedRoute.tsx:63-73`.
- Sol panel: "NEWFORK", workspace adı + "Workspace setup", ilerleme çubuğu "N of 4 steps done", adımlar Workspace/Locations/Jobs/Team (yalnız geri tıklanır, biten ✓) — `OwnerOnboardingPage.tsx:820-873`.
- Sol panel altı: "Switch workspace" (birden çok workspace varsa), "Exit setup" (→ hub), iki tık "Start over" → "Confirm start over" (kırmızı) / "Resetting", hesap bloğu — `OwnerOnboardingPage.tsx:874-902`.
- Yükleniyor "Loading your setup…" — `OwnerOnboardingPage.tsx:905-909`.
- Adım 1 "Name your workspace": fieldset "Name as it appears on your ID" (First, Middle optional, Last), yardım satırı, "Workspace name", ABD harf kuralı satırları, "Continue" (boşken/kural bozukken kapalı) — `OwnerOnboardingPage.tsx:911-1012`.
- Adım 2 "Where does your team work?": "Your locations" + sayaç rozeti, boş "No locations yet…", satır (ad, kısa ad, şehir, saat dilimi, "Edit", iki tık "Remove"→"Confirm remove") — `OwnerOnboardingPage.tsx:1014-1088`.
- Adım 2 formu "Add a location"/"Edit {ad}": Location name, Short name (otomatik öneri, büyük harf), Timezone (posta kodundan öneri: "Looking up…", "Suggested from the postal code…", "No clear suggestion…", "Suggestion unavailable…"), Street address, City, State or region, Postal code, Country, Phone (optional); alan hataları — `OwnerOnboardingPage.tsx:1090-1114, 1584-1771`; `settings/LocationTimezoneField.tsx:5-27`; `settings/location-draft.ts:38-60`.
- Adım 2 alt bar: "‹ Workspace", "Cancel" (düzenlerken), "Add location"/"Save changes", "Continue" (lokasyon yoksa/düzenlerken kapalı) — `OwnerOnboardingPage.tsx:1116-1152`.
- Adım 3 "What jobs do people work?": "Your structure" + "N departments · N jobs", boş "No departments yet…", departman satırı (ad, iş sayısı, "Rename" → satır içi giriş + Save/Cancel, Enter/Escape; iki tık "Remove" → "Confirm remove" ya da "Confirm remove, takes N jobs with it"), iş çipleri, boş "No jobs in this department yet.", "No department" grubu, Management notu — `OwnerOnboardingPage.tsx:1157-1330`.
- Adım 3 iş paneli (çipe tıklayınca): Job name, Department seçimi, "Save", iki tık "Remove"→"Confirm remove", "Close" — `OwnerOnboardingPage.tsx:616-681`.
- Adım 3 formu: "Add a department" (Department name) ya da "Add a job" (Department + Job or role); bar: "‹ Locations", "Cancel", "Add department" / "New department", "Add job", "Continue" (kendi departmanı ve Management dışı iş yoksa kapalı) — `OwnerOnboardingPage.tsx:1332-1461`.
- Adım 4 "Add your team": "Added so far" listesi, First/Last name, Start date, Invitation email, "Works remotely", "Not on the schedule", "Send the invitation when setup finishes" + not "Invite delivery waits…", Locations ve Jobs işaret kutuları ("· required"; Owner işi kilitli), bar: "‹ Jobs", iki tık "Clear draft"→"Confirm clear", "Add employee", "Finish setup"/"Finishing" — `OwnerOnboardingPage.tsx:1465-1550, 1782-1950`.
- Geri bildirim: başarı satırı (Location added/updated, Department added, Job added/saved, Renamed, Removed, Added…, Draft cleared, Setup reset) ve bar hatası; başka sekmede değişince "Your setup changed in another tab or window…" — `OwnerOnboardingPage.tsx:174-187, 1991-…`; `shell/prebiz/PreBiz.tsx:75-103`.
- Bitirme denetimleri: taslak varken "Add the employee draft or clear it…", lokasyon yoksa adım 2 + "Add at least one active location…", yapı eksikse adım 3 + "Add at least one active department and job outside Management…" — `OwnerOnboardingPage.tsx:751-787`.
- Telefon (≤720px): sol panel üst bara döner; workspace adı ve adım listesi gizlenir, ilerleme + Exit/Start over + e-posta kalır — `shell/prebiz/prebiz.css:487-536`.

### Senaryolar
- [✅ start] Adım 1 boş (ad "New workspace", isim alanları boş, Continue kapalı; Switch workspace görünür) · rol: owner · nasıl: /onboarding · mock: var
- [❌ EKSİK] Adım 1 doldurulup adım 2'ye geçiş · rol: owner · nasıl: First + Last + Workspace name → Continue · mock: var — mevcut `next` senaryosu yalnız ilk girişi (First name) doldurur, Last name boş kaldığı için Continue kapalıdır; ekran adım 1'de kalır
- [❌ EKSİK] Adım 1 ABD harf kuralı hatası (ör. "Şule") · rol: owner · nasıl: First name'e Türkçe harf · mock: var
- [❌ EKSİK] Adım 2 boş: "No locations yet…", Continue kapalı · rol: owner · nasıl: adım 1 tamam → adım 2 · mock: var (setup ile step=2 seed daha kolay)
- [❌ EKSİK] Adım 2 lokasyon eklendi: satır + "Location added" · rol: owner · nasıl: lokasyon alanları → Add location · mock: var
- [❌ EKSİK] Adım 2 saat dilimi önerisi ("Suggested from the postal code…") · rol: owner · nasıl: Country US + ZIP 10001 · mock: var
- [❌ EKSİK] Adım 2 öneri yok / öneri kullanılamıyor satırları · rol: owner · nasıl: US dışı ülke ya da kısa kod · mock: var ("unavailable" dalı)
- [❌ EKSİK] Adım 2 alan hataları (kısa ad kuralı, aynı kısa ad "… already goes by that short name.", telefon) · rol: owner · nasıl: hatalı değerlerle Add location · mock: var
- [❌ EKSİK] Adım 2 düzenleme modu: "Edit {ad}", Cancel, Save changes, Continue kapalı · rol: owner · nasıl: Edit {lokasyon} · mock: var
- [❌ EKSİK] Adım 2 lokasyon silme iki tık "Confirm remove" · rol: owner · nasıl: Remove ×1 · mock: var
- [❌ EKSİK] Adım 3 boş (Management notu, "Add a department" formu) · rol: owner · nasıl: adım 3'e geç · mock: var
- [❌ EKSİK] Adım 3 departman + iş eklendi, Continue açık · rol: owner · nasıl: Add department → Add job · mock: var
- [❌ EKSİK] Adım 3 departmanı yeniden adlandırma (satır içi) · rol: owner · nasıl: Rename · mock: var
- [❌ EKSİK] Adım 3 işli departmanı silme "Confirm remove, takes N jobs with it" · rol: owner · nasıl: Remove ×1 · mock: var
- [❌ EKSİK] Adım 3 iş paneli (çip açık: ad, departman, Save/Remove/Close) · rol: owner · nasıl: iş çipine tıkla · mock: var
- [❌ EKSİK] Adım 3 "No department" grubu (departmanı gitmiş iş) · rol: owner · nasıl: — · mock: eksik: departmansız iş seed'i
- [❌ EKSİK] Adım 3 aynı adlı departman/iş reddi (sunucu hatası barda) · rol: owner · nasıl: aynı adla Add · mock: var (23505)
- [❌ EKSİK] Adım 4 boş form, Add employee kapalı · rol: owner · nasıl: adım 4'e geç · mock: var
- [❌ EKSİK] Adım 4 kişi eklendi: "Added so far" + "Added. The invitation goes out when setup finishes." · rol: owner · nasıl: ad + lokasyon + iş + e-posta → Add employee · mock: var
- [❌ EKSİK] Adım 4 "Works remotely"/"Not on the schedule" → Locations/Jobs "required" kalkar · rol: owner · nasıl: kutuyu işaretle · mock: var
- [❌ EKSİK] Adım 4 Owner işi kilitli kutu · rol: owner · nasıl: Jobs listesine bak · mock: var
- [❌ EKSİK] Adım 4 taslak varken Finish: "Add the employee draft or clear it…" · rol: owner · nasıl: ad yaz → Finish setup · mock: var
- [❌ EKSİK] Adım 4 Clear draft iki tık "Confirm clear" → "Draft cleared" · rol: owner · nasıl: Clear draft ×2 · mock: var
- [❌ EKSİK] Finish setup başarılı → /app/workspace · rol: owner · nasıl: Finish setup · mock: var (harness uyarısı)
- [❌ EKSİK] Finish eksik yapıyla: adım 2/3'e atar + hata · rol: owner · nasıl: lokasyonsuz Finish · mock: var
- [❌ EKSİK] Start over iki tık "Confirm start over" → adım 1 + "Setup reset" · rol: owner · nasıl: Start over ×2 · mock: var
- [❌ EKSİK] Başka sekmede değişti uyarısı ("Your setup changed in another tab…") · rol: owner · nasıl: herhangi kayıt · mock: eksik: 409 cevabında `reason: workspace.onboarding_changed` (mock yalnız mesaj dönüyor)
- [❌ EKSİK] "Loading your setup…" · rol: owner · nasıl: açılış · mock: eksik: gecikme
- [❌ EKSİK] Referanslar yüklenemedi hatası · rol: owner · nasıl: açılış · mock: eksik: settings/locations hata dalı
- [❌ EKSİK] Tek workspace: "Switch workspace" yok · rol: owner · nasıl: /onboarding · mock: eksik: yalnız taslak workspace'li hesap
- [❌ EKSİK] Owner olmayan üye /onboarding açınca "Almost ready" · rol: manager · nasıl: /onboarding · mock: eksik: owner olmayan rol + incomplete context
- [❌ EKSİK] Telefon: üst bar (ilerleme, Exit setup, Start over), adım listesi gizli · rol: owner · nasıl: 390 genişlik · mock: var

## 1.8 Employee welcome — /welcome ve /welcome/:workspaceId/*

### Parçalar
- /welcome yönlendirici: "Checking your account"; tek bekleyen → /welcome/:id; birden çok → /organization-switcher (→ /workspaces); hiç yoksa iniş sayfası — `employees/WelcomeRedirect.tsx:9-27`.
- Geçersiz kimlik (/welcome/profile gibi) → /welcome — `employees/EmployeeOnboardingPage.tsx:57, 87`.
- Durum ekranları: "Loading your onboarding" · "Your onboarding didn't load" + "Try again" · "Finishing up" (onaylandı, /app/employee-hub'a geçer) — `EmployeeOnboardingPage.tsx:89-123, 72-93`.
- Sol panel: "NEWFORK", workspace adı + "Employee onboarding", "N of M steps done", adımlar Profile / Documents / Availability (optional) / Review (✓ biten), "Exit onboarding", hesap bloğu — `EmployeeOnboardingPage.tsx:287-375`.
- Karşılama: "Welcome to {workspace}", "Let's set up your employee account", Locations ve Jobs özeti ("Not assigned yet"), "Begin" — `EmployeeOnboardingPage.tsx:461-505`.
- Profil sayfa 1 "Your details": Legal first/middle/last, Preferred name, E-mail (salt okunur), Phone (hesapta varsa salt okunur + "Change it in Account › Profile"), Date of birth, Street address, City, State, ZIP; "Team visibility" iki anahtar; doğrulama satırı; "Continue" — `EmployeeOnboardingPage.tsx:740-867`.
- Profil sayfa 2 "Who we call in an emergency": Full name, Relationship (Spouse/partner, Parent, Sibling, Child, Friend, Other → "How you know them"), Phone, Email (optional); "‹ Your details", "Save and continue"/"Saving" — `EmployeeOnboardingPage.tsx:660-739`.
- Telefon kuralları: numara workspace'te başkasında ("phone in use"), acil numara kendi numarası; yönetici reddi notu (Attention) — `EmployeeOnboardingPage.tsx:568-662`.
- Belgeler grubu "Your documents": "To upload" ve "To read" bölümleri, satır rolü "Required"/"Optional"/"Only if it applies to you", durum rozeti (To do, In progress, In review, Done, Needs changes, Follow-up needed, Replaced), "Open", "Continue" — `EmployeeOnboardingPage.tsx:381-459`.
- Belge sayfası: başlık + açıklama + rozet, yönetici reddi notu, "Due …", saat dilimi uyarısı, politika metni + "Confirm" (onay kutusu + "Type your name as …"), "Signed by … on …", "Undo my confirmation", dosya alanı "Choose a file"/"Add another file" (biçimler, 10 MB), yükleme hatası "{dosya} did not upload." + "Try again"/"Drop it", dosya listesi (indir, "Remove"), "Expiry date on the document", ek alanlar, "Don't have it yet?" + Reason + "Save reason", bar "‹ Documents" + "Acknowledge and continue"/"Submit and continue"/"Continue"/"Saving", yükleniyor/hata — `employees/OnboardingDocumentStep.tsx:54-84, 246-480`.
- Uygunluk adımı "The hours you can work": `WeeklyPreferencesPanel` (onboarding modu) + "Skip for now"/"Continue"; kaydedilmemiş saatle çıkarken onay penceresi "Discard availability changes?" (Stay here / Discard and leave) — `EmployeeOnboardingPage.tsx:895-927`; `availability/availability-navigation.tsx:236-260`.
- İnceleme: "Check it over, then send it" / "Your manager asked for a change" / "Sent to your manager", "Your steps" listesi (Required/Optional, Done/To do, Open), "Send for review" (zorunlular bitmeden kapalı; gönderildiyse yok) — `EmployeeOnboardingPage.tsx:929-1019`.
- Hata metinleri: başka yerde değişti "Your onboarding changed meanwhile…", phone in use, emergency is own phone — `EmployeeOnboardingPage.tsx:1252-1270`.
- Telefon (≤720px): sol panel üst bara döner, adım listesi gizli — `shell/prebiz/prebiz.css:487-536`.

### Senaryolar
- [✅ start] Karşılama (Harbor & Vine, lokasyon ve iş özeti) · rol: employee · nasıl: /welcome → /welcome/:id · mock: var
- [✅ begin] Profil sayfa 1 "Your details" · rol: employee · nasıl: Begin · mock: var
- [❌ EKSİK] Profil doğrulama hatası (zorunlu alan eksik) · rol: employee · nasıl: begin + boş alanla Continue · mock: var
- [❌ EKSİK] Telefon başkasında kayıtlı uyarısı · rol: employee · nasıl: hesapta telefon yokken başka çalışanın numarası · mock: var (hesapsız telefon için seed gerek)
- [❌ EKSİK] Profil sayfa 2 acil durum kişisi · rol: employee · nasıl: begin + alanlar → Continue · mock: var
- [❌ EKSİK] "Other" ilişki → "How you know them" alanı · rol: employee · nasıl: Relationship = Other · mock: var
- [❌ EKSİK] Acil numara kendi numarası hatası · rol: employee · nasıl: Phone = kendi numarası · mock: var
- [❌ EKSİK] Belgeler grubu (W-4, I-9, Food handler "Only if it applies to you", Employee handbook "To read") · rol: employee · nasıl: /welcome/:id/documents · mock: var
- [❌ EKSİK] Yükleme belgesi sayfası (W-4, "Choose a file") · rol: employee · nasıl: Open Form W-4 · mock: var
- [❌ EKSİK] Dosya yüklenmiş taslak: dosya listesi, Remove, "Submit and continue" · rol: employee · nasıl: dosya seç · mock: eksik: senaryo adımlarında dosya seçme adımı yok (ya da taslaklı seed)
- [❌ EKSİK] Bitiş tarihi + ek alan (I-9: Expiry date, Document number) · rol: employee · nasıl: Open I-9 + dosya · mock: eksik: dosya adımı/taslak seed
- [❌ EKSİK] Yükleme başarısız "did not upload" + Try again/Drop it · rol: employee · nasıl: dosya seç · mock: eksik: upload hata dalı
- [❌ EKSİK] Yanlış biçim reddi ("This document takes PDF, JPEG, PNG files") · rol: employee · nasıl: başka biçimde dosya · mock: var (dosya adımı gerek)
- [❌ EKSİK] Koşullu belge erteleme "Don't have it yet?" + Save reason · rol: employee · nasıl: Open Food handler card → Reason → Save reason · mock: var
- [❌ EKSİK] Politika onayı: kutu + ad yazma → "Acknowledge and continue" · rol: employee · nasıl: Open Employee handbook → kutu → ad · mock: var
- [❌ EKSİK] Onaylanmış politika: "Signed by … on …" + "Undo my confirmation" · rol: employee · nasıl: onay sonrası tekrar aç · mock: var
- [❌ EKSİK] Belge yönetici reddi notu + "Needs changes" rozeti · rol: employee · nasıl: belge aç · mock: eksik: rejected durumlu gereksinim seed'i
- [❌ EKSİK] Teslim tarihi "Due …" ve saat dilimi uyarısı · rol: employee · nasıl: belge aç · mock: eksik: deadline_at / timezone=null seed'i
- [❌ EKSİK] Belge yüklenemedi hatası (sayfa içi) · rol: employee · nasıl: belge aç · mock: eksik: detay ucu hata dalı
- [❌ EKSİK] Uygunluk adımı (haftalık tablo, Skip for now) · rol: employee · nasıl: /welcome/:id/availability · mock: var
- [❌ EKSİK] Uygunlukta kaydedilmemiş saatle çıkış onayı · rol: employee · nasıl: saat ekle → Exit onboarding · mock: var
- [❌ EKSİK] İnceleme: zorunlular eksik, Send for review kapalı · rol: employee · nasıl: /welcome/:id/review · mock: var
- [❌ EKSİK] İnceleme: hepsi tamam, Send for review açık · rol: employee · nasıl: review · mock: eksik: tamamlanmış gereksinimli seed
- [❌ EKSİK] Gönderildi: "Sent to your manager" (düğme yok) · rol: employee · nasıl: review · mock: eksik: case_status=submitted seed
- [❌ EKSİK] Değişiklik istendi: "Your manager asked for a change" + profil reddi notu · rol: employee · nasıl: review / profile · mock: eksik: changes_requested + rejection_reason seed
- [❌ EKSİK] Onaylandı: "Finishing up" → /app/employee-hub · rol: employee · nasıl: açılış · mock: eksik: approved seed
- [❌ EKSİK] "Your onboarding didn't load" + Try again · rol: employee · nasıl: açılış · mock: eksik: /v1/me/onboarding hata dalı
- [❌ EKSİK] Başka yerde değişti hatası ("Your onboarding changed meanwhile…") · rol: employee · nasıl: kaydet · mock: eksik: 409'da `reason: onboarding.changed`
- [❌ EKSİK] Uygunluk adımı olmayan rol (adım listede yok) · rol: manager · nasıl: /welcome/:id · mock: eksik: availability'siz vaka
- [❌ EKSİK] Birden çok bekleyen onboarding → hub · rol: employee · nasıl: /welcome · mock: eksik: ikinci pending workspace
- [❌ EKSİK] "Loading your onboarding" · rol: employee · nasıl: açılış · mock: eksik: gecikme
- [❌ EKSİK] Telefon: üst bar, adım listesi gizli · rol: employee · nasıl: 390 genişlik · mock: var

## YENİ — Almost ready (kurulumu bitmemiş workspace'te owner olmayan üye) — /app/* ve /onboarding

### Parçalar
- `WorkspaceSetupPending`: "Almost ready", "{workspace} is still being set up. You'll get access the moment the owner finishes.", yeşil "Check again", ikincil "Choose a workspace" (birden çok workspace varsa; /organization-switcher → /workspaces) — `auth/WorkspaceSetupPending.tsx:8-45`.
- Çıkış ProtectedRoute'tan: context var, onboarding tamamlanmamış, rol owner değil — `auth/ProtectedRoute.tsx:63-71`.

### Senaryolar
- [❌ EKSİK] Tek workspace: yalnız "Check again" · rol: manager · nasıl: kurulumu süren workspace'te /app · mock: eksik: owner olmayan rol + onboarding incomplete context
- [❌ EKSİK] Birden çok workspace: "Choose a workspace" de görünür · rol: employee · nasıl: aynı · mock: eksik: aynı + ikinci workspace

## YENİ — That workspace didn't load (workspace bağlamı yüklenemedi) — /app/* ve /onboarding

### Parçalar
- "That workspace didn't load", "Something went wrong on our side, not yours. Try again, or pick a different workspace.", yeşil "Try again", çerçevede "Sign out" — `auth/ProtectedRoute.tsx:35-58`.
- Hata yoksa ve context yoksa: /workspaces'e (landing state) — `auth/ProtectedRoute.tsx:59-61`.
- Oturumsuz: /sign-in (state.from) — `auth/ProtectedRoute.tsx:25-33`.
- Yükleniyor: boş `main` "Loading workspace" — `auth/ProtectedRoute.tsx:22-23`; uygulama geneli Suspense "Loading page" — `App.tsx:151-155`.

### Senaryolar
- [❌ EKSİK] Bağlam hatası ekranı + Try again · rol: herkes · nasıl: /app, /v1/context 500 · mock: eksik: context hata dalı

---

## 11.0 Account · Profile — /account/profile

B görünümü (main 48f81bc1, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Legal name bölümü: gri satırlar, okunamazsa küçük kart "We couldn't load your legal name". PAGES senaryosu: `legal-failed`.

### Parçalar
- Hesap çerçevesi (bütün 11.x): sol panel kimlik (avatar + ad), menü Profile / Security / Preferences / Notifications / Workspaces (sayaç) / Documents (sayaç), "Back to workspace" (context varsa), "Sign out"; Inbox menüde yok — `account/AccountLayout.tsx:24-139`.
- Sayaç rozeti "N waiting on you" (Workspaces = davet, Documents = bekleyen belge) — `AccountLayout.tsx:56-64, 88-114`.
- Telefon (≤820px): sol panel üstte yatay kaydırılan sekmelere döner, kimlik gizli, etkin sekme ortalanır — `account/account.css:562-600`; `AccountLayout.tsx:66-75`.
- Kaydedilmemiş değişiklikle ayrılma onayı "Discard profile changes?" (Stay here / Discard and leave; kaydederken "Saving profile") — `account/ProfilePage.tsx:258-262`; `availability/availability-navigation.tsx:236-260`.
- Başlık "Profile", "Your name, photo and phone, and who to call in an emergency." — `ProfilePage.tsx:478-483`.
- Fotoğraf: avatar, "JPG, PNG or WebP · up to 5 MB", "Upload"/"Replace", iki tık "Remove"→"Confirm remove", gizli dosya girişi — `ProfilePage.tsx:485-523`.
- Kırpma penceresi: "Crop profile photo", önizleme, Zoom / Horizontal / Vertical kaydırıcıları, hata (çözülemeyen görüntü, 40 MP), "Cancel crop", "Use photo"/"Preparing" — `account/AvatarCropDialog.tsx:33-66`.
- "Legal name" bölümü (yalnız owner olduğu workspace'ler; birden çoksa workspace adıyla): First, Middle (optional), Last; okunamazsa "Your legal name could not be loaded…" — `ProfilePage.tsx:691-836`.
- Preferred name (optional; harf kuralı satırı ya da "Shown everywhere except documents. A manager approves it.") — `ProfilePage.tsx:526-551`.
- Phone number (ABD maskesi, zorunlu) — `ProfilePage.tsx:552-565`.
- "Emergency contact" bölümü: Contact name, Relationship, Contact phone (kendi numarası hatası); kurulumu süren workspace notu ("Finish setting up this workspace… Account › Workspaces"); onboarding'i bitmemiş workspace notu + "Continue setup" — `ProfilePage.tsx:567-657`.
- Hata satırı (çoklu workspace hataları birleşik: "could not be saved in …", "can no longer be changed in …"), başarı "Profile saved" / "Profile saved. A manager needs to approve your preferred name." — `ProfilePage.tsx:386-447, 659-660`.
- "To save, fill in …" eksik alan satırı; "Discard" (değişiklik varsa), "Save"/"Saving" — `ProfilePage.tsx:661-681`.

### Senaryolar
- [✅ owner] Owner: Legal name bölümü, telefon dolu, acil kişi formu · rol: owner · nasıl: /account/profile · mock: var
- [✅ manager] Manager: Legal name yok · rol: manager · nasıl: /account/profile · mock: var
- [✅ employee] Employee · rol: employee · nasıl: /account/profile · mock: var
- [❌ EKSİK] Değişiklik var: Discard + Save açık · rol: owner · nasıl: Preferred name'i değiştir · mock: var
- [❌ EKSİK] Eksik alan satırı "To save, fill in …" · rol: employee · nasıl: telefon/acil kişi boş · mock: var (alanı silerek)
- [❌ EKSİK] ABD harf kuralı satırı (Preferred name / Legal name / Contact) · rol: owner · nasıl: Türkçe harf yaz · mock: var
- [❌ EKSİK] Acil numara kendi numarası hatası · rol: owner · nasıl: Contact phone = kendi telefonu · mock: var
- [❌ EKSİK] Kaydedildi "Profile saved" · rol: owner · nasıl: değiştir → Save · mock: var
- [❌ EKSİK] Tercih edilen ad onay bekliyor "Profile saved. A manager needs to approve…" · rol: employee · nasıl: Preferred name → Save · mock: eksik: preferred-name isteğinin "waiting" dönmesi (doğrulanmadı)
- [❌ EKSİK] Kısmi hata: "could not be saved in {workspace}. Try again." / "can no longer be changed in …" · rol: employee · nasıl: Save · mock: eksik: acil kişi/tercih adı ucunda hata dalı
- [❌ EKSİK] Fotoğraf kırpma penceresi · rol: herkes · nasıl: Upload → dosya seç · mock: eksik: senaryo adımlarında dosya seçme yok
- [❌ EKSİK] Fotoğraf hatası (boyut/biçim, "This image could not be decoded…") · rol: herkes · nasıl: dosya seç · mock: eksik: dosya adımı
- [❌ EKSİK] Fotoğraf silme iki tık "Confirm remove" · rol: herkes · nasıl: fotoğraflı hesapta Remove · mock: eksik: avatar_object_path dolu seed
- [❌ EKSİK] Birden çok owner workspace'i: Legal name workspace adlarıyla · rol: owner · nasıl: /account/profile · mock: eksik: ikinci owner workspace (Saltline admin)
- [❌ EKSİK] Legal name okunamadı satırı · rol: owner · nasıl: /account/profile · mock: eksik: legal-name ucu hata dalı
- [❌ EKSİK] Kurulumu süren workspace notu (acil kişi yerine) · rol: owner · nasıl: /account/profile · mock: eksik: taslak workspace + employment record
- [❌ EKSİK] Onboarding'i bitmemiş workspace notu + Continue setup · rol: employee · nasıl: /account/profile · mock: eksik: pending üyelik + record
- [❌ EKSİK] Kaydedilmemiş değişiklikle çıkış onayı · rol: owner · nasıl: değiştir → başka sekme · mock: var
- [❌ EKSİK] Workspace'siz hesap (acil kişi bölümü yok, "Back to workspace" yok) · rol: herkes · nasıl: /account/profile · mock: eksik: boş hesap
- [❌ EKSİK] Sayaç rozetleri (Workspaces 1, Documents N) · rol: employee · nasıl: sol menü · mock: var (görünür ama ayrı senaryo yok)
- [❌ EKSİK] Telefon: yatay sekmeler · rol: herkes · nasıl: 390 genişlik · mock: var

## 11.1 Account · Security — /account/security

B görünümü (main 48f81bc1, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Güvenlik bilgileri okunamazsa üstte "Your security details didn't load. Email verification and account deletion wait until they do." + Try again; "Checking verification" yazısı gizlenir. PAGES senaryoları: `checking`, `load-failed`.

### Parçalar
- Başlık "Security", "Keep sign-in methods and recovery details current." — `account/SecurityPage.tsx:113`.
- "Email address": adres + "Verified"/"Not verified"/"Checking verification"; bekleyen değişiklik kutusu "Verify {yeni}" + "Resend" + "Cancel change" (kırmızı); yoksa "New email" + "Change email" — `SecurityPage.tsx:115-143`.
- "Password": Current / New / Confirm, alt hata satırı, "Change password" (eksik/uyuşmazsa kapalı) — `SecurityPage.tsx:145-158`.
- "Active sessions": Current password + "Sign out other sessions", alt hata — `SecurityPage.tsx:160-172`.
- "Delete account": engel kutusu "Your account is still in use" + özet cümle (sahip olunan / üye olunan / bekleyen devir); engel yoksa "Pending invitations will be cancelled…"; kırmızı "Delete account" (engel varsa kapalı) — `SecurityPage.tsx:174-184, 247-288`.
- Silme penceresi (`dialog`): "Delete your account?", iki paragraf, Current password, hata, "Cancel", kırmızı "Confirm account deletion" → oturum kapanır — `SecurityPage.tsx:185-203`.
- Sayfa altı genel hata ve başarı satırı ("Verification links sent to both email addresses", "Verification links sent again", "Email change cancelled", "Password changed; other sessions were signed out", "Other sessions signed out"); yükleme hatası "Security details could not be loaded" — `SecurityPage.tsx:70-72, 92-109, 207-209`.
- Parola reddi metinleri: "That password did not match. Type it again." / "Type your account password to continue." — `SecurityPage.tsx:215-236`.

### Senaryolar
- [✅ owner] Owner: e-posta Verified, engel kutusu (2 workspace) · rol: owner · nasıl: /account/security · mock: var
- [✅ manager] Manager · rol: manager · nasıl: /account/security · mock: var
- [✅ employee] Employee · rol: employee · nasıl: /account/security · mock: var
- [❌ EKSİK] Silme penceresi "Delete your account?" · rol: owner · nasıl: Delete account · mock: eksik: her rolün aktif üyeliği olduğu için düğme kapalı — mevcut `delete` senaryosu pencereyi açamaz, yalnız engel kutusunu gösterir; engelsiz hesap seed'i gerek
- [❌ EKSİK] Silme onayı → istek + oturum kapanışı · rol: herkes · nasıl: pencere → parola → Confirm account deletion · mock: eksik: engelsiz hesap
- [❌ EKSİK] Engel özeti: sahip olunan + üye olunan workspace birlikte · rol: owner · nasıl: /account/security · mock: var (owner: Harbor owner + Saltline admin)
- [❌ EKSİK] Engel özeti: bekleyen sahiplik devri · rol: owner · nasıl: /account/security · mock: eksik: pending_ownership_transfer engeli
- [❌ EKSİK] E-posta değişikliği istendi: "Verify {yeni}" kutusu · rol: herkes · nasıl: New email → Change email · mock: var
- [❌ EKSİK] Resend / Cancel change sonuçları · rol: herkes · nasıl: bekleyen kutuda düğmeler · mock: var
- [❌ EKSİK] E-posta hatası ("New email must be different") · rol: herkes · nasıl: aynı adresle Change email · mock: var
- [❌ EKSİK] Parola değişti başarısı · rol: herkes · nasıl: üç alan → Change password · mock: var
- [❌ EKSİK] Yanlış mevcut parola "That password did not match…" · rol: herkes · nasıl: Change password / Sign out other sessions · mock: eksik: `session.password_incorrect` dalı (mock her parolayı kabul eder)
- [❌ EKSİK] Öbür oturumları kapat başarısı · rol: herkes · nasıl: parola → Sign out other sessions · mock: var
- [❌ EKSİK] E-posta doğrulanmamış "Not verified" · rol: herkes · nasıl: /account/security · mock: eksik: emailVerified=false
- [❌ EKSİK] Güvenlik bilgisi yüklenemedi · rol: herkes · nasıl: açılış · mock: eksik: /v1/account/security hata dalı
- [❌ EKSİK] "Checking verification" yükleniyor · rol: herkes · nasıl: açılış · mock: eksik: gecikme
- [❌ EKSİK] Telefon görünümü (üçlü parola ızgarası) · rol: herkes · nasıl: 390 genişlik · mock: var

## 11.2 Account · Preferences — /account/preferences

### Parçalar
- Başlık "Preferences", "Choose how Newfork formats information for this account." — `account/PreferencesPage.tsx:69-73`.
- "Regional format": Date format (System, 09-14-2026, 14-09-2026, 2026-09-14) + "Display only…"; Time format (System, 9:30 AM, 09:30) + "Workspace timezone is unchanged." — `PreferencesPage.tsx:74-99`.
- Hata satırı, "Preferences saved", "Discard" (değişiklik varsa), "Save"/"Saving" — `PreferencesPage.tsx:101-106`.
- Ayrılma onayı "Discard preference changes?" — `PreferencesPage.tsx:19-23`.

### Senaryolar
- [✅ owner] Owner, varsayılan System · rol: owner · nasıl: /account/preferences · mock: var
- [✅ manager] Manager · rol: manager · nasıl: aynı · mock: var
- [✅ employee] Employee · rol: employee · nasıl: aynı · mock: var
- [❌ EKSİK] Değişiklik: Discard + Save açık · rol: herkes · nasıl: Date format seç · mock: var
- [❌ EKSİK] Kaydedildi "Preferences saved" · rol: herkes · nasıl: seç → Save · mock: var
- [❌ EKSİK] Kayıt hatası · rol: herkes · nasıl: Save · mock: eksik: user_preferences yazma hata dalı
- [❌ EKSİK] Kaydedilmemişken ayrılma onayı · rol: herkes · nasıl: seç → başka sekme · mock: var

## 11.3 Account · Notification preferences — /account/preferences/notifications

B görünümü (main 48f81bc1, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kart: "We couldn't load your notification preferences"; okunamazken tablo ve Save görünmez. PAGES senaryoları: `loading`, `load-failed`.

### Parçalar
- Başlık "Notifications", "Choose which updates reach you, workspace by workspace." — `account/NotificationPreferencesPage.tsx:145-146`.
- Workspace seçici (birden çok workspace varsa; değişiklik varken kapalı + "Save or discard changes before choosing another workspace."); workspace yoksa "Workspace notification controls become available when you have workspace access." — `NotificationPreferencesPage.tsx:147-154`.
- Yükleniyor "Loading preferences"; erişim yok kartı (`NoAccessState`); hata satırı; başka yerde değişti "Your notification choices changed elsewhere…" — `NotificationPreferencesPage.tsx:155-159, 53-54`.
- Matris başlığı "In app" / "Email" — `NotificationPreferencesPage.tsx:160-166`.
- Kategori satırı: başlık + açıklama ("Workspace access alerts" güvenlik için), iki ana anahtar (kısmi seçimde karışık), aç/kapa düğmesi "Expand/Collapse individual notifications for …" — `NotificationPreferencesPage.tsx:167-195`.
- Açık kategori "Individual notifications": bildirim kartları, kanal kutuları, kilit nedenleri (always shown in app, email delivery unavailable, organization/role policy, unsupported) — `NotificationPreferencesPage.tsx:196-228`.
- "Notification preferences saved", "Discard", "Save"/"Saving" — `NotificationPreferencesPage.tsx:232-239`.
- Not: API'nin döndüğü hesap güvenlik bildirimleri listesi (`account_catalog`) bu sayfada gösterilmiyor.

### Senaryolar
- [✅ owner] Owner: workspace seçici (Harbor, Saltline) + kategoriler · rol: owner · nasıl: /account/preferences/notifications · mock: var
- [✅ manager] Manager: seçici yok · rol: manager · nasıl: aynı · mock: var
- [✅ employee] Employee · rol: employee · nasıl: aynı · mock: var
- [✅ expand] Schedule kategorisi açık (tek tek bildirimler) · rol: owner · nasıl: Expand individual notifications for Schedule · mock: var
- [❌ EKSİK] Değişiklik: seçici kilitli + uyarı satırı, Discard/Save · rol: owner · nasıl: bir kutuyu değiştir · mock: var
- [❌ EKSİK] Kaydedildi "Notification preferences saved" · rol: herkes · nasıl: değiştir → Save · mock: var
- [❌ EKSİK] Başka workspace seçimi (Saltline) · rol: owner · nasıl: Workspace = Saltline Oyster Bar · mock: var
- [❌ EKSİK] Kurum politikasıyla kilitli kanal (organization_policy_denied) · rol: manager · nasıl: kategori aç · mock: var (Settings › Notifications politikası varsa; doğrulanmadı)
- [❌ EKSİK] Kısmi seçili ana anahtar (karışık durum) · rol: owner · nasıl: kategori içinde tek kutuyu kapat · mock: var
- [❌ EKSİK] Başka yerde değişti hatası · rol: herkes · nasıl: Save · mock: eksik: 409'da `reason: notification.preference_changed` (mock yalnız mesaj)
- [✅ no-access] Erişim yok kartı · rol: herkes · nasıl: açılış · mock: eksik: authz hata dalı
- [❌ EKSİK] Workspace'siz hesap metni · rol: herkes · nasıl: context'siz açılış · mock: eksik: context'siz hesap
- [❌ EKSİK] "Loading preferences" · rol: herkes · nasıl: açılış · mock: eksik: gecikme

## 11.4 Account · Workspaces — /account/workspaces

B görünümü (main 48f81bc1, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kart: "We couldn't load your workspaces"; "No workspaces yet" yalnız liste gerçekten okunduysa. PAGES senaryoları: `loading`, `load-failed`.

### Parçalar
- Başlık "Workspaces", "See every workspace linked to this account and manage ownership deliberately.", "Create workspace" (owner üyeliği varsa ya da hiç workspace + davet yoksa) — `account/WorkspacesPage.tsx:489-503, 134-136`.
- Sahiplik devri isteği şeridi (hedef kişiye): "Ownership transfer · {ad}", son tarih, "Reject owner transfer" / "Accept owner transfer" — `WorkspacesPage.tsx:505-524`.
- Yükleniyor "Loading workspaces..." — `WorkspacesPage.tsx:525-529`.
- Liste: davet satırları (`InvitationRow`: Decline iki tık, Join) — `WorkspacesPage.tsx:531-534`; `employees/InvitationRow.tsx:43-86`.
- Boş satır "No workspaces yet" + "Respond to your invitation to continue." / "Create your first workspace to continue." + Create — `WorkspacesPage.tsx:535-543`.
- Workspace satırı: ad, rol, şimdiki vurgu; rozetler "Onboarding in progress", "Setup in progress", "Default", "Scheduled closure · {tarih}", "Ownership transfer needs response/pending"; düğme "Continue" (onboarding/kurulum) ya da "Open"/"Opening" — `WorkspacesPage.tsx:544-599`.
- Satır işlemleri menüsü ("Actions for {ad}", ok tuşları, Escape): "Set as default"/"Setting default"/"Default workspace"; owner: "Transfer ownership", "Schedule closure", "Close immediately" (kırmızı); planlıysa "Cancel closure"; devir başlatmışsa "Cancel transfer" — `WorkspacesPage.tsx:600-676`.
- "Transfer ownership" paneli: açıklama, "Find an admin by name or email", "Searching eligible admins...", arama hatası, sonuç yok metni, aday radyoları, "I understand I cannot undo this once they accept it.", Account password, "Start transfer"/"Starting transfer", "Cancel" — `WorkspacesPage.tsx:680-765`.
- Kapanış paneli: "Close {ad} immediately" / "Schedule closure for {ad}", kişi sayısı cümlesi + sonuç cümlesi, "Type the workspace name" (hemen kapatmada), Account password (taslakta yok), onay kutusu, "Close immediately"(kırmızı)/"Schedule closure"/"Closing", "Keep this workspace" — `WorkspacesPage.tsx:766-873`.
- Devir yanıt paneli: "Take over {ad}" / "Turn down {ad}", açıklama, parola (kabulde), "Accept transfer"/"Reject transfer"/"Saving response", "Cancel" — `WorkspacesPage.tsx:874-940`.
- Hata kutusu (panelin içinde ya da sayfa altında) + "Cancel that transfer" (engelleyen devir) ve ~20 sunucu reddi cümlesi — `WorkspacesPage.tsx:421-440, 995-1090`.
- Başarı yönlendirmeleri: Open → /app/workspace ya da /app/employee-hub; hata "Workspace context could not be loaded", "Workspace could not be selected", "Default workspace could not be changed" — `WorkspacesPage.tsx:213-265`.

### Senaryolar
- [✅ owner] Owner: Cedar daveti, Harbor (owner, Default, şimdiki), Saltline (admin) · rol: owner · nasıl: /account/workspaces · mock: var
- [✅ manager] Manager: davet + Harbor (Bayside askıda listede yok) · rol: manager · nasıl: aynı · mock: var
- [✅ employee] Employee: davet + Harbor · rol: employee · nasıl: aynı · mock: var
- [❌ EKSİK] İşlemler menüsü açık (owner: Set as default/Transfer/Schedule/Close) · rol: owner · nasıl: Actions for Harbor & Vine · mock: var
- [❌ EKSİK] İşlemler menüsü owner olmayan satırda (yalnız Set as default) · rol: owner · nasıl: Actions for Saltline Oyster Bar · mock: var
- [❌ EKSİK] Varsayılanı değiştir → "Default" rozeti taşınır · rol: owner · nasıl: Saltline menüsü → Set as default · mock: eksik: account sayfasında set-default ucu (yalnız /active var; doğrulanmadı)
- [❌ EKSİK] Planlı kapanış paneli · rol: owner · nasıl: menü → Schedule closure · mock: var
- [❌ EKSİK] Planlı kapanış sonrası rozet "Scheduled closure · {tarih}" + "Cancel closure" · rol: owner · nasıl: panel → kutu + parola → Schedule closure · mock: var
- [❌ EKSİK] Hemen kapatma paneli (ad yazma, kırmızı düğme) · rol: owner · nasıl: menü → Close immediately · mock: var
- [❌ EKSİK] Ad uyuşmazlığı reddi "The name you typed is not this workspace's name…" · rol: owner · nasıl: yanlış ad → Close immediately · mock: var (düğme ad eşleşmeden kapalı; sunucu dalı için doğrudan çağrı gerekir)
- [❌ EKSİK] Sahiplik devri paneli + arama sonuç yok · rol: owner · nasıl: menü → Transfer ownership → 2 harf · mock: var (Harbor'da admin yok → "Nobody here matches…")
- [❌ EKSİK] Sahiplik devri aday listesi + Start transfer · rol: owner · nasıl: arama · mock: eksik: Harbor'da aktif admin + devir saklama (mock "not kept" der)
- [❌ EKSİK] Devir bekliyor rozeti + "Cancel transfer" · rol: owner · nasıl: /account/workspaces · mock: eksik: pendingOwnershipTransfer (initiator)
- [❌ EKSİK] Devir isteği şeridi + Accept/Reject panelleri · rol: owner/manager · nasıl: şeritteki düğmeler · mock: eksik: pendingOwnershipTransfer (target)
- [❌ EKSİK] Engelleyen devir hatası + "Cancel that transfer" · rol: owner · nasıl: devir varken kapatma · mock: eksik: devir seed'i + `workspace.closure.transfer_pending`
- [❌ EKSİK] Yanlış parola reddi · rol: owner · nasıl: panel → parola → onay · mock: eksik: `session.password_incorrect`
- [❌ EKSİK] Kurulumu süren taslak: "Setup in progress" + Continue · rol: owner · nasıl: /account/workspaces · mock: eksik: taslak workspace seed'i
- [❌ EKSİK] Onboarding süren üyelik: "Onboarding in progress" + Continue (→ /welcome) · rol: employee · nasıl: Join sonrası · mock: var (Join ile)
- [❌ EKSİK] Daveti reddetme iki tık · rol: herkes · nasıl: Decline ×2 · mock: var
- [❌ EKSİK] Boş "No workspaces yet" (davetli / davetsiz) · rol: herkes · nasıl: /account/workspaces · mock: eksik: boş hesap
- [❌ EKSİK] Liste yüklenemedi hatası · rol: herkes · nasıl: açılış · mock: eksik: hata dalı
- [❌ EKSİK] Open → workspace'e gider; "Workspace could not be selected" · rol: herkes · nasıl: Open · mock: var (başarı; hata eksik)
- [❌ EKSİK] Taslakta "Continue" aslında /app/workspace'e gider, oradan hub'a döner (kurulum ekranına değil) — doğrulanacak olası hata · rol: owner · nasıl: Continue setup for … · mock: eksik: taslak seed'i
- [❌ EKSİK] Telefon görünümü (satır + menü) · rol: owner · nasıl: 390 genişlik · mock: var

## 11.5 Account · Documents — /account/documents (ve /app/account/documents)

B görünümü (main 48f81bc1, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kart: "We couldn't load your workspaces" (belgeler workspace listesinden gelir); boş durum yalnız liste okunduysa. PAGES senaryoları: `loading` (yeni), `load-failed`.

### Parçalar
- Başlık "Documents", "Complete requests and keep track of your documents and agreements." — `account/AccountDocumentsPage.tsx:55-59`.
- Sekmeler "Documents" / "Policies & Agreements" (ok tuşlarıyla) — `AccountDocumentsPage.tsx:60-86`.
- Workspace yüklenemedi "Your workspaces could not be loaded."; hiç yoksa "You are not in a workspace yet." — `AccountDocumentsPage.tsx:87-105`.
- Her aktif workspace için blok: başlık + "N waiting on you" rozeti — `AccountDocumentsPage.tsx:111-155`.
- Liste (`EmployeeDocumentsList`, kişisel mod): erişim kısıtı uyarısı "Workspace access is restricted until…", "Nothing has been asked of you here.", durum sekmeleri All / Needs review / Missing / Expired / Completed (sayılı), Document type süzgeci, tablo (Document + lokasyon, durum), "Loading documents…", hata, boş "No documents yet" / "No documents match these filters." — `documents/EmployeeDocumentsList.tsx:25-31, 116-320`.
- Belge çekmecesi "Document details" (kendi belgesi): politika metni + kutu + "Type your full name" + "Acknowledge policy", "Withdraw acknowledgement", sürüm geçmişi, "Upload a new version" (biçim, hata "could not be uploaded" + Retry/Remove), taslak gönderme, "Discard unsaved changes?" onayı — `documents/DocumentReviewDrawer.tsx:103-121, 540-830, 1010-1012`.
- /app/account/documents → /account/documents?workspace&requirement&kind (bildirim bağlantısı) — `documents/DocumentNotificationRedirect.tsx:4-18`; `App.tsx:265-272`.

### Senaryolar
- [✅ owner] Owner: Documents sekmesi · rol: owner · nasıl: /account/documents · mock: var
- [✅ manager] Manager · rol: manager · nasıl: aynı · mock: var
- [✅ employee] Employee: Harbor belgeleri + "N waiting on you" · rol: employee · nasıl: aynı · mock: var
- [✅ policies] Policies & Agreements sekmesi · rol: employee · nasıl: Policies & Agreements · mock: var
- [❌ EKSİK] Belge çekmecesi (yükleme gereken belge) · rol: employee · nasıl: satıra tıkla · mock: var
- [❌ EKSİK] Politika onayı çekmecede (kutu + ad + Acknowledge policy) · rol: employee · nasıl: Policies sekmesi → satır · mock: var
- [❌ EKSİK] Onay geri alma "Withdraw acknowledgement" · rol: employee · nasıl: onaylı politika · mock: var
- [❌ EKSİK] Yeni sürüm yükleme / yükleme hatası · rol: employee · nasıl: çekmece → dosya · mock: eksik: dosya seçme adımı
- [❌ EKSİK] Durum süzgeci (Missing / Expired / Completed) · rol: employee · nasıl: sekme düğmeleri · mock: var
- [❌ EKSİK] Erişim kısıtı uyarısı ("Workspace access is restricted…") · rol: employee · nasıl: açılış · mock: eksik: engelleyici belge (blocks access) seed'i
- [❌ EKSİK] "Nothing has been asked of you here." · rol: owner · nasıl: açılış · mock: var (owner'a belge yoksa; doğrulanmadı)
- [❌ EKSİK] Birden çok workspace bloğu · rol: owner · nasıl: açılış · mock: var (Saltline boş blok)
- [❌ EKSİK] "You are not in a workspace yet." · rol: herkes · nasıl: açılış · mock: eksik: boş hesap
- [❌ EKSİK] Bildirim bağlantısıyla belirli belge açık gelir · rol: employee · nasıl: /app/account/documents?workspace=…&requirement=…&kind=acknowledgement · mock: var (yönlendirme 11.5 deseninin dışında; yol /account/documents?… verilmeli)
- [❌ EKSİK] Telefon: tablo/çekmece · rol: employee · nasıl: 390 genişlik · mock: var

## 11.6 Account · Inbox — /account/inbox

### Parçalar
- Aynı `NotificationsPage`, hesap modu (yalnız hesap güvenlik bildirimleri; workspace kimliği boş) — `views/NotificationsPage.tsx:42-53`; menüde sekmesi yok (`account/AccountLayout.tsx:24-45`).
- Başlık "UPDATES. ALERTS. ACTIONS." / "Notifications", açıklama "Review account security alerts. N unread." ya da "You're all caught up." — `NotificationsPage.tsx:150-155`.
- Sekmeler "Unread (N)" / "Read (N)", kategori seçici, "N selected", "Mark as read"/"Mark as unread" — `NotificationsPage.tsx:156-212`.
- Tablo: tümünü seç, gün grupları, başlık bağlantısı (hesap bildirimi → /account/security), önizleme, kategori · önem, zaman, "Dismiss" — `NotificationsPage.tsx:219-370`.
- Durumlar: "Loading notifications...", hata, boş "No unread notifications"/"No read notifications", "Load more" — `NotificationsPage.tsx:374-404`.
- Erişim yok kartı — `NotificationsPage.tsx:135-141`.

### Senaryolar
- [✅ owner] Owner: Unread boş, "You're all caught up." · rol: owner · nasıl: /account/inbox · mock: var
- [✅ manager] Manager · rol: manager · nasıl: aynı · mock: var
- [✅ employee] Employee · rol: employee · nasıl: aynı · mock: var
- [❌ EKSİK] Read sekmesi (yeni giriş bildirimi) · rol: herkes · nasıl: Read · mock: var
- [❌ EKSİK] Okunmamış hesap bildirimi (ör. "Password changed") · rol: herkes · nasıl: önce Security'de işlem · mock: var (notifyAccount; aynı sayfada değil) — seed'e okunmamış satır eklemek daha kolay
- [❌ EKSİK] Seçip "Mark as read" / "Dismiss" · rol: herkes · nasıl: kutu → düğme · mock: var (okunmamış satır gerek)
- [❌ EKSİK] Hata ve "Load more" · rol: herkes · nasıl: açılış · mock: eksik: hata dalı / çok sayfa

---

## 12.0 Privacy — /privacy

### Parçalar
- Ortak çerçeve (12.x): üst bar "NEWFORK" (→ /privacy), "Trust pages" menüsü Privacy/Terms/Accessibility/Contact (etkin vurgulu), sağda "Sign in" (oturumsuz) ya da "Open workspace" (oturumlu; context yoksa /account/workspaces) — `public/PublicTrustLayout.tsx:12-43`.
- Alt bilgi: "Newfork", "Restaurant scheduling and team operations.", bağlantılar + "Your privacy choices" — `PublicTrustLayout.tsx:49-62`.
- Belge başlığı (ikon, üst satır, h1, giriş) + "Pre-release" durum kutusu + "Updated {tarih}"; sekme başlığı "{başlık} | Newfork" — `public/PublicTrustPages.tsx:15-60`.
- Bölümler: "Information in the current product", "How the foundation uses information", "Not configured in this rebuild", "Required before production" + "Review current privacy choices" bağlantısı — `PublicTrustPages.tsx:77-153`.

### Senaryolar
- [✅ page] Sayfa (oturumsuz, "Sign in") · rol: oturumsuz · nasıl: /privacy · mock: var
- [❌ EKSİK] Oturumlu başlık bağlantısı "Open workspace" · rol: herkes · nasıl: oturumla /privacy · mock: eksik: public sayfalar yalnız oturumsuz açılıyor
- [❌ EKSİK] Telefon görünümü (üst menü sığma) · rol: oturumsuz · nasıl: 390 genişlik · mock: var

## 12.1 Terms — /terms

### Parçalar
- Ortak çerçeve (12.0).
- Bölümler: "Current status", "Expected use", "Not part of the current service", "Required before commercial launch" — `public/PublicTrustPages.tsx:155-209`.

### Senaryolar
- [✅ page] Sayfa · rol: oturumsuz · nasıl: /terms · mock: var
- [❌ EKSİK] Telefon görünümü · rol: oturumsuz · nasıl: 390 genişlik · mock: var

## 12.2 Accessibility — /accessibility

### Parçalar
- Ortak çerçeve (12.0).
- Bölümler: "Assessment status", "Measures in the current interface", "Known evidence limits", "Report a barrier" + Contact bağlantısı — `public/PublicTrustPages.tsx:211-259`.

### Senaryolar
- [✅ page] Sayfa · rol: oturumsuz · nasıl: /accessibility · mock: var
- [❌ EKSİK] Telefon görünümü · rol: oturumsuz · nasıl: 390 genişlik · mock: var

## 12.3 Contact — /contact

### Parçalar
- Ortak çerçeve (12.0).
- "Public inquiries": destek e-postası ayarlıysa mailto bağlantısı, değilse "A public support email has not been configured…" — `public/PublicTrustPages.tsx:274-293`.
- "Workspace support": "Sign in for workspace support" (→ /sign-in) ya da "Open workspace support" (→ /app/settings/support) — `PublicTrustPages.tsx:295-309`.
- "Before sending information" — `PublicTrustPages.tsx:311-318`.

### Senaryolar
- [✅ page] Sayfa: e-posta ayarsız metni + "Sign in for workspace support" · rol: oturumsuz · nasıl: /contact · mock: var
- [❌ EKSİK] Destek e-postası ayarlı (mailto bağlantısı) · rol: oturumsuz · nasıl: /contact · mock: eksik: VITE_SUPPORT_EMAIL'li yapı
- [❌ EKSİK] Oturumlu "Open workspace support" · rol: herkes · nasıl: oturumla /contact · mock: eksik: oturumlu public açılış

## 12.4 Your privacy choices — /your-privacy-choices

### Parçalar
- Ortak çerçeve (12.0); bu sayfa üst menüde yok, yalnız alt bilgide.
- "Optional tracking status" durum kutusu "Optional tracking is not configured", "Essential browser storage", "Why there is no opt-out switch", "Production rights requests" + Privacy bağlantısı — `public/PublicTrustPages.tsx:321-374`.

### Senaryolar
- [✅ page] Sayfa · rol: oturumsuz · nasıl: /your-privacy-choices · mock: var
- [❌ EKSİK] Telefon görünümü · rol: oturumsuz · nasıl: 390 genişlik · mock: var

---

## Yönlendirmeler (App.tsx)

- yönlendirme: `/invitations/pending`, `/no-organization`, `/organization-switcher` → `/workspaces` — `App.tsx:207-215`. (Hâlâ kullanan: `WelcomeRedirect.tsx:25`, `WorkspaceSetupPending.tsx:37`, `OwnerOnboardingPage.tsx:879`.)
- yönlendirme: `/workspaces/suspended/*`, `/organization-switcher/suspended/*` → `/workspaces/status` — `App.tsx:256-264`.
- yönlendirme: `/app/account/documents` → `/account/documents` (+ workspace, requirement, kind süzülerek) — `App.tsx:265-272`; `documents/DocumentNotificationRedirect.tsx`.
- yönlendirme: `/account` → `/account/profile` — `App.tsx:281`.
- yönlendirme: `/app` → rolün iniş sayfası (`appLandingPath`: çalışan → /app/employee-hub, workspace.read → /app/workspace, schedule.read → /app/schedule, yoksa /workspaces) — `App.tsx:303, 594-597`; `auth/resolveLanding.ts:65-75`.
- yönlendirme: `/app/account/security` → `/account/security` — `App.tsx:459-462`.
- yönlendirme: `/app/settings` → izinli ilk ayar sayfası (`SettingsHomeRedirect`) — `App.tsx:464`.
- yönlendirme: `/app/settings/scheduling/shift-label` → `/app/settings/scheduling/shift-labels` — `App.tsx:529-537`.
- yönlendirme: `/app/settings/important-dates`, `/app/settings/closed-days`, `/app/settings/important-dates/closed-days` → `/app/important-dates` — `App.tsx:538-549`.
- yönlendirme: `*` (bilinmeyen her adres) → `/app` (oturumsuzsa oradan /sign-in) — `App.tsx:585`.
- yönlendirme: `/welcome` (kimliksiz) → bekleyen tek onboarding'e ya da iniş sayfasına — `employees/WelcomeRedirect.tsx` (1.8).
- yönlendirme: korumalı her adres oturumsuzken → `/sign-in` (state.from) — `auth/ProtectedRoute.tsx:25-33`.

---

## Gözlemler (harita dışı, kısa)
- 1.1 `sent`, 1.7 `next`, 1.5 `closed`, 11.1 `delete` senaryoları etiketlerindeki durumu göstermiyor (nedenleri ilgili satırlarda).
- 1.6'nın üç senaryosu da yalnız varsayılan metni gösteriyor; asıl üç bitiş metni (on hold / access removed / closed) için mock verisi hazır, yalnız `/workspaces/status/<id>` yolları eksik.
- Hesap güvenlik bildirimleri (`account_catalog`) API'den geliyor ama 11.3'te hiç gösterilmiyor.
- 11.4'te taslak workspace'in "Continue" düğmesi rolün ana sayfasına gidiyor (`WorkspacesPage.tsx:213-235, 1092-1094`); ProtectedRoute owner'ı oradan hub'a atıyor. Kurulum ekranına gitmesi beklenirdi; çalıştırarak doğrulanmalı.
- `SignInPage` davet akışını yalnız `/invite/accept` hedefinde tanıyor; `/accept-invite` hedefli eski bağlantı "Create your workspace account" moduna düşer (`SignInPage.tsx:207-215`) — pratikte AcceptInvitationPage hep `/invite/accept` adresini taşıdığı için etkisi düşük.

## Sayılar
- Sayfa: mevcut 22 (1.0–1.9, 11.0–11.6, 12.0–12.4) · yeni gereken 2 (Almost ready, That workspace didn't load) · ayrıca 12 yönlendirme satırı.
- Parça: 163
- Senaryo: 266 (✅ 56 / ❌ 210). Mevcut 60 senaryodan 4'ü (1.1 sent, 1.5 closed, 1.7 next, 11.1 delete) etiketindeki durumu göstermiyor, ❌ sayıldı.
- Mock eksiği olan senaryo: 95

---


# Alan: Envanter · alan: calisanlar (2.0, 4.0, 4.1, 4.2, 5.0, 6.0)

Kaynak: `apps/web/src` (main e0763dd5). Dosya yolları `apps/web/src/` köküne göredir. Mock: `apps/web/.temp/pages/mock`.

Genel notlar (her sayfa için geçerli):
- PAGES her senaryoyu masaüstü ve telefon çerçevesinde birlikte açar (`.temp/pages/scenarios.ts` başı). Telefona özel bir parça, o sayfanın mevcut bir senaryosu varsa telefon çerçevesinde görünür; bu yüzden telefon satırları o senaryoya bağlanmıştır.
- Mock'ta hata enjeksiyonu yok: hiçbir uç 500, ağ hatası ya da yavaş cevap veremez (`mock/api.ts:140-169`, sabit 60 ms gecikme `api.ts:183`). "Yükleniyor" ve "sunucu hatası" senaryolarının hepsi bu yüzden mock eksiğidir. Önerilen tek çare: senaryoya `setup` ile açılan bir "şu ucu 500 / 3 sn geciktir" anahtarı (`scenarios.ts` `setups`).
- Mock rolleri yalnız owner / manager (Downtown) / employee; admin ve özel rol (Shift Lead, Kitchen Lead) görüntüleyici olarak seçilemez (`mock/viewer.ts`, `mock/people.ts:623-631`). Admin ve özel rol satırları bu yüzden mock eksiğidir.
- Yetkisiz rol rota kapısında `Navigate` ile kendi açılış sayfasına gider (`auth/PermissionRoute.tsx`, `auth/ActionRoute.tsx`); sayfa çizilmez. Bu satırlar "yönlendirme" olarak yazıldı.
- Toplu işlem (çoklu seçim, toplu arşiv/davet): Employees, Documents, Availability ve Important Dates listelerinin hiçbirinde kodda yok. Haritaya parça olarak girmedi.

---

## 2.0 Workspace — /app/workspace

B görünümü (main 54af9320, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kartlar: "We couldn't load Workspace" (dört kartın gri iskeleti yüklenirken), "We couldn't load the setup checklist" (sayaç ve liste gizlenir). PAGES senaryoları: `loading`, `error`, `checklist-load-error`.

Kapı: `App.tsx:304-313` `PermissionRoute anyOf workspace.read, roles owner/admin/manager`. Bileşen `views/WorkspacePage.tsx`.

### Parçalar
- Sayfa başlığı: eyebrow "TODAY'S WORK. ONE PLACE.", başlık "Workspace", açıklama + selamlama ("Good morning/afternoon/evening, <ad> · <tarih saat>") — `views/WorkspacePage.tsx:150-154`, `674-690`
- Başlık düğmesi "Customize" (Settings2 ikonu) — `views/WorkspacePage.tsx:179-185`
- Özelleştirme modu düğmeleri "Cancel" / "Save layout" ("Saving...") — `views/WorkspacePage.tsx:157-177`
- Düzen kaydetme hata satırı (`role=alert`, requestErrorText) — `views/WorkspacePage.tsx:190-194`
- Kurulum listesi kartı "Setup checklist" (yalnız owner/admin), "<n> of 2 required visits complete" — `views/WorkspacePage.tsx:195-198`, `303-391`
- Kurulum listesi maddeleri: "App tour" (düğme), "Set scheduling preferences", "Employees", "Documents", "First schedule view", "Billing" (bağlantı); "Required visit" / "Optional visit"; tamam işareti — `views/WorkspacePage.tsx:264-301`, `354-387`
- Kurulum listesi hata satırı "Setup checklist progress could not be loaded." / "...could not be saved." — `views/WorkspacePage.tsx:345-351`
- Telefon: kurulum listesinde "First schedule view" maddesi yok — `views/WorkspacePage.tsx:353-354`
- "Every card is hidden. Use Customize to show them again." boş satırı — `views/WorkspacePage.tsx:199-201`
- Kart ızgarası; her kart başlığı (`widgetLabels`) — `views/WorkspacePage.tsx:46-54`, `202-252`
- Özelleştirme kontrolleri her kartta: "Move <kart> up" / "Move <kart> down" / "Hide <kart>" / "Show <kart>"; gizli kart soluk ve `inert` önizleme — `views/WorkspacePage.tsx:212-248`
- Kart "Today": "Scheduled today", "Open today" sayıları — `views/WorkspacePage.tsx:405-418`
- Kart "Pending requests": "Time off", "Shift changes" (exchange hatasında "—"), bağlantı "Review requests" — `views/WorkspacePage.tsx:419-430`, `125`, `648-655`
- Kart "Open shifts": büyük sayı + "unassigned shifts today" + "Open Schedule" (telefonda yok) — `views/WorkspacePage.tsx:431-439`
- Kart "Announcements": en çok 5 duyuru (başlık + kategori General/Operations/Schedule) + "View all announcements"; boş: "No active announcements" — `views/WorkspacePage.tsx:440-459`, `568-575`
- Kart "Notifications": bildirim satırı (bağlantılı/bağlantısız, "<n>m/h/d ago") + "View all notifications"; boş: "You're all caught up" — `views/WorkspacePage.tsx:460-471`, `628-647`
- Kart "Todos": "Add a todo" girişi + "Add" düğmesi; satırlar: bağlantılı (ok işaretli), elle eklenmiş (onay düğmesi "Resolve <başlık>"), sistem (düz); vade "Due in 2h" / "Due 2h ago"; hata "Todo update could not be saved."; boş "No open todos" — `views/WorkspacePage.tsx:492-626`, `695-698`
- Kart "Quick actions": "Open Schedule" (telefonda yok), "View employees", "New announcement" — `views/WorkspacePage.tsx:475-489`
- Durumlar: "Loading Workspace..." (`role=status`), hata cümlesi ya da "Workspace unavailable" (`role=alert`), erişim-yok kartı "You don't have access to this workspace" — `views/WorkspacePage.tsx:107-123`, `667-673`
- Gün sonu kendiliğinden yenileme (lokasyon gece yarısı) ve dakikalık saat — `views/WorkspacePage.tsx:84-104` (görünmez davranış)

### Senaryolar
- [✅ owner] Owner ana görünüm: kurulum listesi (3/6 ziyaret, 2/2 zorunlu), 7 kart dolu · rol: owner · nasıl: /app/workspace · mock: var
- [✅ manager] Müdür görünümü: kurulum listesi yok, Todos'ta yalnız kendi şubesinin 2 maddesi · rol: manager · nasıl: /app/workspace · mock: var
- [✅ customize] Özelleştirme modu: kartlarda yukarı/aşağı/gizle düğmeleri, Cancel / Save layout · rol: owner · nasıl: Customize · mock: var
- [❌ EKSİK] Bir kartı gizle (soluk, tıklanamaz önizleme) · rol: owner · nasıl: Customize → "Hide Todos" · mock: var
- [❌ EKSİK] Kart sırasını değiştir (ilk kartın "up" düğmesi kapalı, sonuncunun "down"ı kapalı) · rol: owner · nasıl: Customize → "Move Today down" · mock: var
- [❌ EKSİK] Düzeni kaydet: modda çıkılır, gizli kart görünmez olur · rol: owner · nasıl: Customize → Hide Todos → Save layout · mock: var
- [❌ EKSİK] Bütün kartlar gizli: "Every card is hidden..." satırı · rol: owner · nasıl: Customize → 7 kartı Hide → Save layout · mock: var
- [❌ EKSİK] Düzen kaydetme hatası (alert satırı) · rol: owner · nasıl: Customize → Save layout · mock: eksik: PUT /workspace/layout için hata dalı (setup ile 400/500)
- [❌ EKSİK] Todo ekle (girdi boşken Add kapalı; ekleyince listede) · rol: owner · nasıl: "Add a todo" alanına yaz → Add · mock: var
- [❌ EKSİK] Elle eklenmiş todo'yu kapat ("Resolve Order to-go containers") · rol: owner · nasıl: Todos kartında onay düğmesi · mock: var
- [❌ EKSİK] Todo kaydetme hatası "Todo update could not be saved." · rol: owner · nasıl: Add / Resolve · mock: eksik: POST /todos hata dalı
- [❌ EKSİK] Vadesi gelecekte olan todo "Due in 2h" · rol: owner · nasıl: /app/workspace · mock: eksik: seed'de ileri tarihli due_at'li todo
- [❌ EKSİK] Boş Todos "No open todos" · rol: owner · nasıl: bütün elle todo'ları kapat (sistem todo'ları kapanmaz) · mock: eksik: todo'suz seed (setup)
- [❌ EKSİK] Boş Announcements "No active announcements" · rol: owner · nasıl: /app/workspace · mock: eksik: aktif duyurusuz setup
- [❌ EKSİK] Boş Notifications "You're all caught up" · rol: owner · nasıl: /app/workspace · mock: eksik: bildirimsiz setup
- [❌ EKSİK] Shift changes sayısı "—" (exchange okuması başarısız) · rol: owner · nasıl: /app/workspace · mock: eksik: GET exchanges hata dalı
- [❌ EKSİK] Kurulum listesi maddesine tıkla → tamamlandı işareti ("App tour" düğmesi sayfada kalır) · rol: owner · nasıl: Setup checklist → App tour · mock: var
- [❌ EKSİK] Kurulum listesi hata satırı (yüklenemedi / kaydedilemedi) · rol: owner · nasıl: /app/workspace · mock: eksik: setup-checklist GET/PATCH hata dalı
- [❌ EKSİK] Kurulum listesi kapalı (closed_at dolu) → kart hiç yok · rol: owner · nasıl: /app/workspace · mock: eksik: closed_at'li setup (10.0 "checklist" senaryosunun verisi bu sayfaya taşınmıyor)
- [❌ EKSİK] Kurulum listesi tamamı bitmiş (6/6, 2/2) · rol: owner · nasıl: /app/workspace · mock: eksik: bütün maddeleri tamam setup
- [✅ owner] Telefon: "Open Schedule" bağlantıları ve "First schedule view" maddesi yok (telefon çerçevesi) · rol: owner · nasıl: /app/workspace · mock: var
- [❌ EKSİK] Yükleniyor "Loading Workspace..." · rol: owner · nasıl: /app/workspace · mock: eksik: gecikme anahtarı
- [❌ EKSİK] Sunucu hatası (tek cümle) · rol: owner · nasıl: /app/workspace · mock: eksik: GET /workspace 500 dalı
- [✅ no-access] Erişim-yok kartı "You don't have access to this workspace" (API 403) · rol: özel (workspace.manage'siz) · nasıl: /app/workspace · mock: eksik: izinsiz özel rol görüntüleyicisi
- [❌ EKSİK] Admin görünümü (kurulum listesi var) · rol: admin · nasıl: /app/workspace · mock: eksik: admin görüntüleyici
- [❌ EKSİK] Çalışan bu adresi açarsa kendi ana sayfasına yönlendirilir · rol: employee · nasıl: /app/workspace · mock: var (rota kapısı; sayfa 2.0'ın rol listesinde employee yok)

---

## 4.0 Employees — /app/employees

B görünümü (main 68ef63e6, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kartlar: "We couldn't load employees" (liste), çekmecede kayıt, lokasyon/job/rol listeleri, profil fotoğrafı ve belge etkisi önizlemesi için ayrı kartlar; çekmece yenilemesi düşerse son seçenekler ve son fotoğraf kalır. PAGES senaryoları: `list-loading`, `list-error`, `detail-loading`, `detail-error`, `references-error`, `photo-unavailable`, `doc-impact-error`.

Kapı: `App.tsx:411-418` `PermissionRoute anyOf employees.read`. Liste `employees/EmployeesPage.tsx`, çekmece `employees/EmployeeDrawer.tsx`. Adres parametreleri: `status`, `location`, `q`, `employeeId`, `mode=create`, `section` (`profile|employment|availability|documents|access|history`; geçersiz ya da izinsiz değer Profile'a düşer — `EmployeeDrawer.tsx:239-265`).

### Parçalar — liste
- Sayfa başlığı: eyebrow "YOUR TEAM. CONNECTED AND READY.", "Employees", açıklama — `employees/EmployeesPage.tsx:266-271`
- Durum sekmeleri "All", "Invited", "Onboarding", "Needs Attention", "Active" + "Archived" (arşive gider) — `employees/EmployeesPage.tsx:275-319`
- Sütun ayarı düğmesi "Table column settings" ve açılır kutu "Employee table columns": "Columns · n of 7 visible", sütun onay kutuları (Employee kapalı/zorunlu), "Move <sütun> left/right", "Show all", "Reset"; Escape ve dışarı tıklama kapatır; tercih tarayıcıda saklanır — `employees/EmployeesPage.tsx:320-328`, `513-640`, `765-798`
- Lokasyon süzgeci "Filter employees by location": "All locations", lokasyonlar, "No location" — `employees/EmployeesPage.tsx:331-352`
- Arama "Search name, location, or job" — `employees/EmployeesPage.tsx:353-363`
- "Add employee" düğmesi (yalnız `employee.create` izni olana, arşivde yok) — `employees/EmployeesPage.tsx:364-377`
- Tablo: sıralanabilir başlıklar (Employee, Status, Primary location, Primary job, Access, Start date, Invite email) — `employees/EmployeesPage.tsx:382-418`
- Satır (tıklanır, Enter/Space ile açılır) — `employees/EmployeesPage.tsx:420-446`
- Hücreler: avatar harfi + ad + kod; durum çipi (Not Invited/Invited/Onboarding/Needs Attention/Active); lokasyon (ilk + "+n" ya da "No location" çipi, tıklayınca Employment açılır); job ("Unassigned", "+n", tıklayınca Employment); Access ("No app access"); başlama tarihi ("Not set"); davet e-postası ("No invite email") — `employees/EmployeesPage.tsx:642-725`, `employees/EmployeeLocationParts.tsx:105-120`
- Telefon: ad altında "No location" çipi — `employees/EmployeeLocationParts.tsx:123-130`, `employee-location-parts.css:80-91`
- Durumlar: "Loading employees...", hata cümlesi (sunucu mesajı ya da "Employees unavailable"), boş "No matching employees" / "No employees yet" — `employees/EmployeesPage.tsx:450-483`
- Erişim-yok kartı "You don't have access to employees" — `employees/EmployeesPage.tsx:257-263`
- Sayfalama "Rows per page" 25/50/100, "Previous page", "Page n", "Next page" (25'ten az kayıtta yok) — `views/ListPagination.tsx:4-6`, `40-93`

### Parçalar — çalışan çekmecesi (var olan kayıt)
- Katman + arka plan "Close employee details"; Escape kapatır (kaydedilmemiş taslak sorulmadan atılır), Tab çekmecede kalır, Enter Profile/Employment'ta kaydeder — `employees/EmployeeDrawer.tsx:410-421`, `847-852`, `1025-1072`
- Sol ray: avatar harfi, ad, kod ("Code assigned on save"), durum çipi, iş durumu rozetleri "Off schedule" / "Remote" — `employees/EmployeeDrawer.tsx:1088-1130`
- Bölüm bağlantıları Profile, Employment, Availability, Documents, Access, History (Availability `availability.team_read`, Documents `documents.read`, Access sunucunun `allowed` bayraklarıyla görünür) — `employees/EmployeeDrawer.tsx:108-115`, `239-256`, `1131-1158`
- Telefon: ray ve bölüm başlığı gizli; üstte "Employee section" seçimi + kapat — `employees/EmployeeDrawer.tsx:1163-1212`, `styles.css:2730-2746`
- Bölüm başlığı (h2) + kapat "Close employee details" — `employees/EmployeeDrawer.tsx:1213-1234`
- Durumlar: "Loading employee...", erişim-yok kartı "You don't have access to this employee" (çekmece içinde, ray yok), "Couldn't reload this employee. Retry" (önünde "Role saved." olabilir), sunucu hata cümlesi — `employees/EmployeeDrawer.tsx:1240-1262`
- "Loading locations, jobs and roles..." ve "Couldn't load locations, jobs or roles. Retry" — `employees/EmployeeDrawer.tsx:1323-1341`
- Profile › Identity: "First name", "Middle name" (optional), "Last name"; aktifken kilitli ("Locked after activation"), davet bekliyorken salt-okur ("Locked while invitation is pending"); "Preferred name" (salt-okur, varsa); "Date of birth" (özel bilgi okuyabilene) — `employees/EmployeeDrawer.tsx:2300-2348`
- Profile › bekleyen tercih edilen ad satırı: "Asked to be called <ad> here." + "Use it" / "Leave it" + hata — `employees/EmployeeDrawer.tsx:2349-2354`, `3773-3837`
- Profile › Contact: "E-mail" (Verified / Invitation pending işareti, bağlı hesapta salt-okur), "Phone", "Emergency contact", "Relationship", "Emergency phone", "Emergency e-mail" (salt-okur) — `employees/EmployeeDrawer.tsx:2358-2412`
- Profile › owner'ın kendi kaydında acil durum kişisi düzenlenebilir: "Emergency contact", "Relationship", "Emergency phone" (+1 maskesi; kendi numarası ise "This is your own number. Enter someone else's.") — `employees/EmployeeDrawer.tsx:321-354`, `3730-3762`
- Profile › Address: "Street address", "City", "State", "ZIP code", "Country" (özel bilgi okuyabilene; boşsa "Not provided") — `employees/EmployeeDrawer.tsx:2414-2437`, `3159-3181`
- Profile › "Legal name review" paneli: durum çipi, "<n> of <m> complete", madde "Legal name and contact details" durumu, ret notu, "Request changes" / "Accept", "Activate employee access", "No requirements in this section.", "Loading onboarding..." — `employees/EmployeeDrawer.tsx:2087-2229`, `2439-2451`
- "Request changes to <madde>?" penceresi (ConfirmDialog): "What should the employee correct?" metin alanı, not boşken onay kapalı — `employees/EmployeeDrawer.tsx:2204-2226`
- Onboarding çakışma uyarısı "This onboarding changed meanwhile. You're seeing the latest version." — `employees/EmployeeDrawer.tsx:773-784`
- Alan doğrulama satırları: "<alan> is required.", "Enter a valid email address.", "English letters only.", "Enter a 10-digit US phone number." — `employees/EmployeeDrawer.tsx:3217-3339`
- Employment: "Remote", "Exclude from schedule" geçişleri — `employees/EmployeeDrawer.tsx:2494-2529`
- Employment › "Locations" seçici: "Required", >8 seçenekte "Search locations", onay kutuları, "Primary" seçimi, "Archived" etiketi, "No active locations." / "No matching locations." / "Select at least one location."; owner'da hepsi kilitli ("The workspace owner works at every location.") — `employees/EmployeeDrawer.tsx:2530-2564`, `3345-3500`
- Employment › lokasyon satırında "Remove" (iki tık "Confirm remove", "Remove from <lokasyon>") — `employees/EmployeeLocationParts.tsx:25-50`, `EmployeeDrawer.tsx:2553-2563`
- Employment › müdüre not "Only an admin or the owner can terminate an employee. To take <ad> off <lokasyon>, use Remove." — `employees/EmployeeLocationParts.tsx:77-94`, `EmployeeDrawer.tsx:2565-2567`
- Employment › "Jobs" seçici: departman başlıkları (Management sonda, "No department"), Owner job kilitli ("Only the workspace owner holds the Owner job.") — `employees/EmployeeDrawer.tsx:2568-2589`, `3507-3530`
- Employment › "Start date", "Internal note" — `employees/EmployeeDrawer.tsx:2590-2612`
- "Document assignment impact" paneli: "Checking document requirements…", hata + "Retry document preview", madde listesi ("new request" / "request closes" / "request reopens"), "No document requirements will change.", "These changes apply when you save the employee." — `documents/EmployeeAssignmentDocumentPreview.tsx:36-74`, `employees/EmployeeDrawer.tsx:289-307`, `1320-1322`
- Availability bölümü (müdür görünümü haftalık tercih formu; ayrıntısı 5.0'da) — `employees/EmployeeDrawer.tsx:1959-1970`, `2047-2052`
- Documents bölümü: kişinin belge listesi (4.1 listesinin aynısı, kişiye süzülü, belge + onay türleri birlikte) ve belge çekmecesi — `documents/EmployeeDocumentPanel.tsx`, `EmployeeDrawer.tsx:2053-2058`
- Access › "Account access" durum kutusu, 12 durum: "No email" (+ "Add email"), "Ready to invite", "Invitation sent", "Invitation delivery failed" (+ "Retry"/"Retrying"), "Invitation expired", "Invitation revoked", "Invitation declined", "Access removed", "Archived", "Onboarding in progress", "Onboarded and linked" — `employees/EmployeeDrawer.tsx:2681-2807`
- Access › bağlı hesapta "Workspace role" seçimi (owner'da kapalı, "Owner access is managed separately."; tek seçenekte kapalı) + "Remove access" (iki tık "Confirm remove access") — `employees/EmployeeDrawer.tsx:2809-2858`, `3045-3053`
- Access › bağlı olmayanda ayrıntı listesi: E-mail, Invite role, Invitation status, Invited by, Expires, Last delivery attempt — `employees/EmployeeDrawer.tsx:2859-2896`
- Access › bekleyen davet düğmeleri: "Send reminder"/"Sending", "Copy link" ("Copying", "Link copied", "Copy failed"), "Revoke invitation" (iki tık "Confirm revoke") — `employees/EmployeeDrawer.tsx:2898-2922`, `3565-3606`
- Access › "Profile photo": fotoğraf ya da yer tutucu, "Profile photo removal", "Remove photo" (iki tık "Confirm remove"; fotoğraf yoksa kapalı), "Loading profile photo...", "Profile photo unavailable" + "Retry" — `employees/EmployeeDrawer.tsx:2925-3031`
- History: olay listesi (özet + tarih) ya da "No history yet / Lifecycle changes will appear here." — `employees/EmployeeDrawer.tsx:3100-3122`
- Alt çubuk: "Terminate employee" / "Restore employee"; kapalı "Terminate employee" (kilit, ipucu "Only an admin or the owner can terminate an employee." ya da "Save your changes before terminating the employee") — `employees/EmployeeDrawer.tsx:1522-1555`, `employees/EmployeeLocationParts.tsx:57-74`
- Alt çubuk: "Invite role" seçimi ("Select a role" / "No assignable roles", "The selected role is applied when the invite is accepted.", yanlış denemede titreme) — `employees/EmployeeDrawer.tsx:1556-1572`, `3055-3098`
- Alt çubuk: "Cancel" / "Close" (salt-okurda), "Invite" / "Resend" (ipucu "Choose a role before sending the invitation" / "Create a new link and invalidate the current invitation"), "Save changes" / "Saving" / "Done" — `employees/EmployeeDrawer.tsx:1573-1647`
- Bildirim satırları: "Employee terminated. <n> published shift(s) released.", hata satırı, atama engeli satırı (`role=status`), "Someone else saved this employee meanwhile. Save again to apply your changes.", ekran okuyucuya "Role saved." — `employees/EmployeeDrawer.tsx:557-581`, `1383-1423`, `1651-1654`
- Geliştirme davet bağlantısı "Development invitation prepared. Open acceptance link" (yalnız sunucu developmentUrl verirse) — `employees/EmployeeDrawer.tsx:1377-1382`
- Lokasyondan çıkarınca erişim bitti ise çekmece kapanır, toast "Removed from <lokasyon>" — `employees/EmployeeDrawer.tsx:707-736`

### Parçalar — "Terminate employee" penceresi
- Pencere başlığı "Terminate employee" + kişi adı + kapat "Close termination dialog"; Tab pencerede kalır — `employees/EmployeeDrawer.tsx:1776-1822`
- "Effective date and time" (gelecek yasak), "Worksite timezone" (kişinin lokasyonlarının saat dilimleri; lokasyonu yoksa workspace'in), "Reason" (en az 3, en çok 240) — `employees/EmployeeDrawer.tsx:1823-1888`
- Alan hataları "Enter the effective date and time." / "The effective time can't be in the future." / "Enter a reason of at least 3 characters." — `employees/EmployeeDrawer.tsx:1744-1760`
- Uyarı metni "Access will be suspended. Published shifts that haven't started yet will become open..." — `employees/EmployeeDrawer.tsx:1889-1894`
- "An active employee location with a timezone is required." ve sunucu hata satırı — `employees/EmployeeDrawer.tsx:1895-1904`
- "Cancel" + kırmızı iki tık "Terminate" → "Confirm termination" → "Terminating" — `employees/EmployeeDrawer.tsx:1905-1936`

### Parçalar — "Add employee" (yeni çalışan) akışı
- Çekmece "New employee", adımlar Profile → Employment (rayda ve telefonda "Create employee steps"); Employment ad girilmeden kapalı — `employees/EmployeeDrawer.tsx:257-265`, `1097-1100`, `1131-1186`
- Profile adımı: "First name" (Required), "Middle name" (optional), "Last name" (Required), "E-mail" — `employees/EmployeeDrawer.tsx:2300-2377`
- Employment adımı: "Work mode" başlığı + aynı alanlar (Locations/Jobs Required kuralı Remote/Exclude'a göre) — `employees/EmployeeDrawer.tsx:2491-2493`
- Davet özeti kartı: e-posta + rol adı ya da "Choose an invite role" + kalem "Edit invitation"; "Enter a valid email address in Profile." — `employees/EmployeeDrawer.tsx:1342-1372`
- Alt çubuk: "Invite role", "Cancel" / "Back", "Invite" / "Inviting...", "Next" / "Save" / "Saving..." — `employees/EmployeeDrawer.tsx:1439-1521`
- Sonuç satırları: "Employee saved." / "Employee saved. Invitation sent." / "...Invitation couldn't be sent." / "...Invitation delivery is pending." + "Retry invitation" — `employees/EmployeeDrawer.tsx:1388-1411`
- Belirsiz istek: "Check the previous request before continuing." + "Retry request" (bölüm düğmeleri kapanır) — `employees/EmployeeDrawer.tsx:460-488`, `1424-1438`
- İstek yoldayken gezinme kilidi (geri tuşu ve sayfa bağlantıları tutulur) — `employees/EmployeeDrawer.tsx:892-944`
- Müdür sınıfı rolle davet ve lokasyon yok: `managerLocationRefusal` cümlesi — `employees/EmployeeDrawer.tsx:959-966`

### Senaryolar — liste
- [✅ owner] Owner listesi, All sekmesi, bütün lokasyonlar · rol: owner · nasıl: /app/employees · mock: var
- [✅ manager] Müdür listesi: yalnız Downtown kişileri · rol: manager · nasıl: /app/employees · mock: var
- [✅ invited] "Invited" sekmesi (Hannah, Kevin) · rol: owner · nasıl: Invited · mock: var
- [✅ attention] "Needs Attention" sekmesi (Ryan) · rol: owner · nasıl: Needs Attention · mock: var
- [❌ EKSİK] "Onboarding" sekmesi (Jasmine) · rol: owner · nasıl: Onboarding · mock: var
- [❌ EKSİK] "Active" sekmesi · rol: owner · nasıl: Active · mock: var
- [❌ EKSİK] Durum çipi "Not Invited" (Diego) ve Access sütununda "No app access" · rol: owner · nasıl: /app/employees (All) · mock: var
- [✅ uptown] Lokasyon süzgeci Uptown (ikinci lokasyon ve owner dahil) · rol: owner · nasıl: /app/employees?location=…102 · mock: var
- [❌ EKSİK] Lokasyon süzgeci "No location" ve listede "No location" çipi · rol: owner · nasıl: süzgeç → No location · mock: eksik: lokasyonsuz (Remote ya da Exclude from schedule) bir kişi seed'i
- [❌ EKSİK] Arama (ad/lokasyon/job) ve "No matching employees" boşu · rol: owner · nasıl: aramaya "zzz" yaz · mock: var
- [❌ EKSİK] Boş sekme süzgeç sayılır: ör. müdürde Needs Attention boş → "No matching employees" · rol: manager · nasıl: Needs Attention · mock: var
- [❌ EKSİK] "No employees yet" (hiç kayıt yok) · rol: owner · nasıl: /app/employees · mock: eksik: boş dizin setup'ı
- [❌ EKSİK] Sütun ayarı açık (7 sütun, Employee kilitli, Show all, Reset) · rol: owner · nasıl: "Table column settings" · mock: var
- [❌ EKSİK] "Invite email" sütunu açılmış ve sütun sırası değişmiş · rol: owner · nasıl: Table column settings → Invite email işaretle → "Move Invite email left" · mock: var
- [❌ EKSİK] Sütuna göre sıralama (artan/azalan) · rol: owner · nasıl: "Start date" başlığı iki kez · mock: var
- [❌ EKSİK] Satırda lokasyon/job hücresine tıklayınca Employment bölümü açılır · rol: owner · nasıl: Maria'nın "Primary job" hücresi · mock: var
- [❌ EKSİK] Sayfalama (25'ten fazla kayıt, Rows per page 25) · rol: owner · nasıl: Rows per page → 25 · mock: eksik: 26+ kişilik dizin (bugün ~24 kişi; seçim 25 olunca da sayfa tek)
- [❌ EKSİK] "Loading employees..." · rol: owner · nasıl: /app/employees · mock: eksik: gecikme anahtarı
- [❌ EKSİK] Liste hatası (sunucu cümlesi) · rol: owner · nasıl: /app/employees · mock: eksik: GET /employees 500 dalı
- [✅ list-no-access] Erişim-yok kartı "You don't have access to employees" (API 403) · rol: özel · nasıl: /app/employees · mock: eksik: employees.read'i olup listesi reddedilen görüntüleyici
- [❌ EKSİK] "Add employee" düğmesi olmayan okuyucu (employee.create yok) · rol: özel · nasıl: /app/employees · mock: eksik: employees.manage'siz özel rol
- [✅ owner] Telefon: lokasyon sütunu yerine ad altında çip, araç çubuğu iki satır (telefon çerçevesi) · rol: owner · nasıl: /app/employees · mock: var (çip için lokasyonsuz kişi eksik)
- [❌ EKSİK] Çalışan bu adresi açarsa yönlendirilir · rol: employee · nasıl: /app/employees · mock: var (rota kapısı)
- [❌ EKSİK] Admin listesi · rol: admin · nasıl: /app/employees · mock: eksik: admin görüntüleyici

### Senaryolar — çekmece: Profile
- [✅ drawer] Aktif çalışan Profile: ad alanları kilitli, Verified e-posta, telefon, acil durum, adres, doğum tarihi · rol: owner · nasıl: ?employeeId=…601&section=profile · mock: var
- [❌ EKSİK] Müdür Profile'ı: özel bilgiler (Phone, Emergency, Address, Date of birth) yok · rol: manager · nasıl: ?employeeId=…601&section=profile · mock: var
- [❌ EKSİK] Davet bekleyen kişi Profile: adlar salt-okur ("Locked while invitation is pending"), e-postada "Invitation pending" işareti · rol: owner · nasıl: ?employeeId=…6e1&section=profile · mock: var
- [❌ EKSİK] Hesabı olmayan kişi (Diego): adlar ve e-posta düzenlenebilir, e-posta boş · rol: owner · nasıl: ?employeeId=…6e7&section=profile · mock: var
- [❌ EKSİK] Bekleyen tercih edilen ad "Asked to be called Liv here." · rol: owner · nasıl: Olivia Chen satırı → Profile · mock: var
- [❌ EKSİK] "Use it" sonrası Preferred name alanı ve listede yeni ad · rol: owner · nasıl: Olivia → Use it · mock: var
- [❌ EKSİK] "Leave it" sonrası satır kaybolur · rol: owner · nasıl: Tom Becker → Leave it · mock: var
- [❌ EKSİK] Tercih edilen ad kararı hatası (zaten cevaplanmış) · rol: owner · nasıl: Use it · mock: eksik: istek ortadan kalkmış setup (404 employee.preferred_name.not_pending)
- [❌ EKSİK] Onaylı tercih edilen ad salt-okur alan ("Soph") · rol: owner · nasıl: Sophie satırı · mock: var
- [❌ EKSİK] Owner'ın kendi kaydı: acil durum kişisi düzenlenebilir (optional) · rol: owner · nasıl: Mert Tepebas satırı · mock: var
- [❌ EKSİK] Owner kendi acil durum numarasını girer → "This is your own number..." ve Save kapalı · rol: owner · nasıl: Mert → Emergency phone'a kendi numarası · mock: var
- [❌ EKSİK] Yarım acil durum kişisi (ad var numara yok) → alanlar Required, Save kapalı · rol: owner · nasıl: Mert → Emergency contact yaz · mock: var
- [❌ EKSİK] Acil durum kişisi kaydı hatası "Emergency contact could not be saved" · rol: owner · nasıl: Mert → kaydet · mock: eksik: PUT emergency-contact hata dalı
- [❌ EKSİK] Ad alanında Türkçe harf → "English letters only." · rol: owner · nasıl: Diego → First name "Çağrı" · mock: var
- [❌ EKSİK] Geçersiz e-posta → "Enter a valid email address." · rol: owner · nasıl: Diego → E-mail "abc" → alandan çık · mock: var
- [❌ EKSİK] "Legal name review" bekleyen (Ryan): Request changes / Accept · rol: owner · nasıl: ?employeeId=…6e4&section=profile · mock: var
- [❌ EKSİK] "Request changes" penceresi: not boşken onay kapalı · rol: owner · nasıl: Ryan → Request changes · mock: var
- [❌ EKSİK] Değişiklik istendi sonrası ret notu ve "changes requested" çipi · rol: owner · nasıl: Ryan → Request changes → not → Request changes · mock: var
- [❌ EKSİK] Ad onaylandı (Accept) sonrası madde "completed" · rol: owner · nasıl: Ryan → Accept · mock: var
- [❌ EKSİK] "Activate employee access" görünür (bütün engelleyen maddeler tamam) · rol: owner · nasıl: Ryan → Documents'ta belgeleri onayla → Profile → Accept · mock: var (çok adım)
- [❌ EKSİK] Onboarding sürüyor (Jasmine): panel düğmesiz, "in progress" · rol: owner · nasıl: ?employeeId=…6e3&section=profile · mock: var
- [❌ EKSİK] Onboarding çakışması "This onboarding changed meanwhile..." · rol: owner · nasıl: Ryan → Accept · mock: eksik: açılıştan sonra onboarding revizyonunu artıran setup (ayrıca mock 409'u `onboarding.changed` reason'ı olmadan döner, `employees-service.ts:749`)
- [❌ EKSİK] Müdür adı onaylayamaz: düğmeler kapalı (canDecideLegalName yok) · rol: manager · nasıl: Downtown'da onay bekleyen kişi · mock: eksik: Downtown'da submitted onboarding'li kişi (Ryan Uptown'da) ve müdür özel bilgiyi okumadığı için panel hiç çıkmaz
- [❌ EKSİK] Onboarding yükleniyor "Loading onboarding..." · rol: owner · nasıl: Ryan → Profile · mock: eksik: gecikme anahtarı
- Not: "Onboarding not started" özet paneli (`EmployeeDrawer.tsx:2117-2124`) panel yalnız onboarding maddesi varken çizildiği için ulaşılamaz; senaryo yazılmadı.

### Senaryolar — çekmece: Employment
- [❌ EKSİK] Aktif çalışan Employment (Locations, Jobs departmanlı, Start date, Internal note) · rol: owner · nasıl: Maria → Employment · mock: var
- [❌ EKSİK] Owner kaydında lokasyonlar kilitli, Owner job kilitli, Primary yok · rol: owner · nasıl: Mert → Employment · mock: var
- [❌ EKSİK] Remote açılınca Locations/Jobs "Required" kalkar, rayda "Remote" rozeti · rol: owner · nasıl: Maria → Employment → Remote · mock: var
- [❌ EKSİK] "Off schedule" rozeti olan kayıt (Rachel Adams) · rol: owner · nasıl: Rachel satırı · mock: var
- [❌ EKSİK] Son lokasyonu kaldır → "Choose at least one location..." satırı, Save kapalı · rol: owner · nasıl: Diego → Employment → Uptown işaretini kaldır · mock: var
- [❌ EKSİK] Primary job seçilmemiş → atama engeli satırı · rol: owner · nasıl: job ekle/çıkar · mock: var
- [❌ EKSİK] Bağlı kişide lokasyon/job değişince "Document assignment impact" listesi · rol: owner · nasıl: Maria → Employment → Uptown ekle · mock: var
- [❌ EKSİK] Belge etkisi yükleniyor / hata + "Retry document preview" (Save kapalı) · rol: owner · nasıl: Maria → Employment → lokasyon ekle · mock: eksik: assignment-preview hata/gecikme dalı
- [❌ EKSİK] "No document requirements will change." · rol: owner · nasıl: Maria → bir job ekle (belgesiz) · mock: var (veriye bağlı)
- [❌ EKSİK] Kaydet → "Save changes" "Saving" → "Done", History'de değişiklik satırı · rol: owner · nasıl: Maria → Internal note yaz → Save changes · mock: var
- [❌ EKSİK] Revizyon çakışması "Someone else saved this employee meanwhile..." · rol: owner · nasıl: Maria → değiştir → Save changes · mock: eksik: açılıştan sonra kişinin revizyonunu artıran setup (mock 409 employee.revision_conflict'i destekliyor)
- [❌ EKSİK] Kaydetme reddi (sunucu cümlesi, ör. lokasyon/job kuralı) · rol: owner · nasıl: Save changes · mock: var (validate dalları), senaryo yok
- [❌ EKSİK] Müdür Employment: lokasyon satırında "Remove", altta "Only an admin or the owner can terminate..." notu · rol: manager · nasıl: Maria (ya da Downtown kişi) → Employment · mock: var
- [❌ EKSİK] "Remove" iki tık ("Confirm remove from Harbor & Vine Downtown") · rol: manager · nasıl: Remove → Confirm remove · mock: var
- [❌ EKSİK] Tek lokasyonundan çıkarılan kişi: çekmece kapanır, toast "Removed from …" · rol: manager · nasıl: yalnız Downtown'daki kişi → Remove → Confirm · mock: var
- [❌ EKSİK] Müdür sınıfı kaydın son lokasyonu kaldırılamaz (manager_location_required) · rol: owner · nasıl: Rachel → Employment → Downtown kaldır → Save changes · mock: var
- [❌ EKSİK] Lokasyon/job çekmece açıkken silindi: cümle + listeler yenilenir · rol: owner · nasıl: Save changes · mock: eksik: kayıt sırasında "gone meanwhile" cevabı
- [❌ EKSİK] "Couldn't load locations, jobs or roles. Retry" · rol: owner · nasıl: Maria → Employment · mock: eksik: reference-data hata dalı
- [❌ EKSİK] 8'den fazla lokasyonda "Search locations" kutusu · rol: owner · nasıl: Employment · mock: eksik: 9+ lokasyonlu dünya

### Senaryolar — çekmece: Availability ve Documents
- [❌ EKSİK] Çekmecede Availability bölümü (müdür formu, Employee availability / Manager reminders) · rol: owner · nasıl: Maria → Availability · mock: var
- [✅ drawer-availability-none] Dizinde olup haftalık kaydı olmayan kişi (Hannah, Diego) → "You don't have access to this availability." · rol: owner · nasıl: Hannah → Availability · mock: var (mock bu kişileri tanımıyor; gerçek API davranışıyla aynı olup olmadığı belirsiz)
- [❌ EKSİK] Çekmecede Documents bölümü (belge + onay satırları, durum sekmeleri) · rol: owner · nasıl: Maria → Documents · mock: var
- [❌ EKSİK] Documents bölümü boş "No documents yet / Documents they submit show up here." · rol: owner · nasıl: Diego → Documents · mock: var (hesabı olmayanın belgesi yok varsayımı)
- [❌ EKSİK] Müdürde Documents bölümü yok (documents.read yok); `section=documents` Profile'a düşer · rol: manager · nasıl: ?employeeId=…601&section=documents · mock: var

### Senaryolar — çekmece: Access
- [✅ reminder] Davet gönderilmiş (Hannah): "Invitation sent", Send reminder, Copy link, Revoke invitation; altta Resend + kapalı Invite role · rol: owner · nasıl: ?employeeId=…6e1&section=access · mock: var
- [✅ manager-invite] Müdür, sahibin daveti teslim edilemeyen kişiyi görür (Kevin): "Invitation delivery failed" + Retry + bekleyen davet düğmeleri · rol: manager · nasıl: ?employeeId=…6e2&section=access · mock: var
- [❌ EKSİK] Owner'ın gözüyle teslim hatası (Kevin) · rol: owner · nasıl: ?employeeId=…6e2&section=access · mock: var
- [❌ EKSİK] "Send reminder" → "Sending" sonra aynı durum · rol: owner · nasıl: Hannah → Access → Send reminder · mock: var
- [❌ EKSİK] "Retry" (teslim hatası) → durum "Invitation sent" · rol: owner · nasıl: Kevin → Access → Retry · mock: var
- [❌ EKSİK] "Copy link" → "Link copied" · rol: owner · nasıl: Hannah → Access → Copy link · mock: var (pano izni tarayıcıya bağlı)
- [❌ EKSİK] "Copy failed" (bağlantı alınamadı ya da pano reddi) · rol: owner · nasıl: Copy link · mock: eksik: invitations/link hata dalı
- [❌ EKSİK] "Revoke invitation" iki tık → "Invitation revoked" · rol: owner · nasıl: Hannah → Revoke invitation → Confirm revoke · mock: var
- [❌ EKSİK] E-postasız kişi (Diego): "No email" + "Add email" (Profile'a döner, e-postaya odak) · rol: owner · nasıl: ?employeeId=…6e7&section=access → Add email · mock: var
- [❌ EKSİK] "Ready to invite": e-posta yazılmış, rol seçilmemiş ("Choose a role") · rol: owner · nasıl: Diego → Profile → e-posta yaz → Access · mock: var
- [❌ EKSİK] Rol seçmeden Invite → Invite role titrer, ipucu "Choose a role before sending the invitation" · rol: owner · nasıl: Diego → e-posta → Invite · mock: var
- [❌ EKSİK] Davet gönder (Invite): önce kaydeder, sonra "Invitation sent" · rol: owner · nasıl: Diego → e-posta → Invite role "Employee" → Invite · mock: var
- [❌ EKSİK] "Resend": eski bağlantı geçersiz, yeni davet · rol: owner · nasıl: Hannah → Resend · mock: var
- [❌ EKSİK] Davet reddi "employee requires a location before invitation" · rol: owner · nasıl: lokasyonsuz kişiye Invite · mock: var (lokasyonsuz kişi seed'i yok)
- [❌ EKSİK] "Invitation expired" + Resend · rol: owner · nasıl: Access · mock: eksik: süresi geçmiş pending davetli kişi seed'i
- [❌ EKSİK] "Invitation declined" · rol: owner · nasıl: Access · mock: eksik: declined davetli kişi seed'i
- [❌ EKSİK] "Onboarding in progress" (Jasmine) · rol: owner · nasıl: ?employeeId=…6e3&section=access · mock: var
- [❌ EKSİK] "Onboarded and linked" + Workspace role seçimi + Remove access · rol: owner · nasıl: ?employeeId=…601&section=access · mock: var
- [❌ EKSİK] Rol değiştir: "Workspace role" → Shift Lead → Save changes; Access'te kalır, "Role saved." · rol: owner · nasıl: Maria → Access → rol seç → Save changes · mock: var
- [❌ EKSİK] Rol değiştirme reddi (müdür sınıfı rol, lokasyonsuz) · rol: owner · nasıl: Save changes · mock: var (lokasyonsuz kişi yok)
- [❌ EKSİK] Kaydedilen rol sonrası yeniden okuma hatası "Role saved. Couldn't reload this employee. Retry" · rol: owner · nasıl: Save changes · mock: eksik: kayıttan sonra GET detail 500
- [❌ EKSİK] Owner kaydında rol seçimi kapalı ("Owner access is managed separately.") · rol: owner · nasıl: Mert → Access · mock: var
- [❌ EKSİK] Müdürün rol listesi: yalnız Employee; tek seçenek kendi rolüyse kapalı · rol: manager · nasıl: Maria → Access · mock: var
- [❌ EKSİK] "Remove access" iki tık → "Access removed" · rol: owner · nasıl: Maria → Access → Remove access → Confirm remove access · mock: var
- [❌ EKSİK] Profil fotoğrafı olan kişi + "Remove photo" iki tık · rol: owner · nasıl: Aisha Johnson → Access → Remove photo → Confirm remove · mock: var
- [❌ EKSİK] Fotoğrafsız kişide "Remove photo" kapalı ("There is no workspace photo to remove.") · rol: owner · nasıl: Maria → Access · mock: var
- [❌ EKSİK] "Profile photo unavailable" + Retry · rol: owner · nasıl: Access · mock: eksik: avatar GET hata dalı
- [❌ EKSİK] Fotoğraf kaldırma hatası (satır içi alert) · rol: owner · nasıl: Remove photo · mock: eksik: avatar DELETE hata dalı
- [❌ EKSİK] Erişim izni olmayan müdürde Access bölümü yok (allowed bayrakları yok, davet yok) · rol: manager · nasıl: Downtown'da aktif kişi → bölüm listesi · mock: var

### Senaryolar — çekmece: History, alt çubuk, durumlar
- [❌ EKSİK] History dolu (rol değişikliği, onboarding, davet olayları) · rol: owner · nasıl: Carlos Rivera → History · mock: var
- [❌ EKSİK] "No history yet" · rol: owner · nasıl: History · mock: eksik: olaysız kişi (her seed kişide en az bir olay var)
- [❌ EKSİK] Taslak varken "Terminate employee" kilitli ("Save your changes before terminating the employee") · rol: owner · nasıl: Maria → Internal note yaz → alt çubuk · mock: var
- [❌ EKSİK] Müdürde kilitli "Terminate employee" ve ipucu baloncuğu · rol: manager · nasıl: Downtown kişi → Terminate employee üzerine gel/dokun · mock: var
- [❌ EKSİK] Salt-okur okuyucuda "Close" (Cancel yerine), Save yok · rol: manager · nasıl: kaydetme izni olmayan kayıt (ör. Rachel'ın kendi kaydı ya da üst rütbe) · mock: var (ör. owner kaydı müdürün listesinde)
- [✅ na-drawer] Bilinmeyen/kapsam dışı kişi: çekmecede erişim-yok kartı · rol: manager · nasıl: ?employeeId=<Uptown kişi id>&section=profile · mock: var
- [❌ EKSİK] "Loading employee..." · rol: owner · nasıl: çekmece aç · mock: eksik: gecikme anahtarı
- [❌ EKSİK] Detay okuma hatası (sunucu cümlesi) · rol: owner · nasıl: çekmece aç · mock: eksik: GET detail 500
- [❌ EKSİK] Telefon: üstte "Employee section" seçimi ile bölüm değiştirme · rol: owner · nasıl: drawer senaryosu, telefon çerçevesi → seçim · mock: var (drawer senaryosunun telefon karesi açılışı gösterir; seçim değişimi ayrı senaryo)
- [❌ EKSİK] Geçersiz `section=` değeri Profile'a düşer · rol: owner · nasıl: ?employeeId=…601&section=xyz · mock: var

### Senaryolar — Terminate employee penceresi
- [❌ EKSİK] Pencere açık (şimdiki zaman önerili, saat dilimi, Reason boş) · rol: owner · nasıl: Maria → Terminate employee · mock: var
- [❌ EKSİK] Alan hataları (gerekçe kısa / gelecek zaman) · rol: owner · nasıl: Terminate employee → Terminate · mock: var
- [❌ EKSİK] İki tık: "Confirm termination" kurulu · rol: owner · nasıl: Reason yaz → Terminate · mock: var
- [❌ EKSİK] Sonuç: "Employee terminated. <n> published shifts released.", kayıt arşive geçer · rol: owner · nasıl: → Confirm termination · mock: var
- [❌ EKSİK] Sunucu reddi (ör. saat dilimi lokasyonla uyuşmuyor) · rol: owner · nasıl: Confirm termination · mock: var (dal var; tetiklemek için saat dilimi listesi yalnız geçerlileri sunduğundan setup gerekir)
- [❌ EKSİK] "An active employee location with a timezone is required." · rol: owner · nasıl: Terminate employee · mock: eksik: saat dilimsiz lokasyonlu dünya
- [❌ EKSİK] Telefonda pencere · rol: owner · nasıl: Terminate employee (telefon çerçevesi) · mock: var (senaryo yok)

### Senaryolar — Add employee akışı
- [✅ add] Yeni çalışan çekmecesi, Profile adımı, Next kapalı · rol: owner · nasıl: Add employee · mock: var
- [❌ EKSİK] Ad girildi → Next açık → Employment adımı ("Work mode") · rol: owner · nasıl: Add employee → First/Last → Next · mock: var
- [❌ EKSİK] E-postalı yeni kişi: davet özeti kartı + "Choose an invite role" · rol: owner · nasıl: Add employee → ad + e-posta → Next · mock: var
- [❌ EKSİK] Geçersiz e-posta: "Enter a valid email address in Profile.", Invite kapalı · rol: owner · nasıl: e-posta "abc" → Next · mock: var
- [❌ EKSİK] Davetsiz Save → "Employee saved.", çekmece kayda döner · rol: owner · nasıl: ad → Next → lokasyon + job → Save · mock: var
- [❌ EKSİK] Davetle kaydet → "Employee saved. Invitation sent." · rol: owner · nasıl: ad + e-posta → Next → atama → Invite role → Invite · mock: var
- [❌ EKSİK] "Invitation couldn't be sent." / "delivery is pending" + "Retry invitation" · rol: owner · nasıl: Invite · mock: eksik: create cevabında deliveryStatus failed/pending (mock hep "sent", `employees-service.ts:410`)
- [❌ EKSİK] Belirsiz istek "Check the previous request before continuing." + Retry request · rol: owner · nasıl: Save · mock: eksik: create ucunda 500/ağ hatası
- [❌ EKSİK] Kaydetme reddi (400, ör. "Only the workspace owner holds the Owner job.") · rol: owner · nasıl: Save · mock: var
- [❌ EKSİK] Müdür yeni kişi: lokasyon listesi yalnız Downtown, rol listesi yalnız Employee · rol: manager · nasıl: Add employee · mock: var
- [❌ EKSİK] Müdür sınıfı rolle davet, lokasyonsuz → reddetme cümlesi · rol: owner · nasıl: Remote olmadan lokasyonsuz → Invite role Shift Lead → Invite · mock: var
- [❌ EKSİK] "Loading locations, jobs and roles..." · rol: owner · nasıl: Add employee · mock: eksik: gecikme anahtarı
- [✅ add] Telefon: "Create employee steps" adım çubuğu (telefon çerçevesi) · rol: owner · nasıl: Add employee · mock: var
- Not: "Development invitation prepared." satırı yalnız sunucu `developmentUrl` döndürünce çıkar; mock döndürmüyor. Geliştirme ortamına özel olduğundan senaryo yazılmadı.

---

## 4.1 Employee documents — /app/employees/documents

B görünümü (main 68ef63e6, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kart: "We couldn't load documents"; liste boşken ve yenileme düşmüşken "No documents yet" yazmaz.

Kapı: `App.tsx:422` `ActionRoute documents.read` (yerleşik müdürde yok). Bileşen `documents/EmployeeDocumentsPage.tsx` → `documents/EmployeeDocumentsList.tsx` (kind = document) → `documents/DocumentReviewDrawer.tsx`. Adres: `?requirement=<id>` açılışta çekmeceyi açar (`EmployeeDocumentsPage.tsx:16`, `EmployeeDocumentsList.tsx:72-78`).

### Parçalar
- Sayfa başlığı: eyebrow "EMPLOYEES", "Documents", "Review employee documents, delivery status and expiration." — `documents/EmployeeDocumentsPage.tsx:15-21`
- Durum sekmeleri "All", "Needs review", "Missing", "Expired", "Completed" + sayı rozeti — `documents/EmployeeDocumentsList.tsx:25-31`, `138-163`
- Süzgeçler: "Location" ("All locations"), "Document type" ("All document types"), arama "Search employee or document" — `documents/EmployeeDocumentsList.tsx:164-206`
- Tablo "Employee documents": Employee (+ lokasyon adları), Document, Status (renkli çip: yeşil/kırmızı/gri/sarı); sıralanabilir başlıklar; satır tıklanır/Enter — `documents/EmployeeDocumentsList.tsx:208-284`, `343-351`
- Durum adları: Needs review, Missing, Expired, Completed, Grace period, Rejected, Removed, Exempt, Time zone needed, Paused, On file — `documents/document-rules.ts:36-76`
- Durumlar: "Loading documents…", hata cümlesi, boş "No documents yet / Documents your team submits show up here.", süzgeç boşu "No documents match these filters. / Try another status or clear your search.", erişim-yok "You don't have access to these documents" — `documents/EmployeeDocumentsList.tsx:285-326`
- Belge çekmecesi (CatalogDrawer) başlık: belge adı + kişi + kapat "Close document details"; yükleniyor "Loading document…", "You don't have access to this document.", hata — `documents/DocumentReviewDrawer.tsx:76-128`, `462-482`
- Çekmece gövdesi: durum satırı, saat dilimi notu ("An administrator needs to set this employee's document time zone..."), "Document time zone" alanı + "Save document time zone", "Deadline: …", ret notu, "Workspace access is restricted..." uyarısı — `documents/DocumentReviewDrawer.tsx:483-540`
- Onay (policy) bölümü "Policy content": metin, "Acknowledged by … on …", "Withdraw acknowledgement" (yalnız kişinin kendisi), geri çekilme geçmişi, "Download policy copy" — `documents/DocumentReviewDrawer.tsx:541-639` (4.1 listesi yalnız belge türünü gösterir; bu bölüm 4.0 çekmecesinin Documents bölümünde görünür)
- Sürüm bölümleri "Version n · Draft/Needs review/Approved/Rejected/Replaced": son geçerlilik, ek alanlar, dosya düğmeleri (indir), dosya başına "Decision for …" (Keep/Discard) + "Note for …" ya da "Kept"/"Discarded" — `documents/DocumentReviewDrawer.tsx:640-724`, `document-rules.ts:96-114`
- "Review decision": "Rejection reason", "Correction period" (Full / Remaining time) — `documents/DocumentReviewDrawer.tsx:725-754`
- Muafiyet: "Exempt from this document" / "Remove exemption" → satır içi onay (açıklama, "Reason", Cancel, onay düğmesi, hata); owner için "Owners aren't required to submit documents. Uploading is optional." — `documents/DocumentReviewDrawer.tsx:882-898`, `documents/DocumentExemptionAction.tsx:67-126`
- "Extend delivery deadline": "Additional days" (1–3650), "Extension reason", "Extend deadline" — `documents/DocumentReviewDrawer.tsx:899-946`
- "History" açılır listesi — `documents/DocumentReviewDrawer.tsx:947-958`
- Durum satırları: "This document changed. You're seeing the latest version.", "Decision saved", hata ("Couldn't save. Try again." / "Couldn't open the file. Try again.") — `documents/DocumentReviewDrawer.tsx:421-439`, `959-969`
- Alt çubuk: "Next" (listede sıradaki), "Reject" (gerekçe boşken kapalı), "Approve" (Keep yoksa kapalı) — `documents/DocumentReviewDrawer.tsx:971-1006`
- "Discard unsaved changes?" penceresi: "Keep editing" / kırmızı "Discard" (kaydedilmemiş yazıyla kapatma ya da Next) — `documents/DocumentReviewDrawer.tsx:1008-1021`
- Kişinin kendi tarafındaki yükleme/gönderme/erteleme bölümleri (`selfOnly`) bu sayfada görünmez; 11.5 ve çalışan onboarding'inin kapsamı — `documents/DocumentReviewDrawer.tsx:755-881`

### Senaryolar
- [✅ all] Bütün belgeler, sayı rozetleri · rol: owner · nasıl: /app/employees/documents · mock: var
- [✅ review] "Needs review" sekmesi · rol: owner · nasıl: Needs review · mock: var
- [✅ missing] "Missing" sekmesi · rol: owner · nasıl: Missing · mock: var
- [✅ expired] "Expired" sekmesi · rol: owner · nasıl: Expired · mock: var
- [❌ EKSİK] "Completed" sekmesi (owner için "On file" çipleri dahil) · rol: owner · nasıl: Completed · mock: var
- [❌ EKSİK] Lokasyon / belge türü süzgeci ve arama · rol: owner · nasıl: Location → Uptown; Document type → Food handler · mock: var
- [❌ EKSİK] Süzgeç boşu "No documents match these filters." · rol: owner · nasıl: aramaya "zzz" · mock: var
- [❌ EKSİK] Hiç belge yok "No documents yet" · rol: owner · nasıl: /app/employees/documents · mock: eksik: belgesiz setup
- [❌ EKSİK] Status sütununa göre sıralama (en acil önce) · rol: owner · nasıl: Status başlığı · mock: var
- [❌ EKSİK] İnceleme bekleyen belge çekmecesi: dosya kararları, Reject / Approve · rol: owner · nasıl: Needs review → ilk satır · mock: var
- [❌ EKSİK] Approve → "Decision saved", durum Completed · rol: owner · nasıl: çekmece → Approve · mock: var
- [❌ EKSİK] Reject: gerekçe yazılınca açılır, "Remaining time" seçeneği · rol: owner · nasıl: çekmece → Rejection reason → Reject · mock: var
- [❌ EKSİK] Bütün dosyalar Discard → Approve kapalı · rol: owner · nasıl: Decision → Discard · mock: var
- [❌ EKSİK] Süresi geçmiş belgeyi onaylama reddi "expired document cannot be approved" · rol: owner · nasıl: süresi geçmiş sürümlü pending → Approve · mock: var (veri gerekirse eksik)
- [❌ EKSİK] Kaydedilmemiş not varken kapatma → "Discard unsaved changes?" · rol: owner · nasıl: Rejection reason yaz → kapat · mock: var
- [❌ EKSİK] "Next" ile sıradaki belge · rol: owner · nasıl: çekmece → Next · mock: var
- [❌ EKSİK] Eksik belge çekmecesi: "Deadline", "Extend delivery deadline" · rol: owner · nasıl: Missing → son tarihli satır · mock: var
- [❌ EKSİK] Süre uzatma → yeni son tarih · rol: owner · nasıl: Additional days + reason → Extend deadline · mock: var
- [❌ EKSİK] Muafiyet ver: satır içi onay, Reason boşken kapalı, sonuç "Exempt" · rol: owner · nasıl: Missing satırı → Exempt from this document → Reason → onay · mock: var
- [❌ EKSİK] Muafiyeti kaldır (HV-008/009) · rol: owner · nasıl: Exempt satırı → Remove exemption · mock: var
- [❌ EKSİK] Owner'ın kendi belgesi: "Owners aren't required..." notu · rol: owner · nasıl: Mert Tepebas satırı · mock: var
- [❌ EKSİK] Reddedilmiş belge: ret notu ve "Rejected" · rol: owner · nasıl: Rejected satırı · mock: var
- [❌ EKSİK] Dosya indirme ve "Couldn't open the file. Try again." · rol: owner · nasıl: dosya adı düğmesi · mock: var (indirme), eksik: 5xx dalı
- [❌ EKSİK] Çakışma "This document changed..." · rol: owner · nasıl: Approve · mock: eksik: açılıştan sonra revizyonu artıran setup (mock 409'u `document.changed` reason'ı olmadan döner, `documents-service.ts:128`)
- [❌ EKSİK] Bildirimden açılış `?requirement=<id>` çekmeceyle · rol: owner · nasıl: /app/employees/documents?requirement=<id> · mock: var
- [❌ EKSİK] "Time zone needed" / "Grace period" / "Paused" / "Removed" çipleri · rol: owner · nasıl: All · mock: eksik: bu durumlarda seed (grace koşullu belgeye bağlı; paused/timezone_required yok)
- [❌ EKSİK] "Workspace access is restricted..." uyarısı (askıya alınmış) · rol: owner · nasıl: çekmece · mock: eksik: `suspended: true` satır (mock hep false)
- [❌ EKSİK] "Document time zone" alanı (birincil lokasyonu olmayan kişi) · rol: owner · nasıl: çekmece · mock: eksik: `timezone_settings.can_manage` hep false
- [❌ EKSİK] "Loading documents…" / liste hatası · rol: owner · nasıl: sayfa açılışı · mock: eksik: gecikme / 500 dalı
- [✅ no-access] Erişim-yok kartı (API 403) · rol: özel · nasıl: /app/employees/documents · mock: eksik: documents.read eylemi olup listesi reddedilen görüntüleyici
- [❌ EKSİK] İnceleme izni olmayan okuyucu (documents.review yok): Reject/Approve, muafiyet, uzatma yok · rol: özel · nasıl: çekmece · mock: eksik: özel rol görüntüleyici
- [❌ EKSİK] Yerleşik müdür bu adresi açarsa yönlendirilir · rol: manager · nasıl: /app/employees/documents · mock: var (rota kapısı; sayfanın rol listesi yalnız owner)
- [❌ EKSİK] Telefonda tablo ve çekmece · rol: owner · nasıl: review senaryosu + satır · mock: var

---

## 4.2 Employees archive — /app/employees/archive

B görünümü (main 68ef63e6, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. 4.0 listesiyle aynı bileşen.

Kapı: `App.tsx:423-430` `PermissionRoute anyOf employees.read`. Bileşen aynı `employees/EmployeesPage.tsx` (`archived = pathname.endsWith("/archive")`, `EmployeesPage.tsx:83`).

### Parçalar
- "Archived" sekmesi seçili; durum sekmelerinden biri /app/employees'e döner — `employees/EmployeesPage.tsx:280-318`
- "Add employee" yok — `employees/EmployeesPage.tsx:364`
- Tablo arşivlenmiş kişilerle (durum çipi "Archived") — `employees/EmployeesPage.tsx:663-671`
- Boş: "No archived employees / Archived records will remain available here." ya da süzgeçle "No matching employees" — `employees/EmployeesPage.tsx:460-483`
- Arşivlenmiş kişinin çekmecesi: alanlar salt-okur, alt çubukta "Close" + "Restore employee" (tek tık), Access'te "Archived" (bağlı) ya da "Invitation revoked" (bağlı değil) durumu, fotoğraf kaldırma yok, History'de "Terminated: …" — `employees/EmployeeDrawer.tsx:434-442`, `1529-1553`, `2681-2763`
- Geri yükleme sonrası çekmece kapanır, kişi listeden çıkar — `employees/EmployeeDrawer.tsx:583-593`
- Geri yükleme hatası satırı — `employees/EmployeeDrawer.tsx:592`, `1412-1415`

### Senaryolar
- [✅ owner] Arşiv listesi (Brian Foster, Megan Ross) · rol: owner · nasıl: /app/employees/archive · mock: var
- [✅ manager] Müdür arşivi: yalnız Downtown (Brian) · rol: manager · nasıl: /app/employees/archive · mock: var
- [❌ EKSİK] Arşivlenmiş bağlı kişinin çekmecesi (Brian): salt-okur, Restore employee, Access "Archived" · rol: owner · nasıl: Brian satırı · mock: var
- [❌ EKSİK] Arşivlenmiş bağlı olmayan kişi (Megan): Access "Invitation revoked", davet düğmeleri yok · rol: owner · nasıl: Megan → Access · mock: var
- [❌ EKSİK] History'de işten çıkarma olayı · rol: owner · nasıl: Brian → History · mock: var
- [❌ EKSİK] "Restore employee" → çekmece kapanır, kişi aktif listeye döner · rol: owner · nasıl: Megan → Restore employee · mock: var
- [❌ EKSİK] Müdür geri yükleme (izni varsa) · rol: manager · nasıl: Brian → Restore employee · mock: var
- [❌ EKSİK] Geri yükleme hatası · rol: owner · nasıl: Restore employee · mock: eksik: archive PATCH hata dalı
- [❌ EKSİK] Boş arşiv "No archived employees" · rol: owner · nasıl: iki kişiyi geri yükle ya da setup · mock: eksik: arşivsiz setup (adımlarla da olur)
- [❌ EKSİK] Arşivde arama/lokasyon süzgeci boşu "No matching employees" · rol: owner · nasıl: aramaya "zzz" · mock: var
- [❌ EKSİK] Arşivden durum sekmesine tıklayınca /app/employees'e dönüş · rol: owner · nasıl: Archived → Active · mock: var
- [❌ EKSİK] Telefonda arşivlenmiş kişinin çekmecesi · rol: owner · nasıl: Brian satırı (telefon çerçevesi) · mock: var

---

## 5.0 Availability — /app/availability

B görünümü (main 3b138c3b, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son tablo kalır ve üstte "didn't refresh" satırı + Try again. Kartlar: "We couldn't load team availability" (sayfa), "We couldn't load availability" (çekmecedeki haftalık panel). PAGES senaryoları: `loading`, `team-error`, `panel-error`.

Kapı: `App.tsx:393-402` `PermissionRoute anyOf availability.read, roles owner/admin/manager`. Bileşen `views/AvailabilityPage.tsx`; çekmece `employees/EmployeeDrawer.tsx` (section=availability) → `availability/WeeklyPreferencesPanel.tsx` → `WeeklyPreferencesForm.tsx` → `WeeklyUnavailableEditor.tsx`. Adres: `submission`, `location`, `q`, `employeeId`, `section`.

Kapsam notu: Görevde geçen "izin onay/ret" bu sayfada yok. Kod yalnız haftalık uygunluğu ve müdür hatırlatmalarını gösterir; izin talepleri 3.3 Requests'te (`views/ScheduleRequestsPage.tsx`). Burada uydurulmadı.

### Parçalar
- Sayfa başlığı: eyebrow "AVAILABILITY CLEAR. COVERAGE READY.", "Availability", açıklama — `views/AvailabilityPage.tsx:117-122`
- Gönderim sekmeleri "All", "Submitted", "Not submitted" + sayaç "<n> employees" — `views/AvailabilityPage.tsx:123-155`
- "Location" süzgeci ("All locations"), arama "Search employees" (ad + kod) — `views/AvailabilityPage.tsx:156-186`
- Tablo "Team availability" (kaydırılır bölge): "Employee" sıralanır, Mon…Sun başlıkları — `views/AvailabilityPage.tsx:200-240`
- Satır: kişi düğmesi (açamayanda kapalı), gün hücresi düğmesi (aria "…: Available"/etiketler), hücre içerikleri "All day", saat aralıkları, vardiya türü adları, en çok 3 satır ve "+n more", boş gün "—", kırmızı işaret (`data-unavailable`) — `views/AvailabilityPage.tsx:242-295`, `343-387`
- Boş: "No employees match this view / Try another status or location, or clear your search." — `views/AvailabilityPage.tsx:298-306`
- Durumlar: gri tablo iskeleti, kart "We couldn't load team availability" + "Try again", erişim-yok "You don't have access to team availability" — `views/AvailabilityPage.tsx:104-111`, `188-199`
- Çekmece: "Loading employee..." (tembel yükleme) ve EmployeeDrawer (bölüm Availability, öteki bölümlere geçilebilir) — `views/AvailabilityPage.tsx:310-324`
- Haftalık panel durumları: gri satırlar, "You don't have access to this availability.", çerçevesiz kart "We couldn't load availability" + "Try again" — `availability/WeeklyPreferencesPanel.tsx:93-119`
- Sekmeler (hatırlatma verisi varsa) "Employee availability" / "Manager reminders" (ok tuşları) — `availability/WeeklyPreferencesForm.tsx:201-242`
- "Employee availability" sekmesi: başlık + "Submitted"/"Not submitted", salt-okur hafta; hiç işaret yoksa açılır "Available all week" — `availability/WeeklyPreferencesForm.tsx:249-263`
- "Manager reminders" sekmesi: "On/Off" anahtarı "Enable manager reminders", "Managers only", "Use employee preferences" (gönderilmemişse kapalı, ipucu "No employee preferences submitted"), "Clear all unavailable selections", "Reminders are off. Saved rules and notes are kept." — `availability/WeeklyPreferencesForm.tsx:264-337`
- Haftalık düzenleyici: lejant "Available/Unavailable", (vardiya türü kipinde) "Shift default hours" bilgi düğmesi + saat listesi, başlıklar Day/Unavailable/All day/Note — `availability/WeeklyUnavailableEditor.tsx:115-156`
- Gün satırı (saat aralığı kipi): "<Gün> unavailable start/end" saat girişleri (geçersizse `aria-invalid`), "Remove <Gün> hours", "End of day", "Add hours" (en çok 12), "All day unavailable" yazısı — `availability/WeeklyUnavailableEditor.tsx:234-306`, `availability/AvailabilityClockInput.tsx:35-63`
- Gün satırı (vardiya türü kipi): tür düğmeleri "<Gün> <tür> unavailable" (seçili/+, "Previous"), "No shift types available" — `availability/WeeklyUnavailableEditor.tsx:204-233`
- "All day" anahtarı "<Gün> all day unavailable" — `availability/WeeklyUnavailableEditor.tsx:308-325`
- Müdür notu düğmesi "Add/Edit <Gün> manager note", not alanı "Add a note for managers...", not özeti — `availability/WeeklyUnavailableEditor.tsx:326-359`
- Alt çubuk (yalnız Manager reminders sekmesinde): hata satırı + "Reload" (çakışma), durum "Saving..."/"Saved"/"Unsaved changes", "Discard", "Save" — `availability/WeeklyPreferencesForm.tsx:360-433`
- Telefonda gün adları kısa ("Mon") — `availability/WeeklyUnavailableEditor.tsx:167-171`

### Senaryolar
- [✅ owner] Owner ekibi: iki lokasyon, işaretli hücreler · rol: owner · nasıl: /app/availability · mock: var
- [✅ manager] Müdür: yalnız Downtown, lokasyon seçiminde tek şube · rol: manager · nasıl: /app/availability · mock: var
- [✅ missing] "Not submitted" (Ethan, Luis, Noah, Olivia, Sam) · rol: owner · nasıl: Not submitted · mock: var
- [❌ EKSİK] "Submitted" sekmesi · rol: owner · nasıl: Submitted · mock: var
- [❌ EKSİK] Lokasyon süzgeci + arama, sayaç değişir · rol: owner · nasıl: Location → Uptown; arama "HV-00" · mock: var
- [❌ EKSİK] Boş görünüm "No employees match this view" · rol: owner · nasıl: aramaya "zzz" · mock: var
- [❌ EKSİK] Employee sütununu ters sırala · rol: owner · nasıl: Employee başlığı · mock: var
- [❌ EKSİK] Bir günde 3'ten fazla aralık → "+n more" (ipucunda kalanlar) · rol: owner · nasıl: /app/availability · mock: eksik: bir günde 4+ aralıklı kişi seed'i
- [❌ EKSİK] Vardiya türü kipinde hücrelerde tür adları (arşivli tür "(archived)") · rol: owner · nasıl: /app/availability · mock: eksik: `input_mode: "shift_type"` setup'ı (bugün yalnız Settings'ten değişir)
- [❌ EKSİK] Müdürde açamadığı kişi: ad ve hücre düğmeleri kapalı · rol: manager · nasıl: /app/availability · mock: eksik: müdürün listesine gelip `can_open` false olan kişi (liste zaten yalnız Downtown)
- [❌ EKSİK] Kişiyi aç: çekmece Availability, "Employee availability" sekmesi (Submitted) · rol: owner · nasıl: Maria Lopez adı · mock: var
- [❌ EKSİK] Gönderilmemiş kişi: "Not submitted", "Available all week" açılır özeti · rol: owner · nasıl: Ethan Brooks adı · mock: var
- [❌ EKSİK] "Manager reminders" sekmesi, notlu gün (Priya Patel) · rol: owner · nasıl: Priya → Manager reminders · mock: var
- [❌ EKSİK] "Use employee preferences" kopyalama → Unsaved changes → Save → Saved · rol: owner · nasıl: Maria → Manager reminders → Use employee preferences → Save · mock: var
- [❌ EKSİK] "Use employee preferences" kapalı (çalışan göndermemiş) · rol: owner · nasıl: Ethan → Manager reminders · mock: var
- [❌ EKSİK] Saat aralığı ekle/kaldır, "End of day", "All day" · rol: owner · nasıl: Manager reminders → "Add hours on Monday" · mock: var
- [❌ EKSİK] Geçersiz saat yazımı (`aria-invalid`) → Save'de hata cümlesi · rol: owner · nasıl: Monday unavailable start "25:99" → Save · mock: var
- [❌ EKSİK] Gün notu ekle/düzenle · rol: owner · nasıl: "Add Monday manager note" · mock: var
- [❌ EKSİK] Hatırlatmaları kapat: "Reminders are off..." ve düzenleyici kilitli · rol: owner · nasıl: Enable manager reminders kapat · mock: var
- [❌ EKSİK] "Clear all unavailable selections" ve "Discard" · rol: owner · nasıl: Manager reminders · mock: var
- [❌ EKSİK] Çakışma hatası + "Reload" · rol: owner · nasıl: Save · mock: eksik: 409'a `availability.changed` reason'ı (mock reason'sız döner, `availability-service.ts:269-270`) ve açılıştan sonra revizyon artıran setup
- [✅ save-refused] Kaydetme hatası (yetki yok: "You don't have access to change this availability.") · rol: manager · nasıl: Save · mock: eksik: kaydetmede 403 dalı tetikleyen setup
- [❌ EKSİK] Vardiya türü kipinde düzenleyici: tür düğmeleri, "Shift default hours" listesi, "Previous" etiketi · rol: owner · nasıl: Manager reminders · mock: eksik: shift_type kipi setup'ı
- [❌ EKSİK] Hatırlatma verisi olmayan kişi (yönetici ya da not okuyamayan): sekme yok, yalnız "Employee availability" · rol: özel · nasıl: kişi aç · mock: eksik: `manager: null` dönen okuyucu (yerleşik rollerde hep dolu)
- [❌ EKSİK] Çekmeceden başka bölüme geçiş (Profile) ve kapatma (parametreler temizlenir) · rol: owner · nasıl: Maria → Profile → kapat · mock: var
- [❌ EKSİK] Bildirimden açılış `?employeeId=…&section=availability` · rol: owner · nasıl: /app/availability?employeeId=…601&section=availability · mock: var
- [✅ panel-error] Haftalık panel okunamadı: çerçevesiz kart + Try again · rol: owner · mock: var
- [✅ loading] Yükleniyor: tablonun gri iskeleti · rol: owner · mock: var
- [✅ team-error] Ekip okunamadı: We couldn't load team availability + Try again · rol: owner · mock: var
- [✅ no-access] Erişim-yok kartı "You don't have access to team availability" · rol: özel · nasıl: /app/availability · mock: eksik: availability.read'i olup ekibi reddedilen görüntüleyici
- [❌ EKSİK] Çalışan bu adresi açarsa yönlendirilir · rol: employee · nasıl: /app/availability · mock: var (rota kapısı)
- [✅ owner] Telefon: tablo yatay kayar, kısa gün adları (telefon çerçevesi) · rol: owner · nasıl: /app/availability · mock: var
- [❌ EKSİK] Telefonda kişi çekmecesi (haftalık form) · rol: owner · nasıl: Maria adı (telefon çerçevesi) · mock: var

---

## 6.0 Important Dates — /app/announcements/important-dates

B görünümü (main 5d83f506, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez. Kart: "We couldn't load Important Dates".

Güncelleme (main 1d053cd2, 2026-10-12): eski Settings sayfası (`settings/ImportantDatesSettingsPage.tsx`) emekli; Important Dates artık Announcements'ın altında, tarihli duyurular. Liste `views/AnnouncementsPage.tsx` (Important Dates görünümü), ekleme ve düzenleme duyuru çekmecesiyle (`communications/AnnouncementDrawer.tsx`, `AnnouncementDrawerTabs.tsx`): dört sekme Details · Audience · Shifts · History; Details'ta saatler workspace'in 12h/24h saatine uyar ve AM/PM iki uçta yazılır; Shifts'te seçilen düğme sonucunun rengini alır (Remove kırmızı, Open shift sarı, Keep yeşil). main 4662a826: Audience tek liste (Who gets it, + Add people araması, en sonda Ask people to acknowledge). Mock: `.temp/pages/mock/announcements-service.ts`. Eski adres `/app/important-dates` yeni adrese döner.

### Parçalar ve senaryolar (PAGES'teki güncel liste)
- **Liste · Important dates**
  - [✅ `list`] Yaklaşan günler · owner
  - [✅ `past`] Geçmiş günler (salt okunur) · owner
  - [✅ `empty`] Tarihli duyuru yok: No dates here. · owner
  - [✅ `yearly`] Her yıl tekrarlanan: Christmas Day (Every year), iki lokasyon kapalı · owner
  - [✅ `search`] Arama: deep clean (başlık ve metinde arar) · owner
  - [✅ `search-empty`] Arama sonuç vermez: xyz · owner
  - [✅ `reader-search`] Salt okur arar (New yok): Christmas · custom
- **Çekmece · Announcement**
  - [✅ `new`] Yeni gün çekmecesi · owner
  - [✅ `closed`] Kapalı gün: Kitchen deep clean (Downtown) · owner
  - [✅ `short`] Kısa saat: Hartwell private buyout (Uptown 5 PM – 11 PM), saatler Details'ta · owner
  - [✅ `shifts`] Kısa saatin dışında kalan vardiyalar (Shifts) · owner
  - [✅ `removed`] Kapalı gün yayınlanınca kaldırılan vardiyalar (History) · owner
  - [✅ `new-closed`] Yeni gün, Downtown kapalı: sarı bant ve Shifts sayacı · owner
  - [✅ `new-short`] Yeni gün, kısa saat: saatler düğmelerin altında açılır · owner
  - [✅ `timed`] All day kapalı: başlangıç ve bitiş saati · owner
  - [✅ `timed-24h`] 24 saatlik workspace: saatler 24 saatlik, AM/PM yok · owner
  - [✅ `shift-choices`] Shifts sekmesi: seçilen düğme sonucunun rengini alır (Remove kırmızı, Open shift sarı, Keep yeşil) · owner
  - [✅ `past-date`] Geçmiş başlangıç: Next geçer, Details'a dönünce Starts alanında "It can't start before today" · owner
  - [✅ `audience`] Kime gidiyor: Hartwell private buyout (Uptown'daki herkes) · owner
  - [✅ `acks`] Onaylayanlar Audience'ta: Hartwell private buyout · owner
- **Roller**
  - [✅ `manager`] Manager · yalnız Downtown · manager
  - [✅ `admin`] Admin · Daniel Brooks: owner gibi bütün lokasyonlar · admin
  - [✅ `manager-new`] Müdür yeni gün: yalnız Downtown seçilebilir · manager
  - [✅ `manager-other`] Müdür, owner'ın iki lokasyonlu kaydını açar: salt okunur · manager
  - [✅ `manager-two`] İki lokasyonun müdürü: Downtown ve Uptown seçilebilir · manager
  - [✅ `reader`] Salt okur (özel rol): New yok, kayıt okuyucu görünümünde açılır · custom
- **Sayfa durumları**
  - [✅ `loading`] Yükleniyor: listenin gri iskeleti · owner
  - [✅ `list-error`] Liste okunamadı: We couldn't load Important Dates + Try again · owner
  - [✅ `no-permission`] important_dates.read yok: Workspace'e döner · custom

## Yeni sayfa önerisi (zorunlu değil)

Bu alandaki bütün rotalar haritada var; eksik route yok. İki büyük çekmece ise kendi numarası olmadan duruyor ve senaryoların yarısı onların içinde. 8.1 "Announcement detail" örneğindeki gibi aynı path'le ayrı numara önerilir:
- YENİ — Employee drawer — /app/employees?employeeId=…&section=… : yukarıdaki "çekmece" ve "Terminate employee" senaryoları buraya taşınır (sayılarda 4.0 altında sayıldı).
- YENİ — Document review drawer — /app/employees/documents?requirement=… : 4.1'in çekmece senaryoları buraya taşınır (sayılarda 4.1 altında sayıldı).

## Sayılar

- Sayfa: 6 mevcut (2.0, 4.0, 4.1, 4.2, 5.0, 6.0) / 0 zorunlu yeni (2 isteğe bağlı öneri: çalışan çekmecesi, belge çekmecesi).
- Parça: 142 madde (2.0: 20 · 4.0: 65, bunun 11'i liste, 39'u çekmece, 6'sı Terminate penceresi, 9'u Add employee · 4.1: 18 · 4.2: 7 · 5.0: 19 · 6.0: 13). Bazı maddeler birkaç ekran öğesini birlikte sayar (ör. bir alt çubuğun düğmeleri).
- Senaryo: 271 satır, ✅ 33 / ❌ 238 (2.0: 26 · 4.0: 131 · 4.1: 33 · 4.2: 12 · 5.0: 32 · 6.0: 37).
- Mock eksiği olan senaryo: 75.
- Bugünkü 26 senaryonun hepsi bir satıra bağlandı. Bazıları telefon karesi için ikinci kez kullanıldığından ✅ satırı 33.

---


# Alan: Envanter — Schedule alanı (müdür / owner)

Kaynak: `apps/web/src/views/SchedulePage.tsx`, `views/ScheduleTemplatesPage.tsx`, `views/ScheduleRequestsPage.tsx` ve alt bileşenleri (`apps/web/src/schedule/**`, `views/Request*.tsx`, `views/TimeOff*.tsx`, `views/ExchangeReview.tsx`, `views/SwapReview.tsx`), route'lar `apps/web/src/App.tsx:316–390` (main e0763dd5). Mock: `apps/web/.temp/pages/mock/schedule-service.ts`, `requests-*.ts`, `hub-exchanges.ts`, `world.ts`.

Genel notlar (her senaryo için geçerli):
- Schedule (3.0–3.2) PAGES'te kendi build'iyle çalışır (`PAGES_SCHEDULE=1`, `.temp/pages/vite.config.ts:23–25`); öteki build'de `SchedulePage` ve `ScheduleTemplatesPage` yerine boş bir taslak sayfa (`mock/schedule-page-stub.tsx`) çıkar.
- Mock'un Schedule okuması müdürün kapsamını uygulamıyor: `readModel` her rolde iki lokasyonu ve bütün çalışanları döner, `ghost_shifts: []` (`mock/schedule-service.ts:267–296`). Bu yüzden "manager" senaryoları gerçekte görülmeyecek Uptown'ı da gösterir; müdüre özgü her senaryo "mock: eksik" sayıldı.
- Mock'ta tarayıcı içi realtime yalnız kişinin kendisini görür (`mock/fake-supabase.ts:304–318`): başka bakan/düzenleyen kişi üretilemez.
- Mock'ta hiçbir okuma hata ya da 403 dalı vermez; yükleniyor durumu yalnız 60 ms görünür (`mock/api.ts` `installFetch`).

Yönlendirmeler ve deneme route'ları (tek satır):
- `/app/schedule-badge-lab`, `/app/schedule-badge-lab/export`, `/app/schedule-badge-lab/templates`: yalnız DEV'de açılan deneme sayfası (`App.tsx:353–386`, `dev/ScheduleShiftBadgeLabPage`); kapsam dışı. `/dev/schedule-shift-badge-lab` → `/app/schedule-badge-lab` yönlendirmesi (`App.tsx:191–192`).
- `/app/schedule/requests?tab=availability` → `/app/availability` yönlendirmesi (`views/ScheduleRequestsPage.tsx:52–54`).
- Employee rolü `/app/schedule`, `/export`, `/templates`'e girerse `PermissionRoute` onu kendi açılış sayfasına atar (`auth/PermissionRoute.tsx:35–41`); `/app/schedule/requests` için aynı işi `can("requests.read")`/`can("exchange.read")` yapar (`ScheduleRequestsPage.tsx:56–57`).

---

## 3.0 Schedule — /app/schedule

B görünümü (main 5d7b6f09, 2026-10-14): hafta yüklenirken ızgaranın gri iskeleti; hafta okunamazsa ortada çerçevesiz kart "We couldn't load Schedule" + beyaz Try again, hafta okları çalışır; yenileme düşerse son vardiyalar kalır ve üstte "This week's schedule didn't refresh. These are the last shifts that loaded." + Try again; erişim reddedilirse son vardiyalar değil erişim kartı. Taslağın vardiyaları okunamazsa boş taslak yerine "We couldn't load this draft" kartı; okunurken hafta gri. Canlı yenilemede ızgara griye dönmez (aynı taslağın son okuması kalır). Publish penceresi önizlemesi: yüklenirken gri satırlar, okunamazsa "We couldn't load the publish preview" + Try again. Taslak listesi okunamazsa (Edit ya da yeni taslak başlatılırken) B satırı: "The drafts didn't load, so editing didn't start. Nothing was changed." + Try again; hafta değişince satır kalkar, erişim reddinde düz "You don't have access to edit this schedule." (main e0c18aae). Senaryo `drafts-error`. PAGES senaryoları: `loading`, `error`, `draft-shifts-error`, `publish-preview-loading`, `publish-preview-error`.

### Parçalar

**A. Kapı ve sayfa durumları**
- Telefon kapalı ekranı: "Schedule is available on a computer." (`auth/DesktopOnlyRoute.tsx:10–13`, eşik `lib/usePhoneWidth.ts:4` max-width 767px; `App.tsx:322`).
- Rol kapısı: owner/admin/manager + `schedule.read`, yoksa açılış sayfasına yönlendirme (`App.tsx:317–321`).
- Yükleniyor: "Loading Schedule" / "Getting this week's shifts." (`SchedulePage.tsx:1886–1892`, `components/ScheduleState.tsx`).
- Erişim yok kartı: NoAccessState "this schedule" (`SchedulePage.tsx:1894–1898`).
- Okuma hatası: hafta oklarıyla birlikte "Schedule unavailable" / "This week's schedule could not be loaded. Try again." + Retry (`SchedulePage.tsx:1899–1934`).
- Kaydedilmemiş değişiklikle sayfadan çıkış: tarayıcı "beforeunload" uyarısı (`SchedulePage.tsx:756–761`).

**B. Üst çubuk — tarih ve görünüm** (`components/ScheduleTopBar.tsx`)
- Previous week / Previous day oku (`ScheduleTopBar.tsx:445–458`).
- Takvim düğmesi "Open schedule calendar" (`ScheduleTopBar.tsx:461–477`).
- Dönem etiketi düğmesi (ör. "Oct 12 – 18"; title "Jump to this week / Jump to today / Switch to daily|weekly view"), bu hafta değilse dönüş işareti `data-return-cue` (`ScheduleTopBar.tsx:479–491`, `:160–164`).
- Next week / Next day oku (`ScheduleTopBar.tsx:495–508`).
- Takvim paneli "Schedule calendar" → MiniCalendar: ay/yıl gezinme (Previous/Next month|year|years, Pick month, Pick year), hafta satırı "Jump to week of …", gün hücresi (bugün işareti, seçili gün, işaret noktası: kapalı gün / önemli gün), klavye okları, PageUp/Down, Enter, Escape (`ScheduleTopBar.tsx:241–266`, `components/MiniCalendar.tsx:238–478`).
- Gün görünümü (`?view=day`) ve hafta görünümü (`?view=week`) (`SchedulePage.tsx:277`, `:775–791`).

**C. Üst çubuk — Settings menüsü** (`ScheduleTopBar.tsx:274–316`, `:536–701`)
- "Settings" düğmesi ve paneli.
- Sort Employees by: "A-Z", "Job/Position" (radyo) (`:587–599`).
- Shift Badge Settings: "Hide/Show Shift type in badges", "Labels in badges", "Clock in/out in badges", "Preset badges" (yalnız Job/Position'da etkin) (`:601–628`).
- Schedule Grid Settings: "Total hours", "Role Separators" (yalnız Job/Position), "Unassigned Shifts Row", "Freeze/Unfreeze Unassigned Shifts Row" (bu ikisi yalnız düzenlemede etkin), "Use default times for scheduling" (`:630–684`).
- Availability: "Hide/Show Availability" (yalnız düzenlemede etkin) (`:685–698`).
- Ayarlar tarayıcıda hatırlanır (`store/scheduleUiStore.ts`, `SchedulePage.tsx:529–553`).

**D. Üst çubuk — filtreler** (`ScheduleTopBar.tsx:317–404`, `components/ScheduleTopBarFilter.tsx`)
- "Hide Unscheduled / Show Unscheduled" düğmesi (`ScheduleTopBar.tsx:317–329`).
- Lokasyon filtresi "All locations - Separate|Merged" + içinde "Merge locations" anahtarı (`:330–353`, `:513–534`).
- Vardiya türü filtresi "All shifts" (`:354–371`).
- İş filtresi "All jobs", departman grupları + "No department" (`:372–386`, `:765–800`).
- Çalışan filtresi "All employees" (`:387–403`).
- Filtre menüsünün ortak gövdesi: başlık + "All selected / N of M selected", "All …" onay kutusu, liste, alt satır "N locations" + "Esc to close" (`ScheduleTopBarFilter.tsx:186–275`). Arama kutusu "Search …" / "No matching …" kodda var ama hiçbir filtre `searchable` açmıyor (`ScheduleTopBarFilter.tsx:228–235`).
- Etkin filtre şeridi "Active schedule filters": her filtre için "Remove … filter …" çipi (`components/ScheduleFilterCommandStrip.tsx:111–152`, `SchedulePage.tsx:2630`).

**E. Üst çubuk — eylem düğmeleri** (`SchedulePage.tsx:2319–2528`)
- Üst çubukta ayrı "Export" ve "Templates" düğmesi yok (main 8e0482bc): ikisi de New Schedule penceresinin sekmesi (F).
- "Draft selector: <ad>" düğmesi (adı "New Schedule" ya da ekrandaki taslağın adı) New Schedule penceresini açar; `schedule.edit`, şablon okuma ya da `schedule.export` olan herkese görünür (`SchedulePage.tsx` `<NewScheduleWindow>`).
- Düzenlemede "Publish" (yayınlayabilen) ya da "Save draft" (yayınlayamayan) düğmesi → Save draft menüsü (`:2409–2455`).
- Önizlemede, yayında hafta varsa "Published" düğmesi + menü: "Publish another draft", "Unpublish schedule" (kırmızı) (`:2457–2496`).
- Önizlemede yayın yoksa ve taslak açık değilse pasif "Publish" + ipucu: "Open a saved draft from New Schedule before publishing this week." / "Save a named draft before publishing this week." (`:2497–2514`).
- Önizlemede taslak açıkken "Publish" (`:2515–2524`); taslak yoksa satır hatası "Save a named draft before publishing this week." (`:946–948`).
- Düğme rengi yayın durumuna göre `data-publication-tone` (`lib/scheduleFilterModel.ts` `getSchedulePublicationActionTone`).

**F. New Schedule penceresi** (`components/NewScheduleWindow.tsx`; Mert 2026-10-12 tasarım B; main 8e0482bc)
- Düğmeye bağlı açılır pencere "Schedules for <hafta>": sekmeler "Schedules N", "Templates N", "Export" (yalnız izinli olanlar), sağ üstte tek yeşil düğme (Schedules'ta "Blank schedule" / "Starting…", Templates'te "Save template"; sabit 138 px, sekme değişince yerinde kalır; düzenleme açıkken yok), "Close" (×). Escape kapatır; şablon satır menüsü açıksa önce menüyü kapatır. Export sekmesinde pencere 980 px.
- Schedules sekmesi: önce canlı program ("Live · published by <ad>, <ne zaman>", "On screen" çipi), sonra taslaklar ("Draft · saved by <ad>, <ne zaman>"); her satırda "N shifts" ve "N h" (ödenen saat; müdürde yalnız kendi lokasyonları), kalem "Edit <ad>" / "Edit live schedule", canlıda geri ok "Unpublish schedule", taslakta iki tık "Delete <ad>". Satıra tıklamak programı ızgarada gösterir ("View <ad>" / "View published schedule").
- Boş: "No schedules for this week yet. Start a blank one or use a template."; geçmiş hafta: "Past week: you can view it, not edit it." (Blank ve kalem yok).
- Düzenleme açıkken: "You are editing <ad>. Publish, save or discard it before you start or edit another schedule." (başka satır açılmaz, Delete yok).
- `/app/schedule/export` ve `/app/schedule/templates` pencereyi o sekmede açar (ziyaret başına bir kez); telefonda Export açılmaz.

**G. Uyarı ve durum satırları**
- Taslak vardiyaları okunamadı: "This draft's shifts could not be loaded." + Retry (`SchedulePage.tsx:2631–2641`).
- İşlem hatası şeridi (role=alert): metin + gerekiyorsa "Reload" + "Dismiss error" (×) (`SchedulePage.tsx:2642–2661`). Metinleri: "Drafts could not be loaded. Try again.", "Start editing this schedule before auto-fill.", "You do not have permission to export schedules.", "Discard cleanup failed…", "<ad> is owned by …", "This draft is no longer available to you.", "Your edit ended while you were away…", "Your edit could not be reconnected…", "You can no longer edit this schedule, so your edit closed.", "This schedule changed in another tab or window…", "This page is out of date. Reload it, then press Undo again.", "This step can no longer be undone.", "Schedule unpublished, but this page could not refresh…", auto-fill reddi (`lib/autoFillText.ts`) (`SchedulePage.tsx:890`, `:1000`, `:1015`, `:1220`, `:1288`, `:1628–1633`, `:3350`; `hooks/useScheduleEditSession.ts:21–24`, `:150`; `lib/scheduleEditErrorText.ts:7–14`).
- Başka bakanlar: "N other viewer(s)" + "Someone is editing this schedule" / "Viewing this schedule" (`SchedulePage.tsx:2662–2675`).
- Yapıştırma durumu "Paste status": "Paste mode on/off", "Shift copied", engel gerekçesi (`SchedulePage.tsx:2886–2896`).
- Toast'lar: "Your changes were saved as a draft", "Unsaved changes were saved as a separate draft", "Draft deleted", "Schedule change could not be saved", "Shift copied", "Select one shift to copy", "Copy a shift first", "Paste mode on/off", "Last edit can't come back", "Last edit undone", "Last edit could not be undone", "Shift could not be restored", "Shift restored", "Paste blocked", "Shift(s) pasted", "Preset shift is unavailable" + "Preset shift context", "Preset shift type not found", "Shift saved with a warning(s)", "Shift change could not be completed" (`SchedulePage.tsx:313–3477`, `hooks/useScheduleDropReview.ts:123–139`).

**H. Düzenleme çubuğu** (`SchedulePage.tsx:2676–2730`, yalnız düzenlemede)
- "Delete N" (seçim varken, kırmızı) → "Delete selected shifts?" penceresi.
- "Undo" (geri alınacak adım yoksa pasif).
- "Paste mode on/off" (pano doluyken).
- "Availability on/off".
- "Auto-fill".
- "Review default hours".
- "Discard" / boşaltılırken pasif.

**I. Izgara — başlıklar** (`components/ScheduleGrid.tsx`, `ScheduleGridShell.tsx`, `ScheduleGridHeaders.tsx`)
- Izgara "Weekly|Daily published|editable schedule" (`ScheduleGridShell.tsx:290–300`).
- Logo çerçevesi; owner/admin için tıklanır "Manage schedule logo" (`ScheduleGridHeaders.tsx:55–68`, `ScheduleLogoFrame.tsx:78`, `SchedulePage.tsx:2764–2768`).
- Lokasyon başlığı (tıklayınca o lokasyona süzer; birleşik görünümde lokasyon adları ayrı düğme) + durum noktası: "Published - Live" / "Unpublished" / "Deadline approaching…" / "Schedule week is underway…" (`ScheduleLocationHeader.tsx:40–145`).
- Gün başlığı "View <gün>": bugün, seçili gün, kilit "Closed: <neden>", takvim simgesi "Important: <tür>: <ad>", "⊘N" "Closed for N shift types" (`DayHeaderCell.tsx:30–117`, `ScheduleDayHeaderCells.tsx:50–78`).
- "Total hours" sütun başlığı (Total hours açıkken) (`ScheduleGridHeaders.tsx:86`).
- Lokasyon filtresi hiçbir şey bırakmazsa: "No locations match" / "Clear the location filter to restore the schedule grid." (`ScheduleGrid.tsx:400–405`).
- Yatay kaydırma çubuğu "Schedule horizontal navigation" / "Scroll schedule horizontally" (klavye okları, Home/End, PageUp/Down) (`ScheduleGridShell.tsx:555–590`).

**J. Izgara — satırlar ve hücreler** (`ScheduleGridBody.tsx`, `ScheduleRow.tsx`, `ScheduleEmployeeCard.tsx`)
- Çalışan adı düğmesi → çalışan çekmecesi (EmployeeDrawer, Profile bölümü; yalnız `employee.read`) (`ScheduleEmployeeCard.tsx:59–75`, `SchedulePage.tsx:2769–2777`, `:3362–3374`).
- Ad yanında turuncu "!" (bu hafta müsait olmadığı günler; yalnız düzenlemede ve Availability açıkken; yayındaki kartın "!"i buraya taşınır, pencerede o günün altında "Changed after publishing") → küçük pencere (`ScheduleEmployeeCard.tsx:76–82`, `AvailabilityMarkButton.tsx:100–178`, `ScheduleGrid.tsx:182`).
- "Unassigned" satırı + "N open shift(s)"; dondurulmuş (frozen) hali; aynı açık vardiyalar yığın "xN" (`ScheduleEmployeeCard.tsx:83–88`, `ScheduleRow.tsx:269–275`, `:548–586`).
- Job/Position sıralamasında rol ayırıcı satırı (iş adı) ya da preset satırı: her gün için "<Tür>-<İş>" preset çipi (tıkla/sürükle; varsayılan saati yoksa saatsiz) (`ScheduleGridBody.tsx:255–282`, `SchedulePresetRows.tsx:120–200`).
- Hücre: düzenlemede "Add shift for <kişi> at <lokasyon> on <tarih>" (+ "Add shift" yazısı; dolu hücrede "add another") (`ScheduleRow.tsx:479–496`).
- Tam gün izinli hücre: kırmızı zemin, "TIME OFF" yazısı, Add shift yok; sürüklerken kırmızı çerçeve ve kartta "Time off" etiketi (yazı yok) (`ScheduleRow.tsx:280–281`, `styles.css:6030–6065`).
- Kısmi izin: kırmızı zemin, Add shift var.
- Müsait olmayan boş hücrede köşe "!" "<kişi>: unavailable on <gün>" (`ScheduleRow.tsx:498–504`).
- Kapalı gün hücresi: izinli gün gibi pembe; başlıkta kilit ve "Closed · <ad>" (title = kapanış adı) (`ScheduleRow.tsx:300–310`, `:360–363`).
- Çakışan vardiya hücresi `data-overlap` (`ScheduleRow.tsx:276`, `:362`).
- Sürükleme hedefi durumu: allowed / warning / blocked (`ScheduleRow.tsx:365–372`, `hooks/useScheduleGridDragControllers.ts:34–36`).
- Satır toplamı "<kişi> total hours …" ve toplam satırı (gün başına ve hafta) ("Includes reference estimates.") (`ScheduleRow.tsx:509–537`, `ScheduleTotalsRow.tsx:59–86`).
- Dolgu satırları; hiç çalışan yoksa ekran okuyucuya "No employees" (`ScheduleGridBody.tsx:284–290`, `ScheduleFillerRow.tsx`).

**K. Vardiya kartı ve rozetleri** (`components/ShiftCard.tsx`)
- Başlık "<Tür>-<İş>" (tür gizliyse yalnız iş), lokasyon adı (birleşik görünümde), etiketler, saat "h:mm AM - h:mm PM" + gece yarısını geçerse "+1" (`ShiftCard.tsx:113–119`, `:356–385`).
- Yazı iki kenara göre ortalı, her satır tek satır (sığmazsa üç nokta); üst işaretler ilk satırla aynı hizada (main 9b871a97).
- Düzenlemede yayındaki kart: sağ üstte yeşil nokta + LIVE ("Live - published to employees").
- Sağ altta yeşil NEW: yayınlanmamış yeni kart ("Not published yet - goes live on next publish") ya da değiştirilen canlı kart ("Edited - updates the live shift on next publish"); şerit ve kalem yok.
- Kaldırılacak canlı kart: soluk gri, üstü çizili, simge yok.
- Turuncu "!" "<kişi>: unavailable during this shift" + pencere (yalnız yayınlanmamış kartta; yayındaki kartın "!"i ad hücresine taşınır).
- Yönetici notu: sol üstte ince lacivert ataş; üzerine gelince "Manager note" kartı (`ShiftNoteCorner.tsx`).
- Kaydederken sağ üstte dönen işaret; uzun sürünce amber ("Still saving. Wait for the result before trying again."); altta Saving şeridi yok.
- Seçim halkası (tek / çoklu seçili, odaklı) (`:302–310`).
- Yığın sayısı "xN" (`:351–355`).
- Hayalet kart (başka lokasyondaki vardiyası, "also scheduled at <lokasyon>"; tıklanmaz) (`ShiftCard.tsx:400–490`, `hooks/useCellState.ts:84–125`).

**L. Izgara etkileşimleri**
- Önizlemede karta tıklama → o türe ve işe süzme + odak (`SchedulePage.tsx:810–822`, `ShiftCard.tsx:255–258`); boş yere tıklama süzmeyi temizler (`:837–849`).
- Düzenlemede tek tık odak (gecikmeli), Ctrl/Shift+tık çoklu seçim, çift tık / Enter düzenle, Ctrl+C kopyala (`ShiftCard.tsx:226–293`).
- Klavye: Escape bir katman kapatır, Ctrl+A görünenleri seç, Delete seçileni sil (sorar), Ctrl+Z geri al, Ctrl+V yapıştırma modunu aç/kapa, Ctrl+C kopyala (`SchedulePage.tsx:1714–1813`).
- Boş hücreye çift tık → yeni vardiya (`ScheduleRow.tsx:415–422`).
- Sürükle-bırak taşıma; Ctrl/Cmd/Shift ile kopyalayarak taşıma; çoklu seçimi birlikte sürükleme; preset çipini hücreye sürükleme (`hooks/useSingleShiftPointerDrag.ts:216`, `:287`, `useScheduleGridDragControllers.ts:200`, `useShiftTypePresetPointerDrag.ts`).
- Gün başlığına tık → o günün gün görünümü (`SchedulePage.tsx:2876–2879`); lokasyon başlığına tık → lokasyon süzgeci (`:2880–2884`).

**M. Sağ tık menüleri** (`components/ScheduleContextMenu.tsx`, yalnız düzenlemede)
- Vardiya menüsü "Shift actions": "Edit shift", "Copy shift", "Delete shift" (yeni vardiya) / "Unpublish shift" (yayındaki) / "Restore shift" (kaldırılmak üzere işaretli) (`:80–145`).
- Hücre menüsü "Cell actions": "Paste shift" + (Job/Position + rol ayırıcı + preset açıkken) vardiya türü preset'leri (`:181–200`, `SchedulePage.tsx:2252–2258`).

**N. Vardiya ekle / düzenle penceresi** (`components/ShiftQuickEditor.tsx`, yüzen pencere, başlıktan sürüklenir)
- Başlık "Add shift" / "Edit shift" ("Paste shift" kodda var, sayfa bu modu hiç açmıyor) + "Close editor" (`:324–329`, `:736–746`).
- Employee seçici (yalnız Unassigned satırından açılınca; "Unassigned" + uygun kişiler) (`:757–779`).
- Shift type düğmeleri / "No shift types" (`:780–817`).
- Job seçici + "No employees qualified for this job." (`:818–832`).
- Labels çoklu seçici ("No labels") (`:833–848`, `:188–260`).
- Count adımlayıcı ("Decrease count", "Shift count", "Increase count"; yalnız açık vardiya eklerken) (`:849–880`).
- "Time and break": Start / End saat girişi (12h/24h, otomatik ilerleme, End'de Enter kaydeder) + hata "Enter start and end time." / aynı saat iletisi (`:882–957`, `components/TimeInput.tsx`).
- "Unpaid break" seçenekleri (`:958–974`).
- "Show times on badge" onay kutusu (`:975–987`).
- "Note" + "N characters left" / "Notes go on one shift at a time." (count>1'de kapalı) (`:989–1024`).
- Eylemler: "Delete" iki tık ("Confirm delete"; yalnız düzenlemede), "Cancel", kaydet "Add shift" / "Add N shifts" / "Save" / "Checking availability…" (düzenlemede değişiklik yoksa pasif) (`:1025–1066`).
- Bayat hali: "Shift changed" — "This shift was changed by someone else. Reload…" + "Close & reload" (`:665–716`).
- Toast'lar: "Enter a valid shift time", "Availability could not be checked", "Shift saved with a warning", "Review shift" / "Shift conflict" (`:485–548`, `:1144–1165`).

**O. Çakışma ve kural pencereleri**
- Kural kutusu (ScheduleConflictSheet): başlık "Scheduling rule", "Shift conflict" iletileri; uyarı ise düzenleyicide satır içi ileti (ör. "The assignment overlaps unavailable hours.") ve "Add shift", sürükleme ya da yapıştırma incelemesinde "Schedule this shift anyway?" + "Place shift"; engel ise "Resolve this conflict before saving." / "This assignment cannot be saved." ve yalnız "Cancel" (`ScheduleConflictSheet.tsx:10–130`, `ShiftQuickEditor.tsx:1069–1092`).
- Yapıştırma engeli: "This paste was not applied. Review the reason before scheduling the shift." + bağlam satırı (`SchedulePage.tsx:3096–3109`).
- Sürükle/preset sonrası inceleme: uyarı "Place shift" ya da engel "Resolve this conflict before changing the shift." (`SchedulePage.tsx:3121–3130`, `hooks/useScheduleDropReview.ts`).
- Müdür notu kartı "Manager note for <kişi>": not metni ya da "A manager noted these hours for …", "Cancel" / "Place shift" (`ScheduleNoteConfirm.tsx:82–99`, `SchedulePage.tsx:3110–3120`, `ShiftQuickEditor.tsx:1093–1104`).

**P. Düzenleme oturumu pencereleri**
- Kilit: "Draft is being edited" — "Only one person edits a draft at a time.", "<kişi> is editing …", "Last activity …", "View schedule" / "Try again" (`ScheduleEditLockedDialog.tsx:18–80`, `SchedulePage.tsx:2975–2989`).
- Boşta kalma: "Keep editing?" — "Time left N seconds", "No activity for 15 minutes.", "When time runs out…", "SAVE" / "CONTINUE", ilerleme çubuğu (`ScheduleEditTimeoutDialog.tsx:40–80`, `hooks/useEditIdleTimer.ts:3–5`).
- Discard onayı: "Discard unsaved changes?" + "Keep editing" / "Discard" ("Discarding...") (`SchedulePage.tsx:3548–3604`); kaydedilmemiş bir şey yoksa sormadan çıkar (`:1225–1235`).
- Seçili vardiyaları silme: "Delete selected shifts?" + "Keep shifts" / "Delete" (Enter "Keep shifts"e gider) (`ScheduleDeleteSelectionDialog.tsx:21–80`).
- Geçmişe dokunan kayıt: "This changes shifts that already ran" (onaylanır) / "These changes cannot be saved" (geçmiş hafta) + liste "Already started" / "Past week" (`RetroactiveEditDialog.tsx:5–72`).

**Q. Taslak kaydetme**
- Save draft menüsü (Publish/Save draft düğmesinin altında, "Save draft"): "Draft name" (en çok 80), uyarılar "The live schedule name is reserved…", "A draft with this name already exists…", "This name matches the current draft…"; "Save", "Save As", "Save and publish" ("Saving..." / "Publishing..."); yayın satırı (Published çipi); "Saved drafts" satırları ve iki tık "Overwrite <ad>"; "No saved drafts for this week."; "Close". Yayından açılan çalışma kopyasında önerilen ad "<ad> vrs.0.N" (`components/SaveDraftMenu.tsx:52–392`).
- Save draft penceresi (boşta kalma "SAVE"dan): "Destination" (New draft / Overwrite <ad>), "Draft name", "This replaces revision N of …", "Cancel", "Save draft" ya da iki tık "Overwrite draft" / "Confirm overwrite" (`components/SaveDraftDialog.tsx:20–100`, `SchedulePage.tsx:3183–3209`).
- Başkasının taslağının üzerine yazma onayı: "Overwrite "<ad>"?" — "This draft belongs to …" + "Overwrite" (kırmızı) (`SchedulePage.tsx:1272–1290`, `shell/ConfirmDialog.tsx`).
- Kayıt hatası kurtarma: "Schedule save failed" — "Your changes are still here…", "Your edit session is still open…", "Keep editing", iki tık "Discard" / "Confirm discard", "Retry save" ("Saving...") (`ScheduleSaveRecoverySheet.tsx:90–149`).
- Kurtarma içinde onaylı vardiya değişimi: "Checking for approved shift changes…", "An approved shift change needs review", eski/yeni satırlar ("Removed", "Approved: …"), "Use approved assignments" / "Updating assignments…" (`employee-hub/shift-exchanges/ExchangeScheduleRecovery.tsx:45–161`); başarı toast'ı "Approved assignments restored" (`SchedulePage.tsx:3151–3154`).

**R. Yayınla (Publish) penceresi** (`components/PublishScheduleDialog.tsx`, 3 adım)
- Adım çubuğu "Locations · Pre-flight · Notify" ve özet satırı (taslak adı, N location, N shift, N people affected) (`:534–571`).
- Adım 1 "Select locations to publish": "Saved draft" seçici ya da "Save a named draft before publishing this week."; bayat bildirimi; "Loading publish preview"; "Publish preview could not be loaded." + Retry; "Departments to publish" (+ "No department", "Select at least one department to publish."); "Locations to publish" satırı: canlılık çipi ("Live · N shifts" / "Published now" / "Not published yet"), "N new / N updated / N removed / No changes to publish", "The only live shift… / All N live shifts… will be removed.", "<kişi> published|unpublished this location on …"; "Refreshing selected locations"; "Schedule conflicts must be fixed before publishing" + satırlar + "Review document"; alt satır "N of M locations selected" / "N conflicts must be fixed"; "Next" / "Checking…" (`:572–763`, `:884–966`).
- Adım 2 "Pre-flight check" (PublishPreflightPanel): özet "Ready to publish" / sayım cümlesi + açıklama ("No blockers. One thing to glance at below.", "Review the findings below…", "The schedule changed while this dialog was open…", "A finding here cannot be overridden…"); gruplar "Must be fixed in the schedule" ("Past schedule weeks cannot be published."), "Warnings to review", "Current schedule conflicts", uygunluk katlaması (N kişi; "Show shift"), "Previously accepted (N)", "Risks", "Notes and already-live issues"; lokasyon farkı "Added / Updated / Removed / Unchanged", "N shifts after publish"; "Back", "Next" (`components/PublishPreflightPanel.tsx:15–390`, `PublishScheduleDialog.tsx:764–812`).
- "Show shift" → pencere kapanır, taslak düzenlemede açılır, vardiyaya odaklanır; hata "Save or close your current draft before opening another draft." / "This draft could not be opened for editing…" / "The shift could not be opened. Try again." (`SchedulePage.tsx:3290–3307`, `PublishScheduleDialog.tsx:775–785`).
- Adım 3 "Notify employees": "N of M selected", "Only employees with schedule changes are listed.", "Select all" / "Clear all", 15+ kişide "Search employees", kişi onay kutuları / "No affected employees."; alt satır "N of M employees will be notified"; "Publish N location(s)" / "Publishing…" (`:813–877`, `:929–942`).
- Yayın sırasında: "Schedule conflicts updated" / "Schedule warnings cleared" toast'ı ve yeniden deneme; bayat taban → adım 1'e dönüş + "The published schedule changed while this dialog was open…"; çakışma listesi; diğer hata metni (`:439–531`, `lib/schedulePublishRecovery.ts:211–245`).
- Başarı toast'ı "Schedule published": "N locations, N changes, N employees notified." / "N locations and N changes published." / bildirim uyarısı (`SchedulePage.tsx:3255–3283`).
- "Review document" → çalışan çekmecesi Documents bölümü (`SchedulePage.tsx:3285–3289`).

**S. Yayından kaldır (Unpublish)** (`components/UnpublishScheduleDialog.tsx`)
- "Live access" / "Unpublish schedule", hafta kartı "Week … Current live schedule"; canlı lokasyon onay kutuları "N live shifts will be removed"; dört etki satırı ("Employees stop seeing these shifts right away.", "Active cover and swap requests… will be closed.", "No schedule-change notification is sent.", "Publish again to bring these shifts back."); hata satırı; "Cancel", iki tık "Unpublish N locations" / "Confirm unpublish" (`:100–210`).
- Başarı toast'ı "Schedule unpublished" "N locations unpublished."; geçmiş hafta "Past schedule weeks cannot be unpublished." (`SchedulePage.tsx:3318–3359`).

**T. New Schedule penceresi · Templates sekmesi** (`components/NewScheduleTemplates.tsx`; ayrıntı 3.2)
- Liste: şablon adı, "N shifts · N open · saved by <ad>, <ne zaman>", "Use", "More for <ad>" menüsü (Rename, iki tık Delete "Click again to delete"). Yalnız okuyabilen rolde Use, menü ve "Save template" yok.
- Liste yüklenemezse sekmede hata cümlesi ve "Retry".
- "Save template" (yeşil; bu haftada taslak yoksa pasif, "Save a draft first."): "Save a draft as a template" formu: "Draft" (ekrandaki taslak önce), "Template name", çalışan adlarını çıkarma kutusu, "Cancel", "Save template" / "Saving…".
- Use, düzenleme yokken: "Which schedule should it go into?" (canlı program "Live", ekrandaki "On screen", taslaklar, "New blank draft"), "Open for editing" → düzenleme açılır, pencere Add/Replace adımına döner.
- Use, düzenleme açıkken: "<ad>: N shifts, N open. It goes into the schedule you are editing…", "Only some departments" (onay kutuları; "Select at least one department to apply."), dolu programda "This schedule already has shifts…", "Replace current shifts" → "N shifts will be removed. Draft only, not published." → "Confirm replace"; "Add to current shifts" / "Apply template"; "All templates" geri.
- Toast'lar: "Template saved", "Template renamed", "Template deleted", "Template could not be deleted", "Template applied" (arşiv etiketi atlanınca uyarı tonunda), "Template could not be applied" (`SchedulePage.tsx` `templatesTab`).

**U. Auto-fill, varsayılan saatler, logo**
- "Review auto-fill": "N open shifts have eligible candidates…", her açık vardiya için "Assignment for …" seçici ("Leave open" / "<kişi> · N.Nh scheduled") + gerekçe etiketleri ("Fewest scheduled hours", "Primary job", "Available") + "Reject"/"Rejected"; "No eligible auto-fill proposals…"; "Open shift not filled: …"; sonuç "Applied N shifts. N rejected by the server: …"; "Cancel", "Apply N …" / "Applying…" (`AutoFillReviewOverlay.tsx:73–190`).
- "Review current default hours": "Choose dates and shifts" (From, Through, Shift type, vardiya onay kutuları), "No saved reference-hour shifts in this range.", "Review N shifts" / "Reviewing…", karşılaştırma ("Saved reference hours", "Current defaults", "Availability before/after", "Overlapping assignments"), "This review is out of date…", "Apply N changes to edit session" / "Confirm conflicts and apply…" / "Applying…"; hatalar "Review unavailable" / "Unable to apply defaults" (`DefaultHoursReviewDialog.tsx:49–129`).
- Logo penceresi: "Upload schedule logo file", "Upload/Replace", "Remove", Scale / Horizontal / Vertical kaydırıcıları, "Reset", "Save"/"Saving"; hatalar "Use an SVG, PNG, JPEG, or WebP image.", "The selected image is empty.", "Logo must be 5 MB or smaller.", "Logo could not be saved." (`ScheduleLogoUploadDialog.tsx:100–345`, `SchedulePage.tsx:2529–2542`).

**V. Çalışan çekmecesi (Schedule'dan açılan)** — EmployeeDrawer'ın kendisi Employees envanterinde; burada yalnız açılış kapısı (`employee.read`) ve Documents'a düşen yol (`SchedulePage.tsx:3362–3374`).

### Senaryolar

**A. Kapı ve sayfa durumları**
- [❌ EKSİK] Telefonda Schedule kapalı ("Schedule is available on a computer.") · rol: owner · nasıl: /app/schedule, 390 genişlik · mock: var (yalnız görüntü genişliği)
- [❌ EKSİK] Employee Schedule'a girince kendi ana sayfasına atılır · rol: employee · nasıl: /app/schedule · mock: var (pages.ts schedule sayfası employee rolünü listelemiyor; rol eklenmeli)
- [❌ EKSİK] Yükleniyor ekranı · rol: owner · nasıl: /app/schedule ilk açılış · mock: eksik: okumayı birkaç saniye geciktiren bir setup gerekir
- [❌ EKSİK] Hafta okunamadı (Schedule unavailable + Retry, oklar çalışır) · rol: owner · nasıl: /app/schedule · mock: eksik: /schedule/reference için 500 dönen setup gerekir
- [✅ no-access] Erişim yok kartı (no-access) · rol: manager · nasıl: /app/schedule · mock: eksik: /schedule/reference için 403 authz.* dönen setup gerekir
- [❌ EKSİK] Kaydedilmemiş değişiklikle sekmeyi kapatma uyarısı · rol: owner · nasıl: düzenlemede vardiya ekle → sayfayı kapat · mock: var (tarayıcı diyaloğu; görüntülenemez, testte ölçülür)

**B. Tarih ve görünüm**
- [✅ owner] Bu hafta, haftalık önizleme (yayında) · rol: owner · nasıl: /app/schedule · mock: var
- [✅ manager] Müdür görünümü · rol: manager · nasıl: /app/schedule · mock: eksik: mock müdüre de iki lokasyonu gösteriyor; okuma Downtown'a daraltılmalı, Uptown vardiyaları ghost_shifts olarak gelmeli
- [✅ next] Sonraki hafta · rol: owner · nasıl: Next week · mock: var
- [❌ EKSİK] Önceki hafta (geçmiş hafta, salt okunur önizleme) · rol: owner · nasıl: Previous week · mock: var
- [❌ EKSİK] Bu hafta olmayan dönemde dönüş işareti ve "Jump to this week" · rol: owner · nasıl: Next week → dönem etiketi · mock: var
- [❌ EKSİK] Gün görünümü (bugün) · rol: owner · nasıl: dönem etiketi (bu haftadayken) → Switch to daily view · mock: var
- [❌ EKSİK] Gün başlığına tıklayıp o günün gün görünümü · rol: owner · nasıl: "View Wed …" gün başlığı · mock: var
- [❌ EKSİK] Gün görünümünde Previous day / Next day · rol: owner · nasıl: ?view=day → oklar · mock: var
- [✅ calendar] Takvim açık, seçili hafta vurgulu · rol: owner · nasıl: Open schedule calendar · mock: var
- [❌ EKSİK] Takvimde önemli gün / kapalı gün işaretleri (Halloween, Christmas Day) · rol: owner · nasıl: takvim → Next month (Ekim/Aralık) · mock: var
- [❌ EKSİK] Takvimde ay/yıl seçici (Pick month, Pick year) · rol: owner · nasıl: takvim → ay adı · mock: var
- [❌ EKSİK] Takvimde "Jump to week of …" ile hafta atlama · rol: owner · nasıl: takvim → hafta satırı başı · mock: var

**C. Settings menüsü**
- [✅ settings] Görünüm ayarları paneli açık · rol: owner · nasıl: Settings · mock: var
- [❌ EKSİK] Job/Position sıralaması: rol ayırıcı ve preset satırları · rol: owner · nasıl: Settings → Job/Position · mock: var
- [❌ EKSİK] Kart ayarları kapalı: tür / etiket / saat gizli rozetler · rol: owner · nasıl: Settings → Hide Shift type, Hide Labels, Hide Clock in/out · mock: var
- [❌ EKSİK] Total hours açık: satır toplamları ve toplam satırı · rol: owner · nasıl: Settings → Show Total hours · mock: var
- [❌ EKSİK] Önizlemede Unassigned / Freeze / Availability ayarlarının pasif hali · rol: owner · nasıl: Settings (önizleme) · mock: var (settings senaryosunda görünür ama ayrı etiketlenmemiş)
- [❌ EKSİK] Düzenlemede Unassigned satırı gizli / dondurulmamış · rol: owner · nasıl: düzenle → Settings → Hide Unassigned Shifts Row / Unfreeze · mock: var
- [❌ EKSİK] "Use default times for scheduling" açık (preset'ten saatli vardiya) · rol: owner · nasıl: düzenle → Settings → Use default times → preset çipi · mock: var

**D. Filtreler**
- [✅ filter] Karta tıklayınca türe ve işe süzme (önizleme) + filtre çipleri · rol: owner · nasıl: bir vardiya kartına tık · mock: var
- [❌ EKSİK] Lokasyon filtresi menüsü açık (All locations, N of M selected) · rol: owner · nasıl: All locations - Separate · mock: var
- [❌ EKSİK] Tek lokasyona süzülmüş ızgara (Uptown) · rol: owner · nasıl: lokasyon filtresi → yalnız Uptown ya da lokasyon başlığına tık · mock: var
- [❌ EKSİK] Merge locations (birleşik görünüm; kartta lokasyon adı, başlıkta lokasyon düğmeleri) · rol: owner · nasıl: lokasyon filtresi → Merge locations · mock: var
- [❌ EKSİK] İş filtresi departman gruplarıyla · rol: owner · nasıl: All jobs · mock: var
- [❌ EKSİK] Vardiya türü filtresi · rol: owner · nasıl: All shifts · mock: var
- [❌ EKSİK] Çalışan filtresi · rol: owner · nasıl: All employees · mock: var
- [❌ EKSİK] Hide Unscheduled (vardiyasız kişiler gizli) · rol: owner · nasıl: Hide Unscheduled · mock: var
- [❌ EKSİK] Filtre çipini kaldırma / Escape ile katman katman temizleme · rol: owner · nasıl: süz → çipteki × ya da Escape · mock: var
- [❌ EKSİK] "No locations match" boş durumu · rol: owner · nasıl: ?locations=<geçersiz olmayan ama süzülmüş boş> (çalışan/iş süzgeciyle lokasyon kalmaması) · mock: var

**E. Eylem düğmeleri ve rol farkı**
- [❌ EKSİK] Yayında hafta: "Published" menüsü (Publish another draft, Unpublish schedule) · rol: owner · nasıl: Published · mock: var
- [❌ EKSİK] Yayın yokken ve taslak açık değilken pasif Publish ipucu · rol: owner · nasıl: Next week'ten sonraki hafta (yayınsız) → Publish üzerine gel · mock: var
- [❌ EKSİK] Taslak önizlemedeyken Publish düğmesi · rol: owner · nasıl: Next week → Draft selector → Next week plan → Publish · mock: var
- [❌ EKSİK] Salt okur özel rol: Export/Templates/New Schedule/Publish yok · rol: özel (yalnız schedule.read) · nasıl: /app/schedule · mock: eksik: viewer'a özel rol ve izin listesi seçeneği gerekir
- [❌ EKSİK] Düzenleyebilen ama yayınlayamayan rol: "Save draft" düğmesi, Publish yok · rol: özel (schedule.manage, schedule.publish yok) · nasıl: düzenle · mock: eksik: özel rol gerekir
- [❌ EKSİK] Admin görünümü · rol: admin · nasıl: /app/schedule · mock: eksik: viewer rolü olarak admin yok

**F. Taslak menüsü**
- [✅ drafts] Bu haftanın taslak menüsü (taslak yok, yayın satırı) · rol: owner · nasıl: Draft selector: New Schedule · mock: var
- [✅ past-draft] Geçmiş haftanın taslağı salt okunur (Read-only çipi ve notu, Blank schedule yok) · rol: owner · nasıl: Previous week → Draft selector · mock: var
- [❌ EKSİK] Kayıtlı taslaklı hafta: "Next week plan" satırı (Revision, Edit, Delete) · rol: owner · nasıl: Next week → Draft selector · mock: var
- [❌ EKSİK] Taslak önizleme ("Viewing" çipi, düğme adı taslak adı) · rol: owner · nasıl: Next week → Draft selector → View Next week plan · mock: var
- [❌ EKSİK] Yayındaki taslak satırı (Published çipi, lokasyon rozetleri, Unpublish simgesi, Delete pasif) · rol: owner · nasıl: taslağı yayınla → Draft selector · mock: var
- [❌ EKSİK] Taslağı silme iki tık (Delete? → Draft deleted toast) · rol: owner · nasıl: Next week → Draft selector → Delete Next week plan ×2 · mock: var
- [❌ EKSİK] Taslak silinemedi (başkası düzenliyor) · rol: owner · nasıl: düzenlenen taslağı başka sekmeden sil · mock: var (mock 409 schedule.draft_being_edited döner; iki sekme gerekir)
- [✅ template-from-window] Taslak ekrandayken Templates → Save template: ekrandaki taslak seçili · rol: owner · nasıl: Next week plan önizle → Draft selector → Templates → Save template · mock: var
- [❌ EKSİK] Taslak listesi yüklenemedi ("Drafts could not be loaded. Try again.") · rol: owner · nasıl: Blank schedule · mock: eksik: /schedule/drafts için 500 setup'ı gerekir
- [❌ EKSİK] Taslak vardiyaları yüklenemedi + Retry · rol: owner · nasıl: taslak önizle · mock: eksik: taslaklı /schedule/shifts için hata setup'ı gerekir
- [❌ EKSİK] Taslak artık erişilemez ("This draft is no longer available to you.") · rol: manager · nasıl: kapsam dışı taslağı düzenle · mock: eksik: müdür kapsamı mock'ta yok

**G. Düzenlemeye girme ve oturum**
- [✅ add] Boş taslakla düzenleme (Blank schedule) ve düzenleme çubuğu · rol: owner · nasıl: Draft selector → Blank schedule · mock: var
- [❌ EKSİK] Yayındaki haftayı düzenleme (Edit live schedule; kartlar canlı, Unassigned satırı) · rol: owner · nasıl: Draft selector → Edit live schedule · mock: var
- [❌ EKSİK] Kayıtlı taslağı düzenleme · rol: owner · nasıl: Next week → Draft selector → Edit Next week plan · mock: var
- [❌ EKSİK] Yalnız bir lokasyonu düzenleme (filtre açıkken düzenle → yalnız o lokasyon) · rol: owner · nasıl: lokasyon filtresi Downtown → Edit live schedule · mock: var
- [❌ EKSİK] Sayfa yenilenince düzenlemeye devam (?mode=edit) · rol: owner · nasıl: düzenlemede yenile · mock: var
- [❌ EKSİK] Düzenlerken başka haftaya geçip geri dönme · rol: owner · nasıl: düzenle → Next week → Previous week · mock: var
- [❌ EKSİK] Başkası düzenliyor kilidi ("Draft is being edited", View schedule / Try again) · rol: owner · nasıl: Edit … · mock: eksik: edit-lock/acquire "conflict" dönen setup gerekir
- [❌ EKSİK] Boşta kalma uyarısı (Keep editing? geri sayım, SAVE / CONTINUE) · rol: owner · nasıl: düzenlemede 15 dk hareketsiz · mock: eksik: süreyi kısaltan setup gerekir
- [❌ EKSİK] Süre doldu, değişiklikler "Auto-save" taslağı oldu (toast) · rol: owner · nasıl: uyarıyı beklet · mock: var (autosave ucu var; süre kısaltma gerekir)
- [❌ EKSİK] Kilit düştü, kurtarılan değişiklik ayrı taslak oldu ("Unsaved changes were saved as a separate draft") · rol: owner · nasıl: başka kaynakla düzenlemeye gir · mock: var (acquire_after_recovery dalı var)
- [❌ EKSİK] Düzenleme başka yerde kapandı / yeniden bağlanamadı (hata şeridi) · rol: owner · nasıl: düzenle → kayıt · mock: eksik: edit_session_closed / lease_expired setup'ı gerekir
- [❌ EKSİK] Başka sekmede değişmiş düzenleme ("This schedule changed in another tab…" + Reload) · rol: owner · nasıl: iki sekmede aynı düzenleme · mock: var (revision kontrolü var; iki sekme gerekir)
- [❌ EKSİK] Discard: değişiklik yoksa sormadan çıkış · rol: owner · nasıl: düzenle → Discard · mock: var
- [❌ EKSİK] Discard onayı (Discard unsaved changes?) · rol: owner · nasıl: vardiya ekle → Discard · mock: var
- [❌ EKSİK] Başka bakan / düzenleyen var bandı · rol: owner · nasıl: /app/schedule · mock: eksik: presence'a ikinci kişi ekleyen setup gerekir

**H–J. Izgara görünümü**
- [✅ owner] Lokasyon başlığı "Published - Live" noktası · rol: owner · nasıl: /app/schedule · mock: var
- [❌ EKSİK] Yayınlanmamış hafta "Unpublished" noktası · rol: owner · nasıl: Next week ×2 · mock: var
- [❌ EKSİK] Yayın son günü yaklaşıyor / hafta başladı uyarısı · rol: owner · nasıl: bu haftayı Unpublish et · mock: var
- [❌ EKSİK] Müdürde son gün uyarısı yok (yayınlayamayan) · rol: özel · nasıl: yayınsız hafta · mock: eksik: özel rol gerekir
- [✅ owner] Tam gün izin hücresi "TIME OFF" (Maria, Çar–Per) · rol: owner · nasıl: /app/schedule · mock: var
- [✅ time-off] Düzenlemede tam gün izinli hücrede Add shift yok · rol: owner · nasıl: Draft selector → Blank schedule · mock: var
- [❌ EKSİK] Kısmi izin hücresi (Noah, Per 15:00 sonrası) Add shift'le · rol: owner · nasıl: düzenle, Uptown satırı · mock: var
- [✅ drag-time-off] İzinli hücreye vardiya sürükleme: kırmızı çerçeve, kartta "Time off" · rol: owner · nasıl: düzenle → bir kartı Maria'nın Çarşamba hücresine sürükle · mock: var
- [❌ EKSİK] Kapalı gün (Kitchen deep clean): başlıkta kilit, hücreler kapalı · rol: owner · nasıl: Next week ×2 · mock: var
- [❌ EKSİK] Bazı vardiya türleri için kapalı gün "⊘N" · rol: owner · nasıl: — · mock: eksik: shift_type_ids dolu bir kapanış gerekir
- [✅ next] Önemli gün simgesi gün başlığında (Hartwell private buyout) · rol: owner · nasıl: Next week · mock: var
- [❌ EKSİK] Bugünün gün başlığı vurgusu · rol: owner · nasıl: /app/schedule · mock: var (owner senaryosunda görünür; ayrı etiketlenmemiş)
- [✅ owner] Hayalet kart: çok lokasyonlu kişinin öbür lokasyondaki vardiyası (Jake) · rol: owner · nasıl: /app/schedule · mock: var
- [❌ EKSİK] Müdürün kapsamı dışındaki lokasyondan gelen hayalet kart · rol: manager · nasıl: /app/schedule · mock: eksik: ghost_shifts boş; Uptown vardiyaları ghost_shifts olarak dönmeli
- [❌ EKSİK] Unassigned satırı ve "N open shifts" · rol: owner · nasıl: Edit live schedule · mock: var
- [❌ EKSİK] Unassigned yığını "xN" (aynı açık vardiyalar) · rol: owner · nasıl: düzenle → Unassigned'a Count 3 ile ekle · mock: var
- [❌ EKSİK] Kartta etiket, "+1" gece yarısı, saat gizli kart · rol: owner · nasıl: /app/schedule (Close vardiyası, Opener/Closer etiketleri) · mock: var
- [✅ note-card] Kartta yönetici notu ataşı ve not kartı · rol: owner · nasıl: ataşın üzerine gel (Carlos Rivera, Mon) · mock: var (setup schedule-card-variants)
- [❌ EKSİK] Uygunluk "!" (adda, boş hücrede, kartta) ve penceresi (Priya Pzt sabah, Aisha Cum akşam) · rol: owner · nasıl: Edit live schedule → "!" · mock: var
- [❌ EKSİK] Availability off: turuncu "!" gizli, kırmızı izin kalır · rol: owner · nasıl: düzenle → Availability on → off · mock: var
- [✅ changed-after] "Changed after publishing" satırı · rol: owner · nasıl: düzenle → Priya Patel'in adındaki "!" · mock: var (setup schedule-changed-after-publish)
- [✅ edit-live, edited, staged] Düzenlemede LIVE, NEW ve kaldırılacak kart · rol: owner · nasıl: Edit live schedule → vardiya değiştir / sağ tık Unpublish shift · mock: var
- [❌ EKSİK] Çakışan iki vardiya (overlap) hücre işareti · rol: owner · nasıl: düzenle → aynı kişiye aynı güne çakışan vardiya · mock: var
- [✅ saving] Kartta dönen kaydetme işareti · rol: owner · nasıl: sürükle-bırak, cevap bekletilir · mock: var (hold)
- [❌ EKSİK] Çalışan adına tık → çalışan çekmecesi · rol: owner · nasıl: Maria Lopez adı · mock: var
- [❌ EKSİK] Logo çerçevesi ve "Manage schedule logo" (yalnız owner/admin) · rol: owner · nasıl: ızgaranın sol üst köşesi · mock: var
- [❌ EKSİK] Müdürde logo tıklanmaz · rol: manager · nasıl: sol üst köşe · mock: var
- [❌ EKSİK] Hiç çalışan yok (yalnız dolgu satırları) · rol: owner · nasıl: — · mock: eksik: çalışansız bir workspace dünyası gerekir
- [❌ EKSİK] Çok sütunda yatay kaydırma çubuğu · rol: owner · nasıl: iki lokasyon, ayrı görünüm, dar ekran · mock: var

**L–M. Etkileşimler**
- [❌ EKSİK] Çoklu seçim (Ctrl+tık) ve "Delete N" · rol: owner · nasıl: düzenle → Ctrl+tık iki kart · mock: var
- [❌ EKSİK] Ctrl+A ile görünen vardiyaları seçme · rol: owner · nasıl: düzenle → ızgarada Ctrl+A · mock: var
- [❌ EKSİK] Seçileni silme onayı (Delete selected shifts?) ve sonucu · rol: owner · nasıl: seç → Delete tuşu → Delete · mock: var
- [❌ EKSİK] Kopyala → yapıştırma modu (Paste mode on, durum satırı) → hücreye yapıştır ("Shift pasted") · rol: owner · nasıl: kart → Ctrl+C → hücreye tık · mock: var
- [❌ EKSİK] Pano boşken yapıştırma ("Copy a shift first") · rol: owner · nasıl: düzenle → Ctrl+V · mock: var
- [❌ EKSİK] Birden çok seçiliyken kopyala ("Select one shift to copy") · rol: owner · nasıl: iki kart seç → Ctrl+C · mock: var
- [❌ EKSİK] Yapıştırma engellendi ("Paste blocked" + kural kutusu) · rol: owner · nasıl: kartı kopyala → Maria'nın izinli gününe yapıştır · mock: var
- [❌ EKSİK] Sürükle-bırak ile taşıma · rol: owner · nasıl: düzenle → kartı başka güne sürükle · mock: var
- [❌ EKSİK] Ctrl ile sürükleyip kopyalama · rol: owner · nasıl: Ctrl basılı sürükle · mock: var
- [❌ EKSİK] Uyarılı bırakma: kural kutusu "Schedule this shift anyway?" → Place shift · rol: owner · nasıl: kartı Priya'nın Pazartesi sabahına sürükle · mock: var
- [❌ EKSİK] Engelli bırakma: "Resolve this conflict before changing the shift." · rol: owner · nasıl: kartı izinli güne bırak · mock: var
- [❌ EKSİK] Müdür notu kartı ile bırakma ("Manager note for …") · rol: owner · nasıl: notlu saate bırak · mock: eksik: weekly_availability note_intervals/manager_notes dolu dönmeli
- [❌ EKSİK] Çoklu seçimi birlikte sürükleme · rol: owner · nasıl: iki kart seç → sürükle · mock: var
- [❌ EKSİK] Preset çipine tık / çipi hücreye sürükleme · rol: owner · nasıl: Job/Position → düzenle → "Dinner-Server" çipi · mock: var
- [❌ EKSİK] Preset kullanılamaz ("Preset shift is unavailable" + bağlam) · rol: owner · nasıl: preset'i uygun olmayan hücreye · mock: var
- [❌ EKSİK] Geri al (Undo, Ctrl+Z) → "Last edit undone" · rol: owner · nasıl: vardiya ekle → Undo · mock: var
- [❌ EKSİK] Geri alınamayan adım ("Last edit can't come back") · rol: owner · nasıl: vardiya sil → kişiye izin ver → Undo · mock: var (undo_refused dalı var)
- [❌ EKSİK] Geri al başarısız (sayfa eski / adım geri alınamaz) · rol: owner · nasıl: iki sekme → Undo · mock: var (iki sekme gerekir)
- [❌ EKSİK] Değişiklik kaydedilemedi toast'ı + hata şeridi · rol: owner · nasıl: düzenle → kural dışı değişiklik · mock: var (shift POST 400 dalları var)
- [❌ EKSİK] Vardiya sağ tık menüsü (yeni vardiya: Edit/Copy/Delete) · rol: owner · nasıl: düzenle → yeni karta sağ tık · mock: var
- [❌ EKSİK] Yayındaki vardiyada "Unpublish shift" · rol: owner · nasıl: Edit live schedule → karta sağ tık · mock: var
- [❌ EKSİK] Kaldırılacak vardiyada "Restore shift" → "Shift restored" · rol: owner · nasıl: Unpublish shift → tekrar sağ tık → Restore · mock: var
- [❌ EKSİK] Hücre sağ tık menüsü (Paste shift + preset'ler) · rol: owner · nasıl: düzenle → boş hücreye sağ tık · mock: var
- [❌ EKSİK] Escape ile katman katman kapatma (menü → seçim → filtre → bu hafta) · rol: owner · nasıl: Escape · mock: var

**N–O. Vardiya penceresi**
- [✅ add] Boş taslakta kişiye vardiya ekleme penceresi · rol: owner · nasıl: Add shift for Carlos Rivera · mock: var
- [❌ EKSİK] Unassigned'a ekleme: Employee seçici + Count adımlayıcı · rol: owner · nasıl: düzenle → Unassigned hücresinde Add shift · mock: var
- [❌ EKSİK] Count > 1: not kapalı, "Add N shifts" · rol: owner · nasıl: Unassigned → Count 3 · mock: var
- [❌ EKSİK] Kişiye uygun iş yok ("No employees qualified for this job.") · rol: owner · nasıl: Unassigned → Job seç · mock: var
- [❌ EKSİK] Vardiyayı düzenleme (Edit shift; değişiklik yoksa Save pasif) · rol: owner · nasıl: düzenle → karta çift tık · mock: var
- [❌ EKSİK] Saat hatası ("Enter start and end time." / aynı saat) · rol: owner · nasıl: End = Start · mock: var
- [❌ EKSİK] 24 saat biçimiyle saat girişi · rol: owner · nasıl: hesap tercihi 24h → pencere · mock: eksik: settings.time_format ve hesap tercihi 24h seçeneği gerekir
- [❌ EKSİK] Etiket seçici açık · rol: owner · nasıl: Labels · mock: var
- [❌ EKSİK] Not yazma ve "N characters left" · rol: owner · nasıl: Note · mock: var
- [✅ rule-warn] Uyarılı kayıt: düzenleyicide satır içi uyarı "The assignment overlaps unavailable hours." ve "Add shift" · rol: owner · nasıl: Priya'ya Pazartesi sabah vardiyası · mock: var
- [✅ new-mark-avail] Uygun olmayan saate Ctrl ile kopyalanan kartta "!" ve NEW yan yana · rol: owner · nasıl: düzenle → Aisha'nın Perşembe kartını Ctrl ile Cuma'ya sürükle → onayla · mock: var
- [❌ EKSİK] Engelli kayıt (onaylı izin): kural kutusu yalnız Cancel · rol: owner · nasıl: Maria'ya Çarşamba (kısmi izin saatinde) vardiya · mock: var
- [❌ EKSİK] Uyarıyla kaydedildi toast'ı ("Shift saved with a warning") · rol: owner · nasıl: warn politikalı çakışma · mock: eksik: assess warning_policy "warn" + "warning_requires_override" döndürmeli
- [❌ EKSİK] "Checking availability…" bekleme · rol: owner · nasıl: kaydet · mock: eksik: shift-assessment gecikmesi gerekir
- [❌ EKSİK] Uygunluk kontrol edilemedi toast'ı · rol: owner · nasıl: kaydet · mock: eksik: shift-assessment 500 setup'ı
- [❌ EKSİK] Bayat vardiya ("Shift changed" + Close & reload) · rol: owner · nasıl: iki sekmede aynı vardiya · mock: var (revision 409 dalı var)
- [❌ EKSİK] Vardiyayı pencereden silme iki tık · rol: owner · nasıl: Edit shift → Delete → Confirm delete · mock: var
- [❌ EKSİK] Pencereyi başlıktan sürükleme / dışına tıklayıp kapatma · rol: owner · nasıl: başlıktan sürükle · mock: var
- [❌ EKSİK] Kapalı güne vardiya (kapalı lokasyon kuralı "confirm") · rol: owner · nasıl: kapalı güne Add shift · mock: var (kapalı gün 2 hafta sonra)

**P–Q. Kaydetme ve kurtarma**
- [❌ EKSİK] Save draft menüsü (Publish ▾): ad, Save / Save As / Save and publish · rol: owner · nasıl: düzenle → Publish · mock: var
- [❌ EKSİK] Çalışma kopyasında önerilen "vrs.0.N" adı ve canlı ad yasağı uyarısı · rol: owner · nasıl: Edit live schedule → Publish ▾ · mock: var
- [❌ EKSİK] Aynı adlı taslak uyarısı ve satırdan iki tık Overwrite · rol: owner · nasıl: Next week → düzenle → ad "Next week plan" · mock: var
- [❌ EKSİK] Kaydet → önizlemeye dönüş, taslak "Viewing" · rol: owner · nasıl: Save · mock: var
- [❌ EKSİK] Yayınlayamayan rolde "Save draft" menüsü (Save and publish yok) · rol: özel · nasıl: düzenle → Save draft · mock: eksik: özel rol
- [❌ EKSİK] Save draft penceresinde Overwrite iki tık · rol: owner · nasıl: Save draft → Destination: Overwrite … · mock: var
- [❌ EKSİK] Başkasının taslağının üzerine yazma onayı ("Overwrite "…"?") · rol: owner · nasıl: Save · mock: eksik: drafts/save için sahibi başka biri olan ad çakışması dönmeli
- [❌ EKSİK] Taslak başka yerde kaydedilmiş (draft_stale) · rol: owner · nasıl: iki sekme → Save · mock: var (409 schedule.draft_stale var; iki sekme)
- [❌ EKSİK] Kayıt hatası kurtarma sayfası ("Schedule save failed", Retry save / Keep editing / Discard iki tık) · rol: owner · nasıl: Save · mock: eksik: drafts/save 400/500 setup'ı
- [❌ EKSİK] Kurtarmada onaylı vardiya değişimi ("Use approved assignments") · rol: owner · nasıl: Save · mock: eksik: approved-exchange çakışması ve kurtarma ucu gerekir
- [❌ EKSİK] Geçmişe dokunan kayıt onayı ("This changes shifts that already ran") · rol: owner · nasıl: bu haftanın geçmiş gününü değiştir → Save · mock: eksik: drafts/save past_edit_review dalı yok
- [❌ EKSİK] Geçmiş hafta kaydı engeli ("These changes cannot be saved") · rol: owner · nasıl: — · mock: eksik: aynı dal

**R. Yayınla**
- [❌ EKSİK] Adım 1: taslak, lokasyonlar, departmanlar, değişiklik sayıları · rol: owner · nasıl: Next week → Next week plan önizle → Publish · mock: var
- [❌ EKSİK] Bütün canlı vardiyalar silinecek uyarısı · rol: owner · nasıl: boş taslak kaydet → Publish · mock: var
- [❌ EKSİK] "No changes to publish" · rol: owner · nasıl: yayındakiyle aynı taslağı yayınla · mock: var
- [❌ EKSİK] Departman seçilmedi ("Select at least one department to publish.") · rol: owner · nasıl: adım 1 → bütün departmanları kaldır · mock: var
- [❌ EKSİK] Lokasyon taslak başladıktan sonra yayınlanmış ("… published this location on …") · rol: owner · nasıl: Publish · mock: eksik: changed_since_start her zaman null
- [❌ EKSİK] Önizleme yükleniyor / yüklenemedi + Retry · rol: owner · nasıl: Publish · mock: eksik: publish-preview gecikme ve hata setup'ı
- [❌ EKSİK] Adım 2: "Ready to publish" · rol: owner · nasıl: Next · mock: var
- [❌ EKSİK] Adım 2: "Risks" (aynı kişiye çakışan vardiya) · rol: owner · nasıl: çakışan vardiyalı taslak → Publish → Next · mock: var
- [❌ EKSİK] Adım 2: "Must be fixed in the schedule" (engel) ve Next pasif · rol: owner · nasıl: — · mock: eksik: tier "blocker" bulgu üretilmiyor
- [❌ EKSİK] Adım 2: "Warnings to review" (geçilebilir engel) · rol: owner · nasıl: — · mock: eksik: overrideable soft bulgu üretilmiyor
- [❌ EKSİK] Adım 2: "Current schedule conflicts" / uygunluk katlaması / "Previously accepted" · rol: owner · nasıl: — · mock: eksik: new_availability bulguları üretilmiyor
- [❌ EKSİK] Adım 2: "Notes and already-live issues" · rol: owner · nasıl: — · mock: eksik: tier "note" bulgu yok
- [❌ EKSİK] Adım 2: geçmiş hafta ("Past schedule weeks cannot be published.") · rol: owner · nasıl: Previous week → Last week plan → Publish · mock: var (past_week_closed dönüyor; ama geçmiş haftada Publish düğmesi görünmüyor, yalnız "Publish another draft"tan değil — ulaşılamayabilir)
- [❌ EKSİK] "Show shift" ile vardiyaya dönüş ve geri yayın · rol: owner · nasıl: Risks → Show shift · mock: var
- [❌ EKSİK] Adım 3: bildirilecek kişiler, Select all / Clear all · rol: owner · nasıl: Next → Next · mock: var
- [❌ EKSİK] Adım 3: 15+ kişide "Search employees" · rol: owner · nasıl: çok değişiklikli taslak · mock: var (16 çalışan; çoğunu değiştiren taslak gerekir)
- [❌ EKSİK] Adım 3: "No affected employees." · rol: owner · nasıl: yalnız açık vardiya değişen taslak · mock: var
- [❌ EKSİK] Yayın başarılı toast'ı (bildirimsiz) · rol: owner · nasıl: Publish N locations · mock: var
- [❌ EKSİK] Yayın başarılı, "N employees notified" · rol: owner · nasıl: Publish · mock: eksik: notification_count hep 0
- [❌ EKSİK] Yayın başarılı, bildirim uyarısı · rol: owner · nasıl: Publish · mock: eksik: notification_warning yok
- [❌ EKSİK] Yayın sırasında bayat taban → adım 1 + bildirim · rol: owner · nasıl: Publish · mock: var (stale_baseline dalı var; araya değişiklik gerekir)
- [❌ EKSİK] Yayın sırasında "Schedule conflicts must be fixed before publishing" + "Review document" · rol: owner · nasıl: Publish · mock: eksik: schedule_conflicts / document_expiry hata gövdesi gerekir
- [❌ EKSİK] Uyarılar yenilendi toast'ı ("Schedule conflicts updated") · rol: owner · nasıl: Publish · mock: eksik: stale_fingerprint preflight hatası gerekir
- [❌ EKSİK] Save and publish (düzenlemeden doğrudan yayına) · rol: owner · nasıl: düzenle → Publish ▾ → Save and publish · mock: var
- [❌ EKSİK] Müdürün yayını (yalnız kendi lokasyonu) · rol: manager · nasıl: Publish · mock: eksik: müdür kapsamı

**S. Yayından kaldır**
- [❌ EKSİK] Unpublish penceresi (lokasyon seçimi, etkiler) · rol: owner · nasıl: Published → Unpublish schedule · mock: var
- [❌ EKSİK] Unpublish iki tık ve "Schedule unpublished" toast'ı · rol: owner · nasıl: Unpublish 2 locations → Confirm unpublish · mock: var
- [❌ EKSİK] Taslak menüsündeki Unpublish simgesinden açma · rol: owner · nasıl: Draft selector → yayın satırı → geri ok · mock: var
- [❌ EKSİK] Geçmiş hafta kaldırılamaz · rol: owner · nasıl: — · mock: var (past_week_closed; geçmiş haftada düğme yok, ulaşılamayabilir)
- [❌ EKSİK] Kaldırıldı ama sayfa yenilenemedi (hata şeridi) · rol: owner · nasıl: Unpublish · mock: eksik: sonraki okumada hata setup'ı

**T. Şablon penceresi (Schedule içinde)**
- [❌ EKSİK] Önizlemede şablon penceresi (liste, rename, delete, taslaktan yeni şablon) · rol: owner · nasıl: Templates · mock: var
- [❌ EKSİK] Taslaktan şablon oluşturma ("Template saved") · rol: owner · nasıl: Next week → Templates → Draft: Next week plan → ad → Create template · mock: var
- [❌ EKSİK] Aynı adlı şablon hatası · rol: owner · nasıl: Create template "Standard week" · mock: var
- [❌ EKSİK] Düzenlemede boş taslağa şablon uygulama ("Apply template") · rol: owner · nasıl: Blank schedule → Templates → Standard week → Apply template · mock: var
- [❌ EKSİK] Dolu taslağa ekleme ("Add to current shifts") · rol: owner · nasıl: Edit live schedule → Templates → Add to current shifts · mock: var
- [❌ EKSİK] Değiştirerek uygulama (Replace current shifts → sayım → Confirm replace) · rol: owner · nasıl: aynı · mock: var
- [❌ EKSİK] Yalnız bazı departmanlar · rol: owner · nasıl: Only some departments · mock: var
- [❌ EKSİK] Arşiv etiketi atlandı (uyarı tonunda "Template applied") · rol: owner · nasıl: — · mock: var (skipped archived_label dalı var; arşivli etiketli şablon gerekir)
- [❌ EKSİK] Şablon uygulanamadı toast'ı · rol: owner · nasıl: — · mock: eksik: apply-template hata setup'ı

**U. Auto-fill, varsayılan saatler, logo**
- [❌ EKSİK] Auto-fill öneri listesi · rol: owner · nasıl: Edit live schedule → Auto-fill · mock: var
- [❌ EKSİK] Auto-fill: Reject ve "Leave open" · rol: owner · nasıl: aynı · mock: var
- [❌ EKSİK] Auto-fill: "Open shift not filled" satırları · rol: owner · nasıl: aynı · mock: var (uygun kişisiz açık vardiya gerekirse veri)
- [❌ EKSİK] Auto-fill: öneri yok · rol: owner · nasıl: Blank schedule → Auto-fill · mock: var
- [❌ EKSİK] Auto-fill uygulandı / sunucu reddetti · rol: owner · nasıl: Apply · mock: var (rejected dalı var)
- [❌ EKSİK] Auto-fill bayat ("The schedule changed after this review opened…") · rol: owner · nasıl: Auto-fill açıkken başka değişiklik · mock: var (fingerprint 409)
- [❌ EKSİK] Review default hours: seçim, karşılaştırma, uygula (Close'un yeni saati) · rol: owner · nasıl: Edit live schedule → Review default hours → Shift type Close → Review → Apply · mock: var
- [❌ EKSİK] Review default hours: aralıkta vardiya yok · rol: owner · nasıl: Blank schedule → Review default hours · mock: var
- [❌ EKSİK] Review default hours: bayat inceleme / engelli satırlar · rol: owner · nasıl: — · mock: var (blocked_count dalı var)
- [❌ EKSİK] Logo penceresi (yükle, ölçek, konum, kaydet) · rol: owner · nasıl: ızgara sol üst → Manage schedule logo · mock: var
- [❌ EKSİK] Logo hataları (biçim, boyut, kaydedilemedi) · rol: owner · nasıl: büyük ya da yanlış dosya · mock: var (istemci denetimi; kaydetme hatası için storage setup'ı eksik)

---

### Ayrılma uyarısı · Save changes before leaving? (main cab698f5'ten)
Kaydedilmemiş düzenlemeyle sol menü, Back/Forward, workspace değiştirici ya da Sign out önce sorar: Keep editing / Discard and leave / Save draft (`schedule/hooks/useScheduleLeaveGuard.ts`, `shell/leave-guard.ts`, `views/SchedulePage.tsx`). Değişiklik yokken sormaz. Menüden yeni düzenleme açık kalan eskisini "Auto-save" taslağı olarak kenara koyar (mock: `resume: false`).
- [✅ `leave-ask`] Kaydedilmemiş düzenlemeyle sol menüden Employees: "Save changes before leaving?" (Keep editing / Discard and leave / Save draft) · owner
- [✅ `leave-keep`] Keep editing: soru kapanır, Schedule'da ve düzenlemede kalır · owner
- [✅ `leave-discard`] Discard and leave: değişiklik atılır ve sayfadan çıkılır (PAGES burada Employees sayfasının numarasını söyler) · owner
- [✅ `leave-save`] Save draft: önce taslak adı penceresi; kaydedince sayfadan çıkılır · owner
- [✅ `leave-clean`] Değişiklik yokken çıkış sormaz (PAGES doğrudan Employees sayfasının numarasını söyler) · owner

## 3.1 Schedule export — /app/schedule/export

### Parçalar (main a85619f7)
- Route: `schedule.export` ya da `schedule.read` + owner/admin/manager, telefonda kapalı (`App.tsx`); adres SchedulePage'i açar, o da New Schedule penceresini Export sekmesinde açar (3.0 F). `schedule.export` yoksa pencere açılmaz, düz Schedule kalır.
- Export, pencerenin üçüncü sekmesi (Mert 2026-10-12): ızgarada ne görünüyorsa onu verir (süzgeç, gün/hafta, birleşik görünüm); kaynak seçme çipi yok; düzenleme açıkken kaydetmeden ekrandaki hâliyle (`export-v2/ExportSettingsPanel.tsx`).
- Üst satır: "Published" / "Draft · <ad>" / "Editing · not saved" + " · <tarih aralığı> · N locations · N employees · N shifts".
- Engel satırı: "Add location short names before exporting." + lokasyon adları + "Open Location Settings" (ya da "Ask a workspace manager to add them."), "No locations are available to export.", "Waiting for the current preview…".
- Solda küçük önizleme ("PDF · N pages", "Excel · N sheets", PNG sayfaları).
- Sağda "File": PDF (Print-ready pages), Image (PNG, one per page), Excel (Merged, per location, Data); Excel'de "One workbook: Merged, each location, and Data. Only the heading rows are frozen."
- "Send to": Download / Printer (Excel'de yok). Download'da "Layout": "Locations side by side" (All on one page width; birleşik görünümde yok), "One long page" (No page breaks between rows). Printer'da "Paper": US Letter / A4 + "Landscape. One location per page. / All locations in one table. …".
- Alt: "Open in a tab" (önizleme sekmesi), ana düğme "Download PDF|PNG|Excel" / "Print PDF|PNG" / "Preparing…"; indirince "Last generated files" listesi.
- Hatalar: "Could not prepare the preview", "These settings work for this session, but your browser could not remember them.", "Your browser blocked the preview tab…", "Could not prepare this export", "Export access could not be verified" (`export-v2/ExportController.tsx`).
- Önizleme sekmesi "Schedule export preview" (`export-v2/ExportPreview.tsx`).
- Eski "Minimize/Expand export settings", "Close export", "Reset", "Format/Page layout/Output" başlıkları kalktı.

### Senaryolar
- [✅ owner] Export sekmesi, PDF, Download · rol: owner · nasıl: /app/schedule/export · mock: var
- [✅ manager] Müdür: yalnız Downtown · rol: manager · nasıl: /app/schedule/export · mock: var
- [✅ excel] Excel · rol: owner · nasıl: File → Excel · mock: var
- [✅ png] Image (PNG) · rol: owner · nasıl: File → Image · mock: var
- [✅ no-export] Export izni olmayan rol: düz Schedule · rol: özel (schedule.read) · nasıl: /app/schedule/export · mock: var
- [✅ phone] Telefonda kapalı · rol: owner · nasıl: 390 genişlik · mock: var
- [✅ print] Printer: kâğıt seçimi · rol: owner · nasıl: Send to → Printer · mock: var
- [✅ print-a4] Printer, A4 · rol: owner · nasıl: Printer → A4 · mock: var
- [✅ combine] "Locations side by side" kapalı · rol: owner · nasıl: Layout · mock: var
- [✅ merged] Birleşik görünümden export ("All locations in one table.") · rol: owner · nasıl: ?layout=unified → Printer · mock: var
- [✅ draft-source] Ekrandaki taslak ("Draft · Next week plan") · rol: owner · nasıl: ?draft= · mock: var
- [✅ editing] Düzenlemedeyken: kaydetmeden ("Editing · not saved") · rol: owner · nasıl: Draft selector → Edit live schedule → Draft selector → Export · mock: var
- [✅ day-range] Gün görünümünden export · rol: owner · nasıl: ?view=day · mock: var
- [✅ downloaded] "Last generated files" · rol: owner · nasıl: Download · mock: var
- [✅ download-again-failed] Yeniden kaydederken 403 · rol: owner · nasıl: Last generated files → dosya · mock: var
- [✅ preparing] "Preparing…" · rol: owner · nasıl: Download · mock: var
- [✅ popup-blocked] "Open in a tab" engellendi · rol: owner · nasıl: Open in a tab · mock: var
- [✅ prefs-not-saved] Ayar hatırlanamadı · rol: owner · nasıl: Image · mock: var
- [✅ escape] Escape pencereyi kapatır · rol: owner · nasıl: Escape · mock: var
- [✅ short-names] Kısa ad eksik + Open Location Settings · rol: owner · mock: var
- [✅ short-names-manager] Kısa ad eksik, ayar yetkisi yok · rol: manager · mock: var
- [✅ preview-failed] Önizleme hazırlanamadı · rol: owner · mock: var
- [✅ export-failed] İndirme: yetki doğrulanamadı (403) · rol: owner · mock: var

---

## 3.2 Schedule templates — /app/schedule/templates

B görünümü (main 5d7b6f09, 2026-10-14): şablon listesi yüklenirken gri satırlar; okunamazsa sekmede küçük kart "We couldn't load templates" + Try again, sunucunun cümlesi görünmez; liste önceden okunduysa son liste kalır ve üstte "Templates didn't refresh. This is the last list that loaded." PAGES senaryoları: `loading`, `error`.

### Parçalar (main a85619f7)
- Route: `schedule.templates.read` + owner/admin/manager, telefonda kapalı; adres artık SchedulePage'i açar, o da New Schedule penceresini Templates sekmesinde açar (eski ayrı şablon sayfası ve "Back to schedule" kalktı).
- Sekmenin parçaları 3.0 T'de: liste, "Use", "More for <ad>" (Rename, Delete), "Save template" formu, Use hedef seçimi, Add/Replace.
- Rename satırda: "Template name" kutusu, "Save", "Cancel"; hata satırı.
- Delete iki tık: "Click again to delete".
- Yükleniyor "Loading templates…"; boş "No templates yet. Save a draft as a template to reuse its week."
- Liste yüklenemezse sekmede hata cümlesi ve "Retry" ("No templates yet" değil); sunucu hatasında "Newfork could not finish that. Try again in a moment." (`requestErrorText`).
- Rename reddi anahtardan okunur: değişmiş şablonda "This template changed. Refresh and try again."; aynı ad ve diğer retler "The template could not be renamed. Try again." (API ad çakışmasını ayrı anahtarla bildirmiyor). Delete reddi bildirim: "Template could not be deleted" · "The template could not be deleted." (`templateMutationError`).
- Yalnız şablon okuyabilen rol (`schedule.templates.read`, `schedule.templates` yok): pencere açılır, liste görünür; "Save template", "Use" ve ⋯ menüsü yok.

### Senaryolar
- [✅ owner] Templates sekmesi · rol: owner · nasıl: /app/schedule/templates · mock: var
- [✅ manager] Müdür: yalnız tamamı Downtown'da olan şablonlar · rol: manager · mock: var
- [✅ read-only] Yalnız şablon okuyabilen rol: liste görünür; Save template, Use ve ⋯ menüsü yok · rol: özel (schedule.templates.read) · mock: var
- [✅ phone] Telefonda kapalı · rol: owner · mock: var
- [✅ loading] "Loading templates…" · rol: owner · mock: var
- [✅ error] Liste yüklenemedi: sekmede hata cümlesi + Retry · rol: owner · mock: var
- [✅ empty] Hiç şablon yok · rol: owner · mock: var
- [✅ save-form] Save template formu · rol: owner · nasıl: bu haftada taslak varken New Schedule ▾ → Templates → Save template · mock: var
- [✅ use-target] Use: hangi schedule'a · rol: owner · nasıl: Use · mock: var
- [✅ rename] ⋯ → Rename · rol: owner · mock: var
- [✅ renamed] "Template renamed" · rol: owner · mock: var
- [✅ rename-taken] Var olan ad: "The template could not be renamed. Try again." · rol: owner · mock: var (gerçek API gibi 409, anahtarsız)
- [✅ rename-changed] Şablon başka yerde değişmiş: "This template changed. Refresh and try again." · rol: owner · mock: var
- [✅ delete] ⋯ → Delete iki tık · rol: owner · mock: var
- [✅ deleted] "Template deleted" · rol: owner · mock: var
- [✅ delete-failed] Silinemedi · rol: owner · mock: var

---

## 3.3 Requests — /app/schedule/requests

B görünümü (main 5d83f506, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez. Kart: "We couldn't load requests" (Shift changes görünmeye devam eder).

### Parçalar
- Kapı: `requests.read` ya da `exchange.read` yoksa açılış sayfasına; route'ta rol listesi yok, telefonda açık (`views/ScheduleRequestsPage.tsx:49–71`, `App.tsx:387–390`).
- Kaydedilmemiş karar koruması: "Saving request decision", "Discard request decision?", "Your unsaved decision and note will be lost…" (`:59–67`).
- Başlık "TEAM CHANGES. REVIEWED WITH CONTROL." / "Requests" / "Review time off and shift change requests in one place." (`:268–275`).
- Sekmeler "Request type": All, Time off, Shift changes + açık sayı; yalnız bir tür okunabiliyorsa sekme yok; ok tuşlarıyla gezinme; telefonda kayan sıra (`:314–348`, `:504–525`, `schedule/requests-list.ts:28–34`).
- "Filter by location" seçici (All locations + lokasyonlar) (`:350–365`).
- "Search requests" kutusu "Search employee or note" (`:366–378`).
- Masaüstü tablo: Employee, Type, When, Decide by (saat + saat dilimi), Status çipi (Needs review / In progress / Approved / Denied / Revoked / Completed / Expired / Cancelled / Invalidated), Review (açılacak vardiya sayısı uyarısı ya da ok) (`views/RequestsTable.tsx:43–131`, `:284–293`).
- Satırdaki kişi ayrıntısı: "Cancels approved time off", "N shifts become open", "Open shift · <lokasyon> · <iş> · N applicants", "for <kişi>'s <gün>", "N candidates" / "Looking for cover" (`RequestsTable.tsx:175–203`).
- Telefon kartları "Requests" (`RequestsTable.tsx:133–173`).
- Yükleniyor gri iskelet, hata kartı "We couldn't load requests" + "Try again", boş "No requests" / "No requests match these filters." / "No time off|shift change requests match these filters." (`ScheduleRequestsPage.tsx:384–407`).
- Sayfalama (25/50/100) (`:409–415`, `views/ListPagination.tsx`).
- Erişim yok kartı "requests" (`:277–283`).
- İzin çekmecesi "Review request" (TimeOffReview + RequestDrawer): başlık ad + "Time off" / "Cancellation" + durum çipi; "Decide by …" / "Submitted …"; "Open in Schedule"; bildirim satırı; sekmeler Details · Shifts (N) · Activity (`views/TimeOffReview.tsx:60–160`, `views/RequestDrawer.tsx:40–120`).
  - Details: Starts, Ends, iptal notları, "Note from <ad>", "Requested periods" (Full day / saat), "Approvals" tablosu (Location, Status Approved/Waiting, Who; "No location manager can decide…", "Your vote: …"), "On the Schedule" ("N shifts become open if you approve." / "No published shifts change.", "Also off these days") (`TimeOffReview.tsx:185–275`).
  - Shifts: "Shifts that become open" + "Becomes open" çipleri, "Hours need verification" (`:280–305`, `:350–356`).
  - Activity: olay listesi / "Nothing has happened yet." (`:309–326`).
  - Alt bölüm: oy verebilen → not satırı ("Your approval takes effect now." / "Yours is the last approval.") + "Deny|Decline" + "Approve"; Deny adımı: "Reason for <ad>" ("Optional. Only <ad> reads this."), hata, "Back", iki tık "Deny request|Decline cancellation" / "Confirm deny|decline"; geri alınabilir onaylı izin → "Shorten time off" + "Revoke"; aksi halde "View-only access" (`:75–145`).
  - Shorten time off formu: "Shorten <ad>'s time off", açıklama, "No future approved hours remain.", "Give back period N" kutuları, "Hours to give back", "Apply or discard the hours being edited first.", hata, "Give back these hours", "Keep time off" (`views/TimeOffShorten.tsx:30–81`).
- Onay/geri alma penceresi (ConfirmDialog): "Approve time off?" / "Approve cancellation?" ("Takes effect now. Managers at …'s locations are notified. N published shifts become open shifts.") / "Revoke time off?" + "Reason" (zorunlu) + "Approve"/"Revoke"/"Saving..." (`ScheduleRequestsPage.tsx:539–608`).
- Karar sonuçları: toast "Time off approved." / "Time off denied." / "Cancellation approved|declined." / "Time off revoked." / "<ad>'s time off is shorter…"; çekmece içinde "Your approval is saved. N locations still to approve."; "This request changed. Review it again." (`:224–267`, `:527–537`).
- Cover / Open shift çekmecesi "Review shift change" (ExchangeReview): başlık + "Open shift"/"Cover" + çip (Approved, Closed, Expired, Ended, In progress, Needs review, Open); "Decide by …" / "Asked …"; sekmeler Details · Activity; vardiya kartı ("<ad> stays on this shift until you approve." / "Nobody is on this shift yet…"); "Private note from <ad>" ("Only managers see this."); "Who can take it" / "Who asked" (N people) radyo listesi (Asked …, uygunluk çipleri, "Decline <ad>"); "Nobody has asked yet…"; ret gerekçeleri; "Eligibility could not be checked…"; "Another location's manager also approves."; alt: "Give shift to <ad> (anyway)" / "Pick someone" / "Nobody to approve"; ret/kapat adımı ("Reason for …", iki tık "Decline <ad>" / "Close request"); kapanmış hal metinleri (`views/ExchangeReview.tsx:17–325`, `ScheduleRequestsPage.tsx:455–470`).
- Takas penceresi "Swap request" (SwapReview): "<sahip> ⇄ <öbür>", iki vardiya kartı, engeller listesi, "Eligibility could not be checked…", "Another location's manager also approves.", kilit notu "Another <lokasyon> manager, the owner or an admin decides this request.", hata; "Decide by …", "Decline" / "Approve", "Waiting for <ad> to accept.", ret adımı "Reason for <ad>" + iki tık "Decline swap"; sonuç metinleri ("Swap approved.", "Swap declined.", "Your approval is recorded. The other location's manager decides next.") (`views/SwapReview.tsx:20–228`).
- Derin bağlantılar: `?request=<id>` izin çekmecesi, `?case=<id>` cover/open çekmecesi ya da takas penceresi; listede olmayan `?case=` tek okumayla açılır; okunurken tablonun yerinde "Loading request..."; talep artık yoksa "Request unavailable" / "This request is no longer available." + "Show all requests" (liste geri gelir, odak listeye); sunucu talebi reddederse (geçersiz bağlantı, yetki yok, workspace dışı) da "Request unavailable"; bağlantı koparsa "Request could not load" + "Try again"; internet yokken "Loading request..." kalır. Mesaj çıkınca odak başlığa gider; sekme, filtre ve arama bağlantıyı temizler, liste geri gelir. Eski müdür Shift Hub görünümü kaldırıldı (`ScheduleRequestsPage.tsx`; main 7eddd4af).

### Senaryolar
- [✅ owner] Liste (All) · rol: owner · nasıl: /app/schedule/requests · mock: var
- [✅ manager] Müdür listesi (yalnız Downtown) · rol: manager · nasıl: /app/schedule/requests · mock: var
- [✅ only-timeoff] Time off sekmesi · rol: owner · nasıl: Time off · mock: var
- [✅ shift-changes] Shift changes sekmesi · rol: owner · nasıl: Shift changes · mock: var
- [❌ EKSİK] Lokasyon süzgeci (Uptown) · rol: owner · nasıl: Filter by location → Uptown · mock: var
- [❌ EKSİK] Arama · rol: owner · nasıl: Search requests "Maria" · mock: var
- [❌ EKSİK] Boş sonuç ("No requests match these filters.") · rol: owner · nasıl: arama "zzz" · mock: var
- [❌ EKSİK] Sekmeye özgü boş sonuç · rol: owner · nasıl: Shift changes + arama "zzz" · mock: var
- [❌ EKSİK] Yükleniyor · rol: owner · nasıl: açılış · mock: eksik: gecikme setup'ı
- [❌ EKSİK] Yüklenemedi + Try again · rol: owner · nasıl: açılış · mock: eksik: /schedule/requests 500 setup'ı
- [✅ no-access] Erişim yok kartı · rol: manager · nasıl: açılış · mock: eksik: 403 setup'ı
- [❌ EKSİK] Yalnız bir türü okuyabilen rol: sekme yok · rol: özel (yalnız time off) · nasıl: açılış · mock: eksik: özel rol
- [❌ EKSİK] Talep okuyamayan rol açılış sayfasına atılır · rol: employee · nasıl: /app/schedule/requests · mock: var (sayfa employee rolünü listelemiyor)
- [❌ EKSİK] Sayfalama (25'lik sayfa, sonraki sayfa) · rol: owner · nasıl: sayfa boyutu 25 · mock: eksik: 25'ten çok talep gerekir
- [❌ EKSİK] Telefonda kart listesi ve kayan sekmeler · rol: owner · nasıl: 390 genişlik · mock: var
- [❌ EKSİK] Kapanmış talepler (Approved/Denied/Revoked/Expired) listenin altında · rol: owner · nasıl: All → aşağı kaydır · mock: var
- [✅ timeoff] İzin çekmecesi Details (Ethan Brooks) · rol: owner · nasıl: Ethan Brooks, Time off · mock: var
- [✅ timeoff-shifts] İzin çekmecesi Shifts sekmesi · rol: owner · nasıl: Ethan → Shifts · mock: var
- [❌ EKSİK] İzin çekmecesi Activity sekmesi · rol: owner · nasıl: Ethan → Activity · mock: var
- [❌ EKSİK] Owner tek başına onaylar: "Approve time off?" penceresi (açılacak vardiyalar) · rol: owner · nasıl: Ethan → Approve · mock: var
- [❌ EKSİK] Onay sonucu toast'ı ve listeden kapanma · rol: owner · nasıl: Approve → Approve · mock: var
- [❌ EKSİK] Müdür oyu: pencere yok, "Your approval is saved. N location still to approve." · rol: manager · nasıl: çok lokasyonlu kişinin izni (Jake/Sophie) → Approve · mock: var
- [❌ EKSİK] Son onay müdürde ve vardiya açıyor: pencere · rol: manager · nasıl: Downtown-only kişinin izni → Approve · mock: var
- [✅ deny] Reddetme gerekçe adımı · rol: owner · nasıl: Ethan → Deny · mock: var
- [❌ EKSİK] Reddetme iki tık ve "Time off denied." · rol: owner · nasıl: Deny → Deny request ×2 · mock: var
- [❌ EKSİK] Reddetme hatası (çekmecede satır) · rol: owner · nasıl: Deny · mock: eksik: verdict 400 setup'ı
- [❌ EKSİK] Talep değişmiş ("This request changed. Review it again.") · rol: owner · nasıl: iki sekme → Approve · mock: var (revision denetimi var; iki sekme)
- [❌ EKSİK] İptal talebi (Jake, "Cancellation", Decline cancellation / Approve cancellation) · rol: owner · nasıl: Jake Thompson, Time off (cancellation) · mock: var
- [❌ EKSİK] Onaylı izin: Revoke penceresi (Reason zorunlu) · rol: owner · nasıl: onaylı bir izin → Revoke · mock: var
- [❌ EKSİK] Revoke sonucu "Time off revoked." · rol: owner · nasıl: Reason → Revoke · mock: var
- [❌ EKSİK] Shorten time off formu ve sonucu · rol: owner · nasıl: onaylı gelecek izin → Shorten time off → Give back these hours · mock: var
- [❌ EKSİK] Shorten: geri verilecek saat yok · rol: owner · nasıl: başlamış izin → Shorten · mock: var
- [❌ EKSİK] View-only access (oy veremeyen) · rol: manager · nasıl: kapsam dışı ya da oy vermiş talep · mock: var (oy verdikten sonra)
- [❌ EKSİK] "No location manager can decide. An admin or owner decides." · rol: owner · nasıl: — · mock: eksik: müdürsüz lokasyonda talep (fallback) gerekir
- [❌ EKSİK] "Also off these days" dolu · rol: owner · nasıl: aynı günlere düşen iki izin · mock: var
- [❌ EKSİK] "Open in Schedule" bağlantısı · rol: owner · nasıl: çekmece → Open in Schedule · mock: var
- [❌ EKSİK] `?request=<id>` ile doğrudan açılış · rol: owner · nasıl: /app/schedule/requests?request=<id> · mock: var
- [✅ cover] Cover çekmecesi (Noah Garcia) · rol: owner · nasıl: Noah Garcia, Cover · mock: var
- [✅ open] Open shift çekmecesi · rol: owner · nasıl: Open shift, Open shift · mock: var
- [❌ EKSİK] Cover/Open: adayı seç → "Give shift to <ad>" → toast · rol: owner · nasıl: aday radyosu → Give shift · mock: var
- [❌ EKSİK] Cover/Open: uyarılı aday "Give shift to <ad> anyway" · rol: owner · nasıl: uyarılı aday · mock: var (uygunluk ön izleme ucu var; veri gerekebilir)
- [❌ EKSİK] Cover/Open: aday yok ("Nobody has asked yet…", "Nobody to approve") · rol: owner · nasıl: başvurusuz açık vardiya · mock: var
- [❌ EKSİK] Adayı reddetme adımı ve iki tık · rol: owner · nasıl: Decline <ad> · mock: var
- [❌ EKSİK] Talebi kapatma iki tık ("Close request") · rol: owner · nasıl: cover → kapat · mock: var
- [❌ EKSİK] Öbür lokasyonun müdürü de onaylar notu / onay kaydedildi · rol: manager · nasıl: çok lokasyonlu cover · mock: var
- [❌ EKSİK] Kapanmış cover (Approved / Expired) · rol: owner · nasıl: History'deki cover · mock: var
- [❌ EKSİK] Uygunluk denetlenemedi · rol: owner · nasıl: çekmece · mock: eksik: preview 500 setup'ı
- [✅ swap] Takas penceresi (Jake Thompson) · rol: owner · nasıl: Jake Thompson, Swap · mock: var
- [❌ EKSİK] Takas onayı → "Swap approved." · rol: owner · nasıl: Approve · mock: var
- [❌ EKSİK] Takas reddi gerekçe + iki tık "Decline swap" · rol: owner · nasıl: Decline · mock: var
- [❌ EKSİK] Takas: öbür çalışan henüz kabul etmedi ("Waiting for … to accept.") · rol: owner · nasıl: davetli takas · mock: var (davetli case dalı var)
- [❌ EKSİK] Takas: engel listesi (izinli gün) ve Approve pasif · rol: owner · nasıl: izne denk gelen takas · mock: eksik: izinle çakışan takas verisi gerekir
- [❌ EKSİK] Takas: karar başka müdürde (kilit notu) · rol: manager · nasıl: can_manage false takas · mock: eksik: müdürün yönetemediği takas verisi
- [❌ EKSİK] `?case=<id>` ile çekmece / takas penceresi açılışı · rol: owner · nasıl: bildirim bağlantısı · mock: var
- [✅ case-gone] Bağlantıdaki talep artık yok: "Request unavailable" + Show all requests · rol: owner · nasıl: /app/schedule/requests?case=<bilinmeyen> · mock: var
- [✅ case-failed] Bağlantıdaki talep okunamadı: "Request could not load" + Try again · rol: owner · nasıl: aynı bağlantı, tek talep okuması 503 · mock: var (setup case-read-fail)
- [✅ case-loading] Bağlantıdaki talep okunuyor: "Loading request..." · rol: owner · nasıl: aynı bağlantı, okuma cevapsız · mock: var (setup case-read-slow)
- [❌ EKSİK] Kaydedilmemiş ret notuyla çıkış uyarısı ("Discard request decision?") · rol: owner · nasıl: Deny → gerekçe yaz → sekme değiştir · mock: var

---

## 3.4 Lineup — /app/schedule/lineup (main 32bbbc47; yayında: https://claude.ai/artifact/AJqKmK2HZcmwV8tooCtusz)

### Parçalar
- Başlık ("THE RIGHT PEOPLE. IN THE RIGHT SPOT.", "Lineup") — `views/LineupPage.tsx`.
- Gün seçici: önceki / sonraki gün, tarih düğmesi (bugün değilse turuncu, tıklayınca bugüne döner); adreste `?date=`.
- Lokasyon ve vardiya süzgeci (`?location=`, `?shift=`); haftanın 7 günü şeridi (bugünün işareti).
- Lokasyon kartı: ad ve uzun tarih; kapalı gün satırı; kısa saat uyarısı.
- Vardiya bölümü (renkli sol kenar, kişi sayısı, katlanır); boş vardiya "No one is scheduled."; departman başlığı, job satırı (renk noktası), tablo Name / Shift / Position / In – Out / Label.
- Telefon (390): tek lokasyon (Location seçimi, "All locations" yok), gün şeridi ve vardiya süzgeci yok; vardiyalar sekme ("Shifts", kişi sayısıyla, `?shift=`); özet kartı (vardiya adı, "Live from the Schedule", On the floor / First in / Last out); departman → job → kişi (baş harf, ad, saat, label); boş vardiya "No one is scheduled for …"; kapalı gün "Closed today · …"; bugünse şu an süren vardiya seçili açılır — `views/LineupPage.tsx` (`PhoneLineup`, `PhoneShift`), `schedule/lineup.ts` (`phoneLineupShift`, `lineupShiftSpan`).
- Durumlar (B görünümü): yüklenirken gri iskelet (`LineupOutline` / `PhoneLineupOutline`), okunamazsa ortada kart "We couldn't load the lineup" + beyaz Try again (`shell/LoadState.tsx`), erişim yok kartı. Menüde Schedule altında; telefonda alt çubukta Lineup.

### Senaryolar
- ✅ Owner, Manager (Downtown), Sonraki gün, Vardiyayı katlama, Lokasyon süzgeci Uptown, Yükleniyor, Okunamadı, Erişim yok (`tools/sc/35-lineup.py`); her biri telefon çerçevesinde de (390).
- ❌ Kapalı gün ve kısa saat uyarısı: demo verisinde bugün için yayınlanmış kapanış yok.

## Sayılar
- Sayfa: 4 mevcut (3.0, 3.1, 3.2, 3.3), 0 yeni gereken. (Deneme route'ları ve yönlendirmeler tek satır.)
- Parça: 184 → 3.0: 137 · 3.1: 13 · 3.2: 11 · 3.3: 23 (her "Parçalar" maddesi ve alt maddesi bir parça).
- Senaryo: 293 → ✅ 36, ❌ 257.
  - 3.0: 202 (✅ 15, ❌ 187) · 3.1: 18 (✅ 4, ❌ 14) · 3.2: 15 (✅ 4, ❌ 11) · 3.3: 58 (✅ 13, ❌ 45).
- Mock eksiği olan senaryo: 67 → 3.0: 44 · 3.1: 6 · 3.2: 7 · 3.3: 10.

---


# Alan: Envanter · hub-duyuru-kabuk (7.x Employee Hub, 8.x Announcements, 9.0 Notifications, 0.x Kabuk)

Kaynak: `apps/web/src` @ main e0763dd5. Dosya yolları `apps/web/src/` köküne göredir. Mock: `apps/web/.temp/pages/mock`.

Genel mock notu: mock'ta hata, gecikme ya da "çevrimdışı" üretecek düzenek yok; `scenarios.ts` içindeki tek `setup` `session-expired`. Bu yüzden bütün "yükleniyor / hata / offline" senaryoları "mock: eksik" (gerekirse: `setups`'a route'u 500/403 döndüren ya da cevabı geciktiren bir anahtar, `navigator.onLine=false` taklidi). Owner ve manager'ın mock'ta çalışan kaydı yok (`mock/world.ts:20-21` `employeeId: null`); bu yüzden "Employee view" onlar için hep yetkisiz kartını açar.

Route notu: App.tsx'teki `hubPath` = `/workspaces` (`auth/resolveLanding.ts:8`), yani 1.5 Workspace hub; çalışanın hub'ı değildir, bu alanda yazılmadı. Çalışan hub'ı tek route: `employee-hub/*` (`App.tsx:431-441`, `ActionRoute action="employee_hub.read"`). Alt sayfa ayrımı route'ta değil, `views/EmployeeHubPage.tsx:79` içinde `pathname.split("/employee-hub/")[1]` ile yapılır: `""` → 7.0, `schedule` → 7.1, `shift-hub*` (startsWith) → 7.2, `my-availability` → 7.3, `more` → 7.4, başka her şey → başlığı "Employee Hub" olan More sayfası (`EmployeeHubPage.tsx:69-73, 190-191`).

Hub içinde ayrı bir "onboarding kartı" kodda yok. Onboarding belgesi eksik çalışan, `/app` kabuğuna girerken `DocumentAccessRoute` tarafından `/account/documents?workspace=…`'a yönlendirilir (`documents/DocumentAccessRoute.tsx:30-33`); bu 0.x Kabuk'ta yazıldı. "Bekleyen işler" kartı 7.0'daki "On your radar"dır.

---

## 7.0 Employee home — /app/employee-hub

B görünümü (main 54af9320, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kartlar: "We couldn't load Employee Hub", "We couldn't load your updates", "We couldn't load team notices", "We couldn't load your reminders"; çevrimdışı notu aynı kalır. PAGES senaryoları: `loading`, `error`, `updates-error`, `notices-error`, `reminder-load-error`.

### Parçalar
- Yetkisiz kartı "You don't have access to Employee Hub" (API `authz.*` derse) — `views/EmployeeHubPage.tsx:109-115`
- Yükleniyor iskeleti "Getting your day ready…" — `views/EmployeeHubPage.tsx:129-140`
- Hata kartı "Employee Hub is unavailable" + "Retry" — `views/EmployeeHubPage.tsx:141-155`
- Üst bağlam çubuğu: workspace adı bağlantısı (→ /account/workspaces), "Your personal space" rozeti, profil avatarı (→ /account/profile, "Your profile"), bildirim zili — `employee-hub/EmployeeDashboard.tsx:101-124`
- Bildirim zili ve okunmamış sayacı ("9+" sınırı), yalnız `notifications.read` varsa — `employee-hub/DashboardCommunications.tsx:18-31`, `EmployeeDashboard.tsx:120-122`
- Sayfa başlığı: "A LITTLE CLARITY FOR YOUR DAY", "Good morning/afternoon/evening, <ad>.", bugün vardiya varsa "You have a shift today…", sağda tarih + saat + "Local time" — `EmployeeDashboard.tsx:125-153`
- Uyarı satırı: "You're offline. Showing your last loaded schedule." / "Your schedule may be out of date." + "Refresh schedule" — `EmployeeDashboard.tsx:154-161`
- Ana kart (hero) "Your shift": etiket SCHEDULED NOW / TODAY'S SHIFT / YOUR NEXT SHIFT, saat aralığı, lokasyon + job, "Starts in …" / "Scheduled shift in progress", saat dilimi ("(device time)" eki), "Ends next day", "View shift" — `EmployeeDashboard.tsx:163-221`
- Ana kart boş hali: "LOOKING AHEAD", "A little room to plan ahead.", "Update availability" — `EmployeeDashboard.tsx:222-240`
- "On your radar" kartı (bekleyen işler): sayı ya da tik, "Waiting on you" / "You're all caught up" / "Requests couldn't be checked", en çok 2 bağlantı ("Respond to a shift swap", "A teammate asked for cover"), alt satır "N requests awaiting a response" / "View your requests" — `EmployeeDashboard.tsx:242-300`
- Kısayollar: "My schedule", "Request time off", "My availability", "Open shifts" — `EmployeeDashboard.tsx:301-339`
- "Coming up" kartı: 7 günlük şerit (gün → 7.1 gün görünümü, vardiya noktası), ilk 3 vardiya satırı (→ `?shift=`), boş metin, "View all" — `EmployeeDashboard.tsx:340-415`
- "My reminders" kartı: ekleme formu ("Add a little reminder…", + düğmesi), onay kutulu liste, tamamlanana çöp kutusu "Remove …", "View all N"/"Show less", "Show completed"/"Hide completed", boş metin, yükleniyor/çevrimdışı, hata satırı "… Your change hasn't been confirmed." — `employee-hub/PersonalReminders.tsx:10-174`
- Kart hata kutusu "This section couldn't be loaded." + "Try again" (ortak) — `employee-hub/DashboardPrimitives.tsx:30-40`
- "Latest updates" kartı (yalnız `notifications.read`): son 3 görünür bildirim, okunmuş noktası, boş/yükleniyor/hata — `DashboardCommunications.tsx:32-75`
- "Team notices" kartı (yalnız `announcements.read`): yayında ve süresi geçmemiş ilk 2 duyuru (kategori, başlık, metin → 8.1), boş "No new notices. Enjoy a little quiet." — `DashboardCommunications.tsx:76-128`
- "Your team" kartı: ilk 4 kişi (baş harf, ad, job'lar), boş metin — `EmployeeDashboard.tsx:428-455`
- Alt bilgi: "A clear day starts here." + "Notification preferences" bağlantısı — `EmployeeDashboard.tsx:457-465`
- Vardiya çekmecesi (dialog) "Your shift": tarih, saat, lokasyon · job, saat dilimi, "Ends the following day", "Shift notes", "Find cover or swap" (→ 7.2 `?offer=`), "Open in my schedule", kapat "Close shift details" — `employee-hub/ShiftSheet.tsx:9-122`
- "Shift unavailable" çekmecesi (`?shift=` bilinmiyorsa) + "Open my schedule" — `ShiftSheet.tsx:123-135`
- Telefon: sol menü gizlenir, alt menü (Home/Schedule/Requests/More) çıkar; kart ızgarası tek sütun — `employee-hub/employee-dashboard.css:948-1000`; alt menü 0.3'te
- Otomatik yenileme: hub verisi, zil, kartlar 60 sn'de bir; saat 30 sn'de bir — `EmployeeHubPage.tsx:93`, `employee-hub/useHubClock.ts:1-16`

### Senaryolar
- [✅ home] Dolu ana sayfa (sıradaki vardiya, radar, kartlar) · rol: employee · nasıl: /app/employee-hub · mock: var
- [✅ timeoff] "Request time off" kısayolu → 7.3 izin formu · rol: employee · nasıl: Home → Request time off · mock: var
- [✅ shift] Vardiya çekmecesi açık · rol: employee · nasıl: Home → View shift · mock: var
- [❌ EKSİK] Yükleniyor iskeleti · rol: employee · nasıl: ilk açılış · mock: eksik: hub cevabını geciktiren setup
- [❌ EKSİK] "Employee Hub is unavailable" + Retry · rol: employee · nasıl: hub okuması 500 · mock: eksik: /employee-hub 500 setup
- [✅ owner-no-record] Yetkisiz kartı (çalışan kaydı olmayan owner/manager "Employee view") · rol: owner/manager · nasıl: sol menü → Employee view · mock: var (owner/manager employeeId null → 403 authz)
- [❌ EKSİK] Owner/manager kendi çalışan kaydıyla employee view'da (sol menü "Management view" satırı) · rol: owner/admin/manager · nasıl: Employee view · mock: eksik: owner'a employeeId bağla
- [❌ EKSİK] Bugün vardiyası olan gün ("TODAY'S SHIFT", "Starts in 2h 15m") · rol: employee · nasıl: Home · mock: eksik: bugüne Maria vardiyası ya da sabit saat
- [❌ EKSİK] Vardiya şu an sürüyor ("SCHEDULED NOW") · rol: employee · nasıl: Home · mock: eksik: şu anı kapsayan vardiya
- [❌ EKSİK] Gece yarısını geçen vardiya ("Ends next day") · rol: employee · nasıl: Home → View shift · mock: eksik: bitişi ertesi gün olan vardiya
- [❌ EKSİK] Lokasyonun saat dilimi yok ("(device time)") · rol: employee · nasıl: Home · mock: eksik: timezone'suz lokasyon
- [❌ EKSİK] Hiç yayınlanmış vardiya yok (LOOKING AHEAD + Update availability) · rol: employee · nasıl: Home · mock: eksik: Maria'nın vardiyalarını boşaltan setup
- [❌ EKSİK] Çevrimdışı uyarısı + Refresh schedule · rol: employee · nasıl: ağ kesik · mock: eksik: navigator.onLine=false taklidi
- [❌ EKSİK] "Your schedule may be out of date." (veri var, yenileme hata) · rol: employee · nasıl: 60 sn yenilemesi düşer · mock: eksik: ikinci okumada 500
- [❌ EKSİK] Radar: bekleyen takas daveti ("Respond to a shift swap", sayı 01) — home senaryosunda görünüyor ama ayrı adımı yok · rol: employee · nasıl: Home → radar satırı → 7.2 detay · mock: var (Priya→Maria swap daveti)
- [❌ EKSİK] Radar: "You're all caught up" · rol: employee · nasıl: Home · mock: eksik: davetsiz çalışan
- [❌ EKSİK] Radar: "Requests couldn't be checked" · rol: employee · nasıl: shift-exchanges okuması hata · mock: eksik: shift-exchanges 500
- [❌ EKSİK] Zil sayacı 9+ · rol: employee · nasıl: Home · mock: eksik: 10+ okunmamış bildirim
- [❌ EKSİK] Zil ve "Latest updates" yok (notifications.read yok) · rol: özel · nasıl: Home · mock: eksik: izinsiz rol
- [❌ EKSİK] "Team notices" yok (announcements.read yok) · rol: özel · nasıl: Home · mock: eksik: izinsiz rol
- [❌ EKSİK] Latest updates / Team notices / My reminders kart hatası + Try again · rol: employee · nasıl: ilgili okuma 500 · mock: eksik: route başına hata anahtarı
- [❌ EKSİK] Team notices boş ("No new notices…") · rol: employee · nasıl: Home · mock: eksik: Maria'ya yayında duyuru olmayan veri
- [❌ EKSİK] Hatırlatma ekle (başarı, sr "Reminder added.") · rol: employee · nasıl: Home → My reminders → yaz → + · mock: var
- [❌ EKSİK] Hatırlatmayı tamamla / geri aç / sil · rol: employee · nasıl: onay kutusu; tamamlananın çöp kutusu · mock: var
- [❌ EKSİK] "View all N" (3'ten fazla açık hatırlatma) ve "Show completed" · rol: employee · nasıl: My reminders araçları · mock: eksik: 4+ açık hatırlatma (bugün 3 açık, 1 tamam)
- [❌ EKSİK] Hatırlatma listesi boş · rol: employee · nasıl: Home · mock: eksik: boş görev listesi
- [❌ EKSİK] Hatırlatma kaydı hata ("Your change hasn't been confirmed.") · rol: employee · nasıl: + · mock: eksik: personal-tasks POST 500
- [❌ EKSİK] "Your team" boş · rol: employee · nasıl: Home · mock: eksik: ortak lokasyonu olmayan çalışan
- [❌ EKSİK] 7 gün şeridinden güne geçiş (→ 7.1 gün görünümü) · rol: employee · nasıl: Coming up → gün · mock: var
- [❌ EKSİK] "Shift unavailable" çekmecesi · rol: employee · nasıl: /app/employee-hub?shift=bilinmeyen-id · mock: var
- [❌ EKSİK] Vardiya notu olan çekmece ("Shift notes") · rol: employee · nasıl: View shift · mock: eksik: Maria vardiyasına not
- [❌ EKSİK] Telefon görünümü (alt menü, tek sütun) · rol: employee · nasıl: 390 px · mock: var (çerçeve genişliği)

## 7.1 My schedule — /app/employee-hub/schedule

### Parçalar
- Sayfa başlığı "Schedule" / "YOUR WEEK, WITHOUT SURPRISES." — `views/EmployeeHubPage.tsx:46-51, 174-178`
- (Hub verisi önce yüklenir: 7.0'daki yükleniyor/hata/yetkisiz aynen burada da) — `EmployeeHubPage.tsx:109-155`
- Pano yükleniyor "Loading your schedule…" — `employee-hub/EmployeeScheduleBoard.tsx:104-109`
- Pano hatası "Schedule is unavailable" + "Retry" — `EmployeeScheduleBoard.tsx:110-122`
- Üst çubuk (yöneticinin Schedule çubuğuyla ortak): "Previous week/day", tarih düğmesi (bu haftaya/bugüne atla ya da gün↔hafta), "Open schedule calendar" (önemli gün/kapalı gün işaretli takvim), "Next week/day" — `EmployeeScheduleBoard.tsx:212-237`, `schedule/components/ScheduleTopBar.tsx:440-505`
- "Settings" menüsü: "Sort Employees by", "Shift Badge Settings" (shift type, labels, clock times), "Schedule Grid Settings" (Total hours, role separators) — `ScheduleTopBar.tsx:285-300, 587-700`
- "Hide Unscheduled" / "Show Unscheduled" — `ScheduleTopBar.tsx:306-316`
- Süzgeçler: All locations (+ "Merge locations" anahtarı), All shifts, All jobs, All employees — `ScheduleTopBar.tsx:317-380`
- "My Schedule" / "Showing my shifts" düğmesi (yalnız kendi satırı) — `EmployeeScheduleBoard.tsx:281-295`
- Salt-okur ızgara (sürükleme, düzenleme, açık vardiya satırı yok; job renk noktası var) — `EmployeeScheduleBoard.tsx:297-342`
- Esc ve boş alana tıklama süzgeçleri katman katman geri alır — `EmployeeScheduleBoard.tsx:74-92, 140-200`
- URL durumu: `date`, `view=day`, `locations`, `shiftTypes`, `jobs`, `employees`, `hideUnscheduled` — `EmployeeScheduleBoard.tsx:57-62, 94-102`
- Telefon: sayfa açık (DesktopOnly değil); alt menü "Schedule" sekmesi — `employee-hub/EmployeeMobileNav.tsx:24`

### Senaryolar
- [✅ week] Bu hafta · rol: employee · nasıl: /app/employee-hub/schedule · mock: var
- [✅ next] Sonraki hafta · rol: employee · nasıl: Next week · mock: var
- [❌ EKSİK] Önceki hafta · rol: employee · nasıl: Previous week · mock: var
- [❌ EKSİK] Gün görünümü · rol: employee · nasıl: gün başlığına tıkla ya da ?date=…&view=day · mock: var
- [❌ EKSİK] Takvim açık (önemli günler, kapalı gün işaretleri) · rol: employee · nasıl: Open schedule calendar · mock: var (Kitchen deep clean kapalı günü)
- [❌ EKSİK] "My Schedule" (yalnız Maria) · rol: employee · nasıl: My Schedule · mock: var
- [❌ EKSİK] Hide Unscheduled · rol: employee · nasıl: Hide Unscheduled · mock: var
- [❌ EKSİK] Lokasyon süzgeci + Merge locations · rol: employee · nasıl: All locations → Uptown / Merge · mock: var (Maria iki lokasyonda mı belirsiz; tek lokasyonsa süzgeç tek seçenekli)
- [❌ EKSİK] Settings menüsü açık · rol: employee · nasıl: Settings · mock: var
- [❌ EKSİK] Esc ile süzgeç katmanını geri alma · rol: employee · nasıl: süzgeç seç → Esc · mock: var
- [❌ EKSİK] Pano yükleniyor · rol: employee · nasıl: ilk açılış · mock: eksik: gecikme
- [❌ EKSİK] Pano hatası + Retry · rol: employee · nasıl: employee-hub/schedule 500 · mock: eksik: hata anahtarı
- [❌ EKSİK] Yayınlanmamış hafta / boş hafta · rol: employee · nasıl: birkaç hafta ileri · mock: var (ileri haftalar boşsa)
- [❌ EKSİK] Telefon görünümü (ızgara 390 px) · rol: employee · nasıl: 390 px · mock: var

## 7.2 Shift Hub — /app/employee-hub/shift-hub

### Parçalar
- Sayfa başlığı "Shift Hub" / "WORK BETTER TOGETHER" — `views/EmployeeHubPage.tsx:52-57`
- Yükleniyor iskeleti "Loading shift changes" — `employee-hub/shift-exchanges/ShiftExchangeHub.tsx:395-406`
- Hata "Shift Hub is unavailable" + "Retry" (401/403 dahil) — `ShiftExchangeHub.tsx:407-420`
- Bant: "You're offline. Showing the last loaded requests…" — `ShiftExchangeHub.tsx:532-537`
- Bant: "Couldn't refresh these requests." + "Retry" — `ShiftExchangeHub.tsx:538-543`
- Başarı satırı (komut sonucu: "Request accepted. Waiting for final manager approval.", "Request updated…", "Manager approved the change…", "Request closed…", "The decision deadline passed…", "Shift details changed…") — `ShiftExchangeHub.tsx:279-296, 544-549`
- Hata satırı (+ "If the response was lost, retry the same action…") — `ShiftExchangeHub.tsx:550-556`
- Sekmeler: "Available", "My requests", "History" (`hub_view`) — `ShiftExchangeHub.tsx:452-456, 557-571`
- Süzgeç: "All my locations" seçimi, "Search date, location or position" — `ShiftExchangeHub.tsx:572-596`
- Available kartı: "Cover"/"Open shift" hapı, "Eligible" ya da "Availability conflict" rozeti, vardiya kartı, "Cover for <ad>"/"No assigned employee", yardım satırı, "Request to cover" / "Request to pick up" / "Request anyway"; başvurulmuşsa "Awaiting manager · Not added to your schedule yet" + "View request" — `ShiftExchangeHub.tsx:603-707`
- İzinli saate denk gelen soluk kart: "On time off", açıklama, "Ask to cancel time off" (→ 7.3) — `ShiftExchangeHub.tsx:95-122`
- Available boş: "No eligible shifts right now" — `ShiftExchangeHub.tsx:708-713`
- My requests / History satırı: aşama hapı (Finding cover, Awaiting teammate, Awaiting manager, Awaiting other manager, Approved, Shift changed, Search closed, Expired), vardiya kartı (filtre öbür taraftaysa "Requested in return"), tür, aday sayısı ya da kendi başvuru durumu — `ShiftExchangeHub.tsx:780-828`
- Liste boş: "You're all caught up" / "No past requests" — `ShiftExchangeHub.tsx:831-846`
- Talep ayrıntısı (yan panel, telefonda tam genişlik ve kaydırma): "Back to requests", "This request is outside your list filters…" bandı — `ShiftExchangeHub.tsx:856-886`
- Ayrıntı başlığı: "Shift swap"/"Open shift pickup"/"Cover request" + durum hapı — `ShiftExchangeHub.tsx:1094-1111`
- Sorumluluk kutusu: "Still your shift", "Current owner: …", "Both owners keep their current shifts", "Swap approved", "Transfer approved", "This shift is no longer published", "Check current assignments" — `ShiftExchangeHub.tsx:202-257`
- "Shift details changed, so this offer ended…" bandı (invalidated) — `ShiftExchangeHub.tsx:1113-1118`
- "Start a new cover or swap request" (kendi vardiyası, kapanmış talep) — `ShiftExchangeHub.tsx:1119-1129`
- "Private note for the manager" (talep sahibi görür) — `ShiftExchangeHub.tsx:1130-1135`
- Vardiya kartları (takasta "You give"/"You receive", kapanmışta "First/Second shift") + "Give / receive: x h / y h…" — `ShiftExchangeHub.tsx:1136-1202`
- Vardiya kartı: tarih, saat, saat toplamı, ücretsiz mola, lokasyon · job, saat dilimi, "Ends next day", saat değişimi kutusu ("Clock change during this shift." / repeated clock), atama satırı ("Currently responsible"/"Historical details"/"No longer published", "You") — `employee-hub/shift-exchanges/ExchangeShiftCard.tsx:22-146`
- "Decision needed before …" — `ShiftExchangeHub.tsx:1203-1211`
- Aday listesi (talep sahibi): "N active candidates"/"Application results", açıklama (direct vs pool), aday satırı (ad, durum, zaman, "Eligible"/"Recheck needed"), "No volunteers yet…" — `ShiftExchangeHub.tsx:1212-1306`
- Kendi başvurusu kutusu: durum başlığı, gerekçe, "Not added to your schedule yet…", "Accepting sends this request…", uygunluk uyarısı; "Accept request"/"Accept anyway", "Decline", "Withdraw acceptance"/"Withdraw request" — `ShiftExchangeHub.tsx:1307-1387`
- "Close cover search" / "Cancel swap request" (talep sahibi) — `ShiftExchangeHub.tsx:1454-1465`
- Ayrıntı hata satırı — `ShiftExchangeHub.tsx:1466-1470`
- "Request history" açılır listesi — `ShiftExchangeHub.tsx:1471-1483`
- "View current schedule" (→ 7.1) — `ShiftExchangeHub.tsx:1484-1491`
- Kapatma penceresi "Close this search" (ExchangeDialog): açıklama başvuru sayısıyla ("Nobody has applied yet." / "The 1 active application will close." / "All N active applications will close."), vardiya kartları, "Reason shared with affected employees" (zorunlu), "Back", iki tık kırmızı "Close search" → "Confirm close"; talep bitmişse "Request updated" + "View latest result" — `ShiftExchangeHub.tsx:1492-1662`, `ShiftExchangeHub.tsx:124-201`
- "Request unavailable" paneli (`?case=` bulunamadı) — `ShiftExchangeHub.tsx:889-899`
- "Find cover or swap" penceresi (`?offer=<shift>`; 7.0 çekmecesinden ya da "Start a new…" ile): "Your shift" seçimi, vardiya kartı, "This shift already has an active request." + "View request", "What would help?" (Find cover / Swap shifts), "Who can help?" (Offer to eligible teammates / Ask a teammate), "Eligible teammate (shift)" seçimi ve durum satırı ("Checking eligibility…", "We couldn't check eligible matches…" + "Retry eligibility check", "This match is no longer available…", "No eligible matches…" + "Start a cover search instead"), "YOU RECEIVE" önizlemesi (+ uygunluk uyarısı), "Private note for your manager", sorumluluk notu, hata, "Cancel" ve "Offer shift"/"Send cover request"/"Send swap request"/"Request swap anyway" — `ShiftExchangeHub.tsx:1667-2037`
- Vazgeçme onayı "You have an unfinished request…" + "Keep editing"/"Discard request" — `ShiftExchangeHub.tsx:1746-1758`
- Canlı güncelleme (realtime) kabukta: `employee-hub/shift-exchanges/useExchangeRealtime.ts` (`shell/AppShell.tsx:185`)
- Not: Shift Hub içinde "yeni talep" düğmesi yok; pencere yalnız `?offer=` ile açılır (`ShiftSheet.tsx:106-112`, `ShiftExchangeHub.tsx:883`).

### Senaryolar
- [✅ available] Açık vardiyalar listesi · rol: employee · nasıl: /app/employee-hub/shift-hub · mock: var
- [✅ time-off] İzinli saate denk gelen soluk kart · rol: employee · nasıl: Available (Fri) · mock: var
- [✅ cover] Üstlenme isteği gönderildi (başarı satırı, detay açık) · rol: employee · nasıl: Request to cover · mock: var
- [✅ mine] Taleplerim · rol: employee · nasıl: My requests · mock: var
- [✅ history] Geçmiş · rol: employee · nasıl: History · mock: var
- [❌ EKSİK] "Availability conflict" kartı + "Request anyway" · rol: employee · nasıl: Available · mock: var mı belirsiz (`availabilityWarning` Maria'nın tercihine bağlı); yoksa eksik: Maria'nın unavailable gününe açık vardiya
- [❌ EKSİK] Başvurulmuş kart ("Awaiting manager…" + View request) · rol: employee · nasıl: Available → Request to cover → Available'a dön · mock: var
- [❌ EKSİK] Available boş · rol: employee · nasıl: süzgeçle hiç eşleşme yok (ör. arama "zzz") · mock: var
- [❌ EKSİK] Arama/lokasyon süzgeci · rol: employee · nasıl: süzgeç kutusu · mock: var
- [❌ EKSİK] Takas daveti detayı (You give / You receive, Accept request, Decline) · rol: employee · nasıl: My requests → Priya'nın takası · mock: var
- [❌ EKSİK] Daveti kabul et → "Request accepted. Waiting for final manager approval." · rol: employee · nasıl: Accept request · mock: var
- [❌ EKSİK] Daveti reddet · rol: employee · nasıl: Decline · mock: var
- [❌ EKSİK] "Accept anyway" (uygunluk çakışmalı davet) · rol: employee · nasıl: davet detayı · mock: eksik: çakışmalı davet
- [✅ own-search] Kendi cover araması detayı (aday listesi, private note, Close cover search) · rol: employee · nasıl: My requests → kendi talebi · mock: var
- [✅ close-search] Aramayı kapat penceresi (gerekçe boşken düğme kapalı → yaz → kırmızı Close search → Confirm close) · rol: employee · nasıl: Close cover search · mock: var
- [❌ EKSİK] Kendi takas talebini iptal penceresi "Cancel this swap request" ("Your swap request with … ends. You both keep your own shifts.", kırmızı Cancel request → Confirm cancel) · rol: employee · nasıl: Cancel swap request · mock: eksik: Maria'nın açtığı takas
- [❌ EKSİK] Kendi başvurusunu geri çek (Withdraw request) · rol: employee · nasıl: başvurulmuş talep detayı · mock: var (cover senaryosundan sonra)
- [❌ EKSİK] Onaylanmış talep detayı ("Transfer approved", Request history) · rol: employee · nasıl: History → Approved · mock: var
- [❌ EKSİK] Kendi kapattığı talep + "Start a new cover or swap request" · rol: employee · nasıl: History → Search closed · mock: var
- [❌ EKSİK] Invalidated talep ("Shift details changed…" bandı) · rol: employee · nasıl: History · mock: eksik: Maria'ya ait invalidated case (bugün Ethan'ın)
- [❌ EKSİK] Expired talep · rol: employee · nasıl: History · mock: eksik: Maria'ya ait expired case
- [❌ EKSİK] "No longer published" / "Check current assignments" sorumluluk kutusu · rol: employee · nasıl: detay · mock: eksik: yayından kalkmış vardiyalı case
- [❌ EKSİK] Saat değişimi (DST) kutulu vardiya kartı · rol: employee · nasıl: kart · mock: eksik: DST gecesini kesen vardiya
- [❌ EKSİK] "Request unavailable" (?case=bilinmeyen) · rol: employee · nasıl: /app/employee-hub/shift-hub?case=<uuid> · mock: var
- [❌ EKSİK] "outside your list filters" bandı · rol: employee · nasıl: detay açıkken süzgeçle başka lokasyon · mock: var
- [❌ EKSİK] Find cover or swap: Find cover → Offer to eligible teammates → Offer shift · rol: employee · nasıl: 7.0 → View shift → Find cover or swap · mock: var
- [❌ EKSİK] Find cover: Ask a teammate (aday seçimi) · rol: employee · nasıl: aynı pencere · mock: var
- [❌ EKSİK] Swap shifts: takım arkadaşı vardiyası seçimi + YOU RECEIVE önizlemesi · rol: employee · nasıl: aynı pencere · mock: var
- [❌ EKSİK] "This shift already has an active request." · rol: employee · nasıl: ?offer=<Maria'nın arama açık vardiyası> · mock: var
- [❌ EKSİK] "No eligible matches…" + "Start a cover search instead" · rol: employee · nasıl: Swap seç, eşleşmesi olmayan vardiya · mock: var mı belirsiz; eksik: eşleşmesiz vardiya
- [❌ EKSİK] Aday kontrolü hatası + "Retry eligibility check" · rol: employee · nasıl: aynı pencere · mock: eksik: shift_id sorgusuna 500
- [❌ EKSİK] Not yazıp kapatınca "Keep editing / Discard request" · rol: employee · nasıl: not yaz → Cancel · mock: var
- [❌ EKSİK] Yükleniyor iskeleti · rol: employee · nasıl: ilk açılış · mock: eksik: gecikme
- [❌ EKSİK] "Shift Hub is unavailable" · rol: employee (ya da çalışan kaydı olmayan owner) · nasıl: okuma 403/500 · mock: var (owner/manager employee view → 403 "Employee profile required"; ama önce hub kartı yetkisiz düşer) / 500 için eksik
- [❌ EKSİK] Çevrimdışı bandı (düğmeler kapalı) · rol: employee · nasıl: ağ kesik · mock: eksik: offline taklidi
- [❌ EKSİK] "Couldn't refresh these requests." · rol: employee · nasıl: yenileme hatası · mock: eksik: ikinci okumada 500
- [❌ EKSİK] Komut hatası (409 eski revizyon) · rol: employee · nasıl: Accept · mock: eksik: revizyon çakışması üreten setup
- [❌ EKSİK] Telefon: detay tam ekran ve kaydırma · rol: employee · nasıl: 390 px → bir talep · mock: var

## 7.3 My availability — /app/employee-hub/my-availability

B görünümü (main 3b138c3b, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son tablo kalır ve üstte "didn't refresh" satırı + Try again. Kart: "We couldn't load availability". PAGES senaryoları: `loading` (yeni), `load-error`.

### Parçalar
- Sayfa başlığı "My Availability" / "WHEN YOU CAN WORK." — `views/EmployeeHubPage.tsx:58-62`
- Sekmeler "Availability" / "Time Off Requests" (ok tuşları, `?section=`; eski `?tab=time-off-request`, `#time-off`, `#request-…` de izin sekmesini açar) — `EmployeeHubPage.tsx:197-245`
- Sekme değişiminde kaydedilmemiş değişiklik penceresi ("Discard availability changes?" / "Discard time off changes?", "Stay here", "Discard and leave"; kayıt sürerken "Saving …"; sonra "… saved" + "Continue") — `availability/availability-navigation.tsx:17-24, 236-262`
- Availability sekmesi (`WeeklyPreferencesPanel`, çalışan kipi): yükleniyor gri satırlar, okuma hatası çerçevesiz kart "We couldn't load availability" + "Try again" (yetkisizse "You don't have access to this availability.") — `availability/WeeklyPreferencesPanel.tsx:89-119`
- Başlık "Weekly availability" + "Submitted"/"Not submitted" rozeti — `availability/WeeklyPreferencesForm.tsx:265-289`
- Açıklama "Availability is a preference, not a guarantee…" — `WeeklyPreferencesForm.tsx:291-296`
- Haftalık düzenleyici: Available/Unavailable açıklaması, gün satırları, "All day" anahtarı, saat aralıkları ("Add hours", aralık sil, günde en çok 12), shift-type kipinde vardiya türü düğmeleri ("Previous" eski tür) ve "Shift default hours" bilgi düğmesi — `availability/WeeklyUnavailableEditor.tsx:113-366`
- Alt çubuk: açıklama "Changes apply immediately…", hata (+ çakışmada "Reload"), durum "Saving..."/"Saved"/"Unsaved changes", "Discard", "Save" — `WeeklyPreferencesForm.tsx:360-433`
- Time Off sekmesi: "Request time off" kutusu — `EmployeeHubPage.tsx:329-398`
  - "Hours use <zone>." — `:340`
  - Start / End tarih — `:341-361`
  - "Requested time": Full day / Specific hours / Different hours by date — `:362-372`
  - Saat alanları (Requested period N, Start/End time, "Ends the next day (+1 day)", "End of day", "Replace hours with a shift type", DST "Repeated clocks…" açılır, "Remove period N", "Add another period" en çok 4) — `employee-hub/TimeOffHourFields.tsx:8-49`
  - Tarih tarih alanlar ("Leave for this date": Full day / Specific hours / No leave on this date) — `employee-hub/TimeOffDateFields.tsx:6-28`
  - Uyarılar: 31 günü aşma, kapsam dışı özel günler, kip değişince saklanan düzenlemeler, "N requested period(s) across N date(s)", "This starts soon…", "This time off has already started…", şema doğrulama hatası — `EmployeeHubPage.tsx:374-381`
  - "Note" + "Submit request", "Request sent.", sunucu hatası — `EmployeeHubPage.tsx:382-397`
- "Time off requests" listesi: başlık, ayrıntı, durum · "Submitted …" · "Decision by …", dönemler listesi (Approved/Declined/Revoked, "Cancelled leave"/"Still approved", DST seçimi), "Manager decisions" (karar, "Manager note:", "Entire shift released to open coverage"), "Cancel request"/"Withdraw cancellation request", boş "No time off requests submitted yet.", hata ("This request changed. Review it again.") — `EmployeeHubPage.tsx:399-452`, `employee-hub/TimeOffPeriods.tsx:5-22`, `employee-hub/TimeOffReleasedAssignments.tsx:4-14`
- Onaylı izni iptal isteme: "Cancellation awaiting manager review…", "Request leave cancellation", form "Cancel approved leave" (dönem onay kutuları, "This period has started…", "Approved bounds", "Choose hours" → Starts on/Start time/Ends on/End time/Repeated time + "Apply hours"/"Discard these edits", "Add another time range", "Cancellation note", uyarılar, "Send cancellation request", "Keep approved leave"), başarı "Cancellation requested…" — `employee-hub/TimeOffCancellation.tsx:74-109`, `employee-hub/TimeOffCancellationHours.tsx:15-71`

### Senaryolar
- [✅ week] Haftalık tercihler · rol: employee · nasıl: /app/employee-hub/my-availability · mock: var
- [✅ add] Pazartesiye saat ekle (Unsaved changes) · rol: employee · nasıl: Add hours on Monday · mock: var
- [✅ timeoff] Time Off Requests sekmesi · rol: employee · nasıl: Time Off Requests · mock: var
- [❌ EKSİK] Kaydet → "Saved" · rol: employee · nasıl: Add hours → Save · mock: var
- [❌ EKSİK] Kayıt çakışması + Reload · rol: employee · nasıl: Save (409 availability.changed) · mock: eksik: revizyon çakışması setup
- [❌ EKSİK] "All day" unavailable gün · rol: employee · nasıl: gün anahtarı · mock: var
- [❌ EKSİK] Shift-type kipi (vardiya türü düğmeleri, Shift default hours) · rol: employee · nasıl: My availability · mock: eksik: input_mode=shift_type ayarı
- [❌ EKSİK] "Not submitted" hali · rol: employee · nasıl: My availability · mock: var mı belirsiz; eksik: hiç göndermemiş çalışan
- [❌ EKSİK] Kaydedilmemişken sekme/sayfa değiştirme penceresi (Stay here / Discard and leave) · rol: employee · nasıl: Add hours → Time Off Requests · mock: var
- [❌ EKSİK] Availability okuma hatası + Retry · rol: employee · nasıl: okuma 500 · mock: eksik
- [❌ EKSİK] Tam gün izin isteği gönder → "Request sent." · rol: employee · nasıl: Time Off → Start/End → Submit request · mock: var
- [❌ EKSİK] Specific hours (çok dönem, +1 gün, End of day, shift type'tan doldur) · rol: employee · nasıl: Requested time → Specific hours · mock: var
- [❌ EKSİK] Different hours by date (tarih başına kip, No leave) · rol: employee · nasıl: Requested time → Different hours by date · mock: var
- [❌ EKSİK] 31 günden uzun aralık uyarısı · rol: employee · nasıl: 40 günlük aralık · mock: var
- [❌ EKSİK] "This starts soon…" (24 saatten yakın) · rol: employee · nasıl: yarın için istek · mock: var (time_off_lead_hours 24)
- [❌ EKSİK] "This time off has already started…" · rol: employee · nasıl: bugün geçmiş saat · mock: var
- [❌ EKSİK] Sunucu reddi (InlineError) · rol: employee · nasıl: Submit · mock: eksik: time-off POST 400
- [❌ EKSİK] Bekleyen isteği iptal et (Cancel request) · rol: employee · nasıl: Dentist → Cancel request · mock: var
- [❌ EKSİK] Onaylı izin, karar notu ve "Decision by" satırları · rol: employee · nasıl: liste · mock: var (Cousin's wedding)
- [❌ EKSİK] Serbest bırakılan vardiya ("Entire shift released to open coverage") · rol: employee · nasıl: liste · mock: var mı belirsiz; eksik: released_assignments'lı karar
- [❌ EKSİK] Reddedilmiş istek · rol: employee · nasıl: liste · mock: eksik: Maria'ya denied kayıt
- [❌ EKSİK] Geri alınmış (revoked) istek · rol: employee · nasıl: liste · mock: eksik: revoked kayıt
- [❌ EKSİK] İzin iptal formu (Request leave cancellation → Choose hours → Apply → Send) · rol: employee · nasıl: Cousin's wedding · mock: var
- [❌ EKSİK] İptal formu doğrulama ("Select at least one…", çakışan dönem, "Cancellation must end after it starts.") · rol: employee · nasıl: iptal formu · mock: var
- [❌ EKSİK] İptal bekliyor ("Cancellation awaiting manager review…", "Withdraw cancellation request") · rol: employee · nasıl: liste · mock: eksik: bekleyen iptal kaydı (ya da yukarıdaki gönderimden sonra)
- [❌ EKSİK] Kısmen iptal edilmiş izin ("Cancelled leave" / "Still approved") · rol: employee · nasıl: liste · mock: eksik: cancelled_intervals'lı kayıt
- [❌ EKSİK] "The approved leave changed…" (eski revizyon) · rol: employee · nasıl: iptal gönder · mock: eksik: 409 setup
- [❌ EKSİK] Hiç istek yok · rol: employee · nasıl: liste · mock: eksik: istek olmayan çalışan
- [❌ EKSİK] İzin taslağı varken ayrılma penceresi ("Discard time off changes?") · rol: employee · nasıl: tarih seç → sol menü/alt menü · mock: var
- [❌ EKSİK] Telefon görünümü · rol: employee · nasıl: 390 px · mock: var

## 7.4 More — /app/employee-hub/more

### Parçalar
- Başlık "More" / "EVERYTHING ELSE." (hub verisi okunmaz) — `views/EmployeeHubPage.tsx:63-67, 116-128`
- "Everything else, one tap away." — `employee-hub/EmployeeMobileNav.tsx:110`
- Bağlantılar: "Management view" (yalnız employee olmayan), "My availability", "Announcements" (announcements.read), "Notifications", "My account" (avatar), "Switch workspace" (workspace adı), "Notification preferences" — `EmployeeMobileNav.tsx:56-123`
- "Sign out" — `EmployeeMobileNav.tsx:125-128`
- Tanınmayan alt yol (`/app/employee-hub/xyz`) da bu sayfayı "Employee Hub" başlığıyla gösterir — `EmployeeHubPage.tsx:69-73, 190-191`
- Not: Sign out burada kaydedilmemiş availability uyarısından geçmez (kabuktaki Sign out geçer: `shell/AppShell.tsx:282-285`).

### Senaryolar
- [✅ employee] Çalışanın More sayfası · rol: employee · nasıl: /app/employee-hub/more · mock: var
- [❌ EKSİK] Owner/manager employee view'da More ("Management view" satırı) · rol: owner/manager · nasıl: Employee view → More · mock: var (More hub verisi istemez, yetkisiz kartı çıkmaz)
- [❌ EKSİK] Announcements satırı yok (izinsiz rol) · rol: özel · nasıl: More · mock: eksik: announcements.read'siz rol
- [❌ EKSİK] Telefon alt menüsünde More aktif · rol: employee · nasıl: 390 px → More · mock: var
- [❌ EKSİK] Tanınmayan alt yol (/app/employee-hub/foo) · rol: employee · nasıl: adres · mock: var
- [❌ EKSİK] Sign out · rol: employee · nasıl: Sign out → 1.0 · mock: var

## 8.0 Announcements — /app/announcements

B görünümü (main 5d83f506, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez. Kart: "We couldn't load announcements". Duyuru çekmecesindeki okuma hatası da aynı kart (küçük başlık).

### Parçalar
- Yetkisiz kartı "You don't have access to announcements" — `views/AnnouncementsPage.tsx:136-142`
- Başlık "Announcements" / "THE RIGHT UPDATE. THE RIGHT PEOPLE." ; açıklama yazana ve okura göre — `AnnouncementsPage.tsx:148-157`
- Durum sekmeleri (yazan): All, Draft (sayı), Scheduled (sayı), Published, "Archived"; okurda sekme yok (boş 40 px satır) — `AnnouncementsPage.tsx:159-227`
- "All locations" süzgeci (okurda duyurulardan türetilir) — `AnnouncementsPage.tsx:229-241`
- "Search announcements" — `AnnouncementsPage.tsx:242-250`
- "New announcement" (yalnız can_manage) — `AnnouncementsPage.tsx:251-256`
- Sonuç satırı ("Announcement saved as a draft.", "Scheduled announcement updated.", "Published for N recipients.", "Announcement archived.") — `AnnouncementsPage.tsx:259-263, 572-601`
- Yükleniyor gri iskelet / hata kartı "We couldn't load announcements" + Try again — `AnnouncementsPage.tsx`
- Tablo başlıkları (sıralanabilir): yazan Announcement/Audience/Status/Publish date; okur Announcement/Published date/Published by/Status — `AnnouncementsPage.tsx:274-318`
- Satır: ikon, başlık, metin önizlemesi, telefonda alt satır (durum ya da yazar · tarih) — `AnnouncementsPage.tsx:320-365`
- Okur hücreleri: tarih, yazar, "Acknowledge"/"Acknowledge again"/onaylandı tiki — `AnnouncementsPage.tsx:366-388`, `:907-950`
- Yazan hücreleri: hedef kitle özeti, durum çipi (yeşil Published, amber Scheduled, gri Draft/Archived/Unpublished), "Not published" — `AnnouncementsPage.tsx:389-420`
- Satır menüsü "Actions for <başlık>": "Edit announcement"/"View announcement", "Archive" (→ 8.1 `?archive=1`) — `AnnouncementsPage.tsx:421-441`
- Boş: "No announcements yet" / "No matching announcements" — `AnnouncementsPage.tsx:445-461`
- Telefon: araç satırı tam genişlik, tablo sütunları satır içi alt bilgiye iner — `styles.css:1366-1390`, `views/announcements-catalog.css`

### Senaryolar
- [✅ owner] Owner listesi · rol: owner · nasıl: /app/announcements · mock: var
- [✅ manager] Manager listesi · rol: manager · nasıl: /app/announcements · mock: var
- [✅ employee] Çalışan (okur) listesi, Acknowledge düğmeleri · rol: employee · nasıl: /app/announcements · mock: var
- [✅ new] Yeni duyuru çekmecesi · rol: owner · nasıl: New announcement · mock: var
- [✅ drafts] Draft sekmesi · rol: owner · nasıl: Draft · mock: var
- [❌ EKSİK] Scheduled sekmesi · rol: owner · nasıl: Scheduled · mock: var (Thanksgiving)
- [❌ EKSİK] Published sekmesi · rol: owner · nasıl: Published · mock: var
- [❌ EKSİK] Archived sekmesi · rol: owner · nasıl: Archived · mock: var (Summer patio hours)
- [❌ EKSİK] Lokasyon süzgeci ve arama · rol: owner/employee · nasıl: All locations → Downtown; arama · mock: var
- [❌ EKSİK] Sütun sıralama · rol: owner · nasıl: başlığa tıkla · mock: var
- [❌ EKSİK] Süzgeçle sonuç yok · rol: owner · nasıl: arama "zzz" · mock: var
- [❌ EKSİK] Hiç duyuru yok · rol: owner/employee · nasıl: liste · mock: eksik: boş duyuru verisi
- [❌ EKSİK] Satırdan Acknowledge (okur) → tik · rol: employee · nasıl: Acknowledge · mock: var
- [❌ EKSİK] "Acknowledge again" (metin onaydan sonra değişti) · rol: employee · nasıl: liste · mock: eksik: acknowledged_before'da employee olan duyuru
- [❌ EKSİK] Satır menüsü açık · rol: owner · nasıl: Actions for … · mock: var
- [❌ EKSİK] Kaydetme/yayın sonrası sonuç satırı · rol: owner · nasıl: 8.1'de Save draft/Publish → liste · mock: var
- [❌ EKSİK] Yükleniyor · rol: herkes · nasıl: ilk açılış · mock: eksik: gecikme
- [❌ EKSİK] Okuma hatası satırı · rol: herkes · nasıl: okuma 500 · mock: eksik
- [✅ no-permission] Yetkisiz kartı · rol: özel · nasıl: API authz · mock: var (izinsiz rol adresi yazınca da aynı adreste kart; 28aeb82b)
- [❌ EKSİK] announcements.read olmayan rol → ana sayfaya yönlendirme · rol: özel · nasıl: adres · mock: eksik: izinsiz rol
- [❌ EKSİK] Telefon görünümü · rol: employee · nasıl: 390 px · mock: var

Güncelleme (main 4662a826): yukarıdaki parça listesi e0763dd5 okumasıdır; dört sekmeli çekmece (Details · Audience · Shifts · History), 12h/24h saatler ve tek listeli Audience (Who gets it, + Add people araması, en sonda Ask people to acknowledge; telefonda alt düğmeler tek satır) geldi; "Archive: unpublish first" satırı kalktı. Güncel senaryolar:

### Güncel PAGES senaryoları (4662a826)
- **Roller**
  - [✅ `owner`] Owner · Mert Tepebas · owner
  - [✅ `manager`] Manager · Rachel Adams (Downtown) · manager
  - [✅ `employee`] Employee · Maria Lopez · employee
  - [✅ `admin`] Admin · Daniel Brooks: owner gibi bütün duyurular · admin
  - [✅ `shift-lead`] Shift Lead (özel rol, yalnız okur): New yok, yalnız kendisine gelenler · custom
- **Yeni duyuru · New**
  - [✅ `new`] Yeni duyuru çekmecesi · owner
  - [✅ `where`] Yeni duyuru: Details'ta şubeler ve yayın zamanı · owner
  - [✅ `saved`] Taslak kaydedildi: listede Draft · owner
  - [✅ `missing`] Eksik alan: Next başlığı boşken uyarır · owner
  - [✅ `add-people`] Audience tek liste (Who gets it): + Add people, "server" ara, birini işaretle · owner
- **Sekmeler, süzgeçler ve sıralama · Status, filters, sorting**
  - [✅ `drafts`] Taslaklar · owner
  - [✅ `scheduled`] Zamanlananlar · owner
  - [✅ `archived`] Arşiv · owner
  - [✅ `sort`] Status sütununa göre sıralı · owner
  - [✅ `employee-past`] Çalışan · geçmiş duyurular · employee
  - [✅ `published`] Published sekmesi: Active ve Past başlıkları · owner
  - [✅ `location`] Lokasyon süzgeci: Downtown · owner
  - [✅ `search`] Arama: menu · owner
  - [✅ `reader-search`] Çalışan arar: cooler · employee
  - [✅ `sort-date`] Published on sütununa göre sıralı · owner
  - [✅ `sort-desc`] Announcement sütunu, ters sıra (Z → A) · owner
  - [✅ `no-match`] Süzgeçle sonuç yok: Nothing active. · owner
- **Sayfa durumları**
  - [✅ `empty`] Hiç duyuru yok · owner
  - [✅ `empty-reader`] Çalışan, hiç duyuru yok · employee
  - [✅ `loading`] Yükleniyor: listenin gri iskeleti · owner
  - [✅ `error`] Okunamadı: We couldn't load announcements + Try again · owner
  - [✅ `no-access`] API reddi: erişim yok · employee
  - [✅ `no-permission`] announcements.read yok: Home'a yönlendirilir · employee

## 8.1 Announcement detail — /app/announcements/:announcementId

### Parçalar
- Çekmece (liste arkada kalır); etiket "Add announcement"/"Edit announcement"/"Announcement" — `views/AnnouncementsPage.tsx:470-479, 621-632`
- Başlık "New announcement"/"Edit announcement"/"Announcement", alt satır "<durum> · <yazar>", kapat "Close announcement" — `AnnouncementsPage.tsx:640-664`
- "Updated. Please acknowledge the new version." (okur, metin değişmiş) — `AnnouncementsPage.tsx:666-670`
- Alanlar: Title, Message (kendini büyüten), Category (General/Operations/Schedule), "Publish at" (isteğe bağlı), "Expires at" (isteğe bağlı); okurda kapalı — `AnnouncementsPage.tsx:671-746`
- "Audience" bölümü: "Everyone"/"Filtered audience" rozeti, açıklama, dört seçici (Roles, Locations, Departments, Jobs; "All …" kutusu, 6'dan fazla seçenekte arama, "No matches"/"No options available", silinmiş seçim "Archived selection") — `AnnouncementsPage.tsx:747-813, 952-1063`
- "Open related page" (okur, güvenli action_url varsa) — `AnnouncementsPage.tsx:814-822`
- "Save your changes before publishing." — `AnnouncementsPage.tsx:823-827`
- Hata satırı (409: "This announcement was changed by someone else…", "…was archived and can no longer be edited.") — `AnnouncementsPage.tsx:519-533, 828-834`
- Alt çubuk: iki tık "Archive" → "Confirm archive" ("Archiving..."), "Cancel"/"Close", "Acknowledge" (okur, taslak değilse), "Publish" ya da "Schedule" (publish_at gelecekteyse), "Save draft"/"Save changes" ("Saving...") — `AnnouncementsPage.tsx:836-901`
- `?archive=1` ile açılırsa Archive zaten kurulu (Confirm archive) gelir — `AnnouncementsPage.tsx:606-610`
- "This announcement is no longer available." (id bulunmazsa, liste altında) — `AnnouncementsPage.tsx:465-469`
- Not: Kodda yorum (comment) özelliği yok; "okundu" sayısı ekranda gösterilmiyor (yalnız onay tiki).

### Senaryolar
- [✅ employee] Okur çekmecesi, Acknowledge bekliyor · rol: employee · nasıl: Actions for Walk-in cooler repair on Tuesday → View announcement · mock: var
- [✅ owner] Owner zamanlanmış duyuruyu düzenliyor (Schedule düğmesi) · rol: owner · nasıl: Actions for Thanksgiving prix fixe menu → Edit · mock: var
- [✅ manager] Manager kendi taslağını düzenliyor · rol: manager · nasıl: Actions for Server section rotation → Edit · mock: var
- [❌ EKSİK] Yeni taslak kaydet → "Announcement saved as a draft." · rol: owner · nasıl: New announcement → Title/Message → Save draft · mock: var
- [❌ EKSİK] Manager yeni duyuru (kendi lokasyonu önceden seçili) · rol: manager · nasıl: New announcement · mock: var (can_target_workspace=false, tek lokasyon)
- [❌ EKSİK] Taslağı yayınla → "Published for N recipients." · rol: owner · nasıl: Winter uniform update → Publish · mock: var
- [❌ EKSİK] Değişiklik varken Publish kapalı + "Save your changes before publishing." · rol: owner · nasıl: taslakta alan değiştir · mock: var
- [❌ EKSİK] Hedef kitle seçicileri açık (Roles/Locations/Departments/Jobs, arama) · rol: owner · nasıl: Audience → Locations · mock: var
- [❌ EKSİK] "Archived selection" (silinmiş lokasyon/job seçili) · rol: owner · nasıl: düzenle · mock: eksik: arşivlenmiş job'a hedefli duyuru
- [❌ EKSİK] Doğrulama: boş başlık/metin ya da Expires < Publish → Save kapalı (mesaj yok) · rol: owner · nasıl: alanları boşalt · mock: var
- [❌ EKSİK] Arşivle (Archive → Confirm archive) → "Announcement archived." · rol: owner · nasıl: düzenle → Archive · mock: var
- [❌ EKSİK] Satır menüsünden Archive (?archive=1, kurulu gelir) · rol: owner · nasıl: Actions for … → Archive · mock: var
- [❌ EKSİK] Başkasının duyurusunu manager görüntülüyor (salt-okur + Acknowledge) · rol: manager · nasıl: owner duyurusu → View announcement · mock: var
- [❌ EKSİK] Arşivlenmiş duyuru (salt-okur, Archive yok) · rol: owner · nasıl: Archived → satır · mock: var
- [❌ EKSİK] Okur: "Open related page" · rol: employee · nasıl: Holiday time-off requests are open → View · mock: var (action_url /app/employee-hub)
- [❌ EKSİK] Okur: Acknowledge → tik · rol: employee · nasıl: çekmece → Acknowledge · mock: var
- [❌ EKSİK] Okur: "Updated. Please acknowledge the new version." + "Acknowledge again" · rol: employee · nasıl: çekmece · mock: eksik: acknowledged_before seed
- [❌ EKSİK] 409 "changed by someone else" · rol: owner · nasıl: Save changes · mock: eksik: revizyonu sunucuda artıran setup
- [❌ EKSİK] 409 "archived and can no longer be edited" · rol: owner · nasıl: Save · mock: eksik: setup
- [❌ EKSİK] Bilinmeyen id ("This announcement is no longer available.") · rol: herkes · nasıl: /app/announcements/<uuid> · mock: var
- [❌ EKSİK] Telefon çekmecesi · rol: employee · nasıl: 390 px · mock: var

Güncelleme (main 4662a826): yukarıdaki parça listesi e0763dd5 okumasıdır; dört sekmeli çekmece (Details · Audience · Shifts · History), 12h/24h saatler ve tek listeli Audience (Who gets it, + Add people araması, en sonda Ask people to acknowledge; telefonda alt düğmeler tek satır) geldi; "Archive: unpublish first" satırı kalktı. Güncel senaryolar:

### Güncel PAGES senaryoları (4662a826)
- **Roller**
  - [✅ `employee`] Çalışan okuyor (onay bekliyor) · employee
  - [✅ `manager`] Manager: kendi taslağı · manager
- **Durumlar · Scheduled, past, failed, unpublished**
  - [✅ `owner`] Owner: zamanlanmış duyuru · owner
  - [✅ `past`] Bitmiş duyuru: salt okunur, yalnız Archive · owner
  - [✅ `failed`] Yayınlanamadı · owner
  - [✅ `unpublished`] Yayından kalkmış duyuru · owner
- **Sekmeler · Audience (onaylar dahil), History**
  - [✅ `audience`] Kime gidiyor (Audience) · owner
  - [✅ `acks`] Onaylayanlar Audience'ta: N of M acknowledged, Remind · owner
  - [✅ `history`] Geçmiş (History) · owner
- **Yazma ve yayın · Write and publish**
  - [✅ `new-saved`] Yeni taslak kaydet · owner
  - [✅ `manager-new`] Manager yeni duyuru: kendi lokasyonu seçili gelir · manager
  - [✅ `publish`] Manager taslağını yayınlar: Next, Publish (vardiya etkisi yok) · manager
  - [✅ `later`] Schedule for later: yayın günü ve saati · owner
- **Yayından kaldırma ve arşiv · Unpublish, archive**
  - [✅ `unpublish-arm`] Unpublish ilk tık: Unpublish and tell N people? · owner
  - [✅ `unschedule`] Unschedule: tekrar taslak · owner
  - [✅ `archive`] Archive iki tık: Archive it? → arşivlendi · owner
  - [✅ `archived-view`] Arşivlenmiş duyuru: salt okunur · owner
- **Okur görünümü · Reader**
  - [✅ `reader-ack`] Okur onaylar: Acknowledged · employee
  - [✅ `reader-shift`] Okur, kapalı günde kaldırılan kendi vardiyasını görür · employee
  - [✅ `manager-other`] Manager, owner'ın iki lokasyonlu duyurusunu açar: salt okunur · manager
  - [✅ `shift-lead`] Shift Lead okur: kendisine gelen duyuru · custom
- **Hatalar · Errors**
  - [✅ `conflict-changed`] 409: başkası değiştirdi · owner
  - [✅ `unknown`] Bilinmeyen id: This announcement is no longer available. · owner

## 9.0 Notifications — /app/notifications

B görünümü (main 5d83f506, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez. Kart: "We couldn't load notifications". Vardiya ayrıntısı panelinde gri satırlar ve "We couldn't load the shift details" kartı. Yeni senaryo `shift-details-loading` (Panel yükleniyor).

### Parçalar
- Route izin kapısı yok (herkes açar); yetkisiz kartı yalnız API `authz.*` derse "You don't have access to notifications" — `App.tsx:458`, `views/NotificationsPage.tsx:136-142`
- Başlık "Notifications" / "UPDATES. ALERTS. ACTIONS." + "N unread." / "You're all caught up." — `NotificationsPage.tsx:150-155`
- Sekmeler "Unread (N)" / "Read (N)" ("N+" sonraki sayfa varsa), ok tuşları — `NotificationsPage.tsx:157-183`
- Kategori süzgeci: All categories, Schedule, Requests, Communications, Payroll, People, Security, System — `NotificationsPage.tsx:185-199, 441-455`
- "N selected" + toplu "Mark as read"/"Mark as unread" — `NotificationsPage.tsx:200-211`
- Hata satırı (işlem hatası) — `NotificationsPage.tsx:214-218`
- Tablo: "Select all shown notifications", gün grubu satırları (Today/Yesterday/tarih) — `NotificationsPage.tsx:220-251`
- Satır: seçim kutusu, başlık bağlantısı (action_url; hesap bildirimi → /account/security; tıklayınca okundu), önizleme, "View shift details"/"Hide shift details", kategori · önem (Action required vb.), saat, çöp kutusu "Dismiss …" (tek tık) — `NotificationsPage.tsx:279-354`
- Vardiya ayrıntısı paneli (yalnız `requests.shift_change.*` ve action_url'de `case=<uuid>` varsa): gri satırlar (yükleniyor), kart "We couldn't load the shift details" + "Try again", "Message when sent", "Current request" + durum, açıklama, "Updating assignments…", vardiya kartları + atama + "Open schedule" (manager telefonda gizli), "Open request" — `communications/NotificationShiftDetails.tsx:18-203`
- Yükleniyor gri iskelet / hata kartı "We couldn't load notifications" / boş "No unread notifications"/"No read notifications" — `NotificationsPage.tsx:374-394`
- "Load more" ("Loading...") — `NotificationsPage.tsx:396-404`
- Canlı güncelleme (realtime) ve sekmeler arası yenileme kabukta — `shell/AppShell.tsx:184, 223-253`
- Aynı bileşen /account/inbox'ta (11.6) yalnız hesap bildirimleriyle çalışır — `NotificationsPage.tsx:43, 52`

### Senaryolar
- [✅ owner] Owner Unread · rol: owner · nasıl: /app/notifications · mock: var
- [✅ manager] Manager Unread · rol: manager · nasıl: /app/notifications · mock: var
- [✅ employee] Çalışan Unread · rol: employee · nasıl: /app/notifications · mock: var
- [✅ read] Read sekmesi · rol: owner · nasıl: Read ( · mock: var
- [❌ EKSİK] Kategori süzgeci (ör. Requests) · rol: owner · nasıl: Notification category · mock: var
- [❌ EKSİK] Süzgeçle boş ("No unread notifications") · rol: owner · nasıl: kategori Payroll · mock: var
- [❌ EKSİK] Tek satır seç + Mark as read · rol: owner · nasıl: satır kutusu → Mark as read · mock: var
- [❌ EKSİK] Hepsini seç + Mark as unread (Read sekmesi) · rol: owner · nasıl: Read → Select all → Mark as unread · mock: var
- [❌ EKSİK] Dismiss · rol: owner · nasıl: çöp kutusu · mock: var
- [❌ EKSİK] Başlığa tıkla → hedef sayfa + okundu · rol: owner · nasıl: satır başlığı · mock: var
- [❌ EKSİK] Hesap (security) bildirimi → /account/security · rol: herkes · nasıl: Read → "new sign-in" satırı · mock: var
- [❌ EKSİK] "View shift details" paneli açık · rol: employee/manager · nasıl: shift_change satırı → View shift details · mock: eksik: action_url'e `?case=<uuid>` ekle (bugün `/app/employee-hub/shift-hub` ve `/app/schedule/requests` case'siz, düğme hiç çıkmıyor)
- [❌ EKSİK] Vardiya paneli yüklenemedi + Try again · rol: employee · nasıl: panel · mock: eksik: case bulunamayan/500
- [❌ EKSİK] "Load more" (30'dan fazla) · rol: owner · nasıl: liste sonu · mock: eksik: 31+ bildirim
- [❌ EKSİK] Yükleniyor · rol: herkes · nasıl: ilk açılış · mock: eksik: gecikme
- [❌ EKSİK] Okuma hatası · rol: herkes · nasıl: okuma 500 · mock: eksik
- [❌ EKSİK] İşlem hatası satırı · rol: herkes · nasıl: Mark as read 500 · mock: eksik
- [❌ EKSİK] Hiç bildirim yok · rol: herkes · nasıl: liste · mock: eksik: boş kutu
- [❌ EKSİK] Telefon görünümü (tablo dar) · rol: employee · nasıl: 390 px · mock: var

---

## YENİ 0.1 Kabuk · Sol menü (sidebar) — her /app/* sayfası

### Parçalar
- Kabuk sarmalı (`/app` ProtectedRoute workspace="complete" → DocumentAccessRoute → AppShell) — `App.tsx:293-302`, `shell/AppShell.tsx:182-516`
- Menü daralt/aç "Collapse menu"/"Expand menu" (daralınca simge rayı + uçan etiket) — `AppShell.tsx:296-310`
- Workspace adı (tepede, sade yazı) ve workspace değiştirici (0.4; alt bölümde Settings'in üstü, main 4169aef7) — `AppShell.tsx` sidebar-tools ve sidebar-footer
- Ana menü (izne ve role göre): yönetim bölümü Workspace, Schedule (telefonda yok), Requests (Schedule'ın altı), Employees, Documents (Employees'in altı), Availability, Important Dates; çalışan bölümü Home, Schedule, Shift Hub, My Availability (bölüm çizgisiyle); ortak Announcements, Notifications — `AppShell.tsx:57-168, 263-276, 317-411`
- Alt öğe grubunu aç/kapa "Expand/Collapse <Schedule|Employees>" — `AppShell.tsx:383-407`
- Notifications okunmamış rozeti ("99+"; daralmış rayda simge üstünde) — `AppShell.tsx:204-209, 320-381`
- Alt bölüm: Settings (yönetim kabuğunda, owner/admin ya da izin), "Employee view"/"Management view" (0.6), "Account" + bekleyen sayısı ("Account, N waiting on you"), "Sign out" (kaydedilmemiş availability uyarısıyla) — `AppShell.tsx:413-496`
- Yan panel yuvası: bir sayfa (ör. Schedule export) sol menüyü kendi paneliyle değiştirir — `shell/AppSidebarPanel.tsx:1-29`, `AppShell.tsx:294`
- Not: Kodda ayrı bir "üst çubuk" (top bar) ve kabuk düzeyinde "lokasyon seçici" yok; lokasyon seçimi sayfa içi süzgeçlerdedir. Bildirim zili de yalnız 7.0'da (`EmployeeDashboard.tsx:120-122`); kabukta zil yerine Notifications menü rozeti var.

### Senaryolar
- [❌ EKSİK] Owner menüsü (tüm yönetim öğeleri + Settings + Employee view) · rol: owner · nasıl: herhangi /app sayfası · mock: var
- [❌ EKSİK] Manager menüsü · rol: manager · nasıl: aynı · mock: var
- [❌ EKSİK] Çalışan menüsü (Home/Schedule/Shift Hub/My Availability + ortak) · rol: employee · nasıl: aynı · mock: var
- [❌ EKSİK] Özel rol: yalnız izinli öğeler (ör. schedule-only) · rol: özel · nasıl: aynı · mock: eksik: özel rolle giriş
- [❌ EKSİK] Daraltılmış ray + uçan etiket · rol: owner · nasıl: Collapse menu · mock: var
- [❌ EKSİK] Grup kapalı (Requests/Documents gizli) · rol: owner · nasıl: Collapse Schedule · mock: var
- [❌ EKSİK] Notifications rozeti (sayı, 99+) · rol: owner · nasıl: menü · mock: var (sayı), eksik: 100+
- [❌ EKSİK] Account bekleyen sayısı · rol: owner · nasıl: menü · mock: var (bekleyen davet sayılıyorsa)
- [❌ EKSİK] Sign out, kaydedilmemiş availability varken uyarı · rol: employee · nasıl: 7.3 Add hours → Sign out · mock: var
- [❌ EKSİK] Yan panel modu (Schedule export) · rol: owner · nasıl: /app/schedule/export · mock: var (3.1)
- [❌ EKSİK] 721–767 px arası: sol menü görünür ama Schedule öğesi yok · rol: owner · nasıl: 740 px · mock: var

## YENİ 0.2 Kabuk · Çalışan alt menüsü (telefon) — /app/employee-hub/* ve çalışan kabuğu

### Parçalar
- Alt menü "Employee navigation": Home, Schedule, Requests (→ Shift Hub), More; menüdeki üç sayfadan biri değilse More aktif — `employee-hub/EmployeeMobileNav.tsx:20-52`
- Yalnız ≤720 px'te görünür, sol menü gizlenir — `employee-hub/employee-dashboard.css:948-1000`
- Çalışan kabuğu: rolü employee olan herkes ya da employee view'daki yönetici (`data-employee-shell`) — `shell/AppShell.tsx:255-261, 291, 502`

### Senaryolar
- [❌ EKSİK] Telefonda Home aktif · rol: employee · nasıl: 390 px /app/employee-hub · mock: var
- [❌ EKSİK] Requests aktif (Shift Hub) · rol: employee · nasıl: 390 px → Requests · mock: var
- [❌ EKSİK] More aktif (Announcements/Notifications gibi başka sayfada) · rol: employee · nasıl: 390 px /app/announcements · mock: var
- [❌ EKSİK] Yönetici employee view'da telefondan · rol: owner · nasıl: 390 px → More → Employee view · mock: var (yetkisiz kartla)

## YENİ 0.3 Kabuk · Yönetim alt menüsü (telefon) — yönetim kabuğundaki /app/*

### Parçalar
- "Main navigation" çubuğu: izinli ilk 4 sayfa + "More" — `shell/ManagementMobileNav.tsx:15, 61-72`
- "More" sayfası (dialog): kalan sayfalar, Settings, "Employee view", "Account", "Sign out", kapat "Close", arka plana dokununca ve Esc ile kapanır — `ManagementMobileNav.tsx:73-119`, `AppShell.tsx:503-512`
- Yalnız ≤720 px — `shell/management-mobile-nav.css:9`

### Senaryolar
- [❌ EKSİK] Owner telefon çubuğu · rol: owner · nasıl: 390 px /app/workspace · mock: var
- [❌ EKSİK] More sayfası açık · rol: owner · nasıl: 390 px → More · mock: var
- [❌ EKSİK] Manager telefon çubuğu (daha az öğe) · rol: manager · nasıl: 390 px · mock: var
- [❌ EKSİK] Esc / arka plan ile kapanma · rol: owner · nasıl: More → Esc · mock: var

## YENİ 0.4 Kabuk · Workspace değiştirici — sol menünün başı

### Parçalar
- Tek workspace ve bekleyen davet yoksa yalnız ad — `shell/WorkspaceSwitcher.tsx:103-108`
- Daraltılmış rayda baş harf bağlantısı (→ /workspaces) + davet noktası — `WorkspaceSwitcher.tsx:110-120`
- Tetikleyici: ad + davet sayısı + ok — `WorkspaceSwitcher.tsx:124-136`
- Menü: "You are in" (ad + rol), "Switch to" listesi ("Setup unfinished" eki), "Invitation(s)" + "Waiting for your answer" + "Answer", "All workspaces"; dışarı tıklama ve Esc kapatır — `WorkspaceSwitcher.tsx:64-78, 137-211`
- Geçiş hata verirse /workspaces'e gider — `WorkspaceSwitcher.tsx:80-100`
- Çalışan telefonunda yok; yerine 7.0 bağlam çubuğu ve 7.4 "Switch workspace" (→ /account/workspaces)

### Senaryolar
- [❌ EKSİK] Menü açık (diğer workspace'ler + davet) · rol: owner · nasıl: workspace adı · mock: var (Cedar & Smoke daveti, Pier 9)
- [❌ EKSİK] Başka workspace'e geç · rol: owner · nasıl: Switch to → ad · mock: var mı belirsiz; eksik: ikinci hazır workspace
- [❌ EKSİK] Answer → /workspaces · rol: owner · nasıl: Answer · mock: var
- [❌ EKSİK] Tek workspace, yalnız ad · rol: employee · nasıl: sol menü · mock: var mı belirsiz
- [❌ EKSİK] Daraltılmış rayda baş harf · rol: owner · nasıl: Collapse menu · mock: var
- [❌ EKSİK] Geçiş hatası → hub · rol: owner · nasıl: geçiş · mock: eksik: select workspace hatası

Güncelleme (main 1d053cd2): Schedule'da kaydedilmemiş düzenleme varken başka workspace'e geçmek önce "Save changes before leaving?" diye sorar (3.0 "Ayrılma uyarısı" senaryoları). Güncel senaryolar:

### Güncel PAGES senaryoları (1d053cd2)
- **Roller**
  - [✅ `owner`] Tek workspace, davet yok: yalnız ad · owner
  - [✅ `manager`] Manager: yalnız ad · manager
  - [✅ `employee`] Çalışan: yalnız ad · employee
- **Değiştirici · Workspace switcher**
  - [✅ `many`] Başka workspace ve davet var: ad + davet sayısı · owner
  - [✅ `open`] Menü açık: Switch to, Setup unfinished, Invitation, All workspaces · owner
  - [✅ `collapsed`] Daraltılmış rayda baş harf ve davet noktası · owner
  - [✅ `answer`] Davete Answer: Workspaces sayfasına gider · owner
  - [✅ `switch-error`] Geçiş hatası: Saltline açılamaz, Workspaces sayfasına gider · owner
  - [✅ `all`] All workspaces bağlantısı · owner

Güncelleme (main 4169aef7, 2026-10-13 sabah, Mert): seçici sol menünün tepesinden alındı; sol menünün altında, Settings'in hemen üstünde, öbür satırlar ölçüsünde bir satır (harf rozeti, ad, ⇅) — `shell/AppShell.tsx` sidebar-footer'ın ilk satırı, `shell/WorkspaceSwitcher.tsx`. Tek workspace'te de tıklanır; menü yukarı açılır ve artık sol menünün kenarında kesilmez; daraltılmış rayda rozet kalır, menü sağa açılır. Tepede ☰'nin yanında ad sade yazı (`sidebar-workspace-name`), daraltılmış rayda yok. Davet sayısı yalnız Account satırında.

### Güncel PAGES senaryoları (4169aef7)
- **Roller**
  - [✅ `owner`] Tek workspace, davet yok: satır yine tıklanır · owner
  - [✅ `manager`] Manager: tek workspace satırı · manager
  - [✅ `employee`] Çalışan: tek workspace satırı · employee
- **Değiştirici · Workspace switcher**
  - [✅ `many`] Başka workspace ve davet var: satır + Account'ta davet sayısı · owner
  - [✅ `open`] Menü açık · owner
  - [✅ `collapsed`] Daraltılmış rayda harf rozeti · owner
  - [✅ `collapsed-open`] Daraltılmış rayda menü sağa açılır · owner
  - [✅ `single-open`] Tek workspace'te menü: You are in + All workspaces · owner
  - [✅ `answer`] Davete Answer · owner
  - [✅ `switch-error`] Geçiş hatası · owner
  - [✅ `all`] All workspaces bağlantısı · owner

## YENİ 0.5 Kabuk · Hesap menüsü — sol menü "Account"

### Parçalar
- Kabukta ayrı açılır hesap menüsü yok: "Account" satırı doğrudan /account/profile'a gider; avatar (`CurrentUserAvatar`) + bekleyen sayısı — `shell/AppShell.tsx:446-481`, `account/AccountAvatar.tsx:16-26`
- Telefonda: yönetimde More sayfasında "Account" (`ManagementMobileNav.tsx:99-106`), çalışanda 7.4 "My account" ve 7.0 avatar

### Senaryolar
- [❌ EKSİK] Account bekleyen sayılı satır · rol: owner · nasıl: sol menü · mock: var (attention route)
- [❌ EKSİK] Workspace avatarı ve küresel avatar farkı · rol: employee · nasıl: sol menü · mock: eksik: avatar fotoğrafı

## YENİ 0.6 Kabuk · Employee view geçişi

### Parçalar
- "Employee view" / "Management view" satırı (Account'un üstünde), `employee_hub.read` olan yönetici için — `shell/EmployeeViewSwitch.tsx:17-44`, `AppShell.tsx:258-260, 439-445`
- Telefon More'unda "Employee view" — `EmployeeViewSwitch.tsx:47-51`
- Employee view'da kabuk çalışan kabuğuna döner (çalışan menüsü, Settings gizli) — `AppShell.tsx:259-281`

### Senaryolar
- [✅ no-record] Owner → Employee view (çalışan kaydı yok → "You don't have access to Employee Hub") · rol: owner · nasıl: Employee view · mock: var
- [❌ EKSİK] Owner → Employee view (çalışan kaydı var) → Management view ile dönüş · rol: owner · nasıl: Employee view → Management view · mock: eksik: owner'a employeeId

## YENİ 0.7 Kabuk · Ortak durumlar (yükleniyor, yetkisiz, oturum, kurulum, belge kapısı)

B görünümü (main 54af9320, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Belge kapısı okunamazsa ortada "We couldn't check your documents" + Try again; 30 saniyelik tekrar kontrolü düşerse uygulama yerinde kalır. PAGES senaryosu: `documents-error`.

### Parçalar
- Sayfa parçası yükleniyor (lazy, boş `main` "Loading page") — `App.tsx:153-157`
- Oturum çözülüyor (boş `main` "Loading workspace") — `auth/ProtectedRoute.tsx:22-23`
- Oturum yok → /sign-in (dönüş adresi `state.from` ile) — `ProtectedRoute.tsx:25-33`
- Oturum düşmesi: API 401 ya da iptal edilmiş oturum → yerel çıkış + `newfork.sessionExpired` işareti → 1.0'da "expired" mesajı — `lib/supabase.ts:98-109, 129`, `auth/AuthContext.tsx:145-148, 201-220`
- Workspace yüklenemedi: "That workspace didn't load" + "Try again" (PreBiz çerçevesi, Sign out çerçevede) — `ProtectedRoute.tsx:35-58`
- Workspace yok → /workspaces — `ProtectedRoute.tsx:61`
- Kurulum bitmemiş (owner değil): "Almost ready" + "Check again" (+ "Choose a workspace") — `ProtectedRoute.tsx:63-73`, `auth/WorkspaceSetupPending.tsx:8-44`
- Belge kapısı: "Checking document requirements" (boş), "Document access could not be checked." + "Try again", kısıtlıysa /account/documents'a yönlendirme — `documents/DocumentAccessRoute.tsx:19-33`
- İzin/eylem kapısı: izinsiz route'ta sessiz yönlendirme (appLandingPath) — `auth/PermissionRoute.tsx:24-42`, `auth/ActionRoute.tsx:13-23`
- Yetkisiz kartı (tek bileşen): kilit, "You don't have access to <konu>", "Your role or your locations don't include it.", "Ask an admin for access.", "Back to Home" — `shell/NoAccessState.tsx:11-35`, karar `lib/no-access.ts:10-27`
- Telefonda kapalı ekran: "Schedule is available on a computer." — `auth/DesktopOnlyRoute.tsx:9-13`
- Bilinmeyen adres → /app → rol açılış sayfası — `App.tsx:585, 594-597`
- Hata sınırı (error boundary): kodda yok (`ErrorBoundary`/`errorElement` bulunmadı); bir bileşen çökerse sayfa beyaz kalır.

### Senaryolar
- [❌ EKSİK] Oturum düşmesi → Sign in "expired" · rol: herkes · nasıl: oturum iptal · mock: var (1.0 `expired` senaryosu yalnız sonucu gösterir; düşme anı yok)
- [❌ EKSİK] "That workspace didn't load" · rol: herkes · nasıl: context okuması hata · mock: eksik: resolveWorkspaceContext hatası
- [❌ EKSİK] "Almost ready" (kurulum bitmemiş, çalışan) · rol: employee · nasıl: /app · mock: eksik: onboarding.status≠complete workspace
- [❌ EKSİK] Belge kapısı yönlendirmesi · rol: employee · nasıl: /app/employee-hub → /account/documents · mock: eksik: documents/access restricted:true
- [❌ EKSİK] "Document access could not be checked." · rol: herkes · nasıl: /app · mock: eksik: access 500
- [✅ no-access] Yetkisiz kartı (genel örnek) · rol: özel · nasıl: API authz · mock: var (employee view örneği)
- [❌ EKSİK] Telefonda Schedule kapalı mesajı · rol: owner · nasıl: 390 px /app/schedule · mock: var
- [❌ EKSİK] İzinsiz route → sessiz yönlendirme · rol: employee · nasıl: /app/employees · mock: var
- [❌ EKSİK] Bilinmeyen adres · rol: herkes · nasıl: /app/xyz · mock: var

## YENİ 0.8 Kabuk · Toaster ve onay penceresi (ConfirmDialog)

### Parçalar
- Toaster: ekranın altı ortası, en çok 3, 6 sn, kapat düğmesi, success/error/warning/info simgeleri, çekmece açıkken de tıklanır katmanda — `App.tsx:147-152`, `packages/ui/src/components/Toaster.tsx:21-51`, `shell/toastLayer.ts:1-3`
- ConfirmDialog: başlık, açıklama, ek alan (ör. gerekçe), beyaz "Cancel", yeşil ya da kırmızı onay; Esc ve arka plan = Cancel; Tab pencere içinde döner; meşgulken kapanmaz — `shell/ConfirmDialog.tsx:31-147`; `useConfirmDialog` — `:155-177`
- Bu alandaki kullanım: kaydedilmemiş availability/izin uyarısı (7.3) — `availability/availability-navigation.tsx:236-262`
- Not: Bu alandaki sayfalar toast kullanmıyor (sonuçlar sayfa içi satırla); toast 39 yerde başka sayfalardan çıkar.

### Senaryolar
- [❌ EKSİK] Başarı toast'u · rol: owner · nasıl: başka sayfada kaydet (ör. Settings) · mock: var
- [❌ EKSİK] Hata toast'u · rol: owner · nasıl: kaydetme 500 · mock: eksik: hata anahtarı
- [❌ EKSİK] Çekmece açıkken toast · rol: owner · nasıl: çekmecede kaydet · mock: var
- [❌ EKSİK] ConfirmDialog yıkıcı (kırmızı) · rol: employee · nasıl: 7.3 Add hours → başka sayfa · mock: var
- [❌ EKSİK] ConfirmDialog meşgul ("Saving availability", onay kapalı) · rol: employee · nasıl: Save sürerken ayrıl · mock: eksik: kaydı geciktiren setup

---

## Bulgular (kodda görülen, test/arayüz için önemli)
- Hata sınırı yok: herhangi bir bileşen hatası bütün kabuğu beyaz bırakır (App.tsx'te ErrorBoundary/errorElement yok).
- Tek tık yıkıcı işlemler (iki tık kuralı dışında): 7.3 "Cancel request" (`EmployeeHubPage.tsx:427-442`), 7.0 hatırlatma silme (`PersonalReminders.tsx:120-131`), 7.2 "Decline"/"Withdraw…" (`ShiftExchangeHub.tsx:1356-1382`), 9.0 "Dismiss" (`NotificationsPage.tsx:339-352`).
- 8.1'de istemci doğrulaması başarısızsa (boş başlık, Expires < Publish) Save yalnız kapanır, neden yazılmaz (`AnnouncementsPage.tsx:554, 611`; şema mesajı `packages/shared/src/communications.ts:54`).
- 9.0 "View shift details" mock'ta hiç çıkmıyor: bildirimlerin action_url'inde `case=` yok.
- 7.4 More'daki "Sign out" kaydedilmemiş availability uyarısından geçmiyor (`EmployeeMobileNav.tsx:125`); kabuktaki geçiyor (`AppShell.tsx:282-285`).
- Shift Hub'da yeni cover/swap başlatan görünür düğme yok; yalnız 7.0 vardiya çekmecesinden `?offer=` ile.
- Telefon eşiği tutarsız: `usePhoneWidth` 767 px (Schedule gizlenir), alt menüler 720 px; 721–767 px'te sol menü Schedule'sız görünür.
- WorkspaceSetupPending "Choose a workspace" emekli `/organization-switcher`'a gidiyor (yönlendirmeyle /workspaces'e düşer) — `auth/WorkspaceSetupPending.tsx:37`.

## Sayılar
- Sayfa: 8 mevcut (7.0, 7.1, 7.2, 7.3, 7.4, 8.0, 8.1, 9.0) / 8 yeni gereken (0.1–0.8 Kabuk)
- Parça: 172 (alt maddeler dahil, "Not:" satırları hariç)
- Senaryo: 223 (✅ 28 / ❌ 195)
- Mock eksiği olan senaryo: 72 kesin + 6 belirsiz ("var mı belirsiz") = 78

---


# Alan: Envanter — Ayarlar (10.0–10.12, /app/settings/*)

Kaynak: `apps/web/src` (main e0763dd5). Dosya yolları `apps/web/src`'ye göredir (ör. `settings/LocationsSettingsPage.tsx:266`). Mock: `apps/web/.temp/pages/mock` (`settings-service.ts`, `settings-catalog.ts`, `settings-documents.ts`, `settings-store.ts`, `settings-permissions.ts`).

**Mock'un genel sınırları (her senaryoda tekrar yazılmadı, "mock" alanında kısaca anılır):**
- PAGES'te bütün Settings sayfaları yalnız `[owner]` rolüyle tanımlı (`tools/screens.py:202`). Mock izleyici yalnız owner / manager / employee bilir (`mock/viewer.ts`, `mock/api.ts:66`); **admin ve özel rol (custom role) izleyicisi yok**. Salt-okur görünümlerin neredeyse hepsi ancak admin'in izni daraltılırsa ya da özel rolle oluşur → "eksik: özel/admin izleyici".
- Mock'ta hata enjeksiyonu yok (`scenarios.ts:8` `setups` yalnız `session-expired`). Okuma hatası, 500, `authz.*` 403 → "eksik: hata setup'ı".
- Gecikme sabit 60 ms (`mock/api.ts:183`); "yükleniyor" durumu ekran görüntüsüne güvenilir girmez → "eksik: bekleten setup".
- Seed'de arşivli lokasyon/job/departman/vardiya türü/etiket, departmansız job, gece yarısını geçen vardiya türü yok; tablolar boş değil → boş durumlar için "eksik: boş seed setup'ı".

---

## 10 (ortak) Settings çerçevesi ve giriş kapısı — /app/settings (SettingsLayout)
Sayfa değil; bütün 10.x sayfalarının dış çerçevesi. Ayrı numara önerilmez; senaryoları 10.0'a eklenebilir.

### Parçalar
- **Giriş kapısı**: Settings'e girebilen = herhangi bir ayar sayfası kapısı açık olan ya da `documents.read` eylemi olan; değilse `/app`'e yönlendirme — `settings/SettingsLayout.tsx:113`, `settings/settings-access.ts:229`.
- **Sayfa kapıları** (hangi rol hangi sekmeyi görür) — `settings/settings-access.ts:191`:
  - General: `settings.general.read` izni · Locations: `settings.locations.read` izni (yalnız owner/admin; özel role verilemez) · Jobs: `settings.jobs.read` eylemi · Notifications: `settings.notifications.read` ya da `.write` eylemi · Schedule rules: `settings.schedule_rules.read` izni · Conflict handling: `settings.conflict_rules.write` eylemi (yalnız owner/admin + `schedule.conflict_rules.manage`) · Shift catalog: `settings.shift_catalog.read` eylemi · Roles & permissions: `settings.roles.read` (yalnız owner/admin, `roles.read`) · Documents ve Acknowledgements: `documents.read` · Support: Settings'e giren herkes.
  - Sistem rolleri: owner ve admin her sekmeyi görür (`packages/shared/src/index.ts:146`); sistem **manager** ve **employee** hiçbir ayar iznine sahip değil → Settings'e giremez. Özel rol (manager deneyimi) yalnız verilebilir okuma izinleriyle (General/Jobs/Shift catalog/Schedule rules okuma, Documents, Notification settings okuma) girer.
- **Sol ayar menüsü** "Settings" başlığı + 4 grup: Workspace (General, Locations, Jobs, Notifications) · Scheduling (Schedule rules, Conflict handling, Shift catalog) · Access (Roles & permissions, Documents, Acknowledgements) · Help (Support); kapısı kapalı link gizlenir, boş grup düşer — `settings/SettingsLayout.tsx:21`, `:117`, `:132`.
- **Aktif link**: Shift catalog, `/shift-labels`'ta da aktif — `settings/SettingsLayout.tsx:149`.
- **Ana menüdeki Settings bağlantısı** (sidebar altı ve telefon menüsü): yalnız owner/admin ya da `workspace.manage` / `roles.read` / `documents.read` izni olana görünür — `shell/AppShell.tsx:170`, `:277`, `:418`, `:507`. Not: bu kural `canEnterSettings` ile aynı değil (örn. yalnız `settings.jobs.read` olan özel rol Settings'e adresle girebilir ama bağlantıyı görmez).
- **/app/settings ana yönlendirmesi**: açık ilk sayfaya (General → Locations → Jobs → Shift catalog → Conflict → Schedule rules → Notifications → Roles → Documents), hiçbiri yoksa `/app/schedule` — `settings/SettingsHomeRedirect.tsx:4`, `settings/settings-access.ts:240`.
- **Sayfa kapısı reddi**: kapısı kapalı sayfanın adresi yazılırsa rolün açılış sayfasına (`appLandingPath`) yönlendirme — `settings/SettingsPageRoute.tsx:17`, `auth/resolveLanding.ts:65`.
- **API reddi kartı** (`NoAccessState`): "You don't have access to {subject}" / "Ask an admin for access." — sayfa okuması `authz.*` ile reddedilince; her sayfada kendi `subject`'iyle — `shell/NoAccessState.tsx:27`.
- **Telefon görünümü (≤720px)**: sol menü üstte yatay kaydırmalı şerit olur; "Settings" başlığı ve grup adları gizlenir; sayfa başlığındaki eylem düğmesi tam genişlik alt satıra iner — `styles.css:12692–12726`, `:12737`.
- **Yönlendirmeler**: `/app/settings/scheduling/shift-label` → `/shift-labels`; `/app/settings/important-dates`, `/closed-days`, `/important-dates/closed-days` → `/app/important-dates` (6.0) — `App.tsx:529–551`.

### Senaryolar
- [❌ EKSİK] /app/settings → General'e yönlenir · rol: owner · nasıl: /app/settings · mock: var
- [❌ EKSİK] Manager Settings'e giremez, /app'e döner (sidebar'da Settings yok) · rol: manager · nasıl: /app/settings/general adresini yaz · mock: eksik: Settings sayfalarının roller listesine manager eklenmeli (yönlendirme mock'ta çalışır)
- [❌ EKSİK] Employee Settings'e giremez · rol: employee · nasıl: /app/settings · mock: eksik: sayfa rollerine employee eklenmeli
- [❌ EKSİK] Admin sol menüsü (owner ile aynı 4 grup) · rol: admin · nasıl: /app/settings/general · mock: eksik: admin izleyici
- [❌ EKSİK] Özel rol, yalnız okuma izinleriyle: menüde yalnız açık sekmeler (ör. Jobs, Shift catalog, Documents, Acknowledgements, Support) · rol: özel · nasıl: /app/settings · mock: eksik: özel rol izleyici (ör. Shift Lead + settings.jobs.read, settings.shift_catalog.read, documents.read)
- [❌ EKSİK] Özel rol yalnız `settings.jobs.read` ile: sidebar'da Settings bağlantısı yok ama adresle girer · rol: özel · nasıl: /app/settings/jobs · mock: eksik: özel rol izleyici
- [❌ EKSİK] Kapısı kapalı alt sayfa adresi (ör. özel rol /app/settings/roles) → açılış sayfasına döner · rol: özel · nasıl: adres · mock: eksik: özel rol izleyici
- [✅ denied] Sayfa okuması API'den `authz.*` ile reddedilir → "You don't have access to …" kartı · rol: owner · nasıl: herhangi bir alt sayfa · mock: eksik: 403 authz setup'ı
- [✅ owner (her 10.x)] Telefon: üstte yatay ayar şeridi · rol: owner · nasıl: herhangi bir 10.x, telefon çerçevesi · mock: var
- [❌ EKSİK] /app/settings/scheduling/shift-label → Shift labels'a yönlenir · rol: owner · nasıl: eski adres · mock: var
- [❌ EKSİK] /app/settings/important-dates ve /closed-days → /app/important-dates · rol: owner · nasıl: eski adres · mock: var

---

## 10.0 Settings · General — /app/settings/general

B görünümü (main 48f81bc1, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kurulum listesi ve Preferred names satırlarında gri çizgi; okunamazsa satırın altında "This setting didn't load. Nothing was changed." + Try again ve düğme kapalı; erişim yoksa "You don't have access to this setting." PAGES senaryoları: `checklist-loading`, `checklist-read-error`, `preferred-read-error`, `checklist-no-access`.

### Parçalar
- Başlık "General" + "Workspace identity used across navigation and invitations." — `settings/GeneralSettingsPage.tsx:116`.
- **Schedule logo** satırı: logo çerçevesi (logo yoksa adından üretilen önizleme) + "Manage logo" düğmesi (izin yoksa pasif) — `:122–146`.
- **Workspace name** alanı (en çok 120, zorunlu, ABD harf kuralı "English letters only.") — `:147–170`, `shell/us-text`.
- Hata satırları (isim / logo kaydı) ve başarı satırı "Workspace settings saved." — `:171–185`.
- "Save changes" düğmesi (boş, harf kuralı ihlali, değişmemiş ya da izin yoksa pasif; kayıtta "Saving") — `:186–200`; RLS reddi metni "The workspace name wasn't saved: your role can't change it." — `settings/organization-data.ts:310`.
- **Setup checklist** bölümü: durum "Visible on Workspace" / "Hidden from Workspace" + "Hide checklist" / "Show checklist"; hata "Setup checklist visibility could not be saved." — `:202–239`.
- **Preferred names** bölümü: "Used as soon as it is entered" / "Answered here before it is used" + "Answer them here" / "Let them through"; hata "That setting could not be saved." — `:240–284`.
- **Schedule logo penceresi** (dialog): kapat (X ve arka plan), dosya seçici, önizleme, dosya adı + "SVG, PNG, JPEG, or WebP under 5 MB." + son güncelleme, "Upload"/"Replace", "Remove" (logo varsa), Scale / Horizontal / Vertical kaydırıcıları + "Reset" (logo yokken pasif), hata satırı, "Save" — `schedule/components/ScheduleLogoUploadDialog.tsx:144–290`; dosya doğrulama: "Use an SVG, PNG, JPEG, or WebP image." / "The selected image is empty." / "Logo must be 5 MB or smaller." — `:341–345`.
- Salt-okur: `settings.general.manage` yoksa bütün düğmeler ve isim alanı pasif (bilgilendirme şeridi yok) — `:32`.

### Senaryolar
- [✅ owner] Dolu sayfa · rol: owner · nasıl: /app/settings/general · mock: var
- [✅ checklist] Kurulum listesi gizlendi ("Show checklist") · rol: owner · nasıl: Hide checklist · mock: var
- [❌ EKSİK] Logo penceresi açık, logo yok · rol: owner · nasıl: Manage logo · mock: var
- [❌ EKSİK] Logo yüklendi: önizleme, kaydırıcılar etkin, Remove görünür · rol: owner · nasıl: Manage logo → dosya seç · mock: var (fake storage); senaryo adımı dosya yüklemeyi desteklemeli
- [❌ EKSİK] Logo dosyası reddi (tür / 5 MB) · rol: owner · nasıl: Manage logo → yanlış dosya · mock: eksik: adım dosya seçemez; setup ile hazır hata gerekir
- [❌ EKSİK] Logo kaldırılacak ("Logo will be removed") · rol: owner · nasıl: logolu workspace → Remove · mock: eksik: logolu seed setup'ı
- [❌ EKSİK] İsim değişti, kaydedildi ("Workspace settings saved.") · rol: owner · nasıl: isim yaz → Save changes · mock: var
- [❌ EKSİK] İsimde ABD harf kuralı hatası ("English letters only.") · rol: owner · nasıl: "Café Çınar" yaz · mock: var
- [❌ EKSİK] İsim boş → Save pasif · rol: owner · nasıl: alanı temizle · mock: var
- [❌ EKSİK] İsim kaydı reddi (RLS: "your role can't change it") · rol: admin (izni daraltılmış) · nasıl: Save · mock: eksik: admin izleyici + reddeden tablo
- [❌ EKSİK] Preferred names "Answered here" durumu · rol: owner · nasıl: Answer them here · mock: var
- [❌ EKSİK] Checklist / preferred name kayıt hatası · rol: owner · nasıl: düğme · mock: eksik: hata setup'ı
- [❌ EKSİK] Salt-okur General (bütün düğmeler pasif) · rol: özel (settings.general.read) · nasıl: /app/settings/general · mock: eksik: özel rol izleyici
- [❌ EKSİK] Admin görünümü (checklist düğmesi etkin; mock checklist PATCH'i yalnız owner'a izin verir) · rol: admin · nasıl: Hide checklist · mock: eksik: admin izleyici; `workspace-service.ts:243` owner-only kuralı gerçek API ile karşılaştırılmalı
- [✅ owner] Telefon görünümü · rol: owner · nasıl: telefon çerçevesi · mock: var

---

## 10.1 Settings · Locations — /app/settings/locations

B görünümü (main 48f81bc1, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kart: "We couldn't load locations". PAGES senaryoları: `loading`, `read-error`.

### Parçalar
- Başlık "SETTINGS / Locations" + açıklama — `settings/LocationsSettingsPage.tsx:213`.
- Sekmeler **Active / Archived** (klavyeyle gezilir) — `:221–245`.
- Arama "Search name or address" — `:248–256`.
- "New location" düğmesi (yalnız `settings.locations.manage`) — `:257–263`.
- Tablo: sıralanabilir başlıklar Location / Address / Phone number / Time zone + "Clear column sorting" — `:425–446`; satır: ad, adres, telefon ("—"), saat dilimi adı — `:468–523`.
- Satır menüsü "Actions for {ad}": "Edit location" + "Archive" (iki tık: "Confirm archive") / "Restore" — `:503–518`, `settings/CatalogRowMenu.tsx:36`.
- Boş durumlar: "No locations match your search." / "No archived locations" / "No locations yet" — `:447–467`.
- Yükleniyor "Loading locations..." ve okuma hatası — `:416–423`; liste üstü hata satırı (arşiv hatası) — `:411`.
- **Lokasyon çekmecesi** (New location / Edit location): başlık + "Phone number is optional.", kapat — `:266–296`; alanlar Location name (120), Short name (12, büyük harf, öneri placeholder), Phone number (+1 maskesi), Street address, City, State / region (varsayılan "CA"), ZIP / postal code, Time zone (seçim + posta kodundan öneri) — `:302–368`; saat dilimi öneri durumları "Looking up a time zone suggestion…" / "Suggested from the postal code…" / "No clear suggestion…" / "Suggestion unavailable…" — `settings/LocationTimezoneField.tsx:79–85`.
- Alan hataları: short name "Short name is required. Use 2–12 characters…", telefon "Enter a 10-digit US phone number.", harf kuralı — `settings/location-draft.ts:38–58`; çekmece hata satırı (ör. "This short name is already used in this workspace. Choose another one.") — `settings/organization-data.ts:337`.
- Çekmece altı: "Delete location" (iki tık: "Confirm delete", "Deleting…") — `:377–389`, `settings/CatalogDeleteAction.tsx:102`; Cancel; "Save location" (eksik/değişmemişse pasif, "Saving") — `:390–406`.
- Kapatma: arka plana tıklama, Escape (meşgulken kapanmaz) — `settings/CatalogDrawer.tsx:160–190`.
- API reddi kartı (subject "locations") — `:201`.
- Telefon: tablo yerine lokasyon başına kart (adres satırı + "saat dilimi · telefon") — `:487–491`, `settings/jobs-settings.css:1328`, `:1381`; çekmece ≤640px tam genişlik — `jobs-settings.css:2067`.

### Senaryolar
- [✅ owner] İki aktif lokasyon listesi · rol: owner · nasıl: /app/settings/locations · mock: var
- [✅ new] Yeni lokasyon çekmecesi (boş form) · rol: owner · nasıl: New location · mock: var
- [✅ edit] Downtown'u düzenle · rol: owner · nasıl: Actions for Harbor & Vine Downtown → Edit location · mock: var
- [✅ archived] Arşiv sekmesi (boş: "No archived locations") · rol: owner · nasıl: Archived · mock: var
- [❌ EKSİK] Arşiv sekmesi dolu + Restore · rol: owner · nasıl: Archived · mock: eksik: arşivli lokasyon seed'i
- [❌ EKSİK] Arama sonuç yok · rol: owner · nasıl: aramaya "zzz" · mock: var
- [❌ EKSİK] Sütuna göre sıralı + "Clear column sorting" · rol: owner · nasıl: Address başlığı · mock: var
- [❌ EKSİK] Archive iki tık ("Confirm archive") · rol: owner · nasıl: Actions → Archive · mock: var
- [❌ EKSİK] Hiç lokasyon yok ("No locations yet") · rol: owner · nasıl: — · mock: eksik: boş seed
- [❌ EKSİK] Posta kodundan saat dilimi önerisi · rol: owner · nasıl: New location → ZIP 02110 · mock: var
- [❌ EKSİK] Öneri yok ("No clear suggestion") · rol: owner · nasıl: ZIP 00000 · mock: var
- [❌ EKSİK] Short name biçim hatası · rol: owner · nasıl: Short name "A" → Save · mock: var
- [❌ EKSİK] Telefon hatası (10 hane değil) · rol: owner · nasıl: telefon "555" → Save · mock: var
- [❌ EKSİK] Harf kuralı hatası (City "Zürich") · rol: owner · nasıl: Save · mock: var
- [❌ EKSİK] Short name zaten kullanılıyor · rol: owner · nasıl: yeni lokasyon short name "DTWN" · mock: var
- [❌ EKSİK] Aynı isim zaten var (ham DB metni) · rol: owner · nasıl: isim "Harbor & Vine Downtown" · mock: var
- [❌ EKSİK] Kaydet başarılı (çekmece kapanır, satır listede) · rol: owner · nasıl: formu doldur → Save location · mock: var
- [❌ EKSİK] Delete location iki tık · rol: owner · nasıl: Edit → Delete location → Confirm delete · mock: var
- [❌ EKSİK] Silme/arşiv sırasında başkası silmiş (gone meanwhile) · rol: owner · nasıl: — · mock: eksik: `catalog.deleted` hint'li hata setup'ı
- [❌ EKSİK] Okuma hatası / yükleniyor · rol: owner · nasıl: — · mock: eksik: hata/bekleten setup
- [❌ EKSİK] Salt-okur (New location yok, satır menüsü yok, çekmece alanları pasif) · rol: admin (yalnız settings.locations.read) · nasıl: satıra tıkla · mock: eksik: admin izleyici (izin daraltılmış)
- [❌ EKSİK] API reddi kartı · rol: owner · nasıl: — · mock: eksik: 403 setup
- [✅ owner] Telefon: lokasyon kartları · rol: owner · nasıl: telefon çerçevesi · mock: var

---

## 10.2 Settings · Jobs — /app/settings/jobs

### Parçalar
- Başlık "Jobs & departments" + "Organize your jobs…" — `settings/JobsSettingsPage.tsx:415`. (Menüdeki ad "Jobs".)
- Başlık eylemi: All görünümünde "Add" menüsü (Department / Job), diğerlerinde "Add department" / "Add job"; izin yoksa pasif — `:419–454`.
- Görünüm sekmeleri **All / Departments / Jobs** (adreste `view=`) — `:457–484`.
- Arama "Search jobs or departments" + "Clear search" (adreste `q=`) — `:485–504`.
- "Show archived" onay kutusu (`archived=1`) — `:505–514`.
- All görünümü: "N groups · N jobs" + "Expand all/Collapse all" — `:583–600`; departman grubu: aç/kapa, renkli klasör, ad, "Archived" rozeti, "N jobs", kişi sayısı, "Add job" (`Add job to {dep}`), departman menüsü — `:602–673`; grup içi job satırları; boş grup "No jobs in this department yet." — `:677`; "No department" grubu.
- Jobs görünümü: sıralanabilir Job / Department / Employees + sıralamayı temizle — `:688–697`.
- Departments görünümü: Department / Jobs / Employees; job sayısı düğmesi ("Show jobs in {dep}") All görünümüne arar — `:698–763`.
- Job satırı: renk noktası, ad, "Archived" rozeti, departman hücresi, kişi sayısı düğmesi (`Manage employees for {job}`; `employees.read` yoksa "—" ve pasif) — `:221–283`.
- Satır menüsü: "Edit job/department" (izin yoksa pasif), "Manage employees" (job, employees.read), Archive/Restore (departmanda aktif job varken pasif, ipucu "Archive active jobs first") — `:187–220`.
- Boş/sonuç yok: "Build your team structure" / "No matches found" — `:569–578`; yükleniyor "Loading your team structure…"; okuma hatası + "Try again" — `:558–568`.
- Uyarılar: arşiv hatası satırı; "Employee counts could not load. Retry" — `:545–557`; adresteki `jobId` artık yoksa "This job is no longer available. Dismiss" — `:767`.
- API reddi kartı (subject "positions") — `:396`.
- **Departman / toplu job çekmecesi** (JobCatalogEditor): başlık "New department" / "Edit department" / "Add jobs to {dep}" / "New job"; açıklama; Department name / Job name + renk; Department seçimi ("No department", arşivli "(archived)"); "Jobs · N added" satır listesi (Enter ile sonraki, "Add", "Remove job N"), ipucu; hatalar ("“X” already exists. Choose a unique name.", "“X” appears more than once.", "Enter a job name or remove its row.", "Enter at least one job name.", harf kuralı); alt: Delete department (uyarı paneli: "Keep jobs in No department" / "Delete jobs too", "Keep department", "Delete department"), Cancel, "Save department/jobs" — `settings/JobCatalogEditor.tsx:259–488`, `settings/CatalogDeleteAction.tsx:118–197`.
- **Job çekmecesi** (JobAssignmentsDrawer, yeni job ve job tıklanınca): başlık (departman adı, job adı / "New job", "N employees assigned"), kapat — `settings/JobAssignmentsDrawer.tsx:329–384`; Details: Job name + renk, Department — `:386–448`; hata/bilgi satırı ("Job saved · N employee assignments updated." / "Job saved." / "Latest data loaded…"), "Reload latest" — `:449–466`; Employees bölümü: arşiv uyarısı "This job is archived. Restore it to change assignments.", "Search employees", "Filter employees by location", All / Assigned / Not assigned, liste (onay kutusu "Assign {ad}", baş harf, kod · lokasyon, devre dışı nedeni, "Primary" rozeti), "Loading employees…", hata + Retry, "No employees found", sayfalama "1–50 of N" — `:467–600`; değişiklik özeti "Job details changed · N to assign · N to remove" / "No pending changes" — `:604`; alt: "Delete job" (settings.jobs.manage + employees.manage), Cancel, Save — `:616–658`; **"Discard changes?" alt penceresi** ("Keep editing" / "Discard changes") — `:660–697`; sayfa terk uyarısı (beforeunload) — `:125`.
- Telefon: departman sütunu gizli, job adı altında departman adı (job-mobile-meta), 44px dokunma hedefleri — `settings/jobs-settings.css:1141–1192`.

### Senaryolar
- [✅ owner] All görünümü, 4 departman · rol: owner · nasıl: /app/settings/jobs · mock: var
- [✅ addjob] Bar'a job ekle çekmecesi · rol: owner · nasıl: Add job to Bar · mock: var
- [✅ people] Bartender çalışanları (job çekmecesi) · rol: owner · nasıl: Manage employees for Bartender · mock: var
- [❌ EKSİK] Departments görünümü · rol: owner · nasıl: Departments sekmesi · mock: var
- [❌ EKSİK] Jobs görünümü, Employees'e göre sıralı · rol: owner · nasıl: Jobs → Employees başlığı · mock: var
- [❌ EKSİK] Collapse all · rol: owner · nasıl: Collapse all · mock: var
- [❌ EKSİK] Arama sonuç yok ("No matches found") · rol: owner · nasıl: q=zzz · mock: var
- [❌ EKSİK] Show archived (arşivli rozetler) · rol: owner · nasıl: Show archived · mock: eksik: arşivli job/departman seed'i
- [❌ EKSİK] "No department" grubu · rol: owner · nasıl: — · mock: eksik: departmansız job seed'i
- [❌ EKSİK] Hiç departman/job yok ("Build your team structure") · rol: owner · nasıl: — · mock: eksik: boş seed
- [❌ EKSİK] Add menüsü açık (Department / Job) · rol: owner · nasıl: Add · mock: var
- [❌ EKSİK] Yeni departman + jobs çekmecesi · rol: owner · nasıl: Add → Department · mock: var
- [❌ EKSİK] Yeni job çekmecesi (çalışan listesiyle) · rol: owner · nasıl: Add → Job · mock: var
- [❌ EKSİK] Departman düzenle · rol: owner · nasıl: Actions for Kitchen → Edit department · mock: var
- [❌ EKSİK] Yinelenen isim hatası · rol: owner · nasıl: yeni job "Server" → Save · mock: var
- [❌ EKSİK] Harf kuralı hatası · rol: owner · nasıl: job adı "Garçon" · mock: var
- [❌ EKSİK] Atama değişikliği bekliyor ("1 to assign · 0 to remove") · rol: owner · nasıl: people → bir kutuyu işaretle · mock: var
- [❌ EKSİK] Atama kaydedildi ("Job saved · 1 employee assignments updated.") · rol: owner · nasıl: işaretle → Save · mock: var
- [❌ EKSİK] "Discard changes?" penceresi · rol: owner · nasıl: işaretle → X · mock: var
- [❌ EKSİK] Başkası değiştirdi → "Reload latest" · rol: owner · nasıl: — · mock: eksik: 409 + `*.changed` hint'li setup (mock 409 döner ama reason anahtarı vermez)
- [❌ EKSİK] Job sil uyarısı (iki aşamalı panel) · rol: owner · nasıl: people → Delete job · mock: var
- [❌ EKSİK] Departman sil + "Delete jobs too" seçeneği · rol: owner · nasıl: Edit department → Delete department · mock: var
- [❌ EKSİK] Management/Owner silinemez ("Management and Owner are kept; rename them instead") · rol: owner · nasıl: Owner job → Delete job → Delete · mock: var
- [❌ EKSİK] Departman arşivi kilitli ("Archive active jobs first") · rol: owner · nasıl: Actions for Bar · mock: var
- [❌ EKSİK] Archive iki tık · rol: owner · nasıl: Actions for Barback → Archive · mock: var
- [❌ EKSİK] Arşivli job çekmecesi (atama kilitli uyarısı) · rol: owner · nasıl: arşivli job · mock: eksik: arşivli job seed'i
- [❌ EKSİK] Adresteki job yok ("This job is no longer available") · rol: owner · nasıl: ?jobId=<olmayan> · mock: var
- [❌ EKSİK] Çalışan sayıları yüklenemedi / okuma hatası · rol: owner · nasıl: — · mock: eksik: hata setup'ı
- [❌ EKSİK] Çalışan listesinde devre dışı satır (disabled_reason) · rol: owner · nasıl: — · mock: eksik: `can_manage:false` satır (mock hep true)
- [❌ EKSİK] 50+ çalışanla sayfalama · rol: owner · nasıl: — · mock: eksik: 50'den çok çalışan
- [❌ EKSİK] Salt-okur Jobs (Add pasif, Edit pasif; "Add job" düğmesi ve Archive yine görünür) · rol: özel (settings.jobs.read) · nasıl: /app/settings/jobs · mock: eksik: özel rol izleyici
- [❌ EKSİK] employees.read olmadan sayılar "—", Manage employees yok · rol: özel · nasıl: — · mock: eksik: özel rol izleyici
- [❌ EKSİK] Özel rol: employees.manage var, settings.jobs.manage yok → detaylar kilitli, atama açık · rol: özel · nasıl: job tıkla · mock: eksik: özel rol izleyici
- [❌ EKSİK] API reddi kartı ("positions") · rol: owner · nasıl: — · mock: eksik: 403 setup
- [✅ owner] Telefon görünümü · rol: owner · nasıl: telefon çerçevesi · mock: var

---

## 10.3 Settings · Notifications — /app/settings/notifications

B görünümü (main 48f81bc1, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kart: "We couldn't load notification settings". PAGES senaryoları: `loading`, `read-error`.

### Parçalar
- Başlık "Notifications" + açıklama — `settings/NotificationSettingsPage.tsx:204`.
- Yükleniyor "Loading notification settings..." / okuma hatası — `:212–235`; API reddi kartı ("notification settings") — `:196`.
- **Salt-okur şeridi** "Read-only access …" (can_write yoksa) — `:269–274`.
- Araç çubuğu: "Search notification rules", "Category" (All categories + kategoriler), "Policy scope" (Workspace / Roles / Locations grupları; değişince taslaklar silinir) — `:276–311`.
- **Sıfırlama çubuğu** (yalnız yazabilen): "Reset reason" (3+ karakter), "Reset current category" (kategori seçili değilse pasif) ve "Reset all policies" — ikisi de iki tık kırmızı (ConfirmButton: "Confirm reset category" / "Confirm reset all") — `:313–344`.
- Durum ve hata satırı ("Saving notification policy…", "Notification policy saved.", "N notification policies reset.", "Safe preview allowed/denied; no external message was sent.", "This policy changed elsewhere…", "…Your optimistic edit was rolled back.") — `:64–144`, `:346–347`.
- **Politika kartı** (her bildirim türü): başlık, açıklama, etiketler (kategori, önem, hassasiyet: "Internal update"/"Contains employee info"/"Sensitive time data"), "Enabled/Disabled" anahtarı (zorunlu in-app türünde kilitli) — `:368–389`; meta: Policy source ("Catalog default" / "Workspace · v2" / rol/lokasyon adı), Audience, Requirement ("Always shown in app" / "Can be managed") — `:390–394`; "Allowed channels" In-app / Email / Push (desteklenmeyen "(not available yet)", son kanal kaldırılamaz) — `:395–416`; Cadence (Immediate / Daily digest / Weekly digest), "Reason for {tür}", "Safe test" (yalnız `notifications.test_send`), "Reset" (iki tık "Confirm reset"), "Save" (taslak + 3+ karakter gerekçe) — `:417–476`.
- Filtre sonuç yok "No notification types match these filters." — `:351`.
- **"Policy audit history (N)"** açılır bölüm; boş "No policy changes recorded."; satırda eylem anahtarı ham gösterilir ("notification.policy.saved"), gerekçe, zaman — `:482–487`.
- Telefon (≤860px) düzen değişikliği — `settings/notification-settings.css:242`.

### Senaryolar
- [✅ owner] Workspace kapsamı, bütün türler · rol: owner · nasıl: /app/settings/notifications · mock: var
- [❌ EKSİK] Kategori filtresi · rol: owner · nasıl: Category → bir kategori · mock: var
- [❌ EKSİK] Arama sonuç yok · rol: owner · nasıl: arama "zzz" · mock: var
- [❌ EKSİK] Rol kapsamı (Shift Lead: kayıtlı politika "Shift Lead · v1") · rol: owner · nasıl: Policy scope → Shift Lead · mock: var
- [❌ EKSİK] Lokasyon kapsamı (Uptown: kapalı duyuru politikası) · rol: owner · nasıl: Policy scope → Harbor & Vine Uptown · mock: var
- [❌ EKSİK] Kart taslağı + gerekçe → Save → "Notification policy saved." · rol: owner · nasıl: bir kartta Cadence değiştir, gerekçe yaz, Save · mock: var
- [❌ EKSİK] Gerekçe kısa → Save pasif · rol: owner · nasıl: gerekçe "ok" · mock: var
- [❌ EKSİK] Zorunlu in-app türü (anahtar kilitli, "Always shown in app") · rol: owner · nasıl: ilgili kart · mock: var
- [❌ EKSİK] Desteklenmeyen kanal "(not available yet)" · rol: owner · nasıl: kart · mock: var
- [❌ EKSİK] Reset all iki tık → "N notification policies reset." · rol: owner · nasıl: Reset reason → Reset all policies → Confirm · mock: var
- [❌ EKSİK] Reset current category · rol: owner · nasıl: kategori seç → Reset current category · mock: var
- [❌ EKSİK] Safe test sonucu ("allowed/denied") · rol: owner · nasıl: Safe test · mock: var
- [❌ EKSİK] Başka yerde değişti (policy_changed) · rol: owner · nasıl: — · mock: eksik: 409 + `notification.policy_changed` reason (mock reason vermez)
- [❌ EKSİK] Kayıt hatası (iyimser düzenleme geri alındı) · rol: owner · nasıl: — · mock: eksik: hata setup'ı
- [❌ EKSİK] Audit geçmişi açık (4 kayıt) · rol: owner · nasıl: Policy audit history · mock: var
- [❌ EKSİK] Audit boş · rol: owner · nasıl: — · mock: eksik: boş audit seed'i
- [❌ EKSİK] Salt-okur (Read-only şeridi, Reset/Save yok) · rol: özel (notifications.settings.read) · nasıl: /app/settings/notifications · mock: eksik: özel rol izleyici + `can_write:false` (mock hep true)
- [❌ EKSİK] Safe test görünmez (test_send yok) · rol: özel / admin izni daraltılmış · nasıl: — · mock: eksik: izleyici
- [❌ EKSİK] Yükleniyor / okuma hatası / API reddi kartı · rol: owner · nasıl: — · mock: eksik: setup
- [✅ owner] Telefon görünümü · rol: owner · nasıl: telefon çerçevesi · mock: var

---

## 10.4 Settings · Schedule rules — /app/settings/scheduling

B görünümü (main 48f81bc1, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kartlar: "We couldn't load schedule rules"; Availability bölümü ayrı: "We couldn't load availability settings" (kurallar açık kalır). PAGES senaryoları: `loading`, `read-error`, `avail-read-error`.

### Parçalar
- Başlık "Schedule rules" + açıklama — `settings/SchedulingSettingsPage.tsx:142`.
- Yükleniyor "Loading scheduling rules..." / okuma hatası / API reddi kartı ("scheduling settings") — `:130`, `:147–154`.
- **Schedule basics** formu: "Week starts on" (Sunday/Monday), "Publish by" (gün seçimi), "Time format" (12-hour/24-hour), "Time off decision window" (0–720 hours) — `:156–245`.
- Hatalar: "Choose week start and time format before saving." (checklist modu), "Enter a time off decision window from 0 to 720 hours.", "Choose valid scheduling settings before saving.", sunucu hatası — `:100–118`, `:246–255`; başarı "Scheduling rules saved." — `:256`.
- "Save rules" (değişiklik yoksa pasif; "Saving") — `:261–275`.
- **Checklist modu** (`?checklist=setup`): week start ve time format boş gelir, ikisi seçilmeden kaydedilemez — `:54`, `:302`.
- **Availability and staffing** bölümü (yalnız yazabilen): açıklama + Availability paneli — `:280–297`: "Entry mode" (Time range / Shift type), "Default hours needed" uyarısı (eksik vardiya türü bağlantıları → shift-types?edit=…), mod değişince "Saved weeks will be converted…", "Required during onboarding" anahtarı; alt: "Settings changed elsewhere. Your draft is preserved.", hata, "Discard and reload", durum "Saving... / Saved / Unsaved changes", "Discard", "Save"; yükleniyor/erişim yok ("You don't have access to these availability settings.") + Retry — `availability/WeeklyPreferenceSettings.tsx:63–300`.
- Salt-okur: `settings.scheduling.write` yoksa fieldset pasif, Availability bölümü hiç yok — `:50`, `:164`, `:280`.

### Senaryolar
- [✅ owner] Dolu kurallar + Availability paneli · rol: owner · nasıl: /app/settings/scheduling · mock: var
- [❌ EKSİK] Kural değişti → "Scheduling rules saved." · rol: owner · nasıl: Sunday → Save rules · mock: var
- [❌ EKSİK] Karar penceresi sınır dışı (721) · rol: owner · nasıl: 721 yaz → Save · mock: var
- [❌ EKSİK] Karar penceresi boş · rol: owner · nasıl: alanı temizle → Save · mock: var
- [❌ EKSİK] Checklist modu (iki seçim boş, Save pasif) · rol: owner · nasıl: /app/settings/scheduling?checklist=setup · mock: var
- [❌ EKSİK] Availability modu değişti uyarısı + Unsaved changes · rol: owner · nasıl: Entry mode → Shift type · mock: var
- [❌ EKSİK] Availability kaydedildi ("Saved") · rol: owner · nasıl: değiştir → Save · mock: var
- [❌ EKSİK] "Default hours needed" (eksik vardiya saatleri) · rol: owner · nasıl: Shift type modu · mock: eksik: `missing_shift_types` dolu dönmeli (mock hep [])
- [❌ EKSİK] Availability başka yerde değişti (Discard and reload) · rol: owner · nasıl: — · mock: eksik: revizyon değiştiren setup (mock 409 verir ama tetiklenmez)
- [❌ EKSİK] Salt-okur (pasif form, Availability yok) · rol: özel (settings.schedule_rules.read) · nasıl: — · mock: eksik: özel rol izleyici
- [❌ EKSİK] Kayıt hatası / okuma hatası / yükleniyor / API reddi · rol: owner · nasıl: — · mock: eksik: setup
- [✅ owner] Telefon görünümü · rol: owner · nasıl: telefon çerçevesi · mock: var

---

## 10.5 Settings · Conflict handling — /app/settings/scheduling/conflicts

B görünümü (main 48f81bc1, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kart: "We couldn't load conflict rules". PAGES senaryoları: `loading`, `read-error`.

### Parçalar
- Başlık "Conflict handling" + açıklama — `settings/ConflictHandlingSettingsPage.tsx:146`.
- Yükleniyor "Loading conflict rules..." / okuma hatası / API reddi kartı ("conflict rules") — `:134`, `:151–160`.
- Sabit bilgi listesi: "Approved time off always keeps someone off the schedule." / "Availability is a preference…" — `:167–170`.
- 6 kural satırı, her biri seçim kutusu: Required documents, Conditional documents during grace, Conditional documents after grace (Require confirmation/Block), Closed location (Block / Ask every time / Ask once per edit), Minimum travel + "Minimum travel time (minutes)" 0–240, Minimum rest + "Minimum rest time (minutes)" 0–1440, "0 means no minimum configured." — `:18–50`, `:171–240`.
- Hata satırı: "Enter valid rules and whole minutes within the shown limits." / sunucu / "Conflict rules changed. Reload before saving." — `:241–248`; başarı "Conflict rules saved." — `:249`.
- "Reload rules" ve "Save conflict rules" (değişmemiş/bayatsa pasif) — `:254–277`.
- Salt-okur görünüm yok: sayfa yalnız yazabilene açılır (kapı yazma eylemi) — `settings/settings-access.ts:200`.

### Senaryolar
- [✅ owner] Mevcut kurallar · rol: owner · nasıl: /app/settings/scheduling/conflicts · mock: var
- [❌ EKSİK] Kural değişti → "Conflict rules saved." · rol: owner · nasıl: Minimum rest → Block → Save · mock: var
- [❌ EKSİK] Dakika sınır dışı (travel 300) → doğrulama hatası · rol: owner · nasıl: 300 yaz → Save · mock: var
- [❌ EKSİK] Overdue, grace'ten yumuşak → hata · rol: owner · nasıl: grace Block, overdue Require confirmation → Save · mock: var
- [❌ EKSİK] Değişiklik geri alındı → Save pasif · rol: owner · nasıl: değiştir, eski değere dön · mock: var
- [❌ EKSİK] Başka yerde değişti (409) · rol: owner · nasıl: — · mock: eksik: revizyonu değiştiren setup
- [❌ EKSİK] Reload rules · rol: owner · nasıl: değiştir → Reload rules · mock: var
- [❌ EKSİK] Admin (schedule.conflict_rules.manage yok) → sayfa açılmaz, menüde yok · rol: admin · nasıl: adres · mock: eksik: admin izleyici
- [❌ EKSİK] Okuma hatası / yükleniyor / API reddi · rol: owner · nasıl: — · mock: eksik: setup
- [✅ owner] Telefon görünümü · rol: owner · nasıl: telefon çerçevesi · mock: var

---

## 10.6 Settings · Shift catalog (Shift types) — /app/settings/scheduling/shift-types
B görünümü (main 48f81bc1, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kart: "We couldn't load shift types". PAGES senaryoları: `loading`, `read-error` (yeni).

(Liste sayfalarının ortak dili, A düzeni; Mert 2026-10-12. main 76a382a8.)

### Parçalar
- Kabuk: tabpanel "Shift catalog" — `settings/ShiftCatalogSettingsPage.tsx:12`.
- Başlık: "SETTINGS" üst yazısı, "Shift catalog" + yeşil nokta, "Shift types and labels used across the Schedule."; başlıkta düğme yok — `settings/ShiftCatalogTabs.tsx` (`ShiftCatalogHeader`).
- Sekme satırı: **Shift types / Shift labels** (ok/Home/End tuşları; kayıt sürerken pasif) — `settings/ShiftCatalogTabs.tsx` (`ShiftCatalogToolbar`, `ShiftCatalogTabs`).
- Süzgeç satırı: "Search shift types" satırı doldurur; sağ uçta yeşil "New shift type" (yalnız düzenleme izni olana). Durum süzgeci ve "Show archived" yok — `settings/ShiftCatalogList.tsx`.
- Tablo: sıralanabilir Shift type / Default start / Default end + "Clear column sorting"; satır: renk, ad ("Edit {ad}"), saatler, "· Ends next day"; arşivlenenler listenin sonunda, soluk ve "Archived" işaretli (sıralamada da sonda); satır menüsü (yalnız düzenleme izni olana): "Edit shift type", "Move up"/"Move down" (arama/sıralama varken pasif), Archive (iki tık)/Restore.
- Boş hâl: "No shift types yet" / "No shift types match your search." (açık zeminde saat simgesi).
- Telefon: her tür bir kart, ad altında "7:00 AM – 12:00 PM · 5 h" (gece yarısını geçende "· Ends next day").
- Yükleniyor "Loading shift types..." / okuma hatası (sekme satırı kalır) / liste üstü hata (süzgeç satırının altında).
- **Vardiya türü çekmecesi** (adı "New shift type" / "Edit {ad}"): "Default times may cross midnight."; Name (60) + Color; Default start / Default end + bilgi ipucu; aynı saat hatası "Start and end time cannot be the same."; **"Default hours change"** özeti; bayat uyarısı + "Discard draft and reload latest"; hata; Delete shift type (iki tık), Cancel, "Save shift type" — `settings/ShiftTypesSettingsPage.tsx`.
- Adresle doğrudan düzenleme `?edit=<id>` (Availability uyarısından gelir).
- API reddi: başlık ve sekmeler kalır, kart listenin yerinde ("shift types").
- Salt-okur: "New shift type" ve satır menüsü yok, satır adı pasif.

### Senaryolar
- [✅ owner] 4 vardiya türü · rol: owner · nasıl: /app/settings/scheduling/shift-types · mock: var
- [✅ edit] Breakfast'ı düzenle · rol: owner · nasıl: Edit Breakfast · mock: var
- [✅ new] Yeni vardiya türü · rol: owner · nasıl: New shift type · mock: var
- [✅ hours] Varsayılan saat değişikliği özeti · rol: owner · nasıl: Edit Breakfast → Default end 13:00 · mock: var
- [✅ overnight] Gece yarısını geçen saat ("Ends next day") · rol: owner · nasıl: Edit Close → end 01:00 · mock: var
- [✅ same] Başlangıç = bitiş hatası · rol: owner · nasıl: Edit Breakfast → end 07:00 · mock: var
- [✅ archived] Archive iki tık; arşivlenen listenin sonunda "Archived" · rol: owner · nasıl: Actions for Close → Archive → Confirm · mock: var
- [✅ search] Arama sonuç yok · rol: owner · nasıl: "Brunch" · mock: var
- [❌ EKSİK] Yinelenen isim ("A shift type with this name already exists…") · rol: owner · nasıl: yeni "Lunch" · mock: var
- [❌ EKSİK] Bayat varsayılanlar + "Discard draft and reload latest" · rol: owner · nasıl: — · mock: eksik: revizyonu değiştiren setup
- [❌ EKSİK] Sil iki tık · rol: owner · nasıl: Edit → Delete shift type · mock: var
- [❌ EKSİK] Move up/down · rol: owner · nasıl: Actions for Lunch → Move up · mock: var
- [❌ EKSİK] Restore · rol: owner · nasıl: archived senaryosundan sonra Actions → Restore · mock: var (seed'de arşivli yok)
- [❌ EKSİK] Sıralı liste · rol: owner · nasıl: başlık · mock: var
- [❌ EKSİK] Hiç tür yok · rol: owner · nasıl: — · mock: eksik: boş seed
- [❌ EKSİK] ?edit=<id> ile açılış · rol: owner · nasıl: /app/settings/scheduling/shift-types?edit=<Breakfast id> · mock: var
- [❌ EKSİK] Salt-okur ("New" ve menü yok) · rol: özel (settings.shift_catalog.read) · nasıl: — · mock: eksik: özel rol izleyici
- [❌ EKSİK] API reddi (sekmeler kalır) / okuma hatası / yükleniyor · rol: owner · nasıl: — · mock: eksik: setup
- [✅ owner] Telefon görünümü (kartlar) · rol: owner · nasıl: telefon çerçevesi · mock: var

---

## 10.7 Settings · Shift labels — /app/settings/scheduling/shift-labels
B görünümü (main 48f81bc1, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kart: "We couldn't load shift labels". PAGES senaryoları: `loading`, `read-error`.

(Aynı ShiftCatalogSettingsPage ve aynı A düzeni; başlık "Shift catalog", Shift labels sekmesi seçili; menüde "Shift catalog" aktif. Eski `/shift-label` buraya yönlenir.)

### Parçalar
- Başlık ve sekme satırı 10.6 ile aynı.
- Süzgeç satırı: "Search shift labels" + sağ uçta "New shift label" (yalnız düzenleme izni olana).
- Tablo: sıralanabilir Shift label; arşivlenenler sonda, soluk ve "Archived" işaretli; satır menüsü "Edit shift label", Move up/down, Archive/Restore; boş "No shift labels yet" / "No shift labels match your search."; telefonda kart.
- **Etiket çekmecesi** (adı "New shift label" / "Edit {ad}"): "Names must be unique among active labels."; Name + Color; hata; Delete shift label (iki tık), Cancel, "Save shift label" — `settings/ShiftLabelsSettingsPage.tsx`. Not: salt-okurda kapat (X) ve Cancel de pasif; pratikte çekmece salt-okurda açılmaz.
- Yükleniyor / hata / API reddi kartı ("shift labels").

### Senaryolar
- [✅ owner] 4 etiket · rol: owner · nasıl: /app/settings/scheduling/shift-labels · mock: var
- [✅ edit] Training'i düzenle · rol: owner · nasıl: Edit Training · mock: var
- [✅ new] Yeni etiket · rol: owner · nasıl: New shift label · mock: var
- [✅ archived] Archive iki tık; arşivlenen sonda · rol: owner · nasıl: Actions for Opener → Archive → Confirm · mock: var
- [✅ search] Arama sonuç yok · rol: owner · nasıl: "Expo" · mock: var
- [❌ EKSİK] Yinelenen isim ("A label with this name already exists…") · rol: owner · nasıl: yeni "Opener" · mock: var
- [❌ EKSİK] Kaydet başarılı · rol: owner · nasıl: yeni ad → Save shift label · mock: var
- [❌ EKSİK] Sil iki tık · rol: owner · nasıl: Edit Training → Delete shift label · mock: var
- [❌ EKSİK] Restore / Move · rol: owner · nasıl: Actions for Closer · mock: var
- [❌ EKSİK] Sekme değiştirme (Shift types ↔ Shift labels) · rol: owner · nasıl: Shift labels sekmesi · mock: var
- [❌ EKSİK] Hiç etiket yok · rol: owner · nasıl: — · mock: eksik: boş seed
- [❌ EKSİK] Salt-okur · rol: özel (settings.shift_catalog.read) · nasıl: — · mock: eksik: özel rol izleyici
- [❌ EKSİK] API reddi / okuma hatası · rol: owner · nasıl: — · mock: eksik: setup
- [✅ owner] Telefon görünümü (kartlar) · rol: owner · nasıl: telefon çerçevesi · mock: var

---

## 10.8 Settings · Roles & permissions — /app/settings/roles

B görünümü (main 48f81bc1, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kart: "We couldn't load roles". PAGES senaryoları: `loading`, `read-error`.

### Parçalar
- Başlık "Roles & permissions" + "Choose what each role can view and change."; "New role" (yalnız `roles.manage` olan owner/admin) — `settings/RolesSettingsPage.tsx:117–130`.
- Yükleniyor "Loading roles..." / hata / API reddi kartı ("roles") — `:105–136`.
- **Rol sekmeleri** "Workspace roles": owner hariç bütün roller (Admin, Manager, Employee, özel roller); erişilebilir ad "{ad} Built-in/Custom"; yeni rol açıkken "New role" sekmesi — `:165–198`. Özel rol sayısı >3 ise yerleşikler + "Custom roles +N" açılır listesi — `:199–235`.
- Varsayılan seçili rol: sistem Manager rolü (adres rolsüz) — `:85–89`.
- Telefon: sekmeler yerine "Role" seçim kutusu (owner rolü için gizli "Protected role" seçeneği) — `:139–164`, `settings/roles-settings.css:316–335`.
- Rol bulunamadı "Role not found. Select a role from the list." — `:259–262`.
- **Rol editörü** (bkz. 10.9) bu sayfada sağda açılır.
- **Yeni rol** (`/roles/new`): "Starting point" ("Blank — basic personal access" / "Copy {manager/employee sınıfı rol}" + "Copies are independent…"), Name, Experience (Manager workspace / Employee experience), Description, izin ızgarası, "Save changes" — `:419–505`.
- Sayfa terk koruması: kaydedilmemiş değişiklikle başka role/sayfaya gidince ConfirmDialog "Discard role changes?" ("Stay here" / "Discard and leave"; kayıt sürerken "Saving role") — `:368–383`, `availability/availability-navigation.tsx:237–252`.

### Senaryolar
- [✅ owner] Varsayılan açılış (Manager rolü seçili) · rol: owner · nasıl: /app/settings/roles · mock: var
- [✅ new] Yeni rol (boş başlangıç) · rol: owner · nasıl: New role · mock: var
- [❌ EKSİK] Yeni rol "Copy Shift Lead" başlangıcı · rol: owner · nasıl: New role → Starting point · mock: var
- [❌ EKSİK] Yeni rol Employee experience (yalnız Personal access grubu) · rol: owner · nasıl: New role → Experience → Employee experience · mock: var
- [❌ EKSİK] Yeni rol kaydedildi → yeni rolün sayfasına geçiş · rol: owner · nasıl: Name yaz → Save changes · mock: var
- [❌ EKSİK] İsim boş hatası · rol: owner · nasıl: New role → izin işaretle → Save · mock: var
- [❌ EKSİK] Kaydedilmemiş değişiklikle rol değiştirme → "Discard role changes?" · rol: owner · nasıl: bir izni değiştir → Employee sekmesi · mock: var
- [❌ EKSİK] "Custom roles +N" açılır listesi (4+ özel rol) · rol: owner · nasıl: — · mock: eksik: 4+ özel rol seed'i (seed'de 2)
- [❌ EKSİK] Rol bulunamadı · rol: owner · nasıl: /app/settings/roles/olmayan-id · mock: var
- [❌ EKSİK] Admin görünümü (New role var, Admin rolü düzenlenebilir mi: mock'ta editable) · rol: admin · nasıl: — · mock: eksik: admin izleyici
- [❌ EKSİK] Salt-okur (roles.read var, roles.manage yok): New role yok, kilit metni · rol: admin (izni daraltılmış) · nasıl: — · mock: eksik: admin izleyici
- [❌ EKSİK] Manager/özel rol erişemez (yönlendirme) · rol: manager / özel · nasıl: adres · mock: eksik: sayfa rollerine manager eklenmeli
- [❌ EKSİK] Yükleniyor / okuma hatası / API reddi · rol: owner · nasıl: — · mock: eksik: setup
- [✅ owner] Telefon: "Role" seçim kutusu · rol: owner · nasıl: telefon çerçevesi · mock: var

---

## 10.9 Settings · Role detail — /app/settings/roles/:roleId

### Parçalar
- Seçili rol sekmesi + editör — `settings/RolesSettingsPage.tsx:237–258`, `:271–695`.
- **Kimlik alanları** yalnız özel rolde (ve yeni rolde): Name (64), Experience (değiştirilemez, pasif), Description (240) — `:449–505`. Yerleşik rollerde (Admin/Manager/Employee) ad alanı yok.
- **İzin ızgarası** başlığı Permissions / Read / Edit — `:506–510`; grup satırı (aç/kapa, özet "Off / Read only / Full edit / Custom", grup Read ve Edit kutuları, karışık durumda yarı işaret) — `:511–567`; açılınca alan satırları (ad + bilgi ikonu açıklaması, Read/Edit kutuları; olmayan seviye "—") — `:568–598`, `:697–733`. Bağımlılıklar otomatik eklenir/çıkar — `packages/shared/src/role-permissions.ts:214`, `:294`.
- **İzin grupları** — `packages/shared/src/role-permissions.ts:12–212`:
  - Schedule: Schedule, Publishing, Manage conflict rules (yalnız Edit), Availability, Templates, Export (yalnız Read).
  - Requests: Time off (yalnız Edit; okuma kararla gelir), Shift changes.
  - Employees: Operational records, Invitations & access, Private information, Employee documents.
  - Communication: Announcements, Important dates.
  - Organization settings: General, Locations, Jobs & departments, Shift catalog, Schedule rules, Document requirements, Notification settings, Roles & permissions.
  - Personal access (yalnız Employee deneyimi): My schedule, Announcements.
- **Verilemez (non-grantable) izinler**: manager/employee sınıfı rolde gösterilmez, satır/sütun düşer (`permissionGroupsForRole`, `role-permissions.ts:271`): Manage conflict rules; Invitations & access Edit (roles.read gerektirir); General/Jobs/Shift catalog/Schedule rules **Edit**; **Locations** satırı tamamen; Document requirements Edit; Notification settings Edit; **Roles & permissions** satırı tamamen. Ayrıca hiçbir grupta olmayan izinler (workspace.manage, notifications.test_send, delivery_audit, dlq.replay, broadcast.approve) ekranda yok. Kaynak katalog: `mock/settings-permissions.ts` (`custom_grantable`).
- Employee deneyimli rolde yalnız "Personal access" grubu; Experience Employee'ye çekilince yalnız uygun izinler kalır — `:470–484`.
- Owner/Admin sınıfı: bütün gruplar (Admin rolü owner'ca düzenlenir). Owner rolü: menüde yok; adresle açılırsa ızgara kilitli + "Owner is protected and always has full access." — `:602–609`.
- Kilit metni (düzenleyemeyen): "You can view this role. Only an authorized higher role can change it." — `:607`.
- Uyarı/başarı: hata satırı; "Role saved." — `:610–619`; başkası kaydetti: "This role changed since you opened it…" — `:319–325`.
- **Alt çubuk** (düzenleyebilen): "Copy role" (manager/employee sınıfı) — `:623–634`; "Delete role" (yalnız özel rol): iki tık "Confirm delete", bağımlılık varsa "Role has dependencies" + "This role has N member references and N invitation references. Resolve them before deleting." (3,2 sn sonra söner), "Deleting..." — `:635–670`; "Cancel", "Save changes" — `:671–688`.

### Senaryolar
- [✅ custom] Özel rol: Shift Lead (ad/açıklama alanlarıyla) · rol: owner · nasıl: /app/settings/roles/00000c05-… · mock: var
- [✅ builtin] Hazır rol: Manager (ad alanı yok) · rol: owner · nasıl: /app/settings/roles/00000c03-… · mock: var
- [❌ EKSİK] Admin rolü (bütün gruplar, Locations ve Roles satırları dahil) · rol: owner · nasıl: Admin sekmesi · mock: var
- [❌ EKSİK] Employee rolü (yalnız Personal access) · rol: owner · nasıl: Employee sekmesi · mock: var
- [❌ EKSİK] Owner rolü adresle (kilitli, "Owner is protected…", telefonda "Protected role") · rol: owner · nasıl: /app/settings/roles/00000c01-… · mock: var
- [❌ EKSİK] Grup açık, alan satırları ve bilgi ikonları · rol: owner · nasıl: Shift Lead → Schedule grubunu aç · mock: var
- [❌ EKSİK] Karışık (Custom) özet ve yarı işaretli kutu · rol: owner · nasıl: Shift Lead → Requests · mock: var
- [❌ EKSİK] Bağımlılık: Edit işaretlenince Read de işaretlenir; Read kalkınca Edit düşer · rol: owner · nasıl: Kitchen Lead → Availability Edit · mock: var
- [❌ EKSİK] Verilemez izinlerin yokluğu (manager sınıfında Locations/Roles satırı yok) · rol: owner · nasıl: Shift Lead → Organization settings aç · mock: var
- [❌ EKSİK] Değişiklik kaydedildi ("Role saved.") · rol: owner · nasıl: izin değiştir → Save changes · mock: var
- [❌ EKSİK] Cancel ile taslak geri · rol: owner · nasıl: değiştir → Cancel · mock: var
- [❌ EKSİK] Copy role → yeni rol formu "Shift Lead copy" · rol: owner · nasıl: Shift Lead → Copy role · mock: var
- [❌ EKSİK] Delete role iki tık → silindi · rol: owner · nasıl: Kitchen Lead (0 üye) → Delete role → Confirm delete · mock: var
- [❌ EKSİK] Delete engelli ("Role has dependencies", N member references) · rol: owner · nasıl: Shift Lead → Delete role → tekrar · mock: var
- [❌ EKSİK] Başkası kaydetti (role.changed) · rol: owner · nasıl: — · mock: eksik: 409 + `role.changed` reason; ayrıca `roles-data.ts:37` reason'ı taşımadığı için bu dal web'de hiç çalışmıyor (bkz. boşluklar)
- [❌ EKSİK] Salt-okur editör (kutular pasif, kilit metni, alt çubuk yok) · rol: admin (roles.manage yok) · nasıl: — · mock: eksik: admin izleyici
- [❌ EKSİK] Sunucu reddi (ör. "Permission is not eligible for a lower role") · rol: owner · nasıl: — · mock: var ama ekran yolu yok (verilemez kutular gizli); hata setup'ı gerekir
- [✅ custom] Telefon: Role seçim kutusu + ızgara · rol: owner · nasıl: telefon çerçevesi · mock: var

---

## 10.10 Settings · Documents — /app/settings/documents

B görünümü (main 48f81bc1, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kart: "We couldn't load document types"; yayın penceresindeki etki önizlemesi de aynı görünüm. PAGES senaryoları: `loading`, `read-error`.

### Parçalar
- Giriş yönlendirmesi: `?requirement=…`, `?view=employees|employee-documents` ya da Documents ayarına kapısı yok ama çalışan belgesi okuyabilen kişi → `/app/employees/documents` — `documents/DocumentsSettingsRoute.tsx:12–26`.
- Başlık "SETTINGS / Documents" + açıklama — `settings/DocumentsSettingsPage.tsx:225`.
- Durum sekmeleri **All / Draft / Published / Archived** — `:247–269`.
- "Filter by requirement" (All requirements / Required / Conditional / Optional), "Search by name or description", "New document" (yalnız `documents.manage`) — `:271–300`.
- Tablo: sıralanabilir Document name / Description / Status / Published + temizle — `:348–378`; satır: ikon, ad, açıklama ("No description"), durum çipi (Published yeşil / Draft / Archived gri), yayın zamanı (üzerine gelince tam) — `:403–473`.
- Satır menüsü: "Edit document type" / "View document type" (yayımlıysa), "Publish"/"Unpublish", "Move up"/"Move down", Archive (iki tık)/Restore — `:474–531`.
- Boş: "No document types match these filters." / "No document types" + "New document" — `:379–402`; yükleniyor "Loading document types..." / hata / liste üstü hata — `:334–346`; API reddi kartı ("document settings") — `:213`.
- **Belge türü çekmecesi** (iki adım): başlık "New / Edit / View document type"; "Step 1 of 2 - Details" / "Step 2 of 2 - Fields & review" / "Published - unpublish to edit" (salt-okur) — `settings/DocumentSettingsEditor.tsx:213–247`.
  - Adım 1: Name (80), Description (240), Requirement (Optional/Required/Conditional), "Who needs it" (Locations / Departments / Jobs açılır filtreleri, AND/OR ipuçları, eski adlı kişiler notu), "Time & review" (Delivery/Grace period days, "Restrict workspace access after the delivery period"), "Manager review required", "Track expiration" + "Warn before expiry (days)" — `:267–401`, `documents/DocumentLifecycleFields.tsx:255–480`.
  - Adım 2: "Additional fields" (Field label, Field type Text/Date/Number, Required field, Remove field, sayfalama, "Add field" en çok 20), "Accepted uploads: …", özet (Requirement / Review / Expiration / Additional fields) + "Save creates a draft…" — `:403–454`, `DocumentLifecycleFields.tsx:481–650`.
  - Doğrulama: ilk hatalı alana odak + hata satırı; Next/Save pasif kuralları — `:171–201`, `:458–505`.
  - Alt: Cancel/Close, Back, Next/Save — `:465–505`.
- **Yayın penceresi** (Publish/Unpublish): "Loading publication impact…", "Who will be responsible" (AND/OR açıklaması, Locations/Departments/Jobs), eski hedef kişiler, "Matching employees" (+ "Exemption kept" / "Existing responsibility…"), boş "No current employees match…", "… in this preview" listeleri, "Changes to confirm" (Close former assignment / Pause / Exemption kept / ham eylem; süre eylemleri), boş "No current employee changes…", Reason (zorunlu), hata + "Refresh impact", Cancel, "Confirm publish/unpublish" — `settings/DocumentPublicationDialog.tsx:67–299`.
- Salt-okur (documents.read, documents.manage yok): New yok, satırlar açılmaz, menü yok — `:70–71`, `:427`, `:474`.
- Telefon: açıklama/durum/yayın sütunları gizli; ad altında "Durum - zaman - biçimler" — `:437–445`, `settings/jobs-settings.css:1775`.

### Senaryolar
- [✅ owner] Bütün belge türleri · rol: owner · nasıl: /app/settings/documents · mock: var
- [✅ new] Yeni belge türü, adım 1 · rol: owner · nasıl: New document · mock: var
- [✅ drafts] Taslaklar sekmesi · rol: owner · nasıl: Draft · mock: var
- [❌ EKSİK] Published / Archived sekmeleri · rol: owner · nasıl: Published; Archived (TB Test Results) · mock: var
- [❌ EKSİK] Requirement filtresi (Conditional → Food Handler Card) · rol: owner · nasıl: Filter by requirement · mock: var
- [❌ EKSİK] Arama/filtre sonuç yok · rol: owner · nasıl: arama "zzz" · mock: var
- [❌ EKSİK] Yeni belge adım 2 (Fields & review) · rol: owner · nasıl: New document → ad → Next · mock: var
- [❌ EKSİK] Adım 1 doğrulama hatası (ad boş → Next pasif / odak) · rol: owner · nasıl: New document → Next · mock: var
- [❌ EKSİK] Conditional + "Who needs it" filtreleri açık · rol: owner · nasıl: Requirement → Conditional · mock: var
- [❌ EKSİK] Additional fields eklendi, alan hatası · rol: owner · nasıl: Next → Add field → boş label → Save · mock: var
- [❌ EKSİK] Yayımlı belgeyi görüntüle (salt-okur, "Published - unpublish to edit") · rol: owner · nasıl: Actions for Form W-4 → View document type · mock: var
- [❌ EKSİK] Taslak belgeyi düzenle ve kaydet · rol: owner · nasıl: Direct Deposit Form → düzenle → Save · mock: var
- [❌ EKSİK] Aynı başlık hatası · rol: owner · nasıl: yeni "Form W-4" → Save · mock: var
- [❌ EKSİK] Yayın penceresi (Publish Direct Deposit Form): etki listesi + Reason · rol: owner · nasıl: Actions → Publish · mock: var
- [❌ EKSİK] Unpublish penceresi · rol: owner · nasıl: Actions for Form W-4 → Unpublish · mock: var
- [❌ EKSİK] Yayın sonrası liste (Published çipi, tarih) · rol: owner · nasıl: Reason → Confirm publish · mock: var
- [❌ EKSİK] Etki değişti (409) → "Refresh impact" · rol: owner · nasıl: — · mock: eksik: önizleme jetonunu değiştiren setup
- [❌ EKSİK] Move up/down · rol: owner · nasıl: Actions → Move down · mock: var
- [❌ EKSİK] Archive iki tık / Restore · rol: owner · nasıl: Actions → Archive; Archived → Restore · mock: var
- [❌ EKSİK] Hiç belge türü yok (+ New document) · rol: owner · nasıl: — · mock: eksik: boş seed
- [❌ EKSİK] Salt-okur liste (satırlar pasif, New/menü yok) · rol: özel (documents.read) · nasıl: — · mock: eksik: özel rol izleyici
- [❌ EKSİK] Çalışan belgesi okuyucusu → /app/employees/documents'a yönlenir · rol: özel (employee_documents.read, documents.read yok) · nasıl: /app/settings/documents · mock: eksik: özel rol izleyici
- [❌ EKSİK] Eski bağlantı `?view=employees` → Employees › Documents · rol: owner · nasıl: /app/settings/documents?view=employees · mock: var (hedef sayfa mock'u gerekir)
- [❌ EKSİK] Yükleniyor / okuma hatası / API reddi · rol: owner · nasıl: — · mock: eksik: setup
- [✅ owner] Telefon görünümü · rol: owner · nasıl: telefon çerçevesi · mock: var

---

## 10.11 Settings · Acknowledgements — /app/settings/acknowledgements

B görünümü (main 48f81bc1, 2026-10-14): yüklenirken gri iskelet, okunamazsa ortada çerçevesiz kart + beyaz Try again (`shell/LoadState.tsx`); sunucunun ham cümlesi görünmez; yenileme düşerse son veri kalır ve üstte "didn't refresh" satırı + Try again. Kart: "We couldn't load acknowledgement settings". PAGES senaryoları: `loading`, `read-error`.

### Parçalar
- Başlık "Acknowledgements" + açıklama; sekmeler **Templates / Retention**; "Add template" / "Add policy" (yalnız `documents.manage`; aktif saklama politikası yoksa Add template pasif) — `settings/SignatureTemplatesSettingsPage.tsx:370–425`.
- "Search acknowledgements" ("Search templates" / "Search retention policies"), "Show archived" — `:428–450`.
- Uyarı "Create a retention policy before adding an acknowledgement template." — `:452–456`; liste üstü hata; yükleniyor "Loading acknowledgement settings..." / hata — `:457–469`; API reddi kartı ("acknowledgements") — `:355`.
- **Şablon listesi**: Template / Version / Status; satır: ikon, ad, saklama politikası adı ("Missing retention policy"), "v2 - en-US - tarih" / "No version", durum (Draft / Published / Archived) — `:1368–1470`; menü: "Preview template" (herkes), "Publish template" (taslak; aynı menüde "Cancel" / "Confirm publish"), "Edit template", Archive/Restore — `:1478–1530`; boşlar "No acknowledgement templates yet" / "…match this view" — `:1402–1415`.
- **Saklama listesi**: Policy / Trigger / Status; satır: ad, yetki alanı, "Employment end - 1,095 days", Draft/Approved/Archived — `:1089–1180`; menü: "Approve policy" ("Cancel"/"Confirm approval"), "Edit policy" (yalnız taslak), Archive/Restore — `:1182–1222`; boşlar — `:1117–1131`.
- **Saklama politikası çekmecesi**: "New/Edit retention policy" + "Approval makes these retention terms immutable."; Name, Trigger (Employment end / Acknowledged date), Duration days (1–36500), Jurisdiction / scope, Authority or records schedule reference; onaylıysa alanlar kilitli; hata; alt: Approve/Unapprove (iki adım: "Confirm approval"/"Confirm unapprove" + Cancel), "Delete policy" paneli ("Delete \"X\"?", "This policy will be archived…", "Keep policy" / "Delete policy"), Cancel, "Save draft policy" — `:472–633`, `:959–1087`.
- **Şablon çekmecesi**: "New acknowledgement template" / "Edit acknowledgement draft" + "Published content is immutable…"; Title, Locale, Effective date, Retention policy ("(draft)" etiketi), Summary, Policy content (50.000, kendiliğinden büyür), Intent statement, Requirement (Optional/Required) + Time & review alanları (LifecycleAssignmentFields, kind acknowledgement) — `:636–804`; yayımlı sürüm varsa **"Apply to existing assignments"** ("Preview impact", değişiklik listesi, "No changes to existing assignments.", "Reason for applying", "Apply changes", "Changes applied") — `:805–813`, `documents/DocumentDefinitionApply.tsx:47–112`; alt: Publish/Unpublish (iki adım), "Delete acknowledgement" paneli ("Keep acknowledgement" / "Delete acknowledgement"), Cancel, "Save draft template" — `:829–862`, `:1228–1366`.
- **Şablon önizlemesi** (sayfa içi bölüm): "Acknowledgement preview", başlık, özet, Version ("2 · draft" ham durum), Effective, Retention, Digest (ilk 12 karakter), içerik, intent + onay işareti, "Close preview" — `:1535–1594`.
- Salt-okur: Add yok; satır adları pasif; şablon menüsünde yalnız "Preview template"; saklama satırında menü yok — `:411`, `:1148`, `:1182`, `:1441`, `:1484`.
- Telefon: sütunlar yerine ad altında "Draft v2 - en-US" / "Employment end - 1,095 days"; çekmece alanları tek sütun — `:1457`, `:1164`, `settings/jobs-settings.css:2067`.

### Senaryolar
- [✅ owner] Şablon listesi (Handbook Draft v2, Tip Pooling Published) · rol: owner · nasıl: /app/settings/acknowledgements · mock: var
- [✅ preview] Handbook önizleme · rol: owner · nasıl: Actions for Employee Handbook → Preview template · mock: var
- [✅ retention] Saklama süreleri (Approved + Draft) · rol: owner · nasıl: Retention · mock: var
- [❌ EKSİK] Şablon menüsü "Confirm publish" adımı · rol: owner · nasıl: Actions for Employee Handbook → Publish template · mock: var
- [❌ EKSİK] Yayımlandı (Handbook v2 Published) · rol: owner · nasıl: Confirm publish · mock: var
- [❌ EKSİK] Yayın reddi: taslak saklama politikası ("approved active retention policy required…") · rol: owner · nasıl: taslağı Massachusetts politikasına bağla → Publish · mock: var
- [❌ EKSİK] Yeni şablon çekmecesi · rol: owner · nasıl: Add template · mock: var
- [❌ EKSİK] Taslak düzenle + Apply to existing assignments önizlemesi · rol: owner · nasıl: Actions for Employee Handbook → Edit template → Preview impact · mock: var
- [❌ EKSİK] Şablon kaydet doğrulama hatası (Title boş) · rol: owner · nasıl: Add template → Save · mock: var
- [❌ EKSİK] Unpublish (yayımlı, taslaksız: Tip Pooling) · rol: owner · nasıl: Edit template → Unpublish → Confirm · mock: var
- [❌ EKSİK] Delete acknowledgement paneli · rol: owner · nasıl: Edit template → Delete acknowledgement · mock: var
- [❌ EKSİK] Yeni saklama politikası çekmecesi · rol: owner · nasıl: Retention → Add policy · mock: var
- [❌ EKSİK] Politika onaylama ("Confirm approval") · rol: owner · nasıl: Actions for Massachusetts… → Approve policy · mock: var
- [❌ EKSİK] Onaylı politika çekmecesi (alanlar kilitli, Unapprove) · rol: owner · nasıl: Personnel records (federal) → aç · mock: var (satır adı onaylıda da tıklanır)
- [❌ EKSİK] Delete policy paneli · rol: owner · nasıl: Edit policy → Delete policy · mock: var
- [❌ EKSİK] Show archived / arama sonuç yok · rol: owner · nasıl: Show archived; arama "zzz" · mock: var (arşivli seed yok)
- [❌ EKSİK] Hiç politika yok → Add template pasif + uyarı · rol: owner · nasıl: — · mock: eksik: boş saklama seed'i
- [❌ EKSİK] Hiç şablon yok · rol: owner · nasıl: — · mock: eksik: boş seed
- [❌ EKSİK] Salt-okur (yalnız Preview) · rol: özel (documents.read) · nasıl: — · mock: eksik: özel rol izleyici
- [❌ EKSİK] Yükleniyor / okuma hatası / API reddi · rol: owner · nasıl: — · mock: eksik: setup
- [✅ owner] Telefon görünümü · rol: owner · nasıl: telefon çerçevesi · mock: var

---

## 10.12 Settings · Support — /app/settings/support

### Parçalar
- Başlık "Support" + açıklama — `settings/SupportSettingsPage.tsx:42`.
- **Contact**: açıklama + "Email support" (mailto) ya da "Support email is not configured." (VITE_SUPPORT_EMAIL yoksa ve üretim derlemesiyse) — `:48–74`.
- **Workspace details**: açıklama, "Copy diagnostics" → "Copied"; Workspace, Workspace ID, Effective role (rol adı yoksa ham anahtar: "owner") — `:75–113`; hata "Copy failed. Select the values manually." — `:114–118`.
- Kapı yok: Settings'e giren herkes görür (SettingsLayout) — `App.tsx:578–582`.

### Senaryolar
- [✅ owner] Support sayfası (PAGES derlemesinde "Support email is not configured.") · rol: owner · nasıl: /app/settings/support · mock: var
- [❌ EKSİK] "Email support" düğmesi görünür · rol: owner · nasıl: — · mock: eksik: `.temp/pages/.env`'e VITE_SUPPORT_EMAIL
- [❌ EKSİK] "Copied" durumu · rol: owner · nasıl: Copy diagnostics · mock: var (pano izni ortama bağlı)
- [❌ EKSİK] Kopyalama başarısız · rol: owner · nasıl: — · mock: eksik: panoyu reddeden setup
- [❌ EKSİK] Özel rol adıyla "Effective role" (ör. Shift Lead) · rol: özel · nasıl: — · mock: eksik: özel rol izleyici + `roleName`
- [✅ owner] Telefon görünümü · rol: owner · nasıl: telefon çerçevesi · mock: var

---

## Bulunan kod boşlukları (harita dışı not, düzeltme önerisi değil)
1. **Roller "başkası değiştirdi / rol kullanımda" dalı ölü**: `settings/roles-data.ts:37` hatayı düz `Error` olarak atar, `reason` taşımaz; `RolesSettingsPage.tsx:57` `refusedWith(err, "role.changed" | "role.in_use")` hiç eşleşmez → ham sunucu metni çıkar, liste yenilenmez.
2. **Sidebar Settings bağlantısı ile giriş kapısı farklı**: `shell/AppShell.tsx:170` yalnız `workspace.manage/roles.read/documents.read`'e bakar; `settings-access.ts:229` daha geniş. Yalnız jobs/shift catalog/schedule rules/notification okuma izni olan özel rol Settings'e adresle girer ama bağlantıyı görmez.
3. **Jobs salt-okurda yazma düğmeleri görünür**: "Add job" (`JobsSettingsPage.tsx:656`) ve Archive (`:205`) `canEdit`'e bağlı değil; Archive tıklanınca "Jobs edit access required" hatası.
4. **Job çekmecesinde Cancel kaydedilmemiş atamaları sormadan atar**: `JobAssignmentsDrawer.tsx:638` `onClose` (X ise `requestClose` ile "Discard changes?" sorar).
5. **Ekranda kod adı**: bildirim audit satırı ham eylem anahtarı (`NotificationSettingsPage.tsx:485` "notification.policy.saved"); Support "Effective role" ham rol anahtarı (`SupportSettingsPage.tsx:17`); şablon önizlemesi ham durum (`SignatureTemplatesSettingsPage.tsx` "2 · draft"); yayın penceresinde bilinmeyen eylem ham (`DocumentPublicationDialog.tsx:217`, `DocumentDefinitionApply.tsx:70`).
6. **Documents ve Acknowledgements salt-okurda ayrıntı görülemez**: satır adı pasif, menü yok (Documents) → okuma izni olan kişi bir belge türünün kurallarını açıp okuyamaz.
7. **Shift labels salt-okurda çekmece kapatılamaz** (X ve Cancel `!canEdit` ile pasif, `ShiftLabelsSettingsPage.tsx:208`, `:270`); pratikte çekmece salt-okurda açılmadığı için görünmez.

## Sayılar
- Sayfa: mevcut 13 (10.0–10.12) / yeni gereken 0 (ortak çerçeve ve giriş kapısı ayrı bölüm; senaryoları 10.0'a eklenebilir). Yönlendirme: 5 satır (shift-label, important-dates, closed-days, important-dates/closed-days, documents eski bağlantıları).
- Parça (madde): 131
- Senaryo: 239 — ✅ 43 (29 farklı mevcut senaryo; 14 ✅ satırı aynı senaryonun telefon çerçevesi) / ❌ 196
- Mock eksiği olan senaryo: 70

---

