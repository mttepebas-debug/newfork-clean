# EKRAN-01 Schedule ekranını bitirmek
Status: draft (görev dosyası; uygulama koordinatörün dilim dilim başlatmasıyla)
Session: -   Branch: dilim başına `task/ekran-01-<dilim>`   Worktree: `newfork-wt/ekran-01-<dilim>`   DB: DB-* dilimleri `db.lock` ile

**Kaynaklar:** `docs/plan/EKRAN-PLANI.md` ("Bir ekranın turu" madde 4), keşif `docs/plan/ekranlar/01-schedule/`
(OZET + A/B/C/D), KARARLAR → "Schedule" (2026-10-05 seçimleri S1–S6), ILKELER.

**Tazelik:** keşif 2026-10-05, main `06a74d5a`. Koordinatörün ölçümüne göre `086449dd..origin/main` arasında
`apps packages supabase api e2e` altında commit yok; bu dosya `9bb4373a` üzerinde yazıldı. Bulgular yeniden
ölçülmedi. Her dilim başlarken kendi maddelerini `origin/main`'de yeniden ölçer (CLAUDE.md §5 adım 0).

**Kimlikler:** `D-Y2` = D raporu yüksek 2; `D-O4` orta 4; `D-D1` düşük 1; `B-4` = B raporu bulgu 4;
`C-D3` = C raporu masaüstü 3; `C-P1` telefon 1; `S1.x–S5.x` = A raporu Tablo 2 prototip kalemleri. YENİ bulgular
BL numarasını PLAN-EKRAN-12'de aldı (2026-10-06, BL-688–BL-723; BACKLOG "Schedule ekranı keşfi: yeni bulgular"); eşleme aşağıdaki tabloda.

**YENİ bulgu → BL eşlemesi (PLAN-EKRAN-12, 2026-10-06):**

| Bulgu | BL | Dilim |
|---|---|---|
| D-Y2 | BL-688 | DB-1b, W-1b |
| D-Y1 = BL-689 | BL-689 | W-1b (+DB-1c) |
| D-Y3 = BL-690 | BL-690 | W-1a |
| D-Y4 = BL-691 | BL-691 | W-1a |
| D-Y5 = BL-692 | BL-692 | DB-1b, W-1b |
| B-2 | BL-693 | DB-2 |
| B-4 / D-O4 = BL-694 | BL-694 | DB-3, W-3 |
| D-O6 = BL-695 | BL-695 | DB-1b, W-1b |
| D-O2 = BL-696 | BL-696 | DB-3 |
| D-O1 = BL-697 | BL-697 | DB-3 |
| D-O9 = BL-698 | BL-698 | DB-1b, W-1b |
| D-O3 = BL-699 | BL-699 | W-3 |
| B-5 | BL-700 | BE-1 |
| B-7 | BL-701 | DB-4 |
| B-9 | BL-702 | DB-1a |
| D-D4 | BL-703 | BE-2 |
| Sürükleme rengi (Mert) | BL-704 | DRAG |
| D-O5 | BL-705 | W-3 |
| D-O8 | BL-706 | W-2 |
| C-D1 | BL-707 | W-2 |
| D-D1 | BL-708 | W-3 |
| D-D3 | BL-709 | W-1b |
| D-D2 | BL-710 | W-3 |
| C-D3 | BL-711 (kısmen BL-327 (3)) | W-2 |
| C-D4 | BL-712 | W-2 |
| C-D5 | BL-713 | W-2 |
| C-D2 | BL-714 | W-4 |
| C-D7 | BL-715 | W-3 |
| C-D8 | BL-716 | W-4 |
| C-D11 | BL-717 | VAR |
| C-P2 | BL-718 | VAR |
| C-D6 | BL-719 | W-1b / W-3 |
| C-D9 | BL-720 | W-4 |
| C-D12 | BL-721 | W-4 |
| C-D16 | BL-722 | W-4 |
| C raporu "Küçük" listesi (4 kalem) | BL-723 | W-4 |
| D-D5 iki yeni ikiz rota | BL-280 (+ ek 2026-10-06) | BE-1 |

---

## Goal
Schedule'ı (`/app/schedule`, `/app/schedule/export`, `/app/schedule/templates`) EKRAN-PLANI'nın "bitmiş sayılır"
tanımına getirmek: keşif bulguları kapalı ya da adıyla ertelenmiş, Mert'in "taşı" dediği 37 prototip kalemi
gerçek uygulamada, ekranın açık backlog maddeleri kapalı ya da adıyla dışarıda, tam kapı ve main CI yeşil,
masaüstü ve telefon ekran görüntüsü alınmış.

Bir yönetici için sonuç: Ayşe düzenlerken işi hiçbir yolla habersiz kaybolmaz (hareketsizlik, yenileme, kilit
düşmesi, Undo), başka lokasyonun taslağını bozamaz, ekran klavyeyle ve telefonda kullanılır, metinler insan dilinde.

## Mert'in kuralları (yeniden yorumlanmaz; kaynak KARARLAR → Schedule, 2026-10-05)
| # | Kural | Bulgu |
|---|---|---|
| S1 | 15 dk hareketsizlikte "Keep editing?" 15 sn geri sayar; hareket olursa sürer; sayım biterse iş tarih + saat + kullanıcı adıyla "auto-save" kurtarma taslağına kaydedilir, kilit bırakılır. İş silinmez. | D-Y2, C-D6 |
| S2 | Undo ekranda ve kayıtta aynı anda geri alır; sürükleme, yapıştırma, şablon, Auto-fill dahil. | D-Y1 |
| S3 | Overwrite yalnız şablonun lokasyon (ve departman) vardiyalarını siler; başlamış vardiyaya dokunmaz; iki tık. | D-O4, B-4 |
| S4 | Açık menü varken ızgaraya ilk tık yalnız menüyü kapatır. | BL-617 |
| S5 | Karartılmış arka plana tık = Esc (uzun iş varsa önce "Discard changes?", P26); arkadaki sayfanın boş yer kuralı hiç tetiklenmez; bütün Schedule pencerelerinde tek kural. | BL-458 |
| S6 | Rızayla izinli güne alınan vardiya hücrede iz bırakmaz: izin kırmızısı yok, "!" yok. | BL-579 |
| — | Görünüm modunda Unassigned satırı gizlenir. | BL-681 |
| — | BL-450 üst çubuk kenarı 3:1'e koyulaştırılır (koordinatör kararı, P19). | BL-450 |
| — | Üst çubuk butonları siyah kalır (Mert 2026-10-04); "düzeltilmez". | — |

## In scope (OZET'in 7 grubu, önem sırasıyla; her madde bir dilime bağlı)

