# EKRAN-08 Important Dates — ekranı "bitmiş" tanımına getirmek
Status: draft — 2026-10-06 (`nf-planlama`, koordinatörün görevi; ekran planının 8. adımı; KK-183).
Session: -   Branch: task/ekran-08-<dilim>   Worktree: newfork-wt/ekran-08-<dilim>   DB: B1 ve A1'in e2e'si `db.lock` ile
Reviewer: dilim başına (aşağıdaki tablo). B1 `nf-guvenlik` zorunlu (bildirim geri çekme, History gizliliği, alıcı kuralı); ekran değişen A1 ve A2 `nf-gorsel-qa`.
Risk sınıfı (toplam): **R3** — B1 bildirim ve History gizliliği çekirdekte değişiyor (BL-883, BL-890, BL-891); A1 ve A2 tek başına R2 (web + e2e, sunucu sözleşmesi değişmiyor).
Hat sırası (koordinatör, KK-183): **A1, Mert'le kapalı gün konuşmasından (S1) sonra** — Mert 2026-10-04'te kapalı gün davranışını uygulamadan önce konuşmak istedi; o söz yerine getirilmeden kapalı gün davranışı kodlanmaz. BL-882 bugün kullanıcıyı etkileyen hata; koordinatör sabah ekran 8 sohbetini öne almayı önerecek. A2 ve B1 S1'i beklemez (A2'nin S2 / S4 kısımları ve B1'in BL-883 kısmı kendi sorusunu bekler). Ekran 7 hatlarıyla sırayı koordinatör verir.
**Yerine geçtiği iş:** FB-6.7'nin önemli tarih ve kapalı gün ekran kısmı (`tasks/FB-6.7.md`, "durdu", 2026-10-04 #141). `task/fb-6.7-ui` dalı birleştirilmez; önemli tarih parçaları A1'de bugünkü dosyaya elle taşınır, sonra dal ve `newfork-wt/fb-6.7-ui` worktree'si silinir (KK-182 K2, OZET §3).

**Kaynaklar:** keşif `docs/plan/ekranlar/08-important-dates/OZET.md` (E8-01…E8-18, §2 prototip, §3 dal hasadı, §4 KK-183, §5 S1–S4) ve `A-backlog-prototip.md`, `B-guvenlik.md`, `D-kod-davranis.md`; KARARLAR "Ürün kuralları" K1–K18 (önemli tarih için duyuruya özel sonraki yeniden yazımlar uygulanmaz), "Duyurular, önemli tarihler ve kapalı gün" (B3-A, C1-B, Important Dates boş hâli ve sekmeleri), Genel → "Liste sayfalarının ortak dili", "Geçmiş hafta kilidi"; ILKELER P02, P09, P18, P21, P25; prototip `newfork-prototype/proto-audit/P4.md` (DL1–DL17, DW1–DW24, D2–D4, D9), `PHONE-MGR2.md:14, 23-25`.

**Tazelik 2026-10-06 (`origin/main` `20332d46`):** keşif aynı gün; ekranın dosyaları `44e41a54`'ten beri değişmedi. Dilim başlarken kendi ölçümünü yapar.

## Goal
Important Dates ekranını (sol menü → Important Dates: Upcoming / Past / Archived, süzgeçler, satır menüsü; önemli tarih penceresi ve Details / History; "Closed day" kaydında etkilenen vardiyalar listesi ve sonuç satırları; Unpublish / Republish / Archive / Restore) K1–K18 ve ekran kararlarına getirmek: kapalı gün vardiyalı günde de kaydedilir, değişiklik geçmişi görünür, düzenlenemeyen kayıt okunur, ham metin ve sessiz sonuç kalmaz, liste ortak dilde.

