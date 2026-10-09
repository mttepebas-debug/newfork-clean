# D2 — Müsaitlik (diğer) — BL-070 derin araştırma raporu

Ölçüm: 2026-09-23 sabahı, main `41783c7`, ortak yerel veritabanı (`supabase_db_newfork-clean`). Dört dosya tek tek koşuldu: sonuç baseline ile birebir aynı. Bütün denemeler tek transaction içinde yapılıp `rollback` ile geri alındı; hiçbir repo dosyası değiştirilmedi. Deneme kopyaları scratchpad'de: `.../scratchpad/d2/`.

**Kısa sözlük** (aşağıda tekrar tekrar geçiyor):
- **Eski sistem**: `employee_schedule_availability_versions` + `availability_requests`. Tarihli ve sürümlü müsaitlik; değişiklikler yönetici onayından geçiyor (bekliyor / onaylandı / reddedildi / düzeltme istendi / geri çekildi).
- **Yeni sistem**: `employee_weekly_preferences` (çalışanın kendi haftası) + `manager_weekly_reminders` (yöneticilerin ortak hatırlatma kaydı). Tek, tekrar eden bir hafta; çalışan yalnızca müsait OLMADIĞI saatleri işaretler; onay yok, kaydettiği an geçerli.
- **Değerlendirici**: bir vardiya yazılırken "bu kişi bu saatte uygun mu?" diye bakan kod. Yenisi `assess_weekly_shift_availability`, eskisi `assess_shift_availability`.
- **Settings → Conflict handling**: admin'in her çakışma türü için Allow / Warn / Require confirmation / Block seçtiği sayfa (`conflict_rules`). Hedefteki "availability hard mı soft mu" ayarı bu sayfa: Block = hard; Warn veya Require confirmation = soft, yani uyarı verir ve üzerine yazılabilir.

**Alan geneli ana bulgu.** Dört dosyanın dördü de kırmızı, ama sebep kodun eski sisteme bağlı olması değil. Kod bu dört yolun hepsinde zaten yeni sisteme geçmiş. Testler ise fixture'larını (testin başında kurduğu örnek veriyi) hâlâ eski tablolara yazıyor ya da artık var olmayan eski kavramları iddia ediyor. BL-091'deki "karar gelmeden bu testlere dokunulmamalı" notu bu dosyalar için ölçümle doğrulanmıyor. Karar bekleyen tek konu şu: eski sistemin kalıntılarını söküp sökmemek.

---

### schedule_default_hours_review

**Ekrandaki karşılığı:** Schedule → Edit mode → Discard düğmesinin yanındaki "Review current default hours" düğmesi. Düğme 2026-09-10'da ekrandan kaldırıldı (BL-062, MVP sonrasına ertelendi); pencere kodda duruyor ama açan bir düğme yok (`SchedulePage.tsx:283-284, 3277`; `setDefaultHoursOpen(true)` hiçbir yerde çağrılmıyor). API ucu (`POST .../edit-sessions/:id/default-hours-preview|apply`) ve veritabanı fonksiyonları çalışır durumda.
Ne işe yarıyor: admin Settings → Shift types'ta Lunch'ın varsayılan saatini 12:00-16:00'dan 11:00-17:00'ya çektiğinde, taslakta "type'ın varsayılan saati" ile duran vardiyalar kendiliğinden değişmiyor. Bu pencere seçili vardiyalara yeni saati önizleyip bilerek uygulatıyor.

**Test ne iddia ediyor (kırmızı kontroller):** Hiçbir kontrol koşmadı (47 kontrol, `no_plan`). Dosya 27. satırda, fixture kurulurken duruyor: kimseye atanmamış, "saati bilinmiyor" (`unresolved`) bir vardiya oluştururken sunucu "Review the current availability assessment before saving" diyor. İddia edilen konular:
1-11: önizleme hiçbir şey yazmaz; bayat oturum, çift seçim ve hafta dışı reddedilir.
12-22: uygulama; parmak izi (fingerprint, "gözden geçirdiğin şey hâlâ aynı mı" damgası), tekrar deneme, değişmez kayıt, audit.
23-27: çakışan komşu vardiya uyarısı.
28-37: eski sistemle hard/soft müsaitlik ve yazılı gerekçeli override; onaylı izin.
38-44: yayınlanmış vardiya yeni taslak üzerinden değişir; toplu işlemde sonraki satır hata verirse hepsi geri alınır.
45-47: izinler.

**Eski davranış:** Migration `20260909031001_schedule_default_hours_review` (2026-09-09 checkpoint `711da48`). Önizleme ve uygulama eski değerlendiriciyi kullanıyordu: eski sürüm tablosu, `availability_enforcement` hard/soft sütunu, en az 10 karakterlik yazılı gerekçeyle override (`overrides[].note`), `schedule.availability.override` yetkisi. Saati bilinmeyen boş vardiya onaysız oluşturulabiliyordu.
- Senaryo A: Lunch varsayılanı 12-16'dan 11-17'ye çekildi. Ayşe'nin taslaktaki Lunch vardiyası önizlemede "12-16 → 11-17" görünür, uygulanınca değişir; saati elle yazılmış vardiyaya dokunulmaz.
- Senaryo B: Ayşe'nin eski müsaitliği 10-20, yeni varsayılan 09:00 başlıyor. Hard ayarda engellenir; soft ayarda yönetici gerekçe yazar.
- Senaryo C: Kimseye atanmamış, saati bilinmeyen bir boş vardiya taslağa sorunsuz eklenir.

**Ne değişti:** Değişiklik üç adımda geldi:
- `20260909042300_weekly_schedule_integration` (2026-09-09 checkpoint): önizleme ve uygulama yeni değerlendiriciye geçti. Progress belgesi (`availability-redesign-progress-2026-09-08.md:64`): "Default-hour batch preview/apply now use weekly assessment ... require one `confirm_availability` action only for new confirm-policy conflicts."
- `20260915081826/085446_bl064_*` (commit `7a35dbc`, 2026-09-15): çakışma türü başına şiddet ayarı (`conflict_rules`) geldi. "Saati bilinmiyor" (`time_source_unresolved`) artık onay istiyor; aynı kişinin çakışan başka vardiyası (`time_overlap`) artık hard engel.
- Düğmenin kaldırılışı `100c882` (2026-09-10), BL-062: "kullanıcı özelliği emekli etmek değil MVP sonrasına kaldırmak istedi".

