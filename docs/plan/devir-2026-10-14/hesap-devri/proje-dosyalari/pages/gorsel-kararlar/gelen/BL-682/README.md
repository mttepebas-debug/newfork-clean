# BL-682 · Schedule: iki lokasyonun haftası ekrana sığmıyor

Thread: "Çok lokasyonlu haftada rozet taşması". Henüz yayınlanmadı; /oto görsel karar sayfasına "Schedule" sekmesine eklenir.

- `schedule-cok-lokasyon-hafta.html` kabuk sayfa; `app-schedule.html` yanında aynı adla yayınlanmalı (gerçek uygulama kodu, demo veri, main 8e787e4f + yerel seçenek anahtarı; anahtar main'e girmez).
- Senaryolar ("Örnek senaryo"): `orig` Bugün, `a` Önerilen, `b`. Rol: owner. Lokasyon seçici "All locations - Separate", hafta görünümü.
- `ekran/`: orig, a, b masaüstü 1440 görüntüsü; telefonda Schedule kapalı (telefon-390).

Durum: 1440 genişlikte (ızgara kutusu 1135 px) bir lokasyonun haftası sığmıyor. Gün sütunu kartın tek satırlık genişliğinden (146 px) daralmıyor, ekranın yedide biri 134 px; ayrıca hafta 191 px'lik sütunlarla 1535 px oluyor. Cumartesi-Pazar sağda kalıyor, kaydırınca lokasyonlar ekran ortasında bölünüyor.
- Original (bugün): yukarıdaki gibi.
- A (Önerilen): her lokasyonun haftası bir ekrana sığar; kart başlığı ve saat kelime arasından alt satıra geçer; çalışan adı sütunu gerekirse 200'den 144 px'e kadar daralır (1440'ta 167-169). Birleşik ("Merged") ve tek lokasyonlu haftanın bugünkü kuralı. Pencere en uzun kelimeye bile dar kalırsa bugünkü gibi kayar.
- B: hafta yine bir ekrana sığar, çalışan sütunu 200 px; kartlar tek satır, sığmayan kısım "…" (diğer lokasyonun gri kartlarında görev adı ve bitiş saati okunmuyor).

Mert'in cevabı thread'e ya da görsel kararlar sayfasına gelirse bu thread'e iletilir.
