# B — Requests: güvenlik ve yetki denetimi (EKRAN-02, 2026-10-05, e929abc7)

DENETİM SONUCU: BULGU VAR (kritik 0, yüksek 1, orta 1, düşük 2). Başka bir workspace'in verisine giden yol yok. Ama aynı lokasyondaki iki müdür birbirinin vardiya takasını onaylayabiliyor. Belgesi eksik olduğu için kısıtlanmış müdür de takas onaylayabiliyor.

## Özet
- **Tenant izolasyonu temiz.** Talep tablolarının hepsinde satır erişimi (RLS: her satıra "kim görebilir" kuralı) açık. Tarayıcıdan gelen oturuma tablo izni de, fonksiyon çalıştırma izni de verilmemiş. Bütün okuma ve yazma API üzerinden, servis anahtarıyla geçiyor.
- **Time off sekmesi rütbe kuralına uyuyor.** İzin okuma, onay/ret, geri alma (Revoke) ve kısaltma (Shorten) yetki çekirdeğine soruluyor. Yetki çekirdeği: kimin neyi yapabileceğine karar veren tek ortak yer. Eş rütbe ve kişinin kendisi reddediliyor; bunu yerel DB'de ölçtüm.
- **Yüksek (A2): Shift changes sekmesinde onay çekirdeğe sorulmuyor.** Takas, devir (cover) ve açık vardiya alma (pickup) onayına eski bir yardımcı fonksiyon bakıyor. Bu fonksiyon rütbeye ve belge kısıtına bakmıyor. A2 tasarımı bugün de **geçerli**: düzeltmesi FB-6.4 A2'de bekliyor, FB-6.4 hâlâ taslak.
- **Orta: Time off listesinin "Older" (eski sayfa) düğmesi her sayfa geçişinde bir talebi atlıyor.** Atlanan talep hiçbir sayfada görünmüyor. Yerel DB'de 7 talepten 6'sını gösterdi.
- **Düşük:** izin okuma rotası (route: API'nin bir adresi) yetkiyi kendi içinde soruyor (BL-363). Takas retleri ekrana "Hayır" sözleşmesinin dışında, düz İngilizce cümleyle çıkıyor (FB-6.4 A3).
- SQL sızması (SQL injection), XSS (kullanıcı metninin sayfada kod olarak çalışması) ya da log'a kişisel veri yazılması bulunmadı.

## 1. Bulgular (önem sırasıyla)

### Y1 — Aynı lokasyondaki eş müdür ve belgesi eksik müdür takas, devir ve pickup onaylayabiliyor (Yüksek)
- **Ekranda nerede:** Schedule → Requests → **Shift changes** sekmesi → talep → **Approve** / **Reject**. Aynı düğmeler Shift Hub'da da var (ekran 13).
- **Örnek:**
  - Kadıköy'de iki müdür var, Ayşe ve Can. Ayşe Cuma vardiyasını garson Hande'ye vermek istiyor. Can bu devri onaylayabiliyor. ILKELER P07'ye göre eş rütbe birbirini onaylamaz; talep admin'e ya da owner'a gitmeli.
  - İkinci örnek: Can'ın zorunlu belgesi eksik, bu yüzden kısıtlı. Kural gereği onay veremez ama takası yine de onaylayabiliyor.
- **Neden oluyor:**
  - Onay adımı, işi yapan ana fonksiyonda (`shift_exchanges_command_service`) yalnız eski yardımcıya soruyor (`schedule_actor_has_capability_service` = "bu kişinin rolünde bu izin ve bu lokasyon var mı"). Çekirdek çağrılmıyor.
    - Onay ve ret kararı ile oy yazımı: yerel DB gövdesi satır 81-82, 121 ve 134.
    - Onay öncesi kontrol (`shift_exchange_preview`): satır 14 ve 33-36. Yalnız "kendi vakanı onaylayamazsın" kuralı var (satır 24); rütbe yok.
  - Ekran düğmeyi açarken çekirdeğin lokasyon listesine bakıyor (`shift_exchanges_read_service` → `can_manage`, satır 23 ve 66). Bu liste kişi bazlı rütbe kuralını içermediği için eş müdüre Approve düğmesi görünüyor; sunucu da kabul ediyor.
  - Onay bildirimi de aynı eski yardımcıyla süzülüyor (`shift_exchange_notification_allowed`, satır 23-24). Eş müdür, onaylayamaması gereken talebin bildirimini alıyor (A2 Boşluk 2).
  - Test bu açığı kilitlemiyor. `supabase/tests/authorization_matrix.test.sql:889-893`'teki `exchange.approve` beklentisi yalnız "kendini onaylamaz" diyor. Rütbe ve belge kısıtı için hücre yok.
- **Kanıt (yerel DB, yalnız SELECT):**
  - Aynı lokasyondaki iki müdür için: eski yardımcı `t` (izin verir) dönüyor, çekirdek `exchange.approve` için `rank` (rütbe yüzünden hayır) dönüyor. Üç ayrı workspace'te ölçüldü.
  - Belgesi eksik üç müdür için: eski yardımcı `t`, çekirdek `document_blocked` (belge eksik, hayır) dönüyor.
- **Etkisi:** veri sızmıyor. Ürünün onay kuralı (P07) ve kısıtlı kişi kuralı aşılıyor. Eş müdür, kendi lehine olan bir vardiya değişikliğini de onaylayabiliyor.
- **BL eşleme:** BL-276 kalem 1 + BL-189; düzeltme planı FB-6.4 A2.2 / D3 / Done when 6. Belge kısıtı kısmı D4'e komşu ama D4 yalnız açma ve başvurma diyor. **Yeni not:** onayda belge kısıtı A2.2'nin `exchange.approve` çağrısıyla kendiliğinden kapanır; Done when 6'ya "kısıtlı müdür onaylayamaz" hücresi eklenmeli.
- **İşaret:** leave: high / do: risky.

### O1 — Time off listesinde "Older" ile sayfa geçerken bir talep hiç görünmüyor (Orta)
- **Ekranda nerede:** Requests → **Time off** → **Needs review** ya da **Closed** → listenin altındaki **Older** düğmesi.
- **Örnek:** Closed sekmesinde 51 kapanmış talep var. İlk sayfa 50'sini gösteriyor. Older'a basınca 51. talep atlanıyor; Ali'nin 3 Ekim'deki talebi hiçbir sayfada çıkmıyor.
  - Needs review'da bu daha kötü olur. 50'den fazla bekleyen talep varsa biri listede görünmez, karar verilmeden süresi dolar ve sistemin otomatik kapatmasına (`time_off_sweep`) kalır. 2-5 lokasyonlu bir işletmede Closed'da bu sayı aylar içinde aşılır; Needs review'da aşılması zor.
- **Neden oluyor:** sonraki sayfanın başlangıç işareti, 51. satırın oluşturulma zamanı olarak hesaplanıyor (`min(created_at)`, `supabase/migrations/20261003032000_time_off_deadlines_close_requests.sql:184`). Sonraki sayfa ise "bu zamandan kesin daha eski" olanları istiyor (`r.created_at < target_time_off_cursor`, `:153` ve `:181`). Böylece 51. satır her iki sayfanın da dışında kalıyor.
- **Kanıt:** workspace `e99ad7a2…`, owner `4a4231f4…`, Closed sekmesinde 7 talep.
  - Sayfa boyu 100 ile: 7 talep geliyor.
  - Sayfa boyu 3 ile birinci sayfa: 3 talep, sonraki sayfa işareti `22:09:05.13`.
  - O işaretle ikinci sayfa: 3 talep, `22:08:51`'den başlıyor.
  - Toplam 6 talep. `22:09:05.13` zamanlı talep yok.
- **Etkisi:** veri silinmiyor ama ekranda sessizce kayboluyor (ILKELER P09). Güvenlik açığı değil, doğruluk hatası.
- **BL eşleme:** **YENİ** (backlog'da "cursor" geçen bir madde yok).
- **İşaret:** leave: medium / do: safe. Tek fonksiyon değişir: işaret son gösterilen satır olmalı, eşit zamanlı satırlar için (oluşturulma zamanı, id) çifti kullanılmalı. Bir pgTAP testi: 3 talep, sayfa boyu 1, toplam 3 olmalı.

### D1 — İzin okuma rotası yetkiyi kendi içinde soruyor, ikiz rotası var, üye olmayana 404 yerine 403 dönüyor (Düşük)
- **Ekranda nerede:** Requests sayfası açılırken listeyi getiren okuma.
- **Ne görüldü:**
  - `apps/api/src/schedule/schedule-requests-routes.ts:33`, `:72`, `:129`, `:150` yetkiyi rolün izin listesinde arıyor (`context.permissions.includes`). CLAUDE.md §9 rota içinde yetki kapısını yasaklıyor.
  - Aynı servisi çağıran iki rota var: `/v1/workspaces/:id/schedule/requests` ve `/schedule/requests`. Web yalnız ikincisini kullanıyor (`apps/web/src/schedule/requests-data.ts:38`); birincisini yalnız testler çağırıyor.
  - Workspace'e üye olmayan kişi 403 "Schedule request read access required" alıyor. "Hayır" sözleşmesine göre 404 ve `authz.not_member` (üye değil anahtarı) almalı.
- **Fail-open (bilgi eksikse izin ver) değil:** veritabanı fonksiyonu ayrıca çekirdeğe soruyor (`scope_set`, `time_off_reason`, `authorize`). Rota yanlış kişiyi geçirse bile veri dönmez.
- **Örnek:** Zeynep'in rolünde okuma izni var ama hiçbir lokasyona atanmamış. Rota onu geçiriyor; veritabanı `authz.*` anahtarıyla reddediyor ve ekran doğru "erişim yok" kartını gösteriyor. Sonuç doğru, ama kapı iki yerde duruyor.
- **BL eşleme:** BL-363 (aynı satırlar zaten yazılı; ikiz rota ve 403/404 farkı maddeye eklenebilir).
- **İşaret:** leave: medium / do: moderate (BL-363'ün işareti).

### D2 — Takas retleri sözleşme anahtarı taşımıyor; ekrana düz İngilizce cümle çıkıyor (Düşük)
- **Ekranda nerede:** Shift changes → Approve / Reject reddedildiğinde.
- **Ne görüldü:** fonksiyonlar `'Manager scope required'`, `'Request access denied'` ve `'Active workspace access required'` cümleleriyle reddediyor. Kod `42501` ama `authz.*` anahtarı yok.
  - Web'deki "erişim yok" kontrolü (`isNoAccess`) anahtar istediği için tek tip "erişim yok" kartı çıkmıyor; cümle olduğu gibi ekrana yazılıyor.
  - Üye olmayan kişi de 404 yerine 403 alıyor.
- **Örnek:** Beşiktaş müdürü Zeynep eski bir bildirim bağlantısından Kadıköy'deki bir takası açıp Approve'a basıyor. Ekranda "Manager scope required" yazıyor.
- **BL eşleme:** FB-6.4 A3.1 ("Hayır" sözleşmesi).
- **İşaret:** leave: low / do: moderate.

### Öneri (zevk notu, bulgu sayılmaz)
- `apps/api/src/time-off/time-off-shorten-routes.ts:10` ve `time-off-shorten-service.ts` yorumları kısaltmanın `time_off.decide` ile yetkilendirildiğini söylüyor. Veritabanı gerçekte `time_off.revoke`'a soruyor (`shorten_time_off_service`). Yorum düzeltilmeli.
- Kısaltma isteğinde geçersiz biçimli bir `segment_id` gelirse veritabanı 500 "Internal server error" döner, 400 dönmesi gerekir. Kişiye etkisi: sayfa "sunucu hatası" der.

## 2. A2 tasarımının bugünkü durumu (geçerli / değişmiş / bayat)
**Geçerli** (2026-10-05, `e929abc7`, yerel DB = main, 427 migration).
- `shift_exchanges_command_service` onay ve ret adımı hâlâ eski yardımcıya soruyor (satır 81-82, 121, 134). `exchange.approve` katalog kuralı hazır ama kullanılmıyor (`no_self = t`, `rank_below = t`, `restricted_ok = f`).
- `shift_exchange_preview` onaylayanın yetkisini ve diğer lokasyonun oyunun geçerliliğini aynı eski yardımcıyla ölçüyor (satır 14, 33-36). Boşluk 2 duruyor.
- `shift_exchange_notification_allowed` bildirim alıcılarını eski yardımcıyla seçiyor (satır 23-24). Boşluk 2 duruyor.
- `time_off_event_released_assignments` da eski yardımcıyı (`schedule.read`) kullanıyor; A2.4'teki silme listesinde.
- FB-6.4 hâlâ "draft, Mert'in onayı bekleniyor". Tasarımdaki üç boşluk A2.2'nin altına yazılmış. Owner'ın vardiyası sorusu (Boşluk 3) açık.
- **Bugünkü ölçümle eklenen tek şey:** belgesi eksik müdür de onaylayabiliyor. A2.2'nin `exchange.approve` çağrısı bunu da kapatır, ama Done when 6'da bunun için bir test hücresi yok.

## 3. Temiz çıkan kontroller
- **Grant'lar (tablo ve fonksiyon izinleri):**
  - 29 talep, oy, takas ve bildirim tablosunda RLS açık. Tarayıcı oturumuna (`authenticated`) ve oturumsuz ziyaretçiye (`anon`) tablo izni yok, politika da yok; yani yalnız servis anahtarıyla erişilebiliyorlar.
  - Bu ekranın 62 `public` fonksiyonunun hiçbiri `authenticated` ya da `anon` tarafından çalıştırılamıyor; `actor` parametresi alan yardımcılar dahil.
  - `app_private` (yetki çekirdeğinin şeması) `authenticated` için açık, `anon` için kapalı. Ama izin ve takas yardımcılarının hiçbiri çalıştırılamıyor.
- **Yetki veren fonksiyonların (SECURITY DEFINER) arama yolu:** 12 servisin hepsinde boş (`search_path=""`). Bu, fonksiyonun başka bir şemadaki sahte nesneye yönlendirilmesini önler.
- **Time off yetkisi çekirdekte:**
  - Okuma: `requests.read`, kişi bazlı, rütbe ve "kendisi değil" kuralıyla.
  - Onay/ret: önce `time_off.decide_alone` (tek başına karar), olmazsa lokasyon başına `time_off.decide` (rütbe kuralıyla).
  - Geri alma ve kısaltma: `time_off.revoke` (rütbe kuralıyla).
  - Probe sonucu: eş müdür için okuma, karar ve geri alma `rank`; kendi talebi için `rank`.
  - Bilinmeyen talep id'si de kapsam dışı talep de aynı cevabı alıyor (`authz.out_of_scope`).
- **M2 (lokasyon kapsamı):** liste `reached` (okunabilen kişiler), lokasyon filtresi çekirdekle denetleniyor. Lokasyon seçicide yalnız erişilebilen ve arşivlenmemiş lokasyonlar var. Çok lokasyonlu çalışanın talebinde her lokasyon kendi oyunu veriyor (`time_off_location_voters`, `time_off_state`).
- **İzin bildirimleri:** alıcılar çekirdekten seçiliyor (`time_off_deciders`); işlemi yapan kişi alıcıdan çıkarılıyor.
- **Yarış durumu (iki kişi aynı anda):**
  - İzin onayı, geri alma ve kısaltma aynı workspace kilidini alıyor, talep satırını kilitliyor ve sürüm numarasını kontrol ediyor. Onay ayrıca etkilenen vardiyaların özetini karşılaştırıyor; vardiyalar değiştiyse "yeniden incele" diyor.
  - Takas onayı da vakayı kilitliyor, sürümü kontrol ediyor; vardiya satırları kilitlendikten sonra kontrolü yeniden yapıyor.
- **Hata metni:** veritabanının kendi cümlesi kullanıcıya gitmiyor (BL-131 süzgeci); 500 hatalarında genel metin dönüyor.
- **Web:** `dangerouslySetInnerHTML` (HTML'i doğrudan sayfaya basma) kullanılmıyor.
  - Approve ve Deny düğmeleri sunucunun döndürdüğü "oy verebilir mi" bilgisine, Revoke `can("time_off.revoke")`'a bağlı. Yetki yoksa "View-only access" yazıyor.
  - Rota `App.tsx:377`'de sarmalsız, ama sayfa kendi içinde `PermissionRoute` ile sarılı (`ScheduleRequestsPage.tsx:56`); bu bilinçli bir tercih.
- **Log:** yalnız workspace ve vaka id'si yazılıyor; kişisel veri yok.

## 4. Sınırda
- **Shift Hub (ekran 13)** takas fonksiyonlarının aynısını kullanıyor: çalışan görünümüyle okuma, adaylar ve komut. Y1'in düzeltmesi iki ekranı birlikte değiştirir.
- **Talep açma ve iptal isteği** (`submit_time_off_service`, `request_time_off_cancellation_service`) Employee Hub ve Shift Hub'a ait. Rotaları bu ekranın dosyasında (`time-off-voting-routes.ts`) duruyor.
- **Canlı kanal:** `shift-exchanges:<workspace>` kanalını workspace'te takas açabilen herkes dinleyebiliyor (`exchange.offer_own`). Kanala izin değişikliklerinde talep id'si, takas değişikliklerinde vaka id'si ve sürüm numarası gidiyor; içerik yok. Örnek: garson Hande, başka birinin izin talebinin değiştiğini id'siyle duyabilir ama ne olduğunu göremez. Bulgu saymadım.
- **Workspace sayacı ve Notifications** takas bildirim alıcısını Y1'deki eski yardımcıyla seçiyor. Y1 düzelince eş müdürün bildirimleri de kesilir.
- **`PermissionRoute`** rolün izin listesine bakıyor (BL-176, FB-6.8'e ait). Requests sayfası da ona bağlı.

## 5. Kanıtlanamayan şüpheler
- **Vardiya yazımı ile izin onayı aynı anda:** izin onayı etkilenen vardiyaların özetini workspace kilidi altında karşılaştırıyor. Schedule ızgarasının bütün yazma yolları aynı kilidi alıyor mu, ölçmedim. Almayan bir yol varsa onay, az önce değişen bir vardiyayı görmeden geçebilir.
- **Bekleyen izni kim görür:** okuma kişi bazlı, oy ise talebin gerektirdiği lokasyonlara bağlı. Talep açıldıktan sonra bir lokasyon personelsiz kalırsa ya da çalışanın oradaki ataması biterse, o lokasyonun müdürü talebi "View-only" olarak görmeye devam edebilir. KARARLAR'a göre bekleyen talebi yalnız karar verebilen görür. Elimde bu durumu kuran bir kayıt yoktu ve SELECT ile kuramadım.
- **Arşivli lokasyon:** eski yardımcı lokasyonun canlı olup olmadığına bakmıyor, çekirdek bakıyor. Arşivli lokasyondaki açık bir takası eski yetkiyle onaylamak mümkün olabilir. Yerelde böyle bir vaka yok.

## Kanıt listesi (komut + sonuç)
- `git rev-parse origin/main` → `e929abc7…`, HEAD ile aynı.
- Yerel DB'de 427 migration, en sonuncusu `20261007030000`; repodaki migration sayısıyla aynı (427).
- `pg_proc` + `has_function_privilege`: 12 servisin hepsinde SECURITY DEFINER evet, arama yolu boş, `authenticated` ve `anon` için çalıştırma izni yok. `public` altındaki 62 izin ve takas fonksiyonunda da `authenticated` ve `anon` izni yok.
- `pg_class` + `role_table_grants` + `pg_policies`: 29 tabloda RLS açık; `authenticated` ve `anon` için tablo izni yok, politika yok.
- `pg_publication_tables`: talep tablolarının hiçbiri canlı yayın listesinde değil. Canlı kanal politikası `shift-exchanges:` → `rls_can(...,'exchange.offer_own')`.
- `app_private.authz_actions`:
  - `requests.read`: kişi bazlı, `no_self`, `rank_below`.
  - `time_off.decide`: lokasyon bazlı, `no_self`, `rank_below`.
  - `time_off.revoke`: kişi bazlı, `rank_below`.
  - `exchange.approve`: lokasyon bazlı, `no_self`, `rank_below`, `restricted_ok = f`.
- Eş müdür probe'u, 3 workspace: `schedule_actor_has_capability_service(...)` → `t`; `time_off_reason(...,'exchange.approve', eş_müdür, lokasyon)` → `rank`.
- Belgesi eksik müdür probe'u, 3 workspace: eski yardımcı `t`; `authz_reason(...,'exchange.approve')` → `document_blocked`.
- İzin rütbe probe'u (workspace `77a40791…`): okuma, karar ve geri alma `rank`; kendi talebi `rank`.
- Sayfalama probe'u (workspace `e99ad7a2…`, owner, Closed, 7 talep):
  - sayfa boyu 100 → 7 talep;
  - sayfa boyu 3 → 3 talep, sonraki işaret `22:09:05.13`;
  - o işaretle sayfa boyu 3 → 3 talep, `22:08:51`'den başlıyor, `22:09:05.13` eksik.
- Okunan dosyalar:
  - `apps/api/src/schedule/schedule-requests-routes.ts`, `-service.ts`;
  - `apps/api/src/time-off/*.ts`, `apps/api/src/shift-exchanges/*.ts`, `apps/api/src/http-error.ts`;
  - `apps/web/src/views/ScheduleRequestsPage.tsx`, `apps/web/src/schedule/requests-data.ts`, `apps/web/src/lib/no-access.ts`;
  - fonksiyon gövdeleri `pg_get_functiondef` ile.
- Skill'ler: `supabase-postgres-best-practices` ve `verification-before-completion` açıldı.
  - `security-review` skill'inin her bulgu için ayrı yanlış alarm ajanı adımını uygulamadım. Onun yerine her bulguyu doğrudan SELECT probe'uyla doğruladım. Kanıtlayamadıklarımı 5. bölümde ayrı tuttum.
- Rol hafızasına bu turda yazmadım; görev salt okuma ve dosya yazmadan istendi.
