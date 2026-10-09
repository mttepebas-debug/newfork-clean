# 121 Dosya Karar Eslesmesi

[Kalici davranis/karar raporu](../../../docs/rebuild/worktree-4dfb-disposition-2026-09-09.md). Durum WORK icindedir.

32 dosyanin uc yonlu sonucu ana dosyayla ayni. 88 metinsel cakisma ve 1 ek patch semantik tasnife ayrildi. D01/D05/D15 kullanici kararlariyla kapandi; satirlarda guncel kaynak karsiligi/tasima yapmama gerekcesi kayitli. Bu, tum davranislar icin test veya worktree silme kabulu degildir.

| Dosya | Uc yonlu sonuc | Karar ID | Aksiyon | Patch |
|---|---|---|---|---|
| `apps/api/package.json` | clean-merge-no-change | D01 | Metinsel patch zaten karsilanmis; tasima | [diff](001.diff) |
| `apps/api/src/app.test.ts` | conflict-review | D01, D08, D10, D18 | SSN bilincli kaldirilmis; diger guncel baglantilar korunur | [diff](002.diff) |
| `apps/api/src/app.ts` | conflict-review | D01, D08, D10 | SSN bilincli kaldirilmis; diger guncel baglantilar korunur | [diff](003.diff) |
| `apps/api/src/auth/workspace-context.ts` | conflict-review | D08, D09 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](004.diff) |
| `apps/api/src/communications/communication-routes.ts` | conflict-review | D16 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](005.diff) |
| `apps/api/src/communications/communication-service.ts` | clean-merge-no-change | D16 | Metinsel patch zaten karsilanmis; tasima | [diff](006.diff) |
| `apps/api/src/employee-hub/employee-hub-service.ts` | conflict-review | D02, D07 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](007.diff) |
| `apps/api/src/schedule/schedule-export-cron.test.ts` | clean-merge-no-change | D03, D11, D18 | Metinsel patch zaten karsilanmis; tasima | [diff](008.diff) |
| `apps/api/src/schedule/schedule-export-cron.ts` | conflict-review | D03, D11 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](009.diff) |
| `apps/api/src/schedule/schedule-lineup-service.ts` | conflict-review | D06 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](010.diff) |
| `apps/api/src/schedule/schedule-service.test.ts` | conflict-review | D03, D11, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](011.diff) |
| `apps/api/src/schedule/schedule-service.ts` | conflict-review | D03, D11 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](012.diff) |
| `apps/web/src/App.test.tsx` | clean-merge-no-change | D08, D18 | Metinsel patch zaten karsilanmis; tasima | [diff](014.diff) |
| `apps/web/src/App.tsx` | conflict-review | D07, D08, D12, D15 | Time Entries kaynaklari korunur; menu MVP kapsaminda geri eklenmez | [diff](015.diff) |
| `apps/web/src/account/PreferencesPage.tsx` | clean-merge-no-change | D08, D09 | Metinsel patch zaten karsilanmis; tasima | [diff](017.diff) |
| `apps/web/src/account/ProfilePage.tsx` | conflict-review | D08, D09 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](018.diff) |
| `apps/web/src/account/WorkspacesPage.tsx` | conflict-review | D08, D09 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](019.diff) |
| `apps/web/src/auth/AuthContext.tsx` | conflict-review | D08, D09 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](020.diff) |
| `apps/web/src/auth/ProtectedRoute.tsx` | conflict-review | D08, D09 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](022.diff) |
| `apps/web/src/communications/communications-data.ts` | conflict-review | D16 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](023.diff) |
| `apps/web/src/employee-hub/employee-hub-data.ts` | conflict-review | D02, D07, D08 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](024.diff) |
| `apps/web/src/employees/EmployeesPage.tsx` | clean-merge-no-change | D10 | Metinsel patch zaten karsilanmis; tasima | [diff](026.diff) |
| `apps/web/src/employees/employee-data.ts` | conflict-review | D10 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](027.diff) |
| `apps/web/src/employees/onboarding-data.ts` | conflict-review | D01, D02, D10 | SSN bilincli kaldirilmis; diger guncel baglantilar korunur | [diff](028.diff) |
| `apps/web/src/lib/supabase.ts` | conflict-review | D08, D09 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](030.diff) |
| `apps/web/src/schedule/components/ScheduleEmployeeCard.test.tsx` | clean-merge-no-change | D10, D18 | Metinsel patch zaten karsilanmis; tasima | [diff](033.diff) |
| `apps/web/src/schedule/components/ScheduleEmployeeCard.tsx` | clean-merge-no-change | D10 | Metinsel patch zaten karsilanmis; tasima | [diff](034.diff) |
| `apps/web/src/schedule/components/ScheduleGrid.test.tsx` | clean-merge-no-change | D03, D11, D18 | Metinsel patch zaten karsilanmis; tasima | [diff](042.diff) |
| `apps/web/src/schedule/components/ScheduleGrid.tsx` | clean-merge-no-change | D03, D11 | Metinsel patch zaten karsilanmis; tasima | [diff](043.diff) |
| `apps/web/src/schedule/components/ScheduleGridBody.tsx` | clean-merge-no-change | D03, D11 | Metinsel patch zaten karsilanmis; tasima | [diff](044.diff) |
| `apps/web/src/schedule/components/SchedulePresetRows.tsx` | clean-merge-no-change | D03, D11 | Metinsel patch zaten karsilanmis; tasima | [diff](053.diff) |
| `apps/web/src/schedule/components/ScheduleTopBar.tsx` | conflict-review | D14 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](058.diff) |
| `apps/web/src/schedule/components/ScheduleTotalsRow.tsx` | clean-merge-no-change | D03, D11 | Metinsel patch zaten karsilanmis; tasima | [diff](059.diff) |
| `apps/web/src/schedule/components/ShiftQuickEditor.test.tsx` | conflict-review | D03, D04, D05, D18 | Kullanici mevcut checkoutu secti: acik onay yeterli, yazili gerekce zorunlu degil; kod/test korunur | [diff](062.diff) |
| `apps/web/src/schedule/components/ShiftQuickEditor.tsx` | conflict-review | D03, D04, D05 | Kullanici mevcut checkoutu secti: acik onay yeterli, yazili gerekce zorunlu degil; kod/test korunur | [diff](063.diff) |
| `apps/web/src/schedule/hooks/useCellState.test.ts` | clean-merge-no-change | D02, D03, D18 | Metinsel patch zaten karsilanmis; tasima | [diff](064.diff) |
| `apps/web/src/schedule/hooks/useCellState.ts` | clean-merge-no-change | D02, D03 | Metinsel patch zaten karsilanmis; tasima | [diff](065.diff) |
| `apps/web/src/schedule/hooks/useScheduleGridDragControllers.test.ts` | clean-merge-no-change | D03, D18 | Metinsel patch zaten karsilanmis; tasima | [diff](068.diff) |
| `apps/web/src/schedule/hooks/useScheduleGridDragControllers.ts` | clean-merge-extra-change | D03, D19 | Cift fonksiyon ekleyen simule patchi uygulama | [diff](069.diff) |
| `apps/web/src/schedule/hooks/useSingleShiftPointerDrag.test.tsx` | clean-merge-no-change | D03, D18 | Metinsel patch zaten karsilanmis; tasima | [diff](070.diff) |
| `apps/web/src/schedule/hooks/useSingleShiftPointerDrag.ts` | conflict-review | D03 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](071.diff) |
| `apps/web/src/schedule/lib/shiftClipboard.test.ts` | clean-merge-no-change | D04, D18 | Metinsel patch zaten karsilanmis; tasima | [diff](080.diff) |
| `apps/web/src/schedule/lib/shiftClipboard.ts` | clean-merge-no-change | D04 | Metinsel patch zaten karsilanmis; tasima | [diff](081.diff) |
| `apps/web/src/schedule/lib/shiftEditorEligibility.test.ts` | conflict-review | D03, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](082.diff) |
| `apps/web/src/schedule/lib/shiftEditorEligibility.ts` | conflict-review | D03 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](083.diff) |
| `apps/web/src/schedule/lineup-data.ts` | clean-merge-no-change | D06 | Metinsel patch zaten karsilanmis; tasima | [diff](086.diff) |
| `apps/web/src/schedule/lineup-share.test.ts` | conflict-review | D06, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](087.diff) |
| `apps/web/src/schedule/lineup-share.ts` | conflict-review | D06 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](088.diff) |
| `apps/web/src/schedule/requests-data.ts` | clean-merge-no-change | D03, D11 | Metinsel patch zaten karsilanmis; tasima | [diff](089.diff) |
| `apps/web/src/schedule/schedule-data.ts` | clean-merge-no-change | D03, D11 | Metinsel patch zaten karsilanmis; tasima | [diff](090.diff) |
| `apps/web/src/settings/GeneralSettingsPage.tsx` | clean-merge-no-change | D08, D13 | Metinsel patch zaten karsilanmis; tasima | [diff](091.diff) |
| `apps/web/src/settings/ImportantDatesSettingsPage.tsx` | conflict-review | D08, D13 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](092.diff) |
| `apps/web/src/settings/SettingsLayout.tsx` | conflict-review | D12 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](094.diff) |
| `apps/web/src/settings/documents-data.ts` | clean-merge-no-change | D08, D13 | Metinsel patch zaten karsilanmis; tasima | [diff](095.diff) |
| `apps/web/src/settings/organization-data.ts` | conflict-review | D08, D13 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](097.diff) |
| `apps/web/src/settings/signature-templates-data.ts` | conflict-review | D08, D13 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](099.diff) |
| `apps/web/src/shell/AppShell.tsx` | conflict-review | D08, D14, D15, D17 | Time Entries kaynaklari korunur; menu MVP kapsaminda geri eklenmez | [diff](100.diff) |
| `apps/web/src/styles.css` | conflict-review | D07, D12, D14, D16 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](103.diff) |
| `apps/web/src/views/AnnouncementsPage.tsx` | conflict-review | D16 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](105.diff) |
| `apps/web/src/views/CommunicationPages.test.tsx` | clean-merge-no-change | D16, D18 | Metinsel patch zaten karsilanmis; tasima | [diff](106.diff) |
| `apps/web/src/views/EmployeeHubPage.test.tsx` | conflict-review | D02, D07, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](107.diff) |
| `apps/web/src/views/EmployeeHubPage.tsx` | conflict-review | D02, D07 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](108.diff) |
| `apps/web/src/views/LineupPage.test.tsx` | conflict-review | D06, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](109.diff) |
| `apps/web/src/views/LineupPage.tsx` | conflict-review | D06 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](110.diff) |
| `apps/web/src/views/NotificationsPage.tsx` | conflict-review | D17 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](111.diff) |
| `apps/web/src/views/SchedulePage.tsx` | conflict-review | D03, D11 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](112.diff) |
| `apps/web/src/views/ScheduleRequestsPage.tsx` | conflict-review | D03, D11 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](113.diff) |
| `apps/web/src/views/SignInPage.tsx` | conflict-review | D08, D09 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](114.diff) |
| `apps/web/src/views/WorkspacePage.tsx` | clean-merge-no-change | D08, D09 | Metinsel patch zaten karsilanmis; tasima | [diff](116.diff) |
| `packages/shared/src/communications.ts` | conflict-review | D16 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](120.diff) |
| `packages/shared/src/employee-hub.ts` | conflict-review | D02, D04, D07 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](121.diff) |
| `packages/shared/src/index.test.ts` | conflict-review | D02, D08, D10, D13, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](122.diff) |
| `packages/shared/src/index.ts` | clean-merge-no-change | D02, D08, D10, D13, D18 | Metinsel patch zaten karsilanmis; tasima | [diff](123.diff) |
| `packages/shared/src/schedule.ts` | clean-merge-no-change | D11 | Metinsel patch zaten karsilanmis; tasima | [diff](124.diff) |
| `pnpm-lock.yaml` | clean-merge-no-change | D01 | Metinsel patch zaten karsilanmis; tasima | [diff](125.diff) |
| `supabase/tests/communication_operations.test.sql` | conflict-review | D16, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](126.diff) |
| `supabase/tests/document_types_rls.test.sql` | conflict-review | D08, D13, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](127.diff) |
| `supabase/tests/employee_directory_rls.test.sql` | conflict-review | D10, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](129.diff) |
| `supabase/tests/employee_termination_offboarding.test.sql` | clean-merge-no-change | D10, D18 | Metinsel patch zaten karsilanmis; tasima | [diff](130.diff) |
| `supabase/tests/organization_basics_rls.test.sql` | clean-merge-no-change | D08, D09, D18 | Metinsel patch zaten karsilanmis; tasima | [diff](131.diff) |
| `supabase/tests/workspace_rls.test.sql` | conflict-review | D08, D09, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](136.diff) |
| `vercel.json` | clean-merge-no-change | D17 | Metinsel patch zaten karsilanmis; tasima | [diff](137.diff) |
| `apps/api/src/account/workspace-account-routes.test.ts` | conflict-review | D08, D09, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](139.diff) |
| `apps/api/src/account/workspace-account-routes.ts` | conflict-review | D08, D09 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](140.diff) |
| `apps/api/src/account/workspace-account-service.ts` | conflict-review | D08, D09 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](141.diff) |
| `apps/api/src/communications/communication-service.test.ts` | conflict-review | D16, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](142.diff) |
| `apps/api/src/employees/employee-directory-routes.test.ts` | conflict-review | D10, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](143.diff) |
| `apps/api/src/employees/employee-directory-routes.ts` | conflict-review | D10 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](144.diff) |
| `apps/api/src/employees/employee-directory-service.ts` | conflict-review | D10 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](145.diff) |
| `apps/api/src/notifications/notification-outbox-migration.test.ts` | conflict-review | D17, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](146.diff) |
| `apps/api/src/notifications/notification-outbox-worker.test.ts` | conflict-review | D17, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](148.diff) |
| `apps/api/src/notifications/notification-outbox-worker.ts` | conflict-review | D17 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](149.diff) |
| `apps/api/src/notifications/notification-settings-routes.test.ts` | conflict-review | D17, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](150.diff) |
| `apps/api/src/notifications/notification-settings-routes.ts` | conflict-review | D17 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](151.diff) |
| `apps/api/src/settings/document-types-routes.test.ts` | conflict-review | D08, D13, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](155.diff) |
| `apps/api/src/settings/document-types-routes.ts` | conflict-review | D08, D13 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](156.diff) |
| `apps/api/src/settings/document-types-service.ts` | conflict-review | D08, D13 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](157.diff) |
| `apps/api/src/settings/organization-settings-routes.test.ts` | conflict-review | D08, D13, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](158.diff) |
| `apps/api/src/settings/organization-settings-routes.ts` | conflict-review | D08, D13 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](159.diff) |
| `apps/api/src/settings/organization-settings-service.ts` | conflict-review | D08, D13 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](160.diff) |
| `apps/api/src/settings/roles-routes.test.ts` | conflict-review | D08, D13, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](161.diff) |
| `apps/api/src/settings/roles-routes.ts` | conflict-review | D08, D13 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](162.diff) |
| `apps/api/src/settings/signature-settings-routes.test.ts` | conflict-review | D08, D13, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](164.diff) |
| `apps/api/src/settings/signature-settings-routes.ts` | conflict-review | D08, D13 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](165.diff) |
| `apps/api/src/settings/signature-settings-service.ts` | conflict-review | D08, D13 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](166.diff) |
| `apps/web/src/account/WorkspacesPage.test.tsx` | conflict-review | D08, D09, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](171.diff) |
| `apps/web/src/auth/ProtectedRoute.test.tsx` | conflict-review | D08, D09, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](176.diff) |
| `apps/web/src/settings/NotificationSettingsNavigation.test.tsx` | conflict-review | D17, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](183.diff) |
| `apps/web/src/settings/ShiftLabelsSettingsPage.test.tsx` | conflict-review | D12, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](187.diff) |
| `apps/web/src/settings/ShiftLabelsSettingsPage.tsx` | conflict-review | D12 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](188.diff) |
| `apps/web/src/shell/AppShellNotificationBadge.test.tsx` | conflict-review | D08, D14, D15, D17, D18 | Time Entries kaynaklari korunur; menu MVP kapsaminda geri eklenmez | [diff](192.diff) |
| `apps/web/src/views/OwnerOnboardingPage.test.tsx` | conflict-review | D08, D09, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](194.diff) |
| `packages/shared/src/notification-catalog.test.ts` | conflict-review | D17, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](201.diff) |
| `packages/shared/src/notification-catalog.ts` | conflict-review | D17 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](202.diff) |
| `packages/shared/src/notification-display.ts` | conflict-review | D17 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](203.diff) |
| `packages/shared/src/notification-settings.test.ts` | conflict-review | D17, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](204.diff) |
| `packages/shared/src/notification-settings.ts` | conflict-review | D17 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](205.diff) |
| `supabase/tests/notification_outbox_relay.test.sql` | conflict-review | D17, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](227.diff) |
| `supabase/tests/notification_platform_core.test.sql` | conflict-review | D17, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](228.diff) |
| `supabase/tests/notification_preference_resolver_and_producers.test.sql` | conflict-review | D17, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](229.diff) |
| `supabase/tests/notification_settings_admin.test.sql` | conflict-review | D17, D18 | Guncel akis karsiligi bulundu; eski dosyayi topluca tasima | [diff](231.diff) |
