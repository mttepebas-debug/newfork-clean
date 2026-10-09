# D — Requests: kod ve davranış (EKRAN-02, 2026-10-05, e929abc7)

## Özet (en çok 8 satır)
- **Yüksek önemde üç sorun var.**
  - Requests → Time off listesinde "Older" düğmesi her sayfa geçişinde bir talebi atlıyor. 51., 101. … talep listede hiç görünmüyor. Yerel veritabanında ölçüldü.
  - Shift changes'te yol ve dinlenme kuralı onayı engelliyor. Kural bunun yalnız bir uyarı olmasını istiyor.
  - Shift changes'te aynı rütbedeki müdür, öteki müdürün devrini onaylayabiliyor (P07'ye aykırı).
- **İzin onayının çekirdeği kurala uyuyor.** Kendini onaylama yok, eş rütbe onayı yok, kısmi onay yok, tek red talebi kapatıyor. Eşzamanlı kararlar veritabanında kilitle korunuyor.
- **Ekran tarafında üç zayıf nokta var:**
  - Arama ve filtre her değişiklikte bütün sayfayı "Loading requests..." ekranına çeviriyor.
  - Sıralama yalnız ekrandaki 50 satıra uygulanıyor.
  - Bildirimdeki bağlantı, kapanmış bir talebi açmıyor.
- **Bildirimler:** Bir karar aynı kişiye iki bildirim gönderebiliyor. Shift changes'te owner ve bütün admin'ler her başvuruyu duyuyor (P07 "admin gürültüsü yok" ilkesine ters).
- **Karar gerektiren iki konu var:**
  - Özel rolde Time off için "View" seviyesi, bekleyen talebi karar veremeyen kişiye gösteriyor.
  - KARARLAR'daki "belgesi gecikmiş müdür talebi görür" kuralı (S3), "kısıtlı kişi hiçbir yönetim işi yapamaz" kuralıyla çelişiyor. Kod ikinciye uyuyor.
- **Kapsam notu:** Shift changes bölümünü bir alt ajan taradı. İki yüksek bulgusunu ve bildirim sayımını ben yeniden doğruladım (Kanıt listesi K14–K16).
- **Skill:** verification-before-completion ilkesine göre çalışıldı; her iddia bir komutla ya da dosya:satır ile kanıtlandı. Skill dosyası açılmadı. systematic-debugging gerekmedi, çünkü beklenmedik kırmızı test yoktu.

