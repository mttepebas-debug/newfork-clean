# BL-066 — İlk görsel kapı

2026-09-14 · local/main · başlangıç `fc2c4da` · teslimat sahibi ana session `01a08788-cdba-72f1-a2aa-9c61c296f5c4`.

**Üç temsilci hazır; geniş rollout yapılmadı. Kullanıcının görsel GO kararı bekleniyor.**

## Patch ve sınır

- Tek ürün dosyası: [styles.css:18749](C:/Users/TheWe/Documents/Codex/newfork-clean/apps/web/src/styles.css:18749), sonundaki `BL-066 visual gate` bölümü (194 ek satır).
- Etki: `.employees-page` altındaki liste/drawer ve yalnız Preferences açıkken Account. Diğer sayfaları boyayan global kural eklenmedi.
- Mevcut yeşil yüzeyler, primary button, tablo/sticky düzeni ve çalışan dark componentler korundu. Header, yardımcı metin, durum rozetleri, kontrol sınırları, selected/hover/focus, empty/error, drawer notice ve secondary button renk gapleri tamamlandı.
- Light seçicileri, React davranışı, veri/API, font, spacing ve layout değiştirilmedi. Yeni branch/worktree, commit/push/deploy yok.
- Notifications WIP ve ortak WORK/ROADMAP/BACKLOG/REUSE/AGENTS dosyaları değiştirilmedi. `artifacts/bl066` Git tarafından ignore ediliyor; inceleme kanıtı burada.
- Browser incelemesi mevcut 5555/5556 servislerini kullandı. Hesabın başlangıçtaki **Light** tercihi iş sonunda geri yüklendi; viewport override kaldırıldı.

## Görsel örnekler

