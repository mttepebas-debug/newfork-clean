# G8b / BL-254 — arşivli iş ve vardiya tipi adı eski vardiyada: bağımsız inceleme (R2)

**KARAR: ONAY @e457e672** (dal CI `36811698988` yeşil bitmesi şartıyla; bakarken koşuyordu)

Rol: nf-guvenlik (salt okunur), 2026-09-30. Dal `task/g8b` (taban `31d4c67b`, main `a8416d8a`), iki commit. Migration `20261003020000_archived_names_reach_the_schedule.sql` (463 satır).

## 1. Nerede duruyor
İnceleme bitti. Bulgu yok. Bir sıra şartı (S5) var.

## 2. Sorulan beş soru

**S1 — Sızıntı: hayır.**
- Yeni yardımcı `app_private.schedule_referenced_catalog(workspace, job_ids, shift_type_ids)` kendi başına bir şey seçmiyor. Yalnız kendisine verilen kimliklerin adını döndürüyor; yalnız o workspace'ten (`workspace_id = target_workspace_id`), yalnız arşivli ve silinmemiş olanları.
- Kimlikler iki okumanın zaten döndürdüğü vardiyalardan geliyor:
  - Schedule okuması (`get_schedule_read_model_service`): `current_shifts` (okuyucunun erişebildiği lokasyonların o haftaki güncel yayını) ve `ghost_shifts`.
  - Ekip panosu (`get_employee_schedule_board_service`): yalnız `current_shifts` (çalışanın kendi lokasyonları).
- Ghost: aynı hafta (`resolved_week_start`), `status = 'current'` yayın, ızgaradaki kişiler (`visible_employees`), workspace süzgeçli ve arşivsiz lokasyon. Ghost'un `job_name` / `shift_type_name` alanı zaten bu satırda dönüyor; G8b yalnız arşivli işin adını da (eskiden boş) dolduruyor. Yardımcıya giden ghost kimlikleri aynı satırların kimlikleri. Yani ghost bugün taşıdığından fazlasını açmıyor: başka workspace yok (join'lerde workspace koşulu), başka hafta yok, ghost olmayan lokasyon yok.
- Ekip panosu yalnız panoda görünen vardiyaların kimliklerini veriyor; çalışan kendi ekibinin dışındaki bir adı göremez.
- Silinmiş iş ve tip adlandırılmıyor (iki yerde de `deleted_at is null`).

**S2 — Gövdeler: yalnız istenen değişiklik.**
İki fonksiyonu yerel veritabanındaki canlı tanımla `diff -w` ile karşılaştırdım (yerel DB = main, son migration `20261003010000`). Schedule okumasında fark yalnız: ghost'un iş ve tip join'inden `archived_at is null` koşulunun kalkması, yorum ve sonuna yardımcı çağrısının eklenmesi. Panoda yalnız yardımcı çağrısı. Yetki çağrıları (`scope_set`, `authorize`) ve öteki süzgeçler birebir aynı. Seçicilerin listeleri (`jobs`, `shift_types`, departmanlar) hâlâ yalnız canlıları veriyor (`archived_at is null` yerinde).

**S3 — Yardımcının biçimi: doğru.**
`language sql stable`, SECURITY INVOKER, `set search_path = ''`, `revoke all … from public`. Yalnız iki SECURITY DEFINER servisin içinden çağrılıyor (sahibin hakkıyla koşar). G8a'nın `location_is_live` kalıbıyla aynı. Tarayıcı rolünün çağırıp çağıramadığını denemedim (ayrı grant yok, `app_private`).

