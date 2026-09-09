# Employee Invite, Onboarding ve Belge Yasam Dongusu

Tarih: 2026-09-09. Durum: kullanici kararlari birlestirildi; uygulama/test kaniti degildir.

Bu belge, bu gorusmede kabul edilen urun sozlesmesidir. Ayni kapsamdaki eski onboarding planlariyla celisirse buradaki son kararlar gecerlidir. Uygulama oncesi mevcut kirli checkout ve ilgili dosya degisiklikleri yeniden incelenmelidir. Unrelated WIP korunur.

## 1. Teslim Sirasi ve Sinirlar

1. Gercek uygulamadaki Welcome + Personal Information mockup karsilastirmasinda kullanici **01 Light & airy** yonunu secti. Beyaz icerik zemini, hafif yesil-gri sol menu, yesil vurgu, tipografi odakli Welcome ve olculu animasyonlar esas alinacak. 03 Adaptive theme secilmedi. Secim gorsel yonu kesinlestirir; mockup'in backend entegrasyonu veya uretim akisinin tamamlandigi anlamina gelmez.
2. Davet, yedi adim, Account > Profile baglantisi, ayarlar ve mevcut employee drawer incelemesi.
3. Dinamik belge/policy atamalari, sureler, bildirimler, erisim kisitlamasi ve geri donus.
4. Ayri fakat zorunlu takip teslimi: Account > Documents. O zamana kadar aktif calisan belge islemlerine gecici onboarding Documents donusu kullanir. Bu gecici cozum kalici kabul edilmeyecek; invite/onboarding bitince kullaniciya takip isi hatirlatilacak.

Payroll, SSN, vergi ve resmi ise giris islemleri kapsam disi. Availability tasarimi, motoru ve normal sureci degistirilmeyecek; yeniden onboarding'de tekrar giris kurali asagida tanimli. Ayri genel workflow motoru, kayit birlestirme, sorun bildirme, yonetici adina dosya yukleme ve toplu inceleme sayfasi eklenmeyecek.

## 2. Kimlik, Davet ve Yeniden Davet

- Davet icin employer ad, soyad, e-posta, en az bir job ve lokasyon girer. E-postasiz employee kaydi olusturulabilmesi korunur; davet icin e-posta gerekir.
- Gecerli davet onizlemesi hesabi varsa login, yoksa signup onerir; genel e-posta sorgulama endpoint'i olusturulmaz. Davet sirri loglanmaz.
- Dogru hesapla oturum kurulunca kabul otomatik yapilir, onboarding acilir. E-posta dogrulamasi gerekiyorsa davete donus korunur; dogrulanmis oturumdan once kabul yapilmaz.
- Ayni organizasyonda baska employee kaydina bagli hesaba davet engellenir; otomatik birlestirme yoktur.
- Normal yeniden gonderim yeni baglanti uretir, eskiyi gecersiz kilar. Saglayici gonderim hatasini tekrar deneme ayni hazirlanmis daveti kullanir. Sure dolumu, revoke ve resend eski tokenla kabul edilemez.
- Kabul ve onboarding baslatma tek tutarli islem sonucu verir; tekrar/cakisan istekler ikinci uyelik veya case uretmez. Tekrar istek yalniz ayni yetkili hesap icin guvenli sonuc verir.
- Aktivasyondan sonra ad/soyad hem calisan hem employer icin kilitlidir. Isim duzeltmek icin yetkili owner/admin erisimi gerekceyle revoke/unlink eder, bilgiyi duzeltir ve yeniden davet eder.
- Bu islem terminate veya archive degildir. Employee kimligi, vardiyalar ve mesai gecmisi korunur. Davet oncesinde Active listesinde erisimsiz; davetle Invited, kabulle Onboarding, gerekli onaylardan sonra Active gorunur.
- Unlink hemen organizasyon erisimini kaldirir. Gonderim basarisiz olsa da erisim geri gelmez; yeni davet gerekir. Kiosk clock-in/out devam eder. Diger organizasyonlar/global hesap etkilenmez.
- Yeni daveti hedef e-postayi dogrulayan baska bir global hesap da kabul edebilir. Eski kullanicinin o organizasyona ait ozel profil/belge erisimi kesilir. Yeni baglanan hesap eski ozel kayitlari goremez; yetkili yonetici gecmisi korunur.
- Yeniden onboarding bos baslar: profil, acil durum, belgeler ve policy kabulleri yeniden tamamlanir. Global hesap/e-posta/sifre/telefon korunur; yeni ad/soyad ve global telefon onceden gelir. Paylasim tercihi kapali baslar.
- Availability yeniden girilir; yeni duzen mevcut kurallarla yururluge girene kadar onceki planlama kayitlari korunur. Eski belge yukumlulukleri gecmise alinir, yeni sartli sureler yeni aktivasyonda baslar.
- Revoke icin e-posta yoktur. Acik oturumda erisim kaldirildi ekrani, cikis ve varsa diger organizasyonlara gecis sunulur.

