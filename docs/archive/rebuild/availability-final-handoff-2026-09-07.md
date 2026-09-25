# Availability v2 — kontrollü duruş ve karar paketi

**Durum:** Kullanıcının son yönlendirmesiyle implementation genişletmesi durduruldu. Aktif atomik iş tamamlandı; bu teslim bir handoff'tur. Availability v2'nin tamamlandığı veya release-ready olduğu iddia edilmiyor. Commit, push, deploy, hosted migration veya production değişikliği yapılmadı.

**Goal durumu:** Durdurma talimatı ve tamamlanmış handoff sonrasında aynı devam engeli üç goal turunda sürdüğü için goal `blocked` durumuna alındı. Yeniden çalışma açık kullanıcı yönlendirmesi gerektirir. Availability implementation'ı complete işaretlenmedi; yeni implementation işi başlatılmadı.

Dosya adı başlangıç tarihini korur. Son kontroller 7 Eylül 2026 America/Los_Angeles akşamında / 8 Eylül UTC'de yapıldı. Çalışma ağacı `codex/phase-1-foundation`, HEAD `415b15f77180fbf2f7aaa1a7a9740d886c86a967`. Baştan beri geniş ve paralel dirty WIP vardı.

## 1. Başlangıç talebi ve kapsamın gelişimi

İlk talep **E2E audit, AR-GE, edge-case analizi ve brainstorming; bulguların sunulması ve ardından implementation planı** idi. Employee onboarding, uygulama içi availability, manager değişikliği/onayı/reddi, soft/hard conflict, override, Employee Drawer, saat/gün/daypart/shift-type seçimi, geçici/haftalık availability, kısmi izin kararları ve organization settings birlikte ele alınacaktı.

Kullanıcı daha sonra name-only, hours-only ve name+hours vardiyaların availability/time-off ile tutarlı çalışmasını istedi. Kesin kuralı ayrıca verdi: **Yayınlanmış Schedule, sonradan availability değiştirilerek geçersiz kılınamaz; employee atanmış shift sorumluluğundan bu yolla çıkamaz.** Ardından goal-oriented implementation'a geçilmesini ve devam edilmesini açıkça istedi. Son yönlendirme, aktif atomik işi bitirip yeni kapsam açmadan bu paketi hazırlayarak durmaktır.

Kaynaklar: [ilk audit](availability-e2e-audit-and-product-exploration-2026-09-07.md), [v2 ürün sözleşmesi ve plan](availability-shift-model-and-implementation-plan-v2-2026-09-07.md), [dilim bazlı uygulama günlüğü](availability-implementation-progress-2026-09-07.md). Günlük kronolojiktir; eski dilimlerin “henüz yok” ifadeleri o tarihin durumudur. Bu handoff son duruşun referansıdır.

## 2. Ürün kararları

