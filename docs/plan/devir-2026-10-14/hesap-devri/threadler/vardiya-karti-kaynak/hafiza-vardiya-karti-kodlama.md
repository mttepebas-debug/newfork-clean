---
name: vardiya-karti-kodlama
description: Vardiya kartı Yeni görünümü main'de (80c772bf, 2026-10-14); turuncu nokta commit'i 70f3004a hâlâ tutuluyor
metadata:
  type: project
  modified: 2026-10-14T11:53:56.019Z
---

Mert 2026-10-14 09:38Z "Kodla" → Yeni kart görünümü main'e indi: 80c772bf (2026-10-14 ~11:50Z, tam e2e yeşil). Cherry-pick'ler: b31d99ba, 21f00a5d, 5d633c3b (yayındaki vardiyanın "!"i isme taşınınca isim penceresi "Changed after publishing" der, K18/M11), 82bba4ae (e2e beklentisi).
TUTULAN: 70f3004a (turuncu "!" yerine 8 px nokta, 5 Nokta), dal claude/project-thread-nezlm0'da kendi commit'i; Mert'in cevabını bekliyor (şimdi / Availability ile / yazılı). Trene itilmez.
Backlog adayı (düşük): aynı hücrede yeni çakışan vardiya + yayından sonra işareti değişen yayındaki vardiya, kişinin haftadaki tek müsait değil günü → isim "!" yok, not yalnız ekran okuyucuda.
Görüntüler: /mnt/project-files/pages/gorsel-kararlar/gelen/kart-isaretleri-40/kodlandi/.

**Why:** dal geçmişinde nokta da var; dal doğrudan trene giderse nokta da gider.
**How to apply:** nokta onaylanınca yalnız 70f3004a'yı cherry-pick listesiyle trene ver. e2e tuzağı: tests.availability kişinin bütün haftasını yazar, önceki günün işaretini siler. Bkz. [[lineup-devir]].