**Yeni davranış:**
- Senaryo A: Aynen çalışıyor. Ölçüldü: fixture düzeltilince 1-22 arası kontrollerin hepsi geçiyor.
- Senaryo B: Ayşe'nin yeni haftalık "müsait değilim" saatleri ve Settings → Conflict handling → "Employee availability" ayarı belirleyici. Block ise engellenir. Require confirmation ise gerekçe yazılmaz, tek bir "onayla ve uygula" (`confirm_availability`) yeter.
- Senaryo C: Artık onay istiyor. Test fixture'ı bu yüzden ölüyor.
- Ek ölçüm: iki boş vardiyaya onay damgası verilince 1-25 ve 27 geçiyor. 26 ("new interval is evaluated against employee hours") `blocked` dönüyor, çünkü yeni değerlendirici çalışanın çakışan kendi vardiyasını zaten hard engelliyor. Sonuç: bu penceredeki ayrı "çakışmayı kabul ediyorum" (`acknowledge_reference_overlaps`) seçeneği, bilinen çakışmalar için artık işlevsiz.

**Hedefe göre doğrulama:**
- Özelliğin kendi kuralı hedefle çelişmiyor: varsayılan saat değişince vardiyalar sessizce değişmez, bilerek uygulanır; yayınlanmış vardiya ancak yeni taslakla değişir. Hedef bu konuda sessiz.
- Eski mantıktaki müsaitlik kısmı yanlış yönde (eski sistem, yazılı gerekçe). Yeni mantık hedefle uyumlu: hard/soft ayarı admin'de, soft ise override edilebilir, onaylı izin engel.
- **Kod hedefle çelişiyor (bu dosyanın dışında ama iddiasına dokunuyor):** test "approved leave remains hard despite an availability override reason" diyor ve hedef de "onaylanmış izin yumuşatılamaz" diyor. Ama Settings → Conflict handling → "Approved time off" satırı "Require confirmation" seçeneğini sunuyor (`ConflictHandlingSettingsPage.tsx:31-34`). Veritabanı kısıtı da `confirm`'e izin veriyor. Yani admin onaylı izni yumuşatabiliyor.
- Saati bilinmeyen *boş* vardiyanın onay istemesi tartışmalı: ortada çakışabilecek bir kişi yok. Önceki karar "saat doğrulanmalı olmalı, gerekçeyle override değil" demişti; kod şimdi gerekçesiz bir onayla geçiriyor. Bu schedule_time_source alanının konusu, burada yalnızca kök neden olarak not ediliyor.
- Lokasyon kapsamı: önizleme her vardiya için `schedule_actor_can_manage_service(actor, lokasyon)` kontrolü yapıyor. Manager kendi lokasyonu dışındaki vardiyayı seçemez. Hedefle uyumlu.

**Kanıt:**
- Deneme: dosya olduğu gibi koşuldu (27. satırda ölüyor). Scratch kopya `dhr_fp.sql` ve `dhr_fp2.sql` ile iki boş vardiyaya onay damgası verildi: 1-25 ve 27 geçti, 26 `blocked`.
- Okuma: `prepare_weekly_schedule_assignment` (atanmamış vardiya için onay damgası dalı), `assess_weekly_shift_availability` (`time_source_unresolved`→`confirm`, `time_overlap`→`block`), `preview/apply_schedule_default_hours_service` (canlı tanım), commit'ler `100c882` ve `7a35dbc`.

**Önerilen karar:** **Test düzelsin** `(leave: low / do: safe)`
- Kod bu yolda tamamen yeni sistemde. Kırmızının sebebi fixture'ın eski tabloya yazması ve yeni bir kuralı (saati bilinmeyen vardiya onay ister) tanımaması.
- Özelliğin kendi çekirdeği sağlam (1-22 ölçüldü). BL-062 kararı "kod silinmesin, MVP sonrasına kalsın" diyor, yani testi bugünkü kurala çevirmek o karara uyuyor.
- Yeniden yazım: eski sürüm tablosu yerine haftalık tercih; `availability_enforcement` yerine `conflict_rules`; gerekçe notları yerine `confirm_availability`; bilinen çakışma senaryosu (26-27 ve 30-31) "engellenir" olarak.
- Diğer seçenek: MVP sonrasına kadar özelliğin kodu ve testiyle birlikte tamamen sökülmesi. Bu ancak ürün sahibi BL-062 kararını "sil, sonra yeniden yaz" olarak değiştirirse doğru olur.

**Önceki karar ile karşılaştırma:** BL-091 bu dosyayı "eski sisteme yazan testler" arasında sayıp "karar gelmeden dokunma" demişti. Kısmen yanlış: bu dosyada eski sisteme yalnızca *test* yazıyor, kod okumuyor. Hangi sistemin esas olduğu kararı bu dosyayı bloke etmiyor. Kod zaten yeni sistemi seçmiş.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** Hiçbir kontrol koşmadığı için yeşil kontrol yok. Koşmayanlar içinde 32-37 (hard/soft müsaitlik eski tabloyla, yazılı gerekçe) eski modeli iddia ediyor.

**Kullanıcıya sorular:** Bkz. alan geneli, S5 (onaylı izin) ve S6 (saati bilinmeyen boş vardiya).

---

### schedule_custom_service_classification

**Ekrandaki karşılığı:** Schedule → vardiyaya tıkla → Add/Edit Shift penceresi. Vardiya tipi seçilmemiş ve bir çalışan seçilmişse "Service classification: ☐ This shift is independent custom work" kutusu ve açıklama alanı çıkıyor (`ShiftQuickEditor.tsx:829-845`).
Eski sistemde anlamı şuydu: Ayşe "Lunch servisinde çalışmam" diyebiliyordu. Bu, saat değil servis adıyla bir kısıttı. Adı olmayan 12-16 vardiyası "bu Lunch servisi mi değil mi belli değil" diye kilitleniyordu. Yönetici "bu envanter eğitimi, Lunch değil" diye sınıflayıp açıyordu.

