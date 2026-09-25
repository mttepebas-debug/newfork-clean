# Shift Hub — sonuç odaklı implementation ve UI/UX planı

Tarih: 7 Eylül 2026 · Durum: Uygulama sürüyor; nihai kabul kapıları açık.

Bu belge, çalışanların cover aramasını, gönüllü olmasını ve vardiya takasını manager onayıyla tamamlamasını tasarlar. Kod bitimi başarı ölçütü değildir. Başarı; doğru sorumluluk, anlaşılır ekranlar, doğru atama ve ölçülmüş kullanıcı görevleridir.

Bu belge hedef ve tasarım sözleşmesidir. Güncel uygulama kanıtı [ilerleme kaydında](shift-hub-implementation-progress-2026-09-07.md), senaryo bazlı durum [AT01–AT42 kabul tablosunda](shift-hub-acceptance-audit-2026-09-07.md) tutulur. İlk [etkileşimli görsel yön örneği](shift-hub-design-preview-2026-09-07.html) sentetik verilerle çalışır; backend, gerçek bildirim veya atama içermez. Görsel yön örneği bütün ekranların veya erişilebilirliğin tamamlandığı kanıtı değildir.

## 1. Ürün hedefi ve değişmez sözleşme

**Çalışan kendi vardiyasına cover bulabilir veya takas önerebilir; mevcut sahibi manager bütün gerekli onayları kesinleştirene kadar sorumlu kalır.**

1. Release, atamayı kaldırmaz; cover ilanı açar. İlan açmak manager onayı gerektirmez.
2. Aynı ilana birden fazla uygun çalışan başvurabilir. İlk başvuru vardiyayı kilitlemez.
3. İlan açmak sahibin, başvurmak adayın rızasıdır. Havuzda sahibin ikinci onayı gerekmez.
4. Doğrudan cover ve swap karşı çalışanın açık kabulünü gerektirir.
5. İlan/başvuru/kabul aşamalarında Schedule veya Line Up kişisi değişmez.
6. Final manager onayı ve atama değişimi tek iş sonucudur. Swap'ın iki tarafı atomik değişir.
7. Manager kesin uygunluk engellerini açıklama yazarak aşamaz.
8. Başka aday seçildiği için kapanan talep, manager tarafından reddedilmiş talep değildir.
9. Bildirimin teslimi, okunması veya Line Up acknowledgement sorumluluğun devrini geciktirmez.
10. Sonuç geçmişi silinmez. Her kapanışın nedeni ve aktörü bulunur.

### Kapsam

MVP: tam vardiya cover ilanı; doğrudan cover; gerçek open shift pickup; bire bir swap; çoklu gönüllü; iki yönlü uygunluk; iki lokasyon kapsamı; onay öncesi geri çekme; sonuç geçmişi; manager aday karşılaştırması; Schedule/Line Up/bildirim entegrasyonu; erişilebilir desktop ve mobil.

Bu çalışma: mevcut sidebar ve Home / Schedule / Requests / More mobil gezinmesini korur. Manager Schedule / Line up / Requests hiyerarşisi korunur. Time off kendi yönetim alanında kalır. Mevcut Line Up P0 operasyonları geriye götürülmez.

Sonraki kapsam: kısmi vardiya devri, üç veya daha çok kişili takas, otomatik aday atama, sohbet/pazarlık, çalışanların birbirine ücret önermesi. Mevcut Line Up kısmi operasyonları bu ertelemeden etkilenmez.

## 2. Ölçülebilir hedefler

Hedefler aşağıdaki kanıt olmadan kapatılamaz. Bütün eşikler tasarım/ürün hedefidir; bugün ölçülmüş sonuç değildir.

| ID | Kullanıcı sonucu | Kabul eşiği | Kanıt | Ağırlık |
|---|---|---|---|---:|
| G01 | Onay öncesi kimin sorumlu olduğunu anlama | 5/5 çalışan ilan, başvuru ve peer-kabul durumlarının her birinde mevcut sahibi doğru söyler; hiçbirinde vardiyanın kesin devredildiğini düşünmez | Moderasyonsuz ilk yorum + görev sonrası açık soru; UAT kaydı | 15 |
| G02 | Cover aramayı kolay başlatma | 5 çalışandan en az 4'ü yardım almadan tamamlar; başarılı görevlerin medyanı ≤60 sn; vardiya kartından ilana ≤3 karar adımı | 390 px prototip, ardından gerçek employee oturumu | 10 |
| G03 | Başvuru ve geri çekmeyi yönetme | En az 4/5 yardım almadan doğru vardiyaya başvurur ve geri çeker; her işlem medyanı ≤30 sn; 0 yanlış vardiya başvurusu | Kullanıcı görevi + kalıcı kayıt kontrolü | 10 |
| G04 | Çoklu adayın manager tarafından doğru seçimi | 3 adaydan birini seçme medyanı ≤60 sn; 2/2 manager aday reddi ile ilan kapatmayı ayırt eder; B reddi C/D'yi kapatmaz | Manager UAT + DB/API/E2E | 10 |
| G05 | İki tarafı uygun ve rızalı swap | 4/5 çalışan yardım almadan teklif gönderir, medyan ≤90 sn; zorunlu iki yönlü uygunluk matrisinde 0 yanlış onay | UAT + deterministik DB/API senaryoları | 15 |
| G06 | Tek ve tutarlı kesin atama | Aynı ihtiyaçta 10 eşzamanlı sonlandırma denemesi ×20 tekrarda 1 kazanan; farklı ihtiyaçlarda aynı çalışanın çakışan çift ataması 0; yarım swap 0 | Bağımsız DB bağlantılarıyla yarış raporu, önce/sonra verisi | 15 |
| G07 | Tüm ekranlarda doğru ve zamanında sonuç | Sağlıklı bağlantıda commit→görünür sonuç P95 ≤3 sn, 30 ölçüm; reconnect sonrası ≤5 sn; fallback poll testinde ≤65 sn; yanlış kişi/snapshot 0 | İki gerçek oturum, olay/commit/görünürlük zamanları | 10 |
| G08 | Mobil ve erişilebilir kullanım | 320/390/768/1440 CSS px kritik akışlarda yatay taşma 0; klavye ile tamamlanabilir; %200 metin büyütmede veri/eylem kaybı 0; kritik/ciddi otomatik a11y bulgusu 0 | Ekran görüntüleri, klavye, ekran okuyucu, cihaz kontrolü | 5 |
| G09 | Doğru alıcıya anlaşılır sonuç | Onay/reddetme/seçilmeme/iptal/expiry matrisi %100 doğru alıcı ve deep link; retry'da yinelenen görünür bildirim 0; delivery failure'da atama kaybı 0 | Outbox hata enjeksiyonu + inbox/E2E | 5 |
| G10 | Tutarlı profesyonel görsel kalite | 6 tasarım boyutunda toplam ≥21/24; her boyut ≥3/4; kapatılmamış kritik görsel bulgu 0 | Tasarım inceleme tablosu + employee ve manager rolüyle ekran kanıtı | 5 |

