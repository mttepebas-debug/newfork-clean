# EKRAN-04 Availability — keşif özeti

Keşif 2026-10-06 (gece, `nf-planlama` oturumu; koordinatörün GECE-3 görevi). Ölçüm `origin/main` `b5fabb27` / `75ba8cc5` (arada `apps/ packages/` değişmedi). Raporlar: `A-backlog-prototip.md`, `B-guvenlik.md`, `D-kod-davranis.md` (ajanların son mesajı, aynen). **`C-gorsel.md` yok:** görsel QA (geliştirme sunucusu + tarayıcı) bilgisayarda "aynı anda tek ağır iş" kuralı (Mert, 2026-10-06) yüzünden sona bırakıldı; makine boşalınca koşar ve buraya eklenir.

- **Ekran:** sol menü → Availability (`/app/<workspace>/availability`): durum sekmeleri, lokasyon süzgeci, arama, haftalık tablo; satırdan açılan Employees çekmecesinin Availability bölümü (Manager note); Settings → Scheduling'deki giriş modu. Owner, admin, müdür.
- **Sınırda:** Employee Hub → My availability (ekran 14), onboarding adımı, Schedule'ın müsaitlik işareti / uyarı kutusu, takas rızası.
- **Güvenlik:** temiz. Kritik / yüksek / orta yok; tenant ve lokasyon (M2) izolasyonu 8.000+ müdür–kişi çiftinde ölçüldü; müdür çalışanın haftasını yazamıyor; not çalışana ve okuyamayana ulaşmıyor.

## 1. Tek liste (önem sırasıyla)

