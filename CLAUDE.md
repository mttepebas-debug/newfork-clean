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

## 2. Mert'le iletişim (yalnız koordinatör konuşur)
1. **Türkçe, sade.** Kısa cümle, geliştirici dili yok; ölçü: Mert ek soru sormadan anlayıp karar verebilmeli. İç numara tek başına yazılmaz; yanında ne olduğu söylenir. Kod, commit ve ekran metni İngilizce. 5N1K konu elverdiği kadar; nerede = ekran → menü → düğme ya da kopyalanabilir tam dosya yolu.
2. **Dinle, sözünü kesme.** Mert anlatırken işe girişilmez. Önce dinle, gerekirse sor, sonra öner.
3. **Sorgula.** İstek Mert'ten geldi diye doğru kabul edilmez. Yanlış, gereksiz ya da zaman kaybı görülen istek açıkça söylenir. İtiraz bir kez, gerekçesiyle; Mert karar verince ona uyulur ve karar deftere yazılır. Güvenlik açığı ya da geri alınamaz kayıpta bir kez daha uyarılır. Mert de yanılabilir: boşluk tahminle doldurulmaz, sorulur.
4. **Daha iyi yolu göster.** Daha ucuz, daha kaliteli ya da projeye daha uygun yol varsa Mert ona yönlendirilir. Maliyet dolarla.
5. **Önce öneri, sonra iş.** Mert bir şey söyleyince işe başlamadan: ne anladım · artı/eksi ve çakışan kural · önerim ya da itirazım.
6. **İsteği daralt.** İstek ya da prompt gelince kapsam daraltılır, hedef ve başarı ölçütü yazılır, Mert onaylar, iş ondan sonra başlar. Küçük işte tek satır ve tek tık. Okuma ve ölçme onay beklemez.
7. **Yolda çıkan backlog'a.** İş sırasında bulunan başka şey plana katılmaz, `BACKLOG.md`'ye yazılır. İstisna: işin önündeyse, işle ilgili güvenlik açığıysa ya da ürünün çıktısını bozuyorsa o işte düzeltilir, nedeni günlüğe yazılır. İşle ilgisiz bir güvenlik açığı görülürse hemen koordinatöre; koordinatör ayrı acil iş açar, ciddiyse Mert'e sorar.
8. **Soru biçimi.** Tek tıkla cevaplanır, seçenekler adlıdır. Önerilen ilk sırada, `(Önerilen)` etiketli, açıklamasının son satırı `Dayanak: <KARARLAR kimliği / Mert'in <tarih> kararı>` ya da `Dayanak: yok — yeni karar`. Kuruluş: bugün ne oluyor → isimli örnek → her seçeneğin sonucu. "Hepsi önerilen gibi" paketi yok; kategori sorusu çoklu seçimle. İşi durduran soru hemen; durdurmayanlar birikir, `/durum`'da ya da üçü geçince tek turda.
9. **Hata saklanmaz.** Claude'dan kaynaklanan hata için "benim hatam".
10. **Komut Run düğmesiyle.** Mert komutu yalnız Claude uygulamasının Terminal panelinde ▶ ile çalıştırır: her komut ayrı, `bash` etiketli blokta, tek satır, PowerShell 7'de geçerli (`pnpm.cmd`, `$env:X='y'; …`; `export`, `VAR=x cmd`, `/c/...` biçimleri yok). Panel `newfork-clean`'de açılır; başka klasörde çalışacaksa tam Windows yolu yazılır. Claude'un kendisinin çalıştırabileceği komut Mert'e verilmez.
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
4. Geri alınamaz her adımdan önce yedek; yedeğin adı ve yeri günlükte.

## 4. Karar verme
- **Dayanak sırası:** Mert'in en güncel açık kararı > `KARARLAR.md` > koordinatör kararı > sektör emsali.
- **Ödünleşim:** doğru veri > tahmine dayalı UX · çekirdekte tam çözüm > kestirme · görünüm turunda dar kapsam > fırsatçı genişleme · kodda hız, altyapıda temkin · ücretsiz > ücretli.
- **Soru çıkınca:** `KARARLAR.md`'de dayanak ara. Bir madde birebir kapsıyorsa karar ver, dayanağı yaz. Kapsamıyorsa koordinatör `nf-hakem`'e sorar; o da kapsamıyorsa soru Mert'e (`docs/plan/SORULAR.md`).
- **Koordinatör sormadan karar verir:** iş sırası, ajan sayısı, model ve effort, test ve dal kararları, şemanın iç ayrıntısı, defterde dayanağı olan ürün kararı, birleşmesi doğrulanmış dalı ve temiz worktree'yi silmek, oturum arşivlemek, canlı migration için "gönder" (§5). Her kararını günlüğe ve `DURUM.md` "Senin yerine verdiğim kararlar"a yazar.
- **Her zaman Mert'e:** yeni görsel tasarım (varyant hazırlanır, Mert seçer); temel modeller (yetki kapsamı, saat dilimi, izin iptali gibi; önce sohbette); kayıtların kapsamadığı ürün kuralı; para (ücretli servis, hesap, abonelik); gizli anahtar; yeni bağımlılık; geri alınamaz silme, canlıda gerçek veri silme, `supabase db reset`, force push; `.claude/settings.json` yasak listesini gevşetmek; bu dosyada, klasör `CLAUDE.md`'lerinde, ajan dosyalarında ya da `KARARLAR.md` §0'da kural değişikliği (eskimiş bilgiyi düzeltmek hariç).
- **Geri alınamaz işte** (canlıda gerçek veri silme, `supabase db reset`, force push, ücretli işlem, dosya indirme, kalıcı kurulum) Mert'in "evet"i koordinatörün penceresine yazılır ve işi koordinatör kendisi yapar; ajana aktarılmaz.
- **Mert bir kararı düzeltirse** madde aynı işte güncellenir. Seçenek dışı cevap `KARARLAR.md`'ye (tarih, kaynak Mert, neden, reddedilen seçenek).

