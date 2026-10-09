# Pre-mortem — FOUNDATION-B Aşama 6, Schedule dilimi (FB-6.1)

Tarih: 2026-09-25 · Yazan: `nf-strateji` / `elestirmen` · İsteyen: Strateji lead'i
Kaynaklar: `docs/plan/tasks/FOUNDATION-B.md` (Aşama 6 → "1. Schedule", satır 144–162),
`docs/plan/handoffs/FOUNDATION-B-asama6-devir.md` bölüm 2, 3, 7, 8.
Ölçümler `origin/main` b6f484b üzerinde, 2026-09-25'te alındı. Kod yazılmadı, dosya değiştirilmedi.

> **Doğrulama (koordinatör, 2026-09-25, `27e2062`):** "34 kapı çağrısı" ve "56 çağıran" ölçümle aşıldı (80 ve 43 çağrı / 38 fonksiyon). "Schedule'da 0 `permissions.includes`" yalnız `apps/web/src/schedule/` için doğru; Schedule ekranlarında 10 tane var (SchedulePage 5, Requests 3, Templates 1, SchedulingSettings 1). `schedule/` 224 değil 229 dosya. Diğer olgular doğru. FB-6.1.md'de bugün hâlâ açık itirazlar: 2 (ghost'lar dışa aktarmaya akıyor), 3 (katlamadan önce ölç), 4 (yöneticiye izin kısaltma; kullanıcı kararı), 6 (duvar saati / `db.lock` bekleme). 1, 5, 7 kısmen; F1–F3 BL-121/122/123 oldu.

**Senaryo:** Bugün 2026-12-25. Schedule dilimi "başarısız" sayıldı. Aşağıdakiler sebepleri.
Cevabı zaten planda olan itirazlar yazılmadı.

---

## İtiraz 1 — Pilot, tarifin iki adımını hiç çalıştırmıyor; o yüzden "bütün tahminin yeniden yapılması" yanlış sayı üretir

**Kanıt.** Dilim kalıbı (plan satır 145) iki web adımı içeriyor: "domain'in `permissions.includes`
kontrolleri `can()`'e geçer" ve "her uç için tek yardımcı `isNoAccess(e)`".

- `permissions.includes` web'de 54 satır; **Schedule'da 0 satır**
  (`grep -rn "permissions.includes" apps/web/src/schedule` → boş).
- `isNoAccess` reponun hiçbir yerinde yok (`grep -rn "isNoAccess" apps/web/src packages` → 0 sonuç).
- `apps/web/src/auth/can.ts` yok (`ls apps/web/src/auth/` → AuthContext, PermissionRoute,
  ProtectedRoute, resolveLanding, tenant-query-cache). Plan satır 170 bunun "Aşama 4 sonunda
  geleceğini" söylüyor; gelmemiş.
- Buna karşılık Schedule aşırı temsil ediliyor: `apps/api/src/schedule/schedule-routes.ts` **3463
  satır** ve tek başına 34 kapı çağrısı taşıyor; `apps/web/src/schedule` altında **224 dosya**;
  37 `_base`/`_vN`/`_legacy` fonksiyonun **24'ü** Schedule'ın (devir notu bölüm 3).
- e2e tarafı da tek seferlik: bugün `e2e/flows/` altında **3 senaryo** var
  (`schedule-locks`, `shift-hub-swap`, `sign-in-lands`). Dilim 1'in kabul kriteri plan satır
  151–152'deki **iki akış** (Schedule yayını + çok lokasyonlu yayın) — 10 akışın en zor ikisi.

**Etki.** Dilim bitince ölçülen süre üç farklı şeyi tek sayıda topluyor: (a) bütün program için bir
kez yapılan altyapı (`can.ts`, `isNoAccess`, çok lokasyonlu e2e iskeleti), (b) yalnız Schedule'a
özgü hacim (3463 satırlık route, 224 dosya, 24 `_base`), (c) her dilimde tekrar eden tarif. Bu sayı
7 dilime çarpılırsa altyapı 8 kez sayılır ve Schedule'ın hacmi her dilime yayılır. Kullanıcının
programa devam kararını verdiği sayı budur.

**Düzeltme.** İki adım:
1. `can.ts` + `isNoAccess` işini **dilimin dışına**, kendi küçük işine çıkar (ekran davranışı
   değişmez, tek yardımcı + ESLint kuralı). O zaman pilot temiz bir birim olur.
