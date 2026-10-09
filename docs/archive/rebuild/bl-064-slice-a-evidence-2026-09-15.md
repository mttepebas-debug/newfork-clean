# BL-064 — A–E patch, yerel kabul ve cleanup

Tarih: 2026-09-15. Muhatap: **Newfork Ana Session**. Kanonik urun sozlesmesi: [BL-064 plani](bl-064-schedule-conflict-plan-2026-09-15.md).

**Durum: A–E yerel implementasyon, kalan D/E browser kabulü ve yeniden olusturulan fixture temizligi tamamlandi.** Son web/API typecheck ve bagimsiz migration replay150/150 PASS kaniti korunuyor. Son browser'da bulunan dar metin uyumsuzlugu duzeltildi ve ilgili test1/1 PASS. Patch/checkpoint durumu WORK ve Git kaydindadir; ana session teslimat sahibidir. BL-068 tasimasi yerel kabulunu tamamladi; bu BL-064 kaniti hosted/release kabulunu kapsamaz. Bu belge onceki ara matrislerin yerine gecer; WORK yerine ikinci ilerleme kaydi degildir.

## Checkout ve kapsam

- Checkout `C:/Users/TheWe/Documents/Codex/newfork-clean`, branch `main`, HEAD `fc2c4da` rapor turunda dogrulandi. Patch uncommitted; stage/commit/push/merge/reset/revert/clean yapilmadi, branch/worktree acilmadi.
- Tema, Account Notifications, auth/bootstrap ve ortak proje belgelerindeki unrelated WIP korunuyor. WORK/REUSE/ROADMAP/BACKLOG/COORDINATION degistirilmedi.
- Mevcut web `5555` ve API `5556` yeniden kullanildi; yeni uygulama servisi baslatilmadi. Kendi replay container'i ayri, portsuz ve network-none idi.
- F Documents veri modeli/Account Documents BL-052/BL-001; gunluk/haftalik saat ve compliance BL-067 kapsam disinda. Minimum travel/rest B/C icindedir.
- Conflict handling'i ayri Settings sayfasina tasima BL-068'e birakildi; bu patch yeni route/relocation yapmadi.

## A–E mevcut kod ve kanit matrisi

| Dilim | Uygulanan davranis / kanonik kaynak | Yerel kanit ve sinir |
|---|---|---|
| A | `useScheduleDropReview` save-first; `createOptimisticPendingOp` + `useEffectiveShifts` ile anlik hedef. Yalniz kesin review marker'inda mevcut assessment/confirmation yolu. Badge 600ms Saving, 5s delayed; hata/Cancel/context degisiminde rollback/cleanup. | Drop hook31/31, ShiftCard11/11, API5/5. Gercek browser move/copy200, kontrollu403 rollback/tek toast, gercek409→assessment→Cancel/Place shift; DB audit dogrulandi. Kesin esikler fake-clock; browser frame/RTT percentile iddiasi yok. |
| B | `availability-assessment.ts` severity/rule sozlesmesi; mevcut `assess_weekly_shift_availability` evaluator'i highest-wins, explicit/type-default gercek overlap Block, unresolved Confirm, closure/travel/rest, own-shift exclusion ve draft/session baglamina genisletildi. Eksik hedef projection warning; QuickEditor taze canonical sonucu cached conflict'e tercih eder. Unassigned capacity yolu E senaryolariyla duzeltildi. | Conflict12/12, drop31/31, projection/controller9/9, QuickEditor32/32. SQL matrix1–18 ve E entegrasyonu; son dosyalar bagimsiz replay'de kabul edildi. Ayri conflict motoru kurulmaz. |
| C | `SchedulingSettingsPage` icinde `ConflictHandlingSettings`: bes kural, minimum travel/rest; `schedule.conflict_rules.manage`; ayri GET/PUT conflicts endpoint, revision/stale-save ve partial-save. Genel endpoint conflict alanlarini gizler/reddeder; legacy weekly form warning policy degistiremez. | APIsettings12/12, SettingsUI9/9, WeeklyUI4/4; SQL matrix19–30. Browser min-rest0→60, bagimsiz Save conflict rules ve success mesaji goruldu. Settings relocation BL-068'e devredilecek. |
| D | `useSingleShiftPointerDrag`: Ctrl/Meta/Shift anlik copy, son drop modifier'i, grid disina eski hedefi kaydetmeme. `ShiftDragPreview`: + Paste. `SchedulePage`: coklu-copy reddi, tek snapshot, kalici Paste Mode; yalniz Block yerel paste'i keser. Batch delete/undo mevcut akisinda. | Drag8/8, ShiftCard11/11, preview2/2. Browser tek copy, Ctrl+V off/on, tek hucreye paste ve modun acik kalmasi onceki gecerli fixture oturumunda PASS. Son tur Ctrl ile ilk + Shift ile ikinci secim → Delete2; Ctrl+C → Select one shift to copy PASS. Ctrl ve Shift birakma: pointer sabitken + Paste kaybolur, drop move yapar; preset hedef outline drop sonrasi temizlenir ve tek type-default shift kaydedilir. Browser/DB PASS. |
| E | Mevcut `weekly_schedule_publication_preflight`, `weekly_publication_decisions`, publish writer/guard ve dialog genisletildi. Taze hard block eski kabulden ustun; unassigned closure/unresolved ve scoped komsular degerlendirilir. Finding ID/fingerprint kabulü, otomatik actor audit, normal Next; recap reason/checkbox alanlari kaldirildi. | Panel/dialog/recovery42/42. Son SQL matrix31–38; acceptance57/57 ve integration55/55. Gercek closed-location recap, sifir reason alani/ek checkbox ve normal Next ile Notify adimina gecis browser PASS. Final publish davranisi SQL ile kanitli; browser'dan publication/notification gonderilmedi. |

