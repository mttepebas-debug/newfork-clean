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

## 2. Mert'le iletişim (proje sohbetinde koordinatör, thread'de o thread'in Claude'u)
1. **Türkçe, sade.** Kısa cümle, geliştirici dili yok; ölçü: Mert ek soru sormadan anlayıp karar verebilmeli. İç numara tek başına yazılmaz; yanında ne olduğu söylenir. Kod, commit ve ekran metni İngilizce. 5N1K konu elverdiği kadar; nerede = ekran → menü → düğme ya da dosya. Mert'in bilgisayarındaki dosya tam Windows yolu ve tıklanır bağlantıyla: `[C:\…\dosya.md](göreli/yol)`; kısaltılmış yol yok (Mert, 2026-10-08). Bulut thread'i Windows yolunu bilmez: repo dosyası repo yoluyla (`docs/plan/KARARLAR.md`), proje dosyası `/mnt/project-files/…` bağlantısıyla (Mert, 2026-10-09).
2. **Dinle, sözünü kesme.** Mert anlatırken işe girişilmez. Önce dinle, gerekirse sor, sonra öner.
3. **Sorgula.** İstek Mert'ten geldi diye doğru kabul edilmez. Yanlış, gereksiz ya da zaman kaybı görülen istek açıkça söylenir. İtiraz bir kez, gerekçesiyle; Mert karar verince ona uyulur ve karar deftere yazılır. Güvenlik açığı ya da geri alınamaz kayıpta bir kez daha uyarılır. Mert de yanılabilir: boşluk tahminle doldurulmaz, sorulur.
4. **Daha iyi yolu göster.** Daha ucuz, daha kaliteli ya da projeye daha uygun yol varsa Mert ona yönlendirilir. Maliyet dolarla.
5. **Önce anla, sonra iş.** İş başlatan her istekte, işe başlamadan dört başlık: **Anladığım** · **Eksik ya da yanlış olabilecek** (çakışan kural dahil) · **Sorularım** · **Bence** (önerim ya da itirazım, artı/eksi). "Bence" her istekte var; elenen seçenekler de neden elendiğiyle görünür yazılır. Görevi alan işçi aynı dört başlığı kendi raporunda yazar (Mert, 2026-10-08).
6. **İsteği daralt.** İstek ya da prompt gelince kapsam daraltılır, hedef ve başarı ölçütü yazılır, Mert onaylar, iş ondan sonra başlar. Küçük işte tek satır ve tek tık. Okuma ve ölçme onay beklemez.
7. **Yolda çıkan backlog'a.** İş sırasında bulunan başka şey plana katılmaz, `BACKLOG.md`'ye yazılır. İstisna: işin önündeyse, işle ilgili güvenlik açığıysa ya da ürünün çıktısını bozuyorsa o işte düzeltilir, nedeni thread'e yazılır; işin inceleme bulguları ve aynı işin görsel hataları da o işte düzeltilir (KARARLAR P17, S-79). İşle ilgisiz bir güvenlik açığı görülürse hemen koordinatöre; koordinatör ayrı acil iş açar, ciddiyse Mert'e sorar.
8. **Soru biçimi.** Tek tıkla cevaplanır, seçenekler adlıdır. Önerilen ilk sırada, `(Önerilen)` etiketli, açıklamasının son satırı `Dayanak: <KARARLAR kimliği / Mert'in <tarih> kararı>` ya da `Dayanak: yok — yeni karar`. Kuruluş: bugün ne oluyor → isimli örnek → her seçeneğin sonucu. "Hepsi önerilen gibi" paketi yok; kategori sorusu çoklu seçimle. İşi durduran soru hemen; durdurmayanlar `SORULAR.md`'de birikir, Mert durum isteyince ya da üçü geçince tek turda. Project'te soru karar kartıyla sorulur: önerilen seçenek kartın önerilen seçeneği, `Dayanak:` kartın bağlamında.
9. **Hata saklanmaz.** Claude'dan kaynaklanan hata için "benim hatam".
10. **Komut Run düğmesiyle.** Mert komutu yalnız Claude uygulamasının Terminal panelinde ▶ ile çalıştırır: her komut ayrı, `bash` etiketli blokta, tek satır, PowerShell 7'de geçerli (`pnpm.cmd`, `$env:X='y'; …`; `export`, `VAR=x cmd`, `/c/...` biçimleri yok). Panel `newfork-clean`'de açılır; başka klasörde çalışacaksa tam Windows yolu yazılır. Claude'un kendisinin çalıştırabileceği komut Mert'e verilmez. Bulut thread'i komutu kendisi Linux'ta koşar (`pnpm`, `.cmd` yok); Mert'in bilgisayarında koşması gereken iş Remote Control thread'ine gider.
11. **Öğreterek.** Mert tek başına geliştirici ve öğreniyor: önemli kararın nedeni tek cümleyle; bilmediği kavramın yanında bir satırla ne olduğu. Amaç en verimli yoldan en kaliteli ürün.

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
### B. Kod kaybı olmaz
1. Ana klasör (`newfork-clean`, main) Mert'indir: orada iş yapılmaz, dal değiştirilmez.
2. Her iş kendi worktree'sinde ve dalında, güncel `origin/main`'den.
3. Başkasının işi ezilmez. Yasak: `git stash`, `reset --hard`, `checkout -- .`, force push, `--no-verify`, toplu `git clean`, başkasının worktree'sinde değişiklik, isimle süreç öldürme. Yalnız kendi başlattığın PID durdurulur.
4. Geri alınamaz her adımdan önce yedek; yedeğin adı ve yeri thread'de.

