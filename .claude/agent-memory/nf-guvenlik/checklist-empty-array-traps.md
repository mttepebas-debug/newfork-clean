---
name: checklist-empty-array-traps
description: Çekirdeğe lokasyon dizisi geçen SQL'de üç boş-dizi tuzağı: array(select..) bilinmeyeni '{}' yapar, '{}' <@ x her zaman true, '{}' çekirdekte "org" demek
metadata:
  type: feedback
---

`app_private.authorize/authz_reason`'a ya da `<@ scope_set(...)` süzgecine giden her lokasyon dizisinde yokla:

1. **Bilinmeyen hedef `'{}'` oluyor mu?** `array(select ... from unnest(null))` ve `array(select distinct location_id from child where parent_id = <yok>)` null değil `'{}'` döner. Çekirdekte `'{}'` = bütün organizasyon: owner/admin GEÇER, bilinmeyen hedefte `out_of_scope` yerine izin çıkar. Doğru: önce ana satırı `id + workspace_id` ile bul, bulunamazsa `target_locations => null` (herkese out_of_scope).
2. **`'{}' <@ scope` her zaman true.** Elle yazılmış alt küme süzgeci `cardinality(ids) > 0` şartı istemez gibi görünür ama boş kayıtta manager'a sızar. Boş kayıt yalnız org erişimine: `app_private.authz_reason(actor,w,action,'{}') is null` ile sor (rol sınıfını satır içi yazma: `access_class in` ratchet sayacına girer).
3. **Silinmiş lokasyon owner'ı da kilitler.** `authz_check` silinmiş ya da yabancı lokasyonu owner/admin için de reddeder; `scope_set` silinmişi içermez. "Silinmiş düşülür" kuralında yalnız AYNI workspace'in `deleted_at is not null` lokasyonlarını çıkar, yabancı/bilinmeyen id'yi bırak (çekirdek reddetsin).

**Why:** FB-6.1 `.2` tasarım incelemesi (2026-09-25): yerel DB'de rollback'li denemeyle gösterildi (null çıkarma → owner ALLOW; ham null → out_of_scope).

**How to apply:** Schedule/diğer dilimlerin taşıma diff'lerinde K-hedef, K-süzgeç, Q-A/Q-B satırlarını bu üç soruyla oku; matriste "bilinmeyen id", "hepsi silinmiş", "boş dizi" hücrelerini ara. Bkz. [[checklist-omitted-input-probe]].
