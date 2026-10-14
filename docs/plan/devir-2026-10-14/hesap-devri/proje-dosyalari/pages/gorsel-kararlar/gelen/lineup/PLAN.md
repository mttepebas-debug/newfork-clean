# Lineup — tasarım ve yapım planı

Durum: yalnız plan. Kod yok, trene giden bir şey yok. Kod Mert "kodla" deyince başlar.
Kaynak: Mert'in 13 Ekim 2026 isteği (proje thread'i "Lineup"), repo main `68a6eaef`, eski Line Up envanteri `docs/plan/research/lineup-2026-09-24.md`.
Mockup'lar: bu klasörde `a-liste/`, `b-kokpit/`, `c-pano/` ve üçü bir arada `index.html`. Kaynak kodu `kaynak/` altında, `python3 kaynak/build.py` hepsini yeniden kurar.

## 1. Özet (5N1K)

- **Ne:** Schedule'ın altında günlük operasyon sayfası. Her gün için her lokasyonda her shift type'a bir lineup tablosu çıkar.
- **Kim:**
  - Owner, admin ve manager masaüstünde düzenler ve paylaşır. Manager yalnız kendi lokasyonlarını görür.
  - Çalışan telefonundan kendi lineup'ını görür ve onaylar (acknowledge).
- **Nerede:**
  - Masaüstü: sol menü → Schedule → **Lineup**, Requests'in altında. Adres `/app/schedule/lineup?date=&locations=&shiftTypes=`. Telefonda kapalı, Schedule gibi.
  - Çalışan: `/app/employee-hub/lineup?date=`. Oraya üç yerden gelinir:
    - Home'daki "Today's lineup" kartı
    - Schedule'daki vardiya penceresi ("View lineup")
    - paylaşım bildirimi
- **Ne zaman:** Haftalık Schedule yayınlandıktan sonra, günün akışında. Lineup shift başlayınca ya da paylaşılınca kilitlenir.
- **Nasıl:**
  - Satırlar o günün yayınlanmış Schedule vardiyalarından gelir.
  - Lineup'ta yapılan saat, pozisyon, label, section, sıra, call off ve not değişikliği yalnız Lineup'ta kalır. Schedule değişmez (Mert, 13 Ekim).
  - Başka lokasyondan çekmek de Schedule'ı değiştirmez (Mert, 14 Ekim; 13 Ekim'deki transfer istisnasının yerine): yalnız iki lineup değişir. Kural aşağıda "Telefon (Mert, 14 Ekim)".
  - Paylaşım bir sürüm (version) yazar. Çalışan o sürümü görür.
  - Müdürün onayladığı Shift Hub, time off ve Schedule değişikliği paylaşılmış sürüme anında yansır. Republish gerekmez (Mert, 13 Ekim).
- **Neden:** Müdür haftayı Schedule'da, günü Lineup'ta yönetir. Schedule haftalık plan ve saat kaydı olarak sabit kalır; lineup o günün sahadaki hâlidir. Eski Line Up'ın sorunu iki kopyanın birbirinden habersiz olmasıydı. Bu tasarımda lineup Schedule'ın üstüne ince bir katmandır (overlay): kişi Schedule'dan gelir, lineup yalnız farkı tutar.

## 2. Kapsam

**İlk sürüm (MVP içinde yapılırsa):**
- Ekranın üst kısmı:
  - Schedule'daki gün seçici ve takvim.
  - Lokasyon ve shift filtresi. Filtrede seçilen lineup görünür, seçilmeyen görünmez.
- Lineup tablosu:
  - Pozisyona göre gruplu. Her departman kendi çerçeveli tablosunda, o departmanın job'ları içinde; call off olanlar en altta ayrı tabloda (Mert'in 13 Ekim sayfa yorumu).
  - Sütunlar: tam isim, shift, pozisyon, giriş–çıkış, label, section, call off.
  - Shift sütunu açılır liste: o organizasyonun shift type'ları (demo: Breakfast, Lunch, Dinner, Close). Başka bir shift type seçilince kişi aynı gün ve lokasyondaki o shift type'ın lineup'ına taşınır; kilitli lineup seçilemez. Schedule değişmez (Mert'in 13 Ekim sayfa yorumu; Schedule'a dokunmaması 13 Ekim kararından çıkarım).
  - Satır içi düzenleme. Pozisyon değişince satır o pozisyon grubuna taşınır.
  - Sürükle bırak sıralama. Klavyede Alt+↑/↓ aynı işi yapar.
  - Daralt ve genişlet (collapse/expand).
- Call off:
  - İki tıkla yapılır.
  - Satır en alta, kesikli çizginin altındaki "Called off" bölümüne iner. Restore ile geri alınır.
  - Schedule'daki vardiya olduğu gibi kalır (Mert, 13 Ekim).
