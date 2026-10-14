# Availability — spec ve plan (taslak, 2026-10-13)

Kaynak: Mert 2026-10-13. Thread'deki istek, çekmece kartında "Yalnız görsün" seçimi ve "sadece ! işareti ile warning verir… onay bile gerektirmez" mesajı. Keşif notu: `1-kesif.md`.

## Hedef
Availability her ekranda aynı şeyi söylesin: **çalışanın tercihi; garanti değil; programa yazılırsan vardiya senin sorumluluğunda.** Müdür bunu görür ve uyarı alır, ama hiçbir yerde onay vermek ya da durmak zorunda kalmaz.

## Kurallar (spec)
1. **Kim girer.** Yalnız çalışan (employee rolü), iki yerde, aynı haftalık tabloyla:
   - onboarding'deki "availability" adımı (isteğe bağlı, "Skip for now");
   - Employee Hub → My Availability.
2. **Müdür ne görür.**
   - Employees → çekmece → Availability: çalışanın haftası yalnız okunur. Müdür yalnız kendi notlarını yazar; çalışan bu notları görmez. (Mert 2026-10-13, kart: "Yalnız görsün".)
   - Sol menü → Availability: ekibin haftalık tablosu.
3. **Schedule (düzenleme modu).**
   - Müsait olmayan hücrede ve o hücreye konmuş vardiya kartında turuncu "!" görünür. Çakışma sayılmaz; taslağı, yayını ve takası durdurmaz.
   - Vardiya müsait olmayana atanınca kısa bir uyarı mesajı çıkar, ekranın altında birkaç saniye kalır. Vardiya hemen konur; "Schedule this shift anyway?" kutusu çıkmaz.
   - Bu kural her atama yolu için geçerli: pencereyle ekleme ya da düzenleme, sürükle-bırak, kopyala-yapıştır, takas onayı.
   - "!" yalnız availability için kullanılır. İzin ya da dinlenme süresi gibi başka kurallar kendi mesajlarını gösterir.
4. **Yayın öncesi liste.** "N people are scheduled while unavailable" notu bilgi olarak kalır, onay kutusu yok (bugünkü gibi).
5. **Çalışanın gördüğü.** Kendi programında, müsait değilim dediği saate konmuş vardiyada küçük bir etiket olur: "You marked this time unavailable". Bu yeni bir bildirim değildir; yalnız görünür bir bilgidir.
6. **Tek ad, tek cümle.**
   - Ekranda her yerde "Availability". Müdürün kaydının adı "Manager notes" olur ("reminders" kalkar).
   - Ortak açıklama: "Availability is a preference, not a guarantee. If you're scheduled, the shift is yours: swap it, give it up, or request time off."
   - Onboarding'deki "Your manager builds the schedule around it." cümlesi bu açıklamayla değişir.
   - Availability sayfasındaki "identify coverage gaps" sözü kalkar, çünkü böyle bir hesap yok.

## Değişmeyenler (eski kararlar)
- Tek haftalık tablo, tarih bazlı değil.
- Yalnız employee rolü girer.
- Onaylı izin her zaman engeldir (kırmızı); availability turuncudur.
- Turuncu işaretler kişi başına açılıp kapanabilir.
- Takasta müsait olmayan kişi listede kalır.
- Veritabanı zaten engellemiyor; değişiklik ekranda.

## Benim varsayılanım (itiraz edersen değişir)
- Auto-fill müsait olmayan kişiyi seçmemeye devam eder. Bu bir engel değil, otomatiğin kibarlığı; müdür elle koyabilir.
- Müdürün kendi notu ("Manager notes") vardiya konunca hücrenin altında not kartı olarak görünmeye devam eder. Onu müdür kendisi yazdığı için bir hatırlatma sayılır.

## Bitti ölçütü
- Hiçbir atama yolunda availability yüzünden onay sorulmuyor (Playwright: pencere, sürükle, yapıştır).
- Her atamada tek bir kısa uyarı mesajı çıkıyor; vardiya kaydedilmiş oluyor.
- "!" yalnız availability için çıkıyor (birim test).
- Dört ekranda aynı ad ve aynı açıklama var (onboarding, My Availability, çekmece, Availability sayfası).
- Çalışanın programında etiket görünüyor (masaüstü 1440, telefon 390).
- Mevcut testler gevşetilmeden güncelleniyor; KARARLAR'daki Müsaitlik maddesi (her yazışta kutu) yeni kuralla değişiyor.

