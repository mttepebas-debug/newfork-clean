# Karar raporu: temeli toparlamak mı, sıfırdan kurmak mı?

**Tarih:** 23 Eylül 2026 · **Taban:** main `cf7dff4`, yerel veritabanı (319 migration'ın hepsi uygulanmış)
**Kaynaklar:** 6 ölçüm araştırması (kimlik, yetki sayımı, RLS, rol kaynağı, test altyapısı, yeniden kurma maliyeti), 3 seçeneğin her biri için bir savunucu, 3 hakem. 38 kırmızı test için 23 Eylül'de yapılan araştırma da `docs/plan/research/bl070-2026-09-23/` altında.

---

## 1. Kısa cevap

**Kısır döngü var, ama kaynağı mimari değil.** "Ayşe bu işi bu lokasyonda yapabilir mi" kuralı veritabanında ve API'de onlarca yerde ayrı ayrı yazılmış. Eski sistemler hiç silinmemiş: bugüne kadar açılan 158 tablodan 0'ı silindi. Veritabanı testleri de her gönderimde otomatik koşan kontrollerde hiç yer almadı, bu yüzden kopyaların birbirinden ayrıldığını kimse görmedi.

**Temel çürük değil.** Veri modeli (yaklaşık 110 tablo), işletmeler arası ayrım ve "isteği kim yapıyor" zinciri sağlam. Aşağıda saydığım 29 sorundan yalnız 2'si gerçek model hatası, ikisi de yerinde düzeltilebiliyor.

**Sıfırdan kurmayı önermiyorum.** Bu repo zaten bir sıfırdan kurulum (18 Ağustos). O kurulumun yazılı brief'i bu kuralların aynısını istiyordu, yine de aynı hatalar 5 haftada geri geldi, çünkü kuralı zorlayan otomatik test yoktu. Bir kez daha kurmak döngüyü bir tur daha döndürür.

**Önerim:** temeli koru, yalnız yetki katmanını tek parça olarak yeniden kur (tek yetki fonksiyonu ve her değişiklikte koşan bir yetki matrisi testi) ve ikiz sistemleri sil. Tahmini süre 10–17 kişi-hafta. Bilinen güvenlik açıkları ve test kapısı ilk 2 haftada kapanır.

---

## Okuma notu

**Doğrulama etiketleri:**
- **[deney]:** yerel veritabanında tek bir işlem içinde denendi ve sonra geri alındı (23 Eylül 2026).
- **[kod]:** yalnız kod okunarak tespit edildi.
- **[doğrulanmadı]:** kimse bakmadı.

**Kişi-hafta:** senin bir haftalık yönlendirme, inceleme ve karar zamanın. Kodu yapay zekâ yazıyor. Darboğaz kod değil, karar.

| Ad | Ne demek, nerede |
|---|---|
| Giriş kartı (JWT) | Oturum açınca tarayıcının taşıdığı imzalı kimlik. API her istekte Supabase'e "bu kart gerçek mi" diye soruyor |
| `actor_user_id` | Veritabanı fonksiyonuna "bu işi kim yapıyor" diye verilen kimlik. Ör. Schedule'da Save'e basan Ayşe |
| Servis fonksiyonu (`*_service`) | Veritabanında işi yapan fonksiyon. Ör. vardiyayı yazan. Yalnız API sunucusu çağırabiliyor |
| RLS / politika | Tarayıcı bir tabloya doğrudan bakarsa hangi satırları görebileceğini süzen veritabanı kuralı. Ör. Settings → Organization'daki lokasyon listesi |
| Yetki (grant) | RLS'ten önceki kapı: bir rol bu tabloya ya da fonksiyona hiç dokunabilir mi |
| `app_private` | Veritabanının iç bölmesi. Ekranların doğrudan görmediği yardımcı fonksiyonlar burada |
| pgTAP | Veritabanı testleri (131 dosya). Ör. "Kadıköy manager'ı Beşiktaş vardiyası yazamaz" |
| CI | GitHub'a her gönderimde koşan otomatik kontroller. Bugün yazım denetimi, tip kontrolü, birim testleri ve derleme koşuyor; **veritabanı testleri koşmuyor** |
| `authorize()` / `scope_set()` | Önerilen tek yetki fonksiyonu ("Ayşe şunu yapabilir mi") ve kişinin yetkili olduğu lokasyon listesi (Ayşe → [Kadıköy]) |
| Yetki matrisi testi | Tek test dosyası: 14 örnek kişi × yaklaşık 45 işlem × 8 hedef türü. Bütün kararlar tek bir "beklenti" fonksiyonunda yazılı |
| Migration / taban (squash) | Şemayı adım adım değiştiren dosyalar (319 dosya, 66.827 satır) / bunları bugünkü şemanın tek dökümüne indirmek |
| Test dünyası (fixture) | Test için kurulan sahte işletme, kişi ve lokasyonlar |
| Bağ (FK) / `workspace_id` | İki tablo arasındaki bağ. İçinde `workspace_id` varsa iki kaydın aynı işletmeye ait olmasını veritabanı zorlar |
| Üyelik / rol sınıfı / `all_locations` | Kişinin işletmedeki üyeliği, rolünün sınıfı (owner/admin/manager/employee; ör. "Shift lead" özel rolü manager sınıfında) ve "bütün lokasyonlar" bayrağı |
| Kapsam satırı (`membership_location_scopes`) | Manager'ın yetkili olduğu lokasyonlar (Ayşe → Kadıköy). Kişinin kendi lokasyon atamalarından otomatik türetiliyor |
| Belge engeli | Zorunlu belgesi eksik kişinin kısıtlanmış hali |
| E1–E7 | Araştırmalardaki geri alınan deneyler (aşağıda açıklanıyor) |
| FX | Başka bir oturumun deneyinden yerel veritabanında kalmış test işletmesi |

---

## 2. İş arkadaşının yorumu: iddia iddia

| # | İddia | Sonuç | Kanıt | Nasıl |
|---|---|---|---|---|
| 1 | Temel sağlam, kritik tasarım hatası yok | **Kısmen doğru** | Veri modeli, işletme ayrımı ve kimlik zinciri sağlam. Ama ciddi üç şey var: veri kaybettiren bir şema hatası (plan kilidi, bölüm 3); 8 Eylül'de başlayan "tarayıcı → API" geçişinin yarım kalması; admin'in tarayıcıdan tek istekle işletmeyi "silindi" yapabilmesi gibi yüksek önemde açıklar | deney + kod |
| 2 | Asıl sorun aynı kuralın tekrar tekrar yazılması | **Doğru** | Lokasyon kuralı 12 ayrı yardımcıda yazılmış; "manager bu kişiye erişebilir mi" kuralının 6 kopyası var; 51 fonksiyonda satır içinde, API'de 20 yerel kapıda tekrar ediyor. Kopyalar belge engeli, askıdaki işletme, boş lokasyon ve rolün nereden okunduğu konusunda birbirinden ayrılıyor | kod + deney |
| 3 | 202 bağın 191'i `workspace_id` içeriyor | **Doğru** | İşletme tablosundan işletme tablosuna giden bağlar için birebir doğru | deney |
| 4 | 11 bağ kontrol edilmeli (üyelik → çalışan kaydı, tercih edilen ad talebi → çalışan kaydı) | **Doğru** | 11 bağın 9'u tek kolonlu, 2'si iki kolonlu. Adı geçen iki bağ başka işletmenin kaydına bağlanabiliyor. Admin bunu tarayıcıdan da yapabildi | deney |
| 5 | RLS bütün tablolarda açık | **Doğru** | 158 tablonun 158'inde | deney |
| 6 | Tabloların çoğu kapalı; erişim yalnız tarayıcının çağıramadığı servis fonksiyonlarıyla | **Kısmen** | 152 tablonun 124'ü tarayıcıya kapalı. 28'i açık, bunların 15'ine yazılabiliyor. Ekranlar bu 15'ten yalnız 9'unu kullanıyor. Sunucu tarafında "yalnız fonksiyonlarla" doğru değil: API 93 tabloyu doğrudan okuyabiliyor ve oradaki yetki kontrolü TypeScript'te | deney + kod |
| 7 | Manager kapsamı tetikleyiciyle çalışan atamalarından türetiliyor, model doğru | **Kısmen** | Tetikleyici var. Ama admin tarayıcıdan kapsam satırı ekleyip manager'a atanmadığı bir lokasyonu verebildi (E5). Rol düşünce eski satırlar silinmiyor. Tetikleyici ertelemeli olduğu için testlerde hiç çalışmıyor | deney |
| 8 | Lokasyon kontrolü 10'dan fazla fonksiyonda ayrı ayrı yazılmış ve kopyalar farklı | **Doğru** | 12 yardımcı fonksiyon, ayrıca 26 fonksiyonda satır içi | kod |
| 9 | Belgesi engelli manager lokasyonu göremiyor ama orada vardiya yazabiliyor | **Doğru** | E1: engelli manager plan oturumu açtı ve 1 vardiya yazdı. API'deki 7 yerel kapı belge engeline bakmıyor. Bir araştırmanın "API bunu maskeliyor" iddiası bu yüzden yanlış | deney (veritabanı), kod (API) |
| 10 | Lokasyon boş gelince kontrol geçiyor | **Doğru** | 4 yardımcı fonksiyonda "boşsa her yer" kuralı var ve 56 çağrı yeri buna dayanıyor. E2: yalnız Main Dining'den sorumlu bir manager, Garden Room taslağını arşivledi. Aynı soruya 4 kontrolün 3'ü "evet", 1'i "hayır" dedi | deney |
| 11 | Önemli tarihler (`important_dates`) okunurken lokasyona bakılmıyor | **Doğru** | E3: Main Dining'e bağlı kişi Garden Room'un önemli tarihini okudu. Aynı tabloda yazma kuralı ise lokasyona bakıyor | deney |
| 12 | Rol iki yerden okunuyor, bugün 0 uyumsuzluk var, tetikleyici eşitliyor | **Kısmen** | 0 uyumsuzluk doğru. Ama tetikleyici yalnız üyelik tarafını koruyor. Rol tarafındaki tek bir güncelleme üç yönlü ayrışma yarattı: API "manager" diyor, bir kontrol "hayır", diğeri "evet". Bugün uygulamadan bu yapılamıyor | deney |
| 13 | Veritabanında manager satırı yok | **Kısmen yanlış** | FX hariç aktif manager 0; 1 askıya alınmış manager seed'de bilerek kurulmuş. Asıl sorun başka: 59 test dosyası manager kuruyor, ama 57'si ürünün gerçekte oluşturamayacağı bir manager kuruyor | deney + kod |
| 14 | Yetki matrisi testi yok | **Doğru** | Yalnız Line Up'ın API tarafında bir matris var. Veritabanı testleri CI'da hiç koşmuyor | kod |
| 15 | Çözüm yeniden yazım değil: tek `authorize()` artı matris testi | **Kısmen** | Yön doğru ama tek başına yetmez. (a) Matris CI'da koşmazsa kalıcı etkisi olmaz. (b) Kullanılmayan tarayıcı yazma izinleri kapanmalı. (c) Plan kilidi ve izin talebinin lokasyonu değişmezse `authorize()` bu kuralları ifade edemez. (d) İkiz sistemler silinmezse `authorize()` onları da taşımak zorunda kalır. Ayrıca yetki katmanı parça parça değil tek parça tasarlanmalı: bugünkü karmaşayı 8 Eylül'deki parça parça geçiş üretti | kod + deney |
| 16 | `actor_user_id` sunucuda doğrulanmış giriş kartından alınmalı | **Normal yolların hepsinde doğru; 5 istisna var** | Aşağıda | kod + deney |

**Kimlik sonucu: iş arkadaşının "bütün güvenlik buna dayanıyor" dediği halka sağlam.**

API her istekte giriş kartını Supabase'e doğrulatıyor (`apps/api/src/auth/workspace-context.ts:167`) ve veritabanına bu doğrulanmış kimliği geçiriyor. 135 route çağrısı böyle çalışıyor; kimliği istek gövdesinden okuyan bir route bulunmadı [kod]. Kimlik parametresi alan yaklaşık 300 veritabanı fonksiyonunun hiçbiri tarayıcıdan çalıştırılamıyor. Sahte kimlikle denetim kaydı yazma denemesi reddedildi [deney].

Beş istisna:

1. **İç bölmede 3 fonksiyon, çağıranın verdiği kullanıcı kimliğine güveniyor ve "herkes çalıştırabilir" durumda.**
   - Biri, işe geri alınan çalışanın onboarding'ini sıfırlayan fonksiyon. Hiç yetki kontrolü yapmadan kişinin özel profilini ve kimlik bilgilerini siliyor.
   - Bugün tarayıcıdan ulaşılamıyor, çünkü veritabanı API'si iç bölmeyi dışarı açmıyor [deney, yalnız yerel]. Hosted projede durum [doğrulanmadı].
   - Sebep: "yeni fonksiyon herkese kapalı" kuralı yalnız `public` bölmede tanımlı. Ayrıca bir fonksiyon silinip yeniden yazılırken 8 Eylül'de yapılmış kapatmasını kaybetti.
   - Önem yüksek, düzeltmesi tek migration.
2. **Tarayıcıdan doğrudan yazma.** Owner/admin, API'ye hiç uğramadan ve denetim kaydı bırakmadan başka bir üyenin üyeliğini rastgele bir hesaba bağlayabildi ve rolleri değiştirebildi [deney]. İşi yapanın kimliği doğru, ama işin yapıldığı hedef kişi serbestçe seçilebiliyor.
3. **Hesap servisindeki geliştirme kısayolu.**
   - `development-owner-token` yazısı, sunucunun ortam ayarı (NODE_ENV) "production" değilse owner@newfork.test hesabı sayılıyor.
   - Hesap işlemlerinin hepsi bundan etkileniyor: işletme açma/kapatma, sahiplik devri, hesap silme.
   - Vercel'in NODE_ENV'i "production" yapıp yapmadığı [doğrulanmadı]. Yapmıyorsa bu canlı bir açık.
4. **Canlı güncelleme kanalları herkese açık.** Schedule'daki "başkası da bakıyor" göstergesi ve takas bildirimleri bu kanallardan gidiyor. İşletme kimliğini bilen biri bunları dinleyebilir ya da sahte olay gönderebilir [kod; canlı denenmedi].
5. **Kiosk** kişiyi cihaz çerezi ve PIN ile tanıyor. Bu tasarım gereği.

---

## 3. Bugünkü sorunların kaynağı

29 ayrı sorunu kaynaklarına göre ayırdım. Liste bugünkü 6 araştırmayla 38 kırmızı test araştırmasının tekrarları birleştirilerek çıktı; gruplama bana ait.

| Tür | Sayı | Örnekler (ekrandaki karşılığıyla) | Doğrulama |
|---|---|---|---|
| **Gerçek model hatası** | **2** | (a) **Plan kilidi işletme ve hafta başına tek.** Admin, Ayşe'nin Schedule oturumunu devralıp kaydedince taslaktaki Beşiktaş vardiyaları sessizce siliniyor. Kadıköy manager'ı Beşiktaş'ın taslağını arşivleyebiliyor. (b) **İzin talebine çalışanın seçtiği tek lokasyon bağlı.** Ali Salı iznini Kadıköy'ü seçerek gönderirse Beşiktaş'tan Mehmet talebi hiç görmüyor | deney / kod |
| Ucuz şema eksiği | 2 | 11 bağ işletmeye kilitli değil. Rol iki kolonda tutuluyor ve rol tarafı korumasız. İkisi de birkaç satırlık değişiklik | deney |
| **Aynı kural tekrar yazılmış, kopyalar ayrışmış** | **7** | Belge engeli (E1). Boş lokasyon = her yer (E2). İşletme askıya alınmış olsa da Settings'te lokasyon düzenlenebiliyor (E4). Önemli tarihler lokasyona bakmadan okunuyor (E3). Manager, hesabı olan çalışanı işten çıkaramıyor: kural 14 Eylül'de aynı gün iki kez yeniden yazılmış, ikincisi manager dalını düşürmüş. "Hayır" cevabı 4 farklı biçimde dönüyor. D3 ve rütbe kuralı hiçbir kopyada yok | deney + kod |
| **Yarım kalmış geçiş / silinmemiş eski sistem** | **12** | "Tarayıcı → API" geçişi yarım: 45 köprü fonksiyon oturumdaki "giriş yapan kişi" alanını geçici olarak değiştiriyor, 8 politika ölü. Kullanılmayan tarayıcı yazma izinleri: admin işletmeyi "silindi" yapıyor, ekranı olmayan Shift Hub'ı açıyor, çalışan sahte ve geriye tarihli denetim kaydı ekliyor. İç bölmedeki izin açığı. Schedule ızgarası eski availability sistemini okuyor, kaydetme ve yayın yenisini kullanıyor. Shift Hub her yerde kapalı ve eski Requests akışı paralel yaşıyor. Kiosk ve zaman takibi geri gelmiş (14 tablo). Katman hataları: çalışan kaydedilince onaylı tercih edilen ad siliniyor; swap'ta bırakılan vardiya kendisiyle çakışıyor sayılıyor (BL-092). Tercih edilen ad bildirimlerinin alıcısı yok. Zamanlanmış dışa aktarma her seferinde hata veriyor. Geliştirme kısayolu iki farklı şekilde kapatılmış. Canlı kanallar herkese açık. Rol düşünce eski kapsam satırları kalıyor | deney + kod |
| Arayüz / ürün kuralı boşluğu | 3 | Owner, admin ve manager çalışan ekranlarına (Employee Hub) giremiyor. Onaylı izin, Settings → Conflict handling'den "Require confirmation"a çekilebiliyor. Manager "çalışan ekle"de hiçbir hata görmeden boş bir rol listesiyle karşılaşıyor | kod (sonuncusu manager hesabıyla denenmedi) |
| Test ve süreç | 3 | Veritabanı testleri CI'da hiç koşmuyor; 38 kırmızı test kimse görmeden birikti. 59 manager testinin 57'si gerçekte oluşamayacak bir manager'ı sınıyor. Test verisi elle yazılmış 1.242 satırdan oluşuyor; testler mesaj metnine ve bugünün tarihine bağlı | deney + kod |

**Sonuç:** 29 sorundan 4'ü şema düzeyinde: 2 model hatası ve 2 ucuz şema eksiği. Kalan 25'i kural tekrarı, yarım geçiş, arayüz boşluğu ya da test/süreç sorunu. Yeniden kurma maliyetini ölçen araştırma da aynı sonuca ayrı yoldan vardı: 38 kırmızı testin bulgularında hiçbir hata farklı bir veri modeli gerektirmiyor.

**Döngü şöyle işliyor:**
- Kararlar çok hızlı koda dönüyor. Bütün migration satırlarının %58'i 7–9 Eylül'deki 3 günde yazıldı.
- Yeni kural yeni bir yere kopyalanıyor, eskisi silinmiyor. 158 tablodan 0'ı silindi; fonksiyonlar toplam 407 kez yeniden yazıldı. Silinip yeniden yazılan bir fonksiyon izin ayarlarını kaybediyor; bu en az 2 kez oldu.
- Kopyaların ayrıldığını gösterecek testler CI'da koşmuyor. Testlerin kendisi de ürünün yaratamayacağı durumları sınıyor.
- Bir hata çıktığında tek kopya düzeltiliyor, diğer kopyalar olduğu gibi kalıyor. "Yama yapıyoruz" hissi buradan geliyor.

**Gereksiz yere zorluyor muyuz?** Evet, iki yerde:
1. **İkiz sistemleri birlikte yaşatmak.** İki availability sistemi, iki takas akışı ve MVP dışındaki kiosk ile zaman takibi aynı anda duruyor. "Canlı veri yok" kuralı veriye uygulanmış, koda uygulanmamış.
2. **Kapsam kararını kodla taşımaya çalışmak.** Kural tek yerde olmadığı için her senaryonun onlarca yerde ayrı ayrı düşünülmesi gerekiyor. Kapsam modelinin kendisi (manager'ın lokasyonla sınırlı olması) sektörde olağan. Kodun yarısı zaten M2'ye uyuyor: matris prototipinde "Ayşe kimin çalışan kartını görür" hücreleri M2 ile birebir çıktı [deney].

---

## 4. Üç seçenek

| | **A: Yerinde toparla** | **B: Yetki çekirdeğini yeniden kur, alan alan** | **C: Sıfırdan kur** |
|---|---|---|---|
| Ne yapar | Şema ve fonksiyonlar kalır. Altlarına tek yetki çekirdeği konur, matris CI kapısı olur, bilinen hatalar düzeltilir. Yarım geçişler yalnız bir işi engellediğinde temizlenir | Önce test kapıları kurulur. Sonra ikiz sistemler silinir, yetki katmanı tek parça tasarlanır ve alanlar birer birer ona taşınır. Tablolar kalır | Yeni veritabanı, RLS ve backend M2'ye göre sıfırdan tasarlanır. API yeniden bağlanır, web mümkün olduğunca aynı veri şekilleriyle uyarlanır |
| Ne düzeltir | Tek kural; güvenlik açıkları; CI; M2 değişiklikleri; 38 kırmızı testteki hatalar | A'nın hepsi. Ayrıca ikiz sistemler silinir, Settings yazmaları API arkasına alınır, her varlığın tek yazma yolu olur, bütün testler yeni test dünyasına taşınır, migration'lar tek tabana iner | Kâğıt üzerinde en temiz son durum. Manager kapsamı tetikleyici yerine görünüm olarak türetilir, geçmişten kalan katman kalmaz |
| Ne düzeltmez | Kiosk, zaman takibi ve Line Up kalır. Dokunulmayan yerlerde eski katmanlar sürer. Settings'in tarayıcıdan yazdığı 7 tablo ikinci bir yetki yolu olarak kalır. Test verisi yalnız dokunulan yerde düzelir | Ekranların kendi gizle/göster kararları; uygunluk kuralları; bildirim alıcıları; web'in veri şekline sıkı bağlılığı | Kararların verilmesi; kuralların zorlanması; kimlik çekirdeği (zaten sağlam, kazanç yok) |
| Süre (kişi-hafta) | 8,5–15 | 10–17 | 13–22 (maliyet araştırması: 13–24) |
| İlk güvenlik kazancı | 2–3,5 hafta | 2,5–4 hafta. Ama yazıldığı sırayla yetki çekirdeği ancak 5–8. haftada gelir | Ancak programın sonunda. Ya da eski koda ayrı yamalar yapılır ve iki kod hattı birlikte yaşar |
| Başlıca risk | Yarıda kalmak (8 Eylül'deki geçiş gibi). Çekirdek için verilen 0,5–1 hafta tahmini üç hakeme göre de iyimser | Uzun program; MVP 2,5–4 ay durur. Tabana indirme ve hosted'u sıfırlama işi. "Hayır"ın biçimi değişince bazı ekranlar bozulabilir | İkinci sistem etkisi (4. nesil). 4.275 test kontrolünde kayıtlı kararlar yeniden türetilmek zorunda. MVP, A ve B'ye göre 5–8 hafta geç |

**Hakem puanları (1–10):**

| Hakem (bakış açısı) | A | B | C | Kazanan |
|---|---|---|---|---|
| Güvenlik ve doğruluk | 7 | **8** | 5 | B (sırası düzeltilirse) |
| Tek kişilik teslim riski | **8** | 6 | 2 | A (iki eklemeyle) |
| Uzun vadeli bakım | 6 | **8** | 5 | B |
| **Toplam** | 21 | **22** | 12 | |

Üç hakemin ortak notu: A ile B aynı plana yakınsıyor.
- A'ya üç şey eklenirse B'ye dönüşür: kiosk, zaman takibi ve kaybeden takas akışının silinmesi; Settings → Organization yazmalarının API arkasına alınması; test verisinin her alanda yeni test dünyasına taşınması.
- B de yetki çekirdeğini silme ve tabana indirme işlerinden önce kurarsa iki plan aynı olur.
- C'yi üç hakem de son sıraya koydu.

---

## 5. Önerilen yol: "B′" (B'nin kapsamı, A'nın sırası)

### Aşamalar

| Aşama | Ne yapılır | Süre | Bitiş kriteri |
|---|---|---|---|
| **0. Kararlar** | M2 ve alt kararları (izin onayı, D3, rütbe); D1 (manager rolleri ayar yazamaz); BL-091; Shift Hub mı Requests mı; kiosk ve zaman takibi; owner/admin/manager için çalışan görünümü. Onaylı iznin her zaman hard olması hedef modelde zaten kararlaştırılmış | 0,5 | Her karar konvansiyon dosyasında yazılı ve beklenti fonksiyonunda tek satıra karşılık geliyor. Açık kalanlar adıyla listelenmiş |
| **1. Güvenlik tıkaçları + CI kapısı** | Bölüm 5'teki "ilk 2 hafta" listesi | 1–1,5 | CI her gönderimde veritabanı testlerini koşuyor. E5 ve E6, işletme ekleme, işletmeyi "silindi" yapma ve sahte denetim kaydı denemeleri yeniden koşulduğunda reddediliyor. Settings → Organization hâlâ kaydediyor (tarayıcıda denenmiş). Hosted güvenlik danışmanı temiz |
| **2. Test dünyası + yetki matrisi** | Ürünün kendi yollarından kurulan test dünyası. Tek dosyalık matris (aşağıda) | 1–2 | Matris CI'da koşuyor. Bugünkü ayrışmalar (E1–E5, boş lokasyon, D3, 4 çeşit "hayır") listelenmiş kırmızı hücreler olarak görünüyor. Matrise satırı eklenmemiş yeni bir servis fonksiyonu CI'dan geçemiyor |
| **3. Plan kilidi lokasyon + hafta başına** | Taslak, kilit ve oturum lokasyon ile hafta bazında. Kaydetme yalnız oturumun kendi lokasyonlarına dokunuyor | 0,5–1 | "Ayşe Kadıköy'ü, Mehmet Beşiktaş'ı aynı hafta planlıyor" senaryosu yeşil. Admin oturumu devraldığında Beşiktaş vardiyaları artık silinmiyor |
| **4. Yetki çekirdeği** | Kişinin durumu tek yerde çözülür: üyelik, işletme durumu, belge engeli ve o durumda izinli işlerin listesi, rol sınıfı (tek kaynaktan), izinler ve kapsam. Bunun üstüne `authorize()` ve `scope_set()`. Boş lokasyon asla "her yer" anlamına gelmez. "Hayır" her zaman tek biçimde ve girdi kontrolünden önce döner. API'de tek yetki kapısı ve tek kimlik çözücü olur | 2–3 | Matrisin tutarlılık katmanı (boş lokasyon dahil) yeşil. API route matrisi yeşil. API'deki yerel kapı sayısı 20'den 0'a iniyor |
| **5. İkiz sistemleri sil** | Eski availability (Schedule ızgarası dahil 4 canlı okuyucu önce yeni sisteme taşınır). Kaybeden takas akışı. Kiosk ve zaman takibi (karar böyleyse). Mezar fonksiyonlar, kullanılmayan fonksiyonlar, ölü politikalar, emekli modelleri anlatan testler | 2–3,5 | Izgara, kaydetme ve yayın tek availability sistemini okuyor. Yaklaşık 25–30 tablo eksik. CI listesi ve matris yeşil |
| **6. Alanları çekirdeğe taşı + M2 + 38 kırmızı testteki hatalar** | Sıra: Schedule → Çalışanlar → İzin → Takas → Availability → Belgeler → Duyuru ve bildirim → Ayarlar. Bu aşamada: Settings yazmaları API'ye alınır; izin lokasyonsuz olur ve etkilenen her lokasyon oy verir; D3; rütbe; onaylı izin için veritabanı kuralı; tercih edilen ad alıcıları; BL-092; çalışan görünümü; Shift Hub'ı açma yolu; manager'ın işten çıkarabilmesi. Veri şekilleri sabit kalır, web yalnız bilerek değiştirilen ekranlarda oynar | 3–5 | Her alanın matris hücreleri yeşil ve "karar bekliyor" hücresi kalmamış. Köprü fonksiyonlar 45'ten 0'a iniyor. Line Up dışındaki 31 kırmızı test ya düzeltilmiş ya silinmiş |
| **7. Tek taban + hosted yeniden kurulum** (isteğe bağlı) | İkizler silindikten sonra 319 migration tek dökümde birleştirilir | 0,5–1 | Sıfırdan yerel kurulum, katalog kontrolleri ve matris yeşil. Hosted veritabanı güncel ve güvenlik danışmanı temiz |

**Toplam:** yaklaşık 10–17 kişi-hafta.

**Durma noktaları:**
- **Aşama 2'nin sonu (2,5–4 hafta):** A'nın bütün erken güvenlik kazancı alınmış olur.
- **Aşama 4'ün sonu:** kural tek yerdedir.
- Her aşama tek başına yayınlanabilir. Program yarıda kalırsa geride tutarlı bir sistem kalır.

### İlk 2 hafta

**Hafta 1**
- Aşama 0 kararları (senin 1–2 oturumun).
- CI'a veritabanı testi işi. Başlangıçta yalnız bugün yeşil olan dosyalar koşar; liste yalnız büyüyebilir.
- Güvenlik tıkaçları. Her biri küçük bir migration ya da silme:
  - İç bölmede "herkes çalıştırabilir" varsayılanını kapat, 3 fonksiyonu da kilitle.
  - Hiçbir ekranın yazmadığı tarayıcı yazma izinlerini geri al: üyelik, kapsam satırları, denetim kaydı, işletme ekleme, onboarding durumu, planlama ayarları, TRUNCATE.
  - İşletme tablosunda tarayıcı yalnız adı ve logoyu değiştirebilsin.
  - Settings → Organization'ın kullandığı 7 tabloyu şimdilik açık bırak (lokasyonlar, departmanlar, job'lar, önemli tarihler, vardiya tipleri, vardiya etiketleri, işletme adı ve logosu). Kapatılırsa bu ekran bozulur.
  - 11 bağı işletmeye kilitle; rol için bileşik bağ ekle.
  - Geliştirme kısayolunu sil.
  - API'deki 7 yerel kapıya belge engeli ve üyelik durumu kontrolü ekle. Bu E1'i API katmanında kapatır.
  - Tercih edilen adı silen hatayı düzelt (tek argüman, güvenli).
- Hosted proje için salt-okunur kontroller: NODE_ENV, dışarı açık şemalar, güvenlik danışmanı (soru 8).

**Hafta 2**
- Katalog kontrolleri, her şemada şunları doğrular:
  - "herkes çalıştırabilir" durumda iç fonksiyon yok,
  - tarayıcının yazabildiği tablolar izinli listeyle aynı,
  - politikası olup izni olmayan tablo yok.
- Test dünyası: manager'lar kapsamlarını yalnız kendi lokasyon atamalarından alır, ertelemeli tetikleyiciler zorla çalıştırılır.
- Matris iskeleti: önce vardiya yazma ve yayınlama, çalışan kartı ve işten çıkarma, ayar yazma, doğrudan tablo okumaları. Çıkan kırmızı hücre listesi sonraki haftaların iş listesi olur.

### Bekleyenler

- **Line Up** (11 tablo): kendi sadeleştirme kararını bekliyor. Matriste gerekçesiyle "muaf" olarak yazılır.
- **Uygunluk matrisi** (lokasyon + job + availability): aynı motor üzerinde, Aşama 4'ten sonra.
- **Ekranların gizle/göster kararlarının matrisle karşılaştırılması:** web'de 64 izin kontrolü ve 10 rota koruması, API'de 31 kontrol var. İleride tek bir web yardımcısı üzerinden yapılır.
- **Web'in veri şekline sıkı bağlılığı:** temizlenmesi gerekmiyor, bilerek sabit tutuluyor.
- **MVP dışındaki yeni özellikler:** bu program boyunca durur. Aşama 3 ve 6'nın büyük kısmı zaten MVP işi: kilit, çalışan görünümü, Shift Hub'ın açılması, izin onayı.

### Rol ve kapsam modeli kararı

**Önerim M2: "kişi ortak, vardiya yerel".**
- Ayşe, lokasyonlarından birinde çalışan herkesi bütünüyle görür (Ali dahil).
- Vardiya, bulunduğu lokasyona aittir.
- Başka bir lokasyonu etkileyen karar o lokasyonun da onayını ister. Örnekler: işten çıkarma, Beşiktaş'ta vardiyası olan bir güne izin onaylamak.
- Manager yalnız employee rütbesindekiler hakkında karar verir.

Gerekçeler:
1. Kod yarı yolda. Matris prototipindeki okuma hücreleri M2 ile birebir çıktı [deney].
2. Şema değişikliği yalnız izin talebindeki lokasyon alanı. Kilit değişikliği her modelde gerekli zaten.
3. Sektördeki ortak kalıp bu (G'nin kaynakları; orkestratör kaynakları ayrıca doğrulamadı).

**Önemli nokta:** tek `authorize()` kurulduktan sonra modelin bütün karmaşıklığı yaklaşık 60 satırlık tek bir beklenti fonksiyonunda durur. M3'e ya da M4'e geçmek yapıyı değil, yalnız o satırları değiştirir. Yani hiyerarşiyi kodu kolaylaştırmak için değiştirmen gerekmiyor; ürün gerekçesiyle seçebilirsin. M4 (manager = admin eksi ayarlar) kodu en çok sadeleştirir, ama "şube müdürü" kavramını kaldırır ve sonradan geri getirmek pahalıdır.

### Yetki matrisi testinin yeri

- **Ne zaman:** Aşama 2'de, yetki çekirdeğine dokunmadan önce. Hangi seçenek seçilirse seçilsin kabul testi bu olacak.
- **Nerede:** `supabase/tests/authorization_matrix.test.sql`. Tek dosya, CI'da her gönderimde koşar.
- **Kimleri sınar:**
  - owner Olcay; admin Zeynep;
  - manager'lar: Ayşe (Kadıköy), Mehmet (Beşiktaş), Can (ikisi), Nur (lokasyonsuz); "Shift lead" özel rolünde Nil;
  - çalışanlar: Ali (Kadıköy + Beşiktaş), Emre, Veli;
  - durumlar: askıdaki Sami, daveti bekleyen Pelin, çıkarılmış Remzi;
  - başka işletmenin sahibi Xavier.
- **Kararlarla nasıl aynı adımda kalır:** bir karar değişince beklenti fonksiyonunda tek satır değişir. Koşu hangi hücrelerin döndüğünü listeler; etki raporu budur ve elle düzeltilecek test verisi yoktur. Açık kararlar "karar bekliyor" hücresi olarak basılır, testi kırmaz. Yeni bir servis fonksiyonu, kuralı matrise yazılmadan CI'dan geçemez.
- **Göremedikleri:**
  - ekranların düğme gizleme kararları,
  - API kablolaması,
  - izin verilen bir cevabın içinde sızan alanlar (ör. özel iletişim bilgisi),
  - uygunluk kuralları,
  - bildirim alıcıları,
  - kilit ve eşzamanlılık sorunları.
- **Hız:** prototip 117 hücreyi yaklaşık 0,5 saniyede koştu [deney]. Tam boy (1.500–2.000 hücre) için 5–20 saniye tahmini [doğrulanmadı].

### Senin saydığın beş zorluk bu planda nerede çözülüyor

| Zorluk | Çözüldüğü yer |
|---|---|
| Organizasyon kapsamlı ve lokasyon kapsamlı yetki | M2 kararı (Aşama 0) ve tek `authorize()`/`scope_set()` (Aşama 4). Kural tek yerde |
| RLS, politikalar ve bunlara göre kurulmuş veritabanı | Tarayıcı izinleri izinli listeye iner (Aşama 1). Her varlığın tek yazma yolu olur (Aşama 6). Katalog kontrolleri her şemada (Aşama 1). Veri modeli değişmiyor |
| Testlerin kararlarla aynı adımda kalması | Matris ve tek beklenti fonksiyonu, ürün yolundan kurulan test dünyası, CI kapısı (Aşama 1–2) |
| Çalışan arayüzünde başlayıp admin arayüzüne uzanan özellikler | API'de tek yetki kapısı (Aşama 4). Owner, admin ve manager için çalışan görünümü (Aşama 6). Ekran tarafı sonraki iş: web yardımcısı matrisle karşılaştırılacak |
| Uygunluk (lokasyon, job, availability, rol) | Önce tek availability sistemi (Aşama 5) ve BL-092 düzeltmesi, sonra aynı motor üzerinde ikinci bir matris |

---

## 6. Önerinin değişeceği koşullar

**Sıfırdan kurmak doğru olur, eğer:**
1. Kapsam kararı veri şeklini G'nin D1–D7 listesinin çok ötesinde değiştirirse. Ör. her lokasyon ayrı abonelik olursa ya da hiç çok lokasyonlu çalışan olmayacaksa. O durumda "sağlam" 110 tablo da yeniden tasarlanır.
2. İlk taşınan alan (Schedule) ölçüldüğünde, bir alanı `authorize()`'a taşımak onu yeniden yazmak kadar sürerse. Ör. alan başına 1 haftayı aşarsa ya da katman zincirleri çözülemeyecek kadar dolaşık çıkarsa. Bu durumda kalan alanlar tek tek yeniden yazılır; yine de bütün temel yeniden kurulmaz.
3. "Eski tarz kontrol kalmadı" diyen yapısal testler CI'ı güvenilir biçimde kıramazsa. Kuralın tek yerde olduğu kanıtlanamazsa hem A hem B zayıflar.
4. Kimlik çekirdeğinde bir kırık bulunursa (ör. kimliği istek gövdesinden alan bir yol) ya da veri modelinde işletmeler arası ayrım delinirse. Bugün ikisi de bulunmadı.
5. Uçtan uca kendi tasarladığın bir temeli, MVP'nin 5–8 hafta daha geç gelmesine açıkça tercih edersen. Bu meşru bir tercih, teknik bir zorunluluk değil.

**Daha dar yola (A) dönmek doğru olur, eğer:**
- karar zamanın haftada birkaç saatle sınırlı kalırsa ya da Aşama 0 kararları 2 haftadan uzun açık kalırsa,
- Settings yazmalarını API'ye taşımak beklenenden pahalı çıkarsa,
- hosted veritabanı güvenle sıfırlanamazsa.

**Plan değişmez ama aciliyet artar, eğer:** Vercel'de NODE_ENV "production" değilse ya da hosted proje iç bölmeyi dışarı açıyorsa. O durumda Aşama 1 ilk günün işi olur.

**Önerinin dayandığı ama doğrulanmamış ya da belirsiz olanlar:**
- **Süreler:** bütün süreler tahmin, hiçbiri ölçülmüş bir işe dayanmıyor. A'nın çekirdek için verdiği 0,5–1 haftayı üç hakem de iyimser buldu. İlk alan taşınınca yeniden tahmin yapılmalı.
- **Hosted:** Vercel'deki NODE_ENV, hosted'un dışarı açık şemaları ve hosted izinlerin yereldekiyle aynı olup olmadığı. Hiçbirine bakılmadı.
- **Canlı kanallar:** sahte olay gönderme canlı olarak denenmedi, yalnız kod okundu.
- **Yayın bulgusu:** owner yalnız Kadıköy içeren bir taslağı Beşiktaş için de yayınlayınca Beşiktaş'ın yayınlı vardiyalarının silinmesi doğrulanmadı. Yeniden koşu FX kalıntısı yüzünden başarısız oldu.
- **Sayı farkları:** araştırmalar arasında sayılar farklı. Kimlik parametresi alan fonksiyon için 284, 295, 345 ve 350; lokasyon kopyası için 12 ve 16; API yerel kapısı için 15 ve 20; politika için 65 ve 72. Sayım kuralları farklı; yön tutarlı, kesin sayılar değil.
- **Yanlış çıkan iki araştırma iddiası:**
  - "Ekranlar yalnız 2 tabloya yazıyor" yanlış. Settings → Organization 7 tabloya daha yazıyor; iki hakem ve iki savunucu kodda doğruladı.
  - "API belge engelini maskeliyor" yanlış. 7 yerel kapı belge engeline bakmıyor (E1).
- **Yerel veritabanı ortak kullanılıyor:** işletme sayısı araştırmalar başlamadan 7'den 6'ya inmişti; başka bir oturum değiştirmiş. FX kalıntısı hâlâ duruyor. Bütün deneyler geri alındı; sayılar deneylerden önce ve sonra aynı.

---

## 7. Karar soruları

**1. Hangi yol?**
- **(A) B′: yetki katmanını tek parça yeniden kur, temeli koru, ikizleri sil (10–17 kişi-hafta). Önerim.** Üç hakemden ikisinin kazananı bu. Üçüncü hakemin (teslim riski) istediği iki ekleme zaten içinde. Bilinen açıklar yine ilk 2 haftada kapanıyor ve her aşamada durulabiliyor.
- (B) Yalnız A (8,5–15): CI, tıkaçlar, matris, çekirdek ve M2 değişiklikleri. İkiz sistemler ancak bir işi engellediğinde silinir. Karar zamanın kısıtlıysa doğru seçim.
- (C) Sıfırdan (13–22). Yalnız bölüm 6'daki 1. ya da 5. koşul geçerliyse.

**2. Kapsam modeli?**
- **(A) M2, ve G'nin raporundaki 2–12. soruların önerileri beklenti fonksiyonuna varsayılan olarak yazılsın. Önerim.** Bu öneriler: izni etkilenen lokasyonlar oylar; D3; rütbe kuralı; lokasyonsuz manager olmaz. İstemediğin satırı söylemen yeter; tek tek karar vermen gerekmez.
- (B) M3: manager her şeyi görür, yalnız kendi lokasyonunda iş yapar.
- (C) M4: manager = admin eksi ayarlar.
- (D) M1: katı kapsam.

**3. Eski availability sistemi (BL-091)?**
- **(A) Sökülsün; Schedule ızgarası dahil her yer tek sistemi okusun. Önerim.** Izgaranın eski sistemi okuması 10 Eylül'de gerekçesiz eklendi. Canlı okuyucu yalnız 4.
- (B) Kalsın.

**4. Takas akışı?**
- **(A) Shift Hub kalsın; açma yolu eklensin, kapatma bayrağı silinsin; eski Requests → Shift changes akışı silinsin. Önerim.** İki lokasyonlu oylama Shift Hub'da hazır ve M2'nin izin onayı aynı kalıbı kullanacak.
- (B) Tersi.
- (C) İkisi de kalsın. Önermem: her kuralı iki kez yazdırır.

**5. Kiosk ve zaman takibi?**
- **(A) Silinsin. Önerim.** MVP dışında, 14 tablo, önceki brief de yasaklamıştı. Kalırsa matris onları da kapsamak zorunda.
- (B) Dondurulsun: tablolar kalır, matriste "muaf" olarak yazılır.
- (C) Kalsın.

**6. Settings → Organization'ın tarayıcıdan doğrudan yazdığı 7 tablo?**
- **(A) API arkasına alınsın. Önerim.** Her varlığın tek yazma yolu olur. Job ve departman için API route'ları zaten var.
- (B) Doğrudan yazma kalsın, ama tarayıcı politikaları aynı `authorize()`'ı çağırsın.

**7. Owner, admin ve manager kendi vardiyalarını görüp izin ve takas talep edebilsin mi?**
- **(A) Admin arayüzüne "Benim vardiyalarım / Taleplerim" girişi eklensin; talepler rütbe kuralına göre yönlensin. Önerim (G).**
- (B) Bu roller için Employee Hub'a geçiş düğmesi eklensin.
- (C) Şimdilik gerek yok.

**8. Hosted kontroller?**
- **(A) İzin ver: Vercel'deki NODE_ENV'e ve hosted projenin dışarı açtığı şemalara salt-okunur bakayım, güvenlik danışmanını koşayım. Önerim.** İlk haftadaki tıkaçların aciliyeti bunlara bağlı.
- (B) Sen bak.
- (C) Aşama 1'e kadar bekle.

**9. Migration'lar tek tabana insin ve hosted veritabanı sıfırdan kurulsun mu (Aşama 7)?**
- **(A) Evet, ikiz sistemler silindikten sonra. Önerim.** Hosted'da 22 Eylül itibarıyla 2 işletme ve 3 çalışan var; bunlar atılabilir mi?
- (B) Hayır, migration geçmişi olduğu gibi kalsın.