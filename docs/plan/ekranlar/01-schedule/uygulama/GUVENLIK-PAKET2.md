# nf-guvenlik — EKRAN-01 paket 2 (task/ekran-01-p2), 2026-10-07

İki tur, alt ajanın kendi metni (değiştirilmeden). Tur 2 ONAY @0a4a8257 = rebase sonrası @ac01d469 (içerik aynı).

## Tur 1

RET (DEĞİŞİKLİK İSTE) @7d51a76e

Kritik ya da Yüksek bulgu yok. Güvenlik tarafı temiz: zamanlayıcı sırrı artık sabit sürede karşılaştırılıyor, bir workspace'ten başkasının verisine giden yeni bir yol da yok. Ret, #44'teki bir gerilemeden: uygulamanın kendi yazdığı yol gösteren cümleler artık ekrana çıkmıyor, yerine genel bir hata cümlesi geliyor.

## Orta

**O1. Uygulamanın kendi uyarıları "Newfork could not finish that. Try again in a moment." oluyor (#44)**
- Neden: `apps/web/src/lib/request-error.ts` içindeki `requestErrorText`, sayısal `status` ya da `reason` taşımayan her hatayı genel cümleye çeviriyor. Uygulamanın kendi attığı `new Error("<cümle>")` hataları ikisini de taşımıyor.
- Etkilenen yerler, hepsi bu dalda yeni bağlandı:
  - `apps/web/src/schedule/schedule-data.ts:402`: "Someone is editing this draft. Try again when they finish." (D-O6 kararı). Yol: `SchedulePage.tsx:909` taslak silme. Müdür bir taslağı silmek istiyor, başka bir müdür o taslağı düzenliyor. Müdür artık genel cümleyi görüyor; neden silinmediğini öğrenemiyor.
  - `SchedulePage.tsx:3262`: "Past schedule weeks cannot be unpublished." Yol: `UnpublishScheduleDialog.tsx:71`. Ekran kalıcı bir reddi "biraz sonra yeniden dene" diye gösteriyor; müdür boşuna yeniden deniyor.
  - `SchedulePage.tsx:1311` ve `useScheduleEditSession.ts:219`: EDIT_NOT_RECONNECTED (D-Y3 kararı). Yollar: kaydetme (`SchedulePage.tsx:1274-1277`, durum kodu olmayan hata `requestErrorText`'e düşüyor) ve değişiklik (`:1417`). Düzenleme kilidi iki kez düşünce "bağlantıyı kontrol et" cümlesi kayboluyor.
  - `SchedulePage.tsx:3227`, `:3230` ve `schedule/lib/schedulePreflightReturn.ts:20` ile `:23`: "Save or close your current draft…" ve "This shift is no longer in the draft. Refresh the pre-flight check." Yol: `PublishScheduleDialog.tsx:786`. Müdür bunların yerine "The shift could not be opened. Try again." görüyor.
  - `schedule/export-v2/excel.ts:69`, `:88` ve `pdf.ts:21`: "…Choose PDF with one long page" yönlendirmesi. `ExportController.tsx:160` yalnız `ExportImageTooLargeError`'u koruyor; müdür "Could not prepare this export" görüyor ve hangi biçimi seçeceğini bilmiyor.
- Kanıt: `requestErrorText(new Error(<bu cümlelerin her biri>), 'FALLBACK')` beşinde de `FALLBACK` döndü (aşağıdaki node komutu).
- Beklenen: bu cümleler bir işaret taşımalı. Örneğin `new RequestError(cümle, "schedule.<anahtar>")` ile atılabilir; yardımcı, `reason` taşıyan hatanın cümlesini zaten gösteriyor. Ya da ayrı bir "uygulamanın kendi cümlesi" sınıfı kullanılabilir.
- Her cümle için ekran düzeyinde kırmızı-yeşil test gerekli. Bugünkü testler bu kaybı yakalamıyor:
  - `schedule-data-errors.test.ts:28` hatanın mesajına bakıyor, ekrana değil.
  - `App.test.tsx:2157`'nin adı "says the edit could not be reconnected" ama içinde yalnız ham kilit metninin görünmediği kontrol ediliyor. EDIT_NOT_RECONNECTED'in ekranda göründüğü kontrol edilmiyor; yani test boşa çalışıyor, güçlendirilmeli.

## Düşük

**D1.** `apps/web/src/schedule/components/scheduleExportDownload.ts:37` hâlâ ham `error.message` döndürüyor; #44'ün 28 yerinin dışında kalmış. 5xx artık istek katmanında sade cümleye çevrildiği için etkisi küçük; ağ ve tarayıcı dışındaki hatalar yine ham görünür.

**D2. (Kapsam dışı, soru üzerine; yalnız kod okuması)** "Active cover and swap requests for removed shifts will be closed." satırı kodla uyuşmuyor görünüyor.
- `unpublish_schedule_service` (`supabase/migrations/20261007050000_…sql:681`) talepleri kapatmıyor.
- Tek bağlı tetikleyici `weekly_exchange_publication_terms_changed`, `refresh_weekly_exchange_terms`'i çağırıyor. Vardiya yayından kalkınca bu fonksiyonda `weekly_exchange_same_responsibility(snapshot, null)` false dönüyor ve fonksiyon erken çıkıyor; talep `open` kalıyor.
- Talep kapanmıyor, yalnız onay anında "The published shift changed or was unpublished" engeline takılıyor.
- Ekran şu an olmayan bir şeyi vaat ediyor. Ayrı backlog maddesi olarak açılmalı; DB'de koşturarak doğrulamadım.

## Maddelere göre hüküm

- **#22 zamanlayıcı sırrı: temiz.**
  - İki taraf sha256 ile özetlenip `timingSafeEqual` ile karşılaştırılıyor. Uzunluk farkı da ilk farklı karakter de sızmıyor.
  - Başlık yoksa `false` → 401. Dizi başlıkta ilk değer alınıyor. "Bearer " önekli başlık, başka biçimdeki Authorization başlığından önce okunuyor; bu önceki davranışla aynı. Boş sır ayarı 503 alıyor ve bu kontrol karşılaştırmadan önce yapılıyor.
  - 503/401 cevapları dört rotada da değişmedi.
  - `apps/api/src` içinde başka bir sır, imza ya da webhook karşılaştırması yok; `x-cron-secret`'i okuyan tek dosya kalmış.
- **#44 ham hata metni: yetki ekranları bozulmamış, testler gerçeğe uyarlanmış.**
  - `isNoAccess` ve `isScheduleAccessRefused` dokunulmadan önce çalışıyor.
  - 5xx'te gövde korunuyor; `pdf_render_unavailable` gövdeden okunmaya devam ediyor (`scheduleExportDownload.ts:32`).
  - 4xx'te API'nin cümlesi korunuyor.
  - 7 testteki değişiklik beklenti gevşetmesi değil, gerçek hata biçimine uyarlama; `usePreviewSource` testinde beklenti sıkılaştırılmış.
  - Tek sorun O1.
- **#45 Unpublish metni:** "Employees stop seeing…" ve "Publish again…" kodla tutarlı; yayından kaldırma taslağı silmiyor.
- **#30 revizyon numarası:** temiz; dört yer de testle kilitli.

## Kanıt (2026-10-07; worktree HEAD = 7d51a76e, temiz)
- `pnpm.cmd --filter @newfork/api exec vitest run src/cron-secret.test.ts src/account/account-deletion-routes.test.ts` → 2 dosya, 5 test geçti.
- `pnpm.cmd --filter @newfork/web exec vitest run src/lib/request-error.test.ts src/schedule/components/UnpublishScheduleDialog.test.tsx src/schedule/schedule-data-errors.test.ts src/schedule/export-v2/ExportController.test.tsx` → 4 dosya, 27 test geçti.
- `node --experimental-strip-types` ile `requestErrorText(new Error(<5 yerel cümle>), 'FALLBACK')` → beşi de `FALLBACK`. O1 gerçek; mevcut testler yeşil kalıyor.
- `git diff origin/main...task/ekran-01-p2` okundu: 8 commit, 30 dosya.

## Hafıza önerisi
Hata metni süzgeci eklenince, süzgecin geçirdiği hata türleri dışında kalan uygulama cümlelerini ara: status ya da `reason` taşımayan `throw new Error("<kullanıcı cümlesi>")` genel cümleye düşer. Değişen catch bloklarının arkasındaki her `throw new Error(` yolunu izle (BL-395, EKRAN-01 p2).

## Tur 2

ONAY @0a4a8257

İkinci tur temiz: ilk turdaki O1 ve D1 kapandı, yeni bulgu yok.

**O1 kapandı.**
- `apps/web/src/lib/request-error.ts`'e eklenen `ScreenError`, uygulamanın kişiye yazdığı cümleyi işaretliyor; `requestErrorText` bu cümleyi gösteriyor. Düz `Error` (programcı mesajı, ör. "Schedule storage is not configured") yine sade cümleye düşüyor; ham metin sızıntısı geri gelmedi.
- 11 atma noktasının hepsi diff'te `ScreenError` olmuş: schedule-data.ts:402, SchedulePage 1311/3227/3230/3262, useScheduleEditSession 219, schedulePreflightReturn 20/23, excel 69/88, pdf 21.
- `ExportImageTooLargeError` artık `ScreenError`'dan türüyor. Eski özel yardımcı silinmiş, yerinde ikiz kod kalmamış.
- Kaydetme yolu (`SchedulePage.tsx:1274-1277`) ve değişiklik yolu `ScreenError`'u `requestErrorText` üzerinden gösteriyor. "Kilit iki kez düştü" ekran testi artık EDIT_NOT_RECONNECTED cümlesini de arıyor; ilk turda bu kontrol eksikti.
- Testlerdeki değişiklik beklentiyi gevşetmiyor, sıkılaştırıyor. Yeni "past week" App testi iki şeyi kontrol ediyor: cümle pencerede görünüyor ve `unpublishSchedule` çağrılmıyor.
- `beforeEach`'e eklenen mockReset doğru: yeni testin çağrısının sonraki testlere sızmasını kesiyor.

**D1 kapandı.**
- `scheduleExportDownload.ts` artık `requestErrorText` kullanıyor. Başarısızlıkta 4xx'in kendi cümlesi korunuyor; ham `Error` sade bir yedek cümleye düşüyor. Tasarımdaki `pdf_render_unavailable` dalı bu kontrolden önce kalmış.

**Düşük, yalnız not; düzeltme gerekmiyor:** `settings/organization-data.ts:216-223`'teki logo doğrulama cümleleri hâlâ düz `Error`. Ekranda "Logo could not be saved." görünür. Ama `ScheduleLogoUploadDialog.tsx:336-341` aynı kontrolü gönderimden önce yapıyor, yani kişi bu yola pratikte düşmez.

**Kanıt** (worktree HEAD = 0a4a8257, temiz; `git diff 7d51a76e..0a4a8257` okundu, 16 dosya):
- `pnpm.cmd --filter @newfork/web exec vitest run src/lib/request-error.test.ts src/schedule/schedule-data-errors.test.ts src/schedule/lib/schedulePreflightReturn.test.ts src/schedule/components/scheduleExportDownload.test.ts src/schedule/export-v2 src/schedule/components/UnpublishScheduleDialog.test.tsx` → 12 dosya, 89 test geçti, 1 test atlandı.
- `vitest run src/App.test.tsx -t "past week cannot be unpublished|could not be reconnected|unpublish"` → 6 test geçti, 92 test filtre dışında kaldığı için atlandı.
- `pnpm.cmd --filter @newfork/web typecheck` → çıkış kodu 0.
- Kırmızı kanıtını (eski koda dönünce testlerin düşmesi) kendim tekrarlamadım; oturumun beyanına dayanıyor.

**D2 bu işin dışında kaldı.** Yayından kaldırma, açık cover ve swap taleplerini kapatmıyor; ekran ise "kapanacak" diyor. Ayrı backlog maddesi olmalı.

**Hafıza önerisi:** Hata metni süzgecinde "kişiye yazılmış cümle" bir sınıfla işaretlenince (`ScreenError`), yeni eklenen her `throw new Error("<kullanıcı cümlesi>")` sessizce sade cümleye düşer. İncelemede değişen catch bloklarının arkasındaki atma noktalarını tara (BL-395, EKRAN-01 p2).
