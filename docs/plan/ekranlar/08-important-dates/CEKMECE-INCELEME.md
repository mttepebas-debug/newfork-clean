# EKRAN-08 — Important Dates çekmecesi: davranış testi, kod testi, UI/UX, tasarım (EKRAN-08-CEKMECE, 2026-10-07)

- **Karar:** Mert çekmece tasarımını seçti: A (Stacked) + lokasyon satırlarında onay kutusu (L1, "L1 ONAY"). Kararlar koordinatöre iletildi, KARARLAR'a işlendi (A'nın 7 maddesi), L1 ve Note maddesi iletildi
- **İzin:** yok (yalnız `.md` gönderimi)
- **Risk:** 🔴 kapalı gün uygulamayı iki ayrı yoldan durduruyor: API havuzu (BL-958) ve kapalı günlü haftanın Schedule'ı (YENİ)
- **Soru:** iki varsayım sabah Mert'in teyidinde; YENİ bulgulara numara koordinatörden; ACIL-40001 (KK-211) görev mesajı bana ulaşmadı
- **Sonraki:** DURDURULABILIR, sabah Mert'in teyidi

## Mert için özet
Seçtiğin çekmece (A + L1, Note büyük): https://claude.ai/artifact/Pt7K2NVLwFx6TPS9ZuXNKX (4. sürüm; ilk beş tasarım 1. sürümde, beş lokasyon seçimi 3. sürümde).
1. 🔴 **Vardiyalı güne "Closed day" kaydı uygulamayı kilitliyor.** Kadıköy müdürü Ayşe 14 Ekim'i kapatmak istiyor; o gün Ali ile Emre'nin vardiyası var. Save'e basınca çekmece "Saving"de kalıyor. Her deneme API'nin bir bağlantısını sonsuza kadar meşgul ediyor; ~9 denemede bütün uygulama herkes için durdu. BL-958, düzeltme acil iş.
2. 🔴 **İçinde kapalı gün olan haftanın Schedule'ı açılmıyor.** 21 Ekim'i ("Deep clean") ya da 28 Ekim'i ("Staff training") kapatınca o hafta owner'a da müdüre de "Schedule unavailable" gösteriyor. YENİ. Bu yüzden Schedule'dan kapalı güne vardiya yazmayı ekranda deneyemedim; sunucu bu durumda vardiyayı engellemiyor, onay soruyor.
3. 🟠 **Yarım gün yok.** "Half day - close at 3 PM"i Holiday olarak kaydettim. Ali'nin 15:00–23:00 vardiyası olduğu gibi kaldı, hiçbir yerde uyarı çıkmadı. Seçtiğin tasarımdaki lokasyon satırı (Short hours) bunu çözüyor.
4. 🟠 **Klavyeyle çekmecenin yarısına gidilemiyor.** Tab tuşu Locations'tan sonra başa dönüyor; Starts, Note ve Save'e hiç ulaşmıyor. YENİ, ortak çekmece bileşeninde.
5. 🟠 **Kapalı günü geri alırken sessizlik.** Arşivlenince ya da yayından kalkınca "1 shift stays open" yazmıyor; kapalı günü yeniden yayınlamak "Internal server error" veriyor; taslak haftadaki vardiyalar sessizce açık vardiyaya düşüyor. BL-884, BL-882.

## 1. Davranış testi (gerçek uygulama)
**Ortam (2026-10-07, 09:20–09:47Z):**
- **Sunucu ve kod:** Mert'in dev sunucusu, web `localhost:5555`, API `5556`; main `560555f4`. Kendi sunucumu açmadım.
- **Kilit:** `db.lock` 09:24–09:46Z bendeydi.
- **Test dünyası:** "World ek081791365024", builder ile. Lokasyonlar Kadikoy (K) ve Besiktas (B), saat dilimi Europe/Istanbul.
  - Owner Olcay, admin Zeynep (K), müdür Ayşe (K), müdür Mehmet (B), çalışan Emre (K), çalışanlar Ali ve Deniz (K + B).
- **Haftalar:**
  - 12 Ekim haftası yayınlı: 14 Ekim K'de Ali 09–17 ve Emre 12–20, B'de Deniz 10–18; 15 Ekim K'de Emre 09–15 ve Ali 15–23, B'de Deniz 09–17.
  - 19 Ekim haftası yalnız taslak: 21 Ekim K'de Emre 09–17 ve Ali 12–20, B'de Deniz 10–18.
  - 26 Ekim haftası boş.
