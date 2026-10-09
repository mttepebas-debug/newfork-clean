# BL-038 Schedule Templates ARGE

Tarih: 2026-09-11  
Durum: ARGE / kabul sozlesmesi; implementasyon baslamadi.  
Model onerisi: `gpt-5.5`, `medium`. Bu is mevcut kodu okuyup MVP kararlarini netlestirme isi; genis UI redesign veya DB yeniden modelleme baslamadigi surece daha agir model gerekmez.

## Kullanici baglami

Kullanici Schedule sayfasindaki sag ust `Templates` butonunun gorsel olarak guzel bir pencere actigini, fakat arka planda ne kadar iyi calistigini bilmedigini soyledi. Bu nedenle BL-038 icin hedef once mevcut davranisi anlamak, MVP'de hangi template davranisinin kalacagini secmek ve kabul kanitini tanimlamaktir.

Bu turda patch veya redesign yok. Kullanici tasarima dahil olmak istedigi icin gorsel kararlar implementasyon oncesi ayrica konusulacak.

## Mevcut durum ozeti

Mevcut sistem basit bir dialogdan fazlasini yapiyor:

- `Templates` butonu `schedule.templates.manage` permission varsa gorunuyor.
- Dialog mevcut template listesini gosteriyor.
- Template rename/delete destekleniyor.
- Named draft'tan template create ediliyor.
- Create sirasinda assignment'lari open slot olarak kaydetme secenegi var.
- Aktif edit session varsa template apply yapiliyor.
- Apply modu:
  - bos working copy icin `Apply template`
  - mevcut shift varsa `Merge`
  - mevcut shift varsa `Overwrite`
- Department filtreleme var; tum department'lar seciliyse server'a `null`, filtre varsa secilen key listesi gidiyor.
- `No department` ozel key'i var.
- API tarafinda list/get/create/rename/delete/apply route ve service katmani var.
- Shared permission sozlesmesi `schedule.templates.manage`; bu permission `schedule.read` ve `schedule.manage` ile birlikte bekleniyor.

Focused mevcut kanit:

- `ScheduleTemplateDialogs.test.tsx` department filtreleme, all-department null payload, tum department deselect block, merge/overwrite, load sonrasi selection ve selected template silinince fallback davranisini kapsiyor.
- 2026-09-11 onceki export/templates test turunda template/export web testleri 43/43 PASS raporlandi. Bu mevcut sozlesme kanitidir; browser UAT veya urun kabul kaniti degildir.

## MVP icin urun hedefi

Manager sik kullandigi haftalik schedule pattern'ini tekrar kurmak zorunda kalmadan yeni bir haftaya uygulayabilmeli.

Basit hedef:

1. Mevcut adlandirilmis draft'tan template olustur.
2. Template'i yeni veya mevcut draft/edit session'a uygula.
3. Uygulama sonucu publish etmeden once kullanici tarafindan gorulup duzenlenebilir kalsin.
4. Template apply asla otomatik publish yapmasin.
5. Manager neyin korunacagini, neyin eklenecegini ve overwrite riskini net anlasin.

## MVP'de kalmasi gereken davranislar

- Template yalniz named draft'tan olusturulsun.
- Dirty unsaved working copy dogrudan template'e cevrilmesin; once save/name gerekir.
- Varsayilan create secenegi assignment'lari open slot olarak kaydetmek olsun.
- Assignment'lari koruma secenegi ancak kullanici bilincli secince kullanilsin.
- Apply aktif edit session'a uygulanir; publish yan etkisi yoktur.
- Existing shifts varsa `Merge` ve `Overwrite` ayrimi korunur.
- `Overwrite` tehlikeli aksiyon olarak kalir ve copy'si netlestirilir.
- Department filtreleme kalabilir; ama UI sade ve anlasilir olmalidir.
- Template rename/delete korunur.

## MVP'de disari alinabilecek veya sade tutulacaklar

- Template preview'in tam schedule grid kopyasi MVP icin sart degil; ozet + shift count yeterli olabilir.
- Advanced department partial apply, kullanici icin kafa karistiriyorsa ilk iterasyonda kapali/advanced bolum olabilir.
- Template versiyon gecmisi veya rollback yok.
- Cross-week automation, recurring template schedule, AI autofill veya labor optimization yok.
- Template marketplace/library yok.
- Template uygulama sonucunda otomatik notification yok.

