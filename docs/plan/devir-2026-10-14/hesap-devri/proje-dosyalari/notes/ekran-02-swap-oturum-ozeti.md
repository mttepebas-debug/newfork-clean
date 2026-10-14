# EKRAN-02 — Takas onay penceresi (H2) ve Requests tek tablo: oturum özeti

Yazan: salt okur araştırma ajanı, 2026-10-09. Hiçbir dosya, dal ya da kayıt değiştirilmedi; push yok. Saatler UTC.

## Kısa özet
1. Mert'in takas penceresi üzerindeki düzeltmelerinin hepsi tek oturumda, 2026-10-07 06:42–07:53 arasında yapıldı (artifact sürüm 1 → 16) ve hepsi sonra C2 koduna geçti. Kaybolan bir düzeltme yok.
2. Kodun hepsi `task/ekran-02-c2r` @ `8ef7b05a` dalında (origin'de): tek tablo, telefon kartları ve H2 penceresi. Main'de de canlıda da yok. Kararlar KARARLAR'da (main).
3. Main'e girmemesinin nedenleri: Mert'in görünüm bakışı (B4 = S2 + G13) hiç yapılmadı; `nf-guvenlik` ONAY'ının koşulları (şema dosyası, tam kapı, `test:db`, `requests-swap-review` e2e) karşılanmadı; 2026-10-08'den beri main CI kırmızı (BL-990); 2026-10-08 akşamı DUR ve iş akışı değişimi geldi.
4. c2r'de olmayanlar: `task/ekran-02-c2-css` (Shift Hub CSS + "Open shifts" kısayolu, #88–#89) ile `task/arayuz-salt-hata` dalları; KARARLAR'a yazılmamış 34 px düğme kararı; git dışında kalan artifact HTML'leri ve ekran görüntüleri (yalnız H2 görüntülerinin yedeği var).

## 1. Mert'in istekleri ve durumu (zaman sırasıyla)
Durum: **c2r'de** = yapıldı, `task/ekran-02-c2r`'de var, main'de yok · **KARARLAR** = karar main'deki `docs/plan/KARARLAR.md`'de · **açık** = cevap ya da iş bekliyor.

| # | Zaman | Mert'in sözü (aynen) | Ne yapıldı | Durum |
|---|---|---|---|---|
| 1 | 2026-10-06 ~10:20–10:28 (eski koordinatör penceresi `local_9c7e674a`; KARARLAR'dan) | "1 · C Shared language, green action at the end of the filter row çok begendim yalnız requests deki 2 katlı sekmeleri beğenmedim shared design a ters. bence time off ve diğer herşeyi 2 farklı tab yapmak yerine herşey requests in içinde aynı tabloda sıralansın. location filtresinin yanındaki tarih dropdownını request type filtresi yapalım. swap mı seek for cover mı time off mu ordan filtrelenebilir olsun." | Requests tek tablo; 6 Ekim gecesi `task/ekran-02-c1` (`f30b1681` …) | KARARLAR "Requests tek tablo"; kod c2r'de |
| 2 | 2026-10-07 ~07:10 (koordinatör aktarımı) | "Önce Requests" | EKRAN-02 sahip oturumu açıldı | — |
| 3 | 2026-10-07 ~07:15 (koordinatör aktarımı) | "107 maddeyi okumam mümkün değil. bana before after göndermen lazım." | Önce/sonra sayfası başlatıldı; #7'de Mert vazgeçti | Kabul listesi (`EKRAN.md`, 108 madde) hâlâ "taslak — Mert'in onayını bekliyor" |
| 4 | 06:42 | `@"C:\Users\TheWe\Desktop\bofa\meyhouse checks\Requests Warnings Lab.html"` "https://claude.ai/artifact/UvHbxipPcLVHmMW1ZVE4Xh bu link kırık. ama sen bu html den görüntüleyebilirsin" | Kaybolduğu sanılan tasarım worktree'de bulundu (`requests-warnings-lab.html`) | yapıldı |
| 5 | 07:07 | "…requests-warnings-lab.html artifact olarak ekle" | Artifact KwshRJ… sürüm 1 | yapıldı |
| 6 | 07:21 | "before after yapmana gerek yok . zaten kaybettiğimizi sandıgım design sende varmış" | Önce/sonra sayfası bırakıldı | yapıldı |
| 7 | 07:19 (artifact yorumu, 07:23'te oturuma düştü) | "onay penceresi için 6 tane sıfırdan design örneği istiyorum. minimalist ve clean." (07:23: "artifacttan mesaj queue da") | Sürüm 2: A–F | yapıldı |
| 8 | 07:28 | "daha küçük okunaklı sleek vee profesyonel 4 design daha istiyorum" | Sürüm 3: G–J | yapıldı |
| 9 | 07:34 | "h üzeirnde twist yapmak istiyorum" | H2 başladı | yapıldı |
| 10 | 07:35 | "⇄ daha koyu olsun. 2 shift badge de de 2 isim aynı kalınlıkta yazsın" | Koyu ⇄, iki isim aynı kalınlık | c2r'de |
| 11 | 07:35 | "Travel 30 of 45 min / Rest 8 of 10 h — travel ve rest alarm vermediği sürece gözükmesin ve daha açıklayıcı yazsın anlaşılmıyor bu" | Uyarı yalnız kural tutmazsa; metin #21–#29'da kutuya döndü | c2r'de |
| 12 | 07:35 | "Warnings don't block approval yazmasın" | Yazı kaldırıldı | c2r'de |
| 13 | 07:36 | "Decide by Oct 13, 9:00 AM pencere altına Warnings don't block approval yazmasın yerine gelsin" | "Decide by" pencerenin altında, solda | c2r'de |
| 14 | 07:36 | "shift badge içerisinde lokasyon isminin hemen yanına lokasyon pin iconu eklensin" | Sürüm 4; kodda konum simgesi | c2r'de |
| 15 | 07:39 | "badgelerin içindeki bütün meta data center olsun" | Sürüm 5 | c2r'de |
| 16 | 07:40 | "Ali Person ⇄ Deniz Person yazısını da center yap" | Sürüm 6 | c2r'de |
| 17 | 07:40 | "ilk badge içerisinde saatte am pm eksik düzelt" | Sürüm 7 ("3:30 PM–11:00 PM") | c2r'de |
| 18 | 07:41 | "shift badgelerin arasındaki ok çok yakın badge sınırlarına 1px kadar ya oku küçült ya kutuları uzaklastır tam ortalı center olsun" | Sürüm 8: 32 px boşluk, 15 px ok, tam ortada | c2r'de |
| 19 | 07:42 | "bunu kabul ettim. karar olarak alalım. bir de kural ihlali olan versiyonlarını göster" | KARARLAR "Takas inceleme penceresi H2" (`d9fd6922`); sürüm 9 ihlal hâlleri | KARARLAR + c2r'de |
| 20 | 07:43 | "şu harika bunu kilitledik" | Temel hâl kilitli (`5d93ab28`) | KARARLAR + c2r'de |
| 21 | 07:44 | "H2 Shift pair, twist üzerinde değişiklikleri yapalım. Deniz has 30 min to get here from Besiktas. Rule: 45 min. çok uzun ve shift badge i çok büyütüyor / Ali has 8 h of rest after Thursday's late shift. Rule: 10 h. çok uzun ve shift badge i çok büyütüyor ve de kirli" | Uzun cümle yerine iki kısa satırlı kutu ("30 min to travel / 45 min needed") | c2r'de |
| 22 | 07:45 | "kural ihlali tek taraflı varsa diğer tarafta da kurala uyan şeyi yazalım ki kurala uyan shiftteki o kısım boşluk kalmasın. ama uyanı yeşil uymayanı turuncu yazalım" | Turuncu kutu ihlalli kartta, yeşil kutu öteki kartta | c2r'de |
| 23 | 07:47 | "uyarı ünlemi çok küçük ve hiç align olmuyor. ayrıca satır aşağısına kayan olmasın. yazıları ona göre editle örneğin enough time to travel da travel aşağı kaymış" (+ "simetri ve adhd takıntılıyım ui konusunda") | Sürüm 10: büyük simge, tek satır, "Travel time OK" | c2r'de |
| 24 | 07:49 | "alt alta 2 tane uyarı varsa tikler ve ünlemler hizalansın" → 07:49 "son dediğimi geri al" | Sürüm 11, sonra sürüm 12'de geri alındı | Mert'in isteğiyle geri alındı; son hâlde simge solda sabit olduğu için yine hizalı |
| 25 | 07:50 | "uyarı textleri o kutucukları center yapsın. sağdan soldan boşluk eşit olsun" | Sürüm 13 | c2r'de |
| 26 | 07:50 | "3:30 PM–11:00 PM saat arasındaki tire işareti rakamlara çok bitişik" | Sürüm 14: "3:30 PM – 11:00 PM" | c2r'de |
| 27 | 07:51 | "uyarı kutucukları içindeki texte göre küçülmesin. her zaman sabit boyutta ve birbirleriyle dengeli olsun" | Sürüm 15: kartın iç genişliği × 44 px, hepsi aynı | c2r'de |
| 28 | 07:52 | "kutu boyları sabitlendiğine göre şimdi textleri de center yap" | Sürüm 16 | c2r'de |
| 29 | 07:52 | "onaylıyorum hepsini" | KARARLAR "Uyarı kutuları, kesin" (`6468fe6e`; KARARLAR saati ~08:05 yazıyor) | KARARLAR + c2r'de |
| 30 | ~08:24 (koordinatör aktarımı) | "Önce telefon düzelsin" | Telefonda talep başına kart (#67, `8a1581ca`) | c2r'de |
| 31 | 2026-10-07 ~07:40 (koordinatör penceresi; KARARLAR eki) | "request type dropdownı içindeki typelar yukardaki needs review in progress ve closed un yerine yazılsın. search bar sola doğru uzayıp locations a kadar gelsin" | Sekmeler All · Time off · Swap · Cover · Open shift; arama Location'a kadar (`730786fb`, `4aab5693`, `1373c61e`) | KARARLAR + c2r'de; ekranı Mert görmedi (B4) |
| 32 | 17:46 | "/code-review" | 8 bulgu | yapıldı |
| 33 | 17:59 | "Olur" | `07fdf40a`: kapanmış takasın penceresi nasıl bittiğini ve kimin takas ettiğini doğru söylüyor | c2r'de |
| 34 | 23:07 | "Düzelttin mi bunlari" | `e59fa1af` (karar yenilemeden önce bildiriliyor, pencere yenilemeden sağ çıkıyor), `0e94cf40` (saat biçimi tablonunkiyle aynı) | c2r'de |
| 35 | 23:24 (soruya cevap) | "Ikisini yeni bir artifact olarak bana sun görüp seçeceğim" | Artifact PYbKyq…: A = H2'nin 34 px düğmesi, B = izin çekmecesiyle eşit 36 px | yapıldı |
| 36 | 23:47 | "H2 deki daha estetik" | 34 px kalıyor; `C2.md`'ye yazıldı (`de435630`, c2r'de `4903f87f`) | c2r'de; KARARLAR'da **yok** |
| 37 | 2026-10-08 05:25 (koordinatör aktarımı, S1) | "Hayır, iki inceleme yeter." | Ek ultrareview yok | karar uygulandı |

Not: 10–29 arasındaki her şey artifact'ta yapıldı ve 2026-10-07 12:27–13:59 arasında C2 kodu olarak yazıldı (`task/ekran-02-c2`). Kodda kontrol edildi: konum simgesi, koyu ⇄, altta "Decide by", kutu metinleri "min to travel / min needed", "of rest / needed", "Unavailable / chose to take it", "On time off / chose to work", "Travel time OK", "No shift nearby". `task/ekran-02-c2`'deki bütün commit'ler c2r'de var: konu başlıklarıyla karşılaştırıldı, Requests ve takas dosyalarında fark yok.

## 2. Linkler (artifact'lar açılmadı, yalnız linkler toplandı)
- https://claude.ai/artifact/KwshRJ1SygGaDgyKJuuHT3 — "Requests Warnings Lab", sürüm 1 → 16. Aynı sayfanın öteki adresi: https://claude.ai/code/artifact/996de70b-8f89-4eb1-b990-e28496b0c6a6. Mert'in seçimleri: A–J içinden H, üzerinde H2; temel hâl kilitli (#20); uyarı kutuları sürüm 16'da kesin (#29). Kaynak dosya yalnız Mert'in bilgisayarında, git dışında: `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-02\artifacts\ekran-02\varyant\requests-warnings-lab.html`.
- https://claude.ai/artifact/UvHbxipPcLVHmMW1ZVE4Xh — G2'nin beş varyantı (Mert istemişti). 2026-10-07'de link kırıktı. Mert'in masaüstü kopyası: `C:\Users\TheWe\Desktop\bofa\meyhouse checks\Requests Warnings Lab.html`.
- https://claude.ai/artifact/PYbKyq7WaoWmZ7yRoCzT22 — takas düğme boyu karşılaştırması. Mert A'yı seçti ("H2 deki daha estetik"). Kaynak: `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-02\artifacts\ekran-02\c2\takas-dugme-boyu.html` (git dışı).
- https://claude.ai/artifact/R22hrq2pwAET22CKT6K1BE — 2026-10-06 tarihli beş liste sistemi. Mert Sistem 1'i ("1 · C Shared language") seçti; sürüm 2, tek tablonun son hâli.
- https://claude.ai/artifact/U4QsNASs9qycRg1UUMNApA — Employees telefon kartı (G2). Requests telefon kartlarının (#67) ölçü kaynağı.
- Kayıtlarda geçen ama Requests'e ait olmayanlar: https://claude.ai/artifact/SmqEkabujEfXHCktUxqbbK (liste sayfalarının ortak dili, DOC-TABLE), https://claude.ai/artifact/CQx4kkeVq1CJF3zGchvkXC (Employees telefon; açılmadı).
- Ekran görüntüleri: `backup/ekran-02-c2-screens` @ `a4781c71` (origin). 16 PNG: `artifacts/ekran-02/c2/h2-{clean,travel,rest,two,timeoff,locked,waiting,decline}-{1440,390}.png`.

## 3. Kararlar
- **Requests tek tablo** (Mert, 2026-10-06) ve **tür sekmeleri eki** (Mert, 2026-10-07 ~07:40): KARARLAR, main. Sekmeler All · Time off · Swap · Cover · Open shift; durum süzgeci yok; açık talepler üstte "Decide by"a göre sıralı, kapanmışlar altta.
- **Takas inceleme penceresi H2** (`d9fd6922`), **temel hâl kilitli** (`5d93ab28`) ve **Uyarı kutuları, kesin** (`6468fe6e`): KARARLAR, main. G2'nin yerini aldı; SABAH S3 cevaplandı.
- **Takas penceresinin düğmeleri 34 px** (masaüstünde 13 px yarı kalın yazı, 6 px köşe; izin çekmecesininki 36 px): yalnız `C2.md`'de (c2 ve c2r dalları). "Aynı işlevdeki bileşen aynı ölçüde" kuralına bilerek konmuş bir istisna. Koordinatörün KARARLAR'a yazması gerekiyordu; yazılmadı (origin/main, `coord/kayit` ve `task/devir-2026-10-08`'de arandı, yok).
- **"Önce telefon düzelsin"** → telefon kartları (#67).
- **S1:** ek ultrareview yok ("Hayır, iki inceleme yeter.").
- **G12** (red gerekçesi): Mert'e sorulmadı; koordinatör KK-225 ile karar verdi.

## 4. Açık sorular ve neden main'de / canlıda değil
**Mert'i bekleyen:**
- **B4** (`DURUM.md`): tek tablo ve C2 takas incelemesi için görünüm bakışı (S2 + G13). DURUM'daki not: "gelmeden c2r trene girmez".
- **G13** (`docs/plan/SORULAR.md`; `C2.md`'deki üç soruyla aynı):
  1. Öteki vardiyanın komşu vardiyası yoksa yeşil kutu "No shift nearby / 10 h needed" yazıyor. Önerilen: böyle kalsın.
  2. "Decide by" pencerede bölge adı olmadan yazıyor, tabloda "Istanbul time" var. Önerilen: pencereye de eklensin.
  3. Telefonda kartlar alt alta diziliyor, ⇄ dikey dönüyor. Önerilen: böyle kalsın.
- **S2** (`EKRAN.md` §3): 6 Ekim gecesi hazır kalan iki dal gitsin mi? Dal 1 = C3 (c2r'nin içinde), dal 3 = `task/arayuz-salt-hata`.
- **Sıralama oku** ("Soru-2", SORULAR): c2r'deki C3 commit'i oku hep görünür yapıyor. KARARLAR UI-02 ise "yalnız hover / focus" diyor. Kural sorusu cevapsız.
- **B5**: `nf-guvenlik`'in üç düşük bulgusu (`C2.md`) düzeltilsin mi, backlog'a mı gitsin?
  1. Kural tutsa bile dinlenme boşluğu dakika olarak gösteriliyor.
  2. Bayat pencere eski metni tutuyor; sunucu `PT409` ile reddediyor.
  3. Yol kutusu ölçülen dakikayı yazmıyor, dinlenme kutusu yazıyor.
- `EKRAN.md`'de açık kalan öteki sorular: S4/G3 (müdürün kısalttığı izin satırı, #73), S5, S6, BL-506, A4 (c), BL-255. Kabul listesinin kendisi de Mert'in onayını bekliyor.

**Neden main'de / canlıda değil:**
1. Mert'in bakışı (B4) hiç yapılmadı. 2026-10-08 öğle–akşam boyunca c2r trene hiç girmedi.
2. `nf-guvenlik` ONAY @`4903f87f` koşullu ve koşullar karşılanmadı:
   - `supabase/schema.sql` C2 migration'ıyla yeniden üretilmedi (Docker gerekiyordu);
   - tam kapı ve `test:db` koşmadı;
   - `requests-swap-review` e2e yeşil koşmadı. İlk koşuda paket ortak DB'de olmadığı için kırmızıydı, 7/8.
3. Tren-2'den (veri paketi) sonra main CI kırmızı (EKRAN-02-CI, bugünkü adı BL-990); kök bulunmadı.
4. 2026-10-08 16:28'de DUR geldi, 22:27'de devir notu yazıldı. Ardından iş akışı v2'ye geçildi.
5. C2 migration'ı `20261008111900_swap_review_measures_the_rule_that_holds.sql` hiçbir yerde uygulanmadı, ne yerelde ne canlıda.
6. Veri paketinin kendisi main'de ve canlıda (5 migration). Paketin eskiyi silen migration'ı `20261008111800` main'de ama canlıda değil (DURUM "Sırada" S3, main yeşilini bekliyor).

## 5. c2r'de olmayanlar (git ile doğrulandı; commit'ler origin/main ve c2r'de konu başlığıyla arandı)
1. **`task/ekran-02-c2-css` @ `463119cc`** (2026-10-06): iki commit ne c2r'de ne main'de var; devir notunda da adı geçmiyor.
   - `7304ca54`: Shift Hub CSS'i tema token'larına geçti, kullanılmayan karanlık tema kuralları silindi (#88, R2-47, BL-747).
   - `463119cc`: çalışan panosundaki "Open shifts" kısayolu Shift Hub'a gidiyor (#89). main ve c2r'de hâlâ `shift-hub#open-shifts` duruyor.
   - `EKRAN.md` §5 "Takas incelemesi: c2-css + C2" diyordu ama c2r yeniden kurulurken bu dal alınmadı. Çalışanın Shift Hub'ı, müdürün penceresi değil. Görüntüleri `artifacts/nf-arayuz/EKRAN-02-C2/` altında (git dışı).
2. **`task/arayuz-salt-hata` @ `125728ca`**: S2'yi bekliyor, c2r'de de main'de de yok.
   - BL-257: Requests durum çipi token'a geçti.
   - BL-334: telefonda ikon düğmeleri 44 × 44.
3. **`task/var-ekran-12` @ `d7c4130b`**: Requests G1–G4 ve S7 varyantları (`610bd330`, `?var=` arkasında). Varyantlar bilerek main'e girmeyecek (#107).
4. **İki rol hafızası commit'i** (`2ee14550`, `c0a5e701`): plan gereği bilerek düşürüldü.
5. **34 px düğme kararı**: KARARLAR'da yok, yalnız `C2.md`'de (bkz. §3).
6. **Git dışında, yalnız Mert'in bilgisayarında** (`artifacts/` gitignore'da):
   - `requests-warnings-lab.html` ve `takas-dugme-boyu.html` (artifact kaynakları);
   - tek tablo görüntüleri (`newfork-wt\ekran-02\artifacts\ekran-02\tek-tablo\`) ve telefon görüntüleri;
   - `h2-report.json` ile `h2-shots.mjs`;
   - canlı yedekler (`newfork-wt\ekran-02-pkg\artifacts\ekran-02\pkg\live-backup\`; 111800 uygulanana kadar gerekli);
   - devir notu `newfork-wt\ekran-02-pkg\artifacts\devir\DEVIR-EKRAN-02.md`. Bunun kopyası `task/devir-2026-10-08` dalında.
   - Yedeği olan tek şey H2 PNG'leri (`backup/ekran-02-c2-screens`). H2 görüntüleri gerçek DB'den değil, örnek değerlerle alındı.
7. **Başlanmamış takas maddeleri** (kayıp değil, yapılmadı): #80–#81, #83–#87, #90–#91. Ayrıca #82'nin cover / Shift Hub kısmı ve #79'da müdür notunun gösterilmesi.
8. **Kalan worktree'ler:**
   - `C:\Users\TheWe\AppData\Local\Temp\claude\c2r-wt` (temiz, silinebilir);
   - `newfork-wt\ekran-02` (`task/ekran-02`), `newfork-wt\ekran-02-c2r`, `newfork-wt\ekran-02-pkg`;
   - `newfork-wt\ekran-02-c3` (`task/arayuz-salt-hata`). 2026-10-08 22:26'da commit'lenmemiş C2 işi yoktu.
9. `backup/uncommitted/task/ekran-02-requests` (`bb5e12a0`): takas işiyle ilgisiz (rol hafızası).

## 6. Okunan oturumlar
- **`session_011VQWMbPaBxZREVHWg4vwF2`** "Own the Requests screen end to end (EKRAN-02)", 2026-10-07 06:40 → 2026-10-08 06:33. **Tamamı okundu.**
  - KARARLAR'da `local_224535dd…` diye geçen oturum bu.
  - Mert'in takas penceresi ve tek tablo üzerine doğrudan bütün mesajları burada; 06:42–07:53 ve 17:46–23:47 arası.
- **`session_01JVFbZkuqm7s2PxJ9gZc2XA`** aynı başlık, 2026-10-08 08:53–09:50. **Tamamı okundu.** Mert mesajı yok; veri paketinin tam kapısı, kilitler, duraklama.
- **`session_01Thnq5KXmADB8cnNNCu744s`** aynı başlık, 2026-10-08 10:22–22:27. **Tamamı okundu.** Mert mesajı yok; paketin canlıya ve main'e gidişi, c2r'nin yeniden kurulması, EKRAN-02-CI, DUR, devir notu.
- **Daha eski EKRAN-02 oturumu yok.** Uzak oturum listesinde arşivlenenler de var; en eski oturum 2026-10-07 06:08 ("Koordinatör"). Bu başlıkta yalnız bu üç oturum var.
- **`session_01CsoJiyudD884gReWW9PKwE`** "Koordinatör (v2)": **kısmen**, anahtar kelime taraması. 2026-10-09 02:42–04:12 arası tarandı; oradaki Mert mesajları yalnız durdurma ve onayla ilgili, Requests yok.
- **`session_01KFP7ChVE8TB3qP2CVsVwka`** "Koordinatör" (2026-10-07 06:08 → 2026-10-08 06:43): **yalnız en yeni sayfası** tarandı (Requests yok).
  - Mert'in koordinatöre yazdığı Requests sözleri (#2, #3, #30, #31, #37), EKRAN-02 oturumuna gelen koordinatör mesajlarından ve KARARLAR'dan alındı.
  - `session_01DzuuVtQzBptn1AcvcMZsLE` ve `session_01AZm3t8mPtuQARWcwbuYrQt` (2026-10-08 koordinatör oturumları) okunmadı.
- **Erişilemeyen (uzak listede yok):**
  - 2026-10-06 koordinatörü `local_9c7e674a…` (Mert'in Sistem 1 seçimi, #1);
  - `local_b9b956a0…`;
  - 6 Ekim gecesinin veri / web / arayüz hat oturumları. Raporları Mert'in bilgisayarında, `C:\Users\TheWe\Documents\Codex\.newfork-inbox\done\` altında.
- **Git:** origin'in salt okur kopyası, scratchpad'de. Okunan dallar:
  - `task/ekran-02-c2r`, `-c2`, `task/ekran-02`, `-data`, `-a1a2`, `-a3`, `-a4`, `-b1a`, `-b1b`, `-c1`, `-c2-css`, `-c3`, `-pkg`;
  - `task/arayuz-salt-hata`, `task/var-ekran-12`, `backup/ekran-02-c2-screens`, `task/devir-2026-10-08`;
  - main'deki KARARLAR, SORULAR ve DURUM.
