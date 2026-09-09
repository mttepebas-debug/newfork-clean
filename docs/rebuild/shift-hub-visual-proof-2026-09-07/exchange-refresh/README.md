# Exchange yenileme birleştirme — G07

7 Eylül2026. Önceki exchange-range kanıtında aynı final için45–220ms arayla iki changed sinyali, iki pahalı GET ve nihai25 yüzey P954313ms/reconnect6091ms görülmüştü. İlk dilim useExchangeRealtime ve testlerini değiştirir; ikinci dilim27000 migration ile reader case koleksiyonunun biriktirilmesini iyileştirir. Atama komutları, yetki ve query prefix kapsamı, yanıt sözleşmesi ve UI görünümü korunur.

## Davranış sözleşmesi

İlk sinyal250ms sonra tek yenileme başlatır; sonraki sinyaller pencereyi uzatmaz. Domain/inbox/recovery olayları aynı pencerede birleşir. Hook tarafından başlatılan refresh sürerken gelen bir olay pending olarak kalır; ilk refresh bitince bir takip refresh planlanır. Böylece eski snapshot'a denk gelen devam eden okuma, daha yeni commit sinyalini yutamaz. Bu seri sıra garantisi hook'un başlattığı refresh içindir; başka bileşenlerin bağımsız poll/refetch mekanizmalarını değiştirmez.

Hidden/offline durumda yeni refresh başlatılmaz; visible/online/subscription dönüşü bekleyeni işler. Workspace değişimi veya unmount, kuyruğu ve interval/listener'ları temizler; bitmekte olan eski iş yeni refresh başlatamaz. Query hataları kendi gözlemcilerinde görünür; başarısız batch sonraki sinyal/poll'u kilitlemez.60sn fallback devam eder;250ms birleştirme gecikmesi zaman ölçümüne dahildir. Optimistic owner yazımı yoktur.

## Odaklı kanıt

11 hook testi +33 Hub +10 notification detail =54/54. Gerçek QueryClient/QueryObserver ve kontrollü promise ile: ilk okuma Alex snapshot'ını taşırken Blake commit sinyali gelir; ikinci okuma ilk tamamlanmadan başlamaz, sonuç Blake olur, maksimum eşzamanlı hook okuması1. Burst/recovery birleşmesi,250ms sabit pencere, görünürlük, yabancı workspace/malformed payload, scope cleanup, in-flight cleanup, batch hatasından dönüş ve fallback kapsanır. Unit testteki fake timer browser performans kanıtı olarak kullanılmaz.

Web typecheck, hedefli ESLint ve sabit Vite build PASS. Kaynak hashleri source-sha256.json. 27000 migration yalnız main local üzerinde kuruldu; deploy yoktur. Browser mevcut staffing-immediate API bundle'ı ve güncel local reader ile çalışır; shared dev/Auth servislerine müdahale edilmez.

## Sınır

G01–G10 genel goal açıktır. Gerçek insan UAT, native reader/cihaz, diğer role/cover/eligibility/recovery varyantları ve hosted/pilot tamamlanmış sayılmaz. Sayısal browser sonuçları yalnız bitmiş raporlardan eklenecektir.


## Ölçümle seçilen reader iyileştirmesi

Yalnız coalescer ile25 yüzey30 örnek P953489ms (3sn FAIL), reconnect4025ms (5sn PASS), fallback59478ms (65sn PASS). Bu ara kanıt timings-coalescer-only.json ve fallback-coalescer-only.json içinde korunur.

Yetki sorgusu denemesi scope-profile.json:284 kayıt üzerinde tekrarlanan yetki projection10.327ms, distinct-location projection2.979ms; aynı284/284 sonuç. Ana gecikmeyi açıklayacak ölçekte olmadığından permission cache eklenmedi.

