DENETİM SONUCU: BULGU VAR (kritik 0, yüksek 0, orta 0, düşük 4).

# B — Documents: güvenlik ve kod incelemesi (EKRAN-06, 2026-10-06, `e666f2ec`)

**DENETİM SONUCU: BULGU VAR (kritik 0, yüksek 0, orta 0, düşük 4).**

- **Sızıntı yok.** Başka bir workspace'in ya da başka bir lokasyonun belgesine, dosyasına veya imzalı indirme bağlantısına giden bir yol bulmadım.
- **Müdür yalnız kendi lokasyonundakinin belgesini görüyor.** Yerel DB'de 3.232 kişi–belge çiftinde ölçtüm: belge izni olan müdür, lokasyon paylaşmadığı 70 çiftin hiçbirini okuyamıyor.
- **Bekleyen ve reddedilen belge yalnız karar verene ve sahibine görünüyor.** Eş müdür, admin ya da owner'ın bekleyen yüklemesini görmüyor (sıfır çift).
- **Kimse kendi belgesini onaylayamıyor.** Eş rütbe birbirininkini de onaylayamıyor. Yerleşik Manager rolünde belge izni gerçekten yok (KARARLAR satır 93).
- **Owner muaf.** 12 owner belgesinin 12'si muaf, 468 owner'ın hiçbiri kısıtlı değil.
- **Dosya deposu kapalı.** Belge kovası (`employee-onboarding`) özel. Tarayıcı oturumuna hiçbir depo kuralı izin vermiyor; dosyaya yalnız sunucu, 5 dakikalık ve tek dosyaya bağlı bir imzalı bağlantıyla erişiyor.
- **Dört bulgu da düşük.** İkisi sözleşme ve doğruluk sorunu, biri gizlilik ve veri saklama, biri ölü ikiz kod.

Kapsam ve sınır:
- **İçeride:**
  - Settings → Documents (`DocumentsSettingsRoute`, `/app/settings/documents`).
  - Employees → Documents (`EmployeeDocumentsPage`, `App.tsx:414`, `ActionRoute action="documents.read"`) ve kişi çekmecesindeki Documents bölümü (`EmployeeDocumentPanel`).
  - Belge çekmecesi: Approve / Reject / Exempt / Extend deadline / timezone.
  - Dosya yükleme ve indirme (Supabase Storage).
  - Belge kısıtı kapısı (`DocumentAccessRoute`, `App.tsx:289`).
  - API'de iki kök altındaki 20 uç (`apps/api/src/employees/document-lifecycle-routes.ts:48-76`) ve Settings → Documents'ın 8 ucu (`apps/api/src/settings/document-types-routes.ts`).
  - DB'de bu uçların çağırdığı 22 servis ve yardımcıları.
- **Sınırda:** Account → Documents (kişinin kendi belgesi, `/v1/me/workspaces/:w/documents`), onboarding belge adımı (aynı servisi kullanıyor), belge bildirimleri.
- **Dışarıda:** Settings → Acknowledgements (imza şablonları), görsel tasarım, sayfalama (BL-787).

## Özet
- **Tenant izolasyonu temiz.**
  - Belge tablolarının hepsinde satır erişimi (RLS) açık: `employee_documents`, `employee_document_submissions`, `employee_document_submission_files`, `employee_onboarding_requirements`, `document_types`, `employee_acknowledgement_envelopes`, imza tabloları.
  - Tarayıcı oturumunun (`anon` / `authenticated`) bu tablolarda hiçbir izni ve hiçbir politikası yok. Hiçbiri canlı kanala (realtime) yayınlanmıyor.
  - 33 `public` servisin hepsi SECURITY DEFINER, arama yolu boş (`search_path=""`), yalnız `service_role` çalıştırabiliyor. `app_private` yardımcılarını kimse doğrudan çağıramıyor.
