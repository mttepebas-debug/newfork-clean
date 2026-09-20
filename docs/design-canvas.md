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

## Karar kaydı

IA kararının gerekçesi ve Documents/Notifications yüzey ayrımı: `docs/adr/0014-notification-policy-and-catalog.md`
ve canvas üzerindeki kırmızı/teal/turuncu sticky notlar.
