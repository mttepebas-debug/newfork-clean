# JOIN-005 Switcher ve uygulama içi davet bildirimi
Status: done (2026-09-21)
Session: -   Branch: task/join-005   Worktree: yok   DB: KILIT (last_used_at okuma/yazma)

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
- 2026-09-21 sonuc. Migration `20260921210000_workspaces_remember_their_last_use`: `list_my_workspaces` ve servis sarmalayicisi `last_used_at` donuyor; `touch_workspace_membership_service` acilisi damgaliyor (5 dakikadan taze damga yeniden yazilmiyor, switcher'in siraya ihtiyaci var dakikaya degil). Damga `/v1/context` cozuldugunde atiliyor ve basarisizligi sayfayi dusurmuyor.
- `AppShell.tsx` yuvasi (`data-organization-switcher-slot="tbd"`) gercek kontrole dondu. Tek workspace ve bekleyen davet yoksa **duz ad** olarak kaliyor; ikinci workspace ya da bekleyen davet varken acilir menu oluyor. Rail kapaliyken kompakt isaret + nokta.
- Menu: "You are in" (isaretli) · "Switch to" (rol ve "Setup unfinished") · "Invitation(s)" (Answer) · "All workspaces".
- **R5 tamamlandi.** Iki hazir workspace'te hub liste gosteriyordu, plan "son kullanilana in" diyor. Inis ile kasitli ziyaret ayrildi: `ProtectedRoute` hub'a `state={{ landing: true }}` ile gonderiyor, hub yalniz o durumda kendiliginden iletiyor. Switcher'in "All workspaces" baglantisi state tasimadigi icin listede kaliyor.
- **Kanit:** `WorkspaceSwitcher.test.tsx` 5/5, `WorkspaceHubPage.test.tsx` 11/11, `AppShellNotificationBadge` 16/16 (eski "tbd" yuvasini sabitleyen assert yeni sozlesmeye cevrildi), `typecheck`/`test`/`lint` PASS. Tarayici: iki workspace'li hesapta menu acildi, "Join Audit Co"ya gecildi, `last_used_at` damgasi DB'de dogrulandi.
- **Not:** owner'in kendi workspace'ine gonderilmis bekleyen daveti menude gorunmuyor - `list_pending_employee_invitations_for_account_service` zaten uye olunan workspace'in davetini eliyor. Dogru davranis (S8).
- **Kapsam disi:** hesap butonu ile switcher'in tek kontrolde birlestirilmesi (canvas onerisi) BL-073'te bekliyor.

