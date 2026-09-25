# Availability yeniden tasarim spec'i

Tarih: 2026-09-08
Durum: Urun davranislari ve uc gorsel secim kararlastirildi; manager tablosunun kompakt gorunumu prototipte iyilestirildi.
Kaynak: Bu task'taki soru-cevap kararlarinin son hali. Eski referans uygulama yalnizca ornektir.
Uygulama sirasi: [Implementation plan](availability-redesign-plan-2026-09-08.md).

## 1. Kapsam ve karar onceligi

- Availability, degistirilene kadar tekrar eden tek haftalik calisma tercihidir. Temporary/kalici ayrimi, tarihli istisna, baslangic/bitis tarihi ve manager onayi yoktur.
- Isaretlenmemis her saat/type available; yalnizca unavailable secilir. Preferred/limited ve yesil/turuncu tercih seviyeleri yoktur.
- Unavailable bir planlama uyarisidir; manuel vardiya yazmayi tek basina engellemez. Approved time off ve diger gercek engeller bundan ayridir.
- Calisan tercihi ile yoneticilerin ortak planlama hatirlatmasi ayri kayitlardir. Tek editoru ve ayni unavailable mantigini kullanirlar.
- Time Off Request mevcut form, karar ve atama etkileriyle korunur. Gecici degisiklik bu akisla iletilir.
- Scope: editorler, Settings, onboarding, takim gorunumu, Schedule degerlendirmesi/uyari temizligi ve mevcut pickup/cover/swap/Line Up akislarina availability uyarlamasi.
- Scope disi: Line Up'in gorev/istihdam/lokasyon tasima islevlerini yeniden tasarlamak. Konusmada tartisilan Move here ile Schedule tasima, kaynak gorev silme, yeni bildirim/Employment donus akislarini bu is uygulamaz.
- Son kararlar oncekileri gecersiz kilar: onayli availability, uc renkli tercihler, shift saatlerini editor icinde duzenleme ve tum vardiyalari secince otomatik All day donusumu uygulanmayacak.

## 2. Organizasyon ayarlari ve zaman anlami

Tek Availability Settings bolumu, yalnizca organizasyon sahibi/admin tarafindan duzenlenir:

| Ayar | Degerler | Varsayilan |
| --- | --- | --- |
| Giris modu | Shift type / Saat araligi | Saat araligi |
| Uyari davranisi | Yalnizca uyar / Uyar ve onay iste | Yalnizca uyar |
| Onboarding adimi | Atlanabilir / Zorunlu | Atlanabilir |

- Uyari ayari calisan tercihleri ve acik yonetici hatirlatmalari icin ortaktir; eski hard availability ve override gerekcesi ayarlari kaldirilir.
- Shift type olustururken default baslangic/bitis saati zorunludur. Mevcut aktif type'larda eksikler tamamlanmadan shift type giris moduna gecilemez. Settings eksikleri ve ilgili duzenleme baglantisini gosterir.
- Shift type modunda bagli lokasyonlarin aktif type'lari gosterilir; ayni kimlik bir kez listelenir. Adi ayni farkli type'lar kimlik olarak birlestirilmez; gerektiginde lokasyonla ayirt edilir.
- Bir gunde birden fazla type unavailable secilebilir; saatleri editor icinde degistirilemez. Type secimi, default saat araligini temsil eder; vardiya adina dayali ayri bir engel degildir.
- Guncel Settings default saatleri kullanilir. Degisiklik mevcut type tabanli tercihleri sessizce etkiler; yeniden onay veya bildirim yoktur.
- Kaydedilen gercek vardiya saatleri onceliklidir; saat girilmemisse vardiyanin default saatleri kullanilir. Ornek: Dinner unavailable 17:00-23:00; Dinner adli ama 12:00-16:00 yazilmis shift bununla cakisma yaratmaz.
- Saat modunda gun basina tek unavailable araligi; 00:00-24:00 siniri. Bitis 24:00 olabilir, baslangictan buyuk olmalidir; geceye tasan saat araligi girilemez.
- Yalnizca default saati geceyi asan shift type ertesi gune tasar. Editor '+1/ertesi gun' etiketi gostermez; hesaplama ertesi gundeki saatleri kapsar.
- All day ayri secimdir ve takvim gununun 00:00-24:00 araligidir. Ayrintilar kapalidir; kapatilinca gun available olur ve ayrintilar yeniden secilir. Otomatik All day donusumu yoktur.
- Haftalik tercih tum lokasyonlarda ortaktir; her vardiya lokasyonunun yerel saatinde yorumlanir. DST ve overnight hesaplari mevcut kanonik zaman altyapisini kullanir; editor yeni fold/timezone ayarlari sunmaz.
- Her pozitif sure kesisimi cakismadir; bitis ve baslangicin esit olmasi cakisma degildir. Onceki gunden tasan unavailable aralik, ertesi gunun available olmasiyla silinmez.

