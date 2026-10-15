# Yeni hesapta nasıl devam edilir (NASIL-DEVAM)

Tarih: 14 Ekim 2026, 15 Ekim'de Projects'siz düzene göre yeniden yazıldı. Önce `HANDOFF.md`'yi oku; bu dosya kurulum adımlarıdır.
Kısaltma yok: her yol tam yol. Saatler California saati.

## 0. Yeni çalışma düzeni (yeni hesapta Projects yok)

Eski hesapta iş Claude Projects'te yürüyordu: proje sohbetinde bir koordinatör, her işe ayrı bir bulut thread'i, Mert'in bilgisayarında bir Remote Control tren thread'i, karar kartları ve paylaşılan `/mnt/project-files` klasörü. Yeni hesapta bunların hiçbiri yok. Yerine:

- **Ana oturum:** yeni hesapla Claude masaüstü uygulaması → **Code** sekmesi → klasör `C:\Users\TheWe\Documents\Codex\newfork-clean`. Bu tek oturum eski koordinatörün ve eski PC tren thread'inin işini birlikte yapar: Mert'le konuşur, işi daraltır, kodu yazdırır, nf-guvenlik incelemesini alır, treni koşar, canlı migration'ı uygular, `DURUM.md`'yi yazar.
  - Ana klasörde (main) iş yapmaz, dal değiştirmez (CLAUDE.md §3.B). Kod işi kendi worktree'sinde ve `task/<iş>` dalında yapılır: ya `nf-isci` alt ajanıyla (`Agent(subagent_type: "nf-isci", isolation: "worktree")`, ilk komutu `node scripts/wt-hazirla.mjs <İŞ>`), ya da ana oturumun kendi açtığı worktree'de (`C:\Users\TheWe\Documents\Codex\newfork-wt\<iş>`).
  - Tren eskisi gibi `node scripts/train.mjs run <dal@sha…>` (tren klasörü `C:\Users\TheWe\Documents\Codex\newfork-wt\train`).
- **Ek oturum (isteğe bağlı):** uzun bir tasarım ya da araştırma işi ana oturumu doldurmasın diye Code sekmesinde ayrı bir oturum açılabilir (worktree seçeneği açık). Aynı anda tek kod yazan oturum kuralı sürer (işçi sınırı 1). Ek oturum sonucunu bir dosyaya yazar ve yolunu Mert'e söyler; ana oturum o dosyayı okur (CLAUDE.md §5 "Mert'in açtığı başka oturum").
- **claude.ai/code (bulut):** yalnız yedek. Bilgisayardaki proje dosyalarını, yerel veritabanını ve treni göremez; yalnız repoyu görür.

### Proje dosyaları artık bilgisayarda

Eski projenin paylaşılan klasörü `/mnt/project-files` geri kurulmaz. Onun tam kopyası (15 Ekim değişiklikleri dahil, gizli değerler çıkarılmış) şu klasörde ve yeni hesapta **canlı çalışma klasörü** odur:

