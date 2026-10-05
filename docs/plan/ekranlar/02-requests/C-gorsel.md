# C — Requests: görsel QA (EKRAN-02, 2026-10-05, e929abc7)
KARAR: BULGU VAR (kritik 0, yüksek 3, orta 13, düşük 6)

## Özet
- Time off sekmesinin üst kısmı (başlık, kuyruk düğmeleri, filtreler, tablonun yeri) liste sayfalarının ortak iskeletine piksel piksel uyuyor. Çekmece ve onay pencerelerinin temel klavye davranışı da doğru.
- **En büyük sorun klavye kullanıcısı için.** Sayfanın neredeyse hiçbir öğesinde görünür odak halkası yok. Deny ya da Revoke penceresinden vazgeçildiğinde odak kayboluyor ve Esc çekmeceyi artık kapatmıyor.
- **Shift changes tarafında yıkıcı onay düğmeleri yeşil:** "Decline application" ve "Close search". Buton dilini ihlal ediyor ve backlog'da yok.
- Prototip denetimindeki dört kusurun dördü de gerçek uygulamada gözle doğrulandı: R9 arama kutusunda çift çerçeve, R10 sıralı sütunun okunun görünmemesi, R25 açılan vardiya listesinin kelime kelime kırılması, R28 Deny ve Revoke'un düz beyaz görünmesi.
- Yükleniyor ve hata hâlinde başlık ve sekmeler kayboluyor. Hata hâlinde ekrana ham "Failed to fetch" basılıyor, bozuk cevapta ise ham zod JSON'u.
- Time off ile Shift changes iki ayrı tasarım dili gibi görünüyor. Aynı durum çipi listede yeşil, çekmecede amber. Tarih biçimleri dört farklı şekilde yazılıyor.
- KARARLAR'daki Requests'e özel üç ekran kararı uygulanmış. Liste sayfalarının ortak dili Requests'e taşınmamış (BL-604).
- Yeni bulgular: yeşil yıkıcı düğmeler, çip rengi uyuşmazlığı, durum ekranlarında başlık ve sekme kaybı, Activity zaman damgası, aria-pressed eksikliği, satırın birleşik ekran okuyucu adı, "Cancel swap request" adlandırması. Gerisi zaten backlog'da.

## Nasıl bakıldı
- **Sunucular:** web 5630, api 5631 (işçi oturumu 1 portları), dal `task/ekran-02-requests` @ `e929abc7`. Gerçek tarayıcı (Chrome, Playwright, başsız). API'ye giden GET dışı her istek tarayıcıda engellendi (500 döndü). Hiçbir karar verilmedi, veri yazılmadı. Yerel DB'de yalnız SELECT çalıştırıldı.
- **Hesaplar:**
  - World `e2e1790876179369`: owner (`owner.4f81cbfa`), tek lokasyonlu müdür Ayşe (`ayse.1be2994c`, yalnız Kadıköy), çalışan Emre (`emre.1aa41b56`).
  - Shift changes için World `e2e1791169724712` owner'ı (`owner.72a353da`).
- **Genişlikler:** masaüstü 1440×900, telefon 390×844.
- **Gerçek veri:**
  - Ali'nin bekleyen izni (Fri Oct 9, Kadıköy + Beşiktaş onayı gerekiyor).
  - Closed kuyruğu: onaylı, iptal edilmiş, reddedilmiş izinler ve onaylı bir iptal talebi.
  - Shift changes'teki gerçek "Ready for review" takası. Bu takas 2028'de; sayfanın kendi `?from=2028-10-10&to=2028-11-20` adres parametresiyle görüldü, taklit gerekmedi.
- **Taklit cevapla görülenler** (yalnız GET cevabı değiştirildi):
  - "Shifts that become open" iki vardiya.
  - Kontrol listesinde bir lokasyonun onaylı hâli.
  - Uzun ad.
  - Açılan vardiya listesi (R25).
  - "Older" sayfalama düğmesi.
  - Bozuk cevaptaki hata ekranı.
