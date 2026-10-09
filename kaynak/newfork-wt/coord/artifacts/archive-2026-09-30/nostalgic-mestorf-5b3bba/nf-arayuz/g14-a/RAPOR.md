# G14 dilim a — Schedule masaüstü, görünümü değiştirmeyen düzeltmeler

İşçi: G14 Schedule masaüstü (`nf-arayuz`; `today` testi için `nf-backend` şapkası). 2026-09-30.
Branch `task/g14-a`, worktree `.claude/worktrees/nostalgic-mestorf-5b3bba`, taban `origin/main` `449322e2` (rebase edildi, push yok).

| Commit | Madde |
|---|---|
| `9fe26ef3` | BL-311 tekil/çoğul |
| `5f04cfb9` | BL-372 Escape |
| `7d4c2372` | BL-353 "bugün" |
| `21f65ca6` | BL-312 ham renkler (dar kapsam) |

## 1. Nerede duruyor
Dilim a bitti: dört madde de yapıldı, kapı yeşil, commit'li; push edilmedi (koordinatör gönderecek). Açık kalan küçük kararlar bölüm 3'te.

## 2. Ne yapıldı (etkisi)

**BL-311 — düzeldi.** Schedule → sağ üstteki Publish / Published ▾ pencerelerinde ve yayın sonrası çıkan bildirimde sayı 1 iken artık tekil yazıyor. Örnek: müdür yayını geri alırken tek lokasyon işaretler; düğme "Unpublish 1 location" yazar (eskiden "Unpublish 1 locations").
- Dokuz metin + iki aday, hepsi var olan `countLabel` ile (yeni yardımcı yok):
  - Unpublish penceresi: "1 live shift will be removed" (`UnpublishScheduleDialog.tsx:147`), "Unpublish 1 location" (`:206`).
  - Publish penceresi: "1 of 1 location selected" (`PublishScheduleDialog.tsx:198`, onuncu aday, düzeltildi), "1 conflict must be fixed" (`:911`), "1 blocker" (`:916`), "1 risk" (`:918`).
  - Publish penceresi, lokasyon uyarısı (`:732-734`): tek canlı vardiya silinecekse "The only live shift at this location will be removed."; 2 ve üstü eskisi gibi "All 3 live shifts at this location will be removed." ("All 1 live shift" okunmuyordu; `design:ux-copy` ile tek metin kararı.)
  - Bildirimler (`views/SchedulePage.tsx:3147`, `:3151`, `:3214`): "1 location, 0 changes, 1 employee notified." / "1 location and 0 changes published." / "1 location unpublished."
  - **On birinci metin, listede yoktu, aynı hata, aynı pencere; düzeltildi:** "1 of 1 employee will be notified" (`PublishScheduleDialog.tsx:924`, Publish penceresinin üçüncü adımı). Beş satır üstü düzelirken bunu bırakmak işi yarım bırakırdı.
- Done when 1: grep → 0 satır (ölçüm `21f65ca6`). Test hücreleri: `UnpublishScheduleDialog.test.tsx` (1 ve 2 lokasyon, 1 ve 3 vardiya), `PublishScheduleDialog.test.tsx` (alt özet 1 ve 2 bulgu; tek vardiya; "1 of 1 employee"), `App.test.tsx` Schedule hücreleri (iki bildirim, 0 ve 1 çalışanla). Hepsi önce kırmızı görüldü.
- Test notu: Publish penceresi testindeki "ekranda tek '1 risk' var" beklentisi yalnız alt çubuk "1 risks" yazdığı için geçiyordu. Beklenti gevşetilmedi, yerine oturtuldu: sayım artık inceleme gövdesinin içinde (`within(review)`), alt çubuk ayrı hücrede ölçülüyor.

