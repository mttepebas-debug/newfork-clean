# AVAIL-002-B — soru 1: Warn kutusunu yazma yollarına kim bağlar?

**Bugün ne oluyor:** Schedule → bir hücreye vardiya yaz (Shift editörü), ya da kartı sürükle / yapıştır. KadıköyGarson1 Salı 18:00 sonrasını "unavailable" işaretlemiş; KadıköyMüdür1 Salı 19:00 vardiyasını ona yazınca **kutu açılmıyor** — editör müsaitlik gerekçesini bilerek eliyor (`ShiftQuickEditor.tsx:406-409` "it never asks", sürükle-bırakta `useScheduleDropReview.ts:116`). A'dan sonra sunucu değerlendirmesinde müsaitlik ve not `operation`'a hiç girmiyor (her zaman `allowed`), yani kutuyu açacak sinyal yalnız `reasons` içindeki `availability` / `note` gerekçeleri.

**B'de hazır olan (bu soru cevabından bağımsız, yapıyorum):** `schedule-conflicts.ts` müsaitliği (`availability`, warn) ve notu (`note`, warn, notun sözleri) ayrı gerekçe olarak üretir; sunucu değerlendirmesinden aynı iki gerekçeyi `operation`'a bakmadan çıkaran yardımcı; not kartı verisi (notun saati + sözleri, yalnız notu okuyabilene).

**Seçenekler:**
- **(a) (Önerilen)** B yalnız veri + yardımcıları verir; C1 (`nf-arayuz`) kutuyu bütün yazma yollarına bağlar (editör, sürükle-bırak, yapıştırma, kopyalama, şablon — D9) ve kutunun iki satırlı görünümünü yapar. Sonuç: A+B main'e girdiğinde ekran bugünkü gibi davranır (kutu açılmaz, hiçbir yazma reddedilmez); C1 ile kutu açılır. `ShiftQuickEditor` ve `useScheduleDropReview` tek rolde, bir kez değişir.
  Dayanak: koordinatörün görev mesajı ("Warn kutusunun her yazmada açılması için gereken veri (`schedule-conflicts.ts`) B'dedir; kutunun görünümü C1'de") + görev dosyası Touches (`ShiftQuickEditor` C1'de) + CLAUDE.md §4 (aynı dosyada iki rol sırayla).
- (b) B kutuyu bugünkü görünümüyle bütün yazma yollarına bağlar (kutu A+B ile açılmaya başlar, tek satırda "unavailable" ve not metni); C1 yalnız görünümü değiştirir. Sonuç: davranış bir dilim önce gelir; `ShiftQuickEditor` / `useScheduleDropReview` iki rolde sırayla değişir, ~1 puan B'ye kayar.
- Kaçış: Claude karar versin / Önce sohbette konuşalım.

Cevap gelene kadar (a)'ya göre ilerliyorum; (b) gelirse bağlama ayrı commit olur.
