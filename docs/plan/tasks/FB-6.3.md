# FB-6.3 İzin dilimini yetki çekirdeğine taşı (FOUNDATION-B Aşama 6)
Status: draft — S1–S3 cevaplı (2026-09-27), S4 TBD. Başlamadan önce: FB-6.2 main'de, BL-183 main'de, P1–P3 koordinatörce verilmiş; `.0` taze ölçüm.
Session: -   Branch: task/FB-6.3   Worktree: newfork-wt/FB-6.3   DB: lock (migration + test:db + e2e)

Program: `docs/plan/tasks/FOUNDATION-B.md` → Aşama 6 → dilim tablosu, satır FB-6.3. Ürün kuralları: `docs/plan/REUSE.md` → "İzin (time off)" (`:68-71`) ve "Rütbe" (`:44`). Kalıp: `FB-6.1.md`, `FB-6.2.md`.
Önkoşullar: **FB-6.2** (kişi kapsamı, birincil lokasyon, lokasyonsuz kişi — FB-6.2 S1); **BL-183** (A şeridi; aynı bildirim fonksiyonuna dokunuyor, Ç-a).
Reviewer: `nf-guvenlik` (her kod adımı); ekran değiştiren adımlarda (`.5`, `.6`) ayrıca `nf-gorsel-qa`. Onay biçimi `ONAY @<sha>`.

## Tazelik ölçümü (2026-09-27)
Ölçüm: `origin/main` `b4b6d02`; yerel DB yalnız SELECT (son migration `20260926230000` = main).

| Ne (dilim tablosu / devir notu) | Bugün | Hüküm | Kanıt |
|---|---|---|---|
| "Talepten `location_id` kalkar" | `schedule_time_off_requests.location_id` **NOT NULL**; iki gönderim servisi `target_location_id` alıyor (`submit_employee_time_off_service`, `submit_employee_time_off_periods_service`). Yerel DB'de talep satırı 0. | **geçerli** | `information_schema.columns`, `pg_get_function_identity_arguments` |
| "Onay oylaması çekirdeğe" | **Oylama hiç yok.** Karar tek lokasyonla veriliyor: `app_private.authorize_time_off_decision` → `authorize(..., 'time_off.decide', target_locations => array[place], target_person => requester)` (talebin lokasyonu). "O gün yayınlı vardiyası olan her lokasyonun müdürü oy verir" kuralının kodu yok. | **değişmiş (büyüdü)**: taşıma değil yeni karar motoru | fonksiyon gövdesi; `grep -li vote supabase/migrations` → izinle ilgisiz |
| Rütbe (bir üst kademe, kendi talebini onaylamaz) | **bitti** (BL-177, main): `time_off.decide` rütbe kuralı çekirdekte, `known_gap` `time-off-rank` silinmiş; owner'ın talebi onaylı kaydoluyor (`app_private.record_owner_time_off`) | **kapandı** | `authorization_matrix.test.sql:546-553`; DONE BL-177 |
| `known_gap` `time-off-needs-location` | duruyor (`authorization_matrix.test.sql:633-634`): lokasyonu olmayan kişi izin isteyemiyor | **geçerli** | matris |
| "5 izin fonksiyonu `schedule_actor_*` yardımcılarında" | **3** kaldı: `mark_schedule_time_off_viewed_service`, `preview_time_off_assignment_decision_service`, `time_off_event_released_assignments`. `apply_time_off_period_decision` ve `decide_time_off_with_assignments_service` BL-177'de çekirdeğe geçti. | **değişmiş (küçüldü)** | `prosrc` sorgusu |
| Sayaç katkısı (izin fonksiyonları, 31 ad) | `auth.uid()` 0, `request.jwt.claim` 0, `_base` 0; kendi kapsam/rütbe mantığı **1** (`notify_schedule_request_event_service`); izin tablolarında RLS politikası 0 | **yeni** — dilimin sayaç etkisi küçük; asıl iş kural | `authz_catalog` desenleri |
| Çekirdek eylemleri | `time_off.request_own`, `time_off.decide` (2). İptal kararı için ayrı eylem yok (`apply_time_off_cancellation_decision` çekirdeğe sormuyor). | **yeni** | `app_private.authz_actions` |
| API kapısı | `apps/api/src/schedule/schedule-requests-routes.ts`: route-yerel iki kapı `authorizeAnyActive` (`:272`) ve `authorizeAny` (`:303`), `context.permissions.includes` ile; **8 çağrı**. Kopya `requestError` (`:324`, BL-134). Employee Hub izin ucu `employee-hub-routes.ts:134`. | **yeni iş** (FB-6.1 E1 kalıbı) | grep |
| Web | `ScheduleRequestsPage.tsx`'te `permissions.includes` **0** (FB-6.1.9); "Hours need verification" ölü dalı `:1036` (BL-110'un izin parçası); `legacy_location` zaman kaynağı toleransı (`packages/shared/src/time-off.ts:105`, `apps/web/src/employee-hub/TimeOffPeriods.tsx:25`) | **yeni** — eski veri toleransı silinir (CLAUDE.md §9) | grep |
| Kırmızı dosyalar | izin dosyaları 8; **`time_off_partial_period_decisions` kırmızı** (yeşil listeye takvime bağlı olduğu için hiç girmedi, FOUNDATION-B `:82`); `time_off_published_assignment_disposition` CI'da yeşil ama yerelde kırmızı (BL-209 veri kayması); `schedule_requests` yeşil (FB-6.1) | **geçerli** | `ci-green.txt` |
| e2e akış 8 "İzin" | spec yok (`e2e/flows/` 8 dosya, izin yok) | **yeni iş** | `ls e2e/flows` |

