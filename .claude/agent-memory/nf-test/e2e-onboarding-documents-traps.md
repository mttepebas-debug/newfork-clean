---
name: e2e-onboarding-documents-traps
description: onboarding ve belge e2e tuzakları — signIn beklemiyor, Manager rolünde belge yetkisi yok, sihirbaz kendisi yönleniyor, select etiketi, owner'da birincil yok, e2e dosya filtresi geçmiyor
metadata:
  type: reference
---

2026-10-04, nf-test oturumu `local_863130bd…` (FB-6.6 A3; main `3ec4985c`, `d84fc7f4`).

1. Dünyanın `signIn` yardımcısı (`e2e/fixtures/world.ts`) girişin bitmesini beklemiyor; hemen `goto` yapılırsa giriş ekranında kalınır. Ardından `await expect(page).not.toHaveURL(/\/sign-in/)` ya da `e2e/fixtures/documents.ts` `signInAs`.
2. Yerleşik Manager rolünde belge yetkisi yok (yalnız `employee_onboarding.review`; BL-560). Müdürün belge kararını sınayan senaryo `documentManagerRole()` ile kurulur; yoksa her "hayır" `authz.missing_permission`'dan gelir, test yanlış nedenle geçer. Bir "evet" kontrolü 403'lerin anlamını kanıtlar.
3. Onboarding sihirbazı her kayıttan sonra kendisi, gecikmeli yönlenir (profil → kart, kart → `/review`, Skip → `/review`). DB'yi beklemek yetmez, sihirbazın gittiği adres beklenir. Main CI 37152119602'nin kırmızısı buydu; yerelde yeşil, CI'da iki runner'da kırmızıydı.
4. `getByLabel` bir `<select>`'i saran etikette çalışmaz (etiket metnine seçenekler girer): `getByRole("combobox", { name })`.
5. Owner'ın iki lokasyon ataması var, hiçbiri birincil değil; süreli belge saat dilimini birincilden alır (BL-559). Senaryo birincili test süresince verir, sonunda geri alır.
6. `pnpm.cmd e2e -- <dosyalar>` bütün paketi koşturur (filtre geçmiyor); tek dosya: `e2e` klasöründe `npx playwright test flows/<dosya>`.
7. Settings → Documents satırları `div`, tablo satırı değil. "Decision saved" onaydan sonra her zaman görünmüyor (BL-561); karar ve yayın durumu DB'den beklenir.
