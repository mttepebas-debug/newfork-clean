# AT42 — manager → employee → manager, real local UI

2026-10-05 /QA Dining /09:00–12:00 /Alex Morgan. Yalnız boş published shift test verisi olarak eklendi; teklif ve kararlar ürünün gerçek manager/employee UI ve HTTP yollarından geçti. Mevcut current publication tekrar kullanıldı; başka bir vardiya, owner veya publication status değiştirilmedi.

Kimlikler:

- Shift `07103822-a534-466f-a735-ac116e86fcf5`
- Proposal `ffa9e7ab-ec36-4146-86e3-3ec49c8c1849`
- Operation event `736a4439-b8e0-4f24-baf4-4a9d8c715f8a`

Doğrulanan sıra:

1. Manager → Find available staff: Alex için position/location match, full interval, no conflicts; gerçek preview `allowed=true` ve blockers boş.
2. Manager → Review impact → Send offer for employee response: tek proposal `pending`; published owner null, Line Up ihtiyacı açık.
3. Employee → Shift Hub My requests: tek staffing offer; Line Up linki aynı proposal ID'yi taşır; hedef karta odaklanır.
4. Employee Tab/Enter accept: proposal `accepted`, owner hâlâ null, entries/snapshots başlangıçla aynı. Employee token ile final confirmation isteği HTTP403; denied istek tüm snapshot'ı değiştirmedi.
5. Manager → Review & approve → Review impact → Approve & apply: gerçek UI tekrar uygunluk kontrolü yapar. Yeni odak düzeltmesinden sonra H3 `Review before approval` odaklandı; üç Tab ve Enter ile son onay yapıldı.
6. Final DB: tek confirmed proposal, published owner Alex, aynı source için tek Line Up entry/Alex, tek operation event. Hiç share yapılmadığı için snapshot sayısı sıfır kaldı. Manager ekranında Alex 9a–12p, açık pozisyon 0.
7. Employee Schedule ekranında 9a–12p /Server /QA Dining /Mon, Oct 5 görüldü. Find cover or swap linki aynı shift ID'ye gidiyor.

**Önceki çalışmada bulunan hata (aşağıdaki entegrasyon ile yerelde giderildi):** assignment notification `7929eb8a-cb4b-4e5a-bd27-bc310fc919f4`, `public.notifications` içinde var; bu notification için inbox item **0**, ilgili proposal/operation için notification_outbox **0**. Çalışanın gerçek Notifications ekranında yeni sonuç yok. Bu davranış preference baskılaması diye varsayılmadı: olay modern outbox/recipient/inbox zincirine hiç girmemiş. Line Up producer'ı legacy `notifications` tablosuna doğrudan yazıyor. Sonuç `PARTIAL_INBOX_GAP`; akış bütünü PASS değildir. Sonraki çalışma bu producer entegrasyonunu, alıcı scope/policy, retry/dedupe ve geçerli action route ile tamamlamalı.

İncelenen görüntüler:

- [Manager teklif önizlemesi](manager-offer-review.png)
- [Employee kabul sonucu](employee-accepted.png)
- [Manager final review / odak düzeltmesi sonrası](manager-final-review.png)
- [Manager confirmed kuyruğu](manager-confirmed.png)
- [Manager canlı atama](manager-assignment.png)
- [Employee inbox — eksik sonuç kanıtı](employee-inbox-gap.png)

Manager görüntüleri mevcut 1280×720, employee 891×912 browser yüzeyinden; native zoom/reader/insan UAT veya responsive puan kanıtı değildir. `fullPage` screenshot iç scroll alanını genişletmediği için confirmed kuyruğu ve üstteki canlı atama ayrı görüntülerle belgelendi.

Tekrarlanabilir kontrol: `python supabase/verification/shift_exchange_staffing_e2e_local.py verify`. Gitignored state `supabase/.temp/shift-exchange-staffing-e2e.json`; hiçbir credential rapora yazılmaz. İnbox açığı devam ederken verifier state'i kaydeder ve exit2 döndürür. Atama kontrolü tek başına PASS olsa da bu komut yeşil gate sayılmaz. `prepare` mevcut state üzerinde tekrar seed etmez. İlk boş-hafta preflight duruşu hiçbir DB yazımı yapmadı; aynı current publication'ı koruyarak yalnız yeni source ekleyen fixture kullanıldı.

Final test vardiyası/proposal/audit silinmedi veya geri alınmadı; tamamlanmış, sahipli local QA kanıtı olarak tutuldu. Manager oturumu geri yüklendi. Hosted/pilot ve gerçek insan kabulü açık.


## Staffing inbox düzeltmesi — aynı gerçek UI event’i

Migration `20260909013000_lineup_staffing_notification_inbox.sql` sonrası bu event’in iki legacy bildirimi yalnız sahipli QA workspace/event kontrolüyle enqueue edildi. `shift_exchange_staffing_inbox_local.py` gerçek local relay HTTP RPC ve employee inbox API’sini doğruladı; diğer workspace/eventlere dokunmadı. Bu onarım yeni producer’ın tüm geçmişi kendiliğinden aktarması anlamına gelmez.

- Employee original notification: `7929eb8a-cb4b-4e5a-bd27-bc310fc919f4`.
- Employee outbox: `7814e500-ad2a-4b95-a172-bcdc01ce1442`.
- Employee modern inbox item: `65128bee-be31-4097-a75d-dd927f22973f`.
- Her original notification için inbox1, retry0; assignment/proposal/Line Up before-after aynı.
- Gerçek UI Notifications: `Your assignment has changed`, `Assignment changes · Update`, `View assignment`.
- View assignment tıklaması → `/app/employee-hub/schedule`; AX ağacında aynı shift ID, `9a–12p`, `QA Dining`, `Mon, Oct 5`. Unread sayaç2→1.
- Employee Hub Latest updates da atama bildirimini gösterdi.
- Manager oturumu geri yüklendi; tema/viewport değiştirilmedi.

Bu düzeltme turunda yeni screenshot alınmadı; yukarıdaki eski inbox-gap görüntüsü önceki hatanın kanıtı olarak korunur. Yeni doğrulama gerçek UI tıklamaları ve accessibility tree üzerinden yapıldı. SQL yeni-producer matrix **44/44 iki yerel DB**, eski E2E verifier artık **PASS**; hosted/pilot, insan UAT ve yeni UI zincirinde kendiliğinden teslim gecikmesi açık.
