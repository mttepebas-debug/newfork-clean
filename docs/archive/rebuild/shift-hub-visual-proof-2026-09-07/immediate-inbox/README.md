# G07/G09 — Karar sonrası anlık inbox teslimi

## Davranış ve sınırlar

Manager kararı önce kendi DB transaction'ında kalıcılaşır. API, dönen case kimliği için ayrı service-role RPC ile bekleyen bildirimleri teslim eder. Bir case/workspace dışındaki kuyruk işlenmez. Her dilim en fazla100 kayıt ve döngüde1 saniye; API dilimleri aynı toplam2 saniyelik AbortSignal altında çağırır. Bu süre SQL içindeki tek operasyonun kesin iptal garantisi değildir. Başarılı karar cevabı, teslim hatası veya belirsiz timeout nedeniyle hataya çevrilmez. Kalan/kilitli/hatalı işler kalıcı outbox ve mevcut cron/retry yolunda kalır.

Mevcut processor event→recipient→inbox kontrollerini korur. Teslimden sonra mevcut içeriksiz workspace broadcast'i yayınlanır; açık ekranlar yetkili sorgularını tekrar okur. Aynı transaction/workspace için delivery sinyali birleştirilir. İçerik yalnız workspace_id; provider id ekleyebilir. Başka işlemdeki case advisory lock'u try-lock ile beklenmeden atlanır; lease sahibi değiştirilmez. Aktif başka-worker lease'i alınmaz, süresi dolmuş lease kurtarılır.

Broadcast wrapper hataları yakalar; provider realtime.send bazı iç hataları kendisi WARNING'e dönüştürür. Bu nedenle invalidation_deferred alanı bütün provider arızalarını saptayan bir health göstergesi değildir. Reconnect/poll yolu gereklidir. Staffing offer olayları mevcut worker ile teslim edildiğinde aynı post-delivery sinyalini alır; Line Up staffing command'ına anlık flush bağlantısı bu değişikliğe dahil değildir.

## DB/API kanıtı

Migration `20260909020000_shift_exchange_immediate_inbox.sql` önce sahipli, network=none izole replay DB'de doğrulandı. Sonra yalnız bu migration ana local DB'ye transaction ile uygulandı, migration history kaydedildi, PostgREST schema reload gönderildi. Hosted değişiklik yapılmadı.

- Yeni SQL27/27: grants, parametre sınırı, workspace/case eşleşmesi, scoped dilim, signal coalescing,3 gönüllü/tek manager görevi, onay öncesi owner, kontrollü tek teslim hatası, diğer sonuçların ilerlemesi, retry/duplicate, terminal alıcılar, aktif/expired lease ve ilgisiz queue aynılığı.
- Ana DB: yeni27 + staffing53 + privilege3 =83/83 PASS.
- İzole DB: yeni27 ve mevcut exchange176 PASS. Staffing testi eski30 provider mesajını da sayıyordu; başlangıçtaki message ID'lerini dışlayınca53/53 PASS. Mesaj silinmedi; assertions yeni transaction'ın mesajlarına odaklandı.
- İzole genel privilege testi2/3: eski16 trigger fonksiyonunda authenticated EXECUTE var. Envanter kayıtlı; bu yeni service RPC'ler değildir. Ana DB aynı genel test3/3 PASS ve bu eski16 izin yok. Tam şema parity iddiası yapılmaz.
- İki bağımsız gerçek DB bağlantısı: biri case lock'unu tutarken diğeri busy=true/leased=0 aldı; bütün outbox hash'i korundu. Sonuç `busy-lock.json`.
- İlk API service9 + routes5 =14/14 PASS; sonraki auth düzeltmesiyle31/31 kapsamı aşağıda. API typecheck ve hedefli ESLint PASS. Service testlerinde RPC transport mock; SQL ve browser kanıtları ayrı.

SQL fixture retry'da15 saniye beklemek yerine yalnız test satırının available_at değerini rollback transaction'ında geçmişe taşır. Bu test gerçek backoff süresi kanıtı değildir; önceki notification-batch kanıtı gerçek1 saniyelik backoff'u ayrıca ölçmüştür.