## 3. Ortak Onboarding UX

- Yedi sabit adim; masaustunde onboarding'e ozel sol menu, mobilde mevcut adim/ilerleme ve acilir adim listesi.
- Olculu animasyonlar: gecis, aktif adim ve tamamlanma. Form yerlesimi sabit; reduced-motion desteklenir. Welcome tipografi odaklidir.
- Back/Continue alt islem alani sabit ve mobil klavye/icerikle cakismayacak sekildedir.
- Ilk ilerleme sirali; acilmis adimlar acik kalir. Zorunlu alan sonradan bosaltilirsa o adim eksik olur, sonraki veriler silinmez. Documents ve Policies eksikken Review'a gecilebilir; son Submit engellenir.
- Profil/acil durum eksik taslaklari otomatik kaydolur. Kayit hatasinda giris korunur, tekrar deneme sunulur; kayit olmadan Continue ilerlemez. Eski sekme yeni kaydi sessizce ezmez; revision cakismasi gorunur.
- Normal donus son kalinan adima, duzeltme istenen belge varsa ilk ilgili adima gider.
- Ilerleme calisanin tamamladigi isi sayar, yonetici incelemesini ayri gosterir. Gerekceli sartli eksik Documents icin tamamlandi + takip gerekiyor durumudur.
- Start over ve Leave onboarding kaldirilir. Hesap menusunde cikis ve organizasyon degistirme vardir. Hesap guvenligi/global iletisim islemleri pending ve belge askisinda da erisilebilirdir.

## 4. Adim Icerikleri

### 1 - Welcome

Logosuz/ozellestirmesiz de eksiksiz sablon: sirket adi, sicak karsilama, lokasyona gore gruplanmis guncel job atamalari ve hesabi kurmaya baslama mesaji. Baslangic tarihi/yonetici gibi ek bilgi bloklari eklenmez.

Logo varsa sablona eklenir. Settings'de mesaj ve yalniz Welcome'a ait gorsel degistirilebilir; ikisi ayri sifirlanir, logo korunur. Mesajda secilebilir calisan adi/sirket adi alanlari vardir. Masaustu/mobil onizleme sunulur; ozel font, renk veya layout editoru yoktur.

### 2 - Personal Information

- Sirayla ad, soyad, e-posta (read-only), telefon, adres, dogum tarihi; hepsi zorunlu. Nickname/alternatif isim yoktur.
- Bolumlu tek sayfa. ABD adresi: adres satiri, sehir, eyalet ve ZIP; daire/ikinci satir opsiyonel. Ulke input'u yok, ABD formati kullanilir; uluslararasi adres destekleniyormus gibi sunulmaz. Manuel giris, adres servisi yoktur.
- Global telefon otomatik gelir ve dogrudan duzenlenebilir. Uluslararasi numara/+1 baslangic secimi, bicim kontrolu; SMS dogrulamasi veya dogrulanmis telefon iddiasi yoktur.
- Dogum tarihi gecerli ve gelecekte olmayan tarih; yas uygunluk siniri yoktur.
- Avatar bos baslar; opsiyonel yukleme, kirpma, onizleme, degistirme/kaldirma; yoksa bas harfler. Organizasyona ozeldir.
- Tek Share my info with coworkers tercihi: telefon, e-posta ve dogum gunu/ayi. Varsayilan kapali; dogum yili, adres ve acil durum bilgileri bu paylasima dahil degildir.

### 3 - Emergency Contact

