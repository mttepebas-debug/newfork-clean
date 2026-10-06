# D — Important Dates (sol menü → Important Dates): kod ve davranış (EKRAN-08, 2026-10-06, `20332d46`)

## Özet (en çok 8 satır)
- **En önemli tespit (yüksek):** main'de, üzerinde yayınlanmış vardiya olan bir güne "Closed day" kaydedilemiyor. Sunucu, ekranın göstermesi gereken "etkilenen vardiyalar" listesini (K13) bekliyor. Ekran bu listeyi hiç istemediği için her denemede ham "Review the shifts on this closed day again." cümlesi çıkıyor. Yayından kaldırılmış bir kapalı günü yeniden yayınlamak da aynı yerde takılıyor.
- **Bunun kökü:** önemli tarihin ekran parçası (etkilenen vardiya listesi, History sekmesi, "N shifts stay open" mesajı) `task/fb-6.7-ui` dalında. Dal hiç main'e girmedi: main'in 16 commit önünde, 314 commit gerisinde. Sunucu, API ve veri katmanı hazır; ekran onları çağırmıyor.
- **Orta önemde:**
  - K15/K16 sonuçları ekranda yok: kaç vardiyanın açık kaldığı ve kaç taslak vardiyanın düştüğü yazılmıyor.
  - History sekmesi yok.
  - Veritabanının ham cümleleri ekrana çıkıyor.
  - Pencerede "Delete date" diye görünen düğme aslında arşivliyor.
  - Geçmiş tarihin satırı açılmıyor (BL-676).
- **Düşük önemde:**
  - Yıllık tarih "Past" sekmesine düşüyor (BL-679).
  - Kaydı değiştiren kişi kendi değişikliğinin bildirimini alıyor.
  - İki lokasyonlu müdürde Save sebepsiz kapanıyor.
  - Saat dilimi (BL-238); "Blackout" türünün işlevi yok.
  - Sayfalama (BL-787) ve boş hâlde "New date" düğmesi yok.
  - Ölü kod: üç eski yönlendirme ve kullanılmayan alanlar.
- **Sunucu tarafı kurallara uyuyor:** K1–K3, K5 + KK-89, K6, K7, K8 (Restore → Unpublished, bildirim yok), K11, K13–K16, K14 metni. pgTAP kapsamı güçlü. main'de Important Dates için hiç e2e yok.
- **Yöntem:** zinciri web → API → veritabanı sırasıyla okudum. Yerelde yalnız `begin read only … rollback` içinde SELECT çalıştırdım. Test, build ve sunucu çalıştırmadım.

## Ekranın sınırı
- **İçeride:**
  - **Web:** `/app/important-dates` (`apps/web/src/settings/ImportantDatesSettingsPage.tsx`, 871 satır). İçinde Upcoming / Past / Archived sekmeleri, tür süzgeci, arama, sıralama, satır menüsü (Edit / Unpublish / Republish / Archive / Restore) ve pencere (`CatalogDrawer`: form + "Delete date").
  - **Veri katmanı:** `apps/web/src/settings/organization-data.ts:412-494`.
  - **API:** `apps/api/src/settings/important-dates-routes.ts` + `important-dates-service.ts`. Görevde `communications/**` yazıyordu ama önemli tarih uçları `settings/` altında; `communications/`'ta önemli tarih ucu yok.
  - **Veritabanı (son tanımlar):**
    - `20261005000000_closed_days_reach_the_shifts.sql`: `save_important_date_service` :444, `set_important_date_state_service` :624, `preview_important_date_closure_service` :392, `read_settings_important_dates_service` :732, `closure_days` :64, `important_date_keep_past` :136, `important_date_tell_removed` :313, `important_date_stay_open` :366.
    - `20261007090000`: `important_date_closure_impact` :789.
    - `20261007120000`: `important_date_close_shifts` :556.
    - `20261004000000`: `important_date_recipients` :1055, `important_date_notified` :1071, `important_date_deliver` :1121, `read_important_date_history_service` :1466, `communication_reason` / `_reaches` / `_audience` :348-469.
- **Sınırda (burada yeniden yazılmadı):**
  - Schedule'ın kapalı gün çakışması ve K17'nin üç derecesi (`schedule-conflicts.ts`, `closedDayAnswer.ts`; EKRAN-01).
  - Schedule'ın önemli tarih okuması (`schedule-service.ts:480-523`, BL-701).
  - Settings → Conflict handling → Closed location.
  - Notifications (bildirimin kendisi).

