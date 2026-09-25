# Employee Create Flow: UI/UX ve Implementasyon Plani

Tarih: 2026-09-07
Durum: Yerel implementasyon tamamlandi; odakli testler ve canli tarayici kontrolleri gecti. Hosted yayin dogrulanmadi.
Kapsam: New employee drawer, iki adimli olusturma, istege bagli davet ve rol secimi.
Dayanak: Bu sohbetteki audit, kullanicinin son duzeltmeleri ve mevcut kodun yeniden incelenmesi.

Uygulama sonucu: [Implementasyon ve dogrulama raporu](employee-create-flow-implementation-verification-2026-09-07.md). Asagidaki mevcut-durum karsilastirmalari implementasyon oncesi audit bazidir.

## 1. Kesin urun kararlari

- Profile adiminda first name ve last name dolunca Next etkinlesir.
- Next yalnizca Employment adimina gecirir; calisan kaydi veya davet olusturmaz.
- Normal calisanda en az bir location VE en az bir job gerekir.
- Remote VEYA Exclude from schedule secilirse location ve job zorunlulugu kalkar. Iki secenek birlikte de secilebilir.
- Remote olmak ile schedule disinda olmak farkli durumlardir; biri digerini otomatik secmez.
- Employment kosullari tamamlandiginda Save etkinlesir. Access ziyareti, PIN, evrak veya onboarding islemi yeni bir on kosul olamaz.
- E-posta istege baglidir. Gecerli e-posta, atanabilir rol ve kaydedilebilir calisan bilgileri hazirsa Invite etkinlesir.
- Invite, tek kullanici eylemiyle calisani olusturur ve davet surecini baslatir. Once Save zorunlulugu yoktur.
- Rol secimi Employee, Manager, Admin ve workspace'te tanimli custom rolleri kapsar; gorunen secenekler mevcut yetki politikasiyla sinirlanir. Owner davetle atanamaz.
- Drawer'a scope ayari eklenmez. Rolun mevcut yetkileri sunucu tarafinda uygulanir.

E-posta tek basina eksik isim veya Employment kosullarini atlatmaz. Kullanici ilk adimda e-posta girdiginde rol alani ve Invite gorunur; eksikler tamamlaninca Invite etkinlesir. Bu, bos calisan olusturmadan ilk istekteki hizli davet davranisini saglar.

## 2. Mevcut durum ve uygulanacak fark

| Mevcut durum | Uygulama karari |
|---|---|
| Create, edit ile ayni alti bolumlu navigasyonu kullaniyor. | Create icin Profile / Employment; kayittan sonra tam edit navigasyonu. |
| Herhangi bir draft degisikligi Save'i etkinlestiriyor. | Next, Save ve Invite icin farkli ve acik hazirlik kosullari. |
| Submit daima tum employee semasini dogrulayip kaydediyor. | Profile submit -> Next; Employment submit -> Save. |
| Create modunda footer Invite gizli. | E-posta girildiginde davet eylemi ve role bagli hazirlik durumu. |
| Rol secimi mevcut calisana davet istegine gidiyor. | Create + invite komutuna secilen role ID dahil edilir. |
| Shared employee semasi Remote/Exclude icin atamalari zaten opsiyonel yapiyor. | Bu dogru kural korunur; UI ayni kurala baglanir. |
| Davet RPC'si sifir lokasyonda hata veriyor. | Remote/Exclude icin konum gereksinimi, davet ve kabul akisinda da kaldirilir. |
| Scroll sonunda wheel hareketi baska sekmeye geciriyor. | Create akisinda wheel yalnizca kaydirir. |
| Backdrop ve Cancel dogrudan kapatiyor. | Degismis create taslagi icin ortak cikis korumasi. |

Referans uygulamadan alinacaklar: belirgin Next, sabit footer, e-posta ile acilan rol secimi, tek eylemli davet, taslagin adimlar arasinda korunmasi.
Referansin location + job ve Access/PIN gecis zorunluluklari bu plana tasinmaz; kullanicinin guncel kurallari esastir.

## 3. Ekran ve navigasyon sozlesmesi

### Profile

1. Baslik: New employee; mevcut drawer kabugu icinde Profile adimi.
2. First name ve Last name: masaustunde yan yana, dar ekranda alt alta. Ilk odak First name.
3. Invitation email: istege bagli; isimlerden sonra, tam genislikte.
4. Role: e-posta bos degilken e-postanin hemen altinda. Yukleme tamamlaninca varsayilan Employee; kullanicinin secimi refetch ile degistirilmez.
5. Footer: Cancel solda; kosullu Invite ve birincil Next sagda.

