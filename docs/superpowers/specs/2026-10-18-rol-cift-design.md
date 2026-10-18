# Çift rol: Employee ve yönetim rolü aynı hesapta (ROL-CIFT) — tasarım

- **Tarih:** 2026-10-18 (California)
- **İsteyen ve karar veren:** Mert. Bu belgenin bütün "Mert" kararları aynı gün ROL-CIFT oturumunda verildi ve karar defterine yazıldı (`docs/plan/KARARLAR.md` S-164, S-165, S-166, S-167; hatırlatma `docs/plan/BACKLOG.md` BL-1143).
- **Yazan:** ROL-CIFT oturumunun Claude'u. "Claude'un kararı" diye işaretli maddeler Mert'in onayından geçmedi; Mert okurken bunlara bakar.
- **Sınıf:** incelemeli (yetki çekirdeği, RLS, davet, rol değiştirme, işten çıkarma, bildirim, birden çok ekran); canlı adımı riskli migration (`nf-guvenlik` ONAY + Mert'in ana oturumdaki "evet"i).

## 1. Neden

Bugün bir kişinin tek rolü var: owner, admin, manager ya da employee. Yöneticinin çalışan arayüzüne girip girmemesi rolden değil, "çalışan kaydı var mı" sorusundan çıkıyor. Bunun sonuçları:

- Vardiyası olmayan yönetici de takas, cover ve release listelerinde çıkıyor; açık vardiya bildirimleri ona da gidecek.
- Yöneticinin "Employee view"ü yarım: müsaitlik formu açıklamasız kilitli (BL-796); çalışan kaydı olmayan yöneticide düğme görünüyor ama boş ekrana çıkıyor.
- Müdürün yönettiği lokasyonlar çalıştığı lokasyon atamalarından geliyor; Beşiktaş'ta yalnız ara sıra çalışmak için atanan Kadıköy müdürü Beşiktaş'ın yöneticisi de oluyor.

Mert'in modeli: bir hesap, iki ayrı arayüz ve erişim. Kişi yalnız çalışan, yalnız yönetici ya da ikisi birden olur. İkisi birdense iki arayüz iki ayrı kişi gibi davranır: birinden ötekine bilgi ve bildirim geçmez.

## 2. Hedefler, hedef olmayanlar, anti-hedefler

**Hedefler**
- Rol, arayüz erişimini ve Schedule'a girmeyi tek başına belirler; "çalışan kaydı var mı" ayrı bir anahtar olmaktan çıkar.
- Yalnız yönetim rolü olan kişi Schedule ızgarasında yoktur ve takas, cover, release, pick up, açık vardiya akışlarının hiçbirine girmez.
- Çift rollü kişi çalışan tarafında sıradan bir çalışan gibi işler; yönetim tarafındaki yetkisi çalışan tarafındaki işlerine karışmaz.
- Yönettiği lokasyon ile çalıştığı lokasyon ayrıdır.
- İşten çıkarma ve rol bırakma, açık vardiya ve talepleri kendisi kapatır; yarım iş kalmaz.

**Hedef olmayanlar**
- Ekranın görsel tasarımı. Davet ekranı, çekmece ve Employee view geçişi için varyant sayfası ayrı turdur; Mert seçer.
- Yalnız yönetim rolündeki kişinin izni (time off). Şimdilik yok (S-166); Mert sonra yeniden düşünecek (BL-1143).
- Lokasyon başına farklı yönetim rütbesi (bir yerde Manager, başka yerde Admin). Yönetim rolü hesap başına tektir.
- Bordro, puantaj, clock-in (MVP dışı).

**Anti-hedefler (çalışsa bile başarısızlık sayılır)**
- Yeni ayar ya da anahtar eklemek (CLAUDE.md §1). "Exclude from schedule" dışında ızgaraya girişi yöneten ikinci bir işaret olmaz; ızgaraya giriş Employee rolünden gelir.
- İki kişiymiş gibi davranırken yetkinin gevşemesi: kişi kendi talebine ya da taraf olduğu işe hiçbir arayüzden karar veremez.
- Yönetim arayüzünde çalışan tarafının bildirimi, ya da çalışan arayüzünde yönetim bilgisi görünmesi.
- İkiz sistem: eski "çalışan kaydı var mı" kapısı ve "yöneticinin lokasyonu = çalıştığı lokasyon" kuralı yenisi gelince silinir (CLAUDE.md §3.A.4).

## 3. Kavramlar

- **Hesap:** bir kişinin bir workspace'teki tek üyeliği. Bugünkü gibi `UNIQUE(workspace_id, user_id)`.
- **Employee rolü:** var / yok.
- **Yönetim rolü:** yok, Manager, Admin ya da Owner; en çok biri. Özel roller bugünkü gibi bir erişim sınıfına bağlıdır (manager tipi özel rol = Manager).
- **Kural:** her hesapta en az biri vardır: Employee rolü ya da bir yönetim rolü.
- **Rütbe:** kişinin yönetim tarafındaki rütbesi (owner > admin > manager); yalnız Employee olanın rütbesi employee. Rütbe yalnız yönetim tarafındaki işlerde sayılır (madde 4.5 ve 4.8).
- **Works at:** Employee rolünün lokasyon ve iş atamaları (bugünkü lokasyon + iş ataması).
- **Manages:** Manager rolünün yönettiği lokasyonlar. Admin ve Owner bütün lokasyonları yönetir, "Manages" seçimi yoktur.

## 4. Kurallar

### 4.1 Arayüz erişimi (Mert)
| Roller | Yönetim arayüzü | Çalışan arayüzü | Geçiş satırı ("Employee view" / "Management view") |
|---|---|---|---|
| Yalnız Employee | kapalı | açık | yok |
| Yalnız yönetim rolü | açık | kapalı (adresle açılırsa yönetim ana sayfasına döner) | yok |
| İkisi birden | açık | açık | var (bugünkü yerinde: kenar çubuğunda Account'un üstü; telefonda More) |

Sunucu kapısı rolden okunur: çalışan arayüzünün okuma servisleri (bugün `employee_hub_actor_service`) Employee rolü yoksa `authz.out_of_scope` verir. Web yalnız yansıtır (`can()`).

### 4.2 Lokasyon ve iş (Mert, S-167)
- Davette ve Employees çekmecesinde önce roller seçilir (en az biri). İşaretlenen rolün bölümü açılır:
  - Employee → **Works at**: lokasyon + iş, en az 1 lokasyon ve 1 iş zorunlu (bugünkü kural).
  - Manager → **Manages**: lokasyon, en az 1.
  - Admin, Owner → "Manages" yok (bütün lokasyonlar).
  - Her yönetim erişiminde (Manager, Admin, Owner) **en az 1 Management departmanı işi** zorunlu (Mert, 2026-10-18; madde 4.13). Owner'da bu, kendiliğinden atanan Owner işidir.
- İkisi birden işaretlenince "Manages", "Works at" lokasyonlarıyla önceden dolu gelir; kullanıcı değiştirebilir.
- Örnek: Ali Kadıköy'ü yönetir, Beşiktaş'ta yalnız çalışır. Ali'nin yönetim kapsamı yalnız Kadıköy'dür; Beşiktaş'ın programını, ekibini ve taleplerini yönetici olarak görmez. Beşiktaş'ta çalışan tarafında görünür ve oradaki talebine Beşiktaş müdürü karar verir.
- Bu, 2026-09-30 "Lokasyonu yöneten manager oraya atanır / yalnız yönetir lokasyonu yok" ve "Manager'ın lokasyonları = çalıştığı atamalar" kurallarının yerine geçer. Yetki çekirdeğinin yönetim kapsamı (`scope_set`) "Manages"tan okunur.
- Sözlük (Mert): rol = erişim (access); iş (job) = vardiyada ve belgede kullanılan pozisyon. "Unvan" denmez.

### 4.3 Schedule ızgarası
- Izgarada yalnız Employee rolü olan ve "Works at"ta o lokasyon bulunan kişi vardır (Mert).
- "Exclude from schedule" kalır ve yalnız Employee rolü olanda anlamlıdır; yalnız yönetim rolündekinde çekmecede görünmez (Mert: "drawerdan exclude seçilmediği müddetçe"; görünmeme Claude'un kararı).
- Yönetici Employee rolü olmayan kişiye vardiya yazamaz; seçicilerde çıkmaz. Bugünkü "manager lokasyonunda çalışan herkesi (başka manager, admin, owner) vardiyaya yazabilir" kuralı "Employee rolü olan herkesi" diye daralır.
- Ghost (başka lokasyon vardiyası) ve dışa aktarma aynı süzgeci kullanır.

### 4.4 Takas, cover, release, pick up, açık vardiya
- Talep açmak, başvurmak, "Not for me" demek yalnız Employee rolüyle olur (bugünkü `exchange.offer_own` / `exchange.apply_own` yetkilerine Employee rolü şartı).
- Cover aday listesi, takas hedef listesi ve release havuzu yalnız Employee rolü olan, "Works at"ında o lokasyon ve iş bulunan, uygunluk motorundan (`app_private.eligibility()`) geçen kişileri gösterir. Müsaitlik bugünkü gibi yalnız işarettir (M6).
- Çift rollü kişi bu listelerde herkes gibi çıkar (Mert).
- Açık vardiya ve takas bildirimlerinin alıcısı yalnız Employee rolü olanlardır (bugün konu `exchange.apply_own`'a bağlı; rütbe sınırı yok).

### 4.5 Onay (Mert, S-164)
- Çift rollü kişinin çalışan tarafındaki talebine (takas, cover, release başvurusu, izin) o lokasyonun **kendisi dışındaki** bir müdürü karar verir, çalışan gibi.
- Kişi o lokasyonun tek müdürüyse karar bir üst rütbeye gider (admin, owner).
- Rütbe çalışan tarafında sayılmaz: Zeynep Admin olsa da Kadıköy'deki takasını Kadıköy müdürü Ayşe onaylar. Owner + Employee için de aynı.
- Kişi kendi talebine ya da taraf olduğu takasa hiçbir arayüzden karar veremez (bugünkü `no_self` ve önizleme kontrolü kalır).
- Çok lokasyonlu izin oylamasında her lokasyonun oyu için aynı kural: o lokasyonun kendisi dışındaki müdürü; kişi oranın tek müdürüyse admin / owner (Claude'un kararı, S-164'ün lokasyon başına uygulaması).
- Yalnız Employee olan kişide değişiklik yok.
- Yönetim tarafındaki işler (kayıt düzenleme, rol değiştirme, işten çıkarma, belge incelemesi, resmî ad onayı) bugünkü rütbe kuralıyla kalır: kişinin en yüksek rolünün altındaki kimse yapamaz.
- 2026-10-01 "eş rütbe birbirinin talebiyle ilgilenmez / bekleyen izni yalnız karar veren ve sahibi görür" kuralı çift rollü kişinin çalışan tarafındaki talepleri için daralır: eş müdür görür ve karar verir.

### 4.6 Bildirimler
- Her bildirim türü tek bir arayüze aittir: çalışan ya da yönetim (Mert). Çalışan tarafına ait örnekler: kendi vardiyası, kendi talebinin sonucu, açık vardiya, takas teklifi, lineup. Yönetim tarafına ait örnekler: karar bekleyen talep, belge incelemesi, yayın, ekip müsaitlik güncellemesi.
- Uygulama içindeki zil ve kutu arayüze göre ayrılır; çift rollü kişi çalışan tarafının bildirimini yalnız çalışan arayüzünde görür.
- Telefon bildirimi ve e-posta aynı kişiye gider; ayrım burada yapılamaz. Bildirime dokununca ait olduğu arayüz açılır (Claude'un kararı).
- Öteki arayüzün okunmamış sayısı gösterilmez (Mert'in "bilgi sızmaz" kuralından; Claude'un yorumu).
- Kişi kendi hakkındaki yönetim bilgisini hiçbir arayüzde görmez: kendisi hakkındaki "Manager notes", kendi bekleyen talebinin karar kuyruğundaki satırı, kendi belgesinin inceleme satırı (Claude'un kararı; bugünkü "çalışan kendi notunu hiçbir yerde görmez" kuralının çift rollü kişiye uzantısı).

### 4.7 Kendi kaydı (Mert, S-165)
- Yönetim tarafından herkes kendi çalışan kaydında yalnız kişisel bilgilerini (ad, telefon, e-posta, fotoğraf) düzenler.
- Lokasyon ("Works at" ve "Manages"), iş, rol ve "Exclude from schedule"u bir üst rütbe değiştirir.
- Owner ve admin kendi kaydının tamamını düzenler (bugünkü gibi). Owner kendine Employee rolünü kendisi verebilir, çünkü üstünde kimse yok (Mert'in kuralının owner için zorunlu istisnası; Claude'un kararı). Admin'e Employee rolünü yalnız owner verir.
- Müsaitliği çalışan tarafında yalnız kişinin kendisi yazar (M2).

### 4.8 Rol ekleme, bırakma, işten çıkarma (Mert, S-167)
- **Terfi:** Employee olan kişiye bir üst rütbe yönetim rolü ekler. Employee rolü varsayılan olarak işaretli kalır; müsaitlik silinmez. "Manages" çalıştığı lokasyonlarla önceden dolu gelir.
- **Employee rolünü bırakmak** (yönetim rolü kalır): çalışan tarafı işten çıkarılmış gibi işlenir:
  - gelecekteki yayınlanmış vardiyalar açık vardiyaya düşer, lokasyon müdürlerine haber gider (bugünkü işten çıkarma davranışı);
  - kişinin açık takas, cover, release talepleri kapanır; başkasının talebine yaptığı bekleyen başvurular kapanır;
  - bekleyen izin talepleri geri çekilir (Claude'un kararı);
  - müsaitliği ve hakkındaki "Manager notes" silinir (M14'ün yeni hâli);
  - etki önce gösterilir ("3 shifts become open, 1 swap request closes"), kırmızı iki tıklı düğmeyle yapılır.
- **Yönetim rolünü bırakmak** (Employee kalır): yönetim kapsamı hemen biter; verdiği oylar ve kararlar geçmişte kalır, açık oylamada henüz vermediği oy başka müdüre düşer; çalışan tarafına dokunulmaz.
- **İkisini birden bırakmak = işten çıkarma.** Bugünkü `terminate_employee_service` buna ek olarak açık talepleri ve başvuruları da açıkça kapatır (bugün kapatmıyor; yarım iş müdürün "Needs decision" listesinde kalıyor). Bu düzeltme yalnız çalışanlar için de geçerlidir.
- **Kim yapar:** rol ekleme, rol bırakma ve işten çıkarma yalnız kişinin yönetim rolünün üstündeki rütbeyle olur (Mert). Yalnız Employee olan kişide bugünkü kural (müdür, admin, owner).
- Erişimi kaldırma (`remove_employee_access_service`) bugünkü gibi üyeliği askıya alır; açık talep ve başvurular da kapanır (Claude'un kararı; aynı yarım iş sorunu).

### 4.9 Davet (Mert)
- En az bir rol zorunlu; rol boş gelirse sunucu Employee'ye düşmez, reddeder.
- Kim neyi verebilir bugünkü gibi: müdür yalnız Employee; admin Manager ve Employee (birlikte de); Admin rolünü yalnız owner verir. Özel roller bugünkü gibi.
- Her işaretli rol kendi bölümünü doldurur (madde 4.2). Müdür, "Manages" doldurulan bir davet gönderemez.
- Yönetim erişimi seçilince en az 1 Management departmanı işi seçilmeden davet gönderilemez (madde 4.13). Belge adımı (2026-10-04 karma akış) bugünkü gibi kişinin işlerine ve lokasyonlarına göre listeyi hesaplar; yönetim tarafındaki iş de sayılır.

### 4.10 Katılım, onboarding, iniş (Mert, S-166)
- Yalnız yönetim rolündeki kişi katılınca ve onboarding onaylanınca yönetim arayüzüne iner (bugün çalışan arayüzüne iniyor).
- Onboarding ve belge yükleme yönetim tarafında Account altındadır; müsaitlik adımı yoktur.
- Yalnız yönetim rolündeki kişinin izin talebi yoktur (BL-1143 hatırlatması).
- Çift rollü kişi onboarding'i çalışan tarafında bitirir (bugünkü akış).

### 4.11 Müsaitlik
- Müsaitliği Employee rolü olan girer; çift rollü kişi de (Mert: "employee'nin yapabildiği her şeyi yapabilir"). M13 bu anlamda okunur. BL-796 kendiliğinden kapanır.
- Team availability listesi ve "Manager notes" Employee rolü olan herkesi kapsar (S-32'nin yeni hâli; Claude'un kararı).

### 4.12 Sahiplik devri
- Devir artık yeni owner'ın çalışan kaydını şart koşmaz (bugünkü BL-252 kuralı kalkar). Yeni owner'ın Employee rolü olduğu gibi kalır. Eski owner'ın aldığı yönetim rolü bugünkü devir kuralıyla belirlenir; Employee rolü varsa kalır (Claude'un kararı).

### 4.13 Yönetim işi ve belgeler (Mert, 2026-10-18)
- Yönetim erişimi olan her üyeye en az 1 Management departmanı işi atanır (General Manager, Assistant Manager gibi). Neden: belge kuralı ("Who needs it") bugünkü gibi işe bakarak karar verir; yönetici sertifikası (ör. Food Protection Manager) "General Manager" işine bağlanınca bugünkü ve gelecekteki bütün GM'lerden kendiliğinden istenir, özel roller de kapsanır (iş rolden bağımsız). Settings → Documents'a yeni seçenek eklenmez.
- Yönetim işi vardiya için değil, erişimin pozisyonudur. Kişi istenirse vardiyaya da eklenir: Employee erişimi verilir ve "Works at"ında o Management işi seçilir. Böyle bir vardiya çalışan Home'unda "Manager on the floor" olarak gösterilebilir (tanım: o gün o lokasyonda Management departmanı işinde yayınlanmış vardiyası olan kişi; yetki çekirdeğine sorulmaz).
- Kural tek yönlüdür: yönetim erişimi ⇒ en az 1 Management işi. Yalnız Employee olan kişi de Management işinde vardiya tutabilir (ör. yönetim erişimi olmayan shift lead) (Claude'un kararı).
- Kurulum Management departmanını Owner, General Manager ve Assistant Manager işleriyle açar (Mert'in örneği). Bugün kurulan "Manager" işi yeni workspace'lerde bu ikisiyle değişir (Claude'un kararı); var olan test workspace'lerinde işler olduğu gibi kalır.
- Son Management işi korunur: owner dışı yöneticilere atanabilecek son Management işi silinemez ve arşivlenemez; bir yöneticinin tek Management işi de, önce başka bir iş atanmadan silinemez ve arşivlenemez (ekran kimin etkilendiğini adıyla söyler) (Claude'un kararı). Bu, 2026-09-30 "Manager sıradan iştir: … arşivlenir, silinir" kuralını daraltır.
- Terfide (Employee'ye yönetim erişimi eklenir) Management işi seçmek zorunludur.
- Yönetim erişimi bırakılınca yalnız yönetim tarafındaki Management işi düşer; "Works at"taki işler kalır.
- Yönetim tarafındaki iş, belge kuralında kişinin "Manages" lokasyonlarıyla birlikte değerlendirilir (Admin ve Owner'da bütün lokasyonlar) (Claude'un kararı).
- Belge kişiye aittir, arayüze değil: tek dosya, iki tarafta da geçerli. Yönetici belgesinin çalışan belgesini karşılaması ("covers", ör. Food Protection Manager → Food Handler) bu işte yok; Newfork'un hazır belge önerileriyle birlikte backlog'da (Mert). O gelene kadar çift rollü kişiden iki belge istenirse ya ikisini yükler ya da bir üst rütbe muaf tutar (bugünkü muafiyet yolu).

## 5. Yapım kısıtları
- CLAUDE.md §3.A bütünüyle: her yeni tablo ve fonksiyon RLS + `app_private.authorize()` / `scope_set()`; satır içi kapsam mantığı yok; "hayır" 42501 + `authz.*`; yeni `*_service` yetki matrisinde ve katalogda sınıflanır; eski kapı silinir ve `retired_objects_stay_gone`'a eklenir.
- Önce kırmızı test: yetki matrisi (`supabase/tests/authorization_matrix.test.sql`), uygunluk matrisi (`supabase/tests/eligibility_matrix.test.sql`), katalog; akış değiştiği için Playwright.
- Eski veri korunmaz (CLAUDE.md §3.A.5): test dünyası (`supabase/test-support/builder.sql`) ve fikstürler yeni modelle yeniden kurulur; eski modeli kuran testler silinir.
- Schedule ızgarası okuması ≤50 ms (fixture).
- Canlı adım riskli migration'dır: yedek, `nf-guvenlik` ONAY, Mert'in ana oturumdaki "evet"i, ana oturum uygular.

### 5.1 Bugünkü kişilerin yeni modele taşınması
Canlıdaki veri test verisidir (§3.A.5), ama taşıma yetki modelini değiştirdiği için yine riskli canlı migration'dır. Taşıma tek migration'da, modelin kendisiyle aynı adımda yapılır; eski alanlar aynı adımda silinir (ikiz sistem yok). Kural (Claude'un kararı):
| Bugün | Yeni model |
|---|---|
| `employee` rolü | yalnız Employee; "Works at" = bugünkü lokasyon + iş atamaları |
| manager / admin / owner, arşivsiz çalışan kaydı ve en az bir Management dışı iş ataması var | yönetim rolü + Employee; "Works at" = bugünkü atamalar; Manager'da "Manages" = bugünkü lokasyon atamaları |
| manager / admin / owner, çalışan kaydı yok ya da yalnız Management işleri var | yalnız yönetim rolü; Manager'da "Manages" = bugünkü lokasyon atamaları; Management işleri yönetim tarafına geçer; müsaitliği silinir |
| Management işi olmayan manager / admin | workspace'in "Manager" işi (yoksa General Manager) yönetim tarafına atanır (madde 4.13) |
| İkinci satırdaki kişi "Exclude from schedule" işaretliyse | aynı (yönetim rolü + Employee), işaret korunur |
| Lokasyonu olmayan Manager (bugün "No location") | yalnız yönetim rolü, "Manages" boş; Employees listesinde bugünkü "No location" etiketi kalır |
Migration'dan önce canlıda ve yerelde her satırın sayısı çıkarılır; taşımadan sonra aynı sayılar tutmalı (doğrulama SELECT'i kontrol listesinde).

### 5.2 "Takas talebini kapatmada rütbe kontrolü" işiyle ilişki
- O iş (dal `task/exchange-close-rank`) bugünkü modelde, bu tasarımdan önce main'e girer: talebi kapatma ve görme kapısı, karar kapısıyla aynı yetki çekirdeği eylemine (`exchange.approve`, hedef çalışanla) bağlanır.
- Bu tasarım sonra o tek kapının kuralını değiştirir (madde 4.5: çalışan tarafında rütbe sayılmaz, kişinin kendisi dışındaki lokasyon müdürü, tek müdürse üst rütbe; `no_self` her zaman). Karar, kapatma ve görme aynı çekirdek kuralından okur; ikinci bir rütbe ya da lokasyon yolu yazılmaz.
- Lokasyon kontrolü de aynı yerde değişir: yönetim kapsamı "Manages"tan gelir (madde 4.2). O işin testleri bu tasarımın testlerine taşınır; eş müdür örneği madde 4.5'e göre yeniden yazılır (çift rollü kişinin çalışan tarafındaki talebinde eş müdür artık karar verir ve kapatır; yalnız yönetim tarafındaki işlerde vermez).

## 6. Etkilenen yerler
Yetki çekirdeği ve üyelik modeli; davet (Employees → Add employee, Access); Employees çekmecesi (Roles, Works at, Manages, Exclude); Schedule (ızgara, seçiciler, ghost, dışa aktarma); Requests ve Shift Hub (takas, cover, release, izin onayı); Availability (Team listesi, notlar); bildirim çekirdeği ve zil; giriş, katılım, onboarding, iniş; Account (belgeler, onboarding); sahiplik devri; kenar çubuğu geçiş satırı.

## 7. Yolda bulunanlar (bu işin dışında ya da içinde)
- **Ayrı iş, koşuyor:** takas talebini "close" ile kapatma ve görme yetkisi rütbeye bakmıyor gibi (`supabase/schema.sql` ~25953); "Takas talebini kapatmada rütbe kontrolü" oturumu, dal `task/exchange-close-rank`.
- **Bu işte:** işten çıkarma ve erişim kaldırma açık talep ve başvuruları kapatmıyor (madde 4.8).
- **Bu işte:** "Employee view" düğmesi çalışan kaydı olmayan yöneticide görünüyor (madde 4.1 ile kalkar).
- **Karar defteri tutarsızlığı:** "owner'ın talebi onaysız kaydolur" yazıyor, kod owner'ın takasını onaya gönderiyor. Madde 4.5 çalışan tarafı için kuralı koyuyor; izin için bugünkü onaysız kayıt kuralı yalnız yönetim tarafında anlamsızlaşır (owner'ın izni Employee rolüyle verilir). Açık soru 8.1.

## 8. Açık sorular ve builder kontrolünde verilen cevaplar
**8.1 Açık (Mert):** owner + Employee kişi lokasyonun tek yöneticisiyse ve workspace'te admin yoksa çalışan tarafındaki takasına ya da iznine kim karar verir? Öneri: lokasyonda başka müdür varsa o; yoksa herhangi bir admin; o da yoksa talep onaysız geçerli olur ve müdürlere / adminlere bilgi bildirimi gider (bugünkü "owner'ın talebi onaysız kaydolur" kuralıyla aynı yön). Reddedilecek alternatif: talep hiç açılamasın. Cevap gelene kadar bu durum için kod yazılmaz.

**Builder kontrolünde Claude'un verdiği cevaplar (Mert okurken bakar):**
- **Özel roller:** hesapta iki rol yuvası olur: çalışan yuvası (yok ya da employee sınıfından bir rol: Employee ya da "Trainee" gibi özel rol) ve yönetim yuvası (yok, manager sınıfından bir rol, Admin ya da Owner). Kişinin kendi işlerine ait izinler (`exchange.offer_own`, `availability.own` gibi) yalnız çalışan yuvasındaki rolden okunur; yönetim rollerinin izin listesinden bu izinler kalkar. Settings → Roles ekranı değişmez.
- **Ayrım nerede uygulanır:** yetki çekirdeği iki ayrı kimlik hesaplamaz. Çalışan arayüzü yalnız çalışan servislerini çağırır; bu servisler kişinin kendi kapsamıyla ve çalışan yuvasındaki rolle cevap verir, yönetim verisi döndürmez. Bildirimlerin arayüz alanı ve "kişi kendi hakkındaki yönetim bilgisini görmez" kuralı sunucuda uygulanır.
- **Sonradan Employee eklenen yönetici:** çalışan arayüzüne ilk girişte yalnız eksik adımları görür; eksik zorunlu belge bugünkü kısıt kuralıyla programı kapatır; müsaitlik adımı bugünkü gibi isteğe bağlıdır. Owner'ın kendine Employee vermesi de aynı.
- **Kapatma işi:** madde 5.2.
- **Kayıtlar:** S-164 … S-167 şu an `coord/kayit2`'de; plan yazılmadan önce o dal bir trenle main'e iner (ana oturum).

## 9. Yapana bırakılanlar
- Veri modelinin biçimi (üyelikte Employee bayrağı + yönetim rolü mü, ayrı rol satırları mı), "Manages" tablosu, bildirim türlerine arayüz alanı.
- Migration'ların dilimlenmesi ve sırası. Önerilen sıra: (1) model + yetki çekirdeği + test dünyası; (2) Schedule ve takas süzgeçleri, onay kuralı; (3) rol ekleme / bırakma / işten çıkarma; (4) bildirim arayüz ayrımı; (5) davet ve çekmece ekranı (varyant sayfasından sonra); (6) giriş, iniş, Account onboarding.
- Ekranlar için varyant sayfası (Mert seçer; kural: bir sayfa, bir Artifact).
