# AUTH-UX-001 Auth, davet ve onboarding akışı: UI tasarımı (mockup) ve web implementasyonu
Status: active (faz 1 teslim edildi 28d4e7a; kullanıcı varyant onayı bekleniyor)
Session: "AUTH-UX-001 mockup tasarımları" (local_2e3cd091)   Branch: task/auth-ux-001   Worktree: newfork-wt/auth-ux-001   DB: -   Portlar: web 5557, API 5556 (ana checkout)
Öneri: Opus 5, high. Çok yüzeyli akış, routing ve auth state; mockup'lar gerçek bileşen olarak yazılır ve seçilen varyant implementasyon olur.
Kaynaklar (bağlayıcı): `C:/Users/TheWe/.claude/plans/kay-t-olduktan-sonra-login-idempotent-eich.md` (T2 kararları, edge case'ler) ve bu dosya. Çelişkide bu dosya kazanır (koordinatör keşfi 2026-09-17).
İlişki: AUTH-002 (DB/API) paralel yürür; final uçtan uca doğrulama AUTH-002 merge edildikten sonra rebase ile yapılır. AUTH-001 raporundaki madde 1, 2a, 2b ve T1 açığı ("Start my own") burada kapanır. AUTH-003 ayrı task olarak açılmadı: revoke edilmiş oturumun kök çözümü yalnız web'dedir (S6).

Goal: Davetli kişi employee olarak doğru workspace'in onboarding'ine gitsin; workspace'i olan kullanıcı yeni daveti login'de görüp erteleyebilsin; owner onboarding'den çıkış olsun; sunucuda sonlanan oturum sign-in'e dönsün. Her yüzey uygulamanın mevcut tasarım diliyle, yalnızca light temada, gerçek uygulama üzerinde mockup olarak önce kullanıcıya sunulsun.

## Keşif bulguları (2026-09-17, main a69276e)
- `NoOrganizationPage` "I'm waiting for another invitation" → `/invitations/pending` → 0 davet + 0 workspace → geri `/no-organization`. Buton bugün kapalı döngü (`PendingInvitationsPage.tsx:46-55`).
- `.account-notice` yalnız `account/account.css`'te tanımlı ve yalnız `AccountLayout` altında yüklenir. Switcher `sign-in-panel` içinde çalışır; orada banner sınıfı yok. Bu yüzden switcher'da davet, `workspace-row` olarak gösterilir; banner yalnız Workspaces sayfasında.
- Revoke edilmiş oturum: API `/v1/context`, getUser hatasını da "Invalid session or membership" 401 ile döndürür (`app.ts:428-431`, `workspace-context.ts:190`). Web `isNoWorkspaceContextError` (`AuthContext.tsx:154-160`) bunu "workspace yok" sayar; PostgREST JWT'yi süresi dolana kadar kabul ettiği için `loadAccountProfile` başarılı olur → context null, hata yok → `/invitations/pending` → `/v1/invitations/pending` 409 "Valid authenticated account required". Kök çözüm web'de: no-context dalında `supabaseClient.auth.getUser()` ile oturum doğrulanır; hata dönerse yerel sign-out (S6). API'ye dokunulmaz.
- `signOut()` scope belirtmiyor (global: tüm cihazlar). Karar: kullanıcı sign-out'u `{ scope: "local" }` (yalnız bu tarayıcı). Kullanıcı itiraz ederse geri alınır.
- `list_my_workspaces` tüm üyelikleri döndürür; `membership_status` enum: active, invited, pending_activation, suspended. "terminated" yok → filtre gerekmez (T2 "terminated" maddesi düşer). Summary status: invited|pending_activation → "pending" (`packages/shared/src/index.ts:458`).
- `first_actionable_path` DB'den `/welcome/...` olarak gelir (`20260908192000_...sql:66-70`); `/welcome/:workspaceId` için web base path'i öne ekler, DB değişmez.
- `getMyOnboarding` (`employees/onboarding-data.ts`) → `GET /v1/me/onboarding`; AUTH-002 `?workspaceId=` parametresini ekler. Merge'e kadar parametre yok sayılır (tek üyelikte fark yok).
- `OrganizationSwitcherPage` `status === "pending"` → `PendingOrganizationStatusPage`. "Continue" doğrudan `/welcome/:workspaceId`'ye gidince bu sayfa ve iki route'u kullanımsız kalır → silinir (suspended sayfası kalır).
- T2 madde 6 (davet token'ını sessionStorage'da saklama) YAGNI ile düşürüldü: `state.from` aynı sekmede yeterli; farklı sekmede e-posta eşleşen bekleyen davet listesi zaten kurtarıyor.
- Portlar: 5555/5556 ana checkout, 5559/5560 AUTH-001 (kapanıyor). Bu task web 5557.

## Tasarım dili (uyulacak; yeni estetik üretilmez)
- Auth ailesi: `main.sign-in-page > section.sign-in-panel`, `p.product-mark` "NEWFORK", lucide ikon 28, `h1`, `p.muted`, liste `div.workspace-list > div.workspace-row` (`strong` + `span`), satır aksiyonları `div.workspace-row-actions` içinde `Button` (`nf-button`; ikincil `secondary-button compact-button`), tam genişlik birincil `nf-button`, üçüncül link `a.text-button`, hata `p.form-error[role=alert]`, yükleniyor `p.settings-state[role=status]`, recovery `div.auth-recovery-actions` (Try again `nf-button` + Sign out `secondary-button`). Kaynak: `styles.css` 3281-3400, 11532-11590; `ProtectedRoute.tsx:31-62`.
- Account ailesi (UI-04): `AccountPageHeader`, `.account-notice` banner (ownership transfer örneği `WorkspacesPage.tsx:450-465`), satır `workspace-row[data-current]`, `account-pill`.
- Owner onboarding: `.onboarding-header` (brand solda, `.onboarding-header-actions` sağda: `secondary-button compact-button` + `.step-count`), `styles.css:11154-11182`.
- Employee onboarding: `.employee-onboarding-progress` koyu sol panel; alt kısımda `.employee-onboarding-reset` "Switch organization" / "Sign out" (`EmployeeOnboardingPage.tsx:156-168`). Owner onboarding çıkışı bu davranışla tutarlı olur.
- Renkler yalnız `--theme-*` token'ları (UI-05); yeni hex yazılmaz; dark kuralı yazılmaz. Yeni CSS yalnız gerekli minimumdur.
- İkonlar lucide: Building2, MailCheck, KeyRound, LogOut, Check.

## Yüzeyler ve tasarım
### S1 Owner onboarding çıkışı (`views/OwnerOnboardingPage.tsx`)
- `.onboarding-header-actions` sırası: [Switch organization] [Sign out] [Start over] [Step x of 4].
- "Sign out": `secondary-button compact-button`, LogOut 16, `signOut()` → ProtectedRoute `/sign-in`'e götürür.
- "Switch organization": Building2 16, yalnız hesabın 1'den fazla workspace'i varsa (`useQuery(["account-workspaces"], listAccountWorkspaces)` — PendingInvitationsPage ile aynı key/fn). Tek workspace'te gösterilmez (switcher'a gidip geri dönmek anlamsız).
- Varyant B (mockup'ta sunulur): aynı iki aksiyon header yerine `.onboarding-content` altında `text-button` satırı olarak. Öneri: A (header).
- Dar ekranda (≤640px) header sarmaya izin verilir; mevcut `.onboarding-header` responsive kuralı kontrol edilir.

### S2 Organization switcher (`shell/OrganizationSwitcherPage.tsx`)
- Davet satırları listenin en üstünde, aynı `workspace-row` kalıbı: `strong` workspace adı, `span` "Invitation · expires {tarih}", aksiyonlar Join (`nf-button compact-button`) + Decline (`secondary-button compact-button`, mevcut `window.confirm` metni). Veri `useQuery(["account-pending-invitations"], listPendingEmployeeInvitations)`. Join → `/welcome/{workspaceId}`; Decline → iki query invalidate.
- Satır bileşeni PendingInvitationsPage ile ortak: `employees/InvitationRow.tsx` (iki tüketici; üçüncü abstraction yok).
- `pending` üyelik satırı: `span` "{role} · onboarding in progress"; buton "Continue" → `/welcome/{workspace.id}`. "View status" ve pending status sayfası kalkar; suspended davranışı aynen kalır.
- Liste yüklenemezse (workspaces null && error): panel içinde recovery görünümü — `h1` "Organizations unavailable", `p.muted` "Your account is signed in, but your organizations could not be loaded.", `p.form-error` hata, `.auth-recovery-actions` Try again (yeniden yükle) + Sign out. Markup `ProtectedRoute.tsx:31-62` ile aynı. Açma (openWorkspace) hataları bugünkü gibi satır altı `form-error` kalır.
- Boş liste + davet yok → `/no-organization` (mevcut). Boş liste + davet var → davet satırları gösterilir, yönlendirme yok.

### S3 Workspaces (`account/WorkspacesPage.tsx`)
- Davet banner'ı (varyant A, öneri): ownership-transfer banner'ıyla aynı `.account-notice` bloğu: `strong` "Invitation · {workspaceName}", `p` "You were invited to join this organization. Declining cannot be undone.", `.workspace-row-actions` Join (`primary-button compact-button`) + Decline (`secondary-button compact-button`). Varyant B: listede üst satır (S2 gibi).
- `pending` satır: `span` "{role} · onboarding in progress"; aksiyon "Open" yerine "Continue" → `/welcome/{id}`; aksiyon menüsü aynı kalır.
- `canCreate = loaded && !loading && (ownerÜyeliğiVar || (workspaces.length === 0 && pendingInvitations.length === 0))`. Davet varken buton görünmez; DB guard (AUTH-002) ikinci savunmadır.

### S4 Active invitation found (`employees/PendingInvitationsPage.tsx`)
- `context` varsa: `p.muted` "You have been invited to join another organization. Join now or decide later. Declining cannot be undone." Alt satır `a.text-button` "Not now" → bayrak set + `appLandingPath(context)`.
- `context` yok ama hesabın en az bir `pending` (onboarding in progress) üyeliği varsa (plan kararı 5-A): "Not now" yine gösterilir ve `/welcome`'a (WelcomeRedirect) döner. Metin context'li sürümle aynı.
- `context` yok ve pending üyelik de yoksa: `p.muted` "Join the organization that invited you. Declining cannot be undone." Alt link yok. "Start my own organization" tamamen kalkar (T2 sert engel kararı).
- Birden fazla davet aynı listede; her satır bağımsız Join/Decline.
- Join → `/welcome/{workspaceId}` (mutation sonucu). Decline sonrası davet kalmadıysa: `listAccountWorkspaces` active sayısı 0 → `/no-organization`; 1 → `refresh()` sonra `appLandingPath(context)`; >1 → `/organization-switcher`.
- Login'de kontrol (ProtectedRoute, `workspace !== "none"` dalı, context varken): sessionStorage `newfork.invitationsChecked` yoksa `["account-pending-invitations"]` sorgusu; yüklenirken `main.auth-loading`; sonuç >0 ve pathname `/invitations/pending` değilse oraya `Navigate`; sonuç ne olursa olsun bayrak set edilir (hata dahil; hata uygulamayı bloklamaz). Bayrak `signIn`, `signUp` ve `signOut`'ta silinir. Polling yok; sayfa odağında yeniden kontrol yok (kilitli karar).

### S5 No organization (`shell/NoOrganizationPage.tsx`)
- Varsayılan görünüm aynı. "I'm waiting for another invitation" artık navigasyon yapmaz; aynı panelde bekleme durumuna geçer.
- Bekleme durumu: MailCheck 28, `h1` "Waiting for an invitation", `p.muted` "No pending invitation for {account.email}. Ask your manager to invite this address, or sign in with the email address the invitation was sent to.", `nf-button` "Check again" (`["account-pending-invitations"]` refetch; >0 → `/invitations/pending`), `secondary-button` "Switch account" (`signOut()` → `/sign-in`), `a.text-button` "Back" (varsayılan görünüme döner). E-posta `useAuth().account?.email`.
- E-posta lookup'ı yok; başka e-posta aranmaz (kilitli karar).

### S6 Sunucuda sonlanan oturum (`auth/AuthContext.tsx`, `lib/supabase.ts`, `views/SignInPage.tsx`)
- `resolveAuthenticatedSession` no-context dalında önce `supabaseClient.auth.getUser()`; hata → `sessionStorage.setItem("newfork.sessionExpired","1")`, `supabaseClient.auth.signOut({ scope: "local" })`, `return null`. Mevcut `onAuthStateChange` SIGNED_OUT dalı state'i temizler; ProtectedRoute `/sign-in`'e götürür.
- `apiRequest` 401 aldığında aynı doğrulama (tek yardımcı `ensureSessionAlive(client)`; iki çağıran). `employees/employee-data.ts` fetch'lerine dokunulmaz.
- `signOut` (kullanıcı): `signOut({ scope: "local" })`.
- SignInPage: bayrak varsa okunup silinir ve `p.muted` metni "Your session ended. Sign in again to continue." olur.

### S7 Workspace bazlı employee onboarding (`employees/EmployeeOnboardingPage.tsx`, `App.tsx`, `onboarding-data.ts`)
- Route `/welcome/:workspaceId/*` eklenir; `base = "/welcome/" + workspaceId`; DB'den gelen `/welcome/...` yolları `base + path.slice(8)` ile önek alır; `location.pathname` karşılaştırmaları ve `requirementPath` aynı yardımcıyı kullanır. Query key `["my-employee-onboarding", workspaceId]`; `getMyOnboarding(workspaceId)` → `?workspaceId=`.
- Onboarding mutasyonları (`onboarding-data.ts`: profile, documents prepare/confirm, submit, reset, leave) da `?workspaceId=` gönderir (AUTH-002 API'si; merge'e kadar yok sayılır). Aksi halde çoklu üyelikte yanlış case'e yazılır.
- `/welcome/*` (id'siz) → `WelcomeRedirect`: `listAccountWorkspaces` → pending 1 → `/welcome/{id}`; >1 → `/organization-switcher`; 0 → `appLandingPath(context)`.
- `AcceptInvitationPage` "Start onboarding" → `/welcome/{acceptance.data}`; PendingInvitationsPage Join → `/welcome/{workspaceId}`.
- `PendingOrganizationStatusPage` ve `/organization-switcher/pending(/ :workspaceId)` route'ları silinir; ilgili test beklentileri güncellenir.

## Faz 1 — Mockup (kullanıcı seçimi için)
- Gerçek uygulama, gerçek bileşenler, yalnız light. Varyantlar aynı sayfa dosyasında, yalnız `import.meta.env.DEV` iken `?variant=b` ile seçilir (S1 ve S3). Diğer yüzeyler tek tasarım.
- Veri: önce gerçek local veri. Local DB'de (docker `supabase_db_newfork-clean`) SQL ile davet satırları oluşturulur (`employee_invitations`, e-posta küçük harf, `status='pending'`, `expires_at` ileri tarih); hesaplar: mevcut "AUTH001 Test Kitchen" owner'ı (davet alan owner senaryosu), yeni bir local test hesabı `auth-ux-invitee@newfork.test` (davetli, workspace'siz), yeni bir hesap davetsiz (S5). Parola girmek gerekirse kullanıcıdan iste; SQL ve hesap adları raporda yazılır, parola yazılmaz.
- Üretilemeyen durumlar için DEV fixture: `apps/web/src/dev/uxMock.ts` (`?uxMock=error` S2 recovery, `?uxMock=session-expired` S6 sign-in notu). Seçim sonrası silinir; bitişte `grep -r uxMock apps/web/src` boş olmalı.
- Teslim: 5557 üzerinde her durum için URL listesi (hangi hesapla, gerçek mi fixture mı), light ekran görüntüleri `artifacts/auth-ux-001/` altında (commit edilmez). Rapor kullanıcıya kendi session'ında ve koordinatöre mesajla.
- Kullanıcı A/B ve metinleri onaylayana kadar faz 2'ye geçilmez; onay beklerken faz 2'nin varyanttan bağımsız kısımları (S4 gate, S6, S7 routing) yazılabilir.

## Faz 2 — Implementasyon
- Seçilen varyantlar kalır, diğerleri ve `uxMock` silinir.
- Testler (yalnız etkilenen dosyalar): `ProtectedRoute.test.tsx` (context + davet → `/invitations/pending`; bayrak varsa geçer), `PendingInvitationsPage.test.tsx` (Not now yalnız context varken; Start my own yok; decline yönlendirmeleri), `OrganizationSwitcherPage.test.tsx` (davet satırı, Continue, recovery), `WorkspacesPage.test.tsx` (banner, canCreate davet kuralı), `NoOrganizationPage.test.tsx` (bekleme durumu), `AuthContext.test.tsx` (getUser hatası → yerel sign-out), `SignInPage.test.tsx` (session-expired notu), `EmployeeOnboardingPage.test.tsx` (`/welcome/:workspaceId` base path), `OwnerOnboardingPage.test.tsx` (Sign out; Switch organization yalnız >1 workspace), `light-theme.test.ts`.
- AUTH-002 merge sonrası `git rebase main`, ana checkout API'si yeniden başlatıldıktan sonra (ya da worker kendi API'sini 5562'de açar) uçtan uca doğrulama: T2 senaryoları (a) davetli e-posta ile linksiz kayıt → Active invitation found, Start my own yok, Decline → no-org → create; (b) owner hesabına başka workspace'ten davet → login'de ekran, Not now → `/app/workspace`, switcher ve Workspaces'te davet, Join → `/welcome/{id}` doğru workspace; (c) tek org, davet yok → direkt land; (d) sunucuda sonlanan oturum → `/sign-in` + not.

Out of scope: DB ve API değişiklikleri (AUTH-002), billing, e-posta lookup'ı, polling, davet token'ı kalıcılığı, dark tema, mobil export.

Done when:
- Faz 1 URL listesi ve ekran görüntüleri teslim edildi; kullanıcı S1/S3 varyantını ve metinleri onayladı.
- S1–S7 uygulanmış; `uxMock` ve kaybeden varyantlar silinmiş; PendingOrganizationStatusPage kaldırılmış.
- Listelenen web testleri, `light-theme`, web typecheck PASS; local uçtan uca (a)(b)(c)(d) geçti.
- Branch push edilmiş, rapor koordinatöre gönderilmiş.

Touches: apps/web/src/{auth,shell,employees,account,views,lib,dev}/…, App.tsx, styles.css (minimum), testler.
Test plan: faz 1'de test yok (mockup); faz 2'de etkilenen test dosyaları + typecheck, sonda tek uçtan uca tur.
Risk:
- ProtectedRoute gate'i her korumalı sayfada çalışır; bayrak mantığı yanlışsa döngü riski. Test zorunlu.
- `signOut` scope değişikliği kullanıcı beklentisine göre geri alınabilir.
- AUTH-002 gecikirse `?workspaceId=` etkisiz kalır; çoklu üyelik senaryosu (b) final doğrulaması merge'ü bekler.

## Notes / Result
- 2026-09-17 faz 1 teslimi (28d4e7a, push edildi): S1–S7 gerçek bileşen olarak yazıldı; 16 light ekran görüntüsü `artifacts/auth-ux-001/` (ana checkout, gitignored); URL listesi worker raporunda. Web typecheck PASS; vitest faz 2'de.
  - Koordinatör incelemesi: tasarım diline uygun. Öneri S1 → A (header); S3 → B (liste satırı: S2/S4 ile tek bileşen, daha az kod, daha kompakt). Kullanıcı seçimi bekleniyor.
  - Kararlar (koordinatör): 5-A gereği pending üyeliği olan context'siz kullanıcıya da "Not now" (→ `/welcome`). Onboarding mutasyonları workspaceId gönderir (AUTH-002 kapsamı genişledi). Global `.nf-button`/`.secondary-button` cascade hatası → tasks/THEME-005; bu task'taki kapsamlı (scoped) düzeltme şimdilik kalır, THEME-005 kaldırır.
  - Worker ek değişiklikleri kabul: pending satırda "Set as default" disabled; aktivasyon sonrası `setTabWorkspaceId` ile yeni org'a land; signOut scope local.
  - Local DB fixture kalıntısı (3 auth-ux-* kullanıcı, "AUTH-UX Bistro", 6 employee_profiles, davetler): uçtan uca doğrulama bitene kadar kalır; silme kullanıcı onayıyla.
- 2026-09-17 ara rapor (c7d5795, push edildi): karar 2 (5-A Not now), 3 (mutasyonlarda workspaceId) ve 6 (Switch account stili, hover yakalanmıştı) uygulandı; varyanttan bağımsız testler yazıldı: 19 dosya / 204 test PASS, web typecheck PASS. Uçtan uca (a): local'de fixture + magic-link eşdeğeri; gerçek sign-up OPS-010 hosted smoke'unda (kullanıcı). Bekleyen: kullanıcı varyant/metin onayı, AUTH-002 merge'ü.
