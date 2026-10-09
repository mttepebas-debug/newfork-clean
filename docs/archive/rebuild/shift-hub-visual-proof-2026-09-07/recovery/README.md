# Gerçek Schedule recovery — yerel browser kanıtı

Sahipliği doğrulanmış sentetik workspace, gerçek manager oturumu, uygulamanın gerçek Schedule ekranı. Hosted veya insan UAT sonucu değildir.

## İşlem ve bulunan hata

1. Yeni 2027-02-15 haftası, Alex'e ait 16:00–22:00 vardiyası ve Drew'un cover başvurusu hazırlandı.
2. Browser'da **Draft selector → Edit live schedule → Edit shift** üzerinden unpaid break 0→30 yapıldı. Helper, veritabanında bu maddi değişikliği doğrulamadan manager onayına geçmez.
3. Ayrı gerçek yerel manager API çağrısı cover'ı onayladı. Canlı vardiya Drew'a geçti, onaylı break 0 kaldı.
4. Browser'da **Publish menüsü → Save As** denemesi 409 ile engellendi. Mevcut UI yalnız genel hata/retry gösteriyordu: `pendingOpsCount === 0` koşulu, kurtarmanın gerekli olduğu düzenlemelerde karşılaştırmayı gizliyordu.
5. Koşul kaldırıldı. Hata oluşunca Save draft formu kapanır; karşılaştırma native modal içinde açılır. Başlangıç odağı başlıkta, Tab döngüsü Use approved assignments → Keep editing → Discard → Use approved assignments. Retry, karşılaştırma çözülene kadar disabled.
6. **Tab → Return** ile onaylı atamalar alındı. Eski pending cache temizlenip Schedule sorguları yenilendi. Modal kapandı, odak Publish düğmesine döndü. Save As tekrarlandı ve taslak başarıyla kaydoldu.

DB son kontrol: saved session, taslak ve canlı owner Drew, her ikisinde break 0, current publication version 1. Recovery yeni yayın oluşturmadı. Script sonucu `supabase/.temp/shift-exchange-recovery-browser-fixture.json`; tekrar çalıştırılabilir yardımcı `supabase/verification/shift_exchange_recovery_browser_fixture_local.py`.

İlk denemede textbox'a saat doldurma maddi saat değişikliği yaratmadı; o haftada taslak otomatik olarak yeni owner'a hizalanarak kaydoldu. Bu deneme recovery başarı kanıtı sayılmadı. Yukarıdaki kanıt ayrı haftadaki doğrulanmış mola değişikliğine dayanır. Mevcut hızlı editörde note alanı yok; bu tur note yazma görevi kanıtlanmadı. Note korunması önceki gerçek API/DB testlerinde ayrı kanıtlıdır.

## Görsel ve erişilebilirlik sınırı

- `final-{light,dark}-{320,390,1440}.jpg`: son panel tasarımı, 720 px yükseklik, karar düğmesine klavye odağı sonrası. Altı görsel tek tek incelendi; panelde yatay taşma yok, odaklı düğme ulaşılabilir.
- `final-dark-390-opening.jpg`: HMR'den sonra yeni bir başarısız Save As ile tekrar açılan panel. Tek açık dialog, başlık odağı ve karşılaştırma doğrulandı.
- `final-dark-390-text200.jpg`: kök font 16→32 px ile kontrollü yeniden akış. Native browser zoom/OS text scaling kanıtı değildir. Eski sabit header/footer düzeni içeriği sıkıştırıyordu; tek kaydırma alanına geçince eylem ve diğer düğmeler görünür ve erişilebilir oldu.
- `measurements.json`: bu sekiz final kayıt ve önceki geliştirme görüntülerinin ölçümleri, dört adımlı klavye döngüsü. `development` kayıtları son tasarımın kabul görüntüsü değildir; `light-390-text200-before.jpg` özellikle bulunan sıkışmayı gösterir.
- Tema DOM `data-theme` değeri ve font yalnız localhost görsel testinde geçici olarak değiştirildi. Hesap tercihleri kaydedilmedi. Tur sonunda başlangıç theme `dark`, inline font boş, computed root 16 px ve varsayılan 1280×720 viewport geri doğrulandı.
- Son kurtarma sonrası başarı mesajı hata banner'ı yerine mevcut success toast biçimine taşındı. Yeni toast kopyasının ayrı browser turu yapılmadı; kurtarma/kaydetme işlemi bu kozmetik değişiklikten önce gerçek browser + DB ile geçti.

Screen reader, native zoom, gerçek cihaz safe-area, ölçülmüş insan görev süresi ve G10 görsel puanı açık. Bu kayıtlar bu kapıların yerine geçmez.

Odaklı son koşum: recovery component 4/4, sheet 6/6, draft cache flow 8/8; web typecheck ve hedefli ESLint PASS. Ürün DB schema'sında bu dilimde değişiklik yapılmadı.