- **Dosya yolu tahmin edilemiyor, başkasına bağlanamıyor.**
  - Yol `workspace/kişi/belge/<rastgele uuid>.pdf` biçiminde.
  - Üç katmanda zorlanıyor: API önek kontrolü (`document-lifecycle-service.ts:344-356`), DB fonksiyonu `is_employee_onboarding_document_path(path, w, e, r)` ve tablo CHECK'i (`employee_documents_object_path_format_check`, `object_path` UNIQUE).
  - Yerelde 93 dosyanın 0'ının yolu kendi workspace / kişi / belge kimliğiyle uyuşmuyor.
- **İndirme kapalı yönde.**
  - Yol `get_employee_document_lifecycle_path_service`'ten geliyor. Fonksiyon önce çekirdeğe soruyor, sonra belge ekranını (`detail`) açıyor.
  - Yalnız `decision='keep'` olan ve kişinin görmesine izin verilen sürümün dosyasını veriyor.
  - Bağlantı 300 sn geçerli (`packages/shared/src/storage-access.ts:4`) ve `download: true` ile ek dosya olarak iniyor.
  - Deneme (yalnız okuma): başka workspace'in dosyasını kendi workspace'i üzerinden isteyen owner personel yolunda `42501 authz.out_of_scope`, kendi yolunda `P0002` alıyor.
- **Dosya türü ve boyutu dört yerde doğrulanıyor:**
  - API dosya uzantısına ve 10 MiB sınırına bakıyor.
  - Kova yalnız 4 MIME türünü ve 10 MiB'ı kabul ediyor.
  - Onay adımı depodaki gerçek boyutu, içerik türünü ve ilk 12 baytı ("magic bytes") okuyor (`:357-373`).
  - DB `media_type`, `size_bytes` ve kabul edilen biçim kısıtlarını tutuyor.
  - İmzalı yükleme bağlantısı üzerine yazmaya izin vermiyor (`upsert` yok). Bu yüzden doğrulanan dosya sonradan değiştirilemiyor.
- **XSS yok.**
  - Dosya adı (en çok 240 karakter) yalnız React metni olarak basılıyor. Ekranlarda `dangerouslySetInnerHTML` yok.
  - İndirme bağlantısı yalnız kendi API'mizden gelen imzalı adres (`document-data.ts:74`, `noopener`).
  - Bildirim yönlendirmesi yalnız uuid parametrelerini taşıyor (`DocumentNotificationRedirect.tsx:4-14`).
- **Yetki çekirdek üzerinden geçiyor.**
  - Hepsi `app_private.authorize` kullanıyor: okuma `documents.read` (kişi kapsamı), karar `documents.review` (`no_self`, `rank_below`), kişinin kendi işi `documents.self` (`restricted_ok`), Settings `settings.documents.read|write`.
  - Belge servislerinde eski kapı (`service_actor_has_permission`), `auth.uid()` ve `request.jwt` yok. Çekirdeğe sormayan iki fonksiyon zamanlanmış görev (worker); katalogda `exempt:worker` olarak sınıflı.
  - Rotalar kendi içinde kapı tutmuyor.
- **Web:** belge ekranlarında `permissions.includes` ve rol adı karşılaştırması yok, hepsi `can()`. Ama karar düğmeleri hedefsiz soruluyor (D2).
- **Fail-open yok.**
  - `DocumentAccessRoute` hata olursa uygulamayı açmıyor, "Document access could not be checked" + "Try again" gösteriyor.
  - `EmployeeDocumentPanel` izin yoksa hiçbir şey göstermiyor.
  - Kısıt sunucuda da zorlanıyor: belgesi eksik kişi çekirdekten `document_blocked` alıyor.
- **"Hayır" sözleşmesi personel yolunda tutuyor:** bilinmeyen belge de kapsam dışı belge de `403 authz.out_of_scope` alıyor. Kişinin kendi yolunda ayrışıyor (D1).

## 1. Bulgular (önem sırasıyla)

