# D1 — Müsaitlik ve atama (BL-070 derin araştırma)

Ölçüm zamanı: 2026-09-22/23 gecesi, main `41783c7`, paylaşılan yerel veritabanı. Bütün denemeler tek transaction içinde yapıldı ve `rollback` ile geri alındı; repoya, git'e ve veritabanına kalıcı hiçbir şey yazılmadı. Deneme dosyaları scratchpad'de: `d1_enforcement_newsys.sql`, `d1_readmodel_newsys*.sql`, `d1_exp_grid.sql`, `d1_exp_scope.sql`, `d1_exp_timeoff.sql`, `d1_exp_fp.sql`.

## Önce kısa bir sözlük (raporda sık geçenler)

- **Eski sistem** = `employee_schedule_availability_versions` tablosu (18 Ağustos'ta kurulan müsaitlik): çalışanın *müsait olduğu* pencereleri, "kalıcı / geçici" sürümler, tarihli istisnalar, yönetici onay kuyruğu (`availability_requests`), ve Settings'te sert/yumuşak (`availability_enforcement`) + onay (`availability_approval`) ayarları. Bugün **hiçbir ekran buna yazmıyor**; yalnız seed (demo verisi) yazıyor.
- **Yeni sistem** = `employee_weekly_preferences` (çalışanın *müsait olmadığı* zamanlar; tek tekrarlayan hafta; kaydedince geçerli, onay yok; ekranda: çalışan tarafında **My availability**, yönetici tarafında **Employees → çalışan çekmecesi → Availability** sekmesi) + `manager_weekly_reminders` (yöneticinin çalışana görünmeyen hatırlatması; aynı çekmecedeki ikinci alt sekme).
- **Conflict handling ayarı** = `conflict_rules` (Settings → Conflict handling → "Employee availability": Allow / Warn / Require confirmation / Block; "Approved time off": Require confirmation / Block). Hedefteki "admin hard mı soft mu seçer" ayarının bugünkü karşılığı bu: **Block = hard**, Warn / Require confirmation = soft.
- **Değerlendirme** = `assess_weekly_shift_availability` — bir vardiya kaydedilirken sunucunun "bu kişi bu saatte konabilir mi" hesabı. Sonuç: `allowed` (serbest), `warning_requires_override` (uyar ya da "Place shift" tıklamasıyla onayla), `blocked` (konamaz).
- **Onay kaydı** = `schedule_availability_overrides` — yöneticinin "yine de koy" kararının kaydı; yayın (Publish) bu kaydı okur.

---

### schedule_availability_enforcement

**Ekrandaki karşılığı:** Schedule → Edit → vardiya ekleme/düzenleme penceresi (Add/Edit Shift) ve sürükle-bırak; çakışmada çıkan "Place shift / Cancel" onayı; Publish penceresindeki çakışma listesi; Auto-fill; Settings → Conflict handling → Employee availability. Örnek: Ayşe pazartesi 10:00-17:00 müsait değil; yönetici onu pazartesi Lunch'a (12:00-16:00) koymaya çalışıyor.

**Test ne iddia ediyor (kırmızı kontroller, 26 adet):** Sert ayarda atama engellenir (#4 değerlendirme `blocked`, #5 kaydetme engellenir, #6 veritabanına doğrudan yazma da engellenir); yumuşak ayarda gerekçeli, güncel değerlendirmeye bağlı bir karar gerekir (#7-#12); saat değişince karar geçersizleşir, geri alınan karar diriltilemez (#14, #17, #20, #23, #24); Auto-fill müsait olmayanı önermez (#28); yayında ayar değişince eski karar geçersizleşir (#40-#43, #48); yayınlanmış vardiya yerinde başkasına verilip eski karar diriltilemez (#54); "Schedule'ı yönetmek" izni tek başına müsaitliği ezme hakkı vermez, bunun için ayrı `schedule.availability.override` izni gerekir (#57, #59-#61); hiç müsaitlik girmemiş kişi "müsait" sayılmaz (#2).

**Eski davranış:** 9 Eylül'e kadar (migration `20260909012001_schedule_availability_enforcement`, commit `711da48`): değerlendirme eski tabloyu okurdu; boş kayıt = "doğrulama gerekli"; Settings'teki `availability_enforcement` = hard ise atama engellenirdi, soft ise en az 10 karakterlik yazılı gerekçe + ayrı "availability override" izni isterdi.
- Senaryo A (hard): Ayşe'yi Lunch'a koy → reddedilir.
- Senaryo B (soft): yönetici "Employee confirmed..." diye gerekçe yazar ve ayrı izni varsa kaydeder; kısa gerekçe reddedilir.
- Senaryo C: Mehmet (Kadıköy yöneticisi, yalnız Schedule düzenleme izni var) → gerekçe yazsa da reddedilir, ayrı izin verilince geçer.

**Ne değişti:** 
1. 9 Eylül — migration `20260909042300_weekly_schedule_integration` (commit `711da48`) atama hazırlığını (`schedule_prepare_availability_assignment` → `prepare_weekly_schedule_assignment`) ve değerlendirmeyi yeni sisteme bağladı. Yazılı gerekçe (migration başı): *"Schedule-only cutover… Do not deploy this series before the remaining client and request consumers have switched together."* Tasarım belgesi `docs/rebuild/availability-redesign-spec-2026-09-08.md` §1-2: "Unavailable bir planlama uyarısıdır… eski hard availability ve override gerekçesi ayarları kaldırılır."
2. 15 Eylül — BL-064 (commit `7a35dbc`, migration `20260915081826_bl064_conflict_severity`, plan `docs/rebuild/bl-064-schedule-conflict-plan-2026-09-15.md`) "Block"u geri getirdi ama başka bir ayarda: `conflict_rules.availability` (varsayılan "Require confirmation"). Aynı plan §4 ve §7: *"Typed reason veya minimum karakter zorunluluğu yoktur"*, *"Schedule düzenleme yetkisi olan kişilerin operasyonel confirmation işlemleri için ayrı conflict veya override permission'ları eklenmez."*

**Yeni davranış:** Değerlendirme yalnız yeni tabloyu ve `conflict_rules`'u okur; eski tablo ve `availability_enforcement` hiçbir şey değiştirmez. Aynı senaryolar (deneyle, geri alınarak):
- Senaryo A: `conflict_rules.availability=block` → değerlendirme `blocked`, kaydetme 23514 ile reddedildi, doğrudan veritabanı yazması da reddedildi. Eski ayar `availability_enforcement=hard` ise **hiçbir etki yapmıyor** (Ayşe'nin eski tablodaki kaydıyla sonuç `allowed`).
- Senaryo B: "Require confirmation" → tek tık onay; gerekçe yok; onay kaydına otomatik metin yazılıyor: "Schedule conflict confirmed by manager."
- Senaryo C: Mehmet'in `schedule.manage` izni yetiyor (`can_override=true`); ayrı izin yok.

Testin fikstürünü yeni sisteme çevirdiğimde (eski tablo yerine `employee_weekly_preferences`'a 10:00-17:00, `availability_enforcement` yerine `conflict_rules.availability`) **26 kırmızı → 17 kırmızıya** iniyor; kalan 17'nin hepsi aşağıdaki tabloda açıklandı.

| # | Kontrol (kısaca) | Hedefte var mı | Yeni sistemde (çevrilmiş fikstürle ölçüm) | Karar |
|---|---|---|---|---|
| 2 | Kaydı olmayan "müsait" sayılmaz | Yok — hedefte boş gün = müsait | Kayıt yok = `allowed` (tasarım gereği) | Sil |
| 4 | Hard ayarda Lunch engellenir | Var (admin hard seçer) | Block ile geçti | Taşı |
| 5 | Kaydetme hard'ı aşamaz | Var | geçti | Taşı |
| 6 | Doğrudan veritabanı yazması da hard'a uyar | Var (veri bütünlüğü) | geçti | Taşı |
| 7 | Soft ayarda karar gerekir | Var (uyarı + override) | geçti | (kopya) Sil |
| 8 | Güncel değerlendirmeyi görmeden onay yok | Var | Kural aynı, hata kodu 40001 değil PT409 | (kopya) Sil |
| 9 | Kısa gerekçe reddedilir | Yok — gerekçe istenmiyor (BL-064) | Gerekçe yok | Sil |
| 10 | Güncel değerlendirme + gerekçe tek atamaya izin verir | Override var, gerekçe yok | #9 silinince geçer (zincirleme) | (kopya) Sil |
| 11 | Onay kaydı bir kez tutulur | Var | geçti | (kopya) Sil |
| 12 | Onay yöneticinin yazdığı gerekçeyi saklar | Yok | Otomatik metin | Sil |
| 14 | Saat değişince eski onay geçersiz | Var | Kural aynı, kod PT409 | (kopya) Sil |
| 17 | Eski haline dönmek eski onayı diriltmez | Var | Kural aynı, kod PT409 | (kopya) Sil |
| 20, 23, 24 | Geri alınan onay ham yazmayla diriltilemez; yeniden yaratma yeni onay ister | Var | geçti | (kopya) Sil |
| 28 | Auto-fill müsait olmayanı önermez | Hedefte yok, tasarım belgesinde var | geçti | (kopya) Sil |
| 40, 41 | Taslak onaylıyken ayar Block'a çekilince yayın engellenir; bayat önizleme yayınlanamaz | Var (hard) | geçti | Taşı |
| 42 | Ayar soft'a dönünce yeni karar gerekir | Yok — tasarım belgesi: "değişmeyen çakışma tekrar sorulmaz" | `publish_ready` (aynı parmak izi, eski onay geçerli) | Sil |
| 43 | Yayın bulgusunun kodu `availability` | Var | geçti | (kopya) Sil |
| 48 | Yayın kanıtı yöneticinin yazdığı gerekçeyi taşır | Yok | Otomatik metin | Sil |
| 54 | Yayınlanmış vardiya yerinde başkasına verilip eski karar diriltilemez | Veri bütünlüğü | Belirsiz: #49-53'e bağlı zincirleme | #49-53 kararından sonra yeniden yaz |
| 57, 59, 60 | Ayrı `schedule.availability.override` izni gerekir | Yok — hedef: manager/admin override eder; BL-064 §7 ayrı izni kaldırdı | `schedule.manage` yetiyor | Sil |
| 61 | Onayı kimin verdiği kaydedilir | Var (iz) | geçti | (kopya) Sil |

"(kopya) Sil" = kuralın kendisi hâlâ geçerli ama yeni sistemin kendi yeşil testlerinde zaten birebir karşılığı var: `weekly_schedule_acceptance` ("warn acceptance needs no reason", "moving back cannot revive revoked acceptance", "scheduling manager does not need obsolete override permission"…) ve `weekly_schedule_integration` ("raw assignment cannot bypass weekly acceptance", "canonical auto-fill excludes new weekly unavailable hours"…). İkinci bir kopya tutmak "iki uygulama aynı kalmaz" kuralına aykırı.

**Önemli:** Yeni sistemin hiçbir testi **"Employee availability = Block"** durumunu denemiyor (`bl064_conflict_severity` yalnız dinlenme süresi, kapalı lokasyon ve belgeler için Block deniyor; `weekly_shift_availability_assessment` hatta "obsolete hard policy cannot hard-block preferences" diyor — yani eski ayarı). Hedefin "admin hard seçer" kuralını koruyan tek içerik bu dosyanın #4, #5, #6, #40, #41 kontrolleri. Onlar taşınmalı.

**Hedefe göre doğrulama:**
- Yeni sistem hedefe uyuyor: çalışan müsait olmadığı zamanı işaretler, boş = müsait, onay yok; yönetici uyarı alır ve (soft'ta) override eder; admin Settings → Conflict handling'de hard (Block) ya da soft seçer; Block seçilince override **edilemez** (kaydetme, ham yazma, yayın, Auto-fill ve çalışanın pickup kabulü — sonuncusu kodu okuyarak: `record_weekly_exchange_acceptance` `blocked` görünce reddediyor). Eski sistem hedefin tersi yönde (müsait olunan pencereler, onay kuyruğu) — dönüş istenmez.
- Hedefin tek hard/soft ayarı pratikte tek: yalnız `conflict_rules.availability` değiştirilebilir. Ama veritabanında aynı şeyi anlatan **üç sütun daha** duruyor: `availability_warning_policy` (tetikleyiciyle `conflict_rules`'tan türetilen gölge; Block ve Allow'u yanlışlıkla "warn" diye yazıyor — ölçüldü; değiştirme denemesi "Use Conflict handling…" hatasıyla reddediliyor), `availability_enforcement` (eski; yalnız ölü eski fonksiyonlar okuyor; Settings → Scheduling kaydı yüklediği değeri geri gönderiyor), `conflict_policy` (hiçbir kural okumuyor). Bunlar silinmeli.
- **Hedefle çelişen: Allow seçeneği.** Hedef "yönetici vardiya yazarken uyarı alır" diyor; "Allow" uyarıyı tamamen kapatıyor (bkz. sorular).
- **Hedefle çelişen: yayınlanmış vardiyaya geriye dönük Block.** Çeviri denemesinde #49, #51, #52, #53 (bugün yeşil — ama yalnız eski ayar hiçbir şey yapmadığı için yeşil) kırmızıya döndü: Ayşe'nin pazartesi Lunch vardiyası onaylanıp yayınlandıktan sonra admin Block'a geçerse, o haftayı yeniden yayınlamak (ör. Ali'ye yeni bir vardiya eklemek) Ayşe'nin **değişmemiş** vardiyası yüzünden `hard_blocked` oluyor. Kod bunu bilerek yapıyor (`weekly_schedule_publication_preflight`: "Always evaluate hard rules again"), tasarım belgesi §5 ise "tercih değişiklikleri yayınlanmış shiftlere yeni uyarı geri doldurmaz" diyor. Ürün kararı gerekli.
- Kapsam: Mehmet (Kadıköy) Beşiktaş'taki bir vardiyayı değerlendiremiyor (#58, yeşil) — hedefle uyumlu.

**Kanıt:**
- Deneyerek: orijinal dosya bugün 26 kırmızı (baseline ile aynı). Fikstür yeni sisteme çevrilince 17 kırmızı; satır satır karşılaştırma yukarıda (`d1_enforcement_newsys.sql`). Block'ta kaydetme reddi: `prepare_weekly_schedule_assignment` "The assignment overlaps unavailable hours" 23514. `availability_enforcement=hard` + eski tablo → `allowed`.
- Kodu okuyarak: `assess_weekly_shift_availability` (şiddet `conflict_rules`'tan), `prepare_weekly_schedule_assignment` (onay kaydını otomatik metinle yazar), `guard_schedule_assignment_availability` (ham yazmayı da yeni sistemle denetler), `sync_schedule_conflict_rules` (gölge sütun), `weekly_schedule_publication_preflight` (Block geriye dönük), `schedule_availability_publication_preflight` (ayrı izni okuyan tek fonksiyon — hiçbir yerden çağrılmıyor, ölü).
- Önceki BL-091 notunun bir kısmı yanlış: "yöneticinin 'yine de koy' onayı artık yayının okuduğu tabloya yazılmıyor" doğru değil — yeni sistem bir çakışma gördüğünde onayı aynı tabloya (`schedule_availability_overrides`) yazıyor ve yayın onu okuyor (çeviri denemesinde #11, #44 geçti). Testler eski tabloya yazdığı için yeni sistem çakışma görmüyor, onay da doğmuyor.

**Önerilen karar:** **Test düzelsin** — dosya silinsin; yalnız Block (hard) kontrolleri (#4, #5, #6, #40, #41 ve #49-54 ürün kararına göre yazılmış hali) yeni sisteme yazılmış kısa bir blok olarak `bl064_conflict_severity` ya da `weekly_schedule_integration`'a taşınsın. `(leave: medium / do: safe)`
- Kırmızıların tamamı eski tabloya/eski ayara yazmaktan ya da BL-064'ün bilerek kaldırdığı iki şeyden (yazılı gerekçe, ayrı izin) geliyor; motor doğru çalışıyor.
- Geri kalan kurallar yeni sistemin yeşil testlerinde zaten var; ikinci kopya ayrışır.
- Hedefin "hard" kuralını koruyan başka test yok — o yüzden hepsini silmek yanlış olur.
- Diğer seçenek (repo düzelsin, eski sistemi geri bağla) ancak ürün sahibi eski modele (müsait pencereler + onay) dönmek isterse doğru olur; hedef tersini söylüyor.

**Önceki karar ile karşılaştırma:** Önceki öneri (yeni sistem esas, geçerli kurallar taşınsın, kaldırılmış özellikler silinsin) **aynı kalmalı**, iki düzeltmeyle: (1) taşınacak şey "her şey" değil, yalnız Block'a ait kontroller — gerisinin kopyası zaten var; (2) BL-091'in "onay tabloya yazılmıyor" cümlesi düzeltilmeli.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** #49, #51, #52, #53 yalnız eski ayar etkisiz olduğu için yeşil (yukarıda). #33 "bekleyen izin talebi atamayı engellemez" hedefle uyumlu (yalnız onaylanmış izin çakışmadır).

**Kullanıcıya sorular:** alan geneli bölümde S2, S3.

---

### availability_shift_type_restrictions

**Ekrandaki karşılığı:** Eski müsaitlik editöründe çalışanın "Lunch servisinde çalışmam" diye **vardiya tipini adıyla** yasaklaması ve bunun yönetici onayına düşmesi (eski Requests → Availability sekmesi). İkisi de artık ekranda yok. Bugünkü yakın karşılık: Settings → Scheduling → Availability → Entry mode = "Shift type" iken My availability'de Lunch'ı işaretlemek — ama yeni kuralda bu, Lunch'ın **varsayılan saatleri** (12:00-16:00) demek, adı değil.

**Test ne iddia ediyor (kırmızı kontrol):** #23 "actual assignment preparation rejects hard type conflict before a write" — eski tabloda Lunch'ı yasaklamış Ayşe'yi, 18:00-20:00 saatli ama "Lunch" adlı bir vardiyaya hard ayarda koymak kaydetmeden önce reddedilmeli.

**Eski davranış:** Migration `20260909021001_availability_shift_type_restrictions` (commit `711da48`): yasak vardiya **adına/kimliğine** bağlıydı; saat ne olursa olsun Lunch adlı vardiya çakışırdı; yeni yasak "daraltma" sayılıp onaya düşerdi; geçici haftalar yasağı dönemsel kaldırabilirdi; onaylı sürümler değiştirilemezdi.
- Ayşe "Lunch yok" der → onay bekler → yönetici onaylar → Ayşe'yi 18:00-20:00 "Lunch"a koymak hard'da reddedilir, aynı saatli "Dinner"a koymak serbest.

**Ne değişti:** 9 Eylül yeniden tasarımı (spec §2): *"Type seçimi, default saat aralığını temsil eder; vardiya adına dayalı ayrı bir engel değildir… Kaydedilen gerçek vardiya saatleri önceliklidir… Dinner adlı ama 12:00-16:00 yazılmış shift bununla çakışma yaratmaz."* Ve §1: onay yok, geçici/tarihli istisna yok. Atama hazırlığı yeni sisteme geçince (migration `20260909042300`) eski yasak okunmaz oldu.

**Yeni davranış:** Aynı senaryo: Ayşe My availability'de (Shift type modunda) Lunch'ı işaretler → kaydedince geçerli, onay yok → 18:00-20:00 "Lunch" adlı vardiya **çakışmaz** (saatler Lunch'ın 12:00-16:00'ıyla kesişmiyor); 12:00-16:00 "Dinner" adlı vardiya çakışır. Bu kural yeni sistem testlerinde yeşil ("actual hours trump matching type identity", "no type identity restriction").

**Hedefe göre doğrulama:** Hedef yalnızca "çalışan müsait olmadığı günleri/saatleri işaretler" diyor — yani saat esaslı. Yeni davranış hedefle uyumlu; eski "adla yasak" ve "onay" hedefte yok. Dosyanın yeşil kontrollerinin de tamamı (onay akışı, daraltma hesabı, geçici hafta, saat dilimi sınırı, sürüm değişmezliği, arşivlenmiş tip etiketi) eski sistemin iç fonksiyonlarını deniyor; bunların hiçbirini uygulama çağırmıyor. Yeni sistemde karşılığı gereken tek konu (arşivlenen tipin etiketi/saatleri korunur) `weekly_availability_preferences` testinde zaten var.

**Kanıt:** Deneyerek: #23 bugün kırmızı (hata fırlatılmıyor çünkü `prepare_weekly_schedule_assignment` eski tabloyu okumuyor). Kodu okuyarak: `assess_weekly_shift_availability` her zaman `type_restrictions: []` döndürüyor; eski `availability_shift_type_rules` yalnız eski fonksiyonlardan çağrılıyor; `availability_command_service` uygulamadan çağrılmıyor (API ve web'de hiç geçmiyor).

**Önerilen karar:** **Test düzelsin — dosyanın tamamı silinsin** (eski sistemin sökülmesiyle aynı işte). `(leave: low / do: safe)`
- Anlattığı üç özellik (adla yasak, onay, geçici hafta) tasarım belgesiyle bilerek kaldırıldı ve hedefte yok.
- Yeni kuralın testleri zaten var ve yeşil.
- Diğer seçenek (adla yasağı yeni sisteme eklemek) ancak ürün sahibi "Lunch'ta çalışmam, saat ne olursa olsun" demek isterse doğru olur (bkz. S8).

**Önceki karar ile karşılaştırma:** BL-091 bunu "sert tip kısıtlaması atamada uygulanmıyor" diye hata gibi yazmış; doğrusu: özellik bilerek kaldırıldı. "Karar gelmeden dokunma" notu yerinde; karar gelince silinir.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** #8 "organization narrowing approval applies…" ve #11 "manager approval activates…" gibi onay kontrolleri hedefle çelişiyor (hedefte onay yok) — ama yalnız ölü kodu deniyorlar.

**Kullanıcıya sorular:** S8 (düşük öncelik).

---

### availability_draft_impact_review

**Ekrandaki karşılığı:** Eski akışta çalışanın müsaitlik değişikliği yönetici onayına düşünce, yöneticinin "bu değişiklik hangi taslak vardiyaları etkiler" önizlemesini görüp onaylaması (eski Requests → Availability sekmesi). Bugün ekranda yok.

**Test ne iddia ediyor (kırmızı kontrol):** #19 "read-only preview does not revoke historical override evidence" — önizleme, daha önce verilmiş bir "yine de koy" onayını silmemeli.

**Eski davranış:** Migration'lar 8-9 Eylül (commit `711da48`): çalışan yeni saat gönderir → "pending_review" → yönetici `preview_availability_draft_impact_service` ile etkilenen taslakları (gizli lokasyonları sansürleyerek) görür → onaylar; onay, önizlemenin parmak iziyle bağlıydı; taslak vardiyalar hiç değişmezdi.
- Ayşe salı 10-17'yi kapatmak ister → yönetici "3 vardiya etkileniyor" görür → onaylar → vardiyalar yerinde kalır, uyarı alır.

**Ne değişti:** Spec 2026-09-08 §1 ve §3: *"Kaydet anında geçerlidir; onay/ret/bekleyen availability kuyruğu yoktur"*; §4: *"Requests içindeki availability onay sekmesi kaldırılır."* #19'un kırmızı olmasının nedeni ise ayrı: test "yine de koy" onayını eski tabloya dayanarak oluşturuyor; atama hazırlığı yeni sisteme baktığı için çakışma görmüyor ve onay kaydı hiç yazılmıyor (sayı 0).

**Yeni davranış:** Ayşe My availability'de salı 10-17'yi işaretleyip kaydeder → hemen geçerli; ilgili yöneticilere bildirim gider; taslaktaki vardiyalar değişmez ama uyarı alır (tasarım §5); yayınlanmış vardiyalara yeni uyarı gelmez. Bekleyen pickup/swap istekleri için "Koru / İptal et" sorusu kayıt anında sorulur (`weekly_preferences_preview_service`). Onay önizlemesi diye bir adım yok.

**Hedefe göre doğrulama:** Hedef onay istemiyor ("employee müsait olmadığı günleri işaretler"); yeni davranış hedefle uyumlu, eski akış değil. Dosyadaki "yetki var ama Schedule izni olmayan İK rolü onaylayabilir ama roster'ı görmez" fikri de onay kalktığı için anlamsız.

**Kanıt:** Deneyerek: #19 kırmızı (have 0, want 1). Kodu okuyarak: `preview_availability_draft_impact_service`'i yalnız `availability_command_service` çağırıyor; o da uygulamadan hiç çağrılmıyor.

**Önerilen karar:** **Test düzelsin — dosyanın tamamı silinsin** (eski sistemle birlikte). `(leave: low / do: safe)`
- Anlattığı akış (onay + etki önizlemesi) tasarımda bilerek kaldırıldı, hedefte yok.
- Taşınmaya değer tek fikir ("müsaitlik değişince taslak vardiyalar kendiliğinden değişmez") yeni sistemde tasarım kuralı; yeni testlerde açık bir kontrolü olup olmadığı sökme işinde bir kez bakılmalı.
- Diğer seçenek ancak ürün sahibi müsaitliğe yönetici onayını geri isterse doğru olur.

**Önceki karar ile karşılaştırma:** BL-091 #19'u "onay yayının okuduğu tabloya yazılmıyor" diye okumuş; doğru okuma: eski tabloyu kimse okumadığı için ortada onaylanacak çakışma yok. Karar (bekle, sonra sil) aynı.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** #22 "reviewed manager proposal still requires employee confirmation", #28 "authorized HR can approve…", #35 "reviewed approval activates availability" vb. — onay akışını iddia ediyor, hedefte yok (ölü kod).

**Kullanıcıya sorular:** yok.

---

### availability_read_model_consistency

**Ekrandaki karşılığı:** Schedule ızgarasındaki vardiya rozetinin "Outside employee availability" işareti ve hücrenin açık kırmızı çizgili "Employee unavailable" görünümü; Publish penceresindeki çakışma listesi; eski çalışan panelindeki "şu an geçerli hafta" okuması.

**Test ne iddia ediyor (kırmızı kontroller):** #16 "gelecekteki geçici saatler taslakta çakışma üretir", #17 çakışma politikanın işlemini taşır, #18 çakışma tam müsait-olmayan parçaları içerir, #19 kaynak değişince parmak izi değişir, #20 haftalık rozet uyarısı taslak çakışmasıyla aynı. Satır 64'te test, saati bilinmeyen (`unresolved`) bir taslak vardiyayı doğrudan yazmak istiyor → "A current availability acceptance is required" hatası dosyanın geri kalanını durduruyor (22. kontrolden sonrası hiç koşmuyor).

**Eski davranış:** Commit `711da48` (9 Eylül): eski tabloda "geçici" sürümler kalıcıyı gölgeler, tarihli değiştirmeler, saat dilimi sınırları (#1-#12); taslak çakışmaları ve ızgara rozeti bu sürümlerden hesaplanır; saati bilinmeyen vardiya "doğrulama gerekli" sayılır ama taslakta durabilir.
- Ayşe'nin bu hafta için geçici "yalnız akşam" sürümü var → Lunch vardiyası taslakta çakışma olarak listelenir ve rozet uyarı gösterir.

**Ne değişti:** 9 Eylül yeni sistem (geçici hafta yok, tek hafta); 10 Eylül commit `100c882` ("Schedule read latency quick fix", WORK.md kaydı) Schedule ekranının okumasını yeni sistemi taşıyan `get_schedule_read_model_availability_v2_service`'ten eski tabloyu taşıyan `get_schedule_read_model_service`'e **geri çevirdi** — gerekçe yalnız hız; müsaitlik etkisi yazılmamış. 15 Eylül BL-064: saati bilinmeyen vardiya artık "Require confirmation" (tek tık) sayılıyor.

**Yeni davranış (ve ekrandaki etkisi — geri alınan denemeyle gösterildi, `d1_exp_grid.sql`):**
Kurulum: Meyhouse'ta Ayşe (Main Dining) ve Ali (ayrı bir lokasyon), ikisine de pazartesi 12:00-16:00 vardiya, yayınlandı. Ayşe'nin **yeni sistemde** pazartesi 10:00-17:00 müsait değil kaydı var; Ali'nin yalnız **eski tabloda** "pazartesi tamamen müsait değil" kaydı var (yeni sistemde kaydı yok = müsait).

| | Sunucunun kararı (kaydetme/yayın bunu kullanır) | Schedule ekranının aldığı veri (bugün) | Kullanılmayan v2 okuması |
|---|---|---|---|
| Ayşe | müsaitlik çakışması (confirm) | hücre çizgisi yok, rozet uyarısı yok (`weekly_availability` alanı hiç gelmiyor) | pazartesi `has_unavailable=true` |
| Ali | müsaitlik çakışması yok | pazartesi hücresi çizgili "Employee unavailable", rozet `["availability"]` | çakışma yok |

Yani yayınlanmış haftada Schedule ızgarası **eski sistemi** gösteriyor, kaydetme ve yayın **yeni sistemle** karar veriyor. Edit modunda taslak listesi (`list_schedule_weekly_shifts_service`) rozet kodunu yeni sistemle yeniden hesaplıyor (eski kod eziliyor) — brief'teki "rozet eski sistemden geliyor" iddiası yalnız görüntüleme modu (yayınlanmış hafta) ve hücre çizgileri için doğru.

Bugün yerel veritabanında da görünüyor (yazmadan ölçüldü): seed (`supabase/seed.sql` satır 325) Alex'e eski tabloda "cuma müsait değil" yazıyor; Schedule okuması Alex'in cumalarını çizgili gösteriyor; yeni sistemde Alex'in kaydı yok (0 satır) → sunucu onu cuma müsait sayıyor, My availability sayfası "henüz belirtilmedi" gösteriyor.

Test fikstürünü yeni sisteme çevirince (`d1_readmodel_newsys*.sql`): #16, #17, #19, #20 geçti; #18 yalnız karşılaştırmayı eski `assess_shift_availability` ile yaptığı için kaldı; #25 "yayınlanmış okuma geriye dönük uyarı üretmez" kırmızıya döndü — ama yeni tasarımda kabul edilmiş çakışmanın ikonu kalıcı ("Kaydedilen Schedule shiftinde availability ikonu kalır", spec §5), yani test yanlış; #28 eski sürüm metadatası (ölü).

**Hedefe göre doğrulama:** Hedef "yönetici vardiya yazarken availability uyarısı alır" diyor. Bugün yönetici ızgarada **yanlış kişiyi** uyarılı görüyor (eski veri) ve doğru kişiyi uyarısız görüyor; uyarıyı ancak kaydetmeye basınca (sunucudan) alıyor. Bu **kod hedefle çelişiyor** — test yeşil olsa da. Sürükleme hedef renkleri ayrıca hiç çalışmıyor olabilir: API ızgara okumasında `settings`'i yalnız `time_format` ile eziyor, `conflict_rules` web'e ulaşmıyor; `missingTargetEvidence` bu durumda her hedefi "needs checking" (turuncu) sayıyor (kodu okuyarak, tarayıcıda ölçülmedi).

**Kanıt:** Deneyerek: yukarıdaki tablo (geri alındı); Alex ölçümü (salt okuma). Kodu okuyarak: `apps/api/src/schedule/schedule-service.ts` `getReadModel` (`get_schedule_read_model_service` çağrısı; `settings` ezme); `get_schedule_read_model_service_label_base` (eski tablo: `availability` ve `warning_codes`); `apps/web/src/schedule/hooks/useCellState.ts` (`weekly_availability` yoksa eski `availability`'ye düşüyor); `schedule-conflicts.ts` (`availabilityForDate` geri düşüşü); `schedule_availability_enrich_read` (edit modunda yeni sistemle ezme); `list_schedule_draft_availability_conflicts_service` yeni sistemde ama web'de hiçbir ekran çağırmıyor (`fetchDraftAvailabilityConflicts` kullanılmıyor). Yeni sistemin okuma testi `weekly_schedule_read` yeşil ama **uygulamanın kullanmadığı** v2 okumasını deniyor — sahte güven.

**Önerilen karar:** **İkisi.** `(leave: high / do: moderate)`
- Repo: Schedule ızgarası yeni sistemi okumalı (v2'ye geri dönmek ya da ana okumaya haftalık projeksiyonu eklemek; 10 Eylül'deki hız sorunu ölçülerek). Bu, eski sistemin sökülmesinin ilk ve en görünür adımı. Seed'deki Alex örneği yeni tabloya taşınmalı.
- Test: #1-#12 ve #28 (geçici/değiştirme sürüm önceliği) silinsin; #13-#21 yeni sisteme çevrilsin (#18 yeni fonksiyonla karşılaştırsın); #25 yeni tasarıma göre tersine çevrilsin (kabul edilmiş çakışmanın ikonu kalır); saati bilinmeyen vardiya bloğu (satır 64-69) "saat doğrulanmalı mı, tek tık onay mı" kararına göre yeniden yazılsın ya da silinsin (bkz. S7).
- Diğer seçenek (yalnız test düzelsin) ekrandaki yanlışı bırakır; ancak ızgaranın müsaitlik göstermemesi kabul edilirse doğru olur.

**Önceki karar ile karşılaştırma:** BL-091 bu dosyayı "hangi sistem esas" sorusuna bağlamış — doğru; ama ekrandaki etkiyi (ızgara eski sistemi gösteriyor) ve 10 Eylül'deki geri dönüşü kaçırmış. BL-085 ("dönüşüm Schedule'ın gördüğünü değiştiriyor mu, ölçülmedi") için cevap: **ızgara görünümünü değiştirmez** (ızgara zaten yeni sistemi görmüyor), kaydetme/yayın/Auto-fill kararını değiştirir.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** #1-#12 eski "geçici hafta" önceliğini iddia ediyor (hedefte ve yeni tasarımda yok). #3 "employee/manager panel current pattern…" eski panele ait.

**Kullanıcıya sorular:** S1, S7.

---

## Alan geneli bulgular

**1. Ortak kök neden: 9 Eylül geçişi yarım kaldı.** Geçiş migration'ı (`20260909042300_weekly_schedule_integration`) "Schedule-only cutover; kalan istemci ve istek tüketicileri birlikte geçmeden dağıtma" diyor. Geçmeyenler:
- Schedule ızgarası görüntüsü: 10 Eylül'de hız için eski okumaya geri alındı (`100c882`). **Ekranda görünen tek büyük etki bu.**
- Requests → Shift Changes çakışma kontrolü (`get_shift_change_conflicts_service`) ve izin onayı etki önizlemesi (`time_off_assignment_impact`) eski `assess_shift_availability`'yi çağırıyor — yalnız izin/saat hesabı için, müsaitlik kuralı için değil; sökülürken yeni hesaplayıcıya bağlanmalı. BL-093 ile aynı aile olabilir.
- Line Up aday kontrolü (`lineup_candidate_check_exchange_base`) eski değerlendirmeyi çağırıyor — kapsam dışı, yalnız not (BL-092 ile ortak kök olabilir).
- Çalışanın kendi programı (`get_employee_schedule_board_service`, `get_employee_hub_service`) eski tabloyu döndürüyor ama ekran bunu çizmiyor — zararsız, ölü alan.
- Seed eski tabloya yazıyor.
Dört test dosyasının kırmızılarının hepsi bu yarım geçişin test tarafı.

**2. Eski sistemin ölü kalıntıları (sökme listesi):** tablolar `employee_schedule_availability_versions`, `availability_requests`, `availability_draft_impact_reviews`, `availability_publication_locks` ve bağlı fonksiyonlar (`availability_command_service`, `availability_read_service`, `preview_availability_draft_impact_service`, `save_employee_availability_v2_service`, `save_onboarding_availability_v2/v3_service`, `get_employee_hub_availability_v2_service`, `schedule_availability_publication_preflight`, `schedule_assess_availability_preview`, `schedule_prepare_service_classification`, `assess_shift_availability*`…); ayarlar `availability_enforcement`, `availability_ownership`, `availability_approval`, `availability_initial_review`, `availability_notice_days`, `availability_policy_revision`, `conflict_policy`, gölge `availability_warning_policy`; izin anahtarı `schedule.availability.override` (Roles ekranında görünmüyor ama rollerde 15 satır duruyor); web'de hiç tetiklenmeyen "Override reason" metin kutusu dalları (`ShiftQuickEditor`, `DefaultHoursReviewDialog`, `useScheduleDropReview` içindeki `!warning_policy` yolları); paylaşılan `availabilityForDate` geri düşüşü. Settings → Scheduling bu eski ayarları okuyup kaydederken geri gönderiyor.

**3. Onaylanmış izin yumuşatılabiliyor — kod hedefle çelişiyor.** Settings → Conflict handling → "Approved time off" = "Require confirmation" seçilebiliyor. Geri alınan denemede (`d1_exp_timeoff.sql`): Ayşe'nin tüm günü kapsayan onaylı izni varken yönetici onu o güne tek tıkla koyabildi; onay kaydına "Schedule conflict confirmed by manager." yazıldı. Hedef: "Onaylanmış izin yumuşatılamaz." Yeni sistemin "approved leave is not overrideable" testleri yalnız varsayılan (Block) ayarda doğru. Öneri: seçenek kaldırılsın, onaylı izin "aynı saatte iki vardiya" gibi sabit engel olsun `(leave: high / do: safe)`. BL-064 planı bunu bilerek ayarlanabilir yapmıştı — o yüzden S3'te tek satırlık teyit soruldu.

**4. İlgisiz bir kural değişince bütün müsaitlik onayları düşüyor.** Onay parmak izi bütün Conflict handling ayarlarını içeriyor. Denemede (`d1_exp_fp.sql`) "Required documents" şiddetini ya da minimum dinlenme süresini değiştirmek Ayşe'nin müsaitlik onayının parmak izini değiştirdi → yönetici taslaktaki bütün "yine de koy" kararlarını yeniden vermek zorunda. Tasarım §8: "ilgisiz değişiklikler tekrar onay doğurmaz." `(leave: low / do: safe)`

**5. Block altında çalışanın pickup istisnası çalışmıyor.** Hedef: çalışan, release edilmiş bir vardiyayı kendi müsaitliğini ezerek alabilir (tek istisna). Kodu okuyarak: `conflict_rules.availability=block` iken `record_weekly_exchange_acceptance` yönetici onayı anında reddediyor, üstelik yanlış mesajla ("Resolve shift hours or approved time off before transfer"). Soft ayarda istisna çalışıyor ve çalışanın kabulü yöneticinin gizli hatırlatmasını da (çalışan görmeden) eziyor — tasarım §6 bunu açıkça istiyor. Bkz. S4.

**6. Saati bilinmeyen vardiya tek tıkla geçiyor.** Oturumdaki önceki karar "saati bilinmeyen vardiya 'saat doğrulanmalı' olmalı (gerekçeyle override değil)" iken yeni değerlendirme bunu "Require confirmation" sayıyor ve onaydan sonra yayınlanabiliyor. `unresolved` saat tipi web'de yalnız saatsiz vardiya tipi için üretiliyor, BL-081'den sonra saatsiz tip yok — yani büyük ihtimalle artık yaratılamayan bir durumu idare eden yol ("canlı veri yok" kuralına göre silinecek aday). Zaman kaynağı alanının konusu; burada yalnız çakışma noktası.

**7. Küçük:** ızgara rozetindeki "availability" kodu edit modunda müsaitlik dışı nedenlerle de (kabul edilmemiş herhangi bir çakışma) ekleniyor — etiket "Outside employee availability" yanıltıcı olabilir (kodu okuyarak).

**Fikir ve tavsiyeler:**
- Sökme işi tek task olmalı ve sırası önemli: (a) ızgara okuması yeni sisteme (hız ölçümüyle), (b) Requests / izin onayı / Line Up çağrıları yeni hesaplayıcıya, (c) seed, (d) eski tablolar, fonksiyonlar, ayarlar ve izin anahtarı, (e) dört dosyanın silinmesi ve Block bloğunun taşınması, (f) `weekly_schedule_read`'in gerçekten kullanılan okumayı test etmesi. Paylaşılan kurallar ve veri şekli değiştiği için `do: risky`; en güçlü model, yüksek efor.
- Conflict handling'deki "Employee availability" satırı hedefi zaten karşılıyor; "Allow"u kaldırmak ve "Approved time off"u sabit göstermek ekranı hedefe birebir oturtur.

## KAPSAM MODELİ SORULARI (alan G'ye girdi)

**K1. Yöneticinin gizli hatırlatması tüm lokasyonlarda tek kayıt.** Ölçüldü (`d1_exp_scope.sql`, geri alındı): Ayşe Kadıköy'de (yönetici Mehmet) ve Beşiktaş'ta (yönetici Zeynep) çalışıyor. Mehmet çekmecede "cuma 18:00-24:00, not: 'okul'" hatırlatması yazıyor. Sonuç: Zeynep aynı kaydı ve Mehmet'in notunu görüyor (`can_manage=true`); Zeynep'in Beşiktaş cuma 19-23 vardiyası Mehmet'in hatırlatmasıyla uyarı alıyor; Zeynep hatırlatmayı kapatınca Kadıköy'deki uyarı da kayboluyor. Tasarım §3 bunu bilerek istiyor ("tek bağlı lokasyonda yetki yeterlidir; kayıt tüm lokasyonlarda uygulanır"). Soru: hatırlatma kişinin mi (bugünkü), yoksa lokasyonun mu (her yönetici yalnız kendi lokasyonu için yazar, diğerinin notunu görmez)?

**K2. Çalışanın kendi haftası da tek kayıt.** Beşiktaş yöneticisi Ayşe'nin bütün haftasını görüyor (Ayşe'nin yalnız Kadıköy'de çalıştığı günler dahil). Bir insanın müsait olmadığı zaman lokasyondan bağımsız olduğu için bu doğal görünüyor; hedefle çelişki görmedim, yalnız teyit için.

**K3. Hard/soft ayarı workspace geneli.** BL-064: "Bu fazda location… bazlı policy override'ı eklenmez." Kadıköy Block, Beşiktaş Warn isteyemez. Hedef "organizasyon ayarları" dediği için uyumlu.

## Kullanıcıya sorular (alan geneli, önem sırasıyla)

**S1. İki müsaitlik sisteminden hangisi esas? (BL-091)**
Neden: dört dosyanın tamamı ve ekrandaki ızgara yanlışlığı bu karara bağlı. Kanıt: kaydetme, yayın, Auto-fill, pickup yeni sistemle karar veriyor; ızgara görüntüsü eski sistemi gösteriyor; hiçbir ekran eski sisteme yazmıyor.
Seçenekler: (a) yeni sistem esas, eski sistem tek bir task'ta sökülür (ızgara okuması dahil); (b) eski sisteme dönülür.
Öneri: (a). Yeni sistem hedefle birebir (müsait olmadığı zamanı işaretler, onay yok, çekmecede iki alt sekme, admin hard/soft seçer); eski sistem hedefin tersine kurulu.

**S2. Admin müsaitliği sonradan Block'a çekerse, önceden onaylanıp yayınlanmış vardiyalar ne olur?**
Neden: bugün o haftayı yeniden yayınlamak, değişmemiş eski vardiya yüzünden engelleniyor (çeviri denemesi #49-53).
Örnek: Ayşe'nin pazartesi Lunch'ı onaylanıp yayınlandı; admin Block'a geçti; yönetici aynı haftaya Ali'yi ekleyip yayınlamak istiyor → engel: önce Ayşe'yi çıkar.
Seçenekler: (a) Block yalnız yeni/değişen atamalara uygulanır, yayınlanmış ve değişmemiş vardiya korunur (öneri — tasarım §5 ve hedefteki "yönetici onayladı, çalışan planını yaptı" mantığıyla uyumlu); (b) Block geriye dönük uygulanır (bugünkü kod).

**S3. Settings → Conflict handling'deki iki seçenek hedefle çelişiyor; kaldırılsınlar mı?**
- "Approved time off → Require confirmation": hedef "onaylanmış izin yumuşatılamaz" diyor, bugün yönetici tek tıkla izinli çalışanı vardiyaya koyabiliyor. Öneri: seçenek kaldırılsın, onaylı izin sabit engel olsun.
- "Employee availability → Allow": hedef "yönetici uyarı alır" diyor, Allow uyarıyı tamamen kapatıyor. Seçenekler: (a) kaldır (öneri, hedefe birebir); (b) kalsın (admin'e "müsaitliği hiç sorma" hakkı).

**S4. Admin Block seçtiyse, çalışan release edilmiş bir vardiyayı kendi müsaitliğini ezerek alabilsin mi?**
Neden: hedef bunu "tek istisna" diye tanımlıyor ama hard altında geçerli olup olmadığını söylemiyor. Bugün: soft'ta alabiliyor, Block'ta yönetici onayı anında yanlış mesajla reddediliyor.
Seçenekler: (a) evet, istisna Block'ta da geçerli (çalışan kendi kararını veriyor; öneri); (b) hayır, Block herkese kesin — o zaman aday listesinde baştan "uygun değil" görünmeli ve mesaj düzeltilmeli.

**S5. (KAPSAM MODELİ SORUSU, K1) Yöneticinin gizli hatırlatması kişiye mi, lokasyona mı ait?**
Seçenekler: (a) kişiye ait, tüm lokasyonlarda tek kayıt (bugünkü, tasarım §3); (b) lokasyona ait, her yönetici yalnız kendi lokasyonu için yazar ve görür. Öneri yok — alan G'nin kapsam modeline bağlı.

**S6. Çalışanın pickup'ta verdiği "yine de alıyorum" kararı, yöneticinin çalışana görünmeyen hatırlatmasını da ezsin mi?**
Bugün eziyor (tasarım §6 böyle istiyor). Hedef "kendi availability kararını override" diyor. Seçenekler: (a) ezsin (bugünkü); (b) hatırlatma varsa yönetici onayında ayrıca gösterilsin. Düşük öncelik.

**S7. Saati bilinmeyen vardiya: "saat doğrulanmalı" mı, tek tık onay mı, yoksa hiç yaratılamaz mı?**
Neden: önceki oturum kararı "doğrulanmalı", kod "tek tık onay + yayınlanabilir", BL-081'den sonra bu durum büyük ihtimalle hiç oluşamıyor. Öneri: saatsiz vardiya yaratılamıyorsa bu yol ve testleri silinsin; yaratılabiliyorsa "doğrulanmalı" kararı uygulansın. (Zaman kaynağı alanıyla ortak.)

**S8. "Shift type" giriş modunda Lunch'ı işaretlemek "Lunch'ın saatleri" mi, "Lunch adlı her vardiya" mı?**
Tasarım (8 Eylül) "saatleri" diye karar vermiş; kod öyle. Yalnız teyit: saati farklı yazılmış "Lunch" vardiyası uyarı vermez. Düşük öncelik.

**S9. Onboarding'deki availability adımı her zaman opsiyonel mi?**
Hedef "opsiyonel" diyor; Settings → Scheduling'de "Required during onboarding" anahtarı admin'e zorunlu yapma imkânı veriyor. Seçenekler: (a) anahtar kalsın (admin seçer); (b) kaldırılsın. Düşük öncelik.
