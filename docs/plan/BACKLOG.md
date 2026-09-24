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
- OBS-001 Invite/access mutasyonları (reminder/revoke/remove access) ve provider kabulü → tasks/JOIN-001.md (J2).
- OBS-002 Availability save → manager → Schedule browser zinciri ve otomatik bildirim (local cron 503 hatası dahil).

## Geliştirme ortamı
- BL-002 `pnpm.cmd dev` için yapılandırılabilir portlar; aynı sunucu ikinci kez başlatılmasın.
- BL-003 Tek komutla env anahtarlarının varlığı (değer göstermeden), port ve checkout kontrolü.
- BL-004 kapandi (2026-09-22): `scripts/export-local-fixture.mjs` + `supabase/local-fixture/` + `config.toml` sql_paths. `supabase db reset --local` workspace, 4 lokasyon, FOH/BAR, 8 job, 45 kisi, 2 shift type ve 4 hesabi tek komutta kuruyor.
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
- Onboarding getter geçersiz ya da erişilemeyen `workspaceId` için "unavailable" (P0002) veriyor ve API bunu 503'e çeviriyor; 404 daha doğru (AUTH-002 bulgusu).
- pgTAP borcu: BL-052 sonrası üç onboarding/document test dosyası kırmızı; `employee_onboarding_rls` reset/confirm stub'larında transaction abort olduğu için testlerin çoğunu koşmuyor. Dosyalar güncel sözleşmeye göre yenilenmeli (AUTH-002 bulgusu; TEST-002 adayı).
- ~~`.workspace-row` capitalize hatası~~ KAPANDI: kural UI-PRE-001 D1'de silindi (6d9f0e7).
- ~~Pending başlığının yüklenirken görünmesi~~ KAPANDI: kit yükleme durumunda "Checking your account" gösteriyor (UI-PRE-001 D1, 6d9f0e7).
- main CI THEME-004'ten beri kırmızıydı: `MainNavigationHeaderContract.test.ts` eski `--lu-muted` literal'ini bekliyordu. Düzeltme AUTH-UX-001 branch'iyle geliyor. Ders: merge sonrası main CI sonucu koordinatör turunda kontrol edilir (`gh run list --branch main -L 3`).
- CI: `.github/workflows/ci.yml` yalnız `docs/**` değişen push'larda tetiklenmesin (`paths-ignore`). Bugün art arda docs push'ları concurrency yüzünden süren kod koşularını iptal ediyor ve kırmızı sonuç gizleniyor. Tek dosya, küçük iş.
- `POST /owner-onboarding/invitation-intents` body'yi yetkiden önce doğruluyor (yetkisiz + geçersiz body → 400). Bilgi sızdırmıyor; sıra düzeltilebilir (AUTH-004 bulgusu, düşük).
- Local DB kalıntısı (AUTH-UX-001 fixture'ları, 2026-09-17 kısmi temizlik): "AUTH-UX Bistro" (owner auth-ux-owner@newfork.test) ve "AUTH-UX Solo" (owner auth-ux-invitee@newfork.test) workspace'leri ile bu iki kullanıcı duruyor; `prevent_last_workspace_owner_removal` trigger'ı cascade silmeyi engelliyor (bilinçli koruma, aşılmadı). İstenirse uygulamanın workspace closure akışıyla kapatılır. Yedek: `C:/Users/TheWe/Documents/Codex/backups/auth-ux-fixtures-2026-09-17/`. Zararsız; hosted'ı etkilemez.
- (leave: low / do: moderate) Uygulamada kendi elle yazılmış onay pencereleri hâlâ var; ortak `ConfirmDialog`a (REUSE UI-13) taşınmalı: Schedule "Delete selected shifts?" ve "Discard unsaved changes?" (`SchedulePage` alt bileşenleri, bej Schedule görünümü), Availability'den kaydedilmemiş çıkış (`availability-navigation.tsx`), Employees > yeni çalışan yarıda "Discard new employee?" (`EmployeeDrawer`), Settings > Jobs atama çekmecesindeki onay (`JobAssignmentsDrawer`), Settings > Kiosk'taki onay (`KioskSettingsPage`, `.confirm-dialog`). Görünümleri birbirinden farklı; kullanıcı B tasarımını seçti (2026-09-23).
- (leave: low / do: moderate) Roles > rol silme hâlâ kendi iki tık kopyasını kullanıyor (`RolesSettingsPage` `deleteArmed`). Yazısı "Confirm delete" oldu; ortak `useConfirmClick`e taşınmadı çünkü bağımlılığı olan rolde silahlı hal "Role has dependencies" uyarısını gösterip açık kalıyor. Taşımak için hook'a dışarıdan söndürme gerekir.
- (leave: medium / do: safe) Main CI ara sıra kırmızı: `LineupPage.test.tsx` "previews and copies reference-style Line-up share text" (Schedule > Line up > Share Line Up). Paylaşım metni kutusu görünür görünmez "Copy Line-up image" butonunu hemen arıyor; buton önizleme cevabı gelince çıkıyor, yavaş CI makinesinde yakalanmıyor. 2026-09-22 run 35799989144 bu yüzden düştü (o commit yalnız fixture betiğine dokunmuştu). Düzeltme: o iki `getByRole`ı `await findByRole` yapmak. Yerelde tam koşu makine yükünde başka 4-5 dosyayı da zaman aşımına düşürüyor (EmployeeOnboardingPage, NotificationSettingsPage), tek başına geçiyorlar. Bu maddenin ikinci testi (`App.test.tsx`, Schedule > Publish) BL-089 ile birleşti ve kapandı.
- (leave: low / do: safe) Workspace ana sayfasındaki "Customize" ve "Add" butonları `secondary` sınıfı taşıyor ama yeşil görünüyor. Vazgeçme değil aksiyon oldukları için yeşil doğru olabilir; niyet sorulup ya sınıf silinmeli ya beyaz yapılmalı.
- Teknik borç denetimi (2026-09-18, salt okunur; ayrıntı DEBT-001 ve o session'ın transcript'i). Sıralanmamış kalemler:
  - P1: tipli hata sınıfları + tek Fastify `setErrorHandler`; 15 `requestError` kopyası HTTP status'u İngilizce metin eşleşmesinden türetiyor (139 `throw new Error`, 93 `message.includes`). Sessiz status regresyonu, substring çakışması ve i18n duvarı. OPS-013 ile aynı dosyaya iner, sıralı yürür.
  - P1: CI'da 119 pgTAP testi için ikinci job (RLS/tenant izolasyonu şu an CI'da hiç koşmuyor).
  - P1: Kiosk (4.106 satır, 7 canlı `/v1/kiosk` route) ve Time Entries (1.569 satır) kararı: sil ya da güvenlik yüzeyini sahiplen. Menüde gizli olmak erişilemez değil.
  - P2: `schedule-routes.ts` 3.458 satır / 47 route bölünmesi; migration baseline squash (pencere lansmanda kapanıyor, production verisi yok); `shared/index.ts` saf barrel + subpath import; `/v1` birleştirme ve vercel.json sadeleştirme; `docs/rebuild` (199 bayat belge) arşivi + ADR'ler; `App.test.tsx`/`app.test.ts` monolitlerinin bölünmesi.
  - Fırsatçı: bağımlılık major'ları tek parti (vitest 3→5, vite 7→8, react-router 7→8, TypeScript 5.9→7 …); `SchedulePage.tsx` (55 useState + 26 useEffect) parça parça çıkarım; E2E smoke akışını BL-058'in önüne çekme.
