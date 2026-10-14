# EKRAN-08 Important Dates: çekmece, oturum özeti

**Özet**
- Mert 2026-10-07 08:51–09:23Z arasında çekmece için A'yı (Stacked) seçti, 8 değişiklik istedi ve lokasyon seçimi için L1'i onayladı. Hepsi KARARLAR satır 525'te ve tasarım sayfasında yazılı; kodda hiçbiri yok. Main'deki çekmecede düğme hâlâ "Save date", lokasyon seçimi hâlâ açılır "Select locations" listesi.
- Uygulamadan önce veri modeli değişmeli: her lokasyon kendi durumunu alacak (Open / Short hours / Closed, tablo `important_date_locations`). Bu iş hiç açılmadı.
- Aynı oturumun acil işi canlıda ve main'de: ACIL-40001. Kapalı gün kaydı API'yi kilitliyordu (BL-958); düzeltme Mert'in "Evet, uygula"sıyla çıktı. BL-959 (kapalı günlü hafta Schedule'da 500) da main'de düzeldi. BL-882 hâlâ açık: yayınlanmış vardiyası olan güne "Closed day" kaydedilemiyor.
- Ek bulgu, okuma listemin dışında: çekmecenin "History" sekmesi 2026-10-03'te `task/fb-6.7-ui` dalında yapılmış ama main'e hiç girmemiş. Şimdi yalnız `backup/uncommitted/task/fb-6.7-ui`'da duruyor.
- İki varsayım Mert'in teyidini bekliyor: kısa saatli günde vardiya varsayılanı ve All day kapalıyken girilen saat. İkisi `SORULAR.md`'de yok.

## Okunan oturumlar
- **`session_01NC1Dn9WdiCkV7sxLigU9X5` ve `session_011gN92NNUWsUe1G4AvPvCmS` (istenen oturumlar):** yalnız 2026-10-08 22:26–22:29Z arası var, devir notunun yazılması. Okundu; Mert mesajı yok.
- **`session_01DLfse5QwMi4SbQx6nBnSGq` (aynı başlıklı eski oturum):** 2026-10-07 ~08:18Z'den 2026-10-08 ~00:05Z'ye kadar. Akşam ACIL-40001 için de kullanıldı. 22 sayfanın hepsi baştan sona okundu.
- **Repo (main `d68aa958`):**
  - devir notu `docs/plan/devir-2026-10-08/EKRAN-08-CEKMECE.md`
  - `docs/plan/ekranlar/08-important-dates/CEKMECE-INCELEME.md`
  - KARARLAR, BACKLOG
  - `backup/tasarim-kaynaklari`, `backup/uncommitted/task/fb-6.7-ui`
  - uzaktaki bütün dallar ("Short hours" / "Not included" geçen kod arandı, hiçbir dalda yok)

## Mert'in istekleri (sırayla, saatler UTC, olay saati)

> KARARLAR'daki saatler (~09:45Z, ~09:55Z) koordinatörün saatidir. Olay saatinden ~30–45 dk ileri. Aşağıda olay saatleri var.

