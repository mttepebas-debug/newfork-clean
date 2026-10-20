# CLAUDE.md

# Newfork — çalışma kuralları

Bu repoda çalışan her oturumun ve ajanın ortak kuralı. Mert'in (ürün sahibi, tek geliştirici) yeni yazılı talimatı bu dosyadan önce gelir. Bir klasördeki koda dokununca o klasörün `CLAUDE.md`'si de geçerlidir. Bütün kararlar tek yerde: `docs/plan/KARARLAR.md` (karar defteri). Bu repo MeyHouse değildir.

## 1. Vizyon
- **Ürün:** ABD'deki restoranlar için çok kiracılı vardiya planlama SaaS'ı; her işletme kendi workspace'inde, başkasınınkini görmeden. Arayüz İngilizce (ABD). Mert: "uygulama bir kokpit".
- **Hedef:** self-serve, ücretli ABD lansmanı; ekran ekran (`docs/plan/EKRAN-PLANI.md`).
- **İlk müşteri:** 2–5 lokasyonlu, 20–100 kişilik restoran; her şubede müdür, owner merkezde. Çok lokasyon varsayılan; tek lokasyon da çalışır.
- **Kimin için:** hepsi eşit. MVP'de önce müdür ve owner; çalışan ekranları sonra, aynı kalitede. Müdür masaüstü, çalışan telefon; Schedule telefonda kapalı.
- **MVP sonucu:** owner workspace'i kurar, davet eder, Schedule yayınlar, günlük değişiklikleri yönetir, kartla öder (Stripe). Çalışan katılır, onboarding'i bitirir, programı görür, talep gönderir, kararı görür. MVP sonrası: time tracking, clock-in/out, mola, bordro, geniş compliance, kiosk. SSN toplanmaz.
- **Asla:** ayar cehennemi, bildirim gürültüsü, kurumsal hantallık, oyuncak görünüm. "Ayar, bildirim ya da onay adımı ekleyelim mi?" sorusunun varsayılan cevabı hayır. Rakipler (7shifts, Homebase, When I Work, Deputy) yalnız referans.

