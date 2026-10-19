# Avatar ve iş ikonları (AVATAR-IKON) uygulama planı

> **Ajanlar için:** her dilim `superpowers:subagent-driven-development` (önerilen) ya da `superpowers:executing-plans` ile görev görev yürür. Adımlar `- [ ]` kutularıyla izlenir.

**Hedef:** İşlere arşivden birden çok Lineup ikonu seçilir. Kişinin her workspace'te tek bir avatarı olur (yüklenen fotoğraf ya da arşivden hazır çizim). Lineup her satırda yalnız çizim gösterir: kişinin hazır çizimi → işinin ikonlarından dengeli ve sabit dağıtılmış biri → çalışan ikonlarından biri. Müdür yalnız kişinin yüklediği fotoğrafı kaldırabilir.

**Mimari:** Arşivin kimlik listesi `packages/shared`'da, SVG'ler web'de ayrı bir parçada, anahtarlar veritabanında `app_private.lineup_art` tablosunda durur. Öneri kuralının sahibi veritabanıdır (`jobs` üstünde BEFORE INSERT tetiği). Web'in önizlemesi aynı kuralı paylaşılan listeden uygular; üretilen bir eşlik testi iki tarafı bağlar. Avatar üyelik başına `public.member_avatars`'ta tutulur. "Son avatar" hesapta kopya değil, kaynak üyeliğe işaret eder. Lineup çizimi okuma anında çözülür: kişinin hazır çizimi önce gelir, sonra `daily_lineup_drawings`'te yazılı dağıtım, yazılı değilse aynı tohumla hesaplanan dağıtım. Yazma her paylaşımda (share) eksik çiftler için yapılır.

**Yığın:** Postgres/Supabase (RLS, pgTAP, storage), Fastify 5 + zod 4, React 19 + TanStack Query 5, Vite 7, Playwright.

**Tasarım:** `docs/superpowers/specs/2026-10-19-avatar-ikon-design.md` (Mert onayladı, 2026-10-19 "kabul ediyorum implement et"). Görsel seçimler: https://claude.ai/artifact/3Uug2yR2ahdbSBUdiCqAyx (Tur 2). Kod `origin/main` fefc951c2'den, dal `task/avatar-ikon-yapim`.

## Genel kısıtlar
- CLAUDE.md §3.A bütünüyle geçerli:
  - Yeni tablo ve fonksiyon RLS ile, `app_private.authorize()` / `scope_set()` üzerinden çalışır.
  - "Hayır" 42501 + `authz.*` hint ile döner. API'de `authz.not_member` → 404, öteki `authz.*` → 403.
  - Satır içi kapsam mantığı, `request.jwt.claim`, `_vN` fonksiyon yazılmaz. Katalog sayaçları yalnız azalır (`authz_catalog.test.sql`: `request.jwt.claim` tavanı bugün 13, `auth.uid()` tavanı 11).
- Yeni her `*_service` `supabase/tests/authorization_coverage.test.sql` `service_class` listesine ve gerekiyorsa `authorization_matrix.test.sql`'e girer. Matrisin 2–5. bölümleri değişince `dump:authz-matrix` yeniden üretilir.
- Silinen her fonksiyon imzası `supabase/tests/retired_objects_stay_gone.test.sql`'e eklenir (`function_signature`, adım `AVATAR-IKON`).
- Migration ile `pnpm.cmd db:schema` aynı commit'tedir. Dosya adı `YYYYMMDDHHMMSS_<ad>.sql`, zaman yazıldığı an. Aynı migration'da `UPDATE jobs` ardından `ALTER TABLE jobs` gerekirse araya `set constraints public.document_assignment_changed immediate` (supabase/CLAUDE.md:20).
- Yeni her pgTAP dosyası `supabase/tests/ci-green.txt`'ye alfabetik sırayla eklenir; ilk deyimi kendi satırında `begin;`.
- Eski veri korunmaz. Silinen modeli kuran test ve fikstürler silinir ya da yeniden yazılır; geriye uyumluluk dalı yazılmaz.
- Arayüz metni İngilizce ve tasarım belgesindeki metinle birebir. "workspace" ve "team" denir. Yıkıcı eylem `ConfirmButton` / `useConfirmClick` ile iki tık kırmızı; tarayıcı diyaloğu yok; yalnız `--theme-*` renkleri; klavye ile seçim ve görünür odak.
- Arşiv SVG'leri ana pakete girmez: tek bir dinamik `import()` parçasıyla yüklenir.
- Lineup okuması ≤50 ms (`supabase/tests/lineup_foundation.test.sql:333-352`).
- Hiçbir Lineup cevabı (müdür, çalışan, okuyanlar listesi, paylaşım anlık görüntüsü) fotoğraf yolu ya da adresi taşımaz.
- Sınıf her dilimde **incelemeli**: `nf-guvenlik` `ONAY @<sha>`. Canlı adım riskli migration'dır: yedek, ONAY ve Mert'in ana oturumdaki "evet"i; ana oturum uygular. Eski servisleri silen ya da cevap şeklini değiştiren parça, push'tan hemen önce ayrı uygulanır (hafıza: "Shape-changing part right before push").
- Dal düzeni: Dilim 1 `task/avatar-ikon-yapim` üzerinde. Sonraki her dilim önceki dilimin ucundan (o dilim main'e indiyse güncel `origin/main`'den) `task/avatar-ikon-<n>` dalında. Bu oturum ek oturumdur: tren, kayıt dosyası ve canlı adım ana oturumdadır; her dilimin sonunda `dal@sha` ana oturuma verilir.
- Komutlar (Windows, `newfork-wt/avatar-ikon`):
  - DB testi: `node scripts/lock.mjs run db -- pnpm.cmd test:db supabase/tests/<dosya>.test.sql`
  - Migration denemesi: `node scripts/lock.mjs run db -- "docker exec -i supabase_db_newfork-clean psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < <dosya>"` (dosya `begin;` … `rollback;` sarılı kopya). Main'e inmemiş migration ortak DB'ye uygulanmaz.
  - Vitest: `pnpm.cmd --filter @newfork/<web|api|shared> exec vitest run <dosya>`
  - Lint/typecheck: `pnpm.cmd --filter @newfork/<paket> lint`, `… typecheck`
  - e2e (`e2e/` klasöründen): `node ../scripts/lock.mjs run db --e2e -- npx playwright test flows/<dosya>`
- Paylaşılan sözleşme değişen dilimde, push'tan önce shared + web + api vitest'i tam koşulur.

