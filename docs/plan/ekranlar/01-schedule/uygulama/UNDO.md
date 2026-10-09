# UNDO — Undo sunucuda geri alır (W-1b S2)

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| Schedule (düzenleme şeridi) | EKRAN-01 W-1b S2 (KK-171), DB-1c'nin web/API yarısı | nf-backend / web hattı | R2 | nf-guvenlik ONAY @05c19950 → düzeltmeler ONAY @9a6fe619 | 2026-10-06 |

## Sonrası için
- Kural: Undo = `POST /schedule/edit-sessions/:id/undo` (sunucu son adımı tek işlemde geri alır); düğme `undo_depth` 0'da soluk (`SchedulePage.tsx` `canUndo`).
- Tuzak: ekrandaki bir yığın sunucuya taşınınca eski her "temizle" çağrısının sunucuda karşılığı olmalı (onaylı takas geri yüklemesi eksik kaldı → veri hattı).
- Tuzak: App.test `schedule-data`'yı açık listeyle taklit ediyor; yeni dışa aktarım (`isNothingToUndo`) listeye `actual.*` ile eklenmezse catch içinde sessizce patlar.
- Ölçüm: api 1006, web 2210 (+1), e2e schedule + scope 20/20 (2026-10-06, `9a6fe619`).

## Rapor

**Karar:** nf-guvenlik ONAY @05c19950, düzeltmeler ONAY @9a6fe619 · sınıf R2
**İzin:** R2 — gönderildi (sha ve CI numarası posta kutusundaki raporda / panoda); canlı migration önkoşulu doğrulandı (Supabase `list_migrations`: `20261007120000 schedule_undo_goes_back_on_the_server` canlıda)
**Risk:** 🟠 güvenlik/veri riski yok; açık kalan: "Approved assignments restored" sonrası Undo o geri yüklemeyi geri alabiliyor → veri hattına (posta kutusu EKRAN-01-UNDO-db-bulgu)
**Soru:** yok
**Sonraki:** EKRAN-02 B1 (koordinatörün sırası); SchedulePage.tsx bırakıldı

## 1. Nerede duruyor
Bitti; W-1b'nin son maddesi S2 kapandı (KARARLAR Schedule "Undo sunucuda da geri alır", "Undo kaydedilmiş adımı geri almaz"; KK-171).

## 2. Ne yapıldı (öncesi → sonrası), Schedule → düzenleme modu → Undo / Ctrl+Z
- **Öncesi:** Undo yalnız ekranı eski kopyaya çeviriyordu; sunucudaki düzenleme değişmeden kalıyor, en geç bir dakika sonra kalp atışıyla değişiklik ekrana geri dönüyor, kaydedilirse ya da yayınlanırsa geri alınan değişiklik gidiyordu.
- **Sonrası:**
  - Undo ve Ctrl+Z yeni `POST /schedule/edit-sessions/:id/undo`'yu çağırıyor; sunucu düzenlemenin son adımını tek işlemde geri alıyor (DB-1c). Sürükleme, hızlı düzenleme, yapıştırma, toplu silme, şablon, Auto-fill, default hours hepsi birer adım.
  - Düğme her zaman şeritte; sunucuda geri alınacak adım yoksa (`undo_depth` 0) soluk ve basılmıyor. Sayfa yenilense de doğru.
  - Aynı anda tek Undo: basılı tutulan Ctrl+Z aynı revizyonu iki kez göndermiyor.
  - Sunucu adımı geri almayı reddederse (bugünkü izin / belge kuralı, eski revizyon): "This step can no longer be undone.", hiçbir şey değişmez; ham veritabanı metni yok.
  - Kaydetme (Save draft) düzenlemeyi kapattığı için kaydedilmiş adım geri alınmıyor (KARARLAR).
  - Ekranın kendi kopya yığını silindi (ikiz sistem yok).
- **Örnek:** Ayşe Ali'nin Salı vardiyasını ekler, Undo'ya basar, sayfayı yeniler: vardiya yok, Undo soluk.

