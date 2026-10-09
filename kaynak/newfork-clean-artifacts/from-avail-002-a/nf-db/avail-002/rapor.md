# AVAIL-002-A — nf-db raporu (A1 + A2)

**1. Nerede duruyor:** A1 ve A2 bitti, dalda üç commit; push yok. Main'e almadan önce: `nf-guvenlik` incelemesi (R3) ve B'nin (nf-backend) aynı pencerede hazır olması (S-A cevabı).
Worktree `C:\Users\TheWe\Documents\Codex\newfork-wt\avail-002-a`, dal `task/avail-002-a`, taban `origin/main` `836d967a`.
Commit'ler: `9531ee10` (A1), `b8185352` (A2: yetki, keep/cancel, M3, bildirim), `9d8c767c` (A2: çok aralık + kayıpsız çeviri).
Migration'lar: `20261007000000_availability_always_warns.sql`, `20261007010000_availability_writes_ask_the_core.sql`, `20261007020000_availability_hours_in_several_ranges.sql`.

## 2. Ne yapıldı (etkisi)
**A1 — müsaitlik her zaman uyarı, not yalnız hatırlatma**
- Schedule'da yazma: çalışanın işareti her yolda yalnız uyarı (`availability`, `warn`); hiçbir yolda çakışma ya da ret yok — tek vardiya, toplu, varsayılan saat, oturum, taslak, şablon, yayın kopyası, cover onayı (`availability_always_warns`, 64 hücre). Yazma kapısı ölçüldü: müsaitlikten ret yolu yoktu, kalmadı.
- Yönetici notu (M12): ayrı `note` gerekçesi; turuncu saat değil, `has_availability_conflict`'e, parmak izine, Auto-fill'e, Publish'e, cover aday uygunluğuna girmez. Notun saatleri yalnız notu okuyabilene (`availability.note_read`) döner — yazarken açılan kontrolde de (testte: notu okuyamayan "shift lead" notu almaz).
- Publish → Pre-flight (M9): müsaitlik satırları `tier: note`, onay yok; `availability_state`, `warning_policy`, `acknowledged_by_*` yok; "Acknowledge the availability warnings" hatası ve "Availability warning acknowledged." kaydı silindi (`prosrc` sayımı 0, testte). S-B (a): kapalı gün gibi çakışmaların "Previously accepted schedule conflict retained." kaydı duruyor.
- "Changed after publishing" (M11, D8): yayınlanan vardiyanın anlık görüntüsü `first` taşır (vardiyanın aynı kişiyle ilk yayınında kendi işareti var mıydı). Izgara alanı = bugün kendi işareti var ve ilk yayında yoktu. Onaylı izin sayılmaz; unpublish → republish ve saat değişip yeniden yayın sonucu değiştirmez; taslakta girilen işaret "changed" demez (testte).
- Okuma: haftalık müsaitlikte `unavailable_intervals` ve günlük turuncu yalnız çalışanın işareti; not saatleri ayrı `note_intervals`, yalnız notu okuyabilene dolu.
- BL-206 DB yarısı: `list_schedule_draft_availability_conflicts_service` silindi, `retired_objects_stay_gone`'da.