## Akış haritası
- **Liste:**
  - `GET …/settings/important-dates` → `read_settings_important_dates_service`.
  - Cevap tek bir JSON, sayfalama yok: `can_manage`, `can_target_workspace`, `locked_before` (geçmiş kilidinin sınırı), satır başına `can_edit`, `can_unpublish`, `can_republish`, `can_archive`, `can_restore`, `is_past`.
  - Sekme, süzgeç, arama ve sıralama tamamen tarayıcıda yapılıyor. Sekmeyi `dateTab` belirliyor (`:764-767`): arşivliyse Archived, `ends_on < bugün` ise Past, değilse Upcoming. "Bugün" cihazın takvimine göre hesaplanıyor (`todayIn()`; G14 S1 kararıyla uyumlu).
- **Kaydetme:**
  - Web `saveImportantDate`'i kapanış seçimi olmadan çağırıyor (`ImportantDatesSettingsPage.tsx:214-217`).
  - API `POST` / `PUT` → `save_important_date_service`. Sunucu sırasıyla şunları yapıyor:
    1. Sürüm numarasını kontrol ediyor.
    2. K11 geçmiş kilidini uyguluyor. Sınır, Schedule'ın düzenlenebilir haftasının başı (`schedule_current_week_start_service`; UTC'ye göre).
    3. K13 için etkilenen vardiyaları bulup parmak izini karşılaştırıyor.
    4. Geçmiş günleri ayrı kayda bölüyor (`keep_past`).
    5. Vardiyaları açık vardiyaya düşürüyor; yalnız "kalsın" seçilenler kalıyor.
    6. K14 tek bildirimini, K7 bildirimlerini ve History satırını yazıyor.
- **Durum değişikliği:**
  - Satır menüsü → `POST …/:id/{unpublish|republish|archive|restore}` → `set_important_date_state_service`.
  - Restore kaydı `unpublished` yapıyor, bildirim gitmiyor (K8).
  - Republish, kaydetmenin K13 kapısından geçiyor.
- **Önizleme ve History:**
  - `POST …/closure-preview` ve `GET …/:id/history` uçları var, veri katmanında fonksiyonları da var (`organization-data.ts:421`, `:486`). **Web ikisini de hiç çağırmıyor** (grep: yalnız tanımlar).

## Bulgular

**D1 — Yayınlanmış vardiyası olan güne "Closed day" kaydedilemiyor; K13 listesi ekranda yok.**
- **Önem:** yüksek.
- **Nerede:** Important Dates → New date (ya da satır → Edit) → Type "Closed day" → "Save date". Aynı takılma, satır menüsünden kapalı günü Republish ederken de var.
- **Örnek:**
  - Kadıköy müdürü Ayşe 24 Ekim'i Kadıköy için kapatmak istiyor; o gün Ali ile Can'ın yayınlanmış vardiyası var.
  - "Save date"e basınca pencerenin altında kırmızı "Review the shifts on this closed day again." çıkıyor.
  - Listeyi gösterecek bir yer yok. Kaç kez basarsa bassın aynı cevabı alıyor; kapalı gün hiç kaydedilmiyor.
  - Aynı şekilde, Unpublish ettiği kapalı günü Republish edemiyor.
  - KARARLAR C1-B'ye göre listenin formun altında çıkması gerekiyordu: her vardiyada Open shift / Keep seçimi ve tek "Save · N shifts to open" düğmesi.
- **Kanıt:**
  - Sunucu listeyi görmeden kaydı reddediyor: `20261005000000:532-539` (save) ve `:663-670` (republish). Yerel veritabanında bu sürümün yüklü olduğu SELECT ile doğrulandı (`prosrc` içinde metin var).
  - Web kapanış seçimini hiç göndermiyor: `ImportantDatesSettingsPage.tsx:214-217`, `:709-713`. `previewImportantDateClosure` web'de hiç çağrılmıyor (grep 0).
  - pgTAP, kural olarak doğrusunu sınıyor: `closed_days_reach_the_shifts.test.sql` "K13: closing it without having seen the shifts is refused".
  - Düzeltme dalda duruyor: `task/fb-6.7-ui` @`4d9226cc`. `git rev-list` dalı main'in 16 commit önünde, 314 commit gerisinde ölçtü. Dalda `ImportantDatesSettingsPage.tsx` için +397 / −28 değişiklik var, `:290` `previewImportantDateClosure`, ayrıca e2e `1a2be710`.
