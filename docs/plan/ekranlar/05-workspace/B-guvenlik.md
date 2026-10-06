# B — Workspace (ana sayfa): güvenlik ve kod incelemesi (EKRAN-05, 2026-10-06, a40f329b)

**DENETİM SONUCU: BULGU VAR (kritik 0, yüksek 0, orta 0, düşük 4).** Başka bir workspace'in ya da başka bir lokasyonun verisine giden bir yol bulmadım. Müdürün kartlarındaki sayılar yalnız kendi lokasyonlarından geliyor. Eş müdürün, üstün ve kendi bekleyen izin talebi sayıya girmiyor. Bunu yerel DB'de 9.000'i aşkın müdür–kişi çiftinde ölçtüm. Düzen kaydı (Customize → Save layout) ve setup checklist yalnız işlemi yapan kişinin kendi satırına yazıyor. Bulguların dördü de düşük önemde ve hepsi doğruluk ya da "hayır" sözleşmesiyle ilgili; sızıntı yok. Biri ekranı açılmaz yapıyor: Account → Profile kaydı olmayan owner ya da admin ana sayfada "Internal server error" görüyor. Yerel DB'de bu durumda 74 hesap var. Bunlardan biri test hesabı değil: Mert'in Meyhouse'taki admin hesabı.

Kapsam ve sınır:
- **İçeride:**
  - `/app/workspace`, yani Workspace ana sayfası (`App.tsx:296-305`) ve `/app` açılışı (`AppHomeRedirect`, `App.tsx:593`).
  - API'de `GET …/workspace`, `PUT …/workspace/layout`, `POST …/workspace/todos`, `POST …/workspace/todos/:id/resolve`, `GET` ve `PATCH …/workspace/setup-checklist` (`apps/api/src/communications/communication-routes.ts:238-385`).
  - DB'de yedi servis: `get_workspace_dashboard_service`, `save_workspace_layout_service`, `create_workspace_todo_service`, `resolve_workspace_todo_service`, `get_owner_setup_checklist_progress_service`, `mark_owner_setup_checklist_item_service`, `set_owner_setup_checklist_closed_service`.
- **Sınırda:**
  - "Shift changes" sayısı. Web'de Shift Hub'ın müdür görünümünden hesaplanıyor (`WorkspacePage.tsx:110`).
  - Announcements ve Notifications kutularının okuduğu servisler.
  - Settings → General → Setup checklist (Hide / Show).
- **Dışarıda:** sayıların bağlantı verdiği ekranlar (Requests, Schedule, Employees), görsel tasarım.

## Özet
- **Tenant izolasyonu temiz.**
  - Ekranın üç tablosunda satır erişimi (RLS) açık: `workspace_layout_preferences`, `workspace_todos`, `owner_setup_checklist_progress`. Tarayıcı oturumunun (`anon` / `authenticated`) bu tablolarda hiçbir izni yok. Hiçbiri canlı kanala (realtime) yayınlanmıyor.
  - Yedi servisin hepsi SECURITY DEFINER, arama yolu boş (`search_path=""`), yalnız `service_role` çalıştırabiliyor.
  - Tarayıcının dokunduğu tek tablo `user_profiles`. Politikası yalnız kişinin kendi satırına izin veriyor (`user_id = auth.uid()`), silme izni yok.
- **Yetki çekirdek üzerinden geçiyor (setup checklist hariç, D2).**
  - Pano, düzen kaydı ve to-do'lar `app_private.authorize(…, 'workspace.todos')` soruyor (KK-34). Eylem org kapsamlı, okuma etiketli ve `workspace.read` iznine bağlı.
  - Çalışan bu kapıdan geçemiyor. Ölçüm: 1.102 çalışanda `missing_permission`, belge kısıtlı 10 müdürde `document_blocked`, kapalı workspace'lerde `workspace_closed`.
  - Rotalar kendi içinde kapı tutmuyor (`resolveActor`). Üye olmayan `authz.not_member` alıp 404 görüyor.
