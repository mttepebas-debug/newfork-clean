# BE-2b API — Kısmi teslim kuralı kapatmaz, panel kimin almadığını söyler

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| Schedule → Export (zamanlanmış e-posta) | EKRAN-01 BE-2b (API + panel satırı) | nf-backend / web hattı | R2 | nf-guvenlik RED @9dc837d5 → ONAY @428d1af0 | 2026-10-06 |

## Sonrası için
- Kural: kısmi teslim `record_schedule_export_schedule_success_service` + `target_undelivered` (ulaşmayan adresler, ≤500); yalnız sıfır teslim başarısızlık servisine gider (`schedule-export-cron.ts`).
- Tuzak: kayda yazılan bir notun ekranda hangi koşulda okunduğuna bak; `last_error` önceden yalnız `auto_disabled_at` doluyken görünüyordu.
- Açık: geçici gönderim hatası (429/5xx) o haftanın kaybı; alıcı başına idempotency anahtarı olduğu için aynı koşuda yeniden deneme güvenli (O1, karar bekliyor).
- Ölçüm: api 996, web 2184 (+1 atlanan) (2026-10-06, `9dc837d5`).

## Rapor

**Karar:** nf-guvenlik ilk tur RED @9dc837d5 (Y1: not ekranda görünmüyordu), düzeltme sonrası ONAY @428d1af0 · sınıf R2
**İzin:** R2 — gönderildi (sha ve CI numarası posta kutusundaki raporda / panoda)
**Risk:** 🟠 kural doğru çalışıyor; açık kalan O1: geçici gönderim hatasında (ör. Resend hız sınırı 429) o kişi o haftanın e-postasını kaçırır, artık panelde görünür ama yeniden denenmez
**Soru:** O1 — geçici hatada ne olsun? (a) **(Önerilen)** ayrı dilim: aynı koşuda ulaşmayanlara bir kez gecikmeli yeniden deneme + alıcılara gönderimi hız sınırının altında tutma (her gönderim alıcı başına idempotency anahtarı taşıdığı için alanlara ikinci kez gitmez). Dayanak: ILKELER P09 (veri sessizce düşmez) + P02. (b) "Geçici hata da o haftanın kaybıdır" diye yazılır, backlog'a not.
**Sonraki:** W-1b'nin kalanı (SchedulePage arayüz hattında; pano "SchedulePage tutuyor" kalkınca)

## 1. Nerede duruyor
Bitti; inceleme ONAY. Veri hattının BE-2b-DB'si (`20261007070000`) ile birlikte kural kapandı.