Tek kisi. Ad soyad, yakinlik ve telefon zorunlu; e-posta opsiyonel. Yakinlik listesi es/partner, ebeveyn, kardes, cocuk, arkadas, Other; Other zorunlu ozel metin acar. Uluslararasi telefon desteklenir, normalize edilmis numara calisaninkiyle ayni olamaz.

### 4 - Availability

Mevcut ekran ve domain kurallari kullanilir. Bu plan normal Availability akisina yeni zorunluluk, kontrol veya gorsel tasarim eklemez. Yeniden davette tekrar giris, mevcut kaydi yeni yururluk tarihine kadar koruyarak uygulanir.

### 5 - Documents

Tek sayfada tum talepler/durumlari; secilen talep ayni sayfada acilir. Belge basligi ana, orijinal dosya adlari ikincil etikettir. PDF/fotograf genis onizlemesi kapatilinca ayni konuma donulur.

PDF/JPG/PNG ve mobil HEIC icin uyumlu donusum desteklenir. Bir talepte coklu dosya; talepler arasi dosya yeniden kullanma araci yoktur. Admin aciklama ekler, ornek dosya eklemez. Ek alanlar (kurum, numara, verilis/bitis tarihi vb.) belge bazinda secilir; her alanin zorunlulugu ayridir.

Dosyalar/alanlar taslakta hazirlanir; Belgeyi gonder ile butun surum sunulur. Basarisiz dosya tekrar denenmeden veya kaldirilmadan gonderilemez. Suresi gecmis belge ve tespit edilmis zararli dosya gonderilemez/onaylanamaz. Basarili dosyalar hata sirasinda korunur.

Hic talep yoksa menu kalir, normal akis otomatik atlar. Yalniz opsiyonel taleplerde yuklemeden Continue olur. Sartli eksikte Henuz saglayamiyorum secimi zorunlu aciklama ve taninan sureyi acar; aciklama ayri onay istemez.

### 6 - Policies & Agreements

Metin/PDF listesi ve acilan icerik. Required/Optional; onboarding icin sartli policy modu yoktur. Kutucuk tam isim input'unu acar; buyuk/kucuk harf ve fazla bosluk esnek, harf hatasi engelleyicidir. Continue kabulleri kaydeder; taslak kaydi kabul sayilmaz.

Icerik acilmis olmali; sona kaydirma/bekleme zorunlu degildir. Optional yarim kabulde ismi duzeltme veya kutucugu kaldirma gerekir. Ilk son Submit oncesi kabul geri cekilebilir; gecmis korunur. Required kabul edilmezse Submit engellenir; ayri itiraz/reject policy sureci yoktur.

Kabuller otomatik tamamlanir, yonetici incelemesi yoktur. Kabul anindaki isim ve atanmis icerik surumu saklanir; normal isim kaydi degisimi gecmis kabul kaydini yeniden yazmaz. Yeniden davet yeni kabul ister. Metin/PDF kopyasi indirilebilir. Icerik yoksa menu korunur, otomatik gecilir.

### 7 - Review & Submit

Bolum ozetleri ve Edit; baglantili zorunlu eksik listesi ve pasif Submit. Ek beyan/kutucuk/son onay modali yoktur. Gonderim sirasinda tekrar tiklama engellenir.

Engelleyici belge incelemesi varsa pending; yoksa case'e atanmis genel final approval ayarina gore otomatik aktivasyon veya genel onay bekleme. Genel onay ancak engelleyici belgeler tamamlaninca verilebilir. Ayri profil/acil durum duzeltme istegi veya Reject onboarding yoktur; yonetici bekletebilir veya erisimi revoke edebilir.

Bekleme ayri gorunumdur; belge bazinda durum ve genel onay gosterilir, yonetici adi gosterilmez. Durum otomatik yenilenir. Kullanici profil/acil durumu taslak duzenleyebilir; eski gonderim yeni Submit'e kadar incelenebilir. Bu sirada aktivasyon olursa gonderilmemis taslak discard edilir; sonradan Profile kullanilir.

Aktivasyonda kisa basari ekrani, sartli eksiklerin kesin son tarihleri ve Open Newfork. Sonraki giris dogrudan uygulamadir. Degismeyen belge onaylari yeniden Submit'te korunur.

## 5. Account > Profile ve Veri Sahipligi

