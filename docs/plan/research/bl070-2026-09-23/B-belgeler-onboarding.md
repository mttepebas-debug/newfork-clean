# B — Belgeler ve onboarding (alan kodu: B-belgeler-onboarding)

Ölçüm zamanı ve yeri: 23 Eylül 2026 sabahı (UTC), main `41783c7`, ortak yerel DB (`supabase_db_newfork-clean`). Beş dosyanın hepsi önce olduğu gibi koşuldu; sonuçlar baseline ile birebir aynı çıktı (access 1, definitions 7, preview 4, onboarding_rls 5 gerçek + 32 koşulamayan, weekly 6 kırmızı).
Bütün denemeler tek transaction içinde yapıldı ve `rollback` ile geri alındı. Deneme dosyaları repoda değil, burada: `scratchpad/bl070-research/B-work/` (`patch_raise.sql`, `*_fixed.sql`, `exp_*.sql`, `run.sh`).
"Deneyerek" = DB'de koşup sonucunu gördüm. "Kod okuyarak" = yalnız kodu okudum, koşmadım.

Sık geçen adlar (bir kez, insan diliyle):
- **Belge tanımı** (`document_types`): Settings → Documents listesindeki her satır, ör. "Food handler kartı". Durumu Draft/Published (Status kolonu); drawer'da Publish / Unpublish.
- **Gereksinim** (`employee_onboarding_requirements`): bir çalışandan istenen tek madde, ör. "Ayşe, Food handler kartını yükle". Çalışan onu onboarding'de `/welcome/documents` adımında ve Account → Documents'ta, yönetici Employees → çalışan → Documents sekmesinde görür.
- **Yayın kapısı** (`app_private.guard_document_requirement_publication`): taslak (yayınlanmamış) bir tanıma bağlanan gereksinim satırını, hata vermeden, veritabanına girmeden düşüren tetikleyici.
- **Onboarding başlatma** (`initialize_employee_onboarding_service`): davet kabul edilince (ve `/welcome` ilk açılınca) çalışanın onboarding listesini oluşturan adım.
- **Eşitleyici** (`document_reconcile_employee`): çalışanın lokasyonu/job'ı değişince hangi belgelerin ona düştüğünü yeniden hesaplayan otomatik adım.
- **Dağıtım** (`apply_lifecycle_definition`): Settings → Documents → Publish onayından sonra, eşleşen herkese belgeyi veren adım.
- **Görme kuralı** (`service_actor_can_access_employee`): "bu yönetici bu çalışanı görebilir mi". Owner/admin herkesi; manager yalnız rolü employee olan ve **en az bir lokasyonu** manager'ın kapsamında olan çalışanı görür.
- **Manager kapsamı** (`membership_location_scopes`): manager'ın kendi employee kaydındaki lokasyonlardan otomatik dolan liste (Ali'nin kaydında Kadıköy varsa Ali'nin kapsamı Kadıköy'dür).

---

### bl052_document_access

**Ekrandaki karşılığı:** Bir belge "gecikince erişimi kıs" (Settings → Documents → belge → *suspend on overdue*) işaretliyse ve süresi geçmişse çalışan o workspace'te vardiya vb. ekranları göremez, Account → Documents'a yönlendirilir; kiosk'tan saat basabilir, kendi belgesini yükleyebilir. Örnek: Ayşe'nin iki zorunlu belgesi (Sertifika, İkinci belge) gecikmiş; owner Sertifika için "muaf tut" der; Ayşe hâlâ kısıtlı kalmalı çünkü ikinci belge de gecikmiş.

**Test ne iddia ediyor (kırmızı kontroller):** #12 "resolving one of multiple blockers does not reopen access": iki engelden biri kalkınca erişim açılmamalı. Şu an erişim açılıyor (`have: false, want: true`).

**Eski davranış:** 16 Eylül öncesinde (yayın kavramı yokken) test, var olmayan bir tanım kimliğiyle (`...0099`) ikinci gereksinimi doğrudan ekliyordu ve satır giriyordu. Senaryolar:
1. Ayşe'nin iki gecikmiş belgesi var, biri muaf tutuluyor → ikincisi yüzünden kısıtlı kalıyordu.
2. İkisi de çözülünce → erişim geri geliyordu.
3. Başka bir workspace'teki üyeliği → hiç etkilenmiyordu.

