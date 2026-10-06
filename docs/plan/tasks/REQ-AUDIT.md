# REQ-AUDIT Requests akışları audit (kod yok)
Status: draft
Başlama şartı: RESCUE-001 merge edilmiş olmalı.
Session: -   Branch: yok (salt okunur; rapor mesajla gelir)   Worktree: gerekmez, main checkout'ta çalışır   DB: yalnızca UI üzerinden test verisi
Öneri: Sonnet 5, medium. Keşif ve raporlama işi.

Goal: Time off ve shift change (release, cover, swap) akışlarının bugünkü durumunu employee ve manager gözünden çıkarmak. REQ-001/002/003 implementasyon task'ları bu rapora göre yazılacak.

In scope. Her akış için browser'da uçtan uca şu zincir gezilir: employee talebi → manager kuyruğu → karar (onay/ret) → yayınlı Schedule ve Employee Hub'a etkisi → bildirim.
- Time off: tam gün, saatlik, kısmi karar, iptal.
- Release (open shift'e bırakma).
- Cover (başkasından devralma ya da aday arama).
- Swap (iki çalışan arasında değişim).
- Manager Requests sayfası: sekmeler, status filtreleri, sıralama, detay paneli, boş/hata/yükleniyor durumları.
- Ret, iptal ve süre aşımı davranışları.

Kaynaklar:
- web: `views/ScheduleRequestsPage.tsx`, `employee-hub/shift-exchanges/*`, `employee-hub/TimeOff*`
- api: `schedule-requests-*`, `shift-exchanges-*`

Out of scope:
- Kod değişikliği.
- Line Up (ayrı plan konusu).
- Employee Hub nav/tab düzeni (BL-056/057, ayrı task).
- Email bildirimi (BL-046).

Done when: rapor koordinatöre gönderilmiş ve şu formatta:
- Akış başına tablo: adım | beklenen | gözlenen | durum (çalışıyor / kırık / kafa karıştırıcı) | ilgili dosya.
- Kırıkların tekrar üretme adımları ve console/network hata metni.
- Kafa karıştırıcı noktalar için tek cümlelik öneri (tasarım yapma).
- Önerilen gruplama: REQ-001 manager, REQ-002 employee exchange, REQ-003 time off. Her grup için tahmini boyut: S/M/L.
- Test için oluşturulan talepler iptal edilmiş ve test verisi listelenmiş olmalı.

Test plan: otomatik test çalıştırılmaz.

Risk:
- İki rol gerekiyor (bir manager, iki employee). Hesap yoksa worker durur ve kullanıcıya sorar; parola girmez, kullanıcı giriş yapar.
- Dev server 5555/5556 üzerinde tek checkout'ta çalışır; port doluysa sorar.

## Notes / Result
