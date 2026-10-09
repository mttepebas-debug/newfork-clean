# AT22 — Gerçek HTTP yarışları ve takasın iki tarafı

Önceki tur uygulama ve sıralı stale final kanıtı üretti. Bu tur **iki eşzamanlı sıra ve iki yönden başlatılan takaslar** doğrulandı. Ürün kodu/migration değişmedi; güncel kaynakla API bundle yeniden üretildi. Önceki 57 DB/24 API/14 UI testleri bu tur yeniden çalıştırılmış olarak sayılmaz.

## Ayar yazımı ile final onayının yarışı

Yeni kayıtlar, önceki QA workspace `aa47b0b7-9003-49b8-a14b-af58e51bdf39` içinde ayrı UUID ve tarihlerle oluşturuldu. Normal employee create/pickup sonrası, minimum0 altında geçerli preview alındı. Alıcının diğer lokasyondaki07:00–08:45 bağımsız çalışması ile alınacak09:00–11:00 vardiyası arasında15dakika bulunur.

Kontrol bağlantısı yalnız workspace advisory lock921'i tuttu. İlk gerçek HTTP isteği gönderildi; `pg_locks` ve `pg_stat_activity` üzerinden doğru RPC'nin `advisory` beklediği gözlendi. İkinci gerçek HTTP isteği gönderildi ve iki ayrı backend'in istenen sırada aynı kilidi beklediği doğrulandı. Sonra kontrol kilidi bırakıldı. İşlemlerin gövdeleri ve sonuçları gerçek API/DB tarafından üretildi; saat, yanıt veya RPC sonucu taklit edilmedi. [Gözlenen beklemeler ve sonuçlar](races.json).

| Önce kilidi bekleyen | Ayar PUT | Manager final | Sonuç |
|---|---|---|---|
| Minimum30 yazımı | 200 | 409 | Owner aynı; transfer0, özel not0. Case normal owner-close ile cancelled. |
| Vardiya onayı | 200 | 200 | Alıcı yeni owner; tam1transfer ve1manager özel notu. Sonradan30 kuralı tamamlanmış devri geri almaz. |

Her iki sıra tamamlandığında minimum30 olduğu ayrıca okundu; test sonunda önceki0değeri gerçek yetkili API ile geri yüklendi. İki legacy extra yalnız kendi UUID'leri üzerinden hidden yapıldı. Controller bağlantıları kapandı. İlk son-veri sorgusu yanlış `c.shift_id` kolonunu kullandı; iki yarış zaten bitmiş ve sonuçları kaydedilmişti. Sorgu kayıtlı shift ID'leriyle düzeltildi. Tekrar koşum **new_races0**, mevcut atama/audit/terminal state doğrulamasıdır; yarışlar ikinci kez yapılmış sayılmaz.

## Takasın alıcı ve veren tarafları

19–20Ekim takasını employee A,21–22Ekim takasını Casey başlattı. Dört yeni yayımlanmış vardiya ve dört bağımsız günlük çalışma fixture SQL ile hazırlandı; tüm create/accept/approve işlemleri gerçek employee/manager Auth+HTTP ile yapıldı. Önceki testlerin shift owner'ları değiştirilmedi.

Her takasta minimum30 altında alıcının ve verenin aldığı vardiyadan15dakika önce biten, farklı lokasyondaki extra sırayla aktif edildi. [İki takasın matrisi](swaps.json).

| Kontrol | Ölçülen sonuç |
|---|---|
| Aday eşleşmesi | İki taraf × iki aşama × iki başlatıcı:8kez uygun olmayan karşı vardiya listeden çıkarıldı. |
| Peer kabulü | Alıcı/giveren engelleri ayrı ayrı:4HTTP422; davet invited kaldı, owner'lar değişmedi. |
| Kabul sonrası manager preview | Engelli taraf ineligible, diğer taraf eligible;30dakika gerekçesi doğru tarafta. |
| Önceki preview ile manager final | Dört409; iki owner her seferinde aynı kaldı. |
| Engel kaldırılması | Önceki fingerprint aynı, preview allowed; gereksiz yeniden peer rızası istenmedi. |
| Gerçek final | İki completed case, iki transfer olayı, dört shift ataması karşılıklı doğru yeni owner'a geçti. |

Her extra kendi UUID'siyle tekrar hidden oldu; minimum0geri yüklendi. Son tekrar **new_swaps0** ve sekiz kayıtlı negatif kontrolün ardından mevcut completed/owner/transfer durumu doğrulandı. Aktif test case0. Yerel fixture kayıtları ve audit geçmişi korunur.

## Kalan kapılar

AT22 **PARTIAL** kalır: pool/direct teklif oluşturma ve pickup submit kapılarında travel varyantları, Line Up swap residual/gap matrisi ve effective süre açıklamasının gerçek Line Up browser akışı ayrıca tamamlanmalı. Bu tur browser, native erişilebilirlik, insan UAT, hosted migration veya deployment yapılmadı. Cover yarışı iki gerçek sırada kanıtlıdır; aynı testin swap final yarışı olarak sunulması doğru olmaz.

[Kaynak/runtime ve DB manifesti](races-swaps-source-sha256.json). Verifiers: `shift_exchange_travel_races_local.py`, `shift_exchange_travel_swap_local.py`. Parola/token yalnız ignored state'te tutulur.


Güncelleme: pickup/direct kapıları, Line Up swap residual ve gerçek Line Up review browser kanıtı eklendi. **AT22 artık LOCAL**; bu sayfanın önceki PARTIAL kaydı tarihsel durumdur. [Birleşik kabul](acceptance-local.md). Genel goal/hosted/native/insan UAT açık.
