# W-1a — Düzenleme oturumu, sunucusuz kısım

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| Schedule | EKRAN-01 W-1a | nf-backend / web hattı | R2 | ONAY @aee42edf (bağımsız kod incelemesi alt ajanı, iki tur) | 2026-10-06 |

## Sonrası için
- Tuzak: `useEditIdleTimer`'a verilen `onTimeout` her render'da değişirse sayaç yeniden kurulur; kalp atışının döndürdüğü yeni oturum kopyası "Keep editing?" penceresini hiç açılmaz hâle getiriyordu — oturumu ref'ten okuyun.
- Tuzak: sunucu `acquire` aynı kişinin açık oturumunu yalnız `status: "resumed"` ile sürdürür; `acquired` / `acquired_after_recovery` yeni bir oturumdur, eski işin yerine konmaz.
- Tuzak: `App.test.tsx` `schedule-data` modülünü açık listeyle taklit ediyor; `schedule-data.ts`'e eklenen her yardımcı (ör. `isEditLeaseExpired`) oraya da eklenmeli, yoksa çağrı sessizce `undefined` olur.
- Kalıp: düzenleme oturumu `apps/web/src/schedule/hooks/useScheduleEditSession.ts`'te; kilit, kalp atışı, hareketsizlik, `recoverLease()` oradan kullanılır.
- Ölçüm: `SchedulePage.tsx` 3637 → 3576 satır; Schedule vitest 951 → 958 (2026-10-05).

## Rapor
### EKRAN-01 W-1a — rapor (web hattı, nf-backend)

Delegasyon: R2; inceleme tek bağımsız alt ajan (kod incelemesi) — ilk tur 4 bulgu, düzeltildi, **ONAY @aee42edf**. Görsel QA yok (ekranın görünümü değişmedi).
Dal `task/ekran-01-w-1a` (worktree `.claude/worktrees/optimistic-dewdney-c78421`), 4 commit: `8e1af509`, `067abe88`, `d7318c87`, `aee42edf`. Main'e gönderilmedi; **"gönder" izni bekleniyor.**

#### 1. Nerede duruyor
Kod bitti, inceleme onaylı, tam kapı yeşil. Dört Done-when maddesinden üçü kanıtlı; (1)'in e2e yarısı T-1'in (görev dosyası öyle yazıyor). Bir ürün sorusu açık (aşağıda).

#### 2. Ne yapıldı (etkisi)
- **Yenileme (D-Y4).** Ayşe "Week 42 plan"ı düzenlerken F5'e basar: düzenleme şeridi ve vardiyalar geri gelir, ızgara boş görünmez. Sunucu, aynı kişinin bu haftadaki açık düzenlemesini sürdürür. Sürdürülemezse (geçmiş hafta, yetki yok, başkası tutuyor) sayfa taslağın önizlemesine döner, boş düzenleme ekranı kalmaz.
- **Kilit düşmesi (D-Y3).**
  - "Keep editing?" geri sayımı açıkken kilit artık düşmüyor. Kalp atışı (kilidi canlı tutan dakikalık istek) 15. dakikada değil, 20. dakikadaki zaman aşımında duruyor.
  - Bilgisayar 4 dakikadan uzun uyuyup kilit düşerse, sonraki kalp atışı ve SAVE aynı kişinin işini sessizce geri alıp kaydediyor.
  - Sunucu işi başka birine verdiyse ya da yeni bir düzenleme açtıysa, ekran "aynı iş" diye davranmıyor. Düzenleme biter; kilit penceresi ya da "Your edit ended while you were away. Open the schedule again to keep editing." görünür.
  - SAVE yolunda ham "edit lease expired" metni artık görünmüyor.
- **İncelemenin bulduğu, main'de de olan hata.** Her kalp atışı hareketsizlik sayacını sıfırlıyordu, yani "Keep editing?" penceresi pratikte hiç açılmıyordu. Düzeltildi: sayaç yalnız gerçek kullanıcı hareketiyle sıfırlanıyor. Not: W-1b'nin S1'i (15 dk + 15 sn → auto-save) bu düzeltmenin üstüne kurulacak.
- **Discard.** Discard sonrası sayfa kilidi yeniden almıyor (incelemenin bulgusu, testli).
- **BL-616.** Hiç açılmayan "taslak seç" penceresi (`EnterEditModeDialog`) ve ölü durumu silindi.
- **Kanca.** Oturum mantığı `apps/web/src/schedule/hooks/useScheduleEditSession.ts`'e taşındı (ilk commit, davranış değişmeden). `SchedulePage.tsx` 3637 → 3576 satır (`wc -l`, bu dal ile `origin/main`).

