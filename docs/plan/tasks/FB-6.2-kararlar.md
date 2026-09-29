# FB-6.2 Dal A — yürütme kararları ve devir notu

Dal `task/fb62-core-a`, `nf-db` işçisi. Plan: `FB-6.2.md`. Bu dosya planın değil, yürütmenin kaydı:
alt adımlar arasında taşınan işler ve T5b'yi devralanın bilmesi gerekenler.

## T5a (.0b–.3) — 2026-09-29/30
- `.0b` koşuldu: `roles_permissions_rls` 42/47 (#3, #7, #30, #35, #46 — 09-28 ile aynı), `employee_hub` 13/13. Hüküm geçerli.
- KK-24 (koordinatör, 2026-09-29): admin başka admin'in kaydını düzenlemez. Matris `expected()` buna göre;
  bugün giriş P0002 ile reddediyor, "hayır" sözleşmesine (42501 + `authz.rank`) `.4`'te çekilecek.
- `.2`'den `.4`'e taşınanlar (gerekçe: rol servisi ve kaydetme `.4`'te yeniden yazılıyor; tetikleyicide işlemi
  yapanı okumak yasak kalıp `request.jwt.claim`/`auth.uid()` isterdi):
  - S3: rol manager'ın altına düşünce `membership_managed_locations` satırları aynı işlemde silinir + denetim kaydı.
  - Admin'in "yalnız yönetir" lokasyonu ekleme/kaldırma komutu (yeni eylem ya da mevcut bir eylem; matris satırıyla).
    `.2`'de test verisi `tests.manages()` ile doğrudan yazılıyor.
- `.2`'de yapılan ek: `all_locations` kısıtı (Done when 5) — `app_private.enforce_role_location_scope` çalışan için
  `false` yazıyor, `workspace_memberships_employee_not_all_locations` CHECK.
- Eski dört lokasyon yardımcısı (`schedule_actor_can_manage/publish/has_capability`, `communication_actor_has_capability`)
  `membership_managed_locations`'ı da sayıyor. `membership_location_scopes` görünümü (21 fonksiyon okuyor, bir kısmı
  "çalıştığı yer" anlamında) bilerek değiştirilmedi: yönetici vardiyaya sızmasın diye.
