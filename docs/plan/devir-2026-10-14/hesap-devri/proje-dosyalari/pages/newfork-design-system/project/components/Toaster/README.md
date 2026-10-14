# Toaster

Ekranın alt ortasında beliren kısa bildirim: başarı, hata, uyarı ve bilgi için birer tür.

- Kaynak: `packages/ui/src/components/Toaster.tsx`, sonner 1.7.4 üzerine kurulu. Uygulamada bir kez yerleştirilir; bildirimi `toast.success(...)` gibi çağrılar gösterir.
- Kullanan verir: başlık (tek kısa cümle) ve istenirse tek satır açıklama.
- Davranış: alt orta, 28px boşluk, 6 saniye görünür, aynı anda en çok 3 bildirim, kapatma düğmesi her zaman var.
- Görünüm: beyaz kart, 8px köşe, iki katlı yumuşak gölge; tür rengi kenar ve zemine, 30px yuvarlak işarete gider. İşaretler yazı karakteri: ✓ ✕ ! i.
- Başlık `toast-title` (14px, 760), açıklama `toast-description` (13px).
- Bilgi mavisi (`#1f6ed4`) için henüz token yok; başarı ve hata yeşili/kırmızısı da toast'a özel sabit değerler.
- Yapma: kalıcı bir hatayı toast'la bildirme, ekranda kalan bir uyarı kullan. Toast'a buton koyacaksan tek bir geri al eylemi koy.
