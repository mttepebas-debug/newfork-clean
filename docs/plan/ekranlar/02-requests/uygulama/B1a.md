# EKRAN-02 B1a — Requests'in okuma yolu ve birleşik açık liste (veri katmanı)

- **Dilim:** B1a (koordinatör KK-174 (a): B1'in A1–A3'e bağlı olmayan kısmı) · **Rol:** `nf-backend` (web oturumu) · **Sınıf:** R2 (görev dosyası B1'i R3 sayar; bu parça rota yetki kapısını çekirdeğe bırakıyor, inceleme `nf-guvenlik` ile yapıldı)
- **Dal:** `task/ekran-02-b1a` · **Taban:** `a40f329b` · **Commit:** `5bc0874d` (+ bu arşiv)
- **Durum:** dalda hazır, **push yok** — gece kuralı: ekranda görünen davranış değişiyor (arama, 401, giriş kapısı) → sabah onayına hazır.

## Sonrası için
- **C1 (arayüz) bu hook'la tabloyu çizer.** Sözleşme aşağıda "Sözleşme". Tabloyu C1 çizince müdür ekranındaki `ShiftExchangeHub` listesi ve iki sekmeli yapı (Time off / Shift changes) kalkar; B1'in madde 4'ü (ikinci listeyi çizmemek) C1'in tablosuyla birlikte kapanır. Vardiya değişikliği inceleme çekmecesi bugün `ShiftExchangeHub` içinde `?case=` ile açılıyor; C1 Review düğmesinden o çekmeceyi açacak yolu seçer (C2 ile).
- **Closed sekmesi** bugünkü imleçli izin yoluyla kalır; B3 (A4'ün ucu) gelince `useOpenRequests`'in yanına sunucu sayfalı Closed hook'u eklenir, `readRequestsParams`/`pageOf` sözleşmesi aynı kalır (sayfa ve boyut adreste).
- **R2-18 (A2):** okuma modeli vakaya kimin oy verdiğini söylemiyor; iki lokasyonlu takasta onay vermiş müdür vakayı hâlâ Needs review'da görür (`requests-list.ts` `exchangeTab`, `ponytail:` yorumu). A2 oy bilgisini getirince bu satır düzelir.
- **İnceleme bulguları B1b'ye (düşük):** (1) sol menüdeki Requests girdisi hâlâ izin anahtarına bakıyor (`apps/web/src/shell/AppShell.tsx:76-85`), sayfanın kapısı çekirdeğe; belgesi eksik müdür menüde Requests'i görür, tıklayınca açılış sayfasına döner (veri sızmaz). Ortak menü dosyası ve testleri gece değişmedi; B1 Done when (f) ile birlikte. (2) `useOpenRequests`'e "izni olmayan liste istenmez" testi — C1 hook'u bağlarken. (3) DB'de iki kural pgTAP'e kilitlensin (yalnız vardiya okuyana izin satırı dönmez; bekleyen üye reddedilir) — `nf-db` backlog önerisi.
- **B1'in kalanı (A1–A3'e bağlı):** R2-40 (takas retlerinde `authz.*` + `NoAccessState`), R2-15/R2-46 (Roles'ta Time off "View"), R2-55'in API/shared yarısı, Done when (f) (`permissions.includes` 21 → ≤ 20: kalan 21'in ikisi ortak `PermissionRoute`'ta, geri kalanı başka ekranlar; Requests'e ait olan kapı bu dilimde `can()`'e döndü ama sayaç `PermissionRoute`'un iki satırını sayıyor).
- **R2-32 / BL-200 (takas onayında 2 sn bekleme):** bu dilime alınmadı; ölçmek için uygulamanın çalıştırılması gerekiyor (görev dosyası: "önce ölç"). Ayrı küçük iş olarak önerildi.

## Sözleşme (C1 / C3 için) — `apps/web/src/schedule/requests-list.ts`
- `useOpenRequests(workspaceId, { timeOff, shiftChanges }, { types, locationId, search })` →
  `{ rows: OpenRequestRow[], isLoading, isFetching, error, failure: "no_access" | "connection" | "server" | null }`.
  - Needs review + In progress'in **bütün** satırları (sayfasız; sayfayı ekran `pageOf` ile keser). Okuma izni olmayan liste ya da süzgeçte seçilmemiş tür hiç istenmez.
  - `keepPreviousData`: arama / süzgeç değişince önceki satırlar ekranda kalır; `isLoading` yalnız ilk yüklemede true. Ekran "Loading" durumunu yalnız `isLoading`'de göstermeli, `isFetching`'de değil (R2-10, R2-20).
- `OpenRequestRow`: `{ source: "time_off" | "exchange", id, type: "time_off" | "swap" | "cover" | "open_pickup", tab: "needs_review" | "in_progress", decideBy: string | null, request }` (`request` kaynağın kendi satırı: `TimeOffRequest` ya da `ExchangeCase`).
  - Sekme: izin → `progress.can_vote && !progress.my_vote` ise Needs review; vaka → `can_manage` ve aşama `ready_for_manager` / `awaiting_other_manager` ise Needs review; geri kalanı In progress. Kapanmış vaka listeye girmez.
  - Sıra: Decide by en yakın üstte, tarihi olmayan sonda. Vakada Decide by = `expires_at`.
- `requestTypesFor({ timeOff, shiftChanges })` → süzgeçte gösterilecek türler; `requestTypeLabels` ekran adları ("Time off", "Swap", "Cover", "Open shift").
- `readRequestsParams(searchParams, allowedTypes)` → `{ tab, types, page, pageSize }`. Adres: `tab=needs_review|in_progress|closed`, `types=swap,cover` (virgüllü; boş = izinli hepsi; izinsiz tür yok sayılır), `page` (≥ 1), `size` (25 / 50 / 100, varsayılan 50). Süzgeç değişince sayfayı 1'e ekran çeker.
- `pageOf(rows, page, pageSize)` → `{ rows, page, pageCount, total }`; liste küçülüp adresteki sayfa boşa düşerse son sayfa.
- `tabOfRequest(id, openRows)` → `?request=<id>` hangi sekmede açılır; açık listede yoksa `closed` (R2-09).
- `requestFailureKind(error)` → R2-11'in veri yarısı.

## Rapor

**Ne yapıldı (etkisi):**
1. **Tek okuma rotası (R2-21).** Requests'in iki okuma kopyasından header'lı olan (`/schedule/requests`) silindi; web artık `/v1/workspaces/:ws/schedule/requests`'i çağırıyor. Rota kendi içinde izin anahtarı sormuyor (`permissions.includes` 2 → 0): kim neyi okur sorusunu veritabanındaki çekirdek cevaplıyor (`get_schedule_requests_service`; iki listeden hiçbiri yoksa `authorize` 42501 + `authz.*`). Sonuç: oturumsuz istek 401 `session.required`, üye olmayan 404, okuma hakkı olmayan 403 + `authz.out_of_scope` (bugün 403 ama nedensizdi, ekran onu "erişim yok" kartına çeviremiyordu).
2. **Oturum düşünce çıkış (R2-21).** Requests'in kendi istek yardımcısı silindi; okuma ortak `apiRequest` üzerinden gidiyor, 401'de oturum kapanıp giriş ekranına dönülüyor (bugün "A current session is required" ham yazısı kalıyordu).
3. **Arama (R2-10).** Aramaya harf yazınca sayfa "Loading requests..." ekranına dönmüyor; liste ve arama kutusunun odağı yerinde kalıyor. 200 karakter yapıştırılınca ilk 120'si soruluyor; bugün API 400 döndürüp bütün sayfayı hata yazısına çeviriyordu.
4. **Birleşik açık liste (K-S8, K-S10).** Needs review ve In progress için izinler ve vardiya değişiklikleri tek listede, Decide by sırasıyla, Request type süzgeciyle; sayfalama (25 / 50 / 100) ve adres parametreleri. Ekrana henüz bağlı değil — tabloyu C1 çizer (sözleşme yukarıda).
5. **Giriş kapısı.** Requests sayfası artık rolün izin anahtarına değil çekirdeğin eylem listesine bakıyor (`can(requests.read) || can(exchange.read)`), sekmeleri gibi.

**Ölçümler:**
- Açık vardiya değişiklikleri tarih penceresinden bağımsız hep dönüyor: `shift_exchanges_read_service`'te `x.status='open' or …` (`supabase/migrations/20260929190000_time_off_shortens_for_a_shift.sql:625`). Pencere (bugün → +42 gün) yalnız kapanmışları sınırlıyor → açık liste tam; A4'ü açık sekmelere genişletmek gerekmiyor.
- Bekleyen izin kuyruğu imleçle 100'lük sayfalarla sonuna kadar okunuyor (`getOpenTimeOffRequests`).
- `awaiting_other_manager` vaka düzeyinde ("herhangi bir oy var"), bakan müdüre göre değil (`…_shortens_for_a_shift.sql:662`) → R2-18 notu.

**Kanıt (komut + sonuç):**
- API: `pnpm.cmd --filter @newfork/api exec vitest run src/app.test.ts src/route-error-contract.test.ts` → önce 4 kırmızı (200≠404, nedensiz 403, 403≠401), sonra 120/120 yeşil.
- Web: `requests-list.test.ts` 11, `requests-data.test.ts` 3 (önce 3 kırmızı), `ScheduleRequestsPage.test.tsx` 35 yeşil. Arama testi düzeltme geri alınınca kırmızı ("Loading requests..." görünüyor), düzeltmeyle yeşil. Kapı testi önce kırmızı.
- `pnpm.cmd --filter @newfork/web typecheck`, `--filter @newfork/api typecheck` temiz; lint'te yalnız önceden var olan uyarılar.
- Tam kapı (ağır iş izniyle, 2026-10-06 ~15:45Z): lint ✓, typecheck ✓, test: ui 9, shared 210, api 1011 ✓, web ilk koşuda 1 kırmızı — `lib/refusal-reaches-screens.test.ts` `./supabase` taklidinde `apiRequest` yoktu (Requests okuması artık ortak yardımcıdan geçiyor); taklide gerçek yardımcının hata davranışı eklendi (`d9d22c11`), web 2225 ✓ / 1 atlanan, build 4/4 ✓.

**Ekran görüntüleri** (ayse, Kadıköy müdürü, 1440×900): `C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/nf-backend/EKRAN-02-B1a/` — `oncesi-2-200-karakter-arama.png`: bütün sayfa "Valid schedule request query required" yazısına dönüyor, arama kutusu ve sekmeler kayboluyor; `sonrasi-2-200-karakter-arama.png`: sayfa, sekmeler ve arama kutusu yerinde, odak kutuda, liste "Queue clear". `*-1-acilis.png` açılışlar (aynı görünüm).

**Senin yerine verdiğim teknik kararlar (P19):**
- Kalan rota `/v1/workspaces/:ws/schedule/requests` (ötekilerle aynı biçim; web header'lıyı çağırıyordu, taşındı).
- Açık listelerin birleşimi tarayıcıda (K-S10), sayfalama da tarayıcıda: açık kuyruk kısa ve tam okunuyor.
- Takas vakasında Decide by = vakanın bitiş anı (`expires_at`).
- B1'in madde 4'ü (ikinci listeyi kaldırmak) C1'in tablosuyla birlikte; bu dilimde ekran düzeni değişmedi.

## İnceleme

### `nf-guvenlik` — aynen

KARAR: ONAY @5bc0874d (R3 inceleme; Kritik ya da Yüksek bulgu yok)

Koordinatör için 5 satır
- **Karar:** ONAY @5bc0874d, R3 güvenlik incelemesi.
- **İzin:** R3 olduğu için gönderim koordinatörün "gönder" iznini bekler.
- **Risk:** 🟢 Yeni bir veri sızıntısı ya da fail-open (bilgi eksikse izin veren varsayılan) yok. Bir düşük bulgu var: menüdeki Requests bağlantısı hâlâ eski izin anahtarına bakıyor.
- **Soru:** yok.
- **Sonraki:** B1'in açık maddeleri (e) ve (f) bu parçada yok; B1b'de kapanmalı (aşağıda).

## (a) Rota kapısının kalkması bir açık bırakıyor mu? Hayır.

Her kişi için ne olduğu aşağıda. Kanıtın tamamı kod okuması ve var olan pgTAP testleri.

| Kişi | Ne olur | Nerede |
|---|---|---|
| Oturumu yok | 401 | `workspace-context.ts:58` |
| Üye değil ya da başka workspace | 404 | `workspace-context.ts:61`, eski test (workspace uyuşmazlığı) duruyor |
| `pending_activation` üyelik | API'de 404. Bağlam çözücü yalnız aktif üyeliği döndürüyor, DB çekirdeği de `not_active` diyor | `20260925014408_…sql:29,89`; `authz_check` (`20261007010000_…sql`, `pending_activation` dalı) |
| Belgesi eksik (kısıtlı) müdür | 403 `authz.document_blocked`. İki eylemde de `restricted_ok=false` | `authorization_core.sql:235,240`; pgTAP `schedule_asks_the_core.test.sql` (aydan) |
| Lokasyonu olmayan müdür | 403 `authz.out_of_scope`. Boş lokasyon dizisi (`time_scope='{}'`) ile yapılan kontrol yine de reddediyor | aynı pgTAP (nur) |
| Çalışan | 403 `authz.missing_permission` | aynı pgTAP (emre), `schedule_requests.test.sql:47` |
| Yalnız vardiya değişikliği okuyabilen | İzin satırı gelmez, sayaç 0 | `20261007040000_…sql:43,47` |
| İzin dışı lokasyon süzgeci | 403 | `…sql:33-38`, `schedule_requests.test.sql:46` |

- **Kaybolan kontrol yok.** Eski `/v1` rotası `membership.status`, kısıtlı erişim ya da onboarding sormuyordu. Yalnız `context.permissions` sorduğu için bekleyen üyeye izin anahtarıyla kapıyı açabiliyordu. Yeni hâl ondan daha sıkı.
- **Onboarding'i bitmemiş workspace:** ne eski rota ne çekirdek bunu soruyor. Bu bir gerileme değil, aynen önceki gibi.
- **Hayır cevapları:** DB'nin 42501 + `authz.*` cevabı API'de `rpcFailure` ile 403'e çevriliyor, `authz.not_member` 404'e (`http-error.ts:127-131`).
- **Silinen ikinci rota:** başlıkla workspace seçen eski rotayı web'de ve e2e'de çağıran bir yer kalmadı (grep sonucu boş).

## (b) Sayfa kapısının `can()`'e dönmesi

- Kapı artık çekirdeğin eylem listesine bakıyor. Çalışan, bekleyen üye, belgesi eksik müdür ve lokasyonsuz müdür eskiden izin anahtarıyla içeri girip boş liste görüyordu; artık açılış sayfasına yönlendiriliyorlar. Bu doğru yön.
- Oturum bağlamı daha yüklenmemişken eski kapıyla aynı davranıyor: ikisi de `appLandingPath(null)`'a gönderiyor.
- İçeriye yanlışlıkla alınan kimse yok. Sunucu zaten her durumda yeniden soruyor.

## (c) Birleşik açık liste (`requests-list`)

- **Kapalı vaka açık listeye düşmüyor:** bekleyen olmayan izin ve kapanmış vardiya değişikliği atlanıyor (`requests-list.ts:85,89`).
- **Okunamayan tür istenmiyor:** okuma izni olmayan liste hiç sorgulanmıyor (`wantsTimeOff` / `wantsShiftChanges`, `:131-132`). Adresle izinsiz bir tür istenemiyor (`readRequestsParams`, `:111`).
- **Süzgeç yalnız istemcide:** vardiya değişikliğinde lokasyon ve isim süzgeci tarayıcıda çalışıyor, ama sunucunun zaten verdiği veri üzerinde. Sızıntı değil.
- **Sayfalama döngüsü bitiyor:** izinleri sayfa sayfa okuyan döngü (`getOpenTimeOffRequests`) sonsuz dönmez. DB her sayfada sınırı kesin olarak küçültüyor (`r.created_at < cursor`). API en çok 100 satır kabul ediyor (`schedule-requests-routes.ts:12`).

## Bulgular

**Düşük — menüde ve sayfada iki ayrı kapı**
- **Nerede:** `apps/web/src/shell/AppShell.tsx:76-85`.
- **Ne görüldü:** sol menüdeki Requests bağlantısı hâlâ eski izin anahtarlarına (`schedule.time_off_requests.read`, `schedule.shift_change_requests.read`) bakıyor. Sayfanın kapısı ise artık çekirdeğe soruyor.
- **Kişi için etkisi:** belgesi eksik ya da lokasyonu olmayan bir müdür, örneğin Aydan, menüde Requests'i görür. Tıklayınca hiçbir açıklama görmeden ana sayfaya döner. Veri sızmıyor; kapı kapalı tarafta kalıyor.
- **Öneri:** menü girdisi de `can(context,"requests.read") || can(context,"exchange.read")` sorsun. Bu, B1 Done when (f) ile ve "ikiz sistem yok" kuralıyla birlikte kapanır. Ölçüm: web'de test dışı `permissions.includes` sayısı a40f329b'de 21, 5bc0874d'de hâlâ 21.

**Düşük — birleşik listenin hook'unun testi yok**
- **Ne görüldü:** "izni olmayan liste hiç istenmez" kuralı (K-S8) `useOpenRequests` hook'unda yaşıyor, ama bu hook için test yok. `requests-list.test.ts` yalnız saf fonksiyonları sınıyor.
- **Etkisi:** hook henüz ekrana bağlı değil, sunucu da zaten reddediyor. Yani bugün bir kişiyi etkilemiyor.
- **Öneri:** C1 hook'u ekrana bağlarken tek bir test eklensin: izin okuma yetkisi yokken izin sorgusu hiç gitmiyor (`enabled=false`).

**Düşük — DB tarafında iki kural testle kilitli değil**
- **Ne görüldü:** bu dalın değiştirmediği DB fonksiyonu için iki kural pgTAP ile sabitlenmemiş:
  - yalnız vardiya değişikliği okuyabilen kişiye izin satırı dönmemesi,
  - bekleyen üyenin reddedilmesi.
- **Durum:** kod doğru (yukarıdaki tablo). API artık yetkiyi tamamen DB'ye bıraktığı için bu iki satırın teste kilitlenmesi değerli olur. Önerim bunu backlog'a yazmak.

## Kapsam

Bu commit B1'in a parçası. Görev dosyasındaki iki madde burada yok:
- **(e)** Settings → Roles → Requests → Time off'ta "View" seçeneğinin kalkması,
- **(f)** `permissions.includes` sayısının 21'den en çok 20'ye inmesi.

B1 kapanmadan önce ikisi de karşılanmalı.

## Kanıt

- `git diff a40f329b..5bc0874d` okundu. Tanımları okunan DB fonksiyonları:
  - `get_schedule_requests_service`,
  - `app_private.scope_set` / `actor` / `authz_check` / `time_off_reason`,
  - `authz_actions` satırları,
  - `resolve_workspace_context_service`.
- `pnpm.cmd --filter @newfork/web exec vitest run src/schedule/requests-list.test.ts src/schedule/requests-data.test.ts` → 2 dosya, 14/14 geçti (2026-10-06 08:19).
- `ScheduleRequestsPage.test.tsx` ve `app.test.ts` koşulmadı (tam test yasağı). API'nin 401, 404 ve 403+`authz` testleri diff'te okundu.
- Hafıza: `checklist-api-gate-core-actions.md` kaydına menü ikizi notu eklendi.
