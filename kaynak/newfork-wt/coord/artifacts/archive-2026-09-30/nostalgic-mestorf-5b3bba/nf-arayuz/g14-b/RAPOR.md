# G14 dilim b — Schedule masaüstü, görünen düzeltmeler

İşçi: G14 Schedule masaüstü (`nf-arayuz`). 2026-09-30.
Branch `task/g14-b`, worktree `.claude/worktrees/nostalgic-mestorf-5b3bba`, push yok. **Uç: `7e19a76b`**, `origin/main` `c064ea57` üstünde 13 commit (son rebase yalnız `docs/` getirdi; kod `313ab090` ile aynı, `apps packages e2e supabase` farkı 0 satır; tablodaki numaralar bir önceki rebase'e aittir) (dilim a main'e girdi, rebase edildi; aşağıdaki numaralar rebase sonrası). İncelenen hâl `c6a27136` idi; metinde geçen eski numaralar (`a8156980`, `c6a27136`, `d72c3b35`) rebase öncesine aittir.

| Commit | Kalem |
|---|---|
| `0d4554f9` | Dilim a inceleme bulgusu 2: birleşik düzende tek lokasyon kendi saat diliminde |
| `35c4dce6` | BL-345 tip çiplerinin kenarı + üst çubuk kenarı token |
| `88caa663` | BL-305 kalanı (Week kartı, kapatma simgesi) |
| `bb50e025` | Dilim a inceleme bulgusu 1: Escape ve yerel pencere |
| `447b43e2` | BL-308 basılamayan Publish |
| `2b99bdf1` | BL-392 okuma düşünce hafta gezinmesi |
| `8a39d128` | İpucu balonu pencere kenarında daralmıyor (BL-308'in parçası) |
| `e968e5f2` | `nf-arayuz` rol hafızası (yalnız belge) |
| `be8a2a9e` | BL-440 eki: kurtarma penceresinde Discard iki tık kırmızı |
| `e873407a` | Dilim b incelemesi 1 ve 2: balonun Escape'i, kısa balonun yeri |
| `63ba9171` | `nf-arayuz` rol hafızası: inceleme dersleri (yalnız belge) |
| `993ee979` | Dilim b incelemesi 3: "bu haftaya dön" tek yardımcıdan |
| `313ab090` | Görsel QA düzeltmesi: pencere içindeki basış pencerenindir |

## 1. Nerede duruyor
Dilim b bitti: yedi kalem ve BL-440 eki yapıldı, kapı yeşil, commit'li. **U08 (936px düzeni) bu planda yok: kullanıcı kararı 2026-09-30, "şimdi değil, backlog'a".** Başlanmadı, koda dokunulmadı. Etkilenen e2e yerelde koşturulmadı (bölüm 3, madde 2).

## 2. Ne yapıldı (etkisi)

**BL-308 — düzeldi.** Schedule → sağ üstteki Publish düğmesi, haftada açık taslak ve yayın yokken artık basılamaz görünüyor ve nedenini söylüyor. Örnek: müdür Ayşe taslak açmadan Publish'in üstüne gelir (ya da Tab ile gelir); düğme soluk, imleç "yasak", altında koyu bir balon: "Open a saved draft from New Schedule before publishing this week."
- Görünüm ortak kuralın değeri: saydamlık 0,55 ve `not-allowed` imleci (`.nf-button:disabled` ile aynı; `styles.css:4297-4303`). Published göstergesinin kuralı duruyor (`:4304-4307`, saydamlık 1).
- Düğme artık gerçek `disabled` değil, `aria-disabled`: klavyeyle ulaşılır, ekran okuyucu "kullanılamıyor" der, tıklamak yayın başlatmaz (balonu açar/kapatır). Neden, balon açılmadan önce de düğmenin açıklaması olarak duruyor (`aria-describedby`), yani ekran okuyucu düğmeye varır varmaz okur.
- **Metin iki hâlli (koordinatörün verdiği tek cümle yetmedi):** düğme "açık taslak yok"ken pasif, "hiç taslak yok"ken değil. Haftada kayıtlı taslak varken "Save a named draft…" yanlış yönlendirirdi (yerel Meyhouse'ta tam bu durum var: "SR regression test" taslağı kayıtlı, açık değil). Taslak yoksa: "Save a named draft before publishing this week."; varsa: "Open a saved draft from New Schedule before publishing this week." (`views/SchedulePage.tsx:2445-2463`).
- Ortak `Tooltip` (`shell/Tooltip.tsx`, bugüne dek yalnız hayalet kartın konum iğnesinde) üç şey öğrendi: açıklamayı balon kapalıyken de taşır; başka bir denetimin görünümünü giyebilir (`unstyled`) ve `aria-disabled` / `data-*` geçirir; pencerenin tepesindeki tetikleyicide aşağı açılır ve yanlardan taşmaz. İkinci bir ipucu sistemi yazılmadı.
- Done when 6: `App.test.tsx` iki hücre ("says why Publish is unavailable…", taslaksız ve taslaklı) önce kırmızı; taslak açıkken düğmede `aria-disabled` ve açıklama yok (aynı dosya, yayın hücresi). `grep -c 'schedule-publish-action:disabled' styles.css` → 1. Not: web vitest'inde jest-dom yok; `toHaveAccessibleDescription` yerine Testing Library'nin `getByRole(…, { description })` sorgusu kullanıldı, aynı şeyi ölçer.
- Tarayıcıda ölçüldü (5630, `a8156980`): saydamlık 0,55, imleç `not-allowed`, balon düğmenin altında (üst 65px), sağ kenarı 1432px (pencere 1440), iki satır.

**BL-392 — düzeldi.** Schedule okunamayınca ("Schedule unavailable") artık üstte hafta gezinmesi kalıyor: önceki, sonraki, ortadaki düğme bu haftaya döner. Örnek: bir hafta sürekli hata verirse müdür soldaki okla önceki haftaya geçer; eskiden tek çıkış adres çubuğuydu.
- `views/SchedulePage.tsx:1849-1881`. Gezinme adres çubuğundaki tarihten çalışır; etiket o tarihi yazar ("Week of Sep 30, 2026"), okunamayan haftanın verisine dayanmaz. Erişim yok durumunda yalnız erişim-yok kartı çıkar (değişmedi).
- Done when 7: `App.test.tsx` yeni hücre (hata + Retry + gezinme; "Previous week" → adreste `date=2026-09-02`, okuma yeniden istenir, ızgara gelir) önce kırmızı; erişim-yok hücresine "gezinme yok" beklentisi eklendi.

**BL-345 — düzeldi.** Hızlı düzenleyicideki (vardiyaya çift tık) vardiya tipi çipleri dinlenirken görünür kenarlı: `#d6ded9` (beyaz üstünde 1,37:1) yerine `--theme-muted` `#66716c` (5,07:1; gereken ≥3:1). `styles.css:7480`.
- Done when 8: `ShiftQuickEditor.test.tsx` stil hücresi önce kırmızı; tarayıcıda üç çipin kenarı `rgb(102, 113, 108)`.

**BL-305 kalanı — düzeldi.** Unpublish penceresinde "Week" kartı artık aşağıdaki kutularla aynı genişlikte; dört Schedule penceresinin kapatma X'i tek boy (18px).
- Başlığın sağ boşluğu 48px → 24px (`styles.css:9228`); X 16 → 18 (`UnpublishScheduleDialog.tsx:98`, `SaveDraftDialog.tsx:115`). Yeni kural yazılmadı.
- Done when 9: tarayıcıda kartın sağ kenarı 955px, lokasyon listesinin sağ kenarı 955px (fark 0; önce 931 / 955). grep dört satırda `size={18}`. `UnpublishScheduleDialog.test.tsx` hücresi önce kırmızı.

**İnceleme bulgusu 1 — düzeldi, önerilenden farklı yerde.** Öneri `onCancel`'ı yalnız `preventDefault`'a indirmekti. Gerçek tarayıcıda (Chromium 149) denedim, sonuç başka çıktı:
- Escape tuşunun varsayılanı engellenirse yerel pencere `cancel` almaz; engellenmezse alır. Ortak kanca silahlı düğmede kenara çekilirken varsayılanı engellemiyordu: tarayıcı `cancel` gönderiyor, üstelik art arda birkaç engellenmiş `cancel`'dan sonra pencereyi kendisi kapatıyor.
- `cancel` anında "odak silahlı düğmede mi" diye bakmak da güvenilir değil: düğme o an çoktan inmiş oluyor.
- Çare kancada tek satır (`schedule/lib/useCloseOnEscape.ts:18`): silahlı düğmede de tuşun varsayılanı alınır, olay düğmeye yine ulaşır. Ölçüm: düğme Escape'i görüyor, `cancel` yok, pencere üç basışta da açık. `onCancel` olduğu gibi kaldı: Escape dışı kapatma isteklerinde (ör. Android geri hareketi) "keep editing" doğru cevap.
- Hücre: `ScheduleSaveRecoverySheet.test.tsx` (silahlı düğmede Escape'in varsayılanı alınmış) önce kırmızı.
- Sınır: mekanizma yalın bir yerel pencerede ölçüldü; kurtarma penceresinin kendisi gerçek uygulamada açılmadı (açmak için düzenleme oturumunda kayıt hatası üretmek gerekiyor).

**İnceleme bulgusu 2 — ölçüldü, düzeldi.** Birleşik (Merged) düzende tek lokasyon olabiliyor: ızgara grubu süzülmüş lokasyonlardan kuruyor (`ScheduleGrid.tsx:181-184`), yani süzgeç tek lokasyona indiğinde ya da tek lokasyonlu workspace'te `?layout=unified` ile. O grup artık kaynağın saat dilimini alıyor (`scheduleGridLayout.ts:80`); birden çok lokasyonda eskisi gibi boş. Hücre `scheduleGridLayout.test.ts`, önce kırmızı.

**BL-440 eki (kullanıcı kararı 2026-09-30) — düzeldi.** Schedule'da kayıt başarısız olunca açılan "Schedule save failed" penceresinde Discard artık iki tık: ilk tık düğmeyi kırmızıya çevirir ve "Confirm discard" yazar, ikinci tık değişiklikleri atar. Örnek: müdür yanlışlıkla Discard'a basar; hiçbir şey silinmez, düğme kırmızı bekler; Escape'e basınca eski hâline döner.
- `ScheduleSaveRecoverySheet.tsx:114-135` (ortak `ConfirmButton`, UI-12), kırmızı hâl `schedule-save-recovery.css:95-99` (`--theme-danger`). Dinlenirken düğme beyaz kalıyor (buton dili: ilk tık kırmızıya çevirir).
- Escape: inceleme bulgusu 1'in düzeltmesi (yukarıda, kancada) bunu taşıyor; `onCancel`'a dokunmak gerekmedi.
- **Gerçek tarayıcıda denendi** (Chromium 149; gerçek pencere bileşeni, gerçek kanca ve yerel `<dialog>`, geliştirme sunucusunda düz bir sayfaya takılarak): ilk tık → "Confirm discard", zemin `rgb(184, 66, 52)`, hiçbir şey çağrılmadı. Silahlıyken Escape → düğme indi, pencere açık, "keep editing" çağrılmadı. İkinci Escape → "keep editing" bir kez. Yeniden silahla + ikinci tık → "discard" bir kez.
- Hücreler: `ScheduleSaveRecoverySheet.test.tsx` iki hücre (iki tık; ilk Escape indirir, ikincisi kapatır) önce kırmızı.
- **Sınır ve gözlem:** pencere gerçek Schedule sayfasının kayıt akışından açılmadı. Düzenleme oturumunu tarayıcı betiğiyle başlatamadım (hücreye çift tık betikte oturum açmadı); yerel DB'ye hiçbir şey yazılmadı. Deneme sırasında şunu gördüm: sayfadaki başka bir işleyici basışı yutarsa odak Discard'a geçmiyor; o durumda Escape düğmeyi indirmek yerine pencereyi kapatıyor ("keep editing"). Güvenli yöne düşüyor (hiçbir şey silinmez). Gerçek sayfada bu, basış anında sağ üstte bir menü açıksa olabilir (`views/SchedulePage.tsx:2143-2158`, ilk basış menüyü kapatır ve yutulur; eski davranış, üç düğme için de geçerli). `nf-gorsel-qa` gerçek akışta bir kez denemeli.

**Üst çubuğun ortak kenarı — token.** `#aeb9b4` → yeni `--theme-border-control` (`styles.css:51`, `:3521`), değer aynı; tarayıcıda kenar `rgb(174, 185, 180)`. **KARARLAR'a yazılacak:** `--theme-border-control` `#aeb9b4`, Schedule üst çubuğundaki bütün denetimlerin kenarı.

**İnceleme düzeltmeleri (bağımsız inceleme @`c6a27136`: değişiklik istendi; üçü de yapıldı).**
1. **Balon açıkken Escape iki katmanı kapatıyordu — doğrulandı, düzeldi.** Tarayıcıda yeniden üretildi (Chromium 149, 5630): gelecek hafta (`?date=2026-10-07`), Tab ile pasif Publish, balon açık, Escape → balon kapandı VE adres `?date=2026-09-30&view=week` oldu (bu haftaya sıçradı). Neden: balonun dinleyicisi belgede, sayfanınki pencerede; ikisi de aynı basışı alıyordu. Çare `shell/Tooltip.tsx`: balon açıkken Escape orada durur (`stopPropagation`). Sonra ölçüm: ilk Escape → balon kapandı, hafta yerinde (`?date=2026-10-07`); ikinci Escape → sayfanın kendi kuralı (bu haftaya döner). Hücre `Tooltip.test.tsx` ("keeps the Escape that closes the bubble from reaching the page"), önce kırmızı.
2. **Kenara yakın kısa balon tetikleyicisinden kopuyordu — doğrulandı, düzeldi; ölçüm incelemenin tahmininden kötüydü.** Gerçek `Tooltip`, pencerenin sağ kenarına yakın bir iğneyle (merkez 1406px, balon "Patio" 45px): balonun merkezi 1312px'teydi, **94px solda** (1440 ve 390 genişlikte aynı). Çare: yan sınır artık balonun ölçülen yarı genişliğine göre (`useLayoutEffect` ile ölçüm, 8px hava). Sonra: fark 0px, balonun sağ kenarı 1428px (1440'ta) ve 378px (390'da). Uzun balon (pasif Publish) eskisi gibi içeri çekiliyor. Hücre aynı dosyada, önce kırmızı. Sınır: ölçüm gerçek bileşen düz bir sayfaya takılarak yapıldı; Pazar sütunundaki hayalet kartın kendisi üstünde değil (yerel haftada hayalet kart yok).
3. **Küçük ikiz — giderildi.** `jumpToCurrentPeriod` erken dönüşün üstüne taşındı (`views/SchedulePage.tsx:798`), hata durumu onu kullanıyor (`:1869`). Yeni hücre hata durumundan "bu haftaya dön"ü sabitliyor (`App.test.tsx`, davranış değişmediği için önce de yeşildi).

**Görsel QA düzeltmesi (`nf-gorsel-qa` @`c6a27136`: tek madde; `313ab090`).**
- **Bulgu:** "Schedule save failed" penceresi açıkken fareyle ilk basış yutuluyor, arkadaki sayfa düzenlenen haftadan bu haftaya atlıyor, Discard ancak ikinci tıkta kırmızı oluyor.
- **Önce yeniden ürettim** (Chromium 149, gerçek akış: Meyhouse, 9–15 Kasım, New Schedule (blank) → Publish → ad → Save As, kayıt isteği tarayıcıda kesildi): pencere açık, Discard'a ilk tık → adres `?date=2026-09-30&mode=edit&view=week`, hafta "Sep 28 – Oct 4", düzenleme çubuğu yok, düğme hâlâ beyaz "Discard". QA'nın gördüğünün aynısı.
- **Kök neden (eski, bu dalın getirdiği değil):** sayfa, boş yere basışı "bir katmanı kapat" diye okuyor (seçim, süzgeç, en sonda "bu haftaya dön"). Neyin pencere olduğunu `role` özniteliğinden tanıyordu (`schedule/lib/scheduleInteractionTargets.ts`, `[role='dialog']`). Kurtarma penceresi yerel bir `<dialog>`: rolü var, özniteliği yok. İçindeki her basış "boş yer" sayılıyordu; sayfa haftayı değiştirip basışı yutuyordu. QA'nın tahmini (Publish'in kayıt paneli açık sayılıyor) neden değil: panel kayıt düşünce kapanıyor (testte ölçüldü, `aria-expanded` false).
- **Düzeltme, en dar hâliyle:** "pencere nedir" tek bir seçici oldu (`SCHEDULE_WINDOW_SELECTOR`: yerel `dialog`, `role="dialog"`, `role="alertdialog"`; `scheduleInteractionTargets.ts:6`). Boş-basış kuralı (`:81`), iki komşu kural (`:46`, `:179`) ve sayfanın iki tıklama istisnası (`views/SchedulePage.tsx:499`, `:2181`) onu kullanıyor. Pencerelere, dinleyiciye ve kurtarma penceresinin kendisine dokunulmadı.
- **Sonra, aynı gerçek akışta:** Discard'a ilk tık → kırmızı "Confirm discard", adres `?date=2026-11-11&mode=edit`, hafta "Nov 9 – Nov 15", düzenleme çubuğu yerinde. Escape → düğme indi, pencere açık. Keep editing'e fareyle tık → pencere kapandı, hafta ve düzenleme yerinde. Ayrı koşuda Discard + Confirm discard (iki tık) → oturum bırakıldı (`DELETE /schedule/edit-lock/release`), önizlemeye dönüldü.
- **Hücreler (önce kırmızı):** `scheduleInteractionTargets.test.ts` ("never treats a press inside a window…": yerel dialog, alertdialog, dialog); `App.test.tsx` ("gives the first mouse press inside the save recovery sheet to the sheet": bir hafta ileride düzenleme, kayıt düşer, Discard'a `pointerdown` + tık → basış engellenmedi, "Confirm discard", adres aynı hafta ve `mode=edit`). App hücresi düzeltme geri alınınca kırmızı, geri konunca yeşil (ikisi de koşuldu).
- **Aynı dinleyiciden etkilenen öteki pencereler, tek tek:**

  | Pencere | İçine basış (düzeltmeden önce) | Şimdi |
  |---|---|---|
  | Kurtarma penceresi ("Schedule save failed", yerel `<dialog>`) | yutuluyor, hafta atlıyor | düzeldi (tarayıcıda ölçüldü) |
  | "Delete selected shifts?" ve "Discard unsaved changes?" onay pencereleri (`views/SchedulePage.tsx:3491`, `:3547`, `role="alertdialog"`, sayfanın içinde) | aynı kusur: basış sayfaya "boş yer" diye gidiyordu (tık geçiyordu ama arkada katman kapanıyordu) | düzeldi (birim hücresi; tarayıcıda denenmedi) |
  | Ortak onay penceresi (`shell/ConfirmDialog.tsx`, "Overwrite…?") | etkilenmiyordu: sayfanın dışına (body) çiziliyor, kural onu zaten "boş yer" saymıyor | değişmedi |
  | Publish, Unpublish, Save draft, Templates, Export, logo, Edit schedule, geçmiş vardiya uyarısı, kilit ve zaman aşımı pencereleri (`role="dialog"`) | etkilenmiyordu: öznitelik var | değişmedi |

- **Aynı ailede, düzeltilmedi (koddan okundu, tarayıcıda denenmedi):** pencerenin dışındaki karartılmış alana (arka plan) basış hâlâ sayfanın kuralına gidiyor. Sayfanın bildiği pencerelerde (Publish, Unpublish, Save draft, Templates, logo, Auto-fill) kural o pencereyi kapatıyor, sonuç doğru. Bilmediği pencerelerde (Edit schedule, geçmiş vardiya uyarısı, kilit, zaman aşımı, yukarıdaki iki onay penceresi) ilk basış arkadaki bir katmanı kapatıp tıkı yutabilir. İstenen "pencerenin içindeki basış"tı; arka plan ayrı karar. (leave: medium / do: moderate)
- **Gözlem:** Discard onaylanınca sayfa önizlemeye ve bu haftaya dönüyor (`?date=2026-09-30&mode=preview`), düzenlenen haftada kalmıyor. Eski davranış mı, istenen mi bilmiyorum; dokunmadım.
- **Yerel DB:** kalıcı veri yazılmadı. Kayıt isteği tarayıcıda kesildi; denemelerde açılan düzenleme oturumu uygulamanın kendi Discard'ıyla atıldı. Son durum (SELECT): 9 Kasım haftasında "active" oturum 0, "G14 mouse check" adlı taslak yok.
- Görüntüler: `before-realflow-1-sheet-open.png`, `before-realflow-2-first-click.png` (düzeltme geçici olarak çıkarılmış hâl), `after-realflow-1…4`.
- e2e yeniden tarandı: "alertdialog", "Schedule save failed", "Keep editing" e2e'de geçmiyor.

**Kaçırdığım iki e2e teması (benim hatam).**
- Dilim a: `e2e/flows/schedule-multi-location.spec.ts:92` eski çoğul metni bekliyordu; "e2e'de etkilenen beklenti yok" yazmıştım, dal CI'ını kırdı (koordinatör düzeltti, `d411d7a8`).
- Dilim b: aynı dosyanın `:75` satırı (`not.toContainText("Besiktas")`) düşecek, çünkü ipucu artık açıklamasını gizli bir öğede taşıyor ve Playwright gizli alt öğenin metnini de sayıyor. Raporumdaki "ipucu balonu bekleyen senaryo yok" cümlesi yanlıştı: aramam bu dosyayı bulmuştu, eşleşen satırı açıp okumadım. e2e dosyasına dokunmadım; koordinatör toplu dalda düzeltecek (`{ useInnerText: true }`).
- Bu düzeltmelerden sonra `e2e/flows` yeniden tarandı (değişen her metin ve denetim için): `:75` dışında yeni eşleşme yok. "Discard", "Schedule save failed", "Schedule unavailable", pasif Publish'in iki cümlesi e2e'de geçmiyor; `:76-77` iğneye basıp balonda "Besiktas" arıyor, bu davranış duruyor.
- Ders rol hafızasına yazıldı (`.claude/agent-memory/nf-arayuz/`, `63ba9171`): metin ya da gizli metin değişince `e2e/` içinde `toContainText` / `getByText` ikizini ara; eşleşen satırı açmadan "yok" deme.

**Kapı** (görsel QA düzeltmesinden sonra, `313ab090`'ın kodu üzerinde, `origin/main` `d411d7a8`): web vitest tamamı 221 dosya, 1936 geçti, 1 atlandı, "Unhandled" yok (104 sn); typecheck temiz; lint 0 hata, 20 eski uyarı; build başarılı.

**Önceki kapı** (rebase'den sonra, `993ee979`):
- web vitest tamamı: 221 dosya, 1934 geçti, 1 atlandı, "Unhandled" yok (115 sn). İlk koşuda bir hücre zaman aşımına düştü ("protects workspace routes and opens the authenticated shell", 25 sn, ekran yükleme durumunda kalmış); o sırada `nf-db` de ağır iş koşuyordu. Hücre tek başına geçti, kilit boşalınca bütün takım yeniden koşuldu: yeşil. Yük altında düşme sayıldı, kodla ilgisi görülmedi.
- `pnpm.cmd --filter @newfork/web typecheck`: temiz. `pnpm.cmd lint`: 0 hata, 20 uyarı (hepsi eski). `pnpm.cmd build`: başarılı.

## 3. Açık kalan ve nedeni
1. **U08 (936px'te üst çubuk).** Bu planda yok (kullanıcı, 2026-09-30: "şimdi değil, backlog'a"). Dilim b U08'siz kapanır.
2. **Etkilenen e2e yerelde koşturulmadı** (`schedule-publish`, `schedule-locks`, `schedule-multi-location`; görev dosyası Done when 12). Kapı zamanı `db.lock` `nf-db/emp-001-b1`'deydi; koordinatörün dilim b düzeninde e2e yok, dal CI'ı koşacak. `e2e/flows` okundu: yayın senaryosu Publish'e düzenleme oturumunun içinden basıyor, pasif düğme yolundan geçmiyor; pasif Publish ya da hata durumu bekleyen senaryo yok. **Düzeltme: ipucu balonuna dokunan bir senaryo VAR (`schedule-multi-location.spec.ts:75`), ilk raporda kaçırdım; bkz. "Kaçırdığım iki e2e teması".**
3. **Test değişikliği notu.** Hayalet kart testindeki "ekranda 'Patio' yazmıyor" beklentisi görünür metne daraltıldı (`{ ignore: "[hidden]" }`): ipucu artık açıklamasını gizli bir öğede de taşıyor. Yanına "iğnenin açıklaması Patio" beklentisi eklendi. Amaç (konum adı kartta yazmaz) korunuyor.
4. **KARARLAR kaydı** kayıt oturumunda: `--theme-border-control`; "Ekran kararları → Schedule": pasif Publish nedenini söyler (iki cümle), hata durumunda hafta gezinmesi kalır; tek kapatma boyu 18px; "ortak Escape kancası silahlı düğmede de tuşun varsayılanını alır".

## 4. Ekranda ne değişti
- **Schedule üst çubuğu:** Publish, basılamazken soluk; üstüne gelince ya da klavyeyle varınca altında neden balonu.
- **Schedule, okuma hatası:** hata kartının üstünde ‹ "Week of …" › gezinmesi.
- **Hızlı düzenleyici:** vardiya tipi çiplerinin kenarı belirgin gri.
- **Unpublish penceresi:** "Week" kartı sağa 24px uzadı; X biraz büyüdü. Save draft penceresinde X aynı boya geldi.
- **Hayalet vardiya kartının konum iğnesi:** balon pencere kenarında artık daralmıyor ve taşmıyor (ortak parça değişti; başka görünür fark yok).
- Telefon (390px): düzen aynı, yalnız Publish soluk.

Ekran görüntüleri (`artifacts/nf-arayuz/g14-b/`, 1440×900, light; her biri `before-` ve `after-`):
- `publish-passive-hover.png`, `publish-passive-focus.png` (önce hâlinde düğme odak alamadığı için odak görüntüsü düğmesiz)
- `error-state.png`
- `quick-editor-chips.png`, `quick-editor-chips-close.png` (geliştirme sayfası `/dev/schedule-shift-design`: gerçek ızgara ve düzenleyici, yerel örnek veriyle)
- `unpublish.png`
- `phone-topbar.png` (390×844)
- `recovery-sheet.png` (önce/sonra) ve `after-recovery-sheet-armed.png` (ilk tıktan sonra kırmızı "Confirm discard"); pencere geliştirme sayfasının üstüne takılarak çekildi, arka plan gerçek Schedule sayfası değil

Taklit edilen kısımlar: hata durumu için `reference` cevabı 500 yapıldı; Unpublish için `publication-status` cevabında iki lokasyon yayınlı gösterildi. Pasif Publish gerçek yerel veri (Meyhouse, taslak kayıtlı ama açık değil). Yerel DB'ye veri yazılmadı.

Erişilebilirlik gözden geçirmesi (WCAG 2.1 AA, yalnız bu dilimin değişiklikleri; `design:accessibility-review`):

| Öğe | Ölçüm | Sonuç |
|---|---|---|
| Pasif Publish: ad, rol, durum | "Publish", button, `aria-disabled`, açıklama sürekli | 4.1.2 geçer |
| Pasif Publish: klavye | Tab ile ulaşılır, görünür odak halkası, Enter/boşluk balonu açar, Escape kapatır | 2.1.1, 2.4.7 geçer |
| Neden balonu | beyaz / `#111827` ≈ 17,7:1; üstünde durulabilir, Escape ile kapanır | 1.4.3, 1.4.13 geçer |
| Pasif Publish'in solukluğu | beyaz yazı, zemin ≈ `#7c8088`, ≈ 4,0:1 | etkin olmayan denetim, 1.4.3'ten muaf |
| Çip kenarı | `#66716c` / beyaz 5,07:1 | 1.4.11 geçer |
| Çip yazısı | `#6b756f` / beyaz ≈ 4,8:1 | 1.4.3 geçer |
| Hata durumu | gezinme kartın önünde, sonra Retry; kart `role="alert"` | 2.4.3 geçer |

Oranlar elle hesaplandı. Ekran okuyucuyla (NVDA/VoiceOver) dinlenmedi.

## 5. Sırada ne var, yolda bulunanlar
Sıra: dilim a main'e girince `task/g14-b` `git rebase origin/main`; sonra koordinatörde tek bağımsız kod incelemesi ve `nf-gorsel-qa`, ardından main. Scratch harness (`apps/web/g14-recovery-harness.tsx`) geçiciydi, silindi; dalda yok (`git ls-files` 0).

Yolda bulunanlar (düzeltilmedi):
- **(leave: medium / do: moderate) Üst çubuktaki hafta düğmesinin adı, üstünde yazanla uyuşmuyor.** Düğmede "Sep 28 – Oct 4, 2026" yazıyor, erişilebilir adı "Weekly view" (`ScheduleTopBar.tsx`, `ScheduleViewModeControls`). Sesle kullanan kişi gördüğünü söyleyince düğme bulunmaz (WCAG 2.5.3). Eski davranış; hata durumundaki gezinme aynı parçayı kullandığı için oraya da taşındı. Ad değişirse testler ve e2e de değişir; ayrı iş.
- **(leave: low / do: safe) Pasif Publish'te fare-üstü rengi hâlâ oynuyor.** Ton kuralının `:hover`'ı pasif düğmede de çalışıyor; 0,55 saydamlıkta zor seçilir. BL-340 (ortak pasif kural, G15) gelince birlikte.
- **(leave: low / do: moderate) Üst çubuk denetimlerinin kenarı 2,0:1.** `#aeb9b4` beyaz üstünde; token'a bağlandı, değer aynı. Düğmeler yazılı olduğu için engel değil; 3:1'e çekmek bütün üst çubuğu değiştirir, önce/sonra ister.
- **(leave: low / do: safe) Hata durumunda hafta etiketi haftanın ilk gününü değil, adresteki günü yazıyor** ("Week of Sep 30", hafta 28'inde başlasa da). Bilerek: haftanın başlangıç günü okunamayan ayardan geliyor.
- **(leave: low / do: moderate) Yerel Meyhouse verisinde iki okuma ayrışıyor** (dilim a raporundan): ızgara okuması Garden Room'u yayınlı, `publication-status` yayınsız sayıyor; üst çubuk bu yüzden "Published" değil pasif "Publish" gösteriyor.
- Dilim a'dan taşınan: Publish ikinci adımdaki çift özet (koordinatör backlog'a aldı). Kurtarma penceresindeki tek tıklı Discard bu dilimde kapandı (BL-440).

Skills: `superpowers:test-driven-development` (her kalem önce kırmızı), `frontend-design:frontend-design` (yüklendi; iş mevcut dilin içinde kaldığı için yalnız metin ve sadelik ilkeleri işe yaradı), `design:accessibility-review` (yukarıdaki tablo), `superpowers:verification-before-completion` (bitişte ölçümler yeniden koşuldu).

Temizlik: dev sunucuları (5630/5631) kapatıldı, bu worktree'ye ait süreç kalmadı; `.claude/launch.json`'daki iki yerel girdi geri alındı; iki geçici harness dosyası silindi (dalda yok); kilit alınmadı. `task/g14-b` `origin/main` `d411d7a8` üstüne rebase edildi. `task/g14-a` dalı main'e girdi; silinmesi koordinatörde.
