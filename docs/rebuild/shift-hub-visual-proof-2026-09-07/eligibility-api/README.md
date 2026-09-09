# AT18 — Uygunluk kuralları, gerçek API ve stale onay ekranı

**LOCAL:** job yetkinliği, lokasyon ataması, Schedule exclusion ve çalışan arşivi; liste, submit, rıza ve son onayda tutarlı biçimde engellendi. Her kriter ayrı değiştirilip yeniden geçerli hale getirildi. Bu kanıt ayrı bir sahipli yerel workspace'tedir (`9fe191ea-b6c8-412a-b274-21c3a90f3838`); önceki UI kanıtlarındaki çalışanlara veya vardiyalara dokunulmadı.

## Dört kriter × sekiz kapı

| API aşaması | Job / location / exclusion | Arşivlenmiş çalışan |
|---|---|---|
| Owner'ın doğrudan aday listesi | Aday görünmez | Aday görünmez |
| Çalışanın havuz fırsat listesi | Vardiya görünmez | Employee erişimi 403 |
| Havuz başvurusu | 422, uygun değil | 403, aktif employee profile gerekli |
| Owner'ın doğrudan daveti | 422, uygun değil | 422, uygun değil |
| Önceden gönderilmiş daveti kabul | 422, uygun değil | 403, request erişimi yok |
| Manager preview | allowed=false, gerekçe var | allowed=false, Schedule'da aktif değil |
| Manager aday listesi | eligibility uygun değil | eligibility uygun değil |
| Önceki geçerli preview ile final | 409, receiving employee uygun değil | Aynı 409 engeli |

**32/32 negatif kontrol.** Her kriterden önce aday listede ve havuzda görünür, pending başvuru için preview allowed=true olur. Kriter geri yüklendikten sonra tekrar listede görünür, preview açılır ve gerçek havuz başvurusu 200 ile yapılabilir. Böylece bir duplicate veya genel yetki hatasının uygunluk koruması gibi sayılması önlenir.

Her kriter için dört ayrı sahipli shift kullanıldı: pending manager review, henüz başvurulmamış havuz, henüz davet gönderilmemiş doğrudan kaynak, önceden gönderilmiş direct consent. Son üç kaynak birbirinden ayrıdır. Job/location ataması vardiya tarihinden önce bitirilir; diğer iki kriter profil bayraklarıdır. Availability bu matriste geçerlidir.

[API raporu](matrix.json) gerçek yerel Auth login ve HTTP çağrılarını içerir. Eligibility değişiklikleri yalnız fixture metadata'sına DML ile uygulanır; bu tur Employee settings UI veya bütün HR writer yollarının kanıtı değildir. Eşzamanlı writer kilit sıralamaları önceki AT18 race kanıtında ayrıdır. Bu matriste read/submit/final öncesinde koşulun değişmesi sınanır.

## UI bulguları ve düzeltmeler

Gerçek stale final 409'u `error` içinde JSON-encoded reason array döndürüyordu. Shift Hub artık string reason listesini okunabilir metne dönüştürür. HTTP status, idempotency key, gönderilen command ve hata akışı korunur; plain 403/422 mesajları değişmez.

Ayrıca açık onay penceresinde uygunluk bozulunca eski “This changes the published assignment immediately” özeti kalıyordu. Yeni **Review needs updating** durumu, onayın verilemediğini açıklar. Preview alınamıyorsa tekrar kontrol etme yolu gösterilir. İlgili gerekçeler dialog içinde görünür; özel not korunur, final düğmesi devre dışıdır.

**51/51 web testi:** 45 Hub, 5 API client, 1 dialog. Yeni yedi kontrol reason formatting/status/idempotency ile confirmation sırasında eligibility ineligible/unavailable durumlarını kapsar. Typecheck, hedefli ESLint, Vite build ve verifier syntax PASS. Yeni migration veya API davranış değişikliği yok.

