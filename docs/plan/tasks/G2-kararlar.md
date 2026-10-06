# G2 — Schedule hızlı düzenleyici: işçi oturumunun görsel kararları

Kullanıcı yokken verilen kararlar (koordinatör talimatı, 2026-09-29). Her kararın
dayanağı ve geri alma yolu yazılı. Dal `task/g2-quick-editor`.

1. **Tek odak halkası: 2px düz `--theme-focus`, 2px dışarıda.** Düzenleyicinin
   bütün denetimleri (Start/End, Job/Labels/Employee açılır düğmesi, vardiya tipi,
   mola, Count −/+ ve kutusu, "Show times on badge", Note, Delete/Cancel/kaydet) ve
   Save draft penceresinin alanı. Dayanak: uygulamanın genel kuralı
   (`styles.css` `button:focus-visible`), sessiz pencereler (Publish, Templates) ve
   alt çubuklar (KARARLAR UI-14) aynı halkayı kullanıyor; BL-293 önerisi de buydu.
   Hover görünümü kaldı; odak, üstüne halkayı ekliyor. Açılır listedeki seçenekte
   halka içeride (-2px), yoksa liste kenarı kırpıyor.
   Geri alma: `3367b0ed` commit'ini geri almak.
2. **Ortak eylem çubuğu kuralı düzeltildi, yalnız düzenleyicininki değil.**
   `.schedule-dialog-actions button:focus-visible` içindeki `outline: none` silindi;
   bu kuralı Schedule'daki eski stil pencereler de kullanıyor (Save draft, Export,
   AutoFill incelemesi, düzenleme süresi doldu penceresi). Onlarda da düğmeye
   klavyeyle gelince halka görünüyor; başka görünüm değişmedi. Dayanak: aynı WCAG
   2.4.7 hatası, kök neden tek kural. Geri alma: o bloğa `outline: none;` eklemek.
3. **Alan kenarı `--theme-muted` (KARARLAR UI-09)**: Start/End, Count, Note, Save
   draft alanı, açılır düğmeler, mola ve Count −/+ düğmeleri. Hover'daki ham hex
   kenar (`#9eb2a9`, `#aab8b1`) kaldırıldı; hover yalnız zemin tonunu değiştiriyor
   (`--theme-surface-soft` / `--theme-surface-muted`). Eylem düğmelerinin (Cancel,
   Delete) kenarı bu işte değişmedi: stil birliği BL-318'in işi.
4. **Telefonda (≤520px) alanlar 16px**: Note'a ek olarak Start/End (saat
   rakamları da), Count ve Save draft alanı. Dayanak: BL-294; iOS 16px altında
   sayfayı büyütüyor. Eşik mevcut sayfa içi eşik (520), kabuk eşiği değil (UI-14).
5. **Note kendiliğinden büyüyor** (`field-sizing: content`, 52–160px arası).
   Desteklemeyen tarayıcıda bugünkü gibi 2 satır ve elle büyütme kalır.
6. **Not sınırı UTF-16 biriminde kaldı** (ortak şema `max(500)` böyle sayıyor);
   yalnız sınırda yarım kalan emoji atılıyor (BL-291). Sayaç değişmedi.
