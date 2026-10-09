# G9 — İzin, takas ve kapsam kuralları: kararlar (2026-09-29, işçi oturumu nf-db)

Dal `task/g9-timeoff-exchange` (taban `origin/main` `23f734bf`).

## A. Küçük üç kural — migration `20260929180000_time_off_doors_close_with_the_workspace.sql`
Test: `supabase/tests/time_off_doors_close_with_the_workspace.test.sql` (7 hücre, ci-green'e eklendi).

1. **BL-247: kapalı workspace'te izin kapıları kapalı.** `employee_hub_actor_service` (çalışanın
   izin talebi, iptal talebi ve Employee Hub'ın bu fonksiyondan geçen diğer girişleri) artık
   çekirdeğin "workspace bu kişiye açık mı" sorusunu (`app_private.workspace_open_to_actor`)
   soruyor; kapalıysa 42501 + `authz.workspace_closed`. Sahibin kendi iznini onaylama kısayolu
   (`app_private.authorize_time_off_decision`) da `workspace_open` bakıyor; kapalıysa çekirdeğin
   kendi reddi geliyor. Örnek: askıya alınmış workspace'te Ali izin isteyemez, sahip kendi
   iznini onaylayamaz, kimse onaylı izin için iptal isteyemez.
   `time_off_is_the_owners_own`'a dokunulmadı: bildirim sağlık kontrolü de onu okuyor; kapalı
   workspace'in geçmişi alarma dönmesin.
2. **BL-220: sağlık kontrolü sahipliği olay anına göre biliyor.** Sahibin kendi izni "talep
   edenin aynı anda kendisinin onayladığı talep" olarak tanınıyor (`record_owner_time_off`
   aynı işlemde onaylıyor; olay satırları değişmez). Sahiplik devrinden sonra eski sahibin izni
   yanlış alarm vermiyor, yeni sahibin önceden kaybolmuş bildirimi de gizlenmiyor.
   Yeni kolon/işaret gerekmedi (backlog'daki "olay satırına işaret" önerisi yerine var olan iz).
3. **BL-109: yazma bekçisinin metni nötr.** "A shift change is being reviewed…" yerine
   "Another change is being saved in this workspace. Your changes were not saved; try again."
   Aynı kilidi yayın da tutuyor; eski metin yanlış yönlendiriyordu. Metin API/web'de geçmiyor.

Kanıt: migration'sız 5 kırmızı; migration'la 7/7. Etkilenen 85 pgTAP dosyası migration'lı ve
migration'sız: tek fark yeni dosya, yeni kırmızı yok; DB sayaçları önce/sonra aynı
(05:19–05:28, db.lock nf-db/isci-g9).

## B. Devir notu: BL-182 + BL-127 (izni kısaltma) — başlanmadı, tasarım ölçüldü
Durum: kod yazılmadı. Bu bölüm bir sonraki oturumun sıfırdan keşif yapmaması için
(ölçüm: yerel DB = main `23f734bf`, 2026-09-29 05:10–05:35).

**Ölçülen gerçekler**
- Onaylı iznin etkin saatleri = `time_off_decided_ranges(segment) − time_off_cancelled_ranges(segment)`
  (`public.time_off_effective_ranges`). Engel kontrollerinin hepsi bunu okuyor
  (`assess_weekly_shift_availability`, `app_private.schedule_week_availability`,
  `time_off_request_assignment_count`, `guard_time_off_requested_period` …).
- `time_off_cancelled_ranges` = bu segmente bağlı, onaylı (`approved`/`partially_approved`)
  iptal taleplerinin karar verilmiş aralıkları. Yani **onaylı bir iptal parçası yazmak izni her
  yerde kısaltır**; ikinci bir kısaltma yolu gerekmez (BL-127 kararındaki "tek ortak parça").
- İptal yazımı: `submit_employee_time_off_cancellation_service` (çalışanın kendi yolu:
  `schedule_time_off_requests` `request_type='time_off_cancellation'`, `time_off_cancellation_links`,
  segment + `time_off_cancellation_periods`, `submitted` olayı) ve onay
  `apply_time_off_cancellation_decision` (parent'ı `partially_approved`/`revoked` yapar, olay yazar).
  İptal geçmişi tabloları değişmez (`guard_time_off_cancellation_history`, 55000).
- Takas/pickup engeli tek noktadan geliyor: `assess_weekly_shift_availability`'nin `operation`
  = `blocked` sonucu. Onu okuyan yerler: `record_weekly_exchange_acceptance` (onayda 23514),
  `guard_schedule_assignment_availability` tetikleyicisi (atamada 23514),
  `weekly_assignment_candidate_base` ve `shift_exchange_preview` (adaylık/önizleme). Bu dört
  fonksiyonun gövdesinde `time_off` geçmiyor; hepsi assess'e soruyor.
- Kilitleyen testler: `weekly_exchange_acceptance.test.sql:87-88`,
  `weekly_exchange_changed_terms.test.sql:116`, `shift_exchanges_v1.test.sql:170` (yeni kurala
  göre yeniden yazılır, gevşetilmez).

**Önerilen tasarım (bir sonraki oturum doğrular)**
1. Ortak parça `app_private.shorten_time_off(actor, w, employee, starts_at, ends_at, why)`:
   kişinin o aralıkla kesişen her onaylı izni için sistemin yazdığı, anında onaylı bir iptal
   talebi (kesişen saatler kadar). Sonuç izin satırları `apply_time_off_cancellation_decision`
   ile aynı şekilde güncellenir; olay notunda neden ("Shortened for a shift the employee took" /
   "…the manager assigned"). Kendi kilidi: `availability_lock_workspace(w)`.
2. Bildirim: izni onaylamış kişilere (parent talebin `approved`/`partially_approved` olaylarının
   aktörleri, işlemi yapan hariç) yeni tür `requests.time_off.shortened` (katalog + üretici +
   şablon; G6 deseni). Sahibin kendi izni (kendisi onayladı) → bildirim yok.
3. BL-182 (çalışan): `assess`'in izin kaynaklı `blocked` sonucu takas/pickup'ta kişinin kendisi
   için "rızayla geçilebilir" sayılır: önizleme ve adaylık bunu ayrı bir işaretle
   (`time_off_consent_required`) döner; rıza parmak izine girer; yönetici onayında
   (`record_weekly_exchange_acceptance`) önce `shorten_time_off`, sonra atama → tetikleyici
   artık engel görmez. Cover aday listesinde onaylı izinli kişi yine hiç görünmez (KARARLAR).
4. BL-127 (yönetici): yeni çekirdek eylemi (`time_off.shorten`, kişi kapsamlı, `rank_below`,
   `no_self`; matris hücreleri) + servis "izni kısalt ve ata"; aynı ortak parçayı çağırır.
   Yetki çekirdeği gövdelerine dokunmaz; `authz_actions`'a satır ekler (G7 ile sıra konuşulmalı).
5. Katmanlar: `nf-backend` onay sorusu sözleşmesi (`packages/shared/src/shift-exchanges.ts`,
   `apps/api/src/shift-exchanges/*`), `nf-arayuz` bilgilendirme metni (`ShiftExchangeHub.tsx`),
   Schedule → Requests'te yönetici eylemi (`ScheduleRequestsPage.tsx`); e2e izin + takas.

**Açık soru (vizyona göre önerim, KRİTİK değil):** kısaltma anı — önerim yönetici onayı anı
(vardiya gerçekten o kişinin olduğunda); başvuru anında kısaltmak, reddedilen başvuruda izni
boşa yakardı.

## C. Kalanlar (başlanmadı)
- BL-200 (takas onayında 2 sn bekleme): önce ölçüm (uygulama çalıştırılmalı), `nf-backend`.
- BL-110 (ölü "saat yok" dalları): DB `time_off_assignment_impact.time_unknown`, shared
  `time-off.ts:77` ve `shift-exchanges.ts:44-45`, web `ScheduleRequestsPage.tsx:1047`,
  `ShiftExchangeHub.tsx:1739,1834`. `scheduleShiftSchema` `""` (Schedule editörü) bu turda
  yasak dosyalara (SchedulePage) dayanıyor; dışarıda kalır.