### Mod ve katalog degisiklikleri

- Giris modu degisince eski calisan tercihleri korunur ve yenileme bildirimi gider. Manager hatirlatmalari da korunur; drawer yenileme ihtiyacini gosterir.
- Eski type tabanli kayitlar yenilenene kadar guncel default saatlerle degerlendirilir.
- Yeni modda editor bos taslakla acilir; eski tercih referans olarak gorunur. Kaydedene kadar eski kayit gecerlidir. Eski unavailable tercihleri bos duzenle kaldirmak ek teyit ister.
- Arsilenen/silinen type'a bagli tercih son gecerli saatlerle korunur; eski ad ve yenileme ihtiyaci gosterilir. Silme oncesi referans/saat bilgisi kaybolmamali.
- Lokasyon baglantisi kaldirildiginda eski type tercihi kaybolmaz; eski secim olarak gorunur, kaldirilabilir. Type aktif kaldigi surece guncel default saat kurali surer.
- Yeni type notr baslar; ilgili gunde All day varsa kapsamindadir. Yeni type icin ek bildirim yoktur.

## 3. Calisan ve yonetici kayitlari

### Calisan

- Kaydet aninda gecerlidir; onay/ret/bekleyen availability kuyrugu yoktur.
- Ilgili lokasyon yoneticileri ve organizasyon admini/sahibine degisen gun/type/saat ozeti bildirilir. Bildirim calisan drawer'inin Availability bolumunu acar.
- Kaydet yaninda surekli uyari: "Tercihleriniz kaydettiginizde guncellenir. Yoneticinize bildirim gider ancak hemen gormeyebilir; ayrica yazili veya sozlu haber verin. Gecici degisiklik icin Time Off Request kullanin. Atanmis vardiyalariniz degismez." Nihai UI metni uygulamanin mevcut diliyle yazilir.
- Hic kaydetmeyen available sayilir, yoneticide 'Henuz belirtmedi' gorunur. Bos haftayi acikca kaydetmek 'Tum gunler available' beyanidir.
- Calisan gun notu ve degisiklik gecmisi gormez. Yetkili manager gecmisi drawer History bolumunden gorur.
- Onboarding ayni editoru kullanir. Zorunluysa unavailable kaydi veya tum gunler available teyidi gerekir; atlanabilirsa sonra doldurulabilir.

### Ortak yonetici hatirlatmalari

- Calisani yonetmeye yetkili tum yoneticiler gorebilir/duzenleyebilir. Tek bir bagli lokasyonda yetki yeterlidir; kayit tum lokasyonlarda uygulanir.
- Calisana API, bildirim, paylasilan gorunum, hata metni veya UI uzerinden aciklanmaz. Manager ayni zamanda calisansa kendi kaydinda yonetici yetkisi gecerlidir.
- Haftalik duzendir; tarihli hatirlatma yoktur. Gunde istege bagli not bulunur; not ikonu alani acar, kayitli notun kisa ozeti gorunur.
- Not tek basina Schedule uyarisi uretmez. Unavailable cakismasi varsa yetkili manager uyari ayrintisinda gun notunu gorur.
- 'Calisanin tercihlerini aktar' son kayitli tercihleri birebir kopyalar, mevcut unavailable secimlerinin tamamini taslakta degistirir; yonetici notlarini korur. Sonraki calisan degisiklikleri otomatik aktarilmaz.
- Calisan tamamen available ise aktarim tum unavailable secimlerini temizler. Henuz beyan yoksa aktarim devre disidir; bos beyanla hic beyan olmamasi ayirt edilir.
- Calisan basina ortak toggle ilk olusturmada aciktir. Kapaliyken kayitlar korunur, editor salt okunurdur ve aktarim/duzenleme kapalidir; once acilmalidir. Acma ve duzenleme ayni taslakta Kaydet ile uygulanabilir.
- Toggle kapatildiginda tum aktif yonetici availability uyarilari, yayinlanmis vardiyalardakiler dahil gizlenir. Audit korunur; calisan availability uyarilari etkilenmez.
- Bolumun ayri, sabit Kaydet/Vazgec alani vardir. Eszamanli kayit baska yoneticinin degisikliklerini ezmez; taslak korunarak guncel kayitla yenileme istenir.
- 'Tumunu temizle' yalnizca unavailable secimlerini temizler, notlari korur. Kaydetmeden uygulanmaz.
- Her iki editor de kaydetmeden cikista soru sormadan taslagi birakir. Gunler arasi kopyalama yoktur.

