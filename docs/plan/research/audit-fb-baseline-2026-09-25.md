# Ölçüm — FOUNDATION-B devir notundaki sayılar bugün hâlâ doğru mu

Tarih: 2026-09-25. Yapan: `nf-strateji` / `kesif`. Task: #4e1af772.
Karşılaştırılan belge: `docs/plan/handoffs/FOUNDATION-B-asama6-devir.md` (2026-09-25, `origin/main` **b6f484b**).
Bugünkü ölçüm zemini: `origin/main` **8cff17e** (fetch 2026-09-25) + yerel DB `supabase_db_newfork-clean`,
migration `20260925014408`.

> **Doğrulama (koordinatör, 2026-09-25, `27e2062`):** 80 kapı çağrısı, `ci-green.txt` 92/23, `_base` 37 (Schedule 24), `known_gap` 11, katalog tavanları ve `exempt:predicate` 16 yeniden ölçüldü, doğru. Bir sapma: listede olmayan Schedule pgTAP dosyası 3 değil **6** (`weekly_schedule_batch` ile 7); FB-6.1.md bunu düzeltti. "Kırmızı" burada "yeşil listede değil" demek; koşturulmadı.

Salt okunur çalışıldı: pgTAP koşulmadı, migration uygulanmadı, fixture üretilmedi. Yerel DB'de yalnız
`SELECT` ve bir adet `begin … rollback` içinde geçici tablo sayımı yapıldı. `db.lock` çalışma boyunca
`nf-muhendislik/test` (FB-BASELINE pgTAP measurement) elindeydi; ona dokunulmadı.

## 0. Tek cümlelik sonuç

Devir notundaki **bütün DB ve test sayıları bugün de aynı**. Tek gerçek sapma API kapısının çağrı
sayısında: not 34 diyor, gerçekte taşınacak çağrı yeri **80**. Sayıların aynı kalmasının sebebi teknik:
b6f484b'den 8cff17e'ye kadar `supabase/` ve `apps/api/` hiç değişmedi.

```
git diff --stat b6f484b origin/main -- supabase/ apps/api/   # çıktı boş
```

## 1. Satır satır karşılaştırma

| # | Ölçülen şey | Devir notu (b6f484b) | Bugün (8cff17e) | Fark / sebep |
|---|---|---|---|---|
| 1 | main son **kod** commit'i | aa5daf4 | **8cff17e** | **FARK.** aa5daf4 sonrası iki kod commit'i: b74165c (`CLAUDE.md`, `.claude/settings.json`), 8cff17e (`apps/web/src/shell/prebiz/prebiz.css`). İkisi de FOUNDATION-B kapsamı dışı. |
| 2 | main CI run | 36083940699 · check/db/e2e yeşil | **36097336242 · success, 2m40s** | **FARK** (yeni run). Durum aynı: yeşil. Son 8 run'ın hepsi success. |
| 3 | Yerel + hosted migration | `20260925014408_no_setup_state_means_no_context` | aynı | Fark yok. Yerel DB'nin son 3 migration'ı repo ile aynı. |
| 4 | `ci-green.txt` dosya sayısı | 92 | **92** | Fark yok. |
| 5 | Listede olmayan test dosyası | 23 | **23** | Fark yok. 23 adın hepsi birebir eşleşti (aşağıda). |
| 6 | `auth.uid()` çağıran fonksiyon | ≤33 | **33** | Fark yok. Tavana eşit. |
| 7 | `request.jwt.claim` yazan fonksiyon | ≤43 | **43** | Fark yok. Tavana eşit. |
| 8 | Kendi kapsam/rütbe mantığı olan fonksiyon | ≤63 | **63** | Fark yok. Tavana eşit. |
| 9 | `_base`/`_vN`/`_legacy` fonksiyon | ≤37 (yerelde 37) | **37** | Fark yok. |
| 10 | `auth.uid()` çağıran politika | ≤11 | **11** | Fark yok. Elle ad ad doğrulandı. |
| 11 | Ertelemeli tetikleyici | ≤10 | **10** | Fark yok. Tavana eşit. |
| 12 | `authorization_coverage` `exempt:predicate` | ≤16 | **16 giriş** | Fark yok. |
| 13 | `authorization_matrix` `known_gap` | 11 satır | **11 satır** | Fark yok. 11 adın hepsi birebir eşleşti. |
| 14 | `authorization_matrix` `decide:` hücresi | 0 | **0** | Fark yok. Dosyadaki 3 `decide:` geçişi yorum ve `like 'decide:%'` mantığı; veri satırı yok. |
| 15 | `retired_objects_stay_gone` tablo | 37 | **37** | Fark yok. |
| 16 | … `app_private` tablosu | 2 | **2** | Fark yok. |
| 17 | … fonksiyon | 195 | **195** | Fark yok. |
| 18 | … tip | 15 | **15** | Fark yok. |
| 19 | … sütun | 12 | **12** | Fark yok. |
| 20 | … politika | 8 | **8** | Fark yok. (Ayrıca sayılmayan: 4 permission, 3 notification, 1 checklist. Toplam 277 satır.) |
| 21 | Schedule — hafta ızgarası okuma | 4 | **4** | Fark yok. |
| 22 | Schedule — vardiya düzenleme | 5 | **5** | Fark yok. |
| 23 | Schedule — save draft | 5 | **5** | Fark yok. |
| 24 | Schedule — publish | 9 | **9** | Fark yok. 3+3 overload + 3 base. |
| 25 | `_base` fonksiyonların Schedule payı | 24 / 37, dilim sonrası ~13 | **24 Schedule + 13 diğer** | Fark yok. |
| 26 | API kapısı tanım satırları | ~3195 / ~3223 | **3195 / 3223** | Fark yok. |
| 27 | **API kapısı çağrı sayısı** | **34** | **`managerContext` 34 + `activeManagerContext` 48 = 82 geçiş / 80 çağrı** | **FARK — notun eksik sayımı.** Aşağıya bakın. |

