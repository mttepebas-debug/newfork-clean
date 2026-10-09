# A — Availability: açık backlog ve prototip farkları (EKRAN-04, 2026-10-06, b5fabb27)

## Özet
- **Ne zaman ölçüldü:** `origin/main` `b5fabb27` üzerinde, bilgisayar yeniden başladıktan sonra tazelendi. Keşif ilk kez `9e390950`'da başlamıştı. İkisi arasında `apps/` ve `packages/` altında hiçbir dosya değişmedi (`git diff --stat 9e390950 origin/main`); bu yüzden kod ölçümleri ikisinde de geçerli. Yerel DB'nin son migration'ı `20261007130000`. DB'de yalnız SELECT çalıştı, test koşulmadı.
- **Sayılar:**
  - Ekranın içinde 7 açık backlog maddesi var: 5'i geçerli, 1'i değişmiş, 1'i ölçülmedi.
  - Sınırda 14 madde var. Bugünkü tazelik turu bunların 4'ünü zaten kapatmış ya da bayat bulmuş.
- **En ağır bulgu (YENİ, orta önem):** Availability tablosu müdürleri, admin'leri ve owner'ı da listeliyor ve onları her zaman "Not submitted" sayıyor. Oysa KARARLAR M13 ve M14'e göre müsaitliği yalnız employee girer; terfide kişinin haftası silinir.
  - Örnek: Kadıköy müdürü Ayşe, owner ve admin, "Not submitted" sekmesinde sonsuza kadar duruyor. Bu üç kişi ürünün içinden hafta giremez.
  - Yerel DB'de bu durumdaki arşivsiz kişi sayısı: 598 manager, 388 owner ve 263 admin kaydı listeye giriyor; hiçbirinin haftası yok.
- **KARARLAR'da olup kodda olmayan kurallar:**
  - Yukarıdaki M13/M14 çelişkisi.
  - Yönetici notunun ekrandaki adı. Kural "Manager note" diyor; not yazılan çekmece "Manager reminders" diyor.
  - Notun altındaki "Last edited by" satırı, notun yazıldığı çekmecede yok.
  - Sayfalama: 25 / 50 / 100.
- **Prototip (P2 AV1–AV12 ve PHONE-MGR A1/A2/K7):** 3 taşı, 3 bırak, 1 Mert sorusu. Telefonda Availability kart satırı mı olacak, tablo mu? 2026-10-05 kart satırı kararı Availability'yi saymıyor.

## Ekranın sınırı
- **İçeride:**
  - Sol menü → Availability (`/app/<workspace>/availability`, `App.tsx:388-394`; yalnız owner, admin ve manager girer, izin `availability.read`).
  - Bu ekranın okuma ucu: `GET …/availability/weekly/team` → `weekly_team_read_service`.
  - Durum sekmeleri, lokasyon süzgeci, arama, sıralama ve boş hâl.
  - Bir ada ya da güne tıklayınca açılan çekmece (bağlantı kısmı).
