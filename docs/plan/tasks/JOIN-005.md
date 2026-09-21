# JOIN-005 Switcher ve uygulama içi davet bildirimi
Status: draft
Session: -   Branch: task/join-005   Worktree: newfork-wt/join-005   DB: -

Plan ID'leri: E5, E8, R5, R7, S12

Goal: Birden fazla workspace'i olan kullanıcı aralarında geçişi menünün tepesinden yapsın; yeni davet uygulamayı bölmeden görünsün.

In scope:
- `AppShell.tsx:316-324` `data-organization-switcher-slot="tbd"` yuvası gerçek kontrole döner: workspace işareti + ad + rol, tıklanınca popover.
- Görünürlük kuralı: **yalnız 2+ hazır workspace varken** açılır kontrol; tek workspace'te yalnız ad okunur (bugünkü hâl).
- Popover bölümleri: "You are in" (işaretli), "Switch to" (rol ve "setup unfinished" rozetiyle), "Invitations" (davet satırı + Join + son gün rozeti), altta "All workspaces →" hub'a.
- E8: davet sayısı yuvanın üstünde rozet olarak durur. Rozet kuralı "senden bir şey bekleniyor" — okumakla değil iş bitince kapanır.
- Rail kapalıyken (`collapsed`) yuva bugün tamamen gizleniyor; kompakt workspace işareti kalır, tıklanınca aynı popover.
- Geçiş `last_used_at` yazar (JOIN-002).
- S12: workspace sayısı 2'den 1'e düşünce kontrol okunur ada döner, 0'a düşünce hub'a iner.

Out of scope: hesap butonunun (`AppShell.tsx:449`) switcher'la birleştirilmesi. Canvas bunu öneriyor, plan E5 switcher'ı üst menüye koyuyor; ikisi ayrı kontrol kalır. (BACKLOG: birleştirme önerisi.)
Done when: E5 görünürlük kuralı testli; davet rozeti testli; S12 elle turu; `pnpm.cmd test` PASS.
Touches: `apps/web/src/shell/AppShell.tsx`, yeni `apps/web/src/shell/WorkspaceSwitcher.tsx`, `apps/web/src/styles.css` (kit sınıfları, yeni token yok).
Test plan: Vitest — 1 / 2 / 3 workspace ve 0 / 1 davet kombinasyonları.
Risk: AppShell uygulamanın her sayfasında; regresyon riski. Değişiklik yuva ve yeni bileşenle sınırlı tutulur.

## Notes / Result
