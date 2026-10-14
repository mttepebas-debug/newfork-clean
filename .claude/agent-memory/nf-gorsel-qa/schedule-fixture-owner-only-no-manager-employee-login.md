---
name: schedule-fixture-owner-only-no-manager-employee-login
description: The local seed's "Meyhouse" workspace (schedule/ghost-shift fixture) has only an owner login; manager/employee role QA on that data needs the e2e world builder (DB write, out of scope for read-only QA)
metadata:
  type: project
---

`supabase/seed.sql`'deki "Meyhouse" workspace'i (id `6ea5d512-...`, Main Dining / Garden
Room, Alex Kim / Jordan Lee / Sam Rivera profilleri, ghost-shift ve availability-override
senaryolarının kaynağı — bkz. satır ~272-391) yalnız `owner@newfork.test` (parola
`supabase/seed.sql` içinde) üyeliğine sahiptir. Alex/Jordan/Sam birer `employee_profiles` kaydı, bağlı
auth kullanıcıları yok; bu workspace'e manager ya da employee girişi YOK.

`employee@newfork.test` ve diğer local fixture hesapları farklı workspace'lere (7ea5d512,
8ea5d512, 9ea5d512 — External Owner) üye; Meyhouse'un vardiya verisini employee/manager
rolüyle görmezler.

**Nasıl uygulanır:** Schedule ekranında owner/manager/employee üç rolü aynı ghost/availability
verisiyle karşılaştırmak gerekiyorsa, ya (a) sadece owner rolüyle test edip eksikliği raporda
açıkça yaz, ya da (b) `e2e/fixtures/world.ts` + `tests.*` builder ile yeni bir run oluştur —
ama bu ortak yerel DB'ye YAZAR (db.lock gerekir), salt-okunur görsel QA kapsamının dışında;
koordinatöre sorulmalı.

Ayrıca: bu oturumdaki Claude_Browser MCP aracı (`mcp__Claude_Browser__computer` screenshot)
ekran görüntüsünü sohbete gömüyor ama diske dosya olarak kaydetmiyor — `artifacts/nf-gorsel-qa/`
altına yol vermek için ayrı bir kaydetme adımı (ör. CDP/Playwright ile doğrudan dosyaya yazmak)
gerekiyor; aksi halde rapor "canlı incelendi, dosya kaydedilmedi" demeli.
