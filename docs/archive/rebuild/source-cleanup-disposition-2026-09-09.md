# Kaynak Temizligi: Davranis ve Tarih Karsilastirmasi

Is ve guncel durum sahibi: [WORK BL-029](../project/WORK.md). Bu belge teknik karar kanitidir, ikinci ilerleme gunlugu degildir. Baslangic: `c830e03`, ana checkout `newfork-clean`.

## Son Kullanici Karari ve Kapanis

Kullanici localhost:5555'te gordugu guncel uygulamayi esas aldi ve davranisi degistirmeyen baglantisiz dosyalarin dogrudan silinmesini istedi. Eski parcalardaki ek davranislari yeniden baglama isi acilmadi. Asagidaki ilk inceleme sorulari bu karar ile kapandi; acik onay beklenmiyor.

- 34 ilk aday: 6 gercek giris/public paket dosyasi korunur; 28 baglantisiz kaynak ve yalniz bunlari test eden 12 test silindi. C02'nin 3 dosyasi `887de50` commit'inde, kalan 37 dosya bu raporun kapanis commit'inde.
- Vite dinleyici process zinciri ana checkout'un web paketini gosterdi. Calisan dev server durdurulmadi veya yeniden baslatilmadi.
- Statik graf: erisilen 326 runtime/public-entry kaynak dosyasi degismedi; baglantisiz aday 0, cozumlenemeyen yerel import 0. Aktif kaynaklarda davranis degisikligi veya yeni ozellik baglantisi yok.
- `pnpm.cmd --filter @newfork/web exec vite build`: PASS, 2306 modul, 9.92 saniye. Bu yalniz Vite paketleme kaniti; tam build script'i veya release kabul degil.
- `pnpm.cmd --filter @newfork/web typecheck`: FAIL, dokunulmayan bes dosyada alti tani: EmployeeDrawer.test:665, ImportantDatesSettingsPage:177, JobCatalogEditor:132 (iki tani), JobsManagement.test:122, OwnerOnboardingPage.test:167. EmployeeDrawer.test daha onceki dort-dosya handoff listesinde yoktu; BL-026 kapsam bilgisi guncellendi. Urun/DB test paketleri yeniden calistirilmadi.
- 13 eski detached worktree'nin hepsi ayni `415b15f` commit'indeydi ve bu commit ana dalin atasi. 12 kopya temiz; 4dfb'nin 233 dirty dosyasi mevcut ZIP arsiviyle SHA-256 bazinda birebir dogrulandi. Her worktree'nin tek ignored dosyasi olan environment.toml da ayri yerel ZIP'e alinip birebir dogrulandi. Listelenen task'larda bu kopyalari kullanan aktif task ve process komutlarinda bu yollara referans bulunmadi.
- 13 worktree `git worktree remove` ile kaldirildi. Son Git envanteri: yalniz ana checkout, yalniz `codex/phase-1-foundation` yerel dali, stash 0. Yerelde `main` dali yok; uzak referanslar degistirilmedi, fetch/push yapilmadi. Eski Newfork referans reposuna dokunulmadi.
- Worktree'leri tasiyan 13 bos ust klasor Git disinda kaldi. Bos klasor silme komutu arac politikasi tarafindan engellendi; baska yolla asilmadi. Iclerinde dosya yok, Git worktree kaydi veya uygulama etkisi yok.
- Yerel kurtarma: `artifacts/repo-checkpoint/worktree-4dfb-preserved-20260909.zip`, `worktree-configs-20260909.zip`, `worktree-removal-20260909.json`. Bunlar ignored ve hassas veri icerebilir; commit edilmez/paylasilmaz. Eski kaynaklar Git gecmisinde de korunur; object/reflog prune yapilmadi.

## Silinen Kaynak Gruplari

Tum yollar `apps/web/src` altindadir. Her grupta yalniz silinen modulleri import eden testler de kaldirildi; aktif modul testleri korunur.

