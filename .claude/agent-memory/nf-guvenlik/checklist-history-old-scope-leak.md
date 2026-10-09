---
name: checklist-history-old-scope-leak
description: Değişiklik geçmişi (eski→yeni sürüm) okuması, kaydın eskiden durduğu ve okuyanın bugün göremeyeceği lokasyonu/başlığı açığa çıkarıyor mu
metadata:
  type: reference
---

FB-6.7 A (2026-10-02): `read_important_date_history_service` yetkiyi kaydın BUGÜNKÜ kapsamıyla veriyor, ama
döndürdüğü eski sürümler (snapshot) kaydın eski lokasyonunu ve başlığını taşıyor.
Örnek: owner'ın yalnız Beşiktaş'taki "Besiktas layoffs" tarihi Kadıköy'e taşındı; Kadıköy müdürü Ayşe geçmişte
eski başlığı ve Beşiktaş'ı gördü — K6'ya göre o kaydı hiç görmemeliydi.

Kontrol: geçmiş/audit okuyan her uçta "kayıt taşındı / kapsam daraldı" denemesi yap; okuyanın göremeyeceği
lokasyondaki sürümler süzülmeli ya da maskelenmeli (koordinatör kararı 2026-10-02, K6).