- Add Staff:
  - Boş satır ekler. Önce pozisyon seçilirse isim listesi o işe atanmış kişilerle süzülür.
  - İsim listesi dört grupta gelir:
    - Available
    - Working at another location
    - Already working here today
    - On approved time off (görünür; seçilince müdüre uyarı çıkar, müdür "Add anyway" ile ekleyebilir. Kişi yalnız lineup'a girer, izni ve Schedule değişmez. Mert, 13 Ekim)
  - Başka lokasyonda çalışan biri seçilirse hemen bu lineup'a gelir, izin beklenmez; iki Schedule da değişmez (Mert, 14 Ekim; kural "Telefon (Mert, 14 Ekim)").
  - Başka yerde vardiyası olmayan biri eklenirse yalnız lineup'a girer ("Lineup only" etiketi). Schedule değişmez.
- Notlar: Specials, 86s ve Shift Notes kutuları her zaman açık; aç/kapa düğmesi yok (Mert, 13 Ekim). Notes bölümü sağdaki okla açılıp kapanır: bütün notlar boşsa kapalı, biri doluysa açık başlar. Share, fotoğraf, metin ve telefon okun durumuna bakmaz; dolu not her zaman gider, boş not hiç gitmez.
- Paylaşım (Share):
  - Seçenekler: tek lineup, ekrandakiler ya da günün bütün lineup'ları.
  - "Ask staff to acknowledge" düğmesi var.
  - Call off olanlar paylaşıma girmez.
- Kilit:
  - Paylaşılınca ya da shift başlayınca kilitlenir.
  - Müdür kendi düzenlemesi için Unpublish eder, sonra Republish eder. Bu yalnız bugün ve ileri günler için.
  - Onaylı Shift Hub, time off ve Schedule değişiklikleri kilitli lineup'a da anında işler.
  - Geçmiş lineup hep salt okunur.
- Fotoğraf ve metin: görüntüyü kopyala, PNG indir, metni kopyala.
- Sayfa başlığı (Lineup) diğer sayfalardaki gibi tek başına durur, altında ayırıcı çizgi var; açıklama kısa: "Today's lineups, live from the Schedule." Tarih, lokasyon ve shift filtreleri, Collapse all, Photo / text ve Share düğmeleri çizginin altındaki araç satırında. Haftanın yedi günü lineup'ların hemen üstünde, soldan sağa boydan boya, ince ve sade bir şerit; seçili gün ince yeşil alt çizgiyle belli (Mert, 13 Ekim).
- Katmanlar (Mert, 13 Ekim; "her şey beyaz, birbirine bulaşıyor"): sayfa zemini serin açık gri, her lokasyon gölgeli beyaz panel, her shift lineup'ı üstünde kendi shift renginde ince şerit olan kart, başlığı o rengin çok açık tonu; tablo başlık satırı gri ve net. Uygulamanın genel görünümüne taşınacaksa önce KARARLAR'a kural olarak yazılır.
- İsim hücresi de dropdown (Mert, 13 Ekim): kişi Schedule'dan gelir, müdür listeden başka birini seçip o satırdaki kişiyi değiştirebilir. Seçici "Replace Jake Thompson" başlığıyla, o pozisyona göre süzülü açılır; izinli kişide uyarı, başka lokasyondakinde taşıma kuralı aynen geçerli. Satır yerinde kalır, yanında turuncu nokta "Schedule: Jake Thompson" der; Schedule değişmez.
- Name sütunu daha dar (200 piksel), diğer sütunlar Name'e yakın (Mert, 13 Ekim).
- Sayfanın üst kısmı (başlık, araç satırı, gün şeridi) tamamen sabit; lineup'lar altında kayar (Mert, 13 Ekim).
- Lokasyon başlığında "…" menüsü yok (Mert, 13 Ekim). Yayında olan lineup'ın başlığında "Edit" düğmesi var: lineup'ı yayından kaldırıp düzenlemeye açar (Unpublish), sonra "Republish". Fotoğraf ve metin üstteki Photo / text düğmesinden.
- Üstteki lokasyon ve shift filtreleri (Mert, 13 Ekim): hepsi seçiliyken ilk tıklanan tek başına seçili kalır, diğerleri kalkar; sonraki tıklamalar ekler ya da çıkarır; hepsi seçilince "All" da seçili olur. Hiçbiri kalmazsa yine hepsi seçili olur.
- Call off sütunu kilitli ya da başlamış lineup'ta da görünür; düğmeler soluk ve tıklanamaz. Call off olmuş kişide "Called off" etiketi durur (Mert, 13 Ekim).
- Lineup başlığında durum etiketi (Draft · not published, Published v2…) shift adının hemen altında. Bütün lineup başlıkları, boş olanlar dahil, aynı yükseklikte (Mert, 13 Ekim).
- Her pozisyon satırının (Server, Host…) en sağında "+ kişi" düğmesi var: o pozisyonun en altına boş bir satır ekler; kişi seçici o pozisyona göre süzülü açılır. Seçilen kişi o pozisyonun sonunda kalır (Mert, 13 Ekim).
- Ekrandaki kelime "Share" değil "Publish" (Mert, 13 Ekim): Publish, Publish lineups, Published v2, Draft · not published, Unpublish, Republish. Bu plandaki "paylaşma" sözü aynı işi anlatır.
- Dropdown görünümü bütün sayfada aynı: çerçeveli, beyaz zemin, sağda koyu ok (tablodaki seçimler, Label, kartlardaki seçimler, lokasyon ve shift filtreleri).
- Bir shift'te sütun başlık satırı yalnız bir kez, en üstte; alttaki departman tablolarında tekrar etmez. Add staff yalnız lineup başlığındaki düğmede; tablonun altındaki ikinci Add staff düğmesi kalktı (Mert, 13 Ekim).
- Tablo düzeni (Mert, 13 Ekim): Name en solda ve sola yaslı; diğer sütunlar ortalı ve neredeyse eşit genişlikte, In–Out iki saat sığacak kadar sabit. Hiçbir yazı "…" ile kesilmez; ekran darsa tablo kendi içinde yana kayar. Shift, Position, Label ve Section her zaman çerçeveli ve oklu görünür, dropdown oldukları belli olur.
- Saat (In–Out) satırın içinde yazılır; saat penceresi yok (Mert, 13 Ekim). Workspace'in 12h/24h ayarına uyar (Settings → Schedule). Yazım kuralları uygulamadaki saat kutusuyla aynı: "9", "930", "9:30p", "21:30". Klavye: alana gelince metin seçili; 12h'de AM/PM yazılınca, 24h'de dakika tamamlanınca In'den Out'a geçer; ↑/↓ 15 dakika (Shift ile 1 saat); Enter aynı alanın alt satırı, Shift+Enter üst satırı; Esc yazılanı geri alır; okunamayan saat eski hâline döner ve uyarı çıkar.
- Canlı yansıma: Schedule, Shift Hub (release, cover, pickup, swap), onaylı time off ve Important Dates (kapalı ve kısa saatli gün) değişiklikleri anında görünür.
- Çalışanın telefonu:
  - Kendi yeri (saat, pozisyon, section, label)
  - Notlar ve ekip listesi
  - Acknowledge düğmesi
  - "Güncelleniyor" ve "güncellendi" durumları

**Sonra:**
- Onaylamayanlara hatırlatma
- Lineup şablonları (her cuma aynı section dağılımı gibi)
- Section başına sorumlu (lead)
- Yazdırma ve PDF

**Dışarıda:**
- Eski Line Up'taki teklif (offer) ve yöneticiler arası onay akışı
- Bir vardiyayı parça parça başka bölüme bölmek
- Lineup'tan Schedule'a geri yazma (transfer hariç).

## 3. Kararlar (Mert, 13 Ekim 2026)

| Soru | Mert'in kararı | Mockup'ta nasıl görünüyor |
|---|---|---|
| Lineup'ta saat, pozisyon ya da label değişince Schedule da değişsin mi? | Hayır. Yalnız başka lokasyondan transfer edilen kişi iki Schedule'ı da değiştirir. | Değişen alanın yanında turuncu nokta; üstüne gelince "Changed in this lineup only. Schedule: …". Bildirim metni "The Schedule doesn't change." |
| Call off'ta shift ne olsun? | Canlı vardiya değişmez. Call off lineup'ın bilgisidir. | Satır "Not working today" bölümüne iner; Schedule'a dokunulmaz. |
| Paylaşılmış lineup'ta Shift Hub, time off ya da Schedule değişikliği | Müdür onay verdiği an paylaşılmış lineup'a yansır. Republish gerekmez. | Yeşil "Updated live 2:40 PM … Staff already see this; no republish needed." şeridi. Yeni kişinin telefonuna lineup ve onay isteği gelir; çıkan kişi "You're off Dinner" görür. |
| Başka lokasyondan kişi çekmek | Hedef lokasyonun müdürü hemen çeker, izin yok; iki taraf da geri alabilir; Schedule değişmez (Mert, 14 Ekim). | Kişi listede seçilebilir, "From Uptown" ile gelir; Uptown'da "Moved to Downtown". |
| Ayrı yetki | Yok. `schedule.read`, `schedule.manage`, `schedule.publish` kullanılır. | Roles & permissions değişmez. |
| Section listesi bugün yok | Sonradan eklenebilir. | Section açılır listesinin sonunda "+ Add section…". Müdür adını yazar, o lokasyonun bütün lineup'larında kullanılır. |
| Onaylı izni olan kişi Add Staff'ta | Görünür. Eklenirse müdüre uyarı çıkar, müdür yine de ekleyebilir. Canlı Schedule değişmez. | "On approved time off" grubunda seçilebilir; "Add anyway" uyarısı; satırda "Time off · lineup only" etiketi. |
| Lineup karar defterinde MVP sonrası | Mert biliyor; şimdi planlanıyor. | Kod sırası Mert'in "kodla"sına kalır. |

Bu kararlardan çıkan ve Mert'e sorulmadan seçilen varsayılan:
- Add Staff'ta "Available" grubundan biri seçilirse yalnız lineup'a eklenir, Schedule'a vardiya açılmaz. Saat kaydı ve bordro Schedule'a baktığı için bu kişi Schedule'da görünmez; gerekirse müdür Schedule'a ayrıca ekler. Dayanak: Mert'in 13 Ekim kararı (yalnız transfer Schedule'ı değiştirir).
- Schedule sonradan değişirse lineup'taki kendi farkları (saat, pozisyon, label, section, sıra, call off) aynı vardiyada kalır. Vardiyanın kişisi değişirse (cover, swap) lineup'taki farklar yeni kişiye geçer, call off ise düşer.

