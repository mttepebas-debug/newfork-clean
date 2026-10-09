<!-- from: oturum/ekran-01 | task: DEVIR-EKRAN-01 | at: 2026-10-08T22:31:43.167Z -->
# DEVIR — EKRAN-01 (Own the Schedule screen to the finish (EKRAN-01))

Yazıldı: 2026-10-08 ~22:35Z. Ölçüm tabanı: `origin/main` = `9f287986`. Bu not yalnız okumayla yazıldı. Kod, test, push ya da canlı değişiklik yapılmadı. Canlıda yalnız `list_migrations` okundu.

## 1. Kimlik

- **Oturum:** "Own the Schedule screen to the finish (EKRAN-01)", `local_6979dfbe-b7bb-40ff-abcd-a399ce386311`. Koordinatörün başlattığı oturum (parent `local_70128f8f-…`). Model opus-5-5, effort xhigh.
- **Oturumun kendi worktree'si:** `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\suspicious-mirzakhani-3d79e2`. Dal `claude/magical-easley-1ef2ed`, temiz. İş yok; yalnız bu not ve `.claude\launch.json` içindeki `bl974-*` önizleme girişleri var.
- **İş dalları:** hepsi `C:\Users\TheWe\Documents\Codex\newfork-wt\` altında. Hepsi temiz; commit'lenmemiş değişiklik yok.

| Dal | Worktree (tam yol) | Son sha | Uzakta (origin) | Main'de mi (`git cherry -v origin/main`) | Taban / main'in gerisinde |
|---|---|---|---|---|---|
| `task/bl-974` | `C:\Users\TheWe\Documents\Codex\newfork-wt\bl-974` | `3607ae0b` | var, `3607ae0b` | hayır (1 commit `+`) | `9f287986` / 0 |
| `task/ekran-01-undo` (#12) | `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-01-undo` | `53cb9276` | yok | hayır (2 `+`) | `10f1b91f` / 30 |
| `task/ekran-01-38` (#38) | `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-01-38` | `92072dab` | yok | hayır (3 `+`) | `9f287986` / 0 |
| `task/ekran-01-templates` (#28 #29) | `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-01-templates` | `94fdfc57` | yok | hayır (2 `+`) | `10f1b91f` / 30 |
| `task/ekran-01-docs3` (durum raporu) | `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-01-docs3` | `7c646673` | yok | hayır (1 `+`) | `9f287986` / 0 |
| `task/ekran-01-docs2` (EKRAN.md güncellemesi) | `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-01-docs2` | `287a4e6b` | yok | **evet** (1 `-`, tren-2) | — |
| `task/ekran-01-db4` (DB-4, eski) | `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\gallant-feistel-508e83` | `f5282ef2` | yok | kısmen: 10 `-`, 7 `+` (aşağıda) | `a40f329b` / 302 |

## 2. Hedef

- **Ekran:** EKRAN-01 Schedule. Ekranın tek sahibi bu oturum.
- **Kapsam:** kabul listesinin tamamı. 100 madde var: 29'u ✅, 71'i ⏳ (main'deki EKRAN.md, `9f287986`).
- **Dayanak dosyaları:**
  - `C:\Users\TheWe\Documents\Codex\newfork-clean\docs\plan\ekranlar\01-schedule\EKRAN.md` (iş yalnız bu listeden izlenir).
  - `C:\Users\TheWe\Documents\Codex\newfork-clean\docs\plan\ekranlar\01-schedule\OZET.md`.
  - `C:\Users\TheWe\Documents\Codex\newfork-clean\docs\plan\tasks\EKRAN-01-SCHEDULE.md`: dilimler; yalnız kayıt olarak duruyor.
  - KARARLAR "Schedule" bölümü.
- **Raporlar:** `C:\Users\TheWe\Documents\Codex\newfork-clean\docs\plan\ekranlar\01-schedule\uygulama\`. Bugünün raporu orada `PAKET1-DUZELTME.md`.
- **Bugün koordinatörden gelen işler:**
  - KK-224 (paket 1 inceleme düzeltmeleri): bitti.
  - BL-974 (gece önceliği).
  - #12 Undo kenarları (BL-762).
  - #38 izinli güne rızayla alınan vardiya (BL-579).
  - #28/#29 şablon penceresi (BL-038 K3/K4).
- **Kapsam dışı:** incelemeden backlog'a giden B4-web, B5, B6-şema, B16, B18–B21, B23 ve B24. Koordinatör BL numarası verene kadar başlanmaz.

## 3. Biten

- **Main'de ve canlıda: paket 1 + KK-224.**
  - Maddeler: #9, #11, #18, #20, #100, B1–B15, O1 ve D1.
  - Main `09fa5324`…`7336c08c` aralığında; tren-1 main `10f1b91f`.
  - Canlı ledger sürümleri: `20261008052513` shift_edit_keeps_break_and_hidden_time, `20261008052534` a_failed_send_hour_counts_once, `20261008052609` export_rule_is_changed_by_who_reaches_it, `20261008052645` schedule_conflicts_refuse_without_retry. Bu dördünü 22:3xZ'de `list_migrations` ile yeniden okudum; dördü de canlıda.
  - Main CI 37763019506 ikinci denemede yeşil.
  - Rapor `...\01-schedule\uygulama\PAKET1-DUZELTME.md`, main `68f50905`.
- **Main'de: EKRAN.md güncellemesi.** #9, #11, #18, #20 ve #100 ✅ olarak işaretli. Dal `task/ekran-01-docs2` @`287a4e6b` tren-2 ile girdi.
- **Dalda hazır: BL-974.** `task/bl-974` @`3607ae0b` uzakta. TREN-HAZIR yazıldı.
  - İş: "by role" sıralamasında Jobs süzgeci artık yalnız seçili işlerin gruplarını gösteriyor.
  - Kök neden: `scheduleFilterModel.ts` `jobs` listesini daraltmıyordu. Grup içi ad sırası `scheduleEmployeeSort.ts` içindeki ortak `byName` ile.
  - Tam kapı 12:56Z'de yeşil:
    - shared 230, ui 9, api 1034, web 2339 (+1 atlanan);
    - lint ve typecheck temiz;
    - build temiz.
  - CI 37780828448: e2e işi düştü. Düşen senaryolar Requests'in (time-off-approval, shift-hub-time-off; KK-231). BL-974'ün kodu değil.
  - Koordinatör sorudaki A seçeneğini seçti: seçilmeyen işteki vardiya gizli kalır. Bu soru KK olarak kayda geçti. BL-974 KK-231 düzeltmesinden sonraki trene girecek.
- **Dalda hazır, canlı ve test:db bekliyor: #12.** `task/ekran-01-undo` @`53cb9276`. nf-guvenlik ONAY @`baa144fb`; `53cb9276` yalnız incelemenin önerdiği testleri ekliyor.
- **Dalda hazır, canlı ve tam kapı bekliyor: #38.** `task/ekran-01-38` @`92072dab`. nf-guvenlik ONAY @`92072dab`. Lint ve typecheck yeşil (~14:20Z).
- **Dalda, CSS izni bekliyor: #28/#29.** `task/ekran-01-templates` @`94fdfc57`. Vitest 12/12 yeşil.

## 4. Açık kalan

### #12 Undo kenarları (BL-762), R3, canlı DDL

- **Ne:**
  - Undo adımlarına sıra numarası eklenir: sequence `app_private.schedule_edit_undo_step_no` ve sütun `step_no`.
  - Düzenleme başka lokasyona genişlerken (acquire) adım yazılmaz. Bunu işlem içi bayrak `app.schedule_edit_widening` sağlar.
  - Undo en son yazılan adımı geri alır (`order by step_no desc`).
- **Dosyalar:**
  - Göç: `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-01-undo\supabase\migrations\20261008120000_undo_keeps_its_order_and_full_depth.sql`.
  - Testler: `...\supabase\tests\schedule_edit_session_undo.test.sql` (§8b, §8c, §10) ve `closed_days_reach_the_shifts.test.sql` (BL-762 hücreleri).
- **Nerede kaldı:** odaklı pgTAP yeşil. Göç olmadan 4 hücre kırmızı. Tam `test:db` koşulmadı (ağır koşu sırası beklendi, sonra DUR geldi).
- **Sıradaki somut adımlar:**
  1. Main'in üstüne taşı: `git rebase origin/main`. Yalnız `supabase/schema.sql` başlığı çakışır. Ekteki `resolve-schema-header.mjs` ile çöz, sonda `pnpm.cmd db:schema` ile karşılaştır.
     - Kontrol ettim: main'e sonradan giren 6 göçün hiçbiri #12'nin dayandığı üç fonksiyona (acquire, undo, trigger) dokunmuyor.
  2. `db` ve `heavy` kilitlerini al, sonra ekteki `test-db-branch.mjs` ile tam `test:db` (betik repoda yok; bu belgenin Ek A'sından kopyalanır).
  3. Koordinatörden "gönder" iste.
  4. Canlı yedeği al: `pg_get_functiondef` md5 değerleri. Kapsam: trigger `app_private.record_schedule_edit_undo_step()`, `acquire_schedule_edit_session_service`, `undo_schedule_edit_session_step_service` ve `app_private.schedule_edit_undo_steps` sütunları.
  5. `apply_migration` ile uygula.
  6. Doğrula: md5, `get_advisors`, bağımsız SELECT (sütun var, NOT NULL, sequence var).
  7. Dosya adını canlı ledger sürümüne çevir, `db:schema` koş, commit et.
  8. TREN-HAZIR yaz.
- **Koşacak e2e:** schedule-undo, schedule-locks, schedule-own-unsaved-edits, schedule-multi-location.
- **Tahmini süre:** ~1–1,5 saat (test:db ~20 dk dahil).

### #38 İzinli güne rızayla alınan vardiya (BL-579), R2 + canlı DDL

- **Ne:**
  - `schedule_week_availability` her gün için `leave_given_for_shift` bilgisini döner. Kaynak: onaylı `time_off_cancellation` ve olay metadata'sında `source.source = 'shift_exchange'`.
  - Web, vardiyanın bulunduğu hücrede kırmızı izin işaretini çizmez.
  - `schedule_time_off_events(request_id)` üzerinde yeni bir index var.
- **Dosyalar:**
  - Göç: `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-01-38\supabase\migrations\20261009050000_a_day_off_given_up_for_a_shift_reads_as_work.sql` (2026-10-09: `task/ekran-01-38@2f107766`'te 20261008130000'dan yeniden adlandırıldı).
  - Web: `apps\web\src\schedule\lib\scheduleAvailabilityMark.ts`, `apps\web\src\schedule\hooks\useCellState.ts`, `apps\web\src\schedule\components\PublishPreflightPanel.tsx`.
  - Shared tip: `packages\shared\src\index.ts`.
  - Testler: `supabase\tests\time_off_shortens_for_a_shift.test.sql` (plan 36), `scheduleAvailabilityMark.test.ts`, `useCellState.test.ts`.
- **Nerede kaldı:** lint ve typecheck yeşil. Kökten `test` ve `build`, tam `test:db` ve önce/sonra 1440 ekran görüntüsü yapılmadı.
- **Sıradaki somut adımlar:**
  1. `heavy` kilidiyle `pnpm.cmd test` ve `pnpm.cmd build`.
  2. `db` + `heavy` ile tam `test:db` (`test-db-branch.mjs`).
  3. Ekran görüntüsü için fixture kur:
     - Ali'nin onaylı izni olsun; onaylı takas ya da pickup ile o güne vardiya alsın. Takas onayında `shorten_time_off` kaynağı `shift_exchange` olan cancellation yazar.
     - Kurulum adımları `time_off_shortens_for_a_shift.test.sql` içinde.
     - Önce/sonra 1440 görüntüleri `artifacts\EKRAN-01\` altına.
  4. "Gönder" iste, canlı yedeği al. Kapsam: `app_private.schedule_week_availability(uuid,date,uuid[],uuid[],boolean)` md5 değeri ve index yok kontrolü.
  5. `apply_migration`, sonra doğrulama.
  6. Yeniden adlandır, `db:schema` koş.
  7. TREN-HAZIR yaz.
- **Koşacak e2e:** schedule-availability-warning, shift-hub-swap, shift-hub-time-off, schedule-publish.
- **Tahmini süre:** ~2 saat; fixture ve görüntü en uzun kısım.

### #28/#29 Şablon penceresi (BL-038 K3, K4), R1

- **Ne:** "Remove employee names (save as open shifts)" varsayılan olarak kapalı. Departman süzgeci `<details><summary>Only some departments</summary>` altında katlı duruyor; uyarı satırı dışarıda kalıyor.
- **Dosyalar:** `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-01-templates\apps\web\src\schedule\components\ScheduleTemplateDialogs.tsx` ve `.test.tsx`.
- **Nerede kaldı:**
  - Bileşen ve testler hazır.
  - Katlı listenin düzgün görünmesi için `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-01-templates\apps\web\src\styles.css` içinde ~9870. satırdaki `.schedule-template-departments` kurallarının (3 kural) özet + katlı liste düzenine çevrilmesi gerekiyor.
  - `styles.css` ortak dosya. Koordinatöre izin soruldu, cevap gelmedi.
- **Sıradaki somut adımlar:**
  1. İzin gelince CSS'i yaz.
  2. Önce/sonra 1440 görüntüsü al.
  3. `git rebase origin/main`: dal 30 commit geride.
  4. Tam kapı, sonra TREN-HAZIR.
- **Tahmini süre:** ~1 saat.

### DB-4 (eski dal; EKRAN.md #3–#7, #10 ölçüm testi), R3 + canlı DDL

- **Ne:**
  - #3 BL-174: yayınlanmış vardiya izni yeniden denetler.
  - #4 BL-371: "Published by" yayınlayanın adını gösterir.
  - #5 BL-510: geçilemeyen bulgu yayını durdurur.
  - #6 BL-326: kilit testi.
  - #7 BL-701: veritabanı yarısı.
  - #10 BL-191: ölçüm testi.
- **Göç:** `supabase/migrations/20261007180000_publish_rules_name_and_override.sql`. nf-guvenlik ONAY @`38641cdf`.
- **Main'de olmayan commit'ler:** `28f2e513`, `38641cdf`, `e4e3fe09` (rapor `uygulama\DB-4.md`), `f5282ef2`, ayrıca Requests'in 3 belge/hafıza commit'i (`2ee14550`, `e1061c7c`, `c0a5e701`).
- **Engel kalktı:** Requests'in veri paketi (a1a2 → a3 → a4) artık main'de ve canlıda (`20261008110559`…`111650`).
- **Sıradaki somut adımlar:**
  1. Güncel main'den yeni dal aç.
  2. Yalnız DB-4 commit'lerini (`28f2e513`, `38641cdf`, `e4e3fe09`, `f5282ef2`) cherry-pick et. Dalın içindeki 4 Requests göç kopyasını alma.
  3. `ci-green.txt` satırlarını kontrol et.
  4. Tam `test:db` koş.
  5. İnceleme yenilenir: taşıma çakışmalı olacak.
  6. "Gönder", sonra canlıya uygula.
- **Tahmini süre:** ~2–3 saat.

### BL-974

Bende iş kalmadı; koordinatörün trenini bekliyor.

### Durum raporu dalı

`task/ekran-01-docs3` @`7c646673` içindeki `uygulama\DURUM-2026-10-08.md` 12:45Z'de yazıldı ve artık bayat. Ya bu notla güncellenir ya da dal silinir. Önerim: bu not esas alınsın, dal silinsin.

### Listenin geri kalanı

71 açık madde var. Sıra önerim:

1. Yukarıdaki dört iş.
2. Veritabanına dokunmayan R1 maddeleri (#46–#57, #61–#80). `styles.css` gerektirenler önce koordinatöre sorulur.
3. Ölü kod silme işleri (#16, #17, #23, #92). Requests paketi girdiği için engelleri kalktı.
4. Görsel karar maddeleri (#86–#88): Mert'e 2–3 varyant.

## 5. Karar ya da izin bekleyen

| Kimden | Soru | Neyi durduruyor |
|---|---|---|
| Koordinatör | #28/#29 için `apps\web\src\styles.css` ~9870'e dokunma izni (`.schedule-template-departments`, 3 kural). Seçenekler: (A) izin ver, bu işte yazılsın. (B) Ortak CSS turuna kalsın; bileşen bugünkü stille kalır, katlı liste sade görünür. | #28/#29 bitişi |
| Koordinatör | #12 ve #38 canlı göçleri için "gönder" (iki ayrı canlı DDL) | İkisinin trene girmesi |
| Koordinatör | Ağır koşu sırası (13:15Z kuyruğu: GA-2 → TREN-ARACI → EKRAN-02-CI → EKRAN-01). 14:16Z'de "sıra bende mi" diye sordum, cevap gelmeden DUR geldi. | #12 ve #38 test:db |
| Koordinatör (EKRAN.md'de duran sorular) | #10 BL-191: şablon ya da Auto-fill dinlenme kuralına takılırsa vardiya çakışmadaki gibi açık vardiyaya mı dönsün? #13 BL-544: EKRAN-08'le sınırda; hangi ekran alır? #15 BL-702: şablon adı lokasyon başına mı benzersiz? | Bu üç madde |
| Mert | S24 (BL-759, taşınan vardiyanın eski yayını) ve S25 (BL-238, "bu hafta" hangi saatle hesaplanır; önce sohbet). Görsel kararlar: #86 dar pencerede üst çubuk, #87 tek lokasyonda Pazar sütunu, #88 iki Templates yüzeyinden hangisi kalır. | #1, #2, #86–#88 |

## 6. İnceleme bekleyen artifact ve dosyalar

- **BL-974 önce/sonra 1440:** `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\bl-974\before-by-role-jobs-cook-1440.png` ve `...\after-by-role-jobs-cook-1440.png`. Mert'e gönderildi; tren için kanıt.
- **Paket 2 önce/sonra görüntüleri** (#25, #26, #30, #35, #45): `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\EKRAN-01\*.png`. Main'de, kanıt olarak duruyor.
- **Paket 1 canlı yedekleri:** `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\EKRAN-01\before-live-kk224-20261008T0134Z.sql` (19 fonksiyon) ve `...\hosted-backup-2026-10-07-paket1-functions.sql`.
- **Gönderilmemiş durum raporu:** `task/ekran-01-docs3`, bayat (yukarıda).
- Bu işler için claude.ai Artifact sayfası ya da varyant sayfası yok.

## 7. Canlı ve yerel veritabanı durumu

- **Canlı (`hvyvyisrqyathtliyyyv`, 22:3xZ'de `list_migrations` okundu):**
  - Benim göçlerimin hepsi main'de de var (paket 1'in dördü).
  - Canlıya uygulanmış ama main'de olmayan benim göçüm yok.
  - #12 ve #38 canlıda değil.
- **Benim olmayan ama sıradakini etkileyebilecek iki şey:**
  - (1) `20261008133054` organization_settings_stay_with_owner_and_admin (GA-2) canlıda, ama main'de değil. Dalının CI'ı düşmüştü.
  - (2) Main'deki `20261008111800_retire_what_the_package_replaced.sql` (Requests'in silen göçü) canlı ledger'da yok.
  - #12 ve #38 canlıya uygulanınca ledger'da bu ikisinin arkasına düşer. Sıra sorunu yaratmaz ama bilinmeli.
- **Ortak yerel DB (`supabase_db_newfork-clean`):**
  - Göç kaydı main'le aynı; `111800` dahil `20261008…` göçleri uygulanmış.
  - #12 ve #38 kalıcı uygulanmadı (`step_no` sütunu yok). `test-db-branch.mjs` her testi geri alınan işlemde koşar.
  - Kalıcı bıraktığım tek şey BL-974 ekran görüntüsü için kurulan fixture dünyası `bl974a`: 1 workspace ve 5 kullanıcı (`bl974a.*@world.test`; owner, ali, deniz, can, ayse). Zararsız; istenirse silinebilir.
- **Silen göç bekleyen işim:** yok. Ölü fonksiyon ve uç silme maddeleri (#16, #17) listede açık.

## 8. Bilinmesi gereken (kayıtta olmayan)

1. **Canlı ledger sürümü dosya adı değildir.** `apply_migration` sürümü uygulama anına göre yazar. Örnek: paket 1 `20261008052513`… oldu. Uyguladıktan sonra dosya ledger sürümüyle yeniden adlandırılır, `pnpm.cmd db:schema` yeniden üretilir. Dosya adı ledger'la aynı olmadan TREN-HAZIR yazılmaz.
2. **md5 beklenen değeri önceden çıkarılır.** Göç yerel DB'de geri alınan bir işlemde uygulanır, değişen fonksiyonların `md5(pg_get_functiondef(...))` değeri okunur. Canlıdaki "sonra" değeri bununla karşılaştırılır. Paket 1'de 19/19 tuttu.
3. **Göçler yerinde düzenleme yapar.** `pg_get_functiondef` + çapa `replace()` + `execute`. Her çapa tam bir kez bulunmalı, yoksa göç kendini durdurur. Main ilerleyince çapanın hâlâ tek olduğu `test:db` ile görülür.
   - #12'nin çapaları: acquire içinde `if session_source = 'published' then\n    insert into public.schedule_edit_session_shifts` öncesi ve DB-1c silme bloğu. Acquire fonksiyonu adla bulunur (`pg_proc.proname`); tek overload olduğu varsayılır; undo içinde `order by step.step_at desc, step.step_xact desc`.
   - #38'in çapaları: `), clock_segments as (`, `'all_day', … @> ds.span) order by ds.work_date)` ve `left join leave lv on …`.
4. **`schema.sql` rebase çakışması yalnız başlıktadır** (`-- migrations: N, last: X` + fingerprint). Ekteki `resolve-schema-header.mjs <worktree>` ile her commit'te çöz, sonda `pnpm.cmd db:schema` çıktısıyla karşılaştır. Fonksiyon gövdesinde çakışma çıkarsa bu araç bilerek hata verir.
5. **`test-db-branch.mjs` (ekte):**
   - Dalın yeni göçlerini, commit'lenmemiş olanlar dahil, her testin builder include'unun başına koyar; test bitince geri alınır.
   - Kırmızı koşu için `SKIP_MIGRATION=<parça>` bir göçü dışarıda bırakır.
   - `MIGRATIONS_FROM=<ref>` göçleri o commit'ten okur.
   - Önce `db`, sonra `heavy` kilidi alınır; her kilit ayrı Bash çağrısında alınır, çünkü guard kilidi komut koşmadan önce denetler.
   - Benim hatam: ilk sürüm commit'lenmemiş göçleri almıyordu ve bir yeşil koşu boşa gitti; düzeltildi.
6. **#12 `app.schedule_edit_widening` işlem içi GUC'tur.** Acquire yayınlanmış vardiyaları oturuma eklemeden önce `on` yapar, sonda temizler; trigger `on` iken adım yazmaz. Acquire'a ileride başka bir ekleme yolu girerse o da adım yazmaz; bu bilerek böyle.
   - nf-guvenlik düşük bulgu: canlı DDL sırasında havada kalan bir istek NOT NULL'a takılabilir. Göç tek işlemde ve tablo kilidiyle gider. Sakin bir anda uygulanması yeter.
7. **#38'deki bilgi gün düzeyindedir**, hücre düzeyinde değil. Web yalnız vardiyanın durduğu hücrede işareti düşürür (`useCellState` içindeki `worked` kümesi `worksOn` olarak geçirilir).
   - `PublishPreflightPanel` `() => true` geçirir: yayın önizlemesinde o gün için işaret yok sayılır. İnceleme bunu onayladı.
   - Müdürün elle kısalttığı izin rıza sayılmaz, kırmızı kalır (test week 2).
   - `leave_intervals` uyarılar için değişmeden kalır.
8. **#38'deki index `CONCURRENTLY` değildir.** MCP göçü tek işlemde gönderir; `CONCURRENTLY` orada çalışmaz. Tablo küçük, kısa kilit sorun değil.
9. **DB-4 bütün fonksiyonu yeniden yazar** (`CREATE OR REPLACE`; 4 fonksiyon: `get_schedule_publication_status_service`, `weekly_publication_decisions`, `guard_schedule_assignment_availability`, `get_schedule_read_model_service`). Bu fonksiyonlar 2026-10-06 anındaki hâllerinin kopyası.
   - 22:3xZ'deki ölçüm: main'de o tarihten sonra bu dördünü yeniden tanımlayan göç yalnız `20261008110559_one_eligibility_engine` (guard). Guard gövdesi dalın kopyasıyla birebir aynı.
   - Dalın içindeki Requests göç kopyaları main'deki son hâllerinden farklı: 5, 5, 18 ve 0 satır. Bu kopyalar taşınmaz.
   - Taşımadan hemen önce bu karşılaştırma yeniden yapılmalı. Arada main'e bu fonksiyonlara dokunan bir göç girerse DB-4 onu geri alır.
10. **Canlı göç MCP ile tek sorgu olarak gider.** Supabase CLI ise göçü komut komut koşar: üst düzey `LOCK TABLE` hata verir, `SET LOCAL` yalnız uyarı verir. Kilit, kontrol ve DDL bir `do` bloğunda tutulur.
11. **Supabase MCP bağlantıları:** `plugin:supabase:supabase` 16:2xZ'de yetki istiyordu. Diğer Supabase MCP sunucusu (`49147edd…`) çalışıyor; `list_migrations` 22:3xZ'de cevap verdi. Canlı adımdan önce hangisinin çalıştığına bakın.
12. **e2e düşerse önce ayır.** BL-974 CI'ında düşen time-off-approval ve shift-hub-time-off Requests'in (KK-231). Schedule e2e paket 1'de 16/16 yeşildi. Yük altında ızgara bütçe testi bir kez 65 ms ölçtü; boşta yeniden koşunca geçti.
13. **Ekran görüntüsü yolu:**
    - Playwright npx önbelleğinden: `C:/Users/TheWe/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core`.
    - Parola grant ile token alınır, `/sign-in#access_token=…` hash'iyle giriş yapılır. Parola fixture dosyasından okunur (`e2e/global-setup.ts`); sohbete yazılmaz.
    - Oturum portları 5612/5613. Önizleme sunucusu tur bitince kapanabilir; "açık" demeden önce ölçün.