Bu teslimin parcasi: global e-posta/sifre/telefon duzenleme ve aktif organizasyonun dogum tarihi, adres, acil durum, avatar/paylasim tercihi. Aktif organizasyon adi acik gorunur; ayri organizasyon secici yerine mevcut switcher kullanilir.

Ad/soyad aktivasyondan sonra kilitlidir. Diger zorunlu alanlar bos/gecersiz kaydedilemez. Dogum tarihi/acil durum degisikligi onaysiz hemen drawer'a yansir. Drawer'a erisim yetkisi olan yoneticiler ilgili calisanin ozel bilgilerini de gorebilir; tenant/calisan kapsam kontrolu devam eder.

Global telefon onboarding veya Profile'dan degistiginde tum bagli organizasyonlarda yansir. Yeni telefon acil durum numarasiyla cakisirsa global degisiklik kabul edilir; ilgili profilde duzeltme istenir, erisim kapanmaz.

E-posta/sifre degisikligi gercek Auth akisiyla yapilir. Dogrulanana kadar eski e-posta gorunum/bildirim adresidir. Dogrulaninca guncel hesap e-postasi yansir; kabul edilmis onboarding hesap kimligiyle devam eder. Eski e-postaya henuz kabul edilmemis davetler tasinmaz; yeni davet gerekir. Sifre drawer'da gosterilmez.

Revoke edilmis organizasyonun ozel profili eski kullaniciya gosterilmez. Global guvenlik islemleri organizasyon erisim kisitlamasindan bagimsizdir. Global display-name mevcutsa kilitli employee adini dolayli degistiremez; bu kapsamda alternatif calisan ismi editoru sunulmaz.

## 6. Belge Kurallari ve Dinamik Hedefleme

- Ayri eksenler: Optional/Required/Sartli, Auto approve/Needs approval, hedef kitle, dagitim kapsami, sure/askiya alma, gecerlilik ve ek alanlar.
- Optional erisimi hicbir durumda engellemez; eksik/atlanmis optional icin gunluk hatirlatma yoktur. Required eksik ilk Submit'i engeller. Sartli gerekce ilk Submit'e izin verir.
- Optional Needs approval gonderimi de aktivasyonu engellemez. Ilk onboarding'de yuklenmis sartli Needs approval reddedilirse duzeltilene kadar pending kalir; gerekceye donerek bu inceleme asilemez.
- Filtre bos veya All: herkes eslesir. All diger hedef secimlerinin yerine gecer. Dagitim kapsami yine ayridir: gelecekteki onboarding veya mevcut aktifler dahil.
- Location/Department/Job gruplari VE, grup ici secimler VEYA. Eslesme ayni is atamasinda olmali. Isimle secimler filtreye ek kisilerdir. Coklu eslesme tek yukumluluk uretir; bir eslesme kaybolsa da digeri suruyorsa sure degismez.
- Yeni eslesenler otomatik atanir. Onboarding sirasinda hemen eklenir; pending gonderime yeni Required gelirse tekrar tamamlama/Submit gerekir. Sifir eslesmeli kural kaydedilebilir.
- Kapsamdan cikinca ilgili acik yukumluluk, inceleme ve engel kapanir; dosya/karar/kabul gecmisi korunur. Yeniden giriste uygun gecerli onayli belge yeniden kullanilir, yoksa tam sure verilir. Unlink ile farkli hesaba yeni onboarding bunun istisnasidir: ozel gecmis paylasilmaz.
- Filtre veya employee atamasi degismeden etki ozeti: dahil/cikan kisiler, yukumlulukler, sureler, kalkacak engeller. Son filtreyi temizlemek herkese genislemeyi acik gosterir; ek onay katmani yoktur.
- Owner/yetkili admin gerekceli muafiyet verebilir; otomatik atamaya karsi kalicidir, yonetici kaldirinca hala eslesiyorsa tam sure baslar. Muafiyet kaldirma/filtre islemleri diger engelleri kaldirmaz.
- Atanmis kural/icerik/genel final approval snapshot'i korunur. Yeni ayarlar varsayilan olarak yeni atamalara; mevcutlara uygulama acik yonetici islemidir. Optional'a acikca gecirilen mevcut yukumlulugun erisim engeli kalkar.
- Belge tanimi kapatilirken yalniz yeni atamalari durdurma veya acik yukumlulukleri de gerekceyle kaldirma secilir. Muafiyet/kaldirma icin ayri calisan bildirimi yok; gecmis korunur.
- Policy'lerde ayni hedefleme/dagitim vardir. Yeni surum admin tarafindan ayrica yayimlanip atanir; eski kabul yerine gecmez. Aktiflerde sure/askiya alma ayarlanabilir. Filtreden cikinca eski kabul gecmiste gorunur.

