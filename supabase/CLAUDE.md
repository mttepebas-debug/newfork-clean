# supabase/ — yerel bilgi (kök CLAUDE.md §3.A ve §7'ye ek)

## Yerel veritabanı
- Yerel DB tek ve ortaktır. Migration denemesi tek transaction + rollback: `begin;` (noktalı virgülle) ve `ON_ERROR_STOP=1`; yoksa autocommit ortak DB'ye sızar. Bir dalın migration'ı ortak DB'ye kalıcı olarak yalnız trende, koordinatör tarafından (inceleme onayından sonra) uygulanır (`CLAUDE.md` §5 "Bir işin yolu", tren). Uygulanmış migration değiştirilmez; düzeltme yeni migration'la.
- Bugünkü şema `supabase/schema.sql`'dedir (migration'ların boş veritabanında kurduğu `public` + `app_private`; yalnız okunur, hiçbir yere uygulanmaz). Bir fonksiyonun, politikanın ya da tablonun son hâli migration'larda değil orada aranır. Migration ekleyen oturum `pnpm.cmd db:schema` koşar (~1 dk, ayrı geçici veritabanı) ve dosyayı migration'la aynı commit'e koyar; rebase'de çakışırsa elle çözmez, yeniden üretir. `pnpm.cmd lint` ve CI `db` işi bayat dosyayı yakalar, şimdilik uyarıyla (Mert, 2026-10-07; SCHEMA-SNAP).
- Ortak DB `seed.sql` değişikliklerini görmez; seed'e dayanan kırılma yalnız CI'da çıkar. Yerel hesap `owner@newfork.test`, parola `supabase/seed.sql`'de.

## Yetki çekirdeği
- `app_private.actor()` her çağrıda ~7 sorgu, önbellek yok. `scope_set` bir kez okunur: değişkene ya da `any ((select app_private.scope_set(...))::uuid[])` (cast şart).
- "Bir yerde" şekli tam olarak `app_private.authorize(a, w, 'act', target_locations => app_private.scope_set(a, w, 'act'))`; `schedule_asks_the_core.test.sql` bu biçimi ayrıştırır.
- `authz_check`'te `own` dalı `owner_only`'den önce döner: "yalnız owner, kendi kaydı" `org` + `owner_only` action'dır.
- Kapı public `*_service`'e konur, başka akışın çağırdığı iç işe (`app_private.initialize_employee_onboarding`) değil. Kurulumu bitmemiş workspace yalnız owner'a açık (`authz.workspace_closed`).
- Matris personası "her izin eksi `permissions_removed`"; core gerçek rol izinlerini okur. Manager rolünde olmayan izne bağlı action, manager personalarının `permissions_removed`'ına girer. Bölüm 2–5 değişince `node scripts/lock.mjs run db -- pnpm.cmd --filter @newfork/shared dump:authz-matrix` (uygulanmamış migration için tek PowerShell satırı: `$env:AUTHZ_MATRIX_PRELUDE='<yol>'; node scripts/lock.mjs run db -- pnpm.cmd --filter @newfork/shared dump:authz-matrix`) ve `targetedAuthzActions` güncellenir.

## Migration
- Ad `YYYYMMDDHHMMSS_<ad>.sql`.
- Overload katlarken önce fazlalar drop, sonra kalan `DEFAULT`'larla `create or replace`. Silinen imza `retired_objects_stay_gone`'a `function_signature`, silinen ad `function` olarak girer.
- Bir alanın kuralı değişince onu döndüren her fonksiyon `schema.sql`'de aranır.
- `newfork.*_scope` GUC'u havuzlu bağlantıda `''` döner: `nullif(current_setting(x, true), '')::jsonb` ile bir kez oku.
- `jobs` UPDATE'inden sonra aynı migration'da `ALTER TABLE jobs` "pending trigger events" verir; arada `set constraints public.document_assignment_changed immediate`.
- Yeni soft yayın bulgusu `schedule_publication_overrides`'a yazılır; CHECK'i yalnız üç kod alır: ya `overrideable=false` + `tier='note'` ya CHECK genişler.
- `language sql` fonksiyonda argümanla aynı adlı sütun varsa sütun kazanır, koşul sessizce bütün satırlara eşleşir (BL-234: yayın önizlemesi 500): argümanı `fn.arg` diye nitele ya da çakışmayan ad ver (`target_…`); `pg_temp` yardımcıları da.
- JSON'a giden `time` değeri `to_char(x, 'HH24:MI')` ile: `jsonb_build_object` `09:00:00` yazar, shared `timeOfDaySchema` yalnız HH:MM alır, API 500 döner.

