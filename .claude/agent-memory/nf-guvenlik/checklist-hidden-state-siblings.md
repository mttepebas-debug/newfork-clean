---
name: checklist-hidden-state-siblings
description: "Bekleyeni gizle" süzgeci yalnız pending_review'u mu saklıyor; hiç incelenmemiş öteki durumlar (superseded) aynı veriyi taşır
metadata:
  type: feedback
---

Bir görünürlük kuralı bir durumu saklıyorsa (FB-6.6 S2: `pending_review`), o duruma girip ondan çıkan bütün durumları say:
`pg_proc.prosrc ~* '<tablo>\s+set\s+state'` ile durumu yazan her yolu bul. FB-6.6'da `submit` bekleyen gönderimi yenisi gelince
`superseded` yapıyordu; süzgeçler yalnız `pending_review`'u sakladığı için hiç incelenmemiş eski yükleme eş müdüre açıldı (liste, indirme, geçmiş).

**Why:** Tur 2'de yalnız mutlu yol (tek yenileme) test edilmişti; "yenilemeyi bir kez daha değiştir" adımı süzgeci deldi (2026-10-02, review-2).

**How to apply:** Gizleme kuralı gelen her diff'te yazılmış test dosyasını rollback'li koşup sonuna "aynı kişiyi bir adım daha ilerlet" hücresi ekle
(yeniden yükle, geri çek, reddedip yeniden gönder) ve okuyucunun liste / tekil / indirme / geçmiş cevabına bak. [[checklist-review-skip-flags]]
