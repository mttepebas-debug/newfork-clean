# A — Documents: açık backlog ve prototip farkları (EKRAN-06, 2026-10-06, `f8e78dc4`)

## Özet
- **Ölçüm:** `origin/main` `f8e78dc4`, 2026-10-06.
  - İlk fetch `e666f2ec`'yi verdi. Arada gelen tek commit yalnız `BACKLOG.md`'ye BL-819 ve BL-820'yi ekliyor; kod aynı.
  - Yerel DB'nin son migration'ı `20261007130000`; main'deki son dosyayla aynı.
  - Yerel DB'de yalnız SELECT çalıştı. Test koşulmadı, dosya yazılmadı.
- **Son BL numarası:** BL-820 (`origin/main` `f8e78dc4`).
- **Sayılar:**
  - Ekranın içinde 29 açık backlog kaydı var.
    - 21'i geçerli, 5'i değişmiş, 2'si bayat.
    - 1 grup ölçülmedi: yerel veriden düşen testler; test koşmak bu görevde yasaktı.
  - YENİ bulgu: içeride 5, sınırda 1.
  - Sınırda: 20 madde.
- **En ağır bulgular:**
  - **Yerleşik Manager rolünde hiç belge izni yok (BL-560, yüksek):**
    - Yerel DB'de 469 Manager rolünün hiçbirinde belge izni yok.
    - Kadıköy müdürü Ayşe, Employees → Documents'ı da Settings → Documents'ı da açamaz.
    - KARARLAR üç yerde tersini söylüyor: M2 "müdür lokasyonundakilerin belgelerini görür", D2 "müdür onaylar", satır 85 "müdür belge tanımlarını salt okunur görür".
  - **Birincil lokasyonu olmayan kişi süreli belge gönderemiyor (BL-559, yüksek):** owner Mert Account → Documents'ta Food Handler kartını yükleyince "Document timezone needs administrator configuration" hatası alır. Saat dilimi modeli bir temel model kararı (P18).
  - **Karma akış kodda hiç yok (YENİ):** KARARLAR'da onaylı ama kodda olmayanlar:
    - "Who needs it" yönü;
    - davette gerekçeli muafiyet;
    - "Ask anyway" ve "Ask for a document";
    - Add employee → Documents adımı;
    - yayındaki belgede önizleme + Apply.
    Mert 2026-10-06'da "Add employee → Documents adımı bu turda yapılır" dedi. Bu iş de belge mimarisinin "raftaki" kararlarına (U1–U12) bağlı (soru S1).
- **Prototip (P2, P3, PHONE-MGR, PHONE-MGR2):**
  - 10 taşı, 3 bırak, 2 varyant gerekir.
  - "Polished" denen 6 farkın 6'sı da main'de duruyor (gerçek uygulama hâlâ eski hâlinde).
  - "Matched" denenlerden yokladığım 5'i main'de doğru.

## Ekranın sınırı
- **İçeride:**
  - **Settings → Documents** (`/app/<ws>/settings/documents`, `DocumentsSettingsRoute`, `App.tsx:565-568`): belge türleri listesi, düzenleyici (Step 1 / Step 2), Publish / Unpublish penceresi, satır menüsü.
  - **Employees → Documents** (`/app/<ws>/employees/documents`, `App.tsx:414`): liste, sekmeler, filtreler.
  - **Belge inceleme çekmecesi** (`DocumentReviewDrawer.tsx`): Approve / Reject, ret gerekçesi, düzeltme süresi, muafiyet, süre uzatma, geçmiş.
  - **Sayfalama** (25 / 50 / 100) iki listede.
