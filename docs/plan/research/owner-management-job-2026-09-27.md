# Owner için otomatik "Management" departmanı ve "Owner" işi — beyin fırtınası (2026-09-27)

Salt okunur analiz; kod yok, karar yok. Kullanıcıya sunulacak. Hazırlayan `nf-planlama`, koordinatörün görevi.
Ölçüm: `origin/main` `b4b6d02` (bu dalda `7a6cac2`); yerel DB yalnız SELECT. Kod haritası bir keşif alt ajanından, kritik satırlar elle doğrulandı.

## Kullanıcının fikri (özet)
Kurulum sihirbazının departman/iş adımında otomatik olarak **Department: Management** ve **Job: Owner** oluşur. Bu ikisi "en az 1 departman ve 1 iş ekle" kuralına sayılmaz; kişi yine 1'er tane eklemeden Next'e basamaz (bugünkü gibi) ve bu adımda bu ona söylenir. Kurulum bitince owner'ın çalışan çekmecesinde (Employees → owner → drawer) en az 1 departman ve 1 iş atanmış gelir; Schedule'da "By role" sıralamasında Management altında çıkar. Owner kurulumda eklenen bütün lokasyonlara otomatik atanır ve çekmecede görünür. **Sonradan eklenen işlere atanmaz** — her işi yapamaz, yapacağı işler ayrıca atanır.

