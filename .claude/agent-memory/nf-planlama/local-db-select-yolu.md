---
name: local-db-select-yolu
description: Yerel DB'de canlı fonksiyon gövdesi ve yetki ölçmenin çalışan yolu (psql host'ta yok; docker exec + scratchpad SQL dosyası)
metadata:
  type: feedback
---

Yerel DB'de SELECT için: SQL'i Write ile scratchpad'e dosya yaz, sonra
`docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -At -c "set default_transaction_read_only = on" -f - < <dosya>`.
Host'ta `psql` yok. Canlı gövdeyi satır numarasıyla almak için
`regexp_split_to_table(pg_get_functiondef(p.oid), E'\n') with ordinality`.

**Why:** 2026-09-30 (G18): migration dosyasındaki son tanım canlı gövde olmayabiliyor; tazelik kanıtı canlı gövdeden
verildi. `information_schema.table_privileges` / `column_privileges` `postgres` ile `authenticated` için boş dönüyor
(görünürlük), "yetki yok" kanıtı sayılmaz; `has_table_privilege` / `has_any_column_privilege` kullan.

**How to apply:** her tazelik kontrolünde fonksiyon ya da yetki iddiası varsa bu yolla ölç; sayı "fazla düzgün"
çıkarsa bir hesabı elle doğrula (G18'de sayaç 2 = `profile` + `availability` satırı). İlgili: [[worktree-bash-guard]].
