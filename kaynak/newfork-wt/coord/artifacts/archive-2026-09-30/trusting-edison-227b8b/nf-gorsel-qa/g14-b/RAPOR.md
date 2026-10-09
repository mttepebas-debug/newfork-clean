KARAR: ONAY @7e19a76b

## 7e19a76b'de yeniden bakıldı (2026-09-30) — bulgu 1 kapandı
Yalnız koordinatörün istediği tek kontrol yapıldı: gerçek kayıt akışında "Schedule save failed" penceresi, fareyle
(owner, Meyhouse, 9–15 Kasım, düzenleme oturumu; taslak kayıt isteği tarayıcıda engellendi).

| Adım (fare) | Sonuç |
|---|---|
| (a) Pencere açılınca ilk basış Discard | düğme kırmızı "Confirm discard"; hafta 9–15 Kasım, düzenleme çubuğu ve kart yerinde |
| (a) İkinci tık | değişiklikler atıldı, pencere kapandı, oturum "discarded" |
| (b) Pencere açılınca ilk basış Keep editing | pencere kapandı; hafta 9–15 Kasım, düzenleme çubuğu ve kart yerinde |
| (c) Pencere açılınca ilk basış boş yere | hiçbir şey olmadı; pencere açık, hafta ve kart yerinde |
| Unpublish penceresinin içine tık (12–18 Ekim) | pencere açık, hafta 12–18 Ekim, adres aynı |
| Publish penceresinin içine tık (12–18 Ekim) | pencere açık, hafta 12–18 Ekim, adres aynı |

Görüntüler: `z-a1-ilk-tik-discard.png`, `z-a2-ikinci-tik-atildi.png`, `z-b1-keep-editing.png`, `z-c1-bos-yere-tik.png`.
Kalıcı veri yok (select: "active" düzenleme oturumu 0, "G14B…" adlı taslak 0). Başka hiçbir şeye bakılmadı.
Aşağıdaki iki backlog maddesi (pasif Publish'te soluk odak halkası, hata durumundaki hafta düğmesinin rengi) açık.

Aşağısı önceki uçlarda yazılan rapor. Oradaki "DEĞİŞİKLİK İSTENİYOR" kararı ve bulgu 1, bu uçla kapanmıştır.

---
Önceki karar (993ee979): DEĞİŞİKLİK İSTENİYOR — tek madde: kurtarma penceresinde ilk fare basışı, bulgu 1.

## 993ee979'da yeniden bakıldı (2026-09-30)
Worktree `task/g14-b` @ `993ee979`'a alındı (main `d411d7a8` üstüne rebase + üç inceleme düzeltmesi).
`c6a27136`'dan bu yana ekran kodunda değişen: `shell/Tooltip.tsx`, `views/SchedulePage.tsx` (yalnız "bu haftaya dön"
yardımcısının yeri), `styles.css` (2 satır silindi).

**1. Neden balonu açıkken Escape — doğru.** Owner, gelecek hafta (2–8 Kasım), "Server" süzgeci seçili
(`?date=2026-11-02&jobs=…`).
- Tab ile Publish'e gelince balon açık. İlk Escape: yalnız balon kapanıyor; adres aynı (`date=2026-11-02&jobs=…`),
  hafta 2–8 Kasım, "Server" süzgeç çipi yerinde, odak Publish'te.
- İkinci Escape: sayfanın kuralı çalışıyor, süzgeç siliniyor (`?date=2026-11-02`), hafta yerinde.
- Fareyle gelip balon açıkken Escape: aynı, yalnız balon kapanıyor, adres ve hafta değişmiyor.
- Görüntüler: `y1-escape-oncesi-balon-acik.png`, `y1-ilk-escape-sonrasi.png`, `y1-ikinci-escape-sonrasi.png`.

**2. Pazar sütunundaki hayalet kartın konum iğnesi — doğru.** Pazar günü hayalet kart yerel veride yok; okuma cevabı
yalnız tarayıcıda değiştirilerek üretildi (Jordan Lee'ye pazar günü bir vardiya eklendi, lokasyon adı "Patio" ve
uzun bir ad yapıldı). Izgara sağa sonuna kadar kaydırıldı; iğne pencerenin sağ kenarında.

