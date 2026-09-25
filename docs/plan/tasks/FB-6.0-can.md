# FB-6.0-can Yetki sözleşmesinin web tarafı doğuyor (`can()` + `isNoAccess()`)
Status: taslak (kullanıcı başlama onayı BEKLİYOR)
Takım: Mühendislik   Branch: task/muhendislik/FB-6.0-can   DB: gerekmiyor
Reviewer: guvenlik (Mühendislik) · Strateji inceleme (main öncesi)

Numara neden 6.0: FB-6.1a/b/c/d ve kalan 7 dilim bu dosyada doğan yardımcıları
kullanacak. Önce bu girer, sonra dilimler.

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
  satır 1946, 2219, 2229, 2583, 3312). Schedule'ınkiler FB-6.1a'da, kalan 49'u
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
