# Settings → Shift types sayfası, güncel liste diline geçiş

- Kaynak istek: Mert, 2026-10-12 05:17 (Kaliforniya), Shift types "başlangıç = bitiş" cümlesi thread'inde: "shift types sayfasını güncel design dilimize uygun olarak yenile. artifact olarak güncelle önce ve sun".
- Sayfa: `index.html` (kabuk) + `app.html` (gerçek uygulama kodu, main `e0763dd5` üstüne varyant denemesi; main'e girmedi; örnek veri Harbor & Vine). İkisi aynı klasörde durmalı; `index.html` `app.html`'i masaüstü (1440) ve telefon (390) iframe'lerinde açar.
- Varyant geçişi: sayfanın üstündeki "Varyant" düğmeleri (Original / A / B / C). Doğrudan açmak için adresin sonuna `#v=A` (ya da `B`, `C`). Senaryo düğmeleri her varyantta çalışır: Shift types, Breakfast'ı düzenle, Başlangıç = bitiş, Yeni vardiya türü, Shift labels, Yeni etiket.
- Nerede bakılır: Settings → Shift catalog (Original ve A) ya da Settings → Shift types / Shift labels (B ve C, menüde iki ayrı satır).
- Ekran görüntüleri: `ekran/original-masaustu.png`, `original-telefon.png`, `a-…`, `b-…`, `c-…` (masaüstü ve telefon); ek: `a-etiketler-masaustu.png`, `b-etiketler-masaustu.png`, `b-arsiv-bos.png` (Archived sekmesi boş hâli), `c-cekmece.png` (düzenleme çekmecesi, başlangıç = bitiş uyarısı).
- Varyant kodu: `varyant-kodu.diff` (yalnız önizleme için; seçimden sonra seçilen düzen temiz biçimde yazılır, öteki varyantlar atılır).

## Varyantlar
Ortak (A, B, C): başlık Locations ve Documents gibi ("SETTINGS" üst yazısı, büyük başlık, yeşil nokta, altında açıklama, başlıkta düğme yok). Arama satırı genişliği doldurur, yeşil ekleme düğmesi satırın sağ ucunda ("New shift type", etiketlerde "New shift label"). Tablo ortak çerçevede, başlık satırı renkli. "Show archived" kutusu kalkar. Telefonda her vardiya türü bir kart ("7:00 AM – 12:00 PM · 5 h"). Ekleme ve düzenleme çekmecesi değişmez.
- **Original:** bugünkü main. Saat ikonlu başlık, başlığın sağında "Shift types / Shift labels" sekmeleri ve "Add shift type" düğmesi; küçük arama, sağda "Show archived" kutusu; telefonda sıkışık tablo.
- **A · Tek sayfa, sekmeli:** menüde yine tek "Shift catalog" satırı; başlık "Shift catalog". Shift types / Shift labels sayfanın içinde sekme olarak kalır; Active / Archived bir açılır listede, aramanın solunda.
- **B · İki sayfa, sade tablo (Locations ile aynı):** menüde "Shift catalog" yerine iki satır: "Shift types" ve "Shift labels"; her biri kendi sayfası. Sayfa içi sekmeler Active / Archived. Tablo sütunları bugünküyle aynı (Shift type, Default start, Default end).
- **C · İki sayfa, gün çubuklu:** B ile aynı, tabloda saat sütunları farklı: "Default hours" (7:00 AM – 12:00 PM), "Length" (5 h) ve 24 saatlik gün çubuğu (vardiyanın günün hangi kısmını kapladığı kendi renginde; gece yarısını geçen vardiya iki parça). Telefonda B ile aynı kart.

## Bilinmesi gereken
- KARARLAR "Gezinme" kuralı: sayfa içi sekmeler kalkar, bütün gezinme sol menüdedir. Original ve A bu kurala uymuyor (Shift types / Shift labels sekmeleri sayfada); B ve C uyuyor. B ve C seçilirse Settings menüsü değişir: "Shift catalog" satırı iki satıra ayrılır.
- KARARLAR "Liste sayfalarının ortak dili": başlıkta düğme yok, ekleme düğmesi filtre satırının sağ ucunda. A, B, C üçü de uyuyor.
- Locations kararındaki Active / Archived davranışı aynen alındı: Archived sekmesi yalnız arşivlileri gösterir (bugünkü kutu ikisini birlikte gösteriyor).
- C'deki gün çubuğu yeni bir görsel öğe; başka liste sayfasında yok.
- Settings → Jobs da hâlâ eski görünümde (ikonlu başlık, başlıkta düğme); bu sayfa onu değiştirmiyor.
- Ekleme ve düzenleme çekmecesi (Locations ile ortak) bütün varyantlarda bugünkü hâliyle.
- PAGES'teki Shift catalog sayfası (10.6) kod main'e girene kadar değişmiyor.

## Sonuç (Mert, 2026-10-12 05:45 Kaliforniya)
- Mert: "a- seçiyorum search barı tamamen uzat ve dropdown filtreyi active yazanı kaldır".
- Kodlandı: dal `claude/project-thread-sytcje@aef72390`. A düzeni; Active/Archived açılır listesi yok, arama filtre satırını doldurur. Arşivlenen türler ve etiketler listenin sonunda, soluk ve "Archived" işaretli; satır menüsünden tek tıkla Restore (thread'in seçtiği varsayılan, süzgeç kalkınca arşivlenenlere ulaşmanın yolu). Ekleme çekmecesinin adı da "New shift type" / "New shift label".
- Önizleme: `secilen-a/index.html` (+ `app.html`, `ekran/*.png`); "Arşivlenmiş tür" senaryosu Close'u arşivleyip listenin sonunda gösterir.
- Bu madde görsel kararlar sayfasından kapanabilir.