| Konu | Uygulanan sözleşme | Karar durumu |
|---|---|---|
| Yayın sonrası sorumluluk | Yayınlanmış dönem availability değişikliğine kilitlidir; unpublish kilidi sessizce kaldırmaz. İzin/shift değişikliği ayrı yetkili assignment kararı ister. | Kullanıcının kesin kararı; yeniden onay istenmez. |
| Vardiya saat kaynağı | Explicit saat önceliklidir. Name-only vardiya type default saatlerinin snapshot'ını assessment referansı olarak taşır. Eksik saat/default unresolved kalır. | Implementation varsayımı; kullanıcıya sunulan referans saat dili ürün sahibi tarafından son kez değerlendirilmelidir. |
| Saat kısayolu ve type kısıtı | Lunch kısayolu saat kopyalar; aynı saatlerdeki isimsiz vardiyayı da etkiler. Ayrı Lunch kısıtı ise explicit saatler farklı olsa da Lunch'a uygulanır. | İki anlamın kullanıcıya sunulması ve isimlendirme ürün kararıdır. |
| Sahiplik | Hybrid/employee-only/manager-only politikaları; manager kapasite genişletmesi için employee teyidi veya kayıtlı görüşme kanıtı. | Hybrid varsayılanı ve kayıtlı teyidin operasyon standardı ürün sahibi kararı. |
| Onay | None/narrowing/all; ilk kayıt incelemesi ve notice days ayrı ayarlar. Pending daraltma approved saatleri değiştirmez ama yayın öncesi çözülmesi gereken kapasite bildirimi oluşturur. | Narrowing varsayılanı ve reddedilen daraltmada bildirimin nasıl kapatılacağı onaylanmalı. |
| Onboarding | Aynı canonical availability kaydı kullanılır. Mevcut initializer availability'yi optional oluşturur; optional adım görünür, zorunlu progress'e eklenmez. | Zorunlu availability toplanması/aktivasyonu bloklaması için ayrı ürün kararı gerekir; mevcut UI'da bu ayar varmış gibi kabul edilmemeli. |
| Geçici ve tarihli kayıt | Haftalık baseline, sonlu temporary pattern ve spesifik fiziksel saat overlay'leri ayrı; overlap açık replacement ister. Geçici dönem sonunda o tarihte geçerli baseline'a dönülür. | Uygulanan sözleşme; rollout öncesi karmaşık vaka kabulü tamamlanmalı. |
| İzin | Orijinal saatler ve zone/UTC çözümü immutable; kısmi karar exact cover ister. Published assignment için retain/reassign/open gibi açık disposition gerekir. İptal talebi kendiliğinden izin veya shift sorumluluğunu değiştirmez. | Disposition izinleri, bildirim dili ve legacy geçiş kararı ürün sahibiyle netleştirilmeli. |

## 3. Gerçekten implement/entegre edilen davranışlar

Bu liste uygulama günlüğü ve mevcut dosyalara dayanır; tüm dosyaların münhasır yazarlığı iddiası değildir. Paralel Shift Exchange, Line Up, onboarding ve notification işleriyle ortak noktalar vardır.