14. **Geçici dosyalar silinebilir.** Scratchpad (`C:\Users\TheWe\AppData\Local\Temp\claude\C--Users-TheWe-Documents-Codex-newfork-clean--claude-worktrees-suspicious-mirzakhani-3d79e2\4d7d379f-5759-46f8-954b-32f295abe5db\scratchpad\`) geçici. İki önemli araç bu notun ekinde. `bl974-shot.mjs` de orada duruyor; yeni fixture için örnek olarak kullanılabilir.

## 9. Temizlik

- **Silinebilir (birleşmesi doğrulandı):** `task/ekran-01-docs2` ve worktree'si `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-01-docs2` (`git cherry` `-`).
- **Önerimle silinebilir (bayat, birleşmemiş):** `task/ekran-01-docs3` ve worktree'si. Bu not onun yerini tutuyor. Silmeden önce yedek ref alınır.
- **Silinmez (birleşmemiş iş):**
  - `task/bl-974`, `task/ekran-01-undo`, `task/ekran-01-38`, `task/ekran-01-templates`.
  - `task/ekran-01-db4`: DB-4 commit'leri main'de değil. Worktree'si `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\gallant-feistel-508e83`; içinde commit'lenmemiş `.claude/agent-memory/nf-guvenlik/MEMORY.md` değişikliği var. Benim değil, kimin olduğunu bilmiyorum.
- **Yedek ref'ler:** yerel `backup/ekran-01-*` dalları (15 adet) ve `refs/nf-backup/branch/task/ekran-01-*`. Hepsi main'e girmiş eski hâllerin yedeği; koordinatör isterse temizler.
- **Açık süreç:** yok. Önizleme sunucuları (`bl974-*`) 12:43Z'de `preview_stop` ile kapandı. Arka plan görevi ya da kilit yok (`lock.mjs status`: üçü boş, 22:3xZ).
- **Oturum worktree'si** `suspicious-mirzakhani-3d79e2` boş; oturum kapanınca uygulama temizler.

## 10. Bağlam doluluğu ve öneri

- **Bağlam:** tahmini %20–25. Bu pencere bugün bir kez sıkıştırıldı; kesin ölçemiyorum.
- **Öneri:** devralan oturum önce #12'yi bitirsin (en küçük ve onaylı canlı DDL, sonra test:db), ardından #38'i aynı kilit penceresinde koşsun. DB-4'ü taşımadan önce 8/9. maddedeki fonksiyon karşılaştırmasını yeniden yapsın.

---

## Ek A — `test-db-branch.mjs` (scratchpad'den, birebir)

```js
// EKRAN-01: `pnpm test:db` for a branch whose migrations are not on main yet.
// node test-db-branch.mjs <worktree> [supabase/tests/<file>.test.sql ...]
// Same as scripts/test-db.mjs step 2-3 (the branch's builder inside each test's own
// transaction), plus the branch's new migrations at the top of that include, so they
// leave with each test's rollback: nothing of the branch stays in the shared DB
// (CLAUDE.md §6: a branch's change reaches it only in the main.lock window).
// Needs db.lock and heavy.lock. Step 1 (main's builder for good) is left out.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.argv[2]);
const files = process.argv.slice(3);
const { prepareRun, RUN_DIR } = await import(pathToFileURL(path.join(root, "scripts/test-db.mjs")).href);

const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean);
// Committed on the branch, plus new files not committed yet (MIGRATIONS_FROM reads committed ones only).
const added = [...new Set([
  ...git("diff", "--name-only", "--diff-filter=A", "origin/main...HEAD", "--", "supabase/migrations"),
  ...(process.env.MIGRATIONS_FROM ? [] : git("ls-files", "--others", "--exclude-standard", "--", "supabase/migrations")),
])].sort()
  // SKIP_MIGRATION=<substring>: leave one out, to watch its tests fail first.
  .filter((f) => !process.env.SKIP_MIGRATION || !f.includes(process.env.SKIP_MIGRATION));
