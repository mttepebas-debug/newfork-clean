# supabase/ — yerel bilgi (kök CLAUDE.md §2.A ve §6'ya ek)

## Yerel veritabanı
- Yerel DB tek ve ortaktır. Migration denemesi tek transaction + rollback: `begin;` (noktalı virgülle) ve `ON_ERROR_STOP=1`; yoksa autocommit ortak DB'ye sızar. Bir dalın migration'ı ortak DB'ye kalıcı olarak yalnız main'e alınmadan hemen önce, `main.lock` penceresinde ve inceleme onayından sonra uygulanır. Uygulanmış migration değiştirilmez; düzeltme yeni migration'la.
- Bugünkü şema `supabase/schema.sql`'dedir (migration'ların boş veritabanında kurduğu `public` + `app_private`; yalnız okunur, hiçbir yere uygulanmaz). Bir fonksiyonun, politikanın ya da tablonun son hâli migration'larda değil orada aranır. Migration ekleyen oturum `pnpm.cmd db:schema` koşar (~1 dk, ayrı geçici veritabanı) ve dosyayı migration'la aynı commit'e koyar; rebase'de çakışırsa elle çözmez, yeniden üretir. `pnpm.cmd lint` ve CI `db` işi bayat dosyayı yakalar, şimdilik uyarıyla (Mert, 2026-10-07; SCHEMA-SNAP).
- Ortak DB `seed.sql` değişikliklerini görmez; seed'e dayanan kırılma yalnız CI'da çıkar. Yerel hesap `owner@newfork.test`, parola `supabase/seed.sql`'de.

## Yetki çekirdeği
- `app_private.actor()` her çağrıda ~7 sorgu, önbellek yok. `scope_set` bir kez okunur: değişkene ya da `any ((select app_private.scope_set(...))::uuid[])` (cast şart).
- "Bir yerde" şekli tam olarak `app_private.authorize(a, w, 'act', target_locations => app_private.scope_set(a, w, 'act'))`; `schedule_asks_the_core.test.sql` bu biçimi ayrıştırır.
- `authz_check`'te `own` dalı `owner_only`'den önce döner: "yalnız owner, kendi kaydı" `org` + `owner_only` action'dır.
- Kapı public `*_service`'e konur, başka akışın çağırdığı iç işe (`app_private.initialize_employee_onboarding`) değil. Kurulumu bitmemiş workspace yalnız owner'a açık (`authz.workspace_closed`).
- Matris personası "her izin eksi `permissions_removed`"; core gerçek rol izinlerini okur. Manager rolünde olmayan izne bağlı action, manager personalarının `permissions_removed`'ına girer. Bölüm 2–5 değişince `pnpm.cmd --filter @newfork/shared dump:authz-matrix` (uygulanmamış migration: `AUTHZ_MATRIX_PRELUDE=<yol>`) ve `targetedAuthzActions` güncellenir.

## Migration
- Ad `YYYYMMDDHHMMSS_<ad>.sql`.
- Overload katlarken önce fazlalar drop, sonra kalan `DEFAULT`'larla `create or replace`. Silinen imza `retired_objects_stay_gone`'a `function_signature`, silinen ad `function` olarak girer.
- Bir alanın kuralı değişince onu döndüren her fonksiyon `schema.sql`'de aranır.
- `newfork.*_scope` GUC'u havuzlu bağlantıda `''` döner: `nullif(current_setting(x, true), '')::jsonb` ile bir kez oku.
- `jobs` UPDATE'inden sonra aynı migration'da `ALTER TABLE jobs` "pending trigger events" verir; arada `set constraints public.document_assignment_changed immediate`.
- Yeni bildirim tipi: `notification_catalog` + `notification_producer_registry` + yayınlanmış `notification_template_versions`; eksiği `reconcile_notification_platform_service()` gösterir.
- Yeni soft yayın bulgusu `schedule_publication_overrides`'a yazılır; CHECK'i yalnız üç kod alır: ya `overrideable=false` + `tier='note'` ya CHECK genişler.

## Tek yerde duran kurallar
- Müsaitlik asla engellemez. `approved_time_off` ayarı yalnız `assess_weekly_shift_availability`'de okunur; atama yazan her yol oradan geçer.
- Yayınlanmış kabulü koruma, `schedule_availability_prior_publication`'ı çağıran dört fonksiyonda; değişiklik dördüne birden.
- "Yayın onaylı takası geri almaz" tek kural: `shift_exchange_draft_undoes`.

## Test (pgTAP) ve test dünyası
- `pnpm.cmd test:db` önce `builder.sql`'i ortak DB'ye kalıcı yükler. Rollback'li denemede değişen builder migration'dan sonra aynı transaction'a girer.
- Deneme dosya başına bir oturum: `docker exec -i supabase_db_newfork-clean psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres`, migration dosyanın kendi ilk `begin;` satırının arkasına. Dışa ikinci `begin` konursa dosyanın `rollback;`'i onu kapatır, gerisi commit olur.
- Sayım: `^not ok` (TODO hariç), `ERROR:`, `Looks like you planned`; boş çıktı da "0 not ok" sayılır, `1..N` aranır. Kırmızı migration'sız da koşulur: aynı sayı senin değil.
- Actor parametresi auth user id'dir (`tests.user('w:ali')`), `tests.id` değil. `tests.id()` olmayan etikette raise eder; `tests.ids` tablosu null döner. `authenticated`'in `tests` şemasında USAGE'ı yok: id'leri önce temp tabloya al.
- `tests.publish_week` taslağı açık bırakır. `tests.week(n)` ~700 gün ileride; bugüne bağlı kuralda `current_date + n`.
- Transaction'da `now()` sabit: "sonra" gerekiyorsa zamanı elle geçmişe çek (`ponytail:` yorumu).
- Superuser `count(*)` kendi fixture id'siyle daraltılır; fixture `limit 1` ile değil adla seçilir.
- "X yok" hücresi önce başarılı cevabı ve öğenin varlığını kanıtlar; servis rollback'li transaction'da bozularak sınanır.
- Yayınlanmamış belge tipine bağlanan `employee_onboarding_requirements` satırı sessizce düşer: fixture tanımı önce yayınlar.
- `schedule_grid_read_budget` yükte 50–60 ms'e sıçrar: ölçümü sırayla tekrarla.

## Canlı
- MCP `apply_migration` sürüme sunucu damgasını yazar: `update supabase_migrations.schema_migrations set version = '<repo>' where name = '<ad>' and version = '<damga>'`. Kanıt: `md5(statements[1])` = dosya md5'i.
