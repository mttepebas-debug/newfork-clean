# Tanıtım sitesi (landing) yedeği

Mert'in isteği (2026-10-10): tanıtım sitesinin dört sürümü GitHub'da kalıcı yedekte dursun; hiçbiri canlıya ya da main'e alınmayacak. Mert bunları sonra işleyip cilalayacak.

Kaynak: 2026-10-06 akşamı (20:50–22:12 UTC) claude.ai'den açılan dört paralel oturum. Seçim ya da onay kaydı yok. Karar maddesi: BL-034.

## Kod sürümleri (her biri ayrı yedek dalı)

| Sürüm | Yedek dalı | Asıl dal @ commit | Ne var | Bilinen eksik |
|---|---|---|---|---|
| 1 | `backup/tanitim-sitesi/surum1-90slod` | `claude/newfork-clean-landing-90slod` @ `49c074c9` | `apps/web/src/public/LandingPage.tsx`: sade tek sayfa, hareketli giriş, "early access'te ücretsiz" | Örnek veride Türkçe yer ve kişi adları; dal kendi rotasını geri almış (kod duruyor, adrese bağlı değil) |
| 2 | `backup/tanitim-sitesi/surum2-czjfh7` | `claude/newfork-clean-landing-czjfh7` @ `97346099` | `apps/web/src/landing/`: uzun tek sayfa, çerez sayfası, iletişim formu, "$39 / lokasyon" | Fiyat uydurma; yanlışlıkla eklenmiş bir Windows yolu dosyası |
| 3 | `backup/tanitim-sitesi/surum3-vkaq02` | `claude/newfork-clean-landing-vkaq02` @ `1bd04e7d` | `apps/web/src/marketing/`: en tam sürüm; özellik kutuları, telefon gösterisi, "$32 / $64, 14 gün deneme", SEO dosyaları | Fiyat uydurma; müşteri yorumu, şirket adı, telefon, satış e-postası `[KÖŞELİ]` yer tutucu |
| 4 | `backup/tanitim-sitesi/surum4-dp9w5k` | `claude/newfork-marketing-site-dp9w5k` @ `0ce52baf` | `apps/marketing/`: ayrı paket, çok sayfalı ve önceden derlenen site iskeleti, ürün ekranı çizimleri | Yarım: sayfalar boş, ana sayfa yalnız bileşen galerisi |
| Film | `backup/tanitim-sitesi/hareketli-film` | `claude/motion-graphics-hero-6p186u` @ `209086dd` | `marketing/motion-hero/`: 15 saniyelik hareketli tanıtım | — |

Kod dalları eski bir main'den çıkmıştır; kullanılacağı zaman güncel main'e elle taşınması gerekir.

## Bu daldaki dosyalar
- `sayfalar/`: yayınlanmış tek dosyalık sayfalar (`newfork-landing-a.html`, `-b.html`, `-preview.html`), hareketli film sayfası (`newfork-motion-hero/`) ve Design tuvalindeki "/ — karşılama" çiziminin kopyası (`tuval-karsilama-Landing.dc.html`).
- `goruntuler/`: 2026-10-10'da sürümler çalıştırılarak alınan görüntüler. `masa` = masaüstü 1440 ilk ekran, `tel` = telefon 390, `tam` = sayfanın tamamı.
