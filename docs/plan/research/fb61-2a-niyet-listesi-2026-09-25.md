# FB-6.1 `.2a` — yardımcı çağıranların niyet listesi (2026-09-25)

Yazan: `nf-planlama`. Görev: `docs/plan/tasks/FB-6.1.md` satır `FB-6.1.2a`. Girdi: `fb61-dis-degerlendirme-2026-09-25.md` bölüm E, `REUSE.md` → M2 (`:37`) ve "Taslak ve lokasyon" (`:52-58`), `:44`.

**Ölçüm:** `origin/main` b416c89, yerel DB son migration `20260925014408` (= main'in son migration'ı), yalnız SELECT. `pg_proc.prosrc` yorum ve metin sabitlerinden arındırıldı, iç içe parantez sayılarak argümanlar ayrıldı (E ile aynı yöntem). Kanıt sütunundaki `oid Lnn` = o fonksiyonun `prosrc`'unda satır nn; dosya = fonksiyonu son tanımlayan migration (`git grep`, en yeni zaman damgası).

**Sayılar E ile uyuşuyor:** 58 ad / 60 oid / 101 çağrı (25 `can_manage` + 8 `can_publish` + 68 `has_capability`); ada göre 16 yalnız-null + 14 karışık + 28 yalnız gerçek lokasyon; oid'e göre 17 + 14 + 29. Yalnız-null 17 oid'in çağrısı 18. 28 fonksiyonun çağrısı **42** (12 Schedule servisi 14 + katlanacak 6 ad/7 oid 10 + izin 6 + takas 12).
**E'den tek fark:** E "~11 Schedule servisi, 6 takas" diyordu; ad ad sayınca **12 Schedule servisi, 5 takas**. E'nin adlı listesi yok (kayıp), farkı hangi fonksiyonun yarattığı doğrulanamadı; bu dosyadaki ad listesi geçerlidir. Muhtemel neden: adında `exchange` geçen iki Schedule katmanı (`save_…_exchange_base`, `preview_schedule_unpublication_exchange_base`) ya da karışık gruptaki `shift_exchanges_read_service`.

## 0. Çeviri kuralları (her satırda kullanılan)

Yardımcı → eylem (`app_private.authz_actions`, M2 = `authz_settings`):

| Yardımcı / izin | Eylem | Kapsam sınıfı | M2'de manager |
|---|---|---|---|
| `can_manage`, `has_capability('schedule.manage')` | `schedule.edit` | set | hedefin hepsi kendi lokasyonunda |
| `can_publish`, `has_capability('schedule.publish')` | `schedule.publish` | place (tek lokasyon) | kendi lokasyonu |
| `has_capability('schedule.export')` | `schedule.export` | set | hepsi kendi lokasyonunda |
| `has_capability('schedule.templates.manage')` | `schedule.templates` | set | hepsi kendi lokasyonunda |
| `has_capability('schedule.read')` | `schedule.read` | place | kendi lokasyonu |
| `has_capability('schedule.time_off_requests.manage' / '.read')` | `time_off.decide` / `requests.read` | place / set | — |
| `has_capability('schedule.shift_change_requests.manage' / '.read')` | `exchange.approve` / `exchange.read` | place | — |
| `has_capability('settings.schedule_rules.manage')` | `settings.scheduling.write` | org | yok (REUSE:44) |
| `has_capability('schedule.conflict_rules.manage')` | **eylem yok** — yeni satır gerekir (bkz. N3) | org | yok |