#### Done when
1. F5 sonrası aynı vardiyalar ve şerit görünür: vitest `App.test.tsx` "picks the edit back up after a page reload…" ✓. E2E yarısı T-1'de.
2. Uyku sonrası SAVE çalışır, ham metin yok. Vitest:
   - "saves after the edit lock lapsed…" ✓
   - "…when the lock lapses twice" ✓
   - kanca testleri (sahte saat) ✓
3. `SchedulePage.tsx` satır sayısı düştü: 3637 → 3576 ✓.
4. `EnterEditModeDialog` repoda yok (`git grep` boş) ✓.

#### Kanıt
- Taban (değişiklikten önce, 2026-10-05 19:38 yerel): `vitest run src/App.test.tsx src/schedule` → 119 dosya, 951 geçti.
- Sonra (`aee42edf`): aynı komut → 119 dosya, **958 geçti** (7 yeni test; hepsi önce kırmızı görüldü).
- Tam kapı (`pnpm.cmd lint && typecheck && test && build`, `aee42edf`, 2026-10-05 akşam): EXIT=0 — api 1103, web 2165 (+1 atlanan), shared 209, ui 9 test geçti; build yeşil. Etkilenen e2e (Schedule düzenleme) gönderimden önce db.lock ile koşulacak.
- Lint: değişen dosyalarda 0 hata; 6 uyarının hepsi eski (`openExport`, `updateSelectedIds`, `previewSource.source`…).

#### Sözleşme (W-1b ve arayüz hattı için)
`useScheduleEditSession({ userId, workspaceId, onError(message), onEnded() })` şunları döndürür:
- `session`, `setSession`
- `mutationContext`, `currentMutationContext`
- `conflict`, `setConflict`
- `acquire(weekStart, source, draftId, locationIds) → ScheduleEditAcquireResult | null`
- `recoverLease() → ScheduleEditSession | null` (yalnız "resumed")
- `idleSeconds`, `keepEditing`

`onEnded` iki durumda çağrılır: zaman aşımında, ya da kilit başkasına geçince. `schedule-data.ts` → `isEditLeaseExpired(error)` (BE-2 metin yerine koda çevirecek; tek yer).