2. Dilim kapanışında süreyi üç kovada raporla: tek seferlik altyapı / Schedule'a özgü hacim /
   tekrar eden tarif. Yeniden tahmin yalnız üçüncüyü birim alsın, ikinciyi dilim başına ölçülen
   fonksiyon ve route sayısıyla ölçeklesin. Tek sayı verme.

---

## İtiraz 2 — "İmzalar aynı kalır, tek görünür değişiklik 42501" iddiası ghost vardiyada kırılıyor; kırıldığı yer duvara asılan çizelge

**Kanıt.** Ghost vardiya yalnız ekran bileşeni değil, dışa aktarma modelinin parçası:

- `apps/web/src/schedule/hooks/useCellState.ts:98` hücreye ghost ekliyor, `:244` `ghost: true`
  işaretini basıyor.
- `apps/web/src/schedule/export-v2/snapshot.ts:169-172` ghost'ları dışa aktarma anlık görüntüsüne
  ayrı bir `ghosts` dizisi olarak koyuyor; oradan `excel.ts`, `document.ts`, `badge-text.ts`,
  `ExportPreview.tsx` besleniyor.

Karar (plan satır 46, 162): okuma modeli, lokasyonla sınırlı yöneticinin gördüğü kişilerin **başka
lokasyondaki** vardiyalarını da döndürecek. Fonksiyon imzası aynı kalır — ama aynı çağrı aynı
yöneticiye **daha çok satır** döner.

**Etki.** Bir şube müdürünün bugün ürettiği haftalık PDF/Excel'de yalnız kendi lokasyonu var.
Dilimden sonra aynı düğme, aynı imza, aynı uç — çıktıda başka lokasyonun vardiyaları beliriyor. Bu
"hayır cevabının biçimi" değil; restoranın duvara astığı ve çalışanlara dağıttığı belgenin
değişmesi. Dilim kapsamı bunu ne görsel karar ne ürün kararı olarak sayıyor; sessizce gelir ve
kullanıcı ilk defa dışa aktarmayı denediğinde görür.

**Düzeltme.** Ghost'un ekrana gelmesi ile dışa aktarmaya gelmesi **iki ayrı bayrak** olsun. Dışa
aktarmada varsayılan KAPALI, export ayarlarında açılabilir kutu. Karar kullanıcının; ama karar
alınmadan okuma modeli değişmesin — çünkü değiştiği an çıktı da değişmiş olur.

---

## İtiraz 3 — Ghost genişletmesi ile ≤50 ms okuma bütçesi aynı dilimde çarpışıyor ve bütçe bir CI kapısı

**Kanıt.** `supabase/tests/schedule_grid_read_budget.test.sql` `ci-green.txt` içinde; devir notu
bölüm 2: "Izgara okuma bütçesi: CI'da her gönderimde <50 ms". Ghost kuralı okuma modelinin filtresini
"bu lokasyonun vardiyaları"ndan "bu kişilerin **her** lokasyondaki vardiyaları"na çeviriyor —
lokasyon filtresi kişi filtresine dönüşüyor. Aynı dilimde okuma zinciri 4 fonksiyondan 1'e iniyor.

**Etki.** Dilimin sonunda bütçe testi kırmızıya düşerse sebep izole edilemez: birleştirme mi, ghost
mu, ikisinin birleşimi mi. Geri alma birimi dilimin tamamı olur. Ayrıca `ci-green.txt`'ten satır
çıkarmak yasak (devir notu bölüm 7), yani "şimdilik listeden al" kaçışı yok.

