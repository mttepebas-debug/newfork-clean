# BL-066 — Dark tema rollout teslimatı

2026-09-14 · local/main · görev `01a0a2bb-dbe4-7dc3-aef9-abd4cef27c60` · ana teslimat sahibi `01a08788-cdba-72f1-a2aa-9c61c296f5c4`.

**Görsel GO sonrası rollout uygulandı. Yerel hedefli test, typecheck, production bundle ve aşağıda belirtilen browser kontrolleri geçti.** Bu rapor Gate 1'in sonraki teslimatıdır; eski GATE-1.md tarihli kapı kanıtı olarak korunmuştur.

## Değişen ürün dosyaları

| Dosya | Son değişiklik |
|---|---|
| [styles.css](C:/Users/TheWe/Documents/Codex/newfork-clean/apps/web/src/styles.css:18749) | Gate 1 semantik renkleri document root dark scope'una taşındı; Catalog header/status tab ve Account eyebrow ortaklaştırıldı. Employees ve Preferences temsilci düzeltmeleri korundu. |
| [dark-theme.css](C:/Users/TheWe/Documents/Codex/newfork-clean/apps/web/src/dark-theme.css) | Eksik dark renk/state/portal karşılıkları. Bütün seçiciler `:root[data-theme="dark"]` altında; light/layout/font/spacing seçicisi eklenmedi. |
| [App.tsx](C:/Users/TheWe/Documents/Codex/newfork-clean/apps/web/src/App.tsx:15) | Dark düzeltme stylesheet import'u. |
| [theme.ts](C:/Users/TheWe/Documents/Codex/newfork-clean/apps/web/src/lib/theme.ts) | Mevcut applyThemePreference fonksiyonunun dar modüle alınması; System değişim dinleyicisi, saved preference cache'i, preview/persist ayrımı, HMR listener temizliği. |
| [supabase.ts](C:/Users/TheWe/Documents/Codex/newfork-clean/apps/web/src/lib/supabase.ts:597) | Eski applyThemePreference import adresini re-export ile korur. DB/API sözleşmesi değişmedi. |
| [AuthContext.tsx](C:/Users/TheWe/Documents/Codex/newfork-clean/apps/web/src/auth/AuthContext.tsx:370) | Kaydedilmiş account.theme değerini cache'ler. Aynı temayla gelen context refresh, kullanıcının kaydedilmemiş tema önizlemesini sıfırlamaz. |
| [index.html](C:/Users/TheWe/Documents/Codex/newfork-clean/apps/web/index.html:6) | React/account isteğinden önce saved/system temayı ve native color-scheme'i çözer. Cache yalnız `light/dark/system` tercihi içerir. |
| [theme.test.ts](C:/Users/TheWe/Documents/Codex/newfork-clean/apps/web/src/lib/theme.test.ts) | Preview cache ayrımı, System değişimi, storage engeli ve bootstrap matrisi için 7 test. |

## Kapsanan yüzeyler

- **Ortak:** Catalog/Account başlıkları ve status tabları, secondary/icon controls, placeholder/focus/invalid/autofill, auth loading/recovery, shared empty/error/success, sidebar flyout, native dialog ve Sonner'ın dört semantik tonu.
- **Yönetici:** Employees liste/drawer Profile/Employment/Access/History/Documents boş durum ve termination dialog; Workspace; Availability; Important Dates; Announcements liste ve gerçek CatalogDrawer editör portalı; Notifications; Requests.
- **Schedule:** Day/employee/total header metinleri; ayrı template yönetim ekranı, tablo/empty/error/rename renkleri; Time Entries helper/table/form/correction/status renkleri; Line Up'ın mevcut yeşil paletini koruyan dar link/status/empty düzeltmeleri. Sticky koordinat, grid ölçüsü veya kategori rengi değişmedi.
- **Settings/Account:** General, Locations, Jobs, Notifications, Scheduling, Shift Catalog, Documents, Acknowledgements, Support, Profile, Security, Workspaces ve kiosk cihaz/PIN/activity yönetimi. Account notification preferences WIP'ine dokunulmadı.
- **Anonim/özel akış:** Sign-in/sign-up, public trust ortak metadata/linkleri, bağımsız kiosk, owner/employee onboarding ve manager review CSS state karşılıkları. Explicit app Dark, OS Light iken de onboarding'e uygulanır.
- **Yeniden kullanılan kanıt/desen:** Ana task'ın Employee Demo Employee Hub / Shift Hub / My Availability görsel kabulü tekrar çalıştırılmadı. `--eh-*`, `--sx-*`, `--wt-*`, jobs ve Roles `light-dark()` paletleri korundu. Print/PDF/Line Up görsel export ve dev tasarım laboratuvarı yeniden boyanmadı.