Toplam ağırlık: 100. Goal ilerlemesi = **kanıtla kapanan hedeflerin ağırlık toplamı**. Kısmi kod, test sayısı veya dosya sayısı puan kazandırmaz. G01/G05/G06/G07/G09 açıkken üretim aktivasyonu yapılamaz; diğer hedefler de MVP tamamlanması için zorunludur.

### Ölçüm protokolü

- En az 5 temsilî çalışan, en az 2 gerçek manager; geliştiriciler kullanıcı sayısına dahil edilmez. Katılımcı bulunamazsa UAT hedefi açık kalır, simüle edilmez.
- Küçük örneklem yönlendirici ürün kabulüdür, istatistiksel genelleme değildir. G06 deterministik yarış kanıtıdır, kapasite testi değildir.
- Kullanıcı görev süresi başlangıcı: giriş yapılmış durumda ilgili başlangıç ekranının görünmesi. Bitiş: kalıcı sonuç ekranı. Login ve görevin anlatımı hariç; gerçek gezinme ve ağ beklemesi dahil. Manager bekleme süresi çalışan görev süresine dahil değildir.
- İlk keşif süresi ile öğrenilmiş tekrar ayrı kaydedilir. Yardım verilirse o deneme yardımsız başarı sayılmaz. Hatalı/başarısız denemeler süre istatistiğinden çıkarılsa bile ayrıca raporlanır; gizlenmez.
- Performans ölçümlerinde cihaz, tarayıcı, bağlantı, backend ve migration sürümü yazılır. Süre eşikleri sağlıklı staging bağlantısına aittir; offline senaryo ayrı doğrulanır.
- Kanıt şablonu: goal_id, scenario_id, commit, environment, role, viewport, fixture, expected, observed, duration, artifact, reviewer, measured_at, status.
- Durumlar: NOT_STARTED / IN_PROGRESS / BLOCKED / VERIFIED. Human UAT ve hosted gate durumları ayrı sütunlarda tutulur. Otomatik test VERIFIED olması goal VERIFIED değildir.

## 3. Görsel tasarım sözleşmesi

### Tasarım yönü

Sakin, kurumsal ve günlük kullanım odaklı. Mevcut Employee Hub'ın yeşil/beyaz dili sürer; vardiyanın tarihi ve saati görsel olarak öndedir. Birincil eylem belirgindir. Büyük dekoratif hero, yoğun gradient, cam efekti ve her satırı ayrı kutuya dönüştüren katmanlar kullanılmaz.

**Bilgi hiyerarşisi:** vardiya zamanı → lokasyon/job → mevcut sorumlu → süreç durumu → sonraki eylem → ikincil açıklama.

### Token başlangıç değerleri

Mevcut `employee-dashboard.css` değerleriyle hizalı, Shift Hub kapsamına sınırlı semantik token'lar kullanılır. Global CSS yeniden yazılmaz. Aşağıdaki yeni renk eşleşmeleri uygulanırken kontrast ölçülür; hex değerinin varlığı erişilebilirlik kanıtı değildir.

| Token | Light | Dark başlangıcı | Kullanım |
|---|---|---|---|
| Canvas | #F5F7F3 | #111C17 | Sayfa zemini |
| Surface | #FFFFFF | #1A2A22 | Kart ve detay |
| Ink | #243A32 | #EFF5F0 | Ana metin |
| Muted | #53675B | #B7C8BD | İkincil metin; düşük kontrastlı küçük yazıdan kaçın |
| Border | #DCE5DD | #496353 | Ayırıcı; input sınırı ayrıca 3:1 değerlendirilir |
| Primary | #25624D | #A6D6B8 | Light beyaz yazı; dark koyu yazı |
| Pending | #765215 / #FFF4D8 | #F2D490 / #3A301C | Manager bekleme |
| Information | #285B76 / #EBF3F8 | #B4D7EB / #20323E | Peer yanıtı / yeniden inceleme |
| Success | #205C42 / #EAF5ED | #AEDCBF / #203A2A | Kesinleşmiş sonuç |
| Destructive | #963D38 / #FCEEEB | #F0B1AA / #432A28 | Açık ret / riskli kapatma |
| Neutral | #53675B / #EEF2EF | #C0CEC4 / #2A3830 | Başka aday seçildi, geri çekildi |

- Font: uygulamanın mevcut sans-serif stack'i; yeni font indirmesi yok. Serif marka harfi yalnız mevcut shell bağlamında kalır.
- Başlık: desktop 28/34 px 650; mobil 24/30. Section 18/24 600; vardiya saati 20/28 650; body 14–16/22–24; metadata 13/18. Kritik sorumluluk bilgisi metadata kadar küçültülmez.
- Spacing: 4/8/12/16/24/32. Kart içi 20 desktop, 16 mobil. Sayfa kenarı 32 desktop, 16 mobil; 320 px'te 12.
- Radius: input/button 10, kart 16, durum pill 999. Diyalog dışında güçlü gölge yok; kartta 1 px sınır.
- İkon: mevcut Lucide; 18–20 px, tutarlı stroke. İkon tek başına kritik eylem taşımaz.
- Kontrol yüksekliği: en az 44 px; birincil mobil 48 px. Düğme grupları arasında 8 px; karşıt eylemler bitiştirilmez.
- Animasyon: 120–180 ms renk/opaklık; kritik değişimde yer değiştiren liste animasyonu yok. Reduced motion desteği.
- Metin kontrastı: normal 4.5:1, büyük 3:1; gerekli UI/odak sınırı 3:1. Renk tek başına durum belirtmez.

