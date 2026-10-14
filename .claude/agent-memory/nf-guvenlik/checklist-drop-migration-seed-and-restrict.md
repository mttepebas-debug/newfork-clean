---
name: checklist-drop-migration-seed-and-restrict
description: Kolon ya da satır silen migration'da seed.sql'i ve silinen satırlara RESTRICT ile bağlı tabloları tara; rolled-back deneme ikisini de göstermez
metadata:
  type: feedback
---

Kolon düşüren migration'da `supabase/seed.sql` ve migration dışındaki bütün `supabase/**/*.sql` silinen kolona yazıyor mu taranır. Satır silen migration'da silinen tabloya `ON DELETE RESTRICT` (ya da varsayılan NO ACTION) ile bağlı her tablo çıkarılır; silme sırası o zincire göre kurulur.

**Why:** FB-6.3.7 (2026-10-01): yazarın rolled-back denemesi 145/146 yeşildi ama (1) `seed.sql:171,178,286,290` silinen `departments/jobs.sort_order`'a yazıyordu — ortak yerel DB seed'i hiç çalıştırmaz, CI DB'yi sıfırdan kurarken düşerdi (db + e2e kırmızı, main push donar); (2) eski bildirim türü silinirken `notification_inbox_items` ve `notification_delivery_attempts` atlanmıştı — yerelde o satırlar yok, canlıda varsa canlı gönderim FK'ye takılırdı. İkisi de yazarın grep'inin (`apps/ packages/ e2e/`) dışındaydı.

**How to apply:** `git grep -n "<kolon>" <sha> -- supabase/` (migration dışı; `ci-not-green.txt`'tekiler CI'ı kırmaz ama backlog'a not); `git grep "references public.<tablo>"` ile RESTRICT zincirini çıkar, her halkanın aynı filtreyle önce silindiğini doğrula. Kanıt istenirken "seed gövdesi yeni şemaya karşı rolled-back işlemde geçti" satırını iste.
