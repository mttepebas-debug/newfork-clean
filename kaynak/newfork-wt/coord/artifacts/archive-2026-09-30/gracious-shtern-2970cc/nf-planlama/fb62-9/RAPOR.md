# nf-planlama — FB-6.2.9 main'de (2026-09-30)

Dal `task/backlog-program-25`, taban `origin/main` `af2ef900`, commit **`df2a5893`** (push yok).

## 1. Nerede duruyor
Bitti, bir yer tutucuyla: main CI 36620542304 sonucu `<run>` (G7 satırı, BL-368 notu, FB-6.2 Notes, program Notes). Açık madde 223 → 224.

## 2. Ne yapıldı (etkisi)
- **FB-6.2 `.9` bitti** (FB-6.2 Notes): `roles_permissions_rls` 53/53, `ci-green.txt:141` (ana dalda doğrulandı) → Done when 1 tamam;
  #35'in nedeni T5b'de değişti; tavanlar ve `known_gap` hedefte (işçi ölçümü). `.9` G7'nin "Sırada" listesinden çıktı.
- **BL-368:** bu dosyanın kırmızısı kapandı; `ci-not-green.txt` 12 → **11** dosya (ana dalda sayıldı).
- **BL-262:** kısmen kapandı; açık `weekly_team_availability`, `scheduling_settings_shift_types_rls`.
- **BL-226 tazelik:** geçerli — kimlik taklidi satırları yeniden yazılan dosyada duruyor (`:85`, `:108`, `:129`, `:136`, `:145`, `:156`).
- **Arşiv öncesi tarama:** işçinin iki yan notu kayıtsızdı → **BL-415 (low / safe), G12, `nf-test`:** eskimiş hücre adı
  (`roles_permissions_rls.test.sql:45` "Owner explicitly authorizes Admin") ve ret hücrelerinde `authz.*` ipucu kontrolü yok
  (`throws_ok` 18, `authz.` 0). Rapordaki öteki her şey kayıtta.
- **G7 satırı:** `.9` main'de + KK-35: `.7b` `nf-backend` + `.7b-db` `nf-db` sürüyor.

## 3. Açık kalan ve nedeni
- Main CI 36620542304 `<run>`: koordinatör verecek, `gh run view` ile doğrulayıp dolduracağım.

## 4. Ekranda ne değişti
Görünürde bir şey değişmedi (yalnız `docs/plan`).

## 5. Sırada ne var
- `<run>` numarası; `.7b` / `.7b-db` raporları.

## Kanıt
- `python say.py .`: `acik 224 numarali 195 numarasiz 29 program 224 kopya []`, en yüksek BL-415.
- `grep -n roles_permissions_rls supabase/tests/ci-green.txt` → `:141`; `ci-not-green.txt` 11 dosya satırı.