- **Hata hâli:** yalnız `/schedule/requests` isteği tarayıcıda kesilerek görüldü. Bütün API kesilince workspace düzeyindeki "That workspace didn't load" kartı çıkıyor.
- **Çevre notu:** Başsız Chrome bu makinede Türkçe yerel ayarla açıldı. Bu yüzden tarayıcıya bırakılan tarih alanları "31.10.2028", zaman damgaları "01.10.2026 11:10:16" biçiminde göründü. ABD tarayıcısında "10/1/2026, 11:10:16 AM" görünür; bulgu 12 bu farkı hesaba katıyor.
- **Skill:** `superpowers:verification-before-completion` skill olarak açılmadı. Her iddia aşağıdaki ekran görüntüsü ya da ölçümle kanıtlı.

## 1. Bulgular (önem sırasıyla)

**1. Yüksek — Görünür odak yok.** `leave: medium / do: safe` — **BL-657**
- **Nerede:** Requests → Time off ve çekmece. Odak halkası şu öğelerin hiçbirinde yok: Time off / Shift changes sekmeleri, Needs review / Closed, beş sıralama başlığı, satırlar, çekmecenin X'i, Deny, Approve, Revoke, Shorten.
- **Örnek:** Ayşe Tab ile Ali'nin satırına geliyor; satır hiç değişmiyor, hangi talebi açacağını göremiyor.
- **Kanıt:**
  - Odaktaki her düğmede `outline: none`, `box-shadow: none` ölçüldü. İz yalnız açılır listede (1 px içten yeşil) ve aramada (kenar yeşile dönüyor).
  - `apps/web/src/views/requests-catalog.css:215-219`.
  - Görüntüler: `02-owner-1440-row-focus.png`, `19c-crop.png` (Deny odakta), `19b-crop.png` (sıralama odakta yalnız soluk bir ok).
- WCAG 2.4.7 ve CLAUDE.md §9 ihlali.

**2. Yüksek — Onay penceresinden vazgeçince odak kayboluyor, Esc çekmeceyi kapatmıyor.** `leave: medium / do: moderate` — **BL-656**
- **Nerede:** Requests → talep → Deny (not kutulu pencere) ve Revoke (gerekçe kutulu pencere).
- **Örnek:** Owner Ali'nin talebinde Deny'a basıp Esc ile vazgeçiyor. Odak sayfanın gövdesine düşüyor, ikinci Esc'te çekmece açık kalıyor.
- **Kanıt:**
  - Ölçüm: "AFTER ESC deny: focus BODY / drawer open: 1", ardından "AFTER 2nd ESC: drawer open: 1".
  - Revoke'ta Cancel sonrası da odak BODY'de kalıyor.
  - Not kutusu olmayan Approve penceresinde Cancel odağı doğru biçimde Approve'a döndürüyor; sorun kutudaki `autoFocus`'ta.
  - Owner ve müdürde, 1440 ve 390'da aynı.
  - `apps/web/src/shell/ConfirmDialog.tsx:55-91`, `ScheduleRequestsPage.tsx:567-569`.
  - Görüntüler: `04-owner-1440-deny-dialog.png`, `09-owner-390-revoke-dialog.png`.

**3. Yüksek — Shift changes'te yıkıcı onay düğmeleri yeşil.** `leave: high / do: safe` — **YENİ**
- **Nerede:** Requests → Shift changes → takas çekmecesi:
  - Review → "Decline this application" → sağ pencerede "Decline application".
  - "Cancel swap request" → "Close this search" penceresinde "Close search".
- **Örnek:** Owner Deniz'in başvurusunu reddedecek. Son düğme Time off'taki kırmızı Deny gibi değil, Approve ile aynı yeşil.
- **Kanıt:**
  - Ölçülen zemin `rgb(37,107,86)`, yani aksiyon yeşili.
  - Aynı ekranda Time off'un Deny / Revoke onayı kırmızı `rgb(168,64,52)`.
  - Görüntüler: `27-owner2-1440-sc-cancel-sheet.png`, `28-owner2-1440-sc-decline-sheet.png`.
  - Sınıflar `ShiftExchangeHub.tsx:92-169` (`sx-primary`) ve `requests-catalog.css:146-154`.