### Ölçülemeyen iki satır (kapsam dışı)

| Satır | Neden | Kim ölçer |
|---|---|---|
| pgTAP tam koşu (not: 5971 ok / 0 not ok / 135 todo) | pgTAP koşmak bu işte yasaktı; `db.lock` başkasında | `nf-muhendislik/test` — FB-BASELINE ölçümü zaten bunu yapıyor |
| Hosted security advisors (not: 0 hata, 3 uyarı) | Hosted erişim gerekir, görev listesinde yoktu | Mühendislik, bir sonraki hosted push'tan sonra |

`supabase/` b6f484b'den beri değişmediği için ikisinin de değişmiş olma ihtimali düşük.

## 2. Tek gerçek sapma — API kapısı 34 değil 80

Devir notu (satır 41) şöyle diyor:

> **API kapısı:** `apps/api/src/schedule/schedule-routes.ts` → `managerContext` (~satır 3195) ve
> `activeManagerContext` (~3223), 34 çağrı.

Ölçüm:

| | Geçiş | Tanım | Gerçek çağrı |
|---|---|---|---|
| `managerContext` | 34 | 1 (satır 3195) | **33** |
| `activeManagerContext` | 48 | 1 (satır 3223) | **47** |
| **Toplam** | **82** | 2 | **80** |

**34 sayısı yalnız `managerContext`'in geçiş sayısıdır; `activeManagerContext`'in 48'i sayılmamış.**

Bu bir regresyon değil — dosya b6f484b'de de aynıydı, aynı sayıları veriyor:

```
git show b6f484b:apps/api/src/schedule/schedule-routes.ts   # managerContext( 34, activeManagerContext( 48
git diff --stat b6f484b origin/main -- apps/api/src/schedule/schedule-routes.ts   # boş
```

(Dosya ile `git show` çıktısı `diff` ile ayrı görünür; sebebi yalnız CRLF/LF. İçerik `tr -d '\r'`
sonrası birebir aynı, git de aynı diyor.)

**Neden önemli:** devir notu bölüm 9 ve plan Aşama 6, E1 işini "34 route kapısının taşınması" diye
boyutlandırıyor. Gerçekte `authorize()`'a taşınacak çağrı yeri **80** — iki katından fazla. Aşama 6
Schedule pilotunun efor tahmini bu sayıyla yeniden yapılmalı.

## 3. Doğrulanan listeler

**`ci-green.txt`'te olmayan 23 dosya (bugün) — devir notuyla birebir aynı:**

`account_notification_scope`, `bl052_document_access`, `bl052_document_definitions`,
`bl052_document_employee_assignment_preview`, `employee_hub`, `employee_onboarding_rls`,
`notification_platform_core`, `notification_preference_resolver_and_producers`,
`notification_settings_admin`, `onboarding_composite_tenant_constraints`, `roles_permissions_rls`,
`schedule_default_hours_review`, `schedule_draft_archive_preserves_publication`,
`schedule_edit_sessions`, `schedule_publication`, `schedule_requests`,
`schedule_templates_autofill_export`, `scheduling_settings_shift_types_rls`,
`time_off_partial_period_decisions`, `time_off_published_assignment_disposition`,
`weekly_exchange_changed_terms`, `weekly_schedule_batch`, `weekly_team_availability`.

