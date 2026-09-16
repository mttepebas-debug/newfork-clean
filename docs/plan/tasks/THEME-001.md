# THEME-001 Dark temayı emekliye ayır
Status: active
Session: -   Branch: task/theme-001   Worktree: newfork-wt/theme-001   DB: yok
Öneri: Opus 5, medium. Çok dosyalı ama mekanik silme; seçicileri doğru ayırmak dikkat istiyor.

Goal: Uygulama yalnızca light temada çalışsın. Dark tema seçeneği ve dark'a özel CSS kaldırılsın; light görünüm değişmesin.

Karar (kullanıcı, 2026-09-16): dark tema emekliye ayrılıyor. Birincil ve tek tema light (BL-066 dark rollout'u geri alınır).

Mevcut dokunma noktaları:
- `lib/theme.ts` (`applyThemePreference`), `lib/supabase.ts` re-export'u
- `index.html` pre-paint çözümlemesi
- `auth/AuthContext.tsx` tema cache'i
- `account/PreferencesPage.tsx` tema seçici
- `dark-theme.css` (328 satır)
- `styles.css` içinde ~668 `:root[data-theme="dark"]` kuralı
- ~20 sayfa ya da bileşen css'inde dark blokları
- shared `themePreferenceSchema` (system/light/dark)

In scope:
- Preferences'tan tema seçimi kaldırılır.
- `applyThemePreference` her durumda light uygular. `data-theme` ya "light" olur ya da hiç yazılmaz; `color-scheme: light` olur.
- `index.html` pre-paint'i sadeleşir.
- `dark-theme.css` silinir ve importu kaldırılır.
- Tüm css dosyalarında yalnızca dark'a özel kurallar silinir (`:root[data-theme="dark"] ...`, `@media (prefers-color-scheme: dark)`). Light ile paylaşılan seçici listelerinden yalnızca dark parçası çıkarılır.
- Shared şema ve DB kolonu geriye uyumlu kalır: kayıtlı "dark" ya da "system" değerleri okunabilir ama light olarak uygulanır. Migration yok. Save payload'u artık tema göndermiyorsa API sözleşmesi bozulmamalı.
- İlgili testler güncellenir (theme.test, AuthContext.test, Preferences testleri).
- REUSE UI-05 girdisi için önerilen metin rapora yazılır (koordinatör günceller).

Out of scope:
- Light renklerin yeniden tasarımı ve token işi (THEME-002).
- DB migration.
- Diğer tercihler.

Done when:
- Uygulamada dark'a geçmenin hiçbir yolu yok. OS dark modda iken bile uygulama light görünüyor.
- `grep -r 'data-theme="dark"'` ve `prefers-color-scheme: dark` web kaynağında 0 sonuç veriyor (testler hariç, gerekçesi yazılı olanlar dışında).
- Light görünüm değişmedi: temsilî 6 sayfada önce/sonra görsel karşılaştırması (Schedule, Employees, Settings > General, Account > Preferences, Employee Hub, Announcements).
- Web typecheck, ilgili testler ve build PASS.

Touches: `apps/web/src/**/*.css`, `lib/theme.ts`, `index.html`, `AuthContext.tsx`, `PreferencesPage.tsx`, ilgili testler.

Test plan: silme bittikten sonra web typecheck, tema/preferences/auth testleri ve build bir kez; ardından 6 sayfada light görsel karşılaştırması.

Risk:
- Karışık seçici listelerinde light kuralını yanlışlıkla silmek. Bu yüzden görsel karşılaştırma zorunlu.
- Açık branch'lerde (EXP, OPS-012) dark kuralı eklenmiş olabilir; rebase sırasında onlar da temizlenir.

## Notes / Result
