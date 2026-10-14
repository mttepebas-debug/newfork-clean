# Yeni hesapta nasıl devam edilir (NASIL-DEVAM)

Tarih: 14 Ekim 2026. Önce `HANDOFF.md`'yi oku; bu dosya kurulum adımlarıdır.
Kısaltma yok: her yol tam yol. Saatler California saati.

Yolların iki hâli:
- Bulutta (yeni projede geri kurulunca): `/mnt/project-files/...`
- Mert'in bilgisayarında: `C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\proje-dosyalari\...`
- GitHub'da (yalnız metin dosyaları): `docs/plan/devir-2026-10-14/hesap-devri/proje-dosyalari/...` (dal `claude/hesap-devri-bqus46`)

Raporlarda geçen `/mnt/project-files/X` yolu, bilgisayarda `...\proje-dosyalari\X`, GitHub'da `.../proje-dosyalari/X` demektir.

---

## Adım 1. Eski hesapta son işler (Mert, 2 dakika)

1. Eski hesapta proje sohbetine "raporu durdur" yaz. Koordinatörün 5 dakikalık rapor zinciri durur.
2. Eski hesapta PC tren thread'inin ("Bilgisayarındaki Claude 2 (tren)") yedek işini bitirdiğini gör (koordinatör haber verir). Bitmeden yeni hesapta Remote Control açma (adım 6), çünkü aynı bilgisayarda iki tren aynı test makinesini kullanamaz.
3. Eski hesabı kapatma, silme. Eski Artifact linkleri orada çalışmaya devam eder; yeni hesap gerekirse onlara bakmak için Mert'e sorar.

## Adım 2. Yeni hesapta projeyi kur (Mert)

1. claude.ai'de yeni hesapla gir. Sol menüde **Projects** → **New project**.
2. Ad: `Newfork-clean`. Görünürlük: özel (private).
3. **Repository** bölümünde GitHub'ı bağla ve `mttepebas-debug/newfork-clean` reposunu seç. GitHub bağlı değilse: https://claude.ai/connect-github. Claude GitHub uygulaması repoda kurulu değilse: https://github.com/apps/claude/installations/select_target.
4. **Project instructions** kutusuna aşağıdaki "Proje talimatı" metnini olduğu gibi yapıştır.
5. **Local folders / bağlam kaynakları:** Claude masaüstü uygulamasında şu klasörleri projeye onayla:
   - `C:\Users\TheWe\Documents\Codex\newfork-clean` (varsayılan)
   - `C:\Users\TheWe\Documents\Codex\newfork-pages`
   - `C:\Users\TheWe\Desktop`
   - (eski hesapta bağlam kaynağı olarak "PAGES" klasörü vardı; aynısı isteniyorsa `C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\proje-dosyalari\PAGES`)
6. **Connectors:** Supabase (canlı migration için şart), GitHub. Bunlar bağlanmadan canlı veritabanı adımı yapılamaz.