- Buton dili kuralı (yıkıcı iki tık kırmızı) ihlali.

**4. Orta — Telefonda tablo başlıkları sütunlarla eşleşmiyor, "Decide by" kayboluyor.** `leave: low / do: safe` — **BL-513**
- **Nerede:** Requests → Time off listesi, 390 px.
- **Örnek:** Ayşe telefonda "STATUS" başlığını Ali'nin tarihlerinin üstünde görüyor. Karar son tarihi telefonda hiç görünmüyor.
- **Kanıt:**
  - Başlıklar: Employee x=61, Status x=135, Dates gizli.
  - Hücreler: tarih x=145, durum x=243.
  - "EMPLO…" kesik.
  - `apps/web/src/settings/jobs-settings.css:1150`.
  - Görüntü: `01-owner-390-timeoff-needs-review.png`.

**5. Orta — Çekmecede Deny ve Revoke kırmızı tonsuz, düz beyaz (R28).** `leave: low / do: safe` — **BL-256 / BL-399**
- **Nerede:** Requests → Time off → talep → alttaki karar çubuğu.
- **Örnek:** Deny, Revoke ve Shorten time off aynı beyaz kutu; yıkıcı olan ayırt edilmiyor.
- **Kanıt:**
  - Ölçülen değerler: zemin `#fff`, kenar `#e1e7e3`, yazı `#24382f`.
  - Yerel `.nf-button.danger` kuralı daha ağır seçiciye yeniliyor (`requests-catalog.css:126-160`).
  - Görüntüler: `03-owner-1440-drawer-pending.png`, `08-owner-1440-drawer-approved.png`.

**6. Orta — Shorten formu çekmeceyi kaplıyor.** `leave: medium / do: safe` — **BL-658 (1)**
- **Nerede:** Requests → Closed → onaylı izin → Shorten time off.
- **Örnek:** Owner Admin1zs3x'in iznini kısaltırken hangi talepte olduğunu unutuyor.
- **Kanıt:**
  - Karar çubuğu y=268'den başlayıp 631 px yükseliyor; "Choose hours" açılınca başlık ekrandan çıkıyor.
  - Denetimler stilsiz: yerel onay kutusu 19 px; düğmeler 44 px (çekmecenin öteki düğmeleri 36 px).
  - "Give back these hours" 582 px tam genişlik, "Keep time off" onun altında.
  - Telefonda Dates / Submitted değerleri kesiliyor.
  - Görüntüler: `10-owner-1440-shorten-form.png`, `10c-owner-1440-shorten-hours.png`, `10-owner-390-shorten-form.png`.

**7. Orta — Açılan vardiya listesi kelime kelime kırılıyor (R25; taklit veriyle).** `leave: medium / do: safe` — **BL-658 (3)**
- **Nerede:** Requests → Closed → onaylı izin → Activity → "Approved" kaydı.
- **Örnek:** "Entire / shift / released / to / open / coverage" alt alta dizilip "Besiktas · Line Cook" satırının üstüne biniyor.
- **Kanıt:**
  - `li` grid 18px + 516px ölçüldü; iç `li` de ızgara oluyor.
  - `apps/web/src/styles.css:13035-13040`.
  - Görüntü: `32-owner-1440-mock-drawer-released.png`.

**8. Orta — Yükleniyor ve hata hâlinde sayfa çerçevesi kayboluyor, hata metni ham.**
- **Nerede:** Requests açılırken ve okuma hatasında.
- **Örnek:** Owner'ın bağlantısı kopuyor. Ortada beyaz kutuda yalnız "Failed to fetch" görüyor:
  - başlık ve sekmeler yok, Shift changes'e geçemiyor;
  - yeniden deneme düğmesi yok;
  - yazı `role="alert"` ya da `status` taşımıyor.
