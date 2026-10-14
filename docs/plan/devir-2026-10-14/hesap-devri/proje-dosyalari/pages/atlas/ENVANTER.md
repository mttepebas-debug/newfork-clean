# Newfork web uygulaması: sayfa envanteri (atlas için)

Kaynak: origin/main df17fd6, 2026-10-09

Bu dosya `apps/web/src` altındaki her sayfayı, çekmeceyi (side panel) ve büyük diyaloğu sayar. Her bilgi koddan okundu; koddan çıkarım olan yerler "(çıkarım)" diye işaretli. Yollar repo köküne göredir.

## 0. Okuma rehberi

**Rol kuralı nereden geliyor:**
- Rota kapıları: `apps/web/src/App.tsx`. Üç tür kapı var:
  - `PermissionRoute` (`apps/web/src/auth/PermissionRoute.tsx`): izin anahtarı (`context.permissions`) ve isteğe bağlı rol listesi. Geçemeyen kişi kendi açılış sayfasına yönlenir (`appLandingPath`: employee → `/app/employee-hub`, diğerleri → `/app/workspace`).
  - `ActionRoute` (`apps/web/src/auth/ActionRoute.tsx`): sunucunun verdiği aksiyon listesi (`context.actions`, SQL `app_private.actor_actions`). Aynı yönlendirme.
  - `DesktopOnlyRoute` (`apps/web/src/auth/DesktopOnlyRoute.tsx`): telefonda (genişlik < 768 px) sayfa açılmaz, tek satır "Schedule is available on a computer." yazar.
- Varsayılan izinler: `packages/shared/src/index.ts` → `permissionsForRole` / `rolePermissions`:
  - **owner** ve **admin**: bütün izinler. Fark yalnız owner-only aksiyonlarda (sahiplik devri, workspace kapatma, admin yapma).
  - **manager**: `workspace.read`, `schedule.*` (read, manage, publish, templates, export), `schedule.time_off_requests.read/manage`, `schedule.shift_change_requests.read/manage`, `availability.read/manage`, `important_dates.read/manage`, `employees.read/manage/archive`, `employee_onboarding.review`, `announcements.read/manage`, `notifications.read`. **Hiçbir `settings.*`, `roles.read`, `documents.read`, `employee_documents.read`, `notifications.settings.*` yok.**
  - **employee**: `workspace.read`, `schedule.read`, `announcements.read`, `notifications.read` (+ kişisel bildirim izinleri).
  - Özel roller (Settings → Roles & permissions) bu listeyi değiştirebilir; aşağıdaki rol sütunları **varsayılan** rollere göredir.
- Menü görünürlüğü: `apps/web/src/shell/AppShell.tsx` (`navItems`, `settingsNavItem`, `canViewSettings`) ve `apps/web/src/settings/SettingsLayout.tsx` (Settings alt menüsü, `canEnterSettings`).
- Veri: ekran → `*-data.ts` hook'u → API. API yolları aşağıda `:w` = workspace id kısaltmasıyla yazıldı (`/v1/workspaces/:w/...`). Doğrudan Supabase tablo okuması/yazması "supabase" diye ayrıca belirtildi.

**Uygulama çerçevesi (AppShell) her `/app/*` sayfasında şunları çağırır** (mock için ortak):
- `GET /v1/context` (aktif workspace, izinler, aksiyonlar; `AuthContext`)
- supabase `user_profiles`, `user_preferences` select + storage `account-avatars` signed URL (hesap profili; `apps/web/src/lib/supabase.ts` `loadAccountProfile`)
- `GET /v1/me/workspaces/:w/documents/access` (`DocumentAccessRoute`: eksik zorunlu belge varsa `/account/documents?workspace=:w`'ye atar; 30 sn'de bir)
- `GET /v1/account/workspaces` ve `GET /v1/invitations/pending` (sol üstteki workspace değiştirici, `apps/web/src/shell/WorkspaceSwitcher.tsx`)
- `GET /v1/account/attention` (Account satırındaki bekleyen sayısı)
- `GET /v1/workspaces/:w/communications/notifications?unread_only=false&limit=1` (Notifications okunmamış rozeti, 60 sn)
- `GET /v1/workspaces/:w/me/avatar` (Account satırındaki fotoğraf)
- Workspace değiştirince: `GET /v1/context` (seçilen workspace başlıkla `X-Newfork-Workspace-Id`)
- Realtime: özel kanallar (bildirimler, shift exchange); mock'ta kapatılabilir.

**Menü yapısı (masaüstü sol kenar çubuğu):**
- Üst: menü daralt düğmesi, workspace değiştirici.
- Yönetim grubu (owner, admin, manager): Workspace · Schedule (altında Requests) · Employees (altında Documents) · Availability · Important Dates.
- Çalışan grubu (employee rolü ya da "Employee view"a geçen yönetici): Home · Schedule · Shift Hub · My Availability.
- Ortak: Announcements · Notifications (okunmamış rozeti).
- Alt bölüm: Settings (yalnız yönetim görünümünde) · Employee view / Management view geçişi (kendi çalışan kaydı olan owner/admin/manager) · Account (`/account/profile`, bekleyen sayısı) · Sign out.
- Telefon (< 768 px): sol çubuk yerine alt çubuk. Yönetim: ilk 4 bağlantı çubukta, kalanlar + Account + Sign out "More" sayfasında (`apps/web/src/shell/ManagementMobileNav.tsx`); Schedule telefonda hiç görünmez. Çalışan: Home · Schedule · Requests (= Shift Hub) · More (`apps/web/src/employee-hub/EmployeeMobileNav.tsx`).

**Ortak bileşenler:**
- Çekmece: `apps/web/src/settings/CatalogDrawer.tsx` (açıkken sayfanın geri kalanı `inert`).
- Onay diyaloğu: `apps/web/src/shell/ConfirmDialog.tsx`; iki tıklı kırmızı düğme `ConfirmButton` (`packages/ui`).
- Erişim-yok kartı: `apps/web/src/shell/NoAccessState.tsx` (API `authz.*` reddi gelince; "Back to Home").

## 1. Özet tablo (uygulama içi sayfalar)

Rol sütunları: E = görür, K = kısmen (salt okur ya da bir kısmı), H = görmez (yönlenir). Varsayılan rollere göre.

