# BE-2b-O1 — Haftalık e-postada bir kez yeniden deneme ve gönderim sırası

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| Schedule → Export (zamanlanmış e-posta) | EKRAN-01 BE-2b-O1 (Mert: "Bir kez yeniden dene") | nf-backend / web hattı | R2 | nf-guvenlik ONAY @1c18990b (+ Orta-1 test düzeltmesi) | 2026-10-06 |

## Sonrası için
- Kural: ulaşamayan alıcı aynı koşuda 5 sn sonra bir kez yeniden denenir, aynı alıcı-başı anahtarla; bütün gönderimler 600 ms aralıklı tek sırada (`schedule-export-cron.ts` `paced`).
- Tuzak: `hedef - Date.now()` ile süre hesaplayan kodun testinde saat dondurulmazsa tam milisaniye beklentisi yükte ara sıra düşer.
- Tuzak: Resend 15 dk çökerse aynı saatte üç hata birikip kural kapanabilir (backlog önerisi, nf-db).
- Ölçüm: api 1009 (2026-10-06, `6ebc43bd`).

## Rapor

**Karar:** nf-guvenlik ONAY @1c18990b (R2); inceleme Orta-1 (yalnız test) düzeltildi `6ebc43bd`'de
**İzin:** R2 — GONDERIM_SATIRI; ekran değişmiyor (gece kuralına göre gönderilebilir)
**Risk:** 🟢 mükerrer e-posta yolu yok (alıcı başı idempotency anahtarı), KK-166 korunuyor
**Soru:** yok
**Sonraki:** EKRAN-02 B1a (dal, push yok)

## 1. Nerede duruyor
Bitti, main'de. Mert'in seçimi: "Bir kez yeniden dene".