Kalıplar:
- **K-hedef** — tek hedef: `perform app_private.authorize(actor, w, '<eylem>', target_locations => array[<lok>])`. Dizi hedef: `target_locations => <dizi>`.
- **K-süzgeç** — okuma: `<lok> = any (app_private.scope_set(actor, w, '<eylem>'))`; dizi kolonda `<dizi> && scope_set(...)` (kesişim) ya da `<dizi> <@ scope_set(...)` (hepsi).
- **K-bir-yerde** — lokasyonsuz nesne ("her yer" niyeti): `perform app_private.authorize(actor, w, '<eylem>', target_locations => app_private.scope_set(actor, w, '<eylem>'))`. Sonuç: owner/admin geçer; en az bir kapsamlı lokasyonu olan manager geçer; kapsamı boş manager `authz.out_of_scope`; employee `authz.missing_permission`; üye değil `authz.not_member`. Yalnız **set** sınıfı eylemlerde çalışır (place sınıfı tek lokasyon ister). Çekirdekte bugün bu kalıbı kullanan fonksiyon yok (`app_private.authorize(` çağıran tek public fonksiyon `initiate_workspace_ownership_transfer_service`); `.2` ilk kullanım olur, `nf-guvenlik` kalıbı onaylamalı.
- **K-kayıtlı-kişi** — çağıran değil, kayıttaki kişi soruluyor (tetikleyici, bildirim alıcısı): `app_private.authz_reason(<kişi>, w, '<eylem>', array[<lok>]) is null` (hata fırlatmayan biçim; `authorize()` bunun sarmalayıcısı, `authz_check` gövdesi).

Önemli çekirdek davranışı (`app_private.authz_check`): set/place eyleminde `target_locations` **null ise herkes için** `out_of_scope`; `'{}'` ise owner/admin geçer, manager `out_of_scope`; silinmiş (`deleted_at`) ya da başka workspace'in lokasyonu **owner/admin için de** `out_of_scope`.

## 1. Yalnız `null` / argümansız geçen 16 fonksiyon (17 oid)

Niyet: **HER YER** = lokasyonsuz ya da workspace çapında nesne, doğru davranış lokasyon sormadan (org ya da "bir yerde yetkisi var"); **UNUTULMUŞ** = nesnenin lokasyonu var, hedeften okunmalıydı; bugün manager kapsamı dışındaki lokasyonlara da dokunabiliyor (sessiz yetki genişlemesi).

