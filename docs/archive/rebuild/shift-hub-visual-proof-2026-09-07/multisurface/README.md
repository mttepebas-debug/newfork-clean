# G07 / AT32 / AT36 — gerçek iki hafta ve iki lokasyonlu takas

2026-09-07. Üç bağımsız browser context, normal UI üzerinden gerçek manager/Alex/Blake girişleri. Headless Chromium 1440×1000; sayfalar `visibilityState=visible`. Kullanıcının Chrome veya IAB oturumlarına bağlanılmadı. Local web5555/API5556/Supabase55321. Auth storage enjekte edilmedi; uygulama API cevapları ve saatler taklit edilmedi.

## Kapsam ve gerçek işlem

Yalnız sahipli QA workspace'te iki başlangıç published shift seed edildi. Dining8 Aralık mevcut current publication'ı korur; Patio15 Aralık için mevcut publication olmadığından yeni test yayını açıldı. İlgili gün/lokasyonda mevcut assignment, snapshot veya note olmadığı preflight ile kontrol edildi. İlk Line Up paylaşımı iki kapsamda gerçek share-preview/share API'lerinden yapıldı.

Her takasta mevcut owner gerçek create→karşı çalışan accept→manager fresh preview→approve API zinciri izlenir. Kabul sonrasında iki owner hâlâ önceki kişilerdir; yalnız manager finali ikisini değiştirir. Her döngüde roller tersine döner. Sekiz sayfa açık kalır:

- Manager Schedule:7–13 Aralık /Dining ve14–20 Aralık /Patio.
- Manager Line Up:8 Aralık /Dining ve15 Aralık /Patio.
- Alex Schedule:iki ayrı gün.
- Blake Schedule:iki ayrı gün.

Schedule badge'in gerçek shift ID'si ve employee row key'i, Line Up manager aksiyonunun person adı, employee Schedule'da aynı shift'in doğru kişide belirmesi/diğerinde kaybolması DOM üzerinden gözlenir. Her sonuçtan sonra iki gerçek Line Up API owner'ı da doğrulanır. Testler idempotency/fingerprint/consent korumalarını atlamaz.

## Ölçüm

| Koşul | Doğrudan sonuç | Plan sınırı |
|---|---|---|
| Healthy,30 ardışık takas | P95 üst sınırı971 ms; max1053 ms; min540 ms | ≤3000 ms |
| Offline→online,1 takas | Reconnect üst sınırı785 ms; offline iken8 ekran önceki atamayı korudu | ≤5000 ms |
| Realtime kapalı,1 takas | Tüm8 ekran26186 ms içinde gerçek HTTP refresh ile güncellendi | ≤65000 ms |

İlk keşif takası905 ms olup30 ölçüme dahil edilmedi. Ölçüm, manager isteğini göndermeden önce sekiz DOM observer'ını hazırlar. Node wall-clock **command-start→son DOM gözlemi**, commit→görünür sonucun konservatif üst sınırıdır: DB commit anını ölçmüş gibi sunulmaz. İstek süresi ve browser gözlem gecikmesi de bu sayıya dahildir. Gözlemler arası manuel tool bekleme süresi kullanılmaz. Böylece ölçülen sekiz yüzey için3 saniye sınırı güçlü şekilde doğrulanır; diğer yüzeylerin P95'i bundan çıkarılamaz.

Reconnect testinde tüm üç context gerçek browser offline moduna alınır; manager kararı ayrı gerçek API oturumundan verilir. Sonuç kaydedildikten sonra1,2 sn boyunca browser'larda yeni owner yoktur. Online geri açılınca navigasyonsuz güncellenir; sample sırasında navigation0,24 invalidation gözlemi. Fallback testinde yalnız `/realtime/` websocket girişimleri kapatılır; sahte event/iş verisi gönderilmez.115 kapatılmış bağlantı girişimi, alınan changed event0, sample sırasında navigation0. Aktif sekmedeki gerçek60 sn poll döngüsünün o anki fazı26,186 sn sonuç verdi; gizli sekme veya bütün olası fazların browser kanıtı değildir.