- **Araç:** Playwright + Chrome, 1440 ve 390.
- **İlk dünya:** "World ek081791364610" bir betik yazım hatası yüzünden yarım kaldı, raporda yalnız tekrarlanan ölçüm olarak geçer.
- **Kanıtlar:** ekran görüntüleri ana klasördeki çalışma kopyasının `artifacts/EKRAN-08-CEKMECE/` klasöründe (gitignore'da): `s*-*.png`.

| No | Senaryo (rol) | Beklenen (kayıt) | Olan | Kök neden | Eşleşme |
|---|---|---|---|---|---|
| D1 | **Kapalı gün, yayınlanmış vardiyalı gün** — Ayşe 14 Ekim'i Kadıköy için "Closed day" yapar | K13 / C1-B (bugünkü hâliyle): vardiya listesi açılır; yeni karar A: Shifts sekmesi, Remove varsayılan | Çekmece "Saving"de asılı kalıyor (`s1-ayse-closed-published-after-save-1440.png`), kayıt oluşmuyor, vardiyalar yerinde. API 10 sn sonra 500. Her deneme bir PostgREST bağlantısını sonsuza kadar meşgul ediyor; 9 denemede 10'luk havuz doldu, **bütün uygulama** 10 sn sonra 500/504 verdi (PGRST003), DB 5 sn'de ~5.700 işlem geri aldı. Takılı 11 bağlantıyı (hepsi benim test isteklerim; 10 ilk kilitlenmede, 1 Republish denemesinde) `pg_terminate_backend` ile sonlandırdım; API düzeldi (liste ~150 ms, 200) | Web listeyi göndermiyor (`ImportantDatesSettingsPage.tsx:214-217`); sunucu reddi `errcode = '40001'` ile atıyor (`supabase/migrations/20261005000000_closed_days_reach_the_shifts.sql:538`; Republish `:669`; sürüm çakışması `:484`, `:661`; arşivliyi düzenleme `:481`; `:273`); PostgREST 40001'i geçici çakışma sayıp durmadan yeniden deniyor. Schedule publish bunu `serialization_failure → PT409` ile sarıyor, önemli tarih sarmıyor | BL-882 + **BL-958** (KK-211) |
| D2 | Aynı, **owner** (bütün lokasyonlar, 15 Ekim), **admin** Zeynep (K + B, 15 Ekim), **müdür** Mehmet (B, 14 Ekim) | D1 ile aynı | Dördünde de çekmece "Saving"de asılı (`s6-owner-closed-all-locations-refused-1440.png`, `s6-admin-closed-both-refused-1440.png`). Rolden bağımsız | D1 | BL-882, BL-958 |
| D3 | **Kapalı gün, yalnız taslak hafta** — Ayşe 21 Ekim'i kapatır | K16: taslak vardiyalar sorulmadan open'a düşer, tek bilgi satırı | Kayıt geçti. Taslakta K'nin iki vardiyası `OPEN` oldu, B'deki Deniz yerinde (SQL, önce / sonra). Ekranda hiçbir satır yok, çekmece sessizce kapandı | `draft_shifts_opened` web'de okunmuyor (`ImportantDatesSettingsPage.tsx:120-133`) | K16 ✓; bilgi satırı BL-884 |
| D4 | **Kapalı gün, boş hafta** — Ayşe 28 Ekim'i kapatır; sonra Schedule'ı açar | Kayıt geçer; Schedule'da gün başlığında kapalı işareti (K10) | Kayıt geçti. Ama **26 Ekim haftası Schedule'da açılmıyor: "Schedule unavailable"** (owner ve müdür; API `/schedule/reference` 500). Aynısı 19 Ekim haftasında (21 Ekim kapalı) ve ilk dünyada 12 Ekim haftasında (14 Ekim kapalı). Kapalı günü arşivlenmiş ya da yalnız Event olan haftalar 200 (`s4-ayse-schedule-oct19-closed-day-week-1440.png`) | Kapalı gün satırının kimliği `md5(...)::uuid` (`20261005000000_closed_days_reach_the_shifts.sql:92`, görünüm `schedule_closures`); API okuma modelini `scheduleReadModelSchema.parse` ile denetliyor (`apps/api/src/schedule/schedule-service.ts:501`), şema `id: z.string().uuid()` (`packages/shared/src/index.ts:1495`). zod 4'ün UUID kuralı sürüm ve varyant bitlerini istiyor; md5'ten gelen kimlik (ör. `c6717f17-012c-8945-cc5c-fca50e875fae`) reddediliyor (`node` ile doğrulandı). Rastgele md5'in ≈ 8'de 7'si reddedilir | **YENİ** (kritik) |
| D5 | **Yarım gün** — Ayşe 15 Ekim'i "Half day - close at 3 PM" diye kaydetmek ister | Kayıt yok; Mert'in yeni kararı: lokasyon satırında Short hours + saat | Çekmecede saat alanı yok (alanlar: Title, Type, Locations, Starts, Ends, Repeats, Note, Flag). Holiday olarak kaydedildi; 15:00 sonrası Ali'nin 15–23 vardiyası aynen kaldı, uyarı yok (`s5-ayse-half-day-no-hours-1440.png`) | Tür listesi `holiday / event / blackout / closed_day`; saat yok | **YENİ** (karar A ile çözülür; veri modeli §5) |
| D6 | **Vardiyanın açık vardiyaya düşmesi (sunucu yolu)** — ekran listeyi göstermediği için K13'ü API ile yaptım: önizleme → Ali "Keep", Emre düşsün | K13: listelenen düşer, Keep kalır; K14: düşen kişiye tek bildirim | Kayıt geçti. 14 Ekim K: Ali 09–17 yerinde, Emre'nin 12–20'si `OPEN`, B'deki Deniz yerinde (tek lokasyon kapandı, P23 ✓). Outbox'ta K14 olayı var: `schedule.important_date.available`, "Kadikoy is closed on Oct 14 — your shift was removed". Emre'nin gelen kutusu boş: yerelde outbox işleyicisi çalışmıyor (1.571 bekleyen satır) → teslim **ölçülemedi**. Emre'nin ana sayfası (390) "Your next shift: Thursday, Oct 15" diyor; 14 Ekim'in kalktığı hiçbir yerde yazmıyor | — | K13 ✓, K14 olay ✓, teslim ölçülmedi |
| D7 | **Unpublish → Republish** (satır menüsü, Ayşe) | K8: geri alınabilir; Republish K13 listesinden geçer | Unpublish geçti (Emre'nin vardiyası `OPEN` kaldı). Republish asılı kaldı (1 bağlantı döngüde); bağlantıyı sonlandırınca sayfada ham "Internal server error" çıktı (`s9-ayse-republish-after-guard-1440.png`) | D1 (`:669`) | BL-882, BL-958 |
| D8 | **Archive** (satır menüsü, Ayşe) | B1: iki tık kırmızı; K15: vardiya geri gelmez, "1 shift stays open" | Tek tıkla arşivlendi, ekranda hiçbir satır yok. Emre'nin vardiyası `OPEN` kaldı (K15 ✓) | `ImportantDatesSettingsPage.tsx:718-732`, `:128-133` | BL-595, BL-884 |
| D9 | **Schedule'dan kapalı güne vardiya yazma** (Ayşe, 28 Ekim, Emre 09–17) | K10 / K17: "Closed location" ayarı (varsayılan confirm) | Ekranda denenemedi: hafta açılmıyor (D4). Sunucunun değerlendirmesi (`assess_schedule_shift_service`, geri alınan işlemde): `closed_location`, `severity: confirm`, `can_override: true`, metin "Location or shift type is closed on this date." (vardiya türü kapanışı 2026-10-02'de kalktı, metin eski) | D4; metin `20261007000000` | K10 ✓ (sunucu); ekran YENİ (D4); metin BL-895 ailesi |
| D10 | **Roller kim görür** | K1–K6 | Owner ve admin hepsini görür ve düzenler. Ayşe (K) owner'ın Kadıköy "Inventory day"ini görür ama satır gri (opaklık 0,45), tıklanmaz, menü yok (`s10-ayse-list-1440.png`). Mehmet (B) Kadıköy'ün hiçbir tarihini görmez, "No important dates yet" (K6 ✓, `s10-mehmet-list-1440.png`). Emre (çalışan) menüde görmez; `/app/important-dates` onu kendi ana sayfasına götürür. Schedule telefonda kapalı ("Schedule is available on a computer", tasarım gereği) | — | K2 kilidi BL-676 ✓ (okuma da kapalı); K6 ✓ |

**Görünürlük özeti (ölçülen):**

| Rol | Listeyi görür | Yeni tarih | Başkasının kaydı | Kapalı günü vardiyalı güne kaydeder |
|---|---|---|---|---|
| Owner | hepsi | her lokasyon, bütün workspace | düzenler | hayır (D1, asılı) |
| Admin (Zeynep) | hepsi | aynı | düzenler | hayır (D2) |
| Müdür (Ayşe, K) | yalnız K'ye dokunanlar | yalnız K | üst rütbeninkini açamaz (BL-676) | hayır (D1) |
| Müdür (Mehmet, B) | K'ninkileri görmez | yalnız B | — | hayır (D2) |
| Çalışan (Emre) | sayfa yok | — | — | — |

## 2. Kod testi (odaklı, hafif; ağır koşu yok)
Ölçüm 2026-10-07, worktree `newfork-wt/ekran-08` @`560555f4` (`origin/main`).

| Komut | Sonuç |
|---|---|
| `pnpm.cmd --filter @newfork/web exec vitest run src/settings/ImportantDatesSettingsPage.test.tsx src/schedule/importantDateCoverage.test.ts src/schedule/schedule-conflicts.test.ts src/schedule/lib/scheduleClosures.test.ts src/schedule/components/DayHeaderCell.test.tsx src/schedule/components/ScheduleDayHeaderCells.test.tsx src/schedule/hooks/useCellState.test.ts src/settings/settings-no-access.test.tsx` | 8 dosya, **53 test geçti** (16,6 sn) |
| `pnpm.cmd --filter @newfork/api exec vitest run src/settings/important-dates-routes.test.ts` | 1 dosya, **17 test geçti** (6,3 sn) |

Yeşil olmaları hatayı göstermiyor: web testi kaydetmeyi taklit ediyor (`ImportantDatesSettingsPage.test.tsx:238-270`, `saveImportantDate` sahte), bu yüzden sunucunun vardiyalı günde kaydı reddetmesi (BL-882) testte hiç doğmuyor. API testleri önizleme ve 409'u sınıyor ama ekran o uçları çağırmıyor.

**Eksik test vakaları** (yazılmadı; görev kod / test dosyası yazmayı yasakladı):
- **vitest, Important Dates sayfası**
  1. Yayınlanmış vardiyalı güne "Closed day": sayfa `previewImportantDateClosure`'ı çağırır, listeyi gösterir, kayıtta `keep_shift_ids` + `expected_fingerprint` gider (bugün kırmızı olur; BL-882).
  2. 409 `important_date.closure_changed`: liste yeniden okunur, ham cümle görünmez.
  3. Kapalı günü Republish etmek listeyi açar (BL-882).
  4. Archive / Unpublish sonrası "N shifts stay open"; taslak haftada "N draft shifts move to open shifts" (BL-884).
  5. Geçmiş ve üst rütbe kaydı salt okunur açılır, satırda `disabled` yok (BL-676).
  6. İki lokasyon seçen müdürde Save'in kapanma nedeni yazılı (BL-889).
  7. Ham sunucu cümlesi yerine `reason`'a göre kısa metin (BL-886).
- **vitest, ortak `CatalogDrawer`** (YENİ, aşağıda U1): içinde `<summary>` olan çekmecede Tab, Title'dan Save'e kadar her alana ulaşır; Shift+Tab geri döner.
- **Tarayıcı (Playwright, jsdom CSS okumaz)**: Locations seçicisinde odak halkası görünür (U2); alan kenarı ≥ 3:1 (U3).
- **e2e** (main'de Important Dates e2e'si hâlâ yok): (a) Ayşe 14 Ekim'i kapatır, Ali "Keep", Emre "Open shift"; Emre bildirimi alır; (b) arşivde vardiya açık kalır ve "1 shift stays open" yazar; (c) Schedule'da kapalı güne vardiya yazmak K17 ayarına göre sorar / engeller; (d) Unpublish → Republish listeyi açar.
- **pgTAP**: kaldırma bildirimi kapanış düzenlenince / kaldırılınca kalır (BL-883, S3 cevabına göre); değiştiren ≠ yazar (BL-890); Unpublish'te `shifts_stay_open` (yalnız arşiv sınanıyor).

## 3. Çekmecenin UI/UX incelemesi (1440 ve 390)
Ölçüm 2026-10-07, Mert'in dev sunucusu (`localhost:5555`, main `560555f4`), Playwright + Chrome, Kadıköy müdürü hesabıyla "New date" → Type "Closed day" (kaydetmeden). Görüntüler `artifacts/EKRAN-08-CEKMECE/ui-mgr-*.png`.

| No | Ne (örnek) | Ölçüm / kök neden | Önem | Eşleşme |
|---|---|---|---|---|
| U1 | **Klavyeyle çekmecenin yarısına ulaşılamıyor.** Ayşe Title'dan Tab'a basar: Type → Locations → Close (X) → Title… döngüsü; Starts, Ends, Repeats, Note, Cancel ve Save'e ileri Tab ile hiç gelmez. | Playwright Tab yürüyüşü: 14 basışta 4 öğe dönüyor. Kök: ortak `CatalogDrawer`'ın odak listesi `summary` içermiyor (`apps/web/src/settings/CatalogDrawer.tsx:5-6`); listede olmayan öğeden Tab "ilk öğeye dön" sayılıyor (`:116-122`). Locations seçicisi `<details><summary>` (`ImportantDatesSettingsPage.tsx:382-393`). Aynı ortak çekmece içinde `<summary>` taşıyan başka ekranlar var (Documents incelemesi `DocumentReviewDrawer.tsx:876`, Shift Hub `ShiftExchangeHub.tsx:1226`, `:1447`, Announcements `AnnouncementsPage.tsx:946`); onlar ölçülmedi. | yüksek (WCAG 2.1.1) | **YENİ** (ortak bileşen; EKRAN-02 C3 ailesi) |
| U2 | **Locations seçicisinde klavye odağı görünmüyor.** Tab ile Locations'a gelince hiçbir halka çıkmıyor. | `jobs-settings.css:2195-2201` `summary:is(:focus, :focus-visible) { outline: none; box-shadow: none }`; ölçümde `outline=none`, `shadow=none`. Ekran: `ui-mgr-focus-locations-1440.png` | orta (WCAG 2.4.7) | **YENİ** |
| U3 | **Alan kenarları beyazda 1,25:1** (Type, Locations, Starts, Ends, Repeats, Note). Çekmece kendi `--job-*` paletini kullanıyor: Save `#286d57` (tema yeşili `#176954` değil), onay kırmızısı `#a53936`. | `jobs-settings.css:1-12` (`--job-border #e1e7e3`), `:178-182`, `:117-126`; WCAG 1.4.11 3:1 ister; liste sayfaları için `--theme-border-control #7f8c86` kararı var (KARARLAR S7). CLAUDE.md §2.A.7 ham hex yerine token. | orta | BL-255 ailesi (aynı `--job-border`); alan kenarı kısmı **YENİ** |
| U4 | **Alanlar aynı boyda değil.** Masaüstü: Title, Type, Repeats 36 px; Starts, Ends 37,5 px; Locations 38 px (Type ile yan yana, alt çizgileri 2 px kayık). Telefon: alanlar 44 px, Locations 38 px. Locations'ın ok simgesi öteki açılır listelerden farklı. | `fieldRows` ölçümü; `ui-mgr-closed-1440.png`, `ui-mgr-closed-390.png` | düşük (Mert'in simetri ölçütü) | **YENİ** |
| U5 | **Kapat (X) başlık satırıyla aynı çizgide değil:** masaüstünde 4,8 px, telefonda 10,8 px aşağıda. | `closeVsTitle` ölçümü | düşük | **YENİ** |
| U6 | **Başlık altı cümle yanlış söz veriyor:** "Use closed day for dates that should block scheduling." Kapalı gün varsayılan ayarda yazmayı engellemiyor, onay soruyor (davranış testi D4). | `ImportantDatesSettingsPage.tsx:325` | düşük | BL-892 |
| U7 | **"Flag this date inside scheduling" kutusu tarayıcı mavisi** (tema yeşili değil); "Closed day"de gri kilitleniyor ama nedeni yazmıyor. | `jobs-settings.css:2101-2104` `accent-color` yok; `:537` `disabled` | düşük | **YENİ** |
| U8 | **Alan adları 11 px / 700**, öteki çekmecelerde 12 px / 600 — aynı işlevde iki ölçü (§2.A.7). | `jobs-settings.css:2048-2053` ↔ `:635-640` | düşük | **YENİ** |
| U9 | Pencerede "Delete date" arşivliyor; satır menüsünde Archive tek tık (iki tık kırmızı kuralı). | keşif D5 | orta | BL-595 |
| U10 | Gün durumu ve saat alanı yok (yarım gün yapılamıyor); kapalı gün etki listesi ve History yok. | §2 D3, keşif D1 / D3 | — | YENİ (S5) / BL-882 / BL-885 |

