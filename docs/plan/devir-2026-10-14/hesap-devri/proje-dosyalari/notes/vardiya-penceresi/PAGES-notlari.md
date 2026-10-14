# Yeni vardiya penceresi — PAGES ve KARARLAR notları

Dal: `claude/project-thread-gm61vc@a094353` (tek commit, güncel main 3e66bd1 üstünde).
Kaynak thread: "Vardiya ekleme ve düzenleme pencereleri". Test sayfası: https://claude.ai/artifact/JLkkPNRt2bhD5DNSsZxWoH

## PAGES: güncellenecek yerler
Schedule sayfası (yönetici, düzenleme modu) ve bu pencereyi gösteren her senaryo:

| Parça / durum | Ne değişti |
|---|---|
| Add shift penceresi (boş hücre, "+ Add shift", preset) | Eski çekmece/yüzen kart yerine tek pencere; tıklanan hücrenin yanında açılır. Başlık: "Add shift", altında "Kişi · gün · lokasyon". |
| Edit shift penceresi (karta çift tık, sağ tık → Edit) | Kartın yanında açılır; düzenlenen kart hafifçe "nefes alır". Değişiklik yoksa Save soluk; Enter pencereyi kapatır. |
| Paste / kopyalanan vardiya penceresi | Aynı pencere, aynı düzen. |
| Görünüm: Form | İki sütun. En üstte Type çipleri. Sol: Who (Add'de), Time, Break. Sağ: Job, Labels, Note, Badge. |
| Görünüm: Timeline | Gün şeridi: her kişi bir satır; çubuk sürüklenir, uçlarından uzar/kısalır, boş yere çizilir, ok tuşu 15 dk (Shift+ok 1 saat). Kişiye tıklayınca vardiya ona geçer. "Open" satırı = herkes. |
| Görünüm değiştirici | Başlıktaki iki düğme (Form / Timeline) ya da Alt+T; seçim tarayıcıda hatırlanır. |
| Who listesi | Unassigned yerine "Open"; kişiler Free / Busy / Unavailable / Time off ipucuyla, boş olanlar önce. |
| Açılır listeler (Job, Labels, Who) | Altta yer yoksa yukarı açılır; alt çizginin arkasında kesilmez. Escape önce listeyi kapatır. |
| Kaydırma çubuğu | Pencerede hiç yok; ekran kısaysa pencere sıkışır (Timeline'da satırlar incelir, fazlası "More people" listesine iner). |
| Save düğmesi | Enter işareti yok. |
| Aktif hücre | Pencere açıkken hücre yeşil çerçeveli ve açık yeşil zeminli. |
| Bayat veri durumu | Pencere içinde çakışma kutusu + "Close & reload". |
| Silme | "Delete" → "Confirm delete" (iki tık, kırmızı). |
| Telefon | Değişmedi: Schedule telefonda kapalı. |

Ekran görüntüleri: `/mnt/project-files/notes/vardiya-penceresi/ekran/` (1440×900 Add ve Edit Form, 1440×640 Timeline ve Labels açık).

## KARARLAR için metin (koordinatör → kayıt yazan thread)
- **Vardiya penceresi (Mert 2026-10-13, "kodla"):** Add/Edit shift tek pencere; iki görünüm Form ve Timeline, değiştirici başlıkta ve Alt+T, seçim tarayıcı başına hatırlanır. Type en üstte. Kişi/gün/lokasyon başlığın altında. Atanmamış seçenek "Open". Save'de Enter işareti yok. Pencerede kaydırma çubuğu yok; liste yer yoksa yukarı açılır. Reddedilen: eski sağ çekmece ve yüzen kart (silindi).
- **Alan kenarı:** pencere alanlarının kenarı `--theme-muted` (UI-09 kontrast kuralı); test sayfasından biraz daha koyu.
