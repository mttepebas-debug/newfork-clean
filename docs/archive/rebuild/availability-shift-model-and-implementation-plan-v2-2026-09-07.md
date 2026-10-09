# Availability v2: vardiya zaman modeli, sahiplik ve uygulama planı

Tarih: 7 Eylül 2026, America/Los_Angeles.

Durum: **Araştırmaya dayalı önerilen ürün sözleşmesi ve uygulanabilir plan. Henüz uygulanmadı.** Kullanıcının saat / Lunch-Dinner ismi / isim+saat kullanım biçimlerini birlikte destekler.

Temel audit: [Availability E2E audit](availability-e2e-audit-and-product-exploration-2026-09-07.md). İlk rapordaki 17 bulguya bu turda 6 isim/saat entegrasyonu bulgusu eklendi. V2, önceki açık tasarım seçeneklerini aşağıdaki önerilerle somutlaştırır. Öneriler kullanıcı tarafından onaylanmış değişmez kararlar olarak sunulmaz.

**Kullanıcının kesinleştirdiği kural:** Availability, manager'ın Schedule hazırlarken değerlendirdiği girdidir. Schedule yayınlandıktan sonra employee availability değiştirerek yayınlanmış vardiya sorumluluğundan çıkamaz. Aşağıdaki yayın kilidi bu talimata göre zorunlu sözleşmedir; ayarla kapatılabilen bir öneri değildir.

## 1. Önerinin özü

**“10:00–17:00 müsait değilim” + “Lunch 12:00–16:00” → o tarihte bu Lunch vardiyası için uygun değil.** Bu mantık doğrudur. Ancak employee üzerinde kalıcı `lunch_available=false` saklamak doğru model değildir. Sonuç; tarih, lokasyon, o atamanın zaman aralığı, availability sürümü ve izin kararlarından hesaplanmalıdır.

Üç vardiya yazma biçimi korunur:

1. Yalnız saat: atamaya girilen başlangıç/bitiş kullanılır.
2. Yalnız isim: o vardiya türünün geçerli default başlangıç/bitişi değerlendirme referansı olur; atama üzerinde snapshot saklanır.
3. İsim+saat: atamaya açıkça girilen saatler kullanılır; type default'u bunları ezmez.

**Badge'de saatin görünmesi bir sunum tercihidir.** Availability hesabını, zaman kaynağını veya kaydedilmiş saati değiştiremez. Buradaki “atanan saat”, planlanmış vardiya saatidir; kiosk/time-entry gerçek giriş/çıkışı değildir.

Sahiplik önerisi: **employee ve manager birlikte kullanır; çalışanın bildirimi ve yöneticinin işlemi ayırt edilir.** Employee kendi gerçek müsaitliğini bildirir. Manager çalışan adına kayıt yapabilir, review edebilir ve değişiklik önerebilir. Gerekçe, kaynak, teyit, sürüm ve etkilenen vardiyalar görünür. Tek vardiyalık override haftalık deseni değiştirmez.

### Yayınlanmış Schedule ve sorumluluk sınırı

1. Availability değişikliği yalnızca **henüz yayınlanmamış planlama dönemlerine/kapsamlarına** uygulanabilir. UI'da yayınlanmış dönemler kilitlidir; API/DB aynı kuralı uygular.
2. Publish anında kullanılan availability/policy/default-time revision bağlamı kaydedilir. Sonraki employee değişikliği mevcut published shift'i silemez, geçersiz yapamaz, yeni soft/hard availability conflict'iyle geriye dönük sorumluluktan çıkaramaz.
3. Weekly, temporary, date exception ve onboarding dahil bütün availability yazma yolları aynı yayın kilidine tabidir. Approval=None veya manager on-behalf save kilidi aşmaz.
4. Employee için “Bu dönem yayınlandı. Bu vardiya hâlâ sana atanmış. Çalışamayacaksan izin veya vardiya değişikliği talebi oluştur” gösterilir. Availability editörü daha sonraki yayınlanmamış döneme yönlendirir; kilitli döneme late-availability talebi kaydetmez.
5. İzin, release/coverage veya swap talebi göndermek tek başına sorumluluğu kaldırmaz. Sorumluluk, yetkili onay ve ilgili published assignment'ın değiştirilmesi/kaldırılması tamamlandığında değişir. Birinin vardiyaya talip olması da tek başına devir değildir.
6. Manager availability değiştirmek istiyorsa yine gelecekteki açık dönemi değiştirir. Yayınlanmış vardiyayı değiştirmek için ayrıca açık Schedule revizyonu, izin/coverage kararı ve employee bildirimi gerekir.
7. Sonraki yeni availability, geçmiş/yayınlanmış dönemlerde eski deseni yeniden yorumlatmaz. Board/drawer bu dönemleri “Yayın sırasında kullanılan müsaitlik” bağlamıyla gösterebilir; yeni desenin yürürlük/kapsamı ayrı görünür.
8. Yayından önce gönderilmiş, o dönemi etkileyen pending availability talepleri sonradan “geç kaldın” sayılmaz. Publish preflight bunların karara bağlanmasını ister; publish yarışı transaction'da kontrol edilir. Yayından sonra kilitli dönemi kapsayan yeni availability yazımı reddedilir.

**Çok lokasyon ve ileri yayın:** Kilit browser'ın bu haftası veya tek seçili lokasyon üzerinden hesaplanmaz. Etkilenen employee/lokasyon/departman ve publication period kapsamları sunucudan alınır. Global weekly değişiklik başka bir lokasyonun yayınlanmış dönemini etkileyemez. Önerilen ilk geçerlilik tarihi açık dönem başlangıcıdır; ileri tarihte başka yayınlanmış dönem varsa tekrar eden yeni desen o kilitli scope'a uygulanmaz. Dahil/haricî dönemler kaydetmeden önce açık gösterilir, kullanıcıdan habersiz tarih kaydırma veya kısmi kaydetme yapılmaz.

**Yeniden yayın ve unpublish:** Yalnız edit session açılması, taslağın değişmesi veya publication'ın superseded olması employee availability kilidini kaldırmaz. İlk yayın ve assignment geçmişi korunur. Unpublish de employee'yi sessizce serbest bırakma mekanizması değildir; sorumluluk değişikliği açık assignment/cancellation kararıyla kaydedilir. Manager'ın yeniden planlama yetkisi devam eder; employee'nin availability ekranı üzerinden eski taahhüdü değiştirme yolu açılmaz.

**İzin onayı ile coverage ayrımı:** Onaylı izne çakışan mevcut shift varsa final karar ekranında ilgili assignment için açık sonuç seçilir: yetkili olarak kaldır/açık vardiyaya çevir/yeniden ata veya ilgili kısım için izin verme. Employee'nin serbest bırakılması için replacement'ın bulunması şart değildir; manager açık vardiya bırakmayı kabul edebilir. Ancak final izin sonucu ile assignment sonucu tutarlı olmalı; gerekli kapsam yetkisi yoksa ilgili reviewer'a yönlendirilir ve UI gerçeğe aykırı “Tamam, vardiyadan çıktın” göstermez. Partial izin yalnızca onaylanan saat parçası için bu işlemi yapar.

