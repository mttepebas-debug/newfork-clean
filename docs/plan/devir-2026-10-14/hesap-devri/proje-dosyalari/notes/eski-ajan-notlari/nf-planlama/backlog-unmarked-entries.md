---
name: backlog-unmarked-entries
description: BACKLOG.md işaret sayımı nasıl doğrulanır; kapanan maddeler en alttaki "Kapanan maddeler" bölümünde
metadata:
  type: project
---

2026-09-26 (BL-124): BL-071..079 işaretlendi, BL-077/BL-097/BL-124 BACKLOG'un sonundaki "Kapanan maddeler"
bölümüne ayrıldı; açık bölümlerde "leave: critical" geçen satır 0.

**Why:** "critical olanları listele" sorgusu işaretsiz ya da kapanmış maddeyi yanlış sayar.
**How to apply:** Backlog işinde `grep -c "^- \*\*BL-"` ile `grep -c "^- \*\*BL-[0-9]* (leave:"` sayılarını
karşılaştır; fark = kapananlar + biçimi farklı olanlar. Kapanan maddeyi "Kapanan maddeler"e taşı, işaret
metnini "leave:" içermeyecek biçimde yaz. Bir DB nesnesinin yaşadığını doğrularken adını origin/main'deki
TÜM migration'larda ara, ya da yerel DB'nin migration listesini main'le karşılaştırıp pg_proc'a bak.