| Sayfa (UI adı) | Rota | Kaynak dosya | owner | admin | manager | employee | Menüdeki yeri |
|---|---|---|---|---|---|---|---|
| Workspace | `/app/workspace` | `apps/web/src/views/WorkspacePage.tsx` | E | E | E | H | Sol çubuk, yönetim, ilk satır |
| Schedule | `/app/schedule`, `/app/schedule/export` | `apps/web/src/views/SchedulePage.tsx` | E | E | E | H | Sol çubuk; yalnız masaüstü. **Mevcut atlas sayfası var** |
| Schedule templates | `/app/schedule/templates` | `apps/web/src/views/ScheduleTemplatesPage.tsx` | E | E | E | H | Menüde yok; yalnız masaüstü |
| Requests | `/app/schedule/requests` | `apps/web/src/views/ScheduleRequestsPage.tsx` | E | E | E | H | Sol çubuk, Schedule'ın altında |
| Employees | `/app/employees` | `apps/web/src/employees/EmployeesPage.tsx` | E | E | K | H | Sol çubuk |
| Employees → Archived | `/app/employees/archive` | aynı dosya | E | E | K | H | Employees sayfasında "Archived" sekmesi |
| Documents (çalışan belgeleri) | `/app/employees/documents` | `apps/web/src/documents/EmployeeDocumentsPage.tsx` | E | E | H | H | Sol çubuk, Employees'in altında |
| Availability | `/app/availability` | `apps/web/src/views/AvailabilityPage.tsx` | E | E | E | H | Sol çubuk |
| Important Dates | `/app/important-dates` | `apps/web/src/settings/ImportantDatesSettingsPage.tsx` | E | E | K | H | Sol çubuk |
| Employee Hub: Home | `/app/employee-hub` | `apps/web/src/views/EmployeeHubPage.tsx` → `apps/web/src/employee-hub/EmployeeDashboard.tsx` | K | K | K | E | Çalışan grubu "Home" |
| Employee Hub: Schedule | `/app/employee-hub/schedule` | `EmployeeHubPage.tsx` → `apps/web/src/employee-hub/EmployeeScheduleBoard.tsx` | K | K | K | E | Çalışan grubu "Schedule" |
| Shift Hub | `/app/employee-hub/shift-hub` | `EmployeeHubPage.tsx` → `apps/web/src/employee-hub/shift-exchanges/ShiftExchangeHub.tsx` | K | K | K | E | Çalışan grubu "Shift Hub" (telefonda "Requests") |
| My Availability | `/app/employee-hub/my-availability` | `EmployeeHubPage.tsx` (`AvailabilityView`) | K | K | K | E | Çalışan grubu |
| More (telefon) | `/app/employee-hub/more` | `apps/web/src/employee-hub/EmployeeMobileNav.tsx` (`EmployeeMorePage`) | K | K | K | E | Telefonda alt çubuk "More" |
| Announcements | `/app/announcements`, `/app/announcements/:announcementId` | `apps/web/src/views/AnnouncementsPage.tsx` | E | E | E | K | Sol çubuk, ortak |
| Notifications | `/app/notifications` | `apps/web/src/views/NotificationsPage.tsx` | E | E | E | E | Sol çubuk, ortak |
| Settings (giriş) | `/app/settings` | `apps/web/src/settings/SettingsLayout.tsx` + `SettingsHomeRedirect.tsx` | E | E | H | H | Sol çubuk alt bölüm |
| Settings → General | `/app/settings/general` | `apps/web/src/settings/GeneralSettingsPage.tsx` | E | E | H | H | Settings → Organization |
| Settings → Locations | `/app/settings/locations` | `apps/web/src/settings/LocationsSettingsPage.tsx` | E | E | H | H | Settings → Organization |
| Settings → Jobs | `/app/settings/jobs` | `apps/web/src/settings/JobsSettingsPage.tsx` | E | E | H | H | Settings → Organization |
| Settings → Notifications | `/app/settings/notifications` | `apps/web/src/settings/NotificationSettingsPage.tsx` | E | E | H | H | Settings → Organization |
| Settings → Schedule rules | `/app/settings/scheduling` | `apps/web/src/settings/SchedulingSettingsPage.tsx` | E | E | H | H | Settings → Scheduling |
| Settings → Conflict handling | `/app/settings/scheduling/conflicts` | `apps/web/src/settings/ConflictHandlingSettingsPage.tsx` | E | E | H | H | Settings → Scheduling |
| Settings → Shift catalog | `/app/settings/scheduling/shift-types`, `/app/settings/scheduling/shift-labels` | `apps/web/src/settings/ShiftCatalogSettingsPage.tsx` (+ `ShiftTypesSettingsPage.tsx`, `ShiftLabelsSettingsPage.tsx`) | E | E | H | H | Settings → Scheduling |
| Settings → Roles & permissions | `/app/settings/roles`, `/app/settings/roles/:roleId` (`new` dahil) | `apps/web/src/settings/RolesSettingsPage.tsx` | E | E | H | H | Settings → Access |
| Settings → Documents | `/app/settings/documents` | `apps/web/src/documents/DocumentsSettingsRoute.tsx` → `apps/web/src/settings/DocumentsSettingsPage.tsx` | E | E | H | H | Settings → Access |
| Settings → Acknowledgements | `/app/settings/acknowledgements` | `apps/web/src/settings/SignatureTemplatesSettingsPage.tsx` | E | E | H | H | Settings → Access |
| Settings → Support | `/app/settings/support` | `apps/web/src/settings/SupportSettingsPage.tsx` | E | E | H | H | Settings → Help |

Notlar:
- Employee Hub sayfalarında owner/admin/manager "K": yalnız kendi çalışan kaydı varsa (`employee_hub.read` aksiyonu, kapsamı "own"), sol çubuktaki "Employee view" ile girer; kaydı yoksa Employee Hub erişim-yok kartı gösterir (`App.tsx` yorumu).
- Manager'ın "K" olduğu yerler: Employees'te yalnız çalıştığı lokasyonlardaki kişiler (sunucu süzer; drawer'da Documents sekmesi yok, Terminate kapalı ve nedeni yazılı). Important Dates'te yazma yalnız kendi tek lokasyonuna; birden çok lokasyon ya da bütün workspace yalnız owner/admin (`important_date.write_wide`).
- Employee Announcements'ta "K": yalnız okur ve onaylar (acknowledge); sekme yok.
- Manager Settings'e varsayılan olarak giremez (`canEnterSettings` false → `/app`). Özel role bir `settings.*.read` izni verilirse o alt sayfa açılır; ama sol çubukta Settings bağlantısı yalnız owner/admin ya da `workspace.manage` / `roles.read` / `documents.read` izni olanda görünür (çıkarım: böyle bir özel manager rolü Settings'e yalnız adresle girer).

## 2. Uygulama içi sayfalar, tek tek

