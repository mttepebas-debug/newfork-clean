# Eski müsaitlik sisteminin emekliye ayrılması — 5.3 çalışma notu (2026-09-24)

FOUNDATION-B 5.3'ün haritası. Yerel DB, main `848a800` üzerinde okundu (fonksiyon gövdeleri `pg_get_functiondef` ile). 5.3a (`20260924194855`) ve 5.3b (`20260924201226`) bittikten sonra 5.3c'nin silme listesi burada. Silmeden önce her maddeyi bugünkü repoyla yeniden doğrula.

## Yeni sistem (kalan)

- **Tablolar:** `employee_weekly_preferences` (çalışanın işaretleri), `manager_weekly_reminders` (yöneticinin gizli notu), `weekly_preference_*`.
- **Ortak kontrol:** `assess_weekly_shift_availability`. Kullananlar:
  - Schedule yazımı (`prepare_weekly_schedule_assignment`)
  - koruma tetikleyicisi (`guard_schedule_assignment_availability`)
  - Shift Hub adayları
  - yayın ön kontrolü (`weekly_schedule_publication_preflight`)
  - otomatik doldurma
  - varsayılan saat önizlemesi
- **Izgara okuması:** `app_private.schedule_week_availability()` (5.3a).
- **Ayar:** `workspace_scheduling_settings.conflict_rules->>'availability'` tek taşıyıcı: warn / confirm / block (5.3b). `availability_warning_policy` sütunu yalnız `sync_schedule_conflict_rules` ile tutulan bir kopya.
- **Dokunulmayacaklar** (yeni sisteme ait, adı `availability_*` olsa da):
  - `schedule_availability_overrides`, `schedule_published_shifts.availability_snapshot`
  - `availability_lock_workspace`, `availability_offset_segments`, `availability_ranges_json`, `availability_utc_offset`, `availability_calendar_mask` (izin kullanıyor), `availability_impact_assessment` (varsayılan saat önizlemesi)
  - `schedule_availability_{identity,override,prior_publication,read_projection,enrich_read}`, `schedule_prepare_availability_assignment`, `guard_schedule_availability_input_write`, `guard_schedule_availability_override_history`, `weekly_published_availability_visible`

## 5.3c — silinecekler (yalnız eski sisteme hizmet eden)

- **Tablolar (8):** `employee_schedule_availability_versions`, `availability_requests`, `availability_draft_impact_reviews`, `availability_publication_locks`, `availability_commands`, `availability_events`, `employee_availability_versions`, `schedule_service_classifications`.
- **Tipler:** `availability_capacity_result`, enum'lar `schedule_conflict_policy` ve `availability_enforcement`.
- **Eski denetleyici:** `assess_shift_availability`, `assess_shift_availability_core`, `assess_shift_availability_context`, `schedule_assess_availability_preview`, `availability_capacity_for_span`, `availability_pattern_capacity_for_span`, `availability_shift_type_rules`, `availability_rules_for_date`, `availability_version_for_calendar`, `availability_version_at_instant`, `availability_week_capacity`.
- **Eski talep/onay akışı** (API uçları zaten 410):
  - `availability_command_service`, `availability_activate`, `availability_change_narrows`, `availability_overlapping_temporary_versions`, `availability_emit`, `availability_notify`, `availability_validate_date_override_replacements`, `preview_availability_draft_impact_service`
  - `availability_requests_read_service`, `availability_calendar_comparison_service`, `availability_calendar_context`, `availability_read_before_calendar_service`, `availability_read_service`, `availability_calendar_read_service`
  - `employee_availability_context_service`, `get_employee_hub_availability_v2_service`
  - `save_employee_availability_service`, `save_employee_availability_v2_service`, `save_employee_hub_availability_service`, `save_onboarding_availability_v2_service`, `save_onboarding_availability_v3_service`
  - yardımcılar: `availability_actor_scope`, `availability_proposal_applies`, `availability_proposals_overlap`, `availability_resolve_date_overrides`, `availability_date_override_ranges`, `availability_impact_comparison`, `validate_availability_week`, `validate_availability_shift_types`
- **Yayın kilidi:**
  - tetikleyici `availability_publication_lock` ve `capture_availability_publication_lock`. Her yayında çalışıyor; tabloları silmeden ÖNCE düşür.
  - `availability_pending_publication` (`availability_requests` satır tipi döndürür), `availability_period_locked`, `availability_date_overrides_locked`, `availability_publication_preflight`, `schedule_availability_publication_preflight`
