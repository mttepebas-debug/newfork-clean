---
name: checklist-todo-refusal-live-lock
description: Yeşil listedeki bir red testi pgTAP todo() altına alınıyorsa, bugünkü reddi kod ve metinle kilitleyen TODO dışı bir kontrol iste; todo başarısızlığı saymaz
metadata:
  type: feedback
---

Bir diff pgTAP'te `select todo(..., n)` ekleyip altına bir yetki reddi (`throws_ok(..., '42501', ...)`) alıyorsa: aynı reddi bugünkü cevabıyla doğrulayan, TODO dışında ikinci bir kontrol iste. Hata kodu ve mümkünse hata metni sabit olsun (`throws_ok(sql, 'P0002', 'time off request not found', ...)`). Kodsuz `throws_ok(sql, null, ...)` her hatayı geçirir, kilit sayılmaz. Kontrol mümkünse testin kendi kurduğu kişiyle yapılsın, seed'e dayanmasın.

**Why:** BL-080 (2026-09-26, `ee0f14d`): seed'deki owner çalışan kaydı alınca `time_off_cancellation_requests` testindeki "başkasının iznini iptal edemez" satırı 42501 yerine P0002 döndü ve TODO'ya alındı. TODO altındaki test çağrı hatasız geçse bile kırmızı sayılmaz. Dosya `ci-green.txt`'te olduğu için, fonksiyonun yeniden yazılacağı FOUNDATION-B Aşama 6'da açılacak bir yetki deliği CI'da görünmezdi. nf-db `2696959`'da testin kendi ikinci çalışanıyla P0002 + metin kilidini ekledi; ONAY o haliyle verildi.

**How to apply:** Her incelemede diff'te `todo(` ara. Altındaki kontrol bir red (42501, P0002, authz.*) ise ve dosya yeşil listedeyse, TODO dışı kilit yoksa DEĞİŞİKLİK İSTE (Orta). Red kodunun farklılaşması varlık sızdırıyor mu diye de bak: bilinmeyen hedef ile başkasının hedefi aynı cevabı almalı. Bkz. [[checklist-not-null-relax-readers]] (fixture değişikliğinin başka testlerdeki yan etkisi).