`C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\proje-dosyalari\`

Bu dosyada ve raporlarda bu klasöre kısaca **PD** denir. Eşleme:
- Raporlarda geçen `/mnt/project-files/X` = `PD\X` (eğik çizgiler ters). Örnek: `/mnt/project-files/pages/gorsel-kararlar/gelen/lineup-satir/index.html` = `C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\proje-dosyalari\pages\gorsel-kararlar\gelen\lineup-satir\index.html`.
- GitHub'daki yalnız-metin kopyası: `docs/plan/devir-2026-10-14/hesap-devri/proje-dosyalari/X` (dal `claude/hesap-devri-bqus46`).
- `...\hesap-devri-2026-10-14\arsiv\` dokunulmaz yedektir (tar.xz parçaları ve sha listeleri); üzerinde çalışılmaz.

Ana oturum PD'yi görebilsin diye oturumun ilk işi: `/add-dir C:\Users\TheWe\Documents\Codex\newfork-pages` (adım 4'teki mesajda var).

### Sözlük: eski raporlardaki Projects kelimeleri

| Eski raporda | Yeni hesapta |
|---|---|
| koordinatör, proje sohbeti | ana oturum ve onun sohbeti |
| thread (bulut thread'i), "yeni hesapta thread aç" | ana oturumun yaptığı iş; uzunsa ek oturum ya da `nf-isci` alt ajanı |
| PC tren thread'i, Remote Control thread'i, "Bilgisayarındaki Claude 2 (tren)" | ana oturum (aynı bilgisayarda koşar) |
| brief, "brief taslağı" | ana oturuma (ya da ek oturuma) yapıştırılacak ilk mesaj |
| karar kartı | numaralı seçenekli soru (Claude Code'un soru kutusu varsa o); önerilen ilk, son seçenek "Yazarak cevap vereceğim" |
| `send_message`, `message_thread`, `reply`, `update_status`, "koordinatöre bildir" | yok; sonuç doğrudan Mert'e, kısa |
| `/mnt/project-files/X` | `PD\X` (yukarıdaki eşleme) |
| `device_stage_files`, `device_commit_files`, "bağlı klasör" | yok; ana oturum dosyaya doğrudan yazar |
| 5 dakikalık thread raporu, thread sayıları takibi | yok (tek oturum) |
| eski `cmsg_…`, `cse_…` kimlikleri, eski Artifact linkleri | yalnız tarihçe; yeni hesapta açılmaz |

---

## Adım 1. Eski hesapta son işler (Mert, 2 dakika)

1. Eski hesapta proje sohbetine "raporu durdur" yaz. Koordinatörün 5 dakikalık rapor zinciri durur.
2. Eski hesapta PC tren thread'inin ("Bilgisayarındaki Claude 2 (tren)") boşta olduğunu gör: koşan tren yok, `db` kilidi boş. Bitmeden yeni hesapta tren koşturma (adım 7), çünkü aynı bilgisayarda iki tren aynı test makinesini kullanamaz.
3. Eski hesabı kapatma, silme. Eski Artifact linkleri orada çalışmaya devam eder; yeni hesap gerekirse onlara bakmak için Mert'e sorar.

## Adım 2. Yeni hesapla Claude Code'u aç (Mert)

1. Claude masaüstü uygulamasında eski hesaptan çık, yeni hesapla gir.
2. **Code** sekmesi → klasör `C:\Users\TheWe\Documents\Codex\newfork-clean`. Worktree seçeneği **kapalı** (ana oturum ana klasörden çalışır, işi worktree'lerde yapar, ana klasörde dal değiştirmez).
3. GitHub: `gh` bu bilgisayarda zaten oturum açmış; yeni hesap ayrıca bir şey istemez. claude.ai/code (yedek) kullanılacaksa GitHub bağlantısı: https://claude.ai/connect-github.
4. Supabase (canlı migration için şart): ana oturumdan "Supabase MCP bağlı mı" diye sor. Bağlı değilse oturum nasıl bağlanacağını adım adım söyler; bağlanmadan canlı veritabanı adımı yapılmaz.

## Adım 3. Mert'in kurallarını oturuma ver (CLAUDE.local.md)

Eski projedeki "Project instructions" kutusunun yerini, repo kökünde **commit edilmeyen** bir dosya alır: `C:\Users\TheWe\Documents\Codex\newfork-clean\CLAUDE.local.md`. Claude Code bu dosyayı CLAUDE.md'nin yanında her oturumda kendiliğinden okur. Ana oturum adım 4'teki mesajla bu dosyayı aşağıdaki metinle kendisi yazar ve `.git\info\exclude`'a ekler (Mert bir şey yapmaz).

Not: worktree'de açılan ek oturum bu dosyayı görmez; ek oturumun ilk mesajına "önce `C:\Users\TheWe\Documents\Codex\newfork-clean\CLAUDE.local.md`'yi oku" satırı eklenir.

### CLAUDE.local.md metni (eski proje talimatının Projects'siz hâli)
```
Depodaki CLAUDE.md kurallarına her zaman uy. Bu dosya ile CLAUDE.md çelişirse CLAUDE.md geçerlidir.
Mert ile Türkçe yaz.
Proje dosyaları (eski /mnt/project-files) bu bilgisayarda: C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\proje-dosyalari\ (kısaca PD). Raporlardaki /mnt/project-files/X = PD\X. Mert'in çalışma kuralları tam metin: PD\MERT-KURALLARI.md. Devir paketi: PD\devir\ (HANDOFF.md, NASIL-DEVAM.md). Yeni hesapta Projects yok: koordinatör ve thread yok, bu oturum hepsini yapar (NASIL-DEVAM.md bölüm 0).

