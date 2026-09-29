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

## T5b'ye kalan (.4–.6)
- `.4`: S3 + admin'in yönettiği lokasyon komutu; BL-270 (tetikleyicinin fail-open dalı; `employees_on_the_core`'daki
  TODO hücresi); dört köprü; `admin-own-record`, `manager-cannot-change-employee-role`, KK-24'ün P0002'si,
  `terminate-needs-location`, `managed-only-cannot-save`.
- `.5`: davet (`manager-cannot-invite`), BL-242, `:152`.
- `.6`: P1, ad onayı (`preferred-name-not-on-core`, KK-17 owner hücresi), BL-155, BL-354 (üç servis), BL-133,
  üç yardımcının silinmesi. BL-145 G11'in (koordinatör, 2026-09-29) — dokunma.
- Test koşucusu notu: ortak DB'ye kalıcı iz bırakmadan koşmak için migration + `builder.sql` + test dosyası tek
  transaction'da, test dosyasının `rollback`'i hepsini geri alır. Migration'da `update` deferred belge tetikleyicisini
  kuyruğa alırsa `alter table` öncesi `set constraints public.document_assignment_changed immediate`.
