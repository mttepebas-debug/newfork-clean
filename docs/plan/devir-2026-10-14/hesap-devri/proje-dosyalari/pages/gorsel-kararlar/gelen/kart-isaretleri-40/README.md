# Kart işaretleri: 40 taslak + 6 ataş

**Seçilen not işareti (Mert, 2026-10-13 5:56 PM Kaliforniya, "11deki tarzi kullanmak istiyorum ancak 11deki ataş işaretini çapraz olacak şekilde rotate et. 15dekiyle ayni pozisyonda olsun ama 15deki aşırı küçük. Biraz büyüt daha gözle görülür olsun."):** 16 · Çapraz ince ataş. 11'in ince çizgili ataşı, çapraz duruyor, 15'teki gibi solda (kartın sol kenarından 5 px içeri; 6:15 PM'den beri ilk satırla aynı hizada, aşağıda), 15 px (15'teki 11 px idi), lacivert (`--theme-note`). Üzerine gelince not açılır. Görüntü: `onizleme-atas-16.png` (solda taslak, sağda ızgarada). Sayfa artık 46 taslak.

**İlk satırla aynı hiza (Mert, 2026-10-13 6:15 PM Kaliforniya, "Her zaman için ilk satir meta datayla ayni hizada olsun. Şuan badge i yukari doğru büyütmüş ve gereksiz boşluk oluşturmuş tepede"):** seçilen işaretler (ataş, "!", LIVE, açık vardiyanın "x2"si, hayalet kartın konum iğnesi) artık kartın ilk satırıyla aynı hizada; kart onlar için yukarı büyümüyor. Bir satırdaki kartların ilk satırları da hep aynı hizada: kart altında daha az satır taşıyorsa boşluk altta kalıyor. Görüntü: `onizleme-ilk-satir.png` (önce / şimdi, 1440 px ekran).
- Dar haftada (ızgara yazıyı kartın tam genişliğine yaydığında) okurken ad, yanındaki işarete 4 px'ten fazla yaklaşmıyor: sığdıkça ortada, sığmazsa işaretten uzaklaşacak kadar kayıyor. Hepsi sığmıyorsa hafta en dar düzene geçiyor ve sığmayan ad "…" ile bitiyor. Örnek verideki 1440 px ekranda bu, hayalet kartlardaki "Breakfast-Prep Cook" adında oluyor (4 kart, "Breakfast-Prep C…").
- Dar haftada düzenlerken işaretler eskisi gibi yazının üstünde kendi satırında; LIVE bir adın yanına sığmıyor. Bu satır bütün kartlarda var, bu yüzden ilk satırlar yine aynı hizada.
- Ölçüm (tarayıcı, 1100–2400 px, okuma ve düzenleme): işaretlerin ortası ilk satırın ortasıyla aynı (en çok 1 px fark); bir satırda ilk satırı farklı yükseklikte duran kart yok; ad ile işaret arası okurken en az 4 px, düzenlerken en az 2 px (önceki sürümle aynı).

**Ek (Mert, 2026-10-13 5:16 PM Kaliforniya, "Ataş iconuyla ilgili 5 tane daha yeni mockup ekler misin"):** yönetici notu işaretine ataşın beş yeni hâli eklendi, 11–15 (9 bugünkü ataş taslağı). Görüntü: `onizleme-atas.png`. Sayfa artık 45 taslak; klasörün adı bağlantılar kırılmasın diye aynı kaldı.

**Seçilen (Mert, 2026-10-13 3:41 PM Kaliforniya, "ünlem için 5, live için 1, new için 7"):**
- müsait değil: 5 · Nokta;
- LIVE: 1 · Nokta + Live;
- NEW: 7 · Yalın yazı.

Yönetici notu işareti: 16 · Çapraz ince ataş (yukarıda). Sayfada seçilen taslaklarda "Mert'in seçimi" yazar, ızgara bu dördüyle açılır. Kart kataloğunun Yeni görünümü de bunları giyiyor (`/mnt/project-files/pages/schedule-kart-katalogu/`).

- **İstek:** Mert, 2026-10-13 2:58 PM (Kaliforniya), "Vardiya kartı" thread'i; 3:00 PM'de mesajını düzenleyip yönetici notu işaretini ekledi. Turuncu "!"in tasarımı beğenilmedi. İstenen, tek sayfada: availability turuncusu esas alınarak "!" için 10 taslak, yeşil LIVE için 10, NEW için 10, yönetici notlu kartın "not var" işareti için 10. NEW, yayından sonra taslakta eklenen ya da değiştirilen vardiya.
- **Yayında:** https://claude.ai/artifact/7xJNYsZbknmsvGPk5jdd7p (2026-10-13 5:07 PM Kaliforniya; 6. sürüm 6:08 PM, 16 eklendi; 7. sürüm 6:50 PM, ilk satır hizası; klasör: Schedule; dizin satırı var, bant var).
  - Yayın dosyası `yayin/index.html` (kaynak bandıyla). 4. sürümden beri (5:28 PM, ataş eki) yayın aracı tek parça `app.html`'i reddettiği için betik ayrı gider: `yayin/split-app.mjs` derlemeden `app.html` (CSS) ve `app.js` üretir. İndirilecek tek dosya yine bu klasörün `index.html`'i.
