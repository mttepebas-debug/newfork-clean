# PAGES: duyuru tek kaydının demo verisi (EKRAN-08)

Bu klasör, Önemli Tarihler çekmecesi thread'inin PAGES demo verisi ve senaryo değişikliğidir.
Yayın, tren main'e indikten sonra yapılır (ortak kaynak main'in koduyla derlenir; bu değişiklik main'deki eski Important Dates koduyla çalışmaz).

## Durum (12 Ekim 2026, 12:05 PM Pacific)
- `port/`: ortak kaynağın (`/mnt/project-files/PAGES/_kaynak`) 11:12 AM Pacific hâli üzerine yeniden uygulanmış değişiklik. Tam dosyalar.
- `base/`: aynı dosyaların o andaki ortak kaynak hâli (silinecek `dates-service.ts` dahil). Ortak kaynak yine değişirse fark `base/` → `_kaynak` arasından okunur, `port/` üzerine taşınır.
- Derlendi ve senaryo denetimi koştu (dal `claude/important-dates-drawer-a-q470vy@b29e22b7` koduyla): 6.0, 8.0, 8.1 senaryolarının hepsi açılıyor.
- Senaryo denetimi, öbür ekranlar (12:35 PM Pacific): 2.0 (25), 7.0 (39), 7.1 (16), 9.0 (21) ve 10.0'ın eski adres senaryoları hepsi açılıyor. 3.0'da 224 açılıyor; kapalı gün, kısa saatli gün ve kapalı güne vardiya senaryoları dahil.
- 3.0'da iki kırmızı var: `employee` (çalışan Schedule'dan 7.0'a yönlenir) ve `changed-after` (seçicide `{week+1}` yerine konmamış). İkisi de bu değişikliğin dokunmadığı senaryolar. Değişikliksiz derlemeyle karşılaştırılmadı.

## Değişiklik listesi
- `mock/announcements-service.ts` (yeni): tek duyuru kaydı; liste, Important Dates, önizleme, kaydet, durum işlemleri, onay; Schedule'ın kapalı ve kısa saatli günleri (`world.closures`) ve gönderileri (`world.important_dates`) kayıtlardan üretilir. Admin (Daniel Brooks, sıra 2, bütün lokasyonlar) ve Shift Lead (Carlos Rivera, müdür sınıfı, yalnız okur) görünümleri; izinler `access.ts viewerPermissions()`'tan. İki pencere aynı yazmayı bir kez yapar (`replayed`).
- `mock/dates-service.ts`: silinir (eski Important Dates).
- `mock/communications-service.ts`: eski duyuru kodu, `locationRecord`, `audienceSize` çıkar; yalnız bildirimler kalır; `notifyUsers` eklenir; `replayed` dışa açılır; duyuru bildirimleri `POST` kimlikleriyle; depolama adı `notices`.
- `mock/world.ts`: `POST` kimlikleri; `closures` ve `important_dates` yeni biçim, tohumda boş; depolama anahtarı v2.
- `mock/api.ts`: `announcementsRoutes`; `datesRoutes` çıkar.
- `mock/workspace-service.ts`: `activeAnnouncements` yeni servisten.
- `mock/schedule-service.ts`, `mock/hub-read.ts`: kapalı gün kontrolü `shared.scheduleClosureCoversShift` ile (kısa saat dahil); okumada gönderiler yeni biçimle süzülür; çalışan panosu zamanlanmışı görmez.
- `mock/hub-setups.ts`: `hub-no-announcements` yeni kayıtlarla; `dates-empty` eklendi; `hub-ack-again` ve `hub-archived-selection` silindi (o özellikler yeni ekranda yok).
- `mock/schedule-setups.ts`: `schedule-partial-closure` silindi (vardiya türüne göre kapalı gün artık yok).
- `pages.ts`: Important Dates adresi `/app/announcements/important-dates`.
- `tools/screens.py`: 6.0, 7.0, 8.0, 8.1 tanımları.
- `tools/sc/40-calisanlar.py`: 6.0 senaryoları yeni sayfa ve çekmeceye göre yeniden yazıldı.
- `tools/sc/70-hub-kabuk.py`: 8.0 ve 8.1 senaryoları yeni liste ve çekmeceye göre yeniden yazıldı.
- `tools/sc/30-schedule.py`: kapalı gün senaryoları gelecek haftanın Salı'sına (Kitchen deep clean); "partial-closed" yerine "short-day" (Hartwell private buyout, kısa saat).
- `tools/sc/50-ayarlar.py`: eski adres yönlendirmeleri yeni Important Dates adresine.

## Yayın adımları (tren main'e indikten sonra)
1. `_kaynak`'ı yeniden oku; `base/` ile farkı varsa `port/` üzerine taşı.
2. `port/` dosyalarını `_kaynak`'a yaz, `dates-service.ts`'i sil; `tools/pages.json`, `PAGES/MAP.txt` ve dizinde yalnız dokunulan ekranların satırları.
3. Dokunulan ekranlar: 2.0, 3.0, 6.0, 7.0, 7.1, 8.0, 8.1, 9.0, 10.0. Main'in sha'sıyla derle, aynı bağlantılara yayımla (kaynak bandı kuralıyla).