## 2. Güncel koddan yeni bulgular

| Bulgu | Mevcut davranış | Tasarıma etkisi |
|---|---|---|
| İki farklı clock-off kaydı | Preset create default saatleri saklayıp gizler; Quick Editor hide=true kaydında 00:00–00:01 gönderir | Sadece start/end okuyarak bütün isimli vardiyalar yorumlanamaz |
| Hidden = no real clock | Occupancy helper hide flag'i kullanarak saat çakışmasını atlar | Display ve zaman semantiği ayrılmalı |
| Null default | UI saatleri zorunlu ister, shared schema iki null kabul eder | Eski/import/default'suz tür için unresolved durum gerekir |
| Kaynak belirsiz | Shift'te saat kaynağı/default revision yok | Default değişimi, import ve migration için tahmine dayalı kesinlikten kaçın |
| Preset önkontrolü | Default yoksa availability kontrolünün bulunduğu blok çalışmaz | Tüm gün kapalı gibi kesin kurallar bilinmeyen saatlerde de kontrol edilmeli |
| Hour totals | Kaydedilmiş saatlerden süre hesaplar | Referans availability süresi fiili çalışma veya ücret süresine çevrilmemeli |

Kod kanıtları:

- `apps/web/src/views/SchedulePage.tsx:2128,2147`
- `apps/web/src/schedule/components/ShiftQuickEditor.tsx:44,377`
- `apps/web/src/schedule/lib/shiftEditorState.ts:48,102`
- `apps/web/src/schedule/lib/schedulePresetTargets.ts:116`
- `apps/web/src/schedule/lib/shiftOccupancy.ts:36,93`
- `apps/web/src/schedule/lib/scheduleHourTotals.ts:9`
- `apps/web/src/settings/ShiftTypesSettingsPage.tsx`
- `packages/shared/src/index.ts:639,750`

İkinci audit aynı `codex/phase-1-foundation / 415b15f` dirty checkout üzerinde yapıldı. Ürün kodu, DB, ayar ve çalışan verisi değiştirilmedi. Yeni browser UAT veya yeni DB mutation testi yapılmadı; bu tur kod, saf fonksiyon probe'ları ve focused testler üzerine kuruludur.

## 3. Dış araştırma: fikir hangi açıdan destekleniyor?

