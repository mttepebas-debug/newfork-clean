# A — Requests: açık backlog ve prototip farkları (EKRAN-02, 2026-10-05, e929abc7)

## Özet
- Requests ekranına ait **39 açık backlog maddesi** ölçüldü (11'i ayrıca "Sınırda" listesinde). Hükümler: 1 bayat (BL-508), 10 değişmiş, 28 geçerli. Ölçüm `e929abc7` üzerinde, yerel DB'de son migration `20261007030000` (yalnız SELECT).
- **En ağır açık, Shift changes onayında.** Takas onayı yetki çekirdeğine hiç sormuyor (`shift_exchanges_command_service` gövdesinde "authorize" yok). Bunun üç sonucu var:
  - eş rütbe müdür birbirinin takasını onaylayabiliyor;
  - belgesi eksik (kısıtlı) kişi takas açabiliyor;
  - yol süresi kuralı kişiyi listeden düşürüyor, dinlenme süresine hiç bakılmıyor (KARARLAR 2026-10-03'e aykırı).
  Üçü de FB-6.4'ün A1–A2 parçalarında planlı.
- KARARLAR'da olup kodda olmayan iki Time off kuralı var:
  - Belgesi gecikmiş müdür talebi göremiyor. KARARLAR S3 "görür ama oy veremez" diyor.
  - Müdür "Time off approved" bildirimine tıklayınca kapanmış talep açılmıyor.
- **Prototip farkları:** P1'de 15 madde gerçek uygulamanın gerisinde kalmış. Hepsi bugünkü kodda da duruyor ve hepsinin bir backlog karşılığı var (BL-256, 653, 656, 658, 663, 674). Öneri: 13 taşı, 2 bırak. Varyant gerektiren yok; Shift changes'in Time off denetimini alması (R45/R48/R51) tek ekran görüntüsüyle teyit edilir.
- **Mert'e gidecek açık sorular:** owner'ın girdiği takas vakasını kim onaylar (FB-6.4 D3(c)); onaylayamadığı vakada düğme kapalı mı, gizli mi (varyant); sistemin yazdığı kısaltma satırının etiketi (BL-364, varyant); arama kutusu kenar rengi (BL-600).
- FB-6.4 planında bir düzeltme gerekiyor: plan Requests okumasının "header'lı ikinci kopyası"nı silmeyi yazıyor, ama web yalnız o kopyayı çağırıyor.

## 1. Açık backlog maddeleri (önem sırasıyla, tazelik hükmüyle)

Teknik adlar: "yetki çekirdeği" = `app_private.authorize()`, kimin neyi yapabileceğine tek yerden karar veren veritabanı katmanı. "Hint'siz 42501" = gerekçesi yazılmamış "yetkin yok" cevabı.

### Yüksek
- **BL-276 (leave: high / do: risky) — kalem (1): takas onayı çekirdeğe sormuyor, rütbe kuralı uygulanmıyor — Tazelik 2026-10-05 (e929abc7): geçerli.**
  - Kanıt: `shift_exchanges_command_service` gövdesinde `app_private.authorize` yok (SELECT, `uses_authorize=f`). Eski yardımcıya 3 çağrı, 8 hint'siz 42501. Katalogda `exchange.approve` `rank_below=t` hazır ama kullanılmıyor.
  - Ekranda: Requests → Shift changes → vaka → aday → Confirm transfer.
  - Örnek: Kadıköy'de iki müdür var, Ali ve Ayşe. Ayşe Cuma vardiyasını garson Hande'ye verir; Ali bu devri onaylayabiliyor. ILKELER P07'ye aykırı.
  - Yeri: FB-6.4 A2.

### Orta
- **BL-179 (leave: medium / do: moderate) — izin tarafında eski yardımcıya soran son fonksiyon — Tazelik: geçerli.**
  - Kanıt: `time_off_event_released_assignments` hâlâ `schedule_actor_has_capability_service`'e soruyor (SELECT: 1 çağrı). `get_schedule_requests_service` her etkinlik satırı için onu çağırıyor.
  - Ekranda: Time off → çekmece → Activity → "Entire shift released to open coverage" satırları.
  - Yeri: FB-6.4 A2.1.
- **BL-189 (leave: medium / do: risky) — onaylanmış takası Schedule taslağına geri alan kurtarma fonksiyonu eski kapıda — Tazelik: geçerli.**
  - Kanıt: `shift_exchange_schedule_recovery_service`: eski yardımcıya 2 çağrı, 3 hint'siz 42501 (SELECT).
  - Yeri: FB-6.4 A2.
- **BL-200 (leave: medium / do: moderate) — takas onayı cevaptan önce bildirim dağıtımını 2 sn'ye kadar bekliyor — Tazelik: geçerli.**
  - Kanıt: `apps/api/src/shift-exchanges/shift-exchanges-service.ts:106` (`AbortSignal.timeout(2_000)`), döngü `:107-130`.
  - Örnek: Ayşe Confirm transfer'e basar, ekran 2 sn'ye kadar bekler. Gecikme ölçülmedi.
- **BL-363 (leave: medium / do: moderate) — izin API'si iki yerde; Requests okuma rotası rota-yerel izin kapısında — Tazelik: değişmiş.**
  - Kanıt: `apps/api/src/schedule/schedule-requests-routes.ts:33-41` `authorizeAny`, `:72-79` `authorizeAnyActive`, `:128` ve `:150` `context.permissions.includes`. Aynı rota iki kopya: `/v1/...` `:25` ve header'lı `/schedule/requests` `:66`.
  - Bugünkü hâli: web yalnız header'lı kopyayı çağırıyor (`apps/web/src/schedule/requests-data.ts:38`); `/v1` kopyasını yalnız API testleri çağırıyor (`app.test.ts:845,913`). Rotanın "hayır" cevabı `authz.*` anahtarı taşımıyor (`:44-47`, `:80-83`), ekran bu yüzden ortak erişim-yok kartını gösteremiyor (BL-654).
- **BL-176 (leave: medium / do: moderate) — Requests rotası hâlâ izin anahtarıyla korunuyor — Tazelik: geçerli (Requests kısmı).**
  - Kanıt: `ScheduleRequestsPage.tsx:56-60` `PermissionRoute anyOf`; `auth/PermissionRoute.tsx:51` `permissions.includes`.
  - `grep -rn "permissions.includes" apps/web/src | wc -l` = 21 (FB-6.4 Done when 9'un başlangıcıyla aynı).
- **BL-041 (leave: medium / do: risky) — Requests > Shift Changes'in baştan sona elden geçirilmesi — Tazelik: değişmiş.**
  - Şemsiye madde. İçeriği bugün FB-6.4 (A1–C) ve bu ekran turunun bulgularıyla karşılanıyor.
  - Öneri: bu turun görev dosyasına bağlanır, tur kapanınca kapanır.
- **BL-654 (leave: medium / do: safe) — Requests okuma hatasında sunucunun iç cümlesi ekrana çıkıyor — Tazelik: geçerli.**
  - Kanıt: `ScheduleRequestsPage.tsx:280-290` `query.error.message`; Shorten formu da `mutation.error.message` basıyor (`TimeOffShorten.tsx:71`).
  - Örnek: Ayşe'nin izni oturum içinde düşerse "Schedule request read access required" yazısını görür.
- **BL-656 (leave: medium / do: moderate) — onay kutusu kapanınca odak kayboluyor, Esc çekmeceyi kapatmıyor — Tazelik: geçerli.**
  - Kanıt: `apps/web/src/shell/ConfirmDialog.tsx:53` `previous = document.activeElement`. Not kutusu `autoFocus` (`ScheduleRequestsPage.tsx:569`) etkiden önce odağı alıyor; geri dönülecek öğe kutunun içindeki textarea oluyor ve kaybolunca odak `:85`'te boşa düşüyor.
  - Ekranda: Time off → talep → Deny → Cancel → Esc.
- **BL-657 (leave: medium / do: safe) — Requests bütün odak halkalarını kaldırıyor — Tazelik: geçerli.**
  - Kanıt: `apps/web/src/views/requests-catalog.css:215-219` `:is(button, summary, [tabindex]):is(:focus, :focus-visible) { outline: none; box-shadow: none }` (WCAG 2.4.7).
- **BL-658 (leave: medium / do: safe) — Requests'teki yedi görünüm kusuru — Tazelik: geçerli (7 kalemin 6'sı kodda doğrulandı).**
  - (1) Shorten formu yapışkan karar çubuğunun içinde: `ScheduleRequestsPage.tsx:756-762` (`{shorten}` `.request-decisions` içinde), çubuk `styles.css` `.request-decisions { position: sticky }`. Butonlar stilsiz: `TimeOffShorten.tsx:72-73`.
  - (2) Arama kutusu çift kenarlık: `requests-catalog.css:166-178` (özgüllük 0,3,1), `:179-184` (`border:0`, 0,2,1) onu ezemiyor.
  - (3) Bırakılan vardiya listesi kelime kelime kırılıyor: `styles.css:13037-13041` iç içe `li`'ye de grid uyguluyor.
  - (4) Shift changes'in sekme, arama ve başlıkları Time off'tan farklı: `ShiftExchangeHub.tsx:528-563` (aramada simge yok, "All my locations" ile "All locations" farkı).
  - (5) X simgesi sıkışıyor: `:2040-2046`.
  - (6) Boş durumda iki kat çerçeve: `:886-894`. Görsel olarak ölçülmedi, C raporu bakar.
  - (7) "Try another date range" yazıyor ama sayfada tarih seçici yok: `:809-811`.
- **BL-674 (leave: medium / do: safe) — Shift changes'te ham ISO tarih ve 24 saat; workspace saat biçimi yok sayılıyor — Tazelik: geçerli.**
  - Kanıt: `ShiftExchangeHub.tsx:726-729` "2026-10-09 / 17:00 – 22:00"; `ExchangeShiftCard.tsx:44` sabit `"12h"`.
  - Ek (YENİ kalem): Time off çekmecesinde Activity saati cihazın diliyle ve diliyle (`ScheduleRequestsPage.tsx:820` `toLocaleString()`), onay saati cihaz diliminde sabit 12 saat (`TimeOffProgressPanel.tsx:71-72`). "Decide by" ise talebin diliminde. Aynı çekmecede iki saat dili var.
- **BL-515 (leave: medium / do: moderate) — ortak çekmece açıkken toast tıklanamıyor, ekran okuyucu okumuyor — Tazelik: geçerli (ortak parça).**
  - Kanıt: `settings/CatalogDrawer.tsx:39-41` `inert`; `App.tsx:143` `<Toaster />`.
  - Requests Time off bunu kısmen dolanıyor: çekmece içi bildirim `ScheduleRequestsPage.tsx:105-107`.
- **BL-507 (leave: medium / do: safe) — izin süre işinin hataları yalnız Postgres günlüğünde kalıyor — Tazelik: geçerli.**
  - Kanıt: `20261003041000_time_off_one_notice_per_pass.sql:37-38`, `:111-112` `raise warning`. Kalıcı kayıt yok (SELECT: gövdede `insert` yok).
- **BL-217 (leave: medium / do: moderate) — `shift_exchanges_v1` testi gerçek seed lokasyonunun saat dilimini değiştiriyor — Tazelik: geçerli.**
  - Kanıt: `supabase/tests/shift_exchanges_v1.test.sql:163,194,196`.
- **BL-604 (leave: medium / do: moderate) — yeni liste dili Requests'e yayılmadı — Tazelik: geçerli.**
  - Kanıt: sayfa sınıfında `list-page` yok (`ScheduleRequestsPage.tsx:268,295`).
  - Ortak değer değişikliği; Mert'e sorulacak.
- **BL-600 (leave: medium / do: moderate) — arama ve açılır liste kenarı 1.86:1 kontrastta — Tazelik: geçerli (Requests de aynı kenarı kullanıyor).**
  - İki işaret çelişiyor: bırakmak erişilebilirlik açığı, yapmak ortak bir renk ve bütün ekranlar. Mert'in kararı gerekiyor.

### Düşük
- **BL-256 (leave: low / do: safe) — Requests'in stil bloğu Deny ve Revoke'u düz beyaz boyuyor — Tazelik: geçerli.**
  - Kanıt: `requests-catalog.css:126-145`. `.sx-root button:not(.request-catalog-button)` yüzünden özgüllük 0,3,1 oluyor ve `.nf-button.danger` (`:161-164`, 0,3,0) kırmızı tonu alamıyor. `:153` `.secondary` tuzağı da duruyor.
- **BL-399 (leave: low / do: safe) — Revoke soluk görünüyor — Tazelik: değişmiş.**
  - "Tek tık" kısmı artık doğru değil: Revoke onay kutusu açıyor, Reason zorunlu, onay düğmesi kırmızı (`ScheduleRequestsPage.tsx:162-178`, `:528-534`, `:558-560`).
  - Kalan yalnız renk; o da BL-256 ile aynı CSS. İkisi birleşebilir.
- **BL-653 (leave: low / do: safe) — çekmecede yanlış metinler — Tazelik: geçerli.**
  - Karar verilmiş iptalde "until this is approved" yazıyor: `ScheduleRequestsPage.tsx:714-716`.
  - Müdürün notu "Employee note" başlığıyla çıkıyor: `:723-728`. Not metni `20261003040000_time_off_forgets_location_and_parts.sql:582`'den geliyor.
- **BL-663 (leave: low / do: safe) — sıralı sütunun oku yalnız fareyle görünüyor — Tazelik: geçerli.**
  - Kanıt: `styles.css:1298-1310` `opacity: 0`; `CatalogSortButton.tsx` yönü ve aktif sütunu çizmiyor (yalnız `aria-pressed`).
- **BL-661 (leave: low / do: safe) — "All 1 active applications will close." — Tazelik: geçerli.**
  - Kanıt: `ShiftExchangeHub.tsx:1505`.
- **BL-364 (leave: low / do: safe) — sistemin yazdığı izin kısaltma satırı Closed listesinde düz "Leave cancellation" — Tazelik: geçerli.**
  - Kanıt: `ScheduleRequestsPage.tsx:608-610` ayrım yapmıyor. Veritabanında ayrım var (`time_off_event_is_shortening`), okuma modeline girmiyor.
  - Etiket metni için varyant gerekiyor (P04).
- **BL-375 (leave: low / do: safe) — Shift changes "hayır"ı kendi kartıyla gösteriyor — Tazelik: geçerli.**
  - Kanıt: `ShiftExchangeHub.tsx:374-386` "Shift Hub is unavailable" + ham mesaj. Hub dosyasında `isNoAccess` yok (grep).
- **BL-396 (leave: low / do: safe) — izin kısaltma bildirimi onaylayana "is back on the schedule" diyor — Tazelik: geçerli.**
  - Kanıt: `20261003040000_time_off_forgets_location_and_parts.sql:622`; canlı tanım `notify_time_off_shortened` (SELECT).
- **BL-398 (leave: low / do: safe) — kısaltma ve iptal formunda ham renkler — Tazelik: değişmiş (satırlar kaydı, sayı arttı).**
  - Kanıt: `employee-hub/time-off.css:14,21,56,58,60,66,72` `#c5ccd6`, `:75` mavi odak `#508dc8`. Requests'teki Shorten formu bu dosyayı kullanıyor (`TimeOffShorten.tsx:12`).
- **BL-110 (leave: low / do: safe) — ölü "saat yok" dalları — Tazelik: değişmiş.**
  - Requests kısmı taşınmış: "Hours need verification" artık `TimeOffProgressPanel.tsx:68`'de.
  - Duranlar: shared `time_unknown` `packages/shared/src/time-off.ts:104`; veritabanında `time_off_assignment_impact` sabit `false`; Shift Hub "Unconfirmed" `ShiftExchangeHub.tsx:1779,1874` (sınırda).
- **BL-411 (leave: low / do: safe) — bilinmeyen talep 403, var olan talepte üye olmayan 404 alıyor — Tazelik: değişmiş.**
  - `authorize_time_off_request` silinmiş, ama aynı sıra `decide_time_off_service`'te duruyor: talep bulunamazsa önce `authz.out_of_scope` (403) veriliyor, üyelik sonra soruluyor (SELECT, gövdenin başı).
  - Ayrıca workspace kilidi üyelik sorulmadan önce alınıyor.
- **BL-509 (leave: low / do: safe) — her CHECK ihlali (23514) "ekran bayat" 409'u oluyor — Tazelik: geçerli.**
  - Kanıt: `apps/api/src/time-off/time-off-voting-service.ts:50-51`.
  - Ekranda gerçek bir hata "This request changed. Review it again." diye görünüyor (`ScheduleRequestsPage.tsx:211-214`).
- **BL-506 (leave: low / do: moderate) — süre işi tek turda 500 talebi kapatıp kilidi tutuyor — Tazelik: geçerli.**
  - Kanıt: `20261003041000…:27,44` `limit 500`; `:31,46` `availability_lock_workspace`.
- **BL-517 (leave: low / do: safe) — iptal isteği şeması aynı istekte çakışan saatleri reddetmiyor — Tazelik: geçerli.**
  - Kanıt: `packages/shared/src/time-off.ts:71-76`. Yöneticinin Shorten şeması da aynı (`:38-43`).
  - Veritabanının reddedip reddetmediği ölçülmedi (yazma gerekiyor).
- **BL-518 (leave: low / do: moderate) — dönem saat dilimi veritabanında zorunlu, shared'da isteğe bağlı — Tazelik: geçerli.**
  - Kanıt: `packages/shared/src/time-off.ts:154` `.optional()`. Zorlamalar: `TimeOffShorten.tsx:48`, `TimeOffPeriods.tsx:13-14`, `TimeOffCancellation.tsx:58`.
- **BL-512 (leave: low / do: safe) — izin ekranlarında biçim kırıntıları — Tazelik: değişmiş.**
  - Requests kalemleri (1) ve (3) bayat: dönemler `formatTimeOffDay` ile yazılıyor (`TimeOffPeriods.tsx:8`), panel başlıkları aynı biçimde.
  - Kalan (2) ve (4) Employee Hub'ın, (5) Schedule Publish'in. Bu ekranın dışında.
- **BL-513 (leave: low / do: safe) — telefonda başlık satırı kayıyor — Tazelik: geçerli (kod).**
  - Kanıt: `settings/jobs-settings.css:1149` ikinci başlığı telefonda gizliyor; Requests başlığı aynı sınıfı taşıyor (`ScheduleRequestsPage.tsx:360`). Görsel olarak C raporu bakar.
- **BL-589 (leave: low / do: safe) — 850/900 yazı ağırlığı — Tazelik: değişmiş.**
  - Requests'in kendi CSS'inde (requests-catalog, shift-exchanges) 850/900 yok (grep 0).
  - Requests'te görünen tek yer ortak onay kutusu başlığı (`styles.css:7394`).
- **BL-227 (leave: low / do: safe) — `weekly_exchange_changed_terms` kırmızı — Tazelik: geçerli.**
  - Kanıt: `supabase/tests/ci-not-green.txt:4`. Yeri: FB-6.4 A1.
- **BL-228 (leave: low / do: safe) — onay ve yayın aynı anda olursa zaman damgası penceresi — Tazelik: geçerli.**
  - Kanıt: `shift_exchange_draft_undoes` hâlâ `updated_at>pub.published_at` (SELECT `t`).
- **BL-229 (leave: low / do: safe) — cover ve open pickup için test yok — Tazelik: geçerli.**
  - Kanıt: `approved_exchange_*.test.sql` iki dosyada `open_pickup`/`cover` geçmiyor (grep boş).

### Bayat
- **BL-508 (leave: low / do: safe) — izin ilerlemesi oy veremeyen okuyucuya gidiyor — Tazelik 2026-10-05 (e929abc7): bayat.**
  - Maddedeki durum (eş müdür Ayşe, Hande'nin talebini okuyor) artık oluşamıyor. Talebi yalnız `requests.read` geçen okur ve bu eylem `rank_below=t, no_self=t` (SELECT `authz_actions`). Liste kişi kişi süzülüyor (`get_schedule_requests_service`, `reached`). pgTAP: `time_off_seen_by_who_decides.test.sql:5-10`.
  - Kalan okuyucular (S3/S4 müdürleri) KARARLAR'a göre talebi görebilir.
  - Kapatılması önerilir: FB-6.3.8c, main'de `a13df69b`.

## 2. Prototip farkları — taşı / bırak / varyant gerekir
P1'in "polished / not ported / fixed" satırları bugünkü kodda yeniden doğrulandı. "matched" satırlarına yeniden bakılmadı.

| P1 | Ne | Bugün kodda | Öneri | Dayanak | BL |
|---|---|---|---|---|---|
| R9 | Arama kutusu tek kenarlık | Çift: `requests-catalog.css:166-184` | **taşı** | CLAUDE.md §9 görsel tutarlılık | BL-658 (2) |
| R10 | Sıralı sütun okunu korur | Yalnız hover: `styles.css:1298-1310` | **taşı** (ortak değer: Settings katalog listeleri de değişir, adıyla söylenir) | WCAG / CLAUDE.md "ortak değer değişince" | BL-663 |
| R25 | Bırakılan vardiya listesi düzgün | Kelime kelime: `styles.css:13037-13041` | **taşı** | hata düzeltmesi (P02) | BL-658 (3) |
| R28 | Deny/Revoke kırmızı tonlu | Düz beyaz: `requests-catalog.css:126-164` | **taşı** | CLAUDE.md §9 buton dili | BL-256, BL-399 |
| R33 | Kutu kapanınca odak düğmeye döner | Kayboluyor: `ConfirmDialog.tsx:53,85` | **taşı** (ortak bileşen, R2) | WCAG 2.4.3 | BL-656 |
| R42 | "Saving..." | Gerçek uygulamada var (`ScheduleRequestsPage.tsx:557`) | **bırak** | prototipte sunucu yok | — |
| R45 | Shift changes sekmeleri Time off'un denetimiyle | Yeşil tonlu ayrı denetim | **taşı** (Mert prototipte gördü; tek ekran görüntüsüyle teyit) | CLAUDE.md §9 tutarlılık; P04 koşulu: tutarlılık ayarı | BL-658 (4) |
| R48 | Shift changes aramasında simge | Yok: `ShiftExchangeHub.tsx:554-562` | **taşı** | aynı | BL-658 (4) |
| R51 | Liste başlıkları Time off'la aynı | 10 px alçak, açık | **taşı** | aynı; BL-604 ile birlikte | BL-658 (4) |
| R52 | Shift sütunu "Fri, Oct 9 / 5:00 PM – 10:00 PM" | Ham ISO + 24 saat: `:726-729` | **taşı** | ILKELER P12 (ABD) + Settings saat biçimi (R14 ile tutarlılık) | BL-674 |
| R59 | Vardiya kartı 24 saat ayarını izler | Sabit 12h: `ExchangeShiftCard.tsx:44` | **taşı** | aynı | BL-674 |
| R78 | Kapanmış iptalde "until this is approved" yok | Var: `ScheduleRequestsPage.tsx:714-716` | **taşı** | P21 (doğru, tek mesaj) | BL-653 |
| R79 | Müdür notu "Note for <ad>" başlığıyla | "Employee note": `:723-728` | **taşı** | P21; Shorten formunun kendi sözcüğü | BL-653 |
| R84 | Shift change çekmecesinin X'i 17×17 | Sıkışık: `:2040-2046` | **taşı** | CLAUDE.md §9 tutarlılık | BL-658 (5) |
| R85 | Shorten formu: başlık görünür, 36 px düğmeler, vazgeç solda aksiyon sağda | Çubuk çekmeceyi kaplıyor, düğmeler stilsiz: `ScheduleRequestsPage.tsx:756-762`, `TimeOffShorten.tsx:72-73` | **taşı** | P20 (sağ altta tek kaydet noktası), KARARLAR UI-09 buton dili | BL-658 (1) |
| R76, R77, R86 | Prototipin kendi kusurları (yeniden çizim döngüsü, odak, Schedule seed köprüsü) | — | **bırak** | gerçek uygulamada karşılığı yok | — |
| R16 | Newest/Older sayfalama | Gerçek uygulamada var (`:405-433`), prototipte veri yok | **bırak** | — | — |

## 3. KARARLAR'da olup kodda olmayan kurallar
1. **(yüksek) Takas onayında rütbe yok; eş müdür birbirinin takasını onaylıyor.**
   - Ekranda: Shift changes → vaka → Confirm transfer.
   - Örnek: Kadıköy müdürü Ali, eş müdür Ayşe'nin Hande'ye verdiği vardiyayı onaylayabiliyor.
   - Kanıt: komutta `authorize` yok (SELECT); `exchange.approve rank_below=t` kullanılmıyor.
   - Dayanak: ILKELER P07 + KARARLAR "Takas… Onay". Eşleme: BL-276 (1), FB-6.4 A2. `leave: high / do: risky`.
   - Bildirim de aynı süzgeçten geçmiyor: eş müdür onaylayamayacağı vakanın bildirimini alıyor (`shift_exchange_notification_allowed`, `shift_exchange_emit_notification_base` eski yardımcıda, SELECT).
2. **(yüksek) Yol süresi takası engelliyor, dinlenme süresine hiç bakılmıyor.**
   - KARARLAR "Yol ve dinlenme süresi" (2026-10-03, D7): her zaman onaylayana işaret olmalı, engel değil.
   - Ekranda: Shift changes → vaka → aday kartı "Not allowed / Recheck needed".
   - Örnek: Garson2'nin Beşiktaş vardiyası 17:00'de bitiyor, Kadıköy'ün 17:30 vardiyası için listeden düşüyor. Müdür onay ekranında "Travel 30 min, rule 45 min" görmüyor.
   - Kanıt: `weekly_assignment_candidate_base` gövdesi (SELECT): yol ihlalinde `state:='ineligible'`; `minimum_rest` hiçbir aday fonksiyonunda yok.
   - Eşleme: **YENİ** (BL yok; FB-6.4 A1.3'te planlı). `leave: high / do: risky`.
3. **(orta) Kısıtlı kişi takas açıp başvurabiliyor.**
   - KARARLAR "Kısıtlı kişi … talep işleri kapalı", FB-6.4 D4.
   - Örnek: gıda kartı süresi geçmiş garson Bora cover isteyebiliyor ve başvurabiliyor; müdürün kuyruğuna düşüyor.
   - Kanıt: komutta belge ya da kısıt denetimi yok (SELECT: "document" geçmiyor); `exchange.offer_own/apply_own` `restricted_ok=f` uygulanmıyor.
   - Eşleme: **YENİ** (FB-6.4 A2.2'de planlı). `leave: medium / do: risky`.
4. **(orta) Belgesi gecikmiş müdür bekleyen talebi hiç göremiyor.**
   - KARARLAR "İzin" Ek S3 (2026-10-01): "talebi görür ama oy veremez; Approve düğmesi kapalı".
   - Örnek: Kadıköy müdürü Hande'nin belgesi gecikmiş. Requests'i açınca Ali'nin talebi yok; Shift changes okuma izni de yoksa erişim-yok kartı çıkıyor.
   - Kanıt: `requests.read` `restricted_ok=f` (SELECT `authz_actions`). `authz_check` belgesi engelli kişiye `document_blocked` dönüyor. `get_schedule_requests_service` `time_off_reason(...,'requests.read', e.id)` çağrısını `documents_aside=false` ile yapıyor. Bu durum için pgTAP hücresi yok; `time_off_voting.test.sql:427-432` yalnız oy ve talep reddini kilitliyor.
   - Eşleme: **YENİ**. `leave: medium / do: risky` (yetki kuralı).
   - Not: genel "Kısıtlı kişi … yönetim işleri kapalı" kuralıyla S3 çelişiyor görünüyor. S3 daha yeni ve daha özel (P22), bu yüzden uygulanması önerilir.
5. **(orta) Bildirimden gelen müdür kapanmış izin talebini açamıyor.**
   - KARARLAR "Bildirimler — karar verene gider" ve P10 (niyet, ilerleme kaybolmaz).
   - Örnek: Beşiktaş müdürü Mehmet "Time off approved" bildirimine tıklar. Requests "Needs review" kuyruğuyla açılır, Ali'nin talebi açılmaz, bir uyarı da çıkmaz.
   - Kanıt: `requests.time_off.decided` `action_url = /app/schedule/requests?tab=time-off&request=<id>` (SELECT, `notify_schedule_request_event_service`). Sayfa kuyruğu her zaman `needs_review` başlatıyor (`ScheduleRequestsPage.tsx:90-92`) ve talebi yalnız o kuyrukta arıyor (`:129-132`).
   - Shift changes'te aynı durum için "outside your list filters" bandı var (P1 R54); Time off'ta yok.
   - Eşleme: **YENİ**. `leave: medium / do: safe`.
6. **(düşük) Owner'ın girdiği takas vakası için kural yazılı değil.**
   - Bugün rütbe kuralı olmadığı için herhangi bir müdür onaylayabiliyor; rütbe gelince kimse onaylayamayacak.
   - Eşleme: FB-6.4 D3(c), ürün sorusu (bölüm 4).
7. Uygulanmış ve doğrulanmış olanlar:
   - Decide by talebin dilimi ve dilim adıyla yazılıyor (`time-off-split.ts:46-49`).
   - Shift changes sekmesinde sayı yok, "Select a request" yer tutucusu yok (grep 0).
   - Revoke gerekçesi zorunlu (`packages/shared/src/time-off.ts:93`).
   - Bekleyen ve kapanmış izni yalnız karar veren okuyor (`requests.read` rank/no_self).
   - S4 pgTAP'te kilitli (`time_off_seen_by_who_decides.test.sql:103-125`).

## 4. Hâlâ açık ürün soruları (FB-6.4 ve diğer)
- **FB-6.4 D3(c) — owner'ın girdiği takas, pickup ya da cover vakasını kim onaylar?**
  - Örnek: owner Mert Cuma vardiyasını garson Hande'ye verir.
  - Seçenekler `nf-guvenlik` raporunda (`20261005T131114…:58-63`):
    - (a) Kabul edilince onaysız kaydolur, lokasyon müdürlerine bildirim gider. Önerilen. Dayanak: KARARLAR "Rütbe" owner kuralı (izin için yazılmış, BL-183) + P07.
    - (b) Lokasyon müdürü onaylar (P07'ye aykırı).
    - (c) Owner takasa katılamaz.
- **Onaylayamadığı vakada Confirm transfer düğmesi kapalı mı, gizli mi?** Görsel karar; FB-6.4 B'de varyantla (P04).
- **FB-6.4 B.1 — onay ekranında yol/dinlenme ve "kendi rızasıyla" işaretinin görünümü.** Yeni görsel öğe, 2–3 varyant (P04).
- **BL-364 — sistemin yazdığı kısaltma satırının etiketi ve yeri** (ör. "Shortened for a shift"). Ekran kararı, varyant.
- **BL-600 — arama ve açılır liste kenar rengi.** Kayıtlı DOC-TABLE kararını değiştirir; Mert'in kararı.
- **BL-604 / R10 / R45–R51 — Requests'i ortak liste diline çekmek.** Ortak değer değişir; uyuşmayan öteki ekranlar adıyla söylenir ve sorulur.
- FB-6.4 S1 cevaplandı (D7), S2 kapandı (M5); ikisi açık değil.
- **Plan düzeltmesi (soru değil, koordinatöre):** FB-6.4 A3.5 "header'lı ikinci kopya (`schedule-requests-routes.ts:66`) silinir" diyor. Web yalnız o kopyayı çağırıyor (`requests-data.ts:38`). Silmeden önce web `/v1` rotasına taşınmalı ya da tersine `/v1` silinmeli. Yoksa Requests boş açılır.

## 5. Sınırda
- **BL-652 (leave: medium / do: safe) — Shift Hub geçmişi ertesi gün kayboluyor.** Tazelik: geçerli, ve müdürü de etkiliyor. Requests → Shift changes → History de yalnız bugün ve sonraki vardiyaları gösteriyor (`ShiftExchangeHub.tsx:292-293` `from = todayIn()`, tarih seçici yok). Kararı ekran 13 ile ortak ("karar gerekir").
- **BL-397 (low/safe), BL-400 (low/safe) — ortak `ShiftExchangeHub`.** Rıza metni iki görünümde (`:604`, `:1373`; `shift-exchanges.css:253`). Telefonda filtre boşluğu (`shift-exchanges.css:127-128`). Müdür ekranında da görünüyor. Tazelik: geçerli.
- **BL-110'un Shift Hub yarısı** — "Unconfirmed" `ShiftExchangeHub.tsx:1779,1874` (çalışanın seçicisi).
- **BL-410 (low/safe) — Workspace "Pending requests" kutusu izni olmayana 0 gösteriyor.** Tazelik: geçerli (`WorkspacePage.tsx:391-400`, kutuda `can()` yok). Ek gözlem: Shift changes sayısı müdürün onaylayamayacağı vakaları da sayıyor (`:108`). Rütbe kuralı gelince sayı da aynı kurala geçmeli (P1 W22/W42).
- **BL-167 (low/safe), BL-189 — takastan sonra Schedule'a geri alma.** Schedule eylemi, takas fonksiyonu. BL-167 tazelik: değişmiş (yalnız güncelleme dalı; `20260926200000…:433-436`).
- **BL-362 (medium/moderate) — Schedule hücresinden "izni kısalt ve ata" tek adım.** Ortak parça `shorten_time_off`; Schedule ekranının işi.
- **BL-544 (low/moderate) — izin ve kapalı gün vardiyayı open'a ayrı ayrı düşürüyor.** Requests onayı ile Important Dates ortak.
- **BL-523 (low/moderate) — onaylı izin anahtarı ayarda.** Tazelik: değişmiş, okuyucu artık `assess_weekly_shift_availability` (`20261007000000_availability_always_warns.sql`). Settings/Schedule'ın işi.
- **BL-519 (low/safe) — dört haftalık testte ham `set status`.** Tazelik: geçerli (`weekly_assignment_candidates.test.sql:96` vb.). FB-6.4 motoru bu testlere dokunacak.
- **BL-580 (low/moderate) — ortak onay kutusu telefonda 8 px kayık.** Tazelik: değişmiş, satır şimdi `styles.css:7361`. Requests'in Approve/Deny/Revoke kutuları da etkileniyor.
- **BL-057 — Shift Hub bilgi mimarisi.** Ekran 13.
- **Bildirimler:** Time off bildirimleri `?tab=time-off&request=`, takas bildirimleri `?tab=shift-changes&case=` ile geliyor (SELECT). Kapanmış talep sorunu için bölüm 3 madde 5.

## 6. Ölçülemeyenler ve nedeni
- Görsel kusurlar (çift çerçeve BL-658 (6), telefon başlığı BL-513, kontrast BL-600) yalnız koddan doğrulandı; ekran görüntüsü C raporunun işi.
- BL-200'ün gerçek gecikme süresi: uygulama çalıştırılmadı (ağır iş yasak).
- BL-517: veritabanının çakışan saatleri reddedip reddetmediği. Yazma gerektiriyor (yalnız SELECT izni var).
- Bölüm 3 madde 4 (S3) ve madde 3 (kısıtlı kişi takası) yalnız fonksiyon gövdesi ve katalogdan çıkarıldı. Örnek veriyle denenmedi (yazma gerektiriyor).
- BL-228 yarışı: tekrar üretilemez, yalnız kod okuması.
- Takas tarafında 2026-10-04 müsaitlik kuralları (M6 "kendi rızasıyla" işareti) onay ekranında ayrıca ölçülmedi. FB-6.4 B'nin işi; aday fonksiyonu müsaitliği engel saymıyor (`weekly_assignment_candidate_base` satır 43-44, SELECT).
- Skill: istenen `superpowers:verification-before-completion` açılmadı. Her hüküm komut, dosya:satır ya da SELECT ile yazıldı. Mesajın sonuna eklenen brainstorming/writing-plans/tech-debt/system-design çağrıları salt okunur keşfe uymadığı için uygulanmadı.

## Kanıt listesi (komut + sonuç)
| Komut | Sonuç |
|---|---|
| `git log -1 --format=%h` | `e929abc7` |
| `select max(version) from supabase_migrations.schema_migrations` | `20261007030000` (repodaki son dosyayla aynı) |
| `pg_proc` içinde `schedule_actor_*` çağıranları | `shift_exchange_emit_notification_base` 2, `shift_exchange_notification_allowed` 2, `shift_exchange_preview` 3, `shift_exchange_schedule_recovery_service` 2, `shift_exchanges_command_service` 3, `time_off_event_released_assignments` 1; hiçbirinde `authorize` yok |
| `select count(*) from pg_proc where proname='eligibility'` | 0 (motor yok) |
| `app_private.authz_actions` (`exchange.*`, `time_off.*`, `requests.*`) | `exchange.approve` place, `no_self=t`, `rank_below=t`; `requests.read` person, `rank_below=t`, `restricted_ok=f`; `exchange.offer_own/apply_own` `restricted_ok=f` |
| Takas fonksiyonlarında hint'siz 42501 sayımı | komut 8, kurtarma 3, okuma 2, önizleme 1, kabul 1; `authz` hint 0 |
| `weekly_assignment_candidate_base` gövdesi | yol ihlali `state:='ineligible'`; `minimum_rest` 0 fonksiyonda |
| `get_schedule_requests_service` gövdesi | okuma `time_off_reason(...,'requests.read', e.id)` (`documents_aside` varsayılan `false`); progress bekleyen her satırda |
| `authz_check` gövdesi | `document_blocked and not restricted_ok` → `'document_blocked'` |
| `notify_schedule_request_event_service` gövdesi | `requests.time_off.decided` → karar verenlere `?tab=time-off&request=` |
| `notify_time_off_shortened` | `' is back on the schedule.'` (`20261003040000…:622`) |
| `time_off_sweep` | `limit 500` t, `raise warning` t, `insert` f (`20261003041000…:27,37-38,44`) |
| `decide_time_off_service` başı | talep yoksa `authz.out_of_scope`, üyelik sonra |
| `grep -rn "permissions.includes" apps/web/src \| wc -l` | 21 |
| `grep -rn "schedule/requests" apps/web/src` | web yalnız `requests-data.ts:38` → `/schedule/requests` (header'lı kopya) |
| `grep -rn "font-weight: *\(850\|900\)"` (Requests CSS'leri) | 0; Requests'te görünen tek yer `.app-confirm h2` (`styles.css:7394`) |
| `cat supabase/tests/ci-not-green.txt` | `weekly_exchange_changed_terms` duruyor |
| `grep open_pickup\|cover approved_exchange_*.test.sql` | boş |
| Dosya okumaları | `ScheduleRequestsPage.tsx` (tamamı), `TimeOffShorten.tsx`, `TimeOffProgressPanel.tsx`, `TimeOffPeriods.tsx`, `requests-catalog.css:100-300`, `styles.css:1290-1315, 12736-12768, 13028-13060`, `ConfirmDialog.tsx:40-100`, `ShiftExchangeHub.tsx` (ilgili aralıklar), `schedule-requests-routes.ts`, `time-off-voting-service.ts`, `shift-exchanges-service.ts:95-137`, `lib/no-access.ts`, `requests-data.ts` |
| Okunan belgeler | `KANONIK.md`, `proto-audit/P1.md` (R1–R86, W22/W42), `EKRAN-PLANI.md`, `KARARLAR.md` (Ürün kuralları, Schedule → Requests), `tasks/FB-6.4.md`, `.newfork-inbox/done/20261005T131114-nf-guvenlik-sec-a2-a3-tasarim.md` (A2), `BACKLOG.md` (açık bölüm, 1–1334) |

Dosya yazılmadı (salt okuma). Rapor yazılacak yol: `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\handoff-koordinatorlugu-20c0b3\docs\plan\ekranlar\02-requests\A-backlog-prototip.md`.
