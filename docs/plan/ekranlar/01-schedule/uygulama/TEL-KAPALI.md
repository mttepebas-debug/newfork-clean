# TEL-KAPALI — Schedule telefonda kapalı

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| Schedule | EKRAN-01 TEL-KAPALI | nf-backend / web hattı | R2 | ONAY @81aa5544 (bağımsız kod incelemesi alt ajanı) | 2026-10-06 |

## Sonrası için
- Kalıp: "bilgisayar gerektiren ekran" için `apps/web/src/auth/DesktopOnlyRoute.tsx` + `apps/web/src/lib/usePhoneWidth.ts` (768 px altı); yeni bir ekran telefonda kapanacaksa rotası bununla sarılır, menü öğesi `AppShell.tsx` süzgecine eklenir.
- Tuzak: telefon alt çubuğu 720 px'te başlıyor, "telefon" kuralı 768 px; 721–767 px'te yan menü görünür, kural orada da geçerli.
- Kalıp: ekran görüntüsü için `e2e/flows/` altına geçici bir senaryo (world kişileriyle gerçek giriş) yazıp `db.lock` ile koşmak, sonra silmek; görüntüler `artifacts/<rol>/<dilim>/`.
- Ölçüm: web vitest 2168 (+1 atlanan), e2e schedule + scope 18/18 (2026-10-06, `81aa5544`).
- Karar adayı: sayfa içi Schedule bağlantılarının telefonda gizlenmesi (raporda soru).

## Rapor
### EKRAN-01 TEL-KAPALI — rapor (web hattı, nf-backend)

**Karar:** bağımsız kod incelemesi ONAY @81aa5544 · sınıf R2
**İzin:** R2 — gönderiliyor (main sha ve CI panoda)
**Risk:** 🟢 yalnız web; kural 768 px altında Schedule'ı kapatıyor, çalışanın kendi Schedule'ı açık
**Soru:** var — telefonda Schedule'a götüren sayfa içi bağlantılar gizlensin mi? (§3)
**Sonraki:** W-1b (veri hattının DB-1b ve DB-2'si main'e girince); BE-2b veri hattında; BL-101 canlı bulgusu ayrı raporda (🔴)

#### 1. Nerede duruyor
Bitti; incelendi, tam kapı ve etkilenen e2e yeşil. Dal `task/ekran-01-tel-kapali`, commit `81aa5544`.

