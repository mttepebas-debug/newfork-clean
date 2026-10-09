# EKRAN-10-JOBS — Settings → Jobs & departments: kopya, varyasyonlar, son hâl

Karar · Mert V1'i (ortak tablo dili) üç düzenlemeyle kabul etti (2026-10-07, bu oturumun penceresinde: "Okay"); kod incelemesi düzeltmeleri sürüm 5'te ("Düzelt"). Kayda geçirilecek iki karar aşağıda; KARARLAR'a koordinatör yazar.
İzin · gerek yok: kod ve canlı değişikliği yok; yalnız artifact ve bu belge.
Risk · 🟢 kodda ve veride değişiklik yok; artifact özel (yalnız Mert'in hesabı açar).
Soru · beş kapsam sorusu açık ("Koda uygulanacaklar → Açık sorular"); koda uygulama işi başlamadan cevaplanır.
Sonraki · V1'in koda uygulanması ayrı iş (koordinatör açar); kapsamı aşağıda "Koda uygulanacaklar".

## Artifact

- https://claude.ai/artifact/BUJShpW3rXDGFVNyEygDZr — **son sürüm 6** (version id `1791414590-aba9`).
  - Sürüm 1 (`1791362757-1523`): yalnız birebir kopya.
  - Sürüm 2 (`1791364299-b30f`): 2. sekmede 6 varyasyon.
  - Sürüm 3 (`1791365263-2470`): V1 seçildi; liste alanı için A/B/C seçenekleri.
  - Sürüm 4 (`1791365638-0210`): Mert'in C + kenar seçimi işlendi; A ve B çerçeveleri kaldırıldı.
  - Sürüm 5 (`1791414429-0f20`): kod incelemesi düzeltmeleri. Sayı hücresi ortak tablo biçiminde; çekmecede bugünkü sayfa geçişi ve bekleyen değişiklik satırı geri kondu.
  - Sürüm 6: artifact'taki değişiklik listesi düzeltildi (liste bugün de kendi alanında kayıyor; metin farkları eklendi). Görünüm sürüm 5 ile aynı.
- Sekme 1 "Bugünkü ekran": Mert'in dev sunucusundaki (localhost:5555) `/app/settings/jobs` ekranının 14 hâli. Ölçüler 1440 × 900, owner hesabı, Meyhouse. Gerçek DOM, kullanılan CSS ve Inter kullanıldı. Piksel karşılaştırmasında 1 296 000 pikselin 24–499'u farklı; fark yalnız yazı yumuşatmasından ve çerçeve köşesinden geliyor.
- Sekme 2 "Varyasyonlar": V1–V6 sayfa ve çekmece görünümleri, gerçek veriyle (3 departman, 6 iş, 4 çalışan). V1 "Seçildi" olarak işaretli.

## Mert'in kararları (kayda geçecek)

1. **Jobs & departments, V1 "ortak tablo dili" ile yapılır** (Mert, 2026-10-07, bu oturumun penceresinde: "V1 ILE DEVAM ET KABUL EDECEGIM EDITLERINDEN SONRA", ardından "Okay").
   - Başlık ortak liste dilinde: SETTINGS üst yazısı, yeşil noktalı başlık, sağ üstte düğme yok.
   - Sekmeler Jobs · Departments · Archived.
   - Süzgeç satırı: Department (200 px), arama (kalan genişlik), sağ uçta yeşil "New job".
     - 200 px, ortak CSS'in bugünkü değeri: `.list-page.list-page .catalog-toolbar-filter-row .toolbar-filter-select`; Employees'in Location süzgeci de 200.
     - KARARLAR'daki ölçü listesi Location ve Document type için 180 diyor; bu çelişkiyi koordinatör kapatır.
   - İşler tek tabloda; her departman tablonun içinde ara başlık satırıdır. Örnek: "DINING ROOM · 2 jobs · 2 employees", sağında "+ Add job" ve ⋯.
   - Reddedilenler: V2 (departman listesi + iş tablosu, ortada pencere), V3 (departman kartları, sekmeli çekmece), V4 (satır içinde düzenleme), V5 (pano, iki listeli çekmece), V6 (ağaç + yan panel).
   - Dayanak: KARARLAR → "Liste sayfalarının ortak dili" (Jobs kendi turunda bu dile geçer) ve Sistem 1.
2. **Jobs çekmecesinde çalışan listesi çerçeveli ve çizgili, satırlar içinde kayar** (Mert, 2026-10-07, çoktan seçmeli soruya seçenek dışı cevap: "Çekmece, liste seçeneği C: dolgu satırlarıNA sağdan soldan dikey border çizersen. içindeki rowlar da scroll yapınca kayacağı belli olacak şekilde. bence en iyisi o olacak. tüm sectionı kapsayan çerçeve içinde scroll up down olabilen rowlar").
   - Liste tek bir çerçevenin içindedir. Çerçeve listenin üstünden başlar, sayfa geçişi satırına kadar iner.
   - Boş kalan yer 56 px aralıklı çizgili dolgu satırıdır.
   - Liste uzunsa çerçeve yerinde kalır, satırlar ve çizgiler içinde kayar.
   - Arama, lokasyon seçici ve All / Assigned / Not assigned sekmeleri çerçevenin üstündedir.
   - Bugünkü iki parça kalır: çerçevenin altında sayfa geçişi ("1–4 of 4", ‹ ›, 50'şer kişi), alt çubuğun üstünde bekleyen değişiklik satırı ("No pending changes" / "N to assign · N to remove").
   - Reddedilenler: A (yalnız çerçeve, kutu son satırda biter; önerilen), B (yalnız son satırın altına çizgi).
   - Neden: liste beyaz zeminde kayboluyor ve yarıda bitiyordu.

## Değişiklik listesi (bugünkü uygulamaya göre)

| # | Öğe | Özellik | Bugün | V1 son hâl | Etkilenen token / ortak bileşen |
|---|---|---|---|---|---|
| 1 | Tablo → Employees sütunu | hücre içeriği | kişi simgesi + sayı | yalnız sayı. Ortak tablo hücresi biçiminde: 13 px, `--theme-list-cell-text`, normal kalınlık, rakamlar eşit genişlikte. Sütun 140 px | yalnız Jobs; ortak hücre kuralına uyar |
| 2 | Çekmece → Employees başlığı | yardım yazısı | "Check to assign. Uncheck to remove." | kaldırıldı | yalnız Jobs çekmecesi |
| 3 | Çekmece → çalışan listesi | sınır | son satırdan sonra çizgisiz beyaz boşluk. Liste zaten kendi alanında kayıyor (`jobs-settings.css:1911-1915`) | tek çerçeve: 1 px `--theme-list-frame`, köşe 7. Sol ve sağ kenarı arama satırıyla aynı hizada (x=904 / 1416). Boş yer 56 px aralıklı çizgi (`--theme-border-subtle`). Satır yüksekliği 56 | yalnız Jobs çekmecesi; var olan token'lar, değer değişmez |
| 4 | Çekmece → sayfa geçişi, bekleyen değişiklik satırı | yer | listenin altında; alt çubuğun üstünde | aynı: çerçevenin altında; alt çubuğun üstünde | değişmez |
| 5 | Çekmece → metinler ve başlık | metin | "Save changes"; "Unassigned"; filtrede sayı yok; "Details" başlığı yok; başlıkta açık zeminde iş renginde simge, üstte "Dining Room"; "1 employees assigned" | "Save"; "Not assigned"; "All 4 · Assigned 1 · Not assigned 3"; "Details" başlığı; iş renginde dolu kare içinde beyaz simge, üstte büyük harf "DINING ROOM"; "1 employee assigned" | e2e metin ikizleri aranır (`apps/web/CLAUDE.md` → Metin) |

Ortak değer değişmedi. Jobs zaten karar verilmiş ortak liste diline geçiyor. Bugün sağ üstte duran "Add ▾", süzgeç satırının sağ ucunda yeşil "New job" olur; bu yalnız Jobs'u etkiler.

## Koda uygulanacaklar (ayrı iş için kapsam önerisi)

- `apps/web/src/settings/JobsSettingsPage.tsx`, `jobs-settings.css`:
  - Başlık ortak `catalog-page-header` olur (Settings → Documents gibi).
  - Görünüm denetimi All / Departments / Jobs yerine Jobs · Departments · Archived sekmeleri gelir.
  - Süzgeç satırı: Department, arama, yeşil New job.
  - Tablo ortak çerçevede olur, departmanlar ara başlık satırı olur.
  - Employees sütununda yalnız sayı (değişiklik 1).
- `JobAssignmentsDrawer.tsx`:
  - Yardım yazısı kalkar (değişiklik 2).
  - Var olan kayan liste alanına çerçeve ve çizgili dolgu eklenir (değişiklik 3). Bugünkü kaydırma kuralları korunur: `.catalog-drawer .job-employee-list` ve hata hâlindeki `:has(> .job-error)` kuralı (`jobs-settings.css:1955`).
  - Sayfa geçişi ve bekleyen değişiklik satırı olduğu gibi kalır (değişiklik 4).
  - Değişiklik 5'teki metinler: önce e2e'deki ikizleri aranır.
- Açık sorular (Mert'e; uygulama işi başlamadan cevaplanır):
  1. *(Kapandı 2026-10-09: düz liste kalkar; V1 tek tablo + Department süzgeci — KARARLAR "Settings → Jobs & departments: V1", "Requests tek tablo".)* **Düz Jobs görünümü.** Bugünkü Department sütunlu düz liste V1'de yok. V1'de onun yerini Department süzgeci tutuyor. Kalkıyor mu?
  2. *(Kapandı 2026-10-09: sıralama kalır, başlıkta ↕, varsayılan ada göre A→Z — KARARLAR "Liste sayfalarının ortak dili" başlık satırı, Settings "Jobs: … A→Z", UI-02.)* **Sütun sıralama.** Bugün Job, Department ve Employees'e göre sıralanıyor (URL `sort`, `direction`; testleri `JobsManagement.test.tsx`'te). V1'de sıralama düğmesi yok. KARARLAR'a göre işler ve departmanlar ada göre A→Z; ortak dilde başlıkta ↕ var (UI-02). Kalkıyor mu?
  3. **Grupları katlama.** Bugünkü "Collapse all / Expand all" ve departman gruplarının katlanması V1'de yok. Kalkıyor mu?
  4. **Archived sekmesi.** Bugün "Show archived" arşivlileri etkin satırların arasında, Archived etiketi ve Restore ile gösteriyor. Sekmede şunlar belirsiz:
     - Arşivli işler mi, arşivli departmanlar mı, ikisi mi listelenecek?
     - Restore nerede olacak?
     - Arşivli bir departmanın içindeki arşivli işler nasıl geri gelecek?
  5. **New department'ın yeri ve Departments sekmesinin satır düzeni.** İkisi de V1'de gösterilmedi; görsel karar, Mert'e varyantla gösterilir (ILKELER P04).

## Kendi verdiğim kararlar

- Varyasyonlarda yalnız `--theme-*` token'ları kullanıldı; iş ve departman renkleri veri olarak satır içinde. V2'nin paleti uygulamada zaten var olan sekiz tondan.
- Ortak başlık, sekme, süzgeç satırı ve tablo çerçevesi uygulamanın kendi sınıflarıyla yapıldı (CSS Settings → Documents'tan alındı). Satır, çekmece ve kart stilleri artifact'a özel.
- Silme davranışı bugünkü gibi: Jobs'ta etki paneli kalıyor (KARARLAR Settings). Varyasyonlarda yalnız "Delete job" düğmesinin yeri gösterildi.
- "Tüm sectionı kapsayan çerçeve" sözünü çerçeve yalnız satırları saracak biçimde uyguladım; arama ve sekmeler üstte kaldı. Mert bu hâli "Okay" ile kabul etti.
- Sayı hücresini sürüm 4'teki kalın ve koyu hâlden ortak hücre biçimine çektim. Neden: KARARLAR'da yalnız ilk sütun 600. Mert'in kod incelemesine "Düzelt" cevabıyla.
- Sayfa geçişini ve bekleyen değişiklik satırını sürüm 5'te geri koydum. V1 görüntüsünde unutulmuşlardı; bugünkü davranış, yeni karar değil.

## Yeniden kurmak için

- Kaynaklar git dışında: `C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/ekran-10-jobs/src/`
  - `capture.mjs`: Playwright ile ekranın hâllerini yakalar. Önce `login.mjs state.json` ile seed owner olarak giriş yapılır.
  - `build.mjs`: artifact HTML'ini üretir. Inter dosyası yanında (`inter-latin.woff2`).
  - `compare.mjs`: kopyayı gerçek ekranla piksel piksel karşılaştırır.
  - `shots.mjs`: varyasyon görüntülerini çeker.
  - `variants.mjs` ve `variants.css`: varyasyonlar.
  - `shell.html`: sayfa iskeleti.
  - `tweaks.css` ve `changes.json`: değişiklik listesi.
  - `*.v2.*` dosyaları: sürüm 2'nin varyasyon kaynakları.
  - Denetim (2026-10-07): `node build.mjs <çıktı>` yayınlanan sürüm 6 ile bayt bayt aynı dosyayı üretti.
- Görüntüler `artifacts/ekran-10-jobs/` altında:
  - `real-*.png`: gerçek ekran.
  - `copy-*.png`: kopya.
  - `diff-*.png`: farklar.
  - `variants/v1-page.png` ve `variants/v1-drawer.png`: son hâl (sürüm 5 ve 6 aynı görünüm), 1440.
  - `variants/superseded/`: artık geçerli olmayan B ve eski C görüntüleri; uygulamada kullanılmaz.
- Yayın: aynı artifact'a `url` ile yapılır, önce `action: "read"`.