### Responsive yerleşim

| Genişlik | Çalışan | Manager |
|---|---|---|
| ≥1200 | İçerik max 1200; liste + 360–400 px bağlamsal detay | 320–360 px kuyruk + esnek detay; adaylar detay içinde |
| 768–1199 | Esnek tek liste veya alan yeterliyse iki kolon; detay route/panel | Kuyruk + detay tek sütuna geçebilir; yatay aday tablosu zorunlu değil |
| <768 | Tek kolon; detay ayrı tam ekran; kısa onay bottom sheet | Vardiya kartı → aday listesi → karşılaştırma → son onay |
| 320 | Aynı işlemler ve aynı veri; kontroller alt alta | Hiçbir karar sadece desktop'a bırakılmaz |

Mobil alt navigasyon korunur. Detay route'larında Requests aktif kalır; mevcut exact-path kontrolü yeni nested route'lara uyarlanır. Sticky action alanı `safe-area-inset-bottom` ve klavye görünürlüğünü dikkate alır; son içerik ve odaklanan kontrol gizlenmez.

### Görsel kalite puanlaması — G10

Altı boyut: hiyerarşi, tipografi/okunabilirlik, boşluk/hizalama, etkileşim belirginliği, durum tutarlılığı, responsive/tema bütünlüğü. Her biri 0–4: 0 kullanılamaz; 1 ciddi sorun; 2 çoklu düzeltme; 3 kabul edilebilir ve tutarlı; 4 akıcı ve özenli. Her puanın ekran/senaryo kanıtı ve kısa gerekçesi olmalı. Ortalama, tek boyuttaki yetersizliği örtmez.

## 4. Ekran ve etkileşim envanteri

### E01 — Vardiya detayı: ortak giriş

My Schedule, Next shift, My Team'deki kendi vardiyası ve ilgili bildirim aynı shift_id ile aynı detaya gider. Teammate kartlarında kendi-vardiya eylemi çıkmaz.

Üst: gün/tarih, büyük saat, lokasyon + job; sonra yayımlanmış yerleşim. Eylemler: **Find cover**, **Swap shift**. Aktif case varsa **View request**; ikinci ilan yaratılmaz. Geçmiş/başlamış/iptal durumda açıklamalı pasif durum. Vardiya başka kişiye geçmişse güncel sonuç gösterilir.

### E02 — Find cover oluşturma

İki seçenek: **Offer to eligible teammates** (varsayılan), **Ask a teammate**. Doğrudan teklifte yalnız uygun kişiler; arama ve açık boş durum. Gerekçe isteğe bağlı ve private varsayılan; shift operasyon notundan ayrı.

Kalıcı bilgi: **You remain responsible until a manager approves the transfer.** Ana buton: **Offer shift** veya **Send cover request**. Sonuçta case detayına gidilir. Form kapatılırsa yazılmış veri korunur veya kirli form için çıkış kararı istenir; ikinci gereksiz başarı modalı yok.

### E03 — Available shifts

Başlık: **Shift Hub**. Alt: **Available / My requests / History**. Filtreler: tarih, atanmış lokasyonlar, cover/open türü. Varsayılan uygun vardiyalar; kendi pending başvuruları ulaşılabilir kalır. Yetkisiz lokasyonlar filtreye girmez.

```text
Shift Hub                              My requests 2
Available     My requests     History
[This week] [My locations] [All opportunities]

FRI 11 SEP       6:00–11:00 PM                 [Cover]
Palo Alto · Server
Cover for Alex Morgan
✓ Job and location match · Available for full shift
[Request to cover]                         [Details]
```

Gerçek open shift kartı **Open shift · No assigned employee** gösterir; cover kartı owner adını gösterir. Gönüllü adları adaylara gösterilmez. Başvuru sonrası **Awaiting manager · Not added to your schedule yet** ve **Withdraw request**. Bekleyen vardiya kesinleşmiş saat toplamına veya next shift'e girmez.

### E04 — My requests ve ilan sahibi detayı

Sıralama: **Your response needed → Awaiting manager → Finding cover**. Her satırda mevcut sorumlu ve next action. Time off satırları bu görünüme karışmaz; kendi ekranına bağlantı korunur. Line Up tarafından gönderilen staffing offer'lar aynı action center'a okunur projeksiyonla dahil edilir; ikinci talep oluşturulmaz.

Owner detayında tek vardiya kartı, belirgin **Still your shift**, aday sayısı ve adlar/başvuru zamanları. Owner kişisel uygunluk/izin detaylarını göremez. Aday bazlı owner veto/accept MVP'de yok; son seçimi manager yapar. İlanı geri çekme bütün bağlı aktif adayları etkiler ve sayı gösterir.

### E05 — Cover/swap gelen teklif

Teklif eden, vardiya, eylemin anlamı, expire_at ve sorumluluk görünür. **Accept request / Decline**. Kabul sonrası **Accepted · Awaiting manager**; **Withdraw acceptance** erişilebilir. Peer accept düğmesi asla **Confirm shift** adını almaz.

Swap için **You give / You receive** eşit ağırlıklı kartlar; gün, tarih, saat, lokasyon, job ve gece etiketi her iki tarafta. Saat farkı ve lokasyon değişimi açık. Taraflardan biri uygun değilse engelin mahremiyete uygun açıklaması gösterilir.

### E06 — Swap oluşturma

Kendi vardiyası sabit bağlam. İki yönlü uygun karşı vardiyalarda arama/tarih/lokasyon filtresi. Son ekranda iki kişi için before→after özeti. **Send swap request**. Çalışan kabulünden sonra şartlar değişmişse yeniden rıza istenir; eski kabul yeni vardiyaya taşınmaz.

### M01 — Manager karar kuyruğu

Schedule → Requests → Shift changes. İç kuyruklar: **Ready for review / Finding cover / Awaiting response / History**. Ana sayaç karar verilebilir case sayısıdır; aday sayısı satırda ayrıca bulunur. Sıralama varsayılan shift başlangıcı, sonra en eski hazır talep; başlangıca <4 saat kaldığında metinli **Starts soon**. Bu eşik öncelik göstergesidir, otomatik onay/ret değildir.

