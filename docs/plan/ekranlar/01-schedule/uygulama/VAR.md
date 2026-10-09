# EKRAN-01 VAR — görsel varyantlar (Schedule) — uygulama arşivi

Requests'in varyantları (EKRAN-02 V) aynı turda, aynı dalda yapıldı; tek rapor burada. Requests künyesi: `docs/plan/ekranlar/02-requests/uygulama/V.md`. DRAG ölçümü: `DRAG-olcum.md`.

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| 01 Schedule | VAR — BL-445, BL-524, BL-525, BL-441, C-D11, C-P2 | `nf-arayuz` / arayüz hattı (dal `task/var-ekran-12`, `0d46e1c5` + `610bd330`) | R0 | yok (R0; main'e girmez, Mert seçer) | 2026-10-06 |

## Sonrası için
- Tuzak: yerel Meyhouse'un Palo Alto haftasında yayında vardiya yok; varyant ve görsel QA için ya örnek veri (`?var=` açıkken tarayıcıda çizilen örnek hafta, dal `task/var-ekran-12` `apps/web/src/dev/varEkran12.ts`) ya da yeni fixture gerekir.
- Kalıp: DEV varyantı `?var=<madde>-<harf>` → `<html data-var-<madde>>`; CSS tek dosyada `:root[data-var-…]` altında, JSX'te `devVar("<madde>")`; ürün koduna dokunmadan seçilir, seçilmeyenler hiç main'e girmez.
- Ölçüm: 1440'ta tek lokasyonlu haftada ızgara 1135 px, içerik 1350 px (gün sütunu ~165 px, kart genişliği belirliyor); 1024'te üst çubuğa süzgeçler için 337 px kalıyor.
- Tuzak: `hidden` özniteliği `display:flex` veren sınıfta işlemez (G1 C); gizlemek için CSS kuralı gerekir.
- Karar adayı: renk körlüğü benzetimi (`?var=cb-p` / `cb-d`) her renk kararının kontrol listesine girsin.

## Rapor

- **Karar:** R0, varyant dalı; inceleme yok (DELEGASYON §3). Varyant kodu main'e girmez, yalnız bu belge.
- **İzin:** gerekmiyor; varyantlar Mert'in seçimini bekliyor, DRAG kodu "başla" bekliyor.
- **Risk:** 🟠 DRAG ölçümü veri katmanında hata buldu: API kuralları düşürüyor, sürüklemede hiç yeşil yok, izinli gün amber.
- **Soru:** Mert'e 11 görsel seçim (aşağıda, her biri görüntüyle); koordinatöre: API düzeltmesi `nf-backend`'e mi, DRAG'dan önce mi.
- **Sonraki:** seçimler gelince W-4 / W-5 / C1–C3; DRAG düzeltmeden sonra.

Ekran görüntüleri: `C:UsersTheWeDocumentsCodex
ewfork-cleanartifacts
f-arayuzVAR-EKRAN-12` (`01-schedule<madde>`, `02-requests<madde>`; `_compare-*` ve `_side-by-side-*` yan yana karşılaştırma).
## 1. Nerede duruyor
- Görev 1 (varyantlar) bitti: 11 sorunun hepsi gerçek uygulamada, yalnız DEV'de `?var=` adresiyle açılıyor. Dal `task/var-ekran-12` (worktree `.claude/worktrees/admiring-volhard-ba38ed`), commit `0d46e1c5` + `610bd330`. **main'e girmez**, push edilmedi.
- Görev 2 (DRAG ölçümü) bitti, kod yazılmadı; koordinatörün "başla"sı bekleniyor. Ölçüm DRAG'ın önünde duran bir veri katmanı hatası buldu (`nf-backend`'in dosyası, dokunulmadı).
- `pnpm.cmd --filter @newfork/web typecheck` temiz (dal, 2026-10-06). Vitest/lint koşulmadı: dal main'e girmiyor, değişiklik yalnız DEV varyant kodu.
- Ekran görüntüleri ana klasörde: `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\nf-arayuz\VAR-EKRAN-12\` (git dışı). Bu rapor worktree'nin `artifacts/` klasöründe.

## 2. Dev sunucusu (Mert'in gezmesi için)
Sunucular şu an açık (web 5612, api 5613; 2026-10-06 ölçüldü, ikisi de 200). Oturuma bağlı açıldı, bir saat içinde kapanabilir. Yeniden açmak için iki terminal:

```
cd C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\admiring-volhard-ba38ed
set PORT=5613& set APP_URL=http://127.0.0.1:5612& pnpm.cmd --filter @newfork/api dev
```
```
cd C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\admiring-volhard-ba38ed
set VITE_API_URL=http://localhost:5613& pnpm.cmd --filter @newfork/web exec vite --host 127.0.0.1 --port 5612 --strictPort
```
Giriş: Schedule soruları yerel **Meyhouse**'ta `test.manager@meyhouse.test` (Palo Alto + Sunnyvale müdürü); Requests soruları **World e2e1791151294542**'de Ayşe (`e2e1791151294542.ayse.869efcd4@world.test`, Kadıköy müdürü). İkisi de sihirli bağlantıyla açıldı (yerel mailpit).

**Veri notu:**
- Schedule: yerel Palo Alto haftasında yayında vardiya yok. `?var=` taşıyan her Schedule adresi, ekrana yalnız tarayıcıda bir **örnek hafta** çizer (16 kişi, ~65 vardiya; 2 kişide müsait-değil, 2 kişide izin). Sunucuya hiçbir şey yazılmaz; `&demo=off` kapatır.
- BL-441: Publish penceresi gerçek bileşen, arkası DEV önizleme sayfası (`/availability-preview.html`); bulgular (1 engel + 1 risk) örnek.
- Requests: G1/G2/G4 gerçek vaka (Ali ↔ Deniz takası, 17 Eki 2028), G3 gerçek kayıt (Ali'nin kısaltma satırı). G2'deki yol/dinlenme değerleri örnek (bu veri FB-6.4 A1'den önce yok). G1'deki "karar veremezsin" durumu varyantla zorlanıyor (yetki kodu değişmedi).

Adres başı `http://127.0.0.1:5612`. Schedule örnekleri: `/app/schedule?date=2026-09-28&locations=6b98d6ab-c5c3-433f-8b8c-1c6c1a8c437c&var=<kod>`.

