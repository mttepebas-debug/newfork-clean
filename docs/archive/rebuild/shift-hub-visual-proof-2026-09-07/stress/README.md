# Shift Hub — uzun isim, çok aday ve metin büyütme kanıtı

Yerel gerçek manager ekranı, gerçek API üzerinden başvurmuş 10 sentetik çalışan. Case: `ab407571-00cd-4696-873e-3b5bcf64da8c`. Normal fixture'dan ayrı 19 Eylül 09:00–12:00 vardiyası kullanıldı. Gerçek personel verisi veya dış mesaj teslimi yoktur.

**12 ana kayıt:** 320/390/1440 px × light/dark × aday karar özeti/onay dialogu. Her kayıt 720 px yüksekliğinde, JPEG formatında ve tek tek incelendi. `measurements.json` DOM gözlemini, `manifest.json` boyut/format/SHA-256 kontrolünü içerir. `shift_exchange_visual_stress_manifest.py` bunları denetler; kullanıcı testi veya görsel kalite puanlaması yapmaz.

| Genişlik | Açık tema | Koyu tema |
|---|---|---|
| 320 | [Özet](many-preview-light-320-text200.jpg) · [Onay](many-confirm-light-320-text200.jpg) | [Özet](many-preview-dark-320-text200.jpg) · [Onay](many-confirm-dark-320-text200.jpg) |
| 390 | [Özet](many-preview-light-390-text200.jpg) · [Onay](many-confirm-light-390-text200.jpg) | [Özet](many-preview-dark-390-text200.jpg) · [Onay](many-confirm-dark-390-text200.jpg) |
| 1440 | [Özet](many-preview-light-1440-text200.jpg) · [Onay](many-confirm-light-1440-text200.jpg) | [Özet](many-preview-dark-1440-text200.jpg) · [Onay](many-confirm-dark-1440-text200.jpg) |

Metin deneyi: Shift Hub'ın sabit px fontları aynı normal boyutu koruyan rem değerlerine taşındı. Kök font test sırasında 16 px'den 32 px'e çıkarıldı; örneğin karar başlığının gerçek computed fontu 16→32 px oldu. Sayfa/dialog yatay taşması ve örneklenen paragraf/başlık/düğme iç taşması görülmedi. Bu **kontrollü metin yeniden akışı** kanıtıdır; native tarayıcı zoom, OS font tercihi, bütün uygulama tipografisi veya screen reader testi olarak sunulmaz. CDP OS-text-scale komutu bu ortamda computed fontu değiştirmedi ve geçerli büyütme kanıtı sayılmadı. API kaynağı: [Chrome Emulation](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/).

Bulunan ve giderilen sorunlar:

- İlk aday seçilince özet 390 px ekranda yaklaşık 2.192 px aşağıda kalıyordu. Review artık başlığa odaklanıp başlığı üstte görünür kılar; Back to candidates seçilen düğmeye döner. Aynı adayı tekrar incelemek de çalışır. Arka plan uygunluk yenilemesi odağı taşımaz. İlk navigasyonun gecikmiş frame'i kullanıcı odağını geri alamaz.
- Uzun aday adı büyük fontla sabit dialog altlığını gereksiz büyütüyordu. Görünür son düğme **Confirm transfer**; erişilebilir adı tam hedef kişiyi içerir, `aria-describedby` tam karar metnine bağlıdır. Kişi adı karar metninde görünür kalır.
- Önizleme yüklenirken sahte “0 other applications” gösterilmez; sunucu sonucu beklenir.
- [Özel not alanı](many-note-dark-390-text200.jpg) 390 px / 2× metinde tamamen görünür kaldı: textarea altı 498 px, footer üstü 514 px. Klavye sırası textarea→Back→Confirm→Close→textarea, her adım dialog içinde. `keyboard-cycle.json` kaydıdır.
- [Gerçek geri çekilme](withdrawal-dialog.jpg): manager dialogu ve notu açıkken Avery kendi gerçek yerel API oturumundan çekildi. Ekran yenilemesi olmadan yeni durum geldi; son karar devre dışı kaldı, açık açıklama gösterildi ve `UI audit note retained.` metni korundu. `withdrawal-browser.json` doğrudan DOM kanıtıdır. Component testinde hem approve hem reject varyantı var.

Test bitiminde manager tercihi System'e, viewport varsayılana, kök font 16 px'e geri yüklendi; media override kaldırıldı ve dialog kapatıldı. Avery yeniden başvurdu: 10 aktif aday ve önceki çekilme geçmişi var; vardiya hâlâ Alex'te. Hiçbir manager kararı gönderilmedi.

G08/G10 açık: gerçek screen reader, native büyütme, safe-area cihazı, diğer çalışan akışlarında kapsamlı klavye turu, recovery ekranı ve 5 employee + 2 manager UAT/puanlama bu kanıtın dışında.