Bir shift 5 aday = 1 case / 5 candidates. Swap bir case içinde iki vardiya. Filtre/sıralama/selectedCase URL'de; tarayıcı geri ve notification deep link korunur. Veriyi yenilemek seçimi ilk satıra sıfırlamaz.

### M02 — Aday karşılaştırma ve son karar

Üstte **Current owner: Alex — still responsible**. Aday satırları: ad/avatar baş harfi, başvuru zamanı, **Eligible / Recheck needed / Not eligible**, genişletilebilir nedenler. Varsayılan uygunlar önce, sonra başvuru zamanı; otomatik seçili aday yok. Hassas ücret/izin bilgisi gösterilmez.

```text
Cover request — Fri 11 Sep, 6–11 PM
Palo Alto · Server             Current owner: Alex

( ) Blake     Eligible         Requested 12 min ago
(●) Casey     Eligible         Requested 8 min ago
( ) Drew      Recheck needed   Availability changed

IF APPROVED
Alex → Casey · Same time / location / job
Line Up: Patio, tables 8–12 → Casey
Other 2 requests close as “Another teammate selected”

[Approve transfer to Casey]       [Decline this application]
More: Close cover search
```

Seçim yapınca final preview sunucudan gelir. Preview güncelliği kontrol edilir. Son onay kişiyi ve vardiyayı isimle gösterir. **Decline this application** ile **Close cover search** ayrıdır; kapanış kapsamı ve gerekçe alanı vardır. Manager karar notu ile çalışana gösterilen gerekçe ayrı alanlardır; çalışan ret nedeni açıklamasız bırakılmaz (kısa hazır neden + opsiyonel mesaj yeterli).

### E07/M03 — Sonuç ve history

Onay: veren için **Transfer approved — no longer your shift**; alan için **Shift added — you are responsible**. Başka aday seçilmesi nötr ton. Geri çekme, employee decline, manager rejection, expiration, şart değişimi, başka aday seçimi ayrı nedenlerle saklanır. Timeline kısa özetle başlar; teknik event adları UI'da gösterilmez.

Deep link kapalı isteği açabilir. Kaydı silmek veya eski işlem düğmelerini göstermek yerine sonucu ve güncel Schedule linkini gösterir.

### E08 — Boş, loading, hata ve bağlantı durumları

| Durum | Görünüm / eylem |
|---|---|
| Uygun vardiya yok | Filtre özeti, filtre sıfırla, availability bağlantısı; yetkisiz vardiya bilgisi yok |
| İlanın adayı yok | Owner sorumluluk bilgisi + ilanı geri çek; manager için Finding cover |
| Availability eksik | Kendi kullanıcı bilgisi için Complete availability; başvuru disabled, uygun sayılmaz |
| Loading | Son kart geometrisini koruyan skeleton; gereksiz layout shift yok |
| Bağımsız panel hatası | O panelde retry; bütün sayfa kaybolmaz |
| Stale preview | “This request changed. Review the latest details.” Seçim artık geçerli değilse temizlenir; gerekçe taslağı korunur |
| Offline | Son verinin zamanı + offline bilgisi; mutasyon kapalı; sahte başarı yok |
| Yanıt kayboldu | “Checking the result…” Aynı idempotency key ile durum okunur; kullanıcı tekrar başvurmaya yönlendirilmez |
| Yetki kaybı | Güvenli erişim durumu; cache ve aktif eylemler temizlenir |

## 5. Durum modeli ve iş kuralları

İlan (case), çalışan başvurusu/teklifi (application), taraf rızası (consent), manager kararı (decision) ve kesin atama (assignment) ayrı kavramlardır. İsimler implementasyon öncesi ortak şemada kesinleştirilir; UI string'i state olarak kullanılmaz.

Case türleri: cover, open_pickup, swap. Cover audience: eligible_pool veya direct. Pool'dan direct'e geçiş aynı ihtiyacı iki case'e çoğaltmaz. Bir sahipli vardiyada tek aktif employee change case; bu case altında çoklu gönüllü/teklif bulunabilir. Swap'ın iki vardiyası başka ilişkilerde geçebilir; final karar bütün ilgili ilişkileri revalidate eder.

Case lifecycle: open → completed / cancelled / expired / invalidated. Review stage ayrı hesaplanır: seeking_candidates / awaiting_peer / ready_for_manager / awaiting_other_manager / reconsent_required. Tek adayın reddi case'i terminal yapmaz.

Application lifecycle: invited → pending_manager (accept) veya declined_by_employee; pool başvurusu doğrudan pending_manager. Terminal: approved, rejected_by_manager, withdrawn, closed_other_selected, closed_case_cancelled, expired, invalidated. Uygunluk durumu lifecycle'dan ayrı hesaplanır; eligibility değişimi görünür neden taşır, açıkça terminal olan başvuru gizlice canlandırılmaz.

| Eylem | Diğerleri | Atama |
|---|---|---|
| Owner ilan açar | Başvurular alınır | Owner kalır |
| Bir aday başvurur/kabul eder | Diğer adaylar devam eder | Owner kalır |
| Manager bir adayı reddeder | Diğerleri devam; aday kalmazsa finding_cover | Owner kalır |
| Aday geri çeker | Diğerleri devam | Owner kalır |
| Owner ilanı kapatır | Bağlı aktif başvurular kapanır | Owner kalır |
| Manager aramayı kapatır | Bağlı aktif başvurular kapanır | Owner kalır |
| Manager birini kesin onaylar | İlgili diğer başvurular other_selected | Doğrudan owner→winner |
| Swap counterpart kabulünü çeker | O swap ilerleyemez; ilgisiz teklifler korunur | Herkes kendi vardiyasında |
| Başlangıç anı gelir | Yeni işlem ve onay engelli; aktif case expire | Mevcut owner kalır |
| Maddi koşul değişir | Rıza geçersiz; güncel sürüme yeniden başvuru/kabul | Güncel atama esas |

Maddi koşullar: tarih, başlangıç/bitiş, lokasyon, job, servis veya sorumluluğu değiştiren yerleşim. Yazım düzeltmesi gibi kozmetik değişim rızayı bozmaz; karar kriteri tanımlı alan whitelist'idir. Aynı koşullarla yeniden publication yalnız teknik kimlik değişimiyse stable source üzerinden bağ korunur.

