# BL-064 Schedule Drag/Drop ve Conflict Yonetimi Plani

Tarih: 2026-09-15

Durum: A-E yerel kabul tamamlandi; [kanit ve kapsam siniri](bl-064-slice-a-evidence-2026-09-15.md). F/Documents ve BL-067 ayri kalir. Checkpoint durumu WORK ve Git kaydindadir.

Iliskili isler: BL-049 Schedule Rules, BL-052 Documents, BL-067 Schedule hours guardrails.

Model onerisi: `gpt-6-astra`, `high`. Schedule istemcisi, API/RPC, ayar semasi, belge yasam dongusu ve publish dogrulamasi ayni davranis sozlesmesine baglanacagi icin yuksek muhakeme gerekir. Uygulama yine dar ve sirali dilimlerle yapilir.

## 0. Uygulama Yontemi: Gap-first, Reuse-first

Bu belge sifirdan yeniden yazma talimati degildir. Mevcut repo, bu planin her maddesi icin once davranis ve kod eslesmesine tabi tutulur.

Her dilimde su sira izlenir:

1. Mevcut component, hook, state, API/RPC, DB kurali, permission ve test kaniti bulunur.
2. Mevcut davranis bu plandaki gozlenebilir sonuc ile karsilastirilir.
3. Birebir ortusen kod korunur; sirf eski veya farkli isimlendirilmis oldugu icin sokulmez.
4. Kismen ortusen davranis en kucuk tutarli degisiklikle gelistirilir veya sikilastirilir.
5. Yalniz yanlis, guvensiz, duplicate veya yeni sozlesmeyle gercekten uyumsuz yol kaldirilir.
6. Mevcut test dogru davranisi zaten kanitliyorsa ayni test yeniden yazilmaz; eksik risk icin hedefli test eklenir.

Ozellikle mevcut copy/paste, multi-select, delete/undo, drag modifier, conflict assessment, confirmation ve publish kodlari once korunacak adaylardir. Bu bolumlerde hedef `replace` degil `audit -> compare -> retain/harden/fix` akisi olmalidir.

Mevcut mimari bu plani guvenli ve sade bicimde tasiyabiliyorsa yeni paralel state yonetimi, ikinci conflict motoru, duplicate clipboard katmani veya yeni framework kurulmaz. Ortak sozlesme gerekiyorsa mevcut kanonik seam genisletilir.

## 1. Hedef

Schedule grid shift birakildigi anda tepki vermeli; normal hareketler her defasinda gorunur bir server assessment beklememelidir. Conflict guvenligi server tarafinda korunur. Kullanici teknik `soft/hard conflict` diliyle veya gereksiz override formlariyla mesgul edilmez.

Basari sonucu:

- Normal drag/drop aninda gorunur.
- Gereksiz `Checking shift change...` balonu yoktur.
- Bilinen uygunluk drag hedefinde hizli ve sade renkle anlatilir.
- Server reddederse optimistic degisiklik guvenli bicimde geri alinir.
- Edit, paste ve publish ayni conflict katalogunu ve severity sonucunu kullanir.
- Conflict ayarlari tek, anlasilir Schedule Rules bolumunden yonetilir.

## 2. Performans ve Kayit Akisi

1. Shift hedef hucreye istemcide optimistic olarak tasinir veya kopyalanir.
2. Normal hareket once hizli save yolunu kullanir.
3. Server kaydi otoriter olarak yeniden dogrular.
4. Save basarisizsa shift eski durumuna geri doner ve kisa hata toast'u gosterilir.
5. Server confirmation isterse kompakt review penceresi acilir. `Place shift` kaydi tamamlar; `Cancel` eski durumu geri getirir.
6. Hard block sonucunda kayit yapilmaz ve optimistic degisiklik geri alinir.

Gosterge esikleri:

- `0-600 ms`: gosterge yok.
- `600 ms` sonrasi: yalniz tasinan shift uzerinde kucuk `Saving` durumu.
- `5 saniye` sonrasi: belirgin gecikme/hata durumu ve uygulanabilir geri bildirim.

Bu degerler UI geri bildirim esikleridir; server timeout veya basari SLA'i degildir.

## 3. Drag Hedef Durumlari