**S4 — Web: seçiciler arşivliyi listelemiyor.**
`referenced_jobs` / `referenced_shift_types`'ı okuyan tek yer `apps/web/src/schedule/lib/scheduleCatalogNames.ts` (`scheduleJobName`, `scheduleShiftTypeOf`). Önce canlı listeye, yoksa arşivli listeye bakan bir ad bulucu. Kullananlar ad göstermek için: kart, sürükleme önizlemesi, rozet ölçümü, "Paste blocked" satırı, dışa aktarma görüntüsü. Yeni vardiya ve hazır ayar seçicileri hâlâ `jobs` / `shift_types`'tan besleniyor. `ShiftCard`'ın tipi `color?`'ı isteğe bağlı yaptı; arşivli tip varsayılan renkle çiziliyor. Derleyici her kart yolunu görüyor (typecheck dal CI'ında); ekranda bakmadım.
Not: arşivli işli bir vardiyayı kopyalayıp yapıştırmak eski kimliği taşıyabilir. Kabul edilip edilmeyeceği sunucunun vardiya kaydı kuralı; G8b bunu değiştirmiyor.

**S5 — OPS-03: şart, başka kırılma yok.**
- Zorunlu alan: API iki yerde `scheduleReadModelSchema.parse` ediyor (`apps/api/src/schedule/schedule-service.ts:505`, `apps/api/src/employee-hub/employee-hub-service.ts:94`); web de iki yerde. Yeni kod + eski veritabanı = Schedule ve Employee Hub → Schedule 500. Sıra mutlaka önce canlı DB, sonra main. Yerel ortak DB de main'den önce, `main.lock` penceresinde.
- Tersi güvenli: şema `.strict()` değil; eski kod fazla iki anahtarı yok sayar.
- Anahtar süzen projeksiyon yok: `schedule_availability_read_projection` yalnız vardiya başına uygunluk alanlarını süzüyor, okumanın üst anahtarlarını değil.
- İki okumayı veritabanında çağıran başka fonksiyon yok (0).

## 3. Açık kalan ve nedeni
- Ekranda denenmedi. Yeni pgTAP dosyasını, tam `test:db`'yi, e2e'yi ve vitest'i ben koşmadım; kanıt yazarın koşusu ve dal CI'ı.
- `schedule_grid_read_budget`'in iki hücresi kuralla birlikte ters çevrildi ("arşivli tip/iş ghost'ta adlandırılmaz" → "adını korur"). Gevşetme değil; `ci-green.txt` +1.

## 4. Ekranda ne değişti (dalın getirdiği; ben bakmadım)
- **Schedule ızgarası, ekip panosu (Employee Hub → Schedule), ghost kartlar, dışa aktarma:** arşivlenmiş iş ya da vardiya tipi, o haftaki eski vardiyalarda adıyla görünür; etiket yok. Arşivli tipin rengi yok, kart varsayılan renkte.
- **Seçiciler (yeni vardiya, hazır ayarlar, departman/iş listeleri):** değişmedi; arşivli iş ve tip listelenmez.

## 5. Sırada ne var
1. Birleştirme: canlı DB (kullanıcı; OPS-03) → yerel ortak DB (`main.lock` penceresinde) → main. Sıra ters giderse canlıda Schedule ve Employee Hub → Schedule 500 verir.
2. İstenirse küçük bir hücre: "arşivli işli vardiyayı yapıştırmak" bugün ne yapıyor (sunucu kuralı). G8b'nin işi değil.

## Kanıt (2026-09-30, bu oturumda, salt okuma)
| Komut | Sonuç |
|---|---|
| İki okuma: dal gövdesi ↔ yerel DB `pg_get_functiondef`, `diff -w` | yalnız ghost join koşulu, yorum, yardımcı çağrısı |
| Yardımcının tanımı (migration satır 14–38) | sql, stable, invoker, `search_path ''`, `revoke all from public`; workspace, arşivli ve silinmemiş süzgeci |
| `git grep referenced_*` (dal, test hariç) | yalnız ad bulucu ve fikstürler; seçici yok |
| Yerel DB: `jsonb_each` süzgeci olan schedule fonksiyonları; iki okumanın çağıranları | projeksiyon yalnız vardiya uygunluğu; çağıran 0 |
| `scheduleReadModelSchema` `.strict()` mi | hayır |
