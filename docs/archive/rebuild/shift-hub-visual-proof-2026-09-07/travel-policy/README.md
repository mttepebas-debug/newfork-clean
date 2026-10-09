# AT22 — Ortak geçiş süresi, yerel uygulama ve kanıt

Şirket minimumu artık Scheduling Settings'te 0–240 dakika olarak kaydediliyor. İlk değer 0; bu, kullanıcıdan yanıt gelmeyen başlangıç tercihi için mevcut davranışı koruyan çalışma varsayımıdır. Alanı göndermeyen eski istemciler kayıtlı değeri sıfırlamaz.

## Ürün davranışı

- Shift Hub ve Line Up aynı sunucu kontrolünde `max(kayıtlı minimum, işlemde istenen süre)` kullanır. Farklı lokasyonlardaki yayımlanmış vardiyalar ve aktif bağımsız Line Up atamaları kapsanır. Aynı kaynağa bağlı yerleşim ikinci iş sayılmaz; aynı lokasyon komşuluğu seyahat gerektirmez.
- Line Up preview ve commit, kısmi move/swap sonrasında kalan çalışma parçalarını aynı süreyle hesaplar. Orijinal istek idempotency ve audit için korunur; başarılı bir işlemin tekrar gönderimi, sonradan değişen politikadan etkilenmez.
- Settings yazımı doğrulanmış API actor'ını alan servis RPC'siyle yapılır. Mevcut workspace 921 kilidi ve availability input guard'ı korunur. Servis audit'i doğru actor'ı kaydeder. Transaction çatışması `PT409` API'de 409 olarak taşınır.
- Yönetim yetkisi `workspace.manage` olan kullanıcı ayarı değiştirebilir. Standart manager rolüne yeni bir global yetki verilmedi. Browser kanıtı bu yetkiye sahip ayrı QA admin hesabıyla üretildi; standart manager ve employee PUT403 aldı.
- Settings alanı örnek başlangıç saatini ve bekleyen taleplerin yeniden kontrol edileceğini açıklar. Boş alan sessizce 0 olmaz. Line Up şirket minimumunu ve sunucunun değerlendirdiği süreyi gösterir; policy refetch değişirse eski review kapanır, yazılan gerekçe korunur.

## Doğrulama

| Katman | Sonuç |
|---|---|
| Yeni pgTAP | 26/26: minimum, eski payload, yetki/audit, 15/30 dakika sınırı, önce/sonra ve aynı lokasyon, bağımsız extra, hidden/call-off, source duplicate, effective max, stale preview, gerçek partial move residual/gaps, idempotency, time records |
| Seçilmiş DB regresyonu | Yeni 26 + requested publication12 + range read19 = **57/57** |
| Web | Settings5 + LineupEditor9 = **14/14**; dirty draft, boş alan, effective süre ve policy refetch |
| API | Settings service7 + routes9 + Line Up operation routes8 = **24/24** |
| Statik/build | API ve web typecheck, hedefli lint, API bundle ve Vite build PASS |
| DB security advisors | Yerel security/warn taraması: issue yok, exit0 |

[Gerçek API raporu](api.json): UI'den30 kaydedildikten sonra eski payload30'u korur; -1/241/30.5 yazmaları400; employee ve yetkisiz manager403; başka workspace GET/PUT404. Audit actor kontrolü geçer. Sonunda ilk minimum0 gerçek API ile geri yüklenir.

[Gerçek stale final raporu](stale-final.json): owned workspace `aa47b0b7-9003-49b8-a14b-af58e51bdf39` içinde yeni cover/pickup. Alıcının diğer lokasyondaki bağımsız çalışması07:00–08:45, alınacak shift09:00–11:00. Minimum0 iken başvuru ve preview uygun; manager yetkili admin API'siyle minimum30 yapılınca preview ineligible ve **önceki fingerprint ile manager final409**. Owner aynı, transfer0, özel not0. Case normal owner-close ile cancelled; extra fixture hidden, minimum0 geri yüklendi. Son tekrar yalnız kayıtlı kanıt ve güncel kapalı DB durumunu doğrular, yeni devir yapmaz. Legacy extra hazırlığı/cleanup SQL, employee/manager/ayar kararları gerçek Auth+HTTP'dir.

[Browser raporu](browser.json): normal UI login → gerçek Save rules200 → reload30 → 390/1440 × light/dark dört nihai görünüm. Taşma0, sayı alanı44px, Tab odaktan ilerler, pageerror0. Mobil light ve desktop dark görüntüler gözle incelendi. İlk native sayı alanı inceleme sonrasında mevcut border/radius/focus tasarımına uyarlandı. Bu kontrol tam klavye/native screen-reader UAT değildir.

![Mobil ayar](settings-390-light.png)

## Düzeltmeler ve sınırlar

İlk SQL denemesinde `pg_get_functiondef` çıktılarının birleştirilmesinde eksik sonlandırıcı görüldü; transaction bütünüyle rollback oldu. Dosya düzeltildikten sonra atomik yerel uygulama ve testler geçti. İlk pgTAP eski seed lokasyonlarının arşivli olmasına takıldı; mevcut lokasyonlar açılmadı, transaction'a ait yeni lokasyon/job/employee kayıtları kullanıldı. İlk API harness başka workspace için403 beklerken mevcut anti-enumeration davranışı404 döndü; beklenti düzeltildi, ilk raporlar saklandı. İlk stale harness manager view parametresini yanlış verdi; mevcut case yeniden kullanılarak doğru endpoint ile devam edildi, ek başvuru oluşturulmadı.

Migration CLI ile oluşturuldu, mevcut ileri tarihli migration'ların sonrasına `20260909032000_shift_exchange_shared_travel_policy.sql` olarak taşındı. Yerel doğrulamadan sonra yalnız local history applied olarak kaydedildi. Hosted migration/deployment yok.

**AT22 PARTIAL kalır.** Sonraki doğrulamada cover policy-write/final yarışının iki gerçek HTTP sırası ve iki yönden başlatılan swap receiver/giver peer/final matrisi geçti: [ek kanıt](races-swaps.md). Pool/direct create-pickup travel kapıları ve Line Up swap residual varyantları ayrıca doğrulanmalı. Line Up effective süre UI'si component düzeyinde kanıtlı; bu turun gerçek browser kaydı Scheduling Settings'tir. Native erişilebilirlik, insan UAT ve hosted/pilot kapıları ayrı ve açıktır. Önceki [placement/extra kanıtı](../lineup-overlap/README.md) korunur. Genel G01–G10 goal aktiftir.

[Kaynak ve DB manifesti](source-sha256.json). Secrets yalnız ignored fixture state'te tutulur; kanıt dosyalarında token/parola yoktur.


Güncelleme: pickup/direct kapıları, Line Up swap residual ve gerçek Line Up review browser kanıtı eklendi. **AT22 artık LOCAL**; bu sayfanın önceki PARTIAL kaydı tarihsel durumdur. [Birleşik kabul](acceptance-local.md). Genel goal/hosted/native/insan UAT açık.