**BL-372 — düzeldi.** Schedule üst çubuğundaki menüler (Settings, süzgeçler, mini takvim) ve "Schedule save failed" kurtarma penceresi Escape'i artık öbür Schedule pencereleriyle aynı ortak kancadan (`useCloseOnEscape`) dinliyor. Kullanan bileşen 3 → 5.
- `ScheduleTopBar.tsx:214-224` (odağı bırakma adımı korundu), `ScheduleSaveRecoverySheet.tsx:31-32` (odağı geri verme adımı korundu).
- Davranışta tek fark, kancayla birlikte gelen kural: iki tıklı kırmızı düğme "silahlı" iken Escape yalnız düğmeyi indirir, menü ya da pencere açık kalır (Publish, Templates, Unpublish zaten böyleydi). İki yeni hücre bunu ölçüyor; önce kırmızıydılar. Var olan iki test dosyasının eski hücreleri değişmeden yeşil.
- Done when 2: `closeOnEscape` iki dosyada 0; `useCloseOnEscape(` çağıran 5 dosya.

**BL-353 — düzeldi (S1 = A).** Schedule ızgarasında gün başlığındaki "bugün" rozeti: tek lokasyonun sütunu o lokasyonun saat dilimine bakıyor. Örnek: New York'taki müdür Pazartesi 01:00'de Los Angeles sütununu açar; Los Angeles'ta hâlâ Pazar, rozet Pazar'da durur (eskiden Pazartesi'ye atlıyordu). Birden çok lokasyonu birleştiren grup (All locations – Unified) cihazın takviminde.
- `ScheduleDayHeaderCells.tsx:33-34` (lokasyon saat dilimi), `views/SchedulePage.tsx:266`, `MiniCalendar.tsx:153`, `settings/ImportantDatesSettingsPage.tsx:42` (üçü cihaz takvimi; davranış aynı, artık `todayIn()` üzerinden).
- **Beşinci kopya, listede yoktu:** `dev/EmployeeOnboardingPreview.tsx:465` (yalnız geliştirmede açılan onboarding önizlemesi, tarih alanının üst sınırı). Done when 3 "bütün `apps/web/src`'te 0 satır" istediği için tek satır düzeltildi; davranış aynı. `employees/**` altında değil, EMP-001 A'nın dosyası değil.
- Done when 3: grep → 0 satır; `lib/today.test.ts` dosya listesi beş dosyayı da sayıyor ve eski iki kalıbı yakalıyor; `ScheduleDayHeaderCells.test.tsx` yeni hücre (cihaz New York, saat Pazartesi 01:00 → Los Angeles sütunu Pazar, birleşik grup Pazartesi). Kırmızı görüldü.

**BL-312 — düzeldi (S3 = A, dar kapsam).** Ekranda hiçbir şey değişmedi; Publish / Published düğmesinin renkleri ve rengi olmayan lokasyon noktası artık adlandırılmış ortak değerlerden geliyor.
- Eklenen altı token (`styles.css:44-52`, `:root`). **KARARLAR'a yazılacak (kayıt oturumu):**

  | Token | Değer | Nerede |
  |---|---|---|
  | `--theme-published` | `#087f5b` | Published / Publish düğmesi, haftanın tamamı yayında |
  | `--theme-published-hover` | `#0b6f53` | aynısı, fare üstünde |
  | `--theme-published-partial` | `#b45309` | lokasyonların yalnız bir kısmı yayında |
  | `--theme-published-partial-hover` | `#92400e` | aynısı, fare üstünde |
  | `--theme-swatch-fallback` | `#64748b` | kendi rengi olmayan lokasyonun noktası (Unpublish, Publish, New Schedule ▾ menüsü) |
  | `--theme-swatch-fallback-soft` | `#cbd5e1` | kendi rengi olmayan kişinin çipi (Publish → Notify adımı) |

- TSX'teki dört ham renk gitti (`UnpublishScheduleDialog.tsx:127`, `PublishScheduleDialog.tsx:87`, `:93`, `DraftDropdownMenu.tsx:494`); Publish tonlarının 12 satırı token (`styles.css:4206-4253`; `#fff` → var olan `--theme-on-accent`).
- `#a53636` (`styles.css:9369-9370`, hızlı düzenleyicideki Delete shift düğmesi) → var olan `--theme-danger-strong` (`#a43830`). Bkz. bölüm 3, karar 1.
- Unpublish penceresinin 24 satırına dokunulmadı (BL-318).
- Done when 4: üç TSX'te ham hex 0 satır; `#a53636` 0; yeni koruma hücresi `DraftDropdownMenu.test.tsx` ("keeps raw colour codes out of the publish surfaces"). Önce/sonra ekran görüntüsü yerine tarayıcıda hesaplanan renk ölçüldü (ölçüm `21f65ca6`, port 5630): ton yok `rgb(17, 24, 39)`, kısmi `rgb(180, 83, 9)` = `#b45309`, tam `rgb(8, 127, 91)` = `#087f5b`, yazı beyaz; lokasyon noktası `rgb(100, 116, 139)` = `#64748b`. Fare-üstü tonları ölçülmedi (aynı mekanizma).

**Kapı (Done when 5).** `0b4393b7` üzerinde koşuldu; rebase sonrası `21f65ca6` ile `apps packages` farkı 0 satır (rebase yalnız `docs/` getirdi):
- web vitest tamamı: 221 dosya, 1907 geçti, 1 atlandı, "Unhandled" yok (118 sn).
- `pnpm.cmd --filter @newfork/web typecheck`: temiz.
- `pnpm.cmd lint`: 0 hata, 20 uyarı (hepsi önceden vardı, `react-hooks/exhaustive-deps`; dokunduğum satırlarda yok).
- `pnpm.cmd build`: başarılı.
- e2e koşturulmadı (dilim a'nın kapısında yok; `e2e/**` içinde bu metinler arandı, etkilenen beklenti yok).
  **Düzeltme (sonradan, benim hatam):** etkilenen beklenti vardı. `e2e/flows/schedule-multi-location.spec.ts:92` eski çoğul metni bekliyordu ve dal CI'ını kırdı; aramam o satırı yakalamadı. Koordinatör düzeltti (`d411d7a8`). Ayrıntı ve ders: `g14-b/RAPOR.md` → "Kaçırdığım iki e2e teması".

## 3. Açık kalan ve nedeni
1. **Karar — Delete shift düğmesinin kırmızısı.** `#a53636` için aynı değerde token yoktu. Yeni bir kırmızı icat etmemek için en yakın var olan token'a bağlandı: `#a43830` (kanal farkı 1 / 2 / 6; gözle ayırt edilmez). Unpublish'in kırmızısı ise `--theme-danger` `#b84234`. Seçenekler: (A, yapılan) `--theme-danger-strong`, ekran aynı; (B) `--theme-danger`, iki kırmızı tek değere iner ama Delete düğmesi gözle görülür açılır, önce/sonra gösterilmeden yapılmaz; dilim b'ye uygun. Tek satır.
2. **Done when 4'ün harfi.** `.schedule-publish-action` ve `.schedule-published-indicator` adlarının da geçtiği 14 seçicili ortak taban kuralında (üst çubuğun bütün denetimleri, `styles.css:3479`) ham `#aeb9b4` kenar duruyor. Tazelik 12 satır saydı, bu onun dışında; ortak bir değer ve dilim b'nin bölgesinde (`:3396-3481`). Dokunulmadı. Koruma hücresi yalnız Publish düğmelerine ait kuralları ölçüyor.
3. **KARARLAR kaydı** `docs/plan/**` olduğu için yazılmadı, kayıt oturumunun işi: altı token; "tek lokasyon sütunu kendi saat diliminde, sayfa / mini takvim / Important dates cihaz takviminde"; "silahlı iki tık düğmesinde Escape önce düğmeyi indirir" kuralının üst çubuk ve kurtarma penceresine de geçtiği.
4. Hızlı düzenleyicinin Delete düğmesi ekranda ölçülmedi: fixture haftasında vardiya yok, düzenleyici açılamadı. Değişiklik tek CSS değeri.

## 4. Ekranda ne değişti
- **Schedule → Published ▾ → Unpublish schedule penceresi:** "1 live shift will be removed", "Unpublish 1 location".
- **Schedule → Publish penceresi:** alt satır "1 of 1 location selected", "1 conflict must be fixed", "1 blocker · 1 risk", "1 of 1 employee will be notified"; tek vardiyalı lokasyonda "The only live shift at this location will be removed."
- **Schedule, yayın sonrası bildirim:** "1 location and 0 changes published." vb.
- **Schedule ızgarası, gün başlığı:** "bugün" rozeti lokasyonun kendi gününde. Tek saat dilimindeki işletmede fark görünmez.
- Üst çubuk menüleri, kurtarma penceresi, renkler: görünürde bir şey değişmedi.

Ekran görüntüleri (1440×900, light, `artifacts/nf-arayuz/g14-a/`):
- `bl311-unpublish-1-location.png`, `bl311-unpublish-2-locations.png`
- `bl353-today-real.png` (bugünkü hâl, iki lokasyon Los Angeles)
- `bl353-today-los-angeles-column.png` ve `bl353-today-new-york-column.png` (aynı an: Main Dining'de rozet SAL 29, Garden Room'da ÇAR 30)

Görüntülerde taklit edilen kısımlar: Unpublish için `publication-status` cevabında iki lokasyon yayınlı gösterildi (1 ve 3 vardiya); iki saat dilimi için `reference` cevabında Garden Room'un saat dilimi New York yapıldı ve tarayıcı saati 2026-09-30 05:00 UTC'ye sabitlendi. Sayfanın geri kalanı gerçek (seed hesabı `owner@newfork.test`, Meyhouse). Yerel DB'ye veri yazılmadı.

## 5. Sırada ne var, yolda bulunanlar
Sıra: dilim a main'e girince dilim b (BL-308, BL-392, BL-345, BL-305 kalanı, U08), yeni `origin/main`'den.

Yolda bulunanlar (düzeltilmedi):
- **(leave: low / do: safe) Publish penceresi, ikinci adım: aynı özet iki kez.** Üstteki panel başlığı ve alt çubuk aynı cümleyi yazıyor ("1 blocker · 1 risk"). `5a92d2f2` gövdedeki ikinci kopyayı kaldırmıştı; alt çubuktaki kopya yazım hatası yüzünden testten saklanıyordu. Görsel karar; BL-318 ya da dilim b.
- **(leave: low / do: moderate) "Bugün" rozeti ile "bakılan gün" rengi ayrışabiliyor.** S1 = A'nın bilinen sonucu (görev dosyası pre-mortem 3): gün dönümü saatinde lokasyon sütunu kendi gününü rozetlerken sütunun açık yeşil tonu cihazın gününde kalır (`bl353-today-new-york-column.png`: rozet ÇAR 30, yeşil ton SAL 29). Karar verildi; bilgi olarak.
- **(leave: low / do: moderate) Üst çubuk denetimlerinin ortak kenarı ham `#aeb9b4`** (`styles.css:3479`, 14 seçici). Bölüm 3, madde 2.
- **(leave: medium / do: safe) Kurtarma penceresinde "Discard" tek tıkla çalışıyor** (`ScheduleSaveRecoverySheet.tsx`, alt düğmeler). Buton dili yıkıcı eylemde iki tık kırmızı istiyor. Backlog'da karşılığı var mı bakılmadı.
- **(leave: low / do: moderate) Unpublish penceresi, yayın durumu okunamazsa yanıltıcı satır.** `publication-status` cevabı düşünce (taklit cevabım şemaya uymadığında görüldü) pencere ızgara okumasına döner ve "Garden Room, 0 live shifts will be removed" yazar. Yerel Meyhouse verisinde iki okuma aynı hafta için farklı konuşuyor: ızgara okuması Garden Room'u yayınlı, `publication-status` yayınsız (`no_published_shifts`) sayıyor.
- lint'teki 20 uyarı eski; bu işte eklenen yok.

Skills: `superpowers:test-driven-development` (her madde önce kırmızı), `design:ux-copy` (tek metin kararı), `superpowers:verification-before-completion` (bitişte ölçümler yeniden koşuldu). Görev dosyasındaki `superpowers:writing-plans`, `frontend-design:frontend-design`, `chrome-devtools-mcp:a11y-debugging` kullanılmadı: dilim a görünümü değiştirmiyor, gerek olmadı.

Temizlik: dev sunucuları (5630/5631) uygulamanın kendi durdurmasıyla kapatıldı, bu worktree'ye ait node/cmd süreci kalmadı; `.claude/launch.json`'a eklediğim iki yerel girdi geri alındı; kilit alınmadı.
