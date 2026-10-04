# Newfork karar ilkeleri

> **Onay: Mert, 2026-10-01 — P01-P26'nın hepsi ve A bölümü (KARAR-001 mülakatı).** Mert'in 629
> eski cevabından çıkarıldı. Her ilke eski cevaplardaki karşı örneklerle sınandı ve mülakatta
> düzeltildi (analiz: `docs/plan/research/KARAR-001-analiz.md`).
> Sonradan eklenen ilke Mert onaylayana kadar "(taslak)" diye yazılır. Taslak ilkeye dayanarak
> sorusuz ürün kararı verilmez.
> Bu dosya CLAUDE.md'den her oturuma yüklenir; kısa tutulur (en çok ~20 KB). Uzun gerekçe ve
> kanıt listesi analiz dosyasında kalır.

## Nasıl kullanılır
- Soru sormadan, "(Önerilen)" koymadan ya da Mert yokken karar vermeden önce bu dosya ve
  `docs/plan/KARARLAR.md` taranır (CLAUDE.md §13).
- **Dayanak sırası:**
  1. Mert'in en güncel açık kararı (sohbette ya da KARARLAR'da kaynağı "kullanıcı").
  2. KARARLAR'daki kural.
  3. Bu dosyadaki ilke, koşuluyla birlikte.
  4. Koordinatör kararı (KOORDINATOR-KARARLARI).
  5. Sektör emsali (7shifts, Homebase, When I Work, Deputy).

  Alttaki üsttekini ezmez.
- Koşulu tutmayan ilke dayanak değildir; soru sorulur. Mert ilkeye ters seçerse ilke aynı
  oturumda düzeltilir ve yeni kanıt eklenir.
- Mert aynı gün fikir değiştirebilir (ör. "Create your own business" görünürlüğü): son açık karar
  geçerlidir (P22) ve kayda geçer.

## A. Vizyon
- **Ürün:**
  - ABD'deki restoranlar için çok kiracılı vardiya planlama.
  - Hedef self-serve, ücretli ABD lansmanı. Arayüz İngilizce.
  - MVP sonucu: `ROADMAP.md` ilk paragraf.
  - Mert'in sözü: "uygulama bir kokpit".
- **Müşteri** (Mert, 2026-10-01): ilk ödeyen müşteri 2-5 lokasyonlu, 20-100 kişilik restoran
  işletmesi. Ör. Kadıköy ve Beşiktaş şubeli bir zincir; her şubede bir müdür, owner merkezde. Çok
  lokasyon kuralları (lokasyon müdürü, ghost vardiya, çok lokasyonlu çalışan) varsayılandır; tek
  lokasyon da çalışır.
- **Kimin için** (Mert, 2026-10-01, kendi sözü): "hepsi eşit önemde. MVP önceliği müdür ve owner;
  daha sonra aynı kalitede employee arayüzü ve app".
  - MVP'de müdür ve owner ekranları önce gelir.
  - Çalışan arayüzü ve uygulaması sonra gelir ama ikinci sınıf değildir; aynı kalitede yapılır.
  - Reddedilen öneri: "müdür kazanır".
- **Cihaz** (Mert, 2026-10-01): müdür masaüstünden, çalışan telefondan kullanır. Yönetim ekranları
  masaüstüne göre tasarlanır, telefonda çalışır. Çalışan ekranları telefona göre tasarlanır.
- **Rakipler** (Mert, 2026-10-01): kendi yolumuz; rakip yalnız referanstır. 7shifts, Homebase,
  When I Work ve Deputy ne yapıyor araştırılır ve gösterilir; karar Mert'in kurallarından ve bu
  ilkelerden çıkar. Reddedilen seçenekler: "restoran akışında 7shifts esas", "sadelikte Homebase
  esas".
