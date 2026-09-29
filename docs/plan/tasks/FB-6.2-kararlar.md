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

## T5b'ye kalan (.5–.6)
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
