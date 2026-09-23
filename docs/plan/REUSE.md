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
| UI-09 | Buton rolü (renk) | `@newfork/ui` `Button` = yeşil aksiyon (sınıf yok); `className="secondary-button"` = beyaz vazgeçme (Cancel, Discard, Back, Keep editing); `danger-button` = kırmızı yıkıcı. Kural sırası `styles.css`te `.secondary-button` bloğu `.nf-button`tan sonra | `secondary-button`ı aksiyon butonuna (Upload, Resend, Send reminder, Copy, Save…) verme; `danger-button` ile birlikte hiç verme: vazgeçme rengi kırmızının yazı rengini ezer. |
| UI-10 | Toast | `@newfork/ui` toast facade (dedupeKey, süreler, en fazla 3 görünür) | Notification center ile karıştırma. |
| UI-11 | Business öncesi ekranların çerçevesi ve satırı (sign-in sonrası, business'a bağlanana kadar) | `apps/web/src/shell/prebiz/PreBiz.tsx` + `prebiz.css`: iki panelli çerçeve, hesap bloğu + Sign out, `BusinessRow` (rol · durum, duruma göre sabit eylem seti), durum rozeti, bölüm listesi, `.pb-btn` | Yeni ekran bu kit'le yazılır; `.sign-in-panel` ailesi yalnız sign-in, suspended ve ProtectedRoute'ta kalır. Yıkıcı eylem `ConfirmButton` (`@newfork/ui`), `window.confirm` yok. Kullanıcı metninde "business"/"team"; "workspace"/"organization" yok. |
| UI-12 | İki tık onay (yıkıcı eylem) | `packages/ui` `ConfirmButton` / `useConfirmClick`: ilk tık silahlar, 3,2 sn / blur / Escape söndürür, `role="status"` ile duyurulur, çift tıklamanın ikinci tıkı yutulur. Silahlı yazı her yerde "Confirm <fiil>" (Confirm delete, Confirm remove, Confirm decline…). Kendi görünümü olan buton `unstyled`, yalnız ikonlu buton `confirmName` alır; tıklanabilir satırın içinde `onClick={(e) => e.stopPropagation()}`; başka yerden silahlı açılan akış `useConfirmClick(fn, true)` | Ad hoc kopya yazma; kalan tek eski kopya Roles (bağımlılık uyarısı silahlı halde kalıyor). Etki listesi ya da parola adımı gereken onaylarda kullanma; oralarda diyalog kalır. |
| UI-13 | Onay ya da kısa not isteyen pencere (tarayıcının `confirm`/`prompt` kutusu yerine) | `apps/web/src/shell/ConfirmDialog.tsx`: `ConfirmDialog` (kontrollü, `children` ile not alanı, `.app-confirm-field`) ve `useConfirmDialog()` (`await confirm({...})` true/false). Uyarı ikonu + başlık + açıklama; Cancel beyaz, yıkıcı cevap kırmızı, diğeri yeşil; Escape ve dışarı tıklama Cancel, Tab içeride döner, kapanınca odak geri gelir | `window.confirm`/`prompt`/`alert` yazma (kullanıcı kararı 2026-09-23). Bare onay tek butonsa önce UI-12 iki tık düşün; açıklama ya da not gerekiyorsa bu pencere. |
| DATA-01 | Notification kataloğu sürümleri | `settings/NotificationSettingsPage.tsx` | `type_key` başına en yüksek `schema_version` kullanılır. React key'e version ekleyerek duplicate'i gizleme. |
| DATA-02 | Schedule RPC review hatası | migration `20260915075033_bl064_schedule_conflict_result.sql`, `api/src/schedule/schedule-routes.ts` | İş kuralı reddi PT409 döner; 40001 kullanma (PostgREST 40001'i yeniden dener). |
| DATA-03 | Schedule export ve async save | `schedule/export-v2/*` (rescue), `SchedulePage` içindeki mutationContext | Badge metni için ShiftCard'daki `formatShiftLabelDisplay` kullanılır; ikinci bir label motoru ya da save motoru yazma. |
| DATA-04 | Edit-session lease | migration `20260915112516_bl069_resume_edit_session_lease.sql` | Aynı sahip session'ı yeniden alırsa lease yenilenir, revision korunur. |
| DATA-05 | Haftalık müsaitliği bir giriş modundan ötekine çevirmek | `public.weekly_preference_convert(w, preference, target_mode)`, migration `20260922180000_changing_the_entry_mode_converts_every_saved_week.sql`; çağıran yer `weekly_preference_settings_save_service` | Kural tek yerde: saatten tipe en az 1 dakika çakışan aktif tip (sınıra değmek çakışma değil), tipten saate en erken başlangıç–en geç bitiş, gece yarısını aşan tip 24:00'e kadar, boş ve tüm-gün gün olduğu gibi. İkinci bir dönüştürücü yazma. Dönüşüm kayıplı; eski hafta `weekly_preference_events`'e yazılmadan değiştirilmez. |

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
| hesap | NotificationPreferencesPage | `preferences/notifications` | `account/NotificationPreferencesPage.tsx` | kısmi 2026-09-22 (butonlar) |
| hesap | PreferencesPage | `preferences` | `account/PreferencesPage.tsx` | kısmi 2026-09-22 (butonlar) |
| hesap | ProfilePage | `profile` | `account/ProfilePage.tsx` | kısmi 2026-09-22 (butonlar) |
| hesap | SecurityPage | `security` | `account/SecurityPage.tsx` | kısmi 2026-09-22 (butonlar) |
| hesap | WorkspacesPage | `workspaces` | `account/WorkspacesPage.tsx` | kısmi 2026-09-22 (butonlar) |
| kabuk | WorkspaceHubPage | | `shell/WorkspaceHubPage.tsx` | belgelenmedi |
| kabuk | WorkspaceStatusPage | `/workspaces/status/:workspaceId` | `shell/WorkspaceStatusPage.tsx` | belgelenmedi |
| giris | SignInPage | `/sign-in` | `views/SignInPage.tsx` | belgelenmedi |
| giris | AcceptInvitationPage | `/accept-invite`, `/invite/accept` | `employees/AcceptInvitationPage.tsx` | belgelenmedi |
| kamuya acik | PrivacyPage / TermsPage / ContactPage / AccessibilityPage / PrivacyChoicesPage | `/privacy`, `/terms`, `/contact`, `/accessibility`, `/your-privacy-choices` | `public/PublicTrustPages.tsx` | belgelenmedi |
| kurulum | OwnerOnboardingPage | `/welcome/:workspaceId/*` | `views/OwnerOnboardingPage.tsx` | belgelenmedi |
| kurulum | EmployeeOnboardingPage | `/onboarding` | `employees/EmployeeOnboardingPage.tsx` | belgelenmedi |
| calisanlar | EmployeesPage | `employees` | `employees/EmployeesPage.tsx` | kısmi 2026-09-22 (butonlar) |
| calisanlar | EmployeeHubPage | `employee-hub/*` | `views/EmployeeHubPage.tsx` | belgelenmedi |
| calisanlar | EmployeeDocumentsPage | `employees/documents` | `documents/EmployeeDocumentsPage.tsx` | belgelenmedi |
| plan | SchedulePage | `schedule` | `views/SchedulePage.tsx` | kısmi 2026-09-22 (butonlar) |
| plan | ScheduleRequestsPage | `schedule/requests` | `views/ScheduleRequestsPage.tsx` | belgelenmedi |
| plan | ScheduleTemplatesPage | `schedule/templates` | `views/ScheduleTemplatesPage.tsx` | kısmi 2026-09-22 (butonlar) |
| plan | LineupPage | `schedule/lineup` | `views/LineupPage.tsx` | belgelenmedi |
| plan | AvailabilityPage | `availability` | `views/AvailabilityPage.tsx` | belgelenmedi |
| plan | TimeEntriesPage | `time-entries` | `views/TimeEntriesPage.tsx` | belgelenmedi |
| isyeri | WorkspacePage | `workspace` | `views/WorkspacePage.tsx` | belgelenmedi |
| iletisim | AnnouncementsPage | `announcements` | `views/AnnouncementsPage.tsx` | kısmi 2026-09-22 (butonlar) |
| iletisim | NotificationsPage | `inbox`, `notifications` | `views/NotificationsPage.tsx` | belgelenmedi |
| kiosk | KioskPage | `/kiosk` | `kiosk/KioskPage.tsx` | belgelenmedi |
| ayarlar | GeneralSettingsPage | `general` | `settings/GeneralSettingsPage.tsx` | belgelenmedi |
| ayarlar | LocationsSettingsPage | `locations` | `settings/LocationsSettingsPage.tsx` | kısmi 2026-09-22 (butonlar) |
| ayarlar | JobsSettingsPage | `jobs` | `settings/JobsSettingsPage.tsx` | belgelenmedi |
| ayarlar | RolesSettingsPage | `roles`, `roles/:roleId` | `settings/RolesSettingsPage.tsx` | belgelenmedi |
| ayarlar | SchedulingSettingsPage | `scheduling` | `settings/SchedulingSettingsPage.tsx` | belgelendi 2026-09-22 |
| ayarlar | ShiftTypesSettingsPage | `scheduling/shift-types` | `settings/ShiftTypesSettingsPage.tsx` | belgelenmedi |
| ayarlar | ShiftLabelsSettingsPage | `scheduling/shift-labels` | `settings/ShiftLabelsSettingsPage.tsx` | belgelenmedi |
| ayarlar | ShiftCatalogSettingsPage | | `settings/ShiftCatalogSettingsPage.tsx` | belgelenmedi |
| ayarlar | ConflictHandlingSettingsPage | `scheduling/conflicts` | `settings/ConflictHandlingSettingsPage.tsx` | belgelenmedi |
| ayarlar | ImportantDatesSettingsPage | `important-dates` | `settings/ImportantDatesSettingsPage.tsx` | belgelenmedi |
| ayarlar | DocumentsSettingsPage | `documents` | `settings/DocumentsSettingsPage.tsx` | belgelenmedi |
| ayarlar | SignatureTemplatesSettingsPage | | `settings/SignatureTemplatesSettingsPage.tsx` | belgelenmedi |
| ayarlar | NotificationSettingsPage | `notifications` | `settings/NotificationSettingsPage.tsx` | belgelenmedi |
| ayarlar | KioskSettingsPage | `kiosk` | `settings/KioskSettingsPage.tsx` | belgelenmedi |
| ayarlar | SupportSettingsPage | `support` | `settings/SupportSettingsPage.tsx` | kısmi 2026-09-22 (butonlar) |
| gelistirme | ScheduleShiftDesignPage | `/dev/schedule-shift-design` | `dev/ScheduleShiftDesignPage.tsx` | belgelenmedi |
| gelistirme | ScheduleShiftBadgeLabPage | `schedule-badge-lab` | `dev/ScheduleShiftBadgeLabPage.tsx` | belgelenmedi |

Bir sayfanın bölümü yazılırken başlık `### <Sayfa adı>` olur, tablodaki
durumu `belgelendi <tarih>` yapılır, ve bölüm şunları söyler: sayfa ne işe
yarar, yukarıdaki reuse girdilerinden hangilerini kullanır, kendine özgü
kuralları neler, bilinen tuhaflıkları var mı.

### ProfilePage, PreferencesPage, NotificationPreferencesPage (kısmi: butonlar)

**Ne işe yarar.** Account → Profile / Preferences / Notifications: hesabın
her workspace'te geçen ayarları. Her sayfa kendi "Save" ve "Discard"
düğmesiyle; Discard kaydedilmemiş değişikliği geri alır.

**Kendine özgü kurallar.** Discard beyaz (UI-09). Profile'da fotoğraf
"Upload/Replace" yeşil; "Remove" kırmızı iki tık (UI-12, "Confirm remove")
ama yalnız taslağı temizler: fotoğraf "Save changes"e basılana kadar
silinmez, Discard geri getirir.

### SecurityPage (kısmi: butonlar)

**Ne işe yarar.** Account → Security: e-posta, parola, diğer oturumları
kapatma, hesabı silme.

**Kendine özgü kurallar.** "Resend" ve "Sign out other sessions" yeşil.
Bekleyen e-posta değişikliğini geri çeken "Cancel change" kırmızı ve adı
bilerek "Cancel change" (yalnız "Cancel", pencereyi kapat gibi okunur;
kullanıcı kararı 2026-09-22).

### WorkspacesPage (kısmi: butonlar)

**Ne işe yarar.** Account → Workspaces: hesabın bağlı olduğu workspace'ler,
açma, oluşturma, sahiplik devri, kapatma.

**Kendine özgü kurallar.** Şu an çalışılan workspace'in satırı tonlu ve
`aria-current`; ayrı "Current" rozeti yok (kullanıcı kararı). "Open" her
satırda yeşil ve tıklanabilir. Formlardaki Cancel, "Keep this workspace",
"Reject owner transfer" beyaz.

### EmployeesPage (kısmi: çalışan çekmecesi butonları)

**Ne işe yarar.** Employees listesi; satıra tıklayınca çalışan çekmecesi
(Profile, Employment, Availability, Documents, Access, History).

**Kendine özgü kurallar.** Çekmece altı: Cancel beyaz, Invite ve Save
yeşil. Access'te "Remove access", "Revoke" ve "Remove photo" kırmızı iki tık
("Confirm remove access", "Confirm revoke", "Confirm remove"). Send
reminder, Retry, Reset PIN, Copy, "Save emergency contact", "Open document"
yeşil; "Keep editing", "Leave it", "Request changes" beyaz.

**Kendine özgü kurallar (devam).** "Request changes" notu UI-13 penceresinde
yazılır; not boşken buton kapalı. Documents'ta açılan belge çekmecesi
kaydedilmemiş değişiklikle kapatılınca "Discard unsaved changes?" (UI-13)
sorar.

### SchedulePage (kısmi: taslak ve şablon menüleri)

**Kendine özgü kurallar.** Taslak menüsünde taslak ve şablon silme, Save
draft menüsünde taslağın üstüne yazma: ikonlu iki tık (UI-12, `unstyled` +
`confirmName`; satır tıklanabilir olduğu için `stopPropagation`). Şablon
penceresinde "Delete" iki tık ("Confirm delete"). Yayınlanmış taslağın
satırında üstüne yazma düğmesi yok.

Başka yöneticinin taslak adıyla kaydedince UI-13 penceresi sorar:
"Overwrite "<ad>"?"; Cancel derse hata satırı başka ad seçmesini söyler.

### ScheduleTemplatesPage (kısmi: butonlar)

**Kendine özgü kurallar.** Satırdaki çöp kutusu ikonlu iki tık; silahlıyken
onay ikonu ve "Confirm delete template <ad>" adı/ipucu.

### AnnouncementsPage (kısmi: butonlar)

**Kendine özgü kurallar.** Düzenleyicide "Delete" iki tık ("Confirm
delete"). Listede satır menüsünün "Delete"i düzenleyiciyi silahlı açar
(`?delete=1`, `useConfirmClick(fn, true)`); 3,2 sn içinde basılmazsa söner.
Silahlıyken Publish gizlenir, Save kapanır.

### LocationsSettingsPage (kısmi: butonlar)

**Kendine özgü kurallar.** Lokasyon çekmecesinde "Delete location" iki tık
("Confirm delete"), ayrı panel yok. Jobs, Shift types ve Shift labels'ta
silme uyarı paneli açar (etki listesi); o panel bilerek kalıyor.

### SupportSettingsPage (kısmi: butonlar)

**Kendine özgü kurallar.** "Email support" ve "Copy diagnostics" yeşil.

### SchedulingSettingsPage

**Ne işe yarar.** Settings → Scheduling (`/app/settings/scheduling`). İki
bölüm, iki ayrı kaydetme:

- **Schedule basics**: haftanın ilk günü (Sunday / Monday), "Publish by"
  hedef günü ve saat biçimi (12 / 24 saat). "Save rules" ile kaydedilir
  (`update_scheduling_settings_service`). Conflict kuralları bu kayda
  girmez; onlar Conflict handling sayfasının.
- **Availability and staffing** (`availability/WeeklyPreferenceSettings.tsx`):
  müsaitlik giriş modu ("Time range" / "Shift type") ve "Required during
  onboarding". Kendi Save / Discard düğmeleri ve kendi revizyonu var
  (`weekly_preference_settings_save_service`).

**Kullandığı ortak parçalar.** UI-03 (`SettingsHeader`). Mod değişince
çalışanların kayıtlı haftaları DATA-05 ile dönüştürülür.

**Kendine özgü kurallar.**
- Düzenleme `settings.schedule_rules.manage` izni ister. İzni olmayan
  Schedule basics'i salt okunur görür; Availability and staffing bölümünü
  hiç görmez.
- "Shift type" moduna geçiş, saati eksik aktif bir vardiya tipi varken
  kapalı; eksik tipler Shift types sayfasına (`?edit=<id>`) linklenir.
- Mod değişimi (AVAIL-001, 2026-09-22): kaydedince workspace'teki her
  kayıtlı hafta (çalışanın kendi haftası ve yöneticinin "Manager reminders"
  haftası) yeni moda çevrilir, eski hali geçmiş tablosuna yazılır, sonra
  haftası çevrilen çalışanlara "Check your availability" bildirimi gider.
  Mod seçilir seçilmez not gösterilir: "Saved weeks will be converted to
  the new entry mode. Employees will be notified to check theirs."
- Başka biri ayarı bu arada değiştirdiyse taslak korunur, kaydetme kapanır;
  "Discard and reload" ile en son hal yüklenir.

**Bilinen tuhaflıklar.**
- `?checklist=setup` ile açılınca (owner kurulum listesinden) hafta başı ve
  saat biçimi boş gelir; ikisi seçilmeden kaydedilemez.
- Veri yüklenmeden önce form sabit varsayılanlarla (Monday, 12-hour)
  çizilir.
