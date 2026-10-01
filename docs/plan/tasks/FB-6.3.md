# FB-6.3 İzin dilimi: lokasyon oylaması, geri alma, süre ve otomatik red (FOUNDATION-B Aşama 6)
Status: in progress — `.0` bitti 2026-10-01 (geçerli; Notes); `.1`–`.4` canlıda ve main'de (main `8d84f278`, 2026-10-01; `.2` `e7ec529e`; `.3`+`.4` canlıda ~10:42Z; `nf-guvenlik` ONAY @`4babd255`); küçük ek migration (KK-72) park — canlı onayı kullanıcıda; `.5` main'de ve canlıda (`13b7c8cd`, 2026-10-01; görünür değişiklik yok); `.6` başladı (`task/fb-6.3.6`); park paketi KK-72 + KK-75 + KK-76. Plan: spec ve tasarım kullanıcı onaylı (2026-09-30, kayıt oturumunun penceresinde, plan modu); K10/S4 kapandı. Sürüm 2: önceki sürümün ("o gün yayınlı vardiyası olan lokasyonlar, yoksa birincil lokasyon" oylaması) yerine geçer; eski metin `git show b25ee449:docs/plan/tasks/FB-6.3.md`. Başlamadan önce: `.0` taze ölçüm.
Session: `nf-db` `local_6b0b5907…` (`.3`+`.4`, 2026-10-01; `.1`+`.2`'yi `local_26c71a1c…` yaptı, bağlamı %50'de devretti)   Branch: `task/fb-6.3` (tek dal, adım başına dal yok; koordinatör, 2026-10-01)   Worktree: -   DB: `.1`–`.4`, `.7`, `.8`
Reviewer: `nf-guvenlik` her veritabanı adımında zorunlu (R3: yetki çekirdeği, yeni katalog anahtarları, veri silme, zamanlayıcı); ekran adımlarında (`.6`) `nf-gorsel-qa`; ultrareview önerilir. Onay biçimi `ONAY @<sha>`.

## Goal
İzin çalışanındır: çalışanın atandığı her lokasyonun manager'ı oy verir, admin/owner tek başına karar verebilir. Aynı kural iptal taleplerine uygulanır. Karar verilen izin, yayınlı ve başlamamış vardiyaları sistem eliyle open shift'e düşürür. Etkisi oy verene açıkça gösterilir. Süresi içinde karar çıkmayan talep otomatik reddedilir; önce karar vermeyenlere hatırlatma gider. Eski tek-lokasyon, tek-kişi, kısmi karar yolu silinir.

Neden (kullanıcı, 2026-09-30): eski kural taslak hâlindeki ya da henüz programı olmayan günlerde karar vereni bulamıyordu.

## Kurallar (spec — kullanıcı kararları 2026-09-30)
**Kim karar verir**
1. İzin çalışana bağlıdır; talepte lokasyon yoktur.
2. Karar verenler: çalışanın atandığı canlı lokasyonların manager'ları ve admin/owner. Rütbe kuralı kalır (KARARLAR "Rütbe"):
   - manager'ın talebine yalnız admin/owner karar verir;
   - admin'in talebine yalnız owner karar verir;
   - owner'ın kendi talebi onaysız kaydedilir;
   - kimse kendi talebine karar veremez.
3. Gereken lokasyonlar talep anında sabitlenir; sonradan eklenen lokasyon oy istemez.
   - Listeden düşenler: arşivlenen lokasyon, çalışanın çıkarıldığı lokasyon, karar verebilecek manager'ı kalmayan lokasyon.
   - Hiç lokasyon kalmazsa karar yalnız admin/owner'ındır ve bildirim onlara gider.

**Oylama**
4. Tek lokasyonda bir manager'ın onayı ya da reddi kesindir. Çok lokasyonda her lokasyondan en az bir onay gerekir. Birden çok lokasyonu yöneten manager'ın tek oyu hepsini kapsar.
5. Tek bir red talebi hemen kapatır.
6. Admin/owner kararı (onay ya da red) anında ve kesindir. Onay penceresi "hemen geçerli olur, çalışanın lokasyonlarının manager'larına bildirim gider" der.
7. Kısmi onay yoktur. Red notu yazılabilir (ör. "yalnız 11–12'yi onaylayabilirim"); çalışan isterse yeniden talep gönderir. "Return to pending" kalkar.
8. Oy, talep açıkken değiştirilebilir; onaydan redde dönmek talebi kapatır.
9. Çalışan talep kapanana kadar yalnız "Pending" görür; kapanınca sonucu ve notu görür.
10. Karar verenler ilerlemeyi görür: gereken lokasyonlar, kim onayladı ya da reddetti ve ne zaman, kalan sayı, son karar anı.

**Geri alma ve iptal**
11. **Revoke kalır.** Çalışanın lokasyonlarından herhangi birinin manager'ı ya da admin/owner tek başına geri alabilir.
    - Gerekçe zorunlu, onay penceresi çıkar.
    - Çalışana ve diğer manager'lara bildirim gider.
    - Yalnız başlamamış kısım kalkar; geçmiş kısım kayıtta "taken until …" olarak kalır.
12. Çalışanın iptal talebi aynı oylama kurallarıyla işler. Beklerken izin geçerli kalır.

**Vardiyalara etkisi**
13. Son onay anında sistem şunları yapar (oy verenin yayın yetkisi ya da vardiya vardiya seçim gerekmez):
    - izinle çakışan, yayınlı ve henüz başlamamış vardiyaların tamamı open shift'e düşer;
    - başlamış ya da geçmiş vardiya açılmaz;
    - taslak vardiyaya dokunulmaz: çakışma görünür, yayın engellenir;
    - gelecek günlere atama engellenir.
    İptal ya da revoke sonrasında açılan vardiyalar açık kalır; manager'lara "çalışan yeniden müsait, açık vardiyalar duruyor" bildirimi gider.
14. **Etki şeffaflığı.**
    - Talep detayında etkilenecek yayınlı vardiyalar lokasyon lokasyon listelenir.
    - Vardiya açacak oy ya da kararda onay penceresi "N vardiya open shift'e düşecek, emin misin?" diye sorar.
    - Manager'ın onayı, verdiği andaki kendi lokasyonunun etkisine bağlıdır. Etkilenen yayınlı vardiyalar değişirse oy "bekliyor"a döner ve manager'a "yeniden bak" bildirimi gider.
    - Bekleyen izinle çakışan vardiya yayınlanırken yayın penceresi bilgi notu gösterir.

**Bildirimler**
15. Kim neyi alır:

| Olay | Alıcı |
|---|---|
| Yeni talep | Gereken lokasyonların manager'ları; uygun manager yoksa admin/owner |
| Hatırlatma | Oy vermemiş lokasyonların manager'ları |
| Kesin karar ya da otomatik red | Çalışan ve gereken lokasyonların manager'ları |
| Vardiya açan onay | İlgili lokasyonların manager'ları |
| Oy sıfırlanması | O manager |

**Süre ve otomatik red**
16. Workspace ayarı "izin karar süresi" saat cinsindendir, varsayılan 24; Settings → Scheduling'de owner/admin değiştirir. Son karar anı = iznin başlangıcı − süre.
    - Süre içinde gönderilen talepte son karar anı iznin başlangıcıdır; form "acil durumda manager'ınla doğrudan konuş" der.
    - Süre değişikliği yalnız yeni talepleri etkiler.
17. Son karar anına kadar karar çıkmazsa sistem talebi reddeder ("Not decided in time"); çalışana ve manager'lara bildirim gider. İptal talebinde de aynı kural geçerli: süresi dolan iptal reddedilir, izin geçerli kalır.
18. Son karar anından 12 saat önce bir kez hatırlatma gider. Talep zaten bu pencerede gönderildiyse hatırlatma gitmez.
19. Bir talep tek ardışık tarih aralığıdır; gün başına saat seçimi kalır. Başlangıcı geçmiş talep gönderilemez ("bugün başlamış izin için manager'ınla doğrudan konuş").

## In scope
- Veri:
  - talep anındaki lokasyon listesi tablosu;
  - oy tablosu (oy + lokasyon başına etki parmak izi);
  - talepte `decide_by`, `reminded_at`, `fallback_notified_at`;
  - workspace ayarı `time_off_lead_hours`;
  - olay eylemi `expired`.
