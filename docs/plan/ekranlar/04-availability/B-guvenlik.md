# B — Availability güvenlik ve kod incelemesi (EKRAN-04, 2026-10-06, b5fabb27)

**DENETİM SONUCU: BULGU VAR (kritik 0, yüksek 0, orta 0, düşük 6).** Başka bir workspace'in ya da başka bir lokasyonun müsaitliğine giden bir yol bulmadım. Müdür, çalışanın haftasını hiçbir yoldan değiştiremiyor. Bunu yerel DB'de 8.000'i aşkın müdür–kişi çiftinde ölçtüm. Manager note yalnız `employee` rolündeki kişi için yazılıp okunabiliyor. Not, çalışanın kendi ekranlarına ve Schedule'da notu okuyamayan birine ulaşmıyor. Bulguların altısı da düşük önemde. Dördü backlog'da zaten duruyor ve bugün de geçerli. İkisi yeni.

Kapsam ve sınır:
- **İçeride:**
  - `/app/availability` (Team availability), `App.tsx:388-397`.
  - API'de `GET …/availability/weekly/team`, `GET/POST …/availability/weekly`, `GET/POST …/availability/weekly/settings`, `GET/POST /v1/me/onboarding/availability/weekly`.
  - DB'de `weekly_team_read_service`, `weekly_preferences_read_service` ve `weekly_preferences_save_service`, `weekly_preference_settings_read_service` ve `weekly_preference_settings_save_service`, `app_private.weekly_preference_may_write`, `weekly_preference_manager_scope`, `validate_weekly_preference_command`, `app_private.availability_follows_role`.
  - Settings → Scheduling'deki müsaitlik giriş modu.
- **Sınırda:**
  - `POST …/availability/shift-assessment`, yani Schedule'ın yazarkenki uyarı kutusu.
  - `app_private.schedule_week_availability`: Schedule okuma modeli, düzenleme oturumu ve çalışan panosu.
  - Employees çekmecesindeki Availability bölümü.
  - Çalışanın kendi My availability ekranı.
- **Dışarıda:** takas ve cover rızası (M6, FB-6.4), preflight (M9).

## Özet
- **Tenant izolasyonu temiz.**
  - Müsaitliğin altı tablosunda satır erişimi (RLS) açık: `employee_weekly_preferences`, `manager_weekly_reminders`, `weekly_preference_events`, `weekly_preference_commands`, `weekly_preference_type_defaults`, `schedule_availability_overrides`. Hiçbirinde tarayıcı oturumunun (`anon` / `authenticated`) yetkisi yok.
  - Ekranın yedi `*_service` fonksiyonu yalnız `service_role` ile çalışıyor. Hepsi SECURITY DEFINER ve arama yolları boş (`search_path=""`). `app_private` yardımcılarına kimse dışarıdan erişemiyor.
- **Yetki çekirdek üzerinden geçiyor.**
  - Okuma, yazma, not ve ayar kararlarının hepsi `app_private.authorize` / `authz_reason` / `scope_set` ile veriliyor.
  - Altı kural var: `availability.own`, `availability.team_read`, `availability.team_write`, `availability.note_read`, `settings.availability.read`, `settings.availability.write`.
  - DB'de satır içinde ayrı bir yetki mantığı yok.
- **M2 ve "müdür yazamaz" ölçüldü ve tutuyor (yerel DB, SELECT, aşağıdaki sorgu):**
  - Ortak lokasyonu olmayan 1.846 çiftte okuma, not ve yazma 0.
  - Ortak lokasyondaki 3.196 müdür–çalışan çiftinde okuma 3.060, not 3.060, not yazma 3.060. Çalışanın haftasını yazma (`availability.own`) 0.
  - Müdür–müdür, müdür–admin ve müdür–owner çiftlerinde okuma var (KARARLAR "okuma = bildirim alıcıları"), not ve yazma 0.
- **Notun çalışana ve okuyamayana ulaşmadığı kodla doğrulandı:**
  - Çalışanın panosu `with_reminders=false` ile okuyor (`get_employee_schedule_board_service`).
  - Schedule okuma modeli not metnini ve saatlerini yalnız `availability.note_read` geçene veriyor.
  - Uyarı kutusu (`assess_weekly_schedule_assignment_service`) not saatlerini ve "note" gerekçesini okuyamayandan siliyor.
