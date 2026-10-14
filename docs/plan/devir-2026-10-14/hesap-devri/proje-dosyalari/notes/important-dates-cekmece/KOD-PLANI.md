# Duyuru çekmecesi: kod planı

12 Ekim 2026, 6:50 AM (Pacific). Kaynak: prototip https://claude.ai/artifact/FXWWvxLd3T9v5Qfy4112Mm (11. sürüm) ve Mert'in 12 Ekim 3:39 AM – 6:30 AM notları.

## Anladığım
- Bugün uygulamada iki ayrı sistem var: Announcements ve Important Dates. Ayrı tablolar, ayrı sunucu uçları, ayrı sayfalar ve ayrı çekmeceler.
- Bunlar tek kayda iner: her şey bir duyurudur. İstenirse Important Dates'e, Schedule takvimine ve Schedule'a eklenir.
- Important Dates, menüde Announcements'ın altına geçen bir alt sayfa olur. Yayındaki ve "Add to Important Dates" işaretli duyuruları listeler.
- Prototipte görünen her şey kodlanır, masaüstü ve telefon birlikte. Telefonun üstünden sonra ayrıca geçeceksin.

## Ne kodlanacak
1. **Announcements listesi**
   - Sekmeler: All, Draft, Scheduled, Published, Archived.
   - Active ve Past diye iki tablo.
   - Sütunlar: Status, Announcement, Published on.
   - Başlığa basınca sıralama.
2. **Tek çekmece**
   - Details: Title, Category, Message, iki kutu, When (Starts, Ends, + Add time), Repeats.
   - Locations & publishing: lokasyon başına Open, Closed ya da Short hours; Schedule for later; Show on the Schedule.
   - Audience: Add people ve Who gets it; altta "Ask people to acknowledge".
   - Shifts: etkilenen her vardiya için Keep, Remove ya da saat değiştirme.
   - Acknowledged: kim, ne zaman onayladı.
   - History: oklu zaman çizelgesi, en yeni üstte.
   - Yeni duyuruda her sekmede Next. Uyarı yalnız ilgili alanın altında.
   - Biten duyuru salt okunur, yalnız Archive.
3. **İşlemler:** Publish, Schedule, Unpublish, Bring back, Archive. Zamanı gelen duyuru kendiliğinden yayınlanır. Ends geçince duyuru Past olur.
4. **Important Dates sayfası:** Upcoming ve Past sekmeleri, takvim sırası.
5. **Schedule**
   - Sol üstteki mini takvimde, "Add to Calendar" işaretli duyuruların günü işaretlenir.
   - Gün başlığında kapalı gün ve kısa saat görünür.
   - Kapalı ya da kısa saatli güne vardiya eklemek bugünkü gibi sorar.
6. **Çalışan ekranları**
   - Ana sayfada "Coming up" kartı.
   - Duyuru listesi ve Past sekmesi.
   - Onay istenen duyuruda Acknowledge düğmesi.

## Eksik ya da yanlış olabilecek
1. **Eski kayıtlar silinir.** Tek sisteme geçince eski Important Dates tabloları kalkar. Canlıdaki eski önemli gün kayıtları taşınmaz, silinir; canlıdaki veri zaten test verisi (eski veri korunmaz kuralı). Bu silme, senin bilgisayarındaki Claude thread'inde ayrıca yazılı "evet"ini ister.
2. **Onay (acknowledge).** Bugün her duyuruda Acknowledge düğmesi var. Yeni düzende yalnız "Ask people to acknowledge" işaretli duyuruda olur.
3. **Kitle.** Bugün duyurunun kitlesi rol, departman ve iş kurallarıyla seçiliyor. Yeni düzende işaretli lokasyondaki herkes ve elle eklenen kişiler alır. Departman ve iş yalnız Add people'daki filtreler olur.
   - Bunun sonucu: sonradan işe giren biri yalnız işaretli bir lokasyondaysa duyuruyu görür. Elle eklenen listeye kendiliğinden girmez.
4. **Kategoriler.** Yeni liste: General, Holiday, Event, Busy day, Celebration, Inspection, Staff meeting, Other (adı yazılır).
   - Bugünkü Operations, Schedule, Blackout ve Closed day kategorileri kalkar.
   - Kapalı gün artık bir kategori değil, lokasyonun Closed seçimi.
5. **Her yıl tekrarlayan duyuru.** Saat değişikliği her yıl Schedule'a işlenir. Vardiya seçimi yalnız yayın anında var olan vardiyalar için yapılır. Sonraki yılın kapalı gününe vardiya eklenince bugünkü kapalı gün sorusu çıkar.
6. **Yetki.** "Add to Important Dates" ve saat değiştirme bugünkü Important Dates iznine bağlı kalır. Prototipteki gibi, yalnız Announcements izni olan şef bunları yapamaz.
7. **Eski dal.** Bu çekmece için açılan eski dal güncel main'den geride. Dört dosyada çakışıyor ve veritabanı değişikliğinin sırası bozuk. İçindeki lokasyon günleri, kısa saat ve vardiya seçimi işi yeni tek kayda taşınır.
8. **Testler.** Playwright (tarayıcı) testleri bulutta koşmaz; senin bilgisayarındaki thread'de koşar.
9. **İşaretli kutu görünümü.** Açık renkli kutu, cevabın gelene kadar yalnız bu çekmecede kalır.

## Bence
- **Tek dal, üç aşama, en sonda tek tren.** Yarım hali main'e çıkamaz, çünkü ekranlar ve sunucu birlikte değişiyor.
  - A. **Veritabanı ve sunucu:** tek kayıt; lokasyon günleri; vardiya seçimi; zamanlanmış yayın ve Ends; onay isteği; History. Eski Important Dates kalkar. Veritabanı testleri ve yetki tablosu güncellenir.
  - B. **Ekranlar:** liste, çekmece, Important Dates sayfası, menü, Schedule, çalışan ekranları; masaüstü ve telefon; ekran testleri.
  - C. **Kontrol:** bağımsız güvenlik incelemesi; senin bilgisayarında tarayıcı testleri; 1440 ve 390 genişlikte ekran görüntüleri; PAGES sayfaları; tren.
- **Elenen 1:** iki tabloyu koruyup birbirine bağlamak. İkiz sistem yasağına aykırı, ve her kuralı iki yerde yazmak gerekir.
- **Elenen 2:** önce ekranları eski sunucunun üstüne kurmak. Eski Important Dates sunucusu duyurunun alanlarını tutamaz; iş iki kez yapılır.
- **Maliyet:** para yok, yalnız zaman. Büyük bir iş, birkaç oturum sürer.

## Bitti ölçütü
- Prototipteki dokuz akış gerçek uygulamada çalışır: masaüstü 1440 genişlik, telefon 390.
- Tek tablo, tek sunucu ucu, tek çekmece. Eski Important Dates parçaları silinir ve geri gelmesin diye silinenler listesine eklenir.
- Veritabanı, sunucu ve ekran testleri yeşil; bağımsız inceleme onayı; trenin CI'ı yeşil.