## İnceleme odağı (hiçbir görevin ana testinin doğrudan yakalamadığı, en çok can yakacak beş durum)
1. **Fotoğraflı kişi Lineup'ta.** Kişi fotoğraf yüklemiştir. Beklenen: müdür, çalışan, okuyanlar listesi ve paylaşım anlık görüntüsü JSON'unda `employee-profile-photos`, `photo` ya da bir depo yolu geçmez; satır iş ikonunu gösterir. Testi: Görev 4.1 (`no_photo_anywhere`).
2. **İşin adı sonradan değişir.** "Server" işi "Head Server" yapılır. Beklenen: ikon listesi değişmez; öneri yalnız ikon listesi verilmeden açılışta çalışır. Testi: Görev 2.1 (`rename_keeps_icons`).
3. **Aynı lineup'ta iki işi olan kişi.** Server 11–3, Bartender 5–10. Beklenen: her satır kendi işinin ikonunu gösterir; kişinin hazır çizimi varsa iki satırda da o. Testi: Görev 4.1 (`two_jobs_two_drawings`).
4. **Müdürün kaldırdığı fotoğraf "son avatar"dı.** Beklenen: kişinin bir sonraki onboarding'inde öneri gelmez. Testi: Görev 3.1 (`removed_photo_not_suggested`).
5. **Arşiv parçası henüz yüklenmedi ya da yüklenemedi.** Beklenen: dairede baş harf görünür, sayfa çökmez, parça gelince çizim yerine oturur. Testi: Görev 1.2 (`LineupArt shows initials until the chunk loads`).

---

## Dilim 1: Arşiv ve çalışan ikonları (dal `task/avatar-ikon-yapim`)
Ekranda değişiklik yok. Arşiv kodda ve veritabanında hazır olur.

### Görev 1.1: Çalışan ikonlarının çizimi (görsel onayı Mert verir)
**Dosyalar:**
- Değiştir: `PD\pages\gorsel-kararlar\gelen\job-ikonlari\kaynak\` (yeni `seri8.py`; `build.py` ile yeniden üretim; `status.json`).
- Değiştir: "Avatar ve İş İkonları" Artifact'ı (VARYANTLAR sayfasına "Çalışan ikonları" bölümü; ÖNCE/SONRA'da Lineup'ta yerleri). Kaynak `C:\Users\TheWe\Documents\Codex\newfork-pages\avatar-ikon\`.

**Üretir:** `kind: "team"` türünde 8 renkli çizim. Anahtarlar `174-team-<slug>-renkli` … `181-…`. Pakettekiyle aynı 48×48 renkli çizim dili; iş eşyası taşımayan, birbirinden saç, kıyafet ve duruşla ayrılan kişiler. Ten rengi konuşması sonraya kaldı (tasarım §2), bu yüzden mevcut paletle çizilir.

- [ ] **Adım 1:** `seri8.py`'yi `insan.py` / `kit.py` yardımcılarıyla yaz, `PYTHONUTF8=1 python build.py` ile üret, `status.json`'da 8 parçayı "keep" yap.
- [ ] **Adım 2:** Artifact'a ekle (Lineup görünümünde ikonsuz işteki kişiler bu çizimleri alır), logu ve README'yi güncelle, yayınla.
- [ ] **Adım 3:** Mert'e bağlantıyla tek satır haber ver. Onay beklenirken kod görevleri sürer; Dilim 1 trene **Mert onaylamadan binmez** (tasarım §9).

### Görev 1.2: Paylaşılan arşiv listesi, web çizim parçası ve `LineupArt`
**Dosyalar:**
- Oluştur: `scripts/lineup-art/gen.mjs` (üretici; girdi: paketin `svg/` ve `svg/insan/` klasörleri + `kaynak/` metası ya da avatar sayfasındaki `icons.js`).
- Oluştur (üretilir): `packages/shared/src/lineup-art.generated.ts`, `apps/web/src/lineup-art/art-svgs.generated.ts`, `supabase/tests/lineup_art_parity.test.sql`
- Oluştur: `packages/shared/src/lineup-art.ts`, `packages/shared/src/lineup-art.test.ts`
- Oluştur: `apps/web/src/lineup-art/LineupArt.tsx`, `apps/web/src/lineup-art/useLineupArt.ts`, `apps/web/src/lineup-art/LineupArt.test.tsx`, `apps/web/src/lineup-art/lineup-art.css`
- Değiştir: `packages/shared/src/index.ts` (barrel satırı `export * from "./lineup-art";`)

**Arayüz:**
- `type LineupArtKind = "person" | "object" | "team"`; `type LineupArtStyle = "line" | "color"`.
- `interface LineupArtItem { key: string; no: number; name: string; jobs: readonly string[]; kind: LineupArtKind; style: LineupArtStyle }`. `jobs` küçük harfli, virgülle bölünmüş, kırpılmış ("Server, waiter" → `["server","waiter"]`). İkonlar paketteki `kind` değerinden: `obj` → `object`, `person` → `person`; çalışan çizimleri `team`.
- `const lineupArt: readonly LineupArtItem[]` (`no` sırasıyla), `const lineupArtByKey: ReadonlyMap<string, LineupArtItem>`.
- `const lineupArtKeySchema` (zod, anahtar listesi enum'u).
- `function suggestLineupArt(jobName: string): string[]`. Kural (tasarımın 4.2'si, Claude'un kararı):
  - `n` = adın küçük harfli, kırpılmış, iç boşlukları teke inmiş hâli. Boşsa `[]`.
  - `team` türü hiç önerilmez.
  - Bir parça eşleşir: `jobs` içinde bir `t` için `t === n`, ya da `n` `t`'yi içerir, ya da `t` `n`'yi içerir ve `n.length >= 3`.
  - Sıra: önce `style === "color"`, sonra `no` artan. En çok 8.
- `apps/web/src/lineup-art/art-svgs.generated.ts`: `export const artSvgs: Record<string, string>`. Yalnız `useLineupArt` içinden `import("./art-svgs.generated")` ile yüklenir; başka hiçbir dosya statik import etmez.
- `function useLineupArtSvgs(): Record<string, string> | null` (yüklenene kadar `null`, modül düzeyinde tek söz).
- `<LineupArt artKey={string | null} name={string} size={number} className? />`: anahtar ve SVG varsa çizimi `aria-hidden` bir `span` içinde gösterir; yoksa `name`'in baş harflerini. Çizgi ikonları `currentColor` ile `--theme-text` rengini alır.

- [ ] **Adım 1: Kırmızı testleri yaz**
  - `lineup-art.test.ts`:
    - `lineupArt` uzunluğu 181 (173 + 8 çalışan); anahtarlar tekil; her `jobs` elemanı küçük harfli ve kırpılmış.
    - `suggestLineupArt("Line Cook")` boş değil, `"line cook"` ile aynı sonucu verir; en çok 8 eleman; renkliler çizgililerden önce.
    - `suggestLineupArt("")` ve `suggestLineupArt("Zz")` → `[]`.
    - Hiçbir öneri `team` türünde değil.
  - `LineupArt.test.tsx`:
    - `LineupArt shows initials until the chunk loads`: parça yüklenmeden "MA" ("Maria Alvarez") görünür; yüklenince `svg` görünür, baş harf kalkar.
    - `artKey={null}` → baş harf.
    - Bilinmeyen anahtar → baş harf, hata fırlatmaz.
- [ ] **Adım 2:** `pnpm.cmd --filter @newfork/shared exec vitest run src/lineup-art.test.ts` ve web testini koş; ikisi de kırmızı.
- [ ] **Adım 3:** `gen.mjs`'yi yaz ve koş. Üretici `--check` bayrağıyla, dosyaları yazmadan farkı söyleyip 1 ile çıkar. `lineup_art_parity.test.sql`, 30 iş adı için (`Server`, `Bartender`, `Line Cook`, `Host`, `Dishwasher`, `Barista`, `General Manager`, `Owner`, `Prep Cook`, `Busser`, `Food Runner`, `Sous Chef`, `Expo`, `Cashier`, `Delivery Driver` ve 15 tanesi paketin `jobs` sözcüklerinden) `is(app_private.suggest_lineup_art('<ad>'), '<TS sonucu>'::text[])` satırlarını yazar.
- [ ] **Adım 4:** `lineup-art.ts`, `useLineupArt.ts`, `LineupArt.tsx`, CSS'i yaz; testler yeşil.
- [ ] **Adım 5:** Eşitlik bekçisi: `lineup-art.test.ts`'e `generated files are current` testi ekle (`gen.mjs --check` çıkış 0). Web derlemesinde (`pnpm.cmd --filter @newfork/web build`) `art-svgs.generated` ayrı bir parça olarak çıkar; ana parçanın boyutu bugünküne göre 5 KB'tan fazla büyümez. Ölçümü commit mesajına yaz.
- [ ] **Adım 6: Commit** `feat(lineup-art): the product's drawing archive lives in shared, its drawings load as their own chunk (AVATAR-IKON)`