### Proje talimatı (eski projeden birebir)
```
Depodaki CLAUDE.md kurallarına her zaman uy. Bu talimatla CLAUDE.md çelişirse CLAUDE.md geçerlidir.
Mert ile Türkçe yaz.
Mert'in çalışma kuralları (2026-10-09) tam metin: /mnt/project-files/MERT-KURALLARI.md. Her thread ve koordinatör bunlara uyar. Özet:

1. Rapor zinciri: thread'ler koordinatöre rapor verir (send_message ile proje koordinatörüne), Mert'e iş yüklemez. İlerleme, engel, izin denetimi takılması, temizlik, "istersen şunu çalıştır" türü her şey koordinatöre. Thread'de Mert'e yalnız iş bittiğinde kısa sonuç ya da yalnız onun verebileceği ürün kararı / canlıyı etkileyen geri alınamaz adım için tek soru.
2. Git: Mert git yönetmiyor. Commit, push, merge, worktree, dal işlerini Claude CLAUDE.md akışıyla kendisi yapar, Mert'e git sorusu ya da komutu sorulmaz. Main'e her şey trenle girer, PR açılmaz, "PR oluşturayım mı" sorulmaz.
3. Referanslar: kısaltma yok. Dosya yolu her zaman tam yol (örnek: C:\Users\TheWe\Documents\Codex\newfork-clean\docs\plan\devir-2026-10-08\EKRAN-01.md, satır 94; bulut thread'inde depo kökünden tam yol ve GitHub bağlantısı). Uygulamanın bir parçasından bahsederken tam yer ver: hangi ekran, hangi bölüm, hangi düğme/çekmece, hangi rol. 5N1K'ya (ne, nerede, ne zaman, nasıl, neden, kim) olabildiğince cevap ver.
4. Değişiklik anlatımı: ne değişti, önce/sonra, sözlü olarak. Görsel bir değişiklik varsa Artifact olarak göster.
5. Artifact: gösterilen sayfa uygulamadaki güncel hâliyle birebir görünsün ve çalışsın: bütün elementler, düğmeler, çekmeceler, efektler, fonksiyonlar gerçek uygulamadaki gibi. Hem görsel sunum hem deneme ortamı olsun. Planlanan bir UI değişikliği varsa Artifact'ta mutlaka varyantlar sunulsun; Mert UI kararlarını görerek ve deneyerek verir.
6. Komutlar: Mert'e çalıştırması için komut verilecekse, Windows'ta Cmd komutu olarak verilir.
Önce gerçekten Mert'in eli gerekip gerekmediğini koordinatör değerlendirir.
7. Bekleme: CI, test ya da başka bir süreç beklerken turu kapatma; bekleme komutuyla izlemeye devam et. Tur yalnız iş bittiğinde, Mert'ten karar beklendiğinde ya da gerçek engelde biter; nedenini koordinatöre yaz.
8. Çoktan seçmeli sorular (Mert 2026-10-10): Mert'e sorulan her çoktan seçmeli sorunun (karar kartları dahil) son seçeneği, Mert'in yazı yazarak cevap verebileceği bir seçenek olsun (örnek: "Yazarak cevap vereceğim"). Sorular detaylı anlatılsın.
9. Detaylı anlatım (Mert 2026-10-10): Mert "detaylı anlat", "örneklendir", "betimle", "anlamadım" gibi bir şey sorduğunda cevap yeniden yazılır ve şu maddelerden uygun olanların hepsini içerir: 5N1K'ya uygun cevap, önce/sonra, bugünkü hâl ve plan/taslak karşılaştırması, mümkünse ekran görüntüsü, ya da Artifact çizimiyle görsel anlatım.
10. Saat (Mert 2026-10-10): Mert'e yazılan her saat referansı onun saatiyle (California, Pacific saati; Ekim'de UTC−7) verilir. UTC saati Mert'e yazılmaz. Örnek: 12:41 UTC → sabah 5:41. Kart etiketleri ve dosya adları da dahil.
11. Ekran belgeleri, PAGES (Mert 2026-10-10, kapsam 2026-10-12'de genişledi):
   a. Amaç: PAGES, uygulamanın tam haritasıdır: her olası sayfa, her sayfadaki bütün parçalar (çekmece, pencere, sekme, ortak bileşen, boş/hata/yükleniyor hâli, rol farkları) ve bütün senaryolar, sayfa → parça → senaryo diye gruplanmış olarak Library'deki PAGES klasöründe (büyük harfle) Artifact olarak durur ve her zaman main'deki güncel uygulamayı gösterir. Mert bu haritayı her sayfanın testi ve arayüz geliştirmesi için kullanır; hiçbir sayfa, parça ya da senaryo eksik kalmaz.
   b. Her kod işi, konusu ne olursa olsun, iş bitiminde kodun dokunduğu her sayfanın, parçanın ve durumun PAGES artifact'ını ve Artifact klasör dizinindeki yerini günceller (aynı bağlantıya yeni sürüm). Yoksa oluşturur. Ortak bir parça değişince onu gösteren bütün sayfalar yenilenir. Haritada olmayan bir sayfa, parça ya da senaryo görülürse eklenir. İş, bu güncelleme yapılmadan bitmiş sayılmaz. Ayrıntı: /mnt/project-files/PAGES/README.md.
   c. Numaralama: her route ayrı bir artifact. 1.0 Auth, auth'a bağlı ekranlar 1.1, 1.2 … Sonra 2 Workspace, 3 Schedule ve diğer route'lar sırayla. Liste ve bağlantılar PAGES dizin sayfasında ve Artifact klasör dizininde tutulur.
   d. Her artifact masaüstü ve mobil görüntüyü birlikte ve senkron çalışır gösterir (masaüstü görüntü okunur boyutta). Üstte rol değiştirici (kim açıyor, kim görüyor) bulunur. Örnek senaryolar içerir. Şablon: Library > Artifacts > "Done - Important Date Drawer Designs".
   e. Yayınlamadan önce kaynak bandı kuralı uygulanır: python3 /mnt/project-files/pages/kaynak-bandi/bant.py.
12. Görsel kararlar tek sayfada (Mert 2026-10-11): görsel karar bekleyen her şey "Bekleyen görsel kararlar" sayfasında (https://claude.ai/artifact/JqDJXpTnExgEuNnjhxpimG), ekran ekran sekmelerde durur. Yeni çıkan görsel karar da oraya eklenir: varyant HTML'i /mnt/project-files/pages/gorsel-kararlar/gelen/ altına yazılır, yolu koordinatöre bildirilir; sayfayı /oto thread'i günceller.
13. Plan numaraları (Mert 2026-10-11): Mert'e "BL-1028", "S-14", "K16", "G13" gibi plan, kayıt ya da karar numaralarıyla referans verilmez. Önce maddenin ne olduğu sade sözlerle anlatılır (örnek: "belge reddinde ekrana doğru uyarının çıkması"). Numara gerekiyorsa cümlenin sonunda parantez içinde verilir (örnek: "... uyarının çıkması (BL-1028)"). Thread başlıkları, karar kartları ve Artifact sayfaları da dahil.
14. Thread sayıları takibi (Mert 2026-10-12): Koordinatör thread listesindeki Working, Waiting on you ve Idle gruplarının thread sayılarını izler. Bir sayı değiştiği an Mert'e proje sohbetinde yazar: değişikliği 5N1K ile açıklar (hangi thread, ne oldu, ne zaman, nerede, neden, kim) ve Mert'in bir şey yapması gerekiyorsa yapması ve yapmaması gerekenleri basamak basamak, detaylı anlatır.
15. Kapsam dışı bırakma (Mert 2026-10-14 20:08): Mert'in isteğindeki her maddeyi yüzde yüz kapsamak zorunda değilsin. Bir özellik ürünün kalitesini, kullanım deneyimini ya da arayüz tasarımını belirgin biçimde düşürüyorsa ve o özellik olmadan daha küçük ama daha kaliteli bir sonuç çıkıyorsa, o özelliği kapsam dışı bırakmayı önerebilirsin. Bu durumda özelliği kendiliğinden atma: Mert'e sade ve anlaşılır bir dille neden daha iyi olacağını anlat, 5N1K ve "özellikle / özelliksiz" senaryolarının sonuçlarını göster ve onayını iste. Onay gelmeden o özellik kapsamdan çıkmaz.
```
Not: 12. maddedeki link eski hesabındır. Yeni /oto sayfası yayınlanınca (adım 7) bu satırdaki link yenisiyle değiştirilir.

