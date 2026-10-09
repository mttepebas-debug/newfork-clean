---
name: checklist-vacuous-after-fixture-change
description: Kırmızı test yeşile çekilirken kurgu değiştiyse, aynı bloktaki komşu kontrollerin artık hiç kırılamaz (boşa) hale gelip gelmediğine bak
metadata:
  type: feedback
---

Bir diff kırmızı bir pgTAP testini yeşile çekmek için kurguyu (tarih, kişi, sıra) değiştiriyorsa, yalnız değişen satıra değil, aynı kurguya dayanan komşu kontrollere de bak. Kurgu değişince "X de geri alındı (sayı 0)" gibi bir kontrol, X hiç oluşmadığı için artık her durumda geçebilir. Metin aynı kalır, beklenti fiilen gevşer (CLAUDE.md §3.A).

**Why:** FB-6.1.11 (2026-09-26, `9788fc3`): `weekly_schedule_batch` testinde çakışan aynı gün iki atama 23514 verdiği için ilk öğe çakışmasız bir güne (2035-01-16) taşındı. O gün kabul (override) oluşturmadığından "first acceptance also rolls back" (override sayısı 0) kontrolü boşa düştü. Dosyanın kendi sonraki kontrolü ("only the unavailable shift has acceptance" = 1) bunu kanıtlıyordu. Yazar "hiçbir beklenti gevşetilmedi" demişti.

**How to apply:** Değişen her kurgu satırı için şunu sor: "Bu kurguyla, sonraki kontrollerin her biri kırılabilir mi?" Sıfır sayan, yokluğu doğrulayan kontroller en riskli olanlar. Kanıtı çoğu zaman dosyanın kendi başka kontrolü verir, DB koşusu gerekmez. Bkz. [[checklist-todo-refusal-live-lock]].
