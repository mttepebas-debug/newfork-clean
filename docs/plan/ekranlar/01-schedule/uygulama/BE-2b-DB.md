# EKRAN-01 BE-2b-DB — uygulama arşivi

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| 01 Schedule (Export → zamanlanmış e-posta) | BE-2b-DB — kısmi teslim kuralı kapatmaz (KK-166) | `nf-db` / veri hattı | R2 | ONAY @45248974 (`feature-dev:code-reviewer`, opus) | 2026-10-06 |

## Sonrası için
- Tuzak: zamanlanmış e-postanın "zamanı geldi mi" kontrolü `last_sent_at`'e (20 saat) bakar; kısmen giden e-posta "gönderildi" yazılmazsa cron aynı kişilere her saat yeniden yollar.
- Kalıp: adla çağrılan bir servise varsayılanlı parametre eklemek API'yi kırmaz; eski imza düşürülür (ikinci aşırı yükleme kalmaz), yetki yeniden verilir.
- Karar adayı: kısmi teslim "başarı + not" olarak kaydedilir; yalnız hiç kimseye gitmeyen gönderim başarısızlık sayılır.

## Rapor
**Karar:** BE-2b-DB bitti; ONAY @45248974 (R2) — izin beklemeden DB-1b ile birlikte gönderiliyor.
**İzin:** canlı migration için izin istiyorum (main CI yeşil olunca).
**Risk:** 🟢 yalnız başarı kaydına isteğe bağlı bir not eklendi; bugünkü API çağrısı aynen çalışıyor.
**Soru:** yok.
**Sonraki:** web hattı `task/ekran-01-be-2b` API tarafını yapar (6. parametre); ben DB-2.

### 1. Nerede duruyor
Bitti; DB-1b ile aynı gönderimde main'e gidiyor (R2: inceleme ONAY + tam kapı yeşil + Done when kanıtlı).

### 2. Ne yapıldı (etkisi)
Schedule → Export → zamanlanmış haftalık e-posta: 10 alıcıdan Ali'nin adresi hatalıysa
- önce: her hafta "başarısız" sayılıyordu, üç haftada kural kapanıyor, öteki 9 kişi e-postayı almayı bırakıyordu;
- şimdi: hafta "Not delivered to 1 of 10 recipients: ali@…" notuyla görünür, gönderim "yapıldı" sayılır (9 kişiye bir saat sonra tekrar gitmez), ardışık başarısızlık sayacı sıfırlanır. Kural yalnız hiç kimseye gitmeyen üç gönderimde kapanır.

### 3. Açık kalanlar
- **Sözleşme (web hattı, `task/ekran-01-be-2b`):** `record_schedule_export_schedule_success_service(target_workspace_id, target_schedule_id, target_sent_at, target_format, target_params, target_undelivered text default null)`. Kısmi gönderimde cron 6. parametreye ulaşmayan adresleri yazar (ör. "Not delivered to 1 of 10 recipients: ali@example.test"; en çok 500 karakter). Hiç kimseye gitmezse bugünkü gibi `record_schedule_export_schedule_failure_service`. Tam gönderimde 6. parametre verilmez (not temizlenir). API 6. parametreyi geçene kadar kısmi gönderim bugünkü gibi işlenir.
- Canlı migration izni.

### 4. Ekranda ne değişti
Görünür değişiklik yok (API tarafı gelince Export panelindeki hata satırı kısmi teslimi söyler).

### 5. Sırada ne var
DB-2 (canlı kanal). Bağlam dolarsa devir notuyla yeni oturuma.

### Kanıt
- pgTAP `scheduled_export_partial_delivery.test.sql` 9 hücre: eski kodda imza yok (hata), migration'la 9/9.
- İlgili dosyalar migration'la (rollback): `scheduled_export_sends_only_live_locations` 8, `archived_location_counts_nowhere` 42, `deleted_location_counts_nowhere` 19, `schedule_asks_the_core` 90, `schedule_one_function_per_job` 34, `workspace_rls` 119, `authorization_coverage` 5, `authz_catalog` 11, `browser_privileges` 9, `retired_objects_stay_gone` 19 — kırmızı 0.
- Commit `45248974`, migration `20261007070000_partial_email_delivery_keeps_the_rule.sql`.

Senin yerine verdiğim kararlar (teknik, P19): yeni servis ya da başarısızlık servisine parametre yerine başarı servisine isteğe bağlı not; çünkü kısmi teslim "gönderildi" sayılmazsa cron aynı kişilere her saat yeniden yollar.

## İnceleme
KARAR: ONAY @45248974