#### 3. Açık kalan ve nedeni
- **Ürün sorusu: düzenlerken başka haftaya geçince ne görünür? (D-Y4'ün ikinci yarısı)**
  - **Bugün:** Schedule → Edit → "Next week". Izgara boş, menüde önceki haftanın taslak adı yazıyor. Geri dönünce iş duruyor (bellekte).
  - **Örnek:** Ayşe Kadıköy'ün 13–19 Ekim taslağını düzenlerken 20–26 Ekim'e bakmak ister.
  - **(a) (Önerilen)** Diğer hafta görünüm modunda kendi hâliyle açılır. Ayşe'nin düzenlemesi kendi haftasında açık kalır; o haftaya dönünce kaldığı yerden sürer. Ek satır ya da pencere yok. Dayanak: ILKELER P10 (ilerleme kaybolmaz) + P20 (sade).
  - **(b)** Düzenlerken hafta değiştirmeden önce "Save draft / Discard" sorulur. Kurumsal hantallık riski var.
  - **(c)** Diğer hafta da düzenleme modunda açılır (o haftanın yayınlanmış hâlinden). Aynı anda iki açık düzenleme olur.
  - Yeni bir davranış tanımı olduğu için tahmin edilmedi. Hafta değişiminde kod bugünkü gibi kaldı. Seçim gelince W-1b'ye eklenir; aynı dosyalar.
- **Shift değişikliklerinde (sürükleme, silme) kilit düşerse ham metin hâlâ çıkabilir.** Kalp atışı en geç 60 sn içinde kilidi geri alıyor. SAVE dışı yolu W-1b'nin `mutate` işi kapatır; incelemeci de "kapsam dışı, main'de de var" dedi. Backlog adayı.
- **Discard'dan sonra gelen geç kalp atışı cevabı eski oturumu bir an geri yazabilir.** Main'de de var, incelemecinin notu. W-1b'ye.

#### 4. Ekranda ne değişti
- Schedule (düzenleme modu): F5 sonrası düzenleme geri geliyor.
- "Keep editing?" penceresi artık gerçekten 15. dakikada açılıyor (önceden kalp atışı sayacı sıfırladığı için açılmıyordu).
- Uyku sonrası SAVE hata yerine kaydediyor.
- Görünüm, renk ve yerleşim değişmedi. Ekran görüntüsü alınmadı (görsel değişiklik yok).

#### 5. Sırada ne var
- **Gönder izni gelince:** `main.lock`, rebase, tam kapı, push, main CI.
- **Sonra BE-1.** Tazelik başladı: B-5 hâlâ geçerli. `schedule-export-v2-routes.ts:22` `membership.role === "employee"` ve `resolveAuthorizedWorkspaceContext` kullanıyor; üye olmayana 403 veriyor (404 olmalı).
- **Yolda bulunan (arayüz hattına):** silinen pencerenin `schedule-enter-edit-*` CSS kuralları `styles.css`'te 20 yerde ölü kaldı → W-4 ölü CSS.

Skills: superpowers:test-driven-development (her davranış değişikliği önce kırmızı test).

## İnceleme

### Tur 1 — KARAR: DEĞİŞİKLİK İSTENİYOR (@d7318c87)
Reviewed `d7318c87` (HEAD) against `origin/main`, apps/web only. I could not run git or vitest here (no shell), so I read the final files and compared against the main checkout's `SchedulePage.tsx`. Nothing was executed, including the vitest/eslint/typecheck runs you suggested. Commits 1 and 2 look behaviour-neutral. Commit 3 has the problems below.

**1. `recoverLease` treats a brand-new session as a "resumed" one, which can silently drop unsaved work.** `useScheduleEditSession.ts:134-149` returns `result.session` for any non-conflict status; it does not check `result.status === "resumed"`. The migration only resumes when the person's own session is still `status='active'`. Scenario: Ayşe's lease lapses while she sleeps; Manager B opens the same draft (her dirty shifts go to a "Recovered edit …" draft); B leaves; Ayşe's heartbeat or Save gets 409; `recoverLease` creates a fresh session from the stored draft; the grid silently reverts and Save stores the stale content. Fix: accept only `resumed`; otherwise end the edit with a real message; test `acquired` / `acquired_after_recovery`.

**2. The resume `useEffect` can re-acquire the session the user just discarded.** It fires whenever `isEditMode && !session`; `discardEditSession` calls `setSession(null)` then `setSearch(mode=preview)` directly, so a render with `session===null` and `mode=edit` is possible; the manager clicks Discard and lands back in edit mode with a new lock. Fix: record the attempt key whenever a session exists (or use `setScheduleMode`); test acquire called once after Discard.

**3. The raw "edit lease expired" text can still reach the Save path.** A second 409 after the one retry is rethrown and `getSaveDraftFailureMessage` returns it verbatim. Fix: map `isEditLeaseExpired` to the "could not be reconnected" message.

**4. The idle timer is re-armed by every heartbeat, and the new test hides it.** Pre-existing on main (`handleIdleTimeout` deps include the `session` object; heartbeat does `.then(setSession)`), but D-Y3 depends on it: the "Keep editing?" countdown can never be reached and the 20-min keep-alive does nothing. The test mocks the heartbeat to resolve the same object. Fix: depend on `session?.id` / read through a ref; return fresh objects in the test and assert the edit ends at 20 min.

Minor: `recoverLease` shares `acquireRequestRef` with `acquire` (overlap returns stale null); missing tests for the resume fallback, the once-per-key guard, Save when `recoverLease` returns null. No memory note.

### Tur 2 — KARAR: ONAY @aee42edf
I read `git diff d7318c87..aee42edf` through the final files and ran nothing (no shell). I found no remaining blocking issues.
- Finding 1: fixed — `recoverLease` calls `acquireScheduleEditSession` directly (no shared request ref, so the overlap minor is gone), accepts only `resumed` with the same session id; `conflict` opens the lock dialog; any other status discards the fresh session and ends the edit with a plain sentence; stale answers are dropped.
- Finding 2: fixed — the resume effect records the attempt key on every render where a session exists; a discarded, saved or idle-ended edit is never re-acquired.
- Finding 3: fixed — a second lease expiry throws the plain "could not be reconnected" message.
- Finding 4: fixed — `handleIdleTimeout` reads `sessionRef` and depends only on `[workspaceId]`; only real user activity resets the timer.

Two small points, neither blocking, both already on main: a heartbeat answer arriving after Discard can still `setSession` the old session; lease-expiry 409s on shift mutations (not Save) still show the raw text through `mutate`. I did not independently run the 958-test Schedule suite you quoted.