## Yerel doğrulama

- `pnpm.cmd --filter @newfork/web test -- src/lib/theme.test.ts src/auth/AuthContext.test.tsx src/account/PreferencesPage.test.tsx src/views/MainNavigationHeaderContract.test.ts`: **19/19 PASS** (7 theme, 6 auth, 3 preferences, 3 header).
- `pnpm.cmd --filter @newfork/web typecheck`: **PASS**.
- Son CSS dahil `pnpm.cmd --filter @newfork/web exec vite build`: **PASS**, 2.319 modül. [Build log](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/build-final.log).
- Değişen tracked ürün dosyalarında `git diff --check`: **PASS**.
- Browser: mevcut 5555/5556 servisleri; desktop 1920×855, dar ekran 390×844, anonim IAB 1280×720. Yeni servis açılmadı.
- Notifications, Schedule, Notification Settings, Shift Catalog düzeltme sonrası görünür metin taramalarında sırasıyla **15/62/41/15 aday, eşik altında 0**. Employees Access/History/Documents empty, termination, Time Entries/form, Templates empty, Line Up, Announcements editor portal, Availability, Important Dates, Workspace ve Kiosk Settings Devices/Activity/PIN son örneklerinde de eşik altında görünür metin adayı kalmadı.
- Gerçek Sonner facade'ına developer çağrısıyla success/warning/error/info görsel örnekleri üretildi; business data veya notification inbox kaydı yazılmadı. Metin/state yüzeyleri kontrol edildi. Normal uygulama action delivery kanıtı olarak sayılmaz.
- Anonim sign-in/sign-up dark görüldü. OS media dark→light değişiminde System tercihinin **reload olmadan** data-theme ve color-scheme'i değiştirdiği doğrulandı. Bootstrap saved/system/invalid matrisi testte ayrıca geçiyor.
- Açılan employee termination, time entry ve announcement editor pencereleri **kaydetmeden kapatıldı**. Davet, çalışan/izin/kiosk/mesai verisi değiştirilmedi.

### Light regresyon kanıtı

- Gate 1: Preferences **111**, Employees **1.116**, drawer **1.246** öğede color/background/border/font/padding/margin/shadow ve x/y/width/height birebir eşti; bu kanıt yeniden çalıştırılmadı.
- Rollout öncesi/sonrası: Notifications **146**, Schedule **2.000**, Settings General **270**, Account Profile **98**, Public Privacy **74**, Kiosk **17** öğede aynı özellikler **birebir eş**: toplam **2.605** snapshot öğesi.
- Announcements ilk baseline'ı veri yüklenirken alınmıştı (136→207); bu yanlış eşleştirmeyi PASS saymadım. Yüklenmiş aynı 207 öğeli Light görünümde yeni stylesheet devre dışı + styles.css ek bloğu çıkarılmış kontrollü browser karşılaştırması **birebir eş**. Browser patch kontrolü sonrası sayfa yeniden yüklendi.
- Mobil Notifications Light: aynı yöntemle **36 öğe birebir eş**. Dark/Light ayrı snapshotlarında filtre satırı ve alt içerikte 15 px yükseklik/konum farkı gözlendi; bu karşılaştırma patch öncesi/sonrası kanıtı değildir ve cross-theme geometri eşitliği iddiası yapılmaz. Gerçek viewport ve document genişliği 390 px ölçüldü.
- Sayılar snapshot karşılaştırmasıdır; benzersiz component veya tüm ürün pixel certification sayısı değildir. [Ölçüm özeti](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-measurements.json).

