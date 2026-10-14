---
name: checklist-published-counterpart-not-unique
description: Bir vardiyanın yayın karşılığı (source_shift_id) o haftada birden çok güncel yayında olabilir; skaler alt sorgu 21000 verir
metadata:
  type: feedback
---

`published.source_shift_id = shift.id` eşlemesi bir haftada tek değil: vardiya taslakta başka lokasyona taşınıp yalnız yeni lokasyon yayınlanınca eski ve yeni lokasyonun güncel yayınları aynı kaynağı taşır (tekillik yalnız `(publication_id, source_shift_id)`).
Sonuç: skaler alt sorgu `21000` ile düşer (VAR-UYG-DB 1. tur); yayından Edit'e giriş bugün de `23505` veriyor (ayrı, yayın kuralı hatası).

**Why:** EKRAN-01 VAR-UYG-DB incelemesi (2026-10-06) Edit okumasının bu akışta tamamen çöktüğünü buldu; tek lokasyonlu testler yakalamadı.
**How to apply:** yayın karşılığına bağlanan her okumada "taşı, yalnız B'yi yayınla" denemesi yap; tek satır seçen sıralama (`order by (c.location_id = shift.location_id) desc limit 1`) ya da toplama iste.