- Yesil: eldeki/cached veriye gore tum bilinen kurallara uygun.
- Turuncu: warning veya confirmation gerekiyor.
- Kirmizi: islem bloklaniyor.
- Degerlendirme icin gerekli veri bilinmiyorsa hedef yanlislikla yesil gosterilmez.
- Ikon eklenmez. Mevcut highlight yapisi korunur ve grid kalabaliklastirilmaz.
- Hizli hedef rengi istemcide mevcut read modelden hesaplanabilir; drop sonrasi server sonucu daima belirleyicidir.

## 4. Conflict Severity Sozlesmesi

Kullaniciya gosterilen seviyeler:

1. `Warn`: islem gerceklesir; edit sirasinda kisa toast gosterilir.
2. `Require confirmation`: schedule'i duzenleyen manager/admin icin hizli `Place shift / Cancel` penceresi acilir.
3. `Block`: islem yapilmaz.

Confirmation employee'den alinmaz. Typed reason veya minimum karakter zorunlulugu yoktur. Sistem actor, kural, sonuc, zaman ve hedef shift bilgisini otomatik audit kaydina yazar.

Birden fazla conflict varsa en yuksek severity sonucu belirler. Tek bir kompakt pencerede veya toast'ta birlesik ozet gosterilir.

## 5. Degistirilemeyen Sistem Bloklari

Asagidaki durumlar ayarlardan yumusatilamaz:

- Gercek zaman overlap'i: ayni employee'ye saatleri kesisen iki shift.
- Terminated, archived veya schedule disinda birakilmis employee.
- Employee icin gerekli location/job assignment eksikligi.
- Shift type eligibility ihlali.
- Silinmis veya stale employee, job, location ya da shift type.
- Gecersiz veya esit baslangic/bitis saati.
- Yetki veya veri butunlugu ihlali.

Ayni shift type tek basina conflict degildir. Efektif saatler kesisiyorsa Block; kesismiyorsa isleme izin verilir. Shift type default saati ve shift'in explicit saati yoksa zaman sonucu cozulmedigi icin Require confirmation uygulanir.

## 6. Ayarlanabilir Is Kurallari

Tek yonetim yuzeyi: `Settings > Schedule Rules > Conflict handling`.

| Kural | Varsayilan | Secenekler |
|---|---|---|
| Employee availability | Require confirmation | Allow, Warn, Require confirmation, Block |
| Approved time off | Block | Require confirmation, Block |
| Closed location/service | Require confirmation | Warn, Require confirmation, Block |
| Minimum travel | Require confirmation | Warn, Require confirmation, Block |
| Minimum rest | Require confirmation | Warn, Require confirmation, Block |
| Document compliance | Asagidaki belge sozlesmesi | Durumun izin verdigi alt/ust sinirlar |

Kurallar workspace genelindedir. Bu fazda location, job veya employee bazli policy override'i eklenmez.

## 7. Yetki Siniri

Roles & Permissions sayfasindaki Schedule accordion'una tek yeni izin eklenir:

- `Manage conflict rules`

Bu izin yalniz conflict ayarlarini gorup degistirmeyi kontrol eder. Schedule duzenleme yetkisi olan kisilerin operasyonel confirmation islemleri icin ayri conflict veya override permission'lari eklenmez.

Kanonik permission key implementasyon oncesi mevcut katalog adlandirmasiyla eslestirilir. Shared schema, API guard ve DB/RPC ayni key'i kullanir.

## 8. Edit ve Publish Geri Bildirimi

- Warn edit sirasinda islemi engellemez; kisa toast gosterir.
- Require confirmation edit sirasinda hizli review penceresi acar.
- Publish oncesi server guncel durumu yeniden dogrular.
- Publish recap tum mevcut warning'leri ve daha once confirmation verilmis istisnalari bir arada gosterir.
- Yeni hard blocker publish'i engeller.
- Recap ek checkbox, typed reason veya uzun form istemez.
- Conflict kalmadiysa normal Publish akisi devam eder.

## 9. Selection, Copy ve Paste

Multi-select korunur:

- `Ctrl+click` veya `Shift+click`: shift secimini toggle eder.
- `Delete`: secili shift'leri tek islem olarak siler.
- `Ctrl+Z`: toplu silmeyi tek islem olarak geri alir.

Clipboard yalniz tek shift tasir:

- Multi-copy/paste yoktur.
- Birden fazla shift seciliyken `Ctrl+C` kopyalama yapmaz; kisa `Select one shift to copy` toast'u gosterir.
- Normal drag shift'i tasir.
- Drag sirasinda `Ctrl` veya `Shift` basiliysa yalniz aktif suruklenen shift kopyalanir.
- Yalniz suruklenen badge `+ Paste` ibaresi gosterir. Modifier birakilirsa ibare aninda kaybolur ve hareket tekrar move olur.
- Drop anindaki modifier durumu copy/move kararini verir.