### Migration dosyalari

1. [20260915075033_bl064_schedule_conflict_result.sql](../../supabase/migrations/20260915075033_bl064_schedule_conflict_result.sql): yalniz kesin business review SQLSTATE `PT409`.
2. [20260915081826_bl064_conflict_severity.sql](../../supabase/migrations/20260915081826_bl064_conflict_severity.sql): mevcut evaluator/command severity, fingerprint ve automatic acceptance. `context_draft_id` belirsizlik duzeltmesi ve unassigned capacity korumasi dahil.
3. [20260915083422_bl064_conflict_settings.sql](../../supabase/migrations/20260915083422_bl064_conflict_settings.sql): tek izin, revision, partial settings ve legacy/direct-update guard.
4. [20260915085446_bl064_conflict_publication.sql](../../supabase/migrations/20260915085446_bl064_conflict_publication.sql): canonical publish preflight/decision/final guard, selected publish scope ve unassigned accepted recap.

A browser'da PostgREST14.15'in business `40001` hatasini transaction retry olarak tekrar ettigi goruldu. [Resmi Supabase kaydi](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). API yalniz kesin mesaj icin legacy40001 ve PT409'u ayni review marker'ina cevirir. Genel serialization/stale kodlari degistirilmedi. Web/API patch'i birlikte kullanilmalidir.

E integration sirasinda default-hours preview fingerprint'inde `_exclude_shift_id`/session baglami korunarak self-conflict regresyonu giderildi. Publish kapsaminda disarida kalan current published kaydi korunur; yalniz moved-to location publish edilirse eski origin assignment ile overlap tespit edilir, iki location birlikte publish edilirse self-overlap uretilmez.

## Son dogrulama

### Risk odakli kontroller