**A2 — yazma yolları, keep/cancel, M3, çeviri, bildirim**
- M13 çekirdekte: `availability.own` yalnız employee rolüne; onboarding'i bitirmemiş employee de kendi haftasını yazar (onboarding adımı aynı kaydı yazıyor, M2). Matris: ali/emre/veli → izin; ayse, can, zeynep, olcay, aydan (onboarding'deki müdür) → `rank`; askıdaki/çıkarılmış → `not_active`; dışarıdan → `not_member`. Çekirdek değişikliği: `own` eylemi `employee_target` bayrağını da sorar (bayrağı taşıyan başka `own` eylemi yok).
- Dört servis çekirdeğe soruyor: `weekly_preferences_read/save_service`, `weekly_preference_settings_read/save_service`. Ham üyelik sorgusu ve eski yardımcı yok; eski yardımcının çağıranı 11 → 10 (`authz_catalog` tavanı 10). "Hayır" 42501 + `authz.*` hint (testte not_member, out_of_scope, rank, missing_permission).
- M5: hafta kaydında bekleyen takas / cover / pickup hiç sorulmaz, hiç değişmez (testte 3 başvuru + 5 vaka aynı). Silinen: `weekly_preferences_preview_service`, `weekly_preference_commitment_conflicts`, `weekly_preference_commitments`, `weekly_preference_commitment_decisions` tablosu, `weekly_preference_events.decisions` kolonu (`retired_objects_stay_gone`'da).
- M3: shift type modunda o günün bütün seçilebilir (aktif, saatli) tipleri işaretliyse kayıt `all_day: true`, tip listesi boş; çeviri sonucu da aynı kuralla.
- M4 / S2 (a): saat modunda gün birden çok aralık (`ranges`). Tipten saate kayıpsız: Lunch + Dinner iki aralık kalır (aradaki boşluk müsait), gece yarısını geçen kısım ertesi güne (Cumartesi → Pazar). Sağlama pgTAP'te dakika dakika: çeviri öncesi ve sonrası unavailable dakikalar birebir aynı.
- S3 (a): saatten tipe, bir dakikası bile işaretli saate düşen tip işaretlenir; gece yarısını geçen tipin ertesi güne düşen kısmı da sayılır (örnek: Pazartesi bütün gün işaretliyse Pazar'ın 22–02 "Late" tipi işaretlenir). Hiçbir tipin saatine düşmeyen saat tip modunda tutulamaz (bugünkü gibi); sağlama: bir tipin saatine düşen her işaretli dakika korunuyor.
- M4 bildirim (D4): "Check your availability" her employee'ye (aktif ya da onboarding'de, haftası olsun olmasın); yöneticiye gitmez.
- Kayıtlı haftalar migration'da yeni biçime çevrilir (`range` → `ranges`).
- Canlı ölçümü (yalnız SELECT, 2026-10-04 ~15:40Z): silinen tabloda 0 satır, `decisions` dolu 0 kayıt, `weekly_preference_events` 0 satır, müsaitlik onay kaydı 0.

## Kanıt
- Geri alınan denemeler, her dosya kendi psql oturumunda, üç migration + yeni `tests.availability`: `ci-green.txt`'in 163 dosyasından 161'i yeşil (koşu ~15:50Z; düzeltilen iki dosya 16:00Z civarı ayrıca yeşil: `schedule_asks_the_core` 90 ok, `schedule_draft_availability_reads` 17 ok). Kalan iki kırmızı `bl052_document_lifecycle`, `bl052_document_notifications` migration'sız da aynı hatayı veriyor (ortak DB kayması; 2026-10-02 notuyla aynı).
- İz yok: workspaces / auth.users / authz_actions her koşu öncesi ve sonrası 391/1726/80.
- Izgara: `schedule_grid_read_budget` 17/17 — owner ve tek lokasyon müdürü ≤ 50 ms.
- Kırmızı-önce: A1 testi migration'sız 21 kırmızı; A2 komut testi 12 kırmızı.
- Deneme betiği `artifacts/nf-db/avail-002/trial.sh` (gitignore). Yolda bulunan: betik ilk satırı `begin;` olmayan dosyaya migration eklemiyordu; yalnız `weekly_preference_mode_conversion` etkilenmişti, düzeltilip yeniden koşuldu.

## 3. Açık kalanlar
- `nf-guvenlik` incelemesi (R3) — senin göndermen bekleniyor. Bakılacak yerler: `app_private.authz_check` (`own` + `employee_target`), dört servis, `app_private.weekly_preference_may_write` / `weekly_preference_whole_days` (grant'lar `public, anon, authenticated`'tan alındı), tablo/kolon silme.
- A tek başına main'e giremez (S-A (a)): kayıt biçimi, kayıt cevabı, Publish bulgusu ve silinen iki uç web/API'yi kırar. B bu daldan açılmalı.
- Tam kapı (lint/typecheck/test/build) A'da koşulmadı: değişen yalnız `supabase/**`; `pnpm test`'te `packages/shared` yetki ikizi (authorization.test) B'nin ikiz güncellemesine kadar kırmızı olur.
- Ultrareview önerisi (CLAUDE.md §5): yetki çekirdeği + tablo silme var; ücretsiz hak bittiyse yalnız dolar tutarıyla (ILKELER P06: Mert iki kez "iki inceleme yeter" dedi).

## 4. Ekranda ne değişti
Bu dilim yalnız veritabanı; görünür değişiklik B ve C ile gelir.

## 5. Sırada ne var — B (nf-backend) için sözleşme
1. Gün biçimi: `{day, all_day, shift_type_ids, ranges: [{start, end}]}`; `range` yok. `ranges` sıralı, ayrık (değen iki aralık tek aralık olmalı), gün içi (`end` 24:00 olabilir), en çok 12. all_day ve shift_type modunda `ranges: []`.
2. `weekly_preferences_save_service` cevabı `{model}`; `kept_count`, `cancelled_count`, `resolved_count`, `finalized` yok. `decisions` gönderilmez (gelirse yok sayılır). Önizleme servisi yok → `availability-service.ts:67-68,79` ve `weekly-preferences-routes.ts` önizleme ucu silinir.
3. Ret: 42501 + hint; `authz.not_member` → 404, öteki `authz.*` → 403. Ayar okuma artık employee'ye kapalı (`settings.availability.read`: müdür ve üstü). Employee rolü dışındaki kişi kendi haftası için `authz.rank` alır.
4. Değerlendirme gerekçesi: yeni kod `note` (`severity: warn`, `intervals`); `availability` gerekçesinde `source` yok; `has_availability_conflict` yalnız çalışanın işareti; notu okuyamayan için `manager_intervals: []` ve `note` gerekçesi yok.
5. Publish bulgusu `code: availability`: `tier: note`, `overrideable: false`; `availability_state`, `warning_policy`, `introduced`, `acknowledged_by_*` yok; karar listesine konmaz.
6. Haftalık projeksiyon: yeni `note_intervals` (okuyamayana `[]`).
7. `list_schedule_draft_availability_conflicts_service` yok → `schedule-service.ts:760` ve `schedule-routes.ts:1422`.
8. Yetki ikizi: `packages/shared/src/authorization.ts`'e M13 satırı (`availability.own` yalnız employee, onboarding'deki employee dahil) + `AUTHZ_MATRIX_PRELUDE` (üç migration) ile `dump:authz-matrix`. `authz_actions`: `availability.own` `restricted_ok=true`, `employee_target=true`.