- Bozuk bir sunucu cevabında ekrana ham zod JSON'u basılıyor.
- **Kanıt:**
  - `ScheduleRequestsPage.tsx:279-290` ve `:835-847`.
  - Görüntüler: `16-owner-1440-loading.png`, `18-owner-1440-requests-error.png`, `33-owner-1440-mock-parse-error.png`.
- **BL eşlemesi:**
  - Ham metin kısmı: **BL-654**, `leave: medium / do: safe`.
  - Başlık ve sekmelerin kaybolması ve yeniden deneme olmaması: **YENİ**, `leave: medium / do: safe`.

**9. Orta — Telefonda Shift changes filtrelerinin arasında büyük boşluklar.** `leave: low / do: safe` — **BL-400**
- **Nerede:** Requests → Shift changes, 390 px.
- **Örnek:** Lokasyon seçicisi y=378'de, arama y=533'te, tablo ekranın altında.
- **Kanıt:**
  - Etiket 145 px, filtre kutusu 300 px yüksek.
  - `shift-exchanges.css:127-129` + `:766-768`.
  - Requests'in kendi kuralı da aynı tuzağa düşüyor: `requests-catalog.css:415-417` (`flex: 1 1 145px`).
  - Görüntü: `12-owner-390-shift-changes.png`.

**10. Orta — Time off ile Shift changes arasında görünüm farkı ve sekme değişince tablonun kayması.** `leave: medium / do: safe` — **BL-658 (4)(5)(6)** + **YENİ** (kayma)
- **Örnek:** Owner sekme değiştirince filtreler ve tablo aşağı kayıyor, kuyruk denetimi başka bir bileşene dönüşüyor.
- **Ölçülen farklar:**

| Öğe | Time off | Shift changes |
|---|---|---|
| Tablonun başladığı yer | y=292 | y=322 (araya "N cases ready…" satırı giriyor) |
| Kuyruk denetimi | gri | yeşil tonlu |
| Arama kutusunda simge | var | yok |
| Liste başlık satırı | 40 px, 11/800 | 34 px, daha açık |
| Lokasyon açılır listesi | 200 px, "All locations" | 220 px, "All my locations" |
| Boş hâl | düz | kesik çizgili çerçeve |
| Çekmece başlığı | "REQUEST REVIEW" + ad + durum çipi | "Shift change" + açıklama |
| Çekmecenin X'i | 38×36, çerçevesiz | 32×36 çerçeveli; içindeki simge 10×17'ye sıkışmış |

- Sekme geçişinde kayma, liste sayfalarının sabit iskelet kuralına (KARARLAR "Genel") aykırı.
- **Kanıt:** `01-owner-1440-…`, `12-owner-1440-shift-changes.png`, `20-owner2-1440-sc-ready.png`, `22-owner2-1440-sc-drawer.png`.

**11. Orta — Aynı durum çipi iki renkte.** `leave: low / do: safe` — **YENİ**
- **Nerede:** Shift changes listesi ve çekmecesi; Time off listesi.
- **Örnek:**
  - "Awaiting manager" listede yeşil (`#e8f2ed` / `#24382f`), aynı vakanın çekmecesinde amber (`#fff4d9` / `#77510d`).
  - Time off'ta "Pending" de yeşil. Ortak çip dilinde bekleyen durum amber.
- **Kanıt:** s10 ölçümü; `20-owner2-1440-sc-ready.png`, `22-owner2-1440-sc-drawer.png`.

**12. Orta — Tarih ve saat dört farklı biçimde, saat ayarı yok sayılıyor.**
- **Örnekler:**
  - Activity: "Ali Person · 01.10.2026 11:10:16". Tarayıcının diline bağlı, saniyeli, 12/24 saat ayarını yok sayıyor. Liste aynı günü "Oct 1" yazıyor.
  - Shift changes listesi: "2028-10-24 / 09:00 – 15:00".
  - Takas çekmecesi: "Decision needed before 10/24/2028, 9:00:00 AM · Europe/Istanbul" ve aday kartında "04.10.2026 20:11:03".
  - Shorten formu: "Oct 31, 2028, 12:00 AM GMT+3". Bu formun hemen üstündeki dönemler "Istanbul time" yazıyor.
