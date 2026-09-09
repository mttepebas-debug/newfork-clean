# AT19 — Takasın iki tarafı ve açıklanabilir manager incelemesi

**Yerel sonuç:** Sekiz uygunsuz takas girişimi engellendi; üç uygun takas son manager onayıyla iki atamayı birlikte değiştirdi. Manager önizlemesi ve açık onay penceresi artık her çalışanın ayrıntılı uygunluk gerekçesini ve takasa konu iki vardiyayı gösterir.

## Gerçek Auth ve API matrisi

Ayrı owned workspace: `47b9b868-f523-47cc-9488-3c071d31a708`. Test tarihleri 28 Eylül–7 Ekim 2026; gerçek DB tarihi ile aday aramasının 62 günlük kapsamı içinde olduğu doğrulanır. Availability tabanı önceki cover doğrulayıcısıyla bu ayrı workspace'te oluşturulur: altı gerçek employee HTTP submit, yedi cover hazırlık senaryosu. Bunlar aşağıdaki takas sonuçlarına ek test olarak sayılmaz.

| Uygunluk | Kısıtlı vardiyayı alacak kişi | Sonuç |
|---|---|---|
| Henüz geçerli availability yok | Daveti alan / daveti başlatan | İki yönde aday eşleşmesi yok, create422, case0, iki owner aynı |
| Geçici tam gün kısıtı + sonraki weekly | Daveti alan / daveti başlatan | İki yönde create422; sonraki weekly kısıtı silmez |
| Geçici kısmi saatler | Daveti alan / daveti başlatan | İki yönde full-shift takası engelli |
| Tarihli saatlik kısıt + sonraki weekly | Daveti alan / daveti başlatan | İki yönde engelli; tarihli kısıt korunur |
| Tam haftalık uygunluk | Normal yön | Rıza → iki taraf eligible → manager final → iki atama değişir |
| Geçici istisna bitmiş | Ters yönden başlatılan takas | Aynı başarılı uçtan uca sonuç |
| Tarihli istisna bitmiş | Normal yön | Aynı başarılı uçtan uca sonuç |

Üç pozitif senaryonun her birinde, peer kabulünden önce gerçek manager approve **409** döndü. Peer kabulü atamaları değiştirmedi. Kabulden sonra iki çalışan ayrı ayrı yayımlanmış güne unavailable değişikliği göndermeyi denedi: altı HTTP **409**, sürümler aynı, final preview fingerprint aynı. Son geçerli manager onayı iki atamayı birlikte değiştirdi. Guard kapatılmadı, availability veya saat taklit edilmedi.

[API matrisi](matrix.json). Son read-only denetim matristeki üç case'e kapsamlıdır: **3 completed, 3 approved application, 3 transfer olayı, 6 doğru değişmiş atama; 4 kısıtlı vardiya ilk owner'da; workspace'te açık case0.** Tekrar çalıştırma `new_negative=0/new_positive=0`; kayıtlı takaslar yeniden yapılmış sayılmaz.

İlk denemede 2028 vardiyaları gerçek aday aralığının dışındaydı. Uygun pozitif eşleşme kontrolü bu hatayı yakaladı. Bu koşum liste uygunluğu kanıtı değildir ve sekiz nihai sonuca dahil edilmez. Eski yerel kayıtlar/audit korunur; yeni workspace ve tarih kontrolüyle matris baştan yürütüldü. Önceki cover kanıtının kendi workspace'i değişmedi; tekrar kontrolünde 7 case/3 transfer/6 version aynı kaldı.

## UI değişikliği ve görsel kanıt

Sunucu preview'sindeki `receiver` ve `giver` ayrıntıları manager'a isimle bağlanır. “Receiving the offered shift” / “Receiving the requested shift” açıklamaları hangi tarafın neden uygun olmadığını gösterir. Tekrarlanan aynı gerekçeler ayıklanır. Başarısız veya eski preview için onay açılmaz; özel not korunur. Başka çalışanın ayrıntılarını employee aday listesine ekleyen bir değişiklik yapılmadı.

Görsel inceleme ayrıca aktif takas confirmation'ının yalnız ilk vardiyayı gösterdiğini ortaya çıkardı. Artık **Offered shift / Requested shift** kartları desktop'ta yan yana, mobilde alt alta. Sonuçlanmış isteğin mevcut atama/historical gösterim kuralları korunur.

**53/53 web testi:** Hub47, API client5, dialog1. Yeni kontroller iki tarafın partial/unknown açıklaması, duplicate nedenler ve açık confirmation güncellenirken iki shift kartının korunmasını kapsar. Typecheck, hedefli ESLint ve Vite build geçti.

İki ayrı gerçek browser denemesi normal manager UI login ile başladı. Geçerli swap preview + özel not sonrası final POST'tan hemen önce yalnız fixture'ın iki job assignment'ı sonlandırıldı. Gerçek API409, okunabilir iki taraflı hata, kişi bazında gerçek position nedenleri, korunmuş not ve disabled confirm doğrulandı. İstek/response taklit edilmedi. Her koşum sonunda iki assignment eski haline getirildi ve test case normal owner komutuyla kapatıldı; iki owner aynı, transfer0. Bu browser senaryosunun tetikleyicisi **job uygunluğu**dur. Partial/unknown availability metni component testindedir; bu ayrım korunur.

- [İlk browser raporu](browser.json): kişi bazında nedenler var; ikinci shift kartının eksikliği burada bulundu.
- [Nihai browser raporu](browser-final.json): iki shift kartı ve iki tarafın gerekçeleri birlikte doğrulandı.
- [Nihai mobil/light](final-two-sided-390-light.png), [nihai desktop/dark](final-two-sided-1440-dark.png). 390/1440 × light/dark dört nihai görünümde yatay taşma0, pageerror0; mobil/light ve desktop/dark gözle incelendi. Diğer iki tema görüntüsü de raporda kayıtlıdır.

## Sınırlar

AT19 çekirdek uygunluk ve manager açıklama kanıtı **LOCAL**. G05; AT20 timezone/DST ve AT22 extra assignment/travel dahil diğer açık kriterlere bağlıdır. Bu tur full native reader/zoom, insan tasarım puanı, hosted/pilot, notification yük testi veya 30 örnek P95 kanıtı değildir. Approval sonrası availability'nin değişip geçerli consent'i bozduğu iddia edilmez: yayın guard'ı bu yazmayı reddeder.

Kaynaklar: `shift_exchange_availability_swap_local.py`, `shift_exchange_swap_review_local.py`, `shift_exchange_swap_review_browser.mjs`; ortak cover verifier'a tarih parametresi eklendi. [Kaynak/runtime manifesti](source-sha256.json). API güncel kaynaklardan yerel bundle, web ayrı sabit build olarak kullanıldı. Credentials yalnız ignored state'tedir. Migration, hosted değişiklik veya deployment yapılmadı.

Cleanup: owned5560/5561 PID ve commandline doğrulamasıyla kapatıldı; wrapper exit1 kontrollü durdurma sonucudur. İki browser case için son read-only kontrol cancelled/job2restored/transfer0; ilk tarih dışı workspace açık case0. Kaynak manifesti eşleşir.
