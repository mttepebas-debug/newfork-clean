---
name: builder-sql-traps
description: Test dünyası (supabase/test-support/builder.sql) ve pgTAP SQL'inde yazılı olmayan tuzaklar — tests şeması yetkisi, onboarding case, departman/iş, açık kalan taslak, tests.week tarihi, format/union tipleri, parametre-sütun çakışması, sabit now()
metadata:
  type: reference
---

BL-237'de 5 test dosyası taşınırken bulundu (2026-09-29, nf-test oturumu `local_0efbf957…`).

1. `authenticated` ve `service_role` rollerinin `tests` şemasında USAGE yetkisi yok: `set local role` sonrası
   `tests.*` çağrılamaz. Kimlikleri rol değişmeden önce temp tabloya al; temp tablo otomatik yetki almaz,
   `grant select … to authenticated` ekle. Örnek: `supabase/tests/employee_hub.test.sql` (`eh_ids`).
2. `tests.person()` her çalışana varsayılan bir `employee_onboarding_cases` satırı açar. İkinci insert
   `employee_onboarding_cases_employee_id_key` hatası verir: var olanı güncelle ya da ayrı kişi kur.
3. `tests.world()` yalnız "Kitchen" departmanını ve cook/server işlerini kurar. Başka iş gerekiyorsa
   `tests.person` çağrısından ÖNCE `create_department_with_jobs_service` ile kur.
4. `tests.publish_week` yayınladığı taslağı arşivlemez; "test world …" adlı taslak açık kalır. Taslak sayan
   hücreden önce: `update schedule_drafts set archived_at = now() where name like 'test world%'`.
5. `tests.week(n)` ~700 gün ileride. `tests.week(n) - 7` geçmiş hafta DEĞİL; geçmiş hafta `current_date`
   ile kurulur (nf-guvenlik hafızasında da kısmen var).
6. `employee_documents.object_path`'in son parçası satırın kendi id'si olmalı (CHECK): id'yi önce üret,
   hem id'ye hem yola yaz.
7. `format()` ile uuid geçerken `%L`, `%s` değil ("trailing junk after numeric literal"). `UNION ALL`'da
   tipsiz `null` ya da `'10:00'` text sayılır: `null::uuid`, `::time` yaz.
8. SQL fonksiyonunda (pg_temp dahil) parametre adı sorgudaki bir tablonun sütun adıyla aynıysa **sütun
   kazanır** ve koşul bütün satırlara eşleşir. Üç kez görüldü: ürün kodunda `schedule_edit_starting_point`
   (BL-234); `schedule_publication.test.sql`'de `d.draft_id = draft_id`; `pg_temp.approve(case_id)` →
   `shift_exchange_applications.case_id` bütün taleplere eşleşti. Kural: parametreye çakışmayan ad ver
   (`target_…`).
9. Bir işlem içinde `now()` sabittir: aynı işlemde eklenen satırların `created_at`'i eşit olur,
   `order by created_at, id` rastgele uuid'e düşer ve sonuç kararsızlaşır.

İlgili: [[shared-db-unscoped-count-flakiness]], [[shift-exchange-builder-traps]], [[owner-cannot-delete-own-location]].