- **"Custom work":** `schedule_prepare_service_classification`, `schedule_service_classification`, tetikleyici `guard_schedule_service_classification_history`.
- **Eski tablolardaki tetikleyiciler:** `guard_availability_write`, `guard_availability_request`, `guard_availability_draft_impact_review`, `sync_onboarding_availability`.
- **Ayar tetikleyicileri:** `version_availability_policy`, `audit_scheduling_settings_change`. İkincisi `auth.uid()` olmadan hiç çalışmıyor; silinecek sütunları adıyla anıyor.
- **5.3a'nın yerine geçtikleri:** `get_schedule_read_model_availability_v2_service`, `weekly_schedule_location_projection`.
- **Satır tipi bağımlılığı:** `availability_activate`, `availability_emit`, `availability_notify` bir `availability_requests` satırı alır; `availability_pending_publication` SETOF döndürür. Bunlar DROP TABLE'dan önce düşer. CASCADE yok; açık liste ve `retired_objects_stay_gone`.
- **Sütunlar (`workspace_scheduling_settings`):** `availability_enforcement`, `availability_ownership`, `availability_approval`, `availability_initial_review`, `availability_notice_days`, `availability_policy_revision`, `conflict_policy`, `availability_warning_policy`.
- **İzin:** `schedule.availability.override` (katalogda 1 satır, yerelde 45 rol-izin). Yalnız ölü eski yayın kontrolü okuyor; Settings → Roles'ta satırı yok.
- **Bildirim:**
  - `availability.review_required` silinir: katalog, şablonlar ve `availability_lifecycle_v1/v2` üretici kayıtları.
  - `availability.status_changed` KALIR: yeni "Check your availability" bildirimi kullanıyor. Yeni üreticisi kayıtlı değil (5.5 notu).

## 5.3c — yamalanacaklar (kalıyor, eski dal çıkar)

- `get_employee_hub_service`: eski tablodan kurulan `availability` alanı. API zaten null'la eziyor (`employee-hub-service.ts:114`).
- `bulk_delete_schedule_edit_shifts_service`, `guard_schedule_assignment_availability` (13–16. satırlar), `revoke_removed_assignment_availability_override`: `schedule_service_classifications` iptalleri.
- `list_schedule_weekly_shifts_service` (dışa aktarma önizlemesi): eski tablodan uyarı alt sorguları. `schedule_availability_enrich_read` aynı uyarıyı yeni kontrolden hesaplıyor.
- `preview_schedule_publication_before_availability_review_service` (4 ve 6 argümanlı iki overload): eski `availability` bulgu dalı.
- `update_scheduling_settings_service`: altı eski sütunu yazmayı bırakır.
- `sync_schedule_conflict_rules`: `availability_warning_policy` ↔ `conflict_rules.availability` kopyası ve izin kontrolündeki sütun çıkar. Varsayılan birleştirme, 42501, revizyon artışı ve doğrulama kalır.
- `version_weekly_preference_settings`: revizyon demetinden `availability_warning_policy` çıkar.
- `weekly_preference_settings_read_service`, `weekly_preferences_read_service`, `weekly_preference_settings_save_service`: `warning_policy` artık `conflict_rules`'tan türetilir ya da çıkar.

## 5.3c — uygulama

- **Bütün dosya silinir:**
  - shared: `availability-lifecycle.ts`, `availability-calendar.ts`, testleri `availability-request-replacements`, `availability-date-overrides`, `availability-shift-types`
  - API: `apps/api/src/availability/availability-retirement.ts` ve kullandığı 410 uçları (`availability-routes.ts` içindeki beş eski uç ve üç `/v1/me/onboarding/availability-lifecycle*` ucu), `PUT …/employee-hub/availability`, `PUT /v1/me/onboarding/availability`
  - web: `apps/web/src/schedule/availabilityIndicators.ts` ve testi