| Davranış | Kullanıcı faydası | Kanıt / ana alan |
|---|---|---|
| Kalıcı publication locks, workspace serialization, expected revision ve immutable availability sürümleri | Sonradan availability yazımıyla yayınlanmış sorumluluktan kaçış ve sessiz overwrite engellenir. | Publication-lock ve lifecycle SQL; shared availability; API service. |
| Explicit/type-default/unresolved zaman kaynağı ve default snapshot'ları | Badge görünürlüğü veya type settings değişikliği mevcut vardiyanın değerlendirme saatini sessizce değiştirmez. | Schedule time-source migration, edit/preset/copy/occupancy/hour-total entegrasyonları. |
| Canonical fiziksel availability/leave assessment, hard/soft policy, scope/reason/fingerprint kontrollü override | Manager uyarısının hangi gerçek çakışmaya dayandığı korunur; hard leave bypass edilmez. | Authoritative assessment, Schedule enforcement, reassignment guards. |
| Sahiplik, initial review, daraltma onayı, employee confirmation, manager-recorded confirmation, event/idempotency kayıtları | Employee ve manager aynı talep durumunu ve kaynağını görür; çift gönderim ve eski revizyon güvenli ele alınır. | Availability lifecycle ve ortak panel. |
| Serbest saat, unavailable-hour complement, 12h/24h, saniye, gün sonu, overnight, timezone, day/type shortcuts | Employee somut çalışma saatini girebilir; `10am`/`4pm` gibi açık AM/PM yazımları canonical saate dönüşür. | AvailabilityFields/ClockInput/day fields ve shared validation. |
| Bağımsız shift-type restrictions ve auditli custom work sınıflandırması | Saat uygunluğu Lunch kısıtını silmez; isimsiz işin türü varsayımla belirlenmez. | Type-restriction/custom-classification SQL ve Quick Editor. |
| Geçici replacement coverage, explicit seçim, dated-hour exceptions | Orta parçayı değiştirmek eski kaydın iki ucunu kaybettirmez; eski replacement'ın değiştirilmesi selefini diriltmez. | Temporary projection, dated overlay lifecycle ve picker. |
| Tarih bazlı approved physical calendar ve proposal comparison | Çalışan/manager bugün, gelecekte ve değişiklik sonrası hangi saatlerin kaldığını ayrı görür. Leave ve type kısıtları gizlenmez. | Calendar/comparison SQL/API/UI. |
| Manager request queue, deep links, draft-shift impact review | İncelenecek employee/talep bulunur; mevcut taslak etkisi görülmeden onay verilmez. | Queue, impact preview, Requests/drawer entegrasyonları. |
| Saatli ve her tarihte farklı izin talebi, kısmi approve/deny, employee-visible karar parçaları | Bir günün veya tek bir periyodun yalnızca izin verilen saatleri anlaşılır; request identity ve orijinal süre korunur. | Requested periods, partial decisions, physical counts. |
| Published-assignment disposition ve onaylı iznin kısmi/future iptal süreci | İzin kararıyla vardiyanın gerçekten ne olduğu açıktır; iptal isteği otomatik yükümlülük yaratmaz/kaldırmaz. | Disposition, cancellation ve future remainder SQL/UI. |
| Availability/leave draft navigation koruması, refetch/identity ayrımı ve query invalidation | Tab/workspace/employee geçişleri ve başarısız refresh girilen veriyi sessizce kaybettirmez. | Navigation guards, drawer/onboarding/AppShell ortak entegrasyonları. |
| Default-hour değişikliklerini mevcut gelecek named vardiyalara önizleme ve kontrollü uygulama | Manager eski/yeni saatleri ve yeniden değerlendirmeyi görür; explicit saatli vardiya yanlış değiştirilmez. | Default review/apply dialog, RPC ve iki bağlantılı yarış kontrolleri. |
| Onboarding optional navigation, async save/refresh busy guard ve stale-refetch navigation koruması | Availability adımına erişilir; kayıt sonrası ikinci gönderim veya eski onboarding verisiyle yanlış yönlenme önlenir. | Slice 30. |
| Son atomik iş: açık talepte readonly “değişecek/korunacak geçici tarihler” özeti; stored proposal replacement IDs'nin parser'da korunması | Manager/employee, kısmi değişikliği tüm temporary dönemin değişmesiyle karıştırmaz. API'den gelen seçili replacement bilgisi artık arayüzde kaybolmaz. | Slice 32; aşağıdaki son doğrulama. |

## 4. Değişiklik envanteri ve WIP ayrıştırması

[Tam dosya envanteri](availability-final-handoff-inventory-2026-09-07/README.md), [CSV](availability-final-handoff-inventory-2026-09-07/inventory.csv), [JSON/durum/hash snapshot](availability-final-handoff-inventory-2026-09-07/inventory.json). JSON tüm dirty dosyaları kapsar; README ilişkili adayları listeler. İlk genişletilmiş snapshot 1.386 dosya / 402 ilişkili aday içeriyordu; teslim dokümanları eklendikçe son sayı JSON'da yenilenir. Bunlar **patch sahipliği sayısı değildir**.