- **Anti-hedefler** (Mert, 2026-10-01; dördü de seçildi): Newfork asla şunlar olmaz:
  - Ayar cehennemi. Doğru varsayılan konur; ayar yalnız işletmeler gerçekten farklı çalışıyorsa
    eklenir.
  - Bildirim gürültüsü. Bildirim karar verene ve işi doğrudan etkilenene gider.
  - Kurumsal hantallık. Müdürün 5 dakikalık işi 20 dakika sürmez.
  - Oyuncak görünüm. Rozet ve pazarlama dili yok; ciddi bir iş aracı.

  "Bu ayarı ekleyelim mi?", "herkese bildirim gitsin mi?", "bir onay adımı daha koyalım mı?" gibi
  sorularda varsayılan cevap hayırdır.

## B. Ödünleşim sırası
1. Doğru veri > şık ama tahmine dayalı UX (P11).
2. O anki işin çekirdeğinde tam çözüm > ucuz kestirme (P02).
3. Görsel turda dar kapsam > fırsatçı genişleme (P03).
4. Kod, veri ve yerel git'te hız ve özerklik > tören (P01, P15). Altyapıda, başka oturumda ve
   kalıcı yetkide temkin > hız.
5. Ücretsiz > ücretli. Maliyet dolarla yazılır (P06).

## C. İlkeler

**P01. Canlı müşteri yok: kodda ve migration'da geçiş töreni yok.**
- Kural: shadow, aşamalı geçiş, geriye uyumluluk, "park et" ve eski test verisini koruma
  önerilmez. Doğrudan doğru çözüm seçilir.
- Koşul: canlı (hosted) veritabanına gönderimde "önce yedek" Mert'in kabul ettiği varsayılandır.
- Kanıt: 07-13 "uygulamada zaten gerçek bir tenant yok… satışa çıkmadı"; 09-18 "Hem local hem
  hosted'a uygula".

**P02. O anki işin çekirdeğinde tam çözüm.**
- Kural: MVP içindeki işte kozmetik, en ucuz ya da "bugünkü gibi kalsın" önerilmez. Eksik
  yetenek kurulur; gizli ama değerli özellik görünür yapılır.
- Koşul: yolda bulunan yan işte Mert çoğu zaman backlog ya da dar v1 seçiyor (2026-10-01: renk körlüğü için şekil farkı, önerilen "2 varyant göster" yerine "Backlog'a yaz"); orada bunu seçenek
  olarak sun.
- Kanıt: 09-23 "Görünür olsun. İşe yarar bir özellik bu. Test edilsin. Çalışsın."; 07-31 "Gerçek
  sertifikasyona başla".
- Kanıt (2026-10-01, ters seçim): owner'ın gönüllü belge yüklemesi (BL-118) yan iş diye "şimdi
  değil, backlog" önerildi; Mert "evet, yükleyebilsin" seçti. Yan işte de değerli eksik kurulabilir.

**P03. Görünüm turunda yalnız görünüm değişir.**
- Kural: Mert işi görünüm turu diye çerçevelediyse akış, adım sayısı ve hata düzeltmeleri
  kapsama eklenmez. Mert'in verdiği liste kesin kapsamdır; yolda bulunanlar backlog'a yazılır.
- Koşul: akış ya da kurulum yeniden tasarımında Mert mantığı ve bilgi mimarisini kendisi ekliyor;
  orada kapsamı dar tutma.
- Kanıt: 09-29 "Yalnız görünüm, akış aynı", "Hayır, yalnız görünüm"; 09-30 "Şimdi değil,
  backlog'a".

**P04. Görsel karar gözle verilir.**
- Kural: yeni bileşen ya da yerleşim yazıyla sorulmaz. Önce Mert'in sorun turu dinlenir, sonra
  gerçek uygulamada birbirinden gerçekten farklı 2-3 varyant gösterilir. Tutmazsa Mert'ten
  referans istenir.
- Koşul: renk, token, kontrast ve kenar gibi tutarlılık ayarları yazıyla sorulabilir.
- Kanıt: 07-15 "ilk 2sini de mock up olarak görsel olarak gösterebilir misin"; 09-18 "Mockup'ta
  ikisini de gör"; 09-23 "Önce mockup göster".

