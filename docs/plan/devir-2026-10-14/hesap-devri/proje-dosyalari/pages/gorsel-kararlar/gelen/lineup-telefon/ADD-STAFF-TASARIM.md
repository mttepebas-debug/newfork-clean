# Add Staff penceresi: yeniden tasarım ön çalışması (Mert, 14 Ekim 03:06Z)

## Anladığım
- "+ Add Staff"e basınca açılan pencere bugün kişileri **departman ya da job'a göre** gruplayıp gösteriyor ("Sort by Department / Job"). Bu, senin 01:35Z isteğinle gelen sürüm.
- Bundan önceki sürümde kişiler **bugünkü durumlarına göre** gruplanıyordu: Available, Working at another location, Already working here today, On approved time off. Senin "daha iyiydi" dediğin bu.
- Hedef: aranan kişi daha hızlı bulunsun, pencere daha profesyonel görünsün ve daha profesyonel çalışsın.
- Etiketler üç işte kullanılacak:
  1. Kişi satırında görünecek.
  2. Süzme, gruplama ve sıralama yapılacak.
  3. Hangi departmanın ya da job'un "+ Add Staff"ine basıldıysa, o işe uyan kişiler öne çıkacak.
- Etiketler iki türde:
  - **Bugünkü durum:** Available · Already worked here · Working somewhere else · Not eligible to work here · Approved day off
  - **İş bilgisi:** Primary job · Other jobs (birden fazlaysa "Server +2"; dokununca hepsi açılır) · Department (atanmış job'lardan çıkar)

## Önerdiğim yapı
Yapı eski sürümün durum gruplarına dayanıyor. Basılan yere göre sıralama ve süzme de üstüne ekleniyor.

1. **Üst bölüm (kayar ama sabit kalır):**
   - Arama kutusu.
   - Altında süzgeç çipleri: `Server ×` · `Front of House ▾` · `Available ▾`.
   - Basılan satırın job'u ve departmanı çiplere hazır gelir. Çipi kaldıran herkesi görür.
2. **Gruplar bugünkü duruma göre, bu sırayla:**
   1. Available
   2. Already worked here
   3. Working somewhere else
   4. Approved day off
   - Her grubun başlığında kaç kişi olduğu yazar.
3. **Grup içi sıra uygunluğa göre:**
   1. Önce primary job'u basılan job olanlar.
   2. Sonra o job başka işleri arasında olanlar.
   3. Sonra aynı departmandan olanlar.
   4. En sonda geri kalanlar, soluk.
   - Böylece "öneri" ayrı bir kutu olmadan listenin tepesinde çıkar.
4. **Satır (iki satır, hepsi aynı yükseklikte):**
   - 1. satır: ad · primary job etiketi (job renginde) · `+2` çipi.
   - 2. satır: durum etiketi. Örnekler:
     - "Free today"
     - "Lunch here · 11:00 AM – 4:00 PM"
     - "Uptown · 4:00 PM – 10:00 PM"
     - "Approved day off"
   - `+2`ye dokununca küçük bir pencere açılır: öbür job'lar ve departmanları.
5. **Not eligible:**
   - Liste sonunda kapalı bir satır olur: "3 people can't work at Downtown".
   - Açınca nedenleriyle listelenir ve seçilemezler.
   - Arama kutusu onları da bulur. "Neden bulamıyorum?" sorusu böylece cevapsız kalmaz.
6. **Seçince:**
   - Bugünkü kurallar aynen geçerli.
   - İzinli kişi: "Add anyway" uyarısı çıkar, kişi yalnız bu lineup'a eklenir.
   - Başka lokasyondaki kişi: taşıma kuralı uygulanır. Bu müdür kişiyi hemen çeker; iki taraf da görür ve "Bring back" der. İçeride çalışan kişi çekilemez.
7. **Masaüstü:** aynı mantık, "+ Add Staff" düğmesine bağlı açılan bir panelde. Önce telefon taslağı yapılır.

## Eksik ya da yanlış olabilecek
- **"Already worked here"** iki şey olabilir:
  - (A) Bugün burada başka bir vardiyası var (eski sürümdeki "Already working here today").
  - (B) Bu lokasyonda daha önce çalışmış.
  - Varsayılan olarak A'yı kullanıyorum. Aşağıda soruyorum.
- **Not eligible:** bugünkü kurala göre bir kişi yalnız atandığı lokasyonda çalışabilir. Lokasyonda atanmış ama o departmanın hiçbir job'u olmayan kişi "not eligible" sayılmaz. Bu kişi soluk "other departments" altında görünür.
- **Department etiketi her satırda olunca kalabalık yapıyor.** Kişinin departmanı zaten job'undan belli. Ayrıca çip ve grup da departmanı söylüyor. Aşağıda kapsam dışı önerisi olarak soruyorum.
- **Dokunma ve fare:** telefonda fare olmadığı için `+2`ye dokununca açılır. Masaüstünde de tıklayınca açılır, yalnız üzerine gelince değil.

## Kapsam dışı önerilerim (onayını istiyorum)

### 1. Ayrı "Group by" düğmesi (Status / Job / Department)
- **Ne:** listenin gruplanma şeklini değiştiren üç seçenekli düğme.
- **Kim:** müdür, kişi eklerken.
- **Nerede:** Add Staff penceresinin tepesi.
- **Ne zaman:** her açılışta.
- **Neden çıkarıyorum:** gruplama tek yerden olunca (bugünkü durum) liste her seferinde aynı okunur. Job ve departman ise çip olarak süzer. Uygunluk sırası da doğru kişiyi zaten tepeye koyar. Üç gruplama biçimi "ayar cehennemi"ne kayar.
- **Nasıl:** yerine çipler ve uygunluk sırası.
- **Olursa:** müdür her açılışta "nasıl gruplansın?" diye düşünür. Ekrana bir sıra düğme eklenir; telefonda ilk kişi aşağı iner.
- **Olmazsa:** "bütün barmenleri tek grupta gör" isteği `Bartender` çipiyle karşılanır. Fark: o barmenler durumlarına göre gruplu görünür, tek blok olarak değil.

### 2. Her satırda Department etiketi
- **Ne:** satırda job'un yanında "Front of House" gibi bir yazı.
- **Neden çıkarıyorum:** satıra üçüncü bir etiket eklenince her satır kalabalıklaşır. Departman zaten job renginde, çipte ve `+2` penceresinde görünüyor.
- **Olursa:** her satır daha uzun olur; telefonda ad kısalabilir ("Rachel Ad…").
- **Olmazsa:** departman bilgisi kaybolmaz. Süzme, sıralama ve `+2` penceresinde görünmeye devam eder.

## Sorularım
1. "Already worked here" için:
   - A: bugün burada başka vardiyası var (önerilen).
   - B: burada daha önce çalışmış.
2. Kapsam dışı 1 ("Group by" düğmesi) ve 2 (satırda departman): onaylıyor musun?

## Bence
- Durum grupları, uygunluk sırası ve süzgeç çipleri birlikte en hızlı bulmayı sağlıyor. Müdürün soruları "kim boş, kim bu işi yapar?" sırasıyla cevaplanıyor.
- **Artısı:** eski sürümün okunuşu korunuyor. Basılan yer tek dokunuşla doğru kişiyi tepeye getiriyor.
- **Eksisi:** çipler bir sıra yer kaplıyor. Kaydırınca küçülüp tek satıra iniyorlar.
- **Taslak planı:** telefon taslağında Original (bugünkü) ve iki varyant yapacağım:
  1. **Durum listesi:** yukarıdaki yapı.
  2. **Önce en uygunlar:** tepede "Best fit · 3" şeridi, altında durum grupları.
- **Elenen:** tablo görünümü (sütunlu, sıralanabilir). Telefonda sığmıyor; masaüstünde ise iki ayrı tasarım demek.

## Mert'in 14 Ekim 04:23Z notları (taslak v7)
1. **Move here onayı:** "Emin misiniz?" penceresi yerine uygulamanın iki dokunuş kuralı. İlk dokunuş düğmeyi "Confirm" yapar ve satırın altına ne olacağını yazar ("Ava leaves Uptown's Dinner lineup. Uptown sees the move and can bring Ava back."). İkinci dokunuş taşır. 4 saniye içinde basılmazsa düğme geri döner. Toast'taki "Bring back" kalır.
2. **"Already working here" → "Has another shift here":** satırın altında öbür vardiyanın saati ("Lunch 11 AM – 4 PM") ve bu vardiyayla günün toplamı ("11h today"). 8 saati geçen toplam sarı. Yalnız bilgi; eklemeyi engellemez.
3. **Etiketler ortada kendi sütununda:** lineup satırında Opener, Closer, Training, Lead ve "From Uptown" gibi etiketler adın yanından alındı, ad ile Section arasında "Label" başlıklı ayrı bir sütunda (taslak v9; Mert 04:52Z düzeltmesi: "closer training gibi labelları orta columnda ayır"). Add Staff penceresinde de job etiketi ve +2 ortadaki sütunda kalır.
4. **Klavye:** araştırma ayrı (thread cevabında).