Ad/soyad bosluklardan arindirilmis olarak degerlendirilir. Kullanici yazarken her tus vurusunda kirmizi hata gosterilmez. Alan terk edildiginde veya eylem denendiginde alan seviyesinde hata belirir.

Next, e-posta gecersiz olsa bile ad ve soyad hazirsa calisir. Native `type=email` form dogrulamasi Next'i fark edilmeden engellememelidir: adima ozel dogrulama ve kontrollu submit kullanilir. Gecersiz, bos olmayan e-posta Save/Invite sirasinda ilgili alana yonlendiren hata verir; sessizce silinmez veya kaydedilmez.

### Employment

Icerik sirasi:

1. Work mode: Remote ve Exclude from schedule icin iki bagimsiz checkbox.
2. Locations: coklu secim; normal modda required, alternatif modda optional.
3. Jobs: ayni davranis.
4. Start date ve Internal note: opsiyonel detaylar. Bu kapsamda otomatik tarih veya yeni zorunluluk eklenmez.
5. E-posta varsa kompakt davet ozeti: hedef adres, secilen rol ve Profile'a donen duzenleme eylemi. Ayni alanlarin ikinci bir bagimsiz kopyasi olusturulmaz.

Remote/Exclude acildiginda mevcut location/job secimleri korunur. Kapatildiginda normal zorunluluk geri gelir; eksikse Save/Invite aninda pasif olur. Secimler gizlenmez; kullanici istege bagli atama yapabilir.

Footer: solda Back; sagda kosullu Invite ve birincil Save. Kapatma icin basliktaki X her zaman vardir. Save'in konumu e-posta veya hata geldikce degismez.

Ilk secilen atama mevcut picker davranisiyla primary olur. Primary kaldirilinca kalan secimler icinden tutarli bir primary secilir; secim kalmazsa primary null olur. Bos veya artik secili olmayan primary ID gonderilmez.

### Adim gecisleri

- Desktop rail iki adimi gosterir. Employment, isimler gecerliyse tiklanabilir; Profile'a donus her zaman mumkundur.
- Mobilde ayni iki adim baslik altinda kompakt sekme satiri olarak gorunur; create icin alti secenekli dropdown kullanilmaz.
- Next veya adim dugmesiyle geciste odak yeni bolumun basligina tasinir. Geri donuste degerler korunur.
- Create URL'sindeki access/documents/history gibi bolumler Profile'a normalize edilir; URL degisikligi validation atlatamaz.
- Employment'dan Profile'a donuldugunde Next gorunur. Atamalar zaten hazirsa Profile'daki Invite de kullanilabilir.
- Kayit sonrasi mevcut edit drawer acilir, employee ID URL'ye yazilir ve liste/cache yenilenir. Tek bir yeni calisan satiri gorunur.

## 4. Eylem ve dogrulama matrisi

```text
namesReady       = trim(firstName) != "" && trim(lastName) != ""
assignmentReady  = isRemote || isExcluded || (locationCount > 0 && jobCount > 0)
emailPresent     = trim(email) != ""
emailReady       = normalized email passes the shared invitation contract
employeeReady    = namesReady && assignmentReady && full employee schema valid
nextEnabled      = namesReady && !submitting
saveEnabled      = employeeReady && !submitting && canCreateEmployee
inviteVisible    = emailPresent && canManageEmployeeAccess
inviteEnabled    = employeeReady && emailReady && roleReady && !submitting
                   && canCreateEmployee && canManageEmployeeAccess
```

Next'in gorunur olmasi ve Save'in gorunur olmasi aktif adima baglidir. Create Save hazirligi `dirty` ile olculmez. Edit'in dirty/revision sozlesmesi korunur.