- **M2 ölçüldü ve tutuyor.** Yerel DB, yalnız SELECT; sorgular Kanıt bölümünde.
  - **Bugünkü vardiya sayıları:** "Scheduled today" ve "Open today" `scope_set(…, 'schedule.read')` ile sayılıyor. 612 müdürün kapsamındaki 599 lokasyonun hiçbiri kişinin canlı ataması dışında değil (0).
  - **"Time off" sayısı:** `time_off_reason(…, 'requests.read', kişi)` ile sayılıyor. Kural kişi kapsamlı; kişinin kendisi (`no_self`) ve eşit ya da üst rütbe (`rank_below`) dışarıda. 612 müdür × aynı workspace'teki her kişi:
    - Ortak lokasyondaki 3.300 müdür–çalışan çiftinde sayılıyor.
    - Ortak lokasyonu olmayan 713 çiftte 0.
    - Ortak lokasyondaki öteki müdürde 0 (1.302 `rank`). Admin ve owner'da 0. Müdürün kendisinde 0 (598 `rank`).
    - Örnek: Kadıköy müdürü Ayşe'nin sayısına Beşiktaş'taki Emre'nin izni girmiyor. Kadıköy'deki eş müdür Can'ın izni de girmiyor (P07).
  - **Gerçek taleplerle ikinci ölçüm:** 756 müdür–talep çifti. Ortak lokasyonu olmayan 16 talep sayılmıyor. Belgesi eksik müdürde 44 talep sayılmıyor. Sayılan 692 talebin hepsi ortak lokasyonda.
  - **Announcements kutusu:** müdürlerin panosuna giren 88 yayımlanmış duyurunun hiçbiri müdürün lokasyonları dışındaki bir kitleye ait değil (0).
  - **To-do'lar:** kişiye bağlı to-do `employee.read` çekirdek kuralıyla süzülüyor. Süzme ilk 5'i almadan önce yapılıyor.
- **Düzen ve checklist başkasına yazılamıyor.** İki yazma da `actor_user_id`'yi oturumdan alıyor ve `(workspace_id, user_id)` anahtarıyla yalnız kişinin kendi satırına yazıyor. Düzen listesi hem API'de (zod) hem DB'de 7 sabit widget adıyla sınırlı.
- **Employee rotaya girerse:**
  - Web: `PermissionRoute roles={owner, admin, manager}` onu içeri almıyor.
  - API doğrudan çağrılırsa: çekirdek `missing_permission` ile 403 veriyor.
  - Ekran reddi `isNoAccess` ile tek "erişim yok" kartına çeviriyor (`WorkspacePage.tsx:89-95`).
- **Güvenli olduğunu doğruladıklarım:**
  - SQL sızması ya da XSS yok. Ekranda `dangerouslySetInnerHTML` yok.
  - Bildirim ve to-do bağlantıları `safeAppActionUrl` ile yalnız `/app/…` iç adreslerine izin veriyor.
  - Log'a kişisel veri yazılmıyor. 500 cevabı ham metin değil "Internal server error" veriyor.
- **Web:** `WorkspacePage.tsx`'te `permissions.includes` yok. Takas sayısı `can(context, "exchange.read")` ile açılıyor. Setup checklist'in görünmesi ise satır içi rol kontrolüyle yapılıyor (D2).

## 1. Bulgular (önem sırasıyla)

### D1. Account → Profile kaydı olmayan owner ya da admin ana sayfayı açamıyor; "Internal server error" görüyor (Düşük)
- **Ekranda nerede:** Workspace (`/app/workspace`). Owner ve admin girişte buraya iniyor.
- **Örnek:**
  - Mert'in Meyhouse'taki admin hesabının `user_profiles` satırı yok. Hesap 2026-09-22'de, onboarding vakası olmadan eklenmiş.
  - Mert yerelde Workspace'i açıyor. Sayfa "Loading Workspace..." sonrası hata gösteriyor.
  - Aynı durumda 73 test owner'ı daha var (`bl080-*@newfork.test`).