**Sonuç:** Dilim tablosundaki büyüklük (0,5–1 kişi-hafta) **düşük**: oylama yeni bir karar motoru (oy kaydı, karar anında oy veren hesabı, kısmi oy durumu, bildirim) ve talepten lokasyonun kalkması saat dilimi kuralını açıyor (S3). Buna karşılık rütbe işi (BL-177) ve yardımcıların ikisi zaten bitti, sayaç etkisi küçük. Yeni tahmin **1–1,5 kişi-hafta** (ölçülmemiş; FB-6.1/6.2 bitince yeniden).

## Goal
İzin kişinin talebidir: formda lokasyon seçilmez, talep bir lokasyona bağlı değildir. Karar REUSE'daki oylamayla verilir: o gün yayınlı vardiyası olan her lokasyonun müdürü oy verir, hepsi onaylayınca kesinleşir, biri reddederse red; yayınlı vardiya yoksa birincil lokasyonun müdürü; admin/owner her durumda tek başına; birincil lokasyonun müdürü yoksa (ya da kişi lokasyonsuzsa) talep admin/owner'a düşer. Kararın her giriş noktası `app_private.authorize()` / `scope_set()`'ten geçer.
Örnek: Ali Pazartesi Kadıköy'de, Salı Beşiktaş'ta yayınlı vardiyalı; Pazartesi–Salı izin ister. Kadıköy müdürü Ayşe onaylar, talep "Beşiktaş'ın onayı bekleniyor" der; Beşiktaş müdürü Mehmet onaylayınca izin kesinleşir. Mehmet reddetseydi talep reddedilirdi. Admin ikisini beklemeden tek başına karar verebilir.

