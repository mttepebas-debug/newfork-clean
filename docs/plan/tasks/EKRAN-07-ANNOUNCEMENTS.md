# EKRAN-07 Announcements — ekranı "bitmiş" tanımına getirmek
Status: draft — 2026-10-06 (`nf-planlama`, koordinatörün görevi; ekran planının 7. adımı; KK-182).
Session: -   Branch: task/ekran-07-<dilim>   Worktree: newfork-wt/ekran-07-<dilim>   DB: A1–A3 ve D `db.lock` ile
Reviewer: dilim başına (aşağıdaki tablo). A1, A2, A3 ve B1 `nf-guvenlik` zorunlu (alıcı kuralı, taslak görünürlüğü, onay ve rütbe, yayın anında yetki); ekran değişen C1 `nf-gorsel-qa`.
Risk sınıfı (toplam): **R3** — alıcı ve görünürlük kuralı çekirdekte değişiyor (BL-858, BL-860, BL-862), onay modeli ve şema (BL-675, BL-861, BL-863), yayın işi yetki soruyor (BL-859).
Hat sırası (koordinatör, 2026-10-06, KK-182): **EKRAN-06'dan sonra** — veri hattı EKRAN-06 A1 bitince A1; web hattı EKRAN-06 B1'den sonra B1; arayüz hattı EKRAN-06 V / C1'den sonra V / C1. K5 (yayın yalnız dakikalık işte) kodun çalışma biçimini değiştirdiği için ekran 7 turunda yapılır, gece değil.
**Yerine geçtiği iş:** FB-6.7'nin duyuru kısmı (`tasks/FB-6.7.md:2` "durdu, yeniden planlanacak", 2026-10-04 #170). `task/fb-6.7-ui` dalının duyuru kısmı birleştirilmez; dal ekran 8'de hasat edilir (KK-182 K2).

**Kaynaklar:** keşif `docs/plan/ekranlar/07-announcements/OZET.md` (E7-01…E7-27, §2 prototip, §3 KK-182, §4 S1–S4) ve `A-backlog-prototip.md`, `B-guvenlik.md`, `D-kod-davranis.md`; KARARLAR "Duyurular, önemli tarihler ve kapalı gün" (K1–K28 ve ekleri; pencere kararları A5–A15, B1, B2, B6, C1, D1); ILKELER P07, P09, P10, P22, P26; prototip `newfork-prototype/proto-audit/P4.md`, `P5.md` EV-80…83, `PHONE-MGR2.md:19-22`, `PHONE-EMP.md` PE-22…24.

**Tazelik 2026-10-06 (`origin/main` `6e7ac0dd`):** keşif aynı gün; ekranın dosyaları `44e41a54`'ten beri değişmedi. Dilim başlarken kendi ölçümünü yapar.

## Goal
Announcements ekranını (sol menü → Announcements: liste, sekmeler, süzgeçler, satır menüsü; yazma / düzenleme penceresi ve sekmeleri; yayın, zamanlama, Unpublish, Archive, Restore, Delete; çalışanın okuması ve "Acknowledge"ı; Employee view → Home → duyuru kartı; dakikalık yayın işi) Mert'in 2026-10-04/05 kurallarına (K19–K27) getirmek: hedef sabit kişi listesi, onay anahtarı ve rütbe, onay takibi, Remind, History, geri alınabilir yaşam döngüsü; ham metin ve yanlış durum kalmaz.

Bir kişi için: Admin Zeynep "Yeni menü tadımı"nı yazar, Audience sekmesinde Kadıköy'deki 24 kişiyi listeye alır, "Ask people to acknowledge"ı açar, Salı 09:00'a zamanlar. Salı duyuru çıkar (Zeynep o an hâlâ admin olduğu için); yalnız listedeki 24 kişi bildirim alır, eş müdürler ve owner almaz. Zeynep Acknowledge sekmesinde "18 of 24" görür, "Remind 6 people"a basar; History'de "Published by Zeynep · Oct 14, 9:00 AM". Yanlışlıkla Archive'e basarsa Restore ile geri getirir.