## 3. Sorular, varyantlar, önerim
Her klasörde `a-*` = bugünkü hâl; `_compare-*` / `_side-by-side-*` = yan yana. Masaüstü 1440 ve telefon 390.

### EKRAN-01 Schedule
**BL-445 — üst çubuk dar pencerede.** Bugün: Schedule üst çubuğu 1024 px'te 4 satır (166 px), 936'da 7 satır; Ayşe ızgarayı ekranın yarısından başlayarak görür.
- A `var=bl445-a` bugün. B `bl445-b`: 1280 altında Settings, Hide Unscheduled, dört süzgeç, Export, Templates yalnız simge; 1024'te tek satır, 936'da iki. C `bl445-c`: Settings + süzgeçler tek "Filters (1)" düğmesinde, açınca kart; Export/Templates dar pencerede simge; 936'da da tek satır.
- Görüntü: `01-schedule/BL-445/_compare-1024.png`, `_compare-936.png`, `c-1024-open.png`; tek tek 936/1024/1280/1440/390.
- Öneri: **C (Önerilen)**. Açık süzgeç sayaçta ve alttaki çip satırında ("Meyhouse Palo Alto ×") görünmeye devam eder; B'de altı simgenin anlamı ezber ister.
  Dayanak: ILKELER P20 (sade, kompakt) + A anti-hedef "kurumsal hantallık".

**BL-524 — ad sütunundaki müsaitlik simgesi.** Bugün: Burak'ın adının yanında üstü çizili eski amber takvim; üzerine gelince tarayıcının kendi kutusu ham tarih yazar ("Meyhouse Palo Alto: 2026-09-29 unavailable hours"; bu kutu ekran görüntüsüne çıkmıyor).
- B `bl524-b`: hücredeki "!" ile aynı turuncu nokta, üstüne gelince aynı balon ("Tue, Sep 29 · Unavailable after 2:00 PM"). C `bl524-c`: simge yok, adın altında "Unavailable Tue". D `bl524-d`: işaret yok (bilgi zaten hücrede).
- Görüntü: `01-schedule/BL-524/_side-by-side-1440.png`.
- Öneri: **B (Önerilen)**; tarayıcı `title`'ı da kalkar (C-D14).
  Dayanak: KARARLAR "Ekran kararları → Schedule" G14 (turuncu, C3 balon dili) + CLAUDE.md §9 görsel tutarlılık.