## Akış haritası
**Liste.**
- Sayfa: `ScheduleRequestsPage.tsx:111-116`. `useScheduleRequests` (TanStack Query'nin sayfayı besleyen sorgusu) burada çağrılıyor.
- Web veri katmanı: `requests-data.ts:50-69`. İstekler kendi yardımcısıyla gidiyor (`:20-48`).
- API: `GET /schedule/requests`, `schedule-requests-routes.ts:66-99`. Rotanın kendi izin kapısı var (`:103-132`).
- Servis: `schedule-requests-service.ts:33-45`.
- Veritabanı: `get_schedule_requests_service`. Kimi gördüğünü `time_off_reason(...'requests.read')` ile yetki çekirdeğine soruyor; çekirdek her bekleyen satır için `time_off_progress`'i çağırıyor.

**Karar (Approve / Deny).**
- Web: `runAct`, `ScheduleRequestsPage.tsx:179-220` → `useVoteOnTimeOff`, `requests-data.ts:141-144`.
- API: `POST /v1/workspaces/:w/time-off/:id/verdict`, `time-off-voting-routes.ts:46-47`.
- Veritabanı: `decide_time_off_service`. Workspace kilidi + satır kilidi alıyor, çekirdeğe soruyor, oy kaydediyor ya da `time_off_finalize`'ı çağırıyor.
- Vardiya açılırsa: `time_off_release_shifts` vardiyaları boşaltıyor, ardından `time_off_notify_shifts_opened` bildirim gönderiyor.

**Revoke.**
- Web: `:185-190` → API `/revoke` → veritabanı `revoke_time_off_service`.
- Kural: `time_off.revoke` (rütbe ve "kendi değil" kuralı açık).
- Başlamış izinde: sistem otomatik onaylı bir iptal parçası yazıyor.

**Shorten (izni kısalt).**
- Web: `TimeOffShorten.tsx:33-44` → API `/shorten`, `time-off-shorten-routes.ts:22-42`.
- Veritabanı: `shorten_time_off_service` → `app_private.shorten_time_off` → `notify_time_off_shortened`.

**Süre işi.** `app_private.time_off_sweep` 5 dakikada bir koşuyor (BL-506):
- Süresi geçen talebi otomatik reddediyor.
- Son karara 12 saat kala hatırlatıyor.
- Etkisi değişen oyu silip "Look at this time off again" bildirimi gönderiyor.

**Bildirim tetikleyicisi.** `notify_schedule_request_event_service`, `schedule_time_off_events` tablosundaki her olay satırında çalışıyor.

**Shift changes.**
- Web: `ScheduleRequestsPage.tsx:265-278` → `ShiftExchangeHub` müdür modunda.
- Okuma: `GET …/shift-exchanges?view=manager` → `shift_exchanges_read_service`. Okuma izni çekirdekten geliyor.
- Onay öncesi kontrol: `shift_exchange_preview`.
- Approve / Decline: `shift_exchanges_command_service`. Satır 81-82 ve 134 eski yetki yardımcısını kullanıyor.
- Uygunluk: `weekly_assignment_candidate_base`.
- Bildirim: `shift_exchange_emit` → `…_notification_base`.

## 1. Bulgular (önem sırasıyla)

### Yüksek

**Y1. "Older" sayfalaması her sayfa sınırında bir talebi atlıyor.**
- **Ekranda:** Requests → Time off → Needs review ya da Closed → liste altındaki "Older".
- **Örnek:** Owner Mert'in Closed listesinde 51. talep, Ali'nin Mart izni olsun. Bu talep ne birinci sayfada ne "Older" ile açılan ikinci sayfada görünüyor.
  - Needs review'da 50'den fazla bekleyen talep varsa atlanan talep hiç görülmüyor. Kimse karar veremediği için son karar anında otomatik reddediliyor.
- **Kanıt:**
  - Veritabanı fonksiyonu sonraki sayfanın başlangıcını, sayfaya girmeyen 51. satırın zamanından alıyor. Sonraki sorgu "bundan eski" diye arıyor, yani 51. satırı dışarıda bırakıyor.
  - Kaynak: `20261003040000_time_off_forgets_location_and_parts.sql:925` `min(created_at)`. Yerel tanımda satır 40 `r.created_at < target_time_off_cursor`, satır 70.
  - SELECT ile ölçüldü (K1): tam liste 486c06be, c7673207, 6835ab46, 33804531…; sayfa 1 = 486c06be, c7673207; sayfa 2 = 33804531, 7aed6306. **6835ab46 kayboluyor.**
- **BL:** YENİ. `leave: high / do: safe` (tek satırlık düzeltme; dar pgTAP testiyle kilitlenir).

**Y2. Shift changes: yol ve dinlenme kuralı onayı engelliyor (KARARLAR "Yol ve dinlenme süresi": yalnız işaret, Block seçili olsa da engel değil).**
- **Ekranda:** Requests → Shift changes → vaka → Review. "Approve" kapalı, kırmızı "At least 45 minutes are required between locations" yazısı var.
- **Örnek:** Garson2'nin Beşiktaş vardiyası 17:00'de bitiyor. Kadıköy'deki 17:30 vardiyasına başvuruyor. Kadıköy müdürü Ayşe onaylayamıyor.
- **Kanıt:**
  - `weekly_assignment_candidate_base` (yerel tanım satır 59-68) yol süresi aşılınca kişiyi `state:='ineligible'` (uygun değil) yapıyor. Ayardaki Warn/Block seçimine bakmıyor. Bunu yeniden okudum.
  - Dinlenme: `assess_weekly_shift_availability` satır 169-170 ihlali üretiyor, candidate_base satır 69 "gerekçe varsa uygun değil" diyor.
  - FB-6.4 tazelik maddesi 3 "dinlenme takasta denetlenmiyor" diyor; yanlış.
- **BL:** FB-6.4 D7 (BL numarası yok). Tazelik düzeltmesi YENİ. `leave: high / do: risky`.

**Y3. Shift changes: eş rütbe onay veriyor; müdür kendi vakasındaki adayı reddedebiliyor.**
- **Örnek:** Kadıköy'de iki müdür var, Ali ve Ayşe. Ayşe Cuma 17:00 vardiyasını Hande'ye devretmek istiyor ve Ali bunu onaylıyor. Ayşe ayrıca kendi cover talebinde Veli'yi "Decline" ile reddedebiliyor.
- **Kanıt:**
  - `shift_exchanges_command_service` satır 81-82 ve 134 yalnız `schedule_actor_has_capability_service`'e soruyor. Bu, rütbeye ve belge kısıtına bakmayan eski yetki yardımcısı.
  - `exchange.approve` kuralında `no_self=t, rank_below=t` tanımlı ama çağrılmıyor (K3).
  - Kendi vakasını onaylama yalnız preview satır 24'te engelli; ret dalında bu kontrol yok.
- **BL:** BL-276 kalem 1 / FB-6.4 A2 (D3) / SEC-A2 boşluk 1-3. Ret dalı YENİ. `leave: high / do: risky`.

### Orta

**O1. Arama ve filtre bütün sayfayı yükleme ekranına çeviriyor; arama kutusu her harfte odağı kaybediyor.**
- **Ekranda:** Requests → Time off → "Search employee or note", "All locations", Needs review / Closed.
- **Örnek:** Ayşe "Ali" yazmak istiyor. "A"ya basınca sayfa "Loading requests..." ekranına dönüyor, kutu yeniden çiziliyor ve imleç kayboluyor. 121 karakterden uzun bir arama API'den 400 dönüyor. O zaman sayfa yalnız "Valid schedule request query required" yazısına dönüyor ve arama kutusu da gidiyor; geri dönüş yolu yok.
- **Kanıt:**
  - Sorgu anahtarında arama var ama önceki veri tutulmuyor (`requests-data.ts:124-133`, `placeholderData` yok; Schedule'da var: `useScheduleQuery.ts:24`).
  - `ScheduleRequestsPage.tsx:279` yükleme sırasında bütün sayfayı yükleme ekranıyla değiştiriyor; arama kutusu `:340-351`'de, bu ağacın içinde.
  - API sınırı: `schedule-requests-routes.ts:12` `max(120)`. Kutuda `maxLength` yok.
  - Kod okumasıyla bulundu, tarayıcıda denenmedi.
- **BL:** YENİ. `leave: medium / do: safe`.

**O2. Sıralama yalnız ekrandaki sayfada çalışıyor.**
- **Ekranda:** Requests → Time off → sütun başlıkları (Employee, Dates, Decide by, Status, Review).
- **Örnek:** Ayşe "Decide by"a basıp en acil talebi arıyor. Sunucu sayfaları "en son gönderilen önce" sırasıyla veriyor. Erken gönderilmiş ama son karar anı yakın olan bir talep ikinci sayfada kalıyor. Ayşe onu görmüyor ve talep süresi dolunca reddediliyor.
- **Kanıt:** Sıralama ekrandaki satırlara uygulanıyor (`ScheduleRequestsPage.tsx:118-128`). Sunucu `order by r.created_at desc` ile sayfalıyor (yerel tanım satır 42). Y1 ile birleşince risk büyüyor.
- **BL:** YENİ. `leave: medium / do: moderate`.

**O3. Bildirim bağlantısı kapanmış talebi açmıyor.**
- **Ekranda:** Notifications → "Time off approved", "Time off declined", "…'s time off was shortened" → Requests.
- **Örnek:** Zeynep "Ali's time off was shortened" bildirimine basıyor. Requests açılıyor ama çekmece açılmıyor, çünkü talep Closed'da. Ekranda hiçbir açıklama yok.
- **Kanıt:**
  - Bağlantı `?tab=time-off&request=<id>` (`20261003040000…:726` civarı).
  - Sayfa talebi yalnız açık kuyruğun ilk sayfasında arıyor (`ScheduleRequestsPage.tsx:90-92` varsayılan "needs_review", `:129-132` `rows.find`).
  - Adres yalnız ilk açılışta okunuyor (`:100`). Sayfa açıkken başka bir talep bildirimine basınca da çekmece açılmıyor.
  - Test yok (`ScheduleRequestsPage.test.tsx`'te `request=` yalnız eski bağlantı testinde geçiyor, `:183`).
- **BL:** YENİ. `leave: medium / do: safe`.

**O4. Tek karar, aynı kişiye iki bildirim.**
- **Ekranda:** Notifications. Anti-hedef "bildirim gürültüsü".
- **(a) Vardiya açan onay.** Kadıköy'ün öteki müdürü Hande hem "Time off approved" hem "Ali is off — 1 shift is open" alıyor.
  - Kanıt: yerel bildirim kuyruğunda (outbox) 5 talepte aynı alıcıya iki satır (K11). Gelen kutusu okuması bu satırları birleştirmiyor; grup anahtarını yalnız taşıyor.
- **(b) İptal talebi onayı.**
  - Çalışan iki bildirim alıyor: "Leave cancellation updated" ve "Time-off request updated".
  - Öteki karar verenler iki kez "Time off approved" alıyor. İkincisi yanıltıcı, çünkü izin onaylanmadı, kısaldı.
  - Kanıt: `time_off_finalize` ana izne de bir olay yazıyor (`20261003040000…:253`). Bu olay kısaltma sayılmıyor (`time_off_event_is_shortening`), bu yüzden tetikleyici ikinci bildirimi gönderiyor.
- **(c) Bekleyen iptali olan izin revoke edilince:** herkese ikişer bildirim gidiyor.
- **Test:** (b) ve (c) için yok; `time_off_cancellation_requests.test.sql:96` yalnız iptalin kendi bildirimine bakıyor.
- **BL:** YENİ. `leave: medium / do: moderate`.

**O5. Shift changes: owner ve bütün admin'ler her başvuruyu ve her lokasyon onayını duyuyor.**
- **Örnek:** Kadıköy garsonu Beşiktaş'taki açık vardiyaya başvuruyor. Beşiktaş müdürüyle birlikte owner Mert ve bütün admin'ler "Shift change ready for review" alıyor. İzinde admin yalnız yedek alıcı.
- **Kanıt:** Yerel bildirim kuyruğunda kitle sayımı, role göre (K15):
  - `peer_accepted`: owner 138, admin 138, manager 428.
  - `scope_approved`: 132 / 132 / 251.
  - Alıcı seçimi `…_notification_base` satır 36-40.
- **BL:** YENİ. SEC-A2 boşluk 2 admin'i "her zaman alıcı" bırakıyor; P07 ile çelişiyor, karar gerekiyor. `leave: medium / do: moderate`.

**O6. Bekleyen talebi karar veremeyen de görebiliyor (özel rol).**
- **Ekranda:** Settings → Roles → Requests → Time off "View" seviyesi.
- **Örnek:** Owner bir "Shift lead" rolü açıyor ve Time off'u yalnız "View" yapıyor. Can, Kadıköy'deki bütün bekleyen talepleri ve kimin onayladığını görüyor, ama hiçbirine karar veremiyor.
- **Kural:** KARARLAR "Bekleyen izni yalnız karar veren ve sahibi görür"; talep, ilerleme ve oylar dahil.
- **Kanıt:**
  - Rol düzenleyicide okuma seviyesi ayrı (`packages/shared/src/role-permissions.ts:66-73`).
  - `requests.read` kuralı yalnız okuma iznine bakıyor (K4).
  - `time_off_progress` bekleyen her satırda onaylayanların adını veriyor.
  - Test yok: `time_off_seen_by_who_decides.test.sql` yalnız sistem rollerini deniyor.
- **BL:** YENİ. Karar sorusu: "View" seviyesi Time off'tan kalksın mı, yoksa bekleyen talepler yalnız karar verene mi gösterilsin? `leave: medium / do: moderate`.

**O7. KARARLAR'da iki kural çelişiyor; kod eskisine uyuyor.**
- **Çelişen kurallar:**
  - S3 (2026-10-01): "Belgesi eksik olduğu için oy veremeyen manager talebi görür ama oy veremez." Örnek: Hande, Ali'nin talebini görür, Approve kapalıdır.
  - KARARLAR:87: "Kısıtlı kişi … Program, talep ve yönetim işleri kapalı."
- **Kodda ne oluyor:** Belgesi gecikmiş Hande Requests'i hiç açamıyor.
  - Bütün uygulama onu `/account/documents`'a yönlendiriyor (`DocumentAccessRoute.tsx:30-33`).
  - `requests.read` kuralında `restricted_ok=f` (kısıtlı üyeye açık değil, K4); `authz_check` satır 73-74 `document_blocked` dönüyor.
- **BL:** YENİ (kayıt düzeltmesi + Mert'e soru). P22'ye göre yeni karar (S3) geçerli sayılmalı ama uygulanabilmesi için yönlendirmenin de değişmesi gerekiyor. `leave: medium / do: safe` (kayıt) / `risky` (kod).

**O8. Shift changes: onay beklerken saat değişirse kabul hiç düşmüyor.**
- **Kural:** Yeni saat, kabul edenin başka bir vardiyasıyla kesişiyorsa kabul düşer.
- **Örnek:** Veli Cuma 17–21 cover'ını kabul etti. Müdür vardiyayı 15–19'a çekiyor; Veli'nin 14–18 başka vardiyası var. Veli'ye "Existing acceptances remain valid" bildirimi gidiyor. Vaka listede kalıyor ama onaylanamıyor.
- **Kanıt:**
  - `refresh_weekly_exchange_terms` satır 26-32 başvuruyu her durumda bekleyen bırakıyor.
  - `weekly_exchange_changed_terms.test.sql:116` bu ters davranışı kilitliyor ve test `ci-not-green.txt:4`'te.
  - FB-6.4 D6 bunun "bugünkü davranış" olduğunu söylüyor; değil.
- **BL:** YENİ. `leave: medium / do: moderate`.

**O9. Shift changes: onay ekranında "kendi rızasıyla müsait değil" ve müdür notu işareti yok (M6, M12).**
- **Örnek:** Ali Cuma için "müsait değil" işaretli ama vardiyayı "Request anyway" ile istedi. Ayşe onay ekranında yalnız "Eligible" görüyor.
- **Kanıt:** candidate_base satır 48-49 müsaitlik ve not gerekçelerini atıyor. Önizleme şemasında işaret alanı yok (`packages/shared/src/shift-exchanges.ts:157-165`).
- **BL:** FB-6.4 B.1 / B.4. `leave: medium / do: moderate`.

**O10. Shift changes: iki lokasyonlu takasta onayını vermiş müdür, vakayı hâlâ kendi işi olarak görüyor.**
- **Örnek:** Kadıköy↔Beşiktaş takasında Ayşe "Record my approval"a basıyor. Vaka "1 case ready for a decision" sayacında kalıyor. Ayşe yeniden basabiliyor ve her basışta yeni bildirim gidiyor. Mehmet ise "Awaiting other manager" görüyor; beklenen öteki müdür kendisi.
- **Kanıt:** Okuma satır 61-62 (aşama bakana göre hesaplanmıyor); `ShiftExchangeHub.tsx:438-466`; komut satır 133-140.
- **BL:** YENİ. `leave: medium / do: safe`.

**O11. Shift changes: "Private manager note" kaydediliyor ama hiçbir yerde gösterilmiyor (P09).**
- **Örnek:** Ayşe reddederken "Veli geçen ay iki kez gelmedi" yazıyor. Bu notu kimse bir daha göremiyor.
- **Kanıt:** Not `shift_exchange_events.private_note` alanına yazılıyor; okuma servisi yalnız `message` alanını seçiyor (satır 59).
- **BL:** YENİ. `leave: medium / do: safe`.

**O12. Shift changes: listede bir vakaya tıklamak bütün ekranı yükleme iskeletine çeviriyor.**
- Açık vaka sorgu anahtarında; önceki veri tutulmuyor (`ShiftExchangeHub.tsx:296-306`, `:363`).
- O1 ile aynı kök neden.
- **BL:** YENİ. `leave: medium / do: safe`.

**O13. Aynı yetki kuralı iki ayrı yoldan soruluyor (CLAUDE.md §9).**
- **(a) Shift changes:** Approve düğmesinin görünmesine çekirdek karar veriyor. Komut, önizleme ve bildirim ise eski yardımcıya soruyor. BL-276 / FB-6.4 A2.1.
- **(b) Time off çekmecesi → Activity → "Entire shift released…" satırları:** Bu satırları eski yardımcı süzüyor (`time_off_event_released_assignments`, K5). BL-179 bugün de geçerli.
- **(c) Requests okuma API'si:**
  - Kendi rota kapısı var ve `permissions.includes` kullanıyor (`schedule-requests-routes.ts:103-153`).
  - Aynı okuma iki rotadan açık: `/v1/workspaces/:id/schedule/requests` yalnız testlerde kullanılıyor (`app.test.ts:845, 913`); web `/schedule/requests`'i çağırıyor.
  - BL-363 geçerli; iki rota ayrıntısı bu maddeye eklenmeli.
- **(d) Web'de ikinci bir istek yardımcısı:** `requests-data.ts:20-48`, ortak `apiRequest`'in kopyası. Oturum düşünce (401) `ensureSessionAlive` çağrılmıyor; süresi dolan müdür çıkışa yönlenmek yerine hata metni görüyor. YENİ (BL-363'e eklenebilir).
- `leave: medium / do: risky`.

**O14. İzin kısaltılınca bildirimi yalnız son onaylayan alıyor.**
- **Ekranda:** Requests → Time off → onaylı izin → Shorten time off.
- **Örnek:** Ali'nin iznini önce Kadıköy'den Ayşe, sonra Beşiktaş'tan Mehmet onayladı. Ayşe izni kısaltınca yalnız Mehmet haber alıyor. İzni sistem otomatik onayladıysa hiçbir müdür haber almıyor.
- **Kural:** KARARLAR "izni onaylayana bildirim gider".
- **Kanıt:**
  - Alıcılar, son onayı yazan olayın kişisi (`20261003040000…:615` `ev.metadata ? 'segments'`).
  - Ara oylar olay yazmıyor (`decide_time_off_service`'te yalnız `revision+1`).
  - Sistem onayında kişi yok (`time_off_finalize` actor null).
  - Test yalnız tek onaylayanlı durumu deniyor (`time_off_shortens_for_a_shift.test.sql:138`).
- **BL:** YENİ (BL-396 ile aynı bildirim). `leave: medium / do: safe`.

### Düşük

**D1. Shorten hatası ekrana ham metinle çıkıyor.**
- 409 (talep değişti) için "This request changed" yolu yok ve liste tazelenmiyor.
- **Örnek:** Başka bir müdür izni az önce değiştirdi. Ayşe "Give back these hours"a basınca "stale approved leave; refresh before shortening it" okuyor.
- **Kanıt:** `TimeOffShorten.tsx:71`; metin `20261003040000…:567`; `rpcFailure` tırnaksız metni olduğu gibi geçiriyor.
- **BL:** BL-654 ailesi (ek). `leave: low / do: safe`.

**D2. Eşzamanlı kararda ikinci müdürün çekmecesi açıklamasız kapanıyor.**
- **Örnek:** Ayşe ve Hande aynı talebe aynı anda bakıyor. Ayşe onaylıyor. Hande Deny'a basınca 409 alıyor, "This request changed" notu yazılıyor, ama liste tazelenince talep Closed'a geçtiği için çekmece kapanıyor ve not hiç görünmüyor (`:211-214`, `:443`).
- Son karar anı geçmiş ama süre işi henüz koşmamış talepte (en çok 5 dk) Approve hep 409 dönüyor.
- Time off listesine canlı yenileme bağlı değil. Önbellek 30 sn taze sayılıyor (`App.tsx:134`).
- **BL:** YENİ. `leave: low / do: safe`.

**D3. Çalışanın kendi geri çektiği bekleyen talep Closed'da "Revoked · No longer approved leave" diye görünüyor.**
- Talep hiç onaylanmamıştı. Talebin parçaları `pending` durumunda kalıyor.
- **Kanıt:** `employee_request_action_service` (`20260924163120…:314`) durumu `revoked` yapıyor; `TimeOffPeriods.tsx:13` bu metni yazıyor.
- **BL:** YENİ. `leave: low / do: safe`.

**D4. Revoke penceresi açılmış vardiyaların açık kaldığını söylemiyor (P25).**
- Tamamen geçmiş ya da başlamış izinde Revoke düğmesi yine görünüyor ve "Nothing of this time off is left to revoke" hatasına gidiyor.
- **Kanıt:** `ScheduleRequestsPage.tsx:528-534`, `:685`.
- **BL:** YENİ. `leave: low / do: safe`.

**D5. Saat ve tarih biçimi tutarsız (P12, KARARLAR saat biçimi).**
- Activity satırı `toLocaleString()` kullanıyor (`:820`). Türkçe tarayıcıda tarih Türkçe çıkıyor ve saat cihazın saati.
- Onay saati her zaman 12 saat biçiminde ve cihaz saatinde (`TimeOffProgressPanel.tsx:71-73`).
- "Submitted" yılsız ve cihaz gününe göre (`:852-858`).
- Shift changes'te de aynı aile var (`ShiftExchangeHub.tsx:726-729`, `:1205`, `:1451`).
- **BL:** BL-674. Time off satırları o maddede yok; eklenmeli. `leave: low / do: safe`.

**D6. Ölü kod.**
- `AvailabilityDraftScope` sarmalayıcısı ve "Discard request decision?" metinleri hiç devreye girmiyor (`:62-72`), çünkü sayfada kayıtlı taslak yok. Shorten'da seçilen saatler ve yazılan not, çekmece kapanınca sorulmadan kayboluyor. P26 açısından sorulabilir.
- `conflict_count` her satır için hesaplanıyor ama web kullanmıyor.
- `.request-sr-only` CSS sınıfı kullanılmıyor (`requests-catalog.css:221`).
- `request()` fonksiyonunun `_workspaceId` parametresi yok sayılıyor.
- `shift-exchanges.css`'te 4 `.dark` kuralı ve 30 ham hex renk var.
- `ShiftExchangeHub.tsx:45` kullanılmayan bir yeniden dışa aktarma.
- **BL:** YENİ. `leave: low / do: safe`.

**D7. Shift changes: Decline ve Close düğmeleri yeşil, tek tıkla çalışıyor.**
- Kural: yıkıcı eylem kırmızı ve iki tık (`ShiftExchangeHub.tsx:1589`).
- **BL:** YENİ. `leave: low / do: safe`.

**D8. Çalışana giden karar bildirimi sonucu söylemiyor.**
- Onayda da redde de "Time-off request updated / Your time-off request status changed." yazıyor.
- **BL:** YENİ. `leave: low / do: safe`.

**D9. Settings → Roles'taki izin açıklaması var olmayan bir işlemi sayıyor.**
- "Approve, deny, return, and revoke" yazıyor; "return to pending" yok (`public.permissions` satırı, K6).
- **BL:** YENİ. `leave: low / do: safe`.

**Bu keşifte kısmen yeniden ölçülen eski maddeler:**
- **BL-399:** "Revoke tek tık" artık bayat. Gerekçesi zorunlu onay penceresi var (`:528-534`, `:560`). Görünüm kısmı ölçülmedi.
- **BL-512 (1):** tarih artık "Sat, Oct 10" biçiminde (`TimeOffPeriods.tsx:9`); bayat görünüyor.
- **Geçerli kalanlar:** BL-653 (`:714-728`), BL-396 (bildirim metni duruyor), BL-375.

## 2. Test boşlukları

**vitest (`apps/web/src/views/ScheduleRequestsPage.test.tsx`).** Şunlar için test yok:
- Needs review ↔ Closed geçişi, lokasyon filtresi, arama, sıralama, Older/Newest.
- `?request=` bağlantısının bekleyen, kapanmış ve ikinci sayfadaki talebi açması.
- 409 geldiğinde talebin kapandığı durum.
- Shorten'ın hata ve 409 yolu.
- Geçmiş izinde Revoke.
- Activity satırlarının biçimi.
- Shift changes: "Record my approval" 0, 409 0, "Recheck needed" 0.

**API (`apps/api/src`).**
- Sayfalamanın kesintisiz sürdüğünü deneyen test yok; `app.test.ts:845` yalnız parametrenin geçtiğine bakıyor.
- `time-off-shorten-routes.test.ts`'te 409 ve metin testi yok.
- `view=manager` değerinin veritabanına gittiğini gösteren test yok.

**pgTAP (`supabase/tests`).**
- `schedule_requests.test.sql`'de sayfa başlangıcı (cursor) testi yok; Y1 bunu gösteriyor.
- İptal onayında ve bekleyen iptalli revoke'ta bildirim sayısı denenmiyor.
- Çok lokasyonlu ya da sistemin onayladığı iznin kısaltma alıcıları denenmiyor.
- Özel "View" rolünün bekleyen talebi görmesi denenmiyor.
- Belgesi gecikmiş müdürün okuması (S3) denenmiyor.
- Takasta eş rütbe onayı, yol/dinlenme işareti, owner/admin bildirim kitlesi, ret dalında kendi vakası denenmiyor.
- Şart değişikliği testi ters davranışı kilitliyor (`weekly_exchange_changed_terms.test.sql:116`).

**e2e (`e2e/flows`).**
- `time-off-approval.spec.ts` dört senaryoyu kapsıyor: iki lokasyon, red, admin tek başına, owner + revoke.
- Yok: müdürün iptal talebini onaylaması, müdürün Shorten'ı, filtre/arama, bildirimden açılış, iki müdürün yarışı, Shift changes'te müdür reddi, kapatma ve eş rütbe.

## 3. Sınırda
- **Çalışan ekranıyla ortak parçalar:**
  - `employee-hub/TimeOffPeriods.tsx`, `TimeOffReleasedAssignments.tsx`, `time-off-split.ts`, `TimeOffCancellationHours.tsx`, `time-off.css`. Requests çekmecesi ile Employee Hub aynı dosyaları kullanıyor; D3 ve D5 iki ekranı da etkiler.
  - `ShiftExchangeHub` Shift Hub (ekran 13) ile ortak.
  - `refreshExchangeSurfaces` bir karardan sonra 7 yüzeyi tazeliyor (`exchange-data.ts:139-147`).
- **Workspace → "Pending requests":**
  - Time off sayısı `get_workspace_dashboard_service`'ten geliyor; sekme sayısıyla aynı çekirdek kuralı. Bu ikiz SQL ama ikisi aynı testte deneniyor (`time_off_seen_by_who_decides.test.sql:62`).
  - Shift changes sayısı web'de hesaplanıyor (`WorkspacePage.tsx:111`).
- **Notifications:** bağlantılar `?tab=time-off&request=` ve `?case=`. O3, O4 ve O5 bu ekranda görünür.
- **Sol menü ve rota koruması:** izin anahtarına bakıyor (`AppShell.tsx:79`, `PermissionRoute`). BL-176.
- **Employee Hub "Cancel request":** durumu `revoked` yapıyor (D3).
- **Settings → Roles:** Time off "View" seviyesi (O6), izin açıklama metni (D9).
- **Belge kısıtı yönlendirmesi** (`DocumentAccessRoute`) (O7).

## 4. Kanıtlanamayanlar
- **O1:** Arama kutusunun odak kaybı tarayıcıda denenmedi. Dayanak: TanStack Query v5'te yeni anahtar → `isLoading` true → `:279` bütün sayfayı yükleme ekranıyla değiştiriyor.
- **Performans ölçülmedi.** `get_schedule_requests_service` workspace'teki her kişi için çekirdeğe soruyor (fonksiyonun kendi "ponytail" notu da bunu söylüyor), bekleyen her satır için ilerleme ve etkiyi hesaplıyor. Yerel veride en çok 7 talep var; ölçüm anlamsız olurdu.
- **Shift changes'te karar mesajı çekmecenin arkasında kalabilir.** Arka plan devre dışı kalıyor (`ShiftExchangeHub.tsx:511-522`, `CatalogDrawer.tsx:39-41`; BL-515 ailesi). Tarayıcıda bakılmadı.
- **Silinen lokasyondaki açık vakada ham `'location not found'` hatası** çıkabilir (candidate_base satır 15). Veri kurulamadı, yazma yasaktı.
- **Özel rolde lokasyon filtresi:** Shift changes okuma izni olup Time off okuma izni olmayan lokasyon seçilince bütün sayfa erişim-yok kartına dönüyor (veritabanı fonksiyonu satır 22-25 42501 atıyor). Yalnız kod okumasıyla.
- **Y2** canlı bir vakada denenmedi; yerel ayarlar 0 dk. Hüküm kod satırlarından.

## Kanıt listesi (komut + sonuç)
- **K0** `git log --oneline -1` → `e929abc7`. Yerel DB'deki migration sayısı = depo = 427; son sürüm `20261007030000`.
- **K1** `get_schedule_requests_service(owner 0ec231ca…, ws dfd65df0…, 'closed', …, limit 100 / 2 / 2+cursor)` → tam liste 7 kayıt; sayfa 1: 486c06be, c7673207 (cursor `…21:40:16.145898`); sayfa 2: 33804531, 7aed6306. **6835ab46 yok.**
- **K2** `pg_get_functiondef` ile okunan fonksiyonlar (dökümler scratchpad'de `fn/*.sql`): `get_schedule_requests_service`, `decide_time_off_service`, `time_off_finalize`, `revoke_time_off_service`, `shorten_time_off_service`, `app_private.shorten_time_off`, `time_off_state`, `time_off_progress`, `time_off_impact`, `time_off_sweep`, `notify_schedule_request_event_service`, `time_off_notify_shifts_opened`, `notify_time_off_shortened`, `employee_request_action_service`, `weekly_assignment_candidate_base`, `shift_exchanges_command_service`, `shift_exchanges_candidates_service`.
- **K3** `select * from app_private.authz_actions where key like 'exchange%' or key like 'time_off%' or key like 'requests%'` → `time_off.decide`, `exchange.approve`, `time_off.revoke`, `requests.read`: `no_self=t`, `rank_below=t`, `restricted_ok=f`.
- **K4** Rol izin sayımı → sistem rollerinde okuma ve yönetim izni birlikte. Rol düzenleyicide `read` / `edit` ayrı (`role-permissions.ts:66-73`).
- **K5** `prosrc ~ 'schedule_actor_has_capability_service'` → `shift_exchange_emit_notification_base`, `shift_exchange_notification_allowed`, `shift_exchange_preview`, `shift_exchanges_command_service`, `time_off_event_released_assignments`.
- **K6** `select * from public.permissions where key ~ 'time_off'` → "Approve, deny, return, and revoke time off requests."
- **K7** Tetikleyiciler: `schedule_time_off_events` → `notify_schedule_request_event_service`. Zaman damgası `time_off_` olayları: `denied`, `approved`, `submitted`, `revoked`.
- **K8** Migration satırları:
  - Cursor: `20261003040000…:925`.
  - İptal onayındaki ana izin olayı: `:253`.
  - "Time off withdrawn or revoked": `:726`.
  - Kısaltma alıcısı: `:615`.
  - "stale approved leave": `:567`.
  - "Cancelled by employee": `20260924163120…:314`.
- **K9** CSS sınıf taraması (UTF-8 regex, `requests-catalog.css` → `apps/web/src` .ts/.tsx, testler hariç) → kullanılmayan yalnız `request-sr-only`.
- **K10** `useAvailabilityNavigationGuard` kullananlar → Requests sayfası ve alt bileşenleri yok (D6).
- **K11** Bildirim kuyruğu: aynı talep ve aynı alıcı için `shifts_opened` + `decided` → 5 talepte çift satır (örnek 14550b8a…/17a71bbe…).
- **K12** `get_notification_inbox_v2_service` içinde `group_key` → yalnız sütun olarak taşınıyor, birleştirme yok.
- **K13** `grep` test dosyaları:
  - `ScheduleRequestsPage.test.tsx`: 29 `it`; arama/filtre/sayfa/bağlantı testi yok.
  - `schedule_requests.test.sql`: `cursor` 0.
  - e2e: Requests'e giden 3 akış.
- **K14** (doğrulama, alt ajan bulgusu Y2) candidate_base satır 59-68 → yol süresi aşılınca `state:='ineligible'`.
- **K15** (doğrulama, O5) kitle sayımı → owner 138 / admin 138 / manager 428 (`peer_accepted`), 132 / 132 / 251 (`scope_approved`).
- **K16** (doğrulama, Y3) komut satır 81-82, 134 → `schedule_actor_has_capability_service`.

Hiçbir dosya yazılmadı, commit yapılmadı; yerel DB'de yalnız SELECT ve `pg_get_functiondef` koşuldu, vitest koşulmadı.
