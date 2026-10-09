# A — Announcements: açık backlog, prototip farkları, kodda olmayan kurallar (EKRAN-07, 2026-10-06, `6e7ac0dd`)

## Özet
- **Ölçüm:**
  - `origin/main` `6e7ac0dd` (2026-10-06 10:43 PDT). Bu worktree aynı noktada.
  - Yerel DB'nin son migration'ı `20261007130000`, main'deki son dosyayla aynı.
  - Yerel DB'de yalnız SELECT çalıştı (`set default_transaction_read_only = on`). Test koşulmadı, dev sunucusu açılmadı, dosya yazılmadı.
  - Ekranın dosyaları (`AnnouncementsPage.tsx`, `announcements-catalog.css`, `DashboardCommunications.tsx`, `apps/api/src/communications`) gece tazeliğinden (`44e41a54`) bu yana değişmedi (`git log 44e41a54..origin/main` boş). O turun hükümleri bugün de geçerli; ayrıca kendim de ölçtüm.
- **Son BL numarası:** BL-857 (`origin/main` `6e7ac0dd`).
- **Sayılar:**
  - Ekranın içinde 9 açık backlog kaydı var: 6'sı geçerli, 2'si değişmiş, 1'i ölçülmedi (telefon ölçüsü ekran ister). Bayat madde yok.
  - YENİ bulgu: içeride 9, sınırda 1.
  - Sınırda: 20 madde.
  - Prototip (P4, P5, PHONE-MGR2, PHONE-EMP): 27 madde "taşı", 3 "bırak", 4 "varyant gerekir / soru".
- **En ağır bulgu: duyuru için kararlaştırılan kuralların neredeyse hiçbiri kodda yok.**
  - Mert 2026-10-04 ile 05 arasında duyurunun bütün hayatını yeniden kurdu: K19–K27, pencere kararları A5–A15, B2, B6, C1, D1.
  - FB-6.7'nin duyuru kısmı o gün "durdu, yeniden planlanacak" diye kaldı (`tasks/FB-6.7.md:2`). O tarihten beri duyuruya dokunan migration yok; son ikisi `20261004000000` ve `20261005000000`.
  - Bugünkü ekranda hedef kişi listesi yok, onay anahtarı yok, onay ve geçmiş sekmeleri yok, Remind yok, Unpublish ve Restore düğmesi yok. "Delete" aslında arşivliyor.
  - Bunun en çok hissedilecek yeri hedef: bugün hedef bir kural (rol + lokasyon + departman + iş), boş bırakılırsa "herkes" demek. K24'e göre hedef sabit bir kişi listesi olmalı, liste boşsa Publish kilitli kalmalı.
- **Eski dal:** `task/fb-6.7-ui` (@`4d9226cc`, 16 commit, ayrıldığı noktadan bu yana main 312 commit ilerledi). 2026-10-04 #170 öncesi kurallarla yazıldı ve worktree'si (`newfork-wt/fb-6.7-ui`) hâlâ açık.
  - Duyuru kısmı bugünkü kararlarla çelişiyor: Republish şeridi, "draft'a dönen" Unpublish.
  - Kapalı gün ve önemli tarih parçaları ekran 8'in malı.

## Ekranın sınırı
- **İçeride:**
  - **Sol menü → Announcements** (`/app/announcements`, `/app/announcements/:id`; `App.tsx:435-449`): liste, sekmeler, süzgeçler, satır menüsü.
  - Yazma / düzenleme / yayın / arşiv penceresi (`AnnouncementEditor`, `AnnouncementsPage.tsx:519-874`).
  - Çalışanın okuyucu listesi ve "Acknowledge" düğmesi (`:366-389`, `:876-911`).
  - **Employee view → Home → "Team notices" kartı** (`employee-hub/DashboardCommunications.tsx:76-128`).
  - Veri tarafında duyuru servisleri: `get_announcements_service`, `save_announcement_audience_service`, `publish_announcement_service`, `set_announcement_state_service`, `acknowledge_announcement_service`, `app_private.announcement_release`.
  - Sayfalama (25 / 50 / 100).