When I Work, template saatlerinin employee'nin unavailable aralığıyla kısmen bile örtüşmesini unavailable işareti için kullanıyor; preferred saatlerle örtüşmeyi ayrı sınıflıyor. Bu, verilen Lunch örneğinin ürün mantığını destekliyor. Ürün, işaretli template'i yine seçilebilir bırakıyor; dolayısıyla conflict tespiti ile enforcement ayrı kararlar. [Resmî kaynak](https://help.wheniwork.com/articles/how-shift-templates-work/)

7shifts'te yetkili manager, kapsamındaki employee'nin recurring veya temporary availability'sini düzenleyebiliyor. Employee self-service ile manager düzenlemesinin birlikte var olmasına örnek; yetki/lokasyon sınırının ayrı tutulduğunu gösteriyor. [Resmî kaynak](https://kb.7shifts.com/hc/en-us/articles/31803204287635-Edit-Employee-Availability)

Deputy hem manager girişini hem açıksa employee girişini destekliyor; available aralık bildirimi günün kalanını unavailable olarak yorumluyor ve availability için manager approval gerektirmiyor. Bu da available/unavailable editörünün matematiğinin ve review politikasının ayrı tanımlanması gerektiğini gösteriyor. [Resmî kaynak](https://help.deputy.com/hc/en-au/articles/4658282900111-Add-update-or-delete-your-team-member-s-availability-and-unavailability)

Bunlar 7 Eylül 2026'da incelenen resmî dokümanlardır; rakip hesaplarında canlı işlem testi yapılmadı. Aşağıdaki snapshot, yetki ve plan tercihleri Newfork için öneridir; kaynakların aynen uyguladığı iddia edilmez.

## 4. Tek vardiya için zaman çözümleme sözleşmesi

| Giriş | Kullanılacak interval | Kaynak | Örnek |
|---|---|---|---|
| Saat, isim yok | Atanan saat | explicit | 12:00–16:00 |
| Lunch, atanan saat yok | Lunch default snapshot | type_default | Lunch → 12:00–16:00 |
| Lunch + 13:00–18:00 | 13:00–18:00 | explicit | Default 12–16 değerlendirmeyi değiştirmez |
| Açık saat girilmiş, badge saati gizlenmiş | Aynı açık saat | explicit | Görsel Lunch, hesap 13–18 |
| İsim var, default yok, açık saat yok | Bilinmiyor | unresolved | “Saat belirlenmeden uygunluk doğrulanamaz” |
| Yalnız bir saat alanı dolu | Geçersiz giriş | invalid | Start/end birlikte gerekir |
| Type arşivli ama eski atamanın snapshot'ı var | Mevcut snapshot/açık saat | Değişmez | Geçmiş kayıt okunabilir kalır |

### Öncelik ve snapshot

Yeni atamada öncelik: **explicit saat > seçilen type'ın tarih/lokasyon için default'u > unresolved**. Mevcut atamada daha önce kaydedilmiş kaynak ve snapshot esastır; güncel type ayarını her render'da tekrar okuyup geçmiş atamayı değiştirmek yoktur.

Önerilen kavramsal alanlar:

- `time_basis`: explicit / type_default / unresolved.
- Explicit için planlanmış local başlangıç, bitiş, end-day-offset ve location timezone.
- Type-default için referans local başlangıç, bitiş, end-day-offset, type ID, default revision ve location/timezone snapshot.
- `display_mode`: time / name / name_and_time; zaman kaynağından bağımsız.
- `assessment_interval`: yukarıdakilerden çözümlenen gerçek UTC aralığı ve provenance. Kullanıcının girdiği local saatler de korunur.

İsimli vardiya değerlendirmede bir referans aralığa sahip olur; employee'ye “Kesin giriş saatin 12:00” diye sunulmaz. Detayda “Müsaitlik kontrolü için Lunch varsayılanı: 12:00–16:00” açıklaması bulunur. Kesin plan saati gerekiyorsa manager explicit saate geçer.

### Default değişirse

- Settings'te Lunch 12–16'dan 11–17'ye değişince **sonraki yeni atamalar** yeni default'u kullanır.
- Kaydedilmiş draft/published atamaların snapshot'ı otomatik değişmez.
- “Yeni default'u gelecek vardiyalara uygula” ayrı işlemdir: hedef tarih/kapsam, önce/sonra, availability/time-off/occupancy etkisi, revision kontrolü ve yayın/bildirim akışı.
- Açık saatle atanmış vardiyaları bu işlem default'a dönüştürmez.
- Geçmiş atamalar ve onaylanmış izinlerin saatleri yeniden yazılmaz.
- Tek vardiyayı copy etmek snapshot'ı korur; yeni tarih için availability yeniden hesaplanır. Library template'te “sabit saatleri koru / type'ın güncel default'unu kullan” açık seçimdir; varsayılan sabit snapshot'ı korumaktır.
- Explicit saat düzenlendikten sonra type değiştirmek saati sessizce ezmez. “Sadece ismi değiştir” varsayılan; “Yeni default saatlerini uygula” ayrı aksiyon.

### Lokasyon ve gün farklılıkları

İlk sürümde mevcut workspace shift-type default'u, atamanın lokasyon saat diliminde yorumlanır. UI bunu gösterir. Aynı Lunch hafta sonu veya diğer lokasyonda farklı ise explicit override kullanılabilir. Veri sözleşmesi ileride location/weekday scoped default sürümüne uygun olmalı; gizli bir fallback önceliği bugünden icat edilmez. Böyle bir override geldiğinde sırası açık olmalı: lokasyon+gün > lokasyon > workspace, her seviyede revision.

## 5. Availability ve time off aynı interval'e nasıl uygulanır?

**Unavailable aralık ile herhangi bir pozitif süre örtüşmesi conflict'tir.** “Vardiyanın başlangıcı uygun” yeterli değildir. Available-only modelinde vardiyanın bütün interval'i uygun aralıkların birleşimi içinde kalmalıdır.

| Çalışanın durumu | Atama | Değerlendirme |
|---|---|---|
| 10:00–17:00 unavailable | Lunch, default 12–16 | Tamamı kapalı; availability conflict |
| 13:00–15:00 unavailable | Lunch 12–16 | Kısmen uygun; 13–15 conflict; tam vardiya uygun değildir |
| 10:00–17:00 unavailable | Lunch + explicit 17–20 | Bu zaman kuralına göre uygun; diğer kontroller ayrıca |
| 10:00–17:00 unavailable | Saatli 09–10 | Bitiş 10:00; süre örtüşmez, uygun |
| 10:00–17:00 unavailable | Saatli 09–10:01 | Bir dakikalık conflict |
| Sadece 12–14 ve 15–18 available | Lunch 12–16 | 14–15 boşluğu conflict |
| Sadece 12–14 ve 14–18 available | Lunch 12–16 | Birleşim kapsar; bu kurala göre uygun |
| Onaylı izin 13–15 | Lunch, default 12–16 | İzin conflict'i; genel availability açık olsa da engel |
| Onaylı izin 13–15 | Lunch + explicit 15–18 | Bu izinle conflict yok |
| Tüm gün onaylı izin | Default'suz isimli vardiya | Kesin izin engeli; saat bilinmiyor diye atlanmaz |
| Kısmi saatli izin | Default'suz isimli vardiya | Belirsiz; saat belirlenmeden temiz/uygun sonucu verilmez |
| Pazartesi açık, Salı kapalı | Pzt Dinner 22–Salı 02 | Salı 00–02 conflict |

Aralıklar `[başlangıç, bitiş)` olarak değerlendirilir. Timezone/DST ile gerçek anlar çözümlenir; gece yarısı, haftanın sonu, bitiş sınırı aynı algoritmadan geçer. Ücretsiz ara süresini toplamdan düşmek, arada employee'nin müsait olduğu veya izin kullanabileceği anlamına gelmez. Ayrı gerçek split-shift segmentleri varsa ayrı değerlendirilir.

### Available ve unavailable editörü

Çalışan iki giriş biçiminden birini seçebilir:

- “Bu saatlerde çalışabilirim”: günün izin verilen aralıklarını belirtir; geri kalanı kapalıdır.
- “Bu saatlerde çalışamam”: teyit edilmiş açık gün içinden bloklar çıkarır. İlk kayıt ise günün geri kalanının açık sayılacağı açık özetle teyit edilir.

İkisi aynı gün için çelişkili paralel kayıtlar oluşturmaz; canonical allowed/blocked aralıklarına normalize edilir. “10–17 available” ile “10–17 unavailable” arasında geçiş anlamı ters çevirdiği için önizleme/teyit gerekir. Henüz bildirilmemiş gün otomatik açık gün olmaz. Tüm gün ve ertesi gün seçimi açık olmalıdır; 23:59 ile gün sonunu taklit etmek yoktur.

### Time off'ta Lunch seçimi

Employee tarih + Lunch seçtiğinde location + o tarihteki default saat aralığı başvuruya snapshot edilir ve onay ekranında görünür. Bu, **12–16 saat aralığı için izin** anlamına gelir; yalnızca adı Lunch olan shift'leri engelleyen bir etiket değildir. Aynı saatlerdeki isimsiz vardiya da engellenir. Settings'teki sonraki değişiklik onaylı izin saatini değiştiremez.

İzin “Lunch türünü o tarihte hiçbir saatte yapamam” anlamındaysa bu farklı bir service/type kısıtıdır; saat bazlı izinle aynı kontrol olarak gizlenmemelidir. V1 planında Time off tür seçicisi saat kısayoludur. Default yoksa kullanıcı saat veya tüm gün seçmelidir.

## 6. Shift type / daypart kuralları: iki farklı kullanıcı niyeti

1. **Saat seçmek için Lunch'a tıklamak:** “Bu gün 12–16 unavailable”. Sonraki explicit atama saati farklıysa ona göre sonuç değişir.
2. **Lunch service'i yapmamak:** “Cumartesi Lunch service'ine uygun değilim”. Type ID'ye bağlı anlamsal kısıt; explicit saat farklı olsa da ilgili tür için devam eder. Job/shift-type eligibility ayrı kalır.

Editörde varsayılan ilk seçenek olmalı; “Bu vardiya türünü kısıtla” gelişmiş seçimdir. İki niyet aynı etiketle saklanmaz. Çalışan shift türünü seçince saatler ve “saat aralığı / vardiya türü” kapsamı görünür.

Saatli isimsiz vardiyaya yalnız saat örtüşmesiyle otomatik Lunch kimliği atanmaz; Dinner ile saatler çakışabilir. Service bazlı hard kısıtı olan employee'ye kapsamı belirsiz isimsiz atama, “hangi service?” doğrulaması gerektirir. Manager açıkça service bağımsız custom assignment olduğunu belirtebilir; sınıflandırma audit edilir ve gerçekte Lunch kısıtını aşmak için type ID silmek sessiz bypass olamaz. Mevcut type kimliğini kaldıran edit, eski restriction ve karar bağlamını yeniden değerlendirir.

Daypart ayrı bir zaman kısayoludur. İşletmede daypart zaten Lunch/Dinner shift type'larıyla ifade ediliyorsa ikinci bir paralel yönetim ekranı kurmak gerekmez; önce bu katalog kullanılmalı. Morning/Evening gibi bağımsız kısayollar gerekiyorsa açık saatleriyle aynı editöre eklenebilir.

## 7. Uygunluk sonucu tek boolean olmamalı

Önerilen değerlendirme sonucu iki bağımsız boyut taşır:

- **Fiziksel/planlama sonucu:** full / partial / none / unknown.
- **İşlem sonucu:** allowed / warning_requires_override / blocked / verification_required.

Ek alanlar: assessment basis, referans veya explicit interval, çakışan parçalar, request/version IDs, kaynak, policy revision, açıklama ve çözülebilecek aksiyonlar. Tek `available=true` değeri, onay veya atanabilirlik yerine kullanılamaz.

| Durum | Varsayılan önerilen işlem |
|---|---|
| Tam uygun; diğer eligibility kontrolleri temiz | Atanabilir |
| Availability conflict + soft | Gerekçeli tek-shift override mümkün |
| Availability conflict + hard | Atama/yayınlama engeli; genel Add anyway yok |
| Onaylı izin overlap | Engelle; izin revizyonu/shift saati/coverage yoluna yönlendir |
| Saat kaynağı unresolved | Draft tutulabilir; assigned publish/pickup onayı öncesi zaman netleştirilir |
| Availability bildirilmemiş | Verification required; auto-fill önermez; soft politikada yetkili doğrulama kaydı gerekir |
| Type default saatleri var | İsimli vardiya referans saate göre availability/time off kontrolünden geçer |

**Occupancy sınırı:** İki explicit atamanın gerçek zaman çakışması hard kalır. Yalnız isimli atamalar arasında aynı type/date duplicate kuralı korunur. En az biri type-default referanslı olduğunda saat örtüşmesi “referans service saatleri çakışıyor” olarak açıkça uyarı/inceleme gerektirir; gerçek kesin saat çakışması diye sunulmaz, auto-fill temiz aday saymaz. Existing clock-off testlerini tümden gerçek-saat testine çevirmek kapsamı gizlice büyütür; iki durum ayrı yeni testlerle güvenceye alınır. Explicit saati yalnız görsel gizlemek ise occupancy kontrolünü kapatamaz.

**Saat toplamı/payroll sınırı:** Type-default interval availability ve izin değerlendirmesine hizmet eder. Tahmini planlama süresi ayrı etiketle gösterilebilir; time-entry, gerçek giriş/çıkış, izin ücretlendirmesi veya payroll süresi yerine kullanılamaz. Bu plan payroll hesaplarını yeniden tasarlamaz; yanlış veri aktarılmadığını kontrol eder.

## 8. Availability'yi kim yönetmeli?

| Model | Güçlü taraf | Günlük problem | Değerlendirme |
|---|---|---|---|
| Yalnız employee | Kişi gerçek kısıtını doğrudan günceller | App kullanmayan/henüz davet edilmemiş çalışan; manager'ın telefonla aldığı bilgiyi işleyememesi | Tek başına yetersiz |
| Yalnız manager | Merkezi operasyon kontrolü | Sürekli mesajlaşma, gecikme, yanlış aktarım; çalışan ne kayıtlı göremezse güven kaybı | Yönetici üzerinden çalışan işletmelere seçenek; varsayılan değil |
| İkisi de sınırsız edit | Hızlı değişiklik | Sessiz overwrite, manager'ın gerçekte olmayan müsaitlik yaratması, stale yarış | Önerilmez |
| **İkisi de; kaynak, yetki, teyit ve version** | Self-service + operasyonel esneklik | İnceleme/teyit UX'i gerekir | **Önerilen varsayılan** |

Manager tek başına **yazabilir** olmak ile employee adına her kısıtı **kaldırabilir** olmak aynı yetki değildir.

### İşlem matrisi

| İşlem | Employee | Yetkili manager | Geçerlilik / görünürlük |
|---|---|---|---|
| İlk haftalık bildirim | Kendi kaydını girer | Çalışan adına girebilir | Employee beyanı veya manager-recorded employee confirmation |
| Daha az saat çalışabilirim | Açık dönem için bildirir | Employee'den aldığı bildirimi açık dönem için kaydeder | Yalnız yayınlanmamış kapsamda kapasite/review etkisi |
| Daha çok saat çalışabilirim | Bildirir | Önerir veya employee teyidini kaydeder | Employee teyidi yoksa gerçek kapasite genişlemiş sayılmaz |
| Geçici availability | Kendi tarih aralığını girer | Aynı yetkiyle çalışan adına | Başlangıç/bitiş, kaynak, effective status |
| Yazım/saat düzeltmesi | Yeni revision | Yeni revision + neden | Önce/sonra görünür; sessiz geçmiş edit yok |
| Availability talebine karar | Kendi talebini onaylayamaz | Kapsamındaki talebi inceler | Self-approval kapalı; gerektiğinde üst reviewer |
| Tek shift için istisna | Çalışabileceğini teyit edebilir | Policy izin veriyorsa override | Haftalık kayda etkisi yok |
| Time off kararı | Başvurur/withdraw/cancel-request | Segmentleri kararlaştırır | Genel availability edit'iyle izin kaldırılamaz |

Çalışan uygulama kullanmıyorsa manager “Çalışanla teyit edildi” + tarih/kanal + kısa not kaydedebilir. Bu, employee uygulamada kabul etmiş gibi işaretlenmez; kaynak `manager_recorded_confirmation` olur. Hassas kişisel neden zorunlu tutulmaz. Sadece manager'ın operasyonel isteği varsa `manager_proposal` olur; teyit gelmeden yeni açık saat üretmez.

Organization employee edit'i kapatırsa çalışan kendi kaydını, manager değişikliklerini ve düzeltme bildirme yolunu görmeye devam eder. Gerçek yeni engeli bildirme kanalı kaybolmaz; “manager-only” görünmezlik veya sessiz varsayım anlamına gelmez.

## 9. Onboarding, haftalık ve geçici kayıtlar

### Önerilen başlangıç politikası

- Onboarding'de availability her zaman görünür biçimde sorulur; adımın tamamlamayı bloklaması organization ayarıdır. Mevcut optional davranış korunur. Skip sonucu unknown'dur.
- İlk employee bildirimi, org özel olarak first-submission review istemiyorsa teyit edilmiş ilk baseline olur. Onboarding ile Hub/Schedule aynı canonical kaydı okur; onboarding belgesi source snapshot olarak kalabilir.
- Tek seferlik “her gün açık” açık kullanıcı aksiyonuyla seçilebilir. Başlangıçta bütün günleri önceden confirmed göstermek yoktur.
- Onboarding öncesi manager kaydı varsa employee'ye aynı desen teyit/düzeltme için gösterilir; iki bağımsız hafta oluşturulmaz.

### Weekly, temporary, exception

| Tür | Kullanım | Sona erme |
|---|---|---|
| Haftalık desen | Her Pazartesi/Salı için tekrarlayan müsaitlik | Yeni baseline veya isteğe bağlı bitiş |
| Geçici haftalık desen | 14–30 Eylül okul programı; bu dönemde farklı tekrar | Dönem sonunda o tarihte geçerli baseline |
| Tarihli exception | Sadece 19 Eylül 10–17 kapalı / ek açık saat | İlgili tarihte sona erer |
| Time off | Belirli tarih/saat için izin | Onaylı segment ve cancellation/revoke süreci |

Temporary, etkilenen kapsam için desenin yerini alır. Exception yalnızca seçilen tarih/aralığı değiştirir; “bu günün tamamını değiştir” açık ayrı eylemdir. Aynı kapsamda overlapping temporary desen sessiz last-write-wins ile çözülmez; kullanıcı aralıkları ayırır veya önceki kaydın yerine geçeceğini açıkça seçer. İki haftada bir tekrar/A-B hafta gibi gelişmiş recurrence v1 için zorunlu varsayılmaz; tarihli/geçici desenle karşılanamayan ihtiyaç ürün karar listesinde kalır.

Precedence: geçerli weekly → kapsamlı temporary replacement → açık date exception → onaylı izin çıkarımı → gerçek atamalar/uygunluk kontrolleri. Bir exception, onaylı izni veya yapamayacağı position/type yetki kısıtını kaldıramaz.

Uygulama notu (25001): Tarihli saat değişiklikleri mevcut temporary review yaşam döngüsünde `date_overrides` olarak saklanır; fiziksel kaynak `date_exception` olarak değerlendirilir. Yedi günlük uyumluluk alanı bu kayıtlar için etkisizdir. Saat aralıkları, timezone ve DST occurrence seçimi immutable UTC snapshot ile birlikte kaydedilir. Alt aralık replacement eski exception'ın iki yanını korur. Weekly/temporary desen değişiklikleri bu saat exception'larını silmez; saat exception'ları da bağımsız shift-type kısıtlarını kaldırmaz. İlk onboarding baseline'ı bu akışla atlanamaz. Legacy hafta görünümünün farklı timezone veya DST fold'u doğru anlatamadığı durumda kapasite unknown kalır; gerçek atama değerlendirmesi canonical UTC sonucunu kullanır.

### Pending ve red gerçeği

Bu alt bölüm yalnızca **yayınlanmamış dönemlere zamanında yapılmış bildirimler** içindir. Önerilen approval modu: kapasiteyi daraltan değişikliklerde review; org “hiç / daraltan / tümü” seçebilir. Initial review ayrıca belirlenir. Pending bir genişleme review gerekiyorsa eski kabul edilmiş kapasiteyi büyütmez. Pending daraltma eski baseline'ı değiştirmese de yeni bildirilen engeli açık dönem planlayıcısında gösterir. O dönemin publish preflight'ı etkili pending talebin karara bağlanmasını ister.

Manager reddettiğinde karar `denied` olur; zamanında bildirilmiş gerçek çalışamama durumu açık dönem için otomatik available'a çevrilmez. Ayrı `unresolved_capacity_notice` kalabilir. Çalışanın geri çekmesi/düzeltmesi, kayda geçirilmiş görüşme veya tek-shift açık willingness bu belirsizliği çözer. Bu mekanizma **yayın sonrası yeni availability bildirimi üretmek veya mevcut published shift'i engellemek için kullanılmaz**. Publish öncesi çözümlenen karar/override bağlamı snapshot'a girer.

Yayınlanmış döneme availability başvurusu geç kalmıştır: bu dönem için weekly/temporary/exception değişikliği kabul edilmez. Employee çalışamayacağını **izin veya shift-change/coverage kanalında** bildirebilir; talep sonuçlanana kadar assignment ve sorumluluk sürer. Henüz yayınlanmamış fakat organization ön bildirim süresi aşılmış bir değişiklik ise ayrı olarak late/review kabul edilebilir. Böylece “notice süresi aşıldı” ile “Schedule yayınlandı” aynı kural sayılmaz.

## 10. Çalışan ve manager UI akışı

### Ortak editör, farklı yetki çevresi

Onboarding, My Availability ve Employee drawer aynı interval editörünü kullanır. Gün/saat modeli üç kez ayrı uygulanmaz. Farklılık başlık, actor, submit/approve yetkisi, kaynak ve etki alanlarıdır.

Editör sırası: kayıt türü → başlangıç/bitiş tarihleri → timezone → günler → available/unavailable aralıkları → Lunch/Dinner kısayolları → gelişmiş service kısıtı/tercih → okunabilir özet → etkilenen vardiyalar → gönder/kaydet.

Employee ana ekran: **Şu an geçerli**, **Bekleyen**, **Gelecek**, **Geçmiş**. Kartlarda 12h/24h tercihi, effective tarih, kaynak, pending karar ve çözülmemiş kapasite bildirimi. Manager değişikliğinde gün/saat diff'i; “gördüm” ve “bu saatlerde çalışabilirim” birbirinden ayrı.

Manager drawer: güncel hafta, upcoming/temporary, pending proposals, izinler, history. Kayıt olmasa da “Onboarding not started” gerçek availability panelinin yerine geçmez. Kendi yetki alanı dışındaki lokasyon ayrıntısı açılmaz.

Requests: Availability / Time off / Shift changes. Availability detayında before/after, source, açık effective periods, etkilenen draft shift'ler ve değişiklik dışında bırakılan kilitli yayın dönemleri. Published assignment'a ilişkin izin/coverage/swap etkisi ilgili ayrı talep detayında görünür. Manager adına girişte “Employee ile teyit edildi / Employee teyidi bekleniyor” seçimi gerekçesiyle kaydedilir.

Yerel uygulama notu (26001): Manager teklif girişi ve onayında taslak etkisi Schedule'ın canonical değerlendirmesiyle hesaplanır. Kaydedilmiş taslaklar ve aktif düzenlemeler ayrı kayıtlar olarak gösterilir; onay hiçbir atamayı kaldırmaz. Önizleme sonrası ilgili taslak, availability, policy veya yetki görünürlüğü değişirse kayıt sırasında güncel fingerprint uyuşmaz ve yeni inceleme gerekir. Önizleme kendi çözülen talebinin pending bildirimini karşılaştırmadan çıkarır; diğer talepleri korur. Schedule okuma yetkisi olmayan lokasyonlarda yalnızca etkilenen kayıt sayısı gösterilir. Employee hiçbir unpublished taslağı bu endpoint üzerinden okuyamaz. Dolu liste ve rol/mobil tarayıcı doğrulamaları ile büyük hacim ölçümleri ayrıca sürmektedir.

### Schedule ve Shift Types Settings

Shift Types Settings, default saatlerin isimli atamaların availability/time-off kontrolünde kullanılacağını açıklar. Örnek: “Lunch: 12:00–16:00. Yalnız Lunch seçilen yeni atamalar bu aralıkla kontrol edilir.” Saat değişikliğinin yeni/mevcut atamalara etkisi ayrı gösterilir.

Schedule'da Lunch chip'inin görünümü aynı kalabilir. Uygunluk detayı: “Lunch için uygun değil · kontrol aralığı 12–16 · çalışan 10–17 müsait değil”. Kısmi sonuç: “12–13 uygun; 13–15 kapalı; 15–16 uygun”. Explicit override sonrası sonuç anında yeniden hesaplanır. “Referans saati uygula” ile “Saati göster” ayrı kontrollerdir.

Soft warning adayı tamamen gizlemez; manager gerekçe ile değerlendirebilir. Hard veya unknown durumları disabled reason ve çözüm aksiyonuyla görünür. Pickup isteyen employee tek vardiya için willingness bildirir; haftalık kaydı değiştirmez, onaylı izin engelini kaldırmaz.

### İzin ayrıntıları

Tarih/saat/daypart/type kısayolu ile aynı canonical interval modelinden başvuru. Manager karar ekranı her parçanın saatini gösterir. Saat bazlı partial approval için istenen interval immutable kalır; approved/denied parçalar onu tam ve örtüşmesiz kapsar. Duplicate/yabancı/eksik segment kararı reddedilir. Employee aynı detayları, reviewer notunu ve etkilenen shift durumunu görür.

Mobilde gün kartları, çoklu aralık ekleme, +1 gün etiketi ve sabit özet; keyboard/büyük yazı desteklenir. Dirty form focus/refetch ile sıfırlanmaz; temiz form güncellenir. Başka workspace'e geçişte önceki employee draft'ı yeni kimliğe kaydedilemez. Network timeout sonrası aynı idempotency key ile sonucu bulma/yeniden deneme akışı bulunur.

## 11. Organization settings: önerilen sade varsayılanlar

| Ayar | V2 önerisi |
|---|---|
| Kim girebilir? | Employee + yetkili manager; employee-only/manager-only özel ihtiyaç için seçenek |
| Onboarding required? | Mevcut optional korunur; unknown planlayıcıda görünür |
| İlk kayıt onayı | Varsayılan doğrudan baseline; org first-submission review açabilir |
| Sonraki değişiklik onayı | Varsayılan daraltan; none/all seçenekleri |
| Enforcement | Mevcut soft korunur; hard gerçekten bütün kanallarda uygulanır |
| Manager kapasite genişletme | Employee teyidi veya manager-recorded employee confirmation |
| Notice süresi geçmiş, henüz yayınlanmamış dönem | Late/review ile alınabilir |
| Yayınlanmış dönem | Availability için kilitli; izin/shift-change akışına yönlendir; bu kural kapatılamaz |
| Published shift sorumluluğu | Talep göndermekle bitmez; yetkili karar + açık assignment değişikliği gerekir |
| Missing availability | Verification required; otomatik “uygun” değil |
| Temporary/date exceptions | Açık; effective ve expiry görünür |
| Saat kaynağı / badge | Sistem sözleşmesi; organization'ın kapatabileceği güvenlik dışı UI toggle değil |
| Manager override | Ayrı scoped yetki; gerçek gerekçe, policy/version, bildirim |
| Kendi talebini onaylama | Kapalı; üst reviewer veya ayrı yetkili |

Organization-wide employee baseline'ını, sadece tek lokasyon yetkisi olan manager'ın global değiştirmesi önerilmez. Global değişiklik için bütün etkilenen kapsamı yönetme yetkisi veya global reviewer'a proposal gerekir. Lokasyona özgü service rule ise o kapsamda düzenlenebilir. Çalışanın kapasite beyanı farklı lokasyonlarda aynı anda çalışmasına izin vermez.

## 12. Teknik uygulama taslağı

### Kanonik kayıtlar

- Availability version: workspace/employee, timezone, effective period, normalized weekly rules, source, author, confirmation source, base revision.
- Availability request: immutable öneri snapshot'ı, requester/recorded-for, reviewer, status, decision reason, revision, policy revision; version'a dönüşmesi ayrı event.
- Temporary/date exception: typed scope ve period; approved/active seçim kuralları; başka org kaydıyla bağ kurulamayan composite tenant ilişkileri.
- Capacity notice: sadece yayınlanmamış döneme zamanında bildirilen pending/denied engelin çözülme durumu; published shift sorumluluğu bundan türetilmez.
- Publication availability lock: employee/scope/period, ilk yayın ve geçerli publication ilişkisi, kullanılan availability/default/policy revisions. Tekrarlayan yeni desenin hariç tuttuğu published scope'lar ve employee'ye gösterilen applicability açık tutulur.
- Shift assessment source: explicit/type_default/unresolved + snapshot/revision; badge görünümü ayrı.
- Time-off request + requested segments + decision segments: istenen ile karar verilen interval'ler ayrılır; global status bunlardan türetilir.
- Override: belirli shift/employee/interval/kural revision/policy'ye bağlı gerekçe; invalidation ve employee willingness ayrı kayıtlar.

Kavramsal isimlerdir; nihai tablo/kolon isimleri migration tasarımında mevcut şemayla birleştirilir. Mevcut immutable availability satırları ve time-off event altyapısı yeniden kullanılabilir; iki bağımsız authoritative availability deposu bırakılmaz.

### Tek authoritative değerlendirme

Sunucunun transaction içinde çağırdığı ortak DB interval/policy fonksiyonu son kararın otoritesi olmalı. Schedule create/update, publish, auto-fill apply, pickup/swap approve, Line Up commit aynı canonical bağlamı kullanır. API, UI'ya aynı gerekçe yapısını döner. Mevcut frontend pure TS hesapları hızlı önizleme sağlayabilir; son atama yetkisi vermez.

TS ve SQL aynı fonksiyon dosyasını paylaşamaz; **aynı sözleşme + aynı golden fixture vektörleri** ile parity zorunludur. `packages/scheduling-shared` içinde eski desteklerin bulunması entegrasyon kanıtı değildir; canonical adapter ve conformance testleri gerekir. Yeni public RPC'ler en az yetkiyle açılır, servis fonksiyonları actor/tenant/location/employee kapsamını doğrular; privileged DB key frontend'e taşınmaz.

### Yarışlar ve bildirimler

Availability değişimi, **publish**, time-off kararı ve shift assignment aynı employee/kapsam kilit sırasına uyar; son revision, publication lock ve effective kayıtlar transaction içinde yeniden okunur. Önizleme fingerprint'i tek başına yeterli değildir. Publish save'den önce commit olduysa kilitli availability yazımı reddedilir; save önce commit olduysa publish yeni veriyi/ilgili pending review'u görür. Çok employee'li swap'ta kilitler deterministik sırayla alınır; tek tarafın başarılı kalması mümkün olmamalıdır.

Save ve decision idempotency key alır. Capacity version advance + event + outbox aynı transaction'da olur. Bildirim hatası ikinci karar üretmez. Invalid cache'ler yalnız Hub değil board, drawer, Requests, Schedule, candidate preview ve Line Up için ilgili workspace/employee/revision kapsamında yenilenir.

### Migration ve geçmiş kayıtlar

- Additive schema → proven/provisional legacy sınıflama → compatible readers → yeni writers → parity → enforcement rollout.
- `hide_time_on_badge=true` veya `00:00–00:01` tek başına zaman kaynağı kanıtı değildir. Provisional classification gerekir; gerçek bir dakikalık vardiya veya explicit gizli saat yanlış dönüştürülmez.
- Güvenilir creation/event snapshot'ı varsa kullan; yoksa `legacy_unverified` assessment durumu ve manager review. Güncel type default'unu geçmişte de aynıymış gibi backfill etme.
- Gelecek legacy atamalar için güncel default'u kullanma, açık etkili kabul/migration işlemi ve provenance ile yapılabilir. Historical/approved leave kayıtları korunur.
- Onboarding kaydı mevcut operational version'ı ezmez. Tek canonical initial import source-ID ile idempotent yapılır; çift kayıt varsa tarih/teyit ve kaynak önceliği review'a sunulur.
- Rollback yeni veriyi silmez veya anlamı eski sentinel'e geri çevirmez. Yeni yazarlar durdurulur, uyumlu okuma/adaptör korunur; eski client'ın time_basis alanlarını kaybetmesine izin verilmez.

## 13. Uygulama planı

Bu aşamalar aynı özelliğin bütünüdür. P0 bağlantılar ve her tüketici uyumu tamamlanmadan “Availability v2 tamamlandı” denmez. Bu turda hiçbir aşamanın kod uygulamasına başlanmadı.

| Aşama | Çıktı / kapsam | Başlıca dosya ve alanlar | Kabul kapısı |
|---|---|---|---|
| P1 — Zaman ve veri sözleşmesi | Üç shift biçimi, explicit/type-default/unresolved, snapshot/version, display ayrımı; canonical availability ve request şeması | `packages/shared/src/index.ts`, `employee-hub.ts`, `packages/scheduling-shared`, yeni migration'lar | Bölüm 4–7 örnekleri, validation ve schema compatibility fixture'ları |
| P2 — Canonical yazma ve sahiplik | Onboarding→operational bağlantısı; employee/manager entry, confirmation, expected revision, temporary/exception; yayınlanmış kapsam kilidi | Onboarding/employee-hub API servisleri, yeni availability service/RPC, publication lock, permission katalogları | İki org/lokasyon izolasyonu; tüm entry yollarında publish kilidi; save/publish yarışı; on-behalf audit |
| P3 — Ortak conflict motoru | Availability, approved leave ve time source çözümlemesi; sunucuda authoritative evaluate/commit | Schedule service/RPC, publication, auto-fill, shift request, Line Up; frontend adapter | Tüm assignment kanallarında aynı fixture sonucu; hard bypass yok |
| P4 — Ortak editör ve settings | Onboarding/My Availability/drawer ortak editör; actor-specific actions; Shift Types default açıklaması ve revision/impact UX | `EmployeeOnboardingPage`, `EmployeeHubPage`, `EmployeeDrawer`, `AvailabilityPage`, `ShiftTypesSettingsPage`, `SchedulingSettingsPage`, ortak availability components | Employee/manager role UAT; üç giriş biçimi, özel saat, çoklu aralık, mobil/dirty forms |
| P5 — Requests ve kısmi izin | Açık dönem availability review; yayın sonrası izin/coverage/swap, partial decisions, employee decision details, cancellation/revoke | `ScheduleRequestsPage`, shared request schemas, employee-hub projections, time-off SQL/RPC | Duplicate/exact-cover; talepte sorumluluk sürer, final kararda assignment sonucu tutarlı |
| P6 — Bildirim, bütünleşme ve geçiş | Outbox lifecycle, query refresh, legacy review UI, default apply-to-future, tüm consumer consistency | Notification catalog/producers; schedule adapters/copy/templates/export; migration verification | Golden SQL/TS parity, browser E2E, tenant/role tests, local DB ve rollout kanıtı |

Bağımlılık: P1 → P2/P3; ortak veri sözleşmesi netleştikten sonra P4 tasarlanır; P5 P2/P3 üzerinde tamamlanır; P6 tümü üzerinde kapanır. Bu sıra bir sonraki implementation oturumunun iş paketidir; yarım backend/frontend rollout'u önermez.

### İlk audit bulgularıyla izlenebilirlik

| Bulgular | Plan karşılığı |
|---|---|
| A01 onboarding bağlantısı, A05 approval, A11 concurrency, A15 effective dates | P1/P2/P6 |
| A02 policy, A03 publish, A04 gece/timezone, A09 swaps | P1/P3/P6 |
| A06 employee partial detail, A12 duplicate, A13 saatli izin, A14 lifecycle | P3/P5/P6 |
| A07 editör, A08 drawer, A16 missing/display | P1/P4 |
| A10 validation | P1/P2/P5 |
| A17 override/acknowledgement | P2/P3/P4/P6 |
| A18–A23 named/clock/default/total sorunları | P1/P3/P4/P6 |

### Korunacak kapsam

Saat-only, name-only ve name+time yazma biçimleri korunur. Mevcut Schedule sidebar sırası ve Line Up temel ürün sözleşmesi değiştirilmez. Yeni backend alanlarını taşımak için badge/export/hour-total adapter'ları güncellenebilir; payroll, izin bakiyesi veya ücret kuralları bu planın tasarım kapsamı değildir. Regression kanıtı bunlara yanlış referans süre taşınmadığını içermelidir.

## 14. V2 ek kabul senaryoları

İlk rapordaki E01–E64 korunur. Aşağıdakiler yeni üç-mod ve sahiplik sözleşmesinin ek kabul kapılarıdır; uygulanmış test oldukları iddia edilmez.

| ID | Senaryo | Beklenen sonuç |
|---|---|---|
| V01 | 10–17 unavailable + Lunch default12–16 | Availability conflict |
| V02 | Aynı kişi Lunch explicit17–20 | Zaman kuralına göre uygun |
| V03 | Explicit12–16 badge gizlenir | Aynı conflict ve saat kaynağı |
| V04 | Preset ve Quick Editor aynı Lunch | Aynı resolved interval ve finding |
| V05 | Type default12–16 →11–17 | Mevcut shift snapshot'ı değişmez |
| V06 | Değişiklikten sonra yeni Lunch | Yeni default11–17 kullanılır |
| V07 | Yeni default existing future'a uygulanır | Before/after + revalidation; explicit shift'ler korunur |
| V08 | Saatsiz/default'suz type + full-day leave | Engellenir |
| V09 | Saatsiz/default'suz type + partial leave | Unresolved; assigned publish öncesi çözüm |
| V10 | Type arşivlenir/yeniden adlandırılır | Mevcut snapshot/ID/audit okunur |
| V11 | Lunch seçerek 12–16 izin başvurulur | Aynı saatte isimsiz shift de engellenir |
| V12 | İzin onayından sonra Lunch saat değişir | İzin interval'i değişmez |
| V13 | Type rule Lunch unavailable + explicit geç saat | Service rule uygulanır; saat uygunluğu tek başına yeterli değil |
| V14 | Saat-only atamada hard service rule var | Service kapsamı doğrulanır; örtüşmeden otomatik isim türetilmez |
| V15 | Mevcut shift'in type ID'si silinir | İlgili kısıt/override bağlamı yeniden değerlendirilir |
| V16 | Template/copy/draft-reopen | Snapshot korunur; yeni tarih için kurallar yeniden hesaplanır |
| V17 | Employee submit + manager edit yarışır | Base revision conflict; sessiz overwrite yok |
| V18 | Manager employee adına kapasite genişletir | Employee teyidi veya kayıtlı görüşme; yoksa proposal |
| V19 | Manager yalnızca görevi azaltır | Scheduling assignment; employee capacity'yi yanlış değiştirmez |
| V20 | App kullanmayan employee kaydı | Manager-recorded confirmation açık kaynakla görünür |
| V21 | Manager-only organization | Employee kendi kaydını ve düzeltme/engel bildirimi yolunu görür |
| V22 | Onboarding öncesi manager baseline | Onboarding aynı deseni teyit/düzeltir |
| V23 | Onboarding skip | Unknown; otomatik unrestricted yok |
| V24 | Temporary dönem içinde yeni weekly baseline | Dönem sonunda o tarihte geçerli baseline seçilir |
| V25 | İki temporary dönem overlap | Açık replace/split; sessiz son-kayıt-kazanır yok |
| V26 | Yayından önce pending daraltma reddedilir | Açık dönem capacity notice'ı görünür; publish öncesi çözülür |
| V27 | Yayından sonra availability değiştirilir | Kilitli dönem için save reddedilir; izin/coverage yolu; vardiya sorumluluğu sürer |
| V28 | Tek-shift employee willingness | Haftalık desen değişmez; approved leave bypass olmaz |
| V29 | Tek lokasyon manager global baseline edit'i | Global kapsam yoksa proposal/escalation |
| V30 | İki explicit shift, biri saati gizli | Gerçek saat overlap kontrolü devam eder |
| V31 | İki farklı named shift referansları overlap | Referans overlap uyarısı; auto-fill temiz aday saymaz |
| V32 | 00:00–00:01 eski gizli kayıt | Kanıtsız gerçek saat/default ataması yok; legacy review |
| V33 | Default saatli named shift → payroll/time tracking | Referans süre gerçek çalışmaya dönüşmez |
| V34 | 12–16 shift, unpaid break 30 dakika | Availability bütün presence interval'ini kontrol eder |
| V35 | Switch available↔unavailable | Anlam dönüşümü açık özetle teyit edilir |
| V36 | Type değişir, explicit saat daha önce düzenlenmiş | Saat korunur; default uygulama ayrı aksiyon |
| V37 | Availability save/publish aynı anda | Commit sırası ve lock tutarlı; yayın sonrası aradan yazma yok |
| V38 | Publish öncesi gönderilen pending availability | Employee geç kalmış sayılmaz; review çözülmeden ilgili publish tamamlanmaz |
| V39 | Temporary/date exception ile published dönemi değiştirme | Aynı kilit; alternatif giriş yolu bypass değil |
| V40 | Manager on-behalf veya Approval=None ile published değişiklik | Availability kilidi sürer; assignment için ayrı yetkili karar |
| V41 | Bir lokasyon yayınlanmış, diğeri açık | Global desen yayınlanmış scope'u etkilemez; UI kapsamı açık gösterir |
| V42 | İleri haftalar da yayınlanmış | Applicability o dönemleri dışlar; yalnız gelecek tarih olmak yeterli değil |
| V43 | Employee release/pickup/swap/izin talebi gönderir | Gerekli onay ve assignment değişikliğine kadar sorumluluk devam |
| V44 | Manager izin onaylar ve shift'i açık vardiyaya çevirir | Employee açıkça serbest kalır; replacement bulunması ayrıca coverage işi |
| V45 | Unpublish / edit-session / republish | Sessiz availability unlock veya employee sorumluluğu silinmesi yok |
| V46 | Yeni gelecek baseline, eski published hafta görüntülenir | Yayın anındaki availability bağlamı korunur; retroaktif conflict üretilmez |

## 15. Doğrulama ve açık kararlar

Bu tur çalıştırılan mevcut testler:

```powershell
pnpm.cmd --filter @newfork/web exec vitest run src/schedule/lib/shiftEditorState.test.ts src/schedule/lib/shiftOccupancy.test.ts src/schedule/lib/schedulePresetTargets.test.ts src/schedule/lib/scheduleHourTotals.test.ts src/schedule/components/ShiftQuickEditor.test.tsx src/schedule/schedule-conflicts.test.ts
# 6 dosya, 45 test geçti.
```

Saf fonksiyon probe sonuçları:

| Probe | Mevcut sonuç |
|---|---|
| Lunch default12–16, 10–17 unavailable | availability conflict |
| Clock-off save biçimi 00:00–00:01, aynı type/kişi/gün | conflict yok |
| Explicit17–20 | conflict yok |
| Default'suz preset, bütün gün unavailable | preset önkontrol allowed=true |
| Farklı type, hidden clock overlap | occupancy helper null |

V2 davranışı henüz uygulanmadığı için bu sonuçlar başarı ölçütü değil, mevcut farklılıkların kanıtıdır. İlk audit'teki 62 test ve browser bulguları önceki tur kanıtıdır; bu tur yeniden koşturulmuş/tam employee UAT yapılmış gibi yorumlanmamalıdır.

**Kesin kullanıcı kararı:** Yayınlanmış dönem availability ile değiştirilemez; employee yayınlanmış shift sorumluluğundan bu yolla çıkamaz. Bu kural yeniden onay beklemiyor. Kalan plan makul varsayılanlarla somutlaştırıldı; implementation öncesi ürün tercihleri olarak özellikle şu noktalar gözden geçirilmeli:

1. Hybrid sahiplik + manager-recorded confirmation yaklaşımı.
2. İsimli vardiyada default snapshot'ının assessment referansı olması; kesin plan saati olarak sunulmaması.
3. Approval varsayılanının daraltan değişiklikler olması; ilk kayıt/onboarding ayrı ayar.
4. Service bazlı hard kısıtın scope belirsiz isimsiz atamada doğrulama istemesi.
5. İsimli iki vardiyanın referans overlap'inin ayrı uyarı olması; explicit overlap'ten ayrılması.

Bu beş öneri tüm ilgili akışlarla birlikte planlandı. Açık tercih bulunması, yapılmış audit'i veya planı eksik bırakmaz; uygulama sırasında bunlar kullanıcı tarafından seçilen ürün sözleşmesine göre kesinleştirilecektir.