- Documents: migration öncesi published kayıtların `published_at`'i null; listede "-" görünüyor. Backfill istenirse ayrı task (UI-DOC-002 bulgusu).
- Documents: DB trigger'ı published tanımın düzenlenmesini reddediyor; drawer bu yüzden salt okunur. Published dokümanı doğrudan düzenlemek istenirse ayrı DB task'ı gerekir (UI-DOC-002 bulgusu, kullanıcı mevcut davranışı onayladı).
- `exceljs@4.4.0 > uuid@8.3.2` moderate advisory: exceljs yalnız `uuid.v4` kullandığı için istismar edilebilir değil; exceljs major yükseltmesiyle kapanır (DEBT-001 P0 kalıntısı).
- `eslint-plugin-react-hooks` kurulumu kullanıcı onayı bekliyor: kurulunca `exhaustive-deps` ilk kez gerçekten denetlenir (501 web dosyası, yoğun `useEffect`). Warn olarak açılmalı, error değil.
- `supabase/seed.sql:143` "Pending Demo" üyeliği `pending_activation` ama `employee_onboarding_cases` satırı yok; "Continue onboarding" tıklanınca "Onboarding is unavailable" ekranına düşüyor (local DB'de doğrulandı). Küçük seed düzeltmesi, `DB: lock` ister (UI-PRE-001 bulgusu).
- UI-PRE-001 backlog'u (aynı tasarım diliyle, sonra): `/sign-in` kayıt modu ve sonlanan oturum durumu, `/account-recovery`, suspended business ekranı, `WorkspaceSetupPending` ve `ProtectedRoute` yükleme/recovery ekranları, tüm ekranların mobil genişlik turu, diğer account sayfaları (Profile, Security, Inbox, Preferences, Documents).
- Yeni taslak business'ın varsayılan adı "New organization" (`CreateOrganizationButton.tsx:15`) sözlük kararı gereği "New business" olmalı; UI-PRE-001 D1'de yapılacak, DB'deki mevcut adlar değişmez.
- Proje CLAUDE.md yeniden yazılmayacak (kullanıcı kararı 2026-09-18: "kurallara gerek yok"). Koordinasyon modeli, rapor formatı, worktree/port düzeni ve DB kilidi kuralı yalnız koordinatör session'ında ve task dosyalarında yaşıyor; yeni bir session'a iş verilirken brief'e açıkça yazılmalı.
- Tipli hata göçü: kullanıcı kararı "önce riskli modüller" (auth, hesap, davet, workspace). Kalan modüller (schedule, communications, kiosk, time-entries, employee-hub, documents, notifications, signature, directory, organization-settings) bugünkü metin eşleşmesiyle devam eder; yeni kod `HttpError` kullanır.
- React hook bağımlılık uyarıları: 20 adet (0 hata), 2026-09-18'de açıldı. Her biri bayat kapanış riski; ilgili dosyaya bir feature task geldiğinde o dosyanınkiler kapatılır. Toplu düzeltme ayrı task olur.
- Workspaces listesinde SON satırın "…" menüsü kırpılıyor: `.workspace-list { overflow: hidden }` (köşe yuvarlaması ona dayanıyor). Tek business'lı hesapta menü her zaman kırpık. main'de de var, UI-PRE-001 D1'in getirdiği değil.
- Kurulumu bitmemiş business'ı "Discard" etmek 10 dakikadan eski oturumda API tarafından reddediliyor ("Recent reauthentication required"); switcher oturum ortasında açıldığı için sık görülür. Şimdilik satır "Sign in again to discard this setup" diyor. Seçenekler: satıra parola adımı ya da kurulumu bitmemiş business'ı bu kapıdan muaf tutmak. Karar kullanıcıda (UI-PRE-001 D1 bulgusu).
- `AcceptInvitationPage` "yanlış hesap" durumu sunucunun İngilizce cümlesine bağlı; API artık 42501 → 403 verdiği için status'a bağlanabilir (UI-PRE-001 D1 bulgusu).
- Pending sayfası, kurulumu bitmemiş bir business'ı o business'ın SAHİBİ OLMAYAN üyesine hâlâ "In progress" altında listeliyor; "Open" onu bekleme paneline götürüyor. Akış sorusu, AUTH-UX alanı (UI-PRE-001 D1 bulgusu).
- `finalizeActivation` reddedilirse employee onboarding sayfası asılı kalabiliyor; yalnız askıda business'ı olan hesap "Welcome back… Start your own business" görüyor (UI-PRE-001 D1 bulgusu, mantık).
- Workspaces sayfasının satır DIŞI metinleri hâlâ eski dilde ("Workspaces" başlığı, açıklama, "Loading workspaces…", devir/kapatma panelleri, ham hata fallback'leri). UI-PRE-001 D1 yalnız satırı kapsadı.
- HATA (uygulama içi `DocumentReviewDrawer`): dosya yükleme, taslak dosya silme ve erteleme `lifecycle_revision`'ı artırıyor; key'li içerik yeniden mount olduğu için kullanıcının yazdığı son kullanma tarihi ve ek alanlar her yüklemeden sonra siliniyor (SQL'de doğrulandı, UI-PRE-001 D2 ölçümü). Onboarding'in yeni sayfası bundan muaf yazılıyor; drawer'da hata duruyor.
- `DocumentReviewDrawer`'ın 10 mutation'ından 8'i hiç test edilmiyor (acknowledge, withdraw, defer, removeFile, submit payload, download). D2'de bunların bir kısmı için pin testleri yazılıyor; kalanı ayrı bir test borcu.
- **KARAR (kullanıcı, 2026-09-18): uygulama içi `EmployeeDrawer` da aynı mantığı alacak.** Bugün job ve lokasyon alanları `required` işareti taşıyor ama kaydetmeyi engellemiyor (`EmployeeDrawer.tsx:2090`, `:2105`; `AssignmentPicker` yalnız işaret basıyor). Kural onboarding adım 4 ile aynı olacak: en az 1 job + 1 lokasyon zorunlu; `is_remote` ya da `is_excluded_from_schedule` seçiliyse muaf; karşılanmazsa kaydet butonu deaktif. Ayrı küçük task olarak yapılacak (UI-PRE-001 D3 kapsamına girmez); kapsam: drawer'ın create ve edit yolları, mevcut testlerin güncellenmesi, API'de aynı kuralın zaten olup olmadığının kontrolü.
- ~~Üç cron endpoint'i tetiklenmiyor~~ KAPANDI 2026-09-19: dördü de pg_cron'da (OPS-014, b7052f6).
- Zamanlanmış export işi hosted'da 503 `"Email delivery is not configured"` dönüyor: job ve yetki yolu doğru, teslimat sağlayıcısı yok (F3, BL-046). E-posta açılınca ayrı iş gerekmez.
- Hosted'da `VITE_API_URL` tanımlı değil; web aynı alan adına relative istek atıyor. Bugün doğru çalışıyor ama web ayrı bir alan adına taşınırsa bu değişken tanımlanmalı ve `vercel.json` önekleri gözden geçirilmeli.
- 2026-09-19 kullanıcı kararı: katılım zinciri (davet, onboarding, çakışmalar, business kapatma/devir/suspend, belge adımı) MVP sırasının BAŞINA alındı. Bu dosyadaki ilgili satırların çoğu artık tasks/JOIN-001.md durum matrisinde izleniyor; oradaki dilim kapanınca buradaki satır üstü çizilir.

- **BL-070 pgTAP paketi: 32 dosya ilk fixture satirinda duruyor (leave: high / do: moderate).** Olcum: BL-081 sonrasi tam kosu, 2026-09-22 aksam; o gunden beri paketin kapsadigi hicbir sey degismedi. 130 dosya / 3266 kontrol, 55 kirmizi dosya, 32'si ilk hatada duruyor. Sabah 51 duruyordu; bugun 5 dosya kapandi (weekly_preferences_commands, employee_termination_offboarding, schedule_time_source, time_off_physical_request_counts, availability_complement_ranges). Kalanlarin ~12'si testin unuttugu bir fixture satiri (mekanik), bir kismi kurallarin artik izin vermedigi bir durumu kuruyor -- CLAUDE.md'deki 'eski veriyi koruma' kuralina gore bunlar da mekanik: senaryo bugunku kurala gore yeniden yazilir. `test:db` hala CI kapisi degil. **2026-09-23 güncel:** 38 kırmızı (131 dosya, main 41783c7). Dosya dosya derin araştırma, eski/yeni davranış ve öneriler: `docs/plan/research/bl070-2026-09-23/README.md`. Kararlar kullanıcıyla rol/kapsam modeli konuşulduktan sonra verilecek.
- **BL-071 `membership_status='invited'` ve enum temizliği (2026-09-21).** Kullanılmayan `invited` etiketi enum'da duruyor; tipi takas etmek 72 fonksiyona dokunmayı gerektirdiği için ertelendi. Kullanımı pgTAP ile yasaklandı.
- **BL-072 iki avatar alanı (2026-09-21).** `user_profiles.avatar_object_path` ve `employee_private_profiles.avatar_object_path` aynı kişinin fotoğrafını iki yerde tutuyor. JOIN-008 kapsamı dışında bırakıldı.
- **BL-073 canvas önerisi: hesap butonu + switcher tek kontrol (2026-09-21).** Tasarım canvas'ı ikisini sidebar dibinde birleştiriyor; plan E5 switcher'ı menünün tepesine koyuyor ve JOIN-005 planı izliyor. Birleştirme önerisi burada bekliyor.
- **BL-074 `kapsam-yonetimi.md` ölü yollara işaret ediyor (2026-09-21).** Dosya `docs/project/WORK.md` ve `docs/project/BACKLOG.md`'yi gösteriyor; ikisi de yok, güncel yer `docs/plan/`.
- **BL-076 workspace rotalari oturumsuz cagriya 404 donuyor (2026-09-21, JOIN-004).** `resolveWorkspaceAuthorization` Authorization basligi hic yokken de `workspace_not_found` diyor, yani 404. Uye olmayan birine 404 donmek dogru (varligi sizdirmaz), ama kimlik hic gonderilmemisken 401 olmali. 29 rota bu dala bakiyor; JOIN-004'te yalniz davet linki ucu duzeltildi, geri kalani JOIN-007'de supurulecek.
- **BL-077 web testleri paralel yukte zaman asimina ugruyordu (2026-09-21, JOIN-004'te kapandi).** Dort paket ayni cekirdekleri paylasinca her kosuda farkli bir avuc test 5 sn varsayilaninda dusuyor, izole hepsi geciyordu. `apps/web/vite.config.ts` icinde `testTimeout: 20000`. JOIN-001 G2 maddesi bununla kapandi.
- **BL-078 `20260921180000_location_short_name_released_by_archive.sql` yanlislikla JOIN-004 commit'ine girdi (2026-09-21).** Dosya calisma agacinda takipsiz duruyordu ve local veritabanina uygulanmisti (canli indeks `archived_at is null` sartini tasiyor, `20260915224354`'teki orijinali tasimiyor). `git add -A` onu `d03532c`'ye supurdu. Icerik tutarli ve DB zaten oyle; geri almak migration'lari DB'nin gerisine dusururdu, o yuzden birakildi. Kullanici LOC dilimine mi ait karar verecek.
- **BL-079 gorunen ad tek kaynaktan okunmali (2026-09-21, JOIN-008 olcumu).** Bir kisinin adi `user_profiles.display_name`, `employee_profiles.first_name/last_name` ve `employee_private_profiles.legal_*` olmak uzere uc yerde. 57 DB fonksiyonu `first_name` birlestiriyor, 38'i `preferred_name` okuyor (schedule, kiosk, lineup, export, time tracking, shift exchange). Tek yardimci fonksiyon (`app_private.person_display_name`) ve yuzey yuzey gecis gerekiyor; katilim zincirinin disinda kaldigi icin JOIN-008'de yapilmadi.
- **BL-080 owner'in resmi adi (2026-09-21).** Calisan onboarding'i `legal_first_name/legal_last_name` topluyor, owner hicbir yerde vermiyor; belge ve imza yuzeyleri isteyince bos kaliyor. Kisinin kendi istihdam kaydini duzenledigi yer JOIN-009'da aciliyor, oraya baglanacak.

## Yeni bulgular (2026-09-22)
- BL-081 kapandi (2026-09-22): iki test bugunku kurala gore yeniden yazildi -- kimse ayni anda iki yerde degil, saatsiz vardiya tipi yok. `6401acd`.
- BL-082 kapandi (2026-09-22): Vercel Authentication `newfork-clean-api` uzerinde kullanici tarafindan yeniden acildi.
- **BL-083 (leave: low / do: safe) Seed replay hatalari.** Vardiya demo blogu seed'den cikinca `supabase db reset` tamamlandi; baska replay hatasi kaldi mi olculmedi.
- BL-084 kapandi (2026-09-22): `app_private.default_closure_period` arama yolu sabitlendi. `20260922173000`.
- BL-085 kapandı (2026-09-24): BL-091'e katıldı. Mod dönüşümünün vardiya planına ulaşıp ulaşmadığı, iki müsaitlik sisteminin aynı sorusu; eski sistem FOUNDATION-B 5.3'te silinince kalkıyor, ayrıca izlenmiyor.
- **BL-086 (leave: low / do: moderate) Eski moddaki haftaya ait ölü yollar (AVAIL-001 bulgusu).** AVAIL-001'den sonra hiçbir yol workspace'in modundan farklı modda bir hafta yaratamıyor. Yine de duruyorlar: My availability ve çalışan çekmecesindeki "Entry mode changed. Previous preferences remain in effect until you save." kutusu ve "Previous preferences" açılır listesi, yönetici kopyasındaki "Copied preferences use the previous entry mode… Use current mode" uyarısı (`WeeklyPreferencesForm.tsx` içinde `staleMode` / `copiedOldMode`), sunucuda `validate_weekly_preference_command`'ın `confirm_clear` ve modlar arası kopya dalları, ve `weekly_preferences_commands.test.sql`'in modu doğrudan SQL ile çevirip eski modda kopya kuran bölümü. Birlikte silinmeli. do: moderate, çünkü editör ve doğrulama hem çalışanın hem yöneticinin kaydında kullanılıyor.
- **BL-087 (leave: low / do: safe) Hiçbir şey değiştirmeyen ayar kaydı yine de audit yazıyor (AVAIL-001 bulgusu).** `weekly_preference_settings_save_service` gelen komutu (BL-064'ten beri web `warning_policy` göndermiyor) kayıtlı ayarla (`warning_policy` içeriyor) karşılaştırıyor; ikisi hep farklı görünüyor. Değişiklik olmayan bir kayıt `availability.settings_updated` audit satırı yazıyor ve `updated_at`'i ilerletiyor. Web, değişiklik yokken Save'i kapattığı için yalnız doğrudan API çağrısı tetikler; mod değişmediği için dönüşüm çalışmaz.
- **BL-088 (leave: low / do: moderate) Mod dönüşümü bekleyen istek kontrolünü atlıyor (AVAIL-001 bulgusu).** Çalışan haftasını kendisi değiştirince kaydetme, yeni saatlerle çakışan bekleyen istekleri (pickup, swap, Line Up teklifi) tek tek "keep / cancel" diye sorar. Mod dönüşümü haftayı bu soru olmadan değiştiriyor; çevrilen hafta bekleyen bir istekle yeni çakışabilir (en çok tipten saate geçişte genişleyen günler). Onay anında müsaitliğin yeniden kontrol edilip edilmediği ölçülmedi. Ürün kararı: dönüşüm bu istekleri işaretlesin mi?
- BL-089 kapandı (2026-09-24): `App.test.tsx`'teki altı yayın testi önizlemeye tek seferlik cevap (`mockResolvedValueOnce`) veriyordu. Schedule → Publish penceresi önizlemeyi veriler geldikçe birden çok kez isteyebildiği için yavaş CI'da ikinci istek boş dönüp pencereyi "Next" görünmeden çökertiyordu (2026-09-17 yerel, 09-22 run 35794045472, 09-23 run 35836777494). Pencereye önizlemeyi ikinci kez istetince hata yerelde aynen üretildi; kalıcı cevapla (`mockResolvedValue`) aynı deneme geçti. Ürün kodu değişmedi, gerçek API boş cevap dönmüyor. Numarasız "Main CI ara sıra kırmızı" maddesinin ikinci testi buydu. `ebf21f4`.

## BL-070 turunun ortaya cikardiklari (2026-09-22)
- **BL-091 (leave: high / do: risky) Iki musaitlik sistemi var, vardiya atamasi yalniz birine bakiyor.** Atama hazirligi (`prepare_weekly_schedule_assignment`) yeni haftalik tercihleri okuyor; eski sistemde (`employee_schedule_availability_versions`) kayitli sert bir vardiya tipi kisitlamasi atama aninda uygulanmiyor, ve yoneticinin "yine de koy" onayi artik yayinlamanin okudugu tabloya yazilmiyor. Bes test bunu gosteriyor: `availability_shift_type_restrictions` #23, `availability_draft_impact_review` #19, `schedule_default_hours_review`, `schedule_custom_service_classification`, `availability_read_model_consistency`. Ayni bulgunun obur yuzu BL-085'te (AVAIL-001): mod donusumu de vardiya planinin gordugu musaitligi degistirmiyor. **Urun karari:** hangi sistem esas? Karar gelmeden bu testlere dokunulmamali.
- **BL-092 (leave: high / do: moderate) Line Up'ta tasima/takas reddediliyor -- tasinan parca kendi kaynagiyla carpistiriliyor.** Onizleme "olur" diyor, uygula "bu kisinin bu saatte baska vardiyasi var" diyor; o baska vardiya parcanin geldigi vardiyanin kendisi. `lineup_operations_v1` bunu kendi cumlesiyle kanitliyor (94: "move ignores its own source shift" gecer, 96'da ayni tasima reddedilir). Ayni aile: yayinlanmis bir vardiyanin kaynagi degisince musaitlik kurali satiri kendi eski haliyle karsilastiriyor. Testler: `weekly_lineup_retained_segments`, `lineup_operations_v1`, `weekly_lineup_transfer_acceptance`, `weekly_exchange_changed_terms`, `shift_exchange_travel_policy` #22. Kullanici Line Up'ta gorur.
- **BL-093 (leave: medium / do: moderate) Vardiya degisikligi talebinde ayni kural iki yerde farkli.** Requests -> Shift Changes, eksik sube atamasini "yumusak catisma, gerekceyle onayla" diye gosteriyor; onay vardiyayi yazarken ayni seyi "sert engel" diye reddediyor. `schedule_requests`. Karar: atanmadigi subeye kimse konamaz mi (talep ekrani da sert gostermeli), yoksa yonetici gerekceyle izin verebilir mi.
- **BL-094 (leave: medium / do: safe) Demo hafta "bu hafta"ya bagli; yedi test Pazartesi disinda gecmise yazmaya calisiyor.** `current_date - (isodow-1)` ile bu haftanin Pazartesi'sini hesaplayan 7 test var; gecmis gune islem (dogru olarak) reddediliyor, yani bu testler haftanin gunune gore gecip kaliyor. Cozum: seed'deki demo haftayi gelecek haftaya kaydirmak ve bu testlerdeki tarih hesabini ayni sekilde kaydirmak. Ornek: `schedule_lineup`.
- **BL-095 (leave: low / do: safe) Line Up aday listesinde "baska subede calisiyor" etiketi test edilmiyor.** `weekly_lineup_candidate_groups`'tan iki yerde ayni anda calisan kisi senaryosu silindi (artik mumkun degil). Etiket, tek vardiyasi baska subede olan biri icin hala anlamli olabilir; tek vardiyali bir kisiyle yeniden test edilebilir.
- **BL-096 (leave: medium / do: moderate) BL-070'in kalan dosyalari.** `employee_onboarding_rls` (5 kirmizi: yonetici vakayi hic goremiyor -- sube eklemek cozmedi --, gereksinim anlik goruntuleri x3, degismis belge yukleme akisi), `availability_review_lifecycle` (acik bir talep varken yenisi aciliyor; once degistir/geri cek), `employee_hub` (musaitlik doneminde yenileme istegi), `schedule_publication` (bayat yayin onizlemesi). Her biri kendi dikkatli okumasini istiyor.

## BL-070 derin araştırmasının doğruladığı hatalar (2026-09-23)
Kaynak: `docs/plan/research/bl070-2026-09-23/`. Yalnız karara bağlı olmayan, doğrulanmış hatalar; karar gerektirenler README'deki "temel sorular" bölümünde.
- **BL-097 (leave: critical / do: moderate) Devralınan plan oturumu kaydedilince başka lokasyonun taslak vardiyaları sessizce siliniyor.** Plan kilidi workspace+hafta başına tek (`schedule_edit_sessions_active_week_idx`). Kadıköy yöneticisi taslağı açınca oturuma yalnız Kadıköy yükleniyor; admin bu oturumu devralıp aynı taslağa kaydedince taslaktaki Beşiktaş vardiyası kayboluyor. Yeniden koşuldu (geri alınan deneme `deneyler/G/exp5.sql`). Aynı kök: iki lokasyonun yöneticisi aynı haftayı aynı anda düzenleyemiyor. Kilidin kapsamı kapsam modeli kararına bağlı, veri kaybı değil.
- **BL-098 (leave: high / do: safe) Çalışan kartını kaydetmek onaylı tercih edilen adı siliyor.** `save_employee_service` iç fonksiyona tercih edilen ad yerine sabit `''` geçiriyor (`20260922010000_names_have_three_parts.sql`). Yönetici Ali'nin telefonunu düzeltip kaydedince onaylanmış "Ali" adı gidiyor. Kodla ve ajan denemesiyle doğrulandı.
- **BL-099 (leave: high / do: moderate) Tercih edilen ad bildirimleri kimseye ulaşmıyor.** Kuyruğa alıcı listesi olmadan yazılıyor; işleyici "notification recipients are required" ile düşürüyor. Ayrıca onay/listeleme yalnız `employees.manage` iznine bakıyor (lokasyon kapsamı yok) ve kişinin kendi talebini onaylamasını engelleyen kural yok. Kimin bildirim alıp onaylayacağı kapsam modeli kararına bağlı; teslim hatası karardan bağımsız.
- **BL-100 (leave: low / do: safe) Yerel ortak DB'de araştırmadan kalan "FX" workspace'i ve 4 test kullanıcısı.** Bir ajan denemesi geri alınmadı (~230 satır, kendi içinde kapalı, `e0000000-...-0001`, `fx-*@example.test`). Temizlik kullanıcı kararı bekliyor: yedekle + yalnız bunları sil, ya da sonraki DB kurulumuna bırak.

## FOUNDATION-B sırasında bulunanlar (2026-09-24)
- **BL-101 (leave: high / do: moderate) Zamanlanmış dışa aktarmalar cron'da her seferinde düşüyor.** `revalidateScheduledExportCandidate` (`apps/api/src/schedule/schedule-service.ts`) servis rolüyle `workspaces`, `workspace_onboarding`, `workspace_memberships` ve `membership_location_scopes`'u doğrudan okuyor; servis rolünün bu tablolarda okuma izni yok. Ayrıca `service_actor_has_permission`'ı yanlış parametre adıyla çağırıyor (`permission_key`; doğrusu `target_permission`). Yönetici bir dışa aktarmayı her pazartesi e-postayla almak üzere kurduysa, cron her denemede "permission denied" ile düşüyor ve e-posta gitmiyor. İzin kataloğu ve fonksiyon imzasıyla doğrulandı; 4b/4c'den önce de böyleydi. Çözüm çekirdekle, tek servis çağrısıyla: `authz_reason(kuran kişi, workspace, 'schedule.export', lokasyonlar)`. Bekleme nedeni: Aşama 6 Ayarlar dilimindeki "planlanmış dışa aktarmanın hatası" maddesiyle aynı iş.

## FOUNDATION-B bağlantıları (2026-09-23)
Aşağıdaki maddeler FOUNDATION-B programının aşamalarında kapanır; ayrı task açılmaz.
- BL-070 (pgTAP kırmızıları) → Aşama 1 (CI kapısı) … Aşama 6 (her dilim kendi kırmızılarını çözer), Line Up dosyaları Aşama 5.6'da silinir.
- BL-091 (iki availability sistemi) → Aşama 5.3. BL-092 (takasta bırakılan vardiya kendisiyle çakışıyor) → Aşama 5.1 + 6.4. BL-093 (Requests kural çelişkisi) → Aşama 5.1 (eski akış silinir). BL-094 (tarihe bağlı testler) → Aşama 2 (builder `tests.week`). BL-095 (Line Up) → Aşama 5.6 ile düşer. BL-096 (kalan dosyalar) → Aşama 6.
- BL-097 (devralmada başka lokasyonun taslağı siliniyor) → Aşama 3. BL-098 (çalışan kaydı tercih edilen adı siliyor) → Aşama 1b. BL-099 (tercih edilen ad bildirimi teslim edilmiyor) → Aşama 6.7. BL-100 (yerel DB'deki FX kalıntısı) → Aşama 1 başında kullanıcı onayıyla ya da Aşama 7 kurulumuyla. BL-101 (zamanlanmış dışa aktarma) → Aşama 6 Ayarlar dilimi.