| Pencere | Balon metni | İğnenin ortası | Balon (sol–sağ, genişlik) | İğneye göre | Taşma |
|---|---|---|---|---|---|
| 1440 | "Patio" | 1410 | 1387–1432, 45 px | tam ortalı, üstünde | yok |
| 1440 | "Rooftop Terrace and Private Events Dining Hall" | 1410 | 1192–1432, 240 px, iki satır | sola çekilmiş, üstünde | yok |
| 390 | "Patio" | 360 | 337–382, 45 px | tam ortalı, üstünde | yok |
| 390 | uzun metin | 360 | 142–382, 240 px, iki satır | sola çekilmiş, üstünde | yok |

Görüntüler: `y2-1440-kisa-pazar-igne.png` (+`-yakin`), `y2-1440-uzun-pazar-igne.png` (+`-yakin`),
`y2-390-kisa-pazar-igne.png` (+`-yakin`), `y2-390-uzun-pazar-igne.png` (+`-yakin`).

**Bulgu 1 bu uçta da duruyor (yeniden ölçüldü):** kurtarma penceresinde Discard'a ilk fare tıkı yine yutuluyor, arkadaki
hafta 9–15 Kasım'dan 28 Eylül–4 Ekim'e atlıyor; ikinci tık kırmızı "Confirm discard". Deneme oturumu atıldı, "active"
oturum 0.

Aşağısı `c6a27136`'da yazılan rapor; koordinatöre göre geçerli.

---

# G14 dilim b — görsel QA (nf-gorsel-qa, 2026-09-30)

Dal `task/g14-b` @ `c6a27136`. Dal origin'de yok; işçinin klasörüne (`nostalgic-mestorf-5b3bba`) dokunmamak için aynı
commit kendi worktree'mde (`trusting-edison-227b8b`, detached) açıldı. Kod birebir aynı. Sunucular web 5616 /
API 5617. Masaüstü 1440×900, light. Roller: owner (seed `owner@newfork.test`, Meyhouse) ve manager (Ayşe, test
dünyası). Test ve build koşturulmadı.

## 1. Nerede duruyor
Bitti. Altı maddenin beşi doğru. Beşinci madde (kurtarma penceresi, gerçek kayıt akışı) klavyeyle doğru, fareyle
beklendiği gibi değil. Nedeni bu dalın getirdiği bir şey değil, main'de de olan eski bir hata; ama dalın teslim
ettiği "Discard ilk tıkta kırmızı olur" davranışını fareyle bozuyor.

## 2. Bulgular (önem sırasıyla)

### 1. ENGELLEYİCİ — "Schedule save failed" penceresinde ilk fare basışı yutuluyor ve arkadaki hafta değişiyor
- **Ekran:** Schedule → düzenleme oturumu → Publish → taslak adı → Save As → kayıt düşünce açılan "Schedule save
  failed" penceresi.
- **Ne görünüyor (fare):** pencere açıldıktan sonraki ilk basış, nereye yapılırsa yapılsın (Discard, Keep editing ya
  da pencerenin boş bir yeri), hedefine ulaşmıyor. Aynı anda arkadaki sayfa düzenlenen haftadan (9–15 Kasım) bugünün
  haftasına (28 Eylül–4 Ekim) atlıyor; düzenleme çubuğu ve eklenen vardiya kartı görünmez oluyor; adres
  `?date=2026-09-30&mode=edit&view=week` oluyor. Pencere açık kalıyor ve hâlâ "Your changes are still here" diyor.
  - Discard: 1. tık → hiçbir şey (düğme beyaz "Discard"), hafta atlar. 2. tık → kırmızı "Confirm discard".
    Silahlıyken Escape → düğme iniyor, pencere açık. Fareyle üçüncü (onay) tık ayrıca ölçülmedi; onay klavyeyle
    ölçüldü ve atıyor.
  - Keep editing: 1. tık pencereyi kapatmıyor, hafta atlar. Pencere kapatılınca kişi başka bir haftada, düzenleme
    çubuğu olmadan kalıyor. Değişiklikler silinmiyor (veritabanında oturum "active" duruyor), ama ekranda yok;
    geri gelmesi için 9–15 Kasım haftasına dönüp New Schedule (blank) demek gerekiyor (böyle geri geldiği görüldü).
