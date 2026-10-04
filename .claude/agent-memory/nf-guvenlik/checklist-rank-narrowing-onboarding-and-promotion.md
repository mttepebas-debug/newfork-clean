---
name: checklist-rank-narrowing-onboarding-and-promotion
description: Bir own eylemi rütbeye daraltılınca (yalnız employee) o eylemi isteyen onboarding adımı ve terfi sonrası kalan kayıt kontrol edilir
metadata:
  type: feedback
---

Kendi kaydına yazma bir rütbeyle sınırlanınca (`employee_target` ile `own`, örnek: AVAIL-002 A2'de `availability.own` yalnız employee) iki ucu yokla:
1. **Onboarding adımı:** `app_private.initialize_employee_onboarding` her davet edilen kişiye adımları rolüne bakmadan kurar. Adım bir ayarla `required + blocks_activation` olabilir (`guard_weekly_onboarding_requirement`). Rütbesi tutmayan kişi adımı tamamlayamaz, `submit_employee_onboarding_service` reddeder ve kişi `pending_activation`da kalır.
2. **Terfi:** rol yükselince o kişinin eski kaydı kalır mı? Kalırsa okuyucular (Schedule, Auto-fill) onu kullanmaya devam eder ama artık kimse düzenleyemez. `manager_note_follows_role` yalnız notu siler.

**Why:** AVAIL-002 A2 (2026-10-04, `9d8c767c`). Yazarın matrisi "onboarding'deki müdür → rank" hücresini bilerek koymuştu. 64+ test yeşildi. Ama ayar açıkken davet edilen müdürün aktivasyonu hiç bitmiyordu (geri alınan denemede main: SAVE ok, dal: `authz.rank`, adım `not_started`).

**How to apply:** yeni `employee_target`, `rank_below` ya da `no_self` bayrağı gelince `employee_onboarding_requirements` adımlarını (`kind`) ve bu eylemi isteyen her adımı tara. Deneme: bir müdürün üyeliğini `pending_activation` yap, ayarı aç, `initialize_employee_onboarding` çağır, sonra kaydetmeyi dene. Hepsi rollback içinde. Komşu kayıtlar: [[checklist-review-skip-flags]], [[checklist-hidden-state-siblings]].