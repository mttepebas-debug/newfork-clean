# Line Up uygulama ve doğrulama raporu — 2026-09-06

## Durum

Line Up’ın yerel implementasyonu ve teknik doğrulaması tamamlandı. Yönetici panosu, çalışan paylaşımı, operasyon komutları, migration ve odaklı testler uygulanmıştır. Ayrı gerçek yerel Supabase manager/employee oturumlarıyla paylaşım, okundu takibi ve iki lokasyonlu takas uçtan uca doğrulandı. Bu rapor **hosted yayın veya gerçek işletmedeki A–F/P0 kullanıcı kabulünün tamamlandığı iddiası değildir**; işletme pilotu ve görev süresi ölçümleri aşağıda ayrı kabul işleri olarak belirtilmiştir.

Yerel inceleme: http://127.0.0.1:5555/app/schedule/lineup?date=2026-08-31

Kaynak sözleşme: [Line Up yeniden tasarım planı](lineup-redesign-spec-and-implementation-plan-2026-09-06.md).

## Uygulanan davranışlar

- Sage/yeşil renkler, beyaz kartlar, belirgin tipografi, section panosu ve personel listesi; tek lokasyon varsayılanı, tarih ve servis seçimi, gerçek kişi/açık/atanmamış/onay sayaçları, pozisyon ve arama filtreleri.
- Aynı lokasyonda tam veya kısmi section/station yerleşimi; örneğin 18:00–22:00 için farklı section, önceki/sonraki aralıkları koruma, geçmişi değiştirmeme ve geri alma. Schedule vardiya süresi bu işlemde değiştirilmez.
- Toplu yerleştirme: kişi bazında coverage etkisi/çakışma önizlemesi, tümünün atomik kaydı ve doğrulanmış geri alma. Dolu section kapatılırken taşıma seçeneğine bağlantı verilir.
- Section/station düzenleme, atanmamış havuz, call-off ve geri alma, boş extra line, uygun aday seçimi, kısmi kapsama. Section tanımları sıralanabilir; günlük/servis bazlı açık-kapalı durumu, sorumlu çalışan ve masa/station açıklaması vardır.
- Aday paneli eligible, partial, movable, verification_required ve ineligible gruplarını gösterir. Movable adayın gerçek kaynak vardiyası ve oluşturacağı açık önizlenir; gerekli yetkisi olmayan kullanıcı kaynak ayrıntısını alamaz.
- Çalışan, kendisine ait önceki/son paylaşılan görev farkını ve aynı section/servisteki ekip arkadaşlarını donmuş snapshot üzerinden görür. Özel notlar ve kişi dizini bilgileri bu ekip görünümüne eklenmez.
- Replacement, lokasyonlar arası move ve çift yönlü swap gerçek Schedule kayıtlarıyla aynı işlemde kesinleşir. Farklı yerel günler ve yayın haftaları desteklenir; eksik sonraki hafta yayını önizlemede engellenir. Kaynak açık ihtiyaç ve değişmeyen aralıklar korunur. Move hedefteki mevcut açık ihtiyacı doldurabilir. Extra line doldurulduğunda aynı ihtiyacın kimliği korunur.
- Pozisyon/lokasyon yetkinliği, aktif profil, başlangıç tarihi, planlama dışı olma, availability, onaylı izin, komşu gün çakışmaları, belge süresi ve geçiş zamanı sunucuda kontrol edilir. Eksik availability uygun kabul edilmez. Kısmi uygunluk tam uygunluk gibi gösterilmez.
- Önizleme özeti, neden, güncel veri parmak izi, idempotency, işlem kilitleri ve denetim geçmişi. İkinci geçersiz kesinleştirme ve tek taraflı swap engellenir.
- Bir ihtiyaç için birden çok kabul geldiğinde ilk kesinleşen teklif ihtiyacı doldurur; diğerleri açıklamalı kapanır ve çalışan bilgilendirilir. Hedef lokasyon yetkisi olmayan yönetici talep açar. Hedef yönetici mevcut açık ihtiyacı veya swap karşılığını seçip iki yönü yeniden doğrulayarak kesinleştirir. Çalışana özel replacement teklifi, kabul/ret ve ayrı yönetici kesinleştirmesi bulunur.
- Lokasyon/gün/servis/section kapsamlı notlar, yöneticiye özel not, sabitleme ve süre sonu. Paylaşılmış notlarda geçerlilik saati korunur; çalışan ekranı süresi dolmuş talimatı açıkça işaretler.
- Sürümlü, değiştirilmeyen paylaşım; servis bazlı paylaşımda diğer servislerin son paylaşılan içeriğinin korunması; taslak ve paylaşılmış sürüm ayrımı. PNG/PDF/metin export aynı donmuş modelden üretilir. Son paylaşım sonradan yeniden export edilebilir.
- Employee Hub kendi görevini, ilgili günlük brief ve notlarını tüketir. Görüntülendi ve açıkça Okudum farklı kayıtlardır. İlgili içerik değişirse yeniden onay gerekir; eski onay geçmişte kalır.
- Mevcut uygulama içi bildirim sistemine outbox üzerinden teslim; başarısız teslim paylaşımı geri almaz. Tekrar deneme ve aktif hesabı olmayan alıcı bilgisi yöneticide görünür. E-posta/SMS teslimi uygulanmış sayılmaz.
- Yeni Schedule yayını kararlı source kimliğiyle eşlenir; değişen görev inceleme gerektirir. Kaynağı kaybolan kayıt görünür uyarı verir. Yayından kaldırılmış Schedule için çalışan son paylaşımı tarihsel plan olarak görür.
- `locations.lineup_operations_enabled` ile lokasyon bazlı açılış/salt okunur geri dönüş. API eski yerleşim/brief/section işlemlerini de kontrol eder; staffing kesinleştirmesi kaynak ve hedef anahtarını yeniden değerlendirir. Okuma ve paylaşım geçmişi korunur.