- **Sınırda:**
  - Workspace'teki Announcements kutusu (EKRAN-05 aldı);
  - Important Dates (ekran 8);
  - Notifications (ekran 9);
  - Settings → Acknowledgements (ekran 10);
  - ortak çekmece, ortak beyaz düğme, ortak arama kenarı (EKRAN-02 C3 ortak bileşen işi).

Teknik adlar, bir satırda:
- **Hedef:** duyuruyu kimin alacağı. Bugün kural ("Kadıköy'deki garsonlar"); karara göre kişi listesi ("Ali, Can, Deniz").
- **Onay (acknowledge):** çalışanın "okudum" demesi.
- **Yayın işi:** zamanlanmış duyuruyu dakikada bir yayınlayan sunucu adımı (`announcement_release`).
- **Ham metin:** kişiye gösterilen geliştirici cümlesi. Örnek: "stale announcement revision".

## 1. Açık backlog maddeleri (tazelik hükmüyle)

### İçeride
- **BL-543 (leave: medium / do: safe) Kırmızı iki tık "Delete" aslında arşivliyor; Unpublish ve Restore ekranda yok. Tazelik 2026-10-06 (`6e7ac0dd`): geçerli.**
  - Kanıt:
    - satır menüsü `AnnouncementsPage.tsx:428-440` "Delete";
    - pencere `:584-587` `transition.mutate("archive")`, `:806-830` "Confirm delete";
    - pencere altında Unpublish / Restore yok (`:831-869`).
  - Sunucu ikisini de yapıyor (`set_announcement_state_service`, canlı gövde: `unpublish`, `archive`, `restore`; migration `20261004000000:975-1015`).
  - Örnek: Zeynep geçen ayki duyuruyu arşivler. Geri getirmek istediğinde ekranda Restore yok; duyuru kalıcı olarak arşivde kalır.
  - Karar var: B1 (adı "Archive", iki tık kırmızı), K8 akış cevabı 1, K19 (yalnız hiç yayınlanmamış taslak silinir).

- **BL-675 (leave: medium / do: moderate → önerilen do: risky) Çalışan her duyuruda "Acknowledge" görüyor. Tazelik: değişmiş, kapsam büyük.**
  - Madde yalnız ekranı anlatıyor (`:876-909`), ama eksik veride:
    - `announcements` tablosunda "onay istensin mi" sütunu yok (SELECT `information_schema.columns`: 24 sütun, hiçbiri onay anahtarı değil);
    - `acknowledge_announcement_service` duyuruyu gören herkesin onayını kabul ediyor (rütbe kontrolü yok).
  - K22: anahtar yeni duyuruda kapalı gelir; onaydan sorumlu olan, hedefte olup yayınlayandan alt rütbede olandır.
  - Önerilen yeni metin: "Onay anahtarı (K22) veri modelinde ve ekranda yok; bugün hedefteki herkes her duyuruyu onaylayabiliyor."
  - Yetki ve şema değiştiği için do: risky (R3).

- **BL-678 (leave: low / do: safe) Hedef metni her zaman "All departments · All jobs" ekliyor. Tazelik: geçerli.**
  - Kanıt: `AnnouncementsPage.tsx:1025-1039`.
  - K24 (kişi listesi) gelince bu metin tümden değişir. Prototipte "4 people · Admins, Managers, Employees · Meyhouse Palo Alto". Ayrı iş gerekmez; K24 ile kapanır.

- **BL-541 (leave: medium / do: safe) Çalışanın "Acknowledge" düğmesi 12 yerine 16 px yazıyor. Tazelik: geçerli.**
  - Kanıt: `jobs-settings.css:37-39` `.jobs-settings-page button { font: inherit }` (özgüllük 0,1,1), `announcements-catalog.css:328-334` `font-size: 12px`'i eziyor. Sayfa `jobs-settings-page` sınıfını taşıyor (`AnnouncementsPage.tsx:145`).

- **BL-542 (leave: medium / do: safe) Telefonda çalışan listesi başlığı ~10 harfte kesiyor. Tazelik: CSS geçerli, ekranda ölçülmedi.**
  - Kanıt: `announcements-catalog.css:282` ve `:352` `@media (max-width: 650px)`; okuyucu satırı `minmax(0,1fr) auto 36px` (`:354`).
  - PHONE-MGR2 bu sorunu kart satırıyla çözdü (bölüm 2).

