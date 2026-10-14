# Telefonda klavye açılınca uygulama ne yapmalı (araştırma, 14 Ekim 2026)

Soru (Mert, 04:23Z): telefonda bir yazı kutusuna basınca klavye açılır. Uygulama buna nasıl tepki vermeli; en çok kabul gören yöntemler neler?

## Kısa cevap
Bugün üç tarayıcı da (iPhone Safari, Android Chrome, Android Firefox) aynı şeyi yapıyor: klavye sayfanın **üstüne biniyor**, sayfa küçülmüyor. Bu yüzden alta sabitlenmiş her şey (alt menü, Save düğmesi, alttan açılan pencerenin altı) klavyenin arkasında kalıyor. Kabul gören çözüm, klavyenin yüksekliğini tarayıcıdan okuyup o parçaları klavyenin üstüne taşımak.

## Kabul gören 7 kural
1. **Klavye yüksekliğini oku, alttaki parçaları yukarı al.** Bütün tarayıcılarda çalışan yol `visualViewport` (görünen alan) ölçüsü. Uygulama tek bir yerde klavye yüksekliğini hesaplar; Save düğmesi ve pencere altları o kadar yukarı çıkar.
2. **Klavye açıkken alt menüyü gizle.** Yer kaplar, Safari'de ekranın ortasında asılı kalabilir. Native uygulamaların çoğu böyle yapar (yazılı bir Apple/Google kuralı değil, yaygın uygulama).
3. **Arama kutulu alttan pencere tam boy olur.** "Add Staff" gibi: arama kutusuna basınca pencere ekranın görünen kısmını doldurur; başlık ve arama üstte sabit kalır, yalnız liste kayar. Apple'ın mesaj yazma pencereleri ve Google'ın arama ekranı da tam boy.
4. **Formda aşağıdaki kutu görünür kalsın.** Klavye açılınca odaktaki kutu klavyenin üstüne kaydırılır.
5. **Yazı kutuları en az 16 piksel.** iPhone, 16'dan küçük yazılı kutuya basınca ekranı yakınlaştırır. Çözüm kutuyu 16 yapmak; yakınlaştırmayı kapatmak değil (erişilebilirlik kuralını bozar).
6. **Doğru klavye.** Telefon numarasında rakam klavyesi, e-postada @'lı klavye, aramada "Search" tuşu; Enter'ın üstünde ne yapacağı yazar (Done, Next, Search). Son kutuda Enter klavyeyi kapatır.
7. **Gerçek telefonda dene.** iPhone Safari, ana ekrana eklenmiş uygulama ve Android Chrome. iOS 26'da bilinen bir hata var: klavye kapanınca alttaki ve üstteki sabit parçalar yerinden kayabiliyor (Apple'ın düzelttiği doğrulanamadı).

## Ek, yalnız Android'de çalışanlar
- Sayfa başındaki bir ayar (`interactive-widget=resizes-content`) Android'de sayfayı klavyeye göre gerçekten küçültür; iPhone bu ayarı tanımaz, zararı da yok.
- Chrome'un "VirtualKeyboard" özelliği klavye yüksekliğini doğrudan verir; Safari ve Firefox'ta yok.

## Bizim uygulamada bugün (main, kontrol ettim)
- Sayfa başı ayarı yalnız `width=device-width, initial-scale=1.0`; Android ayarı yok.
- Kodda klavye yüksekliğini okuyan hiçbir şey yok (`visualViewport` geçmiyor).
- Ekran boyu birkaç yerde eski birimle (`100vh`) yazılmış; telefonda tarayıcı çubuklarıyla birlikte taşabilir.
- Yazı kutuları sayfa yazısının boyunu alıyor; sayfa yazısı 16'dan küçükse iPhone'da kutuya basınca ekran yakınlaşıyor olmalı (tahmin, telefonda doğrulanmadı).

## Önerim
Lineup telefon işinin içinde, klavye için tek bir ortak parça: klavye yüksekliğini okur, alt menüyü gizler, alttaki düğmeleri ve pencereleri yukarı alır. Add Staff penceresi aramaya basınca tam boy olur. Yazı kutuları telefonda 16 piksel.
- Hazır kütüphane (ör. Vaul) bu işi yapar ama **yeni bağımlılık** demek; senin onayın gerekir. Önerim kendi küçük parçamız: tek dosya, kütüphaneye gerek yok.
- Yazı kutularını 16 piksele çıkarmak bütün telefon ekranlarını etkiler (görünüm kuralı); önce KARARLAR'a yazılır, sonra sana sorulur.

## Kaynaklar
- Chrome, klavye davranışı değişikliği: https://developer.chrome.com/blog/viewport-resize-behavior
- MDN, viewport ayarı ve `interactive-widget`: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport
- caniuse, `interactive-widget` desteği: https://caniuse.com/mdn-html_elements_meta_name_viewport_interactive-widget
- WebKit hata kaydı 259770 (Safari desteği yok): https://bugs.webkit.org/show_bug.cgi?id=259770
- MDN, Visual Viewport API: https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API
- web.dev, ekran birimleri (dvh klavyeyi izlemez): https://web.dev/blog/viewport-units
- iOS 16 piksel yakınlaşma: https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/
- Apple, alttan pencereler: https://developer.apple.com/design/human-interface-guidelines/sheets
- Apple, klavyeler: https://developer.apple.com/design/human-interface-guidelines/virtual-keyboards
- iOS 26 kayma hatası: https://developer.apple.com/forums/thread/800125
- Alttan pencere yapımı (Vaul yazarı): https://emilkowal.ski/ui/building-a-drawer-component
