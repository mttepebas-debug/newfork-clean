# AT42 / G07 — staffing canlı yenileme ve ileri tarih bağlantısı

2026-09-07, gerçek yerel Auth/API + IAB employee UI. Bu tur screenshot alınmadı; accessibility tree ve normal UI tıklamaları kullanıldı. Manager komutları ayrı gerçek API oturumundan gönderildi. İki bağımsız açık browser oturumu veya 30 örnekli hız ölçümü değildir.

## Yeni teklif, 2 Kasım

Sahipli QA workspace içinde yalnız open published shift seed edildi. Manager API yeni teklif oluşturduğunda açık Employee Shift Hub /My requests görünümüne `Server at QA Dining, 2026-11-02` kartı, Accept/Decline ve aynı proposal ID’li Line Up bağlantısı manuel yenileme olmadan geldi. Employee UI Accept sonrası `Awaiting manager` ve `Not added to your schedule yet`; gerçek snapshot owner null, entry/snapshot değişmez ve employee final confirmation HTTP403.

- Shift: `e70c9160-e1c3-42c3-a098-df3d41856df0`
- Proposal: `e88fd7b6-9c26-4ed9-a656-5dc7eee3b943`
- Command start: 1788810261013 ms; API response observed: 1788810262195; UI AX observed: 1788810269950.

Bu zamanlar araç örnekleme aralıklarını da içerir; komut başlangıcı→AX gözlemi 8.937 sn üst sınırdır, commit→ilk görünür an ölçümü değildir. P95≤3 sn sonucu olarak kullanılamaz.

Final kontrolünde Auth login isteği timeout oldu. Teklifin accepted kaldığı, API/Auth health200 ve aynı process/container’ların çalıştığı doğrulandı; server restart yapılmadan aynı kayıtla retry başarılı oldu. Genel Schedule ekranının 42 günlük penceresi Kasım’ı kapsamıyordu. Bu gözlem realtime başarısızlığı olarak yorumlanmadı; aşağıdaki tarih düzeltmesini gerektirdi. 2 Kasım kaydı confirmed olarak korunur; bu olayın inbox teslimi bu tur yapılmadı.

## İleri tarihli Schedule, 16 Kasım

9 Kasım için hazırlık mevcut unpublished publication’ı görüp yazım yapmadan durdu. 16 Kasım’ın mevcut current publication’ı korunarak yalnız yeni open shift eklendi. Teklif ve employee kabulü gerçek API yolundan; browser önceden `/app/employee-hub/schedule?date=2026-11-16&view=day` üzerinde açık.

1. Başlık `Mon, Nov 16`, açıklama `Your published shifts for Mon, Nov 16.`, atama yok.
2. Employee accept sonrası hâlâ atama yok; entries/snapshots eşit.
3. Manager fresh preview + confirm.
4. Aynı açık sayfa, navigasyon/yenileme olmadan `9a–12p /Server /QA Dining /Mon, Nov16` satırını ekledi. Aynı source shift ID’li cover/swap bağlantısı görüldü.
5. Yeni producer’ın zaten oluşturduğu iki outbox kaydı doğrulandı; geçmiş backfill yapılmadı. Yalnız bu sahipli eventler lease edilerek gerçek relay RPC çalıştırıldı. Her recipient inbox1, retry0; read state ve domain snapshot korundu.
6. Gerçek employee Notifications → yeni View assignment → **16 Kasım** Schedule; aynı shift görüldü. Generic 42 günlük listeye düşmedi.

Kimlikler:

- Shift: `b94d109c-9dbd-4a1f-a832-25f97ab3d426`
- Proposal: `bb31c502-8a01-4100-8c46-2affeb04157f`
- Operation event: `0c8afca5-b3a0-4f80-89de-84eb6782a7e5`
- Employee inbox: `f3f1f745-8bdb-4780-8d77-2f343766319b`
- Final command start: 1788813083454; API response observed: 1788813084963; updated AX observed: 1788813096523.

13.069 sn komut→AX üst sınırı, ilk render gecikmesi veya P95 ölçümü değildir. Browser fallback periyodu ve araç gözlem aralığı ayrı değerlendirilmelidir. Otomatik cron/batch scheduling de bu scoped relay çalıştırmasıyla kanıtlanmaz.

## Kod ve doğrulama

- 14000 migration: proposal insert, gerçek status değişimi ve operation event insert mevcut workspace invalidation kanalını tetikler. Broadcast payload workspace ID + altyapının random message ID’sidir; person/shift/status içeriği yok. API yetkili okumaları cache’i yeniler. Realtime database broadcast davranışı [Supabase resmi dokümanı](https://supabase.com/docs/guides/realtime/broadcast#broadcast-from-the-database) ile kontrol edildi.
- EmployeeHubPage seçili gerçek `view=day&date` için API’den o günü ister; geçersiz takvim günü normal pencereye döner. Tarih başlık ve açıklamada görünür; Show all upcoming shifts korunur.
- 15000 migration: yeni staffing assignment bildirimleri etkilenen kişiye ait local gün linkini üretir. Cross-date swap’ta source ve counterpart farklı alınan günlere yönlenir. Mevcut inbox geçmişi yeniden yazılmaz.
- Staffing SQL **53/53** asıl local DB; trigger privileges **3/3**; web hook5 + EmployeeHub18 =**23/23**; shared catalog**7/7**; web typecheck ve hedefli ESLint PASS.
- 14000/15000 yalnız asıl local DB’ye uygulandı ve migration history/schema reload kaydı var. Bu iki yeni migration için izole replay/hosted uygulama iddiası yok.
- Tekrarlanabilir: `shift_exchange_staffing_realtime_local.py verify day-link` **PASS**; `shift_exchange_staffing_inbox_local.py day-link` **PASS**. State/report dosyaları `supabase/.temp/shift-exchange-staffing-realtime-day.json` ve `shift-exchange-staffing-day-inbox.json`.

AT32 ve AT42 PARTIAL; iki hafta/lokasyonlu gerçek swap için tüm açık ekranlar, 30 latency örneği, reconnect/fallback browser ölçümleri, insan UI/UX kabulü ve hosted pilot açık. Manager hesabı geri yüklenir; Chrome’daki kullanıcı sekmelerine dokunulmadı.