## Kanıt
- Önce kırmızı: API servis + rota tablosu (6), web veri katmanı (2, "is not a function"), App sürükle-Undo testi ("spy called 0 times"), tek-Undo testi ("called 2 times").
- Yeni e2e `e2e/flows/schedule-undo.spec.ts` (kendi haftası 501): ekle → Undo → yenile → vardiya yok, Undo soluk. Geçti.
- Kapı (`9a6fe619`, origin/main bce5765a): lint + typecheck temiz; api 1006, web 2210 (+1 atlanan), ui 9, shared 210; build EXIT=0. shared `timezones.test.ts` paralel koşuda iki kez 5 sn zaman aşımı (dinamik `import("./index")`), tek başına boşta 210/210 — yük düşüşü (kural gereği boşta yeniden koşturuldu).
- E2E (db.lock): schedule-* + scope-and-employee-view 20 passed (6.0m).

## 3. Açık kalan ve nedeni
- **Veri hattına (nf-guvenlik Orta):** `shift_exchange_schedule_recovery_service` ("Approved assignments restored") Undo geçmişini silmiyor; müdür Ctrl+Z ile geri yüklemeyi geri alıp kaydetme reddine geri düşebilir. Veri kaybı yok. Öneri: servis sonunda `schedule_edit_undo_barrier()` + pgTAP (leave: medium / do: safe). Eski ekran burada yığını bilerek boşaltıyordu.
- **Backlog önerisi:** shared `timezones.test.ts`'in "refuses to save a scheduled export in a time zone that does not exist" testi paralel yükte 5 sn'yi aşıyor (dinamik import); zaman aşımı ya da statik import (leave: low / do: safe).

## 4. Ekranda ne değişti
Schedule → düzenleme şeridi: Undo artık hep görünür, adım yoksa soluk; geri alma sunucuda kalıcı.

## 5. Sırada ne var
- EKRAN-02 B1.
- Veri hattına: geri yükleme Undo sınırı.

Senin yerine verdiğim kararlar (metin/teknik, P19-P21): "This step can no longer be undone." metni; Undo düğmesi adım yokken gizli değil soluk (KARARLAR "düğme soluklaşır"); shared şemada `undo_depth` üst sınırı yok (veritabanı korur).

Skills: superpowers:test-driven-development, superpowers:receiving-code-review, superpowers:verification-before-completion.

## İnceleme

### nf-guvenlik — ilk tur
KARAR: ONAY @05c19950

**Koordinatör için 5 satır**
- **Karar:** ONAY, R2. Kritik ya da Yüksek bulgu yok. Bir Orta bulgu var, işi durdurmuyor ama sahibine verilmeli.
- **İzin:** R2. Kapı yeşilse oturum kendisi gönderebilir.
- **Risk:** 🟠 Güvenlik açığı yok. Ama Undo, onaylı takası geri yükleme işlemini de geri alabiliyor. Veri kaybolmuyor, kaydetme yine reddediliyor; müdür aynı döngüye girebilir.
- **Soru:** Koordinatöre bir soru: "Approved assignments restored" sonrası Undo o geri yüklemeyi geri alabilmeli mi? Önerim "hayır". Bu nf-db'de küçük bir migration demek: geri yükleme işlemi Undo geçmişini silsin.
- **Sonraki:** Yok. İnceleme bitti.

---

## Ne incelendi
- **Sunucu:** Schedule ekranında Undo düğmesi ve Ctrl+Z artık sunucuya gidiyor. Sunucu, düzenlemenin son adımını tek işlemde geri alıyor.
- **Düğme:** Geri alınacak adım kalmayınca düğme soluk.
- **Ekranın kendi kopya yığını:** Silindi.

## Güvenlik kontrolleri (temiz)
- **Yetki kapısı:** `schedule-routes.ts:943` önce kişiyi ve workspace'i buluyor, sonra `schedule.edit` yetkisini soruyor. Rota tablosu testine de eklenmiş (`schedule-routes-gate.test.ts:48`).
- **Gövde doğrulaması:** `sessionId` uuid olmak zorunda. `expected_session_revision` pozitif tam sayı olmak zorunda; fazladan alan atılıyor.
- **Veritabanı tarafı:** Undo servisi (migration :106–211) yalnız service_role'e açık.
  - Oturum hem workspace'le hem `holder_user_id = actor` ile eşleşiyor. Başkasının düzenlemesi "bulunamadı" (P0002 → 404) cevabı alıyor.
  - Yetki çekirdeği düzenlemenin bütün lokasyonlarıyla soruluyor: `authorize(... target_locations => edit.location_ids)`.
  - Başka workspace'e ya da başka lokasyona giden yol yok.
