# BL-070 kararları (2026-09-22/23, kullanıcıyla tek tek)

Ölçüm: main 9490ca2, tam pgTAP koşusu: 131 dosya, 38 kırmızı. Yerel DB'de 20260922180000 (entry mode dönüşümü) uygulanmamış — kullanıcı henüz karar vermedi.

| # | Dosya | Karar | Not |
|---|---|---|---|
| 1 | function_execute_privileges | REPO | read_role_workspace okuması API'ye taşınır (GET roles + _service), authenticated grant kaldırılır |
| 2 | tenant_owned_composite_foreign_keys | REPO 8 + TEST 3 | 8 FK'ye workspace_id; 3 istisna (time_off_cancellation_periods.request_id, onboarding req submitted/approved doc) gerekçeli |
| 3 | bl052_document_access | TEST | ikinci engel için published document_types satırı. Deneme 14/14 |
| 3b | (ürün kararı) | REPO | taslak belgenin etkisi sıfır: 3 atama yolu (initialize_employee_onboarding_service, document_reconcile_employee, apply_lifecycle_definition) yalnız published seçer; guard_document_requirement_publication taslakta sessiz null yerine hata verir |
| 3c | REUSE.md | DOC | "belge gereksinimi yalnız published tanıma" notu |
| 4 | bl052_document_definitions | TEST | tanımı publish et; revision'ı varsayma, oku |
| 5 | bl052_document_employee_assignment_preview | TEST | tanımı publish et. Deneme 9/9 |
| 6 | onboarding_composite_tenant_constraints | TEST | 7 geçerli gün. Deneme 8/8 |
| 7 | notification_platform_core | TEST | sabit 9 yerine invariant |
| 8 | notification_settings_admin | TEST | sabit 9 yerine invariant |
| 9 | notification_preference_resolver_and_producers | TEST + (REPO via 10) | sabit sayılar yerine invariant |
| 10 | account_notification_scope | REPO | people.preferred_name.published/review_required: in-app şablon + producer kaydı (şablon metni kullanıcıya gösterilecek) |
| 11 | scheduling_settings_shift_types_rls | TEST | saatli tip, eşit saat 22023. Deneme 25/25 |
| 12 | roles_permissions_rls | REPO + TEST | enforce_membership_role_change: employees.archive izni olan, terminate/archive sırasında owner/admin olmayan satırı suspend edebilir (dar kapı). Test yeni save_employee_service imzası. (leave: high / do: risky) |
| 13 | weekly_team_availability | REPO + TEST | can_open employees.read de ister (low/safe); test availability.read'i kaldırsın |

Backlog'a: yayınlanmamış belge sessiz atlama (3b ile çözülüyor, backlog gerekmez).
| 14 | weekly_assignment_candidates | TEST + REPO msg; #19 → BL-092 | 18-18 engellenir (test kabul eder); invalid_local_time yerine "Başlangıç ve bitiş aynı olamaz" (low/safe). #19 kendi kaynağıyla çakışma = BL-092 grubu |

## Rol modeli (kullanıcı, 2026-09-23) — tüm testler buna göre değerlendirilir
- owner: tam yetki, tüm organizasyon.
- admin: owner ile aynı, organizasyon kapsamlı, tam okuma/yazma; yalnız billing gibi önemli owner yetkileri yok.
- manager: yalnız kendisine atanmış lokasyonları ve o lokasyonların employee'lerini görür.

Repo ölçümü: owner 75 izin, admin 74 (eksik: roles.manage), manager 44 (settings.* yok), employee 9.
can_access_employee: owner/admin hepsi; manager yalnız employee sınıfı + (all_locations veya ortak lokasyon).
Sapmalar (kullanıcıya soruldu):
- D1 manager-sınıfı özel role settings.* verilebiliyor → tüm lokasyonları görür, dışarıdaki lokasyonu düzenler (roles_permissions_rls 121-123, şu an YEŞİL).
- D2 admin: roles.manage yok (owner verebilir), admin atayamaz, sahiplik devri/kapatma owner'da; billing yok.
- D3 manager, başka lokasyonda da çalışan kişiyi işten çıkarabilir mi (terminate org-wide erişimi kapatır).
Park: weekly_exchange_acceptance #41, weekly_lineup_offer_changed_terms #28, weekly_lineup_remaining_offer_terms #20, weekly_schedule_batch, weekly_onboarding_preferences, weekly_shift_availability_assessment, schedule_availability_enforcement, schedule_time_source.
Kararlar:
- D1: manager-sınıfı rollere settings.* verilemez (save_workspace_role_service reddeder; UI'da gizlenir). roles_permissions_rls 115-124 ters yönde yeniden yazılır.
- D2: admin varsayılan roles.manage alır; admin atama, sahiplik devri, kapatma, billing owner'da.
- D3: manager yalnız çalışanın TÜM aktif lokasyonları kendi kapsamındaysa terminate/archive edebilir; değilse admin/owner. UI: düğme yerine açıklama (görsel karar, mockup ile). Dosya 12 dar kapısı bu koşulla.
| 15 | weekly_exchange_acceptance | PARK (Line Up grubu) | test ada bakıyor (öneri: davranış); yan bulgu: lineup_staffing_notification_allowed eski lineup_candidate_check (assess_shift_availability) kullanıyor → BL-091 |
| 16 | weekly_lineup_offer_changed_terms | PARK (Line Up grubu) | fixture çift rezervasyon kuruyor (6401acd kuralı); öneri test düzelt + "kabul edilemez teklif ekranda" backlog |
| 17 | weekly_lineup_remaining_offer_terms | PARK (Line Up grubu) | henüz incelenmedi |
| 18 | weekly_schedule_batch | TEST | #1 çakışmayan ikinci vardiya (stale fingerprint korunur); #23 PT409 bekle; #25 "Schedule conflict confirmed by manager." |
| 19 | weekly_onboarding_preferences | TEST + REPO | Employee onboarding sıfırlama YOK (kullanıcı). Test reset'siz akış; repodan sil: POST /v1/me/onboarding/reset (onboarding-routes.ts:195), service.reset (onboarding-service.ts:245), web resetMyOnboarding (onboarding-data.ts:104) + test mock, DB reset_employee_onboarding_service (drop). Owner onboarding Start over'a dokunma |
| 20 | weekly_shift_availability_assessment | TEST a+b, REPO c | a: 18-18 blocked kabul; b: default confirm, #18 önce warn'a çek; c: time_source_unresolved → verification_required (yayın kuralı check_schedule_time_source ile aynı dil) (leave: medium / do: moderate) |
