# Shift Hub — gerçek yerel UI kanıtı

Beş kritik durum × dört genişlik × iki tema = **40 farklı ekran kaydı**. Görseller çalışan Alex/Casey ve manager için sentetik, sahipli yerel workspace oturumlarından alındı. Tasarım mockup'ı değildir. Test sırasında nihai transfer düğmesine basılmadı; üç adaylı cover halen açık.

| Durum | Açık tema | Koyu tema |
|---|---|---|
| Uygun vardiya havuzu | [320](available-light-320.jpg) · [390](available-light-390.jpg) · [768](available-light-768.jpg) · [1440](available-light-1440.jpg) | [320](available-dark-320.jpg) · [390](available-dark-390.jpg) · [768](available-dark-768.jpg) · [1440](available-dark-1440.jpg) |
| Çalışan · üç aday | [320](owner-candidates-light-320.jpg) · [390](owner-candidates-light-390.jpg) · [768](owner-candidates-light-768.jpg) · [1440](owner-candidates-light-1440.jpg) | [320](owner-candidates-dark-320.jpg) · [390](owner-candidates-dark-390.jpg) · [768](owner-candidates-dark-768.jpg) · [1440](owner-candidates-dark-1440.jpg) |
| Çalışan · takas karşılaştırması | [320](swap-light-320.jpg) · [390](swap-light-390.jpg) · [768](swap-light-768.jpg) · [1440](swap-light-1440.jpg) | [320](swap-dark-320.jpg) · [390](swap-dark-390.jpg) · [768](swap-dark-768.jpg) · [1440](swap-dark-1440.jpg) |
| Manager · son onay | [320](manager-confirm-light-320.jpg) · [390](manager-confirm-light-390.jpg) · [768](manager-confirm-light-768.jpg) · [1440](manager-confirm-light-1440.jpg) | [320](manager-confirm-dark-320.jpg) · [390](manager-confirm-dark-390.jpg) · [768](manager-confirm-dark-768.jpg) · [1440](manager-confirm-dark-1440.jpg) |
| Koşulları değişen talep | [320](stale-light-320.jpg) · [390](stale-light-390.jpg) · [768](stale-light-768.jpg) · [1440](stale-light-1440.jpg) | [320](stale-dark-320.jpg) · [390](stale-dark-390.jpg) · [768](stale-dark-768.jpg) · [1440](stale-dark-1440.jpg) |

Kayıt yüksekliği 720px. `manifest.json` dosya adlarını, doğrulanmış piksel boyutlarını ve SHA-256 değerlerini tutar. `supabase/verification/shift_exchange_visual_manifest.py` 40 kaydın format/boyut bütünlüğünü kontrol eder; görsel kalite veya WCAG testi yapmaz. Browser görüntüleri JPEG olarak döndürdüğü için uzantılar içerikle eşleştirildi; pikseller değiştirilmedi.

## Görsel kontrol sonucu

- Her kayıtta document düzeyinde yatay taşma gözlenmedi. 768px'teki Employee Hub yatay alt menüsü kendi kaydırma alanına sahiptir.
- Manager final onayı 320/390px'te alttan açılan dialog, geniş ekranda ortalanmış dialog olarak okunuyor; final ve geri düğmeleri görünür.
- Çalışan sorumluluğu detail üstünde metin ve ikonla belirtiliyor; renk tek anlam taşıyıcısı değil.
- Üç aday listesi, kararın manager'a ait olduğunu açıklıyor. Çalışanda aday seçme/onaylama düğmesi yok.
- Takas masaüstünde yan yana, dar görünümde alt alta. Verilen/alınan vardiya ve net saat özeti korunuyor.
- Değişen talep “Shift changed” olarak okunuyor. Başka bir değişiklik sonrasında halen gerçek canlı vardiya sahibini gösteriyor; eski case'in transfer yaptığını iddia etmiyor.

İlk ekran tek başına sayfanın devamını kanıtlamaz. Ayrı kaydırılmış 390px kanıtları: aday listesi [açık](owner-candidates-light-390-list.jpg) / [koyu](owner-candidates-dark-390-list.jpg); iki vardiya karşılaştırması [açık](swap-light-390-comparison.jpg) / [koyu](swap-dark-390-comparison.jpg); havuz başvuru kartı [açık](available-light-390-cards.jpg) / [koyu](available-dark-390-cards.jpg). Bu alt bölüm kayıtları son başlık sıkıştırmasından önce alındı; ilgili alt bölüm içeriği değişmedi.

## Bu turda bulunan ve giderilen sorunlar

1. Dialog sınırında Tab/Shift+Tab dışarı kaçabiliyordu. İlk/son etkin görünür kontrol arasında odak döngüsü eklendi; gerçek browser turunda iki yön doğrulandı. Escape ve açan düğmeye dönüş korunuyor.
2. Case deep link'i çalışanı Available, kapalı manager talebini Ready kuyruğunda bırakıyordu. URL açık bir kuyruk belirtmediyse case'e uygun kuyruk seçiliyor; Back aynı kuyruğu koruyor.
3. Owner'ın direct davet listesi, karşı tarafın yanıtını “Your response needed” diye gösteriyordu. Artık “Awaiting teammate response”; son karar ve rıza sırası açıklanıyor.
4. Koyu sidebar seçili satırı ve çalışan başlık yardımcı metinleri düşük kontrastlıydı. Tema renkleri düzeltildi.
5. Tablet filtresinde arama alanı yaklaşık bir sözcük genişliğine düşüyordu. Alt genişlik sınırı ile yeni satıra geçiyor.
6. Availability bağlantısı kart grid'inde üçüncü kart yeri kaplıyordu. Kartlardan sonraki satıra alındı; mobil başlık Home/tarih satırı sıkıştırıldı.
7. Ham `invalidated` durum kodu ve tek adayda “1 candidates” metni kaldırıldı.
8. Final sırasında koşul değişikliği bulunursa mutation sonucu bir transfer başarısı sayılmıyor; UI “No transfer was made” açıklaması gösteriyor (component kanıtı; 40 görüntü bu notice'ın ayrı capture'ını içermez).

## Kabul sınırı

**AT37'nin 40 görünüm alt kriteri yerelde kanıtlıdır. G08/G10 nihai PASS değildir.** Sonraki [çok aday ve metin stres turu](stress/README.md), uzun/bitişik isimler, 10 aday, kontrollü 2× kök font, aday/özet odak geçişi ve açık kararda aday çekilmesini 12 ana +2 ek kayıtla kapsar. Gerçek screen reader, native büyütme, bütün klavye görevleri, safe-area cihaz turu ve Schedule recovery browser ekranı ayrı açıktır. G10'un ≥21/24 puanlaması ve gerçek kullanıcı görev süreleri bu kayıtlardan türetilmedi.

Test hesaplarının görünüm tercihi System'a, geçici browser viewport/media ayarları varsayılana geri alındı. Kullanıcının Chrome oturumu değiştirilmedi.