**P05. Soru sonuç diliyle sorulur.**
- Kural: soru şu sırayla kurulur:
  - Bugün ne oluyor: ekran → düğme.
  - İsimli bir örnek.
  - Her seçenekte ne olur, kime görünür, engel mi uyarı mı.

  BL numarası, dal adı ya da iç ad tek başına kullanılmaz.
- Koşul: git ve operasyon soruları kısa olabilir ama anlamı yine yazılır.
- Kanıt: 07-12 "soruyu anlamadım soruyu da seçenekleri de basitleştir"; 09-24 "Bl111 ve 112
  neydi"; 09-26 "Daha açıklayıcı koordinatlar ve örneklerle… anlat".

**P06. Para: önce ücretsiz, maliyet dolarla.**
- Kural: altyapı ve araç seçeneklerinde aylık ya da tek seferlik dolar maliyeti yazılır. Ücretsiz
  ve anahtarsız yol önce gelir; ücretsiz katmanlar birleşebiliyorsa ikisi birden kullanılır.
  Lansman öncesi yeni ücretli hesap açılmaz.
- Ultrareview (Mert, 2026-10-01): riskli işte (yetki, satır erişimi, migration, veri silme) ve
  ücretsiz hak varken önerilir. Hak bitince yalnız en riskli işte (yetki çekirdeği gibi), dolar
  tutarıyla önerilir (CLAUDE.md §5).
- Kanıt (2026-10-01, ters seçim): FB-6.3.7 (veri silme) için ultrareview önerildi; Mert "hayır,
- Kanıt (2026-10-02, ikinci ters seçim): FB-6.7 A (yetki çekirdeği, grant, nesne silme) için ultrareview önerildi; Mert "Hayır, iki inceleme yeter" dedi — yetki çekirdeği işinde de iki iç inceleme + yeniden inceleme (`nf-guvenlik` ONAY) yeterli görüldü.
  güvenlik onayı yeter" dedi — iki tur `nf-guvenlik` ONAY'ı olan işte gerekli görmedi.
- Kanıt: 09-24 "$ cost bilgisi verir misin"; 07-12 "Leaflet + OpenStreetMap (ücretsiz)"; 09-16
  "vercel logları + sentry… ücretsiz olsun".

**P07. Onay bir üst kademeye gider.**
- Kural:
  - İzin, takas ve devir talebi bir üst kademeye gider.
  - Eş rütbe birbirini, kimse kendini onaylamaz.
  - Manager yalnız kendi lokasyonunda karar verir; tamamen işten çıkarma admin ya da owner'ındır.
  - Bildirim karar verene ve işi doğrudan etkilenene gider; admin gürültüsü yoktur.
- Koşul: yayın anındaki müsaitlik uyarısını, rütbesinden bağımsız olarak yayınlayan onaylar. Eş
  müdür bilgi bildirimi alabilir. Resmî ad gibi bordro / kimlik verisinin onayı bir üst kademeye değil owner / admin'e gider (2026-10-02).
- Kanıt: 09-23 "İstekler hep üst kademelere gider onay için", "Komple işten çıkarmayı admin
- Kanıt (2026-10-01, ters seçim): bekleyen izni kim görür sorusunda önerilen M2'nin genişliğine ("talebi görsün, ilerlemeyi değil") dayandı; Mert daralttı: bekleyen talebi yalnız karar veren ve sahibi görür, eş rütbe görmez ("Kendi pozisyondan arkadaşın değil"). Onay zincirinde görünürlük de bir üst kademeyle sınırlıdır.
  yapar"; 09-26 "Yalnız lokasyon müdürleri". KARARLAR "Ürün kuralları".
