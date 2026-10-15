# Newfork için skill önerileri (15 Ekim 2026)

Soru: Hangi skill'leri yaratmalıyım ki tek komutla tekrar eden işleri başlatayım ve daha çok ürün çıksın?

## Kısa cevap

Thread'lerin her işte baştan çıkardığı uzun usulleri skill'e çevir. En çok zaman yiyenler dört tane:
görsel karar sayfası, işi teslim etme (kontrol + güvenlik onayı + push + rapor), buluttaki veritabanı testi ve yeni servis iskeleti.
Önce bu dördünü yap, iki hafta kullan, sonra gerekirse kalanları ekle.

Skill nedir: bir thread'in belli bir işi her seferinde aynı biçimde yapması için yazılmış talimat dosyası. Thread onu adıyla çağırır; usulü baştan araştırmaz, adım atlamaz.

## Nerede dursunlar: repoda (`.claude/skills/`)

Koordinatörün varsayılanına katılıyorum. Nedenleri:
- Hesap değiştiriyorsun; claude.ai hesabındaki skill'ler yeni hesaba geçmez, repodakiler geçer.
- Repodaki skill'i bulut thread'leri de, bilgisayarındaki Claude (tren thread'i) da otomatik görür. Bugün repoda bir tane var: haftalık kural denetimi (`.claude/skills/haftalik-denetim/SKILL.md`), bu thread onu listesinde görüyor.
- Değişiklik geçmişi tutulur, güvenlik ajanı inceler, trenle main'e girer.
- Eksi: main'e girene kadar yalnız dalında durur; yani bir skill ancak trenden sonra her thread'de çalışır.

Hesap skill'i (claude.ai'deki "Kaydet" kartı) yalnız repoya bağlı olmayan, kişisel bir şey için mantıklı. Bu listede öyle bir şey yok.

## Önerilen skill'ler

### Önce bu dördü (en çok ürün kazancı)