| Isimler | Location | Job | Remote / Exclude | Email | Employment Save | Invite |
|---|---|---|---|---|---|---|
| Eksik | Herhangi | Herhangi | Herhangi | Herhangi | Pasif | Pasif/gizli |
| Tam | Yok | Yok | Kapali | Bos | Pasif | Gizli |
| Tam | Var | Yok | Kapali | Gecerli | Pasif | Pasif |
| Tam | Yok | Var | Kapali | Gecerli | Pasif | Pasif |
| Tam | Var | Var | Kapali | Bos | Aktif | Gizli |
| Tam | Yok | Yok | Remote | Bos | Aktif | Gizli |
| Tam | Yok | Yok | Exclude | Gecerli | Aktif | Rol hazirsa aktif |
| Tam | Yok | Yok | Ikisi de | Gecerli | Aktif | Rol hazirsa aktif |
| Tam | Var | Var | Herhangi | Gecersiz | Pasif | Pasif |
| Tam | Var | Var | Herhangi | Gecerli | Aktif | Rol hazirsa aktif |

Tum aktif durumlar aktor yetkisini ve devam eden islem olmamasini varsayar. Rol listesinin yuklenememesi Save'i engellemez; Invite icin tekrar deneme sunulur. Bos role ID gecerli varsayilan gibi gonderilmez.

## 5. UI tasarim sozlesmesi

Mevcut 880px sag drawer ve uygulamanin Button, Field, AssignmentPicker, Lucide ve tema altyapisi kullanilir. Yeni tasarim kutuphanesi veya dekoratif kart sistemi gerekmez.

| Alan | Tasarim karari |
|---|---|
| Kabuk | Genislik min(100%, 880px); 100dvh; sabit header/footer, sadece govde kayar. |
| Rail | Mevcut 236px desktop rail; create kimlik blogu daha kompakt, bos kod/durum alanlariyla yer harcamaz. |
| Dar ekran | Mevcut responsive esikle tek sutun; 320px dahil yatay sayfa kaymasi yok. |
| Bosluk | Icerik 24px desktop, 16px mobil; alanlar 16px, bolumler 24px, ikon/metin 8px. |
| Tipografi | Uygulamanin fontu; baslik 20px/600, alan/metin 14px, ikincil metin 12px. Mobil input 16px. Letter spacing 0. |
| Kontroller | Desktop en az 40px, dokunmatik hedefler en az 44px; radius mevcut 5-6px, en fazla 8px. |
| Renk | Mevcut acik/koyu tema tokenlari; notr zemin, birincil eylem/aktif adim icin mevcut yesil vurgu, hata icin semantik kirmizi. |
| Hiyerarsi | Save/Next birincil dolu buton; Invite ikincil, MailPlus ikonlu; Back ArrowLeft, Next ArrowRight, X icin tooltip ve accessible name. |
| Footer | Buton genislikleri yukleme sirasinda sabit; 320px'te Back ayri satira gecebilir, Invite ve Save ortak grid satirinda kalir. Safe-area padding vardir. |
| Secim listeleri | Checkbox satirlari, secim sayisi, mevcut primary kontrolu. 8'den fazla kayitta arama; sonuc yok ve veri yok farkli durumlardir. |
| Uzun metin | Rol, job ve location isimleri satira kirilir. Sabit yukseklik icerigi kesmez; buton etiketleri tasmaz. |
| Hareket | Mevcut drawer animasyonu; reduced-motion'da hareket kaldirilir. Rol alani acilinca odak calinmaz. |

Birincil deneyim formun kendisidir. Buyuk tanitim basligi, ozellik aciklamalari, ic ice kartlar ve gereksiz rehber metinler eklenmez. Required/optional etiketleri ve somut alan hatalari yeterlidir.

### Durumlar ve kisa metinler

| Durum | Metin / davranis |
|---|---|
| Bos isim | First name is required. / Last name is required. |
| Normal modda eksik atama | Select at least one location. / Select at least one job. |
| Gecersiz email | Enter a valid email address. |
| Liste yukleniyor | Sabit boyutlu yukleme durumu; sadece bagimli kontroller kilitli. |
| Liste yuklenemedi | Couldn't load locations/jobs/roles. + Retry |
| Katalog bos | No locations yet. / No jobs yet.; yetkili kullanici icin mevcut ayarlar akisi taslagi koruyarak acilir. |
| Rol yok | No assignable roles available.; Save kullanilabilir. |
| Save calisiyor | Saving...; tum mutasyon eylemleri kilitli. |
| Invite calisiyor | Inviting...; tum mutasyon eylemleri kilitli. |
| Save tamamlandi | Employee saved. |
| Davet kuyruga alindi | Invitation queued.; yalnizca sunucu teslim durumuna gore Invitation sent. |
| Teslim hatasi | Employee saved. Invitation couldn't be sent. + Retry invitation |
| Taslaktan cikis | Discard new employee? / Keep editing / Discard |

