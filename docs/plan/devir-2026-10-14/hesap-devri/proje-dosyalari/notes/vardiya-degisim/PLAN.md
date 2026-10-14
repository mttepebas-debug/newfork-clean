# Vardiya değişimi: release, seek for cover, swap — plan

Thread: "Takas kırmızı düğmeler" (Mert ile, 2026-10-13). Salt okur planlama; kod yok. Örnek kişiler: Maria (vardiyayı veren), Jake (alan), Rachel (Downtown müdürü).

## 1. Kararlar (Mert)
| Tarih (UTC) | Konu | Karar |
|---|---|---|
| 03:59 | Telefonda çalışanın Schedule sekmesi | Kalır; büyük tablo yerine "Who's working" gün listesi (7 günlük şerit, izin günü de seçilir, lokasyona göre kişi · pozisyon · saat, kendi vardiyası en üstte). Masaüstü aynı. |
| 04:01 | Süreçlerin anlamı | Release = havuza düşer, uygun herkes görür. Seek for cover = belirli kişilere paslanır. Swap = önceden anlaşılmış iki vardiya değişir. Üçü ayrı, adlı seçenek. |
| 04:02 | Müdür onayı | Üçü de müdür onayıyla; onaya kadar vardiya ilk çalışanda. |
| 04:51 | Release bildirimi kime | Uygun herkese (bugünkü gibi). |
| 04:52 | Release kartı düğmeleri | I'll take it (yeşil) + Not for me (kart o kişinin listesinden kalkar, kırmızı sayı düşer). |
| 04:52 | Bırakan geri alabilir mi | Onaya kadar evet (Take back); isteyenlere "Maria kept this shift". Onaydan sonra hayır. |
| 04:52 | Birden çok isteyen | Müdür seçer (saat ve fazla mesaiyle görür); diğerlerine "Another teammate got it". |
| 04:53 | Çalışanlar arası yazışma | Release ve cover'da yalnız veren not yazar; alan, davet edilen, reddeden yazamaz. Sohbet yok. (Swap için 06:43'te değişti.) |
| 04:54 | Cover daveti süresi | Vardiyaya 4 saat kala cevapsız davet kapanır; sorumluluk orijinal sahibinde kalır. |
| 04:55 | Cover reddedilince | Maria seçer: "Ask someone else" ya da "Release to everyone". |
| 04:55 | Cover kaç kişiye | En çok 3 kişiye birden. (06:43'te değişti: kimin alacağını müdür seçer.) |
| 04:56 | 4 saat kuralı | Release, cover, swap: vardiyaya 4 saat kala açık istekler kapanır, yenisi açılamaz; vardiya sahibinde kalır. |
| 05:02 | Swap'ın anlamı | Çalışanlar önceden anlaşır; anlaşılmış değişikliği müdüre sunma ve programa işletme yolu. (06:43'te ayrıntı eklendi.) |
| 05:02 | Lokasyonlar arası swap | Evet; iki lokasyonun müdürü de onaylar. |
| 05:03 | Müdür red sebebi | İsteğe bağlı tek satır; yazılırsa isteyen görür. |
| 05:03 | Müdüre bildirim | İlk isteyende bir kez; sonraki isteyenler yeniden çalmaz. |
| 06:43 | Swap ayrıntısı | İki taraf da çakışma yaratmayan birer vardiya seçer ve değişir; müdür karar verir. İki taraf da karşıya isteğe bağlı not yazabilir; not, onay ya da red bildirimiyle birlikte gider. |
| 06:43 | Cover ayrıntısı | En çok 3 kişiye. Her biri ayrı ayrı kabul ya da red eder. Müdür kabul edenler arasından seçer. Biri onaylanınca diğer istekler düşer ve onlara bildirim gider. Vardiyaya 4 saat kalana kadar cover yeniden 3 kişiye gönderilebilir. Aynı vardiya için aynı anda hem cover hem release açık olamaz. |
| 06:43 | Müdürün karar ekranında gördükleri | Günlük toplam saat, dönem toplam saati, komşu vardiyalarla seyahat süresi ya da en az dinlenme süresi, availability. Seçimini buna göre yapar. |
| 06:43 | Açık vardiyalarda kart arayüzü | Çalışan uygun olduğu açık vardiyaları kartlarla görür; kartı sağa kaydırınca ister, sola kaydırınca geçer. Geçiş, red ve onay animasyonlu tasarlanır. |
| 06:43 | Atanmamış vardiyalar | Schedule'da atanmamış yayınlanan vardiya kendiliğinden açık havuza düşmez; yalnız müdürün planlama kolaylığı içindir. Bir vardiya işten çıkarma, lokasyondan çıkarma gibi bir nedenle sahipsiz kalırsa müdüre "açık havuzda yayınlansın mı?" diye sorulur. |
| 07:08 | Müdür havuza elle koyabilir mi | Hayır. Havuza yalnız çalışanın release'i ve sahipsiz kalan vardiya için müdüre sorulan soruyla (evet derse) vardiya girer. |
| 06:43 | Müdür ekranı | Requests sayfasında istekler tabloda satır olarak kalır (bugünkü gibi). Bir isteğe cevap vermek için Announcements / Important Dates'teki gibi çekmece açılır; bütün ayrıntı, ayarlar ve karar orada. |
| 10:29 (10-14) | İki lokasyonlu swap'ta red | Mert: iki müdürden biri reddettiği an istek kapanır, durum Declined; tek red yeter. Mockup zaten böyle (Rachel reddedince Declined, Expires "—"). Bir müdür onaylayıp öbürü beklerken durum "Waiting for Midtown" (Mert 10:34Z karar kartı, önerilen; reddedilen: Needs decision, Approved). Mockup zaten böyle. |
| 08:50 (10-14) | Sabit başlıklar, telefon kartı tek cümle | Mert'in sayfa yorumları 08:38–08:41Z: telefonda Shift Hub (başlık + sekmeler), Who's working (başlık + gün şeridi + "You're off") ve müdür Requests (başlık + sekmeler) kaydırınca yerinde kalır. Müdür telefon kartı: ikon + masaüstüyle aynı tek cümle + durum ve Expires; gün/saat satırı ve swap satırı kalktı, ayrıntı dokununca çekmecede. |
| 08:45 (10-14) | İnce satırlar, dört durum | Mert'in sayfa yorumları 08:32–08:37Z: satır bildirim gibi ince, tek cümle; "replaces …" ikinci satırı, swap ayrıntı satırları ve "Approved by you" kalktı (ayrıntı çekmecede). Durum yalnız Needs decision / Approved / Declined / Expired; kişi sayısı tablodan kalktı, çekmecedeki liste başlığında kalıyor. İstisna (Mert'e soruldu): iki lokasyonlu swap'ta bir müdür onaylayınca "Waiting for Midtown". Çalışan tarafında "Closes … 4 h before the shift" ve "Asks close 4 h before the shift" yazıları silindi (Released, Cover request, Swap kartları ve Ask for cover penceresi). |
| 08:37 (10-14) | Expires sütunu | Mert'in sayfa yorumu 08:30Z: Waiting sütunu yerine isteğin kendiliğinden düşeceği an; son 12 saatte kırmızı. Yapıldı: Expires (vardiya − 4 saat; swap'ta erken vardiya), satırlar en yakın düşenden başlar, karar verilmişte "—", telefonda "Expires …", çekmecede de aynı kural. Cümlelerden "Decide by" kalktı; "works it instead of" yerine "replaces" ("The person you approve replaces Maria on this shift"). Örnek acil satır: Sam Reed ← Chris Walker, Tue 6:00 PM Midtown, Today 2:00 PM. Yayın 00:05Z'de (limit). |
| 00:58 (10-14) | Satır cümleleri: kim girer, kim çıkar; ikon boyu | Mert 00:53Z: örnekleri birebir kullanma, doğru gramer ve SaaS diliyle yaz (karar kartındaki "Click here" sorusu böylece kapandı: yok); asıl sahip ile yeni çalışanı, özellikle asıl sahip çıkıyorsa, cümlede açıkça söyle (pickup ve cover'da asıl sahip her zaman çıkar, kabul eden girer). Masaüstü: "Jake Miller and 2 others want to take over Maria Lopez's 4:00 PM Server shift at Downtown on Fri, Oct 16." + "The person you approve works it instead of Maria. Decide by Fri, Oct 16, 12:00 PM." Cover: "…offered to cover…". Swap: "Daniel Brooks and Priya Shah want to swap their Server shifts." + "Daniel would work Sun, Oct 18, 3:00 PM at Downtown instead of Priya." (iki satır) + "Decide by Sun, Oct 18, 11:00 AM." Karar sonrası: "Ana Torres took over…" + "Ana works it instead of Maria. Approved by you just now."; red: "Maria still works it." Telefon: kısa cümle ("want to take over Maria Lopez's Server shift"); swap sütunlarında "Daniel works it / instead of Priya"; karar sonrası çipin yanında "Ana works it instead of Maria." Mert 00:54Z: tablodaki ikonlar küçük → masaüstünde de telefondaki gibi 40 px karo, 22 px ikon. Artifact sürüm 2. |
| 00:40 (10-14) | Satır cümleleri, masaüstü ve telefon | Mert 00:28Z: önerilen ikonlar kabul (Pickup = Raised hand, Cover = Steps in, Swap = iki ok); ikondan sonra her satır vardiyayı alacak kişinin adıyla başlayan cümle. Mert 00:30Z: telefonda da kısa, 5N1K cevaplı, şimdiki düzene paralel; mevcut telefon görüntüsü yedeklendi (/mnt/project-files/pages/vardiya-degisim-indir/yedek-2026-10-14-satirlar/). Masaüstü sütunları: ikon · Request · Status · Waiting. Request: "Jake Miller and 2 others would like to pick up Maria Lopez's 4:00 PM Server shift at Downtown on Fri, Oct 16." + soluk satır "Review the details and decide by Fri, Oct 16, 12:00 PM." (son saat = vardiya başlangıcı − 4 saat; swap'ta erken vardiya). Swap: cümle + iki satır "Daniel takes Priya's 3:00 PM Server shift at Downtown on Sun, Oct 18." Telefon kartı: ikon · kısa cümle (kim, kimin vardiyası, iş) · gün · saat · lokasyon satırı · durum çipi + "Decide by Fri, 12:00 PM". Swap telefonda iki eşit sütun (gün, saat, lokasyon, "Priya → Daniel"), swap çekmecesine paralel. Karar sonrası cümle değişir ("Ana Torres picked up…", "Maria keeps the shift.", swap "You approved." + "Waiting for Midtown"). Önerim (Mert onayı bekliyor): "Click here" ve "The request is waiting for your decision" yazılmadı; satırın tamamı açılıyor, durum çipte. Yeni Type/Shift/Location sütunları kalktı; KARARLAR "Requests tek tablo" sütunlarının yerine geçer. Test: https://claude.ai/artifact/723BAcPXjhxwYePzqDGSxk (kaynak /mnt/project-files/pages/vardiya-degisim-mockup.html, asıl kaynak gorsel-kararlar/gelen/vardiya-degisim/index.html). Görüntüler: /mnt/project-files/pages/vardiya-degisim-indir/satir-cumleleri/. |
| 22:33 | Shift changes satır ikonları (Mert 00:28Z: önerilenler kabul) | Mert: Requests → Shift changes satırlarının başında, masaüstü ve telefonda, türün ikonu; Swap'ın iki oku kalır, Pickup ve Cover'a ikon. Adaylar /mnt/project-files/pages/gorsel-kararlar/gelen/vardiya-ikonlari/index.html: Pickup = Raised hand (önerilen), Into the tray, Calendar plus, bugünkü kesik daire; Cover = Steps in (önerilen), Person + check, Umbrella, bugünkü Person + search. Satırda köşeli karo (kişiler yuvarlak kalır); masaüstünde Status'tan önce dar sütun, telefonda baş harf yuvarlağının yerine. Önerilenler mockup'a kondu. |
| 22:27 | Swap çekmecesi telefonda | Mert: telefonda sütunlar eşit değil, yazılar dağınık. Düzeltme: telefonda etiket sütunu kalktı; iki eşit sütun, her şey ortalı; Owner / After swap / Approves her satırın üstünde ortalı küçük başlık. Kontrol satırlarında kural adı üstte, açıklama altında. Masaüstünde de sütunlar çizgiyle ayrıldı ve vardiya hücreleri ortalandı. Görüntüler: /mnt/project-files/pages/vardiya-degisim-indir/swap-v4/. |
| 20:45 | Swap'ta onaylı izin | Mert karar kartında "Swap'ta da aynı" (önerilen): swap'ta da çalışan onaylı izinli olduğu güne düşen vardiyayı alabilir; swap'ı gönderirken ya da onaylarken uyarı görür, müdürler onaylayınca o günün izni düşer, müdür çekmecesinde izin satırı yoktur. Reddedilen: "Swap'ta olmaz". |
| 14:35 | Swap çekmecesi yeniden (onay bekliyor) | Mert 14:24 "devam?" üzerine, 13:57 notuyla. Üstte Schedule gibi okunan tablo: iki sütun iki vardiya (gün, saat · süre, lokasyon etiketi, pozisyon); satırlar Owner (asıl sahibi), After swap (kim çalışacak, yeşil satır), Approves (her lokasyonun müdürü ve durumu). Altında "After the swap": kişi kişi "Takes Priya's Sun shift · Downtown", kötüleşen turuncu ⚠, iyileşen yeşil ↗, Hours her zaman önce → sonra ("42 → 40 h in week of Oct 18 · no overtime"), sorunsuzlar tek satırda "Also OK". Şerit kişi adıyla ("1 warning for Daniel"). Rachel onaylayınca durum "Waiting for Midtown" (iki lokasyon onaylamadan swap bitmez). Telefonda tabloda yüz yok. Onaylı izin swap'ta da pickup/cover gibi (Mert 20:45). Görüntüler: /mnt/project-files/pages/vardiya-degisim-indir/swap-v3/. |
| 14:03 | Çok günlük izin | Mert karar kartında "Yalnız o gün": çok günlük izinde vardiya alınırsa yalnız o günün izni iptal olur, diğer günler izinli kalır. Reddedilen: iznin tamamı. |
| 13:57 | Swap için not (sonra) | Mert: lokasyonlar arası swap olabilir; vardiyaların asıl sahipleri açıkça görünmeli; swap olursa kim hangi vardiyayı alıyor ve bunun artı/eksi etkisi açıkça yazmalı. Swap çekmecesine sonra bakılacak (Mert 13:53). |
| 13:52 | İzinli gün, Cover adı, uyarılar | (1) Onaylı izinli çalışan cover kabul eder ya da havuzdan pickup ederse o günkü izni otomatik iptal olur. Çalışan isterken/kabul ederken uyarı penceresinde bunu görür ve onaylar. Müdürün karar çekmecesinde izinle ilgili hiçbir şey yazmaz (Time off satırı kalktı). 9 Ekim'deki "onaylı izin hiçbir yolla ezilmez" kuralını pickup ve cover için tersine çevirir. Varsayılanlarım: izin müdür onayladığı an düşer, reddederse kalır; çok günlük izinde yalnız o gün düşer (Mert 14:03 onayladı); müdür Schedule'da izinli güne yine yazamaz; Maria'nın cover listesinde izinli kişi etiketsiz görünür; swap ayrıca. (2) Cover isteği müdürde "Cover request" adıyla; çekmece vardiyanın asıl sahibini ve yalnız kabul edenleri gösterir, reddeden görünmez. Başlığın altında "Shift owner: Maria Lopez · Downtown". "3 want it" / "2 accepted" etiketi listenin başlığının yanına taşındı. (3) Yeni uyarılar: Hours günde 8 ya da haftada 40 saati geçerse; Days in a row 7. gün izinsizse. Release'ten gelen istek "Shift pickup" adıyla kalır. |
| 13:09 | Müdür çekmecesi yeniden (onay bekliyor) | Mert 13:07: swap çekmecesi H2'nin kopyası, "aşırı amatör". Mert 13:09: Jake vardiyayı almışken "Release request" demek mantıksız. Önerim: müdür tarafında tür, kararın sonucuna göre: Shift pickup (bir vardiya başkasına geçiyor; release ve cover ikisi de) ve Shift swap. Nasıl başladığı altında küçük: "Open to all" / "Asked 3". Onay düğmesi "Give to Jake". Swap çekmecesi kişi kişi: kişi başlığı + aldığı vardiya kartı + kontrol listesi (önce uyarılar); en altta iki lokasyonun onayı; düğmelerin üstünde tek cümlelik şerit (sarı uyarı, kırmızı engel). Aynı kontrol listesi pickup adaylarında. Çalışan tarafındaki adlar (Release shift, Ask for cover) değişmez. Uygulamadaki H2 penceresinin yerine geçer; KARARLAR kodlama işinde güncellenir. |
| 12:57 | Müdür kararı çekmecede | Mert pencere ve çekmece görüntülerine bakıp "drawer" dedi. Masaüstünde release, cover ve swap kararı sağdan açılan çekmecede (06:43 kararı geçerli; pencere önerim düştü). Çekmece uygulamadaki çekmecelerin başlığıyla (Announcements, Important Dates): solda başlık ve durum etiketi, altında kişiler ve lokasyon, sağda kapat; altta beyaz şerit ve düğmeler. İçi aynı parçalar: vardiya kartı, aday satırları, turuncu/yeşil kutular. Swap'ta H2'nin içi değişmez, kabı pencere yerine çekmece olur; KARARLAR "Takas inceleme penceresi H2" kodlama işinde buna göre güncellenir. Telefonda karar alttan açılır. |
| 12:35 | Mockup onayı | Mert "onaylıyorum": yeni vardiya kartı (1–10), düzeltilmiş bildirim ekranı (an 7) ve 16 anlık mockup'un bugünkü hâli onaylandı. Açık kalanlar: müdür kararı masaüstünde pencere mi çekmece mi; H2'ye fazla mesai kutusu; davet edilen kendi haftalık saatini görsün mü. Kod yok; "kodla" bekleniyor. |
| 12:10 | Vardiya kartı | Mert: 1–10 arasındaki ortalı küçük vardiya kartı "berbat", acilen profesyonel olsun. Yeni kart: solda tarih karosu (FRI / 16 / OCT), sağda büyük saat, pozisyon · süre, lokasyon; altta ince çizgiyle yön (Maria → Jake) ve "In 3 days". Swap'ta iki kart alt alta, arada yuvarlak ⇄. Release/cover karar pencerelerinde de aynı kart. Müdürün swap penceresi (H2, kilitli) değişmedi. |
| 12:01 | Başkasının saati gizli | Ask for cover'da çalışan, adayların haftalık saatini ve kimin alırsa 40 saati geçeceğini (fazla mesai) göremez; listede yalnız ad ve pozisyon. Bunu yalnız müdür, admin ve owner görür (karar penceresi). |
| 10:31 | Tek tasarım dili | Mert: "3 farklı tasarım dili var gibi", daha sade ve modern. Bütün pencereler (çalışan alttan açılan pencereleri, deste kartları, My requests kartı, müdür karar pencereleri, sahipsiz vardiya sorusu) H2'nin parçalarıyla yapıldı: ortalı küçük başlık + isim satırı, ortalı vardiya kartı ve yönü, turuncu/yeşil kutular, kişi satırı, gri alt şerit. Release/cover adayı tek satır (All checks OK / n warnings), seçilince dört kutu açılır. Yeni: istek yol çizgisi (3 adım). Açık: müdür kararı masaüstünde pencere mi (önerim) çekmece mi (06:43); mockup'ta ikisi de var. Önceki mockup: gelen/vardiya-degisim/v1-uc-dil.html. |
| 10:23 | Swap müdür ekranı | Swap kararı çekmecede değil, uygulamadaki kilitli H2 penceresinde (KARARLAR "Takas inceleme penceresi H2"): iki vardiya kartı, her kartta yön (Priya → Daniel), tutmayan kural için turuncu kutu, karşı kartta aynı kural için yeşil kutu. Yol / dinlenme / availability onayı engellemez, onaylı izin engeller. Önerim (onay bekliyor): dönem saati (fazla mesai) için de aynı kutu. Release ve cover çekmecede kalır. |
| 05:39 | Müdüre hatırlatma | Onaylanana kadar 12 saatte bir; ayrıca kapanmadan 4 saat önce (vardiyaya 8 saat kala) son uyarı. |

Çıkarımlar (Mert'in kararlarından türetildi, ayrıca onaylanmadı):
- Son 4 saatte yeni istek açılamaz; vardiya penceresinde "Too close to the shift. Talk to your manager." yazar.
- Cover'da "Maria seçer" adımı üç davetin hepsi reddedince ya da süresi dolunca gelir; Maria yeniden 3 kişiye gönderebilir ya da release'e çevirebilir (cover kapanınca).
- Kaydırma hareketinin yanında aynı işi yapan düğmeler de kalır (klavye ve erişilebilirlik kuralı).

## 2. Giriş noktaları
- Telefon: Home'daki vardiya kartı, Who's working listesindeki kendi vardiyası, Shift Hub. Hepsi aynı "Your shift" penceresini açar.
- "Your shift" penceresinde üç ayrı düğme: **Release shift** · **Ask someone to cover** · **Swap**.
- Masaüstü: aynı pencere Schedule'daki kendi vardiyasından da açılır.

## 3. Anlar ve ekranlar
### Release
| Kim | Bildirim | Ekran (telefon) |
|---|---|---|
| Maria bırakır | — | Pencere: not alanı (isteğe bağlı) + Release shift. Sonra kart "Released · Your manager decides", Take back düğmesi (onaya kadar). |
| Uygun herkes | "Extra shift available" · "Maria can't make Fri, Oct 16 · 4p–10p · Server, Downtown. Want it?" | Kart destesi: Maria'nın notu, vardiya, saat etkisi ("32 → 38 hrs this week"), fazla mesai uyarısı varsa. Sağa kaydır = I'll take it, sola kaydır = Not for me; animasyonlu. Aynı düğmeler kartın altında da var. |
| Jake ister | — | Kart "Requested · Your manager decides". Vardiya programa girmez. |
| Seçilmeyenler | "Another teammate got it" | Kart History'ye geçer. |
| Maria geri alırsa | İsteyenlere "Maria kept this shift" | — |

### Seek for cover
| Kim | Bildirim | Ekran (telefon) |
|---|---|---|
| Maria sorar | — | Pencere: uygun kişiler listesinden (yalnız ad ve pozisyon; başkasının saati ve fazla mesaisi görünmez, karar 12:01) en çok 3 kişi seçer + not. Vardiyada açık release varsa cover açılamaz (ve tersi). |
| Davet edilenler | "Maria asked you to cover" + vardiya + not | Kart: not, vardiya, saat etkisi. Accept · Decline (tek tık, sebep yok). |
| Kabul edenler | — | Her biri "Accepted · Your manager decides" görür. Birkaç kişi kabul edebilir. |
| Müdür birini onaylar | Diğerlerine "Someone else is covering" | Diğer istekler düşer. |
| Hepsi reddeder / süre dolar | Maria'ya "No one could cover" | Bildirimde Ask someone else (yeniden en çok 3 kişi) · Release to everyone. Vardiyaya 4 saat kalana kadar. Vardiya Maria'da. |

### Swap
| Kim | Bildirim | Ekran (telefon) |
|---|---|---|
| Maria önerir | — | Pencere: kendi vardiyası + karşı tarafın tek vardiyası (yalnız iki taraf için de çakışma yaratmayanlar) + isteğe bağlı not. |
| Jake | "Confirm your swap with Maria" + Maria'nın notu | Kart: You give (Sat) / You get (Fri), saat etkisi, not. Confirm · Decline; ikisinde de isteğe bağlı not alanı. |
| Maria | Jake'in cevabı + notu | "Jake confirmed" ya da "Jake declined". |
| Onaydan sonra | — | "Confirmed · Waiting for your manager"; iki lokasyon varsa "Waiting for Midtown". |

### Müdür / admin / owner
- Kim onaylar: vardiyanın lokasyonunun müdürleri; müdür yoksa admin ve owner. İki lokasyonda ikisi.
- Bildirim: "Shift change needs your approval" (ilk istekte bir kez) + 12 saatte bir hatırlatma + kapanmadan 4 saat önce son uyarı.
- Masaüstü: Requests → Shift changes tablosu (satırlar bugünkü gibi). Satıra basınca Announcements / Important Dates'teki gibi çekmece açılır.
- Çekmecede: önce / sonra; her aday için günlük toplam saat, dönem toplam saati, komşu vardiyalarla seyahat ya da en az dinlenme süresi, availability; release ve cover'da kabul eden ya da isteyenler listesi, müdür birini seçer. Approve (yeşil) · Decline (kırmızı, iki tık, isteğe bağlı sebep).
- Telefon: aynı çekmece tam ekran.
- Sahipsiz kalan vardiya (işten çıkarma, lokasyondan çıkarma): müdüre "Post this shift to open shifts?" sorulur; evet derse havuza düşer.
- Sonuç bildirimleri: alan "Your pickup is approved", veren "You are no longer responsible", swap'ta ikisine "Your swap is approved", redde "Your manager declined" (+ sebep varsa).

## 4. Kenar durumları
1. Vardiya başlamadan 4 saat kala her şey kapanır; vardiya sahibinde kalır, herkese haber gider.
2. Müdür Schedule'da vardiyayı değiştirir ya da siler: istek kapanır, "Shift details changed" (bugün var).
3. Veren onaylı izin alır ve vardiya izinle bırakılır: istek kapanır (bugün var).
4. İsteyenin aynı saatte başka vardiyası var ya da izinli: uygun sayılmaz, listede görünmez (bugün var).
5. Availability çakışması: kartta uyarı, "Request anyway" / "Accept anyway" (bugün var).
6. Aynı vardiyada ikinci açık istek açılamaz (bugün var).
7. Çalışan işten çıkarılır ya da lokasyondan alınır: açık istekleri kapanır (kontrol edilecek).
8. Müdürün kendi vardiyası: onu kim onaylar (açık soru, sonra).

## 5. Bugünkü koddan farklar (kodlama işi için)
- "Find cover or swap" formu → üç ayrı düğme; "release" adı ekranda yok.
- Cover tek kişi → en çok 3 kişi; birkaç kişi kabul edebilir, müdür seçer; tekrar gönderilebilir.
- Swap'ta iki taraf da not yazabilir; not cevap bildirimiyle gider.
- Bugün yayınlanmış her atanmamış vardiya Shift Hub'da açık vardiya olarak görünüyor (`supabase/schema.sql:26128` civarı) → havuza yalnız release ve sahipsiz kalan vardiya sorusu girer; Schedule'da "havuza koy" düğmesi yok.
- İşten çıkarma / lokasyondan çıkarmada sahipsiz kalan vardiya için müdüre soru yok.
- Açık vardiyalar kart destesi (kaydırma + animasyon) değil, ızgara.
- Müdürün karar görünümü Announcements / Important Dates'teki gibi çekmeceye taşınır; günlük ve dönem saati, dinlenme / seyahat bilgileri eklenir (bugün hangileri görünüyor, kodlamadan önce kontrol edilecek).
- Aynı vardiyada cover ve release'in birlikte açılamaması (bugün tek açık istek kuralı var, kontrol edilecek).
- Cover/release/swap vardiya başlayınca kapanıyor → 4 saat kala.
- Not for me (kartı gizle) yok.
- Take back (release geri alma) adı ve bildirimi yok (bugün "Close search" var).
- Müdüre her isteyende bildirim → ilk isteyende bir kez + 12 saatte bir + son uyarı.
- Davet reddinde Maria'ya iki seçenekli bildirim yok.
- Telefonda Schedule tablo → Who's working listesi.
- Schedule'da kendi vardiyasına basınca "Your shift" penceresi açılmıyor.

## 6. Sıradaki
- Mockup (Mert 09:49Z istedi, 2026-10-13): 16 an, çalışan telefonu + müdür masaüstü + müdür telefonu. Kaynak /mnt/project-files/pages/gorsel-kararlar/gelen/vardiya-degisim/index.html; indirilebilir kopya /mnt/project-files/pages/vardiya-degisim-indir/. Mert 12:35Z'de onayladı (karar 12:35).
- Görsel kararlar sayfası: her an için telefon Original + varyantlar (Mert'in onayıyla).
- Sonra kodlama işleri olarak bölünür.