Tutan yerler: çekmece masaüstünde 640 px, telefonda tam ekran (390 × 844); telefonda alt çubuk ekranın içinde (775–844), Save sağ altta tek; Esc çekmeceyi kapatıyor; Cancel beyaz, Save yeşil (metin kontrastı 6,15:1), Cancel 12,49:1.

## 4. Tasarım: beş varyant ve Mert'in seçimi
Artifact: https://claude.ai/artifact/Pt7K2NVLwFx6TPS9ZuXNKX (özel; sahibi bu hesap). Kaynak dosya, gitignore'daki `artifacts/EKRAN-08-CEKMECE/important-date-drawer.html`.

| Sürüm | İçerik | Mert'in cevabı (2026-10-07, bu pencerede, serbest metin) |
|---|---|---|
| v1 | Beş çekmece: A Stacked, B Split, C Choice cards, D Location rows, E Day timeline; her biri masaüstü + telefon, örnek gün ve rol seçici | **A** seçildi, değişikliklerle (aşağıda 1–7) |
| v2 | A'nın 7 değişiklikli hâli | lokasyon çipleri kalksın, seçim satırlardan; "Location hours" → "Locations"; çekmece kaydırmasız; 5 varyasyon |
| v3 | Satırdan seçimin 5 yolu: L1 onay kutusu sütunu, L2 durumda "Off", L3 anahtar, L4 ad düğmesi, L5 tek satır + "Set per location" | **L1**; Note biraz büyüsün |
| v4 | A + L1, Note kalan boşluğu dolduruyor (62–200 px) | **"L1 ONAY"** |