Ters yön de temiz: listede olup dosyası olmayan satır yok (`ci-green.txt` yalnız-büyür kuralı sağlam).
Schedule'ın üç kırmızı testi (`weekly_schedule_batch`, `schedule_publication`,
`schedule_default_hours_review`) hâlâ listede değil — not doğru.

**`known_gap` 11 satır (bugün) — devir notuyla birebir aynı:**

`manager-hidden-peers`, `manager-cannot-change-employee-role`, `manager-cannot-invite`,
`owner-record-no-primary`, `admin-own-record`, `important-date-no-as-validation`, `time-off-rank`,
`restricted-no-notifications`, `membership-rows-open`, `legacy-blank-location`,
`time-off-needs-location`.

**`auth.uid()` çağıran 11 politika (elle doğrulama satırı):**

`account_notification_items.account_notification_self_read`,
`account_organization_history.account_organization_history_self_read`,
`audit_events.audit_insert_member`, `user_preferences.user_preferences_manage_own`,
`user_profiles.profiles_manage_own`, `user_workspace_preferences.preferences_insert_own_membership`,
`user_workspace_preferences.preferences_select_own`,
`user_workspace_preferences.preferences_update_own_membership`,
`workspace_memberships.memberships_select_workspace`,
`workspace_ownership_transfers.workspace_ownership_transfers_select_participant`,
`workspaces.workspaces_insert_creator`.