Varsayılan expiry: ilgili vardiya başlangıcı; swap için iki vardiyadan erken başlayan. Erken şirket cutoff'u bu MVP'de zorunlu değildir; sonradan politika olarak eklenebilir. Başlamış vardiya değişimleri mevcut manager günlük operasyon akışına yönlenir.

Onay sonrası rollback employee cancel değildir. Yeni sahibi tekrar cover arar; manager correction ayrı yetkili/audit'li işlem olarak ele alınır.

## 6. Ortak uygunluk ve yetki sözleşmesi

Sunucu authoritative evaluator: actor_scope, employee, target_shift, effective_interval, excluded_exchange_shifts, committed_lineup_assignments → status + reason_codes + checked_at + revision/fingerprint. UI ve API için aynı karar sınıfları kullanılır. SQL/TS kopya iş kuralı yaratılmaz; istemci yalnız server sonucunu sunar.

Hard blockers: yanlış workspace; aktif olmayan erişim/profil; arşiv/termination/Schedule exclusion; vardiya tarihine uygun olmayan başlangıç/assignment; job ve lokasyon eşleşmemesi; availability eksik veya tam aralığı kapsamaması; onaylı izin kesişmesi; published veya bağımsız günlük atama çakışması; tanımlı geçiş süresi yetersizliği; kapalı lokasyon/servis; mevcut zorunlu belge engeli; eski sahibi/koşulu/yayını değişmiş veya başlamış vardiya.

Job assignment, formal eğitim/sertifika yerine geçmez. Yeni bir eğitim veri modeli icat edilmez; mevcut zorunlu qualification/document kuralları bağlanır, olmayan kapasite uygunluk iddiasına eklenmez.

Aralıklar lokasyon ve availability timezone'larıyla UTC instant'a çevrilir; half-open [start,end), overnight ve DST test edilir. Swap'ta iki vardiya çıkarılarak sonuç takvimi hesaplanır. Source-linked Line Up placement aynı vardiyayı ikinci iş gibi saymaz; bağımsız extra assignment ayrıca sayılır. Partial uygunluk tam vardiya devrini açmaz. Tenant dışındaki takvimlere erişilmez.

Kontrol noktaları: listeleme, submit, peer accept, manager preview, final commit. Son karar aynı transaction/lock sınırında tekrar doğrulanır. Line Up, Requests ve Schedule atama yolları ortak yarış korumasına katılır; yalnız UI disabling yeterli değildir.

Cross-location: final karar iki lokasyon kapsamını kapsar. Tek manager her iki yerde yetkiliyse tek karar; değilse her kapsam için yetkili manager vote gerekir. İlk vote hiçbir atamayı değiştirmez; ikinci vote ve final revalidation tek atomik commit'i tetikler. Vote exact candidate + revision'a bağlıdır; aday/koşul değişirse önceki oylar geçersizdir. Reject tüm swap önerisini kapatır; yalnız diğer bağımsız adaylar korunur. Self-approval yasak; owner rolü de tarafsa başka yetkili reviewer gerekir.

## 7. Schedule, Line Up ve bildirim tutarlılığı

### Tek commit sonucu

Onay işlemi şu çekirdek etkileri beraber kaydeder: karar, published assignment (swap iki atama), bağlı başvuruların kapanması, canlı Line Up reconciliation, ilgili paylaşılmış assignment sürüm deltası, audit ve durable outbox. Haricî gönderim transaction dışında yapılır. Herhangi bir çekirdek etki başarısızsa sonuç onaylandı görünmez.

Placement/station korunabilir; person-specific call-off/override/lead otomatik kopyalanmaz. Uygunsuz yerleşim onay önizlemesinde çözülür. Unrelated manager draft, note ve yerleşim WIP'si bu commit'le paylaşılmaz.

Paylaşılmış snapshot immutable. Eski paylaşım varsa yalnız bu kararın etkilediği assignment ve zorunlu bağları için yeni sürüm hazırlanır; önceki paylaşılan brief/notes esas alınır, henüz paylaşılmamış taslak içerik çekilmez. Bu güvenli delta üretilemiyorsa final preview uzlaştırma ister; eski snapshot'ı yeniymiş gibi göstermez. Henüz share yoksa yeni boş share yaratılmaz.

Yeni çalışan yeni assignment'ı acknowledge eder; diğer değişmeyen kişilerin acknowledgement'ı korunur. Eski owner'ın geçmiş receipt'i silinmez. No-longer-assigned kişiye güncel durum bildirimi gösterilir; güncel görev gibi eski snapshot gösterilmez. Line Up edit kill switch aktifse canonical atama değişimini doğru gösteren read projection korunmalı; eski override doğruluk kaynağı olamaz.

Published atamadan önce açılmış edit session/draft için base-revision/fingerprint ve merge kontrolü gerekir. Unrelated draft edit'leri korunur; owner/time alanları çakışıyorsa publish rebase ister. Request approval tek başına yeni atamayı eski draft'ın ezmesine izin vermez.

### Realtime kapsamı

Commit sonrası kapsamlı invalidation: employee-hub, exchange cases/applications, manager requests/counts, published Schedule, employee team schedule, lineup, lineup-operations, lineup-offers, employee-lineup, inbox. Gerçek query key'leri merkezi registry'den alınır; yalnız eski employee-schedule anahtarıyla yetinilmez. İki hafta/lokasyonlu swap her iki kapsamı yeniler.

Sunucu durumu önce gelir; optimistic owner değişimi yok. Event sırası revision ile korunur; eski event yeni sonucu geriye alamaz. Websocket yoksa 60 sn poll ve reconnect refresh; kirli not/selection clean-vs-dirty kurallarıyla korunur. Gizli sekme throttling'i ayrı ölçülür; G07 fallback eşiği aktif sekme içindir.

### Bildirim sözleşmesi