## 2. Ne yapıldı (öncesi → sonrası), Schedule → Export → zamanlanmış haftalık e-posta
- **Öncesi:** bir alıcıya gönderim geçici bir hatayla (Resend 429 "çok hızlı", kısa kesinti) düşerse o kişi o haftanın e-postasını hiç almıyordu; on alıcıya aynı anda istek gidiyordu, dört kural paralel.
- **Sonrası:**
  - Ulaşamayan alıcılar aynı koşuda 5 sn sonra bir kez daha deneniyor, aynı alıcı-başı anahtarla (`kural:hafta:alıcı`); alanlar ikinci kez almıyor (Resend aynı anahtarı 24 saat yeniden teslim etmez).
  - Koşudaki bütün gönderimler tek sıra: her biri bir öncekinden en az 600 ms sonra (Resend varsayılanı 2 istek/sn'nin altı), paralel kurallar arasında da.
  - Kısmi teslim kuralı aynen (KK-166): yeniden denemeden sonra hâlâ kaçıran varsa not onu adlandırır, kural açık kalır; hiç kimseye ulaşmazsa başarısızlık.
- **Örnek:** Ayşe'nin Pazartesi 08:00 e-postası Ali'ye 429'a takılır; 5 sn sonra Ali alır, kayıt "teslim edildi".
- **Teknik karar (P19):** koordinatörün "birkaç dakika sonra"sı yerine 5 sn: sunucusuz fonksiyon dakikalarca bekleyemez (`vercel.json`'da `maxDuration` yok); kimseye ulaşmayan e-posta zaten 5 dakikada bir koşan sonraki tetikte yeniden ele alınıyor; 429 birkaç saniyede açılıyor. İnceleme bunu doğru buldu.

## Kanıt
- Önce kırmızı: 3 yeni test (kurtarılan alıcı teslim sayılır, herkes aldıysa yeniden deneme yok, gönderim sırası) — `scheduleExportTiming` yokken hepsi düştü.
- İnceleme Orta-1: sıra testi saat dondurmadan tam milisaniye bekliyordu (yükte ara sıra 599/1199) ve tek kural kuruyordu → saat donduruldu, test iki kuralla [600, 1200, 1800] bekliyor, sahteler her testten sonra geri alınıyor (`6ebc43bd`); eski havuz yorumu güncellendi.
- Tam kapı (`6ebc43bd`, origin/main 9146ba6b; tek ağır iş kuralı, db.lock ile): lint + typecheck + test + build EXIT=0 — api 1009, web 2210 (+1 atlanan), shared 210, ui 9.
- E2E: zamanlanmış e-postayı kapsayan senaryo yok; ekran değişmedi.

## 3. Açık kalan ve nedeni
- **Backlog önerisi (inceleme, önceden vardı):** Resend ~15 dk çökerse kural kendiliğinden kapanabiliyor: kimseye ulaşmayan her 5 dakikalık koşu hata sayacını artırıyor, aynı saatte üç hata birikiyor (`20260907107000_schedule_export_schedule_cron.sql:116-124`). Öneri: aynı saatteki tekrarlar tek hata sayılsın (nf-db). leave: medium / do: safe.
- **Düşük (inceleme):** ilk istek bizde 30 sn'de kesilip Resend'de sürüyorsa ikinci deneme 409 alır, kişi e-postayı alır ama not "Not delivered" der — nadir.
- **Ölçülmedi:** Vercel'in canlı süre sınırı (fluid compute açıksa 300 sn); kuyruk dakikada ~100 gönderim çıkarıyor, bir kuralda en çok 10 alıcı.

## 4. Ekranda ne değişti
Görünürde bir şey değişmedi.

## 5. Sırada ne var
EKRAN-02 B1a (Requests veri katmanı; dal + görüntü, push yok).

Skills: superpowers:test-driven-development, superpowers:receiving-code-review, superpowers:verification-before-completion.

## İnceleme

### nf-guvenlik
KARAR: ONAY @1c18990b

Sınıf R2. Kritik ya da Önemli (Yüksek) bulgu yok. Kodda bir güvenlik açığı yok: workspace sınırı, yetki ve sır tarafında değişiklik yok. Bir Orta (yalnız test dosyasında) ve üç Düşük not var. Orta notun gönderimden önce düzeltilmesini öneriyorum.

## Koordinatör için 5 satır
- **Karar:** ONAY @1c18990b (R2, tek bağımsız inceleme).
- **İzin:** R2, koşullar tamamsa oturum kendisi gönderir. Orta bulgu yalnız test dosyasında; düzeltilirse yeniden inceleme gerekmez.
- **Risk:** 🟢 Mükerrer e-posta yolu yok, kısmi teslim kuralı (KK-166) korunuyor. 🟠 Gönderim aralığını ölçen test arada bir sebepsiz kırmızı çıkabilir.
- **Soru:** yok. Canlıda Vercel fonksiyonunun süre sınırını ölçmedim (Düşük-1).
- **Sonraki:** Orta-1'i tek satırla düzelt, sonra gönder.

## Rebase kontrolü
- 1c18990b ile 73ae3646'nın değişikliği birebir aynı (iki commit'in `git patch-id` değeri aynı: `6fcb3a51…`). `apps/api/src/schedule/` altında iki commit arasında fark yok.
- Tabanla ilgili küçük düzeltme: 1c18990b'nin tabanı 29e504d5 değil, bugünkü origin/main olan 9e390950. 9e390950 yalnız `docs/plan` dosyalarına dokunuyor.
- `git diff origin/main...1c18990b` yalnız iki dosya gösteriyor: `schedule-export-cron.ts` ve testi.
- Gönderen Resend istemcisinde, cron ucunda ve `vercel.json`'da fark yok. İlk turdaki okuma geçerli.

## Neydi, ne oldu
- **Önce:** Haftalık Schedule e-postası bir alıcıya ulaşmazsa (ör. Resend "çok hızlı" deyip 429 dönerse) o kişiye o hafta hiç gitmiyordu.
- **Şimdi:** Ulaşamayan alıcı aynı çalışmada 5 sn sonra bir kez daha deneniyor. Örnek: Ayşe'nin Pazartesi 08:00 kuralı Ali'ye ilk denemede ulaşamazsa, Ali e-postayı 5 sn sonra alır ve kayıtta "teslim edildi" görünür.
- Ekranda değişen bir şey yok.

## Bulgular

### Kritik
Yok.

### Önemli (Yüksek)
Yok.

Mükerrer gönderim yolu da yok. İkinci deneme aynı anahtarı ve birebir aynı içeriği taşıyor; ek dosya aynı çalışmada üretilen nesne (`schedule-export-cron.ts:148-166`). Resend belgesine göre aynı anahtar ve aynı içerik 24 saat içinde e-postayı yeniden göndermez, ilk cevabı döner. İlk istek bizim 30 sn sınırımızda kesilip aslında teslim edildiyse ikinci deneme yeni bir e-posta üretmez.

### Orta
**Orta-1: Gönderim aralığını ölçen test arada bir sebepsiz kırmızı çıkıyor ve asıl iddiayı sınamıyor.**
- Yer: `apps/api/src/schedule/schedule-export-cron.test.ts:161-173`.
- Ne görüldü: test bekleme sürelerinin tam olarak `[600, 1200]` olmasını istiyor. Kod süreyi `startAt - Date.now()` ile hesaplıyor (`schedule-export-cron.ts:82-84`) ve testte saat dondurulmamış. Gönderimler arasında 1 ms geçerse sonuç `[599, 1199]` olur ve test düşer.
- Ölçüm: aynı mantığı 20.000 tur çalıştırdım, 86 turda (%0,4) sapma çıktı. Yük altındaki CI'da oran daha yüksek olur.
- Etki: main'de sebepsiz kırmızı CI ihtimali. Kırmızı main, main'e gönderimi dondurur.
- Ek sorun: testin başlığı "across schedules" diyor ama test tek kural kuruyor. Dört paralel kuralın aynı kuyruğu paylaştığı hiçbir testte sınanmıyor. Biri kuyruğu kural başına taşırsa hiçbir test düşmez.
- Beklenen: testin başında saat dondurulsun (`vi.spyOn(Date, "now").mockReturnValue(...)`). Test iki kuralla kurulsun ve süreler `[600, 1200, …]` diye doğrulansın.

### Düşük
**Düşük-1: Toplam süre gönderim sayısıyla doğru orantılı büyüyor; 5 sn seçimi doğru.**
- Bir kuralın en çok 10 alıcısı olabiliyor: veritabanı kısıtı `20260907102000_schedule_export_schedules.sql:22`, zod `packages/shared/src/index.ts:2308`. Görev mesajındaki "25 alıcı" örneği mümkün değil.
- Kuyruk dakikada en çok ~100 gönderim çıkarıyor:
  - 4 kural × 10 alıcı, hepsi başarısız: 80 gönderim × 0,6 sn + 5 sn ≈ 55 sn (Resend'in 30 sn'de kesilen istekleri hariç).
  - Aynı saate denk gelen 50 kural × 10 alıcı: ≈ 300 sn.
- `vercel.json`'da `maxDuration` yok. Fluid compute açıksa sınır 300 sn, kapalıysa 10–60 sn. Canlıda ölçülmedi.
- Fonksiyon kesilse de veri kaybı ya da çift e-posta olmaz. Tetik 5 dakikada bir koşuyor (`20260919040000_schedule_remaining_cron_endpoints.sql:22-25`); kaydı yazılmamış kural aynı saatin sonraki çalışmasında yeniden ele alınır, aynı anahtar mükerrer gönderimi engeller.
- "Birkaç dakika sonra" yerine 5 sn doğru, üç nedenle:
  - Fonksiyon dakikalarca bekleyemez.
  - Kimseye ulaşmayan e-posta zaten bir sonraki 5 dakikalık çalışmada yeniden deneniyor.
  - Kısmi kaçırmanın tek şansı bu çalışma içindeki deneme; 429 için birkaç saniye yeterli.

**Düşük-2: Eski yorum artık yanlış.**
`schedule-export-cron.ts:17-19` hızı "dört paralel kural"ın belirlediğini söylüyor. Artık hızı 600 ms'lik ortak kuyruk belirliyor. Yorum dakikada ~100 gönderim tavanını ve tavan aşılırsa ne yapılacağını yazmalı.

**Düşük-3: Nadir durumda yanlış "teslim edilmedi" notu.**
İlk istek bizde 30 sn'de kesilir ama Resend onu hâlâ işliyorsa, ikinci deneme 409 "aynı anahtarla süren istek var" alır. Kişi e-postayı alır, ama ekrandaki not "Not delivered to 1 of N" der.

### Önceden vardı, bu iş getirmedi (backlog adayı)
Resend yaklaşık 15 dakika çökerse kural kendiliğinden kapanıyor. Kimseye ulaşmayan çalışma "son gönderim" saatini yazmıyor ama hata sayacını artırıyor (`20260907107000_schedule_export_schedule_cron.sql:116-124`). Tetik saatte 12 kez koştuğu için aynı saat içinde üç hata birikir ve kural kapanır. Örnek: Pazartesi 08:00–08:15 arası Resend çökerse Ayşe'nin haftalık e-posta kuralı kapanır. Bu iş durumu kötüleştirmiyor, çalışma içindeki deneme biraz azaltıyor. Ayrı backlog maddesi önerilir: aynı saatteki tekrarlar tek hata sayılsın.

## Kontrol edilenler, sorun yok
- **Kuyruk sayacı:** `paced` kuyruktaki yerini beklemeden önce, aynı adımda ayırıyor (`:81-82`). JavaScript tek iş parçacığında çalıştığı için yarış yok.
- **Kısmi teslim kuralı (KK-166):** yalnız kimseye ulaşmayan e-posta hata sayılıyor (`:180`). Kısmi teslimde başarı ve not kaydediliyor. Test `:90` kısmi kaçırmadaki ikinci denemeyi de doğruluyor.
- **Hata metni:** kimseye ulaşılamadığında ikinci deneme bütün alıcıları kapsıyor; metnin onun sonucundan gelmesi doğru.
- **app.test gerçek bekleme yapmıyor:** tek alıcı var ve gönderim başarılı. İlk bekleme ≤0, ikinci deneme yok, `setTimeout` çağrılmıyor.
- **Bekleme taklidi:** kod beklemeyi `scheduleExportTiming.wait` üzerinden çağırıyor; testteki `vi.spyOn` her yolu yakalıyor.
- **Güvenlik:** workspace sınırında, yetkide, grant'te ve cron sırrında değişiklik yok. Yeni log ya da kişisel veri sızıntısı yok. Nottaki e-posta adresleri ve anahtardaki adres (BL-385) önceden vardı.

## Kanıt
- `git diff 73ae3646 1c18990b -- apps/api/src/schedule/`: 0 satır. İki commit'in patch-id'si aynı (`6fcb3a51…`).
- `git diff --stat origin/main...1c18990b`: yalnız iki dosya, +119/−19. origin/main = 9e390950.
- Bu turda test koşmadım (tek ağır iş kuralı). İlk turda `vitest run src/schedule/schedule-export-cron.test.ts` 19/19 yeşildi (2026-10-06 06:14, aynı içerik, 73ae3646 üzerinde).
- Gönderim aralığı ölçümü: aynı mantık Node'da 20.000 tur, 86 sapma.
- Resend idempotency belgesi:
  - Anahtar 24 saat saklanıyor.
  - Aynı anahtar ve aynı içerik aynı cevabı alıyor.
  - Farklı içerik 409 `invalid_idempotent_request` alıyor.
  - Süren istek 409 `concurrent_idempotent_requests` alıyor.
  - 429 cevabının anahtarla saklanıp saklanmadığı belgede yazmıyor.

## Hafıza notu (dosyaya yazılmadı)
`checklist-pacing-timing-tests`: bekleme süresini `x - Date.now()` ile hesaplayan bir kuyruğun testinde saat dondurulmazsa, tam değer iddiası arada bir 1 ms sapar. `Date.now` dondurulmuş mu, bak. "Across X" diyen testin gerçekten birden fazla X kurduğunu da doğrula. Rebase edilmiş commit'te önce `git patch-id` ile içerik eşitliğine bak; görev mesajındaki tabanı `origin/main` ile karşılaştır. Kaynak: BE-2b-O1, 2026-10-06.

## İlgili dosyalar
- C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-dewdney-c78421\apps\api\src\schedule\schedule-export-cron.ts
- C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-dewdney-c78421\apps\api\src\schedule\schedule-export-cron.test.ts
- C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-dewdney-c78421\supabase\migrations\20260919040000_schedule_remaining_cron_endpoints.sql