| Kaynak grubu | Silinen kaynaklar | Korunan aktif karsilik / gerekce |
|---|---|---|
| Yan menu takvimi | shell/MiniCalendar; schedule/sidebarCalendarEvents | Kullanici kaldirmisti; ScheduleTopBar ve schedule/components/MiniCalendar korunur. |
| Yol/type adaptoru | schedule/LineupPage; api; types; components/ShiftTypePresetDragPreview; components/drawer/FormView | Gercek LineupPage, schedule-data/shared type'lar, ShiftDragPreview ve ShiftQuickEditor dogrudan kullaniliyor. |
| Yayinlama adaptoru/denemesi | components/PublishWizardDialog; BulkPublishPopover | Aktif PublishScheduleDialog ve preflight/bildirim akisi korunur. Baglantisiz toplu-taslak UI'i yeniden acilmaz. |
| Eski drawer grubu | components/ShiftDrawer; drawer/StaleBlockedView; drawer/VanishedView; state/drawerMachine | Aktif ShiftQuickEditor degismez; kullanici mevcut davranisi esas aldi. |
| Draft/edit/cache adaptoru | cache; hooks/useDraftMutations; useEditSessionActions; useShiftMutations; useEditLock; components/WorkingCopyBanner | SchedulePage'in dogrudan kullandigi schedule-data, draftSaveFlow, realtime, kilit/heartbeat, save/discard ve atomik shift komutlari korunur. Takeover API/service kodu da korunur; yeni UI eklenmez. |
| Olcum adaptoru | hooks/useSynchronizedRowBadgeHeight; useUniformBadgeWidth | Aktif useScheduleBadgeMeasurements ve gercek davranis testleri korunur. Silinen testler yalniz eski wrapper kontratini kontrol ediyordu. |
| Eski surukleme yardimcilari | components/employeeDragGhost; lib/employeeDragScroll | Hic cagrilmayan HTML drag/scroll yardimcilari; mevcut pointer drag controller/preview'ler korunur. |
| Eski cakisma hesabi | lib/shiftOccupancy | Aktif schedule-conflicts: explicit ve type-default saatler, availability ve named-duplicate kontrolleri korunur. |
| Eski undo/export projeksiyonu | undo/shiftUndoCommands; lib/scheduleExportRenderModel | Mevcut SchedulePage snapshot undo ve gercek export panel/API/preview/download akisi korunur. Baglantisiz komut/projeksiyon nesneleri yeniden baglanmaz. |
| Bos fixture/debug | data/mockData; lib/scheduleDebug | Hicbir giris/tuketiciye bagli olmayan bos model ve sayac; public preview girisleri korunur. |

## Tarih Kanitinin Siniri

- Ortak eski Git tabani `415b15f`: 2026-09-02. Ana checkout'un toplu WIP checkpoint'i `711da48`: 2026-09-09. Checkpoint tarihi her satirin yazilma tarihi degildir.
- Eski 4dfb worktree'deki asagidaki dosyalarin LastWriteTime degerleri 2026-09-04 02:44-02:45 araliginda toplanmis. Bu kopyalama/checkout izi olabilir; daha yeni urun karari oldugu sonucunu vermez.
- Ornek: degismemis BulkPublishPopover dosyasinin ana checkout dosya zamani 2026-09-01, eski worktree dosya zamani 2026-09-04. Git gecmisi yalniz 2026-09-02 eklenmesini gosteriyor. Salt dosya zamaniyla eski worktree'yi daha yeni saymak yanlis olur.
- PublishScheduleDialog ve ShiftQuickEditor hem 2026-09-02 commit'inde var hem 2026-09-09 checkpoint'inde degismis; ana dosya zamanlari 2026-09-08. Bu sonrasinda gelisen kod icin destekleyici ipucudur, tek basina davranis kaniti degildir.

## Grafik Duzeltmesi

Ilk 34 aday listesindeki 6 dosya public paket/HTML girislerinin eksik sayilmasindan kaynaklandi: `packages/ui/src` altindaki dort dosya ile WeeklyPreferencesForm ve PublishReturn preview dosyalari korunur. Duzenlenmis grafik 28 aday ve cozumlenemeyen yerel import 0 gosteriyor. Grafik tek basina silme izni degildir.

Iki MiniCalendar farklidir: `shell/MiniCalendar.tsx` kullanilmayan adaydir; ScheduleTopBar `schedule/components/MiniCalendar.tsx` kullanir. Ayni dosya sanilmamalidir.

## Kullaniciya Somut Davranis Ornekleri

### C01: Birden Fazla Taslagi Tek Seferde Yayinlama

