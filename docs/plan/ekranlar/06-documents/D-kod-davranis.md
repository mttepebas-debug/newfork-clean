# D — Documents (Settings → Documents ve Employees → Documents): kod ve davranış (EKRAN-06, 2026-10-06, f8e78dc4)

## Özet (en çok 8 satır)
- **Yüksek önemde bir sorun var. Yayındaki bir belge türünü arşivlemek kimsenin zorunluluğunu kapatmıyor.** Çalışan belgeyi istenmiş görmeye devam ediyor. Süresi geçtiyse erişimi kısıtlı kalıyor. Yeni gelen kişiden ise istenmiyor. Owner ekranda "Archived" görüyor, belgenin hâlâ yürürlükte olduğunu görmüyor.
- **Orta önemde yedi sorun var:**
  1. "Warn before expiry (days)" ayarı çalışana giden hatırlatmayı değiştirmiyor. Hatırlatma her zaman 30, 7 ve 1 gün kala gidiyor.
  2. Eksik belgesi olan çalışana sınırsız sayıda, her gün bildirim gidiyor.
  3. Kişinin kendi belgesinde Approve, Reject, Exempt ve Extend düğmeleri açık görünüyor. Basınca sunucu "Not allowed" diyor.
  4. Kapanan bir zorunluluk listeden tamamen kayboluyor. Kural "yüklenen dosya dosyada kalır" diyor ama dosya hiçbir sekmede görünmüyor.
  5. Çekmecede veritabanının İngilizce teknik cümleleri ekrana çıkıyor. İki yönetici aynı anda karar verince ikinciye "document changed; refresh required" yazıyor.
  6. Sayfalama yok. Liste tek okumada geliyor ve her satırın okunma maliyeti var.
  7. Dosya önizlemesi yok, her dosya bilgisayara iniyor.
- **Düşük önemde:** BL-561'in kök nedeni bulundu. Ham tarih ve teknik adlar, ölü bileşen, ikiz istek istemcisi, müdürün belge türü ayrıntısını açamaması ve küçük sıralama hataları var. Var olan BL-595, BL-672, BL-673, BL-476, BL-554 ve BL-469 bugün de geçerli.
- **Yöntem:** kodu web → API → veritabanı → Storage zinciriyle okudum. Yerel veritabanında yalnız `begin read only … rollback` içinde SELECT çalıştırdım. Yerel veritabanının son migration'ı `20261007130000`, depoyla aynı. Test, build ve dev sunucusu çalıştırmadım. Okuma fonksiyonu `list_employee_document_lifecycle_service`'i süre ölçmek için iki kez SELECT içinde çağırdım. Fonksiyon STABLE, yalnız okuyor, salt okuma işlemi içinde koştu.

## Ekranın sınırı
- **İçeride:**
  - **Settings → Documents** (`/app/settings/documents`, `DocumentsSettingsRoute.tsx` → `settings/DocumentsSettingsPage.tsx`):
    - liste, sekmeler, süzgeç ve sıralama;
    - "New document" ve düzenleyici (`DocumentSettingsEditor.tsx` + `documents/DocumentLifecycleFields.tsx`);
    - Publish / Unpublish penceresi (`DocumentPublicationDialog.tsx`);
    - Archive / Restore ve Move up / Move down.
  - **Employees → Documents** (`/app/employees/documents`, `documents/EmployeeDocumentsPage.tsx` → `EmployeeDocumentsList.tsx`):
    - sekmeler, süzgeçler, arama ve sıralama;
    - inceleme çekmecesi (`DocumentReviewDrawer.tsx`): Approve, Reject + gerekçe, düzeltme süresi, dosya başına Keep / Discard, muafiyet, süre uzatma, belge saat dilimi, indirme, History.
  - **API:**
    - `apps/api/src/employees/document-lifecycle-routes.ts` ve `-service.ts`;
    - `apps/api/src/settings/document-types-routes.ts`.
  - **Veritabanı:** `list_/get_/review_/submit_employee_document_lifecycle_service`, `set_document_type_archived_service`, `set_document_publication_service`, `documents_maintain_service`, `app_private.document_*`.
  - **Storage:** `employee-onboarding` bucket'ı.
