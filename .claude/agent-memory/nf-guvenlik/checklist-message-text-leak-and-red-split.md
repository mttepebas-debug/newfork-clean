---
name: checklist-message-text-leak-and-red-split
description: Bir reason/mesaj metni başka kaydın alanlarını yazıyorsa ghost alan listesiyle karşılaştır; testi migration'sız koşturup hangi assertion'ın bu işe ait olduğunu ayır
metadata:
  type: feedback
---

1. **Metinle sızıntı.** SQL bir `reason` / hata metnine başka bir vardiyanın alanını yazıyorsa (ör. FB-6.1.8 `Overlaps <tip> <saat>`), o vardiya kapsam dışı lokasyonda olabilir. Karşılaştır: REUSE ghost kararı (lokasyon adı, saat, iş, tip, etiket görünür; not görünmez) ve ghost'un filtreleri (`get_schedule_read_model_service` ghost_shifts: yalnız current yayın, görünür kişi, arşivli/silinmiş tip adı null). Alan listesi içindeyse bulgu değil; filtre farkı (arşivli tip adı, ±2 gün penceresi) Düşük.
2. **Kırmızıyı ayır.** Değişen pgTAP dosyasını migration'lı VE migration'sız koştur. Migration'sız da geçen değişmiş assertion bu işin davranışı değil, main'in kaymasına uyum (FB-6.1.8: 23503→40001 ve `blocked` beklentileri migration'sız da yeşildi; yalnız çift-seçim ve metin testleri kırmızıydı). Beklenti gevşetmesi sorusunu bu ayrıma göre sor: kaybolan kapsamı (ör. yarıda düşen batch'in rollback'i artık sınanmıyor) ayrıca yaz.

**Why:** 2026-09-26 FB-6.1.8 ve BL-164 incelemesi; ikisi de tek koşuda ayrıldı, koordinatöre kesin kanıt verdi.

**How to apply:** her SQL incelemesinde değişen test dosyası için iki koşu (`trial.sh` ile, bkz. [[feedback-rollback-trial-safety]]).
