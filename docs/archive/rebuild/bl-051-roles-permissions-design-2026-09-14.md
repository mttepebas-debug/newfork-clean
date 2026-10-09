# BL-051 Roles & Permissions: Urun Kararlari ve Secilen Tasarim

Tarih: 2026-09-14. Durum ve ilerlemenin tek kaynagi: [WORK](../project/WORK.md).
Bu belge uygulama implementasyonu veya hosted yetkilendirme kabul kaniti degildir.

## Amac

Son kullanici icin temiz, anlasilir ve kullanisli rol yonetimi. Teknik route/API
adlari, permission kodlari veya developer operasyon araclari ekranda gosterilmez.
Kullanici gorsel tasarim kararlarina dahildir; secilmis tasarim kendiliginden degistirilmez.

## Secilen Gorsel Referans

Kullanici uc interaktif alternatiften 1. tasarimi secti: solda rol listesi,
sagda secili rolun bilgileri ve acilir izin kategorileri. Read ve Edit checkbox'lari
tum satirlarda ayni kolonlara hizalanir. Kategori ozeti Off / Read only / Custom /
Full edit; kategori checkbox'lari toplu secim ve karisik secim durumunu gosterir.

Yerel referans:
`C:/Users/TheWe/.codex/visualizations/2026/09/09/01a08788-cdba-72f1-a2aa-9c61c296f5c4/roles-split.html`

Alternatifler `roles-drawer.html` ve `roles-select.html`; uygulama icin secilmediler.
Mockup ornek veriler kullanir; Save sadece onizleme belleklidir. Ornek kisi sayilari
gercek organizasyon verisi degildir. Mockup icindeki tum davranislar otomatik olarak
nihai urun karari sayilmaz; asagidaki kesinlesen kararlar esas alinir.

## Kesinlesen Kararlar

- Temel izinler Read ve Edit. Edit; olusturma, degistirme, silme ve arsivlemeyi
  kapsar ve Read'i de acar. Ayri silme/arsivleme checkbox'i olmayacak.
- Schedule yayinlama, employee access ve ozel kisisel bilgiler ayri alt bolumlerdir.
  Genel duzenleme izni bunlari kendiliginden acmaz.
- Owner korunan roldur. Admin/Manager/Employee kontrollu ozellestirilebilir.
- Owner yetkilendirirse Admin alt rolleri yonetebilir; kendi veya diger Admin
  rollerinin izinlerini ya da Owner'i degistiremez. Alt rol yonetimi Admin seviyesine
  yukselme yolu olamaz.
- Manager kapsami calisan kaydinda kendisine atanmis calisma lokasyonlarindan gelir.
  Ayri bir rol-bazli lokasyon listesi secilmedi. Lokasyon atamasinin erisimi de
  etkiledigi kullanici akisinda anlasilir olmali.
- Admin'in kapsami organizasyon genelidir; kapsam tek basina Read/Edit izni vermez.
- Manager varsayilan olarak kendi kapsami icinde Schedule duzenleyip yayinlayabilir.
- Manager kendi kapsamindaki employee operasyon bilgilerini Read/Edit ile yonetir;
  arsivleme Edit'e dahildir. Bir ortak lokasyon yeterlidir: ilgili Edit yetkisi varsa
  baska lokasyonlarda da calisan kisinin ortak kaydi uzerinde islem yapabilir.
  Owner/Admin korumalari ve ayri access/private/documents izinleri devam eder.
- Manager icin davet ve access kaldirma baslangicta kapali; ayri acilabilir.
- Manager icin private information ve employee documents baslangicta kapali;
  ayri ayri acilabilir.
- Manager kendi atanmis lokasyonlarinda Announcement ve Important Dates yonetebilir.
  Organizasyon geneline Announcement yayinlayamaz; hedef lokasyon siniri korunur.
- General, Locations, Jobs & Departments, Shift Catalog ve Schedule Rules ayri
  Read/Edit alt bolumleri olacak. Manager'da varsayilan kapali. Acikca yetki verilirse
  organizasyon genelini etkileyen ayarlar acilabilir; etki kapsami belirtilir.
- Belge requirements/templates ile employee documents ayri yonetilir.
  Employee documents Edit; belge degistirme/silme/onaylama/reddetme/duzeltme istemeyi
  birlikte kapsar. Ayri belge review yetkisi tasarlanmadi.
- Employee'nin kendi shift'ini birakma veya degisim isteme kosullari Schedule Rules'ta
  yonetilir; burada yonetici goruntuleme/karar verme yetkileri ele alinir.
- Custom role mevcut rolden bagimsiz kopyalanabilir veya temel kisisel hesap erisimi
  disinda yetkisiz baslayabilir. Kaynak role sonradan bagimli miras modeli secilmedi.
- Kiosk/time tracking MVP disinda. Acknowledgements'in MVP kapsami kendi incelemesinde
  netlesecek; bu tasarimla otomatik onaylanmaz veya kaldirilmaz.

## Son Kararlar ve Kabul Edilen Plan

- Mevcut organizasyonlarin hazir rolleri de yeni varsayilanlara gecirilecek. Custom
  roller yeni varsayilanlarla ezilmeyecek; role ID, uyelik ve davet baglari korunacak.
  Gecis oncesi mevcut izinlerin geri alinabilir kaydi tutulacak.