- Yukaridaki hedefli testler ilgili implementasyon turlarinda PASS oldu; yalniz raporlama icin tekrarlanmadi.
- E son davranisi: publish panel6 + dialog29 + recovery7 = **42/42 PASS**.
- B/C/E son matrix: [bl064_conflict_severity.test.sql](../../supabase/tests/bl064_conflict_severity.test.sql) **38/38 PASS**.
- Son acceptance [weekly_schedule_acceptance.test.sql](../../supabase/tests/weekly_schedule_acceptance.test.sql) **57/57 PASS**; [weekly_schedule_integration.test.sql](../../supabase/tests/weekly_schedule_integration.test.sql) **55/55 PASS**.
- Son `pnpm.cmd --filter @newfork/api typecheck` ve `pnpm.cmd --filter @newfork/web typecheck`: **PASS**. Ardindan bir whitespace, son browser'da gorulen recap/refresh metinleri ve bu belge degisti; tip veya davranis sozlesmesi degismedigi icin typecheck mekanik olarak tekrarlanmadi. Metin duzeltmesinin mevcut `continues when previous warn conflicts disappear` testi1/1 PASS (diger28 atlandi); tum dialog/replay tekrar calistirilmadi.
- Repo'nun mevcut line-ending ayarlariyla scoped `git diff --check`: **PASS**; index bos, branch/HEAD `main`/`fc2c4da`.
- Preset hedef cercevesi dar fix'i task `01a0a44f-50c1-7721-a37f-3048c81a5d12` tarafindan ortak checkout'a eklendi ve korundu: `useShiftTypePresetPointerDrag` gercek drag kapanis/cancel/disable icin `onDragEnd`; controller `setDragOverCell(null)`. Task'in preset/controller/row23/23 raporu vardir. Son web typecheck bu entegrasyonu da kapsar. Son browser'da preset drag hedefinde data-drop-target=true, release sonrasinda false goruldu; DB'de bir type_default shift olustu.

### Bagimsiz replay: PASS, kapsam siniri

Ilk deneme ortak Supabase container'inda yalniz bu ise ait `bl064_replay_20260915` scratch DB ile yapildi; migration sirasinda `No space left on device` alindi ve **yalniz bu scratch DB silindi**. Ortak Docker image/container/volume/log temizligi yapilmadi.

Ardindan mevcut cached `public.ecr.aws/supabase/postgres:17.6.1.155` imaji ile `newfork-bl064-replay` olusturuldu: PostgreSQL17.6, `--network none`, portsuz, `--log-driver none`, `/tmp` icin768MB tmpfs, `--rm`. Supabase auth/storage/extensions schema-only bootstrap'i ve gerekli roller kullanildi. Uygulama semalarina bagimli eski bootstrap trigger/policy'leri ayiklandi; repository migration'lari bunlari tekrar kurdu. Bos `supabase_realtime` publication ve pgtap search_path baseline'i hazirlandi. Bootstrap rollerinde postgres superuser olarak korundu; bu setup birebir Supabase CLI reset degildir.

RAM container'in temiz `public`/`app_private` uygulama semalarinda **repository migration serisi en eskiden dort BL-064 migration'inin son dosya haline kadar tamamen replay edildi**. Ardindan matrix38 + acceptance57 + integration55 = **150/150 PASS**; testler ROLLBACK ile kapandi. Rapor turunda loglarda `not ok`, `ERROR:` veya `FATAL:` bulunmadigi ve TAP planlari yeniden okunarak kontrol edildi; SQL testleri tekrarlanmadı.

Yerel kanit dosyalari (repo disi, sir/token icermez):

- `C:/Users/TheWe/AppData/Local/Temp/newfork-bl064/replay-ram.log`
- `C:/Users/TheWe/AppData/Local/Temp/newfork-bl064/replay-bl064_conflict_severity.test.sql.log`
- `C:/Users/TheWe/AppData/Local/Temp/newfork-bl064/replay-weekly_schedule_acceptance.test.sql.log`
- `C:/Users/TheWe/AppData/Local/Temp/newfork-bl064/replay-weekly_schedule_integration.test.sql.log`
- `replay.log` ilk disk hatali denemenin kaydidir; PASS kaniti olarak kullanilmaz.

Bu kanit tam repository migration-file replay'idir; hosted uygulama, Supabase CLI reset, release veya tum roller/tenant kombinasyonlarinin kapsandigi iddiasi degildir.

## Son browser kabul ve kaynak temizligi

Ilk A fixture'i onceki turda temizlenmisti. B–E icin ayni UUID ile yeniden olusturulan fixture bu kapanista ayrica temizlendi; onceki A cleanup sonucu tekrar kullanilmadi.

### D/E son kabul