- **Sınırda:**
  - Açılan Employees çekmecesinin Availability bölümü (yönetici notunun yazıldığı yer, `WeeklyPreferencesForm.tsx`). Bu Employees ekranının parçası.
  - Çalışanın kendi ekranı Employee Hub → My Availability (ekran 14).
  - Onboarding'deki müsaitlik adımı.
  - Settings → Scheduling → Availability ayarı (giriş modu; M8'e göre Warn / Block ayarı yok).
  - Schedule'daki müsaitlik işareti, Warn kutusu ve not kartı.
  - Rol değişince müsaitliği silen veritabanı tetikleyicisi.
- **Dışarıda:** Schedule ızgarası, takas ve cover akışları, bildirim gelen kutusu.

## 1. Açık backlog maddeleri (tazelik hükmüyle)

Teknik adlar:
- "Okuma ucu": Availability sayfasının veriyi çektiği API adresi.
- "Yetki çekirdeği": kimin neyi görebileceğine tek yerden karar veren veritabanı katmanı.
- "pgTAP": veritabanı testleri.

### İçeride

**Orta**
- **YENİ (leave: medium / do: moderate) — Müdür, admin ve owner listede ve "Not submitted" sayılıyor. Tazelik 2026-10-06 (`b5fabb27`): geçerli.**
  - Kanıt (canlı fonksiyon gövdesi): `weekly_team_read_service` satır 27-35, arşivsiz bütün `employee_profiles` kayıtlarını alıyor; role hiç bakmıyor.
  - Gerçek çağrı (SELECT, salt okunur): "World e2e…782608" workspace'inde listede Ayse Person (manager), Mehmet Person (manager), Olcay Owner (owner) ve Zeynep Person (admin) var, dördü de `submitted=false`.
  - Kişinin ekranda gördüğü: Ayşe "Not submitted"ı açar ve kendini, owner'ı ve admin'i eksik müsaitliği olan kişiler gibi görür. Sağdaki "N employees" sayısı da şişer.
  - Önerilen düzeltme: tabloda yalnız employee rolü olsun. Dayanak: KARARLAR M13 ve M14. Bölüm 4'te Mert'e sorulmak üzere de yazılı. `nf-db` işi; ekran yalnız sayıyı ve listeyi değiştirir.
- **BL-565 (leave: medium / do: moderate) — Okuma ucunun izin kapısı API rotasının kendi içinde. Tazelik: geçerli.**
  - Kanıt: `weekly-preferences-routes.ts:56` `permissions.includes("availability.read")`. Çekirdek arkada `scope_set` ile ayrıca bakıyor (fonksiyon satır 9-15). İzni iki yer soruyor; CLAUDE.md §9'a göre bunlardan biri fazla.
- **BL-787 (leave: medium / do: safe) — Sayfalama yok. Tazelik: geçerli.**
  - Kanıt: `AvailabilityPage.tsx` bütün listeyi tek tabloda çiziyor (satır 242); sayfa numarası ve 25 / 50 / 100 seçimi yok.
  - Mert'in 2026-10-06 kararı Availability'yi adıyla sayıyor. EKRAN-PLANI ekran 4 satırı "bu turda" diyor.
  - Örnek: 80 kişilik zincirde Ayşe 80 satırı tek sayfada kaydırır.
- **OBS-002 (leave: medium / do: moderate) — Müsaitlik kaydı → müdür → Schedule zinciri tarayıcıda hiç denenmedi. Tazelik: geçerli (bu ekran için).**
  - Kanıt: `e2e/` altında `/app/availability` sayfasını açan senaryo yok (grep).
  - `schedule-availability-warning.spec.ts` yalnız Schedule ve Settings tarafını deniyor.
- **BL-599, Availability kısmı (leave: medium / do: moderate) — Telefonda tablo yana kayıyor, sayı kesiliyor. Tazelik: kod geçerli; ekran görüntüsü ölçülmedi.**
  - Kanıt: tablo en az 1030 px (`weekly-team.css:78`), rotada telefon kapısı (`DesktopOnlyRoute`) yok (`App.tsx:388-394`).
  - Prototipteki ölçüm: "4 emp" kesik, tablo 976 px (PHONE-MGR A1).
  - Görüntüyü C raporu alır.

**Düşük**
- **BL-661 (leave: low / do: safe) — "1 employees". Tazelik: geçerli.**
  - Kanıt: `AvailabilityPage.tsx:152` `{employees.length} employees`.
  - Örnek: tek çalışanı olan Kadıköy'ü seçince "1 employees" yazar.
- **BL-262 (leave: medium / do: safe) — Kırmızı pgTAP listesi. Tazelik: değişmiş.**
  - Availability'nin testi `weekly_team_availability` artık CI yeşil listesinde (`ci-green.txt:121`).
  - Açık kalan tek dosya `scheduling_settings_shift_types_rls` (`ci-not-green.txt:3`); o da Settings'in testi.
  - Öneri: maddenin Availability kısmı kapatılsın, kalanı Settings ekranına gitsin.
- **BL-153 (leave: low / do: safe) — Rol değişince notu ve haftayı silen tetikleyici bir yolu kaçırıyor. Tazelik: bugünkü turdaki gibi değişmiş.**
  - Tetikleyicinin adı artık `availability_follows_role`. Yalnız `workspace_memberships`'e bakıyor; çalışan kaydının sonradan bir hesaba bağlanması yolunu görmüyor.
  - Tazelik turu bu maddeyi "dilim: Availability" diye işaretledi.

### Sınırda (kısa)

| Madde | Nerede | Hüküm |
|---|---|---|
| BL-567 (low / moderate) | DB kuralı | geçerli. `employee_weekly_preferences` tablosunda rol kısıtı yok; kısıtlar yalnız pkey, iki check ve iki fk. Kural yalnız tetikleyicide. Bugün employee olmayan kişide hafta sayısı 0 (SELECT). |
| BL-569 (low / safe) | DB kuralı | geçerli, kısmen ölçüldü. `weekly_preference_events` tablosunda kaynağı `manager` olan 60 eski kayıt duruyor (SELECT). Bunların kaçının terfi etmiş kişiye ait olduğu ölçülmedi. |
| BL-568 (low / safe) | Onboarding | ölçülmedi |
| BL-576 (low / safe) | Settings → giriş modu | ölçülmedi |
| BL-572, BL-571, BL-575 | My availability ve onboarding | ölçülmedi (ekran 14) |
| BL-403 | Schedule (Availability tarafı doğru: `AvailabilityPage.tsx:248` pasif) | geçerli (Schedule'ın işi) |
| BL-135 | Schedule notu | bayat (`68c7bd8c`, tazelik turu) |
| BL-570 | Schedule balonu | kapandı (`e4231bfb`) |
| BL-619 | Schedule etiketi | bayat (`4f0a43a0`) |
| BL-579, BL-174, BL-325, BL-574 | Schedule | tazelik turunda geçerli ya da ölçülemedi; Schedule'ın işi |

## 2. KARARLAR'da olup kodda olmayan kurallar

| # | Kural | Kodda | Önem | BL | İşaret |
|---|---|---|---|---|---|
| K1 | M13 / M14: müsaitliği yalnız employee girer, terfide silinir | Liste rolden bağımsız (yukarıda) | orta | YENİ | leave: medium / do: moderate |
| K2 | "Manager note" adı (KARARLAR "Manager note", 2026-09-26) | Çekmece sekmesi ve başlığı "Manager reminders" (`WeeklyPreferencesForm.tsx:220`, `:249`); Schedule not kartı "Manager note" (`ScheduleNoteConfirm.tsx:92`) | düşük, sınırda (çekmece) | YENİ | leave: low / do: safe |
| K3 | Notun altında "Last edited by <ad> · <tarih>" | Yalnız Schedule kartında var. Notun yazıldığı çekmecede yok (`apps/web/src/availability` içinde `edited` / `updated_by` geçmiyor, grep) | düşük, sınırda | YENİ (BL-135'in kalan yarısı) | leave: low / do: safe |
| K4 | Sayfalama 25 / 50 / 100, varsayılan 50 | yok | orta | BL-787 | yukarıda |
| K5 | Kullanıcıya ham sistem metni gösterilmez (Genel) | `AvailabilityPage.tsx:192` `query.error.message`'ı basıyor. Bağlantı koparsa "Failed to fetch", veri şeması tutmazsa zod'un ham JSON'u görünür | düşük | BL-621 ailesi (yeni yer) | leave: low / do: safe |

Uyanlar, kısaca:
- Izgara kuralları: sütun %13 + yedi eşit gün, 76 px yükseklik, yalnız ad, aralık tek satır, en çok üç satır.
- Boş hâl metni.
- Lokasyon süzgeci yalnız kişinin kapsamındaki lokasyonları gösteriyor (fonksiyon satır 17-19, 48).
- Müdür haftayı yazamıyor (M2 düzeltmesi).
- Başlıkta düğme yok.

## 3. Prototip farkları (P2 AV1–AV12, PHONE-MGR)

| Kimlik | Fark | Öneri | Dayanak |
|---|---|---|---|
| AV3 | "1 employee" | **taşı** | BL-661; dil hatası |
| AV11 | Tablo kendi içinde kayıyor, başlık satırı yapışkan | **taşı**, sayfalamayla aynı işte | Employees'te de aynı (P2 L16); KARARLAR "sayfa iskeleti" ve tablo çerçevesi; 50 satırda başlık kaybolmasın |
| PHONE A1 | Sayı sekmelerin altına iniyor, kesilmiyor | **taşı** | BL-599 |
| PHONE K7 | Telefonda başlık 38 px | **bırak** | KARARLAR Genel "telefonda başlık 28" |
| AV12 | Prototipte müdür, owner ve admin için örnek hafta var | **bırak** (prototip verisi) | Gerçek uygulamada bunun tersi bir hata var: K1 |
| Masaüstü panoda süzgeç ve tablo kenarlıksız | prototip kusuru | **bırak** | PHONE-MGR "Yolda bulunanlar" |
| Telefonda kart satırı | Karar Announcements, Notifications, Important Dates ve Settings için verildi; Availability yok | **Mert'e soru** (bölüm 4) | P04 |

AV1, AV2, AV4–AV10 ve PHONE A2 gerçek uygulamayla aynı. Hepsi bugünkü kodda yeniden okundu: `AvailabilityPage.tsx:117-122`, `:130-148`, `:157-185`, `:58-79`, `:245-290`, `:298-305`, `:101-102`.

## 4. Mert'e sorular (taslak, §13 şablonu)

1. **Availability'de müdür, admin ve owner görünsün mü?**
   - Bugün: sol menü → Availability → "Not submitted" sekmesinde Ayşe (Kadıköy müdürü), owner ve admin "—" ile duruyor ve sayıya giriyor.
   - (Önerilen) Yalnız employee görünsün. Liste ve sayı yalnız müsaitlik girebilen kişileri gösterir. Dayanak: KARARLAR M13, M14.
   - Görünsün, ama sayıya ve "Not submitted"a girmesin.
   - Bugünkü gibi kalsın.
   - Not: K1 kuralla birebir örtüştüğü için koordinatör de karar verebilir (§13).
2. **Telefonda Availability nasıl görünsün?**
   - Bugün: 390 px'te 1030 px'lik tablo yana kayıyor.
   - Görsel karar olduğu için gerçek ekranda 2–3 varyant gösterilmeli (P04):
     - kart satırı (kişi ve müsait olmadığı günler),
     - yana kayan tablo,
     - telefonda kapalı ("Available on a computer", Schedule gibi).
3. **Not'un adı ne olsun?** Çekmecedeki "Manager reminders" mı, kuraldaki "Manager note" mı? (K2.) Öneri: "Manager note". Dayanak: KARARLAR 2026-09-26 ve Schedule kartı. Kural birebir kapsadığı için koordinatör de verebilir.

## 5. Kanıtta kullanılan komutlar
- `git fetch` → `origin/main` = `b5fabb27`. `git diff --stat 9e390950 origin/main -- apps packages` boş.
- Canlı gövde: `pg_get_functiondef` ile `weekly_team_read_service` (54 satır).
- Rol dağılımı (arşivsiz çalışan kaydı başına): employee 991 (168'inin haftası var), manager 598, owner 388, admin 263, üyeliği olmayan 90 (bu dört grupta hafta 0).
- Salt okunur işlemde `weekly_team_read_service` çağrısı ("World e2e1790417782608"): 7 satır, bunların 4'ü employee değil.
- `pg_constraint` ve `pg_trigger` (BL-567): tabloda rol kısıtı yok, tek tetikleyici `availability_follows_role`.
- `weekly_preference_events` kaynağı `manager` olan 60 satır (BL-569).
- `ci-green.txt:121`, `ci-not-green.txt:3` (BL-262).
- Prototip: `newfork-prototype/KANONIK.md`, `proto-audit/P2.md:164-175`, `proto-audit/PHONE-MGR.md:27,53-54`. Prototipe yazılmadı.
- Tazelik kaynağı: `docs/plan/research/tazelik-2026-10-06/OZET.md`, `schedule-eski.md`, `employees-eski.md`. Availability'nin kendi maddeleri orada yoktu; yukarıdakiler bu oturumda ölçüldü.

Yazılan dosya yok. Rapor bu mesajdır. Kesintiden önce yarım kalan DB çağrısı arka planda boş döndü. Aynı sorgu yeniden koşturuldu ve sonuç yukarıda.
