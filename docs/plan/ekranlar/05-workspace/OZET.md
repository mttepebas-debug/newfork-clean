# EKRAN-05 Workspace (ana sayfa) — keşif özeti

Keşif 2026-10-06 (gece, `nf-planlama` oturumu; koordinatörün "izin beklerken" görevi). Ölçüm `origin/main` `a40f329b`; yerel DB son migration `20261007130000` (repoyla aynı). Raporlar: `A-backlog-prototip.md`, `B-guvenlik.md`, `D-kod-davranis.md` (ajanların son mesajı, aynen). **`C-gorsel.md` yok:** görsel QA ağır iş (dev sunucusu + tarayıcı); gece kuralı gereği koordinatörün izniyle sonra koşar ve buraya eklenir.

- **Ekran:** sol menü → Workspace (`/app/<workspace>/workspace`; `/app` açılışı yöneticiyi buraya indirir). Kartlar: Today, Pending requests, Open shifts, Announcements, Todos, Notifications, Quick actions; Customize (sırala, gizle, Save layout, Cancel); Setup checklist (owner ve admin). Owner, admin, müdür. Çalışan giremez.
- **Sınırda:** Settings → General → Hide checklist; Requests ve Shift Hub sayıları; Announcements / Notifications okumaları; girişten sonra iniş (BL-624, 625, 627); Employee view → Home (ekran 11).
- **Güvenlik:** sızıntı yok (B: kritik / yüksek / orta 0, düşük 4). Müdürün sayıları yalnız kendi lokasyonundan; eş müdürün, üstün ve kendi bekleyen izni sayılmıyor (9.000+ müdür–kişi çifti, yerel DB). Düzen ve checklist yalnız kişinin kendi satırına yazıyor.
- **Asıl sorun doğruluk:** "bugün" sayıları UTC gününe göre; profilsiz hesapta sayfa açılmıyor; arşivli duyuru kutuda kalıyor; checklist'te işe yaramayan adımlar.

## 1. Tek liste (önem sırasıyla)

