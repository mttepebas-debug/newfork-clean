# BE-2 — Dışa aktarma ve sözleşme

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| Schedule | EKRAN-01 BE-2 | nf-backend / web hattı | R2 | ONAY @15c760df (bağımsız kod incelemesi alt ajanı; rebase sonrası yamalar aynı) | 2026-10-06 |

## Sonrası için
- Tuzak: veritabanında 40001 hem oturum çakışmasında hem başka işlerde (yayın önizlemesi, şablon, izin) kullanılıyor; API kodu yalnız bilinen mesajlar için verir (`EDIT_CONFLICT_CODES`, `schedule-routes.ts`), 40001'in hepsini "bayat oturum" saymak yanlış olur.
- Tuzak: bash heredoc'u bu ortamda bazı uzun Python betiklerinde tırnakta takılıyor; düzenleme betiğini dosyaya yazıp `python <dosya>` ile çalıştırmak güvenli.
- Kalıp: `vi.unstubAllGlobals()` + `vi.stubGlobal("fetch", …)` ve `vi.mock("../lib/supabase")` ile `schedule-data.ts`'in gerçek istek yolu birim testinde sınanır (`schedule-data-errors.test.ts`).
- Ölçüm: haftalık e-postanın tetiği `pg_cron` 5 dk (`20260919040000_schedule_remaining_cron_endpoints.sql:22-26`); Vercel cron yok; $0 (2026-10-06).
- Karar adayı: kısmi teslimin kapanma sayacına girip girmeyeceği (raporda soru) — e-posta kuralı ayarında genel bir "tek kötü alıcı herkesi kesmez" ilkesi olabilir.

## Rapor
### EKRAN-01 BE-2 — rapor (web hattı, nf-backend)

**Karar:** bağımsız kod incelemesi ONAY @15c760df (rebase sonrası yamalar aynı) · sınıf R2
**İzin:** R2 — gönderiliyor (sha ve CI raporun sonunda değil, panoda)
**Risk:** 🟠 bir ürün sonucu var: tek bir hatalı alıcı adresi, haftalık e-posta kuralını 3 hafta sonra kapatabilir (aşağıda Soru); geri kalanı 🟢
**Soru:** var — kısmi teslim üç başarısızlık sayacına girsin mi? (aşağıda §3)
**Sonraki:** W-1b (veri hattının DB-1b ve DB-2'si main'e girince); o zamana kadar boşta, koordinatörün sıradaki işini bekliyorum