- **Neden oluyor:**
  - Pano cevabı `from public.user_profiles profile … where profile.user_id = actor_user_id` ile kuruluyor (son tanım `supabase/migrations/20261003040000_time_off_forgets_location_and_parts.sql:1011-1015`). Satır yoksa cevabın tamamı NULL dönüyor.
  - API `workspaceDashboardSchema.parse(null)` ile düşüyor ve 500 veriyor.
  - `coalesce(…, 'Manager')` yedeği bu yüzden hiç çalışmıyor. 2026-08-18'deki `20260818081503_workspace_dashboard_profile_fallback.sql` adın yokluğunu alt sorguyla karşılıyordu. 2026-09-08'deki yeniden yazımda (`20260908160000`) satır `FROM`'a taşındı ve yedek kayboldu.
  - Hesap satırını oluşturan zorunlu bir adım yok. `adopt_account_phone` içindeki yorum bunu açıkça söylüyor: "nothing creates one at sign-up".
  - Bugün satırı yalnız şu yollar açıyor:
    - owner sihirbazının ad adımı (`OwnerOnboardingPage.tsx:323`),
    - çalışan onboarding'inin telefon adımı (telefon zorunlu),
    - Account → Profile / Preferences kaydı.
- **Kanıt:**
  - Kişi tipine göre, satırı olmayan aktif üyeler (SELECT): owner 73, admin 1, manager 0, employee 0.
  - Geri alınan denemede (`begin … rollback`) bu kişilerden üçü için `get_workspace_dashboard_service(...) is null` = `t`.
  - Test dünyası (`builder.sql:118`) her kişiye profil açtığı için pgTAP ve e2e bunu görmüyor.
- **Etkisi:** sızıntı yok, ekran kapalı kalıyor (fail-closed). Bugünkü davet ve owner akışları satırı açtığı için yeni hesapta oluşması zor. Ama hiçbir kural bunu garanti etmiyor, ve oluştuğunda kişinin açılış sayfası açılmıyor.
- **Önerilen yön:** iki yol var.
  - Panoda adı alt sorguyla okumak. Satır yoksa bile cevap dönsün; "Manager" yedeği de owner için yanlış ad, kişinin hesabındaki ada düşmeli.
  - Ya da kurala "her üyenin hesap satırı vardır" yazıp kayıtta açmak (P01: tolerans yerine kural). Hangisi seçilirse, profili olmayan owner için bir pgTAP hücresi eklenmeli.
- **BL eşleme:** **YENİ.**
- **İşaret:** leave: low / do: safe.

### D2. Setup checklist yetkiyi çekirdeğe sormuyor; kural üç yerde, üçü farklı (Düşük)
- **Ekranda nerede:**
  - Workspace → Setup checklist (owner ve admin görüyor).
  - Settings → General → Setup checklist → Hide checklist / Show checklist.
- **Ne görüldü:**
  - Üç servis eski kapıyla soruyor: `public.service_actor_has_permission(…, 'settings.general.read' | 'settings.general.manage')`. Ret ipucusuz 42501 ("workspace management required"), yani `authz.*` anahtarı yok.
    - Kaynak, yerel DB gövdesi (`pg_get_functiondef`). Migration dosyası `20260908177000_owner_setup_checklist_progress.sql:65, 99, 148` hâlâ eski anahtarı (`workspace.manage`) gösteriyor; DB'deki gövde daha sonraki bir yeniden adlandırmayla değişmiş.
  - İki rota da kapıyı kendi içinde soruyor: `authorize(… "settings.general.read" / "settings.general.manage")` → `context.permissions.includes` (`communication-routes.ts:335-341`, `:364-370`). CLAUDE.md §9 rota içinde kapıyı yasaklıyor. BL-413 Workspace'in öteki dört rotasını kapattı, bu ikisi kaldı.
  - Katalog bu servisleri `workspace.setup` eylemine bağlıyor (`supabase/tests/authorization_coverage.test.sql:97, 136, 240`). O eylem çekirdekte yalnız owner'a açık (`owner_only = t`). Servisler ise bu eylemi hiç çağırmıyor.
  - Web checklist'i rol adına bakarak gösteriyor: `context?.membership.role === "owner" || "admin"` (`WorkspacePage.tsx:180-183`).
- **Ölçüm (SELECT):**

  | Rol (aktif) | Eski kapı | Çekirdek `workspace.setup` |
  |---|---|---|
  | Owner (açık workspace, 462) | izin | izin |
  | Owner (kapalı workspace, 4) | **izin** | `workspace_closed` |
  | Admin (264) | **izin** | `owner_only` |
  | Manager (612) | ret | ret |

  Kısacası: kapalı workspace'teki owner ve bütün admin'ler eski kapıdan geçiyor, çekirdek ikisini de reddediyor.
