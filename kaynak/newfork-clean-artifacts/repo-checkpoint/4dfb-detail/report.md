# 4dfb: 233 dosya ve 121 icerik farki

Sonraki inceleme ve kullanici kararlarini [121 dosya karar eslesmesinde](disposition.md) oku. SSN belirsizligi kullanicinin dogrudan yanitiyla kapandi; ilk sayim raporu asagida korunuyor.

Envanter zamani (UTC): 2026-09-10T02:19:47.138Z.
Ana checkout: C:\Users\TheWe\Documents\Codex\newfork-clean; branch: codex/phase-1-foundation; HEAD: fbdcaeaa0eca6b831ba098626b5808c9253f29c6.
Diger worktree: C:/Users/TheWe/.codex/worktrees/4dfb/newfork-clean; HEAD: 415b15f77180fbf2f7aaa1a7a9740d886c86a967.

## Sayilar ne anlama geliyor?
- 233 commit degil, worktree status listesindeki 233 dosyadir: 137 tracked modified, 96 untracked.
- Ana checkout ile CRLF/LF normalize edilerek karsilastirildiginda 112 ayni, 121 farkli.
- Tur dagilimi: 117 kaynak/yapilandirma, 88 test, 20 migration, 8 dokuman.
- 121 farkli dosyanin 76 tanesi kaynak/yapilandirma, 45 tanesi test. 20 migration ve 8 dokumanin tamami ayni.
- Bu 233 yolun hepsi ana checkoutta da var. Bu ifade tum worktree agacinin esit oldugu anlamina GELMEZ; eski HEADden degismeyen dosyalar bu listeye girmez.
- 96 untracked dosyanin ana checkoutta bulunmasi normaldir: her worktree kendi HEAD/index durumunu raporlar.
- Farkli = kayip, bozuk, gereksiz veya aktarilmasi gereken demek degildir. Baska modullere tasinmis davranis ve yeni sozlesme farklari vardir.

## Ozellik bazinda dagilim
Gruplar dosya yoluna gore tek bir ana basliga atanmistir; islevler birbirine baglidir.

| Alan | Toplam | Ayni | Farkli |
| --- | ---: | ---: | ---: |
| Bildirim platformu | 55 | 38 | 17 |
| Schedule | 70 | 43 | 27 |
| Line Up | 6 | 0 | 6 |
| Hesap, kimlik ve organizasyon | 21 | 4 | 17 |
| Calisan ve onboarding | 18 | 3 | 15 |
| Ayarlar | 29 | 9 | 20 |
| Duyurular ve workspace gorevleri | 8 | 0 | 8 |
| Ortak kod, uygulama kabugu ve runtime | 24 | 13 | 11 |
| Diger guvenlik migrationlari | 2 | 2 | 0 |

### Bildirim platformu
Outbox worker/route, bildirim katalogu, kurum politikalari, kisisel tercihler, inbox rozeti, producer ve SQL testleri. 38 dosya ana checkout ile ayni. Farkli kisimlarda ana checkout staffing ve belge suresi olaylari, worker bakim/skipped ayrimi, hedef workspace yetkilendirmesi ve guvenli uygulama aksiyon URL semasi ekliyor.

### Schedule
Grid, satir/badge olcumleri, drag/drop, kopyalama, hizli editor, export ve request ekranlari. Export/gorunum altyapisinin pek cok dosyasi zaten ayni. Ana checkout haftalik availability okumasini, sunucu assignment degerlendirmesini, availability uyarisi ile kesin engel ayrimini, kopyalanan saat kaynagi/timezone bilgisini, tarih seciciyi, batch shift/default hours servislerini ve request/time-off entegrasyonlarini iceriyor.

### Line Up
Servis, veri adaptoru, paylasim yardimcilari, sayfa ve testleri. Eski 1279 satirlik views/LineupPage.tsx ana checkoutta 4 satirlik re-export: uygulama schedule/lineup/LineupWorkspace.tsx dosyasinda. Ana serviste lokasyon/yetki kontrolleri, staffing proposal islemleri, shift-type kapsamli paylasim ve bildirim baglantilari var. Bu tasinma tum eski davranislarin birebir korundugu kaniti degildir.

### Hesap, kimlik ve organizasyon
AuthContext, ProtectedRoute, workspace resolver, hesap/organizasyon ekranlari, onboarding ve RLS testleri. Ana checkout hedef workspace yetkilendirmesi, onboarding uyelik kontrolu, Auth gecici hata ayrimi, organizasyon kapatma/iptal, sahiplik devri, hesap silme ve ilgili onay akislari ekliyor.

### Calisan ve onboarding
Calisan dizini API/UI, veri adaptoru, Employee Hub ve testleri. Ana checkout create komutu, avatar/erisim islemleri, kisisel gorevler, yeni izin/availability baglantilari ve onboarding reset/leave ekliyor. Eski saveMySsn ve onboarding availability istemci cagirilari kaldirilmis. SSN karari asagida ayri bir belirsizliktir.

