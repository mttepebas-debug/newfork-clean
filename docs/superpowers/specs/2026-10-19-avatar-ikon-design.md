# Avatar ve iş ikonları: işe Lineup ikonu, workspace'e özel avatar, Lineup'ta kim hangi çizimi görür (AVATAR-IKON) — tasarım

- **Tarih:** 2026-10-19 (California)
- **İsteyen ve karar veren:** Mert. Kararlar 18 Ekim akşamı ile 19 Ekim 01:00 (California) arasında ana oturumda verildi. Görsel seçimler "Avatar ve İş İkonları" sayfasında: https://claude.ai/artifact/3Uug2yR2ahdbSBUdiCqAyx (Tur 2). Bu konunun görsel kararları yalnız o sayfada tutulur, "Bekleyen görsel kararlar"a girmez (Mert, 19 Eki).
- **Yazan:** ana oturumun Claude'u. "Claude'un kararı" diye işaretli maddeler Mert'in onayından geçmedi; Mert okurken bunlara bakar.
- **Sınıf:** incelemeli. Birden çok ekrana, paylaşılan tiplere ve API cevap şekline dokunur; yeni `*_service`, storage ve yetki kuralı içerir. Canlı adımı riskli migration'dır: `nf-guvenlik` ONAY, ardından Mert'in ana oturumdaki "evet"i.
- **Kaynak:** `origin/main` 8ef43cf1c üzerinde üç salt okur keşif yapıldı (avatar ve fotoğraf, işler, Lineup). Bu belgedeki dosya ve satır referansları o sürümden.

## 1. Neden

Lineup'ta her kişinin solunda baş harfleri duruyor. Kodda da "henüz iş ikonu yok, baş harf" yazıyor (`apps/web/src/views/LineupPhone.tsx:618`). Mert 13 Ekim'de baş harf yerine işe özel çizimler istedi. 14 Ekim'de 173 parçalık bir restoran ikon paketi çizildi: 52 ince çizgili ikon, 121 renkli çizim. Mert 19 Ekim'de 173 parçanın hepsinin şimdilik kalmasına karar verdi.

Bugün kişinin fotoğrafı iki yerde tutuluyor:
- Hesapta, tek ve bütün workspace'lerde geçerli (`user_profiles.avatar_object_path`). Tarayıcı doğrudan storage'a yazıyor.
- Workspace'te (`employee_private_profiles.avatar_object_path`). Buraya değer yazan bir kod yok; tek yazma işlemi müdürün "Remove photo" ile değeri boşaltması.

Mert'in modeli şöyle:
- Kişinin her workspace'te tek bir **avatarı** olur: ya kendi yüklediği fotoğraf ya da ürünün arşivinden hazır bir çizim. İkisi aynı pencerede seçilir.
- Lineup herkes için aynı dilde konuşur: **yalnız çizim, asla fotoğraf.**
- Kişi çizim seçmemişse, o lineup'taki işinin ikonlarından biri dengeli dağıtılır.
- O işin ikonu yoksa, "çalışan" ikonlarından biri dengeli dağıtılır.

## 2. Hedefler, hedef olmayanlar, anti-hedefler

**Hedefler**
- Owner ve işleri düzenleyebilen yöneticiler, her işe arşivden birden çok "Lineup ikonu" seçer. Yeni iş açılınca ikonlar işin adına göre kendiliğinden önerilir.
- Her kişi her workspace'te kendi avatarını seçer: fotoğraf yükler ya da hazır bir çizim seçer. Bu seçim yalnız o workspace'te geçerlidir.
- Yeni bir workspace'in onboarding'inde, kişinin en son kullandığı avatar hazır gelir. Kişi kullanır ya da değiştirir.
- Lineup'ta her satırda bir çizim görünür. Aynı lineup'ta herkesin çizimi sabittir.
- Müdür artık kişinin fotoğrafını yükleyemez. Yalnız kişinin kendi yüklediği fotoğrafı kaldırabilir (uygunsuz fotoğraf için).