- Devam basinda Auth/Account Workspaces listesi normaldi; orijinal workspace Current ve Default gorundu. Mevcut fixture kullanildi; yeni workspace/draft/container acilmadi. BL-069'a kaydedilen expired same-holder resume davranisi nedeniyle yalniz disposable edit-session lease'i fixture hazirligi olarak yenilendi; urun kodu degismedi.
- Kesinti sirasinda belirsiz kalan paste DB'de yoktu: mevcut edit session'da yalniz Tuesday ve Wednesday explicit shift'leri vardi. Belirsizlik read-only sorguyla kapandi.
- Shift basili drag: + Paste screenshot'ta goruldu. Pointer sabitken Shift keyup sonrasi isaret kayboldu; modifier'siz drop Tuesday shift'ini Monday'e tasidi. DB'de Monday+Wednesday toplam iki kayit vardi, kopya uretilmedi.
- Ctrl basili drag: + Paste DOM'da gorundu. Pointer sabitken Control keyup sonrasi isaret sayisi0; modifier'siz drop shift'i Tuesday'e geri tasidi. Bu browser input kaniti focused hook keydown/keyup testlerini tamamlar.
- Preset: gecici Job/Position ve default-times gorunumunde preset Monday employee hucreye suruklendi. Drag sirasinda `data-drop-target=true`, drop sonrasi `false` goruldu; DB'de yalniz bir Monday `type_default` shift, Tuesday/Wednesday explicit shift'ler vardi. Onceki ayarlar **A-Z** ve **Use default times for scheduling=false** olarak geri getirildi ve UI'da dogrulandi.
- E: sadece fixture'a Tuesday closed-location kaydi eklendi; draft revision2 olarak kaydedildi. Publish preflight, Test Employee /2026-09-15 icin gercek closed-location confirmation mesaji gosterdi. Recap'te textbox0, acknowledgment checkbox0, Next enabled idi; normal Next Notify adimina gecti. Son Publish tiklanmadi, browser'dan bildirim gonderilmedi; final publish guard/audit kaniti SQL matrix31–38'de.
- Browser'da summary/footer'in closed-location'i `availability conflict` diye adlandirdigi goruldu. Yalniz `PublishScheduleDialog` recap/footer ve stale-refresh metinleri `schedule conflict` diline alindi; ilgili mevcut test beklentileri guncellendi. Son browser'da footer `1 schedule conflict` olarak dogrulandi. Yeni mekanizma veya route eklenmedi.
- Daha once kabul edilen tek snapshot copy/paste/persistent Paste Mode ve adimli Ctrl+Shift→Delete2 / Ctrl+C→Select one shift to copy kaniti gecerli; bu kapanis bunlari mekanik olarak tekrarlamadi.

### Ortam olayinin siniri

2026-09-15 09:31–09:32 UTC'de `supabase_db_newfork-clean` restart dongusunde `FATAL: could not write lock file "postmaster.pid": No space left on device` hatasi vermisti. Kullanici Docker'da yer acti ve ana session healthy durumundan sonra devam verdi. Bu task ortak DB/container/volume/image/log restart veya temizligi yapmadi. Yukaridaki kalan kabul ve cleanup DB dondukten sonra tamamlandi; eski ortam engeli artik fixture kapanisini engellemiyor. Bagimsiz BL-069 expired-session konusu bu patch'te fix/kabul edilmedi.

### Cleanup: PASS

