# FB-6.0-can Yetki sözleşmesinin web tarafı doğuyor (`can()` + `isNoAccess()`)
Status: done (2026-09-25)
Rol: nf-backend   Branch: task/FB-6.0-can   DB: gerekmiyor
Reviewer: nf-guvenlik

Numara neden 6.0: FB-6.1 (adım `.9`) ve kalan 7 dilim bu dosyada doğan yardımcıları
kullanacak. Önce bu girer, sonra dilimler.

> **Doğrulama (koordinatör, 2026-09-25, `27e2062`):** `can.ts` ve `isNoAccess` yok, `packages/shared/src/authorization.ts` yok, web'de 54 `permissions.includes`, `SchedulePage.tsx` satırları doğru. Sayım düzeltmesi: Schedule ekranlarında 5 değil **10** satır (SchedulePage 5 + Requests 3 + Templates 1 + SchedulingSettings 1); kalan 44 kendi dilimlerinde. "FB-6.1a" adları yok; FB-6.1 adımları `.0`–`.14`.

Goal:
Yetki kararının tek bir yerden okunduğu web sözleşmesi doğsun: paylaşılan eylem
kataloğu + saf `expected()`, `can()` yardımcısı ve "hayır" cevabını tanıyan
`isNoAccess()`. Bu dosya yalnız DOĞURUR; hiçbir ekranı bu sözleşmeye taşımaz.

Neden ayrı dosya (pre-mortem İtiraz 1, kabul edildi):
FOUNDATION-B planı satır 170 bunların Aşama 4 sonunda geleceğini söylüyordu;
gelmemiş. Bugün `origin/main`'de (`8cff17e`) doğrulandı: `apps/web/src/auth/`
altında `can.ts` YOK, `isNoAccess` kodda 0 sonuç, `packages/shared/src/` altında
`authorization.ts` YOK. Bu iş Schedule diliminin içinde dururken hem pilot
ölçümünü kirletiyor hem de Schedule'a ait olmayan bir masrafı Schedule'a
fatura ediyordu.

In scope:
- `packages/shared/src/authorization.ts`: eylem kataloğu + saf `expected()`.
- `apps/web/src/auth/can.ts`: `can(context, action, target?)`.
- `apps/web/src/lib/` içinde `isNoAccess(e)`: API'nin 403/404 + `authz.*`
  cevabını tek yerde tanır.
- `authorization_matrix.expected.json` dökümü ve TS `expected()`'in SQL ile
  hücre hücre uyuştuğunu kanıtlayan vitest.

Out of scope:
- Hiçbir ekranın bu yardımcılara taşınması. Web'de bugün 54 satır
  `permissions.includes` var; beşi Schedule'da (`apps/web/src/views/SchedulePage.tsx`
  satır 1946, 2219, 2229, 2583, 3312). Schedule'ınkiler FB-6.1 adım `.9`'da, kalan 44'ü
  kendi dilimlerinde taşınır. Bu dosya hiçbirine dokunmaz.
- ESLint `no-restricted-syntax` yasağı. Bugün konursa henüz taşınmamış 7 dilimi
  kırar; yasak son dilim taşındıktan sonra konur.

Done when:
- `pnpm.cmd --filter @newfork/shared test` ve `--filter @newfork/web test` yeşil;
  yeni vitest, SQL matrisinden dökülen her hücrenin TS `expected()` ile aynı
  cevabı verdiğini gösteriyor (uyuşmazlıkta kırmızı olduğu bir kez kanıtlanmış).
- `pnpm.cmd typecheck` ve `pnpm.cmd lint` yeşil (ayrı kapılar, `test` yeşili
  yetmiyor).
- `grep -rn "isNoAccess" apps/web/src` artık sonuç veriyor ve yalnız tanımı +
  testi listeliyor (henüz çağıran yok, bu beklenen).

Touches:
- Mühendislik: `packages/shared/src/authorization.ts` (yeni),
  `apps/web/src/auth/can.ts` (yeni), `apps/web/src/lib/` (yeni `isNoAccess`),
  ilgili `*.test.ts` dosyaları.
- Tasarım: yok.

Test plan:
- vitest: `packages/shared` katalog/`expected()` testi, `apps/web` `can()` ve
  `isNoAccess()` testleri.
- pgTAP: yok (SQL değişmiyor); matris dökümü var olan testten okunur.
- `db.lock` beklemesi: bu dilimde DB kilidi gerekmiyor; süre raporunda "bekleme 0".

Risk:
- Ekran davranışı DEĞİŞMEZ; hiçbir ekran bu yardımcıları henüz çağırmıyor.
  Plan satır 158'in "ekranı geride kalan dilim birleşmez" kuralı bu yüzden
  ihlal edilmiyor.
- Katalog SQL'deki gerçeğin ikizi olur ve sessizce ayrışabilir. Karşı tedbir:
  uyuşmayı kanıtlayan vitest bu dosyada doğuyor, sonradan eklenmiyor.

## Notes / Result
- 2026-09-25 **bitti** (`16deff0`, `f7c6772`). Rol: `nf-backend`; inceleme `nf-guvenlik` (ilk tur DEĞİŞİKLİK İSTE: kişiye bağlı 12 eylemde kişi verilmezse `expected()` "evet" dönüyordu — fail-open; düzeltildi, tipte de kişi zorunlu; ikinci tur `ONAY @995277e`, rebase sonrası `f7c6772`).
- Ne doğdu: `packages/shared/src/authorization.ts` (60 eylem, 28 matris eylemi için `expected()`), `authorization-matrix.expected.json` (1890 hücre, `pnpm.cmd --filter @newfork/shared dump:authz-matrix`, matris dosyasına sha256 ile bağlı), `apps/web/src/auth/can.ts`, `apps/web/src/lib/no-access.ts`; `RequestError` durum kodunu taşıyor.
- Kanıt: 1890 hücre SQL = TS; uyuşmazlıkta kırmızı (`1 failed`) ve kişi kontrolü silinince `12 failed` kanıtlandı. shared 154 test, web auth+lib 56 test, typecheck 6/6, lint 0 hata. `permissions.includes` 54 (dokunulmadı), `supabase/` ve `apps/api/` değişmedi.
- Kullanım (FB-6.1 `.9` için): `can(context, "schedule.templates")` (sunucu listesi), `can(context, "schedule.publish", { locations: [id] })` (matris kuralı; `[]` asla "her yer" değil), kişiye bağlı eylemlerde `person` zorunlu; `isNoAccess(error)` yalnız 403/404 + `authz.*`.
- Açık: BL-128 (FB-6.1 `.9` ön koşulu), BL-129, BL-130.

