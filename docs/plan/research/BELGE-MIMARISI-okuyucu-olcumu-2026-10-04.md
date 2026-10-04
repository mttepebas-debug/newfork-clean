# Belge mimarisi — Schedule'ın belge uyarısını okuyanlar (nf-db ölçümü, rafta)

Kaynak: nf-db oturumu `local_abc4d126…` kapanış raporu (posta kutusu `20261004T091955-nf-db-fb-6-6-fb-6-6-a1-kapanis.md`, 2026-10-04). Belge mimarisi rafta; raftan inince bu ölçüm yeniden yapılır (CLAUDE.md §5 adım 0).

**Yapı (FB-6.6-schedule ölçümü, 2026-10-03, main `84ada590`):**
- Schedule'daki "belge eksik / onay bekliyor / reddedildi" nedenini `app_private.document_shift_reasons` üretiyor. Fonksiyon kimin baktığını bilmiyor (okuyucu parametresi yok).
- Tek çağıranı `assess_weekly_shift_availability(w, emp, shift)`; onu 11 iç fonksiyon (tetikleyici `guard_schedule_assignment_availability` dahil) ve 16 public servis kullanıyordu.
- Uyarılar saklanmıyor, ama onlardan parmak izi üretiliyor: önizleme → yayın karşılaştırması ve kayıtlı `weekly_preference_commitment_decisions.conflict_fingerprint`. Okuyucuya göre değişen metin, iki müdürün aynı taslağa farklı parmak izi üretmesi demek.

**Bugünkü erişim, yeniden ölçüm (2026-10-04, yerel DB, FB-6.6'nın dört migration'ı uygulanmış):**
`pg_proc` gövdelerinde ad eşleşmesiyle geçişli çağıran zinciri (metin araması; aynı adlı overload'lar birleşik):
- 4 `app_private`: important_date_close_shifts, time_off_finalize, time_off_release_shifts, time_off_sweep.
- 52 `public` fonksiyon. Bunların 28'i `*_service`. "16" yalnız Schedule'ın doğrudan zinciriydi. Geçişli zincir şu alanları da kapsıyor: izin (submit/decide/cancellation), önemli günler (save/set_state), bildirim (outbox, inbox, alıcı projeksiyonları), takas/devir (candidates/command/maintain/read/notification_policy) ve haftalık tercih kaydı.
- 28 servis: apply_schedule_auto_fill, apply_schedule_default_hours, assess_schedule_shift, assess_weekly_schedule_assignment, create_schedule_shifts_batch, decide_time_off, flush_shift_exchange_notifications, list_schedule_draft_availability_conflicts, list_schedule_weekly_shifts, mutate_schedule_edit_shift, preview_schedule_auto_fill, preview_schedule_default_hours, preview_schedule_publication, process_notification_outbox, project_notification_inbox, project_notification_recipients, project_schedule_notification_recipients, publish_schedule_draft, request_time_off_cancellation, save_important_date, set_important_date_state, shift_exchange_notification_policy, shift_exchanges_candidates, shift_exchanges_command, shift_exchanges_maintain, shift_exchanges_read, submit_time_off, weekly_preferences_save (hepsi `_service` ekli).

**Rütbeye göre görünürlük (Mert'in yeni kuralı, U6/U7) için sonuç:**
Okuyucuya göre maskeleme ya okuyucuyu bu zincir boyunca taşımayı ister ya da çekirdeğe örtük bir ayar koymayı:
- (b) Taşımak: büyük bir R3 değişikliği. Değişiklik büyük olasılıkla 28 servisin içinde kalır, imzaları değişmez.
- (c) Örtük ayar: tetikleyici ve işçi bağlamında okuyucu olmadığı için ayrıntı açık kalır (fail-open).

İki yolda da parmak izi riski ölçülmeden yazılmamalı.

Daha ucuz bir yol: Schedule metni herkese aynı kalır (missing/expired), ayrıntı yalnız Documents ekranında görünür. Bu, eski (a) seçeneği. Mert'in "uyarıyı kim görür" kuralını karşılamıyor. Plan bu üç yoldan birini seçmeli.

