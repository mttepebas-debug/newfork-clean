<!-- EKRAN-01 Schedule keşfi, parça D (genel ajan, opus, salt okuma), main 06a74d5a, 2026-10-05. Ajanın raporu olduğu gibi. -->

# EKRAN-SCHEDULE keşfi, parça D: kod ve davranış denetimi

**Nerede duruyor:** Bitti. Salt okuma yaptım: dosya değişmedi, commit yok, branch değişmedi. Yerel veritabanında yalnız SELECT ve `pg_get_functiondef` (fonksiyonun güncel tanımını okuyan sorgu) koştum. Fonksiyon dökümleri repo dışında, `%TEMP%`'te. Kod main `06a74d5a`, okuma tarihi 2026-10-05. Skill açmadım: iş salt okuma kod okumasıydı, sonucu değiştirecek bir skill yoktu.

**Kısaca:** 5 yüksek, 9 orta, 6 düşük bulgu. Bunların 15'i backlog'da yok. En ağırları: hareketsizlikte kaydedilmemiş işin habersiz silinmesi, Undo'nun sunucuda hiçbir şeyi geri almaması ve iki yöneticinin kaydedilmemiş değişikliklerinin birbirinin ızgarasına binmesi.

---

## Yüksek

**Y1. Undo yalnız ekranda geri alıyor, sunucudaki değişiklik duruyor**
- **Ne oluyor:** Ayşe Ali'nin Salı vardiyasını Çarşamba'ya sürükler, sonra Undo'ya basar. Vardiya Salı'ya döner, "Last edit undone" yazar. Sunucudaki düzenleme oturumu ise hâlâ Çarşamba'dadır.
  - En geç 60 saniye sonra "kalp atışı" (oturumu canlı tutan dakikalık istek) sunucunun hâlini ekrana geri yazar. Vardiya sessizce Çarşamba'ya atlar.
  - Ayşe bu arada bir değişiklik yapar ya da kaydederse işlem "session revision stale" ile düşer.
  - Şablon uygulama, Auto-fill ve "Review default hours" da aynı Undo'yu kullanıyor.