- Tek değerlendirme fonksiyonu `app_private.time_off_state`. Okuma, oy, zamanlayıcı ve bildirim aynı fonksiyonu kullanır.
- Diğer fonksiyonlar ve servisler:
  - `time_off_impact`, `time_off_settle`, `time_off_finalize`, `time_off_release_shifts`, `time_off_sweep`;
  - `submit_time_off_service`, iptal talebi servisi;
  - `decide_time_off_service(verdict, note, expected_impact)`;
  - `revoke_time_off_service(reason)`.
- Yetki kataloğu:
  - `time_off.decide` (manager oyu, değişmez);
  - `time_off.decide_alone` (yeni, admin/owner);
  - `time_off.revoke` (yeni);
  - `requests.read` kişi kapsamına geçer;
  - `time_off.request_own` artık gerçekten sorulur.
- `pg_cron` işi `time-off-deadlines`, 5 dakikada bir, doğrudan SQL.
- Bildirim anahtarları:
  - `requests.time_off.submitted`, `.reminder`, `.review_again`, `.status_changed`, `.decided`;
  - `schedule.time_off.shifts_opened` (bugün yalnız owner izninde olan genelleşir).
- API: `POST …/time-off/:id/verdict` ve `…/revoke`; okumalar `authorize(context,'requests.read')`. Shared şemalar.
- Web:
  - çalışan formu: lokasyonsuz, ardışık aralık, süre tavsiyesi, durumlar;
  - Requests → Time off detayı: ilerleme paneli (DEV'de 2–3 varyant), lokasyon başına etkilenen vardiyalar, onay pencereleri, revoke gerekçesi;
  - Settings → Scheduling'de süre alanı;
  - yayın penceresinde bekleyen izin notu.
- Kodda bulunan iki boşluk:
  - kısıtlı kişi bugün izin talebi gönderebiliyor (`20260930162000:180`, `document_blocked` sorulmuyor);
    - Tazelik 2026-10-01 (FB-6.3.0, `32dbbd05`): geçerli — `employee_hub_actor_service` (`20260930162000:180`) son tanım; `time_off.request_own` katalogda `restricted_ok = false` ama hiçbir fonksiyon bu eylemi sormuyor; iki eski gönderme servisi kontrolsüz.
  - bildirim tetikleyicisi lokasyonsuz talepte hata veriyor (`20260929190000:733`).
    - 2026-10-01 (FB-6.3.0): düzeltme `.4`'ten `.3`'e taşındı (Alt adımlar).

## Out of scope
- Izgarada onaylı izin işareti (bugün hücrede işaret yok): BL-204 konuşmasına kalır.
- Geçmişe dönük izin kaydı.
- E-posta bildirimi (yalnız uygulama içi).
- "İzin kısalır" ve takas tarafı FB-6.4'te (P1, 2026-09-27); bu dilim yalnız kısaltmanın yetkisini (`time_off.revoke`) ve `approved` bırakmasını değiştirir.

## Kenar durumlar (karara bağlandı)
| Durum | Ne olur |
|---|---|
| Lokasyonsuz çalışan, manager'ın ya da admin'in talebi | admin/owner (rütbe kuralıyla) |
| Owner'ın kendi talebi | onaylı kaydedilir; yalnız "vardiyalar açıldı" bildirimi |
| Listedeki lokasyon arşivlenir, çalışan oradan çıkarılır ya da manager'ı kalmaz | lokasyon düşer; kalanlar onaylıysa talep kesinleşir |
| Oy veren yetkisini kaybeder | oyu sayılmaz |
| Değişmeden yeniden yayın | oy sıfırlanmaz (parmak izi kaynak shift id + saat) |
| İzin gününe yeni vardiya yayını, yayından kaldırma ya da takas | o lokasyonun oyu sıfırlanır |
| İki oy aynı anda | önce workspace kilidi, sonra satır kilidi; ikinci oy kesinleştirir |
| Süre doldu, süpürme henüz koşmadı | oy anında önce süre kontrolü, sonra 40001 |
| Talep süre içinde gönderildi | son karar anı = başlangıç; hatırlatma yok |
| İzin sürerken revoke | geçmiş kısım kalır; bekleyen iptal kapanır |
| İptal ya da revoke sonrası açılmış vardiyalar | açık kalır; "yeniden müsait" bildirimi |
| Listede olmayan lokasyonda vardiya açılması | vardiya açılır; o lokasyonun manager'larına bildirim |
| Çalışan bekleyen talebi geri çeker | karar vericilere bildirim |
| Kısıtlı kişi | talep gönderemez, oy veremez; **owner hariç** — owner belge son tarihlerinden ve kısıtlamalarından her zaman muaftır (kullanıcı kararı 2026-10-01) |
| Workspace kapalı | bugünkü `workspace_closed` reddi |

## Done when
1. Matristeki her kenar durum satırı ve aşağıdaki kurallar birer hücre olarak yeşil:
   - tek ve iki lokasyonlu oylama;
   - iki lokasyonu yöneten tek manager;
   - tek red;
   - admin/owner tek başına;
   - rütbe;
   - etki değişince oyun sıfırlanması ve yanlış etkiyle 40001;
   - başlamış ve taslak vardiyanın açılmaması;
   - ardışıklık ve geçmiş başlangıç reddi;
   - revoke gerekçesi ve geçmiş kısmın korunması;
   - süre ve geç talep;
   - hatırlatmanın bir kez gitmesi ya da hiç gitmemesi;
   - süresi dolan talep ve iptal;
   - cron işinin varlığı.
2. `decide_alone`, `revoke` ve `requests.read` matrise girdi; `known_gap time-off-needs-location` silindi; `authz_catalog` sayaçları artmadı.
3. "Envanter: silinecekler" listesindeki her nesne yok ve `retired_objects_stay_gone`'da.
4. Ekranlar, kullanıcının seçtiği varyantla:
   - Requests → Time off'ta ilerleme ve etki görünüyor;
   - vardiya açan oyda ve admin/owner kararında onay penceresi çıkıyor;
   - revoke gerekçe istiyor;
   - çalışan yalnız "Pending" ve sonucu görüyor;
   - Settings → Scheduling'de süre alanı var.
   `nf-gorsel-qa` ONAY.
5. e2e akışı (`e2e/flows/time-off-approval.spec.ts`) yeşil: Ali (Kadıköy + Beşiktaş) talep gönderir; Ayşe onaylar ve "waiting: Beşiktaş" görür; Mehmet "1 shift becomes open" onayıyla bitirir, talep Approved, vardiya open. Ek dallar: notlu red, admin'in tek başına kararı.
6. Canlıda: migration'lar OPS-03 sırasıyla gönderildi (ekler önce canlı, silmeler önce main); fonksiyon gövdelerinin md5'i dosyayla aynı; güvenlik danışmanında yeni bulgu yok; `time-off-deadlines` cron işi var.
7. KARARLAR "İzin" ve "Rütbe" bu kurallarla aynı; FOUNDATION-B ve ILERLEME kaydı güncel.

## Alt adımlar (sıra, sahip, DB kilidi)
Her adımda ratchet kuralı geçerli:
- `authz_catalog` sayaçları artmaz;
- yeni fonksiyon, eskisi aynı commit'te silinerek girer (dilim 1 eklerinde eski servisler `.7`'ye kadar kalır; yayındaki eski ekran çalışsın diye);
- migration önce tek transaction + rollback ile denenir;
- migration adları `20261003020000`'dan büyük.
- Ölçüm 2026-10-01 (FB-6.3.0, `32dbbd05`; alt ajan, yerel DB SELECT dahil): yedi sayacın yedisi tavanda — `auth.uid()` fonksiyon 24/24, JWT köprüsü 24/24, kendi kapsam mantığı 41/41, `_base/_vN/_legacy` 13/13, `auth.uid()` politika 10/10, ertelenmiş trigger 10/10, hint'siz 42501 173/173: yeni fonksiyon hiçbir kalıbı taşıyamaz. `ci-green.txt` 147 satır. `known_gap time-off-needs-location` (`authorization_matrix.test.sql:817`). `pg_cron` kurulu, 4 iş; `time-off-deadlines` yok. Bildirim anahtarları `requests.time_off.reminder`, `.review_again`, `.decided` yok; `schedule.owner_time_off.shifts_opened` aktif.