#### 2. Ne yapıldı (öncesi → sonrası)
- **Öncesi:** müdür / owner telefonda (390 px) Schedule'ı alt çubukta görüyor, açınca masaüstü ızgarasının sıkışmış hâlini alıyordu.
- **Sonrası:** 768 px altında:
  - Yan menüde ve alt çubukta (More dahil) Schedule yok. Requests ayrı ekran, görünür kalıyor (ana öğe olarak).
  - `/app/schedule`, `/app/schedule/export`, `/app/schedule/templates` adresle açılırsa sayfa yerine tek satır: "Schedule is available on a computer." Schedule verisi hiç okunmuyor.
  - Employee view → Schedule (`/app/employee-hub/schedule`) değişmedi.
  - 721–767 px: yan menü görünür, Schedule onda yok (alt çubuk 720 px'te başlıyor; kural 768).
- Eski telefon Schedule düzenini kilitleyen üç CSS testi silindi (`ScheduleEditStripStyles.test.ts`: 520 / 720 px kuralları).

#### Kanıt
- Önce kırmızı: `App.test.tsx` "keeps Schedule out of the phone menu…" ve "…export and templates addresses closed on a phone too" (önce "Unable to find … Schedule is available on a computer.").
- Tam kapı (`81aa5544`): lint + typecheck + test + build EXIT=0 — ui 9, shared 210, api 990, web 2168 (+1 atlanan).
- E2E (gönderimden önce, db.lock): `schedule-*` + `scope-and-employee-view` (telefondaki Employee view akışı dahil) + ekran görüntüsü senaryosu: 18 passed (2.9m).
- Ekran görüntüleri (masaüstü 1440 + telefon 390), `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-dewdney-c78421\artifacts\nf-backend\TEL-KAPALI\`:
  - `1-desktop-1440-schedule.png` — masaüstünde Schedule açık, menüde var.
  - `2-phone-390-workspace-menu.png` — telefonda alt çubuk: Workspace, Requests, Employees, Availability, More.
  - `3-phone-390-schedule-address.png` — telefonda adresle Schedule: tek satır.
  - `4-phone-390-more-sheet.png` — More sayfası: Schedule yok.
  - `5-phone-390-employee-schedule.png` — çalışanın kendi Schedule'ı telefonda açık.

#### 3. Açık kalan ve nedeni
- **Soru — Telefonda Schedule'a götüren sayfa içi bağlantılar ne olsun?**
  - Bugün (bu dilimle): Workspace → "Open Schedule" kutusu (`WorkspacePage.tsx:408`, `:447`), kurulum listesinde "First schedule view" (`:269`), bildirimdeki vardiya bağlantısı (`NotificationShiftDetails.tsx:181`), Shift Hub'da müdürün "View current schedule" bağlantısı (`ShiftExchangeHub.tsx:1459`) telefonda görünüyor; dokununca tek satır açılıyor.
  - Örnek: Ayşe telefonda Workspace'te "Open Schedule"a dokunur, "Schedule is available on a computer." okur.
  - (a) **(Önerilen)** Telefonda bu bağlantılar gizlenir; ekranlar Schedule'ı hiç önermez. Dayanak: KARARLAR "Schedule telefonda tamamen kapalı" ("tamamen") + ILKELER A anti-hedef "kurumsal hantallık" (çıkmaz sokak yok).
  - (b) Bugünkü gibi kalır: bağlantı tek satıra götürür (kural metni yalnız menüyü sayıyor).
  - İş arayüz hattının (sunum); bu dilimde dokunulmadı.
- Ölü CSS (arayüz hattına not): `styles.css`'in 520 / 720 px medya kurallarındaki Schedule düzenleme şeridi ve Settings menüsü kuralları artık hiç devreye girmiyor (Schedule 768 altında açılmıyor) → W-4/W-5 ölü CSS.
- İnceleme notu: telefon testi yalnız owner ve "Main navigation" ile; More sayfasının kendi gezinmesi ve 767/768 sınırı e2e görüntüsüyle doğrulandı, vitest'te değil.

#### 4. Ekranda ne değişti
- Telefonda (768 px altı), müdür / owner / admin: alt çubukta ve More'da Schedule yok; Schedule adresi tek satır.
- Masaüstünde değişiklik yok.

#### 5. Sırada ne var
- W-1b (bağımlılık bekliyor).
- Sayfa içi bağlantılar sorusunun cevabı → arayüz hattı.

Skills: superpowers:test-driven-development.

## İnceleme

### Kod incelemesi — KARAR: ONAY @81aa5544
KARAR: ONAY @81aa5544

Limits of this review: I had no shell tool. I did not run `git diff`, `git show` or vitest. I read the worktree files, which are at the 81aa5544 tree, and I did not read the diff, so I did not review the deleted CSS tests. Nothing was run, so the two new App tests are unexecuted.

**Critical:** none.

**Important (non-blocking, needs a product decision):**
1. Phone managers still get visible entry points that dead-end on the one-line page. The rule only forbids the sidebar and bottom bar, and an address opened by hand shows the line, so this matches what was written. But "closed completely" invites a tap-to-dead-end.
   - Workspace "Open Schedule" widgets at `apps/web/src/views/WorkspacePage.tsx:408` and `:447`.
   - The onboarding checklist item "First schedule view" at `WorkspacePage.tsx:269`.
   - The notification shift link at `apps/web/src/communications/NotificationShiftDetails.tsx:181`.
   - The manager branch of "View current schedule" at `apps/web/src/employee-hub/shift-exchanges/ShiftExchangeHub.tsx:1459`.

   Scenario: a manager on a phone taps "Open Schedule" on Workspace and lands on "Schedule is available on a computer." Ask Mert whether those links should be hidden on a phone (`usePhoneWidth`) or left as they are. Per CLAUDE.md §4, the hiding work would be nf-arayuz's.

**Checked, no defect found:**
- **Landing:** `resolveLanding.ts:71-73` sends a manager to `/app/workspace` as home. `/app/schedule` is only a fallback for someone with `schedule.read` but no `workspace.read`, and that person does not exist among the owner, admin and manager roles.
- **Phone bar and More sheet:** `ManagementMobileNav` receives `visibleNavItems`, which the same `phone` filter prunes (`AppShell.tsx:263-269, 504-509`). Schedule is therefore gone from both the bar and the More sheet.
- **Requests entry:** with the parent hidden, Requests renders as a top-level item. The `nav-item-child` class and the expansion logic in `AppShell.tsx:270-276, 346` both check that the parent is visible.
- **Closed routes:** `/app/schedule`, `/export` and `/templates` are all wrapped, and the wrapper sits inside `PermissionRoute`. A phone employee never reaches the line, and the API is not called (the test asserts `getScheduleReadModel` is not called).
- **Employee view and dev routes:** `/app/employee-hub/schedule` is not touched. The dev `schedule-badge-lab` route is not wrapped, but it is DEV-only (`import.meta.env.DEV`).
- **Safety and resizing:**
  - `usePhoneWidth` guards `window` and `matchMedia` and passes a server snapshot of `false`.
  - It subscribes and unsubscribes on the same `MediaQueryList`, so it follows resizing and rotation.
  - A real `matchMedia` returns a fresh list on each call, but the `change` listener is attached to the one list that `subscribe` holds. That is correct.
- **721 to 767 px gap:** the sidebar shows without Schedule, and the bottom bar only appears at 720 px and below. This is consistent with the 768 px rule.
- **Test isolation:** the `beforeEach` at `apps/web/src/App.test.tsx:259` resets `matchMedia` to desktop, so `emulatePhone()` does not leak into other tests.

**Weak test coverage (below the reporting threshold):** the phone nav test asserts only the "Main navigation" landmarks, not the More sheet's "More pages" nav. It runs only as owner, never as manager. It does not test the 767/768 boundary because the stub matches any query containing "max-width". The rule holds in code, but the test would not catch a regression in those three places.

**Memory note for the caller (I wrote none):** Schedule is closed on phones below 768 px (Mert, 2026-10-06, KK-166). The mechanism is `usePhoneWidth` plus `DesktopOnlyRoute` on three routes, and the `/app/schedule` nav item is dropped on phone width. The in-page links to `/app/schedule` (Workspace widgets, checklist, notification link, Shift Hub manager link) were left open pending a decision.
