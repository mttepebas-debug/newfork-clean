# nf-planlama — FB-6.2 T5b main'de: kapanışlar ve yeniden ölçüm (2026-09-30)

Dal `task/backlog-program-23`, taban `origin/main` `da8e3dc0`, commit **`9f34b774`** (push yok).

## 1. Nerede duruyor
Bitti, bir yer tutucuyla: main CI numarası `<run>` (G7 satırı, FB-6.2 Notes ve 11 kapanış satırı). Açık madde 234 → **223**.

## 2. Ne yapıldı (etkisi)
**Kapandı 11** (her biri ana daldaki kodla ya da yerel DB `prosrc` ile doğrulandı; T5b'nin 10 migration'ı ortak DB'de):
| Madde | Commit | Kanıt |
|---|---|---|
| BL-129 ikinci admin matriste | `0b892691` (T5a) | `authorization_matrix.test.sql:34-35`, `:138` |
| BL-130 eylem listesi iki yönlü | `0b892691` (T5a) | `authz_catalog.test.sql:95-100` |
| BL-270 admin→admin erişim kaldırma, fail-open | `ff72421d` | `20260930130000…:838`, bekçi `:137` (oturumsuz dal yok) |
| BL-317 owner ve eş yöneticiler görünür | `4d430d6c` + `d1deb396` | `manager-hidden-peers` açığı yok; `allowed` |
| BL-242 davet rol kuralı tek | `54fcb24a` | `prosrc`: `can_invite_with_role`; `actor_role <> 'owner'` 0 |
| BL-155 hafta listesi çekirdekten | `6da64b3b` | `20260930162000…:23-29` |
| BL-354 Hub retleri, bilinmeyen talep | `6da64b3b` | `:192`, `:206`, `:214-231` |
| BL-099 yetki kısmı (madde kapandı) | `d1f9d5ac` | `prosrc`: `employee.decide_preferred_name` |
| BL-187 owner kendi lokasyonunu siler | `27c9a8c8` | GF satırından da çıktı |
| BL-243 çekmece yalnız okuyabilene | `ceef6945` | `scheduleGates.ts:22`, `AvailabilityPage.tsx:82` |
| BL-365 erişim-yok kartı | `d1deb396` | `EmployeeDrawer.tsx:971-975` |

**Kısmen:** BL-133 (`delete_catalog_entity_service` tamam; `activate_…` FB-6.6), BL-176 (açılış + Workspace tamam; `PermissionRoute.tsx:35`,
`SettingsHomeRedirect.tsx:5-14` FB-6.8), BL-276 ((4) `all_locations` 0 + CHECK, `70c6d392`; (5) sayaç tavanı 176; (1)(2)(3) başka dilimlerde).

**Yeniden ölçüm (T5b sonrası, yerel DB SELECT):**
- **BL-387 değişmiş:** `membership_location_scopes` okuyan 21 → **13**; 4'ü "yalnız yönetir" tablosunu da okuyor; görmeyen **9** maddede adıyla.
- **BL-388 geçerli:** `remove_employee_from_location_service` (`20260930120000…:617`) ve `terminate_employee_service` (`20260930130000…:636`)
  lokasyonun saat dilimiyle hesaplıyor, taslağa dokunmuyor. `terminate_employee` yarısı ilk kez ölçüldü.
- **BL-401 geçerli:** `20260930140000…:225` 42501 `authz.rank`, `:228` P0002.

**Kayıtlar:** G7 satırı (T5b main'de + sırada `.7b`/`.8`/`.9`/`.10`/`.11`, BL-405 önce), FB-6.2 Notes, DONE.md satırı (etki cümlesi).

## 3. Açık kalan ve nedeni
- Main CI numarası `<run>`: koordinatör verecek; `gh run view <run> --json headSha,conclusion,jobs` ile doğrulayıp dolduracağım.
- **Gözlem (dokunulmadı):** BL-242'nin bloğunda ona ait olmayan iki not vardı ("tek eşik 720px… BL-240", "BL-239 ile birlikte") —
  büyük olasılıkla BL-241'in notları yanlış yere düşmüş; blokla birlikte "Kapanan maddeler"e taşındı. İstenirse G0 turunda yerine alınır.

## 4. Ekranda ne değişti
Görünürde bir şey değişmedi (yalnız `docs/plan`).

## 5. Sırada ne var
- **BL-405 artık acil olabilir:** `.7a` main'de (`da8e3dc0`); Vercel main'i yayına alıyorsa ve canlı DB'de T5a/T5b migration'ları
  yoksa canlıda Employees çekmecesi şu an 500 veriyor olabilir (OPS-03 sırası: önce canlı gönderim). Canlı durumu ben ölçmedim.
- `<run>` numarası gelince yer tutucular.
- FB-6.2 `.7b`: BL-413, BL-414 görev metnine; `.8`: BL-402, BL-403 (+ BL-409, BL-410 adayı).

## Kanıt
- `python say.py .`: `acik 223 numarali 194 numarasiz 29 program 223 kopya []`, farklar/kesişim boş, en yüksek BL-414.
- `git diff --stat da8e3dc0 9f34b774`: BACKLOG.md, DONE.md, BACKLOG-PROGRAM.md, FB-6.2.md.

## Ek — main CI (ikinci commit, `42e84565`)
- T5b main CI **36618282202** (`da8e3dc0`) `check`, `db`, `e2e` yeşil — `gh run view` ile doğrulandı. Yer tutucular dolduruldu: 11 kapanış satırı (BACKLOG), G7 satırı ve Notes (BACKLOG-PROGRAM), FB-6.2 Notes. Eski turların Notes metnindeki `<run>` sözleri geçmiş kaydı, dokunulmadı.