#### 1. Nerede duruyor
Kod bitti, inceleme onaylı, tam kapı yeşil, e2e yeşil. Dal `task/ekran-01-be-2` (BE-1'in üstünde), worktree `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-dewdney-c78421`.

#### 2. Ne yapıldı (öncesi → sonrası)
| Madde | Öncesi | Sonrası | Uygulamadaki yeri |
|---|---|---|---|
| B-6 (BL-282) CSV formül açığı | Çalışanın adı `=HYPERLINK(...)` ise CSV Excel'de açılınca formül çalışıyordu | `= + - @`, sekme ve satır başıyla başlayan her hücrenin başına `'` eklenir; hücre metin olarak açılır | Schedule → Export → CSV; haftalık e-postadaki CSV eki |
| D-D4 kısmi teslim | 10 alıcıdan 9'una gidince kural "gönderildi" sayılıyordu | Biri bile gitmezse kural başarısız sayılır, hata satırı "Not delivered to 1 of 10 recipients: …" der | Haftalık e-posta kuralı (Export paneli) |
| BL-685 "Confirm once" | Sunucu "bu kapalı gün bir kez sorulur" işaretini gönderiyordu, ortak tip onu atıyordu; ekran aynı bilgiyi ayarlardan ikinci kez okuyordu | Ekran sunucunun işaretine (`confirm_scope`) bakar; ayardan okuma kalktı, tek kaynak | Schedule → Edit → kapalı güne vardiya (hızlı düzenleyici ve sürükleme) |
| D-O7 ham hata metni (veri katmanı) | Proxy'nin HTML 502 sayfası "Unexpected token '<'", bağlantı kopması "Failed to fetch" olarak ekrana gidiyordu; düşen kilit ve bayat oturum metinden tanınıyordu | Tek yerde iki sade cümle: "Newfork could not finish that. Try again in a moment." / "Newfork could not be reached. Check your connection and try again."; API düşen kilidi ve bayat oturumu kodla bildirir (`edit_lease_expired`, `edit_session_stale`), web kodu okur | Schedule'ın bütün istekleri |
| BL-391 / BL-168 ölü kod | Yayın durumu okuması düşünce tarayıcıda yakalanmayan hata kalıyordu; `schedule-data.ts`'te çağıranı olmayan 9 fonksiyon + 1 yardımcı | Okuma hata fırlatmaz (konsola yazar); ölüler silindi | Schedule üst çubuk yayın durumu |

- BL-101 ölçümü: haftalık e-postanın ücretsiz tetiği **zaten kodda**: Supabase `pg_cron` 5 dakikada bir `/api/internal/cron/scheduled-exports`'u çağırıyor (`supabase/migrations/20260919040000_schedule_remaining_cron_endpoints.sql:22-26`). Vercel cron kullanılmıyor; günlük sınır ve dolar maliyeti yok ($0 — Supabase ücretsiz planı `pg_cron` + `pg_net` içerir). BL-101'in eski parçaları (servis rolü okumaları, yanlış parametre adı, çift base64) bugünkü kodda yok (`grep` boş). **Canlıda çalışıp çalışmadığı ölçülmedi**: canlı veritabanında `cron.job_run_details`, vault'taki `app_api_url` / `cron_secret` ve Vercel'de `CRON_SECRET` / `RESEND_API_KEY` okumak gerekiyor; canlı okumayı koordinatöre bırakıyorum.
- BL-437 API tarafı: panelin ihtiyacı olan veri fonksiyonları (kural listele / kur / değiştir / sil, preset) `schedule-data.ts`'te duruyor, API uçları yaşıyor; W-3 bunları kullanır. Bu yüzden "çağıranı olmayan dışa açık fonksiyon yok" maddesinde bu 9 fonksiyon bilerek kaldı.

#### Done when
1. Ali'nin adı `=HYPERLINK(...)` → CSV hücresi metin ✓ (`schedule-export.test.ts` "opens a cell that starts like a formula as text…", önce kırmızı).
2. 10 alıcıdan biri düşünce başarılı sayılmaz ✓ (`schedule-export-cron.test.ts` "does not count an email that missed some recipients as sent", önce kırmızı).
3. BL-101 ölçüm ve öneri raporda ✓ (yukarıda; dolar: $0).
4. `confirm_scope` zod şemasında ve web'de okunuyor ✓ (`availability-assessment.test.ts` + `ShiftQuickEditor.test.tsx` / `useScheduleDropReview.test.tsx` K17, önce kırmızı).
5. 502 HTML cevabında ham metin yok ✓ (`schedule-data-errors.test.ts`, önce kırmızı).
6. `schedule-data.ts`'te çağıranı olmayan dışa açık fonksiyon: yalnız BL-437'nin W-3 için tuttuğu 9 fonksiyon ve yeni `isEditSessionStale` (W-4 kullanacak) kaldı — bilerek.

#### Sözleşme (W-1b, W-3, W-4 için)
- `isEditLeaseExpired(error)`, `isEditSessionStale(error)` — `schedule-data.ts`; API 409 gövdesinde `code`.
- `ScheduleRequestError.status === 0` → bağlantı yok; `body === null` → okunamayan cevap; `message` zaten sade cümle.
- `closedDayAlreadyAnswered(assessment, sessionId)`, `rememberClosedDayAnswer(assessment, sessionId)` — kural parametresi kalktı.
- `useScheduleDropReview(workspaceId, sessionId, revision)` — dördüncü parametre kalktı.

#### Kanıt
- Taban → sonra: Schedule web vitest 958 → 960 (+ yeni hata testi dosyası, − silinen anahtar testi); api `app.test.ts` 70/70.
- Tam kapı (rebase sonrası, `2de22655`): lint + typecheck + test + build EXIT=0 — ui 9, shared 210, api 990, web 2168 (+1 atlanan). (Önceki koşuda shared'de bir test yük altında 5 sn zaman aşımına düşmüştü; boşta yeniden koşuda geçti.)
- E2E (gönderimden önce): `pnpm.cmd e2e e2e/flows/schedule-` (db.lock) 11 passed (1.7m).

#### 3. Açık kalan ve nedeni
- **Soru — Haftalık e-posta bir alıcıya gitmezse kural kaç haftada kapanır?**
  - Bugün (bu dilimle): Schedule → Export → haftalık e-posta kuralı. 10 alıcıdan biri (ör. Ali'nin adresi yazım hatalı) her hafta geri dönerse kural her hafta "başarısız" sayılır, üç başarısızlıkta kendiliğinden kapanır; diğer 9 kişi 3. haftadan sonra e-postayı almaz. Tam başarısızlıkta da kural aynı (üç hafta).
  - (a) **(Önerilen)** Kısmi teslim başarısız sayılır ama kapanma sayacına girmez; hata satırı hangi adrese gitmediğini söyler, kural açık kalır. Dayanak: ILKELER P09 (veri sessizce düşmez; sorunlu adres görünür) — dokuz kişinin e-postası bir adres yüzünden kesilmez.
  - (b) Bugünkü gibi: kısmi teslim de üç haftada kuralı kapatır.
  - (c) Kısmi teslim başarılı sayılır, yalnız hata satırına not düşülür (D-D4 öncesine yakın).
  - Bu dilimde (b) kodda; seçime göre küçük bir değişiklik.
- BL-101 canlı ölçümü (yukarıda) — canlı okuma koordinatörde.
- Yolda bulunan: eski Export motorunun API uçları (`POST /schedule/export/preview`, `/schedule/export/preview-html`, `/schedule/export`) web'de artık hiç çağrılmıyor (Export v2 dosyayı tarayıcıda üretiyor); BE-1'in ölü ikiz listesine benzer, W-3'te eski Export bileşenleri silinirken ya da K-1'de silinebilir.

#### 4. Ekranda ne değişti
- Görünürde hiçbir şey değişmedi; metinler bağlantı kopunca ya da sunucu HTML hata sayfası döndürünce sade cümle oluyor (Schedule'ın üst kısmındaki hata satırı ve kaydetme penceresi).
- "Confirm once" kapalı gün ayarı: DRAG-API ile birlikte artık gerçekten bir kez soruyor.
- Ekran görüntüsü alınmadı (görsel değişiklik yok).

#### 5. Sırada ne var
- W-1b: veri hattının DB-1b (oturum yaşam döngüsü) ve DB-2 (canlı kanal) dilimleri main'e girince; KK-164 (hafta değişimi) ve W-1a'nın iki "main'de de var" bulgusu dahil.
- Kısmi teslim sorusunun cevabı gelirse küçük bir ek commit.

Skills: superpowers:test-driven-development (her madde önce kırmızı test).

## İnceleme

### Kod incelemesi — KARAR: ONAY @15c760df
KARDAR: ONAY @15c760df

I found nothing that blocks this. One caveat on scope: this session had no shell, so I read the code only. I did not run vitest, typecheck or `git diff`. I read the worktree files as they stand, and `git status` showed the branch clean at that head.

**Critical:** none.

**Important:** none at confidence 80 or above.

**Checks and results**

1. **B-6 CSV injection (`apps/api/src/schedule/schedule-export.ts:449-455`).**
   - Every CSV cell goes through `csvCell`: headers at line 81, rows at line 120, and role separators at line 427. `renderScheduleCsv` has no summary section.
   - The apostrophe is added before the quote and delimiter check, so quoting still wraps the prefixed value correctly.
   - No legitimate value is mangled. Times (`~4:00 PM`), hours (`~4.00`) and the `—` placeholder do not start with `= + - @ \t \r`. Hours are never negative.
   - Employee, job, location and note text that starts with one of those characters now gets a leading `'`. That is the intended behaviour.
   - The XLSX path is not affected: ExcelJS writes plain strings as text cells, not formulas. PDF and print are not spreadsheets, and print uses `escapeHtml`.

2. **D-D4 partial delivery (`apps/api/src/schedule/schedule-export-cron.ts:138-149`).**
   - The logic is correct. All recipients delivered records success. Zero delivered throws the raw reason. A partial delivery throws `Not delivered to N of M recipients: <reason>`.
   - No caller relied on partial delivery counting as success.
   - Behaviour to be aware of, not a defect: `recordFailure` applies `SCHEDULE_EXPORT_AUTO_DISABLE_FAILURES` (the 3-strike limit) to partial failures too. One permanently bad recipient address will switch off the whole weekly export after 3 weeks, and the good recipients stop receiving it. This was a decision, and your note already flags it. If it should not apply, give partial failure a higher threshold or a separate message.
   - The per-recipient idempotency key stays in place, so a rerun within the same hour does not re-mail recipients who already received it.

3. **BL-685 `confirm_scope`.**
   - The API passes the reason through. The only API parse of an assessment is `availability-service.ts:84`, which uses the shared schema. That schema now includes `confirm_scope` as an optional literal, so it is not stripped (`packages/shared/src/availability-assessment.ts:79`).
   - No other schema in `packages/shared` declares a reason shape.
   - Both SQL producers emit it: `20261005000000_closed_days_reach_the_shifts.sql:1310` and `20261007000000_availability_always_warns.sql:207-208`. It is emitted exactly when the setting is `confirm_once`. A case where settings say `confirm_once` but the reason lacks the scope cannot arise.
   - No non-test code references `closedLocationAsks` any more.

4. **D-O7 request errors.**
   - `AbortError` still propagates (`apps/web/src/schedule/schedule-data.ts:724`). `authorizeScheduleExportV2` passes the abort signal. A browser abort is a `DOMException`, so the check is correct.
   - 204 returns before the JSON parse.
   - Callers that check `instanceof ScheduleRequestError` all handle a `null` body. `getSaveDraftFailureMessage` falls back to `error.message`.
   - The heartbeat `.catch` at `useScheduleEditSession.ts:186-188` now shows the plain network sentence instead of a raw `TypeError` message.
   - No non-test code matches on "Unexpected token", "Failed to fetch" or `TypeError`. Those strings appear only in the dev feedback gallery.
   - The API (`schedule-routes.ts:1379-1406`) maps only four exact 40001 messages. Others, such as "stale publication preview" and "schedule template revision stale", still go to the global handler unchanged. The map covers every 40001 message in the schedule edit-session migrations (lease expired, session revision stale, shift revision stale, draft revision stale).

5. **BL-391 and BL-168 deletions.**
   - All five `refreshPublicationStatus` call sites use `void` (`SchedulePage.tsx:947, 1038, 3175, 3248`). Nothing awaits a rejection from it. The function now clears the status and logs to the console on failure, with the stale-request guard intact.
   - I found no references to `activeScheduleDownload` or `scheduleDataKeys` / `schedule-data-keys` anywhere in `.ts`, `.tsx`, `.mjs`, `.json` or `.yml` files. `e2e/` does not import web source.
   - The remaining named imports from `schedule-data` match the current exports, including the `PastEditFinding` type (line 139).
   - Because I could not run the compiler, treat the import check as confirmed by reading only. `pnpm.cmd --filter @newfork/web typecheck` before the push closes it.

**Memory note for the parent:** nothing to record.
