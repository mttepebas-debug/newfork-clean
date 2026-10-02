---
name: checklist-invoker-view-service-role
description: Bir tablo security_invoker view'a dönüşünce (ya da yeni view eklenince) API service_role ile okuyor mu, view'ın dokunduğu tablo/fonksiyon izinleri service_role'de var mı; seed o adı hâlâ yazıyor mu
metadata:
  type: reference
---

FB-6.7 A (2026-10-02, uç `93d3eb1c`): `schedule_closures` tablosu silinip aynı adla security_invoker view oldu.
- API (`schedule-service.ts`) view'ı `service_role` ile okuyor; `service_role`'ün `locations` tam satır okuması ve
  `app_private.location_is_live` EXECUTE izni yoktu → `permission denied for table locations`, Schedule açılmazdı.
  pgTAP `postgres` rolüyle, API vitest taklitle koştuğu için hiçbiri görmedi.
- Deneme: rollback'li transaction'da migration'lar + `set local role service_role; select count(*) from public.<view>`.
  Satır sayısından bağımsız düşer (boş tabloda da).
- Aynı iş: `seed.sql` hâlâ `insert into public.schedule_closures` yapıyordu → CI `db reset` seed yüklenemezdi
  (ortak yerel DB seed görmez). Bunu bu tur doğruluk incelemesi yakaladı, ben kaçırdım:
  [[checklist-drop-migration-seed-and-restrict]] yalnız "kolon düşerken" değil "tablo view olurken" de geçerli.

Kontrol: view/RPC değişen her işte (1) view'ı okuyan her rolle `lives_ok`, (2) `grep -n "<ad>" supabase/seed.sql`.