**Hedef olmayanlar**
- Lineup dışındaki ekranlarda avatar göstermek: Employees listesi, takas, Availability, duyurular. Bugün oralarda baş harf var ve öyle kalır. Avatarı oralara taşımak ayrı bir iştir.
- Workspace'lerin kendi ikonlarını yüklemesi. Arşiv ürünündür (Mert).
- İkonların ten rengi. İkonlar geliştirilirken konuşulacak (Mert).
- Paketteki 173 parçanın elenmesi. Hepsi şimdilik kalıyor (Mert, 19 Eki).

**Anti-hedefler (çalışsa bile başarısızlık sayılır)**
- Lineup'ta herhangi bir kişinin yüklediği fotoğrafın, herhangi bir yoldan görünmesi.
- Aynı lineup'ta yeniden yayın, düzenleme ya da sayfa yenileme sonrası birinin çiziminin değişmesi. Müdür ve çalışan ekranında farklı çizim görünmesi de buna dahil.
- Yeni ayar, anahtar ya da bildirim eklemek. Fotoğraf kaldırılınca bildirim gitmez (Mert).
- İkiz sistem. Hesap fotoğrafının bugünkü "tarayıcı storage'a doğrudan yazar" yolu, yenisi gelince silinir (CLAUDE.md §3.A.4). Eski fotoğraf gösterme yolları da yeni avatar okumasına geçer.

## 3. Kavramlar

- **Arşiv:** ürünün 173 parçalık çizim seti. Her parçanın kalıcı bir anahtarı var (ör. `053-server-tray-ill`). Ayrıca adı, önerildiği işler ve türü var. Tür: kişi çizimi, nesne, ince çizgili ikon ya da "çalışan" çizimi.
- **İş ikonları:** bir işe seçilmiş arşiv anahtarlarının sıralı listesi. Boş olabilir.
- **Avatar:** kişinin bir workspace'teki görüntüsü. Ya **fotoğraf** (o workspace'in özel deposunda) ya **hazır çizim** (arşiv anahtarı) ya da hiçbiri.
- **Son avatar:** kişinin hesabında tutulan, en son herhangi bir workspace'te seçtiği avatar. Yeni onboarding'de öneri olarak kullanılır.
- **Çalışan ikonları:** arşivde "çalışan" türündeki çizimler. Hiçbir işe bağlı değiller; işinin ikonu olmayan kişiye verilirler. Birden çok çizilir (Mert). Bugün henüz çizilmediler.
- **Lineup çizimi:** Lineup satırında kişinin solunda görünen çizim.

## 4. Kurallar