## 4. UI sozlesmesi ve prototip kapisi

- Baglayici gorsel referans: bugun gelistirilen Settings Jobs & Departments. Mevcut availability'nin metin agirlikli/daginik duzeni tasinmaz. Temiz, hizli, mouse etkilesimi yuksek ve renklerle taranabilir modern/profesyonel UI hedefi kabul kriteridir.
- Mevcut Jobs & Departments olculeri baz alinir: 14px satir basligi, 12px destek metni, 11px sutun etiketi, kompakt 36px kontroller, mobilde 44px dokunma hedefleri, sabit drawer header/footer. Genel kabuk ve mevcut yetki kurallari korunur.

- Mevcut uygulamanin typography, bosluk, ikon, drawer ve kontrol dili kullanilir; eski referans port edilmez.
- Unavailable kirmizi + isaret/etiket; available notr. Renk tek anlam tasiyicisi degildir. Turuncu yalnizca conflict uyarisi icindir.
- Yedi gun birlikte, Pazartesi-Pazar. Shift secimi dogrudan tiklamayla acilir/kapanir; durum menusu yoktur.
- Tum availability ekranlarinda type adi yeterlidir. Desktop hover ve klavye focus balonunda default saatler; mobil basliktaki tek bilgi ikonunda vardiya-saat listesi.
- Saat alanlari baslangicta kapalidir; saat ekleme kontrolu acilir, silme gunu available yapar.
- Calisan sayfasi Availability / Time Off Requests sekmeleridir. Kaydet ve bilgilendirme alani ekran altinda sabit; icerigi ortmez.
- Drawer: calisan salt okunur haftasi + yonetici editoru. Calisan tum gunler available veya henuz belirtmemisse kisa ozet ve haftayi acma kontrolu. Ilk yonetici gorunumu bos haftalik editor.
- Takim sayfasi korunur, yalnizca calisan tercihlerini gosterir. Calisan x gun tablosu; available hucre notr cizgi, unavailable type adlari/saatleri gorunur. Hucre calisan Availability drawer'ini acar.
- Takim filtreleri: isim arama, lokasyon, Tumu/Belirtti/Henuz belirtmedi. Tarih secici kaldirilir. Mobilde isim sabit, gunler yatay kaydirilir.
- Requests icindeki availability onay sekmesi kaldirilir; Time Off/shift talepleri korunur.

| Kesinlesen gorsel karar | Secim |
| --- | --- |
| Drawer yerlesimi | Iki sekme |
| Mobil editor vardiyalari | Yatay kaydirma |
| All day kontrolu | Anahtar |

Tiklanabilir prototip: calisan, onboarding, drawer, takim tablosu, Settings ve Schedule tekil/toplu uyari-preflight akislarini ornek verilerle kapsar. Iki giris modu ve desktop/mobile gorunumler incelenir. Uc secim kesinlesti; alternatifler karsilastirma icin prototipte tutulabilir.

Manager hatirlatma tablosu kompakt ve hizali olmalidir: gun, unavailable secimleri, All day anahtari ve not ikonu ayni sabit grid sutunlarini kullanir. Bos notlar ekstra satir acmaz. Kayitli not tek satir ozet, duzenlenen not kontrollu genisleme olarak gosterilir. Mobilde vardiya secimleri kendi sutununda yatay kayar; saat girisi dar ekranda ikinci satira iner. Gereksiz alt durum metinleri kaldirilir.

## 5. Schedule degerlendirme ve uyari akisi

| Baglam | Davranis |
| --- | --- |
| Taslak vardiya | Tercih degisince uyarilar guncellenir; vardiya otomatik degismez |
| Yeni/planlama bilgisi degisen vardiya | Guncel tercih ve acik hatirlatmalar kontrol edilir |
| Yayinlanmis vardiya, yalnizca tercih degisti | Yeni uyari veya atama degisikligi yok |
| Yalnizca shift notu degisti | Yeni availability kontrolu yok |
| Otomatik atama | Unavailable aday atlanir; manuel atama mumkundur |

