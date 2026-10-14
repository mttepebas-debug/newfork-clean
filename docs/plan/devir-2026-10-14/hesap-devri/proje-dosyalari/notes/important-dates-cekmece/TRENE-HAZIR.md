# Duyuru çekmecesi: trene hazır

12 Ekim 2026, 11:35 AM (Pacific).

## Kısaca
- **Dal:** `claude/important-dates-drawer-a-q470vy@b29e22b7` (güncel main f310ffd6 içinde, çakışmasız).
- **Sınıf:** incelemeli. Bağımsız güvenlik incelemesi: **ONAY @b29e22b7**.
- **Ne var:** Announcements ve Important Dates tek duyuru kaydında. Important Dates, menüde ve adreste Announcements'ın altında (`/app/announcements/important-dates`). Tek çekmece: Details, Locations & publishing, Audience, Shifts, Acknowledged, History. Masaüstü ve telefon.
- **Canlı veritabanı adımı riskli** (aşağıda). Mert'in bilgisayarındaki thread'de Mert'in yazılı "evet"ini ister.

## Kontroller (bulutta)
- Web: typecheck temiz, lint 0 hata (17 uyarı main'de de var), birim testler 2708 geçti.
- API: 1067 test geçti. Shared: 242 test geçti. e2e typecheck temiz.
- Veritabanı: duyuruyla ve Schedule okumasıyla ilgili 41 dosya yerel Postgres 16'da koştu. Yeni kırmızı yok. Kırmızı kalan 7 dosya main'de de aynı kırmızı; bulut test ortamının eksiği (pgTAP'ın bir fonksiyonu, örnek veri, zaman ölçümü). Örnek veri gerektiren iki dosya, örnek veri yüklenince yeşil (56/56, 17/17).
- Tarayıcı testleri (Playwright) bulutta koşmaz; trenin CI'ında koşar: `e2e/flows/announcement-reaches-its-people.spec.ts`, `e2e/flows/announcement-archive.spec.ts`.
- `supabase/schema.sql` bu dalda yenilenmedi; trende yenilenir.

## Güvenlik incelemesinin bulguları (hepsi bu işte kapandı)
1. **Ciddi:** hiçbir lokasyona bağlı olmayan duyuruyu (yalnız elle eklenen, lokasyonu olmayan kişilere giden) başka bir müdür değiştirebiliyordu. Artık yalnız yazarı ve workspace genelinde yazan (owner, admin) değiştirir.
2. **Orta:** böyle bir duyuru her müdürün Schedule haftasında görünüyordu. Artık yalnız duyuru ona gidiyorsa ya da onu değiştirebiliyorsa görünür.
3. **Düşük:** müdür haftası okuyucunun yetkisini her kayıt için yeniden hesaplıyordu; artık okuma başına bir kez.
4. Test önerileri eklendi: aynı lokasyondaki eş müdür, rolü düşen yazar, yazarın kendi haftası.
- Bir eski test bu açığı "doğru" diye bekliyordu; beklenti sıkılaştırıldı, gevşetilmedi.

## Benim hatam, düzeltildi
- PAGES görüntülerinde gördüm: bitmiş (Past) duyuruda Archive düğmesi çıkmıyordu. Sunucu doğru bilgiyi gönderiyordu, çekmece yanlış okuyordu; test de sunucunun göndermediği bir değerle yazılmıştı. Önce kırmızı test, sonra düzeltme (`80dead3d`).

## Canlı veritabanı (migration `20261012050000_one_announcement_record.sql`)
- **Riskli:** eski Important Dates tablolarını (`important_dates`, `important_date_changes`, `important_date_shift_releases`) ve eski duyuru ve önemli gün fonksiyonlarını siler; eski önemli gün kayıtları ve bildirimleri silinir, taşınmaz (canlı veri test verisi; eski veri korunmaz kuralı).
- Eski duyurular korunur: kategorileri General olur, lokasyonu olmayanlar o workspace'in bütün açık lokasyonlarına bağlanır, hepsinde "Ask people to acknowledge" açık kalır.
- Yetki, RLS ve SECURITY DEFINER fonksiyonlarına dokunur. Canlıya geçmeden önce yedek şart.

## Senin yerine seçtiğim varsayılanlar
1. Duyuruyu alanlar: işaretli lokasyondaki herkes ve elle eklenenler.
2. Duyuru değişince eski onaylar sıfırlanmaz.
3. Başlamış duyurunun lokasyonları, gün seçimi, etkinlik saati ve tekrar ayarı kilitlenir.
4. Sessizce değiştirilen vardiyalar da Bring back ile geri getirilebilir.
5. Müdürler zamanlanmış duyuruları listede ve Schedule'da görür; Scheduled mavi.
6. Bitmiş duyuruda tek işlem Archive.
7. Menüde Announcements grubu açık gelir.
8. Telefonda liste başlık satırı gizli.
9. Çalışan ana sayfasında "Coming up" en çok 4 tarihli duyuru gösterir; bunlar Team notices'te tekrar görünmez.
10. Unpublish ve Archive kırmızı çerçeveli; ilk tıkta kırmızı dolar, ikinci tıkta olur.
11. Hiçbir lokasyona bağlı olmayan duyuruyu yalnız yazarı ve owner/admin değiştirir; müdürün Schedule'ında yalnız ona gidiyorsa ya da onu değiştirebiliyorsa görünür.

## Karar defterine yazılacaklar (koordinatöre; bu dal KARARLAR'a dokunmaz)
- **Announcements listesi (Mert, 12 Ekim 2026, 6:29 AM Pacific):** sütunlar soldan Status, Announcement, Published on. Audience sütunu yok. Yayındakilerde "Upcoming" etiketi yok. Tarihi olmayan satırda tarih yerine çizgi. "Newest first" yazısı yok. Sütun başlığına (Status dahil) basınca A→Z / Z→A ya da yeni→eski / eski→yeni sıralar. "Past and expired" başlığı "Past". Bitmiş duyurunun çekmecesinde "Ends can't be before today" hatası yok; bitmiş duyuru salt okunur, tek işlem Archive.
- **Telefon (Mert, 12 Ekim 2026, 6:30 AM Pacific):** duyuru ekranlarının telefon görünümü plana göre şimdi kodlandı; Mert bütün telefon uygulamasının üstünden sonra ayrıca geçecek.
- **Backlog'a (Mert, 12 Ekim 2026, 6:29 AM Pacific):** "announcement mobile görüntüsü daha sonradan kodlanacak".

## PAGES
- Dokunulan ekranlar: Workspace, Schedule, Important Dates, Employee home, My schedule, Announcements, Announcement detail, Notifications.
- Demo veri yeni tek kayda taşındı ve 1440 ile 390 genişlikte denendi. Sayfalar tren main'e indikten sonra main'in sha'sıyla aynı bağlantılara yayımlanır.
