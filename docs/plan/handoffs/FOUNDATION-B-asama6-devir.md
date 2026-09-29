# FOUNDATION-B — Aşama 6 devir notu

Tarih: 2026-09-25. Kimden: FOUNDATION-B'yi Aşama 1–5 boyunca yürüten tekil oturum. Kime: `nf-muhendislik` lead'i (Baş Mühendis).
Karar: kullanıcı, koordinatör üzerinden (2026-09-25) — program Aşama 5 sınırında Mühendislik'e devredilir, yürütücü oturum kapanır.
Plan ve kayıt: `docs/plan/tasks/FOUNDATION-B.md` (HEDEF, bitiş kriterleri, aşamalar, Notes / Result). Bu not onun yerine geçmez; yalnız kaldığı yeri ve kayıtta olmayan çalışma bilgisini taşır. Plan başlığındaki "Session: bu oturum / Worktree: newfork-wt/fb-*" satırı eskidi; `planlama` 3 takımlı düzene göre güncelleyecek.

## 1. Programın yeri

- Aşama 0–5 bitti. Aşama 6 (alanları çekirdeğe taşıma) başlamadı; ilk dilim **Schedule pilotu**. Aşama 7 bekliyor.
- İlerleme tahmini ~%47. Plan orta noktalarından: Aşama 1–5 ≈ 10,5 kişi-hafta yapıldı; kalan ≈ 12,5 (Aşama 6 ~7, 10 uçtan uca akış ~2, dilim başı ekran turları ~3, Aşama 7 ~1). Plan, Schedule pilotu bitince bütün tahminin yeniden yapılmasını istiyor.
- Aşama 5'in bitiş ölçümleri FOUNDATION-B.md Notes / Result'un son maddesinde ("Aşama 5 bitti").

## 2. Güncel ölçümler (nereden, ne zaman)