## 1. Bugünkü kod (dosya:satır)
| Konu | Bugün | Yer |
|---|---|---|
| Sihirbazın departman/iş adımı | Adım 3; Continue yalnız en az 1 aktif departman ve 1 aktif iş varken açık. Kurulumu tamamlarken aynı kontrol tekrar. | `apps/web/src/views/OwnerOnboardingPage.tsx:197-203` (aktif satırlar = `archived_at` boş), `:666-673`, `:1399-1403` (Continue), `:748` (tamamlama) |
| Sunucudaki aynı kural | Kurulum en az 1 aktif departman + 1 aktif iş olmadan tamamlanmaz (23514) | `supabase/migrations/20260925180000_the_owner_gives_a_legal_name.sql:280-296` (`app_private.apply_owner_onboarding_update`) |
| Katalog yazımı | Sihirbaz ve Settings departman/iş satırlarını tarayıcıdan doğrudan yazıyor (API değil) | `apps/web/src/settings/organization-data.ts:316`, `:335`, `:363`, `:391` |
| Owner'ın çalışan kaydı | Kurulumda atamasız oluşur, "exclude" kapalı | aynı migration `:89` (`ensure_owner_employee_profile`), `:177` |
| Owner'ın lokasyon/iş ataması | **Kurulumda bütün aktif lokasyonlar ve bütün aktif işler** owner'a atanır; birincil yok; **departman yazılmaz** | `supabase/migrations/20260922000000_the_owner_is_an_employee_like_any_other.sql:149-190` (`open_owner_record_to_everything`, her kurulum kaydında `:350`'den çağrılır) |
| Sonradan eklenenler | **Yeni lokasyon ve yeni iş de owner'a otomatik atanır** (ekleme ve geri yüklemede tetikleyici) | `supabase/migrations/20260922020000_new_places_reach_the_owner.sql:8`, tetikleyiciler `:47-70` (`locations_reach_the_owner`, `jobs_reach_the_owner`, `…_on_restore`) — yerel DB'de canlı |
| Kaydetme kuralı | Lokasyon + iş + birincileri zorunlu; remote/exclude ya da **owner kendi kaydını düzenliyorsa** muaf | `supabase/migrations/20260922160000_only_an_owner_edits_their_own_record.sql:53-59` (22023) |
| Departman ataması | Kişiye departman atanmaz; departman işin üzerinden gelir (`jobs.department_id`, boş olabilir) | `supabase/migrations/20260817153000_organization_basics.sql:42` |
| "Sistem" katalog satırı | Departman ve işte yok (`system_key`/`is_system` kolonu yok); tek örnek `workspace_roles.system_key` | `supabase/migrations/20260817213000_roles_permissions.sql:24-36` |
| Departman arşivi | Aktif işi olan departman arşivlenemez | `organization_basics.sql:219`, `:237` |
| Schedule sıralaması | Menüde **"A-Z"** ve **"Job/Position"** var; **"By role" diye bir mod yok**. Gruplama yalnız **birincil işe** göre, departmana göre hiç yok; işi olmayan en altta **"Unassigned job"** grubunda | `apps/web/src/schedule/components/ScheduleTopBar.tsx:576-587`; `apps/web/src/schedule/lib/scheduleEmployeeSort.ts:9-27`, `:39-83`, `:107-118`; `ScheduleGridBody.tsx:258-278` |
| Exclude bayrağı | İşaretli kişi yalnız o hafta vardiyası varsa ızgarada | `scheduleEmployeeSort.ts:85-99`, `scheduleGridViewModel.ts:57` |
| Sayım/faturalama | Koltuk ya da çalışan limiti **yok**; iş/departman başına kişi sayısı Settings → Jobs'ta gösteriliyor | `organization_job_counts_service` (`20260909040000_jobs_department_bulk_assignments.sql:221`), `apps/web/src/settings/JobsSettingsPage.tsx:91-95` |

**Bugünün yan etkisi:** owner'ın birincil işi yok, bu yüzden Schedule → sıralama "Job/Position" seçilince owner en alttaki **"Unassigned job"** grubuna düşüyor. Fikrin çözmek istediği şeylerden biri büyük ihtimalle bu.

## 2. Fikir S4 ve bugünkü kodla nerede çelişiyor, nerede tamamlıyor
- **Çelişki — "her işi yapabilir mi?"**
  - S4 (bugün verildi): "owner bütün lokasyonlarda ve bütün pozisyonlarda, **ataması olmasa da** çalışabilir."
  - Fikir: "sonradan eklenen job'lara **atanmaz**, yani **her job'ı yapamaz**; yapılacak job'lar ayrıca atanmalıdır."
  - Bugünkü kod: owner'a her iş otomatik atanıyor, yenileri de (`jobs_reach_the_owner`). Yani bugün S4'e yakın.
  - İkisi aynı anda doğru olamaz: ya owner atanmadığı bir işe (ör. sonradan eklenen "Barista") vardiyaya yazılabilir, ya yazılamaz.
- **Tamamlayan — gösterim:** fikir, owner'ın çekmecesinde bir departman ve iş (Management/Owner) görünmesini ve By-role sıralamasında yerinin belli olmasını istiyor; S4 bunu açık bırakmıştı. Bu kısım çelişmiyor, S4'ün açık ucunu kapatıyor.
- **Tamamlayan — lokasyonlar:** fikir "kurulumdaki bütün lokasyonlara otomatik atanır, çekmecede görünür" diyor; bugün de öyle. Sonradan eklenen lokasyon için fikir sessiz (bugün otomatik ekleniyor; S4 "bütün lokasyonlarda çalışabilir" ile uyumlu).
- **Kavram farkı — "By role":** uygulamada bu mod **"Job/Position"** ve **işe göre** grupluyor, departmana göre değil. Fikirdeki "Management altında" departmana göre gruplamayı ima ediyor; bugünkü modda owner "Owner" iş grubunda görünür, "Management" başlığı görünmez.

## 3. Etkilenen kurallar ve riskler
| Konu | Soru / risk | Not |
|---|---|---|
| Silme / arşiv | Management ya da Owner silinirse owner "Unassigned job"a düşer; kural ürünün | Korunacaksa korumanın **DB'de** olması gerekir: katalog tarayıcıdan doğrudan yazılıyor (`organization-data.ts`), yalnız ekranı gizlemek yetmez |
| Yeniden adlandırma | "Owner" yerine "Owner / GM" yazmak isteyen olabilir | Adı değişse de "sistem" kimliği kalmalı (`workspace_roles.system_key` kalıbı) |
| Başka kişiye atama | Owner işini ikinci bir kişiye (ör. ortak, genel müdür) atamak serbest mi | Serbestse "Owner" adı yanıltır; yasaksa özel kural |
| Sayaç ve Next kuralı | Sihirbaz (`OwnerOnboardingPage.tsx:197-203`) ve sunucu (`…legal_name.sql:280-296`) "aktif satır" sayıyor; sistem satırları iki yerde birden hariç tutulmalı, yoksa Next hemen açılır | Adımda açıklama metni: "Management and Owner are added for you; add at least one department and one job of your own." |
| Tek owner / sahiplik devri | Workspace'te tek owner var (son owner'ın kaldırılmasını engelleyen tetikleyici; devir akışı var). Devirde Owner işi yeni owner'a geçmeli, eskisinden kalkmalı | Devir akışına bir adım daha |
| Departmanın işi | Management'ın içinde yalnız Owner mı olur, kullanıcı oraya "General manager" ekleyebilir mi | Eklenebilirse Management sıradan bir departman gibi davranır; arşiv kuralı (`organization_basics.sql:219`) zaten Owner aktifken arşivi engeller |
| Settings → Jobs sayıları | Owner işi listede "1 employee" ile görünür | Gizlensin mi, görünsün mü |
| Belgeler (FB-6.6) | İşe bağlı belge tanımı "Owner" işine atanırsa | Owner zaten zorunlu belgelerden muaf (`z_owner_documents_arrive_excused`); çelişki yok ama hedef listesinde görünür |
| Vardiya kartı / dışa aktarma | Owner'ın vardiyası hangi işle yazılır: "Owner" mı, yaptığı iş mi (ör. "Cashier") | Owner işi yalnız gruplama için mi, vardiyada da seçilebilir mi |
| Faturalama / raporlar | Koltuk limiti yok; etki yok | İleride koltuk sayılırsa owner'ın sayılıp sayılmayacağı ayrı soru |
| Mevcut workspace'ler | Canlı veri yok; yerel veri yeniden kurulur (CLAUDE.md §9) | Geriye uyumluluk dalı yazılmaz |
| Bağımlılık | Değişiklik FB-6.2 (çalışan kaydı) ve FB-6.8 (Settings/katalog, tarayıcı yazma izinleri) alanlarına düşüyor | Uygulama sırası: FB-6.2 içinde ya da hemen sonrası |