- **Hata metinleri:** `rpcFailure` (`http-error.ts:113`) üzerinden geçiyor.
  - Boş geçmiş PT409 + `schedule.nothing_to_undo` → 409. Ekran bunu `reason` ile tanıyor (`isNothingToUndo`).
  - Kira dolması ve eski sürüm 40001 → 409, mesajla değil kodla (`EDIT_CONFLICT_CODES`).
  - Kural reddi 23514 → 400. Metinde kişi, lokasyon ya da id yok; başka lokasyon hakkında bilgi sızmıyor.
- **Yayın:** `schedule-service.ts:722` yalnız düzenlemenin kendi lokasyonlarına gidiyor. İçinde yalnız hedef adları var (`draft_shifts`, `pending_ops`, `edit_lock`). Otomatik kaydetme ve öteki yazımlarla aynı kalıp.
- **Kira dolunca ikinci deneme (`runWithLease`):** İki adım geri alınamıyor.
  - "edit lease expired" hatası, servisteki ilk yazımdan (:136) önce atılıyor (:129). İşlem bütünüyle geri dönüyor, hiçbir şey yazılmıyor.
  - İkinci deneme ekrandaki eski sürüm numarasıyla gidiyor. Sunucu arada ilerlediyse "stale" alıyor; ikinci bir geri alma olmuyor.
- **Cevap kaybolursa:** Ağ hatası kira hatası sayılmadığı için tekrar denenmiyor. Bir sonraki basış eski sürümle gidiyor ve "stale" alıyor. Çift geri alma yok.
- **Çift tık ve basılı tutulan Ctrl+Z:** Satır `FOR UPDATE` ile kilitleniyor ve sürüm karşılaştırılıyor (:122, :131). İkinci istek bekliyor, sonra "stale" alıyor. Tek adım geri gidiyor.
- **Silinen kopya yığını:** Şablon, Auto-fill, default hours, yapıştırma ve sürükleme tablo tetikleyicisi üzerinden sunucuda adım sayılıyor.
  - Düzenleme açma, genişletme, kaydetme ve kapatma geçmişi siliyor.
  - Takas ve kapalı gün de geçmişi siliyor (`schedule_edit_undo_barrier`, :553 ve :619).
  - Eski `clearUndoStack` çağrılarından yalnız biri karşılıksız kaldı (aşağıda).

## Bulgular

### Orta
**1. Undo, "Approved assignments restored" işlemini geri alıyor.**
- **Nerede:** `SchedulePage.tsx:3053` civarı (silinen `clearUndoStack()`). Veritabanı tarafı: `shift_exchange_schedule_recovery_service` (`20260926200000_shift_labels_come_from_the_catalog.sql:374`).
- **Ne görüldü:** Eski ekran, onaylı takası geri yükledikten sonra Undo yığınını bilerek boşaltıyordu. Yeni sürümde bu çağrı silindi. Geri yükleme servisi `schedule_edit_session_shifts` tablosuna yazıyor ama `schedule_edit_undo_barrier()` çağırmıyor. Takas ve kapalı gün çağırıyor. Bu yüzden geri yükleme sıradan bir Undo adımı oldu.
- **Senaryo:** Ayşe Salı vardiyasını Ali'den Mehmet'e takasla vermiş, müdür onaylamış. Müdür taslağı kaydedemiyor; Schedule → Save → kurtarma sayfası → "Approved assignments restored" ile vardiya Mehmet'e dönüyor. Müdür alışkanlıkla Ctrl+Z'ye basıyor: vardiya yeniden Ali'ye geçiyor.
- **Etkisi:** Veri kaybı yok, çünkü kaydetme `shift_exchange_assert_session` ile yine reddediliyor (`20261007060000_...sql:327`). Ama müdür aynı kurtarma döngüsüne geri düşüyor. Bu, DB-1c'nin "Undo, düzenlemenin yapmadığı şeyi geçmez" kuralıyla da çelişiyor.
- **Beklenen:** Geri yükleme servisi sonunda `perform app_private.schedule_edit_undo_barrier()` çağırmalı. Bu nf-db işi; web tek başına sunucu geçmişini silemez. Yanına bir pgTAP testi: geri yükleme sonrası `undo_depth` 0 ve Undo PT409 dönüyor.
- **Neden engel değil:** Güvenlik ya da veri kaybı yok. Ama Mert'in kararı gerekmeden yapılabilecek ve yapılması gereken bir iş.

