# Talep ayrıntısında güncel sorumluluk — G07 / AT32

7 Eylül 2026. Açık ve geçmiş cover/swap ayrıntısı ile bildirim ayrıntısı aynı yayın durumuna bağlı sorumluluk bileşenini kullanır. Her swap kartında iki vardiyanın gerçek güncel sahibi ayrı gösterilir. Onay geçmişi daha sonraki atamayı eski kişiye mal etmez.

## Davranış ve tasarım

- Final onay öncesi iki sahibin sorumluluğu sürer. Yayınlanmış atama varsa Currently responsible ve gerçek kişi; gerçekten boşsa Open shift · No assigned employee görünür.
- Yayından kaldırılmış vardiya Historical details / No longer published; publication bayrağı eksikse Check the published schedule olur. Retained snapshot güncel sorumlu diye gösterilmez.
- Kapalı takasta First shift / Second shift kullanılır. You give / You receive ve gelecekte onaylanacağı vaadi kaldırılır. Tamamlanmış talebin atama kartları daha sonraki değişiklikleri yansıttığını açıklar.
- Gerçek boş vardiya talebi Open shift pickup başlığını kullanır. Yayınlanmış kendi atamasında You etiketi vardır. Mevcut renk, tipografi, yüzey ve responsive kart sistemi korunur.

## Yerel kanıt

- ShiftExchangeHub **27/27** ve NotificationShiftDetails **10/10**: iki owner, geçmiş onay sonrası farklı atamalar, kaldırılmış counterpart, eksik publication ve gerçek open pickup dahil. Hedefli ESLint, build, verifier syntax ve diff whitespace PASS.
- Global web typecheck bu tur **FAIL**: paralel `ScheduleRequestsPage.test.tsx:174,179` getByRole options içindeki `exact` için TS2769. O dosya değiştirilmedi; genel typecheck yeşil sayılmaz.
- [browser-result.json](browser-result.json): üç ayrı gerçek UI login; manager, kaynak çalışan ve karşı çalışan için geçmiş+açık talep toplam **6 görünür detay**. Peer kabulünde sahipler değişmedi; gerçek manager final sonrası altı detay da güncel Blake/Alex atamasını gösterdi. Navigation, HTTP/pageerror ve command failure0.
- Manager ve kaynak çalışan için320/390/768/1440 × light/dark16 durum +390px/200% root font2 durum = **18 layout kontrolü**. Yatay taşma0; iki owner alanı viewport içinde; büyütmede owner font30px. Manager320 light, employee390 text200 ve employee historical-after gözle incelendi. Tam klavye turu/native reader/device veya insan anlama kanıtı değildir.
- Tek final kararında command-start → son DOM gözlemi üst sınırı **4374ms**. Manager history4323/pending4374ms, employee history2724/pending2935ms, counterpart history2930/pending2765ms. Bu tek örnek P95 değildir ve **G07 ≤3sn hedefini kapatmaz**. Raporun PASS değeri doğruluk/layout içindir.
- [final-data.json](final-data.json):188+188 = **376 snapshot**, her sürüm tek doğru owner; önceki374 içerik değişmedi. Sahipli QA case tamamlandı, audit korunur. Migration/deployment yok.

## Koşum geçmişi ve açık işler

İlk harness çağrısı Idempotency-Key eksikliğinde400 aldı; case/atama değişmedi. İkinci koşum peer kabulüne ulaştı, manager linkinde eksik tab=shift-changes nedeniyle detail timeout oldu; atama değişmedi. Final koşum aynı sahipli case'i sürdürdü; duplicate case yaratılmadı. İki başarısız harness raporu da bu klasörde saklanır.

Görsel incelemede Aralık filtresinde Ekim tarihli geçersizleşmiş geçmiş kayıtlar görüldü. Hub filtre fonksiyonu tarih sınırı uygulamıyor; okuma servisi halen raw-open kayıtları aralık dışında da seçiyor. Sonraki teknik öncelik tarih filtresi doğruluğu ve detay okuma/render gecikmesinin ölçülmesidir. Fazla kayıtların4374ms gecikmesine katkısı henüz kanıtlanmış değildir. Focused deep link aralık dışında da erişilebilir kalmalıdır.

Ardından yeterli örnekli performans ve kalan role/eligibility/recovery varyantları gerekir. İnsan UAT, native reader/cihaz ve hosted/pilot kapıları açıktır. Kaynaklar [source-sha256.json](source-sha256.json) ile sabitlenir; bu genel checkout veya release manifest'i değildir. Sahipli5560/5561 runtime'ları PID/commandline doğrulamasıyla kapatıldı; her iki exec wrapper terminal duruma geçti. Preview wrapper'ın cleanup sonrası exit1/`vite not found` çıktısı başarılı build'in hatası değildir. Shared dev/Auth ve ilgisiz WIP korundu.
