# Tasarım canvas'ı — Newfork: Pre-business & Settings

Canvas: https://claude.ai/artifact/KctKCoGjfEDgKSCh7HtLmD ("Newfork — Pre-business & Settings", 37 artboard)

Giriş öncesi akış (landing, sign in/up, davet, engel hâlleri), iki onboarding sihirbazı ve
Account alanı için **tasarım kararlarının kaynağı** bu canvas. Kod ile canvas çeliştiğinde
karar canvas'ta yazılı olandır; uygulanmamışsa canvas üzerindeki sticky not bunu söyler.

## Canvas kodu okuyamaz — köprü oturumdur

Artboard'lar statik `.dc.html`; ne repo'yu ne API'yi çağırabilir. Bağı kuran şey bu dosya ve
oturum: Claude canvas'ı `Artifact` aracıyla okur (`read`, `path: project/canvas.json` ve ilgili
`project/<Ad>.dc.html`) ve aynı araçla geri yazar. Yani:

- Aşağıdaki satırlardaki ekranlara **dokunmadan önce** ilgili artboard'ı oku.
- Tasarım kararı değiştiğinde canvas'ı da güncelle (yalnız değişen artboard'ı gönder; index'i
  ancak artboard eklendi/silindi/taşındı ya da not değiştiyse gönder).
- Uygulanan bir ekranın canvas'taki "elden geçiyor" notu düşer.

## Satır → kod

| Canvas satırı | Artboard'lar | Kod |
|---|---|---|
| 00 · Ortak dil ve mimari | Main, ChromeMap, DocsArchitecture, NotifArchitecture | `apps/web/src/shell/AppShell.tsx`, `apps/web/src/shell/AppSidebarPanel.tsx` |
| 01–04 · Giriş, davet, iniş, engel | Landing, SignIn, SignUp, SessionEnded, AcceptStates, Pending*, NoBusiness, NoInvitation, SwitcherPage, BlockedStates | `apps/web/src/views/SignInPage.tsx`, `apps/web/src/shell/prebiz/PreBiz.tsx`, `apps/web/src/shell/NoOrganizationPage.tsx`, `apps/web/src/shell/OrganizationSwitcherPage.tsx`, `apps/web/src/employees/AcceptInvitationPage.tsx`, `apps/web/src/auth/WorkspaceSetupPending.tsx` |
| 05 · Owner sihirbazı (4 adım) | OwnerStep1–4 | `apps/web/src/views/OwnerOnboardingPage.tsx` |
| 06 · Employee sihirbazı | EmpWelcome, EmpProfile1/2, EmpDocuments, EmpDocument, EmpPolicy, EmpAvailability, EmpReview | `apps/web/src/employees/EmployeeOnboardingPage.tsx` |
| 07 · Account — kendi alanı | Settings (Businesses), SettingsEmpty, SettingsProfile, SettingsSecurity, SettingsPreferences, SettingsNotifications, BizNotifications, BizDocuments, Switcher | `apps/web/src/account/*` (`WorkspacesPage`, `ProfilePage`, `SecurityPage`, `PreferencesPage`, `NotificationPreferencesPage`, `AccountDocumentsPage`, `AccountLayout`) |

İşletme tarafı ayarlar (`apps/web/src/settings/*`) canvas'ta yalnız mimari artboard'larında
çerçeve olarak geçer; ekran tasarımı orada yok.

## Canvas dışı kurallar (kodda, canvas'ta artboard'u yok)

- **Schedule kartında yönetici notu işareti (BL-199, kullanıcı kararı 2026-09-28, "Yorum köşesi").**
  Notu olan vardiya kartının sol üst köşesinde 11px dolu üçgen; kartın 4px yuvarlaklığıyla kırpılır.
  Renk `--theme-note` `#2f4fa3` (beyazda 7,6:1; vardiya türü tonlu kart zeminlerinde en kötü durumda,
  siyah türde bile 5,6:1). Not yalnız fare üçgenin üstünde 250 ms durunca açılır (görünmeyen hover
  alanı 16px kare); fare üçgenden nota geçince açık kalır, ikisinden de ayrılınca 150 ms sonra kapanır;
  herhangi bir basış, sürükleme, Escape ve kaydırma kapatır. Klavye odağı ve dokunuş açmaz (dokunuş
  bugünkü gibi karta süzgeç koyar); ekran okuyucu kartın adında ", has a manager note" ve açıklamasında
  notun kendisini duyar. Açılan kart: beyaz, solda 3px `--theme-note` çizgi, StickyNote simgesi ve
  "Manager note" başlığı, en çok 272px, kartın üstünde (kart ekranın üst 150px'indeyse altında).
  Seçili kartta onay işareti üçgenin üstünde kalır, üçgenin ucu köşede görünür. `--theme-note` yalnız
  bu işaret içindir; durum, uyarı ya da seçim rengi olarak kullanılmaz.
  Kod: `apps/web/src/schedule/components/ShiftNoteCorner.tsx`, `ShiftCard.tsx`, `styles.css`
  (`.schedule-shift-note-corner`, `.schedule-shift-note-card`).

## Karar kaydı

IA kararının gerekçesi ve Documents/Notifications yüzey ayrımı: `docs/adr/0014-notification-policy-and-catalog.md`
ve canvas üzerindeki kırmızı/teal/turuncu sticky notlar.
