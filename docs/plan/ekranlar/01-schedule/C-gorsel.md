<!-- EKRAN-01 Schedule keşfi, parça C (nf-gorsel-qa, salt okuma), main 06a74d5a, 2026-10-05. Ajanın raporu olduğu gibi. Ekran görüntüleri: artifacts/nf-gorsel-qa/EKRAN-SCHEDULE/ (git dışı). -->

**DENETİM SONUCU:** Schedule'da 8 yeni gerçek kusur ve 8 bilinen madde için yeni ölçü bulundu. Kapanış turunu bloke eden bir şey yok. Üç madde WCAG AA'ya takılıyor (D3, D4, D5); en önemlileri D1, D2 ve D3.

Kod `06a74d5a` (main). Web 5616, API 5617 kullandım; bitince yalnız kendi başlattığım süreçleri PID ile durdurdum (22044 ve 33704 ağaçları). Kullanıcının 5555/5556 sunucusuna dokunmadım.

Ekran görüntüleri: `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\nf-gorsel-qa\EKRAN-SCHEDULE\` (adlar aşağıda).

## Masaüstü (1440, bazı ölçüler 1280/1024/768)

**D1. Hızlı düzenleyicide Delete tek tıkla siler (UI-12'ye aykırı) · YENİ · leave: medium / do: safe**
- Yol: düzenleme modu → vardiyaya sağ tık → Edit shift → Delete (kırmızı, 31px, 16px yazı).
- Örnek: Alex'in Cuma 10:00–14:00 vardiyası ilk tıkta silinip üstü çiziliyor; yalnız şeritteki Undo geri alıyor.
- Aynı işlem şeritteki "Delete 1" ile yapılınca "Delete selected shifts?" onay penceresi çıkıyor. Aynı eylem, iki davranış.
- Görüntü: `q2-delete-first-click.png`, `q3-strip-delete-confirm.png`.

**D2. Mouse ile logoya tıklayınca hafta bugüne atlıyor, logo penceresi açılmıyor · YENİ · leave: medium / do: safe**
- Yol: Schedule, 12–18 Ekim haftası (içinde bulunulan hafta değil) → sol üstteki "Meyhouse" logo kutusuna tıkla.
- Sonuç: URL `date=2026-10-05`'e dönüyor, pencere açılmıyor (ölçtüm: dialog sayısı 0). İçinde bulunulan haftada pencere açılıyor.
- Neden: boş yere tıklamayla filtreleri ve haftayı geri alan mekanizma logo kutusunu "boş yer" sayıyor (`apps/web/src/schedule/lib/scheduleInteractionTargets.ts:63-88`, istisna listesinde `.schedule-grid-logo-frame` yok). Klavyeyle Enter çalışıyor.
- Görüntü: `lg-logo-dialog.png`.

**D3. Odak pencereye girmiyor · kısmen BL-327(3), geri kalanı YENİ · leave: high / do: moderate (WCAG 2.4.3, 2.1.1)**
- Hızlı düzenleyici: Enter ile açınca odak ızgara düğmesinde kalıyor. Tab, editöre değil sonraki hücrelere gidiyor. Esc'ten sonra odak BODY'de.
- Export paneli: rolü yok (`section`, etiket "Export settings"). Esc kapatmıyor, odak içeri girmiyor, Tab'ın bir sonraki durağı Templates. Açıkken sol menünün yerini alıyor.
- Publish penceresi: açılınca odak BODY. Templates, Logo ve çalışan çekmecesi: odak tetikleyici düğmede kalıyor. "Keep editing?": odak BODY.
- Unpublish ve "Draft is being edited" pencereleri doğru davranıyor (Cancel'a odak, "Draft is being edited" için BODY).
- Düzenleme modunda her boş hücre ayrı Tab durağı: yaklaşık 56 durak. Etiketleri ham tarih taşıyor ("Add shift for unassigned at Main Dining on 2026-10-12").

**D4. "2 open shifts" kontrastı yetersiz · YENİ · leave: medium / do: safe**
- Unassigned satırı, iki modda da: 10px, #78827e üstüne #fef3c7 = **3,56:1** (AA 4,5 ister).
- Sayfadaki öbür metinler geçti (≥5:1). Turuncu "!" bayrağı 3,28:1 ama grafik sayılıyor, sorun değil.

**D5. Yayın durumu yalnız renkle söyleniyor · YENİ · leave: medium / do: safe (WCAG 1.4.1)**
- 12–18 Ekim'de Main Dining yayında, Garden Room değil. Sağ üstte turuncu bir "Published" düğmesi çıkıyor; tam yayında yeşil, düğmenin yazısı aynı. `data-publication-tone="partial"` yalnız stilde.
- Lokasyon başlığındaki 11px durum noktası yeşil / kırmızı / gri. Açıklaması odaklanamayan bir `span`'de (`title` + `aria-label`). Telefonda ve klavyede okunmuyor.

**D6. "Keep editing?" penceresi öbür pencerelerden farklı · YENİ · leave: low / do: safe**
- SAVE / CONTINUE büyük harf, 16px, 36px yükseklik; öbür pencereler 13px, 34px, normal harf. Arka plan karartması yok. Süre dolunca ne olacağı yazmıyor. Odak içeride değil.
- BL-607'nin metin düzeltmesi (15 dk) doğru çalışıyor.
- Görüntü: `i1-keep-editing.png`.

**D7. "Review default hours" penceresi stilsiz · YENİ · leave: medium / do: safe**
- Yol: düzenleme modu → şeritteki Review default hours.
- Tarayıcının kendi tarih kutuları ("12.10.2026") ve açılır listesi, çerçeveli fieldset, 16px başlık, tarayıcı griliğinde "Close", "Review 0 shifts" düğmesi.
- BL-062 pencereyi görünür yaptı ama stilini yapmadı. Öbür pencerelerin dilinde değil.
- Görüntü: `e6-review-default-hours.png`.

**D8. Çakışma kartı Cancel düğmesini örtüyor · YENİ · leave: medium / do: safe**
- Alex'in Salı hücresine 15:00–19:00 yazınca çıkan kırmızı "Employee already has an overlapping shift…" kartı editörün alt kenarını kapatıyor; "Cancel" yerine "ancel" görünüyor.
- Görüntü: `x2-after-submit.png`.

**D9. Editör içi hiza ve boyut tutarsızlığı · YENİ · leave: low / do: safe**
- "SHIFT TYPE" ortalı, büyük harf, 10px. Employee, Job, Count, Note sola hizalı, 11px. "Time and break", Start/End, "Unpaid break", "Show times on badge" ortalı.
- Alt düğmeler (Cancel, Add shift) 16px / 31px; alan yazıları 11–12px.
- Not alanı 1280×720'de alt çubuğun arkasında yarım kalıyor. 
- Görüntü: `e3-add-shift-editor.png`, `q1-edit-shift-1280x720.png`.

**D10. Izgaranın üstünde sürekli boş 42px bant · BL-578'in genişlemesi · leave: low / do: safe**
- `schedule-filter-command-strip` y84–126: filtre yokken de boş. BL-578 yalnız telefonda düzenleme modunu yazıyor; masaüstünde de, görünüm modunda da var.

**D11. Tek lokasyonlu haftada Pazar görünmüyor · YENİ · leave: medium / do: moderate**
- Müdür (Kadıköy) 1440'ta: ızgara alanı 1137px, içerik 1350px. 7 günün 5'i tam görünüyor, Cumartesi kesik, Pazar kaydırmayla geliyor. 1366'da 5, 1280'de 4 gün.
- Sol menü sabit 288px, gün sütunu en az 165px. Görsel karar olduğu için varyantla sorulmalı (P04).

**D12. Üst çubuk dar genişlikte · bilinen maddeler, güncel ölçü**
- 1280: 3 satır (125px). 1024: 6 satır (248px). 768: Export / Templates / New Schedule / Published "All locations" süzgecinin üstüne biniyor ve "Published" sağdan kesiliyor (BL-233 geçerli, BL-445 geçerli). Görüntü: `w2-1280.png`, `w2-1024.png`, `w2-768.png`.
- YENİ küçük bulgu: hafta değişince tarih kutusunun genişliği değiştiği için "Next week" ve "Settings" düğmeleri yatayda 8px kayıyor (Next x=519, 527, 525, 526).

**D13. Unassigned satırı görünüm modunda duruyor · BL-681, hâlâ geçerli** (12–18 Ekim: "Unassigned / 2 open shifts"). Görüntü: `t2-owner-2026-10-12-1440.png`.

**D14. Ad sütunundaki müsaitlik simgesi · BL-524'ün üstüne yeni ayrıntı**
- Eski üstü çizili takvim simgesi duruyor. Üzerine gelince çıkan yazı tarayıcının kendi `title`'ı ve ham tarih içeriyor: "Main Dining: 2026-10-13 unavailable hours; … 2026-10-16 all day". Yeni turuncu ipucu balonuyla (doğru çalışıyor) aynı bilgiyi başka biçimde veriyor.

**D15. Pencere dilleri** · BL-318 geçerli; üstüne üç yeni örnek: Review auto-fill (Cancel 16px), Keep editing?, Review default hours. Unpublish metni kendi içinde çelişiyor: "This cannot be undone. Republish to restore." ve "unworked shifts" jargonu (YENİ, low). Settings menüsünde "Role Seperators" yazım hatası (BL-655 geçerli).

**D16. İki Templates yüzeyi · YENİ · low.** Templates düğmesi pencere açıyor ("New template from a draft"). `/app/schedule/templates` ayrı bir sayfa; boş metni "Open the schedule page, build a week, then save…" diyor.

**Küçük, YENİ, low:**
- Yüklenirken "Resolving the published week." (P21'e aykırı geliştirici dili).
- Geçmiş hafta: New Schedule menüsünde kayıtlı taslak satırı var ama düğmesi ve "read-only" açıklaması yok.
- Mini takvimde ay dışı günler #87918d / beyaz = 3,25:1; satır başı siyah noktaların anlamı yazılı değil.
- Gölge vardiya iğne düğmeleri yalnız "Location" diye adlı (yer adı yalnız balonda).

## Telefon (390, dokunmatik)

**P1. Filtre menüleri sağdan taşıyor · BL-587'nin genişlemesi · leave: medium / do: safe**
- 390'da "All shifts" sığıyor ama **All locations** (x161–419) ve **All employees** (x196–454) sağ kenardan çıkıyor: "All sel…", "Esc to…" ve "Merge locations" anahtarı kırpılıyor. BL-587 yalnız "All shifts"i yazıyor.
- Görüntü: `m1-filter-locations.png`.

**P2. Ad sütunu ekranın yarısı · YENİ (G25) · leave: medium / do: moderate**
- Ad sütunu 200px = 390'ın %51'i. Aynı anda tek gün sütunu görünüyor; vardiya yazısı kesiliyor ("Open-Ser…").
- Üst yüzey 4 satır, boş bant, logo ve lokasyon başlığı: düzenleme modunda ilk satır ekranın yarısında başlıyor (`m2-edit.png`).
- Üst çubuk 34px, şerit 30px, mini takvim günleri yaklaşık 30px: 44px'in altında (BL-334 ile aynı aile). WCAG 2.1 AA bunu şart koşmuyor, öneri.

**P3. Boş bant telefonda da var.** Görünüm modunda yaklaşık 42px (BL-578 yalnız düzenleme modunu yazıyor).

**P4. Bilinen, tekrar doğrulandı**
- Unpublish penceresi x18–380: 8px sağa kayık (BL-580 geçerli).
- Settings menüsü 390'da tam sığıyor; BL-333 390'da düzelmiş görünüyor (375'te denemedim).
- Telefonda Export gizli: karar gereği.
- Publish, Templates, New Schedule ve Published menüleri telefonda düzgün açılıyor.

## Doğru çalışanlar

- Müsaitlik ve onaylı izin ipuçları G14 tarifiyle birebir (renk, çerçeve, metin).
- "Draft is being edited" ve hata ekranı ("Schedule unavailable" + Retry) düzenli.
- Kapalı gün ve önemli gün ikonları (kilit, takvim) düzgün çiziliyor.
- Üst çubuk siyah kalıyor (Mert kararı).
- Employee rolü `/app/schedule`'a girince Employee Hub'a yönleniyor.

## Öneri (engel değil)

- Boş yere tıklayınca filtreler soyuluyor ve hafta bugüne atlıyor; vardiya kartına tıklayınca iş filtresi uygulanıyor (tasarım gereği). Kullanıcıya hiçbir ipucu verilmiyor; D2'nin kök nedeni de bu mekanizma.
- Filtre başlıkları tarayıcının 1px siyah odak halkasını, öbür düğmeler 2px yeşili kullanıyor. Çalışan adı odakta yalnız alt çizgi alıyor (görünür, ama farklı dil).
- Lokasyon filtresi tek lokasyonlu müdürde de açılıyor ("All locations / Kadikoy / Merge locations"); anlamsız.

## Kanıt

- Roller: owner (`owner@newfork.test`, Meyhouse), Kadıköy müdürü (`docmnysg-kmgr`), Beşiktaş müdürü (`docmnysg-bmgr`), employee Ali.
- Genişlikler: 1920, 1600, 1440, 1366, 1280, 1024, 768 ve 390 (dokunmatik).
- Durumlar: yayınlı hafta, güncel hafta, boş hafta, geçmiş hafta, edit modu, yükleniyor / hata, her menü ve pencere.
- Ölçüler: Playwright (konum, yazı boyutu, odak halkası), kontrast hesabı (WCAG formülü).
- Mock'lar (veri yazılmadı): kapalı gün + önemli tarih, uzun adlar / etiketler / not, düzenleme kilidi çakışması, yavaş ve 500 cevap.

**Veri notu:**
- Düzenleme oturumları açıp Discard ettim; hiçbir şey yayınlamadım, hiçbir şablon kaydetmedim.
- Betiklerimden biri çöktüğü için açık kalan KENDİ düzenleme oturumumu (`cef5f823…`) veritabanında `discarded` yaptım; başka kayda dokunmadım.
- Veritabanında duran 3 eski `active` oturum (4 Ekim'den) benim değil.

**Hafıza:** bu oturumda dosya yazma aracı kapalı olduğu için `.claude/agent-memory/nf-gorsel-qa/` altına not yazamadım. Giriş bilgileri, seçiciler ve tuzaklar yukarıdaki kanıt bölümünde.