## Seçilmiş son görseller

| Grup | Kanıt |
|---|---|
| Ana sayfalar | [Announcements](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-announcements-dark-final.png), [Notifications](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-notifications-dark-final.png), [Workspace](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-workspace-dark-final.png) |
| Availability / Important Dates | [Availability](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-availability-dark-final.png), [Important Dates](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-important-dates-dark-final.png) |
| Schedule ailesi | [Grid](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-schedule-dark-final.png), [Templates](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-templates-dark-final.png), [Line Up](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-lineup-dark-final.png), [Time Entries](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-time-entries-dark-final.png) |
| Form / portal | [Termination](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-termination-dark.png), [Access](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-access-dark.png), [Announcement editor](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-announcement-editor-dark.png), [Time entry](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-time-entry-dialog-dark.png) |
| Settings | [Notification Settings](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-notification-settings-dark-final.png), [Kiosk management](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-kiosk-settings-dark-final.png) |
| Auth / toast | [Sign-up](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-sign-up-dark.png), [Error toast](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-auth-toasts-dark.png), [Success](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-toast-success-dark.png), [Warning](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-toast-warning-dark.png), [Info](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-toast-info-dark.png) |
| Mobil | [Notifications Dark](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-notifications-mobile-dark.png), [Notifications Light](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-notifications-mobile-light.png), [Preferences Dark](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/rollout-preferences-mobile-dark.png) |

## Kanıt sınırları ve kapanış

- Gerçek davet/onboarding tamamlanması, manager-review dolu belge halleri, bütün employee rolleri, kiosk clock action ve her destructive/transient state canlı E2E olarak üretilmedi. Bu alanlarda mevcut component/CSS sözleşmesi genişletildi; erişim/veri değiştirilerek yapay kabul oluşturulmadı.
- Autofill için dark kuralı var; gerçek tarayıcı credential autofill popup'ı ve tüm işletim sistemi native select/date popup varyantları sınanmadı. Metin taraması görünür text/background adaylarını ölçer; gradient, tüm pseudo-element, focus sırası ve tüm grafikler için kapsamlı WCAG denetimi değildir.
- AA hedefi normal metin 4,5:1, büyük metin ve kontrol tanımlayan sınır 3:1. Token oranları Gate 1 raporunda. Bütün ürüne WCAG sertifikasyonu veya hosted/release-ready sonucu çıkarılmaz.
- Hesap tercihi **Light**, viewport **1920×855** geri yüklendi; anonim test tabı ve OS media override temizlendi. Geçici browser stylesheet kontrolleri reload ile kaldırıldı.
- Branch/worktree/commit/push/deploy yok. Notification Preferences WIP'i ve ortak WORK/ROADMAP/BACKLOG/REUSE/AGENTS dosyaları bu görev tarafından değiştirilmedi. Bu rapor ve görseller ignored `artifacts/bl066` altında.

## Ana task için dar REUSE güncellemesi

Tema kaydındaki kanonik fonksiyonu `lib/theme.ts / applyThemePreference` olarak düzeltmek yeterli; eski `lib/supabase.ts` yolu re-export ile geçerli. Preferences live preview/discard, AuthContext saved preference ve index.html pre-paint cache aynı sözleşmenin parçalarıdır. Semantik `--theme-*` renklerin tek kaynağı styles.css sonundaki root dark scope'udur; dark-theme.css istisna tüketicilerini içerir. Portal örneği Sonner ve CatalogDrawer. Değerleri/raporları haritaya kopyalamadan bu kaynaklara ve rapora bağlantı verilmesi yeterlidir.