Yolda bulunan (dokunulmadı): yazma kapısının ret metni hâlâ "Resolve availability, shift hours or approved time off…" diyor; müsaitlik artık hiç reddetmediği için metin yanıltıcı (B/C'de ekranda görünüyorsa düzeltilebilir).

## Senin yerine verdiğim kararlar (teknik, P19)
- "İlk yayın" ölçüsü anlık görüntüde `first` alanı (mantıksal vardiya + aynı kişi); eski görüntüsü olmayan kayıt "değişmedi" sayılır (canlı veri yok).
- Ayar okuma çekirdeğin `settings.availability.read` tanımına uyduruldu (employee okuyamaz; ekranda karşılığı yok). Eski test "employee okur" diyordu, kuralla değiştirildi.
- M3 normalizasyonu çeviri sonucuna da uygulanıyor.
- Saatten tipe: gece yarısını geçen tipin ertesi güne düşen kısmı da "değen" sayılıyor (S3 (a), kayıpsızlık yönünde).
- `schedule_asks_the_core`: müdürün kendi haftasını kaydettiği iki hücre M13 ile düştü; yerine "Can kendi haftasını kaydedemez" ve "admin, Emre'nin güncellemesini duyar".

## Skill
- superpowers:test-driven-development: her davranış önce kırmızı pgTAP, sonra yeşil.
- writing-plans açılmadı: ILKELER P15 süreçle çakışan diye reddediyor; plan görev dosyasındaki dilim listesiydi.
- supabase-postgres-best-practices açılmadı: sıcak yol (ızgara) bütçe testiyle ölçüldü, 50 ms altında.
- verification-before-completion: iddialar yukarıdaki koşu çıktılarıyla.
