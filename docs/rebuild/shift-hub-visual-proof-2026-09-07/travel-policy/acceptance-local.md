# AT22 — Yerel kabul tamamlandı

Bu sayfa önceki ortak politika uygulaması, placement/extra kanıtı, [yarış/takas matrisi](races-swaps.md) ve bu turun pickup/Line Up sonuçlarını birleştirir. **AT22 LOCAL**; G05 veya tüm G01–G10 hedeflerinin, hosted teslimin ya da insan UAT'sinin tamamlandığı anlamına gelmez.

## Pickup ve doğrudan teklif

Owned workspace `aa47b0b7-9003-49b8-a14b-af58e51bdf39` içinde26–29Ekim2026 için dört yeni kaynak vardiya ve bağımsız çalışma fixture SQL ile hazırlandı. Kayıtlı minimum30, tüm source vardiyalar09:00–11:00.

| Senaryo | Aday / havuz / komut / karar |
|---|---|
| Diğer lokasyon07:00–08:45 | Aday ve havuz listelerinde görünmez; pickup422, direct create422; başvuru0, owner aynı. |
| Diğer lokasyon07:00–08:30 | Tam30dk sınırı: aday ve havuzda görünür; pickup ve manager final başarılı. |
| Aynı lokasyon07:00–09:00 | Bitişik çalışma uygun; direct create → peer accept → manager final başarılı. |
| Diğer lokasyon11:15–12:00 | Sonraki çalışma için15dk da yetersiz; aday/havuz gizli, pickup422 ve direct create422; başvuru0, owner aynı. |

Tüm employee/manager/ayar işlemleri gerçek Auth+HTTP ile yürütüldü. İki pozitif işlemde owner finalden önce değişmedi. Son kayıtlar2completed/2cancelled/2transfer; olumsuz iki vardiya ilk owner'da. Dört extra kendi UUID'siyle hidden, minimum0geri yüklendi. [API matrisi](pickup.json). Son tekrar new_rows0; kayıtlı olumsuz işlemler yeniden yapılmış sayılmaz, güncel terminal durum/owner/transfer doğrulanır.

## Line Up kısmi takasın iki lokasyonu

`shift_exchange_travel_policy.test.sql` yeni16kontrolle **42/42** geçti. Her senaryo iki09:00–17:00vardiyanın12:00–15:00aralığını takas eder:

| Şirket minimumu | İstenen | Preview ve commit |
|---|---|---|
| 30 | 0 | 30dk |
| 30 | 60 | 60dk |
| 60 | 30 | 60dk |

Her takasın iki seçili intervali doğru yeni owner'a geçti. İki lokasyonda toplam dört açık travel gap, tam beklenen sınırlarda oluştu. Dört residual çalışma aralığı ilk owner'larında kaldı. Actual time kayıtları değişmedi. Bu testler yalnız preview metnine bakmaz; commit sonrası yayımlanmış Schedule satırlarını ve sahiplerini sorgular. Yeni senaryolar transaction sonunda rollback olur. Önceki57test raporu tarihsel olarak26travel+31regresyondu; bu tur yalnız genişletilmiş42traveltesti koşuldu, toplam73koşulmuş gibi sunulmaz.

## Gerçek Line Up browser review

Normal manager UI login →26Ekim Line Up → Manage Lineup QA A → Move location → QA Patio10:00–10:30 → requested travel0 → klavye Enter ile Review impact. Gerçek preview200/allowedtrue/minimum30/effective30; review şirket minimumunu, ayrılacak geçiş süresini ve açık kalacak işi gösterdi.

[Browser raporu](lineup-browser.json):390/1440 × light/dark dört nihai görünüm; document/dialog overflow0, pageerror0. Mobil light ve desktop dark gözle incelendi. Confirmation gönderilmedi: staffing event sayısı değişmedi, source owner aynı; minimum0geri yüklendi. Bu, gerçek preview/UI kanıtıdır; browser final-transfer kanıtı olarak sunulmaz. DB commit kanıtı yukarıdadır.

![Mobil Line Up review](lineup-390-light.png)

İlk iki browser denemesi nested select'in erişilebilir adını exact label olarak eşleştiremedi. Görünen dialog metni/ekran görüntüsü incelendi; mevcut combobox erişilebilir adıyla seçici düzeltildi. Ürün kodu değiştirilmedi. İlk raporlar saklandı; her deneme policy'yi geri yükledi ve atamaları korudu.

## Kanıt kapsamı

AT22'nin kaynak placement'ı ikinci iş saymama, native/legacy extra, ortak travel minimumu, before/after/tam sınır/same-location, pickup/direct/peer/final, swap receiver/giver, policy/final yarışının iki sırası, Line Up move/swap residual ve görünür effective süre çekirdek koşulları yerelde kanıtlıdır. Tüm uç kombinasyonların veya her hosted ortamın kanıtı olduğu iddia edilmez. Native screen reader/tam cihaz klavye turu ve insan görev testi AT38/39'da açık kalır; tüm ürün goal'u aktiftir.

Bu tur yeni migration/ürün kodu yok; mevcut bundle/Vite build kullanıldı. [Kaynak, runtime ve DB manifesti](acceptance-source-sha256.json). Secrets ignored fixture state'te tutulur; mevcut audit ve diğer WIP korunur.
