# W-1b — Düzenleme oturumu: iş kaybolmaz, hafta ve kilit kuralları

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| Schedule (düzenleme modu) | EKRAN-01 W-1b (S2 hariç; S2 → DB-1c, KK-171) | nf-backend / web hattı | R2 | nf-guvenlik ONAY @e81d5e81 → düzeltmeler ONAY @0dcb698b | 2026-10-06 |

## Sonrası için
- Kural: hareketsizlik 15 dk + 15 sn; sayım biterse `POST /schedule/edit-lock/autosave` (Discard asla), `useEditIdleTimer.ts` + `useScheduleEditSession.ts`.
- Kalıp: kira dolması `runWithLease` ile bir kez kurtar-yeniden dene; 403 `authz.*` `isScheduleAccessRefused` ile düzenlemeyi bir kez kapatır (`schedule-data.ts`).
- Kural: düzenleme açıkken gösterilen hafta düzenlemenin haftası değilse sayfa görünüm modunda (KK-164 effect, `SchedulePage.tsx`).
- Tuzak: e2e haftaları paylaşılıyor (0–9 dolu); yeni senaryo kendi haftasını alsın (`schedule-own-unsaved-edits` 500).
- Ölçüm: api 1001, web 2205 (+1), e2e schedule + scope 19/19 (2026-10-06, `562bf929`).

## Rapor

**Karar:** nf-guvenlik ONAY @e81d5e81, inceleme düzeltmeleri sonrası ONAY @0dcb698b · sınıf R2
**İzin:** R2 — gönderildi (sha ve CI numarası posta kutusundaki raporda / panoda)
**Risk:** 🟢 düzenleme artık hiçbir kapanışta işi silmiyor; S2 (Undo sunucuda) bu dilimde yok, DB-1c'ye bağlı (KK-171)
**Soru:** yok
**Sonraki:** DB-1c main'e girince Undo düğmesinin bağlantısı (küçük parça); sıcak dosyalar (SchedulePage.tsx) bırakıldı

## 1. Nerede duruyor
W-1b'nin S2 dışındaki bütün maddeleri bitti ve main'de. S2 (Undo sunucuda da geri alır) için veri hattı DB-1c'yi kuracak; sözleşme isteği posta kutusunda (EKRAN-01-DB-1c-sozlesme). "Save draft Undo geçmişini temizler" zaten sağlanıyordu (kaydetme düzenlemeyi kapatıp geçmişi siliyor, `SchedulePage.tsx` save akışı).

## 2. Ne yapıldı (öncesi → sonrası), Schedule → düzenleme modu
- **S1 Hareketsizlik:** Önce: 15 dk + 5 dk sonra iş habersiz siliniyordu. Sonra: 15 dk hareketsizlikte "Keep editing?" 15 sn geri sayar; bitince iş "Auto-save · Ayşe Yılmaz · Oct 6, 1:19 PM" taslağına geçer, kilit bırakılır, ekranda "Your changes were saved as a draft" + taslak adı; taslak New Schedule menüsünde. Kaydedilecek bir şey yoksa yalnız düzenleme kapanır. Yeni uç `POST /schedule/edit-lock/autosave` (yetki `schedule.edit`).
- **D-O6:** Başkasının düzenlediği taslağı silmek: önce ham "draft is being edited"; sonra "Someone is editing this draft. Try again when they finish."
- **D-O9:** Bir taslağı açmak birinin kilidi düşmüş işini (ya da kişinin kendi öteki düzenlemesini) kenara koyunca ekran tek satır söyler: "Unsaved changes were saved as a separate draft" + "Auto-save · <ad> · <saat>"; taslak menüsü yenilenir. Bildirim yok (KK-162). Şerit yerine kısa bildirim (toast) kullandım; şeritte kalıcı satır görsel iş (arayüz hattı).
- **D-D3:** "Someone is editing" artık görünen her lokasyonu izliyor; "düzenliyor" yalnız düzenlemenin kendi lokasyonlarında (inceleme D1), ötekilerde "bakıyor". Örnek: Ayşe All locations'ta Beşiktaş'ı düzenleyen Zeynep'i görür.
- **KK-164:** Düzenlerken başka haftaya geçince o hafta görünüm modunda açılır; düzenlemenin haftasına dönünce aynı kilitle düzenleme sürer. Önce: boş ızgara + önceki haftanın taslak adı.
- **D-Y5:** Kod web'de değişmedi (DB-1b bekleyen listeyi sahibine süzüyor); yeni e2e Zeynep'in kaydetmediği notun Ayşe'nin ızgarasına binmediğini kanıtlıyor.
- **Artıklar:** kira dolunca vardiya değişikliği bir kez kurtar-yeniden dene, ikinci dolumda düz cümle (ham "edit lease expired" yok); Discard sonrası geç kalp atışı düzenlemeyi geri getirmiyor; kapsamı düşen kişide (403 authz.*) düzenleme bir kez kapanır, "You can no longer edit this schedule, so your edit closed." (her dakika "Not allowed" yerine; Auto-save reddinde de aynı); bilinmeyen / erişilemeyen taslağı açmak "This draft is no longer available to you."; canlı yenileme kancasından okunmayan taslak seçeneği kalktı.