**Mert'in kararları:**
1. A (Stacked) iskeleti.
2. Starts / Ends'in altında saat kutuları ve "All day" kutusu. Varsayılan All day işaretli. v3'ten beri kutu "Ends" yazısının sağında duruyor, böylece çekmece kaydırmasız sığıyor.
3. Lokasyon başına durum: Open / Short hours / Closed. Short seçilince o satırda Opens / Closes kutuları çıkıyor.
4. Çipler kalktı, seçim satırlardan yapılıyor. Başlık "Locations".
5. Vardiyalar ayrı sekmede: Details · Shifts · History.
6. Her vardiyada Remove · Open shift · Keep. Kapalı günde varsayılan Remove. Uyarı satırı seçime göre değişiyor ("3 shifts will be removed · 1 becomes open").
7. Yeşil düğmede yalnız "Save"; değişiklik yokken kapalı, ilk değişiklikte açılıyor.
8. L1: satır başında onay kutusu; başlıkta "All locations" kutusu (bir kısmı seçiliyse yarım işaret). Seçilmeyen satır gri ve "Not included" yazıyor. Hiç lokasyon seçili değilse Save kapalı ve "Choose at least one location." yazıyor.
9. Note, Details sekmesinde kalan boşluğu dolduruyor.

**Ters çevrilenler** (KARARLAR'a işlenmesi koordinatörde):
- C1-B: liste formun altında; "Save · N shifts to open".
- K13: varsayılan "open'a düşsün".
- v2'deki çip kuralı ("All seçiliyken bir ada basınca yalnız o seçilir"); L1 başlık kutusuyla yerine geçti.

**Mert'in sabah teyidini bekleyen iki varsayım:**
- Kısa saatte saatin tamamen dışında kalan vardiya varsayılan Remove; saate kısmen taşan vardiya Keep.
- All day kapalıyken girilen saat aralığı yalnız bilgi; vardiyaya dokunmuyor.

**Ölçüm (v4, Playwright):**
- Masaüstü 1440 × 900'de dört örnek günde (hepsi kapalı / biri kapalı / üçü kısa saat / tek lokasyon), owner ve müdür görünümünde Details kaydırmasız sığıyor.
- Telefonda üç lokasyonlu owner görünümü kayıyor; müdür görünümü sığıyor.
- Hizalama: durum düğmeleri her satırda aynı solda ve eşit genişlikte (sapma ≤ 0,02 px); alt düğmeler aynı çizgide (0 px); saat kutuları tarih kutularının tam altında (0 px).
- Sayfada hata yok; 390'da yatay kaydırma yok.

## 5. Veri modeli: lokasyon başına durum (karar 3) — öneri, kod yok
Koordinatörün istediği not. Ölçüm 2026-10-07, yerel DB (son migration `20261007130000`), `pg_proc` / `information_schema` SELECT.

**Bugün:**
- `public.important_dates`: kayıt başına **tek tür** (`type` = `holiday | event | blackout | closed_day`), hedef lokasyonlar `location_ids uuid[]` (boş = bütün workspace) + eski `location_id`; tarih `starts_on` / `ends_on`, `recurrence`; saat alanı yok.
- Kapalı gün yalnız `type = 'closed_day'` ile var olur ve kaydın **bütün** lokasyonlarına aynı anda uygulanır. "Kadıköy açık, Beşiktaş kapalı" için iki ayrı kayıt gerekir; "kısa saat" hiç yok.
- Kapalı günü okuyan tek kaynak görünüm `public.schedule_closures`: `important_dates` × `app_private.closure_days(...)`, `where type = 'closed_day' and status = 'published' and archived_at is null`. İçinde eski ikizden kalan boş sütunlar var (`is_all_day` hep `true`, `shift_type_ids` hep `'{}'`, `end_date` hep `null`).
- Vardiya düşürme kaydı `public.important_date_shift_releases` (`important_date_id`, `published_shift_id`, `source_shift_id`, `before_assignment jsonb`, `actor_user_id`): yalnız "open'a düştü" olayını tutar; "kaldırıldı" ayrımı yok.

**En az bakım isteyen yeni şekil (öneri):**
1. **Yeni çocuk tablo `important_date_locations`**: `important_date_id` (FK, `on delete cascade`), `workspace_id`, `location_id` (FK), `day_state` (`open | short | closed`), `opens_at time`, `closes_at time`; birincil anahtar `(important_date_id, location_id)`; kontrol: `day_state = 'short'` ise iki saat dolu ve `closes_at > opens_at`, değilse ikisi boş. RLS açık, politika yok, yalnız `service_role` (bugünkü üç tabloyla aynı kapalı düzen, B raporu "Temiz olanlar").
   - Kayıt hangi lokasyonlarda geçerliyse o lokasyonların satırı var; "All locations" = o anki bütün lokasyonların satırı. (Bugünkü "boş dizi = bütün workspace, sonradan açılan lokasyon da dahil" anlamı kalkar; yeni lokasyon kendi satırı eklenene kadar tarihi görmez. Bu bir ürün sorusu: koordinatöre.)
   - `important_dates.location_ids` ve `location_id` silinir (ikiz sistem yok, §2.A.4); `retired_objects_stay_gone`'a eklenir.
2. **`type`'tan `closed_day` (ve S4'e göre `blackout`) çıkar**: tür yalnız etiket (Holiday / Event); kapanış lokasyon satırının işi olur.
3. **Tarihin kendi saati (karar 2)**: `important_dates.starts_at_time`, `ends_at_time` (ikisi de boş = All day). Varsayıma göre yalnız bilgi, vardiyaya dokunmaz.
4. **`schedule_closures` görünümü yeni tablodan okur**: `day_state in ('closed','short')`; `is_all_day = (day_state = 'closed')`, yeni sütunlar `opens_at`, `closes_at`; ölü `shift_type_ids` ve `end_date` sütunları silinir. Görünümün adı ve okuyanları aynı kalır, böylece Schedule tarafı tek yerden değişir.
5. **`important_date_shift_releases`'e `action` (`open | remove`) sütunu**: K15'in "geri gelmez" sonucu ve History iki eylemi ayırır.

