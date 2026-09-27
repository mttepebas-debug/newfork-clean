# FB-6.2 Çalışanlar dilimini yetki çekirdeğine taşı (FOUNDATION-B Aşama 6)
Status: draft — S1–S4 cevaplandı 2026-09-27; başlamak için FB-6.1 main'de ve "By role" (S4 kalanı) kararı.
Session: -   Branch: task/FB-6.2   Worktree: newfork-wt/FB-6.2   DB: lock (migration + test:db + e2e)

Program: `docs/plan/tasks/FOUNDATION-B.md` → Aşama 6 → dilim tablosu, satır FB-6.2 (`:169`).
Kaynak: `docs/plan/handoffs/FOUNDATION-B-asama6-devir.md` §3 madde 2. Ürün kuralları: `docs/plan/REUSE.md` → "Ürün kuralları — rol, kapsam, uygunluk" (`:34-47`). Kalıp: `docs/plan/tasks/FB-6.1.md` (pilot).
Önkoşullar: **FB-6.1 main'de** (kalıp, ratchet tavanları ve `.11`'in katalog düşüşü önce yerleşir); **BL-139 main'de** (branch `bl139`, `app_private.authz_check`'e dokunuyor — bu dilim de aynı fonksiyonun kişi dalına dokunacak; ikisi aynı anda yazılmaz).
Reviewer: `nf-guvenlik` (her kod adımı); ekranı değiştiren adımlarda (`.8`, `.9`) ayrıca `nf-gorsel-qa`. Onay biçimi: `ONAY @<commit-sha>`.

