# Proje Koordinasyonu

Kurulus: 2026-09-09. Kullanici bu gorusmeyi ana session olarak atadi.

## Ana Session Kimligi

| Alan | Deger |
|---|---|
| Baslik | Newfork Ana Session |
| Thread/session ID | `01a08788-cdba-72f1-a2aa-9c61c296f5c4` |
| Host | `local` |
| Project ID | `1f752711-3fc7-4175-b322-85423534d75c` |
| Ana checkout | `C:/Users/TheWe/Documents/Codex/newfork-clean` |
| Kurulusta branch | `codex/phase-1-foundation` (her yeni ise baslarken dogrula) |
| Sidebar | Pinned; 2026-09-09 tarihinde uygulandi |

Pin erisimi kolaylastirir; kalici durum bu belgeler ve Git'tedir. Bu duzen bir arka plan servisi veya zamanlanmis otomasyon kurmaz. Ana session aktifken delegasyon ve sonuc toplama araclarini kullanir; sonraki calismada kayittan devam eder.

## Kayitlar ve Oncelik

- [WORK](WORK.md): tek is kaydi, sorumlu session/branch, kabul kosulu, son kanit, siradaki adim ve kisa ilerleme gunlugu.
- [ROADMAP](ROADMAP.md): MVP hedefi, teslimat sirasi ve asama kabul kosullari.
- [BACKLOG](BACKLOG.md): aktif olmayan fikirler, hatirlatmalar ve bagimsiz bulgular.
- `docs/rebuild` ve `.planning/codebase`: gerektiginde okunan urun sozlesmesi, teknik harita ve tarihli kanit kaynaklari. Guncel global durum icin rakip log olusturulmaz.
- Kullanicinin son acik karari ilgili eski karardan ustundur. Bu dosyalar onceki urun kararlarini topluca iptal etmez. Tarihli dokumandaki test PASS veya "devam ediyor" ifadesi bugunun durumu sayilmaz.

## Yetki ve Gorevler

Ana session hedef/kabul kosulunu belirler, gerekli arastirmayi yapar veya devreder, bagimliliklari ve dosya sahipligini duzenler, cikan patch'i kabul kosullarina gore inceler ve entegrasyonu tamamlar. Kucuk, geri alinabilir teknik kararlarda tekrar izin istemez. Kullanici tarafindan yetkilendirilmis kapsamda alt task acabilir ve takip mesaji gonderebilir.

Alt session'in "bitti" raporu tek basina kabul degildir. Ana session kritik sonucu ve kaniti inceler; ayni testleri mekanik olarak yeniden calistirmaz. Gerekirse yalniz kalan entegrasyon riskini dogrular. Kabul kosullari karsilaninca WORK kaydini kapatir.

Ana session MVP kapsam genislemesini kendiliginden onaylamaz. Push, merge, deploy, hosted veri/sema degisikligi ve dis kisiye mesaj gibi islemler icin mevcut kullanici yetkisinin kapsamini kontrol eder; daha once verilmis yetkiyi tekrar sormaz. Bu koordinasyon atamasi tek basina bu islemlere genel izin vermez.

Alt session gerekli teknik kararlari kendi gorevi icinde verir; kapsam disi bulgulari raporlar, ortak kayitlari degistirmez, yeni alt session zinciri baslatmaz. Kullanici dogrudan yeni yonlendirme verirse bunu uygular ve ana session'a bildirir. Ana session daima butun teslimatin sahibidir.

## Delegasyon ve Paralellik

- Varsayilan bir ana teslimat ve en fazla iki eszamanli alt session. Kucuk isler delegasyon maliyeti yaratmadan ana session'da tamamlanir.
- Arastirma veya bagimsiz implementasyon paralel olabilir. Ayni patch'in incelemesi incelenebilir cikti olustuktan sonra baslar; ayri reviewer yalniz risk/getiri gerektiriyorsa kullanilir.
- Her alt goreve dar bir hedef, kabul kosullari, gerekli dosya/karar baglantilari ve dosya/sozlesme sahipligi verilir. Tum sohbet veya repo belgeleri varsayilan olarak kopyalanmaz.
- Her implementasyon gorevinin tutarli tabani ve ayri branch/worktree'si tercih edilir. Gerekli kirli degisiklikler tabana alinmadan varsayilan branch'ten baslatilmaz; zorunlu ortak checkout'ta cakismayan dosya/hunk sahipligi kaydedilir.
- Ortak API/DB sozlesmesinin bir yazari olur. Ayri worktree ortak veritabani, port veya test verisini izole etmez; sema degisikliklerini sirala veya ayri yerel DB kullan. Calisan sunucunun checkout/port sahipligi belli olsun.
- Sonuc beklerken uygun bekleme/mesaj araclarini kullan; ayni durumu sik sik sorgulama. Ana session bagimsiz isi surdurur. Gerekli alt gorev bitmeden ana teslimati tamamlanmis sayma.
- Kurulustan once acilmis session'lar kendiliginden durdurulmaz veya yeniden gorevlendirilmez. Devralirken mevcut hedef ve dosya sahipligi ogrenilir; ilgili WORK kaydi uzerinden yonetilir.

