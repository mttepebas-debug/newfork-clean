# BL-050 Shift Catalog ARGE

Tarih: 2026-09-11  
Durum: ARGE / kabul sozlesmesi; implementasyon baslamadi.  
Model onerisi: `gpt-5.5`, `medium`. Bu is mevcut katalog davranisini, default hours etkilerini ve MVP kararlarini netlestirme isi; UI redesign veya migration yazimi yok.

## Kullanici baglami

Kullanici Shift Catalog sayfasindan genel olarak memnun. Istenen ana noktalar:

- Drawer tarafinda UI polish yapilacak.
- Shift type `default start` ve `default end` alanlari sikilastirilacak.
- Kullanicilar bu default saatlerin ne ise yaradigini anlamiyor; sayfa/drawer bunu daha net anlatmali.

Bu belge implementasyon degildir. Gorsel tasarim ve polish maddeleri kullaniciyle konusulmadan baslatilmayacak.

## Mevcut sayfa ozeti

Ana dosyalar:

- `apps/web/src/settings/ShiftTypesSettingsPage.tsx`
- `apps/web/src/settings/ShiftCatalogList.tsx`
- `apps/web/src/settings/CatalogDrawer.tsx`
- `apps/web/src/settings/organization-data.ts`
- `packages/shared/src/index.ts`

Mevcut davranis:

- Shift type listesinde name, default start, default end gorunuyor.
- Search, sort, archive/restore, reorder ve edit destekleniyor.
- Drawer create/edit icin ortak `CatalogDrawer` shell kullaniliyor.
- Yeni shift type default olarak `09:00-17:00`.
- Default start/end required input gibi kullaniliyor.
- Drawer, mevcut shiftlerin kayitli saatlerini korudugunu ve weekly availability preferences'in mevcut default saatleri kullandigini soyluyor.
- Mevcut type duzenlenirken default saat degisirse before/after uyarisi cikiyor.
- Default saatler editor acikken stale olursa save disable oluyor; kullanici explicit reload ile draft'i atabiliyor.
- Save, `default_revision` guard ile eski default saat ustune yazmayi engelliyor.

## Teknik sozlesme

### Schema

`shiftTypeInputSchema`:

- `name`: required, 1-60 char.
- `color`: hex.
- `default_start_time` ve `default_end_time`: ikisi birlikte set edilmeli.
- start ve end ayni olamaz.

### Storage / DB

- `shift_types` tablosu default_start_time/default_end_time tasiyor.
- `crosses_midnight` Postgres tarafinda derived.
- `default_revision` default saat degisimlerinde artiyor.
- `shift_type_time_history` default saat tarihcesi tutuyor.
- Weekly availability shift-type mode aktifken yeni/restore/degisen shift type'larda valid default hours zorlanabiliyor.

### Downstream etkiler

Default hours sadece drawer formu degil, su alanlari etkiliyor:

- Schedule add/edit shift: shift type secilince saved default hours referans olarak kullanilabiliyor.
- Schedule edit toolbar default-hours review: mevcut reference-hour shiftleri current default'a tasima akisi post-MVP'ye ertelenmis durumda.
- Weekly availability preferences: shift-type mode'da shift type default saatleri availability araligi gibi kullaniliyor.
- Time Off / leave shortcuts: shift type shortcut mevcut default saatleri kopyaliyor.
- Line Up / candidate checks: shift type identity ve default saatler availability/assessment tarafinda okunabiliyor.
- Templates/export/read model: shift type identity ve default saat evidence'lari tasiniyor.

Bu yuzden default saat copy'si "sadece gorunum" gibi anlatilmamali; yeni kullanimlar icin operasyonel referans saat oldugu acik olmali.

## Mevcut kanit

Focused test kapsamindan gorulenler:

- `ShiftTypesSettingsPage.test.tsx`
  - before/after reference hours gostermek.
  - reviewed revision ile save etmek.
  - overnight range'i aciklamak.
  - missing default hours durumunda valid range icat etmemek.
  - stale save'de draft'i korumak.
  - explicit reload haricinde draft'i atmamak.
  - save in-flight iken input ve add aksiyonlarini kilitlemek.
  - query param `?edit=` ile missing availability defaults'tan ilgili type editorunu acmak.
