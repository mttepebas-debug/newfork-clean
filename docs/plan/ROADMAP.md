# MVP Roadmap

**MVP sonucu:** Employer organizasyonu kurar, çalışanları davet eder, Schedule yayınlar ve günlük personel değişikliklerini yönetir. Employee doğru workspace'e katılır, onboarding'i tamamlar, yayınlanmış programı görür, talep gönderir ve kararı görür. Ücretli plan (Stripe) ile satılabilir.

Faz planı ve gerekçe: [MVP-PLAN](MVP-PLAN.md). Durum her task'ın kendi dosyasındadır (`tasks/`). Bu dosya yalnızca sıra ve hedef değişince güncellenir.

## Sıradaki (Faz F0 → F1)
1. **F0 (kalan):** UI-LAB-001 (DEV-only araç; F2 sonunda THEME-005 buton rolleri kararları verilir), OPS-010 hosted push (AUTH-002'nin 2 migration'ı) + smoke, AUTH-004 (owner olmayan üye owner sihirbazına düşüyor), OPS-013 hata izleme, OPS-014 pg_cron.
2. **F1 ilk grup:** UI-DOC-001, BL-038, BL-048, REQ-AUDIT.

Fazlar sırayla ilerler: F0 → F6 ([MVP-PLAN](MVP-PLAN.md)). Bir faz içindeki task'lar paralel çalışabilir.

## Önceki 13 adımlık sıra (referans; güncel sıra MVP-PLAN fazlarıdır)
| # | Task | Bitiş özeti |
|---|---|---|
| 1 | RESCUE-001 WIP → main | Rescue'daki her dilim ya main'e alınır ya da backlog'a düşer; rescue branch silinir |
| 2 | UI-DOC-001 Documents publication | Migration local'e uygulanır; Draft Save → Publish → Unpublish → Republish browser akışı çalışır |
| 3 | BL-038 Schedule Templates | 6 ürün kararı verilir; create/apply/persistence/yetki UAT yapılır |
| 4 | BL-048 Add Department crash | Hata tekrar üretilir ve düzeltilir, ya da tekrar üretilemediği kaydedilir |
| 5 | Requests: REQ-AUDIT → REQ-001 manager / REQ-002 exchange / REQ-003 time off (BL-041) | Time off ve release/cover/swap → manager kararı → yayınlı Schedule etkisi uçtan uca çalışır |
| 5a | Employee Hub nav/tab + polish (BL-056/057), Requests'ten sonra | Tek nav; Time Tracking gizli; "Your team" kartı board'a gider |
| 5b | Line Up (BL-040), ayrı plan konusu; kapsamı kullanıcıyla ayrıca konuşulacak | Sadeleştirilmiş Line Up; yayınlı Schedule sorumluluğu korunur |
| 6 | BL-044/045/046 + ANN-001 Announcements, Notifications, belge email'i | Producer, inbox, tercih ve gerçek email teslimatı çalışır (önce BL-027 anahtar yenileme) |
| 7 | OBS-002 Availability → Schedule | Employee save → manager copy/save → Schedule/preflight akışı ve otomatik bildirim çalışır |
| 8 | BL-055 date/time tüketimi, OBS-001 invite/access, BL-053 | Global tarih/saat tercihi her yerde uygulanır; invite mutasyonları kabul edilir; Acknowledgements kararı verilir |
| 9 | BL-042/043/047/054/034 admin/public polish | Drawer, Important Dates, General/Location, Support ve landing tamamlanır |
| 10 | BL-059 Billing/Stripe | Plan/limit, 14 gün trial, ücretli plana geçiş; tekrar trial yok (workspace = ayrı abonelik) |
| 11 | (MVP sonrası) BL-067 Schedule saat limitleri | - |
| 12 | BL-058 Beş tenant E2E | Invite'tan publish'e, taleplerden rol değişikliğine uçtan uca akış; fixture ve cleanup dahil |
| 13 | Release | Seed/SQL replay, hedef ortamda migration, provider/cron, deploy (yetkili) |

Backlog maddeleri sırayı bozmaz. İlgili task içinde doğal olarak gerekiyorsa ya da kullanıcı "araya al" derse alınır.

## Kapsam kararları
- MVP sonrası: BL-067 saat limitleri, Kiosk, Time Tracking, clock-in/out, break, payroll, geniş compliance, Time Entries menüsü, default-hours review butonu.
- Kapsam dışı: SSN toplama.
- Billing domain: bir workspace ayrı bir company ve ayrı bir abonelik demektir. Aynı company'nin şubeleri aynı workspace içinde location olarak tutulur. Daha önce trial kullanmış bir owner yeni workspace açınca tekrar trial alamaz.
