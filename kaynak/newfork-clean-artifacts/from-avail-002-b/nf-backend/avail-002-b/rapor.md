# AVAIL-002-B — nf-backend raporu

**1. Nerede duruyor:** B bitti, dalda iki commit; push yok. Tam kapı A+B üstünde yeşil. Main'e almadan önce: B için `nf-guvenlik` incelemesi ve aşağıdaki **e2e sıralama sorunu** (açık kalanlar 1).
Worktree `C:\Users\TheWe\Documents\Codex\newfork-wt\avail-002-b`, dal `task/avail-002-b`, taban `task/avail-002-a` @`9d8c767c`.
Commit'ler: `461f5325` (shared + API), `d0cde266` (web veri katmanı).

## 2. Ne yapıldı (etkisi)
**Paylaşılan tipler (`packages/shared`)**
- Müsaitlik haftasında gün artık birden çok saat aralığı taşır (`ranges`, sıralı, ayrık, en çok 12). Örnek: KadıköyGarson1'in tipten saate çevrilen Pazartesisi "09–14 ve 17–24" iki aralık olarak okunur, biri kaybolmaz.
- Kaydın cevabı yalnız `{model}`; keep/cancel şemaları (`weeklyCommitment*`, `decisions`) silindi (M5).
- Publish bulgusunda `acknowledged_by_*` silindi; müsaitlik bulgusu not olarak gelir, onay alanı yok (M9).
- Schedule okumasında yeni `note_intervals` (notun saatleri, yalnız notu okuyabilene); `availability_changed_after_publish` yorumu yeni anlamıyla (M11).
- Taslak müsaitlik çakışma listesinin şeması silindi (BL-206).
- Yetki ikizi: `availability.own` satırı — kendi haftasını yalnız employee rolü yazar, onboarding'deki employee dahil (M13, KK-133). Matris A'nın üç migration'ıyla geri alınan işlemde yeniden döküldü (`AUTHZ_MATRIX_PRELUDE`, 5440 hücre).
- Settings → Conflict handling şemasına müsaitlik anahtarı eklenmedi (ayar yok).

**API (`apps/api`)**
- Önizleme uçları silindi: `POST …/availability/weekly/preview` ve `POST /v1/me/onboarding/availability/weekly/preview` → artık 404.
- Taslak müsaitlik çakışmaları ucu silindi: `GET /schedule/drafts/:id/availability-conflicts` → 404 (BL-206 API yarısı).
- Hayır sözleşmesi: üyesi olmadığı workspace'e gelen müsaitlik isteği 404 (önceden 403'tü); çekirdeğin `authz.not_member` → 404, diğer `authz.*` → 403 (testte rank, out_of_scope, missing_permission).
- Settings → Scheduling → Availability ayar kaydında rotadaki eski izin kapısı (`settings.schedule_rules.manage`) kalktı; kararı A'nın çekirdeği (`settings.availability.write`) verir.

**Web veri katmanı (`apps/web`)**
- `schedule-conflicts.ts`: çalışanın işareti `availability` (warn), yöneticinin notu ayrı `note` (warn, notun sözleriyle) gerekçe. Örnek: KadıköyMüdür1 KadıköyGarson1'e Çarşamba 09:00 yazınca not "A manager's note for this day: School mornings." olarak gelir; not artık "unavailable" sayılmaz.
- Yeni `assessmentAvailabilityWarnings(assessment)`: sunucu cevabından işaret + notu `operation`'a bakmadan çıkarır (A'dan sonra ikisi de `operation`'da yok).
- Keep/cancel penceresi (`WeeklyCommitmentReview.tsx`) ve önizleme çağrısı silindi; kayıt doğrudan gider.
- Publish penceresindeki ölü `reasons` durumu silindi (BL-206 web yarısı).

**Seçenek (a) gereği davranış bugünkü gibi:** Shift editörü ve sürükle-bırak kutuyu açmamaya devam eder (not de dahil; `ShiftQuickEditor.tsx:404,410`, `useScheduleDropReview.ts:116`); kutu C1 ile açılır.