## In scope
- **Lokasyonsuz talep:** `schedule_time_off_requests.location_id` kalkar; iki gönderim servisi `target_location_id` almaz; talep saat dilimi S3'e göre sabitlenir; `legacy_location` zaman kaynağı ve onu okuyan dallar silinir. `known_gap` `time-off-needs-location` kapanır (lokasyonsuz kişi de izin ister).
- **Oylama motoru:** karar anında oy verenleri hesaplayan tek fonksiyon (çekirdek üzerinden: `scope_set(..., 'time_off.decide')`; satır içi kapsam yok); oy kaydı (kim, hangi lokasyon adına, ne zaman, onay/ret); talep durumu "kısmen onaylandı / bekliyor: <lokasyonlar>"; ret tek oyla; admin/owner tek başına. `authorize_time_off_decision` bu motoru kullanır.
- **İptal kararı** (onaylı iznin geri çekilmesi) aynı kurala bağlanır (S4); çekirdekte eylemi olur.
- Kalan 3 yardımcı çağıranı çekirdeğe; `notify_schedule_request_event_service`'in satır içi kapsamı çekirdeğe (alıcılar = oy verenler).
- **K-1 yardımcı kapanışı:** FB-6.3 ile FB-6.4'ten son kapanan dilim üç `schedule_actor_*` yardımcısını siler ve matris kırpmasını aynı commit'te yapar (kural `FB-6.1.md` "Silen dilim için üçü tek commit").
- **API:** `schedule-requests-routes.ts`'in iki route-yerel kapısı (8 çağrı) → `authorize(context, action)` (FB-6.1 E1 kalıbı); aynı dosyadaki `requestError` → `rpcFailure` (BL-134'ün bu dosyaya düşen parçası).
- **Web:** Employee Hub → My availability → Time Off Requests formunda lokasyon yok; Schedule → Requests → Time off'ta oy durumu (hangi lokasyonun onayı bekleniyor) görünür; "Hours need verification" ölü dalı (BL-110 izin parçası) silinir. Görsel karar DEV'de 2–3 varyant.
- Kırmızı `time_off_partial_period_decisions` yeşile ve `ci-green.txt`'e; `schedule_requests` yeşil kalır (dosya seviyesinde, yarım olamaz).
- e2e akış 8 "İzin": iki lokasyonlu kişi, iki oy, ret dalı, admin tek başına.

## Out of scope
- **BL-127** yöneticinin "izni kısalt ve ata" eylemi ve **BL-182** çalışanın takasta kendi iznini ezmesi — ikisi aynı "izin o saatler için kısalır" mekanizmasını ister; P1.
- **BL-183** owner izni bildirimi — A şeridinde, bu dilimden önce main'e girer (Ç-a).
- Bildirimin teslimi (e-posta, push) — FB-6.7 / bildirim projesi; bu dilim yalnız alıcıyı doğru hesaplar.
- **BL-174** yayın yazma tetikleyicisinin izni atlaması — Schedule tarafı; FB-6.1'in `.14`'ünden önce ya da ayrı iş (bu dilim tetikleyiciye dokunmaz).
- **BL-209** yerel veri kayması (D şeridi); bu dilimin testleri CI'ın temiz DB'sinde değerlendirilir.

## Açık sorular — S1–S3 cevaplandı 2026-09-27 (kullanıcı, `nf-planlama` penceresi); S4 açık (TBD)
- **S1 — Çok günlü talepte oylama günlere göre mi, talebin bütününe mi?** Ali'nin Pazartesi (Kadıköy) + Salı (Beşiktaş) talebi.
  - (a) **(Önerilen)** Talebin bütünü: iki günün bütün oy verenleri (Ayşe ve Mehmet) onaylayınca kesinleşir, biri reddederse bütün talep reddedilir. Gerekçe: REUSE'un "hepsi onaylayınca kesinleşir, biri reddederse red" cümlesiyle birebir; çalışan için tek sonuç. Admin/owner gerekirse yine gün gün (kısmi) karar verebilir — bu özellik bugün var (`time_off_decision_pieces`).
  - (b) Gün gün: Pazartesi'yi yalnız Ayşe, Salı'yı yalnız Mehmet karar verir; Pazartesi onaylı, Salı reddedilmiş olabilir.
  - **Cevap: (a) talebin bütünü.**