### Görev 1.3: Arşiv anahtarları veritabanında
**Dosyalar:**
- Oluştur: `supabase/migrations/<zaman>_lineup_art_archive.sql` (anahtar satırları `gen.mjs` çıktısıyla aynı; üretici bu migration'ın `insert` bloğunu da yazar ve `--check` onu da karşılaştırır)
- Oluştur: `supabase/tests/lineup_art_archive.test.sql`
- Değiştir: `supabase/schema.sql` (üretilir), `supabase/tests/ci-green.txt`

**Arayüz:**
- `app_private.lineup_art(key text primary key, no int not null unique, kind text not null check (kind in ('person','object','team')), style text not null check (style in ('line','color')), jobs text[] not null default '{}')`. `public`'te değil; RLS gerekmez, `authenticated` ve `anon`'a grant yok.
- `app_private.suggest_lineup_art(job_name text) returns text[]` (`immutable` değil `stable`; Görev 1.2'deki kuralın SQL hâli).
- `app_private.lineup_art_keys_valid(keys text[]) returns boolean`: hepsi tabloda, tekrar yok.

- [ ] **Adım 1: Kırmızı testleri yaz** (`lineup_art_archive.test.sql`):
  - Tablo 181 satır, 8'i `team`.
  - `lineup_art_keys_valid(array['001-server'])` doğru; `array['nope']` ve `array['001-server','001-server']` yanlış.
  - `authenticated` rolü `app_private.lineup_art`'ı okuyamaz (42501).
- [ ] **Adım 2:** İki pgTAP dosyasını koş (`lineup_art_archive`, `lineup_art_parity`); kırmızı.
- [ ] **Adım 3:** Migration'ı yaz, `begin…rollback` denemesiyle koş, `pnpm.cmd db:schema`.
- [ ] **Adım 4:** İki dosya yeşil; `ci-green.txt`'ye ekle.
- [ ] **Adım 5: Commit** `feat(db): the drawing archive's keys and the suggestion rule live in the database (AVATAR-IKON)`

**Dilim 1 kapanışı:** `nf-guvenlik` ONAY → Mert'in Görev 1.1 onayı → `dal@sha` ana oturuma.

---

## Dilim 2: İş ikonları (dal `task/avatar-ikon-2`)

### Görev 2.1: `jobs.lineup_icons`, öneri tetiği, iş servisleri `authorize()`'a
**Dosyalar:**
- Oluştur: `supabase/migrations/<zaman>_job_lineup_icons.sql`, `supabase/tests/job_lineup_icons.test.sql`
- Değiştir: `supabase/schema.sql` (üretilir), `supabase/tests/authz_catalog.test.sql` (tavan 13 → yeni sayı), `supabase/tests/ci-green.txt`, `supabase/test-support/builder.sql` (gerekirse)

**Arayüz:**
- `public.jobs.lineup_icons text[] NOT NULL` (varsayılan yok). BEFORE INSERT OR UPDATE OF lineup_icons tetiği `jobs_lineup_icons`:
  - INSERT'te `NEW.lineup_icons IS NULL` ise `app_private.suggest_lineup_art(NEW.name)`.
  - Sonra `lineup_art_keys_valid` yanlışsa 22023, hint `job.lineup_icons_invalid`. En çok 24 anahtar.
  - Böylece web'in PostgREST yolu (`organization-data.ts:407`), `seed.sql`, `ensure_management_and_owner` ve bütün servisler öneriyle doğar.
- Migration bugünkü her işe `lineup_icons = suggest_lineup_art(name)` yazar, sonra `NOT NULL`.
- `authenticated`'a `lineup_icons` için UPDATE grant **verilmez**: ikon listesi yalnız servisten değişir.
- Servisler:
  - `create_job_with_assignments_service`: `job_input.lineup_icons` varsa onu yazar, yoksa NULL bırakır (tetik önerir).
  - `update_job_details_and_assignments_service`: `desired`/`actual`/`expected_job` artık `{name, color, department_id, lineup_icons}`. `expected_job` uyuşmazsa bugünkü `PT409` / `job.changed`.
  - `read_settings_jobs_service`: her işte `lineup_icons`.
- Eski köprü: `create_department_jobs_service`, `create_department_with_jobs_service`, `create_job_with_assignments_service`, `update_department_with_jobs_service`, `update_job_details_and_assignments_service` içindeki `set_config('request.jwt.claim.sub'…)` + `workspace_has_permission` çifti `app_private.authorize(actor_user_id, target_workspace_id, '<eylem>')`'e döner. Eylem: iş yazanlarda `settings.jobs.write`. Yalnız atama değiştiren `update_job_details…` çağrısında bugünkü `employees.manage` kontrolünün `authz_actions`'taki karşılığı. Birebir karşılık yoksa işçi `SORU` ile durur, yeni eylem uydurmaz. `authz_catalog` tavanı yeni sayıya iner.

- [ ] **Adım 1: Kırmızı testleri yaz** (`job_lineup_icons.test.sql`):
  - `born_with_suggestion`: servisle ikon listesi verilmeden açılan "Bartender" işinin `lineup_icons`'ı `suggest_lineup_art('Bartender')`.
  - `born_with_suggestion_everywhere`: `tests.world` kurulumundaki General Manager, Assistant Manager ve Owner işleri ve doğrudan `insert into public.jobs` (PostgREST yolu) da önerilenle doğar.
  - `explicit_empty_kept`: `lineup_icons = '{}'` ile açılan iş boş kalır.
  - `rename_keeps_icons`: adı değişen işin listesi değişmez.
  - `invalid_key_refused`: bilinmeyen anahtar ve tekrar → 22023, hint `job.lineup_icons_invalid`.
  - `expected_record_includes_icons`: başka biri ikonları değiştirdikten sonra eski `expected_job` ile kayıt → `PT409`.
  - `browser_cannot_update_icons`: `authenticated` rolüyle `update jobs set lineup_icons` → 42501.
  - `read_returns_icons`: `read_settings_jobs_service` her işte `lineup_icons` döner.
  - `authorize_refusal_shape`: yetkisiz kişinin `create_job_with_assignments_service` çağrısı 42501 + `authz.*`.
- [ ] **Adım 2:** Koş, kırmızı. Bugünkü iş testleri (`grep -l "create_job_with_assignments_service\|create_department" supabase/tests`) de listede.
- [ ] **Adım 3:** Migration'ı yaz; dene; `db:schema`.
- [ ] **Adım 4:** Yeni dosya, bulunan iş testleri, `authz_catalog`, `authorization_coverage`, `authorization_matrix` yeşil.
- [ ] **Adım 5: Commit** `feat(db): every job is born with suggested Lineup icons and saves them with its details (AVATAR-IKON)`

### Görev 2.2: Paylaşılan tip ve API
**Dosyalar:**
- Değiştir: `packages/shared/src/index.ts` (`jobSchema` :852, `jobInputSchema` :940, `jobDetailsChangesSchema` ~:1037, `jobCreateWithAssignmentsSchema`)
- Değiştir: `apps/api/src/settings/jobs-management-service.ts`, `apps/api/src/settings/jobs-management-routes.test.ts`, `apps/api/src/settings/settings-reads-routes.test.ts`, web ve API fikstürleri (iş nesnesi kuran her yer; `grep -rn "system_key" apps/*/src --include=*.ts*`)

**Arayüz:**
- `jobSchema.lineup_icons: z.array(lineupArtKeySchema)` (zorunlu).
- `jobInputSchema.lineup_icons: z.array(lineupArtKeySchema).max(24).optional()`. Create'te yoksa DB önerir. `expected_job` aynı alanı taşır.

- [ ] **Adım 1:** Kırmızı API testleri: create gövdesindeki `lineup_icons` RPC'ye `job_input.lineup_icons` olarak gider; yokken anahtar hiç gönderilmez; bilinmeyen anahtar 400; okuma cevabı `lineup_icons`'ı taşır.
- [ ] **Adım 2:** Koş, kırmızı.
- [ ] **Adım 3:** Şema ve servis değişikliği; okuyan her fikstüre `lineup_icons: []`.
- [ ] **Adım 4:** Shared + web + api vitest tam, typecheck yeşil.
- [ ] **Adım 5: Commit** `feat(jobs): job reads and saves carry Lineup icons (AVATAR-IKON)`

### Görev 2.3: İş çekmecesinde "Lineup icons" (masaüstü B, telefon A)
**Dosyalar:**
- Oluştur: `apps/web/src/lineup-art/LineupArtGrid.tsx`, `apps/web/src/lineup-art/LineupArtGrid.test.tsx`
- Oluştur: `apps/web/src/settings/LineupIconsSection.tsx`, `apps/web/src/settings/LineupIconsSection.test.tsx`, `apps/web/src/settings/lineup-icons.css`
- Değiştir: `apps/web/src/settings/JobAssignmentsDrawer.tsx` (Details fieldset :396-459'un altına bölüm; `detailsDirty` :70-73; save :166-208; `reloadConflicts` :232-270), `apps/web/src/settings/JobsManagement.test.tsx`

**Arayüz:**
- `<LineupArtGrid mode="multi"|"single" selected={string[]} onToggle={(key) => void} suggested={string[]} leadTile?={ReactNode} />`. Filtre sekmeleri `Suggested`, `People`, `Things`, `All` (`People` = `person` + `team`, `Things` = `object`); arama adı ve `jobs`'u süzer; her kare `role="checkbox"` (multi) ya da `role="radio"` (single), `aria-label` = parçanın adı; ok tuşları ve boşlukla seçim. Varsayılan filtre: `suggested` boş değilse `Suggested`, yoksa `All`.
- `<LineupIconsSection value={string[]} onChange={(next: string[]) => void} jobName={string} isNew={boolean} />`:
  - `useListPhoneWidth()` yanlışsa (masaüstü B) ızgara bölümün içinde, kaydırılabilir, en çok 320 px yükseklik.
  - Doğruysa (telefon A) seçili ikonlar 48 px kareler, altında "Choose icons" düğmesi; alttan açılan pencere aynı ızgarayı gösterir, "Done" ile kapanır.
  - Başlık "Lineup icons" + seçili sayısı (`3 selected`). Açıklama: "Each person on this job gets one of these on the Lineup, unless they picked their own avatar." Boşken: "No icons. People here get a team member icon on the Lineup."
  - Yeni işte (`isNew`), kullanıcı ızgaraya dokunana kadar `value = suggestLineupArt(jobName)` ad değiştikçe güncellenir. Not: `Suggested for "<ad>". Change them any time.` İlk dokunuştan sonra öneri durur.
- `detailsDirty` ikon listesini sıralı dizi eşitliğiyle karşılaştırır. `saveJobDetails`'e `job.lineup_icons` ve `expected_job.lineup_icons` gider. `reloadConflicts` alanı öbürleri gibi birleştirir.

- [ ] **Adım 1: Kırmızı testleri yaz:**
  - `LineupArtGrid.test.tsx`: filtreler süzer; arama "tray" ile tepsili parçaları bırakır; boşluk tuşu seçer; `single` modda ikinci seçim ilkini bırakır.
  - `LineupIconsSection.test.tsx`: masaüstünde ızgara bölümde; telefonda (`phone-width.test-util`) kareler ve "Choose icons" penceresi; boş metin; yeni işte ad yazınca öneri; dokunduktan sonra ad değişse de seçim sabit.
  - `JobsManagement.test.tsx` "job assignment drawer": ikon değiştirmek Save'i açar; kayıt `lineup_icons` ve `expected_job.lineup_icons` gönderir; çakışma sonrası yeniden yükleme ikonları getirir.
- [ ] **Adım 2:** Koş, kırmızı.
- [ ] **Adım 3:** Bileşenleri yaz ve çekmeceye bağla.
- [ ] **Adım 4:** Web vitest tam, lint, typecheck yeşil. 1440 ve 390 ekran görüntüsü (owner, yeni iş, düzenleme, boş) `artifacts/avatar-ikon/` altına.
- [ ] **Adım 5: Commit** `feat(settings): the job drawer picks Lineup icons, a grid on desktop and a picker on the phone (AVATAR-IKON)`

**Dilim 2 kapanışı:** ONAY → `dal@sha` ana oturuma.

---

## Dilim 3: Avatar (dal `task/avatar-ikon-3`)

### Görev 3.1: Avatar ve son avatar veri modeli, servisler
**Dosyalar:**
- Oluştur: `supabase/migrations/<zaman>_member_avatars.sql`, `supabase/tests/member_avatars.test.sql`
- Değiştir: `supabase/schema.sql`, `authorization_coverage.test.sql`, `authorization_matrix.test.sql`, `retired_objects_stay_gone.test.sql`, `ci-green.txt`; bugünkü avatar testleri (`account_profile_storage_rls`, `account_avatar_phone_contract`, `employee_private_storage_contract`, `employee_directory_rls`) yeni modele göre yeniden yazılır ya da silinir.

**Arayüz:**
- `public.member_avatars(membership_id uuid primary key, workspace_id uuid not null, photo_path text, art_key text references app_private.lineup_art(key), updated_at timestamptz not null default now(), foreign key (membership_id, workspace_id) references workspace_memberships(id, workspace_id) on delete cascade, check (num_nonnulls(photo_path, art_key) = 1), check (photo_path ~ '^<ws>/<membership>/<uuid>\.(jpg|png|webp)$'))`. Desen tetikle ya da check ile, `workspace_id` ve `membership_id` önekiyle. RLS açık, policy yok, `authenticated`'a grant yok.
- `app_private.last_avatars(user_id uuid primary key references auth.users on delete cascade, source_membership_id uuid references workspace_memberships(id) on delete set null, art_key text references app_private.lineup_art(key))`.
  - Hazır çizim kaydında `(üyelik, anahtar)` yazılır, fotoğrafta `(üyelik, null)`.
  - Okuma: `art_key` doluysa çizim. Değilse kaynak üyeliğin **şu anki** avatarı fotoğrafsa o fotoğraf, yoksa öneri yok.
  - Bir üyelikte avatar kaldırılınca `source_membership_id` o olan satır silinir.
- Yeni eylem `avatar.self` (`authz_actions`: kapsam `own`, `restricted_ok` doğru, izin yok). Onboarding'deki kişi de kendi avatarını yazabilir.
- Servisler (hepsi `service_role`'e, `authorize` ile):
  - `get_own_avatar_service(actor_user_id uuid, target_workspace_id uuid) returns jsonb` (`avatar.self`) → `{kind: 'photo'|'art'|null, art_key, photo_path, suggested: text[]}`. `suggested` = kişinin bu workspace'teki işlerinin `lineup_icons` birleşimi, sırası korunmuş, tekrarsız; işi yoksa `[]`.
  - `save_own_avatar_service(actor_user_id uuid, target_workspace_id uuid, choice jsonb) returns jsonb` (`avatar.self`). `choice` = `{"art_key": k}` ya da `{"photo_path": p}`. `p` kişinin kendi üyelik önekinde değilse 42501 `authz.out_of_scope`. Avatarı yazar, `last_avatars`'ı günceller, `{previous_photo_path}` döner.
  - `remove_own_avatar_service(actor_user_id uuid, target_workspace_id uuid) returns jsonb` (`avatar.self`) → `{previous_photo_path}`.
  - `get_last_avatar_service(actor_user_id uuid, target_workspace_id uuid) returns jsonb` (`avatar.self`; hedef workspace kişinin kendi üyeliği) → `{kind, art_key, source_photo_path, from_workspace_name}` ya da `null`. Kaynak hedefin kendisiyse `null`.
  - `get_member_avatar_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid) returns text` (`employee.read`, `target_person`). Yalnız fotoğrafsa yolu döner, değilse `null`. Bugünkü `get_employee_avatar_path_service`'in yerine geçer.
  - `remove_member_photo_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid) returns text` (`employee.save`). Yalnız fotoğrafı siler; hazır çizimde ya da avatar yokken `PT409` hint `avatar.not_photo`. `last_avatars` temizler, `employee.avatar_removed` olayını bugünkü gibi yazar, eski yolu döner. Bildirim yok.
- Silinenler:
  - `get_employee_avatar_path_service`, `get_own_employee_avatar_path_service`, `remove_employee_avatar_service` (retired listesine);
  - `employee_private_profiles.avatar_object_path` ve `user_profiles.avatar_object_path` (kontrolleri ve yorumlarıyla);
  - `account-profile-photos` deposunun dört `storage.objects` policy'si ve `user_profiles` üzerindeki avatar yazma yolu.
  - Depo ve içindeki nesneler bu migration'da silinmez. Canlıda nesne silmek Mert'in "evet"iyle, ayrı adımda (§4).

- [ ] **Adım 1: Kırmızı testleri yaz** (`member_avatars.test.sql`):
  - `save_art_then_photo`: kişi çizim seçer, sonra fotoğraf kaydeder; satırda tek değer.
  - `one_of_two`: ikisini birden yazmak 23514.
  - `foreign_prefix_refused`: başka üyeliğin önekiyle fotoğraf yolu → 42501 `authz.out_of_scope`.
  - `workspace_boundary`: A workspace'teki avatar B'de `get_own_avatar_service` ile görünmez.
  - `management_only_member`: çalışan kaydı olmayan yönetici avatar kaydeder ve okur.
  - `last_avatar_points_to_source`: W1'de çizim → W2'de `get_last_avatar_service` çizimi ve W1'in adını döner. W1'de fotoğraf → yolu döner.
  - `removed_photo_not_suggested`: müdür W1'deki fotoğrafı kaldırınca W2'de öneri `null`.
  - `manager_removes_only_photos`: çizimde `remove_member_photo_service` → `PT409` `avatar.not_photo`.
  - `manager_scope`: kapsam dışı müdür → 42501.
  - `member_avatar_read`: müdür fotoğraf yolunu okur, çizimde `null` alır.
  - `suggested_from_jobs`: Server işindeki kişinin `suggested`'ı Server'ın `lineup_icons`'ı.
  - `old_paths_gone`: `user_profiles.avatar_object_path` yok; `authenticated` `account-profile-photos`'a yazamaz.
- [ ] **Adım 2:** Koş, kırmızı.
- [ ] **Adım 3:** Migration, dene, `db:schema`; matris, coverage, retired, eski testlerin yeniden yazımı.
- [ ] **Adım 4:** Yeni ve dokunulan pgTAP dosyaları yeşil.
- [ ] **Adım 5: Commit** `feat(db): a person has one avatar per workspace, a photo or a drawing, and a last avatar that points at its source (AVATAR-IKON)`

### Görev 3.2: Avatar API'si
**Dosyalar:**
- Oluştur: `apps/api/src/avatars/avatar-routes.ts`, `apps/api/src/avatars/avatar-service.ts`, `apps/api/src/avatars/avatar-routes.test.ts`
- Değiştir: `apps/api/src/employees/employee-directory-routes.ts` (`GET /me/avatar` buraya taşınır; `GET`/`DELETE /employees/:employeeId/avatar` yolları ve `{present, url}` cevabı aynı kalır, yeni servislere bağlanır), `employee-directory-service.ts` (eski üç RPC çıkar), `apps/api/src/app.ts` (kayıt), `apps/api/src/account/account-deletion-worker.ts` (+ testi), `apps/api/src/account/current-user-avatar.test.ts`
- Değiştir: `packages/shared/src/index.ts` (`accountProfileSchema`'dan `avatarObjectPath` çıkar; yeni şemalar), `packages/shared/src/storage-access.ts`

**Arayüz** (`packages/shared`):
- `avatarSchema = z.discriminatedUnion("kind", [{kind:"photo", url: z.string().url().nullable()}, {kind:"art", art_key: lineupArtKeySchema}])`.
- `ownAvatarResponseSchema = { present: boolean, url: string|null, avatar: avatarSchema.nullable(), suggested: lineupArtKeySchema[] }`. `present`/`url` bugünkü okuyucular için kalır; `url` yalnız fotoğrafta dolu.
- `avatarChoiceSchema = z.union([{art_key}, {photo_path: z.string()}, {use_last: z.literal(true)}])`.
- `lastAvatarResponseSchema = { avatar: avatarSchema.nullable(), from_workspace_name: string|null }`.
- Uçlar:
  - `GET /v1/workspaces/:workspaceId/me/avatar` → `ownAvatarResponseSchema`. Fotoğrafa 300 sn imzalı adres.
  - `POST /v1/workspaces/:workspaceId/me/avatar/upload` → `{path, token}`. Yol `<ws>/<membershipId>/<uuid>.<ext>`; uzantı gövdedeki `content_type`'tan (jpeg/png/webp), `createSignedUploadUrl`.
  - `PUT /v1/workspaces/:workspaceId/me/avatar` gövde `avatarChoiceSchema`:
    - `photo_path`'te nesne depodan yeniden okunur; boyut ≤5 MB ve tür doğrulanır, uymazsa 400 ve nesne silinir.
    - `use_last` fotoğrafsa kaynak nesne yeni yola kopyalanır (`storage.copy`), sonra kaydedilir. Çizimse anahtar kaydedilir. Öneri yoksa 409.
    - Kayıttan sonra `previous_photo_path` depodan silinir.
  - `DELETE /v1/workspaces/:workspaceId/me/avatar` → 204, eski fotoğraf silinir.
  - `GET /v1/workspaces/:workspaceId/me/last-avatar` → `lastAvatarResponseSchema`.
- Hesap silme işçisi `account-profile-photos` listelemesini bırakır, kişinin bütün üyeliklerindeki avatar fotoğraflarını siler.

- [ ] **Adım 1:** Kırmızı route testleri:
  - Her uç için mutlu yol ve hatalar: `authz.not_member` → 404, öteki → 403.
  - Yükleme 5 MB üstü → 400 ve nesne silinir.
  - `use_last` fotoğraf kopyası; eski fotoğrafın silinmesi.
  - Müdür uçlarının cevap şekli değişmedi.
- [ ] **Adım 2:** Koş, kırmızı.
- [ ] **Adım 3:** Yaz.
- [ ] **Adım 4:** Shared + api + web vitest tam ve typecheck yeşil.
- [ ] **Adım 5: Commit** `feat(api): avatars are read and written through the API, photos land in the workspace's private bucket (AVATAR-IKON)`

### Görev 3.3: Avatar penceresi (B) ve Account → Profile
**Dosyalar:**
- Oluştur: `apps/web/src/avatar/avatar-data.ts`, `apps/web/src/avatar/AvatarPicker.tsx`, `apps/web/src/avatar/AvatarPicker.test.tsx`, `apps/web/src/avatar/MemberAvatar.tsx`, `apps/web/src/avatar/avatar.css`
- Değiştir: `apps/web/src/account/ProfilePage.tsx` (:137-143, :254-260, :311-343, :494, :504-542) ve testi; `AccountLayout.tsx:129`; `AccountAvatar.tsx` ve testi; `apps/web/src/lib/supabase.ts` (`uploadAccountAvatar`, `removeAccountAvatar`, avatar kısımları :195-227, :244-296 silinir) ve testi; `auth/AuthContext.tsx` (+ testi); `auth/tenant-query-cache.ts` (`current-user-avatar` anahtarı workspace değişiminde temizlenir); `apps/web/CLAUDE.md:7` (istisnadan "account profile photo" çıkar)

**Arayüz:**
- `useOwnAvatar(workspaceId)`, `useSaveAvatar(workspaceId)`, `useRemoveAvatar(workspaceId)`, `useLastAvatar(workspaceId)`, `uploadAvatarPhoto(workspaceId, blob): Promise<string /*path*/>`. Yükleme `uploadToSignedUrl` ile, `documents/document-data.ts:135-140` gibi. Kayıttan sonra `["current-user-avatar", ws, userId]` ve `["own-avatar", ws]` geçersiz kılınır.
- `<MemberAvatar avatar={Avatar|null} name size />`: fotoğraf → `img`, çizim → `LineupArt`, yoksa baş harf.
- `<AvatarPicker open workspaceName personName initial={Avatar|null} suggested={string[]} onSave={(choice) => Promise<void>} onRemove?={() => Promise<void>} onClose />`:
  - Tasarımın 4.3'ündeki tek pencere: üstte önizleme (daire, ad, seçilenin adı, `Only in <workspace>. Other workspaces keep their own.`); altta `LineupArtGrid mode="single"`, `leadTile` = "Upload photo".
  - "Upload photo" `validateAvatarFile` + `AvatarCropDialog` açar; kırpılan görüntü önizlemeye girer.
  - Altta Cancel, Save. Avatar varsa solda "Remove avatar" (`ConfirmButton`).
  - Telefonda (`useListPhoneWidth`) pencere alttan açılır. "Try with a sample photo" yok.
- `CurrentUserAvatar` ve `AccountAvatar` `useOwnAvatar`'dan `MemberAvatar` çizer.
- Profile'ın üst alanı:
  - Büyük daire ve kamera rozeti; yanında ad ve e-posta.
  - Düğmeler: "Add avatar" ya da "Change avatar". Avatar varsa "Remove" (`ConfirmButton`).
  - Not: `Your avatar in <workspace>. Other workspaces keep their own. Lineups show an avatar, never a photo.`
  - Bugünkü "Upload" düğmesi, biçim notu ve gizli dosya girişi kalkar.

- [ ] **Adım 1:** Kırmızı testler:
  - `AvatarPicker.test.tsx`: Suggested ilk açılışta seçili sekme; çizim seçip Save → `{art_key}`; Upload photo → kırpma → Save → `{photo_path}`; Remove avatar iki tık; Cancel kaydetmez; telefonda alttan açılan pencere sınıfı.
  - `ProfilePage.test.tsx`: düğme metinleri ve not; eski Upload düğmesi yok.
  - `AccountAvatar.test.tsx`: fotoğraf, çizim, baş harf.
  - `supabase.test.ts`: avatar yardımcıları yok.
- [ ] **Adım 2:** Koş, kırmızı.
- [ ] **Adım 3:** Yaz; eski yolları sil.
- [ ] **Adım 4:** Web vitest tam, lint, typecheck. `e2e/flows/field-messages.spec.ts:265-278` "Choose profile photo" adımı yeni akışa (Change avatar → Upload photo) güncellenir. 1440 ve 390 görüntüleri.
- [ ] **Adım 5: Commit** `feat(account): Profile picks one avatar per workspace, a photo or a drawing, in one window (AVATAR-IKON)`

**Dilim 3 kapanışı:** ONAY → `dal@sha` ana oturuma. Canlı sırası: önce Görev 3.1'in yalnız ekleyen kısmı. Eski servisleri ve kolonları silen kısım, ana oturumda push'tan hemen önce uygulanır. `account-profile-photos` nesnelerinin silinmesi için Mert'e ayrıca sorulur.

---

## Dilim 4: Lineup çizimi (dal `task/avatar-ikon-4`)
Başlamadan önce ana oturuma sorulur: Lineup veritabanı işi (LINEUP-E-DB) ya da masaüstü F kodu aynı fonksiyonlara (`lineup_command_service`, `lineup_day`) dokunuyor mu (S-160). Dokunuyorsa sıra ana oturumun kararıdır.

### Görev 4.1: Dağıtım, saklama, okuma
**Dosyalar:**
- Oluştur: `supabase/migrations/<zaman>_lineup_drawings.sql`, `supabase/tests/lineup_drawings.test.sql`
- Değiştir: `supabase/schema.sql`, `lineup_foundation.test.sql` (bütçe testi çizimli fikstürle), `lineup_publish.test.sql`, `ci-green.txt`

**Arayüz:**
- `public.daily_lineup_drawings(lineup_id uuid, workspace_id uuid not null, employee_id uuid, job_id uuid, art_key text not null references app_private.lineup_art(key), created_at timestamptz not null default now(), primary key (lineup_id, employee_id, job_id))`. Yabancı anahtarlar `(lineup_id, workspace_id)` ve `employee_profiles(id, workspace_id)`. RLS açık, policy ve grant yok.
- `app_private.deal_lineup_art(seed text, pairs jsonb, stored jsonb) returns jsonb`:
  - `pairs` = `[{employee_id, job_id, icons}]`, `stored` = `{"<emp>:<job>": key}`. Dönüş: her çift için `{"<emp>:<job>": key}`.
  - Havuz: işin `icons` boş değilse o iş, boşsa ortak `team` havuzu (bütün `team` anahtarları).
  - Havuzdaki adaylar `md5(seed||':'||key)` ile sıralanır.
  - Yazılı çiftler olduğu gibi kalır ve sayılır.
  - Yazılı olmayanlar `md5(seed||':'||employee_id||':'||job_id)` sırasıyla, havuzda en az kullanılan adayı alır (eşitlikte aday sırası). Böylece bütün ikonlar birer kez kullanılmadan ikinci kez kullanılmaz.
  - `team` havuzu boşsa anahtar `null`.
- Tohum: `location_id || ':' || service_date || ':' || coalesce(shift_type_id::text, 'other')`.
- `lineup_day` her satıra `art_key` ekler: kişinin üyeliğindeki `member_avatars.art_key` (üyelik `workspace_memberships.employee_id` ile), yoksa `deal_lineup_art` sonucu (`stored` = lineup'ın yazılı çizimleri; header yoksa boş). Satırın işi etkin iştir (lineup'ınki, yoksa Schedule'ınki). Bir lineup için `deal_lineup_art` tek çağrılır.
- `lineup_command_service` share dalı, header ve sürüm yazıldıktan sonra o anki eksik çiftleri `insert … on conflict do nothing` ile yazar. Anlık görüntü (snapshot) ve parmak izi `art_key` taşımaz: `has_app` ve `acknowledged_at` gibi ayıklanır.
- `get_my_lineups_service` `team` ve kendi satırına `art_key` ekler (publish.sql:555-561'deki elle seçilen anahtarlara). Çizim okuma anında çözülür, anlık görüntüden okunmaz.
- Sonradan değişen işin ikon listesi yazılmış çizimi değiştirmez. Kişi başka işe geçerse yeni `(kişi, iş)` çifti yazılı olmadığı için yeniden dağıtılır, bir sonraki share'de yazılır.

- [ ] **Adım 1: Kırmızı testleri yaz** (`lineup_drawings.test.sql`, `tests.world` + `tests.person` + `tests.publish_week` ile):
  - `balanced`: 2 ikonlu işte 5 kişi → kullanım sayıları 3 ve 2. 3 ikonlu işte 3 kişi → üçü farklı.
  - `draft_stable`: header yokken aynı okuma iki kez aynı sonucu verir.
  - `share_writes_draft`: taslakta görülen ile share sonrası yazılan aynı.
  - `stable_across_republish`: share → unpublish → işin ikon listesini değiştir → share; çizimler aynı.
  - `manager_equals_employee`: `get_lineup_day_service` ile `get_my_lineups_service` aynı kişiye aynı anahtarı verir.
  - `late_joiner_least_used`: share sonrası eklenen vardiyadaki kişi en az kullanılan ikonu alır.
  - `own_art_first`: kişinin hazır çizimi yazılı dağıtımın önüne geçer; kaldırınca yazılı geri gelir.
  - `photo_falls_to_job`: fotoğraflı kişi iş ikonunu alır.
  - `two_jobs_two_drawings`: aynı lineup'ta iki işi olan kişi iki satırda iki iş ikonu; hazır çizimi varsa iki satırda da o.
  - `iconless_job_team`: ikonsuz işteki kişiler `team` anahtarı alır, dengeli.
  - `no_photo_anywhere`: fotoğraflı kişinin bulunduğu lineup'ta `get_lineup_day_service`, `get_my_lineups_service` ve `daily_lineup_versions.snapshot` metninde `employee-profile-photos` ya da fotoğraf yolu geçmez; snapshot'ta `art_key` yok.
  - `new_lineup_new_deal`: ertesi günün lineup'ı farklı tohumla dağıtır (en az bir kişi farklı; fikstür buna göre seçilir).
- [ ] **Adım 2:** Koş, kırmızı.
- [ ] **Adım 3:** Migration, dene, `db:schema`.
- [ ] **Adım 4:** Yeni dosya, `lineup_foundation` (50 ms dahil), `lineup_publish`, `notify_lineup` yeşil.
- [ ] **Adım 5: Commit** `feat(db): every Lineup row carries a drawing, dealt evenly per job and fixed once shared (AVATAR-IKON)`

### Görev 4.2: Tipler, API fikstürleri ve Lineup daireleri
**Dosyalar:**
- Değiştir: `packages/shared/src/lineup.ts` (`lineupDayRowSchema` :112-141, `myLineupRowSchema` :56-65, `team` :83-90), `apps/api/src/lineup/lineup-fixtures.ts` ve route/servis testleri
- Değiştir: `apps/web/src/schedule/lineup.ts` (`LineupRow` :9-28'e `artKey`; `lineupDay()` :119-212), `LineupReader` (`lineup.ts:340`'a `artKey`), `schedule/lineup.testing.ts`
- Değiştir: `apps/web/src/views/LineupPhone.tsx:614-621` (+ iskelet :722), `employee-hub/EmployeeLineup.tsx:349, :502`, `schedule/LineupReadList.tsx:53` ve testleri (`views/LineupPage.test.tsx`, `employee-hub/EmployeeLineup.test.tsx`, `schedule/lineup.test.ts`)

**Arayüz:** `art_key: lineupArtKeySchema.nullable()` üç satır şemasında. Web'de `artKey: string | null`. Daireler `<LineupArt artKey name size>` ile:
- `LineupPhone` 38 px;
- `EmployeeLineup` 38 ve 52 px, `--job` halkası korunur;
- `LineupReadList` 32 px.

"No job icons yet" yorumu ve kullanılmayan `initials` yardımcıları silinir.

Masaüstü `LineupPage` tablosunda bugün daire yok; bu görev ona daire eklemez. Masaüstü F tasarımı main'e indiğinde, onun satırındaki daire aynı `LineupArt` ile çizilir. O iş ya F'yi kodlayan işin içinde ya da F'den sonra bu planın ek görevi olarak yapılır; ana oturum hangisinin önce indiğine göre karar verir.

- [ ] **Adım 1:** Kırmızı testler: üç ekranda satır `art_key` taşıyınca çizim, `null` iken baş harf; okuyanlar listesi çizim gösterir; zod `art_key`'i düşürmez (`lineup-routes.test.ts`).
- [ ] **Adım 2:** Koş, kırmızı.
- [ ] **Adım 3:** Yaz.
- [ ] **Adım 4:** Shared + api + web vitest tam, lint, typecheck; 390 telefon (müdür ve çalışan) görüntüleri.
- [ ] **Adım 5: Commit** `feat(lineup): Lineup shows each person's drawing instead of initials (AVATAR-IKON)`

### Görev 4.3: Uçtan uca
**Dosyalar:** Oluştur: `e2e/flows/lineup-drawings.spec.ts` (kendi dünyası: `tests.world`, `tests.person`, `tests.password`).

- [ ] **Adım 1:** Senaryolar:
  - Owner Settings → Jobs'ta Server çekmecesinde ikon seçer, kaydeder; Lineup'ta Server satırı o ikonlardan birini gösterir.
  - Çalışan Account → Profile'da hazır çizim seçer; Lineup'ta kendi satırında o çizim görünür.
  - Fotoğraf yükleyen çalışanın Lineup satırında iş ikonu görünür, `img` yoktur.
  - Share → unpublish → share sonrası aynı kişinin çizimi aynı.
- [ ] **Adım 2:** `node ../scripts/lock.mjs run db --e2e -- npx playwright test flows/lineup-drawings.spec.ts` yeşil (bu dalın migration'ları ortak DB'ye uygulanamayacağı için e2e trenin CI'ında koşar; yerelde typecheck + lint).
- [ ] **Adım 3: Commit** `test(e2e): job icons and avatars reach the Lineup, photos never do (AVATAR-IKON)`

**Dilim 4 kapanışı:** ONAY → `dal@sha` ana oturuma. Çalışan ikonları Mert'ten onay almadıysa trene binmez.

---

## Dilim 5: Onboarding avatarı ve Employees → Access (dal `task/avatar-ikon-5`)
Başlamadan önce: çift rol işinin onboarding'e ve Employees çekmecesine dokunan dilimleri (dilim 3 ve 6.3) main'de mi? Değilse beklenir (tasarım §5.1).

### Görev 5.1: Onboarding → Profile → "Your avatar"
**Dosyalar:** Değiştir: `apps/web/src/onboarding/EmployeeOnboardingPage.tsx` (`ProfileStep` :522, "Your details" :739-861) ve testi; gerekirse onboarding route'u (`apps/api/src/employees/onboarding-routes.ts:66`).

**Arayüz:** Başlığın altında, form alanlarının üstünde "Your avatar" kutusu:
- `useLastAvatar` öneri dönerse kutu onu gösterir. Metin: `From your <from_workspace_name> profile. It will be your avatar here too, unless you change it.` Düğme: "Change".
  - "Save and continue" (sayfanın bugünkü kaydı) başarılı olunca, kişi değiştirmediyse `PUT me/avatar {use_last: true}`.
- Öneri yoksa baş harf ve `Optional. Upload your photo or pick one of ours.`, düğme "Add avatar".
- "Change" / "Add avatar" `AvatarPicker`'ı açar; önizleme öneriyle başlar. Pencerede Save, seçimi o an kaydeder.
- Avatar onboarding'i bitirmek için zorunlu değildir.

- [ ] **Adım 1:** Kırmızı testler: öneri varken metin ve "Change"; kaydetmede `use_last`; değiştirildiyse `use_last` gitmez; öneri yokken "Add avatar"; avatarsız devam edilebilir.
- [ ] **Adım 2–4:** Kırmızı → yaz → web vitest, lint, typecheck yeşil; 1440 ve 390 görüntüleri.
- [ ] **Adım 5: Commit** `feat(onboarding): a new workspace starts with the person's last avatar, which they can keep or change (AVATAR-IKON)`

### Görev 5.2: Employees → kişi → Access → "Profile photo"
**Dosyalar:** Değiştir: `apps/web/src/employees/EmployeeDrawer.tsx` (:2968-2980, `EmployeeAvatarControl` :2985-3088) ve testi.

**Arayüz:**
- Satır yalnız kişinin fotoğrafı varken görünür (`present`).
- Küçük fotoğraf ve "Remove photo" (`ConfirmButton`, kırmızı). Tek açıklama satırı: `Removes the photo this person uploaded. They can pick a new avatar any time.`
- Aynı şeyi söyleyen üç yazı (BL-472) ve pasif düğme (BL-473) kalkar. Bildirim yok.

- [ ] **Adım 1:** Kırmızı testler: fotoğraf yokken satır yok; varken iki tıkla kaldırma `DELETE …/avatar`; kaldırınca satır kaybolur.
- [ ] **Adım 2–4:** Kırmızı → yaz → yeşil; görüntüler.
- [ ] **Adım 5:** e2e: `lineup-drawings.spec.ts`'e "ikinci workspace onboarding'inde son avatar hazır gelir" senaryosu.
- [ ] **Adım 6: Commit** `feat(employees): a manager can only remove a person's uploaded photo, and the box says it once (AVATAR-IKON)`

**Dilim 5 kapanışı:** ONAY → `dal@sha` ana oturuma. Kayıt metni ana oturuma verilir:
- `KARARLAR.md`'ye bu işin kararları;
- `BACKLOG.md`'de iki avatar alanı maddesi (BL-072) ile Profile photo kutusunun metinleri (BL-472, BL-473) kapanır;
- 6 Ekim tazelik notunun düzeltmesi.