1. Mert'e iş yükleme: ilerleme, engel, izin takılması, temizlik, "istersen şunu çalıştır" türü şeyleri kendin çöz. Mert'e yalnız iş bittiğinde kısa sonuç, ya da yalnız onun verebileceği ürün kararı / canlıyı etkileyen geri alınamaz adım için tek soru.
2. Git: Mert git yönetmiyor. Commit, push, worktree, dal işlerini CLAUDE.md akışıyla kendin yap; Mert'e git sorusu ya da komutu sorulmaz. Main'e her şey trenle girer, PR açılmaz, "PR oluşturayım mı" sorulmaz.
3. Referanslar: kısaltma yok. Dosya yolu her zaman tam Windows yolu (örnek: C:\Users\TheWe\Documents\Codex\newfork-clean\docs\plan\KARARLAR.md, satır 94). Uygulamanın bir parçasından bahsederken tam yer ver: hangi ekran, hangi bölüm, hangi düğme/çekmece, hangi rol. 5N1K'ya (ne, nerede, ne zaman, nasıl, neden, kim) olabildiğince cevap ver.
4. Değişiklik anlatımı: ne değişti, önce/sonra, sözlü olarak. Görsel bir değişiklik varsa görsel olarak göster (Artifact yayını varsa Artifact, yoksa tarayıcıda açılan HTML dosyası).
5. Görsel sunum: gösterilen sayfa uygulamadaki güncel hâliyle birebir görünsün ve çalışsın: bütün elementler, düğmeler, çekmeceler, efektler, fonksiyonlar gerçek uygulamadaki gibi. Hem görsel sunum hem deneme ortamı olsun. Planlanan bir UI değişikliği varsa mutlaka varyantlar sunulsun; Mert UI kararlarını görerek ve deneyerek verir. Varyantlar en iyisini hedefler (akış, mimari, işleyiş, UI, UX için en iyi uygulama, en profesyonel ve en çok kabul görmüş tasarım); bugünkü ürün doğru kabul edilip üzerine yama yapılmaz; yalnız font ve renkler tasarım dilimize uyar (Mert, 15 Ekim).
6. Komutlar: Mert'e çalıştırması için komut verilecekse Windows'ta Cmd komutu olarak verilir. Önce gerçekten Mert'in eli gerekip gerekmediğini değerlendir; kendin çalıştırabileceğin komutu verme.
7. Bekleme: CI, test ya da başka bir süreç beklerken turu kapatma; izlemeye devam et. Tur yalnız iş bittiğinde, Mert'ten karar beklendiğinde ya da gerçek engelde biter; nedenini tek satırla yaz.
8. Çoktan seçmeli sorular (Mert 2026-10-10): Mert'e sorulan her çoktan seçmeli sorunun son seçeneği "Yazarak cevap vereceğim" olsun. Önerilen seçenek ilk sırada. Sorular detaylı anlatılsın.
9. Detaylı anlatım (Mert 2026-10-10): Mert "detaylı anlat", "örneklendir", "betimle", "anlamadım" gibi bir şey sorduğunda cevap yeniden yazılır ve şu maddelerden uygun olanların hepsini içerir: 5N1K'ya uygun cevap, önce/sonra, bugünkü hâl ve plan/taslak karşılaştırması, mümkünse ekran görüntüsü ya da görsel anlatım.
10. Saat (Mert 2026-10-10): Mert'e yazılan her saat onun saatiyle (California, Pacific; Ekim'de UTC−7). UTC saati Mert'e yazılmaz. Dosya adları da dahil.
11. (Boş: eski "Ekran belgeleri, PAGES" kuralı Mert'in 2026-10-15 kararıyla kaldırıldı. Ekran ekran Artifact belgesi tutulmaz, eski PAGES sayfaları yeniden kurulmaz.)
12. Görsel kararlar tek sayfada (Mert 2026-10-11): görsel karar bekleyen her şey "Bekleyen görsel kararlar" sayfasında, ekran ekran sekmelerde durur. Yeni çıkan görsel kararın varyant HTML'i PD\pages\gorsel-kararlar\gelen\<konu>\ altına yazılır ve sayfa güncellenir (kaynak ve yapım: PD\devir\threadler\oto.md).
13. Plan numaraları (Mert 2026-10-11): Mert'e "BL-1028", "S-14" gibi numaralarla referans verilmez. Önce maddenin ne olduğu sade sözlerle anlatılır; numara gerekiyorsa cümlenin sonunda parantez içinde.
14. (Boş: eski "thread sayıları takibi" kuralı Projects'e bağlıydı; yeni hesapta thread yok.)
15. Kapsam dışı bırakma (Mert 2026-10-14): bir özellik ürünün kalitesini, kullanım deneyimini ya da arayüzünü belirgin biçimde düşürüyorsa onu kapsam dışı bırakmayı önerebilirsin. Kendiliğinden atma: sade dille neden daha iyi olacağını, 5N1K ve "özellikle / özelliksiz" sonuçlarını göster, onay iste.
```
"Bekleyen görsel kararlar" sayfasının yeni linki adım 5'ten sonra 12. maddeye eklenir.

## Adım 4. Ana oturuma ilk mesaj

Adım 2'de açılan oturuma ilk mesaj olarak şunu yapıştır:

```
Bu proje eski Claude hesabımdan devredildi (14-15 Ekim 2026). Yeni hesapta Projects yok; koordinatörün, thread'lerin ve PC tren thread'inin işini sen yapacaksın.
1) /add-dir C:\Users\TheWe\Documents\Codex\newfork-pages komutunu çalıştır (ya da bana çalıştırt). Proje dosyaları (eski /mnt/project-files) orada: C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\proje-dosyalari\ (PD).
2) Oku: PD\devir\HANDOFF.md, PD\devir\NASIL-DEVAM.md (bölüm 0 sözlük dahil), PD\devir\GUVENLI-OLMAYANLAR.md. Aynı dosyalar GitHub'da claude/hesap-devri-bqus46 dalında docs/plan/devir-2026-10-14/hesap-devri/ altında; git show ile oku, checkout yapma.
3) NASIL-DEVAM.md adım 3'teki metinle C:\Users\TheWe\Documents\Codex\newfork-clean\CLAUDE.local.md dosyasını yaz ve .git\info\exclude'a ekle.
4) PD\devir\koordinator-hafiza\MEMORY.md ve yanındaki dosyalar eski koordinatörün hafızası. İçindeki kuralları ve açık işleri kendi hafızana al; Projects'e bağlı olanları (thread, karar kartı, 5 dakikalık rapor, message_thread) alma.
5) Bilgisayardaki eski PC tren thread'inin hafızası (C:\Users\TheWe\.claude\projects\C--Users-TheWe-Documents-Codex-newfork-clean\memory\) zaten sende; ikisi çelişirse bana sor.
6) Durum kontrolü: node scripts/main-watch.mjs --since 2f2f744c; node scripts/lock.mjs status; CI runner newfork-local-pc çevrimiçi mi; gh oturumu açık mı; Supabase MCP bağlı mı. Sonucu bana kısa yaz.
7) CLAUDE.md'de Projects'e bağlı kurallar var (§5 "İş Claude Projects'te yürür"). Taslağı HANDOFF.md §0'da yazılı daldaki commit'te; bana göster, ben "onaylıyorum" yazmadan uygulama.
8) Bekleyen kararlarım HANDOFF.md bölüm 2'de; bana tek tek, numaralı seçenekle, önerilen ilk ve son seçenek "Yazarak cevap vereceğim". PAGES (sayfa sayfa belgeleme) 15 Ekim'de emekli: hiçbir işe "PAGES'i güncelle" adımı eklenmez, eski PAGES sayfaları yeniden kurulmaz.
```

Eski koordinatör hafızasının özü (ana oturumun da tutması gerekenler):
- Mert'e her zaman Türkçe, saatler California (Ekim'de UTC−7). Plan numarası yalnız parantezde. Git komutu verilmez; adımlar numaralı ve tam yollu.
- Main'e yalnız tren; tren ana oturumda, Mert'in bilgisayarında koşar. Tek CI runner: paralel tren yok. Tren önce ilgili e2e'leri yerelde koşar.
- Dallara yalnız ileri push; force, mirror, prune yok. Her commit nf-guvenlik ONAY'ı ister.
- Canlı veritabanı yazmaları ve CLAUDE.md değişiklikleri Mert'in kendi yazdığı sözle (ana oturumda). Canlı veri test verisidir ama silme yine geri alınamaz sayılır.
- Yasaklar: "devir testi" oturumları (569-2577cf3c, 576-5f3f2c33) okunmaz; şifre değeri yazılmaz; `artifacts/note-mark-r3/.session.json` yedeklenmez; Artifact Mert istemeden silinmez.
- Silinmeyecek dallar: task/ekran-02-c2r, task/ekran-03-c1a, backup/task/bl-969, task/ekran-02-c2-css, task/arayuz-salt-hata, archive/*, task/avail-design, task/ekran-02-c3, task/bl-969-kurtarma, backup/tanitim-sitesi/*, keep/*, coord/kayit2, yedek/2026-10-14/*, claude/hesap-devri-bqus46, claude/project-thread-bb8xot; Jobs worktree keen-brahmagupta-8c4853.
- Bekletilenler: giriş ekranları (WorkspaceHubPage, WorkspaceStatusPage, ProtectedRoute) Mert "başla" diyene kadar; tasarım tuvali; giriş modeli kararı e-posta servisine kadar. Vercel yalnız main'den yayın.
- Otomasyon durdurulmuş (12 Ekim): kendiliğinden yeni iş ya da backlog maddesi açılmaz; Mert'in doğrudan istekleri yapılır.
- Mert'in kullanım uyarısı: kullanım yükselince "dur" yazacak; cevaplar kısa tutulur.
- Onay istemleri: Mert'in göremeyeceği bir yerde onay bekleyen adım bırakılmaz; onay gerekiyorsa önce Mert'e söylenir.
- PAGES (ekran ekran Artifact belgeleme) 15 Ekim'de emekli (Mert). `PD\PAGES\_kaynak` yalnız varyantlardaki "Original" görüntüsünü demo veriyle çekmek için bir araçtır; güncel tutulmaz, yayınlanmaz.
- Arayüz: kodlamadan önce Original + varyantlar; varyantlar en iyisini hedefler (yukarıdaki 5. kural); açılır pencereler düğmesine bağlı; seçim kartı yok.

## Adım 5. Görsel sayfaları yeniden yayınla

Eşleme: `PD\devir\artifactler\ARTIFACTLER.md`. Her satırda eski link, kaynak dosya, varsa indirilmiş kopya.
- Ana oturumda Artifact yayın aracı varsa sayfalar oradan yayınlanır (yeni hesapta da günde 200 yayın sınırı). Yoksa kaynak HTML dosyası tarayıcıda açılır; Mert dosyanın tam yolunu tıklar.
- Sıra:
  1. **Bekleyen görsel kararlar** (/oto): `PD\devir\threadler\oto.md` bölüm 6. Parça parça (64 MB sınırı).
  2. **Açık işlerin mockup'ları:** Lineup telefon ve masaüstü, Takas mockup'ı, Job ikon galerisi, Jobs çekmece renk varyantları, tek cümlelik uyarılar, atanmamış lokasyon hücresi, Availability tasarımları, liste seçim envanteri, kart işaret taslakları, kart kataloğu, Bildirim planı sitesi.
  3. **Bitmiş (✅ Done) ve tarihçe sayfaları:** yalnız Mert isterse. Eski PAGES sayfaları (tabloda "PAGES" satırları) yayınlanmaz.
- Her yeni link `C:\Users\TheWe\Documents\Codex\newfork-pages\README.md` satırına "yeni hesap" sütunu olarak eklenir (CLAUDE.md §7: iki hesabın linki).

## Adım 6. Açık işleri sırayla sürdür

Her raporun sonunda o işe devam etmek için hazır bir ilk mesaj ("brief taslağı") var. Ana oturum işçi sınırına (aynı anda tek kod yazan iş) uyarak sürdürür; tasarım ve okuma işleri sınıra sayılmaz. Uzun bir işi ek oturuma vermek istersen o ilk mesajı ek oturuma yapıştır ve başına "önce C:\Users\TheWe\Documents\Codex\newfork-clean\CLAUDE.local.md'yi ve PD\devir\NASIL-DEVAM.md bölüm 0'ı oku" satırını ekle. Raporlar `PD\devir\threadler\` altında.

| Sıra | İş | Rapor (ilk mesaj en sonda) | Neden bu sırada |
|---|---|---|---|
| 1 | Durum kontrolü ve kurallar | adım 4 | Her şey buna bağlı |
| 2 | /oto görsel kararlar sayfası | `oto.md` §6 | Mert'in bütün görsel kararları burada |
| 3 | Vardiya kartı (turuncu nokta) | `vardiya-karti.md` §10 | Kod hazır, tek karar |
| 4 | Bildirim sistemi | `bildirim-sistemi.md` ve `bildirim-sistemi-kaynak\YENI-HESAP-MESAJI.md` | Plan hazır, "Başla" bekliyor |
| 5 | Jobs çekmece rengi | `jobs.md` §9 | Tek karar sonra küçük kod |
| 6 | Lineup | `lineup.md` §10 | Tasarım sürüyor |
| 7 | Job ikonları | `job-ikonlari.md` §8 | Galeri yayını + keep/sil |
| 8 | Availability yeniden kurgu | `availability-redesign.md` §10 | "Kodla" bekliyor |
| 9 | Takas | `takas.md` §9 | "Kodla" bekliyor |
| 10 | Atanmamış lokasyon hücresi | `izinli-gunde-add-shift.md` | Seçim bekliyor |
| 11 | Birincil lokasyon zorunlu / Exclude from schedule | `eski-atlas.md` §7 | İki soru cevabı sonra |
| 12 | MVP planı | `mvp.md` §7 | 8 karar |
| 13 | Dalda bekleyenler 2. aşama | `sayfa-denetimi.md` §9 | Mert "başla" deyince |
| — | Employees yorumları, Availability üst bölümü, Org seçici | — | Bitti; yalnız yeni istek gelirse |

Raporlardaki Projects kelimeleri bölüm 0'daki sözlükle okunur. Her işe iki not:
- "Eski hesaptaki thread kimlikleri ve Artifact linkleri yeni hesapta açılmaz; gerekirse kaynaktan yeniden yayınla."
- "Kayıt düzeltmeleri (KARARLAR) için HANDOFF.md bölüm 3.5 ve 3.11'e bak."

## Adım 7. Tren akışı ve güvenlik kuralları (özet; asıl kaynak CLAUDE.md)

1. İş → kendi worktree'si ve `task/<iş>` dalı, güncel `origin/main`'den → TDD, küçük commit → lint, typecheck, ilgili vitest → nf-guvenlik ONAY → push → `dal@sha`.
2. Ana oturum: `main-watch` → ilgili e2e yerelde (`node scripts/lock.mjs run db --e2e -- "npx playwright test flows/<spec>"`) → `node scripts/train.mjs run <dal@sha…>` → CI yeşilse main ileri sarılır → `DURUM.md`'ye main sha.
3. Kayıt dosyaları (KARARLAR, BACKLOG, SORULAR): tren guard'ı iş dalında `docs/plan/KARARLAR.md`'yi reddeder ("kayıtları yalnız koordinatör yazar"); kayıt kısmı `coord/kayit2` dalından ayrı trene biner. Yalnız belge değiştiren tren CI'ı atlar.
4. Canlı migration: yedek (`C:\Users\TheWe\Documents\Codex\newfork-wt\coord\artifacts\canli-<migration>\`) → Supabase MCP `apply_migration` → md5 kontrolü → ledger sürümü dosya adına eşlenir → `get_advisors`. Riskli olan (silen, yetki, RLS, var olan fonksiyon gövdesi, katılım, sahiplik, veri silme, parola) Mert'in ana oturumda kendi yazdığı "evet"le. `supabase db push` yasak.
5. Hiçbir zaman: main'e doğrudan push, PR açma/birleştirme, force push, dal silme (Mert açıkça söylemedikçe), Artifact silme (Mert istemedikçe), canlı veri silme (Mert'in "evet"i olmadan).

## Adım 8. Dosyalar repoda nerede

| Ne | Repo yolu |
|---|---|
| Kurallar | `CLAUDE.md`, klasör `CLAUDE.md`'leri, `.claude/agents/`, `.claude/skills/` |
| Karar defteri | `docs/plan/KARARLAR.md` (en yeni kayıtlar `coord/kayit2` dalında da) |
| Backlog | `docs/plan/BACKLOG.md` (en günceli `coord/kayit2`) |
| Açık sorular | `docs/plan/SORULAR.md` |
| Ekran planı | `docs/plan/EKRAN-PLANI.md`, `docs/plan/ekranlar/` |
| Eski devirler | `docs/plan/devir-2026-10-08/` |
| Bu devir | `docs/plan/devir-2026-10-14/` (dal `claude/hesap-devri-bqus46`; Bildirim paketi `claude/project-thread-bb8xot`; job ikonları `claude/project-thread-5du9p3`; atanmamış lokasyon `claude/time-off-mark-all-locations-cg3rn2`) |
| Tren ve kilit betikleri | `scripts/train.mjs`, `scripts/lock.mjs`, `scripts/main-watch.mjs`, `scripts/wt-hazirla.mjs` |
| Karantina | `e2e/karantina.txt` (boş) |

Proje dosyalarının (repo dışı) haritası: `PD\devir\ENVANTER-PROJE-DOSYALARI.md`.

---

## Ek A. Gizli değer taraması

Yöntem: kopyalanan her metin ve html dosyasında şu kalıplar arandı: JWT (`eyJ…​.…`), `access_token`/`refresh_token`, `service_role`, `sb_secret_`, `sk_live`/`sk_test`, `sk-ant-`, `ghp_`/`github_pat_`, `-----BEGIN … PRIVATE KEY-----`, `password=`/`PGPASSWORD=` değerleri, AWS anahtar kalıbı. Bulunanlar ve yapılanlar bu dosyanın sonundaki "Tarama sonucu" bölümünde.

### Tarama sonucu (14 Ekim, son tarama: 0 bulgu; 15 Ekim eklemeleri de tarandı)

| Bulunan | Nerede | Yapılan |
|---|---|---|
| 8 süresi dolmuş JWT + 4 yenileme anahtarı | `pages/orijinal/today/index.html` (ve /oto eki) | `REDACTED` |
| Yerel test imza anahtarı ve şifresi | `pages/orijinal/kaynak/` (gateway.mjs, keys.mjs, record.mjs, postgrest.conf) | `[GIZLI-CIKARILDI]` |
| Yerel test dünyasının demo parolası | 40 dosya (screens.py/json, 10-giris-hesap.py, world.sql, derlenmiş app*.html) | `[GIZLI-CIKARILDI]`; demo uygulama aracını kullanan iş yeni yerel demo parolası seçer |
| Bulut test veritabanı şifresi | koordinatör hafızası kopyası | `[GİZLİ-ÇIKARILDI]` |
| Audience deneme sayfası demo şifresi | `pages/gorsel-kararlar/gelen/announcements-audience/` | `DEMO-SIFRE-CIKARILDI` |
| `.env` dosyaları (20) | çeşitli | yalnız demo değer; GitHub'da `env.demo.txt` adıyla |
| `*.session.json` | — | kopyalanmadı |

Bu dosyadaki kalıp listesi (yukarıdaki "Yöntem" satırı) taramada kendini bulur; gizli değer değildir.
