# FB-6.3 park paketi — canlı öncesi yedek (2026-10-01)

Proje: hosted `hvyvyisrqyathtliyyyv`. Gönderilecek: `20261003033000`, `20261003034000`, `20261003035000`
(dal `task/fb-6.3-pubnote` @`85745a04`).

Üç dosya yalnız fonksiyon yeniden tanımlıyor (bir de yeni fonksiyonun grant'ını kaldırıyor). Tablo, kolon,
kısıt, indeks değişmiyor; dosyalarda üst düzeyde satır güncelleyen/silen komut yok (update/delete/insert
yalnız fonksiyon gövdelerinin içinde). Bu yüzden satır yedeği gerekmedi.

| Dosya | Nesne | Önceki hâl | Doğrulama |
|---|---|---|---|
| `app_private.time_off_sweep.sql` | `app_private.time_off_sweep()` | var; EXECUTE yalnız postgres | md5(pg_get_functiondef) `5c95eb38…` = bu metin |
| `public.weekly_schedule_publication_preflight.sql` | `(jsonb, uuid, uuid[], boolean)` | var; EXECUTE yalnız postgres | `ddd1b0f7…` = bu metin |
| `public.weekly_publication_decisions.sql` | `(jsonb, jsonb)` | var; EXECUTE yalnız postgres | `ed23a481…` = bu metin |
| `public.submit_time_off_service.sql` | `(uuid, uuid, jsonb, text, text, uuid)` | var; EXECUTE postgres + service_role | `b84cac11…` = bu metin |
| `public.get_employee_hub_service.sql` | `(uuid, uuid, date, date)` | var; EXECUTE postgres + service_role | `82f86b02…` = bu metin |
| `app_private.time_off_timezone.sql` | `(uuid, uuid)` | canlıda YOKTU | geri dönüş: `drop function` |

Her dosyanın metni, canlıdaki gövdeyle md5'i eşit olan `origin/main`'deki önceki tanımdan kuruldu ve canlıdaki
`md5(pg_get_functiondef(oid))` ile birebir karşılaştırıldı (beşi de eşit). Geri dönüş: dosyayı çalıştırmak
(tanım + aynı grant'lar); yeni fonksiyon en son, çağıranlar geri alındıktan sonra silinir.
