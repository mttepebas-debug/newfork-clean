# Line Up — Yeniden Tasarım, Ürün Spec’i ve Uygulama Planı

- **Tarih:** 6 Eylül 2026
- **Durum:** Araştırmaya dayalı önerilen spec; implementasyon başlamadı.
- **Çalışma alanı:** `C:\Users\TheWe\Documents\Codex\newfork-clean`
- **Kapsam:** Haftalık yayınlanmış Schedule’dan günlük vardiya ve operasyon düzeni üretme; personel yerleşimi, replacement, lokasyonlar arası move/swap, extra line, günlük notlar, share ve acknowledge.
- **Belge niteliği:** Bu sohbette yapılan kod incelemesi, ürün/UI araştırması ve sonraki kullanıcı gereksinimleri tek belgede birleştirilmiştir.
- **Değişiklik sınırı:** Bu çalışma uygulama kodunu, veritabanını veya çalışma zamanı ayarlarını değiştirmez. Bu adımda yalnızca rapor dosyası oluşturulmuştur.

## 1. Ürün kararı ve zorunlu kapsam

Line Up, haftalık Schedule’dan beslenen ve günün servis düzenini yöneten bir operasyon ekranı olarak yeniden tasarlanmalıdır. Yönetici ekibin nerede çalışacağını düzenlemeli, eksikleri görmeli, uygun replacement bulmalı ve çalışanlara güncel planı ulaştırabilmelidir.

Kullanıcının özellikle zorunlu tuttuğu özellikler aşağıdadır. Bunların tamamı **P0**, yani ilk kullanılabilir sürüm kapsamındadır; sonraki sürüme ertelenemez.

| ID | Zorunlu özellik | İlk sürümün sağlaması gereken davranış |
|---|---|---|
| REQ-01 | Günlük operasyon planı | Yayınlanmış haftalık Schedule’dan günün çalışanlarını, pozisyonlarını ve vardiya saatlerini getirme |
| REQ-02 | Section/station dağılımı | Kimin hangi pozisyonda, hangi section/station’da çalışacağını düzenleme |
| REQ-03 | Uygunluğa göre replacement | Hedef pozisyon ve saat aralığı için uygun çalışanları gerekçeleriyle arama |
| REQ-04 | Kolay ekleme/çıkarma | Çalışanı bağlamı hazır biçimde ekleme, section’dan çıkarma, taşıma ve uygun işlemleri geri alma |
| REQ-05 | Lokasyonlar arası çalışan takası | İki lokasyondaki görevleri ve çalışanları karşılıklı uygunluk kontrolüyle birlikte değiştirme |
| REQ-06 | Lokasyondan lokasyona çalışan taşıma | Tüm vardiya veya belirli saat aralığı için taşıma; kaynak ve hedef etkilerini gösterme |
| REQ-07 | Extra line | Çalışansız açık görev satırı veya çalışan atanmış ek görev oluşturma |
| REQ-08 | Günün notları | Gün, lokasyon, servis ve section kapsamlarında not ekleme ve görünürlüğünü belirleme |
| REQ-09 | Share | Görevlendirmeleri ve paylaşılabilir notları önizleyerek sürümlü paylaşma |
| REQ-10 | Acknowledge | Çalışanın ilgili plan sürümünü okuduğunu açıkça onaylaması; yöneticinin takibi |

Bu gereksinimler kullanıcı tarafından açıkça istenmiştir. Belgedeki ayrıntılı yerleşim, veri modeli ve uygulama sırası bunları gerçekleştirmek için önerilen tasarımdır.

## 2. Araştırma kapsamı ve kanıt sınırı

Bu sohbette aşağıdakiler incelendi:

- Aktif uygulamanın Line Up yönetici rotası, bileşenleri ve veri erişimi.
- Line Up API servisleri, paylaşılan şemalar ve ilgili migration dosyaları.
- Schedule uygunluk/çakışma yardımcıları ve ortak scheduling paketi.
- Employee Hub’ın mevcut Line Up tüketimi.
- Line Up paylaşım/export yardımcıları ve mevcut test senaryoları.
- Mevcut mobil tasarımın depodaki görsel kaydı.
- 7shifts ve Deputy’nin günlük roster, replacement, station, notlar ve açık vardiya akışları.
- Nielsen Norman Group’un karmaşık uygulama tasarımı rehberi ve W3C erişilebilirlik kriterleri.

İnceleme sırasında aktif branch `codex/phase-1-foundation` idi. Çalışma ağacında önceden var olan çok sayıda değişiklik bulunuyordu. Kod bulguları bu çalışma ağacındaki gözlemlerdir; release veya hosted ortamın doğrulandığı anlamına gelmez.

Tarayıcıdaki mevcut oturum çalışan rolündeydi. Yönetici Line Up rotası Employee Hub’a yönlendi. Çalışan Line Up ekranının boş durumu canlı görüldü. Yönetici tasarımı kod ve mevcut mobil görsel üzerinden değerlendirildi; yönetici etkileşimleri canlı test edilmedi.

Araştırma sırasında test dosyaları okundu; test paketi çalıştırılmadı. Gerçek restoran yöneticileri veya çalışanlarıyla kullanıcı görüşmesi yapılmadı. Bu belge oluşturulurken önceki inceleme sonuçları birleştirildi; yeni bir runtime doğrulaması yapılmadı.

## 3. Mevcut uygulama envanteri

| Alan | İncelemede görülen durum | Yeni tasarım için sonuç |
|---|---|---|
| Schedule bağlantısı | Günün güncel yayınlanmış vardiyaları okunuyor; operasyon değişiklikleri ayrı kayıtlarla uygulanıyor. | Yayın geçmişini koruyan temel değerlendirilmeli. |
| Yönetici ekranı | Lokasyon ve servis gruplarında çalışan, pozisyon, section, station ve call-off alanları var. | Deneyim günlük operasyon etrafında yeniden düzenlenmeli. |
| Çalışan arama | İsim araması; `Off today`, `Working elsewhere`, `Already scheduled here` grupları var. | Hedef pozisyon/saat aralığına göre gerçek uygunluk hesabı gerekiyor. |
| Ekleme | İlk job, ilk shift type ve ilk section otomatik seçilebiliyor. | Ekleme hedef operasyon ihtiyacının bağlamını taşımalı. |
| Çıkarma | Henüz overlay kaydı olmayan Schedule satırında mevcut UI işlemi erken dönüyor. | Kaydın oluşum biçiminden bağımsız, tutarlı çıkarma davranışı gerekiyor. |
| Section modeli | Workspace seviyesinde katalog; station serbest metin. | Lokasyon ve servise uygulanabilen section düzeni gerekiyor. |
| Taşıma | Mevcut Line Up move endpoint’i ve satır taşıma kodu var. | Bunlar tam uygunluk, karşılıklı takas ve Schedule tutarlılığının hazır olduğu anlamına gelmiyor. |
| Paylaşım | Önizleme, sürümlü snapshot, metin/PNG/PDF ve native share yardımcıları mevcut. | Dosya oluşturma, ekip paylaşımı, bildirim ve acknowledgement ayrılmalı. |
| Çalışan görünümü | Employee Hub’da son paylaşılan Line Up satırları gösteriliyor. | Kişisel görev, servis brief’i ve sürüm bazlı onay ile genişletilmeli. |
| Kaynak değişimi | Artık geçerli kaynak vardiyası olmayan satırlar `orphaned` olarak işaretleniyor. | Kullanıcıya çözüm sunan uzlaştırma akışı gerekiyor. |

