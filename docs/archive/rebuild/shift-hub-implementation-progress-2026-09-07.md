# Shift Hub — goal odaklı uygulama ve kanıt takibi

Sözleşme: [implementasyon planı](shift-hub-implementation-plan-2026-09-07.md).
Senaryo bazında kapsam ve kalan kanıt: [AT01–AT42 kabul denetimi](shift-hub-acceptance-audit-2026-09-07.md).
Gerçek ürün ekranları: [40 görünüm ve görsel denetim](shift-hub-visual-proof-2026-09-07/README.md).

İlk çalışan uçtan uca dilim yerelde uygulandı. Release bir cover ilanıdır; mevcut çalışan final manager onayına kadar vardiyanın sahibidir. Özellik varsayılan olarak kapalıdır; yalnız bu çalışma için oluşturulmuş sentetik yerel workspace'te açıldı. İlgisiz WIP korunuyor. Kodun yazılması hiçbir kullanıcı hedefini tek başına kapatmaz.

| Hedef | Teknik kanıt | Görsel | İnsan UAT | Hosted/pilot | Nihai |
|---|---|---|---|---|---|
| G01 sorumluluğu anlama | IN_PROGRESS — sahiplik invariantı yerelde doğrulandı | PARTIAL | NOT_STARTED | NOT_STARTED | OPEN |
| G02 cover oluşturma | IN_PROGRESS — gerçek employee oturumu | PARTIAL | NOT_STARTED | NOT_STARTED | OPEN |
| G03 başvuru / geri çekme | IN_PROGRESS — üç ayrı gerçek oturum | PARTIAL | NOT_STARTED | NOT_STARTED | OPEN |
| G04 manager kararı | IN_PROGRESS — aday seçimi / tek ret / final onay | PARTIAL | NOT_STARTED | NOT_STARTED | OPEN |
| G05 uygunluk / swap | IN_PROGRESS — iki taraf / iki manager kapsamı | PARTIAL | NOT_STARTED | NOT_STARTED | OPEN |
| G06 atomik karar | IN_PROGRESS — 200 final +20 ek deneme; 8 Schedule sıralaması ve 2 save genişletmesi | N/A | N/A | NOT_STARTED | OPEN |
| G07 Schedule / Line Up | IN_PROGRESS — snapshot delta / draft rebase | PARTIAL | NOT_STARTED | NOT_STARTED | OPEN |
| G08 erişilebilirlik | IN_PROGRESS — dialog / odak / dirty state | PARTIAL | NOT_STARTED | NOT_STARTED | OPEN |
| G09 bildirimler | IN_PROGRESS — case grouping, güncel alıcı, gerçek relay failure/retry | N/A | NOT_STARTED | NOT_STARTED | OPEN |
| G10 görsel kalite | IN_PROGRESS — ürün ekranları uygulandı | PARTIAL | NOT_STARTED | NOT_STARTED | OPEN |

## Uygulanan davranış

- Ayrı case, çoklu application, çalışan rızası, aday bazlı manager oyu, audit ve idempotency kayıtları.
- Pool cover, doğrudan cover, swap ve gerçek open-shift pickup. İlan açmak ve başvurmak atamayı değiştirmiyor.
- Bir başvurunun reddi diğerlerini etkilemiyor. Kazanan onaylandığında diğer aktif başvurular nötr `closed_other_selected` sonucuyla kapanıyor. Önceki ret geçmişi korunuyor.
- Direct cover / swap davetinin reddi veya rızanın geri çekilmesi o doğrudan aramayı kapatıyor; sahibi güncel vardiya için yeni arama açabiliyor.
- Manager finalinde server uygunluğu yeniden kontrol ediliyor. Swap iki yönde kontrol ediliyor; farklı lokasyon kapsamları ayrı manager oylarıyla birleştiriliyor. Kendi talebini onaylama yasak.
- Job/location assignment tüm vardiyayı kapsamalı. Arşiv/exclusion, availability ve izin kontrolleri ortak Line Up evaluator üzerinden. İzin aralığı talebin lokasyon saat diliminde değerlendiriliyor. Sınırlı availability döneminin sonrasına uygunluk varsayılmıyor.
- Maddi vardiya değişikliği rızayı geçersizleştiriyor. Geçersiz ilanı yenilemek mümkün. Unpublished kayıt geçmiş olarak etiketleniyor. Teknik olarak boş Line Up overlay'i rızayı gereksiz yere geçersizleştirmiyor.
- Schedule ataması, bağlı canlı Line Up kaydı, önceki shared snapshot'tan assignment delta, yeni acknowledgement görevi ve outbox aynı final transaction içinde.
- Aynı materyal koşullara sahip eski draft/edit-session owner alanı güncelleniyor; unrelated notlar korunuyor. Eski atamayı geri yazan çakışan draft/session yayın veya save guard'ında duruyor.
- Employee: Available / My requests / History, tarih-lokasyon-arama filtreleri, sorumluluk mesajı, private note, saat/ücretsiz mola özeti, yeniden talep, önceki taleplere erişim ve iptal.
- Manager: case başına aday grubu, bilinçli aday seçimi, uygunluk preview, tek başvuruyu reddetme / bütün aramayı kapatma ayrımı, onay özeti.
- Employee dashboard aksiyon ve bekleyen sayaçları, manager workspace sayacı, Schedule / Line Up / inbox invalidation bağlı.
- Aynı gerçek hesabın tekrar `SIGNED_IN` / token yenilemesi protected ekranı unmount etmiyor. Yeni shift-exchange cache anahtarları workspace/yetki değişiminde temizleniyor.
- Süresi dolan veya maddi koşulları değişen case'ler mevcut notification-outbox worker çağrısında kalıcı kapanıyor. Sistem olayı kullanıcı taklidi yapmıyor; atama değişmiyor; tekrar koşum duplicate bildirim üretmiyor. Worker bakım hatasında diğer bildirimleri işlemeye devam edip hatayı sonuçta raporluyor. Hosted cron koşumu ayrıca doğrulanmalı.
- Uygunluk, vardiyanın kaydedilmiş saat dilimini kullanıyor. `unresolved / legacy_unverified` saatler final devre uygun kabul edilmiyor; geçmişteki bu vardiyalar UI'da “Hours need confirmation” ile okunabiliyor.
- Line Up reconciliation iki atamayı beraber ele alıyor. Aynı gün / lokasyon swap'ı yalnız bir yeni snapshot oluşturuyor. Ayrılan kişinin section lead görevi devralana kopyalanmıyor; çalışan aynı serviste başka bir atamayla kalıyorsa liderliği korunuyor. Shared lead temizliği unrelated unshared station/briefing metnini yayımlamıyor.
- Değişen assignment'a bağlı eski Line Up staffing teklifleri nötr sebeple kapanıyor; ilgili kişi ve teklif sahibi bilgilendiriliyor. Manager preview'da açılabilir Line Up etki özeti var.
- Koyu tema Requests sekmelerinin okunurluğu düzeltildi. Mobil dialog kapatma hedefi en az 48px; onay düğmeleri 48px. Dialog kapanınca odak açan düğmeye dönüyor.
- Gerçek browser turunda Tab/Shift+Tab dialog dışına kaçması giderildi; etkin ilk/son kontrol arasında odak döngüsü iki yönde doğrulandı. Case deep link'i uygun kuyrukta açılır; Back aynı kuyruğu korur. Direct davette owner'a karşı tarafın yanıtının beklendiği açıkça gösterilir.
- Koyu sidebar seçili satırı ve çalışan başlığı kontrastı, tablet arama alanının daralması, availability bağlantısının kart grid'inde yer kaplaması düzeltildi. Ham durum kodu yerine kullanıcıya anlaşılır etiket gösterilir.
- Schedule save recovery içinde onaylanmış atamayla taslak karşılaştırması ve **Use approved assignments** eylemi var. Manager yalnız listelenen atamaları günceller; not ve diğer vardiya düzenlemeleri korunur. Karşılaştırma fingerprint'i değişirse yeniden inceleme gerekir; kayıp yanıt aynı idempotency key ile tekrar alınır. Güncellenen taslak otomatik yayımlanmaz.
- Otomatik rebase ve save/publish guard aynı material-term karşılaştırmasını kullanıyor: sahip, lokasyon, job, service, tarih, saat, break ve kayıtlı time-source bilgisi. Süresi dolan veya başka kişiye ait edit session üzerinden recovery yapılamaz; lokasyon düzenleme yetkisi tekrar doğrulanır.

## Yerel doğrulama

| Kanıt | Sonuç | Kapsam sınırı |
|---|---|---|
| `supabase/tests/shift_exchanges_v1.test.sql` | **159 / 159** | Asıl yerel DB ve önceki temiz application replay üstüne 08000/09000 uygulanmış izole DB |
| `supabase/tests/lineup_operations_v1.test.sql` | **225 / 225** | Güncel fixture ile yerel DB ve temiz replay DB'de yeniden geçti |
| 167 uygulama migration'ı | **167 / 167** | Ayrı network=none test konteynerinde sıralı transaction replay; aşağıdaki provider bootstrap sınırına bak |
| ShiftExchangeHub 9, EmployeeHubPage 16, WorkspacePage 9, ScheduleRequestsPage 1, AppShell badge 8, Schedule realtime 3 | **46 / 46** | Odaklı web testleri; son değişiklikten sonra Hub 9 + Requests 1 yeniden geçti, diğerleri önceki koşum |
| AuthContext 6, ProtectedRoute 3, tenant query cache 2 | **11 / 11** | Aynı hesapta dirty form korunması ve cache temizliği dahil |
| `shift-exchanges-routes.test.ts` | **5 / 5** | Actor binding, tenant, idempotency, stale conflict ve Schedule recovery route |
| ExchangeScheduleRecovery 4 + ScheduleSaveRecoverySheet 4 | **8 / 8** | Açık kullanıcı eylemi, kayıp yanıt, stale karşılaştırma ve normal recovery'nin korunması |
| Güncel ShiftExchangeHub 16 + ExchangeDialog 1 | **17 / 17** | Çok adaylı odak geçişi, kısa CTA/tam hedef bilgisi, açık approve/reject sırasında aday çekilmesi ve not koruma dahil; Recovery 4 önceki koşumda ayrı kanıtlı |
| `notification-outbox-worker.test.ts` | **6 / 6** | Lifecycle önce üretir, aynı batch işler; bakım hatası diğer teslimi durdurmaz |
| Web + API typecheck | PASS | Son API/shared değişiklikleri dahil; sonraki değişiklikte ilgili kontrol tekrarlanır |
| Web production build | PASS | Saat, Line Up özeti ve Schedule recovery değişiklikleri dahil güncel build |
| Değişen feature / auth / entegrasyon dosyalarında ESLint | PASS | Tüm dirty repository için lint sonucu değil |
| Gerçek Auth + API | PASS | Üç ayrı aday, tekil başvuru/idempotency, aday mahremiyeti, tek case |
| Gerçek Schedule API recovery | PASS | Düzenlenmiş taslak kaydı 409; onaylı atamayı alma; not korunması; aynı key ile tekrar; başarılı taslak kaydı. Yayın yapılmadı |
| Gerçek browser | PASS — sınırlı | Employee ilan oluşturdu; manager Blake'i reddetti, Casey'yi onayladı; Drew nötr kapandı |
| Beş kritik ekran × iki tema × dört genişlik | **40 / 40 kayıt** | Görseller ve DOM taşma gözlemi; ayrıca altı mobil alt bölüm kaydı. Nihai G10, reader ve insan UAT sonucu değildir |
| `shift_exchange_concurrency_local.py` | **20 tur × 10 = 200** | Her turda bir commit, dokuz 409; aynı case final yarışı |
| `shift_exchange_extra_races_local.py` | **5 + 5 yarış / 20 deneme** | Aynı adaya iki çakışan shift: yalnız biri; withdraw / approve: tek tutarlı sonuç |
| Outbox → recipient → inbox | PASS | Ayrı veren/alan copy, nötr kaybeden sonucu, deep link ve ikinci projection'da duplicate olmaması |
| Legacy dry run | Yerelde 0 legacy kayıt | Mapping SQL doğrulandı; veri taşıma yapılmadı, boş shift'e eski owner geri atanmadı |

Önceki shared Line Up üzerinde onay v2 oluşturdu; önceki brief korundu, ayrı unshared not sızmadı, eski receipt korundu, yeni kişinin acknowledgement'ı pending kaldı.

Bulunup düzeltilen hatalar: snapshot SHA-256 uzunluk sözleşmesi; JSON önceliği yüzünden eksilen receipt; business conflict için SQLSTATE 40001'in PostgREST retry döngüsü; eski draft/session rebase; aynı kullanıcı auth event'inin dirty formu unmount etmesi. Beklenen stale iş kararlarında `PT409` kullanılıyor.

AT17 ek kanıtı: ilk scoped manager oyundan sonra karşı vardiyanın saati değiştirildi. Final komutu transfer yerine kalıcı `invalidated` sonucu döndürdü; atamalar korundu ve eski oylar silindi. Yeni çalışan rızasıyla açılan case eski oyları devralmadı; iki yeni kapsam onayıyla çift atama birlikte değişti. UI bu domain sonucunda genel başarı yerine açıkça “No transfer was made” diyor. Değişiklik tespiti case'i kalıcı kapatabildiği için her stale durum exception olmak zorunda değildir; tekrar eski revision gönderimi ayrıca conflict'tir.

## Kanıt dosyaları ve yerel durum

- `supabase/verification/shift_exchange_role_fixture_local.py`: gerçek yerel Auth kullanıcılarıyla izole fixture oluşturur; dışarıya mail göndermez.
- `supabase/verification/shift_exchange_api_local.py`: gerçek API, idempotency ve mahremiyet doğrulaması.
- `supabase/verification/shift_exchange_ui_fixture_local.py`: üç adaylı cover, yeni başvuruya açık cover ve karşı taraf rızası bekleyen swap için tekrar kullanılabilir sentetik gerçek API fixture'ları.
- `supabase/verification/shift_exchange_visual_manifest.py`: 40 gerçek browser JPEG kaydının boyut/format/hash manifest'i. Görsel bulgular ve kapsam sınırı görsel kanıt README'sinde.
- `supabase/verification/shift_exchange_concurrency_local.py` ve `shift_exchange_extra_races_local.py`: yalnız doğrulanmış sahipli fixture workspace'inde yarış denemeleri.
- `supabase/verification/shift_exchange_legacy_audit.sql`: salt okunur geçiş sınıflandırması; mutasyon yapmaz.
- Credential ve koşum sonuçları gitignored `supabase/.temp/shift-exchange-*` dosyalarında. Kimlik bilgileri ürün dokümanına eklenmedi.
- Yerel schema SQL transaction'larıyla iteratif uygulandı. Yalnız bu işe ait `20260909002000` ve `20260909003000` sürümleri, güncel fonksiyon ve grant kontrolleri sonrası CLI `migration repair --local --status applied` ile migration history'ye kaydedildi. Bu işlem sıfırdan migration replay kanıtı değildir.
- Devam diliminde `20260909004000` lifecycle, `20260909005000` kayıtlı saat dilimi uygunluğu ve `20260909006000` atomik Line Up reconciliation aynı yerel uygulama / history yöntemiyle eklendi. Paralel Schedule saat kaynağı migration'ı `20260909003001` ile ortak sözleşme doğrulandı; o işin sahipliği bu çalışmada değil.
- `20260909007000` Schedule recovery yerelde uygulandı ve history'ye kaydedildi. `shift_exchange_schedule_recovery_local.py` gerçek manager API'sinde owned fixture'ı kullanarak save→409→review→restore→save döngüsünü doğruladı; sonuç gitignored `shift-exchange-schedule-recovery-result.json` içinde.
- **Temiz uygulama migration replay:** `newfork-shift-exchange-replay-20260907` adlı yeni PostgreSQL 17 konteyneri ağsız ve host portu olmadan oluşturuldu. Güncel Supabase auth/storage/realtime şemaları **yalnız schema** olarak başlangıç yapıldı; uygulamanın storage policy'leri bootstrap'tan çıkarıldı ve uygulama migration'larıyla oluşturuldu. Kullanıcı satırı kopyalanmadı. Bu provider servislerinin sıfırdan kurulumu testi değildir. 167 uygulama migration'ı boş application schema üstüne sıralı çalıştı; synthetic seed sonrası 95+225 test geçti. Dosya hash'lerinde koşum sonu fark yoktu. `supabase/.temp/shift-exchange-replay/result.json`, `tests.json` ve dosya logları kanıtı tutar. Test konteyneri koşum sonrası durduruldu; asıl geliştirme stack'i korunuyor.
- `shift_exchange_migration_replay_local.py` yalnız ağsız, özel isimli ve boş application schema'lı konteyneri kabul eder; veritabanı resetlemez.
- Hosted DB / deployment değiştirilmedi. Commit veya merge yapılmadı.

