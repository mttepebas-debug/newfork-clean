# G09 / AT11 / AT33 / AT34 — gerçek notification batch

2026-09-07. `shift_exchange_batch_local.mts` üretim `createNotificationOutboxWorkerWithClient` ve `registerNotificationOutboxRoutes` kodunu kullanır. Fastify GET cron handler gerçek worker'a, worker gerçek service-role SQL fonksiyonlarına gider. HTTP/PostgREST transport yerine `psql` adaptörü vardır; iş kuralları, lease seçimi ve inbox verileri mock değildir. Manuel tek-event lease yapılmaz.

## İzolasyon

Yalnız `newfork-shift-exchange-replay-20260907`, network=none, mevcut sahipli replay fixture'ı. Kaynak uygulama DB'sinin kopyası benzersiz `sx_relay_*` veritabanına alınır. Main `supabase_db_newfork-clean` verisine yazılmaz. Kopyadaki50 eski sentetik event gerçek batch ile tüketildikten sonra yeni senaryolar başlar. Bu50 kayıt ölçülen yeni senaryolar değildir. Kopyalar ve başarısız koşum raporları korunur.

İlk template-copy denemesi provider bağlantıları nedeniyle reddedildi; bağlantılar sonlandırılmadı. Dump/restore ayrı DB'de yapıldı. Provider-owned schema restore yalnız izole container'da supabase_admin gerektirdi; ürün yetkileri değiştirilmedi. Sonraki fixture düzeltmeleri: owner-close gerekçesi, recipient projection öncesinde event projection ve gerçek membership `suspended` değeri. Hatalı koşumlar başarılı diye sunulmaz.

Dokuz mevcut teslim fonksiyonu main ve replay DB'de karşılaştırıldı: lease, process, fail, maintenance, recipient/inbox projection, iki allowed katmanı, sync. CRLF→LF dışında normalization yok;9/9 eşleşti. Bu tüm şema/migration parity iddiası değildir.

## Yerel dağıtım bağlantısı

`vercel.json` artık `/api/internal/cron/notification-outbox` için dakikalık cron tanımı içerir. Mevcut `/api/:path*` rewrite'ı ve gerçek `api/index.js` adapter kodu üzerinden hedef `/internal/cron/notification-outbox` olur; Authorization başlığı korunur. Adapter kontrolünde app composition izole edilmiştir; hosted rewrite testi değildir. Mevcut cron-secret gate, hatalı/eksik secret ile çağrıyı reddeder.

CRON_SECRET ve server-side Supabase service key production ortamında hazır olmalıdır; değerleri repo/client'a konmaz. Dakikalık Vercel cron Pro/Enterprise gerektirir; Hobby yalnız günlük çalışır. Kaynak: [Vercel cron sınırları](https://vercel.com/docs/cron-jobs/usage-and-pricing). Bağlı `.vercel/project.json` projesi connector üzerinden403 döndürdü; hesap planı, production secret, cron kaydı ve çalıştırma logları doğrulanmadı. Deployment veya abonelik değişikliği yapılmadı. Yalnız yerel config eklendi.

Bu cron retry/expiry için periyodik kurtarma yoludur. Bir dakikalık cadence tek başına G07'deki commit→canlı inbox P95≤3 sn hedefine yeterli değildir. Sonraki uygulamada exchange command sonrası anlık scoped teslim ve inbox invalidation eklendi; güncel ölçüm ve sınırlamalar [immediate-inbox kanıtında](../immediate-inbox/README.md). Staffing fast path, hosted ve kalan rol matrisi nedeniyle G07/G09 açık kalır. Vercel scheduler üretim deploy'larında çalışır; preview veya yerel dev server'da kendiliğinden aktif değildir. [Resmi çalışma modeli](https://vercel.com/docs/cron-jobs), [yönetim ve secret](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

API odaklı worker6 + gerçek app cron-gate1 =7/7; API typecheck PASS. Supabase RPC sözleşmesi [resmi RPC dokümanı](https://supabase.com/docs/reference/javascript/rpc) ile kontrol edildi; test adaptörünün gerçek PostgREST olmadığı özellikle ayrılır. İnsan UI/reader, hosted cron ve dış provider teslimi bu kanıtın kapsamında değildir.

## Sonuç: PASS

Son rapor `sx_relay_1788817828557`;9 senaryo kontrolü ve16 batch çağrısı. [Tam yerel sonuç](result.json), [fonksiyon parity](function-parity.json).

| İşlem | Doğrulanan sonuç |
|---|---|
| Üç gönüllü |7 event işlendi; manager'da tek3-candidate görevi, eski owner korunur. |
| Final onay / tek teslim hatası |4 event:3 teslim,1 retry. Owner, winner ve diğer iki gönüllü doğru sonuçları alır; manager görevi kalkar. |
| Retry |Gerçek1 sn backoff sonrası1 event teslim edilir; atama/case/entries ve mevcut2 shared snapshot before-after eşittir. |
| Tekrar batch |Leased0, görünür duplicate0. |
| Direct decline |Sadece owner'a ret sonucu; eski davet kaldırılır; case cancelled, owner aynı. |
| Direct accept→withdraw |Kabulde manager görevi oluşur, owner aynı; withdraw sonucu owner'a gider, eski peer/manager görevleri kalkar. |
| Bir adayı reddet |Diğer başvuru pending_manager; manager kartında1 candidate; atama değişmez. |
| Owner close |Manager/fırsat görevleri kalkar; önceki ret tarihi/status korunur; owner aynı. |
| Projection sonrası eligibility değişimi |Job assignment'ı biten ve membership'i suspended olan adaylarda inbox0; uygun adayda1 fırsat. Sıfır başvurulu kapanışta yeni event olmadan fırsat kalkar. |

Gerçek source replay DB'de mevcut50 outbox satırı korunur. Yeni iş senaryoları yalnız kopyalarda çalıştı; failure trigger `finally` ile kaldırılır. Sahipli container koşumdan sonra başlangıçtaki stopped durumuna döndürüldü; test veritabanları ve audit silinmez.
