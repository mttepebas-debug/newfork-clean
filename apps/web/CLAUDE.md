# apps/web — web uygulamasına özgü bilgi

Ekran, veri katmanı ve görsel kontrol için bu klasöre özgü olgular; `packages/ui` için de geçerli. Arayüz çıtası, komutlar, portlar: kök `CLAUDE.md` §3.A, §7.

## Veri ve yetki katmanı
- İstek `apiRequest` (`src/lib/supabase.ts`) ile gider; hata `RequestError` (`src/lib/request-error.ts`). Ekran `reason`'a bakar, status'a değil: DB'nin 23514/22023/P0001'i API'de hep 400'dür.
- İstisna: Settings katalog yazmaları (`src/settings/organization-data.ts`: lokasyon, departman, job, shift type, label, logo) ve hesap profili (`lib/supabase.ts`) tarayıcıdan doğrudan supabase-js + RLS ile gider; DB reddi API'den geçmez, web'de çevrilir (`message()`).
- Workspace'e bağlı her sorgunun anahtarının ilk öğesi `src/auth/tenant-query-cache.ts` listesinde olmalı; yoksa workspace değişince eski workspace'in verisi önbellekte kalır.
- Realtime kanalı hep `{ config: { private: true } }`, kapanışta `removeChannel`. Reddedilen katılım ~5 sn sürer ve aynı soketteki öteki katılımları bekletir (ölçüm 2026-09-26).
- `can(ctx, action)`: hedefsiz → `ctx.actions` (sunucunun cevabı), hedefli → shared `expected()` ikizi. Yeni rota `ActionRoute`; `PermissionRoute` ve kalan `permissions.includes` yerleri (Settings, Employee Hub) eski, sayaç `rg "permissions\??\.includes"` yalnız azalır. İzin anahtarı → aksiyon 1:1 değil (`schedule.time_off_requests.read` → `requests.read`); kaynak `supabase/schema.sql` `authz_actions`.
- Erişim-yok kartı `src/shell/NoAccessState.tsx`; "Back to Home" `noAccessHomePath()`, asla `/app`.
- DB kuralı istemcide ikinci kez yazılmaz, istemci bayrağı gönderilmez; form önce reddedecekse kural shared'de şemanın yanında saf fonksiyondur (`managerLocationRefusal`).
- Shared şemaya zorunlu alan eklemeden önce bütün okuyucular: `scheduleReadModelSchema` Schedule'da ve Employee Hub'da (`employee-hub-data.ts`); `employeeInputSchema` kurulum sihirbazında da (`employeeCreateReadiness`).

## Tasarım sistemi
- Önce KARARLAR "UI listesi" (UI-01…16) ve "Ekran kararları"; ölçüler orada.
- `Button` yeşil; `className="secondary-button"` beyaz; `ConfirmButton` + `danger-button` kırmızı iki tık. `primary-button` sınıfının CSS'i yok (gri tarayıcı düğmesi).
- `src/settings/CatalogDrawer.tsx` açıkken sayfanın geri kalanı `inert`, `Toaster` de: çekmece açık kalıyorsa mesaj içinde `role="status"`, kapanıyorsa toast kapanıştan sonra.
- Schedule penceresi Escape'i `src/schedule/lib/useCloseOnEscape.ts` ile alır; yoksa sayfanın dinleyicisi haftayı bugüne atlatır.
- Özgüllük: `.request-detail-inner p` ve `.app-confirm p` her `p`'yi griler; telefonda `jobs-settings.css`'teki `.job-column-headings` her Settings başlığına ızgara dayatır (üç sınıfla ez).
- Liste sayfası ortak iskelete bölümüne `list-page` sınıfı vererek girer (`views/list-page.css`; `CatalogPageHeader` ve `ListPagination` yükler, `EmployeesPage.test.tsx` sınıfı bekler).