- **Kanıt:**
  - Activity: `ScheduleRequestsPage.tsx:820` (`toLocaleString()`).
  - Görüntüler: `03-…`, `10-…`, `20-…`, `22-…`.
- **BL eşlemesi:**
  - Shift changes kısmı: **BL-674**, `leave: medium / do: safe`.
  - Time off Activity ve Shorten'daki "GMT+3": **YENİ**, `leave: low / do: safe`.

**13. Orta — Form alanı kenarları beyaz zeminde görünmüyor.** `leave: medium / do: moderate` — **BL-255**
- **Nerede:** Lokasyon açılır listesi, arama kutusu, beyaz düğmeler (Deny, Revoke, Choose hours).
- **Örnek:** Arama kutusunun sınırı zor seçiliyor.
- **Kanıt:** Kenar `#e1e7e3`, beyaz üzerinde ≈1,25:1 (gerekli 3:1, WCAG 1.4.11).

**14. Orta — Arama kutusu iki çerçeve çiziyor (R9).** `leave: medium / do: safe` — **BL-658 (2)**
- **Kanıt:**
  - Dış etiket: 1 px `#e1e7e3`, köşe 6.
  - İç input: ayrıca 1 px `#e1e7e3`, köşe 5. `border: 0` kuralı daha ağır seçiciye yeniliyor.
  - `requests-catalog.css:164-182` ve `:186` sonrası.
  - Görüntü: `01-owner-1440-timeoff-needs-review.png` (iç kutu belirgin).

**15. Orta — Sıralı sütunun oku görünmüyor (R10).** `leave: low / do: safe` — **BL-663**
- **Örnek:** Owner Closed'u Status'a göre sıralıyor. Ok yalnız fare üzerindeyken çıkıyor; fare çekilince hangi sütuna göre sıralı olduğu belli değil.
- **Kanıt:**
  - `aria-sort` doğru ("ascending"), görsel işaret yok.
  - Görüntüler: `07-owner-1440-sorted-status.png` (ok yok), `07b-…-hover.png` (ok var).

**16. Orta — Liste sayfalarının ortak dili Requests'e yayılmamış.** `leave: medium / do: moderate` — **BL-604**
- **Farklar:**
  - Başlık satırı `#f3f5f3` / `#68726e` 11/800; ortak dil `#e6ece8` / `#4f5d57` 11/600.
  - Açılır liste kenarı `#e1e7e3`, köşe 5; ortak dil `#aeb9b4`, köşe 6.
  - Sekmeler sayfa başlığının sağında; ortak dilde başlık sağı boş ve sekme satırı altta.
- Mert'e sorulacak ayrı tutarlılık işi; burada yalnız kayıt.

**17. Düşük — Karar verilmiş iptalde yanlış metinler.** `leave: low / do: safe` — **BL-653** (+ küçük **YENİ** ek)
- **Nerede:** Closed → Ali Person "Leave cancellation" (onaylı).
- **Gözlenen:**
  - "The time off stays in place until this is approved." yazıyor; talep zaten onaylı.
  - Müdürün notu "Employee note" başlığıyla duruyor.
  - Aynı not Activity'de iki kez daha tekrarlanıyor.
- **Yeni ek:** Owner'a "View-only access" yazıyor. Owner için yanıltıcı; asıl söylenmesi gereken "karar verilecek bir şey yok".
- **Kanıt:** `11-owner-1440-drawer-cancellation.png`.

**18. Düşük — "All 1 active applications will close."** `leave: low / do: safe` — **BL-661**
- "Close this search" penceresinde. Görüntü: `27-owner2-1440-sc-cancel-sheet.png`.

