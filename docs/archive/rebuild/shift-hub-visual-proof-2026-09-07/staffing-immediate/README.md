# Staffing anlık teslim — G07/G09/AT42 yerel kanıt

7 Eylül 2026. Genel goal açık; bu dosya staffing komutlarının post-commit teslim bağlantısını kanıtlar.

## Değişiklik

Line Up API artık başarılı propose/respond/proposal confirm/cancel ve doğrudan apply sonucundan sonra yalnız ilgili teklif veya operation olaylarını teslim eder. Teklif onayında aynı transaction'da kapatılan rakip tekliflerin coverage_filled sonucu da kapsanır. Diğer bekleyen teklifler, başka need'ler veya workspace'ler topluca tüketilmez. Reads/preview teslim başlatmaz. Transfer teklifinde mevcut staffing outbox yoksa yeni olay uydurulmaz.

23000 migration service-only `flush_lineup_staffing_notifications_service` ve konu indeksleri ekler. Mevcut outbox processor/policy/inbox ve post-delivery içeriksiz realtime sinyali kullanılır. Aktif lease korunur, expired lease alınabilir, row/advisory kilidi beklenmez;1sn dilim/1–100 satır sınırı ve API'de bütün dilimler için tek2sn abort signal bulunur. Retry/dead letter/busy/error komutun kalıcı sonucunu failure'a dönüştürmez. [Supabase abortSignal belgesi](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal) kontrol edildi. Bu bağlantı harici e-posta/push gönderimi eklemez.

Migration CLI ile oluşturuldu, rollback denemesi ardından yalnız main local DB'ye history kaydı ve schema reload ile uygulandı. Hosted/deploy yok; izole replay container'ı açılmadı. Mevcut diğer migration'lar yeniden uygulanmadı.

## Kanıt

- Yeni API16, rollout4, HTTP rol matrisi41, önceki exchange delivery9 = **70/70**. Domain commit beklenmesi, doğru konu, preview/read/rejected komutta flush olmaması, toplam timeout ve failure sonucu koruması testli. API typecheck/hedefli ESLint PASS.
- Yeni SQL **24/24**, main function privileges **3/3**. Teklif/kabul sırasında owner değişmez; yalnız manager finalinde değişir. Başka teklif işlenmez; finalde rakip kapanış sonucu teslim edilir. Kontrollü assignment inbox failure retry'da tek kez oluşur; atama korunur. Active/expired lease, bounded batch, yanlış workspace ve service-only yetki kapsanır. Test kendi rollback employee/location/job/type referanslarını kullanır.
- [lock.json](lock.json): gerçek ayrı SQL bağlantısı per-notification926 advisory kilidini tuttu. Scoped flush **365ms** içinde busy/leased0 döndü; outbox status/attempts değişmedi. Kilit açılınca1 processed/1 inbox. Yalnız sahipli QA teklif manager API ile kapatıldı; Alex owner korundu. Bu domain teklif SQL ile üretilen ayrı concurrency kanıtıdır, browser akışının parçası sayılmaz.
- [browser.json](browser.json): sabit local API5560, önceki web-v3 build5561; normal manager/employee UI şifre girişleri, auth injection/HTTP mock/fake clock yok. Manager ve employee inbox, employee Shift Hub ve Schedule, manager Line Up olmak üzere5 açık görünür yüzey.

| Aşama | Command-start → son DOM gözlemi üst sınırı | Doğrulanan yüzeyler |
|---|---:|---|
| Manager teklif |487ms|Employee inbox + Shift Hub|
| Employee gerçek Accept offer tıklaması |356ms|Manager inbox + employee Shift Hub|
| Manager final onay |716ms|Employee inbox/Schedule, manager inbox/Line Up, employee Shift Hub|

Bu **tek akıştır;30 örnekli P95 değildir**. Teklif/kabul sonrası gerçek API owner null; final sonrası Alex. Employee accepted kartı ve manager review finalde kalkar. Her aşamada navigation0, HTTP/pageerror0. Bildirimdeki gerçek bağlantı21 Aralık kişisel Schedule'ına ve doğru vardiyaya gider. Manager teklif/final üretimi gerçek API; çalışan kabulü gerçek UI. Üç ekran görüntüsü final durumdan alınmıştır; kapsamlı responsive tasarım puanı değildir.

[final-data.json](final-data.json):21 Aralık source `5bcc2cb7-7f77-4629-8c07-47a35105e464`, tek bağlı entry ve doğru Alex owner, önce/sonra shared snapshot0. Sahte share üretilmedi. Final assignment için tek visible inbox, önceki requested/accepted görünmez, duplicate0. QA kayıtları/audit korunur; Aralık8/15 multisurface fixture'ına atama yazılmaz.

## Deneme sınırları ve kalanlar

İlk browser raporu `staffing-immediate-browser-1788822603572.json` başarısız harness denemesidir: yanlış `view=requests` yerine ürünün `hub_view=requests` parametresi kullanılmalıydı. Bildirim oluşmuştu, teklif bekliyordu ve owner null'dı. Yalnız o sahipli teklif manager cancel API ile kapatıldı; geçmişi yeni fixture'da prior_harness_attempts altında korunur. Son başarılı koşum yeni teklif kullanır. İlk API bundle packages=external seçeneği TS workspace import'u çözmedi; process terminal exit1 sonrası normal proje bundle yöntemiyle düzeltildi. Auth/main dev server yeniden başlatılmadı.

İncelenen inbox ekranında liste unread67/sidebar66 anlık farkı var; bu koşum badge eşitliğinin oturma süresini ölçmez ve kalıcı tutarsızlık kanıtı değildir. Staffing safe-preview hâlâ generic; önceki exchange ayrıntı paneli yalnız Shift Hub case türlerini açar. Mesaj anlaşılabilirliği/UAT tamamlanmış sayılmaz.

AT32/33/42 yerel kapsamı genişledi, G07/G09/G10 ve genel goal açık: staffing30 örnek/reconnect/fallback, My Team/exchange detail yayılımı, badge tutarlılığı, kalan rol/uygunluk/recovery varyantları, native reader/human UAT ve hosted/pilot. Final source hashleri [source-sha256.json](source-sha256.json); dirty checkout geneline/release'e ait değildir. Owned5560/5561 test listener'ları doğrulama sonunda kapatıldı; shared5555/5556/Auth ve ilgisiz WIP korunur.