| Olay | Alıcı | İleti / davranış |
|---|---|---|
| pool_opened | Eligible coworkers | Yeni cover fırsatı; mahrem gerekçe yok |
| peer_action_required | Hedef çalışan | Cover/swap yanıtı gerekiyor; case deep link |
| manager_review_ready | Yetkili reviewer'lar | İlk karar verilebilir aday veya peer kabulü |
| additional_application | Owner + aynı manager grubu | Mevcut case bildirimi aday sayısıyla güncellenir |
| application_rejected | İlgili aday; owner timeline | Başvuru reddedildi, devir olmadı |
| transfer_completed | Veren + alan ayrı copy | Artık sende değil / artık senin vardiyan |
| other_selected | Kaybeden aktif adaylar | Başka çalışan seçildi; programın değişmedi |
| cancelled/expired/invalidated | Etkilenen taraflar | Sonuç nedeni; güncel owner bilgisi |
| lineup_assignment_changed | Etkilenen kişiler | Yeni sürüm ve assignment farkı |

Transactional olaylar user/channel tercihleriyle teslim edilir; uygulamadaki kalıcı iş sonucu kapatılamaz. Başlangıç yaklaşınca reminder politikası G09'da test edilen sınırlı/deduped yapıdadır; bu plan zamanlanmış otomasyon kurmaz.

## 8. Uygulama paketleri ve çıkış kapıları

Paketler tamamlanmış dosyalara göre değil, gösterilebilir kullanıcı sonucuna göre kapanır. Zorunlu gate başarısızsa ilgili goal açık kalır. Tahminler kişi-gün bütçesi değildir; ayrıntılı efor mevcut kodla ilk paket sonunda ölçülür.

| Paket | Bağımlılık | Gösterilecek sonuç | Ana hedefler | Çıkış kanıtı |
|---|---|---|---|---|
| P0 Tasarım ve görev prototipi | Yok | Çalışan/manager ekranlarda doğru sırayı, sorumluyu ve sonucu anlar | G01, G02, G03, G04, G05, G08, G10 erken ölçüm | Bütün kritik state'lerin high-fidelity ekranları, 5+2 kullanıcı prototip turu, tasarım puanlaması |
| P1 Güvenli cover dikey dilimi | P0 sözleşmesi | A ilan açar, B/C/D başvurur, manager C'yi seçer; gerçek atama doğru değişir | G01, G03, G04, G06 | DB/API + minimal gerçek UI ve iki oturumlu akış; flag kapalı internal fixture |
| P2 Çalışan günlük kullanım kalitesi | P1 | Aynı akış mobil/desktop'ta akıcı, anlaşılır ve geri alınabilir | G02, G03, G08, G10 | E01–E05/E07/E08 durumları, dark/light, keyboard, timing tekrar |
| P3 Swap ve lokasyon kapsamı | P1, P2 | İki çalışan rızası ve gerekli manager kapsamlarıyla tek atomik swap | G05, G06 | E06, iki yön matrisi, iki-manager vote, withdraw ve concurrency |
| P4 Manager karar deneyimi | P1, P3 | Queue doğru sayar, adaylar karşılaştırılır, ret ve ilan kapatma ayrılır | G04, G08, G10 | M01–M03, 3/10 aday, cross-location, stale preview, role test |
| P5 Line Up, realtime, notifications | P1, P3, P4 | Onay sonucu iki kullanıcı ve manager yüzeylerinde doğru görünür | G07, G09 | Snapshot delta, dirty draft, iki hafta, outbox fail/retry, görünürlük zamanları |
| P6 Bütünleşik kullanıcı kabulü | P2–P5 | G01–G10 gerçek sistemde kanıtlanır | Tümü | Tam E2E, 5 çalışan +2 manager, cihaz/erişilebilirlik, 21/24 görsel score |
| P7 Geçiş ve kontrollü aktivasyon | P6 + hosted teknik gate | Eski veriler doğru görünür, pilotta sorumluluk hatası yaşanmaz | Tümü korunur | Dry-run mapping, staging role smoke, flag/rollback tatbikatı, pilot raporu |

P1'in çekirdek commit sözleşmesi Line Up/outbox extension noktalarını içerir; P5 bağlanana kadar kullanıcı rollout'u yapılmaz. P0 prototip başarıları P6 gerçek ürün UAT'sinin yerine geçmez. Her pakette ilgili frontend/backend eşleşmesi review edilebilir halde teslim edilir; sadece database kodu yazılması kullanıcı sonucunu tamamlamaz.

### Dosya ve sorumluluk haritası

Mevcut dosyalar güncel çalışma ağacından incelenecek. Yeni yollar öneridir; henüz oluşturulmadılar. Ref uygulama salt okunur; schema ve legacy modüller topluca kopyalanmaz.

| Katman | Mevcut girişler | Önerilen değişim |
|---|---|---|
| Shared | packages/shared/src/employee-hub.ts; schedule sözleşmeleri; lineup-operations.ts | exchange case/application/decision/eligibility schema'ları; stabil reason/status enum'ları |
| DB | 20260821100000_schedule_requests.sql; 20260822100000_employee_hub.sql; 20260909000000_lineup_operations_v1.sql | Yeni timestamp'li migration; case/başvuru bağlantısı, rıza/sürüm, ortak evaluator ve atomik karar; tarihî migration edit yok |
| Employee API | employee-hub-service.ts / employee-hub-routes.ts | Liste/detail/preview/submit/respond/withdraw; actor ve workspace binding |
| Manager API | schedule-requests-service.ts / schedule-requests-routes.ts | Grouped queue, aday preview/decision ve scope vote; mevcut time-off davranışı korunur |
| Employee UI | EmployeeHubPage.tsx; ShiftSheet.tsx; EmployeeDashboard.tsx; EmployeeMobileNav.tsx | Yeni employee-hub/shift-exchanges/ bileşenleri; ortak shift detail; nested Requests active state |
| Manager UI | ScheduleRequestsPage.tsx | CaseQueue, CandidateList, TransferPreview, DecisionDialog; time-off tabı bağımsız kalır |
| Schedule | useScheduleRealtime.ts; query key/data katmanı; publish/edit session | Invalidation registry ve stale-base uzlaştırması |
| Line Up | LineupQueue.tsx; EmployeeLineup.tsx; LineupWorkspace.tsx; lineup-data.ts | Ortak action center projeksiyonu, source reconciliation, scoped snapshot delta |
| Notifications | notification catalog/display; request producer; outbox | Semantik olaylar, doğru alıcı, grup/dedupe ve case deep link |
| Kanıt | supabase/tests; ilgili web/api tests; mevcut E2E altyapısı | Kritik invariant, concurrency, keyboard/role/visual ve UAT evidence index |

