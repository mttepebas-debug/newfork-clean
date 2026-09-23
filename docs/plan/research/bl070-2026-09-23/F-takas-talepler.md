# F-takas-talepler — vardiya takası, cover, release ve talepler

Ölçüm zamanı: 23 Eylül 2026, ~05:45–06:05 UTC (veritabanı tarihi 2026-09-23), main `41783c7`, ortak container `supabase_db_newfork-clean`. Her deneme tek transaction içinde yapıldı ve `rollback` ile geri alındı. Deney betikleri: `scratchpad/bl070-research/F/` (setup.sql, exp1–exp6.sql, patch.sql) ve `F_wect_variant.sql`.

Deneylerde kullanılan kurgu (hepsi geri alındı): lokasyonlar **Kadıköy** ve **Beşiktaş**; **Ali** ve **Ayşe** iki lokasyona da atanmış Server; **Mehmet** yalnız Beşiktaş; **Kemal** Kadıköy yöneticisi (kendi çalışan kaydı var, iki lokasyona atanmış); **Berk** Beşiktaş yöneticisi; **Olga** owner (kendi çalışan kaydı var).

## Kısa özet

- Üç dosyanın kırmızısının kökü aynı gün: **15 Eylül, BL-064** (commit `7a35dbc`). O gün "kimse aynı anda iki yerde çalışamaz", yol süresi ve dinlenme kuralları, bir vardiyaya kişi yazılırken çalışan **ortak değerlendiriciye** (`assess_weekly_shift_availability`: Schedule'da, Line Up'ta ve Shift Hub'da "bu kişi bu vardiyaya konabilir mi" sorusunu cevaplayan tek veritabanı fonksiyonu) eklendi. Aynı değerlendiriciye "lokasyon ve job ataması şart" kuralı da eklendi. Kuralların kendisi hedefle uyumlu. Sorun şurada: değerlendirici dışarıda bırakabildiği yalnız **bir** vardiya tanıyor. Kişinin aynı işlemde elinden çıkardığı vardiya bu yüzden "başka vardiya" sayılıyor. Commit mesajı DB testlerinin koşulmadığını söylüyor ("No new DB execution").
- 22 Eylül commit'leri (`6401acd`, `7706966`) yalnız testleri değiştirdi, kodu değil. Kırılma onlardan gelmiyor.
- **Asıl büyük bulgu:** bugün takas, cover ve release **hiçbir ekrandan yapılamıyor**. Ayrıntısı Alan geneli'nde.

---

### weekly_exchange_changed_terms

**Ekrandaki karşılığı:** Employee Hub → **Shift Hub**. Çalışan bir vardiyası için "Find cover" ya da "Swap shifts" açar, arkadaşı "Accept" der, sonunda yönetici onaylar. Bu dosya şu soruyu sınıyor: talep onay beklerken yönetici Schedule'da vardiyanın gününü, saatini ya da lokasyonunu değiştirirse talebe ne olur? Örnek: Ali'nin Cumartesi 18–22 Kadıköy vardiyasını Ayşe devralmayı kabul etti; onay beklerken yönetici vardiyayı Pazar 19–23 Beşiktaş'a taşıdı.

**Test ne iddia ediyor (kırmızı kontroller):** Hiçbir kontrol "not ok" vermiyor. Dosya 155. satırda **ölüyor**: 28 kontrol geçti, 29–43 arası 15 kontrol hiç koşmadı. 155. satır, yayınlanmış bir vardiyanın "mantıksal kimliğini" (`source_shift_id`: yayınlanan kopyayı Schedule'daki asıl vardiyaya bağlayan kimlik) yerinde değiştiriyor. Amaç #30'u kurmak: "different logical source cannot reuse the old request", yani vardiya başka bir vardiyaya dönüşürse eski talep geçersiz olsun. Koşmayan kontrollerin önemlileri:
- sahibi değişen vardiya rızayı devralmaz;
- pozisyon (job) değişince talep korunmaz;
- swap'ta iki tarafın kabulü korunur, davetli adına kabul uydurulmaz;
- **iki lokasyonlu swap ikinci lokasyonun yöneticisini bekler**;
- yeni koşullar önceki yönetici oyunu siler;
- yeniden yayında aynı vardiya devredilir;
- çalışan bu fonksiyonu doğrudan çağıramaz.

**Eski davranış (9 Eylül, `711da48`; migration `20260909042800_weekly_exchange_changed_terms.sql`, bekçi `20260909012001_schedule_availability_enforcement.sql`):** Yayınlanmış vardiyaya her yazışta "atama bekçisi" çalışıyordu (`guard_schedule_assignment_availability`: vardiyaya kişi yazılırken kontrol yapan veritabanı tetikleyicisi). O gün değerlendirici çakışan vardiyaya bakmıyordu.
1. Yönetici vardiyayı taşır (tarih, saat, lokasyon): talep açık kalır, Ayşe'nin kabulü korunur, iki tarafa bildirim gider, onay yetkisi yeni lokasyonun yöneticisine geçer.
2. Test kimliği yerinde değiştirir: bekçi yalnız müsaitlik ve izne bakar, yazış geçer, talep "invalidated" olur.
3. Vardiyanın sahibi değişir (Ali yerine Mehmet): talep geçersizleşir.

**Ne değişti:** 15 Eylül BL-064 (`20260915081826_bl064_conflict_severity.sql`, satır 60 ve 170–186). Değerlendiriciye gerçek zaman çakışması, yol süresi ve dinlenme eklendi. Değerlendirici yalnız kontrol ettiği vardiyanın **mantıksal** kimliğini dışarıda bırakıyor. Yazılı gerekçe `docs/rebuild/bl-064-schedule-conflict-plan-2026-09-15.md` §5'te, "Değiştirilemeyen Sistem Blokları" başlığı altında: "Gerçek zaman overlap'i: aynı employee'ye saatleri kesişen iki shift". Kural için gerekçe var; tek kimlikle dışlama için yazılı gerekçe yok.

**Yeni davranış:**
- Senaryo 1 ve 3 aynen çalışıyor. Deneyle doğrulandı: 155. satır "vardiyayı sil, yeni kimlikle yeniden yayınla" olarak yazılınca dosya **43/43 geçiyor** (`F_wect_variant.sql`).
- Senaryo 2 artık reddediliyor. Bekçi yeni kimliği dışlıyor, satırın kendi eski halini "başka vardiya" sayıyor: `time_overlap`, "Employee already has an overlapping shift", 2026-10-08 20:00–22:00 (kendi saati).
- Ürün bu kimliği **hiçbir yerde yerinde değiştirmiyor**. Canlı fonksiyonlarda arandı, yok. Gerçek hayatta "farklı vardiya" yeniden yayında yeni bir satır olarak gelir.

**Hedefe göre doğrulama:**
- **Kırmızının kendisi:** Kural hedefle uyumlu. Testin kurduğu durumu ürün üretemez; test geçmişi anlatıyor. "Canlı veri yok" kuralına göre test yeniden yazılır, kod bu duruma tolerans öğrenmez.
- **Dosyanın yeşil kontrollerinde hedefle çelişen bir kural var.** Tarih, saat ya da lokasyon değişince çalışanın kabulü korunuyor. Onay anında sistem çalışan adına "gönüllü kabul" kaydı yazıyor. Deney (exp5):
  - Ayşe, Ali'nin Cumartesi akşam Kadıköy vardiyası için cover'ı kabul etti. O saatte müsaitlik çakışması yoktu.
  - Sonra kendi müsaitliğine her gün 06–12 "müsait değilim" yazdı.
  - Yönetici vardiyayı Beşiktaş'a, sabah 07–11'e taşıdı. Ayşe'nin başvurusu "pending_manager" durumunda kaldı.
  - Beşiktaş yöneticisi Berk onayladı. Önizlemede müsaitlik çakışması **görünmedi**; önizleme "Position and location match, No assignment blockers" dedi.
  - Sistem kaydı: "Employee voluntarily accepted this shift through Shift Hub." Ayşe bu çakışmayı hiç görmedi.
  - Hedefe göre cover'da bütün kriterler sağlanmalı. Tek istisna: release pickup'ta çalışanın **kendi** override'ı. Bu davranış hedefle çelişiyor.
- Bu davranışın yazılı bir dayanağı var. `docs/rebuild/availability-redesign-spec-2026-09-08.md` §6: "…tarih/saat/lokasyonu değişirse kullanıcı kararına göre kabul korunur, çalışana değişiklik bildirilir… yeniden kabul istemez". Bir gün önceki Shift Hub planı ise tersini söylüyordu (`shift-hub-implementation-plan-2026-09-07.md` §5): "Maddi koşul değişir | Rıza geçersiz; güncel sürüme yeniden başvuru/kabul". 8 Eylül kararı yeni hedefle yeniden sınanmalı.
- Hedefle uyumlu olanlar:
  - swap iki lokasyonun oyunu bekler;
  - vardiya taşınınca eski lokasyonun yöneticisi onaylayamaz, yenisi onaylar;
  - koşul değişince yönetici oyu silinir;
  - onaylı izin yeni saatte de geçilemez.
- **KAPSAM MODELİ SORUSU (K3):** Vardiya onay beklerken Kadıköy'den Beşiktaş'a taşınırsa bildirim yalnız Berk'e gider. Kemal, kendi kuyruğundaki talebin kaybolduğunu görmez.

**Kanıt:**
- *Koşuldu:* dosyanın kendisi (155. satırda ölüyor); 155. satırı gerçekçi yolla değiştiren kopya (43/43); exp5 (koşul değişince fabrike rıza).
- *Kod okundu:* canlı `guard_schedule_assignment_availability` (mantıksal kimlik = `coalesce(source_shift_id,id)`); `assess_weekly_shift_availability` (dışlama tek kimlik); `refresh_weekly_exchange_terms` (`20260909042800`); `record_weekly_exchange_acceptance` (`20260909042700`, satır 50–51); `shift_exchange_preview` (`20260909002000`).
- *Aranan:* ürün kodunda `source_shift_id`'yi yerinde güncelleyen fonksiyon yok.

**Önerilen karar:** **Test düzelsin**, ayrıca **ürün kararı gerekli**.
- 155. satır, vardiyayı silip yeni kimlikle yeniden yayınlayarak kurulsun. Bu gerçek yeniden yayın yolu; denendi, 15 kontrol geri geliyor. (leave: medium / do: safe)
- Repo'da bekçiye "satırın kendi eski halini de dışla" eklemek, ürünün üretemediği bir durumu tolere etmek olur. Kimlik bir gün yerinde değiştirilebilir hale gelirse o zaman doğru seçenek bu olur.
- Ayrıca ürün kararı: koşul değişince kabul korunsun mu, çalışan adına müsaitlik rızası yazılsın mı? (leave: medium / do: moderate)

**Önceki karar ile karşılaştırma:** BL-092 bu dosyayı "taşınan parça kendi kaynağıyla çarpıştırılıyor" ailesine koyuyor. Kök aynı (tek kimlikle dışlama), ama burada tetikleyici bir ürün yolu değil, test fixture'ı. Bu dosya BL-092'den ayrılmalı: repo düzeltmesi gerekmiyor.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** 'same employee acceptance is not reset', 'retained acceptance is bound to current terms', 'current scoped manager completes the changed shift without employee re-acceptance'. Koşmayanlardan 'both swap participants retain consent after another term change' ve 'same logical shift transfers after republish without another employee response' da aynı kurala dayanıyor; ikincisinde saat 18:00'den 19:00'a değişiyor.

**Kullanıcıya sorular:** Alan geneli S3.

---

### shift_exchange_travel_policy

**Ekrandaki karşılığı:** Dosya adı yanıltıcı. Shift Hub'ı değil, neredeyse tamamen **Line Up**'ı sınıyor (Schedule → Line up: günlük görev ve istasyon dağıtımı; yöneticinin "assign / move / swap" işlemleri). Yalnız ilk 8 kontrol **Settings → Conflict handling → Minimum travel** ayarına ait (iki lokasyon arası en az yol süresi; örnek: Kadıköy'de 16:00'da biten Ali, Beşiktaş'ta en erken 16:30'da başlayabilir).

**Test ne iddia ediyor (kırmızı kontroller):** #22 "partial move with reserved travel is allowed". Travel 1'in Travel QA 1'deki 09–17 vardiyasının 10–12 parçası Travel QA 2'ye taşınıyor. Önizleme "olmaz" diyor, gerekçe "Employee already has an overlapping shift". Çakıştığı söylenen vardiya, parçanın geldiği 09–17 vardiyasının kendisi. Ardından `apply` hata veriyor ve #23–42 (20 kontrol) koşmuyor: kalan iş parçaları, açık kalan yol boşlukları, tekrar denemede aynı sonuç, üç kısmi swap senaryosu, saat kayıtlarının bozulmaması.

**Eski davranış (9 Eylül; aday kontrolü `20260909042600_weekly_assignment_candidates.sql`):** Aday kontrolü (`weekly_assignment_candidate_base`: "bu kişi bu parçayı alabilir mi" sorusunun Line Up ve Shift Hub ortak cevabı) kendi çakışma sorgusunda taşınan kaynağı "hariç tutulanlar" listesiyle doğru dışlıyordu. Ortak değerlendirici o gün çakışmaya bakmıyordu.
- (a) 10–12 parçası başka lokasyona taşınır, 30 dk yol boşluğu açık kalır: olur.
- (b) Başka lokasyonda 15 dk sonra başlayan iş: yol süresi yetersiz, olmaz.
- (c) İki kişinin 12–15 parçalarının kısmi swap'ı: olur.

**Ne değişti:** 15 Eylül BL-064. Aday kontrolü ortak değerlendiriciyi hariç tutulanlar listesini **geçirmeden** çağırıyor (`20260909042600`, satır 23). Değerlendirici yalnız hedefin kendi kimliğini dışlıyor, bu yüzden taşınan parçanın kaynağı "başka vardiya" sayılıyor.
- Yazılı gerekçe yalnız kural için (BL-064 §5).
- Bu değişiklik yazılı bir sözleşmeyi bozdu. `shift-hub-implementation-plan-2026-09-07.md` §6: "Swap'ta iki vardiya çıkarılarak sonuç takvimi hesaplanır. Source-linked Line Up placement aynı vardiyayı ikinci iş gibi saymaz". Aynı bölüm değerlendiricinin girdisini de sayıyor: `excluded_exchange_shifts`.

**Yeni davranış:** (a) reddediliyor (yanlış); (b) doğru; (c) reddediliyor.

Deneme (patch.sql, geri alındı): değerlendiriciye "dışlanacak vardiyalar listesi" verildi, aday kontrolü de kendi listesini geçirdi. #22 geçti. Dosya bu kez kısmi swap'ın **yazım** adımında öldü. İki vardiya sırayla güncellenirken ilk güncellemeden sonra kişi bir an iki vardiyada birden görünüyor ve atama bekçisi reddediyor. BL-092'deki "önizleme olur diyor, uygula reddediyor" cümlesinin ikinci yarısı bu. Düzeltmenin iki parçası var:
1. aday ve önizleme dışlaması;
2. swap yazımındaki ara durum.

**Hedefe göre doğrulama:**
- Kural (çakışma, yol süresi) hedefle uyumlu. Uygulama yanlış: kişinin bıraktığı vardiya kendisiyle çakışıyor sayılıyor.
- Line Up bu araştırmanın dışında. Ama **aynı kök Shift Hub swap'larını da bozuyor** (Alan geneli, B1). Bu yüzden düzeltme Line Up'ı beklememeli.
- Ayar kontrolleri (#1–8): ayarı owner değiştiriyor. "Manage conflict rules" izni yalnız owner ve admin rollerinde; veritabanında ölçüldü, 5+5 rol. Hedefle ve D1 ile uyumlu. Kontrol adı "manager sets shared travel minimum" diyor ama aktör owner; bu yalnız isim hatası.

**Kanıt:**
- *Koşuldu:* dosya (#22 not ok, sonra ölüyor); patch.sql ile aynı dosya (#22 geçer, kısmi swap yazımında `guard_schedule_assignment_availability` reddeder).
- *Kod okundu:* canlı `weekly_assignment_candidate_base`, `lineup_operation_preview` (satır 155: `weekly_lineup_offer_candidate(... exclude_ids ...)`), `lineup_operations_service` (satır 329–334).

**Önerilen karar:** **Repo düzelsin.** (leave: high / do: moderate)
- Ortak değerlendirici tek yerde "bu işlemde bırakılan vardiyalar" listesini alsın, bütün çağıranlar geçirsin. Aynı düzeltme Shift Hub swap'larını da açar.
- Blast radius pgTAP ile önce ve sonra ölçülebilir; bu yüzden moderate. Değerlendirici ortak kural olduğu için düzgün kontrol edilmeli.
- Line Up'ın kendi yazım sırası (kısmi swap) Line Up sadeleştirme kararına bağlı; o parça **Bekle**.
- Test tarafı: dosya içeriğine göre yeniden adlandırılmalı (Line Up), ayar kontrolleri ayrılabilir. Bu mekanik bir iş.

**Önceki karar ile karşılaştırma:** BL-092'nin tanımı bu dosya için doğru. Kök neden artık kesin: BL-064, 15 Eylül. "22 Eylül kuralları" değil.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** Yok. #1 yalnız isim hatası.

**Kullanıcıya sorular:** Yok. Line Up kapsam dışı.

---

### schedule_requests

**Ekrandaki karşılığı:** Schedule → **Requests** (yönetici ekranı). İki sekmesi var: **Time off** (izin talepleri; onayla, reddet, kısmi onayla) ve **Shift changes** (vardiya değişikliği talepleri). Kırmızı kısım Shift changes sekmesinin gösterdiği **eski talep sistemi**. Employee Hub bu talepleri "Earlier shift requests" diye gösteriyor: "These requests were created in the earlier workflow".

**Test ne iddia ediyor (kırmızı kontroller):**
- #30 "reasoned soft conflict can be approved" hata veriyor.
- #31–33 koşmuyor: onay vardiya sahibini değiştirir; olay kaydı yazılır; çözülmüş talep tekrar karar almaz. (Plan 33, koşan 29.)
- Kurulum: Main Dining'deki **boş** Cumartesi 18:00–02:00 Server vardiyası için Sam Rivera (yalnız Garden Room lokasyonu, yalnız Line Cook) "direct_coverage" talebi.
- #28: ekran bunu "Review: not assigned to this location", yani **yumuşak** diye gösteriyor.
- #29: kısa gerekçe reddediliyor.
- #30: "Approved for cross-location coverage" gerekçesiyle onay veritabanında reddediliyor: "Employee needs an active location and job assignment" (`assignment_missing`, **sert**).

**Eski davranış (ilk yeniden kuruluş `90f0fad`, 18 Ağustos; `20260821100000_schedule_requests.sql`, `20260822100000_employee_hub.sql` satır 269):** Talep ekranının çakışma listesi (`get_shift_change_conflicts_service`) şöyleydi:
- lokasyon ataması eksik → **yumuşak**, gerekçeyle onaylanır;
- **job'a hiç bakılmıyor**;
- **müsaitliğe bakılmıyor**;
- çakışan vardiya yalnız aynı takvim gününde duvar saatiyle kontrol ediliyor (gece yarısını geçen ya da farklı saat dilimindeki vardiyada yanılabilir);
- onay yazışındaki bekçi yalnız müsaitlik ve izne bakıyordu.

Senaryolar:
1. Sam (Garden Room, Line Cook) → Main Dining Server vardiyası: gerekçeyle onaylanır.
2. Alex (Main Dining, Server) → aynı vardiya: temiz onay.
3. Alıcının aynı saatte başka vardiyası var: sert engel.

**Ne değişti:** 15 Eylül BL-064. Onay yazışındaki bekçi artık ortak değerlendiriciyi kullanıyor ve değerlendiriciye `assignment_missing` (sert) eklendi. Gerekçe BL-064 planı §5: "Employee için gerekli location/job assignment eksikliği" değiştirilemez sistem bloğu. Talep ekranının çakışma listesi güncellenmedi. BL-093'ün tarif ettiği çelişki bu.

**Yeni davranış:**
- (1) Ekran "Review" gösterip not istiyor; onay veritabanında reddediliyor. Yönetici bir hata metni görüyor, ekranın söylediği yanlış.
- (2) ve (3) değişmedi.
- Ek bulgu: bu fixture'ı ürün üretemez.
  - "direct_coverage" türünü hiçbir fonksiyon yaratmıyor, yalnız okunuyor.
  - Eski akışta "pickup" gönderimi lokasyon ataması yoksa zaten reddediyor (`submit_employee_shift_request_exchange_legacy`).
  - Yani bugün yumuşak lokasyon çakışması ancak talep gönderildikten **sonra** atama sona ererse görülebilir.

**Hedefe göre doğrulama:**
- Hedef: lokasyon, job ve availability sağlanmazsa kişi eligible değil. **Yeni (sert) davranış doğru yönde.** Eski yumuşak davranış ve job'a bakmaması hedefle çelişiyor. Ekranın hâlâ "Review" göstermesi de çelişiyor.
- BL-093'ün sorusunun cevabı: hedefe göre atanmadığı lokasyona kimse konamaz, ekran da sert göstermeli.
- **Daha büyük sorun:** bu sekmenin gösterdiği sistem "eski akış". Asıl sistem Shift Hub ve ikisi bir bayrakla ayrılıyor (Alan geneli, B2). Eski akışta ayrıca:
  - job ve müsaitlik kontrolü yok;
  - **kişi kendi talebini onaylayabiliyor** (`resolve_schedule_shift_change_request_exchange_legacy` içinde kontrol yok; kod okuması);
  - iki lokasyonlu swap'ta ayrı ayrı onay yok, tek bir yöneticinin iki lokasyona da yetkili olması gerekiyor.
- Aynı dosyanın **izin (Time off) kısmı yeşil**. Kendi iznini onaylayamama, kısmi onay, yeniden açınca bırakılan vardiyanın sessizce geri gelmemesi hedefle uyumlu. #10–11 ("pending count honors location scope", "queue excludes inaccessible location") iki lokasyonlu çalışanda KAPSAM MODELİ SORUSU (K4).

**Kanıt:**
- *Koşuldu:* dosya (yukarıdaki hata, satır 77); fixture sorgusu (Sam: Garden Room / Line Cook; vardiya 22..05: Main Dining / Server / boş).
- *Kod okundu:* canlı `get_shift_change_conflicts_service`, `resolve_schedule_shift_change_request_service` (bayrak açıksa "needs migration or review in Shift Hub" diye reddeder), `…_exchange_legacy`, `submit_employee_shift_request_exchange_legacy`.
- *Aranan:* `direct_coverage` yazan fonksiyon yok. Yerel veritabanında 0 eski talep, 0 Shift Hub talebi (ölçüm 23 Eylül 05:5x UTC).

**Önerilen karar:** **Ürün kararı gerekli** (Alan geneli S1).
- Önerim: eski shift-change akışı sökülsün.
  - Requests → Shift changes sekmesi Shift Hub yönetici görünümüne yeniden bağlansın; 14 Eylül'de sökülmüştü, bkz. B2.
  - Bu dosyadan eski akışın 6 kontrolü (#28–33) silinsin, izin kısmı (#1–27) kalsın.
  - Etiket: (leave: high / do: moderate)
  - Gerekçe: canlı veri yok, 0 eski kayıt var, eski akış hedefin üç kuralını karşılamıyor (job, availability, kendi talebini onaylama), ve hiçbir ekrandan yaratılamıyor.
- Eski akış kalacaksa: **İkisi.**
  - Repo: lokasyon **ve job** eksikliği sert olsun, ekran "Blocked" göstersin; kendi talebini onaylama yasaklansın.
  - Test: fixture ürünün üretebileceği biçimde kurulsun (pickup gönderilir, sonra atama biter), beklenti "onay reddedilir" olsun.
  - Etiket: (leave: medium / do: safe)

**Önceki karar ile karşılaştırma:** BL-093 soruyu doğru soruyor. Hedef cevabı veriyor: sert. Ama BL-093 eski akışın varlığını sorgulamıyor. Asıl karar o ve BL-093'ün önünde.

**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:**
- #28 "missing location assignment is a soft conflict" hedefle çelişiyor.
- #29 "soft conflict requires manager reason" çelişen bir öncüle dayanıyor.
- #10–11 izin kuyruğunun lokasyon kapsamı iki lokasyonlu çalışanda belirsiz (K4).

**Kullanıcıya sorular:** Alan geneli S1, S6.

---

## Alan geneli bulgular

### B1. Ortak kök neden (BL-092 kesinleşti): "bırakılan vardiya" dışlanmıyor

15 Eylül BL-064'ten (`7a35dbc`) beri ortak değerlendirici, işlemde elden çıkan vardiyalardan yalnız **birini** dışarıda bırakabiliyor. Etkilenen yerler:

| Yer | Ne yapıyor | Sonuç (ölçüm) |
|---|---|---|
| `weekly_assignment_candidate_base` (Line Up aday/teklif + Shift Hub uygunluğu) | Kendi "hariç tutulanlar" listesini değerlendiriciye geçirmiyor | **Shift Hub:** Ali Kadıköy Cuma 18–22 ↔ Ayşe Beşiktaş Cuma 18–22 swap'ı "You are not eligible for the teammate shift" ile reddedildi, aday listesinde de görünmedi (exp1-E1). Bitişik vardiyada yol süresi bırakılan vardiyaya göre hesaplandı: "There is not enough travel time between locations" (exp1-E3). Line Up: travel #22, BL-092 testleri |
| `record_weekly_exchange_acceptance` (Shift Hub onay anı) | Swap'ta karşı vardiyayı dışlamıyor | Dışlama yamasıyla bile onay "Resolve shift hours or approved time off before transfer" ile reddedildi; mesaj yanıltıcı (exp4-P1) |
| Swap yazımı (Shift Hub onayı ve Line Up swap) | İki atamayı sırayla yazıyor; arada kişi iki vardiyada | Atama bekçisi reddediyor (patch.sql + travel testi) |
| Atama bekçisi | Satırın kendi eski halini dışlamıyor | Yalnız testte tetikleniyor (weekly_exchange_changed_terms) |

Cover, open pickup ve release pickup etkilenmiyor, çünkü alıcı bir vardiya bırakmıyor. Line Up ile ortak nokta aynı `weekly_assignment_candidate_base`. Bir düzeltme ikisini birden açar. weekly_assignment_candidates #19 da aynı aileden (başka ajanın alanı).

### B2. Takas, cover ve release bugün hiçbir ekrandan yapılamıyor

- **Bayrak kapalı ve açılacak bir ekran yok.** Shift Hub yazımları `workspaces.shift_exchanges_enabled` bayrağına bağlı. Varsayılanı `false`; bütün yerel workspace'lerde de `false` (ölçüldü). Bayrağı değiştiren hiçbir API ya da ekran yok, yalnız testler açıyor.
  - Bayrak kapalıyken Employee Hub → Shift Hub'daki bütün düğmeler pasif: `canWrite = model.enabled && …`, `ShiftExchangeHub.tsx:415`.
  - Komut reddediliyor: "Shift changes are temporarily read-only".
- **Eski akışa ekrandan girilemiyor.** `submitEmployeeShiftRequest` tanımlı, ama hiçbir bileşen onu çağırmıyor. API yolu `/employee-hub/shift-requests` duruyor.
- **Yöneticinin Shift Hub onay ekranı söküldü.** 14 Eylül'de `fc2c4da` ("feat: checkpoint roles and account progress", yazılı gerekçe yok) Requests → Shift changes sekmesindeki Shift Hub yönetici görünümünü sildi ve sekmeyi eski tabloya çevirdi.
  - `ShiftExchangeHub` bugün hiçbir yerde `manager` modunda açılmıyor.
  - Yöneticiye giden bildirimler `/app/schedule/requests`'e götürüyor; orada Shift Hub talepleri yok.
- Shift Hub planı bayrağı pilot ve gerçek veri taşıma için "kill switch" olarak koymuştu (`shift-hub-implementation-plan` satır 302, 398). Canlı veri olmadığı için bu gerekçe artık geçerli değil.

### B3. Owner, admin ve manager kendi çalışan kaydıyla işlem yapamıyor (arayüz engeli)

- **Veritabanı izin veriyor.** Kemal (manager) kendi vardiyası için cover açtı. Olga (owner) boş bir vardiyaya başvurdu (exp2 E6, E8).
- **Kendi talebini onaylama yasağı çalışıyor.** "A separate manager must approve your own exchange" (E6, E8). Owner, Kemal'in talebini onayladı (E6).
- **Arayüz izin vermiyor.** Employee Hub'ın tamamı yalnız "employee" rolüne açık:
  - `App.tsx:435–441` (`roles={["employee"]}`);
  - `AppShell.tsx:148–154` (Shift Hub menüsü);
  - izin talebi formu da Employee Hub'da.
- Sonuç: owner, admin ve manager ekrandan ne takas yapabiliyor ne izin isteyebiliyor. Hedef: "vardiyaya konabilmeleri ve vardiya takas edebilmeleri gerekir".

### B4. Uygunluk: bugünkü kod ve hedef

| Kriter | Hedef | Shift Hub (bugün) | Eski akış (Requests → Shift changes) |
|---|---|---|---|
| Lokasyon ataması | Şart | Şart; vardiyanın tamamını kapsamalı ✓ | Pickup gönderiminde şart; onayda **yumuşak** ✗ (yazış artık reddediyor) |
| Job ataması | Şart | Şart ✓ | **Bakılmıyor** ✗ |
| Çalışanın kendi müsaitliği | Şart; tek istisna **release pickup**'ta kendi override'ı | Swap, doğrudan cover, havuz cover ve open pickup'ın **hepsinde** "yine de kabul et" diyebiliyor ✗ (exp3-A3; spec 2026-09-08 §6 böyle karar vermiş). Havuz/pickup'ta istisna ✓ | Bakılmıyor ✗ |
| Yöneticinin hatırlatma kaydı (`manager_weekly_reminders`: yöneticinin çalışan için tuttuğu özel "şu saatlerde koyma" notu) | Belirsiz (S5) | Engel ya da uyarı yok. Kemal'in hatırlatma kaydıyla her gün müsait değil görünen kaydı, boş vardiyaya onaysız başvurabildi (exp3-A4). Onayda "çalışan gönüllü kabul etti" kaydı yazılıyor | Bakılmıyor |
| Settings → Conflict handling → Employee availability = **Block** | Belirsiz (S4) | Her türde uygun değil; pickup istisnası da kapanıyor. Gerekçe metni yanlış: "Position and location match, No assignment blockers" (exp3-A5) | — |
| Onaylı izin | Sert | Sert ✓ (ayar "Require confirmation" olsa bile) | Sert ✓ |
| Çakışan vardiya | Sert | Sert ✓, ama swap'ta bırakılan vardiya da sayılıyor ✗ (B1) | Aynı gün, duvar saati; bırakılanlar doğru dışlanıyor |
| Yol süresi / dinlenme | Hedef "hepsi sağlanmalı" | Ayar "Warn" olsa bile uygun değil; swap'ta bırakılan vardiya sayılıyor ✗ | Bakılmıyor ✗ |
| Saati belirsiz vardiya | "saat doğrulanmalı" | Reddediliyor ✓ | — |
| Belge, kapalı lokasyon, aktif olmayan çalışan | — | Kontrol ediliyor ✓ | Kontrol edilmiyor |

### B5. Onay: kim veriyor?

| Durum | Hedef | Shift Hub (ölçüm) | Eski akış (kod okuması) |
|---|---|---|---|
| Tek lokasyonlu cover/pickup | Vardiya lokasyonunun yöneticisi ya da admin/owner | "Manage shift change requests" izni ve vardiyanın lokasyonuna yetkisi olan kişi ✓ | Aynı |
| Swap Kadıköy ↔ Beşiktaş | İki lokasyonun yetkilisi | Lokasyon başına oy: Kemal onayladı → "open, Awaiting other manager"; owner tek seferde bitirdi (E7) ✓ | Tek bir yöneticinin iki lokasyona da yetkili olması gerekiyor |
| Kadıköy vardiyası iki lokasyonlu Ayşe'ye (cover) | İki yetkili (?) | **Yalnız Kadıköy.** Kemal tek başına onayladı. Berk talebi göremiyor bile: "Manager scope required" (E4). → K1 | Aynı |
| Kendi talebini onaylama | Yasak | Yasak ✓ | **Yasak değil** ✗ |
| Yönetici owner'ın talebini onaylar | ? | Kod izin veriyor (kod okuması) → K6 | — |
| Owner'dan başka yetkili yoksa | ? | Owner'ın kendi talebi hiç onaylanamaz → K6 | — |

### B6. Time off (Requests → Time off)

Ölçüm exp6. Ayşe iki lokasyona atanmış, izin talebinde "Kadıköy"ü seçiyor.

- Çalışan talepte **tek lokasyon** seçer (atandığı lokasyonlardan biri). Talep yalnız o lokasyonun yöneticisinin kuyruğuna düşer: Kemal'in kuyruğunda 1, Berk'in kuyruğunda 0.
- Kendi iznini onaylama yasak ✓: "Own time-off decision access denied".
- Onaylanan izin **iki lokasyonda da** sert engel ✓: Beşiktaş'ta aynı akşam atama "blocked / approved_time_off".
- Ayşe'nin o gün Beşiktaş'ta **yayınlanmış** vardiyası varsa Kemal onaylayamaz: "a manager with publishing access to every affected location must decide". Owner onaylar; Berk talebi hiç görmez. Yayınlanmış vardiyası yoksa Kemal tek başına onaylar ve Berk'in haberi olmaz. → K4
- **Hedefle çelişki:** Settings → Conflict handling → "Approved time off" için "Require confirmation" seçilebiliyor (`ConflictHandlingSettingsPage.tsx`, satır 30–35). Seçilince onaylı iznin üzerine yöneticinin onayıyla vardiya yazılabiliyor: "warning_requires_override" (exp6-T6). Hedef: "onaylanmış izin yumuşatılamaz". (leave: medium / do: safe)

### KAPSAM MODELİ SORULARI (alan G'ye girdi)

- **K1.** Ayşe hem Kadıköy'e hem Beşiktaş'a atanmış. Ali'nin Kadıköy Cumartesi akşam vardiyasını devralıyor. Bugün yalnız Kemal görüyor ve onaylıyor; Berk görmüyor. Hedefteki "Kadıköy vardiyası Beşiktaş çalışanına → iki onay" kuralı burada mı geçerli?
  - Ayşe'nin "Beşiktaş çalışanı" olduğu neye göre belirlenir? Lokasyon atamalarında birincil lokasyon işareti (`is_primary`) var ama hiçbir kural kullanmıyor.
  - Not: Ayşe Kadıköy'e atanmamış olsaydı zaten uygun olmazdı. Yani "başka lokasyonun çalışanı" ancak iki lokasyona atanmış biri olabilir.
- **K2.** Kadıköy ↔ Beşiktaş swap'ında iki yöneticinin oyu ya da owner/admin'in tek oyu. Bugünkü davranış istenen mi?
- **K3.** Onay beklerken vardiya Kadıköy'den Beşiktaş'a taşınırsa talep Berk'e geçer, Kemal'in görünümünden düşer. Kemal görmeli mi?
- **K4.** Ayşe izin talebinde Kadıköy'ü seçerse Berk hiçbir koşulda görmüyor, ama sonrasında Beşiktaş'a o güne vardiya yazamıyor. İzni kim görmeli, kim onaylamalı? Talep lokasyon seçmeli mi, yoksa çalışanın bütün lokasyonlarına mı düşmeli?
- **K5.** Kemal'in kendi vardiyası ya da kendi izni. Başka bir Kadıköy yöneticisi ya da admin/owner onaylar ✓. Kadıköy'ün tek yöneticisi Kemal ise onay admin/owner'a kalır. Doğru mu?
- **K6.** Owner'ın kendi takası ya da izni: Kadıköy yöneticisi Kemal onaylayabiliyor, yani hiyerarşide aşağıdan yukarıya onay var. İstenir mi? Owner'dan başka yetkilisi olmayan bir workspace'te owner'ın talebi sonsuza dek bekler.
- **K7.** Kemal'in Ayşe için tuttuğu hatırlatma kaydı ("Pazartesi sabah koyma"). Ayşe pickup yaparken hiçbir uyarı görmüyor, onayda sistem Ayşe adına "gönüllü kabul" yazıyor. Bu kayıt takas uygunluğunu etkilemeli mi?

### Fikir ve tavsiyeler

- **B1'i tek yerde düzelt.** Ortak değerlendirici "bu işlemde bırakılan vardiyalar" listesini alsın; aday kontrolü, onay anı kaydı ve bekçi aynı listeyi geçirsin. Swap yazımı iki atamayı önce boşaltıp sonra yazsın ya da tek bir yazışta değiştirsin. Bu, Shift Hub swap'larını ve Line Up'ı birlikte açar; Shift Hub planının 7 Eylül'deki yazılı sözleşmesine dönüştür.
- **BL-092 kaydı düzeltilmeli.** Kök BL-064 (15 Eylül), 22 Eylül değil. `weekly_exchange_changed_terms` bu aileden çıkarılmalı (test sorunu).
- **BL-064'ün DB testsiz birleşmesi** bu ailenin kaynağı. `test:db` CI kapısı olmadığı sürece aynı tür kırılma tekrar eder (BL-070 zaten not ediyor).
- **Onay önizlemesi** alıcının müsaitlik çakışmasını yöneticiye göstermiyor; çalışan kabul etmiş olsa bile görünmeli. `weekly_exchange_candidate_check` uygun durumda gerekçeleri silip "No assignment blockers" yazıyor.

## Kullanıcıya sorular (alan geneli, önem sırasıyla)

1. **S1. Hangi takas sistemi ürün?** Yeni Shift Hub mı, eski Requests → Shift changes akışı mı?
   - Neden: B2. Bugün ikisi de ekrandan kullanılamıyor.
   - Seçenekler:
     - (a) **Shift Hub esas, önerim.** Eski akış ve bayrak sökülür, Requests → Shift changes Shift Hub yönetici görünümüne yeniden bağlanır.
     - (b) Eski akış esas: Shift Hub sökülür.
     - (c) İkisi bayrakla kalır.
   - Öneri gerekçesi: canlı veri yok (0 eski kayıt); eski akış hedefin üç kuralını karşılamıyor (job, müsaitlik, kendi talebini onaylama); Shift Hub hedefe çok daha yakın (iki lokasyon oyu, kendi onayı yasak, tam uygunluk kontrolü).
2. **S2. Müsaitlik istisnası hangi işlemlerde geçerli?**
   - Hedef "yalnız release pickup" diyor; kod (8 Eylül spec'ine göre) swap'ta ve doğrudan cover'da da çalışanın "yine de" demesine izin veriyor.
   - Seçenekler:
     - (a) Yalnız havuz cover ve open pickup, önerim; hedefle birebir.
     - (b) Bugünkü gibi hepsinde.
3. **S3. Talep onay beklerken vardiyanın tarihi, saati ya da lokasyonu değişirse çalışanın kabulü korunsun mu?**
   - 8 Eylül kararı: korunur. 7 Eylül planı: geçersiz olur.
   - Bugün korunuyor ve yeni koşulda doğan müsaitlik çakışması için sistem çalışan adına "gönüllü kabul" yazıyor (exp5).
   - Seçenekler:
     - (a) Kabul düşer, çalışan yeniden kabul eder. Önerim, hedefle en uyumlusu.
     - (b) Kabul korunur ama yeni koşulda çakışma doğarsa çalışana yeniden sorulur.
     - (c) Bugünkü gibi.
4. **S4. Settings'te Employee availability "Block" iken release pickup istisnası da kapanmalı mı?**
   - Bugün kapanıyor.
   - Öneri: evet kapansın, çünkü "Block" admin'in bilinçli sert seçimi. Ama hedef metni istisnayı koşulsuz yazıyor, onayınız gerek.
5. **S5. Yöneticinin hatırlatma kaydı takas uygunluğunu etkilemeli mi?** (K7)
   - Bugün hiç etkilemiyor.
   - Seçenekler:
     - (a) Etkilemesin; kayıt yöneticinin kendi notu, onay önizlemesinde yöneticiye gösterilsin. Önerim.
     - (b) Sert engel olsun.
6. **S6. Settings'teki "Approved time off → Require confirmation" seçeneği kaldırılsın mı?**
   - Hedef "onaylı izin yumuşatılamaz" diyor.
   - Öneri: kaldırılsın, izin her zaman Block olsun.
7. **S7. Yol süresi ve dinlenme ayarı "Warn" iken takasta da sert mi kalsın?**
   - Bugün takasta her zaman sert, Schedule'da ise ayara göre davranıyor.
   - Öneri: takasta sert kalsın ("kriterlerin hepsi sağlanmalı"). Bir onayla bu davranış yazılı kural olur.
8. **S8. Owner, admin ve manager kendi vardiyası ve izni için hangi ekranı kullanacak?**
   - Seçenekler:
     - (a) Employee Hub'ın "Schedule / Shift Hub / Time off" kısmı onlara da açılır.
     - (b) Admin arayüzüne "Benim vardiyalarım" eklenir.
   - Ürün kararı.
9. **K1–K7** kapsam modeli ajanına (alan G) gidiyor. En önemlileri K1 (iki lokasyonlu çalışanın cover onayı), K4 (iki lokasyonlu çalışanın izni) ve K6 (yöneticinin owner'ın talebini onaylaması; tek yetkilili workspace).