## Tek yerde duran kurallar
- Müsaitlik asla engellemez. `approved_time_off` ayarı yalnız `assess_weekly_shift_availability`'de okunur; atama yazan her yol oradan geçer.
- Yayınlanmış kabulü koruma, `schedule_availability_prior_publication`'ı çağıran dört fonksiyonda; değişiklik dördüne birden.
- "Yayın onaylı takası geri almaz" tek kural: `shift_exchange_draft_undoes`.
- Aynı kişide çakışan vardiya (`time_overlap`) hep engel; ayarı ve onayı yok. Çekirdek bir vardiyayı ötekilerin bugünkü saatiyle kıyaslar: birden çok vardiyanın saatini değiştiren yol yeni-yeni çakışmaya kendisi bakar (`preview_schedule_default_hours_service` eş döngüsü, "Overlaps …").
- İzin talebinin durumu tek değerlendirme: `app_private.time_off_state`; oy, okuma (`time_off_progress`) ve süpürme onu okur.
- Belge muafiyeti yalnız `app_private.set_document_exemption`'dan verilir ya da geri alınır (inceleme servisi, sahiplik devri, yeniden yayın).
- Var olan rollere izin ekleyen backfill: önce şart koşulan izni `exists` ile kontrol et; `insert … returning` ile yalnız gerçekten satır alan rolün `updated_at`'ini ilerlet (BL-560).
- Arşiv kontrolü: `jobs`'ta `jobs_deleted_remain_archived` kısıtı var, `archived_at is null` tek başına yeter; `shift_labels`'ta bu kısıt yok, iki kolon da kontrol edilir (LINEUP-EDIT L2a, nf-guvenlik).

## Test (pgTAP) ve test dünyası
- `pnpm.cmd test:db` (`scripts/test-db.mjs`) ortak DB'ye kalıcı olarak yalnız `origin/main`'deki `builder.sql`'i yükler (tek işlem); çalışma klasörünün `builder.sql`'i her test dosyasının kendi işleminde yüklenir ve rollback'le gider (geçici kopyalar `supabase/tests/.builder-run/`, izlenen dosyalar değişmez). Ortak DB'ye dokunduğu için kilitle: `node scripts/lock.mjs run db -- pnpm.cmd test:db`; dosya argümanı: `node scripts/lock.mjs run db -- pnpm.cmd test:db supabase/tests/x.test.sql`. Yalnız main'in builder'ını yüklemek: `node scripts/lock.mjs run db -- node scripts/test-db.mjs --load-only`. Her test dosyasının ilk deyimi kendi satırında `begin;` olmalı (`begin transaction;` ve satır sonu `--` yorumu olur), yoksa koşu başlamaz. Rollback'li denemede değişen builder migration'dan sonra aynı transaction'a girer.
- Deneme dosya başına bir oturum: `node scripts/lock.mjs run db -- "docker exec -i supabase_db_newfork-clean psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < <dosya>"` (tırnak isteyen komut tek argüman), migration dosyanın kendi ilk `begin;` satırının arkasına. Dışa ikinci `begin` konursa dosyanın `rollback;`'i onu kapatır, gerisi commit olur.
- Sayım: `^not ok` (TODO hariç), `ERROR:`, `Looks like you planned`; boş çıktı da "0 not ok" sayılır, `1..N` aranır. Kırmızı migration'sız da koşulur: aynı sayı senin değil.
- Actor parametresi auth user id'dir (`tests.user('w:ali')`), `tests.id` değil. `tests.id()` olmayan etikette raise eder; `tests.ids` tablosu null döner. `authenticated`'in `tests` şemasında USAGE'ı yok: id'leri önce temp tabloya al.
- `tests.publish_week` taslağı açık bırakır. `tests.week(n)` ~700 gün ileride; bugüne bağlı kuralda `current_date + n`.
- Transaction'da `now()` sabit: "sonra" gerekiyorsa zamanı elle geçmişe çek (`ponytail:` yorumu).
- Superuser `count(*)` kendi fixture id'siyle daraltılır; fixture `limit 1` ile değil adla seçilir.
- "X yok" hücresi önce başarılı cevabı ve öğenin varlığını kanıtlar; servis rollback'li transaction'da bozularak sınanır.
- Yayınlanmamış belge tipine bağlanan `employee_onboarding_requirements` satırı sessizce düşer: fixture tanımı önce yayınlar.
- `schedule_grid_read_budget` yükte 50–60 ms'e sıçrar: ölçümü sırayla tekrarla.
- `tests.person` her çalışana bir `employee_onboarding_cases` satırı açar (`employee_id` unique): ikinci insert yerine var olanı güncelle ya da ayrı kişi kur.
- K4: Remote olmayan her müdür bir lokasyonda kalır (`app_private.keep_manager_at_a_location`, 22023 `employee.manager_location_required`): tek lokasyonlu müdürü lokasyonundan çıkaran test bunu alır, iki lokasyonlu kişi kullan. Lokasyonsuz `tests.person` Remote kurar, muaftır.
- `set local role` sonrası çağrılan `pg_temp` yardımcısı `grant execute on function pg_temp.f(...) to service_role` (ya da `public`) ister.

## Canlı
- MCP `apply_migration` sürüme sunucu damgasını yazar (uygulama anı). Ekleyen migration'ın dosyası bu damgayla yeniden adlandırılır (`20261008052513_<ad>.sql`), canlı ledger'a dokunulmaz; main'deki sıra canlıya uygulanma sırasıdır (Mert, 2026-10-08; KARARLAR OPS-05 eki). Silen migration main'e kendi adıyla girer; canlıya uygulanınca ledger satırı dosya adına eşlenir: `update supabase_migrations.schema_migrations set version = '<repo>' where name = '<ad>' and version = '<damga>'` (önce satırın yedeği). Kanıt: `md5(statements[1])` = dosya md5'i.