**19. Düşük — Seçim durumu ekran okuyucuya söylenmiyor.**
- Needs review / Closed düğmelerinde `aria-pressed` yok; seçili olan yalnız görsel olarak belli. **YENİ**, `leave: low / do: safe`.
- Sayfa başlığındaki Time off / Shift changes sekmeleri ok tuşuyla gezilmiyor; `tabpanel` ve `aria-controls` yok. **BL-602**'ye Requests de eklenmeli, `leave: medium / do: moderate`.
- Kanıt: s14 ölçümü.

**20. Düşük — Satırın ekran okuyucu adı birleşik.** `leave: low / do: safe` — **YENİ**
- Okunan ad: "Ali PersonOct 9, 2026 - Oct 9, 2026Oct 8, 12:00 AM Istanbul timePending".
- Review sütunundaki "⚠ 2" anlamını yalnız `title` ile veriyor.
- `ScheduleRequestsPage.tsx:595-637`.

**21. Düşük — "Cancel swap request" açılınca adı değişiyor.** `leave: low / do: safe` — **YENİ**
- Düğme "Cancel swap request" diyor; açılan pencerenin başlığı "Close this search", onay düğmesi "Close search".
- Kanıt: `25-owner2-1440-sc-review.png`, `27-…`.

**22. Düşük — Müdürün tek tıkla onayı başarısız olunca odak kayboluyor.** `leave: low / do: safe` — **YENİ**
- **Nerede:** Ayşe → Ali'nin talebi → Approve. Onay penceresi açılmıyor; bu kurala uygun, hiçbir vardiya açılmıyor.
- **Gözlenen:** Benim engellediğim istek hata verince çekmecede kırmızı bildirim çıkıyor (doğru), ama odak gövdeye düşüyor.
- Görüntü: `05-manager-1440-approve-dialog.png`.

## 2. KARARLAR ekran kararlarının durumu

| Karar | Durum | Kanıt |
|---|---|---|
| Shift changes sekmesinde sayı rozeti yok | Uygulanmış. Sekmede rozet yok. Shift Hub sayıyı kendi "Ready for review 1" satırında veriyor. | `12-…`, `20-…` |
| "Select a request" yer tutucusu hiç görünmez | Uygulanmış. Metin kodda yok; çekmece yalnız satır seçilince açılıyor. | grep sonucu boş |
| İzin verisi iki sekmede de yüklenir | Uygulanmış. Shift changes açıkken "Time off 1" sayısı duruyor. | `12-owner-1440-shift-changes.png` |
| Bekleyen talebi yalnız karar veren ve sahibi görür | Kısmen doğrulandı. Kadıköy müdürü Ayşe, Kadıköy onayı gereken Ali'yi görüyor. Eş müdürün görmediği test edilmedi. | `01-manager-1440-…` |
| İlerleme paneli "a — kontrol listesi" | Uygulanmış. Lokasyonlar alt alta; onaylananda ✓ ve "Zeynep Person · Oct 2, 2:12 AM", bekleyende "Waiting". Lokasyon kartı ya da çubuk yok. | `03-…`, `30-owner-1440-mock-drawer-impact.png` (taklit) |
| Liste sayfalarının ortak dili | Requests kararın altı sayfasında değil; bekliyor (BL-604). Time off'ta iskelet y değerleri tutuyor: üst yazı 62, başlık 80 / 44 px, kuyruk 190, filtre 240, tablo 292. Shift changes'te tablo 322. | s1 ölçümü |
| Telefonda kart satırı | Requests listede değil; telefonda sıkışık tablo duruyor (bulgu 4). | `01-owner-390-…` |
| Buton dili | Time off'ta son adım kırmızı, doğru. Shift changes'te yeşil, ihlal (bulgu 3). Çekmecedeki ilk adım beyaz (bulgu 5). | — |
| Tarayıcı diyaloğu yok | Doğru. Hiçbir oturumda `dialog` olayı oluşmadı. | betik günlükleri |

