# D — Announcements (sol menü → Announcements): kod ve davranış (EKRAN-07, 2026-10-06, `6e7ac0dd`)

## Özet (en çok 8 satır)
- **En önemli tespit:** FB-6.7'nin duyuru kısmı durdu ve yeniden planlanacak (görev dosyası "durdu", 2026-10-04 #170). Bu yüzden kod hâlâ 2026-10-02 kurallarıyla çalışıyor. 2026-10-04/05'te Mert'in koyduğu kurallar kodda yok: K19–K27 ve K3/K4/K5/K8/K12 ekleri.
- **Yüksek önemde iki sorun var:**
  1. Arşivlenen duyuru ekrandan geri alınamıyor. Ekranda Unpublish de yok. Sunucuda ikisi de hazır, ekran çağırmıyor.
  2. Duyuru, listede seçilmemiş müdürlere, admin'lere ve owner'a kendiliğinden gidiyor. Bu eski K5 kuralı; duyuru için ters çevrildi.
- **Orta önemde dokuz sorun var:**
  1. Hedef kitle sabit kişi listesi değil, kurala göre hesaplanıyor (K24).
  2. Onay anahtarı ve rütbe kuralı yok (K22).
  3. Metin değişince onaylar kimseye sorulmadan sıfırlanıyor (K27).
  4. Onay takibi yok: kim onayladı listesi, Remind ve History yok.
  5. Süresi dolan ya da yayınlanamayan duyuru listede "Published" / "Scheduled" görünüyor.
  6. Bitişi uzatılan duyuru, onaylamış olanlara da yeniden bildirim gönderiyor.
  7. Geçmiş bir tarih yayın ya da bitiş tarihi olarak kabul ediliyor.
  8. Hiç yayınlanmamış taslak başkalarına görünüyor ve "Delete" onu silmiyor, arşivliyor.
  9. Veritabanının teknik İngilizce cümleleri ekrana çıkıyor.
- **Düşük önemde:**
  - yanlış başarı mesajları;
  - arşivli duyuruda çalışmayan Acknowledge düğmesi;
  - çalışan görünümünün Home kartında arşivli duyuru;
  - saat dilimi;
  - sayfalama yok (BL-787);
  - ekranın kullanmadığı alanlar ve uçlar.
- **Yöntem:** zinciri web → API → veritabanı sırasıyla okudum. Yerel veritabanında yalnız `begin read only … rollback` içinde SELECT çalıştırdım. Test, build ve sunucu çalıştırmadım.

## Ekranın sınırı
- **İçeride:**
  - **Web:** `/app/announcements` ve `/app/announcements/:id` (`apps/web/src/views/AnnouncementsPage.tsx`, 1066 satır). Liste, sekmeler, süzgeç, arama ve sıralama. Yazma / düzenleme penceresi (`AnnouncementEditor`), Publish / Schedule, "Delete" (aslında arşiv) ve okuma onayı (`AcknowledgeControl`).
  - **Çalışan tarafı:** Employee view → Home → "Team notices" kartı (`employee-hub/DashboardCommunications.tsx:76-128`).
  - **Veri katmanı:** `communications/communications-data.ts:125-176`.
  - **API:** `apps/api/src/communications/communication-routes.ts:82-178` ve `communication-service.ts:134-185`. Uçlar: GET liste, POST kaydet, POST publish / unpublish / archive / restore, POST acknowledge.
  - **Veritabanı:**
    - Son tanımlar `20261005000000_closed_days_reach_the_shifts.sql`'de: `get_announcements_service` :996, `save_announcement_audience_service` :854, `announcement_release` :794.
    - `20261004000000_announcements_and_dates_ask_the_core.sql`'de: `publish_announcement_service` :906, `set_announcement_state_service` :961, `acknowledge_announcement_service` :1030, `communication_reaches` :424, `announcement_recipients` :593, `announcement_visible` :669.
    - `pg_cron` işi `announcements-due` her dakika çalışıyor; yerelde var, ölçüldü.