Disabled butonun nedeni yalniz tooltip'e baglanmaz; eksik alanin durumu gorunur ve ekran okuyucuya baglidir. Hata halinde ilgili adim acilir, ilk hatali alana odaklanilir. Genel sunucu hatasi formu silmez.

## 6. Rol ve davet sozlesmesi

Rol dropdown'i mevcut workspace rollerini kullanir; Custom adinda sahte tek secenek uretilmez, tanimli custom roller kendi adlariyla listelenir. Siralama Employee, Manager, Admin, custom roller; aktorun atayamadigi roller cikarilir. UI ve API ayni atama kurallarini uygular.

- Varsayilan Employee yalnizca rol ilk kez hazirlandiginda atanir.
- Sekme gecisi, window focus ve query refetch secilen rolu sifirlamaz.
- Secilen rol silinir veya atanamaz hale gelirse sessizce baska role gecilmez; Invite pasif olur, yeniden secim istenir.
- E-posta bosaltilinca rol UI gizlenir; ayni taslakta tekrar yazilinca onceki secim korunur.
- Save yalnizca calisani kaydeder; email yazilmis olmasi davet gondermez. Ayni drawer oturumunda secilen rol korunur. Kalici, kullanilmamis invite-role draft'i icin yeni DB alani eklenmez.
- Invite secilen role ID'yi gonderir; sunucu aktorun yetkisini ve rolun ayni workspace'e ait oldugunu yeniden dogrular.
- Mevcut onboarding ve pending activation davranisi korunur; davet gonderilmesi hesabi kendiliginden aktive etmez.

### Scope UI olmadan backend uyumu

Mevcut DB'de rolun yaninda `all_locations` ve membership location scopes alanlari da bulunuyor. Bu nedenle sadece UI kontrolunu kaldirmak veya bos lokasyonu otomatik tum lokasyon erisimine cevirmek yeterli degildir.

Ilk teknik adimda invitation prepare, accept, membership role update ve ilgili permission helper'lar ayni rol politikasi uzerinden eslestirilir. Mevcut role-update sozlesmesindeki access-class davranisi baslangic kanitidir; custom roller adindan degil gercek access class/permission tanimindan cozulur.

Hedef: normal ve lokasyonsuz Remote/Exclude calisan daveti kabul edilebilir; rolun tanimlamadigi baska calisan/lokasyon verisine erisim kazanilmaz. Manager/custom rollerin mevcut erisim davranisi davet ile rol degistirme arasinda tutarli olmalidir. Bos lokasyonun onboarding aktivasyonunda yeniden zorunlu hale gelmesi de engellenmelidir. Bu ic esleme testle tamamlanmadan frontend-only Invite tamamlanmis sayilmaz.

## 7. Teknik implementasyon paketleri

### Paket 1: Ortak kurallar ve davranis testleri

- `packages/shared/src/index.ts`: mevcut assignment optional kuralini koru; isim/email normalizasyonu ve create+invite giris/cikis sozlesmesini tanimla.
- `apps/web/src/employees/employee-create-flow.ts` (onerilen): saf hazirlik ve adim kararlari; buyuk bir workflow framework'u ekleme.
- UI, API ve SQL icin ayni karar tablosundan anlamli test ornekleri yaz.
- Hazirlik hesaplarini birbirinden bagimsiz birden cok component icine kopyalama.

Cikis: names-only Next, normal assignment, Remote/Exclude ve email/role kombinasyonlari icin tek, acik davranis sozlesmesi.

### Paket 2: Create + invite sunucu islemi

- `apps/api/src/employees/employee-directory-routes.ts`, `employee-directory-service.ts`, `invitation-service.ts` ve mevcut invitation route wiring'ini kullan.
- Tek create komutu icin email/role iceren istege bagli invitation intent ve request ID tasarla; Save ayni create sozlesmesini intent olmadan kullanabilsin.
- Employee, assignment'lar, invitation kaydi ve mevcut teslim isinin olusmasi tek DB transaction sinirinda olsun. Tarayicidan birbirini izleyen create/invite cagrilariyla yarim kayit yonetimi yapma.
- Email teslimini transaction icinde harici servise baglama; mevcut delivery-state/outbox desenini inceleyip yeniden kullan.
- Sonuc employee ID, invitation ID ve delivery durumunu dondursun. Frontend bunlari ayri yorumlasin.
- Cift tik, timeout ve network retry ayni request ID ile ayni sonucu bulsun; ikinci calisan veya davet uretmesin. Ayni key ile farkli payload reddedilsin.
- Delivery retry mevcut employee/invitation uzerinden calissin. Belirsiz timeout'ta once komut sonucu cozulmeden yeni create baslatilmasin.
- Remote/Exclude daveti, kabul ve onboarding icin lokasyonsuz yolun tum zorunluluklarini kontrol et.
- Yeni migration gerekli; eski migration dosyalari degistirilmez. Dosya implementasyonda repo/CLI convention'iyla uretilir.