### Düşük
**2. Basılı tutulan Ctrl+Z aynı anda hem başarı hem hata gösteriyor.**
- **Nerede:** `SchedulePage.tsx:1544–1573` ve `:1678`.
- **Ne oluyor:** Devam eden isteği bekleyen bir kilit yok. Tuş tekrarında aynı sürümle birden fazla istek gidiyor; ilki geri alıyor, ötekiler "stale" alıyor.
- **Ekranda:** "Last edit undone" ile birlikte "Last edit could not be undone" çıkıyor. Açıklamada ham "session revision stale" metni var.
- **Öneri:** İstek sürerken `undoLastEdit` erken dönsün, ya da `edit_session_stale` kodu sessizce yutulsun. Güvenlik etkisi yok.

**3. Kural reddinde ekrana geliştirici metni çıkıyor.**
- **Nerede:** `SchedulePage.tsx:1567–1572`.
- **Ne oluyor:** 23514 geldiğinde toast açıklamasına ham "employee document hard conflict" yazılıyor. Bu, ILKELER P21'e ("geliştirici notu gibi yazılmaz") aykırı.
- **Öneri:** "One of these shifts can no longer go back: a required document is missing." gibi tek bir cümleye eşlensin.

**4. `undo_depth`'te en çok 25 sınırı tek sorgunun ötesini etkiliyor.**
- **Nerede:** `packages/shared/src/index.ts:1614`, `.max(25)`.
- **Ne oluyor:** Bugün veritabanı en çok 25 adım tutuyor; yazımlar oturum kilidiyle sırayla geçiyor. Ama bu değişmez kural bir gün bozulursa (ör. kilitsiz yeni bir yazım), düzenleme oturumunu döndüren her uç 500 verir ve Schedule düzenlenemez olur.
- **Öneri:** Shared şemada yalnız `.int().min(0)` kalsın. 25 sınırını veritabanı korur.

## Öneri (zevk)
- Sunucu Undo sırasında, son yazımın cevabı kaybolduysa ekrandaki `undo_depth` eksik kalabilir; düğme bir sonraki heartbeat'e kadar soluk görünür. Zararsız; heartbeat bunu düzeltiyor.

## Kanıt
- `git rev-parse HEAD` → `05c19950…`. Dal `origin/main` (`bce5765a`) üstünde tek commit.
- `pnpm.cmd --filter @newfork/web exec vitest run src/schedule/schedule-data-undo.test.ts` → 2/2 geçti (2026-10-06 05:00).
- `pnpm.cmd --filter @newfork/api exec vitest run src/schedule/schedule-service.test.ts src/schedule/schedule-routes-gate.test.ts` → 177/177 geçti (2026-10-06 05:00).
- Kod okuması:
  - Migration `20261007120000_schedule_undo_goes_back_on_the_server.sql`: :106–211 Undo servisi, :271 adım sayısı, :553 ve :619 geçmişi silen çağrılar.
  - `http-error.ts:53–175`, `schedule-routes.ts:943–965` ve `:1405–1460`.
  - `useScheduleEditSession.ts:209–221`.
  - Geri yükleme servisi `20260926200000_…sql:374–433`, kaydetme kontrolü `20261007060000_…sql:327`.
- Tam kapı ve e2e koşturulmadı: oturumun 344/344 ve 1002/1002 sonucu var, bulgularım da test sonucuna bağlı değil.

## Hafıza notu (dosyaya yazılmadı)
Başlık: "Ekrandaki yığın sunucuya taşınınca". Ekranın kendi Undo ya da geçmiş yığını silinip iş sunucuya taşındığında, eski `clearUndoStack` benzeri her çağrı yeri sunucuda karşılığıyla eşlenmeli: o yazım geçmişi siliyor mu? Bu incelemede silinen yerlerden biri (onaylı takasın geri yüklenmesi) sunucuda karşılıksız kaldı. Her çağrı yerini sunucudaki karşılığıyla tek tek eşleyen bir tablo kur.