- Eski parca: `apps/web/src/schedule/components/BulkPublishPopover.tsx`. 2026-09-02 Git eklenmesi; sonradan kaynak degisikligi yok. Taslak sayisi ve lokasyon dagilimi gosterip tek onay alir.
- Bu tam calisan toplu yayinlama ozelligi kaniti degildir: component yalniz disaridan verilen onConfirm'i cagirir. Runtime tuketicisi yok; yalniz kendi testi var.
- Guncel akis: `apps/web/src/schedule/components/PublishScheduleDialog.tsx`, SchedulePage tarafindan cagrilir. Tek taslak icin lokasyon/departman secimi, preflight ve calisan bildirimi asamalari var. Bir taslagin birden fazla lokasyonunu yayinlamak, birden fazla taslagi topluca yayinlamakla ayni sey degildir.
- Ilk sorulan konu birden fazla taslagi tek islemde yayinlama niyetiydi. Son karar: mevcut uygulama korunacak; baglantisiz onay parcasi silindi, toplu-taslak ozelligi acilmadi.

### C02: Eski Yan Menu Takvimi

- Eski `apps/web/src/shell/MiniCalendar.tsx`: Git'te 2026-08-18'den beri var; 2026-09-09 checkpoint'inde degismis. Gun/hafta secimi ve tek tarih isaretleri sunuyor; runtime kullanicisi yok.
- Aktif `apps/web/src/schedule/components/MiniCalendar.tsx`: Git'te 2026-09-02'den beri var. ScheduleTopBar'dan kullaniliyor; ay/yil secimi, klavye gezinmesi, tarih araligi ve yillik tekrar isaretleri de destekleniyor.
- `jobs-settings-ui-spec.md` yan menu takviminin kaldirilmasini, ust cubuk takviminin korunmasini kaydediyor. Bu nedenle eski takvimi silmek tum takvim ozelligini kaldirmak anlamina gelmez. Aktif olan daha kapsamli; onu koru.
- Kullanici sesli gorusmede yan menu takviminin kaldirilmasinin kendi karari oldugunu acikca dogruladi. C02 karari kapali: eski yan menu takvimi geri getirilmeyecek, baglantisiz kaynak ve yalniz ona ait test/event temizlenebilir; aktif ust cubuk takvimi korunur.
- Uygulama: shell/MiniCalendar.tsx, yalniz onu test eden shell/MiniCalendar.test.tsx ve hic cagrilmayan schedule/sidebarCalendarEvents.ts silindi. Aktif takvim, testi, ust cubuk ve ortak stiller degistirilmedi. Silme oncesi kaynak referanslari ve duzeltilmis import grafigi kontrol edildi.

### C03: Eski Yayinlama Adi ve Veri Adaptoru

- `apps/web/src/schedule/components/PublishWizardDialog.tsx`, eski org/workspace ve model alanlarini normalize edip mevcut PublishScheduleDialog'u acar. Kendine ait ayri bir yayinlama moturu yok; runtime tuketicisi yok.
- Guncel sayfa aktif PublishScheduleDialog'u dogrudan kullaniyor. Eski wrapper'in silinmesi yayinlama sihirbazinin silinmesi degildir; asil uc asamali akis korunur.
- Bu, yeni kodda ozelligin kaybolmasindan ziyade ayni ozellige giden eski arayuzun geride kalmasi ornegidir. Silme manifesti ve gerekli test baglantisi incelemesi BL-029 kapanisinda kaydedilecek.

### C04: Eszamanli Vardiya Duzenlemesinde Taslagi Gorebilme

- Eski ShiftDrawer, StaleBlockedView ve VanishedView: baska kullanici vardiyayi degistirdiginde kendi taslagindaki tarih/saat/notlari gosterme; vardiya silindiginde son girilen alanlari okuyup elle kopyalama UI'i var. Bunlar runtime'a bagli degil. StaleBlockedView sunucu karsilastirmasini opsiyonel host.latestShift ile bekliyor fakat ShiftDrawer bu host'u vermiyor; tam calisan iki-surum karsilastirmasi oldugu iddia edilemez.
- Aktif ShiftQuickEditor: stale sonucunda form yerine Shift changed uyarisi ve Close & reload gosteriyor. Bu gorunumde kullanicinin taslak alanlari gosterilmiyor. SchedulePage aktif editoru dogrudan kullaniyor.
- Bu davranis farki kullaniciya bildirildi. Son karar mevcut uygulamanin davranisini esas aldigi icin baglantisiz eski drawer kumesi silindi; mevcut editore taslak karsilastirma UX'i eklenmedi. Mevcut editorun bellek icindeki state'ini kaybettigi iddiasi yok; fark gorunurluk/kurtarma UX'idir.