## 3. Temiz çıkanlar
- **Metin kontrastı** AA'yı geçiyor:

| Öğe | Oran |
|---|---|
| Seçili sekme | 5,89 |
| Seçili olmayan sekme | 4,76 |
| Sayı rozeti | 6,53 |
| Tablo başlıkları | 4,54 (11/800) |
| Hücre yazısı | 5,12 |
| Çip yazısı | 10,9 |
| Onay pencerelerindeki kırmızı düğme | 6,09 |
| Approve | 6,33 |

- **Talep çekmecesi:**
  - `role="dialog"`, `aria-modal`, adı "Review request".
  - Açılınca odak çekmeceye giriyor; Tab çekmecenin içinde dönüyor.
  - Esc çekmeceyi kapatıp odağı açan satıra geri veriyor.
  - Masaüstünde 640 px, telefonda tam genişlik.
- **Onay pencereleri:**
  - `alertdialog`. Approve penceresi odağı Cancel'da açıyor, Cancel odağı Approve'a geri veriyor.
  - Revoke gerekçe yazılana kadar kapalı (opaklık 0,55).
  - Metinler doğru. Taklitte "2 published shifts become open shifts." çıkıyor.
- **Takas onay penceresi:** odak X'te açılıyor, Esc odağı açan düğmeye geri veriyor.
- **Klavye sırası** mantıklı: sekmeler, kuyruk, lokasyon, arama, sıralama başlıkları, satırlar.
- **Çalışan erişimi:** Emre adresi elle yazsa da Employee Hub'a yönleniyor.
- **Sayfalama:** "Older" düğmesi taklit veriyle doğru yerde çıkıyor.
- **Uzun ad:** "Alessandra Montgomery-Fitzgerald" masaüstünde taşmıyor.
- **Metin:** sistem kelimesi olarak yalnız menüde "Workspace" var. Ekranda kod adı görülmedi; IANA saat dilimi adları için bulgu 12'ye bakın.