Cikis: kayit/davet atomikligi, teslim hatasindan kurtarma, secilen rolun kabul sonrasinda korunmasi ve yetki testleri.

### Paket 3: Iki adimli drawer ve rol UI

- `EmployeeDrawer.tsx`: create'e ozel gorunen bolumler, Next submit, Employment Save, ortak busy durumu ve alan hatalari.
- `EmployeesPage.tsx`: create bolum normalizasyonu, kayit sonrasi ID/bolum gecisi ve duplicate liste satiri kontrolu.
- `employee-data.ts`: yeni komut, typed sonuc ve tekrar deneme davranisi.
- Tek state sahibinde employee draft, invitation role ve command state tut. Mevcut subject-aware hydration/refetch korumasini devam ettir.
- Work mode kontrollerini atamalardan once yerlestir; optional/required gostergelerini anlik guncelle.
- Create icin wheel ile sekme gecisini kapat. Step nav ve footer ayni gecis fonksiyonunu kullansin.
- Kayit sonrasi draft reset ancak dogrulanmis server sonucu geldiginde yapilsin.

Cikis: iki adimda tamamlanabilen Save ve tek eylemli Invite; mevcut employee edit senaryolari calisiyor.

### Paket 4: Responsive ve erisilebilirlik

- `apps/web/src/styles.css`: yalniz create drawer'a ait stiller ve gerekli ortak duzeltmeler; light/dark temayla uyum.
- Focus trap, Escape, X, Cancel, backdrop ve sayfa ici rota cikisi ayni dirty-draft korumasina baglansin. Native refresh icin gereken beforeunload korumasi degerlendirilsin.
- Islem sirasinda cikis/double-submit engellensin; hata bitince kontrol geri verilsin.
- Screen reader icin step state, aria-invalid, aria-describedby, loading/status ve focus restoration tanimlansin.
- Enter Profile'da Next, Employment'da Save; Invite yalnizca kendi dugmesinden tetiklenir. Textarea Enter kaydetmez; picker klavye islemleri formu yanlislikla submit etmez.
- 320px, 390px, 768px ve 1440px; 200% zoom, uzun ad/rol, acik mobil klavye, light/dark ve reduced motion incelensin.

Cikis: header/footer erisilebilir, icerik kesilmiyor, kontrol/etiketler carpisma yapmiyor, klavye ile akis tamamlanabiliyor.

### Paket 5: Entegrasyon ve kabul

Paket 1 -> Paket 2 ve 3 -> Paket 4 -> Paket 5 sirasi izlenir. UI gelistirmesi typed mock sozlesmesiyle Paket 2 ile paralel ilerleyebilir; tamamlanma icin gercek API/DB baglantisi gerekir.

- Focused component, API ve DB testleri; ardindan etkilenen paketlerin typecheck/lint/build kontrolleri.
- Yerel gercek owner oturumu ile Save ve test teslim kanaliyla Invite; admin/manager ve uygun custom rol senaryolari.
- Gercek dis aliciya test daveti gonderilmez; test inbox/delivery adapter kullanilir.
- Desktop/mobil ekran goruntuleri, keyboard akis kaydi ve hatali teslimden recovery kaniti.
- Referans create testleri sadece davranis rehberidir; yeni testler bu belgedeki guncel kurallari hedefler.

## 8. Kabul senaryolari