- **M8 kodda:** Settings'te müsaitlik için Warn / Block ayarı yok. DB'de böyle bir kolon kalmamış.
- SQL sızması ya da XSS bulmadım; bu ekranda `dangerouslySetInnerHTML` yok. Log'a kişisel veri yazılmıyor, ekrana ham DB hata metni de çıkmıyor.
- **Web:** Availability ekranı ve `availability/` klasöründe `permissions.includes` yok. Çekmeceyi açma `can(context, "employee.read")` ile yapılıyor (`AvailabilityPage.tsx:82`). Rota korumasının kendisi hâlâ izin listesine bakıyor; bu BL-176.

## 1. Bulgular (önem sırasıyla)

### D1. Terfide not siliniyor ama metninin kopyaları kalıyor (Düşük)
- **Ekranda nerede:** Availability → kişi → Manager note. Görünür bir iz yok, kopyalar yalnız veritabanında.
- **Örnek:**
  - Ayşe, Ali için "School mornings" notunu yazıyor.
  - Ali Kadıköy müdürü yapılıyor. Not kaydı (`manager_weekly_reminders`) siliniyor.
  - Notun önceki ve sonraki hâli `weekly_preference_events`'te (source `manager`) kalıyor. Gönderilen komut, metniyle birlikte `weekly_preference_commands`'ta kalıyor.
- **Neden oluyor:** tetikleyici geçmişi ve komutları yalnız `source = 'employee'` ile siliyor (`supabase/migrations/20261007010000_availability_writes_ask_the_core.sql:587-590`). Test de yalnız çalışanın kendi kaydını kontrol ediyor (`supabase/tests/availability_follows_role.test.sql:87-88`, `:123`).
- **Kanıt (SELECT):**
  - Bugün employee olmayan kişiler hakkında 4 not geçmişi satırı ve 4 komut satırı var (Alejandro, admin, 2026-09-26). Bunlarda notlar boş.
  - DB genelinde metinli not komutu 21 tane.
  - Bu tabloları okuyan bir servis yok. `weekly_preference_events`'e yalnız ayar kaydı yazıyor.
- **Etkisi:** kimse göremiyor. Ama KARARLAR "kalıcı olarak silinir, gizlenmez" ve M14 tam karşılanmıyor.
- **BL eşleme:** **BL-569, geçerli** (2026-10-06, `b5fabb27`).
- **İşaret:** leave: low / do: safe. Tetikleyiciden `source` süzgeci kalkar; aynı teste "not geçmişi de gider" hücresi eklenir.

### D2. Müdür, daveti kabul edilmemiş bir admin ya da müdür adayına not yazabiliyor (Düşük)
- **Ekranda nerede:** Availability → davetli kişi → çekmece → Availability → Manager note.
- **Örnek:**
  - Owner, Selin'i Kadıköy'e admin olarak davet ediyor. Selin henüz kabul etmedi.
  - Ayşe, Selin için not yazabiliyor ve okuyabiliyor. Okuma cevabında not bölümü (`manager`) de geliyor.
  - Selin kabul edince tetikleyici notu siliyor. Arada kalan süre kurala aykırı ("kişi manager ise not bölümü hiç yoktur").
- **Neden oluyor:**
  - `app_private.ranks_as_employee`, üyeliği olmayan kişiyi `employee` sayıyor (`coalesce(…, true)`).
  - `authz_check` içindeki `employee_target` kontrolü bu fonksiyona dayanıyor (`20261007010000:139` civarı, "ponytail: somebody without a membership yet ranks as an employee").
- **Kanıt (SELECT):**
  - Üyeliği olmayan hedeflerle 92 müdür–kişi çiftinde `availability.team_write` serbest.
  - Bugün bekleyen admin ya da müdür daveti 0: bekleyen 20 davetin hepsi `employee`. Durum yerel DB'de kurulamadı; bulgu koddan.
- **BL eşleme:** **BL-773'ün müsaitlik yüzü** (aynı kök, Employees E3-31). Ayrı madde açmaya gerek yok; BL-773'ün düzeltmesi bunu da kapatır. Düzeltme sonrası `availability.team_write` için bir hücre eklenmeli.
- **İşaret:** leave: low / do: risky (yetki çekirdeği).

### D3. Tek lokasyonu arşivlenen kişi, owner dahil herkesin Team availability listesinden kayboluyor (Düşük)
- **Ekranda nerede:** Availability listesi.
- **Örnek:**
  - Beşiktaş arşivleniyor. Yalnız Beşiktaş'ta çalışan Emre'nin atamasına dokunulmuyor (`save_employee_service` arşivli lokasyondaki atamayı bırakıyor).
  - Owner Availability'yi açıyor ve Emre listede yok. "Lokasyonsuz" sayılıp gösterilmesi beklenirdi.