**Test ne iddia ediyor (kırmızı kontroller):** Hiçbir kontrol koşmadı (~54 kontrol). Dosya ilk kontrolde ölüyor: henüz oturumda olmayan bir vardiya kimliğiyle önizleme isteniyor, sunucu "Shift no longer exists in this edit session" diyor. İddia edilen konular:
1-11: adsız vardiya varsayılan olarak "doğrulama gerekir"; sınıflama onay damgası ister; saat değişirse sınıflama düşer.
12-30: sınıflama değişmez bir audit kaydı olur ve başka vardiyaya, tarihe ya da çalışana taşınamaz.
31-41: sınıflama saat, soft override ya da onaylı izin yerine geçmez.
42-44: kapsamlı manager.
45-49: yayın anına taşınır.
50-54: izinler.

**Eski davranış:** Migration `20260909021001_availability_shift_type_restrictions` ile `20260909022001_schedule_custom_service_classification` (2026-09-09). Eski sürüm tablosunda `blocked_shift_type_ids` vardı. Kaydedilen kararlar `schedule_service_classifications` tablosuna yazılıyor ve yayınlanan vardiyanın fotoğrafına (snapshot) taşınıyordu.
- Senaryo A: Ayşe "Lunch yok". Adsız 12-16 vardiyası "verification required" olur; yönetici kutuyu işaretleyip "Inventory training" yazınca açılır.
- Senaryo B: Aynı vardiyaya Lunch tipi seçilince engel; "özel iş" diye etiketlenemez.
- Senaryo C: 07:00 başlangıç Ayşe'nin saatleri dışında; sınıflama saati açmaz, yine engel.

**Ne değişti:** Spec 2026-09-08 (`availability-redesign-spec-2026-09-08.md` §2): "Type secimi, default saat araligini temsil eder; vardiya adina dayali ayri bir engel degildir." Aynı yerde: "Dinner adli ama 12:00-16:00 yazilmis shift bununla cakisma yaratmaz." Yeni değerlendirici (`20260909041900`) type kısıtını hiç okumuyor (`'type_restrictions','[]'` sabit dönüyor). Sınıflamayı yazan fonksiyon `schedule_prepare_service_classification`'ı çağıran kimse kalmadı (ölçüldü). Ekrandaki kutunun kaldırılmasına dair yazılı bir karar yok; kutu unutulmuş.

**Yeni davranış:**
- Senaryo A: Ayşe Lunch'ı işaretlerse bu "Lunch'ın varsayılan saatleri (12-16) müsait değilim" demek. Adsız 12-16 vardiyası saat üzerinden müsaitlik çakışması verir (ayara göre warn, confirm ya da block). Sınıflamaya gerek yok, yapmak da mümkün değil.
- Senaryo B: 17-21'e yazılmış Lunch tipi vardiya çakışma vermez, çünkü kural saatle işliyor.
- Senaryo C: Saat üzerinden değerlendirilir.
- **Ekranda canlı bir hata (ölçüldü):** Yönetici kutuyu işaretleyip açıklama yazarak Save'e basarsa, sunucunun değerlendirmesi hiçbir zaman `service_classification_fingerprint` döndürmüyor (denemede dönen alanlar listelendi). Editör bu durumda "Custom work could not be verified — Reload the current shift and try again." diyip kaydı durduruyor (`ShiftQuickEditor.tsx:508-513`). Kutu işaretliyken vardiya hiç kaydedilemiyor.
- Web birim testi bu hatayı gizliyor: gerçek sunucunun hiç göndermediği bir damgayı sahte olarak veriyor (`ShiftQuickEditor.test.tsx:257-262`).
- Sunucu tarafında sınıflama notu sessizce yok sayılıyor. Deneme: damgasız kayıt "caught: no exception" ile geçti ve vardiya oluştu.

**Hedefe göre doğrulama:** Hedef "employee müsait OLMADIĞI günleri/saatleri işaretler" diyor. Servis adına dayalı bir kısıt hedefte yok. Eski kavram yanlış yönde, yeni (saat tabanlı) kavram doğru yönde. Bugün kalan tek şey bir tuzak: işe yaramayan ve kaydı bozan bir kutu. Lokasyon kapsamıyla ilgili bir yönü yok.

**Kanıt:**
- Deneme: `assess_schedule_shift_service` sınıflama notuyla çağrıldı; dönen anahtarlar arasında `service_classification_fingerprint` yok. Scratch kopya `sc_probe.sql` (önizleme çağrısı düzeltilmiş hali): kontrollerin çoğu düşüyor. #8'de not damgasız kaydedildi; #11'de vardiya zaten oluşmuş olduğu için yinelenen anahtar hatası.
- Okuma: canlı fonksiyon bağımlılıkları (`schedule_prepare_service_classification` ← çağıran yok; `schedule_service_classification` ← yalnız eski değerlendirici ve eski önizlemeler); `guard_schedule_assignment_availability` hâlâ sınıflama kaydını iptal eden satırı taşıyor; web `ShiftQuickEditor.tsx`.

**Önerilen karar:** **İkisi**: test silinsin ve kod temizlensin. `(leave: medium / do: moderate)`
- Kavram hedefte yok ve spec açıkça reddediyor. Test "bugünkü kural" değil, geçmiş bir ürünü anlatıyor. "Canlı veri yok" kuralına göre dosya silinir.
- Ekranda bozuk bir kutu var: yönetici işaretlerse vardiya kaydedilemiyor. `leave: medium`, çünkü nadir ama gerçek.
- Temizlik listesi: editördeki kutu ve web testleri; paylaşılan şemadaki `service_classification*` alanları; tablo, yazıcı ve okuyucu fonksiyonlar; tetikleyicideki iptal satırı. `do: moderate`, çünkü Schedule editörü ve yayın tetikleyicisine dokunuyor.
- Diğer seçenek: ürün sahibi "Ayşe Lunch servisinde çalışmaz, saat ne olursa olsun" gibi *ad tabanlı* bir kısıt isterse sınıflama geri gerekir. Hedef ve spec bunu istemiyor.