## Adım 3. Yeni koordinatörün hafızası

Yeni projede proje sohbetine ilk mesaj olarak şunu yaz (koordinatör hafızasına kaydeder):

```
Bu proje eski hesaptan devredildi (14 Ekim 2026). Hafızana şunu kaydet ve ilk iş olarak oku:
1) Devir paketi GitHub'da: mttepebas-debug/newfork-clean, dal claude/hesap-devri-bqus46, klasör docs/plan/devir-2026-10-14/hesap-devri/ (HANDOFF.md, NASIL-DEVAM.md, GUVENLI-OLMAYANLAR.md, threadler/, koordinator-hafiza/, artifactler/).
2) Eski koordinatörün hafızası koordinator-hafiza/MEMORY.md ve yanındaki 18 dosya; oradaki kuralları ve thread durumlarını kendi hafızana al. Eski thread kimlikleri (cmsg_..., cse_...) ve eski Artifact linkleri yeni hesapta çalışmaz; yalnız tarihçe.
3) Proje dosyaları (/mnt/project-files) bilgisayarımda tam kopya olarak duruyor: C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\. İlk thread bunu NASIL-DEVAM.md adım 4'e göre /mnt/project-files'a geri kursun.
4) Bütün Artifact'lar yeni hesapta yeniden yayınlanacak; eşleme artifactler/ARTIFACTLER.md.
5) Mert'ten bekleyen kararlar HANDOFF.md bölüm 2'de; bana tek tek, karar kartıyla, önerilen seçenek ilk ve son seçenek "Yazarak cevap vereceğim".
```

