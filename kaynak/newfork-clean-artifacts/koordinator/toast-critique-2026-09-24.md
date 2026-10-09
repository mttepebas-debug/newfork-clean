# Toast tasarım eleştirisi (oturum "Toast ve loading animasyonları geliştirme", local_4a464791)
Ölçüm: /dev/feedback vitrini, main 2d8ba8a, 2026-09-24; 1440 ve 375 genişlik. FEEDBACK-001 Aşama 2 (BL-117) girdisi; task dosyasına İŞLENMEDİ (koordinatör kontrolü 2026-09-28).

Kritik
- Hata gömülüyor: en yeni toast önde; hata başarı mesajının arkasında kalıyor; en fazla 3 görünür, en eskisi kayboluyor. Öneri: hata kapatılana kadar kalsın ve önde dursun.
- Toast vardiya penceresinin "Cancel"/"Add shift" düğmelerini örtüyor (telefonda tamamen). Öneri: konum varyantları (Aşama 3).
Orta
- Hata 14 sn'de kendiliğinden kapanıyor → süresiz + kapat/Retry.
- Undo/Retry aksiyonu hiç yok (toast.action kullanılmıyor).
- Tek olay iki toast: "Preset shift is unavailable" + "Preset shift context" → birleştir.
- Metin: ham "Failed to fetch"; bildirim hatası taşıyan "Schedule published" yeşil → ortak hata metni, kısmi başarı uyarı tonunda.
Tutarlılık
- Renkler ham hex (styles.css:6093-6145) → --theme-success/danger/warning(-soft).
- Bilgi tonu mavi #1f6ed4, uygulamada başka mavi yok → nötr ya da vurgu yeşili.
- İkonlar yazı karakteri (✓ ✕ ! i) → lucide CheckCircle2/XCircle/AlertTriangle/Info.
- Başlık ağırlığı 760 → 600 ya da 700.
- Toast yalnız Schedule'da; hangi mesajın toast olacağı BL-117'de.
Erişilebilirlik (ölçülen)
- Yazı kontrastı geçiyor (başlık 13.4–14.0:1, açıklama 5.6–5.9:1).
- Uyarı ikonu kalıyor: sarı dairede beyaz "!" 2.60:1, daire/zemin 2.46:1 (<3:1).
- Kenarlık 1.34–1.55:1 (zayıf). Hatalar da "polite"; toast'larda role yok → hata assertive olsun.
- Kapatma düğmesi 20×20 (en az 24×24, mobilde 44×44).
- Bölge adı "Notifications alt+T" ham okunuyor.
İyi: başlık/açıklama ayrımı, dedupe çalışıyor, hover'da yığın açılıp süre duruyor, tona göre süre.
Öncelik: 1) hatalar kaybolmasın/gömülmesin (assertive), 2) toast iş alanını örtmesin, 3) uyarı sarısı + token'lar.