## Ürün kuralları (yazıldığı gibi uygulanır)
- **KK-182 (koordinatör, 2026-10-06; OZET §3):** K1 bu dosya FB-6.7 duyuru kısmının yerine geçer; K2 `task/fb-6.7-ui` duyuru kısmı birleşmez; K3 Acknowledge sekmesi durum adları prototipteki gibi ("Not required", "Received", "Didn't acknowledge") — metin ekranda görünür, **Mert ekran görüntüsünde görür**; K4 BL-044 ekran 7 kapanışıyla kapanır; K5 yayın yalnız dakikalık işte, liste okuması salt okuma (ekran 7 turunda, gece değil); K6 sayfalama istemcide (25 / 50 / 100).
- **KARARLAR K19–K27** (özet; metin KARARLAR'da): K19 hiç yayınlanmamış taslak yalnız yazarınındır, arşivlenmez, iki tıkla silinir; K20 geçmiş tarih seçilemez, sunucu da reddeder; K21 yayın hatasında yalnız yazara bir bildirim, listede "Couldn't publish"; K22 onay anahtarı yeni duyuruda kapalı, sorumlu = hedefte olup yayınlayandan alt rütbede olan, eş rütbe sayılmaz; K23 Remind yalnız "Not yet"lere, bir kez; K24 hedef sabit kişi listesi, yazar listede değil, boşsa Publish kilitli; K25 saati silinen zamanlanmış duyuru taslağa döner (bugün doğru); K26 / C1 History "<Action> by <Name>"; K27 onaylayan varsa "onaylar kalsın / sıfırlansın" sorulur; K8 yayınlanmış duyuru silinmez, Unpublish / Archive / Restore; K12 eki uzatmada yalnız onaylamamışa bildirim; K5 duyuru eki yalnız listedekiler alır.
- **Pencere kararları:** A5 / A6 sağ altta Cancel + tek yeşil düğme, Save pencereyi kapatmaz; A7 değişiklik varken kapatınca soru; A9 / A10 Couldn't publish ve Expired görünümü; A12 / A13 başlık çipi ve sekmeler (Details · Audience · Acknowledge · History); A15 kaydırma çubuğu ve onay kutusu; B1 adı "Archive", iki tık kırmızı; B2-A "Acknowledge again" (amber); B6 Acknowledge sekmesi; D1 Audience.
- **CLAUDE.md §9:** yetki yalnız çekirdekte (`announcement_release` dahil — BL-859); "hayır" sözleşmesi bugün doğru, korunur; ikiz ve ölü kod silinir (BL-875); tarayıcı diyaloğu yok.

## Açık sorular (CLAUDE.md §13; ekran 7 turunda Mert'e — metin OZET §4'te)
- **S1** — yayındaki duyuruda Unpublish nerede durur (görsel, P04): V'de gerçek ekranda prototipteki yer gösterilir. → BL-543; V + C1.
- **S2** — yayın / bitiş saati kimin saat dilimiyle (temel model, P18): ayrı soru açılmaz, SABAH-SORULAR S25 sohbetinde (KK-182). → BL-878; cevaptan sonra A3 + C1.
- **S3** — çalışanın okuma penceresi: okuma görünümü (PE-22) / bugünkü kilitli form (görsel). → BL-876; V + C1.
- **S4** — duyuru okumak rolden kapatılabilsin mi: (b) hayır, ayar kalkar (önerilen) / (a) evet, sunucu izni sorar. → BL-176; A1 (yalnız (a)) + B1.
- Cevap gelmeden yalnız ilgili kısım bekler; dilimin geri kalanı yürür.

## Bulgu → dilim eşlemesi
| Bulgu | Dilim | Backlog |
|---|---|---|
| E7-01 geri alma yok, Unpublish yok, "Delete" arşivliyor | C1 (+ B1 eylem bağlantısı; S1) | BL-543 |
| E7-02 seçilmemiş yönetici alıcı | A1 | BL-858 |
| E7-03 zamanlanmış yayında yetki sorulmuyor | A3 | BL-859 |
| E7-04 taslak görünürlüğü ve silme | A1 + B1 + C1 | BL-860 (+ BL-543) |
| E7-05 onaylar sorulmadan siliniyor | A2 + B1 + C1 | BL-861 |
| E7-06 hedef kural, kişi listesi değil | A1 + B1 + C1 | BL-862, BL-678 |
| E7-07 onay anahtarı ve rütbe | A2 + B1 + C1 | BL-675 |
| E7-08 onay takibi, Remind, History | A2 + B1 + C1 | BL-863 |
| E7-09 Expired / Couldn't publish | A3 (bildirim) + C1 (çip, görünüm) | BL-864 |
| E7-10 geçmiş tarih | A3 (sunucu reddi) + C1 (`min`, hata satırı) | BL-865 |
| E7-11 ham metin | B1 (hata eşleme) + C1 (metin) | BL-866 |
| E7-12 uzatmada yeniden bildirim | A2 | BL-867 |
| E7-13 Home kartı ve okumada yayın | A3 (okuma salt okuma, K5) + B1 (kartın okuması) + C1 (sayfalama, K6) | BL-868, BL-787 |
| E7-14 web kapısı / sunucu farkı | A1 (yalnız S4 (a)) + B1 (`can()`) | BL-176 |
| E7-15 zamanlanmış → Unpublished | A3 | BL-869 |
| E7-16 Home kartı içerik ve metin | C1 | BL-870 |
| E7-17 müdür çok lokasyon seçiyor | C1 (BL-862 seçicisiyle) | BL-871 |
| E7-18 yanlış başarı mesajları | C1 | BL-872 |
| E7-19 arşivde Acknowledge | C1 | BL-873 |
| E7-20 yeniden yayın ilk tarihi siliyor | A2 (History ile) | BL-874 |
| E7-21 ölü alanlar, ikiz istemci | B1 + C1 | BL-875 |
| E7-22 çalışanın okuma penceresi | V + C1 (S3) | BL-876 |
| E7-23 hedef metni | C1 (E7-06 ile) | BL-678 |
| E7-24 Acknowledge 16 px | C1 | BL-541 |
| E7-25 daraltma yarışı | A1 (kişi listesiyle) | BL-539 |
| E7-26 telefon | C1 (BL-599 kart satırı kararı) | BL-542, BL-599, BL-877 |
| E7-27 saat dilimi | S2 / S25 cevabından sonra A3 + C1 | BL-878 |
| Prototip taşı (27 madde, OZET §2) | C1 (+ veri dilimleri) | yukarıdakiler |
| Test boşlukları (OZET §1 sonu) | ilgili dilim + D | — |

## In scope (dilimler)
Sıra kuralı (CLAUDE.md §4): veri önce, sunum sonra; aynı dosyaya iki oturum aynı anda konmaz.

### V — varyantlar (`nf-arayuz`; R1, main'e girmez)
- **Ne:** gerçek uygulamada DEV'de query param ile, 1440 ve 390: (1) Unpublish düğmesinin yeri (S1; prototipteki yer + 1 alternatif); (2) çalışanın okuma görünümü (S3; PE-22 tam ekran okuma / bugünkü form); (3) "Only you" etiketi (K19 taslak) tek satırla.
- **Bağımlılık:** EKRAN-06 V (hat sırası).
- **Done when:** ekran görüntüleri `artifacts/nf-arayuz/EKRAN-07/varyant/`; seçimler KARARLAR "Ekran kararları → Announcements"a yazıldı (koordinatör); dal silindi.
- **Reviewer:** yok (Mert seçer).

### A1 — Hedef kişi listesi, alıcı kuralı, taslak görünürlüğü (`nf-db`; R3)
- **Ne:** BL-862 (hedef sabit kişi listesi tablosu; yayında liste dondurulur; sonradan katılan kendiliğinden eklenmez; lokasyonu değişen listede kalır; boş listede yayın reddi; yazar listede değil — KK-89); BL-858 (alıcı yalnız listedekiler; "lokasyonu yönetiyor" kendiliğinden alıcı kuralı duyurudan kalkar); BL-860 (hiç yayınlanmamış taslak yalnız yazarına görünür ve düzenlenebilir; taslak için gerçek silme fonksiyonu, katalogda sınıflı); BL-539 (daraltma = kişi çıkarma; gönderici yarışı kilitle kapanır); S4 (a) ise BL-176'nın sunucu yarısı.
- **Touches:** `supabase/migrations/<yeni>.sql`, `supabase/tests/announcements_and_dates_follow_k1_k6.test.sql` (§6, §7 eski kuralı doğruluyor: yeniden yazılır, gevşetilmez), yeni pgTAP dosyası (K19, K24), `authorization_coverage.test.sql`, `retired_objects_stay_gone.test.sql`, `ci-green.txt`.
- **Bağımlılık:** EKRAN-06 A1 main'de (hat sırası; aynı `authorization_*` ve `ci-green.txt`).
- **Done when:** (a) yayından sonra işe giren kişi listede değil, duyuruyu görmüyor; lokasyonu değişen kişi görmeye devam ediyor (pgTAP, önce kırmızı); (b) "yalnız çalışanlar" hedefli duyuruda owner / admin / eş müdür alıcı değil (pgTAP); (c) başkasının hiç yayınlanmamış taslağı listede yok, düzenleme / yayın `authz.out_of_scope` (pgTAP); (d) taslak silinince satır yok, arşivde görünmüyor; (e) boş listede yayın reddedilir; (f) eski "kendiliğinden alıcı" yolu silindi, `retired_objects_stay_gone`'da.
- **Test plan:** kırmızı pgTAP → migration (tek transaction + rollback denemesi) → `test:db` (`db.lock`, tek ağır iş). Canlıya migration CLAUDE.md §8 sürekli yetki koşullarıyla (yedek, ONAY, OPS-03).
- **Reviewer:** `nf-guvenlik` zorunlu.

### A2 — Onay modeli, K27 sorusu, Remind, History (`nf-db`; R3)
- **Ne:** BL-675 (duyuruda onay anahtarı sütunu, yeni duyuruda kapalı; `acknowledge_announcement_service` yalnız sorumluyu kabul eder — listede olup yayınlayandan alt rütbede; `acknowledged_count` / alıcı sayısı yalnız sorumlular); BL-861 (içerik değişince onaylar kendiliğinden silinmez; kayıt "kalsın / sıfırlansın" seçimini parametre alır; sıfırlananlar History'de kalır); BL-863 (kişi bazlı onay okuması: Received / Not yet / Not required / Didn't acknowledge; "Remind" servisi yalnız "Not yet"lere, bir kez; duyuru geçmiş tablosu "<Action> by <Name>", eski → yeni); BL-867 (uzatmada yalnız onaylamamışa bildirim); BL-874 (ilk yayın tarihi korunur, yeniden yayın History'ye yazılır).
- **Touches:** `supabase/migrations/<yeni>.sql`, yeni pgTAP (K22, K23, K26, K27, K12 eki, "onay ≤ alıcı"), `authorization_coverage.test.sql`, `ci-green.txt`.
- **Bağımlılık:** A1 main'de.
- **Done when:** eş müdür ve owner'ın onayı reddedilir ya da sayılmaz, çalışanınki sayılır (pgTAP, önce kırmızı); anahtar kapalı duyuruda onay `authz.*`; içerik değişikliğinde "kalsın" seçilince onaylar duruyor, "sıfırlansın"da History'de satır var; Remind ikinci kez reddedilir; uzatmada onaylayana bildirim yok; `acknowledged_count ≤ recipient_count` (pgTAP).
- **Reviewer:** `nf-guvenlik` zorunlu.

### A3 — Yayın işi: yetki, hata bildirimi, tarih reddi, salt okuma (`nf-db`; R3)
- **Ne:** BL-859 (`announcement_release` yayın anında yazarın yetkisini çekirdeğe sorar; yetkisi düşmüşse yayınlamaz, "Couldn't publish" olur); BL-864 (yayın hatasında yalnız yazara tek bildirim, K21); BL-865 (sunucu geçmiş yayın / bitiş tarihini reddeder; yayındaki duyuruda geçmiş bitiş sessizce çekmez); BL-869 (hiç yayınlanmamış zamanlanmış duyuru süresi dolunca "Unpublished" olmaz); BL-868 + KK-182 K5 (liste okuması `announcement_release`'i çağırmaz; okuma fonksiyonu salt okuma, yayın yalnız `cron` işinde); S2 / S25 cevabından sonra BL-878'in sunucu yarısı.
- **Touches:** `supabase/migrations/<yeni>.sql`, `supabase/tests/past_dates_and_ended_announcements.test.sql`, yeni pgTAP (K20, K21, yetkisi düşen yazar), `ci-green.txt`.
- **Bağımlılık:** A1 main'de (A2 ile aynı fonksiyonlara dokunuyorsa A2'den sonra).
- **Done when:** yetkisi düşen yazarın zamanlanmış duyurusu yayınlanmaz ve yazara tek "Couldn't publish" bildirimi gider (pgTAP, gerçek rol düşürmeyle, elle tetikleyici değil); geçmiş tarih anlamlı kodla reddedilir; `get_announcements_service` yazmıyor (`provolatile` ve SELECT ile); hiç yayınlanmamış duyuru "unpublished" olmuyor.
- **Reviewer:** `nf-guvenlik` zorunlu (ertelenen eylem yürütme anında yetkiyi soruyor mu).

### B1 — API, shared, web veri katmanı (`nf-backend`; R3)
- **Ne:** shared şema ve API uçları: kişi listesi hedefi (okuma + kaydetme), onay anahtarı, K27 seçimi, Remind ucu, kişi bazlı onay okuması, History okuması, taslak silme ucu; web veri katmanı Unpublish / Restore / Delete eylemlerini bağlar (BL-543); BL-866 (hata eşleme: 40001 → yenileme + kısa metin; ham cümle ekrana çıkmaz); BL-875 (ikiz `communications-data.ts` fetch'i ortak istemciye; kullanılmayan alanlar ya bağlanır ya silinir); BL-868 (Home kartı yalnız gereken duyuruları okur, dakikalık tam liste okuması kalkar); BL-176 (S4 (b) ise web `can('announcement.read')`, `permissions.includes` kalkar; (a) ise sunucu sorusuyla aynı).
- **Touches:** `packages/shared/src/communications.ts`, `apps/api/src/communications/communication-routes.ts`, `communication-service.ts` (+ testler), `apps/api/src/http-error.ts` (yalnız duyuru ipuçları), `apps/web/src/communications/communications-data.ts`, `apps/web/src/auth/**` (yalnız S4 kısmı), `App.tsx` rota kapısı (yalnız S4).
- **Bağımlılık:** A1–A3 main'de; EKRAN-06 B1 main'de (hat sırası).
- **Done when:** API vitest'leri yeni uçlarda önce kırmızı; web'de duyuru ekranlarında ham `error.message` kullanımı 0 (grep); `permissions.includes("announcements.read")` 0 (S4 (b) ise); Home kartı dakikada tam liste okumuyor (vitest).
- **Reviewer:** `nf-guvenlik` zorunlu.

### C1 — Liste, pencere ve çalışan görünümü (`nf-arayuz`; R2)
- **Ne:** pencere sekmeleri Details · Audience · Acknowledge · History (A12, A13), sağ altta Cancel + tek yeşil düğme, Save pencereyi kapatmaz (A5, A6), kapatırken soru (A7), K27 sorusu, Audience kişi listesi (D1, K24; BL-678 metni, BL-871 seçicisi), onay anahtarı (K22), Acknowledge sekmesi (B6; K3 adları), Remind (K23), History (C1); sol altta Archive iki tık kırmızı / hiç yayınlanmamışta Delete / arşivlide Restore / yayındakinde Unpublish (BL-543, S1 seçimi); durum çipleri Couldn't publish, Expired, Unpublished ve A9 / A10 görünümü (BL-864); geçmiş tarih kilidi ve tek hata satırı (BL-865); BL-866 metni, BL-872 başarı mesajları, BL-873 (arşivde Acknowledge yok), BL-870 Home kartı (arşiv süzgeci, kategori adı, kart adı "Announcements", boş metin), BL-876 okuma görünümü (S3), BL-541, BL-542 / BL-599 / BL-877 telefon (kart satırı kararı), sayfalama 25 / 50 / 100 istemcide (K6), boş hâl (açık zemin, yeşil daire, düğme), B2-A "Acknowledge again".
- **Kısa metin önerileri (ILKELER P21; KK-182 K3; Mert ekran görüntüsünde görür):**
  - Acknowledge sekmesi: **"Received"**, **"Not yet"**, **"Not required"**, süre dolunca **"Didn't acknowledge"**.
  - K27 sorusu: **"People already acknowledged this. Keep their acknowledgements?"** — **"Keep"** / **"Ask again"**.
  - 409 (BL-866): **"This announcement changed. You're seeing the latest version."**; öteki kayıt hatası **"Couldn't save. Try again."**
  - Couldn't publish (K21): çip **"Couldn't publish"**, pencerede **"Try again"**.
  - Başarı (BL-872): **"Saved."**, **"Published to 24 people."**, **"Scheduled for Oct 14, 9:00 AM."**
  - Home kartı boş hâli (BL-870): **"No announcements"**.
- **Touches:** `apps/web/src/views/AnnouncementsPage.tsx` (gerekirse pencere ayrı bileşene), `apps/web/src/views/announcements-catalog.css`, `apps/web/src/employee-hub/DashboardCommunications.tsx`, `apps/web/src/views/CommunicationPages.test.tsx`, `EmployeeHubPage.test.tsx`.
- **Bağımlılık:** B1 main'de; S1, S3, V seçimleri; EKRAN-06 C1 main'de (hat sırası; `styles.css` ve `jobs-settings.css` sıcak).
- **Done when:** önce / sonra ekran görüntüsü 1440 + 390 (owner, admin, tek lokasyon müdürü, çalışan) `artifacts/nf-arayuz/EKRAN-07/C1/`; ekranda ham metin yok (grep); Archive iki tık, Restore çalışıyor; "Scheduled for 0 recipients" 0 (grep); `nf-gorsel-qa` ONAY.
- **Reviewer:** `nf-gorsel-qa`.

### D — e2e (`nf-test`; R2)
- **Ne:** `e2e/flows/announcement-reaches-its-people.spec.ts`'e ve yeni akışlara: kişi listesiyle yayın (yalnız listedekiler alır), onay anahtarı ve sayım, Remind, içerik değişikliğinde "Keep", Unpublish → Restore, Archive → Restore, zamanlanmış yayın, süre dolumu, taslak gizliliği (öteki müdür görmüyor).
- **Touches:** `e2e/flows/announcement-*.spec.ts`, `e2e/fixtures/world.ts` (yalnız gerekiyorsa).
- **Bağımlılık:** C1 main'de; `db.lock`; CI boşken (tek ağır iş).
- **Done when:** main CI e2e'de yeşil; `skip` / `fixme` yok.
- **Reviewer:** koordinatörün okuması (R2, test dosyası).

## Dilim tablosu
| Dilim | Rol | Sınıf | Bağımlılık | Ortak dosya (başka ekranla) | Büyüklük (puan) |
|---|---|---|---|---|---|
| V | `nf-arayuz` | R1 | EKRAN-06 V | — | 1 |
| A1 | `nf-db` | R3 | EKRAN-06 A1; S4 (a) ise | `ci-green.txt`, `authorization_coverage.test.sql`, `retired_objects_stay_gone.test.sql`, `communication_reaches` (Important Dates da kullanır) | 5 |
| A2 | `nf-db` | R3 | A1 | `ci-green.txt` | 5 |
| A3 | `nf-db` | R3 | A1; S2 (yalnız saat dilimi kısmı) | `ci-green.txt`, `cron` işi | 3 |
| B1 | `nf-backend` | R3 | A1–A3, EKRAN-06 B1 | `packages/shared/src/communications.ts` (Important Dates ve Notifications da okur), `http-error.ts` | 4 |
| C1 | `nf-arayuz` | R2 | B1, S1 / S3, V, EKRAN-06 C1 | `jobs-settings.css`, sayfa çubuğu (EKRAN-02), `DashboardCommunications.tsx` (Employee view Home) | 6 |
| D | `nf-test` | R2 | C1 | — | 2 |
| **Toplam** | | **R3** | | | **26** |

## Out of scope
1. **Workspace ana sayfasındaki Announcements kutusu** — EKRAN-05 (BL-564, BL-666 (3)(6), BL-810, K28).
2. **Important Dates** ve kapalı gün — ekran 8; `task/fb-6.7-ui` hasadı orada (KK-182 K2). `communication_reaches` ortak; A1 değişikliği Important Dates'i bozmamalı (ekran 8'in pgTAP'ı da koşar).
3. **Notifications** (bildirimin görünümü, "Couldn't publish" satırının çizimi) — ekran 9; üretici (K21) bu dosyada A3.
4. **Settings → Acknowledgements** — ekran 10 (BL-053).
5. **Ortak bileşenler** — EKRAN-02 C3 (BL-515, BL-255, BL-600, BL-665).
6. **Saat dilimi modeli (BL-878)** — S2 = SABAH S25 sohbeti; karar gelmeden kodlanmaz.

## Test plan
- Veri: her dilimde önce kırmızı pgTAP (yukarıdaki Done when), sonra migration; `announcements_and_dates_follow_k1_k6.test.sql` §6 ve §7 yeni kurala göre yeniden yazılır (beklenti gevşetilmez, CLAUDE.md §9).
- API / web: vitest önce kırmızı; tam kapı (lint, typecheck, test, build) rebase sonrası.
- Ekran: `nf-gorsel-qa` 1440 + 390; e2e (D).

## Risk
- **Alıcı kuralı (A1) Important Dates ile ortak** (`communication_reaches`): duyuru kuralı değişirken önemli tarih teslimi bozulabilir → A1 ekran 8'in pgTAP'ını da koşar.
- **Mevcut duyuruların kişi listesi:** canlı veri yok (P01); yerel veride eski duyurular yeni modele göre yeniden üretilir ya da silinir, tolerans dalı yazılmaz.
- **Yayın işinin yetki sorusu (A3) yanlış kapalı kalırsa** zamanlanmış duyurular hiç çıkmaz → pgTAP yetkisi duran ve süren yazar için ayrı.

## Notes / Result
- 2026-10-06: görev dosyası yazıldı (KK-182). Kod işi başlamadı.
