# AVAIL-002 not-meta inceleme (nf-guvenlik, R2)

**KARAR: ONAY @de081eab**

İncelenen: `task/avail-002-note-meta` @ `de081eab` (taban `0e0f2b4f`). Bulgu yok. Aşağıda iki gözlem var, onayı etkilemiyor.

## Sorulan beş nokta
1. **Yazanın adı ve tarihi kime gidiyor?** Yalnız notu okuma izni (`availability.note_read`) olana. İki alan, mevcut `readable_notes` adımının içinde üretiliyor. O adım satır satır `authz_reason(actor, …, 'availability.note_read', target_person)` soruyor. İzni olmayan okuyucunun not satırı hiç oluşmuyor, alanlar null kalıyor.
   - Okuma yolları tek tek:
     - Izgara: süzgeçten geçiyor.
     - Haftalık projeksiyon (`schedule_week_availability`): değişmedi, yazanı taşımıyor.
     - Yazma anı kontrolü, preflight, varsayılan saat önizlemesi: değişmedi, yazan alanı yok.
     - Employee Hub → Schedule (`get_employee_schedule_board_service`): değişmedi. pgTAP, Ali'nin ekranında `manager_notes`, `note_author` ve `note_edited_at` anahtarlarının hiç olmadığını kontrol ediyor.
   - Başka workspace ve kapsam dışı lokasyon: not satırları zaten yalnız görünen kişiler için okunuyor (`visible_employees`, kapsam `scope_set`).
2. **Fonksiyon gövdesinde başka değişiklik var mı?** Yok. Canlı tanım (`pg_get_functiondef`) ile main'deki son tanım (`20261007000000`) aynı, yalnız sondaki boş satır farkı var. Yeni tanımla karşılaştırınca yalnız iki yer değişmiş: `readable_notes` select'i (yazan adı, tarih ve `left join employee_profiles`) ve `weekly_availability` nesnesindeki iki alan. Başka satır değişmemiş.
3. **Ad kuralı ve null:**
   - Ad, ızgaradaki `display_name` ile aynı biçimde kuruluyor (`coalesce(nullif(preferred_name,''), first_name) || ' ' || last_name`).
   - Yazanın profili yoksa `left join` null döndürüyor; shared şema ve web null'ı kabul ediyor.
   - Bağ `author.workspace_id = reminder.workspace_id` ile kuruluyor, yani başka workspace'teki bir kişinin adı bu yoldan okunamıyor. (workspace_id, user_id) çifti tekil, satır çoğalmıyor.
4. **Izgara hızı:** `schedule_grid_read_budget` 17/17. Owner ve tek lokasyon müdürü 50 ms altında.
5. **Gevşetilmiş test var mı?** Yok. Plan 18'den 21'e çıktı: yazan doğru, tarih doğru, izni olmayan müdüre ikisi de null. Employee Hub kontrolü daraltılmadı, iki yeni anahtar da yasak listesine eklendi.

## Gözlemler (onayı etkilemez)
- **Mod değişikliğinde yazan değişiyor.** Owner veya admin Settings'te giriş modunu değiştirince notun `updated_by` alanı onun adı oluyor. Örnek: Ayşe'nin yazdığı not, mod değişince "Zeynep" diye görünür. Yazar bunu kodda not olarak işaretlemiş. Mert'e ürün sorusu olarak gidebilir; güvenlik sorunu değil.
- **Arşivlenmiş yazarın adı görünmeye devam ediyor.** Profil filtresinde `archived_at` yok, yani notu yazan kişi işten ayrılsa da adı görünüyor. Bu, vardiyalardaki "kim yaptı" bilgisiyle tutarlı; yalnız bilgi.

## Kanıt
- `git diff origin/main...de081eab`: 5 dosya. Fonksiyon gövdeleri `diff` ile karşılaştırıldı; canlı tanım `pg_get_functiondef` ile alındı.
- `db.lock` alındı ve bırakıldı. Her test dosyası kendi psql oturumunda, geri alınan bir işlem içinde koştu: `begin;` + branch builder + migration + test + `rollback;`. Ortak DB öncesi ve sonrası aynı (399 / 1779, fonksiyon md5 aynı).
  - schedule_reads_weekly_availability 21/21
  - schedule_grid_read_budget 17/17
  - availability_always_warns 69/69
  - schedule_week_availability 15/15
- Web ve shared vitest'i koşmadım; değişiklik tek bir fonksiyon ve şemada iki opsiyonel alan. Web testi gerçek DB tarih biçimini (`+00:00`, mikrosaniye) şemadan geçiriyor.