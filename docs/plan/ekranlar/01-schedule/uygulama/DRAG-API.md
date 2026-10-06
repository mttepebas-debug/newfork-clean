# DRAG-API — Schedule okuması çakışma kurallarını taşır

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| Schedule | EKRAN-01 DRAG-API | nf-backend / web hattı | R2 | ONAY @7f7e90dc (bağımsız kod incelemesi alt ajanı) | 2026-10-06 |

## Sonrası için
- Tuzak: API bir okuma modelini zod'dan geçirmeden önce alan alan yeniden kurarsa veritabanının yeni alanlarını sessizce düşürür; okuma modeli olduğu gibi geçmeli (`schedule-service.ts` `settings`).
- Kalıp: veritabanı fonksiyonunu kalıcı yazma olmadan gerçek veriyle denemek için `docker exec supabase_db_newfork-clean psql -U postgres -d postgres -tA -c "begin;" -c "select …" -c "rollback;"`.
- Ölçüm: yerel `workspace_scheduling_settings` 426 satır, `conflict_rules` tam 7 anahtar, boş değer yok; workspace 422 = ayar satırı 422 (2026-10-06).
- Karar adayı: arayüz hattının ölçümü (sürükleme rengi) kök nedeni veri katmanında buldu; renk / görünüm sorununda önce API cevabının gerçek şekli okunmalı.

## Rapor
### EKRAN-01 DRAG-API — rapor (web hattı, nf-backend)

**Karar:** bağımsız kod incelemesi ONAY @7f7e90dc · sınıf R2
**İzin:** R2 — inceleme ONAY + tam kapı yeşil + main yeşil → izin beklemeden gönderiliyor (main sha ve CI panoda)
**Risk:** 🟢 tek satırlık veri geçişi; Schedule okumasının şeması kuralları zaten tanıyordu, yerel veritabanında 426 ayar satırının hepsi şemaya uyuyor
**Soru:** yok
**Sonraki:** BE-1 gönderimi (izinli), sonra BE-2 gönderimi (ONAY @15c760df, kapı yeniden koşulacak)

#### 1. Nerede duruyor
Bitti; incelendi, tam kapı yeşil. Dal `task/ekran-01-drag-api`, worktree `C:\Users\TheWe\Documents\Codex\newfork-wt\drag-api`, commit'ler `7f7e90dc` + `6b35a5cc` (incelemenin önerdiği test temizliği).

#### 2. Ne yapıldı (etkisi)
- **Öncesi:** Schedule'ı açan herkese giden okuma (API) workspace'in çakışma kurallarını yolda düşürüyordu; ekrana yalnız saat biçimi gidiyordu. Ekran kuralları göremeyince her sürüklemede hedef hücreyi "kontrol edilmeli" diye turuncu yakıyordu: boş, uygun hücre yeşil yerine turuncu; Ali'nin onaylı izinli Çarşamba'sı kırmızı yerine turuncu ve bırakılabilir.
- **Sonrası:** okuma, veritabanının gönderdiği ayarları olduğu gibi taşıyor: saat biçimi, çakışma kuralları, yol ve dinlenme dakikaları. Bu kurallarla boş uygun hücre yeşil, onaylı izin kırmızı (KARARLAR "Schedule" üç renk); müsait değil turuncu kalıyor.
- Ayarı ikinci kez okuyan ayrı sorgu silindi (veritabanının okuması saat biçimini zaten taşıyordu).
- **Uygulamadaki yeri:** Schedule → Edit → bir vardiyayı sürükle (ya da rol satırındaki hazır vardiyayı, ya da Unassigned satırındaki açık vardiyayı).
- **K17'nin iki okuma yeri (ölçüldü):** hızlı düzenleyici (`ShiftQuickEditor.tsx:420`) ve sürükleme incelemesi (`SchedulePage.tsx:656` → `useScheduleDropReview`) main'de `settings.conflict_rules.closed_location`'ı okuyor; bugüne kadar bu alan hep boş geldiği için "Confirm once" ayarı ekranda hiç çalışmıyordu. Bu düzeltmeyle ikisi gerçek ayarı görür. BE-2 (BL-685) bu iki okumayı da sunucunun kendi işaretine (`confirm_scope`) çeviriyor; BE-2 girince ayar yerine sunucunun cevabı karar verir, iki kaynak kalmaz.
- **Yan etki (ölçüldü):** kurallar geldiği için hızlı düzenleyici artık kişisi olmayan vardiyada da uygunluk kontrolü çağırıyor (`ShiftQuickEditor.tsx:494`, K17 kapalı gün için tasarlanmış). Yerel veritabanında gerçek çağrı (geri alınan transaction): Meyhouse, kişisiz 09:00–17:00 → `allowed`, hata yok.