### 3.1 Kod haritası

| Dosya/modül | Rolü |
|---|---|
| [apps/web/src/views/LineupPage.tsx](../../apps/web/src/views/LineupPage.tsx) | Aktif yönetici ekranı, staff drawer, brief ve share UI |
| [apps/web/src/schedule/LineupPage.tsx](../../apps/web/src/schedule/LineupPage.tsx) | Yönetici ekranını yeniden dışa aktaran dosya |
| [apps/web/src/schedule/lineup-data.ts](../../apps/web/src/schedule/lineup-data.ts) | İstemci veri erişimi |
| [apps/web/src/schedule/lineup-share.ts](../../apps/web/src/schedule/lineup-share.ts) | Metin ve görsel paylaşım/export yardımcıları |
| [apps/api/src/schedule/schedule-lineup-routes.ts](../../apps/api/src/schedule/schedule-lineup-routes.ts) | Line Up HTTP sözleşmeleri |
| [apps/api/src/schedule/schedule-lineup-service.ts](../../apps/api/src/schedule/schedule-lineup-service.ts) | Servis ve RPC bağlantısı |
| [packages/shared/src/index.ts](../../packages/shared/src/index.ts) | Mevcut Line Up şemaları |
| [apps/web/src/schedule/lib/shiftEditorEligibility.ts](../../apps/web/src/schedule/lib/shiftEditorEligibility.ts) | Schedule tarafındaki çalışan/pozisyon uygunluğu yardımcıları |
| [packages/scheduling-shared/src](../../packages/scheduling-shared/src) | Ortak zaman, availability ve çakışma kuralları |
| [apps/web/src/views/EmployeeHubPage.tsx](../../apps/web/src/views/EmployeeHubPage.tsx) | Çalışan Line Up görünümü |
| [packages/shared/src/employee-hub.ts](../../packages/shared/src/employee-hub.ts) | Çalışan veri sözleşmeleri |
| [supabase/migrations/20260820100000_schedule_lineup.sql](../../supabase/migrations/20260820100000_schedule_lineup.sql) | Line Up tabloları ve ilk servis fonksiyonları |
| [supabase/migrations/20260907114100_schedule_lineup_entry_move.sql](../../supabase/migrations/20260907114100_schedule_lineup_entry_move.sql) | Mevcut satır taşıma fonksiyonu |
| [supabase/tests/schedule_lineup.test.sql](../../supabase/tests/schedule_lineup.test.sql) | Mevcut veritabanı testleri |
| [apps/web/src/views/LineupPage.test.tsx](../../apps/web/src/views/LineupPage.test.tsx) | Mevcut UI testleri |
| [phase-6a-lineup-mobile-light.png](phase-6a-lineup-mobile-light.png) | Tarihsel mobil tasarım kaydı |

Eski Phase 6A belgesinde çalışan tüketimi ve görsel paylaşım için yazılan kapsam dışı notlar güncel kodun tamamını temsil etmiyor. Bu raporda esas alınan, sohbette incelenen kod durumudur.

## 4. Ürün ve UI/UX araştırması

