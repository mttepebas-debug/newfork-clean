# CI-HIZ-2 — vardiya düzenleyici testi CI yükünde 5 sn bekler

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| Schedule (test) | EKRAN-01 CI-HIZ-2 | nf-test / ekran oturumu | R0 | inceleme yok (yalnız test) | 2026-10-06 |

## Sonrası için
- Kalıp: jsdom testinde `findBy` / `waitFor` varsayılanı 1 sn; CI'da check, db ve e2e aynı bilgisayarda koşarken yetmeyebiliyor. Dosya başında `configure({ asyncUtilTimeout: 5000 })` (App, ScheduleRequestsPage ve artık ShiftQuickEditor testleri).
- Öneri (koordinatöre): bu ayar üç dosyada tekrarlandı; `apps/web/vite.config.ts` `test.setupFiles` ile tek yere taşınabilir (`testTimeout: 20000` aynı gerekçeyle orada). Dosya nf-test'in değil.

## Rapor

**Karar:** R0, inceleme yok; dosyanın 55 testi yerelde geçti, web typecheck ve eslint temiz
**İzin:** R0 — gönderildi (commit `5884b5c0`)
**Risk:** 🟢 yalnız test dosyası; beklenti değişmedi, yalnız bekleme süresi
**Soru:** yok
**Sonraki:** ortak ayar önerisi (yukarıda); ProfilePage testinde aynı kalıp (4 yer), Schedule dışı olduğu için dokunulmadı

### 1. Nerede duruyor
Bitti, main'de.

### 2. Ne yapıldı
- **Önce:** Schedule → hücreye vardiya ekleme → kural uyarısı penceresi açıkken Esc testi, pencerenin kapanmasını 1 sn bekliyordu; CI'da 1181 ms sürdü ve main 37420857018 kırmızı oldu (tek başına 5/5 geçiyordu, web hattı ölçümü 06:05Z).
- **Sonra:** `apps/web/src/schedule/components/ShiftQuickEditor.test.tsx` başında `configure({ asyncUtilTimeout: 5000 })`; dosyadaki 9 pencere-kapanma beklemesinin hepsini kapsar. Beklenen sonuç aynı (pencere kapanır, düzenleyici açık kalır).
- Yakın Schedule testlerinde aynı kalıp (`waitFor` + `queryByRole("dialog") … toBeNull()`) başka dosyada yok; tarama `apps/web/src/**/*.test.tsx`.

### 3. Açık kalanlar
- `apps/web/src/account/ProfilePage.test.tsx` aynı kalıbı 4 yerde kullanıyor, `asyncUtilTimeout` yok. Schedule dışı; yük altında düşerse aynı düzeltme.

### 4. Ekranda ne değişti
Görünürde bir şey değişmedi.

### 5. Sırada ne var
- Ortak ayar önerisi (koordinatör kararı).
