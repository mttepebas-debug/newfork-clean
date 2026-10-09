# nf-guvenlik — EMP-001 B birleşik dalı (R3)

**ONAY @dd230072**

Kritik ya da Yüksek bulgu yok. Bir Orta bulgu var (E1): kod hatası değil, canlıya gönderim
sırasıyla ilgili; main'e almadan önce karar ister. İki Düşük bulgu var (E2, E3); engelleyici değil.

İncelenen: yerel ve `origin/task/emp-001-b-all` @`dd230072`, taban `origin/main` `c064ea57`,
11 commit, 48 dosya. Fark: `git diff origin/main...task/emp-001-b-all`. Tarih 2026-09-30.
Kararlar veri olarak alındı: K4 (Remote olmayan her müdürün en az bir lokasyonu olur), iki yeni eylem,
kayıt yolunda `employee.location_required`'ın önce cevap vermesi.

## Yöntem
Migration dosyasındaki son tanım her zaman canlı gövde olmuyor. Bu yüzden ortak yerel
veritabanından (main ile aynı, son migration `20260930190000`) 15 fonksiyonun canlı gövdesini
`pg_get_functiondef` ile aldım ve dalın iki migration'ındaki gövdelerle `diff -w` yaptım. Yalnız
okuma yaptım; migration uygulamadım, kilit gerekmedi.

## 1. Kapsam ve tenant izolasyonu: genişleyen dal yok

| Fonksiyon | Canlıya göre fark |
|---|---|
| `app_private.actor` | Müdür için `manages := state.works`. "Yalnız yönetir" birleşimi çıktı. Owner ve admin dalı ile `works` hesabı aynı. |
| `app_private.authz_check` | Kişi hedefinin yerleri yalnız atamalar; `union all … membership_managed_locations` çıktı. Başka satır değişmedi. |
| `schedule_actor_can_manage_service`, `…_can_publish_service`, `…_has_capability_service`, `communication_actor_has_capability_service` | Dördünde yalnız `or exists (… membership_managed_locations …)` dalı çıktı. |
| `get_employee_detail_service` | `managed_locations` anahtarı ve `allowed.set_managed_locations` çıktı. `private_contact`, `removable`, `invite` kuralı ve eksik eylem satırı reddi aynen duruyor. |
| `list_employees_service` | `managed_location_names` sütunu çıktı; kapı ve satır süzgeci aynı. |
| `update_employee_membership_role_service` | "Yönetilen lokasyonlar gitti" kaydı çıktı; rol güncellemesinden sonra K4 çağrısı eklendi. Kapı (`authorize_role_grant`) aynı. |