- **Nerede:** `SchedulePage.tsx:1607-1616` (Undo yalnız ekrandaki durumu değiştiriyor). Undo için saklanan kopyalar `:400-411`, `:1466`, `:3411`, `:3430`, `:3442`. Kalp atışı `:768-778` (`.then(setSession)`).
- **Kanıt:** Kod yolu, artı sunucu fonksiyonları: `mutate_schedule_edit_shift_service` ve `save_schedule_edit_session_service` eski revizyonu "session revision stale" ile reddediyor. Tek test (`App.test.tsx:4251-4254`) yalnız bildirimin çıktığına bakıyor.
- **BL:** YENİ · **Düzeltme yeri:** web (gerekirse API)
- **İşaret:** `leave: high / do: moderate`
- **Ürün sorusu:** Undo sunucuda gerçekten geri alsın mı (ILKELER P02'ye göre önerilen bu), yoksa düğme kalksın mı?

**Y2. 20 dakika hareketsiz kalınca kaydedilmemiş iş habersiz siliniyor**
- **Ne oluyor:** Ayşe 12 vardiya yazar, kaydetmeden 20 dakika masadan kalkar. Döndüğünde ekran görünüm modundadır, 12 vardiya yoktur, hiçbir mesaj yoktur.
  - Uyarı penceresi ("Keep editing? No activity for 15 minutes.") işin silineceğini söylemiyor.
  - Açık vardiya penceresinde yazılanlar da gidiyor.
  - Ayşe düzenlerken başka haftaya geçmişse zamanlayıcı yine çalışıyor ve geride kalan haftanın işini siliyor.
- **Sunucunun kendi tasarımına ters:** Sunucu süresi dolan kaydedilmemiş oturumu ya bir kurtarma taslağına çeviriyor ya da aynı kişi dönünce kaldığı yerden sürdürüyor (KARARLAR DATA-04, BL-069). Ekran ise bu yolları atlayıp oturumu siliyor.
- **Nerede:** `SchedulePage.tsx:783-798`, `useEditIdleTimer.ts:3-4`. Silen fonksiyon `discard_schedule_edit_session_service`: oturumun vardiyalarını siliyor ve oturumu "discarded" yapıyor.
- **Kanıt:** Kod yolu ve fonksiyon gövdesi. Sayfa düzeyinde zaman aşımını sınayan test yok, yalnız zamanlayıcının kendi testi var.
- **BL:** YENİ. BL-607 kapandı ama yalnız SAVE düğmesini düzeltti. · **Düzeltme yeri:** web
- **İşaret:** `leave: high / do: moderate`
- **Ürün sorusu:** Süre dolunca ne olsun? (a) Kendiliğinden bir kurtarma taslağı oluşsun (önerilen; ILKELER P09). (b) Oturum dursun, kişi dönünce sürsün. (c) Silinsin ama pencere bunu açıkça söylesin.

**Y3. Düzenleme kilidi uyarı penceresinin son 1–2 dakikasında zaten düşmüş oluyor ve ekran bunu toparlamıyor**
- **Ne oluyor:** Kalp atışı son hareketten 15 dakika sonra duruyor (`SchedulePage.tsx:772`). Sunucunun düzenleme kilidi 4 dakikada bitiyor. Yani kilit 18.–19. dakikada düşüyor, pencere ise 20. dakikaya kadar geri sayıyor.
  - Son 1–2 dakikada SAVE'e basmak "edit lease expired" hatası veriyor.
  - CONTINUE'ya basınca bir sonraki kalp atışı düşüyor. Ekranın üstünde ham "edit lease expired" yazısı çıkıyor ve her işlem aynı hatayla düşüyor.
  - Dizüstü bilgisayar 4 dakikadan uzun uykuya girince de aynısı oluyor.
  - Kurtarma penceresinde Retry ve "Keep editing" yine düşüyor. Çalışan tek çıkış Discard, o da işi siliyor.
- **Neden gereksiz:** Aynı kişi düzenlemeyi yeniden açarsa sunucu oturumu sürdürüyor; o yolda süre kontrolü yok. Ekran bu yolu kullanmıyor.
- **Nerede:** `SchedulePage.tsx:768-778` ve `:1455-1482`. Veritabanında kalp atışı fonksiyonu yalnız süresi dolmamış oturumu yeniliyor; 4 dakikalık süreyi kalp atışı ve vardiya kayıt fonksiyonu yazıyor.
- **BL:** YENİ · **Düzeltme yeri:** web
- **İşaret:** `leave: high / do: moderate`

**Y4. Sayfa yenilenince ya da düzenlerken başka haftaya geçince taslak boş görünüyor**
- **Ne oluyor:** Ayşe "Week 42 plan"ı düzenlerken F5'e basar. Izgara bomboştur, düzenleme şeridi yoktur, menüde taslağın adı yazar, Publish düğmesi açıktır.
  - İş sunucuda duruyor; New Schedule ▾ → Edit ile geri geliyor. Ama ekran taslağı boş gösteriyor.
- **Neden:** Adreste `mode=edit&draft=…` kalıyor, oturum ise bellekte yok. Önizleme "düzenleniyor" sandığı için taslağı hiç yüklemiyor. Açılışta oturumu sürdüren bir kod yok.
- **Nerede:** `SchedulePage.tsx:643-648` ve `:661-665`, `usePreviewSource.ts:24`.
- **Kanıt:** Kod yolu. E2E testlerinde düzenleme modunda yenileme yok.
- **BL:** YENİ · **Düzeltme yeri:** web
- **İşaret:** `leave: high / do: safe`

**Y5. Aynı yayındaki haftayı iki yönetici düzenlerken birinin kaydedilmemiş değişikliği ötekinin ızgarasına biniyor**
- **Ne oluyor:** Owner Mert ve Kadıköy müdürü Ayşe aynı anda "Edit published schedule" açar. Tasarım buna izin veriyor (bkz. `schedule-locks` e2e testi).
  - Mert Ali'nin Salı vardiyasını Çarşamba'ya taşır, kaydetmez. Ayşe'nin ızgarasında da vardiya canlı olarak Çarşamba'ya atlar; Ayşe'nin sunucudaki oturumunda ise Salı'dır.
  - Ayşe yayınlarsa Salı yayınlanır, oysa ekranda Çarşamba görmüştü.
  - Ayşe o vardiyayı açıp düzenlerse Mert'in değerleri Ayşe'nin taslağına yazılır.
  - Ayşe hiçbir şey yapmadan Discard'a bassa bile "kaydedilmemiş değişiklik var" diye sorulur.
- **Neden:** "Bekleyen değişiklikler" listesi (yayındaki vardiyalarda yapılmış, henüz kaydedilmemiş değişiklikler), taslak kimliği yokken haftadaki bütün açık oturumları sahibine bakmadan döndürüyor. Web bunları kendi oturumunun üstüne uyguluyor.
- **Nerede:** `list_schedule_pending_ops_service` (oturum sahibine göre süzgeç yok), `schedule-routes.ts:1323-1350`, `SchedulePage.tsx:616-622`, `:657-665`, `:740`, `useEffectiveShifts.ts:113-151`. Canlı yenileme `useScheduleRealtime.ts:65-69`.
- **Kanıt:** Kod yolu, fonksiyon gövdesi ve tablo anahtarı (iki oturum aynı yayın vardiyasını kopyalayabiliyor). İki tarayıcıyla denemedim.
- **BL:** YENİ. Aynı katmanın ölü parçaları BL-168'de. · **Düzeltme yeri:** veritabanı (yalnız kendi oturumu) + web
- **İşaret:** `leave: high / do: moderate`
- **Güvenlik ajanına not:** Görülen veri kişinin kendi yetki kapsamında, sızıntı sayılmaz. Ama başkasının kaydedilmemiş işi görünüyor.

## Orta

**O1. Yayındaki haftayı düzenlerken yeni eklenen vardiya "Live - published to employees" yazıyor**
- **Ne oluyor:** Ayşe Cuma'ya Ali için yeni vardiya ekler. Kartta hemen yeşil tik ve "Live - published to employees" çıkar; sağ tık menüsünde Delete yerine "Unpublish shift" vardır. Silerse kart "Staged for removal" olur ve Restore seçeneği çıkar.
- **Neden:** `mark_schedule_edit_session_shift_source` tetikleyicisi, yayından açılan oturuma eklenen her satırı yayın kopyası diye işaretliyor. Şablon, Auto-fill ve yapıştırma da bundan etkileniyor.
- **Nerede:** `20260905100000_schedule_live_shift_state.sql:11-37`, `ShiftCard.tsx:389-405`, `ScheduleContextMenu.tsx:114-141`.
- **Etki:** Kaydedilen sonuç doğru çıkıyor, ekrandaki bilgi yanlış (ILKELER P11).
- **BL:** YENİ · **Düzeltme yeri:** veritabanı · `leave: medium / do: moderate`

**O2. Şablon uygulanınca vardiyaların molası sıfırlanıyor, uyarı yok**
- **Ne oluyor:** 30 dakika molalı vardiyalar şablon olarak kaydedilip uygulanınca molaları 0 olur. Haftalık saat toplamları vardiya başına yarım saat şişer.
- **Neden:** Şablon vardiya tablosunda `unpaid_break_minutes` (ücretsiz mola) sütunu yok. Kaydeden ve uygulayan iki fonksiyon da bu alanı yazmıyor.
- **Neden önemli:** Mola, vardiya penceresinde seçilebiliyor (`ShiftQuickEditor.tsx:959-971`) ve saat toplamına giriyor (`scheduleHourTotals.ts:19-20`). KARARLAR → Schedule: şablon uygulanırken düşen ya da değişen veri için kullanıcı uyarılır.
- **Kanıt:** Sütunları SELECT ile okudum, iki fonksiyonun gövdesini inceledim.
- **BL:** YENİ · **Düzeltme yeri:** veritabanı + shared · `leave: medium / do: moderate`

**O3. Şablondaki atanmış vardiya açık vardiyaya döndüğünde kişiye söylenmiyor**
- **Ne oluyor:** Şablonda Salı Kadıköy vardiyası Ali'ye atanmış, ama Ali artık Kadıköy'de değil. Şablon uygulanınca vardiya atanmamış (Unassigned) satırına düşer; mesaj yalnız "Standard week: 24 shifts added." der.
- **Neden:** Sunucu dönüştürülen vardiya sayısını (`converted_open_count`) gönderiyor, web okumuyor.
- **Nerede:** `templateApplyMessage.ts:26-38`, `SchedulePage.tsx:3399-3410`.
- **Kanıt:** Kod okuması; web'de bu alanın hiç okunmadığını aramayla doğruladım. Bunu sınayan bir test de yok.
- **BL:** YENİ · **Düzeltme yeri:** web · `leave: medium / do: safe`

**O4. Şablonun "Overwrite" düğmesi tek tıkla çalışıyor ve haftanın bütün lokasyonlarını siliyor**
- **Ne oluyor:** Admin Zeynep Kadıköy ve Beşiktaş haftasını düzenlerken yalnız Kadıköy içeren bir şablonu Overwrite ile uygular. Beşiktaş'ın taslak vardiyaları da silinir; silme lokasyona değil yalnız departmana bakıyor.
  - Düğme tek tık; KARARLAR UI-12'ye göre üstüne yazma iki tık olmalı.
  - Geri almanın yolu Undo, o da bozuk (Y1).
- **Nerede:** `ScheduleTemplateDialogs.tsx:121` ve `:226-243`; şablon uygulama fonksiyonunun silme adımı. Mevcut test (`ScheduleTemplateDialogs.test.tsx:184-216`) tek tık davranışını kilitliyor.
- **BL:** YENİ · **Düzeltme yeri:** web; lokasyonla sınırlama veritabanında
- **Ürün sorusu:** Overwrite yalnız şablonun kendi lokasyonlarını mı temizlesin?
- `leave: medium / do: safe`

**O5. KARARLAR'daki "Save as template taslak ekranında da var" kararı uygulanmamış**
- **Ne oluyor:** New Schedule ▾ menüsünde şablon bölümünün kodu yazılmış (`DraftDropdownMenu.tsx:361`), ama sayfa bu bölümün ihtiyaç duyduğu bilgileri hiç geçmiyor (`SchedulePage.tsx:2310-2363`). Bölüm hiç çizilmiyor; bugün şablon yalnız Templates penceresinden oluşturulabiliyor.
- **BL:** YENİ · **Düzeltme yeri:** web · `leave: medium / do: safe`

**O6. Başkası düzenlerken taslak silinebiliyor ve düzenleyenin kaydı hep düşüyor**
- **Ne oluyor:** Ayşe "Plan A"yı düzenlerken (kilit onda) Zeynep menüden "Plan A"yı siler. Ayşe'nin her kaydı ham "draft revision stale" hatasıyla düşer, Retry de hep düşer.
- **Neden:** Taslak silme fonksiyonu açık bir düzenleme oturumu olup olmadığına bakmıyor; kaydetme fonksiyonu ise silinmiş taslağa yazmayı reddediyor.
- **Nerede:** `delete_schedule_draft_service`, `SchedulePage.tsx:956-976`.
- **Kanıt:** Fonksiyon gövdeleri; ekranda denemedim.
- **BL:** YENİ · **Düzeltme yeri:** veritabanı · `leave: medium / do: moderate`

**O7. Ekrana ham teknik hata metni çıkan yerler BL-395'in saydığından çok daha fazla**
- **Ne oluyor:** BL-395 menülerdeki altı yeri sayıyor. Ham metin ayrıca şuralardan da çıkıyor:
  - her vardiya değişikliği (`SchedulePage.tsx:1475`, bildirim `:1478`, ör. "session revision stale.")
  - kalp atışı (`:775`), Discard temizliği (`:1263`), logo yükleme (`:3463`)
  - Publish penceresi (`PublishScheduleDialog.tsx:380`, `:427`, `:511`, `:523`, `:785`)
  - Unpublish penceresi (`UnpublishScheduleDialog.tsx:70`)
  - sürükle-bırak bildirimi (`useScheduleDropReview.ts:136-139`) ve kayıt hatası yedek mesajı (`draftSaveFlow.ts:155`)
- **Ek:** Sunucu JSON yerine hata sayfası dönerse (ör. 502) kullanıcı "Unexpected token <" görür (`schedule-data.ts:858`). Bayat oturum hatası İngilizce metne bakılarak tanınıyor (`SchedulePage.tsx:3620-3622`); API'nin kendi kuralı metne bakmamayı söylüyor.
- **BL:** BL-395 değişmiş, kapsamı genişliyor. Her düzenlemeyi etkilediği için önemini low'dan medium'a çekmeyi öneriyorum.
- **Düzeltme yeri:** web · `leave: medium / do: safe`

**O8. "Delete selected shifts?" penceresinde Enter her zaman siliyor**
- **Ne oluyor:** Ayşe vazgeçmek için Tab ile "Keep shifts" düğmesine gelip Enter'a basar; vardiyalar silinir. Pencere Enter'ı sayfa düzeyinde yakalıyor ve odağı kendine almıyor.
- **Nerede:** `SchedulePage.tsx:3503-3516`.
- **BL:** `BACKLOG.md:123`'teki numarasız maddeyle birlikte ele alınmalı (o madde pencerenin ortak onay penceresine taşınmasını istiyor). Enter davranışının kendisi YENİ.
- **Düzeltme yeri:** web · `leave: medium / do: safe`

**O9. Kurtarma taslağı sessizce ve teknik bir adla oluşuyor; açılan taslak istenen taslak olmayabiliyor**
- **Kurtarma taslağı:** Ayşe'nin kilidi düşmüş, kaydedilmemiş oturumu dururken Zeynep aynı taslağı açarsa Ayşe'nin işi "Recovered edit 2026-10-05 21:14:07 3f9a" gibi adlı yeni bir taslağa çevriliyor (saat UTC, sondaki dört harf oturum kimliğinden). Web bu durumu hiç okumuyor; Ayşe de Zeynep de bilgilendirilmiyor.
- **Yanlış taslak:** Aynı kişinin o haftada açık bir oturumu varken başka bir taslağı açmak istemesi eski oturumu sürdürüyor; istenen taslak açılmıyor ve ekran bunu söylemiyor.
- **Nerede:** Düzenleme başlatan veritabanı fonksiyonu (`acquire_schedule_edit_session_service`), `SchedulePage.tsx:1194-1225`.
- **BL:** YENİ · **Düzeltme yeri:** web (+ veritabanında ad) · `leave: medium / do: safe`

## Düşük

- **D1. Taslağı başka bir taslağın üstüne kaydetmenin iki yolu iki farklı çalışıyor.** Publish ▾ menüsünde iki tık (`SaveDraftMenu.tsx:378-388`). Save draft penceresinde listeden "Overwrite <ad>" seçilince tek tık (`SaveDraftDialog.tsx:44-50`, `:74`). KARARLAR UI-12. · YENİ · web · `leave: low / do: safe`
- **D2. Auto-fill mesajında tekil/çoğul hatası:** "3 auto-fill assignment could not be applied." (`SchedulePage.tsx:3444-3447`). · YENİ · `leave: low / do: safe`
- **D3. "Someone is editing this schedule" uyarısı yalnız tek lokasyonu izliyor.** İzlenen lokasyon süzgeçteki ya da listedeki ilk lokasyon (`SchedulePage.tsx:717-732`). "All locations" görünümünde Beşiktaş'ı düzenleyen Zeynep'i Ayşe görmez. Kodla gösterildi, ekranda denenmedi. · YENİ · `leave: low / do: safe`
- **D4. Zamanlanmış e-postada bir alıcıya gitmezse kayıt yine "başarılı" sayılıyor.** Hata yalnız hiçbir alıcıya gitmezse yazılıyor (`schedule-export-cron.ts:139-161`). · YENİ, BL-437 işiyle birlikte ele alınır · `leave: low / do: safe`
- **D5. Kullanılmayan (ölü) kod ve ikiz sistemler**
  - Eski Export bileşenlerinin tamamı (ScheduleExportDialog, ScheduleExportPanel, ScheduleExportWorkspaceDialog, Controls, Presets, RecentEvents, Schedules, PreviewDialog, scheduleExportDownload) ve web'deki ilgili veri fonksiyonları: canlı kodda bunları kullanan yok → BL-437 / BL-282.
  - Hiç açılmayan taslak seçme penceresi `EnterEditModeDialog` → BL-616, hâlâ geçerli.
  - Kullanılmayan sorgu anahtarı ve hatası yakalanmayan yayın durumu çağrıları (`:989`, `:3234`, `:3307`) → BL-391, hâlâ geçerli.
  - Çağrılmayan bekleyen-değişiklik fonksiyonları → BL-168, hâlâ geçerli.
  - API'de `/v1/workspaces/:id/schedule/*` ailesi, `PATCH /shifts/publish`, taslak üstünden Auto-fill uçları ve "materialize" ucu → BL-280 (4), hâlâ geçerli.
    - **YENİ ek:** `POST /schedule/edit-session/discard`, kullanılan `DELETE /schedule/edit-lock/release`'in ikizi (`schedule-routes.ts:1669`). `GET /shifts`, `GET /schedule/shifts` ile birebir aynı (`:2344` ve `:1267`); web yalnız ikincisini kullanıyor.
  - Canlı yayında "edit_lock" sinyali gönderiliyor ama dinleyen yok. Kalp atışının 15 dakikalık eşiği uyarı süresinin ikinci bir kopyası (`SchedulePage.tsx:772`).
- **D6. Dosya büyüklüğü ve gereksiz yeniden hesaplama**
  - `SchedulePage.tsx` artık 3637 satır, yaklaşık 53 `useState` ve 23 `useEffect` → BL-386 değişmiş (kayıttaki 3519'dan büyümüş).
  - API'deki Schedule rotaları tek dosyada, `schedule-routes.ts` 2638 satır → BL-376.
  - Izgara modeli her çizimde baştan kuruluyor (`:1899-1907`) → BL-275, hâlâ geçerli.

## Backlog tazelik notları
- **BL-062 bayat:** "Review default hours" düğmesi artık var (`SchedulePage.tsx:2666-2670`, `8b99d148`). Kapatılabilir.
- **BL-552 ile BL-685 aynı madde:** ikisi de sunucunun gönderdiği `confirm_scope` alanının web'e ulaşmamasını anlatıyor. Biri kapatılmalı.
- **Hâlâ geçerli (bugün ölçüldü):**
  - BL-681: Unassigned satırı görünüm modunda da görünüyor (`scheduleGridViewModel.ts:69-70`).
  - BL-238: sunucu "bu hafta"yı hâlâ UTC'ye göre hesaplıyor.
  - BL-159: vardiya ekleme, düzenlemenin tuttuğu lokasyona değil kişinin yetkisine bakıyor.
  - BL-608: Discard penceresi Esc'i yok sayıyor.
  - BL-619 ve BL-437: geçerli.

---

## Test boşlukları

**Hiçbir testin korumadığı davranışlar:**
- Undo'dan sonra sunucudaki durum.
- Zaman aşımında işin silinmesi ve ekranın ne söylediği; kilit düşünce kurtarma; kalp atışı hatası.
- Düzenleme modunda sayfa yenileme ya da hafta değiştirme (boş ızgara).
- Aynı yayındaki haftada iki oturum: bekleyen-değişiklik listesinin karışması. Bu listeyi okuyan fonksiyon pgTAP'ta yalnız yetki kapsamı testinde geçiyor.
- Yayından açılan oturumda yeni eklenen vardiyanın görünen durumu (tetikleyici).
- Şablon: molanın korunması, açık vardiyaya dönüşen sayının mesajda görünmesi, Overwrite'ın lokasyon kapsamı.
- Açık oturum varken taslak silme.
- Kurtarma taslağının ekranda gösterilmesi.
- Silme penceresinde Enter; zamanlanmış e-postada kısmi teslim.

**E2E testinde hiç geçmeyen akışlar:** sürükle-bırak, yapıştırma, toplu silme, Undo, Discard, Unpublish, şablon kaydet ve uygula, Export dosyası, kapalı gün kuralı (K17), geçmiş hafta kilidi, geçmiş vardiyayı düzenleme penceresi, varsayılan saatler.

**Bugün korunanlar:**
- E2E: müsaitlik uyarıları (M8, M9, M11, M12), düzenleme kilidi, hayalet kartlar ve yayın kapsamı, temel yayın, onaylı takası geri alan yayının reddi, vardiya notu.
- pgTAP: düzenleme oturumu, kaldığı yerden sürdürme, şablon izinleri ve arşivli etiketler.

---

## En önemli 5 bulgu
1. **Y2.** 20 dakika hareketsizlikte kaydedilmemiş iş habersiz siliniyor; sunucunun kendi kurtarma yolu atlanıyor.
2. **Y1.** Undo sunucuda bir şey geri almıyor; geri alınan değişiklik bir dakika içinde geri dönüyor, yayına da gidebiliyor.
3. **Y5.** İki yönetici aynı yayındaki haftayı düzenlerken birinin kaydedilmemiş değişikliği ötekinin ızgarasına kendi değişikliği gibi biniyor.
4. **Y4.** Düzenlerken sayfa yenilenince ya da hafta değişince taslak boş görünüyor.
5. **Y3.** Kilit, uyarı penceresinin son dakikalarında zaten düşmüş oluyor; ekran toparlayamıyor ve kullanıcıyı işi silen Discard'a itiyor.

## Şüphe, doğrulanmadı
- Kalp atışının cevabı, ondan sonra gelen bir kaydın cevabını ezebilir (`SchedulePage.tsx:773-775` revizyonu karşılaştırmıyor). Pencere dar, zamanlamaya bağlı.
- Discard'dan sonra ekranın bu haftaya atlaması (`:1246`) kasıtlı mı? Pencere metni "returns to the live weekly schedule" diyor.
- Lokasyondan ayrılmış birinin taslaktaki vardiyası ızgarada hiç görünmeyebilir, çünkü kişinin satırı yok. Yerel veritabanında yalnız test kalıntısı tek bir satır var; ekranda denemedim.
- Zamanlanmış e-posta gönderim anının haftasını gönderiyor. Pazar akşamına kurulan bir e-posta biten haftayı yollar; bu bir ürün sorusu.
- Yaz saati geçişi gecesinde, gece yarısını aşan vardiyanın saat toplamı bir saat sapabilir.
