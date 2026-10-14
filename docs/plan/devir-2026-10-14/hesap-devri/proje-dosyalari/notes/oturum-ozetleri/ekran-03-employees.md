# EKRAN-03 Employees: oturum özeti

**Özet**
- Mert 2026-10-07'de telefon listesi için "1 · Kişi başına kart"ı seçti ve "Employees List Lab" sayfasının yayınlanıp uygulanmasını istedi. Sayfa yayınlandı; kart (EKRAN.md #37) hâlâ kodda yok.
- Aynı oturum BL-503'ü (ABD form kuralı) main'e çıkardı, sonra BL-969'u yaptı (kuralı veritabanına taşımak). Mert'in `/code-review max` turunda 15 bulgu çıktı, 14'ü dalda düzeltildi. BL-969 `backup/task/bl-969`@`d3e8e6ad`'de bekliyor; main'de de canlıda da yok.
- En değerli bekleyen iş: bulgulardan ikisi BL-503'ten kalma ve main'de (dolayısıyla Vercel'de) hâlâ var:
  - yabancı numara yanlış bir ABD numarası olarak kaydediliyor;
  - yapıştırılan "+1 (415) 555-0100" kesiliyor.
  Düzeltmeleri yalnız BL-969 dalında.
- Liste ortak dili, sayfalama ve yeşil "Add employee" (#32, #33) `task/ekran-03-c1a`@`8cc2fbec`'te hazır. Ama main'e girmedi, çünkü Requests C3'ü bekliyor.
- 59 kabul maddesinin yaklaşık 45'i açık.

## Okunan oturumlar
- **`session_01UpnsKLZEzAeyLe8V92ho9y` ve `session_01HdWsdhmGfJMwCgN7eWhWoa` (istenen, köprü oturumlar):** 2026-10-08 10:23Z'den 22:30Z'ye kadar. İçlerinde yalnız BL-969'un CI beklemeleri, koordinatör mesajları ve devir notu var. Okundu; Mert mesajı yok.
- **`session_0131p6uFVEXbL3idPZAX1qFs` (aynı başlıklı eski oturum, 2026-10-07 ~08:01Z → 2026-10-08 05:48Z):**
  - 2026-10-07 13:35Z'den sona kadar okundu.
  - **08:01–13:35Z arası okunmadı.** Bu bölüm yoğun araç çıktısı (~60 sayfa).
  - O bölümdeki Mert istekleri iki kaynaktan alındı: oturumun kendi sıkıştırma özeti (2026-10-08 00:38Z, "All user messages" listesi) ve main'deki `EKRAN.md` satır 10. Tam sözleri ve saatleri doğrulanmadı.
- **Repo (main `d68aa958`):**
  - devir notu `docs/plan/devir-2026-10-08/EKRAN-03.md`
  - `docs/plan/ekranlar/03-employees/EKRAN.md`
  - BACKLOG
  - BL-969 dalları, `task/ekran-03-c1a`, `task/var-ekran-12`
  - `backup/tasarim-kaynaklari`, yedek dal listesi

## Mert'in istekleri (sırayla, saatler UTC, olay saati)

| # | Zaman | Mert'in sözü | Ne yapıldı | Durum |
|---|---|---|---|---|
| 0 | Tarihi yok; `EKRAN.md` satır 10'da kayıtlı. Büyük olasılıkla 2026-10-06'daki varyant sayfasından (dal `task/var-ekran-12`@`d7c4130b`). | Seçim: masaüstünde yeşil "Add employee" arama satırının sonunda ("6 · C"); owner'ın Location hücresinde "Kadikoy +1" | "Add employee" için #32 hazırlandı. "Kadikoy +1" için #35 hazırlandı. | #32 yalnız dalda: `task/ekran-03-c1a`@`8cc2fbec`. #35 yalnız kayıtta (⏳), kod yok |
| 1 | 2026-10-07, 13:35Z'den önce (saat doğrulanmadı) | Özetten: "publish `Employees List Lab.html` as artifact and implement" | Sayfa yayınlandı: U4QsNASs9qycRg1UUMNApA. "Implement" kısmı yapılmadı; #37 c1a'dan sonraya kondu. | Yalnız Artifact'ta |
| 2 | Aynı | Özetten: telefon listesinde "1 · Kişi başına kart" seçildi | `EKRAN.md` #37'de yazılı: "Telefonda her kişi bir kart: ad, altında 'Kadikoy +1 · Cook', sağda durum çipi … Mert 2026-10-07: varyant 1". Durumu ⏳. | Yalnız kayıtta (EKRAN.md) ve Artifact'ta; kod yok |
| 3 | 2026-10-07 17:51:33 | "/code-review max" (BL-969 dalı) | 23:36:06'da 15 bulgu sunuldu. Başlıcaları tablonun altında. | Kayıtta (rapor) |
| 4 | 23:35:27 | "Bulguları buradan benimle paylaş" | Paylaşıldı. | — |
| 5 | 23:51:19 | "Butun hepsine Başla.   Madde 1 uygularken gereken önlemleri al ve dikkatli davran" | 14 bulgu düzeltildi. "Sütun silinince eski sekmeler kırılıyor" bulgusu (raporda 6. sırada) yalnız sıralamayla azaltıldı. Migration 2'ye koordinatörün şart koştuğu eşitlik kontrolü eklendi. nf-guvenlik ONAY'ları: @`df3a3001`, @`67c65734`, @`fa0e44d5`. Son yeşil dal CI'ı run 37732987504, eski taban üzerinde. | **Yalnız dalda:** `backup/task/bl-969`@`d3e8e6ad` (main'de olmayan 20 commit). Canlıda yok. |

**3. satırdaki 15 bulgunun başlıcaları:**
- 🔴 1: Migration, ACIL-40001'in düzeltmesini canlıda geri alıyordu.
- 🟠 2: Aynı acil telefonu yeniden yazmak "değişti" sayılıyor.
- 🟠 3: "+44 20 7946 0958" "(442) 079-4609" olarak kaydediliyor.
- 🟠 4: Yapıştırılan "+1 (415) 555-0100" kesiliyor.
- 🟠 5: Ayrık Ş, ğ, İ harf kuralını aşıyor.
- 6–12: canlıya geçiş riskleri (sütun silme, "dur" kontrolü, ölçüm sorgusu, yedek eksikleri).
- 13–15: kalite bulguları.
- Oturumun notu: "Dördü BL-503'ten kalma, yani main'de şu an da var."

## Repo doğrulaması (main `d68aa958`)
- **Main'de olanlar:**
  - BL-503: `9e7abc62`, görev dosyası `b57fb4bc`.
  - EKRAN-03 "şimdi" maddeleri. Tam: #1, #7, #8, #16, #23, #41, #48. Kısmen: #21, #25, #26, #46, #47, #49, #50. Son commit'ler `bdf54974`, `263e093c`.
  - EMP-LIMIT (#34).
  - `EKRAN.md`'de 16 ✅ ve 52 ⏳ işareti var.
- **BL-969 dalları:**
  - En günceli `backup/task/bl-969`@`d3e8e6ad` (20 commit önde).
  - `task/bl-969`@`a24dc48f`, `task/bl-969-2`@`6697bc01` ve `task/bl-969-3`@`10eb8d44` bayat kopyalar.
  - `task/bl-969-4` hiç gönderilmedi.
  - BACKLOG satır 2158'de BL-969 açık.
- **`task/ekran-03-c1a`@`8cc2fbec`:** main'de olmayan 8 commit; 2'si Employees C1a, 6'sı Requests C3. Devir notu "uzakta yok" diyordu; şimdi origin'de var.
- **`task/var-ekran-12`@`d7c4130b`:** 2026-10-06 varyant laboratuvarı ("Employees add button, phone list and owner location variants"). Yanında `backup/uncommitted/task/var-ekran-12`@`8534f451` var.
- **Kayıp riski:** BL-969'un üretme ve rebase betikleri git'te yok (`r2_migration.py`, `r2_trials*.py`, `bl969_pgtap_run.py`, `rebase_driver.py`, `fp.mjs`, `matrix_sha.mts`). Yalnız Mert'in PC'sinde, geçici klasörde duruyorlar. Ölçüm sorgusu dalın görev dosyasında var (`docs/plan/tasks/BL-969.md`, "Ek").

## Linkler ve Mert'in seçimleri
- **Employees List Lab (Hesap 1):** https://claude.ai/artifact/U4QsNASs9qycRg1UUMNApA.
  - **Mert'in seçimi:** varyant 1, kişi başına kart.
  - Kaynak: `C:\Users\TheWe\Documents\Codex\newfork-pages\employees-list-lab.html`.
  - Yedek: `backup/tasarim-kaynaklari` → `kaynak/newfork-pages/employees-list-lab.html`.
- **Kanıt görüntüleri:** `artifacts\BL-503\` ve `artifacts\EKRAN-03\simdi-1\`, `simdi-2\`. Yedekleri `kaynak/newfork-clean-artifacts/EKRAN-03/` altında.

## Açık sorular
1. **Mert'e, şartlı (DURUM B18):** BL-969'un canlı ölçümünde `account number cleared` 0'dan büyük çıkarsa canlıda gerçek veri silinir. Bu durumda Mert'in "evet"i gerekir.
2. **Koordinatöre (cevapsız):**
   - Main kırmızıyken BL-969'un dal CI'ı gönderilsin mi?
   - Bekleyişte hangi iş yapılsın: A4 liste okuması mı, A1 Terminate + Restore mu?
3. **Önerim, koordinatör karar versin:** BL-503'ten kalan iki telefon hatası (yabancı numara, yapıştırma) BL-969'u beklemeden ayrı küçük bir işle main'e alınsın mı? Bugün kullanıcıyı etkiliyorlar.

## Neden main'e ve canlıya çıkmadı
- **BL-969:**
  - R3 bir iş: veri düzeltiyor, 24 CHECK kısıtı ekliyor, eski `user_profiles.phone` sütununu siliyor.
  - Dal CI'ı yeni taban üzerinde yeşile getirilmedi. Main CI kırmızı (BL-990).
  - Canlı adımlar koordinatörün "gönder"ini, şart doğarsa Mert'in "evet"ini ister.
  - Force push yasak olduğu için her rebase yeni bir dal adıyla gönderilmeli (-2, -3, -4). -4 hiç gönderilmedi.
- **#37 telefon kartı:** c1a'ya bağlı, c1a da Requests C3'e. Requests C3 main'e girmedi.