İkinci aday: read loop her adımda büyüyen JSONB case dizisini yeniden birleştiriyordu.27000, case nesnelerini native jsonb[] içinde array_append ile biriktirip sonda to_jsonb ile tek seferde döndürür. Geçici pg_temp klonu rollback içinde denenmiştir. İlk3 çiftte süreler değişkendi (array216–2259ms); sonuçlar saklandı. Sırası dönüşümlü8 çiftte array217–279ms, mevcut423–786ms;285 case/868155 byte, bütün çıktılar birebir aynı. Bunlar yerel SQL/profil ölçümleri; browser P95 yerine geçmez. Probe27000 öncesi reader biçimi için guard içerir ve değişmiş reader'da yeniden çalışmayı reddeder.

Gerçek migration sonrası manager285/employee285/counterpart284 case içeren üç tam yanıt eski modelle eşit. Ek empty-array,2-case sıra ve null counterpart testleriyle reader19 +publication12 +privilege3 =34/34. Native koleksiyon actor yetkisini veya yayın tazeliğini değiştirmez. Main local security advisor error0;27000 migration history kaydı doğrulandı. CLI-generated dosya mevcut ileri tarihli26001 sonrası sıraya taşındı. İzole replay/hosted kurulumu yoktur.


## Nihai25 yüzey /30 örnek

[timings.json](timings.json): coalescer ve27000 reader birlikte, üç normal UI login ve sabit web/API. Schedule, manager+employee Line Up, My Team, üç inbox ve her rolün geçmiş+açık talep detayı25 görünür yüzey.30 yeni ardışık swap; peer kabulünde owner aynı, finalde25 DOM/two-owner/two-version doğru.

**P95 command-start üst sınırı2056ms**, min1382/max2316; **≤3sn kapısı bu swap kapsamı için PASS**. Reconnect2193ms;≤5sn PASS. Offline owner/inbox korunur. Karar sırasında navigation0, HTTP/pageerror/command failure0. Command başlangıcı üst sınırdır; DB commit timestamp ölçümü değildir. Ara coalescer-only30 örnek bu seriye karıştırılmaz. Geçmişteki4313ms→ara3489ms→nihai2056ms sonuçları ayrı kaynak/koşumlarla kayıtlıdır; tüm değişkenler kontrollü deney iddiası yoktur.

Nihai yerel swap kanıtı G07'nin bütün role/cover/staffing varyantlarını veya hosted/pilot kapısını kapatmaz. Sonraki kapsam, staffing ve diğer karar/rol/recovery varyantlarının kalan ölçümleridir; native cihaz/reader ve insan UAT ayrıca açıktır.


## Nihai fallback ve veri

[fallback.json](fallback.json):25 yüzey,389 engellenmiş websocket girişimi, changed sinyali0; gerçek polling sonucu59964ms,≤65sn PASS. HTTP/pageerror/command failure0. Bu son sürümde sağlıklı bağlantı, reconnect ve fallback eşiği test edilen swap kapsamı için birlikte geçer.

[final-data.json](final-data.json):314+314=628 snapshot; her sürüm tek doğru owner. Önceki564 içerik aynı, final Blake/Alex. Ara coalescer-only verisi564 snapshot ve önceki500 içeriğin korunmasını ayrıca kaydeder. Bu tur64 gerçek QA takası/128 snapshot; önceki veriler ve bütün audit kayıtları korunur. SQL profil klonları temp transaction rollback içinde kaldı. Reader27000 haricinde schema değişikliği yok.

schema-state.json:27000 history ve native biriktirme yerel DB'de mevcut; authenticated EXECUTE yok. Kaynak hashleri ve whitespace kontrolü finalde PASS. Dört sahipli browser koşumu terminal/exit0;5560/5561 listener PID/commandline kontrolüyle kapatıldı. Wrapper exit1 ve preview sonrası vite not found, kontrollü cleanup sonucudur; başarılı build'i geçersiz kılmaz. Shared dev/Auth ve ilgisiz WIP korundu.