- **İşaret:** `leave: high / do: moderate`. Dal eski ve main'deki sayfa DOC-TABLE ile değişti; birleştirmede çakışma beklenir.
- **Eşleşme:** **YENİ.** FB-6.7 görev dosyası dalın durduğunu yazıyor ama backlog maddesi yok.

**D2 — K15 ve K16'nın sonucu ekrana yazılmıyor: "N shifts stay open" ve taslak bilgi satırı yok.**
- **Önem:** orta.
- **Nerede:** satır menüsü → Archive / Unpublish ile pencerede tarih değiştirip kaydetme (kapalı gün). Taslak haftaya kapalı gün eklerken de aynı.
- **Örnek:**
  - Ayşe 24 Ekim kapanışını arşivliyor; üç vardiya açık kalıyor ama ekranda hiçbir şey yazmıyor. K15'e göre "3 shifts stay open" yazmalıydı.
  - Gelecek haftanın taslağındaki iki vardiya kapanışla sessizce açık vardiyaya düşüyor. K16 soru sormamayı söylüyor, ama C1-B tek bir bilgi satırı istiyor; o satır da yok.
- **Kanıt:**
  - Sunucu sayıları dönüyor: `shifts_opened`, `draft_shifts_opened`, `shifts_stay_open` (`20261005000000:611-614`, `:716-719`).
  - Web bu cevabı okumuyor: `saveMutation.onSuccess` ve `archiveMutation.onSuccess: refresh` (`ImportantDatesSettingsPage.tsx:120-133`). `shifts_stay_open` web'de yalnız yorumda geçiyor (grep).
- **İşaret:** `leave: medium / do: safe`.
- **Eşleşme:** **YENİ.** Dalda da Unpublish sessiz kalıyor (FB-6.7.md:145, P4 D9); birleştirmede kapatılmalı.

**D3 — Pencerede History sekmesi yok (B3-A, K2 "değişiklik geçmişi tutulur").**
- **Önem:** orta.
- **Nerede:** Important Dates → satır → pencere. Pencerede yalnız form var, Details / History sekmeleri yok.
- **Örnek:** owner Zeynep, Ayşe'nin "Inventory day" tarihini 12 Ekim'den 14 Ekim'e çekiyor. Ayşe kimin, ne zaman, neyi değiştirdiğini hiçbir yerde göremiyor. Veritabanı bunu `important_date_changes`'a yazıyor; yerelde 6 satır var.
- **Kanıt:**
  - Sunucu ve API hazır: `read_important_date_history_service` (`20261004000000:1466`), `GET …/:id/history` (`important-dates-routes.ts:100-110`), `getImportantDateHistory` (`organization-data.ts:486`).
  - Web'de çağıran yok (grep 0). Dalda var (`task/fb-6.7-ui` `:134`, `1d1b4325`).
