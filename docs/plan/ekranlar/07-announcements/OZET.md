# EKRAN-07 Announcements — keşif özeti (2026-10-06, `6e7ac0dd`)

Kaynaklar: `A-backlog-prototip.md` (nf-planlama), `B-guvenlik.md` (nf-guvenlik, DENETİM SONUCU: BULGU VAR — kritik 0, yüksek 0, orta 3, düşük 3), `D-kod-davranis.md` (genel ajan). Üçü de salt okur; yerel DB'de yalnız SELECT, test koşulmadı. `C-gorsel.md` (görsel QA) §7'de.

Ekranın sınırı: sol menü → Announcements (`/app/announcements`, `/app/announcements/:id`), yazma / düzenleme / yayın / arşiv penceresi, çalışanın okuma ve "Acknowledge"ı, Employee view → Home → "Team notices" kartı, dakikalık yayın işi. Sınırda: Workspace kutusu (EKRAN-05), Important Dates (8), Notifications (9), Settings → Acknowledgements (10), ortak bileşenler (EKRAN-02 C3).

## 0. Ana tespit
Mert 2026-10-04/05'te duyurunun bütün hayatını yeniden kurdu (KARARLAR K19–K27, pencere kararları A5–A15, B2, B6, C1, D1). FB-6.7'nin duyuru kısmı aynı gün "durdu, yeniden planlanacak" diye kaldı (`tasks/FB-6.7.md:2`) ve o tarihten beri duyuruya dokunan migration yok (son ikisi `20261004000000`, `20261005000000`). Yani bugünkü ekran 2026-10-02 kurallarıyla çalışıyor: kişi listesi hedefi, onay anahtarı, onay / geçmiş sekmeleri, Remind, Unpublish ve Restore düğmesi yok; "Delete" aslında arşivliyor.
Güvenlik tabanı sağlam: başka workspace'e yol yok, M2 ve rütbe kuralı tutuyor, tablolar ve fonksiyonlar kapalı, "hayır" sözleşmesi tutuyor (B "Temiz olanlar").
Sonuç: EKRAN-07'nin görev dosyası FB-6.7'nin duyuru kısmının yerine geçer; önce veri (R3), sonra web, sonra ekran.

## 1. Tek liste (önem sırasıyla)
Eşleşme: BL numarası ya da YENİ. Kaynak sütunu raporun bulgu numarası.