**Schedule zincirleri (DB'den, fonksiyon adlarıyla):**

| Ekrandaki iş | Fonksiyonlar | Sayı |
|---|---|---|
| Okuma | `get_schedule_read_model_service` + `_employee_exclusion_base`, `_label_base`, `_shift_label_management_base` | 4 |
| Düzenleme | `mutate_schedule_edit_shift_service` + `_base`, `_document_conflict_base`, `_label_base`, `_soft_audit_base` | 5 |
| Kaydetme | `save_schedule_edit_session_service` + `_base`, `_exchange_base`, `_label_base`, `_retroactive_base` | 5 |
| Yayın | `publish_schedule_draft_service` ×3 overload + `publish_schedule_draft_exchange_base` ×3 overload + `_document_conflict_base`, `_document_conflict_legacy_base`, `_label_base` | 9 |

## 4. Araç hatası olarak yakalanan iki yanlış ölçüm

Kural gereği tertipli sonuçlar önce araca yazıldı; ikisi de gerçekten araç hatasıydı.

1. **`ci-green.txt` karşılaştırması ilk denemede 115 dosyanın hepsini "listede yok" gösterdi.**
   Sebep: dosya `supabase/tests/<ad>.test.sql` tam yolunu ve **CRLF** satır sonunu tutuyor; çıplak
   adlarla karşılaştırma hiçbir satırı eşleştirmiyor. `tr -d '\r'` + yol/uzantı soyma ile düzeltildi,
   sonuç 23 oldu.
2. **`retired_objects_stay_gone` grep sayımı 20 tablo / 5 fonksiyon verdi** (not 37 / 195 diyor).
   Sebep: dosya hem satır içi `values` hem de `select 'function', name from unnest(array[…])` blokları
   kullanıyor; grep ikincisini görmüyor. Gerçek sayım SQL'in kendisi koşturularak alındı.

Ters yönde bir "tertiplilik" de var ve bu gerçek: 6 katalog sayacının altısı da tavanına tam eşit
(33/43/63/37/11/10). Bu tesadüf değil, ratchet mantığının sonucu — tavan son ölçülen değere konuyor.
10 numaralı satır (politikalar) ad ad elle sayılarak doğrulandı, gerisine güvenildi.

## 5. Kullanılan komutlar

```bash
# Zemin
git fetch origin && git rev-parse --short origin/main            # 8cff17e
git log --oneline b6f484b..origin/main
git diff --name-only b6f484b origin/main | grep -v '^docs/'
git diff --stat b6f484b origin/main -- supabase/ apps/api/       # boş

# 1-2: main CI
gh run list --branch main --limit 8

# 4-5: ci-green.txt
git show origin/main:supabase/tests/ci-green.txt | tr -d '\r' | grep -c .
git show origin/main:supabase/tests/ci-green.txt | tr -d '\r' | grep . \
  | sed 's#supabase/tests/##; s#\.test\.sql$##' | sort > /tmp/green.txt
git ls-tree -r --name-only origin/main supabase/tests/ | grep '\.test\.sql$' \
  | sed 's#supabase/tests/##; s#\.test\.sql$##' | sort > /tmp/all.txt
comm -13 /tmp/green.txt /tmp/all.txt    # listede olmayan 23
comm -23 /tmp/green.txt /tmp/all.txt    # dosyası olmayan satır: yok

# 6-11: authz_catalog sayaçları (supabase/tests/authz_catalog.test.sql sorguları, CTE ile, salt SELECT)
docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -q -At -F '|' <<'SQL'
with core_function as (
  select p.proname::text as name, p.prosrc as body
  from pg_proc p
  where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
)
select 'auth_uid_functions', count(*) from core_function where body ~ 'auth\.uid\(\)' and name <> 'rls_can'
union all
select 'jwt_claim_writers', count(*) from core_function where body ~ 'set_config\(\s*''request\.jwt\.claim'
union all
select 'own_scope_rank', count(*) from core_function where body ~* 'membership_location_scopes|all_locations|access_class\s*(=|in)|\.role\s*(=|<>|in)'
union all
select 'base_vN_legacy', count(*) from core_function where name ~ '(_base|_v[0-9]+|_legacy)(_|$)'
union all
select 'policies_auth_uid', count(*) from pg_policies where schemaname='public' and (qual ~ 'auth\.uid' or with_check ~ 'auth\.uid')
union all
select 'deferred_triggers', count(*) from pg_trigger where not tgisinternal and tgdeferrable;
SQL

# 10: elle doğrulama
docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -q -At -F '|' -c \
  "select tablename, policyname from pg_policies where schemaname='public' \
   and (qual ~ 'auth\.uid' or with_check ~ 'auth\.uid') order by 1,2;"

# 3: migration durumu
docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -q -At -c \
  "select version from supabase_migrations.schema_migrations order by version desc limit 3;"

# 12: exempt:predicate girişleri
grep -cE "^\s*\('[a-z_0-9]+',\s*'exempt:predicate'\)" supabase/tests/authorization_coverage.test.sql

# 13-14: known_gap ve decide:
sed -n '524,547p' supabase/tests/authorization_matrix.test.sql
grep -n "decide:" supabase/tests/authorization_matrix.test.sql

# 15-20: retired_objects (testin insert blokları, begin…rollback içinde)
{ echo "begin;"; sed -n '9,166p' supabase/tests/retired_objects_stay_gone.test.sql;
  echo "select kind, count(*) from retired group by kind order by 1;";
  echo "rollback;"; } \
| docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -q -At -F '|'

# 21-25: Schedule zincirleri ve _base payı
docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -q -At -F '|' -c \
  "select n.nspname||'.'||p.proname, count(*) over (partition by p.proname)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','app_private')
     and (p.proname like 'get_schedule_read_model%' or p.proname like 'mutate_schedule_edit_shift%'
       or p.proname like 'save_schedule_edit_session%' or p.proname like 'publish_schedule_draft%')
   order by 1;"

# 26-27: API kapısı
grep -nE "async function (managerContext|activeManagerContext)" apps/api/src/schedule/schedule-routes.ts
grep -oE "[^a-zA-Z]managerContext\(" apps/api/src/schedule/schedule-routes.ts | wc -l    # 34
grep -oE "activeManagerContext\(" apps/api/src/schedule/schedule-routes.ts | wc -l       # 48
grep -cE "await managerContext\(" apps/api/src/schedule/schedule-routes.ts               # 33
grep -cE "await activeManagerContext\(" apps/api/src/schedule/schedule-routes.ts         # 47
```

## 6. Sonuç ve öneriler

Etkiye göre sıralı:

1. **(leave: high / do: safe) Devir notu satır 41 düzeltilsin ve Aşama 6 E1 eforu yeniden boyutlansın.**
   "34 çağrı" → "`managerContext` 33 + `activeManagerContext` 47 = 80 çağrı". Plan ve devir notu
   `docs/plan` altında, düzeltmeyi `planlama` yapar. Taşınacak iş iki katından fazla; Schedule pilotunun
   ~7 kişi-haftalık tahmini bu sayı üzerinden gözden geçirilmeli.
2. **(leave: medium / do: safe) Aşama 6 için bu baseline taze kabul edilebilir.** DB tarafındaki 20
   sayının hepsi değişmedi ve sebebi ölçüldü: `supabase/` ile `apps/api/` b6f484b'den beri hiç
   değişmedi. Mühendislik ölçümü tekrar etmeden başlayabilir.
3. **(leave: medium / do: safe) İki satır hâlâ ölçülmedi:** pgTAP tam koşusu ve hosted security
   advisors. pgTAP'ı `nf-muhendislik/test` zaten koşuyor (FB-BASELINE); advisors bir sonraki hosted
   push'a bağlanabilir.
4. **(leave: low / do: safe) `ci-green.txt` CRLF tutuyor.** Bu dosyayı işleyen her araç önce `\r`
   temizlemeli. Ölçümü bir kez yanlış gösterdi; yazıya geçirilmesi gelecekte aynı hatayı önler.