### D1. Account → Documents yolunda iş arkadaşının belge kimliği 403, olmayan kimlik 404 alıyor (Düşük)
- **Ekranda nerede:** Account → Documents ve onboarding belge adımı. API kökü `/v1/me/workspaces/:w/documents/:requirementId` ve alt uçları: ayrıntı, indirme, `upload-url`, `confirm`, `submit`, `defer`, `acknowledge`, `withdraw`, `remove-draft-file`.
- **Ne görüldü:**
  - Servisler önce `authorize(…, 'documents.self', target_person => belgenin kişisi)` soruyor.
  - Belge bir iş arkadaşınınsa çekirdek `authz.out_of_scope` diyor, API 403 veriyor.
  - Belge yoksa ya da başka workspace'teyse kişi boş geliyor, çekirdek izin veriyor. Ardından `P0002 document unavailable` geliyor, API 404 veriyor.
  - Kaynak: DB gövdesi `get_employee_document_lifecycle_service` (son tanım `supabase/migrations/20261006030000_unreviewed_uploads_stay_with_deciders.sql:29`), `http-error.ts:55-58`.
- **Ölçüm (SELECT):** çalışan × aynı workspace'teki belge.
  - `authz_reason(…, 'documents.self', null, iş arkadaşı)` 1.399 çiftte `out_of_scope`.
  - Kişisiz (`null`) çağrı her durumda izin veriyor.
- **Örnek:** Ali, Kadıköy'deki Veli'nin Food Handler kaydının kimliğini Account → Documents adresine yazıyor. "Bu kayıt var ama sana kapalı" (403) alıyor. Uydurma bir kimlikte "yok" (404) alıyor.
- **Sözleşme:** CLAUDE.md §9'a göre bilinmeyen ve kapsam dışı hedef aynı cevabı almalı.
- **Etkisi:** çok sınırlı. Kimlikler tahmin edilemeyen uuid'ler ve hiçbir ekran başkasının kimliğini çalışana göstermiyor. Personel yolu tutarlı.
- **Önerilen yön:** kendi yolunda kişi başkasıysa çekirdeğe sormadan `P0002` vermek ya da çekirdeğin `own` kapsamında kişisiz çağrıyı da `out_of_scope` yapmak. İki hücreli bir pgTAP eklenmeli: iş arkadaşının kimliği ile olmayan kimlik aynı kodu almalı.
- **BL eşleme:** **YENİ.** BL-818 ile aynı aile ("hayır" sözleşmesi, 403/404 ayrımı).
- **İşaret:** leave: low / do: safe.

### D2. Belge çekmecesi Approve / Reject / Exempt / Extend düğmelerini sunucunun reddedeceği kişide de gösteriyor (Düşük)
- **Ekranda nerede:** Employees → Documents → satır → belge çekmecesi. Aynı çekmece Employees → kişi → Documents'ta da açılıyor.
- **Ne görüldü:**
  - İki ekran `canReview={can(context, "documents.review")}` ile soruyor; kişiyi hedef vermiyor (`EmployeeDocumentsPage.tsx:27`, `EmployeeDocumentPanel.tsx:13`).
  - Çekmece bu tek değere bakıyor: `canDecide` (`DocumentReviewDrawer.tsx:384-388`, düğmeler `:597`, `:653`, `:908`), Exempt (`:810`), Extend deadline (`:827`).
  - Sunucu ise kişi bazında soruyor: kendi belgesi ve eş rütbe `authz.rank`.
  - Paylaşılan kural kişiyi alabiliyor: `packages/shared/src/authorization.ts:395-405`, aynı rütbe kuralı. Yani `can(context, "documents.review", { person })` hazır.
- **Ölçüm (SELECT, `authz_reason(…, 'documents.review', null, kişi)`):**
  - Belge izinli özel müdür rolleri → başka müdürün belgesi: 297 `rank`.
  - Aynı roller → kendi belgesi: 27 `rank`.
  - Admin → kendi belgesi: 2 `rank`.
  - Admin → owner: 12 `rank`.
  - Bu kişilerin onaylı belgesi çekmecede açılıyor; Reject, Exempt ve Extend deadline görünüyor.