- Planlama bilgisi: calisan, tarih, saat, shift type, lokasyon. Saat degisirse yeni surenin tamami kontrol edilir.
- Her iki kaynak cakisirsa tek shift ikonu, tek toast/onay; ayrintida kaynaklar ayrilir. Sayim vardiya sayisidir, neden sayisi degil.
- Yalnizca uyar: kaydetme/birakma aninda islem oncesi kisa genel toast; onay beklemeden devam. Basari sonrasinda tekrar availability toast'i yoktur. Toplu islemde tek sayili ozet.
- Uyar ve onay iste: toast yerine tek Vazgec/Yine de kaydet. Availability override gerekcesi yoktur. Toplu onaydan vazgecmek tum islemi iptal eder.
- Suruklemede cakisan hedef turuncu cerceve ve ikonla birakilabilir kalir. Hover sirasinda toast spam'i yoktur; birakinca secili politika uygulanir.
- Add/Edit Shift: tek kisa availability satiri + ayrinti ikonu. Tekrarlayan banner, aciklama ve gerekce alanlari kaldirilir.
- Gercek engelleyici baska conflict varsa yalnizca engelleyici neden once gosterilir; availability toast/onayi bastirilir. Availability override diger engelleri asmaz.
- Kontrol teknik nedenle tamamlanamazsa kayit durur, taslak korunur. Kayit hatasi availability toast'inin yerini alir; suruklenen shift eski yerinde kalir.
- Kaydedilen Schedule shiftinde availability ikonu kalir. Onay fingerprint'i degismeyen cakismayi tekrar sormaz; yeni/degismis cakisma yeniden sorulur.
- Tercih/default saat/mod degisiklikleri yayinlanmis shiftlere yeni uyarilari geri doldurmaz. Toggle kapatma mevcut yonetici uyarisini gizler; tekrar acma yayinlanmis shiftte yeni uyari olusturmaz.
- Otomatik atama sonucu doldurulamayan vardiyalari tek ozetle aciklar; yetkili manager ayrintida availability nedeniyle elenen adaylari/kaynaklari gorebilir.

### Preflight

- Availability yoksa bolum yok. Varsa sayi ve acilabilir liste: tarih, sonra calisan; shift saatleri ve cakisan aralik birlikte.
- Onceden kabul edilenler ayri kapali grupta; yeni cakismalar once. Yalnizca uyar modunda checkbox/gerekce/ek onay yok. Onayli modda sadece yeni veya degismis cakismalara tek toplu onay.
- Publish aninda son kontrol: yeni cakisma varsa uyar modunda ozetle devam, onayli modda guncel listeyle onay bekle. Teknik kontrol hatasi yayinlamayi tamamlamaz.
- Listedeki shifte tiklaninca preflight kapanir; Schedule edit moduna doner, calisan/shifte kayar ve kisa animasyonla isaretler. Shift editoru otomatik acilmaz.
- Yalnizca hedefi gizleyen filtreler kaldirilir. Kaydedilmemis grid taslagi korunur. Publish yeniden acilinca onceki kapsam/secimler korunur, kontroller guncellenir.

## 6. Pickup, cover, swap ve kabul kaniti

- Availability temel talep/atama kurallarini yeniden tanimlamaz. Mevcut izin, istihdam, yetki ve baska vardiya cakismasi kontrolleri korunur.
- Cover adaylari unavailable diye gizlenmez; diger calisanin tercihleri veya yonetici notlari ifsa edilmez.
- Pickup listesinde calisanin kendi availability cakismasi gorunur, vardiya secilebilir.
- Pickup/cover/swap veya Line Up teklifini ustlenen calisan kendi cakismasi icin tek acik 'Yine de talep et/kabul et' karari verir. Kalici haftasi degismez.
- Calisanin gonullu kabul kaniti ayni vardiya icin Schedule, Line Up ve preflight'ta gecerlidir; tekrar availability onayi istenmez. Manager talebi sonuclandirirken calisan veya yonetici availability kaynagi icin ikinci karar istenmez. Yoneticilere kabul bilgisi gosterilebilir.
- Bu istisna approved time off veya diger engelleri gecersiz kilmaz; kabul kaniti istemcinin serbestce gonderebildigi bir bayrak degildir.
- Islem kesinlesmeden vardiya tarih/saat/lokasyonu degisirse kullanici kararina gore kabul korunur, calisana degisiklik bildirilir. Ayni talep/vardiya kimligi icindeki bu degisiklikler yeniden kabul istemez; baska calisana veya baska vardiyaya kabul aktarilmaz.

### Availability kaydinda bekleyen ustlenmeler

