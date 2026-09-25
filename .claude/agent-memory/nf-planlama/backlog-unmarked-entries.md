---
name: backlog-unmarked-entries
description: BACKLOG.md'de leave/do işareti olmayan BL-071..BL-079 bloğu var; işaret sayımı tüm maddeleri kapsamaz
metadata:
  type: project
---

2026-09-25, origin/main `41c9887`: `docs/plan/BACKLOG.md`'de 44 BL maddesi var, 41'i `leave:` işaretli
(1 critical, 8 high, 12 medium, 20 low). İşaretsiz blok: BL-071, 072, 073, 074, 076, 077, 078, 079 (satır ~117-124).
Tek critical madde BL-097 zaten "Kapandı" notu taşıyor.

**Why:** "critical olanları listele" gibi bir sorgu `grep "leave: critical"` ile yapılırsa işaretsiz maddeler
sessizce dışarıda kalır.
**How to apply:** Backlog işinde önce `grep -c "^- \*\*BL-"` ile `grep -c "leave:"` sayılarını karşılaştır;
fark varsa işaretsizleri raporda say ve işaretleme önerisi yap. Bir DB nesnesinin hâlâ yaşadığını
doğrularken adını origin/main'deki TÜM migration'larda ara (sonraki bir migration düşürmüş olabilir).