- **Örnek:** admin Deniz, Settings → General'da "Hide checklist"e basabiliyor. Katalogdaki kurala göre bu owner'ın işi. Kapalı bir workspace'te owner da checklist'i değiştirebiliyor.
- **Etkisi:**
  - Yazılan şey yalnız kişinin kendi "ziyaret edildi / gizli" bilgisi. Başkasının ya da başka workspace'in kaydına yol yok.
  - Bulgu kuralın dağınık olması: üç yer üç ayrı cevap veriyor, ve katalog testi koddaki kapıyı değil sınıfın var olduğunu sınıyor.
- **Açık ürün sorusu (koordinatöre):** checklist'i admin de görsün mü (bugünkü web ve servis), yoksa yalnız owner mı (katalog)? "Billing" adımı admin'in yapamayacağı bir yere gidiyor. KARARLAR'da cevap yok.
- **BL eşleme:**
  - **BL-276** (eski kapıyı kullanan 10 fonksiyon; üçü bunlar), değişmiş: madde bu üçünü adıyla yazmıyor.
  - Rota kapısı ve katalog çelişkisi **YENİ not** (BL-413'ün kardeşi). BL-178'deki `custom_grantable` sorunu da bu iki rotaya dokunuyor: `settings.general.*` verilen özel müdür rolü API'den geçer, web göstermez.
- **İşaret:** leave: low / do: moderate (yetki kapısı değişir, katalog ve matris hücresi gerekir).

### D3. Katalog sınıfı, panonun gerçekte sorduğu eylemle eşleşmiyor (Düşük)
- **Ne görüldü:**
  - `authorization_coverage.test.sql:104` `get_workspace_dashboard_service`'i `workspace.read`'e bağlıyor. Fonksiyon ise `workspace.todos` soruyor (KK-34).
  - Test yalnız "bu anahtar çekirdekte var mı"ya baktığı için yanlış sınıf yeşil geçiyor. D2'deki üç satır da aynı sebeple yeşil.
- **Etkisi:** bugün davranış doğru. Ama matristeki `workspace.read` beklentisi değişirse panonun kapısı sessizce kapsam dışında kalır.
- **BL eşleme:** **YENİ.** BL-416 ile aynı aile: katalog sayacının kör noktası.
- **İşaret:** leave: low / do: safe. Sınıf satırı düzeltilir. İsteğe bağlı olarak teste "gövde sınıftaki eylemi çağırıyor mu" kontrolü eklenir (`prosrc` araması).

### D4. To-do kapatma: bilinmeyen to-do 404, kapsam dışındaki 403 alıyor (Düşük)
- **Ekranda nerede:** Workspace → Todos → ✓ (Resolve).
- **Ne görüldü:**
  - `resolve_workspace_todo_service` önce satırı arıyor. Yoksa `P0002` dönüyor ("workspace todo not found", 404).
  - Satır var ama kişi müdürün kapsamı dışındaysa `authorize(…, 'employee.read')` 42501 `authz.out_of_scope` veriyor (403).
  - Kaynak: `supabase/migrations/20260930172000_the_todo_list_asks_the_core.sql:70-73`, yerel DB gövdesi aynı.
- **Örnek:** Kadıköy müdürü Ayşe, kapsamı daraldıktan sonra eski bir sekmede Beşiktaş'taki Emre'ye ait to-do'yu kapatmaya çalışıyor. "Bu to-do var ama size kapalı" cevabı alıyor.
- **Sözleşme:** CLAUDE.md §9'a göre bilinmeyen ve kapsam dışı hedef aynı cevabı almalı.
- **Etkisi:** çok sınırlı. Kimlikler tahmin edilemeyen uuid'ler, ve pano kapsam dışındaki to-do'yu hiç göstermiyor.
- **BL eşleme:** **YENİ.** G11 / "hayır" sözleşmesi ailesi.
- **İşaret:** leave: low / do: safe.

## 2. Bugün de geçerli olan backlog maddeleri (tazelik 2026-10-06, `a40f329b`)
- **BL-410, geçerli.**
  - Widget'lar `can()` olmadan çiziliyor. İzni olmayan "Time off 0" görüyor (`WorkspacePage.tsx:395-406`).
  - Ek gözlem: "Shift changes" sayısı `ready_for_manager` ve `awaiting_other_manager` durumlarını sayıyor (`:110`). Müdürün onaylayamayacağı vakalar da sayıya giriyor.
  - Eş müdürün takasını sayıp onaylayabilmesi EKRAN-02 Y1'in konusu (BL-276 kalem 1, FB-6.4 A2). O düzelince sayı da aynı kurala geçmeli.
- **BL-533, geçerli.** Pano bildirimleri hâlâ eski `get_notifications_service`'ten okuyor. Kapısı çekirdekte (`notifications.read_own`), yalnız kişinin kendi bildirimleri geliyor, sızıntı yok. Sorun ikinci bir gelen kutusunun durması.
- **BL-564, geçerli.** Duyurular yalnız `status in ('published','scheduled')` ve `publish_at <= now()` ile süzülüyor. Arşivli ve süresi dolmuş duyuru panoda görünmeye devam ediyor (yerel DB gövdesi). Kitle dışına taşma yok (88 / 0 ölçümü).
- **BL-176, geçerli (genel).** `/app/workspace` rotası `PermissionRoute anyOf={["workspace.read"]}` ile korunuyor (`App.tsx:299-302`). Sunucu ayrıca karar veriyor. Sınırda: Settings → General düzenleme hakkını `context?.permissions.includes("settings.general.manage")` ile buluyor (`GeneralSettingsPage.tsx:32`).

## 3. Kararla kabul edilmiş, bulgu saymadım
- **Kişiye bağlı olmayan to-do'yu workspace'teki her yönetici görüyor ve kapatabiliyor.** Örnek: Kadıköy müdürü Ayşe "Order napkins" yazıyor; Beşiktaş müdürü Can bunu görüp kapatabiliyor. KK-34 bunu bilerek seçti: "to-do'yu lokasyona bağlamak" reddedildi. Lokasyon kapsamı (M2) bekleyen biri için şaşırtıcı olabilir. Ürün yeniden açmak isterse karar konusu.
- **Panoyu açmak bir yazma da yapıyor.** Her açılışta `sync_expiring_document_todos_service(workspace)` çalışıyor: süresi yaklaşan belge to-do'larını yazıyor, bildirim kuyruğuna olay koyuyor. Alıcılar çekirdekle (`documents.read`) seçiliyor ve olay anahtarı (`event_digest`) aynı belge için aynı. Yetki sorunu yok. Okuma uç noktasının yan etkisi ayrı bir mimari soru (D raporu).

## 4. Sınırda
- **Settings → General → Setup checklist.** Metin "…appears on the Workspace dashboard **for this workspace**" diyor. Oysa gizleme bilgisi kişi başına tutuluyor (`owner_setup_checklist_progress (workspace_id, user_id)`). Owner gizleyince admin hâlâ görüyor. Güvenlik değil, metin ve davranış farkı. D raporuna ve D2'deki ürün sorusuna bağlı.
- **Shift changes sayısının kaynağı** Shift Hub müdür görünümü (ekran 13 ve Requests). Okuma kapsamı EKRAN-02 B'de incelendi.

## 5. Kanıtlanamayanlar
- **Canlı (hosted) DB'de `user_profiles` satırı olmayan owner ya da admin sayısı** ölçülmedi; yalnız yerel ölçüldü (74). Canlıda D1'in gerçek etkisini bu sayı belirler.
- **Owner sihirbazında ad adımından önce çıkıp workspace'e girmenin mümkün olup olmadığı** denenmedi (`ProtectedRoute workspace="complete"` bunu büyük olasılıkla engelliyor).
- **"Time off" sayısında gerçek bekleyen talep yerelde yalnız 1 tane.** Bu yüzden M2 ve rütbe ölçümünü sayının kullandığı kuralın kendisiyle, kişi bazında yaptım (9.000+ çift). Sayı fonksiyonu talep başına bu kuralı çağırıyor.

## Öneri (zevk)
- Üç yazma rotası (`POST …/workspace/todos`, `…/resolve`, `PATCH …/setup-checklist`) `app.ts:373-391`'deki Origin kontrol listesinde yok; yalnız `/workspace/layout` var. `GET …/setup-checklist` da `no-store` listesinde yok.
  - Kimlik başlıkta (Bearer) taşındığı için siteler arası istek (CSRF) yolu yok.
  - Liste mantığı tutarlı olsun diye eklenebilir.

## Kanıt (çalıştırılanlar; yalnız git ve SELECT, test koşturulmadı)
- `git fetch origin`; `origin/main` = HEAD = `a40f329b`. Yerel DB'nin son migration'ı `20261007130000`, repodakiyle aynı.
- `db.lock` `nf-db/veri`'de (EKRAN-02 pgTAP koşusu). Yalnız okudum. Tek yan etkili çağrıyı (pano) `begin … rollback` içinde, tek oturumda yaptım.
- **Servisler:** `pg_proc` + `has_function_privilege`. Yedisi de `prosecdef = t`, `search_path=""`, anon = f, authenticated = f, service_role = t. `service_actor_has_permission`: anon / authenticated = f.
- **Tablolar:** `relrowsecurity` + `role_table_grants` + `pg_policy`. Üç tabloda tarayıcı izni yok. `owner_setup_checklist_progress_no_direct_access`. `user_profiles` yalnız `profiles_manage_own`, DELETE yok. `pg_publication_tables`'ta üçü de yok.
- **Çekirdek satırları:**

  | Eylem | Kapsam | Etki | İzin | Ek kural |
  |---|---|---|---|---|
  | `workspace.todos` | org | read | `workspace.read` | — |
  | `requests.read` | person | read | — | `no_self = t`, `rank_below = t` |
  | `workspace.setup` | org | write | — | `owner_only = t` |

- **Kapı ölçümleri:**
  - `authz_reason(üye, w, 'workspace.todos')` rol × sebep dağılımı (Özet'teki sayılar).
  - D2 tablosu: `service_actor_has_permission` ile `authz_reason(…, 'workspace.setup')` karşılaştırması.
- **M2 sorguları:**
  - `scope_set(…, 'schedule.read')` × canlı atamalar: 612 müdür / 599 lokasyon / 0 dış.
  - `time_off_reason(müdür, w, 'requests.read', kişi)` × rol / ortak lokasyon / kendisi: 22 grup. Gerçek talepler: 692 / 44 / 16.
  - `get_announcements_service` × `announcement_locations` (rollback içinde): 88 / 0.
- **D1:**
  - `user_profiles` satırı olmayan aktif üye sayımı.
  - Rollback içinde `get_workspace_dashboard_service(...) is null` → üç satırda `t`.
  - `auth.users` üzerinde tetikleyici yok. `user_profiles`'a yazan tek DB fonksiyonu `app_private.adopt_account_phone`.
- **Kod okuma:**
  - `WorkspacePage.tsx` (tamamı), `communications-data.ts:59-125`, `communication-routes.ts:238-415`, `communication-service.ts:217-275`.
  - `workspace-context.ts:51-107`, `http-error.ts:113-174`, `action-url.ts`, `GeneralSettingsPage.tsx:32-60, 190-225`, `App.tsx:296-305, 593-596`, `resolveLanding.ts:65-75`.
- **Testler (okundu, koşturulmadı):**
  - `time_off_seen_by_who_decides.test.sql:37` panonun Time off sayısını kişi bazında deniyor.
  - `communication_operations.test.sql:134-165` düzeni ve belge to-do'sunu deniyor.
  - Profilsiz kişi için hücre yok.

Açılan skill'ler: `supabase:supabase-postgres-best-practices` (RLS, grant ve SECURITY DEFINER okuması için), `superpowers:verification-before-completion` (her iddia bir SELECT ya da dosya:satır ile).

İlgili dosyalar:
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-ekran-05/apps/web/src/views/WorkspacePage.tsx`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-ekran-05/apps/api/src/communications/communication-routes.ts`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-ekran-05/apps/api/src/communications/communication-service.ts`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-ekran-05/supabase/migrations/20261003040000_time_off_forgets_location_and_parts.sql`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-ekran-05/supabase/migrations/20260930172000_the_todo_list_asks_the_core.sql`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-ekran-05/supabase/migrations/20260908177000_owner_setup_checklist_progress.sql`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-ekran-05/supabase/tests/authorization_coverage.test.sql`
- `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-ekran-05/apps/web/src/settings/GeneralSettingsPage.tsx`

Ölçülen `origin/main`: `a40f329b3728f1823378d8d42807689cfe43e4fb`.