- Hepsi daralma. Müdürün kapsamı artık her yolda yalnız atamalarından geliyor.
- `scope_set` değişmedi (`actor()`'ı okuyor).
- Silinen tabloyu ya da yardımcıyı anan başka canlı fonksiyon kalmıyor. `pg_proc` taramasında
  11 fonksiyon çıktı; hepsi bu migration'da yeniden tanımlanıyor ya da siliniyor. 12'ncisi
  `tests.manages`, kurucuda siliniyor.

## 2. Altı rotanın kapısı kalktı: hepsi çekirdeğe soruyor

`apps/api/src/employees/employee-directory-routes.ts`: dosya içi `authorize()` yardımcısı silindi,
dosyada `resolveWorkspaceAuthorization` kalmadı.

| Rota | Çağırdığı fonksiyon | Çekirdek sorusu |
|---|---|---|
| GET `preferred-name-approval` | `get_employee_name_settings_service` | `authorize('settings.people.read')` (yeni; migration 2) |
| PUT `preferred-name-approval` | `set_employee_name_settings_service` | `authorize('settings.people')` (migration 2) |
| PUT `employees/:id/preferred-name` | `request_employee_preferred_name_service` | `authorize('employee.request_preferred_name', kişi)` (main'de) |
| GET `preferred-names/pending` | `list_pending_preferred_names_service` | `actor` + `authz_check('employee.decide_preferred_name')`, satır satır (main'de) |
| POST `preferred-names/:id/decision` | `decide_employee_preferred_name_service` | `authorize('employee.decide_preferred_name', …)` (main'de) |
| PUT `employees/:id/emergency-contact` | `save_own_employment_contact_service` | `authorize('employee.save_own_contact', kişi)` (yeni; migration 2) |

- **Dosyadaki öteki rotalar:** 18 RPC'nin hepsini canlı veritabanında kontrol ettim; her biri
  `authorize`, `authz_check` ya da `authorize_role_grant` içeriyor. Tek istisna
  `get_own_employee_avatar_path_service` (`/me/avatar`): kişinin kendi fotoğrafı, rotada üyelik
  kontrolü duruyor, bu işin kapsamında değil.
- **Üye olmayan** 404 `authz.not_member` alıyor (`resolveActor`). Çekirdek retleri 403 + `authz.*`
  (`rpcFailure`). Rota testleri: 6 rota × 3 durum.
- **Bilinmeyen ve kapsam dışı hedef aynı cevabı alıyor (BL-444).** `employee.save_own_contact`
  `own` sınıfında; bilinmeyen kişi, başka workspace'in kişisi ve başkasının kaydı `authz_check`'te
  `out_of_scope` alıyor. Eski `P0002` "kayıt yok" cevabı kalktı. pgTAP'ta üç hücre.
- **Fark bilinçli.** Eski rota kapıları `employees.read` / `employees.manage` izni, aktif üyelik ve
  bitmiş kurulum istiyordu. Şimdi kararı eylemin kendi kuralı veriyor. Tek genişleme: kendi acil
  durum kişisini ve kendi tercih edilen ad talebini yazmak artık `employees.read` izni istemiyor.
  Bunlar yalnız kişinin kendi kaydı ve onboarding'deki kişi de yazıyor (`restricted_ok`,
  KK-32 (b)). Başkasının verisine açılan yol yok.

## 3. Grant, SECURITY DEFINER, fail-open

- `app_private.keep_manager_at_a_location`: `security definer`, `search_path = ''`, `stable`;
  `public`, `anon` ve `authenticated`'dan geri alınmış. Yalnız okuyor ve reddediyor.
- `list_employees_service` drop + create. Hemen ardından `public`, `anon` ve `authenticated`
  yetkisi geri alınıyor, `service_role`'e veriliyor (`m1:756-757`).
- Öteki fonksiyonlar `create or replace`; imza ve dönüş tipi aynı, yetkiler korunuyor. Hepsinde
  `SECURITY DEFINER` ve `search_path ''` var. CI'da `browser_privileges` ok.
- **Fail-open yok.** Detay ve listede eksik eylem satırı 22023 (D5 duruyor). K4 yardımcısı
  bilinmeyen ya da arşivli kayıtta sessizce dönüyor. Bu bir izin kararı değil; yardımcıdan önce
  `authorize` zaten geçmiş oluyor.

## 4. K4 yardımcısı: dört yazma yolunda, yetkiden sonra

| Yol | Sıra |
|---|---|
| `save_employee_service` | `authorize` → doğrulama → yazmalar → yardımcı (son satır) |
| `remove_employee_from_location_service` | `authorize` → "orada çalışmıyor" reddi → atama bitişi → yardımcı |
| `update_employee_membership_role_service` | `authorize_role_grant` → rol güncellemesi → yardımcı |
| `prepare_employee_invitation_service` | `authorize` → rol kontrolü (`can_invite_with_role`) → yardımcı (`becoming = rolün sınıfı`) |

- Dördünde de yetki önce. Yetkisiz kişi "bu müdürün başka lokasyonu yok" bilgisini alamıyor.
- Ret işlemi geri alıyor. `create_employee_command_service` kayıt ve davet adımlarını tek işlemde
  çağırdığı için yarım kayıt kalmıyor.
- Rol sınıfı sonradan değiştirilemiyor: `save_workspace_role_service` "Existing role experience
  cannot change" diyor. Bu yoldan atlama yok.
- Yardımcının atlandığı yollar E2'de.

## 5. Web

- `managerLocationRefusal(roleClass, record)` saf fonksiyon. Çekmece rol sınıfını
  `references.inviteRoles` içinden `detail.role_id` ile buluyor, yani gösterilen rolden. İstemciden
  gelen bir bayrak yok.
- `employeeInputSchema`'ya alan eklenmedi (yalnız yorum). Payload aynı.
- Eklenen satırlarda `permissions.includes`, `membership.role` ya da `role_name ===` yok (farkta grep: 0).
- Kural yalnız ekran ipucu; kararı veritabanı veriyor.
- `ProfilePage`: acil durum kişisi reddinde `authz.not_active` / `authz.workspace_closed` ayrı
  cümle alıyor; sunucunun cümlesi ekrana çıkmıyor.

## 6. Katalog, emekli nesneler, matris, testler

- **Katalog:** `authz_catalog` sabit listesi 75 eylem; sayaçların üst sınırı değişmedi.
  `authorization_coverage`'da üç sınıf güncellendi.
- **Emekli nesneler:** `retired_objects_stay_gone` yedi nesneyi ve iki yeni türü (`action`,
  `constraint`) tutuyor.
- **Matris dökümü:** `authorization-matrix.expected.json` 75 eylem, 17 kişi, 4182 hücre; `manages`
  alanı ve `employee.set_managed_locations` yok. TS ikizinde eylem listesi 75. İkizin yeni satırı
  ("kendi eylemi başkasının kaydında olmaz", kısıtlı dalından önce) SQL `authz_check`'in `own`
  dalıyla aynı sonucu veriyor.
- **Beklentisi gevşetilen test yok:**
  - `own_employment_record`: çalışanı kurulumu bitmemiş workspace'e koyuyordu; artık kurulum
    bitiriliyor. Kod aynı (42501), cümle "Not allowed".
  - `owner_employee_record`: yalnız cümle değişti.
  - Matriste `pl:ayse@K` → `pl:can@K`: tek lokasyonlu müdürün çıkarılması artık kayıt kuralıyla
    (22023) reddediliyor. İzin hücresi iki lokasyonlu müdüre taşındı; K4'ün kendisi
    `a_manager_manages_where_they_are_assigned`'da sınanıyor.
  - KK-33 "bilinen boşluk" hücresi `passes` oldu (sıkılaşma).
- **Kalan adlar:** `apps`, `packages`, `e2e` içinde kalan tek `managed-locations` satırı "rota yok,
  404" testi (kabul edilmiş).

## 7. Migration'lar

- **Veri kaybı** yalnız bilerek silinen `membership_managed_locations`; yerelde 1 satır var.
- **Sıra doğru:** önce çekirdek ve okumalar tabloyu anmayacak biçimde yeniden tanımlanıyor, sonda
  tablo düşüyor.
- **Kısıt** `workspace_memberships_id_workspace_id_role_key`'i yalnız silinen tablonun
  `…_manager_fkey`'i kullanıyor (`pg_constraint`'te doğrulandı). `(id, workspace_id)` anahtarını
  kullanan beş yabancı anahtar etkilenmiyor.
- **Kilit:** `drop table` ve `alter table workspace_memberships drop constraint` kısa süreli tam
  kilit alır; canlı kullanıcı yok, risk yok.

## 8. Kapsam kayması, sır

- Kapsam dışı değişiklik yok. `dump-authorization-matrix.ts`'e `AUTHZ_MATRIX_PRELUDE` eklendi:
  araç, geri alınan işlemde koşuyor, üretim koduna girmiyor.
- Sır yok. e2e'deki `tokenOf`, `invite.spec.ts`'ten `world.ts`'e taşındı; aynı test parolası.

## Bulgular

**E1 — Orta (operasyon; kod değişikliği istemez, main'den önce karar ister): canlıya gönderim
sırası OPS-03'ün tersi olmalı.**
- OPS-03 "önce migration, sonra main" diyor, çünkü eski kod fazla alanı yok sayar. Bu iş alan
  siliyor. Bugün yayında olan kod `managed_location_names`, `managed_locations` ve
  `allowed.set_managed_locations` alanlarını zorunlu tutuyor (`packages/shared/src/index.ts`
  main'de `:2519`, `:2595`, `:2646`).
- Senaryo: migration canlıya önce giderse, yeni kod yayına girene kadar Employees listesi ve
  çekmecesi 500 verir (API'de zod parse).
- Ters sıra güvenli: yeni kod eski veritabanıyla çalışır. Fazla alanları zod atar. Kapısı kalkan
  altı rotanın eski fonksiyonları kendi kapılarını taşıyor: `service_actor_has_permission` ve
  "kayıt senin mi" kuralı.
- Öneri: bu iş için önce main (Vercel yayına alır), sonra canlı `db push`. Ya da canlı kullanıcı
  olmadığı için kısa kırılma bilerek kabul edilir. Hangisi seçilirse seçilsin, kullanıcıya
  gönderim komutu verilirken söylenmeli.
- Ortak yerel DB için kural aynen geçerli: iki migration ve kod aynı pencerede.

**E2 — Düşük (engelleyici değil): K4'ün atlanabildiği iki yol daha var.**
Yardımcı, hesabı bağlı olmayan kayıtta (`becoming` yokken) ve arşivli kayıtta sessizce dönüyor.
- (a) **Bekleyen müdür daveti.** Lokasyonu olan kişi Manager rolüyle davet edilir (K4 geçer).
  Kabulden önce admin "Remove from <lokasyon>" der ya da kaydı "Exclude from schedule" ile
  lokasyonsuz kaydeder; kayıtta hesap yok, yardımcı döner. Kişi daveti kabul eder
  (`app_private.accept_employee_invitation_for_user` yardımcıyı çağırmıyor) ve lokasyonsuz müdür
  olur.
- (b) **Arşivden dönüş.** Müdür arşivlenir, arşivliyken son lokasyonu biter, "restore access" ile
  geri açılır (`set_employee_archived_service` rolü anlık kayıttan geri yazıyor, yardımcıyı
  çağırmıyor).
- (c) Lokasyon silme ve arşivleme: bilinen, backlog'da.
- Etki: müdür hiçbir yeri yönetemez (kapalı kalır, sızıntı yok). Bir sonraki kayıtta çekmece
  lokasyon ister.
- Öneri: davet kabulünde ve erişim geri açmada aynı yardımcıyı çağırmak. (c) ile aynı backlog
  maddesine yazılabilir (`nf-db`).

**E3 — Düşük (süreç): migration adları bir gün ileride.**
- `20261001000000` ve `20261001010000`; bugün 2026-09-30.
- Bu dal girdikten sonra bugünün tarihiyle (`20260930…`) açılan bir migration sıralamada bunların
  önüne düşer; `supabase db push` ve yerel `migration up` sırasız migration'ı reddeder.
- Bugün böyle bir dal yok: bütün yerel ve uzak dallarda `20260930190000`'dan yeni migration yalnız
  bu ikisi (ölçüm 2026-09-30).
- Kural: bundan sonraki her migration `20261001010000`'dan büyük olmalı. G8a (BL-132) için
  `nf-db`'ye söylenmeli.

## Öneri (bulgu değil)
- `/me/avatar` rotası hâlâ `resolveWorkspaceMembership` ile kendi üyelik kontrolünü yapıyor
  (`nf-backend`'in notu). İzin kapısı değil; çekirdeğe çevrilmesi ayrı madde.
- K4 yardımcısı `holder.class is distinct from 'manager'` yazıyor. `authz_catalog`'un rütbe
  sayacı bu yazımı görmüyor (BL-416, bilinen). Yardımcı sınıfı çekirdekten (`actor()`) alıyor;
  kendi rol okuması yok.
- KARARLAR'daki "yalnız yönetir" satırları (M2 "Manager'ın lokasyonları", KK-29, DATA notları) bu
  dalla birlikte güncellenmeli; dal `docs/plan`'a dokunmuyor.
- Bu iş yetki çekirdeği, migration ve veri silme içeriyor; CLAUDE.md §5'e göre kullanıcıya
  ultrareview önerisi uygun.

## Kanıt
- `git diff --stat origin/main...task/emp-001-b-all` → 48 dosya, +6189 / −3606.
- 15 fonksiyon için canlı gövde ile migration gövdesi `diff -w` (yukarıdaki tablolar).
- Canlı veritabanında salt okunur sorgular:
  - API'nin çağırdığı 18 RPC'nin çekirdek çağrısı (`pg_proc.prosrc`).
  - `workspace_memberships`'e bağlı yabancı anahtarlar.
  - Silinen tabloyu anan fonksiyonlar.
  - Atama ve rol yazan fonksiyonlar (E2).
- Bütün dallarda yeni migration taraması (E3).
- Dalın CI koşusu `36717250687` (`headSha dd230072`): check, db ve e2e **success**.
  - pgTAP `Files=144, Tests=12054, Result: PASS`; `a_manager_manages_where_they_are_assigned`,
    `name_settings_and_own_contact_ask_the_core`, `authz_catalog`, `retired_objects_stay_gone` ve
    `browser_privileges` ok.
  - vitest: shared 185, api 1035.
  - "TODO passed: 12-13" `management_owner_job` dosyasından; bu dalın değil, önceki koşularda da var.
- Yerelde test koşturmadım ve migration denemedim; aynı commit'te CI yeşil, iddiaların hiçbiri
  ölçüm gerektirmedi.