- Matrise eklenen bilinen açıklar (T5b'de kapanmalı; yoksa Done when 2'nin 4 hedefi tutmaz):
  `admin-removes-admin-access` (`.4`, BL-270), `terminate-needs-location` (`.4`: lokasyonsuz kişi işten çıkarılamıyor,
  22023 saat dilimi), `managed-only-cannot-save` (`.4`: `save_employee` eski `can_manage_employee_record`'a soruyor),
  `preferred-name-not-on-core` (`.6`). `time-off-needs-location` satırına Selin eklendi (FB-6.3'ün).
- `employee_create_command` #39: yöneticinin lokasyonsuz taslağı artık okunamıyor (M2). Aynı dosyadaki
  "scoped manager can create a remote draft" (`:152`) `.5`'te reddedilmeli (matris: yönetici lokasyonsuz kayıt açamaz).
- Sayaçlar (T5a sonu, geri alınan koşuda ölçüldü): `request.jwt.claim` 41, `auth.uid` politikası 10, ipuçsuz 42501 253,
  `auth.uid()` 32, kapsam/rütbe 59, `_base` 13, ertelenmiş 10.

## T5b `.4` — 2026-09-30 (dal `task/fb62-core-a-t5b`, `6180c7cd` kırmızı, `0886ea48` migration, `914d6dd8` testler)
- Migration `20260930130000_employees_writes_ask_the_core.sql`. Kaydet, arşiv, işten çıkarma, erişim kaldırma, rol,
  fotoğraf silme `authorize` ile başlar; `save_employee`, `set_employee_archived`, `terminate_employee`,
  `can_assign_employee_locations` ve `employee_access_snapshots.all_locations/location_ids` (okuyan yoktu) silindi
  (`retired_objects_stay_gone`). Matriste beş açık kapandı; 7931 ok / 0 not ok (geri alınan deneme).
- Kararlar (`nf-guvenlik`'e):
  - **BL-270 tetikleyicisi:** "kimse oturumda değilse geç" dalı yok. Rol, `role_id`, `user_id` değişimi, askıdan/onboarding'den
    aktife geçiş ve ekleme ancak şunlarla geçer: satıra özel izin `app.membership_change = <membership id>` (çekirdeğe
    sormuş servis koyar: rol servisi, erişim geri verme, onboarding aktivasyonu), davet kabulü bayrağı, devir bayrağı
    (devir satırları), workspace'in ilk üyeliği (kurucu). Askıya alma serbest (erişim vermez). **Veritabanı sahibi
    oturumu muaf** (`current_setting('role') in ('none','postgres')`: migration, seed, 80+ test dosyası doğrudan
    yazıyor; tetikleyiciyi zaten kapatabilir). API `service_role`, tarayıcı `authenticated` → denetlenir. Sonuç:
    pgTAP'te servisler `postgres` olarak koşarken izin unutulsa görünmez; bu yüzden `employees_on_the_core`
    yazıcıları `pg_temp.as_api` (service_role) ile de koşuyor. Yeni bir üyelik yazıcısı eklenirse aynısı yapılmalı.
  - Onboarding aktivasyonu (`activate_employee_onboarding_case_service`) JWT kimliğini silip açık kapıdan geçiyordu;
    artık satırını söylüyor (jwt sayacı −1).
  - `employee.set_managed_locations` (yeni eylem, `cross`, `employees.manage`, rank_below, no_self) ve
    `set_employee_managed_locations_service` (listeyi yerine koyar, denetim kaydı `employee.managed_locations_changed`).
    Hedef yönetici değilse 22023 `employee.not_a_manager`. Matriste yeni hedef türü `manager` (mgr:ayse/mehmet/selin).
  - D2: `membership_managed_locations.role` (= 'manager' CHECK) + FK (membership, workspace, role) → yalnız yöneticide
    satır. S3: `managed_locations_follow_role` tetikleyicisi rol yöneticiden düşünce satırları siler; rol servisi
    denetim kaydına `managed_locations_removed` yazar.
  - Erişimi geri vermek (`restore_access`) `employee.remove_access` kuralıyla; fotoğraf silme `employee.save`.
  - Kaydetmenin yeni kayıt yolu (`target_employee_id` null, create komutu kullanıyor) `employee.create` ile ve
    lokasyonlarla sorar: yönetici lokasyonsuz kayıt açamaz → `employee_create_command` `:152` `.4`'te kapandı.
  - Tercih edilen ad çekmeceden değişmez (önceden de servis mevcut adı geri yazıyordu); yalnız talep/onayla.
- Sayaçlar (geri alınan deneme, ortak DB): `auth.uid()` 32→27, jwt 41→36, kapsam/rütbe 59→52, ipuçsuz 42501 251→226
  (tavanlar bu değerlerde). Web ikizi: `authorization.ts` + döküm (4029 hücre; döküm ortak DB'den eylem listesini
  okuduğu için geçici kopyada yeni eylem aynı işlemde eklendi).
- Tam `test:db` (147 dosya, her biri migration + builder + test tek işlemde, geri alındı): yeşil listedeki 8 dosya eski
  ret biçimini/kuralını sabitlemişti, bugünkü kurala çekildi (`914d6dd8`). Yeşil dışı dosyalarda kırmızı main ile aynı
  (`roles_permissions_rls` #31 yeni kırmızıydı, düzeltildi; kalan #3/#7/#30/#35/#46 `.9`'un).
- Test tuzakları: tetikleyici bayrakları (`app.employee_invitation_accept`, `app.owner_transfer`) test işleminde açık
  kalıyordu; `tests.settle` artık temizliyor. `role` kolonu `role_id`'den türer: yalnız `role`'ü değiştiren UPDATE
  etkisizdir. `service_role` hiçbir tabloyu okuyamaz: değerleri çağıranda hesapla.
- Deneme düzeneği (tekrar kurulabilir): her test dosyası için `begin;` + migration + `supabase/test-support/builder.sql`
  + test dosyası (ilk `begin;` satırı atılmış) → `docker exec -i supabase_db_newfork-clean psql -U postgres -X -q -At`;
  dosyanın `rollback`'i hepsini geri alır. `-At` şart (yoksa satırlar boşlukla başlar). `db.lock` partiler hâlinde
  (30 dosya ≈ 3–4 dk).

## T5b `.5` ve `.6`'nın ad onayı — 2026-09-30 (dal `task/fb62-core-a-t5b-2`, taban `098a7611`)
Commit'ler: `7c51a5da`, `0daa29b4`, `8154f47b` kırmızı; `0855d86a` `.5` migration; `a731ba31` kırmızı; `7da01f9e` ad
onayı migration'ı. Migration'lar `20260930140000_invitations_ask_the_core.sql`, `20260930150000_preferred_names_ask_the_core.sql`.
- **`.5` (BL-242, `manager-cannot-invite` kapandı).** Kararlar (`nf-guvenlik`'e):
  - Tek rol kuralı `app_private.can_invite_with_role`: verilen rolün rütbesi verenin rütbesinin altında
    (`authz_rank`), owner rolü kimsenin değil; ayrıca `employee.create` verenin kendi yerlerinde (`actor().manages`)
    çekirdekten geçmeli (hiçbir yerde çalışmayan/yönetmeyen yönetici kimseyi eklemez). `employee_access.manage`
    artık sorulmuyor. Okuyanlar: create komutu (yalnız tekrar denemede), hazırlama, bağlantı kopyalama, tekrar
    deneme, jeton saklama, teslim işaretleme, iptal, çekmecenin rol seçicisi (`read_employee_references_service`).
  - Gönderilmiş davete dokunan her servis (kopyala, tekrar dene, jeton sakla, teslim işaretle, iptal)
    `employee.invite`'ı davetin kişisiyle sorar **ve** davetin rolünü verebilir olmayı ister: yönetici,
    lokasyonundaki bir admin davetinin bağlantısını alamaz (`authz.rank`). Kimliğiyle bilinen davet bilinmiyorsa
    `target_person => null` → `authz.out_of_scope` (kapsam dışıyla aynı cevap).
  - Teslim işaretleme ve iptal kapsama alındı (görev listesinde yoktu): API her gönderimden sonra işaretliyor;
    eski izne bağlı kalsaydı yöneticinin daveti yarım kalırdı.
  - Owner kurulumunun dört servisi `workspace.setup` ile. **Bulunan açık:** liste ve işaretleme servisleri
    `actor_role <> 'owner'` ile soruyordu; üyeliği olmayan kişide `null <> 'owner'` null → ret yok, liste açılıyordu.
    Artık `authz.not_member`.
  - Küçük davranış farkları: create komutunda `command_id` boşsa 22023 (önce 42501); bağlantı kopyalama olay
    özeti "Invitation link copied" (önce "... by an administrator").
  - Eski kuralı sabitleyen hücreler bugünkü kurala çekildi: `employee_directory_rls` (yönetici davet hazırlar,
    olay sayısı 5→6), `employee_references_ask_the_core` (yönetici employee rolleri okur),
    `employee_create_command` (ret metinleri, yöneticiye verilen `employee_access.manage` satırı silindi).
- **`.6` ad onayı (BL-099 yetki yarısı, KK-17, `preferred-name-not-on-core` kapandı).** Onay `employee.decide_preferred_name`'i
  talebin kişisiyle, **kilitten önce** sorar (önce kilitsiz okuma, sonra `for update`); başka workspace'in ve bilinmeyen
  talep `authz.out_of_scope`. Liste satır satır `authz_check`. KK-17 kuralla: talepte önce karar verebilecekler
  hesaplanır, kimse yoksa (owner'ın kendi talebi) talep beklemez. `preferred_name_approval`'daki "owner kendi adını
  onaylar" hücresi buna çekildi.
- Sayaçlar (geri alınan deneme, `7da01f9e`): jwt 36→32, kapsam/rütbe 52→47, ipuçsuz 42501 226→205; `auth.uid()` 27,
  politika 10, `_base` 13, ertelenmiş 10 değişmedi. Tavanlar bu değerlerde.
- Tam `test:db` (149 dosya, her biri `.4`+`.5`+ad migration'ı + builder + test tek işlemde, geri alındı): yeşil listedeki
  137 dosyanın hepsi yeşil (yeni iki dosya listeye eklendi). Kırmızı 12 dosya yeşil listede değil ve sonuçları dalın
  önceki hâliyle (`.4`) birebir aynı: dalın getirdiği kırmızı 0. Matris 7986 ok, kalan 74 TODO başka adımların açıkları.
- **API (Dal B `.7b`):** `apps/api/src/app.ts` davet rotaları (`:549`, `:598`, `:644`, `:699` civarı) hâlâ
  `employee_access.manage` iznini kapı olarak soruyor; yönetici daveti API'de `.7b`'ye kadar 403 alır. Veritabanı hazır.

## `.4` güvenlik düzeltmesi — 2026-09-30 (`nf-guvenlik` DEĞİŞİKLİK İSTENİYOR @`098a7611`)
Kırmızı `d5d2610f`, düzeltme `67e24b14` — `20260930130000` dosyasının içinde (hiçbir DB'ye uygulanmamıştı).
- Y1: erişimi geri verme, snapshot'taki rolü rol servisiyle aynı kurala sorar (`app_private.authorize_role_grant`,
  rol servisi de onu çağırıyor; ikinci kopya yok), hedef geri açılan üyeliğin kullanıcısı (`target_user`); kaydın
  hesabı ayrılmışsa ya da üyeliğin kullanıcısı değilse 22023 "employee has no linked workspace account".
- O1: davet kabulü bayrağı yalnız yeni `pending_activation` satırı ya da `suspended → pending_activation` (owner değil);
  devir bayrağı yalnız bekleyen devrin iki satırında admin→owner / owner→admin, ikisi de aktif, devrin hedef hesabı
  için. Rol sınıfı `role_id`'den okunuyor (kapsam sayacı artmasın diye `.role` karşılaştırması yok).
- Düşük: muafiyet `session_user = 'postgres' and current_setting('role') in ('none','postgres')` (yalnız `session_user`
  testlerin `as_api` kalıbını da muaf sayardı). `memberships_update_manager` / `memberships_delete_manager` silindi,
  `retired_objects_stay_gone`'da.

## T5b `.6` kalanı + O-2 — 2026-09-30 (dal `task/fb62-core-a-t5b-3`, taban `5b2fb0d7`)
Migration'lar: `20260930160000_jobs_ask_the_core`, `…161000_the_dashboard_asks_the_core`,
`…162000_refusals_answer_alike`, `…163000_the_old_person_helper_goes`; O-2 ve D-c düzeltmesi `20260930140000`'in
içinde (hiçbir DB'ye uygulanmadı). Testler: yeni `people_behind_the_catalog_ask_the_core`, `refusals_answer_alike`
(ikisi `ci-green.txt`'te), `invitations_on_the_core`'a O-2 hücresi.
- **P1 iş katalogu (5):** Assign çekmecesi ve iş sayıları `employee.list` ile (M2: yönetici lokasyonundaki owner/admin'i
  salt okunur görür, "yalnız yönetir" kişisi KK-29'la görünür); iş atama kişi kişi `employee.save` (rütbe altı; admin
  başka admin'in işini değiştirmez, KK-24). `app_private.job_assignment_candidates` imzası `(actor, w, job)` oldu;
  okuyan iki servis (`read_job_assignments_service`, `read_new_…`) de jwt yazmıyor. Yardımcı:
  `app_private.authorize_employee_list` (liste kalıbı, `list_employees_service` ile aynı).
- **BL-187 kapandı:** lokasyon silme `settings.locations.write` (org/write: owner/admin; yönetici `authz.missing_permission`
  ya da izni varsa `out_of_scope`). Kişi kişi kontrol **kaldırıldı**: silen, orada çalışan herkesin (kendisi ve başka
  admin dahil) atamasını bitirir (Ç3 "owner/admin her lokasyonu siler"). İş silme `settings.jobs.write` + işteki herkes
  için `employee.save` (eskisi gibi). Vardiya tipi/etiket silme `settings.jobs.write` kuralını
  `settings.shift_catalog.manage` izniyle kullanıyor (ayrı eylem FB-6.8'de; `ponytail:` notu migration'da).
- **P1 pano (3):** to-do kişisi `employee.read`; Workspace home sayıları `scope_set('schedule.read' / 'requests.read')`
  (yalnız yönettiği lokasyon da sayılır; izni olmayan sayıyı 0 görür). Kapı ipuçlu (`app_private.authorize_workspace_todos`).
- **BL-155:** hafta listesi `scope_set('schedule.read')`, arşivli lokasyon eskisi gibi dışarıda.
- **BL-354:** Hub kapısı `not_member`/`not_active`/`workspace_closed`/kaydı yoksa `out_of_scope`. Karar, önizleme,
  kısaltma: `app_private.authorize_time_off_request` kilitten önce; bilinmeyen/başka workspace'in talebi kapsam dışıyla
  **aynı** cevap (`Not allowed` / `authz.out_of_scope` / detail `time_off.decide`). `time_off_partial_period_decisions`
  hücresi (başka workspace P0002) buna çekildi.
- **Ad talebi (D-a):** `employee.request_preferred_name` (own) ile; başkasının/bilinmeyen kayıt `out_of_scope`, askıdaki
  üyelik `not_active`, kapalı workspace `workspace_closed`, belge engeli `document_blocked` (kuralın `restricted_ok=false`'u:
  onboarding'deki kişi de talep açamaz — davranış farkı, ürün kuralı çekirdekte böyle). `preferred_name_approval`
  dünyası taslak workspace'te çalışan kuruyordu (ürün üretemez) → workspace `active` yapıldı; ret metni `Not allowed`.
- **O-2 kapandı:** hazırlama, iptal edeceği her bekleyen davet için `can_invite_with_role(davetin rolü)`; biri bile
  verilemiyorsa 42501 `authz.rank` (detail `employee.invite`). **D-c:** jeton saklama ve teslim işaretleme önce kilitsiz
  okur, çekirdeğe sorar, sonra `for update`.
- **Silinen:** `can_access_employee` (public + app_private) → `retired_objects_stay_gone`; `browser_privileges` izin
  listesinden çıktı; `employee_create_command` son satırı `authz_reason`'a. `authz_catalog`'a 10. kontrol:
  `service_actor_can_access_employee`'yi yalnız 15 belge/onboarding fonksiyonu çağırır (liste yalnız küçülür).
- Sayaçlar (geri alınan deneme, ortak DB): `auth.uid()` 27→25, jwt 32→26, kapsam/rütbe 47→43, ipuçsuz 42501 205→177;
  politika 10, `_base` 13, ertelenmiş 10 değişmedi. Tavanlar bu değerlerde.
- **Kalan (sıradaki işçiye):** koordinatör kararı (a) 2026-09-30: `review_employee_onboarding_before_availability_service`'in
  iki satırı (`set_config` jwt + `can_manage_employee_record`) → `app_private.authorize(actor, w, 'onboarding.review',
  target_person => target_employee_id)`; `can_manage_employee_record` silinir + `retired_objects_stay_gone`. **Şart:** önce
  kilitleyen hücre (owner/admin/o lokasyonun yöneticisi başlatır; başka lokasyonun yöneticisi, çalışan, yabancı workspace,
  bilinmeyen kişi hayır, `authz.*` ipucuyla); eski yardımcıyla farklı cevap veren hücre çıkarsa **dur ve koordinatöre
  bildir**. Dikkat: eski kural manager'a yalnız `access_class='employee'` hedefi veriyordu; `onboarding.review` rank_below +
  no_self — owner kendi kaydı ve admin→admin farkı olabilir, ölç. `invitations_on_the_core.test.sql` `can_manage_employee_record`'u
  anıyor (kontrol et). Fonksiyonun geri kalanı FB-6.6'da. Böylece Done when 3 tamamlanır.
- **T5b-4 onboarding satırı kapandı (2026-09-30):** `20260930170000_onboarding_review_asks_the_core.sql` iki satırı
  `app_private.authorize(…, 'onboarding.review', target_person => …)` ile değiştirdi, `can_manage_employee_record` silindi
  (başka çağıranı yoktu) → `retired_objects_stay_gone`. Kilit `onboarding_review_on_the_core.test.sql` (17 hücre). İzin/ret
  kümesi eskiyle aynı; retler artık nedenini söylüyor. Tek fark hücre 5: yalnız yöneten yönetici (KK-29) çekirdekten geçer,
  FB-6.6'nın `service_actor_can_access_employee` satırında `P0002` alır (önce ipuçsuz 42501) — KK-33, FOUNDATION-B FB-6.6
  satırına not. Sayaçlar: auth.uid 25→24, jwt 26→25, kapsam/rütbe 43→42, ipuçsuz 42501 177→176.
- Deneme düzeneği aynı (bkz. `.4` notu); scratchpad'deki `t.sh` = dalın uygulanmamış migration'ları + ek migration'lar +
  builder + test tek işlemde.

## T5b'ye kalan (.6'nın geri kalanı) — 2026-09-30 ölçümü (`.4` uygulanmış geri alınan işlemde)
- **P1 + üç yardımcının silinmesi.** `can_access_employee` (public + app_private) çağıranları: `delete_catalog_entity_service`,
  `delete_job_with_assignments_service`, `app_private.job_assignment_candidates`, `organization_job_counts_service`,
  `update_job_assignments_service`. `can_manage_employee_record` çağıranları (`.5` sonrası): aynı dört iş katalogu
  fonksiyonu + `review_employee_onboarding_before_availability_service` (yalnız o satır değişir, FB-6.6'nın).
  Pano: `get_workspace_dashboard_service`, `create_workspace_todo_service`, `resolve_workspace_todo_service`
  (`service_actor_can_access_employee` çağırıyorlar). BL-187 `delete_catalog_entity_service` taşınırken kapanır.
  `employee_create_command.test.sql` son satırı `can_access_employee`'yi çağırıyor: silinirken değiştirilmeli.
- **BL-155, BL-354, BL-133, `service_actor_can_access_employee` çağıran listesini sabitleyen kontrol** — ölçüm
  `FB-6.2.md` G7 tablosunda; dokunulmadı.
- **Yolda bulunan:** `request_employee_preferred_name_service` başkasının kaydında 42501 + `employee.not_yours`
  (authz dışı ipucu) veriyor; "hayır" sözleşmesine göre `authz.*` olmalı. İş açılmadı.

## (eski) T5b'ye kalan (.5–.6) — `.5` ve ad onayı yukarıda kapandı
- `.5`: davet (`manager-cannot-invite`), BL-242. `create_employee_command_service` hâlâ `service_actor_has_permission`
  (`employees.manage` + `employee_access.manage`) ve `can_invite_with_role`; dört davet köprüsü
  (`prepare_employee_invitation_service`, `load_employee_invitation_link_service`, `load_employee_invitation_retry_service`,
  `store_employee_invitation_delivery_secret_service`) `can_manage_employee_record` çağırıyor. `employee_create_command`
  `:152` sonrası "yönetici yönetici sınıfı rol veremez" hücresi lokasyonsuz yöneticiyle anlamsızlaştı (`914d6dd8`'de
  "works nowhere creates nobody" oldu); `.5`'te lokasyonu olan yöneticiyle `authz.rank` hücresi yazılmalı.
- `.6`: P1, ad onayı (`preferred-name-not-on-core`, KK-17 owner hücresi), BL-155, BL-354 (üç servis), BL-133,
  üç yardımcının silinmesi. BL-145 G11'in (koordinatör, 2026-09-29) — dokunma.
- Test koşucusu notu: ortak DB'ye kalıcı iz bırakmadan koşmak için migration + `builder.sql` + test dosyası tek
  transaction'da, test dosyasının `rollback`'i hepsini geri alır. Migration'da `update` deferred belge tetikleyicisini
  kuyruğa alırsa `alter table` öncesi `set constraints public.document_assignment_changed immediate`.