## Kanıt
- Her madde önce kırmızı test (kanca, App, schedule-data, presence, API servis + rota kapısı).
- Rebase sonrası tam kapı (`0dcb698b`, origin/main 726eb366): lint + typecheck + test + build EXIT=0 — api 1001, web 2205 (+1 atlanan), shared 210, ui 9.
- E2E (db.lock): schedule-* + scope-and-employee-view: 19 passed (3.8m) @`562bf929`. İlk tam koşuda 1 düşüş: benim yeni D-Y5 senaryom approved-exchange ile aynı haftayı (5) kullanıyordu; kendi haftasına taşındı (`562bf929`), iki senaryo aynı sırada geçti. Aynı koşudaki bir giriş zaman aşımı yük kaynaklıydı (boşta geçti).
- Ekran görüntüleri (1440 px, Playwright saati ileri alınarak), `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-dewdney-c78421\artifacts\nf-backend\W-1b\`:
  - `1-next-week-view-mode.png` — düzenlerken sonraki hafta: görünüm modu.
  - `2-back-to-own-week-editing.png` — kendi haftasına dönünce: düzenleme sürüyor, Ali'nin vardiyası yerinde.
  - `3-keep-editing-countdown.png` — "Keep editing?" 14 saniye.
  - `4-auto-saved-notice.png` — "Your changes were saved as a draft · Auto-save · Ayse Person · Oct 6, 1:19 PM".
  - `5-auto-save-draft-in-menu.png` — taslak New Schedule menüsünde.

## 3. Açık kalan ve nedeni
- **S2** Undo sunucuda: DB-1c (KK-171) — veri hattının işi; bağlantı ayrı küçük parça.
- KK-162'nin "Ayşe bir dahaki açılışta aynı satırı görür" yarısı: sunucu, işi kenara konan kişiye bunu söyleyen bir bilgi taşımıyor; Ayşe Auto-save taslağını menüde görür. İstenirse DB tarafında "görülmemiş kurtarma" bilgisi gerekir (backlog önerisi, leave: low / do: moderate).
- Şeritte kalıcı bilgi satırı (D-O9) → arayüz hattı (W-3/W-4), bugün kısa bildirim.
- Toplu silmenin yedek döngüsü kira dolumunda yeniden denenirse bayat revizyonla hata gösterir (çift silme yok) — bilgi.

## 4. Ekranda ne değişti
- Schedule → düzenleme: "Keep editing?" 15 sn sayıyor; bitince bildirim + Auto-save taslağı.
- Düzenlerken hafta değişimi: öteki hafta görünüm modunda.
- Kurtarma ve silme reddi bildirimleri; "Someone is editing" tüm görünen lokasyonlarda.

## 5. Sırada ne var
- DB-1c → Undo bağlantısı.
- Yolda bulunan: KK-162 ikinci yarı (yukarıda).

Senin yerine verdiğim kararlar (teknik / metin, P19-P21): bildirim metinleri ("Your changes were saved as a draft", "Unsaved changes were saved as a separate draft", "Someone is editing this draft. Try again when they finish.", "You can no longer edit this schedule, so your edit closed.", "This draft is no longer available to you."); D-O9 satırı şerit yerine bildirim.

Skills: superpowers:test-driven-development (her madde önce kırmızı), superpowers:receiving-code-review (iki Düşük + öneri doğrulandı, uygulandı), superpowers:verification-before-completion.

## İnceleme

### nf-guvenlik — ilk tur
KARAR: ONAY @e81d5e81

Sınıf R2. Kritik, Yüksek ya da Orta bulgu yok. İki Düşük not var; ikisi de bu onayı bekletmiyor.

# Güvenlik incelemesi: EKRAN-01 W-1b (`task/ekran-01-w-1b`, taban `origin/main` 924cb77, uç e81d5e81)

## Sonuç
Bu dal yeni bir güvenlik açığı getirmiyor. Bir yöneticinin Schedule ekranındaki kaydedilmemiş işi artık silinmiyor, kendi adıyla bir taslağa konuyor. Bu yeni yol da yalnız işi açan kişiye çalışıyor, başka workspace'e ya da lokasyona yol açmıyor.

## Bakılan yüzeyler

**1. Yeni uç: hareketsizlikte işi taslağa koyma** (`apps/api/src/schedule/schedule-routes.ts:504-525`)
- İstek gövdesine bakılmadan önce `schedule.edit` yetkisi soruluyor. Uç, rota yetki tablosu testine de eklenmiş (`schedule-routes-gate.test.ts:32`).
- Veritabanı tarafında (`20261007060000_schedule_edit_keeps_its_work.sql:86-115`):
  - Oturum dört koşulla aranıyor: oturum kimliği, workspace, oturumu tutan kişi ve oturumun açık olması. Örnek: Zeynep, Ayşe'nin oturum kimliğini bilse bile o oturumu kapatamaz, "bulunamadı" (404) cevabı alır.
  - Ardından yetki çekirdeği, düzenlenen lokasyonlarla yeniden soruluyor.
  - Fonksiyon dışarıdan çağrılamıyor (anon ve authenticated'dan yetkisi alınmış, yalnız service_role'e açık). Yetki kataloğunda da sınıflanmış (`authorization_coverage.test.sql`).
- Hata metinleri genel hata yolundan geçiyor: veritabanının kendi cümlesi ekrana çıkmıyor, yalnız makine anahtarı gidiyor.

**2. Canlı güncelleme kanalları** (`schedule-service.ts:706-724`)
- Güncelleme bildirimi yalnız taslağın kendi lokasyonlarına gidiyor. Bu lokasyonlar düzenleme oturumunun lokasyonlarından kopyalanıyor; o oturum da açılırken yetki çekirdeğinden geçmişti.
- Bildirimin içinde taslak kimliği yok; yalnız "taslak listesini ve bekleyen değişiklikleri yeniden oku" diyor. Kanal başına yalnız kendi lokasyonu yazıyor.

**3. "Kim burada" göstergesi artık her görünen lokasyonda** (`useScheduleViewerPresence.ts`)
- Katılınan kanal listesi, okuyucunun kendi Schedule verisindeki lokasyonlardan geliyor.
- Her kanalın kapısı veritabanında: katılmak da yayın yapmak da o lokasyonun Schedule'ını okuyabilmeyi istiyor (`20261007080000_schedule_channels_are_per_location.sql:19-58`). Yetkisiz bir lokasyona katılma isteği reddedilir.
- Kapanırken her kanal tek tek bırakılıyor.

**4. Değişiklik yazılırken kilit düşerse bir kez yeniden deneme** (`useScheduleEditSession.ts:205-217`)
- Yeniden deneme yalnız sunucu "kilit süresi doldu" (409) diye reddettiğinde oluyor.
- Tekil işlemlerin her biri tek bir veritabanı çağrısı; red olunca o çağrının yazdığı her şey geri alınıyor. Yani yeni vardiya oluşturma ikinci denemede iki kopya üretmez.
- Kilit başka biri adına ya da yeni bir oturumla geri gelirse yeniden deneme yapılmıyor; düzenleme kapanıyor.

**5. Düzenlerken başka haftaya geçme** (`SchedulePage.tsx:1196-1206`)
- Yalnız ekranın adres çubuğundaki görünüm değişiyor. Sunucuya kilit, bırakma ya da silme isteği gitmiyor.
- Sonsuz döngü yok: sayfayı yeniden yükleyince işi geri alan akış, açık oturum varken kilidi yeniden istemiyor. Taslak bulunamayınca görünümü sıfırlayan akış da düzenleme sürerken çalışmıyor.
- Test, kilidin bir kez alındığını ve Discard'ın hiç çağrılmadığını doğruluyor.

**6. Hata metinleri**
- Ekrana çıkan cümleler sabit metin. Bilinmeyen ya da artık erişilemeyen taslak ile kapsam dışı taslak aynı cümleyi alıyor ("This draft is no longer available to you."). İç bilgi sızmıyor.

## Düşük bulgular

**D1. Düzenleme, düzenlenmeyen lokasyonlarda da "düzenliyor" diye görünebilir.** `useScheduleViewerPresence.ts:670-679` ve `SchedulePage.tsx:965`
- Ne görüldü: "düzenliyor" bilgisi, düzenlemenin kapsadığı lokasyonlara değil, ekranda görünen bütün lokasyonların kanalına gönderiliyor.
- Örnek: Ayşe yalnız Kadıköy'ü düzenlerken filtreyi "All locations" yaparsa, Beşiktaş'ta bakan Zeynep "Ayşe düzenliyor" görür, oysa Beşiktaş'ta kilit yok.
- Etkisi: yanlış bir uyarı; veri sızmıyor, yetki atlanmıyor. Beklenen: "düzenliyor" yalnız düzenlemenin lokasyonlarında, ötekilerde "bakıyor".

**D2. Yeni uçtan uca test bir şey yakalamadan da geçebilir.** `e2e/flows/schedule-own-unsaved-edits.spec.ts:60-63`
- Ne görüldü: test 3 saniye bekleyip Ayşe'nin ekranında not olmadığını kontrol ediyor. Ayşe'nin ekranının bekleyen değişiklikleri o arada gerçekten yeniden okuduğu doğrulanmıyor.
- Örnek: canlı güncelleme hiç gelmese de test yeşil kalır.
- Etkisi: korunan kural (Zeynep'in kaydedilmemiş notu Ayşe'ye görünmez) zaten veritabanı testinde duruyor. Bu e2e yalnız ek güvence. Öneri: Ayşe tarafında bir yeniden okumayı bekleyen ya da sayan bir koşul eklensin.

## Öneri (zevk notu)
- Hareketsizlikte kaydetme yetki reddi (403) alırsa, ekran düz "Not allowed" yazıyor. Aynı dalda kalp atışı için yazılan cümle ("You can no longer edit this schedule, so your edit closed.") burada da kullanılabilir. İş kaybolmuyor: kilit süresi dolunca sunucu işi yine "Auto-save" taslağına koyar.

## Kanıt
- `git fetch origin`: `origin/main` b5839135. `git log origin/main..HEAD`: 9 commit. Diff okundu: 19 dosya, +578/-66.
- Okunan kod:
  - Yeni veritabanı fonksiyonu: oturum araması, yetki çağrısı, dışarıya kapalı olması (migration 20261007060000, satır 86-115).
  - Canlı kanal kuralları (migration 20261007080000).
  - Hata çevirisi (`apps/api/src/http-error.ts`) ve uç hata eşlemesi (`schedule-routes.ts:1409-1431`).
  - Yeniden denemenin sardığı her çağrı: `SchedulePage.tsx` 1495, 1601, 1622, 1957, 2247, 2785, 2795, 2961, 3001.
  - Taslak bulunamayınca görünümü sıfırlayan akış (`usePreviewSource.ts:24-28`).
- Testleri ben koşturmadım; salt okunur inceleme. Yeşil kanıt oturumun kendi iddiası: api schedule 269/269, App.test 93/93, typecheck temiz, iki e2e senaryosu geçti.

## Hafıza notu (dosyaya yazılmadı)
- Kontrol listesine eklenecek madde: "Kilit dolunca yeniden dene" gibi bir sarmalayıcı görünce, sarılan işlemin tek veritabanı çağrısı olup olmadığına bak. Tek çağrıysa red her şeyi geri alır, ikinci deneme güvenlidir. İstemcide birden çok istek atan döngüler (ör. toplu silmenin yedek döngüsü, `SchedulePage.tsx:1495-1512`) ikinci denemede ilk adımı yineleyebilir.
- "Kim burada" göstergesi birden çok kanala yayılınca "düzenliyor" bilgisinin yalnız düzenlemenin kapsamındaki kanallara gidip gitmediğine bak.

### nf-guvenlik — düzeltmeler
KARAR: ONAY @0dcb698b

Sınıf R2. Kritik, Yüksek ya da Orta bulgu yok. Önceki raporun iki Düşük notu ve önerisi doğru kapatılmış; düzeltme commit'i yeni güvenlik riski getirmiyor.

**Karşılaştırma ve kapsam:**
- Rebase yalnız tabanı kaydırmış. 290af907 ile e81d5e81 arasında uygulama, test ve paylaşılan paket dosyalarında fark yok. Fark yalnız main'den gelen veritabanı değişikliği ve testi.
- Dal hâlâ veritabanına dokunmuyor. `git diff --name-only origin/main...0dcb698b` 19 dosya listeliyor, hiçbiri `supabase/` altında değil.
- `origin/main` (726eb366), 0dcb698b'nin atasında.

## Notların durumu

**D1, yanlış "düzenliyor" uyarısı: kapandı.** (`useScheduleViewerPresence.ts`, `SchedulePage.tsx:732`)
- Kanallara katılma kuralı değişmedi: kişi yalnız okuyabildiği lokasyonun kanalına girebilir.
- Değişen tek şey her kanala yazılan durum. "düzenliyor" yalnız düzenlemenin kendi lokasyonlarında, ötekilerde "bakıyor" gidiyor.
- Örnek: Ayşe yalnız Kadıköy'ü düzenlerken "All locations" açıksa, Beşiktaş'taki Zeynep onu artık "bakıyor" görür.
- Kapanış temiz: her kanal tek tek bırakılıyor. Düzenleme lokasyonları değişince kanallar yeniden kuruluyor.
- Yeni test bu farkı kanal kanal doğruluyor (Kadıköy "edit", Beşiktaş "preview").

**D2, boşa geçebilen e2e testi: kapandı.** (`e2e/flows/schedule-own-unsaved-edits.spec.ts:43-57`)
- Sabit 3 saniyelik bekleme kalktı.
- Test önce Ayşe'nin ekranının bekleyen değişiklikleri sunucudan yeniden okumasını bekliyor, sonra ağın durulmasını, sonra kontrolü yapıyor.
- Canlı güncelleme hiç gelmezse test artık 15 saniyede düşer; eskisi gibi sessizce yeşil kalmaz.

**Öneri, Auto-save reddedilince düz cümle: uygulandı.** (`useScheduleEditSession.ts:86-88`)
- Hareketsizlikte kaydetme yetki reddi alırsa, kalp atışındaki cümleyle aynısı görünüyor: "You can no longer edit this schedule, so your edit closed."
- İki yer aynı sabiti kullanıyor, metin tek yerde duruyor.
- Yetki dışındaki hatalar eski yoldan, düz hata mesajıyla gidiyor.

**Toplu silmenin yedek döngüsü:** koordinatörün açıklaması kodla uyuşuyor. Kilit dolup ikinci deneme yapılırsa silme bayat revizyonla reddedilir ve ekran hata gösterir. Çift silme ya da veri kaybı yolu yok. Bilgi notu, bulgu değil.

## Öneri (onayı etkilemez)
- e2e'deki bekleme, Ayşe'nin sunucuya giden herhangi bir "bekleyen değişiklikler" okumasıyla tetiklenebilir. Bu okuma Zeynep'in düzenlemeyi açmasından da gelmiş olabilir; o zaman test, notun canlı güncellemesinden önce kontrol yapar.
- Pratikte risk düşük, çünkü bekleme sayfanın ağı durulana kadar sürüyor. İstenirse bekleme, Zeynep notu kaydettikten sonraki ilk okumaya bağlanabilir.

## Kanıt
- Çalıştırdığım komutlar: `git fetch origin`, `git show 0dcb698b`, `git diff --stat e81d5e81 290af907 -- apps e2e packages` (boş), `git merge-base --is-ancestor origin/main 0dcb698b` (tamam), `git diff --name-only origin/main...0dcb698b`.
- Testleri ben koşturmadım; salt okunur inceleme. Kırmızıdan yeşile geçen testler ve e2e'nin 21.5 saniyede geçmesi oturumun kendi iddiası.

## Hafıza notu (dosyaya yazılmadı)
- "Kim burada" ve benzeri çok kanallı göstergelerde kanal başına durumun düzenlemenin kapsamıyla sınırlı olup olmadığına bak. Kanala katılma izni doğru olsa da yazılan durum yanlış lokasyona taşabilir.
- e2e'de bir isteği bekleyen düzeneğin, beklenen olaydan önce başka bir sebeple tetiklenip tetiklenemeyeceğine bak.