console.error(`test-db-branch: ${added.length} migration(s) in each test's transaction:\n  ${added.join("\n  ")}`);

const include = path.join(root, RUN_DIR, "builder.psql");
let status = 1;
try {
  const targets = prepareRun(root, files);
  // MIGRATIONS_FROM=<git ref>: the migrations as that commit has them (a red run
  // against the code before the fix, with the working tree's tests).
  const read = (f) => process.env.MIGRATIONS_FROM
    ? execFileSync("git", ["-C", root, "show", `${process.env.MIGRATIONS_FROM}:${f}`], { encoding: "utf8" })
    : fs.readFileSync(path.join(root, f), "utf8");
  const migrations = added.map((f) => `-- ${f}\n${read(f)}\n`).join("\n");
  fs.writeFileSync(include, `set client_min_messages = warning;\n${migrations}\n${fs.readFileSync(include, "utf8")}`);
  const r = spawnSync(["supabase", "test", "db", ...targets.map((t) => `"${t}"`)].join(" "), { cwd: root, stdio: "inherit", shell: true });
  status = r.status ?? 1;
} finally {
  fs.rmSync(path.join(root, RUN_DIR), { recursive: true, force: true });
}
process.exitCode = status;
```

## Ek B — `resolve-schema-header.mjs` (scratchpad'den, birebir)

```js
// Resolves a schema.sql rebase conflict that sits only in the header
// (migrations count/last + fingerprint): both sides' function hunks merged.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2]);
const { fingerprint } = await import(pathToFileURL(path.join(root, "scripts/schema-snapshot.mjs")).href);
const file = path.join(root, "supabase/schema.sql");
let s = fs.readFileSync(file, "utf8");
const blocks = s.match(/^<<<<<<< [^\n]*\n[\s\S]*?^>>>>>>> [^\n]*\n/gm) ?? [];
if (blocks.length !== 1) throw new Error(`expected 1 conflict block, found ${blocks.length}`);
const inner = blocks[0].split("\n").filter((l) => !/^(<<<<<<<|=======|>>>>>>>)/.test(l) && l !== "");
if (!inner.every((l) => /^-- (migrations: |fingerprint: sha256:)/.test(l))) throw new Error("conflict is not header-only:\n" + inner.join("\n"));
const fp = fingerprint();
s = s.replace(blocks[0], () => `-- migrations: ${fp.count}, last: ${fp.last}\n-- fingerprint: sha256:${fp.hash}\n`);
fs.writeFileSync(file, s);
console.log(`resolved: ${fp.count} migrations, last ${fp.last}`);
```