**Etkilenen fonksiyonlar (ölçüm: tanımında `closed_day`, `location_ids` ya da `schedule_closures` geçenler):**
- Önemli tarih çekirdeği: `app_private.closure_days`, `important_date_closure_impact` (kısmi saat: vardiyanın açık saat dışında kalıp kalmadığı), `important_date_close_shifts` (üç seçenek: `remove` için silme + bildirim, `open`, `keep`), `important_date_keep_past` (geçmiş günleri bölerken lokasyon satırlarını da kopyalar), `important_date_snapshot` (History farkı satırları da yazar), `important_date_visible`, `_recipients`, `_notified`, `_out_to`, `_deliver`, `_tell_removed`, `_stay_open` (hedef artık satırlardan okunur).
- Servisler: `save_important_date_service` (girdi: lokasyon satırları + vardiya başına seçim; bugünkü `keep_shift_ids` yerine `choices: [{shift_id, action}]`), `set_important_date_state_service`, `preview_important_date_closure_service` (lokasyon başına durum ve saat; "kısmen taşan" bilgisi), `read_settings_important_dates_service`, `read_important_date_history_service`.
- `schedule_closures`'ı okuyan 8 Schedule fonksiyonu (görünüm değişince birlikte sınanır; kısa saatte "o gün kapalı" yerine saat çakışması gerekir): `assess_weekly_shift_availability`, `get_employee_schedule_board_service`, `get_schedule_edit_session_service`, `get_schedule_read_model_service`, `list_schedule_weekly_shifts_service`, `preview_schedule_publication_service`, `weekly_assignment_candidate_base`, `weekly_schedule_publication_preflight`.
- Shared ve web: `importantDateInputSchema`, `importantDateClosureChoiceSchema`, `importantDateClosurePreviewSchema`, `scheduleReadModelSchema.closures` (yeni saat alanları); web `schedule/lib/scheduleClosures.ts`, `schedule/schedule-conflicts.ts` (bugün ölü "Location is closed for this shift type" metni de var, `:80-81`), `DayHeaderCell`; API `apps/api/src/schedule/schedule-service.ts:480-523` (BL-701: Schedule önemli tarihleri API'de süzüyor).
- Testler: pgTAP `closed_days_reach_the_shifts`, `announcements_and_dates_*`, `authorization_coverage`, `retired_objects_stay_gone`; yetki matrisi değişmez (yeni servis yok, var olanların girdisi değişir).

**Taşıma:** canlı müşteri yok (P01). Tek migration: tablo + görünüm + fonksiyonlar birlikte; var olan `closed_day` kayıtları her hedef lokasyon (boşsa o anki bütün lokasyonlar) için `day_state = 'closed'` satırına çevrilir, türleri `holiday` olur; sonra `location_ids`, `location_id` ve tür değeri silinir. Geriye uyumluluk dalı yazılmaz. Risk sınıfı R3 (RLS / grant / veri silme dokunuşu), `nf-guvenlik` zorunlu; Schedule okuması etkilendiği için EKRAN-01 ile aynı anda konmaz (DB-4).

## 6. Remove (karar 6): bugün bildirim üretiyor mu
Koordinatörün istediği not; BILDIRIM oturumunun olay envanterine girecek biçimde.

| Alan | Değer |
|---|---|
| Olay | Yayınlanmış ve atanmış bir vardiyanın kaldırılması ("Remove") |
| Tetikleyen | (a) Important Dates çekmecesinde kapalı / kısa saatli gün kaydı, vardiyada Remove seçili (yeni, karar 6); (b) Schedule'da yayınlanmış haftada vardiyayı silip yeniden yayınlamak (bugün var) |
| Etkilenen | Vardiyası kalkan çalışan (P07: işi doğrudan etkilenen) |
| Karar veren | Kaydı yapan müdür / admin / owner (K1–K3 kapsamıyla) |
| Bugün (a) | **Remove diye bir eylem yok.** Kapalı gün vardiyayı yalnız açık vardiyaya düşürüyor (`employee_id` boşalıyor) ve kişiye tek bildirim gidiyor: tür `schedule.important_date.available`, başlık "<Lokasyon> is closed on <Mon D> — your shift was removed" (`app_private.important_date_tell_removed`, `supabase/migrations/20261005000000_closed_days_reach_the_shifts.sql:313-365`, başlık `:351`; çağrı `:586`, `:689`). Yani bugünkü metin "removed" diyor ama vardiya silinmiyor, açık vardiya oluyor. Bu bildirim tarih sonradan düzenlenince / kaldırılınca geri çekiliyor (BL-883). |
| Bugün (b) | **Bildirim yok.** `publish_schedule_draft_service` yalnız müdürün seçtiği ve yeni yayında **hâlâ vardiyası olan** kişilere `schedule.published` gönderiyor (`supabase/migrations/20261007050000_schedule_edit_asks_the_core_for_its_locations.sql:930-955`, koşul `:954` `shift.employee_id = employee.id`). O haftadaki tek vardiyası silinen kişi hiç haber almıyor; başka vardiyası kalan kişi yalnız genel "haftan yayında" bildirimini alıyor, hangi vardiyanın kalktığını değil. Katalogda (`notification_catalog`, 35 tür) "vardiya kaldırıldı" türü yok. |
| Gereken | Kişi başına tek bildirim (K14 ilkesi: kapanış + kaldırma tek mesaj); Remove ile Open shift ayrı metin ("your shift on Oct 14 was removed" / "…is now an open shift"); geri çekilmez (S3 / BL-883 önerisi); Schedule yolundaki kaldırma da aynı olayı üretir. |
| Ölçüm | Kod okuması + `notification_catalog` SELECT (2026-10-07). Davranış testinde (a)'nın bugünkü hâli ölçüldü: §1 D6 (olay outbox'ta üretiliyor, yerelde teslim ölçülemedi). (b) uygulamada denenmedi. |