- **Sınırda:**
  - Account → Documents (ekran 15);
  - `DocumentAccessRoute` (belgesi eksik kişiyi `/account/documents`'a yollayan kapı);
  - onboarding belge adımı (ekran 16);
  - Schedule'daki belge uyarısı;
  - Workspace'teki belge süresi işleri (BL-806/807, EKRAN-05);
  - Employees kişi çekmecesinin Documents bölümü (liste aynı bileşen; "Ask for a document" karma akışla gelir);
  - Settings → Roles'taki belge izinleri (ekran 10).
- **Dışarıda:** Acknowledgements (Settings → Acknowledgements, ekran 10). Kodu belge çekmecesiyle ortak, ama ayrı bir ekran.

Teknik adlar, bir satırda:
- **İzin anahtarı:** bir rolün neye dokunabildiğini söyleyen satır. Örnek: `employee_documents.review` = "çalışan belgesini onaylayabilir".
- **Çekirdek:** veritabanındaki tek yetki kararı yeri (`app_private.authorize`).
- **Raf:** belge mimarisi sohbeti. Mert 2026-10-03'te durdurdu (`research/BELGE-MIMARISI-uzlasma-2026-10-03.md`). Oradaki kararlar yürürlükte sayılmıyor.
- **Ham hata:** kişiye gösterilen geliştirici cümlesi. Örnek: "expired document cannot be approved".

## 1. Açık backlog maddeleri (tazelik hükmüyle)

### İçeride — yüksek

- **BL-560 (leave: high / do: risky) Yerleşik Manager rolünde belge izni yok. Tazelik 2026-10-06 (`f8e78dc4`): geçerli, kapsamı genişledi.**
  - Kanıt (SELECT): 469 `manager` sistem rolünün 0'ında `documents.*` ya da `employee_documents.*` var. Yalnız `employee_onboarding.review` var. Owner ve Admin 469/469.
  - Kapılar çekirdekte (`app_private.authz_actions`):
    - `documents.read` → `employee_documents.read`;
    - `documents.review` → `employee_documents.review`;
    - `settings.documents.read` → `documents.read`.
  - Ek (bugün): KARARLAR:85 "Manager… belge tanımlarını salt okunur görür" da kodda yok. Manager'da `documents.read` yok, bu yüzden Settings → Documents da kapalı (`DocumentsSettingsRoute.tsx:18,27`).
  - Örnek: Ayşe, Ali'nin süresi dolan Food Handler kartını ne görür ne onaylar. İşi owner Mert ya da admin Zeynep'e kalır.
  - Sonuç: düzeltilince telefonda müdürün More menüsünde de Documents görünür olmalı (PHONE-MGR K3 bugün "yok" diyor).
  - `nf-db`, R3. Koordinatör kararı önerildi (bölüm 5, K1).

- **BL-559 (leave: high / do: moderate) Birincil lokasyonu olmayan kişi süreli belge gönderemiyor. Tazelik: geçerli.**
  - Kanıt: "Document timezone needs administrator configuration" metni iki canlı fonksiyonda (`submit_employee_document_lifecycle_service`, `review_employee_document_lifecycle_service`).
  - Yerelde lokasyon ataması olan 2403 aktif kişinin 319'unda hiçbir atama birincil değil. Bitmiş atamalar ayrılmadı; bir satır elle bakıldı: 2 atama, ikisi de birincil değil.
  - Çekmece aynı durumda "An administrator needs to set this employee's document time zone" diyor (`DocumentReviewDrawer.tsx:413-418`).
  - Raf #69 (P18 temel model). Soru S2.

### İçeride — orta

- **BL-595 (leave: medium / do: safe) Settings → Documents satır menüsünde Archive tek tık. Tazelik: geçerli.**
  - Kanıt: `DocumentsSettingsPage.tsx:523-536`, düz `button` + `archiveMutation.mutate`; `ConfirmButton` yok.
  - Kural: KARARLAR:599 (Mert). Prototipte uygulandı (P3 S7).
  - Örnek: Mert yanlışlıkla "Alcohol server permit"in Archive'ına basar, belge anında arşive geçer.

- **BL-787 (leave: medium / do: safe) Sayfalama iki Documents listesinde yok. Tazelik: geçerli.**
  - Kanıt: `DocumentsSettingsPage.tsx` ve `EmployeeDocumentsList.tsx`'te sayfalama yok. Ortak bileşen main'de henüz yok (grep `Pagination|pageSize`: 0 dosya).
  - Bileşen EKRAN-02'nin C dilimiyle gelecek (`tasks/EKRAN-02-REQUESTS.md:255`).
  - Liste tek JSON olarak geliyor (`list_employee_document_lifecycle_service`, canlı gövde satır 11), bu yüzden tarayıcıda sayfalamak yeter.
  - Yerelde workspace başına en çok 11 belge satırı ve 7 belge türü var. 50+ satır görmek için veri kurmak gerekir.
  - Örnek: 80 kişi × 5 belge = 400 satır. Ayşe ilk 50'yi görür, altta "1 2 … 8".

- **BL-599 (leave: medium / do: moderate) Telefonda liste.**
  - **Settings → Documents kısmı: geçerli.** KARARLAR:311 Settings listeleri telefonda kart satırı diyor. Kod 1200 px altında yalnız Description sütununu gizliyor (`jobs-settings.css:1407-1416`); kart düzeni yok.
  - **Employees → Documents kısmı:** KARARLAR:311 adıyla saymıyor. SABAH-SORULAR S22'deki Employees telefon sorusuna bağlı (bölüm 5, K7).

- **BL-602 (leave: medium / do: moderate) Sekmeler ok tuşuyla gezilmiyor. Tazelik: geçerli.**
  - Settings → Documents `role="tab"` taşıyor ama ok tuşu yok (`DocumentsSettingsPage.tsx:250-272`).
  - Ek (bugün): aynı ekranın iki listesi farklı anlam taşıyor. Employees → Documents sekmeleri `role="tab"` değil, `aria-pressed` düğme (`EmployeeDocumentsList.tsx:135-149`).

- **BL-674 (leave: medium / do: safe), belge kalemi: geçerli.**
  - Sürüm "Expires 2029-10-01" (`DocumentReviewDrawer.tsx:573`).
  - Geçmişte ham zaman damgası (`:877`).
  - Örnek: Ayşe geçmişte "2026-10-03T19:42:11.214Z · reviewed" görür.

- **BL-621 (leave: medium / do: moderate), belge kalemi: geçerli.** Belge düzenleyicisi zod'un ilk mesajını olduğu gibi basıyor (`DocumentSettingsEditor.tsx:450-452`). Hangi alanların özel mesajı olmadığı ölçülmedi; P3 #2 "some issues" diyor.

### İçeride — düşük

- **BL-673 (low / safe) Süresi dolmuş sürümde Approve basılabiliyor. Tazelik: geçerli.**
  - Kanıt: Approve yalnız "kept file" koşuluna bakıyor (`DocumentReviewDrawer.tsx:919-925`).
  - Sunucu reddediyor ve ham "expired document cannot be approved" metni ekrana çıkıyor (aşağıda YENİ-1).

- **BL-672 (low / safe) Move up / down filtre ya da sekme açıkken çalışıyor. Tazelik: geçerli.**
  - Kanıt: `:500-517`. Taşımayı yalnız arama ve sıralama durduruyor; Requirement filtresi ve sekme durdurmuyor.

- **BL-469 (low / safe) Publish penceresinde "Reason" zorunlu ama işaretsiz. Tazelik: geçerli.** Kanıt: `DocumentPublicationDialog.tsx:240`, `:246`.

- **BL-468 (low / safe) Gönderim, kaldırılmış ek alanın değerini de taşıyor. Tazelik: geçerli.**
  - Kanıt: `metadata` taslağın bütününü alıp gönderiyor (`DocumentReviewDrawer.tsx:205-209`, `:264-265`).
  - Ek (bugün): sürüm listesinde kaldırılmış alan ham anahtar adıyla yazıyor (`:574-579`, `?? key`). Örnek: "license_number: 4471".

- **BL-561 (low / safe) "Decision saved" bildirimi görünmüyor. Tazelik: değişmiş, kök neden adayı bulundu (koşturulmadı).**
  - Approve sunucuda revizyonu artırıyor. Çekmece içeriği `id:revision` anahtarıyla yeniden kuruluyor (`:83-90`). "Decision saved" bu içeriğin kendi yerel durumunda tutuluyor (`:210`, `:245`), bu yüzden yeniden kurulunca siliniyor.
  - Görünüp görünmemesi, yenilemenin ne zaman bittiğine bağlı.

- **BL-476 (low / safe) Belge çekmecesinde testsiz dallar. Tazelik: değişmiş.**
  - "Remaining time" artık testli (`DocumentReviewDrawer.test.tsx:186`).
  - Dosya kararı ve notu testli (`:1203-1213`).
  - Approve gönderimi hâlâ hiçbir testte yok; yalnız yokluğu sınanıyor (`:283`, `:295`, `:823`).

- **BL-554 (low / safe) "Named people" ölü kodu. Tazelik: geçerli.** Kanıt: `DocumentLifecycleFields.tsx:330`, `:377`. Karma akışın "Ask for a document"ı bunun yerine değil, ayrı bir yoldan gelir (KARARLAR:98).

- **BL-557 (low / safe) Owner yüklemesinde API ile DB farklı işarete bakıyor. Tazelik: geçerli.** Kanıt: `document-lifecycle-service.ts:317-318` `exemption_locked`'a bakıyor.

- **BL-664 kalem (3) (low / safe) Düzenleyicinin özet listesi her kelimeyi büyütüyor ("Manager Approval"). Tazelik: geçerli.** Kanıt: `document-settings-editor.css:162` `text-transform: capitalize`.

- **BL-593 (low / safe) Settings → Documents başlık satırı tablo rolünde değil. Tazelik: geçerli.** `role="columnheader"` var (`:202`), ama üstünde `table` ya da `row` yok.

- **BL-581 (low / moderate) Mevcut kadroya toplu "on file" yok. Tazelik: geçerli** (grep: yok). Soru S4.

- **BL-582 (low / safe) İşin departmanı değişince belge kapsamı uyarısı yok. Tazelik: geçerli.** Settings → Jobs dosyalarında belge önizlemesi yok (grep). Dokunduğu ekran Settings → Jobs (ekran 10); bölüm 5, K9.

- **BL-583 (low / safe) Listede "Who needs it" ve "Exempt (N)" sütunları yok. Tazelik: değişmiş.** DOC-TABLE kararı (2026-10-05) sütunları sabitledi: Document name / Description / Status / Published (KARARLAR:308). Sütun eklemek o kararı değiştirir. Soru S5.

- **BL-585 (low / moderate) Optional belge Required olunca muafiyetler sorulmadan taşınıyor. Tazelik: geçerli.** Kanıt: `DocumentLifecycleFields.tsx:400`. SABAH-SORULAR "Documents ekranının (6) turunda" diyor. Soru S3.

- **BL-248 (low / safe) Owner'ı belgesi engelli diye elle kuran test hücresi. Tazelik: geçerli.** Kanıt: `owner_time_off_needs_no_documents.test.sql:33-35`. Ürün bu durumu artık üretemiyor (KARARLAR:88).

### İçeride — ikiz ve yerel test maddeleri

- **BL-344 ile BL-566 aynı hücre** (`bl052_document_onboarding.test.sql:70`, hücre duruyor). Kararsızlık ölçülmedi (test koşmak yasaktı). İki numara tek madde olmalı (bölüm 5, K4).
- **BL-497, BL-528, BL-590: ölçülmedi.** Üçü de belge testlerinin yalnız ortak yerel DB'de düşmesi; CI'da yeşil. Aynı aile, birleştirilebilir.

### Kapanmalı ya da daralmalı

- **BL-118 (medium / moderate) Owner gönüllü yükleme: bayat.** FB-6.6 B ile main'de (`4398563c`; `document-lifecycle-service.ts:315-322` owner'ın muaf satırını açık tutuyor). Kalan iki parça kendi numarasında: BL-557, BL-559.
- **Numarasız "pgTAP borcu: üç onboarding / document test dosyası kırmızı" (BACKLOG:138): bayat.** Adı geçen beş dosyanın beşi de `supabase/tests/ci-green.txt`'te. Belge ve onboarding test dosyalarının 23'ü de orada (`ci-not-green.txt`'te belge dosyası yok).
- **BL-096: değişmiş.** Belge kısmı (`employee_onboarding_rls`) yeşil listede. Kalan `availability_review_lifecycle` yeşil listede değil, ama belge dışı bir konu.
- **BL-374: değişmiş.** Belge yarısı kapandı: `document-types-routes.ts`'te route içi kapı yok (`aee04aaa`, FB-6.6). Maddenin geri kalanı öteki Settings sayfaları (ekran 10).

### YENİ (içeride)

| # | Bulgu | Kanıt | İsimli örnek | İşaret |
|---|---|---|---|---|
| Y1 | Belge ekranlarının hepsinde ham hata metni (G11 ailesi; BL-654 ve BL-620 bu yerleri saymıyor) | `errorText` = `error.message` (`GeneralSettingsPage.tsx:324-327`); kullanım: `DocumentsSettingsPage.tsx:113-125`, `:348`; `DocumentPublicationDialog.tsx:253`; `EmployeeDocumentsList.tsx:305`; `DocumentReviewDrawer.tsx:115`, `:890`; `DocumentExemptionAction.tsx:101` | Ayşe süresi geçmiş kartı onaylar, ekranda "expired document cannot be approved" yazar | low / safe |
| Y2 | Sürüm başlığında ham durum kodu | `DocumentReviewDrawer.tsx:571` (`state.replaceAll("_"," ")`) | Zeynep "Version 2 · superseded" ve "pending review" görür; CLAUDE.md §9: kod adı ekranda görünmez | low / safe |
| Y3 | Status sütunu ham koda göre sıralanıyor, etikete ya da önceliğe göre değil | `EmployeeDocumentsList.tsx:107` (`a[sort.key]`, `status` ham değer) | Ayşe Status'a basar; "Completed" "Expired"ın, "Missing" "Needs review"ın üstüne dizilir (alfabetik kod sırası) | low / safe |
| Y4 | Üreticisi olmayan eski bağlantı dalı | `DocumentsSettingsRoute.tsx:15-17` (`?requirement`, `view=employees`); hiçbir canlı DB fonksiyonunda ve web/API/shared kodunda bu adresi üreten yok (SELECT + grep, 2026-10-06). CLAUDE.md §9: geriye uyumluluk dalı yazılmaz | — | low / safe |
| Y5 | Hiç belge yokken "No documents match these filters." | `EmployeeDocumentsList.tsx:283-291`. KARARLAR:309 yalnız filtreli boşu tanımlıyor; Settings → Documents ise iki hâli ayırıyor (`:390-396`) | Yeni workspace'te Mert hiç filtre seçmeden Employees → Documents'ı açar, "filtrelerle eşleşmedi" okur | low / safe (soru S6) |

## 2. Prototip farkları (taşı / bırak / varyant)

Doğrulama (main `f8e78dc4`):
- "Polished" denen 6 farkın hepsi gerçek uygulamada hâlâ eski hâlinde: R3 `:412`, R7 `:573`, R11 `:919-925`, R16 `:876-885`, D14 `:450-452`, D15 `css:162`.
- "Matched" denenlerden yoklananlar doğru:
  - DOC2 sayı yalnız 0'dan büyükse (`:151`);
  - DOC7 Enter / Space (`:242`);
  - D9 taşıma kuralı (`:500-517`);
  - D10 boş metinler (`:390-396`);
  - E8 başlık iskeleti.
- Belge kodu 2026-10-04 DOC-TABLE'dan beri değişmedi (`git log`).

| Kaynak | Fark | Öneri | Dayanak | BL |
|---|---|---|---|---|
| P2 R3 | Çekmecede durum düz metin; listede renkli çip | **taşı** | CLAUDE.md §9 tutarlılık; KARARLAR Genel "Durum çipi" | YENİ (Y2 ile aynı dilim) |
| P2 R7 | Sürüm bitişi ISO tarih | **taşı** | ILKELER P12 (ABD); BL-674 | BL-674 |
| P2 R11 | Süresi dolmuşta Approve kapalı + neden ipucu | **taşı** | ölü tıklama yok; anti-hedef "kurumsal hantallık" | BL-673 |
| P2 R16 | Geçmiş okunur tarih, açık kalma durumu korunur | **taşı** | P12; BL-674 | BL-674 |
| P2 C1–C15 | Add employee → Profile · Employment · Documents (N) adımı; muafiyet gerekçesi, "Ask anyway", "Not for <ad>" | **taşı** (karar var) | KARARLAR:375 "Documents ekranının (6) turunda" + :388 | YENİ; kapsam S1 |
| P3 D14 | Düzenleyicide ham zod cümleleri yerine sade cümle | **taşı** | G11; BL-621 | BL-621 |
| P3 D15 | Özet listede "Manager approval" (cümle düzeni) | **taşı** | BL-664 (3) | BL-664 |
| P3 D16 | Yayındaki belgede "Who needs it" önizleme + Apply | **taşı** (karar var) | KARARLAR:600 (Mert 2026-10-04) | YENİ; kapsam S1 |
| P3 S7 | Archive iki tık kırmızı | **taşı** | KARARLAR:599 | BL-595 |
| PHONE-MGR2 | Settings → Documents telefonda kart satırı | **taşı** | KARARLAR:311 (Mert) | BL-599 |
| P3 D6 | Sıralanan sütunun oku hep görünür | **bırak** | ortak liste dili; PROTO-ESIT-SET E2 Documents'ta oku yalnız üzerine gelince bıraktı. Tek ekranda değişirse listeler ayrışır (CLAUDE.md "ortak değer") | BL-604 ailesi |
| PHONE-MGR K7 | Telefonda başlık 38 px | **bırak** | KARARLAR:298 telefonda liste başlığı 28 | — |
| PHONE-MGR K3 | Müdürün More menüsünde Documents yok | **bırak** (prototip bugünü kopyalıyor) | BL-560 düzelince müdür görür (M2) | BL-560 |
| P3 E9 | Liste çerçevesi son satırda mı biter, sayfanın dibine mi uzar | **varyant gerekir** | ILERLEME bekleyen karar "liste çerçevesinin bittiği yer" (#206); P04 | — |
| PHONE-MGR D1 | Employees → Documents telefonda kaydırmalı tablo mu, kart satırı mı | **varyant gerekir** | SABAH S22 Employees telefon sorusuyla aynı | BL-599 |

Prototipte ölçülemeyenler (bırak): R8 dosya indirme, R14 owner notu (örnek veride owner talebi yok).

## 3. KARARLAR'da olup kodda olmayan kurallar

| # | Kural | Kodda | Önem | BL | İşaret |
|---|---|---|---|---|---|
| K1 | Müdür lokasyonundakilerin belgelerini görür ve onaylar (M2, D2); belge tanımlarını salt okunur görür (:85) | Manager rolünde belge izni yok (469/469) | yüksek | BL-560 | high / risky |
| K2 | Karma akış: "Who needs it" yönü, davette gerekçeli muafiyet, "Ask anyway", "Ask for a document" (:95-100) | hiçbiri yok (grep "Ask anyway", "Ask for a document", "Skipped at invite": 0) | orta | YENİ | medium / risky |
| K3 | Add employee → Documents (N) adımı, bu turda (:375, :388) | çekmece 2 adımlı | orta | YENİ (K2 ile) | medium / moderate |
| K4 | Yayındaki belgede "Who needs it" önizleme + Apply (:600) | düzenleyici salt okunur; Apply bileşeni yalnız Acknowledgements'ta (`SignatureTemplatesSettingsPage.tsx:3`) | orta | YENİ (K2 ile) | medium / moderate |
| K5 | Archive iki tık kırmızı (:599) | tek tık | orta | BL-595 | medium / safe |
| K6 | Sayfalama 25 / 50 / 100 (:302) | yok | orta | BL-787 | medium / safe |
| K7 | Telefonda Settings listeleri kart satırı (:311) | yok | orta | BL-599 | medium / moderate |
| K8 | Owner muaf belgesini yükler (:89, D5) | var; yalnız birincil lokasyonu olmayan owner'da süreli belgede kırık | yüksek | BL-559 (BL-118 bayat) | high / moderate |

Kodda var olanlar (yoklandı):
- **Rütbe:** `documents.review` = `no_self` + `rank_below` (`authz_actions`).
- **Bekleyen ve reddedilen yükleme yalnız karar verene ve sahibine görünür:** `document_submission_visible` (`20261006030000`).
- **Yayındaki tanım salt okunur.**
- **Çekmecede yazılan korunur (KK-50, BL-467):** `typedField`.
- **P26 "Discard unsaved changes?":** `:933-946`.
- **W-4 / I-9 hiçbir yerde yok:** grep 0.

## 4. Sınırda (bu ekranın işi değil, adıyla)

| Madde | Ne | Nerede yapılır | Tazelik |
|---|---|---|---|
| BL-728 (medium / risky) | Belgesi eksik müdür Requests'i hiç göremiyor; `DocumentAccessRoute` bütün `/app`'i kapatıyor (`App.tsx:289-291`, `DocumentAccessRoute.tsx:31-33`) | EKRAN-02 A3 + B2 | geçerli (bugün okundu) |
| BL-727 (medium / risky) | Kısıtlı çalışan takas açabiliyor | EKRAN-02 A2 | geçerli (2026-10-06 tazeliği) |
| BL-806, BL-807 | Belge süresi işi yalnız Workspace açılınca; izni olmayan müdür işi görüyor | EKRAN-05 A1 (SABAH S17) | geçerli (EKRAN-05) |
| BL-470 (low / safe) | Account sayacı `employee.user_id` ile (`20261001020000:28`), liste `lifecycle_user_id` + `document_row_readable` ile (canlı gövde 13-14) | ekran 15 | değişmiş: liste FB-6.6'da çekirdeğe geçti, sayı aynı |
| BL-592 | Account → Documents boş tablosu | ekran 15 | ölçülmedi |
| BL-555 (low / safe) | Rol editöründe müdür tipi role "Document requirements → edit" veriliyor; çekirdek reddediyor (`role-permissions.ts:161-168`'de müdür için gizleme yok) | ekran 10 (Roles) | geçerli (grep; ekranda bakılmadı) |
| BL-584 | Acknowledgements düzenleyicisi | ekran 10 | ölçülmedi |
| BL-645…649 | Onboarding belge adımı | ekran 16 | BL-648 geçerli (2026-10-06); ötekiler ölçülmedi |
| BL-046 | Gerçek belge e-postası | ekran 10 (Notifications) | ölçülmedi |
| BL-382 | SSN kalıntısı | ekran 16 | ölçülmedi |
| BL-133 | Taslak belge çakışması kapsam testi | Schedule | ölçülmedi |
| BL-553 | Menü izin anahtarına bakıyor (`AppShell.tsx:100` `anyOf: ["employee_documents.read"]`) | genel | geçerli |
| BL-515, BL-558, BL-803 | Ortak çekmece: toast tıklanamıyor, telefonda gri şerit, toast konumu | EKRAN-02 C3 / G25 | BL-515 geçerli (`CatalogDrawer.tsx:34-42`) |
| BL-600, BL-603, BL-604, BL-605 | Ortak liste dili | ayrı tutarlılık işi | ölçülmedi |
| BL-620, BL-654 | G11 ham hata ailesi | kendi ekranları | Y1 bu aileye eklenebilir |
| Raf #68 | Schedule'daki belge uyarısını kim görür | raf (S1'e bağlı) | rafta |
| YENİ, low / safe | `DocumentAccessRoute`: her `/app` girişinde kontrol bitene kadar boş ekran (`:19-20`); hata hâlinde stilsiz düğme (`:21-29`); herkes için 30 sn'de bir yoklama (`:15`) | ekran 15 / 16 ya da EKRAN-02 B2 | yeni |

## 5. Kararlar

### Mert'e sorulacaklar (ekran 6 turunda sorulur)

**S1. Belgeler turunun kapsamı: raftaki belge kararları bu turda mı konuşulsun?**
- **Bugün:** Employees → Add employee iki adımlı. Settings → Documents'ta yayındaki belgenin "Who needs it"ı kilitli. Raftaki kararlar (görünürlük U6, sonradan yayınlanan zorunlu belge U9, saat dilimi U11, Schedule'ın 16 okuyucusu) yürürlükte değil.
- **Örnek:** Ayşe yeni garson Ali'yi ekler. Bugün Food Handler kartı Ali katıldıktan sonra kuraldan gelir; Ayşe davet anında "Under 21" muafiyetini seçemez.
- **Seçenekler:**
  - **(a) (Önerilen)** Bu turda KARARLAR'da onaylı olanlar yapılır: karma akış, Add employee → Documents adımı, yayındaki belgede önizleme + Apply. Raftaki U1–U12 ayrı bir sohbette yeniden teyit edilir ve bu turu beklemez.
    - Sonuç: Ayşe davette muafiyeti gerekçesiyle seçer; owner yayındaki belgenin kitlesini önizleyip uygular. Görünürlük bugünkü M2 kuralında kalır.
    - Dayanak: KARARLAR Employees "Add employee → Documents adımı Documents ekranının (6) turunda yapılır" (Mert 2026-10-06) + raf notu "dönüşte her U satırı yeniden teyit ettirilir".
  - **(b)** Rafın tamamı bu turda, önce sohbette (P18).
    - Sonuç: tur uzar. Görünürlük değişebilir: U6 "onaylı belgeyi de yalnız karar veren görür" diyor; bugün M2 öteki müdüre de gösteriyor.
  - **(c)** Bu turda yalnız ekran hataları; karma akış sonraya.
    - Sonuç: Mert'in 10-06 kararı ertelenir; Add employee iki adımlı kalır.
  - Kaçış seçeneği: "Önce sohbette konuşalım".

**S2. Birincil lokasyonu olmayan kişinin belge saat dilimi (BL-559; temel model, P18).**
- **Bugün:** owner Mert Account → Documents'ta süreli bir belge yükler, "Document timezone needs administrator configuration" hatası alır.
- **Seçenekler:**
  - **(a) (Önerilen)** Önce sohbette konuşalım. Masadaki aday: workspace'in yedek saat dilimi (raftaki U11; EKRAN-03'te işten çıkarma penceresi aynı yedeği kullanıyor, KK-169 K4).
    - Dayanak: ILKELER P18 (temel modeller önce sohbette).
  - **(b)** Workspace saati yedek olsun, hemen uygulansın.
    - Sonuç: Mert'in yüklemesi geçer. Belge bitişi workspace saatinin gün sonuna göre hesaplanır.
  - **(c)** Bugünkü gibi kalsın; admin kişiye elle saat dilimi girsin.
    - Sonuç: her birincilsiz kişide admin işi.

**S3. Optional belge Required yapılınca davette atlanmış muafiyetler (BL-585).**
- **Bugün:** Handbook Optional iken davette atlanan Kadıköy garsonu, Handbook Required olunca da sessizce muaf kalır.
- **Seçenekler:**
  - **(a) (Önerilen)** Yayın önizlemesi "N people are exempt from the previous version" der ve sorar: muafiyetler korunsun mu, kalksın mı.
    - Sonuç: owner kimlerin muaf kalacağını görür ve seçer. Engel değil, soru.
    - Dayanak: ILKELER P09 (veri sessizce düşmez / değişmez) + P10 (niyet sorulur).
  - **(b)** Muafiyetler sessizce korunsun (bugünkü gibi).
  - **(c)** Yükseltmede muafiyetler kendiliğinden kalksın.
    - Sonuç: kişiden yeni son tarihle istenir, ama owner'a söylenmez.

**S4. Mevcut kadro için toplu "on file" (BL-581).**
- **Bugün:** Kadıköy'de 9 kişinin Food Handler kartı kâğıtta. Owner belgeyi yayınlayınca 9'unun da süresi başlar; her biri tek tek yüklenmeli.
- **Seçenekler:**
  - **(a) (Önerilen)** Bu turda: yayın önizlemesinde ve Employees → Documents'ta seçilen kişiler için "Mark as on file (paper)". Gerekçe zorunlu, geçmişe yazılır, yalnız owner ve admin yapabilir.
    - Sonuç: ilk müşteri kadrosunu tek seferde taşır. Risk: kanıtsız kalıcı kayıt; gerekçe ve iz bunu sınırlar.
    - Dayanak: ILKELER A (ilk müşteri 20-100 kişilik, mevcut kadroyla gelir) + P02 (işin çekirdeğinde tam çözüm).
  - **(b)** Backlog'da kalsın.
  - **(c)** Tek tek "on file" işareti (toplu değil).

**S5. Settings → Documents listesine "Who needs it" ve "Exempt (N)" sütunları (BL-583).**
- **Bugün:** listede belgenin kimden istendiği görünmüyor; görmek için belgeyi açmak gerekiyor.
- **Seçenekler:**
  - **(a) (Önerilen)** Eklenmesin; bilgi çekmecede kalsın, madde kapansın.
    - Dayanak: KARARLAR Genel DOC-TABLE sütunları (Mert 2026-10-05) + ILKELER P20 (sade).
  - **(b)** "Who needs it" sütunu eklensin.
    - Sonuç: DOC-TABLE kararı değişir; gerçek ekranda varyant gösterilir (P04).
  - **(c)** İkisi de eklensin (aynı sonuç, daha dar Description).

**S6. Hiç belge yokken Employees → Documents boş metni (Y5).**
- **Bugün:** yeni workspace'te filtre seçilmeden açılınca "No documents match these filters." yazıyor.
- **Seçenekler:**
  - **(a) (Önerilen)** Filtresiz boşta "No employee documents yet" / "Documents you ask for in Settings → Documents appear here." Düğme yok.
    - Dayanak: KARARLAR Genel "Boş hâl metinleri", Settings → Documents'ın gerçek boş / filtreli boş ayrımı (aynı kalıp) + P21.
  - **(b)** Bugünkü metin kalsın.
  - Kaçış seçeneği: "Claude karar versin".

### Koordinatörün verebileceği kararlar (dayanağıyla)

- **K1. BL-560:** yerleşik Manager rolüne `employee_documents.read`, `employee_documents.review` ve `documents.read` (Settings'i salt okunur görme) verilsin; mevcut 469 rol de güncellensin.
  - Dayanak: KARARLAR M2 + D2 + satır 85 birebir; P01 (eski veri korunmaz).
  - Risk sınıfı R3: `nf-db` yazar, `nf-guvenlik` inceler.
  - Not: raftaki U6 kabul edilse de müdür kendi çalışanlarına karar verdiği için bu izinler gerekir; S1'in cevabını beklemez.
- **K2.** BL-118 kapansın (bayat, `4398563c`).
- **K3.** Numarasız "pgTAP borcu" (BACKLOG:138) kapansın. BL-096 belge dışı kısmıyla daralsın.
- **K4.** BL-344 BL-566'ya katılsın (aynı hücre). BL-497, BL-528 ve BL-590 tek madde olsun (yerel veri kayması).
- **K5.** BL-374'ün metninden `document-types-routes.ts` çıksın (`aee04aaa`).
- **K6. Salt hata düzeltmeleri bu turda, soru sorulmadan** (ILKELER P19 / G11 / CLAUDE.md §9):
  - Settings → Documents tarafı: BL-595, BL-672, BL-469, BL-664 (3), BL-593, BL-621 belge kalemi (D14), Y4.
  - Employees → Documents ve çekmece tarafı: BL-673 (R11), BL-674 belge kalemi (R7, R16), BL-468 (+ ham anahtar eki), BL-561 (kök neden adayıyla), BL-476 (Approve gönderim testi), R3 çip, Y1, Y2, Y3.
- **K7.** Employees → Documents telefonda: ayrı soru açılmasın; SABAH S22'deki Employees telefon sorusuna eklensin, aynı cevap uygulansın.
  - Dayanak: aynı liste bileşeni (`EmployeeDocumentsList` Employees çekmecesinde de kullanılıyor) + CLAUDE.md §9 tutarlılık.
- **K8.** BL-787 sayfalaması tarayıcıda yapılsın (liste tek JSON geliyor). EKRAN-02'nin ortak bileşeni main'e girince bu turda bağlansın. Dayanak: P19.
- **K9.** BL-582 Settings → Jobs'ta (ekran 10) yapılsın. Uyarı metni KARARLAR:600'deki önizleme kalıbını izlesin ("This changes documents for N people").
- **K10.** BL-555 ekran 10'a (Roles) kalsın, ama BL-560 ile aynı gün ölçülsün. İzin verilince editörde "Document requirements → edit"in müdür rolünde gizlenmesi daha da gerekli olur.

**Ölçülen sha:** `origin/main` `f8e78dc4` (ilk fetch `e666f2ec`; aradaki tek fark docs). Yerel DB son migration `20261007130000`.

**Kanıt dosyaları:** SELECT dosyaları scratchpad'de (`C:\Users\TheWe\AppData\Local\Temp\claude\C--Users-TheWe-Documents-Codex-newfork-clean--claude-worktrees-handoff-koordinatorlugu-20c0b3\b637b6ed-f52f-4f26-bb6c-4f452bf8e51b\scratchpad\q1.sql`–`q16.sql`). Repoya ve prototipe yazılmadı.