**Düzeltme.** Ghost genişletmesini **zincir birleştirmeden önce**, bugünkü 4 fonksiyon üzerinde tek
başına yap ve bütçeyi ölç. Yeşilse devam. Değilse, birleştirmeye girmeden kullanıcıya somut soru
gider (ghost'u kaç lokasyona / kaç kişiye kadar döndürelim). Ölçüm bir kez, tek değişkenle alınır.

---

## İtiraz 4 — "Onaylı izin her zaman engel" yöneticiye çıkışsız bir kapı bırakıyor ve ürünü kendi içinde asimetrik yapıyor

**Kanıt.**

- Bugün ayar iki değer alıyor: `conflict_rules->>'approved_time_off' in ('confirm','block')`
  (`supabase/migrations/20260915081826_bl064_conflict_severity.sql:12`), **varsayılan `block`**
  (aynı dosya satır 4). Yani ayarı `confirm`e çekmiş bir restoran bunu bilerek yapmıştır — kaza
  değil.
- Ekrandaki satır: `apps/web/src/settings/ConflictHandlingSettingsPage.tsx:31-35`,
  "Approved time off — Assignments that overlap approved leave", seçenekler `["confirm","block"]`.
- Aşama 0 kararı (plan satır 58): çalışan, takas/pickup/cover'da **kendi onaylı iznini** yalnız
  bilgilendirme onayıyla ezebiliyor; izin o saatler için kısalıyor (satır 59).

**Etki.** Dilimden sonra çalışan kendi izinli gününe vardiya alabiliyor, ama yönetici aynı çalışanı
aynı güne — çalışan telefonda "olur" dese bile — **yazamıyor**. Cumartesi biri hasta olunca
yöneticinin tek çıkışı izni iptal etmek; izin iptali de çok lokasyonlu oy akışına bağlı (plan satır
47). Yönetici bunu bir kez yaşayınca "izni iptal et, sonra yaz" alışkanlığını edinir. ABD'de PTO
kaydı bordroya girdiği için bu sessiz bir veri kaybıdır: izin kullanılmış gibi görünmez, çalışanın
bakiyesi yanlış kalır. Ayarı bugün `confirm` tutan restoran, ayarın yanına bir açıklama bile
çıkmadan seçeneğini kaybeder.

**Düzeltme.** Engel kalsın, ama yanına **yöneticinin tarafındaki karşılığı** konsun: "izni bu vardiya
saatleri kadar kısalt ve ata" eylemi — çalışan tarafında zaten var olan davranışın aynısı (plan
satır 59), izni onaylayan yöneticiye bildirimle. Asimetri kapanır, kayıt korunur, ayar yine kalkar.
Bu bir ürün kararı; kullanıcıya iki seçenekle sorulmalı (A: engel + izin kısaltma eylemi,
B: engel, başka çıkış yok). Öneri: A. "Ayar kalkar, yerine hiçbir şey gelmez" hali sahada çalışmaz.

---

## İtiraz 5 — Paket, iki güvenlik açığını dilimin en yavaş parçasına bağlıyor

**Kanıt.** E1 (devir notu bölüm 3): zorunlu belgesi eksik yönetici Schedule'da **yazıp
yayınlayabiliyor**, çünkü API kapısı (`schedule-routes.ts` `managerContext`, satır ~3195) yalnız
`context.membership.role !== "employee" && context.permissions.includes(permission)` bakıyor —
belge engeline ve kurulum durumuna bakmıyor (kod okundu, doğrulandı). E2: eski yardımcılar boş
lokasyona "her yer" diyor, 56 çağıran null geçiyor.

Aynı dilimde ekran turu var ve tur kullanıcının müsaitliğine bağlı (plan satır 159, devir notu
bölüm 3 son madde). Plan satır 158: "ekranı geride kalan dilim birleşmez" — yani dilim main'e tek
parça girer. Devir notu bölüm 8.3 E1+E2'yi "tur beklenirken" yapmayı öneriyor, ama gönderimi
beklemek zorunda.

**Etki.** Yazma yetkisi açığı, bir **görsel kararın** beklemesi yüzünden dilim boyunca açık kalır.
Bugün hosted'da gerçek veri yok, o yüzden bu bir olay değil; ama dilim süresi ABD lansmanına doğru
uzarsa açık canlıya taşınır. Plan satır 160 zaten "görsel kararlar programı durdurmaz" diyor —
burada tersi oluyor, görsel karar güvenliği durduruyor.

**Düzeltme.** E1+E2'yi dilimden ayır, kendi küçük işi olarak main'e gönder: API kapısı
`authorize()`'a, 56 çağıran `scope_set()`'e, eski üç yardımcı silinir. Ekran değişmiyor, imza
değişmiyor, `known_gap: legacy-blank-location` satırı orada kalkar. Dilim geri kalanla devam eder.
Bu aynı zamanda İtiraz 1'in ölçüm sorununu da azaltır: güvenlik işi ayrı ölçülür.

---

