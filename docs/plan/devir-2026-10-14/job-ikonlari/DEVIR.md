# Devir raporu: "Restoran job ikon paketi" thread'i

Thread: proje sohbetinde Mert'in 14 Ekim 2026 00:06 (Kaliforniya) mesajıyla açılan "job ikon paketi" thread'i.
Rapor tarihi: 14 Ekim 2026, 09:50 civarı (Kaliforniya saati).
Devre uygun mu: **Evet.** Bu iş yalnız çizim dosyası. Uygulama koduna, veritabanına, main'e ya da trene dokunmadı. Yarım kalmış kod yok.

## 1. Amaç
- Restoran pozisyonları için bir SVG ikon ve çizim paketi.
- Her job'a bir çizim atanacak: Settings → Departments and Jobs → iş çekmecesinde seçilecek.
- Lineup'ta her kişinin **isminin soluna**, bugünkü baş harflerin (örneğin "AD") yerine o kişinin job çizimi gelecek.
- Mert her parçayı numarasıyla seçer: `keep` (kalsın) ya da `sil`.

## 2. Bugünkü durum (173 parça, hepsi "bekliyor")
Mert 09:26'da (Kaliforniya 02:26) "Buraya kadar yeterli" dedi. Çizim durdu. Hiçbirine henüz keep ya da sil verilmedi.

| Numara | Ne | Stil | Tur |
|---|---|---|---|
| 1–26 | Nesne ikonları (tepsi, şişe, bıçak…) | İnce çizgi, tek renk, uygulamadaki küçük ikonlar gibi (24×24) | 1 |
| 27–52 | İnsan ve alet ikonları, aynı ince stil | 24×24 | 2 |
| 53–58 | Mert'in örnek resimlerine göre ilk 6 büyük çizim | Renkli: yüzsüz insan, düz renk, koyu çizgi (48×48) | 3 |
| 59–78 | 100'lük serinin 1. turu: işler ve insanlar | Renkli | 4 |
| 79–98 | 2. tur: daha iyi işçilik, Mert'in listesindeki roller, ara ara nesne (martini, shaker, old fashioned, kaytan bıyıklı garson silüeti) | Renkli | 5 |
| 99–118 | 3. tur: ikonik aletler | Renkli | 6 |
| 119–138 | 4. tur: ekipman ve 6 yeni iş | Renkli | 7 |
| 139–158 | 5. tur (147 kasa çekmecesi kaldı, diğerleri 9. turda değişti) | Renkli | 8 |
| 124–158 içinde 25 numara + 159–173 | 9. tur: 40 çizim, Mert'in 09:04 kuralına göre (bkz. bölüm 5) | Renkli | 9 |

- Mert 08:04'te (Kaliforniya 01:04) renkli stili seçti ve "bu seriyi çok beğendim" dedi.
- 9. turda değişen 25 numara: 124, 126, 127, 129, 133, 135, 139–146, 148–158. Eski (alakasız) hâlleri `svg/insan/cikarilan/` klasöründe duruyor; numaraları değişmedi.
- Her numaranın adı, önerilen job'u ve turu paketin `README.md` dosyasındaki tablolarda.
- Son önizleme resmi (40 çizim): `onizleme/tur9-onizleme.png`. Daha önce `tur5-onizleme.png` ve `tur6-8-onizleme.png` de thread'e gönderildi.

## 3. Mert'in seçimi yeni hesapta nasıl verilir
1. Mert yeni hesapta açılan thread'e numaralarla yazar. Örnek: `keep 53 59 160` · `sil 124 129`. Yazmadıkları "bekliyor" kalır.
2. Claude şu komutu çalıştırır (paket klasöründe):
   `python3 kaynak/araclar/durum.py keep 53 59 160`
   `python3 kaynak/araclar/durum.py sil 124 129`
   Araç numarayı parçanın kalıcı adına çevirir, `kaynak/status.json`'a yazar ve paketi yeniden kurar (`README.md`, `index.html`, svg dosyaları).
3. Claude galeri sayfasını yeniden yayınlar (bölüm 4) ve linki Mert'e verir.
4. Numaralar hiç kaymaz: durum, numaraya değil parçanın adına (slug) yazılır. Bir parça yeniden çizilirse aynı numarada kalır.