### 4.1 Arşiv
- Arşiv kodla birlikte gelir. Uygulamanın içinde dosya olarak durur, ücretli servis yoktur.
- **Kimlik listesi.** Anahtar, ad, önerilen işler ve tür `packages/shared`'da tutulur. Web de API de aynı listeyi okur.
- **SVG dosyaları** web'de ayrı bir parça olarak yüklenir; ilk açılışı ağırlaştırmaz (Claude'un kararı).
- **Veritabanında** arşiv anahtarlarının tablosu tutulur. Bu sayede iş ikonu, avatar ve Lineup dağıtımı yalnız bilinen anahtarları kabul eder (Claude'un kararı).
- **Anahtarlar kalıcıdır.** Bir parça arşivden çıkarılırsa, onu kullanan kayıtlar aynı migration'da temizlenir (eski veri korunmaz, §3.A.5).
- **Ekleme yalnız bizden.** Arşive parça eklemek, yeni dosya ve migration ile yapılır.

### 4.2 İş ikonları (Settings → Jobs → iş çekmecesi)
- **Yer:** Details bölümünün altında yeni bir "Lineup icons" bölümü.
  - Masaüstünde (geniş çekmece) arşivin tamamı çekmecenin içinde, kaydırılabilir bir ızgarada durur. Tıklamak seçer ya da bırakır. Ayrı pencere yoktur.
  - Telefonda (dar çekmece) seçili ikonlar kareler hâlinde durur. "Choose icons" düğmesi alttan açılan pencerede aynı ızgarayı gösterir.
  - Her iki düzende de filtreler (Suggested, People, Things, All) ve arama vardır. Suggested, işin adına göre önerilenlerdir. (Mert, 19 Eki: masaüstü B, telefon A.)
- **Bölümün metinleri:**
  - Seçili sayısı gösterilir.
  - Açıklama: "Each person on this job gets one of these on the Lineup, unless they picked their own avatar."
  - Hiç ikon yoksa: "No icons. People here get a team member icon on the Lineup."
- **Kaydetme:** ikon listesi çekmecenin bugünkü Save'iyle kaydedilir.
  - Ad, renk ve departman gibi, değişiklik algılamasına (`detailsDirty`) ve "beklenen kayıt" kontrolüne girer.
  - Ayrı bir kaydetme düğmesi olmaz.
- **Yeni iş:** "New job" çekmecesinde ad yazıldıkça, önerilen ikonlar seçili gelir.
  - Kullanıcı seçime dokunduğu anda öneri durur; ad değişse de seçim değişmez.
  - Not satırı: "Suggested for "Bartender". Change them any time."
  - (Mert, 3-A.)
- **Öneri kuralı** (Claude'un kararı):
  - İşin adı, her parçanın "önerilen işler" listesiyle büyük-küçük harf gözetmeden karşılaştırılır.
  - Tam eşleşme ve içerme sayılır. Örnek: "Line Cook" ile "line cook" eşleşir.
  - En çok 8 parça önerilir; renkli çizimler önce gelir.
- **Bugünkü işler:** migration, bugünkü her işe aynı kuralla önerilen ikonları yazar. Böylece demo ve test workspace'leri boş başlamaz.
  - Gerekçe: eski veri korunmaz, canlıda gerçek müşteri yok. (Claude'un kararı.)
- **Owner işi** (`system_key = 'owner'`) da ikon alabilir (Claude'un kararı).
- **Yetki:** bugünkü iş düzenleme yetkisi (`settings.jobs.manage`). İkon listesi işin bir alanıdır; yeni bir izin açılmaz.

### 4.3 Avatar (Account → Profile)
- **Yer:** sayfanın en üstündeki fotoğraf alanı. Bugünkü "Upload" düğmesi ve biçim notu kalkar.
- **Görünüm:**
  - Büyük daire, sağ altında kamera rozeti.
  - Yanında ad ve e-posta.
  - Düğmeler: "Add avatar" (avatar yoksa) ya da "Change avatar". Avatar varsa yanında "Remove" (iki tık, kırmızı).
  - Not: "Your avatar in <workspace>. Other workspaces keep their own. Lineups show an avatar, never a photo."
- **Pencere** (Mert, 19 Eki: B, masaüstü ve telefon):
  - Tek pencere, tek liste.
  - Üstte önizleme: daire, ad, seçilenin adı, "Only in <workspace>…" notu.
  - Altta ızgara. İlk kare "Upload photo", ardından arşiv. Filtreler ve arama iş çekmecesindekiyle aynı.
  - Suggested, kişinin bu workspace'teki işlerine göre önerilenlerdir.
  - Telefonda pencere alttan açılır.
  - Altta: Cancel, Save. Avatar varsa solda "Remove avatar" (iki tık).
  - "Try with a sample photo" yoktur.
- **Fotoğraf yükleme:**
  - Bugünkü kırpma penceresi (`AvatarCropDialog`) "Upload photo"dan sonra açılır (Claude'un kararı).
  - Sınır bugünkü gibi: JPG, PNG ya da WebP, en çok 5 MB.
- **Kapsam:** Account → Profile, kişinin o an içinde bulunduğu workspace'in avatarını düzenler. "Back to workspace" ile döndüğü workspace budur.
- **Yazma yolu:** avatar API üzerinden yazılır.
  - Fotoğraf, workspace'in özel deposuna API ile yüklenir.
  - Hesap fotoğrafının tarayıcıdan doğrudan storage'a yazma istisnası silinir (`apps/web/CLAUDE.md` istisna listesinden de çıkar).
- **Son avatar:** her kayıtta API, kişinin hesabındaki "son avatar"ı da günceller.
  - Fotoğrafsa, fotoğrafın hesap deposundaki kopyası.
  - Hazır çizimse, anahtarı.
- **Kaldırma:** avatarı kaldırınca o workspace'te avatar olmaz. "Son avatar" değişmez (Claude'un kararı).
- **Uygulama kabuğu:** sağ üst ve kenar çubuğundaki kişi dairesi (`CurrentUserAvatar`) bu workspace'in avatarını gösterir.
  - Fotoğrafsa fotoğraf, çizimse çizim, hiçbiri değilse baş harf.
  - Account → Profile'ın sol üstündeki daire de aynı.

### 4.4 Avatar (onboarding)
- **Yer:** onboarding → 1. adım Profile → "Your details" sayfası. Başlığın altında, form alanlarının üstünde bir "Your avatar" kutusu.
- **Kişinin son avatarı varsa:** kutu onu gösterir.
  - Metin: "From your <önceki workspace> profile. It will be your avatar here too, unless you change it."
  - Düğme: "Change".
  - "Save and continue" ile bu avatar bu workspace'in avatarı olur. Fotoğrafsa, fotoğraf bu workspace'in deposuna kopyalanır.
- **Son avatarı yoksa** (ilk workspace): baş harf ve "Optional. Upload your photo or pick one of ours." metni, düğme "Add avatar".
- **Pencere:** "Change" ya da "Add avatar", 4.3'teki pencerenin aynısını açar. Önizleme önerilen son avatarla başlar.
- **İsteğe bağlı:** avatar onboarding'i bitirmek için zorunlu değildir.
- **Kişi değiştirirse:** yeni seçim yalnız bu workspace'te geçerli olur; "son avatar" yeni seçim olur (Mert).

### 4.5 Müdür (Employees → kişi → Access → "Profile photo")
- Müdür kişinin fotoğrafını yükleyemez. Bugün de yükleme yolu yok, böyle kalır (Mert, 2-A).
- Müdür yalnız kişinin **kendi yüklediği fotoğrafı** kaldırabilir: "Remove photo", iki tık, kırmızı.
  - Kişinin hazır çizimi kaldırılamaz. Hazır çizimde ya da avatar yokken satır görünmez (Claude'un kararı).
- **Yetki:** bugünkü `employee.save` ve kapsamı.
- **Bildirim yok** (Mert, A). Kişi Profile'a girince avatarının kalktığını görür; Lineup zaten iş ikonunu gösterir.
- **Aynı kutudaki eski metin sorunları bu işte düzelir:**
  - Aynı şeyi söyleyen üç yazı (BL-472).
  - Fotoğraf yokken nedeni söylemeyen pasif düğme (BL-473).
  - Bu düzende düğme yalnız fotoğraf varken görünür.

### 4.6 Lineup çizimi
Her lineup satırında, kişinin solunda tek bir çizim vardır. Sıra (Mert):
1. Kişinin bu workspace'te seçtiği **hazır çizim**.
2. Yoksa: kişinin o lineup'taki **işinin ikonlarından** biri. Kişi fotoğraf yüklemiş olsa da bu adıma geçilir.
3. O işin ikonu yoksa: **çalışan ikonlarından** biri.

**Dağıtım** (Mert):
- Aynı işteki kişiler o işin ikonları arasından rastgele ama dengeli dağıtılır: kimse ikinci kez aynı ikonu almadan önce bütün ikonlar birer kez kullanılır.
- İkon kişiden azsa tekrar olur. Çalışan ikonları da aynı yolla, o lineup'taki bütün "ikonsuz" kişiler arasında dağıtılır.

**Sabitlik** (Mert):
- Bir lineup'ta kişinin çizimi; yayından kaldırma, düzenleme, yeniden yayın ve sayfa yenilemede değişmez.
- Müdürün ve çalışanın ekranında aynıdır.
- Yalnız **yeni vardiyanın yeni lineup'ı** yeniden dağıtır.
- Lineup'ın kimliği (lokasyon, gün, vardiya türü) üçlüsüdür. Kayıt ilk yayında `daily_lineups.id` ile doğar ve unpublish/republish'te değişmez.

**Saklama** (Claude'un kararı):
- **Yayın öncesi (taslak):** dağıtım, üçlüden türeyen sabit bir tohumla (seed) hesaplanır. Müdür taslakta da çizimleri görür, sayfa yenilense de aynıdır.
- **İlk yayında:** o anki dağıtım lineup'a yazılır. Taslakta görülen ile yayında görülen aynıdır.
- **Yayından sonra** lineup'a eklenen kişi, işinin ikonları arasında o lineup'ta en az kullanılanı alır ve o da yazılır.
- **Sonradan yapılan değişiklikler** (işin ikon listesi, kişinin işi) yazılmış çizimleri değiştirmez.
  - İstisna: kişi o lineup'ta başka bir işe geçirilirse çizimi yeni işine göre yeniden verilir. Gerekçe: çizim işi anlatır.

**Kişi sonradan hazır çizim seçerse:** 1. adım yazılmış dağıtımın önüne geçer. Kişinin kendi seçimi her zaman önce gelir. Seçimini kaldırırsa yazılmış dağıtım geri gelir.

**Görünüm:** bugünkü baş harf dairesinin yerine, aynı ölçüde çizim. Yerler:
- telefon Lineup, müdür (`LineupPhone`);
- çalışanın Lineup'ı (`EmployeeLineup`, büyük ve küçük daire);
- "kimler okudu" listesi (`LineupReadList`).

Masaüstü Lineup tablosunda bugün daire yok. Masaüstünün yeni tasarımı main'e girince, onun satırına da aynı çizim konur (Claude'un kararı). Satır tasarımının kendisi "Line-up telefon" sayfasındaki çalışmanındır; bu iş yalnız dairenin içini değiştirir.

**Fotoğraf yok:** Lineup okuma cevabı hiçbir kişi için fotoğraf yolu ya da adresi taşımaz. Yalnız çizim anahtarı taşır.

### 4.7 Yetki
- Kişi kendi avatarını yalnız kendi üyeliği için okur ve yazar (bugünkü `account.self` / `onboarding.self` çizgisi).
- Başkasının avatarına tek yazma yetkisi müdürün fotoğraf kaldırmasıdır (`employee.save`).
- Lineup çizimi, Lineup'ı okuyabilen herkese o lineup'ın çizim anahtarlarıyla birlikte döner. Ayrı bir izin açılmaz.
- Workspace sınırı: kişinin bir workspace'teki avatarı başka bir workspace'te okunamaz. "Son avatar" yalnız kişinin kendisine görünür.

## 5. Yapım kısıtları
- **CLAUDE.md §3.A bütünüyle geçerlidir:**
  - Yeni her tablo ve fonksiyon RLS ile korunur ve `app_private.authorize()` / `scope_set()` üzerinden geçer.
  - "Hayır" tek biçimdedir: 42501 + `authz.*`.
  - Yeni `*_service` yetki matrisinde ve katalogda sınıflanır.
- **Eski yetki köprüsü:** iş yazma fonksiyonlarının gövdesi bu işte değişeceği için (`create_job_with_assignments_service`, `update_job_details_and_assignments_service` ve departmanla iş yazanlar), içlerindeki eski `request.jwt.claim` köprüsü `authorize()`'a çevrilir. Katalog sayacı yalnız azalır.
- **Önce kırmızı test:**
  - pgTAP: arşiv anahtarı denetimi, iş ikonu kaydı, avatar oku/yaz/kaldır, müdürün yalnız fotoğrafı kaldırabilmesi, Lineup dağıtımının dengesi ve sabitliği (unpublish → edit → republish), fotoğrafın Lineup cevabında hiç olmaması, workspace sınırı.
  - Yetki matrisi ve katalog.
  - Vitest: iş çekmecesi (masaüstü ızgara, telefon pencere, öneri), avatar penceresi, onboarding kutusu, Lineup daireleri.
  - Playwright: owner işe ikon seçer ve Lineup'ta görür; çalışan avatar seçer ve Lineup'ta görür; fotoğraf yükleyen çalışan Lineup'ta iş ikonu görür; ikinci workspace onboarding'inde son avatar hazır gelir.
- **Performans:** Lineup okuması bugünkü 50 ms sınırında kalır (`lineup_foundation.test.sql:333-352`).
- **Test dünyası ve fikstürler:** `supabase/test-support/builder.sql`, `lineup-fixtures.ts` yeni alanlarla kurulur.
- **Paket boyutu:** arşiv SVG'leri ana pakete girmez.
- **Kurallar:** tarayıcı diyaloğu yok; yıkıcı eylem iki tık; yalnız `--theme-*` renkleri; WCAG AA, klavye ile seçim, görünür odak.
- **Canlı adım:** riskli migration (yedek, ONAY, Mert'in "evet"i, ana oturum uygular).

### 5.1 Çift rol işiyle ilişki
Çift rol işi (ROL-CIFT) main'de ilerliyor (son commit 8ef43cf1c, dilim 2). Üyelik modeli, onboarding ve Employees çekmecesi ona da dokunuyor. Bu yüzden:
- **Avatarın veri yeri** "kişinin workspace'teki üyeliği" olarak tanımlanır, "çalışan kaydı" olarak değil. Yalnız yönetim rolü olan kişinin de avatarı olur. Gerçek tablo, yapım anında ROL-CIFT'in o günkü modeline göre seçilir.
- **Onboarding (4.4) ve Employees → Access (4.5) dilimleri**, ROL-CIFT'in o ekranlara dokunan dilimleri main'e girdikten sonra başlar. Böylece iki iş aynı dosyada çakışmaz.

## 6. Etkilenen yerler
- **Veritabanı:**
  - arşiv anahtar tablosu;
  - `jobs`'a ikon listesi;
  - üyelik başına avatar (fotoğraf yolu ya da çizim anahtarı, en çok biri);
  - hesapta son avatar;
  - lineup başına kişi çizimi;
  - iş okuma/yazma, avatar ve Lineup servisleri;
  - storage (workspace fotoğraf deposu, kopyalama);
  - yetki matrisi ve katalog;
  - test dünyası.
- **API:** iş uçları (cevap şekli `jobSchema` + `jobInputSchema`), yeni avatar uçları (oku, kaydet, fotoğraf yükle, kaldır), müdürün kaldırma ucu, onboarding Profile adımı, Lineup uçları (satıra çizim anahtarı).
- **Paylaşılan:** `packages/shared` arşiv listesi, iş ve Lineup tipleri.
- **Web:**
  - `JobAssignmentsDrawer.tsx` ve Jobs sayfası;
  - `ProfilePage.tsx`, `AccountLayout.tsx`, `AccountAvatar.tsx`;
  - `EmployeeOnboardingPage.tsx`;
  - `EmployeeDrawer.tsx` (Access → Profile photo);
  - `LineupPhone.tsx`, `EmployeeLineup.tsx`, `LineupReadList.tsx`;
  - uygulama kabuğundaki kişi dairesi;
  - `apps/web/CLAUDE.md` istisna listesi.
- **Silinecekler:** hesap fotoğrafının tarayıcıdan doğrudan yazma yolu ve istisnası; Account → Profile'ın bugünkü "Upload" düzeni; `get_own_employee_avatar_path_service` ve `get_employee_avatar_path_service` (yenisi gelince yerleri değişir; silinenler `retired_objects_stay_gone`'a eklenir).

## 7. Yolda bulunanlar
- **İki avatar alanı (BL-072):** bu işle anlamları ayrılır. Hesaptaki alan "son avatar" olur, workspace'teki alan "avatar". Madde bu işle kapanır.
- **Profile photo kutusunun metinleri (BL-472, BL-473):** bu işte, 4.5'te düzelir.
- **Backlog notu düzeltmesi:** 6 Ekim tazelik notundaki "workspace fotoğrafı hâlâ okunup yazılıyor" cümlesi yanlış; bugün tek yazma işlemi değeri boşaltmak. Kayıt güncellenmeli.

## 8. Kapanan sorular

**Mert'in kararları:**
- **Lineup sırası** (18 Eki): kişinin hazır çizimi → işinin ikonları → çalışan ikonları. Çalışan ikonları birden fazla çizilir ve dengeli dağıtılır.
- **Dağıtım** (18 Eki): rastgele ve dengeli. Aynı lineup'ta sabit; yeni vardiyanın yeni lineup'ında yeniden dağıtılır.
- **Kendi fotoğrafı Lineup'ta asla görünmez** (18 Eki). Gerekçe: gizlilik, uygunsuz fotoğraf riski, görünüm birliği.
- **Avatar tek kavram** (18 Eki): fotoğraf ya da hazır çizim, aynı pencerede; workspace'e özel. Son avatar yeni onboarding'de öneri olur; değişiklik yalnız o workspace'te kalır.
- **Fotoğraf da workspace'e özel** (19 Eki, 1: evet). 18 Eki'deki "hesap düzeyinde kalsın" cevabının yerine geçti.
- **Arşivin tamamı seçilebilir** (2-B). Kişi hazır avatarı iş ikonları dahil bütün arşivden seçer.
- **Yeni işe öneri** (3-A). Yeni iş açılınca ikonlar adına göre önerilir.
- **Arşiv ürünündür.** Workspace yüklemez. Ten rengi ikonlar geliştirilirken konuşulacak.
- **Müdür fotoğraf yükleyemez** (19 Eki, 2-A). Yalnız kişinin yüklediği fotoğrafı kaldırabilir.
- **Kaldırınca bildirim yok** (19 Eki, A).
- **Görsel seçim** (19 Eki, 00:19): iş çekmecesi masaüstü B, telefon A. Avatar penceresi B, Profile'da ve onboarding'de, masaüstünde ve telefonda. "Try with a sample photo" yok.
- **İkon paketi** (19 Eki): 173 parçanın hepsi şimdilik kalır.

## 9. Yapana bırakılanlar
- **Veri modelinin biçimi:**
  - iş ikonları `jobs` üstünde dizi mi, ayrı tablo mu;
  - avatar hangi üyelik tablosunda;
  - Lineup çizimi `daily_lineup_rows` üstünde mi, ayrı tablo mu.
- **Dağıtımın tam algoritması**, 4.6'daki dengeyi ve sabitliği sağladığı sürece.
- **SVG'lerin web'e nasıl gömüleceği** (lazy chunk, `import.meta.glob`, sprite), 5'teki boyut kısıtına uyduğu sürece.
- **Dilimleme ve sıra.** Önerilen sıra:
  1. Arşiv (anahtar listesi, SVG'ler, veritabanı tablosu) ve çalışan ikonlarının çizilmesi (görsel onayı Mert verir, "Avatar ve İş İkonları" sayfasında).
  2. İş ikonları (veri, API, iş çekmecesi).
  3. Avatar (veri, API, Account → Profile, uygulama kabuğu).
  4. Lineup çizimi (dağıtım, saklama, bütün Lineup daireleri).
  5. Onboarding avatarı ve Employees → Access ("Remove photo"); ROL-CIFT'in ilgili dilimlerinden sonra.
- **Çalışan ikonları çizilmeden** 4. dilim yayına çıkmaz. O zamana kadar ikonsuz işteki kişi için baş harf kalır, ama yayına bu hâliyle çıkmaz.