| # | Bulgu | Nerede / örnek | Kaynak | Backlog | İşaret |
|---|---|---|---|---|---|
| E4-01 | **Müdür, admin ve owner listede ve hep "Not submitted"** — M13/M14'e göre müsaitliği yalnız employee girer. Bir pgTAP bu davranışı kilitliyor (`weekly_team_availability.test.sql:58`). | Ayşe "Not submitted"ı açınca müdür Can'ı ve owner Mert'i kovalar; "N employees" şişer. Yerelde bir workspace'te 36 kişinin 17'si | A K1, D O1 | YENİ | leave: medium / do: moderate |
| E4-02 | **Değişikliksiz kayıt bütün yöneticilere bildirim gönderiyor** ("Week confirmed.") | Ali Salı'yı işaretleyip geri alır, Save → Ayşe, Can, admin, owner bildirim alır. Yerelde 254 bildirimin 28'i | D O2 | YENİ | leave: medium / do: safe |
| E4-03 | **Müsaitlik / yayın kaydı sürerken izin talebi ve vardiya tipi kaydı beklemeden reddediliyor** (workspace kilidi, tek deneme) | Ayşe yayınlarken Ali izin talebi gönderir → "The schedule is being updated…" | D O3 | YENİ (sınırda: Requests, Schedule) | leave: medium / do: moderate |
| E4-04 | **Yönetici Employee view → My availability'de açıklamasız kilitli form görüyor** | Can kendi çalışan görünümünde kapalı alanlar ve Save görür, nedeni yazmaz | D O4 | YENİ | leave: medium / do: safe |
| E4-05 | Sayfalama yok (25 / 50 / 100) | 80 kişilik zincirde tek sayfa | A, D | BL-787 | leave: medium / do: safe |
| E4-06 | Okuma ucunun izin kapısı rotada da (`weekly-preferences-routes.ts:56`); ekrana ham "Team availability access required." çıkıyor | Rolü değişen müdür sayfayı yenileyince | A, B D4, D D1 | BL-565 | leave: medium / do: moderate |
| E4-07 | Telefonda tablo yana kayıyor (1030 px), sayı kesiliyor | 390 px | A | BL-599 (Availability kısmı) | leave: medium / do: moderate |
| E4-08 | Availability ekranı için e2e yok ("çalışan kaydeder → yönetici bildirim → çekmece" zinciri) | — | A, D | OBS-002 | leave: medium / do: moderate |
| E4-09 | Tek lokasyonu arşivlenen kişi owner'ın listesinden de kayboluyor | Beşiktaş arşivlenir, Emre listede yok | B D3 | YENİ | leave: low / do: safe |
| E4-10 | Davetli (kabul etmemiş) admin / müdür adayına not yazılabiliyor | Selin admin davetli, Ayşe not yazar | B D2 | BL-773 (müsaitlik yüzü) | leave: low / do: risky |
| E4-11 | Terfide notun eski kopyaları geçmiş / komut tablosunda kalıyor | Ali müdür olunca "School mornings" metni kalır | B D1, D D3 | BL-569 | leave: low / do: safe |
| E4-12 | Terfiyle kayıt yarışı müdüre hafta bırakabilir (DB kısıtı yok) | — | B D6 | BL-567 | leave: low / do: moderate |
| E4-13 | Çalışan kaydı sonradan müdür hesabına bağlanınca terfi tetikleyicisi çalışmıyor | — | A, B, D D7 | BL-153 | leave: low / do: safe |
| E4-14 | 409'dan sonra form kendini yenilemiyor; aynı Save yine reddediliyor, "Reload" düğmesi yok | Ayşe ve Can aynı notu düzenler | D D2 | YENİ | leave: low / do: safe |
| E4-15 | Ham hata cümleleri (zod dökümü, "Idempotency key…", "Availability storage is not configured") | Sayfa kutusu, çekmece, Settings paneli | A K5, D D1 | BL-621 + YENİ | leave: low / do: safe |
| E4-16 | Notun adı tutarsız: kural "Manager note", çekmece "Manager reminders"; "Last edited by" çekmecede yok | Employees çekmecesi → Availability | A K2, K3 | YENİ | leave: low / do: safe |
| E4-17 | Mod değişikliği bildirimi haftası olmayana da "Your saved week was converted" diyor | Yeni garson Deniz | D D4 | YENİ | leave: low / do: safe |
| E4-18 | "1 employees" | Kadıköy tek kişi | A | BL-661 | leave: low / do: safe |
| E4-19 | Uyarı kutusu ucu üye olmayana 404 yerine 403 | sınırda: Schedule | B D5 | YENİ | leave: low / do: safe |
| E4-20 | KARARLAR satır 69, 72, 73 M13'ten önceden kalma (müdürün müsaitliği ve Team availability'de not) | — | D D5 | YENİ (kayıt) | leave: low / do: safe |
| E4-21 | Geliştirme önizleme sayfası (`availability-preview.html`) duruyor | yalnız yerel | D D6 | YENİ | leave: low / do: safe |
| E4-22 | BL-262'nin Availability kısmı kapandı (`weekly_team_availability` yeşil listede); kalan Settings'in | — | A | BL-262 (değişmiş) | — |

## 2. Prototipten taşı / bırak (A §3)
- **Taşı:** AV3 "1 employee" (BL-661); AV11 tablo kendi içinde kayar, başlık yapışkan (sayfalamayla aynı işte); PHONE A1 sayı kesilmez (BL-599).
- **Bırak:** PHONE K7 (telefonda başlık 28, KARARLAR Genel); AV12 prototipteki yönetici örnek haftaları (gerçek uygulamada tersi hata: E4-01); masaüstü panodaki kenarlıksız tablo (prototip kusuru).
- **Mert'e (görsel):** telefonda Availability (aşağıda S2).
- AV1, AV2, AV4–AV10, PHONE A2 uygulamayla aynı.