## 7. Bulgular tek listede (numara koordinatörden)
| Kısa ad | Ne | Önem | Eşleşme |
|---|---|---|---|
| D1 / D2 / D7 | Kapalı gün kaydı ve Republish 40001 döngüsüne girip API havuzunu dolduruyor | kritik | BL-958 (KK-211), BL-882 |
| D4 | İçinde yayında kapalı gün olan haftanın Schedule'ı 500 ("Schedule unavailable"): md5 kimlik zod UUID kuralına takılıyor | kritik | **YENİ** |
| U1 | Ortak çekmecede `<summary>` olunca Tab başa dönüyor; Save'e klavyeyle gidilemiyor (başka çekmeceler ölçülmedi) | yüksek | **YENİ** |
| D5 | Yarım gün / kısa saat yok | orta (karar A çözer) | **YENİ** (veri modeli §5) |
| D6 | Çalışanın ana sayfası kaldırılan vardiyayı söylemiyor; gelen kutusu yerelde ölçülemedi | orta | BILDIRIM envanteri (§6) |
| U2 | Locations seçicisinde odak görünmüyor | orta | **YENİ** |
| U3 | Çekmece alan kenarları 1,25:1; çekmece `--job-*` ham hex paletinde | orta | BL-255 ailesi + **YENİ** |
| D3 / D8 | Taslakta ve arşivde sonuç satırı yok; Archive tek tık | orta | BL-884, BL-595 |
| D10 | Üst rütbenin kaydı müdüre kapalı ve soluk | orta | BL-676 (ölçüldü, geçerli) |
| U4 / U5 / U7 / U8 | Alan boyları farklı; X başlıkla aynı çizgide değil; onay kutusu mavi; alan adı 11 px | düşük | **YENİ** |
| U6 | Başlık altı cümlesi yanlış söz veriyor | düşük | BL-892 |
| D9 | Kapalı gün uyarısında "or shift type" kalıntısı | düşük | BL-895 ailesi |