| # | Zaman | Mert'in sözü | Ne yapıldı | Durum |
|---|---|---|---|---|
| 1 | 2026-10-07 08:18:46 (koordinatörün görev mesajında aktarıldı) | "http://localhost:5555/app/important-dates drawerini incelemesini söyle. kodu da test etsin açık kapalı gün yarım açık gün shift opena düşmesi kapalı güne shift yazma manager admin employee owner görünümü, drawerin ui ux'i. artifact oluştursun 5 tane design seçeyim arasından" | Yapılanlar: D1–D10 davranış testi, U1–U10 arayüz tablosu, dört rolün görünümü. Rapor main'de: `CEKMECE-INCELEME.md` (`ded636f3`). Bulgular backlog'da: BL-882, BL-958…963 (focus trap, görünmeyen odak, kontrast ve ham hex, hizalama). "Yarım açık gün" diye bir seçenek bugün yok, çünkü kayıt başına tek tür var. Owner satırı kilitli görünüyor (BL-676). 08:35:47'de Artifact v1 yayınlandı (5 tasarım). | Rapor ve bulgular kayıtta; tasarım Artifact'ta |
| 2 | 08:51:27 | "a stacked" | A iskeleti seçildi. | Artifact + KARARLAR 525 (1); kod yok |
| 3 | 08:51:27 | "starts end in altına time input ekle ve all day checki ekle default all day checked gelsin." | v2'de çizildi. | Artifact + KARARLAR (2); kod yok |
| 4 | 08:51:27 | "D seçeneğinde oldugu gibi location rowları olsun. böylelikle 1 lokasyon açık 1 lokasyon kapalı olabilir. ama lokasyonlar farklı saatlerde açık kapalı olabilir o yüzden location rowa da short hours seçilince time input çıkmalı" | v2'de her lokasyon satırında Open / Short hours / Closed seçimi var; Short seçilince saat kutuları çıkıyor. Veri modeli değişikliği gerekiyor; öneri raporun §5'inde. | Artifact + KARARLAR (3); kod da veri modeli de yok |
| 5 | 08:51:27 | "ayrıyetten location ismine tıklayınca seçimi kapatıyor. aksine seçim yapmalı. All seçiliyken location ismine basılınca sadece o lokasyonu seçip diğerlerini kapatmalı. başka lokasyon daha seçilirse onu da seçime eklemeli. bütün lokasyon isimleri seçilince all un da seçimi aktif olmalı." | v2'de uygulandı. Sonra 10. satırdaki L1 bunun yerine geçti. | Kayıtta "yerine geçti" diye yazılı (KARARLAR (4) → (8)) |
| 6 | 08:51:27 | "Shifts 'i details ile history arasına taşı." | v2'de sekmeler Details · Shifts · History oldu (eski C1-B kararı ters çevrildi). Main'deki çekmecede History sekmesi bile yok. History arayüzü yalnız `backup/uncommitted/task/fb-6.7-ui`'da; API'si (`read_important_date_history_service`) main'de var. | Artifact + KARARLAR (5); kod yok |
| 7 | 08:51:27 | "Shiftler için 3 opsiyon olmalı. Open Shift Remove Keep. closed days için default olarak remove seçili gelmeli. warning de ona göre değişmeli." | v2'de her vardiyada Remove · Open shift · Keep var; kapalı günde varsayılan Remove (eski K13 kararı ters çevrildi). Remove edilen vardiyanın çalışanına gidecek bildirim BILDIRIM işine bırakıldı. | Artifact + KARARLAR (6); kod yok |
| 8 | 08:51:27 | "yeşil butonda sadece Save yazmalı. Değişiklik yokken disabled değişiklik oldugu an SAVE butonu aktif olmalı." | v2'de çizildi. | Artifact + KARARLAR (7). Main'de düğme "Save date" (satır 581). Var olan kayıtta, değişiklik yokken düğme zaten kapalı (`canSave`, satır 197); yeni kayıtta böyle değil. |
| 9 | 08:59:36 | "location chiplerini kaldıralım onun yerine location rowlarından seçim yapalım. böylelikle yer tasarrufu sağlarız ve drawer içerisinde scroll up down yapmak zorunda kalmayız ve barı kaldırırız. location hours başığını locations yap ve burada location seçme ui ux ini iyi düşün ve bana 5 varyasyon sun" | 09:08:38'de v3 yayınlandı: L1–L5. | Artifact |
| 10 | 09:12:29 | "L1 olsun ama note sectionını birazcık büyüt çok boşluk kalmış drawer içinde." | v4 (~09:15) yalnız L1'i gösteriyor. Ayrıntısı tablonun altında. | Artifact + KARARLAR (8), (9); kod yok |
| 11 | 09:23:01 | "L1 ONAY" | Koordinatör KARARLAR 525'e yazdı. | Yalnız kayıtta |
| 12 | 17:44:37 | "/code-review" (oturumun o saatteki işi ACIL-40001 dalı) | 10 bulgu çıktı. Ayrıntısı tablonun altında. | Kayıtta |
| 13 | 17:59:00 | "Olur" (oturumun önerisine: 1. ve 4. bulgu dalda düzeltilsin) | Dalda düzeltildi. | Kodda + main (`5a9b80ff`) |
| 14 | 23:02:23 | "Koordinatore kilitleri sor ve izin iste" | Koordinatörden kilit ve izin istendi. | — |
| 15 | ~23:05Z | "Evet, uygula (Önerilen)" (oturumun canlıya uygulama sorusuna cevap) | 23:38Z'de canlıya uygulandı (migration `20261008001500`), main `5a9b80ff`. BL-958'in büyük kısmı kapandı. Yedek: `artifacts/ACIL-40001/live-backup-20261007T233808Z.sql`. | Kodda + main + canlı |

**v4'te L1 (10. satır):**
- Lokasyon seçimi satır başındaki onay kutusuyla yapılıyor. Başlıkta "All locations" kutusu var; bir kısmı seçiliyse yarım işaret gösteriyor.
- Seçilmeyen satır gri ve "Not included" yazıyor.
- Hiç lokasyon seçili değilse Save kapalı ve "Choose at least one location." yazıyor.
- Note alanı 62 px'ten 200 px'e büyüdü.