- **Sınırda:**
  - Account → Documents;
  - onboarding'deki belge adımı;
  - `DocumentAccessRoute` engeli;
  - Schedule'daki belge uyarısı;
  - Workspace'teki belge süresi işleri (BL-806 ve BL-807; burada yeniden yazılmadı);
  - Employees çekmecesindeki Documents bölümü (`EmployeeDocumentPanel.tsx`).

## Akış haritası
- **Settings → Documents listesi:**
  - Ekran `readSettings(…,"document-types")` ile okuyor. Sıralama, süzgeç ve arama tamamen istemcide yapılıyor.
  - Yazma işleri ayrı bir `fetch` ile gidiyor: `settings/documents-data.ts:17-45`. Bu, ortak `apiRequest`'in ikizi (D9).
- **Yayın:**
  - Pencere önce etki önizlemesini alıyor (`publication-preview`), sonra gerekçe zorunlu bir Confirm adımı geliyor.
  - Unpublish, açık bütün zorunlulukları duraklatıyor ve son tarihleri siliyor. Yeniden yayında süreler baştan başlıyor (`set_document_publication_service`; pencere metni bunu söylüyor).
- **Arşiv:** `set_document_type_archived_service` yalnız `archived_at` alanını yazıp bir denetim kaydı bırakıyor (Y1).
- **Employees → Documents listesi:**
  - `GET /v1/workspaces/:ws/employee-documents` → `list_employee_document_lifecycle_service`.
  - Veritabanı her satır için sırasıyla şunları yapıyor:
    - yetki çekirdeğine sorar (`document_actor_can_read` → `authz_reason(documents.read, kişi)`);
    - bekleyen yüklemeyi karar veremeyenden gizler (`document_row_readable`, `document_view`);
    - durumu hesaplar.
  - Sınır, `limit` ya da sayfa yok. Web, onay belgelerini (acknowledgement) ekranda süzerek atıyor (`EmployeeDocumentsList.tsx:63-71`).
- **Çekmece:**
  - `GET …/:requirementId` → `get_employee_document_lifecycle_service`.
  - Karar `POST …/review` → `review_employee_document_lifecycle_service` ile veriliyor. Fonksiyon satırı kilitliyor ve sürüm numarasını karşılaştırıyor.
- **Yükleme:**
  - `upload-url` adımı biçimi ve 10 MiB sınırını kontrol edip imzalı adres veriyor. Tarayıcı dosyayı doğrudan Storage'a yüklüyor.
  - `confirm` adımı dosyayı Storage'dan geri okuyup boyutu ve ilk baytları doğruluyor, sonra taslak dosyayı kaydediyor. Ardından `submit` geliyor.