**Kapsam:** commit 45248974'ün iki dosyası (migration ve yeni pgTAP testi). Bunları eski fonksiyonla (`20260907107000_schedule_export_schedule_cron.sql:51-100`), cron'un aday listesiyle (`20260929150000_scheduled_exports_send_only_live_locations.sql:64-71`) ve API'deki çağrıyla (`apps/api/src/schedule/schedule-service.ts:1190-1203`) karşılaştırdım. Veritabanında hiçbir şey çalıştırmadım. Bu oturumda Bash yoktu, bu yüzden `git show` yerine dosyaların kendisini okudum.

**Kurala uygunluk (KK-166):** Yeni gövde eskisiyle aynı. Tek fark, `last_error` artık `null` yerine `left(nullif(btrim(target_undelivered),''),500)` alıyor. Sonuç:
- Kısmi gönderim sayacı 0'a çekiyor.
- Hafta, e-postayı kimin almadığını gösteriyor.
- Hiç kimseye ulaşmayan gönderim yine başarısızlık fonksiyonundan geçiyor ve 3'te kuralı kapatıyor.
- Tam gönderimde 6. parametre `null` geliyor, davranış eskisiyle aynı kalıyor.
- `last_sent_at` yazılması doğru. Yazılmasaydı cron'un 20 saatlik bekleme kontrolü işlemezdi ve aynı 9 kişiye her saat yeniden e-posta giderdi.

**Sorulan yan etkiler:**
- **Kayıt satırı (`schedule_export_events`):** Kısmi gönderimde de bir satır yazılıyor. Doğru, çünkü e-posta 9 kişiye gerçekten gitti. Eskiden tam gönderimde de aynı satır yazılıyordu.
- **`auto_disabled_at := null`:** Bu değişiklikle gelmedi, eski fonksiyonda da vardı (satır 70). Kapanmış bir kural zaten gönderemez: aday listesi `s.enabled and s.auto_disabled_at is null` şartını arıyor (satır 64-65). Yani bu yol kapalı bir kural için hiç çalışmaz.
- **İmza ve aşırı yükleme:** Eski 5 parametreli imza silinip yenisi kuruluyor, yanında ikinci bir sürüm kalmıyor. Bu yüzden uygulamanın veritabanı geçidinin (PostgREST) hangi sürümü çağıracağı konusunda bir belirsizlik yok. Fonksiyonun adı yalnız üç yerde geçiyor:
  - API: parametreleri adla ve 5 tane geçiyor, 6. parametrenin varsayılan değeri olduğu için çalışır.
  - `authorization_coverage.test.sql:179`: yalnız adla eşleştiriyor, imzaya bakmıyor.
  - Yeni test.

  Başka hiçbir SQL fonksiyonu ya da test bu fonksiyonu konumsal 5 parametreyle çağırmıyor. Bu bir imza değişikliği, eski bir nesnenin yerine yenisinin gelmesi değil. Bu yüzden `retired_objects_stay_gone` listesine eklenmesi gerekmiyor.
- **Yetkiler:** Yeni 6 parametreli imzada önce public, anon ve authenticated'ın yetkisi alınıyor, sonra yalnız service_role'e çalıştırma izni veriliyor. Eski fonksiyondaki düzenle aynı.
- **Sıra:** Migration'ın zaman damgası şu anki en sonuncu (`20261007050000`'dan sonra geliyor).

**Test:** Dokuz kontrol şunları kapsıyor:
- kısmi gönderim notu yazıyor
- `last_sent_at` doluyor
- sayaç 0 kalıyor
- kısmi, kısmi, başarısız sırasında sayaç 1 oluyor ve kural açık kalıyor
- başarısızdan sonra gelen kısmi gönderim sayacı sıfırlıyor
- üst üste 3 başarısızlık kuralı kapatıyor
- tam gönderim notu temizliyor

Kuralın üç bacağı da var. Test verisi geçerli: alıcı sayısı 1-10 arasında, lokasyon `pd:K` de test dünyasında kuruluyor (`builder.sql:193`).

**80 güven eşiğini geçen bulgu yok.** Eşiğin altındaki notlar, engel değil:
- `scheduled_export_partial_delivery.test.sql` — düşük — yalnız boşluktan oluşan `target_undelivered` değerinin `null`'a dönmesi ve kısmi gönderimde kayıt satırının yazılması test edilmiyor. Bu ikisi için birer kontrol eklenebilir.
- `20261007070000_...sql:5-6` — bilgi — yorum "the cron passes the missed addresses" diyor ama API hâlâ 5 parametre geçiyor. API tarafı 6. parametreyi geçene kadar kısmi gönderim pratikte hâlâ bugünkü gibi işleniyor. Kural, API işi de main'e girince kapanmış sayılmalı.

**Bellek notu (dosya yazılmadı):** Bu fonksiyonun tek çağıranı `schedule-service.ts:1191`. Adla çağrıldığı için varsayılan değeri olan bir parametre eklemek API'yi kırmaz.