- Kanıt (2026-10-02, ters seçim): duyuru teslimi için "admin bildirim almasın" önerildi; Mert "admin'ler de alsın" seçti. Duyuru / önemli tarihte admin her kaydı alır; P07'nin "admin gürültüsü yok" kısmı onay bildirimleri için geçerli kalır (KARARLAR "Duyurular ve önemli tarihler" K5).
- Kanıt (2026-10-02, ters seçim): onboarding'de resmî ad düzeltmesi için "bir üst kademe (lokasyon müdürü) onaylar" önerildi; Mert "yalnız owner ya da admin" seçti. Resmî ad gibi bordro / kimlik verisinde onay bir üst kademeye değil owner / admin'e gider (KARARLAR "Onboarding'de resmî ad düzeltmesini yalnız owner ya da admin onaylar"; FB-6.6 S1).
- Kanıt (2026-10-03, önerilenle aynı yönde): reddedilen belgeyi kim görür sorusunda Mert serbest metinle "admin, owner ve sahibi" dedi; eş müdür görmez. Görünürlük reddedilmiş belgede de karar veren + sahiple sınırlı (KARARLAR S2 eki).

**P08. Ayrıcalık bugünkü rolden gelir.**
- Kural: kurucuya ya da owner'a "saygı" istisnası yapılmaz. Rol düşünce muafiyet de düşer; owner
  da bir işe atanmadan o işe yazılmaz. İstisna yalnız veri modelinde tanımlıysa vardır
  (Management departmanı ve Owner işi sistem kaydı).
- Kanıt: 09-28 "Muafiyet kalksın"; 09-27 "Önce atanmalı", "Owner sadece otomatik olarak
  management departmanı owner jobına atanır".
- İstisna (kullanıcı kararı 2026-10-01, FB-6.3): owner belge son tarihlerinden ve kısıtlamalarından her zaman muaftır (KARARLAR "Ürün kuralları"). P08 belge kısıtı dışında geçerli.
- Kanıt (2026-10-02, ters seçim): workspace'ten ayrılan müdürün duyurusunu "yalnız admin ve owner değiştirsin" önerildi; Mert "En nihayetinde o da müdürdü" dedi — kayıt son rolüyle sayılır, o lokasyonun öteki müdürleri düzenler, başka müdür kalmadıysa admin / owner (KARARLAR K2 Ek 2). Ayrılmak rolü düşürmez; ayrılan kişide "bugünkü rol" son rolüdür.

**P09. Veri sessizce düşmez; yayınlanmış veri geriye dönük değişmez.**
- Kural: düşmesi gereken veri için kullanıcı uyarılır. "Exclude" gibi işaretler yalnız yeni
  açılan taslağı etkiler. Bulunan sessiz davranış en azından backlog'a yazılır.
- Kanıt: 09-26 "düşer ama useri uyar"; 09-27 "Published shiftler düşmez… Yeni draft açılır o
  zaman ise gizlenir"; 09-23 "sessiz atlama backlog'a".

**P10. Kullanıcının niyeti sorulur; kullanıcı zorlanmaz, ilerlemesi kaybolmaz.**
- Kural:
  - Bekleyen davet her girişte ilk ekranda gösterilir.
  - Tek workspace'i olan doğrudan rolüne göre iner.
  - Yarım kurulum kaydedilir; kişi devam edebilir ya da silebilir.
- Koşul: hiç workspace'i olmayan ve bekleyen daveti olan kişi önce daveti çözer (sert engel).
  Ayrıntılı kurallar KARARLAR "Katılım ve giriş akışı"nda (onay 2026-10-01).
- Kanıt: 09-17 "tek organizasyonu varsa direk ona giriş yapsın, rolüne göre land olsun"; 09-18
  "zorlamayalım belki employer olacak belki", "yeni invitelar her zaman… ilk olarak gösterilsin".
