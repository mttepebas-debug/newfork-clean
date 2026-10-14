---
name: checklist-copy-rule-by-id
description: Yeni bir "açık oturum / taslak" dalı eklenince yayın kopyası süzgeci source_published_shift_id'ye değil id'ye bakmalı; taslaktan açılan oturumda kopya işaretsiz
metadata:
  type: feedback
---

Bir kural (kapalı gün K16, takas rebase, yayın sayımı) taslak vardiyaları için "yayın kopyası değilse" süzgecini
`coalesce(published.source_shift_id, published.id) = draft_shift.id` ile yapıyorsa, aynı kurala açık düzenleme
oturumu (`schedule_edit_session_shifts`) dalı eklendiğinde süzgeç `source_published_shift_id is null` ile yetinmemeli.
Taslaktan açılan oturumda (source 'draft') satır id'si = taslak id'si = yayının source_shift_id'si, ama
source_published_shift_id null (tetikleyici yalnız 'published' oturumda işaretler). Ayrıca taslak güncellemesi
`id = any(liste)` ile yapıldığından oturum dalının id'leri taslak kopyasını da vurur.

**Why:** EKRAN-01 DB-3 (2bb043ff, BL-545) — müdür kapalı günde Ali'yi "keep" dedi; yayın kaldı ama taslak ve açık
oturum kopyasında Ali silindi (rollback probe: migration'la 2 kırmızı, migration'sız yeşil).

**How to apply:** published → save as draft → draft'tan oturum aç → kuralı tetikle (keep/ret seçeneğiyle) hücresini
iste ya da kendin koş. Toplu silmede (şablon Replace) lokasyon × departman çapraz çarpımına da bak (pair mi küme mi).

Ek (DB-3 tur 2): sorgu içindeki CTE / cross join'e konan doğrulayıcı (raise eden stable fonksiyon) karşı taraf boşsa hiç çalışmaz. Önizleme gibi yollarda doğrulamayı ayrı `perform` ile çağırt; boş oturumla yokla.
