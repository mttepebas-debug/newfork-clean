# ConfirmButton

Yıkıcı eylem için iki tıklı buton: ilk tık kurar, etiket "Confirm <fiil>" olur, ikinci tık eylemi yapar.

- Kaynak: `packages/ui/src/components/ConfirmButton.tsx` (`useConfirmClick` kancası da orada).
- Kullanan verir: `children` (boştaki etiket: "Delete shift"), `confirmLabel` (kurulu etiket: "Confirm delete"), `onConfirm`, `className` (`danger-button` ya da `danger-text-button`). Yalnız ikonlu butonda `confirmName` kurulu hâlin erişilebilir adıdır.
- Kurulu hâl 3,2 saniye sonra, odak kaybında ya da Escape'te kendiliğinden düşer. Çift tık tek hareket sayılır, onay değildir; basılı tutulan Enter kurup onaylamaz.
- Kurulu hâlde buton `is-armed` sınıfı ve `data-confirming="true"` alır; durum ekran okuyucuya ayrıca duyurulur.
- Tarayıcı onay penceresi yerine bunu kullan. Geri dönüşü olsa bile kaydı alıcılardan kaldıran eylem (Archive gibi) yine kırmızı ve iki tıklıdır.
- Uzun bir açıklama gerekiyorsa (ne silinecek, kime görünür) uygulamanın onay penceresini aç; iki tık yalnız "emin misin?" kadar bir soruda yeter.