| # | Bulgu | Nerede / örnek | Kaynak | Backlog | İşaret |
|---|---|---|---|---|---|
| E5-01 | **"Scheduled today" / "Open today" UTC gününe göre sayılıyor;** başlıktaki tarih tarayıcıdan geliyor. KARARLAR Schedule → "Bugün hangi saat dilimiyle": "hiçbiri UTC'yi kullanmaz". | Los Angeles'ta müdür Mina Salı 18:10'da açar: başlık "Tuesday", sayılar Çarşamba'nın. Sayfa açık kalınca gece yarısı tarih döner, sayılar eski günde kalır | A, D Y1 | BL-804 (BL-238 ailesi) | leave: high / do: moderate |
| E5-02 | **Hesap satırı (`user_profiles`) olmayan owner / admin ana sayfayı açamıyor:** "Internal server error". "Manager" yedek adı 2026-09-08 yeniden yazımında kaybolmuş; satırı açan zorunlu adım yok. | Mert'in yerel Meyhouse admin hesabı bu durumda; yerelde toplam 74 hesap (73 yarım kurulum owner + 1 admin). Canlı sayı ölçülmedi | B D1, D O1 | BL-805 | leave: medium / do: safe |
| E5-03 | **Announcements kutusu arşivli, süresi dolmuş ve yayımlanamamış duyuruyu gösteriyor** (K28: yalnız yayındakiler). Kitle dışına taşma yok (88 / 0). | Zeynep "Inventory day"i arşivler; Ayşe ana sayfada görmeye devam eder | A, B, D D5 | BL-564 | leave: medium / do: moderate |
| E5-04 | **Belge süresi işleri ve bildirimleri yalnız biri Workspace'i açınca üretiliyor** (okuma isteği yazıyor); "yaklaşıyor" bildirimi gittiyse "expired" bildirimi hiç gitmiyor (aynı olay anahtarı). | Ali'nin Food Handler kartı Cumartesi doluyor; hafta sonu kimse ana sayfayı açmaz → ne iş ne bildirim | D O3 (B §3 not) | BL-806 | leave: medium / do: moderate |
| E5-05 | **Belge izni olmayan müdür belge süresi işini görüyor;** bildirim ise yalnız belge izni olana gidiyor. Aynı bilgi iki kurala göre dağılıyor. | Ayşe (yerleşik Manager, belge izni yok) "Expired employee document · Ali Brown" görür, tıklayınca belgeyi açamaz | D O4 | BL-807 (BL-560 ailesi) | leave: medium / do: moderate |
| E5-06 | **Setup checklist yetkiyi çekirdeğe sormuyor;** kural üç yerde üç farklı: web rol adına bakıyor, API rota içinde `permissions.includes`, DB eski kapı (ipucusuz 42501); katalog `workspace.setup` (yalnız owner) diyor ama servis onu çağırmıyor. Admin ve kapalı workspace owner'ı geçiyor. | Admin Deniz Settings → General'da "Hide checklist"e basabiliyor; katalog bunu owner'ın işi sayıyor | A, B D2, D O5 | BL-276 (değişmiş: üç fonksiyon adıyla yok) + BL-808 | leave: medium / do: moderate |
| E5-07 | **"Shift changes" sayısı müdürün karar veremeyeceği vakaları da sayıyor** (`awaiting_other_manager`); süzgeç iki yerde (Workspace + Shift Hub); bütün takas listesi tarayıcıda sayılıyor. EKRAN-02 "Out of scope 2" bunu "BL-410" adıyla bu tura bıraktı, ama BL-410'un metni başka. | Kadıköy–Beşiktaş takası Beşiktaş müdürünü bekliyor; Ayşe'nin sayısı yine 1 artar | A, B §2, D D2 | BL-809 | leave: medium / do: moderate |
| E5-08 | **Notifications kutusu eski gelen kutusunu okuyor** (ikiz sistem). Sızıntı yok. | Aynı kişi için iki ayrı gelen kutusu | A, B, D D12 | BL-533 | leave: medium / do: moderate |
| E5-09 | **Kartlarda yanlış satırlar:** ileri tarih "Due 1m ago"; belge işinde kişi ve belge adı kayboluyor; ham kategori "general"; gitmeyen satırda ok; "View all notifications" kelime kelime kırılıyor; "New announcement" yalnız listeye gidiyor. Announcements'ta 5'ten fazlası için "View all" yok. | Burak'ın kartı 25 gün sonra bitiyor; Ayşe yalnız "Due 1m ago" görür | A, D D6 | BL-666 + BL-810 (Announcements "View all") | leave: medium / do: safe |
| E5-10 | **Checklist adımları gerçeği söylemiyor:** "App tour" zorunlu ama tur yok; "Set scheduling preferences" tıklanınca tamam sayılıyor; "Billing" faturalamasız bir sayfaya gidiyor ve admin'e de görünüyor; bitince checklist kalkmıyor; Settings metni "for this workspace" diyor ama gizleme kişi başına. | Mert hiçbir şey ayarlamadan "2 of 2 required visits complete" görür | A, D D10, B §4 | BL-811 | leave: low / do: safe |
| E5-11 | **Sayılar başka ekrandaki karardan sonra 30 sn'ye kadar bayat;** izin kararı panoyu yenilemiyor. | Ayşe Requests'te Ali'nin iznini onaylar, Workspace'e döner: "Time off 1" | D D1 | BL-812 (BL-278 ailesi, kapalı) | leave: low / do: safe |
| E5-12 | **İzni olmayana kart "0" gösteriyor;** Quick actions bağlantıları da izne bakmıyor; lokasyonsuz müdür her yerde 0 görüyor, nedeni yazmıyor. | Yalnız Availability'yi yöneten Can "Time off 0" görür | A, B §2, D D4 | BL-410 | leave: low / do: safe |
| E5-13 | **Customize:** Cancel (ve Customize, Add) `secondary` sınıfıyla yeşil — CSS'te böyle bir kural yok (UI-09: vazgeç beyaz); iki sekmede son kaydeden kazanır; gizli kart Customize'da çalışıyor; yedi kart gizlenince boş sayfa; Gizle/Göster simgelerinde `aria-hidden` yok. | Mert Customize modunda iki yeşil düğme görür: Save layout ve Cancel | A U41, D D9 | U41 (numarasız) + BL-813 | leave: low / do: safe |
| E5-14 | **Ham hata metni ekranda:** sayfa yükleme ve Save layout hatası; checklist yükleme hatası "could not be saved" diyor. | Bağlantı kopunca "Failed to fetch" | A, D D3 | BL-814 (BL-654 / BL-395 ailesi) | leave: low / do: safe |
| E5-15 | **Todos 5'te kesiliyor;** 6. iş görünmüyor, işlerin ayrı sayfası yok. | Yedi belgenin süresi dolarken Ayşe beşini görür | A, D D6 | BL-667 | leave: low / do: safe |
| E5-16 | **Başlık iskeleti liste sayfalarından farklı** (masaüstü ≥118 px + iki satır açıklama; liste 142 px tek satır; telefonda 32 vs 28); üst yazı "TODAY'S WORK. ONE PLACE." ve uzun açıklama. | Ayşe Workspace → Announcements geçerken başlık ve içerik kayar | A, D D11 | BL-815 | leave: low / do: safe |
| E5-17 | **Aynı sayı iki kutuda** ("Open today" = "unassigned shifts today"); "Scheduled today" boş vardiyaları da sayıyor. | 10 vardiyanın 2'si boş: "Scheduled today 10 / Open today 2" | A (gözlem), D D7 | numara yok (gözlem, KK-179 (11)) | leave: low / do: safe |
| E5-18 | **Ölü yük:** `unread_notification_count` hesaplanıyor, kullanılmıyor; "Shift changes" için Shift Hub modelinin tamamı çekiliyor; ölü CSS (`min-width` kuralları); ölü "Manager" yedeği (E5-02 ile gider). | — | A, D D8 | BL-816 | leave: low / do: safe |
| E5-19 | **Katalog sınıfı panonun sorduğu eylemle eşleşmiyor** (`workspace.read` yazılı, servis `workspace.todos` soruyor); test yalnız anahtarın varlığına baktığı için yeşil. | — | B D3, D D12 | BL-416 (2) + BL-817 | leave: low / do: safe |
| E5-20 | **To-do kapatmada "hayır" sözleşmesi:** bilinmeyen to-do 404, kapsam dışı 403 (aynı cevap olmalı). | Ayşe eski sekmeden Emre'nin to-do'sunu kapatmaya çalışır: "var ama size kapalı" | B D4 | BL-818 | leave: low / do: safe |