| Adım | İş | Sıra | Sahip | DB kilidi | Dosyalar |
|---|---|---|---|---|---|
| **FB-6.3.0** | Taze ölçüm: plan modundaki keşif `c345ed83`'te yapıldı; başlamadan `origin/main`'de yeniden. Ölçülecekler: `pg_proc` taramaları (`location_id`, `partially_approved`, decision pieces). **Bitti 2026-10-01 (`32dbbd05`): geçerli; sekiz düzeltme bu dosyaya yazıldı (Notes).** | 0 | `nf-planlama` | Hayır | bu dosya |
| **FB-6.3.1** | Matris ve yeni pgTAP dosyaları kırmızı: `time_off_voting.test.sql`, `time_off_deadlines.test.sql`; builder `tests.time_off` yeni servisle, varsayılan gelecek hafta. **Bitti 2026-10-01 (`22655dee`):** 5/5 kırmızı, doğru sebeple; kurucu yeni `tests.leave` (`tests.time_off` değişmedi, `.7`'de birleşir); main'e yalnız `.3`+`.4` ile (matris, kapsam ve katalog testleri CI-yeşil listede). **Main'de 2026-10-01 (`f630fd91`).** | 1 | `nf-db` | Evet | `supabase/tests`, `supabase/test-support/builder.sql` |
| **FB-6.3.2** | Ekler: lokasyon listesi tablosu, oy tablosu, talepte yeni kolonlar, `location_id` ve `actor_user_id` nullable, `expired`, `time_off_lead_hours` (`20261003030000_time_off_is_decided_by_its_locations`). **Yalnız ekler: önce canlı, sonra main.** **Bitti 2026-10-01 (`d26807ed`):** rollback'li ölçüm CI-yeşil 147 dosya, tek kırmızı yerel kayma BL-497. Canlıya koordinatör MCP ile gönderir, `nf-guvenlik` onayından sonra (kullanıcı kararı 2026-10-01). **Canlıda ve main'de 2026-10-01:** `nf-guvenlik` ONAY @`d26807ed`; canlı kayıt `20261001083355` → `20261003030000`'e eşlendi, dosya md5 `d3d5b22e…` canlıya uygulanan metinle aynı (koordinatörün ölçümü; dosya md5'i kayıt oturumu ölçtü); main `e7ec529e` (`d26807ed` ile aynı yama, `git patch-id`); ortak yerel DB 405 migration, iki tablo var (ölçüldü); main CI 36837260538 (`bfb34c0d`) check + db + e2e yeşil (ölçüldü, `gh run view`, besleme #41). | 2 | `nf-db` | Evet | migration |
| **FB-6.3.3** | Oylama motoru: `time_off_state`, `time_off_impact`, `time_off_settle`, `time_off_finalize`, `time_off_release_shifts`; `submit_time_off_service`, iptal servisi, `decide_time_off_service`, `revoke_time_off_service`; katalog `decide_alone` ve `revoke`; kısaltma `approved` bırakır. Bildirim tetikleyicisinin lokasyonsuz talep düzeltmesi de burada (`notify_schedule_request_event_service`, `20260929190000:733–734`, `raise 'schedule request location not found'`; 2026-10-01'de `.4`'ten taşındı: `.2` `location_id`'yi nullable yapar, `.3`'ün `submit_time_off_service`'i lokasyonsuz `submitted` olayı yazar, düzeltme `.4`'te kalsa `.3`'ün testleri kırmızı kalır). **Owner istisnası** (kullanıcı kararı 2026-10-01): owner belge kısıtına girmez — talep ve oy kısıt kontrolünü owner için atlar (tek koşul). `time_off_period_span` ve `time_off_request_periods` lokasyonsuz talepte boş dönüyor; burada düzeltilir. Bildirim tetikleyicisi yeniden yazılınca "kendi kapsam mantığı" sayacı 41'den 40'a iner; tavan aynı commit'te düşer. `nf-guvenlik`'in iki düşük bulgusu (2026-10-01, `.2` incelemesi): oy verenin üyeliği yetki çekirdeğine sorulur; `notify_schedule_request_event_service`'teki `employee.user_id <> new.actor_user_id` `is distinct from` olur (yoksa kişisiz `expired` olayı kimseye gitmez). **Canlıda ve main'de 2026-10-01** (main `53db4a8b` + düzeltmeler `fc3691ff`, `c96c644c`, `8d84f278`; dosya md5 `2ba5e1e4…`; `nf-guvenlik` ONAY @`4babd255`; Notes). | 3 | `nf-db` | Evet | migration `20261003031000_time_off_votes_decide_requests` (ad `nf-db`'nin, 2026-10-01) |
| **FB-6.3.4** | Okumalar (`get_schedule_requests_service` kişi bazında, `get_employee_hub_service`), yayın notu, `time_off_sweep` ve cron işi (`…032000_time_off_deadlines_close_requests`). Bildirim tetikleyicisi 2026-10-01'de `.3`'e taşındı. **Canlıda ve main'de 2026-10-01 (main `52fa0024`; dosya md5 `85e6e9b3…`), yayın notu hariç — `.5`/`.6`'ya taşındı (KK-71, 2026-10-01; `nf-db` raporu §5.5); inceleme `.3` ile aynı.** | 4 | `nf-db` | Evet | migration |
| **FB-6.3.5** | API + shared + web veri katmanı: `verdict` ve `revoke` uçları, okumalarda `authorize`, şemalar (`progress`, `decide_by`, ardışıklık). Eski uçlar bu adımda **kalkmaz** (KK-73, 2026-10-01): `.6` bitene kadar bugünkü izin ekranları (Requests → Time off, Employee hub izin bölümü) onları kullanıyor ve main her gönderimde canlıya çıkıyor; `.7`'de silinir. Öneri (`nf-guvenlik`, 2026-10-01): API yeni tabloları yalnız SECURITY DEFINER fonksiyonlarla okur. **Yayın notunun veri kısmı da burada** (KK-71, 2026-10-01; `.4`'ten taşındı): yayın penceresinin okuması "bu haftada bekleyen izin talepleriyle çakışan vardiyalar"; veritabanı okuması gerekirse `.5`'ten önce küçük bir `nf-db` eki (`nf-backend` sözleşmeyi okurken söyler). **BL-496'nın kod kısmı da burada** (KK-69, 2026-10-01): shared şemaların bölünmesi, `index.test.ts`, `organization-data.ts:352,359`, 5 web kod dosyası, fikstürler, 3 API testi — kod alanı okumayı bırakıp main'e girer; veritabanı kısmı `.7`'de (Envanter → BL-496). | 5. `.2`–`.4` main'de | `nf-backend` | Hayır | `apps/api/src/time-off/`, `schedule-requests-routes.ts`, `packages/shared`, `requests-data.ts`; BL-496: `organization-data.ts`, 5 web kod dosyası, API testleri |
| **FB-6.3.6** | Ekranlar: çalışan formu, Requests → Time off ilerleme paneli (DEV'de 2–3 varyant, kullanıcı seçer), onay pencereleri, revoke (Requests sayfası `requests-data.ts:160` `useScheduleRequests` hook'una geçer, sayfadaki eski aynı anahtarlı sorgu silinir — `nf-guvenlik` D4, 2026-10-01; lokasyonsuz izin formu KK-76'nın hub alanları gelene kadar geçici yolla çalışır — ilk lokasyonun dilimi, uyarı gönderimden sonra — alanlar gelince geçici yol silinir), Settings süre alanı, yayın notu (ekran metni; verisi `.5`'te, KK-71). | 6. `.5`'ten sonra | `nf-arayuz` → `nf-gorsel-qa` | Hayır | `ScheduleRequestsPage.tsx`, `EmployeeHubPage.tsx`, `TimeOffCancellation.tsx`, Settings |
| **FB-6.3.7** | Silmeler (`20261003040000_time_off_forgets_location_and_parts`): eski satırlar, `location_id`, `viewed_at`, `time_off_decision_pieces`, `partially_approved`, eski fonksiyonlar; eski izin API uçları (`nf-backend`; KK-73, `.5`'ten taşındı). **Alan silen iş: önce main, sonra canlı.** Kırmızılar yeşile. (`ci-green.txt` bu adımın işi değil: yeni pgTAP dosyası içeren her main gönderiminden önce `bash scripts/ci-green-guard.sh <origin/main sha>` koşulur; ders 2026-10-01, main CI 36851164089.) **BL-496'nın veritabanı kısmı da bu adımda** (kullanıcı kararı 2026-10-01; kod kısmı `.5`'te, KK-69; Envanter → BL-496). | 7. `.6` main'de | `nf-db` + `nf-test` | Evet | migration, `supabase/tests`; BL-496: iki okuma fonksiyonu, iki CHECK, kolonlar, üç pgTAP |
| **FB-6.3.8** | e2e akışı. | 8 | `nf-test` | Evet | `e2e/flows/time-off-approval.spec.ts` |
| **FB-6.3.9** | Kapanış: onaylar, tam kapı, main + CI, canlı md5, Notes, FOUNDATION-B kaydı. | 9 | koordinatör | Evet (e2e) | bu dosya, `FOUNDATION-B.md` |

## Envanter: silinecekler (`.7`; ikiz sistem kalmaz)
- **Fonksiyonlar:**
  - `decide_time_off_with_assignments_service`, `preview_time_off_assignment_decision_service`;
  - `resolve_schedule_time_off_request_service`, `resolve_time_off_period_decision_service`;
  - `apply_time_off_period_decision`, `apply_time_off_cancellation_decision`;
  - `submit_employee_time_off_service`, `submit_employee_time_off_periods_service`, `mark_schedule_time_off_viewed_service`, `submit_employee_time_off_cancellation_service` (yerine `request_time_off_cancellation_service`; 2026-10-01'de "yeniden yazılacak"tan buraya);
  - `app_private.authorize_time_off_decision`, `app_private.authorize_time_off_request`;
  - `time_off_proposed_approved_ranges`, `guard_time_off_decision_piece`, `notify_owner_time_off_open_shifts`;
  - bildirim anahtarı `schedule.owner_time_off.shifts_opened`.
- **Tablo ve alanlar:** `time_off_decision_pieces`; `location_id`, `viewed_at`; `partially_approved` (CHECK değil, `time_off_request_status` enum değeri — pending, approved, denied, partially_approved, revoked; `.7`'de enum yeniden kurulur); olay eylemleri `viewed`, `partially_approved`, `returned_to_pending`.
  - Envanterde olmayan izin tabloları (FB-6.3.0, 2026-10-01): `time_off_assignment_releases`, `time_off_commands`, `time_off_cancellation_links`, `time_off_cancellation_periods`, `schedule_time_off_segments`. "Kalır / silinir" kararını `nf-db` `.1`'de verir ve gerekçesiyle raporlar (teknik iç ayrıntı, `CLAUDE.md` §13); karar gelince buraya yazılır. **Karar (`nf-db`, 2026-10-01, (a) raporu §4): beşi de kalır** — `schedule_time_off_segments` (iznin istenen saatleri, gün gün), `time_off_assignment_releases` (onayın açtığı vardiyalar; bildirim ve talep detayı), `time_off_cancellation_links` (iptal talebi hangi izne ait), `time_off_cancellation_periods` (geri verilen saatler; revoke da kullanır), `time_off_commands` (aynı istek iki kez gelmesin). Silinecek tek izin tablosu `time_off_decision_pieces`.
- **Yeniden yazılacak okuyucular** (FB-6.3.0, 2026-10-01; `partially_approved` okuyan, silme listesinde olmayan 10 kalem; `submit_employee_time_off_cancellation_service` 2026-10-01'de silinecekler listesine geçti): `time_off_decided_ranges`, `time_off_request_periods`, `time_off_cancelled_ranges`, `time_off_cancellation_context`, `notify_time_off_shortened`, `reconcile_notification_platform_service`, `schedule_week_availability`, `assess_weekly_shift_availability`, `get_employee_hub_service`, `shorten_time_off_service` / `shorten_time_off`.
- **API:** `/assignment-preview` (yalnız izin ucu; belge ucu `apps/api/src/employees/document-lifecycle-routes.ts:72,204`, `apps/web/src/documents/document-data.ts:207` kalır), `/decision`, `/viewed` uçları.
- **Shared:** kısmi karar, parça, dispozisyon ve önizleme şemaları; `legacy_location`.
- **Web:** `TimeOffPartialDecision.tsx`, release kutuları, `restricted_count` engeli, Partial ve Return to pending düğmeleri, formdaki lokasyon seçimi.
- **pgTAP:** `time_off_partial_period_decisions`, `time_off_published_assignment_disposition`, `time_off_decision_identity_guard`.
- **BL-496 (kullanıcı kararı 2026-10-01; `.7` ile aynı canlı pencerede, önce main sonra canlı):** kullanılmayan departman ve iş `sort_order`'u düşer. Sahiplik (KK-69, 2026-10-01): Shared, Web ve API testleri `.5`'te `nf-backend` (kod alanı okumayı bırakıp main'e girer); DB ve pgTAP `.7`'de `nf-db` — OPS-03 sırası (önce main, sonra canlı DROP) kendiliğinden tutar. Ölçüm FB-6.3.0 (`32dbbd05`):
  - Shared (`.5`): `packages/shared/src/index.ts` `departmentSchema` `:841`, `jobSchema` `:854`, `scheduleReferenceSchema` `:1247` — taban şema bölünür (vardiya tipi `:1262` ve etiket `:1268` `sort_order`'u korur); `index.test.ts`'te 6 yer.
  - DB (`.7`): `app_private.schedule_departments_and_jobs` ve `public.read_settings_jobs_service` (son tanım `20261003010000`); `create_department_jobs_service` ve `create_department_with_jobs_service`'in satır JSON'ı kontrol edilir; `departments_sort_order_unused`, `jobs_sort_order_unused` CHECK'leri ve kolonlar düşer.
  - Web (`.5`): `organization-data.ts:352,359` + 5 kod dosyası (`ScheduleShiftDesignPage`, `PublishReturn.preview`, `useCellState`, `scheduleGridLayout`, `organization-data`) + fikstürler (47 test dosyasında `sort_order` var; departman ve iş olanlar iş sırasında ayrılır).
  - API testleri (`.5`): `employee-hub-read-service.test.ts`, `schedule-service.test.ts`, `settings-reads-routes.test.ts`.
  - pgTAP (`.7`): `catalog_sorted_by_name` (6), `reads_know_management_and_owner` (4), `schedule_read_model_rls` (2).
- **Veri:** bütün eski izin satırları silinir (canlı veri yok; yeni kurala uymuyorlar).

## Touches
- `supabase/migrations/`, yeni dört dosya. Dayanaklar:
  - `20260930162000_refusals_answer_alike.sql`;
  - `20260929190000_time_off_shortens_for_a_shift.sql`;
  - `20260924123013` (katalog);
  - `20261003000000` (`actor`, `authz_check`).
- `supabase/tests/`:
  - yeni: `time_off_voting`, `time_off_deadlines`;
  - yeniden yazılacak: `time_off_requested_periods`, `_cancellation_requests`, `_decisions_go_one_rank_up`, `_doors_close_with_the_workspace`, `_shortens_for_a_shift`, `_physical_request_counts`, `owner_time_off_notifies_open_shifts` → `time_off_opens_shifts`, `authorization_matrix`, `authorization_coverage`, `retired_objects_stay_gone`.
- `supabase/test-support/builder.sql`.
- `packages/shared/src/index.ts`, `time-off.ts`, `employee-hub.ts`, `authorization.ts`, `authorization-matrix.expected.json`.
- `apps/api/src/schedule/schedule-requests-routes.ts`, `apps/api/src/time-off/`, `apps/api/src/employee-hub/employee-hub-service.ts`.
- FB-6.3.0 ile eklenenler (2026-10-01): `apps/api/src/schedule/schedule-requests-service.ts` (eski çağrılar `:50` preview, `:70` viewed, `:79` decide, `:93` resolve), `apps/api/src/schedule/time-off-decision-service.test.ts`, `apps/api/src/employee-hub/employee-time-off-service.test.ts`, `supabase/tests/owner_time_off_needs_no_documents.test.sql`, `e2e/flows/shift-hub-time-off.spec.ts`.
- `apps/web/src/views/ScheduleRequestsPage.tsx`, `views/EmployeeHubPage.tsx`, `employee-hub/TimeOffCancellation.tsx`, `TimeOffPeriods.tsx`, `schedule/requests-data.ts`, Settings → Scheduling, yayın penceresi.

## Test plan
- **pgTAP:** Done when 1–3.
- **vitest:** `ScheduleRequestsPage`, `EmployeeHubPage`, `TimeOffCancellation`, Settings sayfası, API rotaları (403/404 sözleşmesi), shared ardışıklık şeması.
- **e2e:** Done when 5.
- **Tam kapı:** `lint`, `typecheck`, `test`, `build`, `test:db` (`db.lock` ile), etkilenen e2e.
- **Canlı:** md5 karşılaştırması (besleme #22 dersi) ve güvenlik danışmanı.

## Risk
- **R3.**
- **Sözleşme iki adımda değişir:**
  - `.2`–`.4` yalnız ekler; eski servisler kalır, yayındaki eski web çalışır.
  - `.7` silmeleri ancak yeni web main'de ve canlıdayken gider.
- **Zamanlayıcı tek transaction'da süpürür (500 talep sınırı):** hacim büyürse talep başına commit eden prosedüre çevrilir.
- **Tahmini iş:** 3–4 gün.

## Skills
- Plan: `superpowers:writing-plans`; yürütme: `superpowers:executing-plans`.
- SQL/RLS: `supabase:supabase`, `supabase:supabase-postgres-best-practices`.
- Önce kırmızı: `superpowers:test-driven-development`.
- Beklenmedik kırmızı: `superpowers:systematic-debugging`.
- Ekran: `frontend-design:frontend-design`.

## Notes / Result
- 2026-09-30 gece (kayıt oturumu `local_2c32c047…`; kullanıcının penceresinde plan modu, kullanıcı onayladı): sürüm 2 yazıldı. Kullanıcı K10'u cevaplarken izin kuralını baştan koydu ve on üç ayrıntıyı tek tek seçti:
  - rütbe kalır;
  - manager'sız lokasyon düşer;
  - kısmi onay yok, red notu var;
  - revoke tek kişiyle, gerekçeli;
  - talep anındaki liste sabit;
  - taslak dokunulmaz, geçmiş açılmaz;
  - açılan vardiya açık kalır;
  - etki değişince oy sıfırlanır;
  - izin işareti BL-204'e;
  - süre workspace ayarı, 24 saat;
  - hatırlatma redden 12 saat önce;
  - geç talep gönderilir, tavsiyeyle;
  - tek ardışık aralık;
  - geçmiş başlangıç gönderilemez.

  Keşif üç salt okur ajanla `c345ed83`'te yapıldı; tasarım bir Plan ajanıyla. Plan dosyası: `~/.claude/plans/koordinat-r-session-n-n-di-er-sessionlar-purrfect-salamander.md`.

  Sürüm 1'in kayıtları git'te: `git show b25ee449:docs/plan/tasks/FB-6.3.md`. 2026-09-27 kayıtları: P1–P3; S1 (a) talebin bütünü, bugün de geçerli; S2 (a) lokasyonun herhangi bir müdürü, bugün de geçerli; S3 (a) birincil lokasyonun saat dilimi, bugün de geçerli; S4, K10 ile bu sürümde kapandı.
- 2026-10-01 (kayıt oturumu `local_1238630c…`, koordinatör beslemesi #32): **FB-6.3.0 bitti — plan başlamaya hazır.** Kaynak: `nf-planlama` alt ajanı (salt okuma, `origin/main` `32dbbd05` + ortak yerel DB SELECT; koordinatörün aktardığı). Kayıt oturumu `250c345c`'de elle doğruladı (`32dbbd05`'ten beri yalnız `docs/` değişti): `c345ed83..32dbbd05` 13 commit, `supabase/`'ta 0; 404 migration, son `20261003020000`; `20260929190000:733–734` hata satırı `:711`'de başlayan `notify_schedule_request_event_service`'te; `time_off.request_own` migration'larda yalnız katalog satırında; `time_off_request_status` enum'u; beş tablonun migration'ı; belge ucu satırları; `schedule-requests-service.ts`'in dört çağrısı; Touches'a giren dört test/e2e dosyası; `ci-green.txt` 147; `authorization_matrix.test.sql:817`; shared `:841`, `:854`, `:1247`, `:1262`, `:1268`; `index.test.ts`'te 6 `sort_order`; `organization-data.ts:352,359`; `catalog_sorted_by_name` dosyası. Ölçülmeyen (alt ajanın): yerel DB (404 = main, `pg_cron` 4 iş, bildirim anahtarları), ratchet sayaçları, 11 okuyucu, 47 test dosyası, BL-496'nın DB fonksiyonları.
  - **Tazelik 2026-10-01 (`32dbbd05`): geçerli** — `c345ed83`'ten beri `supabase/` değişmedi (13 commit, hepsi web/script/belge); yerel DB = main (404 migration, son `20261003020000`).
  - Yazılan düzeltmeler (8): `.3`'e bildirim tetikleyicisi (`.4`'ten); Envanter → Tablo ve alanlar (enum; envanterde olmayan beş tablo, kararı `nf-db` `.1`'de); Envanter → yeniden yazılacak okuyucular; Envanter → API (belge ucu kalır); Touches'a beş dosya; Alt adımlar → ratchet ölçümü; `.7`'ye BL-496 (Envanter → BL-496); In scope → iki boşluğun tazeliği.
  - Sıradaki: `.1`–`.4` `nf-db` (`local_e9aa34f5…`, R3), dal `task/fb-6.3` (koordinatörün aktardığı; kayıt anında dal yok, ölçüldü).
- 2026-10-01 (kayıt oturumu `local_1238630c…`, koordinatör beslemesi #33): BL-496'nın kod kısmı `.5`'e (`nf-backend`), veritabanı kısmı `.7`'de (`nf-db`) — KK-69 (koordinatörün süreç kararı; dayanak `CLAUDE.md` §4 + OPS-03; Mert: onaysız). Tek dal `task/fb-6.3`, adım başına dal yok (koordinatör). Eski `nf-db` oturumu (`local_e9aa34f5…`, bağlam %49) FB-6.3'e başlamadı, temiz oturum önerdi; yeni oturum kullanıcıda.
- 2026-10-01 (kayıt oturumu, besleme #36): `.1`–`.4` yeni `nf-db` oturumuna verildi (`local_26c71a1c…`; Opus 5.5 / high, ölçüldü). Dal `task/fb-6.3` main ucunda açık (`d7a46e8c`, ölçüldü).
- 2026-10-01 (kayıt oturumu `local_1238630c…`, koordinatör beslemesi #38): **`.1` ve `.2` dalda bitti** (`22655dee`, `d26807ed`, `task/fb-6.3`; ölçüldü). Rapor: `.newfork-inbox/new/20261001T082830-nf-db-fb-6-3-fb-6-3-2.md`. Beş tablo: beşi de kalır (Envanter). **Kullanıcı kararları:** (1) owner belge son tarihlerinden ve kısıtlamalarından her zaman muaftır — KARARLAR "Ürün kuralları" yeni satır, ILKELER P08'e istisna, Kenar durumlar "Kısıtlı kişi" satırı ve `.3`; (2) `.2`'nin canlı gönderimini koordinatör MCP ile yapar, `nf-guvenlik` onayından sonra. `.3`+`.4` yeni `nf-db` oturumunda (`local_6b0b5907…`); `local_26c71a1c…` bağlamı %50'de devretti.
  - `nf-db`'nin "Senin yerine verdiğim kararlar"ı (rapor §5): (1) yeni kurucu `tests.leave`, `tests.time_off` değişmedi (9 CI-yeşil dosya eskisini kullanıyor; `.7`'de birleşir); (2) commit'ler ayrık — `d26807ed` tek başına canlıya ve main'e gidebilir, `22655dee` main'e yalnız `.3`+`.4` ile; (3) vardiya parmak izi kimlikten değil içerikten (lokasyon, iş, tarih, saat): değişmeden yeniden yayın oyu düşürmez; (4) oy anındaki etki talebin tamamının parmak izi, oy verenin lokasyonları ayrı tutulur; bir lokasyonda etki değişirse oyun tamamı düşer; (5) iptal talebi bugünkü gibi saat seçtirir, yalnız onay yolu oylamaya geçer; yeni servis `request_time_off_cancellation_service`, eskisi `.7`'de silinir; (6) revoke: başlamamış izin `revoked`; başlamış izinde gelecek kısım geri alınır, durum `approved` kalır, ekran "Revoked · taken until Oct 3, 2 PM" (`.4`'te `display_status`); (7) otomatik red yeni durum açmaz: `denied` + olay `expired`, not "Not decided in time"; (8) katalog: `time_off.decide_alone` organizasyon kapsamı, `time_off.revoke` kişi kapsamı, ikisi de rütbeli ve kendine yok; `requests.read` kişi kapsamına geçer; (9) migration adları `20261003031000_time_off_votes_decide_requests` (`.3`) ve `20261003032000_time_off_deadlines_close_requests` (`.4`).
- 2026-10-01 (kayıt oturumu, besleme #39): **`.2` canlıda ve main'de.** `nf-guvenlik` ONAY @`d26807ed`, kritik/yüksek yok; iki düşük bulgu `.3`'e, bir öneri `.5`'e yazıldı. Canlı: kullanıcı onayıyla koordinatör MCP ile ~08:33Z; canlı kayıt `20261001083355` → `20261003030000`'e eşlendi, dosya md5 `d3d5b22e…` canlıya uygulanan metinle aynı (koordinatörün ölçümü; dosya md5'i kayıt oturumu ölçtü); yedek ve geri dönüş SQL'i `newfork-wt/coord/artifacts/coord/fb-6.3/live-before-20261003030000.txt`; danışmanda yeni tablolar için yalnız INFO "RLS enabled no policy" (tasarım). Main `e7ec529e` + iki rol hafızası commit'i (`2690c3b5`, `bfb34c0d`); main CI 36837260538 kayıt anında koşuyordu. `.3`+`.4` `nf-db` `local_6b0b5907…`'de; dal `task/fb-6.3` main'e rebase edildi (`f55a893d`, yalnız `.1`).
- 2026-10-01 (kayıt oturumu `local_b0d3be14…`, besleme #41): **`.2` main CI yeşil:** 36837260538 (`bfb34c0d`; altında `e7ec529e`) check, db, e2e success (ölçüldü, `gh run view`).
- 2026-10-01 (kayıt oturumu `local_b0d3be14…`, koordinatör beslemesi #42; taban `3db8cab4`): **`.3` ve `.4` dalda bitti; inceleme değişiklik istedi.**
  - Dal `task/fb-6.3` @`a6dfadd8`: `f55a893d` (`.1`), `637546c5` (`.3`, `20261003031000_time_off_votes_decide_requests`, 1131 satır), `459ce5e2` (`.4`, `20261003032000_time_off_deadlines_close_requests`, 462 satır), `a6dfadd8` (matris özeti; `task/fb-6.3-matrix` @`429f6d00` ile aynı yama, `git patch-id`) — ölçüldü; main'de değil.
  - `nf-db` raporu (`.newfork-inbox/done/20261001T091038-nf-db-fb-6-3-fb-6-3-3-4.md`, okundu): rollback'li ölçümde `.1`'in beş dosyası yeşil; CI-yeşil 147 dosyada iki kırmızı: `bl052_document_notifications` (yerel kayma, BL-497) ve `time_off_physical_request_counts` — gerçek sızıntı: ilerleme panelinin "etkilenecek vardiyalar" listesi manager'ın okuyamadığı lokasyonun vardiyasını adıyla gösteriyordu; düzeltildi (okunamayan lokasyon yalnız sayı), yeniden ölçüm 7/7 yeşil. "Kendi kapsam mantığı" sayacı 41 → 40. `nf-guvenlik`'in önceki iki düşük bulgusu kapandı (oyda yetki her seferinde çekirdeğe soruluyor; bildirim tetikleyicisi `is distinct from`). Owner muafiyeti tek yerde: `app_private.time_off_reason` (`owner_time_off_needs_no_documents` yeşil). Sayılar `nf-db`'nin; kayıt oturumu koşmadı.
  - `nf-db`'nin 11 kararı (rapor "Senin yerine verdiğim kararlar"): (1) lokasyonun manager'ı = orada `time_off.decide` geçen, `time_off.decide_alone` geçemeyen kişi, rol okunmaz; (2) eski servislerin talepleri kendi lokasyonlarını alır, bildirim alıcısı "o lokasyonda karar verebilen manager'lar, yoksa admin/owner" (`.7`'de gider); (3) iki testte yazım hatası düzeltildi, beklenti gevşemedi (`time_off_deadlines`'ta manager'ın süre ayarı reddi `missing_permission`); (4) `time_off_shortens_for_a_shift` → `approved`, kısaltma yetkisi `time_off.revoke`; (5) `created_at` artık değişmez alan değil; (6) otomatik redde boş işlem yapan `coalesce` ile (düzeltme `.4` commit'inde, `.3` dosyasında); (7) kesinleştirmeyen oy da `revision`'ı artırır; (8) "yalnız admin/owner karar verebilir" bildirimi `requests.time_off.reminder`, alıcı `time_off_fallback_deciders`; (9) çalışanın geri çektiği "Withdrawn", yöneticinin geri aldığı "Revoked"; (10) kuyruk görünürlüğü kişi başına bir çekirdek çağrısı (tavan birkaç yüz kişi, `ponytail:` notu); (11) tarama tek transaction, turda en çok 500 talep (→ BL-506).
  - `.5` sözleşmesi (raporun "Sözleşme — `nf-backend` için" bölümü; tam metin orada): `submit_time_off_service` (lokasyon parametresi yok; owner'ınki `approved` döner), `request_time_off_cancellation_service`, `decide_time_off_service` (`expected_impact` = `progress.impact.fingerprint`), `revoke_time_off_service` (`revoked`, sürmekte olanda `approved` + "Revoked · taken until …"); geri çekme değişmedi; `get_schedule_requests_service`'e `decide_by` ve `progress` (yalnız bekleyen talepte), olaylarda `expired` → "System"; `get_employee_hub_service`'e `display_status` ve `decide_by`; `time_off_lead_hours` 0–720; `service_role` yeni iki tabloyu okuyamaz. Hata dili: 42501 + `authz.*`, 40001 bayat, 22023 geçersiz, 23514 çakışma.
  - **Matris** (`nf-backend`, `.newfork-inbox/done/20261001T092229-nf-backend-fb-6-3-matrix-fb-6-3-matrix.md`, okundu): `authorization-matrix.expected.json` yeniden üretildi: 4182 → 4437 hücre, eylem anahtarı 75 → 77 (kayıt oturumu JSON'dan ölçtü); 2 hücre deny → allow (`time_off.decide` derya ve mehmet → `to:ali`; Ali artık iki lokasyonda); TS ikizi `authorization.ts` de güncellendi (görevde yoktu, işin önündeydi: yoksa üç test daha kırmızı kalırdı). Shared 188, API 1034 yeşil; kalıcı DB izi yok (`nf-backend`'in ölçümü).
  - **Ultrareview:** `nf-db` önerdi; kullanıcı "Hayır, `nf-guvenlik` yeter" dedi (koordinatörün penceresinde; koordinatörün aktardığı).
  - **`nf-guvenlik` (alt ajan): DEĞİŞİKLİK İSTENİYOR @`459ce5e2`**, kritik ya da sızıntı yok (koordinatörün kaydı `C:/Users/TheWe/Documents/Codex/newfork-wt/coord/artifacts/coord/fb-6.3/nf-guvenlik-reviews.md`, git dışı, alt ajan çıktısından; KARAR satırı orada okundu). Y1 (yüksek): shared matris özeti eskiydi, `check` kırmızı olacaktı — matrisle kapandı. O1 (orta): süre işi ile geri çekme/son onay yarışı (`…032000:250-255`, `…031000:478-493`). O2 (orta, fail-open): `app_private.time_off_reason` bilinmeyen eylemde izin veriyor (`…031000:150`). O3 (orta): kalan bütün lokasyonlar onaylıyken manager'ı kalmayan lokasyon düşünce talep kesinleşmiyor, süre dolunca reddediliyor → KK-70. D1: `time_off_notify_shifts_opened` rol okuyor (`…031000:394`). D2: owner muafiyeti kuyruk okumasına uzanmıyor. D3: 500 sınırı + tur boyu kilit → BL-506. Satırlar kayıt oturumunca `459ce5e2`'de okundu ve bulgularla tutuyor. O1, O2, O3, D1, D2 `nf-db`'ye düzeltme olarak gitti; ardından yeniden inceleme.
  - **Görünür değişiklik (kullanıcıya raporlanacak; `nf-guvenlik` ve `nf-db` kararı 2):** eski servislerle açılan taleplerde admin ve owner artık "New time-off request" bildirimi almıyor (lokasyonda karar verebilen manager varsa); talep kapanınca manager'lara `requests.time_off.decided` gidiyor. Ayrıca Requests kuyruğunda manager, lokasyonlarından birinde çalışan kişinin başka lokasyona açılmış eski talebini de görür (`nf-db` raporu §4; görmek karar vermek değil).
  - **Açık (karar bekliyor; beslemede yoktu):** `.4` satırındaki "yayın notu" (yayın penceresinde "bekleyen izinle çakışıyor" bilgisi) yapılmadı; `nf-db` backlog'a ya da `.5`/`.6`'ya önerdi (leave: medium / do: safe; rapor §5.5). Kayıt oturumu madde açmadı; koordinatöre soruldu. **Karar (besleme #43): veri kısmı `.5`'e (`nf-backend`), ekran metni `.6`'ya (`nf-arayuz`); ayrı BL yok (KK-71).**
  - `.5` yeni `nf-backend` oturumunda başlayacak (matris oturumunun bağlamı %40).
- 2026-10-01 (kayıt oturumu `local_b0d3be14…`, koordinatör beslemesi #43; taban `64da67e3`): **Yayın notu `.5`/`.6`'ya** (KK-71; dayanak bu dosyanın Kurallar ve In scope satırları ile `.4` satırı: yeni fikir değil, aynı işin eksiği). **İnceleme kaynakları:** iki `nf-guvenlik` incelemesinin KARAR satırı ve bulguları `C:/Users/TheWe/Documents/Codex/newfork-wt/coord/artifacts/coord/fb-6.3/nf-guvenlik-reviews.md` (git dışı; koordinatörün kaydı; `ONAY @d26807ed` ve `DEĞİŞİKLİK İSTENİYOR @459ce5e2` okundu). `.2`'nin canlı gönderiminin ön durum yedeği aynı klasörde `live-before-20261003030000.txt` (dosya var, ölçüldü). KK-70: kullanıcı senaryoyu sordu, örnekle anlatıldı, itiraz yok (koordinatörün aktardığı) — onaysız kalır.
- 2026-10-01 (kayıt oturumu `local_b0d3be14…`, koordinatör beslemesi #44; taban `47bb6c17`): **`.1`–`.4` canlıda ve main'de.** Kullanıcı ~10:30'da "yok kipi"ne geçti ("sen yönet ilerlemeyi"); aynı pencerede iki karar: `.3`–`.4` canlıya "Gönder, MCP ile" ve koordinatör devri bu gönderimden sonra (koordinatörün aktardığı).
  - **Yeniden inceleme 1:** `nf-guvenlik` DEĞİŞİKLİK İSTENİYOR @`7f09ad4b` — yüksek: süre işi tek transaction'dı, kapatılamayan tek satır (kısaltmanın kapatmadığı bekleyen iptal) bütün workspace'lerin süre işini durduruyordu; orta: sistem kesinleştirmesinde iz ve bildirim yanlış kişiye. `nf-db` kapattı (main `c96c644c`; yolda: lokasyonsuz izinde kısaltma eski karar yoluna takılıyordu).
  - **Kullanıcı kararı** (koordinatörün penceresinde): belgesi gecikmiş manager'ın lokasyonu düşmez, karar admin/owner'a gider; otomatik onay yalnız manager gerçekten yoksa → KARARLAR "İzin" (yeni satır), KK-70 daraltıldı. Kodu main `8d84f278`.
  - **Yeniden inceleme 2:** `nf-guvenlik` ONAY @`4babd255` (`time_off_deadlines` 31/31, `time_off_voting` 87/87, matriste işaretsiz kırmızı 0 — koordinatörün aktardığı). Kaynak: ilk iki inceleme `newfork-wt/coord/artifacts/coord/fb-6.3/nf-guvenlik-reviews.md`; üçüncüsü HANDOFF `47bb6c17` §2'de özetli. İki düşük bulgu → KK-72 (küçük ek migration, `nf-db`; canlı onayı ister → park). D3 → BL-507.
  - **Canlı** (~10:38–10:42Z, MCP, alt ajan dar talimatla; koordinatörün ölçümü): iki migration, canlı kayıtlar `20261001103839` ve `20261001104014` dosya sürümlerine eşlendi; 34 fonksiyonun md5 özeti canlı = yerel (`555e7dbb…`); `authz_actions` 77; cron `time-off-deadlines` `*/5 * * * *` (ilk çalışma kaydı henüz yoktu — yeni koordinatör bakacak); 4 bildirim tipi; anon/authenticated execute 0; advisors değişmedi. Yedek `newfork-wt/coord/artifacts/coord/fb-6.3/live-before-20261003031000.txt` (dosya var, ölçüldü). Main'deki iki dosyanın md5'i `2ba5e1e4…` ve `85e6e9b3…` (kayıt oturumu ölçtü; beslemeyle aynı).
  - **Main** `8d84f278` (ölçüldü): `f630fd91` (`.1`), `53db4a8b` (`.3`), `52fa0024` (`.4`), `217ef0e4` (matris, `nf-backend` `429f6d00`), `fc3691ff`, `c96c644c`, `8d84f278` (düzeltmeler); ardından HANDOFF `47bb6c17`. Tam kapı yeşil (lint, typecheck, test: shared 188, api 1034, web 2011; build — koordinatörün ölçümü; ilk koşuda yükte bir zaman aşımı → BL-504). Main CI 36851164089 (`8d84f278`) kayıt anında koşuyordu (ölçüldü). Ortak yerel DB 407 migration, son `20261003032000` (ölçüldü).
  - **Uyuşmazlık:** HANDOFF "No manager … is left" metnini `…032000…sql:319` diye gösteriyor; main'de metin `:305`'te (ölçüldü). KK-72'ye `:305` yazıldı.
  - **Sıradaki:** KK-72 ek migration'ı (`nf-db`, canlı onayıyla), `.5` (yeni `nf-backend` oturumu; sözleşme `nf-db` raporu + düzeltme raporları `done/…fix2.md`, `…fix3.md`), `.6` varyantları (kullanıcı seçer; yokken park).
- 2026-10-01 (kayıt oturumu `local_b0d3be14…`, koordinatör beslemesi #45; taban `d4de1387`): canlıda `time-off-deadlines` cron'unun ilk koşusu `succeeded` (2026-10-01 10:45:00Z, "1 row"; koordinatörün ölçümü). KK-72'nin ek migration'ı `nf-db`'de dalda hazırlanıp park edilecek (canlı onayı kullanıcıda). `.5` yeni `nf-backend` oturumunda. Main CI 36851164089 (`8d84f278`) kayıt anında koşuyordu (ölçüldü).
- 2026-10-01 (kayıt oturumu `local_09f7902d-0d8a-4975-a48f-9318529acbe4`, besleme #45 tamamlaması; taban `41b35d6a`): `.5` başladı — `nf-backend` `local_ea5837d3-3dfa-4e9f-9212-1abafcd4f924` (havuz "(60)", Opus 5.5 / high; koordinatörün aktardığı), worktree `confident-euclid-ea49ed`, dal `task/fb-6.3.5` (kayıt anında uç `47bb6c17`, yeni commit yok — ölçüldü). KK-72'nin ek migration'ı `nf-db` `local_6b0b5907…`'de, dal `task/fb-6.3` (worktree `xenodochial-knuth-943563`, uç `47bb6c17` — ölçüldü); incelemeden sonra park. Kararlar: KK-73 (eski uçlar `.7`'ye kadar kalır; `.5` ve `.7` satırları buna göre düzeltildi), KK-74 (`.5` ayrı dalda). **Main CI 36851164089 kırmızı** (ölçüldü): `db` işinde "Green list only grows" — `.1`'in iki pgTAP dosyası (`time_off_deadlines`, `time_off_voting`) yeşil listeye yazılmadan main'e girdi; plandaki "`ci-green.txt`" adımı `.7`'deydi, ama CI yeni dosyanın ilk girdiği commit'te listede olmasını istiyor. Testler düşmedi (check, e2e yeşil). Düzeltme koordinatörde.
- 2026-10-01 (kayıt oturumu `local_09f7902d…`, koordinatör beslemesi #46; taban `b9c665f2`): main CI 36851164089 (`8d84f278`) kırmızıydı (`db`, "Green list only grows": iki yeni izin testi yeşil listede yoktu; testler kendisi yeşil); düzeltme `b9c665f2` (eski koordinatör, `ci-green.txt`'e iki satır), main CI 36852220331 check + db + e2e yeşil (ölçüldü, besleme #46). Ders `.7` satırına ve ILERLEME §0d'ye yazıldı (BL açılmadı, koordinatörün isteği). **KK-72 eki (D1/D2) dalda bitti:** `task/fb-6.3` @`a54d9ee9`, `20261003033000_time_off_reminder_reaches_who_can_decide.sql` (ölçüldü); önce kırmızı → yeşil, CI-yeşil 147 dosyada yalnız bilinen yerel kayma `bl052` (BL-497); kalıcı uygulama yok (`nf-db` raporu `.newfork-inbox/done/20261001T110319-nf-db-local-6b0b5907-fb-6-3-d1d2.md`; sayılar raporun, okunmadı). `nf-guvenlik` incelemesi koşuyor. **KK-75:** `.5`'te `nf-backend` ölçtü — `preview_schedule_publication_service` bekleyen izni bilmiyor; yeni bulgu `time_off_pending` veritabanında üretilir (`nf-db` `local_a0051ad4-a061-45d4-9626-99a551dafafe`, havuz "(62)", `20261003034000_…`), KK-72 ekiyle aynı park paketinde; `.5` bu bulgu boş gelecek şekilde main'e girer (shared'a enum değeri eklendi — koordinatörün aktardığı).
- 2026-10-01 (kayıt oturumu `local_09f7902d…`, koordinatör beslemesi #47; taban `645e1a77`): **KK-72 eki incelendi:** `nf-guvenlik` (alt ajan) ONAY @`a54d9ee9`, kritik/yüksek/orta yok (kayıt `newfork-wt/coord/artifacts/coord/fb-6.3/nf-guvenlik-reviews.md` §4 — ölçüldü). Bağımsız geri alınan deneme: migration'la `time_off_voting` 89/89, `time_off_deadlines` 31/31; migration'sız yalnız 86–87 kırmızı (koordinatörün aktardığı). Durum: PARK, canlı onayı kullanıcıda, sonra main. Düşük bulgu (karışık durum: bir lokasyonda manager var, ötekinde yok → hatırlatma ikisine) tek test olarak yeni `nf-db` `local_a0051ad4…`'de, dal `task/fb-6.3-pubnote` (worktree `happy-mahavira-b02a84`, uç `a54d9ee9` — ölçüldü); BL açılmadı. Ürün sorusu (bildirim ikilemesi) ILERLEME §0c satır 45.
- 2026-10-01 (kayıt oturumu `local_09f7902d…`, koordinatör beslemesi #48; taban `c8d74ec0`): **`.5` dalda bitti** — `nf-backend` `local_ea5837d3…`, `task/fb-6.3.5` @`c1f9ea87` (taban `c8d74ec0`; `83fc4fdd` uçlar + şemalar + hook'lar, `36d625ef` BL-496 kod, `c1f9ea87` BL-496 fikstürler — ölçüldü). Rapor `.newfork-inbox/done/20261001T112053-nf-backend-local-ea5837d3-fb-6-3-5.md` (ölçüldü). Dört yeni uç (talep, iptal talebi, `verdict`, `revoke`); eski uçlar duruyor (KK-73). Tam kapı yeşil (yazarın: lint/typecheck/build 0, web 223/223 dosya). `.6` ve KK-75 sözleşmeleri raporun sonunda. **Yazarın teknik kararları** (raporda): yeni uçlarda route kapısı yok, her servis çekirdeğe kendisi sorar; **Requests okuma ucunda görev satırındaki `authorize(context,'requests.read')` konmadı** — veritabanı "izin okuyabilen ya da vardiya değişikliği okuyabilen"e cevap veriyor, API kapısı sayaç sorgusunu kırardı; bugünkü kapı daha dar, sızıntı yok (inceleme bakacak); 23514 → 409 yalnız yeni izin servislerinde. Ölçülmeyen (yazarın): açılacak vardiya listesinin gerçek bir satırı. Görünür değişiklik yok; tek istisna Requests → Time off'ta yeni uçla açılmış lokasyonsuz talepte "Location" sütunu boş. `nf-guvenlik` incelemesi (alt ajan) koşuyor.
- 2026-10-01 (kayıt oturumu `local_09f7902d…`, koordinatör beslemesi #49; taban `327d0971`): **`.5` incelendi:** `nf-guvenlik` (alt ajan) ONAY @`c1f9ea87`, kritik/yüksek yok (`newfork-wt/coord/artifacts/coord/fb-6.3/nf-guvenlik-reviews.md` §5 — ölçüldü). Kanıt (koordinatörün aktardığı): API 38/38, shared 80/80, web 6/6; yerel DB salt okuma 15 üye × 2 sıra, 20 cevap dalın şemasıyla parse — gerçek bir `impact.shifts` satırı dahil (yazarın "ölçülmedi" boşluğu kapandı). Sapma (karar 2, `requests.read` kapısı yok) incelendi: kapsam dışına sızma yok. Dal yeniden tabanlandı: `task/fb-6.3.5` @`e4de51cf` (taban `327d0971`), `c1f9ea87`'ye göre kod farkı yok (ölçüldü). Düşükler: D1 kayıt — departman/iş `sort_order` shared'dan çıkınca yayın anında açık eski sekme ilk okumada hata verir, yenileyince düzelir (canlı kullanıcı yok, iş yok); D2 → BL-508; D3 → BL-509; D4 → `.6` satırı. Sıradaki: `nf-backend` rebase + tam kapı, sonra koordinatör main'e alır.
- 2026-10-01 (kayıt oturumu `local_09f7902d…`, koordinatör beslemesi #50; taban `13b7c8cd`): **`.5` main'de** — `51579826`, `c4cbee3b`, `13b7c8cd` (`e4de51cf`'in docs-only rebase'i, kod farkı yok — ölçüldü; ONAY geçerli). Tam kapı yeşil (`nf-backend`'in). Canlıya çıktı (Vercel; koordinatörün), görünür değişiklik yok. Main CI 36856018169 check + db + e2e yeşil (ölçüldü, kayıt gönderiminden hemen sonra). **Yayın notu (KK-75) dalda bitti:** `nf-db` `local_a0051ad4…`, `task/fb-6.3-pubnote` @`edafa6ec` (`20261003034000_publish_notes_time_off_waiting_for_a_decision.sql` `1c43b6c6`, karışık durum testi `01d083ae` — ölçüldü); rapor `.newfork-inbox/done/20261001T112822-nf-db-local-a0051ad4-fb-6-3-pubnote.md` (ölçüldü); `nf-guvenlik` ONAY KOŞULLU @`edafa6ec` (`newfork-wt/coord/artifacts/coord/fb-6.3/nf-guvenlik-reviews.md` §6). **Canlı sırası koşulu** (`nf-guvenlik` §6): shared `51579826` canlıda olmalı — **sağlandı** (Vercel Production `13b7c8cd` success 2026-10-01T11:33:52Z, GitHub deployments — ölçüldü, besleme #51); kalan: gönderim anında canlı md5 = yerel `ddd1b0f7…`, `ed23a481…`. Düşükler: D1 (atlama `tier='note'`'a daraltılıyor), D2 ürün sorusu (ILERLEME §0c satır 47), D3 kayıt (`starts > now()` testsiz). **KK-76** (hub okumasına saat dilimi ve karar süresi; `nf-backend` `task/fb-6.3.5b` @`9a397ff1`, `nf-db` `…035000…` yazılıyor). **`.6` başladı:** `nf-arayuz` `local_a142f44f-f477-416e-87e1-a61d61c18f36` (havuz "(64)"), dal `task/fb-6.3.6` (worktree `musing-kirch-e07cf4`, uç `13b7c8cd` — ölçüldü); ilerleme panelinin 2–3 varyantı → kullanıcı seçimi PARK (P04); `.6` seçim gelmeden main'e girmez. Eski `nf-arayuz` `local_0038c687…` "(eski)", arşiv kullanıcıya.
- 2026-10-01 (kayıt oturumu `local_09f7902d…`, koordinatör beslemesi #51; taban `be9a2ebc`): **`.5` main'de ve canlıda** — Vercel Production `13b7c8cd` success 11:33:52Z (GitHub deployments; ölçüldü). Yayın notunun canlı koşulunun ilk yarısı sağlandı; kalan: gönderimde md5. FOUNDATION-B puanı: `.0`–`.5` 22 puan → Aşama 6–7 147 / 230 = %63,9, program geneli 225 / 308 = %73,1 (ILERLEME §1, §3; ROADMAP). Önceki kayıtlar `.0`–`.4`'ü puana katmamıştı; bu beslemede düzeltildi.