Mert'e sorulmadan seçilen ve mockup'ta görünen küçük varsayılanlar:
- Sayfa adı tek kelime: "Lineup".
- Kilit saati, lineup'taki en erken giriş saatidir. Lineup'ta çalışan yoksa shift type'ın varsayılan başlangıcı kullanılır.
- Unpublish edilen lineup'ı çalışan hiç görmez; telefonunda "lineup isn't published yet" boş durumu çıkar. Yeniden publish edilince görür (Mert, 13 Ekim; eski varsayılan "son sürümü görmeye devam eder" kaldırıldı).
- Republish'te onay yalnız kendi satırı değişmeyen kişide korunur. Satırı değişen kişiden yeniden onay istenir.
- Canlı yansımada onay korunur; yalnız lineup'a yeni giren kişiden onay istenir.
- Çalışan bütün ekibi görür, kendi satırı vurgulanır. Call off olan çalışan "You're called off" kartını görür.
- Mert'in sayfa yorumları (13 Ekim): her lokasyon tablo gibi tek çerçeve; lineup başlık satırına tıklayınca daralır ya da açılır; onay çubuğu başlığın en sağında; geçmiş lineup'ta "Past · shared" etiketi ve "This lineup started…" uyarısı şimdilik yok.
- Bir lokasyonda o gün shift'i olmayan shift type, kapalı (collapse) bir lineup ile aynı yükseklikte bir kart olarak durur: "No one is scheduled" ve Add staff (Mert, 13 Ekim).
- Açık bir liste (filtre, kişi seçici, takvim) kendi düğmesine tekrar tıklayınca ya da dışarı tıklayınca kapanır; o dış tıklama başka hiçbir şeyi tetiklemez (Mert, 13 Ekim).
- "Back to today" düğmesi yok. Takvim düğmesinin tarih yazan kısmı bugüne döndürür, ikon kısmı takvimi açar. Bugün dışındaki her günde tarih düğmesi amber renkte yanar (Mert, 13 Ekim).
- Lineup başlığındaki "Add staff" kalktı; kişi job satırının sağındaki + adam düğmesiyle eklenir. "Add staff" yalnız hiç job satırı olmayan lineup'ta (boş shift ya da herkes call off) görünür (Mert, 13 Ekim).
- In–Out saat kutuları her zaman kenarlıklı beyaz kutu olarak görünür (Mert, 13 Ekim).
- Call off düğmesinin üzerine gelince o çalışanın bütün satırı kırmızı yanar (Mert, 13 Ekim).
- Shift başlığında Publish düğmesi yok; yayınlanmış lineup'ta yalnız "Edit" kalır. Edit, ekranın ortasında büyük pencere açmaz: düğmenin hemen altında küçük bir panel açılır ("Edit Dinner lineup?", Cancel, Unpublish & edit) (Mert, 13 Ekim).
- Tasarım yönü: Gösterge çalışması, List (A) görünümü (Mert, 13 Ekim).
- Lineup kartları sağdan ve soldan biraz daraltıldı; lineup başlığı takvim şeridinden 1px aşağı indi; isim sütunu soldan hafifçe daraldı; In–Out sütunu genişletildi, label ve saat artık üst üste binmez (Mert, 13 Ekim).
- Yayınlanmış lineup'ta shift type adının altında yeşil "Published" yazar; lineup başlamış olsa da (Mert, 13 Ekim).
- Publish, unpublish, Image ve Text paylaşımı ile "Ask staff to acknowledge" anahtarı tek yerden yönetilir: üstteki Publish düğmesinin altında açılan küçük bir pencere, Schedule'daki üst menülerle aynı görünüm. Ortada açılan pencere yok. Lineup'lar lokasyona göre listelenir; yayınlanmamış olanların yanında kutucuk var. Yayındaki satırın üzerine gelince kırmızı "Unpublish" çıkar, iki tıkla çalışır. Altta "Publish N" yeşil düğmesi bulunur. Önceki 5 varyantı Mert beğenmedi, yedek/publish-5-varyant klasöründe duruyor. Mert bu pencereyi onayladı: "harika bu" (Mert, 13 Ekim).
- Açık bir liste (ör. isim listesi) sayfa kaydırılınca kapanır; listenin kendi içinde kaydırmak kapatmaz (Mert, 13 Ekim).
- Telefonda vardiya kutusu dört satır: "Dinner – Bartender" / konum ikonu + lokasyon / saat / label – section. Kartın üstündeki shift adı ve "Downtown · Tue, Oct 13" satırı yok (Mert, 13 Ekim).
- Çalışan Acknowledge'a basınca düğme kaybolur (Mert, 13 Ekim).
- Üst çubukta "Collapse all" düğmesi yok; her lineup kendi başlığından açılıp kapanır (Mert, 13 Ekim).
- Üst çubukta "Photo / text" düğmesi yok; fotoğraf ve metin kopyası Publish penceresinin içinden alınır (Mert, 13 Ekim).
- Kısa saat (Important Dates) uyarı şeridinin en sağında X var; kapatınca o lokasyonun o günkü bütün lineup'larında kaybolur. Kapatmak yalnız uyarıyı gizler, kısa saati değiştirmez (Mert, 13 Ekim).
- Bütün dropdown'larda yazı sola hizalı başlar: tablodaki kutuların içi, açılan listeler ve üstteki filtreler (Mert, 13 Ekim).