- **Ne görünüyor (klavye):** her şey doğru. Tab sırası Keep editing → Discard → Retry save. Discard'da Enter →
  kırmızı "Confirm discard" (zemin rgb 184,66,52, beyaz yazı ≈ 5,4:1), hiçbir şey atılmıyor, hafta ve kartlar
  yerinde. Silahlıyken Escape → yalnız düğme iniyor, pencere açık. İkinci Escape → pencere kapanıyor, düzenleme
  modu, hafta ve kartlar yerinde. Silahlıyken ikinci Enter → değişiklikler atılıyor, oturum "discarded".
- **Ne olmalı:** koordinatörün sorduğu davranış fareyle de geçerli olmalı: ilk tık kırmızı "Confirm discard", hafta
  ve düzenleme görünümü yerinde.
- **Neden (okunan kod, düzeltme önerisi değil):** pencere açılırken Publish'in kayıt paneli hâlâ "açık" sayılıyor;
  sayfanın basış dinleyicisi (`apps/web/src/views/SchedulePage.tsx:2143-2158`) ilk basışı "paneli kapat" diye
  yutuyor. İşçi raporunda bunu olasılık olarak yazmıştı; gerçek akışta her seferinde oluyor. Hafta atlamasının
  hangi satırdan geldiği bu incelemede bulunmadı.