İki ayrı gerçek browser denemesinde manager normal UI login ile aday seçti, geçerli preview aldı ve özel not yazdı. Final butonundan çıkan gerçek POST, test job ataması bitirildikten sonra API'ye devam etti. Request/response veya saat taklit edilmedi; yalnız POST gönderilmeden önce sahipli fixture koşulu değiştirildi.

- İkisinde de gerçek API 409; published owner aynı, transfer olayı 0, manager note kaydı 0.
- API'nin JSON array metni dialogda düzgün cümleye dönüştü.
- Nihai turda **Review needs updating**, eski onay vaadinin kalkması, notun korunması ve disabled confirm doğrulandı.
- 390 px light/dark iki nihai görünümde yatay taşma yok; ayrıca gözle incelendi. Native reader, kontrast veya tüm viewport matrisi değildir.

[İlk browser](browser.json), [nihai browser](browser-final.json), [light görünüm](final-stale-eligibility-light.png), [dark görünüm](final-stale-eligibility-dark.png). İlk görseller, hata metni düzelmiş fakat eski onay özeti hâlâ varken alınmıştır; nihai tasarım yerine kullanılmaz.

## Veri ve çalışma sınırı

Son READ ONLY denetim: matristeki **16 shift aynı owner'da**, **12 case owner komutuyla kapalı**, transfer 0, test adayına atanmış vardiya 0. Job/location aktif; profile archived_at=null ve exclusion=false. Browser için ek iki shift/case de devredilmedi; kontroller sonrası owner komutuyla kapatıldı. Metadata geri yüklendi, audit geçmişi silinmedi. [Son veriler](data.json).

Başlangıçtaki eski role-fixture helper availability versiyonunu yayımlanmış döneme yazmaya çalışınca guard işlemi geri aldı. Yeni hazırlık, Casey'nin availability'sini yalnız henüz yayımlanmamış 2027 test döneminden başlatır; guard kapatılmaz. Helper'ın yarım kalan owned Auth kayıtları tekrar oluşturulmadan kullanıldı. İlk negatif submit doğru 422 döndü; harness'in beklenen iş kuralı status listesi düzeltildi. Kaydedilmiş/geri yüklenmiş job satırı ve case ID'leri kullanılarak devam edildi; duplicate fixture veya geçmiş reseti yapılmadı.

Bir devam sırasında 5560 bağlantısı reddedildi; eski process handle bulunamadı ve listener'ın olmadığı doğrulandıktan sonra yalnız owned API yeniden açıldı. Bu kesinti sırasında metadata değişikliği yapılmamıştı. Son koşumlar PASS; önceki kısmi denemeler raporda korunur. Matrix yeniden çağrıldığında tamamlanmış kriterler yeniden test edilmiş sayılmaz: `new_criteria_this_run=0` ile yalnız mevcut DB durumu tekrar doğrulanabilir.

AT18 çekirdek liste/submit/final kapıları LOCAL. Swap'ın iki tarafının kapsamlı API kombinasyonları, çoklu availability sürümleri (AT19), timezone/DST (AT20), extra assignment/travel (AT22), hosted/pilot ve gerçek insan UAT ayrı açık kapılardır. G05 veya genel G01–G10 tamamlandı sayılmaz.

Kaynaklar: `shift_exchange_eligibility_api_local.py`, `shift_exchange_eligibility_error_local.py`, `shift_exchange_eligibility_error_browser.mjs`; [kaynak ve runtime hashleri](source-sha256.json). Sabit web `supabase/.temp/eligibility-api/web`, mevcut API bundle `apps/api/.temp/staffing-immediate-20260907`; API'nin bu tur yeniden derlendiği iddia edilmez. Credentials yalnız ignored local state'tedir.

Cleanup tamamlandı: owned5560/5561 PID ve commandline ile doğrulanıp kapatıldı; browser işlemleri terminal/exit0. Wrapper exit1/preview vite not found kontrollü durdurma sonucudur. Diğer servisler başlatılmadı/durdurulmadı; ilgisiz WIP korundu. Son kaynak manifesti, hedefli whitespace ve verifier syntax PASS.