## Kanıt
- Tam kapı (A+B, koşu ~15:50–16:20Z): `pnpm lint` 0 hata (18 uyarı, önceden de var), `typecheck` 0, `test` 0 (shared 17 dosya, api 59, web 229, ui 3 — hepsi geçti), `build` 0. Lint'teki tek hata (kullanılmayan import) düzeltildi; lint ve o test dosyası yeniden koşuldu: yeşil.
- Kırmızı-önce: yetki ikizi 2 kırmızı → yeşil; shared şema 12 + 1; API rota 9; app.test 1; Schedule not/uyarı 5. Çok aralıklı düzenleyici testi (`WeeklyUnavailableEditor.test.tsx`) uygulamadan sonra yazıldı — dürüst not.
- `grep -rn "WeeklyCommitmentReview\|weeklyCommitment" apps packages` → 0 (`.ts/.tsx/.css`).

## 3. Açık kalanlar
1. **e2e sıralama (önemli):** `e2e/flows/schedule-availability-warning.spec.ts:90,117` Publish'teki "I've seen this warning…" onay kutusunu arıyor. A'dan sonra müsaitlik bulgusu onay istemediği için kutu çıkmıyor → A+B main'e girince main CI e2e bu senaryoda kırmızı olur. D (nf-test) planda C'den sonra. Öneri: D'nin bu dosyaya dokunan kısmı A+B ile aynı pencereye alınsın. e2e koşmadım (A'nın migration'ları yerel DB'de kalıcı değil; kalıcı uygulama main penceresinde).
2. `nf-guvenlik` incelemesi (B ayrı ONAY). Bakılacak: `weekly-preferences-routes.ts` (404 dalı, settings kapısının kalkması — çekirdek A'da soruyor), yetki ikizi satırı.
3. C1 / C2'ye bırakılan ölü sunum parçaları (dokunmadım, o dilimlerin dosyası):
   - `PublishPreflightPanel.tsx` / `PublishScheduleDialog.tsx`: `availability` + `availability_state` onay kutusu dalı (artık hiç tetiklenmez; C1.4). Onu anlatan `PublishPreflightPanel.test.tsx` "lists a new availability warning with an explicit confirmation" testi geçmişte kalan veri şeklini kuruyor; dal silinince test de silinmeli.
   - `scheduleAvailabilityMark.ts`'deki `source: "manager"` dalı (A'dan sonra oluşmuyor; C1).
   - CSS: `weekly-preferences.css` `.weekly-commitment-*` (15 kural), `styles.css:9072` `.schedule-publish-acknowledged` — kullanılmıyor.

## 4. Ekranda ne değişti
- **My availability / onboarding adımı / Employees çekmecesi → Availability:** Save'e basınca "Review pending requests" penceresi artık açılmaz; kayıt doğrudan gider. Saat modunda bir günde birden çok aralık varsa hepsi görünür, her biri ayrı düzenlenir / silinir (ikincisinin etiketi "… 2"). Yeni aralık ekleme düğmesi bugünkü gibi yalnız gün boşken çıkar — çoklu "Add hours" C2.7.
- **Availability (ekip tablosu):** çok aralıklı gün her aralığı ayrı etiketle gösterir.
- **Schedule → Publish → Pre-flight:** "Acknowledged by …" satırı kalktı; müsaitlik satırı onay istemez (A'nın verisi; kutunun kendisi C1'de gider).
- Schedule ızgarası ve Shift editörü: görünürde bir şey değişmedi.

## 5. Sırada ne var — C1 / C2 için sözleşme (nf-arayuz)
1. **Yerel değerlendirme** — `evaluateScheduleShiftConflicts(model, shifts, input, excludeId)` (`apps/web/src/schedule/schedule-conflicts.ts`):
   - işaret: `{ type: "availability", rule_kind: "weekly", severity: "warn", message: "The assignment overlaps unavailable hours.", …context }`
   - not: `{ type: "note", rule_kind: "weekly", severity: "warn", note: "<günün notu ya da ''>", …context }`; mesajı `formatScheduleConflictMessage`: sözü varsa "A manager's note for this day: School mornings.", yoksa "The assignment overlaps hours a manager noted for this person."
   - İkisi aynı vardiyaya düşerse sıra `["availability", "note"]` (tek kutu, iki satır — C1.2). Onaylı izin varsa not gelmez (izin kazanır).
