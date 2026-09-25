# Employee Line Up — tarih seçimi ve geri gezinme

2026-09-07, yerel gerçek Chromium oturumu. Çalışan Line Up artık `date=YYYY-MM-DD` bağlantısını okur; seçili günü gerçek published Line Up API'sinden getirir. Tarih yoksa lokasyon saat dilimiyle hesaplanan mevcut Upcoming aralığı kullanılır. Geçersiz veya takvimde olmayan URL tarihleri varsayılan aralığa döner.

## Kullanıcı davranışı

- Tarih yazmak hemen gezinme başlatmaz; **Show day** veya Enter ile uygulanır.
- **Upcoming** varsayılan aralığa döner. Diğer query parametreleri korunur.
- Schedule ↔ Line Up geçişinde seçili gün korunur.
- Henüz uygulanmayan tarih, plan yenilemesinde ve odak değişmeden korunur.
- Gün değiştirmek bir planı okundu saymaz. Gerçek browser turunda receipt POST sayısı **0**.
- Seçili günde paylaşılmış plan yoksa açık bir boş durum ve Schedule yönlendirmesi gösterilir.

## Gerçek browser'da bulunan ve kapatılan yarış

Show day → Upcoming → hemen browser Back dizisinde URL ve plan 8 Aralık'a dönmesine rağmen tarih alanı Upcoming tarihini koruyordu. Beş saniye sonra da hem DOM value hem value attribute eskiydi. `autocomplete=off` denemesi sorunu çözmedi ve kaldırıldı. Dolayısıyla bu bir browser form-restoration sorunu olarak raporlanmıyor.

Gezinme komutunun hedefini yerel tarihe erken kopyalamak kaldırıldı. Uygulanmış tarih URL'den türetilir; yalnız kullanıcının düzenlemesi bulunduğu güne bağlı ayrı bir draft olur. Kesilen gezinme yanlış tarih bırakamaz. Aynı gerçek hızlı Back senaryosu düzeltmeden sonra geçti. Odak Show day üzerinde kaldı; Schedule'a gidip Line Up'a dönme doğru günü korudu.

## Ölçümler ve kapsam

`shift-exchange-multisurface-browser-1788816583084.json` başarılı raporu: 320/390/768/1440 px × light/dark, **8/8** görünüm. Tüm tarih/aksiyon kontrolleri en az44 px yükseklik; yatay taşma0; klavye odağı görünür. Tema, kontrollü kök theme attribute'udur; gerçek preference UI testi değildir. HTTP≥400 ve pageerror0. Önceki başarısız ve HMR kesintili raporlar `.temp` altında korunur.

[320 dark](date-controls-320-dark-1788816601982.png) ve [1440 light](date-controls-1440-light-1788816602458.png) ayrıca görsel olarak incelendi. Kontroller, kartlar ve metinler kesilmiyor; mobilde tarih tam satır, iki aksiyon yan yana; desktop'ta tek satır kontrol düzeni var.

EmployeeLineup **12/12**, lineup-time **6/6** ve parent'ın seçili gün **3/3** odaklı testi, web typecheck ve ilgili ESLint geçti. Parent EmployeeHubPage'in son tüm-dosya koşumu19/20: değişen dashboard kapsamındaki `TODAY’S SHIFT` beklentisi başarısız. Bu genel suite yeşil diye sunulmaz. Bu iş diğer dashboard/time-off düzenlemelerini geri almaz; parent'ta artık kullanılmayan FormEvent import'u temizlendi.

G07/G08/G10 ve AT32/35/37/38 için ek yerel kanıt; insan UAT, native ekran okuyucu, gerçek cihaz/safe-area ve hosted kabulü değildir.
