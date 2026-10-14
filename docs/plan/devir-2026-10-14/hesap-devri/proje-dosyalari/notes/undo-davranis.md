# Schedule'da Undo: neyi geri alır, neyi almaz

Kaynak: `main` 9a9793e2 (Undo'nun son hâli, 2026-10-09). Yalnız okundu, kod değişmedi.
Kanıtlar en altta, GitHub bağlantısıyla. **(çıkarım)** yazan madde koddan okunarak çıkarıldı, onu doğrulayan test yok.

**Undo nerede:** Schedule → bir haftada **Edit** (düzenleme modu) → üstteki düzenleme şeridi → **Undo** düğmesi. Klavyede Ctrl+Z (Mac'te Cmd+Z). Bir yazı kutusunun içindeyken Ctrl+Z, Schedule'ın Undo'su değil, kutunun kendi geri almasıdır.

---

## Kısa cevap: başka sayfaya geçince eski sayfadaki değişikliği geri alır mı?

| Nereye geçtin | Undo ne yapar |
|---|---|
| **Başka hafta** | O haftada Undo düğmesi görünmez, Ctrl+Z de çalışmaz. Düzenlediğin haftaya dönünce Undo geri gelir ve orada yaptığın değişiklikleri geri almaya devam eder. Bir hafta, başka haftanın değişikliğini asla geri almaz. |
| **Aynı haftada başka konum** (Locations filtresi) | **Evet, geri alır.** Filtre yalnız görünümü değiştirir. Downtown'da yaptığın son değişiklik, ekranda yalnız Uptown açıkken bile Undo ile geri alınır ve ekranda hiçbir şey kıpırdamaz. **(çıkarım)** |
| Aynı haftada gün görünümü, iş ya da vardiya türü filtresi, "Hide Unscheduled" | Aynısı: görünmeyen yerdeki son değişiklik geri alınır. **(çıkarım)** |
| **Schedule'dan çıkıp** (ör. Employees) geri dönmek | Düzenleme sunucuda açık kalır. Aynı hafta ve aynı kaynak (yayınlanmış hafta ya da aynı taslak) için tekrar Edit'e basınca kaldığın yerden devam eder; Undo eski adımları hâlâ geri alır. **(çıkarım)** |
| Sayfayı yenilemek (F5) | Undo hafızası sunucuda; yenileme sonrası da aynen durur. |
| Aynı hafta, **farklı taslağı** düzenlemeye başlamak | Eski düzenleme kapanır (kaydedilmemişse "Auto-save" taslağı olur), Undo hafızası silinir. |

---

## 1. Undo'nun hafızası neye bağlı

- **Bir düzenlemeye bağlı.** Düzenleme = bir kişi + bir hafta + bir kaynak (yayınlanmış hafta, belli bir taslak ya da boş yeni taslak). O düzenlemenin tuttuğu **bütün konumlar tek hafızadır**; konuma, güne, görünüme göre ayrılmaz.
- **Kişiye özel.** Daniel Kim'in Undo'su Maria Lopez'in düzenlemesine asla dokunmaz (testi var).
- **Sunucuda durur**, tarayıcıda değil. Yenileme, başka sekme, başka bilgisayar aynı hafızayı görür.
- **Son 25 adım.** 26. adım gelince en eskisi düşer.
- **Sıra: en yeni önce.** Her basış bir adım geri.
- **Redo (ileri al) yok.** Geri alınan adım bir daha getirilemez; elle yeniden yapılır.
- **Bir adım = ekrandan sunucuya giden tek istek.** Bir şablon 24 vardiya eklese de tek Undo hepsini götürür; ya hepsi geri gelir ya hiçbiri (testi var).

## 2. Undo'nun geri aldıkları

Hepsi, açık düzenlemedeki vardiyalara yapılan değişikliklerdir:

| İş | Ekrandaki yer | Kaç adım |
|---|---|---|
| Vardiya ekleme (Add shift penceresi) | Hücredeki + düğmesi | 1 |
| Aynı vardiyadan birkaç tane ekleme (sayı > 1) | Add shift penceresi | 1 **(çıkarım)** |
| Vardiya düzenleme (saat, kişi, iş, not, etiket, mola) | Vardiyaya tıkla → pencere | 1 |
| Sürükleyip taşıma | Izgarada sürükle-bırak | 1 (testi var) |
| Kopyala-yapıştır | Ctrl+V / Paste mode | 1 (üç vardiyalık yapıştırma testi var) |
| Silme, seçilenleri toplu silme | Delete tuşu / şeritte "Delete N" | 1 |
| Yayınlanmış haftada silme işareti ve onu geri alma (Restore) | Vardiya menüsü | 1 (testi var) |
| Şablon uygulama | Templates penceresi | 1 (aynı mekanizma, ayrı testi yok) |
| Auto-fill | Auto-fill penceresi | 1 (aynı mekanizma, ayrı testi yok) |
| Varsayılan saatleri uygulama | Default hours penceresi | 1 **(çıkarım)** |
| Bekleyen değişiklikler listesinden bir değişikliği eklemek / kaldırmak | Yayınlanmış haftayı düzenlerken | 1 |

Kural: yeni bir "vardiya yazan" iş eklenirse, veritabanı testi o işi "adım mı, değil mi" diye sınıflamadan geçmez. Yani bugün listede olmayan bir yol sessizce Undo'ya girmez.

## 3. Undo'nun geri almadıkları

- **Kaydedilmiş her şey.** Save draft, Save & publish ve "Keep editing?" süresi dolunca yapılan Auto-save düzenlemeyi kapatır; hafıza silinir (KARARLAR: "Undo kaydedilmiş adımı geri almaz").
- **Discard** (düzenlemeyi atmak): hafıza silinir.
- **Yayınlama ve yayından kaldırma** (Publish / Unpublish schedule).
- **Taslak işleri:** taslak açma, yeniden adlandırma, silme.
- **İzin (time off) kararları, müsaitlik işaretleri, kapalı günler (Important dates), ayarlar, şablon kütüphanesi.**
- **Başkasının yaptığı ve senin açık düzenlemene dokunan işler:** onaylanan takas (swap), takas sonrası "Approved assignments restored", kapalı gün eklenmesi. Bunlar olunca Undo hafızan **tamamen silinir** (bilerek: Undo bunları geri almasın diye).
- **Düzenlemeyi açarken ya da genişletirken gelen vardiyalar** (yayınlanmış haftanın mevcut vardiyaları, yeni eklenen konumun vardiyaları) adım sayılmaz.
- **Ekran ayarları:** filtre, görünüm, sıralama, kolon gösterimi.

## 4. Durum durum

| Durum | Ne olur |
|---|---|
| Başka haftaya geçmek | O hafta görüntüleme modunda açılır; Undo ve Ctrl+Z orada yok. Kendi haftana dönünce düzenleme aynı kilitle sürer, hafıza aynen durur. |
| Başka haftada da Edit'e basmak | Yeni haftada yeni düzenleme ve boş hafıza başlar. Eski haftanın düzenlemesi kapanmaz, sunucuda açık kalır; o haftaya dönüp Edit'e basınca eski hafıza geri gelir. **(çıkarım)** |
| Konum, iş, vardiya türü filtresi; gün görünümü | Hafıza tek; görünmeyen yerdeki son adım geri alınır. **(çıkarım)** |
| Sayfayı yenilemek | Düzenleme ve hafıza aynen geri gelir (testi var). |
| Aynı kişi, iki sekme, aynı hafta | İki sekme aynı düzenlemeyi ve aynı hafızayı paylaşır: B sekmesindeki Undo, A sekmesinde yapılan son adımı geri alır. Aynı anda gönderilen iki adımda sıra doğru (son yazılan önce geri alınır, testi var). |
| Başka müdür aynı haftayı düzenliyor | Taslakta aynı anda tek kişi düzenler, öteki "şu kişi düzenliyor" görür. Yayınlanmış haftada iki müdür ayrı düzenleme açabilir; her birinin Undo'su yalnız kendininkini geri alır (testi var). |
| Yetkin daraldı (o konumu artık düzenleyemiyorsun) | Undo reddedilir, düzenleme kapanır (testi var). |
| 15 dakika hareketsizlik | "Keep editing?" çıkar; 15 saniye içinde cevap yoksa Auto-save: düzenleme kapanır, hafıza silinir. |
| Kilit süresi doldu (ör. bilgisayar uyudu) | Undo'ya basınca ekran düzenlemeyi aynı kişi için geri alır ve Undo'yu bir kez daha dener; hafıza durur. |
| Save draft / Save & publish / Discard | Hafıza silinir, Undo soluklaşır. |
| Geri alınacak adım artık bir kurala takılıyor (o arada onaylanan izin, eksik zorunlu belge) | Hiçbir şey değişmez ("ya hepsi ya hiçbiri"), "This step can no longer be undone." yazar. Adım hafızada kalır (bkz. Risk 2). |

---

## 5. Riskler ve hata adayları (her biri için önerilen test)

**R1. Görünmeyen değişiklik geri alınıyor, ne geri alındığı söylenmiyor.** **(çıkarım)**
Örnek: Daniel Kim Downtown ve Uptown'u birlikte düzenliyor. Downtown'da Maria Lopez'in Salı vardiyasını siler. Locations filtresini yalnız Uptown yapar, Noah Garcia'nın vardiyasını düzenlemeyi düşünürken Ctrl+Z'ye basar. Maria'nın Downtown vardiyası geri gelir; Daniel'in ekranında hiçbir şey değişmez, bildirim yalnız "Last edit undone" der.
Test: uçtan uca ekran testi: iki konumlu düzenleme → A konumunda silme → filtre B → Undo → A'daki vardiyanın geri geldiğini ve ekranın bunu söylediğini doğrula.
Not: bu bir tasarım kararı ister (bildirimde "Maria Lopez · Tue · Downtown" yazsın mı, ekran oraya mı gitsin, Undo yalnız görünen yerde mi çalışsın).

**R2. Geri alınamayan adım Undo'yu kilitliyor.**
En son adım bir kurala takılırsa (o arada onaylanan izin, eksik belge) adım hafızada kalır; düğme açık kalır, her basış aynı hatayı verir ve daha eski 24 adıma hiç ulaşılamaz. Tek çıkış Discard ya da Save.
Kanıt: veritabanı testi "All or nothing" bölümü, reddedilen Undo'dan sonra hafıza 3 adımda kalıyor.
Test: ekran testi: izin onaylandıktan sonra Undo → mesaj ne yapılacağını söylesin, ikinci basışta ne olacağı belli olsun.

**R3. Çakışma uyarısı onaylanmış atamada Undo reddedilebilir.** **(çıkarım)**
Kuralı "uyar" olan bir çakışmada (dinlenme süresi, yolculuk süresi gibi) müdür uyarıyı onaylayarak Ethan Brooks'u atar. Sonra vardiyanın saatini değiştirir; sistem eski onayı geçersiz sayar. Undo eski saate dönmek ister, ama eski onay artık geçersiz olduğu için veritabanı "A current conflict acceptance is required" ile reddeder. R2 ile birleşince Undo kilitlenir.
Test: veritabanı testi: uyarılı kural → onaylı atama → saat değişikliği → Undo; beklenen davranışa (onay geri gelsin mi, yeniden mi sorulsun) karar verilmeli.

**R4. İki sekmede yanıltıcı mesaj.** **(çıkarım)**
A sekmesinde değişiklik yapılınca B sekmesinin bildiği sürüm eskir; B'de Undo "This step can no longer be undone." der. Aslında adım geri alınabilir; en geç 60 saniye sonra (bağlantı yoklaması) ya da yenilemeden sonra çalışır.
Test: ekran testi: aynı düzenleme iki sekmede → A'da ekle → B'de Undo → mesaj "ekran eskidi, yenile" demeli, ya da ekran kendini yenileyip denemeli.

**R5. Terk edilen düzenleme hiç kapanmıyor, eski Undo hafızası günler sonra geri gelebilir.** **(çıkarım)**
"Keep editing?" sayacı yalnız sayfa açıkken çalışır. Sekme kapatılırsa ya da başka haftada yeni düzenleme başlatılırsa eski düzenleme sunucuda "açık" kalır; onu kapatan zamanlanmış bir iş yok. Daniel üç gün sonra aynı hafta için Edit'e basınca üç gün önceki kaydedilmemiş değişiklikler ve Undo hafızası geri gelir; Undo üç gün önceki adımı geri alabilir.
Test: veritabanı testi: kilit süresi geçmiş düzenleme → aynı kişi yeniden açar → ne olacağına karar (kaldığın yerden mi, Auto-save taslağı mı).

**R6. Hafıza sessizce siliniyor.** **(çıkarım: ekranda açıklama yok)**
Başka bir müdür takas onaylar ya da kapalı gün eklerse senin Undo hafızan silinir (bilerek). Ekran sebebini söylemez; düğme bir sonraki işte ya da en geç 60 saniyede soluklaşır.
Test: ekran testi: açık düzenleme varken takas onayı → Undo soluk ve kısa bir açıklama görünüyor.

**R7. Pencere açıkken Ctrl+Z arkadaki ızgarada Undo yapabilir.** **(çıkarım, elle kontrol edilmeli)**
Klavye dinleyicisi yalnız "yazı kutusunda mı" diye bakıyor. Vardiya penceresi açık, odak bir düğmedeyken Ctrl+Z arkada Undo yapar; pencere eski hâli tutar ve kaydedince "stale" hatası alır.
Test: ekran testi: Add/Edit shift penceresi açık, odak düğmede → Ctrl+Z → Undo olmamalı.

**R8. Küçük: toplu silmenin yedek yolu.** Sunucu cevabında düzenleme gelmezse ekran vardiyaları tek tek siler; bu N ayrı Undo adımı olur. Bugün sunucu hep düzenlemeyi döndürdüğü için bu yol çalışmıyor; ölü kod.

## 6. Testlerde olan ve olmayan

Var:
- Veritabanı testi (`supabase/tests/schedule_edit_session_undo.test.sql`): taşıma geri alınır; üç vardiyalık yapıştırma tek adım; adımlar yeniden eskiye; yayınlanmış vardiya "bekleyen değişiklik" değil "yayınlanmış" hâline döner; ya hepsi ya hiçbiri; yalnız sahibi geri alır; yetkisi daralanınki reddedilir; açarken/genişletirken gelen vardiyalar adım değil; takas ve onun geri yüklenmesi hafızayı siler; kayıt hafızayı siler; 25 adım sınırı; genişletme 25 adımı bozmaz; aynı anda iki istekte doğru sıra; vardiya yazan her yolun sınıflanması; süresi dolmuş kilit.
- Uçtan uca ekran testi (`e2e/flows/schedule-undo.spec.ts`): vardiya ekle → Undo → kayboldu → yenile → hâlâ yok, Undo soluk.
- Ekran birim testi: hafızada adım yokken Undo soluk.

Yok: Ctrl+Z, başka haftaya gidip dönme, konum filtresiyle görünmeyen adım, iki sekme, Auto-save sonrası, kurala takılan Undo'nun ekrandaki mesajı, şablon ve Auto-fill'in ayrı tek-adım testi, çakışma onaylı atama (R3).

---

## Kanıtlar (main 9a9793e2)

- Undo düğmesi ve Ctrl+Z: [apps/web/src/views/SchedulePage.tsx satır 1561–1603](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/apps/web/src/views/SchedulePage.tsx#L1561-L1603), [1706–1716](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/apps/web/src/views/SchedulePage.tsx#L1706-L1716), [2634–2637](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/apps/web/src/views/SchedulePage.tsx#L2634-L2637); yazı kutusu kontrolü [satır 1679](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/apps/web/src/views/SchedulePage.tsx#L1679).
- Undo yalnız düzenlenen haftada: [SchedulePage.tsx satır 578–581](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/apps/web/src/views/SchedulePage.tsx#L578-L581); başka hafta görüntüleme modunda, dönünce aynı düzenleme: [satır 1168–1178](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/apps/web/src/views/SchedulePage.tsx#L1168-L1178).
- Konum filtresi düzenlemede yalnız görünüm: [SchedulePage.tsx satır 2572](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/apps/web/src/views/SchedulePage.tsx#L2572) (filtre değişince düzenleme yeniden alınmıyor).
- Hareketsizlik ve Auto-save: [apps/web/src/schedule/hooks/useEditIdleTimer.ts satır 3–5](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/apps/web/src/schedule/hooks/useEditIdleTimer.ts#L3-L5), [useScheduleEditSession.ts satır 82–96](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/apps/web/src/schedule/hooks/useScheduleEditSession.ts#L82-L96); süresi geçmiş kilidi geri alma [satır 170–242](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/apps/web/src/schedule/hooks/useScheduleEditSession.ts#L170-L242).
- Adımı kaydeden tetikleyici, 25 sınırı, sıra numarası: [supabase/schema.sql satır 4757–4799](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/supabase/schema.sql#L4757-L4799); migration [20261009080320_undo_keeps_its_order_and_full_depth.sql](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/supabase/migrations/20261009080320_undo_keeps_its_order_and_full_depth.sql).
- Undo'nun kendisi (sahibi, kilit, sürüm, ya hepsi ya hiçbiri, belge kontrolü): [schema.sql satır 26134–26240](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/supabase/schema.sql#L26134-L26240).
- Hafızayı silenler: kapanış tetikleyicisi [schema.sql satır 31800](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/supabase/schema.sql#L31800); takas/kapalı gün [satır 4962–4972](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/supabase/schema.sql#L4962-L4972); Save [satır 22693](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/supabase/schema.sql#L22693).
- Düzenleme kişi + hafta + kaynağa bağlı, farklı kaynak eskisini kapatır: [schema.sql satır 6774–6792](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/supabase/schema.sql#L6774-L6792); açık düzenlemeyi kapatan zamanlanmış iş yok (yalnız Auto-save, farklı kaynak, taslak silme ve başkasının aynı taslağı açması kapatıyor; `close_schedule_edit_session` çağıranları).
- Çakışma onayı gerektiren atama (R3): [schema.sql satır 12770–12853](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/supabase/schema.sql#L12770-L12853), özellikle onayı geçersiz sayan güncelleme ve "A current conflict acceptance is required".
- Testler: [supabase/tests/schedule_edit_session_undo.test.sql](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/supabase/tests/schedule_edit_session_undo.test.sql), [e2e/flows/schedule-undo.spec.ts](https://github.com/mttepebas-debug/newfork-clean/blob/9a9793e2/e2e/flows/schedule-undo.spec.ts).