Not (kararla kabul, bulgu sayılmadı): kişiye bağlı olmayan to-do'yu workspace'teki her yönetici görür ve kapatabilir — KK-34 bilerek seçti (B §3). D bunu O2 diye işaretledi (yazan / kapatan adı tutulmuyor, geri alma yok); Mert yeniden açmak isterse S4.

Öneri (zevk, B): üç yazma rotası Origin listesinde yok, `GET …/setup-checklist` `no-store` listesinde yok. CSRF yolu yok (Bearer); tutarlılık için eklenebilir.

## 2. Test boşlukları (D §3, A)
- "Bugün" sayılarının saat dilimi ve M2 kapsamı için pgTAP yok; web testleri sahte sayıyla çalışıyor.
- Profilsiz kişi için pano hücresi yok (test dünyası herkese profil açıyor, `builder.sql:118`).
- Kişisiz to-do'yu kim görür / kapatır; belge işinin "yaklaşıyor → doldu" ikinci bildirimi; belge izni olmayan müdürden gizleme: test yok.
- Setup checklist: admin–owner farkı ve ret gerekçesi sınanmıyor.
- İzin kararından sonra pano yenilenmesi: web testi yok.
- Customize için web testi yok; Workspace için e2e akışı yok (yalnız açılış adresi, `scope-and-employee-view.spec.ts:185-213`).

## 3. Prototipten taşı / bırak (A §3)
- **Taşı (9):** W2 tek satır açıklama + ipucu (E5-16), W6 beyaz Cancel (E5-13), W25 yalnız canlı duyuru (E5-03), W26 "General" (E5-09), W33 "Due in 25d", W43 ok yalnız açılan satırda, W44 kişi + belge adı, W45 tek satır "View all notifications" (hepsi E5-09), W37 bağlantı üzerinde alt çizgi (C raporunda öteki ekranlarla ölçülerek).
- **Bırak (4):** W4 sabit tarih, W7 400 ms "Saving…", W46 prototipin iç yapısı (karşılığı BL-533), PHONE K7 telefonda 38 px başlık (KARARLAR: 28).
- **Mert sorusu (1):** W31 6. iş (S2).
- P1'in "polished" dediği 7 düzeltmeden 6'sı main'de yok (yalnız başlık ipucu var).

## 4. Mert'e sorulacaklar (CLAUDE.md §13, ham; sabah)

**S1 — İzni olmayan bir müdür sayı kutusunu nasıl görsün?** (E5-12)
- **Bugün:** sol menü → Workspace → Pending requests. Yalnız Availability'yi yöneten Can, bekleyen talep varken "Time off 0" görür.
- **(a) Kutu gizlensin; Customize'da da çıkmasın (Önerilen).** Can yalnız işini gördüğü kutuları görür; yanlış sıfır yok.
  `Dayanak: ILKELER P11 (doğru veri tahminden önce) + A anti-hedefler (gürültü yok)`
- (b) Kutu dursun; sayının yerine "—" ve "No access".
- (c) Bugünkü gibi 0 kalsın.