### Ayarlar
Important Dates, Shift Labels, organizasyon, roller, belge turleri ve imza ayarlari. Ana checkout Important Dates coklu lokasyonunu, ortak katalog/drawer gorunumunu, degisiklik varsa kaydetme kontrollerini, jobs route baglantisini, shift varsayilan saat guncelleme kontrollerini ve belge suresinin Schedule etkisini iceriyor.

### Duyurular ve workspace gorevleri
Duyuru API/veri modeli/UI ve testleri. Ana checkout arama/siralama/arsiv gorunumu ve katalog editoru, workspace manuel todo olusturma/cozme ve setup checklist endpointlerini ekliyor. Buyuk UI yeniden yazimi eski tum davranislarin korunduguna dair tek basina kanit degildir.

### Ortak kod, uygulama kabugu ve runtime
API app kayitlari, App/AppShell, ortak schema ve testler, styles.css, paket/lock ve Vercel ayarlari. Bunlar bircok ozelligin ortak baglanti dosyalaridir; her biri ayri ozellik degildir. Ana checkoutta notification-outbox cron tanimi var; eski AWS KMS bagimliligi yok. Cron tanimi canli calisma kaniti degildir.

### Diger guvenlik migrationlari
Public function execute yetkilerinin daraltilmasi ve RLS yardimcilarinin private schemaya tasinmasi. Iki dosya da ana checkout ile ayni. Bu dosya karsilastirmasi migrationlarin herhangi bir DB ortaminda uygulanmis oldugunu kanitlamaz.

## Cozulen konu: SSN / AWS KMS
4dfb app.ts ve onboarding-data.ts SSN sifreleme/toplama akisina bagli; API package.json AWS KMS bagimliligini iceriyor. Ana checkout bu bagimlilik ve baglantilari icermiyor.
4dfbde apps/api/src/employees/ssn-encryption.ts ve testi de var. Bu iki dosya eski HEADden degismedigi icin 233 status dosyasinin disindadir. Ana checkoutta yoklar; WORK kaydina gore checkpointten once zaten silinmislerdi.
Kullanici sonraki mesajinda SSN toplamama kararini kendisinin verdigini dogruladi. Guncel urun belgesi de SSN'yi kapsam disi tutuyor. Bu baglanti bilincli kaldirilmis; geri getirilmeyecek. Worktree veya gecmis kayitlari topluca silme karari degildir.

## Incelemenin siniri
233 dosyanin envanteri ve icerik esitligi tam sayildi; 121 farkin patchleri kaydedildi. Yukaridaki davranis aciklamalari incelenen temsilci servis/UI/kontrat farklarina dayanir. Her davranisin esdegerligi veya urun kabulunun tamamlandigi iddia edilmez.
Urun kodu, branch, stash ve worktree degistirilmedi. Bu rapor ve yardimci yerel analiz dosyalari ignored artifacts/.temp altindadir. Test calistirilmadi; bu is kod degisikligi degil icerik aciklamasidir.

## Tum 233 dosya
M: 4dfb HEADine gore tracked degisiklik. ??: 4dfbde untracked. Ayni/farkli: ana checkoutun mevcut icerigine gore.
Patch yonu 4dfb -> ana checkout: + ana checkout tarafindaki ek satir, - eski worktree tarafindaki satir. Sayilar tasima veya yeniden yazimda buyuyebilir; is/kalite olcusu degildir.

