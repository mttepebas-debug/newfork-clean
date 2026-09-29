# G11 — Hata sözleşmesi ve hata görünürlüğü: kararlar ve devir notu

Dal `task/g11-error-contract` (worktree `.claude/worktrees/exciting-fermi-8887dd`), taban `origin/main`
`ca55fa7a` (rebase 2026-09-29). Push yok; koordinatör tek push'la alır. İnceleme sınıfı R2 →
`nf-guvenlik` tek bağımsız inceleme (koordinatör kararı).

## Koordinatör kararları (2026-09-29)
- S1 (a): G11'de yalnız U42'nin P1 kalemi (tipli hata, tek hata işleyici). P2 ve fırsatçı kalemler
  ayrı madde önerisi (aşağıda); major sürüm atlama yeni bağımlılık → kullanıcı listesi.
- S2: BL-193, BL-324 ve `SchedulePage.tsx` `followUpAfterUnpublish` onError'unun ham
  `(error as Error).message`'ı, G1 (T4 toplu dalı) main'e girince yapılır; koordinatör "başla" der.
  O zaman `origin/main`'e rebase.
- S3 (a): BL-145 + BL-156 hint'i migration + tek yeni pgTAP dosyası; BL-356 (3) aynı dosyada.
  Migration aralığı 20260930090000–20260930115959 (G7 Dal A 20260930120000+).
- S4 (a): Settings yazma kapısının çekirdeğe (`authorize(context, action)`) çevrilmesi ayrı R3 iş.

## Kural (bu işte yerleşen)
- API'de durum kodu mesaj metninden seçilmez. Servis DB hatasını `rpcFailure(error)` ile atar;
  TS'te bilerek verilen ret `new HttpError(msg, status, { reason })`. Rota yakalamaz; tek cevap
  `replyWithError` (`apps/api/src/http-error.ts`), `app.ts` onu `setErrorHandler`'a verir. Çıplak
  Fastify'la rota testi yazarken `app.setErrorHandler(replyWithError)`.
- 500'de ekrana özel cümle gereken yer (Availability, Shift changes) yalnız 5xx'i yakalar:
  `if (error instanceof HttpError && error.statusCode < 500) throw error;`.
- Oturum hiç yoksa ortak çözücüler 401 `session.required` atar (BL-076); üye olmayana 404 aynı.
- Web'de hata sınıfı, testlerin bütünüyle taklit ettiği `*-data.ts`'te değil kendi modülünde
  yaşar (`lib/request-error.ts`, `employees/invitation-error.ts`).

## Bilinen tuhaflıklar
- Shift changes eligibility gerekçeleri DB'den JSON dizi olarak gelir (PT409); `rpcFailure` bu
  diziyi Postgres cümlesi sayıp silmez (`reasonList`).
- 22023 / 23514 artık her yerde 400; Availability ve Shift changes eskiden 422, takas 55000'e 423
  diyordu. Web yalnız 403/404/409'a bakıyor (ölçüldü).
- `/v1/me/onboarding/ssn` rotası duruyor; ROADMAP "SSN yok" diyor — G11 dışı, raporda.

## Kalan
- BL-193, BL-324, SchedulePage onError: "başla" bekliyor.