## 4. Mockup'lar

Üçünde de çalışanlar ve davranış aynı. Fark yalnız yönetim ekranının ve telefonun düzeninde.
- **A · List:** Bugünkü liste sayfalarına en yakın olanı. Her lokasyonun altında alt alta tablolar var. Telefonda tek kart: "Your spot", Acknowledge, notlar ve ekip.
- **B · Cockpit:** Solda günün özeti var:
  - her lineup'ın durumu, onay çubuğu ve sayıları
  - "Needs attention" (open shift, onaylamayan, uygulaması olmayan)
  - canlı akış (Live)

  Sağda sık satırlı tablolar ve "Read" sütunu var. Telefonda üç sekme: My shift, Team, Notes.
- **C · Board:** Her lokasyon bir satır, shift type'lar yan yana sütun, kişiler kart. Telefonda koyu yeşil büyük kart (Employee Home'daki gibi), onay düğmesi kartın içinde.

Mockup'ta deneme araçları sayfanın üstündeki koyu şeritte durur. Bunlar ürünün parçası değil:
- **Who:** Owner, Admin ya da Manager (yalnız Downtown).
- **Show:** Masaüstü + telefon, yalnız masaüstü ya da yalnız telefon.
- **Time format:** Workspace ayarı 12h ya da 24h; bütün saatler ona göre yazılır.
- **Now:** Saati 10:30, 2:40, 4:30 ya da 11:45'e alır; kilit ve "Past" hâli görünür.
- **Live events (demo):** Shift Hub cover, swap ve pickup, time off onayı, Important Dates kısa saat, başka müdürün eklediği vardiya ve bir çalışanın onayı.

