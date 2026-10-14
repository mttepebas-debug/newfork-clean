---
name: feedback-report-before-message
description: Rapor dosyasını yaz, yazımın başarılı sonucunu gör, mesajı ancak sonra gönder; ikisini aynı adımda paralel çağırma
metadata:
  type: feedback
---

Rapor dosyasının yazımı ve koordinatöre giden mesaj aynı adımda paralel çağrılmaz. Önce dosya yazılır; araç "File created" dediğinde mesaj gönderilir. Mesajdaki yol, bu oturumda başarıyla yazılmış bir dosyanın yoludur.

**Why:** 2026-09-30 BL-475 ve G8b'de iki kez: yazım GateGuard'a takıldı (ilk dokunuşta gerçekleri istiyor), paralel giden mesaj yine çıktı. Koordinatör var olmayan dosyayı aradı.

**How to apply:** her incelemenin sonunda sıra "Write → sonucu oku → send_message". GateGuard ilk yazımı reddederse gerçekleri yaz, yazımı yinele, ancak sonra mesaj.
