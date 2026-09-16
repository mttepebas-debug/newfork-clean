# RESCUE-001 Rescue WIP'i dilimlere ayırıp main'e taşı
Status: draft
Session: -   Branch: task/rescue-001 (dilim başına ayrı branch da olabilir)   Worktree: newfork-wt/rescue-001   DB: -

Goal: `wip/rescue-2026-09-16` (commit `14647f8`, 284 dosya) içindeki işleri kayıpsız ve anlaşılır dilimler halinde main'e almak.

In scope:
- Dosyaları dilimlere ayıran bir manifest çıkarmak. Bilinen dilimler:
  - Export v2 (BL-037, yerel kabulü tamam)
  - Document lifecycle (BL-052/001, yerel kabulü tamam; 19 migration local DB'ye uygulanmış)
  - Documents publication UI (UI-DOC-001, bloklu)
  - Location timezone
  - Schedule filtre, badge ve görünürlük düzenlemeleri
  - Roles UI follow-up
  - EmployeeScheduleBoard + Employee Hub menüsü (My Team dosyaları silinmiş; kanıtı yok)
- Kabul edilmiş dilimler: typecheck ve hedefli test çalıştırılıp main'e merge edilir.

Out of scope: yeni özellik, redesign, kabul edilmemiş dilimleri "bitti" saymak.

Done when:
- Her dilim ya main'e alınmış ya da bir task dosyasına veya backlog'a bağlanmış.
- Rescue worktree ve branch silinmiş.

Touches: web, api, shared, supabase/migrations.

Test plan: dilim başına ilgili package'ın typecheck'i ve dilimin kendi testleri. Tüm dilimler alınınca bir kez tam typecheck.

Risk:
- Local DB'de rescue'daki BL-052 migration'ları uygulanmış durumda, fakat main'de bu dosyalar yok. Main checkout ile çalışan uygulama bu şema farkını görebilir. Migration'lar öncelikli dilimdir.
- Dilimler arası bağımlılık var: Export ile Documents erişim kontrolü, Documents ile Schedule filtresi birbirine bağlı.

## Notes / Result
