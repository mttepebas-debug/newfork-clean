---
name: checklist-availability-guard-hydration-skip
description: guard_schedule_assignment_availability INSERT'te aynı kimlikli draft/edit satırı varsa, UPDATE'te kimlik değişmediyse izin kontrolünü atlar; "Undo/restore onaylı izni engeller" iddiası yalnız boş kaynakta doğru
metadata:
  type: feedback
---

Oturum vardiyasını geri getiren/yeniden yazan bir yol (Undo, restore, recovery) "onaylı izin 23514 ile engeller" diyorsa iki atlamayı yokla:
- INSERT: aynı id + aynı kimlik `schedule_draft_shifts` ya da herhangi bir `schedule_edit_session_shifts` satırında varsa ("hydrated") kontrol hiç koşmaz. Taslaktan açılmış oturumda silineni geri getirmek bu yüzden izni görmez.
- UPDATE: `schedule_availability_identity` (pending_op_type içermez) eskisiyle aynıysa erken döner; "Live"a dönüş (pending delete → null) kontrolsüzdür.
Gerçek sınır yayın: published insert'te son yayın Ali'siz olduğundan kontrol koşar.

**Why:** DB-1c (2026-10-06) testi yalnız blank oturumda izin reddini kanıtlıyordu; iddia genel yazılmıştı.
**How to apply:** böyle bir iddiada draft- ve published-kaynaklı oturum hücresi iste ya da iddiayı "yayın engeller" diye daralt. [[checklist-vacuous-wiring-tests]]