## Tazelik ölçümü (2026-09-26)
Ölçüm: `nf-planlama`, `origin/main` `39028dc`; yerel DB yalnız SELECT (342 migration, main'dekiyle birebir aynı). Planın sayıları 2026-09-23..25 tarihli devir notundan.

| Ne (plan) | Bugün | Hüküm | Kanıt |
|---|---|---|---|
| "Kişi hedefli 6 yetki yardımcısı" (FOUNDATION-B `:169`) | Yardımcı **4 ad / 5 oid**: `can_access_employee` (public + app_private ikiz, aynı imza), `can_manage_employee_record`, `service_actor_can_access_employee`, `can_assign_employee_locations`. "6" yardımcı değil **kişi köprüsü** sayısı (devir notu §3 madde 2 doğru yazıyor: "6 kişi + 4 davet köprüsü"). | **değişmiş (etiket yanlış)** | `pg_proc` ad sorgusu |
| 6 kişi köprüsü | **6**: `get_employee_detail_service`, `list_employees_service`, `save_employee_service`, `set_employee_archived_service`, `terminate_employee_service`, `update_employee_membership_role_service` (hepsi `request.jwt.claim` yazıyor) | **geçerli** | `set_config('request.jwt.claim` deseni |
| 4 davet köprüsü | **4**: `prepare_employee_invitation_service`, `load_employee_invitation_link_service`, `load_employee_invitation_retry_service`, `store_employee_invitation_delivery_secret_service` | **geçerli** | aynı desen; ayrıca 2 onboarding köprüsü (`activate_employee_onboarding_case_service`, `review_employee_onboarding_before_availability_service`) FB-6.6'nın |
| Yardımcıları çağıran | `can_access_employee` **7** (2 Çalışanlar + 5 iş/job katalogu); `can_manage_employee_record` **12** (7 Çalışanlar/davet + 4 iş katalogu + 1 onboarding); `can_assign_employee_locations` **1** (`save_employee`); `service_actor_can_access_employee` **22** (3 Çalışanlar + 13 belge + 2 onboarding + 3 pano/yapılacaklar + 1 müsaitlik). RLS politikalarında çağrı **0**. | **yeni sayı** (devir notunda yoktu) | ad bazlı `prosrc` sorgusu; liste "Çağıran haritası"nda |
| `decide:` hücresi | **0**. "Kendi lokasyonundan çıkar" eylemi matriste **yok**; çekirdekte de yok (`app_private.authz_actions`'ta 12 `employee.*` eylemi var, `employee.remove_from_location` yok). | **geçerli**, ama kriter "0" bu eylem eklenmeden anlamsız: eylem S1 cevabıyla eklenir, `decide:` olmadan | `authorization_matrix.test.sql` `grep "'decide:"` → 0; `authz_actions` |
| `known_gap` altı satırı | altısı da duruyor: `manager-hidden-peers` `:549`, `manager-cannot-change-employee-role` `:551`, `manager-cannot-invite` `:553`, `owner-record-no-primary` `:555`, `admin-own-record` `:557`, `membership-rows-open` `:565` | **geçerli** | `supabase/tests/authorization_matrix.test.sql` |
| Kırmızı dosya `roles_permissions_rls` | yeşil listede değil (`ci-green.txt` 94 satır). Son okunmuş kırmızılar #30, #35, #46: eski kural "manager ortak kaydı işten çıkarır" (2026-09-23 araştırması; bugün koşturulmadı — `test:db` `db.lock` ister) | **geçerli, yeniden koşulmadı** | `docs/plan/research/bl070-2026-09-23/A-roller-guvenlik.md:134-150` |
| Diğer kırmızı dosyalar | yeşil listede olmayan 23 dosya; Çalışanlar'a değen tek aday daha **`employee_hub`** (çalışan arayüzü; "Çalışan görünümüne geç" ile ilişkili olabilir) | **yeni** | `supabase/tests/*.test.sql` − `ci-green.txt` |
| Sayaç katkısı (bu dilimin fonksiyonları) | `auth.uid()` **8** (4 yardımcı oid + `save_employee`, `set_employee_archived`, `terminate_employee`, `enforce_membership_role_change`); `request.jwt.claim` **14** (10 köprü + 4 iş katalogu servisi); kendi kapsam/rütbe mantığı **14**; `_base` **0**; `auth.uid` politikası **1** (`workspace_memberships.memberships_select_workspace` = `membership-rows-open`); ertelenmiş tetikleyici **0** | **yeni** | `authz_catalog` desenleri, fonksiyon bazında |
| API kapısı | `employee-directory-routes.ts` zaten çekirdeğin eylem listesiyle (`authorize(context, action)`, `apps/api/src/auth/workspace-context.ts:65`) — FB-6.1'deki gibi büyük bir API işi **yok**. `invitation-service.ts:295` yalnız kimlik doğruluyor, kararı DB köprüsüne bırakıyor. | **yeni** | kod okuması |
| Web `permissions.includes` | Çalışanlar ekranlarında **12** (`EmployeeDrawer.tsx` 11, `EmployeesPage.tsx` 1); belge ve çalışan-hub dosyalarındakiler başka dilimin | **yeni** | grep |
| "Çalışan görünümüne geç" | **yok**: `apps/web/src/App.tsx:415-419` `employee-hub/*` yalnız `roles={["employee"]}`; web'de geçiş metni yok | **geçerli** | grep |
| "Yalnız yönetir" lokasyonu | şemada karşılığı **yok** (`employee_location_assignments` / `membership_location_scopes`'ta tür kolonu yok) | **geçerli**, yeni veri modeli ister | `information_schema.columns` |
| Çalışan üyeliklerinde `all_locations=true` | yerel DB'de employee rolündeki 37 üyeliğin **35**'i `true` (fixture dahil) | **geçerli** | SELECT |
| Tercih edilen ad onayı (BL-099 yetki yarısı) | `decide_employee_preferred_name_service` ve `list_pending_preferred_names_service` çekirdeğe sormuyor, yalnız `employees.manage` iznine bakıyor; çekirdekte `employee.decide_preferred_name` eylemi var ama matriste hücresi yok | **geçerli** | `pg_proc`, matris grep |
| e2e akış 2 "Davet" | spec yok (`e2e/flows/` 4 dosya: owner-legal-name-setup, schedule-locks, shift-hub-swap, sign-in-lands) | **yeni iş** | `ls e2e/flows` |

**Sonuç:** dilim büyüklüğü tahmini (0,75–1,25 kişi-hafta) **düşük kalıyor**: yardımcıların 42 çağıranının yarısından fazlası başka alanlarda (iş katalogu, belgeler, pano), "yalnız yönetir" yeni veri modeli ve "kendi lokasyonundan çıkar" yeni komut istiyor, akış 2 e2e sıfırdan yazılıyor. Buna karşılık API kapısı hazır. Yeni tahmin **1,25–2 kişi-hafta** (ölçülmemiş; FB-6.1 bitince yeniden).

### Çağıran haritası (hangi dilim taşır)
- **Çalışanlar (bu dilim):** `get_employee_detail`, `list_employees`, `save_employee`, `set_employee_archived`, `terminate_employee` + 10 köprü; `get_employee_avatar_path_service`, `remove_employee_avatar_service`, `remove_employee_access_service`; `create_employee_command_service`, `update_employee_membership_role_service` (kendi kapsam mantığı); üyelik tetikleyicisi `enforce_membership_role_change`.
- **İş (job) katalogu — sahipsiz, P1:** `app_private.job_assignment_candidates`, `delete_catalog_entity_service`, `delete_job_with_assignments_service`, `organization_job_counts_service`, `update_job_assignments_service`.
- **Pano ve yapılacaklar — sahipsiz, P1:** `get_workspace_dashboard_service`, `create_workspace_todo_service`, `resolve_workspace_todo_service`.
- **Belgeler / onboarding (FB-6.6):** `app_private.apply_lifecycle_definition`, `document_actor_can_read`, `document_notification_policy`, `document_publication_can_access`, `document_timezone_admin`, `enqueue_document_notification`, `preview_lifecycle_definition`; `document_definition_target_options_service`, `extend_employee_document_deadline_service`, `preview_employee_document_assignments_service`, `review_employee_document_lifecycle_service`, `set_employee_document_exemption_service`, `sync_expiring_document_todos_service`, `get_employee_onboarding_review_service`, `review_employee_onboarding_before_availability_service` (bu sonuncu `can_manage_employee_record`'u da çağırıyor).
- **Müsaitlik (FB-6.5):** `weekly_preference_manager_scope` — BL-139 (branch `bl139`, `e6618b0`..`baacfc2`) bunu tamamen `authz_reason(..., target_person => emp)`'e çeviriyor; main'e girince bu çağıran düşer.

## Goal
Çalışan kaydına dokunan her giriş noktası (okuma, liste, kaydetme, işten çıkarma, arşiv, erişim kaldırma, rol değiştirme, davet) kararını `app_private.authorize(..., target_person => …)`'tan alsın; kişi yardımcıları ve on köprü gitsin. Görünür değişiklikler: yönetici M2'ye göre kendi lokasyonlarında çalışan **herkesi** görür (bugün eş/üst rütbe gizli); yönetici kendi lokasyonuna davet eder; yönetici bir kişiyi **kendi lokasyonundan çıkarır**, tamamen işten çıkarma ve arşiv yalnız admin/owner'da; admin bir yöneticiye "yalnız yönetir" lokasyonu ekler; yönetim arayüzünde **"Çalışan görünümüne geç"**.

## In scope
- Dört yardımcı (5 oid) → `authorize(target_person)` / `scope_set()`; Çalışanlar alanındaki çağıranlar taşınır, P1'e göre iş katalogu ve pano da.
- On köprü (6 kişi + 4 davet) silinir; yerine `actor` alan servis fonksiyonu (FB-6.1 kalıbı: `*_service(actor, w, …)`, ilk ifade `authorize`). `request.jwt.claim` sayacı en az 10 düşer.
- `known_gap`'in altı satırı kapanır: M2 okuma (`manager-hidden-peers`), yönetici employee rolleri arasında taşır (`manager-cannot-change-employee-role`, kural 2026-09-24 6A), yönetici kendi lokasyonuna davet eder (`manager-cannot-invite`), owner kaydı (`owner-record-no-primary`, S4), admin kendi kaydını kaydeder (`admin-own-record`, P0002 hatası), üyelik satırları tarayıcıdan açık değil (`membership-rows-open`: `memberships_select_workspace` politikası kendi satırı + çekirdek).
- **"Kendi lokasyonundan çıkar"** (REUSE `:46`): yeni eylem `employee.remove_from_location` + komut; o lokasyondaki atama ve gelecek vardiyalar biter. Tek lokasyon durumu S1'e göre. Matriste kural satırı, `decide:` yok.
- **Tamamen işten çıkarma ve arşiv yalnız admin/owner** — matris kuralı zaten böyle (`authorization_matrix.test.sql:437-443`); DB davranışı ve `roles_permissions_rls` #30/#35/#46 bu kurala göre yeniden yazılır (eski "manager ortak kaydı işten çıkarır" kuralı yok, test bugünkü kuralı söyler).
- **"Yalnız yönetir" lokasyonu** (REUSE `:38`): veri modeli (P2), admin ekler/kaldırır, `scope_set` onu yönetilen lokasyon sayar, vardiya ızgarasında satır açmaz. Rol düşünce ne olacağı S3.
- Çalışan üyeliklerinde `all_locations`: employee rolünde anlamı yok; `false`'a çekilir ve CHECK ile sabitlenir (veri korunmaz — CLAUDE.md §9).
- Rütbe: talepler bir üst kademeye, kimse kendi talebini onaylamaz — tercih edilen ad onayı ve listesi çekirdeğe (`employee.decide_preferred_name`), matrise hücre (BL-099'un yetki yarısı; teslim yarısı FB-6.7).
- **BL-129** (matrise ikinci admin kişisi): admin-admin hücreleri (işten çıkarma, arşiv, erişim kaldırma, rol, not) bu dilimin kurallarını kanıtlar — `.1`'de.
- **BL-145** (`save_own_employment_contact_service` 42501'i `authz.*` hint'siz gönderiyor): kişinin kendi kaydı, "hayır" sözleşmesi — `.6`'da.
- Web: Çalışanlar ekranlarının 12 `permissions.includes`'u `can()`'e; "Kendi lokasyonundan çıkar" düğmesi, "Yalnız yönetir" alanı (admin), **"Çalışan görünümüne geç"** (`App.tsx` employee-hub rotası rolleri genişler, `resolveLanding.ts`, `AppShell.tsx` üst menü). Görsel kararlar DEV'de 2–3 varyant.
- e2e: akış 2 "Davet" (yeni) ve akış 10'un kapsam/kişi görünürlüğü + "Çalışan görünümüne geç" yarısı (yeni).

## Out of scope
- Belge/onboarding çağıranları (`service_actor_can_access_employee`'nin 15'i) ve 2 onboarding köprüsü → FB-6.6. Bu yüzden `service_actor_can_access_employee` bu dilimde **silinmez** (P3).
- Tercih edilen ad bildiriminin teslimi (BL-099'un teslim yarısı) → FB-6.7.
- `read_role_workspace` tarayıcı grant'i ve Settings → Roles okuma yolu → FB-6.8 (`roles_permissions_rls` #21/#22 bu yüzden bu dilimde değişmez; bugün kırmızı değiller).
- **BL-076** (oturumsuz çağrıya 404 yerine 401): bütün workspace rotalarının ortak kapısı (`apps/api/src/auth/workspace-context.ts:108-109`), Çalışanlar'a özgü değil; bu dilime alınmaz, backlog'da kalır.
- Yöneticinin izin kısaltma eylemi (BL-127), müsaitlik (FB-6.5), Settings kataloğu (FB-6.8).
- `employee_hub` kırmızısı: `.0`'da nedeni okunur; "Çalışan görünümüne geç"le ilgisi yoksa ait olduğu dilime yazılır, bu dilime eklenmez.

## Açık sorular — cevaplandı 2026-09-27 (kullanıcı, koordinatör kanalıyla)
- **S1 — Kişinin tek lokasyonundan çıkarılması (REUSE `:46` "Açık karar").** Ayşe (Kadıköy müdürü) yalnız Kadıköy'de çalışan Emre'yi "Kadıköy'den çıkar"ırsa ne olur?
  - (a) **(Önerilen)** Çıkarma olur (atama ve gelecek vardiyalar biter), Emre lokasyonsuz ama çalışan olarak kalır; admin ve owner'a "Emre'nin lokasyonu kalmadı — işten çıkar ya da yeni lokasyon ata" bildirimi gider; Emre admin/owner'ın Employees listesinde "No location" etiketiyle görünür. Gerekçe: yöneticinin işi kendi lokasyonunda biter, tam işten çıkarma kuralı (yalnız admin/owner) bozulmaz.
  - (b) Engellenir: tek lokasyonsa düğme "Ask an admin to end employment" der ve admin'e talep gider.
  - (c) Otomatik tam işten çıkarma. (Kuralla çelişir: tam çıkarma yalnız admin/owner.)
  - Etki: `.2`'nin komutu ve matris kuralı buna göre yazılır.
  - **Cevap: (a).** **Kullanıcı şartı:** "çalışan kaydı lokasyonsuz kaydedilemez" kuralı bozulmaz. Çıkarma komutu kaydı "No location" durumuna getirebilir; Employees çekmecesinden (drawer) kaydetme yine en az bir lokasyon ister. Testi Done when 11'de.
- **S2 — "Yalnız yönetir" lokasyonundaki yönetici nerede görünür?** Mehmet Beşiktaş'ı yalnız yönetiyor (vardiyaya girmiyor).
  - (a) **(Önerilen)** Beşiktaş Employees listesinde "Manages" etiketiyle görünür (Beşiktaş'ın diğer yöneticileri onu görür, M2), Takvim ızgarasında Beşiktaş satırı açılmaz, vardiyaya yazılamaz.
  - (b) Hiçbir Beşiktaş listesinde görünmez; yalnız admin/owner bilir.
  - **Cevap: (a)** — "Manages" etiketiyle listede, ızgarada satır yok.
- **S3 — Rolü manager'dan employee'ye düşen kişinin "yalnız yönetir" lokasyonları.**
  - (a) **(Önerilen)** Aynı işlemde kalkar; denetim kaydına yazılır. Çalıştığı atamalar kalır.
  - (b) Kalır ama etkisizdir (rol yeniden manager olursa geri gelir).
  - **Cevap: (a)** — aynı işlemde kalkar, denetim kaydına yazılır.
- **S4 — Owner'ın çalışan kaydında birincil lokasyon ve iş zorunlu mu?** Bugün kurulumun yarattığı owner kaydında ikisi de yok ve kaydetme 23502 ile düşüyor (`owner-record-no-primary`).
  - (a) **(Önerilen)** Owner için isteğe bağlı: owner vardiyaya girmeyebilir; boşken kayıt kaydedilir, owner ızgarada satır açmaz.
  - (b) Zorunlu: kurulum sihirbazı sorar, Account ▸ Profile'da boş bırakılamaz.
  - **Cevap (kullanıcının kelimeleriyle, (a)'nın genişletilmiş hâli):** owner bütün lokasyonlarda ve bütün pozisyonlarda (job), ataması olmasa da çalışabilir. Kaydederken birincil lokasyon ve birincil iş **zorunlu değil**. Schedule ızgarasında adının çıkmaması isteniyorsa "exclude" işaretlenir, aksi hâlde adı otomatik çıkar. A–Z sıralamada baş harfine göre yer alır. "By role" sıralamasındaki yeri **açık**: kullanıcının Management/Owner fikrine bağlı (`docs/plan/research/owner-management-job-2026-09-27.md`).

## Planlama kararları (koordinatöre; ürün kuralı değil)
- **P1 — Sahipsiz çağıranlar.** İş katalogu (5) ve pano/yapılacaklar (3) hiçbir dilimin satırında yok; ikisi de kişi hedefli kontrol yapıyor. **Öneri:** FB-6.2 alır (8 fonksiyon; 4'ü `request.jwt.claim` yazıyor). Böylece `can_access_employee` (2 oid), `can_manage_employee_record`, `can_assign_employee_locations` bu dilimde **silinebilir** — `can_manage_employee_record`'un tek FB-6.6 çağıranı (`review_employee_onboarding_before_availability_service`) için yalnız o satır değiştirilir, fonksiyonun geri kalanı FB-6.6'da. Elenen: silmeyi FB-6.6'ya ertelemek (üç yardımcı iki dilim daha yaşar, K-1'in bedeli tekrarlanır).
- **P2 — "Yalnız yönetir" veri modeli (`nf-db` kararı, `nf-guvenlik` onayıyla).** (a) **(Önerilen)** ayrı tablo `membership_managed_locations(workspace_id, membership_id, location_id, added_by, added_at)`; `scope_set` çalışılan atamalar ∪ bu tablo; Takvim ve atama okuyucuları değişmez. (b) `employee_location_assignments`'a tür kolonu: her ızgara/aday/izin okuyucusu `kind='works'` süzmeli — unutulan tek okuyucu yöneticiyi vardiyaya aday yapar. (a) daha az yüzeye dokunur.
- **P3 — `service_actor_can_access_employee` silinmesi.** Bu dilimde 3 Çalışanlar + 3 pano çağıranı taşınır (P1), müsaitlik çağıranı BL-139 ile düşer, kalan 15 belge/onboarding çağıranı FB-6.6'da; yardımcı **FB-6.6'da silinir**, `retired_objects_stay_gone` aynı commit'te. FOUNDATION-B FB-6.6 satırına kapanış kriteri olarak yazılmalı (koordinatör onayıyla).

## Done when
Her madde bir sayı ya da komutla ölçülür.
1. `roles_permissions_rls` (ve `.0`'da bu dilime ait çıkarsa `employee_hub`) `supabase test db` → 0 not ok ve `ci-green.txt`'te.
2. `authorization_matrix`: `grep -c "'decide:" ` → 0; `employee.remove_from_location` satırı var ve kuralı S1'e göre; `known_gap`'ten altı satır silinmiş (11 → 5; FB-6.1 sonrası sayıya göre yeniden hesaplanır); ikinci admin kişisiyle admin-admin hücreleri (BL-129) ve `employee.decide_preferred_name` hücreleri var, TS ikizi (`dump:authz-matrix`) güncel.
3. Veritabanında `can_access_employee` (2 oid), `can_manage_employee_record`, `can_assign_employee_locations` yok ve `retired_objects_stay_gone`'da (P1 kabulüyle); `service_actor_can_access_employee`'nin çağıranları yalnız belge/onboarding fonksiyonları (sabitleyen pgTAP kontrolü; liste yalnız küçülür).
4. On köprü veritabanında yok ve `retired_objects_stay_gone`'da; `authz_catalog` tavanları: `request.jwt.claim` 43 → ≤33 (P1 ile ≤29), `auth.uid()` 33 → ≤26, kendi kapsam/rütbe mantığı ölçülen değer − bu dilimin payı, `auth.uid` politikası 11 → ≤10. Kesin değerler `.0`'ın fonksiyon listesinden; tavanlar yalnız azalır.
5. Employee rolünde `all_locations = true` üyelik 0 ve CHECK kısıtı var.
6. `grep -c "permissions.includes" apps/web/src/employees/EmployeeDrawer.tsx apps/web/src/employees/EmployeesPage.tsx` → 0.
7. Yönetim arayüzünde "Çalışan görünümüne geç" çalışıyor: kendi çalışan kaydı olan owner/admin/manager üst menüden çalışan arayüzüne geçip geri dönüyor (e2e).
8. e2e akış 2 (davet: yönetici kendi lokasyonuna davet eder, davetli kabul eder, listede görünür; başka lokasyona davet 403) ve akış 10'un kapsam yarısı (yönetici kendi lokasyonundaki eş rütbeyi görür, başka lokasyondakini görmez; "kendi lokasyonundan çıkar") yeşil.
9. BL-145: başkasının kaydına `save_own_employment_contact_service` → 42501 + `authz.*` hint (pgTAP hücresi).
10. Her kural değişikliği önce kırmızı matris hücresiyle (commit sırası incelemede görülür).
11. **S1 şartı (kullanıcı):** (i) `employee.remove_from_location` kişinin tek lokasyonunda çalışınca kayıt lokasyonsuz kalır, Employees listesinde "No location" etiketiyle görünür, admin/owner'a bildirim kuyruğa girer; (ii) aynı kayıt çekmeceden (`save_employee_service`) lokasyonsuz kaydedilmeye çalışılınca reddedilir (pgTAP + web vitest). İkisi aynı test dosyasında.
12. **S4 (kullanıcı):** owner kaydı birincil lokasyon/iş olmadan kaydedilir (`owner-record-no-primary` kapanır); owner atanmadığı lokasyon ve işlerde de vardiyaya yazılabilir; "exclude" işaretli değilse ızgarada satırı çıkar, işaretliyse çıkmaz; A–Z sıralamada adının baş harfine göre. "By role" yeri açık karar (araştırma notu) cevaplanınca eklenir.

## Alt adımlar (sıra, sahip, DB kilidi)
**Her adım için geçerli kabul kriteri (ratchet kuralı, FB-6.1'den):** adımın commit'i altı `authz_catalog` sayacının hiçbirini artırmaz; yeni fonksiyon ancak eskisini aynı commit'te silerek girer. Kapsam/rütbe sayacında bugün 2 birim gevşeklik var (tavan 63, değer 61; FB-6.1 `.4` tazelik kontrolü) — bu dilim o payı kullanamaz. Her `nf-db` adımı kapanmadan `supabase test db supabase/tests/authz_catalog.test.sql` → 0 not ok. Migration önce tek transaction + rollback.

| Adım | İş | Sıra | Sahip | DB kilidi | Dosyalar |
|---|---|---|---|---|---|
| **FB-6.2.0** | Taze ölçüm: FB-6.1 ve BL-139 main'e girdikten sonra bu dosyanın tazelik tablosu yeniden sayılır (çağıranlar, sayaçlar, `known_gap`), `roles_permissions_rls` ve `employee_hub` koşturulup kırmızı kontroller adıyla yazılır. | 0. İlk. | `nf-planlama` (SELECT) + `nf-test` (koşturma, `db.lock`) | Evet (yalnız `test:db`) | bu dosya |
| **FB-6.2.1** | Matris: ikinci admin kişisi (BL-129), "yalnız yönetir" kişisi, `employee.remove_from_location` ve `employee.decide_preferred_name` satırları; S1–S3 kuralları `expected()`'e; yeni hücreler kırmızı. TS ikizi. | 1. S1–S3 cevabından sonra. | `nf-db` | Evet | `supabase/tests/authorization_matrix.test.sql`, `supabase/test-support/builder.sql`, `packages/shared/src/authorization-matrix.expected.json` (döküm) |
| **FB-6.2.2** | Veri modeli ve komut: "yalnız yönetir" (P2), `scope_set` bunu sayar; `employee.remove_from_location` eylemi ve komutu (atama + gelecek vardiyalar biter, S1 dalı); `all_locations` CHECK; rol düşünce S3. | 2. `.1`'den sonra. | `nf-db` | Evet | migration |
| **FB-6.2.3** | Okuma ve liste çekirdeğe: `get_employee_detail(_service)`, `list_employees(_service)` → `authorize(..., target_person)`; M2 (`manager-hidden-peers` kapanır); `membership-rows-open` politikası. İki köprü silinir. | 3. `.2`'den sonra. | `nf-db` | Evet | migration |
| **FB-6.2.4** | Yazma çekirdeğe: kaydet, işten çıkar, arşiv, erişim kaldır, rol değiştir (`save_employee`, `set_employee_archived`, `terminate_employee`, `remove_employee_access_service`, `update_employee_membership_role_service`, `enforce_membership_role_change`, avatar); `admin-own-record`, `owner-record-no-primary` (S4), `manager-cannot-change-employee-role` kapanır. Dört köprü silinir. | 4. `.3`'ten sonra. | `nf-db` | Evet | migration |
| **FB-6.2.5** | Davet çekirdeğe: `create_employee_command_service` ve dört davet köprüsü → `actor` alan servis; `manager-cannot-invite` kapanır. API `invitation-service.ts` yeni imzalara. | 5. `.4`'ten sonra (`.4` ile aynı fonksiyonlara dokunmaz, ama tetikleyici ortak). | `nf-db` → `nf-backend` | Evet | migration; `apps/api/src/employees/invitation-service.ts` ve testi |
| **FB-6.2.6** | P1 çağıranları (iş katalogu 5, pano 3) çekirdeğe; **BL-187** (owner kendi çalıştığı lokasyonu silemiyor: `delete_catalog_entity_service` → `can_manage_employee_record`, `catalog_entity_deletion.sql:88-98`; koordinatör kararı 2026-09-27, Ç3) aynı taşımada kapanır — owner/admin her lokasyonu siler, müdür kural dışı; tercih edilen ad onayı/listesi çekirdeğe; BL-145 hint'i; üç yardımcı silinir + `retired_objects_stay_gone`; `service_actor_can_access_employee` çağıran listesini sabitleyen kontrol. | 6. `.5`'ten sonra. | `nf-db` | Evet | migration, `supabase/tests/` |
| **FB-6.2.7** | API ve web veri katmanı: `employee.remove_from_location` route'u ve "yalnız yönetir" uçları (`employee-directory-routes.ts`); web `can()` geçişi (12 satır), hook'lar; "Çalışan görünümüne geç" rota koruması (`App.tsx`, `resolveLanding.ts`). | 7. `.6`'dan sonra. | `nf-backend` | Hayır | `apps/api/src/employees/**`, `apps/web/src/employees/*-data.ts`, `apps/web/src/App.tsx` (rota), `apps/web/src/auth/**`, `packages/shared/**` |
| **FB-6.2.8** | Görsel: "Kendi lokasyonundan çıkar" düğmesi ve onayı (`ConfirmButton`, yıkıcı iki tık), "Yalnız yönetir" alanı, "No location"/"Manages" etiketleri, "Çalışan görünümüne geç" menü öğesi — DEV'de 2–3 varyant, kullanıcı seçer. | 8. `.7` main'e girince yeni `origin/main`'den. | `nf-arayuz` → `nf-gorsel-qa` | Hayır | `apps/web/src/employees/**` sunum, `apps/web/src/shell/AppShell.tsx` sunum, CSS |
| **FB-6.2.9** | Kırmızı dosyalar yeşile: `roles_permissions_rls` #30/#35/#46 bugünkü kurala (tam çıkarma admin/owner; yönetici yalnız kendi lokasyonundan çıkarır); `ci-green.txt`; katalog tavanları Done when 4'e; `known_gap` altı satır silinir. | 9. `.6`'dan sonra (`.7` ile paralel). | `nf-test` | Evet | `supabase/tests/roles_permissions_rls.test.sql`, `authz_catalog.test.sql`, `ci-green.txt` |
| **FB-6.2.10** | e2e: akış 2 (davet) ve akış 10'un kapsam yarısı + "Çalışan görünümüne geç". | 10. `.7`'den sonra (`.8` ile paralel; seçiciler `.8`'de değişirse `.8`'den sonra). | `nf-test` | Evet | `e2e/flows/invite.spec.ts`, `e2e/flows/scope-and-employee-view.spec.ts` |
| **FB-6.2.11** | Kapanış: onaylar, tam kapı, main'e gönderim ve main CI, Notes / Result, FOUNDATION-B ilerleme kaydı. | 11. Son. | koordinatör | Evet (e2e) | bu dosya, `FOUNDATION-B.md` |

Yürütme sırası: `.0` → `.1` → `.2` → `.3` → `.4` → `.5` → `.6` → (`.7` ∥ `.9`) → `.8` → `.10` → `.11`. `.3`–`.6` aynı migration ailesine dokunduğu için tek `nf-db` oturumunda ardışık; her biri kendi commit'i ve incelemesi.

## Touches
- **`nf-db`:** `supabase/migrations/**` (dilimde 4–6 migration), `supabase/tests/authorization_matrix.test.sql`, `supabase/test-support/builder.sql`, kendi adımlarının pgTAP'ı, `retired_objects_stay_gone`.
- **`nf-backend`:** `apps/api/src/employees/**`, `apps/web/src/employees/*-data.ts` ve hook'ları, `apps/web/src/App.tsx` (yalnız rota/koruma), `apps/web/src/auth/**` (`resolveLanding.ts`), `packages/shared/**`.
- **`nf-test`:** `supabase/tests/roles_permissions_rls.test.sql`, `authz_catalog.test.sql`, `ci-green.txt`, `e2e/flows/**`.
- **`nf-arayuz`:** Çalışanlar ekranlarının sunumu (`EmployeesPage`, `EmployeeDrawer`), `AppShell.tsx` sunumu, CSS/token, `docs/design-canvas.md`.

## Test plan
- Her kural: önce kırmızı matris hücresi, sonra migration (TDD). Kişi hedefli her eylem için hücre dizisi: kendi kaydı, aynı lokasyonda alt/eş/üst rütbe, başka lokasyonda kişi, "yalnız yönetir" lokasyonundaki kişi, ikinci admin, owner, yabancı workspace, bilinmeyen kişi id'si (bilinmeyen ve kapsam dışı aynı cevap: `authz.out_of_scope`).
- "Kendi lokasyonundan çıkar": iki lokasyonlu kişide yalnız o lokasyonun ataması ve gelecek vardiyaları biter (diğer lokasyonun vardiyası durur); tek lokasyonda S1 dalı; geçmiş vardiya değişmez.
- `membership-rows-open`: tarayıcı rolüyle `workspace_memberships` SELECT yalnız kendi satırını döndürür.
- `authz_catalog` her `nf-db` adımında; `retired_objects_stay_gone` silinen her nesne için.
- Web: `EmployeeDrawer`/`EmployeesPage` vitest'leri `can()` ile; "Çalışan görünümüne geç" rota testi (`App.test.tsx`).
- e2e: Done when 7–8. Tam kapı: `pnpm.cmd lint`, `typecheck`, `test`, `build`, `test:db`, etkilenen e2e (CLAUDE.md §6).

## Risk
- **İş katalogu ve pano çağıranları (P1) dilimi büyütür.** Önlem: `.6` ayrı adım; P1 reddedilirse `.6` yalnız Çalışanlar'ın kalanını yapar ve yardımcı silme FB-6.6'ya kayar (Done when 3 buna göre gevşemez, ertelenir ve FOUNDATION-B'ye yazılır).
- **"Yalnız yönetir" okuyucu sızıntısı.** Yönetici vardiyaya aday ya da ızgarada satır olarak sızarsa sessiz bir kapsam hatası olur. Önlem: P2 (a) ayrı tablo; `weekly_assignment_candidates` ve ızgara testine "yalnız yönetir" kişisi hücresi.
- **Üyelik tetikleyicisi (`enforce_membership_role_change`) ile API kararının çelişmesi** (BL-070'teki #46 örneği). Önlem: tetikleyici `.4`'te çekirdeğe sorar; kendi rütbe mantığı kalmaz.
- **`authz_check` ortak.** BL-139 main'e girmeden başlanmaz; FB-6.1'in `.4`'ü de çekirdeğe dokunuyorsa aynı anda yazılmaz (CLAUDE.md §3).
- **Kırmızı dosyanın beklentisini gevşetmek yasak.** `roles_permissions_rls` #30/#35 eski kuralı (yönetici tam çıkarır) iddia ediyor; kural 2026-09-23'te değişti (REUSE `:46`). Test **yeniden yazılır**, gevşetilmez: yönetici tam çıkaramaz (hücre), kendi lokasyonundan çıkarır (yeni hücre).
- **Ratchet payı yok** (FB-6.1 sonrası da tavanda olacak). Önlem: köprü silinmeden yerine servis yazılmaz; ikisi tek commit.

## Pre-mortem (2026-09-26, `nf-planlama`: "3 ay sonra bu dilim neden başarısız sayılır?")
1. **"Yalnız yönetir" yanlış yerde modellendi, Takvim yöneticiyi vardiyaya yazdı.** Gizli varsayım: atama tablosuna bir kolon eklemek en ucuzu. Kanıt: atama tablosunu okuyan ızgara, aday ve izin fonksiyonları FB-6.1/6.3/6.4'ün alanında; bu dilim onlara dokunmuyor. Düzeltme: P2 (a) ayrı tablo; kabul hücresi Test plan'da.
2. **S1 cevapsız kaldı, `.1` bekledi, dilim durdu.** Kanıt: REUSE `:46` 2026-09-23'ten beri "Açık karar". Düzeltme: S1–S4 kullanıcıya dilimden önce, FB-6.1 sürerken sorulur; `.0` cevap beklemeden yürür.
3. **Silinen köprünün tek bir API çağıranı unutuldu, davet üretimde kırıldı.** Köprüler `pg_depend` kaydı olmadan RPC adıyla çağrılıyor (FB-6.1 bölüm E ile aynı tuzak). Düzeltme: her köprü silinmeden önce `rg "<ad>" apps packages` → 0; akış 2 e2e'si `.5`'ten hemen sonra değil `.10`'da — **daha basit alternatif:** akış 2'nin iskeletini `.0`'da mevcut davranışla yazıp yeşil tutmak, her adım onu koşar.
4. **Kullanıcı sürtünmesi: tam çıkarma yetkisi yöneticiden alındı, yöneticiler "çalışanı çıkaramıyorum" dedi.** Kural kullanıcının (REUSE `:46`), ama ekranda yöneticiye yolu gösteren bir şey yoksa destek yükü. Düzeltme: `.8` varyantlarında "End employment" düğmesi yöneticide gizlenmez, "Only an admin can end employment — remove from <location> instead" açıklamasıyla pasif; varyant seçimi kullanıcının.
5. **MVP'ye katkı sorgusu.** Dilimin görünür kazancı M2 okuma ve yöneticinin davet edebilmesi — self-serve ABD lansmanında şube müdürünün ekibini kendisinin kurması doğrudan değer. "Çalışan görünümüne geç" ve "yalnız yönetir" daha az kritik. **Daha basit alternatif:** "yalnız yönetir"i (P2 + S2 + S3) FB-6.2b'ye ayırmak; dilim ~0,5 kişi-hafta küçülür, `scope_set` değişmeden kalır. Karşı gerekçe: M2'nin "manager'ın lokasyonları" tanımı eksik kalır, vardiyaya girmeyen şube müdürü kimseyi göremez. Öneri: dilimde kalsın, ama `.2`'de ayrı commit olsun ki geri alınabilsin.
6. **Geri alınabilirlik.** `all_locations` CHECK ve köprü silmeleri veri değil şema değişikliği; canlı veri yok (CLAUDE.md §9), geri alma yeni migration'la. Risk düşük.

## Skills
Plan: `superpowers:writing-plans`; yürütme: `superpowers:executing-plans` ya da `superpowers:subagent-driven-development`. SQL, RLS: `supabase:supabase`, `supabase:supabase-postgres-best-practices`. Her kural önce kırmızı: `superpowers:test-driven-development`. Beklenmedik kırmızı: `superpowers:systematic-debugging`. İnceleme: `superpowers:requesting-code-review`, `security-review`, `superpowers:verification-before-completion`. Görsel varyantlar: `frontend-design:frontend-design`; erişilebilirlik: `chrome-devtools-mcp:a11y-debugging`.

## Notes / Result
- 2026-09-27 (`nf-planlama`): kullanıcının S1–S4 cevapları işlendi (S1 (a) + lokasyonsuz kaydetme yasağı şartı, S2 (a), S3 (a), S4 genişletilmiş — owner her yerde çalışabilir, birincil zorunlu değil, exclude, A–Z); Done when 11–12 eklendi; REUSE "Roller ve kapsam" güncellendi. Açık: owner'ın "By role" yeri — Management/Owner fikri araştırması.
- 2026-09-27 (`nf-planlama`): koordinatör kararı (ILERLEME-PLANI Ç3) — BL-187 `.6`'ya katıldı; kabul: owner kendi çalıştığı lokasyonu silebiliyor (pgTAP hücresi + BL-187 kapanır).
- 2026-09-26 (koordinatör): P1, P2 (a) ve P3 önerildiği gibi kabul edildi. P1: iş katalogu (5) ve pano/yapılacaklar (3) çağıranları FB-6.2'de; üç yardımcı bu dilimde silinir. P2: "yalnız yönetir" ayrı tabloda (`membership_managed_locations`), `nf-guvenlik` onayıyla. P3: `service_actor_can_access_employee` FB-6.6'da silinir; FOUNDATION-B FB-6.6 satırına kapanış kriteri yazıldı. S1–S4 kullanıcıyı bekliyor (kullanıcı 2026-09-26'da uzakta; dönünce toplu sorulacak).
- 2026-09-26 (`nf-planlama`): dosya açıldı. Tazelik ölçümü `origin/main` `39028dc`, yerel DB yalnız SELECT. Değerlendirmeler: BL-129 ve BL-145 **bu dilime ait** (In scope); BL-076 **ait değil** (Out of scope, ortak API kapısı). BL-139 FB-6.5'in `weekly_preference_manager_scope` işini önden yapıyor (FOUNDATION-B'ye not düşüldü) ve `authz_check`'e dokunduğu için bu dilimin önkoşulu. Kullanıcıya dört soru (S1–S4), koordinatöre üç planlama kararı (P1–P3).