- **Neden oluyor:**
  - `weekly_team_read_service`, kişiyi canlı bir kapsam lokasyonunda ataması varsa gösteriyor.
  - Org genelinde bakan biri için ikinci şart "hiç aktif ataması yok". Arşivli lokasyondaki aktif atama bu şartı bozuyor.
  - Konum: `supabase/migrations/20260925173926_schedule_asks_the_core.sql:2087-2097`.
  - Çekirdek, arşivli lokasyonu "hiçbir yerde sayılmaz" diye kabul ediyor (`20261003000000_an_archived_location_counts_nowhere.sql`). Liste bu kurala uymuyor.
- **Kanıt:** kod satırları. Yerel DB'de böyle bir kişi bugün yok (SELECT 0 satır), bu yüzden ekranda denenmedi.
- **Etkisi:** veri kaybı ya da sızıntı yok. Owner o kişinin müsaitliğini bu ekranda göremiyor; Employees çekmecesinden açabiliyor.
- **BL eşleme:** **YENİ.** BL-423 ile aynı aile: satır içinde arşiv süzgeci.
- **İşaret:** leave: low / do: safe. Kırmızı pgTAP: "lokasyonu arşivlenen kişi owner'ın listesinde lokasyonsuz görünür".

### D4. Team availability rotası izni kendi içinde de soruyor (Düşük)
- **Nerede:** `apps/api/src/availability/weekly-preferences-routes.ts:56` (`permissions.includes("availability.read")`), 2026-09-14'ten beri.
- **Etkisi:** fail-open değil. Arkasındaki servis çekirdeğe ayrıca soruyor. Ama kural iki yerde duruyor (CLAUDE.md §9).
- **BL eşleme:** **BL-565, geçerli** (satır 54 → 56 kaydı).
- **İşaret:** leave: medium / do: moderate (maddedeki gibi).

### D5. Uyarı kutusu ucu, üye olmayana 404 yerine 403 veriyor (Düşük, sınırda: Schedule)
- **Nerede:** `apps/api/src/availability/availability-routes.ts:45`. Üye değilse 403 "Workspace access required" dönüyor. Aynı dosya ailesindeki haftalık uçlar 404 veriyor (`weekly-preferences-routes.ts:27-29`).
- **Örnek:** başka bir workspace'in kimliğiyle Schedule uyarısı istenirse "bu workspace var ama size kapalı" anlamında cevap dönüyor. §9 sözleşmesinde `authz.not_member` 404 olmalı.
- **BL eşleme:** **YENİ.** Aynı metin API'de 3 yerde geçiyor; G11 ailesi.
- **İşaret:** leave: low / do: safe.

### D6. "Employee olmayana hafta yazılamaz" kuralının DB kısıtı yok; terfiyle kayıt aynı anda olursa açık kalıyor (Düşük)
- **Örnek:**
  - Ali haftasını kaydediyor. Kayıt yetki kontrolünü geçmiş ama henüz yazmamışken owner Ali'yi müdür yapıyor.
  - Terfi tetikleyicisi siliyor. Ardından Ali'nin kaydı yazılıyor ve müdürün haftası kalıyor (M13/M14 bozuluyor).
- **Neden oluyor:** kayıt `availability_lock_workspace` ile kilitleniyor, terfi tetikleyicisi bu kilidi almıyor. Tablolarda yalnız biçim kısıtları var (`*_preference_check`, `*_revision_check`).
- **Kanıt:** `pg_constraint` / `pg_trigger` SELECT. Yarış koşturulmadı, salt okuma.
- **BL eşleme:** **BL-567, geçerli.** Yarış, maddeye ek gerekçe olarak yazılmalı.
- **İşaret:** leave: low / do: moderate.

## 2. Bugün de geçerli olan backlog maddeleri (tazelik 2026-10-06, `b5fabb27`)
- **BL-153, geçerli.** Terfi tetikleyicisi (`availability_follows_role`) yalnız `workspace_memberships`'te. `employee_profiles.user_id` bağlanma yolu açık (`pg_trigger` SELECT).
- **BL-568, geçerli.** Employee olmayanlara ait kapanmış onboarding'lerde 653 eski "Availability" adımı duruyor (SELECT; hepsi `approved` vakalarda).
- **BL-176, geçerli (genel).** `/app/availability` rotası `PermissionRoute anyOf={["availability.read"]}` ile korunuyor. İzin listesine bakan istemci kapısı; sunucu ayrıca karar veriyor.