## 8. Ölçülmeyenler
- **Schedule'dan kapalı güne vardiya yazma (ekranda):** hafta açılmadığı için (D4) denenemedi. Yalnız sunucunun değerlendirmesi ölçüldü. K17'nin "bir kez sor" derecesi de bu yüzden denenmedi.
- **Bildirimin çalışana ulaşması:** yerelde outbox işleyicisi çalışmıyor (1.571 bekleyen). Olayın üretildiği ölçüldü, teslimi ölçülmedi.
- **Canlıda BL-958 ve D4:** canlıya dokunulmadı. Canlı main'den çıktığı ve migration'lar canlıda olduğu için aynısı beklenir.
- **U1'in öteki çekmecelerde tekrarı:** Documents incelemesi, Shift Hub, Announcements ölçülmedi.
- **İki lokasyonlu müdürde Save'in kapanma nedeni (BL-889):** test dünyasında iki lokasyonlu müdür yok.
- **Yıllık tarih, geçmiş kilit (K11), History:** bu turun kapsamı dışında; keşif raporları geçerli.

## 9. Bakım ve senin yerine verdiğim kararlar
- **Sunucu:** kendi sunucumu açmadım; Mert'in 5555 / 5556'sı kullanıldı. Playwright tarayıcıları kapandı, açık süreç yok; yerleşik tarayıcı sekmesi kapandı.
- **Kilitler:**
  - `db.lock` 09:24–09:46Z'de alındı, bırakıldı.
  - Ağır koşu yok. `main.lock` yalnız bu `.md` gönderimi için alınır.