**BL-525 — izin ile müsait-değil yalnız renkle ayrılıyor.** Bugün: Busra'nın izinli Çarşamba'sı (kırmızı tarama) ile Carlos'un müsait olmadığı Çarşamba (turuncu tarama) aynı desen; renk körlüğü benzetiminde ikisi zeytin/sarıya yakın.
- B `bl525-b`: izin hücresinin köşesinde kırmızı "×". C `bl525-c`: izin çapraz (iki yönlü) tarama. D `bl525-d`: boş izin hücresinde "TIME OFF" yazısı. Renkler değişmedi (G14 kilidi).
- Her varyant `,cb-p` (protanopi) ve `,cb-d` (döteranopi) eklenince benzetimli açılır.
- Görüntü: `01-schedule/BL-525/_side-by-side-1440.png`, `_side-by-side-protanopia.png`.
- Öneri: **D (Önerilen)**; benzetimde en net ayrışan (yazı renk istemez). Not: Mert 2026-10-01'de bu soruya "Backlog'a yaz" demişti; bu tur "eski maddeler dahil" kararıyla yeniden soruluyor.
  Dayanak: CLAUDE.md §9 WCAG 2.1 AA (1.4.1 "yalnız renkle bilgi verilmez").

**BL-441 — Publish → Pre-flight'ta aynı sayım iki kez.** Bugün: panelin başında "1 blocker · 1 risk", pencerenin altında yine "1 blocker · 1 risk".
- B `bl441-b`: sayım yalnız üstte (açıklama cümlesiyle). C `bl441-c`: sayım yalnız altta düğmelerin yanında, panel doğrudan bulgularla açılır.
- Adres: `/availability-preview.html?view=publish-return&var=bl441-b` → "Next". Görüntü: `01-schedule/BL-441/_compare-1440.png`.
- Öneri: **B (Önerilen)**; sayı, ne yapılacağını söyleyen cümleyle ("Fix hard blockers…") birlikte kalır.
  Dayanak: ILKELER P21 (tek mesaj) + P20 (gereksiz tekrar yok).