### 1. Veri kaybı ve düzenleme oturumu
| Bulgu | Ne | Dilim |
|---|---|---|
| D-Y2 (+C-D6) = BL-688 (+BL-719) | Hareketsizlikte iş habersiz siliniyor → S1 | DB-1b, W-1b |
| D-Y3 | Kilit uyarının son 1–2 dk'sında düşüyor; tek çıkış Discard | W-1a |
| D-Y1 | Undo yalnız ekranda → S2 | W-1b (+DB-1c gerekirse) |
| D-Y4 | Yenileme / hafta değişince taslak boş görünüyor | W-1a |
| D-Y5 | İki yöneticinin kaydedilmemiş işi birbirine biniyor | DB-1b, W-1b |
| B-1 + B-2 (= BL-693) + B-3 | Başka lokasyonun taslağına kayıt; canlı kanal çekirdek dışında; kapsamı daralan müdürün oturumu yaşıyor | DB-1a, DB-2 |
| B-4 / D-O4 | Overwrite: başlamış vardiyayı siliyor, tek tık, bütün lokasyonlar → S3 | DB-3, W-3 |
| D-O6 | Başkası düzenlerken taslak silinebiliyor | DB-1b, W-1b |
| D-O9 | Kurtarma taslağı sessiz ve teknik adlı; yanlış taslak açılabiliyor | DB-1b, W-1b (Açık soru 1) |
| BL-292 | `note` anahtarı yoksa not sessizce siliniyor | DB-3 |
| D-O2 | Şablonda mola sıfırlanıyor | DB-3 |
| D-O3 | Açık vardiyaya düşen sayı söylenmiyor | W-3 |
| BL-238 | Pazar akşamı "bu hafta" UTC'yle kilitleniyor | DB-4 |
| D-O1 | Yayındaki haftaya yeni vardiya "Live - published" yazıyor | DB-3 |
| **Sürükleme rengi (Mert, 2026-10-05 ~22:05Z)** = BL-704 | Kabul eden hücre yeşil, etmeyen kırmızı; ayrı madde | DRAG |

**Sürükleme rengi ayrıntısı.** Üç sürükleme: (1) hücreden hücreye vardiya, (2) rol ayırıcı satırındaki hazır vardiya
(preset), (3) Unassigned satırındaki açık vardiya. Hücre, vardiyanın lokasyonu, işi ve tarih / saatine göre kabul
ediyorsa yeşil, etmiyorsa kırmızı. Altyapı var: `data-drop-status` (`apps/web/src/schedule/components/ScheduleRow.tsx:341`),
CSS `apps/web/src/styles.css:5841-5855` (allowed / blocked / warning; ham hex), durum hesabı
`apps/web/src/schedule/hooks/useScheduleGridDragControllers.ts:34-36`, preset `SchedulePresetRows.tsx:40`. **Hangi
sürüklemede eksik olduğu ölçülecek**: dilimin ilk adımı üç sürüklemeyi gerçek uygulamada (ve prototipte) dener,
eksik olanı adıyla yazar; ölçmeden kod yazılmaz. "warning" durumu: Açık soru 2.