- Kanıt (2026-10-03, seçenek dışı; S2 açık, ölçümde — besleme #140): müsaitlik değişince bekleyen istek için "istek açık kalsın, yalnız işaret" önerildi;
  Mert: "…availability kaydedilirken onay ekranında bekleyen istekle çakışma yaratacağını ve bu isteği keep/cancel
  edeceğini employeeye sorsun" (FB-6.4 S2; KARARLAR "Takas… uygunluk"). Niyet kayıt anında kişiye sorulur; sessiz işaret
  yetmez.

**P11. Doğru veri tahminden önce gelir.**
- Kural: zorunlu alan tahminle ya da kopyayla doldurulmaz; legal name zorunludur. Yapısal veri
  ayrı alanlarda tutulur. Çakışma yazıldığı anda uyarılır.
- Kanıt: 07-12 "4 yapısal alan"; 09-25 "boş kalamaz. required bir şekilde yazar"; 09-29 "legal
  name boş kalamaz. employer invite ederken burayı doldurup invite eder".

**P12. Pazar ABD, dil İngilizce; bu yeniden sorulmaz.**
- Kural: metin alanında Türkçeye özgü harfler yoktur (ş, ğ, ı, İ); tire serbesttir. Öteki Latin
  aksanlı harfler serbesttir: "José Peña" doğru yazılır (Mert, 2026-10-01). Telefon alanına yalnız
  rakam girilir; +1 sabittir, ülke seçici yoktur, yazarken maske uygulanır. Ayrıntı: KARARLAR
  "Form ve girdi kuralları (ABD)".
- Kanıt: 09-16 "ABD, İngilizce"; 09-17 "TİRE SERBEST TR HARFLER YASAK", "sadece rakam yazılabilir…
  +1 dışında alan adı kullanılamaz".

**P13. MVP sınırı kategori düzeyinde çizilir.**
- Kural: compliance, payroll, time tracking, break ve Stripe billing MVP sonrasıdır. Sonradan
  sıfırdan tasarlanacak modüle (Line Up) bugün yatırım yapılmaz; ayrı plana alınır.
- Koşul: bildirim sistemi sonra yeniden tasarlanacak, ama işin gerektirdiği bildirim bugün de
  kuruluyor.
- Kanıt: 09-16 "compliance… payroll… time tracking ve break ile ilgili herşey mvp sonrası", "line
  up apayrı bir plan konusu olsun"; 09-21 "Stripe billing yok şuan için".

**P14. Program işinde kapsam geniştir; kod vizyonun kanıtı değildir.**
- Kural: Mert bir temizlik, denetim ya da yeniden tasarım programı başlattıysa kapsam en geniş
  tutulur: tüm repo, ekran ailesinin tamamı. Kod vizyonla çelişirse kod yanlış sayılır ve Mert'e
  sorulur.
- Koşul: günlük işteki düzeltmede kapsam dar tutulur (ör. "Yalnız bu 4 pencere").
- Kanıt: 09-23 "kapsamı en geniş tutup… yeni mimariyi sağlam bir şekilde repo geneline
  işleyelim"; 09-28 "Tüm repo denetimi".

**P15. Kod ve git'te Claude hızlı ve özerktir.**
- Kural: testler geçtiyse merge ve push yapar. Veri yazmayan gezinmeyi kendisi yapar. Kendi
  yapabileceği bir operasyonu Mert'e devretmez.
- Koşul: makine düzeyinde yeniden başlatma, oturum arşivi, başka oturumun dosyaları ve kalıcı yetki
  her seferinde tek tek sorulur. Mert çoğu zaman izin veriyor, ama yine sorulur.
- Kanıt: 09-16 "İkisi de otomatik"; 09-30 "Hemen bağla", "Sen gönder, MCP ile".
- Kanıt (2026-10-02, süreç kuralı; CLAUDE.md §5 adım 4 "Sormadan açılan skill'ler", main `da6874d6` + `a80f687a`): her oturum brainstorming, systematic-debugging, test-driven-development, supabase-postgres-best-practices, receiving-code-review ve verification-before-completion'ı kendi yargısıyla açar; ölçü §11.5 (sonucu değiştirecekse açılır; belli, kanıtlanmış ya da küçük işte açılmaz), raporda tek satır. Mert: "Overengineering yada gereksiz test/kanıtlanmış/obvious olan şeyler için zaman ve token waste etmesinler ama sadece senin onlara söylediğin dar senaryoları da beklemesinler." Reddedilen (koordinatör önermedi; süreçle çakışır): writing-plans, executing-plans, finishing-a-development-branch, gsd-*, frontend-design.
- Kanıt (2026-10-02, sürekli yetki; CLAUDE.md §8, main `636b76ee`): koordinatör sormadan canlıya migration (MCP; ONAY + OPS-03 + yedek + doğrulama; gerçek veri silme hariç), oturum yönetimi, birleşmiş dal ve temiz worktree silme, yeni iş seçme yapar; `db reset`, canlıda gerçek veri silme, ücretli, gizli anahtar, yeni bağımlılık, force push yetki dışı. Mert: "…task bitiminde canlıya gönderme, migrationları uygulama, session'ı arşivleme/silme, yeni session başlatma vs gibi otomasyonunu durduracak şeyleri kendi başına yapabil." Koşuldaki "tek tek sorulur" bu listede kalktı.
- Kanıt (2026-10-02, ~10:30Z, oturum yönetimi): Mert "Sessionlari silme, temizle ve kullan" dedi — işi biten oturum arşivlenmez, temizlenip havuza döner (KARARLAR OPS-07). Sürekli yetkideki "oturum yönetimi" arşiv değil temizleme demek.

**P16. Geliştirici araç kuralları orta serttir.**
- Kural: yeni lint, hook ya da denetim önce uyarı modunda gelir. Bypass edilirse ayrıntılı log
  tutulur ve geri dönüş planı hazırdır. Sert/yumuşak ikilisine üçüncü bir kademe eklenir.
- Koşul: yalnız süreç ve araç kurallarında geçerli. Ürün iş kurallarında Mert sık sık kesin engel
  seçiyor.
- Kanıt: 09-30 "orta sert - kural eğer ki bypass edilirse, detaylı bir logu tutulsun"; 09-19
  "Kur, uyarı olarak"; 09-24 "Uyar/soft engel/hard engel".
- Kanıt (2026-10-02, ürün tarafında üçüncü kademe): kapalı güne sonradan vardiya yazma için Mert seçenek dışı yazdı: "3 derece olsun. 1-asla shift yazılmaz 2-her celle shift yazılınca onay ister 3-bir kere onay verince o edit kapanana kadar bir daha uyarı vermez." İki dereceli öneri (ayar belirlesin) reddedildi (KARARLAR K17). Koşuldaki "ürün iş kurallarında kesin engel" eğilimi sürüyor ama kademe sayısı ürün ayarında da üçe çıktı.

**P17. Tek hat; hızlanmak işi bölmektir.**
- Kural: başlanan iş bitene kadar sürer; yolda bulunanlar backlog'a yazılır. "Hızlanmak", tek
  işi parçalayıp birden çok oturumda yürütmek demektir. Paralel başka bir iş yalnız seçenek
  olarak sunulur.
- Koşul: aynı işle doğrudan ilgili küçük bulgular, güvenlik hataları ve görsel hatalar mevcut işe
  eklenir.
- İkinci iş (Mert, 2026-10-01): yalnız Mert isterse açılır. Bağımsız bir iş bulunursa Claude onu
  seçenek olarak sunar; kendisi açmaz.
- Kanıt: 09-28 "Tek hat. Bir taske başlayınca o task bitene kadar ilerleyelim", "1 taski küçük
  parçalara bölüp aynı anda birden fazla sessionda ilerletme".

**P18. Ürün kararları tek tek sorulur; temel modeller önce sohbette konuşulur.**
- Kural: "hepsi önerilen gibi" paketi ya da açıklamasız evet/hayır listesi sunulmaz. Temel
  modeller (yetki kapsamı, saat dilimi modeli, izin iptali) önce sohbette başlık başlık konuşulur.
- Kanıt: 09-28 "çoktan seçmeli olarak yolla hepsini tek tek ben seçeceğim"; 09-27 "chat
  içerisinde başlık başlık ve derinlemesine açıklama ile anlat"; 09-23 "Önce konuşalım".

**P19. Saf teknik iç kararı Claude verir.**
- Kural: şemanın iç ayrıntısını, merge sırasını, test dosyası hizasını ve kontrastı Claude seçer.
  Seçerken uygulamanın çok büyüyeceğini varsayar, en az bakım isteyen yolu alır. Araştırılabilecek
  şeyi (terminoloji, sektör emsali) araştırır ve gerekçesiyle önerir.
- Koşul: görünür bir UX kararında emsal araştırılır ama varyantlar gösterilir; seçimi Mert yapar.
- Kanıt: 07-12 "ilerde çok büyüyecek bu app… hangisi daha az bakım gerektiriyor"; 09-17
  "Koordinatör karar versin"; 09-28 "sen… fikir yürüt ve karar ver".

**P20. UI zevki: sade, kompakt, tek Save.**
- Kural:
  - Alan altında uzun açıklama, gereksiz bölüm ya da etiket yoktur.
  - Pencerede tek kaydetme noktası vardır: sağ alttaki Save.
  - Global bileşen diline sadık kalınır.
  - Türetilmiş öğe (ghost), aynı bileşenin soluk hâlidir.
- Koşul: tek cümlelik, tek mesajlı açıklama kabul edilir. Masaüstünde sol menü, telefonda alt
  çubuk kullanılır.
- Kanıt: 09-29 "bu iki isim sectionının tek bir save butonu olsun"; 09-30 "bu save butonu kalksın
  ve pencerenin sağ en altındaki save butonu kullanılsın".

**P21. Kullanıcı metni kısa ve tek mesajlıdır.**
- Kural:
  - Metin geliştirici notu gibi yazılmaz.
  - Çalışana vardiyayı isteğe bağlı gibi hissettiren yumuşatma kullanılmaz.
  - Erişim yönlendirmesinde kişi adı yerine rol yazılır ("Admin").
  - Sistem terimi workspace / team'dir.
- Kanıt: 09-26 "sadece ana mesajı vermek yeterli", "Tek cümle", "developer mesajı gibi
  yazmasın", "Workspace + team kalsın".

**P22. En güncel açık karar kazanır.**
- Kural: Mert'in en güncel açık kararı, sonradan yazılmış genel kuralın ve koordinatör kararının
  üstündedir. Çelişki ertelenmez; kural metni aynı işte güncellenir. Ertelenmiş araç ve süreçler
  (UI Lab) seçeneklere konmaz. Eski kilitli bir karar bugünkü konuşmayla çelişirse sorulur.
- Kanıt: 09-19 "UI Lab şu an için ertelendi. Onu hiçbir şekilde kullanmıyoruz."; 09-20
  "Workspaces'a dönülsün".

**P23. Gerçekten oluşabilecek uç durumlar baştan kapsanır.**
- Kural: bir kural önerilirken yayınlanmamış hafta, vardiyasız gün, lokasyonsuz kişi ve çok
  lokasyonlu çalışan baştan düşünülür. Müdür, göremediği bilgi yüzünden çakışma yaratmamalı:
  çalışanın başka lokasyondaki vardiyası ghost olarak görünür.
- Koşul: bugün oluşamayan durum kodlanmaz, yalnız kural olarak kilitlenir.
- Kanıt: 09-23 "Ama schedule yayınlanmamış bir haftanın gününe istiyorsa ne olur"; 09-29
  "lokasyon ataması zorunlu. en az 1 lokasyon seçilmesi gerek".

**P24. Çalışan kendi kısıtını ezebilir, sistemin kısıtını ezemez.**
- Kural:
  - Müsaitlik ve onaylı izin rızayla ezilebilir.
  - Lokasyon ve iş uygunluğu ile müdür onayı ezilemez.
  - Dinlenme ve yol kuralı ihlali onay ekranında açıkça gösterilir.
  - Bekleyen kabul yalnız gerçek çakışmada düşer.
- Koşul: onaylı izin yalnız takasta ve bırakılmış vardiyanın pickup'ında ezilebilir. Onaylı izni
  olan kişi cover listesinde hiç çıkmaz.
- Kanıt: 09-23 "Onaylı bir time off requestsi varsa, cover request için listede ismi hiç
  çıkmaz", "kesişme olmuyorsa… kabul korunur".

**P25. Karar geri alınabilir; geri dönüşsüz eylemin sonucu açıkça yazılır.**
- Kural:
  - Revoke vardır; yarım taslak silinebilir.
  - Asılı teklif süre dolunca düşer.
  - Kısmi onay yoktur.
- Koşul: sonuç açıkça yazılıyor ve alternatif bir yol varsa Mert geri dönüşsüz eylemi de kabul
  ediyor.
- Kanıt: 09-18 "Continue setup + Discard"; 09-19 "Süre dolunca otomatik iptal", "Kalsın, sonucu
  net yazılsın".
- Kanıt (2026-10-01, ters seçim): vardiyasız yayın için "yayında sayılsın, geri alınabilsin"
  önerildi; Mert "bugünkü gibi kalsın" seçti (BL-370). Geri alınabilirlik her uç durumda iş açmaz.
- Kanıt (2026-10-03, ters seçim): duyurudaki Archive Restore ile geri alınabildiği için "beyaz tek tık" önerildi; Mert
  "kırmızı, iki tık, adı Archive" seçti (FB-6.7 B1, BL-543). Kayıt alıcılardan kalkıyorsa geri alınabilir eylem de
  yıkıcı dille (iki tık kırmızı) kalır.

**P26. Pencere kapanırken yalnız kayıp büyükse sorulur.** (Mert, 2026-10-01)
- Kural: uzun yazılmış ya da geri getirilemeyecek iş varken "Discard unsaved changes?" sorulur;
  ör. Ayşe bir belgeyi inceleyip ret gerekçesi yazdıysa. Birkaç alanlık kısa formda sorulmaz,
  hızlı çıkış geçerlidir; ör. Ali'nin lokasyonu değişip Esc'e basıldıysa.
- Bugün: Employees çekmecesi sormaz (K7), belge çekmecesi sorar (BL-467). İkisi de bu kurala
  uyuyor; yeni ekranlar da bu kurala göre yapılır.
- Reddedilen seçenekler: "hiçbir pencere sormaz", "her pencere sorar".

## D. Claude'un bilinen yanlış eğilimleri

| Eğilim | Yerine |
|---|---|
| Canlı müşteri yokken yedek, shadow, "park et" | P01; yedek yalnız canlı veritabanına gönderimde |
| Üründe en ucuz yolu ya da "bugünkü gibi kalsın"ı önermek | P02 |
| Genel SaaS kalıbı: kurucuya istisna, "admin'e de bildir" | P07, P08 |
| Görünüm turunda akış ya da hata eklemek | P03 |
| Görsel kararı yazıyla sormak; birbirine benzeyen varyantlar | P04 |
| Jargon, BL numarası, uygulama yolu dili | P05 |
| Maliyeti dakikayla vermek | P06 |
| Testler geçmişken merge için onay istemek | P15 |
| "Hepsi önerilen gibi" paketi | P18 |
| Araştırılabilecek şeyi sormak (pazar, terminoloji) | P12, P19 |
| Kodun bugünkü hâlini vizyon sanmak | P14 |
| Ortamı ve kodu ölçmeden soru kurmak (ör. "Docker kapalı" varsaymak) | Önce ölç, sonra sor |
| Spec netleşmeden ya da Mert ekranı gezmeden varyant sorusu sormak | Önce dinle (P04) |