Network kontrol yöntemi resmi [Playwright WebSocketRoute](https://playwright.dev/docs/api/class-websocketroute) ve [BrowserContext.setOffline](https://playwright.dev/docs/api/class-browsercontext#browser-context-set-offline) API'leriyle karşılaştırıldı.

Healthy/reconnect/fallback koşumlarında pageerror ve HTTP≥400 kayıtları0. İlk harness kurulumu boş employee liste container'ını görünür beklediği için durdu; container'ın sıfır yükseklikli olması normaldi. Beklenti `attached` yapıldı; o ilk denemede takas yapılmadı. Önceki iki PTY çalışması işi ve browser kapanışını tamamladıktan sonra stdin açık kaldı; yalnız sahipli verifier handle'ları kapatıldı. Son verifier stdin'i kendisi kapatır ve normal exit0 verir.

## Kalıcı doğrulama

Toplam33 gerçek final takası (1 keşif +30 ölçüm +reconnect +fallback), her lokasyonda34 snapshot. Tüm68 snapshot'ta bu kaynağa ait tek entry ve beklenen dönüşümlü owner var. İlk66 snapshot tekrar okunduğunda içerikleri değişmemiş; iki canlı owner son sürümle tutarlı. Test assignment'ları, kararlar ve tarihçe korunur; sahte cleanup/deletion veya hosted yazım yok.

- Workspace: `e2afe393-c45d-4537-b984-114300cf568e`
- Dining shift: `0d0f835c-96fc-423b-b764-387ee867e1c0`
- Patio shift: `94060f76-7016-4bfd-a9d2-49859bfc3c7e`
- Verifier: `supabase/verification/shift_exchange_multisurface_local.py prepare|inspect|verify`
- Browser verifier: `supabase/verification/shift_exchange_multisurface_browser.mjs` (installed Playwright path argument; interactive sample/run30/reconnect/capture/close; `--no-realtime`, `--style-audit`).
- [Temizlenmiş ölçüm/veri kanıtı](timings.json):30 case ID, her observer zamanı, before/after owner, bağlantı varyantları, snapshot sonucu ve görsel ölçümler. Kimlik bilgileri içermez.

## Görsel kontrolde kapatılan Schedule aksiyonu sorunu

Önceki Schedule linki yalnız generic `.secondary-button` border'ı taşıyordu; padding/min-height/radius yoktu. Yeni `hub-exchange-link`,44 px dokunma alanı, yön değiştirme ikonu, açık/koyu renkler, görünür klavye odağı ve mobilde tam satır genişliği sağlar. Browser ölçümleri:

| Viewport | Link boyutu | Yatay taşma | Tema |
|---|---|---|---|
|320 px|262×44 px|0|light/dark|
|390 px|332×44 px|0|light/dark|
|1440 px|177,5×44 px|0|light/dark|

Altı kayıtta focus outline2 px ve gerçek link odağı var. Hesaplanan metin/zemin kontrastı light7,43:1, dark9,70:1. Temalar controlled root attribute ile test edildi; preference UI veya native screen reader kabulü değildir. [320 dark](schedule-cover-action-320-dark-1788815252367.png) ve [1440 light](schedule-cover-action-1440-light-1788815252637.png) görsel olarak incelendi.

İkinci sorun: ileri tarihli Schedule linki Shift Hub'a günü taşımıyordu; Hub kendi42 günlük penceresinde seçili source'u bulamıyordu. Link artık aynı source ID ile from/to gününü taşır. Gerçek Enter→15 Aralık cover/swap dialogu; doğru6–7/Patio vardiyası ve manager finaline kadar sorumluluk mesajı gözlendi. Yeni ilan gönderilmedi. Mevcut ileri-tarih testine route assertion eklendi; EmployeeHub18/18, web typecheck, hedefli ESLint ve diff whitespace PASS. Önceki turdaki ilgisiz typecheck hatası bu güncel koşumda yok; ilgili EmployeeDrawer dosyası bu işte değiştirilmedi.

## Açık kapılar

AT32/AT36 PARTIAL, genel G07 OPEN. Yukarıdaki ilk8 yüzey ölçümünde employee Line Up yer almıyordu; aşağıdaki ek koşum bu kapsamı genişletir. My Team, exchange list/detail/history ve inbox aynı30 ölçümde değildir. Snapshot v34 ekranında1 current employee için2 awaiting read görünmesi, current assignment acknowledgement ile önceki kişiye değişim bilgisinin ayrımında ayrıca incelenmeli; bu gözlem tek başına bug kararı değildir. Bildirim outbox/cron teslimi, UI lost-response, gizli sekme, gerçek cihaz/reader ve insan UAT/hosted pilot açık. Test sonucundan genel goal puanı üretilmedi.

## Ek koşum — çalışan Line Up dahil12 yüzey

Employee Line Up gün seçimi/deep link düzeltildi; [tarih kontrolleri ve gerçek Back kanıtı](../employee-lineup-dates/README.md). Alex ve Blake'in8/15 Aralık kişisel Line Up sayfaları eklenerek12 açık yüzey ölçüldü. Yeni kişide doğru tek assignment, önceki kişide assignment0 ve değişiklik açıklaması, her iki tarafta beklenen yeni snapshot `vN` zorunludur. Her karar sonrası iki published snapshot version'ı gerçek employee API ile de karşılaştırılır.

İlk12 yüzey koşumu23 başarılı finalden sonra `Workspace access required` ile kesildi. Aynı zaman aralığında API listener süreci değişti ve HMR/AuthProvider pageerror kayıtları görüldü. DB üyelikleri aktifti; aynı oturumlar sonra tekrar okuyabildi. Bunlar kesin kök-neden iddiası değildir. Bu koşum30 başarılı örnek diye kullanılmadı; ham `1788815841096` raporu korundu. Yarım case `6476cd3a-b6b6-4607-b807-36d4e416c461` peer rızası bekliyordu; owner değişmemişti.

Yeni koşum aynı case'i, sahipli iki shift ve tam verifier notu doğrulanarak sürdürdü; mükerrer case üretmedi. Bu ilk916 ms örnek P95'e katılmadı. Ardından **30 kesintisiz final**, her biri12 DOM sonucu +2 owner +2 snapshot sürümü: **P95 üst sınırı931 ms; max1038 ms; min626 ms**. Komut başlangıcından son görünür sonuca kadar olan üst sınır yöntemi değişmedi. Genel işlem, create/accept/preview/final gerçek API; kullanıcılar normal browser UI ile giriş yaptı.

Aynı12 yüzeyde ayrı offline→online finali: offline eski owner korunur; **reconnect1037 ms**, navigasyon0. Normal ve reconnect raporunda HTTP≥400/pageerror/command failure0. Yerel süreçler ve kullanıcı browser oturumları yeniden başlatılmadı. Bu koşum `1788816668655` raporudur; normal browser cleanup ve exit0 tamamlandı.

Realtime kapalı ayrı12 yüzey koşumu `1788816872531`: **54055 ms** gerçek HTTP fallback; sample boyunca66 engellenmiş realtime girişimi, changed0, navigation0. HTTP≥400/pageerror/command failure0 ve exit0. Bu60 sn poll'un o andaki fazıdır; bütün fazlar, hidden tab veya native cihaz için performans iddiası değildir.

Son kalıcı verify **90+90=180 snapshot**: her sürümde bir doğru owner; iki canlı atama son sürümle aynı; önceki kaydedilmiş68 snapshot içeriği değişmedi. Kesintili23 başarılı takasın tarihi de korunur. Toplam89 final, ilk paylaşım dahil90 sürüm/kapsam; arada cleanup/silme yapılmadı.

[12 yüzeyin temizlenmiş ölçüm kanıtı](timings-12-surfaces.json), resumed case,30 örnek, reconnect/fallback, her DOM gözlem zamanı, beklenen/gerçek snapshot sürümleri ve tarih kontrol ölçülerini içerir. Auth verisi içermez. `--include-employee-lineup` yüzeyleri; `--lineup-controls` tarih/tema turunu çalıştırır. İnteraktif mod açık stdin/PTY gerektirir. G07 ve AT32/36, kalan My Team/exchange/inbox, hidden/lost-response ve hosted/insan kabulü nedeniyle açık kalır.