## 3. Kanıtlanamayanlar (D raporuna ya da Schedule turuna)
- **Düzenleme oturumu ve okuma modeli** `schedule_week_availability`'yi notlar dahil (`with_reminders` varsayılanı `true`) çağırıyor. Fonksiyonun "broken" adımı kişiyi, kendi işareti ya da notu okunamazsa "unknown" sayıyor. Bu durumda geçersiz bir not, çalışanın gerçek işaretini de gizleyebilir (M12: not müsaitliğe girmez). Geçersiz not kurulabiliyor mu, ölçülmedi.
- **`schedule_availability_overrides` hâlâ yazılıyor.** `prepare_weekly_schedule_assignment` ve `record_weekly_exchange_acceptance` yazıyor; son satır 2026-09-22. M9 "kabul" kavramını kaldırdı; yol ölü mü, ölçülmedi. Schedule ekranının konusu.
- **Notu okuyamayan, `schedule.edit` sahibi bir müdür** (özel rol: `availability.read` yok), uyarı cevabındaki `operation` alanından notun varlığını çıkarabilir. Not metni ve saatleri siliniyor. Bugün böyle bir rol yok (SELECT: `availability.read` olmadan `availability.manage` taşıyan rol 0).

## Öneri (zevk)
- `weekly_assignment_candidate_base` adı `_base` ekiyle duruyor. Eski bir ad; §9 yeni eklemeyi yasaklıyor, var olanı değil. İkiz değil, tek çağıranı `weekly_assignment_candidate_check`.

## Kanıt (çalıştırılanlar; yalnız git ve SELECT, test koşturulmadı)
- `git -C …/plan-gece fetch -q` ile `origin/main` = `b5fabb27`. İnceleme `9e390950`'da başladı; arada müsaitliğe dokunan dosya yok (`git diff --name-only`: yalnız bir undo migration'ı ve testi).
- Fonksiyon listesi, SECURITY DEFINER, `search_path` ve `anon` / `authenticated` / `service_role` yürütme yetkisi: `pg_proc` + `has_function_privilege`. Bütün `*_service`'lerde `authenticated` = f, `service_role` = t.
- Tablo RLS, grant ve politikaları: `pg_class.relrowsecurity` + `information_schema.role_table_grants` + `pg_policy`. Müsaitlik tablolarında `authenticated` grant'ı yok.
- Çekirdek kuralları: `app_private.authz_actions where key ~ 'availab'` (6 satır). Org yazma kapsamı müdür için `none` (`authz_scope_rules`). `settings.schedule_rules.manage` yalnız owner ve admin rollerinde (466 + 466).
- M2 matrisi: müdür × aynı workspace'teki her kişi için `authz_reason` üzerinden okuma / not / not yazma / kendi haftası sayımı (sonuçlar Özet'te).
- Notun yolları: `get_employee_schedule_board_service` (`with_reminders false`), `get_schedule_read_model_service:110-111, :167-170`, `assess_weekly_schedule_assignment_service` (son blok).
- Rol sınıfı değişebilir mi: `save_workspace_role_service:16` "Existing role experience cannot change". Terfi dışında rütbe değiştiren bir yol yok.
- Hesap silme `auth.users`'ı silmiyor, anonimleştiriyor (`finalize_account_deletion_service`). `updated_by` yabancı anahtarları silmeyi kilitlemiyor.
- pgTAP kapsamı: müsaitliğin 11 dosyası `ci-green.txt`'te. Yedi servis `authorization_coverage.test.sql`'de sınıflanmış.

Açılan skill'ler: `supabase:supabase-postgres-best-practices` (RLS, grant ve yetki fonksiyonlarını okumak için), `superpowers:verification-before-completion` (her iddia bir SELECT ya da dosya:satır ile).

İlgili dosyalar:
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-gece/supabase/migrations/20261007010000_availability_writes_ask_the_core.sql`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-gece/supabase/migrations/20260925173926_schedule_asks_the_core.sql`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-gece/apps/api/src/availability/weekly-preferences-routes.ts`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-gece/apps/api/src/availability/availability-routes.ts`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-gece/apps/web/src/views/AvailabilityPage.tsx`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-gece/supabase/tests/availability_follows_role.test.sql`