- **Eski mi:** evet. `origin/main` @ `2eaf490b`'de aynı akış ölçüldü: ilk tık yutuluyor ve hafta atlıyor, ikinci tık
  (main'de tek tıklı Discard) doğrudan atıyor. Dal bu dinleyiciye dokunmamış
  (`git diff origin/main...c6a27136 -- SchedulePage.tsx` içinde `closeTopActionSurfaces`, `topActionSurfaceOpen`,
  `suppressedScheduleClickTargetRef` yok).
- **Engelleyici mi:** bu dilimin BL-440 eki için evet (teslim edilen davranış fareyle gerçekleşmiyor). Kök neden
  eski olduğundan ayrı bir düzeltme dalı da olur (KK-37 kalıbı); karar koordinatörün. Hafta atlaması ayrıca backlog
  maddesi olmalı: (leave: high / do: moderate) "Keep editing'e basan kişi düzenlemesini ekranda kaybediyor".
- **Görüntüler:** `5-owner-kurtarma-1-acildi.png` (pencere açıldı, arkada 9–15 Kasım ve kart),
  `5-owner-kurtarma-2-ilk-tik.png` (ilk tıktan sonra: arkada 28 Eylül–4 Ekim, kart yok, düğme beyaz),
  `5-owner-kurtarma-3-ikinci-tik.png` ve `…-yakin.png` (ikinci tık: kırmızı "Confirm discard"),
  `5-owner-kurtarma-4-silahli-escape.png`, `5-dal-C1-notr-tik.png` (boş yere basış), `5-dal-K1-keep-editing.png`,
  `5-dal-B-klavye-silahli.png` ve `…-yakin.png` (klavyeyle doğru hâl), `5-dal-B-klavye-odak-yakin.png`,
  `5-dal-D2-atildi.png`; main karşılaştırması `5-main-A1-ilk-fare-tiki.png`, `5-main-K1-keep-editing.png`.

### 2. Backlog — Pasif Publish'te odak halkası da soluyor
- **Ekran:** Schedule üst çubuğu → Publish (basılamazken), Tab ile gelince.
- **Ne görünüyor:** halka var (2px, `rgb(23,122,100)`), ama düğmenin 0,55 saydamlığı halkaya da uygulanıyor; beyaz
  zeminde ≈ 2,3:1 (elle hesap). Gereken ≥ 3:1 (WCAG 1.4.11). Görüntüde seçiliyor ama soluk.
- **Ne olmalı:** halka tam renkte kalmalı. İşçinin "pasif düğmede fare-üstü rengi hâlâ oynuyor" notuyla birlikte
  ortak pasif kural işine (BL-340) eklenebilir. (leave: low / do: safe)
- **Görüntü:** `1-owner-publish-taslak-yok-klavye-yakin.png`.

### 3. Backlog — Hata durumundaki hafta düğmesi üst çubuktakinden farklı görünüyor
- **Ekran:** Schedule okunamayınca ("Schedule unavailable").
- **Ne görünüyor:** ‹ "Week of Sep 30, 2026" › gezinmesinde ortadaki düğme düz beyaz. Normal üst çubukta aynı düğme
  amber zeminli ve tarih aralığı yazıyor ("Sep 28 – Oct 4, 2026").
- **Ne olmalı:** aynı işlev, aynı görünüm. İşçi etiket farkını ("Week of …", haftanın ilk günü değil adresteki gün)
  bilerek yaptığını yazmış; renk farkı yazılmamış. (leave: low / do: safe)
- **Görüntü:** `2-owner-hata-durumu.png`.

### 4. Not — Kayıt ağdan düşünce kırmızı şeritte ham metin
- Kurtarma penceresi açıkken üstteki şeritte "Failed to fetch" yazıyor (tarayıcının kendi hata metni). Benim
  engellediğim istekten geliyor; sunucunun cevap verdiği hatalarda metin farklı olur. Bu dalın değişikliği değil.
  (leave: low / do: safe)

## 3. Doğru çıkanlar

**1. Basılamayan Publish (owner iki hâl, manager bir hâl).**
- Haftada hiç taslak yok (2–8 Kasım): düğme soluk (saydamlık 0,55), imleç "yasak" (`not-allowed`),
  `aria-disabled`. Fareyle gelince altında balon: "Save a named draft before publishing this week." Balon düğmenin
  altında, sağ kenarı 1432 px (pencere 1440), taşmıyor. Fare çekilince kapanıyor.
- Kayıtlı ama açılmamış taslak var (28 Eylül haftası, "SR regression test"): aynı görünüm, balon "Open a saved
  draft from New Schedule before publishing this week."
- Tab ile gelince: odak düğmede, halka görünüyor, balon açılıyor. Enter balonu kapatıyor, pencere açmıyor. Escape
  balonu kapatıyor, odak düğmede kalıyor. Tıklama yayın başlatmıyor.
- Taslak açılınca: düğme normal (saydamlık 1, imleç el, `aria-disabled` yok, balon yok).
- Manager (Ayşe, 2–8 Kasım): aynı görünüm, aynı balon, aynı konum.
- Görüntüler: `1-owner-publish-taslak-yok-*`, `1-owner-publish-kayitli-taslak-*`, `1-owner-publish-taslak-acikken.png`,
  `1-manager-publish-taslak-yok-*`.

**2. Schedule unavailable.** Hata kartının üstünde ‹ "Week of Sep 30, 2026" › var. Önceki → `date=2026-09-23`,
sonraki iki kez → `date=2026-10-07`, ortadaki düğme → bugünün haftası. Retry, okuma düzelince ızgarayı getiriyor.
Owner ve manager aynı. Hata, okuma cevabı tarayıcıda 500 yapılarak üretildi. Görüntüler: `2-owner-hata-durumu*.png`,
`2-manager-hata-durumu*.png`.

**3. Hızlı düzenleyici, vardiya tipi çipleri.** Üç çipin kenarı 1px `rgb(102,113,108)`, beyaz üstünde belirgin.
Fare üstünde ve seçiliyken kenar ve yazı mavi (`rgb(82,121,166)`), zemin açık mavi; klavye odağında 2px yeşil halka.
Düzenleyici gerçek düzenleme oturumunda "Add shift" ile açıldı. Görüntüler: `3-owner-hizli-duzenleyici-*`.

**4. Unpublish penceresi ve kapatma X'leri.** "Week" kartı 485–955 px, lokasyon kutusu 485–955 px, uyarı kutusu
485–955 px: üçü aynı genişlikte. X simgesi dört pencerede 18×18, düğmesi 38×36: Unpublish, Publish, Templates,
Save draft (Save draft, düzenleme modunda Export'a basınca açılıyor). Manager'da Templates X'i 18×18.
Görüntüler: `4-owner-unpublish.png`, `4-owner-publish-penceresi.png`, `4-owner-templates-penceresi.png`,
`4-owner-save-draft-penceresi.png`.

**6. Komşu regresyon.**
- Hayalet kartın konum iğnesi (Meyhouse, 12–18 Ekim, Garden Room): fareyle ve klavyeyle balon "Main Dining" açılıyor.
  İğne pencerenin sağ kenarına getirildiğinde (x 1407) balon 1269–1355 px arasında, taşmıyor, daralmıyor (86 px,
  ortadaki iğneyle aynı genişlik). Escape kapatıyor. Görüntüler: `6-owner-hayalet-igne-sag-kenar.png`,
  `6-owner-hayalet-igne-sol.png`.
- Telefon 390 px: üst çubuk düzeni işçinin "önce" görüntüsüyle aynı, yatay taşma yok; Publish soluk. Dokununca
  balon düğmenin üstünde açılıyor ve ekrana sığıyor (142–382 px). Görüntüler: `6-owner-telefon-*`.

## 4. Açık kalan ve nedeni
- **Manager'da Unpublish penceresi açılamadı:** test dünyasında ileri tarihli yayınlı hafta yok (yayınlı hafta 21
  Eylül, geçmiş; geçmiş haftada üst çubukta Publish / Published düğmesi hiç yok, owner'da da öyle). Dünyada yayın
  yapılmadı.
- **Manager'da "kayıtlı ama açılmamış taslak" hâli görülemedi:** aynı neden (dünyanın taslakları geçmiş haftada).
- **Balonun üstünde fareyle durulabilmesi** (WCAG 1.4.13) ayrıca denenmedi; işçi raporu "durulabilir" diyor.
- **Ekran okuyucuyla dinlenmedi.** Erişilebilir ad ve açıklama sayfadan okundu.
- U08 (936 px) bulgu olarak yazılmadı (kullanıcı kararı).

## 5. Ekranda ne değişti (gözlenen)
İşçi raporunun 4. bölümüyle aynı; ek olarak: kurtarma penceresinde Discard artık beyaz "Discard" → kırmızı "Confirm
discard" iki adımlı (klavyeyle ilk basışta, fareyle ikinci basışta).

## Kanıt
- Veri: yerel DB'ye kalıcı bir şey yazılmadı. Taslak kayıt isteği (`POST …/schedule/drafts/save`) tarayıcıda
  engellendi; her deneme düzenleme oturumunun atılmasıyla bitti. Son durum (select): Meyhouse'ta "active"
  düzenleme oturumu 0; taslaklar yalnız önceden var olan "SR regression test" ve "G14 QA". Denemelerin ikisinde
  oturum yarıda kaldı, sonraki koşuda uygulamanın kendi Discard'ı ile atıldı.
- Altyapı notu: bir koşuda API oturumu 10 saniyede doğrulayamayıp 503 verdi (makinede dal CI'ı koşuyordu);
  yeniden koşuda geçti, koda yüklenmedi.
- Main karşılaştırması: worktree geçici olarak `origin/main` @ `2eaf490b`'ye alındı, ölçümden sonra `c6a27136`'ya
  dönüldü.
- Skills: `design:accessibility-review` ve `design:design-critique` çağrılmadı; aynı sorular (kontrast, klavye,
  görünür odak, tutarlılık) sayfadan ölçülerek cevaplandı. `superpowers:verification-before-completion` çağrılmadı;
  yerine engelleyici bulgu üç ayrı koşuda (dal iki kez, main bir kez) yeniden üretildi ve görüntüleri açılıp
  bakıldı.
- Sunucular iş bitince PID ile durduruldu (tsx watcher dahil); bu worktree'den çalışan node süreci kalmadı.
- 50 görüntü bu klasörde.