| No | Ne (ekranda nerede, örnek) | Kaynak | leave / do | Eşleşme |
|---|---|---|---|---|
| E7-01 | **Arşivlenen duyuru geri alınamıyor, Unpublish yok; "Delete" arşivliyor.** Zeynep yanlışlıkla "Delete"e basınca duyuru Archived'e gider, ekrandan geri getiremez. Sunucu (`unpublish`, `restore`) ve API hazır, web yalnız `publish` / `archive` çağırıyor (`AnnouncementsPage.tsx:564-571`). K8, B1 | D1, A BL-543 | high / safe | BL-543 (geri alma eksiği eklenir) |
| E7-02 | **Seçilmemiş müdür, admin ve owner duyuruyu kendiliğinden alıyor.** Ayşe yalnız Kadıköy çalışanlarına yazar; eş müdür Hande, admin ve owner da bildirim alır. "Yalnız çalışanlar" hedefinde bile 1 owner + 1 admin + 2 müdür alıcı (SELECT). Eski K5, duyuru için ters çevrildi (K5 eki, K24); anti-hedef "bildirim gürültüsü" | D2, B3 | medium / risky | YENİ |
| E7-03 | **Zamanlanmış duyuru yayın anında yetki sorulmadan çıkıyor.** Ayşe Cuma 09:00'a duyuru kurar, Perşembe çalışana düşürülür ya da işten çıkar; Cuma duyuru Ayşe'nin adıyla gider. `announcement_release` (`20261005000000:794-830`) çekirdeğe sormuyor; §9 fail-open yasağı, K22 "rütbe yayın anındaki rol" | B1 | medium / moderate | YENİ |
| E7-04 | **Hiç yayınlanmamış taslak yazarından başkasına görünüyor, onlar yayınlayabiliyor; "Delete" taslağı silmiyor, arşivliyor.** KadıköyMüdür1'in yarım "Saat ücreti değişiyor" taslağını KadıköyMüdür2 yayınlayabilir. K19 | B2, D10 | medium / risky | YENİ (silme kısmı BL-543) |
| E7-05 | **İçerik değişince onaylar sorulmadan ve geri dönüşsüz siliniyor.** Zeynep tek harf düzeltir, 20 onay ve saatleri gider, herkese yeniden bildirim (`20261005000000:935-976`). K27, K4 eki, K26 | B4, D5 | medium / moderate | YENİ |
| E7-06 | **Hedef sabit kişi listesi değil, kural; her okumada yeniden hesaplanıyor.** Sonradan işe giren garson eski duyuruyu görür ve onaylar; başka lokasyona taşınan kişi duyuruyu kaybeder. Onaylayan sayısı alıcı sayısını geçebilir. Boş hedef "herkes" demek; K24'e göre Publish kilitli olmalı | D3, A §3 | medium / risky | YENİ (metin kısmı BL-678) |
| E7-07 | **Onay anahtarı ve rütbe kuralı yok; sayım herkesi sayıyor.** Onay istenmemiş duyuruda da "Acknowledge" çıkıyor; eş müdür, admin, owner onaylıyor ve sayılıyor (müdür duyurularında alıcıların 15 owner, 15 admin, 10 eş müdür). K22 | D4, B5, A | medium / risky | BL-675 (değişmiş: veri modeli + sunucu) |
| E7-08 | **Onay takibi yok:** kim onayladı listesi, "N of M", Remind, History. Sunucu sayıları gönderiyor, web okumuyor. K23, K26, B6, C1 | D6, A §3 | medium / moderate | YENİ |
| E7-09 | **Süresi dolan ya da yayınlanamayan duyuru listede "Published" / "Scheduled" görünüyor; yazara "Couldn't publish" bildirimi gitmiyor.** Sunucunun `display_status` alanı kullanılmıyor (`AnnouncementsPage.tsx:1043-1045`). K21, K12, A9 / A10 | D7, A §3 | medium / safe (bildirim: moderate) | YENİ |
| E7-10 | **Geçmiş yayın ya da bitiş tarihi kabul ediliyor; yayındaki duyuru geçmiş bitişle kaydedilince sessizce herkesten çekiliyor.** K20, P09 | D9 | medium / safe | YENİ |
| E7-11 | **Ham geliştirici metni ekranda:** "stale announcement revision", "expiry must follow publication", "Not allowed"; istemci doğrulaması Save'i nedensiz kapatıyor | D11, A YENİ-3 | medium / safe | YENİ (BL-654 ailesi) |
| E7-12 | **Uzatılan süresi dolmuş duyuru onaylayanlara da yeniden bildirim gönderiyor** (yalnız onaylamamışlara gitmeli; K12 eki) | D8 | medium / safe | YENİ |
| E7-13 | **Sayfalama yok; Employee view → Home kartı 2 duyuru için bütün listeyi dakikada bir okuyor ve her okuma yayın işini tetikleyip satır kilitliyor.** B önerisi: yayını yalnız dakikalık işe bırak, okuma salt okuma olsun | D17, A, B öneri | medium / safe (kart: moderate) | BL-787 + YENİ |
| E7-14 | **Web kapısı izin anahtarına bakıyor, sunucu bakmıyor.** Settings → Roles'ta Announcements "None" yapılan rol menüyü görmez ama API listeyi verir, bildirim gider. Karar gerekir (S4) | B6 | low / moderate | BL-176 (değişmiş) |
| E7-15 | **Hiç yayınlanmamış zamanlanmış duyuru, süresi dolunca ya da Unpublish'le "Unpublished" oluyor ve paylaşımlı hâle geliyor** (K19 / K8) | A YENİ-5, D19, B | low / moderate | YENİ |
| E7-16 | **Employee view → Home → "Team notices":** arşivli ve kişiye gelmeyen duyuruyu gösteriyor; kategori ham "general"; kart adı menüyle farklı; boş metin "Enjoy a little quiet." (anti-hedef) | D15, A YENİ-6 | low / safe | YENİ |
| E7-17 | **Müdür birden çok lokasyon ya da "All locations" seçebiliyor, Save'de nedensiz "Not allowed"** (K1) | D12 | low / safe | YENİ |
| E7-18 | **Yanlış başarı mesajları:** yayındaki duyuruda "saved as a draft", zamanlamada "Scheduled for 0 recipients", yeniden yayında yalnız onaylamamış sayısı, "1 recipients" | D13, A YENİ-4 | low / safe | YENİ |
| E7-19 | **Arşivli duyuruda "Acknowledge" görünüyor, basınca sessizce başarısız** | D14 | low / safe | YENİ |
| E7-20 | **Yeniden yayın ilk yayın tarihini siliyor** (`published_at` yenileniyor; History olmadığı için hiçbir yerde kalmıyor) | D19 | low / safe | YENİ |
| E7-21 | **Kullanılmayan alanlar ve uçlar, ikiz istek istemcisi** (`communications-data.ts:30-57`); E7-01/08/09 gelince çoğu canlanır, kalanı silinir (P01) | D18 | low / safe | YENİ |
| E7-22 | **Çalışanın okuma penceresi yöneticinin kilitli formu:** Publish at, Expires at ve hedef seçicileri gri hâlde görünüyor (S3) | A YENİ-9 | low / safe | YENİ |
| E7-23 | Hedef metni hep "All departments · All jobs" | A | low / safe | BL-678 (E7-06 ile kapanır) |
| E7-24 | "Acknowledge" yazısı 16 px (12 olmalı), `.jobs-settings-page button { font: inherit }` | A | medium / safe | BL-541 |
| E7-25 | Hedef daraltılırken gönderici yarışı | A, D | low / moderate | BL-539 |
| E7-26 | Telefon: başlık kesiliyor, kart satırı yok, çalışan sayfasında boş bant (PE-23/24). C görsel QA ölçer | A | medium / moderate | BL-542, BL-599, YENİ-7 |
| E7-27 | Yayın ve bitiş saati yazanın tarayıcısının saat diliminde (S2, temel model) | D16, A S2 | low / moderate | YENİ (karar) |