## Agent ve Model Onerisi

Her implementasyon planinda gorevin zorlugu, belirsizligi, etkilenen yuzey sayisi ve hata maliyetine gore en uygun agent/model ve reasoning seviyesi onerilir. En pahali veya en yuksek reasoning varsayilan degildir. Bir cumle gerekce yeterlidir; model karsilastirmasi icin ayri arastirma isi acilmaz.

Asagidaki eslestirme olculmus benchmark veya fiyat iddiasi degil, baslangic sezgisidir. Atama sirasinda mevcut host'un sundugu model ve reasoning seceneklerini kontrol et; eski bir model adini zorla kullanma.

| Plan | Ornek | Baslangic onerisi |
|---|---|---|
| Basit, dusuk belirsizlik | Dokuman, dar UI duzeltmesi, tek modullu acik degisiklik | Ana session'da tamamla; delegasyon gerekirse mevcut katalogdaki hizli/ekonomik coding agent, ornegin `gpt-5.6-luna`, low/medium |
| Orta, bilinen desen | Bir ozelligin UI/API baglantisi, sinirli birkac modullu implementasyon | Dengeli coding agent, ornegin `gpt-5.6-terra` veya `gpt-5.6-sol`, medium |
| Zor, yuksek belirsizlik/etki | Yetkilendirme, veri butunlugu, concurrency, birden fazla domainin sozlesmesi | Guclu muhakeme agent'i, ornegin `gpt-6-astra`, high; somut gerekce varsa daha yuksek |

Format: `Zorluk: orta. Oneri: <model>, medium. Gerekce: mevcut desene uyan UI/API degisikligi. Calisan model: <biliniyorsa mevcut ayar>.`

Oneri otomatik model degisikligi degildir. Kullanici belirli modeli secmediyse yeni task'in model ayarini override etme; mevcut/yapilandirilmis varsayilanla ilerle ve oneriyi kaydet. Kullanici secimi sonraki ilgili gorevlerde gecerliligini korur. Mevcut model bilinmiyorsa tahmin etme. Tekrar eden somut basarisizlik veya yeni karmasiklik varsa stratejiyi ve model onerisini yeniden degerlendir; kor tekrar yapma.

## Gorev ve Sonuc Sozlesmesi

```text
Gorev:
Is ID / hedef / kabul kosullari:
Ana session ID:
Checkout / branch / baslangic commit veya gerekli WIP:
Ilgili belgeler ve dosya/sozlesme sahipligi:
Kapsam siniri / bagimliliklar:
Zorluk / agent-model onerisi / kisa gerekce:

Sonuc:
Is ID / ne degisti veya ne bulundu:
Branch ve commit veya incelenebilir patch/dosya listesi:
Gerekli dogrulama, sonucu ve hangi kod durumuna ait oldugu:
Acik engel, kalan risk veya gerekli karar:
Kapsam disi bulgular:
```

Alt session kisa final raporunu ana session'a mesaj olarak iletir; arac yoksa ana session task sonucunu okur. Ayni uzun rapor farkli dosyalara kopyalanmaz. Kimlik, sir veya ham arac logu rapora doldurulmaz.

## Devralma ve Baglam Yenileme

1. COORDINATION ve WORK'teki ilgili kaydi oku; gerekirse ROADMAP/BACKLOG'un ilgili bolumunu ac.
2. Checkout/branch, gerekli WIP ve kayitli alt session'larin ilgili sonuclarini dogrula. Hazir kaniti yalniz kod/ortam degismis veya suphe dogmussa yenile.
3. Kompaksiyon veya normal yeniden acilis ayni ana session kimligini degistirmez. Yeni session kullanici tarafindan ana session olarak atanirsa yukaridaki kimligi guncelle ve eski/yeni ID'yi WORK gunlugune bir satir yaz.
4. Pin durumunu kullanicinin atamasina gore guncelle; baska sabitlenmis session'lari kaldirma. Ayni anda iki ana yazar olusturma.
5. Siradaki somut adimdan devam et; tamamlanmis arastirmayi veya testleri bastan baslatma.