**S2 — Beşten fazla açık iş olunca Todos kutusu ne yapsın?** (E5-15)
- **Bugün:** yedi belgenin süresi dolarken Ayşe beşini görür; altıncı ve yedinci düzelene kadar hiç görünmez.
- **(a) Sınır kalksın; kutu kendi içinde kaysın (Önerilen).** İşlerin ayrı sayfası olmadığı için "+N more" kişiyi bir yere götüremez.
  `Dayanak: ILKELER P09 (veri sessizce düşmez) + P02 (tam çözüm)`
- (b) Beşin altında tıklanamayan "+2 more".
- (c) Bugünkü gibi kalsın.

**S3 — Setup checklist: "App tour" ve "Billing" adımları ne olsun, checklist'i admin de görsün mü?** (E5-06, E5-10)
- **Bugün:** Mert "App tour"a basar, yalnız işaret konur, tur yok. "Billing"e basar, Workspaces listesine düşer; faturalama yok. Admin Deniz de checklist'i ve "Billing"i görür ve gizleyebilir; katalog bunu owner'a özel sayıyor.
- **(a) İki adım da şimdilik kalksın; zorunlu adım yalnız "Set scheduling preferences" ve o da Save'le tamam sayılsın; checklist yalnız owner'a görünsün (Önerilen).** Billing, faturalama işi gelince geri gelir.
  `Dayanak: KARARLAR MVP sınırı ("Stripe billing şimdilik yoktur") ve Ürün kuralları (billing yalnız owner'ın) + ILKELER A (oyuncak görünüm yok); App tour için yok — yeni karar`
- (b) Adımlar kalsın, yanlarında "Coming soon"; admin de görmeye devam etsin.
- (c) Bugünkü gibi kalsın.

**S4 — Elle yazılan to-do kimin listesi?** (yalnız Mert yeniden açmak isterse; KK-34 org kapsamını seçti)
- **Bugün:** Kadıköy müdürü Ayşe "Ali'yle geç kalma konusunu konuş" yazar; Beşiktaş müdürü Mehmet, admin ve owner da görür; Mehmet ✓'ye basınca Ayşe'den de kalkar; kimin yazdığı, kimin kapattığı görünmez, geri alma yok.
- **(a) Workspace'in ortak listesi kalsın; satırda yazanın adı, kapatınca "Resolved by …" ve Undo olsun (Önerilen).**
  `Dayanak: KK-34 (org kapsamı) + ILKELER P25 (karar geri alınabilir)`
- (b) Lokasyonun listesi olsun (M2 gibi): Ayşe'ninkini yalnız Kadıköy'ü görenler görür.
- (c) Kişisel olsun: yalnız yazan görür.
- (d) Bugünkü gibi kalsın.

**S5 — Workspace'in başlığı nasıl görünsün?** (E5-16, BL-815; görsel — P04, yazıyla değil gerçek ekranda 2–3 varyant)
- **Bugün:** sol menü → Workspace. Başlık en az 118 px, açıklama iki satır ve selamlamayı içine katıyor ("Track today's operations… Good evening, Mert · Tuesday, October 6, 6:10 PM"); üst yazı "TODAY'S WORK. ONE PLACE.". Ayşe Workspace → Announcements geçerken başlık ve içerik kayar.
- Varyantlar: (a) liste sayfalarıyla aynı iskelet (142 px, tek satır açıklama, telefonda 28); (b) pano başlığı: yalnız selamlama + tarih, açıklama yok; (c) bugünkü gibi. Üst yazının metni varyantlarla birlikte gösterilir.
- `Dayanak: yok — yeni karar (koordinatör KK-179 (10): Workspace liste değil pano, yerleşim kararı Mert'in)`

**S6 — Belge süresi işi ve bildirimi zamanında üretilsin mi; "expired" bildirimi gitsin mi?** (E5-04, BL-806; teyit)
- **Bugün:** Ali'nin Food Handler kartı Cumartesi doluyor. Hafta sonu kimse ana sayfayı açmazsa ne Todos'ta iş açılır ne owner'a bildirim gider; Pazartesi biri Workspace'i açınca ikisi birden üretilir. "Expires soon" bildirimi gittiyse, süre dolunca "expired" bildirimi hiç gitmez.
- **(a) Her gün belli bir saatte kendiliğinden üretilsin; süre dolunca owner ve admin'e ayrıca "expired" bildirimi gitsin (Önerilen).** Kim görür: bugünkü gibi belge izni olanlar (BL-807 ile müdürün iş satırı da aynı izne bağlanır).
  `Dayanak: ILKELER P09 (veri sessizce düşmez) + koordinatör KK-179 (4)`
