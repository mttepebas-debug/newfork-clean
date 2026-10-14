# Duyuru çekmecesi: referanstan altı düzeltme ve sekmeler (plan, kod yok)

Mert, 12 Ekim 2026, 1:40 PM Pacific. Referans: Important Date drawer · A + L1 (https://claude.ai/artifact/Pt7K2NVLwFx6TPS9ZuXNKX).
Nerede: Announcements → bir duyuruya bas (ya da + New) → sağdan açılan çekmece. Important Dates sayfasındaki çekmece de aynı.

## Altı düzeltme: bugün → yeni

1. **Shifts sekmesindeki sayı**
   - Bugün: küçük sarı hap; yalnız kaldırılacak, kısalacak ya da open shift olacak vardiyaları sayar.
   - Yeni: referanstaki yuvarlak rozet (en az 20 px geniş, 18 px yüksek, kalın). Sayı o günden etkilenen bütün vardiyalar (kalanlar dahil; referanstaki "6"). Biri kaldırılıyor, kısalıyor ya da open shift oluyorsa sarı; hepsi kalıyorsa gri. Etkilenen yoksa rozet yok.
   - Yayından kaldırılmış duyuruda (Unpublished) sayı bugünkü gibi geri getirilebilecek vardiyalar.
2. **Başlığın altındaki satır**
   - Bugün: "Share news with your team. Add it to Important Dates or the Schedule when it's about a day."
   - Yeni: `Holiday · Sun, Jul 4, 2027 · Every year`. Tür (Category; "Other"da yazılan ad), tarih, yıllık tekrar varsa "Every year".
   - Birden çok gün: `Event · Thu, Dec 24 – Sat, Dec 26, 2026`. Tarihsiz duyuru: yalnız tür (`General`).
3. **Çekmecenin en altındaki sarı bant**
   - Bugün: uyarı Locations & publishing sekmesinin içinde, küçük bir satır.
   - Yeni: düğmelerin hemen üstünde, her sekmede görünen bant. Sarı: "2 shifts will be removed · 4 kept" ve sağda çerçeveli "Review shifts" (Shifts sekmesine götürür; Shifts sekmesindeyken gizli). Hepsi kalıyorsa yeşil "No shift changes · 3 kept".
   - Benim varsayılanım: bantta yalnız vardiya etkisi yazar, hata hiç yazmaz (hatalar kendi alanının yanında kalır). Hiçbir lokasyon kapanmıyor ya da kısalmıyorsa bant hiç çıkmaz. Referanstaki gri "Shifts stay as scheduled." ve "Choose at least one location." bantları alınmaz.
   - Çakışan kararlar: bu sabahki "alt şeritte yalnız düğmeler, özet cümlesi yok" (5:29 AM) ve "alttaki uyarı şeridi yok" (3:39 AM). Yeni karar ikisinin yerine geçer.
4. **Lokasyon satırları**
   - Düğmeler: gri çerçeveli kutuda Open · Short hours · Closed; her birinin önünde nokta (yeşil, turuncu, kırmızı); seçili düğme beyaz ve hafif gölgeli. Sıra referanstaki gibi (bugün Open · Closed · Short hours).
   - Sağ sütun: "2 removed · 4 kept" kırmızı (kaldırılan varsa), turuncu (open shift varsa); öbür hâller gri: "Usual hours" (Open), "All fit" (etkilenen yok), "—" (seçilmemiş lokasyon).
   - "All locations" kutusu: lokasyonların bir kısmı seçiliyse yarım işaret.
   - Değişmeyen: Short hours saatleri bugün istediğin gibi düğmelerin altında, aynı genişlikte, saat simgesi yok. Referanstaki "Opens / Closes" yazılı satıra geçmez. Bugünkü "aynı genişlik" ayarı yeni düğme genişliğine uyar.
5. **All day kutusu**
   - Bugün: "All day" yazısı ve "+ Add time" bağlantısı; saat kutuları basınca çıkar.
   - Yeni: Ends etiketinin sağında yeşil "All day" kutusu, varsayılan işaretli. Altında Start time / End time hep görünür; kutu işaretliyken soluk ve kapalı. Kutu kaldırılınca açılır, bugünkü gibi 3:00 PM – 4:00 PM ile dolar. "+ Add time" ve "Remove time" kalkar.
6. **Sekme adı**: sekme kararına bağlı (aşağıda). Ayrı sekme kalırsa adı "Locations".

## Bilgisayarındaki iki bekleyen düzeltme
Schedule for later satırı: geçmiş saat uyarısı kutunun hemen altında; tarih-saat kutusu hep görünür, kutu işaretlenince açılır. İkisi de aynen kalır. Sekme kararıyla satırın yeri değişebilir, davranışı değişmez. Yeni kod o iki düzeltmenin üstüne kurulur.

## Sekmeler: beyin fırtınası
Bugün: Details · Locations & publishing · Audience · Shifts · Acknowledged · History. Yeni duyuruda 4, kayıtlı taslakta 5, onay istenen yayındaki duyuruda 6 sekme.

Her seçenekte ortak varsayılanım: Shifts sekmesi yalnız bir lokasyon kapanıyor ya da kısalıyorsa (ya da geri getirilecek vardiya varsa) görünür. Sarı bant ve rozet de tam o zaman çıkar. Düz bir duyuruda hiç görünmez.

- **A. 4 sekme (Önerilen):** Details · Audience · Shifts · History.
  - Lokasyon tablosu referanstaki gibi Details'e, When'in altına girer.
  - "Show on the Schedule", öbür iki kutunun ("Add to Important Dates", "Add to Calendar") yanına geçer; üçü bir arada olur.
  - "Schedule for later" Details'in en altına iner.
  - Acknowledged, Audience'ın içine girer: yayından sonra "Who gets it" listesinde her kişinin yanında ✓ ya da "Not yet", üstte "5 of 12 acknowledged" ve "Remind".
  - Yeni duyuruda 2 sekme (vardiya etkisi varsa 3).
  - Artısı: senin 7 Ekim'de seçtiğin iskelet; tarih ve o günün saatleri aynı yerde.
  - Eksisi: üç ve daha çok lokasyonda Details masaüstünde biraz kayar. Bu sabahki "açılış saatleri yalnız Locations & publishing sekmesinde" ve "Acknowledged ayrı sekme" kararları değişir.
  - Dayanak: Mert'in 2026-10-07 kararı (Important Dates çekmecesi A: lokasyonlar Details'te, sekmeler Details · Shifts · History) ve 12 Ekim 1:40 PM mesajı.