**Ne değişti:** Migration `20260916052509_document_publication_initial` (16 Eylül, rescue commit `557cc16` ile main'e geldi) "yayın kapısını" ekledi. Yazılı gerekçe, migration yorumunda: *"Draft definitions cannot enter onboarding through any insertion path."* Kapı, tanımı yayınlanmamış ya da hiç olmayan bir belge gereksinimini hata vermeden düşürüyor (`INSERT 0 0`).

**Yeni davranış:** Test ikinci engeli var olmayan bir tanıma bağlıyor. Kapı satırı sessizce düşürüyor, yani ikinci engel hiç oluşmuyor; birincisi kalkınca erişim açılıyor ve test kırmızı. Aynı senaryolarla:
1. İkinci engel yok, erişim açılıyor. Ürün hatası değil, fixture hatası.
2. Değişmedi.
3. Değişmedi.
Uygulamada ikinci engel mutlaka yayınlanmış bir tanımdan gelir, o durumda kural doğru çalışıyor.

**Hedefe göre doğrulama:** Hedef model belge kısıtlaması hakkında bir şey söylemiyor, çelişki de yok. "Taslak belgenin etkisi sıfır" kararıyla uyumlu. Bu dosyada lokasyon kapsamı konusu yok.

**Kanıt:**
- *Deneyerek:* Fixture'a yayınlanmış bir tanım (`...0099`, `publication_status='published'`) eklendi. Bugünkü kapıyla 14/14 geçti, "kapı hata verir + başlatma süzer" deneme yamasıyla da 14/14 (`B-work/access_fixed.sql`). Yama olmadan, kapı hata verseydi değiştirilmemiş test #11'de ölüyor (`patch_raise.sql` koşusu: ran=11).
- *Kod okuyarak:* Kapının tanımı migration satır 38-48'de.

**Önerilen karar:** **Test düzelsin**, önceki karar kalsın.
- Kırmızının sebebi fixture: bugünkü kurallar var olmayan bir tanıma bağlı gereksinim oluşturmaz.
- Kararınız uygulanırsa (kapı hata versin) bu düzeltme zorunlu olur, yoksa dosya ölür.
- Tek satır: ikinci engeli yayınlanmış bir tanıma bağlamak.
- Diğer seçenek (repo) ancak bir ekran gerçekten tanımsız belge gereksinimi yaratıyor olsaydı doğru olurdu. Yaratmıyor.
- Etiket: `(leave: low / do: safe)`

**Önceki karar ile karşılaştırma:** Önceki karar TEST idi. Aynı kalmalı.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** Yok. (Temel fixture'daki "Certification" gereksiniminin bir tanımı yok, yani kaynaksız. Aşağıda "Alan geneli"nde tartışılıyor.)

**Kullanıcıya sorular:** Yok.

---

### bl052_document_definitions

**Ekrandaki karşılığı:** Settings → Documents → "Add document" ile yeni belge kaydetmek (Draft olarak düşer), sonra Publish. Yayınlanmış bir belge drawer'da salt okunurdur ("Unpublish to edit"). Örnek: owner "Safety" belgesini Conditional, 7 gün süreli kaydeder; Ayşe'ye atanır; sonra süreyi 14 güne çıkarmak ister.

**Test ne iddia ediyor (kırmızı kontroller):**
- #6 "new definition revision is one": yeni tanımın sürüm sayacı 1 olmalı; şu an 2.
- #7 "requirement copies definition lifecycle", #8 "active assignment starts defined deadline", #9 "conditional snapshot does not masquerade…": gereksinim tanımın ayarlarını kopyalar, aktif çalışanda süre başlar, conditional belge zorunlu gibi davranmaz. Hepsi NULL, çünkü satır hiç oluşmadı.
- #10 "definition revision can be edited": düzenleme reddedildi ("document type changed; refresh required").
- #11 "editing definition does not mutate assigned snapshot" ve #12 "…preserves existing UTC deadline": ikisi de NULL.

**Eski davranış:** 16 Eylül öncesinde tanım kaydedilir kaydedilmez atanabilirdi. Sürüm sayacı yeni kayıtta 1'di. Düzenleme her an serbestti, atanmış kopyaya dokunmazdı. Senaryolar:
1. Owner "Safety"yi kaydeder → Ayşe'ye doğrudan atanabilir, 7 günlük süre başlar.
2. Owner süreyi 14 yapar → Ayşe'nin kopyası 7 günde kalır, ta ki biri Apply diyene kadar.
3. Eski sürüm numarasıyla kaydetmeye çalışan ikinci sekme → reddedilir.

**Ne değişti:** Aynı migration (`20260916052509`, 16 Eylül) üç şey getirdi:
- Yeni tanımlar Draft başlar.
- Taslak tanıma gereksinim bağlanamaz (kapı düşürür).
- Yayınlanmış tanım düzenlenemez (`guard_document_definition_edit`: "Published documents cannot be edited; unpublish first").

Aynı tetikleyici, taslakta içerik değişip sürüm değişmemişse sürümü +1 yapıyor. Kayıt servisi (`save_document_type_lifecycle_service`) önce satırı ekleyip sonra ayarları ayrı bir güncellemeyle yazdığı için ilk kayıt 1 yerine 2'de bitiyor.

Yazılı gerekçe: migration yorumları ve UI-DOC-001'in "Kapalı kararlar" listesi ("Republish tam süreyi yeniden başlatır", "Unpublished durumda upload/submit/review durur"). BACKLOG satır 96'ya göre kullanıcı "published salt okunur" davranışını onayladı.

**Yeni davranış:** Aynı senaryolarla:
1. "Safety" Draft kalır, Ayşe'ye hiçbir şey düşmez (etkisi sıfır). Publish'te dağıtım adımı Ayşe'ye atar ve 7 günü başlatır.
2. Süreyi değiştirmek için önce Unpublish gerekir. Bu Ayşe'nin yükümlülüğünü duraklatır (süre silinir). Sonra düzenleme, sonra Republish; Republish Ayşe'nin kopyasını 14 güne günceller ve tam süreyi yeniden başlatır.
3. Eski sürümle kaydetme → yine reddedilir.

Sürüm sayacının 2'den başlaması ekranda görünmez. Sayaç yalnız "iki kişi aynı anda kaydetti mi" kontrolü için var. Web listeyi yeniden okuyup güncel sayıyı gönderiyor (`apps/web/src/settings/documents-data.ts:58`, `apps/api/src/settings/document-types-service.ts:145`).

**Hedefe göre doğrulama:** Yeni mantık "taslak belgenin etkisi sıfır" kararına tam uyuyor, eski mantık uymuyordu. #11/#12'nin anlattığı "tanım düzenlemesi atanmış kopyaya dokunmaz" ilkesi bugün yarı doğru: taslakta düzenlemek dokunmaz, ama düzenlemenin tek yolu Unpublish'tir ve o, süreleri durdurur. Republish de herkese yeni ayarı yazar. Bu bilinçli bir karar (UI-DOC-001), hedefle çelişmiyor. Bir yan etkisi var, "Fikirler"de: başlıktaki bir yazım hatasını düzeltmek bile herkesin süresini durdurup sıfırlıyor. Lokasyon kapsamı sorusu yok.

**Kanıt:**
- *Deneyerek:* Düzeltilmiş kopya `B-work/definitions_fixed.sql`: #6 yerine "yeni tanım Draft kaydedilir"; atamadan önce yayınla; düzenlemeden önce Draft'a çek; sürümü varsaymak yerine oku. Bugünkü kodla 13/13, "kapı hata verir" yamasıyla 13/13. Değiştirilmemiş test yamayla #6'dan sonra ölüyor (ran=6).
- *Deneyerek (kardeş test):* `document_publication.test.sql` (yeşil, 59 kontrol) Publish → Unpublish → düzenle → Republish zincirini servis üzerinden zaten doğruluyor. #10-#12'nin asıl yeni-model karşılığı orada.
- *Kod okuyarak:* Çift artışın yeri: `save_document_type_lifecycle_service` → `save_document_type` (insert) + `update … lifecycle_revision=case when new then 1`, ardından tetikleyici +1 ekliyor. Kardeş düzeltmeler aynı yolu izlemiş: commit'ler `1ed4c7b` ("reads the revision as it stands") ve `750db4c`.

**Önerilen karar:** **Test düzelsin**. Önceki karar (yayınla + sürümü oku) doğru, ama bir ekle: yayınlanmış tanım düzenlenemediği için #10-#12 düzenlemeden önce Draft'a çekmeli.
- Kırmızıların hepsi bugünkü kurala aykırı fixture'dan geliyor: taslağa atama ve yayınlanmış tanımı düzenleme.
- Sürümün kaç başladığı üründe hiçbir şeyi değiştirmiyor. Testin 1 diye kilitlemesi bir iç ayrıntıyı iddia etmek olur.
- Repo tarafı (ilk kayıtta çift artışı gidermek) isteğe bağlı küçük bir temizlik. Ancak bir ekran sürümü kullanıcıya gösterseydi ya da "1'den başlar" diye bir kural olsaydı doğru seçenek olurdu. Yok.
- Etiket: `(leave: low / do: safe)`

**Önceki karar ile karşılaştırma:** Önceki karar TEST (yayınla + sürümü oku) idi. Aynı kalmalı, "düzenlemeden önce Unpublish" adımı eklenmeli.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** Yok.

**Kullanıcıya sorular:** Yok. (Yazım hatası konusu "Fikirler"de.)

---

### bl052_document_employee_assignment_preview

**Ekrandaki karşılığı:** Employees → çalışan drawer'ı → Employment'ta lokasyon/job değiştirilince çıkan **"Document assignment impact"** kutusu, ör. "Safety: will be assigned, 7 days". Kutu hesaplanamazsa Save kilitlenir (`EmployeeDrawer.tsx:223-227, 743, 1333`). Örnek: owner Ayşe'yi Beşiktaş + Cook yapınca kutu "Safety atanacak" demeli.

**Test ne iddia ediyor (kırmızı kontroller):**
- #1 "preview evaluates independent location and global job inputs": "assign" bekleniyor, NULL geldi.
- #5 "target exit preview shows closing obligation": "remove" bekleniyor.
- #6 "…clearing its access blocker": true bekleniyor.
- #7 "employee manager without document-read receives no private document title": "Document requirement" bekleniyor.

Hepsi NULL, çünkü tanım taslak kaldığı için ne önizleme ne eşitleyici onu görüyor.

**Eski davranış:** 16 Eylül öncesinde kaydedilen tanım hemen "etkin"di. Önizleme ve eşitleyici onu hesaba katıyordu. Senaryolar:
1. Ayşe'yi Beşiktaş + Cook yap → "Safety atanacak".
2. Ayşe Beşiktaş'tan çıkarılacak → "Safety kapanacak, erişim engeli kalkacak".
3. Belge okuma izni olmayan yönetici → başlık yerine "Document requirement".

**Ne değişti:** Aynı migration (`20260916052509`). Belge görünümündeki "güncel sürüm" bayrağı artık "yayınlanmış mı" demek (`app_private.lifecycle_definition.current_version = publication_status='published'`). Önizleme ve eşitleyici yalnız bu bayrağı taşıyan tanımlara bakıyor. Yazılı gerekçe: migration yorumu *"Only published documents are assignable."*

**Yeni davranış:** Tanım taslak iken üç senaryoda da kutu boş ("No document requirements will change"). Bu doğru: taslak etkisiz. Yayınlanınca üç senaryo eskisi gibi çalışıyor.

**Hedefe göre doğrulama:** Yeni davranış "taslağın etkisi sıfır" kararına uyuyor. Ayrıca **yeni bir kapsam hatası** ölçtüm (bu testte görünmüyor):
- Önizleme, gönderilen lokasyon listesindeki **her** lokasyonun yöneticinin kapsamında olmasını istiyor.
- Kaydetme servisi (`save_employee`) ise yalnız **yeni eklenen** lokasyonlara bakıyor. Kapsam dışındaki mevcut lokasyonun listede kalmasını zaten şart koşuyor.
- Sonuç: Kadıköy manager'ı Ali, Kadıköy + Beşiktaş'ta çalışan ve daveti kabul etmiş Ayşe'nin job'ını değiştirince önizleme 42501 "valid scoped assignments required" hatası veriyor. Drawer bu yüzden Save'i kilitliyor. Kaydetme servisi aynı değişikliği kabul ediyor.
- Bu, 14 Eylül BL-051 kararına aykırı: *"Bir ortak lokasyon yeterlidir: ilgili Edit yetkisi varsa başka lokasyonlarda da çalışan kişinin ortak kaydı üzerinde işlem yapabilir"* (`docs/rebuild/bl-051-roles-permissions-design-2026-09-14.md`).
- → **KAPSAM MODELİ SORUSU (K3)**, aşağıda.

**Kanıt:**
- *Deneyerek:* Kayıttan sonra tanım yayınlandı (`B-work/preview_fixed.sql`): 9/9, yamayla da 9/9. "Kapı hata verir" yaması bu dosyayı değiştirmiyor (4 kırmızı kalıyor, önizleme satır eklemiyor).
- *Deneyerek:* Ali (yalnız West/Kadıköy) + iki lokasyonlu çalışan (`B-work/exp_mgr_preview.sql`). Önizleme [West, East] → `42501`. Önizleme [West] → OK. `save_employee` [West, East] + job değişikliği → OK.
- *Kod okuyarak:* Drawer'daki kilit `EmployeeDrawer.tsx:209-227` (önizleme hatası → `documentPreviewBlocked`); `save_employee` satır 48-65.

**Önerilen karar:** **Test düzelsin** (tek satır: kaydettikten sonra yayınla).
- Kırmızılar fixture'ın taslak tanım kullanmasından.
- Ürün kodu bu konuda doğru davranıyor.
- #7'nin fixture'ı ürünün üretemeyeceği bir durum kuruyor, aşağıya bakın. Aynı düzenlemede bir manager'la yeniden yazılması iyi olur.
- Kapsam hatası ayrı bir backlog maddesi: `(leave: medium / do: moderate)`. Önizlemenin kapsam kontrolü `save_employee`'deki gibi yalnız yeni eklenen lokasyonlara uygulanmalı, K3'ün cevabına bağlı.
- Etiket (test): `(leave: low / do: safe)`

**Önceki karar ile karşılaştırma:** Önceki karar TEST idi. Aynı kalmalı.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** #7'nin fixture'ı "belge okuma izni olmayan yönetici" senaryosunu **owner rolünün** izinlerini silerek kuruyor (`delete from workspace_role_permissions where role_id = owner'ın rolü`). Hedefte owner "her şey"dir ve Settings → Roles'ta owner rolü korunuyor (BL-051 kararı). Fixture ürünün üretemeyeceği bir durumu anlatıyor; kapsamlı bir manager ile yazılmalı. `(leave: low / do: safe)`

**Kullanıcıya sorular:** K3 (alan geneli).

---

### employee_onboarding_rls

**Ekrandaki karşılığı:** Çalışan onboarding'i (`/welcome/...`: profil, belgeler, politika onayı, availability, gönder) ve yöneticinin incelemesi (Employees → çalışan drawer'ı → Profile → **"Legal name review"** bloğu: Accept / Request changes / "Activate employee access"). Örnek: Taylor davet kabul eder; yasal adını "Taylro"dan "Taylor"a düzeltir; bunu yalnız owner/admin onaylayabilir, Kadıköy manager'ı Ali onaylayamaz.

**Test ne iddia ediyor (kırmızı kontroller):**
- #10 "manager cannot approve legal name correction": beklenen 42501 "owner or admin approval required for legal name changes"; gelen P0002 "onboarding case unavailable".
- #22 / #26 / #28 "core and configured requirements are snapshotted once", "idempotent initialization…", "existing onboarding snapshot remains immutable…": 4 madde bekleniyor (profil, availability, Photo ID, politika), 3 geliyor.
- #38 "private document confirmation rejects non-contract object paths": beklenen 22023, gelen PT409 "Document upload changed; refresh and use Submit document". Bu hata transaction'ı düşürüyor (satır 293), sonraki **32 kontrol hiç koşulmuyor**. Baseline'daki "37/70" = 5 gerçek kırmızı + 32 koşulamayan.

**Eski davranış:**
- 8-9 Eylül (`20260908150000_employee_legal_name_review_gate` vb.): manager üyeliği `all_locations=true` ile herkesi görebiliyordu. Yasal ad onayı "owner or admin" mesajıyla reddediliyordu.
- Belgeler yayın kavramı olmadan doğrudan onboarding'e giriyordu.
- Belge yükleme eski "onayla" çağrısıyla (`confirm_employee_document_service`) tek adımda tamamlanıyordu.

Senaryolar:
1. Ali (manager, tüm lokasyonlar) Taylro'nun yasal ad düzeltmesini onaylamaya çalışır → "owner or admin approval required".
2. Taylor onboarding'i açar → 4 madde: Profile, Photo ID, Workplace policy, Availability.
3. Taylor Photo ID yükler → eski onay çağrısı kabul eder, belge hemen tamamlanır.

**Ne değişti:**
- (a) 14 Eylül, commit `fc2c4da` (BL-051 roller; commit mesajı yalnız "checkpoint"). Yazılı gerekçe `docs/rebuild/bl-051-roles-permissions-design-2026-09-14.md`: *"Manager kapsamı çalışan kaydında kendisine atanmış çalışma lokasyonlarından gelir"*, *"Manager için private information ve employee documents başlangıçta kapalı"*. Uygulama iki parça:
  - `enforce_role_location_scope` tetikleyicisi manager'ın `all_locations` değerini **sessizce false yapıyor**.
  - Yasal ad onayı "employees.private.manage" iznine bağlandı, mesaj "private information edit access required".
- (b) 16 Eylül (`20260916052509`): yeni belgeler Draft başlıyor. Testteki Photo ID doğrudan eklenip varsayılan olarak Draft kalıyor.
- (c) 16 Eylül (`20260916005914_bl052_document_onboarding_integration`): eski onay çağrısı her seferinde hata veren boş bir kabuğa dönüştü. Migration yorumu: *"Stale clients cannot supersede approvals or bypass explicit submission."* Yeni yol: taslak dosya + Submit + inceleme.

**Yeni davranış:** Aynı senaryolarla:
1. Ali'nin kendi employee kaydı yok, yani kapsamı boş; Taylro'nun lokasyonu da yok. Ali vakayı hiç göremiyor (P0002). "Şube eklemek çözmedi" çünkü iki şey gerekiyor: Ali'nin **kendi employee kaydında** o lokasyon olmalı, ve beklenen mesaj artık başka. İkisi düzeltilince doğru kural çalışıyor: Ali reddediliyor, mesaj "private information edit access required".
2. Photo ID Draft olduğu için listeye girmiyor → 3 madde. Yayınlanınca 4.
3. Eski onay çağrısı her zaman reddediyor. Çalışanın onboarding ekranı zaten yeni yolu kullanıyor (`OnboardingDocumentStep` → `document-data.ts` → `/v1/me/workspaces/:id/documents/:id/confirm`).

**Hedefe göre doğrulama:**
- Manager'ın yalnız kendi lokasyonlarındaki çalışanı görmesi hedefle **uyumlu**. Kapsamın kendi employee kaydından gelmesi de hedefte açıkça onaylı.
- Yasal ad onayını owner/admin'e bırakmak hedefle çelişmiyor. Hedef "manager Settings'te çoğunlukla salt-okunur" diyor; özel bilgiler ayrı izin.
- "Yönetici vakayı göremiyor" bir **ürün hatası değil**. Fixture, bugün var olamayan bir manager kuruyor: `all_locations=true` olan, employee kaydı olmayan bir manager.
- Kapsam sınırında şu senaryolar ölçüldü, hepsi **KAPSAM MODELİ SORUSU**:
  - **K1:** Ayşe Kadıköy + Beşiktaş'ta. Kadıköy manager'ı Ali de, Beşiktaş manager'ı Mehmet de Ayşe'nin onboarding incelemesini açabiliyor. İkisi de aktivasyonu ve (izin verilirse) belge onayını yapabilir; kim önce basarsa. Bugünkü kod "bir ortak lokasyon yeter" (BL-051 kararı) diyor.
  - **K2:** Zeynep "exclude from schedule", lokasyonu yok, Ali onu oluşturdu. Zeynep daveti kabul ettikten sonra Ali dahil hiçbir manager onu göremiyor, yalnız owner/admin. Ali'nin kaydı davetten önce yönetebilmesi `can_manage_employee_record` içindeki "kendi taslağı" istisnasından geliyor; bu istisna görme kuralında yok.
  - Can yalnız Beşiktaş'ta → Ali göremiyor (beklenen).
- Hedef dışı ama önemli iki bulgu:
  - Manager'ın varsayılan "Review employee onboarding" izninin **ekranda karşılığı yok**. İnceleme paneli yalnız "Legal name review" bloğunda çıkıyor ve o blok "employees.private.read" istiyor; manager'da bu izin yok.
  - "Final approval required" ayarının (`employee_onboarding_settings.final_approval_required`) **ne API'si ne ekranı var**. Test #47-#55 bu modu sınıyor ama kimse onu açamaz.

**Kanıt:**
- *Deneyerek:* Düzeltilmiş kopya `B-work/rls_fixed.sql`, **65/65 yeşil**, "kapı hata verir" yamasıyla da 65/65. Değişiklikler:
  - Photo ID yayınlandı.
  - Kadıköy lokasyonu, manager'ın kendi employee kaydı (`…0005`, Kadıköy) ve Taylor/Taylro'nun Kadıköy ataması eklendi. Kapsam yalnız kapsam-eşitleme tetikleyicileri "immediate" yapılarak dolduruldu.
  - #10'un mesajı "private information edit access required" oldu.
  - Eski onay/indirme kontrolleri (5 kontrol) ve eski `employee_documents` satırı silindi.
  - Politika onayı ve gönderme sürüm numaraları 1 azaltıldı.
- *Deneyerek:* Bütün fixture'ı tek seferde "immediate" yaparsam eşitleyici, onboarding başlatılmadan **önce** çalışıyor. Taylor'ın vakasını yalnız belge maddeleriyle açıyor; onboarding başlatma da "zaten madde var" diyerek profil ve availability'yi hiç eklemiyor (2 madde). Uygulama akışında buna ulaşılamıyor, çünkü davet kabulü üyelik + başlatmayı aynı transaction'da yapıyor, eşitleyici commit'te çalışıyor. Yine de kırılgan (aşağıda A5).
- *Deneyerek:* Kapsam senaryoları K1/K2 (`B-work/exp_scope.sql`):

  | | Ayşe (Kadıköy + Beşiktaş) | Zeynep (lokasyonsuz, Ali oluşturdu) | Can (Beşiktaş) |
  |---|---|---|---|
  | Ali (Kadıköy) | görür | görmez | görmez |
  | Mehmet (Beşiktaş) | görür | görmez | görür |

  Satırlar yönetici, kolonlar çalışan. Ali Ayşe'nin incelemesini açtı (case in_progress); Zeynep'in incelemesi P0002.
- *Kod okuyarak:* Eski kod yolları: `confirm_employee_document_service` boş kabuk (`20260916005914`, satır 69-72). API `/v1/me/onboarding/documents/:id/upload-url` ve `/confirm` (`onboarding-routes.ts:105-150`), web `uploadMyDocument` (`onboarding-data.ts:32`, hiçbir ekrandan çağrılmıyor). İndirme tarafı: API `/v1/workspaces/:w/employees/:e/onboarding/documents/:r/download` + `get_employee_document_path_service`; drawer'daki "Open document" düğmesi hiç çizilmiyor, çünkü panel yalnız `kinds={["profile"]}` ile kullanılıyor (`EmployeeDrawer.tsx:2073`).

**Önerilen karar:** **İkisi.**
- **Test:**
  - Photo ID'yi yayınla.
  - Manager'a kapsamı bugünkü kurala göre ver (kendi employee kaydı + ortak lokasyon); `all_locations=true`'yu fixture'dan sil.
  - #10'un mesajını "private information edit access required" yap.
  - Eski onay/indirme kontrollerini sil.
  - #28'in adını dürüstleştir: bugün "sonraki ayar değişiklikleri mevcut listeye dokunmaz" doğru değil. Yayınlanan yeni belge, onboarding ortasındaki Taylor'a da gidiyor; deneyle doğrulandı. Kontrol yalnız "başlatma tekrar çalışınca yeni tanımları eklemez"i sınıyor.
  - Etiket: `(leave: medium / do: safe)`
- **Repo (backlog, testin önünde değil):**
  - Eski belge yükleme/indirme yığınını sil (DB kabuğu, iki API route'u, servis metotları, web fonksiyonları, drawer'daki ölü dal). "Canlı veri yok" kuralına göre "eski istemci" bahanesi geçersiz. Etiket: `(leave: low / do: moderate)`
  - "Final approval required" ya ekrana gelsin ya silinsin (soru S6).
- Neden:
  - Kırmızıların hepsi bugünkü kurala aykırı fixture ya da emekliye ayrılmış yol.
  - Ürün kuralları (manager kapsamı, yasal ad = özel bilgi izni) hem hedefle hem BL-051 kararıyla uyumlu.
  - 32 kontrol şu an hiç koşulmuyor. Düzeltme onları geri getiriyor ve hepsi yeşil.
- Diğer seçenek (ürün, yani manager'ın herkesi görmesi) ancak "manager organizasyon kapsamlı" kararı verilirse doğru olurdu. Hedef tersini söylüyor.

**Önceki karar ile karşılaştırma:** Önceden karar verilmemişti (BL-096). Öneri yukarıda.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:**
- "Final approval" modu (#47-#55): açacak ekran ya da API yok.
- Fixture'daki manager `all_locations=true`: DB sessizce false yapıyor, yani kural dışı bir değer.
- "manager receives onboarding review" (#3): izin var, ekranda kullanılacak yer yok.

**Kullanıcıya sorular:** K1, K2, S6 (alan geneli).

---

### weekly_onboarding_preferences

**Ekrandaki karşılığı:** Onboarding'in Availability adımı (`/welcome/availability`). Çalışan "müsait olmadığım saatler" haftasını doldurur ya da atlar. Ayrıca Settings → Scheduling → Availability paneli → **"Required during onboarding"** anahtarı: açıksa bu adım zorunlu olur ve aktivasyonu bekletir. Örnek: Ayşe haftasını kaydeder, onboarding'i gönderir, otomatik aktif olur.

**Test ne iddia ediyor (kırmızı kontroller):**
- #19 "onboarding reset still works": çalışanın "Start over" ile baştan başlaması; şimdi "Continue your existing onboarding…" hatası.
- #21 "reset continues clearing the profile requirement".
- #22-#25: gönderme yanlış sürüm numarasıyla (4) yapılıyor. Reset olmayınca sürüm 3'te; zincirleme kırmızı.

**Eski davranış:** 8 Eylül (`20260908151000_employee_onboarding_reset_start_over`; main'e `711da48` ile 9 Eylül'de geldi). Çalışanın "Start over"ı özel profil bilgilerini, belge dosyalarını ve politika imzalarını **siliyor**, maddeleri "başlanmadı"ya çeviriyor, vakayı açık hale getiriyordu. Haftalık availability ayrı saklandığı için "tamamlandı" kalıyordu. Senaryolar:
1. Ayşe yanlış yüklediğini düşünüp Start over'a basar → imzalı politika kanıtı dahil her şey silinir.
2. Haftası korunur.
3. Onaylanmış (aktif) çalışan Start over yapamaz.

**Ne değişti:** 16 Eylül, `20260916011008_bl052_document_acknowledgements` (rescue `557cc16`). Yazılı gerekçe, migration yorumu: *"Start over has been removed from the product; it must not delete retained document or signature history through an old client."* Fonksiyon her çağrıda reddeden bir kabuk. `employee_onboarding_rls` testi bu reddi 22 Eylül'de (`158b5d5`) doğrulamaya başladı; bu dosya güncellenmedi. Kullanıcı kararı (bu oturum): çalışan onboarding'i hiç sıfırlanamaz, kalıntılar silinsin.

**Yeni davranış:** Aynı senaryolarla:
1. Start over yok. Hiçbir ekranda düğme yok; web fonksiyonu `resetMyOnboarding` (`onboarding-data.ts:105`) hiçbir yerden çağrılmıyor, yalnız bir test onu taklit ediyor. API route'u (`onboarding-routes.ts:195`) ve servis metodu (`onboarding-service.ts:245`) hâlâ duruyor ve her seferinde DB hatası döndürüyor.
2. Haftası zaten korunuyor.
3. Aynı.

**Hedefe göre doğrulama:**
- Yeni davranış kullanıcı kararıyla ve "belge/imza geçmişi korunur" ilkesiyle uyumlu. Eski davranış yasal kanıtı silebildiği için yanlıştı.
- Availability'nin "yönetici onayı olmadan tamamlanması" (#12-#15) hedefle uyumlu: employee kendi beyan eder.
- **Hedefle çelişen yeşil kontroller var:** hedef "availability adımı **opsiyonel**" diyor, kod ise workspace başına "Required during onboarding" anahtarı sunuyor (#5-#10, #28-#31). Varsayılan kapalı, yani hedefle uyumlu başlıyor; ama anahtar hedefte yok → soru S7.
- **Owner "Start over" (ayrı ve canlı):** OwnerOnboardingPage'deki "Start over" → `reset_owner_onboarding_service`, kurulum tamamlanınca "completed owner onboarding cannot be reset" diye reddediyor (kod okuyarak). Hedefle uyumlu: kurulum bitince sıfırlanamaz.
  - Küçük not: fonksiyonun owner kontrolü (`if actor_role <> 'owner'`) üye olmayan bir aktörde NULL döndüğü için kontrolü atlıyor. API katmanı "workspace.manage" izni istediği için bugün ulaşılamaz. Etiket: `(leave: low / do: safe)`
  - Dokunulmadı.

**Kanıt:**
- *Deneyerek:* Düzeltilmiş kopya `B-work/weekly_fixed.sql`: reset + "profili yeniden tamamla" satırları (43-46) silindi, gönderme sürümü 3 yapıldı → **28/28 yeşil**, "kapı hata verir" yamasıyla da 28/28.
- *Kod okuyarak:* Eski reset'in sildikleri (`20260908151000`, satır 27-37). Kalıntılar:
  - API route + servis + API testleri (`app.test.ts:2622` ve `:2704`, sahte servisle 200 döndüğünü iddia ediyor).
  - Web `resetMyOnboarding` + `EmployeeOnboardingPage.test.tsx:57` taklidi.
  - DB kabuğu `reset_employee_onboarding_service`.
  - `employee_onboarding_rls.test.sql:162-168`'deki "reddedilir" kontrolü.

**Önerilen karar:** **İkisi.**
- **Test:** #19-#21'i sil, göndermeyi gerçek sürümle (3) yap. Yeni test yazmaya gerek yok.
- **Repo:** kullanıcı kararı gereği çalışan tarafı reset kalıntılarının hepsini sil (yukarıdaki liste). Fonksiyon silinince `employee_onboarding_rls`'teki "reddedilir" kontrolü de silinmeli. İsterseniz yerine "böyle bir fonksiyon yok" kontrolü (`hasnt_function`) kuralı belgeler.
- Etiket: `(leave: low / do: safe)`. Hiçbir ekran bu yolları kullanmıyor.
- Neden: kırmızıların tek sebebi artık var olmayan bir özelliği iddia etmek. Kullanıcı kararı açık. Kalıntılar "eski istemciye cevap" bahanesiyle duruyor, ama canlı istemci yok.
- Diğer seçenek (Start over'ı geri getirmek) yalnız "geçmiş silinmeden sıfırlama" istense doğru olurdu. Karar tersi.

**Önceki karar ile karşılaştırma:** Kullanıcı kararı (hiç sıfırlanamaz, kalıntılar silinsin) aynen kalmalı.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:**
- "Required during onboarding" modu (#5-#10, #28-#31) → S7.
- #11'in adı "manager cannot manufacture an employee declaration" ama owner ile koşuluyor; zararsız bir ad hatası.

**Kullanıcıya sorular:** S7.

---

## Alan geneli bulgular

### A1. Ortak kök: taslak belge (dört dosya, yedi kırmızı grubu)
access #12, definitions #6-#12, preview #1/#5-#7, onboarding_rls #22/#26/#28. Hepsinin sebebi 16 Eylül'de gelen "yeni belge Draft başlar" kuralı ve bunu sessizce uygulayan yayın kapısı. Kapı sessiz olduğu için testler hata yerine NULL gördü ve sebebi saklandı.

**Kararınızın ("taslağın etkisi sıfır; atama yolları yalnız yayınlanmışı seçsin, taslak gelirse hata") ölçülmüş etkisi:**
- İpucundaki "3 yol süzmüyor" tespiti **kısmen yanlış**:
  - Eşitleyici zaten yalnız yayınlanmışları seçiyor (`current_version` = yayınlanmış).
  - Dağıtım adımını çağıran iki yer (`set_document_publication_service`, `apply_document_definition_service`) önce yayınlıyor ya da yayın şartı koyuyor.
  - **Süzmeyen tek yol onboarding başlatma.** Taslakları da seçiyor, kapı sessizce düşürüyor. (Politika onayları, yani acknowledgements, bu yolda zaten `status='published'` ile süzülüyor. Yalnız belgeler istisna.)
- **Sıra önemli.** Kapı hata verir ama başlatma süzmezse, içinde tek bir Draft belge olan her workspace'te davet kabulü ve `/welcome` açılışı çöker. Deneyerek: `employee_onboarding_rls` ilk başlatmada ölüyor (ran=7).
- Doğru sıra: (1) başlatmaya `and document.publication_status='published'` eklemek (tek satır), (2) kapıyı hata verir yapmak.
- Bu ikisi birlikte uygulanınca, belgeye ya da onboarding'e dokunan 33 test dosyasının **31'i birebir aynı** sonucu veriyor. Değişen iki dosya (`bl052_document_access`, `bl052_document_definitions`) zaten bu raporda düzeltilen dosyalar; düzeltilmiş halleriyle ikisi de yeşil. Ölçüm: `B-work/base.txt` ve `B-work/raise.txt`.
- **Yayın sonrası dağıtım** değişmiyor:
  - Publish önce durumu "published" yapıyor, sonra dağıtıyor.
  - Dağıtım, eşleşen **aktif ve bekleyen** (onboarding ortasındaki) herkese gidiyor. Deneyerek: onboarding ortasındaki Taylor'a "Late handbook" yayınlanınca 5. madde olarak eklendi.
  - Onboarding'ini göndermiş bekleyen çalışanın vakası, yeni belge zorunluysa "changes requested"a döner (kod okuyarak).
  - Daveti sonra kabul edenler belgeyi başlatmada alır.
  - Unpublish süreleri durdurur; Republish tam süreyi yeniden başlatır.
- **Kararın önerilen hali:** başlatma süzsün + kapı hata versin. Etiket: `(leave: medium / do: safe)`. Hata ile birlikte kapıya küçük bir test: "taslak tanıma gereksinim eklemek reddedilir". Bugün dağıtım adımı taslağa rastlasa `returning * into r` boş kalıp denetim kaydında patlardı; hata vermek bunu da netleştirir.

### A2. Sessiz yeniden yazma kalıbı (iki tetikleyici)
- Yayın kapısı satırı sessizce düşürüyor.
- `enforce_role_location_scope` manager'ın `all_locations=true`'sunu sessizce `false` yapıyor.

İkisi de "yönetici vakayı hiç göremiyor" gibi sebebi görünmeyen kırmızılar üretti. Kapı için kararınız verildi. Manager tarafında da aynı ilke düşünülebilir, ama rol değişikliği akışları bu alanı taşıdığı için "hata ver"e geçmek daha riskli; önce çağıranlar ölçülmeli. Ayrıca iki erişim kuralında (`service_actor_can_access_employee`, `can_manage_employee_record`) manager için `actor.all_locations or …` dalı artık **hiç doğru olamaz**, yani ölü kod. Etiket: `(leave: low / do: moderate)`

### A3. "Eski istemci" bahanesiyle duran kod yolları
Hiçbiri ekrandan kullanılmıyor. "Canlı veri yok" kuralına göre silinmeli, hepsi backlog'a:
- Eski belge yükleme/indirme yığını (onboarding_rls bölümünde listelendi). `(leave: low / do: moderate)`
- Çalışan tarafı reset kalıntıları (weekly bölümünde listelendi). `(leave: low / do: safe)`
- **Belgeler için eski Apply.** Web'deki "Apply to existing assignments" bileşeni yalnız politikalar için çiziliyor (`SignatureTemplatesSettingsPage.tsx:790`, `kind="acknowledgement"`). Belgeler için `/document-types/:id/preview|apply` route'u, web fonksiyonları ve `apply_document_definition_service` / `preview_document_definition_apply_service` yalnız testte yaşıyor (`bl052_document_apply`). Belgelerde Publish = Apply. `(leave: low / do: moderate)`
- `apps/api/src/auth/workspace-context.ts:241-253` "BL-052 migration'ları henüz yoksa" toleransı, `apps/web/src/settings/documents-data.ts:63-70` "publishing temporarily unavailable" toleransı. `(leave: low / do: safe)`
- **Kaynaksız belge gereksinimleri** (bir tanıma bağlı olmayan belge satırları). Hiçbir uygulama yolu bunları üretemiyor, çünkü üç ekleme yolu da tanım kimliği yazıyor. Yine de eşitleyici onları "tarihsel" diye koruyor (`if r.source_id is null then continue`). Neredeyse bütün `bl052_*` testlerinin temel fixture'ı ("Certification") böyle bir satır. Kural olarak "belge satırının tanımı olur" kısıtı konup fixture'lar yeniden yazılabilir. `(leave: low / do: moderate)`: çok dosya, mekanik.
- `document_types.required_at_onboarding` eski sütunu ile yeni mod (required/conditional/optional) iki ayrı doğruluk kaynağı. Servis ikisini eşit tutuyor ama doğrudan eklemede ayrışıyor. `onboarding_rls`'teki Photo ID "required_at_onboarding=true" ama mod "optional", yani aslında zorunlu değil. `(leave: low / do: moderate)`

### A4. Kapsam (manager/lokasyon) bulguları
Bunlar alan G'ye girdi olacak.
- **K1 (iki lokasyonlu çalışanın onboarding'i ve belgeleri):** Bugün iki lokasyonun manager'ı da tam yetkili (inceleme, aktivasyon; izin verilirse belge onayı, muafiyet, süre uzatma). Kim önce yaparsa o geçerli. Bu, BL-051'deki "bir ortak lokasyon yeterlidir" kararının uygulaması (deneyerek).
- **K2 (lokasyonsuz çalışan, ör. "exclude from schedule"):** Davet kabul edildikten sonra hiçbir manager göremez, yalnız owner/admin. Oluşturan manager bile kaybeder (deneyerek).
- **K3 (iki lokasyonlu çalışanın job/lokasyon düzenlemesi):** Kapsam dışı mevcut lokasyon belge önizlemesini patlatıyor, Save kilitleniyor; kaydetme servisi ise kabul ediyor. BL-051 kararına aykırı (DB'de deneyerek, ekran kilidi kod okuyarak).
- **Belge incelemesini kim yapar:**
  - Varsayılan: owner ve admin ("employee_documents.review"). Manager'da kapalı, ama özel rolle açılabilir (`custom_grantable=true`). Açılırsa K1 kuralı geçerli.
  - **Admin kendi belgesini onaylayabiliyor** (deneyerek: admin kendi yüklediği belgeyi onayladı, durum "completed"). Onboarding aktivasyonunda "kendini aktive edemezsin" kuralı var, belgede yok → S4.

### A5. Kırılganlık: onboarding başlatmanın "hiç madde yoksa listeyi oluştur" kuralı
Bekleyen bir üyenin vakası başlatmadan önce eşitleyici ya da dağıtım tarafından açılırsa (yalnız belge maddeleriyle), başlatma "zaten madde var" der ve profil/availability maddelerini hiç eklemez. Bugün uygulama akışında ulaşılamıyor (deneyerek fixture'da oluştu). Bir gün davet kabulü ile başlatma ayrı transaction'lara bölünürse sessizce ortaya çıkar. Etiket: `(leave: low / do: safe)`, not olarak tutulmalı.

### A6. Owner'ın kendi kaydındaki belgeler ("owner is excused", `20260922050000`, commit `9fa2dff`, 21-22 Eylül)
Owner'ın kaydına düşen her belge ve politika muaf olarak geliyor, muafiyet kaldırılamıyor.
- Hedefle ruhen uyumlu: owner'ın üstünde onu inceleyecek kimse yok, belgeleri isteyen de kendisi.
- Ölçülen/okunan pürüzler:
  - **Publish önizlemesi owner'ı "assign" diye gösteriyor**, oysa owner muaf olarak alıyor. Deneyerek: önizlemede "Olga Owner: assign", sonuçta `lifecycle_exempt=true, required=false`. Publish onay penceresi bir kişi için yanlış bilgi veriyor. `(leave: low / do: safe)`
  - **Sahiplik devrinde muafiyet taşınmıyor** (kod okuyarak: `respond_workspace_ownership_transfer_service` yalnız üyelikleri değiştiriyor; muafiyet tetikleyicisi yalnız yeni satırlarda çalışıyor). Eski owner (artık admin) muaf belgelerini korur ve muafiyeti artık kaldırılabilir hale gelir. Yeni owner'ın eski, muaf olmayan (belki engelleyen) belgeleri kalır; yeni gelenler muaf gelir. `(leave: low / do: moderate)`
  - **Yasal zorunluluk:** Owner vardiyaya konabiliyor (hedef). Belge "süresi geçince vardiya engeli" üretiyorsa (ör. Food handler), owner muaf olduğu için bu engel owner'a hiç uygulanmıyor → S5.
  - Admin ve manager muaf değil: onboarding'den geçer, belgelerini owner/admin inceler (admin kendi belgesini de, bkz. S4).

### Fikirler (ürün sahibi açık)
- **Yazım hatası düzeltmek herkesin süresini sıfırlıyor.** Yayınlanmış belgenin açıklamasındaki bir harfi düzeltmek için bile Unpublish (herkes duraklar) → düzenle → Republish (herkesin süresi baştan başlar) gerekiyor. "Yalnız başlık/açıklama değişikliği yükümlülüklere dokunmadan yayınlanmış belgede yapılabilsin" ayrı bir küçük DB işi olur. Bugünkü davranış bilinçli ve onaylı (BACKLOG satır 96). Yalnız sıkıntı olursa düşünülmeli.
- **Manager'ın "Review employee onboarding" izni.** Ya ekranda gerçek bir yer bulmalı (ör. drawer'da bir onboarding özeti + "Activate" düğmesi), ya varsayılan manager rolünden çıkarılmalı. Bugün kâğıt üstünde bir izin.
- **Belge testleri.** Kardeş testler (`bl052_document_apply`, `dynamic_targeting`) yayını doğrudan `update … publication_status='published'` kısayoluyla yapıyor. Hızlı ama gerçek Publish'in dağıtım adımını atlıyor. Kısayolun yalnız "atamadan önce yayınlanmış olsun" amacıyla kullanıldığı, yayın davranışının `document_publication` testinde servis üzerinden sınandığı yazılı bir kural olarak konmalı.

## Kullanıcıya sorular (alan geneli, önem sırasıyla)

1. **A1 uygulama sırası (onay):** "Taslak belge sıfır etki" kararınızı şöyle uygulamayı öneriyorum: önce onboarding başlatma yalnız yayınlanmış belgeleri seçsin (tek satır), sonra yayın kapısı taslakta hata versin.
   - Neden: yalnız kapıyı değiştirmek, bir Draft belgesi olan her workspace'te davet kabulünü çökertir (deneyerek).
   - Ölçülen maliyet: 33 ilgili test dosyasının 31'i değişmiyor, değişen 2'si bu raporda düzeltiliyor.
   - Seçenekler: (a) önerilen sıra *(önerim)*, (b) kapı sessiz kalsın, yalnız başlatma süzsün. (b)'de ileride yeni bir yol taslak eklerse yine sessizce yutulur.

2. **K1 — KAPSAM MODELİ SORUSU (iki lokasyonlu çalışanın onboarding'i ve belgeleri):** Ayşe Kadıköy + Beşiktaş'ta. Onboarding aktivasyonunu, legal-name dışındaki incelemeleri ve (izin verilmişse) belge onayı/muafiyet/süre uzatmayı kim yapmalı?
   - Bugün: iki lokasyonun manager'ı da; kim önce basarsa (BL-051 "bir ortak lokasyon yeterli").
   - Seçenekler: (a) bugünkü gibi herhangi bir ortak lokasyon manager'ı *(önerim: belge ve onboarding kişiye ait, vardiyaya değil; iki onay şartı yalnız vardiya takası için hedefte var)*, (b) yalnız birincil lokasyonun manager'ı, (c) çok lokasyonlu çalışanlarda yalnız owner/admin.

3. **K3 — KAPSAM MODELİ SORUSU (iki lokasyonlu çalışanın düzenlenmesi):** Kadıköy manager'ı Ali, Ayşe'nin (Kadıköy + Beşiktaş) job'ını değiştirince belge etki önizlemesi hata veriyor ve Save kilitleniyor. Kaydetme kuralı ise buna izin veriyor.
   - Seçenekler: (a) önizleme, kaydetme gibi yalnız yeni eklenen lokasyonu kapsamda arasın *(önerim; BL-051 kararına uyar)*, (b) çok lokasyonlu çalışanın lokasyon/job'ını yalnız owner/admin değiştirebilsin (o zaman kaydetme kuralı da buna göre sıkılaşmalı).

4. **S4 — Admin kendi belgesini onaylayabilmeli mi?** Bugün evet (deneyerek). Onboarding aktivasyonunda kendi kendini onaylamak yasak.
   - Seçenekler: (a) belge onayında da kendini onaylamak yasak olsun; admin'in belgesini owner ya da başka bir admin onaylasın *(önerim: tutarlılık ve denetim izi)*, (b) serbest kalsın.

5. **K2 — KAPSAM MODELİ SORUSU (lokasyonsuz çalışan):** Zeynep "exclude from schedule", lokasyonu yok. Ali onu oluşturup davet etti. Zeynep kabul edince onboarding'ini ve belgelerini yalnız owner/admin görebiliyor, Ali göremiyor.
   - Seçenekler: (a) böyle kalsın; lokasyonsuz kişiler organizasyon düzeyi, owner/admin'in işi *(önerim)*, (b) oluşturan manager görmeye devam etsin, (c) lokasyonsuz çalışan hiç olmasın (her kayıt en az bir "ev lokasyonu" taşısın).

6. **S5 — Owner'ın belge muafiyeti ve yasal belgeler:** Owner vardiyaya konabiliyor, ama Food handler gibi yasal bir belgeden de muaf.
   - Seçenekler: (a) muafiyet kalsın ama "süresi geçince vardiya engeli" üreten belgeler owner'a da uygulansın, (b) owner her şeyden muaf kalsın *(bugünkü)*, (c) owner muaf gelsin ama isterse kendi belgesini yükleyebilsin.
   - Aynı soruya bağlı: sahiplik devrinde muafiyet yeni owner'a geçsin mi? Önerim: evet, devirde eski ve yeni owner'ın açık belge satırları yeniden değerlendirilsin.

7. **S6 — "Final approval required" (her yeni çalışanı elle aktive etme):** DB'de var, test ediliyor, ama ne ekranı ne API'si var.
   - Seçenekler: (a) sil *(önerim: hedefte böyle bir onay kapısı yok, varsayılan zaten otomatik aktivasyon)*, (b) Settings'e bir anahtar olarak ekle.

8. **S7 — "Required during onboarding" (availability'yi onboarding'de zorunlu yapma anahtarı):** Settings → Scheduling → Availability. Hedef "availability adımı opsiyonel" diyor. Varsayılan kapalı.
   - Seçenekler: (a) anahtar kalsın, varsayılan kapalı; owner isterse zorunlu yapar *(önerim: hedefle çelişmeden esneklik)*, (b) anahtar ve zorunlu mod silinsin; adım her zaman opsiyonel.

9. **Eski kod yolları (A3):** Belge yükleme/indirme eski yığını, çalışan reset kalıntıları, belgeler için eski Apply, BL-052 öncesi toleranslar, kaynaksız belge satırları. "Canlı veri yok" kuralına göre hepsi silinmeli.
   - Seçenekler: (a) testler düzelirken aynı turda sil, (b) ayrı bir temizlik task'ı *(önerim: testler küçük ve güvenli; silme birkaç katmana dokunuyor, kendi turunu hak ediyor)*.