### 2. Yetki ve güvenlik temizliği
B-5 (Export yetkisi rotada) → BE-1 · B-6 = BL-282 (CSV formül; önem medium) → BE-2 · B-7 (önemli tarih / kapalı
gün süzgeci API'de) → DB-4 · B-8 = BL-280(4) + D-D5 ikiz rotalar → BE-1 · B-9 + BL-412 → DB-1a · BL-159 → DB-1a ·
BL-174, BL-326 → DB-4 · BL-224 → DB-1b.

### 3. KARARLAR'da olup kodda olmayan
BL-681 → W-3 · D-O5 "Save as template" New Schedule menüsünde → W-3 · BL-437 + BL-494 + D-D4 → BE-1/BE-2 + W-3 ·
BL-101 (canlı tetik; önce ücretsiz yol ölçülür, P06) → BE-2 · BL-038 (altı şablon kararı) → W-3 (Açık soru 3) ·
BL-121 ("40+ scheduled hours") → W-3 · BL-619 (yalnız müsaitlik sayılır, M11) → DB-4 · BL-545 → DB-3 · BL-318
(Export, Unpublish, Save draft + Review auto-fill, Keep editing?, Review default hours stil B'ye) → W-3 · BL-685
(BL-552 birleşti) → BE-2 + W-3.

### 4. Erişilebilirlik ve klavye
C-D3, C-D4, C-D5, C-D1, D-O8, BL-608, BL-617 (S4), BL-458 (S5), BL-449, BL-450, BL-610, BL-612, BL-454, BL-526 → W-2.
BL-525 (yalnız renkle ayrım) → VAR.

### 5. Görünüm ve tutarlılık
Prototip 37 "taşı" kalemi (A Tablo 2; BL-618 şemsiye, BL-609, BL-611, BL-613, BL-615) → W-4. C-D2, C-D7, C-D8, C-D9,
C-D10 = BL-578, C-D12, C-D14, C-D16, C raporu "Küçük" listesi → W-4. D-O7 = BL-395 (≥15 yer; medium) → BE-2 (veri
katmanı) + W-4 (metin). Küçükler: BL-194, BL-236, BL-327, BL-371, BL-403, BL-448, BL-451, BL-457, BL-499, BL-522,
BL-570, BL-577, BL-614, BL-655, D-D1, D-D2, D-D3 → W-4 (BL-371 verisi DB-4; D-D3 W-1b). BL-441, BL-524 → VAR. S6 /
BL-579 → W-4.

### 6. Telefon ve dar ekran
C-P1 = BL-587, BL-233, BL-334, BL-580; ölçülecek BL-573, BL-574, BL-320, BL-333 (375 px) → W-5. BL-445, C-D11,
C-P2 → VAR.

### 7. Kod sağlığı ve test
Ölü kod: BL-616 → W-1a; BL-391, BL-168 → BE-2; BL-346, BL-453 → W-4; eski Export bileşenleri (D-D5) → W-3.
BL-386 (sayfa 3637 satır), BL-376 (rota 2638 satır), BL-275 (ızgara modeli) → K-1. Test boşlukları (D raporu) →
her dilim kendi testini getirir + T-1. Ölçülmedi: BL-191, BL-315, BL-537, BL-544, BL-510 → DB-4; BL-211, BL-442 → T-1.

## Out of scope (adıyla)
- **Başka ekranı bekleyen (sınırda, A Tablo 1):** BL-189, BL-167 (takas kurtarma → Requests / Shift Hub); BL-548,
  BL-551 (Important Dates); BL-549 (Settings → Locations); BL-135 (Availability); BL-298 (Employee view → Schedule);
  BL-388 (Employees); BL-589, BL-055, BL-674 (birçok ekran; yalnız S3.11'in Auto-fill tarihi burada); BL-218,
  BL-325, BL-179, BL-133, BL-350, BL-435 (test / ortam / ortak şema); BL-110 ve BL-257'nin kalanı (Requests).
- **MVP sonrası ya da Mert'in büyük kararı:** BL-050, BL-067, BL-122 (boş ızgara kısmı BL-612 ile içeride), BL-123,
  BL-126. BL-362 Açık soru 4'e bağlı.
- **Bırak kararlı prototip kalemleri:** S1.9, S4.10, S5.3, S5.4, "S-ESLIK-1" altısı.
- **BL-562** (CI 50 ms testi): yalnız main'i kırmızıya çevirirse araya girer (EKRAN-PLANI).
- Yeni bağımlılık, hosted `db push`, `supabase db reset`: bu işte yok. Canlı migration koordinatörün sürekli yetkisiyle.

---

## Dilimler

**Sıcak dosyalar.** `apps/web/src/views/SchedulePage.tsx` ve `apps/web/src/styles.css`'e aynı anda tek oturum
yazar. Sırası: W-1a → W-1b → W-3 → W-2 → W-4 (W-5 ve DRAG yalnız bu ikisine dokunmuyorsa paralel). Tutan oturum
`inbox.mjs status`'a "SchedulePage tutuyor" yazar. Veritabanında aynı fonksiyonlar DB-1a → DB-1b sırasıyla tek
`nf-db` oturumunda.

**Neden bu bölüm (koordinatörün önerisinden farkı):** `nf-db` işi tek dilim yerine dörde bölündü, çünkü B-1/B-3,
oturum yaşam döngüsü, şablon ve yayın kuralları ayrı fonksiyon kümelerine dokunuyor ve her biri tek başına bir
`nf-guvenlik` incelemesine sığmalı (1–2 gün). Web oturum işi ikiye bölündü: sunucuyu beklemeyen W-1a hemen
başlayabilir; W-1a'nın ilk commit'i oturum mantığını `SchedulePage.tsx`'ten ayrı bir kancaya taşır (davranış
değişmeden), böylece sonraki dilimlerin aynı satırlarda çakışması azalır.

| Dilim | Ne | Rol | Sınıf | Bağımlılık | Büyüklük |
|---|---|---|---|---|---|
| DB-1a | Oturum yetkisi: B-1, B-3, BL-159, B-9, BL-412 | nf-db | R3 | — | 1,5 gün |
| DB-1b | Oturum yaşam döngüsü: auto-save kurtarma (S1), D-O9 ad, D-Y5 kendi oturumu, D-O6, BL-224 | nf-db | R3 | DB-1a | 1,5 gün |
| DB-1c | (gerekirse) Undo için sunucu desteği | nf-db | R3 | W-1b ölçümü | 0,5–1 gün |
| DB-2 | Canlı kanal çekirdeğe ve lokasyona: B-2 (politika + yayın içeriği) | nf-db → nf-backend | R3 | — | 1 gün |
| DB-3 | Şablon ve yayındaki haftanın veri kuralları: S3 Overwrite, D-O2, D-O1, BL-292, BL-545 | nf-db | R3 | — | 1,5 gün |
| DB-4 | Yayın ve zaman kuralları: BL-238, BL-174, BL-326, BL-510, BL-619, B-7, BL-371; ölç BL-191, 315, 537, 544 | nf-db | R3 | — | 2 gün |
| BE-1 | API yetki temizliği: B-5, BL-494, B-8 + D-D5 ikiz rotalar | nf-backend | R3 | — | 1 gün |
| BE-2 | Dışa aktarma ve sözleşme: B-6, D-D4, BL-437 API, BL-101 ölçüm, BL-685, D-O7 veri katmanı, BL-391, BL-168 | nf-backend | R2 | BE-1 (aynı dosyalar) | 1,5 gün |
| W-1a | Oturum, sunucusuz kısım: kanca çıkarma, D-Y3, D-Y4, BL-616 | nf-backend | R2 | — | 1 gün |
| W-1b | Oturum, sunuculu kısım: S1, S2, D-Y5, D-O6, D-O9 bildirimi, D-D3, kanal adı | nf-backend | R2 | W-1a, DB-1b, DB-2 | 2 gün |
| W-3 | KARARLAR'da olup kodda olmayan arayüz: BL-681, D-O5, BL-038, Overwrite iki tık, D-O3, BL-437 panel + eski Export silme, BL-121, BL-318 + C-D6/C-D7, BL-685 kullanımı, D-D1, D-D2 | nf-arayuz | R2 | W-1b, DB-3, BE-2 | 2 gün |
| W-2 | Erişilebilirlik ve klavye (grup 4) | nf-arayuz | R1 | W-3 (sıcak dosya) | 1,5 gün |
| W-4 | Prototip 37 kalem + görünüm ve küçükler (grup 5) | nf-arayuz | R1 | W-2; VAR seçimleri | 2 gün |
| W-5 | Telefon ve dar ekran (grup 6, varyantsız kısım) | nf-arayuz | R1 (BL-334 R2) | VAR seçimleri (yalnız ilgili kısım) | 1 gün |
| VAR | Görsel varyantlar: BL-445, BL-524, BL-525, BL-441, C-D11, C-P2 | nf-arayuz | R0 (DEV, main'e girmez) | — (hemen) | 1 gün + Mert'in turu |
| DRAG | Sürükleme rengi: ölç, sonra tamamla | nf-arayuz | R1 | Açık soru 2; sıcak dosya kuralı | 0,5–1 gün |
| T-1 | E2E açıkları + ölçülmedi kalanlar (BL-211, BL-442) | nf-test | R0 | W-1b, W-3 | 1,5 gün |
| K-1 | Kod sağlığı: BL-386, BL-376, BL-275 | nf-backend (+nf-arayuz) | R2 | W-4 ve BE-2 bitince | 1,5 gün |
| Z | Kapanış: görsel QA, tam kapı, OZET ve bu dosyaya kanıt | koordinatör + nf-gorsel-qa | — | hepsi | 0,5 gün |

Paralel başlayabilecekler (gün 1): DB-1a, DB-2, DB-3, DB-4 (tek `nf-db` oturumu sırayla ya da iki oturum farklı
fonksiyonlarda), BE-1, W-1a, VAR, DRAG ölçümü. Aynı anda en çok iki ağır iş (CLAUDE.md §3).

### DB-1a — Oturum yetkisi (nf-db, R3)
- **In:** B-1 kaydetmede hedef taslak ya oturumun açıldığı taslak ya da çekirdeğe taslağın lokasyonlarıyla sorulur
  (`save_schedule_edit_session_service`, `20260926150000_one_function_per_schedule_job.sql:1429-1456`). B-3 kalp
  atışı, oturum okuma ve kaydetme oturumun lokasyonlarını yeniden sorar; kapsam dışıysa oturumu kapatır
  (`heartbeat_…`, `get_…`). BL-159 vardiya ekleme oturumun tuttuğu lokasyona bakar. B-9 / BL-412: başkasının
  taslak kimliğiyle açılışta düzenleyen adı ve P0002 varlık sızıntısı `authz.out_of_scope` ile aynı cevaba iner;
  ipucusuz 42501'ler `authz.*` hint alır.
- **Done when:** (1) Beşiktaş müdürü Can, Kadıköy taslağının kimliğiyle kaydetmeyi denediğinde 42501 +
  `authz.out_of_scope` alır ve taslak değişmez (pgTAP). (2) Kadıköy'den çıkarılan Ayşe'nin açık oturumunda kalp
  atışı / okuma / kaydetme reddedilir, oturum kapanır (pgTAP). (3) Bilinmeyen ve kapsam dışı taslak kimliği aynı
  cevabı alır (pgTAP). (4) `ci-green.txt` küçülmez; katalog sayaçları artmaz.
- **Touches:** `supabase/migrations/<yeni>.sql`, `supabase/tests/schedule_edit_session*.sql` (yeni ya da mevcut).
- **Test plan:** önce kırmızı pgTAP (TDD), tek transaction + rollback deneme, `test:db` (db.lock).
- **İnceleme:** `nf-guvenlik` zorunlu. Ultrareview satırına bak.

### DB-1b — Oturum yaşam döngüsü (nf-db, R3)
- **In:** S1 için oturumu adlı bir "auto-save" kurtarma taslağına çeviren, kilidi bırakan servis (var olan DATA-04
  kurtarma yolunu kullanır; ikiz yazılmaz). D-O9: sunucunun ürettiği kurtarma taslağı adı aynı biçime gelir
  (Açık soru 1'in cevabına göre); aynı kişinin başka taslak istemesinde eski oturum sessizce sürdürülmez, cevapta
  ayırt edilebilir durum döner. D-Y5: `list_schedule_pending_ops_service` yalnız çağıranın oturumunu döndürür.
  D-O6 + BL-224: açık oturumu olan taslağın silinmesi reddedilir (hint'li) ya da açık oturum önce kurtarma taslağına
  çevrilir; seçim P19 ile rol verir, raporunda yazar. Silme kuralı çekirdeğe (BL-224).
- **Done when:** (1) Süresi biten / kapatılan oturumun vardiyaları "Auto-save · <ad> · <tarih saat>" adlı taslakta
  durur, oturum vardiyası silinmez (pgTAP). (2) İki oturumlu yayındaki haftada her yönetici yalnız kendi bekleyen
  değişikliklerini alır (pgTAP). (3) Açık oturumlu taslak silinemez ya da düzenleyenin işi kurtarma taslağına geçer;
  "draft revision stale" sonsuz döngüsü yok (pgTAP). (4) Sözleşme (servis adı, cevap şekli, hint'ler) raporda yazılı.
- **Touches:** `supabase/migrations/<yeni>.sql`, `supabase/tests/schedule_edit_session*.sql`, yetki matrisi / katalog
  sınıflaması (yeni `*_service` varsa).
- **Test plan:** kırmızı pgTAP önce; rollback deneme; `test:db`.
- **İnceleme:** `nf-guvenlik` zorunlu (veri silme yolu).

### DB-1c — Undo sunucu desteği (nf-db, R3; yalnız gerekirse)
- W-1b ilk adımı, S2'nin var olan vardiya değiştirme uçlarıyla (ters işlem gönderme) kurulup kurulamayacağını
  ölçer. Toplu işlemler (şablon, Auto-fill, yapıştırma) için tek atomik geri dönüş gerekiyorsa bu dilim açılır:
  oturumu belirli bir revizyona döndüren servis. Done when: geri dönüş tek transaction, başka oturuma dokunmaz,
  pgTAP'ta kırmızıdan yeşile. `nf-guvenlik` zorunlu.

### DB-2 — Canlı kanal (nf-db → nf-backend, R3)
- **In:** B-2. Kanal ve presence politikaları `rls_can` ile `schedule.read` sorar; kanal lokasyon bazlı olur
  (`20260923173708_schedule_presence_join_reads_broadcast.sql:15` yerine yeni migration). `nf-backend`: yayın
  içeriğinden taslak kimliği ve kullanıcı kimliği çıkar (`apps/api/src/schedule/schedule-service.ts:607`, `:710`,
  `:1284-1301`), yayın lokasyon kanalına gider. Web'in kanal adı değişimi W-1b'de.
- **Done when:** (1) Çalışan Ali kanala katılamaz (pgTAP / politika testi: üç çalışan için "hayır"). (2) Beşiktaş
  müdürü Kadıköy kanalını dinleyemez. (3) Yayında taslak ve kullanıcı kimliği yok (API testi). (4) Açık Schedule
  ekranı başka müdürün kaydında yine yenilenir (W-1b'nin e2e'si).
- **Touches:** `supabase/migrations/<yeni>.sql`, `supabase/tests/<realtime>.sql`; `apps/api/src/schedule/schedule-service.ts`,
  ilgili `*.test.ts`.
- **İnceleme:** `nf-guvenlik` zorunlu (RLS).

### DB-3 — Şablon ve yayındaki haftanın verisi (nf-db, R3)
- **In:** S3: `apply_schedule_template_service` (`20260927160000_management_and_owner_are_kept.sql:1325`) Overwrite'ta
  yalnız şablonun lokasyon + departman kümesini temizler, başlamış vardiyaya dokunmaz, yayın kopyasını "silinecek"
  diye işaretler (doğrudan satır silmez). D-O2: şablon vardiyasına `unpaid_break_minutes` eklenir, kaydet ve uygula
  taşır (shared tip `nf-backend`'den, sözleşme raporda). D-O1: `mark_schedule_edit_session_shift_source` yeni
  eklenen satırı yayın kopyası saymaz. BL-292: yükte `note` yoksa not korunur. BL-545: açık oturumdaki taslak vardiya
  kapalı günde K16'ya göre düşer.
- **Done when:** (1) Kadıköy şablonu Overwrite'ında Beşiktaş vardiyaları kalır (pgTAP). (2) Salı 14:00'te başlamış
  9–17 vardiyası Overwrite sonrası durur (pgTAP, sabit saat). (3) 30 dk molalı şablon uygulanınca mola 30 kalır.
  (4) Yayındaki haftaya eklenen yeni vardiya "yayın kopyası" işaretlenmez. (5) `note` anahtarsız güncelleme notu
  silmez. (6) Kapalı güne düşen oturum vardiyası düşer ve listelenir.
- **Touches:** `supabase/migrations/<yeni>.sql`, `supabase/tests/schedule_templates*.sql`, `…live_shift_state*.sql`;
  `packages/shared` şablon tipi (`nf-backend`, aynı PR'da ayrı commit, sıra: shared önce).
- **İnceleme:** `nf-guvenlik` zorunlu (veri silme).

### DB-4 — Yayın ve zaman kuralları (nf-db, R3)
- **In:** BL-238 "bu hafta" lokasyonun saat dilimiyle (KK-6). BL-174 yayın tetikleyicisi önceki yayın varken de
  kontrol eder. BL-326 yayın taslağın lokasyon listesine bakar. BL-510 geçilemez bulgu "override" yazılamaz.
  BL-619 "Changed after publishing" yalnız müsaitliği sayar (M11). B-7 önemli tarih / kapalı gün süzgeci okuma
  fonksiyonunun içine (API'deki TypeScript süzgeci `schedule-service.ts:458-528` silinir; `nf-backend` aynı
  dilimde). BL-371 `published_by_name` doluyor. Ölç ve hüküm yaz: BL-191, BL-315, BL-537, BL-544.
- **Done when:** (1) Los Angeles lokasyonunda Pazar 20:00 PT'de gelecek hafta düzenlenebilir (pgTAP, sabit saat).
  (2) BL-174/326/510/619 için birer kırmızıdan yeşile pgTAP. (3) API'de kapsam süzgeci kalmaz (grep boş). (4) Menüde
  "Published by Unknown" yok. (5) Dört ölçülmedi maddesi geçerli / bayat hükmüyle bu dosyanın sonuna yazılı.
  (6) Schedule ızgara okuması ≤50 ms (fixture) bozulmaz.
- **Touches:** `supabase/migrations/<yeni>.sql`, `supabase/tests/*publish*.sql`, `apps/api/src/schedule/schedule-service.ts`.
- **İnceleme:** `nf-guvenlik` zorunlu (BL-238 R3, yayın tetikleyicisi).

### BE-1 — API yetki temizliği (nf-backend, R3)
- **In:** B-5 `export-v2/authorize` çekirdeğe (`schedule.export`), üye olmayana 404
  (`apps/api/src/schedule/schedule-export-v2-routes.ts:15-58`). BL-494 dışa aktarma kuralı düzenleme kapısı
  KARARLAR (2026-10-01): owner/admin hepsi, müdür kendi lokasyonları, bütün lokasyonları arşivli kural yalnız
  owner/admin (kapı veritabanındaysa `nf-db` ile; sıra nf-db önce). B-8 ölü rotalar silinir
  (`schedule-routes.ts:1421-1545`, `:2395`, `/v1/workspaces/:id/schedule/*`, `PATCH /shifts/publish`,
  `POST /schedule/edit-session/discard`, `GET /shifts`); silinen her uç `retired_objects_stay_gone` ya da rota
  listesi testine eklenir.
- **Done when:** (1) `rg "permissions.includes|role === \"employee\"" apps/api/src/schedule` Export'ta boş. (2) Üye
  olmayan 404, kapsam dışı 403 `authz.out_of_scope` (API testi). (3) Ayşe izindeyken owner onun Moda kuralını
  düzenleyebilir; arşivli kuralı müdür düzenleyemez (test). (4) Silinen rotalar 404 (test).
- **Touches:** `apps/api/src/schedule/schedule-export-v2-routes.ts`, `schedule-routes.ts`, `apps/api/src/app.test.ts`
  ya da ilgili `*.test.ts`; gerekirse `supabase/**` (`nf-db`).
- **İnceleme:** `nf-guvenlik` zorunlu.

### BE-2 — Dışa aktarma ve sözleşme (nf-backend, R2)
- **In:** B-6 CSV hücreleri `= + - @` ile başlarsa etkisizleştirilir (`schedule-export.ts:449-453`). D-D4 kısmi
  teslimde kayıt "kısmi" olur. BL-437 API tarafı (panelin ihtiyacı varsa). BL-101: canlıda ücretsiz tetiğin (Vercel
  günlük cron) kuralın saat seçimine yetip yetmediği ölçülür; ücret gerekiyorsa dolar tutarıyla koordinatöre
  döner, kurulmaz (P06). BL-685: `confirm_scope` web'e ulaşır (shared şema + `schedule-data.ts`). D-O7 veri katmanı:
  JSON olmayan cevap ("Unexpected token <") ve hata kodları tek yerde insan metnine eşlenir; bayat oturum metne
  değil koda göre tanınır (`SchedulePage.tsx:3620-3622`'deki metin eşleşmesi W-4'te kalkar). BL-391, BL-168 ölü
  anahtar / fonksiyonlar silinir, üç yakalanmayan çağrı yakalanır.
- **Done when:** (1) Ali'nin adı `=HYPERLINK(...)` olduğunda CSV hücresi metin olarak açılır (birim testi).
  (2) 10 alıcıdan biri düşünce kayıt başarılı sayılmaz (test). (3) BL-101 için ölçüm ve öneri raporda, dolar tutarı
  kaynaklı. (4) `confirm_scope` zod şemasında ve web'de okunuyor (test). (5) 502 HTML cevabında kullanıcı ham metin
  görmez (vitest). (6) `schedule-data.ts`'te çağıranı olmayan dışa açık fonksiyon yok.
- **Touches:** `apps/api/src/schedule/schedule-export.ts`, `schedule-export-cron.ts`, `packages/shared/**`,
  `apps/web/src/schedule/schedule-data.ts` (+ testleri).
- **İnceleme:** tek bağımsız inceleme (`/code-review`).

### W-1a — Oturum, sunucusuz kısım (nf-backend, R2)
- **In:** ilk commit: düzenleme oturumu durumu ve etkileri `SchedulePage.tsx`'ten (`:600-1260` civarı) ayrı bir
  kancaya taşınır, davranış değişmez (typecheck + mevcut vitest yeşil). D-Y3: kalp atışı eşiği uyarı süresinin ikinci
  kopyası olmaktan çıkar, kilit pencere süresince düşmez; kilit yine düşerse ekran aynı kişinin sürdürme yolunu
  kullanır (Retry / Keep editing çalışır, Discard tek çıkış değildir). D-Y4: `mode=edit&draft=` ile açılışta ve hafta
  değişiminde oturum sürdürülür, taslak boş görünmez. BL-616 `EnterEditModeDialog` silinir.
- **Done when:** (1) Düzenlerken F5 sonrası aynı vardiyalar ve şerit görünür (vitest + T-1 e2e). (2) 4 dk uyku sonrası
  SAVE çalışır ya da işi kurtaran yol açılır; ham "edit lease expired" görünmez (vitest, sahte saat). (3) `SchedulePage.tsx`
  satır sayısı düşer (ölçüm raporda). (4) `EnterEditModeDialog` repoda yok.
- **Touches:** `apps/web/src/views/SchedulePage.tsx`, `apps/web/src/schedule/hooks/useEditIdleTimer.ts`,
  `usePreviewSource.ts`, yeni `apps/web/src/schedule/hooks/useScheduleEditSession.ts`, `EnterEditModeDialog*`, testler.
- **İnceleme:** tek bağımsız inceleme.

### W-1b — Oturum, sunuculu kısım (nf-backend, R2)
- **In:** S1 geri sayım + otomatik kurtarma taslağı (DB-1b servisi); Keep editing? metni sonucu söyler (C-D6 metni;
  görünümü W-3). S2 Undo sunucuya da yazar (ilk adım: DB-1c gerekir mi ölçümü). D-Y5 yalnız kendi bekleyen
  değişiklikleri uygular (`useEffectiveShifts.ts:113-151`). D-O6 / D-O9 durumlarını ekran insan diliyle söyler
  (Açık soru 1). D-D3 "Someone is editing" bütün görünen lokasyonları izler. Kanal adı DB-2'ye göre
  (`useScheduleRealtime.ts`).
- **Done when:** (1) 15 dk + 15 sn hareketsizlikte iş "Auto-save · …" taslağında, ızgara görünüm modunda, mesaj var
  (vitest sahte saat + T-1 e2e). (2) Sürükle → Undo → 70 sn bekle: vardiya Salı'da kalır; Undo sonrası kayıt
  "session revision stale" vermez (vitest + e2e). (3) İki tarayıcıda Mert'in kaydedilmemiş taşıması Ayşe'nin
  ızgarasında görünmez (e2e). (4) Silinen taslakta sonsuz Retry yok. (5) "All locations"da Beşiktaş'taki düzenleme
  görünür.
- **Touches:** `apps/web/src/schedule/hooks/useScheduleEditSession.ts`, `useEffectiveShifts.ts`,
  `useScheduleRealtime.ts`, `schedule-data.ts`, `apps/web/src/views/SchedulePage.tsx` (yalnız bağlama), testler.
- **İnceleme:** tek bağımsız inceleme; sözleşme raporda yazılı (W-3 bunun üstüne kurar).

### W-3 — KARARLAR'da olup kodda olmayan arayüz (nf-arayuz, R2)
- **In:** BL-681 Unassigned yalnız düzenleme modunda (`scheduleGridViewModel.ts:69-70`). D-O5 New Schedule menüsüne
  şablon bilgileri geçer (`DraftDropdownMenu.tsx:361`, `SchedulePage.tsx:2310-2380`). BL-038 altı karar (Açık soru 3).
  S3 Overwrite iki tık (`ScheduleTemplateDialogs.tsx:121`, `:226-243`; mevcut tek tık testi
  `ScheduleTemplateDialogs.test.tsx:184-216` bugünkü kurala göre yeniden yazılır). D-O3 `converted_open_count`
  mesajda (`templateApplyMessage.ts:26-38`). BL-437 Export panelinde haftalık e-posta bölümü + D-D5 eski Export
  bileşenleri ve `App.test.tsx:1339`'daki yokluk kilidi silinir. BL-121 "40+ scheduled hours". BL-318 + C-D6 + C-D7:
  Export, Unpublish, Save draft, Review auto-fill, Keep editing?, Review default hours stil B'ye. BL-685 işaretini
  kullanır. D-D1 Save draft listesinde üstüne yazma iki tık. D-D2 tekil / çoğul.
- **Done when:** (1) Görünüm modunda Unassigned satırı yok, Edit'te var (vitest). (2) New Schedule ▾ → Save as
  template açılıyor (vitest). (3) BL-038'in altı kararının her biri için bir test. (4) Overwrite ilk tıkta silmez
  (vitest). (5) "Standard week: 24 shifts added, 2 became open shifts" benzeri metin (vitest). (6) Export panelinde
  e-posta kuralı kurulur ve listelenir; eski Export dosyaları repoda yok. (7) Altı pencere stil B'de (ekran görüntüsü,
  masaüstü + telefon).
- **Touches:** `apps/web/src/schedule/**` ilgili bileşenler, `apps/web/src/schedule/export-v2/**`, eski
  `ScheduleExport*` dosyaları (silme), `apps/web/src/views/SchedulePage.tsx`, `styles.css`, testleri.
- **İnceleme:** tek bağımsız inceleme (`/code-review`).

### W-2 — Erişilebilirlik ve klavye (nf-arayuz, R1)
- **In:** C-D3 odak hızlı düzenleyiciye, Export, Publish, Templates, Logo, Keep editing?'e girer ve kapanınca geri
  döner; boş hücreler tek Tab durağı (ok tuşlarıyla gezinme) ve okunur etiket. C-D4 "2 open shifts" ≥4,5:1. C-D5 yayın
  durumu yazıyla da söylenir, lokasyon noktası açıklaması odaklanabilir. C-D1 hızlı düzenleyicide Delete iki tık.
  D-O8 silme penceresinde Enter odaktaki düğmeye gider (UI-13'e taşınır). BL-608 her Esc bir katman. S4 (BL-617),
  S5 (BL-458). BL-449, BL-450 (3:1), BL-610, BL-612; ölç BL-454, BL-526.
- **Done when:** (1) Her pencere açılınca `document.activeElement` pencerenin içinde (vitest, pencere başına).
  (2) Düzenleme modunda ızgara 1 Tab durağı. (3) Kontrast ölçümleri raporda (≥4,5 metin, ≥3 kenar). (4) S4 ve S5 için
  birer vitest. (5) Klavyeyle Keep shifts + Enter vardiya silmez.
- **Touches:** `apps/web/src/schedule/**` pencereler, `scheduleInteractionTargets.ts`, `apps/web/src/views/SchedulePage.tsx`,
  `styles.css`, testler.
- **İnceleme:** koordinatör okuması + ekran görüntüsü (R1).

### W-4 — Görünüm ve tutarlılık (nf-arayuz, R1)
- **In:** A Tablo 2'deki 37 "taşı" kalemi. C-D2 (logo kutusu istisna listesine), C-D8, C-D9, C-D10 / BL-578 (masaüstü +
  telefon), C-D12, C-D14 (tarayıcı `title`'ı kalkar), C-D16, C "Küçük" listesi (geliştirici dili, read-only satır,
  ay dışı gün kontrastı, iğne düğmesi adı). D-O7 / BL-395 metinleri (BE-2'nin eşlemesi üstünde). S6 / BL-579 (veri
  katmanı rıza durumunu ayırt edebiliyor mu önce ölçülür; ayırt edemiyorsa `nf-backend`'e soru döner). Küçükler:
  BL-194, 236, 327, 403, 448, 451, 457, 499, 522, 570, 577, 614, 655. BL-346, BL-453 ölü CSS. VAR'dan seçilen
  BL-441, BL-524.
- **Done when:** (1) 37 kalemin her biri için "yapıldı + kanıt" satırı bu dosyanın sonunda. (2) `rg` ile ekrana çıkan
  ham hata metni yeri 0 (BL-395 listesi). (3) Logoya fareyle tık pencereyi açar, hafta değişmez. (4) Ham hex yerine
  token (dokunulan kurallarda).
- **Touches:** `apps/web/src/schedule/**`, `apps/web/src/views/SchedulePage.tsx`, `styles.css`, testler.
- **İnceleme:** koordinatör okuması + ekran görüntüsü.

### W-5 — Telefon ve dar ekran (nf-arayuz, R1; BL-334 R2)
- **In:** C-P1 / BL-587 üç süzgeç menüsü 375 px'te sığar. BL-233 768 px'te çakışma yok. BL-334 ikon düğmesi
  (ortak sınıf `styles.css:3077`; başka ekranlar etkilenir → R2, komşu ekran görüntüsü). BL-580. Ölç: BL-573, 574,
  320, 333 (375 px). VAR'dan seçilen BL-445, C-D11, C-P2 üretimi.
- **Done when:** 375 / 390 / 768 / 1024 / 1280 px ekran görüntülerinde taşma ve binme yok; ölçülen dört madde
  hükümlü.
- **Touches:** `styles.css`, `schedule-topbar-filter.css`, ilgili bileşenler.
- **İnceleme:** koordinatör ekran görüntüsü; BL-334 için komşu ekranlar da.

### VAR — Görsel varyantlar (nf-arayuz, R0, main'e girmez)
- **In:** gerçek uygulamada DEV'de query param ile (`?var=<madde>-a|b|c`) birbirinden gerçekten farklı 2–3 varyant:
  BL-445 (üst çubuk dar pencerede), BL-524 (ad sütunu müsaitlik simgesi), BL-525 (müsaitlik / izin şekil farkı; renk
  G14 kilidi değişmez), BL-441 (Publish ön kontrolünde hangi özet kalır), C-D11 (tek lokasyonlu haftada 7 gün),
  C-P2 (telefon düzeni). Bugünkü görünüm de bir varyanttır (P04 kanıtı 2026-10-04). Varyantsız karar yazılmaz.
- **Done when:** her madde için adres listesi + masaüstü / telefon ekran görüntüsü koordinatörde; Mert'in seçimi
  KARARLAR'a yazıldı (koordinatör); üretimi W-4 / W-5'te.
- **Touches:** yalnız `task/ekran-01-var` dalında `apps/web/src/schedule/**`, `styles.css`; dal birleşmez.

### DRAG — Sürükleme rengi (nf-arayuz, R1)
- **In:** (1) ölçüm: üç sürüklemede (hücre → hücre, preset, açık vardiya) hedef hücrenin `data-drop-status`'u ve
  görünen rengi, gerçek uygulamada ve prototipte; hangi sürüklemede, hangi engelde (lokasyon, iş, tarih / saat,
  izin, kapalı gün) eksik olduğu tabloyla. (2) eksikleri tamamlamak; `styles.css:5841-5855` ham hex'leri token'a.
- **Done when:** üç sürüklemenin her biri için kabul eden hücre yeşil, etmeyen kırmızı (vitest: `data-drop-status`;
  e2e T-1); "warning" Açık soru 2'ye göre.
- **Touches:** `ScheduleRow.tsx`, `SchedulePresetRows.tsx`, `ShiftDragPreview.tsx`,
  `useScheduleGridDragControllers.ts`, `styles.css`; `SchedulePage.tsx` gerekiyorsa sıcak dosya kuralı.

### T-1 — Test açıkları (nf-test, R0)
- **In:** e2e'de hiç geçmeyen akışlar: sürükle-bırak (+renk), yapıştırma, toplu silme, Undo, Discard, Unpublish,
  şablon kaydet / uygula / Overwrite, Export dosyası, K17, geçmiş hafta kilidi, geçmiş vardiya penceresi, varsayılan
  saatler; W-1a / W-1b'nin yenileme, hareketsizlik ve iki tarayıcı senaryoları. Ölç: BL-211, BL-442.
- **Done when:** yeni senaryolar yerelde (db.lock) ve main CI'da yeşil; 50 ms testi yeşil kalır; iki madde hükümlü.
- **Touches:** `e2e/**`.

### K-1 — Kod sağlığı (nf-backend + nf-arayuz, R2)
- **In:** BL-386 `SchedulePage.tsx` kalan bölümleri (araç çubuğu bağlama, pencere evi) ayrı dosyalara; BL-376
  `schedule-routes.ts` konuya göre dosyalara (davranış değişmez); BL-275 ızgara modeli `useMemo`.
- **Done when:** `SchedulePage.tsx` ve `schedule-routes.ts` < 1500 satır; tam kapı yeşil; 50 ms ölçümü bozulmaz.
- **İnceleme:** tek bağımsız inceleme.

### Z — Kapanış (koordinatör)
- `nf-gorsel-qa`: owner, tek lokasyon müdürü, 1440 + 390, bütün pencereler (ekranın kendisi teslim edilen şey).
- Tam kapı + `test:db` + e2e yeşil, main CI yeşil; OZET "Kapanış durumu" ve bu dosyanın "Notes / Result"u kanıtla.

## Done when (ekranın tamamı)
1. In scope'taki her bulgu ve BL maddesi "kapandı (`<commit>`)" ya da adıyla ertelendi; liste bu dosyanın sonunda.
2. 37 prototip kalemi gerçek uygulamada, kanıt satırıyla.
3. VAR'daki altı madde Mert'in seçimiyle uygulandı.
4. Tam kapı (`lint`, `typecheck`, `test`, `build`), `test:db`, etkilenen e2e yeşil; main CI yeşil.
5. Masaüstü (1440) ve telefon (390) ekran görüntüleri `artifacts/nf-gorsel-qa/EKRAN-01/` altında.
6. Açık sorular cevaplandı ve KARARLAR'a yazıldı.

## Touches (özet)
`supabase/migrations/**`, `supabase/tests/**` (nf-db) · `apps/api/src/schedule/**`, `packages/shared/**`,
`apps/web/src/schedule/schedule-data.ts`, `apps/web/src/schedule/hooks/**` (oturum, kanal) (nf-backend) ·
`apps/web/src/views/SchedulePage.tsx`, `apps/web/src/schedule/components/**`, `export-v2/**`, `styles.css` (nf-arayuz;
SchedulePage sırası yukarıda) · `e2e/**` (nf-test).

## Test plan (özet)
- Her davranış düzeltmesi önce kırmızı test (CLAUDE.md §5 adım 4): veritabanında pgTAP, web'de vitest (sahte saat
  hareketsizlik / kilit için), sözleşmede zod parse testi.
- Etkilenen e2e: T-1 listesi. `test:db` ve e2e `db.lock` ile; başlamadan `gh run list --limit 3`.
- Performans: Schedule ızgara okuması ≤50 ms her DB dilimi sonunda.

## Risk
- **En büyük risk: W-1b + DB-1b (S1, S2).** Kurtarma ve Undo yanlış kurulursa iş yine kaybolur, bu kez "kaydedildi"
  sanılarak. Hafifletme: sahte saatli vitest + iki tarayıcılı e2e, DB tarafında oturum vardiyasının silinmediğini
  sınayan pgTAP.
- **Sıcak dosya çakışması:** `SchedulePage.tsx` ve `styles.css`. Hafifletme: W-1a'nın kanca çıkarması, sıra kuralı.
- **R3 yığılması:** DB-1a/1b/2/3/4 ve BE-1 altı ayrı `nf-guvenlik` incelemesi ister. Hafifletme: DB-1a+1b tek
  incelemede birleştirilebilir (aynı fonksiyonlar), sınıf düşürülmez.
- **Canlı migration:** DB dilimleri main'e girdikten sonra koordinatörün sürekli yetkisiyle (MCP, OPS-03, önce yedek).
  Silen migration (DB-3, BE-1'in nesne silmesi) main CI yeşil olunca.
- **Pre-mortem (3 ay sonra neden başarısız?):** (a) Undo tam kurulmaya çalışılırken toplu işlemlerde geri dönüş
  yarım kalır → DB-1c ölçümüyle erken karar. (b) 37 cila kalemi "küçük" diye tek commit'e yığılır, inceleme
  okunmaz → W-4 kalem başına kanıt satırı. (c) VAR için Mert'in turu gecikir, W-4/W-5 bekler → VAR gün 1'de başlar,
  varyantsız kısımlar beklemez.

## Ultrareview
Riskli yüzeye dokunan dilimler: DB-1a, DB-1b, DB-1c, DB-2, DB-3, DB-4, BE-1 (yetki, RLS, veri silme). Ücretsiz hak
durumu bu dosyada bilinmiyor: **koordinatör sorar.** Hak bitmişse CLAUDE.md §5'e göre yalnız en riskli işte, dolar
tutarıyla önerilir; adaylar DB-1a (yetki çekirdeği / kapsam) ve DB-2 (RLS). Not: Mert 2026-10-01 ve 2026-10-02'de
iki kez "iki inceleme yeter" dedi (ILKELER P06 kanıtları); öneri buna göre tek satır kalır.

## Açık sorular (KARARLAR'da cevabı yok; tahmin edilmedi)

**Soru 1 — Başkasının kilidi düşünce onun kaydedilmemiş işi kurtarma taslağına geçtiğinde kime ne söylenir? (D-O9)**
- Bugün: Schedule → New Schedule ▾ → bir taslağı Edit. Önceki düzenleyenin kilidi düşmüşse sunucu onun işini
  "Recovered edit 2026-10-05 21:14:07 3f9a" adlı taslağa çeviriyor; kimse bilgilendirilmiyor.
- Örnek: Ayşe "Plan A"da 8 vardiya yazdı, kaydetmeden çıktı; Zeynep "Plan A"yı açınca Ayşe'nin işi ayrı taslağa geçer.
- (a) **(Önerilen)** Taslağın adı S1 biçiminde olur ("Auto-save · Ayşe Yılmaz · Oct 5, 9:14 PM"). Zeynep düzenleme
  şeridinde tek satır görür: "Ayşe's unsaved changes were saved as a separate draft." Ayşe bir dahaki açılışta aynı
  satırı görür. Bildirim gitmez; engel değil, bilgi.
  Dayanak: KARARLAR Schedule "Hareketsizlik… auto-save" (ad biçimi) + ILKELER P10 (ilerleme kaybolmaz) + A bölümü
  anti-hedef "bildirim gürültüsü".
- (b) Ayşe'ye bildirim de gider (Notifications).
- (c) Bugünkü gibi sessiz, yalnız ad değişir.

**Soru 2 — Sürüklemede "uyarı" durumu (DRAG)**
- Bugün: hücrenin üç durumu var: kabul (yeşil), engel (kırmızı), uyarı (amber; `styles.css:5851`). Uyarı,
  müsaitlik gibi geçilebilir durumlarda çıkıyor.
- Örnek: Ayşe, Ali'nin "2:00 PM'den sonra müsait değil" işareti olan Salı hücresine 15:00 vardiyasını sürükler.
- (a) **(Önerilen)** Üç durum kalır: Ali'nin hücresi amber yanar, bırakılabilir, uyarı onayda sorulur. İzinli gün ve
  lokasyon / iş uygunsuzluğu kırmızı.
  Dayanak: KARARLAR "Ürün kuralları → Müsaitlik" M8 (müsaitlik her zaman warn, hiçbir zaman engel) + ILKELER P24.
- (b) İkili: geçilebilen her şey yeşil, yalnız gerçek engel kırmızı (Mert'in cümlesinin harfi harfine okuması).
- (c) Önce gerçek ekranda iki hâli görelim (P04).

**Soru 3 — Şablonda "Replace" onayı: pencere mi, iki tık mı? (BL-038 K2 ile S3)**
- Bugün: Templates → şablon → Overwrite tek tıkla çalışıyor.
- BL-038 K2 (Mert 2026-09-16): "Add to current shifts" / "Replace current shifts"; Replace'te pencere "N shifts will
  be removed. Draft only, not published." [Cancel] [Replace]. S3 (Mert 2026-10-05): "onay iki tıktır (UI-12)". UI-12
  "etki listesi gereken onayda diyalog kalır" diyor.
- Örnek: Zeynep Kadıköy şablonunu 24 vardiyalı haftaya Replace ile uygular.
- (a) **(Önerilen)** Düğmelerin adı "Add to current shifts" / "Replace current shifts"; Replace iki tık; ilk tıkta
  düğmenin yanında "24 shifts will be removed. Draft only, not published." yazar, ikinci tık "Confirm replace".
  Dayanak: ILKELER P22 (en güncel açık karar: S3 iki tık) + BL-038 K2'nin metni ve adları.
- (b) K2'deki pencere kalır (UI-13 ConfirmDialog), iki tık yok.
- (c) Önce gerçek ekranda ikisini görelim (P04).

**Soru 4 — Hücreden "izni kısalt ve ata" (BL-362) bu turda mı?**
- Bugün: Ali'nin Salı izni onaylıysa Ayşe o hücreye vardiya yazamaz; izni kısaltmak için Requests'e gider.
- (a) **(Önerilen)** Bu turda yok; Requests ekranına (ekran 2) taşınır, orada izin iptali modeliyle birlikte konuşulur.
  Dayanak: ILKELER P18 (izin iptali temel model, önce sohbette).
- (b) Schedule turunda kurulsun.
- (c) Önce sohbette konuşalım.

**Soru 5 — Undo, kaydedilmiş adımı da geri alır mı? (S2'nin sınırı)**
- Bugün: Undo yalnız ekranda; S2 ile kayıtta da geri alacak. Kaydedilmiş adımda ne olacağı yazılı değil.
- Örnek: Ayşe vardiyayı Çarşamba'ya taşır, Save draft'a basar, sonra Undo'ya basar.
- (a) **(Önerilen)** Undo yalnız açık oturumun son kaydından sonraki adımları geri alır; Save draft yığını temizler, Undo
  soluklaşır.
  Dayanak: yok — yeni karar (P25'e yakın: kaydedilmiş karar ayrı bir eylemle geri alınır).
- (b) Kaydedilmiş adımı da geri alır (taslak yeni revizyonla değişir).

**Soru 6 — Zamanlanmış e-posta hangi haftayı yollar? (BL-437, D raporu şüphe listesi)**
- Bugün: gönderim anının haftası; Pazar akşamına kurulan e-posta biten haftayı yollar.
- Örnek: owner Pazar 18:00'e Kadıköy e-postası kurar; Ali Pazar akşamı geçen haftanın programını alır.
- (a) **(Önerilen)** Gönderim gününün haftası biterken (Cuma–Pazar) bir sonraki haftayı, diğer günlerde içinde
  bulunulan haftayı yollar.
  Dayanak: yok — yeni karar; sektör emsali bu dosyada ölçülmedi.
- (b) Her zaman bir sonraki hafta.
- (c) Kuralı kuran seçsin ("this week" / "next week") — anti-hedef "ayar cehennemi"ne dikkat.

**Cevaplar (2026-10-06, KARARLAR "Schedule"):** Soru 1 (a) koordinatör kararı (KK-162) · Soru 2 (a) Mert: üç renk · Soru 3 (a) koordinatör kararı (P22) · Soru 4 (a) koordinatör kararı: BL-362 Requests turuna · Soru 5 (a) Mert: kaydedilen adım geri alınmaz · Soru 6 Mert: kapsam dışı, BL-437'ye not (W-3 başlamadan koordinatör yeniden açar).

## Notes / Result
(Dilim kapandıkça: dilim, commit, kanıt; 37 kalem tablosu; ölçülmedi maddelerinin hükümleri.)