| ID | Senaryo | Beklenen sonuc |
|---|---|---|
| A01 | Bos drawer, yalniz first name, whitespace last name | Next pasif; create istegi yok. |
| A02 | First + last name | Next aninda aktif. |
| A03 | Profile'da Enter/Next | Employment acilir; kayit olusmaz. |
| A04 | Gecersiz email + gecerli isimler | Next calisir; Save/Invite ilgili email hatasiyla bloke. |
| A05 | Yalniz location veya yalniz job | Normal modda Save/Invite pasif. |
| A06 | Bir location + bir job, email bos | Save aktif; bir calisan, sifir davet. |
| A07 | Remote, location/job bos | Save aktif; atamasiz kayit basarili. |
| A08 | Exclude, location/job bos | Save aktif; atamasiz kayit basarili. |
| A09 | Remote + Exclude birlikte | Kayit gecerli; iki flag korunur. |
| A10 | Atamalar varken Remote ac/kapat | Secimler korunur; zorunluluk anlik guncellenir. |
| A11 | Atamasizken son alternatif flag'i kapat | Save/Invite pasif; veri kaybi yok. |
| A12 | Gecerli email ekle/sil | Rol/Invite gorunurlugu guncellenir; kalan draft korunur. |
| A13 | Employee/Manager/Admin/custom rol sec | Atanabilir rollerle invite; kabulde ayni role ID. |
| A14 | Yetkisiz Admin/Owner, baska workspace rol/atama payload'i | Sunucuda reddedilir; employee/invite artigi kalmaz. |
| A15 | Remote/Exclude + sifir atama + gecerli email | Invite, kabul ve izin verilen onboarding akisi basarili. |
| A16 | Lokasyonsuz Manager/custom daveti | Rol politikasi uygulanir; eksik lokasyon genis veri erisimi vermez. |
| A17 | Back/Next, focus/refetch, ayni draft'a donus | Isim, atama, email ve rol degismez. |
| A18 | Baska calisan/workspace veya yeni create oturumu | Onceki taslak sizmaz. |
| A19 | Scroll sonunda wheel | Adim degismez. |
| A20 | Role loading/error/silinmis secim | Invite bloke ve kurtarilabilir; gecerli Save calisir. |
| A21 | Katalog bos/error, aramada sonuc yok | Ayri durumlar; Retry/veri akisi calisir; Remote/Exclude secilebilir. |
| A22 | Cift tik veya timeout sonrasi ayni request retry | Bir employee ve bir invitation; durum geri kazanilir. |
| A23 | Invitation prepare transaction hatasi | Yeni employee/assignment/invite kalintisi yok. |
| A24 | Email teslim hatasi | Kayit korunur; Retry invitation yeni employee olusturmaz. |
| A25 | Save, email ve secilmis rol ile | Otomatik davet yok; ayni oturumda rol secimi korunur. |
| A26 | Dirty taslakta X/Cancel/Escape/backdrop/rota cikisi | Keep editing korur; Discard acikca vazgecirir. |
| A27 | 320/390px, uzun alanlar, zoom/klavye | Yatay tasma, kayip footer veya cakisan etiket yok. |
| A28 | Tab/Shift+Tab, Enter, screen reader | Odak dialog icinde; dogru adim/eylem; kapanista tetikleyiciye donus. |
| A29 | Edit, linked account, archive/restore, existing invite | Mevcut davranis ve yetki testleri bozulmaz. |
| A30 | Save/Invite sonrasi liste ve URL | Dogru employee ID; tek satir; gercek delivery durumu. |

## 9. Kanit siniri ve teslim kosulu

Bu plan icin mevcut drawer, CSS, paylasilan sema ve invitation migration/servis baglantilari yeniden okundu. Branch `codex/phase-1-foundation`, HEAD `415b15f`; calisma agacinda genis mevcut degisiklikler var. 5555/5556 portlarinda yerel servisler mevcut; bu plan sirasinda degistirilmedi.

Onceki audit'te current drawer 12, reference create 47 ve ilgili API 10 testinin gectigi raporlandi. Bu sayilar onceki audit kanitidir; bu plan turunda test veya canli browser UAT yeniden calistirilmadi.

Implementasyonun tamamlanmasi icin A01-A30 davranislari, focused testler ve gercek yerel entegrasyonla desktop/mobil UI kaniti gerekir. Yalniz butonlari acmak, mock testlerini gecirmek veya API health sonucu yeterli degildir. Hosted/release dogrulamasi ayri kanittir.

Planin tasarim kontrolu: copy, layout, color/theme, typography, spacing ve component kaynagi tanimlandi. Gorsel uygulama ve bagimsiz UI onayi henuz yapilmadi. GSD UI sozlesmesi basliklari bu belgeye uyarlandi; bagimsiz bir GSD phase veya otomatik checker calistirildigi iddia edilmez.