**C-D11 — tek lokasyonlu haftada Pazar görünmüyor.** Bugün: 1440'ta Palo Alto haftasında ızgara 1135 px, içerik 1350 px; Cumartesi kesik, Pazar kaydırmayla gelir (örnek haftada ölçüldü).
- B `cd11-b`: yedi gün her genişlikte sığar, kart yazısı gerekirse iki satıra iner (1440 ve 1280'de kaydırma yok). C `cd11-c`: Schedule açılınca sol menü simge rayına iner; 1440'ta sığar, 1280'de yine kayar.
- Görüntü: `01-schedule/C-D11/a|b|c-1440.png`, `-1280.png`.
- Öneri: **B (Önerilen)**; C 1280'de sorunu çözmüyor.
  Dayanak: yok — yeni karar (yakın: ILKELER A "Cihaz", müdür masaüstünden kullanır).

**C-P2 — telefon düzeni.** Bugün: 390 px'te ad sütunu 200 px (%51), tek gün görünür, üst yüzey 4 satır.
- B `cp2-b`: ad sütunu 112 px, ad iki satıra kırılır; ~1,7 gün görünür. C `cp2-c&view=day`: günlük görünüm liste olur (ad ince başlık, altında o günün vardiyası tam genişlik; boş kişiler gizli). İkisi üst çubuğun C'siyle birleşik de çekildi.
- Görüntü: `01-schedule/C-P2/_compare-390.png`.
- Öneri: **B (Önerilen)** + üst çubukta BL-445 C.
  Dayanak: ILKELER A "Cihaz" — yönetim ekranları masaüstüne göre tasarlanır, telefonda çalışır.

### EKRAN-02 Requests
**G1 — müdür onaylayamadığı vakada.** Bugün: Requests → Shift changes → Ali'nin takası → Review: "Approve my location" ve "Decline" her müdürde açık.
- B `g1-b`: iki düğme kapalı (soluk) + kilit simgeli satır "Another Kadikoy manager, the owner or an admin decides this request." C `g1-c`: düğmeler yok, yalnız aynı satır.
- Adres: `/app/schedule/requests?tab=shift-changes&from=2028-10-01&to=2028-10-31&case=11197306-344c-4240-9768-c9c12f3b08e2&var=g1-b` → Deniz'in "Review"i. Görüntü: `02-requests/G1/_compare-1440.png`.
- Öneri: **B (Önerilen)**; aynı ekranda iki ayrı "karar veremezsin" görünümü olmaz.
  Dayanak: KARARLAR "Schedule → Requests" K-S2 (belgesi eksik müdürde "Approve / Deny kapalı ve yanında not").

**G2 — onay ekranında yol / dinlenme işareti.** Bugün: işaret yok (kural takası engelliyor; FB-6.4 A1 düzeltecek).
- B `g2-b`: "IF APPROVED" içinde, düğmelerin üstünde iki amber satır ("Travel 30 min, rule 45 min. Deniz Person: Besiktas ends 3:00 PM…"). C `g2-c`: bölümün en üstünde ayrı amber kutu "Check before approving … A flag, not a block. You decide." D `g2-d`: aday kartında "Eligible"ın yanında iki küçük çip.
- Görüntü: `02-requests/G2/_compare-1440.png`.
- Öneri: **B (Önerilen)**; S5-B'nin rıza satırıyla aynı yer ve aynı amber dil.
  Dayanak: KARARLAR "Müsaitlik → Tasarım seçimleri" S5-B + KARARLAR "Yol ve dinlenme süresi" (işaret, engel değil).

**G3 — sistemin yazdığı izin kısaltma satırı (Time off → Closed).** Bugün: Ali'nin satırı adın altında düz "Leave cancellation"; Ali'nin kendi iptal isteğinden ayırt edilmiyor.
- B `g3-b`: satır yerinde, makas simgesi, "Shortened for a shift · by Ayse Person". C `g3-c`: satır, kısalttığı iznin hemen altına girintili alt satır ("Shortened for a shift / By Ayse Person · shortens the time off above").
- Adres: `/app/schedule/requests?var=g3-b` → Closed. Görüntü: `02-requests/G3/_compare-1440.png`, `_c-zoom.png`.
- Öneri: **B (Önerilen)**; liste sırası ve sıralama düğmeleri bozulmaz.
  Dayanak: BL-364'ün önerdiği etiket + ILKELER P21 (kısa, tek mesaj).

**G4 — Shift changes'in Time off denetimini alması (teyit, varyant değil).** `g4-b`: sekmeler Time off'un gri kutulu sekmesi, History simgeli, aramada büyüteç. Görüntü: `02-requests/G4/_compare-1440.png`.

**S7 — arama / açılır liste kenarı (Mert: "ikisini yan yana göster").** Bugün: ortak renk `#aeb9b4` sayfa zemininde 1,84:1; Requests henüz kendi `#e1e7e3`'ünü çiziyor (1,25:1).
- A `s7-a`: ortak renk bugünkü değer. B `s7-b`: `--theme-border-control` = `#7f8c86` (sayfa zemininde 3,2:1, beyazda 3,5:1). Token tek; Schedule üst çubuğu birlikte değişir (KK-162).
- Görüntü: `02-requests/S7/_requests-1440.png` (bugün / A / B), `_notifications-1440.png`, `_schedule-1440.png`; tek tek 1440 + 390.
- Öneri: **B (Önerilen)**.
  Dayanak: CLAUDE.md §9 WCAG 2.1 AA (1.4.11 kontrol kenarı 3:1).

## 4. DRAG ölçümü (Görev 2) — kod yok, "başla" bekleniyor
**Yöntem:** bırakma rengini üreten iki fonksiyon (`evaluateScheduleShiftDropTarget`, `evaluateSchedulePresetDropTarget`; grup değerlendirmesi hiçbir sürüklemeden çağrılmıyor) gerçek kodla, geçici bir vitest dosyasıyla 5 hücre × 4 sürükleme koşuldu (dosya sonra silindi). API'nin gerçek cevabı yerel 5613'ten okundu (`/schedule/reference`, Meyhouse, 2026-10-06): `settings` = `{"time_format":"12h"}`.

**Kök bulgu:** API, veritabanının gönderdiği `settings.conflict_rules`'u düşürüyor. `apps/api/src/schedule/schedule-service.ts:510-515` `settings`'i yalnız `{ time_format }` ile yeniden yazıyor; veritabanı fonksiyonu kuralları gönderiyor (`supabase/migrations/20261007030000_manager_note_names_its_writer.sql:122-127`). Kural yokken web her bırakmayı "kurallar kontrol edilmeli" diye amber sayıyor (`apps/web/src/schedule/hooks/useScheduleGridDragControllers.ts:42`) ve izni "confirm"e düşürüyor (`apps/web/src/schedule/schedule-conflicts.ts:28-29`).

| Hücre | Bugün (taşı / kopyala / açık vardiya / preset — dördü aynı) | Kurallar gelseydi | Karar (KARARLAR 2026-10-06) |
|---|---|---|---|
| Boş, uygun hücre | **amber** | yeşil | yeşil |
| Müsait değil | amber | amber | amber ✓ |
| Onaylı izin | **amber** | kırmızı | kırmızı |
| Aynı saatte başka vardiya | kırmızı | kırmızı | kırmızı ✓ |
| Kapalı gün | amber | ayara göre (Meyhouse `confirm` → amber; `block` → kırmızı) | K17 ayarı |
| Yanlış lokasyon / yanlış iş | kırmızı | kırmızı | kırmızı ✓ |
| Unassigned satırına | **amber** | yeşil | yeşil |

Örnek: Ayşe bugün Ali'nin vardiyasını boş bir Perşembe'ye sürüklediğinde hücre yeşil değil amber yanar; Ali'nin izinli Çarşamba'sı da kırmızı değil amber yanar ve bırakılabilir.
- Aynı alan K17 kapalı gün ayarını da besliyor: hızlı düzenleyici (`ShiftQuickEditor.tsx:420`) ve `SchedulePage.tsx:656` ayarı okuyamıyor (ölçülmedi; aynı kayıp alan).
- Yerel ayar (2026-10-06 SELECT): 426 workspace'in hepsinde `approved_time_off = block`; Meyhouse ve dünyada `closed_location = confirm`.
- **Sonuç:** veri katmanı düzelince renk mantığı karara zaten uyuyor. DRAG diliminde arayüze kalan: `styles.css:5841-5855` ham hex'lerin token'a geçmesi ve `data-drop-status` için vitest.
- Öneri sırası: önce `nf-backend` küçük düzeltmesi (API `settings`'e `conflict_rules`, `minimum_travel_minutes`, `minimum_rest_minutes` geçer; paylaşılan cevap şekli → R2; test: API cevabında kurallar var + web'de boş hücre "allowed"), sonra DRAG.

## 5. Açık kalan ve nedeni
- Mert'in 11 seçimi (koordinatör soracak).
- DRAG kodu: "başla" bekliyor; önünde yukarıdaki API düzeltmesi var.
- Dal `task/var-ekran-12` ve bu worktree seçimler KARARLAR'a yazılınca silinir (main'e girmez).
- Sunucuları (preview, 5612/5613) Mert gezsin diye açık bıraktım; ihtiyaç kalmayınca ben kapatırım.