- **`availability-routes.ts` yalnız eski değil:** haftalık tercih uçları ve `POST …/availability/shift-assessment` kalır. Add/Edit shift penceresindeki "Checking availability…" ve sürükle-bırak incelemesi bunu kullanır.
- **Karışık dosyalar:**
  - shared `availability.ts`: yalnız `getShiftTimeBasis`, `shiftTimeBasisSchema`, `shiftTimeSnapshotSchema` kalır.
  - shared `index.ts`: çalışanın `availability` / `availability_versions` alanları, eski gün şemaları, eski ayar alanları, `schedule.availability.override`, `service_classification_*`.
  - `availability-assessment.ts`, `employee-hub.ts`, `weekly-preferences.ts` (`warning_policy`), `role-permissions.ts`, `notification-catalog.ts` ve `notification-display.ts`.
  - API: `organization-settings-service.ts:78`, `employee-hub-service.ts:114`.
  - web `ShiftQuickEditor.tsx`: "Service classification" / custom work bloğu ve ölü `requiresReason` dalı. Sahte testi `ShiftQuickEditor.test.tsx:251-272`.
  - web `ScheduleConflictSheet.tsx`: "Override reason" alanı. Ayrıca `useScheduleDropReview.ts` (`needsReason`), `DefaultHoursReviewDialog.tsx:113`.
  - web: `useCellState.ts`, `schedule-conflicts.ts` ve `ScheduleEmployeeCard.tsx` içindeki eski dallar, `SchedulingSettingsPage.tsx:19-29`, `WeeklyPreferencesForm.preview.tsx`.

## 5.3c — pgTAP

- **Silinecek eski-model dosyaları:**
  - yeşil listede: `availability_authoritative_assessment`, `availability_calendar_comparison`, `availability_complement_ranges`, `availability_date_overrides`, `availability_manager_request_queue`, `availability_publication_lock`, `shift_exchange_availability_adapter`
  - kırmızı: `availability_draft_impact_review`, `availability_review_lifecycle`, `availability_shift_type_restrictions`, `schedule_custom_service_classification`
- **Önce taşınıp sonra silinecekler (ikisi de kırmızı):**
  - `schedule_availability_enforcement`: #4–6 Sert engeller, #40–41 Sert'e geçiş ve bayat kontrol, #49 ve #51 yayınlanmış sorumluluk. Hepsi `bl064_conflict_severity`'ye, `conflict_rules.availability` ve `employee_weekly_preferences` ile.
  - `availability_read_model_consistency`: #13–21 ve #26–29 yeni okuma testlerinin yanına. #18 `assess_weekly_shift_availability` ile kıyaslanır.
- **Düzenlenecek yeşil dosyalar:**
  - `authorization_coverage`: 15 `exempt:retiring-availability` satırı, sınıf ve `<=15` sınırı.
  - `bl064_conflict_severity`, `weekly_preference_settings` (`warning_policy`).
  - Eski sütunlara yazanlar: `weekly_assignment_candidates`, `weekly_exchange_acceptance`, `weekly_schedule_acceptance`, `weekly_schedule_integration`, `weekly_shift_availability_assessment`.
  - Eski "taban" sürüm satırı ekleyenler: `shift_exchanges_v1`, `shift_exchange_{immediate_inbox,range_read,requested_publication,travel_policy}`, `employee_termination_offboarding`, `jobs_department_bulk_assignments`, `time_off_physical_request_counts`, `schedule_read_model_rls`.
  - Eski nesneyi adıyla anan: `the_schedule_uses_the_preferred_name`, `weekly_preferences_commands`.
  - `time_off_cancellation_requests`, `time_off_requested_periods`: `assess_shift_availability` → `assess_weekly_shift_availability`.
- **Seed:** `seed.sql` 325–331 (Alex'in Cuma'sı) `employee_weekly_preferences`'a taşınır; 340–345 taban satırları silinir.
- **Yerel fixture:** `meyhouse.sql` 474 eski sütunları anıyor. Düzeltilir ve önceden yedeklenir.

## Ölçümler (yerel, 2026-09-24)

- **Eski tablolar:** `availability_publication_locks` 10 satır (her yayında tetikleyici yazıyor), `employee_schedule_availability_versions` 3 satır (seed). Diğerleri 0.
- **Yeni tablolar:** 0 tercih, 7 tip varsayılanı, 1 override.
- **Izgara:** 35 çalışan × 4 lokasyon, işaretler dolu.
  - 5.3a öncesi yeni-sistem okuması: 333 ms.
  - 5.3a'nın küme tabanlı okuması: ısınmış 19–28 ms.