- `shift-type-data.test.ts`
  - update icin workspace/id/default_revision guard.
  - stale/inaccessible update'de unguarded retry yok.
  - revision yoksa update reddediliyor.
  - creation revision istemiyor.
- API route testleri shift type reorder boundary ve spoofed actor/workspace guard'i kapsiyor.

Bu local/focused kanittir; browser UAT ve kullanici tasarim kabul kaniti degildir.

## Problem adaylari

1. Drawer copy'si teknik olarak dogru ama kullanici acisindan hala soyut:
   - "Existing shifts keep their saved hours"
   - "Weekly availability preferences use these current default hours"
   Bu cumleler default saatlerin pratikte nerede kullanildigini yeterince somut anlatmayabilir.

2. `Default start` / `Default end` alanlari required ama neden required oldugu anlik olarak acik degil.

3. Shift type availability input mode aktifken default hours eksigi kritik hale geliyor; drawer bunu "availability shift type mode" baglamiyla daha net baglayabilir.

4. Default saat degistirme, mevcut shiftleri degistirmiyor. Bu dogru; ancak manager "neden eski schedule degismedi?" diye dusunebilir.

5. `Review current default hours` ozelligi toolbar'da MVP oncesi gizlenmis durumda. Drawer'da bu ozellige isaret etmek su an kafa karistirabilir; post-MVP notu olarak saklanmali.

6. Liste default start/end gosteriyor ama "Next day" etiketi yalniz end kolonu yaninda. Daha okunur overnight sunumu gerekebilir.

7. Reorder/search/sort ayni tabloda; sort/search varken move disable oluyor. Teknik olarak dogru ama kullanici icin aciklama yok.

## MVP icin davranis onerisi

MVP'de teknik mimariyi degistirmeden su sozlesme korunmali:

- Her active shift type icin valid default start/end zorunlu kalsin.
- Start/end ayni olamaz.
- Overnight desteklenir ve acikca "ends next day" olarak anlatilir.
- Default saat degisimi mevcut saved shifts'i geriye donuk degistirmez.
- Yeni Add Shift, availability shortcuts ve future template/shift-type uses current default saatleri kullanir.
- Stale revision guard korunur.
- Archive/restore davranisi korunur; delete destructive ise drawer icinde mevcut `CatalogDeleteAction` sozlesmesine sadik kalinir.

## Kullanici karari gereken noktalar

1. Drawer'da default hours icin kisa bir "Where this is used" aciklama kutusu ister misin?
2. Default hours required olmasi tum shift type'lar icin kabul mu, yoksa sadece availability shift-type mode aktifken mi zorunlu olmali?
3. Overnight shift type'larda etiket dili ne olsun: `Next day`, `Ends next day`, `Overnight`?
4. Default saat degisiminde mevcut shiftlerin degismedigini daha guclu warning olarak mi gosterelim, yoksa mevcut sakin copy yeterli mi?
5. Liste satirinda default hours yaninda küçük impact/status badge ister misin?
6. Archive/restore/delete davranisinda ek confirm copy'si gerekli mi?

Benim onerim:

- Required default hours kalsin. Uygulamada shift-type availability ve shortcuts ile cok baglantili; opsiyonel yapmak daha fazla edge case aciyor.
- Drawer'a tek kompakt aciklama eklenmeli:
  - "Used when managers create shifts from this type, employees use shift-type availability, and time-off shortcuts copy this service's hours. Existing saved shifts keep their own hours."
- Overnight etiketi `Ends next day` olsun.
- Default saat degisimi warning'i sade kalsin ama metni daha somut olsun.
- `Review current default hours` post-MVP oldugu icin drawer'da simdilik tanitilmasin.

## 2026-09-13 kullanici kararlari

- Shift Catalog'da shift type eklerken veya editlerken default start/end zorunlu olacak.
- Schedule grid'de shift type secilince bu saatler sadece baslangic degeri olarak dolacak; user ilgili shift'in saatini manuel degistirebilecek. Ornek: `Dinner` default `4:15 PM-10:30 PM` olabilir, fakat schedule'da tekil shift `5:00 PM-10:00 PM` olarak kaydedilebilir.
- Default time inputlari required alan olacak; default saat ayarlanmadan `Save` butonu aktif olmayacak.
- Edit modunda hicbir degisiklik yoksa `Save` butonu aktif olmayacak.
- `Save shift type` buton metni `Save` olacak.
- Default time alanlari icin `i` bilgi ikonu olacak; hover/focus sirasinda detayli, clean ve profesyonel tonda aciklama gorunecek, mouse uzaklasinca kapanacak.
- Overnight etiketi `Ends next day` olacak.
- Shift type time presets / sag-tik hizli schedule fikri MVP adayi olarak tutulacak, ancak mevcut BL-050 dar polish kapsaminda uygulanmayacak; once ayri ARGE/UX-data model calismasi yapilacak.

