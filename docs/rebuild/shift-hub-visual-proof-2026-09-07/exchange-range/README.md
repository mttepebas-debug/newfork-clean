# Shift Hub tarih filtresi ve25 ekran yayılımı

7 Eylül2026. Bu kanıt önceki exchange-assignments incelemesindeki tarih filtresi hatası ve4374ms tek-örnek sonucunu takip eder. Önceki rapor değiştirilmez.

## Kullanıcı sonucu

Liste, From/Through sınırlarını iki uç dahil uygular. Takasın aynı tarafı tarih, lokasyon ve arama koşullarını birlikte sağlamalıdır; bir tarafın tarihi diğer tarafın lokasyonuyla birleştirilmez. Karşı vardiya eşleştiğinde kart o vardiyayı Requested in return etiketiyle gösterir. Location seçenekleri iki tarafı da içerir. Manager karar sayısı aynı filtreleri izler. Doğrudan açılan yetkili talep filtre dışında bile ayrıntıda kalır; açıklaması görünür, listeye geri sızmaz. Boş durumlar filtreleri açıklar.

## Okuma doğruluğu ve maliyeti

24000 migration, mevcut servis imzası/yetki denetimlerini korur. Kapanmış swap hem kaynak hem karşı tarafın tarihiyle bulunur; sonradan taşınan güncel vardiya dikkate alınır, kaldırılmış yayın varsa retained snapshot tarihi kullanılır. Focused case yalnız tarih sınırını aşabilir; actor erişimini aşamaz. Tek fonksiyon çağrısında aynı stable source tekrar tekrar okunmaz; cache sonraki isteğe taşınmaz. Tarayıcı tarih formatter'ı da sabit kurallarla yeniden kullanılır.

Yeni14 SQL kontrolünden6'sı eski reader'da FAIL, değişiklikten sonra14/14 PASS. Önceki publication12 + privilege3 = toplam29/29. İlk harness owner cancel yerine geçersiz cancel action kullandı; close/reason sözleşmesine düzeltildi. İlk migration denemesi pg_get_functiondef çıktısındaki eksik terminator nedeniyle syntax hatası aldı ve transaction rollback oldu; terminator düzeltmesi sonrası kuruldu. Bu başarısız denemeler local loglarda korunur.

Üç gerçek rolün aralık içi JSON yanıtı eski sonuçla birebir karşılaştırıldı; atama, applications, eligibility, history ve mahremiyet alanlarında fark0. Sadece aralık dışı kayıtlar çıkarıldı. Tek işlem/süre ölçümleri Docker/psql transport dahil; P95 değildir:

|Rol|Önce kayıt/süre|Sonra kayıt/süre|
|---|---|---|
|Manager|207 /1626ms|191 /850ms|
|Employee|205 /901ms|191 /795ms|
|Counterpart|194 /1058ms|190 /702ms|

[read-baseline.json](read-baseline.json), [read-after.json](read-after.json). Bu farkın tamamı tek bir değişkene atfedilmez. Yeni6 UI regresyonuyla toplam43/43; typecheck ve hedefli ESLint PASS. Önceki turdaki paralel typecheck hatası bu koşumda yoktur; o dosyaya dokunulmadı. Build PASS. Main local security advisor error seviyesinde sorun0 ve service-only EXECUTE kontrolleri PASS; bütün warn/performance advisor bulgularının temiz olduğu iddia edilmez.