- Dedicated availability modülleri, shared schemas, testler ve proof dokümanları ilişkili adaydır. Başka session katkısı olmadığını yalnızca klasör adına bakarak söylemek mümkün değildir.
- AppShell, EmployeeDrawer, EmployeeOnboardingPage, EmployeeHub, ScheduleGrid/QuickEditor/preset/copy/read/write, Requests, settings, shared index, API registration, notification/Line Up/Shift Exchange dosyaları **ortak WIP** kabul edilmelidir. Dosyanın tamamını stage etmek güvenli bir ayrıştırma değildir.
- Migration listesi envanter README'sinde tam adlarıyla yer alır. Availability dilimlerinde kayıtlı ileri migration'lar ile paralel Shift Exchange bağımlılıkları ayrı işaretlidir. `20260909007001` uygulaması paralel entegrasyonla paylaşılmıştır. Bu session'ın yeni son atomik işinde migration yoktur.
- Kesin son atomik katkı: yeni `TemporaryAvailabilityReplacementReview.tsx`, aynı adlı test, `availability-request-replacements.test.ts`; AvailabilityPanel'de import + request-history/decision-review mount noktaları + manager integration testi; `availabilityRequestSchema.proposal` için yalnızca stored replacement IDs'yi koruyan `safeExtend`. Command seçim alanı top-level kalır. Bu katkılar dosyanın geri kalanıyla karıştırılmamalıdır.
- Önceki kesin yakın katkılar: slice 30 ClockInput shorthand, optional onboarding nav ve await/refetch guard; slice 31 named-fixture SQL assertion dosyası ve browser kanıtları. Önceki tüm dilimler uygulama günlüğünde dosya/migration/kanıt referanslarıyla açıklanmıştır; başlangıç dirty ağacının temiz bir session commit'i olmadığı için tek bir “bu session'ın tam diff'i” şu anda kanıtlanamaz.
- Ayrıştırma yöntemi: mevcut ağacı dondurup hash/status kaydet; paralel iş sahipleriyle dosya/hunk sınırı eşleştir; ayrı temiz çalışma alanında yalnız kararlaştırılan hunks ve migration bağımlılık kapanımını uygula; fingerprint ve ilgili testleri tekrar doğrula. Burada branch/worktree/commit oluşturulmadı; ilgisiz WIP silinmedi, revert edilmedi veya düzenlenmedi.

## 5. Kanıt kapsamları

### Son local/focused kontroller

| Kontrol | Sonuç | Sınır |
|---|---|---|
| Web: review summary, picker, temporary projection, panel | **39/39 geçti** | 4 dosya; son atomik değişiklik sonrası yeniden koşuldu. |
| Shared: stored request selection, dated overrides, type restrictions | **15/15 geçti** | Stored ID kaybı, legacy missing alan, malformed referans, tarih validation ve top-level command sınırı dahil. |
| API availability routes | **17/17 geçti** | Focused route testleri; hosted/network release kanıtı değil. |
| Shared / API / web typecheck | **Üçü de geçti** | Son şema düzeltmesinden sonra. |
| Named local browser-state SQL | **12/12 geçti** | Son QA talebi geri çekildikten sonra; activation, 4 immutable version, capacity, source ve sıfır açık talep. |
| Tüm tracked worktree için `git diff --check` | **Exit 0** | Loglar envanter dizininde. CRLF dönüşüm uyarıları var; bunlar whitespace test hatası değildir. Untracked dosyaları Git diff tek başına kapsamaz. |
| Yeni atomik kaynak/test dosyaları ve handoff bağlantıları | **Hata yok** | Ayrı trailing-whitespace taraması ve rapordaki yerel dosya linklerinin varlık kontrolü. |

Gizlenen başarısızlık yok: ilk web typecheck, persisted proposal'da `replace_version_ids` bulunmadığını gösterdi. Bu yalnız TypeScript eksikliği değildi; Zod parser alanı siliyordu. Stored-request schema düzeltildi, regresyon eklendi ve kontroller tekrar geçti. Önceki slice 31 acceptance harness'i pgTAP yüklü olmadığı için ilk denemede çalışmadı; extension yalnız rollback transaction içinde hazırlanarak 12/12 geçirildi. Tarayıcıda native date input/summary locator otomasyonu düzeltilerek gerçek UI sonucu alındı; başarısız tıklama test başarısı sayılmadı.

### Local browser