Bir kişi için: Kadıköy müdürü Ayşe 14 Ekim'i "Closed day" yapar; pencerenin altında Ali'nin ve Emre'nin vardiyaları listelenir, Ali'ninkini "Keep", Emre'ninkini "Open shift" seçer, "Save · 1 shift to open"a basar. Emre "Kadıköy is closed on Oct 14 — your shift was removed" bildirimini alır. Ertesi gün owner Zeynep tarihin notunu düzeltir; Ayşe History'de "Changed by Zeynep · Oct 7, 2026 · 9:20 AM" görür, Emre'nin bildirimi yerinde kalır (S3 cevabına göre). Ayşe kapanışı arşivlerse "Closed day archived. 1 shift stays open." yazar.

## Ürün kuralları (yazıldığı gibi uygulanır)
- **KK-183 (koordinatör, 2026-10-06; OZET §4):** K1 bu dosya FB-6.7'nin önemli tarih / kapalı gün kısmının yerine geçer, hasat dilimi S1'den sonra; K2 History satır biçimi duyurunun C1 biçimi ("<Action> by <Name> · Oct 4, 2026 · 9:20 AM"), kural KARARLAR'a yazılır; K3 gizli History satırında değişikliğin türü de gizlenir; K4 KK-89 okunuşu: değişikliği yapan kendi bildirimini almaz, yazar başkasının değişikliğini alır (Mert'e ekran 8 turunda teyit); K5 sayfalama istemcide (25 / 50 / 100, varsayılan 50); K6 BL-605'in Important Dates kısmı BL-676 ile, BL-598 BL-599 ile kapanır.
- **KARARLAR K1–K18 (önemli tarihe uygulanan hâlleri):** K1 çok lokasyonlu / workspace geneli kayıt yalnız admin ve owner'ın; K2 rütbe, ayrılan yazar; K3 müdür–müdür; K5 teslim (müdür / admin / owner alır, yazar almaz — KK-89, K4 notu); K6 görünürlük; K7 onay yok, içerik değişince herkese, yalnız lokasyon eklenince yenilere, Republish'te açmamışlara; K8 Unpublish / Archive ayrı, Restore → Unpublished, bildirim yok; K10 kapalı gün Schedule'da çakışma; K11 geçmiş tarih kilitli (salt okunur, kapalı değil); K13 kapalı gün yayınlanmış vardiyaları listeler, Open shift / Keep; K14 vardiyası düşene tek bildirim; K15 kaldırılınca vardiya geri gelmez, "N shifts stay open"; K16 taslakta sorulmadan düşer, tek bilgi satırı; K17 sonradan yazma üç derece (Schedule'ın işi).
- **Ekran kararları:** B3-A Details / History, "Hidden change"; C1-B kapalı gün listesi formun altında, tek Save "Save · N shifts to open"; B1 adı "Archive", iki tık kırmızı, "Confirm archive"; sekmeler Upcoming / Past / Archived; boş hâl açık zemin + yeşil daire + "New date"; liste ortak dili (sütunlar 28 / 18 / 16 / 20 / 18, başlık 11 px); telefonda kart satırı.
- **CLAUDE.md §9:** yetki yalnız çekirdekte (bugün doğru, korunur); "hayır" sözleşmesi bugün doğru; ikiz ve ölü kod silinir (BL-894); tarayıcı diyaloğu yok; uzun yazılmış iş kapanırken sorulur (P26).