- **B. 5 sekme:** Details · Locations · Audience · Shifts · History.
  - Yayın kısmı Details'e geçer, Acknowledged Audience'a girer.
  - Yeni duyuruda 3 sekme (vardiya etkisi varsa 4).
  - Artısı: Details kaydırmadan sığar.
  - Eksisi: sadeleşme az; tarih bir sekmede, o günün saatleri öbüründe.
- **C. Yalnız ad:** 6 sekme kalır; ikinci sekmenin adı "Locations", yayın kısmı Details'e geçer.
  - Artısı: en az değişiklik.
  - Eksisi: sekme sayısı sorunu çözülmez.

Elenenler:
- **Shifts listesini lokasyon tablosunun altına almak:** liste uzun ve kişi başına seçim var. Sarı bandın götüreceği ayrı bir yer gerekiyor.
- **Audience'ı Details'e almak:** iki bölmeli liste geniş; Details çok uzar.
- **History'yi kaldırmak:** Employees çekmecesiyle aynı dil; seyrek bakılır ama yer kaplamaz.
- **Sekmesiz tek uzun sayfa:** kaydırma çok uzar, hantal görünür.
- **Sekme adı için "Where" ya da "Locations & hours":** biri belirsiz, öbürü yine uzun. Ayrı kalırsa önerim "Locations".

## Bitti ölçütü (Mert onaylayınca)
- Altı düzeltme ve seçilen sekme düzeni, Announcements ve Important Dates çekmecesinde, masaüstü (1440) ve telefon (390) görünümünde.
- Bekleyen iki Schedule for later düzeltmesi aynen çalışır.
- Başlık satırı, bant yazısı ve rozet rengi birim testli. Çekmece testleri yeni düzene göre güncel. Web lint ve typecheck temiz.
- Sınıf: normal (yalnız web, sunucu ve veritabanı değişmez).
- Dal push edilir. Sha ve dokunulan ekranlar koordinatöre gider: Important Dates sayfası, Announcements, Announcements çekmecesi. Sayfa haritası güncellemesi PAGES thread'inde. Main'e tren ile.