- Workspace `b1064000-0000-4000-8000-000000000001`, tam ad **BL-064 disposable local verification**; draft `1c6147a3-8940-493f-b4bb-ad74f463a6f1`; edit session `b6d0b860-0d01-46fe-af2c-189eebf7cbe8` ve tum fixture child satirlari silindi.
- Cleanup oncesi mevcut workspace-scoped child kapsamı sayildi. Script'e bu turdaki `audit_events`, `owner_setup_checklist_progress`, `schedule_shift_batch_commands`, `schedule_closures` eklendi. Workspace-scoped olmayan FK child'lari kontrol edildi; ilgili parent'lar icin yalniz orijinal workspace'e isaret eden `user_workspace_preferences` vardi.
- `C:/Users/TheWe/AppData/Local/Temp/newfork-bl064/cleanup.sql` exact UUID+ad guard ile transaction icinde calisti: BEGIN→child cleanup→DELETE1→kalinti/orijinal-varligi assertion→COMMIT. Session-local replica yalniz immutable fixture history/last-owner temizligi icin kullanildi, origin'e donuldu; kalici trigger/izin degisikligi yok.
- Commit sonrasi read-only kontrol: **135 public workspace-scoped base table, toplam0 fixture satiri; fixture workspace0; orijinal workspace1; session_replication_role=origin**.
- Orijinal workspace **Line Up role verification e2afe393-c45d-4537-b984-114300cf568e** browser Account > Workspaces'te Open ile acildi ve Current oldugu goruldu. Kalici `user_workspace_preferences.active_workspace_id` ayni orijinal UUID; default tercihi degistirilmedi.
- Onceki turda `newfork-bl064-replay` stop/--rm ile kaldirilmis, docker ps filtresi bos dogrulanmisti; yeniden container acilmadi.
- Son gecici browser tab6 kapatildi; browser1 tab listesi bos. Virtual clipboard bos metin ve readText()=='' dogrulandi. Sistem clipboard'una islem yapilmadi.
- Host temp dizinindeki replay loglari ve fixture/cleanup SQL dosyalari kanit olarak korunuyor; calisan servis veya fixture kalintisi degiller.

## BL-068 ve yeniden kullanim devri

Yalniz ilgili mevcut kaynaklar tasinmali/genisletilmeli; ikinci ayar state'i veya endpoint kurulmamali:

- UI/state: [ConflictHandlingSettingsPage.tsx](../../apps/web/src/settings/ConflictHandlingSettingsPage.tsx) `ConflictHandlingSettingsPage`, `conflictRuleChoices`, `SettingsChoiceRow` (BL-068 sonrasi kanonik kaynak). Query key `schedule-conflict-settings` +workspace; dirty draft, revision/stale, reload/discard, success/validation akislarini koru. Save sonrasi schedule-reference ve weekly-preference-settings invalidation mevcut.
- Standart header: [GeneralSettingsPage.tsx](../../apps/web/src/settings/GeneralSettingsPage.tsx) `SettingsHeader`; haritanin ilgili Settings girdisi mevcut stil kaynagidir.
- Transport: [organization-data.ts](../../apps/web/src/settings/organization-data.ts) `organizationRequest`; `/scheduling-settings/conflicts` GET/PUT.
- Contract: [availability-assessment.ts](../../packages/shared/src/availability-assessment.ts) `scheduleConflictSettingsSchema`/rule types; [role-permissions.ts](../../packages/shared/src/role-permissions.ts) `schedule.conflict_rules.manage`.
- API/DB: [organization-settings-routes.ts](../../apps/api/src/settings/organization-settings-routes.ts), [organization-settings-service.ts](../../apps/api/src/settings/organization-settings-service.ts), migration `20260915083422_bl064_conflict_settings.sql`. Tek permission/revision ve genel endpoint redaction korunur.
- Regresyon kaniti: [ConflictHandlingSettingsPage.test.tsx](../../apps/web/src/settings/ConflictHandlingSettingsPage.test.tsx), [SchedulingSettingsPage.test.tsx](../../apps/web/src/settings/SchedulingSettingsPage.test.tsx), [organization-settings-routes.test.ts](../../apps/api/src/settings/organization-settings-routes.test.ts), SQL matrix19–30. BL-068 tasimasi yeni sayfa sinirini kanitladi; backend kaniti korunur.
- Schedule reuse: mevcut `assess_weekly_shift_availability` tek canonical evaluator; drop/preset/QuickEditor/publish adapter'lari; fast-save icin `useScheduleDropReview` ve optimistic pending-op seam'i. Ortak REUSE kaydini ana session yonetir.

## Teslimat siniri

A–E yerel patch, gerekli risk odakli kanit, kalan D/E browser kabulü ve fixture/resource cleanup tamamlandi. Ana session scoped checkpoint ve WORK kapanisini yonetir; BL-068 yerel kabulunu tamamladi. BL-069 ayri kalir. Checkpoint durumu WORK ve Git kaydindadir; push/hosted/release kabul kaniti yok.