| Kaynak bulgusu | Bu ürün için önerilen karar |
|---|---|
| 7shifts günlük roster’da planlanan vardiya, pozisyon/station ve uygun entegrasyon varsa clock durumları sunuyor. | Planlanan görev ile fiilen çalışıyor olma bilgisi ayrı gösterilmeli. [Kaynak](https://kb.7shifts.com/hc/en-us/articles/4417513719699-Who-s-Working-Dashboard-Overview) |
| 7shifts Find Cover akışı mevcut vardiyadan başlıyor; adaylar, uyarılar ve yeni vardiya yayını birbirine bağlı. | Replacement eksik kalan görev içinden başlamalı; orijinal görevin geçmişi korunmalı. [Kaynak](https://kb.7shifts.com/hc/en-us/articles/4417505264787-What-to-do-when-an-employee-is-calls-in-sick) |
| 7shifts station’ları birincil rol altında operasyon alanı atamak için kullanıyor. | Pozisyon, section ve station farklı kavramlar olmalı. [Kaynak](https://kb.7shifts.com/hc/en-us/articles/4417513611795-How-to-create-and-assign-stations-on-the-schedule) |
| Deputy önerilerde çakışma, eğitim, availability ve onaylı izin gibi koşulları değerlendiriyor. | Tek bir available rozeti yerine gerekçeli uygunluk sunulmalı. [Kaynak](https://help.deputy.com/hc/en-au/articles/4688700112015-How-do-I-ensure-that-a-team-member-is-recommended-for-a-shift) |
| Deputy henüz teklif edilmemiş boş vardiya ile çalışanların kabulüne açılmış vardiyayı ayırıyor. | Açık görev, teklif gönderildi ve kesinleşti farklı durumlar olmalı. [Kaynak](https://help.deputy.com/hc/en-au/articles/4688698300687-Managing-Open-shifts) |
| Deputy lokasyonlar arası tekliflerde erişim ve uygunluk koşullarını ele alıyor. | Diğer lokasyonlardan aday arama da kapsam ve uygunluk kontrolüne tabi olmalı. [Kaynak](https://whatsnew.deputy.com/offer-shifts-across-locations-5ed3O) |
| 7shifts Log Book yönetici notlarını ayrı erişim alanında tutuyor. | Ekibe açık brief ile yönetici notları farklı görünürlük taşımalı. [Kaynak](https://kb.7shifts.com/hc/en-us/articles/4417520176531-7shifts-101-Log-Book) |
| NN/g ayrıntıların bağlama göre açılmasını ve ana işten kopmadan erişilmesini öneriyor. | Sürekli input kalabalığı yerine hızlı işlemler ve bağlamsal yan panel kullanılmalı. [Kaynak](https://www.nngroup.com/articles/complex-application-design/) |

Kaynaklar 6 Eylül 2026 tarihindeki sohbet araştırmasında incelendi. Rakiplerin bütün politika ve izin tercihleri aynen aktarılmıyor; ürün önerileri ayrıca tanımlanıyor.

## 5. Brainstorm: değerlendirilen tasarım yönleri

| Yaklaşım | Güçlü tarafı | Sınırı | Karar |
|---|---|---|---|
| Personel tablosu | Kalabalık ekipte hızlı tarama ve karşılaştırma | Fiziksel servis düzenini zayıf anlatır | P0 ikinci görünüm |
| Section panosu | Alan sahipliği ve açıklar kolay anlaşılır | Çok section varsa filtre gerekir | P0 ana görünüm |
| Günlük zaman çizelgesi | Saatlik açıkları ve devirleri netleştirir | İlk kullanımda daha yoğun | P1; kısmi görev desteği P0 veri modelinde bulunur |
| Restoran floor plan’ı | Masaları ve alanları mekânsal gösterir | Kurulum/bakım maliyeti yüksek; mobilde zor | P2 |

Önerilen deneyim: **section panosu + kompakt personel listesi + aynı ekran içinde replacement/move/swap paneli**.

İki ana görünüm aynı veri ve işlemleri kullanmalı. Görünüm değiştirirken filtre, seçili servis ve kullanıcının çalışması korunmalı.

## 6. Kavramlar ve Schedule ile ilişki

| Kavram | Anlamı | Örnek |
|---|---|---|
| Location | İşletme/lokasyon | Downtown |
| Service | O gün yönetilen servis dönemi | Dinner |
| Position | Çalışanın üstlendiği iş | Server |
| Section | Operasyon alanı | Patio |
| Station | Ayrıntılı görev noktası | Masalar 21–26 |
| Assignment | Çalışanın zaman aralığındaki görevlendirmesi | Ayşe, Patio, 17:00–22:00 |
| Coverage need | Karşılanması gereken pozisyon/zaman ihtiyacı | Patio için 18:00–21:00 bir Server |
| Extra line | Eklenen operasyon görev satırı | Çalışansız ek Server ihtiyacı |
| Brief | Ekiple paylaşılacak servis bilgisi | Specials, 86, etkinlik notları |

Bir section birden fazla pozisyon içerebilir. Bir çalışan farklı saatlerde farklı section’larda görev alabilir. Birden fazla görev kartı bulunan çalışan toplam personel sayısında yalnızca bir kez sayılmalı; coverage ise görev aralıkları üzerinden hesaplanmalı.

### 6.1 Yetkili veri kaynağı

Schedule, vardiya ve çalışan görevlendirmesinin yetkili kaynağı olmaya devam etmeli. Section/station dağılımı, servis notları ve operasyon yerleşimi Line Up’ta tutulmalı.

| İşlem | Etkisi |
|---|---|
| Çalışanı aynı lokasyonda Patio’dan Dining’e taşıma | Line Up görev dağılımı değişir. |
| Section’dan çıkarma | Çalışan atanmamış havuza döner; vardiyası sürer. |
| Başka kişiyle replacement | Yetkili Schedule değişikliği ve Line Up eşlemesi birlikte uygulanır. |
| Vardiyası olmayan kişiyi çağırma | Yeni vardiya/görevlendirme oluşturma akışı çalışır. |
| Lokasyonlar arası move/swap | Kaynak/hedef Schedule ve Line Up görevlendirmeleri tutarlı güncellenir. |
| Çalışansız extra line | Operasyon ihtiyacı oluşturulur; personele vardiya atanmış sayılmaz. |
| Extra line’a çalışan atama | Mevcut vardiyadan dağıtım veya yeni Schedule görevlendirmesi olarak doğrulanır. |
| Vardiya iptali/kısaltma | Açık etkisi gösterilen Schedule işlemi gerekir. |
| Call-off | Devamsızlık kaydı ve karşılanmamış görev oluşur; geçmiş korunur. |

Gün içi gerçek vardiya değişikliklerini yöneten kontrollü bir komut katmanı öneriliyor. Mevcut overlay mekanizmasının bunu zaten sağladığı varsayılmıyor. Yayınlanmış geçmiş korunmalı; yeni kesinleşmiş durum bir yayın sürümü veya tanımlı değişiklik kaydı üzerinden izlenmeli.

## 7. Yönetici ekranı ve bilgi mimarisi

Öncelik sırası:

1. Lokasyon, tarih ve servis bağlamı.
2. Müdahale gerektiren açıklar.
3. Çalışanların pozisyon ve section dağılımı.
4. Günün notları ve servis brief’i.
5. Share/acknowledge durumu ve değişiklik geçmişi.

Varsayılan tek lokasyon olmalı. Lokasyonlar arası move/swap, açıkça adlandırılmış işlem olarak erişilebilir olmalı. Birleştirilmiş görünüm daha çok gözetim için kullanılmalı; başka lokasyona taşıma sıradan bir section drag işlemi gibi davranmamalı.

### 7.1 Temsili masaüstü yerleşimi

```text
Line Up
Downtown ▾       ‹  6 Eylül, Pazar  ›       Bugün

Lunch   [Dinner]   Tüm gün
Schedule güncel • Paylaşılan v3 • Paylaşılmamış değişiklikler var

[Açık görevler] [Section atanmamış] [Yanıt bekleyenler]
                              [+ Çalışan] [+ Extra line] [Paylaş]

[Sections] [Personel listesi]     Pozisyon ▾    Durum ▾    Ara…

┌────────────────────────────────────┬────────────────────────────┐
│ PATIO                              │ GÜNÜN NOTLARI / BRIEF      │
│ Server: 2/3 atanmış                 │ Sorumlu: Deniz             │
│                                    │ Briefing: 16:45            │
│ Ayşe • Server • 17:00–22:00         │                            │
│ Masalar 21–26        [Taşı] [•••]   │ 86 / Tükenenler             │
│                                    │ Specials                   │
│ Açık: Server • 18:00–21:00          │ Günün önemli notları       │
│ [Uygun çalışan bul]                │                            │
│                                    │ [+ Not ekle]               │
│ [+ Bu section’a ekle]              │                            │
├────────────────────────────────────┤ Okundu / yanıt bekliyor     │
│ MAIN DINING                        │ [Onayları gör]             │
│ …                                  │                            │
├────────────────────────────────────┤ Son değişiklikler          │
│ SECTION ATANMAMIŞ                  │ [Geçmişi aç]               │
│ …                                  │                            │
└────────────────────────────────────┴────────────────────────────┘

Çalışan menüsü:
Yerine çalışan bul • Section değiştir • Başka lokasyona taşı
Lokasyonlar arası takas • Section’dan çıkar • Gelemiyor
```

“Şimdi” filtresi o anki operasyonu; “Servisin tamamı” yaklaşan görevlendirmeleri de gösterir. Saat ilerlediğinde açık panel veya üzerinde çalışılan satır kendiliğinden yer değiştirmemeli.

## 8. Günlük hazırlık ve section düzenleme

Yönetici tarihi/servisi açtığında günün güncel yayınlanmış vardiyaları otomatik görünmeli. Section ataması olmayan çalışanlar ayrı havuzda bulunmalı. Rastgele section seçilmemeli.

Section yapılandırması:

- Ad, renk ve sıralama.
- Uygulanabileceği lokasyonlar ve servisler.
- İzin verilen pozisyonlar.
- İsteğe bağlı section sorumlusu.
- İsteğe bağlı station/masa etiketleri.
- Gün/servis için açık-kapalı durumu.
- İsteğe bağlı zaman aralığına göre personel ihtiyacı.

“Patio bugün kapalı” işlemi kalıcı section arşivinden ayrı olmalı. İçinde çalışan varsa taşıma seçenekleri gösterilmeli.

İhtiyaç tanımlanmamışsa sistem eksik personel sayısı uydurmamalı. Açık Schedule vardiyaları, extra line ihtiyaçları ve section atanmamış çalışanlar ayrı gösterilmeli.

P1 servis şablonu ve önceki gün düzenini kopyalama eklendiğinde:

- Önizleme sunulmalı.
- Çalışan uygunluğu yeniden kontrol edilmeli.
- Call-off, geçmiş açıklar ve süresi dolmuş notlar otomatik taşınmamalı.

## 9. Kolay ekleme, taşıma ve çıkarma

### 9.1 Bağlamsal ekleme

“Patio → Server ekle” işleminde lokasyon, tarih, servis, pozisyon ve section panelde hazır gelir. Kullanıcı bu bilgileri tekrar girmemeli.

Genel “Çalışan ekle” işleminde gerekli bağlam seçilir. Eksik pozisyon veya saat bilgisi varsa sonuç tam uygun olarak gösterilmez.

### 9.2 Aynı lokasyonda taşıma

“Taşı” işlemi hedef section ve geçerlilik aralığını alır. Tam servis varsayılandır; “18:00’den itibaren” gibi kısmi taşıma desteklenir. Çalışılmış geçmiş değiştirilmez.

### 9.3 Çıkarma anlamları

| İşlem | Sonuç |
|---|---|
| Section’dan çıkar | Atanmamış havuza döner. |
| Görevlendirmeyi kaldır | İlgili operasyon görevi kaldırılır; ihtiyaç devam ediyorsa açık kalır. |
| Gelemiyor olarak işaretle | Call-off ve replacement akışı başlar. |
| Vardiyayı iptal et | Schedule etkisini gösteren ayrı işlem açılır. |

### 9.4 Etkileşim kuralları

- Section değişikliği ve sıralama sonrası geri al sunulur.
- Kesinleşmiş vardiya değişikliğinin geri alınması yeni doğrulanmış ters işlem olarak kaydedilir.
- Drag-and-drop işlemlerinin menü alternatifi bulunur.
- Aynı çalışanı aynı göreve tekrar eklemek yeni satır üretmez.
- Toplu section atamasında çakışan çalışanlar ayrı gösterilir.
- İşlem tamamlanmadan başarı gösterilmez; hata olduğunda seçim korunur.

## 10. Replacement ve aday uygunluğu

Replacement çalışan kartından veya açık görevden başlar.

Örnek: Ali Dinner servisinde 17:00–23:00 Server olarak Patio’da çalışacaktı ve gelemiyor.

1. Yönetici “Gelemiyor” veya “Yerine çalışan bul” seçer.
2. Hedef görev hazır gelir: Server, Patio, 17:00–23:00.
3. Uygun adaylar gerekçeleriyle listelenir.
4. Yönetici doğrudan atama veya teklif gönderme yolunu seçer.
5. Kesinleştirmede uygunluk tekrar kontrol edilir.
6. Eski görevin geçmişi korunur; replacement bağlantısı ve güncellemeler kaydedilir.

Servis başladıysa başlangıç için şimdi veya seçilen devir saati önerilir. Geçmiş çalışma saatleri replacement’a aktarılmaz.

### 10.1 Aday paneli

```text
Replacement bul
Server • Patio • 17:00–23:00

[İsim ara…]
[Bu lokasyon] [Diğer yetkili lokasyonlar]
[Tam aralık] [Kısmi uygunluğu da göster]

UYGUN
Ayşe — Server • 17:00–23:00 uygun
Çakışma yok • Çağrıya yanıt bekleniyor
[Atama detayları] [Teklif gönder]

KISMEN UYGUN
Mehmet — 19:00–23:00 uygun
17:00–19:00 arası açık kalır
[Kısmi replacement planla]

MEVCUT GÖREVİNDEN TAŞINABİLİR
Ece — Şu anda Dining’de görevli
Taşınırsa Dining’de 1 Server açığı oluşur
[Taşıma etkisini incele]
```

### 10.2 Zorunlu kontroller

| Kontrol | Karar |
|---|---|
| Aktif çalışma ilişkisi/Schedule’a dahil olma | Uygun olmayan çalışan atanamaz. |
| Pozisyon ve lokasyon yetkisi | Hedef göreve uygun olmalı. |
| Shift type uygunluğu | Mevcut kural sistemiyle tutarlı olmalı. |
| Hedef aralığı kapsayan availability | Vardiyası olmamasıyla karıştırılmamalı. |
| Onaylı time-off | Çakışan aralık engeldir. |
| Diğer yayınlanmış vardiyalar | İlgili tüm lokasyonlarda kontrol edilir. |
| Kesinleşmiş günlük görevlendirmeler | Aynı kişi iki ihtiyacı eşzamanlı karşılamaz. |
| Kendi mevcut vardiyası | Section taşımasında ikinci vardiya gibi sayılmaz. |
| Belge/yetkinlik kuralları | Uygulanabilir merkezi kurallardan gelir. |
| Lokasyonlar arası geçiş | Geçiş süresi ve başlayabileceği saat değerlendirilir. |
| Attendance verisi | Varsa kaynağı ve güncelliği gösterilir. |
| Çalışanın yanıtı | Takvim uygunluğu ile teklif kabulü ayrı tutulur. |

Sonuç sınıfları: **Uygun**, **Kısmen uygun**, **Mevcut görevinden taşınabilir**, **Doğrulama gerekli**, **Uygun değil**.

Varsayılan sıralama; tam aralığı karşılayan ve engeli olmayan adaylar, aynı lokasyon uygunluğu, pozisyon/yetkinlik eşleşmesi, çalışma tercihi/gönüllülük ve kısmi seçenekler üzerinden açıklanabilir olmalı. Maaş veya belirsiz çalışan puanı varsayılan sıralama ölçütü olmamalı.

Availability kaydında uygun görünmek, kişinin çağrıya gelmeyi kabul ettiği anlamına gelmez. Bu iki durum UI’da ve veri modelinde ayrılmalı.

## 11. Lokasyonlar arası move ve swap — zorunlu P0

### 11.1 Lokasyondan lokasyona taşıma

Çalışan kartında “Başka lokasyona taşı” işlemi bulunmalı.

1. Kaynak lokasyon, görev ve çalışan hazır gelir.
2. Hedef lokasyon, servis, pozisyon ve section seçilir.
3. Tüm vardiya veya belirli saat aralığı seçilir.
4. Uygunluk ve lokasyonlar arası geçiş süresi kontrol edilir.
5. Kaynakta oluşan açık ve hedefte kapanan ihtiyaç önizlenir.
6. Gereken yetki/onay tamamlanınca iki taraf birlikte güncellenir.

Örnek etki özeti:

> Ayşe 18:00–22:00 aralığında Downtown’dan Marina’ya taşınacak. Downtown Patio’da bir Server açığı oluşacak. Marina’daki açık görev kapanacak. Geçiş için gerekli süre görev planında dikkate alınacak.

Hedef başlangıç ile kaynak bitiş arasındaki geçiş süresi çalışma/ücret hesabında kendiliğinden varsayılmamalı; ilgili mevcut Schedule/Time Entries politikası uygulanmalı.

### 11.2 Lokasyonlar arası çalışan takası

Takas için iki çalışan ve iki görev seçilir. Her çalışanın karşı görevdeki pozisyon, zaman, lokasyon ve yetkinlik uygunluğu ayrı değerlendirilir.

- Bir yön uygun, diğer yön uygun değilse takas kesinleşmez.
- Kısmi takasta değişen aralık açıkça gösterilir; kalan görevler korunur.
- Kontrol, iki eski görevin ilgili aralıklarını birlikte çıkarıp iki yeni görevi ekleyen sonuç üzerinden yapılır. Diğer vardiyalar yok sayılmaz.
- İki taraf tek işlemde kesinleşir; yarım takas oluşamaz.
- Geçmiş çalışma ve attendance kayıtları taşınmaz veya silinmez.

### 11.3 Yetki ve onay

- Yönetici iki lokasyonda da gerekli yetkiye sahipse işlemi tamamlayabilir.
- Yetki yalnızca bir taraftaysa diğer lokasyonun yetkilisine onay isteği gider.
- Onay beklerken gerçek görevler değişmiş sayılmaz.
- Gerekli geçici lokasyon yetkilendirmesi açıkça çözülür; günlük taşıma kalıcı lokasyon kaydını kendiliğinden değiştirmez.
- Kesinleştirme anında yetkiler, vardiya sürümleri ve uygunluk yeniden kontrol edilir.

### 11.4 Paylaşım ve geçmiş

Schedule, Line Up ve Employee Hub aynı kesinleşmiş sonucu göstermeli. İşlem etkilenen çalışanlara ve ilgili yöneticilere bildirilir. Kimin, kimi, nereden nereye, hangi aralıkta ve neden taşıdığı/takas ettiği kaydedilir.

Paylaşılan Line Up sürümlerinin güncellenmesi ve etkilenen çalışanların yeniden onayı, işlemin önizlemesinde açıkça görünmelidir.

## 12. Extra line — zorunlu P0

Extra line gerçek bir operasyon ihtiyacı olarak davranmalı; yalnızca görsel boş satır olmamalı.

Desteklenen biçimler:

1. **Çalışansız görev:** Pozisyon ve zaman ihtiyacı oluşturulur; sonradan uygun çalışanla doldurulur.
2. **Çalışan atanmış ek görev:** Mevcut vardiyadan operasyon dağıtımı veya yeni vardiya/görevlendirme olarak doğrulanır.

Alanlar: lokasyon, tarih, servis, pozisyon, başlangıç/bitiş, section/station, isteğe bağlı kısa not ve isteğe bağlı çalışan.

Örnek:

> Dinner · Patio · Ek Server · 18:00–22:00 · Çalışan atanmadı

Kurallar:

- Üst araç çubuğundan ve section içinden eklenebilir.
- Section içinden açıldığında ilgili bağlam hazır gelir.
- Çalışansız satır açık ihtiyaç sayılır; içinden uygun çalışan aranabilir.
- Aynı ihtiyacın Schedule açık vardiyasıyla eşleşmesi varsa iki kez sayılmaz.
- Aynı çalışanı duplicate satırla iki kez saymaz.
- Yeni çalışma süresi oluşturuyorsa Schedule değişiklik akışını kullanır.
- Satırı doldurmak, slotun kimliğini korur; ikinci slot üretmez.
- Atanmış kişiyi çıkarmak ile ihtiyacı iptal etmek farklı işlemlerdir.
- İptal edilmiş ihtiyacın geçmişi korunur; aktif açık sayısından çıkarılır.

## 13. Call-off ve coverage

Call-off çalışanı görev geçmişinden silmez. Aktif coverage hesabından çıkarır; pozisyon ve açık saat aralığı korunur. Aynı görevde mevcut replacement isteği varsa ikinci istek açılmaz. Özel açıklamalar ekip görünümüne taşınmaz.

Replacement yaşam döngüsü:

```text
Açık → Aday aranıyor → Yanıt bekleniyor → Kesinleşti
                         ↘ İptal / Süre aşımı
```

Teklif gönderilmiş görev, kesinleşene kadar dolu sayılmaz. 17:00–23:00 ihtiyacına 19:00’da başlayan replacement atanması, ilk iki saati kapatmış sayılmaz.

Başka section veya lokasyondan taşımanın yeni bir açık oluşturması işlem öncesinde gösterilmelidir.

## 14. Günün notları ve servis brief’i — zorunlu P0

Desteklenen kapsamlar:

- Gün geneli.
- Lokasyon.
- Servis.
- Section.
- Gerektiğinde belirli pozisyon.

İlk sürüm içerikleri:

- Servis sorumlusu/MOD ve briefing saati.
- Günün öncelikleri.
- Specials.
- 86 / tükenen ürünler.
- Etkinlik veya büyük grup hazırlığı.
- Section’a özel talimatlar.
- Kısa açılış/kapanış kontrol maddeleri.

Notlar serbest metin olarak eklenebilir; ilgili kategori seçilebilir. Önemli not sabitlenebilir. Görünürlük ekibe açık veya yalnızca yönetici olarak belirlenebilir. Geçici nota bitiş zamanı eklenebilir.

“20:00’de grup geliyor” gibi bir not ertesi gün otomatik aktif kalmamalı. Not şablonu kopyalandığında tarih ve geçerlilik kontrolü yapılmalı.

Yönetici-only not paylaşım önizlemesine, çalışan API cevabına veya çalışan export’una dahil edilmemeli. Çalışan için önemli not değişikliği ilgili acknowledgement durumunu yenilemelidir.

## 15. Share — zorunlu P0

### 15.1 Kaydetme ve paylaşım ayrımı

- Düzenlemeler otomatik kaydedilir.
- Çalışan son paylaşılmış sürümü görür.
- Kaydedilmiş fakat paylaşılmamış değişiklikler belirgin gösterilir.
- Paylaşım önizlemesi içerik farkını ve alıcı kapsamını gösterir.
- Lokasyon/servis kapsamı açıkça seçilir.
- İlk paylaşım ilgili ekibe yönelir.
- Sonraki paylaşımda değişiklikten etkilenen çalışanlar varsayılan hedeftir.
- Görevden çıkarılan kişi kendi görevinin değiştiği konusunda bilgilendirilir.

Gerçek Schedule değişikliği gerektiren replacement/move/swap kesinleşmesi yalnızca taslak Line Up değişikliği gibi saklanmamalı. İşlemin çalışanlara etkisi ve paylaşılacak güncelleme kesinleştirme ekranında gösterilmelidir.

### 15.2 Durumların ayrılması

| Durum | Anlamı |
|---|---|
| Kaydedildi | Yönetici düzenlemesi sunucuda duruyor. |
| Paylaşıldı · v4 | Çalışan görünümünde bu sürüm erişilebilir. |
| Bildirim bekliyor/gönderildi/başarısız | Mesaj iletiminin durumu. |
| Görüntüledi | Çalışan sürümü açtı. |
| Okudum | Çalışan ilgili içeriği açıkça onayladı. |

Bildirim hatası paylaşılmış planı geri almamalı. Yeniden deneme aynı sürümü veya bildirimi çoğaltmamalı. Bildirim kanalı durumu, sağlayıcının gerçekten sunduğu kanıtın ötesinde teslim/okunma iddiası üretmemeli.

### 15.3 Export

PNG, PDF ve metin aynı paylaşım içeriğinden üretilmeli. Görselde lokasyon, tarih, servis, sürüm ve paylaşım zamanı yer almalı. Taslak export belirgin taslak işareti taşımalı. Export almak tek başına ekibe paylaşım sayılmamalı.

Paylaşım önizlemesi ile kesinleştirme arasında içerik değişmişse eski önizleme ile yeni içerik yayımlanmamalı; önizleme yenilenmelidir.

## 16. Acknowledge ve çalışan deneyimi — zorunlu P0

Çalışanın ilk gördüğü bölüm kişisel görevi olmalı:

```text
Bugünkü görevin
Dinner · 17:00–23:00
Server · Patio · Masalar 21–26
Servis sorumlusu: Deniz
Son güncelleme: 16:12 · v4

[Değişenleri gör] [Okudum]
```

Devamında kişisel değişiklik özeti, ilgili brief, section ekibi, yetkili kapsamda diğer section’lar ve varsa replacement teklifinin kabul/ret aksiyonları bulunmalı.

Acknowledgement kuralları:

- Onay çalışan, ilgili içerik/sürüm ve zamanla kaydedilir.
- Görüntülemek otomatik olarak “Okudum” sayılmaz.
- Kişisel görev veya ilgili önemli not değişirse yeniden onay gerekir.
- Başka section’ın ilgisiz değişikliği bütün ekibin onayını sıfırlamaz.
- Önceki onay geçmişten silinmez.
- Yönetici gördü/onayladı/bekliyor durumlarını ayırt eder.
- Hatırlatma yalnızca ilgili ve henüz onaylamamış çalışanları hedefleyebilir.

Çalışana yönetici notları, diğer çalışanların müsait olmama gerekçeleri, aday değerlendirmeleri ve özel personel bilgileri gösterilmez.

## 17. Görsel tasarım, mobil ve erişilebilirlik

- Mevcut uygulamanın tema, header, sidebar ve ortak bileşenleriyle uyum.
- Nötr arka plan, belirgin section başlıkları, az sayıda vurgu rengi.
- İlk bilgi katmanında çalışan adı; ikinci katmanda pozisyon, saat ve station.
- Section rengi ile uyarı renginin farklı anlam taşıması.
- Durumların yalnızca renkle anlatılmaması.
- Normal görünümde sürekli açık input/select kalabalığının kaldırılması.
- Temel aksiyonların görünür, ayrıntıların bağlama göre açılması.
- Replacement/move/swap panelinde hedef görev bağlamının korunması.
- Kaydetme hatalarının yalnızca geçici toast içinde kaybolmaması.

Masaüstünde pano ve brief yan yana olabilir. Dar ekranlarda brief ayrı açılır. Mobilde section’lar dikey listelenir; temel işlemler yatay tablo kaydırması gerektirmemeli.

Önerilen mobil dokunma hedefi en az **44×44 CSS px**. Bu ürün tasarım hedefidir; WCAG 2.2 AA hedef boyutu kriteri istisnalarıyla 24×24 CSS px alt sınırını tanımlar. [W3C hedef boyutu kaynağı](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

Drag işlemleri için tıklama/dokunma alternatifi zorunludur. Yalnızca klavye alternatifi bu kriteri tek başına karşılamaz. [W3C dragging kaynağı](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements)

Panel/dialog açılışında focus içeri alınmalı, kapanışta tetikleyiciye dönmeli. Escape desteklenmeli; arka plandaki satır yanlışlıkla aktive olmamalı. Canlı yenilemede focus ve seçim korunmalı.

## 18. Teknik spec

### 18.1 Mantıksal veri modeli

Aşağıdaki nesneler önerilen sözleşmedir; her biri ayrı tablo olmak zorunda değildir.

| Nesne | Sorumluluk |
|---|---|
| `LineupDay` | Workspace, lokasyon, operasyon tarihi ve düzenleme sürümü |
| `LineupService` | Servis aralığı, sorumlu ve brief bağlamı |
| `SectionDefinition` | Yeniden kullanılabilir section tanımı |
| `ServiceSection` | Gün/servis için section düzeni ve açık/kapalı durumu |
| `CoverageNeed` | Pozisyon, section, zaman aralığı ve ihtiyaç adedi; extra line ihtiyaçları dahil |
| `OperationalAssignment` | Çalışan, Schedule bağlantısı, görev aralığı ve section/station |
| `ReplacementCase` | Asıl görev, açık aralık, teklifler ve kesinleşen replacement |
| `LocationTransfer` | Kaynak/hedef görevler, move/swap türü, zaman aralığı ve onaylar |
| `BriefItem` | İçerik, kapsam, görünürlük, önem ve geçerlilik |
| `LineupSnapshot` | Paylaşılmış değişmez içerik ve sürüm |
| `Acknowledgement` | Çalışan, ilgili sürüm/içerik ve okundu zamanı |
| `OperationEvent` | Kim, neyi, ne zaman ve neden değiştirdi |

Yayınlarda yeniden oluşabilen satır kimliklerinden bağımsız kararlı vardiya devamlılık kimliği gerekir. Yeni yayında isim/saat benzerliğine dayanarak sessiz otomatik eşleme yapılmamalı.

### 18.2 Zaman sözleşmesi

- Operasyon tarihi seçili lokasyonun saat dilimine göre belirlenir.
- Görev aralıkları gerçek başlangıç/bitiş anları ve IANA timezone ile ifade edilir.
- Gece yarısını aşan vardiya tek vardiya olarak izlenir.
- Availability kontrolü komşu güne taşan aralıkları kapsar.
- Çakışma hesabı görüntülenen saat metinleri üzerinden yapılmaz.
- “Şimdi” sunucu zamanı ve veri güncelliğine dayanır.
- Sayfa gece yarısında kullanıcının çalıştığı günü sessizce değiştirmez.
- Farklı saat dilimlerindeki lokasyonlar arasında move/swap gerçek zaman aralıkları üzerinden doğrulanır; her tarafın yerel saati gösterilir.

### 18.3 Servis işlemleri

| İşlem | Sözleşme |
|---|---|
| Günlük okuma | Kaynak yayın sürümleri, görevler, ihtiyaçlar, notlar ve paylaşım durumu |
| Aday arama | Hedef pozisyon/aralık, uygunluk, gerekçeler, kapsanan aralık |
| Değişiklik önizleme | Önce/sonra, oluşan açıklar, Schedule etkisi ve uyarılar |
| Değişikliği uygulama | Yetki, sürüm ve uygunluğu tekrar doğrulayan işlem |
| Move/swap önizleme ve kesinleştirme | Her iki lokasyon/görev etkisi, geçiş, yetki/onay ve atomik sonuç |
| Extra line oluşturma/doldurma/iptal | İhtiyaç kimliği ve assignment ilişkisini koruma |
| Teklif ve yanıt | Yaşam döngüsü, süre aşımı, iptal ve kesinleştirme kontrolü |
| Not yönetimi | Kapsam, görünürlük, önem ve geçerlilik |
| Paylaşım önizleme/yayını | Görünür içerik farkı, alıcılar ve snapshot |
| Çalışan okuma/onayı | Yetkili içerik ve sürüme bağlı acknowledgement |
| Kaynak uzlaştırma | Yeni Schedule yayını ile operasyon değişikliklerini eşleştirme |

Mevcut uygunluk yardımcıları ve ortak scheduling kuralları değerlendirilmeli. Tarayıcı filtresi tek güvence olmamalı. Yeni sözleşmelerin kesin endpoint adları uygulama aşamasında mevcut API yapısıyla uyumlu belirlenmeli.

### 18.4 Atomiklik, eşzamanlılık ve bildirim

- Yazmalar beklenen sürüm ve uygun işlemlerde idempotency anahtarı taşır.
- Aday paneli açıkken çalışan başka göreve atanmışsa kesinleştirme tekrar değerlendirilir.
- İki yönetici aynı ihtiyacı iki kez dolduramaz.
- Replacement, Schedule değişikliği, Line Up bağlantısı ve olay kaydıyla birlikte kesinleşir.
- Lokasyonlar arası move/swap kaynak ve hedef değişikliklerini tek işlemde uygular.
- Bildirim olayı aynı transaction’da outbox’a yazılır; dış gönderim sonradan yapılır.
- Teklif kabulü ile kesin atama ayrı durum olabilir; gerekli yönetici onayı tamamlanmadan görev dolu sayılmaz.
- Bir çalışanın taşınan kendi görevi gerektiği kadar hariç tutulur; diğer vardiyaları yok sayılmaz.
- Yönetici-only notlar çalışan payload’ına girmez.
- Line Up işlemleri clock-in/out veya geçmiş time entry kayıtlarını kendiliğinden değiştirmez.

### 18.5 Yetkiler

Mevcut `schedule.lineup.read`, `schedule.lineup.manage` ve `schedule.lineup.share` yetkileri değerlendirilebilir. Gerçek vardiya değişikliği ayrıca Schedule yetkisi gerektirmeli. Section düzenleme yetkisi vardiya iptal etme yetkisine dönüşmemeli.

Workspace ve lokasyon kapsamı sunucuda uygulanmalı. Move/swap iki lokasyonun yetkisini denetlemeli. Çalışan erişimi yalnızca yetkili paylaşılmış içerikle sınırlı olmalı; kendi acknowledgement kaydını oluşturabilmeli.

## 19. Boş, hatalı ve değişmiş durumlar

| Durum | Davranış |
|---|---|
| Schedule yayınlanmamış | Açıklama ve Schedule bağlantısı; yayınlanmış personel gibi gösterim yapılmaz. |
| Yayın var, vardiya yok | Normal boş durum; teknik hata görünümü kullanılmaz. |
| Section yok | Personel listesi kullanılabilir; section oluşturma önerilir. |
| Aday yok | Engel özeti, kısmi aralık ve yetkili diğer lokasyon seçenekleri sunulur. |
| Availability yok | Doğrulama gerekli; otomatik uygun sayılmaz. |
| Attendance gecikmiş | Son güncelleme ve veri gecikmesi gösterilir. |
| Schedule yeniden yayınlanmış | Değişen/silinen vardiyalar için uzlaştırma sunulur. |
| Kaynak vardiya kaldırılmış | Görev inceleme kuyruğuna alınır; sessizce aktif tutulmaz. |
| Schedule yayından kaldırılmış | Önceki snapshot geçmiş olarak korunur; güncel plan uyarısı görünür. |
| İki yönetici çakışmış | Kullanıcının çalışması korunarak karşılaştırma/yeniden uygulama sunulur. |
| Move/swap onayı bekliyor | Kaynak ve hedef görevler kesin değişmiş sayılmaz. |
| Onaydan önce görev değişmiş | Uygunluk ve etki önizlemesi yeniden değerlendirilir. |
| Bildirim başarısız | Sürüm korunur; gönderim yeniden denenebilir. |
| Bağlantı kesilmiş | Son veri güncel değil etiketiyle görünür; kritik atama çevrimdışı kesinleşmez. |

Clock-in bulunmaması tek başına kesin no-show sayılmamalı. Önce “Başlangıç saati geçti, clock-in görülmedi” gösterilmeli; veri gecikmesi ve yönetici değerlendirmesi dikkate alınmalı.

## 20. Ek özellikler ve önceliklendirme

| Özellik | Katkı | Öncelik |
|---|---|---|
| Section sorumlusu/MOD | Kime başvurulacağını netleştirir | P0 |
| Kısmi replacement | Servis başladıktan sonraki açıkları yönetir | P0 |
| Lokasyonlar arası move/swap | Günlük personel dağılımını lokasyonlar arasında düzenler | P0, zorunlu |
| Extra line | Ek operasyon ihtiyacını görünür ve doldurulabilir yapar | P0, zorunlu |
| Günün notları | Operasyon talimatlarını bir araya getirir | P0, zorunlu |
| Sürümlü share/acknowledge | Güncel planın paylaşımını ve alındığını izler | P0, zorunlu |
| Servis şablonları | Tekrarlayan yerleşimi hızlandırır | P1 |
| Canlı attendance | Çalışıyor/molada/henüz gelmedi ayrımı sağlar | P1 |
| Mola coverage | Eşzamanlı personel açıklarını görünür kılar | P1 |
| Servis devir notu | Lunch → Dinner devrini kolaylaştırır | P1 |
| TV/yazdırılabilir brief | Servis öncesi ortak kullanım sağlar | P1 |
| Dengeli section rotasyonu | Geçmiş dağılımla yönetici kararına destek verir | P1 |
| Zaman çizelgesi | Saatlik görev devirlerini ve açıkları anlatır | P1 |
| Masa/floor plan | Mekânsal yerleşim sağlar | P2 |
| Rezervasyon/POS sinyalleri | İhtiyaç önerilerini besler | P2 |
| AI brief özeti/öneri açıklaması | Uzun notları özetler ve nedenleri anlatır | P2 |

AI, uygunluğu belirleyen yetkili mekanizma olmamalı. İlk sürüm için açıklanabilir kurallar yeterlidir. Otomatik personel atama veya herkese çağrı gönderme varsayılan davranış değildir.

## 21. Uygulama planı ve bağımlılıklar

| Aşama | İş | Zorunlu teslimler | Çıkış koşulu |
|---|---|---|---|
| A | Ürün/tasarım sözleşmesi | Pano/listeler; replacement, move/swap, extra line, notlar ve share/ack prototipi | Temel senaryolarda tasarım doğrulanmış |
| B | Kaynak ve veri temeli | Kararlı vardiya kimliği, aralık modeli, section/assignment/coverage ve transfer sözleşmesi | Yeni yayınla eşleme ve gece vardiyası senaryoları doğru |
| C | Uygunluk ve operasyon komutları | Aday servisi, replacement, kısmi kapsama, cross-location move/swap, onay, yarış kontrolü | Uygunsuz atama ve yarım işlem engelleniyor |
| D | Yönetici ekranı | Pano/liste, ekleme/taşıma/çıkarma, extra line, call-off, move/swap paneli, undo | Temel işlemler masaüstü ve mobilde tamamlanıyor |
| E | Notlar ve çalışan paylaşımı | Günlük notlar, brief, snapshot, farklar, alıcılar, Employee Hub, acknowledgement | Yönetici ve çalışan aynı paylaşılmış sonucu görüyor |
| F | Geçiş ve uçtan uca doğrulama | Eski kayıt uyarlama, yetkiler, export tutarlılığı, pilot lokasyonlar | Geçmiş korunuyor; kritik akışlar doğrulanmış |
| G | P1 geliştirmeleri | Attendance, şablonlar, mola/devir, zaman çizelgesi | Her entegrasyonun veri kaynağı ve güncelliği doğrulanmış |

Bağımlılık sırası: **A → B → C → D → E → F**. P1 aşaması G bunun ardından gelir. UI prototipleri erken hazırlanabilir; üretim atama akışları B ve C’nin sözleşmelerini kullanmalıdır.

**P0, A–F tamamlanınca bitmiş sayılır.** Move, swap, extra line, günlük notlar, share veya acknowledge eksikse ilk sürüm tamamlanmış sayılmaz.

### 21.1 Kod organizasyonu

- `views/LineupPage.tsx` ince rota/orchestrator bileşenine dönüştürülür.
- Pano, çalışan kartı, aday paneli, transfer paneli, extra line editörü, brief ve paylaşım ayrı modüllere ayrılır.
- Line Up sözleşmeleri `packages/shared` içinde ayrı modülde toplanır.
- Uygunluk ve zaman kuralları Schedule ile ortaklaştırılır.
- Schedule değişikliği ile operasyon yerleşimi API’de açık komutlarla ayrılır.
- Employee Hub’ın mevcut Line Up tüketimi genişletilir.
- Export yardımcıları yeni snapshot sözleşmesine bağlanır.
- Notification entegrasyonunun mevcut kodu tekrar doğrulanır; yalnızca dosyaların varlığı tamamlanmış entegrasyon kanıtı sayılmaz.

### 21.2 Geçiş ve geri dönüş

- Eski snapshot’lar yeniden yazılmaz.
- Serbest metin station değerleri korunur.
- Kaynağı belirsiz manuel satırlar otomatik Schedule vardiyasına çevrilmez; inceleme gerektirir.
- Mevcut gizli/call-off satırların geçmiş anlamı korunur.
- İlk pilot birbiriyle personel paylaşan sınırlı lokasyonlarda yapılır; cross-location gereksinimi tek lokasyon testiyle tamamlanmış sayılmaz.
- Açılış lokasyon bazında kontrol edilebilir.
- Geri dönüşte eski UI’ın yeni veriyi okuyabilmesi veya güvenli salt okunur görünüm sağlanır.
- Şema dağıtımı, veri uyarlama ve uygulama açılışı ayrı doğrulanır.

## 22. Kabul senaryoları

Bu senaryolar implementasyon sırasında çalıştırılacaktır; bu rapor bunların geçtiği iddiasında bulunmaz.

| ID | Senaryo | Başarı ölçütü |
|---|---|---|
| AT-01 | Haftalık Schedule yayınlandı | Doğru lokasyon gününde doğru vardiyalar görünür. |
| AT-02 | Yeni yayında vardiya saati değişti | Section bağlantısı doğru uzlaştırılır; değişiklik görünür. |
| AT-03 | Çalışan section’dan çıkarıldı | Atanmamış havuza döner; vardiyası iptal olmaz. |
| AT-04 | Henüz overlay’i olmayan satır çıkarıldı | İşlem overlay olup olmamasından bağımsız çalışır. |
| AT-05 | Server replacement aranıyor | Pozisyonu uygun olmayan kişi atanamaz. |
| AT-06 | Vardiyası yok ama onaylı izni var | Uygun grubuna girmez. |
| AT-07 | Aday yalnızca 19:00 sonrası uygun | Önceki saatlerdeki açık korunur. |
| AT-08 | Dining’den Patio’ya taşıma | Kaynakta oluşacak açık önceden gösterilir. |
| AT-09 | İki yönetici çakışan atama yapıyor | İkinci geçersiz kesinleştirme engellenir. |
| AT-10 | İki çalışan aynı teklifi kabul ediyor | Tek kesin atama oluşur; diğer sonuç doğru açıklanır. |
| AT-11 | Vardiya gece yarısını aşıyor | Komşu gün çakışmaları ve timezone doğru değerlendirilir. |
| AT-12 | Share önizlemesinden sonra içerik değişti | Eski önizleme ile yeni içerik paylaşılmaz. |
| AT-13 | Yönetici-only not eklendi | Çalışan ekranına/API cevabına/export’una girmez. |
| AT-14 | Çalışanın görevi v4’te değişti | v3 onayı v4’ü onaylamış sayılmaz. |
| AT-15 | Bildirim gönderimi başarısız | Plan erişilebilir kalır; retry çoğaltmaz. |
| AT-16 | Lokasyon yetkisi kaldırıldı | Sonraki okuma/yazma ve paylaşım erişimleri engellenir. |
| AT-17 | Mobil/klavye/pointer kullanımı | Temel işlemler drag zorunluluğu olmadan tamamlanır. |
| AT-18 | PNG/PDF/Employee Hub karşılaştırıldı | Aynı sürümün çalışanlara açık içeriği tutarlıdır. |
| AT-19 | Çalışan başka lokasyona taşındı | Kaynak ve hedef birlikte güncellenir; açıklar doğru hesaplanır. |
| AT-20 | İki lokasyon arasında takas yapıldı | İki yönün uygunluğu doğrulanır; yarım takas oluşmaz. |
| AT-21 | Takasın bir yönünde pozisyon/availability engeli var | İşlem kesinleşmez; gerekçe gösterilir. |
| AT-22 | Taşıma için geçiş süresi yetmiyor | Çalışan hedef başlangıçta uygun gösterilmez. |
| AT-23 | Yönetici yalnızca bir lokasyonda yetkili | Diğer yetkili onayı olmadan değişiklik kesinleşmez. |
| AT-24 | Transfer onayı beklerken vardiya değişti | Eski önizlemeyle işlem uygulanmaz; yeniden doğrulanır. |
| AT-25 | Kısmi cross-location move/swap | Geçmiş ve değişmeyen aralıklar korunur. |
| AT-26 | Çalışansız extra line eklendi | Açık ihtiyaç oluşur; çalışan atanmış sayılmaz. |
| AT-27 | Extra line dolduruldu | Aynı ihtiyacın kimliği korunur; duplicate slot/personel oluşmaz. |
| AT-28 | Ek görev yeni çalışma süresi gerektiriyor | Schedule değişikliği ve Line Up tutarlı kesinleşir. |
| AT-29 | Günlük önemli not değişti | Yalnızca ilgili çalışanların yeniden onayı gerekir. |
| AT-30 | Çalışan yalnızca planı açtı | Görüntülendi kaydı ile Okudum ayrılır. |
| AT-31 | Görevden çıkarılan çalışan var | Değişiklik bildirimi onu da kapsar. |
| AT-32 | Aynı çalışan farklı görev segmentlerinde görünüyor | Kişi toplamında bir kez, coverage’da doğru aralıklarda sayılır. |
| AT-33 | Geçici notun süresi doldu | Sonraki gün/serviste aktif talimat gibi görünmez. |
| AT-34 | Schedule yayından kaldırıldı | Son snapshot geçmişte korunur; güncel plan durumu doğru açıklanır. |
| AT-35 | Transfer onayından önce yetki kaldırıldı | Kesinleştirmede işlem engellenir. |
| AT-36 | Çalışan taşındı veya replace edildi | Geçmiş time entry ve clock kayıtları kendiliğinden değiştirilmez. |

## 23. Tasarım doğrulaması ve başarı ölçütleri

Implementasyon öncesinde birkaç yönetici ve çalışanla prototip üzerinde şu görevler denenmeli:

1. Yayınlanmış Schedule’dan Dinner düzenini hazırlama.
2. Son dakika call-off için uygun replacement bulma.
3. Kısmi replacement sonrası kalan açığı fark etme.
4. Başka lokasyona çalışan taşıma ve kaynak etkisini anlama.
5. İki lokasyon arasında çalışan takası yapma.
6. Extra line oluşturup uygun çalışanla doldurma.
7. Günlük not ekleme ve doğru ekiple paylaşma.
8. Çalışan olarak değişen görevi bulup onaylama.

Başlangıç tasarım hedefleri: normal section atamasının yaklaşık 10 saniyede, replacement kararının yaklaşık bir dakikada tamamlanabilmesi. Bunlar ölçülmüş sonuçlar veya garanti değil; prototip testinde değerlendirilecek hedeflerdir.

Ölçülecek diğer noktalar: yanlış lokasyon/servis işlemi sayısı, gereksiz tekrar veri girişi, aday gerekçesinin anlaşılabilirliği, açık görevlerin fark edilmesi, paylaşım ile kaydetmenin karıştırılması ve eski onayın yeni göreve ait sanılması.

## 24. İlk sürüm tamamlanma şartı

İlk sürüm; günlük section dağılımı, uygunluğa göre ekleme/replacement, güvenli çıkarma, lokasyonlar arası move/swap, extra line, günün notları ve çalışanlara sürümlü share/acknowledge akışları birlikte çalıştığında tamamlanır.

Floor plan, POS tahmini, gelişmiş zaman çizelgesi ve AI özellikleri P0 tamamlanmasını geciktirmemeli. Canlı attendance entegrasyonu hazır değilken ekran çalışma durumunu uydurmamalı; planlanan görev ve bilinen uygunlukla birlikte veri sınırı açıkça gösterilmelidir.
