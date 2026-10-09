DENETİM SONUCU: BULGU VAR (kritik 0, yüksek 0, orta 3, düşük 3). Ölçülen commit `6e7ac0dd` (`origin/main`, plan-ekran-07 worktree'si). Yerel DB son migration `20261007130000`, repo ile aynı.

# B — Announcements: güvenlik ve kod incelemesi (EKRAN-07, 2026-10-06, `6e7ac0dd`)

**DENETİM SONUCU: BULGU VAR (kritik 0, yüksek 0, orta 3, düşük 3).**

- **Başka workspace'e giden yol yok.** Başka bir workspace'in duyurusuna, lokasyonuna ya da alıcı listesine ulaşan bir yol bulmadım.
- **Müdür yalnız kendi lokasyonunun kaydına yazabiliyor (M2).** Tek ve canlı lokasyonlu kayıt lokasyon kapsamıyla soruluyor. Çok lokasyonlu ya da workspace geneli kayıt yalnız admin ve owner'ın (K1). Başka lokasyonun müdürü taslağı görmüyor (K3).
- **Rütbe kuralı tutuyor (K2).** Alt rütbe üst rütbenin kaydını düzenleyemiyor. Workspace'ten ayrılan admin ya da owner'ın kaydı yalnız admin ve owner'a açık, yazarı bilinmeyen kayıt da öyle. Bu kapalı yönde çalışıyor (fail-closed: bilgi eksikse izin yok).
- **Orta bulgular üç tane.** Zamanlanmış duyuru, kurulduktan sonra yetkisini kaybeden kişinin adıyla yine yayınlanıyor (B1). Hiç yayınlanmamış taslak yazanından başkasına da görünüyor (B2). İçerik değişince okundu onayları sorulmadan ve geri dönüşsüz siliniyor (B4).
- **Kod henüz yeni kuralları uygulamıyor.** B2–B5, Mert'in 2026-10-04/05'te koyduğu K19–K27 kurallarının kodda henüz olmamasından geliyor. FB-6.7'nin duyuru kısmı "yeniden planlanacak" durumunda (`docs/plan/tasks/FB-6.7.md:2`). Bunlar gerileme değil; burada güvenlik ve veri sonuçları yazılı.

## Kapsam ve sınır
- **İçeride:**
  - Sol menü → Announcements (`/app/announcements`, `/app/announcements/:id`, `apps/web/src/views/AnnouncementsPage.tsx`) ve rota kapısı (`App.tsx:435-449`).
  - Yazma, düzenleme, yayın, yeniden yayın, Unpublish, Archive, Restore, Acknowledge.
  - Dakikalık zamanlanmış yayın işi (`cron` `announcements-due` → `app_private.announcement_release()`).
  - API uçları (`apps/api/src/communications/communication-routes.ts:83-178`).
  - 5 servis ve 11 `app_private` yardımcısı; `announcements`, `announcement_locations`, `announcement_acknowledgements` tabloları.
  - Bildirimin kanalı (`account_notification_items` realtime).
- **Sınırda:**
  - Workspace ana sayfasındaki Announcements kutusu (`get_workspace_dashboard_service`; görünürlüğü doğru, `get_announcements_service`'i çağırıyor).
  - Notifications gelen kutusu, Important Dates.
- **Dışarıda:** görsel tasarım, sayfalama (BL-787).

## Temiz olanlar (kanıtlı)
- **Tablolar kapalı.**
  - Üç duyuru tablosunda satır erişimi (RLS) açık.
  - Tarayıcı oturumunun (`anon` / `authenticated`) hiçbir izni ve hiçbir politikası yok; erişim yalnız `postgres` ve `service_role`'de (`pg_class.relacl`).
  - Hiçbiri canlı kanala (realtime) yayınlanmıyor. Yayınlanan tek tablo `account_notification_items`. Onun kanalı özel; konu `account-notifications:<uuid>` ve `rls_can(..., 'account.self', ...)` ile korunuyor.
- **Fonksiyonlar kapalı.**
  - 5 `public` servisin hepsi SECURITY DEFINER, arama yolu boş (`search_path=""`), yalnız `service_role` çalıştırabiliyor.
  - 11 `app_private` yardımcısını yalnız `postgres` çalıştırabiliyor.
  - Hiçbirinde `auth.uid()`, `request.jwt` ya da eski kapı (`service_actor_has_permission`) yok (SELECT: 0 satır).
- **API'de rota-yerel kapı yok.** Dört uç yalnız `resolveActor` + zod; kararı servis çekirdeğe soruyor.
- **Katalogda sınıflı.**
  - 5 servis `authorization_coverage.test.sql`'de sınıflı (`:22`, `:80`, `:165`, `:206`, `:235`).
  - Eski `cancel_announcement_service` ve kardeşleri `retired_objects_stay_gone.test.sql:316-318`'de.
  - Ekranda ikiz ya da eski fonksiyon kalmamış.
- **Tenant izolasyonu tutuyor.**
  - Her sorgu `workspace_id` ile süzülüyor.
  - Başka workspace'in lokasyon kimliği `live_locations(w, …)`'den düşüyor ve `communication_authorize` onu `authz.out_of_scope` ile reddediyor.
  - Departman ve iş kimlikleri workspace içinde doğrulanıyor.
  - Arşivli lokasyon kaydı bütün workspace'e genişletmiyor (KK-86).
- **"Hayır" sözleşmesi tutuyor.**
  - Bilinmeyen duyuru da kapsam dışı duyuru da aynı `42501 authz.out_of_scope` cevabını alıyor.
  - Görünürlük, revizyon kontrolünden önce soruluyor; "var ama eski sürüm" bilgisi sızmıyor.
  - Üye olmayan `authz.not_member` (API'de 404) alıyor.
- **Link güvenli.** Duyurudaki link (`action_url`) üç katmanda zorlanıyor: zod `^/app`, DB CHECK ve web'de `safeAppActionUrl` (köken + yol normalize). Ekranda `dangerouslySetInnerHTML` yok.
- **Web düğmeleri sunucuya soruyor.** `can_edit`, `can_publish` ve benzeri bayraklar sunucudan geliyor.

## Bulgular

### B1 — Orta — Zamanlanmış duyuru, yayın anında yetki sorulmadan çıkıyor
- **Ekranda nerede:** Announcements → duyuru → Publish (ileri tarihli, "Scheduled") → dakikalık iş yayınlıyor.
- **Ne görüldü:**
  - `app_private.announcement_release` zamanı gelen duyuruyu doğrudan `published` yapıp alıcılara gönderiyor; yazanın ya da zamanlayanın o anki yetkisine hiç bakmıyor.
    - `supabase/migrations/20261005000000_closed_days_reach_the_shifts.sql:794-830`; canlı tanım da aynı.
  - `announcements`'a yazan yalnız 4 fonksiyon var: release, save, publish ve set_state (SELECT `prosrc ~ 'update public.announcements'`). Rol düşürme ya da işten çıkarma zamanlanmış duyuruya dokunmuyor.
  - Listedeki "not_allowed" hata kodu (KK-98) bugün yalnız testin elle kurduğu tetikleyiciyle oluşuyor (`supabase/tests/past_dates_and_ended_announcements.test.sql:258-277`). Gerçek bir çekirdek reddi yok.
- **Ne beklenirdi:** yayın anında çekirdeğe yeniden sorulması. K22 der ki: "rütbesi yayın anındaki rolüdür". Ayrıca CLAUDE.md §9 fail-open yasağı.
- **Örnek:** Kadıköy müdürü Ayşe "Yeni menü" duyurusunu Cuma 09:00'a kurar. Perşembe owner Zeynep Ayşe'yi çalışana düşürür, ya da Ayşe işten çıkar. Cuma 09:00'da duyuru Kadıköy ekibine Ayşe'nin adıyla gider ve bildirim atılır.
- **İşaret:** `leave: medium / do: moderate`. **Eşleşme:** YENİ.

### B2 — Orta — Hiç yayınlanmamış taslak, yazanından başkasına görünüyor ve onlar tarafından yayınlanabiliyor (K19)
- **Ekranda nerede:** Announcements listesi → "Draft" sekmesi; duyuru penceresi → Publish / Archive.
- **Ne görüldü:**
  - `announcement_visible`, kişi kaydı düzenleyebiliyorsa durumuna bakmadan "görünür" diyor (`20261004000000_…:669-682`; `:679`).
  - Liste de aynı kuralla süzülüyor: `where control.allowed or …` (`20261005000000_…:1086`). Taslakta `can_publish` açık (`:1065`).
  - Sonuç: owner, admin ve aynı lokasyonun öteki müdürü başkasının taslağını görüyor, düzenliyor, yayınlıyor, arşivliyor.
- **Ne beklenirdi:** K19, "Hiç yayınlanmamış taslak yalnız oluşturanındır, başkası (owner dahil) görmez."
- **Örnek:** KadıköyMüdür1 yarım bir "Saat ücreti değişiyor" taslağı yazar. Owner Zeynep ve KadıköyMüdür2 onu listede görür; KadıköyMüdür2 Publish'e basıp yarım metni ekibe gönderebilir.
- **İşaret:** `leave: medium / do: risky`. Görünürlük kuralı çekirdekte; düzenleme, yayın ve onay aynı fonksiyonu kullanıyor.
- **Eşleşme:** YENİ (FB-6.7 duyuru veri yeniden planına).

### B4 — Orta — İçerik değişince okundu onayları sorulmadan ve geri dönüşsüz siliniyor (K27, K26)
- **Ekranda nerede:** Announcements → yayındaki duyuru → başlık ya da metin düzeltilip kaydediliyor.
- **Ne görüldü:**
  - İçerik değişince `save_announcement_audience_service` onay satırlarını siliyor: `delete from public.announcement_acknowledgements` (`20261005000000_…:961`).
  - Geriye yalnız kişi kimlikleri kalıyor (`acknowledged_before`, `:958`). Kimin ne zaman onayladığı kayboluyor; geçmiş tablosu yok.
- **Ne beklenirdi:**
  - K27 (genişlemiş hâli): onaylayan varsa yayınlayana "onaylar kalsın / sıfırlansın" sorulur.
  - K24 / K26: eski onay History'de kalır.
- **Örnek:** Zeynep, 20 kişinin onayladığı duyurudaki tek harflik yazım hatasını düzeltir. 20 onay ve saatleri sessizce silinir, herkes yeniden onaylamak zorunda kalır, Zeynep'e bir şey sorulmaz.
- **İşaret:** `leave: medium / do: moderate`. **Eşleşme:** YENİ (FB-6.7 duyuru yeniden planı).

### B3 — Düşük — "Yalnız çalışanlar" hedefli duyuru müdüre, admin'e ve owner'a da gidiyor (K5 duyuru eki, K24)
- **Ne görüldü:** `communication_reaches` rol süzgecinden önce "o lokasyonu yönetiyor mu" diye bakıyor (`20261004000000_…:433-434`).
- **SELECT kanıtı:** yerel bir duyuruyu `array['employee']` hedefiyle hesapladım; alıcılar 1 owner, 1 admin, 2 müdür, 3 çalışan çıktı.
- **Etkisi:** bu kişiler kaydı zaten okuyabildiği için sızıntı değil. Ama bildirim gürültüsü yaratıyor ve alıcı sayısını şişiriyor.
- **İşaret:** `leave: low / do: moderate`. **Eşleşme:** YENİ (FB-6.7 yeniden planı).

### B5 — Düşük — Onay sayımı K22'ye uymuyor; sayı çalışana da gidiyor
- **Ne görüldü:**
  - Sunucu, kaydı görebilen herkesin onaylamasına izin veriyor: yazarın kendisi, owner, eş müdür (`20261004000000_…:1027-1049`).
  - `acknowledged_count` herkesi sayıyor ve her okuyana dönüyor (`20261005000000_…:1055`). Alıcı sayısı (`recipient_count`) yalnız yazabilene gidiyor.
  - Yerel ölçüm: müdürlerin yazdığı 15 duyurunun alıcıları arasında 15 owner, 15 admin ve 10 eş müdür var. K22'ye göre bunlar onaydan sorumlu değil ama paydaya giriyorlar.
  - Bugün web sayıyı göstermediği için sorun gizli duruyor.
- **İşaret:** `leave: low / do: moderate`. **Eşleşme:** BL-675 (değişmiş: sorun yalnız düğmede değil, sunucuda da var).

### B6 — Düşük — Web'in kapısı ile sunucunun kuralı ayrışıyor
- **Ne görüldü:**
  - Web, sayfayı izin anahtarına bakarak açıyor: `permissions.includes("announcements.read")`. Yerleri: `App.tsx:437`, `:445` (`PermissionRoute.tsx:56`), `AppShell.tsx:158`, `EmployeeDashboard.tsx:425`, `EmployeeMobileNav.tsx:77`.
  - Çekirdekte `announcement.read` izin anahtarı taşımıyor; her aktif üye okuyabiliyor.
  - Settings → Roles & permissions → Announcements "None" yapılan özel rol (yerelde "Floor lead", "Shift lead"; aktif üyesi 0) menüyü ve sayfayı görmüyor.
  - Ama API listeyi veriyor, bildirim de gidiyor; bildirim linki kişiyi sayfaya düşürmeden ana sayfaya yönlendiriyor.
- **Etkisi:** ayar söylediğini yapmıyor.
- **Karar gerekiyor (Mert ya da koordinatör):** duyuru okumak rolden kapatılabilir mi?
  - Evet ise: sunucu izni sormalı.
  - Hayır ise: ayar kalkmalı, web `can('announcement.read')` kullanmalı.
- **İşaret:** `leave: low / do: moderate`. **Eşleşme:** BL-176 (değişmiş: duyuru özelinde yeni yüzü).

## Güvenlik dışı kural farkları (D raporu ve FB-6.7 planı için)
- Hiç yayınlanmamış taslak arşivlenebiliyor, silinemiyor (K19). Eşleşme: BL-543.
- Zamanlanmış ama hiç çıkmamış duyuru Unpublish ile "Unpublished" oluyor ve paylaşımlı hâle geliyor (`20261004000000_…:987`; K19 / K8).
- Sunucu geçmiş yayın tarihini reddetmiyor (K20).
- Onay anahtarı yok (K22). Kişi listesi hedefi yok (K24). History yok (K26). Eşleşme: BL-675, BL-678.

## Sınırda
- BL-564: ana sayfa kutusu arşivli ve süresi dolmuş duyuruyu gösteriyor. Görünürlük doğru.
- BL-539: daraltma ile gönderici arasındaki yarış.
- Notifications politikası `account_notification_self_read` doğrudan `auth.uid()` kullanıyor (var olan; yeni değil).
- `project_notification_inbox_exchange_base` adında `_base` var (sayaç).

## Öneri
- Liste okumak yayın işini tetikliyor: her üyenin listeyi açması `announcement_release` çalıştırıp bildirim kuyruğuna yazıyor. Yayını yalnız dakikalık işe bırakmak okumayı salt okuma yapar ve B1 düzeltmesini tek yerde tutar.
- `author_user_id` çalışana gerekmiyor.
- **Rol hafızası:** "ertelenen eylem (cron) yürütme anında yetkiyi yeniden soruyor mu" maddesi kontrol listesine girmeli. Görev "dosya yazma yok" dediği için yazmadım.

## Kanıt
Hepsi salt okuma. Yerel DB'ye `docker exec … psql` ile, `default_transaction_read_only=on` ile bağlandım.
- `git rev-parse HEAD` → `6e7ac0dd`; DB `max(version)` = `20261007130000` (repo ile aynı).
- `pg_proc`: duyuru fonksiyonlarının `prosecdef`, `proconfig`, `proacl` değerleri ve `pg_get_functiondef` ile 14 fonksiyonun canlı tanımı.
- `pg_class.relacl`, `pg_policies`, `pg_publication_tables`: tablo izinleri, politikalar, realtime.
- `app_private.authz_actions`: `announcement.*` satırları (`read` izin anahtarsız; `write` yer kapsamı, `write_wide` org kapsamı, ikisinde de `outranked_no`).
- `cron.job`: `announcements-due` her dakika `announcement_release()`.
- B3: `communication_audience(..., array['employee'], ...)` → owner 1 / admin 1 / manager 2 / employee 3.
- B5: alıcı rolleri, müdür yazarında → owner 15, admin 15, manager 10, employee 45.
- B6: `workspace_roles` içinde `announcements.read` taşımayan 2 rol (1.941 rolden).
- Test koşmadım (görev gereği). Testlerdeki ilgili satırları okudum.

Dosyalar:
- `C:\Users\TheWe\Documents\Codex\newfork-wt\plan-ekran-07\supabase\migrations\20261004000000_announcements_and_dates_ask_the_core.sql`
- `C:\Users\TheWe\Documents\Codex\newfork-wt\plan-ekran-07\supabase\migrations\20261005000000_closed_days_reach_the_shifts.sql`
- `C:\Users\TheWe\Documents\Codex\newfork-wt\plan-ekran-07\apps\api\src\communications\communication-routes.ts`
- `C:\Users\TheWe\Documents\Codex\newfork-wt\plan-ekran-07\apps\web\src\views\AnnouncementsPage.tsx`
- `C:\Users\TheWe\Documents\Codex\newfork-wt\plan-ekran-07\apps\web\src\auth\PermissionRoute.tsx`
- `C:\Users\TheWe\Documents\Codex\newfork-wt\plan-ekran-07\supabase\tests\past_dates_and_ended_announcements.test.sql`