2. **Sunucu değerlendirmesi** — `assessmentAvailabilityWarnings(assessment | null): ScheduleConflictReason[]` → `{ type: "availability" | "note", severity: "warn", message, intervals }`. `operation` `allowed` olsa da döner; kutuyu açmanın sinyali bu. Bağlamak için C1: `ShiftQuickEditor.tsx:404` ve `:410` filtrelerinden `availability`/`note`'u çıkarıp bu yardımcıyı kullanır; `useScheduleDropReview.ts:116` aynı; yapıştırma / kopyalama / şablon yolları (D9) da.
3. **Not kartı verisi (S2 B)** — `weeklyTargetNote(employee, input): { text: string } | null` (`apps/web/src/schedule/lib/scheduleWeeklyAvailability.ts`). `null` = not yok ya da okuyucu notu göremez (`note_intervals: []`); `text: ""` = notun saati var, sözü yok. Ham veri: `employee.weekly_availability[].note_intervals` + `manager_notes[7]` (Pazar'dan).
4. **`weeklyTargetAvailability`** artık `"available" | "unavailable" | "time_off" | "unknown"`; `"reminder"` yok (not ayrı).
5. **Aç/kapa anahtarı (D5)** — yeni kod gerekmedi: `usePersistentScheduleUiBoolean("showAvailability", true)` (`schedule/store/scheduleUiStore.ts`), SchedulePage'deki öteki anahtarlarla aynı depo, varsayılan açık.
6. **"Changed after publishing"** — `shift.availability_changed_after_publish` (ilk yayından sonra gelen kendi işareti; izin ve not sayılmaz).
7. **Publish** — müsaitlik bulgusu `{ code: "availability", tier: "note", overrideable: false, conflict_severity: "warn" }`, karar listesine konmaz. `schedule_conflict` bulgularında `availability_state` / `warning_policy` duruyor (öteki çakışmaların "retained" kaydı, KK-132).
8. **Saat düzenleyici (C2.7)** — `WeeklyPreferenceDay.ranges: {start,end}[]`; sıralı ve ayrık (değen iki aralık tek aralık), en çok 12; şema "Hours must be in order and apart." der.

**Yolda bulunan (dokunulmadı):**
- Yazma kapısının ret metinleri hâlâ müsaitlik diyor: "Resolve availability, shift hours or approved time off before this assignment" ve "A current availability acceptance is required" (`supabase/migrations/20261007000000_availability_always_warns.sql:396-399`). API 400 ile olduğu gibi geçiriyor; web'de toast olarak görünebilir (ör. onaylı izin yüzünden ret). Müsaitlik artık reddetmediği için yanıltıcı; metin `nf-db`'nin.
- `GET …/availability/weekly/team` rotasında rotaya özel izin kapısı (`permissions.includes("availability.read")`, `weekly-preferences-routes.ts`) duruyor; servis A'da çekirdeğe taşınmadı. CLAUDE.md §9 hedefine göre ayrı iş.

## Senin yerine verdiğim kararlar (teknik, P19)
- Görev dosyası "`availability-assessment.ts` 'refused' yorumu ve reddi kalkar" diyordu: yorum değişti, **ret kaldı**. DB kısıtı (`scheduling_conflict_rules_valid`) bilinmeyen anahtarı reddediyor; şemanın sessizce düşürmesi P09'a ters olurdu.
- Ekranın çalışır kalması için sunum dosyalarında yalnız işlevsel en küçük uyarlama (CLAUDE.md §4 "veri + çalışan ekran"): düzenleyici her aralığı gösterir (veri kaybı olmasın), keep/cancel bileşeni silindi (şeması yok), "Acknowledged by" satırı silindi (alanı yok), dev önizleme dosyası uyarlandı. Görsel karar yok.
- Settings ayar kaydında rota kapısı kaldırıldı (çekirdek karar veriyor; iki kapı farklı izin adı soruyordu).
- Not, editör ve sürükle-bırakta seçenek (a) gereği C1'e kadar müsaitlik gibi elendi — davranış bugünküyle aynı.

## Skill
- superpowers:test-driven-development — her davranışta önce kırmızı (sayılar yukarıda); bir istisna yazıldı.
- superpowers:verification-before-completion — "yeşil" iddiası kapı log'u ve commit sha'larıyla.
- ecc:api-design açılmadı — sözleşme A'nın raporunda sabitti, tasarım kararı yoktu.
