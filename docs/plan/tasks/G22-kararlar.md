# G22 — İpucu ve not köşesi: işçi oturumunun kararları

Kullanıcı yokken verilen kararlar (koordinatör talimatı, 2026-09-29). Dal
`task/g22-tooltip-note-corner` (`task/g2-quick-editor`'ın devamı).

1. **Ortak kanca `apps/web/src/shell/useHoverBubble.ts` (BL-297).** Açma/kapama
   zamanlayıcıları ve 150 ms kapanma gecikmesi tek yerde; Tooltip ve vardiya
   kartının not köşesi onu kullanıyor. Kanca yalnız zamanlamayı taşıyor: Escape,
   kaydırma ve basma dinleyicileri iki bileşende ayrı kaldı, çünkü davranışları
   bilerek farklı (not köşesi Escape'i Schedule'dan önce yakalıyor, Tooltip
   yakalamıyor). 250 ms açılma gecikmesi yalnız not köşesinde; ızgarayı geçen
   farenin notları yakıp söndürmemesi için. Test: iki dosyada kendi
   `setTimeout`'u ya da `CLOSE_DELAY_MS`'i olursa `ShiftNoteCorner.test.ts`
   kırmızı olur. Geri alma: `a1cb41c3`'ü geri almak.
2. **Takılı kalan basılı durum (BL-207).** Bayrak şu anlarda sıfırlanıyor:
   fareyle basılıp dışarı sürüklenince (`pointerleave`, yalnız `mouse`), basma
   iptal olunca (`pointercancel`, dokunmatikte kaydırmaya dönen basış), odak
   çıkınca ve tıklamada. Dokunmatik `pointerleave` bilerek sayılmıyor: tarayıcı
   parmak kalkınca `pointerleave`'i odak ve tıklamadan önce gönderiyor (Chrome'da
   ölçüldü). Sayılsaydı dokunuş ipucunu açıp hemen kapatırdı; bunu bir test
   kilitliyor. `setPointerCapture` seçilmedi: yakalanan basış dışarıda
   bırakılınca da tıklama sayılır, bugünkü davranış değişirdi.
3. **Tooltip'i kullanan tek yer `ShiftCard.tsx` (hayalet kartın lokasyon iğnesi);**
   davranışı önce/sonra aynı ölçüldü. Settings → Shift types'taki
   `shift-default-info-popover` bu bileşeni kullanmıyor; kendi ipucu, zamanlayıcısı
   yok, dokunulmadı.