Test boşlukları (D "Test boşlukları"): `announcements_and_dates_follow_k1_k6.test.sql` §6 ve §7 eski kuralı doğruluyor — yeniden planda yeniden yazılır, gevşetilmez; K19, K20, K22, K24, K12 eki, K21 ve "onay ≤ alıcı" için pgTAP yok; vitest'te Restore / Unpublish, başarı mesajları, hata metni ve Home kartının arşiv süzgeci yok; e2e'de yalnız `announcement-reaches-its-people.spec.ts`.

## 2. Prototipten taşı / bırak (A §2)
- **Taşı (27, hepsi KARARLAR'da yazılı):** onay anahtarı (K22), kişi listesi hedefi + Audience sekmesi (K24, D1), Acknowledge sekmesi (B6), Remind (K23), History (C1, K26), sekmeler + başlık çipi (A12, A13), tek yeşil düğme (A5, A6), "onaylar kalsın / sıfırlansın" sorusu (K27), kapatırken soru (A7), Archive / Delete / Restore (B1, K19, K8), Couldn't publish / Expired görünümü (A9, A10, K21, K12), Unpublish → Restore anlamı, durum çipleri, geçmiş tarih kilidi (K20), boş hâl, taslak gizliliği (K19), yazara "Couldn't publish" bildirimi (K21), telefonda kart satırı ve ortada soru pencereleri, çalışan sayfası boşlukları. Satır satır: A §2 tablosu.
- **Bırak (3):** G10 (iki tık onayının bozulma biçimi; gerçek `ConfirmButton` doğru), AW6 (Message satır tahmini; gerçek uygulama daha iyi), AW38 (mockup düğmeleri).
- **Varyant / soru (4):** Unpublish düğmesinin yeri (S1); "Only you" etiketi (K19 kuralı var, etiket yalnız prototipte; tek satırla gösterilir); Acknowledge sekmesindeki durum adları (koordinatör, K3); telefonda süzgeç dizilişi (G2 telefon konuşmasına bağlı).

## 3. Koordinatör kararları — KK-182 (2026-10-06; önerildiği gibi kabul, notlarla)
Koordinatörün notları: K3 kabul ama metin ekranda görünür — görev dosyasında "Mert ekran görüntüsünde görür". K5 kabul, plan olarak: kodun çalışma biçimi değişiyor; ekran 7 turunda yapılır, gece değil. S2 ayrı soru açılmaz; SABAH-SORULAR S25'in yanına not düşüldü (aynı temel model).
- **K1 — Görev dosyası:** EKRAN-07 görev dosyası FB-6.7'nin duyuru kısmının yerine geçer. Veri dilimleri (R3, `nf-db` + `nf-backend`): (a) K24 kişi listesi + K19 taslak gizliliği ve silme + E7-02 alıcı kuralı; (b) K22 anahtar ve rütbe + K27 soru + K23 Remind + K26 geçmiş; (c) K21 bildirim + K20 sunucu reddi + E7-03 yayın anında yetki + E7-15. Sonra web, sonra ekran. Dayanak: KARARLAR K19–K27; ILKELER P02 (çekirdekte tam çözüm).
- **K2 — Eski dal:** `task/fb-6.7-ui` (16 commit, main'in 312 gerisinde, #170 öncesi kurallar) duyuru kısmı birleştirilmez; dal silinmez, ekran 8 turunun başında kapalı gün ve önemli tarih parçaları için hasat edilir. Dayanak: ILKELER P22 (en güncel karar kazanır).
- **K3 — Durum adları:** Acknowledge sekmesindeki "Not required", "Received", "Didn't acknowledge" prototipteki gibi kalır. Dayanak: K22, K12 eki, P21.
- **K4 — Kayıt:** BL-044 ("Announcements polish") ekran 7 kapanışıyla kapanır; A YENİ-8 (Unpublished sekmesi yok) numara almaz (K19 ayrı sekme istemiyor).
- **K5 — Yayın yalnız dakikalık işte:** liste okuması `announcement_release`'i tetiklemesin; yayın tek yerde, yetki sorusu (E7-03) da orada. Dayanak: §9 (tek yerde yetki), B önerisi. Teknik iç karar (P19).
- **K6 — Sayfalama istemcide:** duyuru sayısı belgeden az; 25 / 50 / 100 istemci tarafında (EKRAN-06 Settings → Documents'la aynı yol). Dayanak: Mert 2026-10-06 (BL-787), P19.

## 4. Mert'e sorulacaklar (ekran 7 turunda; sabah listesine eklenmez — koordinatör kararı)
- **S1 (görsel, P04):** Yayındaki duyuruda Unpublish nerede durur? Bugün ekranda hiç yok; prototip yayındaki kayıtta gösteriyor. Öneri: prototipteki yer gerçek ekranda gösterilir, Mert seçer. Dayanak: yok — yeni karar (A5 sol altı saymıyor).
- **S2 (temel model, P18 — önce sohbet):** "Publish at / Expires at" kimin saatiyle? Bugün yazanın tarayıcısı: New York'taki owner Palo Alto için 09:00 seçer, duyuru Palo Alto'da 06:00'da çıkar. Seçenekler: lokasyonun saat dilimi (çok lokasyonlu duyuruda belirsiz) / workspace saat dilimi / bugünkü gibi yazanın saati. Sabah listesindeki S25 ("bu hafta" hangi saate göre) ile aynı aile; birlikte konuşulmalı.
- **S3 (görsel):** Çalışanın okuma penceresi okuma görünümü mü olsun (prototip PE-22, tam ekran okuma) yoksa bugünkü kilitli form mu? (E7-22)
- **S4 (ürün kuralı):** Duyuru okumak bir rolden kapatılabilsin mi? Bugün Settings → Roles'ta "None" seçilebiliyor ama sunucu yine gösteriyor (E7-14). (a) Evet: sunucu izni sorar. (b) Hayır: ayar kalkar, herkes okur (önerilen). Dayanak önerisi: ILKELER A anti-hedef "ayar cehennemi" + K1 (duyuru herkese yazılır) — Mert teyit eder.

## 5. Sınırda (başka ekranın işi)
- EKRAN-05 Workspace: BL-564 (kutu arşivliyi gösteriyor, K28), BL-666 (3)(6), BL-810, BL-533, BL-846.
- Ekran 8 Important Dates: BL-544, BL-546–551, BL-676, BL-679; `task/fb-6.7-ui` hasadı (K2).
- Ekran 9 Notifications: BL-045, BL-046; "Couldn't publish" bildiriminin görünümü (A YENİ-S1).
- Ekran 10 Settings → Acknowledgements: BL-053.
- Ortak bileşen (EKRAN-02 C3): BL-515, BL-255, BL-600, BL-665.
- BL-593 Announcements için bayat (sayfa `role="table"` + `aria-sort`); madde Settings listeleri için açık kalır.
- B "Sınırda": Notifications politikası `account_notification_self_read` doğrudan `auth.uid()` (var olan); `project_notification_inbox_exchange_base` adı (sayaç).

## 6. Kapanış durumu
- Keşif: A, B, D yazıldı (2026-10-06 akşam). C (görsel QA) ağır iş, izinle.
- Koordinatör kararları KK-182 (§3). YENİ bulgular BL-858…878 aldı (E7-02 → BL-858, E7-03 → 859, E7-04 → 860, E7-05 → 861, E7-06 → 862, E7-08 → 863, E7-09 → 864, E7-10 → 865, E7-11 → 866, E7-12 → 867, E7-13 → 868, E7-15 → 869, E7-16 → 870, E7-17 → 871, E7-18 → 872, E7-19 → 873, E7-20 → 874, E7-21 → 875, E7-22 → 876, E7-26 → 877, E7-27 → 878); var olanlara ek: BL-543 (E7-01), BL-675 (E7-07), BL-176 (E7-14), BL-787 (K6), BL-044 (K4). Görev dosyası `tasks/EKRAN-07-ANNOUNCEMENTS.md`.
- Bekleyen: Mert'in S1, S3, S4 cevabı (ekran 7 turu); S2 = SABAH S25 sohbeti; C görsel QA (izinle).

## 7. C görsel QA (2026-10-06, `20332d46`)

Rapor aynen: `C-gorsel.md` (nf-gorsel-qa, KARAR: DEĞİŞİKLİK İSTE — keşif turu, dal yok; 18 bulgu: orta 8, düşük 10). Görüntüler `artifacts/nf-gorsel-qa/EKRAN-07/` (ana klasör, gitignore'da). Roller owner, tek lokasyon müdürü (Ayşe), çalışan (Ali); 1440 ve 390. Veri yazılmadı: GET dışı istekler tarayıcıda engellendi; tek duyurulu test dünyası okuma cevabı tarayıcıda zenginleştirilerek ölçüldü.
- Yeni maddeler: BL-879 (owner ekranı yüklenirken / hatada çalışan görünümünde), BL-880 (arama kutusunda odak görünmüyor; ortak bileşen), BL-881 (telefonda taslak satırı oluşturma tarihini gösteriyor).
- Var olan maddelere ek kanıt: BL-541 (değişmiş: 13 px, 24 px düğme), BL-864, BL-871, BL-873.
- Kalan bulgular keşifteki maddeleri ve görev dosyasının C1'ini doğruluyor: Publish beyaz ve tek yeşil düğme yok (A5 / A6), Esc uzun metni sormadan atıyor (A7, P26), ham "Internal server error" (BL-866), telefon (BL-599, BL-542, BL-877), sekmelerde ok tuşu (BL-602), boş hâl (C1), okuma penceresi (BL-876), Home kartı (BL-870), hedef metni (BL-678), Delete / Unpublish (BL-543), sayfalama (BL-868 / BL-787). Öneriler (zevk) raporun "Öneriler" bölümünde, BL almadı.
- Sağlam: sayfa iskeleti, sütun oranları (40 / 26 / 16 / 18), yeşil "New announcement", durum çipleri, kontrast (en düşük 4,67:1), pencere odak tuzağı ve Esc dönüşü, iki tık kırmızı Delete.
