# REF-OB-001 Referans uygulamanın onboarding lokasyon + departman/görev adımlarının denetimi

Status: active
Session: "Audit reference onboarding location and job steps" (local_a643f440)   Branch: claude/confident-visvesvaraya-3b327e   Worktree: .claude/worktrees/confident-visvesvaraya-3b327e   DB: dokunulmaz (paylaşımlı local DB)   Port: -
Öneri: Opus 5, high. (Oturum zaten claude-opus-5 / effort=max ile açılmış; `set_session_model`/`set_session_effort` bir oturumun kendisini değiştirmesini reddediyor, değişiklik gerekmedi.)
Koordinatör: local_57e31a55

Goal: Eski (referans) uygulamanın kurulum sihirbazındaki lokasyon ve departman/görev adımlarını uçtan uca çıkarıp, yeni uygulamanın `OwnerOnboardingPage` adım 2 ve adım 3'ü için somut bir yerleşim önerisi ve tıklanabilir bir mockup üretmek. **Bu task'ta kod yazılmaz.**

## İki depo

- **Referans (ESKİ, SALT OKUNUR):** `C:\Users\TheWe\newfork` — React + Tailwind/shadcn. Tek satır değiştirilmez, dev server başlatılmaz, testi koşulmaz. Kendi Supabase projesine bağlı, o proje dokunulmaz.
- **Hedef (YENİ, çalıştığımız):** `C:\Users\TheWe\Documents\Codex\newfork-clean` — React + düz CSS, token tabanlı. Sihirbaz: `apps/web/src/views/OwnerOnboardingPage.tsx`, dört adım. Adım 2 lokasyonlar, adım 3 departman ve görevler.

## Okuma kapsamı (referans)

- `apps/web/src/features/onboarding/`: `SetupWizard.tsx`, `StepRestaurantLocations.tsx`, `StepDepartmentsJobs.tsx`, `StepTeam.tsx` + testleri.
- `apps/web/src/features/jobs-departments/`: `DepartmentEditor.tsx`, `JobsDepartmentsCatalog.tsx`, `components/`, `hooks/`, `lib/`, `types.ts`.
- `apps/web/src/features/owner-setup/OwnerSetupProgress.tsx`.
- `apps/web/src/routes/settings/jobs.tsx` ve `locations.tsx` — yalnızca karşılaştırma için.

## Altı odak

1. Birden çok lokasyon ekleme; eklenmiş birini düzenleme ve silme.
2. Eklenmiş lokasyonlar arasında gezinme: sayfa/adım mantığı, buton yerleşimi, ileri-geri davranışı, animasyon ve geçişler.
3. Birden çok departman ve görev ekleme; eklenenleri listeleme, düzenleme, silme.
4. Bir görevi bir departmandan başkasına taşıma.
5. Boş durumlar, doğrulama, hata metni, klavye davranışı.
6. Genel UI/UX dili: hiyerarşi, gruplama, bilgi yoğunluğu.

## Kullanıcının adlandırdığı problem

Görev/departman adımında, yeni görev için departman seçen dropdown **zaten eklenmiş departman ve görevlerin ortasında** çıkıyor. Orada kullanılabilir değil. Rapor buna somut bir yerleşim önermek zorunda: form nerede, liste nerede, seçim nasıl yapılır.

## Kısıtlar

- Referans depo SALT OKUNUR. Hedef depoda da **bu task'ta kod yazılmaz**. Çıktılar: bu task dosyası, rapor, mockup.
- Yeni uygulamanın tasarım dili bağlayıcı: `apps/web/src/shell/prebiz/PreBiz.tsx` + `prebiz.css` kiti, yalnız `--theme-*` token'ları (gerçek değerler `apps/web/src/styles.css`'ten okunur — token adı uydurulmaz, birçoğu yok), tek açık tema. Global `.secondary-button` kuralına dokunulmaz.
- Buton dili: ekran başına tek yeşil birincil aksiyon, vazgeçme beyaz, destructive iki tık (`packages/ui` `ConfirmButton`).
- Kullanıcıya görünen sözlük (2026-09-20 kararı): **workspace** ve **team**. "business" geri alındı. Kod ve veritabanı adları değişmez.
- Yalnızca onboarding adımları. Settings rotaları taşınmaz, yeniden düzenlenmez.

## Eşgüdüm

Hedef depoda iki başka oturum kod yazıyor. Bu task kod yazmadığı için çakışma yok — ama `docs/plan/tasks/REF-OB-001.md` dışında hiçbir şey düzenlenmez, `supabase db reset` koşulmaz, migration uygulanmaz. Local DB paylaşımlı ve kullanıcının kendi dev verisini tutuyor.

## Çıktılar

1. Envanter tablosu: her ekran, bileşen ve etkileşim, `file:line` ile.
2. Davranış yazımı: her aksiyon ne yapıyor (ekle / düzenle / sil / taşı / sırala), doğrulama kuralları, boş ve hata durumları.
3. UI/UX eleştirisi: ne hantal ve neden, madde madde.
4. Göç önerisi: yeni uygulamanın adım 2 ve adım 3'ü için somut yerleşim; dropdown probleminin çözümü; prebiz kitinden nasıl kurulacağı; hangi parça yeniden kullanılır, hangisi sıfırdan yazılır.
5. Etkileşimli mockup: gerçek token'lar, açık tema, tıklanabilir. En az 2 lokasyon, en az 2 departman ve birkaç görev dolu. Yeni sekmede açılmalı ve gezilebilmeli. Artifact olarak yayımlanır, link koordinatöre verilir.
6. Taşınamayanlar ve riskler: referans Tailwind/shadcn, yeni düz CSS. Hangi etkileşim olduğu gibi taşınamaz, yerine ne gelir.