## 3. Koordinatör kararı önerileri (KARARLAR / ILKELER birebir cevaplıyor)
- **K1 — E4-01:** liste yalnız employee rolünü gösterir; müdür, admin, owner listeden ve sayıdan çıkar; pgTAP `:58` bugünkü kurala göre yeniden yazılır. Dayanak: KARARLAR M13, M14; ILKELER P01 (eski kurala tolerans yazılmaz). (A ve D ikisi de "Mert'e sorulabilir" dedi; kural birebir kapsıyor.)
- **K2 — E4-16:** adı "Manager note"; çekmecede de "Last edited by <ad> · <tarih>". Dayanak: KARARLAR "Manager note" (2026-09-26) + Schedule kartı.
- **K3 — E4-02:** değişikliksiz yeniden kayıt bildirim üretmez; ilk kayıt ("Week confirmed") üretir. Dayanak: ILKELER A anti-hedef "bildirim gürültüsü", P07.
- **K4 — E4-17:** mod bildirimi haftası olmayana "Check your availability" der, "converted" demez. Dayanak: P21 (tek mesaj, doğru söz).
- **K5 — E4-20:** KARARLAR 69, 72, 73 M13/M14'e göre düzeltilir (koordinatörün dosyası).
- **K6 — E4-09:** arşivli lokasyondaki atama "lokasyonsuz" sayılır, kişi owner listesinde görünür. Dayanak: KARARLAR "arşivli lokasyon hiçbir yerde sayılmaz" (`20261003000000`).

## 4. Mert'e sorulacaklar (CLAUDE.md §13, ham; sabah)

**S1 — Yönetici kendi Employee view'unda My availability'yi nasıl görsün?**
- **Bugün:** Employee Hub → My availability → müdür Can kapalı alanlar ve kapalı Save görür, nedeni yazmaz (E4-04).
- **Örnek:** Can çalışan görünümüne geçer, "Weekly availability · Not submitted".
- **(a) Sekme yöneticide hiç görünmez (Önerilen).** Müsaitliği yalnız employee girdiği için yöneticinin görünümünde boş ve kilitli bir form kalmaz.
  `Dayanak: KARARLAR M13 (müsaitliği yalnız employee girer); ILKELER P20 (gereksiz bölüm yok)`
- (b) Sekme görünür, üstte tek cümle: "Availability is entered by employees."
- (c) Bugünkü gibi kalsın.

**S2 — Telefonda Availability nasıl görünsün?** (görsel; P04 — yazıyla değil, gerçek ekranda 2–3 varyant)
- **Bugün:** 390 px'te 1030 px'lik tablo yana kayıyor, "4 emp" kesiliyor.
- Varyantlar: kart satırı (kişi + müsait olmadığı günler) · yana kayan tablo, yapışkan ad sütunu · telefonda kapalı ("Available on a computer", Schedule gibi). Liste sayfalarının telefon kararı (kart satırı) Announcements, Notifications, Important Dates, Settings için verildi; Availability sayılmadı.

**S3 — Vardiya tipinin saati değişince işaretli müsaitlik sessizce kaysın mı?** (D §5; P09)
- **Bugün:** shift type modunda Ali "Dinner"ı işaretledi; owner Dinner'ı 17–22'den 16–23'e çekerse Ali artık 16–23 müsait değil sayılır, kimseye haber gitmez (kod bilerek böyle).
- **(a) Kayar, ama Ali'ye "Dinner hours changed; check your availability" bildirimi gider (Önerilen).**
  `Dayanak: ILKELER P09 (veri sessizce değişmez; kullanıcı uyarılır)`
- (b) Bugünkü gibi sessiz kayar.
- (c) Ali'nin işareti eski saatte (17–22) sabit kalır.
- Not: yerelde shift type modunda workspace yok; bugün kimseyi etkilemiyor.

(E4-03 kilit sıklığı ölçülmedi; ölçüm sonucu gelmeden soru değil.)

## 5. Sınırda (başka ekranın işi)
- **Schedule:** `weekly_publication_decisions`'taki "Previously accepted schedule conflict retained." cümlesi (M9); BL-579; BL-174; `schedule_availability_overrides` adı (D §5).
- **Requests / Schedule:** E4-03 kilidinin izin talebine etkisi.
- **Employee Hub (14):** BL-572, BL-571, BL-575; **Onboarding:** BL-568 (653 eski adım), BL-576.
- **Employees:** çekmece sormadan kapanıyor, notlar 7 × 1000 karaktere uzayabiliyor — P26 / K7 gerilimi (karar sorusu, D §5).

## 6. Kapanış durumu
Açık: C (görsel QA) makine boşalınca; sonra Mert'in S1–S3 seçimleri, koordinatörün K1–K6 kararları, görev dosyası ve BL numaraları (E4-xx YENİ'leri).