- **Sayfa:** `index.html`, tek dosya. İndirip tarayıcıda açılır.
  - "Mark drafts" sekmesiyle açılır.
  - Her grubun başında bugünkü hâli (Original), ardından 1–10.
  - "Izgarada bunu kullan" o taslağı Schedule sekmesinde bütün ızgaraya uygular. Sağ alttaki "Test page" düğmesinde de aynı seçim var (O, 1–10).
  - Kartlar gerçek Schedule koduyla (main `c9f5b7a3`) ve örnek veriyle çiziliyor.
- **Görüntüler:**
  - `onizleme-unlem.png`, `onizleme-live.png`, `onizleme-new.png`, `onizleme-not.png`: dört grup.
  - `onizleme-izgara-2.png`: 2 numaralı taslaklar ızgarada, düzenleme modunda.
- **Kaynak:** `kaynak/marks.ts` (taslakların CSS'i ve genişlikleri), `kaynak/marks-board.tsx` (pano) ve `kaynak/ShiftCard.tsx`, `kaynak/line1.ts`, `kaynak/vk.css`, `kaynak/ScheduleGridShell.tsx`, `kaynak/useScheduleBadgeMeasurements.tsx` (işaretler ilk satırın hizasında, dar haftada ada yer açma, satır yüksekliği).

## Turuncu "!" (müsait değil)
Müsaitlik yalnız tercihtir: işaret uyarır, engellemez. Her taslak üç yerde gösteriliyor: adın yanında, kartta ve boş hücrenin köşesinde.

| No | Ad | Ne |
|---|---|---|
| O | Bugünkü | Dolu turuncu daire, beyaz "!" yazı karakteri |
| 1 | Halka | Beyaz daire, ince turuncu halka, çizilmiş "!" |
| 2 | Yumuşak daire | Açık turuncu zemin, koyu turuncu "!" |
| 3 | Çizilmiş ! | Bugünkü gibi, ama "!" çizgi + nokta; daire 2 px küçük |
| 4 | Rozet kare | Yuvarlak köşeli turuncu kare, beyaz "!" |
| 5 | Nokta | Yalnız küçük turuncu nokta |
| 6 | Köşe | Kartın sağ üst köşesinde turuncu üçgen (sol üstteki not üçgeninin eşi) |
| 7 | Saat | Turuncu saat simgesi |
| 8 | Saat rozeti | Açık turuncu daire içinde saat |
| 9 | Kişi | Çarpılı kişi simgesi |
| 10 | Uyarı üçgeni | İnce çizgili uyarı üçgeni |

## LIVE (yayındaki vardiya, düzenlerken)
LIVE bugün yalnız test sayfasının Yeni görünümünde var; main'de yayındaki kartta işaret yok (2026-10-09 kararı). Her taslakta karşılaştırma için bir NEW kart da var.

| No | Ad | Ne |
|---|---|---|
| O | Bugünkü | Açık yeşil kutu, yeşil çerçeve, LIVE |
| 1 | Nokta + Live | Yeşil nokta + LIVE, kutu yok |
| 2 | Dolu yeşil | Koyu yeşil kutu, beyaz LIVE |
| 3 | Yalnız nokta | Küçük yeşil nokta |
| 4 | Yalın yazı | Yalnız yeşil LIVE |
| 5 | Çerçeve | Beyaz kutu, yeşil çerçeve |
| 6 | Tik | Daire içinde tik |
| 7 | Onay rozeti | Rozet içinde tik |
| 8 | Göz | "Çalışanlar görüyor" |
| 9 | Yayın | Yayın dalgası |
| 10 | Yumuşak hap | Çerçevesiz açık yeşil, küçük harfle "Live" |

## NEW (taslakta eklenen ya da değişen)
Bugün LIVE ile aynı yeşil, bu yüzden taslakların çoğu başka renkte. Her taslakta yeni kart, saati değişmiş yayındaki kart ve karşılaştırma için bir LIVE kart var.

| No | Ad | Ne |
|---|---|---|
| O | Bugünkü | Açık yeşil kutu, yeşil çerçeve, NEW |
| 1 | Mavi | Açık mavi kutu, mavi NEW |
| 2 | Koyu | Koyu kutu, beyaz NEW |
| 3 | Nokta + New | Mavi nokta + NEW |
| 4 | Kesikli | Beyaz kutu, kesikli gri çerçeve |
| 5 | Kıvılcım | Mavi kıvılcım simgesi |
| 6 | Artı | Daire içinde artı |
| 7 | Yalın yazı | Yalnız yeşil NEW |
| 8 | Köşe | Sağ alt köşede mavi üçgen |
| 9 | Bulut | Yukarı oklu bulut (Publish'te gidecek) |
| 10 | Kesikli kart | Etiket yok; kartın çerçevesi kesikli |

## Yönetici notu işareti
Bugün sol üst köşede 11 px lacivert üçgen; üzerine gelince not kartın yanında açılır. Çalışan notu görmez. Her taslakta yayındaki kart (LIVE ile), yeni kart (NEW ile) ve okuma modunda bir kart var; hepsinde üzerine gelince not açılıyor (tarayıcıda denendi).

| No | Ad | Ne |
|---|---|---|
| O | Bugünkü | 11 px lacivert üçgen |
| 1 | Büyük üçgen | Aynı üçgen, 15 px |
| 2 | Çeyrek daire | Köşede yuvarlak lacivert çeyrek daire |
| 3 | Nokta | Sol üstte küçük lacivert nokta |
| 4 | Not kâğıdı | Yapışkan not simgesi (açılan notun başlığındaki simge) |
| 5 | Mesaj balonu | Yazılı mesaj balonu |
| 6 | Kıvrık köşe | Kâğıt köşesi kıvrılmış gibi, altında gölge |
| 7 | Kenar çizgisi | Sol kenarın üstünde kısa lacivert çizgi |
| 8 | Yazı satırları | Üç kısa satır simgesi |
| 9 | Ataş | Ataş simgesi |
| 10 | Note etiketi | LIVE ve NEW gibi küçük NOTE etiketi |
| 11 | Dik ataş | Ataş dik duruyor, ince çizgili |
| 12 | Ataş rozeti | Beyaz daire, ince lacivert halka, içinde lacivert ataş |
| 13 | Dolu ataş rozeti | Lacivert kare içinde beyaz ataş |
| 14 | Kenara takılı ataş | Dik ataş kartın üst kenarına takılmış; üst ucu kenarın arkasında |
| 15 | Ataş + Note | Ataş ve yanında Note yazısı, kutusuz (seçilen LIVE gibi) |
| 16 | Çapraz ince ataş | 11'in ince ataşı çapraz, 15'teki gibi solda, 15 px, ilk satırla aynı hizada (Mert'in seçimi) |

## Tarayıcıda ölçülenler (2026-10-13)
- **Kontrast** (WCAG AA): yazılı işaretler en az 4.5:1, simgeler en az 3:1. 40 taslağın hepsi geçiyor; en düşükleri:
  - "!" taslakları Dinner kartında 3.4:1.
  - LIVE 5.5:1, NEW 5.5:1.
  - Not: 6 Kıvrık köşe 3.1:1 (sınırda), ötekiler 6.4:1 ve üstü. Ataşın beş yeni hâli 6.4:1 ve üstü; 13'te beyaz ataş lacivert karede 7.6:1.
  - Ataşın beş yeni hâli yazıya değmiyor (en yakın 15 Ataş + Note, 6 px); üzerine gelince not açılıyor (tarayıcıda denendi).
  - 16 Çapraz ince ataş: kontrast 6.4:1 ve üstü (öteki ataşlarla aynı lacivert); taslak kutucuklarında yazıdan 23 px uzak. Izgarada dar haftada (1440 px ekranda) ilk denemede ataş "Lunch-Line Cook" yazısına değiyordu. 6:05 PM'de ataşa yazının üstünde kendi satırı verildi; Mert bunu istemedi (kart yukarı büyüyordu), 6:50 PM'den beri ataş ilk satırın yanında ve ad ondan en az 4 px uzakta.
- **Turuncu tonu:** bugünkü turuncu (`--theme-availability`) Dinner kartının zemininde 2.8:1 kalıyor. Bu yüzden dolu ve çizgili turuncu taslaklar bir ton koyu turuncu kullanıyor: aynı turuncu, biraz koyu.
- **Çakışma:** 11 takımın hepsi ızgarada denendi (Original ve 1–10, dört işaret birlikte). Hiçbir işaret yazıya değmiyor (işaretli bütün kartlar). Aynı kartta "!" ile NEW arasında en az 6 px var. Sol üstte yer kaplayan not taslakları (3, 4, 5, 8, 9, 10) için kartın iki yanında o kadar boşluk bırakılıyor; sütun gerekirse genişliyor.

## Bilinmesi gereken
- Hiçbiri gerçek uygulamaya geçmedi; yalnız bu sayfada.
- "!" seçimi onaylı Availability planının 1. parçasına girer (`/mnt/project-files/notes/availability/2-spec-plan.md`, "Seçilen tasarım"). Bu iş Important Dates thread'inde kodlanacak.
- LIVE, NEW ve not seçimi "Vardiya kartı" thread'inin kart kataloğuna girdi (katalog 9. sürüm). Gerçek uygulamaya Mert "kodla" deyince geçer.