| # | Fonksiyon (oid) | Çağrı | Niyet | Kanıt (dosya:satır / prosrc) | Çekirdek karşılığı (eylem + hedef) ve M2'ye göre doğru davranış | Adım |
|---|---|---|---|---|---|---|
| 1 | `create_schedule_export_preset_service` (20459) | `has_capability(…,'schedule.export')` | HER YER | 20459 L4; `schedule_export_presets` kişisel (`created_by`), `settings`'te lokasyon yok (`packages/shared/src/index.ts` `scheduleExportSettingsSchema` — lokasyon alanı yok; lokasyon yalnız dışa aktarma isteğinde, `schedule-export-v2.ts:20`). Migration `20260819150000_schedule_templates_autofill_export.sql` | `schedule.export`, K-bir-yerde. Kapsamı olan manager kendi ön ayarını yazar | `.2` |
| 2 | `list_schedule_export_presets_service` (20458) | aynı | HER YER | 20458 L4; `where p.created_by = actor_user_id` | `schedule.export`, K-bir-yerde. Davranış değişir: izni yoksa bugün boş liste, sonra 42501 (hayır sözleşmesi) | `.2` |
| 3 | `update_schedule_export_preset_service` (21828) | aynı | HER YER | 21828 L5; `created_by = actor_user_id`. `20260907100000_schedule_export_preset_update.sql` | `schedule.export`, K-bir-yerde | `.2` |
| 4 | `create_schedule_export_schedule_service` (21876) | aynı | **UNUTULMUŞ** | 21876 L6 kapı; aynı gövde `target_payload->'location_ids'`'i **kontrolsüz** `scheduled_schedule_exports.location_ids`'e yazıyor (kolon `cardinality 1..100`, `scheduled_schedule_exports_locations_check`). `20260907102000_schedule_export_schedules.sql` | `schedule.export`, K-hedef `target_locations => payload location_ids`. REUSE:58 (dışa aktarılan ⊆ `scope_set`). Bugün Ayşe Beşiktaş'ı haftalık e-postaya koyabiliyor | `.4` (Q3 dışa aktarma dizisi, FB-6.1:120) |
| 5 | `update_schedule_export_schedule_service` (21877) | aynı | **UNUTULMUŞ** | 21877 L9; `location_ids = case when payload ? 'location_ids' … else existing.location_ids` | `schedule.export`, K-hedef, hedef = güncellemeden **sonraki** dizi (yeni verilmişse yeni, yoksa mevcut). Kapsamı daralan manager kaydını ancak kapsam dışı lokasyonu çıkararak düzenler | `.4` (Q3) |
| 6 | `delete_schedule_export_schedule_service` (21878) | aynı | HER YER (kendi kaydı) | 21878 L3; `created_by = actor_user_id` | `schedule.export`, K-bir-yerde + kendi kaydı. Lokasyon sorulmaz: kendi zamanlanmış gönderimini silmek kapsamı daraltır. Q-A cevabına bağlı değil | `.2` |
| 7 | `list_schedule_export_schedules_service` (21875) | aynı | **UNUTULMUŞ** (okuma) | 21875 L17; süzgeç yalnız `workspace_id` — `created_by` yok: bütün workspace'in zamanlanmış gönderimleri (alıcı e-postaları, lokasyonları) her `schedule.export` sahibine görünüyor | `schedule.export`, K-bir-yerde kapı + K-süzgeç. Hangi süzgeç: **soru Q-A** (öneri `location_ids <@ scope_set`) | `.2` (Q-A cevabından sonra) |
| 8 | `list_schedule_export_events_service` (21905) | aynı | **UNUTULMUŞ** (okuma) | 21905 L13; workspace'in son 10 dışa aktarması, herkesinki; `params.location_ids` API'de her zaman yazılıyor (`apps/api/src/schedule/schedule-routes.ts:1246-1256`, `:2455-2465`) | `schedule.export`, K-bir-yerde kapı + K-süzgeç `params->'location_ids'` üzerinden. **Soru Q-A** | `.2` (Q-A'dan sonra) |
| 9 | `record_schedule_export_event_service` (21906) | aynı | **UNUTULMUŞ** | 21906 L5; çağıran route'lar `params.location_ids`'i geçiyor (`schedule-routes.ts:1246`, `:2455`), önce `preview_schedule_export_service` lokasyonla sormuş | `schedule.export`, K-hedef `target_locations => params location_ids` (derinlik savunması; önizlemeyle aynı dizi) | `.4` (Q3) |
| 10 | `delete_schedule_draft_service` (21829) | `can_manage(actor, w)` | **UNUTULMUŞ** | 21829 L5; `schedule_drafts.location_ids` var ve dolu (12 taslağın 0'ı boş; yazan tek yol oturumdan kopya, `schedule_edit_sessions_location_ids_check` > 0). `20260907230150_schedule_draft_archive_preserves_publication.sql` | `schedule.edit`, K-hedef `target_locations => draft.location_ids` (B3: hepsi kapsamda, admin/owner siler). Bilinmeyen taslak bugün P0002; CLAUDE.md §9 "bilinmeyen = kapsam dışı" → `authz.out_of_scope` (N2) | `.4` (B3, FB-6.1:120) |
| 11 | `list_schedule_drafts_service` (20192) | `can_manage(actor, w)` | **UNUTULMUŞ** (okuma) | 20192 L3; süzgeç yalnız `workspace_id + week_start`: Ayşe yalnız-Beşiktaş taslaklarını da görüyor. `20260818220000_schedule_edit_sessions.sql` | `schedule.edit`, K-bir-yerde kapı + K-süzgeç `draft.location_ids && scope_set(…,'schedule.edit')` (kesişim). Kaynak B1: Ayşe T'yi (Kadıköy+Beşiktaş) açıp Kadıköy'ü görür → T listede olmalı; yalnız-Beşiktaş taslak görünmez | `.2` |
| 12 | `preview_schedule_auto_fill_service` (20453) | `can_manage(actor, w)` | **UNUTULMUŞ** | 20453 L6; oturum sahibi kontrolü var, lokasyon yok; döngü oturumun bütün açık vardiyalarında. Oturumun lokasyonları alınırken zaten kapsamla kesişiyor (`acquire_schedule_edit_session_service_past_week_base` 1198260 L17-26: `effective = requested ∩ manageable`) | `schedule.edit`, K-hedef `target_locations => target_session.location_ids` + mevcut sahip kontrolü. B1 ile uyumlu (oturum zaten yalnız kendi lokasyonları) | `.2` |
| 13 | `rename_schedule_template_service` (20449) | `has_capability(…,'schedule.templates.manage')` | **UNUTULMUŞ** | 20449 L4; `schedule_templates`'te lokasyon yok, `schedule_template_shifts.location_id` var. `20260819150000_…autofill_export.sql` | `schedule.templates`, K-hedef `target_locations => array(select distinct location_id from schedule_template_shifts where template_id = …)` (K-2). Boş template yaratılamıyor (`create_…_label_base` 20448 L8: kaynak boşsa 22023) | `.4` (K-2, FB-6.1:120) |
| 14 | `delete_schedule_template_service` (20450) | aynı | **UNUTULMUŞ** | 20450 L4; aynı | aynı (K-2). Bilinmeyen template bugün 40001 "stale" → `authz.out_of_scope` (N2) | `.4` (K-2) |
| 15 | `schedule_draft_has_hard_document_conflicts_service` (23449) | `has_capability(…,'schedule.publish')` | **UNUTULMUŞ** | 23449 L7; `target_location_ids` parametresi var ve sorguda kullanılıyor, kapıda kullanılmıyor. Tek çağıran `publish_schedule_draft_exchange_base` (yayın zinciri). Kapsam testinde `exempt:predicate` (`authorization_coverage.test.sql:223`). `20260908195000_…hard_enforcement.sql` | `schedule.publish`, K-süzgeç `normalized_locations <@ scope_set(…,'schedule.publish')` değilse `authz.out_of_scope` (place sınıfı tek lokasyon ister, dizi için kapsam kümesi). `.4` yayın katlamasında içeri alınabilir | `.2` |
| 16 | `update_scheduling_settings_service` (24601) | iki çağrı: `'schedule.conflict_rules.manage'` (L6), `'settings.schedule_rules.manage'` (L9) | HER YER (org) | 24601 L6, L9; tek satırlık `workspace_scheduling_settings` (workspace çapı). REUSE:44 "Manager tipi rollere organizasyon ayarı yazma izni verilemez". `20260924204854_old_availability_is_gone.sql` | Çakışma dışı anahtarlar: `settings.scheduling.write` (org; matriste var, `authorization_matrix.test.sql:241`). Çakışma anahtarları: **yeni eylem** (N3). Davranış değişir: bu izinleri tutan manager tipi özel rol artık yazamaz (REUSE:44'ün uygulanması) | `.2` |
| 17 | `list_schedule_draft_document_conflicts_service` **4 argümanlı overload** (23251) | `has_capability(…,'schedule.manage')` | **UNUTULMUŞ + ölü ikiz** | 23251 L7; lokasyon parametresi yok, taslağın bütün vardiyalarını okuyor. API yalnız 7 argümanlıyı çağırıyor (`apps/api/src/schedule/schedule-service.ts:1364-1372`, `target_location_ids` geçiyor); 4 argümanlıyı yalnız test çağırıyor (`supabase/tests/schedule_publication.test.sql:85,94,98,104`). Ada göre "karışık" sayılır (7 argümanlı 23456 hem null hem lokasyon geçiyor), oid'e göre 17. yalnız-null | Taşınmaz, **silinir** (CLAUDE.md §9 ikiz sistem yok); testler 7 argümanlıya geçer; `retired_objects_stay_gone`'a eklenir. 7 argümanlı (23456) karışık grupta düz taşınır | `.2` |

**Özet:** 17 oid'in 5'i HER YER (1, 2, 3, 6, 16), 12'si UNUTULMUŞ (4, 5, 7–15, 17). Unutulmuşların hepsi bugün sessiz yetki genişlemesi: manager kapsamı dışındaki lokasyonun taslağını siler/listeler, template'ini siler/adlandırır, zamanlanmış gönderimine lokasyon ekler, başkalarının dışa aktarma kayıtlarını görür.

## 2. Yalnız gerçek lokasyon geçen 28 fonksiyon (29 oid, 42 çağrı)

K-1: izin (5) ve takas (5) FB-6.1'de taşınmaz. Katlama listesi FB-6.1.md:30-35.

### 2a. Schedule servisleri — `.2`'de taşınır (12 ad, 14 çağrı)

| Fonksiyon (oid) | Çağrı (prosrc satırı) | Kanıt | Çekirdek karşılığı |
|---|---|---|---|
| `add_schedule_pending_op_service` (21928) | L50 `can_manage(next_location_id)` kapı | `20260909003001_schedule_time_source_snapshots.sql`; `next_location_id = coalesce(payload, existing_shift)` | `schedule.edit`, K-hedef `array[next_location_id]` (düz çeviri; eski lokasyon bugün de sorulmuyor, N5) |
| `assess_weekly_schedule_assignment_service` (24830) | L5 `can_manage(loc)` kapı | `20260909042100_weekly_schedule_acceptance.sql` | `schedule.edit`, K-hedef |
| `bulk_delete_schedule_edit_shifts_service` (21922) | L40 `can_manage(shift.location_id)` süzgeç | `20260924204854_old_availability_is_gone.sql` | `schedule.edit`, K-süzgeç |
| `get_schedule_publication_history_service` (20306) | L24 `can_publish(publication.location_id)` süzgeç | `20260819010000_schedule_publication.sql` | `schedule.publish`, K-süzgeç |
| `guard_schedule_assignment_availability` (24210, tetikleyici `zz_availability_assignment` ×3 tablo) | L54 `can_publish(o.actor_user_id, …, new.location_id)` — kayıttaki kişi | `20260924204854_…` | `schedule.publish`, K-kayıtlı-kişi |
| `list_schedule_pending_ops_service` (21927) | L35 `can_manage(shift.location_id)` süzgeç | `20260907108000_…aliases.sql` | `schedule.edit`, K-süzgeç |
| `prepare_weekly_schedule_assignment` (24829) | L7 `can_manage(loc)` kapı | `20260909042100_…` | `schedule.edit`, K-hedef |
| `preview_schedule_default_hours_service` (24572) | L23 kapı, L48 boolean (`can_override`) | `20260924204854_…` | `schedule.edit`: L23 K-hedef (seçilen vardiyaların lokasyon dizisi), L48 K-süzgeç |
| `remove_schedule_pending_op_service` (21930) | L25 `can_manage(target_shift.location_id)` kapı | `20260907108000_…` | `schedule.edit`, K-hedef |
| `schedule_availability_read_projection` (24259) | L5 `can_manage` **veya** L6 `can_publish`, boolean | `20260909042300_weekly_schedule_integration.sql` | `loc = any(scope_set(…,'schedule.edit')) or loc = any(scope_set(…,'schedule.publish'))` |
| `takeover_schedule_edit_session_service` (21913) | L18 `can_manage` her oturum lokasyonu için | `20260923123347_…one_location_week.sql` | `schedule.edit`, K-hedef `target_locations => target_session.location_ids` |
| `weekly_schedule_publication_preflight` (24835) | L17 `can_publish(s.location_id)` döngüde kapı | `20260922140000_…` ; çağıran `preview_schedule_publication_service` (katlanacak) | `schedule.publish`, K-hedef (her vardiya lokasyonu için tek tek; place sınıfı) |

### 2b. Katlama zincirinde — `.4`'te katlanırken taşınır (6 ad / 7 oid, 10 çağrı)

| Fonksiyon (oid) | Çağrı | Zincir (FB-6.1.md) | Çekirdek karşılığı |
|---|---|---|---|
| `acquire_schedule_edit_session_service_past_week_base` (1198260) | L22 `can_manage(location.id)` süzgeç | :35 | `manageable := scope_set(…,'schedule.edit')` |
| `mutate_schedule_edit_shift_service_base` (20196) | L54 kapı, L92, L101 süzgeç | :31 düzenleme `base` | `schedule.edit`, K-hedef / K-süzgeç |
| `mutate_schedule_edit_shift_service_label_base` (21758) | L72 süzgeç | :31 `label` | `schedule.edit`, K-süzgeç |
| `preview_schedule_publication_before_availability_review_service` (20304, 21667) | L41 / L43 kapı | :35 (2 overload) | `schedule.publish`, K-hedef (lokasyon başına) |
| `preview_schedule_unpublication_exchange_base` (20309) | L14 her lokasyon için kapı | :35 | `schedule.publish`, K-süzgeç `normalized_locations <@ scope_set` |
| `save_schedule_edit_session_service_exchange_base` (21977) | L51, L88 süzgeç | :32 kaydetme `exchange` | `schedule.edit`, K-süzgeç (B2 davranışı FB-6.1b'de) |

### 2c. İzin — FB-6.3 (5 ad, 6 çağrı; FB-6.1'de dokunulmaz)

`apply_time_off_period_decision` (20877, L9 `time_off_requests.manage`, `r.location_id`) · `decide_time_off_with_assignments_service` (24373, L8, aynı) · `mark_schedule_time_off_viewed_service` (20876, L6 `time_off_requests.read`) · `preview_time_off_assignment_decision_service` (24342, L6 `time_off_requests.manage` + L13 `can_publish`) · `time_off_event_released_assignments` (24376, L7 `schedule.read`). Karşılıklar: `time_off.decide`, `requests.read`, `schedule.publish`, `schedule.read`. Not: kapsam testi `mark_schedule_time_off_viewed_service`'i `time_off.decide` sayıyor (`authorization_coverage.test.sql:136`) ama gövde `.read` iznine bakıyor — FB-6.3'te karar.

### 2d. Takas — FB-6.4 (5 ad, 12 çağrı; FB-6.1'de dokunulmaz)

`shift_exchange_emit_notification_base` (23897, L35 ×2, alıcı `m.user_id` — K-kayıtlı-kişi) · `shift_exchange_notification_allowed` (24153, L18-19, alıcı `recipient`) · `shift_exchange_preview` (23892, L9, L28, L30) · `shift_exchange_schedule_recovery_service` (24127, L10, L31 `can_manage`; kapsam testi `schedule.edit` sayıyor, `:237`) · `shift_exchanges_command_service` (23899, L74, L75, L125). Karşılık: `exchange.approve` (+ recovery için `schedule.edit`).

**Done when 4'ün kesin değeri:** FB-6.1 sonunda üç yardımcıyı çağıran **10 fonksiyon** kalır (2c + 2d), hepsi gerçek lokasyonlu. Plan "≤11" diyordu.

## 3. `.2`'nin kesin listesi

| Grup | Ad | oid | Nereden |
|---|---|---|---|
| Yalnız-null, `.2` | 10 + 4 argümanlı overload'un silinmesi | 11 | Bölüm 1, adım `.2` satırları (#1, 2, 3, 6, 7, 8, 11, 12, 15, 16, 17) |
| Yalnız gerçek lokasyon, Schedule | 12 | 12 | 2a |
| Karışık (T2: "her yer", düz taşıma) | 12 | 12 | aşağıda |
| **Toplam `.2`** | **34 ad** | **35 oid** | |

Karışık 14'ün 12'si `.2`'de: `apply_schedule_template_service`, `create_schedule_shifts_batch_service`, `get_schedule_publication_status_service`, `get_schedule_requests_service`, `get_schedule_template_service`, `list_schedule_draft_availability_conflicts_service`, `list_schedule_draft_document_conflicts_service` (7 arg, 23456), `list_schedule_templates_service`, `preview_schedule_export_service`, `shift_exchanges_read_service`, `weekly_preference_manager_scope`, `weekly_team_read_service`. Kalan 2'si (`apply_/create_schedule_template_service_label_base`) `.4` katlamasında.
`.4`'e düşen: yalnız-null 6 (#4, 5, 9, 10, 13, 14 — kural B3 / K-2 / Q3 plan gereği `.4`'te) + 2b'nin 6 adı + 2 karışık = **14 ad / 15 oid**. Kontrol: 34 + 14 + 10 (FB-6.3/6.4) = 58 ad; 35 + 15 + 10 = 60 oid.

Bu dosya karışık 14'ün niyetini tek tek okumadı (görev kapsamı 16 + 28; T2 "her yer, düz taşıma" diyor). Gözlem olarak N4'e bakın.

## 4. `nf-db` için notlar (ürün kuralı değil, uygulama tuzakları)

- **N1 — "her yer" null'u çekirdekte null olamaz.** `authz_check` set/place eyleminde null hedefi herkese reddediyor; düz `target_locations => null` çevirisi owner'ı da kilitler. Lokasyonsuz nesneler K-bir-yerde ile, workspace ayarı org eylemiyle çevrilir.
- **N2 — "bilinmeyen = kapsam dışı".** #10, #13, #14 bugün bilinmeyen hedefte P0002 / 40001 veriyor; CLAUDE.md §9'a göre `authz.out_of_scope`. Revision çatışması (40001) nesne bulunduktan sonra ayrı kalır. API eşlemesi `.3`'te.
- **N3 — çakışma kuralları için eylem yok.** `schedule.conflict_rules.manage` izninin `authz_actions`'ta karşılığı yok. Öneri: yeni satır (ör. `settings.conflict_rules.write`, org, write, izin `schedule.conflict_rules.manage`) + matris hücresi, sonra #16. Tek eyleme (`settings.scheduling.write`) katlamak bugünkü ayrı izni sessizce düşürür.
- **N4 — karışık grupta alan dışı fonksiyonlar.** `shift_exchanges_read_service` (takas), `get_schedule_requests_service` (izin/talep), `weekly_team_read_service` ve `weekly_preference_manager_scope` (müsaitlik; `availability.read` → `availability.team_read`, **person** sınıfı, lokasyonla değil kişiyle sorulur) K-1 gereği FB-6.1'de taşınıyor ama FB-6.3/6.4'ün dosyaları. Ayrıca `list_schedule_templates_service` / `get_schedule_template_service` `schedule.templates.read` iznine bakıyor; bu izinle bağlı eylem yok (`schedule.templates` = `.manage`). Düz taşımada eylem seçimi `nf-db` + `nf-guvenlik` kararı.
- **N5 — `add_schedule_pending_op_service` vardiyayı başka lokasyona taşırken yalnız yeni lokasyonu soruyor.** Oturum lokasyonları kapsamla kesiştiği için bugün açık değil; düz çeviride aynen kalır.
- **N6 — iki "lokasyon silindi" kolonu.** Çekirdek `locations.deleted_at`'e (`authz_check`, `scope_set`), Schedule `locations.archived_at`'e bakıyor (`acquire_…_past_week_base` 1198260 L21). Yerelde ikisi de 0 satır, farkı bugün görünmez; `scope_set`'e geçen fonksiyonlar arşivli lokasyonu kapsamda sayar. BACKLOG adayı.
- **N7 — kapsam testi eşlemeleri gövdeyle uyuşmuyor.** `list_schedule_drafts_service` ve `list_schedule_draft_document_conflicts_service` `schedule.read` sayılıyor (`authorization_coverage.test.sql:121-122`), gövde `schedule.manage` / `schedule.publish` soruyor. Öneri: `schedule.edit` / `schedule.publish`. `.11`'de düzeltilir.
- **N8 — REUSE'daki eylem adı.** B3 (`REUSE.md:56`) `scope_set(actor, w, 'schedule.manage')` yazıyor; eylem anahtarı `schedule.edit` (`schedule.manage` izin adı). Anlam aynı; `nf-db` eylem anahtarını kullanır.
- **Sayaçlar (Done when 2):** bu 44 fonksiyonun hiçbiri `auth.uid()`, `request.jwt.claim` ya da kendi kapsam/rütbe mantığı desenine uymuyor (`authz_catalog.test.sql:19,26,34` desenleriyle tarandı). `.2` bu üç sayacı düşürmez; `_base` sayacı `.4`'te düşer (2b'nin 5'i + `apply_/create_…_label_base`).

## 5. Kullanıcıya gidecek sorular

**Q-A — Başkalarının dışa aktarma kayıtlarını kim görür?** (#7 `list_schedule_export_schedules_service`, #8 `list_schedule_export_events_service`)
Bugün `schedule.export` izni olan her manager workspace'in **bütün** zamanlanmış gönderimlerini (alıcı e-postaları, lokasyonlar) ve son 10 dışa aktarmayı görüyor. Örnek: admin her pazartesi Kadıköy + Beşiktaş planını muhasebeye gönderiyor; yalnız Kadıköy müdürü Ayşe bu kaydı ve alıcıları görüyor. REUSE bunu söylemiyor (M2 dışa aktarmayı kısıtlıyor, dışa aktarma kaydının görünürlüğünü değil).
- **(1, öneri) Kaydın bütün lokasyonları kendi kapsamındaysa görür** (`location_ids <@ scope_set`). B3 ile aynı mantık; Ayşe kendi Kadıköy gönderimlerini ve başkasının yalnız-Kadıköy gönderimini görür, admin'in iki lokasyonlu kaydını görmez.
- (2) Yalnız kendi oluşturduğunu görür (ön ayarlar gibi). En sıkı; iki manager aynı lokasyonun gönderimini birbirinden habersiz kurabilir.
- (3) Lokasyonlarından biri kendi kapsamındaysa görür (`&&`). Ayşe admin'in Beşiktaş'ı da içeren kaydını ve alıcılarını görür.
Etki: yalnız bu iki okuma; düzenleme ve silme zaten kendi kaydıyla sınırlı. Cevap gelene kadar `.2` bu iki fonksiyon dışında ilerler.

**Q-B — Silinmiş lokasyonu içeren taslak ya da template'i kim silebilir?** (#10, #13, #14)
Çekirdek silinmiş lokasyonu owner/admin için de "kapsam dışı" sayar. B3 "admin/owner siler" diyor; düz uygulamada lokasyonu sonradan silinmiş bir taslağı **hiç kimse** silemez. Bugün yerelde silinmiş lokasyon yok.
- **(1, öneri) Silinmiş lokasyonlar hedeften düşülür, kalanlara B3 uygulanır.** Ayşe, taslağın canlı lokasyonlarının hepsi kendisindeyse siler; admin her zaman siler.
- (2) Silinmiş lokasyon içeren taslağı yalnız admin/owner siler. B3'e daha sadık; admin yolu çekirdeğin kuralını atlamak için ayrı kod ister.
Etki: yalnız bu üç silme/adlandırma; lokasyon silme akışı gelene kadar görünmez.

Diğer 15 oid'in niyeti REUSE (M2 `:37`, `:44`, B1, B3, K-2, `:58`) ve koddan çıkarıldı; ürün kuralı tahmini yok.