## UI/UX sorun adaylari

Bu noktalar implementasyon karari degil, kullaniciyla konusulacak gorusme basliklaridir:

- Dialog iki ana isi ayni anda yapiyor: mevcut template yonetimi ve yeni template yaratma. Bu karmasa yaratabilir.
- `Revision` bilgisi kullanici icin teknik duruyor.
- `Save shifts as open slots` iyi bir davranis ama metin daha anlasilir olabilir.
- Department filtreleme faydali ama ilk bakista fazla teknik olabilir.
- `Merge` / `Overwrite` copy'si daha guclu risk dili isteyebilir.
- Empty state "No templates saved yet" cok yalniz; kullaniciyi named draft'tan template yaratmaya yonlendirebilir.

## Teknik sozlesme

Mevcut v1 teknik sozlesmesi buyuk olcude korunabilir:

- Permission: `schedule.templates.manage`.
- Template create:
  - input: draft id, name, strip assignments.
  - server tenant ve permission kontrolu yapar.
  - template week'e bagli olmadan day-offset/reference modeliyle saklanir.
- Template apply:
  - input: active session id, expected revision, template id, mode, department keys.
  - server session revision'i ve edit ownership'i dogrular.
  - `merge` var olan shiftleri korur.
  - `overwrite` session snapshot'ini temizleyip template'i uygular.
  - inactive/deleted references fail closed veya open slot'a dusme politikasina gore raporlanir.
- Apply result:
  - applied shift count
  - skipped/blocked reference sayilari varsa kullaniciya gostermek icin donmeli.

## Eksik olabilecek kanitlar

Bu turda sadece static/code okumasi yapildi. BL-038 kapanmadan once su kanitlar gerekir:

- Browser UAT:
  - named draft'tan template create
  - template rename
  - template delete
  - blank edit session'a apply
  - existing shift varken merge
  - existing shift varken overwrite risk teyidi
  - department filtreli apply
- API/focused test:
  - permission deny
  - stale revision
  - cross-tenant template/session denial
  - inactive location/job/shift type behavior
- UI kabul:
  - dialog kullanici tarafindan anlasilir mi?
  - teknik `revision` gibi alanlar son kullaniciya gosterilecek mi?
  - department filter MVP'de ilk ekranda mi, advanced bolumde mi?

## Kullanici karari gereken noktalar

1. Template create sirasinda assignment'lari open slot olarak kaydetmek varsayilan kalsin mi?
2. Assignment'lari koruyarak template yaratma MVP'de gerekli mi?
3. Department filtreleme ilk ekranda gorunsun mu, advanced olarak mi saklansin?
4. `Revision` bilgisi kullaniciya gosterilsin mi, yoksa gizlensin mi?
5. Existing shifts varsa `Overwrite` icin ekstra confirm gerekir mi?
6. Template preview sadece ozet mi olsun, yoksa kucuk grid/list preview ister misin?

Benim onerim:

- V1 teknik altyapi korunabilir; sifirdan rewrite gerekmez.
- UI sadeleştirme gerekir ama kullaniciyla tasarim konusulduktan sonra.
- MVP icin open-slot template varsayilan olmali.
- Assignment-preserving template ve department filter advanced bolumde olabilir.
- `Revision` UI'dan kaldirilmali; concurrency arkada kalmali.
- Overwrite icin net confirm gerekir.

## Onerilen uygulama sirasi

1. Browser'da mevcut template akisini gercek fixture ile bir kez dene.
2. Kullanici kararlarini al.
3. Sadece UI/copy ve gerekiyorsa küçük validation davranislarini duzelt.
4. Existing focused tests'i guncelle; gereksiz genis suite calistirma.
5. Browser'da create/apply/merge/overwrite kabul turu yap.

## Kapanis kriteri

BL-038 kapanmis sayilmaz; bu belge ARGE kaydidir. Kapanis icin kullaniciyla UI kararları, browser UAT ve gerekirse dar kod iyilestirmeleri gerekir.