- **Yerel DB'de kalanlar:** iki test dünyası ("World ek081791364610", "World ek081791365024"), builder kayıtları, başka workspace'e dokunmuyor. 11 takılı PostgREST bağlantısı sonlandırıldı (yalnız `save_important_date_service` / `set_important_date_state_service` çağrıları; veri kaybı yok).
- **Kod:** kod, migration ya da test dosyası yazılmadı.
- **Senin yerine verdiğim kararlar:**
  1. Davranış testi için Meyhouse yerine yeni test dünyası kurdum (Meyhouse'ta kapalı gün Mert'in vardiyalarını düşürürdü).
  2. K13'ün sunucu yolunu ekran listeyi göstermediği için API ile denedim (D6).
  3. Uygulama herkes için durunca takılı bağlantıları sonlandırdım; acil bildirimi koordinatöre gönderdim.
  4. Tasarımdaki iki varsayım (Remove / Keep varsayılanları, tarih saatinin yalnız bilgi olması).
  5. L1'i önerdim; Mert onayladı.
- **Plan ilerlemesi:** Ekran 8 için keşif (A, B, D) + bu inceleme bitti. Tasarım kararı verildi (A + L1). Uygulama dilimleri A1, A2, B1 ve yeni veri modeli dilimi sırada; BL-958 acil önde.