### 2.1 Requests (`/app/schedule/requests`)
- Dosya: `apps/web/src/views/ScheduleRequestsPage.tsx`
- Kapı: sayfanın kendi içinde `PermissionRoute` (`schedule.time_off_requests.read` ya da `schedule.shift_change_requests.read`), rol kısıtı yok; employee bu izinleri tutamaz (employee'ye uygun izin listesinde değil) → fiilen owner, admin, manager. Telefonda açılır.
- Sekmeler (üst sağda, `?tab=`): **Time off** (sayıyla; aksiyon `requests.read` ister → `schedule.time_off_requests.read`) · **Shift changes** (aksiyon `exchange.read` → `schedule.shift_change_requests.read`). `?tab=availability` gelirse `/app/availability`'ye atar.
- Time off sekmesi:
  - Kuyruk: **Needs review** / **Closed**; filtre: lokasyon seçici ("All locations"), arama ("Search employee or note"); sütunlar sıralanır: Employee, Dates, Decide by, Status, Review (açılacak vardiya sayısı).
  - Durumlar: yükleniyor ("Loading requests..."), hata, erişim-yok kartı, boş ("Queue clear / No requests match these filters."), dolu, sayfalama (Newest / Older, Closed kuyruğunda).
  - Satıra tıklayınca **çekmece "Review request"** (`CatalogDrawer`, `?request=<id>`): tarih, gönderim, onay ilerlemesi (`apps/web/src/views/TimeOffProgressPanel.tsx`), çalışan notu, istenen dönemler, Activity zaman çizelgesi; düğmeler Deny/Decline + Approve, onaylanmışsa Revoke + Shorten (`apps/web/src/views/TimeOffShorten.tsx`), yetki yoksa "View-only access". Çekmece içi bildirim (uyarı/hata).
  - **Diyalog** `ActDialog` (`ConfirmDialog`): "Approve time off?" / "Deny time off?" / "Decline cancellation?" / "Revoke time off?" (Revoke'ta gerekçe zorunlu). Manager'ın basit oyu diyalogsuz gider.
- Shift changes sekmesi: `ShiftExchangeHub` yönetici modu (ayrıntı 2.10). Kuyruklar: Ready for review (sayılı) · Finding cover · Awaiting response · History; lokasyon + arama + tarih aralığı; satır açınca **çekmece "Review shift change"** (`ManagerRequestSurface`), karar için `ExchangeDialog` ("Confirm your decision" / "Decline this application" / "Close this search").
- API:
  - `GET /schedule/requests?time_off_queue=needs_review|closed&search=&location_id=&time_off_cursor=` (workspace başlıkla; API'de `/v1/workspaces/:w/schedule/requests` eşi de var, web kısa olanı kullanır)
  - `POST /v1/workspaces/:w/time-off/:requestId/verdict` (approve/deny)
  - `POST /v1/workspaces/:w/time-off/:requestId/revoke`
  - `POST /v1/workspaces/:w/time-off/:requestId/shorten`
  - Shift changes: `GET /v1/workspaces/:w/shift-exchanges?view=manager&from=&to=[&case_id=]`, `GET /v1/workspaces/:w/shift-exchanges?case_id=&application_id=` (önizleme), `POST /v1/workspaces/:w/shift-exchanges` (komut: approve, reject, close; `Idempotency-Key` başlığı)

### 2.2 Employees ve Archived (`/app/employees`, `/app/employees/archive`)
- Dosya: `apps/web/src/employees/EmployeesPage.tsx`
- Kapı: `PermissionRoute employees.read` (rol listesi yok); menüde roller owner/admin/manager.
- Başlık: "Employees", düğme **Add employee** (`employee.create` aksiyonu; arşivde yok).
- Durum sekmeleri: All · Invited · Onboarding · Needs Attention · Active · **Archived** (arşiv ayrı rota). Lokasyon filtresi (seçenekler listedeki kişilerin birincil lokasyonundan), arama ("Search name, location, or job"), sütun ayarı açılır kutusu (`role="dialog"` "Employee table columns": göster/gizle, sırala, sıfırla; tarayıcıda saklanır). Sütunlar: Employee, Status, Primary location, Primary job, Access, Start date, Invite email (varsayılan gizli).
- Durumlar: yükleniyor, hata, erişim-yok, boş ("No employees yet" / "No archived employees" / "No matching employees"), dolu, telefon (tablo yatay kayar, çıkarım).
- Açılan: **Employee drawer** (2.3) satıra tıklayınca `?employeeId=<id>&section=profile`, eklerken `?mode=create`.
- API: `GET /v1/workspaces/:w/employees?archived=false|true&search=&status=all|invited|onboarding|needs_attention|active`

### 2.3 Employee drawer (Employees, Availability ve Documents'tan açılır)
- Dosya: `apps/web/src/employees/EmployeeDrawer.tsx` (tam ekran yan panel, `role="dialog"`)
- Bölümler (sol ray, `?section=`): **Profile · Employment · Availability · Documents · Access · History**.
  - Yeni kişi eklerken yalnız Profile + Employment.
  - Availability: `availability.team_read` (owner, admin, manager). İçerik `apps/web/src/availability/WeeklyPreferencesPanel.tsx`.
  - Documents: `documents.read` (varsayılan owner, admin). İçerik `apps/web/src/documents/EmployeeDocumentPanel.tsx` → belge listesi + belge çekmecesi.
  - Access: davet/rol/erişim kaldırma/foto hakkı varsa.
  - History: yaşam döngüsü olayları (boşsa "No history yet").
- Durumlar: yükleniyor ("Loading employee..."), erişim-yok kartı, hata + Retry, salt okur, kaydedilmemiş değişiklik koruması (tarayıcı geri tuşu dahil), yeni kişi sihirbazı (ad hazır olmadan Employment açılmaz), belge etki önizlemesi (`apps/web/src/documents/EmployeeAssignmentDocumentPreview.tsx`).
- İçindeki diyaloglar ve iki tıklı düğmeler:
  - **Terminate employee** diyaloğu (`EmployeeTerminationDialog`, "Terminate employee" düğmesi; manager için kapalı ve nedeni yazılı). Arşivlenmişse düğme "Restore employee".
  - "Request changes to …?" `ConfirmDialog` (onboarding incelemesinde bir belgeyi geri çevirme).
  - İki tık: Remove access, Revoke invitation, Remove photo, lokasyondan çıkarma (`apps/web/src/employees/EmployeeLocationParts.tsx`).
  - Davet bağlantısını kopyalama ("Copy link"), Resend.
  - Tercih edilen ad onayı (bekleyen istek).
- API:
  - `GET /v1/workspaces/:w/employees/:id`, `GET /v1/workspaces/:w/employees/reference-data`
  - `POST /v1/workspaces/:w/employees/create` (yeni), `PUT /v1/workspaces/:w/employees/:id` (kaydet)
  - `PATCH /v1/workspaces/:w/employees/:id/role`, `PATCH /v1/workspaces/:w/employees/:id/archive` (Restore)
  - `POST /v1/workspaces/:w/employees/:id/termination`
  - `DELETE /v1/workspaces/:w/employees/:id/locations/:locationId`
  - `POST /v1/workspaces/:w/employees/:id/invitations`, `POST .../invitations/retry`, `DELETE .../invitations`, `GET .../invitations/link`
  - `DELETE /v1/workspaces/:w/employees/:id/access`
  - `GET /v1/workspaces/:w/employees/:id/avatar`, `DELETE .../avatar`
  - `GET /v1/workspaces/:w/employees/:id/onboarding`, `POST .../onboarding/review`
  - `GET /v1/workspaces/:w/preferred-names/pending`, `POST /v1/workspaces/:w/preferred-names/:requestId/decision`
  - `PUT /v1/workspaces/:w/employees/:id/emergency-contact` (owner'ın kendi kaydı)
  - `POST /v1/workspaces/:w/employee-documents/:employeeId/assignment-preview`
  - Availability bölümü: `GET /v1/workspaces/:w/availability/weekly?employee_id=`, `POST /v1/workspaces/:w/availability/weekly` (`Idempotency-Key`)
  - Documents bölümü: 2.4'teki belge uçları (`/employee-documents`)

### 2.4 Documents, çalışan belgeleri (`/app/employees/documents`)
- Dosya: `apps/web/src/documents/EmployeeDocumentsPage.tsx` → `apps/web/src/documents/EmployeeDocumentsList.tsx`
- Kapı: `ActionRoute documents.read` (izin `employee_documents.read`: varsayılan owner, admin). Menüde Employees'in altında, `employee_documents.read` olana.
- `/app/settings/documents?requirement=…` ya da `?view=employees` gibi eski bağlantılar buraya yönlenir (`DocumentsSettingsRoute`). `?requirement=<id>` çekmeceyi açık getirir.
- Durum sekmeleri: All · Needs review · Missing · Expired · Completed; lokasyon, belge türü, arama ("Search employee or document"); sütun sıralama.
- Durumlar: yükleniyor ("Loading documents…"), erişim-yok, boş ("No documents match these filters."), dolu.
- **Çekmece "Document details"** `apps/web/src/documents/DocumentReviewDrawer.tsx`: dosyalar, indirme, inceleme kararı (onay / ret + düzeltme süresi), muafiyet (`apps/web/src/documents/DocumentExemptionAction.tsx`), saat dilimi, "Provide this document later", teslim süresini uzatma, yeni sürüm yükleme, onay (acknowledgement) metni ve geri çekme, History; "Discard unsaved changes?" `ConfirmDialog`.
- API (yönetici kitlesi kökü `/v1/workspaces/:w/employee-documents`):
  - `GET /v1/workspaces/:w/employee-documents`, `GET .../:requirementId`
  - `POST .../:requirementId/review`, `/exemption`, `/timezone`, `/defer`, `/extend-deadline`, `/upload-url`, `/confirm`, `/submit`, `/acknowledge`, `/withdraw`, `/remove-draft-file`
  - `GET .../:requirementId/submissions/:submissionId/files/:fileId/download`
  - supabase storage: yükleme imzalı token ile belge kovasına (`employeeOnboardingDocumentBucket`)

### 2.5 Availability (`/app/availability`)
- Dosya: `apps/web/src/views/AvailabilityPage.tsx`
- Kapı: `PermissionRoute availability.read`, roller owner/admin/manager.
- Filtre: Submission status (All · Submitted · Not submitted, sayaçlı), lokasyon, arama. Tablo "Team availability".
- Durumlar: yükleniyor, erişim-yok, boş ("No employees match this view"), dolu.
- Açılan: **Employee drawer** Availability bölümünde (`?employeeId=&section=availability`).
- API: `GET /v1/workspaces/:w/availability/weekly/team` + drawer uçları (2.3).

### 2.6 Important Dates (`/app/important-dates`)
- Dosya: `apps/web/src/settings/ImportantDatesSettingsPage.tsx` (eski `/app/settings/important-dates`, `/closed-days` buraya yönlenir)
- Kapı: `PermissionRoute important_dates.read`; menüde owner/admin/manager.
- Sekmeler: Upcoming · Past · Archived; tür filtresi ("All dates" + türler), arama; düğme ekle (`ListAddButton`, yazma hakkı varsa).
- Satır çipleri: Archived, Unpublished, Repeats yearly, Schedule flag. Satır menüsü: Unpublish/Republish, Archive/Restore.
- **Çekmece** (yeni/düzenle): Title, Type, Locations (çoklu seçim, "All locations"), Starts, Ends, Repeats (Does not repeat / Every year), Note, "Flag this date inside scheduling"; silme iki adımlı ("Delete …? This date will be archived…", Keep date).
- Durumlar: yükleniyor, erişim-yok, boş, dolu; kilitli geçmiş hafta (`locked_before`).
- API: `GET /v1/workspaces/:w/settings/important-dates`, `POST /v1/workspaces/:w/settings/important-dates`, `PUT .../:id`, `POST .../:id/unpublish|republish|archive|restore`. (Veri dosyasında `closure-preview` ve `/history` uçları var ama bu sayfa kullanmıyor.)

### 2.7 Workspace (`/app/workspace`)
- Dosya: `apps/web/src/views/WorkspacePage.tsx`
- Kapı: `PermissionRoute workspace.read`, roller owner/admin/manager. Yöneticilerin açılış sayfası.
- Bileşenler (widget): Today · Pending requests · Open shifts · Announcements · Todos · Notifications · Quick actions. **Customize** modu: sırala, gizle/göster, Save/Cancel. Owner ve admin'e ayrıca **Setup checklist** kartı.
- Durumlar: yükleniyor ("Loading Workspace..."), hata, erişim-yok, normal, düzenleme modu, telefon (Schedule bağlantısı gizli).
- API: `GET /v1/workspaces/:w/workspace`, `PUT /v1/workspaces/:w/workspace/layout`, `POST /v1/workspaces/:w/workspace/todos`, `POST .../workspace/todos/:todoId/resolve`, `GET` ve `PATCH /v1/workspaces/:w/workspace/setup-checklist`, `GET /v1/workspaces/:w/shift-exchanges?view=manager` (`exchange.read` olana).

### 2.8 Schedule (`/app/schedule`, `/app/schedule/export`) — mevcut atlas sayfası var
- Dosya: `apps/web/src/views/SchedulePage.tsx` (+ `apps/web/src/schedule/components/*`). **Zaten kapsandı: https://claude.ai/artifact/RNJEGWCDgdG2NpYRpWF4g3**
- Kapı: `schedule.read` (export için `schedule.export` ya da `schedule.read`), roller owner/admin/manager, yalnız masaüstü.
- API özeti (`apps/web/src/schedule/schedule-data.ts`): `GET /schedule/reference`, `/schedule/drafts`, `/schedule/shifts`, `/schedule/publication-status`, `/schedule/pending-ops`; `POST /schedule/edit-lock/acquire`, `PATCH /schedule/edit-lock/heartbeat`, `POST /schedule/edit-lock/autosave`, `DELETE /schedule/edit-lock/release`; `POST/PATCH/DELETE /shifts…`; `POST /schedule/publish(-preview)`, `/schedule/unpublish(-preview)`; templates, export presets/schedules, auto-fill, default-hours; `POST /v1/workspaces/:w/availability/shift-assessment`; shift exchange kurtarma `GET/POST /v1/workspaces/:w/shift-exchanges/schedule-recovery/:session`.

### 2.9 Schedule templates (`/app/schedule/templates`)
- Dosya: `apps/web/src/views/ScheduleTemplatesPage.tsx`
- Kapı: `schedule.templates.read`, roller owner/admin/manager, yalnız masaüstü. Menüde yok; kodda bu adrese giden bağlantı bulunamadı (yalnız adresle).
- Başlık "Schedule templates", "Back to schedule". Durumlar: yükleniyor, hata + Retry, boş ("No templates yet"), tablo; satırda iki tıklı silme, **"Rename template" diyaloğu**.
- API: `GET /schedule/templates`, `PATCH /schedule/templates/:id`, `DELETE /schedule/templates/:id`.

### 2.10 Shift Hub (`/app/employee-hub/shift-hub`) ve yönetici modu
- Dosya: `apps/web/src/employee-hub/shift-exchanges/ShiftExchangeHub.tsx` (çalışan modu `EmployeeHubPage` içinde; yönetici modu Requests → Shift changes)
- Çalışan modu sekmeleri: **Available · My requests · History**; filtre lokasyon ("All my locations"), arama, tarih aralığı (`from`/`to`, varsayılan bugün + 42 gün).
- Yönetici modu sekmeleri: Ready for review · Finding cover · Awaiting response · History.
- Durumlar: iskelet yükleme, "Shift Hub is unavailable" + Retry, çevrimdışı şeridi, yenileme hatası şeridi, başarı bildirimi, boş ("No eligible shifts right now", "No past requests", filtreye uyan yok), seçili vaka detayı (`?case=`), telefon (detay listenin yerine geçer).
- Diyaloglar:
  - **"Find cover or swap"** (`ExchangeDialog`, `?offer=`): cover ya da swap, herkese ya da kişiye; aday listesi; yarıda kapatınca "Keep editing / Discard request".
  - Karar diyaloğu (`ExchangeDialog`): Confirm your decision / Decline this application / Close this search / Request updated / Review needs updating.
  - Yönetici modunda vaka **çekmecesi "Review shift change"**.
  - Kart: `apps/web/src/employee-hub/shift-exchanges/ExchangeShiftCard.tsx`.
- API: `GET /v1/workspaces/:w/shift-exchanges?view=employee|manager&from=&to=[&case_id=]`, `GET ...?shift_id=` (adaylar), `GET ...?case_id=&application_id=` (önizleme), `POST /v1/workspaces/:w/shift-exchanges` (komutlar: create, apply, accept, decline, withdraw, close, reject, approve; `Idempotency-Key`). Çalışan modunda sayfa ayrıca `GET /v1/workspaces/:w/employee-hub?from=&to=` okur.

### 2.11 Employee Hub: Home, Schedule, My Availability, More
- Dosya: `apps/web/src/views/EmployeeHubPage.tsx`; kapı `ActionRoute employee_hub.read`.
- **Home** (`/app/employee-hub`, `apps/web/src/employee-hub/EmployeeDashboard.tsx`): sıradaki vardiya kartı ("Your shift" ya da "A little room to plan ahead."), bekleyen talep bağlantısı, kısayollar, "Next seven days", bildirimler ve duyurular kartı (`DashboardCommunications.tsx`), kişisel hatırlatıcılar (`PersonalReminders.tsx`), workspace ve profil bağlantıları. **Diyalog** `ShiftSheet` ("Your shift" / "Shift unavailable", `?shift=<id>`).
- **Schedule** (`/app/employee-hub/schedule`, `EmployeeScheduleBoard.tsx`): yayınlanmış haftanın salt okunur ızgarası (Schedule bileşenleriyle), tarih gezinme; durumlar yükleniyor, "Schedule is unavailable". Telefonda açılır.
- **My Availability** (`/app/employee-hub/my-availability`): sekmeler **Availability** (haftalık tercih formu `WeeklyPreferencesPanel`) · **Time Off Requests** (`?section=time-off`): "Request time off" formu (tam gün / saat / güne göre), "Time off requests" listesi, iptal akışı (`apps/web/src/employee-hub/TimeOffCancellation.tsx`), kaydedilmemiş değişiklikte gezinme uyarı diyaloğu.
- **More** (`/app/employee-hub/more`, telefon): Management view, My availability, Announcements, Notifications, My account, Switch workspace, Notification preferences.
- Durumlar: yükleniyor, "Employee Hub is unavailable" + Retry, erişim-yok kartı (kendi çalışan kaydı yoksa), bayat veri.
- API: `GET /v1/workspaces/:w/employee-hub?from=&to=`, `GET /v1/workspaces/:w/employee-hub/schedule?date=`, `GET` ve `POST /v1/workspaces/:w/employee-hub/personal-tasks`, `POST /v1/workspaces/:w/employee-hub/request-action`, `POST /v1/workspaces/:w/time-off` (talep), `POST /v1/workspaces/:w/time-off/:id/cancellation`, `GET` ve `POST /v1/workspaces/:w/availability/weekly`, `GET /v1/workspaces/:w/shift-exchanges?view=employee`, `GET /v1/workspaces/:w/communications/notifications?limit=5`, `GET /v1/workspaces/:w/communications/announcements`.

### 2.12 Announcements (`/app/announcements`, `/app/announcements/:announcementId`)
- Dosya: `apps/web/src/views/AnnouncementsPage.tsx`; kapı `announcements.read` (dört rol).
- Yönetici (`can_manage`): sekmeler All · Draft · Scheduled · Published · Archived, ekle düğmesi. Okur (employee): sekme yok, yalnız lokasyon filtresi + arama.
- **Çekmece**: yöneticide düzenleyici (Title, Message, Category General/Operations/Schedule, yayın ve bitiş zamanı, Audience seçici; Save, Publish ya da ileri tarihliyse Schedule, Archive); okurda okuma + "Acknowledge".
- Durumlar: yükleniyor, erişim-yok, boş, dolu, "This announcement is no longer available." (silinmiş bağlantı).
- API: `GET /v1/workspaces/:w/communications/announcements`, `POST /v1/workspaces/:w/communications/announcements`, `POST .../announcements/:id/publish`, `POST .../announcements/:id/archive`, `POST .../announcements/:id/acknowledge`. (Veri dosyasında `unpublish`, `restore` da var; sayfa kullanmıyor.)

### 2.13 Notifications (`/app/notifications`; hesap kutusu `/account/inbox`)
- Dosya: `apps/web/src/views/NotificationsPage.tsx`; kapı yok (herkes).
- Sekmeler: Unread (sayı) · Read; kategori filtresi; çoklu seçim + toplu okundu/okunmadı; satırda vardiya ayrıntısı (`apps/web/src/communications/NotificationShiftDetails.tsx`); "Load more".
- Durumlar: yükleniyor, erişim-yok, boş, dolu.
- `/account/inbox`: yalnız hesap bildirimleri (workspace'siz). Kodda bu adrese bağlantı bulunamadı (çıkarım: bildirim bağlantısıyla gelinir).
- API: `GET /v1/workspaces/:w/communications/notifications?unread_only=&limit=30&read_state=&category=&cursor=`, `POST /v1/workspaces/:w/communications/notifications/action`; hesap kutusunda `GET /v1/account/notifications?...`, `POST /v1/account/notifications/action`.

### 2.14 Settings (ortak çerçeve)
- `apps/web/src/settings/SettingsLayout.tsx`: sol "Settings" rayı, gruplar **Organization** (General, Locations, Jobs, Notifications) · **Scheduling** (Schedule rules, Conflict handling, Shift catalog) · **Access** (Roles & permissions, Documents, Acknowledgements) · **Help** (Support). Her satır izne göre gizlenir.
- `/app/settings` ilk açık sayfaya yönlenir (`SettingsHomeRedirect.tsx`).
- Her ayar sayfasında ortak durumlar: yükleniyor, erişim-yok kartı, salt okur (yazma izni yoksa düğmeler kapalı).

| Alt sayfa | Okuma izni | Yazma | Ana parçalar | Diyalog / çekmece | API |
|---|---|---|---|---|---|
| General | `settings.general.read` | `settings.general.manage` | Schedule logo, Organization name, Setup checklist (aç/kapat), Preferred names onayı (auto / manager) | **Schedule logo yükleme diyaloğu** `apps/web/src/schedule/components/ScheduleLogoUploadDialog.tsx` | supabase `workspaces` select/update (ad, logo) + storage `workspace-logos` upload/remove; `GET`/`PATCH /v1/workspaces/:w/workspace/setup-checklist`; `GET`/`PUT /v1/workspaces/:w/preferred-name-approval` |
| Locations | `settings.locations.read` | `settings.locations.manage` | Arama, "Show archived", "Add location", liste | **Çekmece** "New location / Edit location" (ad, kısa ad, adres, telefon, saat dilimi `LocationTimezoneField.tsx`), iki adımlı silme `CatalogDeleteAction.tsx` | `GET /v1/workspaces/:w/settings/locations`; supabase `locations` insert/update (arşiv dahil); `DELETE /v1/workspaces/:w/organization/locations/:id`; `GET /v1/location-timezone-suggestion?country=&postal=` |
| Jobs ("Jobs & departments") | `settings.jobs.read` | `settings.jobs.manage` | Sekmeler All · Departments · Jobs; Create menüsü (Department / Job); arama; "Show archived"; boş "Build your team structure" | **Çekmece** departman/iş düzenleyici `JobCatalogEditor.tsx`; **çekmece** iş + kişi atama `JobAssignmentsDrawer.tsx` ("Discard changes?"); silme `CatalogDeleteAction.tsx` (departmanda işleri tut/sil) | `GET /v1/workspaces/:w/settings/jobs`, `GET .../organization/job-counts`; supabase `jobs` insert/update, `departments` update (arşiv); `POST .../organization/departments`, `PATCH .../organization/departments/:id`, `POST .../organization/departments/:id/jobs`, `DELETE .../organization/departments/:id`; `POST .../organization/jobs`, `PATCH .../organization/jobs/:id`, `DELETE .../organization/jobs/:id`; `GET .../organization/jobs/:id/assignments?…`, `GET .../organization/jobs/new/assignments?…`, `GET .../assignments/targets?…` |
| Notifications | `notifications.settings.read` ya da `.write` | `notifications.settings.write` | "Read-only access" notu; arama, kategori, Policy scope (Organization / rol / lokasyon); Reset current category / Reset all policies (gerekçeyle); kural kartları: kanallar, Cadence (Immediate / Daily digest / Weekly digest), Safe test, Reset, Save; denetim geçmişi | yok | `GET /v1/workspaces/:w/notification-settings`, `PATCH .../notification-settings`, `POST .../notification-settings/reset`, `POST .../notification-settings/test` |
| Schedule rules | `settings.schedule_rules.read` | `settings.scheduling.write` aksiyonu (owner/admin) | Schedule basics: week start, publish deadline, saat biçimi, time off karar penceresi; "Availability and staffing" paneli yalnız yazabilene | yok | `GET`/`PUT /v1/workspaces/:w/scheduling-settings`; `GET`/`POST /v1/workspaces/:w/availability/weekly/settings` (`Idempotency-Key`) |
| Conflict handling | `schedule.conflict_rules.manage` | aynı | Çakışma kuralları formu | yok | `GET`/`PUT /v1/workspaces/:w/scheduling-settings/conflicts` |
| Shift catalog | `settings.shift_catalog.read` | `settings.shift_catalog.manage` | Sekmeler **Shift types** (`/shift-types`) · **Shift labels** (`/shift-labels`); sürükle-sırala, sütun sıralama, satır menüsü | **Çekmece** "Add shift type / Edit …" (renk, varsayılan saatler, "Default hours change" seçimi), **çekmece** "Add shift label / Edit …"; iki adımlı silme | Türler: `GET .../settings/shift-types`, supabase `shift_types` insert/update (arşiv dahil), `POST .../shift-types/reorder`, `DELETE .../organization/shift-types/:id`. Etiketler: `GET .../settings/shift-labels`, supabase `shift_labels` insert/update, `POST .../shift-labels/reorder`, `DELETE .../organization/shift-labels/:id` |
| Roles & permissions | `roles.read` | `roles.manage` | Rol listesi (sistem + özel, "Custom roles"), "New role", telefonda rol seçici; sağda izin grupları (View / Edit), iki tıklı silme, "Discard role changes?" | gezinme koruması diyaloğu | `GET /v1/workspaces/:w/settings/roles`, `POST /v1/workspaces/:w/roles`, `PUT .../roles/:roleId`, `DELETE .../roles/:roleId` |
| Documents | aksiyon `settings.documents.read` (izin `documents.read`) | `documents.manage` | Sekmeler All · Draft · Published · Archived; gereklilik filtresi (Required / Conditional / Optional); arama; sırala | **Çekmece** belge türü düzenleyici `DocumentSettingsEditor.tsx` (hedefleme `apps/web/src/documents/DocumentLifecycleFields.tsx`); **çekmece** yayın etkisi `DocumentPublicationDialog.tsx` ("Who will be responsible", "Matching employees", "Changes to confirm") | `GET .../settings/document-types`, `POST .../document-types`, `PUT .../document-types/:id`, `PATCH .../document-types/:id/archive`, `POST .../document-types/reorder`, `GET .../document-types/target-options`, `POST .../document-types/:id/publication-preview`, `POST .../document-types/:id/publish`, `POST .../document-types/:id/unpublish` |
| Acknowledgements | aksiyon `settings.signature_templates.read` (izin `documents.read`) | `documents.manage` | Sekmeler **Templates** · **Retention**; "Add template" / "Add policy"; arama; boş "No retention policies yet" / "No acknowledgement templates yet" | **Çekmece** retention politikası, **çekmece** şablon düzenleyici ("Apply to existing assignments" `apps/web/src/documents/DocumentDefinitionApply.tsx`), şablon önizleme paneli ("Acknowledgement preview") | `GET .../settings/acknowledgements`; `POST .../signature-retention-policies`, `PUT .../signature-retention-policies/:id`, `POST .../:id/approve`, `POST .../:id/unapprove`, `PATCH .../:id/archive`; `POST .../signature-templates`, `PUT .../signature-templates/:id/draft`, `POST .../:id/publish`, `POST .../:id/unpublish`, `PATCH .../:id/archive`; `GET .../signature-templates/target-options`; `POST .../signature-versions/:versionId/preview`, `POST .../signature-versions/:versionId/apply` |
| Support | Settings'e girebilen herkes | — | Contact (e-posta düğmesi, `mailto:`), Workspace details (workspace adı, id, etkin rol) | yok | yok (yalnız `/v1/context` verisi) |

Not (Shift catalog): menüde tek satır "Shift catalog"; `/shift-labels` açıkken de o satır seçili görünür. Eski `/scheduling/shift-label` → `/shift-labels`.

## 3. Uygulama çerçevesi dışındaki sayfalar

| Sayfa (UI başlığı) | Rota | Kaynak dosya | Kim | Durumlar / diyaloglar | API |
|---|---|---|---|---|---|
| Sign in / sign up | `/sign-in` | `apps/web/src/views/SignInPage.tsx` | Girişsiz | Giriş, kayıt modu, oturum süresi doldu mesajı, davet akışında hedefe dönüş | Supabase Auth `signInWithPassword`, `signUp`; sonra `GET /v1/context` |
| Reset your password | `/forgot-password` | `apps/web/src/views/ForgotPasswordPage.tsx` | Girişsiz | Form, gönderildi | `POST /v1/auth/password-reset` |
| Choose a new password | `/reset-password` | `apps/web/src/views/ResetPasswordPage.tsx` | E-postadaki bağlantı | "Reset link not valid", form | Supabase Auth `verifyOtp`, `updateUser` |
| Account recovery | `/account-recovery?token=` | `apps/web/src/account/AccountRecoveryPage.tsx` | Silme sonrası 14 gün | Geri yükleniyor, başarılı, hata | `POST /v1/account/security/deletion/recovery` |
| Accept your invitation | `/accept-invite`, `/invite/accept?token=` | `apps/web/src/employees/AcceptInvitationPage.tsx` | Davet bağlantısı | Yükleniyor, girişe yönlendirme, "Accept your invitation", "This invitation is for another address", "You're in" → `/welcome/:w`, kapanmış davet ("Go to your workspaces") | `POST /v1/invitations/preview`, `POST /v1/invitations/accept` |
| Workspace hub | `/workspaces` (eski `/invitations/pending`, `/no-organization`, `/organization-switcher` buraya) | `apps/web/src/shell/WorkspaceHubPage.tsx` | Girişli herkes | "Checking your account", yükleme hatası, ilk kez gelen / geri dönen boş hâli, bölümler Invitations · In progress · Where you work · No longer open to you · "Your own workspace" (Create) | `GET /v1/account/workspaces`, `GET /v1/invitations/pending`, supabase `account_organization_history` count; seçince `GET /v1/context`; satırlar: `POST /v1/invitations/:id/accept`, `POST /v1/invitations/:id/decline`, `GET /v1/me/onboarding?workspaceId=`, `POST /v1/me/onboarding/leave`; Create: `POST /v1/account/workspaces` |
| Workspace status | `/workspaces/status`, `/workspaces/status/:workspaceId` (eski `/workspaces/suspended/*`) | `apps/web/src/shell/WorkspaceStatusPage.tsx` | Girişli | Üç hâl: on hold (askıda), access removed, closed; "Checking your account" | `GET /v1/account/workspaces` |
| Owner onboarding wizard | `/onboarding` | `apps/web/src/views/OwnerOnboardingPage.tsx` | Kurulumu bitmemiş owner | 4 adım: Workspace ("Name your workspace", owner yasal adı) · Locations ("Where does your team work?") · Jobs ("What jobs do people work?") · Team ("Add your team", davet niyeti); ilerleme "x of 4 steps done"; iki tıklı silmeler, baştan başlatma | `PATCH /v1/workspaces/:w/owner-onboarding`, `POST .../owner-onboarding/invitation-intents`, `POST .../owner-onboarding/reset`; `GET .../settings/locations`, `GET .../settings/jobs`; supabase `locations`, `departments`, `jobs` insert/update; `POST /v1/workspaces/:w/employees`; `GET /v1/account/workspaces`; `GET /v1/location-timezone-suggestion` |
| Employee onboarding | `/welcome` (yönlendirici `apps/web/src/employees/WelcomeRedirect.tsx`), `/welcome/:workspaceId/*` | `apps/web/src/employees/EmployeeOnboardingPage.tsx` | Daveti kabul eden kişi | Adımlar: Profile (iki sayfa, yasal ad, iletişim) · Documents (gerekirse; belge + onay, `OnboardingDocumentStep.tsx`) · Availability (yalnız employee rolü) · Review; isteğe bağlı adım etiketi; gönderildi; ayrılma | `GET /v1/me/onboarding?workspaceId=`, `PATCH /v1/me/onboarding/profile`, `POST /v1/me/onboarding/submit`, `POST /v1/me/onboarding/leave`; belgeler `/v1/me/workspaces/:w/documents/...` (2.4'teki eylemler: get, upload-url, confirm, submit, acknowledge); `GET`/`POST /v1/me/onboarding/availability/weekly?workspaceId=` |
| Account → Profile | `/account/profile` (`/account` buraya) | `apps/web/src/account/ProfilePage.tsx` | Girişli | Fotoğraf (kırpma diyaloğu `AvatarCropDialog.tsx`, iki tıklı kaldırma), ad, Phone number; her workspace'teki tercih edilen ad ve acil durum kişisi; owner'a yasal ad; gezinme uyarısı | supabase `user_profiles`, `user_preferences` upsert + storage avatar upload/remove; `GET /v1/account/employment-records`; `PUT /v1/workspaces/:w/employees/:id/preferred-name`; `PUT .../employees/:id/emergency-contact`; `GET`/`PUT /v1/account/workspaces/:w/legal-name`; `GET /v1/account/workspaces` |
| Account → Security | `/account/security` (eski `/app/account/security`) | `apps/web/src/account/SecurityPage.tsx` | Girişli | Email address (değişiklik, yeniden gönder, iptal), Password, Active sessions, Delete account; **"Delete your account?" diyaloğu** | `GET /v1/account/security`, `POST`/`DELETE /v1/account/security/email-change`, `POST .../email-change/resend`, `POST .../password`, `POST .../sessions/sign-out-others`, `GET .../deletion/blockers`, `POST .../deletion` |
| Account → Preferences | `/account/preferences` | `apps/web/src/account/PreferencesPage.tsx` | Girişli | Regional format (saat, tarih biçimi); gezinme uyarısı | supabase `user_profiles`, `user_preferences` upsert |
| Account → Notifications | `/account/preferences/notifications` | `apps/web/src/account/NotificationPreferencesPage.tsx` | Girişli | Workspace seçimi, gruplar açılır, kanal anahtarları, kaydet; erişim-yok | `GET`/`PATCH /v1/workspaces/:w/me/notification-preferences`; workspace yoksa `GET /v1/account/notification-preferences` (çıkarım: workspace'siz kaydetme `PATCH /v1/account/notification-preferences`'a gider, API'de bu uç bulunamadı) |
| Account → Workspaces | `/account/workspaces` | `apps/web/src/account/WorkspacesPage.tsx` | Girişli | Davetler, workspace listesi (varsayılan yap, geç, kapat, sahiplik devri); diyaloglar: **Create workspace**, **sahiplik devri**, **kapatma**, **devri cevaplama** | `GET /v1/account/workspaces`, `GET /v1/invitations/pending`, `POST /v1/account/workspaces`, `GET /v1/context` (geçiş), `POST /v1/account/workspaces/:w/active`, `POST .../closure`, `POST .../closure/cancel`, `POST .../ownership-transfer`, `GET .../ownership-transfer/candidates?q=`, `POST .../ownership-transfer/cancel`, `POST .../ownership-transfer/respond`, davet kabul/ret |
| Account → Documents | `/account/documents` (eski `/app/account/documents` → `DocumentNotificationRedirect.tsx`) | `apps/web/src/account/AccountDocumentsPage.tsx` | Girişli | Workspace başına kendi belgeleri (kişisel liste), belge çekmecesi; eksik zorunlu belgede uygulama buraya kilitler | `GET /v1/account/workspaces`, `GET /v1/me/workspaces/:w/documents` + çekmece eylemleri (`/v1/me/workspaces/:w/documents/:id/...`) |
| Account → inbox | `/account/inbox` | `apps/web/src/views/NotificationsPage.tsx` | Girişli | 2.13'e bak | `GET /v1/account/notifications`, `POST /v1/account/notifications/action` |
| Public trust pages | `/privacy`, `/terms`, `/accessibility`, `/contact`, `/your-privacy-choices` | `apps/web/src/public/PublicTrustPages.tsx` + `PublicTrustLayout.tsx` | Herkes | Statik metin bölümleri | yok |

Hesap çerçevesi: `apps/web/src/account/AccountLayout.tsx` (sol menü Profile · Security · Preferences · Notifications · Workspaces · Documents, bekleyen sayıları; "Back to workspace"; Sign out). Çağrı: `GET /v1/account/attention`.

## 4. Yönlendirmeler ve DEV rotaları

- Yönlendirmeler: `/app` → rolün açılış sayfası; `*` → `/app`; `/app/account/security` → `/account/security`; `/app/settings/scheduling/shift-label` → `/app/settings/scheduling/shift-labels`; `/app/settings/important-dates`, `/app/settings/closed-days`, `/app/settings/important-dates/closed-days` → `/app/important-dates`; `/app/schedule/requests?tab=availability` → `/app/availability`.
- DEV-only (üretimde yok, atlasa girmez): `/dev/schedule-shift-design`, `/dev/feedback`, `/dev/employee-onboarding`, `/dev/schedule-shift-badge-lab` (→ `/app/schedule-badge-lab`), `/app/schedule-badge-lab`, `/app/schedule-badge-lab/export`, `/app/schedule-badge-lab/templates`.

## 5. Önerilen atlas gruplaması (21 sayfa + mevcut Schedule)

Her grup tek yayın sayfası. Her mock'a ek olarak bölüm 0'daki çerçeve çağrıları gerekir.

| # | Atlas sayfası | Rotalar | Not |
|---|---|---|---|
| 1 | Requests | `/app/schedule/requests` (Time off, Shift changes) | Review request çekmecesi, karar diyalogları, Review shift change çekmecesi |
| 2 | Employees listesi + Archived + Documents listesi | `/app/employees`, `/app/employees/archive`, `/app/employees/documents` | Sütun ayarı, Document details çekmecesi |
| 3 | Employee drawer | `/app/employees?employeeId=…&section=…`, `?mode=create` | 6 bölüm, Terminate diyaloğu; büyük olduğu için ayrı |
| 4 | Settings: General, Locations, Jobs | `/app/settings/general`, `/locations`, `/jobs` | Logo diyaloğu, lokasyon çekmecesi, iş atama çekmecesi |
| 5 | Settings: Schedule rules, Conflict handling, Shift catalog | `/app/settings/scheduling`, `/scheduling/conflicts`, `/scheduling/shift-types`, `/scheduling/shift-labels` | |
| 6 | Settings: Roles & permissions | `/app/settings/roles`, `/roles/:roleId` | |
| 7 | Settings: Notifications | `/app/settings/notifications` | |
| 8 | Settings: Documents + Acknowledgements | `/app/settings/documents`, `/app/settings/acknowledgements` | |
| 9 | Settings: Support | `/app/settings/support` | API yok; çok küçük, 4'e katılabilir |
| 10 | Shift Hub | `/app/employee-hub/shift-hub` | Çalışan modu; yönetici modu 1'de |
| 11 | Important Dates | `/app/important-dates` | |
| 12 | Workspace dashboard | `/app/workspace` | Customize modu, Setup checklist |
| 13 | Availability (yönetici) | `/app/availability` | Drawer Availability bölümü |
| 14 | Employee Hub: Home, Schedule, My Availability, More | `/app/employee-hub`, `/schedule`, `/my-availability`, `/more` | Telefon düzeni önemli |
| 15 | Announcements | `/app/announcements`, `/:announcementId` | Yönetici ve okur görünümü |
| 16 | Notifications inbox | `/app/notifications`, `/account/inbox` | |
| 17 | Account pages | `/account/profile`, `/security`, `/preferences`, `/preferences/notifications`, `/workspaces`, `/documents` | |
| 18 | Workspace hub + status + invite | `/workspaces`, `/workspaces/status(/:id)`, `/accept-invite`, `/invite/accept` | |
| 19 | Onboarding akışları | `/onboarding`, `/welcome/:workspaceId/*` | |
| 20 | Giriş sayfaları | `/sign-in`, `/forgot-password`, `/reset-password`, `/account-recovery` | |
| 21 | Public pages | `/privacy`, `/terms`, `/accessibility`, `/contact`, `/your-privacy-choices` | API yok |
| — | Schedule (mevcut) | `/app/schedule`, `/app/schedule/export` | https://claude.ai/artifact/RNJEGWCDgdG2NpYRpWF4g3 ; `/app/schedule/templates` bu sayfada yok, oraya eklenebilir |