- (b) Kendiliğinden üretilsin, ama "expired" ayrı bildirim olmasın (tek "expires soon" yeter).
- (c) Bugünkü gibi kalsın.

## 5. Koordinatör kararları (KK-179, 2026-10-06)
Öneriler tek tek tartıldı; koordinatörün cevabı:
1. **E5-01 KABUL** (BL-804): her lokasyon kendi saat diliminin bugününü sayar; başlıktaki tarih aynı güne bağlanır; çok lokasyonlu müdürde toplam her lokasyonun kendi gününe göre. Dayanak: KARARLAR Schedule → "Bugün hangi saat dilimiyle" (birebir). BL-238 ile tek iş. `nf-db`, R2.
2. **E5-02 KABUL** (BL-805), yol: "her üyenin hesap satırı vardır" kuralı DB'de (P01: tolerans değil kural); mekanizma `nf-db`'nin (P19); profilsiz owner için pgTAP hücresi. **Ek şart:** canlıda profilsiz üye ölçülür; varsa satır **oluşturulur, silinmez** (gerçek veri). `nf-db`, R2.
3. **E5-03 KABUL** (BL-564): kutu yalnız canlı duyuruyu gösterir. Dayanak: K28. `nf-db`, R2.
4. **E5-04 KABUL, ekran 5'in turunda; gece yapılmaz** (BL-806): okuma ucunun yazmayı bırakıp zamanlanmış göreve geçmesi çalışma biçimi değişikliği; "expired" bildirimi yeni davranış → Mert'e teyit sorusu (S6).
5. **E5-05 KABUL** (BL-807): iş satırı da `documents.read` ile süzülür. Dayanak: KARARLAR satır 93. R3.
6. **E5-06 KISMEN** (BL-808): çekirdeğe taşıma kabul (servisler `workspace.setup`'a sorar, rota içi kapı ve web rol kontrolü kalkar, `can()`); admin'in görüp görmeyeceği S3'ü bekler. R3.
7. **E5-07 KABUL** (BL-809): sayı EKRAN-02 A2'nin rütbe kuralını izler; süzgeç tek yerde, sunucuda.
8. **E5-08 KABUL** (BL-533): kutu Notifications sayfasıyla aynı okumayı kullanır; eski fonksiyon silinir, `retired_objects_stay_gone`'a eklenir (ikiz yok).
9. **Salt hatalar KABUL:** E5-09 (BL-666, BL-810), E5-11 (BL-812), E5-13 (U41: Cancel beyaz, `secondary` silinir; BL-813), E5-14 (BL-814), E5-18 (BL-816), E5-19 (BL-817), E5-20 (BL-818).
10. **E5-16 RED (koordinatör kararı):** Workspace liste sayfası değil pano; liste başlık iskeletini ona genişletmek yerleşim kararı → P04, Mert'e varyantla (S5; BL-815).
11. **E5-17 gözlem, dokunulmaz** (numara almadı).

## 6. BL eşlemesi
- Var olan: BL-564, BL-666, BL-533, BL-410, BL-667, BL-276, BL-416, U41 (numarasız). Hepsi bugün **geçerli** (tazelik 2026-10-06, `a40f329b`); BL-276 **değişmiş** (checklist'in üç fonksiyonu adıyla yok).
- Yeni numaralar (KK-179, 2026-10-06): BL-804 (E5-01), BL-805 (E5-02), BL-806 (E5-04), BL-807 (E5-05), BL-808 (E5-06), BL-809 (E5-07), BL-810 (E5-09 eki), BL-811 (E5-10), BL-812 (E5-11), BL-813 (E5-13, U41 dışı), BL-814 (E5-14), BL-815 (E5-16), BL-816 (E5-18), BL-817 (E5-19), BL-818 (E5-20). E5-17 numara almadı (gözlem). Var olan altı maddeye tazelik satırı eklendi.
- Sınırda: BL-176, BL-624, BL-625, BL-627, BL-348, BL-553, BL-079, BL-659, BL-238 (A §1 tablo).

## 7. Durum
- [x] A, B, D raporları (2026-10-06, `a40f329b`)
- [ ] C görsel QA (ağır iş, izinle)
- [x] Koordinatör kararları KK-179 + BL-804…818 (2026-10-06)
- [ ] Mert soruları S1–S6 (sabah)
- [x] Görev dosyası `tasks/EKRAN-05-WORKSPACE.md` (draft, 2026-10-06)
