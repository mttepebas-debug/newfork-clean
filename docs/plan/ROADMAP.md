# MVP Roadmap

**MVP sonucu:** Employer organizasyonu kurar, çalışanları davet eder, Schedule yayınlar ve günlük personel değişikliklerini yönetir. Employee doğru workspace'e katılır, onboarding'i tamamlar, yayınlanmış programı görür, talep gönderir ve kararı görür. Ücretli plan (Stripe) ile satılabilir.

Faz planı ve gerekçe: [MVP-PLAN](MVP-PLAN.md). Durum her task'ın kendi dosyasındadır (`tasks/`). Bu dosya yalnızca sıra ve hedef değişince güncellenir.

## Sıradaki (FOUNDATION-B → sonra F0 kalanı → FJ → F1)
0. **FOUNDATION-B — Yol B′ (kullanıcı kararı 2026-09-23; hedefe kadar durmadan):** yetki çekirdeği tek yerde, kararlar tek yerde, ikiz sistemsiz, her gönderimde otomatik kanıtlanan bir temel. Plan, hedef ve aşamalar: [FOUNDATION-B](tasks/FOUNDATION-B.md). Program boyunca MVP özellik işi durur; aşağıdaki maddeler programın dilimlerinde ele alınır ya da program bitince sürer. Başka oturumlar yetki, RLS, izin, `*_service` giriş noktası ya da test fixture'ına dokunan iş yapmaz.
   **Durum 2026-09-27:** Aşama 1–5 bitti; Aşama 6'da Takvim dilimi (FB-6.1) ~%75 (kalan: ekran turu, `.8`, `.9` diğer ekranlar, `.11`, `.13`, `.14` hosted gönderim), diğer yedi dilim başlamadı; Aşama 7 başlamadı. Program ilerlemesi ~%57 (tahmin ağırlıklı; ayrıntı FOUNDATION-B Notes).
1. **FJ Katılım zinciri — ilk sıra (kullanıcı kararı 2026-09-19).** Bir kullanıcının bir business'a bağlanma yolunun tamamı tek kapıda kapanır: giriş, davet (kabul/ret/çoklu davet/revoke), employee ve owner onboarding, yarıda kalma, çakışma durumları (pending davet varken business kurma, kurulumu bitmemiş business varken davet, aktif business varken davet), belge adımı, business kapatma/devir/suspend, hesap silme. Durum matrisi ve dilimler: [JOIN-001](tasks/JOIN-001.md). Sıra: J1 salt okunur durum turu → J2/J3/J4 → J5/J6/J7; UI-PRE-001 D2-D5 paralel yürür.
2. **F0 kalanı (FJ ile paralel, kullanıcı kapısı):** OPS-015 hosted push, hosted smoke (OPS-010) + Vercel Authentication'ı geri açma — ikisi de FJ işi bittikten sonra anlamlı. Beklemede: THEME-005 (buton rolleri), UI-LAB-001 (kapatıldı).
3. **F1 ilk grup (FJ kapandıktan sonra):** UI-DOC-001, BL-038, BL-048, REQ-AUDIT.

Fazlar sırayla ilerler: F0 → FJ → F1 → F6 ([MVP-PLAN](MVP-PLAN.md)). Bir faz içindeki task'lar paralel çalışabilir.

## Önceki 13 adımlık sıra (referans; güncel sıra MVP-PLAN fazlarıdır)
| # | Task | Bitiş özeti |
|---|---|---|
| 1 | RESCUE-001 WIP → main | Rescue'daki her dilim ya main'e alınır ya da backlog'a düşer; rescue branch silinir |
| 2 | UI-DOC-001 Documents publication | Migration local'e uygulanır; Draft Save → Publish → Unpublish → Republish browser akışı çalışır |
| 3 | BL-038 Schedule Templates | 6 ürün kararı verilir; create/apply/persistence/yetki UAT yapılır |
| 4 | BL-048 Add Department crash | Hata tekrar üretilir ve düzeltilir, ya da tekrar üretilemediği kaydedilir |
| 5 | Requests: REQ-AUDIT → REQ-001 manager / REQ-002 exchange / REQ-003 time off (BL-041) | Time off ve release/cover/swap → manager kararı → yayınlı Schedule etkisi uçtan uca çalışır |
| 5a | Employee Hub nav/tab + polish (BL-056/057), Requests'ten sonra | Tek nav; Time Tracking gizli; "Your team" kartı board'a gider |
| 5b | Line Up (BL-040): FOUNDATION-B 5.6'da silindi (2026-09-24); sıfırdan tasarım ayrı proje, kapsamı kullanıcıyla konuşulacak | Yeni Line Up yetki çekirdeği üzerinde; girdi `docs/plan/research/lineup-2026-09-24.md` |
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
