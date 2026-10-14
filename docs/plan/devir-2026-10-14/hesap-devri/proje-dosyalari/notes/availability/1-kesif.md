# Availability — keşif (2026-10-13)

Mert'in isteği: availability'yi baştan sona UI/UX olarak yeniden kurgulamak. Sıra: keşif → spec → plan → mockup → kod ve test.

## Bugün nerede ne var
| Yer | Kim | Ne yapıyor |
|---|---|---|
| Onboarding → "The hours you can work" | Çalışan | Haftalık tabloyu doldurur. Workspace ayarı zorunlu değilse "Skip for now" ile geçer. Metin: "Your manager builds the schedule around it." |
| Employee Hub → My Availability | Çalışan | Aynı tablo. İki sekme var: Availability ve Time Off Requests. Metin: "Availability is a preference, not a guarantee…" |
| Employees → çekmece → Availability | Müdür | "Employee availability" yalnız okunur. "Manager reminders" müdürün kendi notları ve kuralları; çalışan görmez. |
| Sol menü → Availability (/app/availability) | Müdür, owner | Herkesin haftası tek tabloda; Submitted / Not submitted filtresi. Metin: "identify coverage gaps" (boşluk hesabı yok). |
| Schedule → düzenleme modu | Müdür | Turuncu "!" önce isim kartında, sonra boş hücrede, sonra vardiya kartında. Vardiya koyarken "X is unavailable… Schedule this shift anyway?" kutusu çıkar (Cancel / Place shift). Auto-fill müsait olmayanı atlar. Yayın öncesi listede "N people are scheduled while unavailable" notu çıkar. |
| Settings → Scheduling | Owner | Giriş biçimi (saat aralığı ya da vardiya tipi) ve "Required during onboarding". |
| Takas | Çalışan, müdür | Müsait olmayan kişi listede kalır; kabul ederken uyarılır. Müdür "kendi isteğiyle aldı" notunu görür. |

Veri: çalışan başına tek haftalık kayıt. Gün ya "Available" ya "Unavailable" (bütün gün, bazı saatler ya da bazı vardiya tipleri). Onay akışı yok. Veritabanı availability yüzünden hiçbir şeyi engellemiyor.

## Daha önce kararlaştırılmış olanlar (KARARLAR, "Müsaitlik" bölümü, 2026-10-04 ve sonrası)
- Availability tercih; asla engel ya da çakışma değil. Settings'te "hard block" seçeneği yok (Mert 2026-09-26).
- Çalışana "tercih, garanti değil" denir. Programa yazılırsa vardiyadan o sorumludur; kesin engel için izin (time off) kullanılır. Bugünkü metin kalsın dedin.
- Tek haftalık tablo, tarih bazlı değil.
- Onboarding ve My Availability aynı kaydı yazar. **Müdür çalışanın availability'sini asla değiştiremez; müdürün yalnız kendi notları var** (Mert 2026-10-06).
- Yalnız employee rolündekiler availability girer.
- Turuncu "!" her kişi için açılıp kapanabilir; yayın öncesi listede onay kutusu yok.
- Onaylı izin her zaman engeldir (kırmızı); availability turuncudur.

## Tutarsızlıklar
1. Aynı şeye beş farklı ad: availability, preferences, unavailable, reminders, notes.
2. Birbirini tutmayan sözler: onboarding'de "müdür programı buna göre kurar", My Availability'de "garanti değil", Availability sayfasında "coverage gaps" (böyle bir hesap yok).
3. Veritabanı yalnız uyarıyor ama ekran her vardiya koyuşta onay kutusu soruyor. Auto-fill de müsait olmayanı hiç seçmiyor. İkisi de yumuşak engel gibi çalışıyor.
4. Vardiya kartındaki "shows as unavailable" uyarısı başka kurallarda da (izin, dinlenme süresi) çıkabiliyor; ad ile anlam ayrışmış.
5. İşaretler yalnız düzenleme modunda var; çalışan kendi programında hiçbir işaret görmüyor.

## Açık kalmış eski konular
- Müdür kendi çalışan görünümünde My Availability'yi nasıl görür (öneri: sekme gizli).
- Vardiya tipinin saatleri değişince işaret de kayar mı.
- Telefonda Availability sayfası (varyant yok).
- Çekmece ve My Availability'de işaret rengi kırmızı mı turuncu mu.
- "Skip for now" telefonda iki satıra kayıyor.
