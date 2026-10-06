# Tazelik ölçümü — chunk4 (44 madde)

Taban: `origin/main` = `44e41a54`, worktree `newfork-wt/plan-bl-tazelik`, 2026-10-06. Salt okuma: kod okuma, grep, git log; tek yerel DB SELECT (`notification_catalog`, BL-651). Piksel ölçümü yapılmadı (dev sunucusu açılmadı).
Not: 2026-10-05'ten bu yana giriş/onboarding/herkese açık sayfa dosyalarına giren tek commit `81aa5544` (yalnız `App.tsx`, telefon Schedule kapanışı); G16 maddelerinin kodu aynı.
Ekran sınıflaması: Employee view → Schedule maddeleri (BL-660, BL-682, BL-683) "çalışan arayüzü" sayılıp ölçüldü; BL-682/683 yönetici Schedule'ıyla ortak bileşende olduğu için ekran-01 oturumuna da ilgili.

| BL | ekran | hüküm | kanıt (kısa) | yeni metin / birleşme |
|---|---|---|---|---|
| BL-593 | Settings | geçerli | Settings → Documents ve Important Dates başlıkları `role="columnheader"` + `aria-sort` taşıyor (`DocumentsSettingsPage.tsx:202-203`, `ImportantDatesSettingsPage.tsx:621-622`) ama kapsayan `role="table"/"row"` yok (Documents'ta grep 0); Jobs, Locations, Shift catalog'da hiç başlık rolü yok | — |
| BL-596 | Notifications | geçerli | `NotificationsPage.tsx:111-117` (`readLoaded` + "+", yorum "API sends no read total"); shared şemada yalnız `unread_count` (`communications.ts:189`), `read_count` grep 0 | — |
| BL-597 | Notifications | geçerli | `NotificationsPage.tsx:82-92` "No bulk action in the API: one call per selected row", `Promise.all(ids.map(actOnNotification))` | — |
| BL-598 | Important Dates | geçerli (kod; piksel ölçülmedi) | ilk sütun etiketi "Important date" `ImportantDatesSettingsPage.tsx:611`; 2026-10-05'ten beri bu sayfada yalnız düğme rengi commit'i (`529d6e98`) | — |
| BL-601 | Notifications | geçerli — karar bekliyor | Dismiss tek tık `icon-button`, onaysız `mutation.mutate({action:"dismiss"})` `NotificationsPage.tsx:335-349`; KARARLAR'da "dismiss" grep 0 | — |
| BL-603 | Settings | geçerli | KARARLAR "Liste sayfalarının ortak dili" (`KARARLAR.md:296`, `:310`) yalnız x=320 yazıyor; "x=544" ve Settings'e ayrı değer / tek satır yüksekliği yok (grep 0) | — |
| BL-605 | Settings / listeler | değişmiş | soluk satırın kaynağı `.jobs-settings-page button:disabled { opacity: .45 }` (`jobs-settings.css:42-46`). Locations'ta arşivli satır düğmesi artık disabled değil, yalnız `--job-muted` #647168 rengi (`LocationsSettingsPage.tsx:410-414`, `jobs-settings.css:478-480`) — maddedeki örnek tutmuyor. Soluk hâl Acknowledgements (Signature templates) arşivli satırlarında sürüyor (`SignatureTemplatesSettingsPage.tsx:1132`, `:1416`); "Archived" etiketi 10 px (`jobs-settings.css:470-472`) | Yeni metin: "Settings → Acknowledgements'ta arşivli satırlar disabled düğme olduğu için `opacity: 0.45` ile soluk (≈2.4–2.9:1); arşiv etiketi 10 px ve `#647168`; Locations'ta soluk hâl kalktı, yalnız gri renk." |
| BL-623 | Herkese açık sayfalar | geçerli (satırlar kaydı) | blok `styles.css:14051` (eski 14086), blokta 30 hex / 5 `var(--theme`; `#9b3e28` `:14156`, `:14185`, `:14255`; genel `.eyebrow` `:2796` | Satır numaraları güncellenmeli (14051, 14156/14185/14255, 2796) |
| BL-625 | Giriş / workspace seçimi | geçerli | `resolveLanding.ts:121` `mostRecentlyUsed(ready)`, fonksiyon `:149-158`; işaretsiz çoklu workspace için soru dalı yok | (BL-624 ile aynı dosya, birleşmez) |
| BL-626 | Workspaces hub | geçerli | koşul `WorkspaceHubPage.tsx:324` `invitations.length === 0 && !ownDraft` | — |
| BL-627 | Giriş | geçerli | `ProtectedRoute.tsx:25-31` `state={{ from }}`; `SignInPage.tsx:22-24` kimine ait olduğuna bakmadan kullanıyor | — |
| BL-628 | Giriş | geçerli — yeniden gönderme kısmı karar bekliyor | `AuthContext.tsx:265`, `:289` `setError(...Error.message)`; SignInPage/AuthContext'te "resend" grep 0 | — |
| BL-629 | Hesap kurtarma | geçerli | `AccountRecoveryPage.tsx:59` `disabled={busy \|\| token.length < 32}`; API `recoveryResendBody` `account-security-routes.ts:32`, `:191`; web'de resend çağrısı grep 0 | — |
| BL-630 | Hesap kurtarma | geçerli | `account-security-routes.ts:177`, `:184` "Valid recovery token required"; web `AccountRecoveryPage.tsx:21-25` `restoreError.message` | — |
| BL-632 | Onboarding | geçerli | `nextStep: 2` `OwnerOnboardingPage.tsx:411`, `nextStep: 3` `:510`; son tanım `20261002000000_manager_is_an_ordinary_job.sql:590` `current_step = next_step` (sonraki migration'larda yeniden tanım yok) | — |
| BL-633 | Onboarding | geçerli | ad alanları `useState("")` `OwnerOnboardingPage.tsx:130-132`; `addedTeam` yalnız sayfa durumu `:155`, `:731`; `startOver` bloğunda (`:794-821`) `setAddedTeam` yok | — |
| BL-634 | Onboarding | geçerli | `OwnerOnboardingPage.tsx:76` `browserTimeZone()`; `LocationTimezoneField.tsx:7` `manual = useRef(Boolean(value))`, `:12` `if (manual.current) return` | — |
| BL-635 | Herkese açık sayfalar | geçerli | `PublicTrustPages.tsx:233` "Light and dark themes", `:90`, `:345` tema; "Newfork Clean" `:165`, `:221`, `index.html:7`; "Phase 10" `:242` | — |
| BL-636 | Giriş | geçerli | geçiş düğmesi yalnız `setCreatingAccount` `SignInPage.tsx:169-173`; hata yalnız gönderimde siliniyor `AuthContext.tsx:259`, `:281` | — |
| BL-637 | Parola sıfırlama | geçerli | `ForgotPasswordPage.tsx:21-25` `caught.message`; API `password-reset.ts:53` "Valid email required" | — |
| BL-638 | Parola sıfırlama | geçerli | `ResetPasswordPage.tsx:60-62` `caught.message` | — |
| BL-639 | Workspace durum adresi | geçerli | `WorkspaceStatusPage.tsx:111-116` `default:` → "That workspace isn't open to you" | — |
| BL-640 | Onboarding | geçerli | `OwnerOnboardingPage.tsx:1876` "Invite delivery waits until owner onboarding is completed." | — |
| BL-641 | Onboarding | geçerli | `<Feedback success={success} />` `OwnerOnboardingPage.tsx:983`, `:1103`, `:1371`, `:1481` | — |
| BL-642 | Onboarding | geçerli (satırlar kaydı; piksel ölçülmedi) | `.onboarding-form label > input { margin-top: 8px }` `styles.css:11528-11531` (0,1,2) `.onboarding-check input { margin: 0 }` `:11541-11545`'i (0,1,1) eziyor | Satırlar 11528 / 11541 olarak güncellenmeli |
| BL-643 | Herkese açık sayfalar | geçerli | `App.tsx:142` `BrowserRouter`; `ScrollRestoration` grep 0; `scrollTo` yalnız dev/preview dosyalarında | — |
| BL-644 | Herkese açık sayfalar | geçerli — karar bekliyor | "clean rebuild" `PublicTrustPages.tsx:52`, `:133`, `:216`, `:326`; "current product foundation" `:82`; "deployment owner" `:141`, `:362` | — |
| BL-650 | Onboarding / ölü rota | değişmiş | `OwnerOnboardingPage.tsx:884` duruyor, ama "çağıran tek yer" yanlış: `/organization-switcher` ayrıca `account/WorkspacesPage.tsx:344`, `auth/WorkspaceSetupPending.tsx:37`, `employees/WelcomeRedirect.tsx:25`'te; emekli rota `App.tsx:199` (+ `:248` `/organization-switcher/suspended`) | Yeni metin: "Emekli `/organization-switcher` rotasına dört yer gidiyor (kurulum sihirbazı Switch workspace `OwnerOnboardingPage.tsx:884`, `WorkspacesPage.tsx:344`, `WorkspaceSetupPending.tsx:37`, `WelcomeRedirect.tsx:25`); hepsi `/workspaces`'e çevrilince rota silinebilir." |
| BL-651 | Settings → Notifications | değişmiş | `humanLabel` geri düşüşü `NotificationSettingsPage.tsx:343`, `:502`; etiket tablosu `notification-display.ts` yalnız 10 anahtar (`satisfies Record` `:208`, katalog `notification-catalog.ts:300-311`). Yerel DB SELECT `notification_catalog`: 35 tür → 25'i etiketsiz (16 değil); örnekteki `manager_decision_required` migration'larda yok (grep 0). Yerel DB kayabilir, sayı ona göre | Yeni metin: "Settings → Notifications'ta adı `notification-display.ts`'de olmayan türler (yerel katalogda 35 türün 25'i, ör. `people.documents.*`, `requests.time_off.reminder`, `security.account.*`) ham anahtardan türetilmiş adla yazıyor." |
| BL-659 | Settings | geçerli | "Discard changes" `job-primary-button` (yeşil) `JobAssignmentsDrawer.tsx:673-679`; "Reload rules" varsayılan `Button` (`nf-button`) Save'in yanında `ConflictHandlingSettingsPage.tsx:248-261` | — (EKRAN-05 OZET'te "sınırda", U41 akrabası) |
| BL-660 | Çalışan arayüzü | geçerli | "My Schedule" `className="secondary-button"` `EmployeeScheduleBoard.tsx:283-293`; "Add another period"/"Remove period" sınıfsız `<button>` `TimeOffHourFields.tsx:45`, `:47`; "Cancel request" `text-button` `EmployeeHubPage.tsx:426-438` (dosya `views/` altında, `employee-hub/` değil) | Dosya yolu düzeltilmeli: `apps/web/src/views/EmployeeHubPage.tsx` |
| BL-664 | Settings | geçerli | (1) `LocationsSettingsPage.tsx:402` sabit virgüllü şablon; (2) "Save" `ShiftTypesSettingsPage.tsx:436` / "Save shift label" `ShiftLabelsSettingsPage.tsx:271`; (3) `document-settings-editor.css:162` `capitalize`; (4) `notification-settings.css:234-238` mavi `rgba(37,99,235,.32)`; (5)-(6) ölçülmedi | Kalem (3) EKRAN-06 Documents keşfinde (`06-documents/A-backlog-prototip.md:133`) ayrıca ele alındı |
| BL-665 | Listeler | ölçülemedi | CSS iddiası duruyor: `.list-page :is(.job-catalog, …) { overflow: hidden }` `list-page.css:178-180`; menü `position: absolute; top: 34px` `jobs-settings.css:565-569`. Kesilme ekranda görülmedi (madde zaten "önce ölçülmeli" diyor) | — |
| BL-668 | Account | geçerli (kod; görünüm ölçülmedi) | `/account/inbox` → `NotificationsPage` (uygulama sayfa kabı) `App.tsx:276` | — |
| BL-671 | Settings → Jobs | geçerli — karar bekliyor | Cancel doğrudan `onClose` `JobAssignmentsDrawer.tsx:622-628`; X/Esc `requestClose` → `setDiscard(true)` `:277-281` | — |
| BL-675 | Announcements | geçerli | `AcknowledgeControl` yükümlülük kontrolü yapmıyor (`AnnouncementsPage.tsx:876-909`; okuyucu listesinde `:383`, çekmecede `:840-842` yalnız `status !== "draft"`); shared şemada onay-gerekli alanı yok (`communications.ts:89-101`) | — |
| BL-676 | Important Dates | geçerli | `ImportantDatesSettingsPage.tsx:654` `disabled={!mayManageDate(item)}`, `:98` `can_edit === true` | — |
| BL-677 | Settings | geçerli | başlık "Scheduling" `SchedulingSettingsPage.tsx:139` / menü "Schedule rules" `SettingsLayout.tsx:57`; Save yalnız pending/checklist'te kapalı `:259-263`; `setDirty(true)` geri almada sıfırlanmıyor `ConflictHandlingSettingsPage.tsx:110` | — |
| BL-678 | Announcements | geçerli | `AnnouncementsPage.tsx:1035-1036` her zaman "All departments" / "All jobs" | — |
| BL-679 | Important Dates | geçerli — karar bekliyor | `dateTab` `ImportantDatesSettingsPage.tsx:764-767` yalnız `ends_on < today`; KARARLAR'da yıllık tarih sekmesi kuralı yok (K11 `KARARLAR.md:195` yalnız geçmiş kilidi) | — |
| BL-680 | Settings → Roles | geçerli — karar bekliyor | `rolePermissions.manager` (`packages/shared/src/index.ts:148-173`) hiçbir `settings.*.read` taşımıyor; KARARLAR K14 S1 `KARARLAR.md:86` "katalogu görür" | İlişkili: EKRAN-06 E6-01/E6-22 (BL-560) aynı kök (yerleşik Manager izinleri); birleşmez, aynı izin işinde ele alınabilir |
| BL-682 | Çalışan arayüzü (Schedule ortak ızgara) | geçerli (kod bulundu; piksel ölçülmedi) | şablon `ScheduleGrid.tsx:330` `fitVisibleColumns = locationGroups.length <= 1 && view === "week"`; değilse `scheduleGridLayout.ts:168-170` `minmax(var(--schedule-day-column-min), 1fr)` — birden çok lokasyon grubu ya da gün görünümünde sütunlar sığdırılmıyor; yönetici Schedule'ıyla ortak | Ek kanıt: "şablonu kuran satır `ScheduleGrid.tsx:330` + `scheduleGridLayout.ts:162-170`" |
| BL-683 | Çalışan arayüzü (Schedule ortak bileşen) | geçerli | `ScheduleLocationHeader.tsx:134` cümle; `EmployeeScheduleBoard.tsx:297` aynı `ScheduleGrid`'i çiziyor; `deadlineWarning` için rol kapısı yok (grep) | (BL-570 akrabası, birleşmez) |
| BL-684 | Geliştirme ortamı | ölçülemedi | rota `employee-hub-routes.ts:63` duruyor; gecikme yalnız yerel gözlem, boşta yeniden ölçülmedi (yük ölçümü bu turun kapsamı dışında) | — |

## Sayılar
- EKRAN (ölçülmeden bırakılan): 0
- geçerli: 39 (bunlardan 6'sı "karar bekliyor": BL-601, BL-628 kısmı, BL-644, BL-671, BL-679, BL-680)
- değişmiş: 3 (BL-605, BL-650, BL-651)
- bayat: 0
- ölçülemedi: 2 (BL-665, BL-684)
- Birleşme: yok (yalnız ilişki notları: BL-680 ↔ BL-560, BL-664 (3) ↔ EKRAN-06)
