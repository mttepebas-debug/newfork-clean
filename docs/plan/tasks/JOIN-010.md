# JOIN-010 Uyelikten cikarma kendi durumunu alir
Status: draft
Session: -   Branch: task/join-010   Worktree: yok   DB: KILIT

Plan ID'leri: M3, S14, E7 (tamamlayici)

Goal: "Erisimin alindi" uyelik durumunda kendi adiyla dursun, `suspended` + snapshot kombinasyonuyla degil.

## Bugunku hal (JOIN-006 olcumu)
- `remove_employee_access_service` uyeligi `suspended` yapiyor ve `employee_access_snapshots`'a geri alinabilir bir kayit yaziyor. Restore ozelligi buna dayaniyor.
- `suspended` ayni anda uc sey demek: workspace askida, erisim alindi, workspace kapandi (kapanis da uyelikleri `suspended` yapiyor).
- JOIN-002'de `membership_status`'a `removed` eklendi ama **hicbir sey yazmiyor**. JOIN-006 durumu `access_removed` bayragiyla yuzeye cikardi; bu gecici bir ayrim.

In scope:
- `remove_employee_access_service` `removed` yazar; snapshot ve restore yolu korunur.
- `'suspended'` gecen 9 fonksiyon taranir; en az su dordu `removed`'i de kabul etmeli: `accept_employee_invitation_for_user` (yeniden ise alim), `enforce_membership_role_change` (ayni gecis), restore yolu, `list_my_workspaces`.
- RLS yardimcilari `status = 'active'` kontrol ettigi icin etkilenmez; yine de `pg_proc.prosrc` taramasi yapilir (JOIN-002 dersi).
- `access_removed` bayragi `membership_status = 'removed'` okumasina iner; UI degismez.
- pgTAP: erisim kaldirma `removed` yazar; restore `active`'e dondurur; `removed` uyelikle yeni davet kabul edilebilir; `removed` hesap workspace verisini goremez.

Out of scope: `invited` enum degerinin temizligi (BL-071).
Done when: yukaridaki pgTAP'ler PASS, `test:db`'de yeni kirmizi yok, UI davranisi ayni kalir.
Touches: `supabase/migrations/*`, dokuz fonksiyondan etkilenenler, `list_my_workspaces`, `packages/shared`.
Risk: durum semantigi degisikligi; JOIN-002 ayni sinifta bir regresyon uretti. Once tarama, sonra degisiklik, her adimda pgTAP.

## Notes / Result