## 4. Galeri sayfası ve kaynak dosyalar
### Galeri (eski hesapta)
- https://claude.ai/artifact/XxfpgGwRtUH2P5jJKup5qi ("Job ikon paketi"). Kartlarda numara, Lineup boyutlarında (52, 44, 32 px) önizleme, tur filtresi ve 3 telefonlu Lineup örneği var.
- **Yayındaki hâli 158 parçalı** (9. turdan önce). Günlük 200 sayfa yayın sınırı doldu.
- Bu hesapta zamanlanmış bir görev var: "Job çizim sayfasını 17:00'de güncelle". 15 Ekim 00:05 UTC'de (14 Ekim 17:05 Kaliforniya) sayfayı 173 parçayla yeniden yayınlar ve thread'e link yazar. Eski hesabın kullanımı biterse görev çalışmayabilir. Bu bir kayıp değildir: güncel sayfa `index.html` dosyasında hazır.
- **Yeni hesap bu Artifact'ı göremez.** Mert'in iki hesabı birbirinin yayınladığı sayfayı görmüyor. Yeni hesap galeriyi kendi hesabında yeni bir Artifact olarak yayınlamalı (bölüm 8'deki brief).

### Kaynak dosyalar (tek doğru kaynak)
Proje dosyalarında: `/mnt/project-files/pages/gorsel-kararlar/gelen/job-ikonlari/`
GitHub yedeği: `mttepebas-debug/newfork-clean` reposunda `claude/project-thread-5du9p3` dalı, klasör `docs/plan/devir-2026-10-14/job-ikonlari/` (bölüm 6). İki kopya aynı.

| Dosya | Ne |
|---|---|
| `README.md` | 173 parçanın tablosu: numara, dosya, ad, önerilen job, tur, durum |
| `index.html` | Galeri sayfası, kendi başına çalışır (bütün çizimler içinde) |
| `svg/NNN-slug.svg` | 1–52 ince ikonlar |
| `svg/insan/NNN-slug-renkli.svg` | 53–173 renkli çizimler (53–58'in tek renk `-cizgi` hâlleri de var) |
| `svg/insan/cikarilan/` | 9. turda çıkarılan 25 alakasız çizim (yalnız arşiv) |
| `onizleme/` | Thread'e gönderilen önizleme resimleri |
| `kaynak/build.py` | Paketi kurar: `python3 kaynak/build.py` |
| `kaynak/status.json` | Mert'in seçimi: slug → keep / sil / bekliyor |
| `kaynak/icons.py` | 1–52 ikonların çizimi |
| `kaynak/kit.py` | Renkli çizimlerin ortak parçaları: renk paleti, kafa, saç, şapka, gövde, yelek, ceket, aşçı ceketi, önlük, dirsekli kol, el türleri |
| `kaynak/insan.py` | 53–78 ve bütün turların birleştiği liste (numara sırası burada belirlenir) |
| `kaynak/seri2.py` … `seri7.py` | Tur 5–9 çizimleri. `seri6.py` 25 yeri değiştirir, `seri7.py` 159–173'ü ekler |
| `kaynak/cikarilan/` | `seri4.py` ve `seri5.py`'nin 9. tur öncesi kopyası |
| `kaynak/gallery.html` | Galeri şablonu |
| `kaynak/araclar/durum.py` | Numarayla keep/sil (bölüm 3) |
| `kaynak/araclar/kontrol-sayfasi.py` | Bir turun çizimlerini büyük ve Lineup boyutlarında yan yana gösteren kontrol sayfası |
| `kaynak/araclar/onizleme.py` | Bir turun önizleme sayfası (resmi bundan çekildi) |

Araçların bir kopyası da `devir/threadler/job-ikonlari-kaynak/araclar/` altında. Araçlar paketin içindeyken paketi kendileri bulur. Başka yerdeyse `JOB_IKON_KAYNAK` ortam değişkenine `kaynak` klasörünün yolu verilir.

## 5. Kullanım kuralı (Mert, 14 Ekim 02:04 Kaliforniya)
Mert'in cümlesi: "unutma bunlar line upda insanların isminin soluna yerleştirilecek … işi yapan pozisyonun tarifi yada işi yapan kişinin direkt olarak o işi yapmak için en çok kullandıgı ve görenlerin direk o işi/pozisyonu çağrışım yapabileceği şeyleri çiz."
- Çizim ya o işi yapan kişidir (tepsi taşıyan garson gibi) ya da o kişinin en çok kullandığı, görenin hemen o işi anladığı alettir (sipariş defteri ve kalem gibi).
- **Yasak:** sahne ve genel nesne. Mert'in saydıkları: "closed" tabelası, el yıkama, soğuk oda kapısı. Aynı sebeple zamanlayıcı, mesai girişi, izin, vardiya takası, bahşiş kavanozu, dükkân cephesi, yemek kamyonu da çıkarıldı.
- Çoğu insan, ara sıra nesne.
- Lineup'ta yuvarlak avatar içinde durur. Arka plan job renginin açık tonu (%14). Kontrol boyutları 52, 44 ve 32 px. Her çizim 32 px'te okunur olmalı.
- Daha sonra: Jobs çekmecesinde her job'a bir çizim seçilecek. Lineup baş harf yerine bu çizimi gösterecek. Bu kodun hiçbiri başlamadı.

## 6. Dal ve push'lanmamış iş
- Bu thread uygulama koduna dokunmadı. Main'e giden ya da trende bekleyen iş yok. Yarım kalmış kod, test ya da migration yok.
- Proje dosyalarındaki paket GitHub'a yedek olarak gönderildi:
  - Dal: `claude/project-thread-5du9p3` (güncel main'den açıldı, yalnız bu klasörü ekler)
  - Klasör: `docs/plan/devir-2026-10-14/job-ikonlari/` (paket + bu raporun kopyası `DEVIR.md`)
  - Commit: bölüm 9'da
- Bu dal **yalnız yedektir**. Main'e gitmesi gerekmez. Çizimler uygulamaya girecekse seçilen svg'ler o işin kendi dalında `apps/web` altına konur.

## 7. Yeni hesaba taşınacak bulgular
### Mert'in beğenisi
- Renkli stil: yüzsüz yarım boy insan, net saç ve kıyafet, önde o işin aleti, düz renk ve koyu dış çizgi. Mert'in gönderdiği 3 örnek resmin stili.
- İşçilik önemli. Mert 01:24'te (Kaliforniya) şunları istedi: host stand'i anlaşılmıyordu; sommelier'nin şarap dökmesi kötüydü, kravat "varla yok arası"ydı; pizzacının kolu orantısız ve komikti. Bunlar `kit.py` ile düzeltildi: dirsekli kol, gerçek el, geniş yelek açıklığında görünen kravat, gölge.
- Mert'in rol listesi (hepsi pakette var): server, bartender, busser, expo, runner, host, hostess, barback, shift lead, manager, general manager, line cook, prep, chef, pastry chef, sous chef, grill, salad prep, dishwasher, receiver, driver, supervisor, sommelier, stocker, polisher, barista, mixologist "ve aklıma gelmeyen nice restoran işi".

### Teknik dersler
- **Küçük parçalar çizgisiz olmalı.** Nokta, yemek parçası, üst üste tabak gibi küçük şeyler dış çizgiyle çizilirse 32 px'te siyah lekeye döner. `kit.py`'de çizgisiz sınıf `X-n`; dış çizgi yalnız büyük şekillerde.
- `kit.render()` sınıf dili: `X` dolgu + koyu çizgi · `X-d` koyu ton, çizgisiz · `X-l` açık ton · `X-n` dolgu, çizgisiz · `s-X` üst kol kolu · `t-X` ön kol · `ao7`/`ao6` kol dış çizgisi · `ln`/`lt` detay çizgisi · `ll` beyaz parlama · `ln3` açık gri · `lg` altın · `lw` şarap.
- Her turdan sonra kontrol sayfasıyla büyük ve 32 px hâline bakıldı; okunmayan çizim yeniden çizildi (9. turda 4 tanesi: busser, shift lead anahtarı, manager rozeti, tabak yığını).
- Numara sabit kalır: yanlış çizim aynı numarada değiştirilir, liste yeniden numaralanmaz. `insan.py`'nin sonunda turlar bu kuralla birleşir.
- Ekran görüntüsü: bulutta `/opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless --no-sandbox --hide-scrollbars --window-size=G,Y --screenshot=çıktı.png file://...`. Görünen alan pencereden yaklaşık 90 px kısadır; boşluk PIL ile kırpılır.
- Yayın: günlük 200 Artifact sınırı var (her gün 00:00 UTC'de sıfırlanır). Bu thread 14 Ekim'de sınıra takıldı.

### Bu thread'in hafıza notu
Proje hafızasındaki `job-ikon-paketi.md` notunun kopyası koordinatörün devir klasöründe: `/mnt/project-files/devir/koordinator-hafiza/job-ikon-paketi.md`. Bu raporla aynı bilgiyi taşır; ikisi çelişirse bu rapor daha günceldir.

## 8. Yeni thread için brief taslağı
```
İŞ: JOB-IKON — Job ikon paketinde Mert'in keep/sil seçimini işle, galeriyi yeni hesapta yayınla
Bağlam: Paket hazır, 173 parça, hepsi "bekliyor". Devir raporu: docs/plan/devir-2026-10-14/job-ikonlari/DEVIR.md (claude/project-thread-5du9p3 dalı) ya da proje dosyalarında devir/threadler/job-ikonlari.md.
Paket: docs/plan/devir-2026-10-14/job-ikonlari/ (kaynak, svg, README.md, index.html).
1. Galeriyi bu hesapta yeni Artifact olarak yayınla: index.html'i oturumun geçici klasörüne kopyala, oradan yayınla, linki Mert'e ver.
2. Mert numarayla yazınca: python3 kaynak/araclar/durum.py keep <numaralar> / sil <numaralar>; aynı Artifact'a yeniden yayınla.
3. Yeni çizim yalnız Mert isterse. Kural: Lineup'ta ismin solunda duracak; sadece işi yapan kişi ya da en çok kullandığı alet; sahne ve genel nesne yok. Her çizimi 32 px'te kontrol et (kaynak/araclar/kontrol-sayfasi.py).
Dokun: yalnız paket klasörü. Dokunma: apps/, packages/, supabase/, main.
Sınıf: normal (çizim dosyası, uygulama kodu yok).
Bitti ölçütü: galeri yeni hesapta yayında; Mert'in verdiği her numara status.json'da; README sayıları doğru.
```
Çizimlerin uygulamaya girmesi (Jobs çekmecesinde seçim, Lineup'ta gösterim) ayrı bir iştir. Mert seçimi bitirince açılır. O iş yeni görsel tasarım ve yeni veri alanı içerir, bu yüzden önce Mert'e Original + varyantlar gösterilir.

## 9. Kontrol
- GitHub commit: (push sonrası aşağıya yazıldı)