## Açık sorular (CLAUDE.md §13; ekran 8 turunda Mert'e — metin OZET §5'te)
- **S1** — kapalı günün davranışı uygulamadan önce senaryo senaryo konuşulsun mu (P18; bugün kullanıcıyı etkileyen hata BL-882). → A1'in tamamı bekler.
- **S2** — yıllık tarih bu yılki günü geçince hangi sekmede (önerilen: her zaman Upcoming, bir sonraki tekrarın tarihiyle). → BL-679; A2.
- **S3** — "your shift was removed" bildirimi kapanış düzenlenince / kaldırılınca kalsın mı (önerilen: kalsın). → BL-883; B1.
- **S4** — "Blackout" türü ne yapsın (önerilen: kalkar). → BL-892; A2 (tür kalkarsa B1'e küçük veri adımı).
- **K4 teyidi** — KK-89 okunuşu (tek satır not). → BL-890; B1.
- Cevap gelmeden yalnız ilgili kısım bekler; dilimin geri kalanı yürür.

## Bulgu → dilim eşlemesi
| Bulgu (OZET §1) | Dilim | BL |
|---|---|---|
| E8-01 vardiyalı güne Closed day kaydedilemiyor / Republish edilemiyor | A1 (S1'den sonra) | BL-882 |
| E8-02 kaldırma bildirimi geri çekiliyor | B1 (S3'ten sonra) | BL-883 |
| E8-03 sonuç satırları yok | A1 | BL-884 |
| E8-04 History yok | A1 (+ B1 gizli satır) | BL-885, BL-547 |
| E8-05 düzenlenemeyen satır kapalı ve soluk | A1 | BL-676 (BL-605 kapanır) |
| E8-06 "Delete date" arşivliyor, Archive tek tık | A2 | BL-595 |
| E8-07 ham metin, takvim alt sınırı, yıllık sessiz taşıma | A1 (takvim) + A2 (metin) | BL-886 |
| E8-08 sayfalama | A2 | BL-787 |
| E8-09 telefonda kart satırı | A2 | BL-599 (BL-598 kapanır) |
| E8-10 Past sekmesi ile kilit çizgisi | A2 (UTC kısmı BL-238, EKRAN-01) | BL-887 |
| E8-11 yıllık tarih Past'a düşüyor | A2 (S2'den sonra) | BL-679 |
| E8-12 boş hâl | A2 | BL-888 |
| E8-13 iki lokasyonlu müdürde Save nedensiz gri | A2 | BL-889 |
| E8-14 değiştiren kendi bildirimini alıyor | B1 | BL-890 |
| E8-15 gizli History satırında tür | B1 | BL-891 |
| E8-16 Blackout | A2 (metin; tür S4'ten sonra) | BL-892 |
| E8-17 başlık satırı ölçüsü | A2 | BL-893 |
| E8-18 ölü kod | A2 | BL-894 |
| Veri temizliği (OZET §1 sonu) | B1 | BL-544, BL-546, BL-547, BL-548, BL-550, BL-551 (BL-549 Settings → Locations turunda ölçülür) |
| Prototip taşı (14 madde, OZET §2) | A1 + A2 | yukarıdakiler |
| Test boşlukları (OZET §1 sonu) | ilgili dilim | — |

## In scope (dilimler)
Sıra kuralı (CLAUDE.md §4): veri önce, sunum sonra; aynı dosyaya iki oturum aynı anda konmaz. B1 ile A1 / A2 farklı dosyalara dokunur; B1'in History okuması değişikliği (BL-891) A1'in History sekmesinden önce main'e girerse A1 doğrudan yeni cevabı okur.

### B1 — Bildirim, History gizliliği, veri temizliği (`nf-db`; R3)
- **Ne:** BL-883 (S3 (a) ise kaldırma bildirimi ayrı konuyla yazılır ya da geri çekme `important_date_shift_releases`'teki kişileri dışarıda bırakır; düzenleme, Unpublish ve Archive için); BL-890 (alıcı listesinden değişikliği yapan kişi düşer, yazar başkasının değişikliğinde alıcıdır; K4 teyidiyle); BL-891 (gizli History satırında `action` boş döner; testler `id` ile eşlenir); BL-547 (K11 bölmesi History'ye satır yazar); BL-550 (değişmeyen kayıt sürüm artırmaz, History satırı yazmaz); BL-546 (yıllık çok günlü tarih kendi günlerinde düzenlenince o yılın tekrarı); BL-548 (önizlemede saat dilimi tek kaynaktan); BL-551 (`important_date_shift_releases` yabancı anahtar indeksleri); BL-544 (kapalı gün ve onaylı izin vardiya düşürme adımları tek yerde; Undo bariyeri iki yolda da); S4 (a) ise "blackout" türü veriden kalkar.
- **Touches:** `supabase/migrations/<yeni>.sql`, `supabase/tests/closed_days_reach_the_shifts.test.sql`, `announcements_and_dates_edge_cases.test.sql` (`:263`, `:295` `id` ile), `announcements_and_dates_follow_k1_k6.test.sql`, yeni pgTAP (bildirim kalıcılığı, değiştiren ≠ yazar, Unpublish'te `shifts_stay_open`), `authorization_coverage.test.sql` (yeni servis olursa), `ci-green.txt`.
- **Bağımlılık:** EKRAN-07 A1 ile aynı çekirdek (`communication_*`): aynı anda iki oturum konmaz; sırayı koordinatör verir. S3 ve K4 teyidi ilgili kısımları bekletir.
- **Done when:** (a) kapanış notu düzenlenince, Unpublish ve Archive'da vardiyası düşen kişinin kaldırma bildirimi gelen kutusunda `visible` kalır (pgTAP, önce kırmızı; S3 (a) ise); (b) admin Hande Ayşe'nin kaydını değiştirince Hande alıcı değil, Ayşe alıcı (pgTAP, önce kırmızı); (c) müdürün gizli History satırında `action`, saat, kişi boş (pgTAP); (d) değişmeyen kayıtta `revision` artmıyor, History satırı yok (pgTAP); (e) K11 bölmesi History'de satır; (f) `pg_indexes`'te üç yeni indeks; (g) duyuru teslimi bozulmadı (EKRAN-07'nin pgTAP'ı da koşar).
- **Test plan:** kırmızı pgTAP → migration (tek transaction + rollback denemesi) → `test:db` (`db.lock`, tek ağır iş). Canlıya migration CLAUDE.md §8 sürekli yetki koşullarıyla (yedek, ONAY, OPS-03).
- **Reviewer:** `nf-guvenlik` zorunlu.

### A1 — Dal hasadı: kapalı gün listesi, sonuç satırları, History, salt okunur pencere (`nf-arayuz` + `nf-test`; R2) — **S1'den sonra**
- **Ne:** `task/fb-6.7-ui`'den bugünkü `ImportantDatesSettingsPage.tsx`'e elle taşıma (birleştirme yok): BL-882 (kapalı gün etki listesi `ClosureShifts` + önizleme sorgusu + Open shift / Keep + "Save · N shifts to open" + `closure_changed`'de listeyi yeniden okuma; Republish önce pencereyi listeyle açar; `526e66fd`); BL-884 (`closureMessage`: kaydet / arşivle / Unpublish / Republish sonuç satırları, Unpublish dahil; taslak bilgi satırı K16); BL-885 (Details / History sekmeleri, zaman çizelgesi, "Hidden change"; satır biçimi KK-183 K2; `6bd73c05`, `1d1b4325`); BL-676 (düzenlenemeyen her satır — geçmiş ve K2 — salt okunur pencerede açılır, yalnız "Close", satır tam renkte); BL-886'nın takvim kısmı (`min={locked_before}`, "Past dates are read-only. Pick <date> or later."); e2e `1a2be710` `closed-day-reaches-shifts.spec.ts` taşınır ("Add date" → "New date", Archive iki tık satırları güncellenir); `important-date-window.css` görsel QA ile.
- **Bırakılanlar (dalda kalır, taşınmaz):** "Show archived" anahtarı, satırda "Past" etiketi, beyaz ekleme düğmesi, penceredeki "Delete date", Schedule parçaları, duyuru parçaları, `dev/fb67`, `dev/ann-flow` (OZET §3).
- **Touches:** `apps/web/src/settings/ImportantDatesSettingsPage.tsx` (gerekirse pencere ve liste ayrı bileşene), `apps/web/src/settings/important-date-window.css` (yeni), `apps/web/src/settings/ImportantDatesSettingsPage.test.tsx`, `e2e/flows/closed-day-reaches-shifts.spec.ts` (yeni; `nf-test`).
- **Bağımlılık:** S1 cevabı; A2 ile aynı dosya — A1 ve A2 aynı anda konmaz (sırayı koordinatör verir). B1'in BL-891'i önce girerse History gizli satırı yeni cevabı okur.
- **Done when:** (a) yayınlanmış vardiyalı güne Closed day kaydı ekrandan geçiyor, Keep seçilen vardiya kalıyor, Open shift seçilen açık vardiyaya düşüyor (e2e, main CI'da yeşil); (b) kapalı günü Republish etmek listeyi açıyor; (c) arşiv ve Unpublish'te "N shifts stay open" görünüyor (vitest); (d) History sekmesi değişikliği C1 biçiminde gösteriyor (vitest); (e) geçmiş ve üst rütbe kaydı salt okunur açılıyor, satırda `disabled` yok (vitest); (f) takvim kilit çizgisinden önceki günü vermiyor; (g) `previewImportantDateClosure`, `getImportantDateHistory` çağrılıyor (grep > 0); (h) önce / sonra ekran görüntüsü 1440 + 390 (owner, tek lokasyon müdürü) `artifacts/nf-arayuz/EKRAN-08/A1/`; `nf-gorsel-qa` ONAY; (i) hasat bitince `task/fb-6.7-ui` dalı ve worktree'si silindi (guard yedeği).
- **Reviewer:** `nf-gorsel-qa`; e2e koordinatörün okuması.

### A2 — Liste dili ve metinler (`nf-arayuz`; R2)
- **Ne:** BL-595 (pencerede "Delete date" kalkar; Archive iki tık kırmızı, "Confirm archive", satır menüsünde de); BL-787 (sayfalama 25 / 50 / 100 istemcide, varsayılan 50); BL-599 (telefonda kart satırı: ad / tarih · tür · lokasyon / etkiler; başlık 28, yan boşluk 16) — BL-598 kapanır; BL-887 (Past sekmesi sunucunun `is_past` / `locked_before`'una bakar); BL-679 (S2 cevabına göre yıllık tarihin sekmesi ve tarih sütunu); BL-888 (boş hâl ortak `catalog-table-empty`, yeşil daire, "New date"; süzgeçle boşken "eşleşen yok" metni); BL-889 (iki lokasyon seçilince tek satır açıklama); BL-886'nın metin kısmı (ham cümle ekrana çıkmaz; `reason` anahtarına göre kısa metin, BL-654 ailesi); BL-892 (pencere metni; tür S4'e göre); BL-893 (başlık satırı 11 px); BL-894 (ölü yönlendirmeler ve alanlar).
- **Kısa metin önerileri (ILKELER P21; Mert ekran görüntüsünde görür):**
  - İki lokasyon (BL-889): **"Dates for more than one location are set by an admin or owner."**
  - Geçmiş tarih (BL-886): **"Past dates are read-only. Pick Oct 12, 2026 or later."**
  - Çakışma 409: **"This date changed. You're seeing the latest version."**; öteki kayıt hatası **"Couldn't save. Try again."**
  - Süzgeçle boş (BL-888): **"No matching important dates"**.
  - Pencere metni (BL-892): **"Closed day removes the location's shifts that day."**
- **Touches:** `apps/web/src/settings/ImportantDatesSettingsPage.tsx`, `apps/web/src/settings/jobs-settings.css` (yalnız Important Dates kuralları), `apps/web/src/settings/ImportantDatesSettingsPage.test.tsx`, `apps/web/src/App.tsx` (yalnız üç eski yönlendirme), `packages/shared/src/index.ts` (yalnız okunmayan alanlar silinecekse; `nf-backend` onayıyla).
- **Bağımlılık:** A1 ile aynı dosya (sırayı koordinatör verir); S2, S4 ilgili kısımları bekletir; ortak sayfa çubuğu ve kart satırı EKRAN-02 / EKRAN-07 C1 ile aynı bileşen — hangisi önce girerse öteki onu kullanır.
- **Done when:** Archive iki tık (vitest); 60 tarihli listede 50 satır + "1 2" (vitest); telefon 390'da kart satırı, başlık kesilmiyor; ekranda ham `error.message` yok (grep); boş hâl ve metinler kararla aynı; önce / sonra ekran görüntüsü 1440 + 390 `artifacts/nf-arayuz/EKRAN-08/A2/`; `nf-gorsel-qa` ONAY.
- **Reviewer:** `nf-gorsel-qa`.

## Dilim tablosu
| Dilim | Rol | Sınıf | Bağımlılık | Ortak dosya (başka ekranla) | Büyüklük (puan) |
|---|---|---|---|---|---|
| B1 | `nf-db` | R3 | EKRAN-07 A1 sırası; S3, K4 teyidi (kısmi) | `communication_*` çekirdeği (Announcements), `ci-green.txt`, `authorization_coverage.test.sql` | 4 |
| A1 | `nf-arayuz` + `nf-test` | R2 | S1; A2 ile sıra | `e2e/` (DB kilidi) | 5 |
| A2 | `nf-arayuz` | R2 | A1 ile sıra; S2, S4 (kısmi) | `jobs-settings.css`, sayfa çubuğu ve kart satırı (EKRAN-02, EKRAN-07 C1), `App.tsx` | 3 |
| **Toplam** | | **R3** | | | **12** |

## Out of scope
1. **Schedule'daki kapalı gün çakışması ve K17'nin üç derecesi** — EKRAN-01 (BL-238 UTC kilit çizgisi, BL-701, BL-762 (3)).
2. **Notifications** (bildirimin görünümü; `get_notification_inbox_v2_service` iki tanımı, `act_on_notification_inbox_workspace_base`) — ekran 9.
3. **Settings → Conflict handling** adları (BL-895) ve lokasyon geri alma (BL-549) — Settings turu.
4. **Announcements** — EKRAN-07; duyuruya özel K19–K27 önemli tarihe taşınmaz.
5. **Ortak bileşenler** — EKRAN-02 C3 (BL-593, BL-602, BL-665, BL-600, BL-255, BL-515, BL-880).

## Test plan
- Veri: B1'de önce kırmızı pgTAP (Done when), sonra migration; `test:db` `db.lock` ile.
- Web: vitest önce kırmızı (A1, A2); tam kapı (lint, typecheck, test, build) rebase sonrası.
- e2e: A1'de `closed-day-reaches-shifts.spec.ts` (Ayşe, Ali, Emre; Keep / Open shift; arşivde "1 shift stays open"); main CI'da yeşil, `skip` / `fixme` yok.
- Ekran: `nf-gorsel-qa` 1440 + 390 (A1, A2); C görsel QA (keşif) henüz koşmadı — A1 öncesi izinle koşması önerilir.

## Risk
- **Dal eski (16 önde, 314 geride):** birleştirme değil elle taşıma; DOC-TABLE ile çelişen parçalar bırakılır (OZET §3).
- **B1 Announcements'la ortak çekirdekte:** `communication_withdraw` ve alıcı yardımcıları duyuruda da kullanılıyor → B1 EKRAN-07'nin pgTAP'ını da koşar; EKRAN-07 A1 ile aynı anda konmaz.
- **Web testi kaydı taklit ediyor:** BL-882 bu yüzden görünmedi → A1'in kanıtı e2e'dir, vitest değil.

## Notes / Result
- 2026-10-06: görev dosyası yazıldı (KK-183). Kod işi başlamadı.
