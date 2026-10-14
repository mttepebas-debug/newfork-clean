---
name: checklist-bulk-path-skips-single-guards
description: Toplu/üzerine yazma yolları tek kayıt silmenin korumalarını (başlamış vardiya onayı, locked, override iptali) atlıyor mu
metadata:
  type: feedback
---

Schedule'da tek vardiya silme yayınlanmış kopyayı (`locked`, `source_published_shift_id`) silmez, `pending_op_type='delete'` işaretler; kaydetmede "already started" onayı bu işarete bakar. `apply_schedule_template_service` overwrite dalı ise oturum satırlarını doğrudan siliyor: işaret kalmadığı için onay hiç sorulmaz, override iptali de yapılmaz (EKRAN-SCHEDULE denetimi 2026-10-05, `06a74d5a`).

**Why:** koruma "satır işaretli mi" sorusuna bağlıysa, satırı doğrudan silen ikinci yol korumayı sessizce devre dışı bırakır (veri kaybı, P09).
**How to apply:** silme/üzerine yazma içeren her yeni ya da incelenen yolda tek-kayıt yolunun yaptığı yan işleri listele (işaretleme, override iptali, bildirim, locked kontrolü) ve toplu yolda birebir ara. Şablon, otomatik doldurma, varsayılan saat, toplu silme bu ailede.

İlgili: [[checklist-grep-count-and-id-leak]], [[checklist-past-line-on-drafts]]