## 4. Sınırda
- **Workspace → "Pending requests" kartı:** "1 Time off · 0 Shift changes · Review requests →". Time off sayısı Requests'le tutarlı. Shift changes 0, çünkü Shift Hub'ın varsayılan 42 günlük penceresiyle aynı (e2e takasları 2028'de). Görüntü: `15-owner-1440-workspace-boundary.png`.
- **Menü:** Sol menüde Requests için bekleyen talep rozeti yok. Telefonda alt çubukta "Requests" sekmesi var.
- **Notifications'taki talep bildirimi:** bakılmadı.

## 5. Bakılamayanlar ve nedeni
- **Toast'lar ve "Saving..." hâli:** karar vermek yasaktı.
- **Shorten formunun "Apply hours" hata metinleri ve "Give back" sonucu:** veri yazar.
- **Ortak erişim-yok kartı:** API'nin "hayır"ı taklitsiz üretilemedi; çalışan yönlendirmeyle çıkıyor.
- **Eş müdürün bekleyen talebi görmemesi:** ikinci bir Kadıköy müdürüyle giriş yapılmadı.
- **Gerçek açılan vardiya, etki listesi ve 50'den fazla talep sayfalaması:** dünyada yok, taklitle bakıldı.
- **%200 yakınlaştırma ve gerçek ekran okuyucu:** bu turda yapılmadı.
- **ABD yerel ayarıyla görünüm:** başsız Chrome Türkçe açıldı. Tarih alanları ve `toLocaleString` ABD tarayıcısında farklı biçimde görünür; bulgu 12 değişmez.
- **Hafıza notu:** bu oturumda dosya yazma kapalı olduğu için rol hafızasına yazılmadı. Not edilmeye değer olanlar:
  - Shift changes için `?from=&to=` parametresi taklitsiz gerçek veri gösteriyor.
  - `e2e1790876179369` dünyasında gerçek bekleyen izin var.
  - Taklitte `time_off_next_cursor` ISO tarih olmak zorunda.

## Ekran görüntüleri (yol listesi)
Hepsi `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\handoff-koordinatorlugu-20c0b3\artifacts\nf-gorsel-qa\EKRAN-requests\` altında:
- **Liste:**
  - `01-owner-1440-timeoff-needs-review.png`, `01-owner-390-timeoff-needs-review.png`, `01-manager-1440-timeoff-needs-review.png`
  - `06-owner-1440-closed.png`, `06-owner-390-closed.png`, `07-owner-1440-sorted-status.png`, `07b-owner-1440-sorted-status-hover.png`
  - `29-owner-1440-mock-list-impact.png`
- **Odak:**
  - `02-owner-1440-row-focus.png`, `02-owner-390-row-focus.png`
  - `19-owner-1440-focus-tab.png`, `19b-owner-1440-focus-sort.png`, `19b-crop.png`, `19c-owner-1440-focus-deny.png`, `19c-crop.png`
- **Çekmece:**
  - `03-owner-1440-drawer-pending.png`, `03b-owner-1440-drawer-pending-full.png`, `03-owner-390-drawer-pending.png`, `03-manager-1440-drawer-pending.png`
  - `08-owner-1440-drawer-approved.png`, `08-owner-390-drawer-approved.png`
  - `11-owner-1440-drawer-cancellation.png`
  - `30-owner-1440-mock-drawer-impact.png`, `30b-owner-1440-mock-drawer-impact-full.png`, `32-owner-1440-mock-drawer-released.png`
- **Pencereler:**
  - `04-owner-1440-deny-dialog.png`, `04-owner-390-deny-dialog.png`, `04-manager-1440-deny-dialog.png`
  - `05-owner-1440-approve-dialog.png`, `05-owner-390-approve-dialog.png`, `05-manager-1440-approve-dialog.png` (müdürün tek tıkla onayı, engellenen istek)
  - `09-owner-1440-revoke-dialog.png`, `09-owner-390-revoke-dialog.png`
  - `31-owner-1440-mock-approve-opens-shifts.png`
- **Shorten:**
  - `10-owner-1440-shorten-form.png`, `10b-owner-1440-shorten-checked.png`, `10c-owner-1440-shorten-hours.png`
  - `10-owner-390-shorten-form.png`, `10b-owner-390-shorten-checked.png`, `10c-owner-390-shorten-hours.png`
- **Shift changes:**
  - `12-owner-1440-shift-changes.png`, `12-owner-390-shift-changes.png`, `13-owner-390-shift-changes-direct.png`
  - `20-owner2-1440-sc-ready.png`, `22-owner2-1440-sc-drawer.png`, `23-owner2-1440-sc-list.png`, `24-owner2-1440-sc-drawer.png`
  - `25-owner2-1440-sc-review.png`, `25b-owner2-1440-sc-review-full.png`
  - `26-owner2-1440-sc-confirm-sheet.png`, `27-owner2-1440-sc-cancel-sheet.png`, `28-owner2-1440-sc-decline-sheet.png`
- **Durumlar:**
  - `16-owner-1440-loading.png`, `17-owner-1440-api-down.png`, `18-owner-1440-requests-error.png`, `33-owner-1440-mock-parse-error.png`
- **Erişim ve sınır:**
  - `14-employee-1440-requests-direct.png`, `15-owner-1440-workspace-boundary.png`

## Durdurulan süreçler (PID)
- **Web (5630):** kök `nohup` 76132 → 5824, 53732, 50428, 30620 (vite), 44252.
- **API (5631):** kök `nohup` 30148 → 54936, 19892, 65212 (`tsx watch` cmd), 50504 (`tsx watch` node), 55892 (sunucu), 13204.
- İkisi de `taskkill /PID <kök> /T /F` ile ağaç olarak durduruldu. Başlangıç saatleri (13:45:28–29) bu oturumun başlatmasıyla eşleşti.
- Sonrasında 5630 ve 5631 portlarının boş olduğu doğrulandı.