## Plan
1. **Mockup'lar** (Original + yeni hâl, gerçek ekrandan). Yer: `/mnt/project-files/pages/gorsel-kararlar/gelen/availability-tercih/`.
   a. Schedule: atamada kutu yerine kısa mesaj; hücre ve kart "!".
   b. Çalışanın programındaki etiket (iki görünüm: chip ya da satır).
   c. Onboarding, My Availability, çekmece ve Availability sayfasında yeni metinler.
2. Mert mockup'ları onaylayıp "kodla" deyince kod, sırayla:
   a. Schedule atama yolları: kutuyu kaldır, mesajı ekle, "!"'i yalnız availability'ye bağla.
   b. Metinler ve adlar (dört ekran, bildirim metni dahil).
   c. Çalışan programındaki etiket.
   d. Testler (vitest + e2e güncellemesi), 1440/390 görüntüler, PAGES notları, KARARLAR metni koordinatöre.
3. Sınıf: incelemeli, çünkü birden çok ekranı ve paylaşılan bileşenleri değiştiriyor. Migration gerekmiyor; olursa ayrıca söylenecek.

## Seçilen tasarım: 4 · Day by day (Mert 2026-10-13 14:43Z)
Kaynak: `/mnt/project-files/pages/gorsel-kararlar/gelen/availability-tercih/index.html` (sürüm 4). Schedule kuralı yukarıdaki gibi: yalnız turuncu "!", onaysız kısa uyarı + Undo.

### Ekranlar
- **Çalışan (My Availability + onboarding, aynı bileşen):** solda 7 gün listesi (nokta + durum), sağda seçili gün: üç büyük seçenek (Available / Some hours / Unavailable). "Some hours"da iki uçlu saat kaydırıcısı + tam saat kutuları + "Add another time". Shift types modunda kaydırıcı yerine 4 vardiya kartı. Altta tek cümle ("On Fridays you'd rather not work after 6 PM.") ve "Same for other days" gün düğmeleri. Telefonda önce gün listesi, dokununca günün sayfası (Week ‹ › gezinme).
- **Çekmece (müdür, yalnız okur):** okuma çubuğu + tek cümle özet + 7 gün kutucuğu (telefonda alt alta). "Manager notes" sekmesi bugünkü işleviyle kalır, yalnız adı ve görünümü değişir.
- **Availability sayfası (müdür):** solda kişi listesi (7 nokta), sağda seçili kişinin haftası (kutucuklar) ve "Open profile". Telefonda kişi listesi → kişinin sayfası.
- **Schedule ve çalışanın programı:** spec'teki gibi.

### Kod sırası (üç parça, her biri ayrı trene)
1. **Schedule:** her atama yolunda kutu yerine kısa uyarı + Undo; "!" yalnız availability; çalışanın programında etiket; dört ekranda ortak ad ve açıklama metni.
   - Hücredeki "Müsait değil" işaretinin görünümü "Vardiya kartı" thread'inden gelecek (Mert 2026-10-13: turuncu renkte 10 yeni taslak istedi). Mert seçene kadar bugünkü "!" değiştirilmez; seçilen tasarım koordinatörden gelince parça 1 onu kullanır.
   - **Seçildi (Mert 2026-10-13 22:41Z, Vardiya kartı thread'i):** 5 "Nokta", yalnız küçük turuncu nokta; adın yanında, kartta ve boş hücre köşesinde. Kaynak ve ölçüler: `/mnt/project-files/pages/gorsel-kararlar/gelen/kart-isaretleri-40/README.md`, `kaynak/marks.ts`. Kartın görselinin sahibi Vardiya kartı thread'i; Koordinatör 22:45Z: işaretin kartta ve hücrede çizimi Vardiya kartı thread'inin; parça 1 yalnız onaysız uyarı, atama yolları ve metinler, işaret çizimine dokunmaz.
2. **Çalışan girişi:** yeni gün-gün bileşeni (masaüstü + telefon, hours + shift types). Eski `WeeklyUnavailableEditor` silinir (ikiz yok).
3. **Müdür okuma:** çekmece kutucukları + Availability sayfası liste/detay.
Sınıf: incelemeli (birden çok ekran, paylaşılan bileşen). Migration beklenmiyor; veri modeli (haftalık tablo, input_mode, manager kaydı) aynı kalır.

### Bitti ölçütü (eklenen)
- Gün-gün bileşeni: klavyeyle tam kullanılır (gün listesi, seçenekler radio, kaydırıcı uçları ← → 30 dk), WCAG AA, odak görünür.
- Kaydedilen hafta bugünkü API şekliyle aynı (vitest: kaydırıcı/kutu/kopya → aynı `WeeklyPreferenceSave`).
- 1440 ve 390 görüntüleri her parça için; e2e (Playwright) PC thread'inde.
