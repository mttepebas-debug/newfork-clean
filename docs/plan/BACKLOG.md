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
- BL-047 Settings > General ve Location drawer polish; Jobs drawer polish da burada (BL-048 sadece crash).
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

## Yeni bulgular (2026-09-16, RESCUE-001)
- README.md eski içerik taşıyor (payroll/kiosk fazları); rescue'da silinmişti, geri tutuldu. Güncel komutlarla yeniden yaz (OPS-012 ile birlikte).
- Schedule topbar dar pane'de (~936px) iki satıra sarıyor; taşma yok, polish (F5).
- Schedule topbar filtre çipleri Settings dropdown'ının üstünde render ediliyor (z-index) → tasks/THEME-002.
- Light tema token seti → tasks/THEME-002.
- ≤760px'te Schedule Export erişilemiyor → KARAR (2026-09-16): mobilde export yok; mevcut davranış korunur.
- App.test.tsx schedule-data mock'u scheduleReadKey'i gerçek koddan farklı (view dahil) üretiyor; mock'u gerçek helper'a bağla.
- Export PNG önizlemesi her sayfayı 2.5x ölçekte render ediyor; çok sayfalı haftalarda yavaş. Düşük ölçek değerlendir (EXP-002).
- Prod build'e erişilemeyen lazy chunk'lar giriyor (ScheduleShiftBadgeLab, Kiosk, TimeEntries); lazy import'ları DEV ya da postMvpSurfaces koşuluna al.
- EmployeeHubPage pageCopy'de time-tracking metni ve independentPage mantığı duruyor (BL-057).
- ScheduleExportSchedules.test.tsx makine TZ'sine bağlı; testte TZ'yi mock'la (CI şu an TZ pin'liyor).
- Kullanıcı dizinindeki `C:/Users/TheWe/node_modules` (ör. @types/node 25.5) repo bağımlılıklarını maskeleyebilir; kaldırılması değerlendirilsin.
- CI test adımı ~7dk (concurrency=1); ileride concurrency=2 denensin.
- Hosted advisor: `public.read_role_workspace(uuid)` SECURITY DEFINER ve authenticated RPC ile çağrılabiliyor; kasıtlı mı kontrol et (güvenlik).
- Tam local `pnpm test`'te yük altında flaky testler: api organization-settings-routes, web EmployeeOnboardingPage (3), ScheduleRequestsPage, LineupEditor (2). İzole PASS; CI concurrency=1 ile koşuyor. Kök nedeni (timeout ya da ortak state) araştır.
- EXP-002: export çıktı görünümünün kalanı (PNG önizleme ölçeği + kullanıcı geri bildirimi); task dosyası kullanıcıyla konuşulunca açılacak.
- THEME-003: yakın renk tonlarını (ΔE<4) THEME-002 token'larına birleştir; görsel değişiklik içerir, önce kullanıcıyla önce/sonra karşılaştırmasıyla konuşulur.
- THEME-002 açıkları → tasks/THEME-004 (sayfa CSS token'ları, on-accent, employee AA). Yakın tonlar → MVP-PLAN F5 THEME-003.
- Owner onboarding'de lokasyon short name önerisi ve phone alanı yok → tasks/LOC-002.
- Hosted'a location_phone migration'ı → tasks/LOC-002 (publication migration'ı UI-DOC-001 sonrası).
- THEME-003 ek: sayfa yerel paletleri (--lu-*, --wt-*, --eh-*, --filter-*) token'lara bağlansın; employee sayfaları dolu veriyle AA tekrar ölçülsün.
- Supabase CLI v2.109 → v2.117 güncellemesi (db push sırasında pg-delta sertifika ENOENT gürültüsü).
- Hosted: Supabase panelinden leaked password protection açılacak (kullanıcı).
- `/v1/invitations/pending|accept|decline` auth hatasını 409 ile döndürüyor (app.ts:655,686,716); 401 olmalı. Web S6 ile artık bu yola düşülmüyor; düşük öncelik.
- T2 madde 6 (davet token'ını sessionStorage'da saklama) YAGNI ile düşürüldü; hosted'da e-posta onayı açılırsa yeniden değerlendir.
- Vercel Authentication (newfork-clean-api, Production) smoke bitince yeniden açılacak (memory `vercel-prod-protection-disabled`).
- `.employee-remove-access { color: #9b3442 }` (styles.css ~2359) ölü kural: "Remove access" kırmızı yazı almıyor; `.secondary-button` sonradan geldiği için eziliyor (THEME-005 bulgusu). Tasarım kararıyla birlikte düzelt ya da sil.
- SecurityPage "Cancel change" butonu kırmızı (danger) görünüyor; iptal eylemi için doğru ton mu, F5 polish'te karar (THEME-005 bulgusu).