- **BL-599, Announcements kısmı (leave: medium / do: moderate) Telefonda liste tabloları. Tazelik: ölçülmedi (ekran ölçüsü).**
  - Madde Announcements için "başlık bloğu kabından taşıyor (x=25)" diyor; bu bir ekran ölçüsü, bu görevde dev sunucusu açılamazdı.
  - Mert'in 2026-10-05 kart satırı kararı Announcements'ta yok: telefonda hâlâ ızgara (`:284`, `:354`).
  - Görsel QA'ya (C) bırakılmalı.

- **BL-787, Announcements kısmı (leave: medium / do: safe) Sayfalama 25 / 50 / 100. Tazelik: geçerli.**
  - Ekranda sayfalama yok (`AnnouncementsPage.tsx`'te pagination 0).
  - Sunucu bütün duyuruları tek seferde döndürüyor: `get_announcements_service`'te `limit` yok (canlı gövde, satır 60-122).
  - Önerim: duyuru sayısı belgeden azdır, sayfalama istemcide yeterli (P19, EKRAN-06 Settings → Documents ile aynı yol).

- **BL-539 (leave: low / do: moderate) Hedef daraltılırken bildirim gönderici aynı anda çalışırsa çıkarılan kişiye bildirim yine ulaşabilir. Tazelik: geçerli.**
  - `communication_withdraw`'a dokunan migration `44e41a54`'ten sonra gelmedi (grep 0).
  - K24 gelince "daraltma" kişi çıkarma olur; yarış aynı kalır.

- **BL-044 (leave: low / do: safe) "Announcements sayfası ve drawer polish". Tazelik: değişmiş.**
  - "Polish"in ölçülebilir bir iddiası yok.
  - Öneri: bu ekran turunun kapanışıyla kapanır, ayrı iş açılmaz.

## 2. Prototip farkları (taşı / bırak / varyant)
Kaynak:
- `newfork-prototype/proto-audit/P4.md` (Announcements satırları);
- `P5.md` EV-80…83;
- `PHONE-MGR2.md:19-22`;
- `PHONE-EMP.md` PE-22…24.

`KANONIK.md` okundu; prototipe yazılmadı. P4'ün "matched" dediklerinden 6'sını main'de yokladım (AL1, AL2, AL4, AL7, AL12, AL17); hepsi doğru.

### Taşı (kararı yazılı)
| P4 / kaynak | Ne | Dayanak |
|---|---|---|
| AW10, EV-82 | "Ask people to acknowledge" anahtarı, yeni duyuruda kapalı; düğme yalnız sorumlu olana | K22 (+ BL-675) |
| AW11–AW13, AL3, AL10 | Hedef kişi listesi: Audience sekmesi, 980 px, iki liste; yazar listede yok; liste boşsa Publish kilitli; süzgeç ve sütun kişilerden | K24, D1, KK-89 |
| AW14, AW15 | Acknowledge sekmesi: yalnız listedekiler, süzgeç ve arama, yalnız satırlar kayar | B6, K22 |
| AW16 | "Remind N people" (yalnız "Not yet" olanlara, bir kez) | K23 |
| AW17 | History: "<Action> by <Name>", en yeni üstte, eski → yeni | C1, K26 |
| AW4, AW2 | Sekmeler Details · Audience · Acknowledge · History; başlıkta durum yazısı yerine çip | A13, A12 |
| AW18, AW19 | Sağ altta Cancel + tek yeşil düğme; Save pencereyi kapatmaz, Publish olur; yayındakinde yalnız Publish | A5, A6 |
| AW20 | "Onaylar kalsın / sıfırlansın" sorusu (yeniden yayında ve doğrudan düzenlemede) | K27 + 2026-10-05 teyidi |
| AW21 | Değişiklik varken kapatınca soru (üç durum, üç metin) | A7 (P26'dan sonraki, özel karar; P22) |
| AW22, AL13 | Sol altta Archive (kırmızı iki tık) ya da hiç yayınlanmamış taslakta Delete; arşivlide Restore | B1, K19, K8 |
| AW23, AW24 | Couldn't publish: "Try again" + kırmızı çerçeve; Expired: turuncu çerçeve + tek satır | A5, A9, A10, K21, K12 |
| AW25–AW27 | Unpublish → "Unpublished"; Restore → hiç yayınlanmamışsa Draft, yayınlanmışsa Unpublished, bildirim yok; arşivli kayıt salt okunur | K8 akış cevabı 1 + teyit (sunucu bunu zaten yapıyor) |
| AL11 | Çipler: Couldn't publish (kırmızı), Expired, Unpublished | K19, K21, K12 |
| AW9 | Geçmiş tarih seçilemez; bitiş yayından sonra; tek hata satırı | K20 |
| AW28, AW29 | Kaydedilmemiş değişiklik ipuçları; saati silinen zamanlanmış duyuru taslağa döner | A5; K25 (sunucuda var) |
| AW34 | Pencerede koyu kaydırma çubuğu yok; onay kutularının içi beyaz | A15 |
| AL14 | Boş hâl: açık zemin, yeşil daire içinde megafon, yeşil "New announcement" | KARARLAR 2026-10-04 + Son hâl + LIST-YESIL |
| AL16 (kural kısmı) | Hiç yayınlanmamış taslak yalnız yazarına görünür | K19 |
| N30 | Yayın başarısız olunca yalnız yazara "Couldn't publish '<title>'" bildirimi (üretici bu ekranın verisi) | K21 |
| PHONE-MGR2:19 | Telefonda kart satırı: başlık + önizleme, altında çip · kitle · tarih | BL-599 kararı (Mert, 2026-10-05) |
| PHONE-MGR2:22 | Telefonda soru pencereleri ortada, düğmeler alt alta | A7, K27 + ortak pencere dili |
| PE-23, PE-24 | Çalışan sayfasında başlık altındaki boş bant ve içeriden başlama (YENİ, bölüm 4) | CLAUDE.md §9 tutarlılık |

### Bırak
- **G10:** iki tık onayının "blur" yerine "dışarı basış / Tab" ile bozulması. Pano çizim kısıtı; gerçek ortak bileşen (`ConfirmButton`) doğru çalışıyor.
- **AW6:** Message alanının satır tahmini. Gerçek uygulama içeriği ölçerek büyütüyor (`:666-674`), daha iyi.
- **AW38:** sunucu işlerinin yerine konan mockup düğmeleri.

### Varyant gerekir / soru
- **Unpublish düğmesinin yeri ve rengi KARARLAR'da yazılı değil.**
  - A5 sol altı "Archive ya da Delete, gerekirse Try again" diye sayıyor, Unpublish yok.
  - 2026-10-05 teyidi Unpublished durumunu geri getirdi ama düğmenin yerini söylemedi.
  - Prototip düğmeyi yayındaki kayıtta gösteriyor (`parts/announcements.js:316-318`, `:453` `showUnpub`).
  - Soru S1.
- **AL16 "Only you" etiketi:** kural K19'da var, etiket yalnız prototipte. Küçük görünür öğe; Mert'e prototipteki hâli tek satırla gösterilir.
- **AW14'teki "Not required" / "Received" durum adları:** B6 yalnız "onayladı / Not yet" diyor. Ad seçimi metin işi (P21); koordinatör verebilir.
- **PHONE-MGR2:20-21:** telefonda süzgeç dizilişi ve tam ekran pencerede sekmelerin yana kayması. Telefon listesi konuşmasına (G2) bağlı.

## 3. KARARLAR'da olup kodda olmayan kurallar
Ölçü: canlı gövdeler (yerel DB, `pg_get_functiondef`) + `AnnouncementsPage.tsx`.

| Kural | Bugün kodda | Kanıt | Önem |
|---|---|---|---|
| **K24 hedef sabit kişi listesi; boşsa Publish kilitli** | Hedef kural (rol / lokasyon / departman / iş). Alıcılar her yayında ve kayıtta yeniden hesaplanıyor; sonradan katılan kişi bir sonraki kayıtta kendiliğinden ekleniyor. Boş hedef "herkes" demek | `announcement_recipients` → `communication_audience(... roles, departments, jobs)`; `save_…_service`: boş rol → dört rol; ekranda `:718-784` dört seçici, "Everyone" rozeti | yüksek (ürünün çekirdek davranışı; veri modeli) |
| **K19 hiç yayınlanmamış taslak yalnız yazarınındır, arşivlenmez, iki tıkla silinir** | Yazma kapsamı olan herkes (owner, admin, aynı lokasyonun öteki müdürü) taslağı görüyor ve düzenliyor. Taslak arşivleniyor; silme fonksiyonu yok | `get_announcements_service` `control.allowed` taslak / yazar ayrımı yapmıyor (canlı gövde 112-117); `set_announcement_state_service` yalnız `unpublish / archive / restore` | orta |
| **K27 (+ K4 duyuru eki) onaylayan varsa "kalsın / sıfırlansın" sorulur** | İçerik değişince onaylar sormadan siliniyor | `save_…_service` `delete from public.announcement_acknowledgements` (`20261005000000:961`) | orta |
| **K22 onay anahtarı ve rütbe** | Yok | BL-675 (bölüm 1) | orta |
| **K23 Remind** | Yok (ekranda ve sunucuda) | fonksiyon listesi: 11 duyuru fonksiyonu, hatırlatma yok | düşük |
| **K26 / C1 History** | Ekranda yok; olaylar yalnız `audit_events`'e yazılıyor, eski → yeni değer yok | `save_…_service` audit satırı yalnız `content_changed` | düşük |
| **K21 yayın hatasında yazara tek bildirim; listede "Couldn't publish"** | Bildirim gitmiyor. Liste "Scheduled" yazmaya devam ediyor | `announcement_release` yalnız `release_failed_at` yazıyor (`20261005000000:827`); sunucunun `display_status` alanını ekran kullanmıyor (`statusLabel` `:1043-1045`) | orta |
| **K12 müdür ve yazar listede "Expired" görür; süre dolunca "Not yet" → "Didn't acknowledge"** | Süresi dolmuş duyuru listede "Published" yazıyor | aynı: `display_status` kullanılmıyor; sunucu `'expired'` gönderiyor (canlı gövde 65-67) | düşük |
| **K20 geçmiş tarih seçilemez, sunucu da reddeder** | Ekran geçmiş tarih seçtiriyor, sunucu yalnız "bitiş yayından sonra" kuralını tutuyor | `:693-716` `datetime-local` alt sınırsız; `save_…_service` yalnız `expires <= publish` (`20261005000000:916`) | düşük |
| **K8 Unpublish / Restore** | Sunucuda var, ekranda yok | BL-543 | orta |
| **B1 adı "Archive", "Confirm archive"** | "Delete" / "Confirm delete" | BL-543 | orta |
| **B2-A "Acknowledge again" (amber)** | Sunucu `content_changed_since_acknowledged` gönderiyor, ekran kullanmıyor; çalışan düz "Acknowledge" görüyor | `get_announcements_service` canlı gövde 93-94; web'de alan grep 0 | düşük |
| **A5 / A6 tek yeşil düğme, Save pencereyi kapatmaz** | Save kaydedip pencereyi kapatıyor; Publish beyaz ve değişiklik varken kilitli ("Save your changes before publishing.") | `:554-562` `onClose()`; `:843-855` `job-secondary-button` | düşük |
| **A7 kapatırken soru** | Sormadan kapanıyor | `onClose` doğrudan (`:631-639`, `:832-839`) | düşük |
| **A9 / A10 / A12 / A13 / A15, B6, D1** | Hiçbiri yok | bölüm 2 tablosu | düşük–orta |
| **Boş hâl (açık zemin + yeşil daire + düğme)** | Yalnız megafon ve metin; düğme yok | `:445-461` `settings-empty` (ortak `catalog-table-empty` değil) | düşük |
| **Sayfalama** | Yok | BL-787 | orta |

Kodda doğru olanlar (aynı ölçüm):
- K25: saati silinen zamanlanmış duyuru taslağa dönüyor (`save_…` `status = case when status = 'scheduled' and target_publish_at is null then 'draft'`).
- KK-89: yazar alıcı değil (`announcement_recipients` `who is distinct from item.created_by`).
- K8 Restore anlamı sunucuda doğru: yayınlanmışsa Unpublished, değilse Draft.
- KARARLAR:85: müdür kendi lokasyonuna yazar. SELECT: 471 Manager rolünün 471'inde `announcements.manage` var.
- K2/K3 rütbe ve ayrılan yazar `communication_reason`'da. Derin ölçüm güvenlik raporunun (B) işi.

## 4. YENİ bulgular
1. **YENİ-1 (leave: high / do: risky) Duyurunun kararlaştırılmış hayatı (K19–K27, A5–A15, B2, B6, C1, D1) kodda yok; FB-6.7'nin duyuru kısmı yeniden planlanmadı.**
   - Ekranda nerede: Announcements'ın tamamı.
   - Örnek: Admin1 Kadıköy garsonlarına "Yeni menü tadımı"nı yayınlar. Onay isteyip istemediğini seçemez, kimin okuduğunu göremez, hatırlatamaz, yanlış yayınladığında geri alamaz. Ertesi hafta işe giren garson, Admin1 duyuruyu bir daha kaydederse onu da kendiliğinden alır (K24'e göre almamalı).
   - Kanıt: bölüm 3; `tasks/FB-6.7.md:2` "durdu"; `20261005000000`'dan sonra duyuru migration'ı yok.
   - Önerim: EKRAN-07 görev dosyası FB-6.7'nin duyuru kısmının yerine geçer. Sıra: önce veri (`nf-db` + `nf-backend`, R3), sonra ekran.
2. **YENİ-2 (leave: medium / do: safe) `task/fb-6.7-ui` dalı ve worktree'si eski kurallarla duruyor.**
   - Dal 16 commit taşıyor; ayrıldığı noktadan bu yana main 312 commit ilerledi. #170 öncesi duyuru kararlarını içeriyor (Republish şeridi, draft'a dönen Unpublish).
   - Kapalı gün listesi, önemli tarih History'si ve C3 balonu ekran 8 ve 1 için hâlâ değerli.
   - Önerim: duyuru kısmı bu dalla birleştirilmez. Dalın ne olacağına ekran 8 turunun başında karar verilir; o güne kadar dal silinmez.
   - Kanıt: `git rev-list --count $(git merge-base origin/main task/fb-6.7-ui)..origin/main` = 312; `git worktree list`.
3. **YENİ-3 (leave: medium / do: safe) Pencerede ham geliştirici metni çıkıyor.**
   - Örnek: Ayşe ile Hande aynı duyuruyu açar. Hande ikinci kaydedince pencerede "stale announcement revision" yazar.
   - Ekrana çıkan öteki cümleler: "expiry must follow publication", "valid app action required".
   - Kanıt: `AnnouncementsPage.tsx:799-803` `save.error?.message`; liste `:267-271`; onay düğmesinin `title`'ı `:905`. API `rpcFailure` tırnaksız RAISE cümlesini olduğu gibi geçiriyor (`apps/api/src/http-error.ts`, `postgresSentence`). Sunucu 409 için kendi cümlesini (`40001`) gönderiyor.
   - BL-654 ailesi (G11); orada Announcements adı geçmiyor.
4. **YENİ-4 (leave: low / do: safe) Zamanlanan duyuruda sonuç satırı "Scheduled for 0 recipients." diyor.**
   - Örnek: Zeynep 20 kişilik duyuruyu Salı 09:00'a zamanlar ve "Scheduled for 0 recipients." görür.
   - Kanıt: `publish_announcement_service` zamanlanmış yolda `told := '{}'` ve `recipient_count = cardinality(told)`; ekran `:572-578`. Prototip "Scheduled for N recipients." diyor (AW31).
5. **YENİ-5 (leave: low / do: moderate) Yayın saati gelmeden süresi dolan zamanlanmış duyuru "Unpublished" oluyor.**
   - Hiç yayınlanmamış olduğu hâlde "bir kez yayınlanmış" durumu alıyor ve K19'a göre paylaşımlı sayılıyor.
   - Örnek: KadıköyMüdür1 Cuma'ya zamanlar, bitişi Perşembe verir. Duyuru hiç çıkmadan Unpublished olur ve öteki Kadıköy müdürü onu açar.
   - Kanıt: `announcement_release` `set status = 'unpublished'` (`20261005000000:814`).
6. **YENİ-6 (leave: low / do: safe) Employee view → Home → "Team notices" kartı.**
   - (a) Owner, admin ya da müdür Employee view'a geçince kart kendisine gelmeyen ve arşivlenmiş duyuruları da gösteriyor. Süzgeç yalnız `status === 'published'` ve süreye bakıyor (`DashboardCommunications.tsx:89-96`). Sunucu yönetene hepsini döndürüyor (`control.allowed`), arşiv durumu değiştirmiyor (`set_announcement_state_service`).
   - (b) Kategori ham kod: "general" (`:116`). Workspace'teki eşi BL-666 (3).
   - (c) Kartın adı "Team notices", menünün adı "Announcements".
   - (d) Boş metin "No new notices. Enjoy a little quiet." Anti-hedef: rozet ve pazarlama dili yok (ILKELER A).
   - Örnek: owner Mert Employee view'da yalnız Kadıköy aşçılarına giden ve geçen hafta arşivlenen "Deep clean" duyurusunu görür.
7. **YENİ-7 (leave: low / do: safe) Çalışanın Announcements sayfası telefonda başlığın altında boş bir bant bırakıyor ve öteki sayfalardan ~46 px içeride başlıyor (PE-23, PE-24).**
   - Kanıt: `PHONE-EMP.md:39-40`. Gerçek uygulamada okuyucu için boş 40 px satır bilerek tutuluyor (`AnnouncementsPage.tsx:159-162`, KK-136, masaüstü kuralı). Telefonda ölçülmedi.
8. **YENİ-8 (leave: low / do: safe) Durum sekmelerinde "Unpublished" yok, Expired ve Couldn't publish ayrılmıyor.**
   - Unpublished kayıtlar yalnız "All"da görünüyor (`:170`).
   - K19 bunları etiket sayıyor, ayrı sekme istemiyor; prototip de "All"da tutuyor (AL18). Yalnız kayıt için yazıldı, iş açılmaz.
   - Önerim: BL numarası vermeden kapatılsın.
9. **YENİ-9 (leave: low / do: safe) Çalışanın okuma penceresi yöneticinin kilitli formu.**
   - Çalışan "View announcement" deyince Publish at, Expires at ve dört hedef seçicisi gri hâlde görünüyor (`:640-784`, `fieldset disabled`). Hedefin nasıl kurulduğu (roller, departmanlar) çalışana açık.
   - KARARLAR:204'te "çalışanın duyuruyu pencere açmadan görmesi" açık konu olarak duruyor. Soru S3.

Sınırda YENİ:
- **YENİ-S1 (leave: low / do: safe) Duyuru Notifications'ta "Couldn't publish" bildirimi olarak hiç doğmuyor (K21).** Üretici bu ekranın verisi (YENİ-1'in içinde); bildirimin görünümü ekran 9'un.

## 5. Sınırda (bu ekranın turunda kapanmaz)
- **EKRAN-05 (Workspace):**
  - BL-564: Announcements kutusu arşivli ve süresi dolmuşu gösteriyor; K28; dilim A1.
  - BL-666 (3) ve (6): ham "general" ve "New announcement" listeye gidiyor.
  - BL-810: "View all" yok.
  - BL-533: eski gelen kutusu.
  - BL-846: kontrast.
- **Ekran 8 (Important Dates):** BL-544, BL-546, BL-547, BL-548, BL-549, BL-550, BL-551, BL-676, BL-679; BL-537 (kapanış görünümü, Schedule DB-4); prototip P4 D9 (dalda).
- **Ekran 9 (Notifications):** BL-045, BL-046.
- **Ekran 10 (Settings → Acknowledgements):** BL-053.
- **Ortak bileşen (EKRAN-02 C3):**
  - BL-515: çekmece açıkken toast;
  - BL-255: `.job-secondary-button`; Announcements'ta Cancel ve Publish bu düğme;
  - BL-600: arama kenarı `#aeb9b4` (`styles.css:85`); Mert `#7f8c86`'yı seçti, uygulanmadı; Announcements'ta da;
  - BL-665: son satır menüsü kesilebilir; Announcements da aynı `overflow: hidden` çerçevede; ölçülmedi.
- **BL-593 (Announcements için bayat):** sayfa `role="table"`, `row`, `columnheader` + `aria-sort` taşıyor (`:274-318`). Madde Settings listeleri için açık kalır.
- **Ekranla ilgisiz, yalnız aynı migration dosyasında:**
  - BL-535: `request_account_deletion_v2_service` adı;
  - BL-686: prototip deneme sayfası "Announcement" (temizlik hatırlatması).

## 6. Sorular ve öneriler
Mert'e (§13 şablonu ekran oturumunda kurulur):
- **S1 (görsel, P04):** Yayındaki duyuruda Unpublish nerede durur?
  - Bugün: ekranda hiç yok.
  - Prototip yayındaki kayıtta gösteriyor.
  - Önerim: prototipteki yer tek ekranda gösterilir, Mert seçer.
  - Dayanak: yok — yeni karar (A5'te sayılmıyor).
- **S2 (temel model, P18 saat dilimi):** "Publish at / Expires at" kimin saatiyle?
  - Bugün yazanın tarayıcısının saatiyle (`toLocalInput` / `toIso`, `:1056-1065`).
  - Örnek: New York'taki owner Palo Alto için 09:00 seçer, duyuru Palo Alto'da 06:00'da çıkar.
  - Seçenekler: lokasyonun saat dilimi (çok lokasyonlu duyuruda belirsiz) / workspace saat dilimi / bugünkü gibi yazanın saati.
  - KARARLAR:204 bunu "konuşulmadı" diye bırakmış; önce sohbette konuşulmalı.
- **S3 (görsel):** Çalışanın okuma penceresi okuma görünümü mü olsun (prototip PHONE-EMP PE-22, tam ekran okuma), yoksa bugünkü kilitli form mu kalsın? (YENİ-9)

Koordinatöre:
- **K1:** EKRAN-07 görev dosyası FB-6.7'nin duyuru kısmının yerine geçer. Veri dilimleri:
  - K24 kişi listesi + K19 taslak gizliliği ve silme;
  - K22 onay anahtarı ve rütbe + K27 soru + K23 Remind + K26 geçmiş;
  - K21 bildirimi + K20 sunucu reddi + YENİ-5.

  Sonra web, sonra ekran. Hepsi R3.
- **K2:** `task/fb-6.7-ui` silinmez; ekran 8 turunun başında hasat edilir (YENİ-2).
- **K3:** Acknowledge sekmesindeki durum adları ("Not required", "Received", "Didn't acknowledge") prototipteki gibi kalsın; dayanak K22, K12 eki, P21.
- **K4:** BL-044 ekran 7 kapanışıyla kapansın. YENİ-8'e numara verilmesin.

## Kanıt komutları
- `git rev-parse HEAD origin/main` → `6e7ac0dd…` (ikisi aynı).
- `git log --oneline 44e41a54..origin/main -- apps/web/src/views/AnnouncementsPage.tsx apps/web/src/views/announcements-catalog.css apps/web/src/employee-hub/DashboardCommunications.tsx apps/api/src/communications` → boş.
- `ls supabase/migrations` → son duyuru migration'ları `20261004000000`, `20261005000000`; yerel DB `max(version)` = `20261007130000`.
- Yerel DB SELECT'leri (scratchpad `q1.sql`–`q5.sql`):
  - `announcements` 24 sütun, onay anahtarı yok;
  - enum `announcement_status` = draft, scheduled, published, unpublished;
  - 11 duyuru fonksiyonu, hatırlatma ya da silme yok;
  - 15 duyurunun 15'i published, onay satırı 12;
  - Manager / Admin / Owner 471/471'de `announcements.manage`, Employee'de yalnız `read`.
- `git rev-list --count $(git merge-base origin/main task/fb-6.7-ui)..origin/main` → 312; dal ucu `4d9226cc` (2026-10-04).
- `grep -o "BL-[0-9]* (leave" docs/plan/BACKLOG.md | sort -n | tail -1` → BL-857.

Yazılan dosya: yok (salt okuma; geçici SQL dosyaları yalnız scratchpad'de).