Koordinatör hafızasının özü (eski `MEMORY.md`'den, yeni koordinatörün de tutması gerekenler):
- Mert'e her zaman Türkçe, saatler California (Ekim'de UTC−7). Plan numarası yalnız parantezde. Git komutu verilmez; adımlar numaralı ve tam yollu.
- Main'e yalnız tren; tren Mert'in bilgisayarındaki Remote Control thread'inde koşar. Bulut thread'leri tren isteyemez, koordinatör iletir. Tek CI runner: paralel tren yok. Tren önce ilgili e2e'leri yerelde koşar.
- Bulut thread'leri yalnız kendi `claude/...` dalına push eder; force, mirror, prune yok. Her commit nf-guvenlik ONAY'ı ister.
- Canlı veritabanı yazmaları ve CLAUDE.md değişiklikleri Mert'in PC tren thread'inde kendi yazdığı sözle. Canlı veri test verisidir ama silme yine geri alınamaz sayılır.
- Yasaklar: "devir testi" oturumları (569-2577cf3c, 576-5f3f2c33) okunmaz; şifre değeri yazılmaz; `artifacts/note-mark-r3/.session.json` yedeklenmez; Artifact Mert istemeden silinmez.
- Silinmeyecek dallar: task/ekran-02-c2r, task/ekran-03-c1a, backup/task/bl-969, task/ekran-02-c2-css, task/arayuz-salt-hata, archive/*, task/avail-design, task/ekran-02-c3, task/bl-969-kurtarma, backup/tanitim-sitesi/*, keep/*, coord/kayit2; Jobs worktree keen-brahmagupta-8c4853 (PC raporuna göre temiz). Bunlara bugün `yedek/2026-10-14/*` eklendi.
- Bekletilenler: giriş ekranları (WorkspaceHubPage, WorkspaceStatusPage, ProtectedRoute) Mert "başla" diyene kadar; tasarım tuvali; giriş modeli kararı e-posta servisine kadar. Vercel yalnız main'den yayın.
- Otomasyon durdurulmuş (12 Ekim): kendiliğinden yeni thread, görev ya da backlog maddesi açılmaz; Mert'in doğrudan istekleri yapılır.
- Mert'in kullanım uyarısı: kullanım yükselince "dur" yazacak; cevaplar ve raporlar kısa tutulur.
- Arayüz: kodlamadan önce Original + varyantlar; varyantlar sade ve Original'e yakın; açılır pencereler düğmesine bağlı; seçim kartı yok.

## Adım 4. Proje dosyalarını geri kur (yeni projede ilk bulut thread'i)

Yeni projede proje sohbetine şunu yaz: "Proje dosyalarını geri kur". Koordinatör bir thread açar; brief:

```
İŞ: Proje dosyalarını eski hesaptan geri kur.
1. Bilgisayardaki klasörü kullan: C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\arsiv\
   (list_devices'ta onaylı klasör C:\Users\TheWe\Documents\Codex\newfork-pages; get_device_info ile bağlı mı bak, değilse device_request_folder_access ile tam bu yolu iste).
2. device_stage_files ile bütün proje-dosyalari.tar.xz.part* dosyalarını, SHA256SUMS.txt'yi ve MANIFEST.txt'yi bulut kabına al (bir çağrıda en çok 50 dosya).
3. Staged klasörde: sha256sum -c SHA256SUMS.txt; hepsi OK değilse dur ve söyle.
4. cat proje-dosyalari.tar.xz.part* | xz -d | tar -xf - -C /mnt/project-files/   (arşivin içinde kök klasör yok; dosyalar doğrudan /mnt/project-files altına açılır; açılmış hali ~600 MB).
5. Kontrol: find /mnt/project-files/ -type f | wc -l sayısı arşivdeki MANIFEST.txt satır sayısıyla aynı mı; /mnt/project-files/devir/HANDOFF.md açılıyor mu.
6. Sonucu koordinatöre tek satırla bildir.
Arşiv ~90 MB; tek stage çağrısı yeter. Alternatif: aynı içerik açılmış hâliyle `...\hesap-devri-2026-10-14\proje-dosyalari\` klasöründe de var (yalnız bakmak için).
Dokunma: repo, main, Artifact'lar.
```

Arşiv bulunamazsa yedek yol: GitHub'daki `docs/plan/devir-2026-10-14/hesap-devri/proje-dosyalari/` klasörü (yalnız metin dosyaları) `/mnt/project-files/`'a kopyalanır; büyük html'ler kaynaklarından yeniden derlenir.

## Adım 5. Artifact'ları yeniden yayınla

Eşleme: `/mnt/project-files/devir/artifactler/ARTIFACTLER.md`. Her satırda eski link, kaynak dosya, varsa indirilmiş kopya.
Sıra (yeni hesapta da günde 200 yayın sınırı var; bir günde bitmeyebilir):
1. **PAGES haritası** (route başına 60+ sayfa, dizin ve "Artifact dizini"): güncel main'den yeniden derlenir, eskisini kopyalamak yerine. Derleme yöntemi `HANDOFF.md` bölüm 6 madde 2. Her yeni link `PAGES/_kaynak/tools/pages.json`, `PAGES/MAP.txt`, `PAGES/README.md`, `pages/kaynak-bandi/artifactlar.json`'a yazılır, sonra dizin yeniden yayınlanır. Bant yeni ID ile basılır (ilk yayından sonra ID belli olur, bandı basıp bir kez daha yayınla).
2. **Bekleyen görsel kararlar** (/oto): `threadler/oto.md` bölüm 6. Parça parça yayın (64 MB sınırı).
3. **Açık işlerin mockup'ları:** Lineup telefon ve masaüstü, Takas mockup'ı, Job ikon galerisi, Jobs çekmece renk varyantları, tek cümlelik uyarılar, atanmamış lokasyon hücresi, Availability tasarımları, liste seçim envanteri, kart işaret taslakları, kart kataloğu.
4. **Bitmiş (✅ Done) ve tarihçe sayfaları:** yalnız Mert isterse. Kaynakları dosyada duruyor.
5. Her yeni link Mert'in bilgisayarındaki `C:\Users\TheWe\Documents\Codex\newfork-pages\README.md` satırına "yeni hesap" sütunu olarak eklenir (CLAUDE.md §7: iki hesabın linki).

## Adım 6. PC tren thread'ini (Remote Control) yeniden kur

Ön koşul: adım 1.2 bitti (eski PC thread'i yedeği yaptı ve boşta).
1. Yeni hesapla Claude masaüstü uygulamasını aç. **Code** sekmesi → klasör `C:\Users\TheWe\Documents\Codex\newfork-clean` → **Remote Control** açık. Worktree seçeneği **kapalı** (tren thread'i ana klasörden çalışır, işi kendi worktree'lerinde yapar; ana klasörde dal değiştirmez).
2. Yeni projede proje sohbetine "bilgisayarımdaki tren thread'ini kur" yaz. Koordinatör `start_rc_session` ile bilgisayarda oturumu başlatır; çıkan izin kartını onayla.
3. Brief (koordinatöre verilecek):
```
İŞ: PC tren thread'i (Bilgisayarındaki Claude) — tren, yerel e2e, kilit, canlı migration.
Önce oku: C:\Users\TheWe\Documents\Codex\newfork-clean\CLAUDE.md (§3.B, §5), docs/plan/devir-2026-10-14/hesap-devri/HANDOFF.md (claude/hesap-devri-bqus46 dalında; git show ile oku, checkout yapma) ve /mnt/project-files/yerel-durum-2026-10-14.md'nin kopyası docs/plan/devir-2026-10-14/hesap-devri/proje-dosyalari/yerel-durum-2026-10-14.md bölüm 8.
İlk iş: node scripts/main-watch.mjs --since 9b871a97; node scripts/lock.mjs status; CI runner newfork-local-pc çevrimiçi mi; gh oturumu açık mı; Supabase MCP bağlı mı (değilse Mert'e tek satır: canlı migration için connector gerekli). Sonucu koordinatöre.
Kurallar: main'e yalnız tren (node scripts/train.mjs run <dal@sha…>), cherry-pick listesiyle; birleştirme commit'i trene girmez; bekleyen giriş dosyaları diff'te varsa tren kalkmaz; canlı migration CLAUDE.md §5 kontrol listesi, riskli olanı Mert'in bu thread'de yazdığı "evet"iyle; her inen tren sonrası main sha koordinatöre; Mert'in klasörü yalnız temizse ff-only ilerletilir.
Yasak: force push, git stash/reset --hard/checkout -- ., toplu clean, başkasının worktree'si, isimle süreç öldürme.
```
4. Bilgisayardaki eski hafıza (`C:\Users\TheWe\.claude\projects\C--Users-TheWe-Documents-Codex-newfork-clean\memory\`) aynı Windows kullanıcısında olduğu için yeni oturum onu da görür.

## Adım 7. Açık thread'leri yeniden başlat

Her thread'in raporunun sonunda hazır brief var. Koordinatör işçi sınırına (aynı anda 1 kod yazan thread) uyarak açar; tasarım ve salt okuma thread'leri sınıra sayılmaz. Önerilen sıra:

| Sıra | Thread | Rapor (brief en sonda) | Neden bu sırada |
|---|---|---|---|
| 1 | Proje dosyalarını geri kur | adım 4 | Her şey buna bağlı |
| 2 | PC tren thread'i | adım 6 | Main'e giriş tek yol |
| 3 | PAGES yeniden kurulum (Üst çubuk 3.x + Erişim yok yenilemesi birlikte) | `threadler/ust-cubuk.md` §10, `threadler/erisim-yok.md` §9 | Mert'in test haritası; Mert'in karar 1'ine göre |
| 4 | /oto görsel kararlar sayfası | `threadler/oto.md` §6 | Mert'in bütün görsel kararları burada |
| 5 | Vardiya kartı (turuncu nokta) | `threadler/vardiya-karti.md` §10 | Kod hazır, tek karar |
| 6 | Jobs çekmece rengi | `threadler/jobs.md` §9 | Tek karar sonra küçük kod |
| 7 | Lineup | `threadler/lineup.md` §10 | Tasarım sürüyor |
| 8 | Job ikonları | `threadler/job-ikonlari.md` §8 | Galeri yayını + keep/sil |
| 9 | Availability yeniden kurgu | `threadler/availability-redesign.md` §10 | "Kodla" bekliyor |
| 10 | Takas | `threadler/takas.md` §9 | "Kodla" bekliyor |
| 11 | Atanmamış lokasyon hücresi | `threadler/izinli-gunde-add-shift.md` | Seçim bekliyor |
| 12 | Birincil lokasyon zorunlu / Exclude from schedule | `threadler/eski-atlas.md` §7 | İki kart cevabı sonra |
| 13 | MVP planı | `threadler/mvp.md` §7 | 8 karar |
| 14 | Dalda bekleyenler 2. aşama | `threadler/sayfa-denetimi.md` §9 | Mert "başla" deyince |
| — | Employees yorumları, Availability üst bölümü, Org seçici | — | Bitti; yalnız yeni istek gelirse |

Brief'lerde geçen `/mnt/project-files/...` yolları adım 4'ten sonra yeni projede aynen çalışır.

Her brief'e eklenecek iki satır:
- "Eski hesaptaki thread kimlikleri ve Artifact linkleri yeni hesapta açılmaz; gerekirse kaynaktan yeniden yayınla."
- "Kayıt düzeltmeleri (KARARLAR) için HANDOFF.md bölüm 3.5 ve 3.11'e bak."

## Adım 8. Tren akışı ve güvenlik kuralları (özet; asıl kaynak CLAUDE.md)

1. İş → bulut thread'i kendi `claude/...` dalında, güncel `origin/main`'den → TDD, küçük commit → lint, typecheck, ilgili vitest → nf-guvenlik ONAY → push → koordinatöre `dal@sha` ve cherry-pick listesi.
2. Koordinatör tren isteğini PC thread'ine iletir (bulut thread'i PC'ye doğrudan yazamaz).
3. PC thread'i: `main-watch` → ilgili e2e yerelde (`node ../scripts/lock.mjs run db --e2e -- "npx playwright test flows/<spec>"`) → `node scripts/train.mjs run <dal@sha…>` → CI yeşilse main ileri sarılır → main sha koordinatöre.
4. Canlı migration: yedek (`newfork-wt\coord\artifacts\canli-<migration>\`) → Supabase MCP `apply_migration` → md5 kontrolü → ledger sürümü dosya adına eşlenir → `get_advisors`. Riskli olan (silen, yetki, RLS, var olan fonksiyon gövdesi, katılım, sahiplik, veri silme, parola) Mert'in PC thread'inde kendi yazdığı "evet"le. `supabase db push` yasak.
5. Hiçbir zaman: main'e doğrudan push, PR açma/birleştirme, force push, dal silme (Mert açıkça söylemedikçe), Artifact silme (Mert istemedikçe), canlı veri silme (Mert'in "evet"i olmadan).

## Adım 9. Dosyalar repoda nerede

| Ne | Repo yolu |
|---|---|
| Kurallar | `CLAUDE.md`, klasör `CLAUDE.md`'leri, `.claude/agents/` |
| Karar defteri | `docs/plan/KARARLAR.md` (en yeni kayıtlar `coord/kayit2` dalında da) |
| Backlog | `docs/plan/BACKLOG.md` (en günceli `coord/kayit2`) |
| Açık sorular | `docs/plan/SORULAR.md` |
| Ekran planı | `docs/plan/EKRAN-PLANI.md`, `docs/plan/ekranlar/` |
| Eski devirler | `docs/plan/devir-2026-10-08/` |
| Bu devir | `docs/plan/devir-2026-10-14/` (dal `claude/hesap-devri-bqus46`; job ikonları `claude/project-thread-5du9p3`; atanmamış lokasyon `claude/time-off-mark-all-locations-cg3rn2`) |
| Tren ve kilit betikleri | `scripts/train.mjs`, `scripts/lock.mjs`, `scripts/main-watch.mjs`, `scripts/wt-hazirla.mjs` |
| Karantina | `e2e/karantina.txt` (boş) |

Proje dosyalarının (repo dışı) haritası: `ENVANTER-PROJE-DOSYALARI.md`.

---

## Ek A. Gizli değer taraması

Yöntem: kopyalanan her metin ve html dosyasında şu kalıplar arandı: JWT (`eyJ…​.…`), `access_token`/`refresh_token`, `service_role`, `sb_secret_`, `sk_live`/`sk_test`, `sk-ant-`, `ghp_`/`github_pat_`, `-----BEGIN … PRIVATE KEY-----`, `password=`/`PGPASSWORD=` değerleri, AWS anahtar kalıbı. Bulunanlar ve yapılanlar bu dosyanın sonundaki "Tarama sonucu" bölümünde.

### Tarama sonucu (14 Ekim, son tarama: 0 bulgu)

| Bulunan | Nerede | Yapılan |
|---|---|---|
| 8 süresi dolmuş JWT + 4 yenileme anahtarı | `pages/orijinal/today/index.html` (ve /oto eki) | `REDACTED` |
| Yerel test imza anahtarı ve şifresi | `pages/orijinal/kaynak/` (gateway.mjs, keys.mjs, record.mjs, postgrest.conf) | `[GIZLI-CIKARILDI]` |
| Yerel test dünyasının demo parolası | 40 dosya (screens.py/json, 10-giris-hesap.py, world.sql, derlenmiş app*.html) | `[GIZLI-CIKARILDI]`; PAGES'i derleyen thread yeni yerel demo parolası seçer |
| Bulut test veritabanı şifresi | koordinatör hafızası kopyası | `[GİZLİ-ÇIKARILDI]` |
| Audience deneme sayfası demo şifresi | `pages/gorsel-kararlar/gelen/announcements-audience/` | `DEMO-SIFRE-CIKARILDI` |
| `.env` dosyaları (20) | çeşitli | yalnız demo değer; GitHub'da `env.demo.txt` adıyla |
| `*.session.json` | — | kopyalanmadı |

Bu dosyadaki kalıp listesi (yukarıdaki "Yöntem" satırı) taramada kendini bulur; gizli değer değildir.