- **Sınırda (burada yeniden yazılmadı):**
  - Workspace'teki Announcements kutusu (BL-564, BL-810, K28; EKRAN-05);
  - Important Dates;
  - Notifications (bildirimin kendisi);
  - Settings → Acknowledgements (BL-053).

## Akış haritası
- **Liste:**
  - `GET …/communications/announcements` → `get_announcements_service`.
  - Fonksiyon her okumada önce `announcement_release`'i çalıştırıyor. Yani okuma vakti gelen duyuruyu yayınlıyor, süresi dolanı gelen kutularından çekiyor ve satır kilitliyor.
  - Sonuç, sayfalamasız tek bir JSON. Görünürlük iki kuraldan biri tutunca var:
    - kişi duyuruyu değiştirebilir (`control.allowed`);
    - duyuru yayında ve okuma anında kişiye "ulaşıyor" (`announcement_out_to`).
  - Süzgeç, arama ve sıralama tamamen istemcide.
- **Kaydetme:** `save_announcement_audience_service`.
  - Sürüm numarası kontrol ediliyor. İki kişi aynı anda düzenlerse ikincisi reddediliyor (40001).
  - İçerik (başlık, metin, kategori, link) değişince onaylar silinip herkese yeniden bildirim gidiyor (:935-976).
  - Yayın saati silinen zamanlanmış duyuru taslağa dönüyor. Bu K25'e uygun.
- **Yayın:** `publish_announcement_service`.
  - Gelecek saat verilmişse duyuru "scheduled" oluyor. Verilmemişse hemen "published" oluyor ve `announcement_recipients` alıcı listesini çıkarıyor.
  - Yeniden yayında bildirim yalnız onaylamamışlara gidiyor.
- **Arşiv / Unpublish / Restore:** `set_announcement_state_service`.
  - Restore'da hiç yayınlanmamış duyuru taslak olarak, bir kez yayınlanmış duyuru "unpublished" olarak dönüyor. Bu K8 ekine uygun.
  - **Web yalnız `publish` ve `archive`'ı çağırıyor** (`AnnouncementsPage.tsx:565`).
- **Onay:** `acknowledge_announcement_service`. Duyuruyu görebilen herkes onaylayabiliyor; rütbeye ya da anahtara bakılmıyor.

## Bulgular

**D1 — Arşivlenen duyuru ekrandan geri alınamıyor; Unpublish de yok (K8).**
- **Önem:** yüksek.
- **Nerede:** Announcements → satır menüsü "Delete" ya da pencerede "Delete" → "Confirm delete" ile duyuru Archived sekmesine gidiyor. Archived sekmesinde açılan pencere salt okunur; Restore düğmesi yok. Yayındaki duyuruyu gizlemek için Unpublish düğmesi de yok.
- **Örnek:** owner Zeynep "Yeni menü tadımı" duyurusunu yanlışlıkla "Delete" ile kaldırıyor. Duyuru Archived'de görünüyor ama Zeynep onu hiçbir yoldan geri getiremiyor; ancak yeniden yazabiliyor. K8 "ikisi de geri alınır" diyor.
- **Kanıt:**
  - Web'de yalnız iki eylem çağrılıyor: `AnnouncementsPage.tsx:564-571` (`mutationFn: (action: "publish" | "archive")`). Pencerede `can_restore` ve `can_unpublish` hiç okunmuyor (grep 0).
  - API uçları var: `communication-routes.ts:129-156`, `for (const action of ["publish","unpublish","archive","restore"])`.
  - Veritabanı fonksiyonu hazır: `20261004000000:961-1013`. Liste bayrakları gönderiyor: `20261005000000:1066-1068`.
- **İşaret:** `leave: high / do: safe` (sunucu ve testleri hazır).
- **Eşleşme:** BL-543 kısmen; tazelik notu "main'de Restore yok" diyor ama madde Delete'in adıyla ilgili. Geri alma eksiği için **YENİ** madde önerilir.

