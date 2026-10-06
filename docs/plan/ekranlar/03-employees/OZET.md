# Ekran 3 — Employees: keşif özeti (EKRAN-03, 2026-10-06, `31649359`)

Yazan: `nf-planlama/plan` oturumu (koordinatör `local_9c7e674a…` adına). Turun 1. ve 2. adımı (keşif + kayıt) bitti; 3. adım (Mert'le konuşma) koordinatörün.

- **Ekran:** Employees (`/app/employees`), Archive (`/app/employees/archive`), kişi çekmecesi (Profile, Employment, Access, History; Add employee; Terminate, Restore, Remove from location; tercih edilen ad onayı), bunların API ve DB katmanı ve bildirimleri. Owner ve müdür tarafı.
- **Sınır notu:** görev mesajındaki "Employees Hub" Employees sayfası olarak okundu. Uygulamada "Employee Hub" çalışan görünümünün adı (ekran 11–14); o dışarıda.
- **Dışarıda:** çalışan görünümü, Availability (ekran 4), Documents (ekran 6), Settings, Schedule, Requests.
- **Sınırda:** Employees → Documents sekmesi, çekmecedeki belge ve müsaitlik bölümleri, davet kabulü ve onboarding sayfası (ekran 16). Ayrıca `InvitationRow` / `UnfinishedSetupRow`: Employees klasöründeler ama Workspace hub'da ve Account → Workspaces'te görünüyorlar (bölüm 6).
- **Raporlar (olduğu gibi):** [A — backlog ve prototip](A-backlog-prototip.md) (`nf-planlama`), [B — güvenlik](B-guvenlik.md) (`nf-guvenlik`), [C — görsel](C-gorsel.md) (`nf-gorsel-qa`, web 5638 / api 5639), [D — kod ve davranış](D-kod-davranis.md) (genel ajan, opus). Dördü de salt okuma: yerel DB'de yalnız SELECT, kod değişmedi; görsel kontrolde yazan istekler tarayıcıda kesildi.
- **Ekran görüntüleri:** `artifacts/nf-gorsel-qa/EKRAN-employees/` (68 dosya; git dışında, `newfork-wt/ekran-03`'te).

## 0. Kısaca
- **Başka workspace'e sızıntı yok.** Eş rütbe kuralı ölçülen her eylemde tutuyor (995 müdür–müdür çifti). Müdür işten çıkaramıyor, arşivleyemiyor (B).
- **İşten çıkarma akışı en zayıf yer:**
  - lokasyonsuz kişi çıkarılamıyor (sistem tam bunu yapmayı öneren bildirim gönderdiği hâlde);
  - geçmiş tarih seçilirse çalışılmış vardiyalar boşalıyor;
  - "müdür takip kaydı" kimseye görünmüyor;
  - onay düğmesi yeşil (D, B, C).
- **İki sessiz kayıp:** "Preferred name" alanına yazılan kaydedilmiyor (D). Restore tek tıkla kişinin hesabını kayıttan koparıyor (D, B).
- **"Send reminder" normal davette her seferinde hata veriyor;** web testi bunu sahte cevapla geçiyor (D; ekran oturumu DB'de doğruladı).
- **ABD form kuralları çekmecede yok:** Türkçe harf, +1 maskesi, e-posta tekilliği (A, C; BL-503).
- **Klavye:** çekmece açılınca odak arkada kalıyor; satırda görünür odak yok (C).
- **Sayılar (2026-10-06, bu keşifte):**
  - A: 53 açık backlog maddesi (3 değişmiş, 2 ölçülmedi, kalanı geçerli; bayat yok) + 20 sınırda; prototip farkı 14 (11 taşı, 3 bırak).
  - B: 2 orta, 5 düşük. C: 5 yüksek, 9 orta, 11 düşük. D: 5 yüksek, 8 orta, 8 düşük.
  - Birleşik liste aşağıda: 38 madde. Mert'e 5 yazılı soru ve 3 görsel karar; koordinatöre 12 karar önerisi.

## 1. Tek liste — önem sırasıyla
Biçim: ne · ekranda nerede · örnek · kaynak · backlog · işaret (`leave` / `do`). Ajanlar ayrıştıysa iki değer de yazılı, özetin seçtiği kalın.

### Yüksek
- **E3-01 — Lokasyonsuz ya da Remote kişi işten çıkarılamıyor.**
  - **Nerede:** Employees → kişi → Terminate employee → "Confirm termination" kapalı, "An active employee location with a timezone is required.".
  - **Örnek:** Ayşe, Ali'yi son lokasyonundan çıkarıyor. Owner'a "End their employment…" bildirimi geliyor ama owner onaylayamıyor. Yerelde 73 aktif kayıt lokasyonsuz, 2'si Remote.
  - **Kaynak:** D Y1. **Backlog:** YENİ. **İşaret:** `leave: high / do: safe`.
- **E3-02 — Geçmiş tarihli işten çıkarma, çalışılmış yayınlanmış vardiyaları boşaltıyor.**
  - **Nerede:** Terminate → "Effective date and time" (alt sınır yok).
  - **Örnek:** Admin tarihi yanlışlıkla 1 Ağustos seçiyor; Ali'nin Ağustos–Eylül vardiyaları "Unassigned" oluyor ve Restore geri getirmiyor.
  - **Ölçüm:** boşaltma sorgusu `>= resolved_effective_at` kullanıyor, `>= now()` sınırı yok; ekran oturumu DB'de doğruladı. pgTAP (`employee_termination_offboarding.test.sql:103-117`) bu davranışı kilitliyor. P09'a aykırı.
  - **Kaynak:** D Y4 (**yüksek**), B O2 (orta). **Backlog:** YENİ. **İşaret:** `leave: high / do: moderate`.
- **E3-03 — "Send reminder" normal gönderilmiş davette her basışta "failed invitation not found" veriyor.**
  - **Nerede:** davetli kişi → Access → Send reminder.
  - **Ölçüm:** sunucu yalnız teslimatı başarısız davette çalışıyor; ekran oturumu DB'de doğruladı. Web testi sahte API ile geçiyor.
  - **Kaynak:** D Y2. **Backlog:** YENİ. **İşaret:** `leave: high / do: moderate` (anlamı soru S2).
- **E3-04 — Çekmecede yazılan "Preferred name" sessizce kaydedilmiyor.**
  - **Nerede:** Add employee ve henüz aktif olmayan kişinin Profile'ı.
  - **Örnek:** Ayşe "Alex" yazıyor, "Employee saved." görüyor, ad kaydolmuyor. Kural bilinçli (ad talep ve cevapla değişir), ama alan yazılabilir duruyor (P09, P11).
  - **Kaynak:** D Y3. **Backlog:** YENİ. **İşaret:** `leave: high / do: safe`.
- **E3-05 — İşten çıkarmanın "manager follow-ups" sözü boş; boşalan vardiyadan kimseye haber gitmiyor.**
  - **Nerede:** Terminate penceresinin uyarı metni.
  - **Ölçüm:** takip satırlarını okuyan kod yok, okuma politikası silinmiş. Kadıköy müdürü Ayşe boşalan Cumartesi vardiyasını Schedule'a bakınca fark ediyor (P07).
  - **Kaynak:** D Y5. **Backlog:** YENİ. **İşaret:** `leave: high / do: moderate`.
- **E3-06 — İşten çıkarma onay düğmesi yeşil (yıkıcı eylem kırmızı olmalı).**
  - **Nerede:** Terminate penceresi → "Confirm termination" (`EmployeeDrawer.tsx:1620-1622`).
  - **Kaynak:** C 2 (**yüksek**), A YENİ (orta), D D5 (düşük). **Backlog:** YENİ (prototip T3). **İşaret:** `leave: high / do: safe`.
- **E3-07 — Çekmece açılınca klavye odağı arkada kalıyor.**
  - **Nerede:** liste satırında Enter.
  - **Ölçüm:** Tab önce arkadaki 14 satırı dolaşıyor; son düğmeden sonra sol menüye kaçıyor (WCAG 2.4.3).
  - **Kaynak:** C 1, A. **Backlog:** BL-478 (değişmiş: açılıştaki odak eksiği maddede yok). **İşaret:** `leave: high / do: safe`.
- **E3-08 — ABD form kuralları çekmecede yok.**
  - Türkçe harf yazılabiliyor ("Iğdır Şule").
  - Telefon maskesi ve sabit +1 yok; iki farklı biçim duruyor.
  - Aynı e-postayla ikinci kişi açılabiliyor (DB'de tekil indeks yok, yerelde 2 çakışan çift var).
  - Owner'ın acil durum telefonu serbest metin.
  - **Kaynak:** A, C 5, D D8. **Backlog:** BL-503. **İşaret:** `leave: high / do: risky`.

### Orta
- **E3-09 — Müdür, aktif çalışanın resmî adını API'den değiştirebiliyor; kilit yalnız ekranda.**
  - **Örnek:** Ayşe, Emre'nin adını istekle "Emir" yapabiliyor. Resmî ad onayı ise yalnız owner ve admin'in (KARARLAR 2026-10-02). Onboarding'deki kişide ekran da açık; müdür adı değiştirip resmî ad onayını dolanabiliyor.
  - **Kaynak:** B O1, D O4. **Backlog:** YENİ. **İşaret:** `leave: medium / do: risky`.
- **E3-10 — "Restore employee" tek tıkla kişinin hesabını kayıttan koparıyor ve bunu söylemiyor.**
  - Kişi yeniden davet edilmek zorunda kalıyor. Bayat ekrandan gelen ters çağrı aktif kaydı da bozabiliyor: komut kaydın o anki durumuna bakmıyor (ekran oturumu DB'de doğruladı).
  - **Kaynak:** D O1, B D1. **Backlog:** YENİ. **İşaret:** `leave: medium / do: moderate` (soru S1).
- **E3-11 — Liste 100 kişide sessizce kesiliyor; sıralama ve lokasyon filtresi yalnız gelen 100 satırda.**
  - Archived 2–3 yılda 100'ü geçer.
  - **Kaynak:** D O2, A. **Backlog:** BL-282 (Employees kalemi; A ve D ayrı madde ve medium öneriyor). **İşaret:** `leave: medium / do: moderate`.
- **E3-12 — İşten çıkarılan kişinin bekleyen izin talepleri ve taslak vardiyaları açık kalıyor; pencere bunu söylemiyor (P09).**
  - **Kaynak:** D O3. **Backlog:** BL-388 (taslak) + YENİ (izin). **İşaret:** `leave: medium / do: moderate`.
- **E3-13 — "Her müdürün en az bir lokasyonu" kuralı dört yoldan atlanıyor:** davet kabulü, Restore, lokasyon silme, iş silme.
  - **Kaynak:** A §3.3. **Backlog:** BL-456, BL-452, BL-474. **İşaret:** `leave: medium / do: moderate`.
- **E3-14 — Kurulum bitmeden API'den davet gönderilebiliyor (Mert'in 2026-10-01 kararı).**
  - **Kaynak:** A. **Backlog:** BL-419 (low → medium öneriliyor). **İşaret:** `leave: medium / do: moderate`.
- **E3-15 — Telefonda Terminate ve Restore yok (2026-10-05 kararı uygulanmamış).**
  - **Kaynak:** A, C 6. **Backlog:** BL-407. **İşaret:** `leave: medium / do: safe`.
- **E3-16 — Terminate penceresi klavyeyle çalışmıyor ve gerekçede tarayıcı balonu çıkıyor.**
  - Odak pencereye girmiyor, tarih ve gerekçe alanları atlanıyor, Esc'ten sonra odak sol menüye düşüyor.
  - **Kaynak:** C 3, A YENİ (prototip T2). **Backlog:** YENİ. **İşaret:** `leave: medium / do: safe`.
- **E3-17 — Liste satırında görünür odak yok; Space satırı açmıyor.**
  - **Kaynak:** C 4. **Backlog:** YENİ. **İşaret:** `leave: medium / do: safe`.
- **E3-18 — Veritabanının geliştirici cümleleri ve ham hata ekrana çıkıyor.**
  - Çekmecede "employee revision conflict"; listede "Failed to fetch" ve zod JSON'u; yeniden deneme yok.
  - **Kaynak:** D O5, C 9, A YENİ. **Backlog:** YENİ (BL-620 / BL-621 ailesi; Requests'teki eşi BL-742). **İşaret:** `leave: medium / do: moderate`.
- **E3-19 — Aynı anda düzenleme çakışmasında çekmece takılıyor; tek çıkış yazılanı kaybetmek.**
  - **Kaynak:** D O6. **Backlog:** YENİ. **İşaret:** `leave: medium / do: safe`.
- **E3-20 — İkiz yol: API, vardiyaları boşaltmadan kişiyi lokasyondan çıkarabiliyor ya da arşivleyebiliyor.**
  - KARARLAR "tek yol Remove" diyor.
  - **Kaynak:** D O7. **Backlog:** YENİ. **İşaret:** `leave: medium / do: moderate`.
- **E3-21 — Lokasyon filtresi yalnız birincil lokasyona bakıyor; "No location" seçeneği yok.**
  - Owner Mert "Kadıköy" seçilince düşüyor.
  - **Kaynak:** A, D O8. **Backlog:** BL-436 (+ YENİ ek). **İşaret:** `leave: medium / do: moderate`.
- **E3-22 — Alan altındaki doğrulama hatası gri; hatalı alanın kenarı değişmiyor.** CSS önceliği kırmızıyı eziyor.
  - **Kaynak:** C 7. **Backlog:** YENİ. **İşaret:** `leave: medium / do: safe`.
- **E3-23 — Liste eski liste dilinde; hemen altındaki Employees → Documents yeni dilde.** Sekmelerde `aria-pressed` yok.
  - **Kaynak:** A, C 10. **Backlog:** BL-604 + YENİ (`aria-pressed`). **İşaret:** `leave: medium / do: moderate` (koordinatör önerisi K7).
- **E3-24 — Telefonda liste 256 px'lik bir pencere; dört sütun ipucusuz sağda.**
  - **Kaynak:** C 11. **Backlog:** BL-599 (genişlemeli). **İşaret:** `leave: medium / do: moderate` (görsel karar G2).
- **E3-25 — Telefonda çekmecede kişinin adı ve durumu görünmüyor.**
  - **Kaynak:** C 12. **Backlog:** YENİ. **İşaret:** `leave: medium / do: safe`.
- **E3-26 — Çekmecede tarayıcının mavi kutucukları ve radyoları; Access düğmeleri üç ayrı ölçüde.**
  - **Kaynak:** C 8, C 13. **Backlog:** YENİ. **İşaret:** `leave: low / do: safe`.
- **E3-27 — Erişilebilirlik ve görünüm küçükleri.**
  - Kilitli Terminate'in nedeni yalnız fare ipucunda (BL-429).
  - Alan kenarı 1,54:1 (BL-259).
  - Sıralı sütun oku yalnız fareyle (BL-663).
  - Sütun seçici Esc ile kapanmıyor (BL-670).
  - **Kaynak:** A, C. **İşaret:** `leave: medium–low / do: safe`.
- **E3-28 — Çalışan kaydı olmayan owner görünmüyor; görünen ad üç tablodan okunuyor.**
  - **Kaynak:** A. **Backlog:** BL-338, BL-079. **İşaret:** `leave: medium / do: moderate–risky`.
- **E3-29 — Employees rotaları gövdeyi yetkiden önce doğruluyor.**
  - **Kaynak:** A. **Backlog:** BL-383. **İşaret:** `leave: medium / do: moderate`.
- **E3-30 — Test boşlukları.**
  - İşten çıkarma, Restore, Send reminder, Revoke ve rol değiştirme için e2e yok.
  - e2e'de `getByLabel("E-mail")` belirsiz (BL-438).
  - Web testi sahte API ile yanlış yeşil.
  - **Kaynak:** A OBS-001, D §2. **Backlog:** OBS-001 (numarasız) + BL-438 + YENİ. **İşaret:** `leave: medium / do: moderate`.

### Düşük
- **E3-31 — Admin olarak davet edilmiş ama kabul etmemiş kişi rütbe hesabında "çalışan" sayılıyor.** Müdür onun kaydını düzenleyebiliyor. Kod notu bunu biliyor.
  - **Kaynak:** B D2. **Backlog:** YENİ. **İşaret:** `leave: low / do: risky`.
- **E3-32 — Çekmecenin özel bilgi ve davet bölümü yetki çekirdeği yerine izin listesine bakıyor (satır içi kapı).**
  - **Kaynak:** B D3. **Backlog:** YENİ. **İşaret:** `leave: low / do: moderate` (soru S4).
- **E3-33 — Workspace profil fotoğrafı yolu ölü; okuma tarafında yol doğrulaması eksik.**
  - **Kaynak:** B D5. **Backlog:** YENİ (BL-408 / BL-472 / BL-473'ün kökü). **İşaret:** `leave: low / do: moderate`.
- **E3-34 — Bayat önbellek.** Lokasyondan çıkarma Schedule'ı, ad onayı listeyi yenilemiyor; arama her harfte listeyi boşaltıyor.
  - **Kaynak:** D D1, D D2. **Backlog:** YENİ. **İşaret:** `leave: low / do: safe`.
- **E3-35 — History zayıf.** Kim, hangi lokasyon yazmıyor; "shift(s)" geliştirici dili; 50'de kesiliyor.
  - **Kaynak:** D D3. **Backlog:** YENİ. **İşaret:** `leave: low / do: safe`.
- **E3-36 — Tercih edilen ad bildirimi her karar verene gidiyor (owner ve bütün admin'ler).**
  - **Kaynak:** D D4. **Backlog:** YENİ. **İşaret:** `leave: low / do: safe` (öneri K5).
- **E3-37 — Durum ve metin tutarsızlıkları.**
  - Süresi dolmuş davet listede "Not Invited", çekmecede "Invitation expired".
  - Saat dilimi ham kimlikle ("Europe/Istanbul").
  - Saniyeli zamanlar (BL-674 ek).
  - Salt okunurda "Cancel" (BL-408).
  - Boş sekme "No employees yet" (BL-662).
  - "Unassigned +1" (BL-428).
  - Tek seçenekli rol seçici (BL-430).
  - Bekleyen ad kutusu sıkışık.
  - **Kaynak:** C, D D6, A. **İşaret:** `leave: low / do: safe`.
- **E3-38 — Ölü ve ikiz kod.**
  - İki oluşturma yolu.
  - Çalışmayan `onCreated` dalı.
  - Kullanılmayan `archived:true` ve `restore_access` DB dalları.
  - Bayat yorumlar.
  - Davet bağlantısının iki ret cevabı (BL-401).
  - **Kaynak:** D D7, B D4. **Backlog:** YENİ + BL-401. **İşaret:** `leave: low / do: safe`.
- A'nın düşük listesindeki öteki açık maddeler (BL-244, BL-352 değişmiş, BL-366 değişmiş, BL-402, BL-420, BL-425, BL-439, BL-459, BL-460, BL-462–465, BL-472/473, BL-477, BL-479, BL-482–485, BL-487, BL-488, BL-492, BL-493, BL-586, BL-588, BL-669, BL-071) bu ekranın turunda kalır; ayrıntı A §1.
- **BL-042** şemsiye madde. Bu turun görev dosyasına bağlanıp tur kapanınca kapanması önerilir (A).

## 2. Prototipten taşı / bırak (P2; A §2)
| P2 | Ne | Öneri | Backlog |
|---|---|---|---|
| L3 | Durum sekmelerinde `aria-pressed` | **taşı** | YENİ (E3-23) |
| L7 | Sütun seçici Esc ile kapanır | **taşı** | BL-670 |
| L11 | Seçilen lokasyon seçenek olarak kalır | **taşı** (BL-436 ile) | BL-670, BL-436 |
| L26 | Boş sekmede "No matching employees" | **taşı** | BL-662 |
| P4 | Kayıtlı telefon "+1 (609) 551-8909" | **taşı** | BL-503 |
| P5 | Owner'ın acil durum telefonu: +1, 10 hane, alan altı hata | **taşı** (ayrı Save: öneri K3) | BL-503 |
| P8 | Yinelenen e-posta yazarken uyarılır | **taşı** (DB tekilliğiyle; risky) | BL-503 |
| E10 | Atama uyarısı yalnız Employment'tan sonra | **taşı** | BL-669 (3) |
| AC4 | İki rol seçicisinde aynı sıra | **taşı** | BL-669 (2) |
| AC8 | Arşivli ama bağlı kişinin Access metni | **taşı** (metin: öneri K9) | BL-669 (1) |
| T2 | Gerekçe hatası alanın altında, tarayıcı balonu değil | **taşı** | YENİ (E3-16) |
| T3 | "Confirm termination" kırmızı | **taşı** | YENİ (E3-06) |
| C1, C5–C13, C15 | Add employee'de Documents adımı, muafiyet, "Ask anyway" | **bırak (bekliyor)** — belge mimarisi raftan inince; soru S5 | — |
| P9 | Resmî ad inceleme paneli | **bırak** (prototipte veri yok) | — |
| X3 | Schedule'daki çekmece kopyası | **bırak** (prototipin kendi işi) | — |

AC10 (terfide müsaitliğin silinmesi, M14) uygulanmış; kapalı. Sınırdaki prototip satırları (DD3–DD5, R*, AV*) Documents ve Availability ekranlarına gider.

## 3. Koordinatör kararı önerileri (KARARLAR ya da ILKELER birebir cevaplıyor; soru yapılmadı)
- **K1 — E3-02 geçmiş tarihli işten çıkarma:** etkili tarih geçmişte kaydedilebilir; vardiya boşaltma hiçbir zaman şimdiden önceye uzanmaz (lokasyondan çıkarmadaki `>= now()` gibi). Pgtap testi buna göre yeniden yazılır. Dayanak: ILKELER P09 ("yayınlanmış veri geriye dönük değişmez").
- **K2 — E3-04 Preferred name alanı:** Add employee'de ve aktif olmayan kişide alan salt okunur gösterilir; ad talep ve cevapla değişir. Dayanak: KARARLAR Employees (tercih edilen ad talep/onay kuralı, BL-098 kapanışı) + P09.
- **K3 — Owner'ın acil durum kişisindeki ayrı "Save emergency contact":** alanlar çekmecenin tek Save'ine bağlanır. Dayanak: KARARLAR Genel "pencerede tek kaydetme noktası" + ILKELER P20.
- **K4 — E3-01 lokasyonsuz ya da Remote kişi:** işten çıkarma penceresi workspace'in saat dilimini sunar. Dayanak: KARARLAR "No location left" bildirimi ("End their employment…") + P10.
- **K5 — E3-36 tercih edilen ad bildirimi:** yalnız karar verecek lokasyon müdürüne; müdürsüz lokasyonda admin ve owner yedek alıcı. Dayanak: ILKELER P07 + KK-158'in takas bildirimi kararı (K-S4, aynı biçim).
- **K6 — E3-21 lokasyon filtresi:** "bu lokasyonda çalışan herkes" olur (birincil değil); "No location" seçeneği eklenir. Dayanak: M2 ("kişi ortak") + P23.
- **K7 — E3-23 ortak liste dili:** Employees bu turda liste sayfalarının ortak diline geçer. Dayanak: KARARLAR Genel "Liste sayfalarının ortak dili" + KK-158 S6 (Requests için aynı karar). Düğmenin yeri görsel karar G1.
- **K8 — E3-06 "Confirm termination":** kırmızı, iki tık. Dayanak: CLAUDE.md §9 buton dili.
- **K9 — Arşivli ama hesabı bağlı kişinin Access metni** "Onboarding in progress" yerine arşiv durumunu söyler. Dayanak: P21.
- **K10 — Salt okunur çekmecede tek düğme "Close".** Dayanak: P21.
- **K11 — E3-09 ad kilidi sunucuda:** bağlı ya da aktif kayıtta ad değişikliği yalnız `onboarding.legal_name` sahibine (owner / admin). Dayanak: KARARLAR "Onboarding'de resmî ad düzeltmesini yalnız owner ya da admin onaylar" (2026-10-02).
- **K12 — E3-31 davetli kişinin rütbesi:** rütbe hesabında davetteki rol kullanılır. Dayanak: ILKELER P07 (eş rütbe yönetilmez); kodun kendi "ponytail" notu.

## 4. Mert'e sorulacak kararlar (CLAUDE.md §13 şablonu, ham)

**S1 — "Restore employee" kişiyi nasıl geri getirsin?**
- **Bugün:** Employees → Archived → kişi → Restore employee tek tıkla kaydı geri açıyor ama hesabını kayıttan koparıyor. Kişi yeniden davet edilmek zorunda ve onboarding'i baştan yapıyor; ekran bunu söylemiyor.
- **Örnek:** Owner Mert, yanlışlıkla çıkardığı garson Ali'yi geri almak istiyor.
- **(a) "Restore" hesabıyla birlikte geri alır; Ali aynı girişle döner, onboarding tekrarlanmaz. Restore iki tık ve sonucu yazar (Önerilen).**
  `Dayanak: ILKELER P25 (geri alınabilir; sonuç açıkça yazılır) + P10 (ilerleme kaybolmaz)`
- **(b) Bugünkü gibi "yeniden işe al":** hesap kopar, yeni davet gerekir; yalnız pencere bunu açıkça söyler.
- **(c) İki düğme:** "Restore" (hesabıyla) ve "Rehire" (yeni davetle).
- Kaçış: "Claude karar versin" / "Önce sohbette konuşalım".

**S2 — "Send reminder" ne yapsın?**
- **Bugün:** Employees → davetli kişi → Access → Send reminder normal gönderilmiş davette hata veriyor; yalnız e-postası düşmüş davette çalışıyor.
- **Örnek:** Ayşe Pazartesi Ali'yi davet etti, Perşembe hatırlatmak istiyor.
- **(a) Aynı bağlantıyla yeni bir e-posta gider; davetin bitiş tarihi değişmez. Ayrı "Resend" yeni bağlantı açar ve süreyi yeniler (Önerilen).**
  `Dayanak: yok — yeni karar (ILKELER P21: tek anlamlı düğme)`
- **(b) "Send reminder" kalkar, yalnız "Resend" (yeni bağlantı, 7 gün) kalır.**
- **(c) "Send reminder" de yeni bağlantı açar; iki düğme birleşir.**
- Kaçış: "Claude karar versin".

**S3 — Kişi kaydındaki "Internal note"u kim görsün?**
- **Bugün:** Employees → kişi → Employment → Internal note, kişiyi görebilen herkese açık.
- **Örnek:** Owner, Kadıköy müdürü Hande hakkında not yazıyor; Kadıköy'ün öteki müdürü Ayşe de okuyabiliyor.
- **(a) Not yalnız o kişiyi yönetebilen üst rütbeye görünür; eş müdür görmez (Önerilen).**
  `Dayanak: ILKELER P07 (görünürlük bir üst kademeyle sınırlı; bekleyen belge ve izindeki kural)`
- **(b) Bugünkü gibi: kişiyi gören herkes görür (M2).**
- **(c) Not yalnız owner ve admin'e görünür.**
- Kaçış: "Önce sohbette konuşalım" (yetki kapsamı, P18).

**S4 — Özel bilgiler (ev adresi, doğum tarihi, acil durum kişisi) eş rütbeye görünsün mü?**
- **Bugün:** Settings → Roles'ta bir müdür rolüne "Private information" okuma izni verilebiliyor. Verilirse o müdür eş müdürün ve owner'ın ev adresini görüyor. Bugün yalnız owner ve admin rolleri bu izni taşıyor.
- **Örnek:** "Shift Lead" rolündeki Ayşe, Hande'nin adresini görüyor.
- **(a) Özel bilgi yalnız alt rütbe için okunur; eş rütbe ve üstü görmez, izin ne olursa olsun (Önerilen).**
  `Dayanak: ILKELER P07 + P08 (ayrıcalık bugünkü rolden; eş rütbe birbirini yönetmez)`
- **(b) İzin kimdeyse kapsamındaki herkesi görür (bugünkü gibi).**
- **(c) Müdür sınıfı rollere bu izin hiç verilemez.**
- Kaçış: "Önce sohbette konuşalım" (yetki kapsamı, P18).

**S5 — Add employee'deki Documents adımı ne zaman?**
- **Bugün:** Employees → Add employee iki adım (Profile, Employment). KARARLAR üçüncü adımı (belge isteme, muafiyet) kararlaştırdı ama "belge mimarisi raftan inince, sıra Mert'le" dedi. Ön koşul: yerleşik Manager rolünde belge izni yok.
- **Örnek:** Ayşe yeni garsonu eklerken gıda kartını hemen isteyemiyor.
- **(a) Belge mimarisiyle birlikte, Documents ekranının (6) turunda (Önerilen).**
  `Dayanak: KARARLAR "Add employee → Documents adımı" (uygulama belge mimarisi raftan inince) + ILKELER P17 (tek hat)`
- **(b) Bu turda, belge mimarisinden önce.**
- **(c) Backlog'a yaz.**

## 5. Görsel kararlar (varyantla; ILKELER P04)
- **G1:** Ortak liste diline geçerken "Add employee" düğmesinin yeri ve rengi: başlıkta yeşil (bugün) mi, filtre satırında beyaz (ortak dil) mı.
- **G2:** Telefonda Employees listesi: kart satırı mı, kaydırmalı tablo mu (E3-24).
- **G3:** Owner'ın Location hücresi: "All locations" mı, "<ilk lokasyon> +N" mi (BL-428).

## 6. Sınırda (başka ekranla ortak)
- **Davet kabulü ve onboarding (ekran 16):**
  - Resmî ad karşılaştırması gönderim anında (E3-09'un öbür ucu).
  - `review_employee_onboarding_service` sarmalayıcısı `_base/_vN` yasağına benziyor (D).
  - BL-351, BL-336, BL-434, BL-631, BL-624.
  - BL-382, BL-620–622, BL-645–649.
  - Askıya alınmış üyelikteki bekleyen davet ilk ekranda görünmüyor (B, P10).
- **Workspace hub ve Account → Workspaces:** `InvitationRow`, `UnfinishedSetupRow`; BL-389.
- **Documents (ekran 6):**
  - Employees → Documents yeni dilde, çekmecedeki Documents bölümü eski dilde (C).
  - Belge önizlemesi Save'i bekletiyor (D).
  - BL-560 (Add employee belge adımının ön koşulu), BL-561, BL-673, BL-557, BL-554, BL-585.
- **Availability (ekran 4):** BL-153 (terfi tetikleyicisi yalnız üyeliğe bağlı).
- **Settings:**
  - BL-452, BL-474 (E3-13'ün c ve d yolları).
  - Roles'ta müdür sınıfına özel bilgi izni verilebiliyor (S4).
  - `workspace_roles` politikası eski kapıda (BL-276 ailesi).
- **Requests (ekran 2):** işten çıkarılan kişinin bekleyen izni orada görünüyor (E3-12).
- **Schedule:** taslak vardiyalar (E3-12), BL-403, BL-315.

## 7. Bakılamayanlar (raporlardan)
- **Kaydetme, davet gönderme, işten çıkarma sonucu, rol değişikliği ve toast'lar tarayıcıda görülmedi:** yazma yasaktı (C, D).
- **Admin rolü ve çalışan rolüyle `/app/employees` gezilmedi** (C).
- **D2'nin canlı hâli kurulamadı;** bekleyen admin daveti yok (B).
- **Geçmiş tarihli işten çıkarma koşturulmadı;** sorgu ve test okundu (B, D).
- **İşten çıkarılan kişinin taslak vardiyalarının yayında ne olduğu izlenmedi** (D §4).
- **Eş zamanlı rol değişikliği:** revizyon kontrolü yok, zarar ölçülmedi (B §4).
- **Gerçek ekran okuyucu kullanılmadı;** yalnız ARIA ve odak ölçüldü (C).

## 8. Ekran oturumunun kendi doğrulamaları (2026-10-06, `31649359`)
| İddia | Komut | Sonuç |
|---|---|---|
| E3-03 Send reminder yalnız başarısız davette | `pg_get_functiondef('load_employee_invitation_retry_service')` içinde `delivery_status <> 'failed'` | var (t) |
| E3-02 boşaltmada "şimdiden sonra" sınırı yok | `terminate_employee_service` içinde `>= now()` / `resolved_effective_at` | yok (f) / var (t) |
| E3-10 arşiv komutu durumu şart koşmuyor | `set_employee_archived_service` içinde `archived_at is null` | yok (f) |
| E3-08 form kuralları KARARLAR'da | `KARARLAR.md:253-265` | harf, telefon, e-posta tekil satırları var |
| C'nin süreçleri durdu | `netstat` 5638/5639 | LISTEN yok |

## 9. Mert'in seçimleri ve kapanış durumu
(Konuşma adımı 2026-10-06 ~07:50Z, koordinatör `local_9c7e674a…`; ayrıntı KARARLAR "Employees", KK-169.)
| Soru | Mert'in seçimi |
|---|---|
| S1 Restore | Seçenek dışı: yeni davet yok, aynı e-posta / hesapla erişim geri verilir. Uç durumlar `S1-restore.md`: Q1 sohbette ("Invite to a new email", bilgiler dolu, politika imzası baştan, geçerli belge sayılır — KK-170), Q2 ve Q3 önerilen |
| K5, K11 | Mert değiştirdi: ad bildirimi owner + admin + müdür, ilk onay yeter; resmî adı doğrudan yalnız owner değiştirir |
| S2 Send reminder | (a) önerilen: aynı bağlantı, bitiş değişmez; Resend yeni bağlantı + 7 gün |
| S3 Internal note | (a) önerilen: yalnız üst rütbe |
| S4 Özel bilgi | (a) önerilen: yalnız alt rütbe, izin ne olursa olsun |
| S5 Documents adımı | (a) önerilen: Documents ekranının (6) turunda |
| K1–K12 | Koordinatör hepsini verdi (KK-169) |
| G1–G3 | Açık: arayüz hattında varyant ("!" işinden sonra) |

Kapanış durumu: görev dosyası S1 senaryoları ve G1–G3'ten sonra yazılır; S2–S5 ve K1–K12 ona girer.