**1. Görsel karar sayfası** (öneri adı: `varyant-sayfasi`)
- Ne yapar: Bir ekran parçası için "Orijinal + varyantlar" sayfasını gerçek koddan kurar; `/mnt/project-files/pages/gorsel-kararlar/gelen/<konu>/` altına yazar, yayınlar, yolu koordinatöre bildirir. "Hangisini yapayım?" sorusu sormaz.
- Örnek komut: "varyant-sayfasi: Lineup satırı, 3 varyant".
- Neden: Arayüz kararlarının hepsi bu yoldan geçiyor; şu an `gelen/` altında 28 klasör var. Her thread kuralları (Orijinal etiketi, soru yok, telefon 390 / masaüstü 1440, büyük sayfada JS'i ayırma) baştan okuyup uyguluyor.

**2. İşi teslim et** (öneri adı: `is-teslim`)
- Ne yapar: Dokunulan paketin lint / typecheck / ilgili testlerini koşar → güvenlik ajanından onay alır → `claude/...` dalını push eder → koordinatöre "dal@sha, ne değişti önce/sonra, dokunulan dosyalar, auth bekletmesine giren dosya var mı" raporunu yollar.
- Örnek komut: "is-teslim".
- Neden: Her kod işinin sonu aynı ve sıra atlanınca tren geri dönüyor. Tek komut olunca thread'in "bitti" demesi gerçekten trene hazır demek olur.

**3. Bulutta veritabanı testi** (öneri adı: `bulut-db-test`)
- Ne yapar: Bulut thread'inin kendi makinesinde Postgres'i kurup migration'ları yükler ve veritabanı testlerini (pgTAP) koşar; sahte servisler yüzünden hep kırmızı kalan dosyaları ayırır.
- Örnek komut: "bulut-db-test" ya da "bulut-db-test: availability".
- Neden: Bugün veritabanı işi bilgisayarındaki tren thread'ine bağlı. 12 Ekim'de bir thread bunun bulutta çalıştığını buldu (187 dosyadan 183'ü yeşil), ama usul yalnız hafıza notunda. Skill olunca veritabanı işleri bilgisayarını beklemeden ilerler.

**4. Yeni servis iskeleti** (öneri adı: `yeni-service`)
- Ne yapar: Yeni bir veri işlemi için migration + yetki kontrolü + yetki tablosu ve katalog testi + API ucu + ekran hook'u kurar, kuralların istediği tek biçimde.
- Örnek komut: "yeni-service: vardiya notu ekleme".
- Neden: Ürün kodunu en çok hızlandıracak olan bu. Önceki listede beşinci sıradaydı; PAGES yenileme düşünce ilk dörde girdi.

### Sonra, ihtiyaç görülürse

**5. Tren paketi** (`tren-paketi`, bulut tarafı): hazır dalları toplayıp bilgisayarındaki tren thread'ine gidecek mesajı hazırlar: dal listesi, karar metinleri (o thread proje dosyalarını okuyamıyor), dosya listesi, önce koşulacak e2e testleri.

**6. Thread devir raporu** (`devir-raporu`): bir thread'in durumunu `/mnt/project-files/devir/threadler/<konu>.md` biçiminde yazar. Hesap taşırken 16 thread bunu elle yazdı; tekrar gerekecek.

**7. Mert'e yazı kontrolü** (`mert-yazim`): bir cevabı göndermeden önce senin kurallarına göre düzeltir: Türkçe, saat California saatiyle, numara yalnız parantezde, tam dosya yolu, son seçenek "Yazarak cevap vereceğim".

## Önermediklerim ve nedeni

- **PAGES yenileme:** 15 Ekim'de ekran ekran Artifact belgeleme kuralını emekliye ayırdın; bu skill listeden çıktı.
- **5 dakikalık thread raporu:** Bu koordinatörün zamanlayıcısıyla dönüyor; skill değil, zamanlanmış görev işi.
- **Kuralları tekrar eden skill'ler:** CLAUDE.md'de zaten yazan bir kuralı skill'e kopyalamak iki ayrı kaynak yaratır ve biri eskir (repo kuralı: ikiz sistem yok). Skill yalnız "nasıl yapılır" adımlarını tutmalı, kuralı CLAUDE.md'ye bağlantıyla anmalı.
- **Çok sayıda skill bir anda:** Her skill'in açıklaması her oturumun başında yüklenir. 10–15 skill, thread'lerin yanlış olanı seçmesine ve her oturumda gereksiz yüke yol açar.

## Zamanlama

- 9 Ekim'de "bir hafta süreç dondurma, zaman ürün koduna" demiştin; bu süre 16 Ekim'de bitiyor. Skill yazmak süreç işi sayılır.
- Hesap taşıması da sürüyor. Bu yüzden önerim: ilk dördünü taşımadan sonra, yeni hesapta tek bir thread'e yazdırmak. Repoya yazılacakları için hesaptan bağımsızlar.

## Görsel karar sayfası skill'i, ayrıntılı (Mert 15 Ekim sabah istedi)

Girdi: konu (ekran → bölüm → düğme/çekmece, rol), Mert'in neyi beğenmediği, varyant sayısı (verilmezse 3).

1. Konuyu daralt: tam yer, rol, çözülecek şey tek cümle. Aynı konu daha önce sorulmuş mu bak: `gelen/<konu>/README.md` eski turları, `docs/plan/KARARLAR.md`, `/mnt/project-files/notes/oturum-ozetleri/`.
2. Orijinal'i güncel main kodundan, örnek veriyle kur; elle çizim değil.
3. Varyantları yap (Mert, 15 Ekim): hedef en iyi çözüm, bugünkü ürüne yama değil. Bugünkü hâl doğru kabul edilmez; akış, bilgi mimarisi, işleyiş, etkileşim, UI ve UX baştan, sektörde en çok kabul görmüş ve en profesyonel yöntemlere göre tasarlanır. Önce kısa araştırma: bu iş iyi ürünlerde ve tasarım kılavuzlarında nasıl çözülüyor (rakipler yalnız referans). Her varyant farklı bir yaklaşımdır, küçük bir ayar farkı değil.
   Sabit kalan yalnız tasarım dili: uygulamanın fontları ve renk değişkenleri (`--theme-*`), açık tema, yeşil aksiyon / beyaz vazgeç, iki tık kırmızı silme, tarayıcı diyaloğu yok, okunur kontrast. Yani sayfalar yeşilse varyant mavi olmaz; ama yerleşim, akış ve bileşenler serbesttir.
4. Tek sayfa, Artifact (HTML/JS), etkileşimli: Orijinal + A, B, C seçilebilir; masaüstü 1440 ve telefon 390 yan yana ve eşzamanlı, isteğe bağlı alt alta düzen (bugünkü gibi); düğmeler, çekmeceler, üzerine gelme çalışır; rol değiştiriciyle farklı rollerin farklı olayları denenebilir; örnek durumlar (boş, uzun ad, çok kayıt).
5. Her varyantın altında sade Türkçe: ne farklı, neden daha iyi (hangi yaygın yöntem ya da ürün örneğine dayanıyor), seçilirse ne gerektirir (yalnız ekran mı, veri ya da yetki değişikliği de mi; başka hangi ekranlar etkilenir). Çıplak numara yok.
6. Dosyalar `/mnt/project-files/pages/gorsel-kararlar/gelen/<konu>/`: sayfa, `README.md` (kaynak main sürümü, tarih California saatiyle, her varyant bir satır, turlar), masaüstü ve telefon görüntüleri.
7. Yayından önce kendi kontrolü: görüntülere bakar; taşma, kesilen yazı, okunmayan renk varsa düzeltir.
8. Yayınla; aynı konunun yeni turu aynı bağlantıya yeni sürüm olur (günlük 200 yayın sınırı).
9. Bildir: Mert'e bağlantı ve nasıl bakılacağı bir kez; "hangisi?" sorusu ya da kart yok. Koordinatöre klasör yolu, "Bekleyen görsel kararlar" sayfasına eklensin.
10. Mert yorum yazarsa aynı sayfada yeni tur, yorum README'ye.
11. Mert seçince seçimi README'ye yazar; ortak bir değer (boşluk, font, düğme biçimi) değişiyorsa önce karar defterine. Koda geçmez; kodlama Mert'in "kodla"sıyla ayrı iş.

Yapmaz: kod commit'i, main'e dokunma, Mert'e git ya da komut sorusu. İş bitince sayfa belgelemesi yapmaz, uygulama sayfalarını Artifact olarak yazmaz (Mert, 15 Ekim; PAGES emekli).

Çözüldü (15 Ekim sabah): Mert, Hesap devri thread'inde PAGES'in demo uygulama aracını (`/mnt/project-files/PAGES/_kaynak/`) yalnız varyant sayfalarındaki Orijinal görüntüsü için tutmayı seçti; araç güncel tutulmaz ve yayınlanmaz. 2. adım bu aracı kullanır.