## İtiraz 6 — Paylaşılan yerel DB pilotun süre ölçümünü doğrudan bozuyor; ve ölçülen sayı programın devam kararı

**Kanıt.** Devir notu bölüm 7: pgtap yerelde kalıcı kurulu değil, her test transaction'ı onu
kuruyor, "paralel oturumların koşuları sıraya giriyor (**50+ sn bekleme görüldü**)"; BL-120: web tam
test koşusu pgTAP listesiyle paralel koşunca **9 test zaman aşımına düştü**. Yerel DB tek konteyner
(`supabase_db_newfork-clean`) ve artık **üç takım** aynı anda kullanıyor (CLAUDE.md bölüm 7).
Schedule'ın yeşil listede 14 test dosyası var (`grep -i schedule supabase/tests/ci-green.txt`), yani
bu dilim en çok pgTAP koşan dilimlerden biri.

**Etki.** Pilotun "ne kadar sürdü" sayısı üç takımın birbirini beklemesini içerir. Bu sayı 7 dilime
çarpılınca program tahmini uydurmaya döner — ve İtiraz 1'deki kirlenmeyle aynı sayının üstüne biner.
İkinci kayıp: `db.lock` sırası uzadıkça dilim içindeki "önce kırmızı test" disiplini pahalılaşır ve
kestirmeye (testi sonra yazma) itiliyor.

**Düzeltme.** Dilim boyunca **iki saat** tut: duvar saati ve `db.lock` bekleme süresi — kilit
dosyasına başlangıç zamanı zaten yazılıyor (CLAUDE.md bölüm 7), bırakırken de yaz. Yeniden tahmin
duvar saatinden beklemeyi düşerek yapılsın; bekleme **ayrı bir kalem** olarak raporlansın, çünkü
çözümü tahmin değil altyapı (takım başına ya da runner başına ayrı DB). Bekleme toplamı dilimin
%15'ini geçerse bu kendi başına bir iş olarak backlog'a girer.

---

## İtiraz 7 (daha basit alternatif) — aynı sonuca daha az riskle: dilimi dörde böl, aşamayı bölme

Dilim bugün tek parça: güvenlik düzeltmesi + fonksiyon birleştirme + ürün kuralı değişikliği +
görsel iş. Dördü de aynı main gönderimini bekliyor. Önerilen bölme, **aynı aşamada kalarak**:

| Parça | İçerik | Ekran davranışı değişir mi | Ne zaman gidebilir |
|---|---|---|---|
| a | E1 + E2 (API kapısı `authorize()`'a, 56 çağıran `scope_set()`'e, 3 yardımcı silinir) | Hayır | Bugün |
| b | Ghost genişletmesi + export bayrağı kararı + ≤50 ms ölçümü | Evet (ızgara + çıktı) | Karar gelince |
| c | Dört zincirin teke inmesi (okuma 4→1, düzenleme 5→1, kaydetme 5→1, yayın 9→1) | Hayır | b'den sonra |
| d | Ürün kuralları (onaylı izin, BL-062) + ekran turu + görsel varyantlar | Evet | Tur olunca |

Plan satır 158'in "ekranı geride kalan dilim birleşmez" kuralı korunur, çünkü **a ve c ekran
davranışını hiç değiştirmiyor** (imza aynı, dönüş şekli aynı, tek fark "hayır"ın biçimi) ve b ile d
kendi içlerinde tam. Kazanç üç tane: main'e her girişte kırılabilecek şey tek; bütçe ölçümü tek
değişkenle alınır (İtiraz 3); pilot dört temiz sayı üretir, tek bulanık sayı yerine (İtiraz 1).

Kayıp: dört rebase + dört kapı koşusu, yaklaşık yarım gün ek. Karşılığında dilimin geri alma birimi
dörtte bire iner.

---

# FİKİR — dilim zaten Schedule'a dokunuyorken, MVP'ye (self-serve ücretli ABD lansmanı) hizmet eden 3 ucuz fikir

Üçü de **BACKLOG adayıdır, dilim kapsamına eklenmez.**