## 2. Ne yapıldı (öncesi → sonrası)
- **Öncesi:** Schedule → Export → zamanlanmış haftalık e-posta 10 kişiden birine gitmezse "başarısız" sayılıyor, üç haftada kural kendini kapatıyordu. Kural açıkken hata satırı ekranda görünmüyordu.
- **Sonrası:**
  - En az bir kişiye giden e-posta "gönderildi" kaydediliyor, kapanma sayacı sıfırlanıyor, kural açık kalıyor. Yalnız hiç kimseye gitmeyen e-posta başarısızlık sayılıyor (üçte kapanır).
  - Kısmi teslimde not, ulaşmayan adresleri sayıyor: "Not delivered to 1 of 10 recipients: ali@example.test" (en çok 500 karakter; DB de 500'de kesiyor).
  - Export panelinde kuralın altında bu not uyarı satırı olarak görünüyor (80 karakter, üzerine gelince tam metin). Bir sonraki tam teslimde kayboluyor. Kural kendini kapattıysa bugünkü "Auto-disabled - …" satırı aynen.
- **Örnek:** Ayşe'nin 10 alıcılı Pazartesi e-postasında Ali'nin adresi hatalı. 9 kişi almaya devam ediyor; Ayşe Export panelinde "Not delivered to 1 of 10 recipients: ali@…" okuyor; kural kapanmıyor.

## Kanıt
- Önce kırmızı: cron vitest 2 test (kısmi = başarı + not; 500 sınırı) + service vitest 1 (`target_undelivered` geçiyor, tam teslimde geçmiyor); panel vitest 1 ("Unable to find … Not delivered to 1 of 10 recipients: ali@example.test").
- Tam kapı `9dc837d5`: lint + typecheck + test + build EXIT=0 (api 996, web 2184 + 1 atlanan, shared 210, ui 9).
- `428d1af0`: panel vitest 7/7, web typecheck + lint temiz.
- Rebase sonrası tam kapı: gönderimden hemen önce (posta kutusundaki raporda).
- DB davranışı veri hattının pgTAP'ı `scheduled_export_partial_delivery.test.sql` 9/9 ile kanıtlı; yerel DB'de zamanlanmış e-posta satırı yok, canlıda deneme yapılmadı (Resend anahtarı yok, BL-101).
- E2E: zamanlanmış e-postayı kapsayan senaryo yok; etkilenen e2e yok.
- Ekran görüntüsü yok: değişen tek satır mevcut "Auto-disabled" uyarı satırının aynı sınıfı (`small.warning`); görüntü için yerelde zamanlanmış e-posta kaydı kurmak gerekiyor. İstenirse çekerim.

## 3. Açık kalan ve nedeni
- **O1** (yukarıda soru): geçici hatada yeniden deneme yok. Kök: bir kuralın alıcılarına aynı anda, 4 kural paralel gönderim; Resend hız sınırına takılabilir. Backlog önerisi (leave: medium / do: moderate).
- 500 karakterde kesilen not bir adresin ortasında bitebilir ("and N more" daha okunaklı) — görünüm, düşük.
- DB tarafında yalnız boşluktan oluşan notun `null`'a dönmesi pgTAP'ta yok (veri hattına not, önceki incelemeden).

## 4. Ekranda ne değişti
Schedule → Export → zamanlanmış e-posta listesi: kural açıkken son hata (kısmi teslim ya da ilk iki başarısızlık) kuralın altında uyarı satırı olarak görünüyor. Başka değişiklik yok.

## 5. Sırada ne var
- W-1b'nin kalanı (bekliyor).
- O1 kararı → ayrı dilim ya da kayıt.

Skills: superpowers:test-driven-development (cron, service ve panel önce kırmızı), superpowers:receiving-code-review (Y1 doğrulandı ve düzeltildi; O1 gerekçesiyle karara gönderildi), superpowers:verification-before-completion.

## İnceleme

### nf-guvenlik — ilk tur
KARAR: RED @9dc837d5

**Koordinatör için 5 satır**
- **Karar:** RED (R2 bağımsız inceleme). Bir Yüksek, bir Orta bulgu var. Güvenlik tarafı temiz.
- **İzin:** gönderilmesin. Önce Y1 düzelmeli. O1 için de karar gerekiyor.
- **Risk:** 🟠 Kısmi teslimde gitmeyen kişi ekranda hiç görünmüyor. Müdür Export panelinde başarılı bir "Last sent" satırı görüyor, Ali o hafta e-postayı almıyor ve bunu kimse fark etmiyor.
- **Soru:** Koordinatöre bir soru var. Ekrandaki not bu dilime mi eklenecek, yoksa main'e bu dalla birlikte giden ayrı bir arayüz dilimi mi olacak? Bkz. Y1.
- **Sonraki:** Düzeltme gelince yalnız değişen kısmı yeniden incelerim.

## Bulgular

### Yüksek

**Y1. Not veritabanına yazılıyor ama ekranda hiç görünmüyor**
- **Yer:** `apps/web/src/schedule/components/ScheduleExportSchedules.tsx:101-107`.
- **Ne görüldü:**
  - Export panelindeki zamanlanmış e-posta satırı `last_error`'u yalnız `schedule.auto_disabled_at` doluyken gösteriyor.
  - Yeni başarı yolu ise `auto_disabled_at = null` yazıyor (`20261007070000_partial_email_delivery_keeps_the_rule.sql`, `last_error = left(...)` ile aynı `update`). Bu yüzden kısmi teslimin notu hiçbir koşulda ekrana çıkmıyor.
  - Panelde yalnız `formatLastSent(last_sent_at)` görünüyor. Bu satır başarılı bir gönderim gibi okunuyor.
- **Ne beklenirdi:** KARARLAR satır 517 (KK-166) şunu söylüyor: kısmi teslimde kural "o hafta başarısız görünür" ve Export panelinde "Not delivered to 1 of 10 recipients: ali@…" yazısı çıkar. BE-2b-DB raporu da bunu vaat ediyor ("API tarafı gelince Export panelindeki hata satırı kısmi teslimi söyler"). Bu vaat bu commit'le tutmuyor.
- **Bir kişi için etkisi:**
  - Ayşe, Kadıköy'ün haftalık e-postasını 10 kişiye kurmuş. Ali'nin adresi hatalı.
  - Bu commit'ten önce: üç hafta sonra kural kapanıyor ve panelde "Auto-disabled - Not delivered to 1 of 10 recipients…" yazıyordu. Ayşe en geç orada fark ediyordu.
  - Bu commit'ten sonra: kural hiç kapanmıyor ve not hiç görünmüyor. Ali her hafta e-postayı kaçırıyor, Ayşe bunu hiçbir zaman öğrenmiyor. Kural kendini kapatmıyor ama sorun sessizleşti (ILKELER P09: "veri sessizce düşmez").
- **Düzeltme:** `last_error` dolu olduğu her durumda panelde uyarı satırı olarak gösterilmeli. Kural kapalıysa bugünkü "Auto-disabled - …" önekiyle, açıksa yalnız not metniyle. Buna bir vitest eklenmeli: `auto_disabled_at: null` ve `last_error` dolu bir satır, notu ekranda gösteriyor olmalı.
  - Bu dosya sunum katmanında. Koordinatör bunu ayrı bir dilim yapacaksa, o dilim bu dalla aynı gönderimde main'e girmeli. Bu dal yalnız başına giderse sorun sessiz hâliyle canlıya çıkar.

### Orta

**O1. Geçici hata artık o haftanın kesin kaybı; "yeniden denemek aynı kişilere tekrar yollar" gerekçesi zayıf**
- **Yer:** `apps/api/src/schedule/schedule-export-cron.ts:127-158` ve `:20` (`SCHEDULE_EXPORT_CONCURRENCY = 4`).
- **Ne görüldü:**
  - Bir kuralın 10 alıcısına `Promise.allSettled` ile aynı anda istek atılıyor. Dört kural paralel koştuğu için Resend'e bir anda 40 istek gidebiliyor.
  - Geçici bir hata (429 hız sınırı, 5xx, 30 sn zaman aşımı) artık "missed" sayılıyor ve `last_sent_at` yazılıyor. Yani o kişiye bu hafta bir daha denenmiyor.
  - Gerekçe (BE-2b-DB "Sonrası için"): kısmi teslim "gönderildi" sayılmazsa cron aynı kişilere her saat yeniden yollar.
  - Ama her gönderim alıcıya özel bir `Idempotency-Key` taşıyor (`${schedule.id}:${weekStart}:${recipient}`, satır 130). Resend'in belgesine göre aynı anahtarlı istek 24 saat içinde ikinci kez gönderilmiyor. Bu durumda bir sonraki saatte yeniden denemek, alan 9 kişiye tekrar e-posta göndermez; yalnız Ali'ye yeniden dener.
- **Ölçülmeyenler:** Resend hesabının hız sınırını ve anahtar süresini canlıda ölçmedim (anahtar yok). Hesabın limiti yüksekse bu bulgunun şiddeti düşer.
- **Bir kişi için etkisi:** Resend o saniye Ali'nin isteğine 429 dönerse Ali o haftanın programını hiç almıyor. Y1 yüzünden bunu kimse de görmüyor.
- **Düzeltme:** En küçük düzeltme, kaydetmeden önce aynı koşuda yalnız ulaşmayan alıcılara bir kez, kısa bir beklemeyle yeniden denemek. Bunun testi şöyle olabilir: ilk deneme reddedilir, ikincisi geçer, sonuçta not yazılmaz ve `delivered = recipients`. Kuralın ruhu (KK-166) değişmez.
  - Ya da koordinatör "geçici hata da o haftanın kaybıdır" kararını açıkça yazar. O zaman bu bulgu kapanır, ama Y1 düzelmeden kabul edilmemeli.

### Düşük / öneri
- **Not ortadan kesiliyor:** 500 karakterde kesilen not bir adresin ortasında bitebiliyor (ör. "…, person-38@exa"). Kesmeden önce "and N more" ile bitirmek okunaklı olur. Yalnız görünüm meselesi.
- **Eksik pgTAP kontrolü (bu commit'te değil):** Veritabanı tarafında yalnız boşluktan oluşan `target_undelivered` değerinin `null`'a dönmesi test edilmiyor. Bu önceki incelemenin de notuydu.

## Temiz çıkan kontroller
- **Başka workspace'e sızma yok:**
  - Başarı servisi yalnız `service_role`'e açık (migration son iki satır: `public, anon, authenticated`'dan geri alınıyor).
  - Güncelleme `id` ve `workspace_id` ile birlikte süzülüyor. İkisi de cron'un veritabanından aldığı adaydan geliyor, dışarıdan girdi yok.
  - Nota yazılan adresler aynı satırın `recipients` alanında zaten var ve aynı JSON'la (`schedule_export_schedule_json`) aynı okuyuculara gidiyor. Okuma yolu `list_schedule_export_schedules_service`: `authorize(... 'schedule.export')` ve `scope_set` ile lokasyon kapsamına bağlı (`20260927120000_deleted_location_counts_nowhere.sql:375-404`). Yeni bir okuyucu ya da yeni bir alan açılmıyor.
- **Sağlayıcı hata metni sızmıyor:** Notta Resend'in cevap gövdesi yok, yalnız adresler var (`resend-email.ts:54-55` gövdeyi bilerek atıyor). Log'a kişisel veri eklenmemiş.
- **500 karakter sınırı üç katmanda tutarlı:** API'de `.slice(0, 500)`, veritabanında `left(..., 500)`, paylaşılan şemada `last_error: z.string().max(500)` (`packages/shared/src/index.ts:2305`).
- **Sıra eşleşmesi doğru:** `Promise.allSettled` giriş sırasını koruyor. `recipients.filter((_, i) => deliveries[i]...)` doğru eşliyor. 40 alıcılı test bunu kanıtlıyor: yalnız `person-0` gidiyor, not "person-1@…" ile başlıyor.
- **Sayaçlar doğru:** kısmi teslim `sent +1, failed 0`; sıfır teslim `failed +1` ve başarısızlık servisi; tam teslimde 6. parametre gönderilmiyor. Bu, sözleşmeyle (BE-2b-DB §3) birebir aynı.
- **İkiz ya da ölü kod yok:** `recordScheduledExportSuccess`'i yalnız cron çağırıyor. Eski D-D4 testi yeni kurala göre yeniden yazılmış.

## Kanıt
- `pnpm.cmd --filter @newfork/api exec vitest run src/schedule/schedule-export-cron.test.ts src/schedule/schedule-service.test.ts` sonucu: 2 dosya, 45/45 geçti (2026-10-06, worktree `optimistic-dewdney-c78421`, HEAD `9dc837d5`, taban `origin/main` `380ee05e`).
- typecheck ve lint'i yeniden koşmadım. Oturumun bildirdiği "temiz" sonucu kabul ettim; diff küçük ve tip yüzeyi tek bir opsiyonel alan.
- Okunan dosyalar: migration `20261007070000`, `20260907102000_schedule_export_schedules.sql` (JSON alanları), `ScheduleExportSchedules.tsx:90-115`, `resend-email.ts`, `docs/plan/ekranlar/01-schedule/uygulama/BE-2b-DB.md`, KARARLAR satır 517.

## Hafıza notu (dosyaya yazılmadı)
- **Ekranda görünme koşulu:** Bir "durum notu" alanının yazıldığı yeni bir yol eklendiğinde, ekranın o alanı hangi koşulda gösterdiğine bakılmalı. Burada `last_error` yalnız `auto_disabled_at` doluyken gösteriliyordu, yeni başarı yolu ise o alanı `null` yaptı ve not hiçbir koşulda görünmez oldu. Önceden görünür olan sorun sessizleşti. Kontrol listesine eklenecek madde: "kayda yazılan not ekranda hangi koşulda okunuyor?"
- **"Yeniden denemek tekrar gönderir" gerekçesi:** Bu gerekçe gelince gönderimde alıcı başına idempotency anahtarı olup olmadığına bakılmalı. Anahtar varsa yeniden deneme güvenli olabilir ve "deneme yok" kararı geçici hatayı kesin kayba çevirir.

### nf-guvenlik — Y1 düzeltmesi
KARAR: ONAY @428d1af0

**Koordinatör için 5 satır**
- **Karar:** ONAY (R2). Y1 kapandı, yeni bulgu yok.
- **İzin:** R2 olduğu için oturum gönderebilir: rebase sonrası tam kapı yeşil olmalı.
- **Risk:** 🟢 Ali'ye gitmeyen haftalık e-posta artık ekranda görünüyor; tek sınır O1 (aşağıda).
- **Soru:** O1 senin kararına kaldı.
- **Sonraki:** Yok. O1 için ayrı bir dilim açılırsa onu incelerim.

**O1 ONAY'ı engellemiyor:** "Geçici hatada aynı koşuda bir kez yeniden deneme + gönderim hızını sınırlama" senin kararına bırakılabilir. Gerekçe: ilk turda O1'i Orta saymamın asıl nedeni sorunun ekranda sessiz kalmasıydı, o da Y1 ile kapandı. Ama karar yazılana kadar bir kişinin geçici bir hata yüzünden o haftanın e-postasını kaçırması mümkün: Resend hız sınırı (429) yüzünden Ali'ye o hafta gitmeyebilir, yalnız artık panelde görünür. Bu yüzden konu bir backlog maddesi olarak açık kalmalı.

## Y1 doğrulaması (yalnız `git diff 9dc837d5..428d1af0`)
- **Ne değişti:** Schedule → Export → zamanlanmış e-posta listesinde, kural açıkken de `last_error` dolu olduğunda uyarı satırı çıkıyor (`apps/web/src/schedule/components/ScheduleExportSchedules.tsx:108-112`). Satır 80 karaktere kesiliyor, tam metin `title` ile üzerine gelince okunuyor. Kural kapalıysa bugünkü "Auto-disabled - …" satırı aynen kalıyor; iki satır birlikte çıkmıyor.
- **Somut örnek:** Ayşe'nin 10 alıcılı kuralında Ali'ye gitmeyen haftadan sonra satırın altında "Not delivered to 1 of 10 recipients: ali@example.test" yazıyor. Bir sonraki tam teslimde `last_error` boşalıyor ve satır kayboluyor.
- **Test:** Yeni vitest kural açıkken (`auto_disabled_at: null`) notun göründüğünü ve "Auto-disabled" yazmadığını kontrol ediyor. Düzeltme satırı silinirse bu test düşer: notu ekrana yazan başka bir yol yok.

## Düşük (bilgi)
Yeni dal yalnız kısmi teslimde değil, ilk iki tam başarısızlıkta da devreye giriyor. O haftalarda da satır başarısızlık sebebini gösteriyor, ör. "Schedule email delivery failed (429)". Bu, KARARLAR'daki "o hafta başarısız görünür" kuralıyla uyumlu. Sağlayıcının cevap gövdesi metne girmiyor (`resend-email.ts:54-55`); aynı metin bugün de kural kapandığında gösteriliyordu. Yeni bir sızma yolu yok.

## Kanıt
- `git log 9dc837d5..428d1af0`: tek commit (`428d1af0`), 2 dosya, +33 satır.
- `pnpm.cmd --filter @newfork/web exec vitest run src/schedule/components/ScheduleExportSchedules.test.tsx`: 7/7 geçti. Worktree `optimistic-dewdney-c78421`, HEAD `428d1af0`, 2026-10-06.
- Testin düzeltmeden önce kırmızı olduğunu kendim koşmadım; bunu kodu okuyarak çıkardım.
- typecheck ve lint'i yeniden koşmadım; oturumun "temiz" raporuna dayandım. Diff tek bir JSX dalı ve bir test.

## Hafıza notu (dosyaya yazılmadı)
"Kayda yazılan not ekranda hangi koşulda okunuyor?" sorusu bu turda gerçek bir açığı yakaladı. Bu tür notlarda düzeltme, notu yazan yolu değil ekrandaki koşulu genişletmekle yapılıyor; inceleme listesine eklenmeye değer.