İlk SQL denemesi birikmiş7 eventin tek kısa dilime sığdığını varsayıyordu. Gerçek gözlem2–5 event/dilim gösterdi. İşlev testi bounded tekrarlarla tüm eventleri doğrular; gerçek latency aşağıdaki browser ölçümüyle değerlendirilir. İlk başarısız loglar .temp içinde korunur.

## Açık kabul kapıları

Bu kanıt gerçek insan UAT, cihaz/ekran okuyucu, hosted cron/secret/plan/log veya üretim latency kanıtı değildir. My Team/exchange detayları ve staffing command teslim süresi aynı ölçümde yoktur. G07/G09 ve genel goal açık kalır.

Sahipli izole container SQL/kilit kontrolleri sonrasında başlangıçtaki stopped durumuna döndürüldü. Mevcut izole DB ve test kopyaları silinmedi.

## Ölçüm ortamını sabitleme

Paylaşılan5555/5556 geliştirme runtime'ında iki seri kesildi. İlkinde11 başarılı final sonrası, ikincide10 tam doğrulama ve bir DOM sonucu sonrası API erişim hataları oluştu. Aynı aralıklarda API PID'leri66204→2328→96416 değişti. Aktif üyelikler ve final atamaları korundu; bu korelasyon tek başına yetki hatasının kök nedeni olarak sunulmaz. İki kesintili rapor saklandı;30 başarılı örnek gibi birleştirilmedi.

Ardından mevcut kaynaklar ayrı yerel çıktı dizinlerine derlendi: esbuild API CJS, Vite statik web. API5560 (watch yok) ve web5561 yalnız sahipli doğrulama süreçleri. Development identity kapalı;3 normal UI password oturumu, aynı gerçek yerel Supabase/API ve realtime. Paylaşılan sunucular durdurulmadı veya yeniden başlatılmadı. Üretim deploy'u değildir. Bundle ve verifier SHA256 kayıtları stable-build.json içinde.

## Gerçek kök neden ve API düzeltmesi

Sabit API PID23356 ile de10 başarılı ölçüm sonrası Auth erişimi bozuldu. Provider günlüğünde22:12,22:15 ve22:18 UTC aralıklarında `/user` için toplam203 adet500 yanıtı: PostgreSQL TCP bağlantısı `cannot assign requested address` ile açılamıyordu. İnceleme anında Auth network namespace'inde7449 TIME_WAIT bağlantı vardı; port aralığı32768–60999. Main Auth ayarlarında explicit idle/max pool değeri yoktu. Paylaşılan API süreç değişimleri tek başına kök neden açıklaması değildir; önceki varsayım bu kanıtla düzeltildi. Auth container/config yeniden başlatılmadı/değiştirilmedi.

`workspace-context.ts` aynı access token'ın sadece devam eden `getUser` network isteğini paylaşır. Promise tamamlanınca veya reject olunca map girdisi silinir. Sonraki istek yeniden gerçek Auth kontrolü yapar; ayrı tokenlar paylaşılmaz. Workspace/rol/location sorguları her request için bağımsız kalır. Böylece onay sonrası eşzamanlı açık ekranların aynı kimlik doğrulamasını tekrar tekrar başlatması azaltılır. Yetki/veri veya tamamlanmış identity cache'i eklenmedi.

Provider500/429/geçici fetch hatası artık503 Service Unavailable döner; gerçek401 yine erişim reddidir. Önceki resolver bütün Auth hatalarını null context'e çevirerek kullanıcıya yanlış403/404 gösteriyordu. Altı yeni resolver kontrolü dahil16/16; routes6/6 içinde gerçek Fastify injection ile503 ve command0; service9/9, toplam31/31 focused API PASS. Typecheck ve hedefli ESLint PASS. Kimlik doğrulaması veya workspace kontrolü atlanmadı.