Canlı: [Employees](http://127.0.0.1:5555/app/employees), [Preferences](http://127.0.0.1:5555/account/preferences). Drawer, Employees satırından açılır. Preferences > Dark ile önizleme yapılabilir.

| Yüzey | Dark önce | Dark sonra | Light önce / sonra | 390px dark |
|---|---|---|---|---|
| Employees | [Önce](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/employees-dark-before.png) | [Sonra](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/employees-dark-after.png) | [Önce](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/employees-light-before.png) / [Sonra](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/employees-light-after.png) | [Mobil](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/employees-dark-mobile.png) |
| Preferences | [Önce](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/preferences-dark-before.png) | [Sonra](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/preferences-dark-after.png) | [Önce](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/preferences-light-before.png) / [Sonra](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/preferences-light-after.png) | [Mobil](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/preferences-dark-mobile.png) |
| Employee drawer | [Önce](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/drawer-dark-before.png) | [Sonra](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/drawer-dark-after.png) | [Önce](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/drawer-light-before.png) / [Sonra](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/drawer-light-after.png) | [Mobil](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/drawer-dark-mobile.png) |

Ek kanıt: [Kolon menüsü](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/columns-dark.png), [boş arama](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/employees-empty-dark.png), [Employment](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/employment-dark-after.png).

## Semantik renk sözleşmesi

Kanonik değerler yalnız CSS içindeki scoped `--theme-*` değişkenlerinde. Mevcut dark paletteki renkler yeniden kullanıldı; aşağıdaki tablo kullanım sözleşmesidir.

| Anlam | Kaynak sembol | Kullanım / ölçülen kontrast |
|---|---|---|
| Ana metin | `--theme-text` | Mevcut yeşil drawer/tablo zemini: **12,53:1** |
| Yardımcı metin | `--theme-muted` | Seçili yeşil zeminde **5,01:1**; opacity ile soldurulmaz |
| Seçim / focus | `--theme-accent`, `--theme-selected` | Radio kartı, focus; seçili zeminde **6,56:1** |
| Kontrol / ayırıcı | `--theme-control-border`, `--theme-divider` | Kontrol tanımlayan sınır **4,26:1**; dekoratif ayırıcı daha sakin |
| Success | `--theme-success`, `--theme-success-surface` | Aktif/success ve restore: **7,85:1** |
| Warning | `--theme-warning`, `--theme-warning-surface` | Invited/onboarding ve mevcut remote warning anlamı: **8,85:1** |
| Error / destructive | `--theme-danger`, `--theme-danger-surface` | Error, validation, terminate: **7,40:1** |
| Info | `--theme-info`, `--theme-info-surface` | Drawer bilgi notice: **7,88:1** |
| Disabled / readonly | Mevcut component kuralı | Disabled davranış/opacity korunur; readonly aktif metin gibi okunur |

AA hedefi: normal metin 4,5:1; büyük metin ve kontrol tanımlayan grafik/sınırlar 3:1. Kaynak: [W3C metin kontrastı](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [W3C non-text](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Logo/dekorasyon ve disabled istisnaları genel PASS iddiasına çevrilmedi.

## Yerel kanıt

- Light öncesi/sonrası **Preferences 111, Employees 1.116, drawer 1.246 DOM öğesinde** computed color/background/border/font/padding/margin/shadow ve x/y/width/height birebir aynı. Toplam 2.473 karşılaştırma; bu üç snapshot içindeki tekrar eden öğeleri de kapsar, 2.473 benzersiz component demek değildir.
- Dark browser örneklerinde görünür normal metin: Preferences, liste, drawer Profile/Employment, kolon menüsü ve empty state ölçümleri hedefi geçti. Liste taramasındaki tek düşük aday, görsel olarak gizli `.sr-only` label; görünür text failure olarak sayılmadı.
- Önceki Employees başlığı 1,04:1; Preferences kart açıklaması 2,85:1 idi. İkisi düzeltildi.
- Desktop 1920×855; 390×844 dark örnekleri saklandı. Mobil drawer/document genişliği 390px ölçüldü. Mobil light öncesi/sonrası karşılaştırması bu kapıda yapılmadı.
- `pnpm.cmd --filter @newfork/web test -- src/views/MainNavigationHeaderContract.test.ts src/account/AccountPageHeaderContract.test.ts`: **4/4 PASS**. `git diff --check -- apps/web/src/styles.css`: PASS.
- [Ölçüm özeti](C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/bl066/measurements.json). Metin taraması aday üretir; gradient, ancestor clipping/opacity, native popup, tüm transient state ve bütün ürün AA sertifikasyonu değildir. Özellikle Schedule kapalı menü öğelerinin ham aday sayısı failure sayısı olarak kullanılmamalı.

## Ürün yüzeyleri — ilk audit sınıflandırması

Route envanteri `App.tsx`; sınıflandırma mevcut kod ve aşağıda belirtilen browser örneklerine dayanır. **PASS yalnız belirtilen yüzey/durum için geçerlidir.** State ve rol derinliği geniş rollout kabulünde tamamlanacak.

| Yüzey / route grubu | Sınıf | Bulgu, kanıt ve kalan iş |
|---|---|---|
| Employees liste, Profile/Employment drawer, Preferences | PASS — temsilci | Scoped patch ve yukarıdaki yerel kanıt. Drawer Availability/Documents/Access/History, create ve lifecycle modalları henüz tam kabul değil. |
| Workspace | Ortak tema sorunu | Browser başlık/eyebrow/link düşük kontrast; Catalog header yeni sınıfları eski dark seçicilerle eşleşmiyor. |
| Availability | Ortak tema sorunu | Browser status tab 2,54:1; `weekly-team.css` tokenları zaten dark uyumlu, ortak toolbar/header ayrı. |
| Announcements / detail, Notifications / Account inbox, Important Dates, Requests | Ortak tema sorunu | Catalog header/status tab tüketicileri. `jobs-settings.css`, `requests-catalog.css` ve notification-shift-details doğru dark temelini içeriyor; sayfa istisnaları GO sonrası. |
| Schedule grid / export route / templates | Sayfaya özel istisna | Browser day/total header metinleri koyu zeminde koyu kaldı; kapsamlı mevcut dark override korunmalı. Bazı filtre check adayları görünürlük doğrulaması istiyor. Sticky/scroll geometriye dokunulmaz. |
| Line Up ve modalları | Sayfaya özel istisna | `lineup.css` yerel token/dark deseni mevcut. Global normalize edilmez; semantik action/overlay kalıntıları grup kabulünde incelenir. |
| Time Entries / correction dialog | Ortak tema sorunu | styles.css dark tablo/form temelini içeriyor; muted, shared error ve controls değerlendirmesi kalıyor. Browser bu kapıda açılmadı. |
| Settings Roles | PASS — görülen panel | Browser seçili rol görünümünde 32 metin adayı hedefi geçti. `roles-settings.css` `light-dark()` deseni korunur. Diğer roller ve destructive dialoglar henüz kabul değil. |
| Settings General | Ortak tema sorunu | Browser yardımcı paragraflar 3,49:1, ikincil metin 2,32:1. |
| Settings Locations, Jobs, Notifications, Scheduling, Shift Catalog, Documents, Acknowledgements, Kiosk Settings, Support | Ortak tema sorunu | Mevcut Settings header/form/rail ve jobs/notifications yerel dark kodu var. Shared error/secondary button/low-contrast helper ve modal tüketicileri ayrı kabul bekliyor. |
| Account Notifications | Ortak tema sorunu | Mevcut WIP korundu. Browser sayfa gövdesi görülen durumda okunur; ortak account-eyebrow 2,34:1. |
| Account Profile, Security, Workspaces, recovery | Ortak tema sorunu | Account temel dark kodu mevcut; global error/success, confirmation/crop/native dialog yüzeyleri ve shared eyebrow gapleri kalıyor. |
| Organization switcher / no organization / pending / suspended | Ortak tema sorunu | Workspace list ve genel auth/status componentlerini kullanıyor; shared fallback/error token tüketicileri GO sonrası. |
| Public privacy, terms, accessibility, contact, privacy choices | Sayfaya özel istisna | Privacy browser: metadata ~3,36:1, uyarı ~2,53:1. Shared public trust dark gövdesi mevcut; link/metadata/status istisnaları var. Brand/logo adayını otomatik ihlal sayma. |
| Sign-in / sign-up / accept invite / pending invitations | Ortak tema sorunu | Auth panel dark tabanı var; form-error, secondary button ve ilk yükleme tema çözümü ortak gap. Oturumsuz browser kabulü henüz yok; owner oturumu değiştirilmedi. |
| Owner onboarding | Ortak tema sorunu | Header/input dark tabanı var; summary/check/success state gibi light yüzeyler ayrı taranmalı. Gerçek akış browser kabulü bekliyor. |
| Employee onboarding / manager review | Sayfaya özel istisna | Dark CSS yalnız OS `prefers-color-scheme: dark` altında. OS light + explicit app dark kombinasyonunda kaçıyor. İlk eski palet ayrıca daha mavi; mevcut yeşil sözleşmeyle eşleştirme GO sonrası. |
| Employee dashboard / more / team / time off / exchanges / offers | Sayfaya özel istisna | `--eh-*`, `--sx-*`, employee-team/weekly-preferences yerel dark karşılıkları mevcut; time-off sınırları ve nested state audit bekliyor. Owner ile employee-hub isteği Workspace'e yönlendi; employee oturum kabulü yapılmadı. |
| Public kiosk setup / directory / action / loading | Sayfaya özel istisna | `kiosk-page` ailesi light hardcode ağırlıklı; özel dark seti bulunmadı. Cihaz kaydı/clock action çalıştırılmadı. |
| Genel toast, dialog, dropdown, tooltip | Ortak tema sorunu | Sonner `.newfork-toast` dört tonu light renklerde; eski `.schedule-toast` dark kuralı Sonner'ı kapsamıyor. Portal/native dialog kendi token scope'una ihtiyaç duyabilir. Kolon popover ve drawer bu kapıda görüldü. |
| First paint, system preference change, autofill, native controls | Ortak tema sorunu | `applyThemePreference` data-theme + colorScheme set ediyor (mevcut doğru kaynak). `index.html` ilk paint bootstrap yok; hesap async yükleniyor. Sistem değişimini dinleyen ortak listener yok. Autofill özel CSS yok; browser gerçek autofill/OS kombinasyonları bekliyor. |
| Loading/skeleton/empty, sticky/table/scrollbar/shadow | Ortak tema sorunu | `.auth-loading` light; scoped Employees empty düzeltildi. Native color-scheme scrollbar mevcut; custom sticky/header ve skeleton her ailenin tokenıyla kontrol edilmeli. |
| Logo/avatar/image | PASS — görülen temsilci | Account foto/logo dosyası filtrelenmedi; employee initials yalnız CSS renkleriyle eşlendi. Missing-image/özel marka varyantları ve upload/crop ayrı state kabulü. |
| Print/PDF/Line Up görsel export, dev design lab | Kapsam dışı | Export sabit beyaz kağıt yüzeyi; `lineup-visual-preview` açıkça `color-scheme: light`. Dev lab ürün dark rollout'una dahil değil. |
| High-contrast toggle, bağımsız layout/iş akışı sorunları | Kapsam dışı | Talimat gereği uygulanmadı. Employee rolüne erişim sınırlaması tema koduyla aşılmadı. |

## REUSE için ana session'a öneri

- **Theme resolution:** `apps/web/src/lib/supabase.ts` / `applyThemePreference`; `PreferencesPage.tsx` canlı önizleme + discard/cleanup sözleşmesi. Bu davranışı yeni theme provider ile kopyalamamak gerekir.
- **Catalog dark gap:** `CatalogPageHeader.tsx`, `styles.css` / `.catalog-page-header`, `.catalog-page-eyebrow`, `.catalog-status-tabs`. Örnek Employees. Sınır: mevcut `employees-header` dark kuralı yeni ortak header'ı kapsamıyor; GO sonrası ortaklaştırılacak parça bu.
- **Semantic state palette:** `styles.css` / `BL-066 visual gate`, scoped `--theme-*`. Örnek Employees state + Preferences helper/focus. Sınır: şu an üç temsilciyle sınırlı; global tasarım sistemi kabulü değil. Portal tüketicilerde scope ayrı doğrulanmalı.
- **Mevcut doğru yerel desenler:** `weekly-team.css` / `--wt-*`; `employee-dashboard.css` / `--eh-*`; `roles-settings.css` / `.bl051-roles` + `light-dark()`; `lineup.css` / export sabit light sınırı. Bunları geniş normalize ile yeniden yazma.

## Kapı kararı

Ana session kullanıcıya üç görsel örneği sunabilir. **Görsel GO gelmeden başka sayfaya uygulama yapılmayacak.** GO sonrasında ortak temeller ve ardından sayfa/portal istisnaları ele alınabilir; her ailede desktop/mobile light-dark, gerçek employee/unauthenticated akışlar ve eksik state kanıtları gerekir. Bu rapor yerel ilk kapıdır; bütün ürün veya hosted/release hazır iddiası değildir.