## Done when

- Altı odağın her biri `file:line` kanıtıyla yanıtlanmış.
- Dropdown problemine gerekçeli, somut bir yerleşim önerisi var.
- Mockup açılıyor ve içinde veriyle gezilebiliyor.
- Referans depoda `git status` temiz — hiçbir şey değişmemiş — ve bu doğrulandığı söylenmiş.
- Rapor koordinatöre ulaşmış (`send_message` → local_57e31a55).

## Rapor

Bitince koordinatör oturumuna mesaj: ne bulundu, ne öneriliyor, kullanıcının vermesi gereken kararlar (ayrı liste — koordinatör bunları çoktan seçmeli soracak), mockup linki.

---

# RAPOR (2026-09-21)

Mockup: https://claude.ai/artifact/1tqjthXstKrm3DStTePSsa

Kısaltmalar: **REF** = `C:\Users\TheWe\newfork` (salt okunur), **YENİ** = bu depo.

## 1. Envanter

### 1.1 Referans sihirbaz iskeleti

| Ne | Nerede | Not |
|---|---|---|
| Sihirbaz kabuğu | `REF apps/web/src/features/onboarding/SetupWizard.tsx:463-481` | `max-w-3xl`, sol altta sabit "Sign out". Yan panel yok. |
| Adım anahtarı | `SetupWizard.tsx:18,164` | Üç adım (`1｜2｜3`), ama gösterge dört nokta: `:416` `step===1 ? locationDisplayStep : step+1`. Adım 1 kendi içinde ikiye bölünüyor. |
| Adım göstergesi | `SetupWizard.tsx:483-501` | Dört nokta + "Step N of 4". Tıklanamaz, yalnız gösterge. |
| Adımlar mount kalıyor | `SetupWizard.tsx:424,437,447` | `hidden={step !== N}`. İleri-geri taslağı kaybetmiyor. |
| İlerleme kaydı | `SetupWizard.tsx:271-296` | Her geçişte `PATCH /onboarding/progress`. Geri gitmek de sunucuya yazıyor (`:317-334`). |
| "Kurulum senin işin değil" | `SetupWizard.tsx:202-203, 362-379` | 403, "workspace yok" ile karıştırılmıyor. YENİ'de karşılığı yok. |

### 1.2 Lokasyon adımı (REF)

