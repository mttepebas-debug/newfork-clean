# Telefonda kenar boşluğu (Mert'in yorumu, Employees PAGES sayfası, 2026-10-13 02:18Z)

Sayfa: `telefon-kenar-boslugu.html` (tek dosya, görüntüler gömülü).
Sekme: Ortak (bütün telefon ekranları) ya da Employees.
Soru: Telefonda içerik ekran kenarına ne kadar yaklaşsın? A 16 piksel (önerilen), B 12 piksel, C liste kenardan kenara.
Neden: `apps/web/src/styles.css` ortak kural `.workspace-page, .availability-page, .important-dates-page, .employees-page, .announcements-page, .notifications-page, .requests-page { width: min(100% - 64px, 1320px) }` telefonda da geçerli; `@media (max-width: 720px)` yalnız padding'i 14px yapıyor, genişliği değil. Sonuç: her yanda 46px.
Ölçüm (PAGES app.html, 390px, başlık x): Workspace, Requests, Employees, Documents, Availability, Important Dates, Announcements 46 · Notifications 12 · My schedule 12 · Employee home 30 · Settings/Locations 16 · Account/Profile 16.
Kod: henüz yazılmadı (otomasyon durdu; varyant kuralı ve CLAUDE.md §3.A.7: ortak değer önce KARARLAR'a, sonra ekranlar). Seçimden sonra iş: 720px altı medya kuralında `width: 100%` + seçilen padding; diğer telefon ekranları aynı ölçüye; KARARLAR'a kural.
