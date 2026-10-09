# G14 müdür notu metni — nf-guvenlik incelemeleri

## §1 — 2026-10-01 ~22:55Z, alt ajan (opus), koordinatör local_b355d250
KARAR: ONAY @6c7bb938 (dal task/g14-manager-note, taban 76b25262, 8 dosya +332/-12)

- `get_schedule_read_model_service` yeniden tanımı: önceki son tanım `20261003020000_archived_names_reach_the_schedule.sql:40`; `diff -w` yalnız iki ek: `readable_notes` (:108-116), `manager_notes` (:171-172). SECURITY DEFINER + search_path '' korunmuş, yeni grant yok.
- Kim okur: `authz_reason(actor, w, 'availability.note_read', target_person => employee.id) is null`; fail-open yok. Başka workspace, çok lokasyon, arşivli lokasyon, `reminder.enabled` false, okuyanın kendisi (self_ok yok, rank), pending/belge engelli müdür — hepsi kapalı.
- Çalışan panosu (`get_employee_schedule_board_service`) değişmedi, alan yok. API çağıranları: `/schedule/reference`, export izin kontrolü, yayın rotası — dışarı sızma yok.
- §9 yasakları temiz. OPS-03: alan ekleyen; canlı tek başına güvenli (zod bilinmeyen alanı atıyor; yeni alan nullable optional).

Düşük bulgular (koordinatör kararı: aynı dalda düzeltilir, migration henüz uygulanmadı):
1. `reminder.enabled=false` için test yok.
2. "Müdür hakkında metin yok" kontrolü boşa geçiyor (:67-68; Ayşe hakkında not satırı yok).
3. Eski "hiçbir yerde sızmaz" kontrolü daraldı; Filiz okumasına cevabın tamamında `not like '%School mornings%'`.
Öneri: `readable_notes as materialized` (yetki sorusu kişi başına bir kez).

Düzeltme `nf-db` local_4ba671c6'ya verildi (~22:57Z). Düzeltme sonrası koordinatör diff'i okur; migration değiştiği için `materialized` satırı ve testler yeniden bakılır.

## §2 — 2026-10-01 ~23:00Z, koordinatörün kendi okuması (düzeltme commit'i)
KARAR: ONAY @f836ed1d (6c7bb938 üstünde, yalnız migration + schedule_reads_weekly_availability.test.sql)
- `readable_notes as materialized`; `join visible_employees` yerine `reminder.employee_id = any(array(select id from visible_employees))`; `target_person => reminder.employee_id` (aynı kişi). Süzgeçler (workspace, enabled, görünür çalışan, authz) eşdeğer; düz join'li materialized 100–163 ms ölçülmüştü (bütçe 50), commit'lenen 15–23 ms (yazarın ölçümü, iki tur).
- Testler: kapalı not (10), müdür hakkında gerçek not satırı (9), Filiz cevabının tamamında metin yok (8); kırmızı-önce yazarın raporunda. 17/17, 25/25, bütçe 17/17 (yazarın).
