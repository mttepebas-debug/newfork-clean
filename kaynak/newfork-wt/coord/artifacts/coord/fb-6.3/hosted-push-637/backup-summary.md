# Hosted push 637 — yedek özeti

- Proje: `hvyvyisrqyathtliyyyv` (canlı). Tarih: 2026-10-01. Uygulanan: `20261003040000_time_off_forgets_location_and_parts.sql` (origin/main `2037ed20`, dosya blob'u `048e9d4b` = `61075b08`'deki ile aynı).
- Yedek, migration öncesi durumdur (son sürüm `20261003035000`).

## Dosyalar
- `functions/dropped__*.sql` (16) ve `functions/replaced__*.sql` (25): her biri canlıdaki `pg_get_functiondef` metninin birebir kopyası, başında `proacl`. Metin, canlıdan alınan başlık + repodaki gövde ile kuruldu; her dosyanın md5'i canlıdaki `md5(pg_get_functiondef(oid))` ile karşılaştırıldı: 41/41 eşit.
- `schema-dropped-objects.sql`: silinen tablo (`time_off_decision_pieces`, 0 satır), silinen sütunlar ve kısıtları, segment nullability ve `time_off_period_snapshot_complete`, events action check'in eski hâli, yeniden kurulan enum (`time_off_request_status`, eski değerler) ve iki index.
- `data-sort-order.json`: `departments` (6) ve `jobs` (15) `sort_order` değerleri; hepsi 0 (`*_sort_order_unused` kısıtı gereği).
- `data-notification-owner-time-off-shifts-opened.json`: silinen bildirim türünün katalog, şablon ve üretici satırları (1'er), politika 0, olay/outbox/inbox 0.

## Silinen veri
- TRUNCATE edilen 10 izin tablosu: hepsi 0 satır (ölçüm 2026-10-01, uygulamadan hemen önce).
- Bildirim türü: yalnız 3 yapılandırma satırı (yukarıdaki JSON'da).
