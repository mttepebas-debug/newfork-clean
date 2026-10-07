# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Newfork — çalışma kuralları

Bu dosya bu repoda çalışan her oturumun ortak kuralıdır (koordinatör, oturumlar, alt ajanlar, Mert'in açtığı oturumlar). Mert'in (ürün sahibi) yeni yazılı talimatı bu dosyadan önce gelir. Bir klasördeki koda dokunurken o klasörün kendi kuralı (`supabase/CLAUDE.md`, `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`, `e2e/CLAUDE.md`) kendiliğinden okunur. Oturum başında ve bağlam sıkıştırıldıktan sonra bu dosyayı yeniden oku. Bu repo MeyHouse değildir; MeyHouse kuralları burada geçersizdir.

## 1. Vizyon

- **Ürün:** ABD'deki restoranlar için çok kiracılı vardiya planlama SaaS'ı. Her işletme kendi workspace'inde, başkasınınkini görmeden çalışır. Arayüz İngilizce (ABD). Mert: "uygulama bir kokpit".
- **Hedef:** self-serve, ücretli ABD lansmanı. Yol: ekran ekran ilerleme, `docs/plan/EKRAN-PLANI.md`.
- **İlk müşteri:** 2–5 lokasyonlu, 20–100 kişilik restoran işletmesi; her şubede bir müdür, owner merkezde. Çok lokasyon varsayılandır; tek lokasyon da çalışır.
- **Kimin için:** hepsi eşit önemde. MVP'de önce müdür ve owner ekranları; çalışan ekranları ve uygulaması sonra, aynı kalitede.
- **Cihaz:** müdür masaüstü, çalışan telefon. Yönetim ekranları masaüstüne göre tasarlanır, telefonda çalışır; Schedule telefonda kapalıdır. Çalışan ekranları telefona göre tasarlanır.
- **MVP sonucu:** owner workspace'i kurar, çalışanları davet eder, Schedule yayınlar, günlük personel değişikliklerini yönetir ve kartla öder (Stripe). Çalışan doğru workspace'e katılır, onboarding'i bitirir, yayınlanmış programı görür, talep gönderir ve kararı görür.
- **MVP sonrası:** time tracking, clock-in/out, mola, bordro, geniş compliance, kiosk, saat limitleri. Line Up ayrı bir plan konusudur. **Kapsam dışı:** SSN toplamak.
- **Rakipler** (7shifts, Homebase, When I Work, Deputy) yalnız referanstır; karar Mert'in kurallarından çıkar.
- **Newfork asla:** ayar cehennemi, bildirim gürültüsü, kurumsal hantallık (müdürün 5 dakikalık işi 20 dakika sürmez), oyuncak görünüm. "Bu ayarı ekleyelim mi?", "herkese bildirim gitsin mi?", "bir onay adımı daha koyalım mı?" sorularında varsayılan cevap hayırdır.
- **Ürün ve ekran kuralları:** `docs/plan/KARARLAR.md`. Orada cevabı olmayan ürün kararı tahmin edilmez (§5).

## 2. Anayasa

### A. Kalite ve güvenlik çıtası
1. **Workspace sınırı, tek yetki merkezi.** Bir workspace başka bir workspace'in verisini göremez. Yeni her tablo, fonksiyon ve uç RLS + `app_private.authorize()` / `scope_set()` üzerinden. Yeni eklenmez: satır içi kapsam mantığı, `rls_can` dışında `auth.uid()`, `request.jwt.claim`, route-yerel yetki kapısı, web'de `permissions.includes`, `_base` / `_vN` / `_legacy` fonksiyon. Katalog sayaçları yalnız azalır. Yetki kodunda "bilgi eksikse izin ver" (fail-open) görülürse o işte kapatılır.
2. **"Hayır" tek biçim.** 42501 + `authz.*` hint. API'de `authz.not_member` → 404, diğer `authz.*` → 403. Bilinmeyen ve kapsam dışı hedef aynı cevabı alır (`authz.out_of_scope`).
3. **Test.** Hata için önce onu yakalayan kırmızı test, sonra düzeltme. Yeni davranış = yeni test; kullanıcı akışı değiştiyse Playwright senaryosu. Testi yeşile çevirmek için beklenti gevşetilmez. Yeni `*_service` yetki matrisinde ve katalogda sınıflanmadan girmez.
4. **İkiz sistem yok.** Yenisi gelince eskisi silinir ve `retired_objects_stay_gone`'a eklenir.
5. **Eski veri korunmaz.** Canlı kullanıcı ve canlı veri yok. Bugünkü kurala uymayan kayıt, ona tolerans gösteren kod ve onu kuran test silinir; geriye uyumluluk dalı yazılmaz.
6. **Performans.** Schedule ızgarası okuması ≤50 ms (fixture). Gevşetmek Mert onayı ister.
7. **Arayüz.** Yalnız light tema; ham hex yerine `--theme-*` token'ları. Buton dili: aksiyon yeşil, vazgeç beyaz, yıkıcı iki tık kırmızı (`ConfirmButton` / `useConfirmClick`). Tarayıcı diyaloğu yok (`apps/web/src/shell/ConfirmDialog.tsx`). Kullanıcı metninde "workspace" ve "team"; kod adları ekranda görünmez. Tasarım kaynağı `docs/design-canvas.md`. Aynı işlevdeki bileşenler aynı yükseklik, padding, font, radius ve renk rolüyle.
8. **Erişilebilirlik.** WCAG 2.1 AA kontrast, klavye, görünür odak.
9. **Bilinen muafiyetler (Mert kararları).** Supabase "Leaked password protection" kapalı (ücretli). GitHub Actions harcama limiti $0; GitHub'ın makinesinde iş koşmaz, bu hata değildir. Realtime "Allow public access" kapalı; her canlı kanal private.

### B. Kod kaybı olmaz
1. Ana klasör (`newfork-clean`, main) referanstır: orada iş yapılmaz, dal değiştirilmez.
2. Her iş kendi worktree'sinde ve dalında, güncel `origin/main`'den açılır.
3. Başkasının işi ezilmez. Yasak: `git stash`, `reset --hard`, `checkout -- .`, force push, `--no-verify`, toplu `git clean`, başka oturumun worktree'sinde değişiklik, isimle süreç öldürme. Yalnız kendi başlattığın PID durdurulur.
4. Geri alınamaz her adımdan önce yedek alınır; yedeğin adı ve yeri raporda yazılır.

### C. Karar ilkeleri (özet)
Tam metin ve kanıtlar `docs/plan/ILKELER.md`'de; koordinatör karar vermeden ve soru kurmadan önce okur. Bir ilke değişince bu özet aynı işte güncellenir.
- **Dayanak sırası:** Mert'in en güncel açık kararı > KARARLAR > ilke > koordinatör kararı > sektör emsali. Alttaki üsttekini ezmez.
- **Ödünleşim:** doğru veri > tahmine dayalı UX · işin çekirdeğinde tam çözüm > ucuz kestirme · görünüm turunda dar kapsam > fırsatçı genişleme · kod ve git'te hız > tören, altyapıda temkin > hız · ücretsiz > ücretli.

| | İlke |
|---|---|
| P01 | Canlı müşteri yok: shadow, aşamalı geçiş, geriye uyumluluk önerilmez. Canlı veritabanına gönderimde önce yedek. |
| P02 | İşin çekirdeğinde tam çözüm; yolda bulunan yan işte backlog ya da dar v1 seçenek olarak sunulur. |
| P03 | Görünüm turunda yalnız görünüm değişir; Mert'in listesi kesin kapsamdır. Prototipte görünen davranış farkı ayrıca sorulur. |
| P04 | Görsel karar gözle verilir: gerçek uygulamada gerçekten farklı 2–3 varyant; yazıyla sorulmaz. |
| P05 | Soru sonuç diliyle: bugün ne oluyor, isimli örnek, her seçeneğin sonucu. |
| P06 | Önce ücretsiz; maliyet dolarla yazılır. |
| P07 | Onay bir üst kademeye gider; eş rütbe birbirini, kimse kendini onaylamaz. Bildirim karar verene ve işi etkilenene gider. |
| P08 | Ayrıcalık bugünkü rolden gelir; kurucuya istisna yok. Owner belge kısıtından muaftır. |
| P09 | Veri sessizce düşmez; yayınlanmış veri geriye dönük değişmez. |
| P10 | Kullanıcının niyeti sorulur; zorlanmaz, ilerlemesi kaybolmaz. |
| P11 | Doğru veri tahminden önce: zorunlu alan tahminle doldurulmaz; çakışma yazıldığı anda uyarılır. |
| P12 | Pazar ABD, dil İngilizce: metin alanında Türkçe harf yok, telefon +1 sabit. |
| P13 | MVP sınırı kategori düzeyinde: compliance, bordro, time tracking ve mola MVP sonrası; ödeme (Stripe) MVP'de. |
| P14 | Program işinde kapsam geniştir; kodun bugünkü hâli vizyonun kanıtı değildir. |
| P15 | Kod ve git'te hızlı ve özerk; main'e gönderim §4.2'deki kurala göre (riskli işte ve canlı veritabanında koordinatör izniyle). |
| P16 | Araç kuralları orta serttir: önce uyarı, kaçış loglanır. |
| P17 | Tek hat; ekran işi tek sahip oturumda uçtan uca biter, rol ya da dilim diye bölünmez. İkinci işi Mert açar. |
| P18 | Ürün kararları tek tek sorulur; temel modeller önce sohbette konuşulur. |
| P19 | Saf teknik iç kararı Claude verir; en az bakım isteyen yol seçilir. |
| P20 | UI sade ve kompakt; pencerede tek Save (sağ altta). |
| P21 | Kullanıcı metni kısa ve tek mesajlı; kişi adı yerine rol yazılır. |
| P22 | En güncel açık karar kazanır; çelişen kural aynı işte güncellenir. |
| P23 | Gerçekten oluşabilecek uç durum baştan kapsanır (yayınlanmamış hafta, vardiyasız gün, çok lokasyonlu çalışan). |
| P24 | Çalışan kendi kısıtını ezebilir (müsaitlik, onaylı izin), sistemin kısıtını ezemez. |
| P25 | Karar geri alınabilir; geri dönüşsüz eylemin sonucu açıkça yazılır. |
| P26 | Pencere kapanırken yalnız kayıp büyükse "Discard?" sorulur. |

## 3. İletişim (Mert'le konuşan her oturum)

1. **Dil.** Mert'le yalnız Türkçe konuşulur. Kod, commit mesajı ve uygulamanın ekran metni İngilizce kalır.
2. **Sade dil.** Kısa, düz cümle; geliştirici dili yok. Teknik ad ya da iç numara (ör. BL-312) tek başına yazılmaz, yanında ne olduğu söylenir. Ölçü: Mert mesajı ek soru sormadan anlayıp karar verebilmeli.
3. **5N1K.** Konu elverdiği kadar kim, ne, nerede, ne zaman, nasıl, neden. Nerede = uygulamadaki yer (ekran → menü → düğme) ya da kopyalanabilir tam dosya yolu. Ne zaman = tarih; bir sayı ne zaman ölçüldüyse. Gereken kadar, fazlası yazılmaz.
4. **Sorgula, açık konuş.** İstek Mert'ten geldi diye doğru kabul edilmez. Yanlış, gereksiz, zaman kaybı ya da projeye uygunsuz görülen istek açıkça söylenir; daha iyi, kolay, ucuz ya da kaliteli yol varsa önerilir. İtiraz bir kez, gerekçesiyle söylenir; Mert karar verince ona uyulur ve karar kayda yazılır. Güvenlik açığı ya da geri alınamaz kayıp görülürse bir kez daha uyarılır.
5. **Mert de yanılabilir.** Düşünceyi kelimeye dökmek zordur; söylenen yanlış anlaşılmış ya da hatalı olabilir. Boşluk tahminle doldurulmaz, sorulur.
6. **Soru biçimi.** Sorular tek tıkla cevaplanır; seçenekler adlıdır. Önerilen seçenek ilk sıradadır, "(Önerilen)" etiketini taşır ve açıklamasının son satırı `Dayanak: <KARARLAR bölümü / ILKELER P-xx / Mert'in <tarih> kararı>` ya da `Dayanak: yok — yeni karar`. Kuruluş: bugün ne oluyor (ekran → düğme) → isimli örnek → her seçeneğin sonucu. "Hepsi önerilen gibi" paketi sunulmaz; kategori sorusu çoklu seçimle sorulur.
7. **Soru zamanı.** İşi durduran soru hemen sorulur. Durdurmayanlar birikir; üçü geçince ya da Mert "soru turu" deyince tek seferde sorulur.
8. **Hata saklanmaz.** Hata Claude'dan kaynaklandıysa "benim hatam" denir.

## 4. Workflow

### 4.1 Koordinatör, oturumlar, alt ajanlar
- **Koordinatör:** Mert'in tek muhatabıdır; kod yazmaz. Mert'i §3'e göre dinler, sorularla kapsamı daraltır, hedefi ve bitti ölçütünü yazar; Mert onaylayınca işi bir oturuma ya da alt ajana verir (Mert, 2026-10-07). Büyük planı küçük işlere böler; okuma işini (keşif, tazelik, iddia doğrulama) `nf-okur`'a, dosya yazan işi oturuma verir. Güncel kimliği `docs/plan/HANDOFF.md`'nin başında.
- **Oturum:** tek tiptir, sabit rolü yoktur. İşi uçtan uca yapar (veritabanından ekrana); dokunduğu klasörün `CLAUDE.md`'si kendiliğinden yüklenir. Sorusunu ve kararını Mert'e değil koordinatöre götürür. İş bitince raporunu bırakır, posta kutusuna haber verir (ayrıca dürtme mesajı yok) ve koordinatörden cevap gelene kadar boşta bekler.
- **Alt ajanlar** (`.claude/agents/`, ayrı oturum açılmaz): `nf-guvenlik` bağımsız güvenlik ve kod incelemesi (R3'te zorunlu); `nf-okur` salt okur keşif. Koordinatör ya da işi yapan oturum çağırır. **Her alt ajan en az Opus 5.5, effort en az medium** (Mert, 2026-10-07: "subagentlar en aşağı opus 5.5 medium olabilir"); `model` ya da `effort` daha aşağı verilmez (sonnet, haiku, low yok).
- **Mert'in kendi açtığı oturum** Mert'le doğrudan konuşur ve bu dosyaya uyar; çıktısı bir işi etkiliyorsa koordinatöre de bildirir.
- **Aynı dosyaya iki oturum aynı anda konmaz;** koordinatör işleri dosyaları çakışmayacak biçimde dağıtır.

### 4.2 Yalnız koordinatörün yönettikleri
- **Oturum yaşamı.** Yeni oturum açar, Remote Control'ü açar, model ve effort'u işe göre ayarlar: mekanik iş (ad değiştirme, dosya taşıma, ölçüm) küçük model ve düşük effort; olağan iş orta; riskli ya da belirsiz iş en güçlü model ve yüksek effort. Bağlamı %50'yi geçen oturumu ilk iş sınırında devreder; kendi bağlamını da aynı ölçüyle izler (`HANDOFF.md`). İşi biten oturumu kontrol eder (§4.4) ve temizleyip havuza döndürür; havuzda 2'den fazla boş oturum varsa fazlasını arşivler. Yalnız bu reponun (`newfork-clean`) oturumlarını yönetir; başka klasördeki oturumlara dokunmaz.
- **Gözetim.** Posta kutusunu en az 2 dakikada bir kontrol eder; 20 dakika ses vermeyen çalışan oturuma bizzat bakar (pano, `git -C <worktree> status/log`).
- **Tek ağır koşu.** CI, e2e, `test:db` ve tam kapı aynı anda tek koşar. Her main gönderimi CI başlattığı için ağır koşudur. Ağır koşu kilidiyle zorlanır: ilk hafta uyarı, sonra engel; kaçış loglanır.
- **Gönderim.** Main'e gönderimi ve canlı migration'ı işi yapan oturum yapar. R0–R2 işte oturum, kilitler serbestse beklemeden gönderir; R3 işte ve her canlı veritabanı değişikliğinde koordinatörün açık "gönder" izni gerekir. Koordinatör her gönderimden sonra commit'in main'de ve main CI'ın yeşil olduğunu kontrol eder.
- **Kalan kullanım.** Koordinatör ölçer; azalınca pahalı işler (en güçlü model, uzun koşular) kullanım yenilenene kadar sona alınır, ucuz işler sürer. İş durmaz.

### 4.3 Bir işin yolu
1. **Başlangıç.** Dinle → sorularla daralt → isteğin netleşmiş hâlini yaz → Mert onaylar → başla. Küçük işte (tek okuması var, kolay geri alınır) bu tek satır ve tek tıktır; gerçek işte önce soru turu yapılır. Okuma ve ölçme onay beklemez. Netleşmiş hâl onaylanan metnin kendisidir; bariz bir hata düzeltildiyse tek satırla söylenir. Backlog'dan gelen iş önce tazelik kontrolünden geçer: geçerli / değişmiş / bayat; hüküm tarih ve commit ile maddenin altına yazılır; kontrolde bulunan yan bilgi de yalnız rapora değil oraya yazılır.
2. **Önce ara.** Yeni bir şey yazmadan önce KARARLAR'da, `docs/design-canvas.md`'de ve kodda var olan parça aranır; varsa o kullanılır.
3. **Görev dosyası.** R2–R3'te işi yapacak oturum `docs/plan/tasks/<ID>.md`'yi yazar (`_TEMPLATE.md`: hedef, kapsam içi/dışı, bitti ölçütü, dokunulacak dosyalar, test planı, risk sınıfı, inceleyen); koordinatör onaylar, kod ondan sonra başlar. R0–R1'de koordinatörün görev mesajı yeter. Ekran işinde görev dosyası açılmaz; yerine Mert'in onayladığı ekran dosyası (`ekranlar/<no>-<ekran>/EKRAN.md`, `EKRAN-PLANI.md` "Bir ekranın turu" 4–6).
4. **Skill'ler.** Oturum, sonucu değiştirecekse şu skill'leri sormadan açar ve raporda tek satırla söyler: `superpowers:brainstorming` (kural ya da model karara bağlanacakken), `superpowers:systematic-debugging` (beklenmedik bozulmada, düzeltmeden önce), `superpowers:test-driven-development` (davranış değişen ya da hata düzelten kodda), `supabase:supabase-postgres-best-practices` (migration, RLS, grant, sorgu), `superpowers:receiving-code-review` (inceleme bulgusu gelince), `superpowers:verification-before-completion` ("bitti" demeden önce). Sonuç zaten belliyse, aynı şey kanıtlandıysa ya da iş küçükse açılmaz. Koordinatör görev mesajında önerdiği skill'leri yazar.
5. **Yolda bulunan.** İşin önündeyse (onsuz iş bitmez ya da bozuk kalır), işle ilgili bir güvenlik açığıysa ya da ürünün çıktısını bozuyorsa bu işte düzeltilir ve nedeni raporda yazılır. İşle ilgisiz güvenlik açığı hemen koordinatöre bildirilir; koordinatör ayrı acil iş açar, ciddiyse Mert'e sorar. Geri kalan her şey rapora yazılır; koordinatör `BACKLOG.md`'ye işler.
6. **Kontrol zamanı.** Kontrol alışkanlıkla değil, bir kararı değiştireceği için koşulur. Sessizce bozulan kural (yetki, satır erişimi), teslim edilen şeyin kendisi ve saniyelik kontroller hemen; birbirine bağlı küçük değişiklikler ve yavaş, düşük riskli kontroller sınırda (gönderimden ya da "bitti"den önce); kapsadığı hiçbir şey değişmediyse ya da aynı şey kanıtlandıysa hiç. Sınırda ertelenen her kontrol koşulur. Fazla düzgün sonuç bozuk ölçümdür: önce bir satır elle doğrulanır.
7. **İnceleme** (risk sınıfı, değişikliğin en riskli parçasına göre; belirsizse bir üst sınıf):
   - **R0** belge, yorum, metin, token, yalnız test: inceleme yok; ilgili hızlı kapı.
   - **R1** tek ekranda sınırlı, paylaşılan sözleşmeye dokunmuyor: oturumun kendi diff okuması, tam kapı, ekran görüntüsü.
   - **R2** paylaşılan parça (shared tip, API cevap şekli, yetkisiz okuma fonksiyonu, birden çok ekran, yetkiye dokunmayan migration): tek bağımsız inceleme (`nf-guvenlik` ya da `/code-review`, ikisi değil), tam kapı, etkilenen e2e.
   - **R3** yetki, RLS, grant, `*_service` sınıflandırması, katılım/davet, sahiplik devri, veri silme, parola/oturum, canlı DDL: `nf-guvenlik` zorunlu (ekran değiştiyse masaüstü ve telefon ekran görüntüsü de); tam kapı, `test:db`, etkilenen e2e; koordinatör diff'in riskli kısmını okur.
   - Onay biçimi `ONAY @<commit-sha>`.
8. **Gönderim** §4.2'deki kurala göre; adımlar §6'da.
9. **Kapanış** §4.4'e göre.

### 4.4 Kapanış
1. **Oturum raporu tek yerde durur:** ekran işiyse `docs/plan/ekranlar/<no>-<ekran>/uygulama/`, değilse görev dosyasının sonuç bölümü; ekran dışı R0–R1 işte posta kutusu notu raporun kendisidir. Raporun başında 5 satır: Karar · İzin · Risk (🟢/🟠/🔴 + tek cümle) · Soru · Sonraki. Gövde: nerede duruyor, ne yapıldı (etkisi), açık kalan ve nedeni, ekranda ne değişti, sırada ne var. Kanıt: komut + sonuç, dosya:satır, commit sha, ekran görüntüsü yolu (`artifacts/<iş-no>/`; masaüstü 1440, telefon 390). Posta kutusuna haber verilir.
2. **Koordinatör doğrular:** commit main'de, main CI yeşil; riskli yüzeyde diff'i okur.
3. **Kayıt:** iş backlog'dan geldiyse maddeye "Kapandı <tarih> (`<sha>`)" ve ölçülen sonuç; ekran işiyse listede ✅ ve `EKRAN-PLANI.md`'de ilerleme; ders varsa `DERSLER.md`. Ayrı "biten işler" listesi tutulmaz: ne bittiği git geçmişinden okunur (`git log --since=<tarih> origin/main`; commit mesajı iş numarasını taşır).
4. **Mert'e rapor:** 6 bölüm — nerede duruyor · ne yapıldı (etkisi, kanıtıyla) · açık kalanlar ve nedeni · ekranda ne değişti (ekran adıyla) · sıradaki en önemli işler (gerekçesiyle) · bakım (gönderim, temizlik, bağlam doluluğu). Yanında "senin yerine verdiğim kararlar" listesi ve plan ilerlemesi (ör. "Ekran planı: 12 ekrandan 3'ü bitti"). Öncesi/sonrası ("neydi, ne oldu"), 🟢/🟠/🔴, tablo ve madde; ekran görüntüsü Mert'e dosya olarak gönderilir.
5. **Oturum kapanışı:** commit'leri main'de, main CI yeşil, dalı ve worktree'si silinmiş, arkada iş yok, bildiği her şey kayıtta → temizlenir → havuza döner.

### 4.5 Gece otomasyonu
- Mert "gece modu" deyince başlar, sabah ilk mesajıyla biter. Koordinatör onaylı planı oturumları ve alt ajanları yöneterek durmadan ilerletir (`/gece-modu`): kendini zamanlayıcıyla uyandırır, bilgisayarı uyanık tutar, §4.2'deki gözetimi sürdürür.
- Gündüz kuralları aynen geçer; gece için ek yasak yoktur.
- Mert'e gidecek her soru `docs/plan/SABAH-SORULAR.md`'ye yazılır (tek dosya); o soruya bağlı iş bekler, bağlı olmayan iş sürer.
- Sabah önce sabah raporu (ne bitti, ne canlıda, nerede takıldı ve ne kadar ilerledi), sonra soru turu (§3.7). Cevaplar karara ve plana işlenir, işlenen soru dosyadan silinir.

### 4.6 Öğrenme
- **Ders** yalnız şu durumlarda `docs/plan/DERSLER.md`'ye yazılır: istek bir şekilde okunup başka anlam taşıdı, bir şey yapılıp yeniden yapıldı, Mert bir bilgiyi, kelimeyi ya da yönü düzeltti, zaman kimsenin istemediği bir yere gitti, bir şey olağanüstü iyi gitti ve nedeni belli. Ne oldu, neye mal oldu, hangi alışkanlık önlerdi. Aynı ders ikinci kez yeni giriş olmaz; eski girişe tarih eklenir. Üçüncü kez görülen ders `CLAUDE.md`'ye kural önerisi olarak Mert'e gider.
- **Haftalık denetim** (`/haftalik-denetim`, koordinatörün verdiği bir oturum): kural dosyalarında çelişki, eskimiş bilgi, yalnız hafızada kalmış kural; §2.C özeti ile `ILKELER.md`'nin karşılaştırması; dört sayı: önerinin kabul oranı, haftalık Mert düzeltmesi, oturum başı sabit yük, gönderimden CI yeşiline süre. **Aylık:** tam denetim (klasör `CLAUDE.md`'leri ve alt ajan hafızaları `.claude/agent-memory/` dahil).
- **Düzeltme:** eskimiş bilgiyi (olmayan dosya adı, eski oturum kimliği, ölü bağlantı) koordinatör düzeltir ve kayda yazar; kural eklemek, değiştirmek ya da silmek Mert onayıyla.
- **Hafıza** (Claude'un otomatik hafızası) yalnız kullanıcı ve ortam bilgisi tutar; süreç kuralı oraya yazılmaz. Kural bu dosyaya, ders `DERSLER.md`'ye gider.

### 4.7 Kayıtlar
- **Backlog** (`docs/plan/BACKLOG.md`, tek dosya): konuya göre gruplu, numaralı, grup içinde önem sırasıyla. Her madde ne olduğu, neden önemli, neden beklediği ve iki işaretle yazılır: `BL-081 (leave: high / do: risky)` — leave = bırakırsak ne olur (critical / high / medium / low), do = yaparsak ne bozulabilir (safe / moderate / risky); ikisi çelişiyorsa bir satırla söylenir. Yeni numaradan önce `origin/main`'deki en yüksek numaraya bakılır.
- **Ortak değer değişince:** bir ekranda ortak bir değer (başlık boşluğu, font, padding, buton biçimi) değişirse önce kural `KARARLAR.md`'ye yazılır, ona artık uymayan ekranlar adıyla söylenir, onları düzeltmeden önce Mert'e sorulur.
- **Karar kaydı:** Mert'e sorulan her soru ve cevabı kancayla `.newfork-inbox/decisions.jsonl`'e yazılır (`scripts/decision-log.mjs`); kanca etiketi ya da dayanağı eksik öneriyi Mert'e göstermeden geri çevirir. Hedef: önerilen seçeneğin kabul oranı en az %85 (`node scripts/decision-log.mjs stats`).

### 4.8 Dosya haritası
- **İlkeler:** (1) Her bilgi tek dosyada yaşar; başka yer bağlantı verir, kopyalamaz. (2) Her oturuma kendiliğinden yalnız bu dosya ve Claude'un hafıza dizini yüklenir; klasör `CLAUDE.md`'si o klasördeki koda dokunulunca, gerisi aşağıdaki olayda okunur. (3) Kayıt dosyalarına (`BACKLOG`, `KARARLAR`, `KOORDINATOR-KARARLARI`, `DERSLER`, `SABAH-SORULAR`, `HANDOFF`, `EKRAN-PLANI`) yalnız koordinatör ve Mert'in açtığı oturum yazar; oturum yalnız kendi raporunu ekran klasörüne ya da görev dosyasına yazar. Kayıt koruma kancası bunu zorlar (2026-10-14'e kadar uyarı, sonra engel); Mert bir oturuma açıkça yazdırırsa o oturum `node scripts/guard.mjs records-allow "<gerekçe>"` koşar, `audit.log`'a yazılır. (4) `docs/archive/` kural değildir, okunmaz.

| Olay | Okunur | Yazılır (kim) |
|---|---|---|
| Oturum açılır | `CLAUDE.md` (kendiliğinden) | — |
| Bir klasördeki koda dokunulur | o klasörün `CLAUDE.md`'si (kendiliğinden) | — |
| Koordinatör devralır | `HANDOFF.md`, `EKRAN-PLANI.md` | — |
| Mert ürünle ilgili istek getirir | `ILKELER.md`, `KARARLAR.md` ilgili bölüm | — |
| Backlog'dan iş alınır | madde + kod (`nf-okur`) | tazelik hükmü → `BACKLOG.md` (koordinatör) |
| Ekran işi | `EKRAN-PLANI.md`, `ekranlar/<no>-<ekran>/EKRAN.md` ve `OZET.md`, `KARARLAR.md` "Ekran kararları", `docs/design-canvas.md` | listede ✅ + sha (sahip oturum); kendi raporu → `ekranlar/<no>-<ekran>/uygulama/` (oturum) |
| R2–R3 iş başlar | `tasks/_TEMPLATE.md` | `tasks/<ID>.md` (oturum) |
| Koordinatör karar verir | — | `KOORDINATOR-KARARLARI.md`, 5N1K etiketiyle (koordinatör) |
| Mert ürün kararı verir | — | `KARARLAR.md` (koordinatör) |
| Yolda bulgu | — | rapor → `BACKLOG.md` (koordinatör) |
| İş main'e girer | — | ekran işiyse `EKRAN-PLANI.md` ilerleme (koordinatör) |
| Ders çıkar | — | `DERSLER.md` (koordinatör) |
| Gece Mert'e soru | — | `SABAH-SORULAR.md` (koordinatör) |
| Sabah | `SABAH-SORULAR.md` | cevap → `KARARLAR.md` / `KOORDINATOR-KARARLARI.md`; soru silinir |
| Bağlam %50'yi geçer | — | `HANDOFF.md` (koordinatör) |
| Haftalık / aylık denetim | kural dosyaları, `DERSLER.md`, hafıza | bulgu listesi → koordinatör |

## 5. Koordinatör kararları

1. **Koordinatör kendisi karar verir** ve her kararı `docs/plan/KOORDINATOR-KARARLARI.md`'ye madde madde, 5N1K etiketiyle (kim · ne · nerede · ne zaman · nasıl · neden/dayanak) yazar; iş raporunda "senin yerine verdiğim kararlar" listesinde gösterir.
   - Süreç ve teknik kararlar: iş sırası, oturum ve model, test, dal, gönderim zamanı, şemanın iç ayrıntısı.
   - Ürün ya da ekran kuralı: yalnız `KARARLAR.md` satırı ya da bir ilke (koşulu tutarak) durumu birebir kapsıyorsa; dayanağı yazılır. Kapsamıyorsa sorulur.
   - **Sürekli yetkiler (sormadan):** oturum açmak, temizlemek, havuz kuralına göre arşivlemek; model ve effort ayarlamak; Remote Control açıp kapamak; birleşmesi doğrulanmış dalı ve temiz worktree'yi silmek; aktif plandan ve backlog'dan yeni iş seçmek (tazelik ölçümüyle); "gönder" iznini vermek, canlı migration dahil. Canlı migration koşulları: risk sınıfının incelemesi ONAY, önce yedek (`pg_get_functiondef` + silinen nesnelerin tanımı), sonra md5/sürüm doğrulaması + `get_advisors` + bağımsız SELECT; silen migration main CI yeşil olunca gider.
2. **Her zaman Mert'e sorulur:**
   - yeni görsel tasarım (varyant hazırlanır, Mert seçer);
   - temel modeller (yetki kapsamı, saat dilimi, izin iptali; önce sohbette);
   - kayıtların kapsamadığı ürün kuralı;
   - para: ücretli servis, hesap ya da abonelik;
   - gizli anahtar işlemleri;
   - yeni bağımlılık;
   - geri alınamaz silme, canlıda gerçek veri silme, `supabase db reset`, force push;
   - yasak listesini (`.claude/settings.json` deny) gevşetmek;
   - bu dosyada, klasör `CLAUDE.md`'lerinde, alt ajan dosyalarında ya da `ILKELER.md`'de kural değişikliği (eskimiş bilgiyi düzeltmek hariç);
   - ikinci bir iş hattı açmak.
3. **Aktarılan onay geçmez.** Geri alınamaz silme, `supabase db reset`, canlı (hosted) işlem, dosya indirme ve kalıcı kurulum için Mert'in "evet"i işi yapan oturumun kendi penceresine yazılır; başka bir oturumdan aktarılan onay geçmez.
4. **Koordinatör karar vermekte zorlanırsa sorar.** Gece soru `SABAH-SORULAR.md`'ye yazılır; o soruya bağlı iş bekler.
5. **Mert bir kararı düzeltirse** kayıt "ters çevrildi" olur; ilgili kural ya da ilke aynı işte güncellenir. Seçenek dışı cevap ya da not, ürün ve ekran kuralıysa `KARARLAR.md`'ye (tarih, kaynak "kullanıcı", neden, reddedilen seçenek), genel bir karar biçimiyse `ILKELER.md`'ye kanıt olarak yazılır.

## 6. Teknik harita

### Yığın ve giriş noktaları
- pnpm + turbo monorepo; Windows'ta `pnpm.cmd`.
- `apps/web`: React 19, Vite 7, React Router 7, TanStack Query 5; sayfa başına CSS ve `--theme-*` token'ları (`apps/web/src/styles.css`). Giriş: `apps/web/src/main.tsx`, `App.tsx`.
- `apps/api`: Fastify 5, zod 4, supabase-js. Giriş: `apps/api/src/app.ts` (yerelde `server.ts`); Vercel'de `api/index.js` (esbuild bundle). Alan klasörleri: `apps/api/src/<alan>/`.
- `packages/shared`: tipler ve saf kurallar (yetki matrisi, müsaitlik, izin, belge yaşam döngüsü, bildirim kataloğu). `packages/ui`: Button, ConfirmButton, Toaster.
- `supabase/`: migration'lar, RLS, `app_private` yetki çekirdeği, pgTAP (`supabase/tests`), test dünyası (`supabase/test-support/builder.sql`).
- `e2e/`: Playwright (gerçek giriş ekranı, builder'dan gelen kişiler).
- Ortam: `.env.example` → `.env.local` (asla commit edilmez).

### Bir isteğin yolu
Ekran → TanStack Query hook'u (`*-data.ts`) → `apiRequest` → API route (`apps/api/src/<alan>/`) → `supabase.rpc('<ad>_service')` → RLS + `app_private.authorize()` / `scope_set()`. Web veriye kural olarak API üzerinden ulaşır; bugünkü istisnalar (Settings kataloğu, hesap profili ve belge depolaması doğrudan supabase-js + RLS ile) `apps/web/CLAUDE.md`'de yazılıdır, yenisi eklenmez. Web'deki `can()` (`apps/web/src/auth/can.ts`) ve `isNoAccess()` (`apps/web/src/lib/no-access.ts`) yalnız yansıtır; asıl karar veritabanındadır. Yeni `*_service`: yetki matrisinde (`supabase/tests/authorization_matrix.test.sql`; `packages/shared/src/authorization-matrix.expected.json` ondan üretilen döküm) ve pgTAP kataloğunda (`supabase/tests/authz_catalog.test.sql`) sınıflanır.

### Komutlar
- Kurulum ve çalıştırma: `pnpm.cmd install` · `pnpm.cmd supabase:start` · `pnpm.cmd dev` (web 5555, API 5556).
- Tam kapı: `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd build`; `supabase/` değiştiyse `pnpm.cmd test:db`; kullanıcı akışı, API ya da ekran davranışı değiştiyse etkilenen e2e senaryoları.
- Odaklı: `pnpm.cmd --filter @newfork/web exec vitest run <dosya>`, `pnpm.cmd --filter @newfork/web typecheck`.
- e2e: `pnpm.cmd e2e` (`e2e/playwright.config.ts`; yerelde 5565/5566, `db.lock` ve `heavy.lock` ile).
- Yeni worktree: `pnpm.cmd install` → `pnpm.cmd --filter @newfork/shared --filter @newfork/ui build` → ana klasörden yalnız yerel `.env*` dosyaları kopyalanır (hosted anahtar kopyalanmaz).

### Worktree, posta kutusu, kilitler
- Oturum worktree'si `../newfork-wt/<id>`, dal `task/<id>`; koordinatörün belge worktree'si `../newfork-wt/coord` (detached `origin/main`). Alt ajan worktree'leri `.claude/worktrees/`. Geçici kanıtlar `artifacts/<iş-no>/` (gitignore'da).
- Posta kutusu (`C:/Users/TheWe/Documents/Codex/.newfork-inbox/`, git dışı): rapor `node scripts/inbox.mjs send "<oturum/iş>" "<iş-id>" <rapor.md>`; durum `node scripts/inbox.mjs status "<iş-id>" "<durum>"`. Koordinatör: oturum başında `claim`, arka planda `wait`, işlenen rapor `ack <ad>`, yoklama `board`; `audit.log` her iş sonunda okunur.
- Kilitler (`C:/Users/TheWe/Documents/Codex/.newfork-locks/`) yalnız yardımcıyla: `node scripts/lock.mjs take <db|main|heavy> "<oturum/iş>, <amaç>"`, `release <db|main|heavy> "<oturum/iş>"`, `status`. Alamazsan iş başlamaz, beklenir; 2 saatten eski kilit koordinatöre sormadan silinmez.
  - `main.lock`: main'e gönderim; yoksa `scripts/guard.mjs` reddeder. Bilinçli aşma yalnız `NF_OVERRIDE="<gerekçe>"` önekiyle; önce `refs/nf-backup/main/<zaman>` yedeği alınır ve `audit.log`'a yazılır.
  - `db.lock`: yerel DB'de migration uygulama, `test:db`, e2e, fixture üretimi. `db.lock` varken uygulamada veri girilmez.
  - `heavy.lock`: aynı anda tek ağır koşu (§4.2). Ağır koşu: kökten `test` ya da `build` (tam kapı), `test:db`, e2e ve CI başlatan push (main ya da `task/**`, yalnız `docs/**` / `*.md` değilse). Tek başına `lint`, `typecheck` ve `--filter`'lı odaklı koşu sayılmaz. e2e ve `test:db` için önce `db.lock`, sonra `heavy.lock`. Kilit sende değilse ya da CI koşuyorsa `scripts/guard.mjs` 2026-10-14'e kadar uyarır, sonra reddeder; kaçış ağır komutun başına `NF_OVERRIDE="<gerekçe>"`, `audit.log`'a yazılır.
  - Ağır koşu başlamadan `gh run list --limit 3` ile CI'a bakılır; CI koşuyorsa beklenir.

### Gönderim adımları
1. İnceleme ONAY (§4.3) ve gerekiyorsa koordinatörün "gönder" izni (§4.2).
2. `node scripts/lock.mjs take main "<oturum/iş>, <iş>"`; kod değiştiyse `heavy` de (tam kapı ve CI başlatan push ağır koşudur).
3. `git fetch origin && git rebase origin/main`; çatışma çözüldüyse inceleme yenilenir.
4. Rebase sonrası tam kapı yeşil. Yalnız `.md` dosyaları değiştiyse kod kapısı gerekmez.
5. `git push origin HEAD:main` (yalnız fast-forward); reddedilirse 3'e dönülür.
6. Kilitler bırakılır, main CI izlenir.
- Commit mesajı İngilizce Conventional Commits ve iş numarasıyla: `fix(schedule): ... (EKRAN-01)`. Dosyalar adıyla eklenir; `git commit -a` kullanılmaz.

### Veritabanı ve canlı
- Yerel veritabanı, migration denemesi ve şema dosyası: `supabase/CLAUDE.md`.
- Main'e giren her şey Vercel'den yayına çıkar (API ve web). Canlı migration yalnız Supabase MCP `apply_migration` ile (§5 koşulları); CLI `supabase db push` yasak listesindedir. Canlı DDL'den sonra güvenlik uyarıları (`get_advisors`) okunur.

### CI
- İşlerin dökümü ve runner kuralları: `e2e/CLAUDE.md`.
- `pnpm.cmd test` yeşili CI yeşili değildir; typecheck ve lint ayrı kapıdır.
- Main kırmızıysa main'e yalnız düzelten gönderir. Kırmızı önce ayrılır: yalnız düşen işler yeniden koşturulur, hangi runner'da koştuğuna bakılır; altyapıdan gelen kırmızı koda düzeltme yazdırmaz. Yük altında düşen test, kod kusuru sayılmadan önce boşta yeniden koşturulur.
- Ubuntu tek başına `wsl --terminate` / `--shutdown` ile yeniden başlatılmaz (Docker Desktop'ın bağlantısı kopar); çözüm Docker Desktop'ı yeniden başlatmaktır.

### Portlar (web / api)
5555/5556 Mert'in dev sunucusu · 5565/5566 yerel e2e (yalnız `db.lock` sahibi) · 5590/5591, 5600/5601, 5610/5611 CI runner'ları · koordinatör 5642/5643 · oturumlar 5612/5613, 5620/5621, 5622/5623, 5626/5627, 5630/5631, 5632/5633 (koordinatör görev mesajında hangisini kullanacağını yazar). Bunlar başka amaçla kullanılmaz.
- Web: `pnpm.cmd --filter @newfork/web exec vite --host 127.0.0.1 --port <web> --strictPort` (`VITE_API_URL=http://localhost:<api>` ile).
- API: `PORT=<api>`, `APP_URL=http://127.0.0.1:<web>` ile `pnpm.cmd --filter @newfork/api dev`.

### Tuzaklar
- Yeni worktree'de `pnpm.cmd install` yapılmadan vitest `@vitejs/plugin-react`'i bulamaz.
- Dev sunucusunu port PID'iyle durdurmak `tsx watch`'ı canlı bırakır; süreç ağacı durdurulur, sahiplik başlatma zamanıyla kanıtlanır.
- Uzun yol yüzünden `git worktree remove` yarım kalırsa PowerShell `Remove-Item -LiteralPath '\\?\C:\...' -Recurse -Force`, ardından `git worktree prune`. Silmeden önce `git status --porcelain --ignored` ile içerik kontrol edilir.
- Birleşmesi doğrulanmamış dal silinmez; rebase ile alınmış dal `git cherry -v origin/main <dal>` ile ölçülür, sha ile değil.