| # | Dosya | 4dfb | Tur | Ana checkout | Satir + / - | Patch |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `apps/api/package.json` | M | source-config | Farkli | 0 / 1 | [diff](001.diff) |
| 2 | `apps/api/src/app.test.ts` | M | test | Farkli | 1735 / 54 | [diff](002.diff) |
| 3 | `apps/api/src/app.ts` | M | source-config | Farkli | 388 / 71 | [diff](003.diff) |
| 4 | `apps/api/src/auth/workspace-context.ts` | M | source-config | Farkli | 184 / 7 | [diff](004.diff) |
| 5 | `apps/api/src/communications/communication-routes.ts` | M | source-config | Farkli | 197 / 36 | [diff](005.diff) |
| 6 | `apps/api/src/communications/communication-service.ts` | M | source-config | Farkli | 69 / 1 | [diff](006.diff) |
| 7 | `apps/api/src/employee-hub/employee-hub-service.ts` | M | source-config | Farkli | 73 / 18 | [diff](007.diff) |
| 8 | `apps/api/src/schedule/schedule-export-cron.test.ts` | M | test | Farkli | 31 / 0 | [diff](008.diff) |
| 9 | `apps/api/src/schedule/schedule-export-cron.ts` | M | source-config | Farkli | 13 / 0 | [diff](009.diff) |
| 10 | `apps/api/src/schedule/schedule-lineup-service.ts` | M | source-config | Farkli | 273 / 3 | [diff](010.diff) |
| 11 | `apps/api/src/schedule/schedule-service.test.ts` | M | test | Farkli | 278 / 1 | [diff](011.diff) |
| 12 | `apps/api/src/schedule/schedule-service.ts` | M | source-config | Farkli | 237 / 12 | [diff](012.diff) |
| 13 | `apps/web/scripts/dev-with-api.mjs` | M | source-config | Ayni | 0 / 0 | - |
| 14 | `apps/web/src/App.test.tsx` | M | test | Farkli | 18 / 1 | [diff](014.diff) |
| 15 | `apps/web/src/App.tsx` | M | source-config | Farkli | 89 / 19 | [diff](015.diff) |
| 16 | `apps/web/src/account/AccountLayout.tsx` | M | source-config | Ayni | 0 / 0 | - |
| 17 | `apps/web/src/account/PreferencesPage.tsx` | M | source-config | Farkli | 14 / 2 | [diff](017.diff) |
| 18 | `apps/web/src/account/ProfilePage.tsx` | M | source-config | Farkli | 116 / 5 | [diff](018.diff) |
| 19 | `apps/web/src/account/WorkspacesPage.tsx` | M | source-config | Farkli | 569 / 29 | [diff](019.diff) |
| 20 | `apps/web/src/auth/AuthContext.tsx` | M | source-config | Farkli | 226 / 37 | [diff](020.diff) |
| 21 | `apps/web/src/auth/PermissionRoute.tsx` | M | source-config | Ayni | 0 / 0 | - |
| 22 | `apps/web/src/auth/ProtectedRoute.tsx` | M | source-config | Farkli | 8 / 1 | [diff](022.diff) |
| 23 | `apps/web/src/communications/communications-data.ts` | M | source-config | Farkli | 72 / 11 | [diff](023.diff) |
| 24 | `apps/web/src/employee-hub/employee-hub-data.ts` | M | source-config | Farkli | 29 / 17 | [diff](024.diff) |
| 25 | `apps/web/src/employees/EmployeesPage.test.tsx` | M | test | Ayni | 0 / 0 | - |
| 26 | `apps/web/src/employees/EmployeesPage.tsx` | M | source-config | Farkli | 53 / 32 | [diff](026.diff) |
| 27 | `apps/web/src/employees/employee-data.ts` | M | source-config | Farkli | 215 / 43 | [diff](027.diff) |
| 28 | `apps/web/src/employees/onboarding-data.ts` | M | source-config | Farkli | 25 / 48 | [diff](028.diff) |
| 29 | `apps/web/src/kiosk/kiosk-data.ts` | M | source-config | Ayni | 0 / 0 | - |
| 30 | `apps/web/src/lib/supabase.ts` | M | source-config | Farkli | 198 / 15 | [diff](030.diff) |
| 31 | `apps/web/src/public/PublicTrustPages.test.tsx` | M | test | Ayni | 0 / 0 | - |
| 32 | `apps/web/src/schedule/badgeAccessibility.test.ts` | M | test | Ayni | 0 / 0 | - |
| 33 | `apps/web/src/schedule/components/ScheduleEmployeeCard.test.tsx` | M | test | Farkli | 13 / 0 | [diff](033.diff) |
| 34 | `apps/web/src/schedule/components/ScheduleEmployeeCard.tsx` | M | source-config | Farkli | 5 / 3 | [diff](034.diff) |
| 35 | `apps/web/src/schedule/components/ScheduleExportDialog.test.tsx` | M | test | Ayni | 0 / 0 | - |
| 36 | `apps/web/src/schedule/components/ScheduleExportDialog.tsx` | M | source-config | Ayni | 0 / 0 | - |
| 37 | `apps/web/src/schedule/components/ScheduleExportPanel.test.tsx` | M | test | Ayni | 0 / 0 | - |
| 38 | `apps/web/src/schedule/components/ScheduleExportPanel.tsx` | M | source-config | Ayni | 0 / 0 | - |
| 39 | `apps/web/src/schedule/components/ScheduleFillerRow.test.tsx` | M | test | Ayni | 0 / 0 | - |
| 40 | `apps/web/src/schedule/components/ScheduleFillerRow.tsx` | M | source-config | Ayni | 0 / 0 | - |
| 41 | `apps/web/src/schedule/components/ScheduleGrid.hour-totals.test.tsx` | M | test | Ayni | 0 / 0 | - |
| 42 | `apps/web/src/schedule/components/ScheduleGrid.test.tsx` | M | test | Farkli | 2 / 2 | [diff](042.diff) |
| 43 | `apps/web/src/schedule/components/ScheduleGrid.tsx` | M | source-config | Farkli | 3 / 1 | [diff](043.diff) |
| 44 | `apps/web/src/schedule/components/ScheduleGridBody.tsx` | M | source-config | Farkli | 1 / 1 | [diff](044.diff) |
| 45 | `apps/web/src/schedule/components/ScheduleGridDragPreviews.test.tsx` | M | test | Ayni | 0 / 0 | - |
| 46 | `apps/web/src/schedule/components/ScheduleGridHeaders.test.tsx` | M | test | Ayni | 0 / 0 | - |
| 47 | `apps/web/src/schedule/components/ScheduleGridHeaders.tsx` | M | source-config | Ayni | 0 / 0 | - |
| 48 | `apps/web/src/schedule/components/ScheduleGridShell.test.tsx` | M | test | Ayni | 0 / 0 | - |
| 49 | `apps/web/src/schedule/components/ScheduleGridShell.tsx` | M | source-config | Ayni | 0 / 0 | - |
| 50 | `apps/web/src/schedule/components/ScheduleLogoFrame.tsx` | M | source-config | Ayni | 0 / 0 | - |
| 51 | `apps/web/src/schedule/components/ScheduleLogoUploadDialog.test.tsx` | M | test | Ayni | 0 / 0 | - |
| 52 | `apps/web/src/schedule/components/ScheduleLogoUploadDialog.tsx` | M | source-config | Ayni | 0 / 0 | - |
| 53 | `apps/web/src/schedule/components/SchedulePresetRows.tsx` | M | source-config | Farkli | 2 / 2 | [diff](053.diff) |
| 54 | `apps/web/src/schedule/components/ScheduleRow.test.tsx` | M | test | Ayni | 0 / 0 | - |
| 55 | `apps/web/src/schedule/components/ScheduleRow.tsx` | M | source-config | Ayni | 0 / 0 | - |
| 56 | `apps/web/src/schedule/components/ScheduleStickyLayoutStyles.test.ts` | M | test | Ayni | 0 / 0 | - |
| 57 | `apps/web/src/schedule/components/ScheduleTopBar.test.tsx` | M | test | Ayni | 0 / 0 | - |
| 58 | `apps/web/src/schedule/components/ScheduleTopBar.tsx` | M | source-config | Farkli | 89 / 18 | [diff](058.diff) |
| 59 | `apps/web/src/schedule/components/ScheduleTotalsRow.tsx` | M | source-config | Farkli | 3 / 0 | [diff](059.diff) |
| 60 | `apps/web/src/schedule/components/ShiftCard.test.tsx` | M | test | Ayni | 0 / 0 | - |
| 61 | `apps/web/src/schedule/components/ShiftCard.tsx` | M | source-config | Ayni | 0 / 0 | - |
| 62 | `apps/web/src/schedule/components/ShiftQuickEditor.test.tsx` | M | test | Farkli | 327 / 30 | [diff](062.diff) |
| 63 | `apps/web/src/schedule/components/ShiftQuickEditor.tsx` | M | source-config | Farkli | 279 / 59 | [diff](063.diff) |
| 64 | `apps/web/src/schedule/hooks/useCellState.test.ts` | M | test | Farkli | 13 / 0 | [diff](064.diff) |
| 65 | `apps/web/src/schedule/hooks/useCellState.ts` | M | source-config | Farkli | 8 / 0 | [diff](065.diff) |
| 66 | `apps/web/src/schedule/hooks/useScheduleBadgeMeasurements.test.tsx` | M | test | Ayni | 0 / 0 | - |
| 67 | `apps/web/src/schedule/hooks/useScheduleBadgeMeasurements.tsx` | M | source-config | Ayni | 0 / 0 | - |
| 68 | `apps/web/src/schedule/hooks/useScheduleGridDragControllers.test.ts` | M | test | Farkli | 17 / 0 | [diff](068.diff) |
| 69 | `apps/web/src/schedule/hooks/useScheduleGridDragControllers.ts` | M | source-config | Farkli | 14 / 24 | [diff](069.diff) |
| 70 | `apps/web/src/schedule/hooks/useSingleShiftPointerDrag.test.tsx` | M | test | Farkli | 6 / 4 | [diff](070.diff) |
| 71 | `apps/web/src/schedule/hooks/useSingleShiftPointerDrag.ts` | M | source-config | Farkli | 2 / 2 | [diff](071.diff) |
| 72 | `apps/web/src/schedule/lib/scheduleDateTime.test.ts` | M | test | Ayni | 0 / 0 | - |
| 73 | `apps/web/src/schedule/lib/scheduleDateTime.ts` | M | source-config | Ayni | 0 / 0 | - |
| 74 | `apps/web/src/schedule/lib/scheduleGridLayout.test.ts` | M | test | Ayni | 0 / 0 | - |
| 75 | `apps/web/src/schedule/lib/scheduleGridLayout.ts` | M | source-config | Ayni | 0 / 0 | - |
| 76 | `apps/web/src/schedule/lib/scheduleGridViewModel.test.ts` | M | test | Ayni | 0 / 0 | - |
| 77 | `apps/web/src/schedule/lib/scheduleGridViewModel.ts` | M | source-config | Ayni | 0 / 0 | - |
| 78 | `apps/web/src/schedule/lib/scheduleInteractionTargets.test.ts` | M | test | Ayni | 0 / 0 | - |
| 79 | `apps/web/src/schedule/lib/scheduleInteractionTargets.ts` | M | source-config | Ayni | 0 / 0 | - |
| 80 | `apps/web/src/schedule/lib/shiftClipboard.test.ts` | M | test | Farkli | 3 / 0 | [diff](080.diff) |
| 81 | `apps/web/src/schedule/lib/shiftClipboard.ts` | M | source-config | Farkli | 6 / 0 | [diff](081.diff) |
| 82 | `apps/web/src/schedule/lib/shiftEditorEligibility.test.ts` | M | test | Farkli | 2 / 2 | [diff](082.diff) |
| 83 | `apps/web/src/schedule/lib/shiftEditorEligibility.ts` | M | source-config | Farkli | 6 / 6 | [diff](083.diff) |
| 84 | `apps/web/src/schedule/lib/shiftEditorView.test.ts` | M | test | Ayni | 0 / 0 | - |
| 85 | `apps/web/src/schedule/lib/shiftEditorView.ts` | M | source-config | Ayni | 0 / 0 | - |
| 86 | `apps/web/src/schedule/lineup-data.ts` | M | source-config | Farkli | 312 / 12 | [diff](086.diff) |
| 87 | `apps/web/src/schedule/lineup-share.test.ts` | M | test | Farkli | 39 / 2 | [diff](087.diff) |
| 88 | `apps/web/src/schedule/lineup-share.ts` | M | source-config | Farkli | 130 / 7 | [diff](088.diff) |
| 89 | `apps/web/src/schedule/requests-data.ts` | M | source-config | Farkli | 16 / 6 | [diff](089.diff) |
| 90 | `apps/web/src/schedule/schedule-data.ts` | M | source-config | Farkli | 44 / 10 | [diff](090.diff) |
| 91 | `apps/web/src/settings/GeneralSettingsPage.tsx` | M | source-config | Farkli | 58 / 1 | [diff](091.diff) |
| 92 | `apps/web/src/settings/ImportantDatesSettingsPage.tsx` | M | source-config | Farkli | 508 / 278 | [diff](092.diff) |
| 93 | `apps/web/src/settings/SettingsHomeRedirect.tsx` | M | source-config | Ayni | 0 / 0 | - |
| 94 | `apps/web/src/settings/SettingsLayout.tsx` | M | source-config | Farkli | 10 / 14 | [diff](094.diff) |
| 95 | `apps/web/src/settings/documents-data.ts` | M | source-config | Farkli | 1 / 1 | [diff](095.diff) |
| 96 | `apps/web/src/settings/kiosk-management-data.ts` | M | source-config | Ayni | 0 / 0 | - |
| 97 | `apps/web/src/settings/organization-data.ts` | M | source-config | Farkli | 68 / 18 | [diff](097.diff) |
| 98 | `apps/web/src/settings/roles-data.ts` | M | source-config | Ayni | 0 / 0 | - |
| 99 | `apps/web/src/settings/signature-templates-data.ts` | M | source-config | Farkli | 22 / 0 | [diff](099.diff) |
| 100 | `apps/web/src/shell/AppShell.tsx` | M | source-config | Farkli | 154 / 183 | [diff](100.diff) |
| 101 | `apps/web/src/shell/MiniCalendar.test.tsx` | M | test | Ayni | 0 / 0 | - |
| 102 | `apps/web/src/shell/MiniCalendar.tsx` | M | source-config | Ayni | 0 / 0 | - |
| 103 | `apps/web/src/styles.css` | M | source-config | Farkli | 1101 / 20 | [diff](103.diff) |
| 104 | `apps/web/src/time-entries/time-entries-data.ts` | M | source-config | Ayni | 0 / 0 | - |
| 105 | `apps/web/src/views/AnnouncementsPage.tsx` | M | source-config | Farkli | 804 / 443 | [diff](105.diff) |
| 106 | `apps/web/src/views/CommunicationPages.test.tsx` | M | test | Farkli | 2 / 0 | [diff](106.diff) |
| 107 | `apps/web/src/views/EmployeeHubPage.test.tsx` | M | test | Farkli | 490 / 25 | [diff](107.diff) |
| 108 | `apps/web/src/views/EmployeeHubPage.tsx` | M | source-config | Farkli | 347 / 519 | [diff](108.diff) |
| 109 | `apps/web/src/views/LineupPage.test.tsx` | M | test | Farkli | 388 / 30 | [diff](109.diff) |
| 110 | `apps/web/src/views/LineupPage.tsx` | M | source-config | Farkli | 4 / 1279 | [diff](110.diff) |
| 111 | `apps/web/src/views/NotificationsPage.tsx` | M | source-config | Farkli | 57 / 13 | [diff](111.diff) |
| 112 | `apps/web/src/views/SchedulePage.tsx` | M | source-config | Farkli | 138 / 69 | [diff](112.diff) |
| 113 | `apps/web/src/views/ScheduleRequestsPage.tsx` | M | source-config | Farkli | 638 / 194 | [diff](113.diff) |
| 114 | `apps/web/src/views/SignInPage.tsx` | M | source-config | Farkli | 62 / 18 | [diff](114.diff) |
| 115 | `apps/web/src/views/TimeEntriesPage.tsx` | M | source-config | Ayni | 0 / 0 | - |
| 116 | `apps/web/src/views/WorkspacePage.tsx` | M | source-config | Farkli | 289 / 5 | [diff](116.diff) |
| 117 | `docs/rebuild/phase-14-notification-platform-plan.md` | M | doc | Ayni | 0 / 0 | - |
| 118 | `docs/rebuild/phase-14-notification-platform-spec.md` | M | doc | Ayni | 0 / 0 | - |
| 119 | `package.json` | M | source-config | Ayni | 0 / 0 | - |
| 120 | `packages/shared/src/communications.ts` | M | source-config | Farkli | 89 / 15 | [diff](120.diff) |
| 121 | `packages/shared/src/employee-hub.ts` | M | source-config | Farkli | 79 / 19 | [diff](121.diff) |
| 122 | `packages/shared/src/index.test.ts` | M | test | Farkli | 819 / 99 | [diff](122.diff) |
| 123 | `packages/shared/src/index.ts` | M | source-config | Farkli | 786 / 114 | [diff](123.diff) |
| 124 | `packages/shared/src/schedule.ts` | M | source-config | Farkli | 1 / 0 | [diff](124.diff) |
| 125 | `pnpm-lock.yaml` | M | source-config | Farkli | 0 / 274 | [diff](125.diff) |
| 126 | `supabase/tests/communication_operations.test.sql` | M | test | Farkli | 97 / 9 | [diff](126.diff) |
| 127 | `supabase/tests/document_types_rls.test.sql` | M | test | Farkli | 15 / 2 | [diff](127.diff) |
| 128 | `supabase/tests/employee_code_counter_resync.test.sql` | M | test | Ayni | 0 / 0 | - |
| 129 | `supabase/tests/employee_directory_rls.test.sql` | M | test | Farkli | 747 / 5 | [diff](129.diff) |
| 130 | `supabase/tests/employee_termination_offboarding.test.sql` | M | test | Farkli | 16 / 3 | [diff](130.diff) |
| 131 | `supabase/tests/organization_basics_rls.test.sql` | M | test | Farkli | 7 / 2 | [diff](131.diff) |
| 132 | `supabase/tests/roles_permissions_rls.test.sql` | M | test | Ayni | 0 / 0 | - |
| 133 | `supabase/tests/scheduling_settings_shift_types_rls.test.sql` | M | test | Ayni | 0 / 0 | - |
| 134 | `supabase/tests/signature_templates_rls.test.sql` | M | test | Ayni | 0 / 0 | - |
| 135 | `supabase/tests/time_corrections_review.test.sql` | M | test | Ayni | 0 / 0 | - |
| 136 | `supabase/tests/workspace_rls.test.sql` | M | test | Farkli | 1383 / 12 | [diff](136.diff) |
| 137 | `vercel.json` | M | source-config | Farkli | 6 / 0 | [diff](137.diff) |
| 138 | `api/index.js` | ?? | source-config | Ayni | 0 / 0 | - |
| 139 | `apps/api/src/account/workspace-account-routes.test.ts` | ?? | test | Farkli | 822 / 1 | [diff](139.diff) |
| 140 | `apps/api/src/account/workspace-account-routes.ts` | ?? | source-config | Farkli | 423 / 7 | [diff](140.diff) |
| 141 | `apps/api/src/account/workspace-account-service.ts` | ?? | source-config | Farkli | 203 / 3 | [diff](141.diff) |
| 142 | `apps/api/src/communications/communication-service.test.ts` | ?? | test | Farkli | 194 / 0 | [diff](142.diff) |
| 143 | `apps/api/src/employees/employee-directory-routes.test.ts` | ?? | test | Farkli | 322 / 7 | [diff](143.diff) |
| 144 | `apps/api/src/employees/employee-directory-routes.ts` | ?? | source-config | Farkli | 239 / 22 | [diff](144.diff) |
| 145 | `apps/api/src/employees/employee-directory-service.ts` | ?? | source-config | Farkli | 88 / 0 | [diff](145.diff) |
| 146 | `apps/api/src/notifications/notification-outbox-migration.test.ts` | ?? | test | Farkli | 19 / 0 | [diff](146.diff) |
| 147 | `apps/api/src/notifications/notification-outbox-routes.ts` | ?? | source-config | Ayni | 0 / 0 | - |
| 148 | `apps/api/src/notifications/notification-outbox-worker.test.ts` | ?? | test | Farkli | 95 / 0 | [diff](148.diff) |
| 149 | `apps/api/src/notifications/notification-outbox-worker.ts` | ?? | source-config | Farkli | 41 / 3 | [diff](149.diff) |
| 150 | `apps/api/src/notifications/notification-settings-routes.test.ts` | ?? | test | Farkli | 215 / 0 | [diff](150.diff) |
| 151 | `apps/api/src/notifications/notification-settings-routes.ts` | ?? | source-config | Farkli | 46 / 23 | [diff](151.diff) |
| 152 | `apps/api/src/notifications/notification-settings-service.test.ts` | ?? | test | Ayni | 0 / 0 | - |
| 153 | `apps/api/src/notifications/notification-settings-service.ts` | ?? | source-config | Ayni | 0 / 0 | - |
| 154 | `apps/api/src/schedule/schedule-publish-notification-permission-migration.test.ts` | ?? | test | Ayni | 0 / 0 | - |
| 155 | `apps/api/src/settings/document-types-routes.test.ts` | ?? | test | Farkli | 107 / 2 | [diff](155.diff) |
| 156 | `apps/api/src/settings/document-types-routes.ts` | ?? | source-config | Farkli | 27 / 24 | [diff](156.diff) |
| 157 | `apps/api/src/settings/document-types-service.ts` | ?? | source-config | Farkli | 1 / 0 | [diff](157.diff) |
| 158 | `apps/api/src/settings/organization-settings-routes.test.ts` | ?? | test | Farkli | 184 / 0 | [diff](158.diff) |
| 159 | `apps/api/src/settings/organization-settings-routes.ts` | ?? | source-config | Farkli | 44 / 32 | [diff](159.diff) |
| 160 | `apps/api/src/settings/organization-settings-service.ts` | ?? | source-config | Farkli | 12 / 21 | [diff](160.diff) |
| 161 | `apps/api/src/settings/roles-routes.test.ts` | ?? | test | Farkli | 95 / 2 | [diff](161.diff) |
| 162 | `apps/api/src/settings/roles-routes.ts` | ?? | source-config | Farkli | 25 / 14 | [diff](162.diff) |
| 163 | `apps/api/src/settings/roles-service.ts` | ?? | source-config | Ayni | 0 / 0 | - |
| 164 | `apps/api/src/settings/signature-settings-routes.test.ts` | ?? | test | Farkli | 259 / 1 | [diff](164.diff) |
| 165 | `apps/api/src/settings/signature-settings-routes.ts` | ?? | source-config | Farkli | 101 / 40 | [diff](165.diff) |
| 166 | `apps/api/src/settings/signature-settings-service.ts` | ?? | source-config | Farkli | 24 / 0 | [diff](166.diff) |
| 167 | `apps/api/src/supabase-function-privileges-migration.test.ts` | ?? | test | Ayni | 0 / 0 | - |
| 168 | `apps/web/src/account/AccountPageHeaderContract.test.ts` | ?? | test | Ayni | 0 / 0 | - |
| 169 | `apps/web/src/account/NotificationPreferencesPage.test.tsx` | ?? | test | Ayni | 0 / 0 | - |
| 170 | `apps/web/src/account/NotificationPreferencesPage.tsx` | ?? | source-config | Ayni | 0 / 0 | - |
| 171 | `apps/web/src/account/WorkspacesPage.test.tsx` | ?? | test | Farkli | 387 / 23 | [diff](171.diff) |
| 172 | `apps/web/src/account/components.tsx` | ?? | source-config | Ayni | 0 / 0 | - |
| 173 | `apps/web/src/account/notification-preferences-data.test.ts` | ?? | test | Ayni | 0 / 0 | - |
| 174 | `apps/web/src/account/notification-preferences-data.ts` | ?? | source-config | Ayni | 0 / 0 | - |
| 175 | `apps/web/src/account/notification-preferences.css` | ?? | source-config | Ayni | 0 / 0 | - |
| 176 | `apps/web/src/auth/ProtectedRoute.test.tsx` | ?? | test | Farkli | 65 / 2 | [diff](176.diff) |
| 177 | `apps/web/src/dev/ScheduleShiftBadgeLabPage.css` | ?? | source-config | Ayni | 0 / 0 | - |
| 178 | `apps/web/src/dev/ScheduleShiftBadgeLabPage.test.tsx` | ?? | test | Ayni | 0 / 0 | - |
| 179 | `apps/web/src/dev/ScheduleShiftBadgeLabPage.tsx` | ?? | source-config | Ayni | 0 / 0 | - |
| 180 | `apps/web/src/dev/scheduleShiftBadgeLabCatalog.ts` | ?? | source-config | Ayni | 0 / 0 | - |
| 181 | `apps/web/src/dev/scheduleShiftBadgeLabRuntime.test.ts` | ?? | test | Ayni | 0 / 0 | - |
| 182 | `apps/web/src/dev/scheduleShiftBadgeLabRuntime.ts` | ?? | source-config | Ayni | 0 / 0 | - |
| 183 | `apps/web/src/settings/NotificationSettingsNavigation.test.tsx` | ?? | test | Farkli | 2 / 2 | [diff](183.diff) |
| 184 | `apps/web/src/settings/NotificationSettingsPage.test.tsx` | ?? | test | Ayni | 0 / 0 | - |
| 185 | `apps/web/src/settings/NotificationSettingsPage.tsx` | ?? | source-config | Ayni | 0 / 0 | - |
| 186 | `apps/web/src/settings/SettingsPageAlignment.test.ts` | ?? | test | Ayni | 0 / 0 | - |
| 187 | `apps/web/src/settings/ShiftLabelsSettingsPage.test.tsx` | ?? | test | Farkli | 4 / 1 | [diff](187.diff) |
| 188 | `apps/web/src/settings/ShiftLabelsSettingsPage.tsx` | ?? | source-config | Farkli | 152 / 184 | [diff](188.diff) |
| 189 | `apps/web/src/settings/notification-settings-data.test.ts` | ?? | test | Ayni | 0 / 0 | - |
| 190 | `apps/web/src/settings/notification-settings-data.ts` | ?? | source-config | Ayni | 0 / 0 | - |
| 191 | `apps/web/src/settings/notification-settings.css` | ?? | source-config | Ayni | 0 / 0 | - |
| 192 | `apps/web/src/shell/AppShellNotificationBadge.test.tsx` | ?? | test | Farkli | 264 / 27 | [diff](192.diff) |
| 193 | `apps/web/src/views/MainNavigationHeaderContract.test.ts` | ?? | test | Ayni | 0 / 0 | - |
| 194 | `apps/web/src/views/OwnerOnboardingPage.test.tsx` | ?? | test | Farkli | 345 / 37 | [diff](194.diff) |
| 195 | `docs/adr/0014-notification-policy-and-catalog.md` | ?? | doc | Ayni | 0 / 0 | - |
| 196 | `docs/rebuild/onboarding-reference-audit-spec-inventory-roadmap-2026-09-04.md` | ?? | doc | Ayni | 0 / 0 | - |
| 197 | `docs/rebuild/phase-14-notification-producer-inventory.md` | ?? | doc | Ayni | 0 / 0 | - |
| 198 | `docs/rebuild/schedule-badge-interaction-spec-and-inventory.md` | ?? | doc | Ayni | 0 / 0 | - |
| 199 | `docs/rebuild/schedule-grid-visual-audit-master-plan-2026-09-03.md` | ?? | doc | Ayni | 0 / 0 | - |
| 200 | `docs/runbooks/notification-platform-core-migration.md` | ?? | doc | Ayni | 0 / 0 | - |
| 201 | `packages/shared/src/notification-catalog.test.ts` | ?? | test | Farkli | 19 / 11 | [diff](201.diff) |
| 202 | `packages/shared/src/notification-catalog.ts` | ?? | source-config | Farkli | 127 / 0 | [diff](202.diff) |
| 203 | `packages/shared/src/notification-display.ts` | ?? | source-config | Farkli | 71 / 13 | [diff](203.diff) |
| 204 | `packages/shared/src/notification-settings.test.ts` | ?? | test | Farkli | 53 / 0 | [diff](204.diff) |
| 205 | `packages/shared/src/notification-settings.ts` | ?? | source-config | Farkli | 3 / 2 | [diff](205.diff) |
| 206 | `supabase/migrations/20260904013415_grant_service_role_scheduling_settings_read.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 207 | `supabase/migrations/20260908105000_restore_schedule_publish_notification_actor_binding.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 208 | `supabase/migrations/20260908110000_notification_platform_core.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 209 | `supabase/migrations/20260908111000_qualify_notification_inbox_actor.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 210 | `supabase/migrations/20260908112000_notification_outbox_relay.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 211 | `supabase/migrations/20260908113000_notification_outbox_payload_validation.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 212 | `supabase/migrations/20260908114000_notification_in_app_policy_resolver.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 213 | `supabase/migrations/20260908115000_notification_legacy_inbox_bridge.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 214 | `supabase/migrations/20260908120000_notification_policy_resolver_v1.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 215 | `supabase/migrations/20260908121000_notification_request_producers_v1.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 216 | `supabase/migrations/20260908122000_notification_announcement_producer_v1.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 217 | `supabase/migrations/20260908123000_notification_time_correction_producers_v1.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 218 | `supabase/migrations/20260908124000_notification_reconciliation_v1.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 219 | `supabase/migrations/20260908125000_notification_relay_schedule_compat.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 220 | `supabase/migrations/20260908126000_notification_announcement_lifecycle_sync.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 221 | `supabase/migrations/20260908130000_notification_settings_admin.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 222 | `supabase/migrations/20260908131000_notification_user_preferences_api.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 223 | `supabase/migrations/20260908132000_harden_public_function_execute_privileges.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 224 | `supabase/migrations/20260908133000_move_rls_helpers_to_private_schema.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 225 | `supabase/migrations/20260908134000_schedule_shift_label_management.sql` | ?? | migration | Ayni | 0 / 0 | - |
| 226 | `supabase/tests/function_execute_privileges.test.sql` | ?? | test | Ayni | 0 / 0 | - |
| 227 | `supabase/tests/notification_outbox_relay.test.sql` | ?? | test | Farkli | 40 / 1 | [diff](227.diff) |
| 228 | `supabase/tests/notification_platform_core.test.sql` | ?? | test | Farkli | 2 / 2 | [diff](228.diff) |
| 229 | `supabase/tests/notification_preference_resolver_and_producers.test.sql` | ?? | test | Farkli | 3 / 3 | [diff](229.diff) |
| 230 | `supabase/tests/notification_schedule_publish_atomic.test.sql` | ?? | test | Ayni | 0 / 0 | - |
| 231 | `supabase/tests/notification_settings_admin.test.sql` | ?? | test | Farkli | 2 / 2 | [diff](231.diff) |
| 232 | `supabase/tests/notification_user_preferences.test.sql` | ?? | test | Ayni | 0 / 0 | - |
| 233 | `supabase/tests/schedule_publish_notifications.test.sql` | ?? | test | Ayni | 0 / 0 | - |