## 4. Karar verme
- **Dayanak sırası:** Mert'in en güncel açık kararı > `KARARLAR.md` > koordinatör kararı > sektör emsali.
- **Ödünleşim:** doğru veri > tahmine dayalı UX · çekirdekte tam çözüm > kestirme · görünüm turunda dar kapsam > fırsatçı genişleme · kodda hız, altyapıda temkin · ücretsiz > ücretli.
- **Soru çıkınca:** `KARARLAR.md`'de dayanak ara. Bir madde birebir kapsıyorsa karar ver, dayanağı yaz. Kapsamıyorsa koordinatör `nf-hakem`'e sorar; o da kapsamıyorsa soru Mert'e (`docs/plan/SORULAR.md`).
- **Koordinatör sormadan karar verir:** iş sırası, ajan sayısı, model ve effort, test ve dal kararları, şemanın iç ayrıntısı, defterde dayanağı olan ürün kararı, birleşmesi doğrulanmış dalı ve temiz worktree'yi silmek, oturum arşivlemek, canlı migration için "gönder" (§5). Kararı thread'de tek satır; Mert'in yerine verilen ürün ya da ekran kararı, para ve canlı adımı ayrıca `DURUM.md` "Senin yerine verdiğim kararlar"a (§6).
- **Her zaman Mert'e:** yeni görsel tasarım (varyant hazırlanır, Mert seçer); temel modeller (yetki kapsamı, saat dilimi, izin iptali gibi; önce sohbette); kayıtların kapsamadığı ürün kuralı; para (ücretli servis, hesap, abonelik); gizli anahtar; yeni bağımlılık; geri alınamaz silme, canlıda gerçek veri silme, `supabase db reset`, force push; `.claude/settings.json` yasak listesini gevşetmek; bu dosyada, klasör `CLAUDE.md`'lerinde, ajan dosyalarında ya da `KARARLAR.md` §0'da kural değişikliği (eskimiş bilgiyi düzeltmek hariç).
- **Geri alınamaz işte** (canlıda gerçek veri silme, `supabase db reset`, force push, ücretli işlem, dosya indirme, kalıcı kurulum) Mert'in "evet"i işi yapacak thread'de yazılır (ya da koordinatör Mert'in mesajını olduğu gibi o thread'e ekler) ve işi o thread kendisi yapar; alt ajana aktarılmaz. Canlı migration bunlardan değildir: ekleyeni koordinatörün §5 koşullu "gönder"iyle, riskli olanı ONAY ve koordinatörün "gönder"iyle thread uygular (Mert, 2026-10-08; 2026-10-09).
- **Mert bir kararı düzeltirse** madde aynı işte güncellenir. Seçenek dışı cevap `KARARLAR.md`'ye (tarih, kaynak Mert, neden, reddedilen seçenek).