| Ne | Nerede |
|---|---|
| Taslak tipi (saved*/synced* üçlemesi) | `StepRestaurantLocations.tsx:23-46` |
| Adres doğrulaması (API'nin şeması) | `:175-197` (`locationAddressSchema`) |
| Zaman dilimi tahmini + IANA kontrolü | `:60, 102-110` |
| "Add location" koşulu | `:266-270` |
| "Next" koşulu | `:274` — isim + adresi tam ≥1 lokasyon |
| Kaydet → yeni boş sayfa aç → ona atla | `:332-376` (özellikle `:364-375`) |
| Sil (kayıtlıysa `POST /locations/{id}/archive`) | `:382-414` |
| İsim kaydı, iyimser + geri alma | `:416-439` |
| Next'te toplu POST/PATCH | `:457-535` (`:500-505`) |
| Organizasyon adı alt-sayfası | `:550-591`, Enter ile ilerleme `:557-568` |
| Lokasyon kartı | `:610-758` |
| Enter zinciri name→street→city→kaydet | `:623-628, 642-647, 660-668` |
| State seçici (native `select` + ikon) | `:676-699` |
| Numaralı sayfalayıcı | `:766-860`, sayfa düğmeleri `:799-820` |
| 3 yuvalı pencere hesabı | `:62, 91-100` |

### 1.3 Departman/görev adımı (REF)

| Ne | Nerede |
|---|---|
| Adım gövdesi | `StepDepartmentsJobs.tsx:298-342` |
| İşlem sözlüğü (create/rename/move/reorder/delete) | `:23-31` |
| Taslak → tek transaction diff'i | `:179-266`, gönderim `:268-296` |
| "Next" koşulu | `:129` — ≥1 departman **ve** departmanı olan ≥1 görev |
| Yeni departman eklenince son sayfaya atlama | `:149-159` |
| Numaralı sayfalayıcı (departmanlar) | `:346-460` |
| Editörün sihirbaz modu | `:319-341` — `activeDepartmentId`, `showInputCard={false}` |
| **Sihirbazda tek departman kartı görünür** | `DepartmentEditor.tsx:85-88` |
| Departman ekleme girdisi + buton | `DepartmentEditor.tsx:298-334` |
| Virgülle çoklu ekleme | `DepartmentEditor.tsx:283-293`, `components/CommaInput.tsx:48-68` |
| Boş durum kartı | `DepartmentEditor.tsx:357-362` |
| Departman kartı + satır içi yeniden adlandırma | `:371-492`, `:379-400` |
| Görev girdisi departman kartının **başlığında** | `:434-489` |
| Görev çipleri girdinin **altında** | `:448-474`; boşsa "No jobs in this department yet." `:467-473` |
| Çip menüsü (Rename / Delete / **Move to**) | `components/JobChip.tsx:80-143`, taşıma `:120-141` |
| Cascade silme diyaloğu | `components/CascadeDeleteDialog.tsx:49-201`, iki radyo `:59-108` |
| Taslak mutasyonları | `hooks/useDepartmentEditorState.ts:24-133` |
| Ad normalizasyonu (departman BÜYÜK, görev Cümle) | `lib/parseCommaInput.ts:8-10, 17-21` |
| Otomatik renk | `lib/deptColors.ts:27-31` |
| Gereklilik rozeti ("N added" / "1 required") | `OnboardingRequirementStatusChip.tsx:13-26` |

### 1.4 Settings karşılaştırması (REF, yalnız kıyas)

| Ne | Nerede | Kıyas değeri |
|---|---|---|
| Katalog (rail + board + context panel) | `JobsDepartmentsCatalog.tsx:89-685` | Sihirbazdan tamamen farklı bir model |
| **Yeni görev için departman seçici bir çekmecede** | `:824-906`, seçici `:852-892` | Form kendi panelinde; listenin içinde değil |
| Var olan görevin departmanını değiştirme | `:1456-1480` (`InspectorBlock` "Department") | Taşıma, **kaydın kendi** panelinde |
| "Open / unassigned" kovası | `:44, 1467, 2095-2098` | Departmansız görev birinci sınıf durum |
| Departman sırası düğmeleri | `:1938-1960` | Sürükleme yok, iki ok düğmesi |
| Sayfa yalnızca kataloğu mount ediyor | `routes/settings/jobs.tsx:17, 27` | |
| Lokasyon ayarları | `routes/settings/locations.tsx` (2023 satır) | Sihirbazla ortak bileşen yok |

### 1.5 Yeni uygulamanın bugünkü hali

| Ne | Nerede |
|---|---|
| Sihirbaz (dört adım, tek dosya) | `apps/web/src/views/OwnerOnboardingPage.tsx:100-969` |
| Yan panel: marka, ilerleme, adım listesi, çıkışlar | `:542-625` |
| Adım 2 gövdesi | `:707-766` |
| Adım 3 gövdesi | `:768-874` |
| **Departman seçici** | `:788-808` |
| Yeni departman alanı (seçicinin `""` seçeneğine bağlı) | `:809-823` |
| "Jobs added" düz listesi | `:824-829` |
| "Job or role" alanı | `:830-840` |
| Departman+görev tek kayıtta | `:345-397` |
| `jobDepartmentId`'yi ilk departmana çeken tazeleme | `:201-210` |
| Arşivleme (tek silme yolu) | `:212-237` |
| `AddedList` (boşsa `null`) | `:1298-1330`, `:1309` |
| Lokasyon alanları (dokuz alan, düz) | `:999-1146` |
| Ham renk sabitleri | `:97-98` |
| Kit: `WizardBar` / `Section` / `BusinessRow` | `apps/web/src/shell/prebiz/PreBiz.tsx:74-102, 124-141, 144-181` |
| Kit CSS | `apps/web/src/shell/prebiz/prebiz.css:7-14, 137-189, 215-267, 379-382, 403-431` |
| Token'lar | `apps/web/src/styles.css:3-28` |
| Onboarding form CSS | `apps/web/src/styles.css:11013-11063, 11164` |
| İki tık onay | `packages/ui/src/components/ConfirmButton.tsx:6, 10-43` |

## 2. Davranış — altı odak

### Odak 1: Birden çok lokasyon; düzenleme ve silme (REF)

- **Ekleme.** Form her zaman tek bir lokasyon gösterir. "Add location" (`StepRestaurantLocations.tsx:715-723`) o sayfayı `confirmed` yapar, **listenin sonundaysa yeni bir boş sayfa ekler** ve ona geçer (`:364-375`). Yani "ekle" = "kaydet ve bir sonraki boş forma geç".
- **Düzenleme.** Kayıtlı bir lokasyona sayfalayıcıyla dönülür, alanlar değiştirilir, "Add location" yeniden basılır. Düğmenin yazısı değişmez — kaydederken de eklerken de "Add location" yazar. `canSaveActiveLocation` (`:266-270`) değişiklik yoksa düğmeyi kapalı tutar.
- **Silme.** `removeLocation` (`:382-414`). Sunucuda varsa `POST /locations/{id}/archive` (`:392`), yoksa yalnız yerelden düşer. Son lokasyon silinince yerine boş bir sayfa konur (`:404-407`) — liste hiçbir zaman gerçekten boşalmaz. **Onay yok**, tek tık siler.
- **Kalıcılık.** "Next"e basılana dek hiçbir lokasyon POST edilmez (`:457-535`). Değişmemiş `synced` satırlar atlanır (`:467-477`), `syncedLocationId` varsa PATCH, yoksa POST (`:500-505`).

### Odak 2: Lokasyonlar arası gezinme

- Model: **sayfa başına bir kayıt**. Altbilgide sol tarafta "Organization" geri düğmesi, **ortada numaralı sayfalayıcı**, sağda "Next" (`:766-860`).
- Sayfalayıcı en çok 3 numara gösterir (`:62`), pencere aktif sayfayı ortalar (`:91-100`), uçlarda kayar. Oklar `disabled` olur (`:792-797, 822-832`).
- Aktif sayfa düğmesi `pointer-events-none` (`:814`) — kendine tıklanamıyor.
- **Animasyon ve geçiş yok.** Sayfa düğmelerinde açıkça `transition-none` (`:813`). Adımlar arası da geçiş yok: `SetupWizard` adımları `hidden` ile saklıyor (`:424`). Tek hareket `Loader2`'nin dönmesi ve `StepIndicator`'ın renk geçişi (`:491`).
- Aynı model departmanlarda (`StepDepartmentsJobs.tsx:346-460`) ve ekipte (`StepTeam.tsx:796-860`) birebir tekrarlanıyor. Üç adım, tek etkileşim fikri.

### Odak 3: Departman ve görev ekleme, listeleme, düzenleme, silme (REF)

- **Departman ekleme.** Tek girdi; Enter veya "Add department" (`DepartmentEditor.tsx:305-333`). Virgül yazmak da işler (`:283-293`): "Bar, Kitchen," iki departman yapar. Adlar BÜYÜK HARFE çevrilir (`parseCommaInput.ts:8-10`), aynı ad ikinci kez eklenmez (`useDepartmentEditorState.ts:26-31`).
- **Listeleme.** Sihirbazda **aynı anda yalnız bir departman kartı** görünür (`DepartmentEditor.tsx:85-88`); diğerleri sayfalayıcının arkasında. Kartın içinde o departmanın görevleri çip olarak.
- **Görev ekleme.** Her departman kartının başlığındaki girdi (`:434-489`). Enter veya "+Add Job". Virgül **kapalı** (`commitOnComma={false}`, `:447`), blur'da commit de kapalı (`:446`) — departmanlardan farklı davranıyor.
- **Düzenleme.** Departman adı: kalem ikonu → satır içi girdi (`:379-400`), Enter/blur kaydeder, Escape iptal. Görev adı: çipin adına tıkla → satır içi girdi (`JobChip.tsx:53-79`).
- **Silme.** Departman: çöp ikonu. Görevi yoksa doğrudan siler (`DepartmentEditor.tsx:172-183`); varsa cascade diyaloğu açılır. Görev: çip menüsünden "Delete"; sihirbaz modunda diyalogsuz siler (`:228-231`).
- **Kalıcılık.** Adım boyunca hiçbir şey yazılmaz. "Next"te taslak ile baseline karşılaştırılıp tek bir `POST /jobs-departments/transaction` çıkar (`StepDepartmentsJobs.tsx:179-296`).

### Odak 4: Bir görevi başka departmana taşıma

- **Tek yol:** çipin `⋮` menüsü → "Move to" başlığı altında diğer departmanların listesi (`JobChip.tsx:120-141`). Sihirbazda bu yalnız `jobs` dizisindeki `department_id`'yi değiştirir (`useDepartmentEditorState.ts:125-133`); "Next"te `move_job` işlemine dönüşür (`StepDepartmentsJobs.tsx:252-254`).
- Sürükle-bırak yok. "Unassigned"a taşıma sihirbazda yok (yalnız Settings'te, `JobsDepartmentsCatalog.tsx:1467`).
- **Sihirbazda ciddi bir tuzak:** menü yalnız aktif departmanın kartında görünür, ve kart görünür olmak için sayfalayıcıda o departmanda olmak gerekir. Yani "Kitchen'daki Server'ı FOH'a taşı" için önce Kitchen sayfasına gitmek gerekiyor; görev nerede olduğunu görmeden taşınamıyor.

### Odak 5: Boş durumlar, doğrulama, hata metni, klavye

**Boş durum.**
- Lokasyon: "Add at least one location to continue. You can add more later." yalnız hiç kayıtlı lokasyon yokken (`StepRestaurantLocations.tsx:602-606`). Ayrıca "N added" / "1 required" rozeti (`OnboardingRequirementStatusChip.tsx:25`).
- Departman: "No departments added yet" kartı (`DepartmentEditor.tsx:357-362`) — ama sihirbaz bunu `hideEmptyStateMessage` ile **kapatıyor** (`StepDepartmentsJobs.tsx:326`). Sihirbazda boş durum metni yok, yalnız rozet.
- Görev: departman kartı içinde "No jobs in this department yet." (`DepartmentEditor.tsx:467-473`).

**Doğrulama.**
- Adres kuralları API'nin Zod şemasından okunuyor (`StepRestaurantLocations.tsx:175-193`) — sihirbaz sunucu sözleşmesinden sapamaz. İyi bir fikir.
- Alan hataları hesaplanıyor ama **hiçbir yerde gösterilmiyor**: `activeAddressErrors` (`:265`) yalnız düğmeyi kapatmak için kullanılıyor. Kullanıcı düğmenin neden kapalı olduğunu göremiyor.
- Zaman dilimi IANA kalıbına uymuyorsa sessizce `America/New_York`'a düşüyor (`:60, 102-110`).
- Departman/görev adı: yalnız boş olmama + departman içinde tekrar etmeme (`useDepartmentEditorState.ts:31, 93`). Uzunluk sınırı yok.

**Hata metni.** Tek bir `error` state'i, adımın altında kırmızı satır (`StepRestaurantLocations.tsx:764`, `StepDepartmentsJobs.tsx:344`). Lokasyon hataları hangi lokasyon olduğunu söylüyor: `Location "Downtown": ...` (`:526`). Transaction hatası ham API mesajı (`StepDepartmentsJobs.tsx:286-292`).

**Klavye.**
- Lokasyon formunda Enter zinciri: name → street → city → kaydet (`:623-628, 642-647, 660-668`). State ve ZIP zincirin dışında.
- Organizasyon adında Enter = devam (`:557-568`).
- Departman girdisinde Enter = ekle (`DepartmentEditor.tsx:310-315`); görev girdisinde Enter = ekle (`CommaInput.tsx:63-68`).
- Yeniden adlandırmada Enter kaydeder, Escape iptal eder (`DepartmentEditor.tsx:386-394`, `JobChip.tsx:60-66`).
- Yeni lokasyon sayfası açılınca ad alanına odak (`:296-303`).
- Çip menüsü Radix `Popover` — odak tuzağı ve Escape ondan geliyor.

### Odak 6: Genel UI/UX dili (REF)

- **Hiyerarşi:** `h2` adım başlığı + açıklama → `h3` bölüm başlığı + rozet → `Card` kayıt → kart içi alanlar. Üç seviye, tutarlı.
- **Gruplama:** her şey `Card`. Lokasyon kartı, departman kartı, boş durum kartı — hepsi aynı kenarlık ve yarıçap. Ayrım taşımıyor.
- **Bilgi yoğunluğu: kasıtlı olarak düşük.** Ekranda aynı anda tek kayıt. Girilenler sayfalayıcının arkasında saklı. Kullanıcı kendi yaptığı işi göremiyor.
- **Buton dili tutarsız:** "Add location" birincil (`:715`), "Add department" `bg-foreground` ile siyah (`DepartmentEditor.tsx:327`), "+Add Job" birincil (`CommaInput.tsx:92-100`), "Organization" geri düğmesi `variant="default"` yani **birincil** (`:770-780`). Bir ekranda üç-dört birincil buton.
- **Renk:** departmanlara otomatik palet rengi, kartın sol kenarında 4px şerit (`DepartmentEditor.tsx:374`), çip zemini o rengin `0f` alfası (`JobChip.tsx:30-33`).

## 3. UI/UX eleştirisi (REF)

1. **Sayfalayıcı, girilen işi saklıyor.** Üç adımın üçünde de aynı: tek kayıt görünür, gerisi numaraların arkasında (`StepRestaurantLocations.tsx:783-834`, `StepDepartmentsJobs.tsx:363-409`, `StepTeam.tsx:814-860`). Kurulum ekranının bir işi vardır: yapılanı göstermek. Bu tam tersini yapıyor.
2. **Sayfa sayısı ≠ kayıt sayısı.** Kaydedince listeye boş bir sayfa ekleniyor (`:364-375`). 2 lokasyon = 3 sayfa. "Location page 3" boş bir formu açar; kullanıcı ne olduğunu bilemez.
3. **Aynı düğme hem ekliyor hem kaydediyor.** "Add location" (`:715-723`) kayıtlı bir sayfada "değişiklikleri kaydet" anlamına geliyor, yazısı değişmiyor.
4. **Sessiz doğrulama.** Hatalar hesaplanıp atılıyor (`:265`), yalnız düğme kapanıyor. Kullanıcı hangi alanın eksik olduğunu göremiyor.
5. **Silme onaysız.** Lokasyon çöp ikonuna tek tık gider (`:729`), hem de sunucuda arşivlenir. Aynı dosyada iki özdeş dal var (`:724-756`) — biri ölü kod.
6. **"Move to" görev nerede olduğunu göremezken isteniyor.** Odak 4'teki tuzak.
7. **Virgül gizli bir yetenek.** Departmanda çalışıyor, görevde çalışmıyor (`:447`). Ekranda hiçbir şey bunu söylemiyor.
8. **Departman adları zorla BÜYÜK.** `normalizeDeptName` (`parseCommaInput.ts:8-10`). Kullanıcı ne yazarsa yazsın "FRONT OF HOUSE". Bir tercih, ama sorulmadan uygulanıyor.
9. **Görev girdisi, listesinin üstünde.** Kartın başlığında girdi, altında çipler (`DepartmentEditor.tsx:434-474`). Yeni eklenen her görev girdinin altında birikiyor; okuma yönü ters.
10. **İki birincil renk aynı ekranda.** Geri düğmesi `variant="default"` (`:770-780`) — geri gitmek, ilerlemek kadar baskın.
11. **Adım sayısı yalan söylüyor.** Üç adım var, gösterge dört diyor, çünkü adım 1 kendi içinde ikiye ayrılıyor (`SetupWizard.tsx:416`).
12. **Hiçbir geçiş yok.** `transition-none` (`:813`) + `hidden` (`:424`). Sayfa zıplıyor; kullanıcı nereye gittiğini konumdan değil, numaradan anlıyor.

## 4. Göç önerisi

### 4.1 Dropdown problemi — teşhis

YENİ `OwnerOnboardingPage.tsx:781-841`, tek bir `.owner-onboarding-grid` içinde DOM sırası:

```
1  AddedList "Departments added"      :782-787
2  select "Department for this job"   :788-808   <-- form alanı, listenin ortasında
3  (koşullu) "New department" girdisi :809-823
4  AddedList "Jobs added"             :824-829
5  "Job or role" girdisi              :830-840
```

Üç ayrı hata üst üste binmiş:

- **(a) Form kendi çıktısıyla iç içe.** İki kayıt listesi ve üç form alanı sırayla diziliyor. Seçici beşin ikincisi — kelimenin tam anlamıyla ortada. Hiçbir şey formun nerede başlayıp listenin nerede bittiğini söylemiyor.
- **(b) Seçici iki iş birden yapıyor.** Hem "bu görev hangi departmanda" değeri, hem `""` seçeneğiyle (`:805`) formun şeklini değiştiren bir kip anahtarı. Altındaki alanları doğuran bir `select` değer seçici değil, kılık değiştirmiş bir moddur.
- **(c) Bağımlı alan, bağlı olduğu alandan bir liste uzakta.** `job-department` (`:789`) ile `job-name` (`:830`) arasında bütün "Jobs added" listesi var. Departmanı seç, listeyi geç, sonra adı yaz.

Aynı dosyada bunlara eşlik eden gerçek kusurlar:

- **(d)** `refreshOwnerReferences` her kayıttan sonra `jobDepartmentId`'yi **ilk** departmana çekiyor (`:201-210`). Yeni departman ekle → seçici birinciye geri zıplar → sıradaki görev sessizce yanlış departmana düşer.
- **(e)** Departman tek başına eklenemiyor: `saveDepartmentAndJob` her zaman `saveJob` çağırıyor (`:345-397`). Her departman yanında bir görev taşımak zorunda.
- **(f)** "Jobs added" düz (`:824-829`); hangi görevin hangi departmanda olduğunu göstermiyor. İki departmanda iki "Server" ayırt edilemez.
- **(g)** Yeniden adlandırma yok. `AddedList` yalnız Remove veriyor (`:1313-1325`). Yazım hatası = sil ve baştan yaz.
- **(h)** Taşıma yok. Kurulum sırasında bir görevin departmanı değiştirilemiyor.
- **(i)** Boş durum yok. `AddedList` boşken `null` dönüyor (`:1309`); ilk departmandan önce adım üç alandan ibaret.

### 4.2 Kural

> **Form bir blok, liste başka bir blok. Asla iç içe geçmezler.**
>
> Listenin içindeki bir dropdown, **satıra ait olduğunda** doğrudur. **Forma ait olduğunda** yanlıştır.

Bu ikinci cümle hem problemi hem çözümü tanımlıyor: bugünkü seçici forma ait ama listede duruyor. Önerilen çipteki "Move to" seçicisi listede duruyor ama satıra ait — o yüzden orada olması doğru.

### 4.3 Adım 3 — önerilen yerleşim

```
What jobs do people work?
A job is what someone is scheduled as. A department groups jobs that work together.

YOUR STRUCTURE                              [2 departments · 5 jobs]
+--------------------------------------------------------------+
| Front of house            [3 jobs] [Rename] [Remove]         |
|   (Server v) (Host v) (Bartender v)                          |
+--------------------------------------------------------------+
| Kitchen                   [2 jobs] [Rename] [Remove]         |
|   (Line cook v) (Dishwasher v)                               |
+--------------------------------------------------------------+

ADD A JOB                    The department sits beside the job it belongs to.
+- Department -----------+   +- Job or role ------------------+
| Front of house       v |   | Server                         |
+------------------------+   +--------------------------------+
Missing a department? Use "New department" below.

< Locations            [+ New department] [+ Add job] [Continue >]
```

Madde madde:

- **(a) Liste, görevleri departmanının altında gruplar.** Tek `pb-list`, departman başına bir satır, görevler o satırın içinde çip. Kurulan yapı, yapı olarak gösteriliyor. İki düz `AddedList` yerine bir gruplu liste.
- **(b) "Add a job" formu tek satır, listenin altında, asla içinde.** Departman seçici ile görev adı **yan yana** — `.owner-onboarding-grid`'in iki sütunu (`styles.css:11021-11025`), ikisi de `.wide` değil. Seçici, nitelediği alanın yanında.
- **(c) "Add a new department" seçicinin içinden çıkıyor.** `option value=""` kip anahtarı (`:805`) kalkar. Departman eklemek kendi eylemi olur: barda beyaz "New department" düğmesi, tek alanlık bir satırı açar. Departman hiç yokken o alan zaten açık gelir, seçici hiç çizilmez. Seçici böylece **yalnız gerçek departmanları** tutar.
- **(d) Kayıttan sonra seçici bulunduğu departmanda kalır.** `:201-210` düzeltilir: `jobDepartmentId` hâlâ listede varsa korunur; yeni departman yaratıldıysa **yeni olan** seçilir.
- **(e) Taşıma çipin kendi paneli.** Çipe tıklanınca o departman satırının altında, akış içinde bir panel açılır: "Job name" girdisi + "Department" seçici + Save / Remove / Close. Referansın `JobChip`'i (`JobChip.tsx:80-143`) aynı işi yapıyor — taşınmaya değer tek referans etkileşimi bu. Fark: Radix `Popover` yerine akış içi panel (bkz. §6.1).
- **(f) Boş durum kaybolmaz.** Departman yokken liste bloğu "No departments yet — Add the first one below." satırını gösterir; `AddedList`'in `null` dönüşü (`:1309`) kalkar.
- **(g) Sayaç rozeti.** "2 departments · 5 jobs" `pb-badge pb-badge-success` ile. Referansın "N added / 1 required" rozetinin (`OnboardingRequirementStatusChip.tsx:25`) yerini tutar, ama `--theme-*` ile.
- **Buton dili:** barda bir yeşil (`Continue`), iki beyaz (`New department`, `Add job`), satırlardaki `Remove` iki tık `ConfirmButton`. Adım 2 zaten bu düzende (`:746-762`) — adım 3 ona uyar.

### 4.4 Adım 2 — önerilen yerleşim

Şekil zaten doğru (liste üstte `:721-726`, form altta `:727-739`, barda beyaz "Add location" + yeşil "Continue" `:746-762`). Adım 3 bu şekle uyarlanmalı, tersi değil. Adım 2'de düzelecekler:

- **Satır tek başına yetmiyor.** `BusinessRow name={item.name}` (`:1314`) yalnız adı gösteriyor. Öneri: ada ek olarak `pb-row-meta` içinde kısa ad rozeti, şehir/bölge ve zaman dilimi. "Main" iki kere geçtiğinde ayırt edilebilsin.
- **Düzenleme yok.** Öneri: satıra "Edit" düğmesi; o lokasyonu aşağıdaki forma yükler, form başlığı "Editing Main dining room" olur, beyaz düğme "Save changes" der, yanına "Cancel" gelir.
- **Dokuz alan tek düzlemde** (`:999-1146`). Öneri: üç `fieldset` — **What the app calls it** (ad, kısa ad, zaman dilimi), **Address** (sokak, şehir, bölge, posta, ülke), **Contact** (telefon, opsiyonel). Aynı grid, üç adlandırılmış kutu.
- **Boş durum yok** (`:1309`). Aynı düzeltme.
- **Kayıttan sonra odak kayboluyor.** `locationDraftEpoch` (`:728`) alt ağacı komple yeniden kuruyor; odak `body`'ye düşüyor. Öneri: kayıttan sonra "Location name" alanına odak.
- **Kısa ad çakışması denetlenmiyor.** İki lokasyon aynı `short_name`'i alabiliyor; program bunu kurulumda söylemeli.

### 4.5 Prebiz kitinden nasıl kurulur

Olduğu gibi kullanılanlar:

| Parça | Kaynak |
|---|---|
| `.pb` kabuğu, `.pb-side`, `.pb-steps`, `.pb-stage-wide` | `prebiz.css:7-14, 49-62, 323-377, 379-382` |
| `WizardBar` (geri + hata + sağda aksiyonlar) | `PreBiz.tsx:74-102`, CSS `prebiz.css:403-431` |
| `Section` + `.pb-list` | `PreBiz.tsx:124-141`, `prebiz.css:126-142` |
| `BusinessRow` / `.pb-row` (lokasyon satırı) | `PreBiz.tsx:144-181`, `prebiz.css:144-189` |
| `.pb-badge` / `-success` / `-progress` (sayaçlar) | `prebiz.css:191-212` |
| `.pb-btn` üç rolü | `prebiz.css:215-267` — global `.secondary-button` kuralına dokunulmuyor |
| `ConfirmButton` (iki tık kırmızı) | `packages/ui/src/components/ConfirmButton.tsx:10-43` |
| `.owner-onboarding-grid` + `.wide` | `styles.css:11021-11036` |
| `.onboarding-form input/select` (44px, tokenlı) | `styles.css:11049-11063` |
| `.form-error` / `.form-success` | `styles.css:3106, 11164` |

Sıfırdan yazılacaklar — hepsi küçük, hepsi `styles.css`'in onboarding bloğunun içine:

| Parça | Ne kadar | Ne için |
|---|---|---|
| `.ob-dept-row` + `.ob-dept-head` | ~12 satır CSS | `pb-row` yatay; departman satırı dikey (başlık + çipler + panel) |
| `.ob-chips` + `.ob-chip` | ~18 satır | Görev çipi ve açık hâli |
| `.ob-job-panel` | ~14 satır | Çipin akış içi paneli (üç sütun, dar ekranda tek) |
| `.ob-fieldset` | ~10 satır | Adım 2'nin üç alan grubu |
| `.ob-form-head` | ~8 satır | Form bloğunun kendi başlığı ("ADD A JOB") |
| `.ob-empty` | ~6 satır | Liste boşken tek satır |
| React tarafı | ~120 satır | `OwnerOnboardingPage` adım 3 gövdesi + çip paneli state'i (`openJobId`) |

`packages/ui`'ye yeni bileşen gerekmiyor. Yeni token gerekmiyor — mockup'taki her renk `styles.css:3-28`'deki adlardan geliyor.

## 5. Mockup

https://claude.ai/artifact/1tqjthXstKrm3DStTePSsa

- Gerçek `--theme-*` değerleri `styles.css:3-28`'den kopyalandı; prebiz ve onboarding CSS'i birebir alındı. Tek açık tema, yeni hex yok, uydurma token yok.
- İki lokasyon (Main dining room / MAIN, Rooftop bar / ROOF) ve iki departman (Front of house: Server, Host, Bartender — Kitchen: Line cook, Dishwasher) dolu geliyor.
- İşleyen etkileşimler: lokasyon ekle / düzenle / iki tık sil, kısa ad çakışma hatası; departman ekle / yeniden adlandır / iki tık sil (kaç görev gideceğini onay yazısı söylüyor); görev ekle; çipe tıkla → adı değiştir, **departmanını değiştir**, sil; adım 2 ↔ adım 3 gezinmesi; yan paneldeki adım listesi.
- Adım 3'te **"Proposed" / "Today" anahtarı** var: "Today" bugünkü DOM sırasını (`:781-841`) aynı kitle çiziyor; seçicinin iki listenin arasında nasıl kaldığı yan yana görülüyor. Kararı vermenin en kısa yolu bu iki düğme.
- Adım 1 ve 4 kapsam dışı olduklarını söyleyen birer kart.

## 6. Taşınamayanlar ve riskler

1. **Radix `Popover` (çip menüsü)** — `JobChip.tsx:80-143`. YENİ'de portal/anchor/odak tuzağı primitifi yok. **Yerine:** akış içi açılan panel (§4.3e). Gerçek form kontrolleri olduğu için klavye ve ekran okuyucu bedava geliyor; aynı anda tek panel açık.
2. **Radix `AlertDialog` (cascade silme)** — `CascadeDeleteDialog.tsx:49-201`. YENİ'nin cevabı iki tık `ConfirmButton`. Fark: diyalog **bilgi** taşıyor (kaç görev, kaç çalışan, kaç vardiya etkilenecek), iki tık taşımıyor. Kurulumda bu zararsız — henüz kimse atanmamış, tek zarar görevlerin gitmesi. **Yerine:** onay yazısı sayıyı söyler — "Click again to remove it and 3 jobs". (Karar D3.)
3. **`Tooltip`** — `DepartmentEditor.tsx:296`. YENİ'de yok. Düşer; görünür metin kullanılır.
4. **Virgülle çoklu ekleme** — `CommaInput.tsx:48-68`. Düz JS'e taşınabilir (`parseCommaInput` 6 satır). Ama gizli bir yetenek. (Karar D2.)
5. **Ad normalizasyonu** — departman BÜYÜK, görev Cümle (`parseCommaInput.ts:8-21`). YENİ adı yazıldığı gibi saklıyor. Taşımak, YENİ'nin sözlük kararlarıyla çelişir. **Öneri: taşıma.** Yalnız baştaki/sondaki boşluk kırpılsın.
6. **Otomatik departman rengi** — `deptColors.ts:27-31` paylaşılan bir paleti dolaşıyor. YENİ tek renk sabiti kullanıyor, hem de ham hex (`OwnerOnboardingPage.tsx:97-98`). Palet taşımak `--theme-*` olmayan renkler eklemek demek. (Karar D4.)
7. **Taslak-sonra-commit mimarisi** — REF adımı bellekte tutup sonda tek `POST /jobs-departments/transaction` atıyor (`StepDepartmentsJobs.tsx:275-279`); ekleme/silme/taşımanın bedavaymış gibi hissettirmesinin sebebi bu. YENİ her satırı anında yazıyor (`:345-397`). **Risk:** önerilen her çip eylemi bir ağ turu. **Öneri:** gecikmeyi kabul et (tek küçük yazma), ama bugünkü **global** `submitting`'i (adımdaki her kontrolü kapatıyor — `:725, 786, 827, 850`) satır başına bekleyen duruma çevir. Aksi hâlde bir görevi taşırken bütün liste donuyor.
8. **Sayfa geçiş animasyonu** — REF'te zaten yok (`transition-none`, `:813`). Taşınacak bir şey yok, kaybedilen bir şey yok.
9. **`unassigned` kovası** — REF Settings'te birinci sınıf (`JobsDepartmentsCatalog.tsx:44, 1467, 2095-2098`), sihirbazda yok. YENİ'de `saveJob` `department_id: null` kabul ediyor (`:374`). Kurulumda departmansız göreve izin vermemek daha basit; öneri budur, ama Settings'in bu durumu gösterdiği unutulmamalı.

## 7. Kullanıcının vereceği kararlar

- **D1 — Kurulumda görev taşıma var mı?** (a) Çip paneli ile taşınabilsin (mockup'taki hâli). (b) Taşıma yok; yanlış giden silinip yeniden eklenir, gerçek taşıma Settings'in işi (REF Settings de öyle yapıyor, `JobsDepartmentsCatalog.tsx:1456-1480`). **Öneri: (a)** — maliyeti tek bir `select`.
- **D2 — Virgülle çoklu ekleme kalsın mı?** (a) Kalsın, ama alanın altında görünür ipucu olsun ("Ayırmak için virgül"). (b) Kalmasın; her seferinde bir kayıt. **Öneri: (b)** onboarding için — hızlı ama gizli bir yetenek, ve YENİ'de her ekleme zaten bir ağ turu.
- **D3 — Görevi olan bir departman silinince ne olur?** (a) Görevler de gider; onay yazısı sayıyı söyler ("Click again to remove it and 3 jobs"). (b) Görevler departmansız kalır (REF Settings'in önerdiği yol). **Öneri: (a)** kurulumda — henüz kimse atanmamış, ve (b) YENİ'de "departmansız görev" diye bir ekran gerektirir.
- **D4 — Departman rengi.** (a) Bugünkü tek sabit renk kalsın (`:97-98`). (b) Renkler `--theme-*`'a eklenecek küçük bir paletten gelsin. (c) Kurulumda renk hiç sorulmasın, Settings versin. **Öneri: (c) + bugünkü sabit** — kurulum ekranı renk seçtirmemeli.
- **D5 — Adım 2'de lokasyon düzenleme.** (a) "Edit" satırdan formu doldursun (mockup'taki hâli). (b) Yalnız sil-ve-yeniden-ekle (bugünkü hâl). **Öneri: (a)** — dokuz alanı yazım hatası için yeniden girmek kabul edilemez.
- **D6 — Departman adları BÜYÜK HARFE çevrilsin mi?** (a) REF gibi çevrilsin. (b) Yazıldığı gibi kalsın. **Öneri: (b).**
- **D7 — Sıra.** Bu rapor kod yazmıyor. Uygulama (i) ayrı bir task olarak mı gitsin, (ii) yoksa bu task devam mı etsin? Ayrıca adım 2 ile adım 3 tek PR mi, iki PR mi?

## 8. Doğrulamalar

- **Referans depo değişmedi.** `git -C C:\Users\TheWe\newfork status --porcelain` **temiz değil** — ama bu benden önce de böyleydi: çalışma ağacında 1416 dosyalık, bana ait olmayan bir yığın var, son commit `53892e75` (2026-08-11). Kapsamımdaki dosyalardan üçü o yığında görünüyor (`apps/web/src/features/onboarding/StepRestaurantLocations.test.tsx`, `apps/web/src/routes/settings/locations.tsx`, `locations.test.tsx`). **Bunların hiçbirine dokunmadım:** `apps/web/src` altındaki hiçbir dosyanın mtime'ı 2026-08-11'den yeni değil (`find apps/web/src -newermt "2026-09-22 06:30"` boş döndü, oturum 2026-09-22 06:36'da açıldı). Yalnız `cat`/`sed`/`grep`/Read kullanıldı; dev server başlatılmadı, test koşulmadı.
- **Hedef depoda** yalnız bu dosya (`docs/plan/tasks/REF-OB-001.md`) yazıldı. `supabase db reset` koşulmadı, migration uygulanmadı.
- **Oturum modeli/effort'u:** zaten `claude-opus-5`, `effort=max`. `set_session_model` / `set_session_effort` bir oturumun kendi ayarını değiştirmesini reddediyor ("a session must not silently re-price its own turns"), ama istenen seviyenin üstünde olduğu için değişiklik gerekmedi.
