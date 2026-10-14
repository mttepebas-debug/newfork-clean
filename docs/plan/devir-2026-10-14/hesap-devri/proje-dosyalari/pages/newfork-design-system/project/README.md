Newfork, ABD'deki çok lokasyonlu restoranlar için vardiya planlama aracı. Görünüşü bir kokpit gibi: sakin, yoğun, ciddi bir iş aracı. Oyuncak görünüm, rozet ve pazarlama dili yok. Ekranlar açık temada, beyaz yüzeyler ve tek bir marka yeşiliyle kurulur. Renk bir anlam taşıdığı için kullanılır, süs için değil.

## Ses ve metin

- Arayüz dili ABD İngilizcesi. Metin alanlarında Türkçeye özgü harf yok (ş, ğ, ı, İ); öteki aksanlı Latin harfleri doğru yazılır: "José Peña".
- Sistem terimleri **workspace** ve **team**. Asla "business" ya da "organization" yazma; kod adları ekranda görünmez.
- Bir mesaj tek bir şey söyler, kısa ve doğrudan. Geliştirici notu gibi yazma. Örnek: "Schedule published", "Ayşe and 11 others were notified."
- Vardiyayı isteğe bağlıymış gibi gösteren yumuşatma yok. "You might want to…" değil, "You're scheduled Tue 9:00 AM – 5:00 PM."
- Kime gidileceğini söylerken kişi adı değil rol yaz: "Ask an Admin", "Ask your manager".
- Yıkıcı bir eylemin ikinci tık etiketi her zaman "Confirm <fiil>": "Confirm delete", "Confirm archive".
- Emoji, ünlem ve pazarlama cümlesi yok. Ekranda yalnız işi anlatan metin.
- Alan altında uzun açıklama yok; gerekiyorsa tek cümle.

## Renk

- Yalnız açık tema. Her renk bir `theme-*` token'ından gelir; yeni ekranda ham hex yazma.
- Zemin `theme-page`, üzerindeki kutular `theme-surface`. Kutu kenarı `theme-border`, kutu içi ayırıcı `theme-border-subtle`: ikisi bilerek ayrı.
- Gövde metni `theme-text-body`, başlıklar `theme-text`. İkincil metin beyaz ve `theme-page` üzerinde `theme-muted`; renkli zeminlerde (`theme-selected`, `theme-warning-soft`) `theme-muted-strong`, çünkü `theme-muted` orada 4.5:1'in altına düşer.
- Marka rengi `theme-accent` (yeşil). Eylemi, seçimi ve odağı taşır; büyük alanlara boya olarak sürülmez. Yeşil zemin üzerinde metin `theme-on-accent`.
- Seçili satır `theme-selected`, odak halkası `theme-focus`.
- Durum renkleri her zaman bir kelime ya da işaretle birlikte gelir, yalnız renkle değil: hata `theme-danger` / `theme-danger-soft`, uyarı `theme-warning` / `theme-warning-soft`, başarı `theme-success` / `theme-success-soft`.
- `theme-note` yalnız müdür notu içindir; başka hiçbir şeyde kullanma.
- Her metin rengi kendi zemininde en az 4.5:1 (24px ve üstü 3:1). Oranlar her token'ın notunda yazılı.

## Yazı

