# Backlog

Madde başına tek satır, yalnızca sona ekle. Bir madde aktif işe alınınca aynı ID ile `tasks/<ID>.md` dosyası açılır ve buradaki satıra `→ tasks` yazılır.

## MVP öncesi (ROADMAP sırasına bağlı)
- BL-007 Onboarding yedi adımlı akış ve taslak otomatik kaydetme.
- BL-008 Workspace avatar upload/crop.
- BL-027 Resend anahtarını yenile (provider smoke testinden önce). Değer belgelere yazılmaz.
- BL-034 Landing page kapsam kararı: public ziyaretçiyi doğru auth/onboarding yoluna yönlendirme.
- BL-038 Schedule Templates: 6 ürün kararı ve UAT (ARGE: docs/rebuild/bl-038-schedule-templates-arge-2026-09-11.md).
- BL-040 Line Up sadeleştirme.
- BL-041 Requests > Shift Changes baştan sona elden geçirme.
- BL-042 Employee drawer UI polish.
- BL-043 Important Dates drawer/sayfa ve ek fonksiyonlar.
- BL-044 Announcements sayfası ve Add Announcement drawer polish.
- BL-045 App Notifications fonksiyonel audit.
- BL-046 Settings > Notifications sadeleştirme, producer audit ve gerçek belge email teslimatı.
- BL-047 Settings > General ve Location drawer polish.
- BL-048 Add Department crash ve Jobs drawer.
- BL-051 Roles: gerçek custom-role silme işleminin browser kabulü.
- BL-053 Acknowledgements sayfasının MVP rolü kararı.
- BL-054 Settings > Support yeniden kurgu.
- BL-055 Global date/time tercihinin Schedule, Employee Hub ve Notifications'ta kullanılması.
- BL-056 Employee arayüzü: tüm sayfaların audit ve polish'i.
- BL-057 Shift Hub bilgi mimarisi: tab karmaşası temizlenir, Time Tracking gizlenir.
- BL-058 Beş tenant E2E prova verisi ve kabul turu.
- BL-059 Billing/Stripe: plan, limit, promo, trial.
- BL-067 Schedule günlük/haftalık saat limitleri.
- OBS-001 Invite/access mutasyonları (reminder/revoke/remove access) ve provider kabulü.
- OBS-002 Availability save → manager → Schedule browser zinciri ve otomatik bildirim (local cron 503 hatası dahil).

## Geliştirme ortamı
- BL-002 `pnpm.cmd dev` için yapılandırılabilir portlar; aynı sunucu ikinci kez başlatılmasın.
- BL-003 Tek komutla env anahtarlarının varlığı (değer göstermeden), port ve checkout kontrolü.
- BL-004 Tekrar kullanılabilir owner/manager/employee local fixture'ları ve temizliği.
- Genel seed/SQL replay hataları (release öncesi).

## MVP sonrası
- BL-009 Kiosk ve PIN reset.
- BL-030 Time Entries menüsü.
- BL-060 Kiosk, time tracking, break, payroll, compliance.
- BL-062 Default-hours review.
- BL-050 Shift type başına birden çok saat preset'i ve grid'de sağ tık ile hızlı shift.
- BL-061 kapandı. BL-064 kapandı.
- Export iyileştirme fikirleri: somut kullanıcı feedback'i bekleniyor.
- Eski toplu fikir grupları (BL-010..025: dashboard'lar, raporlar, mobil, enterprise, termination edge case'leri): CODEX-ARCHIVE-2026-09-16.md içinde.
