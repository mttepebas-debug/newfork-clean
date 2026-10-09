# Durum — 2026-10-09 02:55Z
🟠 Main CI kırmızı (Time off onay e2e'leri, BL-990); kökünü bulup düzeltmek için tek işçi çalışıyor. Bu iş bitene kadar tren kalkmıyor (kırmızı çıkacağı belli, işçinin yerel e2e'sini de bekletir).

## Seni bekleyen (26)
Kaynak notlar: `task/devir-2026-10-08` dalı, `docs/plan/devir-2026-10-08/`.

**Giriş ve katılım — EKRAN-16** (`EKRAN-16.md` §5)
- B1 ⛔ **Giriş modeli** (`authmodel`: kod / ikisi / parola; önerilen e-posta + 6 haneli kod) — işi durduran tek soru; seçim gelmeden R3 görev dosyası yazılmaz — 2026-10-07'den beri
- B2 Marka seçimleri: sembol, motto, hareket, yerleşim (A/B/C), pazarlama — tasarım kitabı (Hesap 1) — 2026-10-07
- B3 S1–S4 (SABAH-SORULAR'da G4–G7) ve görsel G1–G4 (OZET §2, §5) — 2026-10-07

**Requests — EKRAN-02** (`EKRAN-02-requests.md` §5)
- B4 Tek tablo + C2 takas incelemesi görünüm bakışı (S2, G13); gelmeden c2r trene girmez — 2026-10-08
- B5 nf-guvenlik'in 3 düşük bulgusu (C2.md): düzeltilsin mi, backlog'a mı — 2026-10-08

**Settings — EKRAN-10**
- B6 General: altı tasarımın "hiçbiri" — neyi beğenmedin (yerleşim / görünüm / içerik)? (G1, `EKRAN-10-GENERAL.md` §4) — 2026-10-07
- B7 General: G2 öneriler Ö1–Ö4; G3 workspace saat dilimi modeli (önce sohbet) (`EKRAN-10-GENERAL.md` §5) — 2026-10-07
- B8 General: kurulum listesini admin de gizleyebilsin mi (EKRAN-05 S3 ile aynı, Tur 5) — 2026-10-07
- B9 Jobs: 4 kapsam sorusu (düz liste, başlıktan sıralama, katlama, Archived) — "dönünce cevaplayacağım, unutma" (`EKRAN-10-JOBS.md` §5, JOBS-TWEAKS "Açık sorular") — 2026-10-07
- B10 Jobs: 5. soru (New department'ın yeri, Departments satır düzeni) — önce 2–3 varyant hazırlanacak — 2026-10-07
- B11 Locations: ortak çekmecedeki 15 px kayma yalnız Locations mı, ortak mı (kod işi başlarken) (`EKRAN-10-LOCATIONS.md` §5) — 2026-10-07

**Important Dates — EKRAN-08** (`EKRAN-08-CEKMECE.md` §5; SABAH-SORULAR'da yok)
- B12 Soru 1: kısa saatli günde vardiya varsayılanı (dışta kalan Remove, kısmen taşan Keep) — 2026-10-07
- B13 Soru 2: All day kapalıyken girilen saat yalnız bilgi mi — 2026-10-07

**Bildirim — BILDIRIM** (`BILDIRIM.md` §5)
- B14 G8: 6 temel model sorusu (kanal, ayar kimde, owner/admin, karar sonrası satır, yayında kime, cover duyurusu) — önce sohbet — 2026-10-07
- B15 G9: varyant seçimi (merkez A/B/C, ayar A/B/C, telefon A/B/C) — 2026-10-07

**Schedule — EKRAN-01** (`EKRAN-01.md` §5)
- B16 S24 (BL-759) ve S25 (BL-238, önce sohbet) — 2026-10-08
- B17 Görsel #86 (dar pencerede üst çubuk), #87 (tek lokasyonda Pazar), #88 (iki Templates yüzeyinden hangisi) — 2–3 varyantla gelecek

**Employees — EKRAN-03** (`EKRAN-03.md` §5)
- B18 Şartlı: BL-969 canlı ölçümünde `account number cleared` > 0 çıkarsa senin "evet"in (canlıda gerçek veri silme) — şu an yok

**Güvenlik — GUVENLIK-A** (`GUVENLIK-A.md` §5)
- B19 GA-3 için ücretli `/code-review ultra` istiyor musun — 2026-10-08
- B20 Yarım kalan 4. sorun ("uygulamamızın dizi başından beri …") — tamamlanmadı — 2026-10-08

**Araçlar — PARALEL-1** (`PARALEL-1.md` §5)
- B21 OTOMASYON-5'in 5 sorusu — önce workflow v2'nin bunları karşılayıp karşılamadığını ölçerim, kalanı sorarım — 2026-10-08

**Genel** (`README.md` §3, `KOORDINATOR.md` §4)
- B23 WORKFLOW-KONUSMASI §3'ün açık noktalarından workflow v2'nin karşılamadıkları — 2026-10-08
- B24 SABAH-SORULAR'ın kalanı: G11 (BL-821), G14 (BL-968), S4–S23 — 2026-10-08
- B25 Uzak dal silme (ajanlara yasak): `task/guvenlik-a`, `-ga4`, `-ga4-v2`, `task/sayfa-klasoru`, `task/acil-40001`, `-v2`; eski `task/bl-965*`, `task/bl-969`, `-2`, `-3`, `task/tren-araci*`, `task/bl-757` (önce `git cherry` ile ölçerim) — 2026-10-08
- B26 Makine: `C:\Users\TheWe\.codex` silme (14 GB, HATIRLATMALAR), Supabase Studio kapatma, vmmem kaynağı; OTOMASYON-4 hesap değişimi testi 2026-10-11 18:00 PT — 2026-10-08
- B27 Para / CI: GitHub ücretsiz 2.000 dk sonrası dakika başı; tavan; public repo — 2026-10-08

## Bugün biten
- İş akışı v2 (tek koordinatör, beklemesiz tren, tek kilit, karar defteri, `/oto` ve `/durum`) — `9f287986..7ecbcc74`; tren CI'ı e2e'de kırmızıydı (yalnız Time off onayı, main'de de kırmızı), Mert'in tek seferlik aşımıyla gönderildi; main yedeği `refs/nf-backup/main/20261009T023046Z`
- Eski koordinatörün main'e girmemiş kayıtları (KK-229…235, BL-974…989, DERS 61, HANDOFF, HATIRLATMALAR) ve devir klasörü yeni yapıya taşındı — aynı tren

## Koşuyor
- BL-990 Time off onay e2e'lerinin kökü (dal `task/bl-990`) — nf-isci (incelemeli, effort high) — port 5612/5613 — başladı 02:53Z

## Sırada
İş · dal@sha · kalan adım · sınıf · neden bu sırada. ⏸ = seni bekliyor.

0. S0 BL-990 → "Koşuyor"da
1. S1 GA-2 main'e al · `task/guvenlik-a-ga2`@`302af460` · trene bindir (ledger adı `20261008133054` aynen kalır); S0'dan sonra · incelemeli (canlıda, yetki; ONAY var) · canlıda olup main'de olmayan tek şey; GA-3a buna dayanıyor
2. S2 BL-985 e2e'de rastgele 60 sn takılmaları · — · S0 bittikten sonra kalan var mı ölç · normal
3. S3 Requests `20261008111800` (silen) canlıya · main'de · yedek hazır → `apply_migration` → ledger sürümünü dosya adına eşle → md5 `62e92f77…`, advisors, SELECT · incelemeli (riskli, koordinatör uygular) · main CI yeşilini bekliyor (S2)
4. S4 EKRAN-01 #12 Undo (BL-762) · `task/ekran-01-undo`@`53cb9276` · rebase (30 geride) → tam test:db → canlı yedek → `apply_migration` → doğrula → yeniden adlandır → hazır · incelemeli (fonksiyon gövdesi, koordinatör uygular; ONAY @baa144fb) · en küçük onaylı canlı DDL
5. S5 EKRAN-01 #38 izin işareti (BL-579) · `task/ekran-01-38`@`92072dab` · test + build → test:db → fixture + 1440 önce/sonra → canlı → hazır · incelemeli (fonksiyon gövdesi; ONAY @92072dab) · #12 ile aynı kilit penceresi
6. S6 BL-969 Employees form kuralı · yerel `task/bl-969`@`d3e8e6ad` → `task/bl-969-4` · push → dal CI → canlı ölçüm (0 değilse dur, ⏸ B18) → yedek → migration 1 → main + Vercel → migration 2 (silen) · incelemeli · 3 ONAY'lı, canlı bekliyor
7. S7 Requests C2 · `task/ekran-02-c2r`@`8ef7b05a` (yerel) · `db:schema` → tam kapı + test:db + Requests e2e · incelemeli (migration `111900`) · ⏸ B4 olmadan trene girmez
8. S8 GA-3a Settings eski kapıdan çekirdeğe · yeni dal (GA-2'li main'den) · kırmızı pgTAP → 12 fonksiyon `authorize`'a … · incelemeli (R3, en güçlü model) · S1'den sonra; ⏸ B19
9. S9 EKRAN-01 #28/#29 şablon penceresi · `task/ekran-01-templates`@`94fdfc57` · `styles.css` ~9870 izni → CSS → 1440 görüntü → rebase (30 geride) → kapı · normal · küçük, hazıra yakın
10. S10 EKRAN-01 DB-4 (#3–#7, #10) · `task/ekran-01-db4`@`f5282ef2` · yeni dala yalnız 4 DB-4 commit'i, fonksiyon karşılaştırmasını yeniden yap → test:db → inceleme yenilenir → canlı · incelemeli · Requests engeli kalktı
11. S11 BL-959 kapalı günlü hafta Schedule'da 500 · — · EKRAN-01'de kapandı mı doğrula · normal · EKRAN-08 kod işinden önce şart
12. S12 EKRAN-10 Locations → A kod işi · yeni dal · LOCATIONS-TWEAKS "Koda uygulanırken" · normal (R1–R2) · Mert'in onayı tamam; ⏸ B11 işin başında
13. S13 BILDIRIM B1 söküm · yeni dal · söküm listesini bugünkü main'de `pg_proc` ile yeniden ölç → K1–K5'i taşı → sil · incelemeli (R3, canlı) · başlayabilir; G8 cevapları sonraki dilimleri belirler
14. S14 EKRAN-08 kod işi · yeni dal · önce veri modeli (`important_date_locations` + RLS), sonra çekmece (A + L1, artifact v4) · incelemeli (yeni tablo + RLS) · S11'den sonra; ⏸ B12, B13
15. S15 EKRAN-03 bekleyiş işi A4 liste okuması (öneri) ya da A1 · yeni dal · — · normal (A4, R2) / incelemeli (A1) · BL-969 beklerken
16. S16 EKRAN-01 R1 maddeleri (#46–#57, #61–#80) ve ölü kod (#16, #17, #23, #92); #10/#13/#15 koordinatör soruları · — · normal · 71 açık maddenin sırası
17. S17 EKRAN-01 40001 payı · `task/ekran-01-40001` · Schedule düzenleme servislerindeki 40001 → PT409 · incelemeli · ACIL-40001'den kalan
18. S18 OTOMASYON-4 kalanı · `task/otomasyon-4`@`145ba50f` (yerel, push yok) · workflow v2 üstüne rebase → nabız, guard uyarısı, test listesi → `/code-review` · normal · koşulu (TREN-ARACI) v2 ile kalktı; test 2026-10-11 (B26)
19. S19 EKRAN-03 c1a (#32, #33, #39, sonra #37) · `task/ekran-03-c1a`@`8cc2fbec` (yerel) · Requests C3 main'e girince rebase · normal · C3'ü bekliyor
20. S20 EKRAN-10 Jobs kod işi · yeni dal · JOBS-TWEAKS "Koda uygulanacaklar" · normal (R2) · ⏸ B9, B10
21. S21 EKRAN-10 General yeni tur (birebir kopya + 2–3 varyant) · — · normal · ⏸ B6; `GeneralSettingsPage.tsx` EKRAN-05 C1 ile aynı anda verilmez
22. S22 EKRAN-16 R3 görev dosyası (BL-351, -941, -419/-935/-921/-922, -939, -630, -952, -336, -434) · — · incelemeli · ⏸ B1 (Hesap 1'de yürümeli)
23. S23 GA-3b RLS politikaları · — · incelemeli · GA-3a'dan sonra
24. S24 Kayıt işleri: General "hiçbiri" (G1) SABAH-SORULAR/KARARLAR'a; EKRAN-16'nın 15 seçimi OZET §9'a; EKRAN-08'in 2 sorusu SABAH-SORULAR'a; KK-210 "dilim dilim" düzeltmesi; BL-804 "Kapandı 8aa7b5ea" · belge · normal
25. S25 Temizlik: main'e girmiş yerel dallar/worktree'ler (`task/ekran-01-docs2`, `-docs3`, `task/ekran-02-data` + `ekran-02-pkg`, `task/ekran-03`, `task/bl-503`, `task/ekran-16`, `task/bl-804`, `task/ekran-10*`, `task/bildirim`, `task/acil-40001-v2`, `task/bl-965`), rafa kalkan `task/tren-araci*`, `task/bl-987` (N9'dan sonra) · `git cherry` boş olmalı · normal

## Trene hazır
- `task/guvenlik-a-ga2`@`302af460` (ONAY; S0'dan sonra)
- `task/bl-974`@`3607ae0b` (hazır, R1, diff okundu; KK-233)

## Tren
- son 20261009T0202Z · dallar task/workflow-v2 · CI 37872634738 e2e kırmızı (Time off onayı, BL-990), tek seferlik aşım (Mert) · başladı 2026-10-08 19:02 · ~30 dk

## Senin yerine verdiğim kararlar
- —

## Plan
- Şimdi (Mert onayı 2026-10-09): BL-990 — kök kanıtıyla yazılı · önce kırmızı test → düzeltme → yeşil · time-off-approval, shift-hub-swap, shift-hub-time-off, schedule-publish-approved-exchange ardışık iki koşuda yeşil · shift-hub-time-off ≤15 sn · karantina satırı silinir · trenin CI'ı tam yeşil. Tahmin 2–4 saat. CI Playwright raporları Mert'in izniyle indirildi: `C:\Users\TheWe\Documents\Codex\newfork-wt\coord\artifacts\bl-990\ci\` (5 rapor, ~215 MB açılmış).
- Sonra "Sırada" listesi S1'den.
- EKRAN-PLANI sırası: 1 Schedule → 2 Requests → 3 Employees → 4 Availability → 5 Workspace → 6 Documents → 7 Announcements → 8 Important Dates → 9 Bildirim → 10 Settings → 11–14 çalışan ekranları → 15 Account → 16 Giriş → 17 Yasal → 18 Billing; açık hatlar 01, 02, 03, 08, 09, 10, 16 ve GUVENLIK-A.

## Sağlık
- işçi sınırı 1 · main alarmı temiz (since `7ecbcc74`) · kilit: db boş
- karantina: two locations approve in turn, the last one opens the shift · BL-990 · 2026-10-08→2026-10-15
- kullanım: 5 saatlik %2, haftalık %64 (2026-10-11'de sıfırlanır) · yedek saat `15baa153` (20 dk'da bir, 2026-10-15'te biter) · ölçüm günü 2026-10-15

## Devirden gelen notlar
- N1 Devir notları ve README: `task/devir-2026-10-08` dalı, `docs/plan/devir-2026-10-08/`; bu kayıtlar artık main'de (`docs/plan/`, `docs/archive/2026-10-08-v1/`).
- N2 Geçici klasör yedeği (11 oturum, 172 MB): `C:\Users\TheWe\Documents\Codex\newfork-wt\devir-yedek-2026-10-08\` (`OKU-BENI.md`, `scratchpad\<oturum>\`).
- N3 EKRAN-08 ekran görüntüleri (54): `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\EKRAN-08-CEKMECE\`.
- N4 Requests 111800 canlı yedeği (13 dosya): `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\ekran-02\`; 111800 uygulanana kadar saklanır.
- N5 BL-965 canlı öncesi yedeği: `devir-yedek-2026-10-08\bl-965-artifacts\`.
- N9 PARALEL-1 §4: `task/bl-987` (yalnız yerel @`77b8120b`) silinmeden önce iki parça yeni dala: UZUN satırı (`lock.mjs` `longLockLines()`, satır 18–20 ve 148–153 + testleri) ve kilit tutulurken de NF_OVERRIDE yedeği. Workflow v2'de varsa gerek yok; önce ölç.
- N6 BILDIRIM §8: K1 (belge kısıtlaması) ve K2 (takas süresi dolumu) yalnız bildirim işçisinden çalışıyor (`notification-outbox-worker.ts`); işçi silinmeden önce yeni bakım zamanlayıcısına taşınmalı, yoksa sessiz kırılır. KK-210 "tek seferde" ile plan "dilim dilim" çelişkisi.
- N7 EKRAN-10 General §9: tasarım kaynakları (`general-variants.src.html`, betikler) yalnız geçici klasördeydi → N2'de; saklanacaksa `newfork-pages`'e alınır.
- N8 Mert'in 3 oturumu (Test kuralları, Dev sunucusu, Devir testi): yönetilmez, iş kalemi yok (`KOORDINATOR.md` §6).