## Metin
- Metin değişince `e2e/`'de ikizini ara (`toContainText`, `getByText`, `getByRole(…, { name })`); onu trenin CI'ı koşar; akış değiştiyse etkilenen e2e'yi `node scripts/lock.mjs run db --e2e -- …` ile sen de koş. `toContainText` gizli çocukları da sayar: `aria-describedby` hedefi `not.toContainText`'i kırar.

## Görsel kontrol ve erişilebilirlik
- Görsel kararı Mert gözle verir: gerçek uygulamada yalnız DEV'de query param'la açılan 2–3 gerçekten farklı varyant; seçimden sonra ötekiler silinir.
- Kanıt: 1440 ve 390 ekran görüntüsü + Mert'in kapanış turu; ayrı görsel QA yok. Bak: owner/manager/employee; yükleniyor/boş/hata/erişim-yok; klavye, görünür odak, AA kontrast; komşu ekran.
- jsdom CSS yüklemez: renk düzeltmesi tarayıcıda computed style ile kanıtlanır. Vitest'te jest-dom yok.
- Telefonda ipucu ve dokunma `hasTouch: true` + `tap` ile denenir; fareyle 390 dokunma hatasını gizler.

## Tuzaklar
- Giriş: seed `owner@newfork.test` (Meyhouse) ya da e2e dünyası (`e2e/.world.json`, parola `e2e/global-setup.ts`): password grant, sonra `/sign-in#access_token=…`. Yeni dünyanın owner'ı girmezse seed owner. `mt.tepebas@gmail.com` Mert'in hesabıdır, kullanılmaz.
- Veri yoksa `page.route` + `route.fetch()` ile yanıtı değiştir, raporda söyle; regex'i API portuna sabitle (yoksa sayfanın adresini de yakalar). Hata taklidi `{ error, reason }`; geçersiz enum ham zod JSON basar.
- Schedule okuması `/schedule/reference?date=&view=`; hayalet kartı web hesaplar (`useCellState.ts`). `/dev/schedule-shift-design` girişsiz gerçek ızgara. Employees çekmecesi: `/app/employees?employeeId=<id>&section=profile`.
- Sayfa `main.app-main` içinde kayar; fullPage görüntü keser.
- Kabuktaki bir dokunma kapısının (ör. aşağı çekip yenileme) dışlama listesinde `<dialog>` yetmez: çekmecelerin çoğu `.app-main` içinde `role="dialog"` div. `pointer-events:none` bir öğenin görünürlüğü `elementFromPoint` ile ölçülemez (CALISAN-PULL-REFRESH).
- Mutlak konumlu ortak bindirmeyi (ör. `WindowAlert` şeridi) sıfır özgüllüklü kuralla bağlama: ekranın kendi `position: static`'i onu sessizce ezer, vitest göremez; `WindowAlert` görünürken alt çubuğu satır içi `relative` yapar. En az bir ekranda tarayıcıda ölç (UI-FIELDMSG).
- Playwright yalnız pnpm deposunda (`node_modules/.pnpm/playwright@<sürüm>/…`), `channel: "chrome"`.
- Port yabancı PID'deyse öldürme; boş çift al, `APP_URL`'ü eşitle (yoksa CORS).
- Commit değişince ya da rebase sonrası yetkili düğme kaybolur ya da eski CSS gelir: önce `vite --force`.
- `pnpm.cmd … exec vitest run` test düşünce `"vitest" not found` yazar; `Tests` satırını oku.
- `EmployeeDrawer.test.tsx` `./employee-data`'yı bütünüyle taklit eder: yeni saf yardımcı `employees/employee-create-flow.ts`'e. `App.test.tsx` Schedule'ın render testidir; yeni hedefsiz `can()` aksiyonu oradaki `actions`'a da girer.
- iOS sürümü: Safari 26'dan beri tarayıcı kimliğindeki "OS 18_6" donuk; sürüm "Version/NN"den okunur (`phone-alerts/install-state.ts`, IPHONE-SHARE).
