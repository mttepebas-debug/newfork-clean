---
name: checklist-screen-path-and-archived-location
description: Hücre ekranın okuduğu yolu mu sınıyor (servis mi, tablo mu); lokasyon kuralı değişince arşivli lokasyonda ataması süren kişinin kaydını ve owner'ın kendi kaydını dene
metadata:
  type: feedback
---

1. **Ekranın yolu.** "Owner arşivli satırı görür" gibi bir kanıt hücresi tabloyu tarayıcı olarak (`tests.as_browser`, tablo politikaları) okuyorsa, ekranın da o yoldan okuduğunu doğrula. Newfork'ta Settings ekranları çoğunlukla API → `list_settings_*_service` → `scope_set` yolundan okur (`apps/web/src/settings/organization-data.ts` `readSettings`, `apps/api/src/settings/settings-reads-service.ts`). Çekirdek (`scope_set`, `actor`, `authz_check`) değişince bu servisler de değişir; tablo hücresi bunu görmez.
2. **Arşivli lokasyon yoklaması.** Lokasyon, kapsam ya da kayıt kuralına dokunan her işte bir kez: bir lokasyonu arşivle (atamalar bitmez), orada ve başka yerde çalışan bir kişiyi ve owner'ın KENDİ kaydını `save_employee_service` ile hem okunduğu gibi hem arşivliyi bırakarak kaydet; "Remove from location"ı dene; Settings → Locations listesinde arşivli satır owner'a görünüyor mu bak. Her biri tek işlemde, `rollback`.

**Why:** 2026-09-30. EMP-001 C3 ikinci turunda arşivli lokasyonu denemedim; owner'ın çekmecesi arşivli lokasyonu "okunduğu gibi" gönderdiği için main'de owner kendi kaydını kaydedemez oldu (G8a E1). G8a ilk turunda pre-mortem 1'i ("owner arşivliyi görür, geri alır") tablo hücreleriyle kanıtlı saydım; ekran servisten okuyordu ve arşivli lokasyon listeden düşüyordu (G8a Y2).

**How to apply:** kanıt tablosunda her "ekranda X görünür" satırı için hücrenin çağırdığı fonksiyonu ekranın veri katmanından izle. İlgili: [[checklist-sibling-endpoints-same-guard]], [[checklist-vacuous-wiring-tests]].
