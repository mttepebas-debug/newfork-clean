# D — Availability kod ve davranış (EKRAN-04, 2026-10-06, 75ba8cc5)

## Özet (en çok 8 satır)
- **Yüksek önemde sorun bulunmadı.** Kurallar çoğunlukla kodda: müsaitlik hiçbir yazmayı engellemiyor (M8), yönetici çalışanın haftasını yazamıyor (M2), terfide hafta ve not siliniyor (M14), mod değişince haftalar kayıpsız çevriliyor ve herkese bildirim gidiyor (M4), Settings'te müsaitlik satırı yok.
- **Orta önemde dört sorun var:**
  1. Team availability listesi müdür, admin ve owner'ı da gösteriyor. Bu kişiler müsaitlik giremiyor, yine de hep "Not submitted" sayılıyorlar. Bir veritabanı testi (pgTAP) bu davranışı doğru diye kilitliyor.
  2. Çalışan hiçbir şeyi değiştirmeden Save'e basınca bütün yöneticilere "Week confirmed" bildirimi gidiyor. Yerelde 28 tane var, hepsi değişikliksiz kayıt.
  3. Bir müsaitlik ya da Schedule kaydı sürerken aynı workspace'te izin talebi veya vardiya tipi kaydı beklemeden reddediliyor.
  4. Müdür "Employee view" → My availability'ye girince açıklamasız, kilitli bir form görüyor.
- **Düşük önemde:** ekrana çıkan ham hata cümleleri; çakışmadan (409) sonra formun kendini yenilememesi; terfide notun eski kopyalarının kalması (BL-569); KARARLAR'da M13'ten önceden kalma, artık geçersiz satırlar; bir geliştirme önizleme sayfası.
- **Yöntem:** kod okuma (web → API → veritabanı) ve yerel veritabanında yalnız SELECT. Yerel veritabanı main ile aynı sürümde (son migration 20261007130000). Test koşturulmadı, tarayıcı açılmadı.

## Ekranın sınırı
- **İçeride:**
  - Availability ekranı (`/app/availability`, `AvailabilityPage.tsx`).
  - Bu ekrandan açılan Employees çekmecesinin Availability bölümü (`WeeklyPreferencesPanel`, `audience="manager"`).
  - Settings → Scheduling'deki müsaitlik giriş modu paneli (`WeeklyPreferenceSettings.tsx`).
  - Employee Hub → My availability (çalışanın aynı kaydı yazdığı yer).
  - API: `/v1/workspaces/:w/availability/weekly*` ve `/shift-assessment`.
  - Veritabanı: `weekly_team_read_service`, `weekly_preferences_read/save_service`, `weekly_preference_settings_*`, `weekly_preference_convert`, `assess_weekly_shift_availability`, `availability_follows_role`.
- **Sınırda:** Schedule'ın uyarı kutusu, yayın öncesi kontrol ve yayın yazma tetikleyicisi (`guard_schedule_assignment_availability`), takas ve pickup'ta rıza, izin taleplerinin kilidi.
- **Dışarıda:** Schedule ızgarasının görünümü, Requests ekranı, takas akışının kendisi.

## Akış haritası
- **Liste.** `AvailabilityPage.tsx` → `loadWeeklyTeam` (`availability-data.ts:72`) → `GET …/availability/weekly/team` (`weekly-preferences-routes.ts:39`). Rota kendi içinde `permissions.includes("availability.read")` diye soruyor (BL-565). Sonra `weekly_team_read_service`.
  - Lokasyon, arama ve Submitted / Not submitted süzgeçleri tarayıcıda çalışıyor.
  - Sıralama yalnız ada göre.
  - Sayfalama yok (BL-787).
- **Çekmece.** Bir kişiye ya da güne tıklanınca `EmployeeDrawer` → `DrawerAvailability` (`EmployeeDrawer.tsx:1646`) → `GET …/weekly?employee_id=` → `weekly_preferences_read_service`.
  - "Employee availability" sekmesi her zaman salt okunur (M2).
  - "Manager reminders" sekmesi yazılabilir: aç/kapa anahtarı, hafta, 7 günlük not. Bu sekme yalnız employee rolündeki kişi için var.