### Telefon (Mert, 14 Ekim)
- Lineup telefonda açık: müdür telefondan görür, düzenler, yayınlar; Schedule telefonda kapalı kalır. Düzen: B · Vardiya sekmeleri (taslak https://claude.ai/artifact/HpPEjjYzgm6WPxrmJejGwG, kaynak ../lineup-telefon/). Salt okunur ilk hali kodlandı (dal claude/project-thread-xrfag7).
- Section her satırın sağında ayrı bir sütun; departman başlığında "Section" etiketi (01:35Z).
- Section zorunlu değil, müdür hiç yazmayabilir (01:54Z). Satır düzeni (taslakta "Satır düzeni", önerim 1 · Orta sütun; Mert'in seçimini bekliyor): Section adla aynı hizada kendi sütununda, sol kenarı düz; vardiyada kimsenin Section'ı yoksa sütun ve başlık hiç çıkmaz, boş Section'da "—" yok. Kişiler arasında çizgi yok; job grubunun sonunda çok ince, departman sonunda biraz belirgin ince çizgi. Kişi ekleme, job satırının sağında çerçevesiz "+ Add" yazısı; job adının yanında kişi sayısı.
- ~~Lineup'ta saati Schedule'dan farklı kişi: saat amber çerçeveli, saat ikonlu; altında üstü çizili "Schedule …" satırı (01:35Z).~~ Mert 02:18Z'de geri aldı: listede değişen saat de öbürleri gibi düz yazılır, çerçeve ve "Schedule …" satırı yok.
- Satırlar (Mert 02:18Z, 02:20Z): label'lar (Closer, Training…) adın hemen yanında, böylece her satır iki satır ve aynı yükseklikte; saatlerde iki uçta da AM/PM ("4:00 PM – 10:00 PM"). "SECTION" başlığı her job satırında, Section sütununun üstünde. Kişi ekleme departman satırının sağında "+ Add Staff" (job satırlarında değil); basılan departmanı yapabilenler önde açılır.
- Çalışanın kendi vardiya özeti (Mert 02:18Z): paylaşılan lineup'ta listenin yanında kişinin o günkü vardiyası: ad, saat, lokasyon, pozisyon, label, section. Saat lineup'ta değiştiyse Schedule'daki saatin üstü animasyonla çizilir, yerine yeni saat yazılır; bir süre sonra döngü baştan başlar (hareket azaltma açıkta ikisi yan yana, eskisi üstü çizili). Taslakta üç biçim (Mert'in seçimini bekliyor): 1 · Rozet (önerim; 13 Ekim'deki dört satırlık kutu + ad, listenin üstünde), 2 · Bilet, 3 · Acknowledge'a basınca alttan açılır.
- Mert 02:49Z: özetteki saat tek satırda kalır (PM alta düşmez). Acknowledge sayfanın en altında, bütün ekip tablosunun altında. Ekip tablosunun başında büyük lokasyon adı ve tarih ("Downtown" / "Wednesday, October 14 · Dinner"). Çalışanın kendi satırı yeşil zeminle işaretli kalır, "You" etiketi yok.
- Mert 03:06Z: Add Staff penceresinde eski durum gruplarına dönüş; etiketler (Available, Already worked here, Working somewhere else, Not eligible, Approved day off, Primary job, +N job, Department) satırda, süzmede ve öneride. Varyantlar 1 Durum listesi (önerim) / 2 Önce en uygunlar / Original telefon taslağında (v7). Ön çalışma: ../lineup-telefon/ADD-STAFF-TASARIM.md. Bekleyen: varyant seçimi, "Already worked here" anlamı, iki kapsam dışı önerisi (Group by düğmesi, satırda departman).
- Kişi ekleme: "Sort by Department / Job". Basılan departmanı yapabilenler en üstte ("Can work Bar"), sonra öbür departmanlar; job'a göre sıralamada basılan job önce. Her kişide yapabildiği job'lar ve bugünkü durumu (Free today / öbür lokasyondaki vardiyası / burada öbür vardiyası / izinli) (01:35Z).
- Baş harflerin yerine job ikonu (01:42Z): her job için özel tasarlanmış SVG ikonlar; job eklenirken/düzenlenirken isteğe bağlı seçilir (zorunlu değil, onboarding yavaşlamaz). İkonu olmayan job'da baş harfler kalır. İkonları Mert hazırlayıp haber verecek; o zamana kadar kod yok. Gerekecek: job kataloğuna ikon alanı (canlı migration) + Settings → Jobs çekmecesinde seçici.
- Başka lokasyondan kişi çekmek (Mert, 01:39Z istek; 01:59Z karar kartında "Hemen, iki taraf geri alır"). 13 Ekim'deki "yalnız ikisini de yöneten taşır" ve "iki Schedule da değişir" kurallarının yerine geçer:
  - Hedef lokasyonun müdürü kişiyi hemen çeker; öbür müdürün izni ya da onayı beklenmez.
  - Kişi hemen bu lineup'ta "From Uptown" ile görünür. Kaynak lineup'ta kişi "Moved to Downtown · Sarah, 3:12 PM" satırıyla kalır, o vardiya kartında uyarı çıkar.
  - Kaynak lokasyonun müdürüne ve kişiye birer bildirim gider; başka bildirim yok.
  - İki müdür de "Bring back" ile geri alabilir; taşıma kaydı iki lokasyonundur.
  - İki Schedule da değişmez; yalnız iki lineup değişir.
  - Öbür lokasyonda vardiyası başlamış (o an çalışan) kişi çekilemez.
  - O gün hiçbir yerde vardiyası olmayan kişi sessizce eklenir; kişi yalnız yapabildiği job'lara eklenir.
  - Elenenler: onay şartı (lineup gecikir), süre sonunda kendiliğinden kabul (belirsiz), Schedule'ı da değiştirmek (lineup'ın Schedule'a dokunmaması kuralını bozar).

## 5. Veri modeli

Bugünkü durum:
- Bugün section yok.
- Eski Line Up tabloları 24 Eylül'de silindi (`20260924180901_line_up_is_gone.sql`). Silinen adlar `retired_objects_stay_gone` listesinde, bu yüzden yeni adlar farklı olmalı.

`schedule_published_shifts` değişmez. Call off ve lineup düzenlemeleri Schedule'a yazılmaz (Mert, 13 Ekim).

Yeni tablolar (hepsinde `workspace_id`, RLS ve `app_private.authorize()` var):

| Tablo | Ne tutar |
|---|---|
| `location_sections` | Lokasyon başına section listesi: ad (≤40), sıra, arşiv. Boş başlar; müdür Lineup'taki Section listesinden "+ Add section…" ile ekler. Yeniden adlandırma ve arşiv Settings → Locations'ta. |
| `daily_lineups` | Lokasyon + gün + shift type başlığı. Notlar (`specials`, `n86`, `shift_notes`), `editing` bayrağı, son sürüm numarası. `(location_id, service_date, shift_type_id)` tekil. Shift type'ı olmayan vardiyalar için `shift_type_id` boş bir "Other shifts" lineup'ı. |
| `daily_lineup_rows` | Lineup'ın Schedule'dan farkı. `source_shift_id` (boşsa "Lineup only" satır), `employee_id` (yalnız lineup-only satırda), boş bırakılabilir `job_id`, `starts_at`, `ends_at`, `label_ids` (boşsa Schedule'daki değer geçerli), `section_id`, `sort_order`, `called_off_at`, `called_off_by`. Kişi Schedule'dan okunur, burada kopyalanmaz. |
| `daily_lineup_versions` | Paylaşılan sürüm: numara, `shared_at`, `shared_by`, `ask_ack`, satırların ve notların JSON anlık görüntüsü, parmak izi (fingerprint). Onaylı Shift Hub, time off ve Schedule değişikliği bu görüntüyü aynı işlemde yamar ve `live_changes` listesine bir satır ekler; sürüm numarası artmaz. |
| `daily_lineup_acknowledgements` | Sürüm + çalışan başına onay zamanı. Önceki sürümden taşınan onay `carried_from_version` ile işaretlenir. |

Ödünleşim:
- Section'ı workspace geneli değil lokasyon başına tutuyorum. Downtown'ın "Patio"su Uptown'da yok.
- Departman ve job tablolarında sıra (`sort_order`) yok, Schedule bugün ada göre sıralıyor. Lineup'ta mockup Front of House → Bar → Kitchen sırasını kullanıyor. Bunun için ya departman ve job'a sıra eklenir ya da ada göre kalınır. Açık soru, bölüm 11'de.

## 6. API ve servisler

Akış her zamanki yolla gider: ekran → `lineup-data.ts` hook'u → `apiRequest` → `apps/api/src/lineup/` → `supabase.rpc('<ad>_service')` → RLS + `authorize()` / `scope_set()`.

| Servis | İş |
|---|---|
| `get_lineup_day_service(date, location_ids, shift_type_ids)` | Okuma modeli. Lineup'lar ve satırlar (yayınlanmış vardiya + lineup farkı), kapanış ve kısa saat bilgisi, durum (draft / shared / editing / past), canlı değişiklik listesi ve onay sayıları. Bütçe: Schedule ızgarası gibi en çok 50 ms (fixture). |
| `lineup_staff_candidates_service(lineup_id, job_id?)` | Add Staff listesinin dört grubu. Müsaitlik ve onaylı izin kuralı tek yerden gelir: `assess_weekly_shift_availability` ve time-off segmentleri. |
| `lineup_command_service(command_id, kind, payload)` | Tek giriş, tekrar gönderime dayanıklı (idempotent), Shift Hub'daki `shift_exchange_commands` gibi. Komutlar: `set_section`, `reorder`, `set_notes`, `set_row` (shift type, saat, pozisyon, label; yalnız lineup), `add_staff`, `call_off`, `restore`, `share`, `unpublish`. Schedule'a yalnız transfer yazar ve Schedule'ın yazma çekirdeğini kullanır. İkinci bir Schedule yazma yolu açılmaz. |
| `get_my_lineups_service(date)` | Çalışanın paylaşılmış sürümleri, kendi satırı ve ekip. |
| `acknowledge_lineup_service(version_id)` | Onay. |

Kurallar:
- Kilit sunucuda uygulanır. Başlamış ya da paylaşılmış lineup'a yazma `42501` + `lineup.locked` ile reddedilir. Web bunu yalnız yansıtır.
- `add_staff` başka lokasyondan çekerken yalnız hedef lokasyonda yetki ister (Mert, 14 Ekim). İki lineup'ı tek işlemde (transaction) değiştirir, Schedule'a dokunmaz; kaynak lokasyonda vardiyası başlamış kişiyi reddeder. Taşıma kaydı iki lokasyona da yazılır; iki taraftan biri `bring_back` ile geri alabilir. İki lineup paylaşılmışsa ikisine de canlı yansır.
- Shift Hub (`shift_exchanges_command_service`), time off onayı ve Schedule yayını, etkilenen paylaşılmış lineup sürümünü aynı işlemde yamayan tek bir iç fonksiyonu çağırır. Böylece "anında yansır" sunucuda garanti olur, ekrana bırakılmaz.
- Önceki yayının olmadığı haftaya lineup'tan vardiya eklenmez: "Publish the week first".
- Her yeni `*_service` yetki matrisinde ve katalogda sınıflanır.

## 7. Yetki

Yeni izin anahtarı yok. Eylemler bugünkü izinlere bağlanır:
- `lineup.read` → `schedule.read`
- `lineup.edit` → `schedule.manage` (kapsam: lokasyon kümesi)
- `lineup.share` → `schedule.publish`

Diğer kurallar:
- Manager yalnız `scope_set` içindeki lokasyonları görür, filtreler ve düzenler. Mockup'taki "Manager · Rachel Adams (Downtown)" bunu gösterir.
- Çalışan yalnız kendi satırının olduğu paylaşılmış sürümü okur. Bilinmeyen ve kapsam dışı hedef aynı cevabı alır (`authz.out_of_scope`).

## 8. Canlılık (realtime)

- Kanal yeni değil: bugünkü `schedule:invalidation:<ws>:<location>` (private) kullanılır, yeni hedef `lineups`. Web, `["lineup-day", ws, date]` anahtarını tazeler.
- **Bulunan boşluk:** Shift Hub onayı ve time-off onayı bugün yalnız `shift-exchanges:<ws>` kanalına sinyal yolluyor, Schedule kanalına yollamıyor.
  - Etkisi: Shift Hub'da bir takas onaylanınca açık Schedule ekranı hemen yenilenmiyor.
  - Lineup'ın "anında yansıma" şartı için bu DB fonksiyonları ve Important Dates'in uygulama fonksiyonu, etkilenen lokasyonlara `schedule_invalidation` da göndermeli.
  - Bu düzeltme Schedule'a da yarar. İlk aşamada yapılır.
- Onaylı değişiklik paylaşılmış sürüme sunucuda işlenir (bölüm 5). Ekran yalnız "Updated live" şeridini ve son değişiklikleri gösterir.
- Çalışan telefonu paylaşımı bildirimle öğrenir. Uygulama açıksa `account_notification_items` aboneliği listeyi tazeler.

## 9. Bildirimler (gürültüsüz)

- **Share:** Lineup'taki her çalışana tek bildirim: "Your Dinner lineup is ready", onay isteniyorsa "· please acknowledge". Birden çok lineup paylaşılsa da kişi başına tek bildirim gider.
- **Republish:** Bildirim yalnız satırı değişene, yeni eklenene ve çıkarılana gider.
- **Canlı yansıma:** Lineup'a yeni giren kişiye "You're on the Dinner lineup" (onay isteniyorsa onay isteğiyle). Çıkan kişiye ayrı lineup bildirimi gitmez; Shift Hub ya da time off'un kendi bildirimi zaten gidiyor. Kalan ekip bildirim almaz, açık telefonları sessizce tazelenir.
- **Gitmeyen bildirimler:** Unpublish, call off ve satır içi düzenleme bildirim yollamaz. Call off olan kişiye Schedule'ın kendi bildirimi yeterli. O da açık bir soru.
- Hatırlatma ilk sürümde yok.

## 10. Uç durumlar

1. **Haftası yayınlanmamış gün:** "Publish this week's Schedule first" boş hâli çıkar, Schedule'a bağlantı verir.
2. **Kapalı gün (Important Dates):** Lokasyon için "Closed all day" kartı çıkar, tablo yok. Mockup'ta Pazar 18 Ekim Downtown.
3. **Kısa saatli gün:** Sarı uyarı çıkar, kapanıştan sonra biten satırlar işaretlenir. Mockup'ta Perşembe 15 Ekim Uptown. Canlı olayla Downtown'da da denenebilir.
4. **Paylaşılmış lineup'ta time off onayı:** Kişinin satırı "Open shift · assign" olur. Kişi paylaşılmış sürümden anında çıkar, telefonunda "You're off Dinner" görür. Republish yok.
5. **Shift Hub cover ya da swap:** İsim yerinde değişir, paylaşılmış sürüm de. Yeni kişiye lineup ve onay isteği gider, eski kişi "You're off Dinner" kartını görür. Mockup'ta Lily ve Priya ile denenir.
6. **Başka lokasyondan taşıma:** İki Schedule ve iki lineup tek işlemde değişir. Öbür lokasyon paylaşılmışsa ona da canlı yansır.
7. **Aynı gün iki shift:** "Already working here today" grubunda görünür. Saatler çakışıyorsa seçilemez.
8. **Müsait olmadığı saat:** Kişi seçilebilir, turuncu "Unavailable after 8:00 PM" uyarısıyla.
9. **Onaylı izin:** Kişi listede görünür. Seçilince "on approved time off today" uyarısı çıkar; müdür "Add anyway" derse kişi yalnız lineup'a girer. İzin ve Schedule değişmez, bu yüzden karar defteri §1.1 (onaylı izin çakışan vardiyayı engeller) bozulmaz. Satırda "Time off · lineup only" etiketi kalır.
10. **Uygulaması olmayan çalışan:** Tabloda "No app" etiketi taşır. Paylaşım penceresinde fotoğraf ya da metin kutusu çıkar. Onay sayısına girmez.
11. **Gece yarısını geçen vardiya:** Lineup başladığı güne aittir. Saat gösterimi `shift_time_range` ile yapılır.
12. **Saat dilimi:** Kilit ve "past" hesabı lokasyonun saat diliminde yapılır, müdürün tarayıcısında değil.
13. **Aynı lineup'ı iki müdür aynı anda düzenler:** Son yazan kazanır, öbürünün ekranı canlı yenilenir. Sıralamada sürüm kontrolü yapılır. Schedule'daki gibi bir düzenleme kilidi ilk sürümde gereksiz.
14. **Lineup'ı olmayan shift type:** İnce boş satır olarak durur. Filtreden çıkarılınca tamamen kaybolur.
15. **Geçmiş gün:** Hiçbir düğme yok. Onay listesi ve dışa aktarma açık.
16. **Owner, admin ya da manager'ın kendisi lineup'ta çalışıyorsa:** Kendi onayını Employee view'den verebilmeli. Eski sistemde bu kapı kapalıydı.

## 11. Açık sorular

1. Departman ve job sırası ada göre mi, yoksa Settings'te sürükle-bırak sırası mı?
2. Call off olan kişiye bildirim gitsin mi?
3. Çalışan bütün ekibi mi görsün, yalnız kendi pozisyonunu mu? Varsayılan: bütün ekip.
4. Hangi mockup yönü (A, B, C ya da karışım)? Mert seçer; soru kartı yok.

## 12. Aşamalı yapım planı

Her aşama kendi dalında yapılır, incelemeli sınıftadır (yetki, RLS, yeni `*_service`) ve trenle main'e gider. Her aşamanın sonunda PAGES'e yeni sayfa ya da parça eklenir.

| Aşama | İş | Kapı |
|---|---|---|
| 0 | Mert'in mockup seçimi ve kalan soruların cevapları. 13 Ekim kararları KARARLAR'a yazılır. | Mert |
| 1 | DB: `location_sections` (boş başlar), `daily_lineup*` tabloları, `get_lineup_day_service`, Shift Hub / time off / Important Dates → Schedule kanalı boşluğu. pgTAP + yetki matrisi. | Güvenlik incelemesi (`nf-guvenlik`), ekleyen migration |
| 2 | Masaüstü okuma: sayfa, filtreler, gün seçici, tablo, collapse, kilit ve geçmiş hâli, canlı yenileme. | 1440 ve 390 ekran görüntüsü |
| 3 | Düzenleme: section, sıra, notlar, satır içi saat / pozisyon / label (yalnız lineup), call off / restore. | Playwright |
| 4 | Add Staff: aday listesi, pozisyonla süzme, başka lokasyondan taşıma. | Güvenlik incelemesi |
| 5 | Paylaşım: sürümler, Unpublish / Republish, onaylı değişikliğin paylaşılmış sürüme canlı işlenmesi (Shift Hub, time off, Schedule yayını aynı işlemde), bildirim, çalışan telefonu, Acknowledge. | Güvenlik incelemesi + Playwright |
| 6 | Fotoğraf / metin dışa aktarma (yeni bağımlılık yok, tarayıcının kendi canvas'ı). | Görsel kontrol |

Para: yeni ücretli servis yok. Yeni bağımlılık yok. Eski sistem `html-to-image` ve `jspdf` kullanıyordu, bu plan kullanmıyor.
