# AT20 — Fiziksel saatler, DST ve kayıtlı saat dilimi

Dört cover devri gerçek yerel Auth + HTTP akışında doğrulandı. Vardiya kartına saat değişimi ve tekrarlanan saatin hangi oluşunun kullanıldığı eklendi. **AT20 PARTIAL:** bu kanıt cover devrini ve saat sunumunu tamamlar; gece yarısında kısmi availability'nin tam Exchange akışı ve iki farklı timezone arasındaki swap matrisi ayrıca açıktır.

## Devir ve süre kanıtı

Ayrı sahipli workspace `4e2ae030-9cb3-4067-932b-08b4ce90f75c`. Önceki availability helper ile oluşturulan altı sürümlü/yedi cover senaryolu hazırlık bu dört DST testine ek başarı olarak sayılmaz. Hiçbir eski QA çalışma alanı değiştirilmedi.

| Senaryo | Los Angeles duvar saati | Kayıtlı fiziksel aralık | Gerçek süre |
|---|---|---|---|
| Sonbahar geçişi, 1 Kasım 2026 | 00:30–02:30 | 07:30Z–10:30Z | 3 saat |
| İlkbahar geçişi, 14 Mart 2027 | 01:30–03:30 | 09:30Z–10:30Z | 1 saat |
| İkinci 01:30, 7 Kasım 2027 | 01:30–02:30 | 09:30Z–10:30Z | 1 saat |
| Normal gece vardiyası, 1 Aralık 2026 | 22:00–02:00 | 2 Aralık 06:00Z–10:00Z | 4 saat |

Her senaryoda owner cover oluşturur, uygun çalışan gerçek pickup gönderir, manager preview geçer. Dört talep karar beklerken fixture lokasyonunun timezone'u Los Angeles'tan New York'a değiştirilir. Kaydedilmiş shift timezone, başlangıç/bitiş anları ve rıza fingerprint'i korunur; uygunluk hâlâ eligible'dır. Manager onayına kadar owner aynı kalır, sonra doğru çalışana geçer. Son okumada fiziksel aralıklar tekrar doğrulanır.

Lokasyon `finally` içinde eski haline döndürülür. [API raporu](matrix.json): **4 completed / 4 transfer / açık case0 / lokasyon America/Los_Angeles**. Tekrar çalıştırma `new_transfers=0`; yeni devir yapılmaz, güncel API/DB durumu okunur. Assignment ve audit geçmişi korunur. Shift hazırlığı ve fixture lokasyon değişikliği SQL'dir; cover/pickup/preview/final komutları gerçek HTTP'dir. Settings timezone edit UI kanıtı değildir.

## UI sözleşmesi

- Görünen timezone öncelikle vardiyaya kaydedilmiş `time_timezone` değeridir. Güncel lokasyon metadata'sı bunu değiştiremez.
- Saat değişiminde Start/End değerlerinin UTC farkı ve gerçek geçen süre açıklaması görünür. Duvar saati farkı çalışma süresi olarak yeniden hesaplanmaz.
- Aynı saat iki kez yaşanıyorsa **First occurrence / Second occurrence** açıkça gösterilir. Bu ifade sunucunun kayıtlı fiziksel anını açıklar; yeni bir fold seçimi yapmaz.
- Gece yarısı bilgisi mümkün olduğunda fiziksel başlangıç/bitişin kayıtlı timezone'daki tarihlerinden alınır. Normal gece vardiyasına gereksiz DST uyarısı eklenmez.
- Onaylanmamış saatler için `Hours need confirmation` korunur. Hatalı/unavailable timezone bütün request history görünümünü çökertmez; hayali UTC farkı üretilmez.

Tekrarlanan saat kontrolü, kayıtlı anın yakınındaki gerçek offset farkını kullanır; bir saat sabitlenmez. Lord Howe'un 30 dakikalık tekrarı component testindedir. Bu test yeni server eligibility veya timezone kuralları oluşturmaz.

**61/61 web testi:** Hub47, card8, client5, dialog1. Kart testleri spring/fall sürelerini, birinci/ikinci tekrarı, 30 dakika farkını, saved timezone'u, normal overnight ve unconfirmed/invalid gösterimi kapsar. Typecheck, hedefli ESLint ve Vite build PASS.

## Browser kapsamı

Normal UI password login ile manager ve yeni vardiya sahibi ayrı oturumlarda dört tamamlanmış isteği açar. Her kartta gerçek saat/süre/offset, tekrarlanan saat açıklaması ve yeni sorumlu kontrol edilir. Browser bu aşamada yalnız okur; auth injection, response mock veya fake clock yoktur.

[İlk rapor](browser.json), [nihai rapor](browser-final.json). Her koşumda **4 senaryo × 2 rol × 2 görünüm = 16**: 390/light ve 1440/dark. İlk sürüm yalnız UTC farkı gösteriyordu; nihai sürüm tekrarlanan saatin ilk/ikinci oluşunu da söyler. İlk görseller nihai tasarım yerine kullanılmaz. Tam çapraz 390/dark +1440/light, native zoom/reader veya insan tasarım puanı bu sayıya dahil değildir.

[Nihai çalışan tekrar saati](final-casey-2-390-light.png), [nihai manager sonbahar](final-manager-0-1440-dark.png).

Yeni migration, hosted uygulama veya deployment yok. Güncel API kaynaklarından ayrı bundle ve sabit web build kullanıldı. [Kaynak/runtime manifesti](source-sha256.json). G05/G10 ve genel goal açık kapılara bağlı olarak aktiftir.

Cleanup: owned5560/5561 listener PID ve commandline doğrulamasıyla kapatıldı; wrapper exit1 kontrollü durdurma sonucudur. Browser işlemleri exit0; diğer servisler ve ilgisiz WIP korundu. Nihai16görünüm/manifest/syntax/whitespace kontrolleri PASS.

Sonraki tur: midnightpartial ve iki timezone swap kapıları [timezone-swaps kanıtıyla](../timezone-swaps/README.md) tamamlandı. Merkezi AT20 LOCAL; yukarıdaki PARTIAL ifadesi bu eski koşumun kendi sınırını anlatır.