- Slice 30: onboarding ilk kayıt → daraltma pending → manager impact/approve → employee karar açıklaması.
- Slice 31: optional talep pending iken gerçek onboarding activation → Employee Hub → My Availability; onboarding temporary → manager approval → employee partial replacement → approval → geçici dönem sonunda weekly restoration. Employee 390/320 px ve manager 390 px görünümü.
- Son atomik iş: gerçek request `b6b3103f-1559-482d-974a-5af848bfa01d` için manager ve employee, değişecek 15–17 Ocak ile korunacak 18–21 / 25–28 Ocak tarihlerini gördü. Önceden değiştirilmiş 22–24 Ocak parçası yanlışlıkla “korunacak” listeye alınmadı. Manager 390/320 px document widths viewport ile eşitti. Ardından employee bu QA talebini geri çekti; status withdrawn, capacity notice false, onaylı sürümler aynı kaldı.
- [Onboarding kanıtı](availability-onboarding-proof-2026-09-07/README.md), [activation/temporary kanıtı](availability-onboarding-temporary-proof-2026-09-07/README.md), diğer tüm proof dosyaları envanterde.

### Temiz migration replay

[Kayıtlı temiz replay](availability-fullchain-proof-2026-09-07/README.md): **204 migration**, ardından **23 rollback suite / 875 assertion PASS**. İlk fresh replay'de bulunan trigger EXECUTE privilege sorunu forward `33001` ile düzeltilmişti; başarısız ilk kanıt korunuyor.

**Son canlı karşılaştırma:** aynı 204 dosyanın hashleri değişmemiş; mevcut ağaç **206 migration** içeriyor. Sonradan eklenen paralel dosyalar `20260909034000_shift_exchange_shared_assignment_guard.sql` ve `20260909035000_lineup_shared_content_revision_compare.sql`. Önceki replay bu iki dosyayı kapsamaz. [Delta](availability-final-handoff-inventory-2026-09-07/migration-replay-delta.json). Kullanıcının kontrollü duruş isteği kapsamında yeni geniş replay başlatılmadı.

### Hosted / staging / release

Bu session'da hosted migration, staging deploy, production deploy veya release doğrulaması **yapılmadı**. Local DB/advisor, focused tests, browser ve eski temiz replay bunların yerine geçmez. Mevcut 206 migration + ayrıştırılmamış dirty WIP için release-ready sonucu yoktur.

## 6. Cleanup ve kalan yerel kanıt

- Son atomik UI doğrulama talebi geri çekildi; açık capacity notice ve açık QA availability talebi kalmadı. Onaylı sürümler değiştirilmedi. Viewport overrides sıfırlandı; task browser sekmeleri kapatıldı.
- Bu işin sahiplik/isolation etiketleri doğrulanan iki çalışan regression/verification container'ı durduruldu. Önceki iki fullchain container'ı zaten durmuştu. Veritabanları kanıt olarak korundu; ana Supabase ve ilgisiz container'lar durdurulmadı/silinmedi.
- Paylaşılan local workspace içindeki sentetik E-995712 employee (4 approved availability version, active membership) ve önceki E-995680 kanıtları **fiziksel olarak silinmedi**. Bunlar audit/immutable kanıt ve ortak fixture bağımlılığıdır. Pending/draft test işi kapatıldı; persistent QA kayıtları envantere alındı. Temiz sandbox'a aktarım sonrası, bağımlılıkları kontrol edilen ayrı fixture-archive kararı gerekir. Kör reset/delete yapılmadı.
- 5555/5556 geliştirme sunucuları mevcut checkout'a aittir; bu session içinde durduğu kanıtlanınca bir kez repository dev script'iyle başlatılmıştı. Son kontrollerde 65092/42112 PID'leri dinliyordu. Paylaşılan geliştirici sunucusu olduğu için handoff sırasında zorla kapatılmadı; PID'ler işlem yapmadan önce yeniden doğrulanmalıdır.
- Hiçbir credential, token veya ham invitation URL bu rapora taşınmadı. `.temp` çalışma dosyaları release paketi değildir.

## 7. Açık işler ve karar öncelikleri

### P0 — devam/yayın öncesi kapılar

