# AT20 — Gece yarısı uygunluğu ve farklı timezone takasları

**LOCAL:** Önceki DST ve saved-timezone kanıtına ek olarak iki kısmi gece vardiyasının engellenmesi, uygun gece devri, iki farklı timezone takası ve fiziksel çakışmanın iki yönde engellenmesi doğrulandı. AT20 merkezi kabul satırı LOCAL olarak güncellendi. Native, hosted ve insan UAT kapıları bundan ayrıdır.

Ayrı owned workspace: `87103246-0550-4ff7-b51e-dab6c2f47c35`. Availability/swap başlangıç verileri diğer QA çalışma alanlarını değiştirmez. Ortak helper'ın altı sürümlü/yedi cover hazırlığı bu tur yeni kabul senaryosu olarak sayılmaz.

## Gece yarısındaki availability

Çalışan, 13 Ekim 2026 için tam gün unavailable istisnasını gerçek availability HTTP komutuyla, hafta yayımlanmadan önce kaydeder. Normal haftalık uygunluk diğer günlerde tamdır. 22:00–02:00 Los Angeles vardiyaları:

| Vardiya | Canonical uygun aralık | Sonuç |
|---|---|---|
| 12–13 Ekim | İlk iki saat; bitiş tam 13 Ekim 07:00Z yerel gece yarısı | partial / blocked; direct ve pool list engelli, pickup422/direct422, application0 |
| 13–14 Ekim | Son iki saat; başlangıç tam 14 Ekim 07:00Z yerel gece yarısı | partial / blocked; aynı negatif kapılar |
| 14–15 Ekim | Dört saatin tamamı | full / allowed; pickup ve manager final sonrası devir |

İki kısmi case owner komutuyla kapatılır; vardiyalar ilk sahiplerinde kalır. Kısmi uygunluk için sahte pending application yazılmaz. Availability gece yarısı sınırı, kayıtlı assessment'ın yalnız iki saat içerdiği ve UTC endpoint'inin tam yerel gece yarısına eşit olduğu kontrol edilerek doğrulanır.

## İki timezone ve gerçek çakışma

Lokasyon A Los Angeles, B New York olarak hazırlanır. Bunlar sentetik test lokasyonlarıdır; bu test ulaşım süresi varsaymaz, AT22 ayrıca açıktır.

1. **Pozitif fiziksel ayrım:** A'nın Los Angeles 19 Ekim 16:00–20:00 vardiyası, Casey'nin New York 20 Ekim 19:00–23:00 vardiyasıyla takas edilir. Casey'nin New York'ta 19 Ekim 16:00–17:00 ek published ataması da vardır. Duvar saatleri örtüşse de UTC aralıkları çakışmaz. Listede eşleşme bulunur; peer kabulü → iki taraf eligible preview → manager final başarılıdır.
2. **İki gece vardiyası:** Los Angeles 21 Ekim 22:00–02:00 ile New York 22 Ekim 22:00–02:00 takas edilir. Her vardiyanın kendi timezone'undaki dört saati ve fiziksel başlangıç/bitişi korunur. İki atama birlikte değişir.
3. **Negatif fiziksel çakışma:** Los Angeles 23 Ekim 16:00–20:00 ile New York'taki ek 23 Ekim 20:00–21:00 ataması UTC'de çakışır. Duvar saatleri tek timezone gibi değerlendirilseydi çakışma görünmeyecekti. Takasın iki yönünde eşleşme gizlenir ve gerçek create422 döner; owner'lar değişmez. Canonical evaluator'ın overlap nedeni ayrıca kaydedilir.

Her başarılı takasta peer kabulü atamaları değiştirmez; finalden hemen önce her iki owner eski değerindedir. Finalden sonra iki yeni owner, her iki vardiyanın `starts_at/ends_at`, duvar saatleri ve `time_timezone` alanları kontrol edilir.

[API matrisi](matrix.json): kapsamdaki **5 case / 3 completed / 2 cancelled / 3 transfer olayı; açık case0**. Buna ek iki fiziksel çatışma yönünde case oluşturulamaz. İki kısmi ve üç çatışma-fixture vardiyası sahiplerinde kalır. Son tekrar `new_rows=0`; önceki devirler yeniden yapılmış sayılmaz. Hazırlık ve salt okunur evaluator doğrulaması SQL, iş akışı komutları gerçek Auth/HTTP'dir; RLS, availability veya yayın guard'ı kapatılmadı.

## Üç rol için UI

Manager, eski owner ve yeni owner normal UI password login ile iki tamamlanmış takası açar. Her iki kartın kayıtlı timezone'u, dört saatlik fiziksel süresi ve güncel sorumlusu kontrol edilir. UTC'de tarih değişmesi sıradan aynı-yerel-gün vardiyasına yanlış `Ends next day` eklemez; iki gece kartının ikisi de doğru next-day etiketini taşır.

[Browser raporu](browser.json): **3 rol × 2 takas × 2 görünüm = 12**, 390/light ve 1440/dark. Yatay taşma0, pageerror0. [Çalışan mobil gece takası](employee-1-390-light.png) ve [manager desktop/dark](manager-0-1440-dark.png) gözle incelendi. Mobilde ikinci kart ve devamı sayfa kaydırmasıyla erişilir. Tam karşı tema/viewport, native zoom/reader veya insan tasarım puanı değildir.

İlk browser kontrolü cover'a ait `Transfer approved` metnini beklediği için durdu; gerçek swap ekranının `Swap approved` metni kullanıldı. [İlk deneme](browser-attempt-1.json) başarı sayısına dahil değildir. Uygulama davranışı bu nedenle değiştirilmedi. Bu tur ürün kodu değişmedi; güncel kaynaklardan Vite/API build ve gerçek browser doğrulaması yapıldı. Önceki 61 UI testi bu tur yeniden çalıştırılmış sayılmaz.

[Kaynak/runtime manifesti](source-sha256.json). Credentials yalnız ignored state'tedir. Assignment ve audit geçmişi yerel kanıt olarak korunur. Yeni migration veya hosted/deploy işlemi yok. AT22 source placement/extra/travel ve diğer G01–G10 kapıları açık; genel goal aktif kalır.

Cleanup: owned5560/5561 PID ve commandline doğrulamasıyla kapatıldı; wrapper exit1 kontrollü durdurma sonucudur. Nihai browser exit0; diğer servisler/ilgisiz WIP korundu. Yerel fixture atamaları ve audit geçmişi korunur; açık test case0.