## Açık teknik ve kabul kapıları — sonraki uygulama sırası

1. **Ortak Schedule entegrasyonu:** temel application replay ve mevcut time-source sözleşmesi geçti. Publish/unpublish/save için iki gerçek DB bağlantısıyla her iki işlem sırası, gözlenen advisory beklemesiyle doğrulandı; eski unpublish önizlemesinin yeni onayı kaldırabildiği açık 09000 ile kapandı. Diğer uygunluk yazarlarının yarış matrisi, ek kaynak-ID varyantları ve tüm güncel dosyaların yeniden temiz replay'i açık. Recovery gerçek API + component testleriyle geçti; gerçek Schedule ekranında görev/odak/mobil kanıtı gerekli.
2. **Line Up kalan reconciliation matrisi:** section lead, aynı gün tek snapshot ve kaynak bağlı eski teklifler için yeni kanıtlar geçti. Farklı haftalar/lokasyonlar, legacy share metadata fallback'i, segment üzerinden teklif referansları ve tüm kişi bazlı diğer kayıtların ek regresyonu açık.
3. **Bildirim kalan kapıları:** case bazlı grouping, aday çekilmesinde güncel sayı, sıfır adaylı kapanış temizliği, teslim öncesi scope kontrolü ve gerçek yerel relay failure/retry geçti. Reminder politikası, canlı inbox/deep-link rol turu, diğer delivery-time eligibility varyantları ve hosted cron/teslim takvimi açık.
4. **UI kalan matrisi:** önceki 40 temel kayıt ve altı mobil kayda ek olarak [çok aday/metin stres turu](shift-hub-visual-proof-2026-09-07/stress/README.md) tamamlandı: 12 ana +2 ek kayıt. 10 aday, uzun/bitişik isim, 320/390/1440 light/dark, kontrollü 2× kök font ve gerçek aday çekilmesi sırasında açık manager notu kanıtlı. Screen reader, native büyütme, diğer çalışan görevlerinin tam klavye turu, safe-area cihazı, recovery ekranı ve route değişirken dirty form turu açık. Geçici ayarlar geri yüklendi.
5. **Güncel Line Up regression:** publication-lock fixture sorunu güncel dosyada giderilmiş durumda; bu tur 225 kontrol asıl yerel ve temiz replay DB'de tekrar geçti. Bundan sonra ortak evaluator değişirse ilgili regression yeniden koşulmalı.
6. **İnsan UAT ve hosted/pilot:** 5 employee +2 manager ile görev süreleri ve sahiplik anlama oranı; görsel puan en az 21/24; staging P95 yayılım, reconnect/fallback süreleri; legacy gerçek veri dry-run, rollout/rollback ve pilot. Bu kapılar tamamlanmış sayılmadı.

AT01–AT42'nin tamamı için final PASS ilan edilmedi. Kanıtı olmayan veya kısmi maddeler yukarıdaki hedefleri açık tutar. Goal aktiftir.