- **İndirme:** `get_employee_document_lifecycle_path_service` dosya yolunu veriyor. API bu yola kısa ömürlü, `download: true` işaretli bir imzalı adres üretiyor. Web adresi `window.open` ile açıyor (`document-data.ts:64-75`).
- **Bildirim:**
  - Denetim kaydı tetikleyicisi (`notify_document_audit`) şu bildirimleri üretiyor: incelemeye hazır, onaylandı, düzeltme gerekiyor, yeniden istendi.
  - Her dakika `documents_maintain_service` koşuyor (bildirim kuyruğu cron'u). Bu iş eksik belgeyi her gün ve süre dolumunu 30, 7 ve 1 gün kala bildiriyor.

## 1. Bulgular (önem sırasıyla)

### Yüksek

**Y1. Yayındaki belge türünü arşivlemek zorunlulukları kapatmıyor. Kısıt sürüyor, yeni gelenden istenmiyor ve arşivden sonra Publish / Unpublish menüde yok.**
- **Ekranda:** Settings → Documents → satır menüsü → Archive (tek tık).
- **Örnek:**
  - Mert, yayındaki "Alcohol server permit" belgesini Archive ile kaldırıyor. Belgede süre geçince erişim kısıtlanıyor.
  - Garson Ali'den belge Account → Documents'ta istenmeye devam ediyor. Süresi geçtiyse Ali kısıtlı kalıyor ve Schedule'ı açamıyor.
  - Mert Employees → Documents'ta Ali'nin satırını "Missing" görüyor, Settings'te ise belgeyi "Archived" görüyor.
  - Ertesi gün işe giren Bora'dan aynı belge istenmiyor.
  - Bunu düzeltmek için Mert'in önce Restore, sonra Unpublish, sonra yeniden Archive yapması gerekiyor. Ekran bu sırayı söylemiyor.
- **Kanıt:**
  - `set_document_type_archived_service` (yerel veritabanındaki tanım) yalnız `archived_at` alanını yazıyor. Zorunluluklara hiç dokunmuyor.
  - `app_private.document_reconcile_employee` yalnız duraklatılmış, muaf ya da `lifecycle_assignment_disabled` satırları atlıyor. Arşiv bayrağına bakmıyor. Yeni atamada ise `dt.archived_at is null` koşulunu arıyor. Bu yüzden eskiler açık kalıyor, yeniler gelmiyor.
  - `list_employee_document_lifecycle_service` ve `document_actor_blocked` belge türünün arşivde olup olmadığına bakmıyor.
  - `preview_document_publication_service` arşivdeki türde "Archived documents cannot be published; restore first" diyerek reddediyor. Menü de arşivde Publish / Unpublish düğmesini gizliyor (`DocumentsSettingsPage.tsx:465-473`).
  - Arşiv düğmesi tek tık (`:497-510`).
  - pgTAP'te "yayındaki türü arşivle" senaryosu yok. `document_types_rls.test.sql:123-131` yalnız yetkiyi ve denetim kaydını sınıyor.
- **BL:** YENİ (BL-595 ile aynı düğme). `leave: high / do: moderate`.
- **Karar notu:** iki yol var, ürün sorusu:
  - Yayındaki türün arşivlenmesi yasaklanır, önce Unpublish istenir.
  - Ya da arşiv, Unpublish'in yaptığını kendisi yapar (zorunlulukları kapatır ya da duraklatır, etki önizlemesi gösterir).

### Orta

**O1. "Warn before expiry (days)" ayarı çalışanın hatırlatmasını değiştirmiyor. Çalışan her zaman 30, 7 ve 1 gün kala uyarılıyor.**
- **Ekranda:** Settings → Documents → belge → Step 1 → "Track expiration" → "Warn before expiry (days)". Özet satırında "30 day warning" yazıyor (`DocumentSettingsEditor.tsx:366-386, 428`).
- **Örnek:** Mert, Food Handler kartı için 14 gün yazıyor. Ali'ye yine 30, 7 ve 1 gün kala "Document expires soon" bildirimi gidiyor. 14 gün kala hiçbir şey gitmiyor.
- **Kanıt:**
  - `documents_maintain_service` içinde sabit kontrol: `days_left in (30,7,1)`.
  - SELECT: `expiry_warning_days`'i okuyan tek çalışma yolu `sync_expiring_document_todos_service`. Bu fonksiyon yalnız Workspace'teki yapılacak işi üretiyor ve UTC `current_date` kullanıyor (BL-806 kökü).
- **BL:** YENİ (BL-806'nın yanında). `leave: medium / do: moderate`.

**O2. Eksik belgesi olan çalışana her gün bildirim gidiyor; sonu yok.**
- **Ekranda:** Ali'nin Notifications sayfası ve telefon bildirimi: "Documents need attention".
- **Örnek:** Ali'nin Food Handler kartı eksik. Ali yükleyene kadar her sabah 09:00'dan sonra yeni bir bildirim alıyor. Kart 3 hafta eksik kalırsa 21 bildirim alıyor.
- **Kanıt:**
  - `documents_maintain_service` aynı bildirimin tekrarını engellemek için `'missing:'||local_now::date` anahtarını kullanıyor. Anahtar her gün değiştiği için bildirim günde bir kez gidiyor ve bir üst sınırı yok.
  - KARARLAR'da sıklık kararı yok. ILKELER A'daki anti-hedef "bildirim gürültüsü" bununla çelişiyor.
- **BL:** YENİ. `leave: medium / do: safe`.
- **Karar notu:** sıklık ürün kararı (ör. ilk gün, sonra haftada bir, son tarih yaklaşınca).

**O3. Kişinin kendi belgesinde (ve rütbesinin karar veremediği belgede) Approve, Reject, Exempt ve Extend düğmeleri açık. Sunucu "Not allowed" diyor.**
- **Ekranda:** Employees → Documents → kendi satırı → çekmece.
- **Örnek:** Admin Zeynep listede kendi Food Handler kartını görüyor. Approve, Reject, "Exempt from this document" ve "Extend delivery deadline" açık. Approve'a basınca altta "Not allowed" yazıyor.
- **Kanıt:**
  - Web düğmeleri genel izne göre açıyor: `can(context,"documents.review")` (`EmployeeDocumentsPage.tsx:26`), ardından `canDecide` (`DocumentReviewDrawer.tsx:381-385`), muafiyet (`:813-829`) ve uzatma (`:830-875`).
  - SELECT: owner, admin ve manager için `authz_reason(kendi, documents.review, kendi kaydı)` = `rank`. Okuma (`documents.read`) ise açık, bu yüzden satır listede çıkıyor.
  - Requests'teki karar bunu farklı yapıyor: "Kararı veremeyen müdürde Approve / Decline soluk ve kapalı, altında neden satırı" (KARARLAR 531). Kural FB-6.6 D1.
- **BL:** YENİ. `leave: medium / do: moderate`. Liste ya da çekmece okuması satır başına "karar verebilir mi" bilgisini taşımalı. Requests'teki çözüm yeniden kullanılabilir.

**O4. Kapanan zorunluluk listeden tamamen kayboluyor. Yüklenmiş dosya hiçbir sekmede görünmüyor.**
- **Ekranda:** Employees → Documents ve Account → Documents; hiçbir sekmede "Removed" yok.
- **Örnek:**
  - Ali barmenlikten garsonluğa geçiyor ve "Alcohol server permit" zorunluluğu kapanıyor.
  - Ali'nin daha önce onaylanmış izin belgesi "dosyada kalır" (KARARLAR 45: "their uploads stay on file"). Ama Mert ve Ayşe onu artık hiçbir sekmede bulamıyor. Ali de kendi Documents sayfasında bulamıyor.
  - Yeniden işe alım (`reset_employee_onboarding_for_rehire`) ve kural değişikliği de aynı sonucu veriyor.
- **Kanıt:**
  - Paylaşılan süzgeç kuralında "All" sekmesi bile `removed` durumunu dışarıda bırakıyor (`packages/shared/src/document-lifecycle.ts:353`). Sekmeler `all / pending_review / missing / expired / completed` (`:341-347`).
  - `document_obligation_state` kapalı ya da yerine yenisi gelmiş satıra `removed` diyor.
  - ILKELER P09: "veri sessizce düşmez".
- **BL:** YENİ. `leave: medium / do: safe`.
- **Not:** yerelde kapalı satır 0 (SELECT), ekranda görülmedi.

**O5. Çekmecede ham sunucu cümleleri görünüyor. Aynı anda karar veren ikinci kişi eski ekranla kalıyor.**
- **Ekranda:** inceleme çekmecesinin altındaki kırmızı satır.
- **Örnek:**
  - Mert ve Zeynep aynı kartı açıyor. Mert onaylıyor. Zeynep'in Approve'una "document changed; refresh required" dönüyor ve çekmece eski hâlinde duruyor.
  - Süresi geçmiş bir kartta "expired document cannot be approved" yazıyor (BL-673).
  - Ali geçmiş bir son kullanma tarihiyle gönderince "expired documents cannot be submitted" yazıyor.
- **Kanıt:**
  - API, bilerek atılmış hata (`RAISE`) cümlesini olduğu gibi geçiriyor (`apps/api/src/http-error.ts:138-142`). Web de olduğu gibi gösteriyor (`errorText`, `settings/GeneralSettingsPage.tsx:324-328`; çekmecede `:886-890`).
  - Çakışma cevabında (409) sorgu yenilenmiyor: `refresh` yalnız başarıda çağrılıyor (`DocumentReviewDrawer.tsx:223-240`).
  - Veri güvende. Satır kilitleniyor ve sürüm karşılaştırılıyor (`review_employee_document_lifecycle_service`: `for update`, `lifecycle_revision<>expected_revision` → PT409). Bu yüzden ikinci karar birincinin üstüne yazamıyor.
- **BL:** BL-620 ailesi (orada onboarding). YENİ ya da BL-620'ye ek. `leave: medium / do: safe`.

**O6. Sayfalama yok. İki liste de tamamını tek okumada çekiyor ve satır başına maliyet var.**
- **Ekranda:** Settings → Documents ve Employees → Documents tablolarının altı.
- **Örnek:** 80 kişilik ve kişi başına 5 belgeli bir işletmede Employees → Documents 400 satırı tek seferde çekiyor ve hepsini çiziyor.
- **Kanıt:**
  - `list_employee_document_lifecycle_service` içinde `limit` yok.
  - Satır başına şunlar çalışıyor:
    - yetki sorusu (`authz_reason`);
    - durum fonksiyonu;
    - kısıt fonksiyonu;
    - iki lokasyon alt sorgusu;
    - owner kontrolü.
  - Ölçüm (SELECT, 11 satır): ilk çağrı 62 ms, ikinci 29 ms, yani satır başına yaklaşık 2,7 ms. Doğrusal tahminle 500 satır yaklaşık 1,3 sn sürer; bu tahmin ölçülmedi.
  - Employees çekmecesindeki Documents bölümü aynı tam listeyi çekip kişiye göre istemcide süzüyor (`EmployeeDocumentPanel.tsx`, `EmployeeDocumentsList.tsx:68`). Sunucu sayfalaması gelirse bu bölüm kişi başına ayrı bir okuma ister, yoksa bozulur.
- **BL:** BL-787 (geçerli). `leave: medium / do: moderate`. Employees → Documents için sunucuda sayfalama önerilir; Settings → Documents birkaç düzine satır, istemcide sayfalamak yeter.

**O7. Dosya önizlemesi yok. Her dosya yöneticinin bilgisayarına iniyor.**
- **Ekranda:** çekmecede dosya adı düğmesi.
- **Örnek:** Ayşe, Ali'nin kimlik fotoğrafına bakmak için dosyayı indirmek zorunda. Kopya Ayşe'nin İndirilenler klasöründe kalıyor.
- **Kanıt:**
  - İmzalı adres `{ download: true }` ile üretiliyor (`document-lifecycle-service.ts:472-474`).
  - Web adresi beklemeden sonra `window.open` ile açıyor (`document-data.ts:70-74`). Tarayıcının açılır pencere engeline takılabilir (Kanıtlanamayanlar'a bakın).
- **BL:** YENİ. `leave: medium / do: moderate`. Ürün kararı (çekmece içinde PDF ya da resim önizleme).

### Düşük

**D1. BL-561'in kök nedeni bulundu: "Decision saved" yeniden çizimde kayboluyor.**
- Bildirim metni içerik bileşeninin kendi durumunda tutuluyor. Bileşenin anahtarı `${id}:${revision}` (`DocumentReviewDrawer.tsx:84-91`).
- Onaydan sonra `refresh` sürümü artırıyor, bileşen baştan kuruluyor ve metin siliniyor (`:223-231`). Metin yalnız yenileme bitene kadar görünüyor.
- **BL:** BL-561 geçerli. `low / safe`.

**D2. BL-673 geçerli.** Süresi geçmiş sürümde Approve açık (`:921-928`); sunucu reddediyor. `low / safe`.

**D3. BL-672 geçerli.** Move up / Move down yalnız arama ve sıralama açıkken kapanıyor; durum sekmesi ya da Requirement süzgeci açıkken çalışıyor (`DocumentsSettingsPage.tsx:476-491`). `low / safe`.

**D4. BL-595 geçerli.** Archive tek tık (`:497-510`). Y1 ile birlikte ele alınmalı. `medium / safe`.

**D5. Çekmecede ham tarih ve teknik adlar var.**
- Görünen örnekler:
  - "Expires 2026-10-09" (`:597`);
  - History satırı "2026-10-06T18:10:00…+00:00 · approve" (`:876-885`);
  - "Acknowledged by … on 2026-…" (`:483-487`);
  - saat dilimi yoksa son tarihin çıplak ISO hâli (`:443`);
  - sürüm başlığı "pending review" (`:594`);
  - dosya kararı "keep" (`:654`).
- **BL:** BL-674 ailesi (değişmiş: belge çekmecesi de ekleniyor). `medium / safe`.

**D6. Approve'da da "Rejection reason" gönderiliyor.**
- Onaylarken alana yazılan metin denetim kaydına "reason" olarak giriyor ve History'de "approve · <metin>" diye görünüyor (`:211-219`; veritabanında `document_audit(...,'reason',review_reason)`).
- Örnek: Zeynep önce ret gerekçesi yazıyor, sonra vazgeçip onaylıyor. History'de onayın yanında ret gerekçesi görünüyor.
- **BL:** YENİ. `low / safe`.

**D7. Status sütunu ekrandaki etikete göre değil, kod adına göre sıralıyor** (`EmployeeDocumentsList.tsx:106-108`). "Needs review" (`pending_review`), "Paused" ile "Rejected" arasına düşüyor. **BL:** YENİ. `low / safe`.

**D8. Müdür Settings → Documents'ta belge türünün ayrıntısını açamıyor.**
- Satır düğmesi yazma izni yoksa kapalı (`DocumentsSettingsPage.tsx:428-432`, `openEditor` `:129`). Müdür "Who needs it" ve süreyi göremiyor.
- KARARLAR 85: "katalogu salt okunur görür". Yayındaki türler için salt okunur görünüm zaten var ("View document type").
- **BL:** YENİ. `low / safe`.

**D9. İkiz istek istemcisi var.**
- `settings/documents-data.ts:17-45` kendi `fetch`'ini kullanıyor. Bu istemci:
  - DEV'de `localhost:9999`'a düşüyor;
  - sekme workspace başlığını (`X-Newfork-Workspace-Id`) göndermiyor;
  - 401'de oturumu yenilemiyor.
- Ortak `apiRequest` (`lib/supabase.ts:112-134`) bu üçünü yapıyor. Aynı kalıp 6 veri dosyasında daha var.
- **BL:** YENİ (aile). `low / moderate`.

**D10. Ölü kod var.**
- `documents/DocumentDefinitionApply.tsx` hiçbir yerden çağrılmıyor ve adına rağmen policy (signature) API'sini çağırıyor.
- `DocumentsSettingsPage`'in `applyBusy` durumu hiç `true` olmuyor, çünkü düzenleyici `onBusyChange`'i tipte tanımlıyor ama kullanmıyor (`DocumentSettingsEditor.tsx:92`, `DocumentsSettingsPage.tsx:98, 333`).
- **BL:** YENİ. `low / safe`.

**D11. Settings'teki belge düzenleyicisi kapanırken hiç sormuyor.**
- Esc, dışarı tıklama ya da X ile çok adımlı form uyarısız kayboluyor (`DocumentsSettingsPage.tsx:315-332`).
- ILKELER P26'ya göre "uzun yazılmış iş" mi, karar gerekiyor.
- **BL:** YENİ. `low / safe`.

**D12. Owner notunun metni geliştirici dili gibi.** "An owner is not asked for the documents they ask of everyone else. This one is listed here, never required." (`DocumentReviewDrawer.tsx:815-818`). ILKELER P21. **BL:** YENİ. `low / safe`.

**D13. Yarım kalan yükleme Storage'da öksüz dosya bırakabilir.**
- `confirm` adımı reddederse ya da sekme kapanırsa nesne silinmiyor (`document-lifecycle-service.ts:337-373`).
- `remove-draft-file` yalnız veritabanı satırını kaldırıyor.
- Yerelde öksüz dosya 0 (SELECT).
- **BL:** YENİ. `low / safe`.

## 2. Kurala uyduğu doğrulananlar (kısa)
- **Bekleyen ve reddedilen yükleme eş rütbeden gizli.** `document_row_readable` ve `document_view` bunu sağlıyor; e2e `documents.spec.ts:153`. FB-6.6 S2'ye uyuyor.
- **Kimse kendi belgesini onaylayamıyor.** Sunucuda doğru (SELECT: kendine `rank`). Yalnız ekranda düğmeler açık (O3).
- **"Süre doldu" kararı UTC'ye değil, kişinin saat dilimindeki güne göre veriliyor.** Bu kural `document_obligation_state`, review ve submit fonksiyonlarında aynı.
- **Aynı anda verilen iki karar birbirini ezmiyor.** Satır kilitleniyor ve sürüm karşılaştırılıyor; pgTAP `bl052_document_lifecycle.test.sql:49`.
- **Dosya sınırları üç katmanda kontrol ediliyor:**
  - API'de 10 MiB sınırı (`document-lifecycle-routes.ts:23`, servis `:309-314`);
  - bucket'ta 10.485.760 bayt ve yalnız PDF, JPEG, PNG, WebP (SELECT `storage.buckets`);
  - ilk baytların biçimle eşleşmesi ve dosya yolunun kişinin klasöründe olması (`:349-373`).
- **Belge çekmecesi kapanırken "Discard unsaved changes?" soruyor** (P26, BL-467; `:370-380, 929-941`).
- **Arşivlenen kişinin zorunluluğu kapanıyor, geri alınınca açılıyor** (`document_publication.test.sql:131-141, 183-185`).
- **"Ready for review" bildirimi yalnız o kişi için karar verebilenlere gidiyor** (`enqueue_document_notification`: `authz_reason(documents.review, kişi)`). Owner'ın gönüllü yüklemesi bildirim üretmiyor.
- **DOC-TABLE uyumu:** boş hâl metinleri KARARLAR'la birebir. "New document" düğmesi yeşil (`529d6e98`). Employees → Documents'ta ekleme düğmesi yok.

## 3. Test boşlukları
- **pgTAP:**
  - Yayındaki türü arşivleme sonrası zorunluluk, kısıt ve yeni gelen davranışı sınanmıyor (Y1).
  - Günlük "missing" bildiriminin sıklığı sınanmıyor (O2).
  - `expiry_warning_days`'in hatırlatmaya etkisi sınanmıyor (O1).
- **Web (vitest):**
  - Çekmecede Approve hiç gönderilmiyor ve "Decision saved" sınanmıyor (BL-476, D1).
  - Kendi satırında karar düğmelerinin kapalı olması sınanmıyor (O3).
  - 409 sonrası yenileme sınanmıyor (O5).
  - `EmployeeDocumentsList` için sekme sayıları, Location / Document type süzgeci, Status sıralaması ve Next sınanmıyor.
  - `DocumentsSettingsPage` için Archive / Restore, süzgeç açıkken Move up ve yayın penceresinin hata yolu sınanmıyor.
- **e2e (`e2e/flows/documents.spec.ts`, 6 senaryo):** reddetme, muafiyet, süre uzatma, indirme, süresi dolan belge ve arşiv akışı yok.
- **API:** `document-lifecycle-service.test.ts`'te tek test var. `confirmUpload`'ın ret dalları (boyut ya da bayt uyuşmazlığı) servis testinde yok.

## 4. Sınırda (başka ekranın işi; adıyla bırakılıyor)
- **Workspace:**
  - BL-806: süre işleri ve bildirimleri yalnız biri Workspace'i açınca üretiliyor; "expired" bildirimi hiç gitmiyor.
  - BL-807: belge izni olmayan müdür süre işini görüyor.
  - Bu işler belge dosya satırlarını (`employee_documents`) UTC `current_date` ile okuyor. Documents ekranı ise gönderim satırlarını (`employee_document_submissions`) okuyor. İki ayrı okuma yolu var (O1 ile aynı aile).
- **Schedule:** belge uyarısı da `employee_documents` satırlarını okuyor (`list_schedule_draft_document_conflicts_service`, `employee_has_hard_document_schedule_conflict_service`). Arşivdeki tür ve muafiyetle uyumu bu turda ölçülmedi.
- **Yetki:** BL-560 geçerli. SELECT: yerleşik Manager rolünde hiçbir belge izni yok, yalnız Owner ve Admin'de `documents.read/manage` ve `employee_documents.read/review` var.
- **Diğer açıklar:**
  - BL-559: birincil lokasyonu olmayan kişi son tarihli belgeyi gönderemiyor.
  - BL-728: belgesi eksik müdür Requests'i hiç göremiyor (`DocumentAccessRoute`).
  - BL-592: Account → Documents'ın boş tablosu beyaz kaldı.
- **Add employee → Documents adımı:** KARARLAR 375'e göre bu turun işi. Bugün kodda yok. "Who needs it Apply" önizlemesi de yok; D10'daki ölü bileşen bu boşluğun izi.
- **Hâlâ geçerli:** BL-554 ("Named people" ölü yolu, `DocumentLifecycleFields.tsx:377`), BL-469 (Reason zorunlu ama ekranda yazmıyor, `DocumentPublicationDialog.tsx:240-246`), BL-468.

## 5. Kanıtlanamayanlar (ayrı liste)
- **Y1 ekranda uçtan uca denenmedi.** Yerelde arşivlenmiş belge türü yok (SELECT 0). Zincir fonksiyon tanımlarından okundu.
- **O4:** yerelde kapalı zorunluluk yok (`lifecycle_closed_at` 0). Görünmezlik paylaşılan süzgeç kodundan okundu.
- **O6'daki 500 satırlık süre** 11 satırlık ölçümden doğrusal tahmin; büyük veriyle ölçülmedi.
- **O7'deki açılır pencere engeli** tarayıcıda denenmedi. Dayanak: `window.open`'ın bir `await`'ten sonra çağrılması.
- **O2'nin gerçek teslimi** (bildirim kuyruğundan kişiye ulaşması) gözlenmedi; yalnız anahtar mantığı okundu.
- **D13:** yerelde öksüz dosya 0. Risk yalnız kod yolundan çıkarıldı.

**Ölçülen sha:** `origin/main` `f8e78dc415e62e146df42909bd2851a25d59d994` (worktree `newfork-wt/plan-ekran-05`, HEAD `e666f2ec`; aradaki fark yalnız `docs/plan/BACKLOG.md`, BL-819 ve BL-820). Yerel veritabanının son migration'ı `20261007130000`, depoyla aynı. En yüksek BL numarası 820; YENİ maddeler bundan sonra numaralanır.
