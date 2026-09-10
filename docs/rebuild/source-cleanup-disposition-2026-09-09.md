# Kaynak Temizligi: Davranis ve Tarih Karsilastirmasi

Is ve guncel durum sahibi: [WORK BL-029](../project/WORK.md). Bu belge teknik karar kanitidir, ikinci ilerleme gunlugu degildir. Baslangic: `c830e03`, ana checkout `newfork-clean`. Yalniz C02'de onaylanan kaynak/test/event silindi; diger adaylar ve worktree'ler korunuyor.

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
- Karar bekleyen konu: kullanici birden fazla taslagi tek islemde yayinlama davranisini gercekten istiyor mu? Istiyorsa eski onay parcasini dogrudan baglamak yeterli olmaz; mevcut preflight ve yetki sozlesmesine uyan ayri dar implementasyon gerekir. Yanita kadar dosya korunur.

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
- Bu davranis farki onemsiz wrapper diye silinemez. Kullaniciya somut senaryoyla sunulacak; yeniden yukleme yeterli mi, yoksa kaydedilmemis alanlar gorunur kalmali mi? Karara kadar eski drawer kumesi korunur. Mevcut editorun bellek icindeki state'ini kaybettigi iddiasi yok; fark gorunurluk/kurtarma UX'idir.