**D2 — Duyuru, listede seçilmemiş müdürlere, admin'lere ve owner'a kendiliğinden gidiyor (K5 duyuru için ters çevrildi, K24).**
- **Önem:** yüksek.
- **Nerede:** duyuruyu yayınlayınca alıcı listesi hesaplanırken.
- **Örnek:** Kadıköy müdürü Ayşe yalnız Kadıköy çalışanlarına bir duyuru yazıyor. Kadıköy'ün öteki müdürü Hande, admin ve owner Zeynep de bildirim alıyor, çünkü "lokasyonu yöneten herkes" kendiliğinden alıcı. Mert 2026-10-04'te "yalnız listedekiler alır" dedi. Anti-hedef: bildirim gürültüsü.
- **Kanıt:**
  - `communication_reaches` koşulu `state.manages && live or (everywhere and cardinality(state.manages) > 0)` (`20261004000000:433-434`); `announcement_recipients` bunu kullanıyor (:593-605).
  - SELECT (yerel, salt okuma): müdürlerin yazdığı son 8 duyurunun her birinde alıcıların 2–3'ü müdür, admin ya da owner (`mgmt_in_delivered` = 3 / 2).
- **İşaret:** `leave: medium / do: risky` (alıcı kuralı ve bildirim).
- **Eşleşme:** **YENİ** (FB-6.7'nin duyuru yeniden planı; açık BL yok).

**D3 — Hedef kitle sabit kişi listesi değil; kural her okumada yeniden hesaplanıyor (K24).**
- **Önem:** orta.
- **Nerede:** Audience bölümü (Roles × Locations × Departments × Jobs) ve okuma anındaki görünürlük.
- **Örnek:** "Kadıköy Bartenders" duyurusu yayınlandı. Ertesi hafta işe başlayan KadıköyGarson7 duyuruyu listede görüyor ve onaylayabiliyor ama bildirim almadı. K24'e göre elle eklenmedikçe hiç almamalı. Tersine, Erenköy'e taşınan Can duyuruyu kaybediyor; K24 "listede kalır" diyor.
- **Yan etkisi:** "18 of 24 acknowledged" hesabı tutarsız kalıyor. `acknowledged_count` bütün onayları sayıyor (:1055). `recipient_count` ise yayın anındaki listeden (`delivered_to`) geliyor (:1058). Onaylayan sayısı alıcı sayısını geçebilir.
- **Kanıt:**
  - `announcement_out_to` ve `communication_reaches` her okumada çalışıyor (`20261004000000:653-665`); `delivered_to` yalnız yayında yazılıyor.
  - Web'de kişi listesi yok, filtre seçicileri var: `AnnouncementsPage.tsx:737-783`.
- **İşaret:** `leave: medium / do: risky`.
- **Eşleşme:** **YENİ** (FB-6.7 yeniden planı).

**D4 — Onay anahtarı yok, rütbe kuralı yok (K22).**
- **Önem:** orta.
- **Nerede:**
  - çalışanın listesi → Status sütunu;
  - pencere → Acknowledge;
  - veritabanı: onay sayısı.
- **Örnek:**
  - Onay istenmemiş bir "Inventory day" duyurusunda da Ali'ye "Acknowledge" çıkıyor.
  - KadıköyMüdür1'in duyurusunu alan eş müdür, admin ya da owner da onaylayabiliyor ve sayılıyor. K22: yalnız yayınlayandan alt rütbedekiler sayılır.
- **Kanıt:**
  - Veritabanında anahtar sütunu yok (grep: `announcements` tablosuna onay anahtarı eklenmemiş).
  - `acknowledge_announcement_service` yalnız izni ve görünürlüğü kontrol ediyor (`20261004000000:1030-1050`); `acknowledged_count` bütün satırları sayıyor (`20261005000000:1055`).
  - Web: `AnnouncementsPage.tsx:383-386`, `:840-842`.
- **İşaret:** `leave: medium / do: moderate`.
- **Eşleşme:** BL-675 (anahtar). Rütbe kısmı BL-675'e **ek** olarak yazılmalı.

**D5 — İçerik değişince onaylar kendiliğinden sıfırlanıyor; yayınlayana sorulmuyor (K27, K4 eki).**
- **Önem:** orta.
- **Nerede:** yayındaki duyuru → düzenle → "Save changes".
- **Örnek:** Zeynep 20 kişinin onayladığı duyurudaki tek harfi düzeltiyor. 20 onay sessizce siliniyor, herkes yeniden bildirim alıyor. K27'ye göre "onaylar kalsın / sıfırlansın" sorulmalı.
- **Kanıt:** `20261005000000:935-961` (`content_changed` ise `delete from public.announcement_acknowledgements`) ve :968-970 (herkese yeniden gönderim). Pencerede soru yok.
- **İşaret:** `leave: medium / do: moderate`.
- **Eşleşme:** **YENİ** (FB-6.7 yeniden planı).

**D6 — Yöneticinin onay takibi yok: onay listesi, "N of M", Remind ve History yok (K23, K26, B6, C1).**
- **Önem:** orta.
- **Nerede:** yönetici penceresinde yalnız tek sayfalık form var; Details / Audience / Acknowledge / History sekmeleri yok.
- **Örnek:** Zeynep 24 kişiye duyuru gönderiyor. Kimin onayladığını, kimin "Not yet" kaldığını göremiyor, hatırlatma gönderemiyor, kimin ne zaman ne değiştirdiğini göremiyor.
- **Kanıt:**
  - Sunucu `acknowledged_count`, `recipient_count` ve `content_changed_since_acknowledged` gönderiyor ama web hiçbirini okumuyor (`apps/web/src` grep 0).
  - Kişi bazlı onay okuması, hatırlatma ucu ve duyuru geçmiş tablosu yok; yalnız `audit_events` satırı var.
- **İşaret:** `leave: medium / do: moderate`.
- **Eşleşme:** **YENİ** (FB-6.7 yeniden planı).

**D7 — Süresi dolan ve yayınlanamayan duyuru listede yanlış durumda; yazara "Couldn't publish" bildirimi gitmiyor (K12, KK-98, K21, A9/A10).**
- **Önem:** orta.
- **Nerede:** Announcements → Status sütunu ve çip.
- **Örnek:**
  - 15 Ekim'de süresi dolan duyuru 16 Ekim'de hâlâ yeşil "Published" görünüyor.
  - Admin1'in Salı 09:00 duyurusu yayınlanamıyor. Liste sonsuza kadar "Scheduled" diyor; Admin1'e bildirim gitmiyor.
- **Kanıt:**
  - Veritabanı `display_status` ("expired" / "publish_failed") ve `publish_error_code` gönderiyor (`20261005000000:1034-1038`). Web `statusLabel` yalnız `status` ve `archived_at`'a bakıyor (`AnnouncementsPage.tsx:1043-1045`).
  - `announcement_release` hata durumunda yalnız `release_failed_at` yazıyor, bildirim kuyruğuna bir şey koymuyor (:826-830).
- **İşaret:** `leave: medium / do: safe`; K21 kısmı `do: moderate`.
- **Eşleşme:** **YENİ**.

**D8 — Süresi dolmuş duyurunun bitişi uzatılınca onaylamış olanlar da yeniden bildirim alıyor (K12 eki).**
- **Önem:** orta.
- **Nerede:** süresi dolmuş duyuru → Expires at ileri alınıyor → Save changes.
- **Örnek:** duyuru 16 Ekim'de doldu; Zeynep bitişi 20 Ekim'e alıyor. Onaylamış 18 kişi de yeniden bildirim alıyor. Kurala göre yalnız onaylamamış 6 kişi almalı.
- **Kanıt:** süre dolunca alıcı listesi boşaltılıyor: `20261005000000:842` (`delivered_to = '{}'`). Kayıt "listede olmayan herkesi" yeni sayıp hepsine gönderiyor (:977-978); onaylayanlar ayıklanmıyor.
- **İşaret:** `leave: medium / do: safe`.
- **Eşleşme:** **YENİ** (FB-6.7 notu §3c'de anılmış; BL yok).

**D9 — Geçmiş yayın ya da bitiş tarihi kabul ediliyor; yayındaki duyuru geçmiş bitişle kaydedilince sessizce herkesten çekiliyor (K20, P09).**
- **Önem:** orta.
- **Nerede:** pencere → Publish at / Expires at.
- **Örnek:** Ayşe 6 Ekim'de yanlışlıkla bitişi 5 Ekim seçip kaydediyor. Duyuru o an herkesin gelen kutusundan kalkıyor; Ayşe'ye ne olduğu söylenmiyor.
- **Kanıt:**
  - Sunucu yalnız "bitiş yayından sonra mı" kontrolünü yapıyor (`20261005000000:915`); şimdiye göre kontrol yok. Shared şema da aynı (`communications.ts:45-57`). Tarih alanlarında `min` yok (`AnnouncementsPage.tsx:697-716`).
  - Geçmiş bitişte alıcı listesi boş hesaplanıyor (:965) ve herkes "çıkarılmış" sayılıyor (:973-975).
- **İşaret:** `leave: medium / do: safe`.
- **Eşleşme:** **YENİ**.

**D10 — Hiç yayınlanmamış taslak başkalarına görünüyor; "Delete" onu silmiyor, arşivliyor (K19).**
- **Önem:** orta.
- **Nerede:** Announcements → Draft sekmesi ve "Draft (N)" sayısı; satır menüsü → Delete.
- **Örnek:**
  - KadıköyMüdür1'in yarım taslağını owner, admin ve öteki Kadıköy müdürü listede görüp düzenleyebiliyor. K19'a göre taslak yalnız yazanındır.
  - Taslağı "Delete" ile atınca taslak Archived'e düşüyor. K19'a göre gerçekten silinmeli ve arşivde görünmemeli.
- **Kanıt:** görünürlük `control.allowed` (`20261005000000:1086`); `can_archive` her durumda açık (:1067). Web: `AnnouncementsPage.tsx:428-440`, `:584-587`.
- **İşaret:** `leave: medium / do: moderate`.
- **Eşleşme:** BL-543 (Delete → arşiv kısmı). Görünürlük kısmı **YENİ**.

**D11 — Ham teknik hata metinleri ekrana çıkıyor; tarayıcıdaki doğrulama hatası hiç gösterilmiyor.**
- **Önem:** orta.
- **Nerede:** pencerenin altındaki kırmızı satır (`AnnouncementsPage.tsx:799-803`) ve listenin hata satırı (:267-270).
- **Örnekler:**
  - Ayşe ile Hande aynı duyuruyu aynı anda düzenliyor. İkincisi kaydederken "stale announcement revision" görüyor ve yenileme yolu sunulmuyor.
  - Zamanlanmış duyuruya yayın dakikasında Publish basılırsa aynı metin çıkıyor.
  - Süresi dolmuş taslağa Publish basılınca "This announcement has expired".
  - Müdür "All locations" seçince yalnız "Not allowed" (D12).
  - Ayrıca "Choose at least one location", "valid announcement content required" ve "active workspace department and job required" metinleri de çıkabiliyor.
  - Tarayıcıdaki doğrulama ("Expiry must be after publication") Save düğmesini sessizce kapatıyor, nedeni yazılmıyor (`canSave`, :589).
- **Kanıt:** veritabanındaki `raise` cümleleri `20261005000000:874-916`, :929-933; `20261004000000:933`. API bunları olduğu gibi geçiriyor (`http-error.ts:138-142`: yalnız tırnaklı Postgres cümlesini değiştiriyor).
- **İşaret:** `leave: medium / do: safe`.
- **Eşleşme:** **YENİ** (Documents D-raporundaki bulguyla aynı aile).

**D12 — Müdür birden çok lokasyon ya da "All locations" seçebiliyor; Save'de yalnız "Not allowed" alıyor (K1).**
- **Önem:** düşük-orta.
- **Nerede:** pencere → Audience → Locations seçicisi.
- **Örnek:** Kadıköy ve Erenköy müdürü Veli iki lokasyonu birden seçip kaydediyor; sebep yazılmadan reddediliyor.
- **Kanıt:** `can_target_workspace` yalnız ilk taslakta kullanılıyor (`AnnouncementsPage.tsx:494-498`); seçici her şeye izin veriyor (:750-760).
- **İşaret:** `leave: low / do: safe`. K24 kişi listesi gelince bu seçici zaten değişecek.
- **Eşleşme:** **YENİ**.

**D13 — Yanlış başarı mesajları.**
- **Önem:** düşük.
- **Nerede:** listenin üstündeki durum satırı.
- **Örnekler:**
  - Yayındaki duyuru kaydedilince "Announcement saved as a draft." çıkıyor (:556-560).
  - Gelecek tarihli duyuruda Schedule'a basınca "Scheduled for 0 recipients." çıkıyor, çünkü zamanlamada kimseye gönderilmiyor (:574-578; veritabanı `told := '{}'`, `20261004000000:938-939`).
  - Yeniden yayında "Published for 6 recipients." çıkıyor; 6 yalnız onaylamamışlar, toplam 24.
  - "1 recipients" (tekil / çoğul hatası).
- **İşaret:** `leave: low / do: safe`.
- **Eşleşme:** **YENİ** ("saved as a draft" FB-6.7 notunda var, BL yok).

**D14 — Arşivli duyuruyu açan yönetici ya da owner "Acknowledge" görüyor; basınca sessizce başarısız oluyor.**
- **Önem:** düşük.
- **Nerede:** Archived → satırı aç → pencerenin altı.
- **Örnek:** Zeynep arşivdeki duyuruyu açıyor, Acknowledge'a basıyor. Hiçbir şey olmuyor; "Not allowed" yalnız düğmenin üzerine gelince ipucu olarak görünüyor.
- **Kanıt:**
  - Arşivde düzenleme kapalı olduğu için koşul `!editable && status !== "draft"` doğru çıkıyor (`AnnouncementsPage.tsx:840-842`); hata yalnız `title` özniteliğinde (:905).
  - Veritabanı arşivliyi reddediyor (`20261004000000:1040-1042`).
- **İşaret:** `leave: low / do: safe`.
- **Eşleşme:** **YENİ** (FB-6.7 notunda "arşivli duyuruda müdüre Acknowledge"; BL yok).

**D15 — Employee view → Home → "Team notices" kartı arşivli duyuruyu da gösteriyor.**
- **Önem:** düşük.
- **Nerede:** müdür ya da owner üst menüden çalışan görünümüne geçtiğinde Home sayfası.
- **Örnek:** Zeynep arşivlediği "Eski üniforma kuralı" duyurusunu çalışan görünümünde "Team notices"ta görmeye devam ediyor. Ayrıca kendisine hedeflenmemiş, yalnız yönettiği lokasyonların duyurularını da görüyor.
- **Kanıt:**
  - Kart yalnız `status === "published"` ve süre koşuluna bakıyor; `archived_at`'a bakmıyor (`DashboardCommunications.tsx:91-97`).
  - Liste arşivliyi değiştirebilene gönderiyor (`20261005000000:1086`).
  - Görünüm değiştirme yalnız çalışan olmayana açık: `AppShell.tsx:258`.
- **İşaret:** `leave: low / do: safe`.
- **Eşleşme:** **YENİ** (Workspace'teki aynı türden hata BL-564; bu ayrı ekran).

**D16 — Yayın ve bitiş saati tarayıcının saat diliminde; lokasyonun saat dilimi kullanılmıyor.**
- **Önem:** düşük. Karar gerekiyor.
- **Nerede:** Publish at / Expires at alanları (`datetime-local`, `toLocalInput` / `toIso`, :1056-1065), liste tarihleri (`formatDate`, :1049-1055) ve "Schedule" / "Publish" düğme adı (`Date.now()`, :851).
- **Örnek:** New York'taki owner, Los Angeles şubesi için "9:00 AM" seçiyor. Duyuru LA'da sabah 6'da çıkıyor. Bilgisayarın saati yanlışsa düğme adı da yanlış oluyor.
- **Not:** FB-6.7 notu "yayın / bitiş saati mantığı ve saat dilimi konuşulmadı; temel model (P18)" diyor. Mert'e sorulmalı.
- **İşaret:** `leave: low / do: moderate`.
- **Eşleşme:** **YENİ**.

**D17 — Sayfalama yok; çalışanın Home sayfası 2 kart göstermek için bütün listeyi dakikada bir okuyor.**
- **Önem:** düşük.
- **Kanıt:**
  - Veritabanı tek `jsonb_agg` dönüyor, sınır yok (`20261005000000:1022-1089`); web tek liste.
  - Home kartı `getAnnouncements`'ı 60 saniyede bir çağırıyor ve `.slice(0, 2)` yapıyor (`DashboardCommunications.tsx:84-97`). Her okuma `announcement_release` ile satır kilitleyip yazma yapıyor (fonksiyon `volatile`; SELECT ile ölçüldü).
- **İşaret:** `leave: low / do: safe`; kart kısmı `do: moderate`.
- **Eşleşme:** BL-787 (sayfalama). Kart kısmı **YENİ**.

**D18 — Ekranın kullanmadığı alanlar ve uçlar; ikiz istek istemcisi.**
- **Önem:** düşük.
- **Ayrıntı:**
  - API'nin `unpublish` ve `restore` uçları ile `can_unpublish`, `can_restore`, `display_status`, `publish_error_code`, `acknowledged_count`, `recipient_count`, `publish_failed_at` ve `content_changed_since_acknowledged` alanları web'de hiç okunmuyor.
  - `action_url` (bağlantı) ekrandan girilemiyor; yalnız korunuyor ve K4'te "içerik" sayılıyor.
  - `communications-data.ts:30-57` kendi `fetch`'ini kuruyor; ortak istek yardımcısının ikizi.
- **Not:** D1, D6 ve D7 gelince alanların çoğu canlanır; kalanlar silinmeli (P01).
- **İşaret:** `leave: low / do: safe`.
- **Eşleşme:** **YENİ**.

**D19 — Duyuru durumlarında küçük hatalar.**
- **Önem:** düşük.
- **Ayrıntı:**
  - Yeniden yayın `published_at`'ı yeniliyor (`20261004000000:947`). Çalışanın listesindeki "Published date" ilk yayın tarihini kaybediyor; History de olmadığı için ilk tarih hiçbir yerde kalmıyor.
  - Zamanı gelmeden süresi dolan zamanlanmış duyuru, hiç yayınlanmamışken "unpublished" oluyor (`20261005000000:813-814`). K19'a göre bu durum "bir kez yayınlanmış" demek.
  - "Unpublished" duyuru yalnız All sekmesinde görünüyor; kendi sekmesi yok.
- **İşaret:** `leave: low / do: safe`.
- **Eşleşme:** **YENİ**.

**Bugün de geçerli olan açık maddeler** (kod satırları yeniden okundu):
- BL-678: hedef metni her zaman "All departments · All jobs" ekliyor (:1025-1039).
- BL-541 ve BL-542: yazı boyutu ve telefon. Görünüm C raporunun işi; yalnız CSS satırı var.
- BL-539: daraltma ile gönderim arasındaki yarış (mekanizma değişmedi).

## Kanıtlanamayanlar (bu yoldan ölçülmedi)
- Ekranda görsel doğrulama yapılmadı; bulgular kod okuması ve SELECT'e dayanıyor (C görevi).
- `task/fb-6.7-ui` dalında Remind, History ve sekmelerin ne kadarının hazır olduğu ölçülmedi. Dal main'de değil.
- Çok üyeli bir workspace'te yayının ve her okumanın süresi ölçülmedi. `communication_audience` her aktif üye için `app_private.actor()` çağırıyor; 100 kişide maliyeti bilinmiyor.
- BL-539 yarışı ve "aynı dakikada Publish → 40001" durumu kodla gösterildi, elle üretilmedi.
- Canlıda (hosted) `announcements-due` cron işinin çalıştığına bakılmadı; yalnız yerelde var.
- Geri çekilmiş bildirime tıklayan kişinin "This announcement is no longer available." gördüğü kod okumasından çıkarıldı (:465-469).

## Test boşlukları
- **pgTAP:**
  - `announcements_and_dates_follow_k1_k6.test.sql` §6 (K4 kendiliğinden sıfırlama) ve §7 (K5 "müdürler kendiliğinden alır") **eski kuralı** doğruluyor. Yeniden planda yeniden yazılmalı, gevşetilmemeli.
  - Hiç testi olmayanlar:
    - K19 taslak gizliliği ve gerçek silme;
    - K20 geçmiş tarihi reddetme;
    - K22 rütbe ve anahtar;
    - K24 sabit liste: sonradan katılan görmez, lokasyonu değişen kalır;
    - K12 eki: uzatmada yalnız onaylamamışa bildirim;
    - `acknowledged_count ≤ alıcı sayısı`;
    - K21 yazara bildirim.
- **vitest** (`CommunicationPages.test.tsx`; testler arşiv süzgeci, lokasyon süzgeci, taslak oluşturma, K1 başlangıç lokasyonu ve yetkisiz kart):
  - Restore / Unpublish yok (özellik yok);
  - başarı mesajları test edilmiyor (D13);
  - arşivde Acknowledge test edilmiyor (D14);
  - hata metninin ekranda nasıl göründüğü test edilmiyor (D11);
  - Home kartının arşiv süzgeci test edilmiyor (`EmployeeHubPage.test.tsx`'te `archived_at` 0; D15).
- **e2e:** yalnız `announcement-reaches-its-people.spec.ts` var (akış 7: oluştur, yayınla, onayla, kim görür). Unpublish, arşiv, geri alma, zamanlama, süre dolumu ve onaydan sonra düzenleme senaryosu yok.

## Mert'e gidecek karar (§13 şablonuyla)
- **Saat dilimi (D16):** duyurunun yayın ve bitiş saati hangi saatle okunur: lokasyonunki mi, yazanın bilgisayarınınki mi? Workspace geneli duyuruda hangisi? Temel model olduğu için (P18) önce sohbette konuşulmalı. Dayanak: yok, yeni karar. FB-6.7'de açık bırakıldı.

## Yöntem ve ölçüm
- **Repo:** `newfork-wt/plan-ekran-07` @`6e7ac0dd` (= `origin/main`), çalışma ağacı temiz.
- **Yerel veritabanı:** son migration `20261007130000`, depoyla aynı.
- **SELECT'ler** (`docker exec supabase_db_newfork-clean psql`, `begin read only … rollback`):
  - duyuruların durum dağılımı: 15 yayında, arşiv yok, taslak yok;
  - süresi dolmuş ya da yayınlanamamış duyuru: 0;
  - onaylar rol bazında: 12 onay, hepsi çalışan ve hepsi alıcı listesinde;
  - son 8 duyuruda alıcılar içindeki yönetici sayısı (D2'nin kanıtı);
  - `cron.job`: `announcements-due` her dakika;
  - `get_announcements_service` ve `acknowledge_announcement_service` `volatile`.
- **Okunan dosyalar:** KARARLAR K1–K28 ve ekleri, `tasks/FB-6.7.md`, BACKLOG ("Kapanan maddeler" hariç). Test, build ve sunucu çalıştırılmadı; hiçbir dosya yazılmadı.
