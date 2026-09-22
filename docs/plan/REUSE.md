# Reuse haritası

Yeni UI ya da akış yazmadan önce buradaki girdiye bak. Ölçü ve CSS değerlerini buraya kopyalama; kaynak dosyayı aç. `(rescue)` işaretli kaynaklar RESCUE-001 tamamlanana kadar yalnızca `wip/rescue-2026-09-16` branch'inde bulunur.

| ID | Ne zaman | Kaynak | Sınır |
|---|---|---|---|
| UI-01 | Liste sayfası header ve toolbar (status, filter, search) | `apps/web/src/views/CatalogPageHeader.tsx`, `styles.css` içinde `.catalog-page-header`, `.catalog-toolbar*` | Status üst satırda, filter ve search alt satırda. Sayfaya özel margin varyantı yok. |
| UI-02 | Tablo kolon sıralama | `apps/web/src/views/CatalogSortButton.tsx` | İkon yalnızca hover veya focus halinde görünür. Sıralama mantığı bileşeni kullanan sayfadadır. |
| UI-03 | Settings sayfa header'ı ve sağ üst CTA | `settings/GeneralSettingsPage.tsx` içinde `SettingsHeader`, `.settings-page` altındaki `--settings-header-*` token'ları | Sayfa CSS'inde header ya da action için offset/align override yazma. |
| UI-04 | Account layout ve header | `account/AccountLayout.tsx`, `account/components.tsx` içinde `AccountPageHeader` | Her sayfaya ayrı offset ekleme. |
| UI-05 | Tema: yalnızca light; renkler `--theme-*` token'larından | `styles.css` `:root` (THEME-002): page, surface(-soft/-muted), text(-body), muted, border(-subtle/-strong), accent(-strong), selected, focus, action(-hover), danger/warning/success(-soft), current. `--schedule-*` bunlara alias. `src/light-theme.test.ts` dark kuralını engeller. | Sabit hex yerine token kullan. Öneksiz `--surface/--border/--text` tanımlama (mevcut fallback'leri değiştirir). Dark kuralı yazma. Açık zeminde metin AA ≥4.5; ikincil metin için `--theme-muted`, renkli zeminde `--theme-muted-strong`. Accent/action/koyu zemin üstündeki beyaz metin için `--theme-on-accent`; uyarı metni için `--theme-warning`. |
| UI-06 | Schedule haftalık lokasyon genişliği | `schedule/lib/scheduleGridLayout.ts`, `hooks/useScheduleBadgeMeasurements.tsx` | Günlük görünümde minimum genişlik korunur. |
| UI-07 | Gruplu checkbox filtre menüsü | `schedule/components/ScheduleTopBarFilter.tsx` + `schedule-topbar-filter.css` (rescue) | Diğer dropdown'ları kullanıcı kararı olmadan bu tasarıma geçirme. Documents hedeflemesinde gruplar AND ile birleşir. |
| UI-08 | Documents yönlendirmeli editör | `settings/DocumentSettingsEditor.tsx`, `documents/DocumentLifecycleFields.tsx` (rescue) | Yalnızca final Save kalıcı yazar. Legacy OR/named kayıtları sessizce dönüştürülmez. |
| UI-09 | Silme onayı | Templates ve Announcements'taki iki tık deseni ("Click again to delete") | Ayrı onay paneli açma. |
| UI-10 | Toast | `@newfork/ui` toast facade (dedupeKey, süreler, en fazla 3 görünür) | Notification center ile karıştırma. |
| UI-11 | Business öncesi ekranların çerçevesi ve satırı (sign-in sonrası, business'a bağlanana kadar) | `apps/web/src/shell/prebiz/PreBiz.tsx` + `prebiz.css`: iki panelli çerçeve, hesap bloğu + Sign out, `BusinessRow` (rol · durum, duruma göre sabit eylem seti), durum rozeti, bölüm listesi, `.pb-btn` | Yeni ekran bu kit'le yazılır; `.sign-in-panel` ailesi yalnız sign-in, suspended ve ProtectedRoute'ta kalır. Yıkıcı eylem `ConfirmButton` (`@newfork/ui`), `window.confirm` yok. Kullanıcı metninde "business"/"team"; "workspace"/"organization" yok. |
| UI-12 | İki tık onay (yıkıcı eylem) | `packages/ui` `ConfirmButton` / `useConfirmClick`: ilk tık silahlar, 3,2 sn / blur / Escape söndürür, `role="status"` ile duyurulur, çift tıklamanın ikinci tıkı yutulur | Ad hoc `deleteArmed` kopyası yazma (Roles, Announcements, Templates'teki eskiler taşınacak). Etki listesi ya da parola adımı gereken onaylarda kullanma; oralarda diyalog kalır. |
| DATA-01 | Notification kataloğu sürümleri | `settings/NotificationSettingsPage.tsx` | `type_key` başına en yüksek `schema_version` kullanılır. React key'e version ekleyerek duplicate'i gizleme. |
| DATA-02 | Schedule RPC review hatası | migration `20260915075033_bl064_schedule_conflict_result.sql`, `api/src/schedule/schedule-routes.ts` | İş kuralı reddi PT409 döner; 40001 kullanma (PostgREST 40001'i yeniden dener). |
| DATA-03 | Schedule export ve async save | `schedule/export-v2/*` (rescue), `SchedulePage` içindeki mutationContext | Badge metni için ShiftCard'daki `formatShiftLabelDisplay` kullanılır; ikinci bir label motoru ya da save motoru yazma. |
| DATA-04 | Edit-session lease | migration `20260915112516_bl069_resume_edit_session_lease.sql` | Aynı sahip session'ı yeniden alırsa lease yenilenir, revision korunur. |

## Sayfa envanteri

Repodaki her ekranın kendi bölümü olacak: ne yaptığı, hangi ortak parçaları
kullandığı, kendine özgü kuralları, bilinen tuhaflıkları. Hepsi bir oturuşta
yazılmıyor — **bir task hangi sayfaya dokunuyorsa o sayfanın bölümü o task
içinde yazılır ya da güncellenir.**

Aşağıdaki tablo iskelettir. `belgelenmedi` yazan satırın henüz bölümü yok.
Rota sütunu boş olanlar iç içe rota tablolarından geliyor; o sayfa sırası
gelince çözülür.

| Alan | Sayfa | Rota | Dosya (`apps/web/src/`) | Durum |
|---|---|---|---|---|
| hesap | AccountDocumentsPage | `documents` | `account/AccountDocumentsPage.tsx` | belgelenmedi |
| hesap | AccountRecoveryPage | `/account-recovery` | `account/AccountRecoveryPage.tsx` | belgelenmedi |
| hesap | NotificationPreferencesPage | `preferences/notifications` | `account/NotificationPreferencesPage.tsx` | belgelenmedi |
| hesap | PreferencesPage | `preferences` | `account/PreferencesPage.tsx` | belgelenmedi |
| hesap | ProfilePage | `profile` | `account/ProfilePage.tsx` | belgelenmedi |
| hesap | SecurityPage | `security` | `account/SecurityPage.tsx` | belgelenmedi |
| hesap | WorkspacesPage | `workspaces` | `account/WorkspacesPage.tsx` | belgelenmedi |
| kabuk | WorkspaceHubPage | | `shell/WorkspaceHubPage.tsx` | belgelenmedi |
| kabuk | WorkspaceStatusPage | `/workspaces/status/:workspaceId` | `shell/WorkspaceStatusPage.tsx` | belgelenmedi |
| giris | SignInPage | `/sign-in` | `views/SignInPage.tsx` | belgelenmedi |
| giris | AcceptInvitationPage | `/accept-invite`, `/invite/accept` | `employees/AcceptInvitationPage.tsx` | belgelenmedi |
| kamuya acik | PrivacyPage / TermsPage / ContactPage / AccessibilityPage / PrivacyChoicesPage | `/privacy`, `/terms`, `/contact`, `/accessibility`, `/your-privacy-choices` | `public/PublicTrustPages.tsx` | belgelenmedi |
| kurulum | OwnerOnboardingPage | `/welcome/:workspaceId/*` | `views/OwnerOnboardingPage.tsx` | belgelenmedi |
| kurulum | EmployeeOnboardingPage | `/onboarding` | `employees/EmployeeOnboardingPage.tsx` | belgelenmedi |
| calisanlar | EmployeesPage | `employees` | `employees/EmployeesPage.tsx` | belgelenmedi |
| calisanlar | EmployeeHubPage | `employee-hub/*` | `views/EmployeeHubPage.tsx` | belgelenmedi |
| calisanlar | EmployeeDocumentsPage | `employees/documents` | `documents/EmployeeDocumentsPage.tsx` | belgelenmedi |
| plan | SchedulePage | `schedule` | `views/SchedulePage.tsx` | belgelenmedi |
| plan | ScheduleRequestsPage | `schedule/requests` | `views/ScheduleRequestsPage.tsx` | belgelenmedi |
| plan | ScheduleTemplatesPage | `schedule/templates` | `views/ScheduleTemplatesPage.tsx` | belgelenmedi |
| plan | LineupPage | `schedule/lineup` | `views/LineupPage.tsx` | belgelenmedi |
| plan | AvailabilityPage | `availability` | `views/AvailabilityPage.tsx` | belgelenmedi |
| plan | TimeEntriesPage | `time-entries` | `views/TimeEntriesPage.tsx` | belgelenmedi |
| isyeri | WorkspacePage | `workspace` | `views/WorkspacePage.tsx` | belgelenmedi |
| iletisim | AnnouncementsPage | `announcements` | `views/AnnouncementsPage.tsx` | belgelenmedi |
| iletisim | NotificationsPage | `inbox`, `notifications` | `views/NotificationsPage.tsx` | belgelenmedi |
| kiosk | KioskPage | `/kiosk` | `kiosk/KioskPage.tsx` | belgelenmedi |
| ayarlar | GeneralSettingsPage | `general` | `settings/GeneralSettingsPage.tsx` | belgelenmedi |
| ayarlar | LocationsSettingsPage | `locations` | `settings/LocationsSettingsPage.tsx` | belgelenmedi |
| ayarlar | JobsSettingsPage | `jobs` | `settings/JobsSettingsPage.tsx` | belgelenmedi |
| ayarlar | RolesSettingsPage | `roles`, `roles/:roleId` | `settings/RolesSettingsPage.tsx` | belgelenmedi |
| ayarlar | SchedulingSettingsPage | `scheduling` | `settings/SchedulingSettingsPage.tsx` | belgelenmedi |
| ayarlar | ShiftTypesSettingsPage | `scheduling/shift-types` | `settings/ShiftTypesSettingsPage.tsx` | belgelenmedi |
| ayarlar | ShiftLabelsSettingsPage | `scheduling/shift-labels` | `settings/ShiftLabelsSettingsPage.tsx` | belgelenmedi |
| ayarlar | ShiftCatalogSettingsPage | | `settings/ShiftCatalogSettingsPage.tsx` | belgelenmedi |
| ayarlar | ConflictHandlingSettingsPage | `scheduling/conflicts` | `settings/ConflictHandlingSettingsPage.tsx` | belgelenmedi |
| ayarlar | ImportantDatesSettingsPage | `important-dates` | `settings/ImportantDatesSettingsPage.tsx` | belgelenmedi |
| ayarlar | DocumentsSettingsPage | `documents` | `settings/DocumentsSettingsPage.tsx` | belgelenmedi |
| ayarlar | SignatureTemplatesSettingsPage | | `settings/SignatureTemplatesSettingsPage.tsx` | belgelenmedi |
| ayarlar | NotificationSettingsPage | `notifications` | `settings/NotificationSettingsPage.tsx` | belgelenmedi |
| ayarlar | KioskSettingsPage | `kiosk` | `settings/KioskSettingsPage.tsx` | belgelenmedi |
| ayarlar | SupportSettingsPage | `support` | `settings/SupportSettingsPage.tsx` | belgelenmedi |
| gelistirme | ScheduleShiftDesignPage | `/dev/schedule-shift-design` | `dev/ScheduleShiftDesignPage.tsx` | belgelenmedi |
| gelistirme | ScheduleShiftBadgeLabPage | `schedule-badge-lab` | `dev/ScheduleShiftBadgeLabPage.tsx` | belgelenmedi |

Bir sayfanın bölümü yazılırken başlık `### <Sayfa adı>` olur, tablodaki
durumu `belgelendi <tarih>` yapılır, ve bölüm şunları söyler: sayfa ne işe
yarar, yukarıdaki reuse girdilerinden hangilerini kullanır, kendine özgü
kuralları neler, bilinen tuhaflıkları var mı.