Paste Mode:

- `Ctrl+V` tek-shift Paste Mode'u acar veya kapatir.
- Schedule cell'e tiklamak clipboard shift'ini hedefe yapistirir.
- Basarili paste sonrasi mod tekrarlanan paste icin acik kalir.
- `Ctrl+V` tekrar veya schedule cell'leri disindaki bos alana tiklama modu kapatir.
- Her paste ayni conflict degerlendirmesi, confirmation ve block sozlesmesinden gecer.

## 10. Belge Conflict Sozlesmesi

Belgenin Optional/Required/Conditional ve hedefleme ayarlari belge yonetiminden gelir. Conflict siddeti tek Schedule Rules ekranindan yonetilir.

### Optional

- Hicbir durumda Schedule conflict'i uretmez.

### Required

- `missing`, `rejected`, `pending review` ve `expired` conflict tetikler.
- Varsayilan `Require confirmation`.
- Schedule Rules'tan Warn, Require confirmation veya Block secilebilir.

### Conditional - grace aktif

- Minimum ve varsayilan severity `Warn`.
- Require confirmation veya Block'a yukseltilir.
- Conflict tamamen kapatilamaz.

### Conditional - grace bitmis

- Required belge gibi davranir.
- Minimum ve varsayilan severity `Require confirmation`.
- Block'a yukseltilir; Warn'a indirilemez.

Severity monotonik olmalidir. Grace asamasi Block ise grace sonrasi da Block kalir; sonraki asama oncekinden daha yumusak olamaz.

Ek kurallar:

- Durum bugunun tarihine degil hedef shift'in tarih/saatine gore hesaplanir.
- Zamaninda `Submit` edilen belge inceleme sirasinda grace sayacini durdurur; yalniz dosya taslagi yuklemek durdurmaz.
- Muafiyet verilen yukumluluk conflict uretmez.
- `Henuz saglayamiyorum` muafiyet degildir; grace suresini baslatir.
- Birden fazla problemli belge en yuksek severity ile birlesir.
- Draft ile publish arasinda grace durumu degisebilecegi icin publish tekrar server revalidation yapar.

## 11. Belge Reddinde Duzeltme Suresi

Belgeyi reddeden manager/admin, rejection penceresinde su iki secenekten birini secer:

1. `Full correction period`: ret anindan itibaren belge icin tanimli tam grace/duzeltme suresi yeniden baslar.
2. `Continue remaining period`: rejection oncesi kalan sure devam eder.

Kurallar:

- Varsayilan secim `Full correction period`.
- Onceki sure bitmisse `Continue remaining period` pasiftir.
- Employee'ye rejection nedeni ve yeni kesin deadline bildirilir.
- Secim, onceki deadline, yeni deadline, actor ve belge surumu audit kaydina yazilir.
- Taslak degisikligi veya tekrar upload tek basina sureyi resetlemez.
- Her yeni belge surumune verilen gercek rejection karari yeni bir deadline karari tasir.

Mevcut kod bu sure modelini uygulamiyor. Guncel review fonksiyonu requirement/document durumunu `rejected`, case'i `changes_requested` yapar; grace/deadline tutmaz. Bu nedenle belge dilimi mevcut davranis varsayilarak degil, BL-052 ile gerekli veri modeli eklenerek uygulanir.

## 12. Kapsam Disi ve Ayrik Isler

- Gunluk/haftalik calisma saati limitleri bu planda uygulanmaz. BL-067 ayri MVP kapisidir.
- Overtime, overnight toplamlari, timezone/DST, break, time tracking, payroll ve genis compliance motoru bu kapsama alinmaz.
- Coklu shift copy/paste yoktur.
- Shift type preset varyasyonlari ve sag-tik hizli shift menusu ayri deger fikridir.
- Conditional document'in tam Account > Documents ve onboarding deneyimi BL-052/BL-001 kapsaminda kalir; bu plan Schedule conflict entegrasyon sozlesmesini tanimlar.

## 13. Uygulama Dilimleri

### Dilim A - Olcum ve fast path