- **Örnek:** Kadıköy'de belge izinli özel "Shift lead" rolündeki Ayşe, eş müdür Deniz'in onaylı Food Handler belgesini açıyor. "Exempt" ve "Reject" görünüyor; basınca "Not allowed" alıyor. Admin Zeynep kendi bekleyen yüklemesinde "Approve" görüyor.
- **Etkisi:** sızıntı ya da yetki aşımı yok, son sözü DB söylüyor. Ama ekran yapılamayacak işi teklif ediyor. KARARLAR "Kararı veremeyen müdürde Approve / Decline soluk ve kapalı, altında neden satırı" (Requests için G1) burada uygulanmamış.
- **Önerilen yön:** çekmece kişiyi hedef vererek sormalı (`can(context, "documents.review", { person })`). Görsel karar (gizle mi, soluk + neden mi) KARARLAR G1'den türetilebilir. Bir vitest hücresi eklenmeli: eş müdürün belgesinde düğme yok.
- **BL eşleme:** **YENİ.** BL-553 ile aynı aile (`can()`'a hedefsiz soru).
- **İşaret:** leave: low / do: safe.

### D3. Silinen taslak dosya ve doğrulanamayan yükleme depoda süresiz kalıyor (Düşük)
- **Ekranda nerede:** Account → Documents ve onboarding → belge → taslak dosyayı kaldırma; ya da "File content does not match…" hatasıyla düşen yükleme.
- **Ne görüldü:**
  - `remove_employee_document_draft_file_service` yalnız bağlantı satırını siliyor (`supabase/migrations/20261006000000_documents_and_onboarding_ask_the_core.sql`, DB gövdesi). `employee_documents` satırı ve depodaki dosya kalıyor.
  - `confirmUpload` doğrulamada düşen nesneyi silmiyor (`document-lifecycle-service.ts:358-373`).
  - Depodan silen tek kod, workspace tamamen temizlenirken çalışıyor (`workspace-retention-worker.ts:77-84`, BL-279).
- **Ölçüm (yerel, SELECT):**
  - Kovada 93 nesne, satırı olmayan 0.
  - Satırı olup hiçbir gönderime bağlı olmayan 3 (kaldırılmış taslak).
- **Örnek:** Ali yanlışlıkla ehliyetinin fotoğrafını yüklüyor ve kaldırıyor. Fotoğraf workspace kapanana kadar kovada duruyor.
- **Etkisi:** dosyaya giden bir okuma yolu yok. İndirme yalnız `decision='keep'` ve gönderime bağlı dosyayı veriyor. Bu bir veri azaltma ve saklama konusu, sızıntı değil.
- **BL eşleme:** **YENİ.** BL-279'un dar kalıntısı; BL-279 yalnız workspace temizliğini kapattı.
- **İşaret:** leave: low / do: moderate (depodan silme geri alınamaz; önce kural, sonra worker).

### D4. Ölü ikiz: `save_document_type_service`'in 10 parametreli eski imzası (Düşük)
- **Ne görüldü:**
  - İki imza var. 10 parametreli olan yalnız 11 parametreliyi `'track_only'` ile çağıran bir uyumluluk katmanı.
  - Settings → Documents'ın kayıt zinciri `save_document_type_draft_service` → `save_document_type_lifecycle_service` → `save_document_type_service` (11 parametre).
  - 10 parametreliyi API, başka bir fonksiyon ya da test çağırmıyor: testler de 11 parametre kullanıyor (`document_types_rls.test.sql:37-41`, `document_publication.test.sql:71`).
  - Kapısı çekirdek (`settings.documents.write`), yani istismar yolu yok.
- **Etkisi:** CLAUDE.md §9'daki "ikiz sistem yok, geriye uyumluluk dalı yazılmaz" kuralına aykırı ölü kod. Katalog onu da `settings.documents.write` sayıyor, bu yüzden test yeşil kalıyor.
- **BL eşleme:** **YENİ.** BL-554 ile aynı aile (belge düzenleyicide ölü yol).
- **İşaret:** leave: low / do: safe. İmza düşürülür ve `retired_objects_stay_gone`'a eklenir.

## 2. Bu ekrana değen backlog maddeleri (tazelik 2026-10-06, `e666f2ec`)
- **BL-560, geçerli.** Yerleşik Manager rolünde `employee_documents.*` yok.
  - Ölçüm: 469 Manager rolünün hiçbirinde yok. Belge izni olan 55 özel müdür rolü var.
  - M2 ölçümünde yerleşik müdür yalnız kendi belgesini okuyor; 534 çiftin 10'u, hepsi kendisi.
- **BL-680, geçerli.**
  - KARARLAR K14 S1'e göre müdür Settings'te belge tanımlarını salt okunur görmeli.
  - `settings.documents.read` → `documents.read`; 510 yerleşik müdürde `missing_permission`, 91 özel müdürde de aynı.
- **BL-276 madde (2), bayat.**
  - Madde "admin kendi belgesini onaylar, muaf tutar, süresini uzatır; üç serviste `authorize` yok" diyor.
  - Bugün üçü de `authorize(…, 'documents.review', target_person=>…)` kullanıyor (DB gövdesi).
  - Ölçüm: admin → kendisi 2/2 `rank`, owner → kendisi 12/12 `rank`. Bu alt madde kapatılabilir.
- **BL-374, belge kısmı bayat.** `document-types-routes.ts` artık dosya içinde `authorize` tutmuyor (`resolveActor` + "the database's", `:20-21`). Dosya 194 satır; maddenin gösterdiği `:237` yok. Öteki Settings dosyalarına bakmadım.
- **BL-557, geçerli.** API hâlâ `exemption_locked`'a bakıyor (`document-lifecycle-service.ts:317-318`).
- **BL-728, geçerli.** `DocumentAccessRoute.tsx:32` belgesi eksik kişiyi bütün `/app`'ten `/account/documents`'a yönlendiriyor.
- **BL-470, BL-555, BL-807:** ölçmedim. Sınırda kalıyorlar.

## 3. Güvenli olduğunu doğruladıklarım
- **Reddedilen ve bekleyen belge eş müdüre kapalı.** Görünürlüğü `document_sees_pending` belirliyor: sahibi ya da `documents.review` geçen kişi.
  - Liste satırı gizleniyor (`document_row_readable`).
  - Satır durumu, red gerekçesi ve gönderim kimliği maskeleniyor (`document_view`).
  - Sürümler, geçmiş ve dosya yolu `document_submission_visible` ile süzülüyor.
  - Geçmişteki onay, ret, gönderim ve taslak olaylarının hepsi `submission_id` taşıyor; süzgeç bunlara uygulanıyor. Ölçülen beş olay türünden yalnız `definition_applied` taşımıyor; o da tanım yayınıdır, yükleme değil.
  - Özel müdür → başka müdür: 288 çiftin 0'ında bekleyeni görüyor.
- **Onay bildirimi yalnız karar verene gidiyor.** `enqueue_document_notification` alıcıyı `authz_reason(…, 'documents.review', …, kişi)` ile seçiyor. Hesap kutusu bildirimi yalnız kişinin kendisine açılıyor (`document_account_inbox_allowed`).
- **Kişinin kendi yazmaları başkasına dokunamıyor.** `save_employee_document_draft_file`, `submit`, `defer`, `remove_draft_file` ve `withdraw` `lifecycle_user_id = actor` istiyor. API ayrıca önce kendi yolunda belgeyi açıyor.
- **Atama önizlemesi kapsam dışını göstermiyor.** `preview_employee_document_assignments_service` kişinin belgesini okuyamayana başlık yerine "Document requirement" yazıyor. Kapsam dışı lokasyon önerisini `out_of_scope` ile reddediyor.
- **Yayından kaldırma veri silmiyor.** `set_document_publication_service` belgeleri duraklatıyor ve denetim kaydı yazıyor.
- **Belge tablolarına başka silme yolu yok.** DB'de belge tablolarına `delete` yazan tek fonksiyon müsaitlik satırlarını siliyor (`availability_follows_role`, `kind='availability'`).
- **Owner muaf.** 12/12 belge `lifecycle_exempt` + `owner_excused`; `document_actor_blocked` 468 owner'da 0. Owner'ın muafiyetini kaldırma yolu açık hatayla kapalı (`set_document_exemption`).
- **Log'da kişisel veri yok.** 500'lerde "Internal server error" dönüyor; belge rotaları ek log yazmıyor.

## Öneriler (zevk ve sağlamlaştırma, bulgu değil)
- **Ret çıkarımı.** `document_view` reddi maskelerken `deadline_at`'i maskelemiyor. Ret yeni son tarih açtığında eş müdür "bir şey oldu" çıkarımı yapabilir; gerekçeyi ve dosyayı göremez.
- **Arşivli lokasyon adı.** `document_obligation_json` lokasyon adlarını arşivli lokasyonu süzmeden veriyor (`location_names`). Kişinin kendi lokasyonları olduğu için sızıntı değil.
- **Katalog sınıfı tek eylem.** `authorization_coverage.test.sql:85-86, 110` okuma servislerini yalnız `documents.read` sayıyor; servis kendi yolunda `documents.self` da soruyor. Workspace incelemesindeki D3 ile aynı kör nokta.
- **Servis düzeyinde M2 hücresi yok.** pgTAP'ta "başka lokasyondaki kişinin onaylı belgesi müdürün listesinde yok" diyen servis düzeyi hücre bulamadım. Çekirdek kuralı matris kapsıyor (`authorization_matrix.test.sql:511`), servis çekirdeği çağırıyor. Ucuz bir hücre eklenebilir.

## Kanıt (yalnız git ve SELECT; test koşturulmadı, dosya yazılmadı)
- **Sürüm:** `git fetch origin`; worktree `plan-ekran-05` HEAD = `origin/main` = `e666f2ec`. Yerel DB'nin son migration'ı `20261007130000`, repodakiyle aynı.
- **Kilit:** `db.lock` `nf-db/veri`'de; yalnız okudum. Tek fonksiyon denemesi STABLE bir okuma fonksiyonuydu (`get_employee_document_lifecycle_path_service`) ve hata ile döndü.
- **Servisler:** `pg_proc` + `has_function_privilege`. 33 `public` belge servisinin hepsi `prosecdef = t`, `search_path=""`, anon = f, authenticated = f, service_role = t. Gövde araması: eski kapı, `auth.uid()` ve `request.jwt` yok. `authorize` çağırmayan iki fonksiyon worker.
- **Tablolar ve depo:**
  - `relrowsecurity` + `role_table_grants` + `pg_policies`: belge tablolarında tarayıcı izni ve politikası yok. `pg_publication_tables` boş.
  - `storage.buckets`: `employee-onboarding` public = f, 10.485.760 bayt, MIME listesi 4 tür.
  - `storage` politikaları yalnız `account-profile-photos` ve `workspace-logos` için var.
- **Çekirdek satırları (`app_private.authz_actions`):**

  | Eylem | Kapsam | Etki | İzin | Ek kural |
  |---|---|---|---|---|
  | `documents.read` | person | read | `employee_documents.read` | — |
  | `documents.review` | person | write | `employee_documents.review` | `no_self`, `rank_below` |
  | `documents.self` | own | write | — | `restricted_ok` |
  | `settings.documents.read` / `.write` | org | read / write | `documents.read` / `documents.manage` | — |

- **Rol izinleri:** Owner ve Admin 469'ar rolde dört belge izni de var. Yerleşik Manager'da yok. 55 özel müdür rolünde `employee_documents.read|review` var.
- **M2 ölçümü** (`document_actor_can_read`, `document_sees_pending` × ortak canlı lokasyon × hedef rolü; 3.232 çift):
  - Özel müdür: ortak lokasyon yoksa 70/70 okuyamıyor.
  - Ortak lokasyonda okuyamadığı 86 çiftin hepsi müdürün kendi belgesi eksik olduğu için (`document_blocked`; review ölçümüyle aynı 9 / 27 / 50).
  - Bekleyeni yalnız çalışanlarda (432) ve kendisinde (36) görüyor.
  - Yerleşik müdür ve çalışan yalnız kendini okuyor.
- **Rütbe ölçümü:** `authz_reason(…, 'documents.review', …)` rol × hedef × kendisi, 27 grup (D2 ve BL-276 sayıları).
- **"Hayır" sözleşmesi:**
  - `authz_reason(…, 'documents.read', null, null)` özel müdürde `out_of_scope`.
  - `documents.self` iş arkadaşında 1.399 `out_of_scope`, kişisizde izin (D1).
  - Başka workspace dosyası denemesi: personel yolu `42501 authz.out_of_scope` (detail `documents.read`), kendi yolu `P0002`.
- **Dosya:** `employee_documents` 93 satır, yolu kendi kimlikleriyle uyuşmayan 0. Kovada satırsız nesne 0, bağlantısız satır 3. Tablo CHECK'leri ve UNIQUE `object_path` okundu.
- **Kod okuma:**
  - `document-lifecycle-routes.ts` (tamamı), `document-lifecycle-service.ts` (tamamı), `document-types-routes.ts` (tamamı), `document-types-service.ts:70-145`, `http-error.ts:48-175`.
  - `packages/shared/src/storage-access.ts`, `authorization.ts:380-410`.
  - Web: `DocumentsSettingsRoute`, `EmployeeDocumentsPage`, `EmployeeDocumentPanel`, `DocumentAccessRoute`, `DocumentNotificationRedirect`, `document-data.ts`, `DocumentReviewDrawer.tsx:380-390, 590-600, 650-660, 800-920`, `App.tsx:250-295, 414`, `auth/can.ts`.
  - DB gövdeleri: 28 belge fonksiyonu (`pg_get_functiondef`).
- **Testler (okundu, koşturulmadı):** `documents_on_the_core.test.sql:105-212` rütbe, bekleyen, reddedilen, değiştirilmiş yükleme ve iki lokasyon hücrelerini sınıyor. D1 ve D2 için hücre yok.

Açılan skill'ler:
- `supabase:supabase-postgres-best-practices` (RLS, grant, depo politikası ve SECURITY DEFINER okuması).
- `superpowers:verification-before-completion` (her iddia bir SELECT ya da dosya:satır ile).
- `security-review` koordinatörün çağrısıyla yüklendi. Alt görev açılmadı; tek oturumda yürütüldü.

Hafıza kaydı yazılmadı, çünkü görev salt okumaydı. Koordinatöre not: kişinin kendi kapsamındaki eylemlerde 403/404 ayrımı (D1) ve hedefsiz `can()` ile gösterilen karar düğmeleri (D2) kontrol listesine eklenmeye değer.

Ölçülen `origin/main`: `e666f2ec2d4917e5a5e700b5dfe8dd7cc685fe82`.

İlgili dosyalar:
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-ekran-05/apps/api/src/employees/document-lifecycle-service.ts`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-ekran-05/apps/api/src/employees/document-lifecycle-routes.ts`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-ekran-05/apps/web/src/documents/DocumentReviewDrawer.tsx`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-ekran-05/apps/web/src/documents/EmployeeDocumentsPage.tsx`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-ekran-05/apps/web/src/documents/EmployeeDocumentPanel.tsx`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-ekran-05/supabase/migrations/20261006030000_unreviewed_uploads_stay_with_deciders.sql`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-ekran-05/supabase/tests/documents_on_the_core.test.sql`