## Doğrulama kanıtları

| Kontrol                                                                          | Sonuç                                                                                                                                                                 |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase test db supabase/tests/lineup_operations_v1.test.sql --local`          | **225 geçti**; fixture ve değişiklikler transaction sonunda rollback                                                                                                  |
| Web: LineupPage, lineup-share, EmployeeHubPage, EmployeeLineup, LineupPlacements, LineupSections, lineup-time, useLineupAutosave | **60 geçti**                                                                                                                                                          |
| API: schedule-lineup-operations-routes, schedule-lineup-rollout, HTTP matrix ve app Line Up                  | **57 geçti**                                                                                                                                                          |
| Web / API TypeScript                                                             | İkisi de geçti                                                                                                                                                        |
| Migration tam DDL tekrarı                                                        | Önceki isimler/şema transaction içinde kurulup dosya baştan çalıştırıldı; başarıdan sonra rollback                                                                    |
| Yerel migration kaydı                                                            | `20260909000000` applied olarak kaydedildi                                                                                                                            |
| Public-schema DB lint                                                            | Line Up fonksiyonlarında bulgu yok. Line Up dışında save_employee_service, resolve_workspace_context_service ve paralel eklenen employee_personal_tasks_service uyarıları var. Son kontrol exit 0 ile tamamlandı. |
| Yerel tarayıcı                                                                   | Owner oturumu, masaüstü ve 390×844 mobil görünüm; section/station kaydet ve Undo, extra line oluştur ve iptal, share v1, paylaşılan sürümü yeniden aç, PNG/PDF export |
| Klavye/modal                                                                     | Native dialog, Escape, odak geri dönüşü; kaldırılan satırda başlığa odak yedeği                                                                                       |

Toplam **291 odaklı test** (223 DB + 56 web + 12 API). Bunlar tüm monorepo regresyon paketi veya canlı ortam kanıtı değildir. Ayrıca `supabase/verification/lineup_concurrency_local.py` iki farklı yönetici ve iki bağımsız DB bağlantısıyla eşzamanlı çakışmayı doğruladı: ikinci işlem kilitte bekledi; tek atama/olay commit oldu, eski önizlemeli ikinci işlem reddedildi. Bu bir yüksek hacimli yük testi değildir. Teste ait workspace ve hesap temizlendi.

Görsel tasarım masaüstü ve mobil tarayıcıda incelendi. Belgede birebir karşılaştırılacak piksel referansı bulunmadığından pixel-diff eşitliği iddia edilmiyor. Koyu tema pano ve section paneli masaüstü/390 px mobilde incelendi; panel input/ikon kontrastı düzeltildi. Bu yerel görsel kontrol gerçek çalışan rolüyle UAT değildir.

## AT-01–AT-36 kanıt haritası

“Doğrulandı” ilgili odaklı otomatik/yerel kontrolü belirtir; işletme pilot onayı anlamına gelmez. “Kısmi” uygulama mevcutken senaryonun bütün varyasyonlarının kanıtlanmadığını belirtir.

| Senaryo                               | Durum / kanıt                                                                                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AT-01 yayınlanmış vardiyalar          | Yerel tarayıcı, LineupPage ve DB canonical assignment kontrolü                                                                                                                                |
| AT-02 yeniden yayında saat değişimi   | DB stable-source rebind, source_changed ve paylaşım engeli doğrulandı                                                                                                                         |
| AT-03 section'dan çıkarma             | Yerleşim kaydet/Undo tarayıcıda; Schedule silinmiyor                                                                                                                                          |
| AT-04 overlay olmayan satır           | LineupPage testi ile yerleşim kaydı doğrulandı                                                                                                                                                |
| AT-05 pozisyon uygunluğu              | DB yanlış pozisyon ve swap engeli doğrulandı                                                                                                                                                  |
| AT-06 onaylı izin                     | DB uygun aday dışlama doğrulandı                                                                                                                                                              |
| AT-07 kısmi uygunluk                  | DB partial etiketi ve boşta kalan iki extra-line aralığı doğrulandı                                                                                                                           |
| AT-08 section değişiminde açık etkisi | Kısmi section aralığı, source coverage kaybı önizlemesi, kalan aralıklar ve Schedule saatlerinin değişmemesi DB ve gerçek masaüstü/mobil tarayıcıda doğrulandı.                               |
| AT-09 iki yönetici yarışı             | İki farklı yönetici ve bağımsız bağlantı: gerçek kilit beklemesi, tek commit ve eski önizlemeli ikinci işlemin reddi doğrulandı.                                                              |
| AT-10 bir ihtiyaca birden fazla kabul | İki çalışan aynı ihtiyaç için ayrı teklifleri kabul etti; tek kesin atama, diğer teklifin açıklamalı kapanışı, ikinci kesinleştirmenin reddi ve tek kapanış bildirimi DB testinde doğrulandı. |
| AT-11 gece/timezone                   | DB gece yarısı, availability timezone ve DST; Los Angeles / New York farklı yerel günlerinde move/swap ve farklı yayın haftalarına düşen parçalar doğrulandı.                                 |
| AT-12 eski share önizlemesi           | Not değişiminden sonra eski fingerprint ile paylaşım reddi doğrulandı                                                                                                                         |
| AT-13 özel not gizliliği              | DB paylaşım/export verisinde özel not yok; doğrudan tablo/RPC erişimi reddediliyor                                                                                                            |
| AT-14 değişiklik sonrası onay         | İlgili not yeni receipt'te onayı sıfırlıyor, önceki onay korunuyor                                                                                                                            |
| AT-15 bildirim retry                  | Outbox ayrı teslim ve tekrar teslimde 0 yeni bildirim doğrulandı; dış teslim arızası pilotu yok                                                                                               |
| AT-16 yetki kaldırma                  | DB'de yetki kaldırıldıktan sonra günlük okuma, state, aday, not, entry, section, brief, toplu yerleşim, paylaşım önizleme/kayıt/export, proposal ve retry erişim retleri doğrulandı. 41 HTTP uç varyasyonunda aktif üyelik, rol, izin, oturum, açık workspace ve servis lokasyon reddi doğrulandı; gerçek DB lokasyon üyeliği kanıtı ayrıca DB testlerindedir.                                                                              |
| AT-17 mobil/klavye/pointer            | Masaüstü ve 390 px mobil, buton/combobox/dialog akışları; drag zorunluluğu yok                                                                                                                |
| AT-18 aynı export/Hub sürümü          | Çalışan interval girişleriyle immutable export girişlerinin eşitliği DB testinde; gerçek PNG/PDF önceki yerel kontrolde doğrulandı. Ayrı yerel çalışan hesabı mobilde aynı görev/sürümü gördü; gerçek işletme kullanıcı pilotu ayrıdır.                 |
| AT-19 cross-location move             | Canonical hedef ve gerçek kaynak açık ihtiyaç DB'de doğrulandı                                                                                                                                |
| AT-20 atomik swap                     | İki yön, açık geçiş aralıkları ve değişmeyen parçalar doğrulandı                                                                                                                              |
| AT-21 bir yönde engel                 | Yanlış pozisyon swap'ı engelliyor; başarısız işlem kaynak kişiyi değiştirmiyor                                                                                                                |
| AT-22 geçiş süresi                    | 30 dk gerekirken 15 dk boşluk reddedildi                                                                                                                                                      |
| AT-23 iki yönetici onayı              | Kaynak tek yetkili talep, hedef ayrı yönetici onayı; beklerken kaynak değişmiyor                                                                                                              |
| AT-24 talep sırasında kaynak değişimi | Kaynağı değişmiş talebin kesinleştirilmesi reddedildi                                                                                                                                         |
| AT-25 kısmi move/swap                 | Kısmi swap/move, aynı ihtiyaç kimliği, farklı gün/haftalar doğrulandı. Segmentli move sırasında kalan çalışma ve üç açık aralık gerçek section bilgisini koruyor. Gece yarısından sonra extra line doldurma doğru güne bağlanıyor. İki yönlü segmentli swap'ta karşı tarafın gerçek section geçişleri ve kalan aralıkları DB'de doğrulandı; gerçek rol görsel pilotu açık.                                         |
| AT-26 boş extra line                  | DB kimlikli açık ihtiyaç, tarayıcıda açık sayaç artışı/iptali                                                                                                                                 |
| AT-27 extra line doldurma             | Aynı slot kimliği, tek overlay ve kalan açık aralıklar doğrulandı                                                                                                                             |
| AT-28 yeni çalışma süresi             | Canonical Schedule kaydı ve extra line aynı DB işlemi; Schedule/Hub sorguları yenileniyor                                                                                                     |
| AT-29 kapsamlı yeniden onay           | Aynı lokasyonda iki servis/iki çalışan testi: yalnızca ilgili servisin onayı sıfırlanıyor; ilgisiz servis onayı korunuyor ve diğer servisin notu çalışan API cevabına girmiyor.               |
| AT-30 view vs acknowledge             | DB ve EmployeeLineup testi; ekranı açmak otomatik onay değil                                                                                                                                  |
| AT-31 görevden çıkarılan alıcı        | Görevden çıkarılan çalışan için yeni snapshot outbox kaydı oluştuğu ve kişisel görünümde eski görevin kalmadığı DB testinde doğrulandı.                                                       |
| AT-32 kişi/segment sayımı             | Aynı kişi üç section aralığında gösterildi; masaüstü ve 390 px mobilde toplam kişi sayısı 2 kaldı. Saf projection/unique-person testi de geçti.                                               |
| AT-33 süreli not                      | Çalışan expired etiketi testi; aktif sorgu süreyi ve günü filtreler, export süreyi korur                                                                                                      |
| AT-34 yayından kaldırma               | DB source_current=false, çalışan tarihsel plan uyarısı ve onay engeli testi                                                                                                                   |
| AT-35 onaydan önce yetki kaybı        | DB kesinleştirme reddi ve değişmeyen kaynak doğrulandı                                                                                                                                        |
| AT-36 time entries                    | Tüm test operasyonlarından önce/sonra time_sessions, time_events, time_manual_entries ve time_amendments içerik hashleri eşit. Gerçek bordrolu işletme pilotu ayrı kabul kapısıdır.           |

## Geçiş, geri dönüş ve açık sınırlar

Migration: `supabase/migrations/20260909000000_lineup_operations_v1.sql`. Yalnızca yerel `supabase_db_newfork-clean` veritabanına uygulandı. Hosted migration/deploy yapılmadı. Deployment sırasında **önce migration, sonra API/web**, ardından seçilen lokasyonlarda kullanıcı pilotu gerekir.

Lokasyon kontrolü deployment yöneticisinin SQL erişiminden yapılabilir; önce doğru workspace/lokasyon kimliği doğrulanmalıdır:

```sql
select id, workspace_id, name, lineup_operations_enabled from public.locations;
-- Doğrulanmış lokasyon için false: salt okunur geri dönüş; true: yeniden açılış.
update public.locations
set lineup_operations_enabled = false
where workspace_id = '<workspace-uuid>' and id = '<location-uuid>';
```

Önceki snapshot'lar değiştirilmez. Legacy serbest station metni korunur. Belirsiz manuel çalışan satırları otomatik Schedule vardiyasına dönüştürülmez; kaynak incelemesi ve Schedule üzerinden uzlaştırma gerekir. Yeniden açılış için şemayı geri almaya gerek yoktur.

Açık sınırlar ve kabul işleri:

1. Segmentli move ve iki yönlü swap, geçiş açıkları, kısmi/overnight extra-line doldurma DB testleriyle doğrulandı. Bu genişletilmiş varyasyonların gerçek yönetici tarayıcısındaki uçtan uca pilotu açık.
2. AT-16 için DB ret kontrolleri ve 41 HTTP uç varyasyonu tamamlandı. HTTP matrisi gerçek route kayıtlarını mock context/service ile çalıştırır; DB üyeliğinin canlı HTTP oturumuyla birlikte uçtan uca denetimi ve tüm API paketinin regresyonu bu kanıtla eşit sayılmaz.
3. Ayrı gerçek yerel manager/employee hesapları ve iki sentetik lokasyonla teknik rol doğrulaması tamamlandı. Gerçek işletme pilotu için personel paylaşan iki lokasyon, kapsamlı yöneticiler ve çalışan katılımcılar seçilmelidir. Otomatik yerel rol testi, insan katılımcılarla kullanılabilirlik ve görev süresi ölçümü değildir.
4. Yoğun kadro (48 kişi / 56 görev), uzun isim/not/URL, 320/390/640 px ve %200 metin boyutu benzetimi tamamlandı. Bu gerçek tarayıcı zoom testi değildir. Gerçek kullanıcı görev süresi ölçümleri ve piksel karşılaştırması için referans görsel hâlâ yok.
5. §8 section kuralları, §9.2 kısmi yerleşim, §9.4 toplu yerleştirme, §15 günlük taslak otomatik kayıt ve §16 kişisel değişiklik/section ekibi uygulanmıştır. §9.3 görevlendirmeyi kaldırıp ihtiyacı açık bırakma ve Schedule iptal incelemesine filtreli geçiş, §12 extra-line kısa not, §11.4 ilgili yöneticilere bildirim ve §16 hedefli onay hatırlatması da tamamlandı. Uygulama maddelerinin son kontrolü sürüyor; gerçek rol pilotu ve açık doğrulamalar nedeniyle P0/A–F kabulü henüz tamamlandı sayılmıyor.

## Çalışma izi

- Çalışılan branch: `codex/phase-1-foundation`; başlangıçta worktree zaten çok kirliydi. Başka işlerin değişiklikleri geri alınmadı; commit/push yapılmadı.
- Başlangıç karşılaştırma kopyaları: `C:/Users/TheWe/AppData/Local/Temp/newfork-lineup-baseline-9idi05ag`.
- Mevcut 5555/5556 servisleri kullanıldı; yeni paralel dev stack açılmadı.
- Tarayıcı kontrolünün yerel izi: Aug 31 shared v1 ve iptal edilmiş/gizlenmiş “Line Up verification” extra line denetim kaydı. Bunlar gerçek üretim verisi değildir; başka kayıtlara toplu temizlik uygulanmadı.
- Mobil viewport override kaldırıldı. Ek skill/MCP veya subagent gerekmedi.

## Goal devamı — adaylar, atomiklik ve kısmi section yerleşimi

Bu devamda movable aday grubu, iki bağımsız bağlantıyla yarış testi, gerçek paylaşım zaman damgası, kısmi section aralıkları, toplu yerleşim/çatışma önizlemesi, dolu section'dan taşıma bağlantısı ve çalışanın kişisel değişiklik/section ekibi tamamlandı. Goal hâlâ aktiftir; yukarıdaki kapsam ve pilot işleri nedeniyle tamamlandı işaretlenmedi.

DB 149, web 31, API 10 odaklı test geçti. Web/API typecheck, tam migration DDL rollback tekrarı ve DB lint kontrolü yapıldı. Yeni Line Up fonksiyonlarında lint bulgusu kalmadı; diğer modüllerin önceden var olan iki uyarı grubu sürüyor.

Gerçek tarayıcı kontrolünde 2031-03-03 için iki geçici vardiya kullanıldı. 18:00–22:00 yerleşim kaydı, üç segment görünümü, karttan ilgili aralığı açma, 390 px mobil tekli kaydetme ve Undo doğrulandı. Bu kontrol doğrudan `locations` tablosunu okuyan API rollout guard'ındaki yetki hatasını ortaya çıkardı; guard RPC'ye taşındı ve yeniden deneme geçti. İlgili iki vardiya/overlay, publication, boş günlük Line Up ve altı test audit olayı yalnızca oluşturulan UUID'ler ve tarih/lokasyon kapsamıyla temizlendi; geçici JSON dosyası kaldırıldı. Viewport override sıfırlandı, sekme Aug 31 yerel inceleme ekranına döndü.

Bir sonraki uygulama adımı: §8 section pozisyon/lokasyon/servis sözleşmesi ve gece yarısı segment sunumu; ardından kalan rol/erişilebilirlik doğrulamaları. Ek MCP/skill veya subagent gerekmedi.

## Goal devamı — section kapsamı, yetki ve gece vardiyası doğrulaması

Section tanımlarına kalıcı lokasyon, servis ve pozisyon kuralları eklendi. Boş seçim tüm seçeneklere izin verir. Kurallar aday, extra line, tekli/toplu yerleşim ve bölümün günlük kurulumu sırasında sunucuda uygulanır. Mevcut gelecek görevlere aykırı daraltma/arşivleme reddedilir; geçmiş yerleşim içeriği ve revision değişmez. Global section düzenlemesi için tüm aktif lokasyonların yetkisi gerekir; kapsamı sınırlı yöneticiye düğme açıklamalı pasif gösterilir, günlük kurulum kullanılabilir.

Section panelinde seçim özetleri, revision kontrollü Undo, kararlı taslak kimliği ve kayıttan sonra odak geri dönüşü vardır. Gerçek tarayıcıda Main Dining / Dinner / Server seçimi kaydedildi, Garden Room ekleme geri alındı ve DB revision 3'te ilk kurallar doğrulandı. Section yalnızca uygun lokasyon/serviste göründü. Test section'ı UUID, workspace, isim, revision ve referans yokluğu doğrulanarak temizlendi. Mobil hedefler ve koyu tema panel kontrastı düzeltildi; geçici Light → Dark → Light tercihi geri alındı.

Gece yarısı aralıkları yerel tarih ve `+1 day` etiketiyle kart, çalışan planı ve export'ta gösterilir. Segmentli move kaynakta kalan çalışma, taşınan aralığın açık ihtiyacı ve iki geçiş boşluğunda gerçek section bilgisini korur. Kısmi extra-line doldurma kalan segmentleri korur, eski tam-gün segmentlerini doldurulan parçadan kaldırır ve gece yarısından sonraki atamayı gerçek yerel günün Line Up kaydına bağlar; ihtiyaç kimliği aynı kalır.

Bildirim retry komutu artık teslim bekleyen satır olmasa da lokasyon yetkisini denetler. Yetkisi kaldırılmış yöneticinin okuma/yazma/paylaşım komutları için 16 ek ret kontrolü geçti. **DB 197 + web 36 + API 10 = 243 odaklı test**; web/API typecheck geçti. Tam migration DDL baştan çalıştırılıp rollback yapıldı; iki bağımsız yönetici yarış kontrolü yeniden geçti. DB lint'te Line Up bulgusu yok, diğer modüllerin önceki uyarıları sürüyor.

Goal açık kalır: yukarıdaki kalan varyasyonlar, erişilebilirlik/yoğun veri kontrolü ve gerçek rol pilotu tamamlandı sayılmıyor. Hosted deploy yapılmadı. Yeni skill/MCP veya subagent gerekmedi.

Son operasyon kontrolünde segmentli swap karşı tarafın saatlik section yerleşimini koruyacak şekilde düzeltildi. İki çalışan atomik yer değiştiriyor; karşı tarafın kalan iki görevindeki dört section segmenti korunuyor. Dört ek DB testi ile güncel toplam 243 odaklı testtir.


## Goal devamı — yoğun kadro, erişilebilirlik ve otomatik kayıt

48 sentetik çalışan ve 56 yayımlanmış görevle pano/liste sayaçları, arama/servis filtresi sürekliliği, uzun isimler, 1900 karakterlik not/URL ve mobil brief incelendi. 640 px araç çubuğu taşması wrap ile, 320 px sayaç taşması eşit sütunlar ve satıra saran etiketlerle düzeltildi. 390 px son kontrolde sayfa genişliği 390 px kaldı; tarih düğmeleri, görünüm sekmeleri ve çalışan işlem düğmeleri en az 44 px oldu. %200 metin boyutu, gerçek tarayıcı zoom'u yerine geliştirme ortamında hesaplanan font/line-height değerleri ikiye katlanarak benzetildi; ardından sayfa yenilenerek geçici stiller kaldırıldı. Klavye odağı native dialog içinde kaldı; Escape çalışan düğmesine döndü.

Günlük not, servis brief'i, günlük section kurulumu ve tekli section/station yerleşimi 900 ms yazma arası sonrası otomatik kaydediliyor. Eşzamanlı istekler sıraya giriyor, son yazı korunuyor ve her kayıt sunucunun döndürdüğü revision ile devam ediyor. Done/Close bekleyen taslağı kaydettikten sonra kapanıyor. Hata seçimleri silmiyor, kör otomatik retry döngüsü başlatmıyor; yeniden deneme ve kaydedilmemiş değişiklikleri bırakma mevcut. Kaydetme paylaşım başlatmıyor. Personel değişimi, toplu yerleşim, extra-line oluşturma ve global section kuralları kendi açık işlem düğmelerini koruyor.

Yeni 7 test: açılışta yazmama, debounce, yavaş yanıt sırasında en son düzenlemeyi sıralama, kapanışın beklemesi, hata/yeniden deneme, geçersiz taslağın korunması, unmount, brief revision zinciri ve notun bir kez oluşturulup aynı kimlikle güncellenmesi. Seçili web kümesi 48 geçti; son küçük değişikliklerden sonra ilgili 28 test tekrar geçti. Web typecheck geçti. Paralel Employee Hub testlerindeki dört fixture erişimine yalnızca varlık bildiren `!` eklendi; mevcut test senaryoları veya ürün davranışları değiştirilmedi. API/DB bu devamda değişmedi; önceki 10/197 test ve API typecheck kanıtları geçerli kapsam sınırıyla korunuyor.

Gerçek tarayıcıda station iki kez kaydedildi ve yeniden açılarak doğrulandı; not, brief ve günlük section açıklaması düğmeye basmadan sunucuda kaydoldu. `supabase/verification/lineup_visual_fixture_local.py` tekrar kullanılabilir yerel yoğun veri fixture'ıdır. Oluşturulan UUID'lere ait çalışanlar, yayın, görevler, overlay'ler, notlar, brief, günlük kurulum ve placement audit kayıtları temizlendi. Başka kayıtlar silinmedi. Geçici viewport sıfırlanıp Aug 31 inceleme ekranına dönüldü.

Goal aktiftir. Yukarıdaki son sözleşme farkları ve gerçek rol pilotu tamamlandı gösterilmemiştir. Hosted deploy/commit/push yapılmadı; ek MCP/skill veya subagent gerekmedi.


## Goal devamı — kaldırma, extra-line notu ve bildirimler

`release` operasyonu gelecekteki tam/kısmi aralık için önizleme, gerekçe, revision/fingerprint ve idempotency ile kesinleşiyor. Aynı canonical vardiya/operasyon slotu çalışanı boşaltılmış açık ihtiyaç olarak korunuyor. Önceki/sonraki aralıklar eski çalışanda ve gerçek section'larında kalıyor. Yanlış lokasyon/pozisyon/servis, eski önizleme, kaynak yetkisi eksikliği ve geçmişi değiştirme engelleniyor. Section'dan çıkarma, call-off ve açık ihtiyacı iptal etme ayrı aksiyonlar olarak korunuyor. Vardiyayı iptal etme girişi Schedule'da doğru gün/lokasyon/çalışan/pozisyon/servis filtrelerini açıyor; iptalin kendisi oradaki inceleme/yayın akışında yapılır.

Kesinleşen operasyonlar artık ilgili lokasyonların yetkili yöneticilerine uygulama içi bildirim bırakıyor. İşlemi yapan yöneticiye ikinci bildirim verilmez; ilgisiz lokasyon yöneticileri hedeflenmez. İki yönlü swap'ın iki kapsamlı yöneticiye ulaştığı ve source-only kaldırmanın diğer lokasyona bildirilmediği DB testlerinde doğrulandı.

Extra line'a 500 karakterlik isteğe bağlı ekip notu eklendi. Oluşturma ile aynı transaction'da kaydolur; doldurulmuş slotta, kalan açık saatlerde ve değişmeyen çalışma parçalarında korunur. Pano/liste, kişisel çalışan görevi ve immutable paylaşım projection'ı aynı metni taşır. İlgili not değişikliği kişisel fingerprint'i değiştirir ve yeniden onay ister. PNG/PDF önizlemesi ve metin export'unda açık ihtiyaçlar da artık “Open position” olarak gösterilir; boş kişi adı nedeniyle paylaşım içeriğinden kaybolmazlar.

Onay panelindeki hedefli hatırlatma yalnızca son snapshot'ın henüz onaylanmamış, aktif hesabı ve ilgili lokasyon erişimi bulunan alıcılarına gider. Eski snapshot, yanlış yetki ve tarihsel/yayından kaldırılmış plan reddedilir. Aynı kişiye aynı sürüm için bir saat içinde yeniden bildirim üretilmez; görüntüleme veya hatırlatma onay kaydı oluşturmaz. API authenticated actor, workspace, share yetkisi ve seçilen snapshot'ı doğrular. E-posta/SMS gönderimi yoktur.

**225 DB + 60 web + 57 API = 342 odaklı test.** Son toplu web çalıştırmasında sekiz dosyadaki 60 test birlikte geçti. API son çalıştırması 57 geçti (app dosyasındaki ilgisiz 83 test seçilmedi). Web ve API typecheck geçti. `supabase/verification/lineup_migration_local.py`, migration'ın 28 yeni fonksiyonunu, 6 tablosunu ve 7 sütununu geçici olarak önceki duruma döndürüp dosyayı baştan uyguladı; sonunda rollback yaptı. Local DB lint'te Line Up bulgusu yok; diğer modüllerdeki önceki uyarılar ve paralel `employee_personal_tasks_service` unused variable uyarısı raporda korunuyor.

Yerel tarayıcıda sentetik çalışanın 18:00–20:00 aralığı kaldırıldı. DB ve gerçek Schedule görünümü 16:00–18:00 ile 20:00–23:30 çalışma aralıklarını, aynı slotta 18:00–20:00 açık ihtiyacı doğruladı. Kişi sayısı 48 kaldı, açık sayı 8→9 oldu. Notlu extra line oluşturuldu; mobil paylaşım önizlemesinde 10 açık ihtiyaç ve not görünür, 390 px sayfada taşma yoktu. Mobil yeni aksiyonlar 44 px dokunma yüksekliğinde. Native saat alanlarında otomasyon fill değerleri korunmadığı için gerçek klavye tuşlarıyla saatler değiştirildi ve commit öncesi DOM değerleri doğrulandı.

Schedule geçişi kontrolü fixture çalışan kodlarının Schedule'daki 24 karakter sınırını ortaya çıkardı. Yalnızca oluşturulan test çalışanlarının kodları ve fixture üreticisi bu sınıra uyarlandı; ürün şeması değiştirilmedi. Schedule doğru çalışanı/servisi ve kalan iki aralığı hatasız gösterdi. Geçici yayın, 48 profil, görevler, residual/extra-line overlay'leri, notlar ve iki operasyon audit kaydı UUID kapsamında temizlendi. Test paylaşımı yayımlanmadı; canlı hesaba bildirim gitmedi. Sekme normal viewport ile Aug 31 Line Up incelemesine döndü.

Sıradaki doğrulama: kalan rol bazlı uçtan uca kapsam. Gerçek yönetici/çalışan pilotu ve görev süresi ölçümleri ayrı, açık kabul kapısıdır. Goal aktiftir; hosted deploy/commit/push yapılmadı.


## Goal devamı — HTTP matrisi ve bildirim bağlantıları

Yönetici bildirimindeki lokasyon ve tarih alıcının erişimine göre seçiliyor. Kaynak ve hedef farklı timezone veya yerel güne düşerse her yönetici kendi erişebildiği lokasyonun doğru gününe açılır. Line Up `location` URL parametresini seçili lokasyon olarak kullanır. İki yeni DB ve bir web testi bu davranışı doğruladı; migration dosyasının tamamı tekrar baştan çalıştırılıp rollback edildi.

41 uç varyasyonu (19 operasyon, 11 aktif-workspace CRUD, 11 legacy-workspace CRUD) için gerçek Fastify route kayıtlarıyla matris eklendi. Her uçta başarılı actor/workspace bağlama, eksik/biçimsiz bearer, bulunamayan oturum, pasif üyelik, workspace uyuşmazlığı, eksik izin ve employee rolüne yanlış yükseltilmiş izinler kontrol edildi. Self-service uçları aktif çalışan için açık kaldı. Servis/DB katmanının lokasyon reddi HTTP 403 olarak korundu. Gerçek DB lokasyon kararları bu mock matrisin kapsamına dahil değildir; önceki DB ret kanıtlarıyla birlikte değerlendirilir.

Bu kontrol eski aktif-workspace uçlarında eksik workspace başlığının varsayılmasını ve resolver dönüşünde workspace uyuşmazlığının tekrar denetlenmemesini ortaya çıkardı. Açık ve geçerli workspace artık zorunlu; tüm Line Up uçları aktif üyeliği doğruluyor. Web istemcisi bu başlığı zaten gönderiyordu. Eski app alias testindeki dört başarılı isteğe başlık eklendi. API 57 test ve typecheck geçti; mevcut kullanıcıyla gerçek Line Up yenilemesinde veri hatasız yüklendi. Diğer işlerin ürün değişiklikleri geri alınmadı.


## Son teknik kabul — gerçek yerel roller ve mobil çalışan akışı

`supabase/verification/lineup_role_fixture_local.py` yalnızca 55321 local Auth ve `supabase_db_newfork-clean` üzerinde iki sentetik Auth hesabı, ayrı test workspace’i, iki lokasyon ve iki çalışan oluşturdu. Manager ve employee hesapları normal e-posta/şifre formundan gerçek Supabase oturumlarıyla giriş yaptı; development rol taklidi kullanılmadı. Hesap oluştururken e-posta gönderilmedi.

Manager QA Dining v1 paylaşımını oluşturdu. Önizleme ve çalışan ekranı aynı ekip notunu gösterdi; private manager notu ikisinde de yoktu. Çalışanın brief’i açması `viewed_at` yazdı, `acknowledged_at` boş kaldı. Ayrı “I've read this plan” aksiyonu onayı kaydetti; manager panelinde “Lineup QA A · Acknowledged · v1” görüldü.

Manager iki lokasyonlu swap’ı önizleyip kesinleştirdi. Canonical Schedule sorgusunda A → QA Patio ve B → QA Dining birlikte 16:00–22:00 oldu. Kaynak v2 ve hedef v1 paylaşıldı. Employee 390 px ekranda yeni Patio görevini, eski Dining görevinin kaldırıldığını ve yeniden onay aksiyonlarını gördü. Eski Dining v1 onayı korundu, Dining v2 onaysız kaldı; Patio v1 ancak yeni açık çalışan aksiyonundan sonra onaylandı.

Bu kontrol üç son iyileştirme getirdi: UTC gece yarısından sonra yerel bugünün Line Up sorgusundan düşmemesi için lokasyon timezone aralığı; aynı gündeki güncel görevin kaldırılmış görevden önce gösterimi; mobil expand aksiyonunda en az 44 px yükseklik ve employee kartındaki açık/koyu tema metin kontrastı. Koyu temada tarih, section açıklaması ve paylaşım saati 7,47:1; brief aksiyonu 10,86:1 ölçüldü. Mobil sayfa 390/390 px kaldı. İki timezone ve bir sıralama regresyon testi eklendi; EmployeeHub’ın diğer devam eden ürün değişiklikleri korunarak yalnızca Line Up tarih bağlantısı güncellendi.

Sonuç: **342 odaklı test**, web/API typecheck, tam migration rollback tekrarı, DB kontrolleri ve gerçek yerel rol tarayıcı doğrulaması geçti. Sentetik workspace, ona ait snapshot/receipt/bildirim/operasyon kayıtları ve iki Auth hesabı temizlendi; geçici şifre dosyası kaldırıldı. Normal viewport ve mevcut Meyhouse owner oturumu geri açıldı. Yerel Line Up ekranı incelemeye hazırdır. Hosted migration/deploy ve gerçek işletme pilotu yapılmadı.

REQ-01–REQ-10 ve P0 işlem sözleşmelerinin teknik uygulaması teslim edildi. İnsan katılımcılı prototip/görev süresi ölçümü, gerçek işletmede iki lokasyonlu pilot ve referans görsele dayalı birebir piksel karşılaştırması uygulama tesliminden ayrı kabul adımlarıdır. P1/P2 özellikler bu teslimin kapsamına alınmadı.