## 4. Karar listesi (kullanıcıya; önerilen ilk)
**D1 — Management/Owner katalogda gerçek bir kayıt mı?**
- (a) **(Önerilen)** Evet, **korunan sistem kaydı:** kurulum iki satırı otomatik oluşturur; silinemez ve arşivlenemez, adı değiştirilebilir; Next sayımına ve "en az 1" kuralına girmez; yalnız owner'a atanır, sahiplik devrinde yeni owner'a geçer. Örnek: Mert kurulumda "Kitchen" departmanı ve "Cook" işi ekler; Settings → Jobs'ta ayrıca kilitli "Management → Owner" görünür.
- (b) Kayıt yok, **sanal grup:** katalog değişmez; Schedule → Job/Position'da owner en üstte "Owner" başlıklı ayrı grupta, çekmecede "Owner" rozeti. En az iş; ama çekmecede atanmış bir departman/iş görünmez (fikrin bir parçası karşılanmaz).
- (c) Otomatik ama **sıradan kayıt:** kurulum oluşturur, sonra her satır gibi silinir, arşivlenir, başkasına atanır. Kolay; ama silinince owner yine "Unassigned job"a düşer.

**D2 — Owner'ın hangi işlerde çalışabileceği (S4 ↔ fikir çelişkisi)**
- (a) **(Önerilen)** **Yapabilmek ≠ atanmış olmak:** owner her işe vardiyaya yazılabilir (S4 kalır); çekmecede ise yalnız "Owner" ve kurulumda seçilen işler görünür, sonradan eklenen işler otomatik eklenmez (fikir). Bugünkü `jobs_reach_the_owner` tetikleyicisi kalkar; owner'ın vardiya yazımı iş atamasına bakmaz. Örnek: Ayşe (müdür) owner'ı yeni "Barista" işine yazabilir; owner'ın çekmecesinde Barista görünmez.
- (b) **Fikir tamamen:** owner yalnız atandığı işlerde çalışır; Barista'ya yazmak için önce çekmeceden atanır. S4'ün "ataması olmasa da" kısmı değişir.
- (c) **S4 tamamen (bugünkü davranış):** owner her işe otomatik atanır, yeni işler de; çekmece hepsini gösterir.

**D3 — Sonradan eklenen lokasyon owner'a otomatik atansın mı?**
- (a) **(Önerilen)** Evet (bugünkü `locations_reach_the_owner`, S4 ile uyumlu); çekmecede görünür.
- (b) Hayır; yalnız kurulumdaki lokasyonlar, yenisi elle.

**D4 — Schedule sıralamasında owner nerede?** (Schedule → üst çubuk → sıralama)
- (a) **(Önerilen)** "Job/Position" modu owner'ı "Owner" iş grubunda, **grupların en üstünde** gösterir; departmana göre yeni mod yok. "By role" adı ekranda yok; gerekirse menü adı ayrıca konuşulur.
- (b) Yeni "By department" modu: Management en üstte, altında Owner.
- (c) Owner hiçbir modda gruplanmaz, en üstte tek başına.

**D5 — Owner işi başkasına atanabilir mi?**
- (a) **(Önerilen)** Hayır; yalnız owner'da, devirle taşınır. Genel müdür için kullanıcı Management'a kendi "General manager" işini ekler.
- (b) Evet, isteyen herkese atanabilir.

## 5. Rol oturumlarına soru
Koordinatör kısa soru sormaya izin verdi; sormadım. Kod haritası yeterli ve D1–D5 ürün kararı; teknik yol (sistem satırı için `system_key` + DB tetikleyicisi, `workspace_roles` kalıbı) karar verildikten sonra `nf-db`'nin görev dosyasında sorulur. Arayüz tarafında sihirbazın açıklama metni ve çekmece gösterimi D1–D2 cevabına bağlı; `nf-arayuz` o zaman DEV'de varyant hazırlar.