**`/code-review` bulguları (12. satır):**
- En önemlisi: migration 24 fonksiyonu sabit bir kopyadan baştan kuruyor, bu yüzden paralel işleri geri alabilir.
- İkinci önemli bulgu: 409 cevabından sonra ekranda ham sunucu cümleleri görünecek, örneğin "stale time off request", "employee revision conflict", "notification policy stale version". Bu bulgu ekran turlarına bırakıldı; backlog'da bunun için ayrı bir madde bulamadım. Belgeler için benzeri BL-828.

## Repo doğrulaması (main `d68aa958`)
- `apps/web/src/settings/ImportantDatesSettingsPage.tsx`:
  - Düğme "Save date" (satır 581).
  - Lokasyon seçimi açılır liste: `<summary aria-label="Select locations">` (satır 389).
  - "All day", "Short hours", "Not included" ve History sekmesi yok.
  - Son değişiklik `4c8c822f` (EKRAN-01 #65).
- `important_date_locations` için migration yok.
- **BL-959 düzeldi:** `a03d7715`, `58aa6b48`. **BL-882 açık:** yalnız belge commit'leri var.
- **FB-6.7 arayüzü (okuma listemin dışında, koordinatör ayrıca baksın):**
  - Dallar: `task/fb-6.7-ui`@`4d9226cc` ve `backup/uncommitted/task/fb-6.7-ui`@`d753cb78`.
  - 16 commit main dışında kaldı (2026-10-03/04). İçerik:
    - çekmecede History sekmesi (`6bd73c05`, `1d1b4325`);
    - kapalı günün denk geldiği yayınlanmış vardiyaların çekmecede listesi (`526e66fd`);
    - "Closed location" kuralının üç derecesi (`20d006e0`);
    - e2e testi `closed-day-reaches-shifts`;
    - duyuru penceresi değişiklikleri.
  - KARARLAR satır 519 bu dala atıf yapıyor.
  - 2026-10-07'deki A kararı bunun bir kısmını değiştirdi: vardiyalar ayrı sekmede, her vardiyada üç seçenek. Kod işi başlarken bu daldan neyin alınacağına bakılmalı.
- **Yedek:** `backup/tasarim-kaynaklari`@`dee23faf`. Dosyalar: `kaynak/newfork-pages/important-date-drawer-designs.html` ve `kaynak/newfork-clean-artifacts/EKRAN-08-CEKMECE/important-date-drawer.html`.

## Linkler ve Mert'in seçimleri
- **Tasarım sayfası (Hesap 1):** https://claude.ai/artifact/Pt7K2NVLwFx6TPS9ZuXNKX
  - Sürümler: v1 5 tasarım; v2 düzeltilmiş A; v3 L1–L5; v4 yalnız L1 ve büyük Note.
  - **Mert'in seçimi:** A, değişiklikleriyle, artı L1.
- **Telefon:** 390 genişlikte, 3 lokasyonlu owner görünümü hâlâ kayıyor (yalnız L5 sığıyordu). Mert "kaydırma olmasın" demişti; masaüstünde sağlandı, telefonda sağlanmadı.

## Mert'e açık sorular
1. **Kısa saatli günde vardiya varsayılanı** (DURUM B12).
   - Oturumun varsayımı: saatin tamamen dışında kalan vardiya Remove gelir, saate kısmen taşan Keep gelir.
   - Örnek: Kadıköy 24 Aralık'ta 15:00'te kapanıyor. Ali'nin 16–23 vardiyası Remove gelir, Emre'nin 12–18 vardiyası Keep gelir.
   - Seçenekler: varsayımı onayla / kısmen taşan da Remove / ikisi de Keep.
2. **All day kapalıyken girilen saat** (DURUM B13).
   - Varsayım: tarihin kendi saat aralığı yalnız bilgidir, vardiyaya dokunmaz.
   - Seçenekler: onayla / saat aralığı vardiyayı da etkilesin.
3. **Telefonda kayma:** L1 390 genişlikte 3 lokasyonla kayıyor. Kabul mü, yoksa telefon için ayrı düzen mi? Bu oturumda sorulmadı.
4. **Remove bildirimi:** Remove yayınlanmış, atanmış vardiyayı kaldırır; çalışana haber gitmeli (P07). Bu olay BILDIRIM envanterine girecek.

## Neden main'e ve canlıya çıkmadı
- Uygulama işi (Ekran 8 turu) hiç açılmadı. Önce veri modeli değişmeli; bu R3 bir iş: lokasyon başına durum ve saat.
- BL-959 bu işin önündeydi, artık düzeldi.
- İki varsayım Mert'in teyidini bekliyor. Remove'un bildirimi BILDIRIM işine bağlı.
- Canlıdaki ACIL-40001 migration'ı fonksiyonları yerinde değiştiriyor. Bu 24 fonksiyondan birini yeniden tanımlayan her dal, migration'ını `20261008001500`'den sonraya adlandırmalı (KK-220). Yoksa 40001 hatası canlıya geri döner.