## Deger katabilecek yeni ozellik fikirleri

Bunlar implementasyon karari degil; kullaniciyle secilecek aday fikirlerdir.

### MVP'ye yakin ve yuksek degerli adaylar

1. **Default hours usage summary**
   - Drawer icinde compact bilgi: Schedule creation, employee availability by shift type, time-off shortcuts.
   - Deger: kullanici default saatlerin neden gerekli oldugunu anlar.
   - Risk: dusuk; copy/UI polish.

2. **Impact preview before saving default changes**
   - Save oncesi "This will affect future new shifts and shift-type availability; existing shifts stay unchanged" gibi net summary.
   - Deger: yanlis beklentiyi azaltir.
   - Risk: dusuk; mevcut before/after alaninin copy iyilestirmesi.

3. **Missing/invalid default hours health card**
   - Shift Catalog ustunde "All active shift types have default hours" veya eksik liste.
   - Deger: Availability shift-type mode'a gecmeden once hazirlik.
   - Risk: dusuk/orta; zaten weekly preference settings missing list uretiyor.

4. **Overnight badge standardization**
   - Listede ve drawer'da ayni `Ends next day` badge.
   - Deger: schedule'da geceyi asan servisler daha anlasilir.
   - Risk: dusuk.

5. **Quick duplicate shift type**
   - Mevcut bir shift type'i kopyalayip yeni ad/renk/saat ile yaratma.
   - Deger: Lunch/Dinner/Brunch gibi benzer servisleri hizli kurar.
   - Risk: dusuk; CRUD kolayligi.

6. **Shift type time presets / quick schedule menu**
   - Her shift type altinda birden fazla scheduled in/out varyasyonu tanimlanir; bir tanesi default olur.
   - Ornek: `Dinner` icin `4:00 PM-10:00 PM` default, `5:00 PM-11:00 PM`, `6:00 PM-close` gibi presetler.
   - Schedule grid'de bos hucreye sag tiklandiginda menu shift type isimlerini gosterir; shift type uzerine gelince o type'a ait preset saatler submenu olarak listelenir.
   - Preset secilince shift type + start/end tek hamlede yazilir; gerekirse employee/job/label secimi sonra editlenebilir.
   - Deger: manager'in en sik yaptigi "hucreye hizli shift yazma" isini ciddi hizlandirir; Add Shift dialog'a girme ihtiyacini azaltir.
   - Kapsam siniri: Bu fikir employee punch clock, Kiosk, payroll veya gercek clock-in/out kaydi degildir. Sadece Schedule uzerindeki planned/scheduled start-end presetidir.
   - Risk: orta; sag tik menu, keyboard/a11y, mobile alternatifi ve availability/conflict uyarilari iyi tasarlanmali.

### Daha buyuk / post-MVP adaylar

7. **Default hour change migration assistant**
   - Saved draft/live reference-hour shifts icin "review/apply current defaults" akisini Settings'ten baslatmak.
   - Deger: default degisiklikleri daha aksiyona donusur.
   - Dikkat: BL-062 nedeniyle post-MVP; su an toolbar'da gizli tutulan ozellige bagli.

8. **Location-specific default hours**
   - Aynı shift type farkli lokasyonda farkli saatle baslayabilir.
   - Deger: cok lokasyonlu isletmeler icin gercekci.
   - Dikkat: Schedule, availability, templates ve export sozlesmesini ciddi genisletir; MVP icin uygun degil.

9. **Daypart grouping**
   - Breakfast/Lunch/Dinner gibi gruplar ya shift type olarak kalir ya da ek kategori olur.
   - Deger: Line Up ve Schedule filtreleme kolaylasir.
   - Dikkat: mevcut karar daypart'i paralel domain yapmamak yonunde; once shift type katalogu kullanilmali.

