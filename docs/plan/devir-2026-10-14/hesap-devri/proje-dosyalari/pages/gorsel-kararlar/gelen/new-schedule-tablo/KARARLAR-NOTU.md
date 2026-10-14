# New Schedule penceresi: Mert'in seçimleri

Bu dosya yalnız Mert'in bu tasarım sayfası için verdiği kararları tutar. Karar defterine (`docs/plan/KARARLAR.md`) koordinatörün açtığı kayıt thread'i yazar. Saatler Kaliforniya saati.

| Tarih, saat | Ne istedi / seçti | Sayfada nerede |
|---|---|---|
| 2026-10-12 13:49 | New Schedule penceresi geniş tablo olsun; Export ve Templates akışları da içine girsin. | A ve B |
| 2026-10-12 13:53 | Önce tasarım sayfası (kodlamadan önce). | Bu klasör |
| 2026-10-12 15:23 | B: sol üstteki tarih başlığı kalksın; Schedules, Templates ve Export sekmeleri oraya taşınsın. | B, `b1`, `b2` |
| 2026-10-12 15:24 | Templates sekmesinde sağ üstte "Save template" düğmesi; basınca "Save a draft as a template" formu aşağıda açılsın. | B, `b2b` |
| 2026-10-12 15:29 | Pencere daha dar ve kompakt olsun; ad ile "Use" arasında büyük boşluk olmasın. | A ve B |
| 2026-10-12 15:47 | "Use" ve ⋯ sonrasında, Save template düğmesinin altında boşluk kalmasın. | A ve B (pencere içeriği kadar geniş) |
| 2026-10-12 15:57 | "Olur": şablon akışı için dört öneri onaylandı (aşağıda). | A ve B, `b5`–`b9` |
| 2026-10-12 17:00 | **B seçildi** ("table with tabs'i beğendim"). Schedules sekmesi Templates boyutunda ve onun kadar kompakt olsun; Shifts ve Hours sütunları kalsın, Open sütunu silinsin. | B, `b1`, `b1b` |

## 15:57 onayı: şablon akışı
1. **Önizleme:** şablon satırına basınca şablon ekrandaki haftaya serilir, "Template preview · ad" şeridiyle; düzenleme yok.
2. **Düzenleme:** kalem şablonu düzenleme modunda açar; Publish yerine "Save template", Discard aynı. Kişi atanabilir; isimsiz şablonda vardiyalar açık vardiya olarak başlar.
3. **Düzenlerken Use:** Add (mevcut vardiyalar kalır) ya da Replace (şablonun lokasyon ve departmanlarındaki başlamamış vardiyalar silinir, önce sayısı gösterilir); istenirse departman alt kümesi. Bugünkü davranış.
4. **Düzenleme dışında Use:** önce "Hangi programa yazayım?" (yayındaki program, bir taslak ya da yeni boş taslak); seçilen program düzenlemede açılır, sonra 3'teki seçenekler gelir.

Mert'in ayrıca söylediği: schedule ve template akışları aynı olsun, ayrı sekmelerde ilerlesin.

## Açık
- Gerçek koda geçiş: Mert'in "kodla" demesi bekleniyor. Tablo sayıları ile şablonu ızgarada açma ve düzenleme için veritabanı ve API işi gerekir.

| 2026-10-12 19:53 PT | Export kayda zorlamaz: preview ve edit modunda Export'a basılan an ekrandaki son görüntü (filtreler dahil) export edilir; Save draft adımı yok. Export açıkken draft/schedule değiştirilmez; kaynak çipleri kalkar. Görüntü grid'de ayarlanır, sonra Export. | Mert | Reddedilen: düzenlerken önce draft kaydetmek (main bugün böyle; A–D akışları). |