Kontrol edilen resmi dokümanlar: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [PostgREST custom error codes](https://docs.postgrest.org/en/stable/references/errors.html#custom-errors).

## Bildirim tutarlılığı — 08000 devam dilimi

- Aynı case/alıcı/grup için yalnız son olay görünür; diğer inbox satırları `superseded` kalır. Event, recipient ve karar geçmişi silinmez. Yeni olay sıra numarası, ters teslim ve eski retry'nin güncel bildirimi ezmesini engeller. Eski verinin sırası timestamp + UUID ile deterministik atanır; aynı timestamp'teki geçmiş olayların gerçek işlem sırasını geri çıkarma iddiası yoktur.
- Manager bildirimi güncel aday sayısını gösterir. Aday geri çekildiğinde mevcut bildirim hemen güncellenir; son aday çekilince gereksiz review görevi kalkar. Okunmuş kayıt aynı olay retry'sinde yeniden okunmamış olmaz.
- Kapanış, ret, geçersizleşme ve diğer domain değişimlerinde alıcı yeniden değerlendirilir. Hiç adayı olmayan arama kapatıldığında kapanış outbox'ı üretilmese bile daha önce teslim edilen fırsatlar ve legacy badge satırları kapatılır.
- Ortak kanal/tercih resolver'ından sonra güncel case, üyelik, reviewer kapsamı ve uygun cover alıcısı kontrol edilir. Recipient projection önceden oluşmuş olsa bile inbox insert öncesi kontrol tekrar çalışır. Domain deny nedeni `shift_exchange_audience_changed` olarak saklanır.
- Case bazlı advisory lock eşzamanlı relay projection'larını serileştirir. Case/event sorguları için iki odaklı index eklendi. Shared projection fonksiyonlarına mevcut gövde üzerinden kontrollü hook uygulanır; beklenen nokta bulunamazsa migration durur.

Doğrulama:

- **152/152** Shift Hub DB kontrolü iki yerel ortamda geçti; 16 yeni bildirim kontrolü grouping, ters teslim, read-state retry, scope iptali, çekilme ve sıfır adaylı kapanışı kapsar.
- Shared relay **28/28**, user preferences **8/8**, Schedule publish notification **6/6** iki ortamda geçti. Catalog/resolver suite **18/21**, core **34/35**: dört assertion 9 katalog türü bekliyor, mevcut veri 11 içeriyor. Değişiklik öncesi izole baseline aynı dört hatayı verdi; testler bu işte değiştirilmedi.
- Genel function privilege suite asıl yerelde **3/3**. İzole replay'de **2/3**: önceki migration'ların 16 trigger fonksiyonunda authenticated grant kalıyor; 08000'nin oluşturduğu fonksiyonlar bu listede yok. Bu trigger fonksiyonlarının doğrudan çağrı niteliği ayrıca değerlendirilmeli; temiz kurulumun genel privilege gate'i PASS ilan edilmedi.
- `shift_exchange_notification_retry_local.py`, daha önce onaylanmış sentetik case'in tek pending terminal outbox'ını açıkça lease edip **gerçek yerel PostgREST relay RPC'sine** scoped inbox hatası verdi. İlk işlemde kısmi inbox satırı oluşmadı; onaylı case, published shifts ve canlı Line Up/entries hash'i değişmedi. Failure RPC retry üretti, ikinci işlem başarılı oldu, duplicate projection sonunda tek inbox satırı kaldı. Test trigger'ı `finally` ile kaldırıldı. Genel batch seçimi/hosted cron, immutable snapshot/receipt hash'i ve dış kanal teslimi bu scriptin kapsamında değildir.
- `supabase/.temp/shift-exchange-notifications/` main/baseline/replay loglarını; `shift-exchange-notification-retry-result.json` gerçek RPC kanıtını içerir. Bu dizinler gitignored'dır.
- 08000 asıl yerelde iteratif uygulandı ve yalnız bu sürümün migration history'si repair edildi. İzole DB'de önceki 167-migration temiz application replay üstüne tek transaction ile uygulandı; index ekleri ardından iki DB'ye uygulandı. Bu, güncel 168 dosyanın baştan temiz replay'i olarak raporlanmaz. İki ortamın sekiz ilgili fonksiyon gövdesi newline-normalize SHA-256 ile eşleşti. İzole konteyner tekrar durduruldu.

G09 ve genel goal açık: reminder, canlı rol/deep-link turu, hosted ölçüm ve insan UAT hâlâ tamamlanmalı.

## Çok adaylı manager kullanımı ve erişilebilirlik devam dilimi

Review, seçilen adayın karar başlığına odaklanır ve başlığı görünür konuma kaydırır. Listeye dönüş seçilen adayda devam eder; arka plan refetch odağı taşımaz. İlk navigasyon frame'inin hızlı kullanıcı seçimini ezmesi testte bulundu ve giderildi. Onay dialogundaki uzun ad düğmeyi aşırı büyütmez: görünür metin kısa, erişilebilir ad ve açıklama tam hedefi korur. Fontlar aynı normal görünümü koruyan rem birimlerine taşındı; uzun metin sarılması korunur. İlk preview gelmeden diğer aday sayısı 0 olarak uydurulmaz.

Aday açık karar sırasında çekilirse hem approve hem reject devre dışı kalır; belirsiz kişi adı yerine açık durum mesajı gösterilir. Manager notu korunur. Component testleri iki varyantı, gerçek browser + ayrı gerçek applicant API oturumu onay varyantını doğruladı. Son testte 10→9 aday güncellemesi açık dialoga ulaştı; manager submit yapılmadı. Tekrar başvuru sonunda 10 aktif aday, eski çekilme geçmişi ve Alex'in sahipliği korundu.

Son odaklı test: Hub **16/16**, Dialog **1/1**; web typecheck ve hedefli ESLint PASS. Görsel artefakt doğrulayıcı **12 ana +2 ek** JPEG/ölçüm kaydını doğruladı. Bunlar insan görev süresi, görsel ≥21/24 puanı veya hosted yayılım ölçümü yerine geçmez. `shift_exchange_many_candidates_local.py` yalnız sahipliği doğrulanmış sentetik yerel fixture'ı genişletir; kullanıcı parolaları gitignored state'te kalır.

## Schedule işlemleriyle eşzamanlı onay — 09000 devam dilimi

**Doğrulanmış açık:** aynı publication kimliği/sürümü ve vardiya sayısı korunurken Exchange owner alanını değiştirebiliyor. Eski unpublish önizlemesi yalnız publication kimliği/sürüm/sayı üzerinden imzalandığı için onaydan sonra sıraya girmiş yayından kaldırma da başarılı oluyordu; canlı atama kayboluyordu. `shift-exchange-unpublish-race-before-fix.json` başarısız invariantın kaydıdır.

09000, mevcut unpublish kapsam/yetki kontrolünü koruyarak imzaya güncel vardiyaların kimlik, kaynak, sahip, lokasyon, job/service, tarih/saat, break ve kayıtlı saat kaynağı bilgisini ekler. Önceden incelenmiş içerik değiştiyse mevcut komut `PT409` verir. Güncel önizleme alındıktan sonra yetkili manager bilinçli olarak yayını kaldırabilir; geçmişteki onaylı atama korunur. API'nin görünür önizleme biçimi değişmez.

`shift_exchange_schedule_races_local.py`, sahipliği doğrulanmış sentetik workspace'te her deneme için yeni gelecek hafta oluşturur. İlk işlem tamamlandıktan sonra transaction commit'i dört saniye bekletilir. İkinci **public service** çağrısının gerçekten `advisory` beklemesinde olduğu `pg_stat_activity` ile gözlenir. Bunlar iki gerçek PostgreSQL bağlantısıdır; HTTP/browser yarışı, ağ gecikmesi benchmark'ı veya hosted kanıtı değildir.

| Yarış | Önce Exchange onayı | Önce Schedule işlemi |
|---|---|---|
| Unpublish | Eski önizleme PT409; yeni owner canlı kalır | Yayın kalkar; bekleyen onay invalidated olur, transfer yapılmaz |
| Saat değiştiren publish | Eski taslak PT409; onaylı saat/sahip kalır | Yeni saat yayımlanır; eski rıza invalidated olur |
| Aynı koşullarla republish | Eski revision/önizleme PT409; yeni owner kalır | Yeni publication'a aynı kaynak bağlanır; onay yeni publication'da doğru kişiye geçer |
| Maddi düzenlemeli session save | Save PT409; edit session ve not korunur | Taslak kaydolur; onay canlı atamayı değiştirir; eski taslak sonradan publish edilemez |

Sekiz sıralama geçti. Save çiftine ek koşumda başarısız save'in çalışma notu ve başarılı save'in taslak notu doğrulandı; başarılı save çalışma satırlarını kapattığı için kanıt doğru kalıcı taslaktan okunur. Save-before-approval taslağına **yeni** publication preview alınsa da eski owner'ı geri yazan publish PT409 verir. Sonuçlar `shift-exchange-schedule-races-eight.json` ve `shift-exchange-schedule-races-result.json` içindedir; normal kullanıcı haftası veya session'ı kullanılmadı.

Doğrulama: Exchange **159/159** asıl ve izole DB'de; publication **41/41**, edit sessions **24/24** izole DB'de. Dört eski test beklentisi güncel sözleşmeye taşındı: üç stale/save hata kodu `PT409`, boş update'in alan doğrulama mesajı `invalid shift location`. Asıl geliştirme DB'sindeki ortak fixture bugün beklenen yedi başlangıç vardiyasını vermiyor ve publication fixture'ı çoğaltılmış source ID görüyor; bu shared testlerin asıl DB koşumu PASS sayılmadı, mevcut veriye reset/temizlik yapılmadı. İzole baseline bu veri sorunlarını üretmedi.

09000 izole DB'ye bir kez transaction içinde uygulandı; asıl DB migration history'sine yalnız bu sürüm kaydedildi. İki preview fonksiyonunun newline-normalize hash'leri eşleşti. Genel function privilege kontrolü asıl DB'de **3/3**. Loglar `supabase/.temp/shift-exchange-schedule-races/` içindedir. Hosted/deploy ve insan kabulü açık kalır.

## AT09 — çalışan aramayı kapatırken manager onayı

`shift_exchange_owner_close_race_local.py`, yalnız doğrulanmış sentetik yerel workspace'te iki yeni gelecek hafta oluşturdu. Üç adayın başvurusu boyunca owner korunması kontrol edildi. Önce onay ve önce kapatma sıraları iki gerçek PostgreSQL bağlantısında çalıştı; ikinci public service çağrısının advisory kilidinde beklediği doğrudan gözlendi.

- Onay önce commit: seçilen aday `approved`, diğer iki aday `closed_other_selected`; yeni owner canlı Schedule'da kalır. Kapatma PT409 alır; `case_closed` olayı oluşmaz.
- Kapatma önce commit: üç aday `closed_case_cancelled`; mevcut owner ve current publication korunur. Onay PT409 alır; transfer veya başka aday seçimi olayı oluşmaz.
- İki sırada da revision yalnız bir artar, tek terminal command kaydolur. Kazanan komutu aynı idempotency key ile tekrar etmek aynı sonucu döndürür; sahiplik, başvurular ve olay sayıları değişmez.

**2/2 sıralama PASS.** Kanıt `supabase/.temp/shift-exchange-owner-close-races-result.json` içinde. Önceki withdraw/approve kanıtıyla AT09 yerel çekirdek senaryosu LOCAL oldu. UI çatışma mesajlarının eşzamanlı ekran turu, inbox teslimi ve hosted süre ölçümü bu scriptin kapsamı değildir. Ürün kodunda bu senaryo için ek düzeltme gerekmedi.

Son kapanış kontrolleri: iki yeni yarış scripti Python derleme kontrolünden geçti; ilgili tracked SQL test dosyalarında `git diff --check` geçti. İzole replay konteyneri durduruldu ve `exited` doğrulandı; ana geliştirme stack'i korunuyor. G01–G10 ve goal nihai kabul kapıları açık kalır.

## AT27 — gerçek Schedule kurtarma akışı ve panel UX

Gerçek browser turu, component/API testlerinin kapsamadığı entegrasyon hatasını buldu: `pendingOpsCount === 0` render koşulu, maddi düzenleme varsa Exchange karşılaştırmasını gizliyordu. Kullanıcı doğru 409 hatasından sonra yalnız Retry görüp aynı başarısız kayda dönüyordu. Koşul kaldırıldı; Save draft formu recovery açılırken kapatılıyor. Onaylı atamalar alındığında eski pending cache temizlenip sorgular yenileniyor; diğer kalıcı session değişiklikleri sunucuda korunuyor.

Panel native modal oldu: başlık odağı, arka plan etkileşiminin engellenmesi, Tab döngüsü, Escape/Keep editing, eski Save As düğmesi kalkmışsa Publish'e dönüş. Theme uyumu, rem tipografi ve 44 px eylemler eklendi. 2× kök fontta sabit üst/alt alanların içeriği sıkıştırdığı görüldü ve panel tek kaydırma alanına çevrildi. Başarı copy'si artık error banner yerine mevcut success toast kullanır; bu son kopya için ayrı browser gözlemi henüz yok.

**Gerçek UI→API→DB kanıtı:** sentetik 2027-02-15 haftası, Alex'in break 0→30 düzenlemesi → ayrı gerçek manager API onayıyla Drew → Save As409 → görünür eski/yeni karşılaştırma → Tab/Return ile restore → başarılı Save As. DB: saved session; taslak/canlı owner Drew; iki break 0; current publication version 1. Yeni yayın yapılmadı. AT27 yerel çekirdek kabulü LOCAL oldu. UI hızlı editöründe note alanı bulunmadığı için bu tur note yazımı kanıtlanmadı; önceki gerçek API/DB note kanıtı ayrı geçerlidir.

[Recovery görsel kanıtı](shift-hub-visual-proof-2026-09-07/recovery/README.md): 320/390/1440 × light/dark altı kayıt +390 opening +390 dark 2× font = sekiz final kayıt. Hepsi incelendi; yatay panel taşması yok, klavye eylemine ulaşılabiliyor. Geçici DOM tema/font ve viewport ayarları geri alındı. Native zoom, reader, gerçek safe-area ve insan puanı kanıtı değildir.

Odaklı testler **18/18** (sheet 6, recovery 4, draft cache 8); typecheck ve hedefli ESLint PASS. Helper `shift_exchange_recovery_browser_fixture_local.py` yalnız sahipliği doğrulanmış sentetik workspace'te yeni hafta oluşturur; düzenleme ve Save As işlemlerini kendisi yapmaz. DB son durum kontrolü PASS. Önceki listede açık yazan **gerçek UI recovery çekirdek döngüsü artık kanıtlıdır**; kalan UI görevleri/insan UAT ve diğer teknik matrisler G01–G10'u açık tutar.

## AT18 / AT19 — uygunluk yazımı ile final onay yarışı

Önceki kodda gerçek açık yeniden üretildi: final onay işlemi henüz commit etmeden adayın job yetkinliği kaldırılabiliyor, onay yine de tamamlanıyordu. `20260909010000_shift_exchange_eligibility_write_lock.sql`, job/location assignment yazımlarını ve employee profile'ın uygunluğu etkileyen alanlarını aynı workspace onay kilidine bağlar. Satır kilidi alınmış olabileceği için trigger beklemez; çakışmada `PT409` döndürür ve kayıt yapılmadığını, tekrar denenmesi gerektiğini söyler. Böylece ters satır/advisory kilit sırası bekleme döngüsü oluşturmaz. Tasarım dayanağı: [PostgreSQL explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html).

`shift_exchange_eligibility_races_local.py` yalnız sahipliği doğrulanmış sentetik yerel workspace'te, iki gerçek DB bağlantısıyla çalıştı. Her vaka yeni hafta kullanır; metadata değişiklikleri `finally` ile eski durumuna döndürüldü ve doğrulandı.

| Senaryo | Ölçülen sonuç |
|---|---|
| Düzeltme öncesi job / önce onay | `DEFECT_REPRODUCED`: yetkinlik yazımı onay commit'inden önce başarılı oldu; onay yine tamamlandı |
| Job, location, exclusion / önce metadata | **3/3 PASS**: onay advisory kilidinde bekledi; güncel uygunsuzlukla PT409, mevcut owner ve pending başvuru korundu, transfer olayı 0 |
| Job, location, exclusion / önce onay | **3/3 PASS**: metadata yazımı PT409, final onay tek transferle tamamlandı; uygunluk kayıtları değişmedi |
| Availability / önce onay | **1/1 PASS**: gerçek `availability_command_service` yayımlanmış haftayı değiştirmeyi mevcut 23514 korumasıyla reddetti; availability version değişmedi |

Bu koruma tamamlanan bir devirden sonra yapılacak kasıtlı yetkinlik değişikliğini yasaklamaz; final işlem sınırını korur. Time off, belgeler, üyelik kapsamı, katalog/closure ve Line Up extra yazımlarının tüm yarışları bu üç trigger'ın kapsamına dahil değildir. Availability için yeni kilit eklenmedi. Kanıt doğrudan DB service / yetkili metadata DML çağrısıdır; employee kayıt ekranında eşzamanlı HTTP/UX turu veya hosted benchmark değildir.

Regresyon: asıl yerelde Exchange **159/159**, Line Up **225/225**, function privileges **3/3**; izole replay DB'de Exchange **159/159**, Line Up **225/225**, employee directory **98/98**, employee create **32/32**. Son iki suite migration öncesi baseline'da da geçti. Local security advisor sorun bildirmedi. Yeni fonksiyon hash'i ve üç trigger iki DB'de eşleşiyor; anon/authenticated/service_role doğrudan execute yetkisi yok.

Migration CLI scaffold ile oluşturuldu, bağımlılık sırası için 10000 adına taşındı; gövde iki yerel DB'de uygulandı, asıl yerel migration history kaydı doğrulandı. Bu, tüm güncel migration dosyalarıyla sıfırdan kurulum kanıtı değildir. İzole konteyner tekrar durduruldu. Sonuçlar gitignored `shift-exchange-eligibility-races-{baseline,result,availability}.json` ve `shift-exchange-eligibility/` içinde. AT18/AT19 ve G06 kalan matris nedeniyle açık kalır.

## AT17 — ilk scope onayından sonra farklı adayla takas

Kalıcı DB suite'e 17 yeni kontrol eklendi. A→B takasında B kabul ettikten ve ilk lokasyon manager'ı oy verdikten sonra B rızasını geri çeker. Eski case kapanır, oyu silinir, üç kişinin de vardiyası korunur. A, C'nin vardiyası için **yeni** case açar; C yeniden açıkça kabul eder. Yeni case ilk oyu devralmaz; ikinci lokasyon manager'ının tek başına oyu atamaları değiştirmez. İlk lokasyondan da yeni onay geldiğinde yalnız A/C çifti değişir; B kendi vardiyasında kalır. Eski case ile veya eski application ID'sini yeni case'e taşıyarak approve denemeleri PT409 verir. Eski case'de transfer olayı 0, yeni case'de 1.

Bu, mevcut swap içindeki kişiyi sessizce değiştiren bir edit işlemi değildir; yenilenmiş rızayla yeni talep sözleşmesidir. Yeni kontroller gerçek public command/preview fonksiyonlarından geçer; ürün kodunda bu senaryo için ek değişiklik gerekmedi. Tüm fixture değişiklikleri test transaction'ı sonunda rollback olur.

**176/176** Exchange kontrolü asıl yerel ve izole DB'de geçti; TAP planı ve başarısız assertion sayısı ayrıca kontrol edildi. Önceki saat değişimi kanıtıyla birlikte AT17 çekirdek yerel durumu LOCAL oldu. Browser'da aday değiştirerek yeni takas görevini tamamlama, insan UAT ve hosted kanıtı bu DB sonucu değildir. Loglar `supabase/.temp/shift-exchange-eligibility/candidate-renewal-{main,replay}.{json,log}` içinde.

## AT19 / AT20 — ortak fiziksel availability değerlendirmesi

Güncel kaynak/live schema karşılaştırması, availability işinde yazılmış 07001 motorunun henüz uygulanmadığını ve Shift Hub/Line Up'ın son tek availability kaydını okuduğunu gösterdi. İlk 13 senaryolu karşılaştırmada **7 yanlış karar** yeniden üretildi: yeni weekly kaydı geçici unavailable dönemini gölgeleyebiliyor; gece yarısında başlayan/biten istisnanın doğru parçaları hesaplanmıyor; spring geçişinde olmayan saat uygun sayılabiliyordu. Bu aday kararları UI görünümü, submit ve final preview tarafından ortak kullanılır.

`20260909011000_shift_exchange_canonical_availability.sql`, ortak `lineup_candidate_check_exchange_base` içindeki availability hesabını `assess_shift_availability` motoruna bağlar. Job, location, aktif çalışan, document, closure, published/extra overlap ve travel kuralları korunur. Approved time off aynı motorun saved/request-location saat dilimi hesabından gelir. Line Up için partial durum ve ilk uygun parçanın başlangıç/bitişi korunur; tam vardiya Exchange yalnız eligible kabul eder. Schedule soft-policy override'ı uygunsuz adayın tam vardiyayı devralmasına izin vermez. Descriptor'ın `date` alanı, eski kopyadan kalan `scheduled_date` yerine canonical assessment'a aktarılır.

| Kanıt | Sonuç / sınır |
|---|---|
| Yeni adapter suite | **14/14**, iki yerel DB'de uygulama sonrası; başlangıçtaki 13 senaryoya descriptor tarih tutarlılığı eklendi |
| Authoritative engine | **40/40**, iki ortamda rollback transaction; engine dosyası değiştirilmedi |
| Line Up | **225/225**, iki ortamda yeni motor/adapter ile; son tarih normalizasyonu sonrası asıl DB'de tekrar geçti |
| Exchange | **176/176**, iki ortamda son adapter ile |
| Availability lifecycle | **79/79** asıl DB'de; izole ortamda 74 pass +2 assertion farkı +1 sonlandıran published-period hatası. Aynı sorunlar adapter olmadan 07001 baseline'da da var; PASS sayılmadı |
| Function privileges / advisor | Asıl DB **3/3**, kurulum sonrası local security advisor sorun bildirmedi; engine ve candidate fonksiyon hash'leri iki DB'de eşleşti |
| Gerçek Auth/API okuma | Manager, employee ve Drew oturumları PASS; gözlenen tekil yanıtlar 0.625 /0.069 /0.273 sn. Bunlar P95 veya commit→ekran yayılım ölçümü değildir |

Önce rollback kontrolleri tamamlandı, sonra değişmemiş **07001 + yeni 11000** iki yerel DB'ye tek transaction ile uygulandı. Asıl yerel migration history'de iki sürüm doğrulandı ve schema cache reload istendi. Availability ilerleme belgesindeki eski “NOT APPLIED” bilgisi bu kurulumla güncellendi; diğer availability tüketicilerinin uygulama sahipliği değişmedi. Bu dosyalar tekrar tam uygulanmamalıdır. Hosted/production/commit/merge yapılmadı.

SQL dosyaları test çalıştırıcısında byte olarak korunmalıdır: eski fonksiyon gövdelerindeki CRLF'yi yalnız test girdisinde LF'ye çevirmek, 07001'in kontrollü metin eşlemesini durdurur. İlk çalışma bu nedenle durdu; byte girdisiyle migration ve testler çalıştı. Yeni 11000 kendi değiştirdiği gövdeyi eşlemeden önce newline-normalize eder.

Loglar `supabase/.temp/shift-exchange-availability/` altında: `baseline.log`, `adapter-final.json`, `main-transient.json`, `lifecycle-baseline.log`, `lifecycle-main-transient.log`, `apply.json`, `installed-checks.json`, `api-read.json`. İlk başarısız denemelerin logları final kanıtın yerine kullanılmamalıdır. AT19/AT20; gerçek liste→başvuru→son onay çoklu-version senaryoları, DST tam devir/UI açıklaması ve kalan timezone matrisi nedeniyle PARTIAL kalır. G01–G10, insan UAT ve hosted/pilot kapıları açık.

## Çalışan formu — güncel eşleşme, retry ve klavye odağı

Create formunda seçilen aday query refetch sonucundan kalksa bile target ID state'te kaldığından gönder düğmesi açık kalabiliyordu. Gönderim artık güncel liste üyeliği, uygunluk, query başarısı ve tamamlanmış kontrol gerektirir; form submit handler'ı da aynı koşulu uygular. Swap ve doğrudan cover ortak davranır. Uygunluk kontrolü sürerken gönderim kapalıdır; hata durumunda form içi retry gösterilir. Kayıp eşleşme açıkça açıklanır, not korunur. Boş eşleşme listesinden cover havuzuna geçiş tek düğmeyle yapılır; not kaybolmaz. Saatleri doğrulanmamış vardiya için sorgu başlatılmaz. Pool ilanı gereksiz bir önceki candidate query hatasıyla engellenmez.

Gerçek browser'da retry düğmesi unmount olunca klavye odağının sayfaya düştüğü görüldü. Düzeltme sonrası başarılı retry odağı eşleşme seçimine, başarısız retry tekrar düğmesine taşır. Kullanıcı beklerken not alanına geçmişse odak çalınmaz. Durum metni polite live region olarak select'e bağlanır; etkileşimli retry düğmesi label içine yerleştirilmez.

**23/23 odaklı web testi:** Hub 22 + dialog 1; altı yeni çalışan senaryosu. Hedefli ESLint ve web typecheck son değişiklikten sonra kontrol edildi. [Gerçek çalışan browser kanıtı](shift-hub-visual-proof-2026-09-07/employee-matches/README.md): önce seçilmiş swap'ın sorgusunda kontrollü hata→send kapalı/selection-note korunur; odak düzeltmesinden sonra yeni formda hata→Enter ile retry→gerçek API başarı→SELECT odağı→Drew seçimi→send açık. Gönderim yapılmadı. Final üç görüntü 390 dark /320 light hata ve 320 light recovery içerir; dialog yatay taşma 0. Native zoom/reader/insan ölçümü değildir. Seçilen adayın backend değişimiyle listeden kaldırılması bu browser turunun değil, component senaryolarının kanıtıdır.

Geçici ağ engeli, tema ve viewport ayarları temizlendi; sentetik not taslağı discard edildi ve manager oturumu geri yüklendi. DB/migration değişikliği bu UI diliminde yok. G01–G10'un kalan teknik, erişilebilirlik, insan UAT ve hosted kapıları açık.

## AT26 — gerçek vardiya başlangıcında karar / commit sınırı

`shift_exchange_deadline_races_local.py`, yalnız ağsız ve host portu bulunmayan sahipli replay konteynerinde çalışır. Her senaryoya yeni sentetik çalışanlar ve o anda birkaç saniye sonra başlayacak gerçek published shift ekler. Case expiry elle değiştirilmez ve sistem saati taklit edilmez; expiry'nin published shift başlangıcına eşitliği doğrulanır.

Önce iki açık yeniden üretildi. (1) Manager transaction'ı başlangıçtan önce başlıyor, workspace kilidinde başlangıcı geçene kadar bekliyor ve yine transfer yapıyordu. `now()` transaction başlangıç zamanını koruduğu için saat ilerlemiyordu. (2) Komut başlangıçtan önce onay verse bile transaction daha geç commit olduğunda devir kalıcı olabiliyordu. Zaman semantiği dayanağı: [PostgreSQL current date/time](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).

`20260909012000_shift_exchange_commit_deadline_guard.sql` beş domain/read fonksiyonunun deadline karşılaştırmalarını `clock_timestamp()` kullanacak biçimde değiştirir; audit timestamp'leri korunur. Bu fonksiyonlar canlı saat okudukları için VOLATILE tanımlanır. Komutun expiry yolu eski kapsam oylarını siler ve expiry olayını insan rızası gibi göstermemek için system actor ile üretir. Ayrıca `completed` geçişinde transaction sonuna ertelenmiş constraint trigger, kararın zamanında commit edilmesini kontrol eder. Başlangıcı geçen transaction PT409 ile tamamen geri alınır; atama, reconciliation, oy ve outbox birlikte rollback olur.

| Gerçek saat senaryosu | Sonuç |
|---|---|
| Önce workspace kilidi; manager başlangıçtan önce beklemeye girer | Advisory beklemesi gözlendi. Kilit açılınca case expired; mevcut owner korunur; tek expiry olayı |
| Onay komutu zamanında; commit başlangıçtan sonraya gecikir | COMMIT PT409. DB'de case hâlâ open ve eski owner; ardından lifecycle tek expiry ile kapatır. Transfer outbox 0 |
| Lifecycle expiry önce, manager sonra | Manager advisory bekler ve PT409 alır; expired case ve mevcut owner korunur |
| Onay ve commit başlangıçtan önce | Tek geçerli transfer; başlangıçtan sonraki lifecycle yeni owner'ı geri almaz ve tamamlanan case'i expire etmez |

**4/4 PASS**; düzeltme öncesi iki senaryo `DEFECT_REPRODUCED`. Geç senaryoların tümünde transfer outbox 0, expiry olayı 1, aktif başvuru expired ve eski oy sayısı 0. stdout'ta SQL fonksiyonunun geçici `completed` değeri görülmesi COMMIT başarısı değildir: late-commit senaryosunda transaction exit/error ve kalıcı DB sonucu kontrol edilir. HTTP/browser sınır yarışı veya hosted süre kanıtı değildir; çekirdek cover vakasıyla ortak transaction mekanizması doğrulanır.

Regresyon: son Exchange **176/176** iki ortamda; Line Up **225/225** izole DB'de; function privileges **3/3** asıl DB'de. Asıl DB testleri migration ile rollback transaction içinde geçti, sonra migration kalıcı uygulandı; altı fonksiyon ve deferred trigger tanımı izole DB ile hash eşleşti, trigger fonksiyonu anon/authenticated/service_role'a doğrudan açık değil. Local security advisor sorun bildirmedi. Gerçek manager API okuması 19 case ile PASS. Yerel migration history **12000** ve schema reload doğrulandı; hosted değişmedi.

Verifier fixture rollout flag'ini artık `finally` içinde eski değerine döndürür. İlk koşum flag'i açık bıraktığı için ilk shared Exchange suite fixture başlangıcında başarısız oldu; fixture flag'i düzeltildi ve son 176/176 koşum geçti. Bu fixture sorunu ürün regresyonu olarak gizlenmedi; eski başarısız log final sonuç yerine kullanılmamalıdır.

Kanıtlar: gitignored `shift-exchange-deadline-{baseline,result}.json`, `shift-exchange-deadline-final-regressions.json`, `shift-exchange-deadline-parity.json` ve migration/test logları. Verifier Python derleme kontrolü geçti. AT26 çekirdek yerel durum LOCAL; G01–G10'un diğer teknik, gerçek UI/erişilebilirlik, insan UAT ve hosted/pilot kapıları açık kalır.

## AT40 — legacy geçiş raporunun temsili doğrulaması

`supabase/verification/shift_exchange_legacy_audit.sql` V2 artık tek JSON snapshot üretir: workspace/disposition sayıları, her eski talebin revision/status/participant_response bilgisi, eski shift ve source kimlikleri, mevcut ve beklenen owner, participant/event kimlikleri, aktör/zaman kanıtları ve exception talep listesi. Bu kimlikler izlenebilirlik içindir; oluşturulmuş yeni case/application mapping'i gibi sunulmaz. Not içerikleri rapora kopyalanmaz; kaynak history kayıtları değişmeden kalır.

Önceki rapor kayıp vardiyayı `employee_id is null` nedeniyle boş vardiya sanabiliyor; pending release sahibinin gerçekten aynı kişi olduğunu ve yayının güncelliğini kontrol etmiyordu. V2 önce aynı workspace içinde shift/publication çözümlemesini doğrular. Değişmiş iki taraflı sahiplik, eski/kayıp yayın, eksik rıza/receiver ve açık yeni case ile iki taraftan source çakışması ayrı exception üretir. Approved release sonrası gerçekten boş ve current vardiya `keep_open_shift_no_owner_restore` olarak kalır. Peer bekleyen ve kabul edilmiş swap ayrı inceleme sınıflarıdır; kabul edilmiş eski rıza yeni manager onayı sayılmaz. Terminal kayıtlar korunur; terminal stale/orphan da inceleme listesinde gösterilir.

Yeni `shift_exchange_legacy_audit_local.py`, yerel gerçek tablo tiplerinden oluşturulan geçici tablolarda **20/20** senaryoyu doğruladı; bunların **11'i exception**. Fixture kurulumu yalnız session temp tablolarına yazılır; rapor açık `BEGIN READ ONLY` içinde çalışır. Tüm altı kaynak tablonun before/after snapshot'ı eşit; ID sayıları/summary toplamı, eski sahibin atanmadığı boş vardiya, revision ve consent/event aktör-zaman kanıtları kontrol edildi. Orphan/cross-workspace bozuk kayıtlar yalnız temp fixture'dır; gerçek FK veya diğer korumalar kapatılmadı. Bu test sınıflandırma kanıtıdır, gerçek veri migration'ı değildir.

Asıl yerel tablolardaki ayrı READ ONLY dry-run **0 eski talep /0 exception** döndürdü; rapor `supabase/.temp/shift-exchange-legacy-audit-v2.json` altında. Ürün ataması, flag, migration ve UI bu dilimde değişmedi. Gerçek eski kayıtların dönüşümü/yeniden rıza akışı ve hosted rollout dry-run nedeniyle AT40 PARTIAL kalır. İnsan UAT ve pilot dahil genel goal açık.

## AT42 — çalışan staffing teklif kartı ve gerçek yanıt

Ortak `EmployeeLineupOffers` bileşeni ayrı dosya ve iki yüzeyde de yüklenen kapsamlı CSS ile güncellendi; `LineupQueue` eski export'u korur. Shift Hub ve Employee Line Up aynı query/teklif ID'sini kullanır. Shift Hub'dan `staffing_offer` parametresiyle ilgili Line Up kartına gidilir ve klavye odağı karta taşınır. Kapalı/erişilemeyen bağlantı neden uydurmadan açıklanır; gerçek `/app/employee-hub/schedule` ekranına bağlantı sunar. Saat tercihi parent'tan her iki yüzeye aktarılır; overnight etiketi ortak formatter'dan gelir.

Kart; rol, lokasyon, tarih, saat ve aksiyon gerektiren/bekleyen durumları ayırır. Koyu/açık tema, 44 px aksiyonlar, sarmalanan dar ekran düzeni, görünür odak ve sonuç live region vardır. Kabul yalnız employee consent'tir; manager confirmation öncesinde takvime eklenmediği hem başlangıçta hem sonuçta yazılır. Çift tıklama eşzamanlı ref kilidiyle engellenir. Sunucu başarısından sonra shared query cache accepted olarak güncellenir (decline satırı kaldırır); refresh hatası kaydedilmiş yanıtı tekrar actionable yapmaz. Son satır kaybolsa da confirmation kalır. Hata, loading, manuel retry, reconnect ve 60 sn refresh durumları eklendi; belirsiz status'larda accept/decline gösterilmez. İlgili workspace'in teklif, proposal, Hub ve inbox sorguları yenilenir.

**38/38** odaklı web testi: yeni offers 8 + Employee Line Up 8 + Shift Hub 22. Yeni senaryolar tek ID/deep link focus, çift tıklama, başarılı mutation sonrası read failure/retry, son decline/focus, başarısız response/fresh read, kapalı link, ilk yükleme/retry ve terminal status'tur. Son web typecheck ve hedefli ESLint geçti; diff whitespace kontrolünde hata yok.

[Gerçek browser kanıtı](shift-hub-visual-proof-2026-09-07/staffing-offers/README.md): yerel Alex oturumu, tek sentetik proposal, Shift Hub→Line Up→Tab/Enter accept; DB accepted ve published/shared snapshots hash eşitliği; 390 dark/320 light sonuç, 320 dark kapalı link ve gerçek Schedule varışı. Kabul sonrası klavye odağı sonuç mesajına geçti. Teklif yalnız test için doğrudan seed edildi ve kanıt sonrası cancelled yapıldı. Bu nedenle manager oluşturma/eligibility/final confirmation zinciri doğrulanmış sayılmaz; AT42 PARTIAL kalır. UI viewport/tema temizlendi, manager hesabı geri yüklendi; hosted/insan UAT/pilot açık.


## AT42 — gerçek manager/employee zinciri ve bulunan notification açığı

Yeni `shift_exchange_staffing_e2e_local.py` yalnız sahipli local workspace ve Auth/API ile çalışır. Bir open published shift seed edilir; teklif artık doğrudan seed değildir. Manager UI Find available staff→Alex/full eligible→Review impact→Send offer, employee Shift Hub→aynı Line Up proposal→Tab/Enter accept, manager Review & approve→yeniden preview→Approve & apply zinciri gerçek UI ile tamamlandı. Proposal pending/accepted iken owner null; employee token finalization HTTP403 ve DB değişmedi. Finalde tek confirmed proposal, published/live Line Up owner Alex, tek operation event. Employee Schedule'da aynı shift ID/9a–12p/Oct5 görüldü; share olmadığı için sahte snapshot üretilmedi.

Gerçek manager önizlemesinde klavye odağı body'ye düşüyordu. `LineupQueue.tsx` final review'a odaklanabilir bir başlık ekler; preview geldiğinde odak submit/body'deyse başlığa geçer, kullanıcı başka kontrole geçmişse odağı çalmaz. Browser'da H3 focus ve üç Tab→Enter final approval doğrulandı. **12/12** odaklı test: yeni manager 4 +offers 8; web typecheck ve hedefli ESLint geçti. İlk typecheck yeni testte Testing Library'nin desteklemediği `exact` parametresini yakaladı; kaldırıldı ve son typecheck/test yeşil.

**P0 entegrasyon açığı:** approval notification legacy `public.notifications` içinde oluşturuluyor, ancak yeni `notification_outbox` ve `notification_inbox_items` zincirinde karşılığı yok. Gerçek employee Notifications ekranı yeni sonucu göstermedi. İlgili notification için inbox0, proposal/operation outbox0 doğrulandı. Kaynak Line Up `lineup_operations_service` /`lineup_proposals_service` producer'larının legacy insert yolu; yalnız relay retry çalıştırmak var olmayan outbox olayını üretemez. Yeni producer entegrasyonu, catalog/audience/policy/action route ve idempotent retry kanıtı gerekiyor. Atama sonucu PASS, genel verifier `PARTIAL_INBOX_GAP` ve exit2: bildirim olmadan akış tamamlandı sayılmaz. AT42 PARTIAL/G07-G09 açık kalır.

[Görüntüler, UUID'ler ve kapsam](shift-hub-visual-proof-2026-09-07/staffing-e2e/README.md). Bu durum önceki doğrudan-seed teklif kanıtını gerçek UI chain açısından genişletir; hosted, concurrent two-session latency ve insan UAT yerine geçmez. Tamamlanmış local QA assignment/audit korunur; başka WIP ve hosted veri değiştirilmedi. Bir sonraki öncelik kanıtlanmış staffing→modern inbox boşluğunu kapatmaktır.


## AT42 — staffing modern inbox entegrasyonu ve gerçek sonuç bağlantısı

Önceki P0 staffing→modern inbox boşluğu yerelde kapatıldı. `20260909013000_lineup_staffing_notification_inbox.sql`, mevcut Line Up teklif/atama notification insertlerini ortak outbox/policy/recipient/inbox zincirine bağlar. Yeni inbox satırı özgün legacy notification ID’sini, oluşturulma ve read/dismiss zamanlarını kullanır; ikinci legacy bildirim yaratmaz. Tekrar enqueue aynı outbox ID’sini verir, tekrar projection 0 yeni satır üretir. Üç katalog tipi: yanıt/karar bekleyen teklif action_required; declined/cancelled/coverage_filled info; confirmed assignment info. Shared catalog, display, template/producer manifest ve migration parity testi güncellendi.

Teklif kabulü/reddi mevcut kapsamda manage+publish yetkili manager’lara bildirim üretir; manager iptali employee’ye sonuç üretir; başka teklif ile doldurma mevcut coverage_filled producer’ını kullanır. Güncel üyelik/çalışan, kaynak domain, teklif durumu/süresi/aday uygunluğu ve manager lokasyon kapsamı alıcı projeksiyonu, delivery ve inbox okumasında değerlendirilir. Inbox liste filtresi pagination öncesi uygulanır ve unread count ile aynıdır. Recipient projeksiyonu sonrası değişen notification tercihi delivery sırasında yeniden değerlendirilir. Kapanan aksiyonlar görünür inbox’tan kaldırılır. Manager assignment bağlantısı erişilebilen bir event lokasyonundan üretilir. Yeni iç fonksiyonlar browser/service RPC olarak açılmadı; mevcut relay servisi grant’i korundu.

Yeni `lineup_staffing_notification_inbox.test.sql`: **44/44 asıl yerel DB ve 44/44 izole DB**, migration ile aynı rollback transaction içinde. Gerçek propose/respond/confirm producer’ları, çoklu çalışan teklifi, teklif kabulünde owner’ın boş kalması, finalde published owner değişimi, manager onayı sonrası eski aksiyonun kaldırılması, diğer adaya closure, role/deep link, qualification/scope/expiry read-time kontrolü, opt-out-after-projection, legacy read state ve dedupe/dismiss retry doğrulandı. Cancel senaryosu üretim relay processor’ını da çalıştırır. İlk fixture çalışmasındaki workspace_role text cast hatası test verisinde düzeltildi; son 44 sonuç yeşil.

Aynı migration ile asıl DB regresyonları: **Exchange 176/176, Line Up 225/225, notification relay 28/28, preferences 8/8, function privileges 3/3**. Shared catalog **7/7** ve shared typecheck PASS. Migration iki yerel DB’ye kalıcı uygulandı; asıl DB migration history13000 kaydı ve PostgREST schema reload var. Paralel availability12001 zaten asıl DB’deydi; değiştirilmedi. Hosted rollout yok.

`shift_exchange_staffing_inbox_local.py` sadece sahipli AT42 workspace/event/confirmed proposal’ı kabul eder; tüm geçmişi backfill etmez. Önceki gerçek UI approval sonucunun employee ve manager toplam **iki** legacy bildirimini enqueue etti; sadece bu eventleri lease ederek gerçek local relay HTTP RPC’sini çalıştırdı. Employee inbox API sonucu aynı modern item/gerçek Schedule route; ikinci enqueue/projection duplicate0; atama/proposal/Line Up before-after eşit. Report `supabase/.temp/shift-exchange-staffing-inbox.json`: PASS. Önceki `shift_exchange_staffing_e2e_local.py verify` artık **PASS**.

Gerçek employee UI: Notifications içinde `Your assignment has changed` /`Assignment changes · Update`; View assignment → `/app/employee-hub/schedule`; aynı `07103822-a534-466f-a735-ac116e86fcf5` shift /Mon Oct5 /09–12 /QA Dining. Açma sonrası unread2→1. Bu tur UI kanıtı accessibility tree ve gerçek tıklama ile alındı; yeni screenshot/visual score iddiası yok. Manager oturumu geri yüklendi. AT42 PARTIAL kalır: önceki completed event’in hedefli onarımı, yeni baştan sona UI zincirinde kendiliğinden delivery veya P95 latency kanıtı değildir. İnsan UAT, hosted/pilot ve diğer G01–G10 kabul kapıları açık.

Son kontrol: web typecheck PASS; iki yerel DB’nin dokuz staffing/inbox fonksiyon gövdesi hash eşleşmesi PASS. UI’da okunduktan sonraki gerçek relay retry, read/seen/dismiss state’i korur ve duplicate0 üretir. Doküman güncellemesindeki Windows encoding hatası, audit dosyasının bu oturumdaki 17 başarılı patch geçmişinden UTF-8 olarak geri kurulmasıyla giderildi; 42 AT satırı korundu ve önceki sürüme göre yalnız AT42 satırı değişti.


## G07 / AT42 — staffing canlı güncelleme ve doğru tarihli Schedule

Canlı audit, Line Up staffing producer’larının mevcut Shift Hub broadcast kanalına sinyal vermediğini gösterdi. 14000 migration proposal insert/status ve operation insert için yalnız workspace invalidation üretir; yetkili API okumaları mevcut AppShell hook’u üzerinden iki hafta/lokasyon dahil ilgili prefixleri yeniler. Yeni hook testleri sadece cache invalidation ve reconnect/fallback sözleşmesini kanıtlar; veri broadcast’tan kopyalanmaz. Rol verisi veya atama içeriği yayınlanmaz. Rollback mesaj bırakmaz; no-op status gereksiz mesaj üretmez.

Gerçek employee Shift Hub açıkken ayrı manager API oturumundan 2 Kasım teklifi kart olarak geldi; UI accept sonrası manager bekleme/henüz Schedule’a eklenmedi açıklaması, owner null ve employee final403 doğrulandı. Auth timeout sırasında proposal accepted kaldı; health/current process recheck sonrası restart yapmadan devam edildi. Bu turda önceki IAB7/8 artık envanterde yoktu; yeni sahipli tab9 kullanıldı.

İkinci bulunan sorun: Employee Schedule date/day filtresi API’yi seçilen güne göre çağırmıyordu; bugünden +42 gün verisini filtreliyordu. EmployeeHubPage artık doğrulanmış seçili gün için o günün verisini ister, görünür başlık/alt açıklama o tarihi gösterir; bozuk tarih default pencereye döner. 15000 ile yeni staffing notification doğru local date/day linkini taşır; cross-date swap’ın iki kişisi aldıkları ayrı güne gider. Eski inbox linkleri/read geçmişi yeniden yazılmaz.

16 Kasım’da mevcut publication korunarak tek open shift seed edildi; teklif/kabul/son onay gerçek API’den. Önceden açık date/day Schedule önce boştu, manager finalinden sonra navigasyonsuz yeni9–12 satırı geldi. Otomatik producer’ın zaten oluşturduğu iki notification outbox kaydı scoped gerçek relay ile teslim edildi; employee inbox API ve gerçek UI linki aynı16 Kasım/aynıshift sonucunu gösterdi. Dedupe0, read state ve atama/Line Up snapshot korunması; E2E verify PASS. 9 Kasım unpublished publication preflight’ı hiçbir yazım yapmadan durdu; o yayın değiştirilmedi. 2 Kasım confirmed test kaydı da korunur; inbox teslimi o kayıt için bu tur yapılmadı.

Son doğrulama: **53/53 SQL (asıl DB), privileges3/3, 23/23 web (hook5 +EmployeeHub18), catalog7/7, web typecheck, hedefli ESLint PASS**. ESLint eski kullanılmayan test importunu yakaladı; yalnız import kaldırıldı. 14000 ve15000 asıl localde kalıcı/migration history/schema reload; izole DB/hosted’e uygulanmadı. İlgisiz WIP, production veya çalışan gerçek verisi değiştirilmedi.

[Ayrıntılı gerçek UI/UUID/zaman kanıtı](shift-hub-visual-proof-2026-09-07/staffing-realtime/README.md). Araç gözlem aralıkları8.937 ve13.069 saniyelik üst sınırlar verir; ilk render/commit latency/P95 olarak raporlanmaz. AT32/AT42 PARTIAL, G07/G09 ve genel goal açık: iki gerçek browser/iki hafta-lokasyon swap,30 ölçüm, gerçek reconnect/fallback süreleri, otomatik cron/batch teslimi, insan UAT ve hosted/pilot hâlâ gerekli.


## G07 / G08 — açık Line Up editoründe eski uygunluk önizlemesini kaldırma

Gerçek query-key auditinde `lineup-candidates` ortak refresh kapsamında eksikti; eklendi. Yeni Editor testi actual component + QueryClient + refresh fonksiyonuyla çalışır. Review artık source varlığı/revision, seçili aday/counterpart ve operation bağlamına bağlıdır: ilgili veri değişince eski review kalkar; aynı veriyle refetch korunur. Pending/error read sırasında final/offer engellenir; geç preview cevabı kullanılmaz. Gerekçe/seçim korunur, başka kontrolün odağı çalınmaz.

Gerçek manager browser: Drew16–22 için Alex eligible → Review impact → Cancel focus. Ayrı manager API ile Alex17–18 assignment oluşturulduğunda açık editor yenilemesiz Alex'i disabled/ineligible gösterdi; eski Confirm/Send offer kalktı, gerekçe ve Cancel focus korundu. Yalnız yeni test assignment'ı manager release API ile geri alındı; open need/audit korunur. Mevcut iki assignment entry'si önce/sonra eşit. Cleanup ilk preview'da hatalı employee alanını reddetti; düzeltilmiş null payload fresh preview/apply ile geçti. Sonraki browser sayfa değişiminin nedeni doğrulanmadı; önceki açık-editor AX kanıtı ayrı tutuldu.

**20/20 focused web test** (Editor7 + realtime5 + queue4 + placements4), hedefli ESLint ve diff whitespace PASS. Genel web typecheck bu tur FAIL: ilgisiz `EmployeeDrawer.test.tsx:228` queryByRole seçeneklerindeki `exact` TS2769. Paralel WIP dosyasına dokunulmadı; genel typecheck yeşil sayılmadı. Yeni migration/deploy yok.

[Kanıt ve test kimlikleri](shift-hub-visual-proof-2026-09-07/staffing-editor-refresh/README.md). AT32 PARTIAL; AT35 yerel kapsamı genişledi. G01–G10 goal aktif; iki browser/iki hafta-lokasyon swap,30 hız ölçümü, insan UAT ve hosted/pilot dahil açık kapılar tamamlandı sayılmaz.


## G07 / AT32 / AT36 — gerçek çoklu ekran ölçümü ve Schedule giriş aksiyonu

Üç bağımsız Chromium context normal manager/Alex/Blake UI girişleriyle çalıştı. İki farklı hafta/lokasyon için yalnız sahipli başlangıç vardiyaları seed edildi; ilk Line Up share ve tüm swap create→peer accept→manager preview/final gerçek API. İki manager Schedule haftası, iki manager Line Up günü ve iki çalışanın iki günlük Schedule ekranı, toplam8 açık yüzey. Her accept sonrası iki owner aynı kaldı; final sonrası beklenen iki yeni owner API ve DOM'da doğrulandı.

1 keşif takası ardından30 ardışık ölçüm: **P95 upper bound971 ms, max1053 ms, min540 ms**. Observer'lar final isteğinden önce kurulur; command-start→son DOM gözlemi commit→visible için konservatif üst sınırdır, DB commit timestamp ölçümü gibi sunulmaz. Offline tümcontextlerde eski owner korunur; gerçek online sonrası **785 ms**, navigation0. Ayrı realtime-kapalı koşumda115 engellenmiş websocket girişimi/changed0; gerçek HTTP fallback **26186 ms**, navigation0. Üç koşumda pageerror/HTTP>=400 kayıtları0. İlk harness empty-list visible beklentisi ürün hatası değildi; attached olarak düzeltildi ve o denemede takas olmadı. Son verifier exit0/owned browser cleanup; kullanıcı sekmeleri etkilenmedi.

Toplam33 final swap sonrasında iki scope'ta34'er immutable snapshot. Tüm68 sürümde tek doğru owner, canlı owner son sürümle aynı; önceki66 içerik değişmedi. Test kayıtları/audit korunur, hosted veya yeni migration yok. Sekiz yüzeyin sonucu Employee Line Up/My Team/exchange/inbox P95'i olarak genişletilmedi; AT32/AT36 PARTIAL, G07 OPEN.

Görsel proof'ta Schedule cover/swap linkinin padding/touch target'ı yoktu. `hub-exchange-link`44 px, ikon, light/dark renkler, focus ve mobil tam-satır aksiyonu getirir.6 gerçek browser ölçümü320/390/1440 ×2 controlled root theme:44 px, yatay taşma0, focus2 px; text contrast7,43/9,70. İleri tarihli source linki artık from/to gününü de taşır; gerçek Enter→15 Aralık/6–7/Patio doğru cover-swap dialogu ve sorumluluk metni görüldü. Yeni ilan gönderilmedi. EmployeeHub18/18, web typecheck, hedefli ESLint/diff whitespace ve script syntax PASS. Önceki EmployeeDrawer typecheck hatası güncel koşumda yok; dosyaya bu işte dokunulmadı.

[Ölçümler, kimlikler, görseller ve kapsam](shift-hub-visual-proof-2026-09-07/multisurface/README.md), [sanitized zaman kanıtı](shift-hub-visual-proof-2026-09-07/multisurface/timings.json). Sonraki doğrudan teknik açıklar: Employee Line Up ileri-gün/deep link penceresi; current1 assignee /awaiting read2 ayrımının incelenmesi; diğer yüzeylerin aynı gerçek ölçüme alınması. Notification delivery/cron, UI lost-response, human UAT/device/reader ve hosted pilot ayrıca açık. Genel goal aktif, tamamlanma puanı eklenmedi.

## G07/G08 — Employee Line Up tarihi ve12 yüzey doğrulaması

İleri-gün penceresi kapatıldı: çalışan Line Up gerçek URL gününü okur; geçerli takvim tarihi parser'ı, Show day/Upcoming, seçili-gün boş durumu ve Schedule ↔ Line Up tarih aktarımı eklendi. Tarih input'u kendi query yüklemesi boyunca yerinde kalır; uygulanmamış draft refetch ile silinmez. Browser'da Upcoming→hızlı Back, URL doğru olsa bile eski input tarihini bırakıyordu. Gezinme hedefini erkenden state'e yazmak kaldırıldı; uygulanan tarih URL'den, edit yalnız bulunduğu güne bağlı draft'tan türetilir. Autocomplete denemesi işe yaramadı ve kaldırıldı; sorun browser restoration diye açıklanmadı.

Gerçek tarih turu:8/8 görünüm (320/390/768/1440 × controlled light/dark),44 px kontroller, taşma0, görünür klavye odağı; Enter uygulama, Upcoming/Back, Schedule round-trip PASS; receipt POST0.320 dark ve1440 light görsel olarak incelendi. EmployeeLineup12/12, helper6/6, parent tarih3/3, web typecheck/hedefli ESLint/script syntax/diff whitespace PASS. Parent tüm-dosya19/20: kapsam dışındaki dashboard `TODAY’S SHIFT` beklentisi başarısız; genel suite yeşil sayılmaz. Paralel dashboard/time-off değişiklikleri korunur; yalnız kullanılmayan FormEvent import'u temizlendi.

Önceki8 yüzeye her iki çalışanın iki Line Up günü eklendi. İlk12 yüzey koşumu23 başarılı final sonrası erişim hatası/HMR/runtime değişimiyle kesildi;30 örnek diye kullanılmadı. Yarım kalan aynı case peer rızasından sürdürülüp916 ms'de tamamlandı; tekrar case yaratılmadı. Yeni kesintisiz30 ölçüm **P95 üst sınırı931 ms; max1038; min626**. Her örnekte12 DOM sonucu, iki API owner ve iki yeni published snapshot sürümü doğrulandı. Offline→online12 yüzey **1037 ms**; realtime kapalı gerçek HTTP fallback **54055 ms**, sample changed0/navigation0. İki final raporda HTTP≥400/pageerror/command failure0; owned browser cleanup/exit0. Command-start üst sınırı gerçek DB commit timestamp'i diye sunulmadı.

Kalıcı verify **180/180 snapshot**, tek doğru owner ve önceki68 içeriğin aynılığı; iki canlı atama son sürümle aynı. Yalnız sahipli local QA, tarihçe korunur; migration/deploy yok. [Tarih UX kanıtı](shift-hub-visual-proof-2026-09-07/employee-lineup-dates/README.md), [12 yüzey ayrıntıları](shift-hub-visual-proof-2026-09-07/multisurface/README.md), [zaman/veri kanıtı](shift-hub-visual-proof-2026-09-07/multisurface/timings-12-surfaces.json).

AT32/36/37/38 ve G07/G08/G10 nihai kapıları açık: My Team/exchange/inbox aynı ölçümde yok; current assignment ile eski kişiye değişim acknowledgement ayrımı, bildirim cron/delivery, UI lost-response/hidden tab, native reader/device, gerçek insan UAT ve hosted/pilot tamamlandı sayılmaz. Sonraki teknik iş bu kalan yüzey/teslim tutarlılığı ve rol/uygunluk varyantlarıdır. Goal aktif.


## G09 / AT11 / AT33 / AT34 — gerçek batch, sonuç matrisi ve cron tanımı

`shift_exchange_batch_local.mts` üretim worker ve Fastify cron handler'ını, network=none sahipli replay DB'nin ayrı kopyalarında çalıştırır. Psql yalnız RPC transport adaptörüdür; gerçek SQL lease/process/fail/maintenance ve inbox fonksiyonları kullanılır. Manuel tek-event lease yok. Main DB'ye yazılmaz; source replay50 outbox korunur. Dokuz teslim fonksiyonu main ile CRLF→LF dışında aynı; tüm şema parity iddiası değildir.

Son koşum **9 kontrol /16 batch PASS**: baseline kopya eventlerini tüketen2 çağrı ayrı;3 aday tek manager görevi;4 final eventte kontrollü tek inbox hatası sonrası3 teslim/1 retry; gerçek1 sn backoff sonrası1 teslim; empty repeat leased0/duplicate0. Case, published shift, Line Up entries ve **2 gerçek shared snapshot** teslim hatası/retry öncesi-sonrası aynı. Finalde owner/winner ve seçilmeyen iki adayın mesajı ve case linkleri doğru; manager görevi kaldırılır.

Direct decline ve accept→withdraw: owner değişmez; hedef daveti/manager görevi doğru anda var, kapanınca kaldırılır; owner doğru sonucu alır. Tek manager reddi diğer adayı pending bırakır ve kart1 candidate olur; owner close önceki reddi korur. Recipient projection sonrası job assignment'ı biten ve membership'i suspended olan iki adaya fırsat gitmez; uygun üçüncüye gider. Sıfır başvurulu close yeni outbox event olmadan fırsatı kaldırır. Fixture eksikleri (close gerekçesi, event→recipient projection sırası ve üyelik enum'u) düzeltildi; önceki başarısız raporlar saklandı.

`vercel.json` mevcut API rewrite'ını koruyarak `/api/internal/cron/notification-outbox` için dakikalık cron ekler. Gerçek adapter kaynak kodu ve config hedefi `/internal/cron/notification-outbox`/Authorization korunması için kontrol edildi. Worker6+app cron-gate1 **7/7**, API typecheck ve diff whitespace PASS. Product worker/SQL bu tur değiştirilmedi; yeni migration/deployment yok.

Dakikalık Vercel cadence Pro/Enterprise gerektirir; bağlı proje connector403 nedeniyle hesap planı/production secret/cron kaydı/log doğrulanamadı. Config hazırdır, hosted otomatik teslim kanıtı değildir. Preview/local server cron'u kendiliğinden çalıştırmaz. Mevcut stack üstünde alternatif scheduler aynı secret-gated handler'ı çağırabilir; herhangi bir abonelik veya dış kanal açılmadı. **Dakikalık recovery, G07 canlı inbox P95≤3 sn hedefini karşılamaz.** Sonraki teknik öncelik anlık teslim tetikleme ve gerçek inbox/realtime ölçümüdür; G07/G09 açık.

[Batch sonuçları ve kapsam](shift-hub-visual-proof-2026-09-07/notification-batch/README.md), [9 kontrol/16 batch raporu](shift-hub-visual-proof-2026-09-07/notification-batch/result.json). Failure trigger yok; sahipli izole container başlangıçtaki stopped durumuna geri döndürüldü. Test kopyaları/audit korunur; diğer yerel runtime'lar değiştirilmedi. AT11/34 PARTIAL; AT33 yerel kapsamı genişledi; genel goal aktif, insan UAT/hosted/pilot açık.


## G07/G09 — Anlık teslim,15 ekran ve Auth bağlantı yükü

20000 migration ve API follow-up: manager/domain komutu kalıcılaştıktan sonra yalnız dönen case/workspace için outbox teslimi; aynı toplam2 sn içinde kısa dilimler. Delivery failure/timeout başarılı atama kararını hataya çevirmiyor. Mevcut lease/retry/recipient policy korunur. Teslimden sonra içeriksiz workspace sinyali yayınlanır; transaction içinde coalescing vardır. Gerçek iki bağlantıda busy case beklenmeden atlandı, outbox aynı kaldı. Ana local yeni27 + staffing53 + privileges3 = **83/83**; izole exchange176 PASS. Eski provider mesajlarını sayan staffing testi daraltılınca53/53. İzole eski16 trigger EXECUTE farkı ayrı kayıtlı; main privilege3/3.

15 ekran serilerinde gerçek Auth `/user`500/DB `cannot assign requested address` açığa çıktı. Paylaşılan runtime PID değişimi ilk varsayımdı; sabit API'de de tekrarlanınca kök neden provider bağlantı hatasına indirildi. Auth container'ı değiştirilmedi. Workspace resolver aynı token'ın sadece devam eden getUser isteğini paylaşır; completion/rejection sonrası kayıt silinir. Workspace/role/location her requestte yeniden okunur. Provider500/429/network artık geçici503; gerçek401 erişim reddi. Resolver16 + service9 + routes6 = **31/31**, API typecheck/hedefli ESLint PASS.

Sabit local web/API derlemesi, normal üç UI oturumu, iki hafta/lokasyon,15 görünür Schedule/Line Up/inbox ekranı. Bir resumed warmup hariç **30 yeni ardışık takas: P95 command-start üst sınırı1046 ms, min627, max1099**. Her örnekte peer kabulü sonrası owner aynı; final sonrası15 DOM, iki owner ve iki snapshot sürümü doğru. Manager review önceden gerçekten görünür; sonra kalkar, iki çalışan tekil onay sonucu alır. Reconnect **704 ms**, offline owner/inbox korunur. Realtime kapalı ayrı koşum **59850 ms**,89 engellenmiş WS, changed0/navigation0. Son iki raporda HTTP/pageerror/command failure0; kesintili üç önceki koşum saklandı,30 pass diye birleştirilmedi.

Son DB:33 case completed,66 terminal employee item, duplicate0, manager review0. **310/310 doğru snapshot**, önceki306 immutable içerik aynı; daha önceki ara kontrol180 eski snapshot'ı korudu. Yeni20000 local migration history/schema reload tamam; hosted değişiklik yok. Owned browser/5560–5561 test listener'ları kapalı; izole container eski stopped durumunda. İlgisiz WIP/Auth/main dev runtime korunur.

[Anlık teslim, kaynaklar, kesintiler ve ölçümler](shift-hub-visual-proof-2026-09-07/immediate-inbox/README.md). G07/G09/G10 açık: diğer rol/cover varyantları, My Team/exchange detayları, staffing command fast path, görünür generic safe-preview metninin vardiya/sorumluluk bağlamı, UI lost-response/hidden tab, insan UAT/native reader ve hosted/pilot. Tasarım incelemesi generic bildirim metnini yeni UX işi olarak kaydetti; delivery geçmesi mesaj anlaşılabilirliğini tamamlamaz. Genel goal aktif; kapanış puanı eklenmedi.


## G07/G09/G10 — Bildirim ayrıntısı ve güncel sorumluluk

Generic preview için açılır, yetkili ayrıntı eklendi: gönderildiği andaki mesaj ile güncel talep/iki vardiya sorumlusu ayrıdır. Mobil tek, geniş ekranda iki kart; tarih/yıl/saat/job/lokasyon/saat dilimi, doğru Schedule ve request bağlantıları. Cover/iki taraflı swap/gerçek open pickup sorumluluk metinleri ayrıdır. Publication yoksa geçmiş etiketlenir; missing API bayrağında güncel owner varsayılmaz. Private not/diğer aday/gerekçeler görünmez. Tek panel açılır; açmak mutation/read-mark yapmaz. Bağlantı mevcut okundu davranışını kullanır. Ortak query refresh güncel kişiyi getirir.

22000 migration read-service'e requested_current_published ekler; mevcut yetki/atama davranışı korunur. Main local kuruludur; izole replay ve hosted değil. Yeni SQL12 + privilege3 **15/15**; archived ortak seed kayıtları yerine rollback içinde sahipli fresh referanslar. Yeni bileşen **10/10**, web typecheck/hedefli lint/scripts/diff whitespace PASS; önceki8 test aşamasında diğer26 regresyonla34/34.

Sabit local web-v3/API, normal3 oturum. Manager+employee için320/390/768/1440 ×2 tema ve iki390px/200% text = **18/18**. Yatay taşma0, linkler44/48px, görünür keyboard focus. Açma mutation0; gerçek8 Aralık Schedule bağlantısı doğru kişisel vardiyayı gösterdi. Pending QA swap yalnız peer kabulüne kadar ilerledi, owner sonra iptal etti; Alex/Blake ve155/155 snapshot sürümleri korundu. HTTP/pageerror/command failure0. V1 görsel incelemedeki fazla mobil boşluk ve desktop ortalama düzeltildi; final mobil/desktop gözle de incelendi. Owned browser ve5560/5561 kapanmıştır; main dev/Auth/ilgisiz WIP korunur.

[Son18 durum, ekranlar, kaynak hashleri ve kapsam](shift-hub-visual-proof-2026-09-07/notification-details/README.md). AT34/37/38 PARTIAL, G07/G09/G10 ve genel goal açık. Bu yeni panel insanın sorumluluğu anladığını kanıtlamaz. Sonraki teknik dilim staffing command anlık teslimi ve My Team/exchange detail yayılımı; diğer role/eligibility/recovery varyantları, native reader/human UAT ve hosted/pilot kapıları sürer.


## G07/G09/AT42 — Staffing komutundan anlık inbox teslimi

Line Up propose/respond/confirm/cancel ve apply başarılı domain commit sonrası scoped staffing flush'a bağlı.23000 service-only migration: teklif/operation ve aynı confirmation transaction'ında kapanan rakiplerin sonuçları; başka pending teklif/workspace tüketilmez. Mevcut policy/retry/lease/processor/content-free realtime korunur.1sn bounded dilimler, toplam API2sn; delivery failure karar sonucunu bozmaz. Main local kurulu; hosted/izole replay kurulumu yok.

**70/70 API** (yeni16+rollout4+HTTP41+exchange9), typecheck/hedefli lint PASS. **24 yeni SQL +3 privilege =27/27**: owner/onay sınırı, other offer scope, competitor closure, kontrollü inbox failure/retry/dedupe, aktif/expired lease. Gerçek ayrı bağlantıda926 kilidi tutulurken flush365ms busy/leased0 ve outbox aynı; unlock sonrası1 processed, sahipli teklif API cancel ile kapalı.

Normal iki UI login/sabit local bundle/5 açık yüzey. Teklif487ms, UI accept356ms, manager final716ms command-start üst sınırları; **tek akış, P95 değil**. Finalde5 ekran doğru, navigation/HTTP/pageerror0; gerçek bildirim linki21 Aralık doğru kişisel shift'e gider. Tek owner+entry Alex; shared snapshot önce/sonra0, duplicate inbox0. İlk harness yanlış view parametresi nedeniyle timeout oldu; yalnız kendi pending teklifi manager API ile iptal edildi, yeni doğru hub_view koşumu ayrı geçti. İlk external-package bundle import hatası süreç terminali doğrulandıktan sonra proje bundle yöntemiyle düzeltildi; Auth/main dev restart yok.

[Akış, kilit, DB son durumu ve sınırlar](shift-hub-visual-proof-2026-09-07/staffing-immediate/README.md). AT42/32 PARTIAL, genel goal aktif. Staffing30 örnek/reconnect/fallback, My Team/exchange detail ve kalan recovery/role varyantları sürer. Ekrandaki anlık list67/sidebar66 farkının kalıcı olup olmadığı/süresi ölçülmedi; generic staffing safe-preview ve human/native/hosted kapıları açık. Owned browser/5560–5561 kapatıldı; diğer WIP/runtime korundu.


## G02/G07/G08 — My Team vardiya aksiyonu ve19 ekran

Plan115 My Team→kendi shift detayı adımı mevcut roster-only sayfada yoktu. Yeni Working together: URL günü, lokasyona göre published ekip vardiyaları, timezone, kendi satırında You + aynı shift_id/from/to cover/swap linki; teammate'te aksiyon yok. Rehber korunur, private not gösterilmez. Yeni gün yüklenirken tarih kontrolleri yerinde; refetch draft'ı silmez; gerçek Back ve Schedule round-trip doğru. Query prefix mevcut realtime kapsamındadır.7 component +22 parent test PASS; son typecheck/hedefli lint/build/diff PASS. İlk ilgisiz ScheduleRequestsPage tip hatası finalde yok; o dosyaya dokunulmadı.

Üç gerçek oturum,19 açık yüzeyde **30 yeni swap P95 üst sınırı1384ms**, min824/max1913. Her peer accept sonrası owner aynı, final sonrası19 DOM veiki snapshot sürümü doğru. Reconnect943ms, offline owner/inbox korundu/navigation0. Websocket kapalı gerçek fallback59688ms, changed0; tüm32 örnekte HTTP/pageerror/command failure0. Son **374 snapshot** tek doğru owner; önceki372 immutable içerik korunur (ara kontrolde310).

18 gerçek My Team görünümü:320/390/768/1440 ×2tema ×2employee +2text200%; kontroller≥44px, yatay taşma0, focus görünür. İlk ölçümler geçmesine rağmen320px My schedule kelimesi görselde bölünüyordu; ayrı satır yapıldı. Dark metadata/dateicon düzeltildi; final18 tekrar PASS ve mobil/dark gözle incelendi. Gerçek Enter→doğru shift cover dialogu ve sorumluluk metni; ilan gönderilmedi. Yeni migration/deploy yok.

[My Team ekranları,19 yüzey ölçümü ve sınırlar](shift-hub-visual-proof-2026-09-07/employee-team/README.md). G07/G08/G10 ve genel goal açık. My Team bu tested swap kapsamına alındı; sıradaki doğrudan açık talep detayının iki güncel owner/publication semantiği ve yayılımı. Staffing30 örnek, diğer role/eligibility/recovery, native device/reader, human UAT/hosted/pilot sürer. Owned browser/listener cleanup tamamlandı; shared dev/Auth/ilgisiz WIP korundu.


## G07/AT32 — Talep geçmişi ve iki güncel sorumlu

Talep ve notification detail ortak publication-aware owner bileşeni kullanır. İki swap kartında gerçek güncel sorumlu; kaldırılmış/eksik publication historical güvenli metni; kapalı takasta First/Second shift ve daha sonraki atamaları açıklayan metin. Geçmiş onay eski kişiyi güncel sorumlu yapmaz. Gerçek open pickup başlığı ayrılır.37/37 odaklı UI, hedefli lint/build/script syntax/diff PASS. Global web typecheck paralel ScheduleRequestsPage.test.tsx:174,179 exact/TS2769 hatasıyla FAIL; dosyaya dokunulmadı.

Normal üç UI login, manager/source/counterpart × history/pending =6 açık detay gerçek manager final sonrası doğru iki owner gösterdi; peer kabulünde sahipler aynı, navigation/HTTP/pageerror0.18 tema/boyut/text layout kontrolü PASS, taşma0/200% owner font30px; manager320 light, employee390 text200 ve historical-after görselleri incelendi. Tam keyboard/native reader/human UAT değildir. Tek command-start üst sınırı4374ms: G07≤3sn hedefi karşılandı sayılmaz, P95 değil.

İki önceki harness hatası saklandı: eksik idempotency header400 atama değiştirmedi; eksik manager tab parametresi peer sonrası timeout oldu. Aynı sahipli case sürdürülüp tamamlandı.376 doğru snapshot, önceki374 içerik aynı; final Blake/Alex. Yeni migration/deploy yok. [Kanıt ve açık işler](shift-hub-visual-proof-2026-09-07/exchange-assignments/README.md).

Yeni bulgu: Aralık filtresinde Ekim tarihli invalidated geçmişler görünür; Hub tarih predicate eksik, read service raw-open kayıtları aralık dışında seçer. Sonraki teknik öncelik tarih filtresi doğruluğu ve detail okuma/render gecikmesi. Bu kayıtların gecikmeye etkisi henüz kanıtlı değildir. G07/G08/G10/genel goal aktif; diğer varyantlar, native/human/hosted/pilot açık. Sahipli browser ve5560/5561 listener cleanup tamamlandı; shared runtime ve ilgisiz WIP korundu.


## G07/G08/AT32 — İki yönlü tarih filtresi ve25 yüzey

Tarih, lokasyon ve arama filtreleri takasın aynı tarafında birlikte eşleşir. İki tarih sınırı dahil; karşı vardiya eşleşirse kart o günü Requested in return ile gösterir. İki lokasyon filter seçeneklerinde, manager ready sayısı aynı scope'ta. Yetkili focused case filtre dışında ayrıntıda kalır ve açıklanır; listeye sızmaz.24000 reader migration closed swap'ı return/current moved date ile bulur; unpublished snapshot tarihine döner. Tek response içinde repeated source okumaları paylaşılır, sonraki request fresh kalır; card date formatter tekrar kullanılır.

Yeni14 SQL'in eski reader'da6 FAIL→14 PASS; publication12/privilege3 ile29/29. Üç rolün in-range JSON alanlarında tam parity; scope, applicant/privacy ve current owner aynı. Tek read karşılaştırması manager1626→850ms, employee901→795, counterpart1058→702; P95 değil. Yeni6 UI ile43/43; heading count assertion son33 Hub koşumunda da PASS. Web typecheck/hedefli lint/build/syntax/diff PASS. Main local security advisor error0; migration history/list24000 doğrulandı. İzole/hosted kurulumu yok. İlk SQL harness cancel action→close/reason; ilk migration terminator syntax rollback→düzeltme; hatalar saklandı.

Gerçek manager+employee filtre turu: return date+lokasyon+isim, eşleşmeyen isim, klavye Enter→case, Şubat2027 aralığında aynı detail/iki owner korunur; UI POST0/error0.8 ek320/1440 light/dark görünüm taşma0; manager320 light veemployee1440 dark gözle incelendi.

25 yüzey: önceki19'a manager/source/counterpart geçmiş+açık case detail6 eklendi. İlk30 doğru ama pending manager route hub_view=requests yanlışqueue olduğundan nihai kanıt yapılmadı (P952916ms). Doğru ready ile yeni30:25 DOM/two-owner/two-version PASS, navigation/error0; **P95üst4313ms,min2477,max5079 →3sn kapısı FAIL**. Reconnect6091ms→5sn FAIL; offline owner/inbox korunur. Realtime engelli gerçek fallback59889ms→65sn PASS,387blockedWS/changed0. Verifier PASS etiketleri doğruluk içindir; goalSummary hızları ayrı false/true kaydeder.

Yeni gecikme kanıtı: tek final için45–220ms arayla iki changed sinyali ve iki GET;5079ms örnekte ilk2818ms, ikinci4648ms. Hook her sinyali hemen invalidate ediyor. Sonraki teknik iş kısa sinyal kümelerini birleştirme ve devam eden fetch sırasında yeni değişimin kaçmamasını sağlayan takip refresh; sonra25 yüzey/30+reconnect+fallback tekrar. Kök gecikmenin tamamının tek nedenden geldiği iddia edilmez.

Son500 snapshot tek doğru owner; önceki376 immutable içerik aynı.62 gerçek QA takası/124 snapshot audit korunur; finalBlake/Alex. [Kanıtlar ve açık hız kapıları](shift-hub-visual-proof-2026-09-07/exchange-range/README.md). G01–G10 genel goal aktif; native reader/device, human UAT ve hosted/pilot açık.

Sahipli browser ve5560/5561 listener cleanup tamamlandı; shared dev/Auth ve ilgisiz WIP korundu. Kaynak manifesti mevcut dosyalarla eşleşir, whitespace kontrolü PASS.


## G07 — Yenileme birleşimi ve case koleksiyonu

useExchangeRealtime ilk sinyalden250ms sonra refresh başlatır; burst pencereyi uzatmaz. Devam eden hook refresh sırasında gelen sinyal bir takip okumaya dönüşür; overlap/yutulmuş commit yok. Hidden/offline, workspace/unmount cleanup, batch error ve60sn fallback korunur.11 hook +33 Hub +10 notification =54/54; gerçek QueryObserver testinde eski Alex read sürerken Blake commit gelir, yalnız tamamlandıktan sonra takip read başlar ve finalBlake; maxactive1. Typecheck/hedefli lint/build PASS.

Coalescer-only25 yüzey30: P953489ms (3sn FAIL), reconnect4025ms (5sn PASS), fallback59478ms (65sn PASS). İki changed artık çoğunlukla tek GET; kalan ağır okuma ayrıştırıldı.284 kayıt yetki projection10.327ms; distinct2.979ms, ana maliyet olmadığından permission cache eklenmedi. Temp array probe ilk3 çift değişkendi; sırası dönüşümlü8 çiftte JSON aynı285 case/868155byte, nativearray217–279ms vs JSONBconcat423–786ms. İlk sonuçlar saklandı; profil browserP95 yerine kullanılmadı.

27000 migration case JSONB'lerini native array_append ile biriktirip sonda to_jsonb döndürür. Aynı imza, aynı ACL/actor checks, aynı source freshness/order/payload. Üç rolün tam modelleri eskiyle eşit (285/285/284 case). Empty array/iki-case order/null counterpart eklenince reader19+publication12+privilege3=34/34; local security advisor error0. Main local kurulu/history kayıtlı; izole replay/hosted kurulmadı.

Nihai aynı25 ekran30 yeni swap: **P95üst2056ms,min1382,max2316 →3sn PASS**. Her peer kabulünde owner aynı; final25 DOM/two-owner/two-version doğru. **Reconnect2193ms→5sn PASS**, offline owner/inbox korunur. **Gerçek websocket kapalı fallback59964ms→65sn PASS**,389blocked/changed0. Her iki raporda navigation/error/command failure0. Ara30 bu seriye karıştırılmadı; command-start üst sınırı DB commit timestamp diye sunulmadı. Yeni görsel tasarım değişimi yok; önceki ekran matrisi yerine yeni screenshot puanı eklenmedi.

Son628 snapshot tek doğru owner; önceki564 immutable, ara kontrol500 eski kaydı da korudu.64 gerçek QA takası/128 yeni snapshot audit'i korunur, finalBlake/Alex. [Kaynak, profil ve nihai kanıtlar](shift-hub-visual-proof-2026-09-07/exchange-refresh/README.md). G07 local25-yüzey swap zaman kapıları geçti; globalG01–G10 goal aktif. Sonraki teknik iş staffing ve kalan karar/rol/recovery varyantları; native reader/device, insan UAT ve hosted/pilot açık.

Sahipli browser/5560/5561 cleanup tamamlandı.27000 yerel history/schema ve EXECUTE kısıtı finalde tekrar doğrulandı. Kaynak hashleri/whitespace PASS; shared dev/Auth ve ilgisiz WIP korundu.


## AT08 — İki manager aynı talebi sonuçlandırırken

Açık karar dialogu başka manager finalinden sonra güncel published owner ve sonucu gösterir; eski onay/ret/kapatma eylemi kaldırılır. Taslak not korunur, gönderilmediği açıklanır. Tek ana eylem View latest result; Enter sonrası odak sonuç başlığına döner. Swap iki kart; cancelled/expired/invalidated ayrı açıklama, publication yoksa historical bilgi. Yedi yeni kontrol dahil41/41 UI; typecheck/hedefli lint/build PASS.

İki ayrı manager, owner veüç aday normal UI login. İlk manager karar verirken diğerinin açık notlu penceresi güncellenir; ayrıca iki gerçek UI POST bariyerde birlikte bırakılır:tek200/tek409. Nihai iki akış781ms ve499ms üst sınır; not/sonuç/odak doğru, navigation0/beklenmeyen HTTP/pageerror0. İlk işlevsel tur766/511ms ayrı saklandı; dört gerçek case audit'i korunur. P95/hosted iddiası yok.

READ ONLY DB:dört case'in her birinde bir approved, iki closed_other_selected, tek doğru manager transfer olayı ve başarılı approve komutu. Kaybeden manager notu gönderilmedi, paylaşılmamış günlerde snapshot0. Önceki628 snapshot aynı ve her sürümde doğru tek owner. Yeni migration/deploy yok.

Nihai9 görünüm:320/390/768/1440×light/dark+390text200. Taşma0, düğme≥44px, kontrast≥7,16:1, büyük owner font30px. Tema geçişinde alınmış eski ekranlar nihai kanıttan ayrıldı; gerçek hedef renk beklenip ölçüldü. Son mobil/light, desktop/dark ve text200 gözle incelendi. [Kanıtlar ve kaynaklar](shift-hub-visual-proof-2026-09-07/two-managers/README.md). AT08 LOCAL; kapsamları ayrı iki manager oyu, direct-cover browser, eligibility/recovery/staffing varyantları, native reader/gerçek cihaz, insan UAT ve hosted/pilot açık. Genel goal aktif.

Owned browser ve5560/5561 cleanup tamamlandı; shared dev/Auth/ilgisiz WIP korundu. Kaynak manifesti ve whitespace/syntax PASS. Sıradaki doğrudan cover rol görevi ve kalan uygunluk/teslim/recovery kanıtları.


## AT11 — Doğrudan cover, dört sonuç ve güncel mesaj

Üç gerçek normal UI login; owner doğrudan davet oluşturur, recipient decline veya accept→withdraw, manager reject veya final approve. İlk dört görev geçti. Manager rızadan önce final veremez; kabul Schedule’a atama eklemez. Üç inbox/Hub açık; finalde ayrıca iki çalışan Schedule ve manager Line Up canlı güncellenir. Özel notlar ayrılır; paylaşılan ret gerekçesi görünür. Ret/withdraw sonrası owner yeni arama ekranını açar; final recipient inbox bağlantısı doğru case ve owner’a gider.

Görsel bulgu: önceki kabulün “final manager approval gerekir” başarı mesajı Approved durumunun üstünde kalıyordu. Mesaj case ID/revision/status’a bağlandı; daha yeni sonuç eski mesajı kaldırır, unrelated case güncellemesi kaldırmaz, pending refetch sırasında komutun authoritative sonucu korunur. Cancelled için doğru kapanış açıklaması. Üç yeni regresyon dahil44/44 UI, typecheck/hedefli lint/build PASS. Typecheck’te testin desteklenmeyen exact seçeneği yakalanıp düzeltildi.

Düzeltme sonrası iki yeni gerçek decline/approve tekrarı: davet1343/1312ms, kabul1215ms, ret1109ms, final1474ms tekil command-start üst sınırları; P95 değil. Eski notice yok, tüm3 Hub terminal durumları doğru. Her iki raporda navigation0/beklenmeyen HTTP/pageerror0. İlk4+son2 audit korunur. READ ONLY DB6 case: doğru aktörler/tek application/terminal statüler; yalnız2 manager onayı owner değiştirir. İki günün share v1 Alex/v2 Blake; diğer4 gün snapshot0. Önceki628 snapshot aynı.

İlk11 ve nihai6 adet390px görünümde taşma0; light/dark davet/ret/onay görselleri incelendi. Tam native reader/viewport/kontrast matrisi değildir. [Kanıt ve sınırlar](shift-hub-visual-proof-2026-09-07/direct-cover/README.md). AT11 LOCAL; genel goal aktif. Hosted/pilot/insan UAT, kalan eligibility ve recovery kombinasyonları açık. Yeni migration/API değişikliği yok.

Sahipli browser süreçleri terminal/exit0;5560/5561 PID/commandline doğrulamasıyla kapatıldı. Wrapper exit1/preview vite not found kontrollü cleanup sonucudur; başarılı build hatası değildir. Shared5555/5556/Auth ve ilgisiz WIP korunur. Son kaynak hashleri eşleşir, hedefli whitespace/syntax kontrolleri geçti.


## AT18 — Dört uygunluk kriteri, gerçek API ve stale onay

Ayrı sahipli workspace9fe191ea-b6c8-412a-b274-21c3a90f3838: job, location, exclusion, archive için direct/pool list, pool/direct submit, peer consent, manager list/preview ve eski preview ile final=32/32 negatif gate. Her kriterde öncesi uygun, sonrası restore+gerçek başvuru200. Archived employee erişimi403; diğer uygunluk hataları422; stale final409.16 matrix shift eski owner’da,12case normal owner-close ile kapalı,transfer0; candidatejob/location/profile restored. Metadata fixture DML ile değişir; HR settings writer UI kanıtı değildir.

Gerçek final409 reason JSON array biçimindeydi: API client okunabilir metne dönüştürür, status/idempotency/command/hata akışı korunur. Açık confirmation eligibility bozulunca eski atama vaadini de kaldırır: Review needs updating, dialog içi gerekçe, korunmuş not/disabled confirm. Preview lookup hatası için tekrar kontrol metni. Yedi yeni kontrol dahil51/51 UI, typecheck/hedefli lint/build PASS. Yeni migration/API değişikliği yok.

Normal manager UI login ileiki yeni stale POST; job ataması gerçek POST’tan hemen önce biter. API409, owneraynı/transfer0/manager note0. Metadata restored ve test case owner komutuyla kapalı. Nihai390 light/dark2 görünüm taşma0/gözle inceleme; native reader/kontrast/tümviewport matrisi değil. [Kanıtlar](shift-hub-visual-proof-2026-09-07/eligibility-api/README.md). AT18 LOCAL; G05/genel goal aktif. Sıradaki AT19 çoklu availability ve AT22 extra/travel matrisi; swap tümAPI çapraz kombinasyonları, hosted/pilot/insan UAT açık.

Fixture availability guard eski yöntemi reddetti; unpublished test döneminden başlayan version ile düzeltildi, guard kapatılmadı. İlk422 harnessbeklentisi düzeltildi; kayıtlıcase/ID ve restored metadata kullanıldı. Eski5560 process handle/listener yokluğu doğrulanınca owned API yeniden açıldı. Başarısız/kısmi denemeler başarıya eklenmedi; yeniden çağrıda new_criteria_this_run=0 ile mevcut DB doğrulaması ayrı raporlanır.

Cleanup tamamlandı: owned5560/5561 PID ve commandline ile doğrulanıp kapatıldı; browser işlemleri terminal/exit0. Wrapper exit1/preview vite not found kontrollü durdurma sonucudur. Diğer servisler başlatılmadı/durdurulmadı; ilgisiz WIP korundu. Son kaynak manifesti, hedefli whitespace ve verifier syntax PASS.

## AT19 — Çoklu availability sürümleri, gerçek HTTP cover matrisi

Ayrı owned workspace `f16128a0-a7ed-4754-988b-923b394fe417`. Altı availability sürümü gerçek employee Auth + HTTP submit ile effective oldu; tümü 2028-03-06 test haftası yayımlanmadan önce. Yedi senaryo: unknown, weekly full, temporary-none üzerine yeni weekly, temporary expiry, temporary partial, date-override partial üzerine yeni weekly, date-override ertesi gün. Dört negatifte direct/pool listing engelli; sekiz submit422, application0. Üç full senaryoda (iki pool, bir direct/accept) manager final öncesi owner aynı, final sonrası doğru kişiye devir.

Bekleyen geçerli başvuru sırasında yayın sonrası unavailable submit409; sürüm6→6, preview fingerprint aynı. Guard değişikliği reddeder; değişmiş availability ile stale final testi olarak sunulmaz. Guard veya publication geri alınmadı. Bağımsız7 manager assessment HTTP okuması unknown/full/none/full/partial/partial/full ve uygun operation/ayrıntılı nedenleri doğrular.

Son DB:7case,3completed,4cancelled,3transfer;4shift ilk owner'da,3yeni çalışanda;6version. İlk koşum7yeni senaryo, tekrar koşum0yeni senaryo+güncel HTTP/DB kontrolü. Audit ve atamalar korunur, aktif test case yok. Güncel API kaynaklarından ayrı bundle üretildi; ürün kodu/migration değişmedi. [Kanıtlar ve sınırlar](shift-hub-visual-proof-2026-09-07/availability-api/README.md). AT19, swap'ın iki yönü ve ayrıntılı nedenlerin UI sunumu nedeniyle PARTIAL; G05/genel goal aktif. Bu tur browser/hosted/insan UAT kanıtı yok.

Verifier syntax/hedefli whitespace PASS; kabul tablosu42satır. Owned5560 PID ve tam commandline ile doğrulanıp kapatıldı; wrapper exit1 kontrollü cleanup. Browser servisi açılmadı; diğer süreçler ve ilgisiz WIP korundu.

## AT19 — Takasın iki tarafı ve manager gerekçeleri

Ayrı owned workspace47b9b868-f523-47cc-9488-3c071d31a708, gerçek62gün aday aralığında28Eylül–7Ekim2026. Unknown/temporary-none/temporary-partial/dated-partial×iki yön=8 negatif list/create422; case oluşmaz, owner aynı.3 uygun swap (biri ters yönden başlatılır): rıza öncesi manager409, peer consent sonrası iki taraf eligible; final6atamayı birlikte değiştirir. Her iki çalışanın yayın sonrası6availability write409; version/preview aynı. Scoped3case/3approved/3transfer;4kısıtlı vardiya sahibi korunur. Son tekrar0yeni işlem ve currentDB doğrulaması; önceki cover workspace7case/3transfer/6version değişmedi.

İlk2028fixture candidate62gün penceresi dışındaydı; pozitif kontrol hatayı yakaladı. O denemenin list sonuçları kanıt sayılmadı; yeni tarihli ayrı workspace kullanıldı, eski audit silinmedi. Ortak cover helper tarih parametresi alır; default eski kanıtla aynı. Negatiflere zorla pending application yazılmadı, publication/availability guard kapatılmadı.

Manager preview/dialog artık receiver/giver ayrıntılı nedenlerini kişi ve aldığı shift yönüyle açıklar; aynı reason tekrarları ayıklanır. Görsel incelemede aktif swap confirmation ikinci shift kartının eksikliği bulundu; Offered/Requested kartları desktopyan yana/mobilalt alta eklenir. Terminalhistorical assignment kuralları korunur.53/53 UI (47Hub+5client+1dialog), typecheck/lint/build PASS. İlk testte duplicate neden ve yanlış fixture adı düzeltildi; son yeni test querynotify sonrası görünümü bekler.

İki gerçek managerUI login+POST denemesinde yalnız bu fixture'ın iki job assignment'ı finalöncesi sonlandırılır: API409, iki kişinin gerçeknedenleri, korunmuşnote, disabledconfirm. İlk4görünüm eksikikinci kartı gösterir; nihai4görünüm iki kartlı390/1440×light/dark, overflow0/pageerror0. Nihai mobil/light ve desktop/dark gözle incelendi. İki ayrı testcase restoredjob/owneraynı/transfer0; normalownerclose→cancelled. Availability partial/unknown metni componenttestinde; browser tetikleyicisi job. Bu ayrım hosted/native/insan UAT yerine kullanılmaz.

[Kanıtlar](shift-hub-visual-proof-2026-09-07/availability-swap/README.md). AT19 LOCAL; G05 AT20/AT22 dahil diğer açık kriterlere bağlı. Genel goal aktiftir. Kaynak/runtimehash, Python syntax ve42acceptance satırı doğrulandı; yeni migration veya deployment yok.

Cleanup: owned5560/5561 PID ve commandline doğrulamasıyla kapatıldı; wrapper exit1 kontrollü durdurma sonucudur. İki browser case için son read-only kontrol cancelled/job2restored/transfer0; ilk tarih dışı workspace açık case0. Kaynak manifesti eşleşir.

## AT20 — DST cover devri ve açık saat gösterimi

Ayrı ownedworkspace4e2ae030-9cb3-4067-932b-08b4ce90f75c:4gerçek cover/pickup/preview/final, fall3h/spring1h/ikinci01:30=1h/overnight4h. Dört rıza hazırken lokasyonLA→NY fixtureedit; shift savedLA/UTCinstants/consentfingerprint aynı, eligibility geçer. Finalekadar owner, ardındanCasey; sonread4completed/4transfer/open0. LocationfinallyrestoredLA. Tekrar0newtransfers ilecurrentAPI/DB doğrulaması. SQL yalnızfixture hazırlığı/lokasyonmetadata; diğerkomutlar realAuthHTTP. Önceki6version/7cover hazırlığı DSTbaşarısına eklenmez.

Kart savedtime_timezone kullanır; clockchange UTCStart/End, actualelapsed açıklaması ve First/Second occurrence görünür. Normalovernight uyarısız; Endsnextday mümkünse fizikselanların yereltarihiyle. Invalid/unconfirmed saatte hayalikural/offset yok. Helper sunucuanını yalnızaçıklar, yeni schedulingeligibilitymotoru değildir. LordHowe30dk tekrar, first/second ve spring/fall dahil8cardtesti; toplam61/61web, typecheck/lint/build PASS.

NormalUIlogin manager+Casey,4completedcase×390light/1440dark=16ilk+16nihai read-onlygörünüm. İlkekranda yalnızUTCvardı; görselinceleme sonrası explicitoccurrence eklendi. Nihai16taşma0/pageerror0; employeemobilrepeated ve managerdesktopdarkfall incelendi. İlkset nihaiyerine kullanılmaz. [Kanıtlar](shift-hub-visual-proof-2026-09-07/clock-details/README.md). AT20 PARTIAL: midnightpartial availability tamExchangeve iki farklıtimezone swap matrisi açık. Native/insanUAT/hosted ayrıdır. Genelgoalaktif; yeni migration/deployment yok. Manifesteşleşir, syntax/whitespaceve42acceptance satırıdoğrulandı.

Cleanup: owned5560/5561 listener PID ve commandline doğrulamasıyla kapatıldı; wrapper exit1 kontrollü durdurma sonucudur. Browser işlemleri exit0; diğer servisler ve ilgisiz WIP korundu. Nihai16görünüm/manifest/syntax/whitespace kontrolleri PASS.

## AT20 — Gece yarısı ve iki timezone takası

Ownedworkspace87103246-0550-4ff7-b51e-dab6c2f47c35. Gerçek availabilitysubmit ile13Ekim unavailable, yayınöncesi effective.12–13Ekim22–02ilk2saat ve13–14Ekimson2saatpartial/blocked; exactmidnight07:00Zboundary doğrulanır. İki direct/poollist ve4submit422,application0; ownernormalclose.14–15Ekimfull4h pickup/finalownerdeğişir.

LA19Ekim16–20 ↔ NY20Ekim19–23, Casey'ninNY19Ekim16–17extra publishedişine rağmenphysicalnonoverlap→eligible/final. LA21Ekim22–02 ↔ NY22Ekim22–02 overnighttakasıiki4hphysicalaralık/timezonekorur. NegatifLA23Ekim16–20, CaseyNY23Ekim20–21ileUTCçatışır; iki yöndelist/create422, owneraynı ve canonicaloverlapreason. Swaplar gerçek62gün aralığındadır. Hazırlık6version/7coverbaşarıyaeklenmez. Scoped5case/3completed/2cancelled/3transfer,open0. İki kısmi veconflictfixture3shiftowneraynı. Rerunnew_rows0yalnızcurrentDB/endpointkontrolü.

Manager+ikiemployee normalUIlogin,2tamamlanmışswap×390light/1440dark=12görünüm; actualzone/4h/owner ve nextdayetiketisayısı0ve2doğru. Taşma0/pageerror0; employeeovernightmobil/managerdesktopdarkgözleincelendi. İlkbrowserharness coverTransferapprovedbekledi; gerçekSwapapprovedmetnine düzeltildi, ilkdenemebaşarıdışında saklandı. Ürünkodudeğişmedi; güncelAPI/VitebuildvebrowserPASS, önceki61unittekrarsayılmaz.

[Kanıt](shift-hub-visual-proof-2026-09-07/timezone-swaps/README.md). ÖncekiDSTkanıtlarıylabirlikteAT20LOCAL. AT22 source-linkedplacement/extra/travelkapısıvesairG01–G10, native/hosted/insanUATaçık. Genelgoalaktif. Verifiersyntax/whitespace,9kaynakmanifestive42acceptancesatırıdoğrulandı; yeni migration/deploymentyok.

Cleanup: owned5560/5561 PID ve commandline doğrulamasıyla kapatıldı; wrapper exit1 kontrollü durdurma sonucudur. Nihai browser exit0; diğer servisler/ilgisiz WIP korundu. Yerel fixture atamaları ve audit geçmişi korunur; açık test case0.

## AT22 — Kaynak yerleşimi, ek çalışma ve ortak geçiş süresi

Önceki turdan kalan overlap kanıtları doğrulandı: owned workspace aa47b0b7-9003-49b8-a14b-af58e51bdf39 içinde2tamamlanmış swap/2transfer,4source overlay doğru owner/station ile korundu. Native ekstra atama ve legacy standalone çalışma ayrı ayrı eski finali409ile engelledi; native release/legacy hide sonrası iki shift birlikte devredildi. Son rerun yeni swap0. [Placement kanıtı](shift-hub-visual-proof-2026-09-07/lineup-overlap/README.md).

Ortak minimum şimdi Scheduling Settings'te0–240dk; ilk0, kullanıcının yanıt vermediği başlangıç tercihi için çalışma varsayımı. Yetki mevcut workspace.manage; standart manager'a yeni global yetki verilmedi. Eski payload mevcut değeri korur. Settings RPC doğrulanmış actor ve workspace lock921 kullanır; audit doğru actor'ı yazar. Mevcut availability guard korunur; PT409API'de409döner.

Ortak evaluator farklı lokasyonlarda yayımlanmış çalışma ve aktif bağımsız Line Up extra için max(company,operation) kontrolü yapar. Aynı source yerleşimi iki kez sayılmaz; same-location komşuluğu travel gerektirmez. Line Up preview ve partial move/swap commit aynı effective değeri kullanır; raw operation idempotency/audit'te kalır. UI şirket minimumunu ve gerçek review değerini gösterir; policy refetch eski review'ı kaldırır, gerekçeyi korur. Settings temiz label/44px alan/örnek saat ve pending sorumluluk açıklaması; boş input0'a dönüşmez.

Yeni26pgTAP+requested publication12+range19=57/57; web14/14,API24/24; typecheck/hedefli lint/bundle/Vite PASS. Yerel security advisors issue0. Yeni partial move testi30dkya göre09:00–09:30 ve12:30–17:00 residual çalışma ve2açık travel gap doğrular. Eski seedlokasyon arşivliydi; açılmadı, transaction'a ait yenileri kullanıldı. SQL terminator ilk denemesi rollback; düzeltilmiş migration yerelde atomik uygulandı, local history32000applied.

Gerçek normal UI login yetkili QA admin: save30/reload30,390/1440×light/dark4nihai görünüm,taşma0/pageerror0/44px/Tab ilerleme. Native sayı alanı görsel inceleme ardından temiz border/radius/focus ile düzeltildi. GerçekAPI eskipayload30korur,invalid3değer400,employee+yetkisizmanager403,başka workspaceGET/PUT404,doğruauditactor. İlk harness403beklentisi404olarakdüzeltildi; eski raporlar saklandı.

Gerçek cover/pickup minimum0ileuygun: candidate07:00–08:45other-locationextra,alınacak09:00–11:00shift. YetkiliAPI minimum30yapınca öncekipreview ile managerfinal409; owneraynı,transfer0,private note0. Case owner-close→cancelled,extra hidden,ayar0restored. İlk harness yanlışmanagerqueryparametresi mevcutcasekorunarakdüzeltildi. Sonrerun yalnızcurrentclosedDB, yeni işlem/devir sayılmaz. [Travel kanıtı](shift-hub-visual-proof-2026-09-07/travel-policy/README.md).

AT22/G05/genelgoalaktif: gerçekeşzamanlıiki sıra, tüm pool/direct/peer travel kapıları, iki taraflı swap ve Line Up swap residual matrisi açık. Line Up travel UI componentkanıtlı; gerçekbrowser bu turSettings. Native/humanUAT/hosted/pilot ayrıveaçık. Deployment/commit/yabancıWIPdeğişikliği yok.

Cleanup doğrulandı: owned workspace minimum0/open case0/legacy extra hidden/travel case cancelled. 5560 ve5561 listener PID+commandline ile doğrulanıp yalnız owned süreçler kapatıldı; wrapper exit1 kontrollü cleanup. Nihai manifest14kaynak/6DBfonksiyonu,42kabul satırı,syntax/whitespace PASS. Yerel migration history32000applied. Goal aktif; hosted ve insan UAT yapılmadı.

## AT22 — Gözlenen API yarışları ve iki taraflı travel swap

Önceki goal turu progress olarak değerlendirildi. Yeni turda güncel branch, source/contract ve servis yokluğu doğrulandı; owned API güncel kaynakla yeniden bundle edildi. Ürün kodu/migration değişmedi.

Ayrı QA kayıtlarında2gerçekHTTP yarış: kontrol bağlantısı yalnızworkspace921kilidini tuttu. İlk ve ikinci RPC'nin iki farklı backend'de advisory beklediği pg_locks/pg_stat_activity ile görülüp kilit bırakıldı. Policy-first: settings200/final409, owneraynı/transfer0/private note0. Approval-first: final200/settings200, yeniowner/transfer1/private note1; sonradan gelenminimum30tamamlanmış devri iptal etmedi. Herikisonundapolicy30okundu, ardından0restored. İlksonverisorgusu yanlışc.shift_idkolonunu kullandı; bitmişyarışlar yenilenmeden kayıtlıshiftUUID ile currentDB doğrulandı. Rerunnew_races0.

İkiayrıswap, iki farklıbaşlatıcı,19–22Ekim2026: receiver/giver extra ayrı ayrı aktifleştirildi.8candidatehide; peer4HTTP422veinviteddurumu korunur; managerpreview doğruengellitarafı30dksebebiyleineligible/diğerinieligiblegösterir; eskifinal4HTTP409veownerlaraynı. Engellerkalkınca fingerprintaynıvepeerconsentgeçerli;2normalfinal4atamayı karşılıklıdevreder,2completed/2transfer. Sonrerunnew_swaps0, currentowner/auditverified. Tümextras hidden, minimum0, opencase0, controller session0.

[Kanıtlar](shift-hub-visual-proof-2026-09-07/travel-policy/races-swaps.md).42kabul satırı ve Python syntax doğrulandı;5kaynak/4DBfunctionmanifesti eklendi. Bu tur57DB/24API/14UI önceki testleri tekrar koşuldu olarak sayılmaz; yeni kanıt realAuthHTTP concurrency/swap ve sonDBokumalarıdır. Browser/hosted/native/humanUAT yapılmadı. AT22/G05/genelgoalaktif: pool/direct create-pickup travel, Line Up swap residual ve effective UI browser açık.

Cleanup: owned5560listener PID ve tamcommandline eşleşmesiyle kapatıldı; wrapperexit1 kontrollü durdurma. Browser açılmadı; diğer servisler ve ilgisiz WIP korundu. Genelgoalaktif.

## AT22 — Çekirdek yerel kabul tamamlandı

Önceki tur gerçek yarış/swap kanıtıyla progress idi. Bu tur dört yeni realAuthHTTP pickup/direct senaryosu26–29Ekim: diğer lokasyonda15dkönce/sonra boşluk candidate/pool gizli ve4submit422; application0/owneraynı. Tam30dk sınırda poolpickup ve aynı lokasyonbitşiğinde directcreate/accept/final geçerli. Son2completed/2cancelled/2transfer; sadecefinaldeownerdeğişir. Dörtownedextra hidden,min0restored. Rerunnew_rows0güncelterminal/ownerkanıtı, yeniişlem sayılmaz.

TravelpgTAP26→42: üç partialswap içincompany/requested30/0,30/60,60/30; effective30/60/60. Heriki seçili interval yeniowner'a geçer; her senaryoda4açıkgapdoğrusınırlarda,4residualçalışmaoriginalowner'da,time recordsaynı. Transactionrollback. Bu tur42testkoşuldu; önceki57ayrıtarihselkanıt.

GerçekmanagerLineUpUI: normal login,Move location,QA Patio10–10:30/requested0,klavyeEnterReviewimpact. Gerçekpreview200allowed/min30/effective30veaçıktravelgap açıklaması.390/1440×light/dark4nihai görünüm taşma0/pageerror0; mobil light/desktopdark incelendi. Finalconfirmationyollanmadı; staffingevent0,owneraynı,policy0restored. İlkikiharnessdenemesi exactnestedselectlabeleşleştirmesine takıldı; dialogmetni/ekranincelendi,combobox accessible-name seçicisiyle düzeltildi. Ürünkodudeğişmedi, ilkraporlarsaklandı.

[Birleşik kabul](shift-hub-visual-proof-2026-09-07/travel-policy/acceptance-local.md). AT22LOCAL, G05/G01–G10goalaktif. Native/full-device keyboard/insan UAT/hosted ayrıaçık. Yeni ürünkoduveya migration/deploymentyok.7kaynak/4DBmanifest, Python syntax,42acceptancesatırı doğrulandı.

Cleanup: current DB minimum0/opencase0/4ownedextras hidden. Owned5560/5561 PID+commandline eşleşmesiyle kapatıldı; wrapperexit1 kontrollü durdurma. Diğer süreçler ve ilgisiz WIP korundu. Genelgoalaktif.


## AT28 — Kişi durumu ve güvenli shared assignment

39 bağımsız pgTAP kontrolü eklendi: eski override/call-off/not yeni kişiye taşınmıyor; split placement, bağımsız legacy ve paylaşılmamış WIP korunuyor. Editing-disabled Line Up canonical kişiyi gösteriyor. Önceki call-off paylaşımında kaynak bulunmadığında finalin sessizce başarılı olduğu gerçek hata 4 failing assertion ile üretildi. Yeni 34000 migration preview/finalde her iki swap tarafının shared kaynağını kontrol ediyor. Manager inceleyip açıkça paylaşmadan final yok; düzeltme sonrası aynı consent ile devir tamamlanıyor. Hiç paylaşım olmayan günde sahte share yok.

93/93 odaklı SQL (39 kişi durumu +12 publication +42 travel),48/48 Hub, ESLint/TypeScript ve local security advisors PASS. Eski v1 suite shared seed employee nedeniyle Employee profile required ile durdu; o çalıştırma PASS değildir. Yeni fixture tamamen bağımsızdır ve rollback olur. Migration yalnız local uygulanıp history34000applied işaretlendi; unrelated33001 korundu.

[Kanıt ve kaynak hashleri](shift-hub-visual-proof-2026-09-07/lineup-person-state/acceptance-local.md). AT28 LOCAL teknik kapsam; yeni recovery gerçek-auth browser kaydı, native erişilebilirlik, insan UAT, hosted/pilot açık. API/browser servisi başlatılmadı. Genel goal aktif.