- **Kaydetme.** `POST …/weekly` → `weekly_preferences_save_service`. Sırası:
  - workspace kilidi;
  - yeniden yetki kontrolü;
  - aynı isteğin tekrarı kontrolü;
  - `validate_weekly_preference_command` (sürüm, ayar sürümü, mod);
  - satırın yazılması ve geçmiş kaydı (`weekly_preference_events`);
  - çalışan kaydettiyse `availability.weekly_updated` bildirimi. Alıcılar `availability.team_read` ile seçiliyor (KARARLAR satır 72'ye uygun).
- **Mod değişikliği.** Settings → Scheduling → `weekly_preference_settings_save_service`. Bütün haftalar ve notlar çevriliyor, bütün employee'lere "Check your availability" bildirimi gidiyor (M4).
- **Schedule ile sınır.** `assess_weekly_shift_availability`:
  - çalışanın işareti her zaman "warn" ve çakışma sayılmıyor (M8);
  - not ayrı bir "note" kodu (M12);
  - onaylı izin ayara göre (kesin engel);
  - kural, vardiyanın lokasyonunun bugünkü saat diliminde yorumlanıyor; yaz saati geçişi ayrıca ele alınıyor.

## 1. Bulgular (önem sırasıyla)

### Orta

**O1. Team availability'de müdür, admin ve owner listeleniyor ve hep "Not submitted" görünüyor.**
- **Ekranda:** Availability → tablo; üstteki "Not submitted" süzgeci; satıra tıklanınca açılan çekmece.
- **Örnek:**
  - Kadıköy müdürü Ayşe "Not submitted" süzgecini açıyor. Listede müdür Can ve owner Mert de var.
  - İkisi M13'e göre müsaitlik giremez. M14'e göre girmiş olsalar da terfide silinirdi.
  - Can'ın çekmecesi "Not submitted · Available all week" diyor. Bu, gerçekte "kaydı yok" anlamında.
  - Ayşe yanlışlıkla Can'ı müsaitlik girmesi için kovalıyor. "N employees" sayacı da şişiyor.
- **Kanıt:**
  - `weekly_team_read_service` (son tanım `20260925173926_schedule_asks_the_core.sql:2070`) kişi listesini rol süzgeci olmadan kuruyor.
  - SELECT, "World e2e…" workspace'i (`ca7f9056…`), owner adına: 36 kişinin 15'i manager, 1'i admin, 1'i owner. Bu 17 kişinin hepsi "submitted=false".
  - Test bu davranışı kilitliyor: `supabase/tests/weekly_team_availability.test.sql:58` ("…their own record included", `manager_record`).
  - KARARLAR satır 73 ("Ayşe… Can'ın… müsaitliğini görür") M13'ten önce yazılmış, artık geçersiz.
- **BL:** YENİ. `leave: medium / do: moderate`. Karar notu: employee olmayan kişi listeden tamamen mi çıksın, yoksa "Not required" gibi bir işaretle mi kalsın? M13 ve M14'e göre çıkması doğal. Görünür bir değişiklik olduğu için Mert'e sorulur.

**O2. Hiçbir şey değişmeden yapılan kayıt bütün yöneticilere bildirim gönderiyor.**
- **Ekranda:** Employee Hub → My availability → Save. Bildirim yöneticinin zilinde "Availability updated" olarak çıkıyor.
- **Örnek:** Ali Salı'yı işaretleyip geri alıyor ve Save'e basıyor. Ayşe, Can, admin ve owner "Ali Brown: Weekly availability updated. Week confirmed." bildirimini alıyor.
- **Kanıt:**
  - `weekly_preferences_save_service` (`20261007010000_availability_writes_ask_the_core.sql:381`) `changed_days` boşken de bildirimi sıraya koyuyor ("Week confirmed.").
  - SELECT: `notification_outbox` içinde 254 `availability.weekly_updated` bildiriminin 28'inde değişen gün yok. 28'inin hepsi daha önce kaydedilmiş bir haftanın yeniden kaydı (`before_record.submitted=true`).
  - ILKELER anti-hedef "bildirim gürültüsü" ve P07 ile çelişiyor.
- **BL:** YENİ. `leave: medium / do: safe`. İlk kayıt ("Week confirmed" anlamlı) ile değişikliksiz yeniden kayıt ayrılmalı.

**O3. Müsaitlik ya da Schedule kaydı sürerken izin talebi, iptali ve vardiya tipi kaydı beklemeden reddediliyor.**
- **Ekranda:**
  - Employee Hub → Time Off Requests → gönder;
  - Settings → Shift types → saat değiştir → Save;
  - kırmızı satırda "The schedule is being updated. Your changes were not saved; review and retry."
- **Örnek:** Ayşe büyük bir haftayı yayınlarken, aynı saniyede Ali izin talebi gönderiyor. Ali'nin talebi kaydedilmiyor ve hata görüyor. Aynı şey, Ali müsaitliğini kaydederken owner Dinner'ın saatini değiştirdiğinde de oluyor.
- **Kanıt:**
  - Kaydetme ve Schedule yazma tetikleyicisi bütün workspace'i kilitliyor (`availability_lock_workspace` → `pg_advisory_xact_lock(hashtextextended(w,921))` ve `'availability-publication:'||w`).
  - İzin talepleri, izin dilimleri, vardiya tipleri, lokasyon saat dilimi ve ayarlar aynı kilidi beklemeden, yalnız bir kez denemeyle alıyor (`guard_schedule_availability_input_write`, `pg_try_advisory_xact_lock` → PT409). Tetikleyici listesi `pg_trigger` SELECT'iyle doğrulandı.
  - Kilit yayın süresince tutuluyor.
- **BL:** YENİ. `leave: medium / do: moderate`. Sınırda: Requests ve Schedule. Ne kadar sık olduğu ölçülmedi (aşağıdaki kanıtlanamayanlar listesinde).

**O4. Yönetici "Employee view" → My availability'de açıklamasız, kilitli bir form görüyor.**
- **Ekranda:** Employee Hub → My availability → Availability sekmesi. Bunu gören kişi manager, admin ya da owner.
- **Örnek:** Müdür Can kendi çalışan görünümüne geçiyor. "Weekly availability · Not submitted" görüyor; alanlar ve Save kapalı. Neden kapalı olduğu yazmıyor. "Availability is a preference…" açıklaması ise yine görünüyor.
- **Kanıt:**
  - `EmployeeHubPage.tsx:241` paneli koşulsuz gösteriyor.
  - SELECT: `weekly_preferences_read_service(<müdür>, ca7f9056…, null)` → `can_edit_employee=false`, `submitted=false`. `authz_reason(…,'availability.own')` = `rank`.
  - Formda kapalı olma nedeni metni yok (`WeeklyPreferencesForm.tsx:47-49`, `:77`).
  - M13'ün ekrana yansımamış hâli.
- **BL:** YENİ. `leave: medium / do: safe`. Seçenekler: sekmeyi gizlemek ya da tek cümleyle "Availability is entered by employees." yazmak. Görsel karar Mert'in.

### Düşük

**D1. Ham hata cümleleri ekrana çıkıyor.**
- **Ekranda:**
  - Availability sayfasının kırmızı kutusu (`AvailabilityPage.tsx:192`);
  - çekmecede okuma hatası (`WeeklyPreferencesPanel.tsx:96`);
  - kaydetme hatası (`WeeklyPreferencesForm.tsx:134`);
  - Settings paneli (`WeeklyPreferenceSettings.tsx:63`).
- **Örnek:**
  - Rol değişen bir müdürün sayfası yenilenince API'nin rotada yazdığı "Team availability access required." çıkıyor. Bu cevapta `authz.*` anahtarı yok, bu yüzden ortak "erişim yok" kartı değil ham cümle görünüyor (`weekly-preferences-routes.ts:56-58`).
  - Çekmece okumasında çekirdeğin "Not allowed" cevabı da `isNoAccess` kullanılmadığı için olduğu gibi yazılıyor.
  - Ayrıştırma (zod) hatası çıkarsa JSON dökümü görünür.
  - Geliştirici cümleleri de yolda: "Idempotency key was used for another save", "Include reminder state and seven valid notes", "Availability storage is not configured" (`availability-data.ts:26`).
- **BL:** kısmen BL-565 (rota kapısı) ve BL-621 (zod mesajları). Panel ve Settings kısmı YENİ. `leave: low / do: safe`.

**D2. Çakışmadan (409) sonra form kendini yenilemiyor; aynı Save yine reddediliyor.**
- **Ekranda:** Employees çekmecesi → Manager reminders → Save. "Availability changed. Reload before saving; your draft has not been saved." görünüyor.
- **Örnek:** Ayşe ve Can aynı anda Ali'nin notunu düzenliyor. Can önce kaydediyor. Ayşe'nin Save'i reddediliyor ve tekrar basınca yine reddediliyor. Çıkmak için sayfayı yenilemesi ya da 30 saniye sonra Discard'a basması gerekiyor. Ekranda "Reload" düğmesi yok.
- **Kanıt:**
  - Hata dalında sorgu yenilenmiyor (`WeeklyPreferencesPanel.tsx:73-80`).
  - Form kirliyken yeni modeli almıyor (`WeeklyPreferencesForm.tsx:92-96`).
  - Önbellek süresi 30 sn (`App.tsx:135`).
  - Test (`WeeklyPreferencesPanel.test.tsx:92`) yalnız kaydetme anahtarının yenilendiğini sınıyor. Test metni "Pending requests changed" M5'ten önceden kalma.
- **BL:** YENİ. `leave: low / do: safe`.

**D3. Terfide notun eski kopyaları kalıyor.**
- **Kanıt:**
  - `availability_follows_role` (`20261007010000_…:621`) geçmiş ve komut tablolarında yalnız `source='employee'` satırlarını siliyor.
  - SELECT: employee olmayan kişiler için 4 `weekly_preference_events` ve 4 `weekly_preference_commands` satırı (source `manager`) duruyor. Bunlar 2026-09-26 tarihli, notları boş.
  - Bu tabloları okuyan fonksiyon, politika ya da yetki yok (SELECT: `pg_proc` ve `pg_policies` boş). Yani yalnız yazılan, hiç okunmayan bir geçmiş.
- **BL:** BL-569 (geçerli). `leave: low / do: safe`.

**D4. Mod değişikliği bildirimi haftası olmayan çalışana da "Your saved week was converted" diyor.**
- **Ekranda:** Bildirimler → "Check your availability".
- **Örnek:** Haftasını hiç girmemiş yeni garson Deniz "kaydettiğin hafta çevrildi" okuyor.
- **Kanıt:** `weekly_preference_settings_save_service` (`20261007010000_…:459`). Alıcılar, kaydı olsun olmasın bütün employee'ler (M4 kararı, doğru). Metin ise tek tip.
- **BL:** YENİ. `leave: low / do: safe`.

**D5. KARARLAR'da M13 ve M14'ten önceden kalma, artık geçersiz satırlar.**
- **Satırlar:**
  - satır 72: "Can (Kadıköy müdürü) güncellerse…";
  - satır 73: "Ayşe… Can'ın, owner'ın ve admin'lerin müsaitliğini görür";
  - satır 69: "Team availability'deki gizli not". Not artık Team availability sayfasında değil, yalnız çekmecede.
- Bu satırlar O1'deki davranışa dayanak gibi okunabilir. Ekran oturumu düzeltmeli (kural: aynı işte düzeltilir).
- **BL:** YENİ (kayıt). `leave: low / do: safe`.

**D6. Geliştirme önizleme sayfası duruyor.**
- **Kanıt:** `apps/web/availability-preview.html` ve `WeeklyPreferencesForm.preview.tsx`. Yayına giden paketin içinde değil (vite yalnız `index.html`'i paketliyor), yalnız yerel geliştirme sunucusunda açılıyor. Son güncelleme `494c8940` (2026-10-04). Ürün bileşenleriyle aynı bakım yükünü taşıyor.
- **BL:** YENİ. `leave: low / do: safe`. Silmek ya da bilerek tutmak kararı.

**D7. Terfi notunun bir yolu açık.**
- Çalışan kaydının (`employee_profiles.user_id`) zaten müdür olan bir hesaba bağlanması tetikleyiciyi çalıştırmıyor.
- **BL:** BL-153 (tazelik 2026-10-06 "değişmiş", yine geçerli). `leave: low / do: safe`.

## 2. Kurala uyduğu doğrulananlar (kısa)
- **M8:** Settings → Conflict handling'de müsaitlik satırı yok. SELECT: `conflict_rules` anahtarları 7, `employee_availability` yok; CHECK kısıtı da izin vermiyor. Müsaitlik ve not "warn", çakışma derecesini yükseltmiyor (`assess_weekly_shift_availability`).
- **M2:** Çekmecede çalışanın haftası salt okunur (`WeeklyPreferencesForm.tsx:151-158`, `readOnly`). Veritabanında `weekly_preference_may_write` yöneticiye `availability.own` yazdırmıyor.
- **M3:** Bir günün bütün tipleri işaretlenince "All day" kendiliğinden açılıyor (`weekly_preference_whole_days`).
- **M4:** Çeviri gece yarısını ve haftanın sonunu (Cumartesi → Pazar) aşan kısmı ertesi güne yazıyor (`weekly_preference_convert`, dakika aralıklı). SELECT: kaydedilmiş hafta ile workspace modu arasında uyuşmazlık 0, geçersiz hafta 0.
- **M5:** Kaydetme bekleyen istek sormuyor (rotadaki yorum ve servis).
- **M14:** SELECT: employee olmayan kişide kendi haftası 0, not satırı 0.
- **Saat dilimi ve hafta sınırı:** kural vardiyanın lokasyon saatinde, yaz saati geçişi bölümlenerek yorumlanıyor (`availability_offset_segments`). Gece vardiyası için önceki gün de taranıyor (`weekly_preference_intersections`, `local_day … -1`).
- **Yarış:** kaydetmede sürüm kontrolü (PT409), ayar sürümü kontrolü, aynı isteğin tekrarına karşı anahtar ve workspace kilidi var. Belirsiz bir kayıt aynı anahtarla yeniden gönderiliyor (`WeeklyPreferencesPanel.tsx:55-63`).
- **Eski sistem:** eski müsaitlik tabloları ve fonksiyonları (`employee_availability*`, `*availability_conflict*`) veritabanında yok (SELECT). Eski API ucu 404 dönüyor (`app.test.ts:2983`). BL-206 kapalı.

## 3. Test boşlukları
- `weekly_team_availability.test.sql:58` müdürün kendi kaydını Team listesinde bekliyor. Bu, M13 ve M14'ten önceki kuralı kilitliyor (O1 düzeltilince yeniden yazılmalı).
- Değişikliksiz yeniden kayıtta bildirim gitmemesini sınayan test yok (O2).
- Employee view'da manager+ için My availability'nin davranışını sınayan web testi yok (O4).
- 409 sonrası kurtulma yolunu sınayan web testi yok. Var olan test anahtarı sınıyor ve test metni eski (D2).
- e2e: Availability ekranı için akış yok. Yalnız `schedule-availability-warning.spec.ts` (Schedule tarafı) ve onboarding var. "Çalışan kaydeder → yönetici bildirim alır → çekmeceden açar" zinciri tarayıcıda hiç sınanmadı (OBS-002).
- `weekly_exchange_changed_terms.test.sql` CI'da kırmızı listede (BL-368). Takas sınırına dokunuyor.

## 4. Sınırda (başka ekranın işi; adıyla bırakılıyor)
- **Schedule:** `weekly_publication_decisions` hâlâ "Previously accepted schedule conflict retained." cümlesini taşıyor. M9 eki bu satırların kaldırılmasını istiyor. Yalnız müsaitlik için mi geçerli, ölçülmedi (Schedule keşfi).
- **Schedule:** onaylı izin üstündeki yayınlanmış vardiyada hem kırmızı hem "!" görünüyor (BL-579, geçerli).
- **Requests ve Schedule:** O3'teki kilidin izin talebine etkisi.
- **Schedule:** yayın tetikleyicisi önceki yayında aynı vardiyayı bulunca değerlendirme yapmıyor (BL-174, geçerli).

## 5. Kanıtlanamayanlar (ayrı liste)
- **O3'ün sıklığı.** Kilit kodda kanıtlı, ama gerçek yükte kaç kez çarpıştığı ölçülmedi. Yayının kilidi kaç saniye tuttuğu bilinmiyor.
- **Vardiya tipinin saati değişince haftanın sessizce kayması.** Shift type modunda Ali "Dinner"ı işaretlediyse ve owner Dinner'ı 17–22'den 16–23'e çekerse, Ali artık 16–23 arası müsait değil sayılıyor. Kimseye haber gitmiyor. Kod bunu bilerek yapıyor ("A picked type means the hours … the live type", `weekly_preference_convert`). Bunun istenen davranış mı (P09 açısından) olduğu karar sorusu. Yerelde shift type modunda workspace yok (SELECT: seçili tip 0), canlı örnek yok.
- **Override (onay kaydı) tablosu.** Müsaitlik artık onay istemediği hâlde tablo `schedule_availability_overrides` adını taşıyor. Yerelde yalnız 1 satır var (2026-09-22). Diğer "confirm" kuralları (kapalı gün, yol, dinlenme) aynı mekanizmayı kullanıyor, yani ölü değil. Adı yanıltıcı. Ölü olup olmadığı Schedule akışı koşturulmadan söylenemez.
- **Çekmecede not yazılırken sormadan kapanma.** Çekmece sormadan kapanıyor (K7, P26 "Employees çekmecesi sormaz"). Ama notlar 7 × 1000 karaktere kadar uzayabiliyor. P26'nın "uzun yazı varsa sor" kısmıyla K7 burada çatışabilir. Karar sorusu, kod hatası değil.
- **Çok lokasyonlu ve farklı saat dilimli çalışan.** "Salı 18:00 sonrası" kuralı her lokasyonun kendi saatinde yorumlanıyor. Bu doğru görünüyor, ama bu durum KARARLAR'da yazılı değil.