- Mevcut drag/drop, assessment, optimistic state ve save kodunu davranis matrisiyle eslestir; calisan parcalari koru.
- Mevcut drag/drop, availability assessment, save ve rollback zincirini olc.
- Normal drop icin optimistic fast-save uygula.
- `Checking shift change...` global gostergesini kaldir.
- 600 ms ve 5 saniye geri bildirimlerini ekle.

### Dilim B - Ortak conflict sonucu

- Mevcut conflict/fingerprint/result yapisini yeni sozlesmeyle karsilastir; ikinci bir conflict motoru yazma.
- Tek severity/result contract'i tanimla.
- Server hard block otoritesini koru.
- Istemci read modelinden hedef renklerini uret; bilinmeyen durumu yesil sayma.
- Kompakt confirmation ve otomatik audit'i bagla.

### Dilim C - Schedule Rules ve permission

- Mevcut scheduling settings semasi, `conflict_policy`, `availability_enforcement` ve permission katalogunu reuse et; yalniz yeni kararlarin gerektirdigi alanlari ekle veya sikilastir.
- Conflict handling bolumunu kullanici odakli labels/copy ile kur.
- Shared/API/DB ayarlarini ayni katalogla bagla.
- Tek `Manage conflict rules` iznini Roles & Permissions Schedule accordion'una ekle.

### Dilim D - Clipboard ve selection

- Once mevcut copy/paste ve selection davranisini bu plandaki matrisle karsilastir; uyumlu kodu yeniden yazma.
- Mevcut multi-select/delete/undo davranisini koru ve hedefli dogrula.
- Single-shift clipboard, drag modifier ve Paste Mode'u ortak conflict sonucuna bagla.
- Mevcut multi-copy yolu varsa yalniz kullanici kararina aykiri davranisi kaldir; single-copy altyapisini koru.

### Dilim E - Publish recap

- Mevcut publish preflight/recap ve warning kaynaklarini haritala; duplicate preflight olusturma.
- Publish oncesi server revalidation yap.
- Warning ve confirmation gecmisini kompakt recap'te goster.
- Guncel hard blocker varsa publish'i engelle.

### Dilim F - Documents entegrasyonu

- Mevcut document requirement, review, expiry ve schedule-impact kodlarini koru; conditional/grace eksigini bunlarin uzerine ekle.
- BL-052 ile Optional/Required/Conditional hedefleme ve grace veri modelini tamamla.
- Pending review, expiry, exemption ve rejection deadline secimini ortak conflict sonucuna bagla.
- Employee bildirimi ve audit kaydini ekle.

## 14. Dogrulama Stratejisi

Her kucuk degisiklikten sonra tum testler kosulmaz. Risk bazli kanit:

- Fast path: normal move/copy, server deny rollback, stale save ve uzun islem gostergesi icin hedefli web/API testleri.
- Conflict contract: her severity, coklu conflictte highest-wins ve immutable hard block icin shared/API/SQL testleri.
- Settings: permission guard, stale settings save ve omitted-field korunumu.
- Clipboard: move/copy modifier gecisleri, single paste mode, multi-select delete/undo.
- Publish: draft-edit warning, confirmation recapi ve publish aninda eskale olan blocker.
- Documents: target shift tarihi, grace aktif/bitmis, pending review, rejection reset/devam ve expired remaining-period guard'i.
- Browser kabul: gercek grid drag/drop hizi, hedef renkleri, kompakt confirmation, paste mode ve publish recap.

Yerel typecheck/test kaniti hosted migration, cross-tenant RLS veya release hazirligi sayilmaz. DB degisikligi varsa temiz local migration replay ve hedefli RLS/API kaniti ayrica gerekir.

## 15. Kapanis Kriterleri

- Normal drag/drop eski hizli hissine doner; gereksiz assessment bekleme yolu yoktur.
- Conflict renkleri, edit sonucu ve publish recapi ayni server sozlesmesiyle tutarlidir.
- Hard block'lar ayarla yumusatilamaz.
- Settings tek conflict yonetim yuzeyidir ve yalniz yetkili kullanici degistirebilir.
- Single-shift copy/paste ve multi-select davranislari birbiriyle cakismadan calisir.
- Belge conflict'i hedef tarih, grace ve rejection deadline kararina gore deterministik hesaplanir.
- BL-067 ve genis document/compliance kapsamlarinin siniri korunur.
- Mevcut dogru davranislar korunur; teslimat diff'i yalniz kanitlanmis gap, hata veya sikilastirma ihtiyacini kapsar.