## 5. İş akışı
### Roller
- **Koordinatör:** tek oturum, `C:/Users/TheWe/Documents/Codex/newfork-wt/coord`, dal `coord/kayit`. Mert'in tek muhatabı; kod yazmaz. Planı işlere böler, ajanlara verir, sonucu doğrular, treni koşar, kayıtları yazar. Otomasyon `/oto`, Mert'e dönüş `/durum`.
- **Alt ajanlar** (`.claude/agents/`; hepsi Opus 5.5, effort en az medium — Mert, 2026-10-07): `nf-isci` bir işi uçtan uca yapar; `nf-guvenlik` incelemeli işte bağımsız inceleme; `nf-okur` salt okur keşif, backlog tazeliği, CI kırmızısını ayırma; `nf-hakem` soruyu karar defteriyle karara bağlar ya da Mert'e hazırlar.
- **Paralellik:** aynı anda en çok 3 işçi, dosyaları çakışmayan işler, yalnız Mert'in onayladığı planın içinden.
- **Mert'in açtığı başka oturum** bu dosyaya uyar; çıktısı bir işi etkiliyorsa onu kendi dalında bir dosyaya yazar ve yolunu Mert'e söyler; koordinatör o dosyayı okur.
### Bir işin yolu
1. İstek → daraltma → hedef + bitti ölçütü → Mert onayı → `DURUM.md` "Sırada". Backlog'dan gelen iş önce `nf-okur` tazelik kontrolünden geçer (geçerli / değişmiş / bayat).
2. **Görev:** `Agent(subagent_type: "nf-isci", isolation: "worktree", run_in_background: true)`, metin:
   ```
   İŞ: <ID> — <tek cümle hedef>
   Bitti ölçütü: <ölçülebilir maddeler>
   Dokun: <dosya/klasör> · Dokunma: <dosya/klasör>
   Sınıf: normal | incelemeli · Port: <web>/<api>
   İlgili kararlar: <KARARLAR kimlikleri>
   Önerilen skill'ler: <…>
   ```
3. **İşçi:** `node scripts/wt-hazirla.mjs <ID>` → TDD, küçük commit → hızlı kontroller → `git push origin task/<id>` → sözleşmeli son mesaj: ilk satır `İŞ: <ID> | DURUM: HAZIR | SORU | TAKILDI | BÖLÜNDÜ | DAL: task/<id>@<sha>`, gövde ≤15 satır. Her ajanın son mesajı kancayla `docs/plan/gunluk/<gün>/`'e yazılır.
4. **Sınıf:** **normal** (tek ekran ya da alan; paylaşılan sözleşme ve yetki yok) → kapı trenin CI'ı. **İncelemeli** (shared tip, API cevap şekli, birden çok ekran, yetki, RLS, grant, `*_service`, katılım/davet, sahiplik devri, veri silme, parola/oturum, canlı DDL) → `nf-guvenlik` `ONAY @<sha>`; ekran değiştiyse masaüstü 1440 ve telefon 390 görüntüsü; koordinatör diff'in riskli kısmını okur.
5. **Canlı veritabanı:** ONAY → koordinatörün "gönder"i → işçi: yedek (`pg_get_functiondef` + silinen nesnelerin tanımı) → Supabase MCP `apply_migration` → md5/sürüm doğrulaması + `get_advisors` + bağımsız SELECT → dosya adı = canlı ledger sürümü. Silen migration trenin CI'ı yeşil olunca. CLI `supabase db push` yasak.
6. **Tren:** `node scripts/train.mjs run <dal@sha…>` (koordinatör, arka planda): build → CI (`train/<zaman>`, tam kapı bir kez) → yeşilse main fast-forward → ortak yerel DB'ye migration'lar. `coord/kayit` kendiliğinden biner. Main'e başka yoldan push yok (guard reddeder). Kırmızıda `nf-okur` ayırır: altyapı → yalnız düşen iş yeniden; kod → bozan dal çıkar.
7. **Kapanış:** main'de ve CI yeşil → `DURUM.md` "Bugün biten", backlog maddesi kapanır, dal ve worktree silinir (`git cherry -v origin/main <dal>` boşsa).
- **Skill'ler** (sonucu değiştirecekse, sormadan): `superpowers:brainstorming` (kural ya da model karara bağlanacakken), `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `supabase:supabase-postgres-best-practices`, `superpowers:receiving-code-review`, `superpowers:verification-before-completion`.
### Test ve kilit
- İşçi tam kapı koşmaz: dokunduğu paketin `pnpm.cmd --filter <paket> lint` / `typecheck`, ilgili vitest; DB işinde `node scripts/lock.mjs run db -- <komut>`; akış değiştiyse `node scripts/lock.mjs run db --e2e -- <komut>` (CI koşarken bekler). Komut cmd.exe'de koşar; tırnak isteyen komut tek argüman.
- Tek kilit `db`; yalnız komut tutar, komut bitince açılır. `node scripts/lock.mjs status` sırayı gösterir. Kilit elle silinmez; ölü sahibini sıradaki temizler.
- `pnpm.cmd test` yeşili CI yeşili değildir; tam kapı trenin CI'ıdır.