#### Done when (koordinatörün görev mesajı)
1. API cevabında kurallar var ✓ — `schedule-service.test.ts` "passes the Schedule's conflict rules through…" (önce kırmızı: `{ time_format: '12h' }` döndü).
2. Web'de boş uygun hücre "allowed", onaylı izin "blocked" ✓ — `useScheduleGridDragControllers.test.ts` "colors a free cell allowed and an approved day off blocked once the rules arrive" (kural yoksa "warning" olduğunu da kilitliyor).
3. K17'nin iki okuma yeri ölçüldü ve raporlandı ✓ (yukarıda).

#### Kanıt
- Yerel veritabanı (2026-10-06, SELECT): `workspace_scheduling_settings` 426 satır, `conflict_rules` anahtarları tam 7 (şemanın strict nesnesiyle aynı), boş `conflict_rules` / `minimum_travel_minutes` 0; workspace 422 / ayar satırı 422 (tetikleyici `initialize_workspace_scheduling_settings` her yeni workspace'e satır açıyor). Bu yüzden boş ayar için tolerans yazılmadı.
- Tam kapı (`7f7e90dc`, worktree `newfork-wt/drag-api`): lint + typecheck + test + build EXIT=0 — ui 9, shared 209, api 1104, web 2166 (+1 atlanan). Sonraki test temizliği (`6b35a5cc`): `schedule-service.test.ts` 25/25, lint temiz.
- İnceleme: ONAY @7f7e90dc; iki küçük not — eski bir testteki ölü ayar sahte kurulumu (düzeltildi, `6b35a5cc`), okuma `settings`'i hiç göndermezse varsayılan saat biçimine düşülmesi (bugün oluşamaz; değiştirilmedi).

#### 3. Açık kalan ve nedeni
- Yok. Görsel kısım (ham hex → token, `data-drop-status` vitest'i) arayüz hattının DRAG diliminde.
- Bilgi (incelemeden): Schedule'ı okuyabilen herkes artık workspace'in çakışma kurallarını ve yol / dinlenme dakikalarını da alıyor; kişisel veri değil, workspace politikası. Koordinatörün bilgisine; bence sorun değil.

#### 4. Ekranda ne değişti
- Schedule → Edit → sürükleme: boş uygun hücre artık yeşil, onaylı izinli gün kırmızı (bırakılamaz). Müsait olmadığı saat turuncu (bırakılabilir) — değişmedi.
- Hızlı düzenleyicide "Confirm once" kapalı gün ayarı artık gerçekten bir kez soruyor (önceden her hücrede soruyordu, çünkü ayar ekrana ulaşmıyordu).
- Ekran görüntüsü alınmadı: renkler arayüz hattının DRAG dilimiyle birlikte görsel olarak doğrulanacak.

#### 5. Sırada ne var
- BE-1 gönderimi, sonra BE-2 gönderimi.
- Yolda bulunan: `schedule-service.test.ts`'te başka birkaç test zincirinde artık okunmayan `maybeSingle` ayar sahte yanıtları duruyor (zararsız, genel zincir parçası) — K-1'de temizlenebilir.

Skills: superpowers:test-driven-development (API testi önce kırmızı).

## İnceleme

### Kod incelemesi — KARAR: ONAY @7f7e90dc
KARAR: ONAY @7f7e90dc

I reviewed by reading the files in the drag-api worktree. I had no shell, so I did not run `git diff` or the vitest command. I read the changed code directly, and I'm assuming the worktree is checked out at 7f7e90dc.

**Critical:** none.

**Important:** none.

**Minor (non-blocking):**

1. `apps/api/src/schedule/schedule-service.test.ts:159-223` is a stale test.
   - The case "loads independent metadata concurrently after the authorized read model" still mocks a `workspace_scheduling_settings` select (lines 182-190) and calls `resolveSettings` (line 213).
   - `getReadModel` no longer reads that table, so the mock is dead. The test now proves nothing about settings and nothing about concurrency of that read.
   - It passes only because the RPC mock omits `settings` and the schema default `{ time_format: "12h" }` fills in. Failure scenario: someone re-adds a `workspace_scheduling_settings` read and this test no longer notices.
   - Fix: delete the `settingsResult`/`resolveSettings` plumbing. Either rename the test to what it checks now (important_dates and the other reads run in parallel) or drop it.

2. `schedule-service.ts:506` passes `readModelPayload.settings` straight through. If the RPC ever omitted `settings`, the schema default `{ time_format: "12h" }` applies silently. The web then treats the rules as missing, so every drop is orange and the "Scheduling rules or availability need checking" confirm appears.
   - Today's RPC always sends `settings`, so this is not reachable.
   - It is the same fail-soft shape as before, so I'm not asking for a change. One negative test (payload without `settings`) would pin it.

**What I checked, and what held:**

- **Producer of the payload.**
  - `public.get_schedule_read_model_service` is the only RPC `getReadModel` calls (`schedule-service.ts:426`).
  - The latest definition is `20261007030000_manager_note_names_its_writer.sql:122-127`. It always emits `time_format` (coalesced to '12h'), `conflict_rules`, `minimum_travel_minutes` and `minimum_rest_minutes`.
  - The `_label_base`, `_employee_exclusion_base` and `_shift_label_management_base` variants were dropped in `20260926150000_one_function_per_schedule_job.sql:49-51`, so there is no older version to fall back to.
  - The only other `getReadModel` callers are `schedule-routes.ts:1256`, `:2420` and `schedule-export-v2-routes.ts:28`. They pass the result along and never read `settings` (grep found no `readModel.settings` use in the routes).

- **Strict parse of `conflict_rules`.**
  - `scheduleConflictRulesSchema` (`packages/shared/src/availability-assessment.ts:8-23`) has the 7 keys. They match the DB check constraint `scheduling_conflict_rules_valid`, which allows only those keys, in `20261005010000_closed_location_loses_warn.sql:10-25`.
  - The `closed_location` enum is `confirm|confirm_once|block` in both. That migration also rewrote `warn` to `confirm_once`, so no row can fail the enum.
  - The overdue-not-softer-than-grace rule is enforced in both the schema and the constraint.
  - A row the DB accepts therefore passes the strict schema.

- **JSON null for `minimum_*`.** Both columns are `not null default 0` (`20260909032000_shift_exchange_shared_travel_policy.sql:5`, `20260915081826_bl064_conflict_severity.sql:6`). `.optional()` would reject a JSON null, but a null cannot occur. `minimum_travel_minutes` is checked to 0-240 and `minimum_rest_minutes` to 0-1440, both inside the schema's `nonnegative()`.

- **Missing settings row.** A workspace with no row would make `to_jsonb` produce nulls. That would fail parse, because `conflict_rules` is optional but not nullable. The trigger `initialize_workspace_scheduling_settings` and your 426-row measurement rule it out for existing workspaces. This is the one condition the change depends on.

- **Web consumers.**
  - These now see real rules: `schedule-conflicts.ts:22,434,437`, `SchedulePage.tsx:647`, `ShiftQuickEditor.tsx:420` and `useScheduleGridDragControllers.ts:42`. That is the intended effect.
  - `ShiftQuickEditor.tsx:494` (`if (model.settings.conflict_rules || value.employee_id)`) now runs the shift-assessment call on save even for unassigned shifts. The condition reads as designed for K17 closed-day checks. I did not confirm the shift-assessment API accepts a null `employee_id`, so confirm that or leave it to the e2e run.

- **Disclosure.** Anyone who can read the schedule through this RPC now also gets the workspace rules and the travel and rest minutes. That includes non-manager readers if the RPC serves them. These are workspace scheduling policy rather than personal data. I'd call it acceptable, but confirm it is intended.

- **New tests.**
  - The API case (`schedule-service.test.ts:61-83`) feeds a full valid rules object from the RPC mock and asserts `result.settings` equals it. That pins the pass-through and the strict parse of all 7 keys.
  - The web case (`useScheduleGridDragControllers.test.ts:116-126`) asserts a free cell is `allowed`, an approved day off is `blocked`, and a model with no rules falls back to the confirm path. That matches the hook at `:42`.

Memory note for the report: the `loads independent metadata concurrently` test in `schedule-service.test.ts` carries a dead `workspace_scheduling_settings` mock. The read model's `settings` now comes only from the RPC, which is the only producer.