- Manager'in Line Up, Requests, Availability, Templates yonetimi ve export acik;
  organizasyon ve bildirim ayarlari baslangicta kapali.
- Employee ve Employee tabanli custom roller calisan alaniyla sinirli. Calismayacak
  yonetim secenekleri gosterilmez; ekip yonetimi icin Manager tabanli rol atanir.
- Bekleyen davet ayni role bagli kalir; kabul aninda rolun guncel izinleri gecerlidir.
  Kaydetme ozetinde etkilenen uyeler ve bekleyen davet sayisi gosterilir.
- Bagli uyeler veya davetler varsa custom role silinemez. Once baglantilar kullanici
  tarafindan cozulur; silme akisinda otomatik toplu rol tasima yapilmaz.
- Kisisel inbox/notification preferences organizasyon rol ayarlarindan bagimsiz;
  organizasyon notification settings icin Read/Edit. Bu nihai plan varsayilanidir.
- Degisiklik yokken Save pasif; Cancel geri alir; kaydetmeden rol degistirmede uyari.
  Basarisiz save kullanici secimlerini korur. Kaydetmede eski surum uzerine yazma
  engellenir ve basarili save sonrasi yetki baglami yenilenir.

## Implementasyon Sozlesmesi

1. Kategori/Read/Edit modelini mevcut izinlere esle; bagimsiz yonetilemeyen alanlarda
   gerekli izin ayrimini ekle. Var olmayan urun aksiyonlari veya genel altyapi rewrite'i yok.
2. Mevcut role create/update/delete API akislarini koru; hazir rol izinlerinin kontrollu
   guncellenmesini, guncelleme cakisma kontrolunu, editable bilgilerini ve uye/davet
   baglantilarini ekle. Gereken shared tip, API ve SQL sozlesmelerini birlikte guncelle.
3. Secimlerin ilgili menu/ekran/islem/veri erisiminde gercek karsiligi olmali; sadece
   checkbox veya menu saklamak yeterli degil. Actor, tenant ve lokasyon siniri korunur.
4. Hazir rol varsayilan gecisini ve custom role uyumlulugunu yerel ortamda dogrula.
   Hosted migration, deploy, push veya genis veri reseti bu gorevin yetkisi degildir.
5. Secilen 1. tasarimi gercek role verisine bagla; mockup ornek verilerini urune tasima.
   Diger sayfalarin tasarimini degistirme. Billing, Kiosk/time tracking ve Acknowledgements
   kararlarini bu teslimata dahil etme.

Kabul: Read/Edit bagimliligi ve toplu secim; Owner ve Admin yonetim siniri; Manager
lokasyon ve ortak employee kapsami; ozel bilgi/belge ayrimi; Employee yonetim erisim
engeli; custom role kopyalama/silme; hazir rol gecisi ve pending invite kabulunde guncel
izinler. Focused web/API/DB kontrolleri ve iki farkli rol ile kisa gercek browser akisi.
Secilen mockup ile desktop/mobile gorsel karsilastirma. Yerel kanit release kaniti degil.

## Kaynak Bulgulari

- [Mevcut rol editoru](../../apps/web/src/settings/RolesSettingsPage.tsx): dort hazir rol
  salt okunur; custom role checkbox gruplari ve sinirli prerequisite yonetimi var.
- [Sayfa erisimi](../../apps/web/src/App.tsx): bazi ayarlar workspace.manage altinda
  toplu; bazi ekranlarda permission disinda rol sinifi kosulu da var.
- [Paylasilan izin modeli](../../packages/shared/src/index.ts): katalog ve bagimliliklar
  mevcut; her yeni kullanici alt bolumunun bagimsiz bugunku karsiligi yok.
- DB/servis kaynak incelemesi ile arayuzde sunulabilir izinler arasinda farklar bulundu.
  Bu kaynak incelemesi bir hosted guvenlik testi veya exploit dogrulamasi degildir.

## Kanit ve Sonraki Dilim

Uc onizlemede focused Playwright etkilesim kontrolu: Read/Edit bagimliligi, Save/Cancel,
Owner kilidi, rol kopyalama, kaydedilmemis degisiklik uyarisi PASS. 1024/736/390/320px
yatay tasma kontrolu PASS; aydinlik/karanlik ve mobil ekran goruntuleri incelendi.
Uretim Roles sayfasi, API ve DB degistirilmedi; bu kanit onizlemelerle sinirlidir.

Kullanici 2026-09-14 nihai plani yeni bir session'a devredip implement ettirmeyi istedi.
Tek uygulama task'i ana checkout'ta calisir; yeni branch/worktree veya alt task acmaz.
Model/reasoning secimi: gpt-6-astra high; gerekce yetkilendirme/gecis diliminin cok
yuzeyli etkisi. Ana session ortak kayitlar ve teslimat sahibidir. Implementasyon task'i
bitince ana session'a explicit progress/kanit/engel raporu gonderir; final mesaj yeterli
sayilmaz. Commit/push ve hosted uygulama ana session'da ayrica ele alinir.