## 7. Inceleme ve Dosya Yasam Dongusu

- Mevcut employee drawer + uygulama bildirimi; ayri toplu kuyruk yok. Calisan yukler; admin adina yukleme yok.
- Dosya bazinda Keep/Discard, belge basliginda Approve/Deny. Discard notu opsiyonel, Deny gerekcesi zorunlu. En az bir Keep ve gecerli gerekli alanlar varsa belge onaylanabilir.
- Discard secimi genel karara kadar geri alinabilir; panelden ayrilmada kaydedilmedi uyarisi. Genel kararla incelenen gonderimden kaldirilir ve dosyaya erisim kalkar. Onceki surumun kullandigi dosya korunur; silme olayinin metadata gecmisi saklanir.
- Hepsi Discard: Required/Sartli yalniz Deny; Optional gonderim kaldirilip atlandi sayilir. Deny'da Keep dosyalari/alanlar duzeltme taslaginda hazir kalir.
- Yeni taslak hazirlanirken eski inceleme ve durmus sure korunur. Yeni surum gonderilince eski surum karar alamaz. Yoneticiden guncel surumu acmasi istenir; sessiz surum degisimi yoktur.
- Bekleyen gonderim, yerine yeni surum olmadan tamamen geri cekilemez. Deny ve duzeltme sonrasi gereken son Submit akisiyla tamamlanir.
- Onayli belge yenilenirken onceki onay gecerliligine kadar korunur. Yeni surum reddi tek basina gecerli eski onayi bozmaz.
- Auto approve sonrasinda da yonetici yeniden inceleyebilir. Incelemeyi acmak mevcut onayi bozmaz. Deny'da tanimli duzeltme suresi/aski kurali uygulanir; yeni gonderim yine Auto approve olabilir. Bu karara aykiri zorunlu manuel tekrar inceleme eklenmez.

## 8. Sure, Bildirim ve Erisim

- Sartli onboarding suresi varsayilan 7 gun, belge bazinda degistirilebilir; ilk baslangic hesap aktivasyonu. Aktif calisana atamada tanimli sure atamayla baslar. Kesin tarih/saat ve kalan sure gosterilir.
- Belgeyi gonder islemi sureyi durdurur; sadece dosya taslagi yuklemek durdurmaz. Aktif calisanin reddinde ret anindan tam tanimli sure yeniden baslar. Aciklama degisikligi sureyi uzatmaz.
- Sure/aski secilmemisse kendiliginden deadline/aski uydurulmaz; Required/Sartli eksik gorunur ve hatirlatilir.
- Her yukumluluk bagimsizdir. Gecikme ayari askisa organizasyonun normal uygulama erisimi kisitlanir; global hesap, diger organizasyonlar, kiosk clock-in/out etkilenmez. Vardiyalar korunur, yeni atama uyariyla mumkundur.
- Askida Documents ustunde birlesik belge/policy engel ozeti; diger adimlar salt okunur. Belge gonderilip yeniden Submit edilir, belge ayarina gore onay beklenir. Tum engeller cozulunce ek genel final approval olmadan acilir. Askida Deny yeni gecici erisim vermez.
- Policy kaynakli askida gecerli kabul yeterlidir, ayri Submit yoktur. Karma engelde belge icin gereken Submit/inceleme ayrica tamamlanir.
- Son engel muafiyet/kapsamdan cikma ile kalkarsa tekrar Submit olmadan erisim acilir. Yetkili yonetici gerekceyle yalniz askidan once sure uzatabilir.
- Archive'da aktif takip durur; donuste gerekli eksikler icin tam sure baslar. Employee istihdam durumu ile uygulama erisimi/belge askisi ayri tutulur.
- Onayli belgenin expiration sonrasi uyari/aski davranisi belge bazinda. Zamaninda gonderilmis yenileme incelenirken erisim korunur; reddedilirse mevcut expiration kuralina donulur. Eski belgeyi inceleme bitene kadar sinirsiz gecerli sayma yoktur.
- Gunluk tek ozet: organizasyon saat diliminde 09.00, calisan basina organizasyon bazinda, uygulama + e-posta. Optional atlanmislar haric. Incelemede/tamamlanmis/kaldirilmis yukumluluk eksik hatirlatmasina girmez.
- Expiration uyarilari 30/7/1 gun once. Ret/aski ve erisim degisikligi olaylari ayrica bildirilir. Belge onayi uygulama ici; aktivasyon/askinin kalkmasi e-posta da alir. Yonetici inceleme bildirimi uygulama ici.