- **İşaret:** `leave: medium / do: moderate`.
- **Eşleşme:** **YENİ.** İlgili açık maddeler: BL-547 (K11 bölmesi History'de yok), BL-550 (boş kayıt sürüm artırıyor).

**D4 — Veritabanının ham cümleleri ekrana çıkıyor; tarih seçici geçmiş günleri açık bırakıyor.**
- **Önem:** orta.
- **Nerede:** pencerenin altındaki kırmızı satır ve sayfa üstündeki hata satırı (`errorText` = `error.message`, `GeneralSettingsPage.tsx:324-328`).
- **Örnek:**
  - Ayşe "Starts" alanında geçen haftayı seçebiliyor. Kaydedince "Past important dates are read-only." çıkıyor.
  - Bitiş tarihi başlangıçtan önceyse, ya da istemci kontrolünü atlayan bir durumda, küçük harfle "valid important date required" çıkıyor.
  - İki kişi aynı tarihi düzenlerse ikincisi "This date changed. Reload and try again." görüyor.
  - Biri satır menüsünden arşivlerken diğeri pencerede kaydederse "Restore this date before you edit it" çıkıyor.
  - Ayrıca "Choose at least one location", "too many locations", "A shift on this closed day changed. Review the shifts again." ve D1'deki cümle.
- **Kanıt:**
  - Ham cümleler: `20261005000000:126, 419, 481, 484, 489, 499, 538, 661, 669` ve `20261007120000` `close_shifts`.
  - API bu tür bilinçli `raise` cümlelerini olduğu gibi geçiriyor (`http-error.ts:136-141`).
  - Sunucu kilit sınırını `locked_before` olarak gönderiyor (`20261005000000:753`). pgTAP bunu "to keep the date picker off past days" diye sınıyor; web hiç okumuyor (grep 0), `<input type="date">`'te `min` yok (`:473-501`).
  - Web hiçbir `reason` anahtarına bakmıyor (`important_date.past`, `important_date.closure_changed`; grep 0).
  - Yan not: geçmiş yıl seçilmiş yıllık tarih sessizce bir sonraki yıla taşınıyor (`:516-522`). Kaydedilen tarih yazılandan farklı olduğu halde ekran söylemiyor (P25: sonuç açıkça yazılır).
- **İşaret:** `leave: medium / do: safe`.
- **Eşleşme:** **YENİ.** Duyuru ekranındaki eşi EKRAN-07 D raporunda var.

**D5 — Penceredeki "Delete date" arşivliyor; satır menüsündeki Archive tek tıkla çalışıyor.**
- **Önem:** orta.
- **Nerede:** pencerenin sol altında "Delete date" → "Delete "<ad>"?" → "Delete date". Satır menüsünde ise "Archive" (tek tık).
- **Örnek:** Zeynep pencerede "Delete date"e iki kez basıyor; tarih silinmiyor, Archived sekmesine gidiyor. Aynı iş satır menüsünde "Archive" adıyla ve tek tıkla yapılıyor. Aynı eylemin iki adı ve iki ayrı tık kuralı var.
- **Kanıt:** `ImportantDatesSettingsPage.tsx:556-567` ve `:769-828` (metin "This date will be archived"); `:718-732`. KARARLAR Settings kuralı: Archive iki tık kırmızı, "Confirm archive".
- **İşaret:** `leave: medium / do: safe`.
- **Eşleşme:** BL-595. Maddenin 2026-10-05 kanıtı penceredeki "Delete date"i de anıyor.

**D6 — Geçmiş tarih ve salt okuyan kişi için satır hiç açılmıyor.**
- **Önem:** orta.
- **Nerede:** Important Dates → Past. Ayrıca yalnız "View" seviyesindeki özel rolde bütün satırlar.
- **Örnek:** Ayşe geçen ayki "Inventory day"in notunu okumak istiyor; satır gri, tıklanamıyor. K11 yalnız düzenlemeyi kapatıyor, okumayı değil.
- **Kanıt:** satır düğmesinde `disabled={!mayManageDate(item)}` (`:654`). `openEditor` `can_edit` istiyor (`:159-166`). Salt okunur pencere yok.
- **İşaret:** `leave: medium / do: safe`.
- **Eşleşme:** BL-676.

**D7 — Yıllık tarih bu yılki günü geçince "Past" sekmesine düşüyor; tarih sütunu ilk yılı gösteriyor.**
- **Önem:** düşük.
- **Örnek:** her yıl tekrarlanan "Christmas" (2026-12-25, yıllık) Ocak 2027'de Past'ta görünüyor. Oysa hâlâ düzenlenebilir (`is_past` yıllıkta hep false) ve 2027'de yine gelecek. Upcoming'de sırası da eski yıla göre.
- **Kanıt:** `dateTab` `:764-767`, sıralama `:839`, `important_date_is_past` `20261005000000:111-118`.
- **İşaret:** `leave: low / do: safe`.
- **Eşleşme:** BL-679 (karar bekliyor).

**D8 — Kaydı değiştiren kişi kendi değişikliğinin bildirimini alıyor; yazar başkasının değişikliğini duymuyor.**
- **Önem:** düşük.
- **Örnek:** admin Hande, Ayşe'nin Kadıköy "Inventory day"inin tarihini değiştiriyor. Hande, Kadıköy'ü yönettiği için kendi değişikliğinin bildirimini alıyor. Ayşe ise yazar olduğu için kendi kaydının değiştiğini duymuyor.
- **Kanıt:** alıcı listesi yalnız `created_by`'ı dışarıda bırakıyor, değişikliği yapanı bırakmıyor (`20261004000000:1064`, `:1101`; `tell_removed` `20261005000000:333`). KK-89'un sözü "yazar"; niyeti "yapan kişi kendi işinin bildirimini almaz" olabilir.
- **Ölçüm:** yerel veride bu durum yok (6 kayıt, hepsini yazar değiştirmiş; SELECT). Bulgu yalnız koda dayanıyor.
- **İşaret:** `leave: low / do: safe`.
- **Eşleşme:** **YENİ.** KK-89'un okunuşu soru olabilir.

**D9 — İki lokasyonlu müdür ikisini birden seçince Save sebepsiz kapanıyor.**
- **Önem:** düşük.
- **Örnek:** Veli Kadıköy ve Erenköy müdürü; seçiciden ikisini işaretliyor, "Save date" gri kalıyor ve neden yazmıyor. K1 kuralı doğru (çok lokasyonlu kayıt yalnız admin / owner'ın) ama ekran bunu söylemiyor.
- **Kanıt:** `mayManageLocations` → `ids.length === 1` (`:94-97`), `canSave` `:201-208`.
- **İşaret:** `leave: low / do: safe`.
- **Eşleşme:** **YENİ.**

**D10 — Saat dilimi: kilit sınırı UTC'ye göre; "Past" sekmesi düzenlenebilir satır da gösteriyor.**
- **Önem:** düşük.
- **Örnek 1:** Pazar akşamı Pacific saatiyle 17:00'den sonra sunucu yeni haftaya geçmiş sayıyor. Geçen haftanın tarihleri birkaç saat erken kilitleniyor.
- **Örnek 2:** bu haftanın Pazartesi'sinde biten tarih, cihazın "bugün"üne göre Past sekmesinde görünüyor ama hâlâ düzenlenebiliyor. Sunucunun sınırı haftanın başı, ekranın sınırı bugün.
- **Kanıt:** `schedule_current_week_start_service` `current_date` kullanıyor (UTC); sekme `todayIn()` ile ayrılıyor (`:142`).
- **İşaret:** `leave: low / do: risky`. Ortak hafta kuralına dokunuyor.
- **Eşleşme:** BL-238 (UTC haftası). Sekme ile kilit arasındaki fark **YENİ**.

**D11 — "Blackout" türünün işlevi ve kuralı yok; pencere metni yanlış söz veriyor.**
- **Önem:** düşük.
- **Örnek:** Ayşe tarihi "Blackout" yapıyor, ama "Event" ile hiçbir farkı yok. Sektörde blackout genelde "o gün izin istenmez" anlamına geliyor. Pencere başlığının altında "Use closed day for dates that should block scheduling." yazıyor; oysa kapalı gün varsayılan ayarda yalnız onay soruyor (K10, K17).
- **Kanıt:** `blackout` yalnız etiket olarak geçiyor (`:32`); veritabanı, API ve web'de başka kullanım yok (grep). Metin `:325`.
- **İşaret:** `leave: low / do: safe`.
- **Eşleşme:** **YENİ.** Türün ne yapacağı ürün sorusu.

**D12 — Liste dilinden eksikler: sayfalama yok, boş hâlde "New date" düğmesi yok.**
- **Önem:** düşük.
- **Kanıt:** okuma tek JSON dönüyor (`20261005000000:754-787`). Boş hâlde yalnız simge, başlık ve metin var (`:738-752`). KARARLAR boş hâli "No important dates yet" + metin + "New date" olarak tarif ediyor.
- **İşaret:** `leave: low / do: safe`.
- **Eşleşme:** sayfalama BL-787; telefonda kart satırı BL-599 ve BL-598; boş hâl düğmesi **YENİ**.

**D13 — Ölü kod.**
- **Önem:** düşük.
- **Ne var:**
  - Üç eski yönlendirme: `/app/settings/important-dates`, `/closed-days` ve `/important-dates/closed-days`. Uygulamada bunlara giden bağlantı yok (`App.tsx:537-548`).
  - Okunmayan alanlar: `is_past`, `locked_before`, `can_archive` (shared `index.ts:1135-1140`, `:3182`).
  - Çağrılmayan iki veri fonksiyonu (D1, D3). Dal birleşince yaşayacaklar.
- **İşaret:** `leave: low / do: safe`.
- **Eşleşme:** **YENİ.**

### Yarış durumları
- **Korunanlar:**
  - Aynı anda iki düzenleme: sürüm numarası ikinciyi reddediyor (KK-92 c, pgTAP).
  - Önizleme ile kaydetme arasında değişen vardiya: parmak izi ve `close_shifts` içindeki "A shift … changed" ile reddediliyor.
- **Açık:** satır menüsündeki durum eylemleri sürüm göndermiyor (`organization-data.ts:470-483`). Arşiv ile pencerede kaydetme çakışırsa kaydeden kişi ham cümle görüyor (D4). Veri kaybı yok.

### Kurallara uyan yerler (kayıt için)
- K5: müdür / admin / owner `communication_audience` ile alıyor, yazar almıyor.
- K7: içerik değişince herkes, yalnız lokasyon eklenince yalnız yeniler, Republish'te açmamış olanlar bildirim alıyor (pgTAP).
- K8: Restore kaydı Unpublished yapıyor, bildirim gitmiyor.
- K11: bölme ve kilit doğru çalışıyor.
- K14: tek bildirim, metni "… is closed on Oct 18 — your shift was removed" (yerel outbox'ta SELECT ile görüldü).
- K16: taslak vardiyalar sessizce düşüyor.
- K6: müdür çok lokasyonlu kaydı öteki lokasyon adlarıyla görüyor (`location_names`).

## Bağlantılı açık maddeler (bu ekranın veri tarafı, geçerli)
- BL-544: izin ve kapalı günün vardiya düşürme adımları iki ayrı yerde yazılı.
- BL-546: yıllık çok günlü tarih kendi günleri sürerken düzenlenince o yılın tekrarı eski kayıtta kalıyor.
- BL-547: K11 bölmesi History'de görünmüyor.
- BL-548: önizlemede saat dilimi karışık.
- BL-549: arşivden dönen lokasyonda K13 sorulmuyor.
- BL-550: değişmeyen kayıt sürüm numarasını artırıyor.
- BL-551: `important_date_shift_releases`'te indekssiz yabancı anahtarlar.
- BL-701: Schedule kapsamı API'de süzüyor.

## Test boşlukları
- **e2e:** main'de Important Dates için hiç senaryo yok (`e2e/` grep 0). Dalda bir tane var (`1a2be710`).
- **vitest** (`ImportantDatesSettingsPage.test.tsx`, 6 test: sekmeler, boş metin, liste, kapalı gün oluşturma — kayıt taklit edilmiş):
  - archive / restore / unpublish / republish sınanmıyor;
  - hata gösterimi (409 kapanış reddi, geçmiş reddi) sınanmıyor;
  - geçmiş satırın kilidi sınanmıyor;
  - müdürün lokasyon seçicisi (K1) ve yıllık tarihin sekmesi sınanmıyor.
- **API** (`important-dates-routes.test.ts`): yeterli. 409 ve önizleme uçları sınanıyor.
- **pgTAP:** güçlü. Boşluklar:
  - değiştiren kişi yazar değilken bildirim (D8);
  - kapalı günü Unpublish edince `shifts_stay_open` sayısı (yalnız arşiv sınanıyor);
  - `locked_before` dışında, tarih seçicinin web'deki kullanımı (zaten yok).

## Kanıtlanamayanlar
- D8'in gerçek davranışı yerel veride görülmedi; bulgu yalnız koda dayanıyor.
- Dalın (`task/fb-6.7-ui`) bugünkü main'e çakışmasız alınıp alınamayacağı ölçülmedi. Yalnız sayılar ölçüldü: 16 önde, 314 geride.
- `workspace_scheduling_settings` satırı olmayan workspace'te kilit sınırı boş kalır ve `is_past` / `can_*` boş döner. Yerelde böyle workspace yok (SELECT: 0); kod yolu tehlikeli değil gibi.
- Schedule'da kapalı gün çakışmasının metni: veritabanı "Location or shift type is closed on this date." yazıyor (`20261007000000`), web rozeti "Location is closed". Ekranda hangisinin göründüğü ölçülmedi (sınırda, EKRAN-01).