### F1 — Yayın önizlemesinde haftalık saat özeti (kişi başı toplam + 40 saat eşiği)
Yayınlamadan önce "bu hafta kim kaç saat" ve 40 saati aşanların işaretlenmesi. Zorlama yok, yalnız
gösterim.
- **Etki: yüksek.** ABD restoranında fazla mesai, yöneticinin çizelgeye bakarken cevabını aradığı
  bir numaralı soru; ücretli bir ürünün satın alma gerekçesi doğrudan bu. Self-serve denemede
  "bu şey bana para kazandırıyor" anını üretir.
- **Efor: düşük–orta.** Yayın önizlemesi zaten var (`preview_schedule_publication_service`); saatler
  zaten hesaplanıyor (`every_shift_has_hours` migration'ı her vardiyaya saat zorunlu kıldı).
- **Risk: düşük.** Salt okuma, kural zorlamıyor, yanlış hesaplarsa yalnız bir sayı yanlış görünür.
- **Şimdi mi?** Kapsam: MVP sonrası. Ama dilim yayın zincirini **9 fonksiyondan 1'e** indiriyor —
  o tek fonksiyonun dönüş şeklinde bu özet için yer bırakmak bugün bedava, sonra tekrar açmak pahalı.
  Öneri: fikri şimdi yapma, ama yayın önizlemesinin sözleşmesini tasarlarken bunu bil.

### F2 — Kurulumdan çıkan owner'ı boş ızgarayla karşılamama: "örnek hafta" + tek tık temizle
Owner sihirbazı bitirince Schedule boş açılıyor. Onun yerine, kendi lokasyon/job/kişileriyle
doldurulmuş, açıkça "Example" etiketli, tek düğmeyle silinen bir örnek hafta.
- **Etki: orta–yüksek.** Self-serve'de ilk değere kadar geçen süreyi kısaltır; boş ekran, ücretsiz
  denemede en yüksek terk noktasıdır.
- **Efor: düşük.** Yalnız sunum katmanı olarak da yapılabilir (veri yazmaz, taslak bile değil).
- **Risk: düşük.** Tek gerçek risk örnek verinin gerçek sanılması — "Example" rozeti ve tek tık
  temizlemeyle kapanır. Veri yazmıyorsa tenant riski yok.
- **Şimdi mi?** MVP sonrası, ama **dilim 8 (onboarding)** ile eşleşir; dilim başı ekran turunda
  kullanıcıya gösterilip kararı orada alınabilir — tur zaten yapılacak, göstermek ücretsiz.

### F3 — Yayınlanan haftanın salt-okunur paylaşım linki
Yayınlanınca üretilen, süresi dolan, tek haftayı gösteren link. Çalışan hesap açmadan çizelgesini
görür.
- **Etki: yüksek.** Self-serve'de en büyük tıkanma, owner'ın ekibini davet edip kabul etmelerini
  beklemesi. Bu link o beklemeyi atlatır; owner tek başına değer görür.
- **Efor: orta.** Yeni bir uç, token, süre sonu, ayrı bir okuma yolu.
- **Risk: yüksek.** Kimlik doğrulaması olmayan bir okuma yolu, tam da bu programın kapatmaya
  çalıştığı yüzeyi yeniden açar; link yayılırsa kişi adları ve saatler dışarı çıkar.
- **Şimdi mi?** **MVP sonrası ve ancak Aşama 6 bittikten sonra.** Çekirdek yerine oturmadan
  kimliksiz bir okuma yolu açmak, programın hedefiyle doğrudan çelişir. Fikri kaydet, şimdi açma.

---

## Özet — en sert üç madde

1. **İtiraz 4** — "onaylı izin her zaman engel" yöneticiye çıkış bırakmıyor, üstelik ürün çalışana
   izin verdiği şeyi yöneticiye yasaklıyor. Sahada cevabı "izni iptal et" olur ve PTO kaydı bozulur.
   Kullanıcı kararı gerekiyor, dilim başlamadan.
2. **İtiraz 2** — "imzalar aynı, tek değişiklik 42501" iddiası yanlış: ghost vardiyalar dışa
   aktarmaya (`export-v2/snapshot.ts:169`) akıyor, yani basılı çizelge sessizce değişiyor.
3. **İtiraz 1** — pilot, tarifin web adımlarını (`permissions.includes` Schedule'da 0, `isNoAccess`
   ve `can.ts` repoda yok) hiç çalıştırmıyor ama repo'nun en büyük alanını çalıştırıyor; bu pilottan
   çıkacak tek sayı program tahminini yanlış kurar.
