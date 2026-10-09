---
name: checklist-not-null-relax-readers
description: Bir kolonun NOT NULL'u gevşetilince onu jsonb/tablo olarak döndüren her okuyucunun zod şemasını ara; API parse null'da 500 verir, vitest mock'ları yakalamaz
metadata:
  type: feedback
---

Migration `alter column ... drop not null` (ya da yeni bir yolun null satır üretmesi) görünce: kolonu döndüren her DB fonksiyonunu bul (`pg_get_functiondef ilike '%kolon%'`), sonra `packages/shared` içinde o alanı parse eden zod şemasını. `z.string()` null'u reddeder; API `schema.parse(rpc(...))` 500 döner.

**Why:** BL-080 (2026-09-26, `a421faa`): `employee_private_profiles.emergency_contact_*` gevşetildi, her owner'ın satırı acil kişi olmadan açıldı; `get_employee_detail` null döndürdü, `employeeDetailSchema` (`emergency_contact_name/phone` zorunlu) Team'de owner kaydını kırdı. pgTAP ve vitest yeşildi: pgTAP zod'u, vitest gerçek DB'yi görmez.

**How to apply:** rollback'li denemede okuyucu fonksiyonu yeni satır biçimiyle çağır ve çıktıyı şemayla karşılaştır. `list_*` fonksiyonları çoğu zaman `coalesce(...,'')` yapar, `get_*_detail` jsonb yapmaz. Bkz. [[feedback-rollback-trial-safety]].

Trigger'ları da ara: `user_id <> new.<kolon>` gibi karşılaştırma kolon null olunca hiçbir satırı seçmez; bildirim sessizce kimseye gitmez (`is distinct from` gerekir). FB-6.3.2 (2026-10-01): `schedule_time_off_events.actor_user_id` gevşedi, `notify_schedule_request_event_service` `employee.user_id <> new.actor_user_id` kullanıyor; 'expired' olayını yazan migration'da kontrol et.
