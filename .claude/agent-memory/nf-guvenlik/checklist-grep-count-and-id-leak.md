---
name: checklist-grep-count-and-id-leak
description: Gövdede authorize/scope_set bulunması yazma yolunun kapsamlı olduğunu kanıtlamaz; realtime yayınlarındaki id'ler "id bilinmez" varsayımına dayanan yolları açar
metadata:
  type: feedback
---

İki kontrol (EKRAN-SCHEDULE denetimi, 2026-10-05, main `06a74d5a`):

1. **Sayım kanıt değil.** SEC-YAYIN-HAZIRLIK (2026-10-05) `save_schedule_edit_session_service`'i "çekirdeğe geçmiş" saydı çünkü gövdede `scope_set` vardı; oysa `reach` yalnız geçmiş-hafta bulgularında kullanılıyor, `target_draft_id` oturuma ya da kapsama bağlı değil (BL-276 (3) hâlâ açık). Bir fonksiyon "geçti" denmeden önce: kapsam değişkeni hangi satırda **yazma/okuma süzgecine** giriyor, ona bak.
   **Why:** grep tabanlı hüküm açık bir yazma yolunu kapalı gösterdi.
   **How to apply:** BL-276 ailesi ya da "çekirdeğe taşındı" iddiası gelince her yazma/okuma CTE'sinde `= any(reach)` / `authorize(... target_locations => <hedefin kendisi>)` ara.

2. **İd sızıntısı + id ile korunan yol.** `schedule:invalidation:<ws>` kanalının politikası eski `workspace_has_permission(…,'schedule.read')` (çalışan da geçer, lokasyon süzgeci yok); yük `draft_id`, `actor_user_id`, `changed_shift_ids` taşıyor. "uuid tahmin edilemez" diye düşük sayılan yollar (yabancı taslağa kaydetme) bu kanalla somut olur.
   **How to apply:** id ile yetinen bir yazma yolu bulunca realtime yüklerini, bildirim yüklerini ve liste/durum cevaplarını o id için tara; politikayı çekirdekle kıyasla (`service_actor_has_permission(...)` vs `authz_reason(...)` aynı kişi için).

İlgili: [[checklist-bulk-path-skips-single-guards]], [[checklist-sibling-endpoints-same-guard]]
