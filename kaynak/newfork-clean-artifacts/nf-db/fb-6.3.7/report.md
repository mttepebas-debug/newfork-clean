# FB-6.3.7-db — ara rapor ve devir (nf-db local_72a35150)

## 1. Nerede duruyor
Yarıda, iş sınırında devrediliyor (bağlam ~%46; kalan iş 30 test dosyası, %50'yi kesin geçer).
Dal `task/fb-6.3.7-db` @`9e03f22a` (taban `85745a04`), worktree `newfork-clean/.claude/worktrees/bold-hugle-ff522b`. Commit "WIP": main'e girmez.
Kalıcı uygulama yok: 148 dosyalık geri alınan deneme öncesi/sonrası 333 workspace, 1353 kullanıcı, baş migration `20261003032000`, `jobs.sort_order` duruyor (ölçüldü, 13:48–13:52Z). `db.lock` bırakıldı.

## 2. Ne yapıldı (etkisi)
- **Önce kırmızı:** `retired_objects_stay_gone`'a FB-6.3.7 + BL-496 satırları ve iki yeni kontrol (enum'da `partially_approved` yok; olay eylemlerinde `viewed`/`partially_approved`/`returned_to_pending` yok). Migration'sız: 17'den 7 kırmızı, hepsi yeni satırlar (doğru sebep).
- **Migration** `supabase/migrations/20261003040000_time_off_forgets_location_and_parts.sql`:
  - bütün izin satırları TRUNCATE ile silinir (satır silmeyi engelleyen dönem/geçmiş koruyucuları TRUNCATE'te çalışmaz; başka tablodan FK yok — ölçüldü);
  - 16 fonksiyon silinir (envanterin 15'i + `app_private.record_owner_time_off` — yalnız silinenleri çağırıyordu), `time_off_decision_pieces` tablosu ve koruyucusu;
  - bildirim türü `schedule.owner_time_off.shifts_opened` (outbox/olay/alıcı/registry/şablon/katalog sırasıyla);
  - kolonlar: `schedule_time_off_requests.location_id`, `viewed_at`, `period_version`; dönem anlık görüntüsü (`time_timezone`, `starts_at`, `ends_at`) NOT NULL, yeni `time_off_period_order` CHECK;
  - olay eylemi CHECK'i daraldı; `time_off_request_status` enum'u `partially_approved`sız yeniden kuruldu (kısmi indeks yeniden);
  - BL-496: `departments`/`jobs` `sort_order` ve iki `_unused` CHECK düşer; iki okuyucu düzeltildi; `create_department_*` kolonu anmıyor (ölçüldü);
  - 25 okuyucu yeniden yazıldı: envanterin 10'u + `time_off_period_span`, `time_off_live_locations` (eski lokasyon yedeği), `time_off_display_status` ("Partly approved"), `time_off_finalize`, iki koruyucu tetikleyici, iptal/revoke/kısaltma ekleri, bildirim tetikleyicisi, Requests kuyruğu, pano sayacı, `submit_time_off_service`.
- **builder.sql:** `tests.time_off` silindi; `tests.leave` aynı etiketi (`<w>:<label>:time_off`) hatırlar (aynı gün, aynı imza); 8 testte ad değişti. Yeni `tests.approved_leave(w, employee, by_user, place, day, start, end)`: eski fikstürlerin doğrudan yazdığı onaylı izni bugünkü şekilde kurar (bekleyen talep → anlık görüntülü dönem → onay; `ponytail:` oylamayı atlar). Henüz hiçbir testte kullanılmadı.
- Silinen pgTAP: `time_off_partial_period_decisions`, `time_off_published_assignment_disposition`, `time_off_decision_identity_guard` (yeşil listeden çıktılar; bekçi silinen dosyaya izin veriyor).
- **"Cancel request" (geri çekme):** `employee_request_action_service` (son tanım `20260822100000`), silme listesinde değil. Yeni modelde doğru: kendi bekleyen talebini `revoked` yapar, ekran "Withdrawn" okur (`time_off_display_status`), olay tetikleyicisi karar verenlere (`time_off_deciders`, yeni lokasyon listesi) "Time off withdrawn or revoked" gönderir, sonra gelen oy `time_off_finalize`'da 40001 alır. Kodla doğrulandı; **pgTAP hücresi henüz yazılmadı**.

## 3. Açık kalan (neden: bağlam)
Deneme: 117/148 yeşil, 31 kırmızı. Sınıflar (çıktılar `newfork-clean/artifacts/nf-db/fb-6.3.7/run1/*.out` (git dışı); koşucu aynı klasörde `trial.sh <liste> <çıktı> 1` (ROOT satırı bu worktree)):
- **A. Eski biçim onaylı izin fikstürü** (`insert … location_id … status 'approved'`) → `tests.approved_leave`'e çevrilecek: `availability_is_a_preference`, `bl064_conflict_severity`, `schedule_publication`, `schedule_requests` (bekleyen talebi de doğrudan yazıyor), `shift_exchanges_v1`, `weekly_assignment_candidates`, `weekly_exchange_acceptance`, `weekly_schedule_acceptance`, `weekly_schedule_batch`, `weekly_schedule_integration`, `weekly_schedule_read`, `weekly_shift_availability_assessment`.
- **B. Eski servis çağıran** → `submit_time_off_service` / `decide_time_off_service` / `request_time_off_cancellation_service` / `revoke_time_off_service` / `tests.leave`: `employee_hub` (#9 "unassigned location" artık anlamsız), `schedule_default_hours_review`, `schedule_week_availability`, `time_off_cancellation_requests`, `time_off_decisions_go_one_rank_up`, `time_off_physical_request_counts`, `time_off_requested_periods`, `time_off_shortens_for_a_shift`, `time_off_doors_close_with_the_workspace` (#3,#4,#6 owner kısayolu), `refusals_answer_alike` (#8), `owner_time_off_notifies_open_shifts` → Touches'taki adla `time_off_opens_shifts` (anahtar `schedule.time_off.shifts_opened`; yeşil listede ad değişir).
- **C. Liste/sınıflama:** `authorization_coverage` #2 (silinen fonksiyonların sınıflama satırları çıkar), `schedule_asks_the_core` #4/#5 (silinenler listeden çıkar, "eight" sayacı düşer). `authz_catalog` yeşil ama sayaç tavanları yeni sayıya indirilmeli (ölçülmedi).
- **D. BL-496:** `catalog_sorted_by_name`, `schedule_read_model_rls`, `reads_know_management_and_owner` (#1,#2,#17,#18), `settings_reads_ask_the_core` #13.
- **E.** `time_off_voting:75` silinen kolonu soruyor → kontrol kalkar (plan −1); geri çekme hücresi buraya eklenir.
- **F.** `bl052_document_notifications`: bilinen yerel kayma (BL-497); bu turda migration'sız tekrar koşulmadı.
- Sonra: tam liste yeniden, `bash scripts/ci-green-guard.sh <origin/main>` (tabanda iki izin testi listede değil; main'e rebase'te kapanır — `b9c665f2`), API/web/e2e grep kanıtı, Schedule ızgarası ≤50 ms ölçümü.

## 4. Ekranda ne değişti
Dalda; ekrana çıkmadı. Main'e girince: Requests → Time off satırlarında lokasyon ve "görüldü" bilgisi gelmez; Workspace home'daki bekleyen izin sayısı Requests kuyruğuyla aynı kuralı sayar (kişinin izinlerini okuyabiliyorsan; örn. Ayşe Kadıköy müdürü ise Kadıköy'de çalışan Ali'nin talebi sayılır); "Partly approved" durumu yok.

## 5. Sırada ne var
1. Yeni `nf-db` oturumu: §3'teki A–E (dal `task/fb-6.3.7-db`), sonra tam deneme + grep kanıtı + son rapor. Ultrareview önerilir (veri silme + şema).
2. **nf-backend için (`.7` kod kısmı; bu dal onunla AYNI main gönderiminde girmeli):**
   - Silinen RPC çağrıları: `apps/api/src/schedule/schedule-requests-service.ts` (preview, viewed, decide, resolve ×2) ve uçları `/assignment-preview`, `/viewed`, `/decision`; `apps/api/src/employee-hub/employee-hub-service.ts:140,152` (eski gönderme) ve `:163` (`request_cancellation` → `request_time_off_cancellation_service`).
   - Okuma şekli: kuyruk satırında `location_id`, `location_name`, `viewed_at` yok — `packages/shared/src/index.ts:2322` `viewed_at` zorunlu; bu dal tek başına girerse Requests okuması kırılır. Dönemlerde `decision_revision`, `decision_pieces`, `time_source` yok (shared'da opsiyonel; `legacy_location` silinebilir). Durum `partially_approved`, olaylar `viewed`/`partially_approved`/`returned_to_pending`, bildirim `schedule.owner_time_off.shifts_opened` yok.
   - Grep kanıtı (`apps/ packages/ e2e/`, test dışı): silinen 16 fonksiyonu yalnız yukarıdaki iki API dosyası ve e2e spec çağırıyor; hepsi `.7` kod kısmının silme listesinde.
3. **nf-test için:** `e2e/flows/shift-hub-time-off.spec.ts:32` `tests.time_off(` → `tests.leave(` (aynı argümanlar); `:33` `resolve_schedule_time_off_request_service` → `decide_time_off_service(actor, w, rid, 'approve', note, expected_impact)` (owner tek başına; `expected_impact` = talebin `progress.impact.fingerprint`).

### Senin yerine verdiğim kararlar (teknik, §13)
1. `record_owner_time_off` da silindi (yalnız silinenleri çağırıyordu).
2. `period_version` kolonu düştü, dönem anlık görüntüsü zorunlu (2'den başka değer üreten tek yol silinen servisti; `location_id` gidince eski saat dilimi yolu çalışamaz).
3. Bildirim yükündeki `location_id(s)` kalktı (yeni talepler bugün de göndermiyordu).
4. Pano sayacı kuyrukla aynı kurala (kişi başına çekirdek sorusu).
5. Eski izin bildirimleri (outbox) silinmedi; yalnız izin tabloları.
6. `tests.time_off` → `tests.leave` birleşti; eski fikstürler için `tests.approved_leave`.