Gerekli server işlemleri semantik olarak: create_case, submit_application, respond_to_offer, withdraw_application, close_case, preview_decision, record_scope_decision, finalize_decision, get_case_history. Kesin route/RPC adları uygulama paketinde repo kurallarına uydurulur.

## 9. Kabul senaryoları ve izlenebilirlik

| ID | Senaryo | Beklenen sonuç | Goals |
|---|---|---|---|
| AT01 | A ilan açar, aday yok | A kalır; manager onayı istenmez; finding_cover | G01 G02 |
| AT02 | B/C/D başvurur | Üç ayrı aday; tek case | G03 G04 |
| AT03 | B tekrar tıklar/retry | İkinci aktif başvuru yok | G03 G06 |
| AT04 | Manager B'yi reddeder | C/D devam eder | G04 G09 |
| AT05 | B geri çeker | C/D devam; doğru history | G03 G09 |
| AT06 | A ilanı kapatır | Bağlı açık başvurular kapanır; A kalır | G01 G04 |
| AT07 | Manager C'yi onaylar | Owner=C; diğerleri other_selected | G04 G06 G09 |
| AT08 | İki manager farklı kazanan seçer | Bir sonuç; diğeri güncel sonucu görür | G06 |
| AT09 | Withdraw/close ve approve yarışır | Linearize edilmiş tek sonuç | G06 |
| AT10 | Gerçek open shift | Owner null→winner sadece final onayda | G01 G06 |
| AT11 | Direct cover accept/decline/withdraw | Rıza açık; final onaya kadar eski owner | G01 G03 |
| AT12 | Swap counterpart kabul etmez | Manager finalize engelli | G05 |
| AT13 | Sadece A veya sadece B uygun değil | Her iki varyasyonda onay engelli | G05 |
| AT14 | Swap kaynak vardiya hariç tutma | False overlap yok; sonuç takvimi doğru | G05 |
| AT15 | İki lokasyonda tek manager yetkili | İki kapsamla tek final onay | G05 |
| AT16 | Yetki iki manager'a bölünmüş | İlk oy değişiklik yapmaz; ikinci atomik commit | G05 G06 |
| AT17 | İlk oydan sonra koşul/aday değişir | Önceki oy/rıza kullanılamaz | G05 G06 |
| AT18 | Yanlış job/location, arşiv, exclusion | Liste/submit/final katmanlarında engel | G05 |
| AT19 | Availability eksik/kısmi/değişmiş | Full-cover onayı engelli; gerekçe anlaşılır | G05 |
| AT20 | Gece yarısı, DST, iki timezone | UTC aralıkları ve sonuç süreleri doğru | G05 |
| AT21 | Onaylı kısmi izin | Yalnız kesişen aralık engellenir | G05 |
| AT22 | Line Up extra assignment/travel | Çakışma yakalanır; kaynak placement çift sayılmaz | G05 |
| AT23 | Aynı aday iki çakışan vardiyaya onaylanır | Tek uygun atama; diğer talep yeniden değerlendirilir | G06 |
| AT24 | Maddi edit/unpublish/owner change | Stale onay reddi; yeniden rıza/history | G05 G06 |
| AT25 | Koşullar aynı, teknik republish | Stable shift bağlantısı korunur | G07 |
| AT26 | Başlangıç anı gelir | Case expires, eski owner kalır; geç onay yok | G01 G06 |
| AT27 | Eski draft sonradan publish | Yeni owner sessizce ezilemez | G07 |
| AT28 | Eski Line Up kişi override'ı | Canlı owner doğru; kişi durumları kopyalanmaz | G07 |
| AT29 | Share v1 ve unrelated unshared notes | Yeni assignment v2; taslak not sızmaz | G07 G09 |
| AT30 | Eski acknowledge | Eski receipt korunur, yeni çalışan için yeni görev | G07 |
| AT31 | Hiç Line Up share yok | Sahte share yok; Schedule doğru | G07 |
| AT32 | İki hafta/lokasyonlu swap | Tüm ilgili cache ve snapshot kapsamları güncel | G07 |
| AT33 | Outbox fail/retry/duplicate | Atama kalır; bildirim dedupe | G09 |
| AT34 | Yanlış tenant/alıcı/deep link | Veri sızıntısı veya işlem erişimi yok | G09 |
| AT35 | Refetch sırasında not/selection | Dirty veri korunur; geçersiz aday onaylanamaz | G08 |
| AT36 | Offline/response lost/reconnect | Sahte başarı yok; sonuç aynı key ile bulunur | G06 G07 G08 |
| AT37 | 320/390/768/1440; dark/light | Taşma/veri kaybı yok, G10 puanı | G08 G10 |
| AT38 | Klavye/reader/%200 text/safe-area | Eylemler ve sorumluluk erişilebilir | G08 |
| AT39 | 5 employee +2 manager görev turu | Süre, başarı ve anlama eşikleri | G01–G05 G10 |
| AT40 | Legacy veri geçişi | Onaylı boş vardiya eski sahibine geri yüklenmez | G01 G06 |
| AT41 | Self-approval / scope revoked | Final engelli; ayrı yetkili reviewer | G05 |
| AT42 | Manager staffing offer Employee Hub'da | Tek action item, tek underlying teklif; Line Up linki | G03 G07 |

G08 ekran matrisi her viewport'ta available, owner 3 aday, swap karşılaştırma, manager onay ve stale/error; dark/light kombinasyonlarıyla en az 40 temel capture. Uzun isim, büyük metin, 0/1/10 aday varyasyonları ayrıca. Pixel equality yalnız sabit fixture ile; ürün işlev testi screenshot'a indirgenmez.

## 10. Geçiş, aktivasyon ve kapanış

### Mevcut veriler

Önce salt okunur migration dry-run: pending release, gerçek open pickup, peer-waiting swap, accepted swap, terminal history, orphan/stale publication kayıt sayıları. Her sınıf için mapping raporu ve ID eşleştirmesi.