- Yeni tercihle yeni/degismis cakismasi olan, henuz kesinlesmemis pickup/cover/swap ve kabul edilmis Line Up teklifleri Kaydet oncesi tek listede gosterilir.
- Her talep icin Koru/Iptal et secilir. Kendi vardiyasini devretme talebi listeye girmez; devredilene kadar vardiya sorumlulugu kendisindedir.
- Availability ve talep kararlari birlikte uygulanir. Koru karari ilgisiz gun degisikliklerinde tekrar sorulmaz; ilgili cakisma degisirse tekrar sorulur.
- Manager bu sirada talebi onaylamissa atama geri alinmaz: availability kaydi tamamlanir, iptal edilemeyen talep ve mevcut sorumluluk acikca bildirilir. Diger talep secimleri uygulanir.
- Bu kontrolu tamamlama penceresi genel 'aninda kaydet' akisinin bilincli istisnasidir; availability manager onayi degildir.

## 7. Line Up availability uyarlamasi

- Aranacak zaman araligi once belli olmali: gorev saatleri, yoksa secili vardiyanin default saatleri; ikisi de yoksa saat girisi gerekir.
- Degerlendirme aranan gorev araligina gore yapilir. Saatler degisince secili aday korunur, uyari guncellenir.
- Yalnizca availability nedeniyle cakisanlar gorunur ve secilebilir; turuncu uyari, ortak Settings politikasi. Kismi cakisma istenen sureyi otomatik kisaltmaz.
- Uyariya ragmen atama yalnizca o atama icindir. Tamamlanan Line Up atamasinda availability isareti kalkar, kayit gecmiste kalir.
- Mevcut atamada sonraki tercih degisimi yeni uyari olusturmaz. Yalnizca masa/bolum dagitimi tekrar kontrol istemez; kisi/saat degisirse yeni surenin tamami kontrol edilir.
- Yayimlanmis vardiyanin icindeki gorev dagitimi yeniden availability onayi istemez. Vardiya disina tasan veya yeni sorumluluk doguran atama guncel kurallari kullanir.
- Teklif gonderirken manager icin bilgi yeterlidir; dogrudan atamada ortak onay ayari uygulanir. Calisan kabulunde kendi cakismasina acik onay verir.

### Arama gruplari (gorunum, yeni atama motoru degil)

Bir calisan bir kez listelenir; diger durumlar etiket olarak gorunur:

1. Not assigned to this location: eksik is atamasi, calisiyor veya Day off durumundan once gelir.
2. Not assigned to this job: eksik lokasyon yoksa; calisiyor/Day off/availability'den once gelir.
3. Working somewhere else: ayni saatlerde baska lokasyonda shift.
4. Working here: ayni saatlerde ayni lokasyonda shift; 'Working here as [position]' etiketi.
5. Day off: o takvim gununde yayinlanmis shift yok; unavailable olsa da burada, ek etiketle.
6. Uygun degil: kalan adaylarda availability veya mevcut uygunluk nedenleri. Sebep acikca ayirt edilir; gercek engeller secilebilir hale gelmez.
7. Uygun: kalan uygun adaylar.

Yukari sira grup atama onceligidir; UI gosterim sirasi Uygun, Uygun degil, Working somewhere else, Working here, Day off, Not assigned to this location, Not assigned to this job'dir. Bu gruplama yeni transfer, gorev silme veya istihdam degisikligi yetkisi vermez. Mevcut uygunluk/atama aksiyonlari korunur. Kaynaklar ayni saatte birden fazla vardiya gibi tutarsizlik gosteriyorsa gercek conflict acik kalir.

## 8. Teknik uygulama varsayimlari ve kabul siniri

- Manager/employee kayitlari, audit ve notification payload'lari sunucuda ayrilir. RLS ve tum okuma kanallari gizlilik sozlesmesine uyar.
- Availability kaydi, manager hatirlatmasi, Settings ve talep durumlari revision ile kontrol edilir. Cakisma kabul kaniti ilgili atama/tercih/politika baglamina baglidir; ilgisiz degisiklikler tekrar onay dogurmaz.
- Kayit + audit + bildirim olayi transaction/outbox ile baglanir. Teslimat gecikmesi kaydi geri almaz; mevcut bildirim altyapisi kullanilir.
- Degismemis kayit yeni bildirim/audit veya talep onayi dogurmaz. Hata taslagi korur; ekran kapanmasi taslagi birakir.
- Mevcut availability verilerinin yalnizca test verisi oldugu kullanici tarafindan belirtildi. Uygulamada availability'ye ait kayitlar sifirlanabilir; employee, Schedule, time-off ve shift-exchange kayitlari silinmez.
- Eski referans, onceki handoff belgeleri ve yerel test sonuclari yeni modelin uygulanmis/hosted hazir oldugunun kaniti degildir.
- Uc gorsel TBD kapandi. Yeni teknik inceleme gercek urun celiskisi cikarirsa bu belgeye acik madde eklenir; implementer sessizce yeni davranis uretmez.