10. **Default break policy per shift type**
   - Shift type'a default unpaid break eklemek.
   - Deger: Add Shift hizlanir.
   - Dikkat: time/payroll/compliance alanina kayabilir; post-MVP.

11. **Staffing count defaults**
   - Bir shift type icin "Dinner usually needs 4 servers, 2 hosts" gibi ihtiyac tanimi.
   - Deger: future auto-schedule/coverage heatmap icin temel.
   - Dikkat: Line Up ve forecasting ile buyuk baglanti; post-MVP.

### Benim secim onerim

MVP icin en iyi deger/karmasiklik orani:

1. Default hours usage summary.
2. Impact preview copy iyilestirmesi.
3. Overnight badge standardization.
4. Missing default hours health card, sadece var olan data kolayca kullanilabiliyorsa.
5. Shift type time presets fikrini ayri brainstorming/UX tasarim isine tasimak; ilk MVP patch'e sikistirmamak.

Post-MVP'ye birak:

- default hour change migration assistant,
- location-specific defaults,
- break policy,
- staffing count defaults.

## Kaydedilen yeni fikir: Shift type time presets

Bu fikir daha sonra brainstorming yapilarak gelistirilecek.

Ham fikir:

- Shift Catalog'da her shift type altinda kullanilabilecek birden fazla scheduled in/out varyasyonu tutulur.
- Her shift type icin bir preset default secilir.
- Schedule grid'de hucreye sag tiklandiginda shift type listesi acilir.
- Shift type uzerine gelince o shift type'in preset saatleri gorunur.
- Preset secilince shift type + saatler tek hamlede schedule'a eklenir.

UI/UX tasarim sorulari:

1. Sag tik menu mouse icin iyi; keyboard ve touch/mobile alternatifi ne olacak?
2. Menu ilk seviyede shift type mi gostermeli, yoksa en cok kullanilan presetleri dogrudan mi gostermeli?
3. Preset label'lari nasil yazilmali: `Default`, `Early`, `Late`, `Close`, yoksa kullanici isimlendirmesi mi?
4. Default preset, bugunku `default_start_time/default_end_time` alanlarinin yerini mi alacak, yoksa onlarin uzerine ek varyasyonlar mi olacak?
5. Availability conflict, closed day, overtime veya time-off uyarilari preset seciminden once mi sonra mi gosterilecek?
6. Presetler location-specific olmali mi, yoksa shift type geneline mi ait kalmali?
7. Preset secimi Add Shift dialog'u tamamen bypass edebilir mi, yoksa shift create sonrasi inline quick editor mi acilmali?

Ilk urun yonu:

- Bu ozellik "clock-in/out" degil, sadece scheduled start/end hizli yazma presetleri olarak adlandirilmali.
- Mevcut default hours tek default preset gibi dusunulebilir.
- MVP Shift Catalog copy/polish isine dahil edilmemeli; ayri UX brainstorming ve veri modeli karari gerekir.
- En yuksek deger Schedule grid hizinda olur: sik kullanilan shiftleri dialog acmadan yazmak.

## Onerilen dar implementasyon

Kullanici onayi sonrasi en dar patch:

1. Default time label'larina bilgi ikonu ve hover/focus aciklamasi ekle.
2. Save buton metnini `Save` yap.
3. `Ends next day` etiketini drawer/list icinde standardize et.
4. Mevcut required/default-hours ve unchanged-edit disabled save davranisini koru.
5. Yeni backend veya preset veri modeli yazma.

## Kabul kosullari

BL-050 kapanmadan once:

- Kullanici drawer copy/design kararlarini onaylar.
- Default hours'in nerede kullanildigi UI'da anlasilir hale gelir.
- Validasyon: start/end required, equal time blocked, overnight accepted.
- Existing shifts'in geriye donuk degismedigi copy ile net.
- Stale revision save guard korunur.
- Focused testler:
  - `ShiftTypesSettingsPage.test.tsx`
  - `shift-type-data.test.ts`
  - gerekiyorsa `organization-settings-routes.test.ts` shift type reorder boundary
- Browser UAT:
  - add shift type
  - edit default hours
  - overnight example
  - stale/reload behavior gerekirse sadece focused/local testle kalabilir, browser'da zorunlu degil.

Bu belge BL-050'yi kapatmaz; uygulama ve browser kabul turu ayridir.