## 6. Ekranda ne değişti
main'de görünürde bir şey değişmedi. Yalnız dalda, DEV'de, `?var=` ile.

## 7. Yolda bulunanlar (backlog adayı, dokunulmadı)
1. **API `conflict_rules`'u düşürüyor** (yukarıda) — leave: high / do: moderate. Sürükleme rengi ve K17 kapalı gün ayarı bütün Schedule'da yanlış çalışıyor.
2. `evaluateScheduleShiftGroupDropTarget` hiçbir sürüklemeden çağrılmıyor, yalnız testi var (ölü kod) — leave: low / do: safe.
3. Requests'in arama/açılır listesi ortak token yerine kendi `#e1e7e3`'ünü çiziyor (1,25:1) — R2-30'un parçası, C1/C3'te zaten var.
4. C-P2 C seçilirse lokasyon başlığı sağa yaslı kalıyor (cila, W-5).

Skill: `superpowers:verification-before-completion` (iddialar komut çıktısı ve dosya:satırla). `systematic-debugging` açılmadı: beklenmedik bozulma yok, DRAG kök nedeni ölçümle bulundu.

## 8. Sonuç (VAR-UYG, 2026-10-06)
- VAR-HUCRE (a → b → c) Mert'in seçimleri ve ad "!" kuralıyla gerçek Schedule'a girdi: `uygulama/VAR-UYG.md`. Varyant kodu main'e girmedi; dal `task/var-ekran-12` EKRAN-03 ve Requests varyantları için açık kalıyor.