- **main:** `origin/main` b6f484b (docs). Son kod commit'i aa5daf4; main CI run 36083940699 → check, db, e2e yeşil. Sonraki commit'ler yalnız docs (CI tetiklenmez).
- **Migration:** yerel ve hosted aynı yerde, `20260925014408_no_setup_state_means_no_context`. Hosted security advisors (bu migration'dan sonra): hata 0; bilinen 3 uyarı — `pg_net` public şemada, `read_role_workspace`, sızmış parola koruması kapalı.
- **pgTAP yeşil listesi:** `supabase/tests/ci-green.txt` 92 dosya; son tam koşu 5971 ok / 0 not ok / 135 todo (yerel, aa5daf4 öncesi, son iki migration'la).
- **Listede olmayan 23 dosya:** `account_notification_scope`, `bl052_document_access`, `bl052_document_definitions`, `bl052_document_employee_assignment_preview`, `employee_hub`, `employee_onboarding_rls`, `notification_platform_core`, `notification_preference_resolver_and_producers`, `notification_settings_admin`, `onboarding_composite_tenant_constraints`, `roles_permissions_rls`, `schedule_default_hours_review`, `schedule_draft_archive_preserves_publication`, `schedule_edit_sessions`, `schedule_publication`, `schedule_requests`, `schedule_templates_autofill_export`, `scheduling_settings_shift_types_rls`, `time_off_partial_period_decisions`, `time_off_published_assignment_disposition`, `weekly_exchange_changed_terms`, `weekly_schedule_batch`, `weekly_team_availability`. Beşi (`schedule_edit_sessions`, `schedule_templates_autofill_export`, `time_off_published_assignment_disposition`, `time_off_partial_period_decisions`, `schedule_draft_archive_preserves_publication`) kırmızı değil, takvime bağlı olduğu için 1a'da dışarıda bırakıldı; `tests.week()` ile yazılınca listeye girebilir.
- **`authz_catalog` tavanları (yalnız azalır):** `auth.uid()` çağıran fonksiyon ≤33 · `request.jwt.claim` yazan fonksiyon ≤43 · kendi kapsam/rütbe mantığı olan fonksiyon ≤63 · `_base`/`_vN`/`_legacy` fonksiyon ≤37 (yerelde 37 ölçüldü) · `auth.uid()` çağıran politika ≤11 · ertelemeli tetikleyici ≤10.
- **`authorization_coverage`:** `exempt:predicate` (eski izin yardımcıları) ≤16.
- **`authorization_matrix`:** `decide:` hücresi 0 (tek lokasyondan çıkarma işlemi matriste henüz yok; Çalışanlar diliminde eklenirken karar gerekir). `known_gap` 11 satır: `manager-hidden-peers`, `manager-cannot-change-employee-role`, `manager-cannot-invite`, `owner-record-no-primary`, `admin-own-record`, `important-date-no-as-validation`, `time-off-rank`, `restricted-no-notifications`, `membership-rows-open`, `legacy-blank-location`, `time-off-needs-location`. Her satır düzeltildiği dilimde silinir; eşleşmeyen satır suite'i kırar.
- **`retired_objects_stay_gone`:** 37 tablo + 2 app_private tablosu + 195 fonksiyon + 15 tip + 12 sütun + 8 politika.
- **Izgara okuma bütçesi:** `schedule_grid_read_budget` CI'da her gönderimde <50 ms.

## 3. Schedule dilimi — başlangıç envanteri

Planın maddesi: FOUNDATION-B.md → Aşama 6 → "1. Schedule". Aşağıdaki durum 2026-09-25'te `origin/main` b6f484b ve yerel DB üzerinde ölçüldü.

**Fonksiyon zincirleri (public + app_private):**

| Ekrandaki iş | Bugün | Hedef |
|---|---|---|
| Hafta ızgarasını okuma | `get_schedule_read_model_service` + 3 base (`employee_exclusion`, `label`, `shift_label_management`) = 4 | 1 |
| Vardiya düzenleme | `mutate_schedule_edit_shift_service` + 4 base (`base`, `document_conflict`, `label`, `soft_audit`) = 5 | 1 |
| Save draft | `save_schedule_edit_session_service` + 4 base (`base`, `exchange`, `label`, `retroactive`) = 5 (plan 4 diyordu) | 1 |
| Publish | `publish_schedule_draft_service` 3 overload + `publish_schedule_draft_exchange_base` 3 overload + `document_conflict_base` + `document_conflict_legacy_base` + `label_base` = 9 | 1 |

- Diğer Schedule katmanları: `acquire_schedule_edit_session_service_past_week_base`, `get_schedule_edit_session_service_base` ve `_label_base`, şablonda `apply_/create_schedule_template_service_label_base`, `preview_schedule_unpublication_exchange_base`, `unpublish_schedule_service_exchange_base`. `preview_schedule_publication_service` ve `preview_schedule_publication_before_availability_review_service` 2'şer overload.
- 37 `_base`/`_vN`/`_legacy` fonksiyonun 24'ü Schedule'ın; dilim bitince tavan ~13'e iner.
- Silinecek eski yardımcılar: `schedule_actor_can_manage_service`, `schedule_actor_can_publish_service`, `schedule_actor_has_capability_service`.
- **API kapısı:** `apps/api/src/schedule/schedule-routes.ts` → `managerContext` (~satır 3195) ve `activeManagerContext` (~3223), 34 çağrı. Yalnız `role !== "employee"` ve `permissions.includes(...)` bakıyor.
- **Matris:** Schedule işlemleri `schedule.read` (location), `schedule.edit` (workspace), `schedule.publish` (site). Schedule'a düşen bilinen sapma `legacy-blank-location`.
- **Kırmızı testler:** plandaki listeden `weekly_shift_availability_assessment`, `schedule_time_source`, `weekly_assignment_candidates` önceki aşamalarda yeşile döndü. Kalan: `weekly_schedule_batch`, `schedule_publication`, `schedule_default_hours_review`.

**Taşınan maddeler:**
- **E1 — belge engelli yönetici:** yukarıdaki API kapısı belge engeline ve kurulum durumuna bakmıyor; zorunlu belgesi eksik yönetici Schedule'da yazıp yayınlayabiliyor. Kapı `authorize()`'a geçince `document_blocked` adımıyla kapanır.
- **E2 — boş lokasyon:** eski yardımcılar boş lokasyona "her yer" diyor (`legacy-blank-location`); 56 çağıran null geçiyor. Her çağıran `scope_set()`'e taşınır, yardımcılar silinir, `known_gap` satırı kalkar.
- **Ghost vardiyalar lokasyonla sınırlı yöneticiye de:** okuma modeli, yöneticinin gördüğü kişilerin başka lokasyondaki vardiyalarını da döndürür. Mevcut `GhostShiftCard` (`apps/web/src/schedule/components/ShiftCard.tsx`, türetme `hooks/useCellState.ts`).
- **"Sert'e geçişin geriye etkisi yok":** yayın önizlemesinde uygulanmıyor. Kabul edilip yayınlanmış, değişmemiş bir vardiya, ayar Block'a çekilince yeniden yayında `hard_blocked` çıkıyor. Izgara, dışa aktarma ve taslak çakışma listesi doğru davranıyor. `availability_three_levels`'ta iki `todo` kontrolü olarak duruyor.
- **Onaylı izin her zaman engel:** henüz yapılmadı. Settings → Conflict handling'de "Approved time off" satırı duruyor (`ConflictHandlingSettingsPage.tsx:31`); kural hâlâ `conflict_rules->>'approved_time_off'`tan okunuyor. Plan: CHECK `approved_time_off='block'` + satır kalkar.
- **BL-062 "Ön tanımlı saatleri gözden geçir":** düğme geri gelir, `schedule_default_hours_review` yeşile döner, tarayıcıda uçtan uca denenir. Test hâlâ `unresolved` vardiya kuruyor (BL-110 ile birlikte düzelir).
- **BL-110:** 5.4'ten sonra "saat yok" dalları ölü kaldı (izin onayında "Hours need verification", Shift Hub'da "Unconfirmed", varsayılan saat penceresinde "Unconfirmed"/"Time zone unconfirmed", `scheduleShiftSchema`'nın `""` saati, hep 0 dönen `unconfirmed_peer_count`). Ayrıntı BACKLOG'da.
- **BL-115:** Realtime'da reddedilen bir kanal katılımı aynı soketteki sonraki katılımları düşürüyor. E1'le bağlantılı: belge engelli kişi Shift Hub kanalını açarsa kendi bildirim kanalı da düşer.
- Plandaki diğerleri aynen geçerli: ilgisiz kuralların onayı düşürmesi; yönetici üst/eş rütbeyi yazabilir ama onların çakışma onayı üste gider.
- **Dilim başı:** kullanıcı Schedule ekranlarını gezer ve sorunları söyler. Önce dinlenir. Görsel kararlar gerçek uygulamada, DEV'de query param'la açılan 2–3 varyantla verilir.

## 4. Belgeler dilimine taşınanlar

- **BL-080 — owner'ın resmî adı.** Kararlar FOUNDATION-B.md Aşama 6 → "6. Belgeler / onboarding" maddesinde ve BACKLOG BL-080'de:
  - Kurulum sihirbazının 1. adımı "kimlikteki ad"ı sorar, `employee_private_profiles.legal_*`'a yazılır ve zorunludur.
  - `save_own_employment_record` artık hesap adından kopyalamaz.
  - Owner adı sonradan Account ▸ Profile'da değiştirir; değişiklik denetim kaydına eski ve yeni adla, tarih ve kişiyle girer.
  - Çalışanların onboarding inceleme kuralı değişmez.
- **BL-118 — owner kendi belgesini gönüllü yükleyebilir.** Bugün `lifecycle_exempt`, owner'ı zorunlu belgelerden muaf tutarken yükleme yolunu da kapatıyor.
- **`employee_onboarding_rls`:** eski yükleme, imza ve indirme çağrıları 5.5d'de silinen fonksiyonlara gidiyor; yeni belge yoluna göre yeniden yazılır.
- Bu kararlar dilimde KARARLAR "Ürün kuralları"na işlenir.

## 5. Açık ürün sorusu

- **Çalışanı tek lokasyonundan çıkarmak** (Çalışanlar diliminden önce, Strateji üzerinden kullanıcıya). Plandaki seçenekler:
  - engelle ve admin'e işten çıkarma talebi aç;
  - kişiyi otomatik "vardiyadan hariç" yap;
  - yalnız engelle.

## 6. Kullanıcıda bekleyenler

- **Yerel `supabase db reset`:** hiç koşulmadı, çünkü kullanıcı onayı istiyor. Meyhouse fixture'ı bugünkü şemayla sütun kontrolünde uyumlu.
- **"FX: sil":** yerel DB'deki FX sızıntı kaydının silinmesi. Yedek: `C:\Users\TheWe\Documents\Codex\backups\local-db-before-fx-cleanup-20260924.dump`. FX, kurulum satırı olmayan tek workspace; 20260925014408'den beri bağlamı çözülmüyor.
- **Supabase eklenti MCP'si** yeniden yetki istiyor (interaktif `claude` terminalinde `/mcp`). claude.ai Supabase bağlayıcısı `execute_sql` ve `get_advisors` için çalışıyor.

## 7. Çalışma tuzakları

- **Yerel DB tek konteyner** (`supabase_db_newfork-clean`) ve bütün oturumlar paylaşıyor.
  - Migration'ı önce tek transaction + rollback'te dene: `{ echo "begin;"; cat supabase/migrations/<yeni>.sql; cat supabase/tests/<t>.test.sql; } | docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -q -At`.
  - Kalıcı uygulama iş bitince `npx supabase migration up --local` ile yapılır (`db.lock`).
- **CI gibi koşmak:** her pgTAP dosyası kendi transaction'ında koşar. Önce worktree'nin uygulanmamış migration'ları ve `supabase/test-support/builder.sql` yüklenir, test dosyasının kendi `begin`/`rollback`'i çıkarılır, sonda `rollback`. Böylece paylaşılan DB değişmez.
- **Seed yerel DB'ye ulaşmaz:** `seed.sql` değişikliği yerel DB'ye hiç gitmez, çünkü kimse reset etmiyor. Yalnız CI `db` işi seed'den kurar. 5.3c'de yerelde yeşil olan bir seed satırı CI'da `shift_exchanges_v1`'i kırdı. Seed değişince değişen satırları deneme transaction'ına da koy.
- **Fixture yalnız ana klasörde:** `supabase/local-fixture/meyhouse.sql` (gitignored) yalnız ana klasörde. Worktree'den yapılan reset Meyhouse verisi olmadan biter.
- **Builder:** `builder.sql` değişince yerel DB'ye yeniden yükle; dosya idempotent. `tests.settle()` iki tuzağı temizler: `set constraints all immediate` kalıcılığı ve servis köprülerinin bıraktığı `request.jwt.claim.sub` sızıntısı.
- **pgtap yerelde kalıcı kurulu değil:** her test transaction'ı onu kuruyor, bu yüzden paralel oturumların koşuları sıraya giriyor (50+ sn bekleme görüldü). Süre ölçerken pgtap'ı saatten önce kur ve `pg_stat_activity`'e bak.
- **Web tam test koşusu** pgTAP listesiyle paralel koşulunca 9 test zaman aşımına düştü (BL-120). Ağır koşuları sırayla yap.
- **CI kuralları:**
  - `ci-green.txt` yalnız büyür. Bir satır ancak dosyası silinmişse çıkabilir; CI bunu denetler.
  - typecheck ve lint ayrı kapılardır; `pnpm test` yeşil diye CI yeşil olmaz.
  - Docs-only push CI tetiklemez. Kod push'undan sonra main CI'ı izle (`gh run list --branch main`).
- **CI runner'ları** kullanıcının PC'sinde, 3 WSL runner (KARARLAR OPS-01):
  - Yalıtım runner adından gelir (`scripts/ci-supabase-apart.sh`).
  - Bir runner, yalıtımı main'e girmeden havuza eklenmez.
  - `wsl --terminate` Docker entegrasyonunu bozar.
  - e2e konteyner adını `config.toml`'dan alır; adı elle yazma.
- **Hosted push sırası:**
  1. Worktree'ye ana klasörün `supabase/.temp` link dosyalarını kopyala: `project-ref`, `pooler-url`, `postgres-version`, `linked-project.json`, `gotrue-version`, `rest-version`, `storage-version`, `storage-migration`.
  2. `npx supabase db push --dry-run`.
  3. `npx supabase db push --yes`.
  4. Security advisors.

  Sonda çıkan pg-delta sertifika / "failed to cache migrations catalog" yığın izi zararsız. Kuralı sıkılaştıran bir migration'dan önce hosted verisinin yeni kurala uyduğunu ölç; 5.5e'de bu sonradan ölçüldü ve yakın kaçıştı. Veri silen hosted değişiklik ve hosted reset kullanıcının kendi onayını ister; aktarılmış onay geçmez.
- **Küçük araç tuzakları:**
  - `npx supabase migration new` dosyayı yarattıktan sonra asılı kalabilir. Dosya oluştuysa süreci durdur.
  - `git worktree remove`, `node_modules` yüzünden "Directory not empty" verir. PowerShell `Remove-Item -Recurse -Force <yol>`, sonra `git worktree prune`.
- **Ölü kod yöntemi:** KARARLAR OPS-02.
  - Test referansları sayılmaz.
  - Yalnız ölülerin çağırdığı da ölüdür; tekrar tekrar ayıkla.
  - Silmeyi rollback'li transaction'da, cascade'siz dene.
  - CSS sınıfını tam tanımlayıcı olarak ara; literal önekle kurulan sınıfları hesaba kat.
- **Tarayıcıda giriş:** geliştirme kimliği yok.
  - Yerelde `pnpm run e2e` global setup'ının kurduğu dünya kullanılır (`e2e/.world.json`) ya da fixture hesapları için magic-link.
  - Kullanıcının kendi hesaplarıyla oturum açılmaz, parola yazılmaz.

## 8. Önerilen ilk adımlar

1. Ölç ve bu nottaki değerlerle karşılaştır: main CI, `ci-green.txt`, katalog sayaçları, `known_gap`.
2. Schedule dilimi task dosyası (`planlama`) ve kullanıcıyla Schedule ekran turu (Strateji üzerinden).
3. Tur beklenirken ekran gerektirmeyen iş: E1 + E2 (API kapısı `authorize()`'a, eski yardımcılar `scope_set()`'e), ardından zincirlerin teke inmesi (okuma, düzenleme, kaydetme, yayın). Fonksiyon imzaları ve dönüş şekilleri aynı kalır.
4. Arada küçük iş: BL-120 (CI'ı sebepsiz kırmızıya çevirebilen web testi; birkaç dakika).

## 9. Skills

Aşama 6'da hangi adımda hangi skill çağrılır:

- **Dilim planı ve yürütme:** `superpowers:writing-plans`, `superpowers:executing-plans`. Paralel alt işler için (ör. 34 route kapısının taşınması, test dosyalarının yeniden yazımı) `superpowers:dispatching-parallel-agents` ya da `superpowers:subagent-driven-development`.
- **Yetki kuralları, fonksiyon katlama, RLS, ızgaranın ≤50 ms okuma bütçesi:** `supabase:supabase` ve `supabase:supabase-postgres-best-practices`.
- **Her kural değişikliği önce kırmızı testle:** `superpowers:test-driven-development`.
- **Kırmızı testte ya da beklenmedik CI kırmızısında:** `superpowers:systematic-debugging`.
- **Worktree açma ve dilim kapanışı:** `superpowers:using-git-worktrees`, `superpowers:finishing-a-development-branch`.
- **main'e almadan önce:** `security-review` ve `superpowers:verification-before-completion`. `guvenlik` incelemesine gönderirken `superpowers:requesting-code-review`, gelen yorumlarda `superpowers:receiving-code-review`.
- **Dilim başı ekran turu ve değişen metinler** (Tasarım takımıyla): `design:design-critique`, `design:ux-copy`.
- **Ekranı gerçek uygulamada ve ekran görüntüsüyle doğrulamak:** `run` ve dahili tarayıcı. Klavye, odak ve kontrast kontrolü için `chrome-devtools-mcp:a11y-debugging`.