Resmi kaynak: [Supabase Auth DB configuration](https://github.com/supabase/auth/blob/master/internal/conf/configuration.go), [connection implementation](https://github.com/supabase/auth/blob/master/internal/storage/dial.go). Bu kaynaklar pool alanlarının adlarını doğrular; local default'un çalışma etkisi gözlem olarak ayrı kaydedilir. Hosted Auth pool ayarları hakkında varsayım yapılmaz.

## 15 açık ekranın sağlıklı bağlantı ve reconnect sonucu

Son düzeltilmiş API derlemesinde normal UI login ile3 bağımsız browser context; iki hafta/lokasyonun manager Schedule ve Line Up'ı, iki çalışanın Schedule ve Line Up'ı,3 inbox: toplam15 görünür sayfa. Her manager kararı öncesinde peer kabulü tamam, owner'lar aynı ve manager inbox görevi gerçekten görünür. Sonra görev kaldırılır; iki çalışanın her birinde aynı case'e bağlı tam1 görünür onay sonucu aranır. Atama/snapshot DOM gözlemlerine ayrıca API owner ve version kontrolü eşlik eder.

İlk913 ms örnek önceki yarım case'i güvenle tamamlar ve30 örnek istatistiğine dahil değildir. Ardından30 yeni ardışık lifecycle: **P95 üst sınırı1046 ms; min627; max1099**. Zaman başlangıcı manager command isteği; bitiş son15 DOM sonucunun gözlenmesi. Gerçek DB commit timestamp'i olarak sunulmaz; commit→görünürlük için konservatif üst sınırdır. Sayfa yenilemesi veya manuel relay yok.

Aynı koşumda offline→manager API final→online: eski owner ve case'e ait inbox içeriği offline boyunca korunur. Online'dan tüm15 DOM sonucuna **704 ms**.32 toplam örnekte HTTP>=400/pageerror/command failure0. Auth `/user` gözlemi bu koşumun31 örneği sırasında3104 adet200,500/429 yok; bu başka ortamların kapasite garantisi değildir. Sağlıklı ve reconnect ham zamanları timings.json içindedir.

Employee ve manager inbox screenshot'ları görsel olarak incelendi: manager tamamlanan görevden temizlenir, çalışan sonuçlarını alır. Ancak `NotificationsPage` her zaman generic safe_preview'ı body'nin önüne koyuyor; çok sayıda farklı case aynı genel açıklamayla ayırt edilemiyor. Bu görüntüler G10/görev-anlaşılırlığı kapatmaz. Sonraki UX işi, bildirim gizlilik tercihini koruyarak yetkili in-app görünümde vardiya zamanı/lokasyonu ve sorumluluk sonucunu ayırt edilebilir hale getirmektir. Bu tur görünür teslim/tek case kartı kanıtıdır; bildirim metninin tam tasarım kabulü değildir.

## Fallback ve kalıcı veri

Ayrı üç real browser context aynı sabit API/web derlemesiyle çalıştı. Yalnız gerçek realtime WebSocket girişimleri kapatıldı; HTTP/auth/DB mock edilmedi. Manager review görevini önce gerçek60 sn poll ile görmek, sonra final kaybolmasını ölçmek zorunlu tutuldu. Final command→15 DOM sonucu **59850 ms**; sample içinde89 engellenmiş WebSocket denemesi, changed0, navigation0. HTTP>=400/pageerror/command failure0. `fallback.json`.

Son33 case (1 resumed +30 fresh +1 reconnect +1 fallback) tamamlandı. DB'de66 visible terminal employee item, aynı case/recipient için duplicate0 ve açık manager review0. İki scope'ta155'er snapshot, toplam310; hepsinde tek doğru owner. Son verify önceki306 snapshot içeriğinin aynılığını doğruladı; önceki ara verify eski180'i de koruduğunu kontrol etmişti. Live atamalar son sürümle aynı. `final-data.json`.

Her iki son browser process exit0 ve owned browser cleanup; ayrı5560/5561 test listener'ları kimlik/komut yolu doğrulanarak kapatıldı. Bundle'lar/loglar ve bütün case/audit/snapshot verisi korunur. Ana5555/5556 runtime'ları ve Auth container'ı bu doğrulama için yeniden başlatılmadı. Migration yalnız localdir; hosted cron/secret/account plan/pilot gate hâlâ açık.