- **S2 — Aynı lokasyonda birden çok müdür varsa lokasyonun oyunu kim verir?**
  - (a) **(Önerilen)** O lokasyonun müdürlerinden herhangi biri, lokasyon adına; ikinci müdür aynı oyu tekrar vermez, kararı görür.
  - (b) O lokasyonun bütün müdürleri ayrı ayrı onaylamalı.
  - **Cevap: (a) herhangi biri.**
- **S3 — Talepte lokasyon yokken izin saatleri hangi saat dilimiyle kaydedilir?** Bugün talep lokasyonun saat dilimini kullanıyor.
  - (a) **(Önerilen)** Kişinin birincil lokasyonunun saat dilimi, talep anında kayda sabitlenir (sonradan birincil lokasyon değişse de talep değişmez). Birincil lokasyonu yoksa (lokasyonsuz kişi) çalışanın cihazının saat dilimi, yine talep anında sabitlenir — workspace'in kendi saat dilimi kolonu yok (yalnız `locations.timezone`).
  - (b) Çalışanın cihazının saat dilimi, talep anında sabitlenir.
  - **Cevap: (a) birincil lokasyonun saat dilimi** (lokasyonsuz kişide cihazınki), talep anında sabitlenir.
- **S4 — Onaylı izni iptal isteği (çalışan "iznimi geri alıyorum" der) kimin kararıdır?**
  - (a) **(Önerilen)** Talebin kendisiyle aynı kural: iptal edilen günlerde yayınlı vardiyası olan lokasyonların müdürleri, yoksa birincil lokasyonun müdürü; admin/owner tek başına.
  - (b) Yalnız ilk izni onaylamış olanlar.
  - **Cevap: TBD** — kullanıcı sonra karar verecek. Etki: iptal kararı (`.3`'ün iptal kısmı ve iptal eylemi hücreleri) cevaba kadar bekler; bugünkü iptal akışı değiştirilmez.

Kuraldan çıkan, soru olmayan sonuçlar (REUSE'dan): kişi lokasyonsuzsa (FB-6.2 S1) ya da birincil lokasyonunun müdürü yoksa talep admin/owner'a düşer; oy verenler her kararda yeniden hesaplanır — arada yayınlanan yeni bir lokasyonun vardiyası o lokasyonun oyunu da gerektirir, artık yayınlı vardiyası olmayan lokasyonun verdiği oy sayılmaz.

## Planlama kararları (koordinatöre)
- **P1 — BL-127 ve BL-182 nerede?** İkisi de onaylı iznin bir kısmını kısaltan aynı mekanizmayı ister. **Öneri:** mekanizma bir kez, FB-6.4'te (takas, BL-182) yazılır; BL-127 onun üstüne FB-6.4'ten hemen sonra ayrı küçük iş. Elenen: FB-6.3'e katmak (oylama motoruyla birlikte dilimi ikiye katlar).
- **P2 — K-1 silmesi hangi dilimde?** Hangisi son kapanırsa (FB-6.3 / FB-6.4); FB-6.4 daha büyük olduğu için büyük ihtimalle FB-6.4. FB-6.3 kendi 3 çağıranını taşır, yardımcıya dokunmaz.
- **P3 — BL-134'ün `schedule-requests` parçası bu dilimde mi?** **Öneri:** evet; aynı route dosyası, `.5`'te aynı commit.

## Done when
1. `schedule_time_off_requests` tablosunda `location_id` kolonu yok; iki gönderim servisinin imzasında lokasyon yok; `rg "legacy_location" apps packages supabase/tests` → 0 (migration geçmişi hariç).
2. `authorization_matrix`: `time-off-needs-location` `known_gap`'ten silinmiş; `time_off.decide` hücreleri oylama kuralını sınar (iki lokasyonlu kişi, iki oy veren, ret, yayınsız gün → birincil, birincil müdürsüz → admin/owner, lokasyonsuz kişi, kendi talebi, rütbe); iptal eylemi satırı ve hücreleri var; `decide:` 0; TS ikizi güncel.
3. Oylama pgTAP'ı (yeni dosya) yeşil listede: tek oy bekleyen talep kesinleşmez, ikinci oyla kesinleşir, tek ret reddeder, admin tek başına karar verir, arada yayınlanan lokasyon oy gerektirir.
4. `time_off_partial_period_decisions` ve oylama dosyası `ci-green.txt`'te; `schedule_requests` ve diğer 6 izin dosyası yeşil kalır.
5. İzin fonksiyonlarında `schedule_actor_*` çağrısı 0; `notify_schedule_request_event_service` kendi kapsam mantığı taşımıyor (katalog kapsam sayacı en az 1 düşer, tavan aynı commit'te).
6. `grep -c "permissions.includes" apps/api/src/schedule/schedule-requests-routes.ts` → 0; dosyada `requestError` yok (`rpcFailure`).
7. `rg "Hours need verification" apps/web/src` → 0.
8. e2e akış 8 (yeni `e2e/flows/time-off.spec.ts`) yeşil: iki lokasyonlu kişi talep eder (formda lokasyon yok), ilk müdür onaylar → ekranda "waiting for <lokasyon>", ikinci onaylar → onaylı; ret dalı; admin tek başına.
9. Her kural önce kırmızı hücreyle (commit sırası incelemede görülür).

## Alt adımlar (sıra, sahip, DB kilidi)
**Her adım için geçerli kabul kriteri (ratchet kuralı):** altı `authz_catalog` sayacı artmaz; yeni fonksiyon eskisini aynı commit'te silerek girer; her `nf-db` adımı kapanmadan `authz_catalog` → 0 not ok; migration önce tek transaction + rollback, ortak yerel DB'ye yalnız birleştirme penceresinde.

| Adım | İş | Sıra | Sahip | DB kilidi | Dosyalar |
|---|---|---|---|---|---|
| **FB-6.3.0** | Taze ölçüm (FB-6.2 ve BL-183 main'e girdikten sonra): bu tablo yeniden; `time_off_partial_period_decisions`'ın kırmızı kontrolleri adıyla. | 0 | `nf-planlama` (SELECT) + `nf-test` (koşturma) | Evet (yalnız `test:db`) | bu dosya |
| **FB-6.3.1** | Matris: oylama ve iptal hücreleri, lokasyonsuz kişi, S1–S4 kuralları `expected()`'e; yeni hücreler kırmızı; TS ikizi. | 1. S1–S4'ten sonra | `nf-db` | Evet | `supabase/tests/authorization_matrix.test.sql`, `supabase/test-support/builder.sql`, `packages/shared/src/authorization-matrix.expected.json` |
| **FB-6.3.2** | Şema: `location_id` kalkar, gönderim servisleri lokasyonsuz, saat dilimi S3, `legacy_location` silinir. **Sözleşme değişir** → `.5` ile aynı birleştirme penceresinde main'e (web/API aynı anda; BL-186'daki gibi). | 2 | `nf-db` | Evet | migration |
| **FB-6.3.3** | Oylama motoru + oy kaydı + `authorize_time_off_decision`; iptal kararı aynı kurala; oylama pgTAP'ı. | 3 | `nf-db` | Evet | migration, `supabase/tests/time_off_voting.test.sql` |
| **FB-6.3.4** | Kalan 3 yardımcı çağıranı + `notify_schedule_request_event_service` alıcıları çekirdeğe (alıcı = oy verenler). | 4 | `nf-db` | Evet | migration |
| **FB-6.3.5** | API: iki route-yerel kapı → `authorize(context, action)`, `requestError` → `rpcFailure`; Employee Hub izin ucu lokasyonsuz; web veri katmanı (form lokasyonsuz, oy durumu sözleşmesi), shared `time-off.ts`. | 5. `.2`–`.4` sözleşmesi yazılınca; `.2` ile aynı pencerede main'e | `nf-backend` | Hayır | `apps/api/src/schedule/schedule-requests-*.ts`, `apps/api/src/employee-hub/**` (izin), `packages/shared/src/time-off.ts`, `apps/web/src/**/*-data.ts` |
| **FB-6.3.6** | Görsel: formdan lokasyon alanı kalkar; Requests → Time off'ta oy durumu (DEV'de 2–3 varyant, kullanıcı seçer); "Hours need verification" dalı silinir. | 6. `.5` main'e girince | `nf-arayuz` → `nf-gorsel-qa` | Hayır | `ScheduleRequestsPage.tsx` sunum, `apps/web/src/employee-hub/TimeOff*.tsx`, CSS |
| **FB-6.3.7** | Kırmızı dosya yeşile, `ci-green.txt`; `known_gap` satırı silinir; katalog tavanı. | 7. `.4`'ten sonra | `nf-test` | Evet | `supabase/tests/time_off_partial_period_decisions.test.sql`, `ci-green.txt`, `authz_catalog.test.sql` |
| **FB-6.3.8** | e2e akış 8. | 8. `.6`'dan sonra | `nf-test` | Evet | `e2e/flows/time-off.spec.ts` |
| **FB-6.3.9** | Kapanış: onaylar, tam kapı, main + CI, Notes, FOUNDATION-B kaydı; hosted gönderim paketine eklenir. | 9 | koordinatör | Evet (e2e) | bu dosya, `FOUNDATION-B.md` |

## Touches
- **`nf-db`:** `supabase/migrations/**` (3–4 migration), matris, builder, oylama pgTAP'ı.
- **`nf-backend`:** `apps/api/src/schedule/schedule-requests-routes.ts`, `schedule-requests-service.ts`, `apps/api/src/employee-hub/**` (izin ucu), `packages/shared/src/time-off.ts`, web veri katmanı.
- **`nf-test`:** `time_off_partial_period_decisions.test.sql`, `ci-green.txt`, `authz_catalog.test.sql`, `e2e/flows/time-off.spec.ts`.
- **`nf-arayuz`:** `ScheduleRequestsPage.tsx` ve `TimeOff*.tsx` sunumu, CSS.

## Test plan
- Önce kırmızı matris hücresi, sonra migration (TDD). Oylama için tabloya bağlı senaryo: {yayınlı vardiya: 0 / 1 / 2 lokasyon} × {oy: yok / bir onay / iki onay / bir ret} × {karar veren: o lokasyonun müdürü / başka lokasyonun müdürü / admin / owner / kendisi}; ayrıca "oy verildikten sonra yeni lokasyon yayınlandı" ve "oy veren lokasyonun vardiyası geri çekildi".
- Lokasyonsuz kişi (FB-6.2 S1) talep eder → admin/owner'a düşer.
- Saat dilimi (S3): talep anındaki dilim kaydedilir; birincil lokasyon değişince talep saatleri değişmez.
- API: route testleri 403/404 sözleşmesi (`authz.*`); ham hata yok.
- e2e: Done when 8. Tam kapı: `lint`, `typecheck`, `test`, `build`, `test:db`, etkilenen e2e.

## Risk
- **Sözleşme kırılması (lokasyon kolonu).** Web/API ile migration ayrı girerse izin ekranları 500 verir (BL-186'da aynı risk vardı). Önlem: `.2` ve `.5` aynı birleştirme penceresinde; hosted'a da aynı anda (FB-6.1.14 paketinin sıra şartı).
- **Oy verenlerin karar anında hesaplanması** yarış yaratır: iki müdür aynı anda oy verirken bir yayın değişir. Önlem: karar, talep satırında `revision` ile (bugünkü `time_off_commands` / revizyon kalıbı); oy verenler aynı transaction'da hesaplanır.
- **Bildirim fonksiyonunda BL-183 ile çakışma** (Ç-a). Önlem: BL-183 önce main'e.
- **Kırmızı dosyada beklentiyi gevşetmek yasak.** `time_off_partial_period_decisions` takvime bağlı olduğu için kırmızıydı (tarih/hafta); builder'ın `tests.week`'iyle yeniden yazılır, iddiası gevşetilmez.
- **Yerel veri kayması (BL-209)** `time_off_published_assignment_disposition`'ı yerelde kırmızı gösteriyor; birleştirme penceresinde "bilinen yanlış alarm" (ILERLEME-PLANI Ç6), CI'daki sonuç esas.

## Pre-mortem (2026-09-27, `nf-planlama`: "3 ay sonra bu dilim neden başarısız sayılır?")
1. **Çok lokasyonlu çalışanın izni haftalarca "bekliyor"da kaldı.** Gizli varsayım: her lokasyonun müdürü zamanında oy verir. Kanıt: kural "hepsi onaylayınca kesinleşir"; bir müdür tatildeyse talep asılı kalır. **Düzeltme:** bekleyen oy için hatırlatma ve admin/owner'ın tek başına karar yetkisi ekranda görünür ("Decide as admin"); sürenin kendisi ürün kararı değilse backlog adayı.
2. **Oylama çalışana anlaşılmadı.** "Onaylandı mı?" sorusuna ekran "kısmen" dedi. **Düzeltme:** `.6` varyantlarında çalışana tek durum ("Waiting for Beşiktaş manager"), müdüre ayrıntı.
3. **Saat dilimi sessizce kaydı.** Lokasyon kalkınca saat dilimi tahmin edilirse iki şehirde çalışan kişinin izni bir saat kayar. **Düzeltme:** S3 kullanıcı kararı; talep anında dilim kayda yazılır, ekranda gösterilir.
4. **Daha basit alternatif:** oylamayı yazmadan "birincil lokasyonun müdürü karar verir, diğerlerine bildirim" — REUSE ile çelişir (kullanıcı kararı oylama), öneri değil; ama S1 (a) ile oylama zaten tek sonuçlu ve basit tutuluyor.
5. **Geri alınabilirlik:** lokasyon kolonunun silinmesi şema değişikliği; canlı veri yok (CLAUDE.md §9), yerel talep satırı 0. Risk düşük.

## Skills
Plan: `superpowers:writing-plans`; yürütme: `superpowers:executing-plans`. SQL/RLS: `supabase:supabase`, `supabase:supabase-postgres-best-practices`. Önce kırmızı: `superpowers:test-driven-development`. Beklenmedik kırmızı: `superpowers:systematic-debugging`. İnceleme: `superpowers:requesting-code-review`, `security-review`, `superpowers:verification-before-completion`. Görsel: `frontend-design:frontend-design`.

## Notes / Result
- 2026-09-27 (`nf-planlama`): kullanıcı S1 (a) talebin bütünü, S2 (a) lokasyonun herhangi bir müdürü, S3 (a) birincil lokasyonun saat dilimi dedi; S4 (iptalin onayı) TBD. İptal kısmı cevaba kadar kapsamda bekler; REUSE "İzin" güncellendi.
- 2026-09-27 (`nf-planlama`): dosya açıldı (ILERLEME-PLANI E şeridi, 1. iş). Ön ölçüm `origin/main` `b4b6d02`. Dilim tablosuna göre değişenler: rütbe (BL-177) ve 2 yardımcı çağıranı zaten bitti; oylamanın kodu hiç yok (yeni motor); tahmin 0,5–1 → 1–1,5 kişi-hafta. Kullanıcıya dört soru (S1–S4), koordinatöre üç planlama kararı (P1–P3). Ç-a: BL-183 bu dilimden önce.
