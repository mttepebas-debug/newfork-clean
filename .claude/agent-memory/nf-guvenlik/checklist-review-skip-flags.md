---
name: checklist-review-skip-flags
description: İncelemeyi atlatan satır işaretleri (owner_excused gibi): işareti kalıcı bırakan her yol, sıfırlayan yol ve API'nin aynı işarete bakıp bakmadığı
metadata:
  type: feedback
---

Bir satır işareti "incelemesiz kabul" anlamı kazanınca (FB-6.6: `owner_excused` → owner'ın yüklediği belge doğrudan `accepted`),
işareti owner olmayan birinde bırakan her yolu ara: sahiplik devri (`respond_workspace_ownership_transfer_service` `PT409`'u yutar,
işaret kalır), yayından kaldırılmış belge, elle muafiyet. Sıfırlayan yolu bul (`set_document_publication_service` yeniden yayında sıfırlar)
ve işaret kalırken yazma yolunun kapalı olduğunu doğrula (`assert_document_published`).

**Why:** Bu işaret kalırsa eski owner kendi belgesini incelemesiz "onaylı" yapar; D1'i (kimse kendini onaylamaz) deler.
API ayrıca farklı bir işarete (`exemption_locked` = bugün owner mı) bakıyordu; fark kapalı yönde ama aynı türden ayrışma açık yönde de olabilir.

**How to apply:** `owner_excused`, `lifecycle_exempt`, `requires_review` gibi bir alanın anlamını değiştiren her diff'te
`pg_proc.prosrc ~ '<alan>'` ile yazan yolları listele; API'nin kararı DB ile aynı alandan mı verdiğine bak. [[checklist-sibling-endpoints-same-guard]]