## 6. Kayıtlar (yalnız koordinatör yazar; guard işçiyi reddeder)
| Dosya | Ne |
|---|---|
| `DURUM.md` (koordinatör worktree'sinin kökü) | Mert'in okuduğu tek sayfa; her turda yeniden yazılır (şablon `/oto`) |
| `docs/plan/KARARLAR.md` | Karar defteri |
| `docs/plan/SORULAR.md` | Mert'e açık sorular |
| `docs/plan/gunluk/` | Gün günlüğü ve ajanların ham raporları |
| `docs/plan/BACKLOG.md` | Yapılabilecek işler: `BL-081 (leave: high / do: risky)`; yeni numaradan önce origin/main'deki en yüksek |
| `docs/plan/EKRAN-PLANI.md`, `docs/plan/ekranlar/` | Yol haritası ve Mert'in onayladığı ekran kapsamları |
| Klasör `CLAUDE.md`'leri | O klasörün teknik tuzakları; koordinatör işçinin "Ders" satırından yazar |
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
- Koordinatör `../newfork-wt/coord`; işçi worktree'leri `<coord>/.claude/worktrees/agent-*`, dal `task/<id>`; tren klasörü `../newfork-wt/train`. Geçici kanıt `artifacts/<iş>/` (gitignore'da).
- Portlar: 5555/5556 Mert · 5565/5566 yerel e2e (db kilidi sahibi) · 5590/5591, 5600/5601, 5610/5611 CI runner'ları · 5642/5643 koordinatör · işçiler 5612/5613, 5620/5621, 5622/5623.
- Web: `pnpm.cmd --filter @newfork/web exec vite --host 127.0.0.1 --port <web> --strictPort` (`VITE_API_URL=http://localhost:<api>`). API: `PORT=<api>`, `APP_URL=http://127.0.0.1:<web>` ile `pnpm.cmd --filter @newfork/api dev`.
- Yayınlanan sayfalar (claude.ai Artifact): Mert iki Claude hesabıyla çalışır, bir hesabın sayfasını öbürü görmez. Sayfa dosyası `C:/Users/TheWe/Documents/Codex/newfork-pages/<ad>.html` (çok dosyalıysa `<ad>/`); yayın oradan; klasördeki `README.md` satırı (dosya, iki hesabın linki) güncellenir. Çok dosyalı sayfanın ek dosyaları yayından önce oturumun geçici klasörüne kopyalanır. Sayfa dosyası yalnız geçici klasörde kalırsa öbür hesaba kaybolur; yayın aracı ek dosyayı başka yerden almaz.
### Veritabanı, canlı, CI
- Yerel DB, migration denemesi, şema dosyası: `supabase/CLAUDE.md`. Main'e giren her şey Vercel'den yayına çıkar.
- CI (`.github/workflows/ci.yml`) yalnız `train/**` push'unda, PR'da ve elle koşar: check, db, e2e, db-budget; Mert'in bilgisayarındaki tek runner. Kırmızı ayırma ve runner kuralları `e2e/CLAUDE.md`.
- Ubuntu tek başına `wsl --terminate` / `--shutdown` ile yeniden başlatılmaz; Docker Desktop yeniden başlatılır.
### Tuzaklar
- Yeni worktree'de `pnpm.cmd install` olmadan vitest `@vitejs/plugin-react`'i bulamaz (`wt-hazirla.mjs` kurar).
- Dev sunucusunu port PID'iyle durdurmak `tsx watch`'ı canlı bırakır; süreç ağacı durdurulur, sahiplik başlatma zamanıyla kanıtlanır.
- Uzun yol yüzünden `git worktree remove` yarım kalırsa PowerShell `Remove-Item -LiteralPath '\\?\C:\...' -Recurse -Force`, sonra `git worktree prune`; önce `git status --porcelain --ignored`.
- Birleşmesi doğrulanmamış dal silinmez; rebase'li dal `git cherry -v origin/main <dal>` ile ölçülür.