- Tek aile: `sans`, yani **Inter** (Mert'in seçimi, 2026-10-04; gerçek ekranlarda dört aday karşılaştırıldı). Uygulama Inter'i kendi sunucusundan yükler (`apps/web/public/fonts`, 400–800 arası tek değişken dosya, SIL OFL); dışarıdan font isteği yok. Aksanlı harf dosyası (latin-ext) yalnız "José Peña" gibi bir ad ekrana gelince iner.
- İkinci bir sans aile ekleme; Schedule filtre menüleri de Inter.
- Saat girişleri `mono` ailesiyle, rakamlar hizalı dursun diye.
- Ekran başlığı `page-title` (28px, 800). Ekran başına bir tane.
- Arayüz yoğun: çoğu metin `ui-dense` (13px) ve `ui-small` (12px). Rozet ve küçük başlıklar `ui-micro` (11px). 11px'in altına inme.
- Ağırlıklar kalın tarafta: etiket ve başlıkta 700–800, buton metninde 750. Gövde metni 400.
- Ürün adı yazıyla `wordmark`: büyük harf "NEWFORK", 13px, 800, 0.08em aralık, `theme-accent-strong`.

## Biçim

- Köşeler küçük ve sıkı: buton ve girişlerde 6px, toast ve kartlarda 8px, vardiya kartlarında `schedule-badge-radius` (4px). Hap ve büyük yuvarlak köşe yok.
- Çizgiler ince: 1px kenar, ayırıcılar `theme-border-subtle`. Schedule ızgarası `schedule-grid-line-width`, Unassigned satırı `schedule-unassigned-line-width`, lokasyon sınırı `schedule-location-boundary-width`.
- Gölge yalnız üstte yüzen şeylerde (toast, menü, pencere); sayfadaki kutular gölgesiz, kenarla ayrılır.
- Geçişler kısa: 120–150ms. Sıçrama ve süs animasyonu yok.

## Durumlar ve etkileşim

- Buton dili üç rolden ibaret: eylem yeşil (`Button`, zemini `theme-accent`, üzerine gelince `theme-accent-strong`), vazgeç beyaz (`secondary-button`), yıkıcı kırmızı ve iki tık (`ConfirmButton` + `danger-button`). Ekran başına renk değiştirme.
- Tek istisna, bilerek: Schedule üst çubuğunun eylem butonları (Export, Templates, New Schedule ▾ ve henüz yayında bir şey yokken Publish) siyah, `theme-action`. Mert 2026-10-04'te gerçek ekranda üç varyant arasından bunu seçti; yeşile ya da beyaza çevirme.
- Bir pencerede tek kaydetme noktası var: sağ alttaki Save.
- Odak her zaman görünür: 2px düz `theme-focus` halka, 2px boşluk.
- Pasif buton yarı saydam (opacity .55), imleç `not-allowed`.
- Tarayıcının kendi onay penceresi asla kullanılmaz; uygulamanın kendi onay penceresi var.
- Pencere kapanırken yalnız kaybedilecek iş büyükse "Discard unsaved changes?" sorulur.

## Yerleşim

- Yönetim ekranları masaüstüne göre tasarlanır, telefonda da çalışır; çalışan ekranları telefona göre tasarlanır.
- Masaüstünde sol menü (288px), telefonda alt çubuk. Tek kırılma noktası 720px.
- Türetilmiş öğe (başka lokasyondaki vardiya, "ghost"), aynı bileşenin soluk hâlidir: `schedule-ghost-edge` kenar, `schedule-ghost-text` metin.

## İkonlar

- Tek ikon kütüphanesi: lucide (çizgi ikonlar). Satır içinde 14–16px, araç çubuğunda 18px; en çok 15px kullanılıyor.
- İkon tek başına anlam taşıyorsa yanında görünür bir etiket ya da en azından erişilebilir ad olur.
- Toast'taki işaretler ikon değil yazı karakteri: ✓ ✕ ! i. Emoji yok.

## Logo ve isim

- Tek işaret: koyu kare içinde beyaz "N" (`favicon.svg`, Logos grubunda). Bugün yalnız tarayıcı sekmesinde.
- Uygulamanın içinde Newfork logosu yok; sol üstte müşterinin workspace adı ve baş harfi durur.
- Hesap henüz bir workspace'e bağlanmadan önceki ekranlarda ve herkese açık sayfalarda ürün adı `wordmark` ile yazılır.

## Schedule işaretleri

- Müsaitlik (turuncu, `theme-availability`) bir tercih: müdür üstüne yine vardiya yazabilir, uyarı verir. İzin (kırmızı, `theme-time-off`) onaylanmış bir engeldir.
- İkisi de hücrede taralı dolgu: 135°, 6px boşluk + 3px çizgi, dört kenarda 1px kenar. Kartta uyarı 18px turuncu "!" dairesi.
- Yayın durumu: hafta tamamen yayında `theme-published`, yalnız bazı lokasyonlar yayında `theme-published-partial`.
- Bugünün sütunu `schedule-current-ring-color` halkasıyla, Unassigned satırı `schedule-unassigned-row-background` zeminiyle işaretlenir.

## Henüz eşitlenmeyenler

- Genel aralık, köşe, gölge ve yazı boyutu token'ı kodda yok; buradaki boyutlar en sık kullanılan gerçek değerler. Kodda 977 sabit font boyutu ve 1.400'den fazla ham hex rengi var.
- Yakın yeşil tonlar birden fazla token'da: `theme-accent`, `theme-success`, `theme-focus`, `theme-published`, `theme-accent-focus`. Birleştirme ayrı iş (THEME-003).
- Bileşenler kodun kendi CSS'iyle çizilmiş statik kopyalar; canlı React paketi yok.
- Müsaitlik ve izin yalnız renkle ayrılıyor (şekil farkı backlog'da). `theme-border-control` 2.02:1 ile kontrol kenarı eşiğinin (3:1) altında.