## 5. İş akışı
### Roller
İş Claude Projects'te yürür (Mert, 2026-10-09; `KARARLAR.md` S-116). Eski yerel koordinatör oturumu (`newfork-wt/coord`, dal `coord/kayit`, `/oto`, `/durum`) emeklidir.
- **Koordinatör:** Project'in proje sohbetindeki Claude'u. Mert'in proje sohbetindeki muhatabı; kod yazmaz. İsteği daraltır, her işe bir thread açar, sırayı ve işçi sınırını tutar, sonucu doğrular, `DURUM.md`'yi yazar, treni Remote Control thread'ine koşturur.
- **Thread** (işçi): bir iş, uçtan uca; Mert'le kendi thread'inde konuşur. İki türü var:
  - **Bulut thread'i:** GitHub repo'sunun kendi kopyası, Linux. Kod, lint, typecheck, birim test ve dal push'u yapar. Yerel DB, kilit, `test:db`, e2e ve tren yoktur; `lock.mjs` ve `train.mjs` orada çıkış 3 ile durur. Bunlara gereken adım Remote Control thread'ine gider.
  - **Remote Control thread'i:** Mert'in Windows bilgisayarında; yerel DB, kilit, e2e, tren, `main-watch`. Ana klasörde iş yapmaz (§3.B.1): önce kendi worktree'si.
- **Alt ajanlar** (`.claude/agents/`; hepsi Opus 5.5, effort en az medium — Mert, 2026-10-07): `nf-isci` bir işi uçtan uca yapar; `nf-guvenlik` incelemeli işte bağımsız inceleme; `nf-okur` salt okur keşif, backlog tazeliği, CI kırmızısını ayırma; `nf-hakem` soruyu karar defteriyle karara bağlar ya da Mert'e hazırlar.
- **Paralellik:** aynı anda 1 kod yazan thread (salt okuyan sayılmaz; işçi sınırı; `DURUM.md` "Sağlık"ta `işçi sınırı <n>`); fazlası yalnız Mert komut verince ve yalnız onun komutuyla değişir (Mert, 2026-10-08). Birden çok işçide dosyaları çakışmayan işler, yalnız Mert'in onayladığı planın içinden.
- **Mert'in açtığı başka oturum** bu dosyaya uyar; çıktısı bir işi etkiliyorsa onu kendi dalında bir dosyaya yazar ve yolunu Mert'e söyler; koordinatör o dosyayı okur.
### Bir işin yolu
1. İstek → daraltma → hedef + bitti ölçütü → Mert onayı → `DURUM.md` "Sırada". Backlog'dan gelen iş önce `nf-okur` tazelik kontrolünden geçer (geçerli / değişmiş / bayat).
2. **Görev:** koordinatör işe bir thread açar (thread içinde alt ajan da kullanılabilir: `Agent(subagent_type: "nf-isci", isolation: "worktree")`); görev metni:
   ```
   İŞ: <ID> — <tek cümle hedef>
   Bitti ölçütü: <ölçülebilir maddeler>
   Dokun: <dosya/klasör> · Dokunma: <dosya/klasör>
   Sınıf: normal | incelemeli · Port: <web>/<api>
   İlgili kararlar: <KARARLAR kimlikleri>
   Önerilen skill'ler: <…>
   ```
