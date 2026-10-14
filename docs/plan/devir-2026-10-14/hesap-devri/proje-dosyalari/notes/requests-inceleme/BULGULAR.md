# Requests kod incelemesi (2026-10-11, xhigh)

İncelenen: main'e giren Requests işi (cd386322 → 88c955e9). 15 bulgu; hepsini koda bakarak doğruladım.

## Bu işte düzeltiyorum
1. **"Also off these days" arama ve lokasyon süzgecine takılıyor.** Arama kutusuna "Alex" yazınca çekmece "Nobody else" diyor, oysa Maria aynı gün izinli.
2. **Tek bir adayı reddetme düğmesi kayboldu.** Eski ekranda "Decline this application" vardı; yeni çekmecede yalnız "Close request" var, o da talebi herkes için kapatıyor. Geri geliyor.
3. **Başvurusunu geri çeken tek aday sonrası cover müdürün listesinde kalıyor.** Veritabanı kuralı "biri bir zamanlar istedi mi" diye bakıyor; "şu an isteyen var mı" diye bakmalı.
4. **Kapanan talepler için ikinci bir okuma servisi eski kuralla çalışıyor.** Bugün ekran onu çağırmıyor ama iki kural olmasın: aynı kural oraya da.
5. **"Shorten time off" düğmesi yeşile döndü** (benim CSS düzeltmem yüzünden). Beyaz olacak.
6. **"Also off these days" ayrık günleri tek aralık gösteriyor.** Maria 13 ve 15 Ekim izinliyse "Oct 13 – Oct 15" yazıyor, 14'ünde çalıştığı hâlde.
7. **Karar veremeyen müdür hiç düğme görmüyor.** Senin 2026-10-06 kararın: düğmeler soluk ve kapalı, altında kilitli neden satırı.
8. **Reddetme gerekçesi zorunlu oldu**, sistemin çekirdeği zorunlu tutmuyor. Eski hâline (isteğe bağlı) dönüyor.
9. **Gerekçe yazarken Escape'e basınca çekmece kapanıyor, yazı kayboluyor.** Escape önce geri adıma dönecek.
10. **Çekmeceyi kapatınca tarayıcının Geri düğmesi bir kez boşa basılıyor.**
11. **"Give shift" hatası "Close request" adımında da görünüyor.**
12. **Open shift'te bozuk cümle:** "Emma can't take the open's shift".
13. **Kırmızı "Deny request" ve "Close request" tek tıkla gidiyor;** kural iki tık.

## Ayrı iş (koordinatöre)
14. Shift Hub'daki eski müdür onay ekranı ve kullanılmayan eski CSS hâlâ duruyor (ikiz sistem). Daha büyük bir temizlik, BACKLOG'a.
15. KARARLAR.md bu işin kararlarını henüz yazmamış ("All" sekmesi hâlâ "seçim bekliyor" diyor). Kayıtları koordinatör aracılığıyla bilgisayardaki thread yazar.