CLI ile üretilen migration, mevcut ileri tarihli migration sırasını korumak için24000 konumuna taşındı. Yalnız main local kurulup history kaydı/listesi doğrulandı. İzole replay veya hosted kurulumu yapılmadı. Fonksiyon ve yetki yaklaşımı için [Supabase functions dokümanı](https://supabase.com/docs/guides/database/functions) kontrol edildi; changelog index'i markdown üzerinden okundu.

## Kapsam sınırı

G01–G10 genel goal açıktır. Yerel browser doğruluğu ve hız ölçümleri insanın sorumluluğu anladığını, native reader/cihaz kullanımını veya hosted/pilot davranışını kanıtlamaz. Testler sahipli QA vardiyaları ve gerçek API kararları kullanır; geçmiş kayıtları silmez. Paylaşılan Auth/dev servisleri ve ilgisiz WIP korunur.


## Gerçek filtre kullanımı

[filters.json](filters.json): ayrı manager ve employee normal UI oturumlarında tarih aralığı yalnız karşı vardiyanın gününe getirildi; o lokasyon ve güncel karşı kişinin ismi birlikte arandı. Liste yalnız15 Aralık eşleşmelerini Requested in return olarak gösterdi. Eşleşmeyen isimde liste boşaldı. Gerçek klavye Enter ile seçilen talep açıldı; tarih Şubat2027 olunca listeden çıktı fakat aynı case ve iki current owner ayrıntıda korundu. UI POST0, HTTP/pageerror0.320/1440 × light/dark ×2rol =8 yeni görünüm; taşma0. Manager320 light ve employee1440 dark gözle incelendi. Tam40-state veya native reader turu bu ek kontrolle tekrar yapılmış sayılmaz.

İlk25 ekran serisi [timings-initial.json](timings-initial.json):30/30 doğru takas, P95üst2916ms/min1979/max3036, error0. Son incelemede pending manager detail linkindeki hub_view=requests parametresinin manager queue için ready olması gerektiği görüldü. Detay ve iki owner kontrolleri doğruydu; arka queue bağlamı yanlış olduğundan bu seri nihai25 ekran kanıtı olarak kullanılmaz. Çalışan verifier hash'i ayrıca korunur; sonraki koşum doğru manager queue ile yapılır.


## Nihai25 yüzey ve hız kapıları

Doğru manager Ready for review bağlamında [timings.json](timings.json): üç normal UI oturumu; iki hafta/lokasyonun Schedule, manager+employee Line Up, My Team, üç inbox ve her rolün geçmiş+açık exchange detail ekranı =25 görünür yüzey.30 yeni ardışık swap: her peer kabulünde owner aynı, finalde25 DOM/two-owner/two-snapshot doğru. Navigation sırasında değil, önceden açık ekranın güncellenmesi ölçüldü; karar sırasında navigation0, HTTP/pageerror/command failure0.

**P95 command-start üst sınırı4313ms, min2477/max5079: ≤3sn hedefi FAIL.** Reconnect üst sınırı6091ms: ≤5sn hedefi FAIL. Offline owner/inbox korunma kontrolleri geçti. Bunlar DB commit timestamp ölçümü değildir; raporun sample PASS değeri atama ve ekran doğruluğunu ifade eder. goalSummary alanı hız kapılarını ayrıca false tutar. İlk30 örnek bu ikinci seriye karıştırılmaz.

[repeated-read-diagnostics.json](repeated-read-diagnostics.json): tek karar için manager detail45–220ms arayla iki changed sinyali aldı ve iki GET başlattı.5079ms örnekte ilk okuma2818ms, ikinci4648ms; HTTP tamamlanmasının ardından DOM gözlendi. useExchangeRealtime her sinyalde hemen refreshExchangeSurfaces çağırıyor; query invalidation devam eden okumayı yeniden başlatabiliyor. Bu kanıt tekrar okuma yükünü gösterir; gecikmenin tamamını tek nedene veya istemci rendering'e bağlamaz. Sonraki teknik öncelik aynı burst içindeki sinyalleri birleştirmek ve fetch sürerken gelen yeni bir değişimin kaybolmamasını garanti eden takip okumasıdır. Ardından aynı25 yüzey/30 ölçüm ve reconnect/fallback tekrarlanmalıdır.

Kaynak hashleri [source-sha256.json](source-sha256.json). Sabit web build supabase/.temp/exchange-range/web; API mevcut staffing-immediate-20260907 bundle'ı ve yeni yerel reader ile çalıştı. API kaynakları bu tur değiştirilmedi.


## Polling ve kalıcı veri

[fallback.json](fallback.json):25 yüzey, gerçek WebSocket engellemesi387 girişim, changed sinyali0. Sonuç **59889ms**, ≤65sn fallback kapısı bu kapsamda PASS. Bir gerçek final karar; HTTP/pageerror/command failure0. Reconnect ve healthy hız kapılarının başarısızlığı bu sonuçla kapanmaz.

[final-data.json](final-data.json):250+250=**500 snapshot**, her biri tek doğru owner. Önceki376 snapshot içeriği aynı; iki final atama Blake/Alex. İlk30 + nihai30 + reconnect1 + fallback1 =62 gerçek takas,124 yeni snapshot. İlk serinin veri işlemleri/audit'i korunur, performans örnekleri nihai seriye eklenmez. Filtre browser turu atama değiştirmedi.

Sahipli üç browser koşumu terminal/exit0;5560 ve5561 listener PID/commandline eşleşmesiyle durduruldu. Exec wrapper exit1 kontrollü durdurma sonucudur; preview wrapper sonrası vite not found mesajı build başarısızlığı değildir. Shared5555/5556/Auth ve diğer çalışma ağaçları korunur. Kaynak manifestindeki bütün dosyalarda trailing-whitespace kontrolü PASS.