- Pending release ve aynı owner: açık cover case'e taşınabilir; sahip/rıza mevcut kayıtla kanıtlanır.
- Önceden approve edilip boşalmış shift: gerçek open shift olarak kalır; eski owner otomatik atanmaz.
- Pending pickup: mevcut receiver aynı case altında application olur; rıza/revision korunur.
- Swap: participant_response açık consent'e eşlenir; current owner/publication uyuşmazsa invalidated.
- Terminal history: neden/aktör/zaman korunur; eski genel status'u uydurma ayrıntıyla doldurma.
- Belirsiz kayıtlar migration'ı sessizce geçmez; exception list ve manager review. Legacy mutasyon ile yeni mutasyon aynı shift'te birlikte aktif olamaz.

### Doğrulama sırası

1. Şema/state/eligibility DB ve API odaklı testleri; paralel bağımsız bağlantılar.
2. Employee/manager component, query-state, routing ve a11y kontrolleri.
3. Gerçek local rol/oturumlarla dikey E2E ve Line Up proof.
4. UI/UX human UAT ve tasarım puanlaması; sorunlar sonrası yalnız etkilenen görevlerin tekrarı.
5. Paket typecheck/lint/build ve gerekli entegrasyon/regresyon; migration parity ve staging gerçek hesap smoke.
6. Flag kapalı deploy → seçili workspace pilot → goal/evidence incelemesi → kapsam genişletme.

Mevcut doğrulanmış web komutları: `pnpm.cmd --filter @newfork/web typecheck`, `pnpm.cmd --filter @newfork/web test`, `pnpm.cmd --filter @newfork/web lint`, `pnpm.cmd --filter @newfork/web build`. API/DB/E2E komutları uygulama anında mevcut package ve script'lerden doğrulanır; varsayımsal script icat edilmez. Auth/API local sorununda çalışan server'ı sürekli yeniden başlatmak yerine gerçek session/process/DB zinciri incelenir.

Pilot hedefi: en az 7 günlük izlem ve 20 final karar; bu sayı oluşmazsa pilot gözlemi uzar. 0 sorumluluk/atama tutarsızlığı; 0 yetkisiz onay; tekrar eden kritik UX hata yok. Teknik staging senaryoları pilot iş hacmi diye sayılmaz. Gerçek kullanıcı olmadan pilot kapatılmaz.

Kill switch yeni ilan/başvuru/karar yazımını durdurabilir; read/history/sonuç görünürlüğü korunur. Veri doğru kaldığı sürece notification retry devam eder. Rollback eski release→unassign davranışını otomatik geri açmaz; tamamlanmış devirleri geri almaz. Veri migration'ının ters çevrilebilirliği ayrı değerlendirilir.

### Kanıt panosu — başlangıç

| Goal | Teknik | Görsel | Human UAT | Hosted/pilot | Nihai |
|---|---|---|---|---|---|
| G01–G10 (her biri uygulamada ayrı satır) | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED |

Plan/görsel örnek teslimi goal ilerlemesini %100 yapmaz. **Ürün hedefleri başlangıçta %0 doğrulanmış durumdadır.** İlk çalışma P0'daki bütün kritik ekran/state tasarımlarını ve görev prototipini tamamlamaktır. Kod başlangıcından önce gerekli araştırma kullanıcıya tekrar sorulmaz; bu belge varsayılan uygulama sözleşmesidir. Somut çelişki bulunursa etkisi ve seçenekler raporlanır.

## 11. Kaynaklar ve kanıt sınırı

- Önceki bu konuşma: release/cover/swap salt okunur audit ve kabul edilen hedef.
- [Mevcut Employee Hub raporu](employee-hub-implementation-2026-09-06.md): mevcut görsel dil/navigation ve önceki lokal kanıt; yeni Shift Hub kanıtı değildir.
- [Line Up planı](lineup-redesign-spec-and-implementation-plan-2026-09-06.md) ve [yerel ilerleme raporu](lineup-implementation-progress-2026-09-06.md): mevcut operasyon yetenekleri; hosted/pilot sonucu ayrı.
- [7shifts Offer Up](https://kb.7shifts.com/hc/en-us/articles/4417505275795-What-happens-when-an-employee-offers-up-a-shift): onaya kadar owner sorumluluğu.
- [7shifts bidding](https://kb.7shifts.com/hc/en-us/articles/31927861673235-How-to-Bid-on-an-Open-Shift): çoklu aday ve manager seçimi.
- [Deputy approval](https://help.deputy.com/hc/en-au/articles/4688725542415-Open-shifts-with-approval): aday/withdraw/sonuç örnekleri.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/): kontrast, klavye, reflow, hedef boyutu, status message kabul temeli.

Bu dokümanın yazıldığı çalışma ağacı dirty ve paralel WIP içeriyor. Ürün kodu değiştirilmedi. Planın doğrulanması; link/ID/matris tutarlılığı ve görsel örnek smoke'udur, uygulamanın MVP hazır olduğu iddiası değildir.

### Bu plan tesliminde yapılan kontrol

- 10 goal, 8 paket ve 42 kabul senaryosu tanımı sayıldı; JavaScript syntax kontrolü geçti; bozuk Unicode replacement karakteri bulunmadı.
- Bağımsız HTML örneği localhost:5562 üzerinde tarayıcıda açıldı. Ürün dev server'ları yeniden başlatılmadı.
- Demo manager akışında Blake reddedildi; Casey seçilebilir kaldı; Casey onayı sonrası owner görünümünde Casey yeni sorumlu, Blake önceki ret, Drew başka aday seçildi olarak görüldü.
- Demo swap kabulünde Awaiting manager ve mevcut sorumluluğun devamı doğrulandı.
- Varsayılan desktop görseli, 390 px owner sonucu ve 320 px dark swap görünümü incelendi. 390/320 viewport'ta scrollbar hariç client width sırasıyla 375/305 px; scrollWidth aynı, yatay taşma yok. Bütün viewport/state matrisi, kontrast ölçümü, ekran okuyucu ve gerçek cihaz testi henüz yapılmadı.
- Örnekte top-level dört scene düğmesi ve ana senaryo eylemleri çalışır; shell navigation, ürün sekmeleri/filtreleri ve ikinci fırsat kartı görsel örnektir. Demo gerçek uygunluk, atama, network, bildirim veya UAT kanıtı üretmez.