## 9. Account > Documents Takip Teslimi

Tum atanmis/istenen belgeler, kullanici yuklemeleri, ek alanlar, expiration, yeni surum, kararlar ve onceki dosya/karar gecmisi. Ayri Policies & Agreements gorunumu: atanan/kabul bekleyen ve kabul edilmis surum, isim, tarih, indirilebilir kopya.

Bildirimler sonunda bu ekrana deep-link edecek. O zamana kadar gecici onboarding donusu hem normal aktif kullanicinin belge takibini hem kisitli erisimi destekleyecek; normal aktif kullanici uygulamaya donebilecek. Takip tesliminde ayni servis/kurallar kullanilir; ikinci bir belge motoru yapilmaz.

## 10. Teknik Uygulama Plani

1. Ilgili mevcut migration, servis, shared schema, route guard, employee tab ve profil kodunu kararlarla eslestir. Var olan WIP icin dosya/hunk sahipligi belirle. Yeni dokumanin gerektirdigi dar degisiklikleri sec.
2. Veri sozlesmelerini ayir: global Auth/account; employee ve baglanti; onboarding case ve immutable gonderim; belge/policy tanimi+surumu; hedefleme ve kaynaklar; yukumluluk/muafiyet; dosya surumu/karari; deadline; organizasyon erisim engelleri.
3. Mevcut API ailelerini genislet; endpoint isimlerini repo desenlerinden sec. Onizleme authMode, typed hata kodlari, case revision/gonderim durumu, kalem gereksinim/inceleme/sure/engel durumlari ve effect-preview tasinmali. UI metninden durum/hata cikarimi yapma.
4. Global profil guncellemeleri Auth dogrulamasiyla; org profil guncellemeleri tenant/employee kapsamiyla. Sirf drawer yetkisi genisledi diye public/coworker okuma acma. Private dosya URL'leri kisa omurlu ve erisim denetimli olsun.
5. Kabul, revoke/reinvite, Submit, review, waiver ve aktivasyonu DB transaction/revision kontrolleriyle tutarli yap. Onay verildikten sonra eski revizyonun karar almasini engelle. Tenant/user/kullanim turu cache anahtarlarini ayir.
6. Deadline'i server authoritative olarak uygula: job gecikse bile API normal erisimi deadline/engel durumundan denetlesin. Sayac UTC anlarini, UI org saat dilimini kullansin. Gonderim/expiry yarisinda server kabul ani esas olsun.
7. Bildirim/gonderim islerini mevcut outbox/idempotency yapisiyla kullan. Gunluk ozet, review karari ve erisim gecisi tekrar calismada yinelenmesin. Email hatasi basarili domain islemini geri cevirmesin; retry gorunur olsun.
8. Dosya turu/boyutu/icerigi server tarafinda denetlensin; mevcut guvenli limitler kullanilip UI'da gosterilsin. Tespit edilen zararli dosya engellensin. Tarama/donusum saglanmadiysa destek varmis gibi sunma; uygulama oncesi altyapi bagimliligini raporla. Discard fiziksel temizligi mevcut paylasilan eski surum referanslarini silmesin.
9. Secilen 01 Light & airy yonunu responsive UI ve erisilebilirlikle uygula; odak yonetimi, klavye, hata odagi, sabit yerlesim, reduced-motion. Rutin teknik ayrintilar icin yeni urun secenekleri uretme.
10. Migration/RLS, servis, web ve tarayici kanitini katman katman tamamla; Account > Documents kalici teslimini ayri takip et. Destructive data reset veya hosted deploy bu planin yazilmasiyla yetkilendirilmis sayilmaz.

