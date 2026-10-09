# AT11 — Doğrudan cover daveti ve sonuçları

Owner Alex, yalnız uygun çalışan Blake'e uygulama üzerinden davet gönderir. Blake'in kabulü manager'a karar görevi açar; vardiyayı henüz Blake'e atamaz. Davet reddi, kabulü geri çekme ve manager reddinde Alex sorumlu kalır. Yalnız manager finalinde atama Alex → Blake olur.

## Bulgu ve düzeltme

İlk dört gerçek browser akışı işlevsel olarak geçti. Görsel incelemede eski başarı mesajının talep değiştikten sonra üstte kaldığı görüldü: **Approved / Transfer approved** yanında, önceki kabulden kalan “Assignment changes require final manager approval” mesajı vardı. [Önceki görünüm](recipient-approve.png).

Başarı mesajı artık command sonucunun case ID, revision ve status bilgisine bağlıdır. Daha yeni talep verisi geldiğinde eski mesaj kaldırılır; farklı bir talebin güncellenmesi geçerli mesajı silmez. Henüz refetch gelmediyse başarılı komutun sonucu gösterilebilir; özellikle invalidated/expired açıklaması kaybolmaz. Kapanan davette “Request closed. No transfer was made…” gösterilir. **Atama ve manager karar kuralları değiştirilmedi.**

Üç yeni regresyon dahil **44/44 test** (43 Hub + 1 dialog), web typecheck, hedefli ESLint, Vite build ve verifier syntax PASS. Testteki desteklenmeyen Testing Library `exact` seçeneği typecheck ile yakalandı ve düzeltildi. Yeni migration/API değişikliği yok.

## Gerçek yerel görev turu

Owner, recipient ve manager üç ayrı normal UI login kullanır. Auth enjeksiyonu, sahte response/saat veya geçmiş resetleme yok. Davet oluşturma, kabul/ret/geri çekme ve manager kararı gerçek UI butonlarıyla yapılır.

| Sonuç | Doğrulanan davranış |
|---|---|
| Daveti reddet | Alex kalır, talep kapanır, recipient'ın bekleyen görevi kalkar, owner sonucu alır ve yeni arama ekranını açabilir |
| Kabul → geri çek | Kabulden sonra manager görevi oluşur ama Alex kalır; geri çekmede görevler temizlenir ve devir olmaz |
| Kabul → manager reddi | Alex kalır; paylaşılan ret gerekçesi Blake'e görünür, özel manager notu görünmez |
| Kabul → manager onayı | Alex'ten Blake'e tek devir; iki açık çalışan Schedule ekranı ve manager Line Up güncellenir; recipient'ın inbox bağlantısı doğru talep ve güncel owner'a gider |

Davet öncesinde üç inbox ve recipient Hub açık tutuldu. Manager, employee kabulünden önce final veremedi; uygun adayın preview/approval düğmesi devre dışıydı. Owner'ın özel oluşturma notu yalnız owner ve manager'da görüldü. Kabul, recipient'ın Schedule'ına kesinleşmiş vardiya eklemedi. Sonuçlar boyunca manuel refresh veya gezinme gerekmedi; kontrollü deep link/yeni arama görevleri ölçümden sonra yapıldı.

İlk dört sonuç [browser-baseline.json](browser-baseline.json) içinde. Düzeltme sonrası iki **yeni** davet (decline ve approve) [browser-final.json](browser-final.json) içinde; önceki dört case korunur. Son turda üç Hub'ın terminal durumları ve eski mesajın kalkması ayrıca beklenir. Her iki raporda beklenmeyen HTTP/page error **0**, sonuçlar sırasında gezinme **0**.

Son tur tekil gözlemleri: davet **1343/1312 ms**, kabul **1215 ms**, ret **1109 ms**, final onay **1474 ms**. Bunlar command-start → harness'in beklediği UI koşullarının tamamlanması üst sınırıdır; DB commit timestamp veya P95 değildir. Sonraki screenshot/deep link/yeni arama görevleri bu sürelere dahil değildir. İlk tur süreleri aynı seri gibi birleştirilmedi.

## Veri kanıtı

[READ ONLY denetim](data.json) altı case'i kapsar:

- Altı davet doğru owner tarafından, dört kabul doğru recipient tarafından oluşturuldu. Ret/geri çekme recipient'a; manager reddi ve final onay manager'a ait.
- Yalnız iki approved case'te transfer_completed olayı ve yeni owner Blake var. Diğer dört case cancelled; owner Alex ve doğru terminal application status korunur.
- İki onay gününde gerçek share API'siyle oluşmuş **v1 Alex**, ardından **v2 Blake** vardır. Snapshot ID'leri gerçek share yanıtına bağlıdır; her sürümde bir doğru vardiya vardır. Diğer dört gün paylaşılmadı ve snapshot sayısı 0.
- Önceki iki haftanın **628 snapshot'ı** aynı içerikle kaldı; her sürümde doğru tek owner. [Önceki snapshot denetimi](previous-snapshots.json). Yeni günlerdeki dört snapshot bu 628'e dahil değildir.

## Görsel kanıt ve kapsam

İlk tur **11** 390 px görünüm, düzeltme sonrası **6** yeni görünüm: light/dark davet, owner/recipient ret ve onay sonuçları. Yatay taşma yok. Davet/dark, kabul bekleme, owner ret ve final recipient onay/ret görselleri ayrıca gözle incelendi. Bu tur tam viewport/kontrast/native reader matrisi değildir.

- [Nihai onay — dark](final-recipient-approve.png)
- [Nihai ret — light](final-recipient-decline.png)
- [Davet — dark](final-recipient-invitation-dark.png)
- [Kabul sonrası bekleme](recipient-awaiting-manager.png)

AT11 çekirdek doğrudan cover görevleri **LOCAL**. Hosted bildirim teslimi, offline/lost response, uygunluk değişimi yarışları, native cihaz/reader ve insan UAT ayrı açık kapılardır. G01–G10 genel goal tamamlandı sayılmaz.

İlk setup denemesi dolu Pazartesi gününü fark edip hiçbir şey yazmadan durdu; boş günler kullanıldı ve mevcut publication korundu. İlk browser seçici denemesi de UI mutasyonundan önce durdu; label metninin tüm alt içeriğini eşleştirmek yerine gerçek combobox accessible name kullanıldı. ARIA snapshot ve final rapor normal browser verisidir; native ekran okuyucu testi değildir.

Verifier'lar `shift_exchange_direct_cover_local.py` ve `shift_exchange_direct_cover_browser.mjs`. Tamamlanmış işler resetlenmez; yeni browser işi yoksa sahte PASS yerine read-only doğrulama istenir. Credential dosyası ignored local state'te kalır. Sabit web build `supabase/.temp/two-managers/web`; mevcut API bundle `apps/api/.temp/staffing-immediate-20260907`. API'nin bu tur yeniden derlendiği iddia edilmez. [Kaynak manifesti](source-sha256.json).

Sahipli browser süreçleri terminal/exit0;5560/5561 PID/commandline doğrulamasıyla kapatıldı. Wrapper exit1/preview vite not found kontrollü cleanup sonucudur; başarılı build hatası değildir. Shared5555/5556/Auth ve ilgisiz WIP korunur. Son kaynak hashleri eşleşir, hedefli whitespace/syntax kontrolleri geçti.