3. **İşçi:** dal hazırlığı (Remote Control thread'i ve alt ajan `node scripts/wt-hazirla.mjs <ID>` → `task/<id>`; bulut thread'i kendisine verilen `claude/…` dalında, güncel `origin/main`'den) → TDD, küçük commit → hızlı kontroller → dalı push → sonuç kendi thread'inde, `dal@sha` ile. PR açılmaz ve birleştirilmez; dal trenle main'e gider. Alt ajanın son mesajı sözleşmelidir: ilk satır `İŞ: <ID> | DURUM: HAZIR | SORU | TAKILDI | BÖLÜNDÜ | DAL: task/<id>@<sha>`, gövde ≤15 satır. Thread geçmişi işin günlüğüdür.
4. **Sınıf:** **normal** (tek ekran ya da alan; paylaşılan sözleşme ve yetki yok) → kapı trenin CI'ı. **İncelemeli** (shared tip, API cevap şekli, birden çok ekran, yetki, RLS, grant, `*_service`, katılım/davet, sahiplik devri, veri silme, parola/oturum, canlı DDL) → `nf-guvenlik` `ONAY @<sha>`; ekran değiştiyse masaüstü 1440 ve telefon 390 görüntüsü; koordinatör (ya da açtığı salt okur thread) diff'in riskli kısmını okur. **Denetim** (Mert, 2026-10-08): incelemeli işlerin ve canlı adımların hepsi incelenir; normal işlerden koordinatör günde 2–3 örneğin diff'ini okur; trenin CI'ı her zaman izlenir.
5. **Canlı veritabanı** (Mert, 2026-10-08; `KARARLAR.md` S-40 / S-107): **Riskli** = silen migration; yetki, RLS, grant, policy; SECURITY DEFINER ya da var olan bir fonksiyonun gövdesini değiştiren (CREATE OR REPLACE) değişiklik; `*_service`; katılım/davet; sahiplik devri; veri silme; parola/oturum. Bir migration hem ekleyen hem riskliyse riskli sayılır; şüphede riskli. İkisini de thread kontrol listesiyle uygular: riskli olanı ONAY ve koordinatörün "gönder"inden sonra (Mert, 2026-10-09). **Ekleyen** migration → `nf-guvenlik` ONAY → koordinatörün kendiliğinden "gönder" kontrolü (ONAY bu sha'da, migration yalnız ekliyor, riskli listesinden bir şeye dokunmuyor) → thread uygular. Kontrol listesi: yedek (`pg_get_functiondef` + silinen nesnelerin tanımı) → Supabase MCP `apply_migration` → md5/sürüm doğrulaması + `get_advisors` + bağımsız SELECT → dosya adı = canlı ledger sürümü. Silen migration trenin CI'ı yeşil olunca. Canlıda gerçek veriyi geri dönüşsüz silmek Mert'in "evet"iyle (§4). CLI `supabase db push` yasak.
6. **Tren:** `node scripts/train.mjs run <dal@sha…>` (Remote Control thread'i, koordinatörün isteğiyle, arka planda): build → CI (`train/<zaman>`, tam kapı bir kez) → yeşilse main fast-forward → ortak yerel DB'ye migration'lar. Main'e gönderim yalnız tren ve beklemesiz: hazır dal varsa ve tren koşmuyorsa tren hemen kalkar; koşan tren varsa dal sonrakine biner (Mert, 2026-10-08). Main'e başka yoldan push ya da PR birleştirmesi yok (guard terminaldeki push'u reddeder; GitHub aracıyla birleştirmeyi göremez, kural thread'indir).
   - **Main alarmı:** Remote Control thread'i her tren öncesinde ve koordinatör istediğinde `node scripts/main-watch.mjs --since <DURUM.md "Sağlık"taki sha>` koşar; main'e trenden başka yoldan commit girdiyse ya da main geri sarıldıysa (çıkış 1) `DURUM.md`'de 🔴 satırı, yeni iş başlamaz; koşan işler ve tren sürer; Mert'e söylenir (Mert, 2026-10-08; `KARARLAR.md` S-114; ücretsiz, sunucu tarafı koruma yok). Çıkış 2 (başlangıç yok) ve 3 (bayat ya da ölçülemiyor): hüküm yok, main temiz sayılmaz; 🟠 satırı, sürerse Mert'e.
   - **Trenin CI'ı kırmızı:** `nf-okur` ayırır: altyapı (yük, port, Docker) → yalnız düşen iş yeniden; kod → bozan dal çıkar. Main'deki aynı bilinen e2e kırmızısı treni durdurmasın diye test karantina listesine (`e2e/karantina.txt`) trenle eklenir (BL numarası, en çok 7 gün); CI yeşil kalır. CI aşımı (NF_OVERRIDE) bilinen kırmızı için kullanılmaz. check/db işindeki kırmızıda önce geri al (S-104). Satır `<parça> | BL-<no> | <başlangıç> | <bitiş>`, bitiş − başlangıç ≤ 7 gün; listeyi yalnız koordinatörün bu iş için açtığı thread yazar. Koordinatör bir BL'nin karantinasını bir kez uzatabilir; ikinci uzatma Mert'in "evet"iyle ve `DURUM.md` "Senin yerine verdiğim kararlar"a. (`KARARLAR.md` S-106)
   - **Main kırmızı:** önce geri al (revert, trenle); canlı veritabanına dokunan değişiklikte önce düzelt. Sahibi yapar; 15 dakikada yapmazsa koordinatör. Süre, kırmızının yük mü kod mu olduğu `nf-okur` ile ayrıldıktan sonra başlar (Mert, 2026-10-08).
7. **Kapanış:** main'de ve CI yeşil → `DURUM.md` "Bugün biten", backlog maddesi kapanır, dal ve worktree silinir (`git cherry -v origin/main <dal>` boşsa).
- **Skill'ler** (sonucu değiştirecekse, sormadan): `superpowers:brainstorming` (kural ya da model karara bağlanacakken), `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `supabase:supabase-postgres-best-practices`, `superpowers:receiving-code-review`, `superpowers:verification-before-completion`.
### Test ve kilit
- İşçi tam kapı koşmaz: dokunduğu paketin `pnpm.cmd --filter <paket> lint` / `typecheck` (bulutta `pnpm`), ilgili vitest; DB işinde (yalnız Remote Control thread'i) `node scripts/lock.mjs run db -- <komut>`; akış değiştiyse `node scripts/lock.mjs run db --e2e -- <komut>` (CI koşarken bekler). Komut cmd.exe'de koşar; tırnak isteyen komut tek argüman.
- Tek kilit `db`; yalnız komut tutar, komut bitince açılır. `node scripts/lock.mjs status` sırayı gösterir. Kilit elle silinmez; ölü sahibini sıradaki temizler.
- `pnpm.cmd test` yeşili CI yeşili değildir; tam kapı trenin CI'ıdır.

## 6. Kayıtlar (koordinatörün bu iş için açtığı thread yazar; alt ajan yazamaz, guard reddeder)
| Dosya | Ne |
|---|---|
| `DURUM.md` (proje dosyaları: `/mnt/project-files/DURUM.md`) | Mert'in okuduğu tek sayfa; koordinatör yazar, bir thread bitince ya da Mert durum isteyince. Bölümler: tek cümlelik 🟢/🟠/🔴 · Seni bekleyen · Bugün biten · Koşuyor · Sırada · Trene hazır · Tren · Senin yerine verdiğim kararlar · Plan · Sağlık (işçi sınırı, main alarmı ve `since` sha'sı, etkin karantina satırları) |
| `docs/plan/KARARLAR.md` | Karar defteri |
| `docs/plan/SORULAR.md` | Mert'e açık sorular |
| `docs/plan/gunluk/` | 2026-10-09'a kadarki gün günlüğü ve ajan raporları; yeni gün yazılmaz, thread geçmişi günlüktür |
| `docs/plan/BACKLOG.md` | Yapılabilecek işler: `BL-081 (leave: high / do: risky)`; yeni numaradan önce origin/main'deki en yüksek |
| `docs/plan/EKRAN-PLANI.md`, `docs/plan/ekranlar/` | Yol haritası ve Mert'in onayladığı ekran kapsamları |
| Klasör `CLAUDE.md`'leri | O klasörün teknik tuzakları; koordinatör işçinin "Ders" satırından yazar |
| `e2e/karantina.txt` | Bilinen e2e kırmızılarının karantina listesi (S-106); guard ve tren işçi dalını reddeder |
| PAGES (`/mnt/project-files/PAGES`, `README.md`) | Route başına bir numaralı Artifact; ekranı değiştiren tren o ekranın PAGES sayfasını yeniden kurar (proje talimatı #11) |
- **Kayıt yükü** (Mert, 2026-10-08): ayrı karar kaydı (`DURUM.md` "Senin yerine verdiğim kararlar", gerekirse `KARARLAR.md`) yalnız Mert'in yerine verilen ürün ya da ekran kararı, para ve canlı için; gündelik kararlar (iş sırası, model, test, dal) günlükte tek satır.
- Claude'un hafızası yalnız Mert ve ortam bilgisi tutar; kural buraya, karar `KARARLAR.md`'ye.
- `docs/archive/` kural değildir, okunmaz.
- Commit: İngilizce Conventional Commits, iş numarasıyla (`fix(schedule): … (EKRAN-01)`); dosyalar adıyla, `git commit -a` yok.
- Haftalık denetim `/haftalik-denetim` (koordinatör bir `nf-okur` ile ya da kendisi).

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
- Remote Control thread'inin worktree'si `../newfork-wt/<iş>`, dal `task/<id>`; alt ajan worktree'leri `<o worktree>/.claude/worktrees/agent-*`; tren klasörü `../newfork-wt/train`. Geçici kanıt `artifacts/<iş>/` (gitignore'da).
- Portlar: 5555/5556 Mert · 5565/5566 yerel e2e (db kilidi sahibi) · 5590/5591, 5600/5601, 5610/5611 CI runner'ları · 5642/5643 Remote Control thread'i · işçiler 5612/5613, 5620/5621, 5622/5623.
- Web: `pnpm.cmd --filter @newfork/web exec vite --host 127.0.0.1 --port <web> --strictPort` (`VITE_API_URL=http://localhost:<api>`). API: `PORT=<api>`, `APP_URL=http://127.0.0.1:<web>` ile `pnpm.cmd --filter @newfork/api dev`.
- Yayınlanan sayfalar (claude.ai Artifact): Mert iki Claude hesabıyla çalışır, bir hesabın sayfasını öbürü görmez. Sayfa dosyası `C:/Users/TheWe/Documents/Codex/newfork-pages/<ad>.html` (çok dosyalıysa `<ad>/`); yayın oradan; klasördeki `README.md` satırı (dosya, iki hesabın linki) güncellenir. Çok dosyalı sayfanın ek dosyaları yayından önce oturumun geçici klasörüne kopyalanır. Sayfa dosyası yalnız geçici klasörde kalırsa öbür hesaba kaybolur; yayın aracı ek dosyayı başka yerden almaz. Bulut thread'i sayfa dosyasını `/mnt/project-files/pages/<ad>.html`'de tutar.
### Veritabanı, canlı, CI
- Yerel DB, migration denemesi, şema dosyası: `supabase/CLAUDE.md`. Main'e giren her şey Vercel'den yayına çıkar.
- CI (`.github/workflows/ci.yml`) yalnız `train/**` push'unda ve elle koşar (PR'da değil): check, db, e2e, db-budget; Mert'in bilgisayarındaki tek runner. Kırmızı ayırma ve runner kuralları `e2e/CLAUDE.md`.
- Ubuntu tek başına `wsl --terminate` / `--shutdown` ile yeniden başlatılmaz; Docker Desktop yeniden başlatılır.
### Tuzaklar
- Yeni worktree'de `pnpm.cmd install` olmadan vitest `@vitejs/plugin-react`'i bulamaz (`wt-hazirla.mjs` kurar).
- Dev sunucusunu port PID'iyle durdurmak `tsx watch`'ı canlı bırakır; süreç ağacı durdurulur, sahiplik başlatma zamanıyla kanıtlanır.
- Uzun yol yüzünden `git worktree remove` yarım kalırsa PowerShell `Remove-Item -LiteralPath '\\?\C:\...' -Recurse -Force`, sonra `git worktree prune`; önce `git status --porcelain --ignored`.
- Birleşmesi doğrulanmamış dal silinmez; rebase'li dal `git cherry -v origin/main <dal>` ile ölçülür.
