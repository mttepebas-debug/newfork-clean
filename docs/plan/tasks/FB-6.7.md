# FB-6.7 Duyurular ve önemli tarihler — yetki çekirdeğe, K1–K6 kuralları, üç bildirim testi yeşile
Status: in progress — 2026-10-02 (#93): A işçi oturumu başladı. Önceki: ready — 2026-10-02 (kapsam onayı: Mert, koordinatör `local_abc4d126…`'ın penceresinde, "FB-6.7'ye katsın (Önerilen)"; kurallar KARARLAR "Duyurular ve önemli tarihler" K1–K6; koordinatör beslemesi #92 ve eki). Uygulama başlamadı.
Session: A — işçi oturumu "FB-6.7 A: Duyuru ve önemli tarih yetkisi + kuralları" `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` (havuz "(55)", Opus 5.5 / high, sabitli, Remote Control açık — `get_session` ile ölçüldü 2026-10-02 ~05:17Z; planlanan worktree `newfork-wt/fb-6.7` ve dal `task/fb-6.7` o an henüz yoktu — ölçüldü; oturum kendi worktree'sinde `agitated-bartik-839c9b`); B — henüz yok   Branch: task/fb-6.7   Worktree: newfork-wt/fb-6.7   DB: `db.lock` (pgTAP, migration denemesi, e2e)
Reviewer: `nf-guvenlik` zorunlu (R3: yetki, RLS, grant kaldırma, nesne silme) — A ve B ayrı ONAY; `nf-gorsel-qa` (B, ekran teslim edilen şey); kullanıcıya ultrareview önerisi (yetki + grant + silme yüzeyi, büyük diff).

**Tazelik 2026-10-02 (koordinatör `local_abc4d126…`'ın ölçümü, `nf-planlama` alt ajanı salt okuma; rapor `docs/plan/research/FB-6.7-olcumler-2026-10-01.md`; kayıt oturumu `55591525`'te yeniden ölçtü — "ölçüldü" yazanlar): değişmiş.** FOUNDATION-B dilim satırındaki sayılar eskimiş:
1. Duyuru yetkisi üç eski yardımcıyla: `communication_actor_has_capability_service`, `communication_actor_has_all_locations_service`, `communication_actor_can_control_announcement_service` (üçü de migration'larda tanımlı — ölçüldü); 9 çağrı / 6 fonksiyon (`get_announcements_service` 3, `save_announcement_audience_service` 2, …; kaynak `docs/plan/research/FB-6.7-olcumler-2026-10-01.md` §1; FOUNDATION-B'deki "11 çağrı / 8 fonksiyon" eskidi).
2. `publish_announcement_service_legacy_notifications` duruyor (ölçüldü) — CLAUDE.md §9'un yasakladığı `_legacy` ad.
3. Önemli tarih: tarayıcı tabloya doğrudan yazıyor (kaynak `docs/plan/research/FB-6.7-olcumler-2026-10-01.md` §1); kapı `can_manage_important_date` (`supabase/migrations/20260914092711_bl051_roles_permissions.sql` — ölçüldü); web `apps/web/src/settings/ImportantDatesSettingsPage.tsx:81` `permissions.includes("important_dates.manage")` (ölçüldü) — §9'un yasakladığı biçim.
4. Settings → Important dates okuması lokasyona göre süzmüyor; KARARLAR Settings → manager S4 ve K6'ya aykırı (`read_settings_important_dates_service`; kaynak `docs/plan/research/FB-6.7-olcumler-2026-10-01.md` §1).
5. Üç bildirim pgTAP dosyası kırmızı: `notification_platform_core`, `notification_preference_resolver_and_producers`, `notification_settings_admin` (`supabase/tests/ci-not-green.txt:7-9` — ölçüldü; BL-368, BL-373). Resolver dosyası silinmiş `location_id` kolonuna yazıyor (kaynak `docs/plan/research/FB-6.7-olcumler-2026-10-01.md` §1). `account_notification_scope` zaten `ci-green.txt`'te (ölçüldü).
6. `known_gap` 3 satır (`supabase/tests/authorization_matrix.test.sql:843-850` — ölçüldü): `important-date-no-as-validation` bu dilimde silinir (3 → 2); `legacy-blank-location`'ın 4 eyleminden `legacy.communication_capability` çıkar (4 → 3); satırın kendisi FB-6.4'te silinir (K-1).
7. Akış 7 (FOUNDATION-B "Akışlar" 7) için e2e yok (`e2e/flows/` 17 dosya, duyuru / önemli tarih yok — ölçüldü).
8. BL-099 bayat — kapanmış (`BACKLOG.md`, "BL-099 (kapandı…" — ölçüldü); bitiş kriterinden çıkar.
9. Zamanlanmış duyuru saati gelince `scheduled` durumunda kalıyor, düzenlenebiliyor, okundu onayları silinmiyor (`save_announcement_audience_service`; kaynak `docs/plan/research/FB-6.7-olcumler-2026-10-01.md` §2).
10. Önemli tarihte `created_by` yok; `audit_events` yalnız işlem adını tutuyor; geçmişi gösteren ekran yok (`audit_important_date_change`; kaynak `docs/plan/research/FB-6.7-olcumler-2026-10-01.md` §2).

Goal: duyuru ve önemli tarihin yetkisi `app_private.authorize()` / `scope_set()` çekirdeğine taşınır, eski yardımcılar ve `_legacy` yolu silinir, Mert'in 2026-10-02 kuralları (K1–K6) veride, API'de ve ekranda uygulanır, üç kırmızı bildirim testi yeşile döner, akış 7 e2e ile kanıtlanır. Bir kişi için: Kadıköy müdürü Ayşe yalnız Kadıköy'e duyuru açar; owner'ın "Kadıköy + Erenköy" tarihini iki adla görür ama düzenleyemez; duyurunun metnini değiştirince herkes yeniden onaylar; önemli tarihte kimin neyi ne zaman değiştirdiği görünür.

In scope:
- **A — veri, yetki, kural** (önce `nf-db`, sonra `nf-backend`; `nf-test` akış 7):
  - Duyuru ve önemli tarih giriş noktaları çekirdeğe; üç `communication_actor_*` yardımcısı ve `publish_announcement_service_legacy_notifications` silinir, `retired_objects_stay_gone`'a eklenir.
  - Önemli tarih yazımı API / `*_service` üzerinden; tarayıcının doğrudan tablo yazımı ve grant'ı kalkar; `can_manage_important_date` silinir; web `permissions.includes` → `can()`.
  - K1: çok lokasyonlu ve workspace geneli kaydı yalnız admin / owner açar, düzenler, arşivler.
  - K2: alt rütbe üst rütbenin kaydını düzenleyemez; yazarın bugünkü rolü (KK-87).
  - K3: müdür başka müdürün kaydını yalnız o lokasyona atanmışsa görür, düzenler, arşivler, unpublish / republish eder.
  - K4: içerik değişince okundu onayları sıfırlanır; yalnız hedef değişince sıfırlanmaz (yeni kişilere bildirim); içerik aynıyken unpublish → republish onayları korur, yalnız okumamışlara bildirim.
  - K5: teslim = hedeflenen çalışanlar + o lokasyona atanmış müdürler + owner + admin'ler. Yazar kendi kaydının bildirimini almaz (KK-89; bugün yayınlayan kendi bildirimini alıyor — kaynak `docs/plan/research/FB-6.7-olcumler-2026-10-01.md` §1 ek bulgular).
  - K6: okuma lokasyon süzgeci (çok lokasyonlu kayıt öteki adlarla görünür; yalnız atanmadığı lokasyona ait kayıt görünmez; atanmadığı lokasyona tarih atanamaz). Arşivli lokasyon sayılmaz (KK-86).
  - Unpublish / republish durumları; zamanlanmış duyurunun saati gelince yayına geçmesi.
  - Önemli tarihte yazar ve değişiklik geçmişi (kim, ne zaman, eski → yeni değer).
  - Üç bildirim dosyası yeşil (sabit sayı yerine değişmez kural; silinmiş `location_id` yazımı kalkar); `known_gap` güncellemesi (madde 6).
  - Akış 7 e2e.
- **B — ekran** (`nf-arayuz`, A main'e girdikten sonra yeni `origin/main`'den): duyuru ve önemli tarihte Edit / Unpublish / Republish, içerik değişince yeniden onay isteğinin görünümü, önemli tarih History görünümü. ILKELER P04: önce gerçek uygulamada DEV'de query param ile 2–3 varyant, Mert seçer.

Out of scope:
- Bildirim platformunun geri kalanı (iki gelen kutusu, `_v2` / `_base` sürüm çözücüsü, tercih ekranları; ILKELER P13) — ayrı proje.
- ANN-001 kişiye özel hedefleme; BL-043, BL-044, BL-045, BL-046.
- `known_gap` `restricted-no-notifications` (FB-6.6); `legacy-blank-location` satırının silinmesi (FB-6.4, K-1).
- Besleme #92'nin backlog adayları: BL-530 (closed day ikizi), BL-531 (iş / departman hedefi), BL-532 (davet iptal bildirimi).

Done when:
1. `communication_actor_has_capability_service`, `communication_actor_has_all_locations_service`, `communication_actor_can_control_announcement_service` ve `publish_announcement_service_legacy_notifications` veritabanında yok ve `retired_objects_stay_gone` listesinde; duyuru ve önemli tarih giriş noktalarının ilk ifadesi `app_private.authorize()`; katalog sayaçları yalnız azaldı (`_legacy` dahil).
2. Önemli tarih tablosunda `authenticated` için yazma grant'ı yok; `can_manage_important_date` yok; `grep -c 'permissions.includes("important_dates' apps/web/src` = 0.
3. `notification_platform_core`, `notification_preference_resolver_and_producers`, `notification_settings_admin` `supabase/tests/ci-green.txt`'te, `ci-not-green.txt`'te değil; main CI `db` yeşil.
4. `known_gap`: `important-date-no-as-validation` yok (3 → 2); `legacy-blank-location` eylemleri 4 → 3 (`legacy.communication_capability` yok).
5. K1–K5 pgTAP ile kilitli (her biri en az bir olumlu ve bir olumsuz hücre; "hayır" = 42501 + `authz.*`): K1 müdürün çok lokasyonlu ve workspace geneli kaydı reddedilir, admin / owner açar; K2 müdür owner'ın kaydını düzenleyemez, rolü düşen yazarın kaydı bugünkü rolüne göre değerlendirilir; K3 aynı lokasyondaki müdür düzenler / arşivler / unpublish / republish eder, başka lokasyonun müdürü göremez; K4 içerik değişince onaylar 0, yalnız hedef değişince onaylar korunur, içerik aynıyken unpublish → republish onayları korur ve yalnız okumamışlara bildirim üretir; K5 alıcı listesi = hedef + o lokasyonun müdürleri + owner + admin; yazar listede yok (KK-89).
6. K6 pgTAP: Kadıköy müdürü yalnız Erenköy'e ait kaydı görmez; "Kadıköy + Erenköy" kaydını iki lokasyon adıyla görür; Erenköy'e tarih atayamaz; arşivli lokasyon sayılmaz.
7. Zamanlanmış duyuru saati gelince yayınlanmış duruma geçer; o andan sonra `scheduled` olarak düzenlenemez (pgTAP).
8. Önemli tarihte yazar ve her değişikliğin eski → yeni değeri, kim ve ne zaman bilgisiyle okunabilir (pgTAP).
9. Akış 7 e2e `e2e/flows/` altında yeşil (main CI e2e): müdür tek lokasyona duyuru açar, iki lokasyonlu çalışan görür ve onaylar, müdür başka lokasyonu hedefleyemez (K1), müdür hedefte olmasa da duyuruyu alır (K5).
10. B: Edit / Unpublish / Republish, yeniden onay isteği ve History görünümü main'de; Mert'in seçtiği varyant; `nf-gorsel-qa` ONAY; masaüstü + telefon ekran görüntüsü.
11. `nf-guvenlik` ONAY @<sha> (A ve B); migration'lar canlıda KARARLAR OPS-03 sırasıyla (ekleyen önce canlı, silen / grant kaldıran önce main), kullanıcı onayıyla; Supabase güvenlik danışmanında yeni tür bulgu yok.
12. FOUNDATION-B ve ILERLEME kayıtları; Notes / Result'ta kanıtlar (komut + sonuç, sha, CI koşusu).

Touches:
- A: `nf-db` → `supabase/migrations/` (yeni), `supabase/tests/notification_platform_core.test.sql`, `notification_preference_resolver_and_producers.test.sql`, `notification_settings_admin.test.sql`, `authorization_matrix.test.sql` (`known_gap`), `retired_objects_stay_gone.test.sql`, yeni duyuru / önemli tarih pgTAP dosyası, `ci-green.txt`, `ci-not-green.txt`. `nf-backend` → `apps/api` duyuru ve önemli tarih rotaları, `packages/shared` tipleri, web veri katmanı (önemli tarih hook'ları, `can()`). `nf-test` → `e2e/flows/` akış 7.
- B: `nf-arayuz` → duyuru ekranları ve `apps/web/src/settings/ImportantDatesSettingsPage.tsx` görünümü (+ ilgili testler).
- Sıra (CLAUDE.md §4): A'nın veri + çalışan ekran kısmı main'e girer, sözleşme (tip, hook, durumlar) yazılı verilir; B yeni `origin/main`'den.

Test plan: her migration önce tek transaction + rollback ile ortak yerel DB'de; `pnpm.cmd test:db` (`db.lock`) — üç bildirim dosyası, matris, `retired_objects_stay_gone` ve yeni dosya yeşil, başka dosya kırmızıya dönmez; API ve web için ilgili vitest, `typecheck`, `lint`; akış 7 ve etkilenen e2e (`db.lock`); push öncesi tam kapı (lint, typecheck, test, build) + `test:db`; B'de masaüstü + telefon ekran görüntüsü.

Risk: R3 — yetki çekirdeği, RLS, grant kaldırma, nesne silme. Grant önce kalkarsa tarayıcının bugünkü doğrudan yazımı kırılır: önce API yolu, sonra grant (OPS-03: ekleyen önce canlı, silen / grant kaldıran önce main — iki aşama). K4'te onayların sıfırlanması bilinçli; e2e ile kanıtlanır. Tahmin 1–1,5 kişi-hafta (koordinatörün; ölçülmedi); puan 10 (orta nokta 1,25 × 8; KK-88). Tazelikteki ve kenar durumlarındaki kod satırlarının kaynağı `docs/plan/research/FB-6.7-olcumler-2026-10-01.md`; kayıt oturumu raporun satırlarını tek tek yeniden ölçmedi (yalnız tazelikte "ölçüldü" yazanları).

## Notes / Result
- 2026-10-02 (kayıt oturumu `local_43ff0725…`, koordinatör beslemesi #92 eki; taban `55591525`): görev dosyası açıldı. Koordinatörün tazelik raporu dosya olarak bulunamadı (worktree ve geçici klasörde yalnız repo kopyaları ve SQL sorguları vardı); maddeleri beslemeden aldım, kodda ölçebildiklerimi "ölçüldü" diye işaretledim. FOUNDATION-B akış 7 tanımı (`:153`) K1 ile çelişiyordu ("yönetici kendi lokasyon(lar)ına"), aynı commit'te düzeltildi.
- 2026-10-02 (kayıt oturumu `local_43ff0725…`, koordinatörün #92 eki cevabı; taban `7667a5d6`): koordinatörün üç raporu (tazelik, kod kenar durumları, rakip araştırması) repoya alındı: `docs/plan/research/FB-6.7-olcumler-2026-10-01.md` (içerik aynen). Tazelikteki "koordinatörün" maddelerine kaynak gösterildi. Puan 5 → 10 (KK-88); yazar kendi kaydının bildirimini almaz (KK-89).
- 2026-10-02 (kayıt oturumu `local_43ff0725…`, koordinatör beslemesi #93): A başladı — işçi oturumu "FB-6.7 A: Duyuru ve önemli tarih yetkisi + kuralları" `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` (havuz "(55)", Opus 5.5 / high, sabitli, Remote Control açık — `get_session` ile ölçüldü 2026-10-02 ~05:17Z; planlanan worktree `newfork-wt/fb-6.7` ve dal `task/fb-6.7` o an henüz yoktu — ölçüldü; oturum kendi worktree'sinde `agitated-bartik-839c9b`). Havuzda boş oturum kalmadı (koordinatörün aktardığı).