1. **Scope ve WIP ayrıştırması:** 402+ aday dosyanın tamamını Availability patch'i saymadan, gerçek bağımlılık kapanımını ve ortak hunk sahipliğini kararlaştır. Bu bitmeden toplu stage/commit/publish yapılmamalı.
2. **Mevcut migration zinciri:** yeni 34000/35000 dahil seçilmiş tam zinciri temiz DB'de replay et; canonical availability, assignment responsibility, cancellation/disposition ve Line Up shared-content revision entegrasyonunu doğrula. Eski 204/875 kanıtı güncel ağacın tam kanıtı değildir.
3. **Yayınlanmış assignment + legacy izin geçişi:** eski approved leave/published assignment örtüşmelerini somut veriyle incele; migration'ın geriye dönük employee release yapmadığını koru. Populated disposition / divergent edit-session / Line Up share yarışları kalan release kapısıdır.
4. **Ürün sahibi kararları:** ownership/approval/initial-review varsayılanları, optional onboarding availability'nin activation politikası ve manager-recorded confirmation standardını dondur. Yayın sonrası availability kilidi zaten kesin kullanıcı kararıdır.

### P1 — kalan E2E kabul

- Hybrid dışındaki ownership/initial review/approval kombinasyonları; manager baseline → employee onboarding confirmation; manager-only employee correction/notice yolu; scope'u dar manager'ın global pattern kararı.
- Populated draft-impact/default-application review, yetkisiz override, stale settings/request/assignment ve eşzamanlı publication; çok lokasyon ve DST sınırları. SQL/component kanıtının kapsamını aşan role/mobile akışları.
- İzin/cancellation started/overnight/partial kararları; farklı edit-session ve Line Up shared revision'ları; employee tarafından görünen nihai assignment durumu.
- Workspace switch, browser Back/refresh, karışık drawer formları ve hata sonrası recovery; notification delivery worker zamanlaması ve gerçek populated deep link/cache tüketicileri.
- Hâlâ eski availability varsayımını kullanan consumer'ların kapanışı ve immutable history/proposal reconstruction sınırının ürünce kabulü.

### P2 — son kabul/performance ve belge işi

- Büyük history, maksimum batch ve çok lokasyon için süre/limit ölçümü; mevcut bounded sorguların kabul edilebilirliği.
- Clock/type shortcut ve semantic restriction terminolojisinin son kullanıcı dilinde gözden geçirilmesi; export/a11y/responsive edge durumları.
- Onaylanmış patch'e bağlanan E01–E64 / V01–V46 kanıt matrisi, operasyon runbook'u ve fixture archive listesi. Bunlar yeni feature talebi değildir.

## 8. Bundan sonraki doğru plan

**Faz A — Scope/değişiklik ayrıştırması.** Bu rapor ve JSON snapshot'ını esas al; başlangıç talebiyle implement edilen paket arasındaki karar farklarını ürün sahibiyle kapat. Paralel iş sahipleriyle dosya/hunk sınırını belirle, bağımlılıkları listele ve ayrı temiz inceleme alanında somut bir patch çıkar. Yeni feature/migration/UI genişletmesi ekleme. Orijinal dirty ağacı koru. Çıktı: onaylanabilir kapsam, hunk/migration envanteri ve kalan kabul matrisi.

**Faz B — Yalnızca kalan E2E/release doğrulaması.** Ayrıştırılmış aynı patch üzerinde güncel temiz migration replay, P0/P1 actor flows, publication/disposition/concurrency, notification ve recovery kanıtını tamamla. Hata çıkarsa sonucu ve gerekli düzeltmeyi kapsam kararına geri getir; gizlice yeni özellik ekleme. Hosted/staging/release işlemleri ayrı açık yetki ve ortam doğrulaması gerektirir. Çıktı: kanıt kapsamı açık go/no-go değerlendirmesi; local başarıdan release sonucu türetilmez.

Önerilen tek devam prompt'u: **“Availability final handoff raporunu esas al. Önce yalnız Faz A'yı yap: mevcut WIP'i koruyarak Availability değişikliklerini ve bağımlılıklarını hunk bazında ayrıştır, P0 ürün kararlarını ve kalan kabul matrisini somutlaştır. Yeni feature, migration, UI genişletmesi, commit, push veya deploy yapma; incelemeye hazır kapsam paketini sun.”**