**Önceki karar ile karşılaştırma:** BL-091 "karar gelmeden dokunma" demişti. Katılmıyorum: bu dosyanın kavramı hangi sistem seçilirse seçilsin ölü. Yeni sistem hiç ad tabanlı kısıt tanımıyor, eski sistemin bu parçası da artık hiçbir yerden yazılamıyor. Karar beklemesine gerek yok.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** Hiçbir kontrol koşmadı. Hepsi eski ad tabanlı kavramı iddia ediyor.

**Kullanıcıya sorular:** Yok. Karar spec'te zaten verilmiş; bu yalnızca temizlik.

---

### availability_review_lifecycle

**Ekrandaki karşılığı:** Emekli edilmiş ekranlar: Schedule → Requests → "Availability" onay sekmesi (artık `/app/availability`'ye yönleniyor), çalışanın tarihli müsaitlik talebi, Settings'teki müsaitlik sahipliği/onay/bildirim-günü ayarları. Bugün hiçbiri ekranda yok. API uçları HTTP 410 dönüyor (`availability_model_retired`). Veritabanı fonksiyonları (`availability_command_service` vb.) duruyor, ama API'den çağıran yok (grep: `apps/api`, `apps/web`, `packages/shared` içinde sıfır çağrı).

**Test ne iddia ediyor (kırmızı kontroller):**
- **#46** "partial location scope cannot edit global availability"
- **#48** "command enforces all affected locations"
- Ardından 118. satırda "An overlapping request is still open" hatasıyla dosya ölüyor. Yaklaşık 30 kontrol koşmadı: yayın önizlemesinin bekleyen taleple engellenmesi, bildirimler, onboarding'de müsaitlik onayı, bir saniyelik sınır, kısa-bildirim kuralı, hesabı olmayan çalışan için yöneticinin kayıt girmesi.

**Eski davranış:** `20260909005001_availability_review_lifecycle` (2026-09-09).
- Senaryo A: Ayşe Pazartesi'yi 10-17'ye daraltır ve talep "bekliyor" olur. Yönetici onaylarsa geçerli olur. Reddederse gerekçe yazar ve "kapasite bildirimi" açık kalır; o hafta yayınlanamaz.
- Senaryo B: Yönetici Ayşe adına öneri yazar, Ayşe onaylamadan geçerli olmaz.
- Senaryo C: Yalnız Kadıköy'ü yöneten Ali, Kadıköy+Beşiktaş'ta çalışan Ayşe'nin müsaitliğini değiştiremez. Kural: çalışanın *bütün* lokasyonlarını kapsamak gerekir (`availability_actor_scope`).
- Senaryo D: Bekleyen bir talep o haftanın yayınlanmasını engeller.

**Ne değişti:** Spec 2026-09-08 §1: "Temporary/kalici ayrimi, tarihli istisna, baslangic/bitis tarihi ve manager onayi yoktur." §4: "Requests icindeki availability onay sekmesi kaldirilir." Progress 2026-09-09: "Legacy API Entry Points Retired" ve "Requests Availability Approval Retired". Eski Hub ve onboarding kaydetme fonksiyonları, yalnızca hata fırlatan "mezar taşı" gövdelere çevrildi.

**Kırmızının gerçek kök nedeni (ölçüldü):** Test "manager" üyeliğini *Owner rolünün* `role_id`'siyle ekliyor. Rol, `role_id`'den türetildiği için sistem bu kişiyi ikinci bir **owner**'a çeviriyor ve "tüm lokasyonlar" açık kalıyor. Deneme çıktısı: `Owner|owner|owner|t`, güncellemeden sonra da `all_locations=t`.
- Bu yüzden kısmi kapsam hiç devreye girmiyor ve #46/#48 düşüyor.
- #48'de "manager"ın gönderdiği talep başarıyla açılıyor ve açık bir talep bırakıyor. 118. satır da buna çarpıyor.
- Gerçek bir Manager rolüyle denendiğinde: manager'ın kendi employee kaydı olmadığı için kapsamı 0 lokasyon (`mgr|manager|f|0`), ilk çağrı "Availability access denied".
- Sonuç: fixture bugünkü kurallarla bu haliyle kurulamaz. Manager'ın kapsamı artık kendi employee kaydının lokasyonlarından geliyor.

**Yeni davranış:**
- Senaryo A: Ayşe Employee Hub'da kaydeder, anında geçerli olur, ilgili yöneticilere bildirim gider. Onay kuyruğu yok.
- Senaryo B: Yöneticilerin ayrı bir "hatırlatma" kaydı var, çalışanın onayı gerekmiyor. Çalışan bu kaydı görmüyor.
- Senaryo C: **Kural tersine döndü (ölçüldü).** Yeni sistemde tek ortak lokasyonda yetki yeterli: Kadıköy manager'ı Ali, Ayşe için hatırlatma yazabiliyor ve bu hatırlatma Beşiktaş vardiyalarında da uyarı üretiyor (`weekly_preference_manager_scope` = `t`). Eski kural aynı kişi için `f` diyor. → **KAPSAM MODELİ SORUSU K1.**
- Senaryo D: Yayın önizlemesi artık eski talepleri kontrol etmiyor. Ama `schedule_location_publications` üzerindeki `capture_availability_publication_lock` tetikleyicisi hâlâ eski bekleyen talepleri arıyor. Önizleme "yayınlanabilir" deyip asıl yayının reddedilmesi mümkün. Yalnız yerelde eski talep sayısı 0 (ölçüldü) ve onları yazabilen bir ekran ya da API yok; yani ölü ama canlı çalışan bir yol.

**Hedefe göre doğrulama:**
- Hedefte "employee müsait olmadığı saatleri işaretler; manager uyarı alır, override edebilir" var. Müsaitlik değişikliğine yönetici onayı hedefte geçmiyor; spec de açıkça reddediyor.
- Eski yaşam döngüsü hedefle çelişiyor, yeni model uyumlu. Ürün sahibinden teyit istiyorum (S1).
- Onboarding: hedef "opsiyonel adım" diyor. Eski dosya "onboarding müsaitliği yönetici onayına düşer" diyor; bu hedefle çelişiyor. Yeni model onay istemiyor, ama Settings'te "zorunlu yap" seçeneği var (S4).
- Kapsam: eski "bütün lokasyonlar" kuralı mı, yeni "tek lokasyon yeter" kuralı mı? İkisi de savunulabilir. Karar G ajanının kapsam modeline girdi (K1).

**Kanıt:**
- Deneme: dosya olduğu gibi koşuldu. Rol dönüşümü ayrı bir transaction'da ölçüldü. Gerçek Manager rolüyle kopya `arl_manager_role.sql` koşuldu. Ali/Ayşe kapsam denemesi `scope_probe.sql`.
  - Dikkat: manager kapsamını senkronlayan tetikleyici *ertelenmiş* çalışıyor (commit anında). Test içinde görmek için `set constraints all immediate` gerekiyor. Testi yeniden yazacak kişi için tuzak.
- Okuma: `availability_actor_scope`, `availability_command_service`, `weekly_preference_manager_scope`, `capture_availability_publication_lock`, `availability_pending_publication`; bağımlılık haritası: `availability_publication_preflight` ve `availability_week_capacity`'yi çağıran yok.

**Önerilen karar:** **Ürün kararı gerekli (S1), ardından test silinsin** `(leave: low / do: safe)`. Eski sistemin sökümü ayrı bir iş olarak BL-091'e `(leave: medium / do: risky)`.
- Dosyanın 48 kontrolünün neredeyse hepsi emekli edilmiş onay modelini iddia ediyor. "Testler bugünkü kuralı iddia eder" ilkesine göre düzeltilecek bir şey yok, silinecek bir şey var.
- Hedefte hâlâ geçerli iki kural yeni sistemin testlerinde zaten var ya da oraya taşınmalı: "başka çalışanın müsaitliğine bakılamaz" ve "hesabı olmayan çalışan için yönetici kaydı" (yeni modelde bu, yönetici hatırlatması).
- Diğer seçenek: ürün sahibi "evet, müsaitlik değişikliği onaya düşsün" derse bu dosya yeni sisteme taşınacak bir onay tasarımının kaynağı olur. O durumda da mevcut haliyle değil, yeni tablolar üzerine yeniden yazılır.

**Önceki karar ile karşılaştırma:** BL-096 "açık bir talep varken yenisi açılıyor; önce değiştir/geri çek" demişti. Bu bir belirti okuması: asıl sebep fixture'daki "manager"ın ikinci owner'a dönüşmesi. Düzeltilecek şey talep kuralı değil; dosyanın tamamı emekli bir modeli anlatıyor.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** #1-45 ve #47'nin neredeyse tamamı onay, red, kapasite bildirimi, yönetici önerisi ve çalışan teyidi, sahiplik modları, bildirim-günü, eski mezar taşlarını iddia ediyor. Hedefte bunların hiçbiri yok.
- Özellikle #12 ve #16 "bekleyen talep yayını engeller": hâlâ geçiyor, çünkü tetikleyici canlı.
- #44 ve #45 "mezar taşı fonksiyonlar hata versin": "canlı veri yok" kuralına göre bu fonksiyonlar hata vermek yerine silinmeli.

**Kullanıcıya sorular:** S1 (onay istiyor musun?), K1.

---

### employee_hub

**Ekrandaki karşılığı:** Çalışan arayüzü (Employee Hub): Home, Schedule, Line-up, Shift Hub, My Availability (Availability ve Time Off Requests sekmeleri), talepler. Test, bu ekranların arkasındaki okuma ve komut fonksiyonlarını iddia ediyor.

**Test ne iddia ediyor (kırmızı kontroller):** 26 kontrolün 18'i koşmadı. Dosya 9. kontrolde ölüyor ("employee availability appends a new version"): eski Hub kaydetme fonksiyonu "Refresh availability to choose an effective period" hatası veriyor.
- 9-13: Hub'dan müsaitlik kaydı. Eski sürüm tablosu; ikinci workspace'te ayrı sürüm akışı.
- 14-18: Time off: atanmamış lokasyon reddedilir, talep bekler, üst üste binen talep reddedilir, iptal edilir.
- 19-26: Açık vardiya pickup ve swap; takas arkadaşının kabulü; yöneticinin onayı.
- Ölçüm: 9-13 çıkarılınca 14-25 geçiyor. **26 "manager can approve accepted swap"** düşüyor: "Resolve availability, shift hours or approved time off before this assignment."

**Eski davranış:** Hub müsaitliği doğrudan eski sürüm tablosuna yazılıyordu, onaysız (`save_employee_hub_availability_service`, 2026-09-06 Employee Hub işi). Swap onayı iş (job) uygunluğuna bakmıyordu.
- Senaryo A: Alex Hub'da Cumartesi ve Pazar'ı "müsait değil" yapar, yeni sürüm oluşur.
- Senaryo B: Alex'in ikinci bir workspace'i var; oradaki müsaitliği ayrı.
- Senaryo C: Alex (Server, Main Dining) kendi Server vardiyasını Jordan'ın (Bartender) Bartender vardiyasıyla takas eder. Jordan kabul eder, yönetici onaylar, takas gerçekleşir. Sonuçta Server vardiyasında bir Bartender, Bartender vardiyasında bir Server çalışır.

**Ne değişti:**
- `20260909005001` Hub ve onboarding kaydetme fonksiyonlarını mezar taşına çevirdi. Gerekçe testteki #44 adında: "legacy Hub entry point cannot bypass lifecycle".
- Sonra Hub'ın müsaitlik ekranı yeni sisteme bağlandı. Progress 2026-09-09: "EmployeeHub My Availability opens the connected employee weekly panel", ve "The obsolete response fields are suppressed (`availability: null`...)".
- Swap tarafında: vardiya tablolarındaki tetikleyici artık yeni değerlendiriciyi kullanıyor. Yeni değerlendirici eksik lokasyon ya da iş atamasını hard engel (`assignment_missing`) sayıyor (`20260909042300` ve sonrası).

**Yeni davranış:**
- Senaryo A: **İz sürüldü.** Employee Hub → My Availability → "Availability" sekmesi (`EmployeeHubPage.tsx:202-261`) → `WeeklyPreferencesPanel audience="employee"` → `GET/POST /v1/workspaces/:id/availability/weekly` → `weekly_preferences_read/preview/save_service` → yeni sistem, anında geçerli.
  - `get_employee_hub_service` hâlâ eski tablodan bir `availability` alanı hesaplıyor, ama API bunu `null`'a çeviriyor (`employee-hub-service.ts:131-145`) ve web hiç okumuyor. Ekrana düşmüyor; ölü yük.
  - Aynı fonksiyonun `open_shifts` alanını da Hub web'i kullanmıyor.
- Senaryo B: Yeni sistemde de ayrı, çünkü employee kaydı workspace başına. Bunu iddia eden eski 11-13 kontrolleri eski tabloya bağlı.
- Senaryo C: Talep oluşturuluyor. Yöneticinin çakışma listesi "çakışma yok" diyor, çünkü `get_shift_change_conflicts_service` iş uygunluğuna hiç bakmıyor, lokasyon uyumsuzluğunu da yalnızca "soft" sayıyor. Onay ise tetikleyicide genel bir hatayla reddediliyor.
  - Ölçüldü: iki taraf için de `assignment_missing / block`.
  - Bu talebi *oluşturan* eski yol (`/shift-requests`, `submit_employee_shift_request_exchange_legacy`) web'de hiçbir bileşenden çağrılmıyor. Hub yeni Shift Hub'ı kullanıyor. Eski yol yalnızca daha önce açılmış talepler için "EarlierShiftRequests" ekranında yaşıyor.

**Hedefe göre doğrulama:**
- Müsaitlik: yeni yol hedefle uyumlu. Eski 9-13 kontrolleri emekli bir modeli iddia ediyor.
- Swap: hedef "lokasyon, iş ve müsaitlik kriterlerinin hepsi sağlanmazsa eligible olamaz" diyor. Onayın engellenmesi doğru. Yanlış olan iki şey var:
  (a) testin fixture'ı hedefe göre geçersiz bir takas kuruyor (farklı işler) ve #25'te "çakışma yok" diye iddia ediyor;
  (b) talep ve çakışma katmanı iş uyumsuzluğunu göstermiyor. Yöneticiye "temiz" görünen bir talep onayda patlıyor. BL-093 ile aynı aile: aynı kural iki yerde farklı.
- Owner/admin/manager'ın Employee Hub'a girmesi: **Kod hedefle çelişiyor (web katmanı).**
  - SQL izin veriyor: `employee_hub_actor_service` yalnızca "aktif üyelik + kendi employee kaydı" istiyor, rol sormuyor. Ölçüldü: manager Ali'nin kendi Hub okuması çalışıyor, `can_edit_employee=true`.
  - API izin veriyor: yalnızca üyelik kontrolü var.
  - Web yasaklıyor: rota `roles={["employee"]}` (`App.tsx:434-442`); giriş sayfası role göre ayrılıyor (`resolveLanding.ts:61`); menü öğeleri yalnızca employee rolüne (`AppShell.tsx:122-150`).
  - Sonuç: vardiyada çalışan bir manager kendi müsaitliğini hiçbir ekrandan giremiyor (drawer'da çalışan haftası salt okunur, `WeeklyPreferencesForm.tsx:48-50`). Kendi vardiyasını takas edemiyor, izin isteyemiyor.
  - Ek: yerel veritabanında 5 owner'ın 4'ünün employee kaydı yok. Kod bunu artık oluşturuyor (`20260922000000`); veritabanı eski ve yeniden kurulmalı.
- Time off lokasyona bağlı → **KAPSAM MODELİ SORUSU K2** (aşağıda).

**Kanıt:**
- Deneme: dosya olduğu gibi koşuldu. 9-13 çıkarılmış kopya (`employee_hub_noavail.sql`): 1-20 geçti, 21 (orijinal #26) düştü. Takas hedefleri doğrudan değerlendirildi: iki taraf için `assignment_missing / block`. Seed işleri: Alex=Server, Jordan=Bartender.
- Okuma: `save_employee_hub_availability_service` (tek satırlık mezar taşı), `get_employee_hub_service` (`availability` projeksiyonu), `employee_hub_actor_service`, `get_shift_change_conflicts_service` (iş kontrolü yok), `decide_time_off_with_assignments_service` (onay yetkisi talebin tek lokasyonuna bağlı), `assess_weekly_shift_availability` (onaylı izin lokasyon filtresi olmadan her yerde engel); web ve API dosyaları yukarıda.

**Önerilen karar:** **İkisi** `(leave: medium / do: safe)` test için. Web kapısı ayrı bir iş `(leave: high / do: moderate)`, soru S2.
- Test: 9-13 silinsin. İkinci workspace ayrımı, yeni sistemin testlerinde yoksa haftalık tercih üzerine tek bir kontrol olarak yeniden yazılsın. Swap fixture'ı aynı işte iki çalışanla kurulsun; ayrıca "farklı iş → talep ya da onay reddedilir" kontrolü eklensin.
- Repo: mezar taşı fonksiyonlar ve `get_employee_hub_service`'teki eski `availability` alanı silinsin.
- Eski `/shift-requests` oluşturma yolu için karar: ya silinir (UI kullanmıyor) ya da iş kontrolü eklenir. "Canlı veri yok" kuralına göre silmek daha doğru.
- Diğer seçenek: sadece testi düzeltmek. Bu, yöneticiye temiz görünen ama onayda patlayan talebi ortada bırakır.

**Önceki karar ile karşılaştırma:** BL-096 "müsaitlik döneminde yenileme isteği" demişti. Doğru tespit, eksik yorum: hata bilerek konmuş bir mezar taşı; düzeltilecek bir kural değil. Mezar taşının arkasında ikinci bir gerçek bulgu saklanıyordu: iş uyumsuz swap.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:**
- #25 (ölçümdeki #20) "accepted valid swap clears manager conflicts": iş uyumsuz bir takası "temiz" ilan ediyor. Hedefle çelişiyor.
- #19 "open shift pickup enters manager approval": eski yol iş atamasına bakmadan pickup kabul ediyor. UI bu yolu kullanmıyor.
- #6 "read model exposes open shifts at assigned locations": yalnızca lokasyona bakıyor, işe bakmıyor. Web de bu alanı kullanmıyor; ölü yük.
- #14 "time off rejects an unassigned location": hedefle çelişmiyor ama K2'ye bağlı.

**Kullanıcıya sorular:** S2, K2.

---

## Alan geneli bulgular

**Birden fazla dosyayı etkileyen kök nedenler**
1. **Fixture'lar eski tablolara yazıyor, kod artık oradan okumuyor.** Dört dosyanın dördü `employee_schedule_availability_versions` ya da `availability_enforcement` ile kuruluyor. Schedule, varsayılan saat, Hub ve yayın yolları bunları okumuyor.
   - "Hiçbir ekran eski sisteme yazmıyor" iddiası doğrulandı: API ve web'de eski yazıcılara sıfır çağrı var, eski uçlar 410 dönüyor.
   - Yerel veritabanında eski tabloda 3 satır, yeni tablolarda 0 satır var. Eski satırlar fixture artığı.
2. **Mezar taşı fonksiyonlar.** `save_employee_hub_availability_service` ve `save_employee_availability_service` yalnızca hata fırlatmak için var; iki test (#44/#45) de bunu iddia ediyor. "Canlı veri yok" kuralına göre silinmeli.
3. **Eski değerlendiricinin hâlâ canlı okuyucuları var.** BL-091'deki söküm bunlar taşınmadan yapılamaz:
   - `get_shift_change_conflicts_service`: Requests → Shift Changes; eski değerlendiriciden yalnızca onaylı izni alıyor.
   - `time_off_assignment_impact`: izin onayında etkilenen vardiyalar.
   - `lineup_candidate_check_exchange_base`: Line Up personel bildirimi. **Ölçüldü:** eski tabloda satırı olmayan her çalışan (yani bugün oluşturulan herkes) burada "verification_required — Availability has not been confirmed" alıyor. Line Up kapsam dışı; bu yalnızca ortak kök nedeni olarak not ediliyor.
   - `capture_availability_publication_lock`: her yayında eski bekleyen talepleri arıyor.
   - Çağıranı olmayan eski fonksiyonlar: `availability_publication_preflight`, `schedule_availability_publication_preflight`, `availability_week_capacity`, `schedule_prepare_service_classification`.
4. **Manager kapsamı artık kendi employee kaydından geliyor, eski fixture'lar bunu bilmiyor.** "Manager" üyeliği başka bir rolün `role_id`'siyle kurulunca rol sessizce değişiyor (ikinci owner). Kapsam senkronu da commit anında çalışıyor. Test yazarı için iki tuzak.

**Hedefle çelişen ama bu testlerde görünmeyen önemli yapılar**
- **Owner/admin/manager çalışan arayüzüne giremiyor** (web kapısı; SQL ve API izin veriyor). Hedef "vardiyaya konabilmeli ve takas edebilmeli" diyor. Bugün vardiyada çalışan bir yönetici kendi müsaitliğini giremiyor, izin isteyemiyor, Shift Hub'ı açamıyor.
- **Onaylı izin yumuşatılabiliyor.** Settings → Conflict handling → "Approved time off" satırında "Require confirmation" seçeneği var. Hedef "yumuşatılamaz" diyor.
- **Schedule'daki "custom work" kutusu kaydı bozuyor.** Yukarıda anlatıldı.
- **Yeşil ama emekli modeli iddia eden testler:** `availability_manager_request_queue`, `availability_date_overrides`, `availability_calendar_comparison`, `availability_publication_lock`, `availability_authoritative_assessment`. Hepsi baseline'da yeşil, hepsi onay, tarihli istisna ya da eski sürüm modelini anlatıyor. BL-091 sökümüyle birlikte silinmeli.
- **Bildirim kataloğu:** "Availability requests to review" (`availability.review_required`) hâlâ aktif ve kaldırılmış Requests sekmesine yönlendiriyor. Settings → Notifications'ta seçenek olarak görünüyor olabilir (kod okuması, ekranda doğrulanmadı).
- **Aynı ayar iki yerde:** `availability_warning_policy` (warn/confirm) ile `conflict_rules.availability` (allow/warn/confirm/block) bir tetikleyiciyle birbirine kopyalanıyor. Block seçilince eski alan "warn" gösteriyor. Ayrıca eski `availability_enforcement`, `ownership`, `approval`, `initial_review` ve `notice_days` sütunları tabloda duruyor.

**Fikir ve tavsiyeler**
- BL-091'e önerim ölçümle destekleniyor: yeni sistem esas, eski sistem sökülsün. Sıra şöyle:
  (1) yukarıdaki dört canlı okuyucu yeni değerlendiriciye taşınır;
  (2) eski yayın kilidi tetikleyicisi kaldırılır;
  (3) eski tablolar, fonksiyonlar, mezar taşları, sınıflama ve bildirim türü silinir;
  (4) emekli modeli anlatan testler (bu dosyalardan ikisi ve yukarıdaki beş yeşil dosya) silinir.
  `(leave: medium / do: risky)`, çünkü Requests, izin onayı ve yayın yoluna dokunuyor. Her adım kendi testiyle ölçülmeli.
- "Çalışan arayüzü" için en ucuz yol: yönetici arayüzüne tek bir "My shifts / Çalışan görünümü" geçişi. Hub zaten rolden bağımsız çalışıyor; değişiklik web kapısında.

## Kullanıcıya sorular (alan geneli, önem sırasıyla)

**S2 — Owner/admin/manager kendi çalışan kaydıyla çalışan arayüzüne girebilsin mi?**
Neden: hedef "vardiyaya konabilmeli, takas edebilmeli" diyor; bugün web buna izin vermiyor (veritabanı ve API izin veriyor).
Örnek: Kadıköy manager'ı Ali Cuma akşamı da vardiyada çalışıyor. Ne "Cuma akşamları müsait değilim" diyebiliyor, ne izin isteyebiliyor, ne de vardiyasını takasa açabiliyor.
Seçenekler:
- (a) Yönetici arayüzüne "Çalışan görünümü" geçişi eklensin ve Hub'ın tamamı açılsın. **(Önerim: en az kod, tek kural.)**
- (b) Yalnızca "Benim müsaitliğim / İzinlerim / Vardiya takası" sayfaları yönetici arayüzüne taşınsın.
- (c) Bugünkü gibi kalsın; yöneticiler kendileri için işlem yapamasın.

**S1 — Müsaitlik değişikliği yönetici onayına düşsün mü?**
Neden: hedefte onay yok, spec 2026-09-08 açıkça "onay yok" diyor, kod da onaysız çalışıyor. Ama eski onay modeli hâlâ testlerde ve veritabanında duruyor; silmeden önce teyit gerekiyor.
Örnek: Ayşe Pazartesi'yi "müsait değilim" yaptı. Kaydettiği an geçerli mi olsun, yoksa Ali onaylayana kadar eski haliyle mi kalsın?
Seçenekler:
- (a) Onay yok: anında geçerli, yöneticilere bildirim gider (bugünkü kod). **(Önerim.)**
- (b) Onay yalnızca yayına yakın haftalar için (ör. 14 günden kısa bildirim).
- (c) Her daraltma onaya düşsün (eski model).

**K1 — KAPSAM MODELİ SORUSU: Yönetici hatırlatması kimin yetkisinde, nerede geçerli?**
Senaryo: Ayşe hem Kadıköy'de hem Beşiktaş'ta çalışıyor. Yalnız Kadıköy'ü yöneten Ali, Ayşe için "Pazartesi müsait değil" hatırlatması yazıyor. Beşiktaş manager'ı Mehmet, Pazartesi Beşiktaş vardiyasına Ayşe'yi koyarken Ali'nin kaydından uyarı alıyor. Aynı kaydı Mehmet de düzenleyebiliyor.
Bugünkü kod (ölçüldü): tek ortak lokasyonda yetki yeterli, kayıt tüm lokasyonlarda geçerli. Eski sistemin kuralı tam tersiydi: çalışanın bütün lokasyonlarını kapsayan yönetici gerekirdi.
Seçenekler:
- (a) Tek ortak kayıt, herhangi bir lokasyonun yöneticisi düzenler (bugün).
- (b) Lokasyon başına ayrı hatırlatma; her yönetici yalnızca kendi lokasyonu için yazar ve yalnızca orada uyarı çıkar.
- (c) Ortak kaydı yalnızca çalışanın tüm lokasyonlarını kapsayan yönetici ya da admin düzenler; diğerleri okur.
Önerim: (a). Hatırlatma bilgi amaçlı, en fazla uyarı üretiyor; bölünmesi karmaşıklık getirir. Kesin karar G alanının kapsam modeline bağlı.

**K2 — KAPSAM MODELİ SORUSU: İki lokasyonlu çalışanın izni kimin onayına düşer, nerede geçerli olur?**
Senaryo: Ayşe Cuma için izin istiyor ve formda Kadıköy'ü seçiyor (izin tek bir lokasyona bağlanıyor). Ali onaylıyor. Onaylı izin lokasyon ayırmadan Ayşe'nin her vardiyasını hard engelliyor. Mehmet'in Beşiktaş'taki Cuma vardiyası da engelleniyor, oysa Mehmet talebi ne gördü ne onayladı.
Bugünkü kod (okuma): onay yetkisi talebin tek lokasyonunun yöneticisinde (`decide_time_off_with_assignments_service`), etki her lokasyonda (`assess_weekly_shift_availability`).
Seçenekler:
- (a) İzin kişiye ait: tüm lokasyonlarının yöneticileri görür, biri onaylar.
- (b) Etkilenen her lokasyonun yöneticisi onaylar.
- (c) Birden çok lokasyon varsa admin/owner onaylar.
Önerim yok; bu doğrudan kapsam modelinin sorusu. Hedefin "iki lokasyon söz konusuysa iki yetkili onaylar" kuralı (b)'ye yakın.

**S3 — "Custom work" kutusu silinsin mi?** (Onay sorusu, düşük önem.)
Müsaitlik artık yalnızca saat üzerinden işliyor; bu kutu işaretlenirse vardiya kaydedilemiyor.
Seçenekler: (a) sil **(önerim)**; (b) "Ayşe Lunch servisinde saat ne olursa olsun çalışmaz" gibi ad tabanlı kısıt geri gelsin, kutu onunla birlikte yaşasın.

**S4 — Onboarding'deki müsaitlik adımı: hedef "opsiyonel" diyor; kodda admin'in "zorunlu yap" ayarı var.**
Seçenekler: (a) ayar kalsın, varsayılan "atlanabilir" **(önerim: bugünkü kod, hedefi bozmuyor)**; (b) ayar kaldırılsın, adım her zaman opsiyonel olsun.

**S5 — Onaylı izin Settings'ten yumuşatılabilsin mi?**
Hedef "onaylanmış izin yumuşatılamaz" diyor; Settings → Conflict handling → "Approved time off" satırı "Require confirmation" sunuyor.
Seçenekler: (a) seçenek kaldırılsın, her zaman Block **(önerim, hedefle birebir)**; (b) kalsın.

**S6 — Kimseye atanmamış, saati bilinmeyen bir vardiya taslağa eklenirken onay istensin mi?**
Bugün istiyor; `schedule_default_hours_review` bu yüzden kırmızı. Ortada çakışabilecek bir kişi yok.
Seçenekler: (a) boş vardiyada onay yok; saat, birisi atanırken ya da yayında doğrulansın **(önerim)**; (b) bugünkü gibi her zaman onay. schedule_time_source alanıyla birlikte karara bağlanmalı.

**Not (başka alanın konusu):** Hedefteki istisna "müsaitliğini kendisi ayarlamış employee yalnızca release edilmiş shift'i pickup ederken kendi kararını override edebilir" diyor. Spec ve kod bu istisnayı pickup, cover, swap ve Line Up teklif kabulüne genişletmiş. Shift exchange alanı değerlendirmeli.