### nf-guvenlik — düzeltmeler
KARAR: ONAY @9a6fe619

**Koordinatör için 5 satır**
- **Karar:** ONAY, R2. Önceki incelemedeki Düşük 2, 3 ve 4 doğru kapanmış. Kritik, Yüksek ya da yeni Orta bulgu yok.
- **İzin:** R2. Kapı yeşilse oturum gönderebilir.
- **Risk:** 🟢 Yalnız ekran ve sözleşme düzeltmesi; yetkiye ve veriye dokunmuyor. Orta 1 (onaylı takası geri yükleme işleminin Undo geçmişini silmesi) veri hattında açık.
- **Soru:** Yok.
- **Sonraki:** Yok.

---

## Ne kontrol edildi (yalnız `git show 9a6fe619`)
Tabanın zinciri doğru: `05c19950`, `9a6fe619`'un atası. Arada `86d9a4e6` (e2e testi) var; o commit bu incelemenin kapsamında değil.

**Düşük 2 – aynı anda tek Undo: kapandı.**
- `SchedulePage.tsx:1545–1549`: `undoInFlightRef` istek başlamadan, aynı anda doluyor. Bu yüzden basılı tutulan Ctrl+Z'de ikinci tuş olayı erken dönüyor.
- `finally` bloğu kilidi her yolda bırakıyor: başarı, "nothing to undo" ile erken dönüş, hata, ve `mutate` oturum değişince `null` döndüğünde. Düğme kalıcı olarak kilitli kalamaz.
- Test (`App.test.tsx:4275–4302`): iki Ctrl+Z gönderiliyor, tek çağrı bekleniyor. Bu test kilit satırı silinirse düşer.

**Düşük 3 – ham hata metni: kapandı.**
- `SchedulePage.tsx:1570–1582`: 4xx gelen her sunucu reddi "This step can no longer be undone." oluyor. Buna kural reddi (23514), "stale" ve kapsam daralması (403) dahil.
- Kira iki kez dolarsa gelen hata düz bir `Error` (`EDIT_NOT_RECONNECTED`). Bu zaten okunur bir cümle ve olduğu gibi gösteriliyor.
- `ScheduleRequestError` dosyada zaten içe aktarılmış (satır 83).
- Test, ham "employee document hard conflict" metninin ekranda olmadığını da doğruluyor.

**Düşük 4 – en çok 25 sınırı: kapandı.**
- `packages/shared/src/index.ts:1614`: `.max(25)` kalktı, `.int().min(0).optional()` kaldı.
- Alan opsiyonel olduğu için veritabanı alanı göndermese de ayrıştırma çalışıyor. Sınırı veritabanı koruyor.

**Test sahtesi:** `isNothingToUndo` gerçek koda bağlanmış (`App.test.tsx:575`). Gerçek fonksiyon kullanıldığı için test bir şeyi gizlemiyor.

## Bulgular
Yeni bulgu yok.

**Not (öneri):** 403'ün de "This step can no longer be undone." demesi kabul edilebilir. Kapsamı daralan kişiyi heartbeat zaten düzenlemeden çıkarıyor (`useScheduleEditSession.ts:240`).

## Kanıt
- `git merge-base --is-ancestor 05c19950 9a6fe619` → atası, zincir doğru.
- `git log --oneline 05c19950..9a6fe619` → `86d9a4e6`, `9a6fe619`.
- `git show 9a6fe619` tam okundu: 3 dosya, +46/−5.
- Testleri kendim koşmadım: bu worktree hâlâ `05c19950`'de ve başkasının worktree'sinde checkout yapılmaz. Oturum App testinin önce kırmızı olduğunu bildiriyor. Değişiklik küçük ve test, kilit satırı ile metin eşlemesi silinince düşecek şekilde yazılmış.

## Hafıza notu (dosyaya yazılmadı)
Hafızadaki "Boş kablolama testleri" maddesine bir satır: ekran tarafındaki işlem kilidinde (`useRef` ile "istek sürüyor" bayrağı) iki şeye bak.
- Kilit `await`'ten önce, aynı anda mı doluyor?
- Her yolda (erken dönüş, `null` dönüşü, hata) `finally` ile bırakılıyor mu?

Test ise iki olayı aynı anda göndermeli; yoksa kilidin varlığını kanıtlamaz.