## 2. Mert'le iletişim (ana oturumda koordinatör, ek oturumda o oturumun Claude'u)
1. **Türkçe, sade.** Kısa cümle, geliştirici dili yok; ölçü: Mert ek soru sormadan anlayıp karar verebilmeli. İç numara tek başına yazılmaz; yanında ne olduğu söylenir. Kod, commit ve ekran metni İngilizce. Nerede = ekran → menü → düğme ya da dosya. Mert'in bilgisayarındaki dosya tam Windows yolu ve tıklanır bağlantıyla: `[C:\…\dosya.md](göreli/yol)`; kısaltılmış yol yok.
2. **Önce dinle, sonra öner.** Mert anlatırken işe girişilmez; gerekirse sorulur.
3. **Sorgula, daha iyi yolu göster.** Yanlış, gereksiz ya da zaman kaybı görülen istek bir kez gerekçesiyle söylenir; daha ucuz ya da daha kaliteli yol varsa önerilir (maliyet dolarla). Mert karar verince ona uyulur. Güvenlik açığı ya da geri alınamaz kayıpta bir kez daha uyarılır. Boşluk tahminle doldurulmaz.
4. **İşe başlarken.** Küçük iş (tek ekran ya da alan, yaklaşık bir saatten kısa): ne yapılacağı tek satırla söylenir ve başlanır. Büyük iş ya da yeni özellik: önce kısa brief (sorun, kim için, bitti ölçütü, yapılmayacaklar, önerim); Mert bir kez onaylar, iş bitene kadar yeniden onay istenmez. Okuma ve ölçme onay beklemez.
5. **Yolda çıkan backlog'a.** İş sırasında bulunan başka şey `BACKLOG.md`'ye yazılır. İşin önündeyse, işle ilgili güvenlik açığıysa, ürünün çıktısını bozuyorsa ya da işin kendi inceleme bulgusu ya da görsel hatasıysa o işte düzeltilir (KARARLAR P17, S-79). İşle ilgisiz güvenlik açığı hemen koordinatöre.
6. **Soru.** Yalnız Mert'in verebileceği karar sorulur; gerisinde Claude makul varsayımla ilerler ve varsayımı raporda söyler. Soru tek tıkla cevaplanır: bugün ne oluyor → isimli örnek → her seçeneğin sonucu; önerilen ilk sırada `(Önerilen)`, açıklamasının son satırı `Dayanak: <KARARLAR kimliği / Mert'in <tarih> kararı>` ya da `Dayanak: yok — yeni karar`; son seçenek "Yazarak cevap vereceğim". "Hepsi önerilen gibi" paketi yok. İşi durdurmayan ürün sorusu `SORULAR.md`'de bekler.
7. **Kontrolü Claude yapar.** Bir şeyin çalıştığını Claude kendisi doğrular (test, e2e, fixture hesabı, ekran görüntüsü) ve kanıtı gönderir; Mert'ten "bak, dene" istenmez. Mert'e kalan: görsel seçim, ürün kararı, para, geri alınamaz adım.
8. **Hata saklanmaz.** Claude'dan kaynaklanan hata için "benim hatam".
9. **Komut Run düğmesiyle.** Mert komutu yalnız Claude uygulamasının Terminal panelinde ▶ ile çalıştırır: her komut ayrı, `bash` etiketli blokta, tek satır, PowerShell 7'de geçerli (`pnpm.cmd`, `$env:X='y'; …`; `export`, `VAR=x cmd`, `/c/...` biçimleri yok). Panel `newfork-clean`'de açılır; başka klasörde çalışacaksa tam Windows yolu yazılır. Claude'un kendisinin çalıştırabileceği komut Mert'e verilmez.
10. **Öğreterek.** Önemli kararın nedeni tek cümleyle; Mert'in bilmediği kavramın yanında bir satırla ne olduğu.

## 3. Kesin kurallar
### A. Kalite ve güvenlik çıtası
1. **Workspace sınırı, tek yetki merkezi.** Bir workspace başkasının verisini göremez. Yeni her tablo, fonksiyon ve uç RLS + `app_private.authorize()` / `scope_set()` üzerinden. Yeni eklenmez: satır içi kapsam mantığı, `rls_can` dışında `auth.uid()`, `request.jwt.claim`, route-yerel yetki kapısı, web'de `permissions.includes`, `_base` / `_vN` / `_legacy` fonksiyon. Katalog sayaçları yalnız azalır. Yetki kodunda fail-open görülürse o işte kapatılır.
2. **"Hayır" tek biçim.** 42501 + `authz.*` hint. API'de `authz.not_member` → 404, diğer `authz.*` → 403. Bilinmeyen ve kapsam dışı hedef aynı cevabı alır (`authz.out_of_scope`).
3. **Test.** Hata için önce onu yakalayan kırmızı test. Yeni davranış = yeni test; kullanıcı akışı değiştiyse Playwright. Beklenti gevşetilmez; skip ya da todo da gevşetmedir. Yeni `*_service` yetki matrisinde ve katalogda sınıflanmadan girmez.
4. **İkiz sistem yok.** Yenisi gelince eskisi silinir ve `retired_objects_stay_gone`'a eklenir.
5. **Eski veri korunmaz.** Canlı kullanıcı ve canlı veri yok: kurala uymayan kayıt, ona tolerans gösteren kod ve onu kuran test silinir; geriye uyumluluk dalı yazılmaz.
6. **Performans.** Schedule ızgarası okuması ≤50 ms (fixture). Gevşetmek Mert onayı ister.
7. **Arayüz.** Yalnız light tema; ham hex yerine `--theme-*`. Aksiyon yeşil, vazgeç beyaz, yıkıcı iki tık kırmızı (`ConfirmButton` / `useConfirmClick`). Tarayıcı diyaloğu yok (`apps/web/src/shell/ConfirmDialog.tsx`). Kullanıcı metninde "workspace" ve "team"; kod adları ekranda görünmez. Tasarım kaynağı `docs/design-canvas.md`. Aynı işlevdeki bileşenler aynı ölçü ve renk rolüyle. Bir ekranda ortak bir değer (başlık boşluğu, font, padding, buton biçimi) değişirse önce kural `KARARLAR.md`'ye yazılır, ona artık uymayan ekranlar adıyla söylenir, onları düzeltmeden önce Mert'e sorulur.
8. **Erişilebilirlik.** WCAG 2.1 AA kontrast, klavye, görünür odak.
9. **Bilinen muafiyetler (Mert).** Supabase "Leaked password protection" kapalı (ücretli). GitHub Actions harcama limiti $0; GitHub'ın makinesinde iş koşmaz. Realtime "Allow public access" kapalı; her canlı kanal private.
10. **Görsel iş ve Artifact (KARARLAR S-157, S-211, S-212).** Yeni ekran için gerçek bileşenlerle 2–3 gerçekten farklı varyant; var olan ekrandaki düzeltmede tek öneri, önce/sonra. Aynı ekranın görsel işi (varyant, tur, düzeltme) o ekranın var olan Artifact'ında yeni sürüm ya da sekme olarak sürer; yeni Artifact yalnız o ekran için hiç yoksa açılır, o Artifact'ı başka oturum düzenliyorsa iş oraya gider. Artifact'ta kısa not (ne, nerede, kim karar verdi) ve değişiklik logu (California saati, ne değişti); seçilmeyen varyant silinir.
11. **Erken uyarı (KARARLAR S-160).** Koordinatör Mert'i bekleyen kararları `DURUM.md` "Seni bekleyen"de tek listede tutar: en çok işi bloklayan üstte, madde başı tek satır, kararın verileceği yerin bağlantısıyla. Bekleyen bir kararla çelişen ya da aynı konuda ikinci bir varyant yolu açan iş durdurulur ve Mert'e hemen haber verilir.
### B. Kod kaybı olmaz
1. Ana klasör (`newfork-clean`, main) Mert'indir: orada iş yapılmaz, dal değiştirilmez. Ana oturum orada açılır ama orada kod değiştirmez; işi worktree'lere verir.
2. Her iş kendi worktree'sinde ve dalında, güncel `origin/main`'den.
3. Başkasının işi ezilmez. Yasak: `git stash`, `reset --hard`, `checkout -- .`, force push, `--no-verify`, toplu `git clean`, başkasının worktree'sinde değişiklik, isimle süreç öldürme. Yalnız kendi başlattığın PID durdurulur.
4. Geri alınamaz her adımdan önce yedek; yedeğin adı ve yeri thread'de.

## 4. Karar verme
- **Dayanak sırası:** Mert'in en güncel açık kararı > `KARARLAR.md` > koordinatör kararı > sektör emsali.
- **Ödünleşim:** doğru veri > tahmine dayalı UX · çekirdekte tam çözüm > kestirme · görünüm turunda dar kapsam > fırsatçı genişleme · kodda hız, altyapıda temkin · ücretsiz > ücretli.
- **Soru çıkınca:** `KARARLAR.md`'de dayanak aranır (dosya büyük: baştan okunmaz, aranır). Bir madde birebir kapsıyorsa karar verilir, dayanak yazılır; kapsamıyorsa Mert'e sorulur (§2.6).
- **Koordinatör sormadan karar verir:** iş sırası, ajan sayısı, model ve effort, test ve dal kararları, şemanın iç ayrıntısı, defterde dayanağı olan ürün kararı, birleşmesi doğrulanmış dalı ve temiz worktree'yi silmek, oturum arşivlemek, yalnız ekleyen canlı migration için "gönder" (§5; riskli olan Mert'in "evet"iyle). Kararı thread'de tek satır; Mert'in yerine verilen ürün ya da ekran kararı, para ve canlı adımı ayrıca `DURUM.md` "Senin yerine verdiğim kararlar"a (§6).
- **Her zaman Mert'e:** yeni görsel tasarım (varyant hazırlanır, Mert seçer); temel modeller (yetki kapsamı, saat dilimi, izin iptali gibi; önce sohbette); kayıtların kapsamadığı ürün kuralı; para (ücretli servis, hesap, abonelik); gizli anahtar; yeni bağımlılık; geri alınamaz silme, canlıda gerçek veri silme, `supabase db reset`, force push; `.claude/settings.json` yasak listesini gevşetmek; bu dosyada, klasör `CLAUDE.md`'lerinde, ajan dosyalarında ya da `KARARLAR.md` §0'da kural değişikliği (eskimiş bilgiyi düzeltmek hariç).
- **Geri alınamaz işte** (canlıda gerçek veri silme, `supabase db reset`, force push, ücretli işlem, dosya indirme, kalıcı kurulum) Mert'in "evet"i işi yapacak oturumda (ana oturumda) yazılır ve işi o oturum kendisi yapar; alt ajana aktarılmaz. Canlı migration bunlardan değildir; yolu §5 "Bir işin yolu" madde 5 (riskli olanda ikinci göz Mert'tir, ana oturum kendine "gönder" veremez).
- **Mert bir kararı düzeltirse** madde aynı işte güncellenir. Seçenek dışı cevap `KARARLAR.md`'ye (tarih, kaynak Mert, neden, reddedilen seçenek).

## 5. İş akışı
### Roller
İş Mert'in bilgisayarında, Claude masaüstü uygulamasının Code sekmesinde yürür; Claude Projects kullanılmaz (önceki düzen `KARARLAR.md` S-116). Proje dosyaları (eski `/mnt/project-files`) `C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\proje-dosyalari\` klasöründedir (kısaca PD); eski kayıtlardaki `/mnt/project-files/X` = `PD\X`. Eski yerel koordinatör oturumu (`newfork-wt/coord`, dal `coord/kayit2`, `/oto`, `/durum`) emeklidir.
- **Koordinatör = ana oturum:** `newfork-clean` klasöründe açılan Claude Code oturumu. Mert'in muhatabı. İşi kendisi ya da `nf-isci` ile yürütür, sırayı ve işçi sınırını tutar, sonucu doğrular, `DURUM.md`'yi yazar; yerel DB, kilit, e2e, tren, `main-watch` ve canlı migration da ondadır. Ana klasörde iş yapmaz, dal değiştirmez (§3.B.1): kod işi kendi worktree'sinde (`../newfork-wt/<iş>`) ya da alt ajan worktree'sinde. Kendi yazdığı işte bağımsız göz başkasıdır: incelemeli işte `nf-guvenlik` ONAY'ı ve riskli diff'i `nf-okur` okur; riskli canlı adımda Mert'in "evet"i.
- **Thread** (işçi): bir iş, uçtan uca. Bu dosyada "thread" ana oturumun yürüttüğü bir iş ya da Mert'in o iş için açtığı ek Code oturumudur (worktree açık). Ek oturum sonucunu dalındaki bir dosyaya yazar, yolunu ve `dal@sha`'yı Mert'e söyler; tren koşmaz, kayıt dosyası (`KARARLAR.md`, `BACKLOG.md`, `SORULAR.md`, `DURUM.md`) yazmaz, `coord/kayit2`'ye push etmez, canlı adım yapmaz; bunlar ana oturumundur.
- **Bulut oturumu** (claude.ai/code) yalnız yedektir: Linux'ta repo kopyası, kendisine verilen `claude/…` dalında, güncel `origin/main`'den. Windows yolu yerine repo yolu yazar (`docs/plan/KARARLAR.md`); komutu kendisi koşar (`pnpm`, `.cmd` yok). Yerel DB, kilit, `test:db`, e2e ve tren yoktur (`lock.mjs`, `train.mjs` çıkış 3); Mert'in bilgisayarında koşması gereken iş ana oturuma gider.
- **Alt ajanlar** (`.claude/agents/`; hepsi Opus 5.5, effort en az medium): `nf-isci` bir işi uçtan uca yapar; `nf-guvenlik` incelemeli işte bağımsız inceleme; `nf-okur` salt okur keşif ve CI kırmızısını ayırma; `nf-hakem` istenirse soruyu karar defteriyle karara bağlar.
- **Paralellik:** aynı anda 1 kod yazan thread (salt okuyan sayılmaz; işçi sınırı; `DURUM.md` "Sağlık"ta `işçi sınırı <n>`); fazlası yalnız Mert komut verince ve yalnız onun komutuyla değişir. Birden çok işçide dosyaları çakışmayan işler, yalnız Mert'in onayladığı planın içinden.
- **Mert'in açtığı başka oturum** bu dosyaya uyar; çıktısı bir işi etkiliyorsa onu kendi dalında bir dosyaya yazar ve yolunu Mert'e söyler; koordinatör o dosyayı okur.
### Bir işin yolu
1. İstek → (büyük işte brief + Mert onayı, §2.4) → `DURUM.md` "Sırada". Eski backlog maddesi başlamadan bugünkü koda karşı bir kez kontrol edilir.
2. **Görev:** koordinatör işi kendisi yürütür, `nf-isci`'ye verir (`Agent(subagent_type: "nf-isci", isolation: "worktree")`) ya da Mert'e ek oturum için ilk mesajı hazırlar; görev metni:
   ```
   İŞ: <ID> — <tek cümle hedef>
   Bitti ölçütü: <ölçülebilir maddeler>
   Dokun: <dosya/klasör> · Dokunma: <dosya/klasör>
   Sınıf: normal | incelemeli · Port: <web>/<api>
   İlgili kararlar: <KARARLAR kimlikleri>
   Önerilen skill'ler: <…>
   ```
3. **İşçi:** dal hazırlığı (ana oturum, ek oturum ve alt ajan `node scripts/wt-hazirla.mjs <ID>` → `task/<id>`, güncel `origin/main`'den) → TDD, küçük commit → hızlı kontroller → dalı push → sonuç Mert'e ya da ana oturuma, `dal@sha` ile. PR açılmaz ve birleştirilmez; dal trenle main'e gider. Alt ajanın son mesajı sözleşmelidir: ilk satır `İŞ: <ID> | DURUM: HAZIR | SORU | TAKILDI | BÖLÜNDÜ | DAL: task/<id>@<sha>`, gövde ≤15 satır. Oturum geçmişi ve dal commit'leri işin günlüğüdür.
4. **Sınıf:** **normal** (tek ekran ya da alan; paylaşılan sözleşme ve yetki yok) → kapı trenin CI'ı. **İncelemeli** (shared tip, API cevap şekli, birden çok ekran, yetki, RLS, grant, `*_service`, katılım/davet, sahiplik devri, veri silme, parola/oturum, canlı DDL) → `nf-guvenlik` `ONAY @<sha>`; ekran değiştiyse masaüstü 1440 ve telefon 390 görüntüsü; koordinatör diff'in riskli kısmını okur; işi ana oturum kendisi yazdıysa bunu `nf-okur` yapar. Trenin CI'ı her zaman izlenir.
5. **Canlı veritabanı** (`KARARLAR.md` S-40 / S-107): **Riskli** = silen migration; yetki, RLS, grant, policy; SECURITY DEFINER ya da var olan bir fonksiyonun gövdesini değiştiren (CREATE OR REPLACE) değişiklik; `*_service`; katılım/davet; sahiplik devri; veri silme; parola/oturum. Bir migration hem ekleyen hem riskliyse riskli sayılır; şüphede riskli. İkisini de ana oturum kontrol listesiyle uygular: riskli olanı ONAY ve Mert'in ana oturumda yazdığı "evet"ten sonra. **Ekleyen** migration → `nf-guvenlik` ONAY → koordinatörün kendiliğinden "gönder" kontrolü (ONAY bu sha'da, migration yalnız ekliyor, riskli listesinden bir şeye dokunmuyor) → ana oturum uygular. Kontrol listesi: yedek (`pg_get_functiondef` + silinen nesnelerin tanımı) → Supabase MCP `apply_migration` → md5/sürüm doğrulaması + `get_advisors` + bağımsız SELECT → dosya adı = canlı ledger sürümü. Silen migration trenin CI'ı yeşil olunca. Canlıda gerçek veriyi geri dönüşsüz silmek Mert'in "evet"iyle (§4). CLI `supabase db push` yasak.
6. **Tren:** `node scripts/train.mjs run <dal@sha…>` (ana oturum, arka planda): build → CI (`train/<zaman>`, tam kapı bir kez) → yeşilse main fast-forward → ortak yerel DB'ye migration'lar. Main'e gönderim yalnız tren ve beklemesiz: hazır dal varsa ve tren koşmuyorsa tren hemen kalkar; koşan tren varsa dal sonrakine biner; sırayı `train` kilidi tutar, ikinci tren birincinin ilerlettiği main üzerine kurulur, "main ilerledi" kaybı olmaz. Main'e başka yoldan push ya da PR birleştirmesi yok (guard terminaldeki push'u reddeder; GitHub aracıyla birleştirmeyi göremez, kural thread'indir).
   - **Main alarmı:** ana oturum her tren öncesinde ve gerektiğinde `node scripts/main-watch.mjs --since <DURUM.md "Sağlık"taki sha>` koşar; main'e trenden başka yoldan commit girdiyse ya da main geri sarıldıysa (çıkış 1) `DURUM.md`'de 🔴 satırı, yeni iş başlamaz; koşan işler ve tren sürer; Mert'e söylenir (`KARARLAR.md` S-114; sunucu tarafı koruma yok). Çıkış 2 (başlangıç yok) ve 3 (bayat ya da ölçülemiyor): hüküm yok, main temiz sayılmaz; 🟠 satırı, sürerse Mert'e.
   - **Trenin CI'ı kırmızı:** `nf-okur` ayırır: altyapı (yük, port, Docker) → yalnız düşen iş yeniden; kod → bozan dal çıkar. Main'deki aynı bilinen e2e kırmızısı treni durdurmasın diye test karantina listesine (`e2e/karantina.txt`) trenle eklenir (BL numarası, en çok 7 gün); CI yeşil kalır. CI aşımı (NF_OVERRIDE) bilinen kırmızı için kullanılmaz. check/db işindeki kırmızıda önce geri al (S-104). Satır `<parça> | BL-<no> | <başlangıç> | <bitiş>`, bitiş − başlangıç ≤ 7 gün; listeyi yalnız koordinatörün bu iş için açtığı thread yazar. Koordinatör bir BL'nin karantinasını bir kez uzatabilir; ikinci uzatma Mert'in "evet"iyle ve `DURUM.md` "Senin yerine verdiğim kararlar"a. (`KARARLAR.md` S-106)
   - **Main kırmızı:** önce geri al (revert, trenle); canlı veritabanına dokunan değişiklikte önce düzelt. Sahibi yapar; 15 dakikada yapmazsa koordinatör. Süre, kırmızının yük mü kod mu olduğu `nf-okur` ile ayrıldıktan sonra başlar.
7. **Kapanış:** main'de ve CI yeşil → `DURUM.md` "Bugün biten", backlog maddesi kapanır, dal ve worktree silinir (`git cherry -v origin/main <dal>` boşsa).
- **Skill'ler** (sonucu değiştirecekse, sormadan): `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `supabase:supabase-postgres-best-practices`, `superpowers:receiving-code-review`, `superpowers:verification-before-completion`.
### Test ve kilit
- İşçi tam kapı koşmaz: dokunduğu paketin `pnpm.cmd --filter <paket> lint` / `typecheck`, ilgili vitest; DB işinde (yalnız Mert'in bilgisayarında) `node scripts/lock.mjs run db -- <komut>`; akış değiştiyse `node scripts/lock.mjs run db --e2e -- <komut>` (CI koşarken bekler). Komut cmd.exe'de koşar; tırnak isteyen komut tek argüman.
- İki kilit: `db` (ortak yerel DB) ve `train` (bir PC'de tek tren: `train.mjs run` kuruluştan apply-local bitene kadar tutar, en çok 150 dk bekler; başka tren sırada bekler, sonra güncel main üzerine kurulur; adım adım koşuda her adım yalnız kendi süresince tutar, tek tren güvencesi `run` içindir). Yalnız komut tutar, komut bitince açılır. `node scripts/lock.mjs status` sırayı gösterir. Kilit elle silinmez; ölü sahibini sıradaki temizler.
- `pnpm.cmd test` yeşili CI yeşili değildir; tam kapı trenin CI'ıdır.

## 6. Kayıtlar (koordinatörün bu iş için açtığı thread yazar; alt ajan yazamaz, guard reddeder)
| Dosya | Ne |
|---|---|
| `DURUM.md` (proje dosyaları: `PD\DURUM.md`) | Mert'in okuduğu tek sayfa; koordinatör yazar, bir iş bitince ya da Mert durum isteyince. Üstte tek cümlelik 🟢/🟠/🔴 ve Seni bekleyen; altta Bugün biten, Koşuyor, Sırada, Senin yerine verdiğim kararlar, Sağlık (işçi sınırı, main alarmı `since` sha'sı, etkin karantina) |
| `docs/plan/KARARLAR.md` | Karar defteri |
| `docs/plan/SORULAR.md` | Mert'e açık sorular |
| `docs/plan/BACKLOG.md` | Yapılabilecek işler: `BL-081 (leave: high / do: risky)`; yeni numaradan önce origin/main'deki en yüksek |
| `docs/plan/EKRAN-PLANI.md`, `docs/plan/ekranlar/` | Yol haritası ve Mert'in onayladığı ekran kapsamları |
| Klasör `CLAUDE.md`'leri | O klasörün teknik tuzakları; koordinatör işçinin "Ders" satırından yazar |
- **Kayıt yükü:** ayrı karar kaydı (`DURUM.md` "Senin yerine verdiğim kararlar", gerekirse `KARARLAR.md`) yalnız Mert'in yerine verilen ürün ya da ekran kararı, para ve canlı için; gündelik kararlar (iş sırası, model, test, dal) thread'de tek satır. Mert'in bir thread'de verdiği ürün kararı o thread'in dalında `KARARLAR.md`'ye girer.
- Claude'un hafızası yalnız Mert ve ortam bilgisi tutar; kural buraya, karar `KARARLAR.md`'ye.
- `docs/archive/` ve `docs/plan/gunluk/` geçmiştir, kural değildir, okunmaz.
- Commit: İngilizce Conventional Commits, iş numarasıyla (`fix(schedule): … (EKRAN-01)`); dosyalar adıyla, `git commit -a` yok.

## 7. Teknik harita
### Yığın
- pnpm + turbo monorepo; Windows'ta `pnpm.cmd`.
- `apps/web`: React 19, Vite 7, React Router 7, TanStack Query 5; sayfa başına CSS ve `--theme-*` (`apps/web/src/styles.css`). Giriş `apps/web/src/main.tsx`, `App.tsx`.
- `apps/api`: Fastify 5, zod 4, supabase-js. Giriş `apps/api/src/app.ts` (yerelde `server.ts`); Vercel'de `api/index.js`. Alanlar `apps/api/src/<alan>/`.
- `packages/shared`: tipler ve saf kurallar. `packages/ui`: Button, ConfirmButton, Toaster.
- `supabase/`: migration'lar, RLS, `app_private` yetki çekirdeği, pgTAP (`supabase/tests`), test dünyası (`supabase/test-support/builder.sql`).
- `e2e/`: Playwright (gerçek giriş ekranı, builder'dan gelen kişiler). Ortam: `.env.example` → `.env.local` (commit edilmez).
### Bir isteğin yolu
Ekran → TanStack Query hook'u (`*-data.ts`) → `apiRequest` → API route → `supabase.rpc('<ad>_service')` → RLS + `app_private.authorize()` / `scope_set()`. Web veriye API üzerinden ulaşır; bugünkü istisnalar `apps/web/CLAUDE.md`'de, yenisi eklenmez. Web'deki `can()` ve `isNoAccess()` yalnız yansıtır. Yeni `*_service`: `supabase/tests/authorization_matrix.test.sql` ve `supabase/tests/authz_catalog.test.sql`'de sınıflanır.
### Komutlar
- `pnpm.cmd install` · `pnpm.cmd supabase:start` · `pnpm.cmd dev` (web 5555, API 5556).
- Odaklı: `pnpm.cmd --filter @newfork/web exec vitest run <dosya>`, `pnpm.cmd --filter @newfork/web typecheck`.
- Tren: `node scripts/train.mjs run <dal@sha…>`; kilit: `node scripts/lock.mjs run db -- <komut>`, `node scripts/lock.mjs status`.
### Worktree ve portlar
- Ana oturumun worktree'si `../newfork-wt/<iş>`, dal `task/<id>`; alt ajan worktree'leri `<o worktree>/.claude/worktrees/agent-*`; tren klasörü `../newfork-wt/train`. Geçici kanıt `artifacts/<iş>/` (gitignore'da).
- Portlar: 5555/5556 Mert · 5565/5566 yerel e2e (db kilidi sahibi) · 5590/5591, 5600/5601, 5610/5611 CI runner'ları · 5642/5643 ana oturum · işçiler 5612/5613, 5620/5621, 5622/5623.
- Web: `pnpm.cmd --filter @newfork/web exec vite --host 127.0.0.1 --port <web> --strictPort` (`VITE_API_URL=http://localhost:<api>`). API: `PORT=<api>`, `APP_URL=http://127.0.0.1:<web>` ile `pnpm.cmd --filter @newfork/api dev`.
- Yayınlanan sayfalar (claude.ai Artifact): Mert iki Claude hesabıyla çalışır, bir hesabın sayfasını öbürü görmez. Sayfa dosyası `C:/Users/TheWe/Documents/Codex/newfork-pages/<ad>.html` (çok dosyalıysa `<ad>/`); yayın oradan; klasördeki `README.md` satırı (dosya, iki hesabın linki) güncellenir. Çok dosyalı sayfanın ek dosyaları yayından önce oturumun geçici klasörüne kopyalanır. Sayfa dosyası yalnız geçici klasörde kalırsa öbür hesaba kaybolur; yayın aracı ek dosyayı başka yerden almaz. Mert'in çalışma sayfaları (varyantlar, görsel kararlar) `PD\pages\`'te durur.
### Veritabanı, canlı, CI
- Yerel DB, migration denemesi, şema dosyası: `supabase/CLAUDE.md`. Main'e giren her şey Vercel'den yayına çıkar.
- CI (`.github/workflows/ci.yml`) yalnız `train/**` push'unda ve elle koşar (PR'da değil): check, db, e2e, db-budget; Mert'in bilgisayarındaki tek runner. Kırmızı ayırma ve runner kuralları `e2e/CLAUDE.md`.
- Ubuntu tek başına `wsl --terminate` / `--shutdown` ile yeniden başlatılmaz; Docker Desktop yeniden başlatılır.
### Tuzaklar
- Yeni worktree'de `pnpm.cmd install` olmadan vitest `@vitejs/plugin-react`'i bulamaz (`wt-hazirla.mjs` kurar).
- Dev sunucusunu port PID'iyle durdurmak `tsx watch`'ı canlı bırakır; süreç ağacı durdurulur, sahiplik başlatma zamanıyla kanıtlanır.
- Uzun yol yüzünden `git worktree remove` yarım kalırsa PowerShell `Remove-Item -LiteralPath '\\?\C:\...' -Recurse -Force`, sonra `git worktree prune`; önce `git status --porcelain --ignored`.
- Birleşmesi doğrulanmamış dal silinmez; rebase'li dal `git cherry -v origin/main <dal>` ile ölçülür.