## 11. E2E Kabul Matrisi

| Alan | Zorunlu senaryolar |
| --- | --- |
| Davet | Yeni/mevcut hesap; dogrulama donusu; yanlis hesap; expired/revoked/eski resend token; ayni hesaba replay; cakisan kabul; provider hata/retry; ayni org farkli employee cakismasi |
| Yeniden davet | Hemen unlink; gonderim hatasinda erisimsiz kalma; ayni/farkli hesap kabul; istihdam/mesai/kiosk korunmasi; yeni hesabin eski ozel kayda erisememesi; bos yeniden onboarding; eski Availability'nin yeni yururluge kadar korunmasi |
| Profil | Read-only isim/email onboarding; sonradan kilitli isim; global telefon/email yayilimi; email dogrulama bekleme; eski bekleyen davet; org alan izolasyonu; acil numara cakismasi; zorunlu alan silme; iki sekme revision cakismasi |
| Adimlar | Sirali ilk gecis; acilmis adim korunmasi; Documents/Policies eksigiyle Review; bos/optional adim; autosave hatasi/oturum bitisi; pending taslak sirasinda aktivasyon; kaldigi yere donus; mobile footer/klavye |
| Aktivasyon | Optional/Required/Sartli x Auto/Needs approval x final approval; ilk sartli yuklemede ret; yalniz gonderilmis case aktivasyonu; oncesinde belge onaylari; yeni Required atamasinda tekrar Submit |
| Dosya | Coklu yukleme/kismi hata; metadata zorunlulugu; HEIC/bozuk/yanlis tur; expired/zararli dosya; preview; Keep/Discard; tum dosyalar discard; gecmis referans korunmasi; yetkisiz URL erisimi |
| Inceleme | Ret gerekcesi; Keep taslagi; yeni surum/eski review yarisi; degismeyen onay korunmasi; Auto sonradan Deny ve tekrar Auto; gecerli eski belgeyle yenileme reddi |
| Hedefleme | Bos/All; VE/VEYA; ayni atama; isim OR; coklu kaynak tek yukumluluk; sifir kisi; yeni/aktif/archived donusu; filtreyi temizleme etki ozeti; kapsam disi pending inceleme kapanmasi |
| Muafiyet/snapshot | Gerekce; otomatik yeniden atanmama; kaldirinca tam sure; son engelde otomatik acilma; mevcutlara acik kural uygulama; Optional'a gecis; genel final approval snapshot |
| Sure | Aktivasyon baslangici; ayarlanmis/ayarlanmamis sure; gonderimle durma; retle tam sure; aciklamanin sureyi degistirmemesi; coklu bagimsiz engel; job gecikmesi; UTC/DST; deadline-gonderim yarisi |
| Aski | Org kapsam; mevcut/yeni vardiya ve kiosk; global account erisimi; belge tekrar Submit; policy kabul; karma engel; retle askida kalma; ek genel onay olmamasi; archive/donus |
| Policy | Kutucuk/isim eslesmesi; optional yarim kabul; eski surum; yeni yayim/kabul; ilk Submit oncesi geri cekme; isim degisimi/reinvite ayrimi; indirilebilir gecmis; hedef cikisinda gecmis |
| Bildirim | Org 09.00 tek ozet; optional/incelenen/kaldirilanlarin dislanmasi; 30/7/1 yenileme; ret/aski/onay ayrimi; retry/dedup; guncel dogrulanmis email; gecici/kalici deep-link |
| Yetki | Owner/yetkili admin review/revoke/muafiyet; calisan kendi profili; drawer kapsamli ozel gorunum; coworker yalniz secilen alanlar; revoke sonrasi eski hesap deny; baska tenant/employee deny |

Basari olcutu: kritik state gecisleri DB/API testleriyle, gorunum ve navigasyon web testleriyle, yeni/mevcut hesap ve belge zaman cizgileri gercek yerel tarayiciyla kanitlanir. Yerel, hosted ve release kaniti ayri raporlanir. Bu belge tek basina yuzde yuz calisirlik veya release hazirligi iddiasi degildir.
