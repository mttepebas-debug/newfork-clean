# Sabah soruları — 2026-10-07

> **Özet (5 satır)**
> 1. Gece biriken ham soru: **73** (ekran keşifleri 12, veri hattı raporu 4, tazelik turu 51, REMOTE-CI 1, Resend 1, Schedule'ın eski görsel ve düğme maddeleri 3, gece ekran onayı 1). Sayım `origin/main` `d543727a` üzerinde, 2026-10-06 gece.
> 2. Birleştirip cevaplıları ayırınca **24 karar** kaldı: 21'i bu sabah sorulur (S1–S21), 3 görsel soru varyant ya da senin "bekle"n yüzünden sonraya kalır (S22). 43 madde soru değil (aşağıda "Soru değil" listesi, dayanağıyla). Sonradan eklenen: S23 ve S24 (bu sabah), S25 (önce sohbette, temel model).
> 3. **7 tur**, her turda en çok 4 soru (2026-10-06 akşam yeniden bölündü: hat durduranlar önde).
> 4. **Tur 1 neden önce:** dört hattın üçü onu bekliyor. Gece dalda hazır ekran işleri senin onayını, takas onay ekranı (Requests → Review) iki görsel seçimi, takas yetkisinin main'e gidişi de ultrareview cevabını bekliyor.
> 5. Tahmini süre: Tur 1 ~10 dk (görüntülere bakmak dahil), sonraki turlar 3–5'er dk; toplam ~35 dk.

Okuma notu: her soruda "Hat" satırı neyin beklediğini söyler. Önerilen her seçeneğin altında "Zayıf yanı" var. Seçenek harfleri soruya özel.

---

## Tur 0 — 2026-10-07 gecesinin kararları (önce bunlar; görsellerle)

### G1. Settings → General: altı tasarımdan hangisi? (EKRAN-10)
- **Nerede:** Settings → General (`/app/settings/general`). Bugün sayfada dört ayrı kaydetme yeri var (logo penceresi, ad "Save changes", "Hide checklist", preferred name düğmesi), dört yeşil düğme dört farklı genişlikte, başlık Documents'a geçerken 50 px kayıyor.
- **Tasarımlar:** https://claude.ai/artifact/Kwz63F5JeddW5S7y2kSsAi (v2) — altı varyant, masaüstü + telefon, bugünkü sayfayla yan yana. Hepsinde tek Save sağ altta (KARARLAR "Kaydetme", P20 — koordinatör kararı KK-208, soru değil).
- Seçim varyant harfiyle; önerilen sabah koordinatörün bakışıyla eklenecek.

### G2. Settings → General'a hangi öneriler girsin? (çoklu seçim; EKRAN-10)
- Aynı artifact'ta Ö1–Ö4 düğmeyle açılıp kapanıyor. Oturumun önerisi: Ö2 ve Ö3 hemen, Ö4 Billing ile, Ö1 sohbetten sonra (G3).

### G3. Workspace saat dilimi (temel model — önce sohbette, P18; EKRAN-10 G-15)
- **Bugün:** workspace düzeyinde saat dilimi yok, yalnız her lokasyonun kendi saat dilimi var. Ama iki kayıt (KK-169 K4, BL-765) "workspace saat dilimi" varsayıyor; Employees'te Remote kişinin işten çıkarılması bu yüzden lokasyonların saat dilimine bakıyor.
- **Örnek:** Bosphorus Kitchen'ın Los Angeles ve Las Vegas lokasyonları var; Remote çalışan Deniz'in işten çıkarma saati hangi dilimde yazılır?
- **Seçenekler:** (a) salt okunur özet kalsın (lokasyonlardan), (b) gerçek bir "workspace saat dilimi" ayarı açılsın, (c) hiç gösterilmesin. Sohbette konuşulur.

---

## Tur 1 — hat durduranlar

### S1. Takas yetkisi işi main'e giderken ultrareview koşturalım mı?
- **Hat:** veri hattı (A1+A2 dalda bitti) ve web hattı (B1b, A1–A3 main'e girmeden başlamaz) bekliyor.
- **Bugün:** Schedule → Requests → Shift changes'te takası onaylama yetkisi yeni kurala geçti, ama yalnız dalda. Kadıköy müdürü Can, eş müdürü Ayşe'nin cover talebini artık onaylayamıyor; owner Mert'in kendi vardiya devrini o lokasyonun müdürü ya da admin onaylıyor; takas bildirimleri yalnız karar verecek müdüre gidiyor. Değişiklik büyük: yetki çekirdeğine yeni bir sütun, 6 eski fonksiyon siliniyor.
- **İnceleme:** güvenlik incelemesi (`nf-guvenlik`) iki tur yaptı. İlk tur yalnız eksik test için "değiştir" dedi, ikinci tur ONAY verdi. Kod tarafında kritik ya da yüksek bulgu yok.
- **Gönderim:** koordinatör kendi yetkisiyle yapar (CLAUDE.md §8). Ultrareview'u (bulutta çok ajanlı derin inceleme) yalnız sen başlatırsın.
- **(a) Hayır; iki tur güvenlik incelemesi yeter, iş bu sabah main'e ve canlıya gider. (Önerilen)**
  Zayıf yanı: bu, bugüne kadarki en büyük yetki değişikliği (yetki tablosu 10.508 hücre). Ultrareview'un bulabileceği bir şey canlıda ortaya çıkar. Ücretsiz hak kaldı mı ölçülmedi; tutar açılış penceresinde görünür.
  `Dayanak: ILKELER P06 kanıtları — 2026-10-01 (veri silme işi) ve 2026-10-02 (yetki çekirdeği işi) "iki inceleme yeter" dedin`
- **(b) Evet; dalın oturumunda `/code-review ultra` koşar, bulgular güvenlik incelemesine eklenir, gönderim sonuca kadar bekler.** Hak bittiyse tutarı pencere söyler.
- (c) Önce sohbette konuşalım.
- Kaynak: `.newfork-inbox/done/20261006T153610-nf-db-veri-ekran-02-a1a2.md`; görev dosyası EKRAN-02 "Ultrareview".

### S2. Gece dalda bekleyen üç ekran işi main'e gitsin mi?
- **Hat:** arayüz hattı bekliyor. Requests'in tek tablosu (C1) ve inceleme çekmecesi (C2) ilk dalın üstüne kuruluyor.
- **Bugün:** gece kuralın gereği (KK-175) ekranda görünen hiçbir şey main'e girmedi. Üç dal hazır; tam kapı ve görsel QA geçti.
- **Dal 1 — ortak parçalar (Requests C3):**
  - Arama kutusu kenarı koyulaştı. Bu, senin seçtiğin `#7f8c86`; Requests, Notifications ve Schedule üst çubuğunu birlikte değiştirir.
  - Liste tablolarında sıralama oku artık hep görünüyor (eskiden yalnız fare üstündeyken). Bu yeni bir ortak kural; onaylarsan KARARLAR'a yazılır.
  - Onay penceresi telefonda 8 px kaymıyor.
  - Ortak sayfalama bileşeni (25 / 50 / 100) eklendi; henüz hiçbir ekranda görünmüyor.
  - Görüntüler: `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\nf-arayuz\EKRAN-02-C3\` (requests-1440-before/after, employees-1440-before/after, confirm-390-before/after).
- **Dal 2 — Employees ortak liste dili (C1a):** Employees, Documents ile aynı sekme çizgisini ve filtre satırını kullanıyor. "Add employee" yeşil düğme filtre satırının sağ ucunda (senin G1 seçimin). 50'lik sayfalar; klavye düzeltmeleri.
  - Görüntüler: `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\nf-arayuz\EKRAN-03\C1\` (owner ve müdür, 1440 + 390, öncesi/sonrası).
  - Not: Employees API'si en çok 100 kişi döndürüyor. 120 kişilik işletmede 20 kişi bugün de görünmüyor; düzeltmesi web hattında ayrı iş (KK-177).
- **Dal 3 — dokunma alanı:** telefonda çekmecenin kapatma düğmesi 38 px'ten 44 px'e büyüdü.
  - Görüntüler: `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\nf-arayuz\ARAYUZ-SALT-HATA\`.
- Her dal ayrı seçilir:
  - **(a) Gönder. (Önerilen)**
    Zayıf yanı: dal 1 ortak parçaları birden çok ekranda aynı anda değiştiriyor. Görüntülerde olmayan bir ekranda (ör. Settings → Jobs, Notifications'ın "Mark as read" düğmesi) kenar soluk kalabiliyor; QA bunu backlog'a önerdi.
    `Dayanak: senin 2026-10-06 seçimlerin (S7 kenar rengi, Employees G1, Sistem 1) + CLAUDE.md §9 erişilebilirlik (44 px)`
  - (b) Düzeltme iste (ne olduğunu yaz).
  - (c) Önce görüntülere birlikte bakalım.
- Kaynak: HANDOFF §4.1; inbox `…145231…c3.md`, `…151236…c1a.md`.

### S4. Görsel — müdürün izni kısalttığı satır (G3)
- **Hat:** Requests C1 (tek tablo) bekliyor.
- **Bugün:** Requests → Time off → Closed. Ayşe, Ali'nin 11 Ekim iznini bir vardiya (4–10 PM) için kısalttı. Satır, Ali'nin 28 Eylül'de kendi istediği iptalle aynı görünüyor: ikisi de "Leave cancellation".
- **Varyantlar hazır:** aynı artifact, bölüm 2.
  1. Alt yazı: "Shortened by Ayse Person · 1 shift, 4:00–10:00 PM".
  2. Gri makas simgesi ve "System" etiketi.
  3. İznin altında girintili satır.
  4. "Type" sütunu.
  5. Durum etiketsiz gri kayıt satırı.
- **Gece bulgusu:** varyantlar eski iki sekmeli Time off listesinde çizilmiş. Senin 2026-10-06 tek tablo kararında zaten bir **Type** sütunu var (Employee, Type, When, Decide by, Status, Review) ve üstte Request type süzgeci var. Yani 4 yeni sütun eklemez, var olan sütuna bir değer ekler.
- **(4) Type sütunu "Shortened by manager" der. (Önerilen)** Yeni öğe yok; Request type süzgeciyle de ayrılabilir.
  Zayıf yanı: kimin kısalttığı ve hangi saat listede görünmez, Review açılınca görünür. 1 bunu doğrudan listede söyler.
  `Dayanak: KARARLAR Schedule → Requests "Requests tek tablo" (Type sütunu) + ILKELER P20 (global bileşen diline sadakat)`
- (1), (2), (3), (5) varyant numarasıyla seçilir. Not: 1 ile 4 birlikte de seçilebilir (sütunda tür, alt yazıda kim).

---

## Tur 2 — veri hattını ve bütün hatları durduranlar

### S24. Lokasyonu değişen vardiya yeni lokasyonda yayınlanınca eski lokasyonun yayını ne olur?
- **Hat:** veri hattı DB-4 (Schedule'da Edit'e girerken çıkan hata, BL-759) kök çözüm için bu cevabı bekliyor; cevaba kadar yalnız kırmızı test yazılır.
- **Bugün:** Ayşe, Kadıköy'deki Salı vardiyasını taslakta Beşiktaş'a taşır ve yalnız Beşiktaş'ı yayınlar. Vardiya iki yayında birden kalır (Kadıköy'ün eski yayını + Beşiktaş'ın yenisi): çalışan aynı vardiyayı iki yerde görebilir ve Ayşe o haftada Edit'e basınca düzenleme açılmıyor.
- **(a) Taşınan vardiya yeni lokasyonda yayınlanınca eski lokasyonun yayınından otomatik düşer; yayın önizlemesi bunu bir satırla söyler ("Kadikoy loses 1 shift moved to Besiktas"). (Önerilen)**
  Zayıf yanı: Kadıköy'ün yayını, Kadıköy hiç yayınlanmadan değişmiş olur; Kadıköy müdürü Can bunu yalnız önizleme satırından ve bildirimden öğrenir.
  `Dayanak: ILKELER P09 (veri sessizce düşmez, uyarılır) + okuma modelinin bugünkü kuralı ("lokasyonu bugünküyle eşleşen yayın konuşur")`
- **(b) Eski lokasyonun da yayınlanması istenir: Beşiktaş'ı yayınlarken Kadıköy de seçili olmak zorunda.**
  Zayıf yanı: Kadıköy'de yarım kalan başka bir taslak varsa Ayşe onu da yayınlamak zorunda kalır; Kadıköy başka müdürünse Ayşe'nin yetkisi yetmeyebilir.
- **(c) Yalnız Edit'in açılmasını düzelt; vardiya iki yayında kalmaya devam etsin.**
  Zayıf yanı: en hızlı yol ama kök sorun kalır; çalışan aynı vardiyayı iki lokasyonda görmeye devam eder.
- (d) Önce sohbette konuşalım.
- Kaynak: `.newfork-inbox/done/20261006T173450-nf-db-veri-ekran-01-db4-tazelik.md` (Soru 2); BL-759.

### S7. Ağır testler (CI) nerede koşsun?
- **Hat:** dört hattı yavaşlatıyor. Bugün ağır işler (tam test, e2e, veritabanı testi) senin bilgisayarında tek tek sıraya giriyor; dün aşırı yükten kapandı.
- **Bugün:** CI tek runner'la ve "aynı anda tek ağır iş" kuralıyla bilgisayarında koşuyor; bir main koşusu ~20 dk. Sen 2026-10-06'da "mümkünse remote yapalım" dedin.
- **Örnek:** yoğun bir günde 25 gönderim, her biri ~20 dk; arada oturumlar ağır iş izni için sıra bekliyor.
- **(a) Bulutta küçük bir sunucu (Hetzner, ~$8–12/ay) runner olur; bilgisayarın boşalır, kod gizli kalır. Hesabı sen açarsın, kurulumu bir oturum yapar. (Önerilen)**
  Zayıf yanı: yeni ücretli hesap, ILKELER P06'ya ("lansmandan önce yeni ücretli hesap açılmaz") istisna. 8 GB'lık sunucu işleri sırayla koşturur, bugünkü üç paralel runner kadar hızlı değil (ilk koşuda ölçülür). Fiyat ikincil kaynaktan; hesap açmadan hetzner.com'da doğrulanır.
  `Dayanak: senin 2026-10-06 ~13:50Z isteğin ("remote yapalım") + docs/plan/research/REMOTE-CI.md; para kısmı için yok — yeni karar (P06 istisnası)`
- (b) GitHub'ın makineleri: kurulum yok; kullanıma göre ~$13–145/ay, yoğun haftada pahalı.
- (c) Bugünkü gibi bilgisayarında, tek ağır iş kuralıyla ($0, yavaş).
- Kaçış: "Önce sohbette konuşalım".

### S5. Eş müdür, öteki müdürün cover talebini kapatabilsin mi?
- **Hat:** durdurmuyor. Cevap gelirse veri hattının şimdi başladığı A3'e eklenir; gelmezse bugünkü davranış sürer.
- **Bugün:** Shift Hub'da bir müdürün açtığı cover aramasını aynı lokasyonun öteki müdürü kapatabiliyor ("close"). Yeni rütbe kuralı yalnız onay ve red için yazıldı. Bu davranış dal öncesinden beri var; güvenlik incelemesi düşük bulgu olarak işaretledi.
- **Örnek:** Ayşe Cuma vardiyası için cover arıyor; Can aramayı kapatıyor, Ayşe'nin talebi düşüyor.
- **(a) Kapatma da rütbeye uyar: aramayı açan kişi, admin ya da owner kapatır; eş müdür kapatamaz. (Önerilen)**
  Zayıf yanı: Ayşe izindeyken aramayı kapatacak müdür kalmaz, admin'e iş düşer. Bugün kimsenin şikâyet ettiği bir durum değil.
  `Dayanak: ILKELER P07 (eş rütbe birbirini onaylamaz; bekleyen talebi eş rütbe görmez) — kapatma için birebir yazılı değil`
- (b) Bugünkü gibi: lokasyonun her müdürü kapatabilir.
- (c) Yalnız aramayı açan kişi kapatabilir; admin ve owner da kapatamaz.
- Kaçış: "Claude karar versin".

### S6. Takastan sonra müdürün açık düzenlemesine geri alınan vardiyada not kalsın mı?
- **Hat:** durdurmuyor; küçük düzeltme A3'e girer.
- **Bugün:** Ayşe bu haftayı Schedule'da düzenlerken Ali'nin Cuma vardiyasına "Bring keys" notunu yazıyor. O sırada Ali'nin takası onaylanıyor ve vardiya Hande'ye geçiyor. Sistem, Ayşe'nin açık düzenlemesindeki vardiyayı yayındakine uyduruyor (kişi, saat, yer, iş).
- **Çelişki:** bir backlog maddesi "not, saati gizle ve etiket de yayındakine dönsün" diyor; var olan bir test ise "müdürün düzenlemede yazdığı not korunur" diyor. Ayrı olarak vardiya düzenlemede yoksa sistem onu sıfırdan ekliyor ve yayındaki notu kopyalamıyor; bu açık hata, soru değil, düzeltilir.
- **(a) Ayşe'nin düzenlemede yazdığı not, "saati gizle" ve etiket kalır; yalnız kişi, saat, yer ve iş yayındakine döner. (Önerilen)**
  Zayıf yanı: not kişiye özelse ("Ali, benimle konuş") Hande'nin vardiyasında yanlış kalır.
  `Dayanak: ILKELER P09 (veri sessizce düşmez) + var olan test (müdürün oturumdaki notu korunur)`
- (b) Hepsi yayındakine döner; Ayşe'nin yeni notu silinir.
- (c) Not kalır, ama Ayşe'ye "Shift moved to Hande; check the note" uyarısı çıkar.

---

## Tur 3 — canlı e-posta ve yerel veritabanı (kod hattını durdurmuyor)

### S8. Canlıda e-posta: Resend'i ne zaman kuruyorsun?
- **Hat:** kod hattını durdurmuyor; canlıda davet ve parola sıfırlamayı durduruyor.
- **Bugün:** canlıda e-posta anahtarı yok. Employees → Invite "Invitation delivery failed" veriyor. Sign in → Forgot password e-posta göndermiyor. Zamanlanmış Schedule e-postası her denemede düşüyor. Adımlar 2026-10-06 12:35Z'de iletildi: `docs/plan/mvp/RESEND.md` §3.
- **(a) Bugün: Resend ücretsiz plan ($0, günde 100 e-posta), `mail.tepebash.com` doğrulanır, anahtarı sen Vercel'e yapıştırırsın (adım 1–5); Supabase SMTP adımı (6) da yapılır. Sonra bir oturum canlıda test daveti ve parola sıfırlama dener. (Önerilen)**
  Zayıf yanı: e-postalar ürün adıyla değil `tepebash.com` alanından gelir (`newfork.app`'in sahipliği ölçülmedi). 100 kişilik ekibin aynı gün toplu daveti günlük sınıra dayanır.
  `Dayanak: ILKELER P06 (ücretsiz önce) + CLAUDE.md §8 (hesap ve anahtar yalnız sende)`
- (b) Lansmana yakın; o zamana kadar canlıda e-posta yok.
- (c) Başka alan adıyla (ör. `newfork.app` alınırsa) — önce alan adı kararı.

### S23. Yerel veritabanında kalan iki test dünyası ne olsun?
- **Hat:** hiçbir hat durmuyor; yalnız yerel bir test kırmızı. Cevap gelene kadar yerel `test:db` sonucu bu testte hep kırmızı okunur.
- **Bugün:** 2026-10-06 15:53Z'deki bir deneme sırasında ortak yerel veritabanına iki test dünyası (World ra, World rx: 2 workspace, 9 kullanıcı) kalıcı yazıldı. Yerel "belge türleri" testi bu yüzden düşüyor. CI ve canlı etkilenmiyor (CI her koşuda temiz veritabanı kurar). Gece silmek denendi; ürünün kendi korumaları (workspace'in aktif owner'ı kalmalı, değiştirilemez kayıtlar) silmeyi durdurdu, hiçbir şey yazılmadı. 692 satırın tam yedeği alındı: `.newfork-inbox/backup-test-worlds-ra-rx-20261006/rows.jsonl`.
- **(a) Yerel `supabase db reset`: veritabanı sıfırdan kurulur (~1 dk). (Önerilen)**
  Zayıf yanı: yerel test verisinin hepsi gider; Meyhouse demo verisi de yeniden kurulmalı ve git dışındaki `meyhouse.sql` artık silinmiş sütunlara yazdığı için reset bu dosyada durabilir (BL-520), önce dosyanın yeniden üretilmesi gerekebilir. O sırada yerel test koşan oturum kesilir; reset hatların boş anına konmalı.
  `Dayanak: CLAUDE.md §7 (reset senin onayını ister) + ILKELER P01 (canlı veri yok, bozuk yerel veri onarılmaz, yeniden kurulur)`
- **(b) Korumaları tek transaction'da kapatıp yalnız iki test dünyasını silmek (yedekli; önce geri alınan denemede yetim satır sayılır).**
  Zayıf yanı: ürünün korumalarını atlamak demek; gözden kaçan bir tabloda yetim satır kalabilir ve sonraki yerel testleri sessizce bozabilir.
- **(c) Bırakmak: yalnız yerel "belge türleri" testi kırmızı kalır.**
  Zayıf yanı: yerel kırmızı her koşuda yeniden ayıklanır; testin kendi zayıflığı (bütün veritabanında başlığa göre arıyor) ayrıca backlog'da (BL-841) ve o düzelince bu kırmızı kendiliğinden kalkar.
- (d) Önce sohbette konuşalım.
- Kaynak: `.newfork-inbox/done/20261006T165128-nf-db-veri-olay-test-dunyasi.md`.

---

## Tur 4 — Employees ve Availability (veri hattına sırası gelince durdurur)

Veri hattının sırası: Requests A3 → A4 → Employees A1–A4 → Availability A1 → Workspace A1. Bu turdaki cevaplar o dilimlere gerekir; bugün hiçbir oturum beklemiyor.

### S9. Arşivlenmiş lokasyondaki kişi o lokasyondan çıkarılabilsin mi?
- **Bugün:** Settings → Locations'ta Moda arşivlendi. Employees → Ayşe → Employment → Locations → Moda → Remove reddediliyor. Çıkış yolu üç adım: Moda'yı arşivden geri al, Ayşe'yi çıkar, Moda'yı yeniden arşivle.
- **(a) Arşivli lokasyondan çıkarma serbest; tek tık, öteki lokasyonlardaki gibi. (Önerilen)**
  Zayıf yanı: arşivli lokasyonun geçmiş kaydı (kim oradaydı) bir tık daha zayıflar. Nadir bir yol için yetki fonksiyonuna dokunulur.
  `Dayanak: ILKELER A anti-hedef "kurumsal hantallık" (5 dakikalık iş 20 dakika sürmez)`
- (b) Bugünkü gibi; ama Remove'un yanında "Restore Moda first" yazısı.
- (c) Arşivleme, o lokasyondaki bütün atamaları kendiliğinden kaldırır.

### S10. Employees çekmecesinin History'si kimin yaptığını ve hangi lokasyonda olduğunu yazsın mı?
- **Bugün:** Employees → kişi → History satırları "Assigned to 2 shift(s)" gibi; kim yaptı, hangi lokasyon yazmıyor; 50 kayıtta kesiliyor.
- **Örnek:** Ali'nin Salı vardiyasını kim aldı? History yalnız "Unassigned from 1 shift(s)" diyor.
- **(a) Her satır kim ve lokasyon yazar ("Ayşe unassigned Ali · Kadikoy · Tue 5–11 PM"); "shift(s)" düzgün çoğul olur; 50'den sonrası sayfalanır. (Önerilen)**
  Zayıf yanı: yeni veri toplanır (kim yaptı); bugünden önceki satırlarda bu bilgi boş kalır.
  `Dayanak: ILKELER P11 (doğru veri) + P21 (geliştirici dili yok) — "kim" alanı için yok — yeni karar`
- (b) Yalnız metin ve sayfalama düzelir; kim ve lokasyon eklenmez.
- (c) Backlog'a yaz.

### S11. Yönetici kendi çalışan görünümünde "My availability"yi nasıl görsün?
- **Bugün:** Employee Hub → My availability. Müdür Can kapalı alanlar ve kapalı bir Save görüyor, nedeni yazmıyor ("Weekly availability · Not submitted").
- **(a) Sekme yöneticide hiç görünmez. (Önerilen)**
  Zayıf yanı: çalışan görünümünün amacı "çalışan ne görüyor"u göstermek; Can formun nasıl göründüğünü artık önizleyemez.
  `Dayanak: KARARLAR M13 (müsaitliği yalnız employee girer) + ILKELER P20 (gereksiz bölüm yok)`
- (b) Sekme görünür, üstte tek cümle: "Availability is entered by employees."
- (c) Bugünkü gibi kalsın.

### S12. Vardiya tipinin saati değişince işaretli müsaitlik sessizce kaysın mı?
- **Bugün:** müsaitlik "shift type" modundayken Ali "Dinner"ı müsait değil diye işaretledi. Owner Dinner'ı 17–22'den 16–23'e çekerse Ali artık 16–23 müsait değil sayılır; kimseye haber gitmez.
- **(a) Kayar; Ali'ye "Dinner hours changed; check your availability" bildirimi gider. (Önerilen)**
  Zayıf yanı: yerelde bu modda workspace yok; bugün kimse etkilenmiyor. Bildirim yalnız o tipi işaretleyenlere gitmeli, yoksa gürültü olur.
  `Dayanak: ILKELER P09 (veri sessizce değişmez; kullanıcı uyarılır)`
- (b) Bugünkü gibi sessiz kayar.
- (c) Ali'nin işareti eski saatte (17–22) sabit kalır.

---

## Tur 5 — Workspace ana sayfası (sırası en son gelen ekran)

### S13. İzni olmayan müdür Workspace'teki sayı kutusunu nasıl görsün?
- **Bugün:** sol menü → Workspace → Pending requests. Yalnız Availability'yi yöneten Can, bekleyen talep varken "Time off 0" görüyor. Sıfır yanlış: talep var ama Can'ın görme izni yok.
- **(a) Kutu gizlenir; Customize listesinde de çıkmaz. (Önerilen)**
  Zayıf yanı: koordinatör 2026-09-29'da (KK-32) "0 kalsın" demişti; bu, o kararı senin kararınla değiştirir. Can özelliğin var olduğunu hiç bilmez.
  `Dayanak: ILKELER P11 (doğru veri tahminden önce) + A anti-hedef (gürültü yok)`
- (b) Kutu durur; sayı yerine "—" ve "No access".
- (c) Bugünkü gibi 0 kalır.

### S14. Beşten fazla açık iş olunca Todos kutusu ne yapsın?
- **Bugün:** yedi belgenin süresi doluyor; Ayşe Todos'ta beşini görüyor. Altıncı ve yedinci, ilk beş düzelene kadar hiç görünmüyor.
- **(a) Sınır kalkar; kutu kendi içinde kayar. (Önerilen)** İşlerin ayrı bir sayfası olmadığı için "+2 more" kişiyi bir yere götüremez.
  Zayıf yanı: kutu içinde kutu kayması telefonda rahatsız eder; uzun liste pano düzenini uzatabilir.
  `Dayanak: ILKELER P09 (veri sessizce düşmez) + P02 (tam çözüm)`
- (b) Beşin altında tıklanamayan "+2 more".
- (c) Bugünkü gibi kalsın.

### S15. Setup checklist'teki "App tour" adımı ne olsun?
- **Bugün:** Workspace → Setup checklist → App tour. Mert basıyor, adım işaretleniyor ama tur yok.
- **(a) Adım kalkar; tur yapılırsa geri gelir. (Önerilen)**
  Zayıf yanı: yeni owner'a "uygulamayı tanı" yönlendirmesi kalmaz; kurulum listesi kısalır.
  `Dayanak: ILKELER A anti-hedef "oyuncak görünüm" (işe yaramayan adım yok) — yok — yeni karar`
- (b) Kalır, yanında "Coming soon".
- (c) Kısa bir tur yapılır (yeni iş; backlog'a).
- Not (2026-10-07 düzeltildi): aynı listedeki "Billing" adımının dayanağı değişti; ödeme artık MVP'de ve 18. ekran (KARARLAR "MVP sınırı"). Adımın kalıp kalmayacağı o ekranın turunda ele alınır.

### S16. Admin de Setup checklist'i görsün mü?
- **Bugün:** admin Deniz checklist'i görüyor ve gizleyebiliyor. Yetki kataloğu ise kurulum işini owner'a özel sayıyor; ekran kataloğa uymuyor.
- **(a) Yalnız owner görür. (Önerilen)**
  Zayıf yanı: kurulumu owner adına admin yapıyorsa adımları göremez; owner'a iş kalır.
  `Dayanak: yetki kataloğu (kurulum owner'ın) + ILKELER P08 (ayrıcalık rolden) — ekran için yok — yeni karar`
- (b) Admin de görür ve tamamlayabilir; katalog buna göre genişler.
- (c) Admin görür ama gizleyemez.

---

## Tur 6 — kalan ürün soruları

### S17. Belge süresi işi ve bildirimi kendiliğinden üretilsin mi; ayrıca "expired" bildirimi gitsin mi?
- **Bugün:** Ali'nin Food Handler kartı Cumartesi doluyor. Hafta sonu kimse Workspace'i açmazsa ne Todos'ta iş açılıyor ne owner'a bildirim gidiyor; Pazartesi biri sayfayı açınca ikisi birden üretiliyor. "Expires soon" bildirimi gittiyse, süre dolunca ikinci bir bildirim gitmiyor.
- **(a) Her gün belli saatte kendiliğinden üretilir; süre dolunca owner ve admin'e ayrıca "expired" bildirimi gider. (Önerilen)**
  Zayıf yanı: haftada bir belge için iki bildirim; belge izni olan herkes alır.
  `Dayanak: ILKELER P09 + koordinatör kararı KK-179 (4); "expired" ayrı bildirim için yok — yeni karar`
- (b) Kendiliğinden üretilir, ama "expired" ayrı bildirim olmaz.
- (c) Bugünkü gibi kalsın.

### S18. Schedule'da "izni kısalt ve ata" tek adım olsun mu?
- **Bugün:** Schedule'da Ali Cuma akşamı izinli. Ayşe onu 18:00 vardiyasına koymak için önce Requests'te izni kısaltıyor, sonra Schedule'a dönüp atıyor.
- **(a) Evet; Schedule hücresinden "Shorten time off and assign" tek pencerede ikisini yapar; yalnız iki yetkisi de olan müdürde görünür. Schedule'ın sıradaki işi olur. (Önerilen)**
  Zayıf yanı: yeni bir yetki birleşimi (izin kararı + takvim düzenleme) ve yeni bir pencere. Schedule ekranı kapanmak üzereyken kapsam büyür.
  `Dayanak: ILKELER A anti-hedef "kurumsal hantallık" + P02 — yok — yeni karar`
- (b) Backlog'a yaz; MVP sonrası.
- (c) Hayır; iki adım kalsın.

### S19. Schedule → Templates: dört öneriden hangilerini kabul ediyorsun? (çoklu seçim)
Bugün iki ayrı yer var: Templates düğmesi bir pencere açıyor, ayrıca `/app/schedule/templates` sayfası var. İki ayrı karar (Save as template iki yerden açılır, Replace) zaten verildi. Her satır ayrı işaretlenir.
| # | Öneri | Bugün | Zayıf yanı |
|---|---|---|---|
| T1 | Şablon kaydederken çalışan adları korunur; "Remove employee names (save as open shifts)" kutusu | adlar hep korunuyor, seçenek yok | bir onay kutusu daha (anti-hedef "ayar") |
| T2 | Department süzgeci katlanmış "Only some departments" bölümüne alınır | süzgeç hep açık | seçenek gözden kaçabilir |
| T3 | Şablonun revizyon numarası ekranda görünmez | görünüyor | eski sürümü ayırt etmek zorlaşır |
| T4 | Şablon yokken boş ekran "kayıtlı bir taslak aç, sonra Save as template" der | yol tarif eden metin farklı | yok denecek kadar az |
| T5 | Tek yüzey: `/app/schedule/templates` sayfası kalkar, her şey Templates penceresinde | iki yüzey | sayfa adresini bilen biri boşa düşer |
`Dayanak: tasks/BL-038.md (ARGE önerileri) + ILKELER P20 (tek yer, sade); T5 için yok — yeni karar`. Kaçış: "Önce sohbette konuşalım".

---

## Tur 7 — görsel, varyantı hazır olanlar (hat durdurmuyor)

### S20. Görsel — Schedule üst çubuğu dar pencerede
- **Bugün:** Schedule üst çubuğu 1024 px'te 4 satıra, 936 px'te 7 satıra diziliyor; Ayşe ızgarayı ekranın yarısından başlayarak görüyor. 2026-10-06'da dört görüntü gördün ve "başka bir fikrim var" dedin (HANDOFF §4.5). O fikir henüz dinlenmedi.
- **Varyantlar:** `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\nf-arayuz\VAR-EKRAN-12\01-schedule\BL-445\` (`_compare-1024.png`, `_compare-936.png`, `c-1024-open.png`). DEV'de `?var=bl445-a|b|c`, dal `task/var-ekran-12`.
  - A: bugünkü.
  - B: 1280'in altında düğmeler yalnız simge.
  - C: ayar ve süzgeçler tek "Filters (1)" düğmesinde; 936'da da tek satır.
- **(önce) Fikrini anlat; gerekirse yeni varyant çizilir. (Önerilen)**
  Zayıf yanı: bir tur daha.
  `Dayanak: ILKELER P04 (önce dinle, sonra varyant)`
- Hazır olanlardan seçmek istersen: C (arayüz hattının önerisi; Zayıf yanı: süzgeçler bir tık arkada kalır).

### S21. Görsel — tek lokasyonlu haftada Pazar görünmüyor
- **Bugün:** 1440 px'te Palo Alto haftasında Cumartesi kesik, Pazar sağa kaydırınca geliyor.
- **Varyantlar:** `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\nf-arayuz\VAR-EKRAN-12\01-schedule\C-D11\` (`_compare-1440.png`, a|b|c-1440/1280). DEV'de `?var=cd11-a|b|c`.
  - A: bugünkü.
  - B: yedi gün her genişlikte sığar, kart yazısı gerekirse iki satıra iner.
  - C: Schedule açılınca sol menü simge rayına iner.
- **(B) Yedi gün sığar. (Önerilen)**
  Zayıf yanı: dar pencerede kartlar iki satıra iner, ızgara uzar.
  `Dayanak: ILKELER P23 (müdür göremediği günle karar vermez) — görsel için zayıf (P04)`
- (A), (C) numarayla seçilir.

### S22. Bekleyen görsel sorular (bu sabah sorulmaz; sırası gelince)
| Soru | Varyant nerede | Neden bekliyor |
|---|---|---|
| Employees telefon listesi: kart satırı mı, kaydırmalı tablo mu? Telefondaki kesik "No app access", "START D…", "Manage logo" taşması da buna bağlı | https://claude.ai/artifact/CQx4kkeVq1CJF3zGchvkXC | 2026-10-06 ~11:50Z "bekle" dedin; önce masaüstü Sistem 1 bitsin |
| Availability telefonda: kart satırı / yapışkan sütunlu tablo / "Available on a computer" | **henüz hazır değil** (Availability turunun V dilimi) | varyant hazırlanınca |
| Workspace başlığı: liste iskeleti / yalnız selamlama + tarih / bugünkü | **henüz hazır değil** (Workspace turunun V dilimi) | varyant hazırlanınca |

---

## Önce sohbette konuşulacak — temel model (ILKELER P18; seçim sohbetten sonra)

### S25. Birden çok lokasyonlu işte "bu hafta" hangi saate göre hesaplansın?
- **Hat:** veri hattı DB-4 BL-238'in kodunu bu karara bağlı tutuyor; DB-4'ün geri kalanı beklemiyor. Saat dilimi modeli temel model olduğu için önce sohbette konuşulur (P18).
- **Bugün:** Schedule ve Settings → Important dates "bu hafta"yı UTC'ye göre hesaplıyor. Örnek: Los Angeles şubesinde Pazar 20:00 (UTC'de Pazartesi 03:00) Ayşe gelecek haftayı düzenleyemiyor, ekranda "geçmiş hafta" sayılıyor; her Pazar akşamı CI'da da kırmızı çıkıyor. Koordinatör kararı KK-6 "vardiyanın lokasyonunun saat dilimi" diyor, ama bir düzenleme ya da önemli tarih birden çok lokasyona yayılabiliyor (ör. New York + Los Angeles).
- **(a) Her lokasyon kendi saatiyle: kayıt ya da yayın, işin dokunduğu her lokasyonda ayrı ayrı "geçmiş mi" diye bakılır; bir lokasyon için hafta bitmişse yalnız o lokasyonun satırı reddedilir ya da uyarılır. (Önerilen)**
  Zayıf yanı: tek bir kayıt yarı kabul, yarı ret olabilir; ekranın bunu satır satır anlatması gerekir ve 8 sunucu fonksiyonuna dokunur (büyük, R3).
  `Dayanak: KK-6 ("lokasyonun saat dilimi") + ILKELER P23 (çok lokasyonlu iş baştan kapsanır)`
- **(b) Workspace'in ana saat dilimi: tek saat, basit.**
  Zayıf yanı: New York'ta Pazartesi sabahı Los Angeles hâlâ Pazar akşamıyken Los Angeles müdürü haftasını düzenleyemez; aynı sorun başka saatte sürer.
- **(c) En geç lokasyon: lokasyonlardan biri hâlâ o haftadaysa hafta herkes için açık sayılır.**
  Zayıf yanı: New York'un kapanmış haftası Los Angeles yüzünden birkaç saat daha düzenlenebilir kalır; "geçmiş hafta kilidi" New York için gecikir.
- (d) Önce sohbette konuşalım (bu soru için varsayılan yol).
- Kaynak: `.newfork-inbox/done/20261006T173450-nf-db-veri-ekran-01-db4-tazelik.md` (Soru 1); BL-238, KK-6.
- **Aynı sohbette (KK-182):** duyurunun "Publish at / Expires at" saati de bu modele bağlı — bugün yazanın tarayıcısının saati: New York'taki owner Palo Alto için 09:00 seçer, duyuru Palo Alto'da 06:00'da çıkar (BL-878, EKRAN-07 S2). Ayrı soru açılmaz; S25'in cevabı ikisine birden uygulanır.

---

## Soru değil — cevaplı, sonraya ya da Claude'un kararı
Ham listedeki 43 madde Mert'e sorulmuyor (birkaç satır iki maddeyi birlikte taşır). Her biri dayanağıyla:

**KARARLAR'da ya da senin / koordinatörün kararında cevaplı (yalnız uygulama bekliyor)**
| Madde | Dayanak |
|---|---|
| Takas yetkisi işinin main'e gönderimi | CLAUDE.md §8 sürekli yetki (R3, güvenlik ONAY'ı var) |
| Belgesi eksik müdür Requests'i görür, karar veremez (BL-728) | KARARLAR Schedule → Requests (KK-158, KK-162) |
| Time off sıralaması "Decide by"a göre (BL-729) | KK-173 tek tablo |
| Tek karar tek bildirim (BL-730); kısaltma bildirimi izni onaylayan herkese (BL-736) | KK-158 §6 |
| Takas bildirimi yalnız karar veren müdüre (BL-731) | KARARLAR S4 (KK-158) |
| Time off "View" kalkar (BL-732) | KARARLAR S3 (senin kararın) |
| Takas reddi gizli notu (BL-735) | KARARLAR S5 (senin kararın) |
| Geçmiş izinde Revoke gizli (BL-744) | KK-158 §6 (ILKELER P25) |
| Bildirimden kapanmış talebi açma (BL-740); sekme kayması (BL-749) | tek tablo kararıyla kendiliğinden çözülür; uygulamadan sonra ölçülür |
| İşten çıkarmada boşalan vardiya bildirimi (BL-768) | KK-174 — **KARARLAR'a yazılmamış**, kayıt düzeltmesi |
| İşten çıkarılanın bekleyen izni geri çekilir (BL-771) | senin 2026-10-06 cevabın — **KARARLAR'a yazılmamış**, kayıt düzeltmesi |
| Bütün liste sayfalarına sayfalama (BL-787) | KARARLAR Genel → Liste sayfalarının ortak dili (senin kararın) |
| İkinci beyaz düğme sistemi (BL-255) | KK-10 (a) tek beyaz düğme; KARARLAR UI-09 |
| Sıralama oku hep görünür (BL-663) | dal 1'de uygulandı; S2 onayı kural olur |
| Requests'in şemsiye maddesi (BL-041) | ekran turu kapanınca kapanır |
| Owner / Management sistem kaydı (BL-218) | kararlar hazır; iş sırası koordinatörün |
| Templates: iki giriş ve Replace (BL-038'in iki kararı) | KARARLAR:420 ve KK-162 |
| Telefonda liste tabloları (BL-599) | senin 2026-10-05 kart satırı kararın; Employees kısmı S22'de |
| Elle yazılan to-do kimin listesi (Workspace S4) | KK-34 (workspace'in ortak listesi); "Resolved by" + Undo ILKELER P25 ile koordinatör verir |
| Billing checklist adımı kalkar | KARARLAR MVP sınırı |
| Canlı e-posta anahtarı (BL-101, BL-027) | S8'e bağlı; ayrı soru değil |

**MVP sonrası ya da kendi ekran turunda sorulur**
| Madde | Neden şimdi değil |
|---|---|
| BL-050 (shift type başına çok saat), BL-067 (saat limitleri), BL-122 (boş ızgara örneği), BL-123 (paylaşım linki) | MVP sonrası (ILKELER P13) |
| BL-126 (lokasyonlar arası taslak daveti) | KK-10: MVP sonrası |
| BL-057 (Shift Hub sekmeleri), BL-652 (Shift Hub geçmişi ne kadar geriye) | Shift Hub ekranının (13) turunda sorulur |
| BL-585 (belge zorunlu olunca muafiyetler) | Documents ekranının (6) turunda |
| BL-646 (onboarding'de resmî ad onayı söylenmiyor) | Onboarding ekranının (16) turunda |
| Employees işten çıkarma işinde ultrareview | o iş bitince sorulur (bugün yok) |

**Teknik ya da metin — koordinatör karar verir**
| Madde | Önerilen karar | Dayanak |
|---|---|---|
| BL-200 (takas onayı 2 sn bekliyor) | önce ölç, sonra tavanı düşür | P19 |
| BL-506 (izin süre işi 500'lük tek tur) | daha küçük parçalar, kısa kilit | P19 |
| BL-702 (taslak adıyla öteki lokasyonu yoklama) | ad çakışması kapsam dışı lokasyonu ele vermez | P19 + CLAUDE.md §9 |
| BL-465 (yanıtsız istekte çekmece kilitli) | zaman aşımı + Cancel açılır | P19 |
| BL-430 (tek seçenekli rol seçici) | düz metin | P20 |
| BL-459 (hata cümlesi alanın altında) | Locations alanının altında | CLAUDE.md §9 erişilebilirlik |
| BL-472, BL-473 (fotoğraf metinleri), BL-751 (owner'a "View-only access") | metni koordinatör yazar | P21 + KK-166 ("sen bul") |
| BL-477 (rol kaydında duyuru yok) | ekran okuyucuya duyurulan kısa onay | CLAUDE.md §9 |

**Önce ölçüm (soru değil, hüküm yok):** BL-425, BL-439, BL-483, BL-586, BL-588 — telefonda ya da pikselde bakılmadı; ölçülünce salt hata ya da S22'nin parçası olur.

---

## Kaynak notları
- Okunan: CLAUDE.md (§11.12 tam metin, §13), ILKELER, KARARLAR (ilgili bölümler grep ile), EKRAN-02…05 görev dosyaları ve OZET'ler, tazelik OZET §4 + BACKLOG satırları, REMOTE-CI, RESEND, KOORDINATOR-KARARLARI KK-160…179, HANDOFF, inbox A1A2 raporu ve devir notu, C3 / C1 / C1a raporları, Requests Warnings Lab artifact'i (salt okuma).
- Okunamayan: yok. Sınır: Employees telefon artifact'i (CQx4kkeVq1CJF3zGchvkXC) açılmadı, çünkü soru bilerek bekliyor. Görüntü dosyaları açılıp bakılmadı, yalnız varlıkları ölçüldü.
- Kayıt düzeltmesi önerisi (koordinatöre): KARARLAR:549 "S7 bekliyor" bayat; BL-768 ve BL-771 kararları KARARLAR'a yazılmalı; Requests Warnings Lab'ın G3 bölümü eski iki sekmeli listede çizili (S4'teki not).
