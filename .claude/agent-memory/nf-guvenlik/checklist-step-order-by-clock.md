---
name: checklist-step-order-by-clock
description: Geçmiş/Undo yığını adımları statement_timestamp ile sıralıyorsa, oturum revision'ını kontrol etmeyen bir yazarla yarışta sıra uygulama sırasından sapar
metadata:
  type: feedback
---

Undo yığını gibi "en yeni adım" seçen bir yapı `statement_timestamp()` (istek geliş saati) ile sıralıyorsa: kilit sonra alınabilir, ayrıca saat geri atlayabilir. İki yazma aynı oturuma eşzamanlı giderse ve biri `expected_session_revision` kontrol etmiyorsa (DB-1c'de `bulk_delete_schedule_edit_shifts_service`), sonra uygulanan adım "daha eski" görünür. Undo yanlış sırayla alır ve aynı vardiyada ara hâl kalır.

**Why:** DB-1c ikinci tasarım (2026-10-06, `86cfd059`); kimlik (statement_timestamp, xact) sağlamdı ama sıralama değildi.
**How to apply:** böyle bir yığında sıralamayı insert anında alınan bir sıra numarasına (identity/sequence) bağlamayı öner; revision'sız yazar var mı, `git grep` ile bak. [[checklist-vacuous-wiring-tests]]
