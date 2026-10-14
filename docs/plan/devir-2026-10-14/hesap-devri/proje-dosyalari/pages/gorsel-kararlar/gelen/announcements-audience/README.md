# Announcements: duyuru çekmecesinin Audience sekmesi

- Kaynak istek: Mert, 12 Ekim 2026, 3:16 PM Pacific, Important Dates çekmecesi thread'i: "audience sekmesi UI olarak biraz kirli ve amatör duruyor. bunu geliştirebilir misin?"
- Sayfa: `index.html` (tek sayfa, üstte Original / A / B / C düğmeleri). Görüntüler `shots/` altında: masaüstü 1440 (yalnız çekmece kırpıldı) ve telefon 390; her varyantta yeni duyuru, kişi seçerken (B, C), iki kişi eklendi, yayında onaylar (6 of 18), müdür.
- Canlı deneme: `app.html` (PAGES demo uygulaması, dal claude/important-dates-drawer-a-q470vy@36cf66f4 + varyant kodu). Bağlantı biçimi `app.html#s=8.0&sc=new&role=owner&frame=desktop&n=1&audv=a` (`audv` = o, a, b, c). Yeni duyuruda önce başlık ve bir lokasyon, sonra Audience.
- Sekme: Announcements. Sahibi: Important Dates çekmecesi thread'i. Seçim gelince seçilen kodlanır, öbürleri silinir.
- Varyant kodu: `source/varyantlar.diff` (yalnız önizleme için; dala girmedi).

## Varyantlar
- **Original:** bugün. Üstte açıklama cümlesi; solda alt alta üç süzgeç, herkes işaretli gelen yazı listesi, tam genişlik yeşil "Add 8 people"; sağda kişiler yalnız yazı, "Not yet" her satırda, onay saati yeşil kalın.
- **A (bugüne en yakın):** aynı iki bölme. Baş harfli yuvarlaklar, eşit satırlar, ince süzgeçler (davranış aynı), alt satırda "6 selected" + küçük Add. Sağda kişi sayısı rozeti, çubuklu onay özeti + Remind, iğneli tam lokasyon adı, "Not yet" yalnız grup başlığında (amber), onay saati gri ✓. Açıklama cümlesi kalkar.
- **B:** A + üç süzgeç yerine tek arama kutusu ("Search name, job or location"); kimse seçili gelmez.
- **C:** tek liste. "Who gets it" bütün genişlikte, sağ üstte "+ Add people"; basınca aynı yerde arama + liste, Cancel / Add.

## Bilinmesi gereken
- Önceki kararlar korunuyor: bölme adları "Add people" / "Who gets it", sağdaki gruplar, "Ask people to acknowledge" en altta (12 Ekim 5:06 ve 5:29 AM). B, "süzgeçten sonra herkes seçili" davranışını (12 Ekim 3:39 AM, madde 9) değiştirir; C iki bölmeyi tek listeye indirir.
- Önerim A: bugüne en yakın, davranış değişmiyor; B en sade sol bölmeyi veriyor.
